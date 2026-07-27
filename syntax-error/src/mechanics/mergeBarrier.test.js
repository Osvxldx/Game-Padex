import assert from "node:assert/strict";
import test from "node:test";

import {
  attachMergeBarrierRuntime,
  createMergeBarrierMachine,
  validateMergeSections,
} from "./mergeBarrier.js";
import { attachLevelMechanics } from "./mechanicRegistry.js";

const validSections = () => [
  {
    id: "one",
    wallId: "wall-one",
    switches: [
      { id: "one-wrong", correct: false },
      { id: "one-right", correct: true },
    ],
  },
  {
    id: "two",
    wallId: "wall-two",
    switches: [
      { id: "two-wrong-a", correct: false },
      { id: "two-right", correct: true },
      { id: "two-wrong-b", correct: false },
    ],
  },
  {
    id: "three",
    wallId: "wall-three",
    switches: [
      { id: "three-wrong-a", correct: false },
      { id: "three-right", correct: true },
      { id: "three-wrong-b", correct: false },
      { id: "three-wrong-c", correct: false },
    ],
  },
];

// Validates: Requirements 6.6, 6.8
test("validates at least three sections with 2-4 switches and exactly one correct", () => {
  assert.equal(validateMergeSections(validSections(), { minimumSections: 3 }).length, 3);
  assert.throws(
    () => validateMergeSections(validSections().slice(0, 2), { minimumSections: 3 }),
    /at least 3 sections/,
  );
  assert.throws(
    () => validateMergeSections([{ ...validSections()[0], switches: [{ id: "only", correct: true }] }]),
    /between 2 and 4/,
  );
  assert.throws(
    () => validateMergeSections([{ ...validSections()[0], switches: [
      { id: "a", correct: false },
      { id: "b", correct: false },
    ] }]),
    /exactly one correct/,
  );
  assert.throws(
    () => validateMergeSections([{ ...validSections()[0], switches: [
      { id: "a", correct: true },
      { id: "b", correct: true },
    ] }]),
    /exactly one correct/,
  );
});

// Validates: Requirements 6.1, 6.2, 6.8
test("a correct switch opens only its corresponding wall", () => {
  const machine = createMergeBarrierMachine({ sections: validSections(), minimumSections: 3 });
  const result = machine.activateSwitch("two-right");
  const state = machine.getState();

  assert.deepEqual(result, {
    accepted: true,
    kind: "correct",
    switchId: "two-right",
    sectionId: "two",
    wallId: "wall-two",
    controlsInverted: false,
  });
  assert.deepEqual(state.sections.map(({ id, wallOpen }) => ({ id, wallOpen })), [
    { id: "one", wallOpen: false },
    { id: "two", wallOpen: true },
    { id: "three", wallOpen: false },
  ]);
  assert.equal(state.sections[1].feedback, "resolved");
});

// Validates: Requirements 6.3, 6.4, 6.7
test("incorrect switches invert controls idempotently and retain conflict feedback", () => {
  const machine = createMergeBarrierMachine({ sections: validSections() });
  assert.equal(machine.activateSwitch("one-wrong").controlsInverted, true);
  assert.equal(machine.activateSwitch("two-wrong-a").controlsInverted, true);
  assert.equal(machine.activateSwitch("three-wrong-c").controlsInverted, true);
  assert.equal(machine.getState().controlsInverted, true);
  assert.equal(machine.getState().sections[0].feedback, "conflict");
  assert.equal(machine.activateSwitch("one-wrong").kind, "already-activated");
  assert.equal(machine.getState().controlsInverted, true);
});

// Validates: Requirements 6.5
test("machine reset represents a clean level restart or new session", () => {
  const machine = createMergeBarrierMachine({ sections: validSections() });
  machine.activateSwitch("one-wrong");
  machine.activateSwitch("two-right");

  const reset = machine.reset();
  assert.equal(reset.controlsInverted, false);
  assert.ok(reset.sections.every(({ wallOpen, feedback }) => !wallOpen && feedback === "idle"));
  assert.ok(reset.sections.flatMap(({ switches }) => switches).every(({ activated }) => !activated));
});

function runtimeObject(zone) {
  return {
    levelTileData: zone,
    visualState: "idle",
    removedComponents: [],
    setMechanicVisualState(state) { this.visualState = state; },
    unuse(id) { this.removedComponents.push(id); },
  };
}

// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.7
test("runtime integrates Player API, one-shot switches, feedback, and safe wall opening", () => {
  let collideHandler;
  const player = {
    inverted: false,
    onCollide(tag, handler) {
      assert.equal(tag, "merge-switch");
      collideHandler = handler;
    },
    setControlsInverted(value) { this.inverted = Boolean(value); },
  };
  const mechanic = { id: "merge", params: { minimumSections: 3, sections: validSections() } };
  const zones = [
    { role: "barrier", mechanic: { params: { wallId: "wall-one" } } },
    { role: "barrier", mechanic: { params: { wallId: "wall-two" } } },
    { role: "switch", mechanic: { params: { switchId: "one-wrong" } } },
    { role: "switch", mechanic: { params: { switchId: "two-right" } } },
  ];
  const entries = zones.map((zone) => ({ zone, object: runtimeObject(zone) }));
  let sfxCount = 0;
  const runtime = attachMergeBarrierRuntime({
    player,
    mechanic,
    entries,
    audioManager: { playSfx: () => { sfxCount += 1; } },
  });

  collideHandler(entries[2].object);
  collideHandler(entries[2].object);
  assert.equal(player.inverted, true);
  assert.equal(entries[2].object.visualState, "conflict");
  assert.equal(sfxCount, 1);

  collideHandler(entries[3].object);
  assert.equal(entries[1].object.visualState, "resolved");
  assert.deepEqual(entries[1].object.removedComponents, ["body"]);
  assert.equal(entries[0].object.visualState, "idle");
  assert.deepEqual(entries[0].object.removedComponents, []);
  assert.equal(entries[3].object.visualState, "resolved");
  assert.equal(runtime.getState().sections[1].wallOpen, true);
});


test("generic mechanic registry groups parsed objects by mechanic id and type", () => {
  const object = { id: "runtime-zone" };
  const zone = { id: "zone-1", mechanic: { id: "custom-1" } };
  let received;
  const runtimes = attachLevelMechanics({
    parsedLevel: {
      data: { mechanics: [{ id: "custom-1", type: "custom", enabled: true }] },
      mechanicZones: [zone],
    },
    instantiated: { byId: new Map([["zone-1", object]]) },
    factories: {
      custom(context) {
        received = context;
        return { getState: () => ({ ready: true }) };
      },
    },
    shared: "context",
  });

  assert.equal(runtimes.get("custom-1").getState().ready, true);
  assert.equal(received.shared, "context");
  assert.equal(received.entries[0].zone, zone);
  assert.equal(received.entries[0].object, object);
});
