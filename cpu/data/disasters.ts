import type { CivId, LeaderId } from './seats';
import { srcConst, xml, type SrcMap } from './provenance';
import { scaleByGameSpeed } from './constants';

/**
 * THE TURN'S ONE RANDOM EVENT. CIV6 (`RandomEvent_Frequencies`,
 * REALISM_SETTING_MODERATE — OWNER RULING: this engine models MODERATE):
 * every event row carries an `OccurrencesPerGame`, and MEASURED in a natural
 * 251-turn game (`tools/civ6lab/runs/event_history_lab4_20260923T135005Z.txt`)
 * the game fires at most ONE event a turn, drawn over the eligible (event,
 * site) pairs with that column as the pair's WEIGHT: floods and eruptions ran
 * about ten times their column (one weight per river, per volcano), storms
 * and droughts near theirs (one weight per event). `disasterPhase` makes the
 * draw; every weight below is the column itself, which the draw reads in
 * tenths (`EVENT_OCC_SCALE`).
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

/** An integer row weight at `degrees` of warming: CIV6
 *  (`ChanceIncreasePerDegree`) "the chance of Storms, River Flooding, and
 *  Drought occurring increases" as the CO2 rises — the weight plus
 *  trunc(CIPD × weight × degrees) // 100, in integers, so nothing is added
 *  until that product reaches 100 (GameCore_XP2 0x28da10). */
export function warmedWeight(weight: number, cipdPct: number, degrees: number): number {
  return weight + Math.floor(Math.floor(cipdPct * weight * degrees) / 100);
}

/**
 * THE DRAW'S FIXED POINT (Game_RandomEvents, GameCore_XP2 0x335260 / 0x339020;
 * `tools/civ6lab/dll_readings.md`): a row's `OccurrencesPerGame` is read in
 * tenths, trunc(10·Occ), and the turn's one draw runs over 10·N, N the game's
 * turns — the remainder the empty turn. A row counted once per map scales
 * with the map's area over MAPSIZE_STANDARD's (`STANDARD_MAP_AREA`, integer),
 * a row counted per site does not (the Duel reads: once-per-map Occ / 991,
 * inside the measured (933, 1120]; per site the measured 251).
 */
export const EVENT_OCC_SCALE = srcConst('disasters.eventOccScale', 10, {
  lab: '(GameCore_XP2 0x335260, dll_volcano.py / dll_drought.py on runs/c74s2_turn_c74s2_duel1_20260926T074416Z.jsonl '
    + 'and the other Duel reads): the weights in tenths of OccurrencesPerGame, the draw over 10 x N',
});
export const STANDARD_MAP_AREA = srcConst('disasters.standardMapArea', 84 * 54, {
  derived: 'MAPSIZE_STANDARD GridWidth x GridHeight, the area a once-per-map row\'s weight is scaled against (0x28d0f0)',
  inputs: [xml('Maps', 'MapSizeType=MAPSIZE_STANDARD', 'GridWidth'), xml('Maps', 'MapSizeType=MAPSIZE_STANDARD', 'GridHeight')],
});

/** CIV6 (RANDOM_EVENT_FIRST_TIME_OCCURRENCE_BOOST, Expansion2_GlobalParameters):
 *  the percent a per-site (row, site) pair's chance is raised by while that
 *  pair has not yet fired this game — MEASURED per (row, site), neither per
 *  row nor per site, and on the per-site rows. */
export const FIRST_TIME_OCCURRENCE_BOOST = srcConst('disasters.firstTimeOccurrenceBoost', 30, {
  derived: 'the GlobalParameters row, applied per (row, site) as the Duel reads fit it '
    + '(the eight Duel records c74s2_turn_c74s2_duel1..8, tools/civ6lab/c74s2_boost.py: no boost, a per-row and a '
    + 'per-site boost all fail)',
  inputs: [xml('GlobalParameters', 'Name=RANDOM_EVENT_FIRST_TIME_OCCURRENCE_BOOST', 'Value')],
});

/** THE VOLCANO ROLL (Game_RandomEvents "Active Volcano Roll", GameCore_XP2
 *  0x335040; `volcanoRoll`): every volcano starts DORMANT, and ONE roll a
 *  turn for the whole map keeps the active share near the realism setting's
 *  `PercentVolcanoesActive` — waking one dormant volcano below it, putting
 *  one active volcano to sleep at or above it. Only an active one erupts. */
export const PERCENT_VOLCANOES_ACTIVE = srcConst('disasters.percentVolcanoesActive', 70,
  xml('RealismSettings', 'RealismSettingType=REALISM_SETTING_MODERATE', 'PercentVolcanoesActive'));
/** The roll's N, the turns the game's span is read at: the Duel wakes fit
 *  500 (15.3 expected against 15 read, 2.7 sleeps against 2; logL -93.8) and
 *  not the event draw's 250 (31.1 wakes, logL -100.3). */
export const VOLCANO_ROLL_TURNS = srcConst('disasters.volcanoRollTurns', 500, {
  lab: '(dll_volcano.py on runs/c74s2_turn_c74s2_duel1_20260926T074416Z.jsonl to '
    + 'runs/c74s2_turn_c74s2_duel8_20260926T084042Z.jsonl): the wakes fit N 500, the event draw 250',
});

/** CIV6 (`RANDOM_EVENT_START_TURN`, Expansion2_GlobalParameters): the first
 *  turn a random event may fire. */
export const RANDOM_EVENT_START_TURN = srcConst('disasters.randomEventStartTurn', 2,
  xml('GlobalParameters', 'Name=RANDOM_EVENT_START_TURN', 'Value'));

/** DROUGHT_MAJOR / DROUGHT_EXTREME: weights 23 / 5, each counted once; the
 *  footprint is `Hexes` 7 (the first seven `STORM_DISC` slots, the centre and
 *  its ring) and the dry spell lasts `Duration` 5 / 10 at the game's speed
 *  (`DROUGHT_TURNS`). */
const drought = (ev: string, col: string) => xml('RandomEvents', `RandomEventType=RANDOM_EVENT_${ev}`, col);
export const DROUGHT_WEIGHT = srcConst('disasters.droughtWeight', [23, 5] as const, {
  derived: 'the two drought rows\' OccurrencesPerGame at REALISM_SETTING_MODERATE, MAJOR then EXTREME',
  inputs: [freq('DROUGHT_MAJOR'), freq('DROUGHT_EXTREME')],
});
export const DROUGHT_DURATION = srcConst('disasters.droughtDuration', [5, 10] as const, {
  derived: 'the two drought rows\' RandomEvents.Duration, MAJOR then EXTREME',
  inputs: [drought('DROUGHT_MAJOR', 'Duration'), drought('DROUGHT_EXTREME', 'Duration')],
});
/** The turns a drought lies on its plots: its `Duration` at the game's
 *  speed (GameCore_XP2 0x2922ff: the drought's end turn is the current turn
 *  plus 0x5254d0(Duration), Duration × CostMultiplier / 100 truncated —
 *  online 2 and 5, the dry spells of runs/h1_duelw1109 t110 at plot 785
 *  (t110-111) and runs/h1_duelw1110 t64 at plot 887 (t64-68)). */
export const DROUGHT_TURNS: readonly number[] = DROUGHT_DURATION.map(scaleByGameSpeed);
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

/** THE DROUGHT'S SPACING (`RandomEvents.Spacing`, both drought rows): a
 *  start plot's weight in the map-wide pick is 1 + min(its distance to the
 *  nearest live event, this) (GameCore_XP2 0x287e80, `droughtStart`). */
export const DROUGHT_SPACING = srcConst('disasters.droughtSpacing', 15, drought('DROUGHT_MAJOR', 'Spacing'));
/** A storm row's `Spacing` (15 on every storm row): the distance past which
 *  a live storm's centre no longer lowers a start plot's weight. */

/** Dry ground for a drought's patch: its terrain above the sea and CIV6
 *  (LOC_CLIMATE_DROUGHT_EVENT_DESCRIPTION_TOOLTIP) "Drought targets areas that
 *  are devoid of all Features" — no feature stands there, and a district's
 *  plot (`district`: it holds one, a city centre included) counts as
 *  featureless whatever lies under it. */
export function droughtGround(t: {
  terrain: string; elevation: string; feature: string | null; submerged?: boolean;
}, district: boolean): boolean {
  return droughtTerrain(t) && (t.feature === null || district) && !t.submerged;
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
 * step from (the walk is measured, ask 16). Eight bands, both ends
 * inclusive, by signed degree (north positive, `windWeights`); each row's six
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
/** each band's `MaximumLatitude`, in `WIND_BAND_LO`'s order */
export const WIND_BAND_HI: readonly number[] = srcConst('disasters.windBandHi',
  [90, 60, 30, 5, 0, -5, -30, -60], {
    derived: 'each band\'s `PrevailingWinds.MaximumLatitude`, in WIND_BAND_LO\'s order',
    inputs: [xml('PrevailingWinds', 'MinimumLatitude=60&DirectionType=DIRECTION_WEST', 'MaximumLatitude'),
      xml('PrevailingWinds', 'MinimumLatitude=-90&DirectionType=DIRECTION_WEST', 'MaximumLatitude')],
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
 * A map row's LATITUDE for the winds (Game_Climate 0x69d80, `tools/civ6lab/
 * dll_readings.md` "the storm's walk"): the game's lat = Bottom + (Top − Bottom) ×
 * (100y // H) // 100, Top 90 and Bottom −90, y the game's row. The engine's
 * rows are the game's y (`world@1`) with the game's north and south
 * directions swapped (the game's NE is the engine's SE), and the
 * `PrevailingWinds` table is its own north-south mirror, so the engine reads
 * the rows by name at the mirrored latitude 90 − 180 × (100 row // H) // 100.
 */
export function windLatitude(row: number, height: number): number {
  return 90 - Math.floor((180 * Math.floor((100 * row) / height)) / 100);
}

/** The six heading weights a storm's step draws from at `row`: every
 *  `PrevailingWinds` band whose latitudes hold the row's (`windLatitude`),
 *  both ends inclusive — a boundary latitude pools two bands (0x28c500). */
export function windWeights(row: number, height: number): number[] {
  const lat = windLatitude(row, height);
  const out = [0, 0, 0, 0, 0, 0];
  PREVAILING_WINDS.forEach((w, i) => {
    if (WIND_BAND_LO[i] <= lat && lat <= WIND_BAND_HI[i]) for (let d = 0; d < 6; d++) out[d] += w[d];
  });
  return out;
}

/** a storm's step onto its own `RandomEvent_Terrains` costs this much of
 *  `STORM_MOVEMENT`, onto any other plot `STORM_STEP_COST_OFF` (0x28c500) */
export const STORM_STEP_COST_ON = srcConst('disasters.stormStepCostOn', 1, {
  lab: '(GameCore_XP2 0x28c500, tools/civ6lab/dll_readings.md): a step onto the storm\'s own terrain costs 1',
});
export const STORM_STEP_COST_OFF = srcConst('disasters.stormStepCostOff', 2, {
  lab: '(GameCore_XP2 0x28c500, tools/civ6lab/dll_readings.md): a step onto any other terrain costs 2',
});
/** the percent of a storm's damage and fertility rows its footprint strikes
 *  at on the storm's LAST turn (turn − start + 1 ≥ Duration; 0x286f80), each
 *  row's Percentage × it // 100 */
export const STORM_LAST_TURN_PCT = srcConst('disasters.stormLastTurnPct', 50, {
  lab: '(GameCore_XP2 0x286f80, tools/civ6lab/dll_readings.md): 100% of the rows\' Percentage, 50% on the last turn',
});

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
   *  exporter; checked by tools/install/xml_check.py. */
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
 *  MODERATE, counted once per SITE: a volcano's rows once per ACTIVE volcano,
 *  a natural wonder's rows once while the wonder stands. */
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
 * CIV6 (`RandomEvent_Yields`, FEATURE_VOLCANIC_SOIL, `ReplaceFeature`): the
 * row's other yield rows beside its paint row — YIELD_PRODUCTION on every
 * row, YIELD_SCIENCE on the CATASTROPHIC and MEGACOLOSSAL rows and
 * Vesuvius's, YIELD_CULTURE on Vesuvius's alone. Each is the chance a plot
 * the eruption PAINTS gains +1 of that yield (measured: painted plots gain
 * +1 Food, some +1 Production, and +1 Science at CATASTROPHIC and
 * MEGACOLOSSAL only, runs/volcano_own_20260926T074139Z.jsonl). A row the
 * install does not carry reads 0.
 */
const eruptYield = (name: string, y: string, v: readonly number[]) => srcConst(`disasters.${name}`, v, {
  derived: `Percentage/100 of each eruption row's FEATURE_VOLCANIC_SOIL ${y} row, the chance a painted `
    + 'plot gains +1 of it; a row carrying none reads 0',
  inputs: ERUPTION_ROWS.map((r, i) => xml('RandomEvent_Yields',
    `RandomEventType=RANDOM_EVENT_${r}&YieldType=${y}`, 'Percentage', v[i] === 0 ? { absent: true } : undefined)),
});
export const ERUPTION_PROD_P = eruptYield('eruptionProdP', 'YIELD_PRODUCTION', [0.25, 0.35, 0.25, 0.35, 0.25, 0.15, 0.25, 0.35]);
export const ERUPTION_SCI_P = eruptYield('eruptionSciP', 'YIELD_SCIENCE', [0.1, 0.15, 0, 0.15, 0.25, 0, 0.1, 0.15]);
export const ERUPTION_CUL_P = eruptYield('eruptionCulP', 'YIELD_CULTURE', [0, 0, 0, 0, 0.5, 0, 0, 0]);

/**
 * THE ERUPTION'S DAMAGE ROWS (`RandomEvent_Damages`), per `ERUPTION_ROWS`
 * index, applied to every OWNED plot of the ring (measured: unowned
 * improvements stood 81 of 81, runs/volcano_own_20260926T074139Z.jsonl;
 * `RealismSettings.ExtraRange` is false at MODERATE, so
 * `ExtraRangePercentage` never reads) the way the flood's rows are
 * applied: IMPROVEMENT_PILLAGED 100 on every row, then
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
  derived: `each eruption row's UNIT_DAMAGE_LAND ${col}; CITY_GARRISON and CITY_WALLS carry the `
    + 'same band on every row — the city\'s one roll reads it inclusive, each land unit\'s own draw '
    + 'MinHP + rand(MaxHP - MinHP) (the applier 0x3366a0); a GENTLE row carries none and reads 0',
  inputs: [...eruptDmg('UNIT_DAMAGE_LAND', col), ...eruptDmg('CITY_GARRISON', col), ...eruptDmg('CITY_WALLS', col)],
});
export const ERUPTION_DMG_LO = eruptBand('eruptionDmgLo', 'MinHP', [40, 60, 0, 40, 70, 0, 40, 60]);
export const ERUPTION_DMG_HI = eruptBand('eruptionDmgHi', 'MaxHP', [60, 80, 0, 60, 90, 0, 60, 80]);
/** The features an eruption's soil REPLACES — Woods and Rainforest (the
 *  install's FOREST and JUNGLE), measured replaced at 6/28, 11/28, 18/28, and
 *  Marsh (22 of 36); Floodplains and Geothermal Fissure (0/18) and Oasis
 *  (0/36) are never painted. */
export const SOIL_REPLACES: readonly string[] = srcConst('disasters.soilReplaces', ['WOODS', 'RAINFOREST', 'MARSH'], {
  lab: 'runs/volcano_20260923T191337Z.jsonl (Woods, Rainforest, Floodplains, Fissure) and '
    + 'runs/volcano_own_20260926T081948Z.jsonl (Marsh 22/36 painted, Oasis 0/36)',
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
 * at Turn 2 and REGROWS at Turn 6, every turn counted from the plot's OWN
 * ignition: a plot the fire spreads to burns on its ignition turn and the
 * next, is burnt four turns and regrows on its ignition + 6
 * (runs/c74s3_fire_20260926T133940Z.jsonl,
 * runs/c74s3_fire2_20260926T134425Z.jsonl). A plot the fire spreads to burns
 * as the burning form of its own feature.
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
/** per fire row, JUNGLE then FOREST: 1 where the fire spreads into the
 *  other row's feature too, 0 where it spreads into its own alone — a Forest
 *  Fire never spreads into Rainforest; a Jungle Fire takes both, as the
 *  Climate screen's "Spreads to adjacent Woods or Rainforest" reads. */
export const FIRE_SPREAD_CROSS = srcConst('disasters.fireSpreadCross', [1, 0] as const, {
  lab: 'runs/c74s3_fire_20260926T133940Z.jsonl and runs/c74s3_fire2_20260926T134425Z.jsonl',
  note: 'five Forest Fires with three Rainforest neighbours each: no Rainforest plot ever burned, while the Woods neighbours caught in 2 of 5',
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
/** UNIT_DAMAGE_LAND's band, MinHP 50 / MaxHP 101, drawn per unit as MinHP +
 *  rand(MaxHP − MinHP) (the applier 0x3366a0): 50..100, so a unit at full
 *  health dies on a draw of 100. */
export const FIRE_DMG = srcConst('disasters.fireDmg', [50, 101] as const, {
  derived: 'the fire rows\' UNIT_DAMAGE_LAND MinHP and MaxHP',
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

/**
 * THE FLOOD'S ROWS (`Expansion2_RandomEvents.xml`), per severity MODERATE /
 * MAJOR / 1000_YEAR, each list in the install's XML order — the order the
 * flood walks them (GameCore_XP2 0xa2a4d0 the damage, 0xa2ed80 the yields).
 */
const FLOOD_SEVS = ['MODERATE', 'MAJOR', '1000_YEAR'] as const;
const floodEv = (sev: string) => `RandomEventType=RANDOM_EVENT_FLOOD_${sev}`;

/** One `RandomEvent_Damages` row of a flood: its DamageType, its Percentage
 *  (the chance of the row's one draw per plot) and its MinHP / MaxHP band (0
 *  where the row carries none). */
export interface FloodDamageRow {
  kind: 'IMPROVEMENT_DESTROYED' | 'IMPROVEMENT_PILLAGED' | 'DISTRICT_PILLAGED' | 'BUILDING_PILLAGED'
    | 'POPULATION_LOSS' | 'UNIT_KILLED_CIVILIAN' | 'UNIT_DAMAGE_LAND' | 'CITY_GARRISON' | 'CITY_WALLS';
  pct: number;
  lo: number;
  hi: number;
}
const floodDamageRows = (sev: typeof FLOOD_SEVS[number], rows: readonly FloodDamageRow[]): readonly FloodDamageRow[] => {
  const at = (r: FloodDamageRow) => `${floodEv(sev)}&DamageType=${r.kind}`;
  srcConst(`disasters.floodDamageKinds.${sev}`, rows.map((r) => r.kind), {
    derived: `the RANDOM_EVENT_FLOOD_${sev} rows of RandomEvent_Damages in XML order (Expansion2_RandomEvents.xml)`,
    inputs: rows.map((r) => xml('RandomEvent_Damages', at(r), 'DamageType', { expect: r.kind })),
  });
  srcConst(`disasters.floodDamagePct.${sev}`, rows.map((r) => r.pct), {
    derived: `the Percentage of each RANDOM_EVENT_FLOOD_${sev} damage row, in XML order`,
    inputs: rows.map((r) => xml('RandomEvent_Damages', at(r), 'Percentage', { expect: r.pct })),
  });
  srcConst(`disasters.floodDamageBand.${sev}`, rows.flatMap((r) => [r.lo, r.hi]), {
    derived: `the MinHP / MaxHP of each RANDOM_EVENT_FLOOD_${sev} damage row, in XML order; a row carrying `
      + 'no band reads the schema\'s 0 / 0',
    inputs: rows.flatMap((r) => [xml('RandomEvent_Damages', at(r), 'MinHP', { expect: r.lo }),
      xml('RandomEvent_Damages', at(r), 'MaxHP', { expect: r.hi })]),
  });
  return rows;
};
const dmg = (kind: FloodDamageRow['kind'], pct: number, lo = 0, hi = 0): FloodDamageRow => ({ kind, pct, lo, hi });
export const FLOOD_DAMAGE_ROWS: readonly (readonly FloodDamageRow[])[] = [
  floodDamageRows('MODERATE', [dmg('IMPROVEMENT_PILLAGED', 100), dmg('BUILDING_PILLAGED', 100)]),
  floodDamageRows('MAJOR', [dmg('IMPROVEMENT_DESTROYED', 50), dmg('IMPROVEMENT_PILLAGED', 100),
    dmg('DISTRICT_PILLAGED', 50), dmg('BUILDING_PILLAGED', 100), dmg('POPULATION_LOSS', 15),
    dmg('UNIT_KILLED_CIVILIAN', 15), dmg('UNIT_DAMAGE_LAND', 100, 30, 50), dmg('CITY_GARRISON', 100, 30, 50),
    dmg('CITY_WALLS', 100, 30, 50)]),
  floodDamageRows('1000_YEAR', [dmg('IMPROVEMENT_DESTROYED', 80), dmg('IMPROVEMENT_PILLAGED', 100),
    dmg('DISTRICT_PILLAGED', 80), dmg('BUILDING_PILLAGED', 100), dmg('POPULATION_LOSS', 25),
    dmg('UNIT_KILLED_CIVILIAN', 25), dmg('UNIT_DAMAGE_LAND', 100, 50, 70), dmg('CITY_GARRISON', 100, 50, 70),
    dmg('CITY_WALLS', 100, 50, 70)]),
];

/** One `RandomEvent_Yields` row of a flood: +1 of its yield (Food →
 *  `fertility`, Production → `fertilityProd`) on a plot of its Floodplains
 *  kind, at its Percentage. */
export interface FloodYieldRow {
  yield: 'YIELD_FOOD' | 'YIELD_PRODUCTION';
  feature: 'FLOODPLAINS' | 'FLOODPLAINS_GRASSLAND' | 'FLOODPLAINS_PLAINS';
  pct: number;
}
const floodYieldRows = (sev: typeof FLOOD_SEVS[number], rows: readonly FloodYieldRow[]): readonly FloodYieldRow[] => {
  const at = (r: FloodYieldRow) => `${floodEv(sev)}&YieldType=${r.yield}&FeatureType=FEATURE_${r.feature}`;
  srcConst(`disasters.floodYieldRows.${sev}`, rows.flatMap((r) => [r.yield, r.feature]), {
    derived: `the RANDOM_EVENT_FLOOD_${sev} rows of RandomEvent_Yields in XML order, each its YieldType and `
      + 'FeatureType (the FEATURE_ prefix dropped)',
    inputs: rows.map((r) => xml('RandomEvent_Yields', at(r), 'FeatureType', { expect: `FEATURE_${r.feature}` })),
  });
  srcConst(`disasters.floodYieldPct.${sev}`, rows.map((r) => r.pct), {
    derived: `the Percentage of each RANDOM_EVENT_FLOOD_${sev} yield row, in XML order`,
    inputs: rows.map((r) => xml('RandomEvent_Yields', at(r), 'Percentage', { expect: r.pct })),
  });
  return rows;
};
const yld = (y: 'F' | 'P', feature: FloodYieldRow['feature'], pct: number): FloodYieldRow =>
  ({ yield: y === 'F' ? 'YIELD_FOOD' : 'YIELD_PRODUCTION', feature, pct });
export const FLOOD_YIELD_ROWS: readonly (readonly FloodYieldRow[])[] = [
  floodYieldRows('MODERATE', [yld('F', 'FLOODPLAINS', 25), yld('F', 'FLOODPLAINS_GRASSLAND', 15),
    yld('F', 'FLOODPLAINS_PLAINS', 30)]),
  floodYieldRows('MAJOR', [yld('F', 'FLOODPLAINS', 30), yld('P', 'FLOODPLAINS', 15),
    yld('F', 'FLOODPLAINS_GRASSLAND', 25), yld('P', 'FLOODPLAINS_GRASSLAND', 30),
    yld('F', 'FLOODPLAINS_PLAINS', 45), yld('P', 'FLOODPLAINS_PLAINS', 10)]),
  floodYieldRows('1000_YEAR', [yld('F', 'FLOODPLAINS', 45), yld('P', 'FLOODPLAINS', 25),
    yld('F', 'FLOODPLAINS_GRASSLAND', 40), yld('P', 'FLOODPLAINS_GRASSLAND', 40),
    yld('F', 'FLOODPLAINS_PLAINS', 60), yld('P', 'FLOODPLAINS_PLAINS', 15)]),
];

/** CIV6 (`RandomEvents.MitigatedYieldReduction`): on a mitigated river each
 *  yield row's Percentage falls to (100 − this) × Percentage // 100. */
export const FLOOD_MITIGATED_YIELD_REDUCTION = srcConst('disasters.floodMitigatedYieldReduction', 50, {
  derived: 'the three flood rows\' RandomEvents.MitigatedYieldReduction (50 on each)',
  inputs: FLOOD_SEVS.map((s) => xml('RandomEvents', floodEv(s), 'MitigatedYieldReduction', { expect: 50 })),
});

/** One `RandomEvent_Damages` row of a storm, in XML order: its DamageType,
 *  Percentage, CoastalLowlandPercentage (-1 where the row carries none) and
 *  MinHP / MaxHP band (0 where none). */
export interface StormDamageRow {
  kind: string;
  pct: number;
  lowland: number;
  lo: number;
  hi: number;
}
/** One `RandomEvent_Yields` row of a storm, in XML order (FeatureType
 *  FEATURE_ICE on every one: a feature that exists, so the row draws). */
export interface StormYieldRow {
  yield: 'YIELD_FOOD' | 'YIELD_PRODUCTION';
  pct: number;
}
const stormRows = (id: string, dmg: readonly StormDamageRow[], yields: readonly StormYieldRow[]) => {
  const ev = `RandomEventType=RANDOM_EVENT_${id}`;
  srcConst(`disasters.stormDamageRows.${id}`, dmg.flatMap((r) => [r.kind, r.pct, r.lowland, r.lo, r.hi]), {
    derived: `the RANDOM_EVENT_${id} rows of RandomEvent_Damages in XML order (Expansion2_RandomEvents.xml), each `
      + 'its DamageType, Percentage, CoastalLowlandPercentage (-1 absent), MinHP and MaxHP (the schema default 0 where none)',
    inputs: dmg.flatMap((r) => {
      const at = `${ev}&DamageType=${r.kind}`;
      return [xml('RandomEvent_Damages', at, 'Percentage', { expect: r.pct }),
        xml('RandomEvent_Damages', at, 'CoastalLowlandPercentage', r.lowland < 0 ? { absent: true } : { expect: r.lowland }),
        xml('RandomEvent_Damages', at, 'MinHP', { expect: r.lo }),
        xml('RandomEvent_Damages', at, 'MaxHP', { expect: r.hi })];
    }),
  });
  srcConst(`disasters.stormYieldRows.${id}`, yields.flatMap((r) => [r.yield, r.pct]), {
    derived: `the RANDOM_EVENT_${id} rows of RandomEvent_Yields in XML order, each its YieldType and Percentage`,
    inputs: yields.map((r) => xml('RandomEvent_Yields', `${ev}&YieldType=${r.yield}&FeatureType=FEATURE_ICE`, 'Percentage', { expect: r.pct })),
  });
  return { dmg, yields };
};
const sd = (kind: string, pct: number, lowland = -1, lo = 0, hi = 0): StormDamageRow => ({ kind, pct, lowland, lo, hi });
const sy = (y: 'F' | 'P', pct: number): StormYieldRow => ({ yield: y === 'F' ? 'YIELD_FOOD' : 'YIELD_PRODUCTION', pct });
const STORM_BASE_ROWS = (destroyed: number, pillaged: number, district: number, building: number, plLow = -1, diLow = -1) => [
  sd('IMPROVEMENT_DESTROYED', destroyed), sd('IMPROVEMENT_PILLAGED', pillaged, plLow),
  sd('DISTRICT_PILLAGED', district, diLow), sd('BUILDING_PILLAGED', building)];
/** each storm row's damage and yield rows, in `STORM_EVENTS` order */
export const STORM_ROWS: readonly { dmg: readonly StormDamageRow[]; yields: readonly StormYieldRow[] }[] = [
  stormRows('BLIZZARD_SIGNIFICANT', STORM_BASE_ROWS(25, 50, 15, 40), [sy('F', 10)]),
  stormRows('BLIZZARD_CRIPPLING', [...STORM_BASE_ROWS(50, 100, 50, 100), sd('POPULATION_LOSS', 15),
    sd('UNIT_KILLED_CIVILIAN', 20), sd('UNIT_DAMAGE_LAND', 100, -1, 40, 60), sd('UNIT_DAMAGE_NAVAL', 60, -1, 40, 60)], [sy('F', 20)]),
  stormRows('DUST_STORM_GRADIENT', STORM_BASE_ROWS(35, 75, 20, 60), [sy('F', 10), sy('P', 20)]),
  stormRows('DUST_STORM_HABOOB', [...STORM_BASE_ROWS(75, 100, 75, 100), sd('POPULATION_LOSS', 20),
    sd('UNIT_KILLED_CIVILIAN', 20), sd('UNIT_DAMAGE_LAND', 100, -1, 40, 60), sd('UNIT_DAMAGE_NAVAL', 60, -1, 40, 60)],
  [sy('F', 20), sy('P', 30)]),
  stormRows('TORNADO_FAMILY', STORM_BASE_ROWS(35, 75, 20, 60), []),
  stormRows('TORNADO_OUTBREAK', [...STORM_BASE_ROWS(75, 100, 75, 100), sd('POPULATION_LOSS', 20),
    sd('UNIT_KILLED_CIVILIAN', 20), sd('UNIT_DAMAGE_LAND', 100, -1, 40, 60), sd('UNIT_DAMAGE_NAVAL', 100, -1, 40, 60)], []),
  stormRows('HURRICANE_CAT_4', [...STORM_BASE_ROWS(25, 50, 15, 40, 100, 100), sd('UNIT_DAMAGE_NAVAL', 60, -1, 40, 60)],
    [sy('F', 30)]),
  stormRows('HURRICANE_CAT_5', [...STORM_BASE_ROWS(50, 100, 50, 100, -1, 100), sd('POPULATION_LOSS', 15),
    sd('UNIT_KILLED_CIVILIAN', 20), sd('UNIT_DAMAGE_LAND', 100, -1, 40, 60), sd('UNIT_DAMAGE_NAVAL', 100, -1, 60, 80)],
  [sy('F', 45), sy('P', 15)]),
];

/** CIV6 (`PrevailingWinds`, XML order): the rows a storm's step weighs, as
 *  the game reads them — its latitude band (both ends inclusive), its
 *  direction (the DLL's DirectionTypes index: 0 NORTHEAST, 1 EAST, 2
 *  SOUTHEAST, 3 SOUTHWEST, 4 WEST, 5 NORTHWEST) and weight. */
export interface WindRow {
  lo: number;
  hi: number;
  dir: number;
  weight: number;
}
const WIND_DIRECTION_TYPES = ['NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTHWEST', 'WEST', 'NORTHWEST'] as const;
const windXmlRow = (lo: number, hi: number, dir: typeof WIND_DIRECTION_TYPES[number], weight: number): WindRow => {
  srcConst(`disasters.windRow.${lo}.${dir}`, [hi, weight], {
    derived: `the PrevailingWinds row MinimumLatitude ${lo} DIRECTION_${dir}: its MaximumLatitude and Weight`,
    inputs: [xml('PrevailingWinds', `MinimumLatitude=${lo}&DirectionType=DIRECTION_${dir}`, 'MaximumLatitude', { expect: hi }),
      xml('PrevailingWinds', `MinimumLatitude=${lo}&DirectionType=DIRECTION_${dir}`, 'Weight', { expect: weight })],
  });
  return { lo, hi, dir: WIND_DIRECTION_TYPES.indexOf(dir), weight };
};
export const WIND_ROWS: readonly WindRow[] = [
  windXmlRow(60, 90, 'NORTHWEST', 1), windXmlRow(60, 90, 'WEST', 2), windXmlRow(60, 90, 'SOUTHWEST', 2),
  windXmlRow(30, 60, 'NORTHEAST', 2), windXmlRow(30, 60, 'EAST', 2), windXmlRow(30, 60, 'SOUTHEAST', 1),
  windXmlRow(5, 30, 'NORTHWEST', 2), windXmlRow(5, 30, 'WEST', 2), windXmlRow(5, 30, 'SOUTHWEST', 1),
  windXmlRow(0, 5, 'NORTHWEST', 1), windXmlRow(0, 5, 'WEST', 1),
  windXmlRow(-5, 0, 'WEST', 1), windXmlRow(-5, 0, 'SOUTHWEST', 1),
  windXmlRow(-30, -5, 'NORTHWEST', 1), windXmlRow(-30, -5, 'WEST', 2), windXmlRow(-30, -5, 'SOUTHWEST', 2),
  windXmlRow(-60, -30, 'NORTHEAST', 1), windXmlRow(-60, -30, 'EAST', 2), windXmlRow(-60, -30, 'SOUTHEAST', 2),
  windXmlRow(-90, -60, 'NORTHWEST', 2), windXmlRow(-90, -60, 'WEST', 2), windXmlRow(-90, -60, 'SOUTHWEST', 1),
];

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
 * plant is pillaged by every accident, stays and goes on ageing.
 */
const accident = (sev: string) => `RandomEventType=RANDOM_EVENT_NUCLEAR_ACCIDENT_${sev}`;
const ACCIDENT_SEVS = ['MINOR', 'MAJOR', 'CATASTROPHIC'] as const;
const accidentDmg = (kind: string, col = 'Percentage') =>
  ACCIDENT_SEVS.map((s) => xml('RandomEvent_Damages', `${accident(s)}&DamageType=${kind}`, col));
/**
 * THE ACCIDENT'S DRAWS: its `RandomEvent_Damages` rows in the install's order,
 * ONE draw each, a 100% row and a row with nothing to hit alike, each row's
 * draw its own chance — MEASURED (runs/c1d_draws.jsonl): MINOR 3, MAJOR 8,
 * CATASTROPHIC 9 draws with the Power Plant intact or pillaged; MINOR's 2nd
 * draw under 20 pillaged the Factory, MAJOR's 3rd under 50 the zone,
 * CATASTROPHIC's 4th under 80 the citizen. Each land unit struck by
 * UNIT_DAMAGE_LAND takes one more draw right after that row, its damage
 * `MinHP + rand(MaxHP - MinHP)` (`ACCIDENT_DMG_LO`, `ACCIDENT_DMG_HI`). The
 * rows the engine gives no effect (IMPROVEMENT_PILLAGED, BUILDING_DESTROYED,
 * UNIT_DAMAGE_NAVAL, CITY_GARRISON: no ring improvement, no building
 * destroyed, the plot is land and no city centre) still draw.
 */
const accidentRows = (sev: typeof ACCIDENT_SEVS[number], kinds: readonly string[]) =>
  srcConst(`disasters.accidentRows${sev}`, kinds, {
    derived: `the RANDOM_EVENT_NUCLEAR_ACCIDENT_${sev} rows of RandomEvent_Damages in XML order (Expansion2_RandomEvents.xml)`,
    inputs: kinds.map((k) => xml('RandomEvent_Damages', `${accident(sev)}&DamageType=${k}`, 'DamageType', { expect: k })),
  });
export const ACCIDENT_ROWS: readonly (readonly string[])[] = [
  accidentRows('MINOR', ['IMPROVEMENT_PILLAGED', 'BUILDING_PILLAGED', 'RADIATION_LEAKED']),
  accidentRows('MAJOR', ['UNIT_KILLED_CIVILIAN', 'IMPROVEMENT_PILLAGED', 'DISTRICT_PILLAGED', 'BUILDING_PILLAGED',
    'RADIATION_LEAKED', 'UNIT_DAMAGE_LAND', 'UNIT_DAMAGE_NAVAL', 'CITY_GARRISON']),
  accidentRows('CATASTROPHIC', ['IMPROVEMENT_PILLAGED', 'BUILDING_DESTROYED', 'DISTRICT_PILLAGED', 'POPULATION_LOSS',
    'RADIATION_LEAKED', 'UNIT_DAMAGE_LAND', 'UNIT_DAMAGE_NAVAL', 'CITY_GARRISON', 'UNIT_KILLED_CIVILIAN']),
];
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
/**
 * The accident's BUILDING_PILLAGED row: ONE building of the Industrial Zone,
 * the top of its chain still standing once the Power Plant has gone (the
 * Factory, never the Workshop: MINOR 4 of 35, MAJOR 13 of 13 zones the
 * district row left standing; runs/reactor_reactor_base_20260927T053410Z.jsonl,
 * runs/reactor_reactor_base_20260927T053613Z.jsonl,
 * runs/reactor_reactor_base_20260927T054059Z.jsonl). CATASTROPHIC carries no
 * such row; its DISTRICT_PILLAGED 100 takes the zone and every building in it.
 */
export const ACCIDENT_BLDG_P = srcConst('disasters.accidentBldgP', [0.2, 1, 0] as const, {
  derived: 'Percentage/100 of each accident row\'s BUILDING_PILLAGED row (CATASTROPHIC carries none), the '
    + 'chance one more Industrial Zone building is pillaged (measured 4/35, 13/13)',
  inputs: [
    ...accidentDmg('BUILDING_PILLAGED').slice(0, 2),
    xml('RandomEvent_Damages', `${accident('CATASTROPHIC')}&DamageType=BUILDING_PILLAGED`, 'Percentage', { absent: true }),
  ],
});
/**
 * The accident's UNIT rows, struck on the REACTOR'S PLOT alone (measured,
 * C-1-S1, runs/reactor_reactor_base_20260926T071934Z.jsonl: no unit at
 * distance 1-3 touched, the garrison untouched): UNIT_DAMAGE_LAND's share
 * and inclusive band, and UNIT_KILLED_CIVILIAN, by severity — MINOR carries
 * neither row. The plot is land, so the rows' UNIT_DAMAGE_NAVAL finds no
 * hull, and it is no city centre, so CITY_GARRISON finds none.
 */
export const ACCIDENT_LAND_P = srcConst('disasters.accidentLandP', [0, 0.5, 1] as const, {
  derived: 'Percentage/100 of each accident row\'s UNIT_DAMAGE_LAND row (MINOR carries none), the '
    + 'chance the land units on the reactor\'s plot are struck (measured 25/52, 47/50)',
  inputs: [
    xml('RandomEvent_Damages', `${accident('MINOR')}&DamageType=UNIT_DAMAGE_LAND`, 'Percentage', { absent: true }),
    ...accidentDmg('UNIT_DAMAGE_LAND').slice(1),
  ],
});
const accidentBand = (name: string, col: 'MinHP' | 'MaxHP', v: readonly number[]) => srcConst(`disasters.${name}`, v, {
  derived: `each accident row's UNIT_DAMAGE_LAND ${col}; the damage is MinHP + rand(MaxHP - MinHP), `
    + 'MaxHP exclusive (runs/c1d_draws.jsonl: 20 + GetRandNum(30), 6 of 6; a range of 31 misses 2); MINOR carries none and reads 0',
  inputs: [
    xml('RandomEvent_Damages', `${accident('MINOR')}&DamageType=UNIT_DAMAGE_LAND`, col, { absent: true }),
    ...accidentDmg('UNIT_DAMAGE_LAND', col).slice(1),
  ],
});
export const ACCIDENT_DMG_LO = accidentBand('accidentDmgLo', 'MinHP', [0, 20, 20]);
export const ACCIDENT_DMG_HI = accidentBand('accidentDmgHi', 'MaxHP', [0, 50, 50]);
export const ACCIDENT_CIV_KILL_P = srcConst('disasters.accidentCivKillP', [0, 0.5, 1] as const, {
  derived: 'Percentage/100 of each accident row\'s UNIT_KILLED_CIVILIAN row (MINOR carries none), the '
    + 'chance the civilians on the reactor\'s plot die (measured 22/50, 50/50)',
  inputs: [
    xml('RandomEvent_Damages', `${accident('MINOR')}&DamageType=UNIT_KILLED_CIVILIAN`, 'Percentage', { absent: true }),
    ...accidentDmg('UNIT_KILLED_CIVILIAN').slice(1),
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
