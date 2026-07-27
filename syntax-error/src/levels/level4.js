/** Level 4 tilemap and accumulated Warnings mechanic configuration. */
export const LEVEL_4 = Object.freeze({
  id: 4,
  name: "Warning Fatigue",
  tileSize: 48,
  origin: Object.freeze({ x: 0, y: 0 }),
  musicTrack: "level-4",
  tilemap: Object.freeze([
    "..........................",
    "....W....W....W....W......",
    "....=....=....=....=......",
    "..........................",
    "..W..W..W..W..W..W........",
    "..=..=..=..=..=..=........",
    "..........................",
    "....W...W...W...W...W.....",
    "....=...=...=...=...=.....",
    "..........................",
    "...W..W..W..W..W..W.......",
    "...=..=..=..=..=..=.......",
    "..........................",
    ".@.W.W.W.C.W.W.W.W........",
    "==========================",
  ]),
  symbolConfig: Object.freeze({
    W: Object.freeze({
      mechanicId: "warnings-main",
      params: Object.freeze({ section: "warning-fatigue" }),
    }),
  }),
  mechanics: Object.freeze([
    Object.freeze({
      id: "warnings-main",
      type: "warningSystem",
      params: Object.freeze({
        baseDelayMs: 50,
        multiplier: 0.15,
        maxWarnings: 20,
      }),
    }),
  ]),
});

export default LEVEL_4;
