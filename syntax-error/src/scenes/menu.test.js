import assert from "node:assert/strict";
import test from "node:test";

import {
  MENU_OPTIONS,
  createMenuModel,
  menuCommandFromPressedKeys,
  moveMenuSelection,
} from "./menu.js";

// Validates: Requirements 13.1, 13.2
test("main menu exposes the three required destinations in display order", () => {
  assert.deepEqual(
    MENU_OPTIONS.map(({ id, label }) => ({ id, label })),
    [
      { id: "play", label: "Jugar" },
      { id: "levelSelect", label: "Selección de Nivel" },
      { id: "settings", label: "Configuración" },
    ],
  );
});

test("arrow and W/S keys navigate while Enter and Space confirm", () => {
  for (const key of ["up", "w"]) {
    assert.equal(menuCommandFromPressedKeys([key]), "previous");
  }
  for (const key of ["down", "s"]) {
    assert.equal(menuCommandFromPressedKeys([key]), "next");
  }
  for (const key of ["enter", "space"]) {
    assert.equal(menuCommandFromPressedKeys([key]), "confirm");
  }
  assert.equal(menuCommandFromPressedKeys([]), null);
});

test("selection wraps at both ends of the menu", () => {
  assert.equal(moveMenuSelection(0, -1, MENU_OPTIONS.length), 2);
  assert.equal(moveMenuSelection(2, 1, MENU_OPTIONS.length), 0);
  assert.equal(moveMenuSelection(1, 0, MENU_OPTIONS.length), 1);
});

test("menu model follows navigation and invokes only registered routes", () => {
  const transitions = [];
  const model = createMenuModel();

  assert.equal(model.selectedOption.id, "play");
  assert.equal(model.select({
    play: (option) => transitions.push(option.id),
  }).transitioned, true);
  assert.deepEqual(transitions, ["play"]);

  model.move(1);
  assert.equal(model.selectedOption.id, "levelSelect");
  assert.deepEqual(model.select({}), {
    option: MENU_OPTIONS[1],
    transitioned: false,
  });
  assert.deepEqual(transitions, ["play"]);

  model.move(1);
  assert.equal(model.selectedOption.id, "settings");
  model.move(1);
  assert.equal(model.selectedOption.id, "play");
});

test("menu rejects impossible option collections and counts", () => {
  assert.throws(() => createMenuModel([]), TypeError);
  assert.throws(() => moveMenuSelection(0, 1, 0), RangeError);
});
