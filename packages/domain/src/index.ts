import { randomInt } from "node:crypto";

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

/** Restricted arithmetic grammar: numbers, named fields, + - * / and parentheses. No dynamic code. */
export function calculateFormula(
  input: string,
  fields: Record<string, number> = {},
): number {
  if (input.length > 500)
    throw new DomainError("FORMULA_LIMIT", "Fórmula excede 500 caracteres.");
  const tokens =
    input.match(/(?:\d+(?:\.\d+)?)|[A-Za-z_][A-Za-z_0-9]*|[()+\-*/]|\S/g) ?? [];
  let index = 0;
  let depth = 0;
  function primary(): number {
    if (++depth > 32)
      throw new DomainError("FORMULA_DEPTH", "Fórmula muito complexa.");
    const token = tokens[index++];
    let value: number;
    if (token === "(") {
      value = expression();
      if (tokens[index++] !== ")")
        throw new DomainError("FORMULA_SYNTAX", "Parênteses inválidos.");
    } else if (token === "-") value = -primary();
    else if (token === "+") value = primary();
    else if (token && /^\d+(?:\.\d+)?$/.test(token)) value = Number(token);
    else if (token && Object.hasOwn(fields, token)) value = fields[token]!;
    else
      throw new DomainError("FORMULA_SYNTAX", "Campo ou expressão inválida.");
    depth--;
    return value;
  }
  function term(): number {
    let value = primary();
    while (tokens[index] === "*" || tokens[index] === "/") {
      const op = tokens[index++];
      const right = primary();
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function expression(): number {
    let value = term();
    while (tokens[index] === "+" || tokens[index] === "-") {
      const op = tokens[index++];
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const value = expression();
  if (
    index !== tokens.length ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1e12
  )
    throw new DomainError(
      "FORMULA_RESULT",
      "Resultado inválido ou fora do limite.",
    );
  return value;
}

export function rollDice(
  expression: string,
  random: (min: number, max: number) => number = randomInt,
) {
  const match = /^(\d{1,3})d(\d{1,5})([+-]\d{1,5})?$/.exec(
    expression.replace(/\s/g, "").toLowerCase(),
  );
  if (!match)
    throw new DomainError(
      "DICE_SYNTAX",
      "Use NdM, com modificador opcional: 2d6+3.",
    );
  const count = Number(match[1]),
    sides = Number(match[2]),
    modifier = Number(match[3] ?? 0);
  if (count < 1 || count > 100 || sides < 2 || sides > 10000)
    throw new DomainError("DICE_LIMIT", "Limite de 100 dados e 10.000 faces.");
  const rolls = Array.from({ length: count }, () => random(1, sides + 1));
  return {
    expression,
    rolls,
    sides,
    modifier,
    total: rolls.reduce((a, b) => a + b, modifier),
    origin: "server" as const,
  };
}

export function requireVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new DomainError(
      "VERSION_CONFLICT",
      "Há alterações mais recentes. Recupere a versão atual e reconcilie suas alterações.",
      409,
    );
}

/** Largest remainder allocation, deterministic ties resolved in original order. */
export function allocateCents(total: number, weights: number[]): number[] {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    weights.some((w) => !Number.isSafeInteger(w) || w < 0)
  )
    throw new DomainError("MONEY_INVALID", "Valores monetários inválidos.");
  const sum = weights.reduce((a, b) => a + BigInt(b), 0n);
  if (!sum) {
    if (total) throw new DomainError("MONEY_WEIGHTS", "Distribuição sem base.");
    return weights.map(() => 0);
  }
  const rows = weights.map((weight, index) => {
    const product = BigInt(total) * BigInt(weight);
    return { index, amount: Number(product / sum), remainder: product % sum };
  });
  const residual = total - rows.reduce((n, row) => n + row.amount, 0);
  const ordered = [...rows].sort((a, b) =>
    a.remainder > b.remainder
      ? -1
      : a.remainder < b.remainder
        ? 1
        : a.index - b.index,
  );
  for (let i = 0; i < residual; i++) ordered[i]!.amount++;
  return rows.map((row) => row.amount);
}

export function commissionCents(
  paidItemCents: number,
  basisPoints = 900,
): number {
  if (
    !Number.isSafeInteger(paidItemCents) ||
    paidItemCents < 0 ||
    !Number.isInteger(basisPoints) ||
    basisPoints < 0 ||
    basisPoints > 10000
  )
    throw new DomainError("MONEY_INVALID", "Base ou comissão inválida.");
  return Number((BigInt(paidItemCents) * BigInt(basisPoints) + 5000n) / 10000n);
}

export const PRINT_TRANSITIONS: Record<string, readonly string[]> = {
  awaiting_art: ["awaiting_proof", "cancelled"],
  awaiting_proof: ["awaiting_approval", "cancelled"],
  awaiting_approval: ["awaiting_art", "approved", "cancelled"],
  approved: ["in_production", "cancelled"],
  in_production: ["produced", "damaged"],
  produced: ["shipped", "damaged"],
  shipped: ["delivered", "lost", "damaged"],
  lost: ["awaiting_art", "cancelled"],
  damaged: ["awaiting_art", "cancelled"],
  delivered: [],
  cancelled: [],
};
export function assertPrintTransition(from: string, to: string) {
  if (!PRINT_TRANSITIONS[from]?.includes(to))
    throw new DomainError(
      "PRINT_TRANSITION",
      "Transição de produção inválida.",
      409,
    );
}
