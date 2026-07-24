import {
  PLAYER_SPEED,
  PLAYER_JUMP_FORCE,
  GRAVITY,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  JUMP_CUT_MULTIPLIER,
  DECELERATION_TIME,
  CANVAS_WIDTH,
} from "../constants.js";

/**
 * Custom KAPLAY component factory for the player character.
 * Provides horizontal movement, variable-height jump, coyote time, and jump buffer.
 *
 * @param {object} k - The kaplay instance
 * @returns {object} KAPLAY component definition
 */
export function playerComponent(k) {
  return {
    id: "playerController",

    // Internal state
    velocityX: 0,
    velocityY: 0,
    isGrounded: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    isJumping: false,
    wasGrounded: false,

    add() {
      // Listen for collisions with platforms to detect grounded state
      this.onCollide("platform", (obj, col) => {
        if (col.isBottom()) {
          this.isGrounded = true;
          this.velocityY = 0;
          this.coyoteTimer = COYOTE_TIME;

          // Execute buffered jump if within buffer window
          if (this.jumpBufferTimer > 0) {
            this.executeJump();
            this.jumpBufferTimer = 0;
          }
        }
      });

      // Detect when leaving a platform
      this.onCollideEnd("platform", () => {
        // Only start coyote timer if we didn't jump off
        if (!this.isJumping) {
          this.wasGrounded = true;
        }
      });
    },

    update() {
      const dt = k.dt();

      // --- Grounded detection via raycasting ---
      // Check if we are standing on something by checking body's grounded state
      if (this.isStatic === undefined) {
        // Use pos check: if velocity Y is 0 and we had a bottom collision last frame
        // The onCollide above handles setting isGrounded
      }

      // --- Coyote Time ---
      if (this.wasGrounded && !this.isGrounded) {
        this.coyoteTimer -= dt;
        if (this.coyoteTimer <= 0) {
          this.coyoteTimer = 0;
          this.wasGrounded = false;
        }
      }

      // If grounded, keep coyote timer full
      if (this.isGrounded) {
        this.coyoteTimer = COYOTE_TIME;
        this.isJumping = false;
        this.wasGrounded = true;
      }

      // Detect if we left the ground (not from jump)
      if (this.wasGrounded && !this.isGrounded && !this.isJumping) {
        // Coyote timer is ticking (set above)
      }

      // --- Jump Buffer Timer ---
      if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer -= dt;
        if (this.jumpBufferTimer <= 0) {
          this.jumpBufferTimer = 0;
        }
      }

      // --- Horizontal Movement ---
      let moveDir = 0;
      if (k.isKeyDown("left") || k.isKeyDown("a")) {
        moveDir -= 1;
      }
      if (k.isKeyDown("right") || k.isKeyDown("d")) {
        moveDir += 1;
      }

      if (moveDir !== 0) {
        this.velocityX = moveDir * PLAYER_SPEED;
      } else {
        // Decelerate to zero within DECELERATION_TIME
        const decelRate = PLAYER_SPEED / DECELERATION_TIME;
        if (this.velocityX > 0) {
          this.velocityX = Math.max(0, this.velocityX - decelRate * dt);
        } else if (this.velocityX < 0) {
          this.velocityX = Math.min(0, this.velocityX + decelRate * dt);
        }
      }

      // Apply horizontal movement
      this.move(this.velocityX, 0);

      // --- Gravity ---
      if (!this.isGrounded) {
        this.velocityY += GRAVITY * dt;
      } else {
        this.velocityY = 0;
      }

      // Apply vertical movement (gravity/jump)
      this.move(0, this.velocityY * dt);

      // --- Jump Input ---
      if (k.isKeyPressed("space") || k.isKeyPressed("w") || k.isKeyPressed("up")) {
        if (this.canJump()) {
          this.executeJump();
        } else {
          // Buffer the jump input
          this.jumpBufferTimer = JUMP_BUFFER_TIME;
        }
      }

      // --- Variable Height Jump (cut velocity on key release) ---
      if (
        (k.isKeyReleased("space") || k.isKeyReleased("w") || k.isKeyReleased("up")) &&
        this.isJumping &&
        this.velocityY < 0
      ) {
        this.velocityY *= JUMP_CUT_MULTIPLIER;
      }

      // --- Boundary Clamping ---
      const halfWidth = this.width ? this.width / 2 : 12;
      if (this.pos.x < halfWidth) {
        this.pos.x = halfWidth;
        this.velocityX = 0;
      }
      if (this.pos.x > CANVAS_WIDTH - halfWidth) {
        this.pos.x = CANVAS_WIDTH - halfWidth;
        this.velocityX = 0;
      }

      // --- Ground state reset if falling ---
      if (this.velocityY > 0) {
        this.isGrounded = false;
      }
    },

    /**
     * Check if the player can currently jump (grounded or within coyote time).
     */
    canJump() {
      return this.isGrounded || this.coyoteTimer > 0;
    },

    /**
     * Execute the jump: apply upward velocity, reset coyote timer.
     */
    executeJump() {
      this.velocityY = -PLAYER_JUMP_FORCE;
      this.isGrounded = false;
      this.isJumping = true;
      this.coyoteTimer = 0;
      this.wasGrounded = false;
      this.jumpBufferTimer = 0;
    },
  };
}
