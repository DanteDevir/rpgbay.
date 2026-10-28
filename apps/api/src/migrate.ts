import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { makePool, transaction } from "./db.js";
const pool = makePool();
try {
  await transaction(pool, async (db) => {
    await db.query(
      "SELECT pg_advisory_xact_lock(hashtext('rpg-bay-migrations'))",
    );
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const dir = fileURLToPath(
      new URL("../../../infra/migrations/", import.meta.url),
    );
    for (const name of (await readdir(dir))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (
        (
          await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await db.query(await readFile(`${dir}/${name}`, "utf8"));
      await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      console.info(`Applied ${name}`);
    }
  });
} finally {
  await pool.end();
}
