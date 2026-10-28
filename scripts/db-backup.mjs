import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  chmod,
  open,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
// DB tool binaries must come from the matching PostgreSQL major. Never interpolate shell commands.
const [mode, file] = process.argv.slice(2);
if (
  !["backup", "restore"].includes(mode) ||
  !file ||
  !process.env.BACKUP_KEY_FILE
)
  throw new Error(
    "Usage: BACKUP_KEY_FILE=<32-byte-key-file> node scripts/db-backup.mjs backup|restore <file>",
  );
const key = await readFile(process.env.BACKUP_KEY_FILE);
if (key.length !== 32)
  throw new Error(
    "Backup key must contain exactly 32 raw bytes; store outside the source package.",
  );
const temp = await mkdtemp(join(tmpdir(), "rpgbay-backup-"));
await chmod(temp, 0o700);
const dump = join(temp, "database.dump");
async function tool(name, args, out) {
  const docker = process.env.PG_TOOL_MODE === "docker";
  const argv = docker
    ? [
        "exec",
        "-i",
        process.env.PG_CONTAINER || "rpgbay-postgres",
        name,
        ...args,
      ]
    : args;
  const env = { ...process.env };
  if (!docker && !env.DATABASE_URL) throw new Error("DATABASE_URL required");
  const proc = spawn(docker ? "docker" : name, argv, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const errs = [];
  proc.stderr.on("data", (b) => errs.push(b));
  if (out) proc.stdout.pipe(createWriteStream(out, { mode: 0o600 }));
  else proc.stdout.resume();
  if (name === "pg_restore") createReadStream(dump).pipe(proc.stdin);
  else proc.stdin.end();
  await new Promise((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve(null)
        : reject(
            new Error(
              `PostgreSQL tool exited ${code}; check access and target database.`,
            ),
          ),
    );
  });
}
try {
  if (mode === "backup") {
    const args = ["--format=custom", "--no-owner", "--no-acl"];
    if (process.env.PG_TOOL_MODE === "docker")
      args.push(
        "-U",
        process.env.PGUSER || "rpgbay",
        process.env.PGDATABASE || "rpgbay",
      );
    else args.push("--dbname", process.env.DATABASE_URL);
    await tool("pg_dump", args, dump);
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", key, nonce);
    const encrypted = join(temp, "payload");
    await pipeline(
      createReadStream(dump),
      cipher,
      createWriteStream(encrypted, { mode: 0o600 }),
    );
    await writeFile(
      file,
      Buffer.concat([Buffer.from("RPGBAYBK1"), nonce, cipher.getAuthTag()]),
      { mode: 0o600, flag: "wx" },
    );
    await pipeline(
      createReadStream(encrypted),
      createWriteStream(file, { flags: "a", mode: 0o600 }),
    );
    console.log(
      "Encrypted PostgreSQL backup written. Key must be backed up separately.",
    );
  } else {
    if (
      process.env.RESTORE_CONFIRM_DATABASE !== process.env.PGDATABASE ||
      !process.env.PGDATABASE
    )
      throw new Error(
        "Set PGDATABASE and RESTORE_CONFIRM_DATABASE to the same disposable or approved target database.",
      );
    const fd = await open(file, "r");
    const header = Buffer.alloc(37);
    await fd.read(header, 0, 37, 0);
    await fd.close();
    if (header.subarray(0, 9).toString() !== "RPGBAYBK1")
      throw new Error("Invalid backup format");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      header.subarray(9, 21),
    );
    decipher.setAuthTag(header.subarray(21, 37));
    // Authentication completes before any database mutation.
    await pipeline(
      createReadStream(file, { start: 37 }),
      decipher,
      createWriteStream(dump, { mode: 0o600 }),
    );
    const args = [
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-acl",
      "--clean",
      "--if-exists",
    ];
    if (process.env.PG_TOOL_MODE === "docker")
      args.push(
        "-U",
        process.env.PGUSER || "rpgbay",
        "-d",
        process.env.PGDATABASE,
      );
    else args.push("--dbname", process.env.DATABASE_URL);
    await tool("pg_restore", args);
    console.log(
      "Database restore completed. Verify application counts and object manifests before reopening traffic.",
    );
  }
} finally {
  key.fill(0);
  await rm(temp, { recursive: true, force: true });
}
