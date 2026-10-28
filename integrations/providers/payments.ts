import { timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { cents } from "../../packages/finance/index.js";
export class StripeConnectProvider {
  readonly client: Stripe;
  constructor(config: {
    secretKey: string;
    webhookSecret: string;
    liveAllowed?: boolean;
    apiOrigin?: string;
  }) {
    if (!config.secretKey || !config.webhookSecret)
      throw new Error("Stripe configuration missing");
    if (!config.liveAllowed && !config.secretKey.startsWith("sk_test_"))
      throw new Error("Stripe live operations require explicit configuration");
    let localOptions:
      { host: string; port: number; protocol: "http" } | undefined;
    if (config.apiOrigin) {
      const url = new URL(config.apiOrigin);
      if (
        !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
        !config.secretKey.startsWith("sk_test_") ||
        url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error(
          "Stripe local emulator endpoint is allowed only in isolated development/test",
        );
      localOptions = {
        host: url.hostname,
        port: Number(url.port || 80),
        protocol: "http",
      };
    }
    this.client = new Stripe(config.secretKey, {
      maxNetworkRetries: 2,
      timeout: 20000,
      ...localOptions,
    });
    this.webhookSecret = config.webhookSecret;
  }
  private webhookSecret: string;
  verifyWebhook(rawBody: Buffer, signature: string): Stripe.Event {
    return this.client.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
      300,
    );
  }
  createCheckout(
    input: {
      orderId: string;
      amount: number;
      successUrl: string;
      cancelUrl: string;
      customerId?: string;
    },
    idempotencyKey: string,
  ) {
    cents(input.amount);
    if (!input.amount || !idempotencyKey || !input.orderId)
      throw new Error("Invalid checkout");
    return this.client.checkout.sessions.create(
      {
        mode: "payment",
        ...(input.customerId ? { customer: input.customerId } : {}),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.orderId,
        line_items: [
          {
            price_data: {
              currency: "brl",
              unit_amount: input.amount,
              product_data: { name: `Pedido RPG BAY ${input.orderId}` },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          transfer_group: input.orderId,
          metadata: { orderId: input.orderId },
        },
      },
      { idempotencyKey },
    );
  }
  async onboard(accountId: string, refreshUrl: string, returnUrl: string) {
    return this.client.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
  }
  async transfer(
    input: {
      connectedAccountId: string;
      amount: number;
      orderId: string;
      sourceCharge: string;
    },
    idempotencyKey: string,
  ) {
    cents(input.amount);
    if (!input.amount || !idempotencyKey) throw new Error("Invalid transfer");
    const account = await this.client.accounts.retrieve(
      input.connectedAccountId,
    );
    if (
      !account.payouts_enabled ||
      account.capabilities?.transfers !== "active"
    )
      throw new Error("Connected account not eligible");
    return this.client.transfers.create(
      {
        amount: input.amount,
        currency: "brl",
        destination: input.connectedAccountId,
        source_transaction: input.sourceCharge,
        transfer_group: input.orderId,
      },
      { idempotencyKey },
    );
  }
  refund(paymentIntent: string, amount: number, idempotencyKey: string) {
    cents(amount);
    if (!amount || !idempotencyKey) throw new Error("Invalid refund");
    return this.client.refunds.create(
      { payment_intent: paymentIntent, amount },
      { idempotencyKey },
    );
  }
}
export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  externalReference?: string;
  billingType: string;
}
export class AsaasProvider {
  constructor(
    private config: {
      apiKey: string;
      webhookToken: string;
      environment: "sandbox" | "production";
      liveAllowed?: boolean;
    },
    private request: typeof fetch = fetch,
  ) {
    if (
      !config.apiKey ||
      !config.webhookToken ||
      !["sandbox", "production"].includes(config.environment)
    )
      throw new Error("Asaas configuration missing");
    if (config.environment === "production" && !config.liveAllowed)
      throw new Error("Asaas live operations require explicit configuration");
  }
  private async api<T>(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<T> {
    const base =
      this.config.environment === "sandbox"
        ? "https://api-sandbox.asaas.com/v3"
        : "https://api.asaas.com/v3";
    const response = await this.request(`${base}${path}`, {
      method,
      headers: {
        access_token: this.config.apiKey,
        "Content-Type": "application/json",
        "User-Agent": "RPG-BAY/1.0",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
      redirect: "error",
    });
    if (!response.ok)
      throw new Error(`Asaas operation failed (${response.status})`);
    return (await response.json()) as T;
  }
  createPix(input: {
    customerId: string;
    amount: number;
    dueDate: string;
    orderId: string;
    splits: readonly { walletId: string; fixedCents: number }[];
  }) {
    cents(input.amount);
    if (
      !input.amount ||
      !input.customerId ||
      !input.orderId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
    )
      throw new Error("Invalid Pix payment");
    const splitTotal = input.splits.reduce(
      (sum, split) => sum + cents(split.fixedCents),
      0,
    );
    if (splitTotal > input.amount) throw new Error("Split exceeds gross value");
    // A database pending-operation key must prevent retrying POST after ambiguous transport failure.
    return this.api<AsaasPayment>("/payments", "POST", {
      customer: input.customerId,
      billingType: "PIX",
      value: input.amount / 100,
      dueDate: input.dueDate,
      externalReference: input.orderId,
      split: input.splits.map((split) => ({
        walletId: split.walletId,
        fixedValue: split.fixedCents / 100,
      })),
    });
  }
  getPayment(id: string) {
    return this.api<AsaasPayment>(`/payments/${encodeURIComponent(id)}`);
  }
  pixQr(id: string) {
    return this.api<{
      encodedImage: string;
      payload: string;
      expirationDate: string;
    }>(`/payments/${encodeURIComponent(id)}/pixQrCode`);
  }
  refund(id: string, amount: number) {
    cents(amount);
    if (!amount) throw new Error("Invalid refund");
    return this.api(`/payments/${encodeURIComponent(id)}/refund`, "POST", {
      value: amount / 100,
    });
  }
  async verifyWebhook(
    rawBody: Buffer,
    authenticationToken: string,
  ): Promise<{ id: string; event: string; payment: AsaasPayment }> {
    const expected = Buffer.from(this.config.webhookToken),
      received = Buffer.from(authenticationToken);
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    )
      throw new Error("Asaas webhook authentication failed");
    if (rawBody.length > 1048576) throw new Error("Webhook too large");
    const event = JSON.parse(rawBody.toString("utf8")) as {
      id: string;
      event: string;
      payment: AsaasPayment;
    };
    if (!event.id || !event.event || !event.payment?.id)
      throw new Error("Malformed Asaas event");
    const current = await this.getPayment(event.payment.id);
    if (
      current.id !== event.payment.id ||
      current.externalReference !== event.payment.externalReference
    )
      throw new Error("Asaas payment reference mismatch");
    return { ...event, payment: current }; // Never authorize from stale webhook status alone.
  }
}
