/**
 * THE AUTOPLAY DUMP, as `tools/civ6lab/h1/dump.py` writes it: one JSON line
 * per game turn, plus a catalog file (`<out>.cat.json`) naming every index the
 * lines use. Every field is the game's own reader's answer; a reader that
 * threw arrives as the string `err:<msg>`, which `num` turns into NaN so no
 * check reads it as a value.
 */

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
  errors: string[];
  /** the random events of the record's turn and the one before: [turn,
   *  RandomEvents index, current plot, start plot, fertility added, tiles
   *  damaged, population lost, units lost] */
  events?: Read<[number, number, Read<number>, Read<number>, Read<number>, Read<number>, Read<number>, Read<number>][]>;
  /** every great person recruited so far: [GreatPersonIndividuals index,
   *  claimant player, GreatPersonClasses index, era, turn granted] */
  greatPeople?: Read<[number, number, number, number, number][]>;
  /** the National Parks: [name, plot indices] */
  parks?: Read<[string, number[]][]>;
}

export interface Catalog {
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
}

/** The plot at game (x, y) of a record: rows are y, plots x. */
export function plotAt(rec: TurnRecord, index: number): PlotRow {
  const W = rec.head.W;
  return rec.map[Math.floor(index / W)][index % W];
}
