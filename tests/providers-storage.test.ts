/** Isolated synthetic S3 transport tests: no bucket or provider account is contacted. */
import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import pg from "pg";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { R2Provider } from "../integrations/providers/r2.js";
import { installStorageRoutes } from "../apps/api/src/storage-routes.js";
const database = process.env.TEST_DATABASE_URL;
if (
  database &&
  !/^[a-zA-Z0-9_-]+_test$/.test(new URL(database).pathname.slice(1))
)
  throw new Error(
    "TEST_DATABASE_URL must use a dedicated database ending in _test.",
  );
test(
  "storage gateway enforces byte/hash limits, quota concurrency, publisher and private downloads",
  { skip: !database },
  async (t) => {
    const admin = new pg.Pool({ connectionString: database }),
      schema = `storage_test_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({
      connectionString: database,
      options: `-c search_path=${schema}`,
    });
    const app = Fastify({ logger: false });
    app.setErrorHandler((error, _req, reply) =>
      reply
        .code((error as { status?: number }).status ?? 500)
        .send({ error: "Rejected" }),
    );
    t.after(async () => {
      await app.close();
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    for (const name of [
      "001_core.sql",
      "002_providers.sql",
      "004_storage.sql",
      "006_print_uploads.sql",
      "007_paid_gifts.sql",
    ])
      await pool.query(
        await readFile(
          new URL(`../infra/migrations/${name}`, import.meta.url),
          "utf8",
        ),
      );
    const objects = new Map<string, Buffer>();
    let puts = 0;
    const storage = new R2Provider({
      accountId: "f".repeat(32),
      accessKeyId: "synthetic-fixture",
      secretAccessKey: "synthetic-fixture",
      buckets: {
        public: "public",
        user: "user",
        library: "library",
        publishing: "publishing",
        backups: "backups",
      },
    });
    const etag = (data: Buffer) =>
      createHash("sha256").update(data).digest("hex");
    storage.client.send = (async (command: {
      constructor: { name: string };
      input: Record<string, unknown>;
    }) => {
      const input = command.input,
        key = `${input.Bucket}/${input.Key}`;
      if (command.constructor.name === "PutObjectCommand") {
        const chunks: Buffer[] = [];
        for await (const chunk of input.Body as AsyncIterable<Buffer>)
          chunks.push(chunk);
        objects.set(key, Buffer.concat(chunks));
        puts++;
        return {};
      }
      if (command.constructor.name === "GetObjectCommand") {
        const data = objects.get(key);
        if (!data) throw new Error("Object absent");
        if (input.IfMatch && input.IfMatch !== etag(data))
          throw new Error("ETag changed");
        return {
          Body: Readable.from([data]),
          ETag: etag(data),
          ContentLength: data.length,
        };
      }
      if (command.constructor.name === "CopyObjectCommand") {
        const source = objects.get(String(input.CopySource));
        if (!source || input.CopySourceIfMatch !== etag(source))
          throw new Error("Conditional copy refused");
        objects.set(key, source);
        return {};
      }
      if (command.constructor.name === "DeleteObjectCommand") {
        objects.delete(key);
        return {};
      }
      throw new Error("Unexpected S3 fixture command");
    }) as unknown as typeof storage.client.send;
    app.decorateRequest("userId", "");
    app.addHook("preHandler", async (req) => {
      req.userId = String(req.headers["x-test-user"] ?? "");
    });
    await installStorageRoutes(app, pool, {
      storage,
      scanner: {
        async scan(input) {
          for await (const chunk of input.stream) assert.ok(chunk.byteLength);
          return { clean: true };
        },
      },
    });
    await app.ready();
    const owner = "storage_owner",
      other = "storage_other",
      publisher = randomUUID(),
      product = randomUUID();
    await pool.query("INSERT INTO users(id) VALUES($1),($2)", [owner, other]);
    await pool.query(
      "INSERT INTO publishers(id,owner_id,name) VALUES($1,$2,$3)",
      [publisher, owner, "Synthetic publisher"],
    );
    await pool.query(
      "INSERT INTO products(id,publisher_id,title) VALUES($1,$2,$3)",
      [product, publisher, "Synthetic PDF"],
    );
    const data = Buffer.from("%PDF-1.7\nsynthetic fixture");
    const body = {
      category: "publishing",
      publisherId: publisher,
      productId: product,
      versionLabel: "1",
      bytes: data.length,
      sha256: etag(data),
      mime: "application/pdf",
    };
    const intentRequest = (user = owner) =>
      app.inject({
        method: "POST",
        url: "/api/uploads/intents",
        headers: { "x-test-user": user },
        payload: body,
      });
    assert.equal((await intentRequest(other)).statusCode, 403);
    await pool.query(
      "INSERT INTO storage_quotas(tenant_id,limit_bytes) VALUES($1,$2)",
      [publisher, data.length],
    );
    const concurrent = await Promise.all([intentRequest(), intentRequest()]);
    assert.deepEqual(concurrent.map((r) => r.statusCode).sort(), [200, 409]);
    const intent = concurrent.find((r) => r.statusCode === 200)!.json();
    assert.equal(intent.uploadStrategy, "authenticated-gateway");
    const upload = (payload: Buffer, user = owner) =>
      app.inject({
        method: "PUT",
        url: intent.uploadUrl,
        headers: {
          "x-test-user": user,
          "Content-Type": "application/pdf",
          "Content-Length": String(data.length),
        },
        payload,
      });
    assert.equal((await upload(data, other)).statusCode, 409);
    assert.equal((await upload(Buffer.alloc(data.length, 1))).statusCode, 422);
    assert.equal(
      (await upload(Buffer.concat([data, Buffer.from("excess")]))).statusCode,
      413,
    );
    assert.equal(puts, 0);
    assert.equal((await upload(data)).statusCode, 200);
    assert.equal(puts, 1);
    const complete = await app.inject({
      method: "POST",
      url: `/api/uploads/${intent.id}/complete`,
      headers: { "x-test-user": owner },
    });
    assert.equal(complete.statusCode, 200);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM product_versions WHERE product_id=$1 AND validated_at IS NOT NULL",
          [product],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await app.inject({
          method: "GET",
          url: `/api/library/${product}/download`,
          headers: { "x-test-user": other },
        })
      ).statusCode,
      403,
    );
    await pool.query(
      "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), owner, product, "test", randomUUID()],
    );
    const download = await app.inject({
      method: "GET",
      url: `/api/library/${product}/download`,
      headers: { "x-test-user": owner },
    });
    assert.equal(download.statusCode, 200);
    assert.deepEqual(download.rawPayload, data);
    assert.equal(download.headers["cache-control"], "private, no-store");
  },
);
