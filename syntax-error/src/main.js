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
  createMemorySettingsStore,
  createSettingsContract,
  registerSettingsScene,
} from "./scenes/settings.js";
import { registerTestLevelScene } from "./scenes/testLevel.js";
import saveManager from "./systems/saveManager.js";

const k = kaplay({
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  background: [13, 17, 23],
  global: false,
});

k.setGravity(GRAVITY);

// Shared in-memory boundary until SaveManager/AudioManager/ThemeManager land.
// Both the full Settings scene and the pause overlay read and write this same
// contract synchronously, so changing configuration never rebuilds gameplay.
const settingsStore = createMemorySettingsStore();
const settingsContract = createSettingsContract({
  valuesProvider: settingsStore.getValues,
  onMusicVolumeChange: settingsStore.setMusicVolume,
  onSfxVolumeChange: settingsStore.setSfxVolume,
  onThemeChange: settingsStore.setTheme,
});

registerTestLevelScene(k, {
  settingsContract,
  onMenu: () => k.go(MENU_SCENE),
});

registerGameScene(k, {
  settingsContract,
  onMenu: () => k.go(MENU_SCENE),
});

registerLevelSelectScene(k, {
  progressProvider: () => saveManager.getState(),
  onSelectLevel: (level) => {
    k.go(GAME_SCENE, { levelId: level.id });
    return true;
  },
  onBack: () => k.go(MENU_SCENE),
});

registerSettingsScene(k, {
  settingsProvider: settingsContract.readValues,
  onMusicVolumeChange: settingsContract.setMusicVolume,
  onSfxVolumeChange: settingsContract.setSfxVolume,
  onThemeChange: settingsContract.setTheme,
  onBack: ({ origin, returnContext }) => k.go(origin, returnContext),
});

registerMenuScene(k, {
  routes: {
    play: () => k.go(GAME_SCENE, {
      levelId: firstIncompleteLevelId(saveManager.getState()),
    }),
    levelSelect: () => k.go(LEVEL_SELECT_SCENE),
    settings: () => k.go(SETTINGS_SCENE, { origin: MENU_SCENE }),
  },
});

k.go(MENU_SCENE);
