/**
 * Level 5 — "Production". The final level combines every mechanic:
 * a level-wide Garbage Collector (Requirement 5), a Merge Barrier conflict
 * (Requirement 6), an Infinite Loop zone (Requirement 7) and accumulated
 * Warnings (Requirement 8).
 *
 * Layout (single screen, left to right):
 *   1. GC intro corridor  — keep moving or the collector eliminates you.
 *   2. Merge conflict wall — one of three switches opens it.
 *   3. Infinite Loop zone  — comment through it to avoid the trap.
 *   4. Warning signs       — accumulated input delay.
 *   5. Combined section    — Warnings + Loop act together (plus the global GC).
 * The `E` goal tile at the end registers completion.
 */

const MERGE_SECTIONS = Object.freeze([
  Object.freeze({
    id: "prod-conflict",
    wallId: "merge-wall-prod",
    switches: Object.freeze([
      Object.freeze({ id: "merge-p-a", correct: false }),
      Object.freeze({ id: "merge-p-b", correct: true }),
      Object.freeze({ id: "merge-p-c", correct: false }),
    ]),
  }),
]);

const wallColumnOverrides = Object.fromEntries(
  [9, 10, 11, 12, 13].map((row) => [
    `${row},9`,
    Object.freeze({
      params: Object.freeze({ sectionId: "prod-conflict", wallId: "merge-wall-prod" }),
    }),
  ]),
);

export const LEVEL_5 = Object.freeze({
  id: 5,
  name: "Production",
  tileSize: 48,
  origin: Object.freeze({ x: 0, y: 0 }),
  musicTrack: "level-5",
  tilemap: Object.freeze([
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    "..........................",
    ".........M................",
    ".........M................",
    ".........M................",
    ".........M................",
    ".@G..SSS.MC.L..WWW..WLW..E",
    "==========================",
  ]),
  symbolConfig: Object.freeze({
    G: Object.freeze({ mechanicId: "gc-prod" }),
    M: Object.freeze({ mechanicId: "merge-prod" }),
    S: Object.freeze({ mechanicId: "merge-prod" }),
    L: Object.freeze({ mechanicId: "loop-prod" }),
    W: Object.freeze({ mechanicId: "warn-prod" }),
  }),
  tileOverrides: Object.freeze({
    ...wallColumnOverrides,
    "13,5": Object.freeze({ params: Object.freeze({ sectionId: "prod-conflict", switchId: "merge-p-a" }) }),
    "13,6": Object.freeze({ params: Object.freeze({ sectionId: "prod-conflict", switchId: "merge-p-b" }) }),
    "13,7": Object.freeze({ params: Object.freeze({ sectionId: "prod-conflict", switchId: "merge-p-c" }) }),
  }),
  mechanics: Object.freeze([
    Object.freeze({
      id: "gc-prod",
      type: "garbageCollector",
      params: Object.freeze({ inactivitySeconds: 5, section: "prod-intro" }),
    }),
    Object.freeze({
      id: "merge-prod",
      type: "mergeBarrier",
      params: Object.freeze({ minimumSections: 1, sections: MERGE_SECTIONS }),
    }),
    Object.freeze({
      id: "loop-prod",
      type: "infiniteLoop",
      params: Object.freeze({
        historySeconds: 2,
        cloneDelaySeconds: 0.1,
        maxClones: 10,
        overflowSeconds: 1.5,
      }),
    }),
    Object.freeze({
      id: "warn-prod",
      type: "warningSystem",
      params: Object.freeze({
        baseDelayMs: 50,
        multiplier: 0.15,
        maxWarnings: 20,
      }),
    }),
  ]),
});

export default LEVEL_5;
