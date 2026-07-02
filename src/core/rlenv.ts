/**
 * Reinforcement-learning environment (stage 12): a gym-style macro-action
 * wrapper over the full simulation. Decisions happen when a city's queue
 * runs dry; everything else (citizens, research, borders, builders,
 * defense, scouting, barbarians, disasters) runs on autopilot between
 * decisions. Reward = empire score at a fixed horizon; runs are fully
 * reproducible from (seed, action indices).
 */

import type { City, GameState, Unit } from './types';
import { createGame, endTurn, queueBuilding, queueDistrict, queueWonder, queueSettler, foundCity } from './game';
import { compareCandidates, scoreSettleSites, choiceLabel, type BuildChoice } from './advisor';
import { empireScore } from './empirePlanner';
import type { Objective } from './planner';
import { computeCityStats } from './city';
import { districtAdjacency } from './yields';
import { trainableUnits, queueUnit, orderMove, builderImprove, builderRepair, setExploreMission, unitDomain } from './units';
import { attackTargets, meleeAttack, getCityHp } from './combat';
import { initFog } from './fog';
import { validImprovements } from './rules';
import { hexDistance } from './hex';
import { UNITS, CITY_MAX_HP } from '../data/units';

export type EnvAction =
  | BuildChoice
  | { kind: 'settlerAt'; tileIndex: number }
  | { kind: 'trainUnit'; unit: string };

export interface Candidate {
  action: EnvAction;
  label: string;
  /** Fixed-length feature vector for linear/NN policies. */
  features: number[];
}

export const CANDIDATE_FEATURES = 12;
export const OBSERVATION_SIZE = 16;

export interface EnvOptions {
  seed: number;
  width?: number;
  height?: number;
  horizon?: number;
  objective?: Objective;
  unitsMode?: boolean;
  fogOfWar?: boolean;
  disasters?: boolean;
}

export interface StepResult {
  observation: number[];
  candidates: Candidate[];
  reward: number;
  done: boolean;
  turn: number;
}

// ---------------------------------------------------------------------------
// Auto-policies for everything that isn't a macro decision
// ---------------------------------------------------------------------------

function autoBuilder(state: GameState, unit: Unit): void {
  const tile = state.map.tiles[unit.tileIndex];
  if (tile.pillaged && tile.cityId !== -1) {
    builderRepair(state, unit.id);
    return;
  }
  const options = validImprovements(state, tile);
  if (options.length > 0 && !tile.improvement && tile.cityId !== -1) {
    builderImprove(state, unit.id, options[0]);
    return;
  }
  if (unit.path) return;
  // Head to the nearest ownable job: pillaged tile first, then unimproved.
  let best: number | null = null;
  let bestDist = 99;
  for (const t of state.map.tiles) {
    if (t.cityId === -1) continue;
    const job = (t.pillaged || (!t.improvement && validImprovements(state, t).length > 0));
    if (!job) continue;
    const d = hexDistance(tile.col, tile.row, t.col, t.row);
    if (d < bestDist) {
      bestDist = d;
      best = t.index;
    }
  }
  if (best !== null && best !== unit.tileIndex) orderMove(state, unit.id, best);
}

function autoMilitary(state: GameState, unit: Unit): void {
  // Fight anything in reach.
  const targets = attackTargets(state, unit);
  if (targets.length > 0) {
    meleeAttack(state, unit.id, targets[0]);
    return;
  }
  if (unit.path) return;
  const here = state.map.tiles[unit.tileIndex];
  // Chase barbarians threatening the empire.
  let prey: number | null = null;
  let preyDist = 8;
  for (const b of state.units) {
    if (b.owner !== 'barbarian') continue;
    const bt = state.map.tiles[b.tileIndex];
    const nearEmpire = state.cities.some((c) => {
      const ct = state.map.tiles[c.centerIndex];
      return hexDistance(bt.col, bt.row, ct.col, ct.row) <= 6;
    });
    if (!nearEmpire) continue;
    const d = hexDistance(here.col, here.row, bt.col, bt.row);
    if (d < preyDist) {
      preyDist = d;
      prey = b.tileIndex;
    }
  }
  if (prey !== null) {
    // Move adjacent to the prey (its tile itself is enemy-blocked).
    const pt = state.map.tiles[prey];
    const spot = state.map.tiles
      .filter((t) => hexDistance(t.col, t.row, pt.col, pt.row) === 1)
      .sort((a, b) => hexDistance(a.col, a.row, here.col, here.row) - hexDistance(b.col, b.row, here.col, here.row))[0];
    if (spot) orderMove(state, unit.id, spot.index);
    return;
  }
  // Otherwise garrison the nearest city.
  const home = state.cities
    .map((c) => c.centerIndex)
    .sort((a, b) => {
      const ta = state.map.tiles[a];
      const tb = state.map.tiles[b];
      return hexDistance(ta.col, ta.row, here.col, here.row) - hexDistance(tb.col, tb.row, here.col, here.row);
    })[0];
  if (home !== undefined && home !== unit.tileIndex) orderMove(state, unit.id, home);
}

function playerAutoPhase(state: GameState): void {
  if (!state.unitsMode) return;
  for (const unit of [...state.units]) {
    if (unit.owner !== 'player' || unit.movesLeft <= 0) continue;
    if (!state.units.includes(unit)) continue; // died mid-phase
    const def = UNITS[unit.type];
    if (def?.charges !== undefined) {
      autoBuilder(state, unit);
    } else if (unit.type === 'SCOUT' && state.fogOfWar) {
      if (unit.mission !== 'explore') setExploreMission(state, unit.id, true);
    } else if ((def?.combat ?? 0) > 0) {
      autoMilitary(state, unit);
    }
  }
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

export class CivEnv {
  state!: GameState;
  horizon: number;
  objective: Objective;
  private pendingCityId: number | null = null;
  private lastScore = 0;

  constructor(private opts: EnvOptions) {
    this.horizon = opts.horizon ?? 100;
    this.objective = opts.objective ?? 'balanced';
  }

  reset(): StepResult {
    this.state = createGame({
      width: this.opts.width ?? 44,
      height: this.opts.height ?? 26,
      seed: this.opts.seed,
      unitsMode: this.opts.unitsMode ?? true,
    });
    this.state.disasters = this.opts.disasters ?? true;
    // Settle the starting position, then drop the fog.
    const sites = scoreSettleSites(this.state, 1);
    if (sites.length > 0) foundCity(this.state, sites[0].tileIndex);
    if (this.opts.fogOfWar ?? true) {
      this.state.fogOfWar = true;
      initFog(this.state);
    }
    this.lastScore = empireScore(this.state, this.objective);
    return this.advance();
  }

  /** Apply the chosen candidate, then simulate to the next decision point. */
  step(actionIndex: number): StepResult {
    const cands = this.candidates();
    const chosen = cands[actionIndex];
    if (chosen && this.pendingCityId !== null) {
      this.apply(this.pendingCityId, chosen.action);
    }
    return this.advance();
  }

  private apply(cityId: number, action: EnvAction): void {
    const s = this.state;
    switch (action.kind) {
      case 'none':
        break;
      case 'building':
        queueBuilding(s, cityId, action.id);
        break;
      case 'district':
        queueDistrict(s, cityId, action.type, action.tileIndex);
        break;
      case 'wonder':
        queueWonder(s, cityId, action.wonder, action.tileIndex);
        break;
      case 'settlerAt':
        queueSettler(s, cityId);
        s.plannedSettles.push(action.tileIndex);
        break;
      case 'trainUnit':
        queueUnit(s, cityId, action.unit);
        break;
    }
  }

  private idleCity(): City | null {
    for (const c of [...this.state.cities].sort((a, b) => a.id - b.id)) {
      if (c.queue.length === 0) return c;
    }
    return null;
  }

  private advance(): StepResult {
    const s = this.state;
    while (s.turn < this.horizon) {
      const idle = this.idleCity();
      if (idle) {
        this.pendingCityId = idle.id;
        const cands = this.candidates();
        if (cands.length > 0) {
          return this.result(false);
        }
        this.pendingCityId = null;
      }
      playerAutoPhase(s);
      endTurn(s);
    }
    this.pendingCityId = null;
    return this.result(true);
  }

  private result(done: boolean): StepResult {
    const score = empireScore(this.state, this.objective);
    const reward = done ? score : score - this.lastScore; // shaped delta + terminal level
    this.lastScore = score;
    return {
      observation: this.observation(),
      candidates: done ? [] : this.candidates(),
      reward,
      done,
      turn: this.state.turn,
    };
  }

  /** Candidates for the pending city (empty when no decision is pending). */
  candidates(): Candidate[] {
    const s = this.state;
    if (this.pendingCityId === null) return [];
    const city = s.cities.find((c) => c.id === this.pendingCityId);
    if (!city) return [];

    const out: Candidate[] = [];
    for (const choice of compareCandidates(s, city.id)) {
      if (choice.kind === 'none') continue;
      out.push({ action: choice, label: choiceLabel(choice), features: this.features(city, choice) });
    }
    const sites = scoreSettleSites(s, 1);
    if (sites.length > 0) {
      out.push({
        action: { kind: 'settlerAt', tileIndex: sites[0].tileIndex },
        label: `Settler → site ${sites[0].score.toFixed(0)}`,
        features: this.features(city, { kind: 'settlerAt', tileIndex: sites[0].tileIndex }, sites[0].score),
      });
    }
    if (s.unitsMode) {
      for (const u of trainableUnits(s)) {
        if (u.id !== 'BUILDER' && u.id !== 'SCOUT' && u.combat === 0) continue;
        out.push({
          action: { kind: 'trainUnit', unit: u.id },
          label: `Train ${u.name}`,
          features: this.features(city, { kind: 'trainUnit', unit: u.id }),
        });
      }
    }
    return out.slice(0, 16);
  }

  /** Per-candidate features: [kind one-hot ×6, cost/100, adjacency/5, siteScore/50, threat, builders, military]. */
  private features(city: City, action: EnvAction, siteScore = 0): number[] {
    const s = this.state;
    const kinds = ['building', 'district', 'wonder', 'settlerAt', 'trainUnit', 'none'];
    const kindIdx = kinds.indexOf(action.kind);
    const oneHot = kinds.map((_, i) => (i === kindIdx ? 1 : 0));
    let cost = 0;
    let adjacency = 0;
    if (action.kind === 'building') cost = 1;
    if (action.kind === 'district') {
      cost = 1;
      adjacency = districtAdjacency(s.map, s.map.tiles[action.tileIndex], action.type) / 5;
    }
    if (action.kind === 'trainUnit') cost = (UNITS[action.unit]?.cost ?? 50) / 100;
    const barbNear = s.units.filter((u) => {
      if (u.owner !== 'barbarian') return false;
      const bt = s.map.tiles[u.tileIndex];
      const ct = s.map.tiles[city.centerIndex];
      return hexDistance(bt.col, bt.row, ct.col, ct.row) <= 6;
    }).length;
    const builders = s.units.filter((u) => u.owner === 'player' && unitDomain(u.type) === 'civilian').length;
    const military = s.units.filter((u) => u.owner === 'player' && unitDomain(u.type) === 'military').length;
    return [...oneHot, cost, adjacency, siteScore / 50, Math.min(1, barbNear / 3), Math.min(1, builders / 3), Math.min(1, military / 4)];
  }

  /** Empire-level observation vector (OBSERVATION_SIZE numbers, roughly normalized). */
  observation(): number[] {
    const s = this.state;
    let yields = { food: 0, production: 0, gold: 0, science: 0, culture: 0, faith: 0 };
    let pop = 0;
    let hpDeficit = 0;
    for (const c of s.cities) {
      const st = computeCityStats(s, c);
      for (const k of Object.keys(yields) as (keyof typeof yields)[]) yields[k] += st.total[k];
      pop += c.population;
      hpDeficit += (CITY_MAX_HP - getCityHp(s, c.id)) / CITY_MAX_HP;
    }
    const barbs = s.units.filter((u) => u.owner === 'barbarian').length;
    const pillaged = s.map.tiles.filter((t) => t.pillaged).length;
    const exploredFrac =
      s.explored.length > 0 ? s.explored.filter((e) => e === 1).length / s.explored.length : 1;
    return [
      s.turn / this.horizon,
      s.cities.length / 8,
      pop / 40,
      yields.food / 50,
      yields.production / 50,
      yields.gold / 50,
      yields.science / 50,
      yields.culture / 50,
      yields.faith / 50,
      Math.max(-1, Math.min(1, s.treasury / 500)),
      (s.research.techs.length + s.research.civics.length) / 50,
      Math.min(1, barbs / 6),
      Math.min(1, pillaged / 10),
      hpDeficit,
      Math.min(1, s.settlers / 2),
      exploredFrac,
    ];
  }
}

/** Score = w·features; the trainer optimizes w over seeds. */
export function linearPolicy(weights: number[]): (obs: number[], cands: Candidate[]) => number {
  return (_obs, cands) => {
    let best = 0;
    let bestScore = -Infinity;
    cands.forEach((c, i) => {
      let score = 0;
      for (let j = 0; j < c.features.length && j < weights.length; j++) {
        score += weights[j] * c.features[j];
      }
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  };
}

/** Run one full episode with a policy; returns the terminal score. */
export function runEpisode(
  opts: EnvOptions,
  policy: (obs: number[], cands: Candidate[]) => number,
): { score: number; decisions: number; turns: number } {
  const env = new CivEnv(opts);
  let r = env.reset();
  let decisions = 0;
  let guard = 0;
  while (!r.done && guard++ < 2000) {
    r = env.step(policy(r.observation, r.candidates));
    decisions++;
  }
  return { score: empireScore(env.state, env.objective), decisions, turns: env.state.turn };
}
