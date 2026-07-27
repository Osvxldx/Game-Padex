import {
  PLAYER_SPEED,
  PLAYER_JUMP_FORCE,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  JUMP_CUT_MULTIPLIER,
  DECELERATION_TIME,
  CANVAS_WIDTH,
} from "../constants.js";

const JUMP_KEYS = ["space", "w", "up"];

/**
 * Reduce a controller-owned horizontal velocity toward zero.
 * KAPLAY's move() applies delta time, so this function only updates px/s.
 */
export function calculateHorizontalVelocity(
  currentVelocity,
  direction,
  dt,
  speed = PLAYER_SPEED,
  decelerationTime = DECELERATION_TIME,
) {
  if (direction !== 0) {
    return Math.sign(direction) * speed;
  }

  if (currentVelocity === 0) {
    return 0;
  }

  const safeDt = Math.max(0, dt);
  const deceleration = speed / decelerationTime;
  const nextMagnitude = Math.max(
    0,
    Math.abs(currentVelocity) - deceleration * safeDt,
  );

  if (nextMagnitude === 0) {
    return 0;
  }

  return Math.sign(currentVelocity) * nextMagnitude;
}

/** Decrease a seconds-based timer without allowing negative values. */
export function tickTimer(timer, dt) {
  return Math.max(0, timer - Math.max(0, dt));
}

/** A jump is valid only from the floor or during the remaining coyote window. */
export function canUseJumpWindow(grounded, coyoteTimer) {
  return grounded || coyoteTimer > 0;
}

/** Cut only upward velocity; falling velocity must remain untouched. */
export function cutUpwardVelocity(
  verticalVelocity,
  multiplier = JUMP_CUT_MULTIPLIER,
) {
  return verticalVelocity < 0
    ? verticalVelocity * multiplier
    : verticalVelocity;
}

/**
 * Return center-position bounds for a centered player collider.
 * Oversized or invalid widths safely collapse to the level center.
 */
export function horizontalBounds(
  objectWidth,
  levelWidth = CANVAS_WIDTH,
) {
  const safeLevelWidth = Math.max(0, levelWidth);
  const safeObjectWidth = Number.isFinite(objectWidth)
    ? Math.max(0, objectWidth)
    : 0;
  const halfWidth = Math.min(safeObjectWidth / 2, safeLevelWidth / 2);

  return {
    min: halfWidth,
    max: safeLevelWidth - halfWidth,
  };
}

/** Reset controller and body velocity fields without changing position. */
export function resetPlayerMovementState(player) {
  player.velocityX = 0;
  player.coyoteTimer = 0;
  player.jumpBufferTimer = 0;
  player.controllerJumpActive = false;
  player.jumpConsumed = true;
  player.wasGrounded = false;
  if (player.vel) {
    player.vel.x = 0;
    player.vel.y = 0;
  }
}

function isAnyKeyDown(k, keys) {
  return keys.some((key) => k.isKeyDown(key));
}

function isAnyKeyPressed(k, keys) {
  return keys.some((key) => k.isKeyPressed(key));
}

function isAnyKeyReleased(k, keys) {
  return keys.some((key) => k.isKeyReleased(key));
}

/**
 * Custom KAPLAY component for horizontal movement and assisted jumping.
 *
 * Physics ownership is intentionally split without overlap:
 * - body() owns vertical velocity, gravity, jump impulse, and collision resolution.
 * - playerController owns horizontal input velocity and jump-assist timers.
 * - pos.move(pxPerSecond, 0) owns delta-time integration for horizontal motion.
 *
 * @param {object} k - KAPLAY context
 * @param {{ levelWidth?: number }} [options]
 * @returns {object} KAPLAY component definition
 */
export function playerComponent(k, options = {}) {
  const levelWidth = options.levelWidth ?? CANVAS_WIDTH;

  return {
    id: "playerController",

    // Names intentionally do not overlap with BodyComp's public API.
    velocityX: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    controllerJumpActive: false,
    jumpConsumed: true,
    wasGrounded: false,
    manualControlEnabled: true,

    update() {
      const dt = Math.max(0, k.dt());

      // Level mechanics can take ownership of position while Comment Code and
      // the rest of the player's components continue updating normally.
      if (!this.manualControlEnabled) {
        this.velocityX = 0;
        this.jumpBufferTimer = 0;
        this.controllerJumpActive = false;
        return;
      }

      const groundedAtFrameStart = this.isGrounded();

      // body() is the source of truth for grounded state. The first airborne
      // frame starts coyote time only when the player walked off an edge.
      if (groundedAtFrameStart) {
        this.coyoteTimer = COYOTE_TIME;
        this.jumpConsumed = false;
        this.controllerJumpActive = false;
      } else {
        if (this.wasGrounded && !this.jumpConsumed) {
          this.coyoteTimer = COYOTE_TIME;
        }
        this.coyoteTimer = tickTimer(this.coyoteTimer, dt);
      }

      this.jumpBufferTimer = tickTimer(this.jumpBufferTimer, dt);

      let moveDirection = 0;
      if (k.isKeyDown("left") || k.isKeyDown("a")) {
        moveDirection -= 1;
      }
      if (k.isKeyDown("right") || k.isKeyDown("d")) {
        moveDirection += 1;
      }

      this.velocityX = calculateHorizontalVelocity(
        this.velocityX,
        moveDirection,
        dt,
      );

      // Text width changes while Comment Code renders "// ;". Level bounds
      // must follow the fixed physics collider rather than the glyph width.
      const colliderWidth = typeof this.worldArea === "function"
        ? this.worldArea().bbox().width
        : this.width;
      const bounds = horizontalBounds(colliderWidth, levelWidth);

      // Do not spend a frame repeatedly moving beyond a level boundary.
      if (
        (this.pos.x <= bounds.min && this.velocityX < 0)
        || (this.pos.x >= bounds.max && this.velocityX > 0)
      ) {
        this.velocityX = 0;
      }

      // move() accepts pixels per second and applies KAPLAY's dt internally.
      // y=0 prevents double gravity / double vertical integration.
      this.move(this.velocityX, 0);

      const clampedX = Math.min(bounds.max, Math.max(bounds.min, this.pos.x));
      if (clampedX !== this.pos.x) {
        this.pos.x = clampedX;
        this.velocityX = 0;
      }

      // Always queue the press first. It is consumed immediately on the floor
      // or during coyote time, otherwise it remains available for 100 ms.
      if (isAnyKeyPressed(k, JUMP_KEYS)) {
        this.jumpBufferTimer = JUMP_BUFFER_TIME;
      }

      if (
        this.jumpBufferTimer > 0
        && this.canJump(groundedAtFrameStart)
      ) {
        this.executeJump();
      }

      // Releasing one jump binding must not cut the jump while another jump
      // binding is still held.
      if (
        isAnyKeyReleased(k, JUMP_KEYS)
        && !isAnyKeyDown(k, JUMP_KEYS)
        && this.controllerJumpActive
      ) {
        this.vel.y = cutUpwardVelocity(this.vel.y);
      }

      // A jump launched this frame must not look grounded on the next frame,
      // even if body() keeps the previous platform until its next update.
      this.wasGrounded = groundedAtFrameStart
        && !this.controllerJumpActive;
    },

    /** Check body() grounded state plus controller coyote time. */
    canJump(grounded = this.isGrounded()) {
      return !this.jumpConsumed
        && canUseJumpWindow(grounded, this.coyoteTimer);
    },

    /** Apply one body() jump impulse and consume all assist windows. */
    executeJump() {
      this.jump(PLAYER_JUMP_FORCE);
      this.controllerJumpActive = true;
      this.jumpConsumed = true;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.wasGrounded = false;
      this.trigger?.("player-jump");
    },

    /** Enable or disable only keyboard-driven movement and jumping. */
    setManualControlEnabled(enabled) {
      this.manualControlEnabled = Boolean(enabled);
      if (!this.manualControlEnabled) {
        resetPlayerMovementState(this);
      }
      return this.manualControlEnabled;
    },

    /** Respawn/restart hook owned by the movement controller. */
    resetPlayerMovement() {
      resetPlayerMovementState(this);
      this.manualControlEnabled = true;
    },
  };
}
