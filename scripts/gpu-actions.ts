/**
 * The UNIT ACTION enum — one source of truth for the order of the columns in
 * `BatchSim.unit_action_mask()`, the dispatch ladder in `_apply_unit_actions`,
 * and `scripts/replay-gpu.ts`'s replay ladder.
 *
 * #51/S0.3. Before this the layout was three sets of hardcoded integers that
 * agreed by convention, and they had already come apart in two places:
 *
 *   * `_apply_unit_actions` dispatched PILLAGE on `a == 24` — but 24 is the
 *     column of the LAST resource improvement, so with FORT appended at #78 the
 *     pillage verb was bound to the FORT column while the mask's actual pillage
 *     column (25) was dispatched by NEITHER engine. A-21's PILLAGE has been a
 *     total no-op on both sides since FORT landed; the rollout stayed green
 *     because both engines no-op identically.
 *   * `a == 24` was DOUBLE-BOUND on the GPU (pillage AND build-FORT), while TS
 *     read it as pillage and never handled FORT at all. That is a live
 *     divergence, latent only because FORT's gate reachability is zero (#78).
 *
 * The resource-improvement block is derived from the improvement roster, so
 * appending an improvement shifts PILLAGE automatically on every consumer
 * instead of silently colliding with it.
 */

/** Improvements 0-2 have dedicated build columns (13/14/15); the rest get one each from 18 up. */
export const DEDICATED_IMPROVEMENTS = 3;

export function unitActionNames(improvementIds: readonly string[]): string[] {
  const names: string[] = [];
  for (let d = 0; d < 6; d++) names.push(`MOVE_${d}`); // 0-5
  for (let d = 0; d < 6; d++) names.push(`ATTACK_${d}`); // 6-11
  names.push('HOLD'); // 12
  for (let i = 0; i < DEDICATED_IMPROVEMENTS; i++) names.push(`BUILD_${improvementIds[i]}`); // 13-15
  names.push('CHOP'); // 16
  names.push('REPAIR'); // 17
  for (let i = DEDICATED_IMPROVEMENTS; i < improvementIds.length; i++) names.push(`BUILD_${improvementIds[i]}`); // 18+
  names.push('PILLAGE');
  // #92: the distance-2 ring, ordered by TILE INDEX ascending. The engine's
  // target rule is "lowest tile index in range", so scanning SNIPE columns in
  // order IS scanning ring tiles in index order. Appended after PILLAGE —
  // appending LAST protects every existing index, but note PILLAGE is no
  // longer the final column; consumers must key on the NAME, never on W-1.
  for (let k = 0; k < 12; k++) names.push(`SNIPE_${k}`);
  return names;
}

/** name -> column index, for consumers that dispatch by name. */
export function unitActionIndex(improvementIds: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  unitActionNames(improvementIds).forEach((n, i) => (out[n] = i));
  return out;
}
