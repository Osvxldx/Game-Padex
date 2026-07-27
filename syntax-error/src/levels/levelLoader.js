import {
  DEFAULT_TILE_CONFIG,
  TILE_KINDS,
  createTileComponents,
} from "./tileConfig.js";

const VALID_KINDS = new Set(Object.values(TILE_KINDS));

export class LevelValidationError extends Error {
  constructor(message, path = "level") {
    super(`${path}: ${message}`);
    this.name = "LevelValidationError";
    this.path = path;
  }
}

function fail(message, path) {
  throw new LevelValidationError(message, path);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, path) {
  if (!isRecord(value)) fail("must be an object", path);
  return value;
}

function requireNonEmptyString(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("must be a non-empty string", path);
  }
  return value.trim();
}

function requirePositiveNumber(value, path) {
  if (!Number.isFinite(value) || value <= 0) {
    fail("must be a finite positive number", path);
  }
  return value;
}

function normalizePoint(value, path) {
  requireRecord(value, path);
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    fail("must contain finite x and y values", path);
  }
  return Object.freeze({ x: value.x, y: value.y });
}

function normalizeTileSize(value) {
  if (Number.isFinite(value)) {
    const size = requirePositiveNumber(value, "level.tileSize");
    return Object.freeze({ width: size, height: size });
  }

  requireRecord(value, "level.tileSize");
  return Object.freeze({
    width: requirePositiveNumber(value.width, "level.tileSize.width"),
    height: requirePositiveNumber(value.height, "level.tileSize.height"),
  });
}

function normalizeTilemap(tilemap) {
  if (!Array.isArray(tilemap) || tilemap.length === 0) {
    fail("must be a non-empty array of strings", "level.tilemap");
  }

  const rows = tilemap.map((row, index) => {
    if (typeof row !== "string" || row.length === 0) {
      fail("must be a non-empty string", `level.tilemap[${index}]`);
    }
    return row;
  });
  const width = rows[0].length;
  rows.forEach((row, index) => {
    if (row.length !== width) {
      fail(
        `row has width ${row.length}; expected ${width}`,
        `level.tilemap[${index}]`,
      );
    }
  });
  return Object.freeze([...rows]);
}

function normalizeSymbolConfig(value = {}) {
  requireRecord(value, "level.symbolConfig");
  const result = {};

  for (const [symbol, config] of Object.entries(value)) {
    if ([...symbol].length !== 1) {
      fail("keys must be exactly one character", `level.symbolConfig.${symbol}`);
    }
    requireRecord(config, `level.symbolConfig.${symbol}`);
    if (config.tags !== undefined && (
      !Array.isArray(config.tags)
      || config.tags.some((tag) => typeof tag !== "string" || !tag)
    )) {
      fail("tags must be an array of non-empty strings", `level.symbolConfig.${symbol}.tags`);
    }
    if (config.params !== undefined && !isRecord(config.params)) {
      fail("must be an object", `level.symbolConfig.${symbol}.params`);
    }
    result[symbol] = Object.freeze({
      ...config,
      ...(config.tags ? { tags: Object.freeze([...config.tags]) } : {}),
      ...(config.params ? { params: Object.freeze({ ...config.params }) } : {}),
    });
  }
  return Object.freeze(result);
}

function normalizeMechanics(value = []) {
  if (!Array.isArray(value)) fail("must be an array", "level.mechanics");
  const ids = new Set();

  return Object.freeze(value.map((mechanic, index) => {
    const path = `level.mechanics[${index}]`;
    requireRecord(mechanic, path);
    const id = requireNonEmptyString(mechanic.id, `${path}.id`);
    const type = requireNonEmptyString(mechanic.type, `${path}.type`);
    if (ids.has(id)) fail(`duplicate mechanic id '${id}'`, `${path}.id`);
    ids.add(id);
    if (mechanic.params !== undefined && !isRecord(mechanic.params)) {
      fail("must be an object", `${path}.params`);
    }
    return Object.freeze({
      id,
      type,
      enabled: mechanic.enabled !== false,
      params: Object.freeze({ ...(mechanic.params ?? {}) }),
    });
  }));
}

function normalizeLevelData(levelData) {
  requireRecord(levelData, "level");
  if (!Number.isInteger(levelData.id) || levelData.id <= 0) {
    fail("must be a positive integer", "level.id");
  }

  const musicTrack = levelData.musicTrack === undefined
    || levelData.musicTrack === null
    ? null
    : requireNonEmptyString(levelData.musicTrack, "level.musicTrack");

  return Object.freeze({
    id: levelData.id,
    name: requireNonEmptyString(levelData.name, "level.name"),
    tilemap: normalizeTilemap(levelData.tilemap),
    tileSize: normalizeTileSize(levelData.tileSize),
    origin: normalizePoint(levelData.origin, "level.origin"),
    musicTrack,
    symbolConfig: normalizeSymbolConfig(levelData.symbolConfig),
    mechanics: normalizeMechanics(levelData.mechanics),
  });
}

function normalizedDescriptor(symbol, baseTileConfig, symbolConfig) {
  const base = baseTileConfig[symbol];
  if (!isRecord(base)) return null;
  const override = symbolConfig[symbol] ?? {};
  const kind = override.kind ?? base.kind;
  if (!VALID_KINDS.has(kind)) {
    fail(`unsupported tile kind '${kind}'`, `level.symbolConfig.${symbol}.kind`);
  }
  const tags = [...new Set([...(base.tags ?? []), ...(override.tags ?? [])])];
  return Object.freeze({ ...base, ...override, kind, tags: Object.freeze(tags) });
}

/** Convert a tile coordinate to immutable world-space bounds and center. */
export function tileToWorld(column, row, tileSize, origin = { x: 0, y: 0 }) {
  if (!Number.isInteger(column) || column < 0) {
    throw new RangeError("column must be a non-negative integer");
  }
  if (!Number.isInteger(row) || row < 0) {
    throw new RangeError("row must be a non-negative integer");
  }
  const size = normalizeTileSize(tileSize);
  const normalizedOrigin = normalizePoint(origin, "origin");
  const x = normalizedOrigin.x + column * size.width;
  const y = normalizedOrigin.y + row * size.height;

  return Object.freeze({
    tile: Object.freeze({ column, row }),
    bounds: Object.freeze({ x, y, width: size.width, height: size.height }),
    position: Object.freeze({
      x: x + size.width / 2,
      y: y + size.height / 2,
    }),
    size,
  });
}

function resolveMechanic(descriptor, mechanics, symbol, row, column) {
  const type = requireNonEmptyString(
    descriptor.mechanicType,
    `tile '${symbol}' at row ${row}, column ${column}.mechanicType`,
  );
  const candidates = mechanics.filter((mechanic) => mechanic.type === type);
  let mechanic;

  if (descriptor.mechanicId !== undefined) {
    mechanic = mechanics.find((entry) => entry.id === descriptor.mechanicId);
    if (!mechanic) {
      fail(
        `references unknown mechanic '${descriptor.mechanicId}'`,
        `tile '${symbol}' at row ${row}, column ${column}`,
      );
    }
    if (mechanic.type !== type) {
      fail(
        `mechanic '${mechanic.id}' has type '${mechanic.type}', expected '${type}'`,
        `tile '${symbol}' at row ${row}, column ${column}`,
      );
    }
  } else if (candidates.length === 1) {
    [mechanic] = candidates;
  } else if (candidates.length === 0) {
    fail(
      `requires a '${type}' mechanic configuration`,
      `tile '${symbol}' at row ${row}, column ${column}`,
    );
  } else {
    fail(
      `matches multiple '${type}' mechanics; set symbolConfig.${symbol}.mechanicId`,
      `tile '${symbol}' at row ${row}, column ${column}`,
    );
  }

  return Object.freeze({
    id: mechanic.id,
    type: mechanic.type,
    enabled: mechanic.enabled,
    params: Object.freeze({ ...mechanic.params, ...(descriptor.params ?? {}) }),
  });
}

/**
 * Validate and parse LevelData without touching KAPLAY or browser globals.
 * The result is the canonical source for runtime entity instantiation.
 */
export function parseLevelData(levelData, {
  tileConfig = DEFAULT_TILE_CONFIG,
} = {}) {
  const level = normalizeLevelData(levelData);
  requireRecord(tileConfig, "tileConfig");

  const entities = [];
  const platforms = [];
  const lethalObstacles = [];
  const checkpoints = [];
  const mechanicZones = [];
  let spawn = null;

  level.tilemap.forEach((line, row) => {
    [...line].forEach((symbol, column) => {
      const tilePath = `tile '${symbol}' at row ${row}, column ${column}`;
      const descriptor = normalizedDescriptor(
        symbol,
        tileConfig,
        level.symbolConfig,
      );
      if (!descriptor) fail("uses an unknown symbol", tilePath);
      if (descriptor.kind === TILE_KINDS.EMPTY) return;

      const location = tileToWorld(column, row, level.tileSize, level.origin);
      const entity = {
        symbol,
        kind: descriptor.kind,
        tags: descriptor.tags,
        ...location,
      };

      if (descriptor.kind === TILE_KINDS.SPAWN) {
        if (spawn) fail("player spawn is duplicated", tilePath);
        spawn = Object.freeze({ id: "player-spawn", ...entity });
        entities.push(spawn);
        return;
      }

      if (descriptor.kind === TILE_KINDS.CHECKPOINT) {
        const checkpoint = Object.freeze({
          id: `checkpoint-${checkpoints.length + 1}`,
          ...entity,
        });
        checkpoints.push(checkpoint);
        entities.push(checkpoint);
        return;
      }

      if (descriptor.kind === TILE_KINDS.MECHANIC) {
        const mechanic = resolveMechanic(
          descriptor,
          level.mechanics,
          symbol,
          row,
          column,
        );
        const zone = Object.freeze({
          id: `${mechanic.id}:${descriptor.role ?? "zone"}:${mechanicZones.length + 1}`,
          ...entity,
          role: descriptor.role ?? "zone",
          solid: descriptor.solid === true,
          mechanic,
        });
        mechanicZones.push(zone);
        entities.push(zone);
        return;
      }

      const frozenEntity = Object.freeze(entity);
      entities.push(frozenEntity);
      if (descriptor.kind === TILE_KINDS.PLATFORM) platforms.push(frozenEntity);
      if (descriptor.kind === TILE_KINDS.LETHAL) lethalObstacles.push(frozenEntity);
    });
  });

  if (!spawn) fail("must contain exactly one '@' player spawn", "level.tilemap");
  if (checkpoints.length === 0) {
    fail("must contain at least one 'C' checkpoint", "level.tilemap");
  }

  const mapWidth = level.tilemap[0].length;
  const mapHeight = level.tilemap.length;
  const worldWidth = mapWidth * level.tileSize.width;
  const worldHeight = mapHeight * level.tileSize.height;

  return Object.freeze({
    id: level.id,
    name: level.name,
    musicTrack: level.musicTrack,
    data: level,
    mapWidth,
    mapHeight,
    tileSize: level.tileSize,
    origin: level.origin,
    worldWidth,
    worldHeight,
    worldBounds: Object.freeze({
      left: level.origin.x,
      top: level.origin.y,
      right: level.origin.x + worldWidth,
      bottom: level.origin.y + worldHeight,
    }),
    spawn,
    checkpoints: Object.freeze(checkpoints),
    platforms: Object.freeze(platforms),
    lethalObstacles: Object.freeze(lethalObstacles),
    mechanicZones: Object.freeze(mechanicZones),
    entities: Object.freeze(entities),
  });
}

/** Materialize a previously parsed level below a caller-owned gameplay root. */
export function instantiateParsedLevel(k, parsedLevel, {
  parent,
  palette,
} = {}) {
  if (!k || !parsedLevel?.entities || typeof parent?.add !== "function") {
    throw new TypeError("KAPLAY context, parsed level, and parent are required");
  }

  const objects = [];
  const byId = new Map();
  const byKind = new Map();

  for (const entity of parsedLevel.entities) {
    if (entity.kind === TILE_KINDS.SPAWN) continue;
    const components = createTileComponents(k, entity, { palette });
    if (components.length === 0) continue;
    const object = parent.add(components);
    objects.push(object);
    if (entity.id) byId.set(entity.id, object);
    const kindObjects = byKind.get(entity.kind) ?? [];
    kindObjects.push(object);
    byKind.set(entity.kind, kindObjects);
  }

  return Object.freeze({
    objects: Object.freeze(objects),
    byId,
    byKind,
    checkpoints: Object.freeze(parsedLevel.checkpoints.map((entry) => byId.get(entry.id))),
    platforms: Object.freeze(byKind.get(TILE_KINDS.PLATFORM) ?? []),
    lethalObstacles: Object.freeze(byKind.get(TILE_KINDS.LETHAL) ?? []),
    mechanicZones: Object.freeze(parsedLevel.mechanicZones.map((entry) => byId.get(entry.id))),
  });
}
