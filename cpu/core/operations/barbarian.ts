/**
 * THE BARBARIANS' OPERATION NODES ("Raid City", "Barbarian City Attack";
 * the reading is tools/civ6lab/dll_readings.md "C-95: the barbarians' raid"):
 * the nodes that speak to the operation's tribe — its spawn interval, its
 * recruit, its raid score, its lists of cities — through the context's
 * `barbarian` hooks, and In Difficulty Range. The tree's "Tribe" tag holds
 * the tribe's index (Decode Trigger's Trigger Value).
 */
import { BT_FAILURE, BT_FRESH, BT_RUNNING, BT_SUCCESS, dataBool, dataInt, dataTag, dataValue, type BtHandler, type BtNode, type BtRun } from '../behaviorTree';
import { DIFFICULTIES } from '../../data/barbarians';
import type { OpsContext } from './nodes';
import type { Operation } from './operation';

/** what the barbarians' nodes ask of the tribe an operation runs for */
export interface BarbarianHooks {
  /** Barbarian Spawn Change's execution (0x7c6e50): the tribe's spawn
   *  interval to its force's SpawnRate (`rate`, the force of a raiding party
   *  or not), else back to its own */
  spawnChange(tribe: number, rate: boolean, raiding: boolean): void;
  /** Barbarian Recruit (0x7c7580): the force taken from the tribe's units
   *  into the operation (true), else the units it lacks asked of the tribe
   *  (false) */
  recruit(tribe: number, op: Operation, raiding: boolean): boolean;
  /** the tribe's raid score (0x152c00) */
  score(tribe: number): number;
  /** Notify Owner's execution (0x7c6fa0 -> 0x148270): the operation's tree
   *  tells its tribe it is done */
  notify(tribe: number, op: Operation): void;
}

const tribeOf = (node: BtNode, run: BtRun, name: string): number => {
  const tag = dataTag(node, name);
  const v = tag ? run.blackboard.get(tag) : undefined;
  return typeof v === 'number' ? v : -1;
};

const hooks = (ctx: OpsContext): BarbarianHooks => {
  if (!ctx.barbarian) throw new Error(`${ctx.op.def}: a barbarian node outside the barbarians' operations`);
  return ctx.barbarian;
};

// BARBARIAN SPAWN CHANGE (0x7c7b70 update, 0x7c6e50 execution): a Spawn
// Rate named sets the force's rate, none the tribe's own
const spawnChange: BtHandler<OpsContext> = {
  update: () => BT_SUCCESS,
  execute(node, run, ctx) {
    hooks(ctx).spawnChange(tribeOf(node, run, 'Tribe'), dataValue(node, 'Spawn Rate') !== undefined, dataBool(node, 'Raiding Party') ?? false);
  },
};

// BARBARIAN RECRUIT (0x7c7580): the force whole joins, SUCCESS; else the
// units it lacks go to the tribe's queue, RUNNING
const barbarianRecruit: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    return hooks(ctx).recruit(tribeOf(node, run, 'Tribe'), ctx.op, dataBool(node, 'Raiding Party') ?? false) ? BT_SUCCESS : BT_RUNNING;
  },
};

// BARBARIAN RAID CHECK (0x7c7330): the tribe's score at Score, SUCCESS;
// else FAILURE
const raidCheck: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    return hooks(ctx).score(tribeOf(node, run, 'Tribe Number')) >= (dataInt(node, 'Score') ?? 0) ? BT_SUCCESS : BT_FAILURE;
  },
};

// NOTIFY OWNER (0x7c6fa0): the payload's tribe told
const notifyOwner: BtHandler<OpsContext> = {
  update: () => BT_SUCCESS,
  execute(node, run, ctx) {
    hooks(ctx).notify(tribeOf(node, run, 'Data Payload'), ctx.op);
  },
};

/** a Difficulties name's index, -1 none */
const difficulty = (name: string | undefined): number => (name ? DIFFICULTIES.indexOf(name.replace(/^DIFFICULTY_/, '') as typeof DIFFICULTIES[number]) : -1);

// IN DIFFICULTY RANGE (0x7f1d70): the handicap — of the target's owner with
// Apply to opponent, else the seat's — within Low and High Difficulty (a
// bound unnamed: open) runs the child, whose status is the node's; outside,
// the child is skipped and the node SUCCEEDS (FAILS with Fail if Outside)
const inDifficultyRange: BtHandler<OpsContext> = {
  update(node, run, ctx) {
    const view = ctx.view();
    const opponent = dataBool(node, 'Apply to opponent') ?? false;
    const owner = ctx.op.target >= 0 ? view.plots()[ctx.op.target].owner : -1;
    const who = opponent ? owner : ctx.seat;
    const h = who >= 0 ? view.handicap(who) : -1;
    const lo = difficulty(dataValue(node, 'Low Difficulty'));
    const hi = difficulty(dataValue(node, 'High Difficulty'));
    const inside = h >= 0 && (lo < 0 || h >= lo) && (hi < 0 || h <= hi);
    run.mem[node.index].outside = !inside;
    if (inside) return BT_FRESH;
    return dataBool(node, 'Fail if Outside') ? BT_FAILURE : BT_SUCCESS;
  },
  child: (_node, _run, own, s) => (s === BT_FRESH ? { own, finished: false } : { own: s, finished: true }),
  next: (node, run) => (run.mem[node.index].outside ? node.end : node.index + 1),
};

export const BARBARIAN_NODES: Readonly<Record<string, BtHandler<OpsContext>>> = {
  'Barbarian Spawn Change': spawnChange,
  'Barbarian Recruit': barbarianRecruit,
  'Barbarian Raid Check': raidCheck,
  'Notify Owner': notifyOwner,
  'In Difficulty Range': inDifficultyRange,
};
