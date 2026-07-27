import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  WARNING_BASE_DELAY_MS,
  WARNING_DELAY_MULTIPLIER,
  WARNING_MAX_COUNT,
  calculateWarningDelayMs,
  createWarningSystemMachine,
} from "./warningSystem.js";

const finiteDouble = (min, max) => fc.double({
  min,
  max,
  noNaN: true,
  noDefaultInfinity: true,
});

// Feature: syntax-error, Property 3: Fórmula Monotónica de Retardo de Warnings
// **Validates: Requirements 8.2** (also formaliza la Propiedad de Correctitud 5)
test("Property 3: adding one warning strictly increases the delay across the valid range", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: WARNING_MAX_COUNT - 1 }),
      (n) => {
        const current = calculateWarningDelayMs(n);
        const next = calculateWarningDelayMs(n + 1);
        assert.ok(
          next > current,
          `delay(${n + 1})=${next} should be strictly greater than delay(${n})=${current}`,
        );
        // The increment equals a full base*multiplier step while below the cap.
        assert.ok(
          Math.abs((next - current) - WARNING_BASE_DELAY_MS * WARNING_DELAY_MULTIPLIER) < 1e-9,
        );
      },
    ),
    { numRuns: 200 },
  );
});

test("Property 3: for any two counts N < M within the cap, delay(M) > delay(N)", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: WARNING_MAX_COUNT }),
      fc.integer({ min: 0, max: WARNING_MAX_COUNT }),
      (a, b) => {
        const low = Math.min(a, b);
        const high = Math.max(a, b);
        const delayLow = calculateWarningDelayMs(low);
        const delayHigh = calculateWarningDelayMs(high);
        if (high > low) {
          assert.ok(delayHigh > delayLow, `delay(${high}) should exceed delay(${low})`);
        } else {
          assert.equal(delayHigh, delayLow);
        }
      },
    ),
    { numRuns: 300 },
  );
});

test("Property 3: monotonicity is preserved for arbitrary positive base delay and multiplier", () => {
  fc.assert(
    fc.property(
      finiteDouble(1, 500),
      finiteDouble(0.01, 5),
      fc.integer({ min: 0, max: WARNING_MAX_COUNT - 1 }),
      (baseDelayMs, multiplier, n) => {
        const options = { baseDelayMs, multiplier, maxWarnings: WARNING_MAX_COUNT };
        assert.ok(
          calculateWarningDelayMs(n + 1, options) > calculateWarningDelayMs(n, options),
        );
      },
    ),
    { numRuns: 300 },
  );
});

test("Property 3: delay never decreases and stays flat once the cap is reached", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 200 }),
      fc.integer({ min: 0, max: 200 }),
      (a, b) => {
        const low = Math.min(a, b);
        const high = Math.max(a, b);
        assert.ok(calculateWarningDelayMs(high) >= calculateWarningDelayMs(low));
        if (low >= WARNING_MAX_COUNT) {
          assert.equal(
            calculateWarningDelayMs(high),
            calculateWarningDelayMs(WARNING_MAX_COUNT),
          );
        }
      },
    ),
    { numRuns: 300 },
  );
});

// Feature: syntax-error, Property 8: Límite Máximo de Warnings
// **Validates: Requirements 8.6**
const collectOperationArbitrary = fc.record({
  // A bounded id pool (41 distinct) combined with long sequences guarantees
  // runs that push well past the cap while still replaying earlier signs.
  id: fc.integer({ min: 0, max: 40 }).map((value) => `warning-${value}`),
  immune: fc.boolean(),
});

const collectSequenceArbitrary = fc.array(collectOperationArbitrary, {
  minLength: 0,
  maxLength: 120,
});

test("Property 8: warning count is capped at 20 and never decreases across any sequence", () => {
  fc.assert(
    fc.property(collectSequenceArbitrary, (operations) => {
      const machine = createWarningSystemMachine();
      const consumed = new Set();
      let expected = 0;
      let cappedReached = false;

      for (const operation of operations) {
        const before = machine.getState().warningCount;
        const result = machine.collect(operation.id, { immune: operation.immune });

        if (operation.immune) {
          assert.equal(result.reason, "immune");
          assert.equal(result.incremented, false);
        } else if (consumed.has(operation.id)) {
          assert.equal(result.reason, "already-collected");
          assert.equal(result.incremented, false);
        } else {
          consumed.add(operation.id);
          if (expected < WARNING_MAX_COUNT) {
            expected += 1;
            assert.equal(result.incremented, true);
            assert.equal(result.reason, "collected");
          } else {
            assert.equal(result.incremented, false);
            assert.equal(result.reason, "capped");
          }
        }

        const after = machine.getState().warningCount;
        assert.equal(after, expected);
        assert.ok(after <= WARNING_MAX_COUNT, `count ${after} must not exceed ${WARNING_MAX_COUNT}`);
        assert.ok(after >= before, "warning count must never decrease");
        if (cappedReached) assert.equal(result.incremented, false);
        if (after === WARNING_MAX_COUNT) cappedReached = true;
      }

      assert.equal(
        machine.getState().warningCount,
        Math.min(consumed.size, WARNING_MAX_COUNT),
      );
      assert.equal(machine.getState().delayMs, calculateWarningDelayMs(machine.getState().warningCount));
    }),
    { numRuns: 300 },
  );
});

test("Property 8: additional unique signs past the cap keep the maximum delay", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 30 }), (extraSigns) => {
      const machine = createWarningSystemMachine();
      for (let index = 0; index < WARNING_MAX_COUNT + extraSigns; index += 1) {
        machine.collect(`over-cap-${index}`);
      }
      assert.equal(machine.getState().warningCount, WARNING_MAX_COUNT);
      assert.equal(
        machine.getState().delayMs,
        calculateWarningDelayMs(WARNING_MAX_COUNT),
      );
    }),
    { numRuns: 100 },
  );
});
