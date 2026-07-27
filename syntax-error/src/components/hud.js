import {
  COMMENT_COOLDOWN,
  COMMENT_DURATION,
} from "../constants.js";

export const HUD_WARNING_LIMIT = 20;
export const THEME_TRANSITION_DURATION = 0.2;
export const PRESENTATION_EVENTS = Object.freeze({
  WARNING_COUNT_CHANGED: "warning-count-changed",
  MERGE_CONFLICT: "merge-conflict",
  GARBAGE_COLLECTOR_PROGRESS: "garbage-collector-progress",
  GHOST_CLONE: "ghost-clone",
  CLEAR_GHOST_CLONES: "clear-ghost-clones",
});

const VISUAL_CONTRAST = Object.freeze({
  platform: 3,
  player: 4.5,
  danger: 3,
  checkpoint: 3,
  accent: 3,
  mechanic: 3,
  warning: 3,
  ui: 4.5,
});

let nextTransientId = 1;

export function clamp01(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric));
}

export function normalizeWarningCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(HUD_WARNING_LIMIT, Math.trunc(numeric));
}

function normalizeRgb(color) {
  if (!Array.isArray(color) || color.length < 3) {
    throw new TypeError("colors must be RGB arrays");
  }
  return color.slice(0, 3).map((channel) => {
    const numeric = Number(channel);
    return Math.round(Math.min(255, Math.max(0, Number.isFinite(numeric) ? numeric : 0)));
  });
}

function linearChannel(channel) {
  const srgb = channel / 255;
  return srgb <= 0.04045
    ? srgb / 12.92
    : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color) {
  const [red, green, blue] = normalizeRgb(color).map(linearChannel);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixColor(from, to, amount) {
  return from.map((channel, index) => Math.round(
    channel + (to[index] - channel) * amount,
  ));
}

/** Return the smallest black/white blend that reaches the requested ratio. */
export function ensureColorContrast(foreground, background, minimumRatio = 3) {
  const source = normalizeRgb(foreground);
  const backdrop = normalizeRgb(background);
  const requestedRatio = Number.isFinite(minimumRatio)
    ? Math.max(1, minimumRatio)
    : 3;
  if (contrastRatio(source, backdrop) >= requestedRatio) return source;

  const black = [0, 0, 0];
  const white = [255, 255, 255];
  const target = contrastRatio(black, backdrop) >= contrastRatio(white, backdrop)
    ? black
    : white;
  if (contrastRatio(target, backdrop) < requestedRatio) return target;

  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const middle = (low + high) / 2;
    if (contrastRatio(mixColor(source, target, middle), backdrop) >= requestedRatio) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return mixColor(source, target, high);
}

/**
 * Keep each theme's hue whenever possible while enforcing WCAG-oriented
 * contrast for text/player glyphs and 3:1 contrast for large game shapes.
 */
export function createAccessibleGameplayPalette(palette) {
  if (!palette?.background) throw new TypeError("a gameplay palette is required");
  const background = normalizeRgb(palette.background);
  const accessible = { background };

  for (const [role, minimumRatio] of Object.entries(VISUAL_CONTRAST)) {
    accessible[role] = ensureColorContrast(
      palette[role] ?? palette.ui ?? [255, 255, 255],
      background,
      minimumRatio,
    );
  }

  return Object.freeze(Object.fromEntries(
    Object.entries(accessible).map(([key, value]) => [key, Object.freeze(value)]),
  ));
}

export function cooldownHudState(abilityState = {}) {
  const isCommented = Boolean(abilityState.isCommented);
  const commentRemaining = Math.max(0, Number(abilityState.commentRemaining) || 0);
  const cooldownRemaining = Math.max(0, Number(abilityState.cooldownRemaining) || 0);

  if (isCommented) {
    return Object.freeze({
      mode: "active",
      label: `COMMENT ACTIVO ${commentRemaining.toFixed(1)}s`,
      progress: clamp01(commentRemaining / COMMENT_DURATION),
      remaining: commentRemaining,
    });
  }
  if (cooldownRemaining > 0) {
    return Object.freeze({
      mode: "cooldown",
      label: `COOLDOWN ${cooldownRemaining.toFixed(1)}s`,
      progress: clamp01(1 - cooldownRemaining / COMMENT_COOLDOWN),
      remaining: cooldownRemaining,
    });
  }
  return Object.freeze({
    mode: "ready",
    label: "COMMENT LISTO [Shift/C]",
    progress: 1,
    remaining: 0,
  });
}

export function createHudSnapshot({
  levelId,
  levelName = "",
  warningCount = 0,
  abilityState,
} = {}) {
  const safeLevelId = Number.isInteger(levelId) && levelId > 0 ? levelId : 1;
  const safeName = typeof levelName === "string" ? levelName.trim() : "";
  return Object.freeze({
    levelId: safeLevelId,
    levelLabel: `NIVEL ${safeLevelId}${safeName ? ` · ${safeName}` : ""}`,
    warningCount: normalizeWarningCount(warningCount),
    warningLabel: `⚠ WARNINGS ${normalizeWarningCount(warningCount)}/${HUD_WARNING_LIMIT}`,
    cooldown: cooldownHudState(abilityState),
  });
}

export function garbageCollectorApproachPosition(progress, start, end) {
  const amount = clamp01(progress);
  return Object.freeze({
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
  });
}

export function ghostTrailOpacity(index, count) {
  const safeCount = Math.max(1, Math.trunc(Number(count) || 1));
  const safeIndex = Math.min(safeCount - 1, Math.max(0, Math.trunc(Number(index) || 0)));
  return 0.08 + 0.32 * (1 - safeIndex / safeCount);
}

export function themeTransitionOpacity(elapsed, duration = THEME_TRANSITION_DURATION) {
  const safeDuration = Number.isFinite(duration) && duration > 0
    ? duration
    : THEME_TRANSITION_DURATION;
  return 1 - clamp01((Number(elapsed) || 0) / safeDuration);
}

function rgb(k, value) {
  return k.rgb(value[0], value[1], value[2]);
}

function finitePosition(candidate, fallback = { x: 0, y: 0 }) {
  const position = candidate?.position ?? candidate?.pos ?? candidate;
  return {
    x: Number.isFinite(position?.x) ? position.x : fallback.x,
    y: Number.isFinite(position?.y) ? position.y : fallback.y,
  };
}

function addTransient(k, parent, components, duration, onUpdate, onDestroy) {
  let age = 0;
  const id = nextTransientId;
  nextTransientId += 1;
  return parent.add([
    ...components,
    {
      id: `presentationTransient${id}`,
      update() {
        age += Math.max(0, Number(k.dt()) || 0);
        onUpdate?.call(this, age, clamp01(age / duration));
        if (age >= duration) this.destroy();
      },
      destroy() {
        onDestroy?.(this);
      },
    },
  ]);
}

/** Create the always-visible level HUD and expose a narrow warnings contract. */
export function createGameplayHud(k, {
  parent,
  player,
  levelId = 1,
  levelName = "",
  getWarningCount = () => player?.warningCount ?? 0,
  palette,
} = {}) {
  if (!k || typeof parent?.add !== "function" || !player) {
    throw new TypeError("KAPLAY context, parent, and player are required");
  }

  let currentPalette = createAccessibleGameplayPalette(palette);
  let warningOverride = null;
  let lastSnapshot = createHudSnapshot({ levelId, levelName });
  const root = parent.add([
    k.pos(0, 0),
    k.fixed(),
    k.z(300),
    "gameplay-hud",
  ]);

  const levelText = root.add([
    k.text("", { size: 18 }),
    k.pos(22, 18),
    k.anchor("left"),
    k.color(...currentPalette.ui),
  ]);
  const warningText = root.add([
    k.text("", { size: 17 }),
    k.pos(22, 48),
    k.anchor("left"),
    k.color(...currentPalette.warning),
  ]);
  const cooldownPanel = root.add([
    k.rect(272, 48),
    k.pos(k.width() - 292, 14),
    k.anchor("topleft"),
    k.color(...currentPalette.background),
    k.opacity(0.84),
  ]);
  const cooldownText = root.add([
    k.text("", { size: 15 }),
    k.pos(k.width() - 282, 23),
    k.anchor("left"),
    k.color(...currentPalette.ui),
  ]);
  root.add([
    k.rect(250, 7),
    k.pos(k.width() - 282, 48),
    k.anchor("left"),
    k.color(...currentPalette.platform),
    k.opacity(0.9),
  ]);
  const cooldownFill = root.add([
    k.rect(250, 7),
    k.pos(k.width() - 282, 48),
    k.anchor("left"),
    k.color(...currentPalette.accent),
    k.opacity(1),
  ]);

  const render = () => {
    let warnings = warningOverride;
    if (warnings === null) {
      try {
        warnings = getWarningCount();
      } catch {
        warnings = 0;
      }
    }
    const abilityState = player.getCommentAbilityState?.() ?? {
      isCommented: player.isCommented,
      commentRemaining: player.commentTimer,
      cooldownRemaining: player.cooldownTimer,
    };
    lastSnapshot = createHudSnapshot({
      levelId,
      levelName,
      warningCount: warnings,
      abilityState,
    });

    levelText.text = lastSnapshot.levelLabel;
    warningText.text = lastSnapshot.warningLabel;
    cooldownText.text = lastSnapshot.cooldown.label;
    cooldownFill.width = 250 * lastSnapshot.cooldown.progress;
    cooldownFill.color = rgb(
      k,
      lastSnapshot.cooldown.mode === "cooldown"
        ? currentPalette.danger
        : currentPalette.accent,
    );
  };

  root.add([{
    id: "gameplayHudController",
    update: render,
  }]);

  const applyPalette = (nextPalette) => {
    currentPalette = createAccessibleGameplayPalette(nextPalette);
    levelText.color = rgb(k, currentPalette.ui);
    warningText.color = rgb(k, currentPalette.warning);
    cooldownPanel.color = rgb(k, currentPalette.background);
    cooldownText.color = rgb(k, currentPalette.ui);
    render();
    return currentPalette;
  };

  render();
  return Object.freeze({
    root,
    applyPalette,
    setWarningCount(value) {
      warningOverride = normalizeWarningCount(value);
      render();
      return warningOverride;
    },
    clearWarningOverride() {
      warningOverride = null;
      render();
    },
    getState: () => Object.freeze({ ...lastSnapshot, cooldown: { ...lastSnapshot.cooldown } }),
  });
}

/**
 * Scene presentation controller. Current systems call it directly; future
 * mechanic modules can emit PRESENTATION_EVENTS on the player instead.
 */
export function createGameplayVisualEffects(k, {
  parent,
  player,
  palette,
} = {}) {
  if (!k || typeof parent?.add !== "function" || !player) {
    throw new TypeError("KAPLAY context, parent, and player are required");
  }

  let currentPalette = createAccessibleGameplayPalette(palette);
  let deathBursts = 0;
  let checkpointBursts = 0;
  let mergeConflicts = 0;
  let themeTransitions = 0;
  let gcTargetProgress = 0;
  let gcDisplayProgress = 0;
  let gcActive = false;
  const activeGhosts = new Set();
  const root = parent.add([k.pos(0, 0), k.z(360), "gameplay-visual-effects"]);

  const robot = root.add([
    // KAPLAY parses "[word]" as a styled-text tag, so the opening bracket is
    // escaped to render the literal "[GC]" label instead of throwing
    // "Styled text error: unclosed tags GC" while building the scene.
    k.text("\\[GC]", { size: 26 }),
    k.pos(k.width() - 45, 120),
    k.anchor("center"),
    k.color(...currentPalette.danger),
    k.opacity(0.35),
    k.scale(1),
    k.z(380),
    "garbage-collector-visual",
  ]);
  robot.hidden = true;

  root.add([{
    id: "garbageCollectorVisualController",
    update() {
      if (!gcActive && gcDisplayProgress <= 0.001) {
        robot.hidden = true;
        return;
      }
      robot.hidden = false;
      const dt = Math.max(0, Number(k.dt()) || 0);
      gcDisplayProgress += (gcTargetProgress - gcDisplayProgress) * Math.min(1, dt * 7);
      const end = {
        x: Math.min(k.width() - 35, player.pos.x + 72),
        y: Math.max(90, player.pos.y - 52),
      };
      const position = garbageCollectorApproachPosition(
        gcDisplayProgress,
        { x: k.width() - 45, y: end.y - 80 },
        end,
      );
      robot.pos.x = position.x;
      robot.pos.y = position.y;
      robot.opacity = 0.35 + 0.65 * gcDisplayProgress;
      const pulse = 1 + Math.sin(gcDisplayProgress * Math.PI * 8) * 0.08;
      robot.scale = k.vec2(pulse, pulse);
    },
  }]);

  const playDeathGlitch = (details = {}) => {
    deathBursts += 1;
    const origin = finitePosition(details, player.pos);
    const glyphs = [";", "/", "0", "1", "{", "}", "<", ">", "#", "!"];
    glyphs.forEach((glyph, index) => {
      const angle = (Math.PI * 2 * index) / glyphs.length;
      const speed = 70 + (index % 4) * 24;
      const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed - 35 };
      addTransient(k, root, [
        k.text(glyph, { size: 21 + (index % 3) * 3 }),
        k.pos(origin.x, origin.y),
        k.anchor("center"),
        k.color(...(index % 2 ? currentPalette.danger : currentPalette.player)),
        k.opacity(0.9),
        k.scale(1),
        k.z(420),
        "death-glitch-particle",
      ], 0.48, function update(age, progress) {
        this.pos.x = origin.x + velocity.x * age + (index % 2 ? 3 : -3) * Math.sin(age * 65);
        this.pos.y = origin.y + velocity.y * age + 150 * age * age;
        this.opacity = 0.9 * (1 - progress);
        const scale = 1 + progress * 0.7;
        this.scale = k.vec2(scale, Math.max(0.08, 1 - progress));
      });
    });
    return true;
  };

  const playCheckpointActivation = (details = {}) => {
    checkpointBursts += 1;
    const origin = finitePosition(details);
    addTransient(k, root, [
      k.rect(44, 44),
      k.pos(origin.x, origin.y),
      k.anchor("center"),
      k.color(...currentPalette.accent),
      k.opacity(0.75),
      k.scale(0.5),
      k.z(390),
      "checkpoint-flash",
    ], 0.55, function update(_age, progress) {
      const scale = 0.5 + progress * 2.6;
      this.scale = k.vec2(scale, scale);
      this.opacity = 0.75 * (1 - progress);
    });

    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      addTransient(k, root, [
        k.text(index % 2 ? "+" : "·", { size: 18 }),
        k.pos(origin.x, origin.y),
        k.anchor("center"),
        k.color(...currentPalette.accent),
        k.opacity(1),
        k.z(400),
        "checkpoint-particle",
      ], 0.62, function update(_age, progress) {
        const distance = 18 + progress * 62;
        this.pos.x = origin.x + Math.cos(angle) * distance;
        this.pos.y = origin.y + Math.sin(angle) * distance - progress * 10;
        this.opacity = 1 - progress;
      });
    }
    return true;
  };

  const showMergeConflict = (details = {}) => {
    mergeConflicts += 1;
    const origin = finitePosition(details, player.pos);
    addTransient(k, root, [
      k.text("<<<<<<< CONFLICT", { size: 22 }),
      k.pos(origin.x, origin.y - 55),
      k.anchor("center"),
      k.color(...currentPalette.danger),
      k.opacity(1),
      k.scale(1),
      k.z(440),
      "merge-conflict-visual",
    ], 1, function update(age, progress) {
      this.pos.x = origin.x + (Math.floor(age * 24) % 2 === 0 ? -5 : 5);
      this.opacity = Math.max(0, 1 - progress * 0.8);
      const pulse = 1 + 0.12 * Math.sin(age * 32);
      this.scale = k.vec2(pulse, pulse);
    });
    return true;
  };

  const addGhostTrail = (position, index = 0) => addTransient(k, root, [
    k.text("·", { size: 18 }),
    k.pos(position.x, position.y),
    k.anchor("center"),
    k.color(...currentPalette.player),
    k.opacity(ghostTrailOpacity(index, 8)),
    k.z(330),
    "ghost-trail",
  ], 0.45, function update(_age, progress) {
    this.opacity = ghostTrailOpacity(index, 8) * (1 - progress);
  });

  const spawnGhostClone = (details = {}) => {
    const origin = finitePosition(details, player.pos);
    const target = details?.target;
    const delay = Math.max(0, Number(details?.delay) || 0);
    const requestedDuration = Number(details?.duration);
    const duration = Number.isFinite(requestedDuration) && requestedDuration > delay
      ? requestedDuration
      : delay + 2.5;
    let trailTimer = 0;
    let trailIndex = 0;
    let clone;
    clone = addTransient(k, root, [
      k.text(typeof details?.text === "string" ? details.text : ";", { size: 48 }),
      k.pos(origin.x, origin.y),
      k.anchor("center"),
      k.color(...currentPalette.player),
      k.opacity(0.38),
      k.z(340),
      "ghost-clone",
    ], duration, function update(age, progress) {
      this.hidden = age < delay;
      if (this.hidden) return;
      if (target?.pos) {
        this.pos.x = target.pos.x;
        this.pos.y = target.pos.y;
      }
      trailTimer += Math.max(0, Number(k.dt()) || 0);
      if (trailTimer >= 0.08) {
        trailTimer = 0;
        addGhostTrail(this.pos, trailIndex);
        trailIndex = (trailIndex + 1) % 8;
      }
      this.opacity = 0.18 + 0.25 * (1 - progress);
    }, () => activeGhosts.delete(clone));
    clone.hidden = delay > 0;
    activeGhosts.add(clone);
    return clone;
  };

  const clearGhostClones = () => {
    const ghosts = [...activeGhosts];
    ghosts.forEach((ghost) => {
      if (ghost?.exists?.() !== false) ghost.destroy();
    });
    activeGhosts.clear();
    return ghosts.length;
  };

  const setGarbageCollectorProgress = (value) => {
    const details = typeof value === "object" && value !== null
      ? value
      : { progress: value };
    gcTargetProgress = clamp01(details.progress);
    gcActive = details.active === undefined ? true : Boolean(details.active);
    if (gcActive) robot.hidden = false;
    return gcTargetProgress;
  };

  const transitionTheme = (previousPalette, nextPalette) => {
    const previous = createAccessibleGameplayPalette(previousPalette);
    const next = createAccessibleGameplayPalette(nextPalette);
    currentPalette = next;
    robot.color = rgb(k, currentPalette.danger);
    if (previous.background.every((channel, index) => channel === next.background[index])) {
      return false;
    }

    themeTransitions += 1;
    addTransient(k, { add: (components) => k.add(components) }, [
      k.rect(k.width(), k.height()),
      k.pos(0, 0),
      k.anchor("topleft"),
      k.fixed(),
      k.color(...previous.background),
      k.opacity(0.68),
      k.z(950),
      "theme-transition",
    ], THEME_TRANSITION_DURATION, function update(age) {
      this.opacity = 0.68 * themeTransitionOpacity(age);
    });
    return true;
  };

  const applyPalette = (nextPalette) => {
    currentPalette = createAccessibleGameplayPalette(nextPalette);
    robot.color = rgb(k, currentPalette.danger);
    return currentPalette;
  };

  player.on?.("player-death", (source) => playDeathGlitch({
    position: { x: player.pos.x, y: player.pos.y },
    source,
  }));
  player.on?.(PRESENTATION_EVENTS.MERGE_CONFLICT, showMergeConflict);
  player.on?.(PRESENTATION_EVENTS.GARBAGE_COLLECTOR_PROGRESS, setGarbageCollectorProgress);
  player.on?.(PRESENTATION_EVENTS.GHOST_CLONE, spawnGhostClone);
  player.on?.(PRESENTATION_EVENTS.CLEAR_GHOST_CLONES, clearGhostClones);

  return Object.freeze({
    root,
    playDeathGlitch,
    playCheckpointActivation,
    showMergeConflict,
    setGarbageCollectorProgress,
    spawnGhostClone,
    clearGhostClones,
    transitionTheme,
    applyPalette,
    getState: () => Object.freeze({
      deathBursts,
      checkpointBursts,
      mergeConflicts,
      themeTransitions,
      garbageCollectorActive: gcActive,
      garbageCollectorProgress: gcTargetProgress,
      activeGhostClones: activeGhosts.size,
    }),
  });
}
