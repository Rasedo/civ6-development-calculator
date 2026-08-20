/**
 * RIVER FLOOD magnitudes, from the Gathering Storm Flood page's two tables.
 *
 * Severity runs Moderate, Major, 1000 Year. Every array below is indexed by
 * that, and every probability is the page's own percentage.
 */

/**
 * How often each severity comes up. NOT sourced: the page says only that "the
 * Disaster Intensity setting of the game controls what levels of flooding will
 * occur more often", and publishes no distribution. This split is a
 * stylization — the shape (Moderate common, 1000 Year rare) is the sourced
 * part, the numbers are not.
 */
export const FLOOD_SEVERITY_P = [0.6, 0.3, 0.1] as const;

/** "Improvement — Pillaged: 100%; Destroyed: 50% / 80%". A flood always
 *  pillages; these are the chances it takes the improvement away entirely. */
export const FLOOD_DESTROY_P = [0, 0.5, 0.8] as const;
/** "District — 0 / 50% / 80%". A damaged district takes its buildings dark
 *  with it, which is the page's "Building 100%" column. */
export const FLOOD_DISTRICT_P = [0, 0.5, 0.8] as const;
/** "Population" and "Civilians killed", which the page gives the same
 *  percentage at every severity. */
export const FLOOD_POP_P = [0, 0.15, 0.25] as const;
/** "Units" and "Garrison — 30-50 HP / 50-70 HP", inclusive of both ends. */
export const FLOOD_DAMAGE_LO = [0, 30, 50] as const;
export const FLOOD_DAMAGE_HI = [0, 50, 70] as const;

/**
 * "Floods fertilize each type of Floodplains differently... Each expresses the
 * chance of a tile to gain +1 of the given yield, and note that a single tile
 * may gain BOTH yields from the same flood." Columns are Plains, Grassland,
 * Desert floodplains, in that order.
 */
export const FLOOD_FERT_FOOD = [
  [0.30, 0.15, 0.25],
  [0.45, 0.25, 0.30],
  [0.60, 0.40, 0.45],
] as const;
export const FLOOD_FERT_PROD = [
  [0, 0, 0],
  [0.10, 0.30, 0.15],
  [0.15, 0.40, 0.25],
] as const;

/** Which fertility column a floodplain's terrain reads. Real Civ 6 puts
 *  Floodplains on Plains, Grassland and Desert; this generator makes only the
 *  Desert kind, so the other two columns are shipped and unreached. */
export function floodTerrainColumn(terrain: string): number {
  if (terrain === 'PLAINS') return 0;
  if (terrain === 'GRASSLAND') return 1;
  return 2;
}
