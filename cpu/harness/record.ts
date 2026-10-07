/**
 * THE AUTOPLAY DUMP, as `tools/civ6lab/h1/dump.py` writes it: one JSON line
 * per game turn, plus a catalog file (`<out>.cat.json`) naming every index the
 * lines use. Every field is the game's own reader's answer; a reader that
 * threw arrives as the string `err:<msg>`, which `num` turns into NaN so no
 * check reads it as a value.
 */
import { existsSync, readFileSync } from 'node:fs';

/** A value a Lua reader may have failed on. */
export type Read<T> = T | string;

export function num(v: Read<number> | null | undefined): number {
  return typeof v === 'number' ? v : NaN;
}

export function bool(v: Read<boolean> | null | undefined): boolean {
  return v === true;
}

/** One plot, in `h1_dump_ig.lua`'s order. */
export const P = {
  terrain: 0, feature: 1, resource: 2, resourceCount: 3, improvement: 4, improvementPillaged: 5,
  owner: 6, district: 7, wonder: 8, wonderComplete: 9, route: 10, riverBits: 11, cliffBits: 12,
  freshWater: 13, appeal: 14, workers: 15, yields: 16, isLake: 17, routePillaged: 18,
  /** the owning city's id, -1 unowned */
  ownerCity: 19,
  /** the coastal lowland band (a `coastalLowlands` index, -1 none), flooded
   *  and submerged — absent from records the dumper wrote before it read them */
  lowland: 20, flooded: 21, submerged: 22,
} as const;

export type PlotRow = (number | string | number[])[];

export interface DumpPlayer {
  id: number;
  major: Read<boolean>;
  /** is it this player's turn in the record */
  turnActive?: Read<boolean>;
  minor: Read<boolean>;
  barb: Read<boolean>;
  free: Read<boolean>;
  human: Read<boolean>;
  civ: Read<string>;
  leader: Read<string>;
  gold: Read<number>;
  goldYield: Read<number>;
  maintTotal: Read<number>;
  maintBuildings: Read<number>;
  maintDistricts: Read<number>;
  maintUnits: Read<number>;
  faith: Read<number>;
  faithYield: Read<number>;
  pantheon: Read<number>;
  religionCreated: Read<number>;
  holyCity?: Read<{ id: number; player: number }>;
  /** The moments of the record's turn and the one before: [id, MomentType,
   *  era score, turn]. Absent from records the dumper wrote before it read them. */
  moments?: Read<[number, string, number, number][]>;
  scienceYield: Read<number>;
  researching: Read<number>;
  researchProgress?: Read<number>;
  researchCost?: Read<number>;
  cultureYield: Read<number>;
  civic: Read<number>;
  civicProgress?: Read<number>;
  civicCost?: Read<number>;
  government: Read<number>;
  inAnarchy?: Read<boolean>;
  anarchyEnd?: Read<number>;
  techs: string;
  techBoosts: string;
  civics: string;
  civicBoosts: string;
  era: Read<number>;
  eraScore: Read<number>;
  darkThreshold: Read<number>;
  goldenThreshold: Read<number>;
  darkAge: Read<boolean>;
  goldenAge: Read<boolean>;
  heroic: Read<boolean>;
  favor: Read<number>;
  /** the Diplomatic Favor a turn the game reports (`GetFavorPerTurn`) */
  favorPerTurn?: Read<number>;
  tourism: Read<number>;
  tokens: Read<number>;
  suzerain: Read<number>;
  policies: Read<number>[];
  wars: number[];
  met: number[];
  envoysReceived: [number, number][];
  gpp: Read<number>[];
  /** [resource, amount held, amount exported] per luxury held or exported */
  luxuries?: [number, number, number][];
  /** [type, assigned city owner, assigned city id, established, turns to
   *  establish, neutralized turns, promotion indices] per appointed governor */
  governors?: [number, number, number, Read<boolean>, Read<number>, Read<number>, number[]][];
  /** [player, alliance type, alliance level] per alliance this player holds */
  allies?: [number, Read<number>, Read<number>][];
  /** the players this one has declared friendship with */
  friends?: number[];
  /** the dedications (CommemorationTypes indices) held for the current era */
  commemorations?: Read<number[]>;
}

export interface DumpReligionInCity {
  Religion: number;
  Followers: number;
  Pressure: number;
}

export interface DumpCity {
  owner: number;
  id: number;
  name: string;
  x: number;
  y: number;
  pop: number;
  capital: Read<boolean>;
  originalOwner: Read<number>;
  occupied: Read<boolean>;
  yields: Read<number>[];
  food: Read<number>;
  foodSurplus: Read<number>;
  growthThreshold: Read<number>;
  turnsToGrow: Read<number>;
  housing: Read<number>;
  housingParts: Read<number>[];
  housingGrowthMod: Read<number>;
  happinessGrowthMod: Read<number>;
  overallGrowthMod: Read<number>;
  amenities: Read<number>;
  amenitiesNeeded: Read<number>;
  happiness: Read<number>;
  amenityParts: Read<number>[];
  culture: Read<number>;
  cultureYield: Read<number>;
  /** the city's tourism a turn (`GetTourism`) */
  tourism?: Read<number>;
  nextPlot: Read<number>;
  nextPlotCost: Read<number>;
  turnsToExpand: Read<number>;
  loyalty: Read<number>;
  maxLoyalty: Read<number>;
  loyaltyPerTurn: Read<number>;
  loyaltyLevel: Read<number>;
  /** the game's per-turn loyalty terms, one `{ source: amount }` per row */
  loyaltyBreakdown?: Read<Record<string, number>[]>;
  majorityReligion: Read<number>;
  religions: Read<DumpReligionInCity[]>;
  /** what the city presses on each city in range a turn (`GetPressureFromCity`) */
  pressureOut?: Read<number>;
  governor: Read<number>;
  /** [type, count] gold/faith price rows: [kind "B"|"U"|"D", index, cost, gold, faith] */
  buy: [string, number, Read<number>, Read<number>, Read<number>][];
  plotBuy: [number, number][];
  /** the trade routes leaving the city, the game's route tables raw */
  routes?: Read<Record<string, unknown>[]>;
  /** [buildingIndex, pillaged 0/1] */
  buildings: [number, number][];
  /** [type, x, y, complete, pillaged, defense, garrisonDamage, garrisonMax, outerDamage, outerMax] */
  districts: Read<number | boolean>[][];
  worked: number[];
  /** [building, slot, great work index, GreatWorks row] per filled slot */
  greatWorks?: [number, number, number, Read<number>][];
  plots: number[];
  /** the build queue in order, each entry as `BuildQueue:GetAt` returns it */
  queue: Read<DumpQueueEntry>[];
  /** the production each queue entry has banked, parallel to `queue` */
  queueProgress?: Read<number>[];
  /** the city's production a turn */
  productionYield?: Read<number>;
}

/** One build-queue entry: the row index of what it builds (one of the four
 *  type keys) and, for a district or wonder, its plot. */
export interface DumpQueueEntry {
  BuildingType?: number;
  UnitType?: number;
  DistrictType?: number;
  ProjectType?: number;
  MilitaryFormationType?: number;
  Location?: { x: number; y: number };
  Directive?: number;
}

/** One World Congress resolution in the record's table: `Type` the
 *  ResolutionType's hash, `ChosenLabel` "A" for the first outcome, and
 *  `ChosenThing` the target's localisation key. */
export interface DumpResolution {
  Type: number;
  ChosenLabel?: string;
  ChosenThing?: string;
  TargetType?: string;
}

export interface DumpUnit {
  owner: number;
  id: number;
  type: number;
  x: number;
  y: number;
  damage: Read<number>;
  moves: Read<number>;
  maxMoves: Read<number>;
  xp: Read<number>;
  level: Read<number>;
  formation: Read<number>;
  buildCharges: Read<number>;
  spreadCharges: Read<number>;
  religion: Read<number>;
  embarked: Read<boolean>;
  /** the turns of fortification the unit holds (0..FORTIFY_TURN_MAX) */
  fortify?: Read<number>;
  /** the UnitPromotions indices the unit holds */
  promotions?: number[];
}

export interface DumpReligion {
  Religion: number;
  Founder: number;
  Beliefs: number[];
}

export interface TurnRecord {
  turn: number;
  seed: Read<number>;
  moved: boolean;
  head: { W: number; H: number; wrapX: Read<boolean>; localPlayer: Read<number> };
  map: PlotRow[][];
  players: DumpPlayer[];
  religions: Read<DumpReligion[]> | null;
  /** the World Congress resolutions table, raw (a numbered entry per
   *  resolution of the session in view, and its `Stage`) */
  congress?: unknown;
  cities: DumpCity[];
  units: DumpUnit[];
  /** the volcano vector's named entries in its order, [plot, NamedVolcanoes
   *  index], and the vector's size (MapFeatureManager.GetNamedVolcanoes) —
   *  absent from records the dumper wrote before it read them */
  volcanoes?: { list: Read<[number, number][]>; total: Read<number> };
  /** per major player id its revealed plots, a hex string of plot bits,
   *  four plots a digit, plot 4k the digit's lowest bit — absent from
   *  records the dumper wrote before it read them */
  revealed?: Record<string, Read<string>>;
  errors: string[];
  /** the random events of the record's turn and the one before: [turn,
   *  RandomEvents index, current plot, start plot, fertility added, tiles
   *  damaged, population lost, units lost, river id, volcano id, natural-wonder
   *  volcano id, start turn, end turn, direction] */
  events?: Read<[number, number, Read<number>, Read<number>, Read<number>, Read<number>, Read<number>, Read<number>, ...Read<number>[]][]>;
  /** every great person recruited so far: [GreatPersonIndividuals index,
   *  claimant player, GreatPersonClasses index, era, turn granted] */
  greatPeople?: Read<[number, number, number, number, number][]>;
  /** the National Parks: [name, plot indices] */
  parks?: Read<[string, number[]][]>;
  /** whose turn start the record holds (`tools/civ6lab/h1/h1_starts.lua`),
   *  by game player: [the last turn its PlayerTurnStarted fired, the last
   *  turn its PlayerTurnStartComplete fired], read before the dump. Absent
   *  from records the dumper wrote before it armed the witness. */
  starts?: Record<string, [number, number]>;
  /** a turn start that ran while the dump read */
  startsMoved?: boolean;
  /** each player's state at its start of turn (`pre`, as PlayerTurnStarted
   *  fired: what the start banks from) and as it completed (`post`), for
   *  the record's turn and the one before */
  witness?: StartWitness[];
}

/** One player's state at a point of its start of turn (`TurnRecord.witness`). */
export interface StartWitness {
  turn: number;
  player: number;
  point: 'pre' | 'post';
  /** the generator's state (`Game.GetRandomSeed()`) at that point; absent from
   *  records the dumper wrote before it read it */
  seed?: Read<number>;
  gold: Read<number>;
  faith: Read<number>;
  researching: Read<number>;
  researchProgress: Read<number>;
  civic: Read<number>;
  civicProgress: Read<number>;
  eraScore: Read<number>;
  cities: {
    id: Read<number>; pop: Read<number>; food: Read<number>; foodSurplus: Read<number>;
    growthThreshold: Read<number>; culture: Read<number>; cultureYield: Read<number>;
    nextPlot: Read<number>; plots: Read<number>; loyalty: Read<number>; loyaltyPerTurn: Read<number>;
    production: Read<number>; productionProgress: Read<number>; yields: Read<number[]>;
    worked: Read<number[]>; religions: unknown;
  }[];
}

export interface Catalog {
  /** the game's map orders (`<stem>.orders.json`, `tools/civ6lab/h1/
   *  map_orders.py`): the river vector, each river's plot list, and the
   *  volcano vector's plots; absent when the dump has no such file */
  orders?: MapOrders;
  terrains: string[];
  features: string[];
  resources: string[];
  improvements: string[];
  districts: string[];
  buildings: string[];
  units: string[];
  techs: string[];
  civics: string[];
  policies: string[];
  governments: string[];
  beliefs: string[];
  religions: string[];
  routes: string[];
  projects: string[];
  eras: string[];
  governors: string[];
  promotions: string[];
  buildingReplaces: [string, string][];
  districtReplaces: [string, string][];
  unitReplaces: [string, string][];
  leaderInherits: [string, string][];
  wonders: string[];
  /** per GreatWorks row: [GreatWorkType, GreatWorkObjectType,
   *  GreatPersonIndividualType, EraType], "" for an empty column */
  greatWorks?: [string, string, string, string][];
  unitPromotions?: string[];
  commemorations?: string[];
  alliances?: string[];
  greatPeople?: string[];
  greatPersonClasses?: string[];
  randomEvents?: string[];
  coastalLowlands?: string[];
  /** per plot its Plot:GetContinentType(), -1 none — absent from catalogs
   *  the dumper wrote before it read them */
  continents?: number[];
}

/** The game's river and volcano vectors in their own orders (`GameMap.rivers`,
 *  `GameMap.volcanoes`): the map script's river IDs and volcano placements. */
export interface MapOrders {
  /** "game" (the dump read the game's river vector) or "map script" (the
   *  map generator run on the game's map seed) */
  source: string;
  rivers: number[][];
  volcanoes: number[];
  /** per plot its continent (the catalog's where the dump read them, else
   *  the map script's StampContinents); absent where neither is known */
  continents?: number[];
}

/** A dump's catalog (`<stem>.cat.json`) with the map orders beside it
 *  (`<stem>.orders.json`) when the dump has them. */
export function loadCatalog(dumpPath: string): Catalog {
  const catPath = dumpPath.replace(/\.jsonl$/, '.cat.json');
  if (!existsSync(catPath)) throw new Error(`no catalog beside the dump: ${catPath}`);
  const cat = JSON.parse(readFileSync(catPath, 'utf8')) as Catalog;
  const ordersPath = dumpPath.replace(/\.jsonl$/, '.orders.json');
  if (existsSync(ordersPath)) {
    const o = JSON.parse(readFileSync(ordersPath, 'utf8')) as MapOrders;
    cat.orders = { source: o.source, rivers: o.rivers, volcanoes: o.volcanoes, continents: o.continents };
  }
  return cat;
}

/** A major's revealed plots in the record (`TurnRecord.revealed`), one 0/1
 *  per plot: four plots a hex digit, plot 4k the digit's lowest bit; null
 *  where the record does not carry them. */
export function revealedPlots(rec: TurnRecord, player: number, n: number): number[] | null {
  const hex = rec.revealed?.[String(player)];
  if (typeof hex !== 'string') return null;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) out[i] = (parseInt(hex[i >> 2] ?? '0', 16) >> (i & 3)) & 1;
  return out;
}

/** The plot at game (x, y) of a record: rows are y, plots x. */
export function plotAt(rec: TurnRecord, index: number): PlotRow {
  const W = rec.head.W;
  return rec.map[Math.floor(index / W)][index % W];
}
