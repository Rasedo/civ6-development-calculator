import type { GameState } from './types';
import { ERA_LENGTH, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES, HEROIC_DEDICATIONS, DEDICATION_FAITH, DEDICATION_ERA_SCORE, DEDICATION_PAYOUTS_LIVE } from '../data/rivals';

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
  // B-23 (#71): Civ 6 upgrades ROADS by era — the Ancient road has no bridges,
  // the Classical road does. Latched at the FIRST era boundary and never
  // cleared. Set here (rather than off a raw turn comparison) because this site
  // is already proven to fire at the same moment in both engines.
  state.roadBridges = true;
  const ages = (state.civAges ??= []);
  const prev = (state.prevAges ??= []);
  const ded = (state.dedications ??= []);
  for (let c = 0; c < 1 + state.rivals.length; c++) {
    const s = state.eraScore?.[c] ?? 0;
    const was = ages[c] ?? 1; // era 0 is Normal for everyone
    const now = s < ERA_DARK_T ? 0 : s >= ERA_GOLDEN_T ? 2 : 1;
    // B-24 (#71): DEDICATIONS. Each civ commits to one dedication per era —
    // except the HEROIC AGE, real Civ 6's reward for climbing straight out of
    // a DARK age into a GOLDEN one, which grants THREE. That test is why the
    // PREVIOUS age has to be substrate: `now` alone cannot distinguish a
    // Heroic Age from an ordinary Golden one.
    prev[c] = was;
    ages[c] = now;
    ded[c] = was === 0 && now === 2 ? HEROIC_DEDICATIONS : 1;
  }
  state.eraScore = [];
}

/** B-24 (#71): true when this civ's CURRENT age is a HEROIC age — it entered
 *  a Golden age directly from a Dark one. */
export function isHeroicAge(state: GameState, civ: number): boolean {
  return (state.prevAges?.[civ] ?? 1) === 0 && (state.civAges?.[civ] ?? 1) === 2;
}

/**
 * B-24 (#71): the per-turn DEDICATION yield a civ's commitments pay.
 * A GOLDEN (or HEROIC) age dedicates to a bonus — modeled as flat faith, the
 * Monumentality flavour — while a DARK or NORMAL age dedicates to CLIMBING,
 * which real Civ 6 pays in extra era score. Both scale with the dedication
 * COUNT, so a Heroic age is literally three times the commitment.
 */
export function dedicationFaith(state: GameState, civ: number): number {
  const age = state.civAges?.[civ] ?? 1;
  if (age !== 2) return 0;
  return DEDICATION_FAITH * (state.dedications?.[civ] ?? 1);
}

/** B-24 (#71): extra era score per turn while DARK or NORMAL — the
 *  climb-out dedication (the Golden-age twin of dedicationFaith). */
export function dedicationEraScore(state: GameState, civ: number): number {
  const age = state.civAges?.[civ] ?? 1;
  if (age === 2) return 0;
  return DEDICATION_ERA_SCORE * (state.dedications?.[civ] ?? 1);
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

/**
 * B-24 (#71): apply this turn's DEDICATION payouts for every civ. Called once
 * per turn from endTurn, right beside eraBoundary, so the GPU can mirror it at
 * the same position. A GOLDEN/HEROIC age pays faith; a DARK or NORMAL age pays
 * era score (the climb-out dedication). Both scale with the dedication COUNT,
 * so a Heroic age pays triple. Zero-draw, integer-only.
 *
 * `addFaith` is injected because the player's faith lives on GameState while
 * each rival keeps its own — the caller knows which accumulator to touch.
 */
export function applyDedications(state: GameState, addFaith: (civ: number, amount: number) => void): void {
  if (!DEDICATION_PAYOUTS_LIVE) return; // B-24 (#71): substrate live, payouts inert
  for (let c = 0; c < 1 + state.rivals.length; c++) {
    const f = dedicationFaith(state, c);
    if (f > 0) addFaith(c, f);
    const es = dedicationEraScore(state, c);
    if (es > 0) addEraScore(state, c, es);
  }
}
