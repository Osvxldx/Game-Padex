import assert from "node:assert/strict";
import test from "node:test";

import { LEVEL_1 } from "../levels/level1.js";
import {
  firstIncompleteLevelId,
  resolveLevelRequest,
} from "./game.js";

// Validates: Requirements 13.2, 14.4, 16.6

test("dynamic level requests resolve registered IDs and direct LevelData", () => {
  const registry = { 1: LEVEL_1 };

  assert.equal(resolveLevelRequest(undefined, registry).level, LEVEL_1);
  assert.equal(resolveLevelRequest({ levelId: "1" }, registry).level, LEVEL_1);
  assert.equal(resolveLevelRequest(1, registry).source, "registry");
  assert.deepEqual(
    resolveLevelRequest({ levelData: LEVEL_1 }, registry),
    { ok: true, level: LEVEL_1, source: "data" },
  );
  assert.deepEqual(
    resolveLevelRequest(LEVEL_1, registry),
    { ok: true, level: LEVEL_1, source: "data" },
  );
});

test("invalid and unavailable IDs return controlled errors", () => {
  const invalid = resolveLevelRequest({ levelId: "not-a-level" }, {});
  const missing = resolveLevelRequest({ levelId: 4 }, {});

  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /Identificador de nivel inválido/);
  assert.deepEqual(missing, {
    ok: false,
    levelId: 4,
    error: "Nivel 4 no está disponible",
  });
});

test("play route chooses the first incomplete level and wraps after completion", () => {
  assert.equal(firstIncompleteLevelId(undefined), 1);
  assert.equal(firstIncompleteLevelId([false, false, false, false, false]), 1);
  assert.equal(firstIncompleteLevelId([true, false, false, false, false]), 2);
  assert.equal(firstIncompleteLevelId([true, true, true, true, true]), 1);
});
