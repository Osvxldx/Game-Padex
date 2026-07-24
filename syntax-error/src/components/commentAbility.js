import {
  COMMENT_DURATION,
  COMMENT_COOLDOWN,
  COMMENT_OPACITY,
} from "../constants.js";

/**
 * Custom KAPLAY component factory for the "Comment Code" ability.
 * When activated, the player becomes semi-transparent, shows "// ;" prefix,
 * ignores logical obstacles, and falls through platforms.
 *
 * @param {object} k - The kaplay instance
 * @returns {object} KAPLAY component definition
 */
export function commentAbilityComponent(k) {
  // Original player color (blue)
  const ORIGINAL_COLOR = k.rgb(88, 166, 255);
  // Grayscale color during comment state
  const COMMENT_COLOR = k.rgb(150, 150, 150);

  return {
    id: "commentAbility",

    // State tracking
    isCommented: false,
    commentTimer: 0,
    cooldownTimer: 0,
    canActivate: true,

    // Internal references
    _cooldownIndicator: null,
    _originalText: ";",
    _platformCollisionActive: true,

    add() {
      // Create cooldown indicator (small bar below the player)
      this._cooldownIndicator = k.add([
        k.rect(30, 4),
        k.pos(this.pos.x, this.pos.y + 30),
        k.anchor("center"),
        k.color(100, 200, 100),
        k.opacity(0),
        k.z(100),
        "cooldown-indicator",
      ]);
    },

    destroy() {
      if (this._cooldownIndicator) {
        k.destroy(this._cooldownIndicator);
        this._cooldownIndicator = null;
      }
    },

    update() {
      const dt = k.dt();

      // --- Activation Input ---
      if (k.isKeyPressed("shift") || k.isKeyPressed("c")) {
        if (this.canActivate && !this.isCommented) {
          this._activateComment();
        }
      }

      // --- Comment State Timer ---
      if (this.isCommented) {
        this.commentTimer -= dt;
        if (this.commentTimer <= 0) {
          this._deactivateComment();
        }
      }

      // --- Cooldown Timer ---
      if (!this.canActivate && !this.isCommented) {
        this.cooldownTimer -= dt;
        if (this.cooldownTimer <= 0) {
          this.cooldownTimer = 0;
          this.canActivate = true;
        }
      }

      // --- Update cooldown indicator position and display ---
      if (this._cooldownIndicator) {
        this._cooldownIndicator.pos.x = this.pos.x;
        this._cooldownIndicator.pos.y = this.pos.y + 35;

        if (!this.canActivate && !this.isCommented) {
          // Show cooldown progress
          const progress = this.cooldownTimer / COMMENT_COOLDOWN;
          this._cooldownIndicator.opacity = 0.8;
          this._cooldownIndicator.width = 30 * progress;
          this._cooldownIndicator.color = k.rgb(200, 100, 100);
        } else if (this.isCommented) {
          // Show comment duration remaining
          const progress = this.commentTimer / COMMENT_DURATION;
          this._cooldownIndicator.opacity = 0.9;
          this._cooldownIndicator.width = 30 * progress;
          this._cooldownIndicator.color = k.rgb(100, 200, 255);
        } else {
          // Ability ready - briefly flash or hide
          this._cooldownIndicator.opacity = 0;
        }
      }

      // --- Handle platform collision during comment state ---
      if (this.isCommented && this._platformCollisionActive) {
        this._platformCollisionActive = false;
        // Mark collision ignore for platforms
        if (this.collisionIgnore) {
          if (!this.collisionIgnore.includes("platform")) {
            this.collisionIgnore.push("platform");
          }
        } else {
          this.collisionIgnore = ["platform"];
        }
      }
    },

    /**
     * Activate the comment state.
     */
    _activateComment() {
      this.isCommented = true;
      this.commentTimer = COMMENT_DURATION;
      this.canActivate = false;

      // Visual changes: reduced opacity, grayscale, show "// ;"
      this.opacity = COMMENT_OPACITY;
      this.color = COMMENT_COLOR;
      // Change text to show comment prefix
      if (this.text !== undefined) {
        this.text = "// ;";
      }

      // Disable platform collisions
      this._platformCollisionActive = false;
      if (this.collisionIgnore) {
        if (!this.collisionIgnore.includes("platform")) {
          this.collisionIgnore.push("platform");
        }
      } else {
        this.collisionIgnore = ["platform"];
      }
    },

    /**
     * Deactivate the comment state and restore normal behavior.
     */
    _deactivateComment() {
      this.isCommented = false;
      this.commentTimer = 0;

      // Restore visuals
      this.opacity = 1.0;
      this.color = ORIGINAL_COLOR;
      if (this.text !== undefined) {
        this.text = ";";
      }

      // Re-enable platform collisions
      this._platformCollisionActive = true;
      if (this.collisionIgnore) {
        const idx = this.collisionIgnore.indexOf("platform");
        if (idx !== -1) {
          this.collisionIgnore.splice(idx, 1);
        }
      }

      // Start cooldown
      this.cooldownTimer = COMMENT_COOLDOWN;

      // Handle "stuck in platform" case: reposition above nearest platform
      this._resolveOverlap();
    },

    /**
     * Resolve overlap with platforms after comment state ends.
     * If the player is inside a platform, move them above it.
     */
    _resolveOverlap() {
      // Get all platforms and check for overlap
      const platforms = k.get("platform");
      for (const plat of platforms) {
        if (this.isOverlapping(plat)) {
          // Move player above the platform surface
          const platTop = plat.pos.y;
          // Account for anchor - if platform uses "topleft", top is pos.y
          // Player uses "center" anchor, so offset by half height
          const playerHalfHeight = this.height ? this.height / 2 : 24;
          this.pos.y = platTop - playerHalfHeight - 1;

          // Reset vertical velocity since we repositioned
          if (this.vel) {
            this.vel.y = 0;
          }
          break;
        }
      }
    },

    /**
     * Cancel comment state without starting cooldown (used when player dies).
     */
    cancelComment() {
      if (this.isCommented) {
        this.isCommented = false;
        this.commentTimer = 0;

        // Restore visuals
        this.opacity = 1.0;
        this.color = ORIGINAL_COLOR;
        if (this.text !== undefined) {
          this.text = ";";
        }

        // Re-enable platform collisions
        this._platformCollisionActive = true;
        if (this.collisionIgnore) {
          const idx = this.collisionIgnore.indexOf("platform");
          if (idx !== -1) {
            this.collisionIgnore.splice(idx, 1);
          }
        }

        // Do NOT start cooldown - ability resets to available
        this.cooldownTimer = 0;
        this.canActivate = true;
      }
    },

    /**
     * Check if the player should be immune to a logical obstacle.
     * Other mechanics should call this to check before applying effects.
     * @returns {boolean} Whether the player is immune to logical obstacles
     */
    isImmuneToLogic() {
      return this.isCommented;
    },
  };
}
