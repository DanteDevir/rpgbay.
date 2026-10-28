import { readdir, readFile } from "node:fs/promises";
const ignored = new Set(["node_modules", ".git", "target", "dist"]);
let failed = false;
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(e.name)) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) await walk(p);
    else {
      if (e.name.startsWith(".env") && !e.name.endsWith(".example")) {
        console.error(`Private environment file: ${p}`);
        failed = true;
        continue;
      }
      const body = await readFile(p, "utf8");
      if (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(body) ||
        /\b(?:sk_live_|rk_live_)[a-zA-Z0-9]{16,}/.test(body)
      ) {
        console.error(`Potential live secret: ${p}`);
        failed = true;
      }
    }
  }
}
await walk(".");
if (failed) process.exitCode = 1;
else
  console.log(
    "No configured private env files, PEM private keys, or live Stripe keys found. This narrow scan is not a complete secret audit.",
  );
