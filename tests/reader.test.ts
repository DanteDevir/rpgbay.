import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeReadingStates,
  BOOKMARK_MARKER,
  type ReadingState,
} from "../packages/reader/state.ts";
const initial: ReadingState = {
  page: 1,
  version: 1,
  annotations: [{ id: "old", page: 1, text: "nota original" }],
};
test("reading conflict merge preserves concurrent annotation texts and remote version", () => {
  const local = {
    page: 5,
    version: 1,
    annotations: [
      { id: "old", page: 1, text: "minha edição" },
      { id: "mine", page: 5, text: BOOKMARK_MARKER },
    ],
  };
  const remote = {
    page: 3,
    version: 2,
    annotations: [
      { id: "old", page: 1, text: "edição concorrente" },
      { id: "theirs", page: 2, text: "outra nota" },
    ],
  };
  const result = mergeReadingStates(
    initial,
    local,
    remote,
    () => "preserved-conflict",
  );
  assert.equal(result.page, 5);
  assert.equal(result.version, 2);
  assert.equal(result.annotations.length, 4);
  assert.ok(result.annotations.some((a) => a.text === "minha edição"));
  assert.ok(result.annotations.some((a) => a.text === "edição concorrente"));
  assert.ok(result.annotations.some((a) => a.text === BOOKMARK_MARKER));
});
test("merge honors explicit deletion only when remote annotation did not change", () => {
  const local = { page: 1, version: 1, annotations: [] };
  assert.equal(
    mergeReadingStates(initial, local, { ...initial, version: 2 }).annotations
      .length,
    0,
  );
  const remote = {
    page: 1,
    version: 2,
    annotations: [{ id: "old", page: 1, text: "edição remota salva" }],
  };
  assert.equal(
    mergeReadingStates(initial, local, remote).annotations[0].text,
    "edição remota salva",
  );
});
test("same annotation ID created concurrently preserves both distinct notes with consistent IDs", () => {
  const base = { page: 1, version: 0, annotations: [] };
  const local = {
    page: 1,
    version: 0,
    annotations: [{ id: "collision", page: 1, text: "a" }],
  };
  const remote = {
    page: 1,
    version: 1,
    annotations: [{ id: "collision", page: 1, text: "b" }],
  };
  const result = mergeReadingStates(base, local, remote, () => "new-id");
  assert.deepEqual(
    new Set(result.annotations.map((a) => a.id)),
    new Set(["collision", "new-id"]),
  );
});
