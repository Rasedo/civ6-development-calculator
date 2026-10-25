/**
 * A CITY-STATE'S CITY AI FROM THE GAME'S OWN MEMORY (`--memory aimem`): the
 * city trees, their contracts and every contract's holders as the end look
 * of the turn before left them (`<stem>.aimem.jsonl`, tools/civ6lab/
 * aimem.py), in place of ours carried. The operations' trees stay ours (an
 * operation's own state — its teams, their goals and counts — is not read),
 * and so do the contracts they made, renumbered past the game's.
 *
 * A game tree becomes our CityTree: its control id, name and slot (the
 * event that starts it), its nodes fresh where its root ran on (a tree whose
 * root ended is left out, as the manager destroys it), the tagged data the blackboard
 * holds (each node's TreeData value by DefnId, at the tag our node names),
 * its trigger (its Decode Trigger's values), the units assigned to it
 * (unit +0x300) and its contracts. A node's own fields: Move Unit's kept
 * unit (its data +0x50), Clear Plot's (+0x40), Build Improvement's unit
 * (+0x50) and improvement (+0x54), the Contract Manager's turn counter
 * (+0x50); the other nodes keep no field across turns. The plot
 * reservations are not read: none stands after the import.
 */
import { CP_IN_PROGRESS, type AiContract } from '../core/aiContracts';
import { SLOT_DEFENSE, SLOT_DISTRICT, SLOT_IMPROVEMENT, SLOT_UNIT_OR_BUILDING, type CityAi, type CityTree, type CityTreeTrigger } from '../core/aiCityTrees';
import { opsOf } from '../core/operations/manager';
import type { CityState } from '../core/types';
import { AI_CITY_TREES } from '../data/aiCityTrees';
import type { GameContract, GameMemoryRead, GameTree, MemoryNames } from './aiMemory';

/** the city trees a city-state runs and the slot each takes */
const TREE_SLOT: Readonly<Record<string, number>> = {
  'Build City Building': SLOT_UNIT_OR_BUILDING, 'Build City District': SLOT_DISTRICT, 'Build City Improvement': SLOT_IMPROVEMENT,
};

/** a node's own fields by node type: [our mem key, its data offset, an id the
 *  unit table maps or a plain int] */
const NODE_FIELDS: Readonly<Record<string, readonly [string, number, 'unit' | 'int' | 'improvement'][]>> = {
  'Move Unit': [['unit', 0x50, 'unit']],
  'Clear Plot': [['unit', 0x40, 'unit']],
  'Build Improvement': [['unit', 0x50, 'unit'], ['improvement', 0x54, 'improvement']],
  'Contract Manager Decorator': [['counter', 0x50, 'int']],
};

export interface ImportWorld {
  names: MemoryNames;
  W: number;
  /** our unit id of the player's game unit id, undefined where none */
  unitOf(gameId: number): number | undefined;
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

function treeOf(w: ImportWorld, id: number, g: GameTree, assigned: Record<string, number>): CityTree | null {
  const rows = AI_CITY_TREES[g.name ?? ''];
  const slot = TREE_SLOT[g.name ?? ''];
  if (!rows || slot === undefined || !g.nodes || g.nodes.length !== rows.length || g.nodes.some((n) => !n[4])) return null;
  // the tick's root: RUNNING (or FRESH) ticks again next turn, its nodes fresh
  // (as `tick` leaves them); any other ended the tree, which the manager
  // destroys
  if (g.nodes[0][0] !== 0 && g.nodes[0][0] !== 2) return null;
  const bb: Record<string, unknown> = {};
  const mem: Record<string, unknown>[] = rows.map(() => ({}));
  const trigger: CityTreeTrigger = { unit: null, building: null, district: null, improvement: null, plot: -1, tech: null, civic: null, city: -1 };
  rows.forEach((row, k) => {
    const [, , , hex, data] = g.nodes![k];
    for (const [dataName, d] of Object.entries(row.data)) {
      const got = data[String(d.defn)];
      if (!got) continue;
      const v = bbValue(w, got[0], got[2], d.tag ?? dataName);
      if (d.tag) bb[d.tag] = v;
      if (row.type === 'Decode Trigger') {
        const first = Array.isArray(v) ? (v[0] as string | undefined) ?? null : null;
        if (dataName === 'Trigger Units') trigger.unit = first;
        else if (dataName === 'Trigger Buildings') trigger.building = first;
        else if (dataName === 'Trigger Improvements') trigger.improvement = first;
        else if (dataName === 'Trigger District') trigger.district = first;
        else if (dataName === 'Trigger Tech') trigger.tech = first;
        else if (dataName === 'Trigger Civic') trigger.civic = first;
        else if (dataName === 'Trigger Location') trigger.plot = v as number;
      }
    }
    for (const [key, off, kind] of NODE_FIELDS[row.type] ?? []) {
      const raw = readInt(hex, off);
      if (kind === 'unit') mem[k][key] = raw > 0 ? w.unitOf(raw) ?? -1 : -1;
      else if (kind === 'improvement') mem[k][key] = raw >= 0 ? w.names.improvements[raw] ?? null : null;
      else mem[k][key] = raw;
    }
  });
  const units = Object.entries(assigned).filter(([, job]) => job === id).flatMap(([u]) => { const e = w.unitOf(Number(u)); return e === undefined ? [] : [e]; });
  return {
    id, name: g.name!, city: -1, slot, status: g.nodes.map(() => 0), mem, bb, trigger, units,
    contracts: (g.contracts ?? []).filter((c) => c >= 0), done: false,
  };
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
 * The game's city AI of one city-state onto ours (`read` its end look);
 * returns the trees and contracts taken.
 */
export function importCityAi(cs: CityState, read: GameMemoryRead, w: ImportWorld): { trees: number; contracts: number } {
  const ai = cs.cityAi as CityAi | undefined;
  if (!ai || !read.trees || !read.contracts) return { trees: 0, contracts: 0 };
  const opTrees = new Set(Object.entries(read.trees).filter(([, t]) => (t.operation ?? -1) !== -1).map(([id]) => Number(id)));
  // the operations' contracts stay ours, renumbered past the game's ids
  const gameMax = Math.max(0, ...read.contracts.map((c) => c.id));
  let next = Math.max(ai.nextContract, gameMax + 1);
  const ours = cs.ops ? opsOf(cs.ops) : [];
  const keep: AiContract[] = [];
  for (const op of ours) {
    op.contracts = op.contracts.flatMap((id) => {
      const c = ai.contracts.find((x) => x.id === id);
      if (!c) return [];
      c.id = next++;
      keep.push(c);
      return [c.id];
    });
  }
  const trees: CityTree[] = [];
  for (const [id, g] of Object.entries(read.trees)) {
    const t = treeOf(w, Number(id), g, read.assigned ?? {});
    if (t) trees.push(t);
  }
  const contracts = read.contracts.filter((c) => !opTrees.has(c.owner)).map((c) => contractOf(w, c, read.trees!));
  ai.trees = trees;
  ai.contracts = [...contracts, ...keep];
  // the defence slot holds an operation, which stays ours
  ai.slots = { [-1]: [-1, -1, -1, -1, -1, ai.slots[-1]?.[SLOT_DEFENSE] ?? -1] };
  for (const t of trees) ai.slots[-1][t.slot] = t.id;
  // each tree's reservation: its Reserve Plot that succeeded, its plot and
  // value as its tags hold them
  ai.reservations = [];
  for (const t of trees) {
    const rows = AI_CITY_TREES[t.name];
    rows.forEach((row, k) => {
      if (row.type !== 'Reserve Plot' || t.status[k] !== 1) return;
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
    if (opTrees.has(c.owner)) continue;
    if (c.kind === 'tech' && (c.goal ?? -1) >= 0) ai.techContracts[c.id] = w.names.techs[c.goal!];
    else if (c.kind === 'civic' && (c.goal ?? -1) >= 0) ai.techContracts[c.id] = w.names.civics[c.goal!];
    else if (c.kind === 'plot' && c.plot && c.plot[0] >= 0) ai.plotContracts[c.id] = c.plot[1] * w.W + c.plot[0];
  }
  const held = new Set(contracts.map((c) => c.id));
  const city = read.holders?.cities[0];
  ai.city = { [-1]: (city?.list ?? []).filter((id) => held.has(id)) };
  ai.inHand = { [-1]: city && held.has(city.hand) ? city.hand : -1 };
  ai.purchase = (read.holders?.economic ?? []).filter((id) => held.has(id));
  ai.nextContract = next;
  ai.nextTree = Math.max(ai.nextTree, ...trees.map((t) => t.id + 1));
  return { trees: trees.length, contracts: contracts.length };
}
