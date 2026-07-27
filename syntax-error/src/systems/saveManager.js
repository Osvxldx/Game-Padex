/**
 * SaveManager - Sistema de persistencia para Syntax Error
 *
 * Gestiona el guardado y carga del estado del juego en LocalStorage.
 * Garantiza invariantes de progresión secuencial y maneja errores
 * de forma silenciosa sin interrumpir la sesión activa.
 *
 * @module SaveManager
 */

const STORAGE_KEY = "syntax-error-save";

const VALID_THEMES = ["terminal", "dark", "light", "blueprint", "bsod"];

const DEFAULT_STATE = {
  levelsCompleted: [false, false, false, false, false],
  currentTheme: "terminal",
  audioVolume: { music: 0.5, sfx: 0.7 },
  memoryAddresses: [],
};

/**
 * Clamp a number to [0.0, 1.0] and round to nearest 0.1 increment.
 * @param {number} value
 * @returns {number}
 */
function clampVolume(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0.5;
  }
  const clamped = Math.max(0.0, Math.min(1.0, value));
  return Math.round(clamped * 10) / 10;
}

/**
 * Enforce the sequential progression invariant:
 * if level N is completed, all levels < N must also be completed.
 * @param {boolean[]} levels
 * @returns {boolean[]}
 */
function enforceSequentialProgression(levels) {
  if (!Array.isArray(levels) || levels.length !== 5) {
    return [...DEFAULT_STATE.levelsCompleted];
  }

  const result = [false, false, false, false, false];
  // Find the highest completed level
  let highestCompleted = -1;
  for (let i = 4; i >= 0; i--) {
    if (levels[i] === true) {
      highestCompleted = i;
      break;
    }
  }

  // Mark all levels up to and including highestCompleted as true
  for (let i = 0; i <= highestCompleted; i++) {
    result[i] = true;
  }

  return result;
}

/**
 * Validate that a theme string is one of the valid themes.
 * Falls back to "terminal" if invalid.
 * @param {string} theme
 * @returns {string}
 */
function validateTheme(theme) {
  if (typeof theme === "string" && VALID_THEMES.includes(theme)) {
    return theme;
  }
  return "terminal";
}

/**
 * Validate and normalize the audioVolume object.
 * @param {object} audioVolume
 * @returns {{music: number, sfx: number}}
 */
function validateAudioVolume(audioVolume) {
  if (
    audioVolume === null ||
    audioVolume === undefined ||
    typeof audioVolume !== "object"
  ) {
    return { music: 0.5, sfx: 0.7 };
  }
  return {
    music: clampVolume(audioVolume.music),
    sfx: clampVolume(audioVolume.sfx),
  };
}

/**
 * Validate and normalize the memoryAddresses array.
 * @param {*} addresses
 * @returns {string[]}
 */
function validateMemoryAddresses(addresses) {
  if (!Array.isArray(addresses)) {
    return [];
  }
  return addresses.filter((addr) => typeof addr === "string");
}

/**
 * Validate a raw parsed object and produce a valid GameState.
 * Any invalid or missing fields are replaced with defaults.
 * @param {*} data
 * @returns {object} A valid GameState
 */
function validateState(data) {
  if (data === null || data === undefined || typeof data !== "object") {
    return { ...DEFAULT_STATE, levelsCompleted: [...DEFAULT_STATE.levelsCompleted], audioVolume: { ...DEFAULT_STATE.audioVolume }, memoryAddresses: [...DEFAULT_STATE.memoryAddresses] };
  }

  const levelsCompleted = enforceSequentialProgression(data.levelsCompleted);
  const currentTheme = validateTheme(data.currentTheme);
  const audioVolume = validateAudioVolume(data.audioVolume);
  const memoryAddresses = validateMemoryAddresses(data.memoryAddresses);

  return { levelsCompleted, currentTheme, audioVolume, memoryAddresses };
}

class SaveManager {
  constructor() {
    this.state = null;
    this.onSaveFailed = null;
    this._load();
  }

  /**
   * Serialize the current state to a JSON string.
   * @returns {string}
   */
  serialize() {
    return JSON.stringify(this.state);
  }

  /**
   * Deserialize a JSON string into a valid GameState.
   * Returns defaults if the string is invalid or has bad structure.
   * @param {string} json
   * @returns {object} A valid GameState
   */
  deserialize(json) {
    try {
      const parsed = JSON.parse(json);
      return validateState(parsed);
    } catch {
      return validateState(null);
    }
  }

  /**
   * Load state from LocalStorage. If data is missing, corrupt,
   * or invalid, initializes with defaults silently.
   * @private
   */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        this.state = validateState(null);
        return;
      }
      this.state = this.deserialize(raw);
    } catch {
      // LocalStorage inaccessible or other error
      this.state = validateState(null);
    }
  }

  /**
   * Load state from LocalStorage (public interface).
   * Returns the current state after loading.
   * @returns {object} The loaded GameState
   */
  load() {
    this._load();
    return this.state;
  }

  /**
   * Save the current state to LocalStorage.
   * On failure, retries once. If both attempts fail, notifies via
   * onSaveFailed callback without interrupting the session.
   * @returns {boolean} true if save succeeded, false otherwise
   */
  save() {
    const json = this.serialize();
    if (this._tryWrite(json)) {
      return true;
    }
    // Retry once
    if (this._tryWrite(json)) {
      return true;
    }
    // Both attempts failed - notify without interrupting
    this._notifySaveFailed();
    return false;
  }

  /**
   * Attempt to write to LocalStorage.
   * @param {string} json
   * @returns {boolean}
   * @private
   */
  _tryWrite(json) {
    try {
      localStorage.setItem(STORAGE_KEY, json);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Notify that save failed via callback/event pattern.
   * @private
   */
  _notifySaveFailed() {
    if (typeof this.onSaveFailed === "function") {
      this.onSaveFailed();
    }
  }

  /**
   * Reset state to defaults and persist.
   */
  reset() {
    this.state = validateState(null);
    this.save();
  }

  /**
   * Mark a level as completed. Enforces sequential progression:
   * completing level N also marks all levels < N as completed.
   * @param {number} levelId - Level index (0-4)
   */
  completeLevel(levelId) {
    if (typeof levelId !== "number" || levelId < 0 || levelId > 4) {
      return;
    }
    const id = Math.floor(levelId);
    // Mark this level and all previous levels as completed
    for (let i = 0; i <= id; i++) {
      this.state.levelsCompleted[i] = true;
    }
    this.save();
  }

  /**
   * Set the current theme. Validates against allowed themes.
   * Falls back to "terminal" if invalid.
   * @param {string} theme
   */
  setTheme(theme) {
    this.state.currentTheme = validateTheme(theme);
    this.save();
  }

  /**
   * Set volume for music or sfx.
   * Clamps to [0.0, 1.0] and rounds to nearest 0.1.
   * @param {string} type - "music" or "sfx"
   * @param {number} value - Volume value
   */
  setVolume(type, value) {
    if (type !== "music" && type !== "sfx") {
      return;
    }
    this.state.audioVolume[type] = clampVolume(value);
    this.save();
  }

  /**
   * Get the current game state (deep copy).
   * @returns {object}
   */
  getState() {
    return {
      levelsCompleted: [...this.state.levelsCompleted],
      currentTheme: this.state.currentTheme,
      audioVolume: { ...this.state.audioVolume },
      memoryAddresses: [...this.state.memoryAddresses],
    };
  }
}

// Singleton instance
const saveManager = new SaveManager();

export default saveManager;
export {
  SaveManager,
  DEFAULT_STATE,
  VALID_THEMES,
  STORAGE_KEY,
  clampVolume,
  enforceSequentialProgression,
  validateTheme,
  validateState,
};
