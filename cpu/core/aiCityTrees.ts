/**
 * THE CITY EVENTS AND THEIR BEHAVIOUR TREES (GameCore_XP2 AI/CityBuild.cpp
 * and AI/BehaviorTree; `tools/civ6lab/dll_readings.md` "C-96: the city
 * events, trees and contracts"). A city the AI drives runs, each turn after
 * its analysis (0x5ce680), its events: each starts its tree where the
 * city's slot for the event holds none still running — the building or unit
 * event (0x5cd150, "Build City Building"), the district event (0x5cc910),
 * the improvement event (0x5ccc10, "Build City Improvement"). The seat's
 * trees tick later in its turn (the tree manager 0x7ffdd0) on the shared
 * interpreter (`behaviorTree.ts`); their Build Unit makes the contracts
 * (`aiContracts.ts`).
 *
 * The seat's state here is plain data (the trees' node memory and
 * blackboards, the slots, the plot reservations, the contracts), carried
 * from turn to turn; the world it reads is the caller's `CityTreeWorld`.
 */
import { AI_CITY_TREES } from '../data/aiCityTrees';
import { AI_BUILDINGS, AI_DISTRICTS, AI_IMPROVEMENTS, AI_UNITS } from '../data/aiBuildTables';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX } from './aiCityBuild';
import { BT_ERROR, BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SUCCESS, compileTree, dataBool, dataInt, dataTag, tick,
  type BtHandler, type BtNode, type BtRun } from './behaviorTree';
import { CP_CLAIMED, CP_COMPLETED, CP_FAILED, CP_IN_PROGRESS, CP_ACCEPTED, CP_CANCELLED, contractById, reapContracts, submitContract,
  type AiContract, type ContractBook, type ContractCity } from './aiContracts';
import { FX, FX_MIN } from './aiValue';

/** CityEvents' slots the events use */
export const SLOT_UNIT_OR_BUILDING = 1;
export const SLOT_DISTRICT = 2;
export const SLOT_IMPROVEMENT = 3;

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
}

export const newCityAi = (): CityAi => ({
  contracts: [], city: {}, inHand: {}, trees: [], slots: {}, reservations: [], techContracts: {}, plotContracts: {},
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
  /** the city id a plot belongs to, -1 none */
  plotCity(plot: number): number;
  /** a unit can reach the plot */
  reachable(unit: TreeUnit, plot: number): boolean;
  /** the district may stand on the plot as it is (0x35f2d0) */
  canPlaceDistrict(plot: number, district: string): boolean;
  /** the plot's owner, -1 none */
  plotOwner(plot: number): number;
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
  /** a lab's view of each tick: the tree, its root's status, its nodes'
   *  updates in walk order */
  trace?(tree: CityTree, root: number, updates: readonly string[]): void;
}

/** an item's prerequisite technology and civic (its row in the AI tables),
 *  null for none */
export function prereqsOf(item: { building?: string; unit?: string; improvement?: string; district?: string }): { tech: string | null; civic: string | null } {
  const r = item.building ? AI_BUILDINGS[AI_BUILDING_INDEX.get(item.building) ?? -1]
    : item.unit ? AI_UNITS[AI_UNIT_INDEX.get(item.unit) ?? -1]
      : item.improvement ? AI_IMPROVEMENTS.find((x) => x.type === item.improvement)
        : item.district ? AI_DISTRICTS.find((x) => x.type === item.district) : undefined;
  return { tech: r?.tech ?? null, civic: r?.civic ?? null };
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
 *  (0x5ce680 over +0xb30, 0x800590) */
export function freeSlots(ai: CityAi, cityId: number): void {
  const s = ai.slots[cityId];
  if (!s) return;
  for (let i = 0; i < s.length; i++) if (s[i] !== -1 && !live(ai, s[i])) s[i] = -1;
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

/** each contract's check (0x7f2220) for the Contract Manager: IN PROGRESS
 *  keeps it RUNNING where it blocks (alive); CLAIMED or ACCEPTED waits (not
 *  alive), FAILED past the turn limit; COMPLETED SUCCEEDS where it blocks or
 *  counts turns (alive); any other leaves the tree and FAILS (alive) */
function checkContract(ctx: Ctx, c: AiContract, over: boolean, block: boolean, counts: boolean, st: { v: number }): boolean {
  if (c.progress === CP_IN_PROGRESS) {
    if (block && (st.v === BT_FRESH || st.v === BT_SUCCESS || st.v === BT_FAILURE)) st.v = BT_RUNNING;
    return true;
  }
  if (c.progress === CP_CLAIMED || c.progress === CP_ACCEPTED) {
    if (over) {
      c.progress = CP_FAILED;
      ctx.tree.contracts = ctx.tree.contracts.filter((id) => id !== c.id);
      st.v = st.v === BT_RUNNING ? BT_RUNNING : BT_FAILURE;
    }
    if (block && st.v === BT_SUCCESS) st.v = BT_RUNNING;
    return false;
  }
  if (c.progress === CP_COMPLETED) {
    if (block || counts) st.v = Math.max(st.v, BT_SUCCESS);
    return true;
  }
  ctx.tree.contracts = ctx.tree.contracts.filter((id) => id !== c.id);
  st.v = Math.max(st.v, BT_FAILURE);
  return true;
}

/** the tree's contract by the id a tag holds (0x7cb8b0: the tree's own) */
function treeContract(ctx: Ctx, id: unknown): AiContract | undefined {
  if (typeof id !== 'number' || !ctx.tree.contracts.includes(id)) return undefined;
  return contractById(ctx.ai, id);
}

// CONTRACT MANAGER DECORATOR (0x7f17a0; its parent function 0x7f1500)
const contractManager: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    const one = dataTag(node, 'Contract');
    const multi = dataTag(node, 'Multi-Contracts');
    if (!one && !multi) return BT_ERROR;
    const limit = dataInt(node, 'Turn Limit');
    if (limit === undefined) return BT_ERROR;
    const remaining = dataInt(node, 'Turns Remaining') ?? -1;
    if (limit < 0 && remaining < 0) return BT_ERROR;
    const block = dataBool(node, 'Block While Running') ?? true;
    m.next = node.firstChild;
    m.counter = ((m.counter as number | undefined) ?? 0) + 1;
    const over = (m.counter as number) > limit && limit >= 0;
    const st = { v: BT_FRESH };
    let alive = true;
    let near = false;
    let has = false;
    const look = (id: unknown): void => {
      const c = treeContract(ctx, id);
      if (!c) return;
      alive = checkContract(ctx, c, over, block, remaining >= 0, st) && alive;
      if (remaining >= 0 && c.turns >= 0 && c.turns < remaining) near = true;
      has = true;
    };
    if (one) look(run.blackboard.get(one));
    if (multi) for (const id of list(run.blackboard.get(multi))) look(id);
    if (alive) m.counter = 0;
    if (st.v === BT_FAILURE) {
      const fail = (id: unknown): void => {
        const c = treeContract(ctx, id);
        if (c) c.progress = CP_FAILED;
      };
      if (one) fail(run.blackboard.get(one));
      if (multi) for (const id of list(run.blackboard.get(multi))) fail(id);
      m.next = node.end;
      return st.v;
    }
    if (st.v === BT_SUCCESS) {
      if (block) m.next = node.end;
      return st.v;
    }
    if (block && (st.v === BT_RUNNING || has)) {
      m.next = node.end;
      return BT_RUNNING;
    }
    if (remaining < 0) return st.v;
    if (near) return BT_FRESH;
    m.next = node.end;
    return BT_RUNNING;
  },
  child(_node, _run, own, s) {
    const v = Math.max(own === BT_FRESH ? s : own, s);
    return { own: v, finished: v !== BT_FRESH };
  },
  next(node, run) {
    return (run.mem[node.index].next as number | undefined) ?? node.firstChild;
  },
};

// ADD GOAL TECH (0x7e7d20; its execution 0x7e7200): the technologies and
// civics the desired items need that the player lacks; none SUCCEEDS; else
// RUNNING, its execution claiming a contract on the first of them
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
    for (const u of list(tagOf(run, node, 'Desired Units'))) want(prereqsOf({ unit: String(u) }));
    for (const b of list(tagOf(run, node, 'Desired Buildings'))) want(prereqsOf({ building: String(b) }));
    for (const i of list(tagOf(run, node, 'Desired Improvements'))) want(prereqsOf({ improvement: String(i) }));
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

// BUILD UNIT (0x7f4e00; its execution 0x7f4240)
const buildUnit: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    m.submit = false;
    const units = list(tagOf(run, node, 'Desired Units')).map(String);
    const buildings = list(tagOf(run, node, 'Desired Buildings')).map(String);
    const districts = list(tagOf(run, node, 'Desired Districts')).map(String);
    if (!units.length && !buildings.length && !districts.length) return BT_ERROR;
    if (treeContract(ctx, tagOf(run, node, 'Contract ID'))) return BT_RUNNING;
    if (m.contract !== undefined && m.contract !== -1) return BT_FAILURE;
    const unit = units[0] ?? null;
    const building = buildings[0] ?? null;
    const district = districts[0] ?? null;
    const { w } = ctx;
    // the city already holds the building or the district
    if (building && ctx.city.buildingHeld(building)) return BT_SUCCESS;
    if (district && ctx.city.districtHeld(district)) return BT_SUCCESS;
    if (!unit && !building && !district) return BT_SUCCESS;
    const ok = (p: { tech: string | null; civic: string | null }) => (!p.tech || w.techHeld(p.tech)) && (!p.civic || w.civicHeld(p.civic));
    if ((unit && ok(prereqsOf({ unit }))) || (building && ok(prereqsOf({ building }))) || (district && ok(prereqsOf({ district })))) {
      m.submit = true;
      return BT_RUNNING;
    }
    return BT_FAILURE;
  },
  execute(node, run, ctx) {
    const m = run.mem[node.index];
    if (!m.submit) return;
    if (treeContract(ctx, m.contract)) return;
    const units = list(tagOf(run, node, 'Desired Units')).map(String);
    const buildings = list(tagOf(run, node, 'Desired Buildings')).map(String);
    const districts = list(tagOf(run, node, 'Desired Districts')).map(String);
    const value = Number(tagOf(run, node, 'Unit Value')) || 0;
    const cityTag = tagOf(run, node, 'Required City(-1 for any city)');
    const loc = tagOf(run, node, 'Desired Location');
    const c: AiContract = {
      id: ctx.w.newContractId(), tree: ctx.tree.id, treeName: ctx.tree.name,
      unit: districts.length ? null : units[0] ?? null,
      building: districts.length || units.length ? null : buildings[0] ?? null,
      district: districts[0] ?? null,
      plot: typeof loc === 'number' ? loc : -1,
      value: value * FX, city: districts.length || !units.length ? (typeof cityTag === 'number' ? cityTag : -1) : -1,
      maxTurns: 0, turns: -1, progress: CP_CLAIMED,
      assign: !(dataBool(node, 'Release Unit When Built') ?? false),
    };
    ctx.tree.contracts.push(c.id);
    m.contract = c.id;
    const { ai, w } = ctx;
    submitContract(ai, c, w.cities, w.turn, (city) => w.clearProduction(city),
      (city, k) => w.log(contractLineFor(w, city, k)));
    if (c.progress === CP_ACCEPTED) setTag(run, node, 'Contract ID', c.id);
  },
};

function contractLineFor(w: CityTreeWorld, city: ContractCity, c: AiContract): string {
  const name = w.cities.find((x) => x.id === city.id)?.name ?? '';
  return `${w.turn}, ${w.seat}, ${name}, , CONTRACT ${c.id}, SUBMITTED, ${c.unit ?? 'NO_UNIT'}, ${c.building ?? 'NO_BUILDING'}, `
    + `${c.district ?? 'NO_DISTRICT'}, VALUE ${(c.value / FX).toFixed(1)}, ${c.treeName}`;
}

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

// MOVE UNIT (0x7f0020): RUNNING until the units stand on the location, the
// execution moving them; SUCCESS there; FAILURE where none can reach it
const moveUnit: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const plot = tagOf(run, node, 'Location');
    if (typeof plot !== 'number' || plot < 0) return BT_FAILURE;
    const us = unitsOf(ctx, run, node, 'Unit ID List');
    if (!us.length) return BT_FAILURE;
    if (us.every((u) => u.plot === plot)) return BT_SUCCESS;
    return us.some((u) => ctx.w.reachable(u, plot)) ? BT_RUNNING : BT_FAILURE;
  },
  execute(node, run, ctx) {
    const plot = tagOf(run, node, 'Location');
    if (typeof plot !== 'number') return;
    for (const u of unitsOf(ctx, run, node, 'Unit ID List')) if (u.plot !== plot) ctx.w.order(u.id, 'move', plot);
  },
};

// CLEAR PLOT (0x7f7960): the plot cleared for the improvement: SUCCESS once
// it can take it; RUNNING while a unit of the tree stands on it, its
// execution clearing it
const clearPlot: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const plot = tagOf(run, node, 'Plot To Clear');
    if (typeof plot !== 'number' || plot < 0) return BT_FAILURE;
    const imp = list(run.blackboard.get(dataTag(run.nodes[1], 'Trigger Improvements') ?? '')).map(String)[0];
    if (imp && ctx.w.canImprove(plot, imp)) return BT_SUCCESS;
    const us = unitsOf(ctx, run, node, 'Builder List');
    return us.some((u) => u.plot === plot && u.charges > 0) ? BT_RUNNING : BT_FAILURE;
  },
  execute(node, run, ctx) {
    const plot = tagOf(run, node, 'Plot To Clear');
    if (typeof plot !== 'number') return;
    const u = unitsOf(ctx, run, node, 'Builder List').find((x) => x.plot === plot && x.charges > 0);
    if (u) ctx.w.order(u.id, 'clear', plot);
  },
};

// BUILD IMPROVEMENT (0x7e9670; its execution 0x7e8ef0): a worker with
// charges on the goal plot that can take an improvement of the list:
// SUCCESS, the execution building it; else RUNNING where a worker can reach
// the plot, FAILURE where none can
const buildImprovement: BtHandler<Ctx> = {
  update(node, run, ctx) {
    const m = run.mem[node.index];
    m.unit = -1;
    m.improvement = null;
    const plot = tagOf(run, node, 'Goal Plot');
    if (typeof plot !== 'number' || plot < 0) return BT_FAILURE;
    const workers = unitsOf(ctx, run, node, 'Worker List').filter((u) => u.charges > 0);
    const at = workers.find((u) => u.plot === plot);
    if (!at) return workers.some((u) => ctx.w.reachable(u, plot)) ? BT_RUNNING : BT_FAILURE;
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
    if (typeof m.unit === 'number' && m.unit >= 0 && typeof plot === 'number') ctx.w.order(m.unit, 'improve', plot, m.improvement as string);
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
  'Contract Manager Decorator': contractManager,
  'Add Goal Tech': addGoalTech,
  'Build Unit': buildUnit,
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
  for (const id of reapContracts(ai, new Set(ai.trees.flatMap((t) => t.contracts)))) {
    delete ai.techContracts[id];
    delete ai.plotContracts[id];
  }
}
