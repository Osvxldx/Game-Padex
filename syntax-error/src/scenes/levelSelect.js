import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants.js";

export const LEVEL_SELECT_SCENE = "levelSelect";
export const LOCKED_LEVEL_MESSAGE_DURATION = 2;

export const LEVELS = Object.freeze([
  Object.freeze({ id: 1, name: "Garbage Collector" }),
  Object.freeze({ id: 2, name: "Merge Conflict" }),
  Object.freeze({ id: 3, name: "Stack Overflow" }),
  Object.freeze({ id: 4, name: "Warning Fatigue" }),
  Object.freeze({ id: 5, name: "Production" }),
]);

export const DEFAULT_LEVEL_PROGRESS = Object.freeze({
  levelsCompleted: Object.freeze([false, false, false, false, false]),
});

export const LEVEL_SELECT_KEY_GROUPS = Object.freeze({
  previous: Object.freeze(["left", "up", "a", "w"]),
  next: Object.freeze(["right", "down", "d", "s"]),
  confirm: Object.freeze(["enter", "space"]),
  back: Object.freeze(["escape", "backspace"]),
});

const LEVEL_VISUALS = Object.freeze({
  completed: Object.freeze({
    label: "COMPLETADO",
    cardColor: Object.freeze([28, 93, 58]),
    selectedCardColor: Object.freeze([36, 130, 75]),
    statusColor: Object.freeze([63, 185, 80]),
  }),
  unlocked: Object.freeze({
    label: "DESBLOQUEADO",
    cardColor: Object.freeze([31, 70, 112]),
    selectedCardColor: Object.freeze([40, 104, 168]),
    statusColor: Object.freeze([88, 166, 255]),
  }),
  locked: Object.freeze({
    label: "BLOQUEADO",
    cardColor: Object.freeze([55, 59, 67]),
    selectedCardColor: Object.freeze([82, 87, 99]),
    statusColor: Object.freeze([248, 81, 73]),
  }),
});

export function normalizeCompletedLevels(progress) {
  const candidate = Array.isArray(progress)
    ? progress
    : progress?.levelsCompleted;

  return LEVELS.map((_, index) => candidate?.[index] === true);
}

/**
 * Reads the future SaveManager-compatible progress contract safely.
 * The provider must return `{ levelsCompleted: boolean[5] }`.
 */
export function readLevelProgress(progressProvider) {
  if (typeof progressProvider !== "function") {
    return normalizeCompletedLevels(DEFAULT_LEVEL_PROGRESS);
  }

  try {
    return normalizeCompletedLevels(progressProvider());
  } catch {
    return normalizeCompletedLevels(DEFAULT_LEVEL_PROGRESS);
  }
}

export function deriveLevelStates(progress = DEFAULT_LEVEL_PROGRESS) {
  const levelsCompleted = normalizeCompletedLevels(progress);

  return LEVELS.map((definition, index) => {
    const state = levelsCompleted[index]
      ? "completed"
      : index === 0 || levelsCompleted[index - 1]
        ? "unlocked"
        : "locked";

    return Object.freeze({
      ...definition,
      state,
      selectable: state !== "locked",
    });
  });
}

export function getLevelVisual(state, selected = false) {
  const visual = LEVEL_VISUALS[state];
  if (!visual) throw new RangeError(`Unknown level state: ${state}`);

  return Object.freeze({
    label: visual.label,
    cardColor: selected ? visual.selectedCardColor : visual.cardColor,
    statusColor: visual.statusColor,
  });
}

export function moveLevelSelection(currentIndex, direction, levelCount = LEVELS.length) {
  if (!Number.isInteger(levelCount) || levelCount <= 0) {
    throw new RangeError("levelCount must be a positive integer");
  }

  const normalizedIndex = ((Math.trunc(currentIndex) % levelCount) + levelCount)
    % levelCount;
  if (direction === 0) return normalizedIndex;

  return (normalizedIndex + Math.sign(direction) + levelCount) % levelCount;
}

export function levelSelectCommandFromPressedKeys(pressedKeys) {
  const pressed = pressedKeys instanceof Set
    ? pressedKeys
    : new Set(pressedKeys);

  for (const command of ["previous", "next", "confirm", "back"]) {
    if (LEVEL_SELECT_KEY_GROUPS[command].some((key) => pressed.has(key))) {
      return command;
    }
  }

  return null;
}

export function resolveLevelSelection(levels, selectedIndex) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new TypeError("levels must be a non-empty array");
  }
  if (!Number.isInteger(selectedIndex) || !levels[selectedIndex]) {
    throw new RangeError("selectedIndex must reference an existing level");
  }

  const level = levels[selectedIndex];
  if (level.selectable) {
    return Object.freeze({ kind: "selected", level });
  }

  return Object.freeze({
    kind: "locked",
    level,
    message: `Completa el Nivel ${level.id - 1} para desbloquearlo`,
    duration: LOCKED_LEVEL_MESSAGE_DURATION,
  });
}

export function tickLevelFeedback(feedback, deltaSeconds) {
  if (feedback === null) return null;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError("deltaSeconds must be a finite non-negative number");
  }

  const remaining = Math.max(0, feedback.remaining - deltaSeconds);
  if (remaining === 0) return null;
  return Object.freeze({ ...feedback, remaining });
}

export function createLevelSelectModel(progress = DEFAULT_LEVEL_PROGRESS) {
  const levels = deriveLevelStates(progress);
  let selectedIndex = 0;
  let feedback = null;

  return {
    levels,
    get selectedIndex() {
      return selectedIndex;
    },
    get selectedLevel() {
      return levels[selectedIndex];
    },
    get feedback() {
      return feedback;
    },
    move(direction) {
      selectedIndex = moveLevelSelection(selectedIndex, direction, levels.length);
      return levels[selectedIndex];
    },
    select() {
      const result = resolveLevelSelection(levels, selectedIndex);
      feedback = result.kind === "locked"
        ? Object.freeze({
          message: result.message,
          remaining: result.duration,
        })
        : null;
      return result;
    },
    showFeedback(message, duration = LOCKED_LEVEL_MESSAGE_DURATION) {
      if (typeof message !== "string" || message.length === 0) {
        throw new TypeError("message must be a non-empty string");
      }
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new RangeError("duration must be a positive finite number");
      }
      feedback = Object.freeze({ message, remaining: duration });
      return feedback;
    },
    tick(deltaSeconds) {
      feedback = tickLevelFeedback(feedback, deltaSeconds);
      return feedback;
    },
  };
}

function installLevelSelectSmokeApi(model) {
  if (typeof window === "undefined") return () => {};
  const params = new URLSearchParams(window.location.search);
  if (!params.has("smoke")) return () => {};

  const api = {
    getState: () => ({
      scene: LEVEL_SELECT_SCENE,
      selectedIndex: model.selectedIndex,
      selectedId: model.selectedLevel.id,
      levels: model.levels.map(({ id, name, state, selectable }) => ({
        id,
        name,
        state,
        selectable,
      })),
      feedback: model.feedback
        ? { visible: true, ...model.feedback }
        : { visible: false, message: "", remaining: 0 },
    }),
  };
  globalThis.__syntaxErrorLevelSelectSmoke = api;

  return () => {
    if (globalThis.__syntaxErrorLevelSelectSmoke === api) {
      delete globalThis.__syntaxErrorLevelSelectSmoke;
    }
  };
}

/**
 * Registers the level selection scene without owning persistence or gameplay.
 * `progressProvider` supplies a snapshot and callbacks own scene transitions.
 */
export function registerLevelSelectScene(k, {
  sceneName = LEVEL_SELECT_SCENE,
  progressProvider = () => DEFAULT_LEVEL_PROGRESS,
  onSelectLevel,
  onBack,
} = {}) {
  k.scene(sceneName, () => {
    const model = createLevelSelectModel(readLevelProgress(progressProvider));

    k.add([
      k.rect(CANVAS_WIDTH, CANVAS_HEIGHT),
      k.pos(0, 0),
      k.anchor("topleft"),
      k.color(13, 17, 23),
    ]);

    k.add([
      k.text("SELECCIÓN DE NIVEL", { size: 48 }),
      k.pos(CANVAS_WIDTH / 2, 90),
      k.anchor("center"),
      k.color(63, 185, 80),
    ]);

    k.add([
      k.text("Elige un nivel disponible", { size: 20 }),
      k.pos(CANVAS_WIDTH / 2, 140),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    const cardWidth = 210;
    const cardHeight = 265;
    const cardGap = 20;
    const cardsWidth = LEVELS.length * cardWidth + (LEVELS.length - 1) * cardGap;
    const firstCardX = (CANVAS_WIDTH - cardsWidth) / 2 + cardWidth / 2;
    const cardY = 335;

    const levelObjects = model.levels.map((level, index) => {
      const x = firstCardX + index * (cardWidth + cardGap);
      const card = k.add([
        k.rect(cardWidth, cardHeight, { radius: 8 }),
        k.pos(x, cardY),
        k.anchor("center"),
        k.color(55, 59, 67),
        k.opacity(0.9),
      ]);
      const number = k.add([
        k.text(`NIVEL ${level.id}`, { size: 24 }),
        k.pos(x, cardY - 82),
        k.anchor("center"),
        k.color(240, 246, 252),
      ]);
      const name = k.add([
        k.text(level.name, {
          size: 18,
          width: cardWidth - 24,
          align: "center",
        }),
        k.pos(x, cardY - 10),
        k.anchor("center"),
        k.color(201, 209, 217),
      ]);
      const status = k.add([
        k.text("", { size: 15 }),
        k.pos(x, cardY + 88),
        k.anchor("center"),
        k.color(139, 148, 158),
      ]);

      return { card, number, name, status };
    });

    const feedbackText = k.add([
      k.text("", { size: 22 }),
      k.pos(CANVAS_WIDTH / 2, 545),
      k.anchor("center"),
      k.color(248, 81, 73),
    ]);
    feedbackText.hidden = true;

    k.add([
      k.text(
        "Flechas o WASD: navegar · Enter/Espacio: jugar · Esc/Retroceso: menú",
        { size: 17 },
      ),
      k.pos(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 55),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    const renderSelection = () => {
      levelObjects.forEach((objects, index) => {
        const level = model.levels[index];
        const selected = index === model.selectedIndex;
        const visual = getLevelVisual(level.state, selected);

        objects.card.color = k.rgb(...visual.cardColor);
        objects.card.opacity = selected ? 1 : 0.82;
        objects.number.text = selected
          ? `> NIVEL ${level.id} <`
          : `NIVEL ${level.id}`;
        objects.number.color = selected
          ? k.rgb(240, 246, 252)
          : k.rgb(201, 209, 217);
        objects.name.color = selected
          ? k.rgb(240, 246, 252)
          : k.rgb(201, 209, 217);
        objects.status.text = visual.label;
        objects.status.color = k.rgb(...visual.statusColor);
      });
    };

    const renderFeedback = () => {
      feedbackText.hidden = !model.feedback;
      feedbackText.text = model.feedback?.message ?? "";
    };

    const confirmSelection = () => {
      const result = model.select();
      if (result.kind === "locked") {
        renderFeedback();
        return;
      }

      const transitioned = typeof onSelectLevel === "function"
        && onSelectLevel(result.level) !== false;
      if (!transitioned) {
        model.showFeedback(`Nivel ${result.level.id}: ruta aún no disponible`);
        renderFeedback();
      }
    };

    renderSelection();
    const uninstallSmokeApi = installLevelSelectSmokeApi(model);

    k.add([{
      id: "level-select-input-controller",
      update() {
        const feedbackWasVisible = Boolean(model.feedback);
        model.tick(k.dt());
        if (feedbackWasVisible && !model.feedback) renderFeedback();

        const pressedKeys = Object.values(LEVEL_SELECT_KEY_GROUPS)
          .flat()
          .filter((key) => k.isKeyPressed(key));
        const command = levelSelectCommandFromPressedKeys(pressedKeys);

        if (command === "previous") {
          model.move(-1);
          renderSelection();
        } else if (command === "next") {
          model.move(1);
          renderSelection();
        } else if (command === "confirm") {
          confirmSelection();
        } else if (command === "back" && typeof onBack === "function") {
          onBack();
        }
      },
      destroy() {
        uninstallSmokeApi();
      },
    }, "level-select-input-controller"]);
  });

  return sceneName;
}
