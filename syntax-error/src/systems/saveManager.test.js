import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SaveManager,
  DEFAULT_STATE,
  VALID_THEMES,
  STORAGE_KEY,
  clampVolume,
  enforceSequentialProgression,
  validateTheme,
  validateState,
} from "./saveManager.js";

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
});

describe("clampVolume", () => {
  it("clamps values below 0 to 0", () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(-0.5)).toBe(0);
  });

  it("clamps values above 1 to 1", () => {
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(2)).toBe(1);
  });

  it("rounds to nearest 0.1", () => {
    expect(clampVolume(0.34)).toBe(0.3);
    expect(clampVolume(0.35)).toBe(0.4);
    expect(clampVolume(0.77)).toBe(0.8);
  });

  it("handles NaN and non-numbers with default 0.5", () => {
    expect(clampVolume(NaN)).toBe(0.5);
    expect(clampVolume("abc")).toBe(0.5);
    expect(clampVolume(undefined)).toBe(0.5);
    expect(clampVolume(null)).toBe(0.5);
  });

  it("preserves valid values at boundaries", () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(1)).toBe(1);
    expect(clampVolume(0.5)).toBe(0.5);
  });
});

describe("enforceSequentialProgression", () => {
  it("returns all false for non-array input", () => {
    expect(enforceSequentialProgression(null)).toEqual([false, false, false, false, false]);
    expect(enforceSequentialProgression("abc")).toEqual([false, false, false, false, false]);
  });

  it("returns all false for wrong-length array", () => {
    expect(enforceSequentialProgression([true, true])).toEqual([false, false, false, false, false]);
  });

  it("preserves valid sequential progression", () => {
    expect(enforceSequentialProgression([true, true, false, false, false])).toEqual([true, true, false, false, false]);
  });

  it("enforces sequential invariant - fills gaps", () => {
    // If level 3 is completed, levels 0-2 must also be
    expect(enforceSequentialProgression([false, false, false, true, false])).toEqual([true, true, true, true, false]);
  });

  it("all completed stays all completed", () => {
    expect(enforceSequentialProgression([true, true, true, true, true])).toEqual([true, true, true, true, true]);
  });

  it("all false stays all false", () => {
    expect(enforceSequentialProgression([false, false, false, false, false])).toEqual([false, false, false, false, false]);
  });
});

describe("validateTheme", () => {
  it("accepts valid themes", () => {
    VALID_THEMES.forEach((theme) => {
      expect(validateTheme(theme)).toBe(theme);
    });
  });

  it("falls back to terminal for invalid themes", () => {
    expect(validateTheme("invalid")).toBe("terminal");
    expect(validateTheme("")).toBe("terminal");
    expect(validateTheme(123)).toBe("terminal");
    expect(validateTheme(null)).toBe("terminal");
  });
});

describe("validateState", () => {
  it("returns defaults for null/undefined", () => {
    const result = validateState(null);
    expect(result.levelsCompleted).toEqual([false, false, false, false, false]);
    expect(result.currentTheme).toBe("terminal");
    expect(result.audioVolume).toEqual({ music: 0.5, sfx: 0.7 });
    expect(result.memoryAddresses).toEqual([]);
  });

  it("validates and normalizes a valid state", () => {
    const input = {
      levelsCompleted: [true, true, false, false, false],
      currentTheme: "dark",
      audioVolume: { music: 0.8, sfx: 0.3 },
      memoryAddresses: ["0x01", "0x02"],
    };
    const result = validateState(input);
    expect(result).toEqual(input);
  });

  it("enforces sequential progression in state", () => {
    const input = {
      levelsCompleted: [false, false, true, false, false],
      currentTheme: "dark",
      audioVolume: { music: 0.5, sfx: 0.5 },
      memoryAddresses: [],
    };
    const result = validateState(input);
    expect(result.levelsCompleted).toEqual([true, true, true, false, false]);
  });

  it("clamps invalid audio volumes", () => {
    const input = {
      levelsCompleted: [false, false, false, false, false],
      currentTheme: "terminal",
      audioVolume: { music: 2.0, sfx: -1.0 },
      memoryAddresses: [],
    };
    const result = validateState(input);
    expect(result.audioVolume.music).toBe(1.0);
    expect(result.audioVolume.sfx).toBe(0.0);
  });

  it("filters non-string memory addresses", () => {
    const input = {
      levelsCompleted: [false, false, false, false, false],
      currentTheme: "terminal",
      audioVolume: { music: 0.5, sfx: 0.7 },
      memoryAddresses: ["0x01", 123, null, "0x02"],
    };
    const result = validateState(input);
    expect(result.memoryAddresses).toEqual(["0x01", "0x02"]);
  });
});

describe("SaveManager", () => {
  let manager;

  beforeEach(() => {
    localStorage.clear();
    manager = new SaveManager();
  });

  describe("initialization", () => {
    it("initializes with defaults when localStorage is empty", () => {
      expect(manager.state.levelsCompleted).toEqual([false, false, false, false, false]);
      expect(manager.state.currentTheme).toBe("terminal");
      expect(manager.state.audioVolume).toEqual({ music: 0.5, sfx: 0.7 });
      expect(manager.state.memoryAddresses).toEqual([]);
    });

    it("loads existing valid data from localStorage", () => {
      const data = {
        levelsCompleted: [true, true, false, false, false],
        currentTheme: "dark",
        audioVolume: { music: 0.8, sfx: 0.6 },
        memoryAddresses: ["0xFF"],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      manager = new SaveManager();
      expect(manager.state.levelsCompleted).toEqual([true, true, false, false, false]);
      expect(manager.state.currentTheme).toBe("dark");
    });

    it("initializes with defaults for corrupt localStorage data", () => {
      localStorage.setItem(STORAGE_KEY, "not-json{{{{");
      manager = new SaveManager();
      expect(manager.state.levelsCompleted).toEqual([false, false, false, false, false]);
      expect(manager.state.currentTheme).toBe("terminal");
    });
  });

  describe("serialize / deserialize", () => {
    it("round-trips correctly", () => {
      manager.state = {
        levelsCompleted: [true, true, true, false, false],
        currentTheme: "blueprint",
        audioVolume: { music: 0.3, sfx: 0.9 },
        memoryAddresses: ["0xAB"],
      };
      const json = manager.serialize();
      const result = manager.deserialize(json);
      expect(result).toEqual(manager.state);
    });

    it("deserialize handles invalid JSON gracefully", () => {
      const result = manager.deserialize("{{invalid");
      expect(result.levelsCompleted).toEqual([false, false, false, false, false]);
      expect(result.currentTheme).toBe("terminal");
    });
  });

  describe("save", () => {
    it("persists state to localStorage", () => {
      manager.state.currentTheme = "bsod";
      manager.save();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      expect(stored.currentTheme).toBe("bsod");
    });

    it("retries once on failure and notifies on second failure", () => {
      let callCount = 0;
      localStorage.setItem = vi.fn(() => {
        callCount++;
        throw new Error("QuotaExceeded");
      });
      let notified = false;
      manager.onSaveFailed = () => {
        notified = true;
      };
      const result = manager.save();
      expect(result).toBe(false);
      expect(callCount).toBe(2); // initial + 1 retry
      expect(notified).toBe(true);
    });

    it("succeeds on retry if second attempt works", () => {
      let callCount = 0;
      localStorage.setItem = vi.fn(() => {
        callCount++;
        if (callCount === 1) throw new Error("QuotaExceeded");
        // Second call succeeds
      });
      const result = manager.save();
      expect(result).toBe(true);
      expect(callCount).toBe(2);
    });
  });

  describe("completeLevel", () => {
    it("marks a level and all previous as completed", () => {
      manager.completeLevel(2);
      expect(manager.state.levelsCompleted).toEqual([true, true, true, false, false]);
    });

    it("ignores invalid level IDs", () => {
      manager.completeLevel(-1);
      manager.completeLevel(5);
      manager.completeLevel("abc");
      expect(manager.state.levelsCompleted).toEqual([false, false, false, false, false]);
    });

    it("completes level 0 correctly", () => {
      manager.completeLevel(0);
      expect(manager.state.levelsCompleted).toEqual([true, false, false, false, false]);
    });

    it("completes level 4 marks all as completed", () => {
      manager.completeLevel(4);
      expect(manager.state.levelsCompleted).toEqual([true, true, true, true, true]);
    });
  });

  describe("setTheme", () => {
    it("sets a valid theme", () => {
      manager.setTheme("bsod");
      expect(manager.state.currentTheme).toBe("bsod");
    });

    it("falls back to terminal for invalid theme", () => {
      manager.setTheme("nonexistent");
      expect(manager.state.currentTheme).toBe("terminal");
    });
  });

  describe("setVolume", () => {
    it("sets music volume clamped and rounded", () => {
      manager.setVolume("music", 0.77);
      expect(manager.state.audioVolume.music).toBe(0.8);
    });

    it("sets sfx volume clamped and rounded", () => {
      manager.setVolume("sfx", 1.5);
      expect(manager.state.audioVolume.sfx).toBe(1.0);
    });

    it("ignores invalid type", () => {
      const before = { ...manager.state.audioVolume };
      manager.setVolume("invalid", 0.5);
      expect(manager.state.audioVolume).toEqual(before);
    });
  });

  describe("reset", () => {
    it("resets state to defaults", () => {
      manager.completeLevel(3);
      manager.setTheme("bsod");
      manager.reset();
      expect(manager.state.levelsCompleted).toEqual([false, false, false, false, false]);
      expect(manager.state.currentTheme).toBe("terminal");
      expect(manager.state.audioVolume).toEqual({ music: 0.5, sfx: 0.7 });
    });
  });

  describe("load", () => {
    it("reloads state from localStorage", () => {
      const data = {
        levelsCompleted: [true, false, false, false, false],
        currentTheme: "light",
        audioVolume: { music: 0.3, sfx: 0.9 },
        memoryAddresses: [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const loaded = manager.load();
      expect(loaded.currentTheme).toBe("light");
      expect(loaded.levelsCompleted).toEqual([true, false, false, false, false]);
    });
  });

  describe("getState", () => {
    it("returns a deep copy of state", () => {
      const copy = manager.getState();
      copy.levelsCompleted[0] = true;
      copy.currentTheme = "bsod";
      // Original should not be affected
      expect(manager.state.levelsCompleted[0]).toBe(false);
      expect(manager.state.currentTheme).toBe("terminal");
    });
  });
});
