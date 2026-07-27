const MIN_SWITCHES_PER_SECTION = 2;
const MAX_SWITCHES_PER_SECTION = 4;

function nonEmptyId(value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${path} must be a non-empty string`);
  }
  return value.trim();
}

/** Validate and normalize declarative Merge sections without KAPLAY. */
export function validateMergeSections(sections, { minimumSections = 1 } = {}) {
  if (!Number.isInteger(minimumSections) || minimumSections < 1) {
    throw new RangeError("minimumSections must be a positive integer");
  }
  if (!Array.isArray(sections) || sections.length < minimumSections) {
    throw new RangeError(`merge barrier requires at least ${minimumSections} sections`);
  }

  const sectionIds = new Set();
  const wallIds = new Set();
  const switchIds = new Set();

  return Object.freeze(sections.map((section, sectionIndex) => {
    const path = `sections[${sectionIndex}]`;
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      throw new TypeError(`${path} must be an object`);
    }
    const id = nonEmptyId(section.id, `${path}.id`);
    const wallId = nonEmptyId(section.wallId, `${path}.wallId`);
    if (sectionIds.has(id)) throw new RangeError(`duplicate section id '${id}'`);
    if (wallIds.has(wallId)) throw new RangeError(`duplicate wall id '${wallId}'`);
    sectionIds.add(id);
    wallIds.add(wallId);

    if (
      !Array.isArray(section.switches)
      || section.switches.length < MIN_SWITCHES_PER_SECTION
      || section.switches.length > MAX_SWITCHES_PER_SECTION
    ) {
      throw new RangeError(`${path}.switches must contain between 2 and 4 switches`);
    }

    let correctCount = 0;
    const switches = section.switches.map((entry, switchIndex) => {
      const switchPath = `${path}.switches[${switchIndex}]`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new TypeError(`${switchPath} must be an object`);
      }
      const switchId = nonEmptyId(entry.id, `${switchPath}.id`);
      if (switchIds.has(switchId)) {
        throw new RangeError(`duplicate switch id '${switchId}'`);
      }
      switchIds.add(switchId);
      const correct = entry.correct === true;
      if (correct) correctCount += 1;
      return Object.freeze({ id: switchId, correct });
    });

    if (correctCount !== 1) {
      throw new RangeError(`${path} must contain exactly one correct switch`);
    }
    return Object.freeze({ id, wallId, switches: Object.freeze(switches) });
  }));
}

/**
 * Pure Merge Barrier state machine. Incorrect activations set one global flag;
 * they never toggle it, and every switch can transition only once.
 */
export function createMergeBarrierMachine({
  sections,
  minimumSections = 1,
} = {}) {
  const definitions = validateMergeSections(sections, { minimumSections });
  const switches = new Map();
  definitions.forEach((section) => section.switches.forEach((entry) => {
    switches.set(entry.id, Object.freeze({ ...entry, sectionId: section.id, wallId: section.wallId }));
  }));

  let controlsInverted = false;
  const activatedSwitches = new Set();
  const resolvedSections = new Set();
  const conflictedSections = new Set();

  const getState = () => Object.freeze({
    controlsInverted,
    sections: Object.freeze(definitions.map((section) => Object.freeze({
      id: section.id,
      wallId: section.wallId,
      wallOpen: resolvedSections.has(section.id),
      feedback: resolvedSections.has(section.id)
        ? "resolved"
        : conflictedSections.has(section.id) ? "conflict" : "idle",
      switches: Object.freeze(section.switches.map((entry) => Object.freeze({
        id: entry.id,
        correct: entry.correct,
        activated: activatedSwitches.has(entry.id),
      }))),
    }))),
  });

  return Object.freeze({
    getState,
    activateSwitch(switchId) {
      const definition = switches.get(switchId);
      if (!definition) {
        return Object.freeze({ accepted: false, kind: "unknown", switchId });
      }
      if (activatedSwitches.has(switchId)) {
        return Object.freeze({
          accepted: false,
          kind: "already-activated",
          switchId,
          sectionId: definition.sectionId,
          controlsInverted,
        });
      }

      activatedSwitches.add(switchId);
      if (definition.correct) {
        resolvedSections.add(definition.sectionId);
        return Object.freeze({
          accepted: true,
          kind: "correct",
          switchId,
          sectionId: definition.sectionId,
          wallId: definition.wallId,
          controlsInverted,
        });
      }

      controlsInverted = true;
      conflictedSections.add(definition.sectionId);
      return Object.freeze({
        accepted: true,
        kind: "incorrect",
        switchId,
        sectionId: definition.sectionId,
        wallId: definition.wallId,
        controlsInverted,
      });
    },
    reset() {
      controlsInverted = false;
      activatedSwitches.clear();
      resolvedSections.clear();
      conflictedSections.clear();
      return getState();
    },
  });
}

/** Attach the pure state machine to already-instantiated Merge tile objects. */
export function attachMergeBarrierRuntime({
  player,
  mechanic,
  entries = [],
  audioManager,
} = {}) {
  if (!player?.onCollide || !mechanic?.params) {
    throw new TypeError("player and merge mechanic configuration are required");
  }

  const machine = createMergeBarrierMachine({
    sections: mechanic.params.sections,
    minimumSections: mechanic.params.minimumSections ?? 1,
  });
  const entryForObject = new Map(entries.map((entry) => [entry.object, entry]));

  const activateSwitch = (switchId, sourceObject) => {
    const result = machine.activateSwitch(switchId);
    if (!result.accepted) return result;

    audioManager?.playSfx?.("switch");
    if (result.kind === "incorrect") {
      player.setControlsInverted(true);
      sourceObject?.setMechanicVisualState?.("conflict");
    } else {
      entries.forEach(({ zone, object }) => {
        if (zone.role !== "barrier" || zone.mechanic.params.wallId !== result.wallId) return;
        object.setMechanicVisualState?.("resolved");
        object.unuse?.("body");
      });
      sourceObject?.setMechanicVisualState?.("resolved");
    }
    return result;
  };

  player.onCollide("merge-switch", (object) => {
    const entry = entryForObject.get(object);
    const switchId = entry?.zone.mechanic.params.switchId;
    if (switchId) activateSwitch(switchId, object);
  });

  return Object.freeze({
    type: "mergeBarrier",
    id: mechanic.id,
    activateSwitch(switchId) {
      const entry = entries.find(({ zone }) => zone.mechanic.params.switchId === switchId);
      return activateSwitch(switchId, entry?.object);
    },
    getState: machine.getState,
  });
}
