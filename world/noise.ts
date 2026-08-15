
import { mulberry32, deriveSeed } from './rng';

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export interface Noise2D {
  (x: number, y: number): number; // -> [0, 1)
}

export function valueNoise(seed: number): Noise2D {
  const base = seed >>> 0;
  function lattice(ix: number, iy: number): number {
    let h = base;
    h = Math.imul(h ^ (ix * 0x27d4eb2d), 2654435761);
    h = Math.imul(h ^ (iy * 0x165667b1), 2246822519);
    h ^= h >>> 15;
    h = Math.imul(h, 2654435761);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }
  return (x, y) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smoothstep(x - ix);
    const fy = smoothstep(y - iy);
    const v00 = lattice(ix, iy);
    const v10 = lattice(ix + 1, iy);
    const v01 = lattice(ix, iy + 1);
    const v11 = lattice(ix + 1, iy + 1);
    const a = v00 + (v10 - v00) * fx;
    const b = v01 + (v11 - v01) * fx;
    return a + (b - a) * fy;
  };
}

export function fbm(seed: number, octaves = 4, lacunarity = 2, gain = 0.5): Noise2D {
  const layers: Noise2D[] = [];
  for (let i = 0; i < octaves; i++) {
    layers.push(valueNoise(deriveSeed(seed, `oct${i}`)));
  }
  return (x, y) => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += layers[i](x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

export function jitter(seed: number): (i: number) => number {
  const rng = mulberry32(seed);
  const cache: number[] = [];
  return (i: number) => {
    while (cache.length <= i) cache.push(rng());
    return cache[i];
  };
}
