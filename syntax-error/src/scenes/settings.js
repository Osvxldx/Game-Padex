import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants.js";

export const SETTINGS_SCENE = "settings";
export const DEFAULT_SETTINGS_ORIGIN = "menu";
export const VOLUME_STEP = 0.1;

export const SETTINGS_THEMES = Object.freeze([
  Object.freeze({ id: "terminal", name: "Terminal Retro" }),
  Object.freeze({ id: "dark", name: "IDE Dark" }),
  Object.freeze({ id: "light", name: "IDE Light" }),
  Object.freeze({ id: "blueprint", name: "Blueprint" }),
  Object.freeze({ id: "bsod", name: "BSOD" }),
]);

export const DEFAULT_SETTINGS_VALUES = Object.freeze({
  musicVolume: 0.5,
  sfxVolume: 0.7,
  theme: "terminal",
});

export const SETTINGS_ITEMS = Object.freeze([
  Object.freeze({ id: "music", label: "Volumen de música" }),
  Object.freeze({ id: "sfx", label: "Volumen de SFX" }),
  Object.freeze({ id: "theme", label: "Tema visual" }),
  Object.freeze({ id: "back", label: "Volver" }),
]);

export const SETTINGS_KEY_GROUPS = Object.freeze({
  previous: Object.freeze(["up", "w"]),
  next: Object.freeze(["down", "s"]),
  decrease: Object.freeze(["left", "a"]),
  increase: Object.freeze(["right", "d"]),
  confirm: Object.freeze(["enter", "space"]),
  back: Object.freeze(["escape", "backspace"]),
});

export function clampVolume(value, fallback = 0) {
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  const numericValue = Number.isFinite(value) ? value : safeFallback;
  const clamped = Math.min(1, Math.max(0, numericValue));
  return Math.round(clamped * 10) / 10;
}

export function normalizeThemeId(theme, fallback = "terminal") {
  if (SETTINGS_THEMES.some(({ id }) => id === theme)) return theme;
  if (SETTINGS_THEMES.some(({ id }) => id === fallback)) return fallback;
  return DEFAULT_SETTINGS_VALUES.theme;
}

export function normalizeSettingsValues(
  candidate = DEFAULT_SETTINGS_VALUES,
  fallback = DEFAULT_SETTINGS_VALUES,
) {
  const fallbackMusic = clampVolume(
    fallback?.musicVolume ?? fallback?.audioVolume?.music,
    DEFAULT_SETTINGS_VALUES.musicVolume,
  );
  const fallbackSfx = clampVolume(
    fallback?.sfxVolume ?? fallback?.audioVolume?.sfx,
    DEFAULT_SETTINGS_VALUES.sfxVolume,
  );
  const fallbackTheme = normalizeThemeId(
    fallback?.theme ?? fallback?.currentTheme,
    DEFAULT_SETTINGS_VALUES.theme,
  );

  return Object.freeze({
    musicVolume: clampVolume(
      candidate?.musicVolume ?? candidate?.audioVolume?.music,
      fallbackMusic,
    ),
    sfxVolume: clampVolume(
      candidate?.sfxVolume ?? candidate?.audioVolume?.sfx,
      fallbackSfx,
    ),
    theme: normalizeThemeId(
      candidate?.theme ?? candidate?.currentTheme,
      fallbackTheme,
    ),
  });
}

/**
 * Reads the future manager-compatible values contract safely. Both the direct
 * UI shape and the future SaveManager GameState shape are accepted.
 */
export function readCurrentSettings(
  valuesProvider,
  fallback = DEFAULT_SETTINGS_VALUES,
) {
  if (typeof valuesProvider !== "function") {
    return normalizeSettingsValues(fallback);
  }

  try {
    return normalizeSettingsValues(valuesProvider(), fallback);
  } catch {
    return normalizeSettingsValues(fallback);
  }
}

/**
 * In-memory fallback used until SaveManager, AudioManager and ThemeManager are
 * available. It deliberately owns no persistence, audio, or palette logic.
 */
export function createMemorySettingsStore(initialValues = DEFAULT_SETTINGS_VALUES) {
  let values = normalizeSettingsValues(initialValues);

  const replace = (nextValues) => {
    values = normalizeSettingsValues(nextValues, values);
    return values;
  };

  return Object.freeze({
    getValues: () => ({ ...values }),
    replace,
    setMusicVolume(value) {
      values = normalizeSettingsValues({
        ...values,
        musicVolume: value,
      }, values);
      return values.musicVolume;
    },
    setSfxVolume(value) {
      values = normalizeSettingsValues({
        ...values,
        sfxVolume: value,
      }, values);
      return values.sfxVolume;
    },
    setTheme(theme) {
      values = normalizeSettingsValues({ ...values, theme }, values);
      return values.theme;
    },
  });
}

/**
 * Injectable boundary for later managers. Setters update the safe fallback
 * first and invoke the supplied callback synchronously, so the UI never waits
 * for persistence or another frame before reflecting a change.
 */
export function createSettingsContract({
  valuesProvider,
  onMusicVolumeChange,
  onSfxVolumeChange,
  onThemeChange,
  initialValues = DEFAULT_SETTINGS_VALUES,
} = {}) {
  const memory = createMemorySettingsStore(initialValues);

  const notify = (callback, value) => {
    if (typeof callback !== "function") return;
    try {
      callback(value);
    } catch {
      // A future manager failure must not make the settings screen unusable.
    }
  };

  return Object.freeze({
    readValues() {
      const values = readCurrentSettings(valuesProvider, memory.getValues());
      memory.replace(values);
      return memory.getValues();
    },
    setMusicVolume(value) {
      const applied = memory.setMusicVolume(value);
      notify(onMusicVolumeChange, applied);
      return applied;
    },
    setSfxVolume(value) {
      const applied = memory.setSfxVolume(value);
      notify(onSfxVolumeChange, applied);
      return applied;
    },
    setTheme(theme) {
      const applied = memory.setTheme(theme);
      notify(onThemeChange, applied);
      return applied;
    },
  });
}

export function moveSettingsSelection(
  currentIndex,
  direction,
  itemCount = SETTINGS_ITEMS.length,
) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) {
    throw new RangeError("itemCount must be a positive integer");
  }

  const normalizedIndex = ((Math.trunc(currentIndex) % itemCount) + itemCount)
    % itemCount;
  if (direction === 0) return normalizedIndex;
  return (normalizedIndex + Math.sign(direction) + itemCount) % itemCount;
}

export function settingsCommandFromPressedKeys(pressedKeys) {
  const pressed = pressedKeys instanceof Set
    ? pressedKeys
    : new Set(pressedKeys);

  for (const command of [
    "previous",
    "next",
    "decrease",
    "increase",
    "confirm",
    "back",
  ]) {
    if (SETTINGS_KEY_GROUPS[command].some((key) => pressed.has(key))) {
      return command;
    }
  }

  return null;
}

export function createSettingsModel(initialValues, callbacks = {}) {
  let values = normalizeSettingsValues(initialValues);
  let selectedIndex = 0;

  const result = (kind, changed = false) => Object.freeze({
    kind,
    changed,
    values: { ...values },
  });

  const notify = (callback, value) => {
    if (typeof callback !== "function") return;
    try {
      callback(value);
    } catch {
      // Rendering and navigation remain available if an injected service fails.
    }
  };

  const setVolume = (type, value) => {
    const key = type === "music" ? "musicVolume" : "sfxVolume";
    const nextValue = clampVolume(value, values[key]);
    if (nextValue === values[key]) return result(type);

    values = Object.freeze({ ...values, [key]: nextValue });
    notify(
      type === "music"
        ? callbacks.onMusicVolumeChange
        : callbacks.onSfxVolumeChange,
      nextValue,
    );
    return result(type, true);
  };

  const setTheme = (theme) => {
    const nextTheme = normalizeThemeId(theme, values.theme);
    if (nextTheme === values.theme) return result("theme");

    values = Object.freeze({ ...values, theme: nextTheme });
    notify(callbacks.onThemeChange, nextTheme);
    return result("theme", true);
  };

  return {
    get values() {
      return { ...values };
    },
    get selectedIndex() {
      return selectedIndex;
    },
    get selectedItem() {
      return SETTINGS_ITEMS[selectedIndex];
    },
    move(direction) {
      selectedIndex = moveSettingsSelection(
        selectedIndex,
        direction,
        SETTINGS_ITEMS.length,
      );
      return SETTINGS_ITEMS[selectedIndex];
    },
    adjust(direction) {
      const stepDirection = Math.sign(direction);
      if (stepDirection === 0) return result(this.selectedItem.id);

      if (this.selectedItem.id === "music") {
        return setVolume("music", values.musicVolume + stepDirection * VOLUME_STEP);
      }
      if (this.selectedItem.id === "sfx") {
        return setVolume("sfx", values.sfxVolume + stepDirection * VOLUME_STEP);
      }
      if (this.selectedItem.id === "theme") {
        const currentIndex = SETTINGS_THEMES.findIndex(
          ({ id }) => id === values.theme,
        );
        const nextIndex = moveSettingsSelection(
          currentIndex,
          stepDirection,
          SETTINGS_THEMES.length,
        );
        return setTheme(SETTINGS_THEMES[nextIndex].id);
      }
      return result(this.selectedItem.id);
    },
    confirm() {
      if (this.selectedItem.id === "back") return result("back");
      if (this.selectedItem.id === "theme") return this.adjust(1);
      return result(this.selectedItem.id);
    },
  };
}

export function resolveSettingsReturn(context = {}) {
  const origin = typeof context?.origin === "string" && context.origin.trim()
    ? context.origin
    : DEFAULT_SETTINGS_ORIGIN;

  return Object.freeze({
    origin,
    returnContext: context?.returnContext,
  });
}

export function formatVolumeBar(value) {
  const filled = Math.round(clampVolume(value) * 10);
  return `[${"#".repeat(filled)}${"-".repeat(10 - filled)}]`;
}

function installSettingsSmokeApi(model, context, renderedValues) {
  if (typeof window === "undefined") return () => {};
  const params = new URLSearchParams(window.location.search);
  if (!params.has("smoke")) return () => {};

  const api = {
    getState: () => {
      const values = model.values;
      const theme = SETTINGS_THEMES.find(({ id }) => id === values.theme);
      return {
        scene: SETTINGS_SCENE,
        origin: context.origin,
        selectedIndex: model.selectedIndex,
        selectedId: model.selectedItem.id,
        values,
        themeName: theme.name,
        themes: SETTINGS_THEMES.map(({ id, name }) => ({ id, name })),
        renderedValues: renderedValues(),
      };
    },
  };
  globalThis.__syntaxErrorSettingsSmoke = api;

  return () => {
    if (globalThis.__syntaxErrorSettingsSmoke === api) {
      delete globalThis.__syntaxErrorSettingsSmoke;
    }
  };
}

/**
 * Registers a settings UI while delegating persistence, audio, and theme
 * application through injected callbacks. The opening context is
 * `{ origin, returnContext }`, allowing a future pause scene to restore its
 * own suspended state rather than sending the player through gameplay setup.
 */
export function registerSettingsScene(k, {
  sceneName = SETTINGS_SCENE,
  settingsProvider,
  onMusicVolumeChange,
  onSfxVolumeChange,
  onThemeChange,
  onBack,
} = {}) {
  const contract = createSettingsContract({
    valuesProvider: settingsProvider,
    onMusicVolumeChange,
    onSfxVolumeChange,
    onThemeChange,
  });

  k.scene(sceneName, (openingContext = {}) => {
    const context = resolveSettingsReturn(openingContext);
    const model = createSettingsModel(contract.readValues(), {
      onMusicVolumeChange: contract.setMusicVolume,
      onSfxVolumeChange: contract.setSfxVolume,
      onThemeChange: contract.setTheme,
    });

    k.add([
      k.rect(CANVAS_WIDTH, CANVAS_HEIGHT),
      k.pos(0, 0),
      k.anchor("topleft"),
      k.color(13, 17, 23),
    ]);

    k.add([
      k.text("CONFIGURACIÓN", { size: 52 }),
      k.pos(CANVAS_WIDTH / 2, 85),
      k.anchor("center"),
      k.color(63, 185, 80),
    ]);

    k.add([
      k.text("Los cambios se aplican inmediatamente", { size: 19 }),
      k.pos(CANVAS_WIDTH / 2, 130),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    const musicText = k.add([
      k.text("", { size: 28 }),
      k.pos(CANVAS_WIDTH / 2, 220),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);
    const sfxText = k.add([
      k.text("", { size: 28 }),
      k.pos(CANVAS_WIDTH / 2, 295),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);
    const themeText = k.add([
      k.text("", { size: 28 }),
      k.pos(CANVAS_WIDTH / 2, 385),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);

    const themeWidth = 205;
    const firstThemeX = CANVAS_WIDTH / 2
      - ((SETTINGS_THEMES.length - 1) * themeWidth) / 2;
    const themeObjects = SETTINGS_THEMES.map((theme, index) => k.add([
      k.text(theme.name, { size: 18 }),
      k.pos(firstThemeX + index * themeWidth, 445),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]));

    const backText = k.add([
      k.text("", { size: 30 }),
      k.pos(CANVAS_WIDTH / 2, 545),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]);

    k.add([
      k.text(
        "W/S o ↑/↓: navegar · A/D o ←/→: ajustar · Enter: elegir · Esc: volver",
        { size: 17 },
      ),
      k.pos(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    const render = () => {
      const values = model.values;
      const selectedId = model.selectedItem.id;
      const selectedColor = k.rgb(88, 166, 255);
      const normalColor = k.rgb(201, 209, 217);
      const decorate = (id, content) => selectedId === id
        ? `> ${content} <`
        : content;

      musicText.text = decorate(
        "music",
        `Música  ${formatVolumeBar(values.musicVolume)}  ${values.musicVolume.toFixed(1)}`,
      );
      musicText.color = selectedId === "music" ? selectedColor : normalColor;
      sfxText.text = decorate(
        "sfx",
        `SFX     ${formatVolumeBar(values.sfxVolume)}  ${values.sfxVolume.toFixed(1)}`,
      );
      sfxText.color = selectedId === "sfx" ? selectedColor : normalColor;

      const selectedTheme = SETTINGS_THEMES.find(({ id }) => id === values.theme);
      themeText.text = decorate("theme", `Tema: ${selectedTheme.name}`);
      themeText.color = selectedId === "theme" ? selectedColor : normalColor;
      themeObjects.forEach((object, index) => {
        const active = SETTINGS_THEMES[index].id === values.theme;
        object.text = active
          ? `[ ${SETTINGS_THEMES[index].name} ]`
          : SETTINGS_THEMES[index].name;
        object.color = active
          ? k.rgb(63, 185, 80)
          : k.rgb(139, 148, 158);
      });

      backText.text = decorate("back", "Volver");
      backText.color = selectedId === "back" ? selectedColor : normalColor;
    };

    let returning = false;
    const returnToOrigin = () => {
      if (returning) return;
      returning = true;

      if (typeof onBack === "function") {
        try {
          onBack(context);
          return;
        } catch {
          returning = false;
          return;
        }
      }
      k.go(context.origin, context.returnContext);
    };

    render();
    const uninstallSmokeApi = installSettingsSmokeApi(
      model,
      context,
      () => ({
        music: musicText.text,
        sfx: sfxText.text,
        theme: themeText.text,
      }),
    );

    k.add([{
      id: "settings-input-controller",
      update() {
        const pressedKeys = Object.values(SETTINGS_KEY_GROUPS)
          .flat()
          .filter((key) => k.isKeyPressed(key));
        const command = settingsCommandFromPressedKeys(pressedKeys);

        if (command === "previous") {
          model.move(-1);
          render();
        } else if (command === "next") {
          model.move(1);
          render();
        } else if (command === "decrease") {
          model.adjust(-1);
          render();
        } else if (command === "increase") {
          model.adjust(1);
          render();
        } else if (command === "confirm") {
          const action = model.confirm();
          if (action.kind === "back") returnToOrigin();
          else render();
        } else if (command === "back") {
          returnToOrigin();
        }
      },
      destroy() {
        uninstallSmokeApi();
      },
    }, "settings-input-controller"]);
  });

  return sceneName;
}
