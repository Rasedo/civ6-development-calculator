/**
 * The in-UI AI advisor: load trained weights (the ES trainer's
 * rl-weights.json, or a PPO policy exported by python/export_policy.py)
 * and rank every decision the policy would face on the current game state.
 */

import type { GameState } from './types';
import {
  envCandidates,
  envObservation,
  uiPendingDecisions,
  CANDIDATE_FEATURES,
  OBSERVATION_SIZE,
  MAX_CANDIDATES,
  FEATURE_VERSION,
  type Candidate,
  type PendingDecision,
} from './rlenv';
import { scoreCandidate, paramCount, type PolicySpec } from './policy';
import { sb3Logits, isSb3Policy, type Sb3MlpPolicy } from './sb3';
import { TURN_LIMIT } from './game';

/** Advisor scoring assumes the full game — TURN_LIMIT, the score-victory turn
 * (the training default since the horizon knobs were unified, 2026-07-10). */
export const ADVISOR_HORIZON = TURN_LIMIT;

export interface LoadedPolicy {
  label: string;
  featureVersion: number;
  /** True when the weights match this engine's feature layout exactly. */
  compatible: boolean;
  scoreAll(obs: number[], cands: Candidate[]): number[];
}

/** Parse a pasted/uploaded weights JSON (ES or exported-PPO format). */
export function loadPolicyJson(text: string): LoadedPolicy {
  const data = JSON.parse(text) as Record<string, unknown>;

  if (isSb3Policy(data)) {
    const p = data as Sb3MlpPolicy;
    if (p.obsSize !== OBSERVATION_SIZE || p.candSize !== CANDIDATE_FEATURES) {
      throw new Error(
        `PPO policy expects obs ${p.obsSize}/cand ${p.candSize}; this engine is ${OBSERVATION_SIZE}/${CANDIDATE_FEATURES} — re-export after retraining.`,
      );
    }
    return {
      label: `PPO (${p.hidden.map((h) => h.b.length).join('×')} mlp)`,
      featureVersion: p.featureVersion,
      compatible: p.featureVersion === FEATURE_VERSION,
      scoreAll: (obs, cands) => {
        const x = new Array<number>(p.obsSize + p.maxCands * p.candSize).fill(0);
        for (let i = 0; i < obs.length; i++) x[i] = obs[i];
        cands.slice(0, p.maxCands).forEach((c, i) => {
          for (let j = 0; j < p.candSize; j++) x[p.obsSize + i * p.candSize + j] = c.features[j] ?? 0;
        });
        const logits = sb3Logits(p, x);
        return cands.map((_, i) => logits[i] ?? -Infinity);
      },
    };
  }

  // ES trainer format: { featureVersion, arch, spec, params } (older files
  // carry { weights } for the plain linear policy).
  const spec = (data.spec as PolicySpec | undefined) ?? {
    arch: 'linear' as const,
    obsSize: OBSERVATION_SIZE,
    candSize: CANDIDATE_FEATURES,
  };
  const params = (data.params as number[] | undefined) ?? (data.weights as number[] | undefined);
  if (!params || !Array.isArray(params)) {
    throw new Error('Unrecognized weights file: expected rl-weights.json or an exported PPO policy.');
  }
  if (params.length !== paramCount(spec)) {
    throw new Error(
      `Weights have ${params.length} params but the ${spec.arch} architecture needs ${paramCount(spec)} — retrain or re-export.`,
    );
  }
  const meta = typeof data.meanScore === 'number' && isFinite(data.meanScore)
    ? ` · held-out ${(data.meanScore as number).toFixed(0)}`
    : '';
  return {
    label: `ES ${spec.arch} (${params.length} params${meta})`,
    featureVersion: (data.featureVersion as number) ?? 0,
    compatible: data.featureVersion === FEATURE_VERSION,
    scoreAll: (obs, cands) => cands.map((c) => scoreCandidate(spec, params, obs, c.features)),
  };
}

export interface RankedOption {
  candidate: Candidate;
  score: number;
}

export interface Recommendation {
  decision: PendingDecision;
  title: string;
  options: RankedOption[]; // sorted best-first
}

export function decisionTitle(state: GameState, decision: PendingDecision): string {
  switch (decision.type) {
    case 'production': {
      const city = state.cities.find((c) => c.id === decision.cityId);
      return `Production — ${city?.name ?? `city ${decision.cityId}`}`;
    }
    case 'research':
      return 'Research';
    case 'civic':
      return 'Civic';
    case 'policy':
      return 'Policy cards';
    case 'government':
      return 'Government';
    case 'envoy':
      return 'Envoys';
  }
}

/** Rank every open decision on this state with the loaded policy. */
export function adviseAll(state: GameState, policy: LoadedPolicy, topK = 3): Recommendation[] {
  const obs = envObservation(state, ADVISOR_HORIZON);
  const out: Recommendation[] = [];
  for (const decision of uiPendingDecisions(state)) {
    const cands = envCandidates(state, decision).slice(0, MAX_CANDIDATES);
    if (cands.length === 0) continue;
    const scores = policy.scoreAll(obs, cands);
    const options = cands
      .map((candidate, i) => ({ candidate, score: scores[i] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
    out.push({ decision, title: decisionTitle(state, decision), options });
  }
  return out;
}
