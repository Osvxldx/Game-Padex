const SECTIONS = Object.freeze([
  Object.freeze({
    id: "conflict-1",
    wallId: "merge-wall-1",
    switches: Object.freeze([
      Object.freeze({ id: "merge-1-a", correct: false }),
      Object.freeze({ id: "merge-1-b", correct: true }),
      Object.freeze({ id: "merge-1-c", correct: false }),
    ]),
  }),
  Object.freeze({
    id: "conflict-2",
    wallId: "merge-wall-2",
    switches: Object.freeze([
      Object.freeze({ id: "merge-2-a", correct: true }),
      Object.freeze({ id: "merge-2-b", correct: false }),
    ]),
  }),
  Object.freeze({
    id: "conflict-3",
    wallId: "merge-wall-3",
    switches: Object.freeze([
      Object.freeze({ id: "merge-3-a", correct: false }),
      Object.freeze({ id: "merge-3-b", correct: false }),
      Object.freeze({ id: "merge-3-c", correct: true }),
      Object.freeze({ id: "merge-3-d", correct: false }),
    ]),
  }),
]);

const wallOverrides = (column, sectionId, wallId) => Object.fromEntries(
  [9, 10, 11, 12, 13].map((row) => [
    `${row},${column}`,
    Object.freeze({ params: Object.freeze({ sectionId, wallId }) }),
  ]),
);

/** Declarative Level 2 data; per-coordinate overrides distinguish tile instances. */
export const LEVEL_2 = Object.freeze({
  id: 2,
  name: "Merge Conflict",
  tileSize: 48,
  origin: Object.freeze({ x: 0, y: 0 }),
  musicTrack: "level-2",
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
    "..........M.....M.......M.",
    "..........M.....M.......M.",
    "..........M.....M.......M.",
    "..........M.....M.......M.",
    ".@..S.S.S.M.CSS.M.S.S.SSM.",
    "==========================",
  ]),
  symbolConfig: Object.freeze({
    M: Object.freeze({ mechanicId: "merge-main" }),
    S: Object.freeze({ mechanicId: "merge-main" }),
  }),
  tileOverrides: Object.freeze({
    ...wallOverrides(10, "conflict-1", "merge-wall-1"),
    ...wallOverrides(16, "conflict-2", "merge-wall-2"),
    ...wallOverrides(24, "conflict-3", "merge-wall-3"),
    "13,4": Object.freeze({ params: Object.freeze({ sectionId: "conflict-1", switchId: "merge-1-a" }) }),
    "13,6": Object.freeze({ params: Object.freeze({ sectionId: "conflict-1", switchId: "merge-1-b" }) }),
    "13,8": Object.freeze({ params: Object.freeze({ sectionId: "conflict-1", switchId: "merge-1-c" }) }),
    "13,13": Object.freeze({ params: Object.freeze({ sectionId: "conflict-2", switchId: "merge-2-a" }) }),
    "13,14": Object.freeze({ params: Object.freeze({ sectionId: "conflict-2", switchId: "merge-2-b" }) }),
    "13,18": Object.freeze({ params: Object.freeze({ sectionId: "conflict-3", switchId: "merge-3-a" }) }),
    "13,20": Object.freeze({ params: Object.freeze({ sectionId: "conflict-3", switchId: "merge-3-b" }) }),
    "13,22": Object.freeze({ params: Object.freeze({ sectionId: "conflict-3", switchId: "merge-3-c" }) }),
    "13,23": Object.freeze({ params: Object.freeze({ sectionId: "conflict-3", switchId: "merge-3-d" }) }),
  }),
  mechanics: Object.freeze([
    Object.freeze({
      id: "merge-main",
      type: "mergeBarrier",
      params: Object.freeze({ minimumSections: 3, sections: SECTIONS }),
    }),
  ]),
});

export default LEVEL_2;
