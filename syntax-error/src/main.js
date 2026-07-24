import kaplay from "kaplay";
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRAVITY } from "./constants.js";
import { playerComponent } from "./components/player.js";
import { commentAbilityComponent } from "./components/commentAbility.js";

const k = kaplay({
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  background: [13, 17, 23], // Dark terminal background
  global: false,
});

k.setGravity(GRAVITY);

// Test scene to verify player movement
k.scene("testLevel", () => {
  // Floor platform spanning the bottom
  k.add([
    k.rect(CANVAS_WIDTH, 40),
    k.pos(0, CANVAS_HEIGHT - 40),
    k.area(),
    k.body({ isStatic: true }),
    k.color(48, 54, 61),
    k.anchor("topleft"),
    "platform",
  ]);

  // Left platform (mid height)
  k.add([
    k.rect(200, 20),
    k.pos(100, CANVAS_HEIGHT - 180),
    k.area(),
    k.body({ isStatic: true }),
    k.color(48, 54, 61),
    k.anchor("topleft"),
    "platform",
  ]);

  // Center platform (higher)
  k.add([
    k.rect(250, 20),
    k.pos(450, CANVAS_HEIGHT - 320),
    k.area(),
    k.body({ isStatic: true }),
    k.color(48, 54, 61),
    k.anchor("topleft"),
    "platform",
  ]);

  // Right platform (mid height)
  k.add([
    k.rect(200, 20),
    k.pos(900, CANVAS_HEIGHT - 200),
    k.area(),
    k.body({ isStatic: true }),
    k.color(48, 54, 61),
    k.anchor("topleft"),
    "platform",
  ]);

  // High right platform
  k.add([
    k.rect(180, 20),
    k.pos(1050, CANVAS_HEIGHT - 400),
    k.area(),
    k.body({ isStatic: true }),
    k.color(48, 54, 61),
    k.anchor("topleft"),
    "platform",
  ]);

  // Small floating platform (center-left)
  k.add([
    k.rect(120, 20),
    k.pos(300, CANVAS_HEIGHT - 450),
    k.area(),
    k.body({ isStatic: true }),
    k.color(48, 54, 61),
    k.anchor("topleft"),
    "platform",
  ]);

  // Player character - the ";" (semicolon)
  const player = k.add([
    k.text(";", { size: 48 }),
    k.pos(200, CANVAS_HEIGHT - 100),
    k.area(),
    k.body(),
    k.anchor("center"),
    k.color(88, 166, 255),
    playerComponent(k),
    commentAbilityComponent(k),
    "player",
  ]);

  // Instructions text
  k.add([
    k.text("A/D or Arrows: Move | Space/W/Up: Jump | Shift/C: Comment Code", { size: 16 }),
    k.pos(CANVAS_WIDTH / 2, 30),
    k.anchor("center"),
    k.color(201, 209, 217),
  ]);

  // --- Logical Obstacle Test Objects ---

  // GC Zone (red-orange area)
  k.add([
    k.rect(80, 60),
    k.pos(500, CANVAS_HEIGHT - 100),
    k.area(),
    k.anchor("topleft"),
    k.color(248, 81, 73),
    k.opacity(0.6),
    "gc-zone",
  ]);
  // Label for GC zone
  k.add([
    k.text("GC", { size: 14 }),
    k.pos(540, CANVAS_HEIGHT - 110),
    k.anchor("center"),
    k.color(248, 81, 73),
  ]);

  // Loop Zone (purple area)
  k.add([
    k.rect(80, 60),
    k.pos(700, CANVAS_HEIGHT - 100),
    k.area(),
    k.anchor("topleft"),
    k.color(188, 63, 188),
    k.opacity(0.6),
    "loop-zone",
  ]);
  // Label for Loop zone
  k.add([
    k.text("LOOP", { size: 14 }),
    k.pos(740, CANVAS_HEIGHT - 110),
    k.anchor("center"),
    k.color(188, 63, 188),
  ]);

  // Warning Sign (yellow area)
  k.add([
    k.rect(80, 60),
    k.pos(850, CANVAS_HEIGHT - 100),
    k.area(),
    k.anchor("topleft"),
    k.color(227, 179, 65),
    k.opacity(0.6),
    "warning-sign",
  ]);
  // Label for Warning zone
  k.add([
    k.text("WARN", { size: 14 }),
    k.pos(890, CANVAS_HEIGHT - 110),
    k.anchor("center"),
    k.color(227, 179, 65),
  ]);

  // --- Collision handlers for logical obstacles (test behavior) ---
  player.onCollide("gc-zone", () => {
    if (!player.isImmuneToLogic()) {
      // In full game, this would kill the player
      k.debug.log("GC collected you!");
    } else {
      k.debug.log("GC ignored (commented)");
    }
  });

  player.onCollide("loop-zone", () => {
    if (!player.isImmuneToLogic()) {
      k.debug.log("Trapped in loop!");
    } else {
      k.debug.log("Loop ignored (commented)");
    }
  });

  player.onCollide("warning-sign", () => {
    if (!player.isImmuneToLogic()) {
      k.debug.log("Warning added!");
    } else {
      k.debug.log("Warning ignored (commented)");
    }
  });
});

k.go("testLevel");
