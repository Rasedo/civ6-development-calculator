/**
 * THE ENGINE AS THE AI READS IT: a read-only view of one game state, in the
 * game's own type names (CIVIC_*, GOVERNMENT_*, UNIT_*), which the
 * city-states', the Free Cities' and the barbarians' AI read. The engine
 * implements it (cpu/core/aiView.ts). What the value layer reads (the
 * cities, their yields, the government, the yield weights) is the shared
 * `AiValueView`.
 */
import type { AiValueView } from './aiValue';

/** a map plot as the AI reads it (Plot), in the game's type names */
export interface AiMapPlotView {
  index: number;
  x: number;
  y: number;
  water: boolean;
  /** the seat whose territory holds it, -1 for none */
  owner: number;
  /** a district stands on it, a city centre included */
  district: boolean;
  /** a city centre stands on it, any seat's */
  city: boolean;
  /** the plot's area (AreaBuilder) and region (Map_Region, -1 off passable
   *  land) */
  area: number;
  region: number;
  coastal: boolean;
  /** a Lake plot */
  lake: boolean;
}

/** one plot of a unit's planning reach (UnitPlanning): the turn it is
 *  reached in, 1 for this turn, and the Movement left there */
export interface AiReachView {
  plot: number;
  turns: number;
  moves: number;
}

export interface AiUnitView {
  /** the engine's unit id */
  id: number;
  /** UnitType */
  type: string;
  plot: number;
  /** Units.FoundCity */
  founder: boolean;
  /** the unit's combat strength as the AI reads it (0x56dc90 with 0: an
   *  embarked land combat unit its owner's era's embarked strength), its
   *  ranged strength (the install's), its damage (0 to 100) and its Movement
   *  left (24.8 fixed point, as the reach's) */
  combat: number;
  ranged: number;
  /** the ranged attack's Range, 0 for none */
  range: number;
  damage: number;
  movesLeft: number;
  /** its base Movement (0x56d9f0 with -1: Units.BaseMoves, embarked the
   *  embarked pool), whole */
  baseMoves: number;
  /** its bombard strength, 0 for none */
  bombard: number;
  /** its domain (Units +0x650): land, sea or air */
  domain: 'land' | 'sea' | 'air';
}

/** a unit of a player at war with the seat that the seat sees now */
export interface AiHostileUnitView {
  plot: number;
}

/** a city of a player at war with the seat whose centre it sees now */
export interface AiCityDefenceView {
  plot: number;
}

/** an entry of the seat's tactical target list (the knowledge base's +0x368
 *  list, 0x783980), in the list's order: its TargetType (cpu/core/tactical's
 *  names), plot, player (-1 for none), its unit's UnitType (null for a target
 *  that is no unit) and the reach its blows have (+0x18: a unit's attack
 *  Range, a district's strike range) */
export interface AiAttackTargetView {
  type: string;
  plot: number;
  owner: number;
  unitType: string | null;
  range: number;
}

/** one unit's part in an attack assignment (0x776140), in the order the
 *  assignment runs: the plot it stands on, the plot it moves to and the plot
 *  it strikes this turn (-1 none) */
export interface AiAttackView {
  unit: number;
  move: number;
  attack: number;
}

/** a defensible district of a known city as the knowledge base records it
 *  (the 0x20-byte entries at +0x48, 0x5efaf0: a district with a garrison
 *  pool): its defense strength (+0x14), that strength again where its walls
 *  stand (+0x18, 0 without walls) and its strike strength (+0x1c), whole */
export interface AiKnownDistrictView {
  plot: number;
  defense: number;
  walls: number;
  strike: number;
}

/** a city the seat's knowledge base holds (the 0xe0-byte entries of
 *  m_knownCities, 0x5ef9a0 / 0x5efaf0) */
export interface AiKnownCityView {
  plot: number;
  owner: number;
  /** the engine's city id (a city-state's one city -1) */
  id: number;
  /** its citizens (+0x1c) */
  population: number;
  /** its owner's original capital (+0x14), its owner's capital (+0x15) */
  originalCapital: boolean;
  capital: boolean;
  /** its yields in YieldTypes order, whole (+0x30) */
  yields: readonly number[];
  /** the world wonders it holds (0x5eb680) */
  wonders: number;
  districts: readonly AiKnownDistrictView[];
}

export interface AiView extends AiValueView {
  /** the map's plots by index */
  plots(): readonly AiMapPlotView[];
  /** the same plots in the game's ring walk order (0x69010): the plot, then
   *  each ring from its six corners, each corner walked along its side */
  plotsRing(plot: number, radius: number): readonly number[];
  plotDistance(a: number, b: number): number;
  /** the plots of the seat's city centres */
  cityPlots(seat: number): readonly number[];
  leaderType(seat: number): string | null;
  units(seat: number): readonly AiUnitView[];
  /** a unit's planning reach within `turns` on the Movement it has left, in
   *  the pathfinder's order */
  unitReach(unitId: number, turns: number): readonly AiReachView[];
  /** the action record's unit column of a verb (MOVE_0..5, FOUND_CITY), -1
   *  for one the engine does not carry */
  unitActionColumn(name: string): number;
  /** the units of the players at war with the seat (the barbarians always)
   *  that the seat sees now and that carry a combat strength */
  hostileUnits(seat: number): readonly AiHostileUnitView[];
  /** the cities of the players at war with the seat whose centres it sees now */
  hostileCities(seat: number): readonly AiCityDefenceView[];
  /** the game era, an index into AI_ERAS */
  readonly gameEra: number;
  /** the CivicTypes the seat holds */
  civicsHeld(seat: number): ReadonlySet<string>;
  /** the CivicTypes the seat's civic AI lists with a score above 0 (its
   *  research list); a policy of such a civic is scored before its civic is
   *  held */
  civicList(seat: number): ReadonlySet<string>;
  /** every government the seat has been in */
  governmentsHeld(seat: number): ReadonlySet<string>;
  darkAge(seat: number): boolean;
  goldenAge(seat: number): boolean;
  /** a great person of the class is still to be earned in the game */
  greatPersonClassAvailable(cls: string): boolean;
  // THE PLAYERS. Seats are the engine's: a major's seat, a city-state's
  // seat, the Free Cities' and the barbarians'.
  /** every player in the game in seat order: the majors, the city-states,
   *  the Free Cities (where the game holds them) and the barbarians */
  players(): readonly number[];
  /** the city-states' seats */
  cityStateSeats(): readonly number[];
  /** the seat's military units of a DomainType */
  militaryUnits(seat: number, domain: string): number;
  /** the seat's handicap, a Difficulties index */
  handicap(seat: number): number;
  /** the technologies the seat holds, install types */
  techsHeld(seat: number): ReadonlySet<string>;
  /** PlayerStats' m_iMilitaryStrength (0x4bb1e0) */
  militaryStrength(seat: number): number;
  /** the pair's standing declared friendship (the alliance: `allied`) */
  declaredFriends(a: number, b: number): boolean;
  // THE OPERATIONS' VIEW (cpu/core/operations/)
  /** the barbarians' seat */
  barbarianSeat(): number;
  /** the citizens of the city whose centre is the plot, 0 for none */
  cityPopulation(plot: number): number;
  // THE WAR OPERATIONS' VIEW
  /** the cities the seat's knowledge base holds: every city whose centre the
   *  seat has revealed, its own included */
  knownCities(seat: number): readonly AiKnownCityView[];
  /** the seat's own citizens' Loyalty pressure on a plot less every other
   *  player's (0x19d470 with its byte set: 0x1a1ae0's raw own - foreign),
   *  in pressure units */
  pressureLead(seat: number, plot: number): number;
  /** the plot's owner keeps the seat's units out (its borders enforced, no
   *  open borders, no alliance, no war between them) */
  borderClosed(seat: number, plot: number): boolean;
  /** the seat has denounced the player (Player_Diplomacy 0x3da8e0) */
  denounced(seat: number, player: number): boolean;
  /** the city centre's hit points on the plot: its most and its damage,
   *  null where no city stands there */
  cityHitPoints(plot: number): { max: number; damage: number } | null;
  /** the hit points a unit's blow would take from the city on the plot as
   *  its planning predicts it (0x791470's district branch), 0 where its
   *  planning holds no plot to strike the city from within two turns */
  cityBlow(unitId: number, plot: number): number;
  /** the hit points a unit's blow from where it stands would take from the
   *  city on the plot (the combat simulation 0x213e00 / 0x205720) */
  cityBlowFrom(unitId: number, plot: number): number;
  /** the city centre on the plot as its threat reads it: its defense
   *  strength without its garrison (GetDefenseStrength 0x24ae80 with its
   *  flag set, which skips 0x24a180's garrison), its garrison term
   *  (0x24a180), its damage above 0; its districts the centre included
   *  (+0x1a60), its capital flag (+0x5e8, a city-state's one city holding
   *  the Palace), a wonder built (0x18e930), its citizens (+0x588); null
   *  where no city stands there */
  cityDefense(plot: number): { defense: number; garrison: number; damaged: boolean; districts: number; capital: boolean;
    wonder: boolean; population: number } | null;
  /** the city's walls do not hold the unit back (a siege assist on it: unit
   *  +0x18b8 / +0x18b9 / +0xb94 / +0xc14) */
  wallsBypassed(unitId: number, plot: number): boolean;
  /** the seat's tactical target list */
  attackTargets(seat: number): readonly AiAttackTargetView[];
  // THE ASSAULT EXECUTIONS' VIEW
  /** the unit planning's spot for a plot (0x791300 -> 0x78fa10): the first
   *  plot of its reach (in the planning's order) exactly `range` from the
   *  plot, within `turns`, with Movement left there where `needMoves` asks,
   *  that no other unit of its kind holds (its own plot aside); -1 none */
  planSpot(unitId: number, plot: number, turns: number, needMoves: boolean, range: number): number;
  /** the unit planning's spots against the target on the plot (its entry,
   *  +0x48): each spot and its turns, in the planning's order */
  attackSpots(unitId: number, plot: number): readonly { plot: number; turns: number }[];
  /** the units on the plot (Plot +0x4c) */
  plotUnitCount(plot: number): number;
  /** the plot beside one in the game's direction (0 NORTHEAST .. 5
   *  NORTHWEST), -1 off the map */
  adjacentPlot(plot: number, dir: number): number;
  /** a river runs on the plot's edge in the game's direction */
  riverEdge(plot: number, dir: number): boolean;
  /** the city centre on the plot is encircled (its heal stopped) */
  encircled(plot: number): boolean;
  /** the unit planning's reach of a plot (0x793300): its turns and its
   *  Movement left there; null out of reach */
  reachOf(unitId: number, plot: number): { turns: number; moves: number } | null;
  /** the unit exerts a zone of control (0x56d6c0: not embarked, +0x1410) */
  exertsZoc(unitId: number): boolean;
  /** the improvements Improvements marks CanBuildOutsideTerritory with a
   *  DefenseModifier (+0x108 bit 0x40, +0x34 above 0), install types */
  defensiveImprovements(): readonly string[];
  /** the air unit's strike on the plot (AIR_STRIKE_k, or AIR_PILLAGE_k on
   *  an improvement) as its action column, -1 out of its reach */
  airStrikeColumn(unitId: number, plot: number, improvement: boolean): number;
  /** the plots the air unit may rebase to, each with its action column */
  rebaseOptions(unitId: number): readonly { plot: number; column: number }[];
  /** the unit's build charges left (+0xed0) */
  buildCharges(unitId: number): number;
  /** the unit is of the improvement's ValidBuildUnits and the seat may build
   *  it (0x35ede0: its unlock) */
  unitBuildsImprovement(seat: number, unitId: number, improvement: string): boolean;
}
