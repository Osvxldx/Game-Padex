import {
  COMMENT_DURATION,
  COMMENT_COOLDOWN,
  COMMENT_OPACITY,
} from "../constants.js";

export const LOGICAL_OBSTACLE_TAGS = Object.freeze([
  "gc-zone",
  "loop-zone",
  "warning-sign",
]);

const PLATFORM_TAG = "platform";
const INDICATOR_WIDTH = 30;
const OVERLAP_GAP = 1;
const TIMER_EPSILON = 1e-9;

function tickCountdown(timer, dt) {
  const remaining = timer - Math.max(0, dt);
  return remaining <= TIMER_EPSILON ? 0 : remaining;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function asBounds(rect) {
  if (
    !rect?.pos
    || !Number.isFinite(rect.pos.x)
    || !Number.isFinite(rect.pos.y)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
  ) {
    return null;
  }

  const x2 = rect.pos.x + rect.width;
  const y2 = rect.pos.y + rect.height;
  return {
    left: Math.min(rect.pos.x, x2),
    right: Math.max(rect.pos.x, x2),
    top: Math.min(rect.pos.y, y2),
    bottom: Math.max(rect.pos.y, y2),
  };
}

function overlaps(a, b) {
  return a.left < b.right
    && a.right > b.left
    && a.top < b.bottom
    && a.bottom > b.top;
}

function overlapsHorizontally(a, b) {
  return a.left < b.right && a.right > b.left;
}

function shiftedVertically(bounds, offset) {
  return {
    left: bounds.left,
    right: bounds.right,
    top: bounds.top + offset,
    bottom: bounds.bottom + offset,
  };
}

/**
 * Find the closest upward player position that clears every horizontally
 * relevant platform. Returns null when the player is not inside a platform or
 * when valid collider bounds are unavailable.
 */
export function findNearestSafeYAbovePlatforms(
  playerRect,
  platformRects,
  currentY,
  gap = OVERLAP_GAP,
) {
  const player = asBounds(playerRect);
  if (!player || !Number.isFinite(currentY)) {
    return null;
  }

  const platforms = platformRects
    .map(asBounds)
    .filter(Boolean);
  const overlapping = platforms.filter((platform) => overlaps(player, platform));

  if (overlapping.length === 0) {
    return null;
  }

  const horizontalPlatforms = platforms.filter(
    (platform) => overlapsHorizontally(player, platform),
  );
  const safeGap = Math.max(0, Number.isFinite(gap) ? gap : 0);

  // Every platform surface above the player's bottom is a deterministic
  // candidate. Nearest candidates are tested first, but a candidate is only
  // accepted when it clears all platforms, not merely the first overlap.
  const candidates = horizontalPlatforms
    .filter((platform) => platform.top < player.bottom)
    .map((platform) => ({
      y: currentY + platform.top - player.bottom - safeGap,
      top: platform.top,
      left: platform.left,
    }))
    .filter((candidate) => candidate.y <= currentY)
    .sort((a, b) => b.y - a.y || a.top - b.top || a.left - b.left);

  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate.y)) continue;
    seen.add(candidate.y);

    const shifted = shiftedVertically(player, candidate.y - currentY);
    if (!platforms.some((platform) => overlaps(shifted, platform))) {
      return candidate.y;
    }
  }

  return null;
}

/** Return whether a tag or tagged KAPLAY object is a logical obstacle. */
export function isLogicalObstacle(obstacleOrTag) {
  if (typeof obstacleOrTag === "string") {
    return LOGICAL_OBSTACLE_TAGS.includes(obstacleOrTag);
  }

  if (typeof obstacleOrTag?.is === "function") {
    return LOGICAL_OBSTACLE_TAGS.some((tag) => obstacleOrTag.is(tag));
  }

  if (Array.isArray(obstacleOrTag?.tags)) {
    return LOGICAL_OBSTACLE_TAGS.some((tag) => obstacleOrTag.tags.includes(tag));
  }

  return false;
}

/**
 * Custom KAPLAY component for the Comment Code ability.
 * area().collisionIgnore disables only platform contacts; body() remains
 * enabled and therefore continues to integrate gravity and vertical velocity.
 */
export function commentAbilityComponent(k) {
  const COMMENT_COLOR = k.rgb(150, 150, 150);

  return {
    id: "commentAbility",
    require: ["pos", "area", "body", "opacity", "color", "text"],

    isCommented: false,
    commentTimer: 0,
    cooldownTimer: 0,
    canActivate: true,

    _cooldownIndicator: null,
    _cooldownFill: null,
    _commentVisualSnapshot: null,
    _addedPlatformCollisionIgnore: false,

    add() {
      // A child follows the player and is destroyed with it on death or scene
      // changes. The fill is left-anchored so width maps directly to time left.
      this._cooldownIndicator = this.add([
        k.pos(0, 35),
        k.z(100),
        "comment-cooldown-indicator",
      ]);
      this._cooldownIndicator.hidden = true;

      this._cooldownIndicator.add([
        k.rect(INDICATOR_WIDTH + 2, 6),
        k.pos(-INDICATOR_WIDTH / 2 - 1, -1),
        k.anchor("left"),
        k.color(35, 40, 47),
        k.opacity(0.9),
      ]);

      this._cooldownFill = this._cooldownIndicator.add([
        k.rect(INDICATOR_WIDTH, 4),
        k.pos(-INDICATOR_WIDTH / 2, 0),
        k.anchor("left"),
        k.color(248, 81, 73),
        k.opacity(0.95),
      ]);
      this._updateCooldownIndicator();
    },

    destroy() {
      // Child destruction is owned by the KAPLAY scene graph. Drop references
      // here so no external HUD code can retain a stale game object.
      this._cooldownIndicator = null;
      this._cooldownFill = null;
      this._commentVisualSnapshot = null;
    },

    update() {
      const dt = Math.max(0, Number(k.dt()) || 0);

      // An activation receives the full 0.5 seconds: existing timers advance
      // before new input is accepted, and a newly-started cooldown is not
      // decremented during the expiration frame.
      if (this.isCommented) {
        this.commentTimer = tickCountdown(this.commentTimer, dt);
        if (this.commentTimer === 0) {
          this.finishComment();
        }
      } else if (this.cooldownTimer > 0) {
        this.cooldownTimer = tickCountdown(this.cooldownTimer, dt);
        if (this.cooldownTimer === 0) {
          this.canActivate = true;
          this.trigger?.("comment-ready");
        }
      }

      if (k.isKeyPressed("shift") || k.isKeyPressed("c")) {
        this.activateComment();
      }

      this._updateCooldownIndicator();
    },

    /** Return true only when a new activation was accepted. */
    activateComment() {
      if (!this.canActivateComment()) {
        return false;
      }

      this._commentVisualSnapshot = {
        opacity: this.opacity,
        color: this.color,
        text: this.text,
      };
      this.isCommented = true;
      this.commentTimer = COMMENT_DURATION;
      this.cooldownTimer = 0;
      this.canActivate = false;

      this.opacity = COMMENT_OPACITY;
      this.color = COMMENT_COLOR;
      this.text = "// ;";
      this._ignorePlatformCollisions();
      this._updateCooldownIndicator();
      this.trigger?.("comment-start");
      return true;
    },

    /** Return whether activation is currently legal. */
    canActivateComment() {
      return this.canActivate
        && !this.isCommented
        && this.cooldownTimer === 0;
    },

    /**
     * Finish a live comment normally, restore collisions safely, and begin the
     * two-second cooldown. Returns false if there was no active comment.
     */
    finishComment() {
      if (!this.isCommented) {
        return false;
      }

      this._leaveCommentState();
      this.cooldownTimer = COMMENT_COOLDOWN;
      this.canActivate = false;
      this._resolvePlatformOverlap();
      this._updateCooldownIndicator();
      this.trigger?.("comment-end", "expired");
      return true;
    },

    /**
     * Death/respawn hook: cancel immediately and make the ability available
     * without starting cooldown or moving the dying player.
     */
    cancelCommentWithoutCooldown() {
      const wasCommented = this.isCommented;
      this._leaveCommentState();
      this.commentTimer = 0;
      this.cooldownTimer = 0;
      this.canActivate = true;
      this._updateCooldownIndicator();
      if (wasCommented) {
        this.trigger?.("comment-end", "cancelled");
      }
    },

    /** Backward-compatible death cancellation name. */
    cancelComment() {
      this.cancelCommentWithoutCooldown();
    },

    /** Restore the complete default ability state for respawn/restart. */
    resetCommentAbility() {
      this.cancelCommentWithoutCooldown();
    },

    /** Current state for HUDs and integration code, without mutable internals. */
    getCommentAbilityState() {
      return {
        isCommented: this.isCommented,
        commentRemaining: this.commentTimer,
        cooldownRemaining: this.cooldownTimer,
        cooldownProgress: this.getCooldownProgress(),
        canActivate: this.canActivateComment(),
        indicatorVisible: Boolean(
          this._cooldownIndicator && !this._cooldownIndicator.hidden
        ),
        indicatorWidth: this._cooldownFill?.width ?? 0,
      };
    },

    getCooldownProgress() {
      return clamp01(this.cooldownTimer / COMMENT_COOLDOWN);
    },

    /**
     * Update the normal-state color without breaking an active commented
     * visual. Theme changes during pause are restored when Comment Code ends.
     */
    setCommentBaseColor(color) {
      if (this.isCommented && this._commentVisualSnapshot) {
        this._commentVisualSnapshot.color = color;
      } else {
        this.color = color;
      }
    },

    /** General state query used by timers such as Garbage Collector. */
    isImmuneToLogic() {
      return this.isCommented;
    },

    /** Stable collision-gate API for GC, loop, and warning mechanics. */
    shouldIgnoreLogicalObstacle(obstacleOrTag) {
      return this.isCommented && isLogicalObstacle(obstacleOrTag);
    },

    _leaveCommentState() {
      this.isCommented = false;
      this.commentTimer = 0;
      this._restorePlatformCollisions();

      if (this._commentVisualSnapshot) {
        this.opacity = this._commentVisualSnapshot.opacity;
        this.color = this._commentVisualSnapshot.color;
        this.text = this._commentVisualSnapshot.text;
        this._commentVisualSnapshot = null;
      }
    },

    _ignorePlatformCollisions() {
      if (!Array.isArray(this.collisionIgnore)) {
        this.collisionIgnore = [];
      }

      this._addedPlatformCollisionIgnore = !this.collisionIgnore.includes(
        PLATFORM_TAG,
      );
      if (this._addedPlatformCollisionIgnore) {
        this.collisionIgnore.push(PLATFORM_TAG);
      }
    },

    _restorePlatformCollisions() {
      if (this._addedPlatformCollisionIgnore) {
        const index = this.collisionIgnore?.indexOf(PLATFORM_TAG) ?? -1;
        if (index >= 0) {
          this.collisionIgnore.splice(index, 1);
        }
      }
      this._addedPlatformCollisionIgnore = false;
    },

    _resolvePlatformOverlap() {
      if (typeof this.worldArea !== "function") {
        return false;
      }

      const playerRect = this.worldArea().bbox();
      const platformRects = [];
      for (const platform of k.get(PLATFORM_TAG, { recursive: true })) {
        if (
          (typeof platform.exists === "function" && !platform.exists())
          || typeof platform.worldArea !== "function"
        ) {
          continue;
        }
        platformRects.push(platform.worldArea().bbox());
      }

      const safeY = findNearestSafeYAbovePlatforms(
        playerRect,
        platformRects,
        this.pos.y,
      );
      if (safeY === null) {
        return false;
      }

      this.pos.y = safeY;
      this.vel.y = 0;
      return true;
    },

    _updateCooldownIndicator() {
      if (!this._cooldownIndicator || !this._cooldownFill) {
        return;
      }

      const visible = !this.isCommented && this.cooldownTimer > 0;
      this._cooldownIndicator.hidden = !visible;
      this._cooldownFill.width = visible
        ? INDICATOR_WIDTH * this.getCooldownProgress()
        : 0;
    },
  };
}
