export const WARNING_BASE_DELAY_MS = 50;
export const WARNING_DELAY_MULTIPLIER = 0.15;
export const WARNING_MAX_COUNT = 20;

const TIMER_EPSILON = 1e-9;
const INPUT_ACTIONS = Object.freeze(["left", "right", "jump"]);

function finiteNonNegative(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

function normalizeWarningCount(value, maximum = WARNING_MAX_COUNT) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(maximum, Math.max(0, numeric));
}

function normalizeInput(input = {}) {
  return {
    left: Boolean(input.leftDown ?? input.left),
    right: Boolean(input.rightDown ?? input.right),
    jump: Boolean(input.jumpDown ?? input.jump),
  };
}

function publicInput(state, { jumpPressed = false, jumpReleased = false } = {}) {
  return Object.freeze({
    leftDown: state.left,
    rightDown: state.right,
    jumpDown: state.jump,
    jumpPressed,
    jumpReleased,
  });
}

/** Calculate the exact warning delay, clamped to the supported [0, 20] range. */
export function calculateWarningDelayMs(
  warningCount,
  {
    baseDelayMs = WARNING_BASE_DELAY_MS,
    multiplier = WARNING_DELAY_MULTIPLIER,
    maxWarnings = WARNING_MAX_COUNT,
  } = {},
) {
  finiteNonNegative(baseDelayMs, "baseDelayMs");
  finiteNonNegative(multiplier, "multiplier");
  if (!Number.isInteger(maxWarnings) || maxWarnings < 0) {
    throw new RangeError("maxWarnings must be a non-negative integer");
  }
  const count = normalizeWarningCount(warningCount, maxWarnings);
  return baseDelayMs * (1 + multiplier * count);
}

/**
 * Pure warning state. Signal IDs remain consumed when warnings reset on death,
 * because collection is one-shot for the whole level session.
 */
export function createWarningSystemMachine({
  baseDelayMs = WARNING_BASE_DELAY_MS,
  multiplier = WARNING_DELAY_MULTIPLIER,
  maxWarnings = WARNING_MAX_COUNT,
} = {}) {
  calculateWarningDelayMs(0, { baseDelayMs, multiplier, maxWarnings });
  let warningCount = 0;
  const collectedSignalIds = new Set();

  const getState = () => Object.freeze({
    warningCount,
    maxWarnings,
    delayMs: calculateWarningDelayMs(warningCount, {
      baseDelayMs,
      multiplier,
      maxWarnings,
    }),
    collectedSignalIds: Object.freeze([...collectedSignalIds]),
  });

  return Object.freeze({
    getState,
    collect(signalId, { immune = false } = {}) {
      if (typeof signalId !== "string" || signalId.trim().length === 0) {
        throw new TypeError("signalId must be a non-empty string");
      }
      const id = signalId.trim();
      if (immune) {
        return Object.freeze({ accepted: false, incremented: false, reason: "immune", ...getState() });
      }
      if (collectedSignalIds.has(id)) {
        return Object.freeze({ accepted: false, incremented: false, reason: "already-collected", ...getState() });
      }

      collectedSignalIds.add(id);
      const incremented = warningCount < maxWarnings;
      if (incremented) warningCount += 1;
      return Object.freeze({
        accepted: true,
        incremented,
        reason: incremented ? "collected" : "capped",
        signalId: id,
        ...getState(),
      });
    },
    resetWarnings() {
      warningCount = 0;
      return getState();
    },
    resetSession() {
      warningCount = 0;
      collectedSignalIds.clear();
      return getState();
    },
  });
}

/**
 * Deterministic transition queue. Raw key transitions are timestamped with the
 * delay active when they occur, then emitted in due-time/insertion order.
 */
export class DelayedInputQueue {
  constructor({ delayProvider = () => WARNING_BASE_DELAY_MS } = {}) {
    if (typeof delayProvider !== "function") {
      throw new TypeError("delayProvider must be a function");
    }
    this.delayProvider = delayProvider;
    this.paused = false;
    this.reset();
  }

  reset() {
    this.elapsedMs = 0;
    this.sequence = 0;
    this.queue = [];
    this.rawState = { left: false, right: false, jump: false };
    this.delayedState = { left: false, right: false, jump: false };
    return this.getState();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
  }

  advance(rawInput, deltaSeconds, { paused = false } = {}) {
    const dtMs = finiteNonNegative(deltaSeconds, "deltaSeconds") * 1000;
    if (this.paused || paused) return publicInput(this.delayedState);

    const nextRaw = normalizeInput(rawInput);
    const delayMs = finiteNonNegative(Number(this.delayProvider()), "input delay");
    for (const action of INPUT_ACTIONS) {
      if (nextRaw[action] === this.rawState[action]) continue;
      this.queue.push({
        action,
        down: nextRaw[action],
        dueMs: this.elapsedMs + delayMs,
        sequence: this.sequence,
      });
      this.sequence += 1;
    }
    this.rawState = nextRaw;
    this.elapsedMs += dtMs;

    this.queue.sort((left, right) => left.dueMs - right.dueMs || left.sequence - right.sequence);
    let jumpPressed = false;
    let jumpReleased = false;
    while (this.queue.length > 0 && this.queue[0].dueMs <= this.elapsedMs + TIMER_EPSILON) {
      const event = this.queue.shift();
      this.delayedState[event.action] = event.down;
      if (event.action === "jump") {
        if (event.down) jumpPressed = true;
        else jumpReleased = true;
      }
    }

    return publicInput(this.delayedState, { jumpPressed, jumpReleased });
  }

  getState() {
    const delayMs = finiteNonNegative(Number(this.delayProvider()), "input delay");
    return Object.freeze({
      elapsedMs: this.elapsedMs,
      delayMs,
      paused: this.paused,
      pendingCount: this.queue.length,
      pending: Object.freeze(this.queue.map((event) => Object.freeze({
        action: event.action,
        down: event.down,
        dueInMs: Math.max(0, event.dueMs - this.elapsedMs),
        sequence: event.sequence,
      }))),
      output: publicInput(this.delayedState),
    });
  }
}

function tryPlayWarningSfx(audioManager) {
  try {
    audioManager?.playSfx?.("warning");
  } catch {
    // Audio is optional and must never block collection or input processing.
  }
}

/** Attach warning collection, delayed input, and the Level 4 HUD to KAPLAY. */
export function attachWarningSystemRuntime({
  k,
  gameplayRoot,
  player,
  mechanic,
  entries = [],
  audioManager,
} = {}) {
  if (!k || !gameplayRoot?.add || !player?.onCollide || !mechanic) {
    throw new TypeError("KAPLAY context, gameplayRoot, player, and warning mechanic are required");
  }

  const machine = createWarningSystemMachine({
    baseDelayMs: mechanic.params?.baseDelayMs ?? WARNING_BASE_DELAY_MS,
    multiplier: mechanic.params?.multiplier ?? WARNING_DELAY_MULTIPLIER,
    maxWarnings: mechanic.params?.maxWarnings ?? WARNING_MAX_COUNT,
  });
  const inputQueue = new DelayedInputQueue({
    delayProvider: () => machine.getState().delayMs,
  });
  player.setInputGate?.(inputQueue);

  const hudComponents = [
    k.text("Warnings: 0", { size: 22 }),
    k.pos(24, 24),
    k.anchor("topleft"),
    k.color(227, 179, 65),
    k.z(220),
    "warning-hud",
    "gameplay-ui",
  ];
  if (typeof k.fixed === "function") hudComponents.push(k.fixed());
  const hud = gameplayRoot.add(hudComponents);
  const entryForObject = new Map(entries.map((entry) => [entry.object, entry]));

  const updateHud = () => {
    hud.text = `Warnings: ${machine.getState().warningCount}`;
  };

  const collectWarning = (object) => {
    const entry = entryForObject.get(object);
    if (!entry) return Object.freeze({ accepted: false, reason: "unknown-signal" });
    const immune = Boolean(player.shouldIgnoreLogicalObstacle?.(object));
    const signalId = entry.zone.mechanic.params.warningId ?? entry.zone.id;
    const result = machine.collect(signalId, { immune });
    if (!result.accepted) return result;

    object.setMechanicVisualState?.("resolved");
    object.opacity = 0.18;
    if (result.incremented) tryPlayWarningSfx(audioManager);
    updateHud();
    player.trigger?.("warning-collected", result.warningCount, signalId);
    return result;
  };

  const resetWarnings = () => {
    machine.resetWarnings();
    inputQueue.reset();
    updateHud();
    return machine.getState();
  };

  player.onCollide("warning-sign", collectWarning);
  player.on?.("player-death", resetWarnings);
  player.on?.("level-complete", resetWarnings);

  return Object.freeze({
    type: "warningSystem",
    id: mechanic.id,
    collectWarning,
    getWarningCount: () => machine.getState().warningCount,
    resetWarnings,
    reset() {
      machine.resetSession();
      inputQueue.reset();
      entries.forEach(({ object }) => {
        object.setMechanicVisualState?.("idle");
        object.opacity = 0.28;
      });
      updateHud();
      return machine.getState();
    },
    pause: () => inputQueue.pause(),
    resume: () => inputQueue.resume(),
    applyTheme(palette) {
      if (palette?.warning) hud.color = k.rgb(...palette.warning);
    },
    getState() {
      return Object.freeze({
        ...machine.getState(),
        input: inputQueue.getState(),
        hudText: hud.text,
      });
    },
    inputQueue,
    hud,
  });
}
