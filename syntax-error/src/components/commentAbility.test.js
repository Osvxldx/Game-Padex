import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import {
  LOGICAL_OBSTACLE_TAGS,
  commentAbilityComponent,
  findNearestSafeYAbovePlatforms,
  isLogicalObstacle,
} from "./commentAbility.js";
import {
  COMMENT_COOLDOWN,
  COMMENT_DURATION,
  COMMENT_OPACITY,
} from "../constants.js";

function rect(x, y, width, height) {
  return { pos: { x, y }, width, height };
}

function strictlyOverlaps(a, b) {
  return a.pos.x < b.pos.x + b.width
    && a.pos.x + a.width > b.pos.x
    && a.pos.y < b.pos.y + b.height
    && a.pos.y + a.height > b.pos.y;
}

function makeGameObject(components = []) {
  const children = [];
  const object = {
    children,
    hidden: false,
    _exists: true,
    add(childComponents) {
      const child = makeGameObject(childComponents);
      children.push(child);
      return child;
    },
    destroy() {
      this._exists = false;
      for (const child of children) child.destroy();
    },
    exists() {
      return this._exists;
    },
  };

  for (const component of components) {
    if (component && typeof component === "object") {
      Object.assign(object, component);
    }
  }
  return object;
}

function createAbilityHarness(platformRects = []) {
  let dt = 0;
  const pressed = new Set();
  const events = [];
  const platforms = platformRects.map((bounds) => ({
    exists: () => true,
    worldArea: () => ({ bbox: () => bounds }),
  }));
  const k = {
    dt: () => dt,
    isKeyPressed: (key) => pressed.has(key),
    rgb: (r, g, b) => ({ r, g, b }),
    rect: (width, height) => ({ width, height }),
    pos: (x, y) => ({ pos: { x, y } }),
    anchor: (anchor) => ({ anchor }),
    color: (r, g, b) => ({ color: { r, g, b } }),
    opacity: (opacity) => ({ opacity }),
    z: (z) => ({ z }),
    get: (tag) => tag === "platform" ? platforms : [],
  };

  const component = commentAbilityComponent(k);
  const {
    add: onAdd,
    destroy: onDestroy,
    ...componentApi
  } = component;
  const children = [];
  const player = {
    pos: { x: 100, y: 120 },
    vel: { x: 0, y: 0 },
    gravityScale: 1,
    opacity: 1,
    color: { r: 88, g: 166, b: 255 },
    text: ";",
    collisionIgnore: [],
    add(components) {
      const child = makeGameObject(components);
      children.push(child);
      return child;
    },
    trigger(name, ...args) {
      events.push([name, ...args]);
    },
    worldArea() {
      return {
        bbox: () => rect(this.pos.x - 10, this.pos.y - 24, 20, 48),
      };
    },
  };
  Object.assign(player, componentApi);
  onAdd.call(player);

  return {
    children,
    events,
    player,
    press(key) {
      pressed.add(key);
    },
    setDt(value) {
      dt = value;
    },
    update() {
      player.update();
      pressed.clear();
    },
    destroy() {
      const indicator = children[0];
      onDestroy.call(player);
      for (const child of children) child.destroy();
      return indicator;
    },
  };
}

test("Shift and C activate a full 0.5 second commented state", () => {
  for (const key of ["shift", "c"]) {
    const harness = createAbilityHarness();
    harness.press(key);
    harness.setDt(0.25);
    harness.update();

    assert.equal(harness.player.isCommented, true);
    assert.equal(harness.player.commentTimer, COMMENT_DURATION);
    assert.equal(harness.player.opacity, COMMENT_OPACITY);
    assert.deepEqual(harness.player.color, { r: 150, g: 150, b: 150 });
    assert.equal(harness.player.text, "// ;");
    assert.equal(harness.player.collisionIgnore.includes("platform"), true);
    assert.equal(harness.player.gravityScale, 1);
  }
});

test("expiration restores visuals and collisions, then enforces exactly two seconds of cooldown", () => {
  const harness = createAbilityHarness();
  const originalColor = harness.player.color;

  assert.equal(harness.player.activateComment(), true);
  harness.setDt(COMMENT_DURATION - 0.01);
  harness.update();
  assert.equal(harness.player.isCommented, true);

  harness.setDt(0.02);
  harness.update();
  assert.equal(harness.player.isCommented, false);
  assert.equal(harness.player.cooldownTimer, COMMENT_COOLDOWN);
  assert.equal(harness.player.opacity, 1);
  assert.equal(harness.player.color, originalColor);
  assert.equal(harness.player.text, ";");
  assert.equal(harness.player.collisionIgnore.includes("platform"), false);
  assert.equal(harness.player.activateComment(), false);

  harness.setDt(COMMENT_COOLDOWN - 0.01);
  harness.update();
  assert.equal(harness.player.canActivateComment(), false);
  harness.setDt(0.01);
  harness.update();
  assert.equal(harness.player.canActivateComment(), true);
});

test("death cancellation and reset never start cooldown", () => {
  const harness = createAbilityHarness();
  harness.player.activateComment();
  harness.player.cancelCommentWithoutCooldown();

  assert.deepEqual(harness.player.getCommentAbilityState(), {
    isCommented: false,
    commentRemaining: 0,
    cooldownRemaining: 0,
    cooldownProgress: 0,
    canActivate: true,
    indicatorVisible: false,
    indicatorWidth: 0,
  });
  assert.equal(harness.player.text, ";");
  assert.equal(harness.player.collisionIgnore.includes("platform"), false);

  harness.player.activateComment();
  harness.player.finishComment();
  harness.player.resetCommentAbility();
  assert.equal(harness.player.cooldownTimer, 0);
  assert.equal(harness.player.canActivateComment(), true);
});

test("theme changes during Comment Code preserve grayscale and update the restored color", () => {
  const harness = createAbilityHarness();
  harness.player.activateComment();
  harness.player.setCommentBaseColor({ r: 1, g: 2, b: 3 });

  assert.deepEqual(harness.player.color, { r: 150, g: 150, b: 150 });
  harness.player.finishComment();
  assert.deepEqual(harness.player.color, { r: 1, g: 2, b: 3 });
});

test("platform collision restoration preserves ignores owned by other systems", () => {
  const harness = createAbilityHarness();
  harness.player.collisionIgnore.push("platform", "other-tag");

  harness.player.activateComment();
  harness.player.finishComment();

  assert.deepEqual(harness.player.collisionIgnore, ["platform", "other-tag"]);
});

test("logical obstacle gate recognizes only the three stable mechanic tags", () => {
  const harness = createAbilityHarness();
  harness.player.activateComment();

  assert.deepEqual(LOGICAL_OBSTACLE_TAGS, [
    "gc-zone",
    "loop-zone",
    "warning-sign",
  ]);
  for (const tag of LOGICAL_OBSTACLE_TAGS) {
    assert.equal(isLogicalObstacle(tag), true);
    assert.equal(harness.player.shouldIgnoreLogicalObstacle(tag), true);
    assert.equal(
      harness.player.shouldIgnoreLogicalObstacle({ is: (candidate) => candidate === tag }),
      true,
    );
  }
  assert.equal(isLogicalObstacle("platform"), false);
  assert.equal(harness.player.shouldIgnoreLogicalObstacle("platform"), false);

  harness.player.cancelCommentWithoutCooldown();
  assert.equal(harness.player.shouldIgnoreLogicalObstacle("gc-zone"), false);
});

test("safe overlap resolution considers every platform and chooses a deterministic clear surface", () => {
  const playerRect = rect(90, 96, 20, 48);
  const overlappingLowerPlatform = rect(80, 120, 80, 40);
  const platformBlockingNearestSurface = rect(80, 80, 80, 20);

  assert.equal(
    findNearestSafeYAbovePlatforms(
      playerRect,
      [overlappingLowerPlatform, platformBlockingNearestSurface],
      120,
    ),
    55,
  );
  assert.equal(
    findNearestSafeYAbovePlatforms(playerRect, [rect(80, 200, 80, 20)], 120),
    null,
  );

  const harness = createAbilityHarness([
    overlappingLowerPlatform,
    platformBlockingNearestSurface,
  ]);
  harness.player.activateComment();
  harness.player.finishComment();

  const resolved = harness.player.worldArea().bbox();
  assert.equal(harness.player.pos.y, 55);
  assert.equal(harness.player.vel.y, 0);
  assert.equal(strictlyOverlaps(resolved, overlappingLowerPlatform), false);
  assert.equal(strictlyOverlaps(resolved, platformBlockingNearestSurface), false);
});

test("cooldown indicator is a player child, shrinks with time, and dies with its parent", () => {
  const harness = createAbilityHarness();
  const indicator = harness.children[0];

  assert.ok(indicator);
  assert.equal(indicator.hidden, true);
  harness.player.activateComment();
  harness.player.finishComment();
  assert.equal(indicator.hidden, false);
  assert.equal(harness.player.getCommentAbilityState().indicatorWidth, 30);

  harness.setDt(1);
  harness.update();
  assert.equal(harness.player.getCommentAbilityState().indicatorWidth, 15);

  const destroyedIndicator = harness.destroy();
  assert.equal(destroyedIndicator.exists(), false);
  assert.equal(harness.player._cooldownIndicator, null);
});

test("commentAbility public members do not redefine KAPLAY area/body object APIs", () => {
  const require = createRequire(import.meta.url);
  const kaplayEntry = require.resolve("kaplay");
  const typeFile = new URL("./doc.d.ts", `file:///${kaplayEntry.replaceAll("\\", "/")}`);
  const declarations = readFileSync(typeFile, "utf8");
  const lifecycleMembers = new Set([
    "id",
    "require",
    "add",
    "fixedUpdate",
    "update",
    "draw",
    "destroy",
    "inspect",
    "drawInspect",
  ]);
  const installedMembers = new Set();

  for (const interfaceName of ["AreaComp", "BodyComp", "GameObjRaw"]) {
    const block = declarations.match(
      new RegExp(`(?:export )?interface ${interfaceName}(?: extends [^{]+)? \\{([\\s\\S]*?)\\n\\}`),
    );
    assert.ok(block, `${interfaceName} declaration must exist`);
    for (const match of block[1].matchAll(/^\s*([A-Za-z_$][\w$]*)(?:\?)?(?:\(|:)/gm)) {
      installedMembers.add(match[1]);
    }
  }

  const component = commentAbilityComponent({ rgb: () => ({}) });
  const overlaps = Object.keys(component).filter(
    (key) => !lifecycleMembers.has(key) && installedMembers.has(key),
  );

  assert.deepEqual(overlaps, []);
});
