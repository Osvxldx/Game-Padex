import {
  RESPAWN_DELAY,
  RESPAWN_INVULNERABILITY,
} from "../constants.js";

export const DEATH_STATES = Object.freeze({
  ALIVE: "alive",
  DYING: "dying",
  INVULNERABLE: "invulnerable",
});

const BLINK_INTERVAL = 0.1;
const TIMER_EPSILON = 1e-9;

function requireDuration(value, name, { allowZero = false } = {}) {
  const valid = Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
  if (!valid) throw new RangeError(`${name} must be a finite ${allowZero ? "non-negative" : "positive"} number`);
  return value;
}

/** Pure, deterministic state machine used by the runtime and unit tests. */
export function createDeathRespawnMachine({
  respawnDelay = RESPAWN_DELAY,
  invulnerabilityDuration = RESPAWN_INVULNERABILITY,
} = {}) {
  requireDuration(respawnDelay, "respawnDelay", { allowZero: true });
  requireDuration(invulnerabilityDuration, "invulnerabilityDuration");

  let state = DEATH_STATES.ALIVE;
  let deathCount = 0;
  let deathSource = null;
  let deathRemaining = 0;
  let invulnerabilityRemaining = 0;

  const snapshot = () => Object.freeze({
    state,
    deathCount,
    deathSource,
    deathRemaining,
    invulnerabilityRemaining,
    canReceiveDamage: state === DEATH_STATES.ALIVE,
  });

  return Object.freeze({
    getState: snapshot,
    requestDeath(source = "unknown") {
      if (state !== DEATH_STATES.ALIVE) return false;
      state = DEATH_STATES.DYING;
      deathCount += 1;
      deathSource = source;
      deathRemaining = respawnDelay;
      invulnerabilityRemaining = 0;
      return true;
    },
    advance(deltaSeconds) {
      requireDuration(deltaSeconds, "deltaSeconds", { allowZero: true });
      let remainingDelta = deltaSeconds;
      let respawned = false;
      let becameVulnerable = false;

      if (state === DEATH_STATES.DYING) {
        if (remainingDelta + TIMER_EPSILON < deathRemaining) {
          deathRemaining -= remainingDelta;
          remainingDelta = 0;
        } else {
          remainingDelta = Math.max(0, remainingDelta - deathRemaining);
          deathRemaining = 0;
          state = DEATH_STATES.INVULNERABLE;
          invulnerabilityRemaining = invulnerabilityDuration;
          respawned = true;
        }
      }

      if (state === DEATH_STATES.INVULNERABLE && remainingDelta > 0) {
        if (remainingDelta + TIMER_EPSILON < invulnerabilityRemaining) {
          invulnerabilityRemaining -= remainingDelta;
        } else {
          invulnerabilityRemaining = 0;
          state = DEATH_STATES.ALIVE;
          deathSource = null;
          becameVulnerable = true;
        }
      }

      return Object.freeze({ respawned, becameVulnerable, state: snapshot() });
    },
  });
}

/**
 * Apply the complete gameplay-state reset owned by respawn. This operation is
 * shared by the KAPLAY runtime and property tests so reset behavior cannot
 * diverge between both paths.
 */
export function resetPlayerAfterRespawn({
  player,
  checkpoint,
  warningResetContract,
} = {}) {
  if (!player?.pos) {
    throw new TypeError("player with a position is required");
  }
  if (
    !checkpoint
    || !Number.isFinite(checkpoint.x)
    || !Number.isFinite(checkpoint.y)
  ) {
    throw new TypeError("checkpoint requires finite x and y values");
  }

  player.pos.x = checkpoint.x;
  player.pos.y = checkpoint.y;
  player.resetPlayerMovement?.();
  if (player.vel) {
    player.vel.x = 0;
    player.vel.y = 0;
  }
  player.resetCommentAbility?.();
  warningResetContract?.reset?.();
  player.paused = false;
  return player;
}

/**
 * Attach death detection and feedback to the gameplay root. Since the returned
 * controller is a child of gameplayRoot, pausing the root also freezes death
 * delay, invulnerability, blink timing, collisions, and the kill-plane check.
 */
export function attachDeathRespawnSystem(k, {
  gameplayRoot,
  player,
  checkpointState,
  warningResetContract,
  killPlaneY,
  respawnDelay = RESPAWN_DELAY,
  invulnerabilityDuration = RESPAWN_INVULNERABILITY,
  feedbackPosition,
  palette,
} = {}) {
  if (!gameplayRoot || !player || !checkpointState) {
    throw new TypeError("gameplayRoot, player, and checkpointState are required");
  }
  if (!Number.isFinite(killPlaneY)) {
    throw new TypeError("killPlaneY must be finite");
  }

  const machine = createDeathRespawnMachine({
    respawnDelay,
    invulnerabilityDuration,
  });
  const initialFeedbackColor = palette?.danger ?? [248, 81, 73];
  const feedback = gameplayRoot.add([
    k.text("FATAL ERROR · REINICIANDO...", { size: 28 }),
    k.pos(feedbackPosition ?? k.vec2(k.width() / 2, 110)),
    k.anchor("center"),
    k.color(...initialFeedbackColor),
    k.z(500),
    "death-feedback",
  ]);
  feedback.hidden = true;

  let blinkVisible = true;

  const restoreAliveVisual = () => {
    if (typeof player.exists === "function" && !player.exists()) return;
    player.hidden = false;
    player.opacity = 1;
    blinkVisible = true;
  };

  const respawnPlayer = () => {
    if (typeof player.exists === "function" && !player.exists()) return;
    resetPlayerAfterRespawn({
      player,
      checkpoint: checkpointState.getLastCheckpoint(),
      warningResetContract,
    });
    feedback.hidden = true;
    restoreAliveVisual();
  };

  const requestDeath = (source = "unknown") => {
    if (typeof player.exists === "function" && !player.exists()) return false;
    if (!machine.requestDeath(source)) return false;

    player.cancelCommentWithoutCooldown?.();
    player.resetPlayerMovement?.();
    if (player.vel) {
      player.vel.x = 0;
      player.vel.y = 0;
    }
    player.opacity = 0.2;
    player.paused = true;
    feedback.hidden = false;
    player.trigger?.("player-death", source);
    return true;
  };

  player.onCollide("lethal", () => requestDeath("lethal"));

  const controller = gameplayRoot.add([{
    id: "death-respawn-controller",
    update() {
      if (typeof player.exists === "function" && !player.exists()) return;

      if (
        machine.getState().state === DEATH_STATES.ALIVE
        && player.pos.y > killPlaneY
      ) {
        requestDeath("kill-plane");
      }

      const transition = machine.advance(Math.max(0, Number(k.dt()) || 0));
      if (transition.respawned) respawnPlayer();

      const current = machine.getState();
      if (current.state === DEATH_STATES.INVULNERABLE) {
        const elapsed = invulnerabilityDuration - current.invulnerabilityRemaining;
        blinkVisible = Math.floor(elapsed / BLINK_INTERVAL) % 2 === 0;
        player.opacity = blinkVisible ? 1 : 0.25;
      } else if (transition.becameVulnerable) {
        restoreAliveVisual();
      }
    },
  }, "death-respawn-controller"]);

  return Object.freeze({
    requestDeath,
    applyPalette(nextPalette) {
      const danger = nextPalette?.danger;
      if (Array.isArray(danger) && danger.length >= 3) {
        feedback.color = k.rgb(danger[0], danger[1], danger[2]);
      }
      return feedback.color;
    },
    getState() {
      const state = machine.getState();
      return Object.freeze({
        ...state,
        blinking: state.state === DEATH_STATES.INVULNERABLE,
        blinkVisible,
        feedbackVisible: !feedback.hidden,
        killPlaneY,
      });
    },
    controller,
  });
}
