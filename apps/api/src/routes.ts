import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import {
  DomainError,
  calculateFormula,
  rollDice,
  requireVersion,
  assertPrintTransition,
} from "../../../packages/domain/src/index.js";
import { transaction, found, audit } from "./db.js";
const uuid = z.string().uuid();
const text = (max = 500) => z.string().trim().min(1).max(max);
const idOf = (req: FastifyRequest, key = "id") =>
  uuid.parse((req.params as Record<string, unknown>)[key]);
const hash = (secret: string) =>
  createHash("sha256").update(secret).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const pageOf = (req: FastifyRequest) =>
  z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(40),
      offset: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .parse(req.query);
const sheetFields = z.record(
  z.string().max(80),
  z.union([
    z.string().max(10000),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().max(500)).max(200),
  ]),
);
async function tableAccess(
  db: Pick<PoolClient, "query">,
  tableId: string,
  userId: string,
  gmOnly = false,
) {
  const row = found(
    (
      await db.query(
        "SELECT t.*,m.role AS member_role FROM tables t LEFT JOIN table_members m ON m.table_id=t.id AND m.user_id=$2 WHERE t.id=$1 AND (t.owner_id=$2 OR m.user_id=$2)",
        [tableId, userId],
      )
    ).rows[0],
  );
  const gm = row.owner_id === userId || row.member_role === "co_gm";
  if (gmOnly && !gm)
    throw new DomainError(
      "FORBIDDEN",
      "Somente o mestre pode realizar esta operação.",
      403,
    );
  return { ...row, gm };
}
async function publisherAccess(
  db: Pick<PoolClient, "query">,
  publisherId: string,
  userId: string,
  finance = false,
) {
  const row = found(
    (
      await db.query(
        "SELECT p.*,m.role AS member_role FROM publishers p LEFT JOIN publisher_members m ON m.publisher_id=p.id AND m.user_id=$2 WHERE p.id=$1 AND (p.owner_id=$2 OR m.user_id=$2)",
        [publisherId, userId],
      )
    ).rows[0],
  );
  if (
    row.owner_id !== userId &&
    !["admin", ...(finance ? ["finance"] : ["editor"])].includes(
      row.member_role,
    )
  )
    throw new DomainError(
      "FORBIDDEN",
      "Permissão editorial insuficiente.",
      403,
    );
  return row;
}
async function worldAccess(
  db: Pick<PoolClient, "query">,
  worldId: string,
  userId: string,
  write = false,
) {
  const row = found(
    (
      await db.query(
        "SELECT w.*,m.role AS member_role FROM worlds w LEFT JOIN world_members m ON m.world_id=w.id AND m.user_id=$2 WHERE w.id=$1 AND (w.owner_id=$2 OR m.user_id=$2 OR w.visibility='public')",
        [worldId, userId],
      )
    ).rows[0],
  );
  const editor = row.owner_id === userId || row.member_role === "editor";
  if (write && !editor)
    throw new DomainError("FORBIDDEN", "Mundo sem permissão de edição.", 403);
  return { ...row, editor };
}
async function canRead(
  db: Pick<PoolClient, "query">,
  productId: string,
  userId: string,
) {
  const row = (
    await db.query(
      `SELECT 1 FROM entitlements e JOIN products p ON p.id=e.product_id WHERE e.product_id=$1 AND e.revoked_at IS NULL AND (e.user_id=$2 OR (p.family_sharing AND e.user_id IN (SELECT theirs.user_id FROM family_members mine JOIN family_members theirs ON theirs.family_id=mine.family_id WHERE mine.user_id=$2))) LIMIT 1`,
      [productId, userId],
    )
  ).rows[0];
  if (!row) {
    const beta = (
      await db.query(
        "SELECT 1 FROM beta_participants part JOIN beta_programs b ON b.id=part.beta_id WHERE b.product_id=$1 AND part.user_id=$2 AND part.state='approved' AND (b.state='open' OR b.end_policy='retained') LIMIT 1",
        [productId, userId],
      )
    ).rows[0];
    if (!beta)
      throw new DomainError(
        "FORBIDDEN",
        "Este título não está disponível na sua biblioteca.",
        403,
      );
  }
}
const productSelect = `SELECT p.id,p.title,p.subtitle,p.description,p.system,p.format,p.price_cents AS "priceCents",p.cover,p.color,p.publisher_id AS "publisherId",COALESCE(pub.name,'Independente') AS publisher,p.status,p.family_sharing AS "familySharing" FROM products p LEFT JOIN publishers pub ON pub.id=p.publisher_id`;
export function installRoutes(app: FastifyInstance, pool: Pool) {
  app.get("/api/development/books/:id/content", async (req, reply) => {
    if (
      process.env.NODE_ENV !== "development" ||
      process.env.DEV_AUTH_ENABLED !== "true"
    )
      throw new DomainError("NOT_FOUND", "Recurso não encontrado.", 404);
    const id = idOf(req);
    if (!/^20000000-0000-4000-8000-00000000000[1-6]$/.test(id))
      throw new DomainError("NOT_FOUND", "Fixture inexistente.", 404);
    await canRead(pool, id, req.userId);
    const source = new URL(
      "../../../tests/fixtures/development-book.pdf",
      import.meta.url,
    );
    let size: number;
    try {
      size = (await stat(source)).size;
    } catch {
      throw new DomainError(
        "DEMO_FIXTURE_MISSING",
        "PDF autoral de demonstração indisponível.",
        503,
      );
    }
    return reply
      .header("Content-Type", "application/pdf")
      .header("Content-Length", size)
      .header("Content-Disposition", 'inline; filename="RPG-BAY-DEMO.pdf"')
      .header("Cache-Control", "private, no-store")
      .header("X-RPG-BAY-Development-Fixture", "true")
      .send(createReadStream(source));
  });
  app.get("/api/health", async (_r, reply) => {
    try {
      await pool.query("SELECT 1");
      return {
        status: "ok",
        database: "ready",
        mode: process.env.NODE_ENV ?? "production",
      };
    } catch {
      return reply
        .code(503)
        .send({ status: "unavailable", database: "unavailable" });
    }
  });
  app.get("/api/catalog", async (req) => {
    const q = z
      .object({
        q: z.string().max(100).optional(),
        system: z.string().max(100).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(40),
        offset: z.coerce.number().int().min(0).default(0),
      })
      .parse(req.query);
    return {
      items: (
        await pool.query(
          `${productSelect} WHERE p.status='published' AND ($1::text IS NULL OR p.title ILIKE '%'||$1||'%' OR p.description ILIKE '%'||$1||'%') AND ($2::text IS NULL OR p.system=$2) ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
          [q.q ?? null, q.system ?? null, q.limit, q.offset],
        )
      ).rows,
    };
  });
  app.get("/api/catalog/:id", async (req) => {
    const id = idOf(req);
    const product = found(
      (
        await pool.query(
          `${productSelect} WHERE p.id=$1 AND p.status='published'`,
          [id],
        )
      ).rows[0],
    );
    return {
      ...product,
      versions: (
        await pool.query(
          'SELECT id,label,changelog,size_bytes AS "sizeBytes",created_at AS "createdAt" FROM product_versions WHERE product_id=$1 AND validated_at IS NOT NULL ORDER BY created_at DESC',
          [id],
        )
      ).rows,
    };
  });
  app.get("/api/me", async (req) => {
    const profile = found(
      (
        await pool.query(
          'SELECT id,display_name AS "displayName",bio,timezone,favorite_systems AS "favoriteSystems",role FROM users WHERE id=$1',
          [req.userId],
        )
      ).rows[0],
    );
    return {
      ...profile,
      points:
        (
          await pool.query(
            "SELECT balance FROM point_accounts WHERE user_id=$1",
            [req.userId],
          )
        ).rows[0]?.balance ?? 0,
      subscription:
        (
          await pool.query(
            'SELECT status,ends_at AS "endsAt" FROM subscriptions WHERE user_id=$1',
            [req.userId],
          )
        ).rows[0] ?? null,
      achievements: (
        await pool.query(
          'SELECT code,created_at AS "createdAt" FROM achievements WHERE user_id=$1',
          [req.userId],
        )
      ).rows,
    };
  });
  app.patch("/api/me", async (req) => {
    const b = z
      .object({
        displayName: text(80),
        bio: z.string().max(1000).default(""),
        timezone: text(100).default("America/Sao_Paulo"),
        favoriteSystems: z.array(text(80)).max(3).default([]),
      })
      .parse(req.body);
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: b.timezone });
    } catch {
      throw new DomainError("TIMEZONE", "Fuso horário inválido.");
    }
    return (
      await pool.query(
        'UPDATE users SET display_name=$2,bio=$3,timezone=$4,favorite_systems=$5 WHERE id=$1 RETURNING id,display_name AS "displayName",bio,timezone,favorite_systems AS "favoriteSystems"',
        [
          req.userId,
          b.displayName,
          b.bio,
          b.timezone,
          JSON.stringify(b.favoriteSystems),
        ],
      )
    ).rows[0];
  });
  app.get("/api/library", async (req) => {
    const owned = (
      await pool.query(
        `${productSelect.replace("SELECT p.id", "SELECT entitlement.source, (entitlement.user_id=$1) AS owned, p.id")}, LATERAL (SELECT e.source,e.user_id FROM entitlements e WHERE e.product_id=p.id AND e.revoked_at IS NULL AND (e.user_id=$1 OR (p.family_sharing AND e.user_id IN(SELECT theirs.user_id FROM family_members mine JOIN family_members theirs ON mine.family_id=theirs.family_id WHERE mine.user_id=$1))) ORDER BY (e.user_id=$1) DESC LIMIT 1) entitlement ORDER BY p.title`,
        [req.userId],
      )
    ).rows.map((row) => ({
      ...row,
      access: row.owned ? row.source : "family",
    }));
    const betas = (
      await pool.query(
        `${productSelect} JOIN beta_programs b ON b.product_id=p.id JOIN beta_participants part ON part.beta_id=b.id WHERE part.user_id=$1 AND part.state='approved' AND (b.state='open' OR b.end_policy='retained')`,
        [req.userId],
      )
    ).rows.map((row) => ({ ...row, access: "beta" }));
    return {
      items: [
        ...new Map([...betas, ...owned].map((row) => [row.id, row])).values(),
      ],
    };
  });
  app.post("/api/library/claim/:id", async (req) => {
    const id = idOf(req);
    return transaction(pool, async (db) => {
      const product = found(
        (
          await db.query(
            "SELECT * FROM products WHERE id=$1 AND status='published'",
            [id],
          )
        ).rows[0],
      );
      if (product.price_cents !== 0)
        throw new DomainError(
          "PAYMENT_REQUIRED",
          "Este título exige uma compra confirmada.",
          402,
        );
      await db.query(
        "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [randomUUID(), req.userId, id, "free", `free:${req.userId}:${id}`],
      );
      return { claimed: true };
    });
  });
  app.get("/api/library/:id/reading", async (req) => {
    const id = idOf(req);
    await canRead(pool, id, req.userId);
    return (
      (
        await pool.query(
          "SELECT page,annotations,version FROM reading_state WHERE user_id=$1 AND product_id=$2",
          [req.userId, id],
        )
      ).rows[0] ?? { page: 1, annotations: [], version: 0 }
    );
  });
  app.put("/api/library/:id/reading", async (req) => {
    const id = idOf(req);
    const b = z
      .object({
        page: z.number().int().positive().max(100000),
        annotations: z
          .array(
            z.object({
              id: uuid,
              page: z.number().int().positive(),
              text: z.string().max(10000),
            }),
          )
          .max(1000),
        version: z.number().int().nonnegative(),
      })
      .parse(req.body);
    return transaction(pool, async (db) => {
      await canRead(db, id, req.userId);
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      const current = (
        await db.query(
          "SELECT * FROM reading_state WHERE user_id=$1 AND product_id=$2 FOR UPDATE",
          [req.userId, id],
        )
      ).rows[0];
      requireVersion(current?.version ?? 0, b.version);
      if (current)
        await db.query(
          "INSERT INTO revisions(id,entity_type,entity_id,version,snapshot,author_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [
            randomUUID(),
            `reading:${req.userId}`,
            id,
            current.version,
            JSON.stringify(current),
            req.userId,
          ],
        );
      return (
        await db.query(
          "INSERT INTO reading_state(user_id,product_id,page,annotations,version) VALUES($1,$2,$3,$4,1) ON CONFLICT(user_id,product_id) DO UPDATE SET page=$3,annotations=$4,version=reading_state.version+1,updated_at=now() RETURNING page,annotations,version",
          [req.userId, id, b.page, JSON.stringify(b.annotations)],
        )
      ).rows[0];
    });
  });
  app.get("/api/family", async (req) => {
    const family = (
      await pool.query(
        "SELECT f.* FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1",
        [req.userId],
      )
    ).rows[0];
    if (!family) return { family: null, members: [], limit: 5 };
    return {
      ...family,
      family,
      members: (
        await pool.query(
          'SELECT u.id,u.display_name AS "displayName",m.joined_at AS "joinedAt" FROM family_members m JOIN users u ON u.id=m.user_id WHERE m.family_id=$1 ORDER BY m.joined_at',
          [family.id],
        )
      ).rows,
      limit: 5,
    };
  });
  app.post("/api/family", async (req) => {
    const b = z.object({ name: text(80) }).parse(req.body);
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      if (
        (
          await db.query("SELECT 1 FROM family_members WHERE user_id=$1", [
            req.userId,
          ])
        ).rowCount
      )
        throw new DomainError(
          "FAMILY_EXISTS",
          "Você já pertence a uma família.",
          409,
        );
      const id = randomUUID();
      await db.query(
        "INSERT INTO families(id,owner_id,name) VALUES($1,$2,$3)",
        [id, req.userId, b.name],
      );
      await db.query(
        "INSERT INTO family_members(family_id,user_id) VALUES($1,$2)",
        [id, req.userId],
      );
      return { id, name: b.name };
    });
  });
  app.post("/api/family/invites", async (req) => {
    const secret = token();
    const family = found(
      (
        await pool.query("SELECT * FROM families WHERE owner_id=$1", [
          req.userId,
        ])
      ).rows[0],
    );
    const id = randomUUID();
    await pool.query(
      "INSERT INTO family_invites(id,family_id,secret_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
      [id, family.id, hash(secret)],
    );
    return { id, token: secret, expiresInSeconds: 604800 };
  });
  app.post("/api/family/accept", async (req) => {
    const b = z.object({ token: text(200) }).parse(req.body);
    return transaction(pool, async (db) => {
      const invite = found(
        (
          await db.query("SELECT * FROM family_invites WHERE secret_hash=$1", [
            hash(b.token),
          ])
        ).rows[0],
      );
      await db.query("SELECT id FROM families WHERE id=$1 FOR UPDATE", [
        invite.family_id,
      ]);
      const locked = found(
        (
          await db.query(
            "SELECT * FROM family_invites WHERE id=$1 FOR UPDATE",
            [invite.id],
          )
        ).rows[0],
      );
      if (
        locked.accepted_by ||
        new Date(locked.expires_at).getTime() <= Date.now()
      )
        throw new DomainError(
          "INVITE_EXPIRED",
          "Convite expirado ou utilizado.",
          409,
        );
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      if (
        (
          await db.query("SELECT 1 FROM family_members WHERE user_id=$1", [
            req.userId,
          ])
        ).rowCount
      )
        throw new DomainError(
          "FAMILY_EXISTS",
          "Você já pertence a uma família.",
          409,
        );
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) FROM family_members WHERE family_id=$1",
              [invite.family_id],
            )
          ).rows[0].count,
        ) >= 5
      )
        throw new DomainError(
          "FAMILY_FULL",
          "A família tem limite de cinco integrantes.",
          409,
        );
      await db.query(
        "INSERT INTO family_members(family_id,user_id) VALUES($1,$2)",
        [invite.family_id, req.userId],
      );
      await db.query(
        "UPDATE family_invites SET accepted_by=$2,accepted_at=now() WHERE id=$1",
        [invite.id, req.userId],
      );
      return { joined: true, familyId: invite.family_id };
    });
  });
  app.delete("/api/family/members/:userId", async (req) => {
    const target = text(200).parse(
      (req.params as Record<string, unknown>).userId,
    );
    return transaction(pool, async (db) => {
      const family = found(
        (
          await db.query(
            "SELECT f.* FROM families f JOIN family_members m ON m.family_id=f.id WHERE m.user_id=$1 FOR UPDATE OF f",
            [req.userId],
          )
        ).rows[0],
      );
      if (family.owner_id !== req.userId && target !== req.userId)
        throw new DomainError(
          "FORBIDDEN",
          "Sem permissão para remover integrante.",
          403,
        );
      if (target === family.owner_id)
        throw new DomainError(
          "OWNER_LEAVE",
          "O criador deve excluir a família.",
          409,
        );
      await db.query(
        "DELETE FROM family_members WHERE family_id=$1 AND user_id=$2",
        [family.id, target],
      );
      await audit(db, req.userId, "family.member_removed", "family", family.id);
      return { removed: true };
    });
  });
  app.delete("/api/family", async (req) => {
    return transaction(pool, async (db) => {
      const family = found(
        (
          await db.query(
            "SELECT id FROM families WHERE owner_id=$1 FOR UPDATE",
            [req.userId],
          )
        ).rows[0],
      );
      await db.query("DELETE FROM families WHERE id=$1", [family.id]);
      await audit(db, req.userId, "family.deleted", "family", family.id);
      return { deleted: true };
    });
  });
  app.get("/api/tables", async (req) => {
    const p = pageOf(req);
    return {
      items: (
        await pool.query(
          'SELECT t.id,t.title,t.system,t.description,t.status,t.next_session AS "nextSession",t.owner_id AS "ownerId",(t.owner_id=$1) AS "isOwner",(SELECT count(*)::int+1 FROM table_members m WHERE m.table_id=t.id) AS participants FROM tables t WHERE t.owner_id=$1 OR EXISTS(SELECT 1 FROM table_members m WHERE m.table_id=t.id AND m.user_id=$1) ORDER BY t.created_at DESC LIMIT $2 OFFSET $3',
          [req.userId, p.limit, p.offset],
        )
      ).rows,
      limit: 15,
    };
  });
  app.post("/api/tables", async (req) => {
    const b = z
      .object({
        title: text(120),
        system: text(80).default("Livre"),
        description: z.string().max(3000).default(""),
      })
      .parse(req.body);
    return transaction(pool, async (db) => {
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      if (
        Number(
          (
            await db.query(
              "SELECT count(*) FROM tables WHERE owner_id=$1 AND status='active'",
              [req.userId],
            )
          ).rows[0].count,
        ) >= 15
      )
        throw new DomainError(
          "TABLE_LIMIT",
          "Limite de quinze mesas ativas criadas por conta.",
          409,
        );
      const id = randomUUID();
      const row = (
        await db.query(
          "INSERT INTO tables(id,owner_id,title,system,description) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [id, req.userId, b.title, b.system, b.description],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO achievements(user_id,code,source_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [req.userId, "first_table", id],
      );
      return row;
    });
  });
  app.get("/api/tables/:id", async (req) => {
    const id = idOf(req),
      access = await tableAccess(pool, id, req.userId);
    const { secret_notes, ...safe } = access;
    return {
      ...safe,
      ...(access.gm ? { secretNotes: secret_notes } : {}),
      members: (
        await pool.query(
          'SELECT u.id,u.display_name AS "displayName",m.role FROM table_members m JOIN users u ON u.id=m.user_id WHERE m.table_id=$1',
          [id],
        )
      ).rows,
    };
  });
  app.patch("/api/tables/:id", async (req) => {
    const id = idOf(req);
    const b = z
      .object({
        title: text(120).optional(),
        description: z.string().max(3000).optional(),
        secretNotes: z.string().max(20000).optional(),
        status: z.enum(["active", "archived"]).optional(),
        nextSession: z.string().datetime().nullable().optional(),
      })
      .parse(req.body);
    return transaction(pool, async (db) => {
      const table = await tableAccess(db, id, req.userId, true);
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        table.owner_id,
      ]);
      if (
        b.status === "active" &&
        table.status !== "active" &&
        Number(
          (
            await db.query(
              "SELECT count(*) FROM tables WHERE owner_id=$1 AND status='active'",
              [table.owner_id],
            )
          ).rows[0].count,
        ) >= 15
      )
        throw new DomainError(
          "TABLE_LIMIT",
          "Limite de mesas ativas atingido.",
          409,
        );
      return (
        await db.query(
          "UPDATE tables SET title=COALESCE($2,title),description=COALESCE($3,description),secret_notes=COALESCE($4,secret_notes),status=COALESCE($5,status),next_session=CASE WHEN $6 THEN $7::timestamptz ELSE next_session END WHERE id=$1 RETURNING id,title,status",
          [
            id,
            b.title ?? null,
            b.description ?? null,
            b.secretNotes ?? null,
            b.status ?? null,
            b.nextSession !== undefined,
            b.nextSession ?? null,
          ],
        )
      ).rows[0];
    });
  });
  app.post("/api/tables/:id/invites", async (req) => {
    const id = idOf(req);
    await tableAccess(pool, id, req.userId, true);
    const b = z
      .object({ role: z.enum(["player", "observer"]).default("player") })
      .parse(req.body ?? {});
    const secret = token();
    await pool.query(
      "INSERT INTO table_invites(id,table_id,secret_hash,role,expires_at) VALUES($1,$2,$3,$4,now()+interval '7 days')",
      [randomUUID(), id, hash(secret), b.role],
    );
    return { token: secret, expiresInSeconds: 604800 };
  });
  app.post("/api/tables/accept", async (req) => {
    const b = z.object({ token: text(200) }).parse(req.body);
    return transaction(pool, async (db) => {
      const invite = found(
        (
          await db.query(
            "SELECT * FROM table_invites WHERE secret_hash=$1 FOR UPDATE",
            [hash(b.token)],
          )
        ).rows[0],
      );
      if (
        invite.accepted_by ||
        new Date(invite.expires_at).getTime() <= Date.now()
      )
        throw new DomainError(
          "INVITE_EXPIRED",
          "Convite expirado ou utilizado.",
          409,
        );
      await db.query(
        "INSERT INTO table_members(table_id,user_id,role) VALUES($1,$2,$3)",
        [invite.table_id, req.userId, invite.role],
      );
      await db.query("UPDATE table_invites SET accepted_by=$2 WHERE id=$1", [
        invite.id,
        req.userId,
      ]);
      return { tableId: invite.table_id };
    });
  });
  app.get("/api/tables/:id/sheets", async (req) => {
    const id = idOf(req),
      access = await tableAccess(pool, id, req.userId);
    return {
      items: (
        await pool.query(
          'SELECT id,table_id AS "tableId",owner_id AS "ownerId",name,fields,layout,version,CASE WHEN owner_id=$2 OR $3 THEN secret_fields ELSE NULL END AS "secretFields" FROM sheets WHERE table_id=$1',
          [id, req.userId, access.gm],
        )
      ).rows,
    };
  });
  app.post("/api/tables/:id/sheets", async (req) => {
    const id = idOf(req);
    const access = await tableAccess(pool, id, req.userId);
    if (access.member_role === "observer")
      throw new DomainError("FORBIDDEN", "Observadores não criam fichas.", 403);
    const b = z
      .object({
        name: text(100),
        fields: sheetFields.default({}),
        secretFields: sheetFields.default({}),
      })
      .parse(req.body);
    return (
      await pool.query(
        'INSERT INTO sheets(id,table_id,owner_id,name,fields,secret_fields) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,fields,secret_fields AS "secretFields",version',
        [
          randomUUID(),
          id,
          req.userId,
          b.name,
          JSON.stringify(b.fields),
          JSON.stringify(b.secretFields),
        ],
      )
    ).rows[0];
  });
  app.put("/api/sheets/:id", async (req) => {
    const id = idOf(req);
    const b = z
      .object({
        name: text(100),
        fields: sheetFields,
        secretFields: sheetFields.default({}),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    return transaction(pool, async (db) => {
      const sheet = found(
        (await db.query("SELECT * FROM sheets WHERE id=$1 FOR UPDATE", [id]))
          .rows[0],
      );
      const access = await tableAccess(db, sheet.table_id, req.userId);
      if (sheet.owner_id !== req.userId && !access.gm)
        throw new DomainError(
          "FORBIDDEN",
          "Ficha sem permissão de edição.",
          403,
        );
      requireVersion(sheet.version, b.version);
      await db.query(
        "INSERT INTO revisions(id,entity_type,entity_id,version,snapshot,author_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          "sheet",
          id,
          sheet.version,
          JSON.stringify(sheet),
          req.userId,
        ],
      );
      return (
        await db.query(
          'UPDATE sheets SET name=$2,fields=$3,secret_fields=$4,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,name,fields,secret_fields AS "secretFields",version',
          [
            id,
            b.name,
            JSON.stringify(b.fields),
            JSON.stringify(b.secretFields),
          ],
        )
      ).rows[0];
    });
  });
  app.post("/api/formulas/evaluate", async (req) => {
    const b = z
      .object({
        formula: text(500),
        fields: z.record(z.string().max(80), z.number().finite()).default({}),
      })
      .parse(req.body);
    return { value: calculateFormula(b.formula, b.fields) };
  });
  app.post("/api/tables/:id/rolls", async (req) => {
    const id = idOf(req);
    await tableAccess(pool, id, req.userId);
    const b = z.object({ expression: text(40) }).parse(req.body);
    const result = rollDice(b.expression),
      rollId = randomUUID();
    await transaction(pool, async (db) => {
      await db.query(
        "INSERT INTO rolls(id,table_id,user_id,result) VALUES($1,$2,$3,$4)",
        [rollId, id, req.userId, JSON.stringify(result)],
      );
      if (result.sides === 20 && result.rolls.includes(20))
        await db.query(
          "INSERT INTO achievements(user_id,code,source_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [req.userId, "natural_twenty", rollId],
        );
    });
    return { id: rollId, ...result };
  });
  app.get("/api/tables/:id/rolls", async (req) => {
    const id = idOf(req);
    await tableAccess(pool, id, req.userId);
    return {
      items: (
        await pool.query(
          'SELECT r.id,r.result,r.created_at AS "createdAt",u.display_name AS "displayName" FROM rolls r JOIN users u ON u.id=r.user_id WHERE table_id=$1 ORDER BY created_at DESC LIMIT 100',
          [id],
        )
      ).rows,
    };
  });
  app.get("/api/tables/:id/presentation", async (req) => {
    const id = idOf(req);
    await tableAccess(pool, id, req.userId);
    return {
      table: found(
        (
          await pool.query("SELECT id,title,system FROM tables WHERE id=$1", [
            id,
          ])
        ).rows[0],
      ),
      sheets: (
        await pool.query(
          "SELECT id,name,fields FROM sheets WHERE table_id=$1",
          [id],
        )
      ).rows,
    };
  });
  app.get("/api/worlds", async (req) => ({
    items: (
      await pool.query(
        'SELECT DISTINCT w.id,w.title,w.description,w.visibility,w.version,w.owner_id AS "ownerId" FROM worlds w LEFT JOIN world_members m ON m.world_id=w.id WHERE w.owner_id=$1 OR m.user_id=$1 ORDER BY w.title',
        [req.userId],
      )
    ).rows,
  }));
  app.post("/api/worlds", async (req) => {
    const b = z
      .object({
        title: text(120),
        description: z.string().max(3000).default(""),
        visibility: z.enum(["private", "team", "public"]).default("private"),
      })
      .parse(req.body);
    return (
      await pool.query(
        "INSERT INTO worlds(id,owner_id,title,description,visibility) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), req.userId, b.title, b.description, b.visibility],
      )
    ).rows[0];
  });
  app.get("/api/worlds/:id", async (req) => {
    const id = idOf(req),
      access = await worldAccess(pool, id, req.userId);
    return {
      ...access,
      pages: (
        await pool.query(
          "SELECT id,title,kind,content,tags,links,visibility,version FROM world_pages WHERE world_id=$1 AND ($2 OR visibility='public' OR (visibility='team' AND $3)) ORDER BY title",
          [
            id,
            access.editor,
            access.owner_id === req.userId || !!access.member_role,
          ],
        )
      ).rows,
    };
  });
  app.post("/api/worlds/:id/pages", async (req) => {
    const id = idOf(req);
    await worldAccess(pool, id, req.userId, true);
    const b = z
      .object({
        title: text(120),
        kind: z
          .enum([
            "character",
            "location",
            "faction",
            "event",
            "item",
            "article",
          ])
          .default("article"),
        content: z.string().max(100000).default(""),
        tags: z.array(text(40)).max(30).default([]),
        links: z.array(uuid).max(100).default([]),
        visibility: z.enum(["private", "team", "public"]).default("team"),
      })
      .parse(req.body);
    return (
      await pool.query(
        "INSERT INTO world_pages(id,world_id,title,kind,content,tags,links,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
        [
          randomUUID(),
          id,
          b.title,
          b.kind,
          b.content,
          JSON.stringify(b.tags),
          JSON.stringify(b.links),
          b.visibility,
        ],
      )
    ).rows[0];
  });
  app.put("/api/worlds/:worldId/pages/:id", async (req) => {
    const worldId = idOf(req, "worldId"),
      id = idOf(req);
    const b = z
      .object({
        title: text(120),
        content: z.string().max(100000),
        tags: z.array(text(40)).max(30).default([]),
        links: z.array(uuid).max(100).default([]),
        visibility: z.enum(["private", "team", "public"]),
        version: z.number().int().positive(),
      })
      .parse(req.body);
    return transaction(pool, async (db) => {
      await worldAccess(db, worldId, req.userId, true);
      const page = found(
        (
          await db.query(
            "SELECT * FROM world_pages WHERE id=$1 AND world_id=$2 FOR UPDATE",
            [id, worldId],
          )
        ).rows[0],
      );
      requireVersion(page.version, b.version);
      await db.query(
        "INSERT INTO revisions(id,entity_type,entity_id,version,snapshot,author_id) VALUES($1,$2,$3,$4,$5,$6)",
        [
          randomUUID(),
          "world_page",
          id,
          page.version,
          JSON.stringify(page),
          req.userId,
        ],
      );
      return (
        await db.query(
          "UPDATE world_pages SET title=$2,content=$3,tags=$4,links=$5,visibility=$6,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
          [
            id,
            b.title,
            b.content,
            JSON.stringify(b.tags),
            JSON.stringify(b.links),
            b.visibility,
          ],
        )
      ).rows[0];
    });
  });
  app.get("/api/worlds/:worldId/pages/:id/history", async (req) => {
    const wid = idOf(req, "worldId"),
      id = idOf(req);
    await worldAccess(pool, wid, req.userId, true);
    found(
      (
        await pool.query(
          "SELECT id FROM world_pages WHERE id=$1 AND world_id=$2",
          [id, wid],
        )
      ).rows[0],
    );
    return {
      items: (
        await pool.query(
          "SELECT version,snapshot,created_at AS \"createdAt\" FROM revisions WHERE entity_type='world_page' AND entity_id=$1 ORDER BY version DESC",
          [id],
        )
      ).rows,
    };
  });
  app.post("/api/worlds/:id/members", async (req) => {
    const id = idOf(req);
    const world = await worldAccess(pool, id, req.userId, true);
    if (world.owner_id !== req.userId)
      throw new DomainError(
        "FORBIDDEN",
        "Somente o proprietário gerencia membros.",
        403,
      );
    const b = z
      .object({ userId: text(200), role: z.enum(["editor", "reader"]) })
      .parse(req.body);
    await pool.query(
      "INSERT INTO world_members(world_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(world_id,user_id) DO UPDATE SET role=$3",
      [id, b.userId, b.role],
    );
    return { saved: true };
  });
  app.post("/api/worlds/:id/tables", async (req) => {
    const id = idOf(req),
      b = z.object({ tableId: uuid }).parse(req.body);
    await worldAccess(pool, id, req.userId, true);
    await tableAccess(pool, b.tableId, req.userId, true);
    await pool.query(
      "INSERT INTO world_tables(world_id,table_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [id, b.tableId],
    );
    return { linked: true };
  });
  app.get("/api/worlds/:id/export", async (req) => {
    const id = idOf(req),
      world = await worldAccess(pool, id, req.userId);
    const pages = (
      await pool.query(
        "SELECT id,title,kind,content,tags,links,visibility,version FROM world_pages WHERE world_id=$1 AND ($2 OR visibility='public' OR (visibility='team' AND $3))",
        [
          id,
          world.editor,
          world.owner_id === req.userId || !!world.member_role,
        ],
      )
    ).rows;
    return {
      schema: "rpgbay.world.v1",
      world: { id, title: world.title, description: world.description },
      pages,
      assets: [],
      exportedAt: new Date().toISOString(),
    };
  });
  app.get("/api/community", async (req) => {
    const p = pageOf(req);
    return {
      items: (
        await pool.query(
          "SELECT p.id,p.title,p.body,p.category,p.system,p.created_at AS \"createdAt\",u.display_name AS author,(SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id) AS comments FROM community_posts p JOIN users u ON u.id=p.author_id WHERE p.status='published' AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$1 AND b.blocked_id=p.author_id) OR (b.blocked_id=$1 AND b.user_id=p.author_id)) ORDER BY p.created_at DESC LIMIT $2 OFFSET $3",
          [req.userId, p.limit, p.offset],
        )
      ).rows,
    };
  });
  app.post("/api/community", async (req) => {
    const b = z
      .object({
        title: text(160),
        body: text(20000),
        category: z
          .enum(["discussion", "news", "looking_for_group", "homebrew"])
          .default("discussion"),
        system: text(80).default("Geral"),
      })
      .parse(req.body);
    return (
      await pool.query(
        "INSERT INTO community_posts(id,author_id,title,body,category,system) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [randomUUID(), req.userId, b.title, b.body, b.category, b.system],
      )
    ).rows[0];
  });
  app.get("/api/community/:id", async (req) => {
    const id = idOf(req);
    const post = found(
      (
        await pool.query(
          "SELECT p.id,p.title,p.body,p.system,p.category,p.created_at,u.display_name AS author FROM community_posts p JOIN users u ON u.id=p.author_id WHERE p.id=$1 AND p.status='published' AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$2 AND b.blocked_id=p.author_id) OR (b.blocked_id=$2 AND b.user_id=p.author_id))",
          [id, req.userId],
        )
      ).rows[0],
    );
    return {
      ...post,
      comments: (
        await pool.query(
          "SELECT c.id,c.body,c.created_at,u.display_name AS author FROM post_comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$2 AND b.blocked_id=c.author_id) OR (b.blocked_id=$2 AND b.user_id=c.author_id)) ORDER BY c.created_at",
          [id, req.userId],
        )
      ).rows,
    };
  });
  app.post("/api/community/:id/comments", async (req) => {
    const id = idOf(req),
      b = z.object({ body: text(10000) }).parse(req.body);
    found(
      (
        await pool.query(
          "SELECT id FROM community_posts p WHERE id=$1 AND status='published' AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.user_id=$2 AND b.blocked_id=p.author_id) OR (b.blocked_id=$2 AND b.user_id=p.author_id))",
          [id, req.userId],
        )
      ).rows[0],
    );
    return (
      await pool.query(
        "INSERT INTO post_comments(id,post_id,author_id,body) VALUES($1,$2,$3,$4) RETURNING id,body,created_at",
        [randomUUID(), id, req.userId, b.body],
      )
    ).rows[0];
  });
  app.post("/api/reports", async (req) => {
    const b = z
      .object({
        entityType: z.enum(["post", "product", "homebrew"]),
        entityId: uuid,
        reason: text(3000),
      })
      .parse(req.body);
    return (
      await pool.query(
        "INSERT INTO reports(id,reporter_id,entity_type,entity_id,reason) VALUES($1,$2,$3,$4,$5) RETURNING id,state",
        [randomUUID(), req.userId, b.entityType, b.entityId, b.reason],
      )
    ).rows[0];
  });
  app.post("/api/blocks", async (req) => {
    const b = z.object({ userId: text(200) }).parse(req.body);
    await pool.query(
      "INSERT INTO user_blocks(user_id,blocked_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.userId, b.userId],
    );
    return { blocked: true };
  });
  app.delete("/api/blocks/:userId", async (req) => {
    const target = text(200).parse(
      (req.params as Record<string, unknown>).userId,
    );
    await pool.query(
      "DELETE FROM user_blocks WHERE user_id=$1 AND blocked_id=$2",
      [req.userId, target],
    );
    return { blocked: false };
  });
  app.get("/api/moderation/reports", async (req) => {
    const user = found(
      (await pool.query("SELECT role FROM users WHERE id=$1", [req.userId]))
        .rows[0],
    );
    if (!["moderator", "admin"].includes(user.role))
      throw new DomainError(
        "FORBIDDEN",
        "Acesso da moderação necessário.",
        403,
      );
    return {
      items: (
        await pool.query(
          "SELECT id,entity_type,entity_id,reason,state,resolution,created_at FROM reports ORDER BY created_at DESC LIMIT 100",
        )
      ).rows,
    };
  });
  app.post("/api/moderation/reports/:id/resolve", async (req) => {
    const id = idOf(req),
      b = z
        .object({ resolution: text(3000), remove: z.boolean().default(false) })
        .parse(req.body);
    return transaction(pool, async (db) => {
      const user = found(
        (await db.query("SELECT role FROM users WHERE id=$1", [req.userId]))
          .rows[0],
      );
      if (!["moderator", "admin"].includes(user.role))
        throw new DomainError(
          "FORBIDDEN",
          "Acesso da moderação necessário.",
          403,
        );
      const report = found(
        (await db.query("SELECT * FROM reports WHERE id=$1 FOR UPDATE", [id]))
          .rows[0],
      );
      if (b.remove) {
        if (report.entity_type !== "post")
          throw new DomainError(
            "MANUAL_REVIEW",
            "Esse tipo exige revisão editorial.",
          );
        await db.query(
          "UPDATE community_posts SET status='removed',removal_reason=$2 WHERE id=$1",
          [report.entity_id, b.resolution],
        );
      }
      await db.query(
        "UPDATE reports SET state='resolved',resolution=$2 WHERE id=$1",
        [id, b.resolution],
      );
      await audit(db, req.userId, "moderation.resolved", "report", id, {
        remove: b.remove,
        resolution: b.resolution,
      });
      return { resolved: true };
    });
  });
  app.get("/api/publishers", async (req) => ({
    items: (
      await pool.query(
        'SELECT DISTINCT p.id,p.name,p.description,p.verified,p.family_license_accepted AS "familyLicenseAccepted" FROM publishers p LEFT JOIN publisher_members m ON m.publisher_id=p.id WHERE p.owner_id=$1 OR m.user_id=$1 ORDER BY p.name',
        [req.userId],
      )
    ).rows,
  }));
  app.post("/api/publishers", async (req) => {
    const b = z
      .object({
        name: text(100),
        description: z.string().max(5000).default(""),
        familyLicenseAccepted: z.literal(true),
      })
      .parse(req.body);
    return (
      await pool.query(
        "INSERT INTO publishers(id,owner_id,name,description,family_license_accepted) VALUES($1,$2,$3,$4,true) RETURNING id,name,verified",
        [randomUUID(), req.userId, b.name, b.description],
      )
    ).rows[0];
  });
  app.post("/api/publishers/:id/members", async (req) => {
    const id = idOf(req),
      pub = await publisherAccess(pool, id, req.userId);
    if (pub.owner_id !== req.userId && pub.member_role !== "admin")
      throw new DomainError(
        "FORBIDDEN",
        "Somente administração editorial.",
        403,
      );
    const b = z
      .object({
        userId: text(200),
        role: z.enum(["admin", "editor", "finance", "support"]),
      })
      .parse(req.body);
    await pool.query(
      "INSERT INTO publisher_members(publisher_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(publisher_id,user_id) DO UPDATE SET role=$3",
      [id, b.userId, b.role],
    );
    return { saved: true };
  });
  app.get("/api/publishers/:id/products", async (req) => {
    const id = idOf(req);
    await publisherAccess(pool, id, req.userId);
    return {
      items: (
        await pool.query(
          `${productSelect} WHERE p.publisher_id=$1 ORDER BY p.created_at DESC`,
          [id],
        )
      ).rows,
    };
  });
  app.post("/api/publishers/:id/products", async (req) => {
    const id = idOf(req);
    await publisherAccess(pool, id, req.userId);
    const b = z
      .object({
        title: text(160),
        subtitle: z.string().max(300).default(""),
        description: z.string().max(20000).default(""),
        system: text(100).default("Independente"),
        format: z
          .enum(["PDF", "EPUB", "VTT", "Physical", "Bundle"])
          .default("PDF"),
        priceCents: z.number().int().min(0).max(100000000).default(0),
        familySharing: z.literal(true).default(true),
      })
      .parse(req.body);
    return (
      await pool.query(
        "INSERT INTO products(id,publisher_id,title,subtitle,description,system,format,price_cents,family_sharing) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *",
        [
          randomUUID(),
          id,
          b.title,
          b.subtitle,
          b.description,
          b.system,
          b.format,
          b.priceCents,
        ],
      )
    ).rows[0];
  });
  app.post("/api/publishers/:id/products/:productId/status", async (req) => {
    const id = idOf(req),
      productId = idOf(req, "productId");
    const b = z
      .object({
        status: z.enum([
          "draft",
          "review",
          "published",
          "suspended",
          "withdrawn",
        ]),
        reason: text(3000),
      })
      .parse(req.body);
    return transaction(pool, async (db) => {
      const publisher = await publisherAccess(db, id, req.userId);
      const product = found(
        (
          await db.query(
            "SELECT * FROM products WHERE id=$1 AND publisher_id=$2 FOR UPDATE",
            [productId, id],
          )
        ).rows[0],
      );
      if (b.status === "published") {
        if (!publisher.family_license_accepted)
          throw new DomainError(
            "FAMILY_LICENSE",
            "É obrigatória autorização editorial para compartilhamento familiar.",
            409,
          );
        if (!publisher.verified)
          throw new DomainError(
            "PUBLISHER_UNVERIFIED",
            "Responsável editorial precisa ser verificado antes da publicação.",
            409,
          );
        if (
          !(
            await db.query(
              "SELECT 1 FROM product_versions WHERE product_id=$1 AND validated_at IS NOT NULL LIMIT 1",
              [productId],
            )
          ).rowCount
        )
          throw new DomainError(
            "NO_VALID_FILE",
            "Publicação exige arquivo validado.",
            409,
          );
      }
      await db.query("UPDATE products SET status=$2 WHERE id=$1", [
        productId,
        b.status,
      ]);
      await audit(db, req.userId, "product.status", "product", productId, {
        from: product.status,
        to: b.status,
        reason: b.reason,
      });
      return { id: productId, status: b.status };
    });
  });
  app.get("/api/betas", async (req) => ({
    items: (
      await pool.query(
        "SELECT b.id,b.title,b.access,b.end_policy AS \"endPolicy\",b.state,v.label AS version,p.title AS product,COALESCE(part.state,'not_joined') AS participation FROM beta_programs b JOIN products p ON p.id=b.product_id JOIN product_versions v ON v.id=b.version_id LEFT JOIN beta_participants part ON part.beta_id=b.id AND part.user_id=$1 WHERE b.access<>'invite' OR part.user_id=$1 ORDER BY b.created_at DESC LIMIT 100",
        [req.userId],
      )
    ).rows,
  }));
  app.post("/api/publishers/:id/betas", async (req) => {
    const id = idOf(req);
    await publisherAccess(pool, id, req.userId);
    const b = z
      .object({
        productId: uuid,
        versionId: uuid,
        title: text(160),
        access: z.enum(["open", "approval", "invite"]),
        endPolicy: z.enum(["expires", "retained"]),
      })
      .parse(req.body);
    found(
      (
        await pool.query(
          "SELECT v.id FROM product_versions v JOIN products p ON p.id=v.product_id WHERE v.id=$1 AND v.product_id=$2 AND p.publisher_id=$3 AND v.validated_at IS NOT NULL",
          [b.versionId, b.productId, id],
        )
      ).rows[0],
    );
    return (
      await pool.query(
        "INSERT INTO beta_programs(id,publisher_id,product_id,version_id,title,access,end_policy) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          randomUUID(),
          id,
          b.productId,
          b.versionId,
          b.title,
          b.access,
          b.endPolicy,
        ],
      )
    ).rows[0];
  });
  app.post("/api/betas/:id/join", async (req) => {
    const id = idOf(req);
    return transaction(pool, async (db) => {
      const beta = found(
        (
          await db.query(
            "SELECT * FROM beta_programs WHERE id=$1 AND state='open' FOR UPDATE",
            [id],
          )
        ).rows[0],
      );
      if (beta.access === "invite")
        throw new DomainError(
          "INVITE_REQUIRED",
          "Acesso exige convite editorial.",
          403,
        );
      const state = beta.access === "open" ? "approved" : "pending";
      return (
        (
          await db.query(
            'INSERT INTO beta_participants(beta_id,user_id,state,pinned_version_id) VALUES($1,$2,$3,$4) ON CONFLICT(beta_id,user_id) DO NOTHING RETURNING state,pinned_version_id AS "versionId"',
            [id, req.userId, state, beta.version_id],
          )
        ).rows[0] ?? { state: "already_joined" }
      );
    });
  });
  app.post("/api/betas/:id/participants", async (req) => {
    const id = idOf(req),
      b = z
        .object({ userId: text(200), state: z.enum(["approved", "rejected"]) })
        .parse(req.body);
    const beta = found(
      (await pool.query("SELECT * FROM beta_programs WHERE id=$1", [id]))
        .rows[0],
    );
    await publisherAccess(pool, beta.publisher_id, req.userId);
    await pool.query(
      "INSERT INTO beta_participants(beta_id,user_id,state,pinned_version_id) VALUES($1,$2,$3,$4) ON CONFLICT(beta_id,user_id) DO UPDATE SET state=$3",
      [id, b.userId, b.state, beta.version_id],
    );
    return { saved: true };
  });
  app.patch("/api/betas/:id", async (req) => {
    const id = idOf(req),
      b = z
        .object({
          state: z.enum(["open", "closed"]).optional(),
          versionId: uuid.optional(),
        })
        .parse(req.body);
    return transaction(pool, async (db) => {
      const beta = found(
        (
          await db.query("SELECT * FROM beta_programs WHERE id=$1 FOR UPDATE", [
            id,
          ])
        ).rows[0],
      );
      await publisherAccess(db, beta.publisher_id, req.userId);
      if (b.versionId)
        found(
          (
            await db.query(
              "SELECT id FROM product_versions WHERE id=$1 AND product_id=$2 AND validated_at IS NOT NULL",
              [b.versionId, beta.product_id],
            )
          ).rows[0],
        );
      await db.query(
        "UPDATE beta_programs SET state=COALESCE($2,state),version_id=COALESCE($3,version_id) WHERE id=$1",
        [id, b.state ?? null, b.versionId ?? null],
      );
      await audit(db, req.userId, "beta.updated", "beta", id, {
        state: b.state,
        versionId: b.versionId,
      });
      return { saved: true };
    });
  });
  app.post("/api/tables/:id/beta", async (req) => {
    const id = idOf(req),
      b = z.object({ betaId: uuid, versionId: uuid }).parse(req.body);
    return transaction(pool, async (db) => {
      await tableAccess(db, id, req.userId, true);
      const beta = found(
        (
          await db.query(
            "SELECT b.* FROM beta_programs b JOIN beta_participants part ON part.beta_id=b.id WHERE b.id=$1 AND part.user_id=$2 AND part.state='approved' AND (b.state='open' OR b.end_policy='retained')",
            [b.betaId, req.userId],
          )
        ).rows[0],
      );
      found(
        (
          await db.query(
            "SELECT id FROM product_versions WHERE id=$1 AND product_id=$2 AND validated_at IS NOT NULL",
            [b.versionId, beta.product_id],
          )
        ).rows[0],
      );
      await db.query(
        "INSERT INTO table_betas(table_id,beta_id,pinned_version_id,linked_by) VALUES($1,$2,$3,$4) ON CONFLICT(table_id) DO UPDATE SET beta_id=$2,pinned_version_id=$3,linked_by=$4,linked_at=now()",
        [id, b.betaId, b.versionId, req.userId],
      );
      await audit(db, req.userId, "table.beta_version", "table", id, {
        betaId: b.betaId,
        versionId: b.versionId,
      });
      return { tableId: id, betaId: b.betaId, versionId: b.versionId };
    });
  });
  app.post("/api/betas/:id/feedback", async (req) => {
    const id = idOf(req),
      b = z
        .object({
          body: text(20000),
          page: z.number().int().positive().optional(),
        })
        .parse(req.body);
    const participant = found(
      (
        await pool.query(
          "SELECT part.* FROM beta_participants part JOIN beta_programs b ON b.id=part.beta_id WHERE part.beta_id=$1 AND user_id=$2 AND part.state='approved' AND (b.state='open' OR b.end_policy='retained')",
          [id, req.userId],
        )
      ).rows[0],
    );
    return (
      await pool.query(
        "INSERT INTO beta_feedback(id,beta_id,user_id,version_id,page,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          randomUUID(),
          id,
          req.userId,
          participant.pinned_version_id,
          b.page ?? null,
          b.body,
        ],
      )
    ).rows[0];
  });
  app.get("/api/betas/:id/feedback", async (req) => {
    const id = idOf(req),
      beta = found(
        (
          await pool.query(
            "SELECT publisher_id FROM beta_programs WHERE id=$1",
            [id],
          )
        ).rows[0],
      );
    await publisherAccess(pool, beta.publisher_id, req.userId);
    return {
      items: (
        await pool.query(
          "SELECT id,version_id,page,body,created_at FROM beta_feedback WHERE beta_id=$1 ORDER BY created_at DESC",
          [id],
        )
      ).rows,
    };
  });
  app.post("/api/gifts", async (req) => {
    const b = z
      .object({ productId: uuid, dedication: z.string().max(4000).default("") })
      .parse(req.body);
    return transaction(pool, async (db) => {
      const product = found(
        (
          await db.query(
            "SELECT * FROM products WHERE id=$1 AND status='published'",
            [b.productId],
          )
        ).rows[0],
      );
      const secret = token(),
        id = randomUUID(),
        state = product.price_cents === 0 ? "ready" : "pending_payment";
      await db.query(
        "INSERT INTO gifts(id,sender_id,product_id,secret_hash,expires_at,state,dedication) VALUES($1,$2,$3,$4,now()+interval '90 days',$5,$6)",
        [id, req.userId, b.productId, hash(secret), state, b.dedication],
      );
      return {
        id,
        token: secret,
        state,
        expiresInDays: 90,
        paymentRequired: state === "pending_payment",
      };
    });
  });
  app.get("/api/gifts", async (req) => ({
    items: (
      await pool.query(
        'SELECT g.id,g.state,g.expires_at AS "expiresAt",g.created_at AS "createdAt",p.title FROM gifts g JOIN products p ON p.id=g.product_id WHERE g.sender_id=$1 OR g.recipient_id=$1 ORDER BY g.created_at DESC',
        [req.userId],
      )
    ).rows,
  }));
  app.post("/api/gifts/redeem", async (req) => {
    const b = z.object({ token: text(200) }).parse(req.body);
    return transaction(pool, async (db) => {
      const gift = found(
        (
          await db.query(
            "SELECT * FROM gifts WHERE secret_hash=$1 FOR UPDATE",
            [hash(b.token)],
          )
        ).rows[0],
      );
      if (
        gift.state !== "ready" ||
        new Date(gift.expires_at).getTime() <= Date.now()
      )
        throw new DomainError(
          "GIFT_UNAVAILABLE",
          "Presente indisponível, expirado ou já utilizado.",
          409,
        );
      await db.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        req.userId,
      ]);
      if (
        (
          await db.query(
            "SELECT 1 FROM entitlements WHERE user_id=$1 AND product_id=$2 AND revoked_at IS NULL",
            [req.userId, gift.product_id],
          )
        ).rowCount
      )
        throw new DomainError(
          "ALREADY_OWNED",
          "Você já possui o título. O presente permanece disponível para outro destinatário.",
          409,
        );
      const entitlement = randomUUID();
      await db.query(
        "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5)",
        [entitlement, req.userId, gift.product_id, "gift", `gift:${gift.id}`],
      );
      await db.query(
        "INSERT INTO personal_copies(id,entitlement_id,dedication) VALUES($1,$2,$3)",
        [randomUUID(), entitlement, gift.dedication],
      );
      await db.query(
        "UPDATE gifts SET state='redeemed',recipient_id=$2,redeemed_at=now() WHERE id=$1",
        [gift.id, req.userId],
      );
      await db.query(
        "INSERT INTO achievements(user_id,code,source_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [req.userId, "first_gift", gift.id],
      );
      return { redeemed: true, productId: gift.product_id };
    });
  });
  app.get("/api/library/:id/personal-copy", async (req) => {
    const id = idOf(req);
    return {
      copy:
        (
          await pool.query(
            'SELECT c.id,c.dedication,c.display_dedication AS "displayDedication",c.cover_object_key AS "coverObjectKey" FROM personal_copies c JOIN entitlements e ON e.id=c.entitlement_id WHERE e.product_id=$1 AND e.user_id=$2 AND e.revoked_at IS NULL',
            [id, req.userId],
          )
        ).rows[0] ?? null,
    };
  });
  app.patch("/api/library/:id/personal-copy", async (req) => {
    const id = idOf(req),
      b = z.object({ displayDedication: z.boolean() }).parse(req.body);
    return found(
      (
        await pool.query(
          'UPDATE personal_copies c SET display_dedication=$3 FROM entitlements e WHERE e.id=c.entitlement_id AND e.product_id=$1 AND e.user_id=$2 AND e.revoked_at IS NULL RETURNING c.id,c.display_dedication AS "displayDedication"',
          [id, req.userId, b.displayDedication],
        )
      ).rows[0],
    );
  });
  app.get("/api/points", async (req) => ({
    balance:
      (
        await pool.query(
          "SELECT balance FROM point_accounts WHERE user_id=$1",
          [req.userId],
        )
      ).rows[0]?.balance ?? 0,
    items: (
      await pool.query(
        'SELECT id,amount,reason,created_at AS "createdAt" FROM point_entries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
        [req.userId],
      )
    ).rows,
    cosmetics: (
      await pool.query(
        "SELECT c.id,c.title,c.cost,c.style,(o.user_id IS NOT NULL) AS owned FROM cosmetics c LEFT JOIN cosmetic_ownership o ON o.cosmetic_id=c.id AND o.user_id=$1 ORDER BY c.cost",
        [req.userId],
      )
    ).rows,
  }));
  app.post("/api/points/redeem/:id", async (req) => {
    const id = idOf(req);
    return transaction(pool, async (db) => {
      const cosmetic = found(
        (await db.query("SELECT * FROM cosmetics WHERE id=$1", [id])).rows[0],
      );
      await db.query(
        "INSERT INTO point_accounts(user_id) VALUES($1) ON CONFLICT DO NOTHING",
        [req.userId],
      );
      const account = found(
        (
          await db.query(
            "SELECT balance FROM point_accounts WHERE user_id=$1 FOR UPDATE",
            [req.userId],
          )
        ).rows[0],
      );
      if (
        (
          await db.query(
            "SELECT 1 FROM cosmetic_ownership WHERE user_id=$1 AND cosmetic_id=$2",
            [req.userId, id],
          )
        ).rowCount
      )
        throw new DomainError(
          "ALREADY_OWNED",
          "Você já possui este cosmético.",
          409,
        );
      if (account.balance < cosmetic.cost)
        throw new DomainError(
          "INSUFFICIENT_POINTS",
          "BAY Points insuficientes.",
          409,
        );
      await db.query(
        "UPDATE point_accounts SET balance=balance-$2 WHERE user_id=$1",
        [req.userId, cosmetic.cost],
      );
      await db.query(
        "INSERT INTO cosmetic_ownership(user_id,cosmetic_id) VALUES($1,$2)",
        [req.userId, id],
      );
      await db.query(
        "INSERT INTO point_entries(id,user_id,amount,reason,reference) VALUES($1,$2,$3,$4,$5)",
        [
          randomUUID(),
          req.userId,
          -cosmetic.cost,
          "cosmetic_redemption",
          `cosmetic:${req.userId}:${id}`,
        ],
      );
      return { redeemed: true, balance: account.balance - cosmetic.cost };
    });
  });
  app.get("/api/print", async (req) => ({
    items: (
      await pool.query(
        'SELECT j.id,j.status,j.proof_key AS "proofKey",j.approved_at AS "approvedAt",j.tracking,j.notes,j.version,p.title FROM print_jobs j JOIN products p ON p.id=j.product_id WHERE j.user_id=$1 OR EXISTS(SELECT 1 FROM publishers pub WHERE pub.id=j.publisher_id AND pub.owner_id=$1) ORDER BY j.created_at DESC',
        [req.userId],
      )
    ).rows,
  }));
  app.post("/api/print", async (req) => {
    const b = z
      .object({ productId: uuid, notes: z.string().max(3000).default("") })
      .parse(req.body);
    await canRead(pool, b.productId, req.userId);
    const product = found(
      (await pool.query("SELECT * FROM products WHERE id=$1", [b.productId]))
        .rows[0],
    );
    if (!product.publisher_id)
      throw new DomainError(
        "NO_PUBLISHER",
        "O produto não tem operação física configurada.",
        409,
      );
    return (
      await pool.query(
        "INSERT INTO print_jobs(id,user_id,publisher_id,product_id,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [randomUUID(), req.userId, product.publisher_id, b.productId, b.notes],
      )
    ).rows[0];
  });
  app.post("/api/print/:id/transition", async (req) => {
    const id = idOf(req),
      b = z
        .object({
          status: z.enum([
            "awaiting_art",
            "awaiting_proof",
            "awaiting_approval",
            "approved",
            "in_production",
            "produced",
            "shipped",
            "delivered",
            "cancelled",
            "damaged",
            "lost",
          ]),
          version: z.number().int().positive(),
          proofKey: z.string().max(500).optional(),
          tracking: z.string().max(300).optional(),
          notes: z.string().max(3000).default(""),
        })
        .parse(req.body);
    return transaction(pool, async (db) => {
      const job = found(
        (
          await db.query("SELECT * FROM print_jobs WHERE id=$1 FOR UPDATE", [
            id,
          ])
        ).rows[0],
      );
      requireVersion(job.version, b.version);
      if (b.status === "approved") {
        if (job.user_id !== req.userId)
          throw new DomainError(
            "FORBIDDEN",
            "A prova deve ser aprovada pelo comprador.",
            403,
          );
        if (!job.proof_key)
          throw new DomainError("PROOF_REQUIRED", "Prova ausente.", 409);
      } else if (b.status === "cancelled" && job.user_id === req.userId) {
        if (
          ["in_production", "produced", "shipped", "delivered"].includes(
            job.status,
          )
        )
          throw new DomainError(
            "CANCELLATION_REVIEW",
            "Cancelamento nesta etapa exige atendimento.",
            409,
          );
      } else await publisherAccess(db, job.publisher_id, req.userId);
      assertPrintTransition(job.status, b.status);
      if (b.status === "awaiting_approval" && !b.proofKey)
        throw new DomainError(
          "PROOF_REQUIRED",
          "Envie a prova de impressão para revisão.",
        );
      if (b.status === "shipped" && !b.tracking)
        throw new DomainError(
          "TRACKING_REQUIRED",
          "Informe rastreamento ou comprovante real.",
        );
      if (b.status === "in_production" && !job.approved_at)
        throw new DomainError(
          "APPROVAL_REQUIRED",
          "Produção depende de aprovação do comprador.",
          409,
        );
      if (
        b.proofKey &&
        !(
          await db.query(
            "SELECT 1 FROM upload_intents WHERE published_key=$1 AND tenant_id=$2 AND storage_class='publishing' AND state='published' AND print_job_id=$3",
            [b.proofKey, job.publisher_id, id],
          )
        ).rowCount
      )
        throw new DomainError(
          "PROOF_KEY",
          "Prova deve ser um arquivo real validado do tenant editorial.",
        );
      if (
        b.status === "shipped" &&
        !(
          await db.query(
            "SELECT 1 FROM print_addresses WHERE print_job_id=$1",
            [id],
          )
        ).rowCount
      )
        throw new DomainError(
          "ADDRESS_REQUIRED",
          "Endereço privado do destinatário ainda não informado.",
          409,
        );
      await db.query(
        "UPDATE print_jobs SET status=$2,proof_key=COALESCE($3,proof_key),tracking=COALESCE($4,tracking),approved_at=CASE WHEN $2='approved' THEN now() WHEN $2='awaiting_art' THEN NULL ELSE approved_at END,notes=$5,version=version+1 WHERE id=$1",
        [id, b.status, b.proofKey ?? null, b.tracking ?? null, b.notes],
      );
      await audit(db, req.userId, "print.transition", "print_job", id, {
        from: job.status,
        to: b.status,
      });
      return { id, status: b.status, version: job.version + 1 };
    });
  });
  app.get("/api/account/export", async (req) => ({
    schema: "rpgbay.account.v1",
    profile: (
      await pool.query(
        "SELECT id,display_name,bio,timezone,favorite_systems,created_at FROM users WHERE id=$1",
        [req.userId],
      )
    ).rows[0],
    worlds: (
      await pool.query("SELECT * FROM worlds WHERE owner_id=$1", [req.userId])
    ).rows,
    sheets: (
      await pool.query("SELECT * FROM sheets WHERE owner_id=$1", [req.userId])
    ).rows,
    reading: (
      await pool.query("SELECT * FROM reading_state WHERE user_id=$1", [
        req.userId,
      ])
    ).rows,
    generatedAt: new Date().toISOString(),
  }));
}
