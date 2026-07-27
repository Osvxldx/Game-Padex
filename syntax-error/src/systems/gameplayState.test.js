import assert from "node:assert/strict";
import test from "node:test";

import {
  createCheckpointState,
  createWarningResetContract,
} from "./gameplayState.js";

// Validates: Requirements 4.1, 4.3

test("checkpoint contract starts at spawn, advances, and resets independently", () => {
  const checkpoints = createCheckpointState({ x: 20, y: 30 });

  assert.deepEqual(checkpoints.getLastCheckpoint(), { x: 20, y: 30 });
  checkpoints.activateCheckpoint({ x: 400, y: 250 });
  assert.deepEqual(checkpoints.getLastCheckpoint(), { x: 400, y: 250 });
  assert.deepEqual(checkpoints.getInitialSpawn(), { x: 20, y: 30 });
  assert.deepEqual(checkpoints.reset(), { x: 20, y: 30 });
});

test("checkpoint snapshots cannot mutate internal coordinates", () => {
  const checkpoints = createCheckpointState({ x: 10, y: 15 });
  const snapshot = checkpoints.getLastCheckpoint();
  snapshot.x = 999;

  assert.deepEqual(checkpoints.getLastCheckpoint(), { x: 10, y: 15 });
  assert.throws(() => checkpoints.activateCheckpoint({ x: NaN, y: 2 }), TypeError);
});

test("warning reset adapter exposes only count and reset to respawn", () => {
  let warnings = 7;
  const contract = createWarningResetContract({
    getWarningCount: () => warnings,
    resetWarnings: () => { warnings = 0; },
  });

  assert.equal(contract.getCount(), 7);
  assert.equal(contract.reset(), 0);
  assert.equal(warnings, 0);
});
