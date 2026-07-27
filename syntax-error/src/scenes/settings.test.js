import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SETTINGS_VALUES,
  SETTINGS_ITEMS,
  SETTINGS_THEMES,
  clampVolume,
  createMemorySettingsStore,
  createSettingsContract,
  createSettingsModel,
  formatVolumeBar,
  moveSettingsSelection,
  normalizeSettingsValues,
  readCurrentSettings,
  resolveSettingsReturn,
  settingsCommandFromPressedKeys,
} from "./settings.js";

// Validates: Requirements 15.2, 15.3
// Property 11 is scheduled separately in task 6.5; these are focused examples.
test("volume values are clamped and rounded to 0.1 increments", () => {
  assert.equal(clampVolume(-2), 0);
  assert.equal(clampVolume(2), 1);
  assert.equal(clampVolume(0.34), 0.3);
  assert.equal(clampVolume(0.35), 0.4);
  assert.equal(clampVolume(Number.NaN, 0.7), 0.7);
  assert.equal(formatVolumeBar(0.5), "[#####-----]");
});

// Validates: Requirements 15.6
test("current values accept the UI and future SaveManager shapes with safe defaults", () => {
  assert.deepEqual(
    normalizeSettingsValues({
      audioVolume: { music: 0.26, sfx: 3 },
      currentTheme: "blueprint",
    }),
    { musicVolume: 0.3, sfxVolume: 1, theme: "blueprint" },
  );
  assert.deepEqual(
    readCurrentSettings(() => { throw new Error("not ready"); }),
    DEFAULT_SETTINGS_VALUES,
  );
  assert.deepEqual(
    normalizeSettingsValues({ theme: "invalid" }),
    DEFAULT_SETTINGS_VALUES,
  );
});

test("in-memory fallback remains functional without future managers", () => {
  const store = createMemorySettingsStore();

  assert.equal(store.setMusicVolume(0.86), 0.9);
  assert.equal(store.setSfxVolume(-1), 0);
  assert.equal(store.setTheme("bsod"), "bsod");
  assert.deepEqual(store.getValues(), {
    musicVolume: 0.9,
    sfxVolume: 0,
    theme: "bsod",
  });
});

// Validates: Requirements 15.2
test("keyboard navigation covers all controls and wraps at both ends", () => {
  for (const key of ["up", "w"]) {
    assert.equal(settingsCommandFromPressedKeys([key]), "previous");
  }
  for (const key of ["down", "s"]) {
    assert.equal(settingsCommandFromPressedKeys([key]), "next");
  }
  for (const key of ["left", "a"]) {
    assert.equal(settingsCommandFromPressedKeys([key]), "decrease");
  }
  for (const key of ["right", "d"]) {
    assert.equal(settingsCommandFromPressedKeys([key]), "increase");
  }
  for (const key of ["enter", "space"]) {
    assert.equal(settingsCommandFromPressedKeys([key]), "confirm");
  }
  for (const key of ["escape", "backspace"]) {
    assert.equal(settingsCommandFromPressedKeys([key]), "back");
  }

  assert.equal(moveSettingsSelection(0, -1), SETTINGS_ITEMS.length - 1);
  assert.equal(
    moveSettingsSelection(SETTINGS_ITEMS.length - 1, 1),
    0,
  );
  assert.throws(() => moveSettingsSelection(0, 1, 0), RangeError);
});

// Validates: Requirements 15.2, 15.3, 15.6
test("volume changes update state and invoke injected callbacks synchronously", () => {
  const events = [];
  const model = createSettingsModel(DEFAULT_SETTINGS_VALUES, {
    onMusicVolumeChange: (value) => events.push(["music", value]),
    onSfxVolumeChange: (value) => events.push(["sfx", value]),
  });

  const musicChange = model.adjust(1);
  assert.deepEqual(events, [["music", 0.6]]);
  assert.equal(musicChange.changed, true);
  assert.equal(model.values.musicVolume, 0.6);

  model.move(1);
  model.adjust(-1);
  assert.deepEqual(events, [["music", 0.6], ["sfx", 0.6]]);
  assert.equal(model.values.sfxVolume, 0.6);
});

// Validates: Requirements 15.2, 15.3
test("theme selector exposes and immediately selects all five themes", () => {
  const selectedThemes = [];
  const model = createSettingsModel(DEFAULT_SETTINGS_VALUES, {
    onThemeChange: (theme) => selectedThemes.push(theme),
  });
  model.move(1);
  model.move(1);

  for (let index = 1; index < SETTINGS_THEMES.length; index += 1) {
    const change = model.adjust(1);
    assert.equal(change.changed, true);
    assert.equal(model.values.theme, SETTINGS_THEMES[index].id);
    assert.equal(selectedThemes.at(-1), SETTINGS_THEMES[index].id);
  }
  model.adjust(1);
  assert.equal(model.values.theme, SETTINGS_THEMES[0].id);
  assert.equal(SETTINGS_THEMES.length, 5);
  assert.deepEqual(
    SETTINGS_THEMES.map(({ name }) => name),
    ["Terminal Retro", "IDE Dark", "IDE Light", "Blueprint", "BSOD"],
  );
});

test("injected contract reads current values and survives callback failures", () => {
  const callbackValues = [];
  const contract = createSettingsContract({
    valuesProvider: () => ({
      musicVolume: 0.2,
      sfxVolume: 0.4,
      theme: "light",
    }),
    onMusicVolumeChange: (value) => callbackValues.push(value),
    onThemeChange: () => { throw new Error("manager unavailable"); },
  });

  assert.deepEqual(contract.readValues(), {
    musicVolume: 0.2,
    sfxVolume: 0.4,
    theme: "light",
  });
  assert.equal(contract.setMusicVolume(0.31), 0.3);
  assert.deepEqual(callbackValues, [0.3]);
  assert.doesNotThrow(() => contract.setTheme("bsod"));
});

// Validates: Requirements 15.4, 15.5
test("return preserves the opening origin and opaque paused context", () => {
  const pausedState = { scene: "game", playerPosition: { x: 320, y: 480 } };
  assert.deepEqual(resolveSettingsReturn({
    origin: "pause",
    returnContext: pausedState,
  }), {
    origin: "pause",
    returnContext: pausedState,
  });
  assert.deepEqual(resolveSettingsReturn(), {
    origin: "menu",
    returnContext: undefined,
  });

  const model = createSettingsModel();
  model.move(-1);
  assert.equal(model.selectedItem.id, "back");
  assert.equal(model.confirm().kind, "back");
});
