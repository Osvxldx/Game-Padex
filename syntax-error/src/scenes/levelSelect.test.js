import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LEVEL_PROGRESS,
  LEVELS,
  LOCKED_LEVEL_MESSAGE_DURATION,
  createLevelSelectModel,
  deriveLevelStates,
  getLevelVisual,
  levelSelectCommandFromPressedKeys,
  moveLevelSelection,
  normalizeCompletedLevels,
  readLevelProgress,
  resolveLevelSelection,
  tickLevelFeedback,
} from "./levelSelect.js";

// Validates: Requirements 14.1, 14.3
test("first visit exposes five levels with only level 1 unlocked", () => {
  const levels = deriveLevelStates(DEFAULT_LEVEL_PROGRESS);

  assert.deepEqual(
    levels.map(({ id, state, selectable }) => ({ id, state, selectable })),
    [
      { id: 1, state: "unlocked", selectable: true },
      { id: 2, state: "locked", selectable: false },
      { id: 3, state: "locked", selectable: false },
      { id: 4, state: "locked", selectable: false },
      { id: 5, state: "locked", selectable: false },
    ],
  );
  assert.equal(LEVELS.length, 5);
});

// Validates: Requirements 14.2, 14.3, 14.4
test("all progress combinations derive the required state and selectability", () => {
  for (let mask = 0; mask < 2 ** LEVELS.length; mask += 1) {
    const completed = LEVELS.map((_, index) => Boolean(mask & (1 << index)));
    const levels = deriveLevelStates({ levelsCompleted: completed });

    levels.forEach((level, index) => {
      const expectedState = completed[index]
        ? "completed"
        : index === 0 || completed[index - 1]
          ? "unlocked"
          : "locked";
      assert.equal(level.state, expectedState);
      assert.equal(level.selectable, expectedState !== "locked");
    });
  }
});

test("completed, unlocked, and locked levels have distinct visual labels and colors", () => {
  const visuals = ["completed", "unlocked", "locked"]
    .map((state) => getLevelVisual(state));

  assert.deepEqual(
    visuals.map(({ label }) => label),
    ["COMPLETADO", "DESBLOQUEADO", "BLOQUEADO"],
  );
  assert.equal(new Set(visuals.map(({ cardColor }) => cardColor.join(","))).size, 3);
  assert.throws(() => getLevelVisual("unknown"), RangeError);
});

test("progress provider is injectable, normalized, and fails safely", () => {
  assert.deepEqual(
    readLevelProgress(() => ({ levelsCompleted: [true, false, 1, null, true] })),
    [true, false, false, false, true],
  );
  assert.deepEqual(
    readLevelProgress(() => { throw new Error("provider unavailable"); }),
    [false, false, false, false, false],
  );
  assert.deepEqual(normalizeCompletedLevels(null), [false, false, false, false, false]);
});

test("keyboard commands navigate, confirm, and return to the menu", () => {
  for (const key of ["left", "up", "a", "w"]) {
    assert.equal(levelSelectCommandFromPressedKeys([key]), "previous");
  }
  for (const key of ["right", "down", "d", "s"]) {
    assert.equal(levelSelectCommandFromPressedKeys([key]), "next");
  }
  for (const key of ["enter", "space"]) {
    assert.equal(levelSelectCommandFromPressedKeys([key]), "confirm");
  }
  for (const key of ["escape", "backspace"]) {
    assert.equal(levelSelectCommandFromPressedKeys([key]), "back");
  }
  assert.equal(levelSelectCommandFromPressedKeys([]), null);
  assert.equal(moveLevelSelection(0, -1), 4);
  assert.equal(moveLevelSelection(4, 1), 0);
});

// Validates: Requirements 14.4, 14.5
test("selection resolves available levels and explains locked prerequisites", () => {
  const levels = deriveLevelStates({
    levelsCompleted: [true, false, false, false, false],
  });

  assert.deepEqual(resolveLevelSelection(levels, 0), {
    kind: "selected",
    level: levels[0],
  });
  assert.deepEqual(resolveLevelSelection(levels, 1), {
    kind: "selected",
    level: levels[1],
  });
  assert.deepEqual(resolveLevelSelection(levels, 2), {
    kind: "locked",
    level: levels[2],
    message: "Completa el Nivel 2 para desbloquearlo",
    duration: LOCKED_LEVEL_MESSAGE_DURATION,
  });
});

test("locked feedback remains for two seconds and then expires without a timer", () => {
  const model = createLevelSelectModel();
  model.move(1);
  const result = model.select();

  assert.equal(result.kind, "locked");
  assert.equal(model.feedback.remaining, LOCKED_LEVEL_MESSAGE_DURATION);
  model.tick(1.999);
  assert.ok(model.feedback);
  model.tick(0.0011);
  assert.equal(model.feedback, null);

  const feedback = Object.freeze({ message: "blocked", remaining: 2 });
  assert.equal(tickLevelFeedback(feedback, 2), null);
  assert.throws(() => tickLevelFeedback(feedback, -0.1), RangeError);
});
