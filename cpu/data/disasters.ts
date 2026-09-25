import type { CivId, LeaderId } from './seats';
import { srcConst, xml, type SrcMap } from './provenance';

/**
 * RIVER FLOOD magnitudes, from the Gathering Storm Flood page's two tables.
 *
 * Severity runs Moderate, Major, 1000 Year. Every array below is indexed by
 * that, and every probability is the page's own percentage.
 */

/**
 * THE TURN'S ONE RANDOM EVENT. CIV6 (`RandomEvent_Frequencies`,
 * REALISM_SETTING_MODERATE — OWNER RULING: this engine models MODERATE):
 * every event row carries an `OccurrencesPerGame`, and MEASURED in a natural
 * 251-turn game (`tools/civ6lab/runs/event_history_lab4_20260923T135005Z.txt`)
 * the game fires at most ONE event a turn, drawn over the eligible (event,
 * site) pairs with that column as the pair's WEIGHT: floods and eruptions ran
 * about ten times their column (one weight per river, per volcano), storms
 * and droughts near theirs (one weight per event). `disasterPhase` makes the
 * draw; every weight below is the column itself.
 */
const freq = (ev: string) => xml('RandomEvent_Frequencies',
  `RandomEventType=RANDOM_EVENT_${ev}&RealismSettingType=REALISM_SETTING_MODERATE`,
  'OccurrencesPerGame');

/** One weight per severity row, MODERATE / MAJOR / 1000_YEAR: 2 / 1.5 / 1,
 *  each counted once per flooding river. Every flood array below is indexed
 *  by that severity. */
export const FLOOD_WEIGHT = srcConst('disasters.floodWeight', [2, 1.5, 1] as const, {
  derived: 'each flood row\'s OccurrencesPerGame at REALISM_SETTING_MODERATE, in severity order',
  inputs: [freq('FLOOD_MODERATE'), freq('FLOOD_MAJOR'), freq('FLOOD_1000_YEAR')],
});

/**
 * CIV6 (`RandomEvents.ChanceIncreasePerDegree`): the percent a row's weight
 * grows per degree of global warming — weight x (1 + CIPD/100 x degrees)
 * (`warmedWeight`). A row without the column (the eruptions, the nuclear
 * accidents) reads the schema's default 0 and never moves.
 */
const cipd = (ev: string) => xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${ev}`, 'ChanceIncreasePerDegree');
export const FLOOD_CIPD = srcConst('disasters.floodCipd', [20, 20, 20] as const, {
  derived: 'each flood row\'s RandomEvents.ChanceIncreasePerDegree, in severity order',
  inputs: [cipd('FLOOD_MODERATE'), cipd('FLOOD_MAJOR'), cipd('FLOOD_1000_YEAR')],
});

/** A row's weight at `degrees` of warming: CIV6 (`ChanceIncreasePerDegree`)
 *  "the chance of Storms, River Flooding, and Drought occurring increases"
 *  as the CO2 rises — the column's percent per degree, on the row's own
 *  weight. */
export function warmedWeight(weight: number, cipdPct: number, degrees: number): number {
  return weight * (1 + (cipdPct / 100) * degrees);
}

/** CIV6 (`RANDOM_EVENT_START_TURN`, Expansion2_GlobalParameters): the first
 *  turn a random event may fire. */
export const RANDOM_EVENT_START_TURN = srcConst('disasters.randomEventStartTurn', 2,
  xml('GlobalParameters', 'Name=RANDOM_EVENT_START_TURN', 'Value'));

/** DROUGHT_MAJOR / DROUGHT_EXTREME: weights 23 / 5, each counted once; the
 *  footprint is `Hexes` 7 (the first seven `STORM_DISC` slots, the centre and
 *  its ring) and the dry spell lasts `Duration` 5 / 10 turns. */
const drought = (ev: string, col: string) => xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${ev}`, col);
export const DROUGHT_WEIGHT = srcConst('disasters.droughtWeight', [23, 5] as const, {
  derived: 'the two drought rows\' OccurrencesPerGame at REALISM_SETTING_MODERATE, MAJOR then EXTREME',
  inputs: [freq('DROUGHT_MAJOR'), freq('DROUGHT_EXTREME')],
});
export const DROUGHT_DURATION = srcConst('disasters.droughtDuration', [5, 10] as const, {
  derived: 'the two drought rows\' RandomEvents.Duration, MAJOR then EXTREME',
  inputs: [drought('DROUGHT_MAJOR', 'Duration'), drought('DROUGHT_EXTREME', 'Duration')],
});
export const DROUGHT_HEXES = srcConst('disasters.droughtHexes', 7, drought('DROUGHT_MAJOR', 'Hexes'));
export const DROUGHT_CIPD = srcConst('disasters.droughtCipd', [0, 50] as const, {
  derived: 'the two drought rows\' RandomEvents.ChanceIncreasePerDegree, MAJOR then EXTREME',
  inputs: [drought('DROUGHT_MAJOR', 'ChanceIncreasePerDegree'), drought('DROUGHT_EXTREME', 'ChanceIncreasePerDegree')],
});

/** CIV6 (`RandomEvent_Terrains`): the ground a drought starts on — Plains or
 *  Grassland, flat or hills, the four rows both drought events list. Static;
 *  the exporter ships it as the `dc` plane. */
export function droughtTerrain(t: { terrain: string; elevation: string }): boolean {
  return (t.terrain === 'GRASSLAND' || t.terrain === 'PLAINS') && t.elevation !== 'MOUNTAIN';
}

/** A plot a drought may centre on now: its terrain, above ground, and
 *  CIV6 (LOC_CLIMATE_DROUGHT_EVENT_DESCRIPTION_TOOLTIP) "Drought targets areas
 *  that are devoid of all Features" — no feature of any kind stands there. */
export function droughtCandidate(t: {
  terrain: string; elevation: string; feature: string | null; submerged?: boolean;
}): boolean {
  return droughtTerrain(t) && t.feature === null && !t.submerged;
}

/**
 * CIV6 (`RandomEvent_PillagedImprovements`, every layer a Gathering Storm game
 * loads): the improvements a drought pillages at SPECIFIC_IMPROVEMENT_PILLAGED
 * 100 on both rows, and which "cannot be rebuilt until the Drought ends"
 * (LOC_CLIMATE_DROUGHT_EVENT_DESCRIPTION_TOOLTIP; "cannot be repaired while a
 * drought is in progress", LOC_UNITOPERATION_REPAIR_BLOCKED_BY_DROUGHT). The
 * install's list also names the Cahokia Mound, the Outback Station and the
 * Hacienda, which this roster does not carry.
 */
const droughtImp = (imp: string) => xml('RandomEvent_PillagedImprovements',
  `RandomEventType=RANDOM_EVENT_DROUGHT_MAJOR&ImprovementType=IMPROVEMENT_${imp}`, 'ImprovementType',
  { expect: `IMPROVEMENT_${imp}` });
export const DROUGHT_IMPROVEMENTS: readonly string[] = srcConst('disasters.droughtImprovements',
  ['FARM', 'PASTURE', 'CAMP', 'PLANTATION', 'TERRACE_FARM', 'MEKEWAP'], {
    derived: 'the RandomEvent_PillagedImprovements rows of RANDOM_EVENT_DROUGHT_MAJOR (EXTREME lists the '
      + 'same) whose improvement this roster carries — Expansion2_RandomEvents.xml and '
      + 'Expansion1_Expansion2.xml (the Mekewap)',
    inputs: ['FARM', 'PASTURE', 'CAMP', 'PLANTATION', 'TERRACE_FARM', 'MEKEWAP'].map(droughtImp),
  });
/** SPECIFIC_IMPROVEMENT_DESTROYED by severity: MAJOR carries no row, EXTREME
 *  30 — the chance a listed improvement is taken away instead of pillaged. */
export const DROUGHT_DESTROY_P = srcConst('disasters.droughtDestroyP', [0, 0.3] as const, {
  derived: 'Percentage/100 of each drought row\'s SPECIFIC_IMPROVEMENT_DESTROYED row (MAJOR carries none)',
  inputs: [
    xml('RandomEvent_Damages', 'RandomEventType=RANDOM_EVENT_DROUGHT_MAJOR&DamageType=SPECIFIC_IMPROVEMENT_DESTROYED',
      'Percentage', { absent: true }),
    xml('RandomEvent_Damages', 'RandomEventType=RANDOM_EVENT_DROUGHT_EXTREME&DamageType=SPECIFIC_IMPROVEMENT_DESTROYED',
      'Percentage'),
  ],
});

/** May this improvement be built or repaired on this plot now? Not a listed
 *  one while a drought lies on it. */
export function droughtBars(t: { droughtTurns: number }, imp: string | null): boolean {
  return t.droughtTurns > 0 && imp !== null && DROUGHT_IMPROVEMENTS.includes(imp);
}

/**
 * CIV6 (`Districts_XP2.PreventsDrought` on the Aqueduct, its Bath and the Dam;
 * `Improvements_XP2.PreventsDrought` on the Stepwell): "A city with an
 * Aqueduct, Dam, Bath District, or Stepwell improvement will not suffer the -1
 * Food yield during a Drought, but will still have Improvements pillaged"
 * (the Droughts pedia page). The Bath is the Aqueduct's variant on the plot.
 */
export const DROUGHT_SHIELD_DISTRICTS: readonly string[] = srcConst('disasters.droughtShieldDistricts',
  ['AQUEDUCT', 'DAM'], {
    derived: 'the districts whose Districts_XP2 row sets PreventsDrought (the Bath rides the Aqueduct row)',
    inputs: ['AQUEDUCT', 'BATH', 'DAM'].map((d) => xml('Districts_XP2', `DistrictType=DISTRICT_${d}`,
      'PreventsDrought', { expect: true })),
  });
export const DROUGHT_SHIELD_IMPROVEMENTS: readonly string[] = srcConst('disasters.droughtShieldImprovements',
  ['STEPWELL'], {
    derived: 'the improvements whose Improvements_XP2 row sets PreventsDrought',
    inputs: [xml('Improvements_XP2', 'ImprovementType=IMPROVEMENT_STEPWELL', 'PreventsDrought', { expect: true })],
  });

/** Does the city owning this plot hold a drought shield — a complete,
 *  unpillaged Aqueduct or Dam, or an unpillaged Stepwell, on any plot it
 *  owns? A city-state's one city is its seat's plots; an unowned plot has no
 *  city. */
export function droughtShielded(tiles: readonly ShieldPlot[], t: ShieldPlot): boolean {
  if (t.ownerSeat < 0) return false;
  for (const u of tiles) {
    if (u.ownerSeat !== t.ownerSeat || u.ownerCity !== t.ownerCity) continue;
    if (u.district !== null && DROUGHT_SHIELD_DISTRICTS.includes(u.district)
        && u.districtComplete && !u.districtPillaged) return true;
    if (u.improvement !== null && DROUGHT_SHIELD_IMPROVEMENTS.includes(u.improvement) && !u.pillaged) return true;
  }
  return false;
}
interface ShieldPlot {
  ownerSeat: number; ownerCity: number; district: string | null; districtComplete: boolean;
  districtPillaged?: boolean; improvement: string | null; pillaged?: boolean;
}

/**
 * THE EIGHT STORMS, one row each from the install's `RandomEvents`,
 * `RandomEvent_Terrains`, `RandomEvent_Frequencies` (MODERATE),
 * `RandomEvent_Damages` and `RandomEvent_Yields`, in the `RandomEvents` table
 * order. Every percentage is the row's own; a damage column the row lacks is
 * ZERO, not inherited. `weight` is OccurrencesPerGame, the row's weight in the
 * turn's one draw, counted once. `hexes` is the footprint (the first N slots of the
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
type StormFamily = 'BLIZZARD' | 'DUST_STORM' | 'TORNADO' | 'HURRICANE';
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
      + 'centre\'s walk, drawn from PREVAILING_WINDS — is the lab reading (ask 16, '
      + 'measured 2026-09-13)' }));

export interface StormEvent {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts). Stripped by the
   *  exporter; checked by tools/civ6lab/xml_check.py. */
  src?: SrcMap;
  family: StormFamily;
  /** the install's Severity, 1 or 2 */
  severity: 1 | 2;
  /** the weight in the turn's one draw: OccurrencesPerGame (MODERATE) */
  weight: number;
  /** ChanceIncreasePerDegree: the percent the weight grows per degree of
   *  warming (`warmedWeight`) — 0 on each family's milder row, 50 on its worse */
  cipd: number;
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
    weight: xml('RandomEvent_Frequencies',
      `${ev}&RealismSettingType=REALISM_SETTING_MODERATE`, 'OccurrencesPerGame'),
    cipd: xml('RandomEvents', ev, 'ChanceIncreasePerDegree'),
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
  id: string, family: StormFamily, severity: 1 | 2, perGame: number, cipdPct: number, hexes: number,
  d: Partial<StormEvent>,
): StormEvent => ({
  id, family, severity, weight: perGame, cipd: cipdPct, hexes, duration: 3,
  src: stormSrc(id, d),
  impPill: 0, impDest: 0, distPill: 0, bldgPill: 0, pop: 0, civKill: 0,
  landP: 0, navalP: 0, landLo: 0, landHi: 0, navalLo: 0, navalHi: 0,
  lowlandPill: 0, lowlandDist: 0, fertFood: 0, fertProd: 0, ...d,
});

export const STORM_EVENTS: readonly StormEvent[] = [
  storm('BLIZZARD_SIGNIFICANT', 'BLIZZARD', 1, 8, 0, 7,
    { impDest: 0.25, impPill: 0.5, distPill: 0.15, bldgPill: 0.4, fertFood: 0.1 }),
  storm('BLIZZARD_CRIPPLING', 'BLIZZARD', 2, 2, 50, 19,
    { impDest: 0.5, impPill: 1, distPill: 0.5, bldgPill: 1, pop: 0.15, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 0.6, navalLo: 40, navalHi: 60, fertFood: 0.2 }),
  storm('DUST_STORM_GRADIENT', 'DUST_STORM', 1, 8, 0, 3,
    { impDest: 0.35, impPill: 0.75, distPill: 0.2, bldgPill: 0.6, fertFood: 0.1, fertProd: 0.2 }),
  storm('DUST_STORM_HABOOB', 'DUST_STORM', 2, 2, 50, 7,
    { impDest: 0.75, impPill: 1, distPill: 0.75, bldgPill: 1, pop: 0.2, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 0.6, navalLo: 40, navalHi: 60, fertFood: 0.2, fertProd: 0.3 }),
  storm('TORNADO_FAMILY', 'TORNADO', 1, 15, 0, 1,
    { impDest: 0.35, impPill: 0.75, distPill: 0.2, bldgPill: 0.6 }),
  storm('TORNADO_OUTBREAK', 'TORNADO', 2, 3, 50, 3,
    { impDest: 0.75, impPill: 1, distPill: 0.75, bldgPill: 1, pop: 0.2, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 1, navalLo: 40, navalHi: 60 }),
  storm('HURRICANE_CAT_4', 'HURRICANE', 1, 15, 0, 7,
    { impDest: 0.25, impPill: 0.5, distPill: 0.15, bldgPill: 0.4, lowlandPill: 1, lowlandDist: 1,
      navalP: 0.6, navalLo: 40, navalHi: 60, fertFood: 0.3 }),
  storm('HURRICANE_CAT_5', 'HURRICANE', 2, 3, 50, 19,
    { impDest: 0.5, impPill: 1, distPill: 0.5, bldgPill: 1, lowlandDist: 1, pop: 0.15, civKill: 0.2,
      landP: 1, landLo: 40, landHi: 60, navalP: 1, navalLo: 60, navalHi: 80, fertFood: 0.45, fertProd: 0.15 }),
];

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
interface StormUnitRow {
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

/**
 * THE EIGHT ERUPTION ROWS, in the live game's `RandomEvents` order (MEASURED,
 * the `index` of every event history, `tools/civ6lab/runs/event_history_*`):
 * Eyjafjallajokull's CATASTROPHIC and MEGACOLOSSAL (`VikingsLandmarks_
 * Expansion2.xml`, criteria VikingLandmarks_Expansion2 = RULESET_EXPANSION_2,
 * so every Gathering Storm game loads them), Kilimanjaro's GENTLE and
 * CATASTROPHIC, Vesuvius's MEGACOLOSSAL, then the volcano's GENTLE,
 * CATASTROPHIC and MEGACOLOSSAL. Every `ERUPTION_*` column below is indexed by
 * this row.
 */
export const ERUPTION_ROWS = ['EYJAFJALLAJOKULL_CATASTROPHIC', 'EYJAFJALLAJOKULL_MEGACOLOSSAL',
  'KILIMANJARO_GENTLE', 'KILIMANJARO_CATASTROPHIC', 'VESUVIUS_MEGACOLOSSAL',
  'VOLCANO_GENTLE', 'VOLCANO_CATASTROPHIC', 'VOLCANO_MEGACOLOSSAL'] as const;
/** the `ERUPTION_ROWS` index of a volcano's severity row (GENTLE 0,
 *  CATASTROPHIC 1, MEGACOLOSSAL 2) */
export function volcanoRow(sev: number): number {
  return ERUPTION_ROWS.indexOf(`VOLCANO_${['GENTLE', 'CATASTROPHIC', 'MEGACOLOSSAL'][sev]}` as typeof ERUPTION_ROWS[number]);
}

/** Each row's weight in the turn's one draw, its OccurrencesPerGame at
 *  MODERATE, counted once per SITE: a volcano's rows once per volcano, a
 *  natural wonder's rows once while the wonder stands. */
export const ERUPTION_WEIGHT = srcConst('disasters.eruptionWeight', [4, 2.5, 4, 2.5, 7, 4, 2.5, 1.5] as const, {
  derived: 'each ERUPTION_ROWS row\'s OccurrencesPerGame at REALISM_SETTING_MODERATE, in row order',
  inputs: ERUPTION_ROWS.map((r) => freq(r)),
});

/**
 * CIV6 (`RandomEvents.NaturalWonder`): the natural wonder a row erupts, as this
 * engine names the feature — FEATURE_EYJAFJALLAJOKULL, FEATURE_KILIMANJARO
 * (MOUNT_KILIMANJARO), FEATURE_VESUVIUS; empty on a volcano's row, which
 * erupts a volcano plot. A wonder is ONE site however many plots it covers
 * (Eyjafjallajokull covers two: lab 4's four eruptions in 251 turns fit one
 * site at 6.5, not two), and its ring is every plot touching one of its
 * plots (`Callback GetAffectedPlots_NaturalWonder`). A world lacking the
 * wonder offers its rows no site.
 */
export const ERUPTION_WONDER: readonly string[] = srcConst('disasters.eruptionWonder',
  ['EYJAFJALLAJOKULL', 'EYJAFJALLAJOKULL', 'MOUNT_KILIMANJARO', 'MOUNT_KILIMANJARO', 'VESUVIUS', '', '', ''], {
    derived: 'each ERUPTION_ROWS row\'s RandomEvents.NaturalWonder as the engine feature id (the install\'s '
      + 'FEATURE_ prefix dropped, FEATURE_KILIMANJARO spelled MOUNT_KILIMANJARO); a volcano row carries none '
      + 'and reads the empty id',
    inputs: ERUPTION_ROWS.map((r) => xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${r}`, 'NaturalWonder',
      r.startsWith('VOLCANO') ? { absent: true } : undefined)),
  });

/** CIV6 (`RandomEvent_Yields`, `ReplaceFeature="true"`): each row's
 *  FEATURE_VOLCANIC_SOIL YIELD_FOOD row. Measured as a PER-PLOT chance that
 *  an eligible land plot of the ring becomes Volcanic Soil (bare land
 *  30 / 52 / 74 % over 66 plots, the volcano's). */
export const ERUPTION_PAINT_P = srcConst('disasters.eruptionPaintP', [0.5, 0.75, 0.5, 0.5, 0.25, 0.35, 0.5, 0.75] as const, {
  derived: 'Percentage/100 of each eruption row\'s FEATURE_VOLCANIC_SOIL YIELD_FOOD row, read as the '
    + 'per-plot paint chance the volcano scene measured (tools/civ6lab/runs/volcano_20260923T191337Z.jsonl)',
  inputs: ERUPTION_ROWS.map((r) => xml('RandomEvent_Yields',
    `RandomEventType=RANDOM_EVENT_${r}&YieldType=YIELD_FOOD`, 'Percentage')),
});

/**
 * THE ERUPTION'S DAMAGE ROWS (`RandomEvent_Damages`), per `ERUPTION_ROWS`
 * index, applied to every plot of the ring (`RealismSettings.ExtraRange` is
 * false at MODERATE, so `ExtraRangePercentage` never reads) the way the
 * flood's rows are applied: IMPROVEMENT_PILLAGED 100 on every row, then
 * IMPROVEMENT_DESTROYED, DISTRICT_PILLAGED and BUILDING_PILLAGED,
 * UNIT_DAMAGE_LAND's band on the land units (and CITY_GARRISON / CITY_WALLS,
 * the same band on every row, on a city centre), UNIT_KILLED_CIVILIAN and
 * POPULATION_LOSS. The GENTLE rows carry only the two pillage rows; a damage
 * row a row lacks reads 0.
 */
const eruptDmg = (kind: string, col = 'Percentage') => ERUPTION_ROWS.map((r) =>
  xml('RandomEvent_Damages', `RandomEventType=RANDOM_EVENT_${r}&DamageType=${kind}`, col,
    r.endsWith('GENTLE') && kind !== 'BUILDING_PILLAGED' ? { absent: true } : undefined));
const eruptPct = (name: string, kind: string, v: readonly number[]) => srcConst(`disasters.${name}`, v, {
  derived: `Percentage/100 of each eruption row's ${kind} row; a GENTLE row carries none and reads 0`,
  inputs: eruptDmg(kind),
});
export const ERUPTION_DESTROY_P = eruptPct('eruptionDestroyP', 'IMPROVEMENT_DESTROYED', [0.75, 0.8, 0, 0.8, 0.8, 0, 0.75, 0.8]);
export const ERUPTION_DISTRICT_P = eruptPct('eruptionDistrictP', 'DISTRICT_PILLAGED', [0.75, 0.8, 0, 0.8, 0.8, 0, 0.75, 0.8]);
export const ERUPTION_BLDG_P = eruptPct('eruptionBldgP', 'BUILDING_PILLAGED', [1, 1, 1, 1, 1, 1, 1, 1]);
export const ERUPTION_POP_P = eruptPct('eruptionPopP', 'POPULATION_LOSS', [0.3, 0.4, 0, 0.2, 1, 0, 0.2, 0.35]);
export const ERUPTION_CIV_KILL_P = eruptPct('eruptionCivKillP', 'UNIT_KILLED_CIVILIAN', [0.3, 0.4, 0, 0.2, 1, 0, 0.2, 0.35]);
const eruptBand = (name: string, col: 'MinHP' | 'MaxHP', v: readonly number[]) => srcConst(`disasters.${name}`, v, {
  derived: `each eruption row's UNIT_DAMAGE_LAND ${col}, inclusive; CITY_GARRISON and CITY_WALLS carry the `
    + 'same band on every row, so one roll serves all three; a GENTLE row carries none and reads 0',
  inputs: [...eruptDmg('UNIT_DAMAGE_LAND', col), ...eruptDmg('CITY_GARRISON', col), ...eruptDmg('CITY_WALLS', col)],
});
export const ERUPTION_DMG_LO = eruptBand('eruptionDmgLo', 'MinHP', [40, 60, 0, 40, 70, 0, 40, 60]);
export const ERUPTION_DMG_HI = eruptBand('eruptionDmgHi', 'MaxHP', [60, 80, 0, 60, 90, 0, 60, 80]);
/** The features an eruption's soil REPLACES — Woods and Rainforest (the
 *  install's FOREST and JUNGLE), measured replaced at 6/28, 11/28, 18/28;
 *  Floodplains and Geothermal Fissure are never painted (0/18). */
export const SOIL_REPLACES: readonly string[] = srcConst('disasters.soilReplaces', ['WOODS', 'RAINFOREST'], {
  lab: 'runs/volcano_20260923T191337Z.jsonl',
});

/**
 * THE GATHERING STORM PACK ROWS (`DLC/GranColombia_Maya/Data/
 * GranColombia_Maya_Expansion2.xml`): its .modinfo applies the file under
 * criteria GranColombiaMaya_Expansion2, `any="1"` over RuleSetInUse
 * RULESET_EXPANSION_2, so every Gathering Storm game on the owner's install
 * loads the Meteor Shower, the Jungle Fire and the Forest Fire. Only the
 * `*_MODE.xml` files (Apocalypse) stay out.
 */

/** RANDOM_EVENT_METEOR_SHOWER: weight 6, no ChanceIncreasePerDegree. ONE site
 *  while a plot it may strike exists anywhere (lab 4 fired it 7 times in 251
 *  turns — its column, not a per-plot rate); the plot is a second draw. */
export const METEOR_WEIGHT = srcConst('disasters.meteorWeight', 6, freq('METEOR_SHOWER'));
/** CIV6 (`RandomEvent_Terrains`): the meteor falls on Plains, Grassland,
 *  Snow or Desert, flat or hills — the eight rows, no Tundra, no Mountain. */
export const METEOR_TERRAINS: readonly string[] = srcConst('disasters.meteorTerrains',
  ['PLAINS', 'GRASSLAND', 'SNOW', 'DESERT'], {
    derived: 'the RandomEvent_Terrains rows of RANDOM_EVENT_METEOR_SHOWER as engine terrains, each listed '
      + 'flat and _HILLS (TERRAIN_GRASS is GRASSLAND)',
    inputs: ['PLAINS', 'PLAINS_HILLS', 'GRASS', 'GRASS_HILLS', 'SNOW', 'SNOW_HILLS', 'DESERT', 'DESERT_HILLS']
      .map((t) => xml('RandomEvent_Terrains', `RandomEventType=RANDOM_EVENT_METEOR_SHOWER&TerrainType=TERRAIN_${t}`,
        'TerrainType', { expect: `TERRAIN_${t}` })),
  });
/** CIV6 (`Improvement_ValidFeatures`): the Meteor Site the shower leaves
 *  (`RandomEvent_Improvement_Placements` IMPROVEMENT_METEOR_GOODY) stands on
 *  bare ground or under Woods, Rainforest or Marsh — any other feature (a
 *  natural wonder, Floodplains, a fire's) refuses it. */
export const METEOR_FEATURES: readonly string[] = srcConst('disasters.meteorFeatures',
  ['WOODS', 'RAINFOREST', 'MARSH'], {
    derived: 'the Improvement_ValidFeatures rows of IMPROVEMENT_METEOR_GOODY as engine features '
      + '(FEATURE_FOREST is WOODS, FEATURE_JUNGLE is RAINFOREST)',
    inputs: ['FOREST', 'JUNGLE', 'MARSH'].map((f) => xml('Improvement_ValidFeatures',
      `ImprovementType=IMPROVEMENT_METEOR_GOODY&FeatureType=FEATURE_${f}`, 'FeatureType', { expect: `FEATURE_${f}` })),
  });
/** CIV6 (`RandomEvents.AvoidTerritory`): the meteor falls outside every
 *  player's borders — "in the space between player territories" (the
 *  Environmental Effects pedia). The site's IMPROVEMENT_PILLAGED and
 *  DISTRICT_PILLAGED rows (101) therefore never find anything to take: the
 *  plot holds no improvement and no district. */
export const METEOR_AVOIDS_TERRITORY = srcConst('disasters.meteorAvoidsTerritory', true,
  xml('RandomEvents', 'RandomEventType=RANDOM_EVENT_METEOR_SHOWER', 'AvoidTerritory'));
/** CIV6 (GOODY_METEOR_FREE_UNIT, MODIFIER_PLAYER_GRANT_ADVANCED_UNIT_OF_CLASS_
 *  IN_NEAREST_OWNER_CITY_AND_APPLY_ABILITY, `UnitPromotionClassType`): a unit
 *  that enters the site is granted a Heavy Cavalry unit in its nearest city,
 *  "more powerful than what the player can currently build"
 *  (LOC_IMPROVEMENT_METEOR_GOODY_DESCRIPTION), and "This unit has no resource
 *  maintenance cost" (GOODY_METEOR_UNIT_REFUND_COST, IGNORE_RESOURCE_
 *  MAINTENANCE). `meteorGrantUnit` reads "more powerful" as the next unit of
 *  the class's line past the last one the seat has unlocked. */
export const METEOR_GRANT_CLASS = srcConst('disasters.meteorGrantClass', 'HEAVY_CAV',
  xml('ModifierArguments', 'ModifierId=GOODY_METEOR_FREE_UNIT&Name=UnitPromotionClassType', 'Value',
    { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }));

/**
 * THE FIRES, RANDOM_EVENT_JUNGLE_FIRE then RANDOM_EVENT_FOREST_FIRE (the
 * table's order): each starts on a live plot of its `RandomEvent_Features`
 * row (FEATURE_JUNGLE = RAINFOREST, FEATURE_FOREST = WOODS), ONE site while
 * such a plot exists (lab 4: 6 and 6 in 251 turns at their column 6), the
 * plot a second draw. The plot BURNS (`RandomEvent_Yields` Turn 0), is BURNT
 * at Turn 2 and REGROWS at Turn 6, every turn counted from the event's own
 * start — the plots a fire spreads to share its clock, which is how its
 * "Fire Ended" notification (MinTurn 2) reports every one of them at once.
 * A plot the fire spreads to burns as the burning form of its own feature.
 */
const FIRE_IDS = ['JUNGLE_FIRE', 'FOREST_FIRE'] as const;
const fire = (col: string) => FIRE_IDS.map((id) => xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${id}`, col));
const fireDmg = (kind: string, col: string) => FIRE_IDS.map((id) =>
  xml('RandomEvent_Damages', `RandomEventType=RANDOM_EVENT_${id}&DamageType=${kind}`, col));
const fireYield = (turn: number, col: string, expect: (id: string) => string) => FIRE_IDS.map((id) =>
  xml('RandomEvent_Yields', `RandomEventType=RANDOM_EVENT_${id}&Turn=${turn}`, col, { expect: expect(id) }));
export const FIRE_WEIGHT = srcConst('disasters.fireWeight', [6, 6] as const, {
  derived: 'the two fire rows\' OccurrencesPerGame at REALISM_SETTING_MODERATE, JUNGLE then FOREST',
  inputs: FIRE_IDS.map((id) => freq(id)),
});
export const FIRE_CIPD = srcConst('disasters.fireCipd', [50, 50] as const, {
  derived: 'the two fire rows\' RandomEvents.ChanceIncreasePerDegree, JUNGLE then FOREST',
  inputs: fire('ChanceIncreasePerDegree'),
});
/** per fire row, the feature it starts on (`RandomEvent_Features`) and the
 *  one it puts back at Turn 6 */
export const FIRE_START_FEATURE: readonly string[] = srcConst('disasters.fireStartFeature', ['RAINFOREST', 'WOODS'], {
  derived: 'each fire row\'s RandomEvent_Features FeatureType as the engine feature (FEATURE_JUNGLE is '
    + 'RAINFOREST, FEATURE_FOREST is WOODS); its Turn 6 RandomEvent_Yields row names the same feature',
  inputs: [...FIRE_IDS.map((id) => xml('RandomEvent_Features', `RandomEventType=RANDOM_EVENT_${id}`, 'FeatureType')),
    ...fireYield(6, 'FeatureType', (id) => (id === 'JUNGLE_FIRE' ? 'FEATURE_JUNGLE' : 'FEATURE_FOREST'))],
});
/** per fire row, the feature the plot burns as (`RandomEvent_Yields` Turn 0) */
export const FIRE_BURNING_FEATURE: readonly string[] = srcConst('disasters.fireBurningFeature',
  ['BURNING_RAINFOREST', 'BURNING_WOODS'], {
    derived: 'each fire row\'s Turn 0 RandomEvent_Yields FeatureType as the engine feature '
      + '(FEATURE_BURNING_JUNGLE, FEATURE_BURNING_FOREST)',
    inputs: fireYield(0, 'FeatureType', (id) => (id === 'JUNGLE_FIRE' ? 'FEATURE_BURNING_JUNGLE' : 'FEATURE_BURNING_FOREST')),
  });
/** per fire row, the feature the plot is burnt as (`RandomEvent_Yields` Turn 2) */
export const FIRE_BURNT_FEATURE: readonly string[] = srcConst('disasters.fireBurntFeature',
  ['BURNT_RAINFOREST', 'BURNT_WOODS'], {
    derived: 'each fire row\'s Turn 2 RandomEvent_Yields FeatureType as the engine feature '
      + '(FEATURE_BURNT_JUNGLE, FEATURE_BURNT_FOREST)',
    inputs: fireYield(2, 'FeatureType', (id) => (id === 'JUNGLE_FIRE' ? 'FEATURE_BURNT_JUNGLE' : 'FEATURE_BURNT_FOREST')),
  });
/** `RandomEvent_Yields` Turn 2: the burning plot turns BURNT and gains +1
 *  Food (YIELD_FOOD Amount 1, Percentage 100) — the fertility channel. The
 *  Turn 0 row's Amount is 0: burning pays nothing. */
export const FIRE_BURNT_TURN = srcConst('disasters.fireBurntTurn', 2, {
  derived: 'the Turn of each fire row\'s YIELD_FOOD Amount 1 row, the one naming the BURNT feature',
  inputs: fireYield(2, 'Amount', () => '1'),
});
/** `RandomEvent_Yields` Turn 6: the burnt plot REGROWS its feature and gains
 *  +1 Production (YIELD_PRODUCTION Amount 1, Percentage 100). */
export const FIRE_REGROW_TURN = srcConst('disasters.fireRegrowTurn', 6, {
  derived: 'the Turn of each fire row\'s YIELD_PRODUCTION Amount 1 row, which puts FEATURE_JUNGLE / FEATURE_FOREST back',
  inputs: fireYield(6, 'Amount', () => '1'),
});
/** SPREAD 50, MinTurn 1 / MaxTurn 2: on the event's turns 1 and 2 each plot
 *  burning catches every adjacent live Woods or Rainforest at 50% — "The
 *  flames will spread to any adjacent forest or jungle" (LOC_TUTORIAL_FOREST_
 *  FIRES), "Spreads to adjacent Woods or Rainforest" (the Climate screen). */
export const FIRE_SPREAD_P = srcConst('disasters.fireSpreadP', 0.5, {
  derived: 'Percentage/100 of each fire row\'s SPREAD damage row', inputs: fireDmg('SPREAD', 'Percentage'),
});
export const FIRE_SPREAD_TURNS = srcConst('disasters.fireSpreadTurns', [1, 2] as const, {
  derived: 'the SPREAD row\'s MinTurn and MaxTurn', inputs: [...fireDmg('SPREAD', 'MinTurn'), ...fireDmg('SPREAD', 'MaxTurn')],
});
/** The burning plot's damage rows, every one at Percentage 101 — no roll: an
 *  improvement and a district pillaged, a civilian killed and the land units
 *  struck on the event's turns 0 to 2, and ONE citizen of the owning city on
 *  turn 0 alone (POPULATION_LOSS MaxTurn 0). */
export const FIRE_DAMAGE_TURNS = srcConst('disasters.fireDamageTurns', [0, 2] as const, {
  derived: 'the MinTurn / MaxTurn of the fire rows\' IMPROVEMENT_PILLAGED, DISTRICT_PILLAGED, '
    + 'UNIT_KILLED_CIVILIAN and UNIT_DAMAGE_LAND rows (all four carry 0 / 2)',
  inputs: ['IMPROVEMENT_PILLAGED', 'DISTRICT_PILLAGED', 'UNIT_KILLED_CIVILIAN', 'UNIT_DAMAGE_LAND']
    .flatMap((k) => [...fireDmg(k, 'MinTurn'), ...fireDmg(k, 'MaxTurn')]),
});
export const FIRE_POP_TURN = srcConst('disasters.firePopTurn', 0, {
  derived: 'the MaxTurn of the fire rows\' POPULATION_LOSS row (MinTurn 0)',
  inputs: fireDmg('POPULATION_LOSS', 'MaxTurn'),
});
/** UNIT_DAMAGE_LAND's inclusive band, MinHP 50 / MaxHP 101: a unit at full
 *  health dies on a roll of 100 or 101. */
export const FIRE_DMG = srcConst('disasters.fireDmg', [50, 101] as const, {
  derived: 'the fire rows\' UNIT_DAMAGE_LAND MinHP and MaxHP, inclusive',
  inputs: [...fireDmg('UNIT_DAMAGE_LAND', 'MinHP'), ...fireDmg('UNIT_DAMAGE_LAND', 'MaxHP')],
});
/** CIV6 (`Features`, the pack's four fire rows): the burning and burnt plot
 *  keeps the Woods' DefenseModifier 3, MovementChange 1 and
 *  SightThroughModifier 1, carries Appeal -1 and Settlement false, and no
 *  `Feature_YieldChanges` row; it is not Removable, and it carries no
 *  `Features_XP2.ValidDistrictPlacement` or `ValidWonderPlacement`, so no
 *  city, district or wonder is placed on it (`fireFeature`). */
const FIRE_FEATURES: readonly string[] = [...FIRE_BURNING_FEATURE, ...FIRE_BURNT_FEATURE];
export function fireFeature(f: string | null | undefined): boolean {
  return f != null && FIRE_FEATURES.includes(f);
}
export const FIRE_APPEAL = srcConst('disasters.fireAppeal', -1, {
  derived: 'the Appeal column of the four fire features (all -1)',
  inputs: ['BURNING_FOREST', 'BURNT_FOREST', 'BURNING_JUNGLE', 'BURNT_JUNGLE'].map((f) =>
    xml('Features', `FeatureType=FEATURE_${f}`, 'Appeal')),
});

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

/**
 * THE NUCLEAR ACCIDENT, one row per severity MINOR / MAJOR / CATASTROPHIC
 * (`RANDOM_EVENT_NUCLEAR_ACCIDENT_*`, Severity 0 / 1 / 2). Its site is a city
 * whose Nuclear Power Plant has stood `MinTurnAtRisk` turns (10 / 20 / 30, the
 * city's `reactorAge`), one weight per such city at `OccurrencesPerGame` 1.
 * MEASURED over 75 forced accidents (`tools/civ6lab/runs/reactor_20260923T192129Z.jsonl`):
 * the `RandomEvent_Damages` Percentages are PER-ACCIDENT CHANCES — the
 * Industrial Zone is pillaged at DISTRICT_PILLAGED's 0 / 50 / 100, one citizen
 * is lost at POPULATION_LOSS's 0 / 0 / 80 — and RADIATION_LEAKED's
 * `FalloutDuration` 2 / 10 / 20 lies on the reactor's own plot alone. The
 * plant stays and goes on ageing.
 */
const accident = (sev: string) => `RandomEventType=RANDOM_EVENT_NUCLEAR_ACCIDENT_${sev}`;
const ACCIDENT_SEVS = ['MINOR', 'MAJOR', 'CATASTROPHIC'] as const;
const accidentDmg = (kind: string, col = 'Percentage') =>
  ACCIDENT_SEVS.map((s) => xml('RandomEvent_Damages', `${accident(s)}&DamageType=${kind}`, col));
export const ACCIDENT_WEIGHT = srcConst('disasters.accidentWeight', [1, 1, 1] as const, {
  derived: 'each accident row\'s OccurrencesPerGame at REALISM_SETTING_MODERATE, in severity order',
  inputs: ACCIDENT_SEVS.map((s) => freq(`NUCLEAR_ACCIDENT_${s}`)),
});
export const ACCIDENT_MIN_TURN = srcConst('disasters.accidentMinTurn', [10, 20, 30] as const, {
  derived: 'each accident row\'s RandomEvents.MinTurnAtRisk, in severity order',
  inputs: ACCIDENT_SEVS.map((s) => xml('RandomEvents', accident(s), 'MinTurnAtRisk')),
});
export const ACCIDENT_FALLOUT = srcConst('disasters.accidentFallout', [2, 10, 20] as const, {
  derived: 'each accident row\'s RADIATION_LEAKED FalloutDuration, in severity order — the turns '
    + 'the reactor\'s own plot stays irradiated (measured, runs/reactor_20260923T192129Z.jsonl)',
  inputs: accidentDmg('RADIATION_LEAKED', 'FalloutDuration'),
});
export const ACCIDENT_DISTRICT_P = srcConst('disasters.accidentDistrictP', [0, 0.5, 1] as const, {
  derived: 'Percentage/100 of each accident row\'s DISTRICT_PILLAGED row (MINOR carries none), the '
    + 'chance the Industrial Zone is pillaged (measured 0/25, 13/25, 25/25)',
  inputs: [
    xml('RandomEvent_Damages', `${accident('MINOR')}&DamageType=DISTRICT_PILLAGED`, 'Percentage', { absent: true }),
    ...accidentDmg('DISTRICT_PILLAGED').slice(1),
  ],
});
export const ACCIDENT_POP_P = srcConst('disasters.accidentPopP', [0, 0, 0.8] as const, {
  derived: 'Percentage/100 of each accident row\'s POPULATION_LOSS row (only CATASTROPHIC carries '
    + 'one), the chance the city loses ONE citizen (measured 22/25)',
  inputs: [
    ...accidentDmg('POPULATION_LOSS').slice(0, 2).map((x) => ({ ...x, absent: true })),
    accidentDmg('POPULATION_LOSS')[2],
  ],
});
