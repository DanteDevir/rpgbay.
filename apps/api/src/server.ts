import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { DomainError } from "../../../packages/domain/src/index.js";
import { makePool } from "./db.js";
import { installAuth } from "./auth.js";
import { installRoutes } from "./routes.js";
import { installProviderRoutes } from "./provider-routes.js";
import { installStorageRoutes } from "./storage-routes.js";
import { validateConfig } from "./config.js";
import { installPrintPrivateRoutes } from "./print-private.js";
export async function createApp(
  options: { pool?: Pool; logger?: boolean } = {},
) {
  validateConfig();
  const pool = options.pool ?? makePool();
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 256 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true",
    disableRequestLogging: true,
  });
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "private, no-store");
    return payload;
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError)
      return reply
        .code(error.status)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({
          error: {
            code: "VALIDATION",
            message: "Dados inválidos.",
            fields: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
        });
    const dbCode = (error as { code?: string }).code;
    if (dbCode === "23505")
      return reply
        .code(409)
        .send({
          error: {
            code: "CONFLICT",
            message: "O registro já existe ou convite já utilizado.",
          },
        });
    if (dbCode === "22P02" || dbCode === "23503")
      return reply
        .code(400)
        .send({
          error: {
            code: "INVALID_REFERENCE",
            message: "Identificador ou referência inválida.",
          },
        });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500)
      return reply
        .code(statusCode)
        .send({
          error: {
            code: "REQUEST_REJECTED",
            message: "Solicitação rejeitada.",
          },
        });
    app.log.error({ code: dbCode, requestId: _request.id }, "Request failed");
    return reply
      .code(500)
      .send({
        error: {
          code: "INTERNAL",
          message:
            "Não foi possível concluir. Use o identificador da solicitação no suporte.",
        },
        requestId: _request.id,
      });
  });
  await installAuth(app, pool);
  installRoutes(app, pool);
  installPrintPrivateRoutes(app, pool);
  await installProviderRoutes(app, pool);
  await installStorageRoutes(app, pool);
  app.addHook("onClose", async () => {
    if (!options.pool) await pool.end();
  });
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const app = await createApp();
  await app.listen({
    host: process.env.HOST ?? "0.0.0.0",
    port: Number(process.env.PORT ?? 3001),
  });
  const close = () => {
    void app.close();
  };
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
}
