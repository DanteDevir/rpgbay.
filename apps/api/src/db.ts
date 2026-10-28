import pg from "pg";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { DomainError } from "../../../packages/domain/src/index.js";
export const makePool = () =>
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 12,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
export async function transaction<T>(
  pool: pg.Pool,
  work: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await work(db);
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function audit(
  db: Pick<PoolClient, "query">,
  actor: string | null,
  action: string,
  type: string,
  id: string,
  metadata: unknown = {},
) {
  await db.query(
    "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5,$6)",
    [randomUUID(), actor, action, type, id, JSON.stringify(metadata)],
  );
}
export function found<T>(value: T | undefined): T {
  if (value === undefined)
    throw new DomainError("NOT_FOUND", "Recurso não encontrado.", 404);
  return value;
}
