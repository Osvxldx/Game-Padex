import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import {
  calculateHorizontalVelocity,
  canUseJumpWindow,
  cutUpwardVelocity,
  horizontalBounds,
  playerComponent,
  resetPlayerMovementState,
  tickTimer,
} from "./player.js";
import {
  COYOTE_TIME,
  JUMP_BUFFER_TIME,
  PLAYER_JUMP_FORCE,
  PLAYER_SPEED,
} from "../constants.js";

function createControllerHarness() {
  const input = {
    down: new Set(),
    pressed: new Set(),
    released: new Set(),
  };
  let dt = 1 / 60;
  let grounded = false;
  const k = {
    dt: () => dt,
    isKeyDown: (key) => input.down.has(key),
    isKeyPressed: (key) => input.pressed.has(key),
    isKeyReleased: (key) => input.released.has(key),
  };
  const player = Object.assign(playerComponent(k), {
    pos: { x: 100, y: 100 },
    width: 24,
    vel: { x: 0, y: 0 },
    isGrounded: () => grounded,
    move(xVelocity, yVelocity) {
      this.pos.x += xVelocity * dt;
      this.pos.y += yVelocity * dt;
    },
    jump(force) {
      this.vel.y = -force;
    },
  });

  return {
    input,
    player,
    setDt: (value) => { dt = value; },
    setGrounded: (value) => { grounded = value; },
    update() {
      player.update();
      input.pressed.clear();
      input.released.clear();
    },
  };
}

test("horizontal input selects exactly 300 px/s in either direction", () => {
  assert.equal(calculateHorizontalVelocity(0, -1, 0.016), -PLAYER_SPEED);
  assert.equal(calculateHorizontalVelocity(0, 1, 0.016), PLAYER_SPEED);
});

test("horizontal velocity decelerates to zero within 100 ms", () => {
  const after50ms = calculateHorizontalVelocity(PLAYER_SPEED, 0, 0.05);
  const after100ms = calculateHorizontalVelocity(after50ms, 0, 0.05);

  assert.equal(after50ms, PLAYER_SPEED / 2);
  assert.equal(after100ms, 0);
  assert.equal(calculateHorizontalVelocity(-PLAYER_SPEED, 0, 0.1), 0);
});

test("timers and jump windows respect their boundaries", () => {
  assert.equal(tickTimer(COYOTE_TIME, COYOTE_TIME), 0);
  assert.equal(tickTimer(JUMP_BUFFER_TIME, JUMP_BUFFER_TIME + 1), 0);
  assert.equal(canUseJumpWindow(false, Number.EPSILON), true);
  assert.equal(canUseJumpWindow(false, 0), false);
  assert.equal(canUseJumpWindow(true, 0), true);
});

test("jump cut affects upward movement only", () => {
  assert.equal(cutUpwardVelocity(-PLAYER_JUMP_FORCE), -240);
  assert.equal(cutUpwardVelocity(100), 100);
  assert.equal(cutUpwardVelocity(0), 0);
});

test("horizontal bounds account for player width and oversized colliders", () => {
  assert.deepEqual(horizontalBounds(24, 1280), { min: 12, max: 1268 });
  assert.deepEqual(horizontalBounds(2000, 1280), { min: 640, max: 640 });
});

test("respawn reset clears movement, body velocity, and jump assistance", () => {
  const state = {
    velocityX: 300,
    coyoteTimer: 0.05,
    jumpBufferTimer: 0.08,
    controllerJumpActive: true,
    jumpConsumed: false,
    wasGrounded: true,
    vel: { x: 120, y: -600 },
  };

  resetPlayerMovementState(state);

  assert.deepEqual(state, {
    velocityX: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    controllerJumpActive: false,
    jumpConsumed: true,
    wasGrounded: false,
    vel: { x: 0, y: 0 },
  });
});

test("controller movement uses KAPLAY-style velocity integration", () => {
  const harness = createControllerHarness();
  harness.setDt(0.02);
  harness.input.down.add("d");

  harness.update();

  assert.equal(harness.player.velocityX, PLAYER_SPEED);
  assert.equal(harness.player.pos.x, 106);
});

test("coyote jump works after leaving ground and is consumed once", () => {
  const harness = createControllerHarness();
  harness.setDt(0.01);
  harness.setGrounded(true);
  harness.update();

  harness.setGrounded(false);
  harness.input.pressed.add("space");
  harness.input.down.add("space");
  harness.update();

  assert.equal(harness.player.vel.y, -PLAYER_JUMP_FORCE);
  assert.equal(harness.player.jumpConsumed, true);
  assert.equal(harness.player.coyoteTimer, 0);
});

test("an airborne press is buffered on landing but expires after 100 ms", () => {
  const buffered = createControllerHarness();
  buffered.setDt(0.01);
  buffered.input.pressed.add("space");
  buffered.update();
  buffered.setDt(0.08);
  buffered.setGrounded(true);
  buffered.update();
  assert.equal(buffered.player.vel.y, -PLAYER_JUMP_FORCE);

  const expired = createControllerHarness();
  expired.setDt(0.01);
  expired.input.pressed.add("space");
  expired.update();
  expired.setDt(0.11);
  expired.update();
  expired.setGrounded(true);
  expired.update();
  assert.equal(expired.player.vel.y, 0);
});

test("releasing jump cuts ascent while another held jump key prevents the cut", () => {
  const harness = createControllerHarness();
  harness.setGrounded(true);
  harness.input.pressed.add("space");
  harness.input.down.add("space");
  harness.update();

  harness.setGrounded(false);
  harness.input.down.delete("space");
  harness.input.released.add("space");
  harness.update();
  assert.equal(harness.player.vel.y, -240);

  harness.player.vel.y = -PLAYER_JUMP_FORCE;
  harness.input.down.add("w");
  harness.input.released.add("space");
  harness.update();
  assert.equal(harness.player.vel.y, -PLAYER_JUMP_FORCE);
});

test("playerController does not redefine members from installed KAPLAY BodyComp", () => {
  const require = createRequire(import.meta.url);
  const kaplayEntry = require.resolve("kaplay");
  const typeFile = new URL("./doc.d.ts", `file:///${kaplayEntry.replaceAll("\\", "/")}`);
  const declarations = readFileSync(typeFile, "utf8");
  const bodyBlock = declarations.match(
    /export interface BodyComp extends Comp \{([\s\S]*?)\n\}/,
  );

  assert.ok(bodyBlock, "BodyComp declaration must exist in installed KAPLAY");

  const bodyMembers = new Set(
    [...bodyBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)(?:\?)?(?:\(|:)/gm)]
      .map((match) => match[1]),
  );
  const controllerMembers = Object.keys(playerComponent({}));
  const overlaps = controllerMembers.filter((key) => bodyMembers.has(key));

  assert.deepEqual(overlaps, []);
});

test("controller level bounds use collider width instead of changing text width", () => {
  const harness = createControllerHarness();
  harness.player.width = 120;
  harness.player.pos.x = 15;
  harness.player.worldArea = () => ({
    bbox: () => ({ pos: { x: 5, y: 76 }, width: 20, height: 48 }),
  });
  harness.setDt(0.01);
  harness.input.down.add("left");

  harness.update();

  assert.equal(harness.player.pos.x, 12);
  assert.equal(harness.player.velocityX, -PLAYER_SPEED);
});