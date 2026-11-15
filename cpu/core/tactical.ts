/**
 * THE GAME'S UNIT AI: the unit pathfinder's reach and path, and the tactical
 * pass a player's units take (GameCore_XP2 TacticalAI;
 * tools/civ6lab/dll_readings.md "C-95: the unit pathfinder and the
 * planning's reach", "C-95: the tactical pass", "C-96: the city-states'
 * tactical pass"). The barbarians' turn runs it for their units
 * (`barbarianPhase`), a city-state's turn for its own (`cityStateTactics`),
 * the Free Cities' turn for theirs (`freeCityTactics`).
 */
import type { ArmyRecord, City, CityState, GameState, Seat, Tile, Unit, UnitPool } from './types';
import { DIRECTION_TYPES, RING_DIRS, axialToOffset, hexDistance, neighborTile, neighbors, offsetToAxial, tileAt, tilesWithin } from '../../world/hex';
import { hullPassage, isCoastalLand, isImpassable, isWater } from '../../world/query';
import { COMBAT_BOMBARD_VS_UNIT, EMBARK_MOVES, MP_SCALE } from '../data/constants';
import { CITY_MAX_HP, FORMATION_MAX, UNITS, UNIT_HP } from '../data/units';
import { DISTRICTS } from '../data/districts';
import { condemnHeretic, formationCivicIn, mergeFormation } from './game';
import { plunderTrader, traderImmune } from './trade';
import { IMPROVEMENTS } from '../data/improvements';
import { AI_FEATURES, AI_UNITS } from '../data/aiBuildTables';
import { AI_UNIT_AI } from '../data/aiOperations';
import { engineId, gameTypeOf, installFeature } from '../data/aliases';
import {
  arrive, canEmbark, cityAtIndex, crossesRiver, embarkTechMoves, escortUnit, inEscort, cliffBlocksStep, shoreCrossing, districtZones, encampmentBlocks, inEnemyZoc, rosterEmbarkMoves, stepCost, stepUnit, terrainMp, unitDomain, unitExertsZoc, unitFullMoves, mapLayer, unitReligious,
  setBarbStepLook, unitsHostile, unitVisibleTo, fortifyOrder, operationStart, skipTurn,
  waterEnterable, waterWalks, borderClosedTo, formationBanned, formationCS, setRecordFormation, formationMates, dropLoneRiders, escortOf, escortRiders, disbandUnit,
} from './units';
import { BARB_SEAT, FREE_SEAT, NO_SEAT, campTiles, cityHolders, civsAtWar, isBarbSeat, isCityStateSeat, isCiv, isTerritorial, seatOf, tileCity, tileSeat } from './seats';
import { OPEN_BORDERS_CIVIC } from '../data/seats';
import { randRange } from './rand';
import { cityDefenseStrength, districtGarrisonedStrength, embarkedDefenseCS, cityStrikeBase, coastalRaid, damageExpected, hostilePillage, hostileRangedStrike, meleeAttack, meleeUnitStrengths, movesAndShoots, predictCityBlow, predictCityExchange, predictCityShot, rangedUnitStrengths, stackDefender, unitAttackRange } from './combat';
import { CITY_STRIKE_RANGE } from './phase';
import { encampOuterPool, outerPool, wallsMax } from './rules';
import { cityStateAt, minorCity, suzerainOf } from './cityStates';
import { irradiated } from './nuclear';
import { canSee, losDisk, unitSight } from './fog';
import { barbScoutLook, barbarianRules, barbSlots, barbSlotsDying, plotsSeenNow, poolDying, poolSlots, ringPlots, tribeOf } from './barbarians';
import { barbarianCaptures, barbarianOpsEvaluate, barbarianOpsTurn, barbarianTrees } from './barbarianOps';
import { opsOf } from './operations/manager';
import { lookCamps } from './operations/knowledge';
import { opJobUnits } from './operations/operation';
import { BT_RUNNING, BT_SUCCESS } from './behaviorTree';
import { generalAuraMP } from './aura';
import { aiPromotionPick, attacksLeftOf, attacksPerTurn, takePromotion } from './promotions';
import type { BarbTribe, ImprovementId } from './types';

/** the pathfinder's fixed point: one Movement is 256 */
const FIX = 256;

/** One plot the pathfinder closed: its plot, the turn it is reached on (1 =
 *  this turn) and the Movement left there, in 1/256. */
export interface Reach {
  tile: number;
  turns: number;
  moves: number;
  /** a plot it would attack into */
  attack: boolean;
}

interface PNode {
  tile: number;
  g: number;
  /** the order among equal costs: below 0 put before its equals, above 0
   *  after them, 0 alone */
  tie: number;
  moves: number;
  turns: number;
  /** the Movement a shore crossing onto this plot carried past the new
   *  domain's full Movement (the node's +0x20, the embark and disembark rules
   *  0x530420 / 0x530240): the next step from it pays it on top */
  carry?: number;
  closed: boolean;
  /** a plot the unit attacks into: the path ends there */
  attack?: boolean;
  /** the node's water as the search takes it (+0x50 bit 0x20, 0x271be0): a
   *  plot the player revealed, or one stepped onto from a revealed plot, its
   *  own; one stepped onto from an unrevealed plot its parent's */
  wet: boolean;
  parent: PNode | null;
  /** the nodes it linked (the node's children, CvAStar +0x38), each with
   *  its step's DirectionTypes index */
  kids?: { node: PNode; di: number }[];
  /** the open list's key (+0x18) where it is not the cost: a turn-end
   *  node's, its plot's node's cost (`search`) */
  f?: number;
}

/** may the unit enter this plot at all (Pathfinder valid 0x2720a0, the
 *  engine's ground): no mountain or impassable plot; its domain's ground —
 *  a land unit's water too where its player may embark it (`canEmbark`); no
 *  unit of a player at war with it (an aircraft or a spy holds no plot) —
 *  another player's unit it passes, never ending there (`groundOf`'s
 *  `stand`); no city centre but its own, no live enemy Encampment (with no
 *  `forts`, neither test); its own units it walks through */
function enterable(state: GameState, unit: Unit, t: Tile, foes: ReadonlySet<number>,
  embarks: boolean, forts = true): boolean {
  if (isImpassable(t)) return false;
  const naval = !!UNITS[unit.type]?.naval;
  // a hull on water or in a passage (`hullPassage`: its own centre, below)
  if (naval ? !isWater(t) && !hullPassage(t) : isWater(t) && !embarks) return false;
  if (isWater(t) && !waterEnterable(state, t, unit)) return false;
  if (foes.has(t.index)) return false;
  if (!forts) return true;
  if (t.district === 'CITY_CENTER' && tileSeat(t) !== unit.seat) return false;
  return !encampmentBlocks(state, t, unit);
}

/** another player's territory closed to a city-state's unit: a major's or
 *  another city-state's whose owner holds the open-borders civic (Early
 *  Empire) and is not at war with it — the planning of a city-state's units
 *  leaves such plots out (runs/h1_duelw1117 t32-37: city-state 4's Warriors'
 *  AI_Planning.csv rows never take China's (32,11) and (33,10) beside its own
 *  plots; runs/h1_duely1128: Bologna's Warriors plan onto Hong Kong's 9:6 and
 *  8:7 to t39, none from t41, Early Empire Hong Kong's in record 41) */
function closedToMinor(state: GameState, seat: number, t: Tile): boolean {
  const owner = tileSeat(t);
  if (owner === seat || !(isCiv(owner) || isCityStateSeat(owner))) return false;
  return !!seatOf(state, owner)?.research.civics.includes(OPEN_BORDERS_CIVIC) && !civsAtWar(state, seat, owner);
}

/** the steps' costs a tactical pass holds while it runs, per chassis and
 *  promotions, Alpine Training and the embarking, by plot and DirectionTypes link: the ground holds still but
 *  for a pillage, which drops them (`dropHeldCosts`) */
let costsHeld: Map<string, Int32Array> | null = null;

function heldCostsOf(state: GameState, unit: Unit, mayEmbark: boolean): Int32Array | null {
  if (!costsHeld) return null;
  const k = `${unit.type}:${unit.promos ?? 0}:${unit.alpine ? 1 : 0}:${mayEmbark ? 1 : 0}`;
  let a = costsHeld.get(k);
  if (!a) costsHeld.set(k, (a = new Int32Array(state.map.tiles.length * 6).fill(-1)));
  return a;
}

function stepCostHeld(state: GameState, unit: Unit, from: Tile, to: Tile, di: number, held: Int32Array | null, mayEmbark: boolean): number {
  if (!held) return stepCost(state, unit, from, to, mayEmbark);
  const at = from.index * 6 + di;
  if (held[at] < 0) held[at] = stepCost(state, unit, from, to, mayEmbark);
  return held[at];
}

/** a formation's flag of its embark and disembark cost rules (+0x338, the
 *  tracked bool refreshed by 0x267650 at 0x2677e0..0x2677f7): the OR of its
 *  members' `canEmbark`, the unit's own where it moves alone */
const formationEmbarks = (state: GameState, unit: Unit, mates: readonly Unit[]): boolean =>
  [unit, ...mates].some((m) => canEmbark(state, m));

function dropHeldCosts(): void {
  if (costsHeld) costsHeld = new Map();
}

/** `enterable` and `inEnemyZoc` for one search, each plot asked once: the
 *  ground holds still while the pathfinder runs; `stand`, may the unit end
 *  its move there — a path's: no other player's unit on it; the planning's
 *  list's (0x26d890): none of another player not at war with it, a Trader
 *  none, on a plot the player sees now */
interface Ground {
  enter: (t: Tile) => boolean;
  /** `enter` for a move order's path: the step's location test (0x271be0 -> 0x586900 under flag
   *  1 -> 0x586360 at 0x586542..0x5865a1) refuses no plot for another
   *  player's unit but an embarked pair (`boarded`), and a hostile unit of
   *  the mover's map layer makes
   *  the plot an attack only where the player sees it now (+0x51 bits 5 / 6,
   *  0x5861f0 under +0x50 & 2): one it does not see now is passed as empty
   *  ground, a district of hit points at war it does not see now as a plain
   *  plot but the path's destination
   *  (runs/h1_duely1121 t58-77: the barbarian Scout 131073's
   *  "tertiary regions" 10:9 past China's units out of its sight). A
   *  destination holding another player's unit it does not see now has no
   *  path, the order's attack flag dropped at its request (`pathTo`, 0x962310;
   *  `turnsToPlot` ends on no unit's plot but an attack's)
   *  (runs/h1_duely1117 t80 / t85 / t88 / t97 / t100 / t103: the
   *  Attack Civilian movers hold for a civilian out of their sight, t31-t36
   *  / t68 go for one in it) */
  pass: (t: Tile) => boolean;
  /** a closed plot the reach lists may hold: a revealed one (the search
   *  entered it by `enter`), else one passing the location test alone (the
   *  list's 0x586900 -> 0x586360: `enterable` with no unit counted), since
   *  the search enters a plot the player never revealed whatever it is */
  fits: (i: number) => boolean;
  /** `inEnemyZoc` on the search's destination, the plot entered's
   *  `crowded` its stacking limit */
  zoc: (t: Tile) => boolean;
  attack: (t: Tile) => boolean;
  /** a unit at war that fights stands on the plot, on a plot the player
   *  sees now (the node's +0x51 bit 0x40, 0x5861f0 -> 0x523520) */
  foughtOn: (i: number) => boolean;
  known: (i: number) => boolean;
  /** the player revealed the plot (node +0x51 bit 0), whatever the search */
  revealed: (i: number) => boolean;
  stand: (i: number) => boolean;
  /** on a plot the player sees now a city of a player at war with it or a
   *  unit at war that fights (the node's +0x51 bit 4, or bits 0x20 and 0x40
   *  both: 0x271be0 at 0x271e69 / 0x271f2e, 0x5861f0): an attack whose
   *  parent the path validity tests as a turn's end */
  strikeSite: (i: number) => boolean;
  /** on a plot the player sees now a unit at war that fights (the node's
   *  +0x51 bits 0x20 and 0x40 both), whatever the search */
  fighterSeen: (i: number) => boolean;
  /** the path node's count +0x54 reaches the stacking limit (0x585eb0 ->
   *  0x585d90, the units of the mover's map layer not at war with it): one
   *  of its own that stacks with it, or on a plot the player sees now
   *  another player's unit but a Trader or a Spy */
  crowded: (i: number) => boolean;
  /** 0x585eb0's count on the plot at the stacking limit whatever the player
   *  sees: one of its own that stacks with it, or another player's unit at
   *  peace of the mover's map layer but a Trader (the path cost 0x270dd0 at
   *  0x27102e..0x2710a0) */
  stacked: (i: number) => boolean;
  /** on a plot the player sees now a feature of DangerValue above 0 (the
   *  node's +0x52 bit 0, 0x271be0 at 0x271fd3: the burning Woods and
   *  Rainforest, the Bermuda Triangle; an AI player's) */
  hazard: (i: number) => boolean;
  /** the plot lies in a zone of control the player sees: a hostile unit of
   *  the mover's domain that exerts one beside it, or a district at war that
   *  exerts one (`districtZones`), on a plot the player sees now; a unit across
   *  a river none but from a city centre, a city or Encampment across one
   *  all the same (the planning validity's 0x26f980 -> Rules_Movement
   *  0x530f50: 0x24c2f0 before the river bit, IsCity after it; runs/
   *  h1_duely1121 t97-103: China's city 6:12 zones 5:13 across the river) */
  seenZoc: (i: number) => boolean;
  /** the unit embarked, and the best of the other players' units on the
   *  plot embarked too (0x586360 under flag 1 at 0x586542..0x5865a1: the
   *  best defender 0x208b80 under 0x108 — any other player's unit, seen or
   *  not, a civilian among them, a Trader none —, read as a passenger where
   *  no other player's hull stands beside it): the unit may neither end
   *  there nor pass (the node's +0x50 bit 0x40 clear; runs/h1_duely1124
   *  t136: city-state 3's embarked Bombard on 42:13 plans 41:13 (1/2) under
   *  player 1's Trader at sea, and 42:12 (1/1) by it; t118 city-state 2's
   *  embarked Man-At-Arms on 9:10 plans no 9:9, player 1's embarked Builder
   *  on it, AI_Planning.csv) */
  boarded: (i: number) => boolean;
  /** another player's ground closed to the unit: a city-state's
   *  (`closedToMinor`), a major's (`borderClosedTo`) */
  closed: (i: number) => boolean;
}

const NO_FOES: ReadonlySet<number> = new Set();

function groundOf(state: GameState, unit: Unit, revealedOnly = true, planning = true, dangerSearch = true,
  mates: readonly Unit[] = formationMates(state, unit), dest = -1): Ground {
  const held = new Set<number>();
  const foes = new Set<number>();
  const own = new Set<number>();
  // a formation's stacking: any member's class (`stackClass`, 0x585eb0 over
  // its members), a Trader or a Spy none (0x585d90)
  const classes = new Set([unit, ...mates].map((m) => stackClass(m.type)));
  // the formation's members by id, none of them counted (a search may run on
  // a copy of the unit: the danger map's on its full Movement)
  const formation = new Set([unit, ...mates].map((m) => m.id));
  let seenNow: Uint8Array | undefined;
  // the plots a unit at war with it that fights holds, whatever its domain
  // (the planning's attack test; a move order's path strikes its own domain)
  const fighters = new Set<number>();
  // the same in every search (the node's +0x51 bits 0x20 and 0x40)
  const fought = new Set<number>();
  for (const u of state.units) {
    // its own units that stack with it, a Trader none (0x585d90 counts none
    // with MakeTradeRoute: runs/h1_duely1124 Cardiff t95 / t113, its Builder
    // onto 582 under its Trader, the Farm laid)
    if (!formation.has(u.id) && u.seat === unit.seat && classes.has(stackClass(u.type)) && !UNITS[u.type]?.trader
      && stackClass(u.type) !== 'spy') own.add(u.tileIndex);
    // another player's Trader stands on the trade layer: no location test
    // reads it (0x586360's defender 0x208b80 on the mover's layer), no stacking
    // count holds it (runs/h1_duely1124 t138-151: the barbarians' captured
    // Builder 5111833 on city-state 4's Trader's plots 37:9..33:8)
    if (u.seat === unit.seat || !onMap(u) || mapLayer(u.type) === 'trade') continue;
    held.add(u.tileIndex);
    if (!unitsHostile(state, unit, u)) continue;
    foes.add(u.tileIndex);
    const st = aiStrengths(state, u);
    if (st.melee <= 0 && st.ranged <= 0 && st.bombard <= 0) continue;
    fought.add(u.tileIndex);
    if (planning) fighters.add(u.tileIndex);
  }
  // the planning's search (0x26e570): a plot of a unit at war that does not
  // fight (a civilian) is a plain step, neither barred nor attacked into
  // (runs/h1_duely1121 t97-99: the raid's Man-At-Arms on 6:14 lists China's
  // Great Scientist's 5:12 at (2/1); h1_duely1128 t35: the barbarian Warrior
  // on 15:13 lists player 1's Settler's 16:13 at (1/1), AI_Planning.csv)
  const plainCivilians = planning && !dangerSearch;
  const enters = new Map<number, boolean>();
  const zocs = new Map<number, boolean>();
  const seenZocs = new Map<number, boolean>();
  const ignoresZoc = !!UNITS[unit.type]?.ignoresZoc || (!!UNITS[unit.type]?.cavalry && !UNITS[unit.type]?.chariot);
  // the plots the player revealed (node +0x51 bit 0, 0x154c0); a path
  // (`revealedOnly` false) reads every plot as revealed
  const revealed = revealedOf(state, unit.seat);
  const known = (i: number) => !revealedOnly || revealed(i);
  const def = UNITS[unit.type];
  // the search runs for the formation: its attacks are its fighter's, a
  // formed civilian's those of the escort beside it (runs/h1_duely1121
  // t105: the captured Settler 3211277 lists player 1's Courser's 11:16 at
  // (2/0) as its Man-At-Arms 2949124 does; every formation pair's two
  // AI_Planning.csv rows are one list — 1124 t90 / t100 the Builder 4456474
  // and Archer 3997716, 1128 t40 / t56 the Settler 2228251 and Slinger
  // 1441812)
  const fighter = def && def.combat > 0 ? unit : mates.find((m) => (UNITS[m.type]?.combat ?? 0) > 0) ?? unit;
  const melee = (UNITS[fighter.type]?.combat ?? 0) > 0;
  // its ranged or bombard strength tops its combat strength (0x56dc90 /
  // 0x56e3e0 / 0x56daa0)
  const str = aiStrengths(state, fighter);
  const shoots = str.ranged > str.melee || str.bombard > str.melee;
  // any member's (the location test 0x586900 asks each member's own)
  const formationShoots = [unit, ...mates].some((m) => {
    const s = aiStrengths(state, m);
    return s.ranged > s.melee || s.bombard > s.melee;
  });
  const naval = !!def?.naval;
  // the formation's domain (+0x278: the least of its members', sea for an
  // embarked member, 0x267650; its members share the unit's plot), which the
  // zone of control's exerters share
  const seaFormation = naval || !!unit.embarked;
  // a unit that may embark (`canEmbark`, 0x56c480: the barbarians' land units
  // plan no water, none of 6,269 of their planning rows on runs/h1_duelw1117,
  // 1121 and 1124 holds a water plot, their captives by their first owners)
  // the location test of a formation (0x586900) asks each member's own
  // (0x586360 -> 0x56c480): water only where every member may embark
  // (runs/h1_duely1121 t96-t99: the captured Settler 3211277, China's
  // Shipbuilding letting it embark, walks with its barbarian Man-At-Arms
  // round by land 6:17 / 7:18 / 7:19 / 8:19 for 11:14, never over 10:12)
  const embarks = [unit, ...mates].every((m) => canEmbark(state, m));
  const minor = isCityStateSeat(unit.seat);
  // another player's territory closed to the unit: a city-state's
  // (`closedToMinor`), a major's behind borders its owner has not opened to
  // it (`borderClosedTo`; runs/h1_duelq1128 t94-96: player 0's Warrior on
  // 13:7 lays no danger on player 1's 14:8 beside it)
  const shut = (t: Tile): boolean => (minor ? closedToMinor(state, unit.seat, t) : isCiv(unit.seat) && borderClosedTo(state, unit.seat, t));
  // the planning list's units of the mover's map layer alone (the plot list
  // of the formation's layer, 0x2665b0 -> 0x75c50 -> 0x585eb0): a religious
  // unit stands on a layer of its own (runs/h1_duely1127 t80-91: city-state
  // 3's Swordsman plans 4:10, player 1's Missionary on it in sight,
  // AI_Planning.csv), a Trader on the trade layer
  const layer = mapLayer(unit.type);
  const onLayer = (x: Unit) => onMap(x) && mapLayer(x.type) === layer;
  const boards = new Map<number, boolean>();
  const boarded = (i: number): boolean => {
    if (!unit.embarked || !held.has(i)) return false;
    let v = boards.get(i);
    if (v === undefined) {
      // the plot list the best defender reads (0x75c50 on the mover's layer)
      const others = state.units.filter((x) => x.tileIndex === i && x.seat !== unit.seat && onLayer(x));
      boards.set(i, (v = others.some((x) => !!x.embarked) && others.every((x) => !!x.embarked)));
    }
    return v;
  };
  // on a plot the player sees now (node +0x50 & 2, the visibility count
  // +0x290) a unit of another player not at war with it, of the mover's map
  // layer (0x585d90 counts none with MakeTradeRoute or Spy: the node's +0x54)
  const peaces = new Map<number, boolean>();
  const peaceHeld = (i: number): boolean => {
    let v = peaces.get(i);
    if (v === undefined) {
      seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
      peaces.set(i, (v = seenNow[i] === 1 && state.units.some((x) => x.tileIndex === i && x.seat !== unit.seat && onLayer(x)
        && !unitsHostile(state, unit, x))));
    }
    return v;
  };
  const passes = new Map<number, boolean>();
  let foesSeen: Set<number> | undefined;
  const crowded = (i: number) => own.has(i) || (held.has(i) && peaceHeld(i));
  const stacked = (i: number) => own.has(i) || (held.has(i) && state.units.some((x) => x.tileIndex === i && x.seat !== unit.seat
    && onLayer(x) && !unitsHostile(state, unit, x)));
  const hazard = (i: number): boolean => {
    const f = state.map.tiles[i].feature;
    if (!f || featureDanger(f) <= 0) return false;
    seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
    return seenNow[i] === 1;
  };
  return {
    hazard,
    known,
    revealed,
    boarded,
    closed: (i) => shut(state.map.tiles[i]),
    stand: (i) => {
      if (!held.has(i)) return true;
      if (!planning || boarded(i)) return false;
      // the planning's list (0x26d890): another player's unit at peace on
      // a plot the player sees now (`peaceHeld`) keeps the unit out; a plot it
      // does not see now passes 0x586900 alone, whose flag 1 lets any unit
      // there stand (runs/h1_duely1117 t2: Valletta's Warrior lists 13:12,
      // the barbarian Scout's, out of its sight; h1_duely1127 t10: city-state
      // 4's Warrior leaves 3:12 out, city-state 3's Builder on it in sight;
      // t45: it lists 7:10, city-state 3's Trader on it, AI_Planning.csv)
      if (peaceHeld(i)) return false;
      // a fit: a formation with no fighter lists no plot it sees now that a
      // unit at war of its layer holds, and one out of its sight whatever
      // stands on it (runs/h1_duelq1117 t110: the barbarians' captive Builder
      // 4128787 on 32:9 leaves player 1's Builder's 32:11 out of its safe
      // plots, h1_duelq1121 t197 the Builder 4784145 4:19; t234 the captive
      // Settler 4587543 on 3:10 takes player 1's Great Writer's 5:13, three
      // plots off)
      if (melee || !foes.has(i)) return true;
      seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
      return seenNow[i] !== 1 || !state.units.some((x) => x.tileIndex === i && x.seat !== unit.seat && onLayer(x) && unitsHostile(state, unit, x));
    },
    strikeSite: (i) => {
      seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
      if (seenNow[i] !== 1) return false;
      if (fought.has(i)) return true;
      const t = state.map.tiles[i];
      return cityCentre(state, t) && tileSeat(t) !== NO_SEAT && tileSeat(t) !== unit.seat && unitsHostile(state, unit, { seat: tileSeat(t) });
    },
    fighterSeen: (i) => {
      if (!fought.has(i)) return false;
      seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
      return seenNow[i] === 1;
    },
    crowded,
    stacked,
    foughtOn: (i) => {
      if (!fighters.has(i)) return false;
      seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
      return seenNow[i] === 1;
    },
    seenZoc: (i) => {
      let v = seenZocs.get(i);
      if (v !== undefined) return v;
      v = false;
      if (!ignoresZoc) {
        seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
        const sn = seenNow;
        const t = state.map.tiles[i];
        for (const n of neighbors(state.map, t)) {
          // a district at war zones whatever the player sees (0x530f50 at
          // 0x531168: 0x24c2f0 and the war test alone; runs/h1_duely1127
          // t43: the barbarian Archer on 13:8 plans nothing past 12:7, player
          // 1's centre 12:6 beside it out of its sight, AI_Planning.csv)
          if (districtZones(state, n, unit)) { v = true; break; }
          if (!sn[n.index]) continue;
          const river = crossesRiver(state.map, t, n);
          if (river && n.district !== 'CITY_CENTER') continue;
          if (state.units.some((x) => x.tileIndex === n.index && onMap(x) && !unitReligious(x.type) && unitExertsZoc(x)
            && !!UNITS[x.type]?.naval === seaFormation && unitsHostile(state, x, unit))) { v = true; break; }
        }
      }
      seenZocs.set(i, v);
      return v;
    },
    fits: (i) => revealed(i) || enterable(state, unit, state.map.tiles[i], NO_FOES, embarks),
    enter: (t) => {
      let v = enters.get(t.index);
      if (v === undefined) {
        enters.set(t.index, (v = enterable(state, unit, t, plainCivilians ? fighters : foes, embarks)
          && !shut(t)));
      }
      return v;
    },
    pass: (t) => {
      let v = passes.get(t.index);
      if (v === undefined) {
        if (!foesSeen) {
          seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
          const sn = seenNow;
          // the units of the mover's map layer alone (the best defender
          // 0x208b80 reads the plot list of the mover's layer): a plot whose
          // only units at war stand on another layer is a plain node, its
          // stacking count the path's as any plot's (runs/h1_duelq1121 t164:
          // the rampaging Crossbowman 3866651 on 15:19 holds for player 1's
          // Apostle's 9:19 once its Scout 131073 stands there; t165 / t167
          // the Crossbowmen 3735574 and 3801114 for 13:19 / 14:19 under the
          // Man-At-Arms 2883594)
          foesSeen = new Set([...foes].filter((i) => sn[i] === 1
            && state.units.some((x) => x.tileIndex === i && x.seat !== unit.seat && onLayer(x) && unitsHostile(state, unit, x))));
        }
        // a district of hit points of a player at war out of the player's
        // sight is a plain node: the location test under flag 1 (0x586360 at
        // 0x5866c9..0x58671f) refuses it only to a member whose ranged or
        // bombard strength tops its combat strength, and the attack bits
        // (+0x51 & 0x34) are set on a plot seen now alone (runs/h1_duelq1124
        // t114-t116: Builder Capture's Builder 5111833 and Man-At-Arms
        // 4784141 on 31:11 / 30:11 for 6:4 walk for city-state 4's centre
        // 32:8, the only way east the barbarians revealed); the path's
        // destination is tested under flag 0 (0x2714b0), which refuses it
        const owner = tileSeat(t);
        const fortUnseen = seenNow![t.index] !== 1 && garrisonDistrict(state, t) && owner !== NO_SEAT && owner !== unit.seat
          && unitsHostile(state, unit, { seat: owner }) && !formationShoots && t.index !== dest;
        passes.set(t.index, (v = enterable(state, unit, t, foesSeen, embarks, !fortUnseen)
          && !shut(t)));
      }
      return v;
    },
    attack: (t) => {
      if (!melee || !known(t.index) || isImpassable(t)) return false;
      // a move order's path attacks into no plot the player does not see now:
      // a city or a unit it last knew there out of its sight bars the plot
      // (runs/h1_duely1117 t127-134: the rampaging Man-At-Arms at 37:16 holds
      // for Longxi's 37:13 out of its sight; h1_duely1124 t114: the
      // Man-At-Arms at 6:3 holds for Beijing's 5:7, at t115 the Crossbowman
      // on 6:5 sees the city and it goes)
      if (!planning) {
        seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
        if (seenNow[t.index] !== 1) return false;
      }
      // in the planning, a unit at war that fights (0x26e570 -> 0x209dd0):
      // on ground the mover may take (land for a land mover, and water where
      // its player may embark it; water for a ship) in the planning's reach —
      // AI_Planning.csv lists no ship's water for a land unit that may not
      // embark (runs/h1_duelw1117 t16: city-state 4's Warrior at 28:4 lists
      // 27:4 (1/0) and not the barbarian Galley's 26:4) and lists it for one
      // that may (runs/h1_dueld1121 t69: city-state 2's Swordsman at 10:7
      // lists the barbarian Quadrireme's 8:5 (2/0) and chases it) —, in the
      // danger map's search alike: a land unit that may not embark threatens
      // no ship on its water (runs/h1_duely1124 t106-126: city-state 3's
      // Quadrireme on 38:17 heals beside the barbarian Man-At-Arms on 38:18;
      // 1121 t114-177 player 0's Move to safety rows on 2:19 / 3:20 log 30
      // where a land unit's strike added 25, AI_Tactical.csv)
      // a district of hit points at war is no plot for a unit whose ranged
      // or bombard strength tops its combat strength (the location test
      // 0x586360 at 0x5866c9..0x58671f, the validity's +0x50 bit 0x40 on a
      // revealed child): no search links it (runs/h1_duely1127 t43: the
      // barbarian Archer on 13:8 lists no 12:6, player 1's centre, where its
      // Warrior on 13:8 at t38 listed it (2/0), AI_Planning.csv)
      const owner = tileSeat(t);
      if (shoots && garrisonDistrict(state, t) && owner !== NO_SEAT && owner !== unit.seat && unitsHostile(state, unit, { seat: owner })) return false;
      // the danger map's search takes a civilian at war on water so too
      // (runs/h1_duelq1127 t166: player 0's Warrior on 15:12 lays its 20 on
      // 16:12, the barbarians' embarked Settler 2097173 on it), and strikes
      // into no water its player may not enter (runs/h1_duelq1127 t199:
      // player 0's embarked Warrior on 29:13, no Cartography, lays no 15 on
      // the barbarian Galley's Ocean 28:15; h1_duelq1121 t164 28:6)
      if (dangerSearch && planning && isWater(t) && !waterEnterable(state, t, unit)) return false;
      if ((fighters.has(t.index) && (isWater(t) === naval || (embarks && isWater(t))))
        || (!plainCivilians && foes.has(t.index) && (isWater(t) === naval || (dangerSearch && planning && embarks && isWater(t))))) return true;
      if (t.district === 'CITY_CENTER' && owner !== unit.seat && unitsHostile(state, unit, { seat: owner })) return true;
      return !naval && encampmentBlocks(state, t, unit);
    },
    zoc: (t) => {
      let v = zocs.get(t.index);
      if (v === undefined) {
        seenNow ??= plotsSeenNow(state, new Set([unit.seat]));
        zocs.set(t.index, (v = inEnemyZoc(state, t.index, unit, dest, crowded(t.index), seenNow)));
      }
      return v;
    },
  };
}

/** THE PATHFINDER'S FULL MOVEMENT OF A DOMAIN (the pool's init 0x2715a0 ->
 *  0x56d9f0, [pathfinder + 0x180 + domain*4]), whole: the type's base Moves
 *  (unit info +0x38) in its own domain; a land unit's on water the embarked
 *  pool (EMBARK_MOVES and the player's embark Movement, +0x880). GetMaxMoves'
 *  terms (0x56e130: the unit's Movement modifiers +0x1920, the player's
 *  +0x1300, the start plot's +0x1924..+0x192c) are none of it: a later turn
 *  of a search starts on it (runs/h1_duely1124 t29-55, city-state 4's Heavy
 *  Chariot 83: 3 Movement on its clear start plot, its second turn's plots
 *  planned on 2, AI_Planning.csv). A hull reads its base Moves on either. */
function domainPool(state: GameState, unit: Unit, sea: boolean): number {
  const def = UNITS[unit.type];
  const base = def?.moves ?? 2;
  if (def?.naval || !sea) return base;
  return EMBARK_MOVES + embarkTechMoves(state, unit.seat) + rosterEmbarkMoves(state, unit);
}

/**
 * THE PATHFINDER (Pathfinder_Instance 0x77d10, its step 0x793f0): Dijkstra
 * from the unit's plot — no heuristic (the pool's default, 0x26f330) — over
 * the open nodes by (key, cost, tie) — every search but the planning's
 * opens a turn-end node beside each node with Movement left — : a node
 * inserted where its key lies nearer
 * the cheapest open node goes before its equals, else after them (0x775a0),
 * a node made cheaper goes after its new equals (0x79560), a closed one made
 * cheaper re-prices its children from it (UpdateParents 0x79660); each closed
 * node links its neighbours in DirectionTypes order (0xeff730). A step's turns and
 * Movement (0x26e920): a node reached with no Movement starts the next turn
 * at full; a step dearer than the Movement left waits for the next turn,
 * unless it leaves the unit's own plot unmoved, where it spends everything; a
 * zone of control spends everything (`zoc`; the planning's breadth-first
 * search and the danger map's, flag 0x800, read none, and strike a unit at war on any ground,
 * a move order's path one on its own domain's); a strike's step is priced
 * so and then spends the Movement it leaves. Its cost (0x270dd0): 1000 x the step's
 * Movement +2, and where the step ends the turn's Movement +4, +3 more off
 * the unit's own territory; a land unit's water +1000 more. `onClose` sees each node as it closes; the
 * search stops where it answers true. `onLink` sees each link the search
 * prices (the cost callback 0x26d6f0): the plot, the plot it is linked from,
 * the turn and Movement the step reaches it with, and whether it attacks —
 * the start first, linked from itself. `reach` names the search's flags: a
 * search with no `zoc` is the planning's (0x26dcd0, flag 4), the danger
 * map's (0x26df90 under 0x311), Explore Land's (0x26df90 under 0x40 / 0x42)
 * or Naval Patrol's (0x26df90 under 0); 'explore' on a move order's path is
 * HL Explore's order (0x962030 under 0x40 / 0x42). In every search but the
 * planning's an attack on a city at war or a unit at war that fights, in the
 * player's sight, is struck only from a plot short of its stacking limit;
 * in the danger map's search a step onto a unit's plot keeps its Movement
 * left (only a district attack spends it). With laterTurns (the path's flag 0x1000) a
 * path's turn may end on a plot its own stacking unit holds after its first.
 */
type ReachSearch = 'planning' | 'danger' | 'explore' | 'patrol';

/** a move order's danger flags over the player's danger map (`dangerPlane`):
 *  `any` its flag 8, every plot of danger; `water` its flag 0x8000, a water
 *  plot of danger; `war` its flag 2, the ground of a player at war with the
 *  unit's */
export interface PathDanger {
  plane: ArrayLike<number>;
  any: boolean;
  water: boolean;
  war: boolean;
}

/** Move Unit's order without Allow Danger (0x7eeba0's flags 0x100a): flags 2
 *  and 8 */
export const moveUnitDanger = (plane: ArrayLike<number>): PathDanger => ({ plane, any: true, water: false, war: true });

/** a formation's full Movement (0x266660): the least GetMaxMoves (0x56e130)
 *  of its members (0x262cd0), the unit and its `mates` */
function formationFullMoves(state: GameState, unit: Unit, mates: readonly Unit[]): number {
  return Math.min(unitFullMoves(state, unit), ...mates.map((m) => unitFullMoves(state, m)));
}

function search(state: GameState, unit: Unit, maxTurns: number, zoc: boolean, onClose: (n: PNode, ground: Ground) => boolean,
  onLink?: (tile: number, from: number, turns: number, moves: number, attack: boolean) => void, reach: ReachSearch = 'planning',
  laterTurns = false, fromFull = false, explore = true, danger?: PathDanger, mates: readonly Unit[] = formationMates(state, unit), dest = -1,
  strike = false): void {
  const { map } = state;
  const standToAttack = !zoc && reach === 'danger';
  // the cost 0x270dd0's stacking +1e6, paid by every search without flag 4
  // (the planning's 0x115 alone carries it)
  const paysStack = zoc || reach !== 'planning';
  // the search's flag 0x40 (Explore Land's): the cost's exploring terms
  const scout = reach === 'explore';
  // the plots the player never revealed among a plot and the six beside it
  // (0x502aa0 over the player's revealed bytes, Player_Visibility +0x2f0)
  const unrevealedNear = new Map<number, number>();
  const blindNear = (t: Tile): number => {
    let v = unrevealedNear.get(t.index);
    if (v === undefined) {
      v = ground.revealed(t.index) ? 0 : 1;
      for (const n of neighbors(map, t)) if (!ground.revealed(n.index)) v += 1;
      unrevealedNear.set(t.index, v);
    }
    return v;
  };
  const ground = groundOf(state, unit, !zoc, !zoc, standToAttack, mates, dest);
  // a plot of a district with hit points of a player at war (0x26e570's
  // district attack: DistrictInfo +0x58 / +0x5c)
  const districtAttack = (t: Tile) => garrisonDistrict(state, t) && unitsHostile(state, unit, { seat: tileSeat(t) });
  // the formation may embark (+0x338): the embark and disembark rules run
  const embarks = formationEmbarks(state, unit, mates);
  const held = heldCostsOf(state, unit, embarks);
  const nodes = new Map<number, PNode>();
  // a later turn starts on the pathfinder's pool of the domain its plot holds
  // the unit in (`domainPool`): embarked on water, a land unit's own ashore
  const naval = !!UNITS[unit.type]?.naval;
  const fullLand = domainPool(state, unit, false) * FIX;
  const fullSea = domainPool(state, unit, true) * FIX;
  const unmoved = unit.movesLeft >= (unit.movesFull ?? unitFullMoves(state, unit));
  // the planning and the danger map set out on the formation's full Movement
  // (0x791e00 -> 0x26dcd0 with its third argument set: 0x26eea0 takes
  // 0x266660, the least GetMaxMoves 0x56e130 of its members, 0x262cd0), any
  // other search on its Movement left
  const startMoves = fromFull ? formationFullMoves(state, unit, mates) : unit.movesLeft;
  // the planning's valid wrapper (0x26e570 at 0x26e5e2..0x26e7f1, the start
  // linked from itself too): a plot holding a district whose type has
  // HitPoints (DistrictInfo +0x58 / +0x5c: the city centre, the Encampment)
  // of a player at war with the unit's, pillaged or not, is the attack test's
  // whatever the mover — the step onto it spends the Movement it leaves, and
  // a unit standing on one sets out with none, its turn-1 reach its own plot
  // alone (runs/h1_duely1128 t96-146: the captured Builder 5046293 on player
  // 1's Encampment 13:13 plans "13:13(1/0)" and every other plot at turn 2,
  // AI_Planning.csv, and fortifies in place, no safe plot this turn)
  const planningSearch = !zoc && !standToAttack;
  const fortAtWar = (t: Tile): boolean => planningSearch && garrisonDistrict(state, t) && tileSeat(t) !== NO_SEAT
    && unitsHostile(state, unit, { seat: tileSeat(t) });
  const start: PNode = { tile: unit.tileIndex, g: 0, tie: 0,
    // (the danger map's search alike: runs/h1_duelq1127 t249, the barbarian
    // Musketman on player 1's unbuilt Encampment 13:2 lays nothing about it)
    moves: fortAtWar(map.tiles[unit.tileIndex]) || (standToAttack && districtAttack(map.tiles[unit.tileIndex])) ? 0 : Math.floor(startMoves * FIX / MP_SCALE),
    turns: 1, closed: false, parent: null, wet: isWater(map.tiles[unit.tileIndex]) };
  nodes.set(start.tile, start);
  // the start is priced too, linked from itself
  onLink?.(start.tile, start.tile, start.turns, start.moves, false);
  // the open nodes, no two of one key; the cheapest and the dearest
  const open: PNode[] = [start];
  let lo: PNode | null = null;
  let hi: PNode | null = null;
  let seq = 0;
  // the open list's order: its key (+0x18), then its cost (+0x1c), then its
  // place among equals
  const kf = (a: PNode) => a.f ?? a.g;
  const below = (a: PNode, b: PNode) => kf(a) < kf(b) || (kf(a) === kf(b) && a.g < b.g);
  const before = (a: PNode, b: PNode) => below(a, b) || (kf(a) === kf(b) && a.g === b.g && a.tie < b.tie);
  // AddToOpen (0x775a0): below the cheapest first, above the dearest last;
  // else by its key's distance to theirs, nearer the cheapest (or as near)
  // before its equals, nearer the dearest after them
  const addOpen = (n: PNode) => {
    if (lo && hi && !below(n, lo) && !below(hi, n)) n.tie = Math.abs(kf(n) - kf(lo)) <= Math.abs(kf(n) - kf(hi)) ? -++seq : ++seq;
    open.push(n);
    if (!lo || before(n, lo)) lo = n;
    if (!hi || before(hi, n)) hi = n;
  };
  for (;;) {
    if (!open.length) break;
    // the cheapest node, and the cheapest once it is out
    let bi = 0;
    let si = -1;
    for (let i = 1; i < open.length; i++) {
      if (before(open[i], open[bi])) {
        si = bi;
        bi = i;
      } else if (si < 0 || before(open[i], open[si])) si = i;
    }
    const best = open[bi];
    lo = si >= 0 ? open[si] : null;
    open[bi] = open[open.length - 1];
    open.pop();
    if (!open.length) hi = null;
    else if (hi === null || hi === best) {
      hi = open[0];
      for (const o of open) if (before(hi, o)) hi = o;
    }
    best.closed = true;
    // a turn-end node lists nothing (the reach lists take a plot once,
    // 0x791270) and is no path's destination
    if (best.f === undefined && onClose(best, ground)) break;
    // an attack's plot is the end of the breadth-first searches' paths
    // (0x26e570): no step leaves one a seen unit at war that fights holds
    // (0x26e570 at 0x26e5cd: the parent's +0x51 bit 0x40, 0x271be0 at
    // 0x271f0c..0x271f2e from 0x5861f0 -> 0x523520's fighting out-flag), in
    // the planning's, Explore's and the danger map's search alike, so an
    // attack on a city or Encampment or onto a civilian goes on (runs/
    // h1_duelp1121 t90: player 1's Courser on 5:19 reaches 5:21 / 4:20 / 4:21
    // past the barbarians' captured Settler on 5:20, which takes 4:19 as
    // logged); a move order's path (the A* 0x7a630, whose validity 0x2720a0
    // runs no 0x26e570) steps on from one it links; nor one the player never
    // revealed but the unit's own (0x2720a0 under the search's flag 1: the
    // parent unrevealed)
    if ((best.attack && !zoc && ground.foughtOn(best.tile)) || (best !== start && !ground.known(best.tile))) continue;
    // a move order's path under flag 1 (no `explore`) leaves no plot the
    // player never revealed but the unit's own
    if (!explore && best !== start && !ground.revealed(best.tile)) continue;
    // the planning's search (no flag 0x200: 0x26e570 at 0x26e83e) moves on
    // from no plot of a zone of control the player sees but the unit's own;
    // an attack it strikes from there all the same
    const zoned = !zoc && !standToAttack && best !== start && ground.seenZoc(best.tile);
    const from = map.tiles[best.tile];
    for (let di = 0; di < DIRECTION_TYPES.length; di++) {
      const d = DIRECTION_TYPES[di];
      const to = neighborTile(map, from, d);
      if (!to) continue;
      // a plot the player never revealed is entered whatever it holds: the
      // step's validity (0x2720a0 at 0x272372..0x27242e) tests the location
      // (+0x50 bit 0x40, the domain, the embarking) on a revealed plot alone;
      // between two such plots no movement rule runs (0x26e920). A cliff
      // bars a shore crossing onto a revealed plot alone: the embark and
      // disembark tests (0x52fe90 / 0x52fb90, the water plot's cliff bit
      // toward the land) run on a revealed child, in the validity (0x272380)
      // and in the cost (0x270f24) alike (runs/h1_duely1121 t82: city-state
      // 4's embarked Man-At-Arms on 38:18 plans 40:17 / 40:16 (2/0) past
      // 39:17's cliffs, both never revealed, AI_Planning.csv)
      const blind = blindStep(best, to);
      // a move order's path passes a unit at war with it out of its sight
      // (`pass`)
      // the breadth-first searches' valid wrapper (0x26e570 at
      // 0x26e5e2..0x26e6c4) tests the plot's own district, not the player's
      // knowledge of it: a city centre or Encampment of a player at war on a
      // plot the player never revealed is an attack whatever the mover, a
      // step from a zone of control onto it allowed and its Movement spent
      // (runs/h1_duelp1117 t56: the barbarian Warrior 3080209 on 33:8 plans
      // city-state 4's unrevealed centre 32:5 at (2/0) from the zoned 32:6
      // and moves there for the Archer in it, AI_Planning.csv)
      const fortBlind = !zoc && !ground.revealed(to.index) && districtAttack(to);
      const attack = fortBlind || (ground.revealed(to.index) && !(zoc ? ground.pass(to) : ground.enter(to)));
      // the destination at its stacking limit (`crowded`), linked at any
      // turn without flag 0x1000 or within the first under it, ends the
      // search with no path: the validity 0x2720a0 tests the child on the
      // destination first of its turn ends (0x272230..0x27229e) and sets the
      // search's stop +0xe9 there (0x272364), which 0x77a50 / GeneratePath
      // read (runs/h1_duely1127 t41: city-state 2's Warrior 327683 on 42:17
      // holds for its Warrior's 42:15, the turn-2 path through 42:16 never
      // reached; h1_duely1124 t182-t196: the rampaging Galleys 1966102 /
      // 1179665 hold for China's Water Park 19:8; 1121 t154 the rampaging
      // Crossbowman 3801114 holds for 17:15)
      if (zoc && to.index === dest && dest !== unit.tileIndex && !attack && ground.crowded(dest)
        && (!laterTurns || price(best, to, di, attack, blind).turns <= 1)) {
        open.length = 0;
        break;
      }
      // a plot of a danger feature in the player's sight is no step of any
      // search but onto the path's destination (0x2720a0 at 0x27216c: the
      // node's +0x52 bit 0) (runs/h1_duely1128 t50-51: Bologna's Warriors
      // list no 5:5, its Woods burning, AI_Planning.csv)
      if (to.index !== dest && ground.hazard(to.index)) continue;
      if (ground.revealed(to.index) && cliffBlocksStep(state, from, to, unit)) continue;
      // a land formation's step off a water plot onto a revealed land plot
      // runs the disembark test (0x2720a0 at 0x2723c7 -> 0x52fb90) on the
      // parent's own water (its +0x50 bit 0x10), whatever the player revealed
      // of it: a formation that may not embark fails it at its head (+0x338
      // clear, 0x52fb9d), so a path that entered water it never revealed
      // comes ashore on no revealed plot (runs/h1_duelq1124 t20: the
      // rampaging Scout 1638420 on 6:12 for city-state 2's Warrior on 8:13
      // steps to 7:12, no way round by the unrevealed 8:11 and the water
      // 9:12)
      if (!naval && !embarks && !waterWalks(unit.type) && ground.revealed(to.index) && isWater(from) && !isWater(to)) continue;
      if (attack && !fortBlind && !ground.attack(to)) continue;
      if (zoned && !attack) continue;
      // the step's validity (0x2720a0 at 0x272372..0x27242e): onto a revealed
      // plot one the unit may stand on under flag 1 (+0x50 bit 0x40) — of
      // the domain it leaves by the location test, an embarking or a landing
      // step by the embark and disembark tests (0x52fe90 / 0x52fb90), which
      // end in the same location test 0x586900 under flag 1 on the plot
      // entered (0x52fe90 at 0x530024): an embarked unit passes no water
      // another player's embarked unit holds, nor embarks onto it
      // (runs/h1_duely1121 t86: city-state 3's embarked Man-At-Arms at 40:20
      // plans 39:21 alone, player 0's embarked Warrior on 40:19 and
      // city-state 4's Man-At-Arms on 41:20; t94: city-state 4's at 28:23
      // plans 29:21 past player 0's Quadriremes; runs/h1_duelp1117 t220:
      // city-state 2's embarked Line Infantry 1179654 on 14:6 links no 15:5
      // from the shore's 15:6, player 0's embarked Warrior 1114113 on it,
      // AI_Planning.csv)
      if (ground.revealed(to.index) && ground.boarded(to.index)) continue;
      // the stand-to-attack site: in every search but the planning's (no
      // flag 4), a child the player sees holding a city at war or a unit at
      // war that fights has its parent tested as a turn's end (the path
      // validity's chain walk, 0x2720a0 at 0x272315..0x272330 and
      // 0x272255): its count +0x54 at the stacking limit (`crowded`, the
      // unit itself not counted) refuses the link, under flag 0x1000 from a
      // parent of the first turn alone (runs/h1_duely1127 t128: the
      // rampaging Galley 589825 on 30:17 for player 0's embarked Warrior on
      // 29:15 goes round its Galley 1048590's 30:16 to 29:16 and strikes, as
      // logged; t152 / t201-t237 its Galleys likewise)
      if (attack && paysStack && ground.strikeSite(to.index) && ground.crowded(best.tile) && (!laterTurns || best.turns <= 1)) continue;
      // a move order's danger flags (the path validity 0x2720a0 at
      // 0x272590..0x272612): from a node of the path's first turn, under
      // flag 8 no child of danger (the player's danger map 0x716a90 above
      // 0), under flag 0x8000 no water child of danger; under flag 2 (at
      // 0x2724c8) no child on the ground of a player at war with the unit's
      if (danger && best.turns <= 1 && danger.plane[to.index] > 0 && (danger.any || (danger.water && isWater(to)))) continue;
      if (danger?.war && tileSeat(to) !== NO_SEAT && tileSeat(to) !== unit.seat && unitsHostile(state, unit, { seat: tileSeat(to) })) continue;
      const s = price(best, to, di, attack, blind);
      if (s.turns > maxTurns) continue;
      // a move order's attack child (0x2720a0 at 0x272434..0x272544): a
      // plot the player sees holding a unit at war, or a city or district
      // at war (+0x51 & 0x34), is linked only for a formation holding a
      // fighter (the pathfinder's +0x1f8, 0x1385c0 over its members: `attack`
      // asks the fighter's) — under the attack flag 0x10 the destination
      // alone, else under flag 0x1000 at a turn after the first, where a
      // seen fighter at war on a plot beside the start (0x889e0) is refused
      // from a parent at its stacking limit (+0x51 bit 7) — so a path
      // without the attack flag passes a seen unit at war in a later turn
      // (runs/h1_duely1124 t112-118: Builder Capture's Builder 5111833 and
      // Man-At-Arms 4784141 on 32:10 for 6:4, city-state 4's Trebuchets and
      // Pikeman on the bridge 31:8 / 32:8 / 33:8, step to 31:11)
      if (zoc && attack) {
        if (strike ? dest >= 0 && to.index !== dest : !laterTurns || s.turns <= 1) continue;
        if (!strike && ground.fighterSeen(to.index) && plotDistance(state, to.index, unit.tileIndex) === 1 && ground.crowded(best.tile)) continue;
      }
      // a path's turn may not end on a plot its own stacking unit holds, nor
      // one another player's unit at peace holds in its sight (the path
      // validity 0x2720a0: each node where the next starts a turn, its count
      // +0x54 against the stacking limit; under flag 0x1000 its first turn
      // alone) (runs/h1_duely1121 t81: city-state 4's embarked Man-At-Arms on
      // 36:19, player 0's Warriors on the shore's 36:18 and 35:19, sails to
      // 38:18 for its centre 32:21)
      if (zoc && s.turns > best.turns && ground.crowded(best.tile) && (!laterTurns || best.turns <= 1)) continue;
      onLink?.(to.index, best.tile, s.turns, s.moves, attack);
      const c = nodes.get(to.index);
      if (!c) {
        const n: PNode = { tile: to.index, g: s.g, tie: 0, moves: s.moves, turns: s.turns, carry: s.carry, closed: false, parent: best, attack, wet: s.wet };
        nodes.set(n.tile, n);
        (best.kids ??= []).push({ node: n, di });
        addOpen(n);
        // the turn-end node (the two-layer pathfinder's second layer: the
        // open notification 0x271920 -> 0x7a880): a path's node with
        // Movement left but on its destination (0x271490) opens a second
        // node on its plot that ends the turn there — its Movement 0, its
        // cost the node's plus 1000 x the Movement left (0x16e7d0 with
        // 0x3e800), its key the node's, its parent the node's — so a later
        // turn may set out from that plot at full Movement (runs/h1_duely1117
        // t32: the barbarian Slinger 1769487 on 30:17 for 30:15 ends its turn
        // on 29:16, its second waiting on 29:15; runs/h1_duely1127 t36: the Warrior
        // 2031626 for 12:7 waits on 13:8); every search but the planning's
        // opens them, the reach searches 0x26df90 (the danger map's, Explore
        // Land's, Naval Patrol's) too, whose one turn reaches no plot more by
        // one but whose open list's order among equal keys they move: a node
        // inserted after them weighs its side against them (runs/h1_duelq1121
        // t8: the barbarian Galley 524295 on 6:8 closes 4:9 before 7:9, both
        // at 543744, and explores for 4:9 as logged); the planning's search
        // (flag 4) opens one on a mountain or a canyon alone, none the unit
        // enters
        if (paysStack && n.moves > 0 && n.tile !== dest) {
          addOpen({ tile: n.tile, g: n.g + n.moves * 1000, f: n.g, tie: 0, moves: 0, turns: n.turns, carry: n.carry, closed: false, parent: best, wet: n.wet });
        }
        continue;
      }
      (best.kids ??= []).push({ node: c, di });
      if (s.g >= c.g) continue;
      reparent(c, best, s);
      // a closed child made cheaper takes its children along (UpdateParents
      // 0x79660): each linked from a node so re-parented is priced again
      // from it and re-parented where strictly cheaper, the walk going on
      // through those (a stack, each node once)
      if (!c.closed) continue;
      const stack: PNode[] = [c];
      while (stack.length) {
        const p = stack.pop()!;
        for (const k of p.kids ?? []) {
          if (p.parent === k.node) continue;
          const kt = map.tiles[k.node.tile];
          const ks = price(p, kt, k.di, !!k.node.attack, blindStep(p, kt));
          onLink?.(kt.index, p.tile, ks.turns, ks.moves, !!k.node.attack);
          if (ks.g >= k.node.g) continue;
          reparent(k.node, p, ks);
          if (!stack.includes(k.node)) stack.push(k.node);
        }
      }
    }
  }

  /** a step between two plots the player never revealed (node +0x51 bit 0
   *  clear on both; the unit's own plot counts as revealed) */
  function blindStep(p: PNode, to: Tile): boolean {
    return p !== start && !ground.revealed(p.tile) && !ground.revealed(to.index);
  }

  /** a step's turns, Movement and cost from the node `p` onto `to` (the cost
   *  callback 0x26e920 and 0x270dd0) */
  function price(p: PNode, to: Tile, di: number, attack: boolean, blind: boolean): { g: number; moves: number; turns: number; carry: number; wet: boolean } {
    const from = map.tiles[p.tile];
    let pm = p.moves;
    let turns = p.turns;
    if (pm <= 0) {
      turns += 1;
      pm = !naval && p.wet ? fullSea : fullLand;
    }
    // the step's rules, then the parent's carry on top (0x26e920: the
    // parent's +0x20 added to the step's cost); between two plots the
    // player never revealed no rule runs: the parent's carry, else 1
    let cost = blind ? (p.carry || FIX) : Math.floor(stepCostHeld(state, unit, from, to, di, held, embarks) * FIX / MP_SCALE) + (p.carry ?? 0);
    const wet = blind ? p.wet : isWater(to);
    // a shore crossing carries the Movement held past the new domain's full
    // Movement to the next step (0x530420 / 0x530240: Movement left above
    // the domain's, a FreeEmbark district's crossing too; runs/h1_duely1128
    // t88: Nazca's Horseman 31:6 (1/4) embarks onto 31:5 (1/1) carrying 2,
    // 32:4 beyond it (2/0), AI_Planning.csv)
    const cross = !blind && embarks && shoreCrossing(unit.type, from, to);
    const maxTo = wet ? fullSea : fullLand;
    let carry = cross && pm > maxTo ? pm - maxTo : 0;
    let moves = pm - cost;
    if (moves < 0) {
      moves = 0;
      carry = 0;
      if (p === start && unmoved) cost = pm;
      else if (p.turns === turns) turns += 1;
      else cost = pm > 0 ? pm : FIX;
    }
    // the danger map's search (flag 0x200) pays the attack's spend on a
    // district alone: a step onto a unit's plot is priced as any step, the
    // Movement it leaves there kept (0x26e570 at 0x26e6d3), no step going on
    // from it (0x26e5cd) (runs/h1_duely1127 t8: the barbarian Slinger on 5:8
    // reaches city-state 4's Warrior on 5:9 with Movement left, 6:10 beside
    // it in its range); a district at war it may enter, an Encampment not yet
    // built, spends it alike (runs/h1_duelq1128 t96-103: the barbarian
    // Swordsman on 12:13 lays no danger on 14:13 past player 1's unbuilt
    // Encampment 13:13, its Slinger none from it)
    if ((attack && !(standToAttack && !districtAttack(to))) || fortAtWar(to) || (standToAttack && districtAttack(to))) {
      // the attack's step priced as any step — a river's 2 above the
      // Movement left waits for the next turn (runs/h1_duelv1121 t4: city-state
      // 4's Warrior at 32:22 lists 32:23 (1/1) and the barbarian Scout's
      // 33:23 across the river (2/0), AI_Planning.csv) — then spends the
      // Movement it leaves (0x26e570: the cost adds it), as a step onto a
      // district at war with HitPoints does in the planning
      cost += moves;
      moves = 0;
    } else if (moves > 0 && zoc && !blind && ground.zoc(to)) {
      // a zone of control's step costs at least the Movement it starts with
      // (0x26f980's minimum), the parent's carry on top: with one, the step
      // is left short (0x26ed00). The danger map's search pays none: 0x26df90
      // adds 0x800 to its flags 0x311 (at 0x26e12f), and the cost 0x26e920
      // skips the zone under it (at 0x26eb27) (runs/h1_duely1127 t4: the
      // barbarian Scout on 5:12 flees to 4:13, 5:13 beyond it in the danger
      // of city-state 3's Warrior on 4:12)
      cost = pm;
      moves = 0;
      carry = 0;
      if ((p.carry ?? 0) > 0 && !(p === start && unmoved) && p.turns === turns) {
        turns += 1;
        cost = pm + (p.carry ?? 0);
      }
    }
    // the cost (0x270dd0): +4 where the step leaves no Movement, +3 more
    // off the unit's territory on a revealed plot; +2 a revealed plot, +3
    // an unrevealed one; +1000 a land unit's revealed water, its player not
    // human (0x2712be: the formation's land domain +0x1f2; runs/h1_duely1117
    // t69: Valletta's Archer on 13:8 closes the Harbor's 14:7 (1/0) after
    // 12:8 and 12:9 and its water to the north after the land, AI_Planning.csv)
    // Every search but the planning's (0x270dd0 at 0x27102e..0x2710a0, not
    // under flag 4: a move order's path, the danger map's and HL Explore's)
    // prices a step that ends the turn on a revealed plot at its stacking
    // limit (`stacked`, against +0x58c) +1e6 more, so its node sorts last
    // (runs/h1_duely1127 t17: the barbarian Slinger 1114127 on 14:2 for 14:5,
    // its camp's Spearman on 13:1: 15:4 lands from the head before 14:4 and
    // the path takes 14:3 / 15:4)
    // Each term reads the child's revealed bit (+0x51 bit 0, [rsp+0xa8] from
    // 0x270e55), a move order's path as any search. Under flag 0x40 (0x270e86:
    // the flags' bit 6) a turn's end on a revealed plot but a hill costs +300
    // more (0x270ff2..0x271019), an unrevealed plot +2 as a revealed one
    // (0x2713d3), and every step +10 x (7 - the plots never revealed among
    // the child and the six beside it) (0x2711c3..0x271268)
    const seen = ground.revealed(to.index);
    const stack = paysStack && moves <= 0 && seen && ground.stacked(to.index) ? 1e6 : 0;
    const flat = scout && moves <= 0 && seen && to.elevation !== 'HILLS' ? 300 : 0;
    const ends = moves <= 0 ? 4 + stack + flat + (seen && tileSeat(to) !== unit.seat ? 3 : 0) : 0;
    const sea = seen && !naval && isWater(to) ? 1000 : 0;
    const look = scout ? 10 * (7 - blindNear(to)) : 0;
    return { g: p.g + cost * 1000 + (ends + (seen || scout ? 2 : 3) + sea + look) * FIX, moves, turns, carry, wet };
  }

  /** a node made cheaper from `p`: an open one re-keyed after its new
   *  equals (0x79560) */
  function reparent(c: PNode, p: PNode, s: { g: number; moves: number; turns: number; carry: number; wet: boolean }): void {
    c.g = s.g;
    c.moves = s.moves;
    c.turns = s.turns;
    c.carry = s.carry;
    c.wet = s.wet;
    c.parent = p;
    if (c.closed) return;
    c.tie = ++seq;
    if (!lo || before(c, lo)) lo = c;
    if (c === hi) {
      hi = open[0];
      for (const o of open) if (before(hi, o)) hi = o;
    }
  }
}

/** THE REACH (UnitPlanning 0x791e00 -> breadth-first 0x26dcd0, the list
 *  0x26d890 keeps): every plot the unit can stand on within `maxTurns`, in
 *  the order the pathfinder closed them, the unit's own plot first. */
export function reachPlots(state: GameState, unit: Unit, maxTurns: number): Reach[] {
  const out: Reach[] = [];
  search(state, unit, maxTurns, false, (n, ground) => {
    // a plot the unit may not stand on it only passes (`stand`), its own
    // plot listed whatever holds it, none of ground closed to a city-state
    if (n.tile === unit.tileIndex || (!ground.closed(n.tile) && (n.attack || (ground.stand(n.tile) && ground.fits(n.tile))))) out.push({ tile: n.tile, turns: n.turns, moves: n.moves, attack: !!n.attack });
    return false;
  });
  return out;
}

/** a path's destination placed (0x272880's "Destination is invalid" and the
 *  destination test 0x2714b0, each 0x586900 over the formation's members ->
 *  0x586360's domain at 0x58640c..0x586494), whatever the player revealed: a
 *  hull on water or a hull's passage, a land unit on land or on water it may
 *  embark onto (runs/h1_duely1121 t26: the rampaging Quadrireme on 9:1 for
 *  city-state 2's Warrior on 10:4, no water beside it, holds — the ring's
 *  pasture 10:5 it never revealed no plot for it) */
function placedOn(state: GameState, members: readonly Unit[], t: Tile): boolean {
  return members.every((m) => (UNITS[m.type]?.naval ? isWater(t) || hullPassage(t)
    : !isWater(t) || waterWalks(m.type) || canEmbark(state, m)));
}

/** the turns the unit's path takes to stand on `dest` (0x272a60 -> 0x26f1d0
 *  under flag 0x1000: the path's search, its zone of control spending the
 *  Movement — the planning's breadth-first refusal 0x26e570 is not its
 *  validity —, a turn after the first free to end where its own stacking
 *  unit stands; stopped once `dest` closes, or with none where `dest` at
 *  its stacking limit is linked within the first turn); 0 where it cannot. With no
 *  `laterTurns` (the path's flags 0) no turn of it ends where its own
 *  stacking unit stands, and `dest` at its stacking limit linked at any
 *  turn is none. */
export function turnsToPlot(state: GameState, unit: Unit, dest: number, laterTurns = true): number {
  let turns = 0;
  if (dest !== unit.tileIndex && !placedOn(state, [unit, ...formationMates(state, unit)], state.map.tiles[dest])) return turns;
  search(state, unit, Infinity, true, (n, ground) => {
    if (n.tile !== dest) return false;
    if (n.attack || n.tile === unit.tileIndex || ground.stand(n.tile)) turns = n.turns;
    return true;
  }, undefined, undefined, laterTurns, false, true, undefined, formationMates(state, unit), dest);
  return turns;
}

/** the plots from the unit's to `dest`, the unit's own left out, by the
 *  pathfinder's path (its parents once `dest` closes); empty where none */
export function pathTo(state: GameState, unit: Unit, dest: number, laterTurns = false, explore = true,
  danger?: PathDanger, mates: readonly Unit[] = formationMates(state, unit), scout = false, strike = false): number[] {
  return pathNodes(state, unit, dest, laterTurns, explore, danger, mates, scout, strike).map((n) => n.tile);
}

/** `pathTo`'s nodes, each with the turn it is reached in; `strike` the
 *  order's attack flag 0x10 */
function pathNodes(state: GameState, unit: Unit, dest: number, laterTurns: boolean, explore: boolean,
  danger: PathDanger | undefined, mates: readonly Unit[], scout = false, strike = false): PNode[] {
  // a destination another player's unit holds out of the player's sight is
  // no path, an attack order's too: the move order's request (0x962310)
  // drops the attack flag 0x10 where the owner's visibility count of its
  // plot is 0, and the destination test (0x2714b0) then tests the plot under
  // location flag 0, where another player's unit there of the mover's map
  // layer, seen or not, refuses it (0x586360's best defender 0x208b80 under
  // 0x108, the plot's list of the mover's layer: 0x208b80 at 0x208bbf ->
  // 0x901e0 -> 0x75c50); an order without the attack flag has no path to such
  // a plot, seen or not (runs/h1_duely1121 t36: Barbarian Attack's Archer
  // 1835022 on 5:14 for player 1's Scout's 5:13 does not move for it;
  // runs/h1_duelp1127 t108: city-state 4's Knight 1114117 wanders onto 4:8,
  // player 1's Missionary 1572870 on it out of its sight)
  if (dest !== unit.tileIndex && foreignOnLayer(state, unit, dest)
    && (!strike || plotsSeenNow(state, new Set([unit.seat]))[dest] !== 1)) return [];
  if (dest !== unit.tileIndex && !placedOn(state, [unit, ...mates], state.map.tiles[dest])) return [];
  // the destination at its stacking limit is no path (`search`'s stop)
  let found = null as PNode | null;
  search(state, unit, Infinity, true, (n) => {
    if (n.tile !== dest) return false;
    found = n;
    return true;
  }, undefined, scout ? 'explore' : undefined, laterTurns, false, explore, danger, mates, dest, strike);
  const out: PNode[] = [];
  for (let n: PNode | null = found; n && n.parent; n = n.parent) out.push(n);
  return out.reverse();
}

/** a move order carried out (the unit's mission 0x962030): the unit walks
 *  its path as far as its Movement carries it this turn (a zone of control
 *  ends it), the engine's step paying each; it walks through its own units
 *  but stops short of a plot of its own unit that stacks with it, and short
 *  of a unit at war with it its path passed out of its sight. A path
 *  ending on a plot it attacks into stops at its side, and with `strike`
 *  the unit strikes it there. A destination its own stacking unit or
 *  another player's unit at peace in its sight holds is no path (with
 *  `laterTurns`, reached in the first turn), nor one another player's unit
 *  holds out of its sight. With `laterTurns` (the order's
 *  path flag 0x1000) the path's turns after its first may end on a plot its
 *  own stacking unit holds, its first not; with no `explore` (its flag 1) the
 *  path leaves no plot the player never revealed; with `danger` (its flags
 *  8 / 0x8000) its first turn steps onto no plot of danger, (its flag 2)
 *  no step onto the ground of a player at war with it; with `scout` (its
 *  flag 0x40, HL Explore's order) the path prices its steps as Explore
 *  Land's (`search`'s reach 'explore'). In an AI player's
 *  pass a unit whose last step of the turn ended in a zone of control does
 *  not move (`orderOnce`). */
export function moveTo(state: GameState, unit: Unit, dest: number, strike = true,
  laterTurns = false, explore = true, danger?: PathDanger, mates: readonly Unit[] = formationMates(state, unit),
  scout = false): void {
  const open = orderOnce(state, unit, dest, strike, laterTurns, explore, danger, mates, scout);
  // an order its walk left short of its destination, Movement left, stays
  // on the unit, carried on as the player's turn ends
  if (shortOrders && open && state.units.includes(unit) && unit.movesLeft > 0 && unit.tileIndex !== dest) {
    shortOrders.push({ slot: Math.min(unit.slot ?? 0, ...mates.map((m) => m.slot ?? 0)),
      run: () => orderOnce(state, unit, dest, strike, laterTurns, explore, danger, mates, scout) });
  }
}

/** the move orders a player's turn left short of their destinations with
 *  Movement left (the unit's operation queue +0x60 holding the order), in
 *  the order given, each with the least pool slot of its formation's
 *  members; null outside an AI player's pass */
let shortOrders: { slot: number; run: () => void }[] | null = null;

/** the units whose last step of the player's turn ended in a zone of
 *  control (their formation's m_bHasMovedIntoZOC +0x518, set by each step
 *  of the walk 0x26fe20 at 0x270800 from 0x26f980, cleared at the
 *  formation's turn start 0x2673f0); null outside an AI player's pass */
let zocMoved: Set<Unit> | null = null;

/** the units of the AI player's pass open whose moves an order ended
 *  (`Pass.ended`, 0x56d6f0): a formation holding one moves no more (its
 *  Movement +0x218 the least its members hold, 0x267b00); null outside a
 *  pass */
let movesEnded: ReadonlySet<number> | null = null;

/**
 * A player's AI turn with its move orders carried on (`moveTo`): an order
 * whose walk stops short of its destination with Movement left — the next
 * plot of its path a later turn's, for its Movement or a plot held — stays
 * queued on the unit (the MoveTo operation's execution 0x962380 waits,
 * +0x11, where the step 0x26fe20 finds its next node beyond the first
 * turn; the queue 0x52f50 ends the segment with the operation kept), and
 * the unit walks it again from where it stands once the player's other
 * units have moved, its path found anew (runs/h1_duely1121 t71: city-state
 * 4's Warrior 262146 stops on 33:19 short of the Swordsman 720896 on 33:20,
 * the tactical pass wanders the Swordsman to 34:20, the Warrior's order goes
 * on to 33:20; 33 such second walks over the five duely duels, the
 * barbarians' among them, the record's UnitMoved after the order's
 * UnitOperationSegmentComplete; 1121 t103 its Man-At-Arms 1048577 goes on
 * from 38:13 to 38:12, 1127 t109 city-state 3's Galley 393216 to 29:16;
 * 1121 t95 the barbarian Warrior 1769487 stopped on 8:14 for its Movement
 * goes on to 7:14 once its Man-At-Arms left it, t148 the Builder Capture's
 * pair goes back to 15:19)
 */
function withShortOrders(fn: () => void): void {
  const outer = shortOrders;
  const outerZoc = zocMoved;
  const mine: { slot: number; run: () => void }[] = [];
  shortOrders = mine;
  zocMoved = new Set();
  try {
    try {
      fn();
    } finally {
      shortOrders = outer;
    }
    // the player's turn deactivating (Player::Processor::DoAutomation
    // 0x7df30) walks its unit list (+0x12e8 -> +0xd8, the pool's slots
    // ascending) and runs each unit's kept operation (0x554e0 -> 0x523e0 ->
    // the queue run 0x52f50): the carried orders go in their units' slot
    // order, a unit's own in the order given
    for (const o of mine.map((x, i) => ({ ...x, i })).sort((a, b) => a.slot - b.slot || a.i - b.i)) o.run();
  } finally {
    zocMoved = outerZoc;
  }
}

/** one walk of a move order (the MoveTo operation's execution 0x962380):
 *  true where the order stays open — its walk stood short of its
 *  destination, the step's next node a later turn's or a plot held. A unit
 *  whose last step of the turn ended in a zone of control waits (0x962793:
 *  the formation's +0x518), striking all the same where its path's next
 *  plot is the one it attacks into. The strike is the path's first node
 *  reached this turn (0x962380: +4 at most 1): the attack node of the path
 *  the order walked a later turn's — a zone of control on the way spending
 *  the path's turn — holds it for the turn (a FIT: runs/h1_duelp1127 t109 /
 *  t199 the rampaging Galley 1048590 steps beside city-state 3's Galley
 *  into its zone and holds there short of the embarked Warrior, as logged);
 *  else its step priced as any step of the walk, one dearer than the
 *  Movement left once the unit moved waits, the order kept. A unit whose
 *  moves an order of the pass ended
 *  (`movesEnded`, 0x56d6f0) runs it no more: the queue 0x52f50 executes an
 *  operation only for a unit with Movement (0x56c690) or a formation with
 *  Movement (0x265d70, +0x218 the least its members hold).
 *
 *  THE KEPT PATH (0x272aa0, inside one queue run): each execution steps one
 *  node (0x26fe20) of the path the run's last search kept, flagged as it
 *  was found (0x26e3a0: its first node on a plot the player did not see
 *  then, and its goal where not seen then). Before a step after the
 *  search's own: a goal so flagged and seen now is searched afresh
 *  (0x272af9..0x272b95); else a next node so flagged has the kept path's
 *  last node of its first turn (0x782d0) searched for (0x272c24); either
 *  search finding no path, the order's plot is searched, unless it was the
 *  plot searched; standing on a kept goal short of the order's plot, the
 *  order's plot is searched (runs/h1_duelq1124 t85: city-state 4's Heavy
 *  Chariot 983040 on 8:10 for its centre 32:8 steps 7:10, 6:11 on a path
 *  through 5:11 it never saw, a mountain: no path there, its search from
 *  6:11 turns it back to 7:10; t87 on 8:11 it steps 8:12, 7:13 closed
 *  ground once seen, and steps back to 8:11; the record's revealed plots
 *  hold both looks) */
function orderOnce(state: GameState, unit: Unit, dest: number, strike: boolean,
  laterTurns: boolean, explore: boolean, danger: PathDanger | undefined, mates: readonly Unit[], scout: boolean): boolean {
  let goal = dest;
  for (;;) {
    const r = orderRun(state, unit, goal, strike, laterTurns, explore, danger, mates, scout);
    if (typeof r === 'boolean') return r;
    if (r === 'none' || r === 'there') {
      if (goal === dest) return false;
      goal = dest;
    } else goal = r.search;
  }
}

/** the walk of one path of `orderOnce`, searched for `goal`: 'none' where
 *  the search finds no path, 'there' where the unit stands on `goal`,
 *  `search` the plot the kept path's rule searches next (`walk`'s
 *  `kept.again`) */
function orderRun(state: GameState, unit: Unit, dest: number, strike: boolean,
  laterTurns: boolean, explore: boolean, danger: PathDanger | undefined, mates: readonly Unit[], scout: boolean): boolean | 'none' | 'there' | { search: number } {
  if (!state.units.includes(unit) || unit.movesLeft <= 0 || movesEnded?.has(unit.id)) return false;
  // the move order's start (0x55280) with Movement left: OPERATION, AWAKE
  // once its queue empties (0x52f50)
  operationStart(unit);
  if (unit.tileIndex === dest) return 'there';
  const nodes = pathNodes(state, unit, dest, laterTurns, explore, danger, mates, scout, strike);
  let path = nodes.map((n) => n.tile);
  if (!path.length) return 'none';
  // the path's flags (0x26e3a0), by what the player sees as it is found
  const sight = plotsSeenNow(state, new Set([unit.seat]));
  const kept: KeptPath = { flagged: nodes.findIndex((n) => sight[n.tile] !== 1), goal: sight[dest] !== 1 ? dest : -1, again: -1 };
  // a path ending on a plot it attacks into: it walks to its side, and
  // strikes it where its Movement and attacks last (the order's attack flag)
  const last = path[path.length - 1];
  const into = attackPlot(state, unit, last);
  if (into) path = path.slice(0, -1);
  if (zocMoved?.has(unit) && path.length) return false;
  const from = unit.tileIndex;
  // a plot of civilians alone the order's strike takes this turn: the walk
  // passes the plot beside it (`walk`'s `onto`)
  const capture = into && strike && nodes[nodes.length - 1].turns === 1 && attacksLeftOf(unit) > 0 && !unit.embarked
    && (UNITS[unit.type]?.combat ?? 0) > 0 && civiliansAlone(state, unit, last);
  const refused = walk(state, unit, path, dest, mates, capture ? last : -1, kept);
  if (zocMoved && unit.tileIndex !== from) {
    // the zone test on the plot it stands on, no destination (0x270800:
    // 0x26f980's fourth argument null), so no exerter's plot is waived
    const zoned = inEnemyZoc(state, unit.tileIndex, unit);
    for (const m of [unit, ...mates]) {
      if (zoned) zocMoved.add(m);
      else zocMoved.delete(m);
    }
  }
  if (refused || !state.units.includes(unit)) return false;
  if (kept.again >= 0) {
    // the goal seen now: searched afresh; else the kept path's last node of
    // its first turn (0x782d0: the first whose next is a later turn's, the
    // goal where none is)
    if (kept.again !== kept.flagged) return { search: dest };
    let j = kept.again;
    while (j + 1 < nodes.length && nodes[j + 1].turns <= 1) j += 1;
    return { search: nodes[j].tile };
  }
  if (into) {
    if (plotDistance(state, unit.tileIndex, last) !== 1) return true;
    if (!strike || nodes[nodes.length - 1].turns > 1) return false;
    // the order's next run searches afresh from beside the plot (start carry
    // 0): a step onto it dearer than the Movement left, the unit moved, is a
    // later turn's (runs/h1_duelz1117 t10: the rampaging Warrior 589832 on
    // 13:11 with 1 Movement holds for city-state 2's Warrior in the Woods of
    // 14:10; 1121 t151 the Man-At-Arms 3080206 on 16:13 strikes the
    // Cuirassier on the grassland 15:13)
    const { tiles } = state.map;
    const cost = stepCost(state, unit, tiles[unit.tileIndex], tiles[last], formationEmbarks(state, unit, mates));
    if (unit.movesLeft < cost && unit.movesLeft < (unit.movesFull ?? unitFullMoves(state, unit))) return true;
    if (unit.movesLeft > 0 && attacksLeftOf(unit) > 0) meleeAttack(state, unit.id, last, unit.seat);
    return false;
  }
  return unit.tileIndex === dest ? 'there' : true;
}

/** a kept path's flags (0x26e3a0) for its walk: `flagged` the index of its
 *  first node on a plot the player did not see as it was found (-1 none),
 *  `goal` its goal where not seen then (-1 seen); `again` the index of the
 *  step the walk stopped before for a search (-1 none; the path's length
 *  for the goal's) */
interface KeptPath { flagged: number; goal: number; again: number }

/** a plot the unit would attack into rather than enter: one a unit of a
 *  player at war with it holds on its map layer (a religious unit on its
 *  own: a move order walks onto it, runs/h1_duely1124 t118 the barbarian
 *  Man-At-Arms 4849682 onto the Missionary on 35:16, t136 the Caravel
 *  4587523 onto the embarked Missionary on 26:13), or a hostile city centre
 *  or Encampment */
function attackPlot(state: GameState, unit: Unit, p: number): boolean {
  const t = state.map.tiles[p];
  if (enemyOnLayer(state, unit, p)) return true;
  const owner = tileSeat(t);
  if (t.district === 'CITY_CENTER' && owner !== unit.seat && unitsHostile(state, unit, { seat: owner })) return true;
  return encampmentBlocks(state, t, unit);
}

/** an attack plot (`attackPlot`) no fighter of a player at war holds and no
 *  district at war guards: the order's step onto it is a move that takes
 *  its civilians */
function civiliansAlone(state: GameState, unit: Unit, p: number): boolean {
  const t = state.map.tiles[p];
  const owner = tileSeat(t);
  if (t.district === 'CITY_CENTER' && owner !== unit.seat && unitsHostile(state, unit, { seat: owner })) return false;
  if (encampmentBlocks(state, t, unit)) return false;
  return !state.units.some((u) => u.tileIndex === p && onMap(u) && unitDomain(u.type) === 'military' && unitsHostile(state, unit, u));
}

/** the walk of a path as far as the unit's Movement carries it this turn,
 *  short of a plot it may not end on (but, with `onto`, the plot beside a
 *  plot of civilians its next step takes), a zone of control ending it
 *  (`inEnemyZoc` on the order's destination `dest`, a plot its own stacking
 *  unit or another player's holds at the limit: the count 0x585eb0, another
 *  player's Trader or unit of another map layer none — runs/h1_duely1128
 *  t104: city-state 2's Man-At-Arms 1638405 wanders onto 6:9 under
 *  city-state 3's Trader, t109 its Crossbowman 1769474 onto 9:8 under
 *  player 1's Missionary); true where a step was
 *  refused (the placement 0x587ca0 refusing: the order done, 0x26fe20 at
 *  0x270933). Before a step after its first the kept path's rule (`kept`,
 *  0x272aa0) may ask a search: the walk ends there, `kept.again` set. */
function walk(state: GameState, unit: Unit, path: number[], dest: number, mates: readonly Unit[], onto: number, kept: KeptPath): boolean {
  const { tiles } = state.map;
  // how far its Movement carries it along the path this turn: a formation's,
  // the least its members hold (0x262cd0)
  const full = unit.movesFull ?? unitFullMoves(state, unit);
  let mp = Math.min(unit.movesLeft, ...mates.map((m) => (movesEnded?.has(m.id) ? 0 : m.movesLeft)));
  let from = unit.tileIndex;
  let stop = 0;
  // a shore crossing's Movement past the new domain's full, paid by the next
  // step (the pathfinder's `carry`)
  let carry = 0;
  const embarks = formationEmbarks(state, unit, mates);
  // the step's cost by the formation's +0x398 (0x26fe20 at 0x27021b): one
  // holding a fighter (a member with a Combat, Ranged, Bombard or religious
  // strength, the refresh 0x267650 at 0x2677fa) prices its steps through
  // 0x270be0, no zone of control in it; one holding none through 0x270980,
  // where a step into a zone (0x26f980 on the order's destination) costs at
  // least the Movement it starts with
  const fighter = [unit, ...mates].some((m) => fights(m.type) || unitReligious(m.type));
  // the step that spends the rest so, and the Movement it takes past its cost
  let spendAt = -1;
  let spent = 0;
  for (const p of path) {
    // a plot a unit at war with it holds, passed out of its sight, or a
    // district of hit points at war its path took out of its sight, ends the
    // walk short of it: the order moves one node at a time on a path found
    // afresh (0x962380 -> 0x26fe20 to the node after its start), its first
    // step ending the order unmoved on a defender at war it sees (0x209e30)
    if (attackPlot(state, unit, p)) break;
    const cost = stepCost(state, unit, tiles[from], tiles[p], embarks) + carry;
    if (mp < cost && mp < full) break;
    // a land unit's step across the shore carries, a step off an owned water
    // plot too: the pathfinder prices that step as no crossing, the walk caps
    // the Movement it lands with (`stepUnit`)
    const cross = !UNITS[unit.type]?.naval && !waterWalks(unit.type) && isWater(tiles[from]) !== isWater(tiles[p]);
    const maxTo = domainPool(state, unit, isWater(tiles[p])) * MP_SCALE;
    carry = cross && mp > maxTo ? mp - maxTo : 0;
    mp = Math.max(0, mp - cost);
    stop += 1;
    from = p;
    const zoned = inEnemyZoc(state, p, unit, dest, stackedWith(state, unit, mates, p) || peaceAt(state, unit, p));
    if (zoned && !fighter && mp > 0) {
      spendAt = stop;
      spent = mp;
      mp = 0;
    }
    if (mp <= 0 || zoned) break;
  }
  // a walk whose next step takes a plot of civilians (`onto`) ends on none of
  // its own: the capture is that step's (0x26fe20 -> 0x212500), so it passes
  // the plot beside it whatever stands there
  const through = onto >= 0 && stop === path.length && mp > 0
    && !(mp < stepCost(state, unit, tiles[from], tiles[onto], embarks) + carry && mp < full);
  while (!through && stop > 0 && (stackedWith(state, unit, mates, path[stop - 1]) || peaceAt(state, unit, path[stop - 1]))) stop -= 1;
  // the formation the walk sets out with (unit +0x1fb8): the riders on a
  // plot it passes are another formation's (runs/h1_duely1128 t56: the Scout
  // 3538967 walks over 13:14, Builder Capture's Settler 2228251 stays there
  // with its Slinger)
  // with its escort too: a rider's steps are that escort's on every plot,
  // another of its player's military units on a plot the pair passes is
  // none of its formation (runs/h1_duelp1121 t149: Builder Capture's Builder
  // 4259860 and Bombard 3997700 walk over the Crossbowman 3735574 on 14:19
  // to 14:18)
  const lead = escortOf(state, unit);
  const formed = escortRiders(state, lead ?? unit);
  for (let i = 0; i < stop; i++) {
    if (i > 0) {
      if (kept.goal >= 0 && plotsSeenNow(state, new Set([unit.seat]))[kept.goal] === 1) {
        kept.again = path.length + 1;
        return false;
      }
      if (i === kept.flagged) {
        kept.again = i;
        return false;
      }
    }
    const mover = lead && state.units.includes(lead) && lead.tileIndex === unit.tileIndex ? lead : unit;
    const r = stepUnit(state, mover, tiles[path[i]], formed);
    if (r === 'halted') return false;
    if (r !== 'moved') return true;
  }
  if (stop === spendAt) {
    for (const m of [unit, ...formed]) if (m.tileIndex === unit.tileIndex) m.movesLeft = Math.max(0, m.movesLeft - spent);
  }
  return false;
}

/** a unit that holds its plot: no aircraft, no spy */
function onMap(u: Unit): boolean {
  const d = unitDomain(u.type);
  return d !== 'air' && d !== 'spy';
}

/** a unit of another player at war with the unit's on the plot (0x5862e0) */
export function enemyAt(state: GameState, unit: Unit, tile: number): boolean {
  return state.units.some((u) => u.tileIndex === tile && onMap(u) && unitsHostile(state, unit, u));
}

/** `enemyAt` on the unit's map layer (`mapLayer`: a religious unit's its own, a
 *  Trader's the trade layer) */
function enemyOnLayer(state: GameState, unit: Unit, tile: number): boolean {
  const layer = mapLayer(unit.type);
  return state.units.some((u) => u.tileIndex === tile && onMap(u) && mapLayer(u.type) === layer && unitsHostile(state, unit, u));
}

/** a unit at war with the unit that fights (a Combat, Ranged or Bombard
 *  strength: 0x5861f0's out-flag, 0x523520) holds the plot on the unit's map
 *  layer (the plot's list 0x75c50 of the layer 0x901e0) */
function fighterOnLayer(state: GameState, unit: Unit, tile: number): boolean {
  const layer = mapLayer(unit.type);
  return state.units.some((u) => {
    if (u.tileIndex !== tile || !onMap(u) || mapLayer(u.type) !== layer || !unitsHostile(state, unit, u)) return false;
    const st = aiStrengths(state, u);
    return st.melee > 0 || st.ranged > 0 || st.bombard > 0;
  });
}

/** a unit of another player than the unit's on the plot (an aircraft, a
 *  spy or a Trader on the trade layer holds none) */
function foreignAt(state: GameState, unit: Unit, tile: number): boolean {
  return state.units.some((u) => u.tileIndex === tile && u.seat !== unit.seat && onMap(u) && mapLayer(u.type) !== 'trade');
}

/** `foreignAt` on the unit's map layer (`mapLayer`: a religious unit's its
 *  own, a Trader's the trade layer) */
function foreignOnLayer(state: GameState, unit: Unit, tile: number): boolean {
  const layer = mapLayer(unit.type);
  return state.units.some((u) => u.tileIndex === tile && u.seat !== unit.seat && onMap(u) && mapLayer(u.type) === layer);
}

/** UNITOPERATION_SWAP_UNITS onto `tile` (0x972880; its partner 0x972540):
 *  with a unit of its own stacking with it on the plot beside it, both with
 *  Movement left (0x56c690; one whose moves an order of the pass ended has
 *  none), the unit steps there with its Movement, then the other takes one
 *  step of its own path to the unit's old plot under the order's path flags
 *  (`laterTurns` 0x1000, `danger` 2 / 8), the step's cost spent — the path's
 *  first node where it lies in the first turn, none else (Start 0x972a50:
 *  the partner's formation walked by 0x26fe20, one node a call; runs/h1_duely1128
 *  t174: Hong Kong's Warrior 2490370 on 8:7 swaps onto its centre 9:7 under
 *  Move Unit's 0x100a, 8:7 beside the barbarians on 9:6, so the Warrior
 *  2293764's path to it steps first onto 9:8); none, nothing (runs/h1_duely1128 t146:
 *  Hong Kong's Warrior 2424833 on 9:6 stays beside its centre, whose City
 *  Defense garrison fortified; Bologna t154: its Warrior 2228224 swaps with
 *  the Trebuchet its completed City Defense let go; runs/h1_duely1124 t12:
 *  city-state 4's Warrior 196610 swaps onto 36:7, its Warrior 131073 on
 *  35:7 left one Movement, short of the Marsh 36:8 it wanders to) */
export function swapUnits(state: GameState, pass: Pass, unit: Unit, tile: number, laterTurns = false, danger?: PathDanger): void {
  if (unit.movesLeft <= 0 || pass.ended.has(unit.id) || tile < 0 || plotDistance(state, unit.tileIndex, tile) !== 1) return;
  const from = unit.tileIndex;
  const other = swapPartner(state, pass, unit, tile);
  if (!other) return;
  // the unit's walk onto the partner's plot carries flag 4, which counts no
  // stacking at its destination (0x2720a0 at 0x27229b): another of its own
  // units there that stacks with it keeps it out no more than the partner
  // (runs/h1_duelr1128 t132: city-state 2's Man-At-Arms 1507331 on 9:6
  // swaps onto its centre 9:7 with its garrison, the Warrior 2490370 made
  // there that turn standing on it)
  const held = [other, ...state.units.filter((u) => u !== unit && u !== other && u.tileIndex === tile
    && u.seat === unit.seat && stackClass(u.type) === stackClass(unit.type))];
  for (const u of held) u.tileIndex = from;
  moveTo(state, unit, tile, false);
  for (const u of held) u.tileIndex = tile;
  if (unit.tileIndex !== tile) return;
  const step = pathNodes(state, other, from, laterTurns, true, danger, formationMates(state, other))[0];
  if (!step || step.turns > 1 || step.tile === tile) return;
  stepUnit(state, other, state.map.tiles[step.tile]);
  // the step's zone test on the plot it stands on (0x26fe20 at 0x270800)
  if (zocMoved && other.tileIndex !== tile) {
    if (inEnemyZoc(state, other.tileIndex, other)) zocMoved.add(other);
    else zocMoved.delete(other);
  }
}

/** the plot's own movement cost (the plot's vt +0x18): a city's centre 1,
 *  else its terrain's and feature's */
const plotMoveCost = (t: Tile): number => (t.district === 'CITY_CENTER' ? MP_SCALE : terrainMp(t));

/** THE SWAP'S PARTNER (0x972540): a unit of the unit's player and domain on
 *  the plot (vt +0xc8 on the two types) with Movement left (0x56c690; one
 *  whose moves an order of the pass ended has none) as much as the unit's
 *  plot costs (its vt +0x18) unless at its full Movement (0x56e760), and
 *  each placeable on the other's plot (0x2726b0 flag 4: a goal it sees
 *  where another player's unit at peace stands is none) — runs/h1_duely1128
 *  t174: Hong Kong's Man-At-Arms 1507331 on 10:7 does not swap onto its
 *  centre with the Warrior 2490370 left 1 Movement, 10:7 Woods; its Warrior
 *  2293764 on 9:8, player 1's Trebuchet there, none */
function swapPartner(state: GameState, pass: Pass, unit: Unit, tile: number): Unit | undefined {
  const dom = unitDomain(unit.type);
  const from = state.map.tiles[unit.tileIndex];
  const seen = plotsSeenNow(state, new Set([unit.seat]));
  if (zocMoved?.has(unit) || (seen[tile] === 1 && peaceAt(state, unit, tile))) return undefined;
  return state.units.find((u) => u !== unit && u.tileIndex === tile && u.seat === unit.seat && unitDomain(u.type) === dom
    && u.movesLeft > 0 && !pass.ended.has(u.id) && !zocMoved?.has(u)
    && (u.movesLeft >= plotMoveCost(from) || u.movesLeft >= (u.movesFull ?? unitFullMoves(state, u)))
    && !(seen[unit.tileIndex] === 1 && peaceAt(state, u, unit.tileIndex)));
}

/** a unit of the unit's player on the plot that stacks with it or with a
 *  member of its formation (`mates`), the formation's own units not counted
 *  (0x585eb0: the most 0x585d90 counts over the members) */
function stackedWith(state: GameState, unit: Unit, mates: readonly Unit[], tile: number): boolean {
  if (!mates.length) return stackedAt(state, unit, tile);
  const formation = new Set([unit, ...mates]);
  return [unit, ...mates].some((m) => {
    const cls = stackClass(m.type);
    return state.units.some((u) => !formation.has(u) && u.tileIndex === tile && u.seat === m.seat && stackClass(u.type) === cls
      && !UNITS[u.type]?.trader && cls !== 'spy');
  });
}

/** the class a unit type stacks in (the stacking test 0x585d90's type pair,
 *  vtable +0xb8): Units.xml's FormationClass — a land combat unit, a hull
 *  (NAVAL), a civilian, a support unit — an aircraft or a spy apart; a land
 *  unit embarked keeps its class (runs/h1_duely1124 t82: city-state 3's
 *  Quadrireme 1048577 wanders over 10 plots, among them Granada's centre
 *  41:12 under its Catapult 1245186 and 42:13 under its embarked Heavy
 *  Chariot 1114117, RandCalls.csv) */
function stackClass(type: string): 'civilian' | 'support' | 'military' | 'naval' | 'air' | 'spy' {
  const d = unitDomain(type);
  return d === 'military' && UNITS[type]?.naval ? 'naval' : d;
}

/** a unit of the unit's player on the plot that stacks with it, the unit
 *  itself counted (0x585eb0 -> 0x585d90, `stackClass`): none with
 *  MakeTradeRoute or Spy keeps it out (runs/h1_duely1124 Cardiff t113: its
 *  Builder onto 582 under its Trader, the Farm laid that turn) */
export function stackedAt(state: GameState, unit: Unit, tile: number): boolean {
  const cls = stackClass(unit.type);
  return state.units.some((u) => u.tileIndex === tile && u.seat === unit.seat && stackClass(u.type) === cls
    && !UNITS[u.type]?.trader && cls !== 'spy');
}

/** a unit on the plot keeps the unit out (0x585eb0 -> 0x585d90 over the
 *  plot's units of the unit's map layer, none at war with it): one of its
 *  own that stacks with it (`stackedAt`), or another player's but a Trader
 *  or a Spy, seen or not (runs/h1_duely1117 t176: city-state 2's Line
 *  Infantry wanders over 28 of its 34 plots within 5 of its centre, player
 *  0's Warriors on the other six, RandCalls.csv) */
function keptOut(state: GameState, unit: Unit, tile: number): boolean {
  return stackedAt(state, unit, tile) || peaceAt(state, unit, tile);
}

/** another player's unit not at war with the unit on the plot, of its map
 *  layer (0x585d90's count of another player's units) */
function peaceAt(state: GameState, unit: Unit, tile: number): boolean {
  const layer = mapLayer(unit.type);
  return state.units.some((x) => x.tileIndex === tile && x.seat !== unit.seat && onMap(x) && mapLayer(x.type) === layer
    && !unitsHostile(state, unit, x));
}

/** the hex distance between two plots */
export function plotDistance(state: GameState, a: number, b: number): number {
  const ta = state.map.tiles[a];
  const tb = state.map.tiles[b];
  return hexDistance(state.map, ta.col, ta.row, tb.col, tb.row);
}

/** TargetTypes, as the tactical target list types its entries */
export type TargetType = 'FRIENDLY_CITY' | 'COMBAT_DISTRICT' | 'PASSIVE_DISTRICT' | 'CAMP' | 'GOODY' | 'TRADER' | 'CIVILIAN'
  | 'RELIGIOUS' | 'LOW' | 'MEDIUM' | 'HIGH' | 'IMPROVEMENT';

/** one entry of the tactical target list: its type, its plot, the player it
 *  belongs to (none for a camp, a goody hut or an improvement) and its unit */
export interface Target {
  type: TargetType;
  tile: number;
  seat: number;
  unit: Unit | null;
}

/** BARBARIAN_DEFENSE_ALL_UNITS / BARBARIAN_DEFENSE_RANGED_UNITS (GlobalParameters) */
const BARB_DEFENSE_ALL = 4;
const BARB_DEFENSE_RANGED = 1;

function rangedStrength(u: Unit): number {
  return UNITS[u.type]?.ranged?.strength ?? 0;
}

/**
 * THE TACTICAL TARGET LIST (0x783980) of `seat`: the plots in index order,
 * each one `seen` (visible) giving
 *  - a district of its own as FRIENDLY_CITY; of a player at war a City
 *    Center or an Encampment as COMBAT_DISTRICT (and nothing else of the
 *    plot), a complete unpillaged other district as PASSIVE_DISTRICT;
 *  - its defending unit of a player at war (0x208b80) as LOW;
 *  - else the first of: a barbarian camp, a goody hut, a unit of its trade
 *    layer (a Trader at war a TRADER), the one unit of its units' layer where
 *    another player's (a civilian at war a CIVILIAN, a support unit at war a
 *    LOW), its religious unit at war (RELIGIOUS), an unpillaged improvement
 *    of a player at war (IMPROVEMENT);
 * and each one only `revealed` its camp, goody hut, improvement or districts.
 * Then a LOW unit stacked with a unit that cannot fight is MEDIUM (0x786d50),
 * and the player's prioritization (TacticalAI +0xa8) runs: the barbarians'
 * (0x786e70) make HIGH every LOW or MEDIUM unit within
 * BARBARIAN_DEFENSE_ALL_UNITS of one of their camps, or a ranged one within
 * its range + BARBARIAN_DEFENSE_RANGED_UNITS; every other player's (0x787000)
 * takes each FRIENDLY_CITY entry in list order and makes HIGH each LOW or
 * MEDIUM unit that threatens it — one with a ranged or bombard strength
 * within its range of the plot, any other nearer than twice its Movement.
 * (An ALLY_SUPPORT entry, a district of an ally, makes them MEDIUM: a
 * city-state and the Free Cities hold no ally.)
 */
/** A record ages a turn at each update and drops once its age passes this
 *  (0x5ebb30: the age before the increment above 0x14) */
export const ARMY_RECORD_AGE = 21;

/**
 * THE KNOWLEDGE BASE'S ARMY UPDATE (CivKnowledge, the records 0x5e9530 keeps
 * per player and unit type) of `holder`, a city-state or the barbarians. At
 * the player's tactical turn (`age`: 0x785f30 — the ageing 0x5ebb30, then
 * the look 0x7877e0) every record ages and one past `ARMY_RECORD_AGE`
 * drops; at its turn's end (player signal +0x228 -> 0x7877e0) the look
 * alone. The look: each unit on a plot of `sight` (a stealth unit only
 * where it is seen, `unitVisibleTo`) refreshes its record — the one of its
 * id, under its owner and type (0x5e9530 finds the unit's id in its type's
 * list) — with the turn and its plot, or adds one at the end. Its own units
 * count as any other's. AI_Knowledge.csv's ARMY lines print, per player and
 * type, the records and the oldest's age: runs/h1_duelv1124 minor 3's dead
 * Warrior 131073 stays on its line from t17 to t38; minor 2 sees a
 * barbarian Scout at age 1 at t7 that its Warrior's t6 move brought into
 * view.
 */
export function knowledgeLook(state: GameState, holder: { armyKnown?: ArmyRecord[]; armyAged?: number; enemyCounts?: Record<string, number> },
  seat: number, sight: ArrayLike<number>, age: boolean): void {
  const kept = (holder.armyKnown ?? []).filter((r) => !age || state.turn - r.seen <= ARMY_RECORD_AGE);
  if (age) {
    holder.armyAged = state.turn;
    // the ageing's enemy unit counts (0x5eab80): the players of the game's
    // list (no barbarian) at war with the seat (runs/h1_duely1128 Bologna
    // t203-t208: the barbarian Ranger and Pike and Shot it knows count
    // nothing, its Religious Orders unlogged; player 0's Warrior seen at
    // t207 counts from the t208 ageing, the card 10 from t209 as logged)
    const n: Record<string, number> = {};
    for (const r of kept) {
      if (r.owner === seat || isBarbSeat(r.owner) || !civsAtWar(state, seat, r.owner)) continue;
      n[r.type] = (n[r.type] ?? 0) + 1;
    }
    if (Object.keys(n).length) holder.enemyCounts = n;
    else delete holder.enemyCounts;
  }
  // the look (Targets.cpp 0x7877e0) walks each plot's units of the map's
  // layer 0 (0x75800): a Trader and a religious unit are none of them (no
  // AI_Knowledge.csv ARMY line on runs/h1_duelw1117-1128 names a
  // Missionary, an Apostle or another player's Trader; a city-state's own
  // Trader is on its line from the turn after its birth, its age climbing to
  // 21 — runs/h1_duelw1117 city-state 3's t32 Trader, t33-t53)
  for (const u of state.units) {
    if (!sight[u.tileIndex] || !unitVisibleTo(state, u, seat) || UNITS[u.type]?.trader || (UNITS[u.type]?.religiousStrength ?? 0) > 0) continue;
    const r = kept.find((x) => x.id === u.id && x.type === u.type && x.owner === u.seat);
    if (r) {
      r.seen = state.turn;
      r.plot = u.tileIndex;
      r.damage = UNIT_HP - u.hp;
      setRecordFormation(r, u);
    }
    else kept.push(setRecordFormation({ id: u.id, owner: u.seat, type: u.type, seen: state.turn, plot: u.tileIndex, damage: UNIT_HP - u.hp }, u));
  }
  if (kept.length) holder.armyKnown = kept;
  else delete holder.armyKnown;
  // the tactical turn's targets update (0x783980) logs the ARMY lines here,
  // after the ageing and the look (0x785f30)
  if (age) knowledgeTrace?.(seat, state.turn, kept);
}

let knowledgeTrace: ((seat: number, turn: number, records: readonly ArmyRecord[]) => void) | null = null;
/** REPLAY: each knowledge base as the tactical turn's ageing and look leave
 *  it (the moment AI_Knowledge.csv's ARMY lines are written), with that
 *  turn */
export function traceKnowledge(fn: ((seat: number, turn: number, records: readonly ArmyRecord[]) => void) | null): void {
  knowledgeTrace = fn;
}

/** the barbarians' knowledge base's camps (its ageing where `aged`, its look
 *  0x7877e0 -> 0x5f0110, `lookCamps`) over the plots they see or have
 *  revealed (every plot where they revealed none) */
function barbCampsLook(state: GameState, seen: ArrayLike<number>, aged: boolean): void {
  const ex = state.barbSeat.explored ?? [];
  const camps = lookCamps(state.barbSeat.campsKnown ?? [], (p) => seen[p] === 1 || ex.length === 0 || ex[p] === 1, campTiles(state), aged);
  if (camps.length) state.barbSeat.campsKnown = camps;
  else delete state.barbSeat.campsKnown;
}

/** a player's place in the game's player list (0x483b50): the majors, the
 *  city-states, the Free Cities, the barbarians */
function playerOrder(seat: number): number {
  if (isCityStateSeat(seat)) return 1000 + seat;
  if (seat === FREE_SEAT) return 5000;
  if (isBarbSeat(seat)) return 6000;
  return seat;
}

/**
 * THE KNOWLEDGE BASE'S ENTRIES of the target list (0x783980 after its plot
 * walk; the query 0x5eb8b0 at age 1, distance 2): for each player the
 * player `seat` is at war with, in the game's order, its records by unit
 * type (in the units' table order) then in their order — each record of
 * age exactly 1 (seen at the last look, not at this turn's) whose unit
 * still stands within 2 of the plot recorded: the unit's own plot now,
 * where `seen` does not hold it, a LOW entry for a unit with Combat, else
 * a CIVILIAN one.
 */
function knowledgeEntries(state: GameState, seat: number, seen: ArrayLike<number>, known: readonly ArmyRecord[]): Target[] {
  const me = { seat };
  const order = Object.keys(UNITS);
  const recs = known.map((r, i) => ({ r, i }))
    .filter(({ r }) => state.turn - r.seen === 1 && unitsHostile(state, me, { seat: r.owner }))
    .sort((a, b) => playerOrder(a.r.owner) - playerOrder(b.r.owner)
      || order.indexOf(a.r.type) - order.indexOf(b.r.type) || a.i - b.i);
  const out: Target[] = [];
  for (const { r } of recs) {
    const u = state.units.find((x) => x.id === r.id && x.seat === r.owner && x.type === r.type);
    if (!u || !onMap(u) || plotDistance(state, u.tileIndex, r.plot) > KNOWN_UNIT_RANGE || seen[u.tileIndex]) continue;
    out.push({ type: (UNITS[u.type]?.combat ?? 0) > 0 ? 'LOW' : 'CIVILIAN', tile: u.tileIndex, seat: u.seat, unit: u });
  }
  return out;
}

/** the knowledge base's query's distance (0x5eb8b0's fifth argument) */
const KNOWN_UNIT_RANGE = 2;

export function tacticalTargets(state: GameState, seat: number, seen: ArrayLike<number>, revealed: ArrayLike<number> | null,
  known: readonly ArmyRecord[]): Target[] {
  const { map } = state;
  const out: Target[] = [];
  const at = new Map<number, Unit[]>();
  for (const u of state.units) {
    if (!onMap(u)) continue;
    const l = at.get(u.tileIndex);
    if (l) l.push(u);
    else at.set(u.tileIndex, [u]);
  }
  const me = { seat };
  const hostile = (s: number) => s !== seat && s !== NO_SEAT && unitsHostile(state, me, { seat: s });
  const camps = new Set(state.barbSeat.camps);
  for (const t of map.tiles) {
    const vis = seen[t.index] === 1;
    if (!vis && !(revealed && revealed[t.index] === 1)) continue;
    const owner = tileSeat(t);
    let combat = false;
    if (owner === seat && t.district !== null) {
      out.push({ type: 'FRIENDLY_CITY', tile: t.index, seat, unit: null });
    }
    if (t.district !== null) {
      // a district that defends (0x24c2f0: a city centre, or a district of
      // hit points complete and not pillaged) ends its plot's chain; a
      // pillaged or unbuilt Encampment's plot goes on to its units
      // (runs/h1_duelq1124 t218 / t236: city-state 4's Trader on city-state
      // 3's pillaged Encampment 40:10 is the barbarians' TRADER target)
      combat = t.district === 'CITY_CENTER' || (t.district === 'ENCAMPMENT' && !!t.districtComplete && !t.districtPillaged);
      if (hostile(owner)) {
        if (combat) out.push({ type: 'COMBAT_DISTRICT', tile: t.index, seat: owner, unit: null });
        else if (t.districtComplete && !t.districtPillaged && DISTRICTS[t.district]?.countsTowardLimit) out.push({ type: 'PASSIVE_DISTRICT', tile: t.index, seat: owner, unit: null });
      }
    }
    if (!vis) {
      if (t.district !== null) continue;
      if (camps.has(t.index)) out.push({ type: 'CAMP', tile: t.index, seat: NO_SEAT, unit: null });
      else if (t.goodyHut) out.push({ type: 'GOODY', tile: t.index, seat: NO_SEAT, unit: null });
      else if (t.improvement !== null && !t.pillaged && hostile(owner)) out.push({ type: 'IMPROVEMENT', tile: t.index, seat: NO_SEAT, unit: null });
      continue;
    }
    if (combat) continue;
    const here = at.get(t.index) ?? [];
    const fighters = here.filter((u) => unitDomain(u.type) === 'military' && unitsHostile(state, me, u) && unitVisibleTo(state, u, seat));
    if (fighters.length) {
      const d = stackDefender(state, fighters, false);
      out.push({ type: 'LOW', tile: t.index, seat: d.seat, unit: d });
      continue;
    }
    if (camps.has(t.index)) {
      out.push({ type: 'CAMP', tile: t.index, seat: NO_SEAT, unit: null });
      continue;
    }
    if (t.goodyHut) {
      out.push({ type: 'GOODY', tile: t.index, seat: NO_SEAT, unit: null });
      continue;
    }
    // a unit on the plot's trade layer ends the plot's chain (0x7849bb..
    // 0x784c2b: the layer's list not empty, then the plot's tail whatever it
    // added; runs/h1_duelq1124 t138 the barbarians' captive Builder 5111833
    // on city-state 4's Trader's plot is no CIVILIAN of city-state 3's, its
    // Cuirassiers wandering as logged), each Trader of a player at war
    // walking a route (0x58fc40), not immune to plunder on the plot's ground
    // (0x58fc20 at 0x784b2f: `traderImmune`; runs/h1_duelq1117 t107-109: the
    // barbarian Man-At-Arms 3932182 beside player 1's Trader 1310732 on
    // 33:13 / 34:13 takes no Plunder Trader), an entry
    const traders = here.filter((u) => UNITS[u.type]?.trader);
    if (traders.length) {
      for (const u of traders) {
        if (u.seat !== seat && !!u.routed && unitsHostile(state, me, u) && !traderImmune(state, u.seat, t.index)) {
          out.push({ type: 'TRADER', tile: t.index, seat: u.seat, unit: u });
        }
      }
      continue;
    }
    // the units' map layer holding exactly one unit, another player's, ends
    // the plot's chain (0x784c30..0x784c5f: the layer's list of one, its
    // owner against the player): of the civilian formation class a CIVILIAN
    // at war (a NEUTRAL_CIVILIAN, no entry, at peace), of the support class
    // a LOW at war (0x784e34..0x784e6d), of any other none. A layer of more
    // units, or the player's own one, goes on to the religious unit and the
    // improvement (runs/h1_duelp1121 t127 the barbarians' Man-At-Arms 2949124
    // pillages the Mine on 8:12 under their own Builder 3604504;
    // runs/h1_duelq1117 t87 player 1's Great Admiral made on its Harbor
    // 31:12 under the barbarian Galley 2228229 is no target, the Galleys
    // moving to safety and wandering as logged; runs/h1_duelq1128 t220 /
    // t221 player 1's Observation Balloon 5046292 alone on 42:22,
    // TARGET_LOW_PRIORITY_UNIT in the Cavalry 7012372's Attack Units rows)
    const layer = here.filter((u) => mapLayer(u.type) === 'units');
    if (layer.length === 1 && layer[0].seat !== seat) {
      const u = layer[0];
      const cls = unitDomain(u.type);
      if (unitsHostile(state, me, u) && unitVisibleTo(state, u, seat)) {
        if (cls === 'civilian') out.push({ type: 'CIVILIAN', tile: t.index, seat: u.seat, unit: u });
        else if (cls === 'support') out.push({ type: 'LOW', tile: t.index, seat: u.seat, unit: u });
      }
      continue;
    }
    const rel = here.filter((u) => unitReligious(u.type));
    if (rel.length === 1 && rel[0].seat !== seat) {
      if (unitsHostile(state, me, rel[0])) out.push({ type: 'RELIGIOUS', tile: t.index, seat: rel[0].seat, unit: rel[0] });
      continue;
    }
    if (t.improvement !== null && !t.pillaged && hostile(owner) && !t.goodyHut) {
      out.push({ type: 'IMPROVEMENT', tile: t.index, seat: NO_SEAT, unit: null });
    }
  }
  out.push(...knowledgeEntries(state, seat, seen, known));
  // a unit stacked with one that cannot fight, of the units' map layer
  // (0x786d50 walks the plot's layer-0 list 0x75c50: a Trader or a religious
  // unit on the plot leaves it LOW; runs/h1_duelq1117 t39 player 1's Warrior
  // 1179652 on 33:13 with its Trader 1310732, TARGET_LOW_PRIORITY_UNIT in
  // the barbarian Slinger 1769487's Attack Units row)
  for (const e of out) {
    if (e.type !== 'LOW') continue;
    const here = (at.get(e.tile) ?? []).filter((u) => mapLayer(u.type) === 'units');
    if (here.length > 1 && here.some((u) => !((UNITS[u.type]?.combat ?? 0) > 0) && rangedStrength(u) <= 0)) e.type = 'MEDIUM';
  }
  if (isBarbSeat(seat)) {
    for (const c of out) {
      if (c.type !== 'CAMP') continue;
      for (const e of out) {
        if ((e.type !== 'LOW' && e.type !== 'MEDIUM') || !e.unit) continue;
        const d = plotDistance(state, c.tile, e.tile);
        if (d <= BARB_DEFENSE_ALL) e.type = 'HIGH';
        else if (rangedStrength(e.unit) > 0 && d <= unitAttackRange(e.unit) + BARB_DEFENSE_RANGED) e.type = 'HIGH';
      }
    }
  } else {
    for (const c of out) {
      if (c.type !== 'FRIENDLY_CITY') continue;
      for (const e of out) {
        if ((e.type !== 'LOW' && e.type !== 'MEDIUM') || !e.unit) continue;
        const d = plotDistance(state, e.unit.tileIndex, c.tile);
        const shoots = rangedStrength(e.unit) > 0 || (UNITS[e.unit.type]?.bombard ?? 0) > 0;
        if (shoots ? d <= unitAttackRange(e.unit) : d < 2 * maxMoves(state, e.unit)) e.type = 'HIGH';
      }
    }
  }
  return out;
}

/** the unit's whole Movement in Movement points (0x56e130) */
export function maxMoves(state: GameState, u: Unit): number {
  return Math.floor(unitFullMoves(state, u) / MP_SCALE);
}

/** the unit's attack range: 0 for a unit that fights in melee */
export function rangeOf(u: Unit): number {
  return UNITS[u.type]?.ranged ? unitAttackRange(u) : 0;
}

/** One spot of a planning target (0x790c60): the plot the unit would strike
 *  the target from, the turn the blow would fall on, and the target's
 *  predicted blow back on the unit standing there (0x791470): the damage the
 *  unit takes, the damage the target takes. */
export interface Spot {
  tile: number;
  turns: number;
  backTaken: number;
  backDealt: number;
}

/** One planning target (the planner's 0xd0 entries): the list's target, its
 *  spots (six at most) and the predicted blow from where the unit stands
 *  (0x791470): the damage dealt and taken, and whether the blow dealt the
 *  target's health at least as the planning ran (the kill byte +0xc4). */
export interface PlanEntry {
  target: Target;
  spots: Spot[];
  dealt: number;
  taken: number;
  kills: boolean;
}

/** A unit's planning (AI Unit Planning 0x792c90): its reach, its targets,
 *  and whether a predicted blow of it kills (+0x60). */
export interface Planner {
  reach: Reach[];
  entries: PlanEntry[];
  wins: boolean;
}

/** the targets a unit strikes or takes: a COMBAT_DISTRICT and the unit
 *  targets, TargetTypes CIVILIAN through HIGH (0x790c60 at 0x790f22) */
const UNIT_TARGET = new Set<TargetType>(['CIVILIAN', 'RELIGIOUS', 'TRADER', 'LOW', 'MEDIUM', 'HIGH']);
const STRUCK = new Set<TargetType>(['COMBAT_DISTRICT', ...UNIT_TARGET]);
const FIGHTER_TARGET = new Set<TargetType>(['LOW', 'MEDIUM', 'HIGH']);
/** the unit targets struck only on their own plot (0x790c60 at 0x7910b3) */
const ON_PLOT_TARGET = new Set<TargetType>(['CIVILIAN', 'RELIGIOUS', 'TRADER']);

/** a unit's health in the AI's reckoning (0x56e0d0 less its damage) */
function healthOf(u: Unit): number {
  return u.hp;
}

/** a unit with a strength to fight with (0x56dc90, 0x56e3e0, 0x56daa0) */
function canFight(u: Unit): boolean {
  const def = UNITS[u.type];
  return !!def && (def.combat > 0 || rangedStrength(u) > 0 || def.bombard !== undefined);
}

/** a target's unit, still on the map */
function targetUnit(state: GameState, e: Target): Unit | null {
  return e.unit && state.units.includes(e.unit) ? e.unit : null;
}

/** THE COMBAT PREDICTION (0x791470's simulation, Rules_Combat under the
 *  simulation flag): the blow `attacker` would strike `defender` on `at`
 *  with, from where it stands — the damage it deals and the damage it takes
 *  (none at range, none from an embarked defender; in melee none either way
 *  on a defender of FORMATION_CLASS_CIVILIAN, 0x206960 at 0x206a1f:
 *  runs/h1_duely1128 t37 the City Assault's Warrior 1114128 at 17 hit points
 *  takes player 1's Settler on 16:13, as logged); in melee where both blows
 *  would kill, the side the blow overshoots further falls and the other is
 *  left at 1 hit point, the attacker on a tie (0x206960 at 0x206c34..0x206d62,
 *  as `resolveMutualKill`): runs/h1_duelq1128 t50 the barbarian Archer
 *  2752535 at 23 takes 22 on 17:10 from player 1's Warrior 589828 at 14, the
 *  Warrior 29 (15 over to the Archer's 8), the spot kept by the survival
 *  filter. `stands` is the plot the defender's unit stands on, whose
 *  neighbours flank and support the melee blow (`meleeUnitStrengths`): in
 *  the blow back on a unit set on a spot, the plot the unit has not left
 *  (runs/h1_duelq1128 t30 the barbarian Warrior 2031630 on 14:15, three of
 *  its own beside it and one beside its spot 14:13, keeps that spot against
 *  player 1's Warrior on 15:12 under the exchange filter, Move 14 13 as
 *  logged) */
export function predictBlow(state: GameState, attacker: Unit, defender: Unit, at: number, stands = at): { dealt: number; taken: number } {
  if (rangedStrength(attacker) > 0) {
    const s = rangedUnitStrengths(state, attacker, at, defender);
    return { dealt: damageExpected(s.atk - s.def), taken: 0 };
  }
  if (unitDomain(defender.type) === 'civilian') return { dealt: 0, taken: 0 };
  const s = meleeUnitStrengths(state, attacker, at, defender, stands);
  const dealt = damageExpected(s.atk - s.def);
  const taken = defender.embarked ? 0 : damageExpected(s.def - s.atk);
  const dOver = dealt - healthOf(defender);
  const aOver = taken - healthOf(attacker);
  if (dOver < 0 || aOver < 0) return { dealt, taken };
  return aOver > dOver ? { dealt: healthOf(defender) - 1, taken } : { dealt, taken: healthOf(attacker) - 1 };
}

/**
 * THE PLANNING (AI Unit Planning 0x792c90 -> 0x7920d0, 0x791e00, 0x791470)
 * of one unit at the start of its player's turn:
 *  - its targets (0x792f90): the list's within 2 x its Movement + its range
 *    of it, in the list's order;
 *  - its reach: the breadth-first search of two turns (`reachPlots`), and on
 *    each link it prices the spots (0x790c60, six at most a target, a plot
 *    once) of each unit target or COMBAT_DISTRICT — at range a plot within
 *    the range (in sight beyond 1; a land unit's on land), its turn the
 *    step's, the next where it ends with no Movement or, for a unit that may
 *    not shoot after moving (`movesAndShoots`), where it is not the unit's
 *    own plot; in melee the plot an
 *    attack on the target's plot is linked from, of the attack's turn, and —
 *    where no other player's unit stands on the target's plot (0x790fc9..
 *    0x791016: of the unit's map layer, so a COMBAT_DISTRICT nobody holds or a
 *    religious unit's plot, never another unit's) — a plot beside it
 *    that the step ends on with no Movement (the next turn) or that is the
 *    unit's own (this turn); a civilian's plot taken from the plot it is
 *    linked from; a civilian, a religious unit or a Trader struck only on
 *    its plot;
 *  - per target with a spot the predicted blow from where it stands
 *    (`predictBlow`; a civilian taken 150, a religious unit or a Trader 1.5
 *    x its health, the blow no theological combat), copied to every spot, and per
 *    spot of a fighter the fighter's blow back on it standing there, of a
 *    COMBAT_DISTRICT the city's shot on it there (`predictCityShot`); a blow
 *    that kills marks the planning `wins`.
 */
export function planUnit(state: GameState, unit: Unit, targets: readonly Target[]): Planner {
  const R = rangeOf(unit);
  const lim = maxMoves(state, unit) * PLAN_TURNS + R;
  const naval = !!UNITS[unit.type]?.naval;
  const fights = canFight(unit);
  // a spot it moves to takes the next turn where it may not shoot after
  // moving (0x790c60 at 0x791021..0x79103c, the context's +0x28 0x56dc40)
  const shoots = movesAndShoots(state, unit);
  const entries: PlanEntry[] = [];
  for (const e of targets) {
    if (plotDistance(state, unit.tileIndex, e.tile) > lim) continue;
    entries.push({ target: e, spots: [], dealt: 0, taken: 0, kills: false });
  }
  const { tiles } = state.map;
  const water = (p: number) => isWater(tiles[p]);
  // the targets' plots another player's unit stands on, of any class, on
  // the unit's map layer (the target plot's unit list of the planning's
  // +0x10, 0x901e0, 0x790fc9..0x791016: a religious unit on its own; runs/
  // h1_duely1121 t92 the barbarian Man-At-Arms 3014664 plans 7:13 beside the
  // Apostle 2097152 on 6:13)
  const layer = mapLayer(unit.type);
  const foreign = new Set(entries.filter((E) => state.units.some((u) => u.tileIndex === E.target.tile && u.seat !== unit.seat
    && onMap(u) && mapLayer(u.type) === layer)).map((E) => E.target.tile));
  const reach: Reach[] = [];
  const onLink =(P: number, parent: number, T: number, M: number) => {
    for (const E of entries) {
      const ty = E.target.type;
      if (!STRUCK.has(ty)) continue;
      const TP = E.target.tile;
      const d = plotDistance(state, P, TP);
      let spot = P;
      let turns = T;
      let dd = d;
      let fixed = false;
      let taken = false;
      if (R !== 0 ? ty === 'CIVILIAN' && d === 0 : d === 0) taken = true;
      else if (R === 0 && d === 1 && (M === 0 || P === unit.tileIndex) && !foreign.has(TP)) {
        dd = 0;
        fixed = M !== 0;
      }
      if (taken) {
        if (naval ? !water(P) && tiles[P].district !== 'CITY_CENTER' : water(P)) continue;
        spot = parent;
        fixed = true;
      }
      if (!fixed && (M === 0 || (spot !== unit.tileIndex && !shoots))) turns = T + 1;
      if (dd > R || E.spots.length >= 6) continue;
      if (!naval && (R === 0 ? water(TP) : water(spot))) continue;
      if (dd > 0 && ON_PLOT_TARGET.has(ty)) continue;
      if (E.spots.some((s) => s.tile === spot)) continue;
      if (!fights) continue;
      if (UNIT_TARGET.has(ty) ? !targetUnit(state, E.target) : tiles[TP].district === null) continue;
      if (R > 1 && dd > 1 && !canSee(state.map, tiles[spot], tiles[TP], false)) continue;
      E.spots.push({ tile: spot, turns, backTaken: 0, backDealt: 0 });
    }
  };
  search(state, unit, PLAN_TURNS, false, (n, ground) => {
    // a plot the unit may not stand on it only passes (`stand`), its own
    // plot listed whatever holds it (runs/h1_duelv1117 t115: city-state
    // 3's Crossbowman on 41:13 lists 41:13 first, China's Trader on it by the
    // turn's end); none of ground closed to a city-state, an attack's neither
    // (0x26d890's 0x586900 under 9 -> 0x586360's territory test; runs/
    // h1_duely1127 t70-74: city-state 4's Catapult on 10:10 lists none of
    // 11:10, the barbarian Swordsman's on player 1's ground, AI_Planning.csv)
    if (n.tile === unit.tileIndex || (!ground.closed(n.tile) && (n.attack || (ground.stand(n.tile) && ground.fits(n.tile))))) reach.push({ tile: n.tile, turns: n.turns, moves: n.moves, attack: !!n.attack });
    return false;
  }, entries.length ? onLink : undefined, undefined, false, true);
  let wins = false;
  for (const E of entries) {
    if (!E.spots.length) continue;
    // a city centre's blow (0x791470's district branch at 0x791677: its hit
    // points left, the district's 0x24b290 less 0x24ae50) kills where it
    // tops them (runs/h1_duely1128 t239: the barbarian Cavalry 7012372 and
    // 7077911, more than half their health lost, beside player 0's 42:20 at
    // 52 hit points, their blows 59 / 55, hold and wander, as logged)
    if (E.target.type === 'COMBAT_DISTRICT') {
      const d = districtHealth(state, E.target.tile);
      const x = predictCityExchange(state, unit, E.target.tile);
      E.taken = x.taken;
      if (d && x.dealt > d.hp) wins = true;
      // per spot the city's shot on the unit standing there (the combat
      // simulated with the sides swapped, its location the spot: 0x791470 at
      // 0x7917f7..0x7918f7, the city's strike strength 0x249ee0 never 0),
      // its blow back; the city takes none (runs/h1_duely1128 t242: the hurt
      // Cavalry 7012372 on 42:21, 33 hit points, out of City Attack's
      // assignment by the survival filter, as logged)
      for (const s of E.spots) {
        s.backTaken = predictCityShot(state, unit, E.target.tile, s.tile);
        s.backDealt = 0;
      }
      continue;
    }
    const v = UNIT_TARGET.has(E.target.type) ? targetUnit(state, E.target) : null;
    if (!v) continue;
    const blow = predictBlow(state, unit, v, v.tileIndex);
    E.dealt = E.target.type === 'CIVILIAN' ? CIVILIAN_TAKEN
      : E.target.type === 'RELIGIOUS' || E.target.type === 'TRADER' ? Math.trunc(healthOf(v) * RELIGIOUS_TAKEN) : blow.dealt;
    E.taken = blow.taken;
    E.kills = E.dealt >= healthOf(v);
    if (E.dealt > healthOf(v)) wins = true;
    if (!FIGHTER_TARGET.has(E.target.type)) continue;
    const at = unit.tileIndex;
    for (const s of E.spots) {
      unit.tileIndex = s.tile;
      const back = predictBlow(state, v, unit, s.tile, at);
      unit.tileIndex = at;
      s.backTaken = back.dealt;
      s.backDealt = back.taken;
    }
  }
  return { reach, entries, wins };
}

/** one unit's danger (0x716400): a unit with a bombard strength takes its
 *  combat strength where that tops the bombard less
 *  COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER, else that less; any other the
 *  larger of its combat and ranged strengths */
export function unitDanger(melee: number, ranged: number, bombard: number): number {
  if (bombard > 0) {
    const vs = bombard - COMBAT_BOMBARD_VS_UNIT;
    return melee > vs ? melee : vs;
  }
  return melee > ranged ? melee : ranged;
}

/** a unit's strengths as the AI reads them (0x56dc90(unit, 0), 0x56e3e0,
 *  0x56daa0): combat — an embarked land combat unit's its owner's era's
 *  embarked strength (IsEmbarked, no unit that fights embarked, +0x18c3:
 *  EFFECT_ADJUST_UNIT_FIGHT_WHILE_EMBARKED, the Giant Death Robot's —
 *  runs/h1_duelq1124 t230: player 1's, embarked on 37:16, lays 130 —,
 *  formation class neither SUPPORT nor CIVILIAN) — ranged (none for a unit with a bombard) and bombard, its own
 *  embarked or not; each above 0 with its formation's strength (+0xc90: a
 *  Corps COMBAT_CORPS_STRENGTH_MODIFIER, an Army
 *  COMBAT_ARMY_STRENGTH_MODIFIER, `aiFormed`) */
export function aiStrengths(state: GameState, u: Unit): { melee: number; ranged: number; bombard: number } {
  const d = UNITS[u.type];
  const bombard = aiFormed(u, d?.bombard ?? 0);
  const melee = aiFormed(u, u.embarked && unitDomain(u.type) === 'military' && !waterWalks(u.type) ? embarkedDefenseCS(state, u.seat) : d?.combat ?? 0);
  return { melee, ranged: aiRanged(u), bombard };
}

/** a strength the AI reads with the unit's formation (0x56dc90 at 0x56dd98,
 *  0x56e3e0, 0x56daa0): above 0, plus the formation's (runs/h1_duely1124
 *  t190: city-state 3's Cuirassier Corps 1835008, 40 damage, holds Attack
 *  Barb Camp's strength at 70 = 64 + 10 - 4) */
export function aiFormed(u: Unit, strength: number): number {
  return strength > 0 ? strength + formationCS(u) : strength;
}

/** a unit's ranged strength as the AI reads it (0x56e3e0: Units'
 *  RangedCombat), with its formation's: a siege type's none, its strike on a
 *  unit the engine's Bombard less 17 (runs/h1_duely1117 t129: city-state
 *  3's City Defense garrisons Caguana with its Trebuchet 1441792, its
 *  Bombard 45 less 5 not passed by the Crossbowman 1376257's RangedCombat
 *  40) */
export const aiRanged = (u: Unit): number => (UNITS[u.type]?.bombard ? 0 : aiFormed(u, UNITS[u.type]?.ranged?.strength ?? 0));

/**
 * THE DANGER MAP (InfluenceMap 0x717460, the player's m_influence, a plot
 * read by 0x716a90): per player at war with `seat`, each unit of it the seat
 * sees now with a combat, ranged or bombard strength adds its danger
 * (`unitDanger`) to every plot its one-turn planning search closes from where
 * it stands on its full Movement and may stand on, none another player's
 * unit at peace with it holds in its sight, none but its own of ground closed
 * to it (0x7921e0 -> 0x26df90, no zone of
 * control, its melee attacks included but a ship's onto a land unit, a city
 * it may enter and a city centre or an Encampment it strikes a ship's plot
 * (runs/h1_duelq1117 t131: the barbarian Galley on 14:6 lays its 30 on
 * city-state 2's centre 14:8 in player 0's map): runs/h1_duelv1128 t45 / t80 / t109, a
 * city-state's land unit beside a barbarian Galley and Quadriremes logs the
 * Quadriremes' ranged danger alone; a unit with a range only the plots it
 * reaches with Movement left), and to a second list, each plot once: every other plot within
 * its range (0x56e3d0) of those and — a unit that may coastal raid (+0x18bd,
 * CanRaid) — the land plots beside them (one it reaches too takes the
 * danger twice); an aircraft to the plots within its range. Each district of
 * such a player (`dangerDistricts`) whose plot the seat sees adds its
 * defence on its plot and its strike over its strike's reach, else 1 on each
 * plot beside it (0x715ff0). Then the seat's own districts: each plot of one
 * with a defence 0, each plot their strike covers down by its strength, to 1
 * at least (0x716080). Last, each plot's feature its DangerValue
 * (`featureDanger`). The game builds it once a turn, at the tail of the
 * player's DoTurn (0x4e4560 -> 0x46cdd0), and every read of the turn is of
 * that map (`Seat.dangerOpen`).
 */
export function dangerPlane(state: GameState, seat: number): Int16Array {
  const { map } = state;
  const out = new Int16Array(map.tiles.length);
  const seen = plotsSeenNow(state, new Set([seat]));
  const within = (p: number, r: number) => {
    const t = map.tiles[p];
    return tilesWithin(map, t.col, t.row, r).map((x) => x.index);
  };
  // a hidden unit is seen where the seat or a city-state it is suzerain of
  // sees it (the minor's outgoing visibility, the hidden layer's counts
  // 0x5033a0 -> 0x503320; runs/h1_duelq1124 t204: the barbarian Nuclear
  // Submarine on 30:7 beside city-state 4's Builder on 31:8, its 85 in
  // player 1's map)
  const seers = [seat, ...state.cityStates.filter((cs) => cs.centerIndex >= 0 && suzerainOf(cs) === seat).map((cs) => cs.seat)];
  for (const u of state.units) {
    if (!onMap(u) && unitDomain(u.type) !== 'air') continue;
    if (unitReligious(u.type) || !unitsHostile(state, { seat }, u) || !seen[u.tileIndex] || !seers.some((s) => unitVisibleTo(state, u, s))) continue;
    const st = aiStrengths(state, u);
    if (st.melee <= 0 && st.ranged <= 0 && st.bombard <= 0) continue;
    const s = unitDanger(st.melee, st.ranged, st.bombard);
    const R = rangeOf(u);
    if (unitDomain(u.type) === 'air') {
      for (const p of within(u.tileIndex, R)) out[p] += s;
      continue;
    }
    const reach: number[] = [];
    // its search sets out on its formation's full Movement (0x26df90's
    // start 0x26eea0: `formationFullMoves`), unmoved: a first step dearer
    // than that Movement spends it all (runs/h1_duelq1128 t126: player 1's
    // Courser 2162694 escorting its Settler on 12:6, 2 Movement, lays its 46
    // on the Woods of 12:5 and the hills of 11:6)
    const mates = formationMates(state, u);
    // ...with the Great General's or Admiral's Movement where it stands
    // (GetMaxMoves 0x56e130; runs/h1_duelq1128 t137: player 1's Trebuchet
    // 2490368 beside its Great General on 15:14, maxMoves 3, lays its 35
    // three plots out)
    const whole = Math.min(...[u, ...mates].map((m) => unitFullMoves(state, m) + generalAuraMP(state, m)));
    const full = { ...u, movesLeft: whole, movesFull: whole };
    // a ship's strike onto land is no plot of its reach: the land a ship
    // threatens is the range of its water plots and the cities it may
    // enter (runs/h1_duelq1124 t163: the barbarians' map holds Rome's centre
    // 34:19 at 146, 86 without its two Galleys' 30 each, the Galley 3735561
    // on 34:18 and 917504 on 32:19)
    const naval = !!UNITS[u.type]?.naval;
    search(state, full, 1, false, (n, ground) => {
      // the list (0x26dab0) takes a plot the player sees now only where the
      // unit may stand (+0x50 bit 0x40): none another player's unit at peace
      // with it holds, as the planning's (runs/h1_duelq1127 t216: city-state
      // 3's Galley on 30:19 lists neither 30:18 nor 30:17, player 0's
      // embarked Scouts on them)
      if (!ground.fits(n.tile) || (n.tile !== u.tileIndex && !n.attack && !ground.stand(n.tile))) return false;
      // ...and none of ground closed to the unit, an attack's neither, as
      // the planning's list (the list's location test 0x586900;
      // runs/h1_duelq1117 t88 / t89: city-state 3's Heavy Chariot on 31:16
      // lays no 28 on the barbarian Warrior's 31:15, player 1's ground)
      if (n.tile !== u.tileIndex && ground.closed(n.tile)) return false;
      // a unit with a range lists a plot only with Movement left there to
      // strike from (the list's ranged flag, 0x7921e0 -> 0x791270)
      if (R > 0 && n.moves <= 0) return false;
      if (!naval || !n.attack || isWater(map.tiles[n.tile]) || garrisonDistrict(state, map.tiles[n.tile])) reach.push(n.tile);
      return false;
    }, undefined, 'danger');
    const inReach = new Set(reach);
    const extra: number[] = [];
    const inExtra = new Set<number>();
    for (const p of reach) {
      for (const q of within(p, R)) {
        if (inReach.has(q) || inExtra.has(q)) continue;
        inExtra.add(q);
        extra.push(q);
      }
    }
    if (UNITS[u.type]?.raider) {
      for (const p of reach) {
        for (const q of within(p, 1)) {
          if (q === p || isWater(map.tiles[q]) || inExtra.has(q)) continue;
          inExtra.add(q);
          extra.push(q);
        }
      }
    }
    for (const p of reach) out[p] += s;
    for (const p of extra) out[p] += s;
  }
  const citiesHeld = (h: { seat: number; cities: City[] }) => isCityStateSeat(h.seat)
    ? state.cityStates.filter((cs) => cs.seat === h.seat && cs.centerIndex >= 0).map(minorCity) : h.cities;
  for (const h of [...cityHolders(state), ...state.cityStates]) {
    if (!unitsHostile(state, { seat }, h)) continue;
    for (const c of citiesHeld(h)) {
      for (const d of dangerDistricts(state, c)) {
        if (!seen[d.plot]) continue;
        if (d.def > 0) out[d.plot] += d.def;
        for (const p of within(d.plot, d.strike > 0 ? CITY_STRIKE_RANGE : 1)) if (p !== d.plot) out[p] += d.strike > 0 ? d.strike : 1;
      }
    }
  }
  const own = seatOf(state, seat);
  for (const c of own ? citiesHeld(own) : []) {
    for (const d of dangerDistricts(state, c)) {
      if (d.def > 0) out[d.plot] = 0;
      if (d.strike <= 0) continue;
      for (const p of within(d.plot, CITY_STRIKE_RANGE)) {
        if (p === d.plot || out[p] <= 0) continue;
        out[p] = out[p] - d.strike > 1 ? out[p] - d.strike : 1;
      }
    }
  }
  for (const t of map.tiles) if (t.feature) out[t.index] += featureDanger(t.feature);
  return out;
}

const FEATURE_DANGER = new Map(AI_FEATURES.map((r) => [r.type, r.danger] as const));

/** a feature's DangerValue, every plot of it adds to the danger map last
 *  (0x717e19: the burning Woods and Rainforest 80, the Bermuda Triangle 10) */
export function featureDanger(feature: string): number {
  return FEATURE_DANGER.get(installFeature(feature)) ?? 0;
}

/**
 * A CITY'S DISTRICTS AS THE DANGER MAP READS THEM (the player's district
 * list, +0x1308 -> +0xd8): every district placed, built or not, pillaged or
 * not, its wonders' plots among them (DISTRICT_WONDER), each with its
 * defence (0x24ae80) and undamaged strike (0x249ee0, `cityStrikeBase`) in
 * whole numbers (the 24.8 values shifted down). Only a district with hit points (DistrictInfo +0x58 / +0x5c:
 * the City Center, the Encampment) has a defence, and it strikes only while
 * its own perimeter stands (0x24b960: its outer damage below its maximum):
 * the centre on its city's defence and strike, the Encampment on its city's
 * standing strength with its own plot's garrison (0x24a180 over the best
 * defender there, `districtGarrisonedStrength`) and the city's strike, one
 * not yet built behind its city's whole walls; any other district neither.
 */
export function dangerDistricts(state: GameState, c: City): { plot: number; def: number; strike: number }[] {
  // the strike before any damage: 0x249ee0 reads none (runs/h1_duelq1124
  // t219: Granada's Encampment, its walls 57 down of 400, adds its whole 70
  // to the barbarians' plots about it)
  const strike = Math.floor(cityStrikeBase(state, c));
  const out: { plot: number; def: number; strike: number }[] = [];
  for (const d of c.districts) {
    if (d.type === 'CITY_CENTER') {
      out.push({ plot: d.tileIndex, def: Math.floor(cityDefenseStrength(state, c)), strike: outerPool(state, c) > 0 ? strike : 0 });
    } else if (d.type === 'ENCAMPMENT') {
      const t = state.map.tiles[d.tileIndex];
      // a placed Encampment not yet built stands behind its city's whole
      // walls (runs/h1_duelq1128 t96-103: Xi'an's Encampment on 13:13,
      // unbuilt, outer damage 0 of 100, adds its 40 to the barbarians' plots
      // about it)
      const pool = t.districtComplete ? encampOuterPool(state, c, t) : wallsMax(state, c);
      out.push({ plot: d.tileIndex, def: Math.floor(districtGarrisonedStrength(state, c, d.tileIndex)), strike: pool > 0 ? strike : 0 });
    } else {
      out.push({ plot: d.tileIndex, def: 0, strike: 0 });
    }
  }
  for (const w of c.wonders) out.push({ plot: w.tileIndex, def: 0, strike: 0 });
  return out;
}

/** the predicted damage of taking a civilian (0x791470: 150) */
const CIVILIAN_TAKEN = 150;
/** the predicted damage on a religious unit or a Trader in a blow that is no
 *  theological combat, of its health (0x791470 at 0x79172f..0x791746:
 *  @0xd2f32c 1.5) */
const RELIGIOUS_TAKEN = 1.5;

/** UnitAiTypes: a unit's AI type (unit +0x1c0) */
const AI_EXPLORE = 2;
const AI_COMBAT = 3;
const AI_DEFENDER = 4;

/** a barbarian unit's AI type: its tribe's camp defender DEFENDER while the
 *  camp stands (0x154830 turns the DEFENDER units of a fallen camp's tribe
 *  COMBAT), its scouts EXPLORE, a civilian none, every other its type's own
 *  (`ownMilitaryAi`: runs/h1_duely1128 t239-240 the Rangers 7274504 and
 *  7340037 a tribe raised as units take HL Explore, as logged) */
function aiTypeOf(state: GameState, u: Unit): number {
  if (unitDomain(u.type) !== 'military') return -1;
  const tr = tribeOf(state, u.id);
  if (tr?.alive && tr.defender === u.id) return AI_DEFENDER;
  if (tr?.scouts.includes(u.id)) return AI_EXPLORE;
  return ownMilitaryAi(u.type);
}

/** A UNIT THE TACTICAL PASS TAKES (the tactical unit selector 0x7710f0 over
 *  the units no AI system holds): one of AI type EXPLORE or above, an
 *  explorer (`explorer`, PSEUDOYIELD_UNIT_EXPLORER) at EXPLORE only while
 *  its barbarian tribe rampages; the rest are the homeland's */
function tacticalUnit(state: GameState, u: Unit, ai: number): boolean {
  if (ai < AI_EXPLORE) return false;
  if (ai !== AI_EXPLORE || !UNITS[u.type]?.explorer) return true;
  // another player's explorer has no tribe (+0x11d0 its home city, -1)
  if (!isBarbSeat(u.seat)) return false;
  const tr = tribeOf(state, u.id);
  return !!tr && !tr.alive && tr.rampage !== undefined;
}

/** WANDER NEAR CAMP's radius (0x77b9a0: the plots within 5 of the camp) */
const WANDER_CAMP_RANGE = 5;
/** DEFEND CAMPS' reach (0x779010 -> 0x774e90: within 3 turns) */
const DEFEND_CAMP_TURNS = 3;
/** the planning's breadth-first search (0x7920d0: two turns) */
const PLAN_TURNS = 2;

/** One pass's state: its player, whether a move that ends on a plot it
 *  attacks into strikes it (the barbarians' but their Wander; not a
 *  city-state's or the Free Cities' wander or chase), the units left, each one's planning reach,
 *  those done (`0x570b40`) and those whose moves an order ended (`0x56d6f0`:
 *  their Movement read as none, their rest kept). */
export interface Pass {
  seat: number;
  strike: boolean;
  units: Unit[];
  reach: Map<number, Reach[]>;
  done: Set<number>;
  ended: Set<number>;
  ai: Map<number, number>;
  /** the tactical target list as the pass began, and each unit's planning */
  targets: Target[];
  plan: Map<number, Planner>;
  /** the player's danger map (`dangerPlane`) as its DoTurn built it */
  danger: Int16Array;
  /** the regions of every plot the player revealed as the pass began — the
   *  target list's set (0x783980), its tertiary region list (0x6fad50) */
  regions: Set<number>;
  /** the barbarians' captures the pass's own moves took start at their index
   *  of `GameState.barbCaptures` (undefined outside their pass) */
  capsFrom?: number;
  /** the units a formation of the pass absorbed (`makeMilitaryFormation`):
   *  still on the tactical list, gone from the map */
  absorbed?: Set<Unit>;
  /** the units done as the tactical move under way began: the move's own
   *  stay on the list it walks (0x77d180 lists a unit done, +0x258; the
   *  dispatcher 0x770ce0 takes those off the unit list +0x240 once the move
   *  ends) */
  listedFrom?: Set<number>;
  /** the job (unit +0x7d0) of a unit a running "Upgrade Units" tree holds,
   *  or let go to the pass (0x7d2190) keeping it: the move an operation's
   *  order on it as no member logs */
  jobs?: Map<number, string>;
}

/** the move that took the unit, as the game's tactical log names it, the
 *  plot it went for and the plot it struck (-1 none), for the replay's comparison */
let tacticsTrace: ((unit: Unit, move: string, plot: number, attack: number) => void) | null = null;
export function traceTactics(fn: ((unit: Unit, move: string, plot: number, attack: number) => void) | null): void {
  tacticsTrace = fn;
}

let dangerTrace: ((seat: number, plane: Int16Array) => void) | null = null;
/** REPLAY: each player's danger map as its tactical pass reads it */
export function traceDanger(fn: ((seat: number, plane: Int16Array) => void) | null): void {
  dangerTrace = fn;
}

/** a pass's danger map, the replay's trace shown it: the one the player's
 *  DoTurn built (`holder`'s `Seat.dangerOpen`), else built as the pass
 *  opens (the Free Cities' after their cities' turn, a pass run outside its
 *  player's turn) */
function passDanger(state: GameState, seat: number, holder?: Seat): Int16Array {
  const plane = holder?.dangerOpen ? Int16Array.from(holder.dangerOpen) : dangerPlane(state, seat);
  dangerTrace?.(seat, plane);
  return plane;
}

/** the unit whose move takes the draw being taken, for the replay's hold on
 *  the game's draws; null between draws */
let drawing: Unit | null = null;
export function tacticsDrawing(): Unit | null {
  return drawing;
}

function finish(pass: Pass, u: Unit, move: string, plot = -1, attack = -1): void {
  pass.done.add(u.id);
  tacticsTrace?.(u, move, plot, attack);
}

/** THE HOMELAND'S END TURN (0x70cba0) on a unit whose turn is not done: its
 *  Skip Turn (`skipTurn`, the activity HOLD) */
function endTurn(pass: Pass, u: Unit): void {
  skipTurn(u);
  finish(pass, u, 'HL: End Turn');
}

/** the unit's turn in the pass done by a move outside the pass's own (an
 *  operation's), the plot it went for */
export function passFinish(pass: Pass, u: Unit, move: string, plot: number): void {
  if (!pass.done.has(u.id)) finish(pass, u, move, plot);
}

/** a plot of the unit's planning in the pass (0x791300; `reachAt`), -1 none */
export const passReachAt = (state: GameState, pass: Pass, u: Unit, goal: number, turns: number, moves: boolean, range: number): number =>
  reachAt(state, pass, u, goal, turns, moves, range);

/** the unit's safe plot in the pass (0x716b90; `safePlot`) toward `goal`
 *  (-1 none) with `minMoves` whole Movement left at least, -1 none */
export const passSafePlot = (state: GameState, pass: Pass, u: Unit, goal = -1, minMoves = 0): number =>
  safePlot(state, pass, u, new Set(), goal, minMoves);

/** the Fortify order in the pass (`fortifyOrder`): a unit whose moves an
 *  order ended (`Pass.ended`, 0x56d6f0) has moved, and ticks no more */
export function passFortify(state: GameState, pass: Pass, u: Unit, ticks: 1 | 2): void {
  if (!pass.ended.has(u.id)) fortifyOrder(state, u, ticks);
}

/** MOVE OR FORTIFY (0x773fb0, its flag clear): a unit on the plot takes the
 *  Fortify order, any other the move to it (its moves end after, 0x56d6f0 at
 *  0x7740b6: the order ticks once) */
function moveOrFortify(state: GameState, pass: Pass, u: Unit, plot: number, strike = true): void {
  if (u.tileIndex === plot) passFortify(state, pass, u, 1);
  else moveTo(state, u, plot, strike);
}

/** a unit's turn in the pass ended by a tree's order, with no move logged */
export function passEnd(pass: Pass, u: Unit): void {
  pass.done.add(u.id);
}

/** an operation unit's pillage where it stands (0x963190), its turn done */
export function passPillage(state: GameState, pass: Pass, u: Unit): void {
  if (hostilePillage(state, u)) dropHeldCosts();
  finish(pass, u, 'Operation', u.tileIndex);
}

/** a unit of the pass yet to move; a captor its capture in the pass took
 *  out of it (AI_EVENT_UNIT_CAPTURED joins it to its Builder Capture's
 *  team at once: runs/h1_duely1124 t87 the Archer 3997716 takes the Builder
 *  on 8:7 in Attack Civilian and logs no homeland move) */
const live = (state: GameState, pass: Pass, u: Unit) => !pass.done.has(u.id) && state.units.includes(u) && u.seat === pass.seat
  && !(pass.capsFrom !== undefined && (state.barbCaptures ?? []).slice(pass.capsFrom).some((c) => c.captor === u.id));

/** a unit on the list the move under way walks (0x775340 over +0x240, a dead
 *  unit none): one yet to move as the move began, its turn since done by the
 *  move itself or not (runs/h1_duelp1121 t183: the Line Infantry 4653085's
 *  attack on 3:16 lets the camp's Spearman 1376265 in for the Warrior on
 *  3:18; runs/h1_duelp1117 t75: the Archer 3604497's strike on 9:22 lets the
 *  Spearman 458758 in for the Warrior on 8:23) */
const onList = (state: GameState, pass: Pass, u: Unit) => !(pass.listedFrom ?? pass.done).has(u.id) && state.units.includes(u)
  && u.seat === pass.seat && !(pass.capsFrom !== undefined && (state.barbCaptures ?? []).slice(pass.capsFrom).some((c) => c.captor === u.id));

/**
 * DEFEND CAMPS (0x779010): each camp in plot order, the first DEFENDER in
 * pool order whose planning reaches it within 3 turns (0x774e90) goes to it
 * ("Barb. Camp Defense"), its turn done — unless its planning holds a
 * strike it takes instead (`campStrike`): then it moves to that spot, its
 * moves kept (0x773fb0, the flag set), the order's path over the turns it
 * takes (a spot of the second turn its own unit holds is walked toward, one
 * beside it that its own unit holds is no step), and plunders the Trader or
 * condemns the heretics on its plot, and standing on the spot shoots the
 * target (0x964a40) or goes for the target's plot with the attack flag
 * (0x962190, flag 0x10)
 * (runs/h1_duelq1128 t31-34: the Spearman 589832 of the camp 30:6 goes out
 * to 31:7 for the spot 32:8 its Warrior holds, to 33:8 striking player 4's
 * Archer, and on to 34:9 under "Barb. Camp Defense" rows AT 30:6).
 */
function defendCamps(state: GameState, pass: Pass): void {
  for (const camp of [...state.barbSeat.camps].sort((a, b) => a - b)) {
    const u = pass.units.find((x) => live(state, pass, x) && pass.ai.get(x.id) === AI_DEFENDER
      && !!pass.reach.get(x.id)?.some((e) => e.tile === camp && e.turns <= DEFEND_CAMP_TURNS));
    if (!u) continue;
    const s = campStrike(state, pass, u, camp);
    if (!s) moveOrFortify(state, pass, u, camp);
    else {
      if (s.spot !== u.tileIndex) moveTo(state, u, s.spot, true, true);
      if (state.units.includes(u)) {
        if (s.kind === 'TRADER') plunderTrader(state, u);
        else if (s.kind === 'RELIGIOUS') condemnHeretic(state, u);
        // the strike is pushed on the unit's operations behind the move to
        // the spot (0x772940 at 0x772ece / 0x772f51, the manager's vt +0x60):
        // a unit the move left short of its spot strikes nothing this turn
        // (runs/h1_duelq1121 t160 the Spearman 1376265 on 3:18 for the spot
        // 3:17 its Line Infantry holds stays there, player 0's Warrior on
        // 3:16 unstruck)
        else if (u.tileIndex !== s.spot) { /* the strike waits */ }
        else if (rangeOf(u) > 0) {
          if (state.units.includes(s.unit) && plotDistance(state, u.tileIndex, s.unit.tileIndex) <= unitAttackRange(u)
            && u.movesLeft > 0 && attacksLeftOf(u) > 0) hostileRangedStrike(state, u, s.unit.tileIndex);
        } else if (state.units.includes(s.unit)) moveTo(state, u, s.unit.tileIndex);
      }
    }
    finish(pass, u, 'Barb. Camp Defense', camp);
  }
}

/**
 * THE CAMP DEFENDER'S STRIKE (0x772940 over its planning's targets, in
 * their order), null where it takes none:
 *  - a TRADER or a religious unit on its own plot is taken while no HIGH
 *    target holds a spot or nothing is yet chosen;
 *  - a HIGH target's spot within two turns that leaves the unit alive (the
 *    blow's and the blow back's damage under its health): the first one,
 *    then one dealing more than the choice, or the camp's own plot while the
 *    choice stands off it. A spot is good where the planning's one HIGH
 *    target falls to the blow this turn; else a ranged unit's only on the
 *    camp, a melee one's off the camp only while `out` holds, and only where
 *    the blow back deals nothing or the blow takes no more than the blow
 *    back does.
 * `out` opens as whether some target's first spot has a blow back dealing
 * nothing; each choice sets it to whether its spot is off the camp.
 */
function campStrike(state: GameState, pass: Pass, u: Unit, camp: number): { unit: Unit; spot: number; kind: TargetType } | null {
  const entries = pass.plan.get(u.id)?.entries ?? [];
  const high = entries.filter((E) => E.target.type === 'HIGH' && E.spots.length > 0).length;
  let out = entries.some((E) => E.spots.length > 0 && E.spots[0].backDealt === 0);
  const ranged = rangeOf(u) > 0;
  let pick: { unit: Unit; spot: number; kind: TargetType } | null = null;
  let best = 0;
  for (const E of entries) {
    const ty = E.target.type;
    if ((high === 0 || !pick) && (ty === 'TRADER' || ty === 'RELIGIOUS') && E.target.tile === u.tileIndex && E.target.unit) {
      pick = { unit: E.target.unit, spot: u.tileIndex, kind: ty };
      continue;
    }
    if (ty !== 'HIGH') continue;
    const v = targetUnit(state, E.target);
    for (const s of E.spots) {
      if (s.turns > PLAN_TURNS) continue;
      if (s.backTaken + E.taken >= healthOf(u)) continue;
      if (pick && E.dealt <= best && !(out && s.tile === camp)) continue;
      const kills = high === 1 && E.kills && s.turns === 1;
      if (!kills) {
        if (ranged ? s.tile !== camp : !out && s.tile !== camp) continue;
        if (!ranged && s.backDealt !== 0 && E.taken > s.backTaken) continue;
      }
      if (!v || !onMap(v)) continue;
      pick = { unit: v, spot: s.tile, kind: ty };
      out = s.tile !== camp;
      best = E.dealt;
    }
  }
  return pick;
}

/**
 * PILLAGE (0x77a810, Pillage District then Pillage Improvement): each
 * PASSIVE_DISTRICT target of the list, then each IMPROVEMENT one (0x783980),
 * still pillageable, in the list's order: the units in pool order whose
 * planning reaches it this turn (0x775340 for 1 turn: a DEFENDER listed
 * only ahead of another unit, 0x77551e..0x775534; runs/h1_duelq1128 t38 the
 * camp's Spearman 589832 on 33:10, alone in reach of city-state 4's Farm on
 * 32:10, wanders onto it and leaves it whole) and that do not stand on such a
 * plot themselves (0x774380: for an improvement target a plot with an
 * improvement, for a district target one with any district, GetDistrictType
 * 0x810d0 — `districtPlot`, a wonder's plot among them: runs/h1_duelq1128
 * t176 the Line Infantry 6553608 on player 1's wonder under construction
 * 15:12, three districts in its reach, goes for none and moves to safety)
 * go there, each one's turn done, until one stands
 * on it and pillages it (`hostilePillage`). Both log "Pillage Improvement"
 * (AI_Tactical.csv: 158 of its rows target a PASSIVE_DISTRICT under that
 * name over the five duely duels, none is named otherwise).
 */
function pillage(state: GameState, pass: Pass, districts: boolean): void {
  const { map } = state;
  for (const e of pass.targets) {
    if (e.type !== (districts ? 'PASSIVE_DISTRICT' : 'IMPROVEMENT')) continue;
    const t = map.tiles[e.tile];
    const owner = tileSeat(t);
    if (!isTerritorial(owner) || !unitsHostile(state, { seat: BARB_SEAT }, { seat: owner })) continue;
    const ok = districts
      ? t.district !== null && t.district !== 'CITY_CENTER' && t.district !== 'ENCAMPMENT' && t.districtComplete && !t.districtPillaged
      : t.improvement !== null && !t.pillaged && !!IMPROVEMENTS[t.improvement as ImprovementId];
    if (!ok) continue;
    // the list (0x775340): a camp's DEFENDER goes in only before another unit
    const list: Unit[] = [];
    let held: Unit | null = null;
    for (const u of pass.units) {
      if (!live(state, pass, u) || pass.ai.get(u.id) === undefined || pass.ai.get(u.id)! < AI_EXPLORE) continue;
      if (!pass.reach.get(u.id)?.some((e) => e.tile === t.index && e.turns <= 1)) continue;
      if (pass.ai.get(u.id) === AI_DEFENDER && !list.length) {
        held = u;
        continue;
      }
      if (held) list.push(held);
      held = null;
      list.push(u);
    }
    for (const u of list) {
      if (!live(state, pass, u)) continue;
      if (u.tileIndex !== t.index) {
        const here = map.tiles[u.tileIndex];
        if (!districts && here.improvement !== null) continue;
        if (districts && districtPlot(state, here)) continue;
        moveTo(state, u, t.index);
      }
      const there = u.tileIndex === t.index;
      if (there && hostilePillage(state, u)) {
        dropHeldCosts();
        // the pillage leaves the unit's turn to the homeland, whose End Turn
        // skips it (runs/h1_duelq1121 t33: the Archer 1835022 pillages 5:14,
        // AWAKE, HOLD, its Skip Turn, and its t34 Fortify is refused)
        skipTurn(u);
      }
      finish(pass, u, 'Pillage Improvement', t.index);
      if (there) break;
    }
  }
}

/** a district target's hit points: a City Center's, a major's city or a
 *  city-state's; null for none */
export function districtHealth(state: GameState, tile: number): { max: number; hp: number } | null {
  const held = cityAtIndex(state, tile);
  if (held) return { max: CITY_MAX_HP, hp: held.city.hp };
  const cs = cityStateAt(state, tile);
  return cs && cs.centerIndex === tile ? { max: CITY_MAX_HP, hp: cs.hp ?? CITY_MAX_HP } : null;
}

/** a unit of a player at war with the unit holds the plot to fight it, one
 *  the unit's player sees there now (the best defender 0x208b80 under flags
 *  0 with the attacker's player: 0x20a2a0, the player's visibility count of
 *  the plot and the unit's stealth) (runs/h1_duelq1121 t61 / t140: the
 *  rampaging Quadrireme 786443 on 8:5 for the district 11:4 goes for its
 *  plot, city-state 2's Horseman / player 1's Musketman there out of the
 *  barbarians' sight, its turn done) */
function defenderAt(state: GameState, unit: Unit, p: number): boolean {
  const seen = plotsSeenNow(state, new Set([unit.seat]));
  return seen[p] === 1 && state.units.some((x) => x.tileIndex === p && onMap(x) && unitDomain(x.type) === 'military'
    && unitsHostile(state, unit, x) && unitVisibleTo(state, x, unit.seat));
}

/**
 * AN ATTACK ON A TARGET (0x771670) by the units of the move's list (the
 * tactical object's +0x270, in the order listed), each with Movement left
 * (0x56c690) as its turn comes: whether a fighter holds the target (0x208b80)
 * is read once, as the attack begins. A civilian, a Trader or a religious
 * unit they move onto. At a target a fighter holds, or a City Center or
 * Encampment, each ranged unit strikes from where it stands, else from the
 * first plot of its planning reach of this turn with Movement left within
 * its range and none of its own stacking there (0x585eb0) it moves to first,
 * with none toward the first plot of the target's ring at its range it has a
 * path to (one with no planning stays), its turn done (0x570b40 at
 * 0x771c23); its strike ends its moves (0x56d6f0) and lists it done
 * (0x77d180), a unit that moved and could not strike keeps the Movement it
 * has left. Then each other unit goes for the target's plot with the attack
 * flag (`moveTo`, 0x962030 flag 0x10), its moves ended after (0x56d6f0 at
 * 0x771e67) and listed done (+0x258). A unit none of this took stays on the
 * pass's list for the moves after (runs/h1_duelq1121 t54: the rampaging
 * Quadrireme 786443 on 7:7, with no plot to strike 10:4 from nor a path to
 * its ring, goes on to Attack Units' Archer 655367 and 6:9).
 */
function strike(state: GameState, pass: Pass, listed: readonly Unit[], e: Target): void {
  const T = e.tile;
  const moves = (x: Unit) => state.units.includes(x) && x.movesLeft > 0 && !pass.ended.has(x.id);
  const fight = e.type === 'COMBAT_DISTRICT' || defenderAt(state, listed[listed.length - 1], T);
  if (fight) {
    for (const u of listed) {
      const range = rangeOf(u);
      if (range <= 0 || !moves(u)) continue;
      if (plotDistance(state, u.tileIndex, T) > range && pass.plan.has(u.id)) {
        const spot = (pass.reach.get(u.id) ?? []).find((r) => r.turns === 1 && r.moves > 0 && !r.attack
          && plotDistance(state, r.tile, T) <= range && !stackedOther(state, u, r.tile));
        // with none, the first plot of the target's ring at its range (1 at
        // least; 0x6b1b0 -> 0x691f0) it has a path to (0x272a60 under flags 0
        // from the functor 0x76ecf0), its move order walking toward it
        // (runs/h1_duely1121 t30: the rampaging Quadrireme on 9:1 for the
        // Warrior on 8:6 sails to 8:4; h1_duely1127 t52: the Quadrireme on
        // 32:21 for 35:22 stays, the ring's one plot it reaches, 35:23, its
        // Galley's)
        const to = spot ? spot.tile : ringPlots(state, T, Math.max(1, range))
          .find((p) => plotDistance(state, T, p) === Math.max(1, range) && turnsToPlot(state, u, p, false) > 0);
        if (to !== undefined) {
          moveTo(state, u, to);
          pass.done.add(u.id);
        }
      }
      if (state.units.includes(u) && plotDistance(state, u.tileIndex, T) <= range && u.movesLeft > 0 && attacksLeftOf(u) > 0) {
        hostileRangedStrike(state, u, T);
        pass.ended.add(u.id);
        pass.done.add(u.id);
      }
    }
  }
  for (const u of listed) {
    if (!moves(u) || (fight && rangeOf(u) > 0)) continue;
    moveTo(state, u, T);
    pass.ended.add(u.id);
    pass.done.add(u.id);
  }
}

/** a unit of the unit's player on the plot that stacks with it, the unit
 *  itself not counted */
function stackedOther(state: GameState, unit: Unit, tile: number): boolean {
  const cls = stackClass(unit.type);
  return state.units.some((u) => u !== unit && u.tileIndex === tile && u.seat === unit.seat && stackClass(u.type) === cls);
}

/** the city a rampaging tribe's unit with no target heads for (0x1479e0): of
 *  the cities its raid, then its assault, waited for that the player holds,
 *  the nearest its camp within 16, else the player's nearest (0x93d570) */
const CHASE_RANGE = 16;
function chaseCity(state: GameState, tr: BarbTribe, P: number): number {
  let best = -1;
  let bd = CHASE_RANGE + 1;
  for (const c of [...(tr.raidTargets ?? []), ...(tr.assaultTargets ?? [])]) {
    if (c.seat !== P || !state.map.tiles[c.plot] || tileSeat(state.map.tiles[c.plot]) !== P) continue;
    const d = plotDistance(state, tr.plot, c.plot);
    if (d < bd) { bd = d; best = c.plot; }
  }
  if (best >= 0) return best;
  bd = CHASE_RANGE + 1;
  for (const c of cityCentresOf(state, P)) {
    const d = plotDistance(state, tr.plot, c);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function cityCentresOf(state: GameState, P: number): number[] {
  if (isCityStateSeat(P)) return state.cityStates.filter((c) => c.seat === P && c.centerIndex >= 0).map((c) => c.centerIndex);
  return (seatOf(state, P) as { cities?: { centerIndex: number }[] } | undefined)?.cities?.map((c) => c.centerIndex) ?? [];
}

/**
 * BARBARIAN RAMPAGE (0x778b40): each unit, in pool order, of a tribe whose
 * camp a player's unit took (0x152df0) goes after that player's targets among
 * its planning's: a target it has a spot to strike from before any it has
 * none for, then the nearest it (the list's first of equals). The unit joins
 * the move's list (0x778e28: the tactical object's +0x270, emptied only as
 * the dispatcher 0x770ce0 opens a move), and the target is struck by the
 * whole list as it stands (`strike`): the units before it with Movement
 * left go for it too (runs/h1_duelq1128 t124: the Quadriremes 1769482 on 0:3
 * and 851980 on 1:3, no plot to strike the Warrior on 3:3 from, sail on
 * for 1310739's Man-At-Arms on 4:1, to 2:1 and 4:0). With none, it heads
 * for the city of that player its tribe goes after (`chaseCity`): to the
 * first plot of its reach of this turn within its range (1 at least) of the
 * city with none of its own stacking there (0x775c60), its turn done; with
 * no such plot it stays for the moves after.
 */
function rampage(state: GameState, pass: Pass): void {
  const listed: Unit[] = [];
  for (const u of pass.units) {
    if (!live(state, pass, u)) continue;
    const tr = tribeOf(state, u.id);
    if (!tr || tr.alive || tr.rampage === undefined) continue;
    const P = tr.rampage;
    let best: Target | null = null;
    let bestSpot = false;
    let bestD = 0;
    for (const { target: e, spots } of pass.plan.get(u.id)?.entries ?? []) {
      const spot = spots.length > 0;
      if (e.seat !== P) continue;
      const d = plotDistance(state, e.tile, u.tileIndex);
      if (best && bestSpot && d >= bestD) continue;
      if (spot) {
        best = e; bestSpot = true; bestD = d;
        continue;
      }
      if (best && (bestSpot || bestD <= d)) continue;
      best = e; bestD = d;
    }
    if (best) {
      tacticsTrace?.(u, 'Barbarian Rampage', best.tile, -1);
      listed.push(u);
      strike(state, pass, listed, best);
      continue;
    }
    const city = chaseCity(state, tr, P);
    if (city < 0) continue;
    const r = Math.max(1, rangeOf(u));
    const spot = (pass.reach.get(u.id) ?? []).find((x) => x.turns === 1
      && plotDistance(state, x.tile, city) <= r && !stackedOther(state, u, x.tile));
    if (!spot) continue;
    moveOrFortify(state, pass, u, spot.tile);
    finish(pass, u, 'Chasing target', spot.tile);
  }
}

/** a unit that can still act this turn (0x56c690) */
function canAct(state: GameState, pass: Pass, u: Unit): boolean {
  return live(state, pass, u) && u.movesLeft > 0;
}

/**
 * THE UNITS THAT CAN REACH A PLOT (0x775340), in pool order: each unit left
 * with a strength to fight with whose planning reach holds the plot within
 * `turns` turns; a camp's DEFENDER goes in only before another unit.
 */
function reachers(state: GameState, pass: Pass, plot: number, turns: number): Unit[] {
  const out: Unit[] = [];
  let held: Unit | null = null;
  for (const u of pass.units) {
    if (!onList(state, pass, u)) continue;
    const def = UNITS[u.type];
    if (!def || (def.combat <= 0 && rangedStrength(u) <= 0 && def.bombard === undefined)) continue;
    if (!(pass.reach.get(u.id) ?? []).some((e) => e.tile === plot && e.turns <= turns)) continue;
    if (pass.ai.get(u.id) === AI_DEFENDER && !out.length) {
      held = u;
      continue;
    }
    if (held) {
      out.push(held);
      held = null;
    }
    out.push(u);
  }
  return out;
}

/**
 * ATTACK CIVILIANS (0x779240): each CIVILIAN target of the list, the units
 * whose planning reaches its plot within two turns (`reachers`) go for it in
 * their order (0x773270) — each that can act moves onto it with the attack
 * flag, a melee one's turn then done, until the civilian is taken; then each
 * ranged one within its range strikes it. The target's one row ("Available
 * Units: N") names the first that moves, a ranged one's turn going on
 * (runs/h1_duely1127 t21: the barbarian Slingers 720905 and 1114127 both
 * walk for player 1's Builder on 13:5, the row 720905's, 1114127's turn
 * ended in the homeland; t22 720905 takes it on 14:6, then Chase Target).
 */
function attackCivilians(state: GameState, pass: Pass): void {
  pass.listedFrom = new Set(pass.done);
  for (const e of pass.targets) {
    const v = e.unit;
    // the target's unit by its id, standing (0x7792be..0x7792da): a civilian
    // the pass has captured is a new unit, its entry's a dead one
    // (runs/h1_duelq1128 t25: the raid's Slinger 1441812 takes player 1's
    // Settler on 13:14, the Warrior 2031630 two turns off wanders)
    if (e.type !== 'CIVILIAN' || !v || !state.units.includes(v) || v.seat !== e.seat) continue;
    const at = v.tileIndex;
    const cands = reachers(state, pass, at, PLAN_TURNS);
    if (!cands.length) continue;
    // the target's unit gone (0x773270 at 0x773383..0x77339c: its handle
    // names no live unit): a civilian captured or killed. One a unit's entry
    // only sends off its plot (a Great Person) still stands: the units after
    // take the order for the plot it stood on, a melee one's turn done
    const taken = () => !state.units.includes(v) || v.seat !== e.seat;
    let gone = false;
    let logged = false;
    for (const u of cands) {
      if (!canAct(state, pass, u)) continue;
      if (!logged) tacticsTrace?.(u, 'Attack Civilian', at, -1);
      logged = true;
      moveTo(state, u, at);
      if (rangeOf(u) === 0) finish(pass, u, 'Attack Civilian', at);
      if (taken()) { gone = true; break; }
    }
    if (gone) continue;
    for (const u of cands) {
      if (!canAct(state, pass, u) || rangeOf(u) === 0) continue;
      if (plotDistance(state, u.tileIndex, at) > rangeOf(u)) continue;
      if (attacksLeftOf(u) > 0) hostileRangedStrike(state, u, at);
      finish(pass, u, 'Attack Civilian', at);
    }
  }
  delete pass.listedFrom;
}

/**
 * PLUNDER TRADER (0x77aa20): each TRADER target of the list, the units whose
 * planning reaches its plot this turn (`reachers`) go for it in their order
 * (0x7746a0) — each that can act moves onto it (0x773fb0), then, standing,
 * plunders it where the command may (PLUNDER_TRADE_ROUTE's CanStart and
 * Start: `plunderTrader`, Movement left after the move), its turn done,
 * until one stands on its plot.
 */
function plunderTraders(state: GameState, pass: Pass): void {
  pass.listedFrom = new Set(pass.done);
  for (const e of pass.targets) {
    if (e.type !== 'TRADER') continue;
    for (const u of reachers(state, pass, e.tile, 1)) {
      if (!canAct(state, pass, u)) continue;
      moveTo(state, u, e.tile);
      if (state.units.includes(u)) plunderTrader(state, u);
      finish(pass, u, 'Plunder Trader', e.tile);
      if (state.units.includes(u) && u.tileIndex === e.tile) break;
    }
  }
  delete pass.listedFrom;
}

/**
 * THE HOMELAND'S PLUNDER TRADER (0x70f610, the first move of "Default
 * Barbarian HL"): each TRADER target of the list, each homeland unit left
 * and not yet queued whose plot this turn's search closes on the target's
 * (0x791300: one turn, the plot itself) is queued with it ("Plunder
 * Trader"); the queue carried out as the move ends (0x70a440): each queued
 * unit that can act goes onto its plot (0x962190; the Trader on the trade
 * layer keeps no unit out: runs/h1_duely1124 t138-151 the captured Builder
 * 5111833 on city-state 4's Trader's plots 37:9..33:8), then its queued
 * command, PLUNDER_TRADE_ROUTE, where its CanStart answers (`plunderTrader`:
 * the Builder never), its turn done.
 */
function homelandPlunder(state: GameState, pass: Pass): void {
  const queue: { u: Unit; plot: number }[] = [];
  const queued = new Set<number>();
  for (const e of pass.targets) {
    if (e.type !== 'TRADER') continue;
    for (const u of pass.units) {
      if (!live(state, pass, u) || queued.has(u.id) || u.movesLeft <= 0) continue;
      let hit = false;
      search(state, u, 1, false, (n, ground) => {
        hit = n.tile === e.tile && n.turns <= 1 && ground.stand(n.tile);
        return hit;
      });
      if (!hit) continue;
      queue.push({ u, plot: e.tile });
      queued.add(u.id);
    }
  }
  for (const q of queue) {
    if (!canAct(state, pass, q.u)) continue;
    moveTo(state, q.u, q.plot);
    if (state.units.includes(q.u)) plunderTrader(state, q.u);
    finish(pass, q.u, 'Plunder Trader', q.plot);
  }
}

/**
 * COASTAL RAID (0x7794b0): each IMPROVEMENT, then PASSIVE_DISTRICT target of
 * the list in its order on coastal land, each unit left that may raid
 * (+0x18bd, a raider) whose planning of two turns holds a plot beside it
 * (0x791300 at range 1) is queued with that plot ("Coastal Raid"); the queue
 * carried out (0x7735d0), each entry in its order: a queued unit with
 * Movement left (0x56c690) goes to its plot with the attack flag, as far as
 * its Movement carries it, then raids the target where it may (0x95b100,
 * 0x95b7c0). The carry-out ends no turn and lists no unit done: a unit whose
 * raid failed walks on to its next entry's plot, and the later moves of the
 * pass may still take it; a move its walk leaves short of its plot with
 * Movement left stays on the unit, every later order behind it. A
 * raid ends the raider's moves (0xa4fbc0 at 0xa502b2 -> 0x56d6f0) unless it
 * pillages at the advanced cost (+0x1884).
 */
function coastalRaids(state: GameState, pass: Pass): void {
  const queue: { u: Unit; spot: number; plot: number }[] = [];
  for (const e of pass.targets) {
    if (e.type !== 'IMPROVEMENT' && e.type !== 'PASSIVE_DISTRICT') continue;
    if (!isCoastalLand(state.map, state.map.tiles[e.tile])) continue;
    for (const u of pass.units) {
      if (!live(state, pass, u) || !UNITS[u.type]?.raider) continue;
      const spot = reachAt(state, pass, u, e.tile, PLAN_TURNS, false, 1);
      if (spot >= 0) queue.push({ u, spot, plot: e.tile });
    }
  }
  for (const q of queue) {
    if (!canAct(state, pass, q.u)) continue;
    tacticsTrace?.(q.u, 'Coastal Raid', q.spot, -1);
    if (q.u.tileIndex !== q.spot) moveTo(state, q.u, q.spot);
    if (!state.units.includes(q.u)) continue;
    // a move its walk left short of its plot with Movement left: the order
    // stays on the unit (`moveTo`), every order after it queued behind
    if (q.u.tileIndex !== q.spot && q.u.movesLeft > 0) {
      pass.done.add(q.u.id);
      continue;
    }
    if (!coastalRaid(state, q.u, q.plot)) continue;
    dropHeldCosts();
    if (!(UNITS[q.u.type]?.pillageCost ?? 0)) {
      q.u.movesLeft = 0;
      pass.ended.add(q.u.id);
    }
  }
}

/** ATTACK UNITS' reach of the targets one assignment takes (0x76eb50) */
const ATTACK_TARGETS_RANGE = 5;
/** a target's health in the assignment (0x776140): 1.1 in 24.8 (0x119) of
 *  its whole, less its damage */
const ATTACK_HEALTH_256 = 281;
/** a kill's worth in the gain (0x7702b0) */
const ATTACK_KILL = 100;
/** a barbarian target's worth (0x7702b0, @0xd5aff4) */
const ATTACK_BARB = Math.fround(0.8);

/**
 * THE UNITS THAT CAN STRIKE A PLOT (0x775340 as Attack Units asks it, 2
 * turns): each unit left, in pool order, with a strength to fight with,
 * whose planning reach holds — in melee the plot within two turns, at range
 * a plot exactly its range from it within two turns, with Movement left
 * where it has a ranged strength (a siege unit's Bombard asks none), and
 * none of its own units stacking there unless it is its own (0x78fa10); a
 * camp's DEFENDER goes in only before another unit. With `garrisons` (a
 * target not HIGH, 0x7784b0 at 0x7785ad) a melee unit with no bombard
 * strength standing on a district that defends (a city's centre, an
 * Encampment: DistrictInfo +0x58 / +0x5c) is left out (0x775340 at
 * 0x77541f..0x7754ab).
 */
function strikers(state: GameState, pass: Pass, plot: number, garrisons: boolean): Unit[] {
  const out: Unit[] = [];
  let held: Unit | null = null;
  for (const u of pass.units) {
    if (!onList(state, pass, u) || !canFight(u)) continue;
    if (garrisons && rangeOf(u) === 0 && UNITS[u.type]?.bombard === undefined
      && garrisonDistrict(state, state.map.tiles[u.tileIndex])) continue;
    const reach = pass.reach.get(u.id) ?? [];
    const R = rangeOf(u);
    // Movement left asked of a unit with a ranged strength (0x7754c7..
    // 0x7754e0: GetRangedCombat); a siege unit, its Bombard alone, takes a
    // plot at its range with none (runs/h1_duelq1124 t85-86 city-state 4's
    // Catapult 786437 on 31:8, Attack Units on the barbarian Scout 524295 on
    // 30:11: Move 31 9, its Movement spent on the step, no attack)
    const moves = aiRanged(u) > 0;
    const ok = R === 0
      ? reach.some((e) => e.tile === plot && e.turns <= PLAN_TURNS)
      : reach.some((e) => plotDistance(state, e.tile, plot) === R && e.turns <= PLAN_TURNS && (!moves || e.moves > 0)
        && (!stackedAt(state, u, e.tile) || e.tile === u.tileIndex));
    if (!ok) continue;
    if (pass.ai.get(u.id) === AI_DEFENDER && !out.length) {
      held = u;
      continue;
    }
    if (held) {
      out.push(held);
      held = null;
    }
    out.push(u);
  }
  return out;
}

/** the pass's own job in `jobOf` */
const PASS_JOB = -2;

/** the job a unit is in (unit +0x7d0): its operation's id in its player's
 *  operation manager (the barbarians', a city-state's), a city-state's
 *  "Upgrade Units" tree's id, else the pass's where the pass holds it, else -1
 *  (a unit raised this turn among them) */
function jobOf(state: GameState, pass: Pass, u: Unit): number {
  const cs = isBarbSeat(u.seat) ? undefined : state.cityStates.find((c) => c.seat === u.seat);
  const ai = isBarbSeat(u.seat) ? state.barbSeat.ops : cs?.ops;
  if (ai) for (const o of opsOf(ai)) if (opJobUnits(o).includes(u.id)) return o.id;
  const tree = cs?.upgradeTrees?.find((t) => t.units.includes(u.id));
  if (tree) return tree.id;
  return pass.units.includes(u) ? PASS_JOB : -1;
}

/** one unit's claim on a spot in the assignment: the unit, the target, the
 *  damage it would deal, the turn of the blow, its worth as last weighed */
interface Claim { unit: number; target: number; dealt: number; turns: number; value: number }
interface AssignSpot { tile: number; claims: Claim[]; holder: number; holderTarget: number }
interface AssignTarget { target: Target; unit: Unit | null; health: number; damage: number; units: number[]; barb: boolean }
/** one unit's assignment (0x38 entries): its spot, the plot it strikes (-1
 *  where the blow falls on a later turn), where it stands, its damage; its
 *  flags (0x776140, copied at 0x777045..0x7770e7): +0x33 `civilian` a
 *  CIVILIAN or a TRADER target (no strike), +0x32 `religious` a RELIGIOUS
 *  one, +0x34 `trader` a TRADER */
export interface Assigned { unit: Unit; move: number; attack: number; from: number; damage: number; civilian: boolean; religious: boolean; trader: boolean }

/**
 * THE ASSIGNMENT (0x776140) of `units` to the spots of `targets`:
 *  - each target's health (1.1 x its whole, less its damage): a unit's, a
 *    district's (a City Center's hit points; its blow the predicted one,
 *    `predictCityBlow`, the damage it takes the planning's, `predictCityExchange`);
 *    a unit target whose unit the pass has killed keeps its entry, its
 *    health that of a unit with every hit point lost (0x776333: the lookup
 *    0x8e9d0 -> 0x4f2310 reads the unit's slot, no test of its death), its
 *    claims the planning's and no plot struck (runs/h1_duelq1128 t64: the
 *    Swordsman 3211281 kills player 0's Warrior on 41:20 and advances, the
 *    Archer 3407902 then takes 40:19 at turn 2 against it, no attack; runs/
 *    h1_duelq1124 t16: the Slinger 1310731 keeps 36:17 and its shot at
 *    player 1's Warrior on 35:17, worth 29, over its turn-3 spots 36:21 /
 *    35:21 on player 0's Warrior the operation killed on 36:22, worth 29 / 3);
 *  - per target, each unit with Movement left: its planning's spots (in
 *    order), save — but against a HIGH target — one where the damage it
 *    takes in the blow and the blow back passes the damage it deals in both,
 *    or would kill it; a DEFENDER's only on its own plot, a unit that has
 *    moved only its own plot this turn, and no spot another unit holds that
 *    stacks with it (its own unit of its job with Movement left aside,
 *    `jobOf`; none left to a unit whose moves an order ended: runs/
 *    h1_duelr1124 t22 Granada's City Defense garrison 393218, its moves
 *    ended by Garrison City, keeps the Warrior 327681 off 41:12 for 40:11);
 *    each a claim on
 *    the spot (the spots in the order first claimed);
 *  - the Generalized Assignment (MathAlgorithm_GeneralizedAssignmentProblem
 *    0x8b5bf0, one pass): spot by spot each unit's gain there (`gain`, less
 *    its worth at its own spot), the first largest positive taking it, the
 *    spot's holder let go (`claim`);
 *  - each assigned unit's move: its spot, and the target's plot as the
 *    attack where its claim's blow falls this turn, sorted (0x7704e0).
 */
/** the assignment with its two filters: `exchange` drops a spot where the
 *  damage the unit takes passes the damage it deals, `survive` one where it
 *  would die (0x776140's fifth and sixth arguments); a HIGH target drops
 *  neither */
export function assignTo(state: GameState, pass: Pass, units: Unit[], targets: Target[], exchange: boolean, survive: boolean): Assigned[] {
  const tg: AssignTarget[] = [];
  for (const t of targets) {
    const v = targetUnit(state, t);
    if (v) {
      tg.push({ target: t, unit: v, health: Math.floor(UNIT_HP * ATTACK_HEALTH_256 / 256) - (UNIT_HP - healthOf(v)),
        damage: 0, units: [], barb: isBarbSeat(v.seat) });
      continue;
    }
    if (t.unit) {
      tg.push({ target: t, unit: null, health: Math.floor(UNIT_HP * ATTACK_HEALTH_256 / 256) - UNIT_HP,
        damage: 0, units: [], barb: isBarbSeat(t.seat) });
      continue;
    }
    const d = districtHealth(state, t.tile);
    if (!d) continue;
    tg.push({ target: t, unit: null, health: Math.floor(d.max * ATTACK_HEALTH_256 / 256) - (d.max - d.hp),
      damage: 0, units: [], barb: isBarbSeat(t.seat) });
  }
  const spots: AssignSpot[] = [];
  // a unit's Movement left (+0xdb0), none where an order of the pass ended
  // its moves (0x56d6f0 zeroes it)
  const left = (x: Unit) => (pass.ended.has(x.id) ? 0 : x.movesLeft);
  // the claims in target, unit, spot order (0x776140's outer loop walks the
  // targets)
  tg.forEach((T, k) => {
    units.forEach((u, i) => {
      if (left(u) <= 0) return;
      const p = pass.plan.get(u.id);
      if (!p) return;
      const moved = u.movesLeft < (u.movesFull ?? unitFullMoves(state, u));
      const job = jobOf(state, pass, u);
      const E = p.entries.find((e) => e.target === T.target);
      if (!E) return;
      const dealt = T.target.unit ? E.dealt : predictCityBlow(state, u, T.target.tile);
      for (const s of E.spots) {
        const takes = E.taken + s.backTaken;
        if (T.target.type !== 'HIGH' && ((exchange && takes > dealt + s.backDealt) || (survive && takes > healthOf(u)))) continue;
        if (pass.ai.get(u.id) === AI_DEFENDER && s.tile !== u.tileIndex) continue;
        if (s.turns === 1 && moved && s.tile !== u.tileIndex) continue;
        const cls = stackClass(u.type);
        if (state.units.some((x) => x.tileIndex === s.tile && onMap(x) && x !== T.unit
          && !(x.seat === u.seat && jobOf(state, pass, x) === job && left(x) > 0) && stackClass(x.type) === cls)) continue;
        let sp = spots.find((x) => x.tile === s.tile);
        if (!sp) spots.push((sp = { tile: s.tile, claims: [], holder: -1, holderTarget: -1 }));
        sp.claims.push({ unit: i, target: k, dealt, turns: s.turns, value: 0 });
      }
    });
  });
  // the unit's worth at a spot (0x7702b0)
  const gain = (i: number, j: number): number => {
    let best = 0;
    for (const c of spots[j].claims) {
      if (c.unit !== i) continue;
      const T = tg[c.target];
      const blow = Math.trunc(c.dealt / c.turns);
      if (T.units.includes(i)) return blow + (T.damage >= T.health ? ATTACK_KILL : 0);
      let v = T.damage >= T.health ? T.health - T.damage + ATTACK_KILL : blow;
      if (T.barb) v = Math.trunc(Math.fround(v * ATTACK_BARB));
      c.value = v;
      if (v > best) best = v;
    }
    return best;
  };
  // the unit takes the spot (0x770710): let go of its old one and of the
  // spot's holder, claim its best there; the holder let go returned
  const claim = (i: number, j: number, prev: number): number => {
    if (prev >= 0) {
      for (const c of spots[prev].claims) {
        if (c.unit !== i) continue;
        const T = tg[c.target];
        const at = T.units.indexOf(i);
        if (at < 0) continue;
        T.units.splice(at, 1);
        if (c.turns === 1) T.damage -= c.dealt;
      }
      spots[prev].holder = -1;
      spots[prev].holderTarget = -1;
    }
    const S = spots[j];
    const occ = S.holder;
    if (occ >= 0) {
      const c = S.claims.find((x) => x.unit === occ && x.target === S.holderTarget);
      if (c) {
        const T = tg[c.target];
        const at = T.units.indexOf(occ);
        if (at >= 0) T.units.splice(at, 1);
        if (c.turns === 1) T.damage -= c.dealt;
      }
    }
    let best = S.claims[0];
    for (const c of S.claims.slice(1)) {
      const mine = best.unit !== i;
      if (mine !== (c.unit !== i) ? mine : best.value < c.value) best = c;
    }
    if (best && best.unit === i) {
      const T = tg[best.target];
      T.units.push(i);
      if (best.turns === 1) T.damage += best.dealt;
      S.holder = i;
      S.holderTarget = best.target;
    }
    return occ;
  };
  const at = units.map(() => -1);
  for (let j = 0; j < spots.length; j++) {
    let pick = -1;
    let top = 0;
    for (let i = 0; i < units.length; i++) {
      const w = at[i] === -1 || at[i] === j ? gain(i, j) : gain(i, j) - gain(i, at[i]);
      if (pick < 0 || w > top) { pick = i; top = w; }
    }
    if (pick < 0 || top <= 0 || at[pick] === j) continue;
    const occ = claim(pick, j, at[pick]);
    at[pick] = j;
    if (occ >= 0) at[occ] = -1;
  }
  const out: (Assigned | null)[] = units.map((u, i) => {
    if (at[i] < 0) return null;
    const S = spots[at[i]];
    const c = S.claims.find((x) => x.unit === i && tg[x.target].units.includes(i));
    if (!c) return null;
    const T = tg[c.target];
    return { unit: u, move: S.tile, attack: c.turns === 1 && !(T.target.unit && !T.unit) ? (T.unit ? T.unit.tileIndex : T.target.tile) : -1, from: u.tileIndex,
      damage: UNIT_HP - healthOf(u), civilian: T.target.type === 'CIVILIAN' || T.target.type === 'TRADER',
      religious: T.target.type === 'RELIGIOUS', trader: T.target.type === 'TRADER' };
  });
  return mergeSort(out, (a, b) => assignedBefore(state, a, b)).filter((a): a is Assigned => a !== null);
}

/** the order the assignments run in (0x7704e0): one with a spot before one
 *  without; one whose spot is where the other stands after it, one standing
 *  where the other's spot is before it; else the shorter move, at equal
 *  lengths the less damaged unit, then the lower unit id (the entry's +0x4,
 *  Unit +0x100: the serial in its high half, so the unit made first) */
function assignedBefore(state: GameState, a: Assigned | null, b: Assigned | null): boolean {
  if (!a || !b) return !!a && !b;
  if (a.move === b.from) return false;
  if (a.from === b.move) return true;
  const da = plotDistance(state, a.from, a.move);
  const db = plotDistance(state, b.from, b.move);
  if (da !== db) return da < db;
  if (a.damage !== b.damage) return a.damage < b.damage;
  return a.unit.id < b.unit.id;
}

/** EASTL's merge sort with a buffer (0x76f0f0 -> 0x76f320): halves of n / 2,
 *  each merge taking the second run's head only where it goes strictly first */
function mergeSort<T>(a: T[], before: (x: T, y: T) => boolean): T[] {
  if (a.length < 2) return a.slice();
  const h = a.length >> 1;
  const l = mergeSort(a.slice(0, h), before);
  const r = mergeSort(a.slice(h), before);
  const out: T[] = [];
  let i = 0;
  let k = 0;
  while (i < l.length && k < r.length) out.push(before(r[k], l[i]) ? r[k++] : l[i++]);
  while (i < l.length) out.push(l[i++]);
  while (k < r.length) out.push(r[k++]);
  return out;
}

/**
 * THE ASSIGNMENT CARRIED OUT (0x771f80), in its order: every unit to its
 * spot (a swap with its own unit holding the spot beside it, then — still
 * short of it — the move where no unit at war or of
 * its own stands there); a siege unit strikes its attack; a ranged unit
 * strikes it unless its melee is the stronger and it can reach the plot this
 * turn (neither against a CIVILIAN or TRADER target, the entry's +0x33);
 * then every unit moves onto its attack (the attack flag) — a civilian
 * taken, a fighter struck in melee, a Trader's plot a plain step, its Trader
 * then plundered where the command may (the entry's +0x34,
 * PLUNDER_TRADE_ROUTE: `plunderTrader`); after each strike and each
 * attack move, against a religious target (the entry's +0x32) the unit
 * condemns the heretics on its plot where it may (UNITCOMMAND_CONDEMN_HERETIC
 * 0x947dd0, its CanStart and Start: `condemnHeretic`; runs/h1_duely1124 t136
 * the Caravel 4587523 onto 26:13 kills the embarked Missionary 3407880,
 * t118 the Man-At-Arms 4849682 arrives on 35:16 with no Movement and the
 * Missionary stays); each one's turn done. A unit acts with Movement left,
 * an operation's member whose turn the operation's move already took
 * included (0x771f80 reads the unit's Movement alone: runs/h1_duely1128
 * t241 the City Assault's Cuirassier 7405596 moves to 41:20 under Operation
 * Move and strikes player 0's 42:20 under Operation City Attack, as
 * logged).
 */
function carryOut(state: GameState, pass: Pass, out: Assigned[], move = 'Attack Units'): void {
  const canAct = (u: Unit) => state.units.includes(u) && !pass.ended.has(u.id) && u.movesLeft > 0;
  for (const a of out) {
    const u = a.unit;
    if (!state.units.includes(u) || u.tileIndex === a.move) continue;
    // UNITOPERATION_SWAP_UNITS first (0x972880): with the unit of its own
    // holding the spot beside it; then, short of the spot, the move
    // (UNITOPERATION_MOVE_TO, 0x962030) where no unit at war (0x5862e0) nor
    // of its own stacking with it (0x585eb0) holds the spot; the order (its
    // flags 0, no attack) moves no unit for a spot it would attack into, a
    // hostile city or Encampment (runs/h1_duely1121 t97-103: the raid's
    // Man-At-Arms 2883594 on 6:14 holds for China's city 6:12)
    swapUnits(state, pass, u, a.move);
    if (state.units.includes(u) && u.tileIndex !== a.move && !attackPlot(state, u, a.move) && !stackedAt(state, u, a.move)) {
      moveTo(state, u, a.move);
    }
  }
  const strikeAt = (u: Unit, p: number) => {
    if (p >= 0 && plotDistance(state, u.tileIndex, p) <= unitAttackRange(u) && attacksLeftOf(u) > 0) hostileRangedStrike(state, u, p);
  };
  // the unit's turn done, its move the assignment's (one an operation's
  // move already took keeps that)
  const end = (a: Assigned) => {
    if (!pass.done.has(a.unit.id)) finish(pass, a.unit, move, a.move, a.attack);
  };
  for (const a of out) {
    const u = a.unit;
    if (a.civilian || !canAct(u) || UNITS[u.type]?.bombard === undefined) continue;
    strikeAt(u, a.attack);
    if (a.religious) condemnHeretic(state, u);
    u.movesLeft = 0;
    end(a);
  }
  for (const a of out) {
    const u = a.unit;
    if (a.civilian || !canAct(u) || rangedStrength(u) <= 0) continue;
    const melee = aiStrengths(state, u).melee > rangedStrength(u)
      && !!pass.reach.get(u.id)?.some((e) => e.tile === a.attack && e.turns <= 1);
    if (melee) continue;
    strikeAt(u, a.attack);
    if (a.religious) condemnHeretic(state, u);
    u.movesLeft = 0;
    end(a);
  }
  for (const a of out) {
    const u = a.unit;
    if (!state.units.includes(u)) continue;
    if (a.attack >= 0 && canAct(u)) moveTo(state, u, a.attack);
    if (a.trader && state.units.includes(u)) plunderTrader(state, u);
    if (a.religious && state.units.includes(u)) condemnHeretic(state, u);
    if (state.units.includes(u)) u.movesLeft = 0;
    end(a);
  }
}

/** an operation's attack in the pass: the assignment of the units (in the
 *  order `ids` lists them: an operation's its team's members' list, 0x80ceb0
 *  walking the team's +0x18; runs/h1_duelw1117 t4: city-state 2's Attack Barb
 *  Camp's Warrior 196610, recruited first, claims 12:11 and 131073 takes
 *  13:11, as logged) over the pass's targets `keep` picks (their
 *  units still on the map), `exchange` and `survive` its filters, carried
 *  out (0x771f80); the assignment's entries in its order, which the
 *  operation logs before it carries them out (0x80ceb0 at 0x80d6f9, 0x8109e0
 *  at 0x810ca4, ahead of 0x771f80) */
export function passAttack(state: GameState, pass: Pass, ids: readonly number[], keep: (k: number) => boolean, exchange: boolean,
  survive: boolean, move: string): Assigned[] {
  const units = ids.map((id) => state.units.find((u) => u.id === id)).filter((u): u is Unit => !!u && pass.plan.has(u.id));
  const targets = pass.targets.filter((t, k) => keep(k) && (!t.unit || state.units.includes(t.unit)));
  const out = assignTo(state, pass, units, targets, exchange, survive);
  carryOut(state, pass, out, move);
  return out;
}

/**
 * ATTACK HIGH / MEDIUM / LOW PRIORITY (0x7784b0 with the target type; LOW
 * takes the RELIGIOUS targets too): each target of the type in the list's
 * order, its unit still on the map, the units that can strike its plot
 * (`strikers`) assigned (`assignTo`) over the targets of its type
 * within 5 of it (0x76eb50: by the list's plot, a target the pass has killed
 * among them), and the assignment carried out (`carryOut`).
 */
function attackUnits(state: GameState, pass: Pass, type: TargetType): void {
  pass.listedFrom = new Set(pass.done);
  for (const e of pass.targets) {
    if (e.type !== type && !(type === 'LOW' && e.type === 'RELIGIOUS')) continue;
    const v = targetUnit(state, e);
    if (!v) continue;
    const units = strikers(state, pass, v.tileIndex, type !== 'HIGH');
    if (!units.length) continue;
    const near = pass.targets.filter((t) => t.type === e.type && plotDistance(state, t.tile, v.tileIndex) <= ATTACK_TARGETS_RANGE);
    carryOut(state, pass, assignTo(state, pass, units, near, type !== 'HIGH', type !== 'HIGH'));
  }
  delete pass.listedFrom;
}

/** CHASE TARGET's reach of a target (0x775170, 8 plots) */
const CHASE_SIGHT = 8;

/**
 * CHASE TARGET (0x775670, 0x773030): each land unit left, in pool order,
 * takes the LOW target of the list (0x775170) standing where it does, else
 * the last within 8 of it whose plot its planning reaches within two turns,
 * and moves to the first plot of its reach of this turn within its range (1
 * at least) of the target with none of its own stacking there (0x775c60),
 * its turn done; with no such plot it stays for the moves after.
 */
function chaseTarget(state: GameState, pass: Pass): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || UNITS[u.type]?.naval) continue;
    const reach = pass.reach.get(u.id) ?? [];
    let tgt = -1;
    for (const e of pass.targets) {
      if (e.type !== 'LOW') continue;
      const d = plotDistance(state, e.tile, u.tileIndex);
      if (d === 0) { tgt = e.tile; break; }
      if (d >= CHASE_SIGHT) continue;
      if (reach.some((r) => r.tile === e.tile && r.turns <= PLAN_TURNS)) tgt = e.tile;
    }
    if (tgt < 0) continue;
    const r = Math.max(1, rangeOf(u));
    const spot = reach.find((x) => x.turns === 1 && plotDistance(state, x.tile, tgt) <= r
      && !stackedOther(state, u, x.tile));
    if (!spot) continue;
    moveOrFortify(state, pass, u, spot.tile, pass.strike);
    finish(pass, u, 'Chase Target', tgt);
  }
}

/**
 * WANDER NEAR CAMP (0x77b9a0): each unit of AI type above EXPLORE with
 * Movement left (+0xdb0 at 0x77baa1; runs/h1_duely1124 t86 the Archer
 * 3997716, its Attack Civilian walk to 8:6 spent, logs HL: End Turn) whose
 * camp stands — the plot the player's signals answer for its group
 * (0x771250, `homeOf`: a barbarian tribe's camp): of its planning reach, the
 * plots of this turn with no unit at war with it (0x5862e0), none that keeps
 * it out (0x585eb0, `keptOut`), within 5 of the camp and, where the camp's
 * plot is a city's, of that city's; ONE "Random Direction" draw over their
 * count picks the plot it moves to ("Wander"); with none it heads for its
 * camp ("Wander Back to Camp", its path's later turns free to end on its own
 * stacking unit). Its moves end (0x56d6f0 at 0x77bedd: its formation moves no
 * more, runs/h1_duely1128 t40 the Warrior 1114128's Wander leaves its Settler
 * 3014684 one Movement it cannot spend) and its turn is done.
 */
function wanderNearCamp(state: GameState, pass: Pass, homeOf: (u: Unit) => number): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || (pass.ai.get(u.id) ?? -1) <= AI_EXPLORE) continue;
    const home = homeOf(u);
    if (home < 0 || u.movesLeft <= 0 || pass.ended.has(u.id)) continue;
    const camp = state.map.tiles[home];
    const campCity = tileSeat(camp) === NO_SEAT ? -1 : tileCity(camp);
    const cands = (pass.reach.get(u.id) ?? []).filter((e) => {
      if (e.turns !== 1 || enemyAt(state, u, e.tile) || keptOut(state, u, e.tile)) return false;
      if (plotDistance(state, home, e.tile) > WANDER_CAMP_RANGE) return false;
      const t = state.map.tiles[e.tile];
      return campCity === -1 || (tileSeat(t) === tileSeat(camp) && tileCity(t) === campCity);
    });
    drawing = u;
    const to = cands.length ? cands[randRange(state, cands.length, 'Random Direction')].tile : home;
    drawing = null;
    // the Wander under the order's path flags 0 (0x77bce4), the move back to
    // the camp under 0x1000 (0x77be0b): neither carries the attack flag
    // 0x10, so a plot picked that is a city centre or an Encampment of a
    // player at war is no path and the unit stands (runs/h1_duelq1128 t129:
    // the Man-At-Arms 5570561 on 15:14 draws player 1's Encampment 13:13
    // under its captured Builder; t157 the Musketman 6422533 on 16:5 draws
    // player 1's centre 15:6)
    moveTo(state, u, to, false, !cands.length);
    pass.ended.add(u.id);
    finish(pass, u, cands.length ? 'Wander' : 'Wander Back to Camp', to);
  }
}

/**
 * PROMOTION (0x77ac30): each unit left, in pool order, with a promotion due
 * (0x116f80) takes the AI's pick (`aiPromotionPick`, 0x774970); the
 * promotion ends its turn ("Promote").
 */
function promotion(state: GameState, pass: Pass): void {
  for (const u of pass.units) {
    if (!live(state, pass, u)) continue;
    const k = aiPromotionPick(u);
    if (k < 0 || !takePromotion(u, k)) continue;
    finish(pass, u, 'Promote');
  }
}

/**
 * HEAL (0x779a70, its moves 0x7737c0): each unit left, in pool order, that
 * has taken damage (+0xcf0) is healed where it stands: a unit that may
 * fortify (0x56ef30) takes the Fortify order (0x95eae0 at 0x7739e5, its
 * moves kept: `fortifyOrder`'s two ticks), any other sleeps (0x9686d0);
 * a naval one outside its own
 * territory takes its player's nearest city (the first of equals) and
 * moves there (0x962030) only where the location test (0x586360, flag
 * 0x10) answers 0 — the city's plot refused and no plot within 10 of it
 * found (FindAlternateLocation) — so it holds too (runs/h1_duely1124
 * t93-126 city-state 3's Quadrireme on 38:17, t157-177 its Frigate, t211-221
 * its Battleship). Its turn is done. An embarked unit (0x8be30) or one on a
 * plot of danger (`pass.danger` above 0, 0x716a90) is left.
 */
function heal(state: GameState, pass: Pass): void {
  for (const u of pass.units) {
    if (!live(state, pass, u) || u.hp >= UNIT_HP || !!u.embarked || pass.danger[u.tileIndex] > 0) continue;
    passFortify(state, pass, u, 2);
    finish(pass, u, 'Heal');
  }
}

/** a chassis with a combat, ranged or bombard strength (GetCombat 0x56dc90,
 *  GetRangedCombat 0x56e3e0, GetBombardCombat 0x56daa0 above 0) */
function fights(type: string): boolean {
  const def = UNITS[type];
  return (def?.combat ?? 0) > 0 || (def?.ranged?.strength ?? 0) > 0 || (def?.bombard ?? 0) > 0;
}

/**
 * MAKE MILITARY FORMATION (0x77a190, its moves 0x773e20): each unit left, in
 * pool order, of a chassis that fights, in less than an Army (+0xc90 below 2),
 * not of the air, whose player has the civic of its domain's next formation
 * (0x536da0: the units manager's Corps / Army civics and techs, +0xaa8 ..
 * +0xd48), takes the first unit of its own player and chassis in no
 * formation on the plots beside it — the ring walk's order (`RING_DIRS`,
 * GetRingPlots 0x6b130 at radius 1), each plot's units of its map layer
 * (the functor 0x770670) — and is queued with it, its row logged "Heal"
 * (the move's own log string). The queue is then carried out in its order:
 * where both still stand, the Form Corps command for a unit in no formation,
 * the Form Army command else, under its CanStart (0x94a870 / 0x949930: the
 * partner in no formation; 0x536da0 with the unit: no anti-air strength
 * (0x56d940), a chassis that may form (Units_XP2 CanFormMilitaryFormation),
 * Movement left (0x56c690))
 * merges the partner into the unit (`mergeFormation`), and the unit's turn
 * is done (0x570b40, 0x77d180). The partner stays on the tactical list, off
 * the map (`Pass.absorbed`): Wander Near City still draws for it
 * (runs/h1_duely1117 t152: city-state 4's Bombards 1638405, 1703942 and
 * 1769480 queued, 1638405's Corps takes 1769480, 1703942 wanders to 31:6
 * and 1769480's Wander row draws; 58 Wander rows, 58 Random Direction draws).
 */
function makeMilitaryFormation(state: GameState, pass: Pass): void {
  const queue: [Unit, Unit][] = [];
  for (const u of pass.units) {
    if (!live(state, pass, u) || !fights(u.type) || (u.formation ?? 0) >= FORMATION_MAX || unitDomain(u.type) === 'air') continue;
    if (!formationCivicIn(state, u.seat, !!UNITS[u.type]?.naval, (u.formation ?? 0) + 1)) continue;
    const layer = mapLayer(u.type);
    const at = state.map.tiles[u.tileIndex];
    let partner: Unit | undefined;
    for (const d of RING_DIRS) {
      const t = neighborTile(state.map, at, d);
      partner = t ? state.units.find((x) => x.tileIndex === t.index && mapLayer(x.type) === layer && x.seat === u.seat
        && x.type === u.type && !(x.formation ?? 0)) : undefined;
      if (partner) break;
    }
    if (!partner) continue;
    queue.push([u, partner]);
    tacticsTrace?.(u, 'Heal', -1, -1);
  }
  for (const [u, p] of queue) {
    if (!state.units.includes(u) || !state.units.includes(p) || (p.formation ?? 0) > 0
      || (UNITS[u.type]?.antiAir ?? 0) > 0 || formationBanned(u.type) || u.movesLeft <= 0) continue;
    mergeFormation(state, u, p, (u.formation ?? 0) + 1);
    pass.done.add(u.id);
    (pass.absorbed ??= new Set()).add(p);
  }
}

/**
 * Does the unit on a plot of danger `d` (> 0) flee — MOVE TO SAFETY's test
 * (0x77a4b0), `hl` the homeland's (0x70f3b0)? One with no strength or
 * embarked (0x8be30) does. A hurt one (+0xcf0): a barbarian's (0x56ee80)
 * at sea does; else the tactical one with half its health or less lost
 * (0x56e0d0) where its planning holds no blow that kills (+0x60, none
 * without a planning), the homeland's with a quarter or more lost. A whole
 * barbarian holds; any other whole one flees where `d` tops its strength —
 * the larger of combat and ranged, by 20 (tactical); `unitDanger`, by 15
 * (homeland).
 */
function flees(state: GameState, pass: Pass, u: Unit, d: number, hl: boolean): boolean {
  const st = aiStrengths(state, u);
  const ranged = st.ranged;
  if (st.melee <= 0 && ranged <= 0 && st.bombard <= 0) return true;
  if (u.embarked) return true;
  const barb = isBarbSeat(u.seat);
  const damage = UNIT_HP - u.hp;
  if (damage > 0) {
    if (barb && UNITS[u.type]?.naval) return true;
    if (hl) return 4 * damage >= UNIT_HP;
    if (2 * damage < UNIT_HP) return false;
    return !pass.plan.get(u.id)?.wins;
  }
  if (barb) return false;
  if (hl) return d > unitDanger(st.melee, ranged, st.bombard) + 15;
  return d > Math.max(st.melee, ranged) + 20;
}

/** A plot whose district carries HitPoints (Districts.HitPoints: the city
 *  centre, the Encampment and its replacement), a city-state's centre
 *  included. */
function garrisonDistrict(state: GameState, t: Tile): boolean {
  return t.district === 'ENCAMPMENT' || cityCentre(state, t);
}

/** a plot holding a district (GetDistrictType 0x810d0: the city centre, any
 *  other district placed, a wonder's DISTRICT_WONDER) — the safe plot's fort
 *  test (0x716e13) reads DistrictInfo +0x58, which the Districts loader
 *  (0xabfc20 at 0xabfff5..0xac001b) sets on every row whose HitPoints is not
 *  NULL, the column's default 0 among them */
function districtPlot(state: GameState, t: Tile): boolean {
  return cityCentre(state, t) || !!t.district || !!t.builtWonder;
}

/** a city's centre (IsCity 0x81120) */
function cityCentre(state: GameState, t: Tile): boolean {
  if (t.district === 'CITY_CENTER') return true;
  const cs = cityStateAt(state, t.index);
  return !!cs && cs.centerIndex === t.index;
}

/**
 * THE SAFE PLOT (InfluenceMap 0x716b90) for the unit: of its planning reach,
 * the plots of this turn not `taken` already, none holding a unit that keeps
 * it out (0x585eb0, `keptOut`: one of its own stacking with it, itself
 * counted, or another player's at peace but a Trader or a Spy — runs/
 * h1_duely1127 t88: player 0's Warrior on 29:15 keeps city-state 3's Galley
 * 393216 to 28:17) and no unit at war with it that fights
 * (0x5861f0's out-flag at 0x716d9c, `fighterOnLayer`: a civilian at war
 * keeps no plot out — runs/h1_duelq1121 t234: the barbarians' captive
 * Settler 4587543 on 3:10 takes player 1's Great Writer's 5:13, its order
 * with no path there, and stands), none in fallout (0x2d2100). A FORT is a plot of the player's
 * own territory holding any district or wonder (`districtPlot`: runs/
 * h1_duelq1124 t151 city-state 3's Cuirassier 1835008 takes Granada's
 * Harbor 40:13 over 41:13; t181 a Harbor fort 4 plots off lets the farther
 * 36:14 of equal danger take its place). Against the best so far,
 * the first taken: a fort over any plot but a fort, of two forts the lower
 * danger; a plot of no danger over one of danger, a fort aside; of two of no
 * danger the player's own territory, else the one with less Movement left;
 * of two in danger, on the player's own territory, its own over another's,
 * then the lower danger, then less Movement left, a fort or a plot of no
 * danger kept; off it, with a `goal` (Operation Defend Units' target), one
 * nearer the goal than the best (0x716f9a..0x717007) — taken by a unit that
 * fights (0x56dc90 with 0), else where it is not the goal itself — then the
 * lower danger, then the farther from the unit. A plot with less than
 * `minMoves` whole Movement left there is no candidate (+0xc against the
 * seventh argument << 8). A unit with no combat strength skips a water plot
 * of danger while the best is on land. -1 none.
 */
function safePlot(state: GameState, pass: Pass, u: Unit, taken: ReadonlySet<number>, goal = -1, minMoves = 0): number {
  const plan = pass.plan.get(u.id);
  if (!plan) return -1;
  // its own combat strength, embarked or not (0x56dc90 with 1)
  const noCombat = (UNITS[u.type]?.combat ?? 0) <= 0;
  // its combat strength as the AI reads it (0x56dc90 with 0)
  const fights = aiStrengths(state, u).melee > 0;
  let best = -1;
  let bGoal = -1;
  let bFort = false;
  let bSafe = false;
  let bOwn = false;
  let bWater = false;
  let bDanger = 0;
  let bMoves = 0;
  let bDist = 0;
  for (const r of plan.reach) {
    if (r.turns > 1 || taken.has(r.tile) || r.moves < minMoves * FIX) continue;
    const t = state.map.tiles[r.tile];
    if (irradiated(t)) continue;
    if (keptOut(state, u, r.tile) || fighterOnLayer(state, u, r.tile)) continue;
    const d = pass.danger[r.tile];
    const safe = d <= 0;
    const own = tileSeat(t) === u.seat;
    const fort = own && districtPlot(state, t);
    const water = isWater(t);
    const dist = plotDistance(state, u.tileIndex, r.tile);
    const toGoal = goal >= 0 ? plotDistance(state, r.tile, goal) : -1;
    if (best >= 0) {
      if (!bWater && noCombat && water && d > 0) continue;
      let take: boolean;
      if (fort) take = !bFort || d < bDanger;
      else if (safe && !bFort) take = !bSafe || (own && !bOwn) || r.moves < bMoves;
      else if (own) take = !bFort && !bSafe && (!bOwn || d < bDanger || (d === bDanger && r.moves < bMoves));
      else if (goal >= 0 && (bGoal < 0 || toGoal < bGoal) && (fights || toGoal > 0)) take = true;
      else take = d < bDanger || (d === bDanger && dist > bDist);
      if (!take) continue;
    }
    best = r.tile;
    bGoal = toGoal;
    bFort = fort;
    bSafe = safe;
    bOwn = own;
    bWater = water;
    bDanger = d;
    bMoves = r.moves;
    bDist = dist;
  }
  return best;
}

/**
 * MOVE TO SAFETY (0x77a4b0, its moves 0x774190): each unit left on a plot of
 * danger that flees (`flees`) is listed ("Move to safety", its danger
 * logged), then each in turn goes to its safe plot (`safePlot`, the plots
 * the ones before it took left out), its turn done (0x773fb0); one with no
 * safe plot stays for the moves after.
 */
function moveToSafety(state: GameState, pass: Pass): void {
  const list = pass.units.filter((u) => live(state, pass, u) && pass.danger[u.tileIndex] > 0
    && flees(state, pass, u, pass.danger[u.tileIndex], false));
  const taken = new Set<number>();
  for (const u of list) {
    if (!live(state, pass, u)) continue;
    const p = safePlot(state, pass, u, taken);
    if (p < 0) continue;
    taken.add(p);
    moveOrFortify(state, pass, u, p, false);
    finish(pass, u, 'Move to safety', p);
  }
}

/**
 * THE HOMELAND'S MOVE TO SAFETY (0x70f3b0, each unit 0x70bf90): each unit
 * left on a plot of danger that flees (`flees`, the homeland's test) goes to
 * its safe plot (`safePlot`, the plots the ones before it took left out);
 * with none a barbarian takes the Fortify order where it stands ("Fortify in
 * place", 0x95eae0 at 0x70c2d4 on the move's command list: two ticks), any
 * other stays for the moves after.
 */
function homelandSafety(state: GameState, pass: Pass): void {
  const taken = new Set<number>();
  for (const u of pass.units) {
    if (!live(state, pass, u)) continue;
    const d = pass.danger[u.tileIndex];
    if (d <= 0 || !flees(state, pass, u, d, true)) continue;
    const p = safePlot(state, pass, u, taken);
    if (p >= 0) {
      taken.add(p);
      moveTo(state, u, p, false);
      finish(pass, u, 'HL: Move To Safety', p);
    } else if (isBarbSeat(u.seat)) {
      passFortify(state, pass, u, 2);
      finish(pass, u, 'HL: Move To Safety', u.tileIndex);
    }
  }
}

/** EXPLORE LAND's rounds over the homeland's units (0x70ce90: three at most) */
const EXPLORE_ROUNDS = 3;

/** the plots the player revealed (a city-state's `revealed`, another
 *  player's `explored`; none tracked: every plot) */
function revealedOf(state: GameState, seat: number): (i: number) => boolean {
  const ex = isCityStateSeat(seat) ? state.cityStates.find((c) => c.seat === seat)?.revealed : seatOf(state, seat)?.explored;
  return (i) => !ex || ex.length === 0 || ex[i] === 1;
}

/** the regions of every plot the player revealed: the tactical target
 *  list's set (0x783980), stored as the player's tertiary region list
 *  (0x6fad50) */
function seenRegions(state: GameState, seat: number): Set<number> {
  const revealed = revealedOf(state, seat);
  const out = new Set<number>();
  for (const t of state.map.tiles) if ((t.region ?? -1) >= 0 && revealed(t.index)) out.add(t.region!);
  return out;
}

/** may the explorer go to the plot (0x70bd40): not its own; one its player
 *  revealed; no other player's ground (at war with it only while the turn,
 *  game +0x110, falls short of its knowledge base's +0x128 at 0x70beab — in
 *  no recorded turn: of the barbarians' 1,142 HL Explore targets on
 *  runs/h1_duely1117-1128 none of the plain picks lies on a player's
 *  ground; at peace only through open borders or an alliance, 0x3dab70 /
 *  0x3da560, which no explorer here holds); no unit on it (+0x4c); on its
 *  own area unless it embarks (the barbarians never), a hull on water (a
 *  foreign city centre is a player's ground) */
function exploreOk(state: GameState, u: Unit, p: number, revealed: (i: number) => boolean): boolean {
  if (p === u.tileIndex || !revealed(p)) return false;
  const t = state.map.tiles[p];
  const owner = tileSeat(t);
  if (owner !== NO_SEAT && owner !== u.seat) return false;
  if (state.units.some((x) => x.tileIndex === p && onMap(x))) return false;
  const naval = !!UNITS[u.type]?.naval;
  const here = state.map.tiles[u.tileIndex];
  return (t.area ?? -1) === (here.area ?? -1) || canEmbark(state, u) || (naval && isWater(t));
}

/** the nearest plot the unit's player never revealed that the set takes and
 *  the unit may enter, no unit on it (0x70b6f0, 0x70b550: plots in index
 *  order, the first of equals); -1 none */
function nearestUnrevealed(state: GameState, u: Unit, revealed: (i: number) => boolean, inSet: (t: Tile) => boolean): number {
  const ground = groundOf(state, u, false);
  let best = -1;
  let bd = Infinity;
  for (const t of state.map.tiles) {
    if (!inSet(t) || revealed(t.index)) continue;
    const d = plotDistance(state, u.tileIndex, t.index);
    if (d >= bd || state.units.some((x) => x.tileIndex === t.index && onMap(x)) || !ground.enter(t)) continue;
    best = t.index;
    bd = d;
  }
  return best;
}

/**
 * HL EXPLORE (0x70aa40) for one explorer: of the plots its search of this
 * turn closes (0x26df90 on its Movement left, under `reach`'s flags: Explore
 * Land's 0x40 / 0x42, Naval Patrol's 0) with no danger, none chosen
 * this move and one it may go to (`exploreOk`), the one whose sight (the
 * plots within its sight it sees from there, `losDisk`) holds the most plots
 * its player never revealed (0x70a6c0, the first of equals, above 0; a
 * goody hut's plot holds none); else,
 * on the move's first round, the nearest unrevealed plot of its region
 * where the player has not revealed all of it ("cur region", a path to it
 * existing — 0x272a60, `turnsToPlot`; a unit off any region the nearest of
 * its area, "cur area");
 * else the nearest unrevealed plot of the player's region lists (0x70b6f0,
 * a path to it existing) — the primary and the secondary its cities' (a
 * player with none holds none), the tertiary the regions of the plots it
 * revealed ("tertiary regions"); else the plot whose sight holds the most
 * plots the player does not see now (0x70a8b0, "fallback"). The unit's own
 * plot joins the chosen.
 */
function exploreTarget(state: GameState, pass: Pass, u: Unit, chosen: Set<number>, first: boolean,
  revealed: (i: number) => boolean, seenNow: Uint8Array, reach: 'explore' | 'patrol'): { plot: number; move: string } | null {
  const { map } = state;
  const sight = unitSight(u, state);
  const look = (p: number) => {
    const t = map.tiles[p];
    const sees = losDisk(map, t, sight, false);
    return tilesWithin(map, t.col, t.row, sight).filter((q) => sees.has(q.index)).map((q) => q.index);
  };
  let best1 = -1;
  let v1Best = 0;
  let best2 = -1;
  let v2Best = 0;
  // the first plot whose look holds a revealed route (plot +0x47, 0x70a6c0's
  // second flag) and an unrevealed plot takes the lead once, whatever came
  // before it
  let routeLed = false;
  search(state, u, 1, false, (n, ground) => {
    const p = n.tile;
    if (!ground.stand(p) || pass.danger[p] > 0 || chosen.has(p) || !exploreOk(state, u, p, revealed)) return false;
    const seen = look(p);
    // a goody hut on the plot (revealed, `exploreOk`) counts nothing and
    // flags no route (0x70a6c0 at 0x70a746: 0x82d90)
    const hut = !!map.tiles[p].goodyHut;
    const v1 = hut ? 0 : seen.filter((q) => !revealed(q)).length;
    const v2 = seen.filter((q) => !seenNow[q]).length;
    const route = !hut && seen.some((q) => revealed(q) && (!!map.tiles[q].road || !!map.tiles[q].railroad));
    if (!routeLed && route && v1 > 0) {
      routeLed = true;
      best1 = p;
      v1Best = v1;
    } else if (v1 > v1Best) {
      best1 = p;
      v1Best = v1;
    }
    if (best2 < 0 || v2 > v2Best) {
      best2 = p;
      v2Best = v2;
    }
    return false;
  }, undefined, reach);
  chosen.add(u.tileIndex);
  if (best1 >= 0) return { plot: best1, move: 'HL: Explore' };
  if (!first) return null;
  const here = map.tiles[u.tileIndex];
  const reg = here.region ?? -1;
  if (reg >= 0) {
    if (map.tiles.some((t) => t.region === reg && !revealed(t.index))) {
      const p = nearestUnrevealed(state, u, revealed, (t) => t.region === reg);
      if (p >= 0 && !chosen.has(p) && turnsToPlot(state, u, p) > 0) return { plot: p, move: 'HL: Explore cur region' };
    }
  } else {
    const area = here.area ?? -1;
    const p = nearestUnrevealed(state, u, revealed, (t) => (t.area ?? -1) === area);
    if (p >= 0 && !chosen.has(p) && turnsToPlot(state, u, p) > 0) return { plot: p, move: 'HL: Explore cur area' };
  }
  if (pass.regions.size) {
    const p = nearestUnrevealed(state, u, revealed, (t) => pass.regions.has(t.region ?? -1));
    if (p >= 0 && !chosen.has(p) && turnsToPlot(state, u, p) > 0) return { plot: p, move: 'HL: Explore tertiary regions' };
  }
  return best2 >= 0 ? { plot: best2, move: 'HL: Explore fallback' } : null;
}

/**
 * EXPLORE LAND (0x70ce90): up to three rounds over the homeland's units in
 * pool order, each round's moves carried out together as it ends (0x70a440)
 * and another round only where one moved: each unit of AI type EXPLORE with
 * Movement left and no more than half its health lost — in a later round
 * one standing where its last move was for — takes its target
 * (`exploreTarget`, the fallbacks on the first round alone), the target
 * joining the chosen, and moves to it (0x962030); the move it first took
 * names its turn.
 */
function exploreLand(state: GameState, pass: Pass): void {
  const revealed = revealedOf(state, pass.seat);
  const chosen = new Set<number>();
  const went = new Map<number, number>();
  const firstMove = new Map<Unit, { move: string; plot: number }>();
  for (let round = 1; round <= EXPLORE_ROUNDS; round++) {
    const seenNow = plotsSeenNow(state, new Set([pass.seat]));
    const moves: { u: Unit; plot: number; move: string }[] = [];
    for (const u of pass.units) {
      if (!live(state, pass, u) || pass.ai.get(u.id) !== AI_EXPLORE || u.movesLeft <= 0) continue;
      if (UNIT_HP - u.hp > UNIT_HP >> 1) continue;
      const last = went.get(u.id);
      if (last !== undefined && u.tileIndex !== last) continue;
      const t = exploreTarget(state, pass, u, chosen, round === 1, revealed, seenNow, 'explore');
      if (!t) continue;
      chosen.add(t.plot);
      moves.push({ u, ...t });
    }
    for (const m of moves) {
      moveTo(state, m.u, m.plot, false, false, true, undefined, formationMates(state, m.u), true);
      if (!firstMove.has(m.u)) firstMove.set(m.u, { move: m.move, plot: m.plot });
      went.set(m.u.id, m.plot);
    }
    if (!moves.length) break;
  }
  // each explorer's turn is left to the homeland's End Turn, which skips it
  // (runs/h1_duelq1117-1128: 1,031 barbarian HL: Explore rows, each beside
  // an HL: End Turn and its Skip Turn, the unit HOLD)
  for (const [u, m] of firstMove) {
    skipTurn(u);
    finish(pass, u, m.move, m.plot);
  }
}

/** NAVAL PATROL's move for one of its operation's units (0x803060): HL
 *  Explore's target (`exploreTarget`) on a chosen list of its own, the
 *  fallbacks taken (the first round); its turn done, it moves there */
export function passPatrol(state: GameState, pass: Pass, u: Unit): void {
  const t = exploreTarget(state, pass, u, new Set(), true, revealedOf(state, pass.seat), plotsSeenNow(state, new Set([pass.seat])), 'patrol');
  passFinish(pass, u, 'Operation', t ? t.plot : u.tileIndex);
  if (t) moveTo(state, u, t.plot, false);
}

/** NAVAL PILLAGE's execution (0x803250) over its operation's units (in the
 *  player's unit order): those alive with Movement left listed; then each
 *  listed unit still with Movement left and a planning takes the first of
 *  its planning's targets that is a COMBAT_DISTRICT with a spot (entry
 *  +0x18 read as the spots' count), else — a unit with a range (0x56e3d0)
 *  — the first LOW, MEDIUM or HIGH one; the attack assignment of the whole
 *  list over that one target (0x802cf0: the target list's entries of it;
 *  0x776140 with no exchange filter, the survival filter on) carried out
 *  (0x771f80) */
export function passNavalPillage(state: GameState, pass: Pass, units: readonly Unit[]): void {
  const list = units.filter((u) => state.units.includes(u) && u.movesLeft > 0);
  const ids = list.map((u) => u.id);
  for (const u of list) {
    if (!state.units.includes(u) || u.movesLeft <= 0) continue;
    const plan = pass.plan.get(u.id);
    if (!plan) continue;
    const e = plan.entries.find((x) => x.target.type === 'COMBAT_DISTRICT' && x.spots.length > 0)
      ?? (rangeOf(u) > 0 ? plan.entries.find((x) => FIGHTER_TARGET.has(x.target.type)) : undefined);
    if (!e) continue;
    const k = pass.targets.indexOf(e.target);
    passAttack(state, pass, ids, (j) => j === k, false, true, 'Operation');
  }
}

/** WANDER NEAR CITY's radius (0x77bf50: the plots within 5 of the city) */
const WANDER_CITY_RANGE = 5;
/** the radius FindAlternateLocation searches round the city (0x77bf50 -> 0x585940) */
const WANDER_BACK_RANGE = 3;

/**
 * WANDER NEAR CITY (0x77bf50) for a player of no full civilization (a
 * city-state): each unit left of AI type EXPLORE or above with Movement
 * left (+0xdb0), in pool order: of its planning reach, the plots of this
 * turn within 5 of the player's capital (`home`) with no unit at war with it
 * (0x5862e0) and none that keeps it out (0x585eb0, `keptOut`); ONE "Random
 * Direction" draw over their count picks the plot it moves to ("Wander") —
 * the weights the loop builds are never read. With none it moves to the
 * plot `alternateLocation` finds round the capital ("Wander Back to City",
 * the row naming the capital), else it takes the Fortify order where it
 * stands (0x95eae0 at 0x77c53a, `fortifyOrder`'s one tick). Its moves end (0x56d6f0 at
 * 0x77c62a, after every branch: the queue runs its order no more,
 * runs/h1_duelp1121 t88 city-state 4's Man-At-Arms 1048577 holds on 43:22
 * with 0 Movement after its Wander Back to City step) and its turn is done.
 * A unit a formation absorbed in the pass (`Pass.absorbed`) takes its draw
 * and moves nowhere.
 */
function wanderNearCity(state: GameState, pass: Pass, home: number): void {
  for (const u of pass.units) {
    const ghost = !!pass.absorbed?.has(u) && !pass.done.has(u.id);
    if (!(ghost || live(state, pass, u)) || (pass.ai.get(u.id) ?? -1) < AI_EXPLORE || u.movesLeft <= 0) continue;
    const cands = (pass.reach.get(u.id) ?? []).filter((e) => e.turns === 1
      && plotDistance(state, home, e.tile) <= WANDER_CITY_RANGE && !enemyAt(state, u, e.tile) && !keptOut(state, u, e.tile));
    if (cands.length) {
      drawing = u;
      const to = cands[randRange(state, cands.length, 'Random Direction')].tile;
      drawing = null;
      if (!ghost) moveTo(state, u, to, pass.strike);
      pass.ended.add(u.id);
      finish(pass, u, 'Wander', to);
      continue;
    }
    const to = alternateLocation(state, u, home, WANDER_BACK_RANGE);
    if (to >= 0) moveTo(state, u, to, pass.strike, true);
    else if (!ghost) passFortify(state, pass, u, 1);
    pass.ended.add(u.id);
    finish(pass, u, 'Wander Back to City', home);
  }
}

/**
 * FIND ALTERNATE LOCATION (Unit_Placement 0x585940) for the unit round
 * `plot`: the plots within `range` of it (0x1e000) — the game's axial steps
 * (dx, dy) over -range..range, dx the outer — that the unit may enter
 * (0x586360: its ground, `groundOf`), where of the plot's units of its map
 * layer (0x75c50) no other player's stands and none of its own that stacks
 * with it — another's Trader keeps it out of no plot (runs/h1_duelp1128
 * t174: Hong Kong's Warrior 2293764 off player 1's unit on 9:8 to 8:8
 * under city-state 3's Trader); the nearest `plot` wins, a plot
 * of another area than `plot`'s counted three times as far, the first of
 * equals; with `skipOrigin` (its fourth argument) `plot` itself is none.
 * -1 none.
 */
function alternateLocation(state: GameState, unit: Unit, plot: number, range: number, skipOrigin = false): number {
  const { map } = state;
  const at = map.tiles[plot];
  const [q0, r0] = offsetToAxial(at.col, at.row);
  const ground = groundOf(state, unit);
  const dom = unitDomain(unit.type);
  const layer = mapLayer(unit.type);
  let best = -1;
  let bestScore = Infinity;
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const n = (dx < 0) !== (dy < 0) && dx !== 0 && dy !== 0 ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx) + Math.abs(dy);
      if (n > range || (skipOrigin && dx === 0 && dy === 0)) continue;
      const [c, r] = axialToOffset(q0 + dx, r0 + dy);
      const t = tileAt(map, c, r);
      if (!t || !ground.known(t.index) || !ground.enter(t)) continue;
      if (state.units.some((o) => o !== unit && o.tileIndex === t.index && onMap(o) && mapLayer(o.type) === layer
        && (o.seat !== unit.seat || unitDomain(o.type) === dom))) continue;
      let score = plotDistance(state, plot, t.index);
      if ((t.area ?? -1) !== (at.area ?? -1)) score *= 3;
      if (score < bestScore) {
        bestScore = score;
        best = t.index;
      }
    }
  }
  return best;
}

/** the radius the turn's stacking check searches round a crowded plot
 *  (0x775e50 -> 0x585940) */
const UNSTACK_RANGE = 10;

/** another unit on the unit's plot keeps it out (0x585d90's count over the
 *  plot's units of its map layer above the unit itself): one of its own of
 *  its stacking class, or another player's not at war with it, a Trader or
 *  a Spy none */
function crowded(state: GameState, u: Unit): boolean {
  const layer = mapLayer(u.type);
  const cls = stackClass(u.type);
  return state.units.some((x) => x !== u && x.tileIndex === u.tileIndex && onMap(x) && mapLayer(x.type) === layer
    && !UNITS[x.type]?.trader && (x.seat === u.seat ? stackClass(x.type) === cls : !unitsHostile(state, u, x)));
}

/**
 * THE TURN'S STACKING CHECK (Tactical.cpp 0x775e50, which the tactical AI's
 * setup 0x775870 binds to player signal +0x228 ahead of the knowledge
 * base's end look; an AI player's alone): over the player's units in its
 * list's order (`slot`), a Trader and a Spy none, each on a plot another
 * unit keeps it out of (`crowded`) goes, with its formation (0x587ca0), to
 * the plot FindAlternateLocation finds within 10 of it, its own plot none
 * (`alternateLocation`'s `skipOrigin`); one with none is deleted after the
 * walk (the delete command 0x9483a0, which refuses a damaged unit). A unit
 * a city made on its centre stands there until its player's turn ends
 * (`spawnUnit`'s 'stack'); a unit made in the turn holds the list slot it
 * took at its making (`poolSlots`). runs/h1_duelp1128 t187: city-state 3's
 * Scout 2752515 made on 4:9 in slot 3, its Field Cannon 2555910 (slot 6)
 * swapped onto it, the Scout to 4:10; t177 its Man-At-Arms 1179650 (slot
 * 2) off its centre to 3:9 beside the Field Cannon 2424841 made there (slot
 * 9); runs/h1_duelp1124 t21 Granada's Warrior 327681 (slot 1) to 40:12
 * beside the Warrior 393218 its turn made there (slot 2); runs/h1_duelp1117
 * t196 city-state 4's Scout 3014658 (slot 2) off 32:5 to 31:5; each in the
 * end look's record.
 */
export function unstackUnits(state: GameState, seat: number): void {
  if (isBarbSeat(seat)) barbSlots(state);
  else {
    const s = seat === FREE_SEAT ? state.freeSeat : state.cityStates.find((c) => c.seat === seat);
    if (s) seatPoolSlots(state, s);
  }
  const own = state.units.filter((u) => u.seat === seat && u.tileIndex >= 0 && onMap(u) && !UNITS[u.type]?.trader)
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const stuck: Unit[] = [];
  for (const u of own) {
    if (!state.units.includes(u) || !crowded(state, u)) continue;
    const to = alternateLocation(state, u, u.tileIndex, UNSTACK_RANGE, true);
    if (to < 0) {
      stuck.push(u);
      continue;
    }
    for (const m of [u, ...formationMates(state, u)]) {
      m.tileIndex = to;
      arrive(state, m);
    }
  }
  const cs = state.cityStates.find((c) => c.seat === seat);
  for (const u of stuck) {
    if (u.hp < UNIT_HP) continue;
    disbandUnit(state, u.id);
    // the DELETE destroys it at once, off its player's list (0x948500)
    if (cs?.unitsListed) delete cs.unitsListed[u.id];
    if (cs?.defendersListed) cs.defendersListed = cs.defendersListed.filter((id) => id !== u.id);
  }
}

/** the chassis whose AI row's PseudoYieldType is PSEUDOYIELD_UNIT_SETTLER
 *  (Units.xml: the Settler alone) */
let settlerChassis: ReadonlySet<string> | null = null;
function settlerPseudo(type: string): boolean {
  settlerChassis ??= new Set(Object.values(UNITS).map((d) => d.id).filter((id) => {
    const own = engineId('unit', `UNIT_${id}`, 'UNIT_', UNITS) === id ? `UNIT_${id}` : gameTypeOf('unit', id, 'UNIT_');
    return AI_UNITS.some((r) => r.type === own && r.pseudo === 'PSEUDOYIELD_UNIT_SETTLER');
  }));
  return settlerChassis.has(type);
}

/**
 * SUPPORT FORMATION (0x77ae80, its moves 0x773bd0): each land unit left
 * (+0x650 2), in pool order, takes of its player's units — in pool order —
 * a Settler (its AI row's PSEUDOYIELD_UNIT_SETTLER) on the map, in no
 * formation (+0x1fb8 +0x738 1) and no operation (a minor's operations
 * recruit no Settler): the first such, held where
 * its planning reaches the Settler's plot within two turns (0x791300), else
 * the nearest of those it does not reach (the first of equals) — a Settler's
 * Combat is 0, so a reached one never displaces another. Once every unit
 * has chosen, the moves in that order: the unit goes to the Settler's plot
 * (the move order 0x962030); arrived, the Settler joins its formation
 * (`escortUnit`); its turn is done ("Support Formation", the Settler's
 * plot). The move's other half — a lone support unit (FormationClass
 * SUPPORT) joining the strongest combat unit its planning reaches — finds
 * none: a minor's pass walks its military units alone (runs/h1_duelw1128
 * t251: city-state 3's Supply Convoy ends its turn beside its Spec Ops'
 * Support Formation).
 */
function supportFormation(state: GameState, pass: Pass): void {
  const settlers = state.units.filter((v) => v.seat === pass.seat && settlerPseudo(v.type) && !inEscort(state, v))
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  if (!settlers.length) return;
  const moves: { u: Unit; v: Unit; plot: number }[] = [];
  for (const u of pass.units) {
    if (!live(state, pass, u) || unitDomain(u.type) !== 'military' || UNITS[u.type]?.naval) continue;
    let pick: Unit | null = null;
    let reached = false;
    let near = 0;
    for (const v of settlers) {
      if (reachAt(state, pass, u, v.tileIndex, PLAN_TURNS, false, 0) >= 0) {
        if (pick) continue;
        pick = v;
        reached = true;
        continue;
      }
      if (reached) continue;
      const d = plotDistance(state, u.tileIndex, v.tileIndex);
      if (pick && d >= near) continue;
      pick = v;
      near = d;
    }
    if (pick) moves.push({ u, v: pick, plot: pick.tileIndex });
  }
  for (const { u, v, plot } of moves) {
    if (!state.units.includes(u)) continue;
    moveTo(state, u, plot, pass.strike);
    if (u.tileIndex === plot && state.units.includes(v) && v.tileIndex === plot) escortUnit(state, v);
    finish(pass, u, 'Support Formation', plot);
  }
}

/** a military unit type's own AI type (0x79b9c0: the highest of its
 *  UnitAiInfos flags up to COMBAT): COMBAT where its rows hold
 *  UNITAI_COMBAT, else EXPLORE (every military chassis without it carries
 *  UNITAI_EXPLORE: the Scout, the Skirmisher, the Ranger, Spec Ops and
 *  their replacements) */
export function ownMilitaryAi(type: string): number {
  return (AI_UNIT_AI[gameTypeOf('unit', type, 'UNIT_')] ?? []).includes('UNITAI_COMBAT') ? AI_COMBAT : AI_EXPLORE;
}

/** the units a pass walks of a player of no full AI (a city-state, the Free
 *  Cities) or of an operations probe: its military units, of AI type
 *  DEFENDER where its city's standing army holds it (`aiDefender`), else
 *  their type's own (`ownMilitaryAi`; a civilian, a support unit none) */
export function militaryAiTypeOf(u: Unit): number {
  if (unitDomain(u.type) !== 'military') return -1;
  return u.aiDefender ? AI_DEFENDER : ownMilitaryAi(u.type);
}

/** a unit of AI type DEFENDER (unit +0x1c0 4): a barbarian its tribe's camp
 *  defender (`aiTypeOf`), another player's its city's standing army's
 *  (`militaryAiTypeOf`) */
export function aiDefenderOf(state: GameState, u: Unit): boolean {
  return (isBarbSeat(u.seat) ? aiTypeOf(state, u) : militaryAiTypeOf(u)) === AI_DEFENDER;
}

/** THE PLAYER'S UNIT POOL brought up to date (`poolSlots`): a city-state's
 *  (slot 0 its founding Settler's) or the Free Cities'; every unit of the
 *  seat holds its slot from here on, as the game's does from its making.
 *  Undefined for a seat with no pool (a major). */
export function seatPoolSlots(state: GameState, s: Seat): UnitPool | undefined {
  const minor = isCityStateSeat(s.seat);
  if (!minor && s.seat !== FREE_SEAT) return undefined;
  const pool = (s.unitPool ??= { size: minor ? 1 : 0, free: [], dying: [] });
  poolSlots(pool, state.units.filter((u) => u.seat === s.seat));
  return pool;
}

/**
 * A CITY-STATE'S TACTICAL TURN (TacticalAI 0x771530 over Tactics.xml's
 * "Minor Civ Tactical" and "Minor Civ Homeland" lists): its unit pool
 * (`poolSlots`, slot 0 its founding Settler's), each unit's planning reach
 * taken before any moves, its tactical target list; its operations' run
 * (`operations`: their units the operations'); its city's ranged strikes
 * (`strikes`: the planning and the operations read the units they strike
 * as they stood before them, the moves after read them struck); then over
 * the tactical list's units (`tacticalUnit`) the moves in the
 * list's order, each walking the units the moves before it left, in pool
 * order — Support Formation, Attack High Priority, Move to Safety, Attack
 * Medium Priority, Attack Civilians, Promotion, Make Military Formation,
 * Attack Low Priority, Heal, Chase Target (no strike), Wander Near City;
 * the homeland's Move to Safety over every unit, then its End
 * Turn takes the rest (its Promotion finds no unit the tactical one left
 * due).
 */
export function cityStateTactics(state: GameState, cityState: CityState, operations: (pass: Pass) => void, strikes: () => void): void {
  const pool = seatPoolSlots(state, cityState)!;
  dropLoneRiders(state, cityState.seat);
  costsHeld = new Map();
  try {
    withShortOrders(() => {
      const pass = openPass(state, cityState.seat, militaryAiTypeOf, cityState);
      // a unit with no Movement left as the pass opens is none of its (the
      // game logs no tactical row: runs/h1_duely1117 t19 city-state 3's
      // Warrior 393220 bought at its start, 1121 t61 city-state 2's Swordsman
      // 1310720 upgraded; 199 such unit-turns over the five duely duels, none
      // logged)
      for (const u of pass.units) if (u.movesLeft <= 0) pass.done.add(u.id);
      operations(pass);
      // its city's strikes after its units' planning and its operations' run
      // (runs/h1_duely1124 t131: city-state 3's Knight 1310720 on 40:11 lists
      // the barbarian Man-At-Arms' 39:9 as an attack (1/0), its Encampment's
      // shot killing it; t87: city-state 2's Men-At-Arms on 11:14 and 9:11
      // list the barbarian Scout's 11:12, its centre's shot killing it, and
      // none of them strikes it, AI_Planning.csv / AI_Tactical.csv; t114:
      // city-state 4's operation's
      // Pikeman 1048582, Man-At-Arms 1310728 and Trebuchet 1376263 move as
      // logged on the unit its centre strikes standing)
      strikes();
      // the tactical list (`tacticalUnit`): an explorer of AI type EXPLORE is
      // the homeland's (every city-state Scout's row of the five duely duels
      // is HL: End Turn, 165 of 165)
      const all = pass.units;
      pass.units = all.filter((u) => tacticalUnit(state, u, pass.ai.get(u.id) ?? -1));
      supportFormation(state, pass);
      attackUnits(state, pass, 'HIGH');
      moveToSafety(state, pass);
      attackUnits(state, pass, 'MEDIUM');
      attackCivilians(state, pass);
      promotion(state, pass);
      makeMilitaryFormation(state, pass);
      attackUnits(state, pass, 'LOW');
      heal(state, pass);
      chaseTarget(state, pass);
      wanderNearCity(state, pass, cityState.centerIndex);
      pass.units = all;
      homelandSafety(state, pass);
      for (const u of pass.units) if (live(state, pass, u)) endTurn(pass, u);
    });
  } finally {
    costsHeld = null;
    movesEnded = null;
  }
  // its turn's end: no unit left on a plot another keeps it out of
  unstackUnits(state, cityState.seat);
  poolDying(pool, state.units.filter((u) => u.seat === cityState.seat));
}

/**
 * THE FREE CITIES' TACTICAL TURN (their "FreeCitiesTactics" and
 * "FreeCitiesHomeland" lists, Expansion1_Leaders.xml): their unit pool, then
 * Attack High Priority, Attack Medium Priority, Move to Safety, Attack Low
 * Priority, Wander Near Camp — the camp their signals answer (0x771250,
 * unread for them) read as the unit's Free City, else the nearest — and the
 * homeland's End Turn; `operations` runs once the pass has each unit's
 * planning (their operations' trees, `freeCitiesMilitary`).
 */
export function freeCityTactics(state: GameState, operations: (pass: Pass) => void): void {
  const free = state.freeSeat;
  if (!free) return;
  const pool = seatPoolSlots(state, free)!;
  dropLoneRiders(state, FREE_SEAT);
  costsHeld = new Map();
  try {
    withShortOrders(() => {
      const pass = openPass(state, FREE_SEAT, militaryAiTypeOf);
      operations(pass);
      // the tactical list (`tacticalUnit`); the homeland's End Turn takes all
      const all = pass.units;
      pass.units = all.filter((u) => tacticalUnit(state, u, pass.ai.get(u.id) ?? -1));
      attackUnits(state, pass, 'HIGH');
      attackUnits(state, pass, 'MEDIUM');
      moveToSafety(state, pass);
      attackUnits(state, pass, 'LOW');
      wanderNearCamp(state, pass, (u) => freeHome(state, u));
      for (const u of all) if (live(state, pass, u)) endTurn(pass, u);
    });
  } finally {
    costsHeld = null;
    movesEnded = null;
  }
  // their turn's end: no unit left on a plot another keeps it out of
  unstackUnits(state, FREE_SEAT);
  poolDying(pool, state.units.filter((u) => u.seat === FREE_SEAT));
}

/** a Free Cities unit's home: the centre of the Free City that granted it,
 *  else of the nearest Free City (the first of equals); -1 none */
function freeHome(state: GameState, u: Unit): number {
  const cities = state.freeSeat?.cities ?? [];
  const own = cities.find((c) => c.id === u.freeCity);
  if (own) return own.centerIndex;
  let best = -1;
  let bd = Infinity;
  for (const c of cities) {
    const d = plotDistance(state, u.tileIndex, c.centerIndex);
    if (d < bd) { bd = d; best = c.centerIndex; }
  }
  return best;
}

/** a player's tactical pass as it opens: its units in pool order, their AI
 *  types, their planning reach, its tactical target list (what it sees) */
export function openPass(state: GameState, seat: number, aiOf: (u: Unit) => number, holder?: Seat): Pass {
  const units = state.units.filter((u) => u.seat === seat && aiOf(u) >= 0).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const ai = new Map<number, number>();
  for (const u of units) ai.set(u.id, aiOf(u));
  const targets = tacticalTargets(state, seat, plotsSeenNow(state, new Set([seat])), null, seatOf(state, seat)?.armyKnown ?? []);
  const reach = new Map<number, Reach[]>();
  const plan = new Map<number, Planner>();
  for (const u of units) {
    const p = planUnit(state, u, targets);
    plan.set(u.id, p);
    reach.set(u.id, p.reach);
  }
  const ended = new Set<number>();
  movesEnded = ended;
  return { seat, strike: false, units, reach, done: new Set(), ended, ai, targets, plan, danger: passDanger(state, seat, holder), regions: seenRegions(state, seat) };
}

/** an operation's member of the player, null for one killed */
function memberAtOf(state: GameState, seat: number, id: number): Unit | null {
  return state.units.find((u) => u.id === id && u.seat === seat) ?? null;
}

/** nearest the goal first, equals in the team's member order (the stable
 *  insertion sort 0x814d10 on the distance alone) */
const nearestFirst = (a: { d: number }, b: { d: number }): number => a.d - b.d;

/** every plot the unit's path finder closes (`pathTo`'s search with no
 *  end): the plots it has a path to */
function pathPlots(state: GameState, unit: Unit): Set<number> {
  const out = new Set<number>();
  search(state, unit, Infinity, true, (n) => {
    out.add(n.tile);
    return false;
  });
  return out;
}

/** a member's distance to the goal; a member killed stands off the map */
function goalDistance(state: GameState, u: Unit | null, goal: number): number {
  return u ? plotDistance(state, u.tileIndex, goal) : Infinity;
}

/** a plot of the unit's planning (0x791300) within `turns`: with `range` 0
 *  the goal itself, else a plot exactly `range` from it with none of its own
 *  there that stacks with it or a member of its formation and no other
 *  player's unit at peace with it (`peaceAt`: runs/h1_duelp1127 t109 city-state
 *  3's Galley 393216 for its target 30:17 takes 29:17 past player 0's
 *  embarked Warrior on 30:16, as logged), but its own plot
 *  (0x78fa10: 0x585eb0 over its formation +0x1fb8; runs/h1_duelz1121 t160:
 *  Builder Capture's Settler 4325384 on 6:18, its Musketman's goal the camp
 *  3:19 its Skirmisher holds, plans no 4:18 under the Bombard 3997700 nor
 *  4:19 under the Line Infantry 4456462 and goes for 2:19, as logged);
 *  `moves` asks Movement left */
function reachAt(state: GameState, pass: Pass, u: Unit, goal: number, turns: number, moves: boolean, range: number): number {
  return planningAt(state, u, pass.reach.get(u.id) ?? [], goal, turns, moves, range);
}

/** `reachAt` over the planning reach `reach` of the unit (0x791300 ->
 *  0x78fa10): Operation Attack's spot (0x80c180 at 0x80c397) and Garrison
 *  City's (0x810d30 at 0x810e98 / 0x811213) among its callers; a unit at war
 *  on the plot keeps none out (0x585d90: runs/h1_duelp1124 t184 city-state
 *  3's Cuirassier 1835008 goes for 40:20 under the barbarian Line Infantry
 *  6094867, beside the camp, as logged) */
export function planningAt(state: GameState, u: Unit, reach: readonly Reach[], goal: number, turns: number, moves: boolean,
  range: number): number {
  const mates = formationMates(state, u);
  for (const e of reach) {
    if (e.turns > turns || (moves && e.moves <= 0)) continue;
    if (range === 0 ? e.tile !== goal : plotDistance(state, e.tile, goal) !== range) continue;
    if (range > 0 && e.tile !== u.tileIndex && (stackedWith(state, u, mates, e.tile) || peaceAt(state, u, e.tile))) continue;
    return e.tile;
  }
  return -1;
}

/** a team's store at an Operation Move node: the members it holds out and
 *  the goal it holds them for */
export interface MoveStore { list: number[]; goal: number }

/**
 * OPERATION MOVE'S UPDATE (0x81a130) for a team of the pass's player — its
 * members, the node's store — the status (SUCCESS, RUNNING), the team
 * arrived, the store kept: its members not stored at the node (the node's
 * list, kept while its goal holds, of the team's living members), a member
 * killed none of them, nearest the goal first and equals in member order;
 * the nearest within the range has the team arrived, a stored member
 * within the range too; with the target the goal, arrived or the nearest's
 * planning reaching a plot at the range this turn with Movement left is
 * SUCCESS and win, arrived as it stood.
 * Else the members within the unit distance of the goal, and of those in
 * turn, are the team; half of the others or more outside it and it has not
 * arrived (0x81c068: twice the strays at least the count). The
 * list keeps the stored members out of the unit distance of the others.
 */
export function passMoveUpdate(state: GameState, pass: Pass, members: readonly number[], store: MoveStore | undefined, goal: number,
  target: boolean, range: number, spread: number): { status: number; arrived: boolean; store: MoveStore | undefined; win: boolean } {
  const memberAt = (id: number) => memberAtOf(state, pass.seat, id);
  const kept = store?.goal === goal ? store.list : [];
  let list = kept.filter((id) => members.includes(id) && memberAt(id));
  // the members the walk finds (0x81a909: a member killed is none of them)
  const others: { id: number; u: Unit | null; d: number }[] = members
    .filter((id) => !list.includes(id) && memberAt(id))
    .map((id) => {
      const u = memberAt(id);
      return { id, u, d: goalDistance(state, u, goal) };
    });
  const sortOthers = () => others.sort(nearestFirst);
  sortOthers();
  let arrived = false;
  let reach = false;
  if (others.length) {
    arrived = others[0].d <= range;
    if (!arrived && others[0].u) reach = reachAt(state, pass, others[0].u, goal, 1, true, range) >= 0;
    if (!arrived) {
      const keep: number[] = [];
      for (const id of list) {
        const u = memberAt(id);
        if (!u) continue;
        if (goalDistance(state, u, goal) <= range) {
          arrived = true;
          reach = true;
          others.push({ id, u, d: goalDistance(state, u, goal) });
        } else keep.push(id);
      }
      list = keep;
    }
    if (arrived) {
      sortOthers();
      list = list.filter((id) => !others.some((o) => o.id === id));
    }
  } else {
    const stored = list.map((id) => ({ id, u: memberAt(id) })).filter((o) => o.u)
      .map((o) => ({ ...o, d: goalDistance(state, o.u, goal) })).sort(nearestFirst);
    if (stored.length) {
      others.push(stored[0]);
      list = list.filter((id) => id !== stored[0].id);
      arrived = stored[0].d <= range;
    }
  }
  // the store kept as it stood
  if ((arrived || reach) && target) return { status: BT_SUCCESS, arrived, store, win: true };
  if (spread !== 0) {
    let end = others.findIndex((o) => o.d > spread);
    if (end < 0) end = others.length;
    for (;;) {
      let next = others.length;
      for (let i = 0; i < others.length; i++) {
        const o = others[i];
        const near = o.u && others.slice(0, end).some((c) => c.u && plotDistance(state, c.u.tileIndex, o.u!.tileIndex) <= spread);
        if (!near) { next = i; break; }
      }
      if (next <= end) break;
      end = next;
    }
    if (2 * (others.length - end) >= others.length) arrived = false;
  }
  if (spread > 0 && list.length) {
    const keep: number[] = [];
    for (const id of list) {
      const u = memberAt(id);
      const near = u && others.some((o) => o.u && plotDistance(state, o.u.tileIndex, u.tileIndex) <= spread);
      if (u && !near) { keep.push(id); continue; }
      if (u && goalDistance(state, u, goal) <= range) arrived = true;
    }
    list = keep;
  }
  return { status: arrived ? BT_SUCCESS : BT_RUNNING, arrived, store: { list, goal }, win: false };
}

/** the goal barred to the unit (0x586360 under flag 0x40, 0x5862e0,
 *  0x585eb0; asked of a unit off its goal): no path to it, a plot it would attack into (a unit at war
 *  with it, a city centre of a player at war with it — flag 0x40 bars that
 *  to every unit —, an Encampment that bars it), or one of its own that
 *  stacks with it or with a member of its formation (`mates`: 0x585eb0
 *  takes the most 0x585d90 counts over the formation's members, +0x728 /
 *  +0x738) */
function moveBarred(state: GameState, u: Unit, goal: number, paths: ReadonlySet<number>, mates: readonly Unit[]): boolean {
  if (!paths.has(goal)) return true;
  if (attackPlot(state, u, goal)) return true;
  return [u, ...mates].some((m) => stackedAt(state, m, goal)) || foreignAt(state, u, goal);
}

/**
 * OPERATION MOVE'S EXECUTION (0x816cb0) for a team of the pass's player —
 * zero: a unit whose radius is 0 (in a formation, or of the node's Leader
 * Tag), leaderNamed: the node names a Leader Tag, which takes the others'
 * radius to 1 at least: each mover, the plot it was on and the plot it went
 * for, in the order they moved. Nothing where the operation is ready
 * (0x73aa60: its units may be built, or every team ready), the update found
 * the team arrived and the node names no Leader Tag (+0x7c, its UnitAiType);
 * else each member alive with Movement left as the order opens (+0x770,
 * +0xdb0: its turn done or not, 0x81705b..0x81706f; a unit whose moves an
 * order ended has none), nearest the goal first, takes a move
 * order (0x962030): its radius the smaller of `range` (the node's Unit
 * distance) and its Range (GetRange, unit +0x19f8: 0 for a melee unit; 0
 * for a ship) — runs/h1_duelw1121 t73-t74: the raid's Archer (Range 2)
 * under Unit distance 1 goes for 6:13 beside its target 6:12 and stays
 * there —, at least 1 where the goal is barred to it (`moveBarred`; a
 * member on the goal itself skips the test, 0x817905..0x817921: runs/
 * h1_duely1121 t31-t32 city-state 3's City Defense Warrior on 42:18 goes
 * for 42:18, runs/h1_duely1117 t112-t121 its Crossbowman of Range 2 on
 * 42:13 for 41:13; barred to a member of a formation where one of its own
 * stacks with any member: runs/h1_duely1121 t157-t173 Builder Capture's
 * Settlers beside their Musketmen go for 4:19 / 4:18 beside the camp 3:19
 * its Spearman holds); the first plot of its planning of two turns at the radius
 * (0x791300) where it lies in the goal's region or where it or the goal lies
 * in none (0x817a1c..0x817a6a: a water plot; runs/h1_duelz1117 t158 city-state
 * 3's Crossbowman 1310722 for 42:13 goes to the coast 43:13), else of the plots within
 * the radius of the goal (the ring walk 0x6aef0, the test 0x815d50) one in
 * the goal's region before one outside, then the nearest it, its own plot or
 * one with none of its own that the unit may stand on, whatever its path
 * (runs/h1_duely1121 t59-t65 / t79-t91: the raid's Archer and Warriors go
 * for 6:13 / 7:12 beside the target 6:12 while their own Scout holds the
 * land bridge 9:19 / 11:18, the only way there); none, the goal with the
 * attack flag. The order's danger flags (0x816e70..0x816e85, 0x817839..0x8178b1):
 * where the operation is weaker than its target (op +0x4b0 below +0x510,
 * `weak`) flag 8 for a unit with no combat (0x56dc90) or one in a formation
 * holding a civilian (0x266950(2): `formationMates`), else
 * for a unit with no combat in no formation; flag 0x8000 for a land unit
 * (+0x650 2) in no formation with a ship (0x266950(3)) — runs/h1_duely1121
 * t158-t160: Builder Capture's Builder 4522014 and Line Infantry 4128797 on
 * 9:12 (strength 62-65 to 66) stay, every first step a plot of danger; t162,
 * the operation stronger (63 to 51), the Line Infantry steps on.
 */
export function passMoveExec(state: GameState, pass: Pass, members: readonly number[], goal: number, range: number,
  arrived: boolean, ready: boolean, zero: (u: Unit) => boolean = () => false, leaderNamed = false, weak = false): { unit: Unit; from: number; dest: number }[] {
  const out: { unit: Unit; from: number; dest: number }[] = [];
  if (arrived && ready && !leaderNamed) return out;
  const region = state.map.tiles[goal].region ?? -1;
  const moves = (u: Unit) => state.units.includes(u) && u.seat === pass.seat && !pass.ended.has(u.id) && u.movesLeft > 0;
  const movers = members.map((id) => memberAtOf(state, pass.seat, id))
    .filter((u): u is Unit => !!u && moves(u))
    .map((u) => ({ u, d: plotDistance(state, u.tileIndex, goal) }))
    .sort(nearestFirst).map((x) => x.u!);
  // each member's Movement as the order opens: a formation's is the least
  // of its members' (the formation moves once, its members together)
  const opened = new Map(state.units.filter((x) => x.seat === pass.seat).map((x) => [x, pass.ended.has(x.id) ? 0 : x.movesLeft] as const));
  // the movers are taken as the order opens (0x817030..0x81719a); each then
  // takes its order alive (0x817800), a member its formation's walk carried
  // at no Movement among them: its order logged on the plot it was carried
  // to, its formation walking no more
  for (const u of movers) {
    if (!state.units.includes(u) || u.seat !== pass.seat) continue;
    const z = zero(u);
    let r = UNITS[u.type]?.naval || z ? 0 : Math.min(range, rangeOf(u));
    const paths = pathPlots(state, u);
    const mine = formationMates(state, u);
    if (u.tileIndex !== goal && moveBarred(state, u, goal, paths, mine)) r = Math.max(1, r);
    else if (range > 0 && leaderNamed && !z) r = Math.max(1, r);
    let dest = goal;
    let strike = false;
    const p = reachAt(state, pass, u, goal, PLAN_TURNS, false, r);
    const pRegion = p >= 0 ? state.map.tiles[p].region ?? -1 : -1;
    if (p >= 0 && (pRegion < 0 || region < 0 || pRegion === region)) dest = p;
    else if (r > 0) {
      // the unit's own location test, not its formation's: water where it
      // may embark (runs/h1_duelz1121 t160: Builder Capture's Settler
      // 4325384 and Builder 4522014, their first owner's embarking theirs,
      // go for the coast 2:19 beside the camp 3:19, their escorts for 3:19)
      const ground = groundOf(state, u, false, false, true, []);
      let best = -1;
      let bestD = -1;
      let bestIn = false;
      for (const q of ringPlots(state, goal, r)) {
        const inRegion = (state.map.tiles[q].region ?? -1) === region;
        const d = plotDistance(state, u.tileIndex, q);
        if (bestD >= 0) {
          if (inRegion === bestIn && d >= bestD) continue;
          if (inRegion !== bestIn && !inRegion) continue;
        }
        // off its own plot no unit of its own there (0x265ac0 refuses each:
        // none stands on the leader's plot), then the location test
        // (0x586360 with no flag: the ground, its domain, closed borders, a
        // hostile unit, city centre or Encampment there); no path test
        if (q !== u.tileIndex && state.units.some((x) => x !== u && x.tileIndex === q && x.seat === u.seat)) continue;
        if (!ground.enter(state.map.tiles[q])) continue;
        best = q;
        bestD = d;
        bestIn = inRegion;
      }
      if (best >= 0) dest = best;
      else strike = true;
    }
    finish(pass, u, 'Operation', dest);
    out.push({ unit: u, from: u.tileIndex, dest });
    const combat = (UNITS[u.type]?.combat ?? 0) > 0;
    const paired = mine.length > 0;
    const danger: PathDanger = { plane: pass.danger, any: weak ? !combat || paired : !combat && !paired,
      water: !UNITS[u.type]?.naval && unitDomain(u.type) !== 'air', war: false };
    // a formation moves on its Movement (+0x218): the least its members hold
    // (0x267650 at 0x2679f9, refreshed as a member's order ends its moves,
    // 0x56d6f0 -> 0x267b00), each member set to it
    const live = mine.filter((m) => state.units.includes(m));
    const held = Math.min(pass.ended.has(u.id) ? 0 : u.movesLeft, ...live.map((m) => opened.get(m) ?? 0));
    if (held <= 0) continue;
    u.movesLeft = held;
    moveTo(state, u, dest, strike, true, false, danger, live);
  }
  return out;
}

/**
 * THE BARBARIANS' TACTICAL PASS (TacticalAI 0x771530 over Tactics.xml's
 * "Default Barbarian" and "Default Barbarian HL" lists) for the units that
 * stood before their camps raised this turn's (a unit raised this turn acts
 * from the next): its riders whose escort fell out of their formations
 * (`dropLoneRiders`), the military AI's candidates (`barbarianOpsEvaluate`),
 * the knowledge base's ageing and look (`knowledgeLook`),
 * the units in their pool's order (`slot`), each one's
 * planning reach taken before any moves (0x792c90), the operations' trees
 * (`barbarianTrees`), then the moves in the
 * list's order, each walking the units the moves before it left; at the
 * turn's end the knowledge base looks again.
 */
export function barbarianTactics(state: GameState, acting: ReadonlySet<number>): void {
  dropLoneRiders(state, BARB_SEAT);
  costsHeld = new Map();
  try {
    withShortOrders(() => tacticalPass(state, acting));
  } finally {
    costsHeld = null;
    movesEnded = null;
    delete state.barbSeat.dangerOpen;
  }
  // the turn's end: no unit left on a plot another keeps it out of
  // (`unstackUnits`); the turn's captures start their operations on the
  // knowledge base the pass left, then it looks again (player signal +0x228)
  // (runs/h1_duely1117 t33: Builder Capture's start at Target Str 23, the
  // Scout 851971 on 33:12 in the end look's records only)
  unstackUnits(state, BARB_SEAT);
  barbarianCaptures(state);
  const seen = plotsSeenNow(state, new Set([BARB_SEAT]));
  knowledgeLook(state, state.barbSeat, BARB_SEAT, seen, false);
  barbCampsLook(state, seen, false);
}

function tacticalPass(state: GameState, acting: ReadonlySet<number>): void {
  const all = state.units.filter((u) => isBarbSeat(u.seat) && acting.has(u.id))
    .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  const ai = new Map<number, number>();
  for (const u of all) ai.set(u.id, aiTypeOf(state, u));
  const seen = plotsSeenNow(state, new Set([BARB_SEAT]));
  const ex = state.barbSeat.explored;
  // the military AI's candidates on the knowledge base the last look left
  barbarianOpsEvaluate(state);
  // the knowledge base ages and looks, then the target list (0x785f30)
  knowledgeLook(state, state.barbSeat, BARB_SEAT, seen, true);
  barbCampsLook(state, seen, true);
  // the military AI's part of the turn after the look: their operations
  // logged and refreshed on the knowledge base it left (the AI memory
  // reader: runs/h1_duelt1121 t16 the raid's 46 against 54 at the end look,
  // 49 against 47 at the log moment, "Not Ready"; t61 65 against 81, t63
  // 65 against 61), one a tribe started this turn among them (AI_Operation.csv:
  // runs/h1_duelw1110 t42 "Barbarian City Assault, Started" before the
  // running raid's line)
  barbarianOpsTurn(state);
  const targets = tacticalTargets(state, BARB_SEAT, seen, ex.length ? ex : null, state.barbSeat.armyKnown ?? []);
  const reach = new Map<number, Reach[]>();
  const plan = new Map<number, Planner>();
  // the planning runs for every unit of the player (0x792c90), its
  // civilians and support units among them: their safe plot reads it
  for (const u of all) {
    const p = planUnit(state, u, targets);
    plan.set(u.id, p);
    reach.set(u.id, p.reach);
  }
  const pass: Pass = { seat: BARB_SEAT, strike: true, units: all, reach, done: new Set(), ended: (movesEnded = new Set<number>()), ai, targets, plan,
    danger: passDanger(state, BARB_SEAT, state.barbSeat), regions: seenRegions(state, BARB_SEAT) };
  // the operations first (their manager's job opens the player's turn);
  // then an operation's units are the operation's
  const opUnits = barbarianTrees(state, pass);
  pass.units = all.filter((u) => !opUnits.has(u.id) && tacticalUnit(state, u, ai.get(u.id)!));
  pass.capsFrom = state.barbCaptures?.length ?? 0;
  rampage(state, pass);
  attackUnits(state, pass, 'HIGH');
  defendCamps(state, pass);
  attackCivilians(state, pass);
  plunderTraders(state, pass);
  coastalRaids(state, pass);
  pillage(state, pass, true);
  pillage(state, pass, false);
  attackUnits(state, pass, 'MEDIUM');
  moveToSafety(state, pass);
  attackUnits(state, pass, 'LOW');
  chaseTarget(state, pass);
  wanderNearCamp(state, pass, (u) => {
    const tr = tribeOf(state, u.id);
    return tr?.alive ? tr.plot : -1;
  });
  // THE HOMELAND ("Default Barbarian HL") takes every unit left: Plunder
  // Trader, Move To Safety, Explore Land
  pass.units = all;
  homelandPlunder(state, pass);
  homelandSafety(state, pass);
  exploreLand(state, pass);
  // End Turn: the rest stand
  for (const u of pass.units) if (live(state, pass, u)) endTurn(pass, u);
}

/** each barbarian's Movement as its turn opens, by unit id: its full
 *  Movement under the techs it holds before their rules grant the turn's */
export function barbMovesNow(state: GameState): Map<number, number> {
  const out = new Map<number, number>();
  for (const u of state.units) if (isBarbSeat(u.seat)) out.set(u.id, unitFullMoves(state, u) + generalAuraMP(state, u));
  return out;
}

/** each barbarian's Movement and attacks at the start of its turn: the
 *  Movement restored as the turn opened (`opened`, before their rules grant
 *  the turn's techs: runs/h1_duely1121 t61, the Quadriremes 1900549 / 2228245
 *  and the Galley 2293780 at 3 walk 3 of the 4 their planning reaches), a
 *  unit raised since at its full Movement */
export function refreshBarbarians(state: GameState, opened?: ReadonlyMap<number, number>): void {
  for (const u of state.units) {
    if (!isBarbSeat(u.seat)) continue;
    u.movesLeft = opened?.get(u.id) ?? unitFullMoves(state, u) + generalAuraMP(state, u);
    u.movesFull = u.movesLeft;
    u.attacksLeft = attacksPerTurn(u);
  }
}

/**
 * THE BARBARIANS' TURN: their unit pool (`barbSlots`), their Movement as the
 * turn opens (`barbMovesNow`), their danger map (`Seat.dangerOpen`), the
 * game's rules for them (`barbarianRules`:
 * their techs, the camp step, each tribe's turn), their units' AI
 * (`barbarianTactics`: their operations' trees, then their tactical pass),
 * their scouts looking at each step (`barbScoutLook`).
 */
export function barbarianPhase(state: GameState): void {
  barbSlots(state);
  const acting = new Set(state.units.filter((u) => isBarbSeat(u.seat)).map((u) => u.id));
  const opened = barbMovesNow(state);
  // their danger map, built before their rules' turn: no unit or camp the
  // turn raises sees for it (runs/h1_duelq1117 t21: the Warrior raised on
  // 9:23 sees Rome's Warrior on 10:21, no plot of the map; h1_duelq1127 t1:
  // the first camp's turn, the map empty)
  state.barbSeat.dangerOpen = Array.from(dangerPlane(state, BARB_SEAT));
  barbarianRules(state, state.turn);
  barbSlots(state);
  refreshBarbarians(state, opened);
  // a scout looks at each step it takes, in move order: the sight update of
  // the step (0x58aa90) raises the report (0x153ef0) as its plots come into
  // the barbarian player's view
  setBarbStepLook(barbScoutLook);
  try {
    barbarianTactics(state, acting);
  } finally {
    setBarbStepLook(null);
  }
  barbSlotsDying(state);
}
