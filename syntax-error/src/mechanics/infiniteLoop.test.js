import assert from "node:assert/strict";
import test from "node:test";

import {
  InfiniteLoopMachine,
  LOOP_OVERFLOW_MESSAGE,
  MovementHistory,
  attachInfiniteLoopSystem,
  sampleMovementCycle,
} from "./infiniteLoop.js";

// Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5

test("movement history keeps and replays exactly the latest two seconds", () => {
  const history = new MovementHistory({ initialPosition: { x: 0, y: 0 } });
  history.record({ x: 10, y: 5 }, 1);
  history.record({ x: 20, y: 10 }, 1);
  history.record({ x: 30, y: 15 }, 1);

  const cycle = history.createCycle({ x: 30, y: 15 });

  assert.equal(cycle.duration, 2);
  assert.deepEqual(sampleMovementCycle(cycle, 0), { x: 10, y: 5 });
  assert.deepEqual(sampleMovementCycle(cycle, 1), { x: 20, y: 10 });
  assert.deepEqual(sampleMovementCycle(cycle, 1.5), { x: 25, y: 12.5 });
  assert.deepEqual(sampleMovementCycle(cycle, 2.5), { x: 15, y: 7.5 });
});

test("commented state prevents trapping and release clears loop state", () => {
  const machine = new InfiniteLoopMachine({ initialPosition: { x: 5, y: 6 } });

  assert.equal(machine.trap({ x: 5, y: 6 }, { commented: true }), false);
  assert.equal(machine.getState().isTrapped, false);
  assert.equal(machine.trap({ x: 5, y: 6 }), true);
  machine.advance(2);
  assert.equal(machine.getState().cloneCount, 1);

  assert.equal(machine.release({ x: 7, y: 8 }), true);
  assert.deepEqual(machine.getState(), {
    isTrapped: false,
    isOverflowing: false,
    overflowRemaining: 0,
    overflowMessage: null,
    cycleElapsed: 0,
    cycleDuration: 2,
    completedIterations: 0,
    cloneCount: 0,
    cloneDelays: [],
  });
});

test("each completed cycle adds one delayed clone and ten trigger overflow", () => {
  const machine = new InfiniteLoopMachine({ initialPosition: { x: 0, y: 0 } });
  machine.record({ x: 100, y: 0 }, 2);
  machine.trap({ x: 100, y: 0 });

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const transition = machine.advance(2);
    assert.equal(transition.spawned.length, 1);
  }

  const overflow = machine.getState();
  assert.equal(overflow.cloneCount, 10);
  assert.equal(overflow.isOverflowing, true);
  assert.equal(overflow.overflowMessage, LOOP_OVERFLOW_MESSAGE);
  overflow.cloneDelays.forEach((delay, index) => {
    assert.ok(Math.abs(delay - (index + 1) * 0.1) < 1e-12);
  });

  assert.equal(machine.advance(1.49).teleportToStart, false);
  assert.equal(machine.advance(0.01).teleportToStart, true);
  assert.equal(machine.getState().cloneCount, 0);
  assert.equal(machine.getState().isTrapped, false);
});

function createRuntimeHarness() {
  let dt = 0;
  const objects = [];
  const mergeComponents = (components) => {
    const object = { destroyed: false };
    for (const component of components) {
      if (component && typeof component === "object") Object.assign(object, component);
    }
    object.exists = () => !object.destroyed;
    object.destroy = () => { object.destroyed = true; };
    objects.push(object);
    return object;
  };
  const root = { add: mergeComponents };
  const events = new Map();
  const collisions = new Map();
  const player = {
    pos: { x: 40, y: 50 },
    vel: { x: 0, y: 0 },
    velocityX: 0,
    isCommented: false,
    manualControlEnabled: true,
    setManualControlEnabled(enabled) {
      this.manualControlEnabled = enabled;
    },
    onCollide(tag, handler) {
      collisions.set(tag, handler);
    },
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
    text: (text) => ({ text }),
    pos: (x, y) => ({ pos: typeof x === "object" ? { ...x } : { x, y } }),
    anchor: () => ({}),
    color: (...color) => ({ color }),
    opacity: (opacity) => ({ opacity }),
    z: (z) => ({ z }),
  };

  return {
    k,
    root,
    player,
    objects,
    setDt(value) { dt = value; },
    collide(tag, object) { return collisions.get(tag)?.(object); },
  };
}

test("runtime locks controls, supports comment escape, and resets at level start", () => {
  const harness = createRuntimeHarness();
  const zone = {
    levelTileData: {
      mechanic: { id: "loop-main", type: "infiniteLoop", enabled: true },
    },
  };
  const system = attachInfiniteLoopSystem(harness.k, {
    gameplayRoot: harness.root,
    player: harness.player,
    levelStart: { x: 10, y: 20 },
    zones: [zone],
  });

  harness.player.isCommented = true;
  assert.equal(harness.collide("loop-zone", zone), false);
  harness.player.isCommented = false;
  assert.equal(harness.collide("loop-zone", zone), true);
  assert.equal(harness.player.manualControlEnabled, false);

  harness.setDt(2);
  system.controller.update();
  assert.equal(system.getState().cloneCount, 1);
  harness.player.trigger("comment-start");
  assert.equal(system.getState().isTrapped, false);
  assert.equal(system.getState().activeCloneObjects, 0);
  assert.equal(harness.player.manualControlEnabled, true);

  assert.equal(system.enterLoop(zone), true);
  for (let iteration = 0; iteration < 10; iteration += 1) {
    system.controller.update();
  }
  assert.equal(system.getState().feedbackVisible, true);
  assert.equal(system.feedback.text, LOOP_OVERFLOW_MESSAGE);

  harness.setDt(1.5);
  system.controller.update();
  assert.deepEqual(harness.player.pos, { x: 10, y: 20 });
  assert.equal(harness.player.manualControlEnabled, true);
  assert.equal(system.getState().activeCloneObjects, 0);
  assert.equal(system.getState().feedbackVisible, false);
});
