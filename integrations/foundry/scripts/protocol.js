export const SCOPES = Object.freeze([
  "actors:read",
  "actors:write",
  "combat:read",
  "rolls:read",
]);
const hex = (b) =>
  [...new Uint8Array(b)].map((v) => v.toString(16).padStart(2, "0")).join("");
const fromHex = (s) =>
  new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));
export async function authenticateEvent(
  event,
  secret,
  { crypto = globalThis.crypto, now = Date.now(), seen = new Map() } = {},
) {
  if (
    !event ||
    typeof event.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(event.id) ||
    typeof event.origin !== "string" ||
    event.origin.length > 128 ||
    typeof event.payload !== "string" ||
    event.payload.length > 64_000 ||
    !Number.isSafeInteger(event.at) ||
    Math.abs(now - event.at) > 60_000 ||
    !/^[a-f0-9]{64}$/.test(event.mac ?? "") ||
    !/^[a-f0-9]{64}$/.test(secret)
  )
    throw new Error("Invalid or expired event");
  for (const [id, at] of seen) if (at < now - 120_000) seen.delete(id);
  if (seen.has(event.id)) throw new Error("Replayed event");
  if (seen.size >= 10000) throw new Error("Replay window capacity exceeded");
  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const content = new TextEncoder().encode(
    `${event.id}\n${event.origin}\n${event.at}\n${event.payload}`,
  );
  if (!(await crypto.subtle.verify("HMAC", key, fromHex(event.mac), content)))
    throw new Error("Invalid event signature");
  const payload = JSON.parse(event.payload);
  seen.set(event.id, event.at);
  return payload;
}
export async function signEvent(
  payload,
  secret,
  origin,
  { crypto = globalThis.crypto, now = Date.now() } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Invalid pairing key");
  const event = {
    id: crypto.randomUUID(),
    origin,
    at: now,
    payload: JSON.stringify(payload),
    mac: "",
  };
  const key = await crypto.subtle.importKey(
    "raw",
    fromHex(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  event.mac = hex(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        `${event.id}\n${event.origin}\n${event.at}\n${event.payload}`,
      ),
    ),
  );
  return event;
}
/** Foundry remains combat authority. Only explicitly linked actor fields can be updated. */
export function allowedActorUpdate(payload, actor, pairing) {
  if (
    !pairing.scopes.includes("actors:write") ||
    payload.type !== "actor.update" ||
    !pairing.actorIds.includes(payload.actorId) ||
    actor?.id !== payload.actorId
  )
    throw new Error("Actor update forbidden");
  if (!Array.isArray(payload.changes) || payload.changes.length > 20)
    throw new Error("Invalid actor changes");
  const result = {};
  for (const change of payload.changes) {
    if (
      !pairing.writablePaths.includes(change.path) ||
      !/^system\.[a-zA-Z0-9_.]+$/.test(change.path) ||
      /(__proto__|constructor|prototype)/.test(change.path) ||
      !Number.isFinite(change.value) ||
      Math.abs(change.value) > 1_000_000
    )
      throw new Error("Actor field forbidden");
    result[change.path] = change.value;
  }
  return result;
}
