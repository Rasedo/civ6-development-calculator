/**
 * OpenAI-style evolution strategy machinery: seeded RNG, antithetic
 * Gaussian perturbations, centered rank shaping, and an Adam ascent step.
 * Deterministic given the seed — training runs are reproducible.
 */

/** Small deterministic RNG with serializable state. */
export class Lcg {
  constructor(public state: number) {}
  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
  /** Box–Muller standard normal. */
  gaussian(): number {
    const u = Math.max(this.next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
}

/** Centered ranks in [-0.5, 0.5] (ties keep first-come order, fine for ES). */
export function centeredRanks(fitness: number[]): number[] {
  const order = fitness
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f - b.f || a.i - b.i);
  const ranks = new Array<number>(fitness.length);
  const denom = Math.max(1, fitness.length - 1);
  order.forEach(({ i }, rank) => {
    ranks[i] = rank / denom - 0.5;
  });
  return ranks;
}

export interface AdamState {
  m: number[];
  v: number[];
  t: number;
}

export function makeAdam(dim: number): AdamState {
  return { m: new Array(dim).fill(0), v: new Array(dim).fill(0), t: 0 };
}

/** In-place Adam ASCENT step (we maximize fitness). */
export function adamStep(
  theta: number[],
  grad: number[],
  adam: AdamState,
  lr: number,
  beta1 = 0.9,
  beta2 = 0.999,
  eps = 1e-8,
): void {
  adam.t += 1;
  const b1t = 1 - Math.pow(beta1, adam.t);
  const b2t = 1 - Math.pow(beta2, adam.t);
  for (let j = 0; j < theta.length; j++) {
    adam.m[j] = beta1 * adam.m[j] + (1 - beta1) * grad[j];
    adam.v[j] = beta2 * adam.v[j] + (1 - beta2) * grad[j] * grad[j];
    theta[j] += (lr * (adam.m[j] / b1t)) / (Math.sqrt(adam.v[j] / b2t) + eps);
  }
}

/**
 * ES gradient estimate from antithetic pairs. `epsilons[i]` is the i-th
 * perturbation; `fitness` holds 2·n entries ordered [+ε0, −ε0, +ε1, −ε1, …].
 * Returns the rank-shaped gradient (same dim as theta).
 */
export function esGradient(epsilons: number[][], fitness: number[], sigma: number): number[] {
  const ranks = centeredRanks(fitness);
  const dim = epsilons[0]?.length ?? 0;
  const grad = new Array<number>(dim).fill(0);
  for (let i = 0; i < epsilons.length; i++) {
    const w = ranks[2 * i] - ranks[2 * i + 1];
    const eps = epsilons[i];
    for (let j = 0; j < dim; j++) grad[j] += w * eps[j];
  }
  const scale = 1 / (fitness.length * sigma);
  for (let j = 0; j < dim; j++) grad[j] *= scale;
  return grad;
}
