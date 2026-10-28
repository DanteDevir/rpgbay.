/** Money is always BRL integer centavos. No provider call belongs to this domain. */
export type Money = number;
export function cents(value: number): Money {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid nonnegative integer centavos");
  return value;
}
const checked = (value: bigint) => cents(Number(value));
export function ratioRound(
  amount: Money,
  numerator: number,
  denominator: number,
): Money {
  cents(amount);
  cents(numerator);
  cents(denominator);
  if (!denominator) throw new Error("Zero denominator");
  return checked(
    (BigInt(amount) * BigInt(numerator) * 2n + BigInt(denominator)) /
      (2n * BigInt(denominator)),
  );
}
/** Largest remainder, ties resolved by stable lexical id, never floating point. */
export function allocate(
  amount: Money,
  weights: readonly { id: string; weight: number }[],
): Record<string, Money> {
  cents(amount);
  if (new Set(weights.map((w) => w.id)).size !== weights.length)
    throw new Error("Duplicate allocation id");
  const total = weights.reduce((s, w) => s + BigInt(cents(w.weight)), 0n);
  if (!total) {
    if (amount) throw new Error("No allocation weight");
    return Object.fromEntries(weights.map((w) => [w.id, 0]));
  }
  const rows = weights.map((w) => ({
    id: w.id,
    value: (BigInt(amount) * BigInt(w.weight)) / total,
    remainder: (BigInt(amount) * BigInt(w.weight)) % total,
  }));
  let remaining = BigInt(amount) - rows.reduce((s, r) => s + r.value, 0n);
  rows.sort((a, b) =>
    a.remainder === b.remainder
      ? a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const row of rows)
    if (remaining > 0n) {
      row.value++;
      remaining--;
    }
  return Object.fromEntries(rows.map((r) => [r.id, checked(r.value)]));
}
export interface SaleLine {
  id: string;
  publisherId: string;
  gross: Money;
  production: Money;
}
export interface Policy {
  version: string;
  commissionBps: number;
  feeBearer: "platform" | "publisher";
}
export const PROPOSED_POLICY: Readonly<Policy> = Object.freeze({
  version: "proposed-1",
  commissionBps: 900,
  feeBearer: "publisher",
});
export function priceOrder(
  lines: readonly SaleLine[],
  discount: Money,
  processingFee: Money,
  shipping: Money,
  policy: Policy = PROPOSED_POLICY,
) {
  if (!lines.length || new Set(lines.map((l) => l.id)).size !== lines.length)
    throw new Error("Invalid sale lines");
  if (
    !policy.version ||
    !Number.isSafeInteger(policy.commissionBps) ||
    policy.commissionBps < 0 ||
    policy.commissionBps > 10000
  )
    throw new Error("Invalid policy");
  const gross = lines.reduce(
    (s, l) => checked(BigInt(s) + BigInt(cents(l.gross))),
    0,
  );
  cents(discount);
  cents(processingFee);
  cents(shipping);
  if (discount > gross) throw new Error("Discount exceeds merchandise");
  const discounts = allocate(
    discount,
    lines.map((l) => ({ id: l.id, weight: l.gross })),
  );
  const paid = lines.map((l) => ({ ...l, paid: l.gross - discounts[l.id]! }));
  const basis = gross - discount;
  const commission = ratioRound(basis, policy.commissionBps, 10000);
  const fees = allocate(
    processingFee,
    paid.map((l) => ({ id: l.id, weight: l.paid })),
  );
  const commissions = allocate(
    commission,
    paid.map((l) => ({ id: l.id, weight: l.paid })),
  );
  const result = paid.map((l) => {
    const net =
      l.paid -
      commissions[l.id]! -
      cents(l.production) -
      (policy.feeBearer === "publisher" ? fees[l.id]! : 0);
    if (net < 0)
      throw new Error("Publisher proceeds negative; explicit subsidy required");
    return Object.freeze({
      ...l,
      discount: discounts[l.id]!,
      commission: commissions[l.id]!,
      processingFee: fees[l.id]!,
      publisherNet: net,
    });
  });
  const platformNet =
    commission - (policy.feeBearer === "platform" ? processingFee : 0);
  if (platformNet < 0) throw new Error("Platform subsidy required");
  return Object.freeze({
    lines: Object.freeze(result),
    policy: Object.freeze({ ...policy }),
    shipping,
    processingFee,
    merchandise: basis,
    total: checked(BigInt(basis) + BigInt(shipping)),
    commission,
    platformNet,
  });
}
/** Cumulative pro-rata reversal prevents repeated one-cent refunds evading commission reversal. */
export function partialRefund(
  line: {
    paid: Money;
    commission: Money;
    processingFee: Money;
    production: Money;
  },
  alreadyRefunded: Money,
  requested: Money,
) {
  cents(alreadyRefunded);
  cents(requested);
  if (!line.paid || !requested || alreadyRefunded + requested > line.paid)
    throw new Error("Invalid refund");
  const reversed = (value: Money) =>
    ratioRound(value, alreadyRefunded + requested, line.paid) -
    ratioRound(value, alreadyRefunded, line.paid);
  const commission = reversed(line.commission);
  // Processing fees and actual production costs are not automatically refundable by providers.
  return Object.freeze({
    gross: requested,
    commission,
    publisherDebit: requested - commission,
    processingFeeReversed: 0,
    productionReversed: 0,
  });
}
export interface Posting {
  account: string;
  debit: Money;
  credit: Money;
}
export interface LedgerEntry {
  id: string;
  reference: string;
  occurredAt: string;
  postings: readonly Readonly<Posting>[];
}
/** Repository must insert returned entries in a database transaction with UNIQUE(id). */
export function appendLedger(
  entries: readonly LedgerEntry[],
  entry: LedgerEntry,
): readonly LedgerEntry[] {
  if (
    !entry.id ||
    !entry.reference ||
    !Number.isFinite(Date.parse(entry.occurredAt)) ||
    entry.postings.length < 2
  )
    throw new Error("Invalid ledger entry");
  let debit = 0n,
    credit = 0n;
  for (const p of entry.postings) {
    if (!p.account || (p.debit && p.credit) || (!p.debit && !p.credit))
      throw new Error("Invalid posting");
    debit += BigInt(cents(p.debit));
    credit += BigInt(cents(p.credit));
  }
  if (debit !== credit) throw new Error("Unbalanced ledger");
  const previous = entries.find((e) => e.id === entry.id);
  if (previous) {
    if (JSON.stringify(previous) !== JSON.stringify(entry))
      throw new Error("Idempotency payload mismatch");
    return entries;
  }
  return Object.freeze([
    ...entries,
    Object.freeze({
      ...entry,
      postings: Object.freeze(
        entry.postings.map((p) => Object.freeze({ ...p })),
      ),
    }),
  ]);
}
export interface Payable {
  id: string;
  amount: Money;
  paidAt: string;
  providerAvailableAt: string | null;
  reserved: Money;
  disputed: boolean;
  kycVerified: boolean;
}
export function payoutEligible(payable: Payable, now: Date): Money {
  cents(payable.amount);
  cents(payable.reserved);
  const paid = Date.parse(payable.paidAt),
    available = Date.parse(payable.providerAvailableAt ?? "");
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isFinite(paid) ||
    !Number.isFinite(available) ||
    !payable.kycVerified ||
    payable.disputed ||
    now.getTime() < Math.max(paid + 7 * 86400000, available)
  )
    return 0;
  return Math.max(0, payable.amount - payable.reserved);
}
export function reservePayout(
  payables: readonly Payable[],
  amount: Money,
  now: Date,
): readonly Payable[] {
  cents(amount);
  if (!amount) throw new Error("Empty payout");
  const total = payables.reduce(
    (s, p) => s + BigInt(payoutEligible(p, now)),
    0n,
  );
  if (total < BigInt(amount)) throw new Error("Insufficient eligible balance");
  let remaining = amount;
  return Object.freeze(
    payables.map((p) => {
      const held = Math.min(remaining, payoutEligible(p, now));
      remaining -= held;
      return Object.freeze({ ...p, reserved: p.reserved + held });
    }),
  );
}
export interface PayoutRequest {
  readonly idempotencyKey: string;
  readonly amount: Money;
  readonly destinationId: string;
  readonly state: "reserved" | "submitted" | "settled" | "failed";
  readonly providerReference?: string;
}
/** Persist both returned collections atomically; UNIQUE(owner,idempotency_key) is required. */
export function requestPayout(
  state: {
    readonly payables: readonly Payable[];
    readonly requests: readonly PayoutRequest[];
  },
  input: {
    idempotencyKey: string;
    amount: Money;
    destinationId: string;
    destinationVerified: boolean;
    reauthenticated: boolean;
  },
  now: Date,
) {
  cents(input.amount);
  if (
    !input.idempotencyKey ||
    !input.destinationId ||
    !input.destinationVerified ||
    !input.reauthenticated
  )
    throw new Error("Verified destination and reauthentication required");
  const previous = state.requests.find(
    (r) => r.idempotencyKey === input.idempotencyKey,
  );
  if (previous) {
    if (
      previous.amount !== input.amount ||
      previous.destinationId !== input.destinationId
    )
      throw new Error("Payout idempotency mismatch");
    return state;
  }
  const payables = reservePayout(state.payables, input.amount, now);
  const request: PayoutRequest = Object.freeze({
    idempotencyKey: input.idempotencyKey,
    amount: input.amount,
    destinationId: input.destinationId,
    state: "reserved",
  });
  return Object.freeze({
    payables,
    requests: Object.freeze([...state.requests, request]),
  });
}
