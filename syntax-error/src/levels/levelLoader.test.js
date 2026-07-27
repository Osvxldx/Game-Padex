import assert from "node:assert/strict";
import test from "node:test";

import { LEVEL_1 } from "./level1.js";
import { LEVEL_2 } from "./level2.js";
import { LEVEL_3 } from "./level3.js";
import { LEVEL_4 } from "./level4.js";
import { LEVEL_5 } from "./level5.js";
import {
  LevelValidationError,
  parseLevelData,
  tileToWorld,
} from "./levelLoader.js";

// Validates: Requirements 16.1, 16.2, 16.4, 16.5, 20.1

test("Level 1 parses tile entities, spawn, checkpoint, and GC contract", () => {
  const parsed = parseLevelData(LEVEL_1);

  assert.equal(parsed.id, 1);
  assert.equal(parsed.name, "Garbage Collector");
  assert.equal(parsed.mapWidth, 26);
  assert.equal(parsed.mapHeight, 15);
  assert.equal(parsed.worldWidth, 1248);
  assert.equal(parsed.worldHeight, 720);
  assert.deepEqual(parsed.spawn.tile, { column: 1, row: 13 });
  assert.deepEqual(parsed.spawn.position, { x: 72, y: 648 });
  assert.equal(parsed.checkpoints.length, 1);
  assert.deepEqual(parsed.checkpoints[0].position, { x: 408, y: 648 });
  assert.equal(parsed.platforms.length, 48);
  assert.equal(
    parsed.platforms.filter((platform) => (
      platform.tags.includes("moving-platform")
    )).length,
    9,
  );
  assert.equal(parsed.lethalObstacles.length, 1);
  assert.equal(parsed.mechanicZones.length, 1);
  assert.deepEqual(
    {
      symbol: parsed.mechanicZones[0].symbol,
      role: parsed.mechanicZones[0].role,
      type: parsed.mechanicZones[0].mechanic.type,
      id: parsed.mechanicZones[0].mechanic.id,
      params: parsed.mechanicZones[0].mechanic.params,
    },
    {
      symbol: "G",
      role: "zone",
      type: "garbageCollector",
      id: "gc-main",
      params: { inactivitySeconds: 5, section: "intro" },
    },
  );
});

test("Level 3 exposes three configured Infinite Loop zones", () => {
  const parsed = parseLevelData(LEVEL_3);

  assert.equal(parsed.id, 3);
  assert.equal(parsed.name, "Stack Overflow");
  assert.equal(parsed.musicTrack, "level-3");
  assert.deepEqual(parsed.spawn.position, { x: 72, y: 648 });
  assert.equal(parsed.checkpoints.length, 1);
  assert.equal(parsed.mechanicZones.length, 3);
  parsed.mechanicZones.forEach((zone) => {
    assert.equal(zone.symbol, "L");
    assert.equal(zone.role, "zone");
    assert.equal(zone.mechanic.type, "infiniteLoop");
    assert.deepEqual(zone.mechanic.params, {
      historySeconds: 2,
      cloneDelaySeconds: 0.1,
      maxClones: 10,
      overflowSeconds: 1.5,
      section: "stack-overflow",
    });
  });
});

test("tile coordinates transform to world bounds and centers for rectangular tiles", () => {
  const world = tileToWorld(
    3,
    2,
    { width: 32, height: 48 },
    { x: 10, y: -8 },
  );

  assert.deepEqual(world.tile, { column: 3, row: 2 });
  assert.deepEqual(world.bounds, { x: 106, y: 88, width: 32, height: 48 });
  assert.deepEqual(world.position, { x: 122, y: 112 });
  assert.throws(() => tileToWorld(-1, 0, 32), RangeError);
  assert.throws(() => tileToWorld(0, 1.5, 32), RangeError);
});

test("reserved mechanics parse as extensible declarative markers", () => {
  const parsed = parseLevelData({
    id: 5,
    name: "Mechanic contracts",
    tileSize: 20,
    origin: { x: 5, y: 10 },
    tilemap: [
      "@CMSLW",
      "======",
    ],
    symbolConfig: {
      M: { mechanicId: "merge" },
      S: { mechanicId: "merge" },
    },
    mechanics: [
      { id: "merge", type: "mergeBarrier", params: { section: 1 } },
      { id: "loop", type: "infiniteLoop" },
      { id: "warnings", type: "warningSystem" },
    ],
  });

  assert.deepEqual(
    parsed.mechanicZones.map(({ symbol, role, mechanic, solid }) => ({
      symbol,
      role,
      type: mechanic.type,
      solid,
    })),
    [
      { symbol: "M", role: "barrier", type: "mergeBarrier", solid: true },
      { symbol: "S", role: "switch", type: "mergeBarrier", solid: false },
      { symbol: "L", role: "zone", type: "infiniteLoop", solid: false },
      { symbol: "W", role: "warning", type: "warningSystem", solid: false },
    ],
  );
});

function validLevel(overrides = {}) {
  return {
    id: 1,
    name: "Valid",
    tileSize: 32,
    origin: { x: 0, y: 0 },
    tilemap: ["@C", "=="],
    mechanics: [],
    ...overrides,
  };
}

const invalidCases = [
  ["missing object", null, /level: must be an object/],
  ["invalid id", validLevel({ id: 0 }), /level\.id: must be a positive integer/],
  ["empty name", validLevel({ name: " " }), /level\.name: must be a non-empty string/],
  ["missing tile size", validLevel({ tileSize: undefined }), /level\.tileSize: must be an object/],
  ["invalid origin", validLevel({ origin: { x: NaN, y: 0 } }), /level\.origin: must contain finite/],
  ["irregular rows", validLevel({ tilemap: ["@C", "="] }), /row has width 1; expected 2/],
  ["unknown symbol", validLevel({ tilemap: ["@?C"] }), /unknown symbol/],
  ["missing spawn", validLevel({ tilemap: [".C", "=="] }), /exactly one '@'/],
  ["duplicate spawn", validLevel({ tilemap: ["@@C", "==="] }), /spawn is duplicated/],
  ["missing checkpoint", validLevel({ tilemap: ["@.", "=="] }), /at least one 'C'/],
  [
    "mechanic without config",
    validLevel({ tilemap: ["@CG", "==="] }),
    /requires a 'garbageCollector' mechanic configuration/,
  ],
  [
    "duplicate mechanic ids",
    validLevel({
      mechanics: [
        { id: "same", type: "garbageCollector" },
        { id: "same", type: "infiniteLoop" },
      ],
    }),
    /duplicate mechanic id 'same'/,
  ],
];

for (const [name, level, expected] of invalidCases) {
  test(`rejects ${name} with a clear validation error`, () => {
    assert.throws(
      () => parseLevelData(level),
      (error) => error instanceof LevelValidationError && expected.test(error.message),
    );
  });
}

test("ambiguous mechanic markers require an explicit mechanicId", () => {
  assert.throws(
    () => parseLevelData(validLevel({
      tilemap: ["@CG", "==="],
      mechanics: [
        { id: "gc-a", type: "garbageCollector" },
        { id: "gc-b", type: "garbageCollector" },
      ],
    })),
    /matches multiple 'garbageCollector' mechanics/,
  );
});


// Validates: Requirements 6.1, 6.6, 6.8
test("Level 2 parser preserves per-instance Merge section, wall, and switch metadata", () => {
  const parsed = parseLevelData(LEVEL_2);
  const merge = parsed.data.mechanics.find(({ type }) => type === "mergeBarrier");
  const barriers = parsed.mechanicZones.filter(({ role }) => role === "barrier");
  const switches = parsed.mechanicZones.filter(({ role }) => role === "switch");

  assert.equal(parsed.id, 2);
  assert.equal(parsed.name, "Merge Conflict");
  assert.equal(merge.params.sections.length, 3);
  assert.equal(barriers.length, 15);
  assert.ok(barriers.every(({ solid }) => solid));
  assert.equal(switches.length, 9);
  assert.deepEqual(
    merge.params.sections.map((section) => ({
      id: section.id,
      switchCount: section.switches.length,
      correctCount: section.switches.filter(({ correct }) => correct).length,
    })),
    [
      { id: "conflict-1", switchCount: 3, correctCount: 1 },
      { id: "conflict-2", switchCount: 2, correctCount: 1 },
      { id: "conflict-3", switchCount: 4, correctCount: 1 },
    ],
  );
  assert.deepEqual(
    new Set(switches.map(({ mechanic }) => mechanic.params.sectionId)),
    new Set(["conflict-1", "conflict-2", "conflict-3"]),
  );
});

test("coordinate tile overrides are generic, merged, and validated", () => {
  const parsed = parseLevelData(validLevel({
    tilemap: ["@CS", "===",],
    symbolConfig: { S: { mechanicId: "merge", params: { shared: true } } },
    tileOverrides: { "0,2": { params: { switchId: "specific" }, tags: ["instance"] } },
    mechanics: [{ id: "merge", type: "mergeBarrier" }],
  }));
  const zone = parsed.mechanicZones[0];

  assert.deepEqual(zone.mechanic.params, { shared: true, switchId: "specific" });
  assert.ok(zone.tags.includes("instance"));
  assert.throws(
    () => parseLevelData(validLevel({ tileOverrides: { "99,0": {} } })),
    /outside the tilemap/,
  );
});

// Validates: Requirements 8.1, 8.3, 8.6, 16.1
 test("Level 4 parses unique warning signs, checkpoint, platforms, and warning config", () => {
  const parsed = parseLevelData(LEVEL_4);
  const warnings = parsed.mechanicZones.filter(({ role }) => role === "warning");
  const warningIds = warnings.map(({ id }) => id);

  assert.equal(parsed.id, 4);
  assert.equal(parsed.name, "Warning Fatigue");
  assert.equal(parsed.musicTrack, "level-4");
  assert.deepEqual(parsed.spawn.position, { x: 72, y: 648 });
  assert.equal(parsed.checkpoints.length, 1);
  assert.ok(parsed.platforms.length > 26);
  assert.ok(warnings.length > 20);
  assert.equal(new Set(warningIds).size, warnings.length);
  assert.ok(warnings.every(({ symbol, mechanic }) => (
    symbol === "W"
      && mechanic.id === "warnings-main"
      && mechanic.type === "warningSystem"
      && mechanic.params.baseDelayMs === 50
      && mechanic.params.multiplier === 0.15
      && mechanic.params.maxWarnings === 20
  )));
});


// Validates: Requirements 9.1, 9.2, 16.1
test("Level 5 combines every mechanic with individual and combined sections plus a goal", () => {
  const parsed = parseLevelData(LEVEL_5);
  const zonesByType = parsed.mechanicZones.reduce((counts, zone) => {
    counts[zone.mechanic.type] = (counts[zone.mechanic.type] ?? 0) + 1;
    return counts;
  }, {});

  assert.equal(parsed.id, 5);
  assert.equal(parsed.name, "Production");
  assert.equal(parsed.musicTrack, "level-5");
  assert.equal(parsed.checkpoints.length, 1);

  // Requirement 9.1: at least one active instance of each mechanic.
  assert.ok(zonesByType.garbageCollector >= 1, "needs a Garbage Collector zone");
  assert.ok(zonesByType.mergeBarrier >= 1, "needs Merge Barrier tiles");
  assert.ok(zonesByType.infiniteLoop >= 1, "needs an Infinite Loop zone");
  assert.ok(zonesByType.warningSystem >= 1, "needs Warning signs");

  // All four mechanic definitions are declared and enabled.
  assert.deepEqual(
    new Set(parsed.data.mechanics.map(({ type }) => type)),
    new Set(["garbageCollector", "mergeBarrier", "infiniteLoop", "warningSystem"]),
  );
  assert.ok(parsed.data.mechanics.every(({ enabled }) => enabled));

  // Requirement 9.2: at least one goal marks the end of the final section.
  assert.equal(parsed.goals.length, 1);
  assert.ok(parsed.goals[0].tags.includes("level-goal"));

  // The Merge section keeps exactly one correct switch (Requirement 6.6).
  const merge = parsed.data.mechanics.find(({ type }) => type === "mergeBarrier");
  assert.equal(merge.params.sections.length, 1);
  assert.equal(
    merge.params.sections[0].switches.filter(({ correct }) => correct).length,
    1,
  );
  const switches = parsed.mechanicZones.filter(({ role }) => role === "switch");
  const barriers = parsed.mechanicZones.filter(({ role }) => role === "barrier");
  assert.equal(switches.length, 3);
  assert.ok(barriers.length >= 1 && barriers.every(({ solid }) => solid));
});

test("goal tiles parse as collectible end markers without extra mechanics", () => {
  const parsed = parseLevelData({
    id: 5,
    name: "Goal marker",
    tileSize: 32,
    origin: { x: 0, y: 0 },
    tilemap: ["@C.E", "===="],
    mechanics: [],
  });

  assert.equal(parsed.goals.length, 1);
  assert.equal(parsed.goals[0].kind, "goal");
  assert.deepEqual(parsed.goals[0].tile, { column: 3, row: 0 });
  assert.ok(parsed.goals[0].tags.includes("level-goal"));
});
