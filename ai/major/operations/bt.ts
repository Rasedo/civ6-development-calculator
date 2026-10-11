/**
 * THE BEHAVIOUR TREE INTERPRETER (GameCore_XP2 AI/BehaviorTree/BehaviorTree.cpp;
 * the reading is tools/civ6lab/dll_readings.md "C-97: the behaviour trees").
 *
 * A tree is its BehaviorTreeNodes in NodeId order, each subtree a run of
 * nodes ending at its JumpTo. One tick (0x7d3a00) walks the nodes from the
 * root: each node's update (by its shape: a selector's or a decorator's own,
 * an action's or a decision's) gives its status this tick; a node under a
 * parent SKIPPED is SKIPPED (0x7d3d30). The next node is the larger of the
 * node's own next (0x7d15e0: the node after it; a Sequence's resumed child;
 * a Contract Manager's chosen child or end) and what a finished node's
 * parents answer (0x7d1750): each selector or decorator above it is told its
 * child's status by its parent function and either goes on (0) or finishes,
 * the walk then skipping to that parent's end and telling ITS parent in
 * turn. After the walk, where the root SUCCEEDED, RUNS or FAILED, every
 * action node that SUCCEEDED or RUNS executes, in node order (0x7cb3d0).
 * A tree whose root RUNS (or did nothing) ticks again next turn, its nodes
 * fresh; any other root ends it.
 */
import type { AiTreeNode } from './types';

export const BT_FRESH = 0;
export const BT_SUCCESS = 1;
export const BT_RUNNING = 2;
export const BT_FAILURE = 3;
export const BT_ERROR = 4;
export const BT_SKIPPED = 5;

export const SHAPE_SELECTOR = 0;
export const SHAPE_ACTION = 1;
export const SHAPE_DECISION = 2;
export const SHAPE_DECORATOR = 3;

/** a node as the walk reads it */
export interface BtNode {
  index: number;
  type: string;
  shape: number;
  /** the node after this node's subtree */
  end: number;
  parent: number;
  /** a selector's or decorator's first and last child, -1 for a leaf */
  firstChild: number;
  lastChild: number;
  data: AiTreeNode['data'];
}

/** a node's memory across ticks (the node's data block) */
export type BtMemory = Record<string, unknown>;

export interface BtRun {
  name: string;
  nodes: readonly BtNode[];
  status: number[];
  mem: BtMemory[];
  /** the tree's tagged data (TreeData Tag): unit lists, values, plots */
  blackboard: Map<string, unknown>;
  /** the root finished: the tree ends */
  done: boolean;
}

/** what a node type does; `C` is the caller's context */
export interface BtHandler<C> {
  /** the node's update: a leaf's status, a selector's or decorator's 0 to
   *  run its children (or a status to finish at once) */
  update(node: BtNode, run: BtRun, ctx: C): number;
  /** an action's execution after the walk */
  execute?(node: BtNode, run: BtRun, ctx: C): void;
  /** a decorator's or selector's answer to a child's status (its parent
   *  function): the new own status, and whether it finished */
  child?(node: BtNode, run: BtRun, own: number, childStatus: number, child: number, ctx: C): { own: number; finished: boolean };
  /** the node to run after this one (default the next node) */
  next?(node: BtNode, run: BtRun): number;
}

export function compileTree(name: string, rows: readonly AiTreeNode[]): BtNode[] {
  const nodes: BtNode[] = rows.map((r, i) => ({
    index: i, type: r.type, shape: r.shape, end: r.jumpTo >= 0 ? r.jumpTo : i + 1, parent: -1,
    firstChild: -1, lastChild: -1, data: r.data,
  }));
  if (rows.some((r, i) => r.id !== i)) throw new Error(`bt: tree ${name} has a gap in its NodeIds`);
  const stack: number[] = [];
  for (const n of nodes) {
    while (stack.length && nodes[stack[stack.length - 1]].end <= n.index) stack.pop();
    if (stack.length) {
      const p = nodes[stack[stack.length - 1]];
      n.parent = p.index;
      if (p.firstChild < 0) p.firstChild = n.index;
      p.lastChild = n.index;
    }
    if (n.end > n.index + 1) stack.push(n.index);
  }
  return nodes;
}

export function newRun(name: string, nodes: readonly BtNode[]): BtRun {
  return { name, nodes, status: nodes.map(() => BT_FRESH), mem: nodes.map(() => ({})), blackboard: new Map(), done: false };
}

/** a node's TreeData value (its default), undefined where it has none */
export function dataValue(node: BtNode, name: string): string | undefined {
  return node.data[name]?.value;
}

/** a node's TreeData tag, undefined where it has none */
export function dataTag(node: BtNode, name: string): string | undefined {
  return node.data[name]?.tag;
}

export const dataBool = (node: BtNode, name: string): boolean | undefined => {
  const v = dataValue(node, name);
  if (v === undefined) return undefined;
  return v === '1' || v.toLowerCase() === 'true';
};
export const dataInt = (node: BtNode, name: string): number | undefined => {
  const v = dataValue(node, name);
  return v === undefined || v === '' || v === 'No Value' ? undefined : Math.trunc(Number(v));
};
export const dataFloat = (node: BtNode, name: string): number | undefined => {
  const v = dataValue(node, name);
  return v === undefined || v === '' ? undefined : Number(v);
};

// THE SELECTORS' AND DECORATORS' PARENT FUNCTIONS (the s_SelectorParent-
// Functions table at 0xf2ed70)

/** Priority (0x7f2390): a child that SUCCEEDS or RUNS ends it with that
 *  status; one that FAILS hands on to the next, the last FAILING it */
function priorityChild(node: BtNode, own: number, s: number, child: number): { own: number; finished: boolean } {
  let r9 = Math.max(own, 1) > s ? Math.max(own, 1) : s;
  if (r9 === BT_ERROR) return { own: r9, finished: false };
  if (r9 !== BT_SKIPPED && (s === BT_SUCCESS || s === BT_RUNNING)) return { own: s, finished: true };
  if (child !== node.lastChild || s === BT_FRESH || s === BT_SKIPPED) return { own: r9, finished: false };
  return { own: r9, finished: true };
}

/** Sequence (0x7f3e80): a child that SUCCEEDS hands on to the next (the last
 *  ends it SUCCEEDING, the sequence back at its first child); one that RUNS
 *  ends it RUNNING, to resume there next turn; one that FAILS ends it and the
 *  sequence starts over */
function sequenceChild(node: BtNode, run: BtRun, own: number, s: number, child: number): { own: number; finished: boolean } {
  const r9 = Math.max(own, 1) > s ? Math.max(own, 1) : s;
  const m = run.mem[node.index];
  if (r9 !== BT_SKIPPED && r9 > 1) {
    if (r9 === BT_RUNNING) {
      m.resume = child;
      return { own: r9, finished: true };
    }
    m.resume = node.firstChild;
    return { own: r9, finished: true };
  }
  if (child !== node.lastChild || s === BT_FRESH) return { own: r9, finished: false };
  if (r9 === BT_SUCCESS) m.resume = node.firstChild;
  return { own: r9, finished: true };
}

/** Concurrent (0x7eb0f0): every child runs; a FAILURE ends it (bar Max
 *  Failures), a SUCCESS ends it under Exit on Success; its status the worst
 *  of its children's */
function concurrentChild(node: BtNode, run: BtRun, own: number, s: number, child: number): { own: number; finished: boolean } {
  const m = run.mem[node.index];
  const maxFailures = dataInt(node, 'Max Failures');
  const exitOnSuccess = dataBool(node, 'Exit on Success');
  let v: number;
  if (s !== BT_FAILURE) {
    m.lastOk = child;
    if (exitOnSuccess && s === BT_SUCCESS) {
      return { own: s, finished: true };
    }
    v = s;
  } else if (maxFailures !== undefined) {
    if (child > ((m.lastOk as number | undefined) ?? -1)) {
      m.failures = ((m.failures as number | undefined) ?? 0) + 1;
      v = (m.failures as number) < maxFailures ? BT_SUCCESS : BT_FAILURE;
    } else v = BT_SUCCESS;
  } else v = BT_FAILURE;
  const next = Math.max(own, v);
  if (next === BT_FAILURE || next === BT_ERROR) return { own: next, finished: true };
  if (child === node.lastChild && s !== BT_FRESH) return { own: next, finished: true };
  return { own: next, finished: false };
}

/** the decorators with no logic of their own over the child (In Difficulty
 *  Range, Has Player Ability, Naval Choose Target: 0x7f15a0): the child's
 *  finished status is theirs */
function passChild(own: number, s: number): { own: number; finished: boolean } {
  if (s === BT_FRESH) return { own, finished: false };
  return { own: s, finished: true };
}

/** Not (0x7f15f0): SUCCESS and RUNNING become FAILURE, FAILURE SUCCESS */
function notChild(s: number): { own: number; finished: boolean } {
  if (s === BT_SUCCESS || s === BT_RUNNING) return { own: BT_FAILURE, finished: true };
  return { own: s === BT_FAILURE ? BT_SUCCESS : s, finished: true };
}

export const BUILTIN_CHILD: Readonly<Record<string, (node: BtNode, run: BtRun, own: number, s: number, child: number) => { own: number; finished: boolean }>> = {
  Priority: (n, _r, own, s, c) => priorityChild(n, own, s, c),
  Sequence: sequenceChild,
  Concurrent: concurrentChild,
  Not: (_n, _r, _own, s) => notChild(s),
  'In Difficulty Range': (_n, _r, own, s) => passChild(own, s),
  'Has Player Ability': (_n, _r, own, s) => passChild(own, s),
  'Naval Choose Target': (_n, _r, own, s) => passChild(own, s),
};

/** One tick of the tree: the walk, then the actions' execution. The tree is
 *  done where its root ends anything but RUNNING. */
export function tick<C>(run: BtRun, handlers: Readonly<Record<string, BtHandler<C>>>, ctx: C): number {
  const { nodes, status } = run;
  if (status[0] !== BT_FRESH && status[0] !== BT_SKIPPED) return status[0];
  let i = 0;
  while (i < nodes.length) {
    const n = nodes[i];
    const h = handlers[n.type];
    if (n.parent >= 0 && status[n.parent] === BT_SKIPPED) status[i] = BT_SKIPPED;
    else if (n.shape === SHAPE_SELECTOR && !h) {
      // a Concurrent's update (0x7eb210) clears its failures and its last good child
      if (n.type === 'Concurrent') Object.assign(run.mem[i], { failures: 0, lastOk: 0 });
      status[i] = BT_FRESH;
    }
    else if (!h) throw new Error(`bt: no handler for ${n.type} (${run.name} node ${i})`);
    else status[i] = h.update(n, run, ctx);
    const own = h?.next ? h.next(n, run) : n.type === 'Sequence'
      ? Math.max(((run.mem[i].resume as number | undefined) ?? n.firstChild), i + 1) : i + 1;
    i = Math.max(own, propagate(run, handlers, ctx, i));
  }
  const root: number = run.status[0];
  if (root === BT_SUCCESS || root === BT_RUNNING || root === BT_FAILURE) {
    nodes.forEach((n, k) => {
      if (status[k] !== BT_SUCCESS && status[k] !== BT_RUNNING) return;
      handlers[n.type]?.execute?.(n, run, ctx);
    });
  }
  if (root === BT_RUNNING || root === BT_FRESH) status.fill(BT_FRESH);
  else run.done = true;
  return root;
}

/** a finished node told to its parents (0x7d1750): the furthest node the
 *  walk skips to, 0 where none finished */
function propagate<C>(run: BtRun, handlers: Readonly<Record<string, BtHandler<C>>>, ctx: C, i: number): number {
  const n = run.nodes[i];
  if (n.parent < 0) return 0;
  const p = run.nodes[n.parent];
  if (p.shape !== SHAPE_SELECTOR && p.shape !== SHAPE_DECORATOR) return 0;
  const fn = handlers[p.type]?.child;
  const builtin = BUILTIN_CHILD[p.type];
  const r = fn ? fn(p, run, run.status[p.index], run.status[i], i, ctx) : builtin ? builtin(p, run, run.status[p.index], run.status[i], i)
    : passChild(run.status[p.index], run.status[i]);
  run.status[p.index] = r.own;
  if (!r.finished) return 0;
  return Math.max(p.end, propagate(run, handlers, ctx, p.index));
}
