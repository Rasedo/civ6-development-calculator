import type { GameState } from './types';
import { ERA_LENGTH, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES } from '../data/rivals';

// ---------------------------------------------------------------------------
// B-24 (task #68, gpu/GOVERNORS_DESIGN.md): era score / Ages.
// Unified civ ids: 0 = the player, r+1 = rival r (the civsAtWar convention).
// Every hook is a plain `+= const` (zero-draw). Ages: 0 Dark / 1 Normal /
// 2 Golden, assigned at each era boundary from the just-ended window's score.
// ---------------------------------------------------------------------------

/** Accrue era score for unified civ `civ`. Lazy array — absent entries are 0,
 *  so importers/older saves need no migration. */
export function addEraScore(state: GameState, civ: number, pts: number): void {
  const arr = (state.eraScore ??= []);
  arr[civ] = (arr[civ] ?? 0) + pts;
}

/** Era boundary — runs right AFTER `state.turn += 1` in endTurn (the GPU
 *  mirrors at its own turn increment). At each ERA_LENGTH multiple every
 *  civ's Age for the NEW era comes from the just-ended window's score
 *  (S2), then the accumulators reset for the new window. */
export function eraBoundary(state: GameState): void {
  if (state.turn % ERA_LENGTH !== 0) return;
  const ages = (state.civAges ??= []);
  for (let c = 0; c < 1 + state.rivals.length; c++) {
    const s = state.eraScore?.[c] ?? 0;
    ages[c] = s < ERA_DARK_T ? 0 : s >= ERA_GOLDEN_T ? 2 : 1;
  }
  state.eraScore = [];
}

/** The loyalty-pressure factor the SOURCE civ's age grants its pop-pressure
 *  contributions (B-24 S2). Missing entries (era 0, fresh saves) read Normal. */
export function agePressureFactor(state: GameState, civ: number): number {
  return AGE_PRESSURE[state.civAges?.[civ] ?? 1];
}

/** B-24 S3: governor titles a civ holds for `nCivics` completed civics. */
export function governorTitles(nCivics: number): number {
  return Math.min(GOV_MAX_TITLES, Math.floor(nCivics / GOV_CIVICS_PER_TITLE));
}

/** B-24 S3: the STATELESS greedy pick — the `titles` LOWEST-loyalty cities.
 *  `qLoys` are QUANTIZED milli loyalties (Math.round(loy·1000) — ranking on
 *  raw f64 would be float-association-fragile across engines; the B-29
 *  quantization lesson), ties broken by ARRAY position (acquisition order —
 *  the GPU mirrors with slot index / city_seq). Returns picked indices. */
export function governorPicks(qLoys: number[], titles: number): Set<number> {
  const idx = qLoys.map((q, i) => [q, i] as const);
  idx.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return new Set(idx.slice(0, titles).map(([, i]) => i));
}
