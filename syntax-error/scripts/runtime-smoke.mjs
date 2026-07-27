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
  if (!condition) {
    const details = state === undefined ? "" : `: ${JSON.stringify(state)}`;
    throw new Error(`${message}${details}`);
  }
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

  if (protocol.exceptions.length > 0 || protocol.consoleErrors.length > 0) {
    throw new Error([...protocol.exceptions, ...protocol.consoleErrors].join("\n"));
  }

  console.log(
    `Runtime smoke passed: ${initial.canvasCount} canvas, ${initial.width}x${initial.height}; `
      + "Menu/Level Select -> dynamic Level 1, tile spawn, declarative GC zone, "
      + "checkpoint activation, lethal respawn, pause/settings, restart, menu return, "
      + "Jugar route, Level 2 Merge inversion/respawn/wall resolution/restart, "
      + "and runtime cleanup verified; no JavaScript exceptions",
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
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
  if (profileDirectory) {
    rmSync(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}
