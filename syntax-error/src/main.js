import kaplay from "kaplay";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GRAVITY } from "./constants.js";
import {
  GAME_SCENE,
  firstIncompleteLevelId,
  registerGameScene,
} from "./scenes/game.js";
import { LEVEL_SELECT_SCENE, registerLevelSelectScene } from "./scenes/levelSelect.js";
import { MENU_SCENE, registerMenuScene } from "./scenes/menu.js";
import {
  SETTINGS_SCENE,
  createSettingsContract,
  registerSettingsScene,
} from "./scenes/settings.js";
import { registerTestLevelScene } from "./scenes/testLevel.js";
import audioManager, { DEFAULT_CROSSFADE_SECONDS } from "./systems/audioManager.js";
import saveManager from "./systems/saveManager.js";
import themeManager from "./systems/themeManager.js";

const k = kaplay({
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  background: [13, 17, 23],
  global: false,
  stretch: true,
  letterbox: true,
});

k.setGravity(GRAVITY);

// Settings read their persisted values before rendering and synchronously apply
// manager changes, so the active scene never needs to be reconstructed.
const settingsContract = createSettingsContract({
  valuesProvider: () => saveManager.getState(),
  onMusicVolumeChange: (value) => audioManager.setMusicVolume(value),
  onSfxVolumeChange: (value) => audioManager.setSfxVolume(value),
  onThemeChange: (theme) => themeManager.applyTheme(theme),
});

const goToMenu = (context) => {
  audioManager.crossfadeTo("menu");
  k.go(MENU_SCENE, context);
};

registerTestLevelScene(k, {
  settingsContract,
  audioManager,
  onMenu: () => goToMenu(),
});

registerGameScene(k, {
  settingsContract,
  audioManager,
  onMenu: () => goToMenu(),
  onLevelComplete: (levelId) => {
    // SaveManager uses 0-based level indices and enforces sequential progression.
    if (Number.isInteger(levelId) && levelId >= 1) {
      saveManager.completeLevel(levelId - 1);
    }
  },
});

registerLevelSelectScene(k, {
  progressProvider: () => saveManager.getState(),
  onSelectLevel: (level) => {
    audioManager.crossfadeTo(level.id);
    k.go(GAME_SCENE, { levelId: level.id });
    return true;
  },
  onBack: () => goToMenu(),
});

registerSettingsScene(k, {
  settingsProvider: settingsContract.readValues,
  onMusicVolumeChange: settingsContract.setMusicVolume,
  onSfxVolumeChange: settingsContract.setSfxVolume,
  onThemeChange: settingsContract.setTheme,
  onBack: ({ origin, returnContext }) => {
    if (origin === MENU_SCENE) audioManager.crossfadeTo("menu");
    k.go(origin, returnContext);
  },
});

registerMenuScene(k, {
  routes: {
    play: () => {
      const levelId = firstIncompleteLevelId(saveManager.getState());
      audioManager.crossfadeTo(levelId);
      k.go(GAME_SCENE, { levelId });
    },
    levelSelect: () => k.go(LEVEL_SELECT_SCENE),
    settings: () => k.go(SETTINGS_SCENE, { origin: MENU_SCENE }),
  },
});

// Smoke-only observability for cross-scene concerns that no single scene owns:
// music crossfade intent and the canvas/viewport contract.
if (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("smoke")) {
  globalThis.__syntaxErrorAppSmoke = Object.freeze({
    getAudioState: () => ({
      currentMusic: audioManager.currentMusic,
      desiredMusic: audioManager.desiredMusic,
      autoplayBlocked: audioManager.autoplayBlocked,
      failedResources: audioManager.failedResources,
      musicVolume: audioManager.musicVolume,
      sfxVolume: audioManager.sfxVolume,
      crossfadeSeconds: DEFAULT_CROSSFADE_SECONDS,
    }),
    getViewportState: () => {
      const canvas = document.querySelector("canvas");
      const rect = canvas?.getBoundingClientRect();
      return {
        // Logical resolution stays fixed so gameplay coordinates never depend
        // on the window size; only the presented canvas scales.
        logical: { width: k.width(), height: k.height() },
        designed: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
        canvas: canvas
          ? { width: Math.round(rect.width), height: Math.round(rect.height) }
          : null,
        window: { width: window.innerWidth, height: window.innerHeight },
      };
    },
    setTheme: (theme) => settingsContract.setTheme(theme),
    readSettings: () => settingsContract.readValues(),
  });
}

audioManager.playMusic("menu");
k.go(MENU_SCENE);
