export const GARBAGE_COLLECTOR_TIMEOUT = 5;
export const GARBAGE_COLLECTOR_MOVEMENT_KEYS = Object.freeze([
  "left",
  "right",
  "a",
  "d",
  "up",
  "w",
  "space",
]);

const DEFAULT_APPROACH_DISTANCE = 240;

function requireNonNegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite non-negative number`);
  }
  return value;
}

function requirePositiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
  return value;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

/** Convert timer progress into the robot's remaining distance to the player. */
export function calculateRobotApproachOffset(
  progress,
  approachDistance = DEFAULT_APPROACH_DISTANCE,
) {
  requireNonNegativeFinite(progress, "progress");
  requireNonNegativeFinite(approachDistance, "approachDistance");
  return approachDistance * (1 - clamp01(progress));
}

/**
 * Deterministic inactivity state machine shared by runtime code and tests.
 * The timeout transition is emitted once; movement or respawn reset it.
 */
export function createGarbageCollectorState({
  inactivitySeconds = GARBAGE_COLLECTOR_TIMEOUT,
} = {}) {
  const thresholdSeconds = requirePositiveFinite(
    inactivitySeconds,
    "inactivitySeconds",
  );
  let elapsedSeconds = 0;
  let paused = false;
  let hasTriggered = false;

  const snapshot = () => Object.freeze({
    elapsedSeconds,
    remainingSeconds: Math.max(0, thresholdSeconds - elapsedSeconds),
    thresholdSeconds,
    progress: clamp01(elapsedSeconds / thresholdSeconds),
    paused,
    hasTriggered,
  });

  return Object.freeze({
    getState: snapshot,

    advance(deltaSeconds, { isPaused = false } = {}) {
      requireNonNegativeFinite(deltaSeconds, "deltaSeconds");
      paused = Boolean(isPaused);
      if (paused || hasTriggered) {
        return Object.freeze({ ...snapshot(), shouldKill: false });
      }

      elapsedSeconds = Math.min(
        thresholdSeconds,
        elapsedSeconds + deltaSeconds,
      );
      const shouldKill = elapsedSeconds >= thresholdSeconds;
      if (shouldKill) hasTriggered = true;
      return Object.freeze({ ...snapshot(), shouldKill });
    },

    recordMovement() {
      elapsedSeconds = 0;
      paused = false;
      hasTriggered = false;
      return snapshot();
    },

    reset() {
      elapsedSeconds = 0;
      paused = false;
      hasTriggered = false;
      return snapshot();
    },
  });
}

function isMovementPressed(k) {
  return GARBAGE_COLLECTOR_MOVEMENT_KEYS.some((key) => k.isKeyPressed(key));
}

/** Attach Level 1's timer, death transition, HUD, and robot approach visual. */
export function attachGarbageCollector(k, {
  gameplayRoot,
  player,
  deathSystem,
  config = {},
  palette = {},
  approachDistance = DEFAULT_APPROACH_DISTANCE,
} = {}) {
  if (!gameplayRoot?.add || !player?.pos) {
    throw new TypeError("gameplayRoot and player are required");
  }
  if (typeof deathSystem?.requestDeath !== "function") {
    throw new TypeError("deathSystem.requestDeath is required");
  }
  requireNonNegativeFinite(approachDistance, "approachDistance");

  const state = createGarbageCollectorState({
    inactivitySeconds: config.inactivitySeconds
      ?? GARBAGE_COLLECTOR_TIMEOUT,
  });
  let currentPalette = palette;

  const robot = gameplayRoot.add([
    k.text("🤖", { size: 38 }),
    k.pos(player.pos.x + approachDistance, player.pos.y),
    k.anchor("center"),
    k.scale(1),
    k.opacity(0.9),
    k.color(...(currentPalette.danger ?? [248, 81, 73])),
    k.z(150),
    "garbage-collector-robot",
  ]);
  const timerLabel = gameplayRoot.add([
    k.text("GC: 0.0s", { size: 16 }),
    k.pos(k.width() - 92, 52),
    k.anchor("center"),
    k.color(...(currentPalette.ui ?? [201, 209, 217])),
    k.z(200),
    "gameplay-ui",
    "garbage-collector-timer",
  ]);

  const updateVisual = (snapshot) => {
    const offset = calculateRobotApproachOffset(
      snapshot.progress,
      approachDistance,
    );
    robot.pos.x = player.pos.x + offset;
    robot.pos.y = player.pos.y;
    const size = 0.7 + snapshot.progress * 0.3;
    robot.scale = k.vec2(size, size);
    robot.opacity = snapshot.paused ? 0.35 : 0.9;
    timerLabel.text = snapshot.paused
      ? `GC: PAUSA ${snapshot.elapsedSeconds.toFixed(1)}s`
      : `GC: ${snapshot.elapsedSeconds.toFixed(1)}s`;
  };

  const respawnSubscription = player.on?.("player-respawn", () => {
    updateVisual(state.reset());
  });

  const controller = gameplayRoot.add([{
    id: "garbageCollectorController",
    update() {
      const isCommented = Boolean(
        player.isImmuneToLogic?.() ?? player.isCommented,
      );
      const isPaused = isCommented || Boolean(player.paused);
      let transition;

      if (!isPaused && isMovementPressed(k)) {
        transition = { ...state.recordMovement(), shouldKill: false };
      } else {
        transition = state.advance(Math.max(0, Number(k.dt()) || 0), {
          isPaused,
        });
      }

      updateVisual(transition);
      if (transition.shouldKill) {
        deathSystem.requestDeath("garbage-collector");
      }
    },
    destroy() {
      respawnSubscription?.cancel?.();
    },
  }, "garbage-collector-controller"]);

  updateVisual(state.getState());

  return Object.freeze({
    controller,
    robot,
    timerLabel,
    recordMovement() {
      const snapshot = state.recordMovement();
      updateVisual(snapshot);
      return snapshot;
    },
    reset() {
      const snapshot = state.reset();
      updateVisual(snapshot);
      return snapshot;
    },
    applyPalette(nextPalette = {}) {
      currentPalette = nextPalette;
      robot.color = k.rgb(...(currentPalette.danger ?? [248, 81, 73]));
      timerLabel.color = k.rgb(...(currentPalette.ui ?? [201, 209, 217]));
    },
    getState() {
      const snapshot = state.getState();
      return Object.freeze({
        ...snapshot,
        approachOffset: calculateRobotApproachOffset(
          snapshot.progress,
          approachDistance,
        ),
      });
    },
  });
}
