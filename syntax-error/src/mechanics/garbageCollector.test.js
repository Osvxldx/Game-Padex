import assert from "node:assert/strict";
import test from "node:test";

import {
  GC_INACTIVITY_SECONDS,
  attachGarbageCollectorSystem,
  createGarbageCollectorMachine,
  isMovementInput,
} from "./garbageCollector.js";

// Validates: Requirements 5.1, 5.2, 5.4, 5.5

test("idle time accumulates until the inactivity threshold triggers exactly once", () => {
  const machine = createGarbageCollectorMachine({ inactivitySeconds: 5 });

  for (let step = 0; step < 4; step += 1) {
    const transition = machine.advance(1, { moving: false });
    assert.equal(transition.justTriggered, false);
  }
  assert.equal(machine.getState().remaining, 1);

  const triggering = machine.advance(1, { moving: false });
  assert.equal(triggering.justTriggered, true);
  assert.equal(machine.getState().triggered, true);
  assert.equal(machine.getState().progress, 1);

  // Once triggered, further idle frames do not re-fire the elimination signal.
  assert.equal(machine.advance(1, { moving: false }).justTriggered, false);
});

test("any movement resets the inactivity timer to zero (Requirement 5.2)", () => {
  const machine = createGarbageCollectorMachine({ inactivitySeconds: 5 });
  machine.advance(4.9, { moving: false });
  assert.ok(machine.getState().elapsed > 4);

  const moved = machine.advance(0.016, { moving: true });
  assert.equal(moved.moved, true);
  assert.equal(moved.elapsed, 0);
  assert.equal(machine.getState().progress, 0);
});

test("commented/locked frames pause the timer and resume from the held value", () => {
  const machine = createGarbageCollectorMachine({ inactivitySeconds: 5 });
  machine.advance(3, { moving: false });

  const paused = machine.advance(10, { paused: true });
  assert.equal(paused.paused, true);
  assert.equal(machine.getState().elapsed, 3);

  machine.advance(1, { moving: false });
  assert.equal(machine.getState().elapsed, 4);
});

test("reset returns the machine to its initial, non-triggered state", () => {
  const machine = createGarbageCollectorMachine({ inactivitySeconds: 5 });
  machine.advance(5, { moving: false });
  assert.equal(machine.getState().triggered, true);

  machine.reset();
  assert.deepEqual(machine.getState(), {
    elapsed: 0,
    threshold: 5,
    remaining: 5,
    progress: 0,
    triggered: false,
  });
});

test("machine validates its configuration and delta inputs", () => {
  assert.throws(() => createGarbageCollectorMachine({ inactivitySeconds: 0 }), RangeError);
  assert.throws(() => createGarbageCollectorMachine({ inactivitySeconds: -1 }), RangeError);
  const machine = createGarbageCollectorMachine();
  assert.equal(machine.getState().threshold, GC_INACTIVITY_SECONDS);
  assert.throws(() => machine.advance(-1), RangeError);
});

test("movement detection recognizes horizontal keys and jump presses", () => {
  assert.equal(isMovementInput({ leftDown: true }), true);
  assert.equal(isMovementInput({ rightDown: true }), true);
  assert.equal(isMovementInput({ jumpDown: true }), true);
  assert.equal(isMovementInput({ jumpPressed: true }), true);
  assert.equal(isMovementInput({ jumpReleased: true }), false);
  assert.equal(isMovementInput({}), false);
});

function createRuntimeHarness() {
  let dt = 0;
  const keys = new Set();
  const events = new Map();
  const objects = [];
  const root = {
    add(components) {
      const object = { destroyed: false, pos: { x: 0, y: 0 } };
      for (const component of components) {
        if (component && typeof component === "object") Object.assign(object, component);
      }
      object.exists = () => !object.destroyed;
      object.destroy = () => { object.destroyed = true; };
      objects.push(object);
      return object;
    },
  };
  const player = {
    pos: { x: 400, y: 300 },
    isCommented: false,
    manualControlEnabled: true,
    paused: false,
    exists: () => true,
    on(name, handler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    trigger(name, ...args) {
      for (const handler of events.get(name) ?? []) handler(...args);
    },
  };
  const k = {
    dt: () => dt,
    width: () => 1280,
    rect: () => ({}),
    text: (text) => ({ text }),
    pos: (x, y) => ({ pos: typeof x === "object" ? { ...x } : { x, y } }),
    anchor: () => ({}),
    color: (...color) => ({ color }),
    opacity: (opacity) => ({ opacity }),
    z: () => ({}),
    fixed: () => ({}),
    rgb: (...color) => color,
    isKeyDown: (key) => keys.has(key),
    isKeyPressed: (key) => keys.has(key),
    isKeyReleased: () => false,
  };
  return {
    k,
    root,
    player,
    setDt(value) { dt = value; },
    press(...pressed) { keys.clear(); for (const key of pressed) keys.add(key); },
    releaseAll() { keys.clear(); },
  };
}

test("runtime eliminates the player after five idle seconds and resets on death", () => {
  const harness = createRuntimeHarness();
  const deaths = [];
  const sfx = [];
  const system = attachGarbageCollectorSystem(harness.k, {
    gameplayRoot: harness.root,
    player: harness.player,
    zones: [],
    requestDeath: (source) => { deaths.push(source); return true; },
    audioManager: { playSfx: (name) => sfx.push(name) },
    inactivitySeconds: 5,
  });

  harness.setDt(1);
  for (let step = 0; step < 4; step += 1) system.controller.update();
  assert.equal(deaths.length, 0);
  assert.ok(sfx.includes("gcAlert"), "alert should fire past 60% progress");

  system.controller.update();
  assert.deepEqual(deaths, ["garbage-collector"]);

  // The death system broadcasts player-death, which resets the timer to zero.
  harness.player.trigger("player-death", "garbage-collector");
  assert.equal(system.getState().elapsed, 0);
  assert.equal(system.getState().triggered, false);
});

test("runtime resets the timer when a movement key is pressed", () => {
  const harness = createRuntimeHarness();
  const system = attachGarbageCollectorSystem(harness.k, {
    gameplayRoot: harness.root,
    player: harness.player,
    requestDeath: () => true,
    inactivitySeconds: 5,
  });

  harness.setDt(1);
  system.controller.update();
  system.controller.update();
  assert.ok(system.getState().elapsed >= 2);

  harness.press("d");
  system.controller.update();
  assert.equal(system.getState().elapsed, 0);
});

test("runtime pauses the timer while the player is commented", () => {
  const harness = createRuntimeHarness();
  const deaths = [];
  const system = attachGarbageCollectorSystem(harness.k, {
    gameplayRoot: harness.root,
    player: harness.player,
    requestDeath: (source) => { deaths.push(source); return true; },
    inactivitySeconds: 5,
  });

  harness.setDt(3);
  system.controller.update();
  assert.equal(system.getState().elapsed, 3);

  harness.player.isCommented = true;
  harness.setDt(10);
  system.controller.update();
  assert.equal(system.getState().elapsed, 3, "commented frames must hold the timer");
  assert.equal(deaths.length, 0);

  harness.player.isCommented = false;
  harness.setDt(2);
  system.controller.update();
  assert.deepEqual(deaths, ["garbage-collector"]);
});
