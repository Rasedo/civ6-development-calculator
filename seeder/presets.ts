/**
 * WORLD PRESETS — named knob sets over the seeder. `baseline` states today's
 * generation verbatim and keeps today's paths (seeder/worlds + worlds.lock);
 * every other preset writes its own fixture family under
 * seeder/worlds/presets/<name>/ with its OWN lock, so the baseline set and
 * its fixed seeds never move and the battery's globs never see a preset.
 *
 * This file is .ts under seeder/ ON PURPOSE: genStamp hashes every .ts here,
 * so a knob change moves the stamp — a JSON would let generation change with
 * the stamp standing still, the exact hazard the CITY_STATE_NAMES copy in
 * place.ts exists to prevent.
 *
 * Each preset's seed family is DISJOINT (firstSeed + 13*k), so no two
 * presets ever share a seed number, a fixture name, or an rngInit. One GPU
 * batch is ONE preset — the engine asserts shape uniformity across its
 * fixtures — and the observation width moves with civCount/cityStateMax, so
 * nets and checkpoints are per-preset.
 */
export interface WorldPreset {
  nSeeds: number;
  firstSeed: number;
  width: number;
  height: number;
  civCount: number;
  cityStateMax: number;
  layout: 'continents' | 'pangaea' | 'islands';
  landFraction: number;
  /** scales the one-resource-per-9-land-tiles quota */
  resourceMult: number;
  /** bonus / luxury / strategic draw weights (normalised at use) */
  resourceWeights: [number, number, number];
}

export const WORLD_PRESETS: Record<string, WorldPreset> = {
  baseline: {
    nSeeds: 12, firstSeed: 9001, width: 44, height: 26, civCount: 3, cityStateMax: 3,
    layout: 'continents', landFraction: 0.35, resourceMult: 1, resourceWeights: [0.45, 0.35, 0.2],
  },
  'duel-pangaea': {
    nSeeds: 6, firstSeed: 9501, width: 44, height: 26, civCount: 2, cityStateMax: 3,
    layout: 'pangaea', landFraction: 0.35, resourceMult: 1, resourceWeights: [0.45, 0.35, 0.2],
  },
  islands: {
    nSeeds: 6, firstSeed: 9701, width: 44, height: 26, civCount: 3, cityStateMax: 4,
    layout: 'islands', landFraction: 0.3, resourceMult: 1, resourceWeights: [0.45, 0.35, 0.2],
  },
  abundant: {
    nSeeds: 6, firstSeed: 9901, width: 44, height: 26, civCount: 3, cityStateMax: 3,
    layout: 'continents', landFraction: 0.35, resourceMult: 1.6, resourceWeights: [0.3, 0.3, 0.4],
  },
  solo: {
    nSeeds: 3, firstSeed: 9301, width: 44, height: 26, civCount: 1, cityStateMax: 3,
    layout: 'continents', landFraction: 0.35, resourceMult: 1, resourceWeights: [0.45, 0.35, 0.2],
  },
};
