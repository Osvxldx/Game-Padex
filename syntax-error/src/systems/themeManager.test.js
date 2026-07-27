import { describe, it, expect, beforeEach, vi } from "vitest";
import { ThemeManager, THEMES, VALID_THEME_KEYS, DEFAULT_THEME } from "./themeManager.js";
import saveManager from "./saveManager.js";

// Mock localStorage for Node environment
function createMockStorage() {
  let store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get _store() {
      return store;
    },
  };
}

beforeEach(() => {
  const mockStorage = createMockStorage();
  global.localStorage = mockStorage;
  // Reset the SaveManager singleton to defaults so each test starts clean
  saveManager.reset();
});

describe("THEMES constant", () => {
  it("defines exactly 5 themes", () => {
    expect(Object.keys(THEMES)).toHaveLength(5);
  });

  it("contains all expected theme keys", () => {
    expect(VALID_THEME_KEYS).toEqual(["terminal", "dark", "light", "blueprint", "bsod"]);
  });

  it("each theme has a name and colors object with all required keys", () => {
    const requiredColorKeys = ["background", "platform", "player", "danger", "ui", "accent", "text"];
    for (const key of VALID_THEME_KEYS) {
      expect(THEMES[key]).toHaveProperty("name");
      expect(typeof THEMES[key].name).toBe("string");
      expect(THEMES[key]).toHaveProperty("colors");
      for (const colorKey of requiredColorKeys) {
        expect(THEMES[key].colors).toHaveProperty(colorKey);
        expect(THEMES[key].colors[colorKey]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it("has correct display names for each theme", () => {
    expect(THEMES.terminal.name).toBe("Terminal Retro");
    expect(THEMES.dark.name).toBe("IDE Dark");
    expect(THEMES.light.name).toBe("IDE Light");
    expect(THEMES.blueprint.name).toBe("Blueprint");
    expect(THEMES.bsod.name).toBe("BSOD");
  });
});

describe("DEFAULT_THEME", () => {
  it("is 'terminal'", () => {
    expect(DEFAULT_THEME).toBe("terminal");
  });
});

describe("ThemeManager", () => {
  let manager;

  beforeEach(() => {
    manager = new ThemeManager();
  });

  describe("initialization", () => {
    it("initializes with 'terminal' theme when no saved theme exists", () => {
      expect(manager.currentTheme).toBe("terminal");
    });

    it("loads saved theme from SaveManager on init", () => {
      // Set a theme in SaveManager before creating ThemeManager
      saveManager.setTheme("dark");
      const mgr = new ThemeManager();
      expect(mgr.currentTheme).toBe("dark");
    });

    it("falls back to 'terminal' if saved theme is invalid", () => {
      // Force an invalid theme into localStorage directly
      localStorage.setItem("syntax-error-save", JSON.stringify({
        levelsCompleted: [false, false, false, false, false],
        currentTheme: "invalid-theme",
        audioVolume: { music: 0.5, sfx: 0.7 },
        memoryAddresses: [],
      }));
      // Reload saveManager so it picks up the invalid theme
      saveManager.load();
      const mgr = new ThemeManager();
      expect(mgr.currentTheme).toBe("terminal");
    });
  });

  describe("applyTheme", () => {
    it("applies a valid theme and updates currentTheme", () => {
      const result = manager.applyTheme("bsod");
      expect(result).toBe(true);
      expect(manager.currentTheme).toBe("bsod");
    });

    it("returns false for invalid theme name", () => {
      const result = manager.applyTheme("nonexistent");
      expect(result).toBe(false);
      expect(manager.currentTheme).toBe("terminal");
    });

    it("returns false for non-string values", () => {
      expect(manager.applyTheme(123)).toBe(false);
      expect(manager.applyTheme(null)).toBe(false);
      expect(manager.applyTheme(undefined)).toBe(false);
      expect(manager.currentTheme).toBe("terminal");
    });

    it("persists theme via SaveManager", () => {
      manager.applyTheme("blueprint");
      const stored = JSON.parse(localStorage.getItem("syntax-error-save"));
      expect(stored.currentTheme).toBe("blueprint");
    });

    it("notifies all registered listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      manager.onThemeChange(listener1);
      manager.onThemeChange(listener2);

      manager.applyTheme("dark");

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledWith(THEMES.dark);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledWith(THEMES.dark);
    });

    it("does not notify listeners for invalid theme", () => {
      const listener = vi.fn();
      manager.onThemeChange(listener);

      manager.applyTheme("invalid");

      expect(listener).not.toHaveBeenCalled();
    });

    it("can apply all 5 themes sequentially", () => {
      for (const key of VALID_THEME_KEYS) {
        const result = manager.applyTheme(key);
        expect(result).toBe(true);
        expect(manager.currentTheme).toBe(key);
      }
    });
  });

  describe("onThemeChange", () => {
    it("returns an unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = manager.onThemeChange(listener);
      expect(typeof unsubscribe).toBe("function");
    });

    it("unsubscribes correctly", () => {
      const listener = vi.fn();
      const unsubscribe = manager.onThemeChange(listener);

      manager.applyTheme("dark");
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      manager.applyTheme("light");
      expect(listener).toHaveBeenCalledTimes(1); // not called again
    });

    it("handles non-function gracefully", () => {
      const unsub = manager.onThemeChange("not-a-function");
      expect(typeof unsub).toBe("function");
      // Should not throw when applying theme
      expect(() => manager.applyTheme("dark")).not.toThrow();
    });

    it("supports multiple independent listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      const unsub1 = manager.onThemeChange(listener1);
      manager.onThemeChange(listener2);
      manager.onThemeChange(listener3);

      manager.applyTheme("light");
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      // Unsubscribe listener1 only
      unsub1();
      manager.applyTheme("bsod");
      expect(listener1).toHaveBeenCalledTimes(1); // unchanged
      expect(listener2).toHaveBeenCalledTimes(2);
      expect(listener3).toHaveBeenCalledTimes(2);
    });
  });

  describe("getTheme", () => {
    it("returns the current theme data", () => {
      const themeData = manager.getTheme();
      expect(themeData).toBe(THEMES.terminal);
      expect(themeData.name).toBe("Terminal Retro");
      expect(themeData.colors.background).toBe("#0d1117");
    });

    it("returns updated theme after apply", () => {
      manager.applyTheme("blueprint");
      const themeData = manager.getTheme();
      expect(themeData.name).toBe("Blueprint");
      expect(themeData.colors.background).toBe("#1a237e");
    });
  });

  describe("getThemeKey", () => {
    it("returns the current theme key string", () => {
      expect(manager.getThemeKey()).toBe("terminal");
      manager.applyTheme("dark");
      expect(manager.getThemeKey()).toBe("dark");
    });
  });

  describe("getAvailableThemes", () => {
    it("returns all themes", () => {
      const themes = manager.getAvailableThemes();
      expect(Object.keys(themes)).toHaveLength(5);
      expect(themes.terminal.name).toBe("Terminal Retro");
    });

    it("returns a copy so mutations don't affect the original", () => {
      const themes = manager.getAvailableThemes();
      themes.terminal = { name: "HACKED" };
      expect(THEMES.terminal.name).toBe("Terminal Retro");
    });
  });

  describe("theme change performance", () => {
    it("applyTheme completes in under 200ms", () => {
      const start = performance.now();
      manager.applyTheme("bsod");
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(200);
    });
  });
});
