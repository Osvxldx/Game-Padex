function clonePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError("checkpoint positions require finite x and y values");
  }
  return Object.freeze({ x: point.x, y: point.y });
}

/**
 * Minimal checkpoint contract for gameplay systems. Task 9.1 can add tile and
 * visual metadata without changing the death system's getLastCheckpoint API.
 */
export function createCheckpointState(initialSpawn) {
  const spawn = clonePoint(initialSpawn);
  let lastCheckpoint = spawn;

  return Object.freeze({
    getInitialSpawn: () => ({ ...spawn }),
    getLastCheckpoint: () => ({ ...lastCheckpoint }),
    activateCheckpoint(position) {
      lastCheckpoint = clonePoint(position);
      return { ...lastCheckpoint };
    },
    reset() {
      lastCheckpoint = spawn;
      return { ...lastCheckpoint };
    },
    getState: () => Object.freeze({
      initialSpawn: { ...spawn },
      lastCheckpoint: { ...lastCheckpoint },
    }),
  });
}

/**
 * Narrow adapter consumed by respawn. The future warnings system only needs to
 * provide getWarningCount() and resetWarnings(), keeping this task independent
 * from warning collection and delayed-input mechanics.
 */
export function createWarningResetContract({
  getWarningCount = () => 0,
  resetWarnings = () => {},
} = {}) {
  return Object.freeze({
    getCount() {
      const count = Number(getWarningCount());
      return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
    },
    reset() {
      resetWarnings();
      return this.getCount();
    },
  });
}
