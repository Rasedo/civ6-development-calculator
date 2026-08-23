/**
 * THE CLIMATE ARC — Gathering Storm's CO2, its seven phases, and the sea.
 *
 * Every number below with a CIV6 note is the Climate (Civ6) page's own. The
 * two MODEL notes mark the places that page states qualitatively and never
 * quantifies; each is one modelling choice keyed to published numbers, not a
 * fresh ladder of invented constants.
 */

/**
 * CIV6 (Pollution formulae): "Each type of resource has an assigned number of
 * emitted carbon units per Power generated, which is 820, 490, and 48 for
 * Coal, Oil, and Uranium, respectively."
 *
 * Multiplied by a plant's Power-per-resource (`fuelRate`, 4/4/16) this gives
 * the page's own per-resource figures — 3280, 1960 and 768 raw units, which
 * it displays as ~3.28, ~1.96 and ~0.77 after dividing by 1000.
 */
export const CARBON_PER_POWER: Record<string, number> = { COAL: 820, OIL: 490, URANIUM: 48 };

/** CIV6: "Units that consume one of these types of resources also discharge
 *  carbon per turn, but their emissions are equal to only half of Power
 *  Plants per unit of resource." */
export const UNIT_CARBON_SHARE = 0.5;

/** CIV6: "for means of CO2 contributions each military unit only takes 0.5
 *  resource units" — the post-Antarctic-Update reduction, which the page is
 *  careful to say "does not affect the mechanics of resource production flow"
 *  and so applies to the EMISSION only, never to `chargeUnitUpkeep`'s spend. */
export const UNIT_CARBON_RESOURCE_SHARE = 0.5;

/** CIV6 (Advanced Power Cells): "As of the Antarctic Late Summer Update, it
 *  also halves the CO2 emitted by units." */
export const ADVANCED_POWER_CELLS_SHARE = 0.5;
export const ADVANCED_POWER_CELLS_TECH = 'ADVANCED_POWER_CELLS';

/**
 * CIV6: "In order for the global temperature to rise by 0.5° (1 Climate
 * Change Point), you will need a different amount of CO2 emissions depending
 * on map size" — Duel 250,000. This world is 44x26, which IS Civ 6's Duel.
 */
export const CO2_PER_POINT = 250_000;

/** CIV6 (Carbon Recapture): "will recover 50,000 units of CO2". The project
 *  page states the same figure as the displayed "-50 lifetime carbon
 *  emissions", and lets a civ's lifetime total go below zero. */
export const CARBON_RECAPTURE_UNITS = 50_000;
/** CIV6 (Carbon Recapture): "awards 30 Diplomatic Favor". */
export const CARBON_RECAPTURE_FAVOR = 30;

export interface ClimatePhase {
  /** Climate Change points at which this phase begins. */
  points: number;
  /** metres of sea-level rise, the page's own column. */
  seaLevel: number;
  /** the Coastal Lowland band newly FLOODED here; 0 = none this phase. */
  flood: number;
  /** the band newly SUBMERGED here; 0 = none this phase. */
  submerge: number;
  /** the fraction of the map's original Ice that has melted. */
  iceMelt: number;
  /** CIV6: "In Phase IV and beyond, Storms and Floods will no longer provide
   *  fertility." */
  fertility: boolean;
  /** CIV6: "a new desertification mechanic comes into play after climate
   *  change progresses past Phase IV: all Storms and Droughts now start
   *  removing fertility from tiles instead of adding it." */
  desertification: boolean;
}

/** CIV6 (Phases of Climate Change), read row by row off the page's table.
 *  Index 0 is Phase I. Phase 0 — no climate change yet — is the absence of a
 *  row, which `climatePhase` returns as -1. */
export const CLIMATE_PHASES: readonly ClimatePhase[] = [
  { points: 2, seaLevel: 0.5, flood: 0, submerge: 0, iceMelt: 0.10, fertility: true, desertification: false },
  { points: 3, seaLevel: 1.0, flood: 1, submerge: 0, iceMelt: 0.20, fertility: true, desertification: false },
  { points: 4, seaLevel: 1.5, flood: 2, submerge: 0, iceMelt: 0.30, fertility: true, desertification: false },
  { points: 5, seaLevel: 2.0, flood: 0, submerge: 1, iceMelt: 0.40, fertility: false, desertification: false },
  { points: 6, seaLevel: 2.5, flood: 3, submerge: 0, iceMelt: 0.55, fertility: false, desertification: true },
  { points: 7, seaLevel: 3.0, flood: 0, submerge: 2, iceMelt: 0.70, fertility: false, desertification: true },
  { points: 8, seaLevel: 3.5, flood: 0, submerge: 3, iceMelt: 0.85, fertility: false, desertification: true },
] as const;

/**
 * CIV6 (Deforestation Level): "a percentage of number of features cleared
 * (Marshes, Woods, Rainforests) versus the total number of removable features
 * on the entire map", and the CO2 emission modifier each band applies.
 *
 * Descending cuts: the first row whose cut the level clears is the band, which
 * is the same shape the appeal bands read by.
 */
export const DEFORESTATION_BANDS: ReadonlyArray<readonly [number, number]> = [
  [0.50, 0.50],
  [0.40, 0.30],
  [0.25, 0.10],
  [0.10, 0.00],
  [0.00, -0.20],
] as const;

/**
 * A COASTAL LOWLAND's band, 1 (drowns first) to 3 (drowns last).
 *
 * MODEL. Real Civ 6 stamps the band on the map at generation as metres above
 * sea level, and publishes neither the generator's rule nor the elevations.
 * The runtime map carries `elevation` only as FLAT / HILLS / MOUNTAIN, so the
 * band here is the hex distance to the nearest water: the shoreline is band 1,
 * the ring behind it band 2, then band 3, and FLAT land only — which is what
 * reproduces the published behaviour that the lowest, most seaward tiles go
 * under first and hills never do.
 */
export const LOWLAND_MAX_BAND = 3;

/**
 * How much likelier a disaster is, and how much likelier it is to arrive at
 * its worst severity, once the world has warmed.
 *
 * MODEL — but a narrow one. The page states the escalation twice ("a general
 * increase in the chance for disasters to occur", "a greater chance the
 * disasters will be of the most destructive strength") and quantifies neither.
 * Rather than invent a second ladder, both ride the ONE warming curve the page
 * does publish, `CLIMATE_PHASES[p].iceMelt`: the per-turn chance is scaled by
 * `1 + iceMelt`, and that same fraction of the lowest severity band's
 * probability moves to the highest. Phase 0 leaves both untouched.
 */
export function disasterRateMult(phase: number): number {
  return phase < 0 ? 1 : 1 + CLIMATE_PHASES[phase].iceMelt;
}

/** The severity split at this phase: `iceMelt` of the mildest band's mass
 *  moved onto the worst. `base` is left untouched at phase 0. */
export function severitySplit(base: readonly number[], phase: number): number[] {
  const out = [...base];
  if (phase < 0 || out.length < 2) return out;
  const moved = out[0] * CLIMATE_PHASES[phase].iceMelt;
  out[0] -= moved;
  out[out.length - 1] += moved;
  return out;
}

/** The phase index for a point total: -1 below Phase I, else 0..6. CIV6: "It
 *  is not possible to revert climate change to an earlier phase", which is the
 *  caller's monotone clamp, not this function's. */
export function climatePhase(points: number): number {
  let p = -1;
  for (let i = 0; i < CLIMATE_PHASES.length; i++) if (points >= CLIMATE_PHASES[i].points) p = i;
  return p;
}

/** The CO2 modifier for a deforestation level in 0..1. */
export function deforestationModifier(level: number): number {
  for (const [cut, mod] of DEFORESTATION_BANDS) if (level >= cut) return mod;
  return 0;
}

/** CIV6 (Flood Barrier): "The formula is (80 x coastal lowland tiles) + (80 x
 *  coastal lowland tiles x flood level)" — so the price of a barrier climbs
 *  with the sea it holds back. */
export const FLOOD_BARRIER_PER_TILE = 80;

/**
 * CIV6 (Diplomatic Favor, Losing Favor): "When you're producing too much CO2
 * ... You will receive a Diplomatic Favor penalty of -1/turn for every 3
 * pollution points higher than average. This penalty caps at 20."
 *
 * "Pollution points" are the DISPLAYED figure, which the Climate page defines
 * as the raw units "after taking away the last 3 digits (divided by 1000 and
 * rounded down to the closest integer)".
 */
export const POLLUTION_DISPLAY_DIVISOR = 1000;
export const FAVOR_PER_POLLUTION_OVER = 3;
export const FAVOR_POLLUTION_CAP = 20;

/** The displayed pollution figure for a raw carbon total. */
export function pollutionPoints(raw: number): number {
  return Math.floor(raw / POLLUTION_DISPLAY_DIVISOR);
}
