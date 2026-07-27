import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import { commentAbilityComponent } from "../components/commentAbility.js";
import { playerComponent } from "../components/player.js";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  COMMENT_COOLDOWN,
  COMMENT_DURATION,
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
} from "../constants.js";
import { resetPlayerAfterRespawn } from "./deathRespawn.js";
import {
  createCheckpointState,
  createWarningResetContract,
} from "./gameplayState.js";

const finiteDouble = (min, max) => fc.double({
  min,
  max,
  noNaN: true,
  noDefaultInfinity: true,
});

const rangedDouble = (min, max) => fc.oneof(
  fc.constant(min),
  fc.constant(max),
  finiteDouble(min, max),
);

const levelPointArbitrary = fc.record({
  x: rangedDouble(0, CANVAS_WIDTH),
  y: rangedDouble(0, CANVAS_HEIGHT),
});

const signedVelocityArbitrary = fc.oneof(
  finiteDouble(-2000, -0.001),
  fc.constant(0),
  finiteDouble(0.001, 2000),
);

const activeTimerArbitrary = (maximum) => fc.oneof(
  fc.constant(Number.EPSILON),
  fc.constant(maximum),
  finiteDouble(Number.EPSILON, maximum),
);

const movementAssistanceArbitrary = fc.record({
  velocityX: signedVelocityArbitrary,
  coyoteTimer: rangedDouble(0, COYOTE_TIME),
  jumpBufferTimer: rangedDouble(0, JUMP_BUFFER_TIME),
  controllerJumpActive: fc.boolean(),
  jumpConsumed: fc.boolean(),
  wasGrounded: fc.boolean(),
});

const commentStateArbitrary = fc.oneof(
  fc.constant({ kind: "available", timer: 0 }),
  activeTimerArbitrary(COMMENT_DURATION).map((timer) => ({
    kind: "commented",
    timer,
  })),
  activeTimerArbitrary(COMMENT_COOLDOWN).map((timer) => ({
    kind: "cooldown",
    timer,
  })),
);

const playerBeforeDeathArbitrary = fc.record({
  position: levelPointArbitrary,
  bodyVelocity: fc.record({
    x: signedVelocityArbitrary,
    y: signedVelocityArbitrary,
  }),
  movement: movementAssistanceArbitrary,
  comment: commentStateArbitrary,
  warningCount: fc.oneof(
    fc.constant(0),
    fc.constant(20),
    fc.integer({ min: 0, max: 20 }),
  ),
  initialSpawn: levelPointArbitrary,
  checkpoint: levelPointArbitrary,
});

function createPlayerFromState(state) {
  const baseColor = { r: 88, g: 166, b: 255 };
  const player = Object.assign(
    {
      pos: { ...state.position },
      vel: { ...state.bodyVelocity },
      opacity: 1,
      color: baseColor,
      text: ";",
      collisionIgnore: [],
      paused: true,
    },
    playerComponent({}),
    commentAbilityComponent({
      rgb: (r, g, b) => ({ r, g, b }),
    }),
  );

  Object.assign(player, state.movement);

  if (state.comment.kind === "commented") {
    player.isCommented = true;
    player.commentTimer = state.comment.timer;
    player.cooldownTimer = 0;
    player.canActivate = false;
    player.opacity = 0.5;
    player.color = { r: 150, g: 150, b: 150 };
    player.text = "// ;";
    player.collisionIgnore = ["platform"];
    player._addedPlatformCollisionIgnore = true;
    player._commentVisualSnapshot = {
      opacity: 1,
      color: baseColor,
      text: ";",
    };
  } else if (state.comment.kind === "cooldown") {
    player.isCommented = false;
    player.commentTimer = 0;
    player.cooldownTimer = state.comment.timer;
    player.canActivate = false;
  }

  return player;
}

// Feature: syntax-error, Property 7: Reset de Estado al Reaparecer
// **Validates: Requirements 4.1, 4.3, 3.9**
test("Property 7: respawn resets every valid player state at the last checkpoint", () => {
  fc.assert(
    fc.property(playerBeforeDeathArbitrary, (state) => {
      const checkpoints = createCheckpointState(state.initialSpawn);
      checkpoints.activateCheckpoint(state.checkpoint);

      let warningCount = state.warningCount;
      const warningResetContract = createWarningResetContract({
        getWarningCount: () => warningCount,
        resetWarnings: () => { warningCount = 0; },
      });
      const player = createPlayerFromState(state);

      resetPlayerAfterRespawn({
        player,
        checkpoint: checkpoints.getLastCheckpoint(),
        warningResetContract,
      });

      assert.equal(player.pos.x, state.checkpoint.x);
      assert.equal(player.pos.y, state.checkpoint.y);
      assert.deepEqual(player.vel, { x: 0, y: 0 });
      assert.deepEqual(
        {
          velocityX: player.velocityX,
          coyoteTimer: player.coyoteTimer,
          jumpBufferTimer: player.jumpBufferTimer,
          controllerJumpActive: player.controllerJumpActive,
          jumpConsumed: player.jumpConsumed,
          wasGrounded: player.wasGrounded,
        },
        {
          velocityX: 0,
          coyoteTimer: 0,
          jumpBufferTimer: 0,
          controllerJumpActive: false,
          jumpConsumed: true,
          wasGrounded: false,
        },
      );
      assert.deepEqual(player.getCommentAbilityState(), {
        isCommented: false,
        commentRemaining: 0,
        cooldownRemaining: 0,
        cooldownProgress: 0,
        canActivate: true,
        indicatorVisible: false,
        indicatorWidth: 0,
      });
      assert.equal(warningCount, 0);
      assert.equal(warningResetContract.getCount(), 0);
      assert.equal(player.paused, false);
    }),
    { numRuns: 200 },
  );
});
