/**
 * Level 1 data only. Garbage Collector behavior intentionally belongs to task
 * 10; this task exposes its declarative zone and configuration contract.
 */
export const LEVEL_1 = Object.freeze({
  id: 1,
  name: "Garbage Collector",
  tileSize: 48,
  origin: Object.freeze({ x: 0, y: 0 }),
  musicTrack: "level-1",
  tilemap: Object.freeze([
    "..........................",
    "..........................",
    "..........................",
    "......................====",
    "..........................",
    ".............====.........",
    "..........................",
    "..................====....",
    "..........................",
    "......=====...............",
    "..........................",
    "...........=====..........",
    "..........................",
    ".@......C.....G.....X.....",
    "==========================",
  ]),
  symbolConfig: Object.freeze({
    G: Object.freeze({
      mechanicId: "gc-main",
      params: Object.freeze({ section: "intro" }),
    }),
  }),
  mechanics: Object.freeze([
    Object.freeze({
      id: "gc-main",
      type: "garbageCollector",
      params: Object.freeze({ inactivitySeconds: 5 }),
    }),
  ]),
});

export default LEVEL_1;
