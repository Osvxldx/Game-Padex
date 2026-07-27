import assert from "node:assert/strict";
import test from "node:test";

import {
  DelayedInputQueue,
  WARNING_MAX_COUNT,
  attachWarningSystemRuntime,
  calculateWarningDelayMs,
  createWarningSystemMachine,
} from "./warningSystem.js";
import { resetPlayerAfterRespawn } from "../systems/deathRespawn.js";
import { createWarningResetContract } from "../systems/gameplayState.js";
import { DEFAULT_MECHANIC_FACTORIES } from "./mechanicRegistry.js";

// Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6

test("warning delay follows the exact formula for representative counts 0..20", () => {
  assert.deepEqual(
    [0, 1, 5, 10, 20].map(calculateWarningDelayMs),
    [50, 57.49999999999999, 87.5, 125, 200],
  );
  assert.equal(calculateWarningDelayMs(-10), 50);
  assert.equal(calculateWarningDelayMs(99), 200);
});

test("each signal ID is collected once and Comment Code immunity does not consume it", () => {
  const warnings = createWarningSystemMachine();

  assert.equal(warnings.collect("warning-a", { immune: true }).reason, "immune");
  assert.equal(warnings.getState().warningCount, 0);
  assert.equal(warnings.collect("warning-a").incremented, true);
  assert.equal(warnings.collect("warning-a").reason, "already-collected");
  assert.equal(warnings.getState().warningCount, 1);
});

test("warning count is capped at 20 while later unique signs become one-shot", () => {
  const warnings = createWarningSystemMachine();
  for (let index = 0; index < WARNING_MAX_COUNT; index += 1) {
    assert.equal(warnings.collect(`warning-${index}`).incremented, true);
  }

  const capped = warnings.collect("warning-over-cap");
  assert.equal(capped.accepted, true);
  assert.equal(capped.incremented, false);
  assert.equal(capped.reason, "capped");
  assert.equal(warnings.getState().warningCount, 20);
  assert.equal(warnings.collect("warning-over-cap").reason, "already-collected");
});

test("delayed actions preserve transition order and exact due timing", () => {
  const queue = new DelayedInputQueue({ delayProvider: () => 50 });

  let output = queue.advance({ rightDown: true }, 0.049);
  assert.equal(output.rightDown, false);
  assert.equal(queue.getState().pendingCount, 1);

  output = queue.advance({ rightDown: true }, 0.001);
  assert.equal(output.rightDown, true);
  assert.equal(queue.getState().pendingCount, 0);

  output = queue.advance({ rightDown: false, jumpDown: true }, 0.05);
  assert.equal(output.rightDown, false);
  assert.equal(output.jumpDown, true);
  assert.equal(output.jumpPressed, true);

  output = queue.advance({ jumpDown: false }, 0.05);
  assert.equal(output.jumpDown, false);
  assert.equal(output.jumpReleased, true);
});

test("pause freezes queue time and reset clears all pending actions", () => {
  const queue = new DelayedInputQueue({ delayProvider: () => 50 });
  queue.advance({ leftDown: true }, 0.02);
  queue.pause();

  const paused = queue.advance({ leftDown: false }, 10);
  assert.equal(paused.leftDown, false);
  assert.equal(queue.getState().elapsedMs, 20);
  assert.equal(queue.getState().pendingCount, 1);

  queue.resume();
  assert.equal(queue.advance({ leftDown: true }, 0.03).leftDown, true);
  queue.advance({ leftDown: false }, 0);
  assert.equal(queue.getState().pendingCount, 1);
  queue.reset();
  assert.equal(queue.getState().pendingCount, 0);
  assert.equal(queue.getState().output.leftDown, false);
});

function createRuntimeHarness({ audioThrows = false } = {}) {
  const collisions = new Map();
  const events = new Map();
  const root = {
    add(components) {
      const object = { hidden: false };
      for (const component of components) {
        if (component && typeof component === "object") Object.assign(object, component);
      }
      return object;
    },
  };
  const player = {
    pos: { x: 10, y: 20 },
    vel: { x: 30, y: -40 },
    velocityX: 30,
    ignored: false,
    onCollide(tag, handler) { collisions.set(tag, handler); },
    on(name, handler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    trigger(name, ...args) {
      for (const handler of events.get(name) ?? []) handler(...args);
    },
    shouldIgnoreLogicalObstacle() { return this.ignored; },
    setInputGate(gate) { this.inputGate = gate; },
    resetPlayerMovement() {
      this.velocityX = 0;
      this.vel.x = 0;
      this.vel.y = 0;
    },
    resetCommentAbility() {},
  };
  const k = {
    text: (text) => ({ text }),
    pos: (x, y) => ({ pos: { x, y } }),
    anchor: () => ({}),
    color: (...color) => ({ color }),
    z: () => ({}),
    fixed: () => ({}),
    rgb: (...color) => color,
  };
  const zone = {
    id: "warnings-main:warning:1",
    mechanic: { params: { warningId: "warning-runtime-a" } },
  };
  const object = {
    opacity: 0.28,
    visualState: "idle",
    setMechanicVisualState(state) { this.visualState = state; },
  };
  const runtime = attachWarningSystemRuntime({
    k,
    gameplayRoot: root,
    player,
    mechanic: {
      id: "warnings-main",
      params: { baseDelayMs: 50, multiplier: 0.15, maxWarnings: 20 },
    },
    entries: [{ zone, object }],
    audioManager: {
      playSfx() {
        if (audioThrows) throw new Error("audio unavailable");
      },
    },
  });
  return {
    player,
    runtime,
    object,
    collide: () => collisions.get("warning-sign")(object),
  };
}

test("runtime uses logical immunity, updates persistent HUD, and tolerates audio failure", () => {
  const harness = createRuntimeHarness({ audioThrows: true });
  harness.player.ignored = true;
  assert.equal(harness.collide().reason, "immune");
  assert.equal(harness.runtime.getState().hudText, "Warnings: 0");

  harness.player.ignored = false;
  assert.equal(harness.collide().incremented, true);
  assert.equal(harness.runtime.getState().warningCount, 1);
  assert.equal(harness.runtime.getState().delayMs, 57.49999999999999);
  assert.equal(harness.runtime.getState().hudText, "Warnings: 1");
  assert.equal(harness.object.visualState, "resolved");
  assert.equal(harness.collide().reason, "already-collected");
});

test("death respawn uses the real warning reset contract and empties delayed input", () => {
  const harness = createRuntimeHarness();
  harness.collide();
  harness.runtime.inputQueue.advance({ rightDown: true }, 0.01);
  const contract = createWarningResetContract({
    getWarningCount: harness.runtime.getWarningCount,
    resetWarnings: harness.runtime.resetWarnings,
  });

  resetPlayerAfterRespawn({
    player: harness.player,
    checkpoint: { x: 100, y: 200 },
    warningResetContract: contract,
  });

  assert.equal(contract.getCount(), 0);
  assert.equal(harness.runtime.getState().input.pendingCount, 0);
  assert.equal(harness.runtime.getState().hudText, "Warnings: 0");
  assert.deepEqual(harness.player.pos, { x: 100, y: 200 });
  assert.equal(harness.runtime.getState().collectedSignalIds.length, 1);
});


test("warning runtime is available through the generic mechanic registry", () => {
  assert.equal(DEFAULT_MECHANIC_FACTORIES.warningSystem, attachWarningSystemRuntime);
});