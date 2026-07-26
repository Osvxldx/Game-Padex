// Game constants
export const PLAYER_SPEED = 300; // pixels per second
export const PLAYER_JUMP_FORCE = 600; // initial jump velocity
export const GRAVITY = 1800;
export const COYOTE_TIME = 0.08; // 80ms in seconds
export const JUMP_BUFFER_TIME = 0.1; // 100ms in seconds
export const JUMP_CUT_MULTIPLIER = 0.4; // factor to cut vertical velocity on key release
export const DECELERATION_TIME = 0.1; // 100ms to stop
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

// Comment Code ability
export const COMMENT_DURATION = 0.5; // seconds
export const COMMENT_COOLDOWN = 2.0; // seconds
export const COMMENT_OPACITY = 0.5; // 50% opacity

// Death and respawn
export const RESPAWN_DELAY = 0.25; // <= 500ms requirement
export const RESPAWN_INVULNERABILITY = 1.0; // seconds
export const TEST_LEVEL_KILL_PLANE_Y = CANVAS_HEIGHT + 500;
