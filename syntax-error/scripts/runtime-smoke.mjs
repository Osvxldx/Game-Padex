import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DIST_DIR = fileURLToPath(new URL("../dist/", import.meta.url));
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
};
const delay = (milliseconds) => new Promise(
  (resolveDelay) => setTimeout(resolveDelay, milliseconds),
);

function assertRuntime(condition, message, state) {
  if (condition) return;
  const details = state === undefined ? "" : `: ${JSON.stringify(state)}`;
  // A failed assertion is usually the symptom of a browser-side exception that
  // is otherwise only reported at the end of the run, so surface it here.
  const browserErrors = [
    ...(protocol?.exceptions ?? []),
    ...(protocol?.consoleErrors ?? []),
  ];
  const diagnostics = browserErrors.length === 0
    ? ""
    : `\nBrowser errors:\n${browserErrors.join("\n")}`;
  throw new Error(`${message}${details}${diagnostics}`);
}

function findBrowser() {
  return [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean).find(existsSync) ?? null;
}

function startStaticServer() {
  const distRoot = resolve(DIST_DIR);
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
      const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const filePath = resolve(distRoot, relativePath);
      if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = readFileSync(filePath);
      response.writeHead(200, {
        "content-type": MIME_TYPES[extname(filePath)] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
}

function waitForDevTools(browser) {
  return new Promise((resolveUrl, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Browser DevTools did not start. ${stderr.slice(-1000)}`));
    }, 15000);
    browser.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolveUrl(match[1]);
      }
    });
    browser.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(
        `Browser exited before smoke test (code ${code}). ${stderr.slice(-1000)}`,
      ));
    });
  });
}

async function waitForPageTarget(debugPort) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json();
    const page = targets.find((target) => target.type === "page");
    if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    await delay(100);
  }
  throw new Error("No browser page target became available");
}

async function connectProtocol(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const exceptions = [];
  const consoleErrors = [];
  let nextId = 1;

  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data.toString());
    if (message.id) {
      const operation = pending.get(message.id);
      if (!operation) return;
      pending.delete(message.id);
      if (message.error) operation.reject(new Error(message.error.message));
      else operation.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params.exceptionDetails;
      exceptions.push(
        details.exception?.description ?? details.text ?? "Unknown runtime exception",
      );
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      consoleErrors.push(message.params.args
        .map((argument) => argument.value ?? argument.description ?? "")
        .join(" "));
    }
  });

  function send(method, params = {}) {
    const id = nextId;
    nextId += 1;
    return new Promise((resolveMessage, reject) => {
      pending.set(id, { resolve: resolveMessage, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return { socket, send, exceptions, consoleErrors };
}

async function evaluate(protocol, expression) {
  const evaluation = await protocol.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(
      evaluation.exceptionDetails.exception?.description
        ?? evaluation.exceptionDetails.text,
    );
  }
  return evaluation.result.value;
}

async function pressKey(protocol, key, code, keyCode) {
  await protocol.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await delay(50);
  await protocol.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
  await delay(100);
}

/**
 * Resolve once the browser process has really exited. Windows only releases the
 * locks on the `--user-data-dir` files after the process is gone, so deleting
 * the profile before this point fails with EPERM.
 */
async function waitForBrowserExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolveExit) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", finish);
      resolveExit();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    child.once("exit", finish);
  });
}

/**
 * Delete a directory without ever throwing. Cleanup runs inside `finally`, so a
 * failure here would replace the real assertion error (or turn a passing run
 * into a failure). Windows can still report EPERM/EBUSY right after exit, so
 * retry a few times and downgrade a persistent failure to a warning.
 */
async function removeDirectoryBestEffort(directory, attempts = 6, waitMs = 250) {
  if (!directory) return true;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true });
      return true;
    } catch (error) {
      const retryable = error?.code === "EPERM"
        || error?.code === "EBUSY"
        || error?.code === "ENOTEMPTY";
      if (!retryable || attempt === attempts) {
        console.warn(
          `Warning: could not remove temporary profile ${directory} `
            + `(${error?.code ?? error?.message}); leaving it for the OS to reclaim.`,
        );
        return false;
      }
      await delay(waitMs);
    }
  }
  return false;
}

let browser;
let protocol;
let server;
let profileDirectory;

try {
  if (!existsSync(resolve(DIST_DIR, "index.html"))) {
    throw new Error("dist/index.html is missing; run npm run build first");
  }
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error("Chrome or Edge was not found; set CHROME_PATH to run the smoke test");
  }

  server = await startStaticServer();
  const gameUrl = `http://127.0.0.1:${server.address().port}/?smoke=1`;
  profileDirectory = mkdtempSync(resolve(tmpdir(), "syntax-error-smoke-"));
  browser = spawn(browserPath, [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-extensions",
    "--mute-audio",
    `--user-data-dir=${profileDirectory}`,
    "--remote-debugging-port=0",
    "about:blank",
  ], {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  const browserSocketUrl = await waitForDevTools(browser);
  const debugPort = Number(new URL(browserSocketUrl).port);
  protocol = await connectProtocol(await waitForPageTarget(debugPort));
  await protocol.send("Runtime.enable");
  await protocol.send("Page.enable");
  await protocol.send("Page.navigate", { url: gameUrl });
  await delay(2500);

  const initial = await evaluate(protocol, `(() => {
    const canvas = document.querySelector("canvas");
    return {
      readyState: document.readyState,
      canvasCount: document.querySelectorAll("canvas").length,
      width: canvas?.width ?? 0,
      height: canvas?.height ?? 0,
      menu: globalThis.__syntaxErrorMenuSmoke?.getState(),
      gameReady: Boolean(globalThis.__syntaxErrorGameSmoke),
    };
  })()`);
  assertRuntime(
    initial.readyState === "complete"
      && initial.canvasCount === 1
      && initial.width > 0
      && initial.height > 0
      && initial.menu?.scene === "menu"
      && initial.menu.selectedId === "play"
      && !initial.gameReady,
    "Initial menu runtime state is invalid",
    initial,
  );

  // Boot requests the menu loop. Headless Chrome blocks autoplay, so the
  // desired track is the observable contract; the active voice may stay null.
  const menuAudio = await evaluate(
    protocol,
    "globalThis.__syntaxErrorAppSmoke.getAudioState()",
  );
  assertRuntime(
    menuAudio?.desiredMusic === "menu"
      && menuAudio.crossfadeSeconds === 1
      && menuAudio.failedResources.length === 0
      && menuAudio.musicVolume >= 0 && menuAudio.musicVolume <= 1
      && menuAudio.sfxVolume >= 0 && menuAudio.sfxVolume <= 1,
    "Boot did not request the menu music loop with a 1s crossfade",
    menuAudio,
  );

  // Menu -> Level Select -> Level 1 -> dynamic game.
  await pressKey(protocol, "ArrowDown", "ArrowDown", 40);
  await pressKey(protocol, "Enter", "Enter", 13);
  const levelSelect = await evaluate(
    protocol,
    "globalThis.__syntaxErrorLevelSelectSmoke?.getState()",
  );
  assertRuntime(
    levelSelect?.scene === "levelSelect"
      && levelSelect.selectedId === 1
      && levelSelect.levels.length === 5
      && levelSelect.levels[0].selectable,
    "Menu did not open Level Select with Level 1 available",
    levelSelect,
  );

  await pressKey(protocol, "Enter", "Enter", 13);
  await delay(200);
  const loaded = await evaluate(
    protocol,
    "globalThis.__syntaxErrorGameSmoke?.getState()",
  );
  assertRuntime(
    loaded?.loaded
      && loaded.scene === "game"
      && loaded.level.id === 1
      && loaded.level.name === "Garbage Collector"
      && loaded.spawn.tile.column === 1
      && loaded.spawn.tile.row === 13
      && loaded.player.x === loaded.spawn.position.x
      && loaded.player.y === loaded.spawn.position.y
      && loaded.entities.checkpoints >= 1
      && loaded.entities.lethal >= 1
      && loaded.entities.movingPlatforms >= 1
      && loaded.garbageCollector?.thresholdSeconds === 5
      && loaded.garbageCollector.progress >= 0
      && loaded.mechanicZones.some((zone) => (
        zone.symbol === "G"
        && zone.mechanicType === "garbageCollector"
        && zone.tags.includes("gc-zone")
      )),
    "Level 1 did not load dynamically from its tilemap",
    loaded,
  );

  // Entering a level crossfades the menu loop to that level's track.
  const levelAudio = await evaluate(
    protocol,
    "globalThis.__syntaxErrorAppSmoke.getAudioState()",
  );
  assertRuntime(
    levelAudio?.desiredMusic === "level1"
      && levelAudio.failedResources.length === 0,
    "Entering Level 1 did not crossfade the menu loop to the level track",
    levelAudio,
  );

  // Mid-level theme change must repaint in place: same session, untouched
  // player state, no respawn and no loss of checkpoint or warning progress.
  const beforeTheme = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  const themed = await evaluate(protocol, `(() => {
    globalThis.__syntaxErrorGameSmoke.setPlayerState({ x: 300, y: 400, velX: 42, velY: -17 });
    const applied = globalThis.__syntaxErrorGameSmoke.changeTheme("blueprint");
    return { applied, state: globalThis.__syntaxErrorGameSmoke.getState() };
  })()`);
  assertRuntime(
    themed.applied === "blueprint"
      && themed.state.theme === "blueprint"
      && themed.state.settings.theme === "blueprint"
      && themed.state.sessionId === beforeTheme.sessionId
      && themed.state.player.x === 300
      && themed.state.player.y === 400
      && themed.state.player.velX === 42
      && themed.state.player.velY === -17
      && themed.state.death.state === beforeTheme.death.state
      && themed.state.checkpoint.activeId === beforeTheme.checkpoint.activeId
      && themed.state.player.warningCount === beforeTheme.player.warningCount
      && themed.state.level.id === beforeTheme.level.id,
    "Mid-level theme change rebuilt gameplay or altered player state",
    themed,
  );
  // Restore the default theme and put the player back at spawn so the
  // following assertions start from the same state as before this block.
  await evaluate(protocol, `(() => {
    const api = globalThis.__syntaxErrorGameSmoke;
    api.changeTheme("terminal");
    const spawn = api.getState().spawn.position;
    api.setPlayerState({ x: spawn.x, y: spawn.y });
    return true;
  })()`);

  // Real checkpoint collision updates state and persistent visual selection.
  const checkpointTouched = await evaluate(
    protocol,
    "globalThis.__syntaxErrorGameSmoke.touchCheckpoint(0)",
  );
  assertRuntime(checkpointTouched, "Smoke API could not reach the tilemap checkpoint");
  await delay(120);
  const checkpoint = await evaluate(
    protocol,
    "globalThis.__syntaxErrorGameSmoke.getState()",
  );
  const activeCheckpoint = checkpoint.checkpoint.entries[0];
  assertRuntime(
    checkpoint.checkpoint.activeId === activeCheckpoint.id
      && activeCheckpoint.activated
      && activeCheckpoint.confirmationRemaining > 0
      && activeCheckpoint.confirmationRemaining <= 0.5
      && checkpoint.checkpoint.lastCheckpoint.x === activeCheckpoint.position.x
      && checkpoint.checkpoint.lastCheckpoint.y === activeCheckpoint.position.y,
    "Checkpoint collision did not replace respawn state and activate its visual",
    checkpoint,
  );

  // Lethal tile -> death -> respawn at the checkpoint within 500ms.
  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.moveToLethal(0)");
  await delay(100);
  const dying = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    dying.death.state === "dying"
      && dying.death.deathSource === "lethal"
      && dying.death.feedbackVisible,
    "Tilemap lethal obstacle did not begin death",
    dying,
  );
  await delay(250);
  const respawned = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    respawned.death.state === "invulnerable"
      && respawned.player.x === activeCheckpoint.position.x
      && respawned.player.y === activeCheckpoint.position.y
      && respawned.player.velocityX === 0
      && respawned.player.velY === 0,
    "Death did not respawn at the activated checkpoint within 500ms",
    respawned,
  );
  await delay(1050);

  // Pause freezes gameplay and settings stays inside the paused scene.
  await pressKey(protocol, "Escape", "Escape", 27);
  const paused = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    paused.pause.mode === "paused"
      && paused.pause.gameplayPaused
      && paused.gameplayRootPaused,
    "Escape did not pause the dynamic gameplay root",
    paused,
  );
  await pressKey(protocol, "ArrowDown", "ArrowDown", 40);
  await pressKey(protocol, "ArrowDown", "ArrowDown", 40);
  await pressKey(protocol, "Enter", "Enter", 13);
  const pauseSettings = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    pauseSettings.pause.mode === "settings"
      && pauseSettings.pause.gameplayPaused,
    "Settings did not open as a paused in-scene overlay",
    pauseSettings,
  );
  await pressKey(protocol, "Escape", "Escape", 27);
  await pressKey(protocol, "Escape", "Escape", 27);

  // Restart creates a clean session at spawn and clears checkpoint activation.
  const sessionBeforeRestart = loaded.sessionId;
  await pressKey(protocol, "Escape", "Escape", 27);
  await pressKey(protocol, "ArrowDown", "ArrowDown", 40);
  await pressKey(protocol, "Enter", "Enter", 13);
  await delay(250);
  const restarted = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    restarted.sessionId !== sessionBeforeRestart
      && restarted.pause.mode === "running"
      && restarted.player.x === restarted.spawn.position.x
      && restarted.player.y === restarted.spawn.position.y
      && restarted.checkpoint.activeId === null
      && restarted.checkpoint.entries.every((entry) => !entry.activated)
      && restarted.checkpoint.lastCheckpoint.x === restarted.spawn.position.x
      && restarted.checkpoint.lastCheckpoint.y === restarted.spawn.position.y,
    "Restart did not reset spawn and all checkpoints",
    restarted,
  );

  // Pause -> menu cleans runtime APIs, then Jugar enters the dynamic scene too.
  await pressKey(protocol, "Escape", "Escape", 27);
  await pressKey(protocol, "ArrowUp", "ArrowUp", 38);
  await pressKey(protocol, "Enter", "Enter", 13);
  await delay(180);
  const returnedMenu = await evaluate(protocol, `({
    menu: globalThis.__syntaxErrorMenuSmoke?.getState(),
    gameRemoved: !globalThis.__syntaxErrorGameSmoke,
  })`);
  assertRuntime(
    returnedMenu.menu?.scene === "menu"
      && returnedMenu.menu.selectedId === "play"
      && returnedMenu.gameRemoved,
    "Pause menu did not return cleanly to the main menu",
    returnedMenu,
  );
  await pressKey(protocol, "Enter", "Enter", 13);
  await delay(180);
  const playRoute = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke?.getState()");
  assertRuntime(
    playRoute?.loaded && playRoute.level.id === 1,
    "Jugar did not enter the dynamic game scene",
    playRoute,
  );

  // Level 2 Merge Barrier: incorrect inversion survives death, correct opens
  // only its wall, and scene restart creates a clean mechanic session.
  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.loadLevel(2)");
  await delay(250);
  const level2 = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    level2?.loaded
      && level2.level.id === 2
      && level2.mechanics["merge-main"].sections.length === 3
      && level2.mechanics["merge-main"].sections.every((section) => (
        section.switches.length >= 2 && section.switches.length <= 4
      ))
      && level2.mechanics["merge-main"].sections.every((section) => (
        section.switches.filter((entry) => entry.correct).length === 1
      )),
    "Level 2 did not load its three declarative Merge sections",
    level2,
  );

  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.touchMechanicSwitch('merge-1-a')");
  await delay(120);
  const inverted = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    inverted.player.controlsInverted
      && inverted.mechanics["merge-main"].controlsInverted
      && inverted.mechanics["merge-main"].sections[0].feedback === "conflict",
    "Incorrect Merge switch did not apply persistent inverted controls",
    inverted,
  );

  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.requestDeath('merge-smoke')");
  await delay(350);
  const mergeRespawn = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    mergeRespawn.death.state === "invulnerable"
      && mergeRespawn.player.controlsInverted
      && mergeRespawn.mechanics["merge-main"].controlsInverted,
    "Merge inversion did not persist through death and respawn",
    mergeRespawn,
  );

  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.touchMechanicSwitch('merge-1-b')");
  await delay(120);
  const resolvedMerge = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    resolvedMerge.mechanics["merge-main"].sections[0].wallOpen
      && !resolvedMerge.mechanics["merge-main"].sections[1].wallOpen
      && !resolvedMerge.mechanics["merge-main"].sections[2].wallOpen
      && resolvedMerge.mechanics["merge-main"].sections[0].feedback === "resolved",
    "Correct Merge switch did not open only its corresponding wall",
    resolvedMerge,
  );

  const mergeSession = resolvedMerge.sessionId;
  await evaluate(protocol, `(() => {
    globalThis.__syntaxErrorGameSmoke.openPause();
    return globalThis.__syntaxErrorGameSmoke.restartLevel();
  })()`);
  await delay(250);
  const resetMerge = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    resetMerge.sessionId !== mergeSession
      && resetMerge.level.id === 2
      && !resetMerge.player.controlsInverted
      && !resetMerge.mechanics["merge-main"].controlsInverted
      && resetMerge.mechanics["merge-main"].sections.every((section) => !section.wallOpen),
    "Level 2 restart did not reset Merge inversion and walls",
    resetMerge,
  );

  // Level 4 Warnings: collision, HUD, exact delay, Comment Code immunity,
  // one-shot signs, and death reset through the gameplay contract.
  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.loadLevel(4)");
  await delay(250);
  const level4 = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    level4?.loaded
      && level4.level.id === 4
      && level4.mechanicZones.filter((zone) => zone.mechanicType === "warningSystem").length > 20
      && level4.mechanics["warnings-main"].warningCount === 0
      && level4.mechanics["warnings-main"].delayMs === 50
      && level4.mechanics["warnings-main"].hudText === "Warnings: 0"
      && level4.player.inputPipeline.order.join(",") === "raw-input,warning-delay,merge-inversion,movement",
    "Level 4 did not load its warning signs, HUD, and delayed-input pipeline",
    level4,
  );

  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.touchWarning(0)");
  await delay(120);
  const warningCollected = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    warningCollected.mechanics["warnings-main"].warningCount === 1
      && Math.abs(warningCollected.mechanics["warnings-main"].delayMs - 57.5) < 1e-9
      && warningCollected.mechanics["warnings-main"].hudText === "Warnings: 1"
      && warningCollected.mechanics["warnings-main"].collectedSignalIds.length === 1,
    "Warning collision did not update count, HUD, and exact input delay",
    warningCollected,
  );

  await evaluate(protocol, `(() => {
    const api = globalThis.__syntaxErrorGameSmoke;
    api.setPlayerState({ x: api.getState().spawn.position.x, y: api.getState().spawn.position.y });
    return api.activateComment();
  })()`);
  await delay(40);
  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.touchWarning(1)");
  await delay(100);
  const immuneWarning = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    immuneWarning.player.isCommented
      && immuneWarning.mechanics["warnings-main"].warningCount === 1
      && immuneWarning.mechanics["warnings-main"].collectedSignalIds.length === 1,
    "Comment Code did not prevent warning collection",
    immuneWarning,
  );

  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.requestDeath('warning-smoke')");
  await delay(350);
  const warningRespawn = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    warningRespawn.death.state === "invulnerable"
      && warningRespawn.mechanics["warnings-main"].warningCount === 0
      && warningRespawn.mechanics["warnings-main"].input.pendingCount === 0
      && warningRespawn.mechanics["warnings-main"].hudText === "Warnings: 0"
      && warningRespawn.mechanics["warnings-main"].collectedSignalIds.length === 1,
    "Death did not reset warning count and delayed-input queue through the reset contract",
    warningRespawn,
  );

  // Level 5 finale: all four mechanics load, the Garbage Collector runs
  // level-wide, and reaching the goal completes the game and persists it.
  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.loadLevel(5)");
  await delay(250);
  const level5 = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    level5?.loaded
      && level5.level.id === 5
      && level5.level.name === "Production"
      && level5.mechanicZones.some((zone) => zone.mechanicType === "garbageCollector")
      && level5.mechanicZones.some((zone) => zone.mechanicType === "mergeBarrier")
      && level5.mechanicZones.some((zone) => zone.mechanicType === "infiniteLoop")
      && level5.mechanicZones.some((zone) => zone.mechanicType === "warningSystem")
      && level5.garbageCollector
      && level5.garbageCollector.thresholdSeconds === 5
      && level5.levelComplete === false,
    "Level 5 did not load all four mechanics with an active Garbage Collector",
    level5,
  );

  const gcElapsedBefore = level5.garbageCollector.elapsedSeconds;
  await delay(700);
  const gcTicking = await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.getState()");
  assertRuntime(
    gcTicking.garbageCollector.elapsedSeconds > gcElapsedBefore
      && !gcTicking.levelComplete,
    "Garbage Collector timer did not accumulate during inactivity",
    gcTicking,
  );

  await evaluate(protocol, "globalThis.__syntaxErrorGameSmoke.moveToGoal(0)");
  await delay(150);
  const finished = await evaluate(protocol, `(() => {
    const state = globalThis.__syntaxErrorGameSmoke.getState();
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem("syntax-error-save")); } catch { saved = null; }
    return { state, saved };
  })()`);
  assertRuntime(
    finished.state.levelComplete
      && finished.state.gameplayRootPaused
      && finished.saved
      && Array.isArray(finished.saved.levelsCompleted)
      && finished.saved.levelsCompleted[4] === true
      && finished.saved.levelsCompleted.every((done) => done === true),
    "Reaching the Level 5 goal did not complete and persist the game",
    finished,
  );

  // Canvas adaptation: the presented canvas follows the window across the
  // supported range while the logical resolution stays fixed, so gameplay
  // coordinates never depend on the display size.
  const viewportChecks = [];
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 },
  ]) {
    await protocol.send("Emulation.setDeviceMetricsOverride", {
      width: size.width,
      height: size.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(250);
    const viewport = await evaluate(
      protocol,
      "globalThis.__syntaxErrorAppSmoke.getViewportState()",
    );
    const designedRatio = viewport.designed.width / viewport.designed.height;
    const canvasRatio = viewport.canvas.width / viewport.canvas.height;
    // Letterboxing fills one axis exactly and never overflows the other, so a
    // canvas that ignored the window would fail the "fills an axis" check.
    const fillsWidth = Math.abs(viewport.canvas.width - viewport.window.width) <= 2;
    const fillsHeight = Math.abs(viewport.canvas.height - viewport.window.height) <= 2;
    assertRuntime(
      viewport.logical.width === viewport.designed.width
        && viewport.logical.height === viewport.designed.height
        && viewport.canvas.width <= viewport.window.width + 2
        && viewport.canvas.height <= viewport.window.height + 2
        && (fillsWidth || fillsHeight)
        && Math.abs(canvasRatio - designedRatio) < 0.02,
      `Canvas did not adapt to a ${size.width}x${size.height} window`,
      { requested: size, viewport, fillsWidth, fillsHeight },
    );
    viewportChecks.push(`${size.width}x${size.height}`);
  }
  await protocol.send("Emulation.clearDeviceMetricsOverride");

  // Production budgets: initial load under 3s and heap under 200MB.
  const budgets = await evaluate(protocol, `(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      loadMs: navigation ? navigation.loadEventEnd - navigation.startTime : null,
      domContentLoadedMs: navigation
        ? navigation.domContentLoadedEventEnd - navigation.startTime
        : null,
      usedHeapMB: performance.memory
        ? performance.memory.usedJSHeapSize / (1024 * 1024)
        : null,
    };
  })()`);
  assertRuntime(
    Number.isFinite(budgets.loadMs)
      && budgets.loadMs < 3000
      && Number.isFinite(budgets.usedHeapMB)
      && budgets.usedHeapMB < 200,
    "Production bundle exceeded the load time or memory budget",
    budgets,
  );

  if (protocol.exceptions.length > 0 || protocol.consoleErrors.length > 0) {
    throw new Error([...protocol.exceptions, ...protocol.consoleErrors].join("\n"));
  }

  console.log(
    `Runtime smoke passed: ${initial.canvasCount} canvas, ${initial.width}x${initial.height}; `
      + "Menu/Level Select -> dynamic Level 1, tile spawn, declarative GC zone, "
      + "checkpoint activation, lethal respawn, pause/settings, restart, menu return, "
      + "Jugar route, Level 2 Merge inversion/respawn/wall resolution/restart, "
      + "Level 4 warning collision/HUD/delay/immunity/death reset, "
      + "Level 5 all-mechanics load, active Garbage Collector timer, goal completion "
      + "and persisted progression, and runtime cleanup verified; "
      + "menu->level music crossfade, mid-level theme change without gameplay rebuild, "
      + `canvas adaptation at ${viewportChecks.join(" / ")}, `
      + `load ${Math.round(budgets.loadMs)}ms < 3000ms, `
      + `heap ${budgets.usedHeapMB.toFixed(1)}MB < 200MB; no JavaScript exceptions`,
  );
} finally {
  if (protocol?.socket?.readyState === WebSocket.OPEN) {
    try {
      await protocol.send("Browser.close");
    } catch {
      protocol.socket.close();
    }
  }
  if (browser && browser.exitCode === null) browser.kill();
  // Windows keeps the profile files locked until the browser process is gone,
  // so wait for the real exit before deleting the temporary user-data-dir.
  await waitForBrowserExit(browser);
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  // Cleanup must never mask the assertion result: on Windows the profile can
  // still be locked (EPERM/EBUSY) after exit, so retry and then warn instead
  // of throwing out of the finally block.
  await removeDirectoryBestEffort(profileDirectory);
}
