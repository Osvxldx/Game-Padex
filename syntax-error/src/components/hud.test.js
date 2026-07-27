import assert from "node:assert/strict";
import test from "node:test";

import {
  contrastRatio,
  cooldownHudState,
  createAccessibleGameplayPalette,
  createHudSnapshot,
  garbageCollectorApproachPosition,
  ghostTrailOpacity,
  normalizeWarningCount,
  themeTransitionOpacity,
} from "./hud.js";
import { TILE_THEME_PALETTES } from "../levels/tileConfig.js";

// Validates: Requirements 3.6, 8.3, 19.3

test("HUD exposes level, bounded warnings, and all cooldown states", () => {
  const active = createHudSnapshot({
    levelId: 4,
    levelName: "Warning Fatigue",
    warningCount: 29,
    abilityState: { isCommented: true, commentRemaining: 0.25 },
  });
  assert.equal(active.levelLabel, "NIVEL 4 · Warning Fatigue");
  assert.equal(active.warningCount, 20);
  assert.equal(active.warningLabel, "⚠ WARNINGS 20/20");
  assert.equal(active.cooldown.mode, "active");
  assert.equal(active.cooldown.progress, 0.5);

  const cooling = cooldownHudState({ cooldownRemaining: 1.5 });
  assert.equal(cooling.mode, "cooldown");
  assert.equal(cooling.progress, 0.25);
  assert.match(cooling.label, /1\.5s/);

  const ready = cooldownHudState();
  assert.deepEqual(ready, {
    mode: "ready",
    label: "COMMENT LISTO [Shift/C]",
    progress: 1,
    remaining: 0,
  });
  assert.equal(normalizeWarningCount(Number.NaN), 0);
  assert.equal(normalizeWarningCount(-3), 0);
});

// Validates: Requirements 10.2, 19.2

test("every gameplay theme enforces accessible role-to-background contrast", () => {
  for (const [themeId, sourcePalette] of Object.entries(TILE_THEME_PALETTES)) {
    const palette = createAccessibleGameplayPalette(sourcePalette);
    for (const role of ["platform", "danger", "checkpoint", "accent", "mechanic", "warning"]) {
      assert.ok(
        contrastRatio(palette[role], palette.background) >= 3,
        `${themeId}.${role} must reach 3:1 contrast`,
      );
    }
    for (const role of ["player", "ui"]) {
      assert.ok(
        contrastRatio(palette[role], palette.background) >= 4.5,
        `${themeId}.${role} must reach 4.5:1 contrast`,
      );
    }
  }
});

// Validates: Requirements 5.3, 6.7, 10.2, 19.3

test("visual interpolation helpers stay bounded and progress toward their targets", () => {
  const start = { x: 1200, y: 120 };
  const end = { x: 400, y: 500 };
  assert.deepEqual(garbageCollectorApproachPosition(-1, start, end), start);
  assert.deepEqual(garbageCollectorApproachPosition(1, start, end), end);
  assert.deepEqual(garbageCollectorApproachPosition(0.5, start, end), { x: 800, y: 310 });

  assert.ok(ghostTrailOpacity(0, 8) > ghostTrailOpacity(7, 8));
  assert.ok(ghostTrailOpacity(7, 8) > 0);
  assert.equal(themeTransitionOpacity(0), 1);
  assert.equal(themeTransitionOpacity(0.1), 0.5);
  assert.equal(themeTransitionOpacity(1), 0);
});
