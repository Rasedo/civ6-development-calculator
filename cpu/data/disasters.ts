import type { CivId, LeaderId } from './seats';

/**
 * RIVER FLOOD magnitudes, from the Gathering Storm Flood page's two tables.
 *
 * Severity runs Moderate, Major, 1000 Year. Every array below is indexed by
 * that, and every probability is the page's own percentage.
 */

/**
 * CIV6 (`RandomEvent_Frequencies`, REALISM_SETTING_MODERATE): every disaster
 * has a published `OccurrencesPerGame` at each of five Realism settings.
 * OWNER RULING 2026-09-04: this engine models MODERATE, and a per-game
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
 *  ONE drought kind, so the two are summed — the EXTREME severity is the storm table's
 *  sibling gap, not a magnitude this line invents. */
export const DROUGHT_CHANCE = (23 + 5) / STANDARD_GAME_TURNS;

/**
 * THE EIGHT STORMS, one row each from the install's `RandomEvents`,
 * `RandomEvent_Terrains`, `RandomEvent_Frequencies` (MODERATE),
 * `RandomEvent_Damages` and `RandomEvent_Yields`, in the `RandomEvents` table
 * order. Every percentage is the row's own; a damage column the row lacks is
 * ZERO, not inherited. `chance` is OccurrencesPerGame over the standard game
 * (the ruling above). `hexes` is the footprint (the first N slots of the
 * canonical radius-2 disc, `STORM_DISC`), `duration` the turns it persists.
 *
 * CIV6 (`RandomEvent_Damages`, `Percentage` beside `MinHP`/`MaxHP`): the share
 * of a domain's units the storm hits, and the inclusive damage band. A row
 * without a UNIT_DAMAGE_* column damages nobody. `CoastalLowlandPercentage`
 * on the hurricane rows replaces the base percentage on a coastal-lowland
 * tile (`Tile.lowland`).
 *
 * CIV6 (`RandomEvent_Yields`): the storm rows carry FeatureType FEATURE_ICE,
 * which the file's own comment calls "the equivalent of no feature here
 * since Feature type is a primary key" — the rows are not feature-keyed, so
 * each is the chance of +1 of its yield on every land tile of the footprint,
 * the flood's reading of the same column. The blizzard rows are shipped as
 * the table has them (food 10/20%) though the row's EffectString labels it
 * NO_FERTILITY; the table is the data the game reads.
 */
export type StormFamily = 'BLIZZARD' | 'DUST_STORM' | 'TORNADO' | 'HURRICANE';
/** the wire's family code: `sf` on the tile planes, `family` on each row */
export const STORM_FAMILIES: readonly StormFamily[] = ['BLIZZARD', 'DUST_STORM', 'TORNADO', 'HURRICANE'];

export interface StormEvent {
  id: string;
  family: StormFamily;
  /** the install's Severity, 1 or 2 — the climate ramp moves mass onto 2 */
  severity: 1 | 2;
  /** per-turn base chance: OccurrencesPerGame (MODERATE) / STANDARD_GAME_TURNS */
  chance: number;
  hexes: number;
  duration: number;
  impPill: number;
  impDest: number;
  distPill: number;
  /** BUILDING_PILLAGED — ONE roll per tile, darkening every building of the
   *  district standing there. A column of its own: a flood pillages the
   *  district at 50 and its buildings at 100. */
  bldgPill: number;
  pop: number;
  civKill: number;
  landP: number;
  navalP: number;
  landLo: number;
  landHi: number;
  navalLo: number;
  navalHi: number;
  /** CoastalLowlandPercentage on IMPROVEMENT_PILLAGED / DISTRICT_PILLAGED; 0 = none */
  lowlandPill: number;
  lowlandDist: number;
  fertFood: number;
  fertProd: number;
}

const storm = (
  id: string, family: StormFamily, severity: 1 | 2, perGame: number, hexes: number,
  d: Partial<StormEvent>,
): StormEvent => ({
  id, family, severity, chance: perGame / STANDARD_GAME_TURNS, hexes, duration: 3,
  impPill: 0, impDest: 0, distPill: 0, bldgPill: 0, pop: 0, civKill: 0,
  landP: 0, navalP: 0, landLo: 0, landHi: 0, navalLo: 0, navalHi: 0,
  lowlandPill: 0, lowlandDist: 0, fertFood: 0, fertProd: 0, ...d,
});

export const STORM_EVENTS: readonly StormEvent[] = [
  storm('BLIZZARD_SIGNIFICANT', 'BLIZZARD', 1, 8, 7,
    { impDest: 0.25, impPill: 0.5, distPill: 0.15, bldgPill: 0.4, fertFood: 0.1 }),
  storm('BLIZZARD_CRIPPLING', 'BLIZZARD', 2, 2, 19,
    { impDest: 0.5, impPill: 1, distPill: 0.5, bldgPill: 1, pop: 0.15, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 0.6, navalLo: 40, navalHi: 60, fertFood: 0.2 }),
  storm('DUST_STORM_GRADIENT', 'DUST_STORM', 1, 8, 3,
    { impDest: 0.35, impPill: 0.75, distPill: 0.2, bldgPill: 0.6, fertFood: 0.1, fertProd: 0.2 }),
  storm('DUST_STORM_HABOOB', 'DUST_STORM', 2, 2, 7,
    { impDest: 0.75, impPill: 1, distPill: 0.75, bldgPill: 1, pop: 0.2, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 0.6, navalLo: 40, navalHi: 60, fertFood: 0.2, fertProd: 0.3 }),
  storm('TORNADO_FAMILY', 'TORNADO', 1, 15, 1,
    { impDest: 0.35, impPill: 0.75, distPill: 0.2, bldgPill: 0.6 }),
  storm('TORNADO_OUTBREAK', 'TORNADO', 2, 3, 3,
    { impDest: 0.75, impPill: 1, distPill: 0.75, bldgPill: 1, pop: 0.2, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 1, navalLo: 40, navalHi: 60 }),
  storm('HURRICANE_CAT_4', 'HURRICANE', 1, 15, 7,
    { impDest: 0.25, impPill: 0.5, distPill: 0.15, bldgPill: 0.4, lowlandPill: 1, lowlandDist: 1,
      navalP: 0.6, navalLo: 40, navalHi: 60, fertFood: 0.3 }),
  storm('HURRICANE_CAT_5', 'HURRICANE', 2, 3, 19,
    { impDest: 0.5, impPill: 1, distPill: 0.5, bldgPill: 1, lowlandDist: 1, pop: 0.15, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 1, navalLo: 60, navalHi: 80, fertFood: 0.45, fertProd: 0.15 }),
];

/** The two severities of one family, in table order — the climate ramp's
 *  `severitySplit` runs over each pair the way it runs over the flood's ladder. */
export function stormFamilyPair(family: StormFamily): [number, number] {
  const idx = STORM_EVENTS.map((e, i) => (e.family === family ? i : -1)).filter((i) => i >= 0);
  return [idx[0], idx[1]];
}

/** CIV6 (`RandomEvent_Terrains`): where each family STARTS — blizzards on
 *  snow and tundra, dust storms on desert, tornadoes on grassland and plains
 *  (flat and hills each; the table lists no mountain), hurricanes on
 *  TERRAIN_OCEAN, which is this engine's OCEAN alone (its LAKE is the
 *  install's COAST). A tile the sea has taken hosts nothing. */
export function stormFamilyAt(t: { terrain: string; elevation: string; submerged?: boolean }): StormFamily | null {
  if (t.submerged) return null;
  if (t.terrain === 'OCEAN') return 'HURRICANE';
  if (t.elevation === 'MOUNTAIN') return null;
  if (t.terrain === 'SNOW' || t.terrain === 'TUNDRA') return 'BLIZZARD';
  if (t.terrain === 'DESERT') return 'DUST_STORM';
  if (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') return 'TORNADO';
  return null;
}

/**
 * The radius-2 disc as axial (dq, dr) offsets in ONE canonical order shared
 * by both engines: the centre, then ring 1, then ring 2, each ring in
 * ascending tile index (dr, then dq). A storm's footprint is the first
 * `hexes` slots of it — 1, 3, 7 or 19 — an off-map slot simply absent.
 */
export const STORM_DISC: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let dq = -2; dq <= 2; dq++) {
    for (let dr = Math.max(-2, -dq - 2); dr <= Math.min(2, -dq + 2); dr++) out.push([dq, dr]);
  }
  const ring = ([q, r]: readonly [number, number]) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  out.sort((a, b) => ring(a) - ring(b) || a[1] - b[1] || a[0] - b[0]);
  return out;
})();

/**
 * CIV6 (MODIFIER_PLAYER_ADJUST_RANDOM_EVENT_NO_UNIT_DAMAGE, COLLECTION_OWNER,
 * `RandomEventType` + `NoDamage true`): the owner's units take no UNIT_*
 * damage from that one event. CIV6 (MODIFIER_PLAYER_ADJUST_RANDOM_EVENT_
 * MODIFIED_DAMAGE_OPPOSING_PLAYER, COLLECTION_OWNER, `Amount 100`): "+100%
 * unit damage" to a player at war with the owner, "in [the owner's]
 * territory" (the trait text — the modifier carries no requirement set).
 * Divine Wind is Hojo's LEADER trait over the two hurricane rows; Mother
 * Russia is the CIVILIZATION's over the two blizzard rows.
 */
export interface StormUnitRow {
  civ?: CivId;
  leader?: LeaderId;
  event: string;
  effect: 'noDamage' | 'doubleOpposing';
  /** the +percent of MODIFIED_DAMAGE_OPPOSING_PLAYER; 0 on a noDamage row */
  amount: number;
}
export const STORM_UNIT_ROWS: readonly StormUnitRow[] = [
  { leader: 'HOJO', event: 'HURRICANE_CAT_4', effect: 'noDamage', amount: 0 },
  { leader: 'HOJO', event: 'HURRICANE_CAT_5', effect: 'noDamage', amount: 0 },
  { leader: 'HOJO', event: 'HURRICANE_CAT_4', effect: 'doubleOpposing', amount: 100 },
  { leader: 'HOJO', event: 'HURRICANE_CAT_5', effect: 'doubleOpposing', amount: 100 },
  { civ: 'RUSSIA', event: 'BLIZZARD_SIGNIFICANT', effect: 'noDamage', amount: 0 },
  { civ: 'RUSSIA', event: 'BLIZZARD_CRIPPLING', effect: 'noDamage', amount: 0 },
  { civ: 'RUSSIA', event: 'BLIZZARD_SIGNIFICANT', effect: 'doubleOpposing', amount: 100 },
  { civ: 'RUSSIA', event: 'BLIZZARD_CRIPPLING', effect: 'doubleOpposing', amount: 100 },
];

/** NOT covered by the per-GAME-counts ruling: the install counts eruptions per GAME
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
/** CIV6 (RandomEvent_Damages): BUILDING_PILLAGED is 100 on all three flood
 *  rows — including MODERATE, which carries no DISTRICT_PILLAGED row at all,
 *  so the two columns are plainly independent. */
export const FLOOD_BLDG_P = [1, 1, 1] as const;
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
