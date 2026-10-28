import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../apps/api/src/config.js";
import {
  calculateFormula,
  rollDice,
  allocateCents,
  commissionCents,
  requireVersion,
  assertPrintTransition,
} from "../packages/domain/src/index.js";
test("formula grammar respects precedence and fields without executing code", () => {
  assert.equal(calculateFormula("(forca + 2) * 3 - 8 / 2", { forca: 4 }), 14);
  for (const input of [
    "process.exit()",
    "constructor",
    "1/0",
    "NaN",
    "2 ** 4",
    "1;globalThis",
    "(".repeat(40) + "1" + ")".repeat(40),
  ])
    assert.throws(() => calculateFormula(input));
});
test("dice limits and server entropy boundary", () => {
  assert.deepEqual(rollDice("2d6+3", () => 6).rolls, [6, 6]);
  assert.equal(rollDice("2d6+3", () => 6).total, 15);
  for (const value of ["0d6", "101d6", "1d1", "1d10001", "eval(1)", "1d6+1d6"])
    assert.throws(() => rollDice(value));
});
test("money allocation preserves total and deterministic ties", () => {
  assert.deepEqual(allocateCents(100, [1, 1, 1]), [34, 33, 33]);
  assert.equal(commissionCents(10000), 900);
  assert.equal(commissionCents(105), 9);
  for (let total = 0; total < 100; total++)
    assert.equal(
      allocateCents(total, [7, 11, 19]).reduce((a, b) => a + b, 0),
      total,
    );
  assert.throws(() => commissionCents(1.5));
});
test("concurrent edits and production without proof cannot advance silently", () => {
  assert.throws(() => requireVersion(2, 1), /alterações/);
  assert.doesNotThrow(() => requireVersion(2, 2));
  assert.throws(() => assertPrintTransition("awaiting_proof", "in_production"));
  assert.doesNotThrow(() => assertPrintTransition("approved", "in_production"));
});

test("production fails closed without providers and never enables development identity", () => {
  assert.throws(
    () => validateConfig({ NODE_ENV: "production", DEV_AUTH_ENABLED: "true" }),
    /incompleta/,
  );
  assert.doesNotThrow(() =>
    validateConfig({ NODE_ENV: "development", DEV_AUTH_ENABLED: "true" }),
  );
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://synthetic/database",
    WEB_ORIGIN: "https://example.invalid",
    OIDC_ISSUER: "https://id.example.invalid",
    OIDC_AUDIENCE: "synthetic",
    OIDC_CLIENT_ID: "synthetic",
    OIDC_REDIRECT_URI: "https://example.invalid/api/auth/callback",
    R2_ACCOUNT_ID: "a".repeat(32),
    R2_ACCESS_KEY_ID: "synthetic",
    R2_SECRET_ACCESS_KEY: "synthetic",
    R2_BUCKET_PUBLIC: "public",
    R2_BUCKET_LIBRARY: "library",
    R2_BUCKET_USER: "user",
    R2_BUCKET_PUBLISHING: "publishing",
    R2_BUCKET_BACKUPS: "backups",
    SCANNER_URL: "http://scanner:3002",
    SCANNER_TOKEN: "synthetic",
    USER_QUOTA_BYTES: "20000000",
    EDITORIAL_QUOTA_BYTES: "1000000000",
    EDITORIAL_FILE_LIMIT_BYTES: "500000000",
    PRINT_ADDRESS_ENCRYPTION_KEY: "c".repeat(64),
  };
  assert.doesNotThrow(() => validateConfig(env));
  assert.throws(
    () => validateConfig({ ...env, DEV_AUTH_ENABLED: "true" }),
    /não pode/,
  );
  assert.throws(
    () => validateConfig({ ...env, WEB_ORIGIN: "http://example.invalid" }),
    /HTTPS/,
  );
});
