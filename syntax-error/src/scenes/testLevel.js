import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  TEST_LEVEL_KILL_PLANE_Y,
} from "../constants.js";
import { commentAbilityComponent } from "../components/commentAbility.js";
import { playerComponent } from "../components/player.js";
import {
  attachDeathRespawnSystem,
} from "../systems/deathRespawn.js";
import {
  createCheckpointState,
  createWarningResetContract,
} from "../systems/gameplayState.js";
import { createPauseRuntime } from "./pauseMenu.js";

export const TEST_LEVEL_SCENE = "testLevel";

const PLAYER_COLLIDER_WIDTH = 20;
const PLAYER_COLLIDER_HEIGHT = 48;
const INITIAL_SPAWN = Object.freeze({ x: 200, y: CANVAS_HEIGHT - 64 });

const THEME_PALETTES = Object.freeze({
  terminal: Object.freeze({
    background: [13, 17, 23], platform: [48, 54, 61], player: [88, 166, 255],
    danger: [248, 81, 73], ui: [201, 209, 217],
  }),
  dark: Object.freeze({
    background: [30, 30, 30], platform: [45, 45, 45], player: [86, 156, 214],
    danger: [244, 71, 71], ui: [212, 212, 212],
  }),
  light: Object.freeze({
    background: [255, 255, 255], platform: [224, 224, 224], player: [0, 0, 255],
    danger: [205, 49, 49], ui: [51, 51, 51],
  }),
  blueprint: Object.freeze({
    background: [26, 35, 126], platform: [57, 73, 171], player: [255, 255, 255],
    danger: [255, 82, 82], ui: [187, 222, 251],
  }),
  bsod: Object.freeze({
    background: [0, 0, 170], platform: [0, 0, 221], player: [255, 255, 255],
    danger: [255, 0, 0], ui: [170, 170, 170],
  }),
});

let nextSessionId = 1;

function addPlatform(k, gameplayRoot, x, y, width, height) {
  return gameplayRoot.add([
    k.rect(width, height),
    k.pos(x, y),
    k.area(),
    k.body({ isStatic: true }),
    k.color(48, 54, 61),
    k.anchor("topleft"),
    "platform",
  ]);
}

function addLogicalObstacle(k, gameplayRoot, { tag, label, x, color }) {
  const obstacle = gameplayRoot.add([
    k.rect(80, 60),
    k.pos(x, CANVAS_HEIGHT - 100),
    k.area(),
    k.anchor("topleft"),
    k.color(...color),
    k.opacity(0.6),
    tag,
    "logical-obstacle",
  ]);
  const text = gameplayRoot.add([
    k.text(label, { size: 14 }),
    k.pos(x + 40, CANVAS_HEIGHT - 110),
    k.anchor("center"),
    k.color(...color),
    "gameplay-ui",
  ]);
  return { obstacle, text };
}

function installRuntimeSmokeApi({
  k,
  player,
  gameplayRoot,
  pauseRuntime,
  deathSystem,
  checkpointState,
  settingsContract,
  lethalObstacle,
  sessionId,
  getWarningCount,
  setWarningCount,
  getTheme,
}) {
  if (typeof window === "undefined") return () => {};
  const params = new URLSearchParams(window.location.search);
  if (!params.has("smoke")) return () => {};

  const readState = () => {
    const bounds = player.worldArea().bbox();
    const ability = player.getCommentAbilityState();
    return {
      ...ability,
      scene: TEST_LEVEL_SCENE,
      sessionId,
      exists: player.exists(),
      x: player.pos.x,
      y: player.pos.y,
      velocityX: player.velocityX,
      velX: player.vel.x,
      velY: player.vel.y,
      gravityScale: player.gravityScale,
      text: player.text,
      opacity: player.opacity,
      color: {
        r: player.color.r,
        g: player.color.g,
        b: player.color.b,
      },
      collisionIgnore: [...player.collisionIgnore],
      collider: {
        x: bounds.pos.x,
        y: bounds.pos.y,
        width: bounds.width,
        height: bounds.height,
      },
      overlappingPlatforms: k.get("platform", { recursive: true }).filter((platform) => {
        const platformBounds = platform.worldArea().bbox();
        return bounds.pos.x < platformBounds.pos.x + platformBounds.width
          && bounds.pos.x + bounds.width > platformBounds.pos.x
          && bounds.pos.y < platformBounds.pos.y + platformBounds.height
          && bounds.pos.y + bounds.height > platformBounds.pos.y;
      }).length,
      pause: pauseRuntime.getState(),
      death: deathSystem.getState(),
      checkpoint: checkpointState.getState(),
      warnings: getWarningCount(),
      settings: settingsContract?.readValues?.(),
      theme: getTheme(),
      gameplayRootPaused: gameplayRoot.paused,
      lethalObstacle: { x: lethalObstacle.pos.x, y: lethalObstacle.pos.y },
      killPlaneY: TEST_LEVEL_KILL_PLANE_Y,
    };
  };

  const api = {
    getState: readState,
    activate: () => player.activateComment(),
    finish: () => player.finishComment(),
    cancelForDeath: () => player.cancelCommentWithoutCooldown(),
    reset: () => player.resetCommentAbility(),
    openPause: () => pauseRuntime.openPause(),
    resume: () => pauseRuntime.resume(),
    openPauseSettings: () => pauseRuntime.openSettings(),
    closePauseSettings: () => pauseRuntime.closeSettings(),
    restartLevel: () => pauseRuntime.restart(),
    returnToMenu: () => pauseRuntime.returnToMenu(),
    requestDeath: (source) => deathSystem.requestDeath(source),
    setCheckpoint: (point) => checkpointState.activateCheckpoint(point),
    setWarnings: (count) => setWarningCount(count),
    setPlayerState({ x, y, velX = 0, velY = 0 }) {
      if (Number.isFinite(x)) player.pos.x = x;
      if (Number.isFinite(y)) player.pos.y = y;
      player.velocityX = velX;
      player.vel.x = velX;
      player.vel.y = velY;
    },
    moveToLethal() {
      player.resetPlayerMovement();
      player.pos.x = lethalObstacle.pos.x + 30;
      player.pos.y = CANVAS_HEIGHT - 64;
    },
    crossKillPlane() {
      player.resetPlayerMovement();
      player.pos.y = TEST_LEVEL_KILL_PLANE_Y + 1;
    },
    destroyPlayer() {
      const indicator = player.get("comment-cooldown-indicator")[0] ?? null;
      player.destroy();
      return {
        playerExists: player.exists(),
        indicatorExists: indicator?.exists() ?? false,
      };
    },
  };

  globalThis.__syntaxErrorSmoke = api;
  return () => {
    if (globalThis.__syntaxErrorSmoke === api) {
      delete globalThis.__syntaxErrorSmoke;
    }
  };
}

/** Register the temporary gameplay scene without putting gameplay in main.js. */
export function registerTestLevelScene(k, {
  sceneName = TEST_LEVEL_SCENE,
  settingsContract,
  audioManager,
  onMenu,
} = {}) {
  k.scene(sceneName, () => {
    audioManager?.crossfadeTo?.(1);
    const sessionId = nextSessionId;
    nextSessionId += 1;

    // Every simulation object is a descendant. GameObj.paused recursively
    // freezes physics and component updates while leaving rendering intact.
    const gameplayRoot = k.add([
      k.pos(0, 0),
      "gameplay-root",
    ]);

    addPlatform(k, gameplayRoot, 0, CANVAS_HEIGHT - 40, CANVAS_WIDTH, 40);
    addPlatform(k, gameplayRoot, 100, CANVAS_HEIGHT - 180, 200, 20);
    addPlatform(k, gameplayRoot, 450, CANVAS_HEIGHT - 320, 250, 20);
    addPlatform(k, gameplayRoot, 900, CANVAS_HEIGHT - 200, 200, 20);
    addPlatform(k, gameplayRoot, 1050, CANVAS_HEIGHT - 400, 180, 20);
    addPlatform(k, gameplayRoot, 300, CANVAS_HEIGHT - 450, 120, 20);

    const player = gameplayRoot.add([
      k.text(";", { size: 48 }),
      k.pos(INITIAL_SPAWN.x, INITIAL_SPAWN.y),
      k.area({
        shape: new k.Rect(
          k.vec2(0),
          PLAYER_COLLIDER_WIDTH,
          PLAYER_COLLIDER_HEIGHT,
        ),
      }),
      k.body(),
      k.anchor("center"),
      k.color(88, 166, 255),
      k.opacity(1),
      playerComponent(k),
      commentAbilityComponent(k),
      "player",
    ]);
    player.on("player-jump", () => audioManager?.playSfx?.("jump"));
    player.on("comment-start", () => audioManager?.playSfx?.("ability"));
    player.on("player-death", () => audioManager?.playSfx?.("death"));

    const instruction = gameplayRoot.add([
      k.text(
        "A/D or Arrows: Move | Space/W/Up: Jump | Shift/C: Comment | Esc: Pause",
        { size: 16 },
      ),
      k.pos(CANVAS_WIDTH / 2, 30),
      k.anchor("center"),
      k.color(201, 209, 217),
      "gameplay-ui",
    ]);

    const logicalObstacles = [
      { tag: "gc-zone", label: "GC", x: 500, color: [248, 81, 73], sfx: "gcAlert" },
      { tag: "loop-zone", label: "LOOP", x: 700, color: [188, 63, 188], sfx: "loopTrap" },
      { tag: "warning-sign", label: "WARN", x: 850, color: [227, 179, 65], sfx: "warning" },
    ];
    for (const obstacle of logicalObstacles) {
      addLogicalObstacle(k, gameplayRoot, obstacle);
      player.onCollide(obstacle.tag, (object) => {
        if (player.shouldIgnoreLogicalObstacle(object)) {
          k.debug.log(`${obstacle.label} ignored (commented)`);
        } else {
          audioManager?.playSfx?.(obstacle.sfx);
          k.debug.log(`${obstacle.label} effect applied`);
        }
      });
    }

    const lethalObstacle = gameplayRoot.add([
      k.rect(60, 40),
      k.pos(1120, CANVAS_HEIGHT - 80),
      k.area(),
      k.anchor("topleft"),
      k.color(248, 81, 73),
      "lethal",
      "danger-visual",
    ]);
    gameplayRoot.add([
      k.text("LETHAL", { size: 13 }),
      k.pos(lethalObstacle.pos.x + 30, lethalObstacle.pos.y - 12),
      k.anchor("center"),
      k.color(248, 81, 73),
      "danger-visual",
    ]);

    const checkpointState = createCheckpointState(INITIAL_SPAWN);
    let warningCount = 0;
    const setWarningCount = (count) => {
      warningCount = Number.isFinite(Number(count))
        ? Math.max(0, Math.trunc(Number(count)))
        : warningCount;
      return warningCount;
    };
    const warningResetContract = createWarningResetContract({
      getWarningCount: () => warningCount,
      resetWarnings: () => { warningCount = 0; },
    });

    const deathSystem = attachDeathRespawnSystem(k, {
      gameplayRoot,
      player,
      checkpointState,
      warningResetContract,
      killPlaneY: TEST_LEVEL_KILL_PLANE_Y,
    });

    let currentTheme = settingsContract?.readValues?.().theme ?? "terminal";
    const applyTheme = (themeId) => {
      const palette = THEME_PALETTES[themeId] ?? THEME_PALETTES.terminal;
      currentTheme = THEME_PALETTES[themeId] ? themeId : "terminal";
      k.setBackground(...palette.background);
      for (const platform of gameplayRoot.get("platform", { recursive: true })) {
        platform.color = k.rgb(...palette.platform);
      }
      player.setCommentBaseColor(k.rgb(...palette.player));
      for (const danger of gameplayRoot.get("danger-visual", { recursive: true })) {
        danger.color = k.rgb(...palette.danger);
      }
      instruction.color = k.rgb(...palette.ui);
      return currentTheme;
    };
    applyTheme(currentTheme);

    const pauseRuntime = createPauseRuntime(k, {
      gameplayRoot,
      settingsContract,
      onRestart: () => k.go(sceneName),
      onMenu,
      onThemeChange: applyTheme,
    });

    const uninstallSmokeApi = installRuntimeSmokeApi({
      k,
      player,
      gameplayRoot,
      pauseRuntime,
      deathSystem,
      checkpointState,
      settingsContract,
      lethalObstacle,
      sessionId,
      getWarningCount: () => warningCount,
      setWarningCount,
      getTheme: () => currentTheme,
    });
    gameplayRoot.add([{
      id: "gameplay-smoke-cleanup",
      destroy() {
        uninstallSmokeApi();
      },
    }]);
  });

  return sceneName;
}
