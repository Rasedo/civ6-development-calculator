/**
 * Minimal forward pass for PPO policies exported from Stable-Baselines3
 * (python/export_policy.py): the MlpPolicy's policy net + action head as
 * plain JSON matrices. Enough to run a trained PPO agent in the browser.
 */

export interface Sb3Linear {
  /** PyTorch layout: w[out][in]. */
  w: number[][];
  b: number[];
}

export interface Sb3MlpPolicy {
  kind: 'sb3-mlp';
  featureVersion: number;
  obsSize: number;
  candSize: number;
  maxCands: number;
  activation: 'tanh' | 'relu';
  hidden: Sb3Linear[];
  action: Sb3Linear;
}

function linear(layer: Sb3Linear, x: number[]): number[] {
  const out = new Array<number>(layer.b.length);
  for (let o = 0; o < layer.b.length; o++) {
    let v = layer.b[o];
    const row = layer.w[o];
    for (let i = 0; i < row.length; i++) v += row[i] * x[i];
    out[o] = v;
  }
  return out;
}

/** Action logits for a flat [obs ‖ padded-candidates] input vector. */
export function sb3Logits(policy: Sb3MlpPolicy, x: number[]): number[] {
  let h = x;
  for (const layer of policy.hidden) {
    h = linear(layer, h);
    for (let i = 0; i < h.length; i++) {
      h[i] = policy.activation === 'relu' ? Math.max(0, h[i]) : Math.tanh(h[i]);
    }
  }
  return linear(policy.action, h);
}

export function isSb3Policy(data: unknown): data is Sb3MlpPolicy {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { kind?: string }).kind === 'sb3-mlp' &&
    Array.isArray((data as Sb3MlpPolicy).hidden)
  );
}
