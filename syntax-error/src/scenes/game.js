import { commentAbilityComponent } from "../components/commentAbility.js";
import { playerComponent } from "../components/player.js";
import { LEVEL_1 } from "../levels/level1.js";
import { LEVEL_2 } from "../levels/level2.js";
import { LEVEL_3 } from "../levels/level3.js";
import { LEVEL_4 } from "../levels/level4.js";
import { LEVEL_5 } from "../levels/level5.js";
import { attachLevelMechanics } from "../mechanics/mechanicRegistry.js";
import {
  LevelValidationError,
  instantiateParsedLevel,
  parseLevelData,
} from "../levels/levelLoader.js";
import {
  TILE_KINDS,
  getTilePalette,
} from "../levels/tileConfig.js";
import { attachInfiniteLoopSystem } from "../mechanics/infiniteLoop.js";
import { attachGarbageCollectorSystem } from "../mechanics/garbageCollector.js";
import { attachDeathRespawnSystem } from "../systems/deathRespawn.js";
import {
  createCheckpointState,
  createWarningResetContract,
} from "../systems/gameplayState.js";
import { createPauseRuntime } from "./pauseMenu.js";

export const GAME_SCENE = "game";
export const LEVEL_REGISTRY = Object.freeze({
  1: LEVEL_1,
  2: LEVEL_2,
  3: LEVEL_3,
  4: LEVEL_4,
  5: LEVEL_5,
});

const PLAYER_COLLIDER_WIDTH = 20;
const PLAYER_COLLIDER_HEIGHT = 48;
let nextGameSessionId = 1;

function normalizeLevelId(value) {
  if (Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function registryValue(registry, id) {
  if (registry instanceof Map) return registry.get(id) ?? registry.get(String(id));
  return registry?.[id] ?? registry?.[String(id)];
}

/** Resolve IDs and direct LevelData without throwing into KAPLAY's scene loop. */
export function resolveLevelRequest(request, registry = LEVEL_REGISTRY) {
  if (request?.tilemap && request?.id !== undefined) {
    return Object.freeze({ ok: true, level: request, source: "data" });
  }
  if (request?.levelData?.tilemap) {
    return Object.freeze({ ok: true, level: request.levelData, source: "data" });
  }

  const rawId = request === undefined || request === null
    ? 1
    : request?.levelId ?? request?.id ?? request;
  const levelId = normalizeLevelId(rawId);
  if (levelId === null) {
    return Object.freeze({
      ok: false,
      error: `Identificador de nivel inválido: ${String(rawId)}`,
    });
  }

  const level = registryValue(registry, levelId);
  if (!level) {
    return Object.freeze({
      ok: false,
      levelId,
      error: `Nivel ${levelId} no está disponible`,
    });
  }
  return Object.freeze({ ok: true, level, levelId, source: "registry" });
}

export function firstIncompleteLevelId(progress) {
  const completed = Array.isArray(progress)
    ? progress
    : progress?.levelsCompleted;
  if (!Array.isArray(completed)) return 1;
  const index = completed.findIndex((value) => value !== true);
  return index < 0 ? 1 : index + 1;
}

function addLoadErrorScene(k, message, onMenu) {
  k.setBackground(13, 17, 23);
  k.add([
    k.text("LEVEL LOAD ERROR", { size: 48 }),
    k.pos(k.width() / 2, 220),
    k.anchor("center"),
    k.color(248, 81, 73),
  ]);
  k.add([
    k.text(message, { size: 22, width: Math.min(900, k.width() - 80), align: "center" }),
    k.pos(k.width() / 2, 320),
    k.anchor("center"),
    k.color(201, 209, 217),
  ]);
  k.add([
    k.text("Escape o Enter: volver al menú", { size: 18 }),
    k.pos(k.width() / 2, 430),
    k.anchor("center"),
    k.color(139, 148, 158),
  ]);

  let leaving = false;
  k.add([{
    id: "level-load-error-controller",
    update() {
      if (leaving || (!k.isKeyPressed("escape") && !k.isKeyPressed("enter"))) return;
      leaving = true;
      onMenu?.();
    },
  }]);
}

function installLoadErrorSmokeApi(error) {
  if (typeof window === "undefined") return () => {};
  const params = new URLSearchParams(window.location.search);
  if (!params.has("smoke")) return () => {};

  const api = Object.freeze({
    getState: () => ({ scene: GAME_SCENE, loaded: false, loadError: error }),
  });
  globalThis.__syntaxErrorGameSmoke = api;
  globalThis.__syntaxErrorSmoke = api;
  return () => {
    if (globalThis.__syntaxErrorGameSmoke === api) delete globalThis.__syntaxErrorGameSmoke;
    if (globalThis.__syntaxErrorSmoke === api) delete globalThis.__syntaxErrorSmoke;
  };
}

function installGameSmokeApi({
  k,
  sessionId,
  parsedLevel,
  gameplayRoot,
  player,
  checkpointState,
  checkpointObjects,
  getActiveCheckpointId,
  activateCheckpoint,
  deathSystem,
  mechanicRuntimes,
  garbageCollectorSystem,
  infiniteLoopSystem,
  completeLevel,
  getLevelCompleted,
  pauseRuntime,
  instantiated,
  settingsContract,
  getTheme,
}) {
  if (typeof window === "undefined") return () => {};
  const params = new URLSearchParams(window.location.search);
  if (!params.has("smoke")) return () => {};

  const state = () => ({
    scene: GAME_SCENE,
    loaded: true,
    loadError: null,
    sessionId,
    level: {
      id: parsedLevel.id,
      name: parsedLevel.name,
      musicTrack: parsedLevel.musicTrack,
      mapWidth: parsedLevel.mapWidth,
      mapHeight: parsedLevel.mapHeight,
      worldWidth: parsedLevel.worldWidth,
      worldHeight: parsedLevel.worldHeight,
    },
    spawn: {
      tile: { ...parsedLevel.spawn.tile },
      position: { ...parsedLevel.spawn.position },
    },
    player: {
      x: player.pos.x,
      y: player.pos.y,
      velocityX: player.velocityX,
      velX: player.vel.x,
      velY: player.vel.y,
      isCommented: player.isCommented,
      cooldownRemaining: player.cooldownTimer,
      controlsInverted: player.areControlsInverted(),
      inputPipeline: player.getInputPipelineState?.() ?? null,
    },
    x: player.pos.x,
    y: player.pos.y,
    checkpoint: {
      ...checkpointState.getState(),
      activeId: getActiveCheckpointId(),
      entries: checkpointObjects.map((object) => ({
        id: object.levelTileData.id,
        tile: { ...object.levelTileData.tile },
        position: { ...object.levelTileData.position },
        activated: object.checkpointActivated,
        confirmationRemaining: object.checkpointConfirmationRemaining,
      })),
    },
    entities: {
      total: instantiated.objects.length,
      platforms: instantiated.platforms.length,
      lethal: instantiated.lethalObstacles.length,
      checkpoints: instantiated.checkpoints.length,
    },
    mechanicZones: parsedLevel.mechanicZones.map((zone) => ({
      id: zone.id,
      symbol: zone.symbol,
      role: zone.role,
      mechanicId: zone.mechanic.id,
      mechanicType: zone.mechanic.type,
      tags: [...zone.tags],
      position: { ...zone.position },
      params: { ...zone.mechanic.params },
    })),
    mechanics: Object.fromEntries(
      [...mechanicRuntimes].map(([id, runtime]) => [id, runtime.getState?.() ?? null]),
    ),
    death: deathSystem.getState(),
    garbageCollector: garbageCollectorSystem?.getState?.() ?? null,
    infiniteLoop: infiniteLoopSystem?.getState?.() ?? null,
    levelComplete: Boolean(getLevelCompleted?.()),
    pause: pauseRuntime.getState(),
    gameplayRootPaused: Boolean(gameplayRoot.paused),
    theme: getTheme(),
    settings: settingsContract?.readValues?.(),
  });

  const api = {
    getState: state,
    activateCheckpoint(index = 0) {
      const object = checkpointObjects[index];
      return object ? activateCheckpoint(object) : false;
    },
    touchCheckpoint(index = 0) {
      const object = checkpointObjects[index];
      if (!object) return false;
      player.resetPlayerMovement();
      player.pos.x = object.levelTileData.position.x;
      player.pos.y = object.levelTileData.position.y;
      return true;
    },
    requestDeath: (source) => deathSystem.requestDeath(source),
    moveToLethal(index = 0) {
      const object = instantiated.lethalObstacles[index];
      if (!object) return false;
      player.resetPlayerMovement();
      player.pos.x = object.levelTileData.position.x;
      player.pos.y = object.levelTileData.position.y;
      return true;
    },
    touchMechanicSwitch(switchId) {
      const zone = parsedLevel.mechanicZones.find((entry) => (
        entry.role === "switch" && entry.mechanic.params.switchId === switchId
      ));
      if (!zone) return false;
      player.resetPlayerMovement();
      player.pos.x = zone.position.x;
      player.pos.y = zone.position.y;
      return true;
    },
    touchWarning(index = 0) {
      const zones = parsedLevel.mechanicZones.filter((entry) => entry.role === "warning");
      const zone = zones[index];
      if (!zone) return false;
      player.resetPlayerMovement();
      player.pos.x = zone.position.x;
      player.pos.y = zone.position.y;
      return true;
    },
    activateMechanicSwitch(mechanicId, switchId) {
      return mechanicRuntimes.get(mechanicId)?.activateSwitch?.(switchId) ?? false;
    },
    loadLevel(levelId) {
      k.go(GAME_SCENE, { levelId });
      return true;
    },
    reachGoal: () => completeLevel?.() ?? false,
    moveToGoal(index = 0) {
      const object = instantiated.goals?.[index];
      if (!object) return false;
      player.resetPlayerMovement();
      player.pos.x = object.levelTileData.position.x;
      player.pos.y = object.levelTileData.position.y;
      return true;
    },
    crossKillPlane() {
      player.resetPlayerMovement();
      player.pos.y = deathSystem.getState().killPlaneY + 1;
    },
    setPlayerState({ x, y, velX = 0, velY = 0 } = {}) {
      if (Number.isFinite(x)) player.pos.x = x;
      if (Number.isFinite(y)) player.pos.y = y;
      player.velocityX = velX;
      player.vel.x = velX;
      player.vel.y = velY;
    },
    activateComment: () => player.activateComment(),
    openPause: () => pauseRuntime.openPause(),
    resume: () => pauseRuntime.resume(),
    openPauseSettings: () => pauseRuntime.openSettings(),
    closePauseSettings: () => pauseRuntime.closeSettings(),
    restartLevel: () => pauseRuntime.restart(),
    returnToMenu: () => pauseRuntime.returnToMenu(),
  };

  globalThis.__syntaxErrorGameSmoke = api;
  globalThis.__syntaxErrorSmoke = api;
  return () => {
    if (globalThis.__syntaxErrorGameSmoke === api) delete globalThis.__syntaxErrorGameSmoke;
    if (globalThis.__syntaxErrorSmoke === api) delete globalThis.__syntaxErrorSmoke;
  };
}

/** Register the dynamic gameplay path. Scene input accepts `{ levelId }` or LevelData. */
export function registerGameScene(k, {
  sceneName = GAME_SCENE,
  levelRegistry = LEVEL_REGISTRY,
  settingsContract,
  audioManager,
  onMenu,
  onLevelComplete,
} = {}) {
  k.scene(sceneName, (request) => {
    const resolution = resolveLevelRequest(request, levelRegistry);
    if (!resolution.ok) {
      addLoadErrorScene(k, resolution.error, onMenu);
      const cleanup = installLoadErrorSmokeApi(resolution.error);
      k.add([{ id: "load-error-smoke-cleanup", destroy: cleanup }]);
      return;
    }

    let parsedLevel;
    try {
      parsedLevel = parseLevelData(resolution.level);
    } catch (error) {
      const message = error instanceof LevelValidationError
        ? error.message
        : `No se pudo cargar el nivel: ${error?.message ?? String(error)}`;
      addLoadErrorScene(k, message, onMenu);
      const cleanup = installLoadErrorSmokeApi(message);
      k.add([{ id: "load-error-smoke-cleanup", destroy: cleanup }]);
      return;
    }

    const sessionId = nextGameSessionId;
    nextGameSessionId += 1;
    const gameplayRoot = k.add([k.pos(0, 0), "gameplay-root"]);
    let currentTheme = settingsContract?.readValues?.().theme ?? "terminal";
    let palette = getTilePalette(currentTheme);
    k.setBackground(...palette.background);

    const instantiated = instantiateParsedLevel(k, parsedLevel, {
      parent: gameplayRoot,
      palette,
    });

    const player = gameplayRoot.add([
      k.text(";", { size: 48 }),
      k.pos(parsedLevel.spawn.position.x, parsedLevel.spawn.position.y),
      k.area({
        shape: new k.Rect(
          k.vec2(0),
          PLAYER_COLLIDER_WIDTH,
          PLAYER_COLLIDER_HEIGHT,
        ),
      }),
      k.body(),
      k.anchor("center"),
      k.color(...palette.player),
      k.opacity(1),
      playerComponent(k, { levelWidth: parsedLevel.worldBounds.right }),
      commentAbilityComponent(k),
      "player",
    ]);

    const title = gameplayRoot.add([
      k.text(`Nivel ${parsedLevel.id}: ${parsedLevel.name}`, { size: 22 }),
      k.pos(k.width() / 2, 24),
      k.anchor("center"),
      k.color(...palette.ui),
      k.z(200),
      "gameplay-ui",
    ]);
    const instructions = gameplayRoot.add([
      k.text("A/D: mover · Espacio: saltar · Shift/C: comentar · Esc: pausa", { size: 15 }),
      k.pos(k.width() / 2, 52),
      k.anchor("center"),
      k.color(...palette.ui),
      k.z(200),
      "gameplay-ui",
    ]);

    const checkpointState = createCheckpointState(parsedLevel.spawn.position);
    const checkpointObjects = instantiated.checkpoints.filter(Boolean);
    let activeCheckpointId = null;
    const activateCheckpoint = (checkpointObject) => {
      const data = checkpointObject?.levelTileData;
      if (!data || data.kind !== TILE_KINDS.CHECKPOINT) return false;
      if (activeCheckpointId === data.id) return false;

      activeCheckpointId = data.id;
      checkpointState.activateCheckpoint(data.position);
      checkpointObjects.forEach((object) => object.setCheckpointActive(
        object === checkpointObject,
        { confirm: object === checkpointObject },
      ));
      return true;
    };
    player.onCollide("checkpoint", activateCheckpoint);

    const mechanicRuntimes = attachLevelMechanics({
      k,
      gameplayRoot,
      player,
      parsedLevel,
      instantiated,
      audioManager,
    });
    // Respawn consumes a narrow adapter discovered by capability, so future
    // warning-enabled levels do not require level-specific scene branches.
    const warningRuntime = [...mechanicRuntimes.values()].find((runtime) => (
      typeof runtime?.getWarningCount === "function"
      && typeof runtime?.resetWarnings === "function"
    ));
    const warningResetContract = createWarningResetContract({
      getWarningCount: () => warningRuntime?.getWarningCount?.() ?? 0,
      resetWarnings: () => warningRuntime?.resetWarnings?.(),
    });
    const deathSystem = attachDeathRespawnSystem(k, {
      gameplayRoot,
      player,
      checkpointState,
      warningResetContract,
      killPlaneY: parsedLevel.worldBounds.bottom + parsedLevel.tileSize.height * 2,
    });

    const infiniteLoopDefinition = parsedLevel.data.mechanics.find(
      (mechanic) => mechanic.type === "infiniteLoop" && mechanic.enabled,
    );
    const infiniteLoopZones = instantiated.mechanicZones.filter(
      (object) => object?.levelTileData?.mechanic?.type === "infiniteLoop",
    );
    const loopParams = infiniteLoopDefinition?.params ?? {};
    const infiniteLoopSystem = infiniteLoopDefinition
      ? attachInfiniteLoopSystem(k, {
        gameplayRoot,
        player,
        levelStart: parsedLevel.spawn.position,
        zones: infiniteLoopZones,
        audioManager,
        historyDuration: loopParams.historySeconds,
        cloneDelay: loopParams.cloneDelaySeconds,
        maxClones: loopParams.maxClones,
        overflowDuration: loopParams.overflowSeconds,
      })
      : null;

    // Garbage Collector needs the death system, so it is wired here rather than
    // through the generic registry. The timer is level-wide (Requirement 5).
    const garbageCollectorDefinition = parsedLevel.data.mechanics.find(
      (mechanic) => mechanic.type === "garbageCollector" && mechanic.enabled,
    );
    const garbageCollectorZones = instantiated.mechanicZones.filter(
      (object) => object?.levelTileData?.mechanic?.type === "garbageCollector",
    );
    const garbageCollectorSystem = garbageCollectorDefinition
      ? attachGarbageCollectorSystem(k, {
        gameplayRoot,
        player,
        zones: garbageCollectorZones,
        requestDeath: deathSystem.requestDeath,
        audioManager,
        inactivitySeconds: garbageCollectorDefinition.params?.inactivitySeconds,
      })
      : null;

    const applyTheme = (themeId) => {
      currentTheme = getTilePalette(themeId) === getTilePalette("terminal")
        && themeId !== "terminal"
        ? "terminal"
        : themeId;
      palette = getTilePalette(currentTheme);
      k.setBackground(...palette.background);
      instantiated.objects.forEach((object) => object.applyTilePalette?.(palette));
      mechanicRuntimes.forEach((runtime) => runtime.applyTheme?.(palette));
      garbageCollectorSystem?.applyTheme?.(palette);
      player.setCommentBaseColor(k.rgb(...palette.player));
      title.color = k.rgb(...palette.ui);
      instructions.color = k.rgb(...palette.ui);
      return currentTheme;
    };
    applyTheme(currentTheme);

    const restartRequest = resolution.source === "registry"
      ? { levelId: parsedLevel.id }
      : { levelData: resolution.level };
    const pauseRuntime = createPauseRuntime(k, {
      gameplayRoot,
      settingsContract,
      onRestart: () => k.go(sceneName, restartRequest),
      onMenu,
      onThemeChange: applyTheme,
    });

    // Reaching the goal tile completes the level: warnings and control
    // inversion reset via "level-complete", progress is persisted, and a
    // victory overlay is shown at scene root so it renders above the frozen
    // gameplay world (Requirements 9.4, 9.5).
    let levelCompleted = false;
    let leavingAfterVictory = false;
    const isFinalLevel = parsedLevel.id >= 5;
    const completeLevel = () => {
      if (levelCompleted) return false;
      levelCompleted = true;
      player.trigger?.("level-complete", parsedLevel.id);
      gameplayRoot.paused = true;
      if (pauseRuntime.controller) pauseRuntime.controller.paused = true;
      try {
        audioManager?.playSfx?.("ability");
      } catch {
        // Audio is optional and must never block completion.
      }
      onLevelComplete?.(parsedLevel.id);

      const overlay = k.add([
        k.pos(0, 0),
        ...(typeof k.fixed === "function" ? [k.fixed()] : []),
        k.z(2000),
        "level-complete-overlay",
      ]);
      overlay.add([
        k.rect(k.width(), k.height()),
        k.pos(0, 0),
        k.anchor("topleft"),
        k.color(5, 8, 12),
        k.opacity(0.9),
      ]);
      overlay.add([
        k.text(isFinalLevel ? "JUEGO COMPLETADO" : "NIVEL COMPLETADO", { size: 56 }),
        k.pos(k.width() / 2, k.height() / 2 - 70),
        k.anchor("center"),
        k.color(...palette.accent),
      ]);
      overlay.add([
        k.text(
          isFinalLevel
            ? "// deploy exitoso: sobreviviste a producción"
            : `Nivel ${parsedLevel.id} superado`,
          { size: 22 },
        ),
        k.pos(k.width() / 2, k.height() / 2),
        k.anchor("center"),
        k.color(...palette.ui),
      ]);
      overlay.add([
        k.text("Enter o Escape: volver al menú", { size: 18 }),
        k.pos(k.width() / 2, k.height() / 2 + 70),
        k.anchor("center"),
        k.color(...palette.ui),
      ]);

      k.add([{
        id: "level-complete-controller",
        update() {
          if (leavingAfterVictory) return;
          if (!k.isKeyPressed("enter") && !k.isKeyPressed("escape")) return;
          leavingAfterVictory = true;
          onMenu?.();
        },
      }, "level-complete-controller"]);
      return true;
    };
    player.onCollide("level-goal", completeLevel);

    const uninstallSmokeApi = installGameSmokeApi({
      k,
      sessionId,
      parsedLevel,
      gameplayRoot,
      player,
      checkpointState,
      checkpointObjects,
      getActiveCheckpointId: () => activeCheckpointId,
      activateCheckpoint,
      deathSystem,
      mechanicRuntimes,
      garbageCollectorSystem,
      infiniteLoopSystem,
      completeLevel,
      getLevelCompleted: () => levelCompleted,
      pauseRuntime,
      instantiated,
      settingsContract,
      getTheme: () => currentTheme,
    });
    gameplayRoot.add([{
      id: "game-smoke-cleanup",
      destroy() {
        uninstallSmokeApi();
      },
    }]);
  });

  return sceneName;
}
