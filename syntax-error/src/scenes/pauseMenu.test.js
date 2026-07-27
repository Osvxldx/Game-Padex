import assert from "node:assert/strict";
import test from "node:test";

import {
  RESPAWN_DELAY,
} from "../constants.js";
import { createDeathRespawnMachine } from "../systems/deathRespawn.js";
import {
  PAUSE_MODES,
  PAUSE_OPTIONS,
  createPauseMenuModel,
  movePauseSelection,
} from "./pauseMenu.js";

// Validates: Requirements 13.5, 13.6, 13.7, 13.8

test("pause menu exposes all required actions in stable order", () => {
  assert.deepEqual(
    PAUSE_OPTIONS.map(({ id, label }) => ({ id, label })),
    [
      { id: "continue", label: "Continuar" },
      { id: "restart", label: "Reiniciar nivel" },
      { id: "settings", label: "Configuración" },
      { id: "menu", label: "Volver al Menú" },
    ],
  );
});

test("pause selection wraps and only moves while the pause menu is active", () => {
  assert.equal(movePauseSelection(0, -1), 3);
  assert.equal(movePauseSelection(3, 1), 0);
  assert.throws(() => movePauseSelection(0, 1, 0), RangeError);

  const model = createPauseMenuModel();
  model.move(1);
  assert.equal(model.selectedIndex, 0);
  assert.equal(model.open(), true);
  model.move(-1);
  assert.equal(model.selectedOption.id, "menu");
});

// Integration between pause and death clocks: a paused/settings interval does
// not advance the death timer; the exact remainder continues after resume.
test("pause and settings freeze death/respawn progress until exact resume", () => {
  const pause = createPauseMenuModel();
  const death = createDeathRespawnMachine();
  death.requestDeath("lethal");
  death.advance(0.1);
  const beforePause = death.getState().deathRemaining;

  assert.equal(pause.open(), true);
  assert.equal(pause.mode, PAUSE_MODES.PAUSED);
  assert.equal(pause.openSettings(), true);
  assert.equal(pause.mode, PAUSE_MODES.SETTINGS);
  // The gameplay loop deliberately does not call death.advance while paused.
  assert.equal(death.getState().deathRemaining, beforePause);
  assert.equal(pause.closeSettings(), true);
  assert.equal(death.getState().deathRemaining, beforePause);
  assert.equal(pause.resume(), true);

  const transition = death.advance(RESPAWN_DELAY - 0.1);
  assert.equal(transition.respawned, true);
  assert.equal(pause.mode, PAUSE_MODES.RUNNING);
});

test("settings returns to the same paused selection instead of rebuilding gameplay", () => {
  const model = createPauseMenuModel();
  model.open();
  model.move(1);
  model.move(1);
  assert.equal(model.selectedOption.id, "settings");
  model.openSettings();
  model.closeSettings();

  assert.equal(model.mode, PAUSE_MODES.PAUSED);
  assert.equal(model.selectedOption.id, "settings");
  assert.equal(model.resume(), true);
});
