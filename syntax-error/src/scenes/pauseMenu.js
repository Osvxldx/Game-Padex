import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants.js";
import {
  DEFAULT_SETTINGS_VALUES,
  SETTINGS_ITEMS,
  SETTINGS_KEY_GROUPS,
  SETTINGS_THEMES,
  createSettingsModel,
  formatVolumeBar,
  settingsCommandFromPressedKeys,
} from "./settings.js";

export const PAUSE_OPTIONS = Object.freeze([
  Object.freeze({ id: "continue", label: "Continuar" }),
  Object.freeze({ id: "restart", label: "Reiniciar nivel" }),
  Object.freeze({ id: "settings", label: "Configuración" }),
  Object.freeze({ id: "menu", label: "Volver al Menú" }),
]);

export const PAUSE_MODES = Object.freeze({
  RUNNING: "running",
  PAUSED: "paused",
  SETTINGS: "settings",
});

const PAUSE_KEY_GROUPS = Object.freeze({
  previous: Object.freeze(["up", "w"]),
  next: Object.freeze(["down", "s"]),
  confirm: Object.freeze(["enter", "space"]),
});

export function movePauseSelection(currentIndex, direction, count = PAUSE_OPTIONS.length) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError("count must be a positive integer");
  }
  const normalized = ((Math.trunc(currentIndex) % count) + count) % count;
  if (direction === 0) return normalized;
  return (normalized + Math.sign(direction) + count) % count;
}

export function createPauseMenuModel() {
  let mode = PAUSE_MODES.RUNNING;
  let selectedIndex = 0;

  return Object.freeze({
    get mode() {
      return mode;
    },
    get selectedIndex() {
      return selectedIndex;
    },
    get selectedOption() {
      return PAUSE_OPTIONS[selectedIndex];
    },
    open() {
      if (mode !== PAUSE_MODES.RUNNING) return false;
      mode = PAUSE_MODES.PAUSED;
      selectedIndex = 0;
      return true;
    },
    resume() {
      if (mode !== PAUSE_MODES.PAUSED) return false;
      mode = PAUSE_MODES.RUNNING;
      return true;
    },
    openSettings() {
      if (mode !== PAUSE_MODES.PAUSED) return false;
      mode = PAUSE_MODES.SETTINGS;
      return true;
    },
    closeSettings() {
      if (mode !== PAUSE_MODES.SETTINGS) return false;
      mode = PAUSE_MODES.PAUSED;
      return true;
    },
    move(direction) {
      if (mode !== PAUSE_MODES.PAUSED) return this.selectedOption;
      selectedIndex = movePauseSelection(selectedIndex, direction);
      return this.selectedOption;
    },
  });
}

function addOverlayRoot(k, title, subtitle) {
  const root = k.add([
    k.pos(0, 0),
    k.fixed(),
    k.z(1000),
    "pause-overlay",
  ]);
  root.add([
    k.rect(CANVAS_WIDTH, CANVAS_HEIGHT),
    k.pos(0, 0),
    k.anchor("topleft"),
    k.color(5, 8, 12),
    k.opacity(0.88),
  ]);
  root.add([
    k.text(title, { size: 52 }),
    k.pos(CANVAS_WIDTH / 2, 95),
    k.anchor("center"),
    k.color(63, 185, 80),
  ]);
  root.add([
    k.text(subtitle, { size: 18 }),
    k.pos(CANVAS_WIDTH / 2, 145),
    k.anchor("center"),
    k.color(139, 148, 158),
  ]);
  return root;
}

function pressedCommand(k, groups, order) {
  const pressed = Object.values(groups)
    .flat()
    .filter((key) => k.isKeyPressed(key));
  for (const command of order) {
    if (groups[command].some((key) => pressed.includes(key))) return command;
  }
  return null;
}

/**
 * Pause stays in the gameplay scene. Only gameplayRoot is paused; this
 * controller and its overlays stay at scene root so keyboard navigation keeps
 * running while every gameplay child and timer is frozen recursively.
 */
export function createPauseRuntime(k, {
  gameplayRoot,
  settingsContract,
  onRestart,
  onMenu,
  onThemeChange,
} = {}) {
  if (!gameplayRoot) throw new TypeError("gameplayRoot is required");

  const model = createPauseMenuModel();
  let overlay = null;
  let settingsModel = null;
  let gameplayWasPaused = false;
  let transitioning = false;

  const destroyOverlay = () => {
    if (overlay?.exists?.()) overlay.destroy();
    overlay = null;
  };

  const renderPause = () => {
    destroyOverlay();
    overlay = addOverlayRoot(
      k,
      "PAUSA",
      "Toda la simulación está congelada",
    );
    const labels = PAUSE_OPTIONS.map((option, index) => overlay.add([
      k.text("", { size: 30 }),
      k.pos(CANVAS_WIDTH / 2, 245 + index * 62),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]));
    overlay.add([
      k.text("W/S o ↑/↓: navegar · Enter: elegir · Esc: continuar", { size: 17 }),
      k.pos(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    labels.forEach((label, index) => {
      const selected = index === model.selectedIndex;
      label.text = selected
        ? `> ${PAUSE_OPTIONS[index].label} <`
        : PAUSE_OPTIONS[index].label;
      label.color = selected ? k.rgb(88, 166, 255) : k.rgb(201, 209, 217);
    });
  };

  const createOverlaySettingsModel = () => createSettingsModel(
    settingsContract?.readValues?.() ?? DEFAULT_SETTINGS_VALUES,
    {
      onMusicVolumeChange: (value) => settingsContract?.setMusicVolume?.(value),
      onSfxVolumeChange: (value) => settingsContract?.setSfxVolume?.(value),
      onThemeChange: (value) => {
        settingsContract?.setTheme?.(value);
        onThemeChange?.(value);
      },
    },
  );

  const renderSettings = () => {
    destroyOverlay();
    overlay = addOverlayRoot(
      k,
      "CONFIGURACIÓN",
      "Overlay activo · el nivel continúa pausado",
    );

    const music = overlay.add([
      k.text("", { size: 26 }),
      k.pos(CANVAS_WIDTH / 2, 220),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);
    const sfx = overlay.add([
      k.text("", { size: 26 }),
      k.pos(CANVAS_WIDTH / 2, 285),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);
    const theme = overlay.add([
      k.text("", { size: 26 }),
      k.pos(CANVAS_WIDTH / 2, 365),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);
    const themes = SETTINGS_THEMES.map((entry, index) => overlay.add([
      k.text(entry.name, { size: 17 }),
      k.pos(225 + index * 208, 425),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]));
    const back = overlay.add([
      k.text("", { size: 28 }),
      k.pos(CANVAS_WIDTH / 2, 515),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);
    overlay.add([
      k.text("W/S: navegar · A/D: ajustar · Esc: volver a Pausa", { size: 17 }),
      k.pos(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    const values = settingsModel.values;
    const selectedId = settingsModel.selectedItem.id;
    const selectedColor = k.rgb(88, 166, 255);
    const normalColor = k.rgb(201, 209, 217);
    const decorate = (id, text) => selectedId === id ? `> ${text} <` : text;
    music.text = decorate(
      "music",
      `Música  ${formatVolumeBar(values.musicVolume)}  ${values.musicVolume.toFixed(1)}`,
    );
    sfx.text = decorate(
      "sfx",
      `SFX     ${formatVolumeBar(values.sfxVolume)}  ${values.sfxVolume.toFixed(1)}`,
    );
    const selectedTheme = SETTINGS_THEMES.find(({ id }) => id === values.theme);
    theme.text = decorate("theme", `Tema: ${selectedTheme.name}`);
    back.text = decorate("back", "Volver a Pausa");
    music.color = selectedId === "music" ? selectedColor : normalColor;
    sfx.color = selectedId === "sfx" ? selectedColor : normalColor;
    theme.color = selectedId === "theme" ? selectedColor : normalColor;
    back.color = selectedId === "back" ? selectedColor : normalColor;
    themes.forEach((object, index) => {
      const active = SETTINGS_THEMES[index].id === values.theme;
      object.text = active ? `[ ${SETTINGS_THEMES[index].name} ]` : SETTINGS_THEMES[index].name;
      object.color = active ? k.rgb(63, 185, 80) : k.rgb(139, 148, 158);
    });
  };

  const openPause = () => {
    if (!model.open()) return false;
    gameplayWasPaused = Boolean(gameplayRoot.paused);
    gameplayRoot.paused = true;
    renderPause();
    return true;
  };

  const resume = () => {
    if (!model.resume()) return false;
    gameplayRoot.paused = gameplayWasPaused;
    destroyOverlay();
    settingsModel = null;
    return true;
  };

  const openSettings = () => {
    if (!model.openSettings()) return false;
    settingsModel = createOverlaySettingsModel();
    renderSettings();
    return true;
  };

  const closeSettings = () => {
    if (!model.closeSettings()) return false;
    settingsModel = null;
    renderPause();
    return true;
  };

  const restart = () => {
    if (transitioning || model.mode === PAUSE_MODES.RUNNING) return false;
    transitioning = true;
    if (typeof onRestart === "function") onRestart();
    return true;
  };

  const returnToMenu = () => {
    if (transitioning || model.mode === PAUSE_MODES.RUNNING) return false;
    transitioning = true;
    if (typeof onMenu === "function") onMenu();
    return true;
  };

  const activatePauseSelection = () => {
    switch (model.selectedOption.id) {
      case "continue": return resume();
      case "restart": return restart();
      case "settings": return openSettings();
      case "menu": return returnToMenu();
      default: return false;
    }
  };

  const controller = k.add([{
    id: "pause-runtime-controller",
    update() {
      if (transitioning) return;
      const modeAtFrameStart = model.mode;

      if (modeAtFrameStart === PAUSE_MODES.RUNNING) {
        if (k.isKeyPressed("escape")) openPause();
        return;
      }

      if (modeAtFrameStart === PAUSE_MODES.SETTINGS) {
        const pressed = Object.values(SETTINGS_KEY_GROUPS)
          .flat()
          .filter((key) => k.isKeyPressed(key));
        const command = settingsCommandFromPressedKeys(pressed);
        if (command === "back") {
          closeSettings();
        } else if (command === "previous") {
          settingsModel.move(-1);
          renderSettings();
        } else if (command === "next") {
          settingsModel.move(1);
          renderSettings();
        } else if (command === "decrease") {
          settingsModel.adjust(-1);
          renderSettings();
        } else if (command === "increase") {
          settingsModel.adjust(1);
          renderSettings();
        } else if (command === "confirm") {
          const action = settingsModel.confirm();
          if (action.kind === "back") closeSettings();
          else renderSettings();
        }
        return;
      }

      if (k.isKeyPressed("escape")) {
        resume();
        return;
      }
      const command = pressedCommand(
        k,
        PAUSE_KEY_GROUPS,
        ["previous", "next", "confirm"],
      );
      if (command === "previous") {
        model.move(-1);
        renderPause();
      } else if (command === "next") {
        model.move(1);
        renderPause();
      } else if (command === "confirm") {
        activatePauseSelection();
      }
    },
    destroy() {
      destroyOverlay();
    },
  }, "pause-runtime-controller"]);

  return Object.freeze({
    openPause,
    resume,
    openSettings,
    closeSettings,
    restart,
    returnToMenu,
    activatePauseSelection,
    getState: () => Object.freeze({
      mode: model.mode,
      selectedIndex: model.selectedIndex,
      selectedId: model.selectedOption.id,
      options: PAUSE_OPTIONS.map(({ id, label }) => ({ id, label })),
      gameplayPaused: Boolean(gameplayRoot.paused),
      settingsSelectedId: settingsModel?.selectedItem.id ?? null,
      settingsValues: settingsModel?.values
        ?? settingsContract?.readValues?.()
        ?? DEFAULT_SETTINGS_VALUES,
    }),
    controller,
  });
}
