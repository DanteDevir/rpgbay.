import {
  SCOPES,
  authenticateEvent,
  signEvent,
  allowedActorUpdate,
} from "./protocol.js";
const ID = "letargia-rpgbay";
let pairing = null,
  timer = null,
  busy = false;
const seen = new Map();
const pairingKey = () => `${ID}:${game.world.id}:${game.user.id}`;
function persistPairing() {
  if (pairing) sessionStorage.setItem(pairingKey(), JSON.stringify(pairing));
  else sessionStorage.removeItem(pairingKey());
}
const adapters = {
  // Only generic authorized metadata; no claimed implementation of any RPG rules.
  generic: (actor) => ({
    id: actor.id,
    name: actor.name,
    portrait: actor.img,
    type: actor.type,
  }),
};
function isAuthority() {
  return game.user?.isGM && game.users.activeGM?.id === game.user.id;
}
function api(path) {
  const base = new URL(game.settings.get(ID, "apiOrigin"));
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("Configure uma origem HTTPS válida");
  return new URL(path, base);
}
async function request(path, method = "GET", body) {
  const response = await fetch(api(path), {
    method,
    credentials: "omit",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      ...(pairing ? { Authorization: `Bearer ${pairing.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if ([401, 403, 410].includes(response.status)) {
      pairing = null;
      persistPairing();
    }
    throw new Error(`Relay RPG BAY indisponível (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}
async function emit(payload) {
  if (!isAuthority() || !pairing || pairing.expiresAt <= Date.now()) return;
  await request("/v1/foundry/events", "POST", {
    pairingId: pairing.id,
    event: await signEvent(payload, pairing.secret, `foundry:${game.world.id}`),
  });
}
async function poll() {
  if (busy || !isAuthority() || !pairing) return;
  if (pairing.expiresAt <= Date.now()) {
    pairing = null;
    persistPairing();
    return;
  }
  busy = true;
  try {
    const response = await request(
      `/v1/foundry/events?pairingId=${encodeURIComponent(pairing.id)}&cursor=${encodeURIComponent(pairing.cursor ?? "")}`,
    );
    if (
      !response ||
      !Array.isArray(response.events) ||
      response.events.length > 100
    )
      throw new Error("Invalid relay response");
    for (const event of response.events) {
      const payload = await authenticateEvent(event, pairing.secret, { seen });
      if (event.origin !== `rpgbay:${pairing.tableId}`)
        throw new Error("Event origin mismatch");
      if (payload.type !== "actor.update")
        throw new Error(
          "Foundry é autoridade de combate; evento não permitido",
        );
      const actor = game.actors.get(payload.actorId);
      const changes = allowedActorUpdate(payload, actor, pairing);
      await actor.update(changes, { rpgbayOrigin: event.id });
    }
    pairing.cursor = response.cursor;
    persistPairing();
  } catch (error) {
    console.warn("RPG BAY: synchronization unavailable", error.message);
  } finally {
    busy = false;
  }
}
async function confirmPairing(code, actorIds, writablePaths) {
  if (!isAuthority()) throw new Error("Somente o mestre ativo pode confirmar");
  if (!/^[A-Z0-9-]{6,24}$/.test(code))
    throw new Error("Código temporário inválido");
  if (!Array.isArray(actorIds) || actorIds.some((id) => !game.actors.get(id)))
    throw new Error("Selecione atores existentes");
  if (
    !Array.isArray(writablePaths) ||
    writablePaths.some(
      (p) =>
        !/^system\.[a-zA-Z0-9_.]+$/.test(p) ||
        /(__proto__|prototype|constructor)/.test(p),
    )
  )
    throw new Error("Caminhos inválidos");
  const approved = await Dialog.confirm({
    title: "Autorizar RPG BAY",
    content: `<p>Autorizar leitura dos atores selecionados e atualização apenas dos recursos numéricos explicitamente escolhidos? Combate continua sob autoridade do Foundry. Código de pareamento: <strong>${code}</strong>.</p>`,
  });
  if (!approved) return;
  const result = await request("/v1/foundry/pair/confirm", "POST", {
    code,
    worldId: game.world.id,
    actorIds,
    writablePaths,
    scopes: SCOPES,
  });
  if (
    !result ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(result.id) ||
    !/^[a-f0-9]{64}$/.test(result.secret) ||
    typeof result.token !== "string" ||
    !Number.isSafeInteger(result.expiresAt) ||
    result.expiresAt <= Date.now() ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(result.tableId)
  )
    throw new Error("Resposta de pareamento inválida");
  pairing = {
    ...result,
    scopes: [...SCOPES],
    actorIds: [...actorIds],
    writablePaths: [...writablePaths],
  };
  persistPairing();
  await emit({
    type: "actors.snapshot",
    actors: actorIds.map((id) => adapters.generic(game.actors.get(id))),
  });
}
Hooks.once("init", () => {
  game.settings.register(ID, "apiOrigin", {
    name: "Origem da API RPG BAY",
    scope: "world",
    config: true,
    type: String,
    default: "https://rpgbay.libbay.com",
    restricted: true,
  });
  game.modules.get(ID).api = {
    confirmPairing,
    revoke: async () => {
      if (!isAuthority()) throw new Error("Mestre necessário");
      if (pairing)
        await request(
          `/v1/foundry/pair/${encodeURIComponent(pairing.id)}`,
          "DELETE",
        );
      pairing = null;
      persistPairing();
    },
    status: () => ({
      paired: !!pairing,
      expiresAt: pairing?.expiresAt,
      adapter: "generic-metadata-only",
    }),
  };
});
Hooks.once("ready", async () => {
  if (!isAuthority()) return;
  try {
    pairing = JSON.parse(sessionStorage.getItem(pairingKey()) ?? "null");
  } catch {
    pairing = null;
  }
  timer = setInterval(poll, 5000);
  await poll();
});
Hooks.on("updateActor", (actor, changes, options) => {
  if (
    options.rpgbayOrigin ||
    !pairing?.scopes.includes("actors:read") ||
    !pairing.actorIds.includes(actor.id)
  )
    return;
  void emit({ type: "actor.snapshot", actor: adapters.generic(actor) }).catch(
    () => {},
  );
});
Hooks.on("updateCombat", (combat) => {
  if (!pairing?.scopes.includes("combat:read")) return;
  void emit({
    type: "combat.snapshot",
    combat: {
      id: combat.id,
      round: combat.round,
      turn: combat.turn,
      combatants: combat.combatants
        .filter((c) => !c.hidden && pairing.actorIds.includes(c.actorId))
        .map((c) => ({
          id: c.id,
          actorId: c.actorId,
          initiative: c.initiative,
        })),
    },
  }).catch(() => {});
});
Hooks.on("createChatMessage", (message) => {
  if (
    !pairing?.scopes.includes("rolls:read") ||
    !message.isRoll ||
    message.whisper?.length ||
    message.blind
  )
    return;
  void emit({
    type: "roll.result",
    id: message.id,
    totals: message.rolls.map((r) => r.total),
  }).catch(() => {});
});
globalThis.addEventListener?.("beforeunload", () => clearInterval(timer));
