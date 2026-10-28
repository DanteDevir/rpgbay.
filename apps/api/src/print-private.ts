import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  DomainError,
  requireVersion,
} from "../../../packages/domain/src/index.js";
import { audit, found, transaction } from "./db.js";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const addressSchema = z.object({
  recipient: z.string().trim().min(2).max(120),
  postalCode: z.string().regex(/^\d{8}$/),
  street: z.string().trim().min(2).max(200),
  number: z.string().trim().min(1).max(30),
  complement: z.string().max(100).default(""),
  district: z.string().trim().min(1).max(100),
  city: z.string().trim().min(2).max(100),
  state: z
    .string()
    .regex(
      /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/,
    ),
  country: z.literal("BR").default("BR"),
});
interface Sealed {
  iv: string;
  tag: string;
  data: string;
}
function addressKey() {
  const value = process.env.PRINT_ADDRESS_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/.test(value))
    throw new DomainError(
      "ADDRESS_KEY_NOT_CONFIGURED",
      "Configure a chave de proteção de endereços no servidor.",
      503,
    );
  const key = Buffer.from(value, "hex");
  return { key, id: hash(value).slice(0, 16) };
}
function seal(value: unknown, jobId: string) {
  const { key, id } = addressKey(),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(jobId));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    id,
    sealed: {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    },
  };
}
function unseal(sealed: Sealed, id: string, jobId: string) {
  const current = addressKey();
  if (current.id !== id)
    throw new DomainError(
      "ADDRESS_KEY_UNAVAILABLE",
      "A chave histórica deste endereço precisa ser restaurada.",
      503,
    );
  const cipher = createDecipheriv(
    "aes-256-gcm",
    current.key,
    Buffer.from(sealed.iv, "base64"),
  );
  cipher.setAAD(Buffer.from(jobId));
  cipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return addressSchema.parse(
    JSON.parse(
      Buffer.concat([
        cipher.update(Buffer.from(sealed.data, "base64")),
        cipher.final(),
      ]).toString("utf8"),
    ),
  );
}
async function shippingAccess(
  db: Pick<PoolClient, "query">,
  publisherId: string,
  userId: string,
) {
  const row = (
    await db.query(
      "SELECT 1 FROM publishers p WHERE p.id=$1 AND (p.owner_id=$2 OR EXISTS(SELECT 1 FROM publisher_members m WHERE m.publisher_id=p.id AND m.user_id=$2 AND m.role IN ('admin','support')))",
      [publisherId, userId],
    )
  ).rows[0];
  if (!row)
    throw new DomainError(
      "FORBIDDEN",
      "Endereço disponível apenas à equipe de expedição autorizada.",
      403,
    );
}
export function installPrintPrivateRoutes(app: FastifyInstance, pool: Pool) {
  app.post("/api/print/:id/address-link", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    addressKey();
    return transaction(pool, async (db) => {
      const job = found(
        (
          await db.query(
            "SELECT * FROM print_jobs WHERE id=$1 AND user_id=$2 FOR UPDATE",
            [id, req.userId],
          )
        ).rows[0],
      );
      if (["shipped", "delivered", "cancelled"].includes(job.status))
        throw new DomainError(
          "ADDRESS_LOCKED",
          "Este pedido já não aceita alteração de endereço.",
          409,
        );
      await db.query(
        "UPDATE print_address_links SET revoked_at=now() WHERE print_job_id=$1 AND revoked_at IS NULL",
        [id],
      );
      const secret = randomBytes(32).toString("base64url");
      await db.query(
        "INSERT INTO print_address_links(id,print_job_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
        [randomUUID(), id, hash(secret)],
      );
      await audit(
        db,
        req.userId,
        "print.address_link_created",
        "print_job",
        id,
      );
      return {
        token: secret,
        expiresInSeconds: 604800,
        addressUrl: `${process.env.WEB_ORIGIN ?? "http://localhost:5173"}/print/address/${secret}`,
      };
    });
  });
  app.get("/api/print/address/:token", async (req) => {
    const secret = z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .parse((req.params as { token: string }).token);
    const row = found(
      (
        await pool.query(
          "SELECT j.id,j.status,p.title,COALESCE(a.version,0) AS version FROM print_address_links l JOIN print_jobs j ON j.id=l.print_job_id JOIN products p ON p.id=j.product_id LEFT JOIN print_addresses a ON a.print_job_id=j.id WHERE l.token_hash=$1 AND l.expires_at>now() AND l.revoked_at IS NULL",
          [hash(secret)],
        )
      ).rows[0],
    );
    return {
      product: row.title,
      status: row.status,
      addressOnFile: row.version > 0,
      version: row.version,
    };
  });
  app.put("/api/print/address/:token", async (req) => {
    const secret = z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .parse((req.params as { token: string }).token),
      body = z
        .object({
          address: addressSchema,
          version: z.number().int().nonnegative(),
        })
        .parse(req.body);
    return transaction(pool, async (db) => {
      const link = found(
        (
          await db.query(
            "SELECT * FROM print_address_links WHERE token_hash=$1 AND expires_at>now() AND revoked_at IS NULL FOR UPDATE",
            [hash(secret)],
          )
        ).rows[0],
      );
      const job = found(
        (
          await db.query("SELECT * FROM print_jobs WHERE id=$1 FOR UPDATE", [
            link.print_job_id,
          ])
        ).rows[0],
      );
      if (["shipped", "delivered", "cancelled"].includes(job.status))
        throw new DomainError(
          "ADDRESS_LOCKED",
          "Este pedido já não aceita alteração de endereço.",
          409,
        );
      const current = (
        await db.query(
          "SELECT version FROM print_addresses WHERE print_job_id=$1 FOR UPDATE",
          [job.id],
        )
      ).rows[0];
      requireVersion(current?.version ?? 0, body.version);
      const encrypted = seal(body.address, job.id);
      await db.query(
        "INSERT INTO print_addresses(print_job_id,encrypted_address,key_id) VALUES($1,$2,$3) ON CONFLICT(print_job_id) DO UPDATE SET encrypted_address=$2,key_id=$3,version=print_addresses.version+1,supplied_at=now()",
        [job.id, encrypted.sealed, encrypted.id],
      );
      await audit(
        db,
        null,
        "print.address_supplied_by_private_link",
        "print_job",
        job.id,
        { via: "recipient-link" },
      );
      return { saved: true, version: body.version + 1 };
    });
  });
  app.get("/api/print/:id/shipping-address", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    return transaction(pool, async (db) => {
      const job = found(
        (
          await db.query("SELECT publisher_id FROM print_jobs WHERE id=$1", [
            id,
          ])
        ).rows[0],
      );
      await shippingAccess(db, job.publisher_id, req.userId);
      const row = found(
        (
          await db.query(
            "SELECT encrypted_address,key_id,version FROM print_addresses WHERE print_job_id=$1",
            [id],
          )
        ).rows[0],
      );
      const address = unseal(row.encrypted_address, row.key_id, id);
      await audit(db, req.userId, "print.address_accessed", "print_job", id);
      return { address, version: row.version };
    });
  });
}
