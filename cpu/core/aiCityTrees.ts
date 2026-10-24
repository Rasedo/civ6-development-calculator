/**
 * THE CITY EVENTS AND THEIR BEHAVIOUR TREES (GameCore_XP2 AI/CityBuild.cpp
 * and AI/BehaviorTree; `tools/civ6lab/dll_readings.md` "C-96: the city
 * events, trees and contracts"). A city the AI drives runs, each turn after
 * its analysis (0x5ce680), its events: each starts its tree where the
 * city's slot for the event holds none still running — the building or unit
 * event (0x5cd150, "Build City Building"), the district event (0x5cc910),
 * the improvement event (0x5ccc10, "Build City Improvement"); the City
 * Defense event (0x5cced0) starts the operation its list names through the
 * player's operation manager instead. The seat's trees tick later in its
 * turn (the tree manager 0x7ffdd0) on the shared interpreter
 * (`behaviorTree.ts`); their Build Unit makes the contracts
 * (`aiContracts.ts`).
 *
 * The seat's state here is plain data (the trees' node memory and
 * blackboards, the slots, the plot reservations, the contracts), carried
 * from turn to turn; the world it reads is the caller's `CityTreeWorld`.
 */
import { AI_CITY_TREES } from '../data/aiCityTrees';
import { AI_BUILDINGS, AI_DISTRICTS, AI_FEATURES, AI_IMPROVEMENTS, AI_RESOURCES, AI_UNITS } from '../data/aiBuildTables';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX } from './aiCityBuild';
import { BT_ERROR, BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SUCCESS, compileTree, dataBool, dataTag, tick,
  type BtHandler, type BtNode, type BtRun } from './behaviorTree';
import { CP_ACCEPTED, CP_CANCELLED, CP_CLAIMED, CP_COMPLETED, CP_FAILED, CP_IN_PROGRESS, buildUnitNode, contractById, contractManagerNode, prereqsOf, reapContracts,
  treeContractOf, type AiContract, type ContractBook, type ContractCity, type ContractNodeWorld } from './aiContracts';
import { FX, FX_MIN } from './aiValue';

/** CityEvents' slots the events use */
export const SLOT_UNIT_OR_BUILDING = 1;
export const SLOT_DISTRICT = 2;
export const SLOT_IMPROVEMENT = 3;
export const SLOT_DEFENSE = 5;

/** a tree's trigger (the event's data block, 0x140510): what it was started
 *  for */
export interface CityTreeTrigger {
  unit: string | null;
  building: string | null;
  district: string | null;
  improvement: string | null;
  /** the plot, -1 none */
  plot: number;
  tech: string | null;
  civic: string | null;
  city: number;
}

export interface CityTree {
  id: number;
  name: string;
  city: number;
  slot: number;
  status: number[];
  mem: Record<string, unknown>[];
  /** the tree's tagged data */
  bb: Record<string, unknown>;
  trigger: CityTreeTrigger;
  /** the units the tree holds (unit +0x778) */
  units: number[];
  /** the contracts the tree made */
  contracts: number[];
  done: boolean;
}

/** a plot evaluation's reservation (eval +0x48): the tree, its value, its
 *  tag */
export interface Reservation {
  plot: number;
  tree: number;
  value: number;
  tag: string;
}

/** the seat's city AI state: its contracts, trees, slots, reservations */
export interface CityAi extends ContractBook {
  trees: CityTree[];
  /** per city id, per CityEvents index the tree it runs, -1 none (+0xb30) */
  slots: Record<number, number[]>;
  reservations: Reservation[];
  /** per tech or civic contract id its tech or civic (Add Goal Tech) */
  techContracts: Record<number, string>;
  /** per plot purchase contract id its plot (Purchase Plot) */
  plotContracts: Record<number, number>;
  /** the ids the seat's next contract and next tree take */
  nextContract: number;
  nextTree: number;
}

export const newCityAi = (): CityAi => ({
  contracts: [], city: {}, inHand: {}, trees: [], slots: {}, reservations: [], techContracts: {}, plotContracts: {},
  nextContract: 1, nextTree: 100,
});

/** the tech and civic contracts whose goal the player now holds COMPLETED,
 *  the one under research IN PROGRESS (CLAIMED again when the research moves
 *  off it), and the plot contracts whose plot it now owns COMPLETED (the
 *  research and civics AIs' and the Economic AI's turns, before the cities') */
export function goalsReached(
  ai: CityAi, held: (goal: string) => boolean, researching: (goal: string) => boolean, owns: (plot: number) => boolean,
): void {
  for (const c of ai.contracts) {
    const goal = ai.techContracts[c.id];
    if (goal !== undefined && (c.progress === CP_CLAIMED || c.progress === CP_IN_PROGRESS)) {
      if (held(goal)) c.progress = CP_COMPLETED;
      else c.progress = researching(goal) ? CP_IN_PROGRESS : CP_CLAIMED;
      continue;
    }
    if (c.progress !== CP_CLAIMED && c.progress !== CP_ACCEPTED) continue;
    const plot = ai.plotContracts[c.id];
    if (plot !== undefined && owns(plot)) c.progress = CP_COMPLETED;
  }
}

/** One plot evaluation of the city's analysis (0x5ce970, 0x78 bytes): the
 *  plot, the flags the events read, its improvements' and districts' values
 *  (raw, database order) */
export interface PlotEval {
  plot: number;
  /** +0x5a: the player owns the plot (the log's OWNED) */
  owned: boolean;
  /** +0x54: an improvement the player's Builder may make can stand on it */
  improvable: boolean;
  /** +0x55: a district may stand on it */
  districtOk: boolean;
  /** +0x57: an unowned plot beside one of the player's */
  nearOwned: boolean;
  improvements: readonly number[];
  districts: readonly number[];
}

/** A unit of the seat as the trees read it */
export interface TreeUnit {
  id: number;
  type: string;
  plot: number;
  charges: number;
}

/** One city of the seat as its events and trees read it */
export interface CityTreeCity extends ContractCity {
  name: string;
  /** the analysis of this turn, the city centre's first */
  evals: readonly PlotEval[];
  /** the improvement the city's turn picked on its analysis (0x5c9a00,
   *  CityBuildAI +0x648), -1 none */
  bestImprovement: number;
  /** the city centre's value tables (raw, database order) */
  buildings: readonly number[];
  units: readonly number[];
  /** the event's best building and unit (0x5d0860 flags 0, 0 / 0x5d2600
   *  flags 0, 1), -1 none, with their values */
  eventBuilding: { index: number; value: number };
  eventUnit: { index: number; value: number };
  /** the city holds the building, or the district complete, unpillaged */
  buildingHeld(building: string): boolean;
  districtHeld(district: string): boolean;
  /** the city's threat (CityBuildAI +0x1b8), -1 none */
  threat: number;
  /** the city's plot */
  plot: number;
}

/** The world the events and trees read and act on */
export interface CityTreeWorld {
  turn: number;
  seat: number;
  cities: readonly CityTreeCity[];
  units: readonly TreeUnit[];
  techHeld(tech: string): boolean;
  civicHeld(civic: string): boolean;
  /** the plot can hold the improvement as it stands (0x35fd60) */
  canImprove(plot: number, improvement: string): boolean;
  /** the cheapest unit type the city may train that builds the improvement
   *  (Check Plot), null none */
  builderType(improvement: string): string | null;
  /** the city id a plot belongs to, -2 none (a city-state's one city is -1) */
  plotCity(plot: number): number;
  /** the unit's planning reaches the plot this turn (0x791300, one turn,
   *  range 0), with Movement left there where `moves` asks it */
  reachThisTurn(unit: TreeUnit, plot: number, moves: boolean): boolean;
  /** the turns the unit's path takes to the plot (0x272a60), 0 none */
  turnsTo(unit: TreeUnit, plot: number): number;
  /** the district may stand on the plot as it is (0x35f2d0) */
  canPlaceDistrict(plot: number, district: string): boolean;
  /** the plot's owner, -1 none */
  plotOwner(plot: number): number;
  /** the plot's feature and the resource the player sees on it (0x4ab4b0),
   *  install types, null none */
  plotGround(plot: number): { feature: string | null; resource: string | null };
  /** the player's builders make districts / wonders (player +0x308 /
   *  +0x3c8) */
  buildersMakeDistricts: boolean;
  buildersMakeWonders: boolean;
  /** "City Build District Choice": a draw of 2 (0 or 1) */
  districtTie(): number;
  /** plot distance */
  distance(a: number, b: number): number;
  newContractId(): number;
  newTreeId(): number;
  log(line: string): void;
  /** the city's production cleared (the contract listener 0x175d10) */
  clearProduction(city: ContractCity): void;
  /** a unit order the tree gives (moved, improvement built) */
  order(unit: number, kind: 'move' | 'improve' | 'clear', plot: number, improvement?: string): void;
  /** the unit still stands after the orders given (a Builder spending its
   *  last charge is gone) */
  unitAlive(unit: number): boolean;
  /** the player's operation manager starts the operation of the name at the
   *  plot (0x7265b0), its tree's id; null where it does not */
  startOperation(name: string, plot: number): number | null;
  /** the operation's tree still runs */
  operationLive(tree: number): boolean;
  /** the contracts the player's operations hold (the one contract book) */
  heldContracts(): readonly number[];
  /** a lab's view of each tick: the tree, its root's status, its nodes'
   *  updates in walk order */
  trace?(tree: CityTree, root: number, updates: readonly string[]): void;
}


const NODES = new Map<string, BtNode[]>();
function treeNodes(name: string): BtNode[] {
  let n = NODES.get(name);
  if (!n) {
    const rows = AI_CITY_TREES[name];
    if (!rows) throw new Error(`aiCityTrees: no tree ${name}`);
    n = compileTree(name, rows);
    NODES.set(name, n);
  }
  return n;
}

/** the tree's run on its stored data */
function runOf(t: CityTree): BtRun {
  return { name: t.name, nodes: treeNodes(t.name), status: t.status, mem: t.mem, blackboard: new Map(Object.entries(t.bb)), done: t.done };
}

const live = (ai: CityAi, id: number): CityTree | undefined => ai.trees.find((t) => t.id === id && !t.done);

/** a plot evaluation's reservation held by a tree still running */
function reservedBy(ai: CityAi, plot: number): Reservation | undefined {
  return ai.reservations.find((r) => r.plot === plot && live(ai, r.tree));
}

function startTree(ai: CityAi, w: CityTreeWorld, city: CityTreeCity, slot: number, name: string, trigger: CityTreeTrigger): void {
  const nodes = treeNodes(name);
  const t: CityTree = {
    id: w.newTreeId(), name, city: city.id, slot, status: nodes.map(() => BT_FRESH), mem: nodes.map(() => ({})), bb: {},
    trigger, units: [], contracts: [], done: false,
  };
  ai.trees.push(t);
  (ai.slots[city.id] ??= [-1, -1, -1, -1, -1, -1])[slot] = t.id;
}

/** the city's full update: a slot whose tree no longer runs empties
 *  (0x5ce680 over +0xb30, 0x800590; the defence slot's an operation's) */
export function freeSlots(ai: CityAi, w: Pick<CityTreeWorld, 'operationLive'>, cityId: number): void {
  const s = ai.slots[cityId];
  if (!s) return;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== -1 && !(i === SLOT_DEFENSE ? w.operationLive(s[i]) : live(ai, s[i]))) s[i] = -1;
  }
}

/** 0x5cced0, THE CITY DEFENSE EVENT: a threatened city (threat above -1)
 *  with its slot free starts the operation its list's CITY_UNDER_THREAT
 *  names ("City Defense") at its plot; the slot holds the operation's tree */
export function defenseEvent(ai: CityAi, w: CityTreeWorld, city: CityTreeCity, operation: string | null): void {
  if (city.threat <= -1 || !operation || !slotFree(ai, city.id, SLOT_DEFENSE)) return;
  const tree = w.startOperation(operation, city.plot);
  if (tree !== null) (ai.slots[city.id] ??= [-1, -1, -1, -1, -1, -1])[SLOT_DEFENSE] = tree;
}

/** what the defensive cancel reads of a city: the item at its queue's head
 *  (install types, null none, at most one set), the table values of a
 *  unit, a building, a project and of a district at the head's plot, the
 *  Default Specialization's best building of the plain pick and best unit
 *  of the defensive pick */
export interface DefensiveCancelFacts {
  head: { unit: string | null; building: string | null; district: string | null; project: string | null };
  unitValue(unit: string): number;
  buildingValue(building: string): number;
  districtValue(district: string): number;
  projectValue(project: string): number;
  bestPlainBuilding(): number;
  bestDefensiveUnit(): number;
}

/** AI_CURRENT_TASK_BIAS (GlobalParameters, 80): the defensive cancel's floor
 *  over the value of the city's current task */
export const CURRENT_TASK_BIAS = 80 * FX;

/**
 * 0x5d7640, THE DEFENSIVE CANCEL, the City Defense event's opening (0x5cced0),
 * in a city under threat (0x5cdc50: its threat above -1 with its centre's hit
 * points damaged; the caller's `underThreat`). The item in hand is the
 * contract in hand where the city holds one (+0x398), else its queue's
 * head; it is NOT DEFENSIVE where a unit without Combat (+0x48) or with a
 * Bombard (+0x40), a building without a DefenseModifier (+0x28 — the Walls
 * carry none), a district without hit points, any project. Its OLD VALUE:
 * the contract's value (else 0), raised to the head's table value — a
 * unit's (a queued unit with no contract and no PseudoYieldType, or the
 * PSEUDOYIELD_UNIT_COMBAT one, leaves the cancel there), a building's (a
 * wonder's 0), a district's at its plot, a project's. An empty queue keeps
 * its task. The bar: OLD + max(OLD, AI_CURRENT_TASK_BIAS). The city cancels
 * where a contract it lists stands ACCEPTED at the bar or above, or its item
 * is not defensive, or the plain pick's best building reaches the bar or
 * the defensive pick's best unit passes it: the contract in hand FAILED,
 * the production cleared ("Canceling current build, OLD VALUE v"). Recorded
 * (AI_CityBuild.csv, 98 city-state cancels over the 29 duels):
 * runs/h1_duelw1105 Bandar Brunei t63-t69, its Walls contract FAILED and
 * re-picked each turn (OLD VALUE 468.4, 495.9, ... the Walls' value);
 * runs/h1_duelw1103 Hattusa t46 its Granary (OLD 33.1) for a Heavy Chariot.
 * Returns the OLD VALUE where it cancelled, else null.
 */
export function defensiveCancel(ai: ContractBook, cityId: number, underThreat: boolean, f: DefensiveCancelFacts,
  clearProduction: () => void): number | null {
  if (!underThreat) return null;
  const hand = contractById(ai, ai.inHand[cityId] ?? -1) ?? null;
  const unitOff = (u: string): boolean => {
    const r = AI_UNITS[AI_UNIT_INDEX.get(u) ?? -1];
    return !r || r.combat === 0 || r.bombard > 0;
  };
  const buildingOff = (b: string): boolean => (AI_BUILDINGS[AI_BUILDING_INDEX.get(b) ?? -1]?.defenseModifier ?? 0) === 0;
  const districtOff = (d: string): boolean => !((AI_DISTRICTS.find((r) => r.type === d)?.hitPoints ?? 0) > 0);
  const h = f.head;
  let off: boolean;
  if (hand) {
    off = hand.unit ? unitOff(hand.unit) : hand.building ? buildingOff(hand.building) : hand.district ? districtOff(hand.district) : false;
  } else {
    off = h.unit ? unitOff(h.unit) : h.building ? buildingOff(h.building) : h.district ? districtOff(h.district) : h.project !== null;
  }
  let old = hand ? hand.value : 0;
  if (h.unit) {
    old = Math.max(old, f.unitValue(h.unit));
    if (!hand) {
      const pseudo = AI_UNITS[AI_UNIT_INDEX.get(h.unit) ?? -1]?.pseudo ?? null;
      if (pseudo === null || pseudo === 'PSEUDOYIELD_UNIT_COMBAT') return null;
    }
  } else if (h.building) {
    const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(h.building) ?? -1];
    old = Math.max(old, row?.wonder ? 0 : f.buildingValue(h.building));
  } else if (h.district) old = Math.max(old, f.districtValue(h.district));
  else if (h.project) old = Math.max(old, f.projectValue(h.project));
  if (!h.unit && !h.building && !h.district && !h.project) return null;
  const bar = old + Math.max(old, CURRENT_TASK_BIAS);
  const listed = (ai.city[cityId] ?? []).some((id) => {
    const c = contractById(ai, id);
    return !!c && c.progress === CP_ACCEPTED && c.value >= bar;
  });
  if (!listed && !off && f.bestPlainBuilding() < bar && f.bestDefensiveUnit() <= bar) return null;
  if (hand) hand.progress = CP_FAILED;
  clearProduction();
  return old;
}

/** the city's event slot holds no running tree */
export const slotFree = (ai: CityAi, city: number, slot: number): boolean => (ai.slots[city]?.[slot] ?? -1) === -1;

/** 0x5cd150, THE BUILDING OR UNIT EVENT: with its slot free, the event's
 *  best building (0x5d0860 with neither the checks nor the defensive
 *  filter) where it is valued at least the best defensive unit's
 *  (0x5d2600), else that unit, starts "Build City Building" for it, with
 *  its technology and civic where the player lacks them */
export function buildingEvent(ai: CityAi, w: CityTreeWorld, city: CityTreeCity, tree: string): void {
  if (!slotFree(ai, city.id, SLOT_UNIT_OR_BUILDING)) return;
  const b = city.eventBuilding;
  const u = city.eventUnit;
  let trigger: CityTreeTrigger | null = null;
  if (b.index !== -1 && b.value >= u.value) {
    const building = AI_BUILDINGS[b.index].type;
    const p = prereqsOf({ building });
    trigger = { unit: null, building, district: null, improvement: null, plot: -1, city: city.id,
      tech: p.tech && !w.techHeld(p.tech) ? p.tech : null, civic: p.civic && !w.civicHeld(p.civic) ? p.civic : null };
  } else if (u.index !== -1) {
    const unit = AI_UNITS[u.index].type;
    const p = prereqsOf({ unit });
    trigger = { unit, building: null, district: null, improvement: null, plot: -1, city: city.id,
      tech: p.tech && !w.techHeld(p.tech) ? p.tech : null, civic: p.civic && !w.civicHeld(p.civic) ? p.civic : null };
  }
  if (trigger) startTree(ai, w, city, SLOT_UNIT_OR_BUILDING, tree, trigger);
}

/** 0x5d1cb0: the plot whose evaluation values the improvement highest among
 *  the owned, improvable evaluations no running tree reserves (strictly
 *  higher, the first on a tie), a value above FX(-9999); null none */
export function bestPlotFor(ai: CityAi, city: CityTreeCity, improvement: number): PlotEval | null {
  let best: PlotEval | null = null;
  let bv = 0;
  for (const e of city.evals) {
    if (reservedBy(ai, e.plot)) continue;
    if (!e.owned || !e.improvable) continue;
    const v = e.improvements[improvement];
    if (v <= FX_MIN) continue;
    if (best && v <= bv) continue;
    best = e;
    bv = v;
  }
  return best;
}

/** 0x5ccc10, THE IMPROVEMENT EVENT: with its slot free, the improvement the
 *  city's turn picked, at its best plot, valued above 0 there, starts
 *  "Build City Improvement" */
export function improvementEvent(ai: CityAi, w: CityTreeWorld, city: CityTreeCity, tree: string): void {
  if (!slotFree(ai, city.id, SLOT_IMPROVEMENT)) return;
  const imp = city.bestImprovement;
  if (imp === -1) return;
  const e = bestPlotFor(ai, city, imp);
  if (!e || e.improvements[imp] <= 0) return;
  startTree(ai, w, city, SLOT_IMPROVEMENT, tree, {
    unit: null, building: null, district: null, improvement: AI_IMPROVEMENTS[imp].type, plot: e.plot, tech: null, civic: null, city: city.id,
  });
}

/** 0x5d0c20, "City Build District Choice": over the evaluations a district
 *  may stand on, owned or beside an owned plot, the district valued highest
 *  above the plot's reservation by a running tree (FX(-9999) unreserved) —
 *  a higher value takes it, an equal one on a draw of 2 coming up 1 */
export function chooseDistrict(ai: CityAi, evals: readonly PlotEval[], tie: () => number): { district: number; plot: number } | null {
  let best = FX_MIN;
  let pick = -1;
  let plot = -1;
  for (const e of evals) {
    if (!e.districtOk || (!e.owned && !e.nearOwned)) continue;
    const floor = reservedBy(ai, e.plot)?.value ?? FX_MIN;
    e.districts.forEach((v, d) => {
      if (v <= floor || v < best) return;
      if (v === best && tie() === 0) return;
      best = v;
      pick = d;
      plot = e.plot;
    });
  }
  return pick === -1 ? null : { district: pick, plot };
}

/** 0x5cc910, THE DISTRICT EVENT: with its slot free, the district the
 *  choice names starts "Build City District" at its plot, with its
 *  technology and civic where the player lacks them */
export function districtEvent(ai: CityAi, w: CityTreeWorld, city: CityTreeCity, tree: string): void {
  if (!slotFree(ai, city.id, SLOT_DISTRICT)) return;
  const c = chooseDistrict(ai, city.evals, () => w.districtTie());
  if (!c) return;
  const district = AI_DISTRICTS[c.district].type;
  const p = prereqsOf({ district });
  startTree(ai, w, city, SLOT_DISTRICT, tree, {
    unit: null, building: null, district, improvement: null, plot: c.plot, city: city.id,
    tech: p.tech && !w.techHeld(p.tech) ? p.tech : null, civic: p.civic && !w.civicHeld(p.civic) ? p.civic : null,
  });
}

/** 0x5c9a00 (the city's turn, on the analysis the turn's job wrote — the one its log prints): the improvement of the
 *  owned plots, each plot's best valued at 0 or more, that the city picks —
 *  the first plot's, then a later plot's higher one; while none picked is
 *  researched any plot's replaces it, after one is researched only a higher
 *  researched one — of an improvement a Builder can make; -1 none */
export function pickImprovement(ai: CityAi, w: CityTreeWorld, evals: readonly PlotEval[]): number {
  let best = FX_MIN;
  let pick = -1;
  let researched = false;
  for (const e of evals) {
    if (!e.owned) continue;
    let bi = -1;
    let bv = FX_MIN;
    if (e.improvable) {
      e.improvements.forEach((v, i) => {
        if (v >= 0 && v > bv) {
          bv = v;
          bi = i;
        }
      });
    }
    if (reservedBy(ai, e.plot)) continue;
    if (bv <= best && (researched || bi === -1)) continue;
    if (bi === -1) {
      pick = -1;
      best = bv;
      continue;
    }
    const type = AI_IMPROVEMENTS[bi].type;
    const p = prereqsOf({ improvement: type });
    const held = (!p.tech || w.techHeld(p.tech)) && (!p.civic || w.civicHeld(p.civic));
    if (researched && !held) continue;
    if (!w.builderType(type)) continue;
    researched = held;
    pick = bi;
    best = bv;
  }
  return pick;
}

// THE CITY TREES' NODES

interface Ctx {
  ai: CityAi;
  w: CityTreeWorld;
  tree: CityTree;
  city: CityTreeCity;
}

const tagOf = (run: BtRun, node: BtNode, name: string): unknown => {
  const t = dataTag(node, name);
  return t ? run.blackboard.get(t) : undefined;
};
const setTag = (run: BtRun, node: BtNode, name: string, v: unknown): void => {
  const t = dataTag(node, name);
  if (t) run.blackboard.set(t, v);
};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** an item's value at the city in the city's analysis, whole (>> 8): a
 *  unit's or a building's at the city centre (0x5d4cd0 / 0x5c9dd0), an
 *  improvement's at its plot (0x5d4ae0) */
function wholeValue(ctx: Ctx, item: { unit?: string | null; building?: string | null; improvement?: string | null; plot?: number }): number {
  const { city } = ctx;
  if (item.unit) return (city.units[AI_UNIT_INDEX.get(item.unit) ?? -1] ?? FX_MIN) >> 8;
  if (item.building) return (city.buildings[AI_BUILDING_INDEX.get(item.building) ?? -1] ?? FX_MIN) >> 8;
  if (item.improvement && item.plot !== undefined) {
    const e = city.evals.find((x) => x.plot === item.plot);
    return (e ? e.improvements[AI_IMPROVEMENTS.findIndex((r) => r.type === item.improvement)] ?? FX_MIN : FX_MIN) >> 8;
  }
  return 0;
}

// DECODE TRIGGER (0x7f2970): the trigger's items, city, plot, technology and
// civic into their tags; its Present Value the whole of each item's value
// at the city; FAILURE where nothing decodes and the value is not above 0
const decodeTrigger: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const tr = ctx.tree.trigger;
    let value = 0;
    let decoded = false;
    if (tr.unit) {
      setTag(run, node, 'Trigger Units', [tr.unit]);
      value += wholeValue(ctx, { unit: tr.unit });
      decoded = true;
    }
    if (tr.building) {
      setTag(run, node, 'Trigger Buildings', [tr.building]);
      value += wholeValue(ctx, { building: tr.building });
      decoded = true;
    }
    if (tr.improvement) {
      setTag(run, node, 'Trigger Improvements', [tr.improvement]);
      value += wholeValue(ctx, { improvement: tr.improvement, plot: tr.plot });
      decoded = true;
    }
    if (tr.district) {
      setTag(run, node, 'Trigger District', [tr.district]);
      const e = ctx.city.evals.find((x) => x.plot === tr.plot);
      value += (e ? e.districts[AI_DISTRICTS.findIndex((r) => r.type === tr.district)] ?? FX_MIN : FX_MIN) >> 8;
      decoded = true;
    }
    setTag(run, node, 'Trigger City', tr.city);
    if (tr.plot >= 0) setTag(run, node, 'Trigger Location', tr.plot);
    setTag(run, node, 'Trigger Tech', tr.tech ? [tr.tech] : []);
    setTag(run, node, 'Trigger Civic', tr.civic ? [tr.civic] : []);
    setTag(run, node, 'Trigger Value', value);
    if (!decoded && value <= 0) return BT_FAILURE;
    return BT_SUCCESS;
  },
};

/** what the shared contract nodes read of a city tree: the seat's book, the
 *  tree, its cities, the city's own buildings and districts */
function contractWorld(ctx: Ctx): ContractNodeWorld {
  const { w } = ctx;
  return {
    book: ctx.ai, tree: ctx.tree, turn: w.turn, cities: w.cities, newContractId: () => w.newContractId(),
    clearProduction: (city) => w.clearProduction(city), techHeld: (x) => w.techHeld(x), civicHeld: (x) => w.civicHeld(x),
    holds: (item) => (item.building ? ctx.city.buildingHeld(item.building) : item.district ? ctx.city.districtHeld(item.district) : false),
    submitted: (city, k) => {
      const name = w.cities.find((x) => x.id === city.id)?.name ?? '';
      w.log(`${w.turn}, ${w.seat}, ${name}, , CONTRACT ${k.id}, SUBMITTED, ${k.unit ?? 'NO_UNIT'}, ${k.building ?? 'NO_BUILDING'}, `
        + `${k.district ?? 'NO_DISTRICT'}, VALUE ${(k.value / FX).toFixed(1)}, ${k.treeName}`);
    },
  };
}

/** the tree's contract by the id a tag holds (0x7cb8b0: the tree's own) */
const treeContract = (ctx: Ctx, id: unknown): AiContract | undefined => treeContractOf(ctx.ai, ctx.tree, id);

const IMPROVEMENT_ROW = new Map(AI_IMPROVEMENTS.map((r) => [r.type, r] as const));
const FEATURE_ROW = new Map(AI_FEATURES.map((r) => [r.type, r] as const));
const RESOURCE_ROW = new Map(AI_RESOURCES.map((r) => [r.type, r] as const));

// ADD GOAL TECH (0x7e7d20; its execution 0x7e7200): the technologies and
// civics the desired items need that the player lacks — an improvement's
// own, and on its Goal Plot to work the harvest's of a resource the player
// sees there that the improvement does not work and the removal's of a
// feature it neither keeps nor stands on (a feature that may not be removed
// FAILS); none SUCCEEDS; else RUNNING, its execution claiming a contract on
// the first of them (runs/h1_duelw1124 Granada t2: the Alcazar tree on plot
// 570's Rainforest, Bronze Working Tech Contract 7 at 104.0)
const addGoalTech: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const { w } = ctx;
    const techs: string[] = [];
    const civics: string[] = [];
    const want = (p: { tech: string | null; civic: string | null }): void => {
      if (p.tech && !w.techHeld(p.tech) && !techs.includes(p.tech)) techs.push(p.tech);
      if (p.civic && !w.civicHeld(p.civic) && !civics.includes(p.civic)) civics.push(p.civic);
    };
    const goal = tagOf(run, node, 'Goal Plot to work');
    for (const u of list(tagOf(run, node, 'Desired Units'))) want(prereqsOf({ unit: String(u) }));
    for (const b of list(tagOf(run, node, 'Desired Buildings'))) want(prereqsOf({ building: String(b) }));
    for (const i of list(tagOf(run, node, 'Desired Improvements'))) {
      want(prereqsOf({ improvement: String(i) }));
      const imp = IMPROVEMENT_ROW.get(String(i));
      if (!imp || typeof goal !== 'number' || goal < 0) continue;
      const g = w.plotGround(goal);
      let keeps = false;
      if (g.resource) {
        if (imp.resources.includes(g.resource)) keeps = imp.keepsFeature.includes(g.resource);
        else for (const t of RESOURCE_ROW.get(g.resource)?.harvestTechs ?? []) if (t) want({ tech: t, civic: null });
      }
      if (g.feature && !keeps && !imp.features.includes(g.feature)) {
        const f = FEATURE_ROW.get(g.feature);
        if (!f?.removable) return BT_FAILURE;
        if (f.removeTech) want({ tech: f.removeTech, civic: null });
      }
    }
    for (const t of list(tagOf(run, node, 'Desired Techs'))) if (!w.techHeld(String(t)) && !techs.includes(String(t))) techs.push(String(t));
    for (const c of list(tagOf(run, node, 'Desired Civics'))) if (!w.civicHeld(String(c)) && !civics.includes(String(c))) civics.push(String(c));
    m.tech = techs[0] ?? null;
    m.civic = civics[0] ?? null;
    return m.tech === null && m.civic === null ? BT_SUCCESS : BT_RUNNING;
  },
  execute(node, run, ctx) {
    const m = run.mem[node.index];
    const goal = (m.tech ?? m.civic) as string | null;
    if (!goal) return;
    const ids = list(tagOf(run, node, 'Contract ID'));
    if (ids.some((id) => treeContract(ctx, id))) return;
    const c: AiContract = {
      id: ctx.w.newContractId(), tree: ctx.tree.id, treeName: ctx.tree.name, unit: null, building: null, district: null, plot: -1,
      value: (Number(tagOf(run, node, 'Tech Value')) || 0) * FX, city: -1, maxTurns: 0, turns: -1, progress: CP_CLAIMED, assign: false,
    };
    ctx.ai.contracts.push(c);
    ctx.ai.techContracts[c.id] = goal;
    ctx.tree.contracts.push(c.id);
    setTag(run, node, 'Contract ID', [...ids, c.id]);
  },
};


// RESERVE PLOT (0x7f7da0): the plot, which must be one of the player's, its
// evaluation reserved for the tree at its value (0x5d74c0: another running
// tree's reservation yields only to a value above its own + 20.0)
const reservePlot: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const plot = tagOf(run, node, 'Plot to reserve');
    if (typeof plot !== 'number' || plot < 0) return BT_SUCCESS;
    const owner = ctx.w.plotCity(plot);
    const city = ctx.w.cities.find((c) => c.id === owner);
    if (!city) return BT_ERROR;
    const value = (Number(tagOf(run, node, 'Value')) || 0) * FX;
    const tag = String(dataTag(node, 'Tag') ?? '');
    const r = ctx.ai.reservations.find((x) => x.plot === plot);
    if (r && r.tree !== ctx.tree.id && live(ctx.ai, r.tree) && value <= r.value + 20 * FX) return BT_FAILURE;
    if (r) Object.assign(r, { tree: ctx.tree.id, value, tag });
    else ctx.ai.reservations.push({ plot, tree: ctx.tree.id, value, tag });
    return BT_SUCCESS;
  },
};

// CHECK PLOT (0x7f6ea0): the Builder type (the cheapest unit the city may
// train that builds the improvement) into its tag, FAILURE with none; the
// plot as it stands can take the improvement: SUCCESS, else FAILURE (the
// tree clears it first)
const checkPlot: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const plot = tagOf(run, node, 'Plot To Check');
    if (typeof plot !== 'number' || plot < 0) return BT_FAILURE;
    const districts = list(tagOf(run, node, 'Building Districts')).map(String);
    if (districts.length) return ctx.w.canPlaceDistrict(plot, districts[0]) ? BT_SUCCESS : BT_FAILURE;
    const imps = list(tagOf(run, node, 'Building Improvements')).map(String);
    const imp = imps[0];
    if (!imp) return BT_FAILURE;
    const builder = ctx.w.builderType(imp);
    if (!builder) return BT_FAILURE;
    setTag(run, node, 'Builder List', [builder]);
    setTag(run, node, 'Plot To Move', plot);
    return ctx.w.canImprove(plot, imp) ? BT_SUCCESS : BT_FAILURE;
  },
};

// FIND AVAILABLE UNIT (0x7ec7b0): a unit of a desired type the tree holds;
// else the player's free units of the type (in no tree) join the tree, the
// nearest the desired location first; its id in Found Unit
const findAvailableUnit: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const types = new Set(list(tagOf(run, node, 'Desired Units')).map(String));
    const one = run.nodes[node.index].data['Unit Type']?.value;
    if (one) types.add(one);
    if (!types.size) return BT_ERROR;
    const { w, ai, tree } = ctx;
    let found = w.units.find((u) => tree.units.includes(u.id) && types.has(u.type));
    if (!found) {
      const held = new Set(ai.trees.filter((t) => !t.done).flatMap((t) => t.units));
      const loc = tagOf(run, node, 'Desired Location');
      const free = w.units.filter((u) => !held.has(u.id) && types.has(u.type));
      if (typeof loc === 'number' && loc >= 0) free.sort((a, b) => w.distance(a.plot, loc) - w.distance(b.plot, loc) || a.id - b.id);
      found = free[0];
      if (found) tree.units.push(found.id);
    }
    if (!found) return BT_FAILURE;
    setTag(run, node, 'Found Unit', [found.id]);
    return BT_SUCCESS;
  },
};

// CANCEL CONTRACT (0x7f5200; its execution 0x7f4980): SUCCESS; the
// execution CANCELS the tree's contract the tag names
const cancelContract: BtHandler<Ctx> = {
  update(node) {
    return dataTag(node, 'Contract') ? BT_SUCCESS : BT_ERROR;
  },
  execute(node, run, ctx) {
    const c = treeContract(ctx, tagOf(run, node, 'Contract'));
    if (c) c.progress = CP_CANCELLED;
  },
};

/** the tree's units of a list tag, else all it holds */
function unitsOf(ctx: Ctx, run: BtRun, node: BtNode, name: string): TreeUnit[] {
  const ids = list(tagOf(run, node, name)).map(Number);
  const pick = ids.length ? ids : ctx.tree.units;
  return ctx.w.units.filter((u) => pick.includes(u.id));
}

// PROTECT UNIT (0x7f07c0): SUCCESS
const protectUnit: BtHandler<Ctx> = { update: () => BT_SUCCESS };

// MOVE UNIT (0x7f0020): the unit it moves (+0x50), kept across turns, whose
// planning reaches the location this turn: SUCCESS, else RUNNING. With none
// kept (or the kept one gone), over its units: one reaching it this turn
// with Movement left SUCCEEDS and is kept; else one reaching it this turn,
// else the one a path brings there soonest, is kept, RUNNING; none FAILURE.
// SUCCESS this turn lets the nodes after it run in the same tick, their
// executions after its own, which moves the units: a Builder lays (Build
// Improvement) or clears (Clear Plot) on the turn it arrives
const moveUnit: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const plot = tagOf(run, node, 'Location');
    if (typeof plot !== 'number' || plot < 0) return BT_FAILURE;
    const kept = typeof m.unit === 'number' ? ctx.w.units.find((u) => u.id === m.unit) : undefined;
    if (kept) return ctx.w.reachThisTurn(kept, plot, false) ? BT_SUCCESS : BT_RUNNING;
    m.unit = -1;
    let pick: TreeUnit | undefined;
    let soon = Infinity;
    let moves = false;
    for (const u of unitsOf(ctx, run, node, 'Unit ID List')) {
      if (ctx.w.reachThisTurn(u, plot, false)) {
        if (!moves && ctx.w.reachThisTurn(u, plot, true)) {
          moves = true;
          pick = u;
        } else if (!pick) pick = u;
        soon = 1;
        continue;
      }
      const turns = ctx.w.turnsTo(u, plot);
      if (turns > 0 && turns < soon) {
        soon = turns;
        pick = u;
      }
    }
    if (!pick) return BT_FAILURE;
    m.unit = pick.id;
    return moves ? BT_SUCCESS : BT_RUNNING;
  },
  execute(node, run, ctx) {
    const plot = tagOf(run, node, 'Location');
    if (typeof plot !== 'number') return;
    // the execution (0x7eeba0): the kept unit, else each of its units
    const m = run.mem[node.index];
    const kept = typeof m.unit === 'number' && m.unit >= 0 ? ctx.w.units.filter((u) => u.id === m.unit) : null;
    for (const u of kept ?? unitsOf(ctx, run, node, 'Unit ID List')) if (u.plot !== plot) ctx.w.order(u.id, 'move', plot);
  },
};

// CLEAR PLOT (0x7f7960): the first of its units with charges on the plot,
// or whose planning reaches it this turn with Movement left, is the node's
// (+0x40): SUCCESS; none so: RUNNING where one reaches it this turn, else
// FAILURE. The execution, after Move Unit's, clears where that unit then
// stands on the plot. Its SUCCESS walks on into the build in the same tick,
// whose plot test still finds the feature or resource: the tree fails and
// the next improvement event builds (runs/h1_duelw1124 Granada: plot 570's
// Marsh cleared at t21, the Alcazar laid two turns on)
const clearPlot: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    m.unit = -1;
    const plot = tagOf(run, node, 'Plot To Clear');
    if (typeof plot !== 'number' || plot < 0) return BT_FAILURE;
    let running = false;
    for (const u of unitsOf(ctx, run, node, 'Builder List')) {
      if (u.charges <= 0) continue;
      if (u.plot === plot || ctx.w.reachThisTurn(u, plot, true)) {
        m.unit = u.id;
        return BT_SUCCESS;
      }
      if (ctx.w.reachThisTurn(u, plot, false)) running = true;
    }
    return running ? BT_RUNNING : BT_FAILURE;
  },
  execute(node, run, ctx) {
    const m = run.mem[node.index];
    const plot = tagOf(run, node, 'Plot To Clear');
    if (typeof plot !== 'number' || typeof m.unit !== 'number' || m.unit < 0) return;
    if (ctx.w.units.find((u) => u.id === m.unit)?.plot === plot) ctx.w.order(m.unit, 'clear', plot);
  },
};

// BUILD IMPROVEMENT (0x7e9670; its execution 0x7e8ef0): the first worker
// with charges on the goal plot, or whose planning reaches the builder plot
// (the goal where none) this turn with Movement left, is the node's, and the
// first improvement of the list the goal plot can take: SUCCESS. No worker
// so: RUNNING where one reaches the builder plot this turn, else FAILURE.
// The execution, after Move Unit's in node order, builds where the worker
// then stands on the builder plot: a Builder lays on the turn it arrives.
const buildImprovement: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    m.unit = -1;
    m.improvement = null;
    const plot = tagOf(run, node, 'Goal Plot');
    if (typeof plot !== 'number' || plot < 0) return BT_FAILURE;
    const bp = tagOf(run, node, 'Builder Plot');
    const to = typeof bp === 'number' && bp >= 0 ? bp : plot;
    let at: TreeUnit | undefined;
    let running = false;
    for (const u of unitsOf(ctx, run, node, 'Worker List')) {
      if (u.charges <= 0) continue;
      if (u.plot === plot || ctx.w.reachThisTurn(u, to, true)) {
        at = u;
        break;
      }
      if (ctx.w.reachThisTurn(u, to, false)) running = true;
    }
    if (!at) return running ? BT_RUNNING : BT_FAILURE;
    m.at = to;
    const imp = list(tagOf(run, node, 'Improvements')).map(String).find((i) => ctx.w.canImprove(plot, i));
    if (!imp) return BT_FAILURE;
    m.unit = at.id;
    m.improvement = imp;
    if (!(dataBool(node, 'Release when done') ?? false)) return BT_SUCCESS;
    ctx.tree.units = ctx.tree.units.filter((id) => id !== at.id);
    return BT_SUCCESS;
  },
  execute(node, run, ctx) {
    const m = run.mem[node.index];
    const plot = tagOf(run, node, 'Goal Plot');
    if (typeof m.unit !== 'number' || m.unit < 0 || typeof plot !== 'number') return;
    if (ctx.w.units.find((u) => u.id === m.unit)?.plot === m.at) ctx.w.order(m.unit, 'improve', plot, m.improvement as string);
  },
};

// PURCHASE PLOT (0x7f7bf0; its execution 0x7f6820): the tree's purchase
// contract running RUNS; the plot the player's SUCCEEDS; an unowned one
// RUNS, its execution submitting a contract to buy it (the Economic AI's,
// which no city takes); another player's FAILS
const purchasePlot: BtHandler<Ctx> = {
  execute(node, run, ctx) {
    const m = run.mem[node.index];
    if (!m.buy || treeContract(ctx, tagOf(run, node, 'Contract'))) return;
    const plot = tagOf(run, node, 'Plot') as number;
    const c: AiContract = {
      id: ctx.w.newContractId(), tree: ctx.tree.id, treeName: ctx.tree.name, unit: null, building: null, district: null, plot,
      value: 0, city: -1, maxTurns: 0, turns: -1, progress: CP_ACCEPTED, assign: false,
    };
    ctx.ai.contracts.push(c);
    ctx.ai.plotContracts[c.id] = plot;
    ctx.tree.contracts.push(c.id);
    setTag(run, node, 'Contract', c.id);
  },
  update(node, run, ctx) {
    const m = run.mem[node.index];
    m.buy = false;
    const plot = tagOf(run, node, 'Plot');
    if (typeof plot !== 'number' || plot < 0) return BT_ERROR;
    if (treeContract(ctx, tagOf(run, node, 'Contract'))) return BT_RUNNING;
    const owner = ctx.w.plotOwner(plot);
    if (owner === ctx.w.seat) return BT_SUCCESS;
    if (owner !== -1) return BT_FAILURE;
    m.buy = true;
    return BT_RUNNING;
  },
};

// HAS PLAYER ABILITY (0x7f1fa0): where an ability it asks for (Builders
// make wonders, Builders make districts) the player lacks, it finishes —
// FAILURE with Fail if none, else SUCCESS; else its children run
const hasPlayerAbility: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const done = dataBool(node, 'Fail if none') ? BT_FAILURE : BT_SUCCESS;
    m.next = node.firstChild;
    if ((dataBool(node, 'Builders make wonders') && !ctx.w.buildersMakeWonders)
      || (dataBool(node, 'Builders make districts') && !ctx.w.buildersMakeDistricts)) {
      m.next = node.end;
      return done;
    }
    return BT_FRESH;
  },
  next(node, run) {
    return (run.mem[node.index].next as number | undefined) ?? node.firstChild;
  },
};

export const CITY_NODES: Readonly<Record<string, BtHandler<Ctx>>> = {
  'Purchase Plot': purchasePlot,
  'Has Player Ability': hasPlayerAbility,
  'Decode Trigger': decodeTrigger,
  'Contract Manager Decorator': contractManagerNode<Ctx>(contractWorld),
  'Add Goal Tech': addGoalTech,
  'Build Unit': buildUnitNode<Ctx>(contractWorld),
  'Reserve Plot': reservePlot,
  'Check Plot': checkPlot,
  'Find Available Unit': findAvailableUnit,
  'Cancel Contract': cancelContract,
  'Protect Unit': protectUnit,
  'Move Unit': moveUnit,
  'Clear Plot': clearPlot,
  'Build Improvement': buildImprovement,
};

/** THE TREE MANAGER'S TICK (0x7ffdd0): each running tree of the seat, in the
 *  order they started, ticks once; a tree whose root ends, or one of whose
 *  units its orders spent, ends, its reservations and its units free */
export function tickCityTrees(ai: CityAi, w: CityTreeWorld): void {
  for (const t of ai.trees) {
    if (t.done) continue;
    const city = w.cities.find((c) => c.id === t.city);
    if (!city) {
      t.done = true;
      continue;
    }
    const run = runOf(t);
    let handlers = CITY_NODES;
    const seen: string[] = [];
    if (w.trace) {
      handlers = Object.fromEntries(Object.entries(CITY_NODES).map(([k, h]) => [k, { ...h, update: (n: BtNode, r: BtRun, c: Ctx) => {
        const s = h.update(n, r, c);
        seen.push(`${n.index}${k.split(' ').map((x) => x[0]).join('')}=${s}`);
        return s;
      } }]));
    }
    const root = tick(run, handlers, { ai, w, tree: t, city });
    w.trace?.(t, root, seen);
    t.bb = Object.fromEntries(run.blackboard);
    // a unit of the tree gone with the orders given ends the tree at once
    t.done = run.done || t.units.some((u) => !w.unitAlive(u));
  }
  ai.reservations = ai.reservations.filter((r) => live(ai, r.tree));
  ai.trees = ai.trees.filter((t) => !t.done);
  for (const id of reapContracts(ai, new Set([...ai.trees.flatMap((t) => t.contracts), ...w.heldContracts()]))) {
    delete ai.techContracts[id];
    delete ai.plotContracts[id];
  }
}
