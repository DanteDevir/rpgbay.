import { test } from "node:test";
import assert from "node:assert/strict";
import {
  signEvent,
  authenticateEvent,
  allowedActorUpdate,
} from "../integrations/foundry/scripts/protocol.js";

test("Foundry signed events authenticate, deduplicate and expire", async () => {
  const secret = "ab".repeat(32),
    now = Date.now(),
    seen = new Map<string, number>();
  const event = await signEvent(
    { type: "actor.update", actorId: "pc1" },
    secret,
    "rpgbay:table1",
    { now },
  );
  assert.deepEqual(await authenticateEvent(event, secret, { now, seen }), {
    type: "actor.update",
    actorId: "pc1",
  });
  await assert.rejects(
    authenticateEvent(event, secret, { now, seen }),
    /Replayed/,
  );
  await assert.rejects(
    authenticateEvent(event, secret, { now: now + 61000 }),
    /expired/,
  );
  await assert.rejects(
    authenticateEvent({ ...event, payload: "{}" }, secret),
    /signature/,
  );
});
test("Foundry actor writes require grant, actor and numeric path; combat stays authoritative", () => {
  const grant = {
    scopes: ["actors:write"],
    actorIds: ["pc1"],
    writablePaths: ["system.hp.value"],
  };
  const command = {
    type: "actor.update",
    actorId: "pc1",
    changes: [{ path: "system.hp.value", value: 12 }],
  };
  assert.deepEqual(allowedActorUpdate(command, { id: "pc1" }, grant), {
    "system.hp.value": 12,
  });
  assert.throws(
    () => allowedActorUpdate(command, { id: "pc2" }, grant),
    /forbidden/,
  );
  assert.throws(
    () =>
      allowedActorUpdate(
        { ...command, type: "combat.update" },
        { id: "pc1" },
        grant,
      ),
    /forbidden/,
  );
  assert.throws(
    () =>
      allowedActorUpdate(
        { ...command, changes: [{ path: "system.secret", value: 2 }] },
        { id: "pc1" },
        grant,
      ),
    /forbidden/,
  );
  assert.throws(
    () =>
      allowedActorUpdate(
        { ...command, changes: [{ path: "system.hp.value", value: Infinity }] },
        { id: "pc1" },
        grant,
      ),
    /forbidden/,
  );
});
