/**
 * ThemeManager - Sistema de temas visuales para Syntax Error
 *
 * Gestiona 5 temas seleccionables, notifica a listeners cuando
 * el tema cambia y persiste la selección vía SaveManager.
 *
 * @module ThemeManager
 */

import saveManager from "./saveManager.js";

/**
 * Paletas de colores para cada tema.
 * Cada tema define: background, platform, player, danger, ui, accent, text.
 */
const THEMES = {
  terminal: {
    name: "Terminal Retro",
    colors: {
      background: "#0d1117",
      platform: "#30363d",
      player: "#58a6ff",
      danger: "#f85149",
      ui: "#c9d1d9",
      accent: "#3fb950",
      text: "#f0f6fc",
    },
  },
  dark: {
    name: "IDE Dark",
    colors: {
      background: "#1e1e1e",
      platform: "#2d2d2d",
      player: "#569cd6",
      danger: "#f44747",
      ui: "#d4d4d4",
      accent: "#4ec9b0",
      text: "#ffffff",
    },
  },
  light: {
    name: "IDE Light",
    colors: {
      background: "#ffffff",
      platform: "#e0e0e0",
      player: "#0000ff",
      danger: "#cd3131",
      ui: "#333333",
      accent: "#008000",
      text: "#000000",
    },
  },
  blueprint: {
    name: "Blueprint",
    colors: {
      background: "#1a237e",
      platform: "#3949ab",
      player: "#ffffff",
      danger: "#ff5252",
      ui: "#bbdefb",
      accent: "#69f0ae",
      text: "#e8eaf6",
    },
  },
  bsod: {
    name: "BSOD",
    colors: {
      background: "#0000aa",
      platform: "#0000dd",
      player: "#ffffff",
      danger: "#ff0000",
      ui: "#aaaaaa",
      accent: "#55ff55",
      text: "#ffffff",
    },
  },
};

const VALID_THEME_KEYS = Object.keys(THEMES);
const DEFAULT_THEME = "terminal";

class ThemeManager {
  constructor() {
    /** @type {string} */
    this.currentTheme = DEFAULT_THEME;
    /** @type {Array<function>} */
    this._listeners = [];
    this._initialize();
  }

  /**
   * Load the saved theme from SaveManager on initialization.
   * Falls back to "terminal" if the saved value is invalid or missing.
   * @private
   */
  _initialize() {
    const savedTheme = saveManager.getState().currentTheme;
    if (VALID_THEME_KEYS.includes(savedTheme)) {
      this.currentTheme = savedTheme;
    } else {
      this.currentTheme = DEFAULT_THEME;
    }
  }

  /**
   * Apply a theme by name. Validates the theme, updates current state,
   * persists via SaveManager, and notifies all listeners.
   *
   * Must complete in <200ms for all visible elements.
   *
   * @param {string} themeName - One of: "terminal", "dark", "light", "blueprint", "bsod"
   * @returns {boolean} true if the theme was applied successfully, false if invalid
   */
  applyTheme(themeName) {
    if (!VALID_THEME_KEYS.includes(themeName)) {
      return false;
    }

    this.currentTheme = themeName;
    saveManager.setTheme(themeName);
    this._notifyListeners();
    return true;
  }

  /**
   * Register a callback to be invoked whenever the theme changes.
   * The callback receives the theme data object: { name, colors }.
   *
   * @param {function} callback - Function called with the new theme data
   * @returns {function} Unsubscribe function to remove the listener
   */
  onThemeChange(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Get the current theme data (name + colors).
   * @returns {{ name: string, colors: object }}
   */
  getTheme() {
    return THEMES[this.currentTheme];
  }

  /**
   * Get the current theme key (e.g., "terminal", "dark").
   * @returns {string}
   */
  getThemeKey() {
    return this.currentTheme;
  }

  /**
   * Get all available themes as an object keyed by theme ID.
   * @returns {object}
   */
  getAvailableThemes() {
    return { ...THEMES };
  }

  /**
   * Notify all registered listeners with the current theme data.
   * @private
   */
  _notifyListeners() {
    const themeData = this.getTheme();
    for (const listener of this._listeners) {
      listener(themeData);
    }
  }
}

// Singleton instance
const themeManager = new ThemeManager();

export default themeManager;
export { ThemeManager, THEMES, VALID_THEME_KEYS, DEFAULT_THEME };
