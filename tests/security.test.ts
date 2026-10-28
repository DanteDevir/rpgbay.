import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import pg from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { installAuth } from "../apps/api/src/auth.js";
import { installStorageRoutes } from "../apps/api/src/storage-routes.js";
import { DomainError } from "../packages/domain/src/index.js";
import { validateConfig } from "../apps/api/src/config.js";
const database = process.env.TEST_DATABASE_URL;
if (
  database &&
  !/^[a-zA-Z0-9_-]+_test$/.test(new URL(database).pathname.slice(1))
)
  throw new Error(
    "Security checks require isolated *_test PostgreSQL database.",
  );

test("production startup rejects missing services and insecure identity configuration", () => {
  assert.throws(() => validateConfig({ NODE_ENV: "production" }), /incompleta/);
  assert.throws(
    () => validateConfig({ NODE_ENV: "production", DEV_AUTH_ENABLED: "true" }),
    /incompleta/,
  );
});

test(
  "real database cookie CSRF, session revocation and concurrent upload quota",
  { skip: !database },
  async (t) => {
    const admin = new pg.Pool({ connectionString: database }),
      schema = `security_test_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({
      connectionString: database,
      options: `-c search_path=${schema}`,
      max: 10,
    });
    const apps: ReturnType<typeof Fastify>[] = [];
    const original = { ...process.env };
    t.after(async () => {
      for (const app of apps) await app.close();
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
      for (const key of Object.keys(process.env))
        if (!(key in original)) delete process.env[key];
      Object.assign(process.env, original);
    });
    const migrationDir = new URL("../infra/migrations/", import.meta.url);
    for (const name of (await readdir(migrationDir))
      .filter((n) => n.endsWith(".sql"))
      .sort())
      await pool.query(await readFile(new URL(name, migrationDir), "utf8"));
    const user = `security_${randomUUID()}`;
    await pool.query("INSERT INTO users(id) VALUES($1)", [user]);
    await t.test(
      "production cookies enforce exact origin and expiration/revocation while ignoring dev identity",
      async () => {
        process.env.NODE_ENV = "production";
        process.env.DEV_AUTH_ENABLED = "true";
        process.env.OIDC_ISSUER = "https://identity.example.invalid";
        process.env.OIDC_AUDIENCE = "synthetic-api";
        process.env.WEB_ORIGIN = "https://rpgbay.example.invalid";
        // Test-only OIDC discovery fixture. Cookie validation still queries actual PostgreSQL.
        const discovery = t.mock.method(
          globalThis,
          "fetch",
          async () =>
            new Response(
              JSON.stringify({
                issuer: process.env.OIDC_ISSUER,
                jwks_uri: "https://identity.example.invalid/jwks",
              }),
              { headers: { "Content-Type": "application/json" } },
            ),
        );
        const app = Fastify({ logger: false });
        apps.push(app);
        app.setErrorHandler((error, _req, reply) => {
          if (error instanceof DomainError)
            return reply.code(error.status).send({ error: error.code });
          return reply.code(500).send({ error: "unexpected" });
        });
        await installAuth(app, pool);
        app.get("/private", async (req) => ({ id: req.userId }));
        app.post("/private", async (req) => ({ id: req.userId }));
        await app.ready();
        discovery.mock.restore();
        const session = randomBytes(32).toString("base64url"),
          digest = createHash("sha256").update(session).digest("hex");
        await pool.query(
          "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [digest, user],
        );
        const cookie = `rpgbay_session=${session}`;
        assert.equal(
          (
            await app.inject({
              url: "/private",
              headers: { "x-dev-user": user },
            })
          ).statusCode,
          401,
        );
        assert.equal(
          (await app.inject({ url: "/private", headers: { cookie } }))
            .statusCode,
          200,
        );
        for (const origin of [
          undefined,
          "https://evil.example.invalid",
          "https://rpgbay.example.invalid.evil.test",
        ])
          assert.equal(
            (
              await app.inject({
                method: "POST",
                url: "/private",
                headers: { cookie, ...(origin ? { origin } : {}) },
              })
            ).statusCode,
            403,
          );
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/private",
              headers: { cookie, origin: process.env.WEB_ORIGIN },
            })
          ).statusCode,
          200,
        );
        await pool.query(
          "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1",
          [digest],
        );
        assert.equal(
          (await app.inject({ url: "/private", headers: { cookie } }))
            .statusCode,
          401,
        );
        await pool.query(
          "UPDATE auth_sessions SET revoked_at=NULL,expires_at=now()-interval '1 second' WHERE token_hash=$1",
          [digest],
        );
        assert.equal(
          (await app.inject({ url: "/private", headers: { cookie } }))
            .statusCode,
          401,
        );
      },
    );
    await t.test(
      "concurrent upload reservations cannot exceed total quota; client byte/MIME declarations remain untrusted",
      async () => {
        process.env.NODE_ENV = "test";
        process.env.R2_ACCOUNT_ID = "a".repeat(32);
        process.env.R2_ACCESS_KEY_ID = "synthetic-test-only";
        process.env.R2_SECRET_ACCESS_KEY = "synthetic-test-only";
        for (const key of [
          "PUBLIC",
          "LIBRARY",
          "USER",
          "PUBLISHING",
          "BACKUPS",
        ])
          process.env[`R2_BUCKET_${key}`] = `synthetic-${key.toLowerCase()}`;
        process.env.SCANNER_URL = "http://scanner.example.invalid";
        process.env.SCANNER_TOKEN = "synthetic-test-only";
        process.env.USER_QUOTA_BYTES = "100";
        const app = Fastify({ logger: false });
        apps.push(app);
        app.decorateRequest("userId", "");
        app.addHook("preHandler", async (req) => {
          req.userId = user;
        });
        await installStorageRoutes(app, pool);
        await app.ready();
        const body = {
          category: "user",
          bytes: 60,
          sha256: "a".repeat(64),
          mime: "image/png",
        };
        // URL generation signs locally with synthetic credentials. No upload or provider call occurs.
        const reservations = await Promise.all(
          Array.from({ length: 4 }, () =>
            app.inject({
              method: "POST",
              url: "/api/uploads/intents",
              payload: body,
            }),
          ),
        );
        assert.deepEqual(
          reservations.map((r) => r.statusCode).sort(),
          [200, 409, 409, 409],
        );
        const used = await pool.query(
          "SELECT sum(reserved_bytes)::int AS bytes FROM upload_intents WHERE owner_id=$1 AND state='reserved'",
          [user],
        );
        assert.equal(used.rows[0].bytes, 60);
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/api/uploads/intents",
              payload: { ...body, bytes: 2_000_001 },
            })
          ).statusCode,
          413,
        );
        assert.equal(
          (
            await app.inject({
              method: "POST",
              url: "/api/uploads/intents",
              payload: { ...body, mime: "application/pdf" },
            })
          ).statusCode,
          400,
        );
      },
    );
  },
);
