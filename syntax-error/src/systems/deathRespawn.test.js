import assert from "node:assert/strict";
import test from "node:test";

import {
  RESPAWN_DELAY,
  RESPAWN_INVULNERABILITY,
} from "../constants.js";
import {
  DEATH_STATES,
  createDeathRespawnMachine,
} from "./deathRespawn.js";

// Validates: Requirements 4.1, 4.2, 4.4, 4.5

test("death is non-reentrant and respawns within the configured 500ms bound", () => {
  const machine = createDeathRespawnMachine();

  assert.ok(RESPAWN_DELAY <= 0.5);
  assert.equal(machine.requestDeath("lethal"), true);
  assert.equal(machine.requestDeath("kill-plane"), false);
  assert.equal(machine.advance(RESPAWN_DELAY - 0.001).respawned, false);

  const transition = machine.advance(0.001);
  assert.equal(transition.respawned, true);
  assert.equal(transition.state.state, DEATH_STATES.INVULNERABLE);
  assert.equal(transition.state.deathCount, 1);
  assert.equal(transition.state.deathSource, "lethal");
});

test("post-respawn invulnerability rejects damage for one full second", () => {
  const machine = createDeathRespawnMachine();
  machine.requestDeath("lethal");
  machine.advance(RESPAWN_DELAY);

  assert.equal(machine.getState().invulnerabilityRemaining, RESPAWN_INVULNERABILITY);
  assert.equal(machine.requestDeath("lethal"), false);
  machine.advance(RESPAWN_INVULNERABILITY - 0.001);
  assert.equal(machine.getState().state, DEATH_STATES.INVULNERABLE);
  assert.equal(machine.requestDeath("kill-plane"), false);

  machine.advance(0.001);
  assert.equal(machine.getState().state, DEATH_STATES.ALIVE);
  assert.equal(machine.getState().canReceiveDamage, true);
});

test("large frame deltas preserve respawn and invulnerability transitions", () => {
  const machine = createDeathRespawnMachine();
  machine.requestDeath("kill-plane");

  const transition = machine.advance(RESPAWN_DELAY + RESPAWN_INVULNERABILITY);
  assert.equal(transition.respawned, true);
  assert.equal(transition.becameVulnerable, true);
  assert.equal(machine.getState().state, DEATH_STATES.ALIVE);
});

test("death count supports unlimited sequential retries", () => {
  const machine = createDeathRespawnMachine();

  for (let retry = 1; retry <= 100; retry += 1) {
    assert.equal(machine.requestDeath(`retry-${retry}`), true);
    machine.advance(RESPAWN_DELAY);
    machine.advance(RESPAWN_INVULNERABILITY);
    assert.equal(machine.getState().deathCount, retry);
  }
});
