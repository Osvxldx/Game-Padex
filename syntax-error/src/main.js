import kaplay from "kaplay";
import { CANVAS_HEIGHT, CANVAS_WIDTH, GRAVITY } from "./constants.js";
import { LEVEL_SELECT_SCENE, registerLevelSelectScene } from "./scenes/levelSelect.js";
import { MENU_SCENE, registerMenuScene } from "./scenes/menu.js";
import {
  SETTINGS_SCENE,
  createMemorySettingsStore,
  createSettingsContract,
  registerSettingsScene,
} from "./scenes/settings.js";
import { TEST_LEVEL_SCENE, registerTestLevelScene } from "./scenes/testLevel.js";

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

registerLevelSelectScene(k, {
  onSelectLevel: (level) => {
    if (level.id !== 1) return false;
    k.go(TEST_LEVEL_SCENE);
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
    play: () => k.go(TEST_LEVEL_SCENE),
    levelSelect: () => k.go(LEVEL_SELECT_SCENE),
    settings: () => k.go(SETTINGS_SCENE, { origin: MENU_SCENE }),
  },
});

k.go(MENU_SCENE);
