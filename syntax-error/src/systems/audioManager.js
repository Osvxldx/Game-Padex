import saveManager from "./saveManager.js";

export const DEFAULT_CROSSFADE_SECONDS = 1;

export const SFX_DEFINITIONS = Object.freeze({
  jump: Object.freeze({ frequencies: [420, 720], duration: 0.12, type: "square" }),
  death: Object.freeze({ frequencies: [220, 70], duration: 0.42, type: "sawtooth" }),
  ability: Object.freeze({ frequencies: [520, 780, 1040], duration: 0.24, type: "triangle" }),
  gcAlert: Object.freeze({ frequencies: [180, 150, 180], duration: 0.34, type: "square" }),
  switch: Object.freeze({ frequencies: [360, 540], duration: 0.18, type: "square" }),
  loopTrap: Object.freeze({ frequencies: [260, 390, 260, 520], duration: 0.38, type: "sawtooth" }),
  warning: Object.freeze({ frequencies: [880, 660], duration: 0.2, type: "square" }),
});

export const MUSIC_TRACKS = Object.freeze({
  menu: Object.freeze({ bpm: 92, waveform: "triangle", notes: [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23] }),
  level1: Object.freeze({ bpm: 116, waveform: "square", notes: [220, 261.63, 329.63, 261.63, 196, 246.94, 293.66, 246.94] }),
  level2: Object.freeze({ bpm: 124, waveform: "square", notes: [246.94, 293.66, 369.99, 293.66, 233.08, 277.18, 349.23, 277.18] }),
  level3: Object.freeze({ bpm: 132, waveform: "sawtooth", notes: [164.81, 196, 246.94, 196, 174.61, 207.65, 261.63, 207.65] }),
  level4: Object.freeze({ bpm: 108, waveform: "triangle", notes: [293.66, 349.23, 440, 349.23, 277.18, 329.63, 415.3, 329.63] }),
  level5: Object.freeze({ bpm: 140, waveform: "square", notes: [220, 277.18, 329.63, 440, 207.65, 261.63, 392, 523.25] }),
});

const SFX_ALIASES = Object.freeze({
  "gc-alert": "gcAlert",
  gc: "gcAlert",
  "loop-trap": "loopTrap",
  loop: "loopTrap",
  habilidad: "ability",
  muerte: "death",
  salto: "jump",
  trampa: "loopTrap",
  alerta: "gcAlert",
});

const AUTOPLAY_EVENTS = Object.freeze(["pointerdown", "keydown", "touchstart"]);
const DEFAULT_VOLUMES = Object.freeze({ music: 0.5, sfx: 0.7 });

function clampVolume(value, fallback) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(1, Math.max(0, numeric)) * 10) / 10;
}

export function normalizeMusicTrackId(levelId) {
  if (levelId === 0 || levelId === "0" || levelId === "menu") return "menu";
  if (Number.isInteger(levelId) && levelId >= 1 && levelId <= 5) {
    return `level${levelId}`;
  }
  if (typeof levelId === "string") {
    const compact = levelId.toLowerCase().replace(/[\s_-]/g, "");
    if (/^level[1-5]$/.test(compact)) return compact;
    if (/^[1-5]$/.test(compact)) return `level${compact}`;
  }
  return null;
}

export function normalizeSfxName(name) {
  if (typeof name !== "string") return null;
  if (Object.hasOwn(SFX_DEFINITIONS, name)) return name;
  return SFX_ALIASES[name] ?? null;
}

function safelySetValue(param, value, time) {
  if (typeof param?.cancelScheduledValues === "function") {
    param.cancelScheduledValues(time);
  }
  if (typeof param?.setValueAtTime === "function") {
    param.setValueAtTime(value, time);
  } else if (param) {
    param.value = value;
  }
}

function safelyRampValue(param, value, time) {
  if (typeof param?.linearRampToValueAtTime === "function") {
    param.linearRampToValueAtTime(value, time);
  } else if (param) {
    param.value = value;
  }
}

function defaultContextFactory() {
  const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  return AudioContextClass ? new AudioContextClass() : null;
}

/**
 * Cross-scene audio service backed by generated Web Audio placeholders.
 * Resource and autoplay errors are deliberately contained inside this class.
 */
export class AudioManager {
  constructor({
    persistence = saveManager,
    contextFactory = defaultContextFactory,
    documentTarget = globalThis.document,
  } = {}) {
    this._persistence = persistence;
    this._contextFactory = contextFactory;
    this._documentTarget = documentTarget;
    this._context = null;
    this._musicMaster = null;
    this._sfxMaster = null;
    this._currentMusic = null;
    this._desiredMusicId = null;
    this._musicBuffers = new Map();
    this._failedResources = new Set();
    this._pendingSfx = [];
    this._interactionListenersInstalled = false;
    this._destroyed = false;
    this.autoplayBlocked = false;
    this._handleFirstInteraction = this._handleFirstInteraction.bind(this);

    let storedVolumes = DEFAULT_VOLUMES;
    try {
      storedVolumes = persistence?.getState?.().audioVolume ?? DEFAULT_VOLUMES;
    } catch {
      storedVolumes = DEFAULT_VOLUMES;
    }
    this.musicVolume = clampVolume(storedVolumes.music, DEFAULT_VOLUMES.music);
    this.sfxVolume = clampVolume(storedVolumes.sfx, DEFAULT_VOLUMES.sfx);
  }

  get currentMusic() {
    return this._currentMusic?.id ?? null;
  }

  get failedResources() {
    return [...this._failedResources];
  }

  /** Start a loop, crossfading automatically if another loop is active. */
  playMusic(levelId) {
    const trackId = normalizeMusicTrackId(levelId);
    if (!trackId || this._destroyed) return false;
    if (this._currentMusic && this._currentMusic.id !== trackId) {
      return this.crossfadeTo(trackId, DEFAULT_CROSSFADE_SECONDS);
    }

    this._desiredMusicId = trackId;
    if (this._currentMusic?.id === trackId) return true;
    const context = this._ensureContext();
    if (!context) return false;
    if (context.state !== "running") {
      this._markAutoplayBlocked();
      this._attemptResume();
      return true;
    }
    return Boolean(this._startMusicVoice(trackId, 1));
  }

  /** Crossfade the active loop to another generated track. */
  crossfadeTo(levelId, duration = DEFAULT_CROSSFADE_SECONDS) {
    const trackId = normalizeMusicTrackId(levelId);
    if (!trackId || this._destroyed) return false;
    const safeDuration = Number.isFinite(duration) && duration >= 0
      ? duration
      : DEFAULT_CROSSFADE_SECONDS;
    this._desiredMusicId = trackId;

    const context = this._ensureContext();
    if (!context) return false;
    if (context.state !== "running") {
      this._markAutoplayBlocked();
      this._attemptResume();
      return true;
    }
    if (!this._currentMusic) {
      return Boolean(this._startMusicVoice(trackId, 1));
    }
    if (this._currentMusic.id === trackId) return true;

    const previous = this._currentMusic;
    const next = this._startMusicVoice(trackId, safeDuration === 0 ? 1 : 0);
    if (!next) return false;

    const now = context.currentTime;
    if (safeDuration > 0) {
      safelySetValue(previous.gain.gain, previous.gain.gain.value ?? 1, now);
      safelyRampValue(previous.gain.gain, 0, now + safeDuration);
      safelySetValue(next.gain.gain, 0, now);
      safelyRampValue(next.gain.gain, 1, now + safeDuration);
    } else {
      safelySetValue(previous.gain.gain, 0, now);
    }
    this._stopVoice(previous, now + safeDuration);
    return true;
  }

  stopMusic() {
    this._desiredMusicId = null;
    if (!this._currentMusic) return;
    const voice = this._currentMusic;
    this._currentMusic = null;
    this._stopVoice(voice, this._context?.currentTime ?? 0);
  }

  /** Play one of the seven generated SFX placeholders. */
  playSfx(name) {
    const sfxName = normalizeSfxName(name);
    if (!sfxName || this._destroyed || this._failedResources.has(`sfx:${sfxName}`)) {
      return false;
    }
    const context = this._ensureContext();
    if (!context) return false;
    if (context.state !== "running") {
      this._pendingSfx.push(sfxName);
      this._pendingSfx = this._pendingSfx.slice(-8);
      this._markAutoplayBlocked();
      this._attemptResume();
      return true;
    }
    return this._playSfxNow(sfxName);
  }

  setMusicVolume(value) {
    this.musicVolume = clampVolume(value, this.musicVolume);
    const now = this._context?.currentTime ?? 0;
    safelySetValue(this._musicMaster?.gain, this.musicVolume, now);
    try {
      this._persistence?.setVolume?.("music", this.musicVolume);
    } catch {
      // Persistence failure must not interrupt active audio or settings UI.
    }
    return this.musicVolume;
  }

  setSfxVolume(value) {
    this.sfxVolume = clampVolume(value, this.sfxVolume);
    const now = this._context?.currentTime ?? 0;
    safelySetValue(this._sfxMaster?.gain, this.sfxVolume, now);
    try {
      this._persistence?.setVolume?.("sfx", this.sfxVolume);
    } catch {
      // Persistence failure must not interrupt active audio or settings UI.
    }
    return this.sfxVolume;
  }

  /** Public recovery hook for hosts that detect an autoplay rejection. */
  handleAutoplayBlock() {
    if (this._destroyed) return false;
    this._markAutoplayBlocked();
    this._attemptResume();
    return true;
  }

  destroy() {
    this._destroyed = true;
    this.stopMusic();
    this._removeInteractionListeners();
    this._pendingSfx = [];
    try {
      this._context?.close?.();
    } catch {
      // Closing an already-closed context is harmless to the game.
    }
  }

  _ensureContext() {
    if (this._context || this._destroyed) return this._context;
    try {
      this._context = this._contextFactory?.() ?? null;
      if (!this._context) return null;
      this._musicMaster = this._context.createGain();
      this._sfxMaster = this._context.createGain();
      safelySetValue(this._musicMaster.gain, this.musicVolume, this._context.currentTime);
      safelySetValue(this._sfxMaster.gain, this.sfxVolume, this._context.currentTime);
      this._musicMaster.connect(this._context.destination);
      this._sfxMaster.connect(this._context.destination);
      return this._context;
    } catch {
      this._context = null;
      this._musicMaster = null;
      this._sfxMaster = null;
      return null;
    }
  }

  _startMusicVoice(trackId, initialGain) {
    if (this._failedResources.has(`music:${trackId}`)) return null;
    try {
      const source = this._context.createBufferSource();
      source.buffer = this._getMusicBuffer(trackId);
      source.loop = true;
      const gain = this._context.createGain();
      safelySetValue(gain.gain, initialGain, this._context.currentTime);
      source.connect(gain);
      gain.connect(this._musicMaster);
      const voice = { id: trackId, source, gain };
      source.onended = () => {
        try { source.disconnect(); } catch { /* already disconnected */ }
        try { gain.disconnect(); } catch { /* already disconnected */ }
      };
      source.start(this._context.currentTime);
      this._currentMusic = voice;
      return voice;
    } catch {
      this._failedResources.add(`music:${trackId}`);
      return null;
    }
  }

  _getMusicBuffer(trackId) {
    if (this._musicBuffers.has(trackId)) return this._musicBuffers.get(trackId);
    const track = MUSIC_TRACKS[trackId];
    const sampleRate = this._context.sampleRate || 44100;
    const noteDuration = 60 / track.bpm / 2;
    const totalDuration = noteDuration * track.notes.length;
    const frameCount = Math.max(1, Math.ceil(totalDuration * sampleRate));
    const buffer = this._context.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      const time = index / sampleRate;
      const noteIndex = Math.min(
        track.notes.length - 1,
        Math.floor(time / noteDuration),
      );
      const localTime = time - noteIndex * noteDuration;
      const phase = 2 * Math.PI * track.notes[noteIndex] * localTime;
      const wave = track.waveform === "square"
        ? Math.sign(Math.sin(phase))
        : track.waveform === "sawtooth"
          ? 2 * ((phase / (2 * Math.PI)) % 1) - 1
          : (2 / Math.PI) * Math.asin(Math.sin(phase));
      const attack = Math.min(1, localTime / 0.015);
      const release = Math.min(1, (noteDuration - localTime) / 0.05);
      data[index] = wave * 0.16 * Math.max(0, Math.min(attack, release));
    }
    this._musicBuffers.set(trackId, buffer);
    return buffer;
  }

  _playSfxNow(sfxName) {
    const definition = SFX_DEFINITIONS[sfxName];
    try {
      const oscillator = this._context.createOscillator();
      const envelope = this._context.createGain();
      const now = this._context.currentTime;
      oscillator.type = definition.type;
      definition.frequencies.forEach((frequency, index) => {
        const time = now + (definition.duration * index) / definition.frequencies.length;
        if (index === 0 || typeof oscillator.frequency.linearRampToValueAtTime !== "function") {
          oscillator.frequency.setValueAtTime(frequency, time);
        } else {
          oscillator.frequency.linearRampToValueAtTime(frequency, time);
        }
      });
      safelySetValue(envelope.gain, 0, now);
      safelyRampValue(envelope.gain, 0.3, now + 0.008);
      safelyRampValue(envelope.gain, 0, now + definition.duration);
      oscillator.connect(envelope);
      envelope.connect(this._sfxMaster);
      oscillator.onended = () => {
        try { oscillator.disconnect(); } catch { /* already disconnected */ }
        try { envelope.disconnect(); } catch { /* already disconnected */ }
      };
      oscillator.start(now);
      oscillator.stop(now + definition.duration + 0.01);
      return true;
    } catch {
      this._failedResources.add(`sfx:${sfxName}`);
      return false;
    }
  }

  _stopVoice(voice, when) {
    try {
      voice.source.stop(when);
    } catch {
      // A failed or already-ended source must not stop scene navigation.
    }
    if (this._currentMusic === voice) this._currentMusic = null;
  }

  _attemptResume() {
    const context = this._ensureContext();
    if (!context) return;
    if (context.state === "running") {
      this._flushPendingPlayback();
      return;
    }
    if (typeof context.resume !== "function") return;
    try {
      Promise.resolve(context.resume())
        .then(() => {
          if (context.state === "running") this._flushPendingPlayback();
          else this._markAutoplayBlocked();
        })
        .catch(() => this._markAutoplayBlocked());
    } catch {
      this._markAutoplayBlocked();
    }
  }

  _markAutoplayBlocked() {
    this.autoplayBlocked = true;
    if (this._interactionListenersInstalled || !this._documentTarget?.addEventListener) {
      return;
    }
    for (const eventName of AUTOPLAY_EVENTS) {
      this._documentTarget.addEventListener(eventName, this._handleFirstInteraction, {
        once: true,
        passive: true,
      });
    }
    this._interactionListenersInstalled = true;
  }

  _handleFirstInteraction() {
    this._attemptResume();
  }

  _flushPendingPlayback() {
    this.autoplayBlocked = false;
    this._removeInteractionListeners();
    const desired = this._desiredMusicId;
    if (desired && this._currentMusic?.id !== desired) {
      if (this._currentMusic) this.crossfadeTo(desired, DEFAULT_CROSSFADE_SECONDS);
      else this._startMusicVoice(desired, 1);
    }
    const pending = this._pendingSfx;
    this._pendingSfx = [];
    for (const name of pending) this._playSfxNow(name);
  }

  _removeInteractionListeners() {
    if (!this._interactionListenersInstalled) return;
    for (const eventName of AUTOPLAY_EVENTS) {
      this._documentTarget?.removeEventListener?.(
        eventName,
        this._handleFirstInteraction,
      );
    }
    this._interactionListenersInstalled = false;
  }
}

const audioManager = new AudioManager();
export default audioManager;
