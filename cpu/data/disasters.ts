import type { CivId, LeaderId } from './seats';
import { srcConst, xml, type SrcMap } from './provenance';

/**
 * RIVER FLOOD magnitudes, from the Gathering Storm Flood page's two tables.
 *
 * Severity runs Moderate, Major, 1000 Year. Every array below is indexed by
 * that, and every probability is the page's own percentage.
 */

/**
 * CIV6 (`RandomEvent_Frequencies`, REALISM_SETTING_MODERATE): every disaster
 * has a published `OccurrencesPerGame` at each of five Realism settings.
 * OWNER RULING: this engine models MODERATE, and a per-game
 * count becomes a per-turn chance by dividing by the STANDARD game length —
 * Civ 6's 500 turns, the span the install's count is written over. This
 * engine plays 250 of those turns and so sees half a game's worth, which is
 * what half a game should see.
 *
 * These four replaced constants that admitted in their own comments to being
 * invented. The wiki page they were read from publishes no numbers; the
 * install does.
 */
export const STANDARD_GAME_TURNS = srcConst('disasters.STANDARD_GAME_TURNS', 500, {
  pedia: 'the GS standard-speed game length, 500 turns — the span RandomEvent_Frequencies writes '
    + 'its OccurrencesPerGame over (owner ruling 2026-09-04)',
});

const freq = (ev: string) => xml('RandomEvent_Frequencies',
  `RandomEventType=RANDOM_EVENT_${ev}&RealismSettingType=REALISM_SETTING_MODERATE`,
  'OccurrencesPerGame');

/** MODERATE floods: FLOOD_MODERATE 2, FLOOD_MAJOR 1.5, FLOOD_1000_YEAR 1 per
 *  game — 4.5 in all, split by severity in that proportion. */
const FLOOD_PER_GAME = [2, 1.5, 1] as const;
const FLOOD_TOTAL = FLOOD_PER_GAME[0] + FLOOD_PER_GAME[1] + FLOOD_PER_GAME[2];
export const FLOOD_SEVERITY_P = srcConst('disasters.floodSeverityP', [
  FLOOD_PER_GAME[0] / FLOOD_TOTAL, FLOOD_PER_GAME[1] / FLOOD_TOTAL, FLOOD_PER_GAME[2] / FLOOD_TOTAL,
] as const, {
  derived: 'each flood row\'s OccurrencesPerGame at REALISM_SETTING_MODERATE over their sum '
    + '(2 / 1.5 / 1 of 4.5)',
  inputs: [freq('FLOOD_MODERATE'), freq('FLOOD_MAJOR'), freq('FLOOD_1000_YEAR')],
});
export const FLOOD_CHANCE = srcConst('disasters.floodChance', FLOOD_TOTAL / STANDARD_GAME_TURNS, {
  derived: 'the three flood rows\' OccurrencesPerGame at REALISM_SETTING_MODERATE, summed, over '
    + 'STANDARD_GAME_TURNS (owner ruling 2026-09-04)',
  inputs: [freq('FLOOD_MODERATE'), freq('FLOOD_MAJOR'), freq('FLOOD_1000_YEAR')],
});

/** MODERATE droughts: DROUGHT_MAJOR 23 + DROUGHT_EXTREME 5. This engine has
 *  ONE drought kind, so the two are summed — the EXTREME severity is the storm table's
 *  sibling gap, not a magnitude this line invents. */
export const DROUGHT_CHANCE = srcConst('disasters.droughtChance', (23 + 5) / STANDARD_GAME_TURNS, {
  derived: 'DROUGHT_MAJOR + DROUGHT_EXTREME OccurrencesPerGame at REALISM_SETTING_MODERATE over '
    + 'STANDARD_GAME_TURNS — this engine has ONE drought kind, so the two rows are summed',
  inputs: [freq('DROUGHT_MAJOR'), freq('DROUGHT_EXTREME')],
});

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
export const STORM_FAMILIES: readonly StormFamily[] = srcConst('disasters.stormFamilies',
  ['BLIZZARD', 'DUST_STORM', 'TORNADO', 'HURRICANE'], {
    derived: 'the four storm KINDS of the install `RandomEvents` storm rows, in table order — '
      + 'each kind carries two Severity rows and this is the family they share',
    inputs: [xml('RandomEvents', 'RandomEventType=RANDOM_EVENT_BLIZZARD_SIGNIFICANT',
      'RandomEventType')],
  }) as readonly StormFamily[];

/**
 * CIV6 (`Expansion2_RandomEvents.xml`, `<PrevailingWinds>`): 22 rows giving a
 * WEIGHTED heading per latitude band, the heading a storm's walk draws each
 * step from (the walk is measured, ask 16). Eight bands, lower bound
 * inclusive, by signed degree (north positive, `windBand`); each row's six
 * weights are in the hex direction order E, NE, NW, W, SW, SE (`AXIAL_DIRS`).
 *   60..90    NW 1  W 2  SW 2        -5..0     W 1   SW 1
 *   30..60    NE 2  E 2  SE 1        -30..-5   NW 1  W 2   SW 2
 *   5..30     NW 2  W 2  SW 1        -60..-30  NE 1  E 2   SE 2
 *   0..5      NW 1  W 1              -90..-60  NW 2  W 2   SW 1
 */
export const WIND_BAND_LO: readonly number[] = srcConst('disasters.windBandLo',
  [60, 30, 5, 0, -5, -30, -60, -90], {
    derived: 'the distinct `PrevailingWinds.MinimumLatitude` values, descending',
    inputs: [xml('PrevailingWinds', 'MinimumLatitude=60&DirectionType=DIRECTION_WEST',
      'MinimumLatitude')],
  });
/** one band's six weights, in the engine's E, NE, NW, W, SW, SE order */
const WIND_DIRS = ['EAST', 'NORTHEAST', 'NORTHWEST', 'WEST', 'SOUTHWEST', 'SOUTHEAST'] as const;
const windRow = (i: number, lo: number, w: readonly number[]): readonly number[] =>
  srcConst(`disasters.winds.${i}`, w, {
    derived: `the \`PrevailingWinds\` rows with MinimumLatitude ${lo}, their DirectionType Weight `
      + 'laid out in the engine hex order E, NE, NW, W, SW, SE; a direction the band has no row '
      + 'for reads 0 — so a 0 here is an ABSENT row and a weight a present one',
    inputs: WIND_DIRS.map((d, k) => xml('PrevailingWinds', `MinimumLatitude=${lo}&DirectionType=DIRECTION_${d}`,
      'Weight', w[k] === 0 ? { absent: true } : undefined)),
  });
export const PREVAILING_WINDS: readonly (readonly number[])[] = [
  windRow(0, 60, [0, 0, 1, 2, 2, 0]), //  60..90
  windRow(1, 30, [2, 2, 0, 0, 0, 1]), //  30..60
  windRow(2, 5, [0, 0, 2, 2, 1, 0]), //   5..30
  windRow(3, 0, [0, 0, 1, 1, 0, 0]), //   0..5
  windRow(4, -5, [0, 0, 0, 1, 1, 0]), //  -5..0
  windRow(5, -30, [0, 0, 1, 2, 2, 0]), // -30..-5
  windRow(6, -60, [2, 1, 0, 0, 0, 2]), // -60..-30
  windRow(7, -90, [0, 0, 2, 2, 1, 0]), // -90..-60
];

/**
 * The `PREVAILING_WINDS` band of a map row. `mapgen`'s latitude is
 * `|row - half| / half` with `half = (height - 1) / 2`; the winds need it
 * SIGNED, north (row 0) positive, in degrees: lat = (half - row) / half x 90.
 * Compared in integers so both engines land on the same band at every
 * boundary: with x = 2 (half - row) = (height - 1) - 2 row and s = height - 1,
 * lat >= 60 is 3x >= 2s, lat >= 30 is 3x >= s, lat >= 5 is 18x >= s, and the
 * southern bands mirror them.
 */
export function windBand(row: number, height: number): number {
  const s = height - 1;
  const x = s - 2 * row;
  if (3 * x >= 2 * s) return 0;
  if (3 * x >= s) return 1;
  if (18 * x >= s) return 2;
  if (x >= 0) return 3;
  if (18 * x >= -s) return 4;
  if (3 * x >= -s) return 5;
  if (3 * x >= -2 * s) return 6;
  return 7;
}

/** CIV6 (`RandomEvents`, `Movement="8"` on every storm row — MEASURED,
 *  ask 16): the unit steps a storm's centre walks in its movement
 *  turn and again as it dissipates, each step's heading drawn from
 *  `PREVAILING_WINDS` at the centre's current latitude. */
export const STORM_MOVEMENT = srcConst('disasters.stormMovement', 8,
  xml('RandomEvents', 'RandomEventType=RANDOM_EVENT_HURRICANE_CAT_4', 'Movement',
    { note: 'every storm row carries Movement 8; what the number MEANS — unit steps of the '
      + 'centre\'s walk, drawn from PREVAILING_WINDS — is the lab reading (C-49, ask 16, '
      + 'measured 2026-09-13)' }));

export interface StormEvent {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts). Stripped by the
   *  exporter; checked by tools/civ6lab/xml_check.py. */
  src?: SrcMap;
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

/**
 * PROVENANCE for one storm row (cpu/data/provenance.ts). Every magnitude is an
 * install column; the ones this catalog holds as a FRACTION are `derived` from
 * the install's PERCENTAGE, because the checker compares in the catalog's own
 * units and cannot divide. A damage row the install does not carry reads 0
 * here, which is the row's absence rather than a value.
 */
const stormSrc = (id: string, d: Partial<StormEvent>): SrcMap => {
  const ev = `RandomEventType=RANDOM_EVENT_${id}`;
  const dmg = (kind: string, col = 'Percentage') =>
    xml('RandomEvent_Damages', `${ev}&DamageType=${kind}`, col);
  const pct = (kind: string, col = 'Percentage') => ({
    derived: `Percentage/100 - the install writes the share as a percentage, this catalog as a `
      + `fraction; no ${kind} row at all reads 0`,
    inputs: [dmg(kind, col)],
  });
  const fert = (y: string) => ({
    derived: 'Percentage/100 of the RandomEvent_Yields row; no row at all reads 0',
    inputs: [xml('RandomEvent_Yields', `${ev}&YieldType=${y}`, 'Percentage')],
  });
  const band = (kind: string, col: 'MinHP' | 'MaxHP', live: boolean) => (live
    ? dmg(kind, col)
    : { derived: `0 - the install row carries no ${kind} row`, inputs: [dmg(kind, col)] });
  return {
    family: {
      derived: 'the engine family of the install RandomEvents row - the two Severity rows of one '
        + 'storm kind share it',
      inputs: [xml('RandomEvents', ev, 'RandomEventType')],
    },
    severity: xml('RandomEvents', ev, 'Severity'),
    hexes: xml('RandomEvents', ev, 'Hexes'),
    duration: xml('RandomEvents', ev, 'Duration'),
    chance: {
      derived: 'OccurrencesPerGame at REALISM_SETTING_MODERATE / STANDARD_GAME_TURNS (owner ruling '
        + '2026-09-04)',
      inputs: [xml('RandomEvent_Frequencies',
        `${ev}&RealismSettingType=REALISM_SETTING_MODERATE`, 'OccurrencesPerGame')],
    },
    impPill: pct('IMPROVEMENT_PILLAGED'),
    impDest: pct('IMPROVEMENT_DESTROYED'),
    distPill: pct('DISTRICT_PILLAGED'),
    bldgPill: pct('BUILDING_PILLAGED'),
    pop: pct('POPULATION_LOSS'),
    civKill: pct('UNIT_KILLED_CIVILIAN'),
    landP: pct('UNIT_DAMAGE_LAND'),
    navalP: pct('UNIT_DAMAGE_NAVAL'),
    landLo: band('UNIT_DAMAGE_LAND', 'MinHP', !!d.landP),
    landHi: band('UNIT_DAMAGE_LAND', 'MaxHP', !!d.landP),
    navalLo: band('UNIT_DAMAGE_NAVAL', 'MinHP', !!d.navalP),
    navalHi: band('UNIT_DAMAGE_NAVAL', 'MaxHP', !!d.navalP),
    lowlandPill: pct('IMPROVEMENT_PILLAGED', 'CoastalLowlandPercentage'),
    lowlandDist: pct('DISTRICT_PILLAGED', 'CoastalLowlandPercentage'),
    fertFood: fert('YIELD_FOOD'),
    fertProd: fert('YIELD_PRODUCTION'),
  };
};

const storm = (
  id: string, family: StormFamily, severity: 1 | 2, perGame: number, hexes: number,
  d: Partial<StormEvent>,
): StormEvent => ({
  id, family, severity, chance: perGame / STANDARD_GAME_TURNS, hexes, duration: 3,
  src: stormSrc(id, d),
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
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  civ?: CivId;
  leader?: LeaderId;
  event: string;
  effect: 'noDamage' | 'doubleOpposing';
  /** the +percent of MODIFIED_DAMAGE_OPPOSING_PLAYER; 0 on a noDamage row */
  amount: number;
}

/**
 * PROVENANCE (cpu/data/provenance.ts). `event` is the install's own
 * `RandomEvents` row; the other two columns name the MODIFIER the trait
 * attaches (MODIFIER_PLAYER_ADJUST_RANDOM_EVENT_NO_UNIT_DAMAGE and
 * ..._MODIFIED_DAMAGE_OPPOSING_PLAYER), which the install writes as a modifier
 * type rather than as a column this checker can read back.
 */
const stormUnitSrc = (r: StormUnitRow): SrcMap => ({
  event: xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${r.event}`, 'RandomEventType',
    { expect: `RANDOM_EVENT_${r.event}` }),
  effect: {
    derived: "'noDamage' for the install NO_UNIT_DAMAGE modifier, 'doubleOpposing' for "
      + 'MODIFIED_DAMAGE_OPPOSING_PLAYER',
    inputs: [xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${r.event}`, 'RandomEventType')],
  },
  amount: {
    derived: 'the Amount argument of MODIFIER_PLAYER_ADJUST_RANDOM_EVENT_MODIFIED_DAMAGE_'
      + 'OPPOSING_PLAYER; 0 on a noDamage row, which carries no Amount',
    inputs: [xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${r.event}`, 'RandomEventType')],
  },
});

const RAW_STORM_UNIT_ROWS: readonly StormUnitRow[] = [
  { leader: 'HOJO', event: 'HURRICANE_CAT_4', effect: 'noDamage', amount: 0 },
  { leader: 'HOJO', event: 'HURRICANE_CAT_5', effect: 'noDamage', amount: 0 },
  { leader: 'HOJO', event: 'HURRICANE_CAT_4', effect: 'doubleOpposing', amount: 100 },
  { leader: 'HOJO', event: 'HURRICANE_CAT_5', effect: 'doubleOpposing', amount: 100 },
  { civ: 'RUSSIA', event: 'BLIZZARD_SIGNIFICANT', effect: 'noDamage', amount: 0 },
  { civ: 'RUSSIA', event: 'BLIZZARD_CRIPPLING', effect: 'noDamage', amount: 0 },
  { civ: 'RUSSIA', event: 'BLIZZARD_SIGNIFICANT', effect: 'doubleOpposing', amount: 100 },
  { civ: 'RUSSIA', event: 'BLIZZARD_CRIPPLING', effect: 'doubleOpposing', amount: 100 },
];
export const STORM_UNIT_ROWS: readonly StormUnitRow[] =
  RAW_STORM_UNIT_ROWS.map((r) => ({ ...r, src: stormUnitSrc(r) }));

/** NOT covered by the per-GAME-counts ruling: the install counts eruptions per GAME
 *  (VOLCANO_GENTLE 4, CATASTROPHIC 2.5, MEGACOLOSSAL 1.5 at MODERATE) where
 *  this engine rolls per VOLCANO, and the conversion needs the map's volcano
 *  count. The rate stays stylized, an open question. */
export const ERUPTION_CHANCE_PER_VOLCANO = srcConst('disasters.eruptionChance', 0.02, {
  stylized: 'the install counts eruptions per GAME (VOLCANO_GENTLE 4 / CATASTROPHIC 2.5 / '
    + 'MEGACOLOSSAL 1.5 at MODERATE) where this engine rolls per VOLCANO, and the conversion '
    + 'needs the map\'s volcano count — still the old stylization, still an open question',
});
export const DROUGHT_LENGTH = 8;

/** "Improvement — Pillaged: 100%; Destroyed: 50% / 80%". A flood always
 *  pillages; these are the chances it takes the improvement away entirely. */
const floodPage = (what: string) => ({
  pedia: `the GS Flood page's severity table (${what}), by severity Moderate / Major / 1000 Year`,
});
const floodDmg = (kind: string, col = 'Percentage') => [
  xml('RandomEvent_Damages', `RandomEventType=RANDOM_EVENT_FLOOD_MODERATE&DamageType=${kind}`, col),
  xml('RandomEvent_Damages', `RandomEventType=RANDOM_EVENT_FLOOD_MAJOR&DamageType=${kind}`, col),
  xml('RandomEvent_Damages', `RandomEventType=RANDOM_EVENT_FLOOD_1000_YEAR&DamageType=${kind}`, col),
];
export const FLOOD_DESTROY_P = srcConst('disasters.floodDestroyP', [0, 0.5, 0.8] as const,
  floodPage('Improvement — Destroyed: 0 / 50% / 80%'));
/** "District — 0 / 50% / 80%". A damaged district takes its buildings dark
 *  with it, which is the page's "Building 100%" column. */
export const FLOOD_DISTRICT_P = srcConst('disasters.floodDistrictP', [0, 0.5, 0.8] as const,
  floodPage('District — 0 / 50% / 80%'));
/** CIV6 (RandomEvent_Damages): BUILDING_PILLAGED is 100 on all three flood
 *  rows — including MODERATE, which carries no DISTRICT_PILLAGED row at all,
 *  so the two columns are plainly independent. */
export const FLOOD_BLDG_P = srcConst('disasters.floodBldgP', [1, 1, 1] as const, {
  derived: 'Percentage/100 of each flood row\'s BUILDING_PILLAGED damage row (100 on all three)',
  inputs: floodDmg('BUILDING_PILLAGED'),
});
/** "Population" and "Civilians killed", which the page gives the same
 *  percentage at every severity. */
export const FLOOD_POP_P = srcConst('disasters.floodPopP', [0, 0.15, 0.25] as const,
  floodPage('Population / Civilians killed — 0 / 15% / 25%'));
/** "Units" and "Garrison — 30-50 HP / 50-70 HP", inclusive of both ends. */
export const FLOOD_DAMAGE_LO = srcConst('disasters.floodDmgLo', [0, 30, 50] as const,
  floodPage('Units / Garrison — 30-50 HP / 50-70 HP, the low end'));
export const FLOOD_DAMAGE_HI = srcConst('disasters.floodDmgHi', [0, 50, 70] as const,
  floodPage('Units / Garrison — 30-50 HP / 50-70 HP, the high end'));

/**
 * "Floods fertilize each type of Floodplains differently... Each expresses the
 * chance of a tile to gain +1 of the given yield, and note that a single tile
 * may gain BOTH yields from the same flood." Columns are Plains, Grassland,
 * Desert floodplains, in that order.
 */
const fertRow = (y: string, sev: number, r: readonly number[]) =>
  srcConst(`disasters.floodFert${y}.${sev}`, r, {
    pedia: `the GS Flood page's fertilization table, ${y} row ${sev} (Moderate / Major / 1000 Year), `
      + 'columns Plains, Grassland, Desert floodplains',
  });
export const FLOOD_FERT_FOOD = [
  fertRow('Food', 0, [0.30, 0.15, 0.25]),
  fertRow('Food', 1, [0.45, 0.25, 0.30]),
  fertRow('Food', 2, [0.60, 0.40, 0.45]),
] as const;
export const FLOOD_FERT_PROD = [
  fertRow('Prod', 0, [0, 0, 0]),
  fertRow('Prod', 1, [0.10, 0.30, 0.15]),
  fertRow('Prod', 2, [0.15, 0.40, 0.25]),
] as const;

/** Which fertility column a floodplain's terrain reads. Real Civ 6 puts
 *  Floodplains on Plains, Grassland and Desert; this generator makes only the
 *  Desert kind, so the other two columns are shipped and unreached. */
export function floodTerrainColumn(terrain: string): number {
  if (terrain === 'PLAINS') return 0;
  if (terrain === 'GRASSLAND') return 1;
  return 2;
}
