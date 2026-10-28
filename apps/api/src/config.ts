/** Validate names only in diagnostics; never include secret values. */
export function validateConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  const required = [
    "DATABASE_URL",
    "WEB_ORIGIN",
    "OIDC_ISSUER",
    "OIDC_AUDIENCE",
    "OIDC_CLIENT_ID",
    "OIDC_REDIRECT_URI",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_PUBLIC",
    "R2_BUCKET_LIBRARY",
    "R2_BUCKET_USER",
    "R2_BUCKET_PUBLISHING",
    "R2_BUCKET_BACKUPS",
    "SCANNER_URL",
    "SCANNER_TOKEN",
    "USER_QUOTA_BYTES",
    "EDITORIAL_QUOTA_BYTES",
    "EDITORIAL_FILE_LIMIT_BYTES",
    "PRINT_ADDRESS_ENCRYPTION_KEY",
  ] as const;
  const missing = required.filter((name) => !env[name]);
  if (missing.length)
    throw new Error(
      `Configuração de produção incompleta: ${missing.join(", ")}.`,
    );
  if (env.DEV_AUTH_ENABLED === "true")
    throw new Error("DEV_AUTH_ENABLED não pode estar habilitado em produção.");
  for (const name of [
    "WEB_ORIGIN",
    "OIDC_ISSUER",
    "OIDC_REDIRECT_URI",
  ] as const) {
    const url = new URL(env[name]!);
    if (url.protocol !== "https:")
      throw new Error(`${name} deve usar HTTPS em produção.`);
  }
  for (const name of [
    "USER_QUOTA_BYTES",
    "EDITORIAL_QUOTA_BYTES",
    "EDITORIAL_FILE_LIMIT_BYTES",
  ] as const) {
    const value = Number(env[name]);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${name} exige inteiro positivo em bytes.`);
  }
  if (!/^[a-f0-9]{64}$/.test(env.PRINT_ADDRESS_ENCRYPTION_KEY!))
    throw new Error(
      "PRINT_ADDRESS_ENCRYPTION_KEY exige chave AES de 32 bytes hexadecimal.",
    );
  if (!/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID!))
    throw new Error("R2_ACCOUNT_ID inválido.");
  const scanner = new URL(env.SCANNER_URL!);
  if (
    !["https:", "http:"].includes(scanner.protocol) ||
    scanner.username ||
    scanner.password
  )
    throw new Error("SCANNER_URL inválido.");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET)
    throw new Error("STRIPE_WEBHOOK_SECRET obrigatório com STRIPE_SECRET_KEY.");
  if (env.ASAAS_API_KEY && !env.ASAAS_WEBHOOK_TOKEN)
    throw new Error("ASAAS_WEBHOOK_TOKEN obrigatório com ASAAS_API_KEY.");
}
