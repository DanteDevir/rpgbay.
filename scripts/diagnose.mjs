import { existsSync } from "node:fs";
const checks = {
  node24: Number(process.versions.node.split(".")[0]) === 24,
  lockfile: existsSync("package-lock.json"),
  dependencies: existsSync("node_modules"),
  databaseConfigured: !!process.env.DATABASE_URL,
  production: process.env.NODE_ENV === "production",
};
if (checks.production) {
  for (const name of [
    "WEB_ORIGIN",
    "OIDC_ISSUER",
    "OIDC_AUDIENCE",
    "OIDC_CLIENT_ID",
    "OIDC_REDIRECT_URI",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_PRIVATE",
    "R2_BUCKET_QUARANTINE",
  ])
    checks[name] = !!process.env[name];
  checks.developmentAuthDisabled = process.env.DEV_AUTH_ENABLED !== "true";
}
console.log(
  JSON.stringify(
    {
      checks,
      missing: Object.entries(checks)
        .filter(([k, v]) => k !== "production" && !v)
        .map(([k]) => k),
    },
    null,
    2,
  ),
);
if (Object.entries(checks).some(([k, v]) => k !== "production" && !v))
  process.exitCode = 1;
