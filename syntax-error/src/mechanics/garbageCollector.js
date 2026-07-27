import { readRawPlayerInput } from "../components/player.js";

export const GC_INACTIVITY_SECONDS = 5;
export const GC_ALERT_PROGRESS = 0.6;
export const GC_CHASE_DISTANCE = 320;

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

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function lerp(from, to, amount) {
  return from + (to - from) * clamp01(amount);
}

/**
 * Pure inactivity state machine for the Garbage Collector. Movement resets the
 * timer to zero; a paused frame (commented or otherwise input-locked) holds the
 * current value; idle frames accumulate until the inactivity threshold triggers
 * a single elimination signal.
 */
export function createGarbageCollectorMachine({
  inactivitySeconds = GC_INACTIVITY_SECONDS,
} = {}) {
  const threshold = requirePositive(inactivitySeconds, "inactivitySeconds");
  let elapsed = 0;
  let triggered = false;

  const snapshot = () => Object.freeze({
    elapsed,
    threshold,
    remaining: Math.max(0, threshold - elapsed),
    progress: clamp01(elapsed / threshold),
    triggered,
  });

  return Object.freeze({
    getState: snapshot,
    /** Advance one frame. Order: already-triggered > paused > moving > idle. */
    advance(deltaSeconds, { moving = false, paused = false } = {}) {
      const dt = nonNegativeDelta(deltaSeconds);
      if (triggered) {
        return Object.freeze({ justTriggered: false, paused: false, moved: false, ...snapshot() });
      }
      if (paused) {
        return Object.freeze({ justTriggered: false, paused: true, moved: false, ...snapshot() });
      }
      if (moving) {
        elapsed = 0;
        return Object.freeze({ justTriggered: false, paused: false, moved: true, ...snapshot() });
      }
      elapsed += dt;
      if (elapsed >= threshold) {
        elapsed = threshold;
        triggered = true;
        return Object.freeze({ justTriggered: true, paused: false, moved: false, ...snapshot() });
      }
      return Object.freeze({ justTriggered: false, paused: false, moved: false, ...snapshot() });
    },
    reset() {
      elapsed = 0;
      triggered = false;
      return snapshot();
    },
  });
}

/** True when any raw movement key (left/right/jump) is engaged this frame. */
export function isMovementInput(rawInput = {}) {
  return Boolean(
    rawInput.leftDown
    || rawInput.rightDown
    || rawInput.jumpDown
    || rawInput.jumpPressed,
  );
}

function objectExists(object) {
  return Boolean(object)
    && (typeof object.exists !== "function" || object.exists());
}

/**
 * Attach the Level 1 / Level 5 Garbage Collector to the gameplay root. The
 * robot approaches the player proportionally to the inactivity timer and
 * eliminates the player through the shared death system when the timer expires.
 *
 * The timer pauses while the player is commented (Requirement 5.4) or otherwise
 * input-locked (e.g. trapped in an Infinite Loop), so simultaneous mechanics in
 * Level 5 cannot cause an unavoidable death while the player has no controls.
 */
export function attachGarbageCollectorSystem(k, {
  gameplayRoot,
  player,
  zones = [],
  home,
  requestDeath,
  audioManager,
  inactivitySeconds = GC_INACTIVITY_SECONDS,
  chaseDistance = GC_CHASE_DISTANCE,
  alertProgress = GC_ALERT_PROGRESS,
} = {}) {
  if (!k || !gameplayRoot?.add || !player?.pos) {
    throw new TypeError("KAPLAY context, gameplayRoot, and player are required");
  }

  const machine = createGarbageCollectorMachine({ inactivitySeconds });
  const triggerDeath = typeof requestDeath === "function"
    ? requestDeath
    : () => false;

  const firstZone = zones.find((zone) => zone?.pos);
  const homeX = Number.isFinite(home?.x)
    ? home.x
    : Number.isFinite(firstZone?.pos?.x)
      ? firstZone.pos.x
      : player.pos.x - chaseDistance;
  const homeY = Number.isFinite(home?.y)
    ? home.y
    : Number.isFinite(firstZone?.pos?.y)
      ? firstZone.pos.y
      : player.pos.y;

  const robot = gameplayRoot.add([
    k.rect(40, 40),
    k.pos(homeX, homeY),
    k.anchor("center"),
    k.color(248, 81, 73),
    k.opacity(0.4),
    k.z(6),
    "gc-robot",
  ]);
  const robotLabel = gameplayRoot.add([
    k.text("GC", { size: 18 }),
    k.pos(homeX, homeY),
    k.anchor("center"),
    k.color(255, 255, 255),
    k.z(7),
    "gc-robot-label",
  ]);

  const hudComponents = [
    k.text("GC 5.0s", { size: 20 }),
    k.pos(k.width() - 24, 24),
    k.anchor("topright"),
    k.color(248, 81, 73),
    k.z(220),
    "gc-hud",
    "gameplay-ui",
  ];
  if (typeof k.fixed === "function") hudComponents.push(k.fixed());
  const hud = gameplayRoot.add(hudComponents);

  let alerted = false;
  let dangerColor = [248, 81, 73];
  let safeColor = [227, 179, 65];

  const colorFor = (progress) => (progress >= alertProgress ? dangerColor : safeColor);

  const syncRobot = (snap, dt) => {
    const targetX = player.pos.x - chaseDistance * (1 - snap.progress);
    const targetY = player.pos.y;
    const smoothing = Math.min(1, Math.max(0, dt) * 6);
    if (objectExists(robot)) {
      robot.pos.x = lerp(robot.pos.x, targetX, smoothing);
      robot.pos.y = lerp(robot.pos.y, targetY, smoothing);
      robot.opacity = 0.35 + 0.6 * snap.progress;
      robot.color = k.rgb(...dangerColor);
    }
    if (objectExists(robotLabel)) {
      robotLabel.pos.x = robot.pos.x;
      robotLabel.pos.y = robot.pos.y;
    }
    hud.text = `GC ${snap.remaining.toFixed(1)}s`;
    hud.color = k.rgb(...colorFor(snap.progress));
  };

  const snapRobotHome = () => {
    if (objectExists(robot)) {
      robot.pos.x = homeX;
      robot.pos.y = homeY;
      robot.opacity = 0.4;
    }
    if (objectExists(robotLabel)) {
      robotLabel.pos.x = homeX;
      robotLabel.pos.y = homeY;
    }
    hud.text = `GC ${machine.getState().remaining.toFixed(1)}s`;
    hud.color = k.rgb(...safeColor);
  };

  const isPaused = () => Boolean(
    player.isCommented
    || player.manualControlEnabled === false
    || player.paused,
  );

  const controller = gameplayRoot.add([{
    id: "garbage-collector-controller",
    update() {
      if (typeof player.exists === "function" && !player.exists()) return;
      const dt = Math.max(0, Number(k.dt()) || 0);
      const rawInput = readRawPlayerInput(k);
      const moving = isMovementInput(rawInput);
      const transition = machine.advance(dt, { moving, paused: isPaused() });

      if (transition.progress >= alertProgress && !alerted && !transition.paused) {
        alerted = true;
        try {
          audioManager?.playSfx?.("gcAlert");
        } catch {
          // Audio is optional and must never block the elimination timer.
        }
      } else if (transition.progress < alertProgress) {
        alerted = false;
      }

      syncRobot(machine.getState(), dt);

      if (transition.justTriggered) {
        triggerDeath("garbage-collector");
      }
    },
    destroy() {
      // Child objects are destroyed by the KAPLAY scene graph on scene change.
    },
  }, "garbage-collector-controller"]);

  const reset = () => {
    machine.reset();
    alerted = false;
    snapRobotHome();
    return machine.getState();
  };

  player.on?.("player-death", reset);
  player.on?.("level-complete", reset);

  return Object.freeze({
    type: "garbageCollector",
    machine,
    reset,
    getState() {
      return Object.freeze({
        ...machine.getState(),
        alerted,
        robot: Object.freeze({ x: robot.pos.x, y: robot.pos.y, opacity: robot.opacity }),
        home: Object.freeze({ x: homeX, y: homeY }),
        hudText: hud.text,
      });
    },
    applyTheme(palette) {
      if (palette?.danger) dangerColor = [...palette.danger];
      if (palette?.warning) safeColor = [...palette.warning];
      if (objectExists(robot)) robot.color = k.rgb(...dangerColor);
      hud.color = k.rgb(...colorFor(machine.getState().progress));
    },
    controller,
    robot,
    hud,
  });
}
