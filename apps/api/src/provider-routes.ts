import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  OidcProvider,
  StripeConnectProvider,
  AsaasProvider,
  type OidcFlow,
} from "../../../integrations/providers/index.js";
import { priceOrder } from "../../../packages/finance/index.js";
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const cookieValue = (header: string | undefined, name: string) =>
  header
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? "";
function unavailable(
  reply: { code: (status: number) => { send: (body: unknown) => unknown } },
  message: string,
) {
  return reply
    .code(503)
    .send({ error: { code: "PROVIDER_NOT_CONFIGURED", message } });
}
export async function installProviderRoutes(
  app: FastifyInstance,
  pool: Pool,
  dependencies: { stripe?: StripeConnectProvider; asaas?: AsaasProvider } = {},
) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = (name: string, value: string, maxAge: number) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  let oidc: OidcProvider | undefined;
  if (
    process.env.OIDC_ISSUER &&
    process.env.OIDC_CLIENT_ID &&
    process.env.OIDC_REDIRECT_URI
  )
    oidc = new OidcProvider(
      {
        issuer: process.env.OIDC_ISSUER,
        clientId: process.env.OIDC_CLIENT_ID,
        redirectUri: process.env.OIDC_REDIRECT_URI,
        ...(process.env.OIDC_CLIENT_SECRET
          ? { clientSecret: process.env.OIDC_CLIENT_SECRET }
          : {}),
      },
      {
        async save(flow) {
          await pool.query(
            "INSERT INTO oidc_flows(state,flow,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
            [flow.state, flow],
          );
        },
        async consume(state) {
          const result = await pool.query(
            "DELETE FROM oidc_flows WHERE state=$1 AND expires_at>now() RETURNING flow",
            [state],
          );
          return (result.rows[0]?.flow as OidcFlow) ?? null;
        },
      },
    );
  let stripe: StripeConnectProvider | undefined = dependencies.stripe;
  if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
    stripe = new StripeConnectProvider({
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      liveAllowed: process.env.PAYMENTS_LIVE_ALLOWED === "true",
      ...(process.env.STRIPE_API_ORIGIN
        ? { apiOrigin: process.env.STRIPE_API_ORIGIN }
        : {}),
    });
  let asaas: AsaasProvider | undefined = dependencies.asaas;
  if (process.env.ASAAS_API_KEY && process.env.ASAAS_WEBHOOK_TOKEN)
    asaas = new AsaasProvider({
      apiKey: process.env.ASAAS_API_KEY,
      webhookToken: process.env.ASAAS_WEBHOOK_TOKEN,
      environment:
        process.env.ASAAS_ENVIRONMENT === "production"
          ? "production"
          : "sandbox",
      liveAllowed: process.env.PAYMENTS_LIVE_ALLOWED === "true",
    });
  app.get("/api/auth/login", async (_request, reply) => {
    if (!oidc)
      return unavailable(
        reply,
        "Configure o issuer NAJA ID/Zitadel e o cliente OIDC.",
      );
    const flow = await oidc.begin();
    return reply
      .header("Set-Cookie", cookie("rpgbay_oidc_state", flow.state, 600))
      .redirect(flow.authorizationUrl);
  });
  app.get("/api/auth/callback", async (request, reply) => {
    if (!oidc) return unavailable(reply, "OIDC não configurado.");
    const q = z
      .object({
        state: z.string().min(20).max(200),
        code: z.string().min(1).max(4096),
      })
      .parse(request.query);
    const result = await oidc.callback({
      ...q,
      browserState: cookieValue(request.headers.cookie, "rpgbay_oidc_state"),
    });
    const userId = String(result.claims.sub);
    const token = randomBytes(32).toString("base64url");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO users(id,display_name) VALUES($1,$2) ON CONFLICT(id) DO NOTHING",
        [
          userId,
          typeof result.claims.name === "string"
            ? result.claims.name.slice(0, 100)
            : "Jogador",
        ],
      );
      await client.query(
        "INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",
        [digest(token), userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return reply
      .header("Set-Cookie", [
        cookie("rpgbay_session", token, 43200),
        cookie("rpgbay_oidc_state", "", 0),
      ])
      .redirect(process.env.WEB_ORIGIN ?? "http://localhost:5173");
  });
  app.post("/api/auth/logout", async (request, reply) => {
    // Origin validation applies even though auth endpoints are publicly reachable.
    const origin = request.headers.origin;
    if (origin !== (process.env.WEB_ORIGIN ?? "http://localhost:5173"))
      return reply
        .code(403)
        .send({ error: { code: "CSRF", message: "Origem inválida." } });
    const token = cookieValue(request.headers.cookie, "rpgbay_session");
    if (token)
      await pool.query(
        "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1",
        [digest(token)],
      );
    return reply
      .header("Set-Cookie", cookie("rpgbay_session", "", 0))
      .send({ loggedOut: true, scope: "RPG BAY local session" });
  });
  app.post("/api/payments/checkout", async (request, reply) => {
    const body = z
      .object({
        provider: z.enum(["stripe", "asaas"]),
        productIds: z.array(z.string().uuid()).min(1).max(30),
        idempotencyKey: z.string().min(16).max(128),
        giftId: z.string().uuid().optional(),
      })
      .parse(request.body);
    if (
      (body.provider === "stripe" && !stripe) ||
      (body.provider === "asaas" && !asaas)
    )
      return unavailable(
        reply,
        "Configure o processador em sandbox e onboarding comercial.",
      );
    if (new Set(body.productIds).size !== body.productIds.length)
      return reply
        .code(400)
        .send({
          error: { code: "DUPLICATE_PRODUCT", message: "Produto duplicado." },
        });
    const client = await pool.connect();
    let orderId = "";
    let snapshot: ReturnType<typeof priceOrder> & { giftId?: string };
    let accounts: Record<string, string> = {};
    try {
      await client.query("BEGIN");
      const previous = await client.query(
        "SELECT * FROM payment_orders WHERE user_id=$1 AND idempotency_key=$2",
        [request.userId, body.idempotencyKey],
      );
      if (previous.rows[0]) {
        const row = previous.rows[0];
        await client.query("COMMIT");
        if (
          row.provider !== body.provider ||
          row.snapshot.giftId !== body.giftId ||
          JSON.stringify(
            [
              ...row.snapshot.lines.map((line: { id: string }) => line.id),
            ].sort(),
          ) !== JSON.stringify([...body.productIds].sort())
        )
          return reply
            .code(409)
            .send({
              error: {
                code: "IDEMPOTENCY_MISMATCH",
                message: "A chave pertence a outro pedido.",
              },
            });
        return reply.send({
          orderId: row.id,
          state: row.state,
          checkoutUrl: row.checkout_url,
        });
      }
      if (body.giftId) {
        const gift = (
          await client.query(
            "SELECT * FROM gifts WHERE id=$1 AND sender_id=$2 AND state='pending_payment' AND expires_at>now() FOR UPDATE",
            [body.giftId, request.userId],
          )
        ).rows[0];
        if (
          !gift ||
          body.productIds.length !== 1 ||
          body.productIds[0] !== gift.product_id
        ) {
          await client.query("ROLLBACK");
          return reply
            .code(409)
            .send({
              error: "Gift is absent, expired or does not match checkout",
            });
        }
      }
      const products = await client.query(
        "SELECT p.*,a.stripe_account_id,a.asaas_wallet_id,a.verified_at FROM products p LEFT JOIN publisher_payment_accounts a ON a.publisher_id=p.publisher_id WHERE p.id=ANY($1::uuid[]) AND p.status='published' AND EXISTS(SELECT 1 FROM product_versions v WHERE v.product_id=p.id AND v.validated_at IS NOT NULL) FOR SHARE OF p",
        [body.productIds],
      );
      if (products.rowCount !== body.productIds.length)
        throw new Error("Unavailable product or missing validated delivery");
      if (
        products.rows.some(
          (p) =>
            !p.publisher_id ||
            !p.verified_at ||
            !(body.provider === "stripe"
              ? p.stripe_account_id
              : p.asaas_wallet_id),
        )
      )
        return await (async () => {
          await client.query("ROLLBACK");
          return unavailable(
            reply,
            "Editora precisa de conta de marketplace verificada.",
          );
        })();
      snapshot = {
        ...priceOrder(
          products.rows.map((p) => ({
            id: p.id,
            publisherId: p.publisher_id,
            gross: p.price_cents,
            production: 0,
          })),
          0,
          0,
          0,
        ),
        ...(body.giftId ? { giftId: body.giftId } : {}),
      };
      accounts = Object.fromEntries(
        products.rows.map((p) => [
          p.publisher_id,
          body.provider === "stripe" ? p.stripe_account_id : p.asaas_wallet_id,
        ]),
      );
      orderId = randomUUID();
      await client.query(
        "INSERT INTO payment_orders(id,user_id,provider,idempotency_key,total_cents,snapshot,gift_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          orderId,
          request.userId,
          body.provider,
          body.idempotencyKey,
          snapshot.total,
          snapshot,
          body.giftId ?? null,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    try {
      const origin = process.env.WEB_ORIGIN ?? "http://localhost:5173";
      let externalId: string;
      let checkoutUrl: string | null = null;
      let pix: unknown;
      if (body.provider === "stripe") {
        const session = await stripe!.createCheckout(
          {
            orderId,
            amount: snapshot.total,
            successUrl: `${origin}/?checkout=processing`,
            cancelUrl: `${origin}/?checkout=cancelled`,
          },
          orderId,
        );
        externalId = session.id;
        checkoutUrl = session.url;
      } else {
        // Customer identifiers are server-bound to the logged-in buyer, never trusted from a request.
        const customer = await pool.query(
          "SELECT asaas_customer_id FROM customer_payment_accounts WHERE user_id=$1",
          [request.userId],
        );
        if (!customer.rows[0]?.asaas_customer_id)
          throw new Error("Buyer requires Asaas customer onboarding");
        const grouped = new Map<string, number>();
        for (const line of snapshot.lines)
          grouped.set(
            line.publisherId,
            (grouped.get(line.publisherId) ?? 0) + line.publisherNet,
          );
        const payment = await asaas!.createPix({
          customerId: customer.rows[0].asaas_customer_id,
          amount: snapshot.total,
          dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
          orderId,
          splits: [...grouped].map(([publisherId, fixedCents]) => ({
            walletId: accounts[publisherId]!,
            fixedCents,
          })),
        });
        externalId = payment.id;
        await pool.query(
          "UPDATE payment_orders SET state=CASE WHEN state='creating' THEN 'pending' ELSE state END,external_id=$2 WHERE id=$1",
          [orderId, externalId],
        );
        pix = await asaas!.pixQr(payment.id);
      }
      await pool.query(
        "UPDATE payment_orders SET state=CASE WHEN state='creating' THEN 'pending' ELSE state END,external_id=$2,checkout_url=$3 WHERE id=$1",
        [orderId, externalId, checkoutUrl],
      );
      return {
        orderId,
        state: "pending",
        checkoutUrl,
        ...(pix ? { pix } : {}),
      };
    } catch (error) {
      await pool.query(
        "UPDATE payment_orders SET state=CASE WHEN state='creating' THEN 'requires_reconciliation' ELSE state END WHERE id=$1",
        [orderId],
      );
      throw error;
    }
  });
  app.get("/api/payments/orders/:id", async (request, reply) => {
    const id = z
      .string()
      .uuid()
      .parse((request.params as { id: string }).id);
    const order = (
      await pool.query(
        "SELECT id,provider,state,total_cents,checkout_url,external_id FROM payment_orders WHERE id=$1 AND user_id=$2",
        [id, request.userId],
      )
    ).rows[0];
    if (!order) return reply.code(404).send({ error: "Order not found" });
    let pix: unknown;
    if (
      order.provider === "asaas" &&
      order.state === "pending" &&
      order.external_id &&
      asaas
    )
      pix = await asaas.pixQr(order.external_id);
    return {
      orderId: order.id,
      provider: order.provider,
      state: order.state,
      totalCents: order.total_cents,
      checkoutUrl: order.checkout_url,
      ...(pix ? { pix } : {}),
    };
  });
  await app.register(async (webhooks) => {
    webhooks.removeContentTypeParser("application/json");
    webhooks.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );
    webhooks.post("/api/webhooks/stripe", async (request, reply) => {
      if (!stripe) return unavailable(reply, "Stripe não configurado.");
      let event;
      try {
        event = stripe.verifyWebhook(
          request.body as Buffer,
          String(request.headers["stripe-signature"] ?? ""),
        );
      } catch {
        return reply.code(400).send({ error: "Invalid webhook" });
      }
      if (event.type !== "payment_intent.succeeded")
        return { received: true, handled: false };
      const expectedId = (event.data.object as { id: string }).id;
      const payment = await stripe.client.paymentIntents.retrieve(expectedId);
      if (
        payment.id !== expectedId ||
        payment.status !== "succeeded" ||
        payment.currency !== "brl"
      )
        return reply.code(400).send({ error: "Invalid payment state" });
      await confirmPayment(
        pool,
        "stripe",
        event.id,
        payment.metadata.orderId ?? "",
        payment.amount_received,
        payment.id,
      );
      return { received: true };
    });
    webhooks.post("/api/webhooks/asaas", async (request, reply) => {
      if (!asaas) return unavailable(reply, "Asaas não configurado.");
      let event;
      try {
        event = await asaas.verifyWebhook(
          request.body as Buffer,
          String(request.headers["asaas-access-token"] ?? ""),
        );
      } catch {
        return reply.code(400).send({ error: "Invalid webhook" });
      }
      if (!["RECEIVED", "CONFIRMED"].includes(event.payment.status))
        return { received: true, handled: false };
      const amount = Math.round(event.payment.value * 100);
      if (
        typeof event.payment.value !== "number" ||
        !Number.isFinite(event.payment.value) ||
        event.payment.value <= 0 ||
        Math.abs(event.payment.value * 100 - amount) > 1e-7 ||
        !Number.isSafeInteger(amount) ||
        event.payment.billingType !== "PIX"
      )
        return reply.code(400).send({ error: "Invalid amount" });
      await confirmPayment(
        pool,
        "asaas",
        event.id,
        event.payment.externalReference ?? "",
        amount,
        event.payment.id,
      );
      return { received: true };
    });
  });
}
async function confirmPayment(
  pool: Pool,
  provider: string,
  eventId: string,
  orderId: string,
  amount: number,
  paymentId: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = (
      await client.query(
        "SELECT * FROM payment_orders WHERE id=$1 AND provider=$2 FOR UPDATE",
        [orderId, provider],
      )
    ).rows[0];
    if (
      !order ||
      order.total_cents !== amount ||
      !paymentId ||
      (order.provider_payment_id && order.provider_payment_id !== paymentId) ||
      (provider === "asaas" &&
        order.external_id &&
        order.external_id !== paymentId)
    )
      throw new Error("Payment does not match order");
    if (!order.provider_payment_id)
      await client.query(
        "UPDATE payment_orders SET provider_payment_id=$2 WHERE id=$1",
        [orderId, paymentId],
      );
    const inserted = await client.query(
      "INSERT INTO payment_events(provider,event_id,order_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id",
      [provider, eventId, orderId],
    );
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return;
    }
    if (
      !["creating", "pending", "requires_reconciliation", "paid"].includes(
        order.state,
      )
    )
      throw new Error("Payment requires manual reconciliation");
    if (order.state !== "paid") {
      await client.query(
        "UPDATE payment_orders SET state='paid',paid_at=now() WHERE id=$1",
        [orderId],
      );
      if (order.snapshot.giftId) {
        const gift = await client.query(
          "UPDATE gifts SET state='ready' WHERE id=$1 AND sender_id=$2 AND state='pending_payment' RETURNING id",
          [order.snapshot.giftId, order.user_id],
        );
        if (!gift.rowCount)
          throw new Error("Gift state requires reconciliation");
      } else
        for (const line of order.snapshot.lines) {
          await client.query(
            "INSERT INTO entitlements(id,user_id,product_id,source,source_reference) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [randomUUID(), order.user_id, line.id, provider, orderId],
          );
        }
      const postings = [
        { account: `processor:${provider}`, debit: amount, credit: 0 },
        {
          account: "platform:commission",
          debit: 0,
          credit: order.snapshot.commission,
        },
        ...order.snapshot.lines
          .filter((line: { publisherNet: number }) => line.publisherNet > 0)
          .map((line: { publisherId: string; publisherNet: number }) => ({
            account: `publisher:${line.publisherId}:held`,
            debit: 0,
            credit: line.publisherNet,
          })),
      ].filter((p) => p.debit || p.credit);
      await client.query(
        "INSERT INTO financial_ledger(id,order_id,reference,postings) VALUES($1,$2,$3,$4)",
        [
          randomUUID(),
          orderId,
          `payment:${provider}:${orderId}`,
          JSON.stringify(postings),
        ],
      );
      await client.query(
        "INSERT INTO achievements(user_id,code,source_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
        [order.user_id, "first_book_purchased", orderId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
