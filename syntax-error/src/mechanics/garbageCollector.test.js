import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRobotApproachOffset,
  createGarbageCollectorState,
} from "./garbageCollector.js";

// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5

test("five seconds without movement emits one player-kill transition", () => {
  const collector = createGarbageCollectorState();

  assert.equal(collector.advance(4.999).shouldKill, false);
  const expired = collector.advance(0.001);
  assert.equal(expired.shouldKill, true);
  assert.equal(expired.elapsedSeconds, 5);
  assert.equal(expired.progress, 1);
  assert.equal(collector.advance(1).shouldKill, false);
});

test("movement resets accumulated inactivity and starts a fresh interval", () => {
  const collector = createGarbageCollectorState();

  collector.advance(4.5);
  assert.deepEqual(
    collector.recordMovement(),
    {
      elapsedSeconds: 0,
      remainingSeconds: 5,
      thresholdSeconds: 5,
      progress: 0,
      paused: false,
      hasTriggered: false,
    },
  );
  assert.equal(collector.advance(4.9).shouldKill, false);
});

test("commented state freezes the exact timer value and resumes afterward", () => {
  const collector = createGarbageCollectorState();

  collector.advance(2.25);
  const paused = collector.advance(10, { isPaused: true });
  assert.equal(paused.elapsedSeconds, 2.25);
  assert.equal(paused.progress, 0.45);
  assert.equal(paused.paused, true);

  const resumed = collector.advance(0.75);
  assert.equal(resumed.elapsedSeconds, 3);
  assert.equal(resumed.paused, false);
});

test("respawn reset clears timer, progress, pause, and prior timeout", () => {
  const collector = createGarbageCollectorState();

  collector.advance(5);
  collector.advance(1, { isPaused: true });
  const reset = collector.reset();

  assert.equal(reset.elapsedSeconds, 0);
  assert.equal(reset.progress, 0);
  assert.equal(reset.paused, false);
  assert.equal(reset.hasTriggered, false);
  assert.equal(collector.advance(1).shouldKill, false);
});

test("robot approach distance is proportional to elapsed progress", () => {
  assert.equal(calculateRobotApproachOffset(0, 200), 200);
  assert.equal(calculateRobotApproachOffset(0.25, 200), 150);
  assert.equal(calculateRobotApproachOffset(0.5, 200), 100);
  assert.equal(calculateRobotApproachOffset(1, 200), 0);
  assert.equal(calculateRobotApproachOffset(2, 200), 0);
});
