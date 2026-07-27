/** Level 3 tilemap and Infinite Loop mechanic configuration. */
export const LEVEL_3 = Object.freeze({
  id: 3,
  name: "Stack Overflow",
  tileSize: 48,
  origin: Object.freeze({ x: 0, y: 0 }),
  musicTrack: "level-3",
  tilemap: Object.freeze([
    "..........................",
    "..........................",
    "..........................",
    "......................====",
    "..........................",
    ".................====.....",
    "..........................",
    "............====..........",
    "..........................",
    ".......====...............",
    "..........................",
    "...................====...",
    "..........................",
    ".@....L...C....L.....L....",
    "==========================",
  ]),
  symbolConfig: Object.freeze({
    L: Object.freeze({
      mechanicId: "loop-main",
      params: Object.freeze({ section: "stack-overflow" }),
    }),
  }),
  mechanics: Object.freeze([
    Object.freeze({
      id: "loop-main",
      type: "infiniteLoop",
      params: Object.freeze({
        historySeconds: 2,
        cloneDelaySeconds: 0.1,
        maxClones: 10,
        overflowSeconds: 1.5,
      }),
    }),
  ]),
});

export default LEVEL_3;
