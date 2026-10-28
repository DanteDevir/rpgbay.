import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { DomainError } from "../../../packages/domain/src/index.js";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  R2Provider,
  uploadIntent,
  validateBytes,
  type UploadIntent,
  type ContentScanner,
} from "../../../integrations/providers/r2.js";
export async function installStorageRoutes(
  app: FastifyInstance,
  pool: Pool,
  dependencies: { storage?: R2Provider; scanner?: ContentScanner } = {},
) {
  const env = process.env;
  let activeGateways = 0;
  let storage: R2Provider | undefined = dependencies.storage;
  const bucketNames = [
    "PUBLIC",
    "LIBRARY",
    "USER",
    "PUBLISHING",
    "BACKUPS",
  ] as const;
  const configured = !!(
    env.R2_ACCOUNT_ID &&
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    bucketNames.every((name) => env[`R2_BUCKET_${name}`])
  );
  if (configured)
    storage = new R2Provider({
      accountId: env.R2_ACCOUNT_ID!,
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      buckets: {
        public: env.R2_BUCKET_PUBLIC!,
        library: env.R2_BUCKET_LIBRARY!,
        user: env.R2_BUCKET_USER!,
        publishing: env.R2_BUCKET_PUBLISHING!,
        backups: env.R2_BUCKET_BACKUPS!,
      },
      ...(env.R2_EMULATOR_ENDPOINT
        ? { localEndpoint: env.R2_EMULATOR_ENDPOINT }
        : {}),
    });
  const scanner: ContentScanner = dependencies.scanner ?? {
    async scan(input) {
      if (!env.SCANNER_URL || !env.SCANNER_TOKEN)
        throw new Error("Isolated scanner not configured");
      const response = await fetch(new URL("/scan", env.SCANNER_URL), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SCANNER_TOKEN}`,
          "Content-Type": input.mime,
          "Content-Length": String(input.size),
        },
        body: Readable.toWeb(
          Readable.from(input.stream),
        ) as ReadableStream<Uint8Array>,
        duplex: "half",
        signal: AbortSignal.timeout(120000),
        redirect: "error",
      } as RequestInit & { duplex: "half" });
      if (!response.ok) return { clean: false };
      const verdict = (await response.json()) as {
        clean?: boolean;
        mime?: string;
      };
      return { clean: verdict.clean === true && verdict.mime === input.mime };
    },
  };
  app.post("/api/uploads/intents", async (req, reply) => {
    if (!storage)
      return reply
        .code(503)
        .send({
          error: {
            code: "R2_NOT_CONFIGURED",
            message: "Configure buckets R2 e credenciais de servidor.",
          },
        });
    if (!dependencies.scanner && (!env.SCANNER_URL || !env.SCANNER_TOKEN))
      return reply
        .code(503)
        .send({
          error: {
            code: "SCANNER_NOT_CONFIGURED",
            message: "Configure inspeção isolada antes de aceitar arquivos.",
          },
        });
    const body = z
      .object({
        category: z.enum(["user", "publishing", "print_proof"]),
        publisherId: z.string().uuid().optional(),
        printJobId: z.string().uuid().optional(),
        productId: z.string().uuid().optional(),
        versionLabel: z.string().min(1).max(80).optional(),
        changelog: z.string().max(5000).default(""),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        mime: z.enum([
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
        ]),
      })
      .parse(req.body);
    const client = await pool.connect();
    let intent: UploadIntent;
    try {
      await client.query("BEGIN");
      let tenantId = createHash("sha256")
        .update(req.userId)
        .digest("hex")
        .slice(0, 32);
      if (body.category === "publishing" || body.category === "print_proof") {
        if (
          !body.publisherId ||
          body.mime !== "application/pdf" ||
          (body.category === "publishing" &&
            (!body.productId || !body.versionLabel)) ||
          (body.category === "print_proof" && !body.printJobId)
        )
          return await (async () => {
            await client.query("ROLLBACK");
            return reply
              .code(400)
              .send({
                error:
                  "Publishing requires publisher, product, version and PDF",
              });
          })();
        let editorialProductId = body.productId;
        if (body.category === "print_proof") {
          const job = (
            await client.query(
              "SELECT product_id FROM print_jobs WHERE id=$1 AND publisher_id=$2 AND status IN ('awaiting_art','awaiting_proof','awaiting_approval') FOR SHARE",
              [body.printJobId, body.publisherId],
            )
          ).rows[0];
          if (!job) {
            await client.query("ROLLBACK");
            return reply
              .code(409)
              .send({ error: "Print job cannot accept a proof in this state" });
          }
          editorialProductId = job.product_id;
        }
        const access = await client.query(
          "SELECT p.id FROM products p JOIN publishers pub ON pub.id=p.publisher_id WHERE p.id=$1 AND p.publisher_id=$2 AND (pub.owner_id=$3 OR EXISTS(SELECT 1 FROM publisher_members m WHERE m.publisher_id=pub.id AND m.user_id=$3 AND m.role IN ('admin','editor'))) FOR SHARE OF p",
          [editorialProductId, body.publisherId, req.userId],
        );
        if (!access.rowCount) {
          await client.query("ROLLBACK");
          return reply.code(403).send({ error: "Publisher access denied" });
        }
        tenantId = body.publisherId;
      } else if (body.mime === "application/pdf") {
        await client.query("ROLLBACK");
        return reply
          .code(400)
          .send({ error: "Common uploads accept raster images only" });
      }
      const maxBytes =
        body.category === "user"
          ? 2_000_000
          : Number(env.EDITORIAL_FILE_LIMIT_BYTES ?? 536870912);
      if (body.bytes > maxBytes)
        throw new DomainError(
          "FILE_TOO_LARGE",
          "Arquivo excede o limite desta categoria.",
          413,
        );
      const quotaLimit =
        body.category === "user"
          ? Number(env.USER_QUOTA_BYTES ?? 20000000)
          : Number(env.EDITORIAL_QUOTA_BYTES ?? 5368709120);
      if (
        env.NODE_ENV === "production" &&
        !(body.category === "user"
          ? env.USER_QUOTA_BYTES
          : env.EDITORIAL_QUOTA_BYTES)
      )
        throw new Error("Production requires explicit quota policy");
      if (!Number.isSafeInteger(quotaLimit) || quotaLimit < 1)
        throw new Error("Invalid quota policy");
      if (body.bytes > maxBytes) {
        await client.query("ROLLBACK");
        return reply
          .code(413)
          .send({
            error: {
              code: "FILE_TOO_LARGE",
              message: "Arquivo excede o limite da categoria.",
            },
          });
      }
      intent = uploadIntent({
        tenantId,
        storageClass: body.category === "user" ? "user" : "publishing",
        declaredBytes: body.bytes,
        maxBytes,
        expectedSha256: body.sha256,
        mime: body.mime,
      });
      await client.query(
        "INSERT INTO storage_quotas(tenant_id,limit_bytes) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [tenantId, quotaLimit],
      );
      const quota = (
        await client.query(
          "SELECT limit_bytes FROM storage_quotas WHERE tenant_id=$1 FOR UPDATE",
          [tenantId],
        )
      ).rows[0];
      const used = (
        await client.query(
          "SELECT COALESCE(sum(reserved_bytes),0)::text AS bytes FROM upload_intents WHERE tenant_id=$1 AND (state IN ('published','validating') OR (state='reserved' AND expires_at>now()))",
          [tenantId],
        )
      ).rows[0];
      if (BigInt(used.bytes) + BigInt(body.bytes) > BigInt(quota.limit_bytes)) {
        await client.query("ROLLBACK");
        return reply
          .code(409)
          .send({
            error: {
              code: "QUOTA_EXCEEDED",
              message: "A cota não permite este arquivo.",
            },
          });
      }
      await client.query(
        "INSERT INTO upload_intents(id,owner_id,tenant_id,storage_class,intent,reserved_bytes,expires_at,product_id,version_label,changelog,print_job_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          intent.id,
          req.userId,
          tenantId,
          intent.storageClass,
          intent,
          body.bytes,
          new Date(intent.expiresAt),
          body.category === "publishing" ? body.productId : null,
          body.versionLabel ?? null,
          body.changelog,
          body.category === "print_proof" ? body.printJobId : null,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return {
      id: intent.id,
      uploadUrl: `/api/uploads/${intent.id}/content`,
      method: "PUT",
      expiresAt: new Date(intent.expiresAt).toISOString(),
      requiredHeaders: {
        "Content-Type": intent.mime,
        "Content-Length": intent.declaredBytes,
      },
      quarantine: true,
      uploadStrategy: "authenticated-gateway",
    };
  });
  await app.register(async (gateway) => {
    gateway.addContentTypeParser(
      ["application/pdf", "image/png", "image/jpeg", "image/webp"],
      (_request, payload, done) => done(null, payload),
    );
    gateway.put("/api/uploads/:id/content", async (req, reply) => {
      if (!storage) return reply.code(503).send({ error: "R2 not configured" });
      const id = z
        .string()
        .uuid()
        .parse((req.params as { id: string }).id);
      const row = (
        await pool.query(
          "SELECT intent FROM upload_intents WHERE id=$1 AND owner_id=$2 AND state='reserved' AND expires_at>now()",
          [id, req.userId],
        )
      ).rows[0];
      if (!row)
        return reply
          .code(409)
          .send({ error: "Upload intent expired or unavailable" });
      const intent = row.intent as UploadIntent;
      if (
        req.headers["content-type"] !== intent.mime ||
        req.headers["content-length"] !== String(intent.declaredBytes)
      )
        return reply
          .code(400)
          .send({ error: "Upload MIME and length must match reserved intent" });
      if (activeGateways >= 4)
        return reply
          .code(429)
          .send({ error: "Upload processing capacity reached; retry later" });
      activeGateways++;
      let directory: string | undefined;
      try {
        directory = await mkdtemp(join(tmpdir(), "rpgbay-upload-"));
        const path = join(directory, "content");
        let size = 0;
        const file = await open(path, "wx", 0o600);
        try {
          for await (const chunk of req.body as AsyncIterable<Buffer>) {
            size += chunk.length;
            if (size > intent.declaredBytes || size > intent.maxBytes)
              throw new DomainError(
                "FILE_TOO_LARGE",
                "Arquivo excede os bytes reservados.",
                413,
              );
            await file.writeFile(chunk);
          }
        } finally {
          await file.close();
        }
        try {
          await validateBytes(createReadStream(path), intent);
        } catch {
          throw new DomainError(
            "INVALID_FILE",
            "Tamanho, conteúdo ou checksum divergente da intenção.",
            422,
          );
        }
        await storage.putQuarantine(intent, createReadStream(path));
        return { id, state: "quarantine", bytes: size };
      } finally {
        activeGateways--;
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    });
  });
  app.post("/api/uploads/:id/complete", async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: "R2 not configured" });
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const row = (
      await pool.query(
        "UPDATE upload_intents SET state='validating' WHERE id=$1 AND owner_id=$2 AND state='reserved' AND expires_at>now() RETURNING *",
        [id, req.userId],
      )
    ).rows[0];
    if (!row)
      return reply
        .code(409)
        .send({ error: "Upload intent absent, expired or already consumed" });
    try {
      const object = await storage.validateAndPublish(
        row.intent as UploadIntent,
        scanner,
      );
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        await db.query(
          "UPDATE upload_intents SET state='published',published_key=$2,reserved_bytes=$3 WHERE id=$1",
          [id, object.key, object.size],
        );
        if (row.product_id || row.print_job_id) {
          const access = await db.query(
            "SELECT p.id FROM products p JOIN publishers pub ON pub.id=p.publisher_id WHERE p.id=$1 AND p.publisher_id=$2 AND (pub.owner_id=$3 OR EXISTS(SELECT 1 FROM publisher_members m WHERE m.publisher_id=pub.id AND m.user_id=$3 AND m.role IN ('admin','editor'))) FOR SHARE OF p",
            [
              row.product_id ??
                (
                  await db.query(
                    "SELECT product_id FROM print_jobs WHERE id=$1",
                    [row.print_job_id],
                  )
                ).rows[0]?.product_id,
              row.tenant_id,
              req.userId,
            ],
          );
          if (!access.rowCount)
            throw new Error("Editorial permission changed during validation");
          if (row.product_id)
            await db.query(
              "INSERT INTO product_versions(id,product_id,label,changelog,object_key,sha256,size_bytes,validated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now())",
              [
                randomUUID(),
                row.product_id,
                row.version_label,
                row.changelog,
                object.key,
                object.sha256,
                object.size,
              ],
            );
        }
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      } finally {
        db.release();
      }
      return {
        id,
        state: "published",
        sha256: object.sha256,
        sizeBytes: object.size,
      };
    } catch (error) {
      await pool.query(
        "UPDATE upload_intents SET state='rejected' WHERE id=$1",
        [id],
      );
      throw error;
    }
  });
  app.get("/api/library/:productId/download", async (req, reply) => {
    if (!storage) return reply.code(503).send({ error: "R2 not configured" });
    const productId = z
      .string()
      .uuid()
      .parse((req.params as { productId: string }).productId);
    const authorized = await pool.query(
      "SELECT 1 FROM entitlements e WHERE e.product_id=$1 AND e.revoked_at IS NULL AND (e.user_id=$2 OR (EXISTS(SELECT 1 FROM products p WHERE p.id=e.product_id AND p.family_sharing) AND EXISTS(SELECT 1 FROM family_members a JOIN family_members b ON a.family_id=b.family_id WHERE a.user_id=$2 AND b.user_id=e.user_id))) LIMIT 1",
      [productId, req.userId],
    );
    const requestedVersion = z
      .object({ versionId: z.string().uuid().optional() })
      .parse(req.query).versionId;
    let pinnedVersion: string | undefined;
    if (!authorized.rowCount) {
      const beta = (
        await pool.query(
          "SELECT part.pinned_version_id FROM beta_participants part JOIN beta_programs b ON b.id=part.beta_id WHERE part.user_id=$1 AND b.product_id=$2 AND part.state='approved' AND (b.state='open' OR b.end_policy='retained') LIMIT 1",
          [req.userId, productId],
        )
      ).rows[0];
      if (!beta)
        return reply.code(403).send({ error: "Library access denied" });
      pinnedVersion = beta.pinned_version_id;
      if (requestedVersion && requestedVersion !== pinnedVersion)
        return reply
          .code(403)
          .send({ error: "Beta license only authorizes the pinned version" });
    }
    const version = (
      await pool.query(
        "SELECT object_key,sha256,size_bytes FROM product_versions WHERE product_id=$1 AND validated_at IS NOT NULL AND ($2::uuid IS NULL OR id=$2) ORDER BY created_at DESC LIMIT 1",
        [productId, requestedVersion ?? pinnedVersion ?? null],
      )
    ).rows[0];
    if (!version)
      return reply.code(404).send({ error: "Validated version unavailable" });
    // Library source files live in the private publishing bucket, never in public assets.
    const object = await storage.download(
      "publishing",
      version.object_key,
      req.headers.range,
    );
    reply
      .header("Cache-Control", "private, no-store")
      .header("Content-Type", "application/pdf")
      .header("Accept-Ranges", "bytes")
      .header("X-Content-SHA256", version.sha256);
    if (object.ContentRange)
      reply.code(206).header("Content-Range", object.ContentRange);
    if (object.ContentLength !== undefined)
      reply.header("Content-Length", object.ContentLength);
    return reply.send(object.Body);
  });
}
