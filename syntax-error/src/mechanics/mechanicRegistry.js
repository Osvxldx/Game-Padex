import { attachMergeBarrierRuntime } from "./mergeBarrier.js";

export const DEFAULT_MECHANIC_FACTORIES = Object.freeze({
  mergeBarrier: attachMergeBarrierRuntime,
});

/**
 * Instantiate enabled level mechanics by type. The game scene only supplies
 * shared context; adding another mechanic requires registering one factory.
 */
export function attachLevelMechanics({
  parsedLevel,
  instantiated,
  factories = DEFAULT_MECHANIC_FACTORIES,
  ...context
} = {}) {
  if (!parsedLevel?.data?.mechanics || !instantiated?.byId) {
    throw new TypeError("parsedLevel and instantiated level objects are required");
  }

  const runtimes = new Map();
  for (const mechanic of parsedLevel.data.mechanics) {
    if (!mechanic.enabled) continue;
    const factory = factories[mechanic.type];
    if (typeof factory !== "function") continue;

    const entries = parsedLevel.mechanicZones
      .filter((zone) => zone.mechanic.id === mechanic.id)
      .map((zone) => Object.freeze({
        zone,
        object: instantiated.byId.get(zone.id),
      }))
      .filter(({ object }) => Boolean(object));

    const runtime = factory({ ...context, mechanic, entries });
    if (runtime) runtimes.set(mechanic.id, runtime);
  }
  return runtimes;
}
