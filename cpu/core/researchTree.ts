/**
 * THE GAME'S RANDOM FUTURE TREE (GameCore_XP2 Game_Techs.cpp 0x351fc0 for
 * the techs, Game_Civics 0x2976d0 for the civics, both from the game's set-up
 * 0xa56500; `tools/civ6lab/dll_readings.md` "H-1: the random Future tree").
 * At its start the game draws, on its synchronous generator, the civics'
 * tree and then the techs':
 *
 * - THE COSTS: per row in table order, a row with random Cost rows
 *   (TechnologyRandomCosts / CivicRandomCosts) draws one of those whose cost
 *   level holds fewer than 7 rows yet, uniformly ("Choosing a random cost for
 *   a tech to have", range their count); every row then joins its cost
 *   level.
 * - THE PREREQUISITES: the levels in ascending cost; a level's candidates
 *   are the rows of the nearest lower level that holds any, each weight 100,
 *   their order the table's. Each RandomPrereqs row of the level (table
 *   order) draws how many it takes ("Choosing how many prerequisites for a
 *   tech to have", range ceil(candidates / the level's rows); the draw plus
 *   one, at most the candidates), then that many weighted picks ("Choosing a
 *   random prerequisite for a tech to have"), a pick held once and its weight
 *   set to 1 for the level's later rows.
 *
 * Every other row keeps its install prerequisites and Cost.
 * runs/h1_duely1124 (setup draws 98-137): Seasteads on Nanotechnology,
 * Cybernetics on Nuclear Fusion, Smart Materials on Robotics, all three at
 * 2200 — 377 / 516 / 516 turns at t216 as AI_Research.csv logs them.
 */
import { TECHS, TECH_TABLE_ORDER } from '../data/techs';
import { CIVICS, CIVIC_TABLE_ORDER } from '../data/civics';
import type { DrawLabel } from './rand';
import type { GameState } from './types';

/** the game's drawn tree: each RandomPrereqs row's prerequisites in the
 *  order drawn, each random-cost row's Cost (the install's Standard-speed
 *  Cost, `researchCost`'s base) */
export interface ResearchTree {
  prereqs: Record<string, string[]>;
  baseCost: Record<string, number>;
}

/** a draw on the game's generator: [0, n) under the site's label */
export type TreeDraw = (n: number, label: DrawLabel) => number;

/** the most rows a cost level takes before its random Costs are passed over
 *  (0x3521d7) */
const LEVEL_MAX = 7;
/** a candidate's weight, and a drawn candidate's after (0x3528de, 0x352d9a) */
const PICK_WEIGHT = 100;
const PICKED_WEIGHT = 1;

interface TreeRow {
  baseCost: number;
  prereqs: readonly string[];
  randomPrereqs?: boolean;
  randomCosts?: readonly number[];
}

function drawOne(order: readonly string[], rows: Readonly<Record<string, TreeRow>>, kind: 'tech' | 'civic',
  draw: TreeDraw, out: ResearchTree): void {
  const levels = new Map<number, string[]>();
  for (const id of order) {
    const row = rows[id];
    if (!row) continue;
    let cost = row.baseCost;
    const open = (row.randomCosts ?? []).filter((c) => (levels.get(c)?.length ?? 0) < LEVEL_MAX);
    if (open.length) {
      cost = open[draw(open.length, kind === 'tech' ? 'Choosing a random cost for a tech to have' : 'Choosing a random cost for a civic to have')];
      out.baseCost[id] = cost;
    }
    const level = levels.get(cost);
    if (level) level.push(id);
    else levels.set(cost, [id]);
  }
  const keys = [...levels.keys()].sort((a, b) => a - b);
  for (let k = 0; k < keys.length; k++) {
    let cand: { id: string; w: number }[] = [];
    for (let j = k - 1; j >= 0 && !cand.length; j--) cand = levels.get(keys[j])!.map((id) => ({ id, w: PICK_WEIGHT }));
    const level = levels.get(keys[k])!;
    for (const id of level) {
      if (!rows[id].randomPrereqs) continue;
      const got: string[] = [];
      out.prereqs[id] = got;
      if (!cand.length) continue;
      const many = draw(Math.ceil(cand.length / level.length),
        kind === 'tech' ? 'Choosing how many prerequisites for a tech to have' : 'Choosing how many prerequisites for a civic to have');
      const n = Math.min(Math.max(many + 1, 1), cand.length);
      for (let i = 0; i < n; i++) {
        let v = draw(cand.reduce((s, c) => s + c.w, 0),
          kind === 'tech' ? 'Choosing a random prerequisite for a tech to have' : 'Choosing a random prerequisite for a civic to have');
        let at = 0;
        for (; at < cand.length - 1; at++) {
          v -= cand[at].w;
          if (v < 0) break;
        }
        if (!got.includes(cand[at].id)) got.push(cand[at].id);
        cand[at].w = PICKED_WEIGHT;
      }
    }
  }
}

/** THE DRAW at the game's start: the civics' tree, then the techs' */
export function drawResearchTree(draw: TreeDraw): ResearchTree {
  const out: ResearchTree = { prereqs: {}, baseCost: {} };
  drawOne(CIVIC_TABLE_ORDER, CIVICS, 'civic', draw, out);
  drawOne(TECH_TABLE_ORDER, TECHS, 'tech', draw, out);
  return out;
}

/** a row's prerequisites in this game: a RandomPrereqs row's drawn, any
 *  other's the install's */
export function treePrereqs(state: GameState, id: string): readonly string[] {
  const row = TECHS[id] ?? CIVICS[id];
  if (!row) return [];
  return row.randomPrereqs ? state.researchTree.prereqs[id] ?? [] : row.prereqs;
}

/** a row's Standard-speed Cost in this game: a random-cost row's drawn */
export function treeBaseCost(state: GameState, id: string): number {
  return state.researchTree.baseCost[id] ?? (TECHS[id] ?? CIVICS[id]).baseCost;
}

const requiredMemo = new WeakMap<ResearchTree, ReadonlySet<string>>();

/** the rows some row of this game requires (the research comparator's leaf
 *  flag is their complement) */
export function requiredRows(state: GameState): ReadonlySet<string> {
  const tree = state.researchTree;
  let out = requiredMemo.get(tree);
  if (!out) {
    out = new Set([...Object.keys(TECHS), ...Object.keys(CIVICS)].flatMap((id) => [...treePrereqs(state, id)]));
    requiredMemo.set(tree, out);
  }
  return out;
}
