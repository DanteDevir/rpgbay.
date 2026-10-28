import test from "node:test";
import assert from "node:assert/strict";
import {
  allocate,
  priceOrder,
  partialRefund,
  appendLedger,
  payoutEligible,
  reservePayout,
  ratioRound,
} from "../packages/finance/index.js";
import { uploadIntent, validateBytes } from "../integrations/providers/r2.js";
import { AsaasProvider } from "../integrations/providers/payments.js";
import { OidcProvider, type OidcFlow } from "../integrations/providers/oidc.js";
import { createHash } from "node:crypto";
test("multi publisher exact 9% allocation, discounts and independent shipping", () => {
  const order = priceOrder(
    [
      { id: "b", publisherId: "p2", gross: 1001, production: 0 },
      { id: "a", publisherId: "p1", gross: 999, production: 0 },
    ],
    101,
    40,
    500,
  );
  assert.equal(order.total, 2399);
  assert.equal(order.commission, 171);
  assert.equal(
    order.lines.reduce((s, l) => s + l.discount, 0),
    101,
  );
  assert.equal(
    order.lines.reduce((s, l) => s + l.commission, 0),
    171,
  );
  assert.equal(
    order.lines.reduce((s, l) => s + l.publisherNet, 0) +
      order.commission +
      order.processingFee,
    1899,
  );
  assert.equal(order.policy.version, "proposed-1");
  assert.ok(Object.isFrozen(order.policy));
  assert.deepEqual(
    allocate(1, [
      { id: "b", weight: 1 },
      { id: "a", weight: 1 },
    ]),
    { a: 1, b: 0 },
  );
  assert.throws(() =>
    priceOrder(
      [{ id: "a", publisherId: "p", gross: 100, production: 101 }],
      0,
      0,
      0,
    ),
  );
  assert.throws(() => ratioRound(Number.MAX_SAFE_INTEGER, 10000, 1));
});
test("partial refunds cumulatively reverse exactly original commission", () => {
  const line = { paid: 101, commission: 9, processingFee: 3, production: 0 };
  let refunded = 0,
    commission = 0;
  for (let i = 0; i < 101; i++) {
    const r = partialRefund(line, refunded, 1);
    refunded++;
    commission += r.commission;
    assert.equal(r.processingFeeReversed, 0);
  }
  assert.equal(commission, 9);
  assert.throws(() => partialRefund(line, 101, 1));
});
test("ledger balanced immutable and idempotency cannot change payload", () => {
  const entry = {
    id: "1",
    reference: "provider:1",
    occurredAt: "2026-01-01T00:00:00Z",
    postings: [
      { account: "cash", debit: 100, credit: 0 },
      { account: "held", debit: 0, credit: 100 },
    ],
  };
  const entries = appendLedger([], entry);
  assert.ok(Object.isFrozen(entries[0]!.postings[0]));
  assert.equal(appendLedger(entries, entry), entries);
  assert.throws(() =>
    appendLedger(entries, { ...entry, reference: "different" }),
  );
  assert.throws(() =>
    appendLedger([], {
      ...entry,
      postings: [entry.postings[0]!, { account: "held", debit: 0, credit: 99 }],
    }),
  );
});
test("seven calendar days and actual provider availability, KYC, reserves prevent early or duplicate payout", () => {
  const payable = {
    id: "1",
    amount: 1000,
    paidAt: "2026-01-01T00:00:00Z",
    providerAvailableAt: "2026-01-10T00:00:00Z",
    reserved: 100,
    disputed: false,
    kycVerified: true,
  };
  assert.equal(payoutEligible(payable, new Date("2026-01-09")), 0);
  assert.equal(payoutEligible(payable, new Date("2026-01-10")), 900);
  assert.equal(
    payoutEligible({ ...payable, disputed: true }, new Date("2026-01-10")),
    0,
  );
  const held = reservePayout([payable], 900, new Date("2026-01-10"));
  assert.equal(held[0]!.reserved, 1000);
  assert.throws(() => reservePayout(held, 1, new Date("2026-01-10")));
});
const bytes = async function* (value: Uint8Array) {
  yield value.subarray(0, 3);
  yield value.subarray(3);
};
test("quarantine validates actual stream limit checksum MIME and dimensions", async () => {
  const pdf = Buffer.from("%PDF-1.7\nexample");
  const intent = uploadIntent({
    tenantId: "tenant",
    storageClass: "publishing",
    maxBytes: 100,
    declaredBytes: pdf.length,
    expectedSha256: createHash("sha256").update(pdf).digest("hex"),
    mime: "application/pdf",
  });
  assert.equal((await validateBytes(bytes(pdf), intent)).size, pdf.length);
  await assert.rejects(
    validateBytes(bytes(Buffer.concat([pdf, Buffer.from("extra")])), intent),
    /limit/,
  );
  await assert.rejects(
    validateBytes(bytes(pdf), { ...intent, expectedSha256: "0".repeat(64) }),
    /checksum/,
  );
  await assert.rejects(
    validateBytes(bytes(pdf), { ...intent, mime: "image/png" }),
    /MIME/,
  );
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  png.write("IHDR", 12);
  png.writeUInt32BE(50000, 16);
  png.writeUInt32BE(50000, 20);
  await assert.rejects(
    validateBytes(bytes(png), {
      ...intent,
      mime: "image/png",
      declaredBytes: 24,
      expectedSha256: createHash("sha256").update(png).digest("hex"),
    }),
    /dimensions/,
  );
});
test("Asaas webhook uses authentication and canonical status, never payload status", async () => {
  let calls = 0;
  const provider = new AsaasProvider(
    { apiKey: "local", webhookToken: "local-token", environment: "sandbox" },
    async (url) => {
      calls++;
      assert.equal(
        String(url),
        "https://api-sandbox.asaas.com/v3/payments/pay_test",
      );
      return new Response(
        JSON.stringify({
          id: "pay_test",
          status: "PENDING",
          externalReference: "order",
          billingType: "PIX",
          value: 10,
        }),
      );
    },
  );
  const payload = Buffer.from(
    JSON.stringify({
      id: "evt",
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_test",
        status: "RECEIVED",
        externalReference: "order",
      },
    }),
  );
  await assert.rejects(
    provider.verifyWebhook(payload, "invalid"),
    /authentication/,
  );
  assert.equal(calls, 0);
  assert.equal(
    (await provider.verifyWebhook(payload, "local-token")).payment.status,
    "PENDING",
  );
  assert.equal(calls, 1);
  assert.throws(
    () =>
      new AsaasProvider({
        apiKey: "x",
        webhookToken: "x",
        environment: "production",
      }),
    /explicit/,
  );
});
test("OIDC S256 nonce state expiry and one-time consumption before token exchange", async () => {
  const store = new Map<string, OidcFlow>();
  let tokenCalls = 0;
  const provider = new OidcProvider(
    {
      issuer: "https://identity.example",
      clientId: "client",
      redirectUri: "https://rpg.example/api/auth/callback",
    },
    {
      async save(flow) {
        store.set(flow.state, flow);
      },
      async consume(state) {
        const flow = store.get(state);
        store.delete(state);
        return flow ?? null;
      },
    },
    async (url) => {
      if (String(url).endsWith("openid-configuration"))
        return new Response(
          JSON.stringify({
            issuer: "https://identity.example",
            authorization_endpoint: "https://identity.example/authorize",
            token_endpoint: "https://identity.example/token",
            jwks_uri: "https://identity.example/keys",
          }),
        );
      tokenCalls++;
      return new Response("{}", { status: 400 });
    },
  );
  const flow = await provider.begin();
  const url = new URL(flow.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("nonce"), store.get(flow.state)!.nonce);
  await assert.rejects(
    provider.callback({ state: flow.state, code: "code", browserState: "bad" }),
    /state/,
  );
  assert.equal(tokenCalls, 0);
  await assert.rejects(
    provider.callback({
      state: flow.state,
      code: "code",
      browserState: flow.state,
    }),
    /exchange/,
  );
  assert.equal(tokenCalls, 1);
  await assert.rejects(
    provider.callback({
      state: flow.state,
      code: "code",
      browserState: flow.state,
    }),
    /replayed/,
  );
  assert.equal(tokenCalls, 1);
});
test("payout idempotency reuses reservation and rejects changing destination/amount", async () => {
  const { requestPayout } = await import("../packages/finance/index.js");
  const payable = {
    id: "1",
    amount: 1000,
    paidAt: "2026-01-01T00:00:00Z",
    providerAvailableAt: "2026-01-01T00:00:00Z",
    reserved: 0,
    disputed: false,
    kycVerified: true,
  };
  const input = {
    idempotencyKey: "payout-1",
    amount: 100,
    destinationId: "verified-wallet",
    destinationVerified: true,
    reauthenticated: true,
  };
  const state = requestPayout(
    { payables: [payable], requests: [] },
    input,
    new Date("2026-01-10"),
  );
  assert.equal(requestPayout(state, input, new Date("2026-01-10")), state);
  assert.equal(state.payables[0]!.reserved, 100);
  assert.throws(
    () =>
      requestPayout(state, { ...input, amount: 101 }, new Date("2026-01-10")),
    /idempotency/,
  );
  assert.throws(
    () =>
      requestPayout(
        state,
        { ...input, destinationVerified: false },
        new Date("2026-01-10"),
      ),
    /Verified/,
  );
});
test("OIDC successful signed callback enforces JWT issuer audience expiry and nonce", async () => {
  const { generateKeyPair, exportJWK, SignJWT } = await import("jose");
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = {
    ...(await exportJWK(publicKey)),
    kid: "local-test",
    alg: "RS256",
    use: "sig",
  };
  for (const invalid of [
    "none",
    "nonce",
    "audience",
    "issuer",
    "expired",
  ] as const) {
    const store = new Map<string, OidcFlow>();
    let active: OidcFlow;
    const provider = new OidcProvider(
      {
        issuer: "https://identity.example",
        clientId: "client",
        redirectUri: "https://rpg.example/api/auth/callback",
      },
      {
        async save(flow) {
          store.set(flow.state, flow);
          active = flow;
        },
        async consume(state) {
          const value = store.get(state);
          store.delete(state);
          return value ?? null;
        },
      },
      async (url) => {
        if (String(url).endsWith("openid-configuration"))
          return new Response(
            JSON.stringify({
              issuer: "https://identity.example",
              authorization_endpoint: "https://identity.example/authorize",
              token_endpoint: "https://identity.example/token",
              jwks_uri: "https://identity.example/keys",
            }),
          );
        if (String(url).endsWith("/keys"))
          return new Response(JSON.stringify({ keys: [jwk] }), {
            headers: { "Content-Type": "application/json" },
          });
        const id_token = await new SignJWT({
          nonce: invalid === "nonce" ? "bad" : active!.nonce,
        })
          .setProtectedHeader({ alg: "RS256", kid: "local-test" })
          .setSubject("user")
          .setIssuer(
            invalid === "issuer"
              ? "https://wrong.example"
              : "https://identity.example",
          )
          .setAudience(invalid === "audience" ? "another-client" : "client")
          .setIssuedAt()
          .setExpirationTime(
            invalid === "expired" ? Math.floor(Date.now() / 1000) - 1 : "5m",
          )
          .sign(privateKey);
        return new Response(
          JSON.stringify({
            id_token,
            access_token: "local-access-token",
            expires_in: 300,
          }),
        );
      },
    );
    const flow = await provider.begin();
    const result = provider.callback({
      state: flow.state,
      code: "local-code",
      browserState: flow.state,
    });
    if (invalid === "none") assert.equal((await result).claims.sub, "user");
    else await assert.rejects(result);
  }
});
