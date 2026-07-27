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
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  return candidates.find(existsSync) ?? null;
}

function startStaticServer() {
  const distRoot = resolve(DIST_DIR);
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
      const relativePath = pathname === "/"
        ? "index.html"
        : pathname.replace(/^\/+/, "");
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
    if (page?.webSocketDebuggerUrl) {
      return page.webSocketDebuggerUrl;
    }
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
        details.exception?.description
          ?? details.text
          ?? "Unknown runtime exception",
      );
    }

    if (
      message.method === "Runtime.consoleAPICalled"
      && message.params.type === "error"
    ) {
      consoleErrors.push(
        message.params.args
          .map((argument) => argument.value ?? argument.description ?? "")
          .join(" "),
      );
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
  const address = server.address();
  const gameUrl = `http://127.0.0.1:${address.port}/?smoke=1`;
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
  const pageSocketUrl = await waitForPageTarget(debugPort);
  protocol = await connectProtocol(pageSocketUrl);

  await protocol.send("Runtime.enable");
  await protocol.send("Page.enable");
  await protocol.send("Page.navigate", { url: gameUrl });
  await delay(2500);

  const pageState = await evaluate(protocol, `(() => {
    const canvas = document.querySelector("canvas");
    return {
      readyState: document.readyState,
      canvasCount: document.querySelectorAll("canvas").length,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
      menuSmokeApiReady: Boolean(globalThis.__syntaxErrorMenuSmoke),
      gameplaySmokeApiReady: Boolean(globalThis.__syntaxErrorSmoke),
    };
  })()`);
  assertRuntime(
    pageState.readyState === "complete"
      && pageState.canvasCount === 1
      && pageState.canvasWidth > 0
      && pageState.canvasHeight > 0
      && pageState.menuSmokeApiReady
      && !pageState.gameplaySmokeApiReady,
    "Invalid initial menu runtime state",
    pageState,
  );

  const menuState = await evaluate(
    protocol,
    "globalThis.__syntaxErrorMenuSmoke.getState()",
  );
  assertRuntime(
    menuState.scene === "menu"
      && menuState.selectedId === "play"
      && menuState.options.length === 3
      && menuState.options.map((option) => option.label).join("|")
        === "Jugar|Selección de Nivel|Configuración",
    "Main menu did not expose the required initial selection",
    menuState,
  );

  const pressKey = async (key, code, keyCode) => {
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
  };

  await pressKey("ArrowDown", "ArrowDown", 40);
  const levelSelectMenuChoice = await evaluate(
    protocol,
    "globalThis.__syntaxErrorMenuSmoke.getState()",
  );
  assertRuntime(
    levelSelectMenuChoice.selectedId === "levelSelect",
    "Keyboard navigation did not select Level Select",
    levelSelectMenuChoice,
  );

  await pressKey("Enter", "Enter", 13);
  await delay(150);
  const initialLevelSelect = await evaluate(protocol, `({
    state: globalThis.__syntaxErrorLevelSelectSmoke?.getState(),
    menuSmokeApiRemoved: !globalThis.__syntaxErrorMenuSmoke,
  })`);
  assertRuntime(
    initialLevelSelect.state?.scene === "levelSelect"
      && initialLevelSelect.state.selectedId === 1
      && initialLevelSelect.state.levels.length === 5
      && initialLevelSelect.state.levels.map((level) => level.state).join("|")
        === "unlocked|locked|locked|locked|locked"
      && initialLevelSelect.menuSmokeApiRemoved,
    "Level Select did not expose the required default progression",
    initialLevelSelect,
  );

  await pressKey("ArrowRight", "ArrowRight", 39);
  await pressKey("Enter", "Enter", 13);
  const lockedAttempt = await evaluate(
    protocol,
    "globalThis.__syntaxErrorLevelSelectSmoke.getState()",
  );
  assertRuntime(
    lockedAttempt.selectedId === 2
      && lockedAttempt.feedback.visible
      && lockedAttempt.feedback.message
        === "Completa el Nivel 1 para desbloquearlo"
      && lockedAttempt.feedback.remaining > 0
      && lockedAttempt.feedback.remaining <= 2,
    "Selecting a locked level did not show prerequisite feedback",
    lockedAttempt,
  );

  await delay(1800);
  const feedbackBeforeExpiry = await evaluate(
    protocol,
    "globalThis.__syntaxErrorLevelSelectSmoke.getState().feedback",
  );
  assertRuntime(
    feedbackBeforeExpiry.visible,
    "Locked-level feedback expired before two seconds",
    feedbackBeforeExpiry,
  );

  await delay(350);
  const feedbackAfterExpiry = await evaluate(
    protocol,
    "globalThis.__syntaxErrorLevelSelectSmoke.getState().feedback",
  );
  assertRuntime(
    !feedbackAfterExpiry.visible && feedbackAfterExpiry.remaining === 0,
    "Locked-level feedback did not expire after two seconds",
    feedbackAfterExpiry,
  );

  await pressKey("Escape", "Escape", 27);
  await delay(150);
  const returnedMenu = await evaluate(protocol, `({
    menu: globalThis.__syntaxErrorMenuSmoke?.getState(),
    levelSelectSmokeApiRemoved: !globalThis.__syntaxErrorLevelSelectSmoke,
  })`);
  assertRuntime(
    returnedMenu.menu?.scene === "menu"
      && returnedMenu.menu.selectedId === "play"
      && returnedMenu.levelSelectSmokeApiRemoved,
    "Escape did not return cleanly from Level Select to the menu",
    returnedMenu,
  );

  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("ArrowDown", "ArrowDown", 40);
  const settingsMenuChoice = await evaluate(
    protocol,
    "globalThis.__syntaxErrorMenuSmoke.getState()",
  );
  assertRuntime(
    settingsMenuChoice.selectedId === "settings",
    "Keyboard navigation did not select Settings",
    settingsMenuChoice,
  );

  await pressKey("Enter", "Enter", 13);
  await delay(150);
  const initialSettings = await evaluate(protocol, `({
    state: globalThis.__syntaxErrorSettingsSmoke?.getState(),
    menuSmokeApiRemoved: !globalThis.__syntaxErrorMenuSmoke,
  })`);
  assertRuntime(
    initialSettings.state?.scene === "settings"
      && initialSettings.state.origin === "menu"
      && initialSettings.state.selectedId === "music"
      && initialSettings.state.values.musicVolume === 0.5
      && initialSettings.state.values.sfxVolume === 0.7
      && initialSettings.state.values.theme === "terminal"
      && initialSettings.state.themeName === "Terminal Retro"
      && initialSettings.state.themes.length === 5
      && initialSettings.menuSmokeApiRemoved,
    "Settings did not show the required current values and themes",
    initialSettings,
  );

  await pressKey("ArrowRight", "ArrowRight", 39);
  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("ArrowRight", "ArrowRight", 39);
  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("ArrowRight", "ArrowRight", 39);
  const changedSettings = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSettingsSmoke.getState()",
  );
  assertRuntime(
    changedSettings.selectedId === "theme"
      && changedSettings.values.musicVolume === 0.6
      && changedSettings.values.sfxVolume === 0.8
      && changedSettings.values.theme === "dark"
      && changedSettings.themeName === "IDE Dark"
      && changedSettings.renderedValues.music.includes("0.6")
      && changedSettings.renderedValues.sfx.includes("0.8")
      && changedSettings.renderedValues.theme.includes("IDE Dark"),
    "Settings changes were not applied and rendered immediately",
    changedSettings,
  );

  await pressKey("Escape", "Escape", 27);
  await delay(150);
  const returnedFromSettings = await evaluate(protocol, `({
    menu: globalThis.__syntaxErrorMenuSmoke?.getState(),
    settingsSmokeApiRemoved: !globalThis.__syntaxErrorSettingsSmoke,
  })`);
  assertRuntime(
    returnedFromSettings.menu?.scene === "menu"
      && returnedFromSettings.menu.selectedId === "play"
      && returnedFromSettings.settingsSmokeApiRemoved,
    "Escape did not return cleanly from Settings to its origin",
    returnedFromSettings,
  );

  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("Enter", "Enter", 13);
  await delay(150);
  const levelOneChoice = await evaluate(
    protocol,
    "globalThis.__syntaxErrorLevelSelectSmoke.getState()",
  );
  assertRuntime(
    levelOneChoice.selectedId === 1
      && levelOneChoice.levels[0].selectable,
    "Level 1 was not selectable after returning to Level Select",
    levelOneChoice,
  );

  await pressKey("Enter", "Enter", 13);
  await delay(150);
  const transitionState = await evaluate(protocol, `({
    gameplaySmokeApiReady: Boolean(globalThis.__syntaxErrorSmoke),
    menuSmokeApiRemoved: !globalThis.__syntaxErrorMenuSmoke,
    levelSelectSmokeApiRemoved: !globalThis.__syntaxErrorLevelSelectSmoke,
  })`);
  assertRuntime(
    transitionState.gameplaySmokeApiReady
      && transitionState.menuSmokeApiRemoved
      && transitionState.levelSelectSmokeApiRemoved,
    "Selecting Level 1 did not transition cleanly to gameplay",
    transitionState,
  );

  const sessionBeforeRestart = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState().sessionId",
  );
  await evaluate(protocol, `(() => {
    const api = globalThis.__syntaxErrorSmoke;
    api.reset();
    api.activate();
    api.finish();
  })()`);
  await pressKey("Escape", "Escape", 27);
  const pausedStart = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    pausedStart.pause.mode === "paused"
      && pausedStart.pause.gameplayPaused
      && pausedStart.gameplayRootPaused
      && pausedStart.pause.options.map((option) => option.label).join("|")
        === "Continuar|Reiniciar nivel|Configuración|Volver al Menú"
      && pausedStart.cooldownRemaining > 0,
    "Escape did not pause the complete gameplay root",
    pausedStart,
  );

  await delay(300);
  const pausedFrozen = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    pausedFrozen.x === pausedStart.x
      && pausedFrozen.y === pausedStart.y
      && pausedFrozen.velX === pausedStart.velX
      && pausedFrozen.velY === pausedStart.velY
      && pausedFrozen.cooldownRemaining === pausedStart.cooldownRemaining
      && pausedFrozen.death.deathRemaining === pausedStart.death.deathRemaining,
    "Gameplay position, physics, or timers advanced while paused",
    { pausedStart, pausedFrozen },
  );

  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("Enter", "Enter", 13);
  const pauseSettings = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    pauseSettings.pause.mode === "settings"
      && pauseSettings.pause.gameplayPaused
      && pauseSettings.settings.theme === "dark"
      && !globalThis.__syntaxErrorSettingsSmoke,
    "Pause settings did not open as an in-scene overlay",
    pauseSettings,
  );

  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("ArrowRight", "ArrowRight", 39);
  const themedWhilePaused = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    themedWhilePaused.pause.mode === "settings"
      && themedWhilePaused.theme === "light"
      && themedWhilePaused.settings.theme === "light"
      && themedWhilePaused.color.r === 0
      && themedWhilePaused.color.g === 0
      && themedWhilePaused.color.b === 255
      && themedWhilePaused.x === pausedStart.x
      && themedWhilePaused.y === pausedStart.y
      && themedWhilePaused.cooldownRemaining === pausedStart.cooldownRemaining,
    "Pause settings did not apply theme immediately without mutating gameplay",
    { pausedStart, themedWhilePaused },
  );

  await pressKey("Escape", "Escape", 27);
  const returnedToPause = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    returnedToPause.pause.mode === "paused"
      && returnedToPause.pause.selectedId === "settings"
      && returnedToPause.pause.gameplayPaused,
    "Settings overlay did not return to the same paused state",
    returnedToPause,
  );
  await pressKey("Escape", "Escape", 27);
  const resumedState = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    resumedState.pause.mode === "running"
      && !resumedState.gameplayRootPaused
      && resumedState.x === pausedStart.x
      && resumedState.y === pausedStart.y,
    "Continue did not resume the exact gameplay scene",
    { pausedStart, resumedState },
  );
  await evaluate(protocol, "globalThis.__syntaxErrorSmoke.reset()");

  await evaluate(protocol, `(() => {
    const api = globalThis.__syntaxErrorSmoke;
    api.setCheckpoint({ x: 250, y: 516 });
    api.setWarnings(6);
    api.setPlayerState({ x: 250, y: 516, velX: 120, velY: -200 });
  })()`);
  await pressKey("Escape", "Escape", 27);
  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("Enter", "Enter", 13);
  await delay(250);
  const restartedState = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    restartedState.sessionId !== sessionBeforeRestart
      && restartedState.pause.mode === "running"
      && restartedState.x === 200
      && restartedState.y === 656
      && restartedState.velocityX === 0
      && restartedState.velY === 0
      && restartedState.warnings === 0
      && restartedState.checkpoint.lastCheckpoint.x === 200
      && restartedState.checkpoint.lastCheckpoint.y === 656
      && restartedState.death.deathCount === 0
      && restartedState.theme === "light",
    "Restart Level did not create clean gameplay at the initial spawn",
    restartedState,
  );

  await evaluate(protocol, `(() => {
    const api = globalThis.__syntaxErrorSmoke;
    api.setCheckpoint({ x: 250, y: 516 });
    api.setWarnings(4);
    api.moveToLethal();
  })()`);
  await delay(100);
  const lethalDeath = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    lethalDeath.death.state === "dying"
      && lethalDeath.death.deathSource === "lethal"
      && lethalDeath.death.deathCount === 1
      && lethalDeath.death.feedbackVisible,
    "Lethal obstacle did not start one death transition",
    lethalDeath,
  );
  const reentrantDeath = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.requestDeath('duplicate')",
  );
  assertRuntime(!reentrantDeath, "Death transition accepted a reentrant request");

  await delay(250);
  const lethalRespawn = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    lethalRespawn.death.state === "invulnerable"
      && lethalRespawn.death.blinking
      && lethalRespawn.x === 250
      && lethalRespawn.y === 516
      && lethalRespawn.velocityX === 0
      && lethalRespawn.velX === 0
      && lethalRespawn.velY === 0
      && lethalRespawn.warnings === 0
      && lethalRespawn.canActivate
      && lethalRespawn.cooldownRemaining === 0
      && !lethalRespawn.isCommented,
    "Respawn did not restore checkpoint defaults and invulnerability",
    lethalRespawn,
  );
  const invulnerableDeath = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.requestDeath('lethal')",
  );
  assertRuntime(!invulnerableDeath, "Invulnerability accepted lethal damage");

  await delay(1050);
  const vulnerableAgain = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    vulnerableAgain.death.state === "alive"
      && !vulnerableAgain.death.blinking
      && vulnerableAgain.opacity === 1,
    "One-second invulnerability did not end cleanly",
    vulnerableAgain,
  );

  await evaluate(protocol, "globalThis.__syntaxErrorSmoke.crossKillPlane()");
  await delay(75);
  const killPlaneDeath = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    killPlaneDeath.death.state === "dying"
      && killPlaneDeath.death.deathSource === "kill-plane"
      && killPlaneDeath.death.deathCount === 2,
    "Crossing the kill-plane did not start a new death",
    killPlaneDeath,
  );
  await delay(250);
  const killPlaneRespawn = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    killPlaneRespawn.death.state === "invulnerable"
      && killPlaneRespawn.x === 250
      && killPlaneRespawn.y === 516,
    "Kill-plane death did not respawn at the last checkpoint within 500ms",
    killPlaneRespawn,
  );
  await delay(1050);

  const baseline = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    baseline.collider.width === 20 && baseline.collider.height === 48,
    "Player must start with a fixed 20x48 collider",
    baseline,
  );

  const activation = await evaluate(protocol, `(() => {
    const accepted = globalThis.__syntaxErrorSmoke.activate();
    return { accepted, state: globalThis.__syntaxErrorSmoke.getState() };
  })()`);
  assertRuntime(
    activation.accepted
      && activation.state.isCommented
      && activation.state.text === "// ;"
      && activation.state.opacity === 0.5
      && activation.state.color.r === activation.state.color.g
      && activation.state.color.g === activation.state.color.b
      && activation.state.collisionIgnore.includes("platform")
      && activation.state.gravityScale === 1,
    "Comment activation did not apply the required state",
    activation,
  );

  await delay(200);
  const falling = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    falling.isCommented
      && falling.y > baseline.y + 1
      && falling.velY > 0
      && falling.gravityScale === 1
      && falling.overlappingPlatforms > 0,
    "Player did not fall through a solid platform under gravity",
    { baseline, falling },
  );

  await delay(450);
  const expired = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.getState()",
  );
  assertRuntime(
    !expired.isCommented
      && expired.cooldownRemaining > 0
      && expired.cooldownRemaining <= 2
      && expired.text === ";"
      && expired.opacity === 1
      && !expired.collisionIgnore.includes("platform")
      && expired.indicatorVisible
      && expired.indicatorWidth > 0
      && expired.indicatorWidth <= 30
      && expired.collider.width === baseline.collider.width
      && expired.collider.height === baseline.collider.height,
    "Comment expiration did not restore collisions, visuals, and collider",
    expired,
  );

  const rejected = await evaluate(protocol, `(() => ({
    accepted: globalThis.__syntaxErrorSmoke.activate(),
    state: globalThis.__syntaxErrorSmoke.getState(),
  }))()`);
  assertRuntime(
    !rejected.accepted && !rejected.state.isCommented,
    "Activation was accepted during cooldown",
    rejected,
  );

  const cancelled = await evaluate(protocol, `(() => {
    const api = globalThis.__syntaxErrorSmoke;
    api.reset();
    api.setPlayerState({ x: 200, y: 600, velY: 0 });
    api.activate();
    api.cancelForDeath();
    return api.getState();
  })()`);
  assertRuntime(
    !cancelled.isCommented
      && cancelled.cooldownRemaining === 0
      && cancelled.canActivate
      && !cancelled.collisionIgnore.includes("platform")
      && !cancelled.indicatorVisible,
    "Death cancellation started cooldown or left stale state",
    cancelled,
  );

  await evaluate(protocol, `(() => {
    const api = globalThis.__syntaxErrorSmoke;
    api.reset();
    api.activate();
    api.setPlayerState({ x: 200, y: 550, velY: 0 });
  })()`);
  // KAPLAY updates worldArea() from the scene transform on the next frame.
  // Keep Comment Code active during that synchronization so physics cannot
  // eject the deliberately embedded player before the ability resolves it.
  await delay(50);
  const finishedOverlap = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.finish()",
  );
  await delay(50);
  const resolved = {
    finished: finishedOverlap,
    state: await evaluate(
      protocol,
      "globalThis.__syntaxErrorSmoke.getState()",
    ),
  };
  assertRuntime(
    resolved.finished
      && resolved.state.y < 540
      && resolved.state.velY === 0
      && resolved.state.overlappingPlatforms === 0
      && !resolved.state.collisionIgnore.includes("platform")
      && resolved.state.indicatorVisible,
    "Overlap resolution did not place the player safely above the platform",
    resolved,
  );

  const destruction = await evaluate(
    protocol,
    "globalThis.__syntaxErrorSmoke.destroyPlayer()",
  );
  assertRuntime(
    !destruction.playerExists && !destruction.indicatorExists,
    "Cooldown indicator survived player destruction",
    destruction,
  );

  await pressKey("Escape", "Escape", 27);
  await pressKey("ArrowUp", "ArrowUp", 38);
  await pressKey("Enter", "Enter", 13);
  await delay(150);
  const menuAfterGameplay = await evaluate(protocol, `({
    menu: globalThis.__syntaxErrorMenuSmoke?.getState(),
    gameplaySmokeApiRemoved: !globalThis.__syntaxErrorSmoke,
  })`);
  assertRuntime(
    menuAfterGameplay.menu?.scene === "menu"
      && menuAfterGameplay.gameplaySmokeApiRemoved,
    "Volver al Menú did not clean the gameplay scene",
    menuAfterGameplay,
  );

  if (protocol.exceptions.length > 0 || protocol.consoleErrors.length > 0) {
    throw new Error([
      ...protocol.exceptions,
      ...protocol.consoleErrors,
    ].join("\n"));
  }

  console.log(
    `Runtime smoke passed: ${pageState.canvasCount} canvas, `
      + `${pageState.canvasWidth}x${pageState.canvasHeight}; `
      + "Menu, Level Select, Settings, pause freeze/continue, in-scene settings, "
      + "restart, lethal and kill-plane respawn, invulnerability, Comment Code, "
      + "and gameplay cleanup verified; no JavaScript exceptions",
  );
} finally {
  if (protocol?.socket?.readyState === WebSocket.OPEN) {
    try {
      await protocol.send("Browser.close");
    } catch {
      protocol.socket.close();
    }
  }

  if (browser && browser.exitCode === null) {
    browser.kill();
  }

  if (server) {
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  if (profileDirectory) {
    rmSync(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}
