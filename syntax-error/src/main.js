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
import audioManager from "./systems/audioManager.js";
import saveManager from "./systems/saveManager.js";
import themeManager from "./systems/themeManager.js";

const k = kaplay({
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  background: [13, 17, 23],
  global: false,
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

audioManager.playMusic("menu");
k.go(MENU_SCENE);
