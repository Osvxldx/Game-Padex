import kaplay from "kaplay";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GRAVITY } from "./constants.js";
import { LEVEL_SELECT_SCENE, registerLevelSelectScene } from "./scenes/levelSelect.js";
import { MENU_SCENE, registerMenuScene } from "./scenes/menu.js";
import {
  SETTINGS_SCENE,
  createSettingsContract,
  registerSettingsScene,
} from "./scenes/settings.js";
import { TEST_LEVEL_SCENE, registerTestLevelScene } from "./scenes/testLevel.js";
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

const goToLevelOne = () => {
  audioManager.crossfadeTo(1);
  k.go(TEST_LEVEL_SCENE);
};

registerTestLevelScene(k, {
  settingsContract,
  audioManager,
  onMenu: () => goToMenu(),
});

registerLevelSelectScene(k, {
  onSelectLevel: (level) => {
    if (level.id !== 1) return false;
    goToLevelOne();
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
    play: goToLevelOne,
    levelSelect: () => k.go(LEVEL_SELECT_SCENE),
    settings: () => k.go(SETTINGS_SCENE, { origin: MENU_SCENE }),
  },
});

audioManager.playMusic("menu");
k.go(MENU_SCENE);
