import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { installProviderRoutes } from "../apps/api/src/provider-routes.js";
import { StripeConnectProvider } from "../integrations/providers/payments.js";
const database = process.env.TEST_DATABASE_URL;
if (
  database &&
  !/^[a-zA-Z0-9_-]+_test$/.test(new URL(database).pathname.slice(1))
)
  throw new Error(
    "TEST_DATABASE_URL must use a dedicated database ending in _test.",
  );
test(
  "real PostgreSQL webhook transaction validates signatures amounts deduplicates and freezes ledger",
  { skip: !database },
  async (t) => {
    const admin = new pg.Pool({ connectionString: database });
    const schema = `provider_test_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({
      connectionString: database,
      options: `-c search_path=${schema}`,
    });
    const app = Fastify({ logger: false });
    t.after(async () => {
      await app.close();
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    for (const file of [
      "001_core.sql",
      "002_providers.sql",
      "006_print_uploads.sql",
      "007_paid_gifts.sql",
      "008_payment_binding.sql",
    ])
      await pool.query(
        await readFile(
          new URL(`../infra/migrations/${file}`, import.meta.url),
          "utf8",
        ),
      );
    const stripe = new StripeConnectProvider({
      secretKey: "sk_test_local_fixture_only",
      webhookSecret: "whsec_local_fixture_only",
    });
    const canonical = {
      id: "pi_local_test",
      status: "succeeded",
      currency: "brl",
      amount_received: 999,
      metadata: { orderId: "" },
    };
    stripe.client.paymentIntents.retrieve = (async () =>
      canonical) as unknown as typeof stripe.client.paymentIntents.retrieve;
    await installProviderRoutes(app, pool, { stripe });
    await app.ready();
    const user = `provider_test_${randomUUID()}`,
      product = randomUUID(),
      order = randomUUID();
    await pool.query("INSERT INTO users(id) VALUES($1)", [user]);
    await pool.query(
      "INSERT INTO products(id,title,price_cents) VALUES($1,'Synthetic webhook delivery',1000)",
      [product],
    );
    await pool.query(
      "INSERT INTO payment_orders(id,user_id,provider,idempotency_key,total_cents,snapshot,state) VALUES($1,$2,'stripe',$3,1000,$4,'pending')",
      [
        order,
        user,
        randomUUID(),
        {
          commission: 90,
          lines: [
            {
              id: product,
              publisherId: "synthetic-publisher",
              publisherNet: 910,
            },
          ],
        },
      ],
    );
    canonical.metadata.orderId = order;
    const payload = JSON.stringify({
      id: "evt_" + randomUUID(),
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_local_test" } },
    });
    const signature = stripe.client.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_local_fixture_only",
    });
    const send = (sig = signature) =>
      app.inject({
        method: "POST",
        url: "/api/webhooks/stripe",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": sig,
        },
        payload,
      });
    assert.equal((await send("invalid")).statusCode, 400);
    assert.equal((await send()).statusCode, 500);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM entitlements WHERE user_id=$1",
          [user],
        )
      ).rows[0].n,
      0,
    );
    canonical.amount_received = 1000;
    assert.equal((await send()).statusCode, 200);
    assert.equal((await send()).statusCode, 200);
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM entitlements WHERE user_id=$1",
          [user],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM financial_ledger WHERE order_id=$1",
          [order],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await pool.query("SELECT state FROM payment_orders WHERE id=$1", [
          order,
        ])
      ).rows[0].state,
      "paid",
    );
    const gift = randomUUID(),
      giftOrder = randomUUID();
    await pool.query(
      "INSERT INTO gifts(id,sender_id,product_id,secret_hash,expires_at,state) VALUES($1,$2,$3,$4,now()+interval '1 day','pending_payment')",
      [gift, user, product, randomUUID()],
    );
    await pool.query(
      "INSERT INTO payment_orders(id,user_id,provider,idempotency_key,total_cents,snapshot,gift_id,state) VALUES($1,$2,'stripe',$3,1000,$4,$5,'pending')",
      [
        giftOrder,
        user,
        randomUUID(),
        {
          giftId: gift,
          commission: 90,
          lines: [
            {
              id: product,
              publisherId: "synthetic-publisher",
              publisherNet: 910,
            },
          ],
        },
        gift,
      ],
    );
    canonical.metadata.orderId = giftOrder;
    canonical.id = "pi_local_gift";
    const giftPayload = JSON.stringify({
      id: "evt_" + randomUUID(),
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_local_gift" } },
    });
    const giftSignature = stripe.client.webhooks.generateTestHeaderString({
      payload: giftPayload,
      secret: "whsec_local_fixture_only",
    });
    const giftSend = () =>
      app.inject({
        method: "POST",
        url: "/api/webhooks/stripe",
        headers: {
          "Content-Type": "application/json",
          "stripe-signature": giftSignature,
        },
        payload: giftPayload,
      });
    assert.equal((await giftSend()).statusCode, 200);
    assert.equal((await giftSend()).statusCode, 200);
    assert.equal(
      (await pool.query("SELECT state FROM gifts WHERE id=$1", [gift])).rows[0]
        .state,
      "ready",
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM entitlements WHERE source_reference=$1",
          [giftOrder],
        )
      ).rows[0].n,
      0,
    );
    await assert.rejects(
      pool.query(
        "INSERT INTO payment_orders(id,user_id,provider,idempotency_key,total_cents,snapshot,gift_id) VALUES($1,$2,'stripe',$3,1000,$4,$5)",
        [randomUUID(), user, randomUUID(), {}, gift],
      ),
      /unique/,
    );
    await assert.rejects(
      pool.query("UPDATE financial_ledger SET reference=$2 WHERE order_id=$1", [
        order,
        "tampered",
      ]),
      /immutable/,
    );
  },
);
