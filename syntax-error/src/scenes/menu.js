import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants.js";

export const MENU_SCENE = "menu";

export const MENU_OPTIONS = Object.freeze([
  Object.freeze({ id: "play", label: "Jugar" }),
  Object.freeze({ id: "levelSelect", label: "Selección de Nivel" }),
  Object.freeze({ id: "settings", label: "Configuración" }),
]);

export const MENU_KEY_GROUPS = Object.freeze({
  previous: Object.freeze(["up", "w"]),
  next: Object.freeze(["down", "s"]),
  confirm: Object.freeze(["enter", "space"]),
});

export function moveMenuSelection(currentIndex, direction, optionCount) {
  if (!Number.isInteger(optionCount) || optionCount <= 0) {
    throw new RangeError("optionCount must be a positive integer");
  }

  const normalizedIndex = ((Math.trunc(currentIndex) % optionCount) + optionCount)
    % optionCount;
  if (direction === 0) return normalizedIndex;

  return (normalizedIndex + Math.sign(direction) + optionCount) % optionCount;
}

export function menuCommandFromPressedKeys(pressedKeys) {
  const pressed = pressedKeys instanceof Set
    ? pressedKeys
    : new Set(pressedKeys);

  for (const command of ["previous", "next", "confirm"]) {
    if (MENU_KEY_GROUPS[command].some((key) => pressed.has(key))) {
      return command;
    }
  }

  return null;
}

export function createMenuModel(options = MENU_OPTIONS) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new TypeError("Menu options must be a non-empty array");
  }

  let selectedIndex = 0;

  return {
    get selectedIndex() {
      return selectedIndex;
    },
    get selectedOption() {
      return options[selectedIndex];
    },
    move(direction) {
      selectedIndex = moveMenuSelection(
        selectedIndex,
        direction,
        options.length,
      );
      return options[selectedIndex];
    },
    select(routes = {}) {
      const option = options[selectedIndex];
      const route = routes[option.id];
      if (typeof route !== "function") {
        return { option, transitioned: false };
      }

      route(option);
      return { option, transitioned: true };
    },
  };
}

function installMenuSmokeApi(model) {
  if (typeof window === "undefined") return () => {};
  const params = new URLSearchParams(window.location.search);
  if (!params.has("smoke")) return () => {};

  const api = {
    getState: () => ({
      scene: MENU_SCENE,
      options: MENU_OPTIONS.map(({ id, label }) => ({ id, label })),
      selectedIndex: model.selectedIndex,
      selectedId: model.selectedOption.id,
      selectedLabel: model.selectedOption.label,
    }),
  };
  globalThis.__syntaxErrorMenuSmoke = api;

  return () => {
    if (globalThis.__syntaxErrorMenuSmoke === api) {
      delete globalThis.__syntaxErrorMenuSmoke;
    }
  };
}

/**
 * Registers the main menu without owning any destination scenes.
 * Route callbacks are injected so later scene tasks can register their own
 * scene names before wiring them here. Missing routes show feedback instead
 * of attempting to enter an unregistered KAPLAY scene.
 */
export function registerMenuScene(k, {
  sceneName = MENU_SCENE,
  routes = {},
} = {}) {
  k.scene(sceneName, () => {
    const model = createMenuModel();

    k.add([
      k.rect(CANVAS_WIDTH, CANVAS_HEIGHT),
      k.pos(0, 0),
      k.anchor("topleft"),
      k.color(13, 17, 23),
    ]);

    k.add([
      k.text("SYNTAX ERROR", { size: 72 }),
      k.pos(CANVAS_WIDTH / 2, 135),
      k.anchor("center"),
      k.color(63, 185, 80),
    ]);

    k.add([
      k.text("// el bug también eres tú", { size: 22 }),
      k.pos(CANVAS_WIDTH / 2, 195),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    const optionObjects = MENU_OPTIONS.map((option, index) => k.add([
      k.text(option.label, { size: 34 }),
      k.pos(CANVAS_WIDTH / 2, 310 + index * 72),
      k.anchor("center"),
      k.color(201, 209, 217),
    ]));

    const status = k.add([
      k.text("Flechas o W/S para navegar · Enter o Espacio para confirmar", {
        size: 18,
      }),
      k.pos(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 75),
      k.anchor("center"),
      k.color(139, 148, 158),
    ]);

    const renderSelection = () => {
      optionObjects.forEach((object, index) => {
        const selected = index === model.selectedIndex;
        object.text = selected
          ? `> ${MENU_OPTIONS[index].label} <`
          : MENU_OPTIONS[index].label;
        object.color = selected
          ? k.rgb(88, 166, 255)
          : k.rgb(201, 209, 217);
      });
    };

    const confirmSelection = () => {
      const result = model.select(routes);
      if (!result.transitioned) {
        status.text = `${result.option.label}: ruta aún no disponible`;
        status.color = k.rgb(227, 179, 65);
      }
    };

    renderSelection();
    const uninstallSmokeApi = installMenuSmokeApi(model);

    k.add([{
      id: "menu-input-controller",
      update() {
        const pressedKeys = Object.values(MENU_KEY_GROUPS)
          .flat()
          .filter((key) => k.isKeyPressed(key));
        const command = menuCommandFromPressedKeys(pressedKeys);

        if (command === "previous") {
          model.move(-1);
          renderSelection();
        } else if (command === "next") {
          model.move(1);
          renderSelection();
        } else if (command === "confirm") {
          confirmSelection();
        }
      },
      destroy() {
        uninstallSmokeApi();
      },
    }, "menu-input-controller"]);
  });

  return sceneName;
}
