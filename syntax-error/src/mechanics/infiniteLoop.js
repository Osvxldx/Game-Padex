export const LOOP_HISTORY_SECONDS = 2;
export const LOOP_CLONE_DELAY_SECONDS = 0.1;
export const LOOP_MAX_CLONES = 10;
export const LOOP_OVERFLOW_SECONDS = 1.5;
export const LOOP_OVERFLOW_MESSAGE = "RangeError: Maximum call stack size exceeded";

const TIMER_EPSILON = 1e-9;

function requirePoint(point, name = "position") {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${name} requires finite x and y values`);
  }
  return { x: point.x, y: point.y };
}

function requirePositive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

function nonNegativeDelta(value) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("deltaSeconds must be a finite non-negative number");
  }
  return value;
}

function interpolatePoint(from, to, progress) {
  const amount = Math.min(1, Math.max(0, progress));
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

function sampleTimeline(samples, elapsed) {
  if (samples.length === 0) return { x: 0, y: 0 };
  if (elapsed <= samples[0].time) return requirePoint(samples[0]);

  for (let index = 1; index < samples.length; index += 1) {
    const next = samples[index];
    if (elapsed > next.time) continue;
    const previous = samples[index - 1];
    const span = next.time - previous.time;
    if (span <= TIMER_EPSILON) return requirePoint(next);
    return interpolatePoint(previous, next, (elapsed - previous.time) / span);
  }

  return requirePoint(samples.at(-1));
}

/** Sample a normalized movement cycle, wrapping elapsed time continuously. */
export function sampleMovementCycle(cycle, elapsedSeconds) {
  if (!cycle || !Array.isArray(cycle.samples)) {
    throw new TypeError("cycle with samples is required");
  }
  const duration = requirePositive(cycle.duration, "cycle.duration");
  if (!Number.isFinite(elapsedSeconds)) {
    throw new TypeError("elapsedSeconds must be finite");
  }
  const wrapped = ((elapsedSeconds % duration) + duration) % duration;
  return sampleTimeline(cycle.samples, wrapped);
}

/**
 * Stores a rolling positional history and emits an exact two-second cycle.
 * If the level has run for less than the window, the earliest position pads
 * the missing time so trap behavior still has the specified duration.
 */
export class MovementHistory {
  constructor({
    duration = LOOP_HISTORY_SECONDS,
    initialPosition,
  } = {}) {
    this.duration = requirePositive(duration, "duration");
    this.reset(initialPosition);
  }

  reset(initialPosition) {
    this.elapsed = 0;
    this.samples = initialPosition
      ? [{ time: 0, ...requirePoint(initialPosition, "initialPosition") }]
      : [];
  }

  record(position, deltaSeconds) {
    const point = requirePoint(position);
    this.elapsed += nonNegativeDelta(deltaSeconds);
    const sample = { time: this.elapsed, ...point };
    const previous = this.samples.at(-1);
    if (previous && Math.abs(previous.time - sample.time) <= TIMER_EPSILON) {
      this.samples[this.samples.length - 1] = sample;
    } else {
      this.samples.push(sample);
    }

    const cutoff = this.elapsed - this.duration;
    while (this.samples.length > 2 && this.samples[1].time <= cutoff) {
      this.samples.shift();
    }
    return point;
  }

  createCycle(currentPosition) {
    const fallback = currentPosition
      ? requirePoint(currentPosition)
      : this.samples.at(-1);
    if (!fallback) {
      throw new TypeError("a current position or recorded sample is required");
    }

    const windowStart = this.elapsed - this.duration;
    const first = this.samples.length > 0
      ? sampleTimeline(this.samples, windowStart)
      : fallback;
    const cycleSamples = [{ time: 0, ...first }];

    for (const sample of this.samples) {
      const normalizedTime = sample.time - windowStart;
      if (
        normalizedTime > TIMER_EPSILON
        && normalizedTime < this.duration - TIMER_EPSILON
      ) {
        cycleSamples.push({
          time: normalizedTime,
          x: sample.x,
          y: sample.y,
        });
      }
    }

    cycleSamples.push({ time: this.duration, ...fallback });
    return Object.freeze({
      duration: this.duration,
      samples: Object.freeze(cycleSamples.map((sample) => Object.freeze(sample))),
    });
  }

  getState() {
    return Object.freeze({
      duration: this.duration,
      elapsed: this.elapsed,
      samples: Object.freeze(this.samples.map((sample) => Object.freeze({ ...sample }))),
    });
  }
}

/** Deterministic state machine shared by the runtime and unit tests. */
export class InfiniteLoopMachine {
  constructor({
    historyDuration = LOOP_HISTORY_SECONDS,
    cloneDelay = LOOP_CLONE_DELAY_SECONDS,
    maxClones = LOOP_MAX_CLONES,
    overflowDuration = LOOP_OVERFLOW_SECONDS,
    initialPosition,
  } = {}) {
    this.historyDuration = requirePositive(historyDuration, "historyDuration");
    this.cloneDelay = requirePositive(cloneDelay, "cloneDelay");
    if (!Number.isInteger(maxClones) || maxClones <= 0) {
      throw new RangeError("maxClones must be a positive integer");
    }
    this.maxClones = maxClones;
    this.overflowDuration = requirePositive(overflowDuration, "overflowDuration");
    this.history = new MovementHistory({
      duration: this.historyDuration,
      initialPosition,
    });
    this._clearTrapState();
  }

  _clearTrapState() {
    this.isTrapped = false;
    this.isOverflowing = false;
    this.overflowRemaining = 0;
    this.cycleElapsed = 0;
    this.completedIterations = 0;
    this.cycle = null;
    this.clones = [];
  }

  record(position, deltaSeconds) {
    if (this.isTrapped) return false;
    this.history.record(position, deltaSeconds);
    return true;
  }

  trap(position, { commented = false } = {}) {
    if (commented || this.isTrapped) return false;
    const point = requirePoint(position);
    this.cycle = this.history.createCycle(point);
    this.isTrapped = true;
    this.isOverflowing = false;
    this.overflowRemaining = 0;
    this.cycleElapsed = 0;
    this.completedIterations = 0;
    this.clones = [];
    return true;
  }

  release(position) {
    const wasTrapped = this.isTrapped;
    this._clearTrapState();
    if (position) this.history.reset(position);
    return wasTrapped;
  }

  reset(position) {
    this._clearTrapState();
    this.history.reset(position);
  }

  advance(deltaSeconds) {
    const dt = nonNegativeDelta(deltaSeconds);
    const spawned = [];
    if (!this.isTrapped || !this.cycle) {
      return Object.freeze({
        spawned: Object.freeze(spawned),
        teleportToStart: false,
        playback: null,
      });
    }

    this.cycleElapsed = (this.cycleElapsed + dt) % this.cycle.duration;

    if (this.isOverflowing) {
      this.overflowRemaining = Math.max(0, this.overflowRemaining - dt);
      if (this.overflowRemaining <= TIMER_EPSILON) {
        this._clearTrapState();
        return Object.freeze({
          spawned: Object.freeze(spawned),
          teleportToStart: true,
          playback: null,
        });
      }
    } else {
      const previousTotal = this.completedIterations * this.cycle.duration
        + ((this.cycleElapsed - dt) % this.cycle.duration + this.cycle.duration)
          % this.cycle.duration;
      const nextTotal = previousTotal + dt;
      const completed = Math.floor(
        (nextTotal + TIMER_EPSILON) / this.cycle.duration,
      ) - Math.floor((previousTotal + TIMER_EPSILON) / this.cycle.duration);

      for (let index = 0; index < completed; index += 1) {
        this.completedIterations += 1;
        const clone = Object.freeze({
          id: this.clones.length + 1,
          delay: (this.clones.length + 1) * this.cloneDelay,
        });
        this.clones.push(clone);
        spawned.push(clone);
        if (this.clones.length >= this.maxClones) {
          this.isOverflowing = true;
          this.overflowRemaining = this.overflowDuration;
          break;
        }
      }
    }

    return Object.freeze({
      spawned: Object.freeze(spawned),
      teleportToStart: false,
      playback: this.getPlayback(),
    });
  }

  getPlayback() {
    if (!this.isTrapped || !this.cycle) return null;
    return Object.freeze({
      player: Object.freeze(sampleMovementCycle(this.cycle, this.cycleElapsed)),
      clones: Object.freeze(this.clones.map((clone) => Object.freeze({
        ...clone,
        position: Object.freeze(sampleMovementCycle(
          this.cycle,
          this.cycleElapsed - clone.delay,
        )),
      }))),
    });
  }

  getState() {
    return Object.freeze({
      isTrapped: this.isTrapped,
      isOverflowing: this.isOverflowing,
      overflowRemaining: this.overflowRemaining,
      overflowMessage: this.isOverflowing ? LOOP_OVERFLOW_MESSAGE : null,
      cycleElapsed: this.cycleElapsed,
      cycleDuration: this.cycle?.duration ?? this.historyDuration,
      completedIterations: this.completedIterations,
      cloneCount: this.clones.length,
      cloneDelays: Object.freeze(this.clones.map((clone) => clone.delay)),
    });
  }
}

function objectExists(object) {
  return Boolean(object)
    && (typeof object.exists !== "function" || object.exists());
}

/** Attach Level 3's loop zones and visual clones to an existing game scene. */
export function attachInfiniteLoopSystem(k, {
  gameplayRoot,
  player,
  levelStart,
  zones = [],
  audioManager,
  historyDuration = LOOP_HISTORY_SECONDS,
  cloneDelay = LOOP_CLONE_DELAY_SECONDS,
  maxClones = LOOP_MAX_CLONES,
  overflowDuration = LOOP_OVERFLOW_SECONDS,
} = {}) {
  if (!k || !gameplayRoot?.add || !player?.pos) {
    throw new TypeError("KAPLAY context, gameplayRoot, and player are required");
  }
  const start = requirePoint(levelStart, "levelStart");
  const machine = new InfiniteLoopMachine({
    historyDuration,
    cloneDelay,
    maxClones,
    overflowDuration,
    initialPosition: player.pos,
  });
  const cloneObjects = [];

  const feedback = gameplayRoot.add([
    k.text(LOOP_OVERFLOW_MESSAGE, { size: 26 }),
    k.pos(k.width() / 2, 105),
    k.anchor("center"),
    k.color(248, 81, 73),
    k.z(500),
    "loop-overflow-feedback",
  ]);
  feedback.hidden = true;

  const clearClones = () => {
    for (const clone of cloneObjects.splice(0)) {
      if (objectExists(clone)) clone.destroy?.();
    }
  };

  const setManualControl = (enabled) => {
    player.setManualControlEnabled?.(enabled);
    if (player.vel) {
      player.vel.x = 0;
      player.vel.y = 0;
    }
    player.velocityX = 0;
  };

  const applyPlayback = (playback) => {
    if (!playback) return;
    player.pos.x = playback.player.x;
    player.pos.y = playback.player.y;
    playback.clones.forEach((cloneState, index) => {
      const clone = cloneObjects[index];
      if (!objectExists(clone)) return;
      clone.pos.x = cloneState.position.x;
      clone.pos.y = cloneState.position.y;
    });
  };

  const spawnClone = (cloneState) => {
    const playback = machine.getPlayback();
    const state = playback?.clones.find((entry) => entry.id === cloneState.id);
    const position = state?.position ?? player.pos;
    const clone = gameplayRoot.add([
      k.text(";", { size: 48 }),
      k.pos(position.x, position.y),
      k.anchor("center"),
      k.color(170, 180, 200),
      k.opacity(0.3),
      k.z(5),
      "loop-clone",
    ]);
    clone.loopDelay = cloneState.delay;
    cloneObjects.push(clone);
  };

  const releasePlayer = (reason = "comment") => {
    if (!machine.release(player.pos)) return false;
    clearClones();
    feedback.hidden = true;
    setManualControl(true);
    player.trigger?.("loop-released", reason);
    return true;
  };

  const enterLoop = (zone) => {
    const data = zone?.levelTileData;
    if (
      data?.mechanic?.type !== "infiniteLoop"
      || data.mechanic.enabled === false
    ) {
      return false;
    }
    const commented = Boolean(
      player.isCommented
      || player.shouldIgnoreLogicalObstacle?.(zone),
    );
    if (!machine.trap(player.pos, { commented })) return false;

    setManualControl(false);
    applyPlayback(machine.getPlayback());
    audioManager?.playSfx?.("loopTrap");
    player.trigger?.("loop-trapped", data.mechanic.id);
    return true;
  };

  const controller = gameplayRoot.add([{
    id: "infinite-loop-controller",
    update() {
      const dt = Math.max(0, Number(k.dt()) || 0);
      if (!machine.getState().isTrapped) {
        machine.record(player.pos, dt);
        return;
      }

      const transition = machine.advance(dt);
      transition.spawned.forEach(spawnClone);
      applyPlayback(transition.playback);
      feedback.hidden = !machine.getState().isOverflowing;

      if (transition.teleportToStart) {
        clearClones();
        feedback.hidden = true;
        player.pos.x = start.x;
        player.pos.y = start.y;
        setManualControl(true);
        machine.reset(start);
        player.trigger?.("loop-overflow-reset");
      }
    },
    destroy() {
      clearClones();
    },
  }, "infinite-loop-controller"]);

  player.onCollide("loop-zone", enterLoop);
  player.on?.("comment-start", () => releasePlayer("comment"));
  player.on?.("player-death", () => releasePlayer("death"));

  return Object.freeze({
    enterLoop,
    releasePlayer,
    reset() {
      clearClones();
      feedback.hidden = true;
      setManualControl(true);
      machine.reset(start);
    },
    getState() {
      return Object.freeze({
        ...machine.getState(),
        activeCloneObjects: cloneObjects.length,
        feedbackVisible: !feedback.hidden,
        levelStart: Object.freeze({ ...start }),
      });
    },
    controller,
    feedback,
    zones: Object.freeze([...zones]),
  });
}
