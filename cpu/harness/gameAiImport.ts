/**
 * A SEAT'S AI FROM THE GAME'S OWN MEMORY (`--memory aimem`): the operations
 * and, for a city-state, the city trees, their contracts and every
 * contract's holders, as the end look of the turn before left them
 * (`<stem>.aimem.jsonl`, tools/civ6lab/aimem.py), in place of ours carried.
 *
 * A game tree's run becomes ours (`runOf`): its nodes fresh where its root
 * ran on (a tree whose root ended is left out, as the manager destroys it),
 * the tagged data the blackboard holds (each node's TreeData value by
 * DefnId, at the tag our node names), each Sequence's resume (the node
 * graph's current child, graph +0x10) and a node's own fields: Move Unit's
 * kept unit (its data +0x50), Clear Plot's (+0x40), Build Improvement's unit
 * (+0x50) and improvement (+0x54), the Contract Manager's turn counter
 * (+0x50), Turn Limiter's first turn (+0x30), Recruit Units' done flag
 * (+0x88) and the unit it asked (+0x8c); the other nodes keep no field
 * across turns, Operation Move's per-team stores aside, which stay ours.
 *
 * A city tree becomes our CityTree: its control id, name and slot (the
 * event that starts it), its run, its trigger (its Decode Trigger's values),
 * the units assigned to it (unit +0x300) and its contracts; matched to ours
 * of the same name and trigger, it keeps our id. The plot reservations are
 * the succeeded Reserve Plot nodes'.
 *
 * An operation (`importOps`) becomes ours of the same definition and target
 * (else of the same definition), which keeps its id, slot, backup's rally
 * and enemy, start, formations and build permission: its enemy, target and
 * rally, its strengths (op +0x220, +0x238), its tree's run, its trigger (the
 * Decode Trigger's units and value), its lock (a Lock Units node that
 * succeeded), its contracts; per team (op +0x150, 0x118 bytes each, in the
 * definition's order) its members (+0x18), the counts per requirement
 * (+0x30), every requirement's minimum met, its readiness and the ongoing
 * one (+0x10, +0x11, +0x12), engaged (+0x90), the units it took in (+0x58)
 * and its goals (+0xe8 + 8 x the slot). Its team's unit to build and
 * strength stay ours (the FinalRelease team holds neither where the
 * Release's does). A city-state's operations are the game's whole — one of
 * ours the game lacks ends, one the game holds and we lack starts under the
 * game's tree id; the barbarians' and the Free Cities' are tied to their
 * tribes and cities by our ids, so only those both sides hold are taken,
 * their trigger (a raid's tribe) ours. A remembered turn (Turn Limiter's)
 * is ours of the game's (`ImportWorld.turnShift`).
 */
import { CP_IN_PROGRESS, type AiContract } from '../core/aiContracts';
import { SLOT_DEFENSE, SLOT_DISTRICT, SLOT_IMPROVEMENT, SLOT_UNIT_OR_BUILDING, type CityAi, type CityTree, type CityTreeTrigger } from '../core/aiCityTrees';
import { BT_FRESH, BT_SUCCESS, type AiTreeNode, type BtMemory } from '../core/behaviorTree';
import { opsOf, type OpsAi } from '../core/operations/manager';
import { NO_PLOT, type Operation, type OpTeam } from '../core/operations/operation';
import type { CityState } from '../core/types';
import { AI_CITY_TREES } from '../data/aiCityTrees';
import { AI_OP_DEFS, AI_OP_TEAMS, AI_TEAM_REQS, AI_TREES } from '../data/aiOperations';
import type { GameContract, GameMemoryRead, GameOperation, GameTree, MemoryNames } from './aiMemory';

/** the city trees a city-state runs and the slot each takes */
const TREE_SLOT: Readonly<Record<string, number>> = {
  'Build City Building': SLOT_UNIT_OR_BUILDING, 'Build City District': SLOT_DISTRICT, 'Build City Improvement': SLOT_IMPROVEMENT,
};

type FieldKind = 'unit' | 'int' | 'bool' | 'improvement' | 'unitType' | 'turn';

/** a node's own fields by node type: [our mem key, its data offset, what it holds] */
const NODE_FIELDS: Readonly<Record<string, readonly [string, number, FieldKind][]>> = {
  'Move Unit': [['unit', 0x50, 'unit']],
  'Clear Plot': [['unit', 0x40, 'unit']],
  'Build Improvement': [['unit', 0x50, 'unit'], ['improvement', 0x54, 'improvement']],
  'Contract Manager Decorator': [['counter', 0x50, 'int']],
  'Turn Limiter': [['start', 0x30, 'turn']],
  'Recruit Units': [['done', 0x88, 'bool'], ['unit', 0x8c, 'unitType']],
};

export interface ImportWorld {
  names: MemoryNames;
  W: number;
  /** our unit id of the player's game unit id, undefined where none */
  unitOf(gameId: number): number | undefined;
  /** our turn of the game's turn a node remembers, less the game's: the
   *  barbarians' pass opens our next turn (1), any other seat's runs in its
   *  own (0) — runs/h1_duely1117 t9: the raid's Turn Limiter begun at the
   *  game's 9, ours at 10 */
  turnShift: number;
}

const LISTS: Readonly<Record<number, keyof MemoryNames>> = { 0: 'units', 1: 'techs', 2: 'buildings', 7: 'improvements', 10: 'districts', 11: 'civics' };

/** a TreeData value as our blackboard holds it: lists of install types,
 *  ids (contracts as the game's, units as ours), a plot as its index, a
 *  float whole, a city-state's city as -1 */
function bbValue(w: ImportWorld, type: number, v: unknown, tag: string): unknown {
  const names = LISTS[type];
  if (names) return (v as number[]).filter((i) => i >= 0).map((i) => w.names[names][i] ?? `#${i}`);
  if (type === 8) {
    const ids = (v as number[]).filter((i) => i >= 0);
    return /contract/i.test(tag) ? ids : ids.flatMap((i) => { const u = w.unitOf(i); return u === undefined ? [] : [u]; });
  }
  if (type === 5) {
    const [x, y] = v as [number, number];
    return x < 0 || y < 0 ? -1 : y * w.W + x;
  }
  if (type === 9) return (v as number) / 256;
  if (type === 3 && /city/i.test(tag)) return (v as number) >= 0 ? -1 : v;
  return v;
}

function readInt(hex: string, off: number): number {
  const s = hex.slice(2 * off, 2 * off + 8).padEnd(8, '0');
  const b = [0, 2, 4, 6].map((k) => parseInt(s.slice(k, k + 2), 16));
  return (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) | 0;
}

const readByte = (hex: string, off: number): number => parseInt(hex.slice(2 * off, 2 * off + 2).padEnd(2, '0'), 16);

/** a game tree's run onto our rows: fresh statuses, the node memories, the
 *  blackboard, each node's TreeData values by data name; null where the
 *  rows are not the game's or the root ended */
interface GameRun {
  status: number[];
  /** the game's statuses of its last tick */
  last: number[];
  mem: BtMemory[];
  bb: Record<string, unknown>;
  values: Record<string, unknown>[];
}

function runOf(w: ImportWorld, rows: readonly AiTreeNode[], g: GameTree): GameRun | null {
  if (!g.nodes || g.nodes.length !== rows.length || g.nodes.some((n) => !n[4])) return null;
  // the tick's root: RUNNING (or FRESH) ticks again next turn, its nodes fresh
  // (as `tick` leaves them); any other ended the tree, which the manager
  // destroys
  if (g.nodes[0][0] !== 0 && g.nodes[0][0] !== 2) return null;
  const bb: Record<string, unknown> = {};
  const mem: BtMemory[] = rows.map(() => ({}));
  const values: Record<string, unknown>[] = rows.map(() => ({}));
  rows.forEach((row, k) => {
    const [, , , hex, data, graph] = g.nodes![k];
    for (const [dataName, d] of Object.entries(row.data)) {
      const got = data[String(d.defn)];
      if (!got) continue;
      const v = bbValue(w, got[0], got[2], d.tag ?? dataName);
      values[k][dataName] = v;
      if (d.tag) bb[d.tag] = v;
    }
    for (const [key, off, kind] of NODE_FIELDS[row.type] ?? []) {
      const raw = kind === 'bool' ? readByte(hex, off) : readInt(hex, off);
      if (kind === 'unit') mem[k][key] = raw > 0 ? w.unitOf(raw) ?? -1 : -1;
      else if (kind === 'improvement') mem[k][key] = raw >= 0 ? w.names.improvements[raw] ?? null : null;
      else if (kind === 'unitType') {
        if (raw >= 0 && w.names.units[raw]) mem[k][key] = w.names.units[raw];
      } else if (kind === 'turn') {
        if (raw > 0) mem[k][key] = raw + w.turnShift;
      } else if (kind === 'bool') {
        if (raw) mem[k][key] = true;
      } else mem[k][key] = raw;
    }
    if (row.type === 'Sequence' && graph) mem[k].resume = graph[4];
  });
  return { status: g.nodes.map(() => BT_FRESH), last: g.nodes.map((n) => n[0]), mem, bb, values };
}

function treeOf(w: ImportWorld, id: number, g: GameTree, assigned: Record<string, number>): CityTree | null {
  const rows = AI_CITY_TREES[g.name ?? ''];
  const slot = TREE_SLOT[g.name ?? ''];
  if (!rows || slot === undefined) return null;
  const run = runOf(w, rows, g);
  if (!run) return null;
  const trigger: CityTreeTrigger = { unit: null, building: null, district: null, improvement: null, plot: -1, tech: null, civic: null, city: -1 };
  rows.forEach((row, k) => {
    if (row.type !== 'Decode Trigger') return;
    const v = run.values[k];
    const first = (name: string) => (Array.isArray(v[name]) ? (v[name] as string[])[0] ?? null : null);
    if ('Trigger Units' in v) trigger.unit = first('Trigger Units');
    if ('Trigger Buildings' in v) trigger.building = first('Trigger Buildings');
    if ('Trigger Improvements' in v) trigger.improvement = first('Trigger Improvements');
    if ('Trigger District' in v) trigger.district = first('Trigger District');
    if ('Trigger Tech' in v) trigger.tech = first('Trigger Tech');
    if ('Trigger Civic' in v) trigger.civic = first('Trigger Civic');
    if ('Trigger Location' in v) trigger.plot = v['Trigger Location'] as number;
  });
  const units = Object.entries(assigned).filter(([, job]) => job === id).flatMap(([u]) => { const e = w.unitOf(Number(u)); return e === undefined ? [] : [e]; });
  return {
    id, name: g.name!, city: -1, slot, status: run.status, mem: run.mem, bb: run.bb, trigger, units,
    contracts: (g.contracts ?? []).filter((c) => c >= 0), done: false,
  };
}

/** two triggers of one item at one plot */
const sameTrigger = (a: CityTreeTrigger, b: CityTreeTrigger): boolean => a.unit === b.unit && a.building === b.building
  && a.district === b.district && a.improvement === b.improvement && a.plot === b.plot && a.tech === b.tech && a.civic === b.civic;

const plotOf = (w: ImportWorld, x: number, y: number): number => (x < 0 || y < 0 ? NO_PLOT : y * w.W + x);

/** a game team's bytes onto our team of the definition's row `name` */
function teamOf(w: ImportWorld, name: string, members: GameOperation['teams'][number], counts: number[], hex: string, ours: OpTeam | undefined): OpTeam {
  return {
    team: name,
    members: members.flatMap((m) => { const u = w.unitOf(m[0]); return u === undefined ? [] : [u]; }),
    counts,
    goals: [0, 1, 2, 3, 4, 5].map((s) => plotOf(w, readInt(hex, 0xe8 + 8 * s), readInt(hex, 0xec + 8 * s))),
    engaged: readByte(hex, 0x90) !== 0,
    minsMet: readByte(hex, 0x10) !== 0,
    ready: readByte(hex, 0x11) !== 0,
    ongoing: readByte(hex, 0x12) !== 0,
    unit: ours?.unit ?? null,
    strength: ours?.strength ?? 0,
    joined: readInt(hex, 0x58),
  };
}

/** the definition's teams the game's operation holds: its rows in order, a
 *  conditional row (IsCoastalTarget) dropped where the game holds fewer */
function teamRows(def: string, n: number): string[] | null {
  const rows = AI_OP_TEAMS[def] ?? [];
  if (rows.length === n) return rows.map((r) => r.team);
  const plain = rows.filter((r) => !r.condition);
  return plain.length === n ? plain.map((r) => r.team) : null;
}

/** one game operation onto ours (`base` the one of ours it matches, else
 *  a new one under the game's tree id); null where its rows are not ours or
 *  its tree ended */
function opOf(w: ImportWorld, g: GameOperation, tree: GameTree | undefined, base: Operation | undefined, turn: number): Operation | null {
  const def = AI_OP_DEFS[g.name ?? ''];
  const rows = def ? AI_TREES[def.tree ?? ''] : undefined;
  if (!def || !rows || !tree) return null;
  const run = runOf(w, rows, tree);
  const names = teamRows(def.name, g.teams.length);
  if (!run || !names) return null;
  if (names.some((t, k) => (g.teamCounts[k] ?? []).length !== (AI_TEAM_REQS[t] ?? []).length)) return null;
  let triggerUnits: number[] = [];
  let triggerValue = 0;
  let locked = base?.locked ?? false;
  rows.forEach((row, k) => {
    const v = run.values[k];
    if (row.type === 'Decode Trigger') {
      if (Array.isArray(v['Trigger Units'])) triggerUnits = v['Trigger Units'] as number[];
      if (typeof v['Trigger Value'] === 'number') triggerValue = v['Trigger Value'] as number;
    }
    if (row.type === 'Lock Units' && run.last[k] === BT_SUCCESS) locked = /^(1|true)$/i.test(String(v['Lock Units'] ?? row.data['Lock Units']?.value ?? ''));
  });
  const target = plotOf(w, g.targetX, g.targetY);
  const backup = plotOf(w, g.backupX, g.backupY);
  return {
    id: base?.id ?? g.treeControlId,
    def: def.name, enemy: g.enemy, target, rally: plotOf(w, g.rallyX, g.rallyY),
    backup: backup === NO_PLOT ? null : { target: backup, rally: base?.backup?.rally ?? backup, enemy: base?.backup?.enemy ?? g.enemy },
    teams: names.map((t, k) => teamOf(w, t, g.teams[k], g.teamCounts[k], g.teamsRaw[k], base?.teams[k]?.team === t ? base.teams[k] : undefined)),
    status: run.status, mem: run.mem, bb: run.bb, done: false, started: base?.started ?? turn,
    enemyStrength: g.targetStrength, strength: g.opStrength, triggerUnits, triggerValue, locked,
    allowUnitConstruction: base?.allowUnitConstruction ?? false,
    contracts: (tree.contracts ?? []).filter((c) => c >= 0),
    formations: base?.formations ?? [],
    ...(base?.killed !== undefined ? { killed: base.killed } : {}),
  };
}

/**
 * The game's operations of one seat onto ours (`read` its end look; `whole`:
 * the seat's operations are the game's alone, else only those both hold are
 * taken). Returns per game tree id the operation's id ours holds it under,
 * and the operations taken.
 */
export function importOps(ai: OpsAi, read: GameMemoryRead, w: ImportWorld, turn: number, whole: boolean): { ids: Map<number, number>; ops: number } {
  const ids = new Map<number, number>();
  // a recording whose reader read no team counts holds no operation whole
  if (!read.ops || !read.trees || read.ops.some((g) => !g.teamCounts)) return { ids, ops: 0 };
  const free = opsOf(ai);
  const taken: [Operation, Operation | undefined][] = [];
  const games = read.ops.map((g) => ({ g, tree: read.trees![String(g.treeControlId)] }));
  // ours of the same definition and target first, then of the definition
  const pick = (g: GameOperation, exact: boolean): Operation | undefined => {
    const target = plotOf(w, g.targetX, g.targetY);
    const k = free.findIndex((o) => o.def === g.name && (!exact || (o.target === target && o.enemy === g.enemy)));
    return k < 0 ? undefined : free.splice(k, 1)[0];
  };
  const bases = new Map<GameOperation, Operation | undefined>();
  for (const { g } of games) bases.set(g, pick(g, true));
  for (const { g } of games) if (!bases.get(g)) bases.set(g, pick(g, false));
  for (const { g, tree } of games) {
    const base = bases.get(g);
    if (!base && !whole) continue;
    // one whose rows are not ours stays ours where we hold it, its
    // contracts the game's
    const op = opOf(w, g, tree, base, turn) ?? base;
    if (!op) continue;
    if (op === base) base.contracts = (tree?.contracts ?? []).filter((c) => c >= 0);
    // a linked seat's trigger names its tribe (the barbarians: its index
    // among ours), which stays ours
    else if (!whole && base) {
      op.triggerValue = base.triggerValue;
      op.triggerUnits = base.triggerUnits;
    }
    ids.set(g.treeControlId, op.id);
    taken.push([op, base]);
  }
  for (const [op, base] of taken) {
    const k = base ? ai.slots.indexOf(base) : -1;
    if (k >= 0) ai.slots[k] = op;
    else {
      const slot = ai.free.length ? ai.free.pop()! : ai.slots.length;
      ai.slots[slot] = op;
    }
  }
  // ours the game lacks end (the seat's operations whole)
  if (whole) {
    for (const o of free) {
      const k = ai.slots.indexOf(o);
      if (k < 0) continue;
      ai.slots[k] = null;
      ai.free.push(k);
    }
  }
  return { ids, ops: taken.length };
}

/** a Barbarian Spawn Change a game operation's tree executed in the turn
 *  `read` ends (its node SUCCESS on the end look): our operation's id, the
 *  force's rate named or not, a raiding party's or not */
export interface GameSpawnChange { op: number; rate: boolean; raiding: boolean }

/** the spawn changes the barbarians' operations `ids` holds (`importOps`)
 *  executed in the game's turn: the tribe's interval is the tribe's, which
 *  no memory read holds, and the imported tree resumes past the node
 *  (runs/h1_duely1128 t78: the raid on 15:10 started, its node 3 SUCCESS at
 *  Spawn Rate 2, the tribe on 762 raising at t80, t81, t82) */
export function gameSpawnChanges(read: GameMemoryRead, ids: ReadonlyMap<number, number>): GameSpawnChange[] {
  const out: GameSpawnChange[] = [];
  for (const g of read.ops ?? []) {
    const tree = read.trees?.[String(g.treeControlId)];
    const rows = AI_TREES[AI_OP_DEFS[g.name ?? '']?.tree ?? ''];
    if (!ids.has(g.treeControlId) || !tree?.nodes || !rows || tree.nodes.length !== rows.length) continue;
    rows.forEach((row, k) => {
      if (row.type !== 'Barbarian Spawn Change' || tree.nodes![k][0] !== BT_SUCCESS) return;
      out.push({ op: ids.get(g.treeControlId)!, rate: row.data['Spawn Rate']?.value !== undefined, raiding: /^(1|true)$/i.test(String(row.data['Raiding Party']?.value ?? '')) });
    });
  }
  return out;
}

function contractOf(w: ImportWorld, c: GameContract, trees: Record<string, GameTree>): AiContract {
  const n = w.names;
  const item = (i: number | undefined, list: readonly string[]) => ((i ?? -1) >= 0 ? list[i!] ?? null : null);
  const build = c.kind === 'build';
  const plot = c.kind === 'build' || c.kind === 'plot' ? c.plot : undefined;
  return {
    id: c.id, tree: c.owner, treeName: trees[String(c.owner)]?.name ?? '-',
    unit: build ? item(c.unit, n.units) : null, building: build ? item(c.building, n.buildings) : null,
    district: build ? item(c.district, n.districts) : null,
    plot: plot && plot[0] >= 0 && plot[1] >= 0 ? plot[1] * w.W + plot[0] : -1,
    value: c.value, city: -1, maxTurns: Math.max(0, c.timeLimit ?? 0), turns: c.timeEstimate ?? -1, progress: c.status,
    assign: (c.keepControl ?? 0) !== 0, queued: c.status === CP_IN_PROGRESS,
  };
}

/**
 * The game's city AI of one city-state onto ours (`read` its end look;
 * `opIds` per game operation tree the id our operation holds it under,
 * `importOps`); returns the trees and contracts taken.
 */
export function importCityAi(cs: CityState, read: GameMemoryRead, w: ImportWorld, opIds: ReadonlyMap<number, number>): { trees: number; contracts: number } {
  const ai = cs.cityAi as CityAi | undefined;
  if (!ai || !read.trees || !read.contracts) return { trees: 0, contracts: 0 };
  // each game tree onto ours of the same name and trigger, which keeps its
  // id; one ours lacks comes under the game's control id; ours the game
  // lacks end
  const trees: CityTree[] = [];
  const idOf = new Map<number, number>(opIds);
  const free = [...ai.trees];
  for (const [id, g] of Object.entries(read.trees)) {
    if ((g.operation ?? -1) !== -1) continue;
    const t = treeOf(w, Number(id), g, read.assigned ?? {});
    if (!t) continue;
    const k = free.findIndex((o) => o.name === t.name && sameTrigger(o.trigger, t.trigger));
    if (k >= 0) {
      t.id = free[k].id;
      free.splice(k, 1);
    }
    idOf.set(Number(id), t.id);
    trees.push(t);
  }
  // every contract of a tree taken: the city trees' and the operations'
  const contracts = read.contracts.filter((c) => idOf.has(c.owner)).map((c) => {
    const x = contractOf(w, c, read.trees!);
    x.tree = idOf.get(c.owner)!;
    return x;
  });
  ai.trees = trees;
  ai.contracts = contracts;
  // the defence slot: the operation it held where it runs on, else the
  // city's City Defense operation
  const ops = cs.ops ? opsOf(cs.ops) : [];
  const was = ai.slots[-1]?.[SLOT_DEFENSE] ?? -1;
  const defense = ops.some((o) => o.id === was) ? was : ops.find((o) => o.def === 'City Defense')?.id ?? -1;
  ai.slots = { [-1]: [-1, -1, -1, -1, -1, defense] };
  for (const t of trees) ai.slots[-1][t.slot] = t.id;
  // each tree's reservation: its Reserve Plot that succeeded, its plot and
  // value as its tags hold them
  ai.reservations = [];
  for (const [id, g] of Object.entries(read.trees)) {
    const t = trees.find((x) => x.id === idOf.get(Number(id)));
    if (!t) continue;
    const rows = AI_CITY_TREES[t.name];
    rows.forEach((row, k) => {
      if (row.type !== 'Reserve Plot' || g.nodes![k][0] !== BT_SUCCESS) return;
      const tagOf = (name: string) => (row.data[name]?.tag ? t.bb[row.data[name].tag!] : undefined);
      const plot = tagOf('Plot to reserve');
      if (typeof plot !== 'number' || plot < 0) return;
      const value = Math.round((Number(tagOf('Value')) || 0) * 256);
      const prior = ai.reservations.find((r) => r.plot === plot);
      if (!prior || value > prior.value) {
        ai.reservations = ai.reservations.filter((r) => r.plot !== plot);
        ai.reservations.push({ plot, tree: t.id, value, tag: String(row.data.Tag?.tag ?? '') });
      }
    });
  }
  ai.techContracts = {};
  ai.plotContracts = {};
  for (const c of read.contracts) {
    if (!idOf.has(c.owner)) continue;
    if (c.kind === 'tech' && (c.goal ?? -1) >= 0) ai.techContracts[c.id] = w.names.techs[c.goal!];
    else if (c.kind === 'civic' && (c.goal ?? -1) >= 0) ai.techContracts[c.id] = w.names.civics[c.goal!];
    else if (c.kind === 'plot' && c.plot && c.plot[0] >= 0) ai.plotContracts[c.id] = c.plot[1] * w.W + c.plot[0];
  }
  const held = new Set(contracts.map((c) => c.id));
  const city = read.holders?.cities[0];
  ai.city = { [-1]: (city?.list ?? []).filter((id) => held.has(id)) };
  ai.inHand = { [-1]: city && held.has(city.hand) ? city.hand : -1 };
  ai.purchase = (read.holders?.economic ?? []).filter((id) => held.has(id));
  ai.nextContract = Math.max(ai.nextContract, ...contracts.map((c) => c.id + 1));
  ai.nextTree = Math.max(ai.nextTree, ...trees.map((t) => t.id + 1), ...ops.map((o) => o.id + 1));
  return { trees: trees.length, contracts: contracts.length };
}
