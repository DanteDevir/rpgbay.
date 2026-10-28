/** Optional CodeRabbit emulate v0.0.1 wire-transport verification. Never production. */
import test from "node:test";
import assert from "node:assert/strict";
import { homedir } from "node:os";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { StripeConnectProvider } from "../integrations/providers/payments.js";
import { R2Provider, uploadIntent } from "../integrations/providers/r2.js";
async function freePort() {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
test(
  "emulate v0.0.1 Stripe/S3 local transport and explicitly unsupported checkout semantics",
  { skip: process.env.RUN_EMULATOR_TESTS !== "true" },
  async (t) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    t.after(() => {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    });
    const modulePath =
      process.env.EMULATE_API_MODULE ??
      `${homedir()}/runtime/emulate/v0.0.1/dist/api.js`;
    const { createEmulator } = (await import(modulePath)) as {
      createEmulator: (options: {
        service: string;
        port: number;
        seed?: unknown;
      }) => Promise<{ url: string; close: () => Promise<void> }>;
    };
    let signedPaymentEvent = false;
    const receiver = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const event = stripe.verifyWebhook(
        Buffer.concat(chunks),
        String(req.headers["stripe-signature"]),
      );
      if (event.type === "payment_intent.succeeded") signedPaymentEvent = true;
      res.writeHead(200);
      res.end("{}");
    });
    await new Promise<void>((resolve) =>
      receiver.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () => new Promise<void>((resolve) => receiver.close(() => resolve())),
    );
    const address = receiver.address();
    if (!address || typeof address === "string")
      throw new Error("Webhook receiver unavailable");
    const stripeEmulator = await createEmulator({
      service: "stripe",
      port: await freePort(),
      seed: {
        stripe: {
          webhooks: [
            {
              url: `http://127.0.0.1:${address.port}/webhook`,
              events: ["*"],
              secret: "whsec_local_emulator_fixture",
            },
          ],
        },
      },
    });
    t.after(() => stripeEmulator.close());
    const stripe = new StripeConnectProvider({
      secretKey: "sk_test_local_emulator_fixture",
      webhookSecret: "whsec_local_emulator_fixture",
      apiOrigin: stripeEmulator.url,
    });
    await assert.rejects(
      stripe.createCheckout(
        {
          orderId: "local-order",
          amount: 1000,
          successUrl: "http://127.0.0.1/success",
          cancelUrl: "http://127.0.0.1/cancel",
        },
        "local-checkout-key",
      ),
      /price/,
    );
    const intent = await stripe.client.paymentIntents.create({
      amount: 1000,
      currency: "brl",
      metadata: { orderId: "local-order" },
    });
    await stripe.client.paymentIntents.confirm(intent.id);
    const canonical = await stripe.client.paymentIntents.retrieve(intent.id);
    assert.equal(canonical.status, "succeeded");
    assert.equal(signedPaymentEvent, true);
    // Important emulator limitation: do not weaken the production amount_received check to pass.
    assert.equal(canonical.amount_received, undefined);
    const aws = await createEmulator({
      service: "aws",
      port: await freePort(),
    });
    t.after(() => aws.close());
    const storage = new R2Provider({
      accountId: "f".repeat(32),
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      localEndpoint: aws.url,
      buckets: {
        public: "local-public",
        user: "local-user",
        library: "local-library",
        publishing: "local-publishing",
        backups: "local-backups",
      },
    });
    for (const Bucket of [
      "local-public",
      "local-user",
      "local-library",
      "local-publishing",
      "local-backups",
    ])
      await storage.client.send(new CreateBucketCommand({ Bucket }));
    const data = Buffer.from("%PDF-1.7\nlocal synthetic transport fixture");
    const upload = uploadIntent({
      tenantId: "local-test",
      storageClass: "publishing",
      maxBytes: 1000,
      declaredBytes: data.length,
      mime: "application/pdf",
      expectedSha256: createHash("sha256").update(data).digest("hex"),
    });
    await storage.putQuarantine(upload, Readable.from([data]));
    const object = await storage.download("publishing", upload.key);
    assert.ok(object.Body);
    assert.deepEqual(
      Buffer.from(await object.Body!.transformToByteArray()),
      data,
    );
  },
);
