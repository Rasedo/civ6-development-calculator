/**
 * RIVER FLOOD magnitudes, from the Gathering Storm Flood page's two tables.
 *
 * Severity runs Moderate, Major, 1000 Year. Every array below is indexed by
 * that, and every probability is the page's own percentage.
 */

/**
 * CIV6 (`RandomEvent_Frequencies`, REALISM_SETTING_MODERATE): every disaster
 * has a published `OccurrencesPerGame` at each of five Realism settings.
 * OWNER RULING 2026-09-04 (C-74): this engine models MODERATE, and a per-game
 * count becomes a per-turn chance by dividing by the STANDARD game length —
 * Civ 6's 500 turns, the span the install's count is written over. This
 * engine plays 250 of those turns and so sees half a game's worth, which is
 * what half a game should see.
 *
 * These four replaced constants that admitted in their own comments to being
 * invented. The wiki page they were read from publishes no numbers; the
 * install does.
 */
export const STANDARD_GAME_TURNS = 500;

/** MODERATE floods: FLOOD_MODERATE 2, FLOOD_MAJOR 1.5, FLOOD_1000_YEAR 1 per
 *  game — 4.5 in all, split by severity in that proportion. */
const FLOOD_PER_GAME = [2, 1.5, 1] as const;
const FLOOD_TOTAL = FLOOD_PER_GAME[0] + FLOOD_PER_GAME[1] + FLOOD_PER_GAME[2];
export const FLOOD_SEVERITY_P = [
  FLOOD_PER_GAME[0] / FLOOD_TOTAL, FLOOD_PER_GAME[1] / FLOOD_TOTAL, FLOOD_PER_GAME[2] / FLOOD_TOTAL,
] as const;
export const FLOOD_CHANCE = FLOOD_TOTAL / STANDARD_GAME_TURNS;

/** MODERATE droughts: DROUGHT_MAJOR 23 + DROUGHT_EXTREME 5. This engine has
 *  ONE drought kind, so the two are summed — the EXTREME severity is C-49's
 *  sibling gap, not a magnitude this line invents. */
export const DROUGHT_CHANCE = (23 + 5) / STANDARD_GAME_TURNS;

/** MODERATE storms, all four families and both severities summed, because
 *  this engine's storm has neither a family nor a severity yet (C-49):
 *  BLIZZARD 8+2, DUST_STORM 8+2, TORNADO 15+3, HURRICANE 15+3 = 56. When
 *  C-49 lands the families, each takes its own row from this same table. */
export const STORM_CHANCE = (8 + 2 + 8 + 2 + 15 + 3 + 15 + 3) / STANDARD_GAME_TURNS;

/** NOT covered by the C-74 ruling: the install counts eruptions per GAME
 *  (VOLCANO_GENTLE 4, CATASTROPHIC 2.5, MEGACOLOSSAL 1.5 at MODERATE) where
 *  this engine rolls per VOLCANO, and the conversion needs the map's volcano
 *  count. Still the old stylization; still an open question. */
export const ERUPTION_CHANCE_PER_VOLCANO = 0.02;
export const DROUGHT_LENGTH = 8;

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
