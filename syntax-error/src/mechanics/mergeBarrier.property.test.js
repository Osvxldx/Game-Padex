import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import { LEVEL_2 } from "../levels/level2.js";
import { createMergeBarrierMachine } from "./mergeBarrier.js";

const mergeConfig = LEVEL_2.mechanics.find(({ type }) => type === "mergeBarrier").params;
const incorrectSwitchesBySection = mergeConfig.sections.map(({ switches }) => (
  switches.filter(({ correct }) => !correct).map(({ id }) => id)
));
const incorrectSwitchIds = incorrectSwitchesBySection.flat();
const incorrectSwitchIdArbitrary = fc.constantFrom(...incorrectSwitchIds);

const repeatedSwitchSequenceArbitrary = fc.tuple(
  incorrectSwitchIdArbitrary,
  fc.integer({ min: 2, max: 40 }),
).map(([switchId, length]) => Array.from({ length }, () => switchId));

const crossSectionSequenceArbitrary = fc.tuple(
  ...incorrectSwitchesBySection.map((ids) => fc.constantFrom(...ids)),
  fc.array(incorrectSwitchIdArbitrary, { minLength: 0, maxLength: 37 }),
).map(([...values]) => {
  const suffix = values.pop();
  return [...values, ...suffix];
});

const incorrectSwitchSequenceArbitrary = fc.oneof(
  fc.array(incorrectSwitchIdArbitrary, { minLength: 1, maxLength: 40 }),
  repeatedSwitchSequenceArbitrary,
  crossSectionSequenceArbitrary,
);

function assertNoSectionOpened(state) {
  assert.ok(state.sections.every(({ wallOpen }) => wallOpen === false));
}

// Feature: syntax-error, Property 6: Idempotencia de Inversión de Controles
// **Validates: Requirements 6.3, 6.4**
test("Property 6: every non-empty sequence of incorrect Level 2 switches is equivalent to one inversion", () => {
  fc.assert(
    fc.property(incorrectSwitchSequenceArbitrary, (switchIds) => {
      const machine = createMergeBarrierMachine({
        sections: mergeConfig.sections,
        minimumSections: mergeConfig.minimumSections,
      });
      const singleActivationMachine = createMergeBarrierMachine({
        sections: mergeConfig.sections,
        minimumSections: mergeConfig.minimumSections,
      });

      const firstResult = machine.activateSwitch(switchIds[0]);
      const singleResult = singleActivationMachine.activateSwitch(switchIds[0]);
      assert.equal(firstResult.kind, "incorrect");
      assert.equal(firstResult.controlsInverted, true);
      assert.equal(machine.getState().controlsInverted, true);
      assert.equal(singleResult.controlsInverted, true);
      assertNoSectionOpened(machine.getState());

      const activated = new Set([switchIds[0]]);
      for (const switchId of switchIds.slice(1)) {
        assert.equal(machine.getState().controlsInverted, true);
        const result = machine.activateSwitch(switchId);
        assert.equal(result.kind, activated.has(switchId) ? "already-activated" : "incorrect");
        activated.add(switchId);
        assert.equal(result.controlsInverted, true);
        assert.equal(machine.getState().controlsInverted, true);
        assertNoSectionOpened(machine.getState());
      }

      assert.equal(
        machine.getState().controlsInverted,
        singleActivationMachine.getState().controlsInverted,
      );

      const stateBeforeReactivation = machine.getState();
      const repeatedResult = machine.activateSwitch(switchIds[0]);
      assert.equal(repeatedResult.accepted, false);
      assert.equal(repeatedResult.kind, "already-activated");
      assert.equal(repeatedResult.controlsInverted, true);
      assert.equal(machine.getState().controlsInverted, stateBeforeReactivation.controlsInverted);
      assertNoSectionOpened(machine.getState());
    }),
    { numRuns: 200 },
  );
});
