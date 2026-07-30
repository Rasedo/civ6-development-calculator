/**
 * Reinforcement-learning environment: a gym-style macro-action wrapper over
 * the full simulation. The agent decides city production (builds, projects,
 * purchases, settlers, units), research and civic picks, policy cards and
 * government switches; everything else (citizens, borders, builders,
 * defense, scouting, barbarians, disasters) runs on autopilot between
 * decisions. Reward = empire score at a fixed horizon; runs are fully
 * reproducible from (seed, action indices).
 */

import type { City, GameState, Unit, Yields } from './types';
import { playerSeat } from './seats';
import { YIELD_KEYS, emptyYields, addYields } from './types';
import {
  createGame,
  endTurn,
  TURN_LIMIT,
  queueBuilding,
  queueDistrict,
  queueWonder,
  queueSettler,
  foundCity,
  serialize,
  deserialize,
  setGovernment,
  setTechResearch,
  setCivicResearch,
  effectiveResearchCost,
  districtCost,
  settlerCost,
  availableProjects,
  projectCost,
  queueProject,
  purchaseBuilding,
  purchaseUnit,
  purchaseSettler,
  buildingPurchaseCost,
  buildingFaithCost,
  unitPurchaseCost,
  greatPeopleEarned,
} from './game';
import { compareCandidates, scoreSettleSites, choiceLabel, type BuildChoice } from './advisor';
import { empireScore } from './empirePlanner';
import type { Objective } from './planner';
import { computeCityStats } from './city';
import { districtAdjacency } from './yields';
import { availableBuildings, buildingCompletable } from './rules';
import { computeUnlocks, availableTechs, availableCivics, governmentSlots } from './effects';
import { trainableUnits, queueUnit, orderMove, builderImprove, builderRepair, setExploreMission, unitDomain } from './units';
import { attackTargets, meleeAttack, getCityHp } from './combat';
import { initFog } from './fog';
import { validImprovements } from './rules';
import { hexDistance } from './hex';
import { UNITS, CITY_MAX_HP } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { DISTRICTS } from '../data/districts';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot } from '../data/policies';
import { PROJECT_YIELD_FRACTION } from '../data/projects';
import { GP_CLASSES, gpCost } from '../data/greatPeople';
import { neighbors } from './hex';
import { tileFreeForUnit, unitsHostile } from './units';
import { assignEnvoy, envoyBonusDelta, metCityStates, isSuzerain } from './cityStates';
import { playerStrength, rivalStrength, rivalProximity } from './rivals';

export type EnvAction =
  | BuildChoice
  | { kind: 'settlerAt'; tileIndex: number }
  | { kind: 'trainUnit'; unit: string }
  | { kind: 'purchaseBuilding'; id: string }
  | { kind: 'purchaseUnit'; unit: string }
  | { kind: 'purchaseSettler' }
  | { kind: 'project'; id: string }
  | { kind: 'research'; id: string }
  | { kind: 'civic'; id: string }
  | { kind: 'setPolicy'; card: string; slot: number }
  | { kind: 'keepPolicies' }
  | { kind: 'setGovernment'; id: string }
  | { kind: 'keepGovernment' }
  | { kind: 'assignEnvoy'; csId: number };

export type PendingDecision =
  | { type: 'production'; cityId: number }
  | { type: 'research' }
  | { type: 'civic' }
  | { type: 'policy' }
  | { type: 'government' }
  | { type: 'envoy' };

export interface Candidate {
  action: EnvAction;
  label: string;
  /** Fixed-length feature vector for linear/NN policies. */
  features: number[];
}

/** One-hot slot order for the candidate's kind (first CAND_KINDS features). */
const CAND_KINDS = [
  'building',
  'district',
  'wonder',
  'settlerAt',
  'trainUnit',
  'purchase',
  'project',
  'research',
  'civic',
  'policy',
  'government',
  'envoy',
  'keep',
] as const;

/**
 * Bump when the feature/observation layout OR the environment's dynamics
 * change enough to invalidate trained weights and benchmarks. v5: deeper
 * opponents (rival tile economies, barbarian↔rival combat, city-state
 * conquest/levies, loyalty pressure) — same layout as v4, harder world.
 */
export const FEATURE_VERSION = 5;
export const CANDIDATE_FEATURES = CAND_KINDS.length + 16; // 29
export const OBSERVATION_SIZE = 30;
export const MAX_CANDIDATES = 24;

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
  // Chase hostiles (barbarians, at-war rivals) threatening the empire.
  let prey: number | null = null;
  let preyDist = 8;
  for (const b of state.units) {
    if (!unitsHostile(state, unit, b)) continue;
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

export function playerAutoPhase(state: GameState): void {
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
  pending: PendingDecision | null = null;
  private lastScore = 0;
  /** Civics count at which the agent last settled policies / government. */
  private policySettledAt = 0;
  private govSettledAt = 0;
  /** Policy actions taken this wave (bounds eviction ping-pong). */
  private policyMoves = 0;

  constructor(private opts: EnvOptions) {
    this.horizon = opts.horizon ?? TURN_LIMIT; // default: the game's own length (score victory)
    this.objective = opts.objective ?? 'balanced';
  }

  reset(): StepResult {
    this.state = createGame({
      width: this.opts.width ?? 44,
      height: this.opts.height ?? 26,
      seed: this.opts.seed,
      unitsMode: this.opts.unitsMode ?? true,
      cityStates: true,
      rivals: true,
    });
    this.state.disasters = this.opts.disasters ?? true;
    this.state.autoResearch = false; // research is the agent's job
    // Settle the starting position, then drop the fog.
    const sites = scoreSettleSites(this.state, 1);
    if (sites.length > 0) foundCity(this.state, sites[0].tileIndex);
    if (this.opts.fogOfWar ?? true) {
      this.state.fogOfWar = true;
      initFog(this.state);
    }
    this.pending = null;
    this.policySettledAt = 0;
    this.govSettledAt = 0;
    this.policyMoves = 0;
    this.lastScore = empireScore(this.state, this.objective);
    return this.advance();
  }

  /** Apply the chosen candidate, then simulate to the next decision point. */
  step(actionIndex: number): StepResult {
    const cands = this.candidates();
    const chosen = cands[actionIndex];
    if (chosen && this.pending) {
      this.apply(this.pending, chosen.action);
    }
    return this.advance();
  }

  private apply(decision: PendingDecision, action: EnvAction): void {
    applyEnvAction(this.state, decision, action);
    // Wave bookkeeping (env-local: bounds policy ping-pong per civic wave).
    const s = this.state;
    switch (action.kind) {
      case 'setPolicy':
        this.policyMoves += 1;
        if (
          !s.government.policies.includes(null) ||
          this.policyMoves >= governmentSlots(s).length + 2
        ) {
          this.settlePolicies();
        }
        break;
      case 'keepPolicies':
        this.settlePolicies();
        break;
      case 'setGovernment':
        this.govSettledAt = s.research.civics.length;
        // A new government opens fresh slots: revisit policies right away.
        this.policySettledAt = s.research.civics.length - 1;
        this.policyMoves = 0;
        break;
      case 'keepGovernment':
        this.govSettledAt = s.research.civics.length;
        break;
      default:
        break;
    }
  }

  private settlePolicies(): void {
    this.policySettledAt = this.state.research.civics.length;
    this.policyMoves = 0;
  }

  /** Find the next decision that actually has choices, in priority order. */
  private nextDecision(): PendingDecision | null {
    const s = this.state;
    if (s.research.civics.length > this.govSettledAt) {
      const d: PendingDecision = { type: 'government' };
      if (envCandidates(s, d).length > 1) return d;
      this.govSettledAt = s.research.civics.length;
    }
    if (s.research.civics.length > this.policySettledAt) {
      const d: PendingDecision = { type: 'policy' };
      if (envCandidates(s, d).length > 1) return d;
      this.settlePolicies();
    }
    if (s.research.tech === null && availableTechs(s).length > 0) {
      return { type: 'research' };
    }
    if (s.research.civic === null && availableCivics(s).length > 0) {
      return { type: 'civic' };
    }
    if (playerSeat(s).envoysAvailable > 0 && metCityStates(s).length > 0) {
      return { type: 'envoy' };
    }
    for (const c of [...s.cities].sort((a, b) => a.id - b.id)) {
      if (c.queue.length > 0) continue;
      const d: PendingDecision = { type: 'production', cityId: c.id };
      if (envCandidates(s, d).length > 0) return d;
    }
    return null;
  }

  private advance(): StepResult {
    const s = this.state;
    while (s.turn < this.horizon) {
      const d = this.nextDecision();
      if (d) {
        this.pending = d;
        return this.result(false);
      }
      this.pending = null;
      playerAutoPhase(s);
      endTurn(s);
    }
    this.pending = null;
    return this.result(true);
  }

  private result(done: boolean): StepResult {
    const score = empireScore(this.state, this.objective);
    const reward = done ? score : score - this.lastScore; // shaped delta + terminal level
    this.lastScore = score;
    return {
      observation: envObservation(this.state, this.horizon),
      candidates: done ? [] : this.candidates(),
      reward,
      done,
      turn: this.state.turn,
    };
  }

  /** Candidates for the pending decision (empty when none is pending). */
  candidates(): Candidate[] {
    return this.pending ? envCandidates(this.state, this.pending) : [];
  }

}

/**
 * Apply an env action to a game state (the pure mutations, no env-internal
 * bookkeeping). Exposed for the UI advisor's "do it" buttons.
 */
export function applyEnvAction(state: GameState, decision: PendingDecision, action: EnvAction): void {
  const s = state;
  const cityId = decision.type === 'production' ? decision.cityId : -1;
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
    case 'purchaseBuilding':
      purchaseBuilding(s, cityId, action.id);
      break;
    case 'purchaseUnit':
      purchaseUnit(s, cityId, action.unit);
      break;
    case 'purchaseSettler':
      purchaseSettler(s, cityId);
      break;
    case 'project':
      queueProject(s, cityId, action.id);
      break;
    case 'research':
      setTechResearch(s, action.id);
      break;
    case 'civic':
      setCivicResearch(s, action.id);
      break;
    case 'setPolicy':
      padPolicySlots(s);
      s.government.policies[action.slot] = action.card;
      break;
    case 'keepPolicies':
      break;
    case 'setGovernment':
      setGovernment(s, action.id);
      break;
    case 'keepGovernment':
      break;
    case 'assignEnvoy':
      assignEnvoy(s, action.csId);
      break;
  }
}

/**
 * Every decision that has real choices RIGHT NOW on this state — the UI
 * advisor surface. Unlike CivEnv's nextDecision, no wave bookkeeping:
 * policy/government suggestions appear whenever alternatives exist.
 */
export function uiPendingDecisions(state: GameState): PendingDecision[] {
  const out: PendingDecision[] = [];
  if (envCandidates(state, { type: 'government' }).length > 1) out.push({ type: 'government' });
  if (envCandidates(state, { type: 'policy' }).length > 1) out.push({ type: 'policy' });
  if (state.research.tech === null && availableTechs(state).length > 0) out.push({ type: 'research' });
  if (state.research.civic === null && availableCivics(state).length > 0) out.push({ type: 'civic' });
  if (playerSeat(state).envoysAvailable > 0 && metCityStates(state).length > 0) out.push({ type: 'envoy' });
  for (const c of [...state.cities].sort((a, b) => a.id - b.id)) {
    if (c.queue.length > 0) continue;
    const d: PendingDecision = { type: 'production', cityId: c.id };
    if (envCandidates(state, d).length > 0) out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Candidate generation, observation and action application (standalone so the
// UI advisor can run them on any GameState, not just inside CivEnv)
// ---------------------------------------------------------------------------

export function envCandidates(state: GameState, decision: PendingDecision): Candidate[] {
  switch (decision.type) {
    case 'production':
      return productionCandidates(state, decision.cityId);
    case 'research':
      return researchCandidates(state, 'tech');
    case 'civic':
      return researchCandidates(state, 'civic');
    case 'policy':
      return policyCandidates(state);
    case 'government':
      return governmentCandidates(state);
    case 'envoy':
      return envoyCandidates(state);
  }
}

function envoyCandidates(state: GameState): Candidate[] {
  const s = state;
  return metCityStates(s).map((cs) => {
    const next = cs.envoys + 1;
    const crossing = next === 1 || next === 3 || next === 6 ? 1 : 0;
    return makeCandidate(state, 
      { kind: 'assignEnvoy', csId: cs.id },
      `Envoy → ${cs.name} (${cs.type}, ${cs.envoys})`,
      'envoy',
      { delta: envoyBonusDelta(s, cs), unlocks: crossing },
    );
  });
}

// --- production ------------------------------------------------------------

function productionCandidates(state: GameState, cityId: number): Candidate[] {
  const s = state;
  const city = s.cities.find((c) => c.id === cityId);
  if (!city) return [];
  const prod = Math.max(1, computeCityStats(s, city).total.production);
  const out: Candidate[] = [];

  for (const choice of compareCandidates(s, city.id)) {
    if (choice.kind === 'none') continue;
    out.push(buildCandidate(state, city, choice, prod));
  }
  for (const p of availableProjects(s, city)) {
    const cost = projectCost(s);
    const delta = emptyYields();
    if (p.yield) delta[p.yield] = prod * PROJECT_YIELD_FRACTION;
    out.push(
      makeCandidate(state, { kind: 'project', id: p.id }, p.name, 'project', {
        cost,
        turns: cost / prod,
        delta,
        city,
      }),
    );
  }
  for (const site of scoreSettleSites(s, 3)) {
    out.push(
      makeCandidate(state, 
        { kind: 'settlerAt', tileIndex: site.tileIndex },
        `Settler → (${s.map.tiles[site.tileIndex].col},${s.map.tiles[site.tileIndex].row})`,
        'settlerAt',
        { cost: settlerCost(s), turns: settlerCost(s) / prod, siteScore: site.score, city },
      ),
    );
  }
  if (s.unitsMode) {
    for (const u of trainableUnits(s)) {
      if (u.id !== 'BUILDER' && u.id !== 'SCOUT' && u.combat === 0) continue;
      out.push(
        makeCandidate(state, { kind: 'trainUnit', unit: u.id }, `Train ${u.name}`, 'trainUnit', {
          cost: u.cost,
          turns: u.cost / prod,
          city,
        }),
      );
    }
  }
  out.push(...purchaseCandidates(state, city));
  return out.slice(0, MAX_CANDIDATES);
}

function buildCandidate(state: GameState, city: City, choice: BuildChoice, prod: number): Candidate {
  const s = state;
  const delta = emptyYields();
  let cost = 0;
  let adjacency = 0;
  let housing = 0;
  let amenity = 0;
  if (choice.kind === 'building') {
    const def = BUILDINGS[choice.id];
    cost = def?.cost ?? 0;
    addYields(delta, def?.yields ?? {});
    housing = def?.housing ?? 0;
    amenity = def?.amenities ?? 0;
  } else if (choice.kind === 'district') {
    cost = districtCost(s);
    const def = DISTRICTS[choice.type];
    adjacency = districtAdjacency(s.map, s.map.tiles[choice.tileIndex], choice.type);
    if (def.adjacencyYield) delta[def.adjacencyYield] += adjacency;
    housing = def.housing;
  } else if (choice.kind === 'wonder') {
    const def = BUILT_WONDERS[choice.wonder];
    cost = def?.cost ?? 0;
    addYields(delta, def?.cityYields ?? {});
  }
  return makeCandidate(state, choice, choiceLabel(choice), choice.kind as (typeof CAND_KINDS)[number], {
    cost,
    turns: cost / prod,
    adjacency,
    delta,
    housing,
    amenity,
    city,
  });
}

function purchaseCandidates(state: GameState, city: City): Candidate[] {
  const s = state;
  const out: Candidate[] = [];
  const affordable = availableBuildings(s, city)
    .filter((b) => buildingCompletable(s, city, b.id))
    .filter((b) =>
      b.worship ? playerSeat(s).faith >= buildingFaithCost(b.id) : playerSeat(s).treasury >= buildingPurchaseCost(b.id),
    )
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 2);
  for (const b of affordable) {
    const delta = emptyYields();
    addYields(delta, b.yields ?? {});
    out.push(
      makeCandidate(state, { kind: 'purchaseBuilding', id: b.id }, `Buy ${b.name}`, 'purchase', {
        cost: buildingPurchaseCost(b.id) / 4,
        delta,
        housing: b.housing ?? 0,
        amenity: b.amenities ?? 0,
        city,
      }),
    );
  }
  if (s.unitsMode) {
    const center = s.map.tiles[city.centerIndex];
    const spawnable = (type: string) =>
      [center, ...neighbors(s.map, center)].some((t) =>
        tileFreeForUnit(s, t.index, { type, owner: 'player' }),
      );
    const units = trainableUnits(s)
      .filter((u) => playerSeat(s).treasury >= unitPurchaseCost(s, u.id))
      .filter((u) => u.charges !== undefined || u.combat > 0)
      .filter((u) => spawnable(u.id)); // a failed instant-buy would livelock the decision loop
    const builder = units.find((u) => u.charges !== undefined);
    const strongest = [...units].filter((u) => u.combat > 0).sort((a, b) => b.combat - a.combat)[0];
    for (const u of [builder, strongest].filter(Boolean) as typeof units) {
      out.push(
        makeCandidate(state, { kind: 'purchaseUnit', unit: u.id }, `Buy ${u.name}`, 'purchase', {
          cost: unitPurchaseCost(s, u.id) / 4,
          city,
        }),
      );
    }
  }
  if (playerSeat(s).treasury >= settlerCost(s) * 4) {
    out.push(
      makeCandidate(state, { kind: 'purchaseSettler' }, 'Buy Settler', 'purchase', {
        cost: settlerCost(s),
        city,
      }),
    );
  }
  return out;
}

// --- research --------------------------------------------------------------

function researchCandidates(state: GameState, kind: 'tech' | 'civic'): Candidate[] {
  const s = state;
  const totals = empireTotals(state);
  const rate = Math.max(0.5, kind === 'tech' ? totals.science : totals.culture);
  const defs = kind === 'tech' ? availableTechs(s) : availableCivics(s);
  const progress = kind === 'tech' ? s.research.techProgress : s.research.civicProgress;
  return defs
    .map((d) => ({ d, cost: effectiveResearchCost(s, d.id, d.cost) }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 6)
    .map(({ d, cost }) => {
      const effects = (kind === 'tech' ? TECHS[d.id].effects : CIVICS[d.id].effects) ?? [];
      const unlocks = effects.filter((e) => e.kind.startsWith('unlock')).length;
      return makeCandidate(state, 
        kind === 'tech' ? { kind: 'research', id: d.id } : { kind: 'civic', id: d.id },
        `${kind === 'tech' ? 'Research' : 'Civic'}: ${d.name}`,
        kind === 'tech' ? 'research' : 'civic',
        { cost, turns: Math.max(0, cost - progress) / rate, unlocks },
      );
    });
}

// --- policies & government ---------------------------------------------------

function padPolicySlots(state: GameState): void {
  const s = state;
  const slots = governmentSlots(s);
  while (s.government.policies.length < slots.length) s.government.policies.push(null);
}

/** Empire per-turn yield totals (used for candidate deltas and rates). */
function empireTotals(state: GameState): Yields {
  const totals = emptyYields();
  for (const c of state.cities) {
    addYields(totals, computeCityStats(state, c).total);
  }
  return totals;
}

/** Δ empire yields from putting `card` into `slot` (state restored after). */
function policySwapDelta(state: GameState, base: Yields, slot: number, card: string | null): Yields {
  const s = state;
  const prev = s.government.policies[slot] ?? null;
  s.government.policies[slot] = card;
  const after = empireTotals(state);
  s.government.policies[slot] = prev;
  const delta = emptyYields();
  for (const k of YIELD_KEYS) delta[k] = after[k] - base[k];
  return delta;
}

function policyCandidates(state: GameState): Candidate[] {
  const s = state;
  if (!s.government.current) return [];
  padPolicySlots(state);
  const slots = governmentSlots(s);
  const base = empireTotals(state);
  const unlocked = s.sandbox ? new Set(Object.keys(POLICIES)) : computeUnlocks(s).policies;
  const slotted = new Set(s.government.policies.filter((p): p is string => p !== null));

  // Contribution of each currently slotted card (to pick replacement victims).
  const removalDelta = new Map<number, number>();
  s.government.policies.forEach((card, i) => {
    if (card === null) return;
    const d = policySwapDelta(state, base, i, null);
    removalDelta.set(i, YIELD_KEYS.reduce((sum, k) => sum + d[k], 0));
  });

  const out: Candidate[] = [];
  for (const cardId of unlocked) {
    if (slotted.has(cardId)) continue;
    const card = POLICIES[cardId];
    if (!card) continue;
    const fitting = slots
      .map((kind, i) => (cardFitsSlot(card, kind) ? i : -1))
      .filter((i) => i >= 0);
    if (fitting.length === 0) continue;
    const free = fitting.find((i) => s.government.policies[i] === null);
    // No free slot: evict the fitting card contributing least (removal
    // deltas are negative contributions, so the max is the weakest card).
    const target =
      free ??
      fitting.reduce((best, i) => ((removalDelta.get(i) ?? 0) > (removalDelta.get(best) ?? 0) ? i : best), fitting[0]);
    const delta = policySwapDelta(state, base, target, cardId);
    out.push(
      makeCandidate(state, { kind: 'setPolicy', card: cardId, slot: target }, `Policy: ${card.name}`, 'policy', {
        delta,
      }),
    );
  }
  if (out.length === 0) return [];
  const trimmed = out.slice(0, MAX_CANDIDATES - 1);
  trimmed.push(makeCandidate(state, { kind: 'keepPolicies' }, 'Keep current policies', 'keep', {}));
  return trimmed;
}

function governmentCandidates(state: GameState): Candidate[] {
  const s = state;
  if (!s.government.current) return [];
  const unlocked = computeUnlocks(s).governments;
  const options = [...unlocked].filter((g) => g !== s.government.current && GOVERNMENTS[g]);
  if (options.length === 0) return [];
  const base = empireTotals(state);
  const out: Candidate[] = [];
  for (const id of options) {
    // Switching reshuffles slots; evaluate on a clone.
    const clone = deserialize(serialize(s));
    setGovernment(clone, id);
    const after = empireTotals(clone);
    const delta = emptyYields();
    for (const k of YIELD_KEYS) delta[k] = after[k] - base[k];
    out.push(
      makeCandidate(state, { kind: 'setGovernment', id }, `Government: ${GOVERNMENTS[id].name}`, 'government', {
        delta,
      }),
    );
  }
  out.push(makeCandidate(state, { kind: 'keepGovernment' }, 'Keep current government', 'keep', {}));
  return out;
}

// --- features ---------------------------------------------------------------

function makeCandidate(
  state: GameState,
  action: EnvAction,
  label: string,
  kind: (typeof CAND_KINDS)[number],
  parts: {
    cost?: number;
    turns?: number;
    adjacency?: number;
    siteScore?: number;
    delta?: Yields;
    housing?: number;
    amenity?: number;
    unlocks?: number;
    city?: City;
  },
): Candidate {
  const s = state;
  const oneHot = CAND_KINDS.map((k) => (k === kind ? 1 : 0));
  const city = parts.city ?? s.cities.find((c) => c.isCapital) ?? s.cities[0];
  let threat = 0;
  if (city) {
    const ct = s.map.tiles[city.centerIndex];
    threat = s.units.filter((u) => {
      if (u.owner !== 'barbarian') return false;
      const bt = s.map.tiles[u.tileIndex];
      return hexDistance(bt.col, bt.row, ct.col, ct.row) <= 6;
    }).length;
  }
  const builders = s.units.filter((u) => u.owner === 'player' && unitDomain(u.type) === 'civilian').length;
  const military = s.units.filter((u) => u.owner === 'player' && unitDomain(u.type) === 'military').length;
  const delta = parts.delta ?? emptyYields();
  return {
    action,
    label,
    features: [
      ...oneHot,
      (parts.cost ?? 0) / 200,
      Math.min(2, (parts.turns ?? 0) / 20),
      (parts.adjacency ?? 0) / 5,
      (parts.siteScore ?? 0) / 50,
      ...YIELD_KEYS.map((k) => delta[k] / 5),
      (parts.housing ?? 0) / 3,
      (parts.amenity ?? 0) / 2,
      (parts.unlocks ?? 0) / 5,
      Math.min(1, threat / 3),
      Math.min(1, builders / 3),
      Math.min(1, military / 4),
    ],
  };
}

/** Empire-level observation vector (OBSERVATION_SIZE numbers, roughly normalized). */
export function envObservation(state: GameState, horizon: number): number[] {
  const s = state;
  const yields = emptyYields();
  let pop = 0;
  let hpDeficit = 0;
  let amenityDeficit = 0;
  let housingHeadroom = 0;
  for (const c of s.cities) {
    const st = computeCityStats(s, c);
    addYields(yields, st.total);
    pop += c.population;
    hpDeficit += (CITY_MAX_HP - getCityHp(s, c.id)) / CITY_MAX_HP;
    amenityDeficit += Math.max(0, st.amenities.needed - st.amenities.have);
    housingHeadroom += Math.min(4, st.housing - c.population);
  }
  const barbs = s.units.filter((u) => u.owner === 'barbarian').length;
  const builders = s.units.filter((u) => u.owner === 'player' && unitDomain(u.type) === 'civilian').length;
  const military = s.units.filter((u) => u.owner === 'player' && unitDomain(u.type) === 'military').length;
  const pillaged = s.map.tiles.filter((t) => t.pillaged).length;
  const owned = s.map.tiles.filter((t) => t.cityId !== -1);
  const improvable = owned.filter((t) => !t.improvement && !t.district && validImprovements(s, t).length > 0).length;
  const exploredFrac =
    s.explored.length > 0 ? s.explored.filter((e) => e === 1).length / s.explored.length : 1;
  let gpProgress = 0;
  for (const cls of GP_CLASSES) {
    const pts = s.greatPeople.points[cls] ?? 0;
    gpProgress = Math.max(gpProgress, pts / gpCost(greatPeopleEarned(s, cls)));
  }
  const slots = s.government.current ? governmentSlots(s) : [];
  const emptySlots = slots.length
    ? slots.filter((_, i) => (s.government.policies[i] ?? null) === null).length / slots.length
    : 0;
  return [
    s.turn / horizon,
    s.cities.length / 8,
    pop / 40,
    yields.food / 50,
    yields.production / 50,
    yields.gold / 50,
    yields.science / 50,
    yields.culture / 50,
    yields.faith / 50,
    Math.max(-1, Math.min(1, playerSeat(s).treasury / 500)),
    (s.research.techs.length + s.research.civics.length) / 50,
    Math.min(1, barbs / 6),
    Math.min(1, pillaged / 10),
    hpDeficit,
    Math.min(1, s.settlers / 2),
    exploredFrac,
    Math.min(1, amenityDeficit / 10),
    Math.max(-1, Math.min(1, housingHeadroom / 20)),
    Math.min(1, builders / 3),
    Math.min(1, military / 4),
    owned.length ? improvable / owned.length : 0,
    Math.min(1, playerSeat(s).faith / 500),
    Math.min(1, gpProgress),
    emptySlots,
    Math.min(1, playerSeat(s).envoysAvailable / 3),
    Math.min(1, metCityStates(s).length / 6),
    Math.min(1, s.cityStates.filter(isSuzerain).length / 6),
    s.rivals.some((r) => r.atWar) ? 1 : 0,
    strengthRatio(state),
    rivalPressure(state),
  ];
}

/** Player strength vs the strongest rival, squashed to [-1, 1]. */
function strengthRatio(state: GameState): number {
  const s = state;
  const alive = s.rivals.filter((r) => r.cities.length > 0);
  if (alive.length === 0) return 1;
  const strongest = Math.max(...alive.map((r) => rivalStrength(s, r)));
  if (strongest <= 0) return 1;
  return Math.max(-1, Math.min(1, (playerStrength(s) - strongest) / strongest));
}

/** How close the nearest rival city sits (1 = on top of us, 0 = far). */
function rivalPressure(state: GameState): number {
  const s = state;
  let best = Infinity;
  for (const r of s.rivals) {
    if (r.cities.length === 0) continue;
    best = Math.min(best, rivalProximity(s, r));
  }
  if (!isFinite(best)) return 0;
  return Math.max(0, Math.min(1, (14 - best) / 14));
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
  while (!r.done && guard++ < 5000) {
    r = env.step(policy(r.observation, r.candidates));
    decisions++;
  }
  return { score: empireScore(env.state, env.objective), decisions, turns: env.state.turn };
}
