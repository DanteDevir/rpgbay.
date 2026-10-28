import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { DomainError } from "../../../packages/domain/src/index.js";
declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}
export async function installAuth(app: FastifyInstance, pool: Pool) {
  app.decorateRequest("userId", "");
  const dev =
    process.env.NODE_ENV === "development" &&
    process.env.DEV_AUTH_ENABLED === "true";
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  const issuer = process.env.OIDC_ISSUER,
    audience = process.env.OIDC_AUDIENCE;
  if (!dev) {
    if (!issuer || !audience || !issuer.startsWith("https://"))
      throw new Error(
        "OIDC_ISSUER HTTPS e OIDC_AUDIENCE são obrigatórios fora do desenvolvimento isolado.",
      );
    const metadata = (await fetch(
      `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(10000) },
    ).then((r) => {
      if (!r.ok) throw new Error("OIDC discovery indisponível");
      return r.json();
    })) as { issuer: string; jwks_uri: string };
    if (metadata.issuer !== issuer || !metadata.jwks_uri.startsWith("https://"))
      throw new Error("OIDC discovery inválido.");
    jwks = createRemoteJWKSet(new URL(metadata.jwks_uri));
  }
  app.addHook("preHandler", async (request) => {
    const path = request.url.split("?")[0];
    if (
      path === "/api/health" ||
      (request.method === "GET" &&
        (path === "/api/catalog" || path?.startsWith("/api/catalog/")))
    )
      return;
    if (
      (request.method === "GET" || request.method === "PUT") &&
      /^\/api\/print\/address\/[A-Za-z0-9_-]{43}$/.test(path ?? "")
    )
      return;
    if (path?.startsWith("/api/webhooks/") || path?.startsWith("/api/auth/"))
      return; // Provider routes authenticate raw provider payloads themselves.
    if (dev) {
      const identity = request.headers["x-dev-user"];
      if (
        typeof identity !== "string" ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(identity)
      )
        throw new DomainError(
          "UNAUTHENTICATED",
          "Identidade de desenvolvimento ausente.",
          401,
        );
      request.userId = identity;
    } else {
      const cookie = request.headers.cookie
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("rpgbay_session="))
        ?.slice("rpgbay_session=".length);
      if (cookie && /^[A-Za-z0-9_-]{40,100}$/.test(cookie)) {
        const session = (
          await pool.query(
            "SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND expires_at>now() AND revoked_at IS NULL",
            [createHash("sha256").update(cookie).digest("hex")],
          )
        ).rows[0];
        if (session) {
          if (
            !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
            request.headers.origin !== process.env.WEB_ORIGIN
          )
            throw new DomainError("CSRF", "Origem inválida.", 403);
          request.userId = session.user_id;
          return;
        }
      }
      const authorization = request.headers.authorization;
      if (!authorization?.startsWith("Bearer ") || !jwks)
        throw new DomainError("UNAUTHENTICATED", "Sessão necessária.", 401);
      try {
        const { payload } = await jwtVerify(authorization.slice(7), jwks, {
          issuer,
          audience,
          algorithms: ["RS256", "ES256"],
        });
        if (!payload.sub) throw new Error("sub");
        request.userId = payload.sub;
      } catch {
        throw new DomainError(
          "UNAUTHENTICATED",
          "Sessão inválida ou expirada.",
          401,
        );
      }
    }
    await pool.query(
      "INSERT INTO users(id) VALUES($1) ON CONFLICT DO NOTHING",
      [request.userId],
    );
  });
}
