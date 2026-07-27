import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioManager,
  DEFAULT_CROSSFADE_SECONDS,
  MUSIC_TRACKS,
  SFX_DEFINITIONS,
  normalizeMusicTrackId,
  normalizeSfxName,
} from "./audioManager.js";

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  cancelScheduledValues(time) {
    this.events.push(["cancel", time]);
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push(["set", value, time]);
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push(["ramp", value, time]);
  }
}

class FakeNode {
  constructor() {
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }

  disconnect() {
    this.disconnected = true;
  }
}

class FakeGainNode extends FakeNode {
  constructor() {
    super();
    this.gain = new FakeAudioParam(1);
  }
}

class FakeSourceNode extends FakeNode {
  constructor() {
    super();
    this.buffer = null;
    this.loop = false;
    this.startedAt = null;
    this.stoppedAt = null;
  }

  start(time) {
    this.startedAt = time;
  }

  stop(time) {
    this.stoppedAt = time;
  }
}

class FakeOscillatorNode extends FakeNode {
  constructor() {
    super();
    this.frequency = new FakeAudioParam();
    this.type = "sine";
    this.startedAt = null;
    this.stoppedAt = null;
  }

  start(time) {
    this.startedAt = time;
  }

  stop(time) {
    this.stoppedAt = time;
  }
}

class FakeAudioContext {
  constructor({ state = "running", resumeFailures = 0 } = {}) {
    this.state = state;
    this.resumeFailures = resumeFailures;
    this.resumeCalls = 0;
    this.currentTime = 4;
    this.sampleRate = 8000;
    this.destination = new FakeNode();
    this.gains = [];
    this.sources = [];
    this.oscillators = [];
    this.failNextOscillator = false;
  }

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  createBufferSource() {
    const source = new FakeSourceNode();
    this.sources.push(source);
    return source;
  }

  createBuffer(channels, length) {
    const channelData = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
    return { getChannelData: (channel) => channelData[channel] };
  }

  createOscillator() {
    if (this.failNextOscillator) {
      this.failNextOscillator = false;
      throw new Error("resource unavailable");
    }
    const oscillator = new FakeOscillatorNode();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  resume() {
    this.resumeCalls += 1;
    if (this.resumeFailures > 0) {
      this.resumeFailures -= 1;
      return Promise.reject(new Error("autoplay blocked"));
    }
    this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.state = "closed";
  }
}

function createDocumentTarget() {
  const listeners = new Map();
  return {
    addEventListener: vi.fn((name, callback) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
    }),
    removeEventListener: vi.fn((name, callback) => {
      listeners.get(name)?.delete(callback);
    }),
    dispatch(name) {
      for (const callback of [...(listeners.get(name) ?? [])]) callback();
    },
    listenerCount() {
      return [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
    },
  };
}

function createPersistence(music = 0.5, sfx = 0.7) {
  const state = { audioVolume: { music, sfx } };
  return {
    getState: vi.fn(() => ({ audioVolume: { ...state.audioVolume } })),
    setVolume: vi.fn((type, value) => { state.audioVolume[type] = value; }),
    state,
  };
}

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

let context;
let persistence;
let documentTarget;
let manager;

beforeEach(() => {
  context = new FakeAudioContext();
  persistence = createPersistence();
  documentTarget = createDocumentTarget();
  manager = new AudioManager({
    persistence,
    contextFactory: () => context,
    documentTarget,
  });
});

describe("generated audio catalog", () => {
  it("defines all seven required SFX and six distinct music loops", () => {
    expect(Object.keys(SFX_DEFINITIONS)).toEqual([
      "jump", "death", "ability", "gcAlert", "switch", "loopTrap", "warning",
    ]);
    expect(Object.keys(MUSIC_TRACKS)).toEqual([
      "menu", "level1", "level2", "level3", "level4", "level5",
    ]);
    expect(new Set(Object.values(MUSIC_TRACKS).map(({ notes }) => notes.join(","))).size)
      .toBe(6);
  });

  it("normalizes public level and SFX identifiers without accepting unknown resources", () => {
    expect(normalizeMusicTrackId("menu")).toBe("menu");
    expect(normalizeMusicTrackId(5)).toBe("level5");
    expect(normalizeMusicTrackId("level-3")).toBe("level3");
    expect(normalizeMusicTrackId(7)).toBeNull();
    expect(normalizeSfxName("gc-alert")).toBe("gcAlert");
    expect(normalizeSfxName("loopTrap")).toBe("loopTrap");
    expect(normalizeSfxName("unknown")).toBeNull();
  });
});

describe("AudioManager", () => {
  it("loads independent persisted volumes and applies changes immediately", () => {
    persistence = createPersistence(0.2, 0.9);
    manager = new AudioManager({
      persistence,
      contextFactory: () => context,
      documentTarget,
    });

    manager.playMusic("menu");
    expect(manager.musicVolume).toBe(0.2);
    expect(manager.sfxVolume).toBe(0.9);
    expect(manager.setMusicVolume(0.76)).toBe(0.8);
    expect(manager.setSfxVolume(-2)).toBe(0);
    expect(context.gains[0].gain.value).toBe(0.8);
    expect(context.gains[1].gain.value).toBe(0);
    expect(persistence.setVolume).toHaveBeenNthCalledWith(1, "music", 0.8);
    expect(persistence.setVolume).toHaveBeenNthCalledWith(2, "sfx", 0);
  });

  it("plays every required SFX through generated oscillator placeholders", () => {
    for (const name of Object.keys(SFX_DEFINITIONS)) {
      expect(manager.playSfx(name)).toBe(true);
    }
    expect(context.oscillators).toHaveLength(7);
    expect(context.oscillators.every((oscillator) => oscillator.startedAt === 4))
      .toBe(true);
    expect(context.oscillators.every((oscillator) => oscillator.stoppedAt > 4))
      .toBe(true);
  });

  it("loops menu music and crossfades to a level over exactly one second", () => {
    expect(manager.playMusic("menu")).toBe(true);
    const firstSource = context.sources[0];
    const firstVoiceGain = context.gains[2];
    expect(firstSource.loop).toBe(true);
    expect(manager.currentMusic).toBe("menu");

    expect(manager.crossfadeTo(1)).toBe(true);
    const secondVoiceGain = context.gains[3];
    expect(manager.currentMusic).toBe("level1");
    expect(firstSource.stoppedAt).toBe(4 + DEFAULT_CROSSFADE_SECONDS);
    expect(firstVoiceGain.gain.events).toContainEqual(["ramp", 0, 5]);
    expect(secondVoiceGain.gain.events).toContainEqual(["ramp", 1, 5]);
  });

  it("queues playback when autoplay is blocked and resumes after first interaction", async () => {
    context = new FakeAudioContext({ state: "suspended", resumeFailures: 1 });
    manager = new AudioManager({
      persistence,
      contextFactory: () => context,
      documentTarget,
    });

    expect(manager.playMusic("menu")).toBe(true);
    await flushPromises();
    expect(manager.autoplayBlocked).toBe(true);
    expect(manager.currentMusic).toBeNull();
    expect(documentTarget.listenerCount()).toBe(3);

    documentTarget.dispatch("keydown");
    await flushPromises();
    expect(context.resumeCalls).toBe(2);
    expect(manager.autoplayBlocked).toBe(false);
    expect(manager.currentMusic).toBe("menu");
    expect(documentTarget.listenerCount()).toBe(0);
  });

  it("isolates one failed resource and continues playing other audio", () => {
    context.failNextOscillator = true;
    expect(() => manager.playSfx("jump")).not.toThrow();
    expect(manager.playSfx("jump")).toBe(false);
    expect(manager.failedResources).toContain("sfx:jump");

    expect(manager.playSfx("ability")).toBe(true);
    expect(manager.playMusic("level2")).toBe(true);
    expect(manager.currentMusic).toBe("level2");
  });

  it("fails silently when Web Audio is unavailable", () => {
    manager = new AudioManager({
      persistence,
      contextFactory: () => null,
      documentTarget,
    });
    expect(() => manager.playMusic("menu")).not.toThrow();
    expect(manager.playMusic("menu")).toBe(false);
    expect(manager.playSfx("death")).toBe(false);
    expect(manager.setMusicVolume(0.4)).toBe(0.4);
  });
});
