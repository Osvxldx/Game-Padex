export const TILE_KINDS = Object.freeze({
  EMPTY: "empty",
  SPAWN: "spawn",
  PLATFORM: "platform",
  CHECKPOINT: "checkpoint",
  LETHAL: "lethal",
  MECHANIC: "mechanic",
  GOAL: "goal",
});

const descriptor = (definition) => Object.freeze({
  ...definition,
  tags: Object.freeze([...(definition.tags ?? [])]),
});

/**
 * Declarative tile vocabulary. Parsing consumes only this metadata; KAPLAY
 * component factories live below so validation remains usable in Node.
 */
export const DEFAULT_TILE_CONFIG = Object.freeze({
  " ": descriptor({ kind: TILE_KINDS.EMPTY }),
  ".": descriptor({ kind: TILE_KINDS.EMPTY }),
  "=": descriptor({
    kind: TILE_KINDS.PLATFORM,
    tags: ["platform", "level-platform"],
  }),
  "P": descriptor({
    kind: TILE_KINDS.PLATFORM,
    tags: ["platform", "level-platform", "moving-platform"],
  }),
  "@": descriptor({ kind: TILE_KINDS.SPAWN, tags: ["player-spawn"] }),
  "C": descriptor({
    kind: TILE_KINDS.CHECKPOINT,
    tags: ["checkpoint", "level-checkpoint"],
  }),
  "X": descriptor({
    kind: TILE_KINDS.LETHAL,
    tags: ["lethal", "danger-visual"],
  }),
  "E": descriptor({
    kind: TILE_KINDS.GOAL,
    tags: ["level-goal", "accent-visual"],
  }),
  "G": descriptor({
    kind: TILE_KINDS.MECHANIC,
    mechanicType: "garbageCollector",
    role: "zone",
    tags: ["gc-zone", "mechanic-zone", "logical-obstacle"],
  }),
  "M": descriptor({
    kind: TILE_KINDS.MECHANIC,
    mechanicType: "mergeBarrier",
    role: "barrier",
    solid: true,
    tags: ["merge-barrier", "mechanic-zone"],
  }),
  "S": descriptor({
    kind: TILE_KINDS.MECHANIC,
    mechanicType: "mergeBarrier",
    role: "switch",
    tags: ["merge-switch", "mechanic-zone"],
  }),
  "L": descriptor({
    kind: TILE_KINDS.MECHANIC,
    mechanicType: "infiniteLoop",
    role: "zone",
    tags: ["loop-zone", "mechanic-zone", "logical-obstacle"],
  }),
  "W": descriptor({
    kind: TILE_KINDS.MECHANIC,
    mechanicType: "warningSystem",
    role: "warning",
    tags: ["warning-sign", "mechanic-zone", "logical-obstacle"],
  }),
});

export const TILE_THEME_PALETTES = Object.freeze({
  terminal: Object.freeze({
    background: [13, 17, 23],
    platform: [48, 54, 61],
    player: [88, 166, 255],
    danger: [248, 81, 73],
    checkpoint: [227, 179, 65],
    accent: [63, 185, 80],
    mechanic: [188, 63, 188],
    warning: [227, 179, 65],
    ui: [201, 209, 217],
  }),
  dark: Object.freeze({
    background: [30, 30, 30],
    platform: [45, 45, 45],
    player: [86, 156, 214],
    danger: [244, 71, 71],
    checkpoint: [220, 180, 70],
    accent: [78, 201, 176],
    mechanic: [197, 134, 192],
    warning: [220, 180, 70],
    ui: [212, 212, 212],
  }),
  light: Object.freeze({
    background: [255, 255, 255],
    platform: [224, 224, 224],
    player: [0, 0, 255],
    danger: [205, 49, 49],
    checkpoint: [160, 110, 0],
    accent: [0, 128, 0],
    mechanic: [128, 0, 128],
    warning: [160, 110, 0],
    ui: [51, 51, 51],
  }),
  blueprint: Object.freeze({
    background: [26, 35, 126],
    platform: [57, 73, 171],
    player: [255, 255, 255],
    danger: [255, 82, 82],
    checkpoint: [255, 215, 80],
    accent: [105, 240, 174],
    mechanic: [206, 147, 216],
    warning: [255, 215, 80],
    ui: [187, 222, 251],
  }),
  bsod: Object.freeze({
    background: [0, 0, 170],
    platform: [0, 0, 221],
    player: [255, 255, 255],
    danger: [255, 0, 0],
    checkpoint: [255, 255, 85],
    accent: [85, 255, 85],
    mechanic: [255, 85, 255],
    warning: [255, 255, 85],
    ui: [170, 170, 170],
  }),
});

export const DEFAULT_TILE_PALETTE = TILE_THEME_PALETTES.terminal;
export const CHECKPOINT_CONFIRMATION_DURATION = 0.5;

export function getTilePalette(themeId) {
  return TILE_THEME_PALETTES[themeId] ?? DEFAULT_TILE_PALETTE;
}

function rgb(k, value) {
  return k.rgb(value[0], value[1], value[2]);
}

function colorForTile(tile, palette, activated = false) {
  if (tile.kind === TILE_KINDS.PLATFORM) return palette.platform;
  if (tile.kind === TILE_KINDS.LETHAL) return palette.danger;
  if (tile.kind === TILE_KINDS.GOAL) return palette.accent;
  if (tile.kind === TILE_KINDS.CHECKPOINT) {
    return activated ? palette.accent : palette.checkpoint;
  }
  if (tile.role === "warning") return palette.warning;
  if (tile.role === "barrier") return palette.danger;
  return palette.mechanic;
}

function colorForTileState(tile, palette, state) {
  if (state === "resolved") return palette.accent;
  if (state === "conflict") return palette.danger;
  return colorForTile(tile, palette);
}

function levelTileComponent(k, tile, initialPalette) {
  let palette = initialPalette;
  const isMovingPlatform = tile.kind === TILE_KINDS.PLATFORM
    && tile.tags?.includes("moving-platform");
  const movingDistance = 72;
  const movingSpeed = 70;
  let movingElapsed = 0;
  let mechanicVisualState = "idle";

  return {
    id: "levelTile",
    levelTileData: tile,
    update() {
      if (!isMovingPlatform) return;
      movingElapsed += Math.max(0, Number(k.dt()) || 0);
      const offset = Math.sin(
        movingElapsed * (movingSpeed / movingDistance),
      ) * movingDistance;
      this.pos.x = tile.bounds.x + offset;
      this.pos.y = tile.bounds.y;
    },
    getMovingPlatformState() {
      if (!isMovingPlatform) return null;
      return Object.freeze({
        origin: Object.freeze({ x: tile.bounds.x, y: tile.bounds.y }),
        distance: movingDistance,
        speed: movingSpeed,
        elapsed: movingElapsed,
      });
    },
    mechanicVisualState,
    applyTilePalette(nextPalette) {
      palette = nextPalette ?? palette;
      if (tile.kind === TILE_KINDS.CHECKPOINT) {
        this.setCheckpointPalette?.(palette);
      } else {
        this.color = rgb(k, colorForTileState(tile, palette, mechanicVisualState));
      }
    },
    setMechanicVisualState(nextState) {
      if (!new Set(["idle", "resolved", "conflict"]).has(nextState)) {
        throw new RangeError(`Unsupported mechanic visual state: ${nextState}`);
      }
      mechanicVisualState = nextState;
      this.mechanicVisualState = nextState;
      this.color = rgb(k, colorForTileState(tile, palette, nextState));
      if (tile.role === "switch") {
        this.text = nextState === "resolved" ? "✓" : nextState === "conflict" ? "!" : "S";
        this.opacity = nextState === "idle" ? 0.65 : 1;
      } else if (tile.role === "barrier") {
        this.opacity = nextState === "resolved" ? 0.18 : 0.85;
      }
      return mechanicVisualState;
    },
  };
}

function checkpointRuntimeComponent(k, initialPalette) {
  let palette = initialPalette;

  return {
    id: "checkpointRuntime",
    checkpointActivated: false,
    checkpointConfirmationRemaining: 0,

    update() {
      this.checkpointConfirmationRemaining = Math.max(
        0,
        this.checkpointConfirmationRemaining - Math.max(0, Number(k.dt()) || 0),
      );
      const size = this.checkpointConfirmationRemaining > 0 ? 1.25 : 1;
      this.scale = k.vec2(size, size);
    },

    setCheckpointActive(active, { confirm = false } = {}) {
      this.checkpointActivated = Boolean(active);
      if (this.checkpointActivated && confirm) {
        this.checkpointConfirmationRemaining = CHECKPOINT_CONFIRMATION_DURATION;
      } else if (!this.checkpointActivated) {
        this.checkpointConfirmationRemaining = 0;
      }
      this.text = this.checkpointActivated ? "✓" : "C";
      this.opacity = this.checkpointActivated ? 1 : 0.65;
      this.color = rgb(
        k,
        colorForTile(
          { kind: TILE_KINDS.CHECKPOINT },
          palette,
          this.checkpointActivated,
        ),
      );
      return this.checkpointActivated;
    },

    setCheckpointPalette(nextPalette) {
      palette = nextPalette ?? palette;
      this.setCheckpointActive(this.checkpointActivated);
    },
  };
}

/**
 * Convert one parsed tile entity into KAPLAY components. Future mechanics can
 * add behavior by consuming `levelTileData` without changing the parser.
 */
export function createTileComponents(k, tile, {
  palette = DEFAULT_TILE_PALETTE,
} = {}) {
  if (!k || !tile?.kind) {
    throw new TypeError("KAPLAY context and parsed tile are required");
  }

  const tags = [...new Set([...(tile.tags ?? []), "level-entity"])];
  const metadata = levelTileComponent(k, tile, palette);

  if (tile.kind === TILE_KINDS.PLATFORM) {
    return [
      k.rect(tile.size.width, tile.size.height),
      k.pos(tile.bounds.x, tile.bounds.y),
      k.anchor("topleft"),
      k.area(),
      k.body({ isStatic: true }),
      k.color(...palette.platform),
      metadata,
      ...tags,
    ];
  }

  if (tile.kind === TILE_KINDS.LETHAL) {
    return [
      k.rect(tile.size.width, tile.size.height),
      k.pos(tile.bounds.x, tile.bounds.y),
      k.anchor("topleft"),
      k.area(),
      k.color(...palette.danger),
      metadata,
      ...tags,
    ];
  }

  if (tile.kind === TILE_KINDS.CHECKPOINT) {
    return [
      k.text("C", { size: Math.max(24, tile.size.height * 0.75) }),
      k.pos(tile.position.x, tile.position.y),
      k.anchor("center"),
      k.area(),
      k.scale(1),
      k.color(...palette.checkpoint),
      k.opacity(0.65),
      checkpointRuntimeComponent(k, palette),
      metadata,
      ...tags,
    ];
  }

  if (tile.kind === TILE_KINDS.GOAL) {
    return [
      k.text("EXIT", { size: Math.max(18, tile.size.height * 0.42) }),
      k.pos(tile.position.x, tile.position.y),
      k.anchor("center"),
      k.area(),
      k.color(...palette.accent),
      k.opacity(0.95),
      metadata,
      ...tags,
    ];
  }

  if (tile.kind === TILE_KINDS.MECHANIC) {
    const isTextMarker = tile.role === "switch" || tile.role === "warning";
    const marker = tile.role === "switch" ? "S" : "⚠";
    const visual = isTextMarker
      ? [
        k.text(marker, { size: Math.max(24, tile.size.height * 0.7) }),
        k.pos(tile.position.x, tile.position.y),
        k.anchor("center"),
      ]
      : [
        k.rect(tile.size.width, tile.size.height),
        k.pos(tile.bounds.x, tile.bounds.y),
        k.anchor("topleft"),
      ];

    const components = [
      ...visual,
      k.area(),
      k.color(...colorForTile(tile, palette)),
      k.opacity(tile.solid ? 0.85 : 0.28),
    ];
    if (tile.solid) components.push(k.body({ isStatic: true }));
    components.push(metadata, ...tags);
    return components;
  }

  return [];
}
