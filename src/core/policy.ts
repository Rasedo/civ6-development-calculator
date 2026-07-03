/**
 * Parametric policies over (observation, candidate-features) pairs, pure TS.
 * A policy scores each candidate and plays the argmax. Three architectures:
 *
 * - linear:    score = w · feat                      (state-blind, cheap)
 * - bilinear:  score = Σc feat[c] · (W[c] · obs + b[c])   (state-aware)
 * - mlp:       score = MLP([obs, feat])              (1 tanh hidden layer)
 *
 * No training code here — evolution strategies only need the forward pass.
 */

import type { Candidate } from './rlenv';

export type PolicyArch = 'linear' | 'bilinear' | 'mlp';

export interface PolicySpec {
  arch: PolicyArch;
  obsSize: number;
  candSize: number;
  /** Hidden width (mlp only). */
  hidden?: number;
}

export function paramCount(spec: PolicySpec): number {
  switch (spec.arch) {
    case 'linear':
      return spec.candSize;
    case 'bilinear':
      return spec.candSize * (spec.obsSize + 1); // W[c][o] rows + bias per cand feature
    case 'mlp': {
      const h = spec.hidden ?? 24;
      const inDim = spec.obsSize + spec.candSize;
      return (inDim + 1) * h + h + 1; // input->hidden (w+b), hidden->out (w+b)
    }
  }
}

export function scoreCandidate(
  spec: PolicySpec,
  params: number[] | Float64Array,
  obs: number[],
  feat: number[],
): number {
  switch (spec.arch) {
    case 'linear': {
      let s = 0;
      for (let j = 0; j < spec.candSize; j++) s += params[j] * (feat[j] ?? 0);
      return s;
    }
    case 'bilinear': {
      // params laid out row-major: for each cand feature c: [w_o0..w_oN, bias]
      const row = spec.obsSize + 1;
      let s = 0;
      for (let c = 0; c < spec.candSize; c++) {
        const f = feat[c] ?? 0;
        if (f === 0) continue;
        const base = c * row;
        let inner = params[base + spec.obsSize]; // bias
        for (let o = 0; o < spec.obsSize; o++) inner += params[base + o] * obs[o];
        s += f * inner;
      }
      return s;
    }
    case 'mlp': {
      const h = spec.hidden ?? 24;
      const inDim = spec.obsSize + spec.candSize;
      let s = 0;
      const hiddenBase = 0;
      const outBase = (inDim + 1) * h;
      for (let k = 0; k < h; k++) {
        let z = params[hiddenBase + k * (inDim + 1) + inDim]; // bias
        const wBase = hiddenBase + k * (inDim + 1);
        for (let i = 0; i < spec.obsSize; i++) z += params[wBase + i] * obs[i];
        for (let i = 0; i < spec.candSize; i++) z += params[wBase + spec.obsSize + i] * (feat[i] ?? 0);
        s += params[outBase + k] * Math.tanh(z);
      }
      return s + params[outBase + h]; // output bias
    }
  }
}

/** Argmax policy over candidates (ties break toward the lowest index). */
export function makePolicy(
  spec: PolicySpec,
  params: number[] | Float64Array,
): (obs: number[], cands: Candidate[]) => number {
  return (obs, cands) => {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < cands.length; i++) {
      const s = scoreCandidate(spec, params, obs, cands[i].features);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  };
}
