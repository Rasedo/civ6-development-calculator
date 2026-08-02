/** #93 THE FILE IS THE INTERFACE — the UNIT-ACTION enum, defined ONCE in core.
 *
 * Moved from `scripts/gpu-actions.ts` (which now re-exports from here) so the
 * REPLAY applier in `src/core/rivals.ts` can decode build columns without a
 * src→scripts dependency inversion. Same disease, same cure as
 * `prodLayout.ts`: the moment a second derivation of a column layout exists,
 * the file format rots silently (#85; the PILLAGE/FORT collision this
 * header's original documented).
 *
 * Layout: MOVE 0-5, ATTACK 6-11, HOLD 12, BUILD_{imp[0..2]} 13-15, CHOP 16,
 * REPAIR 17, BUILD_{imp[3..]} 18+, PILLAGE, SNIPE_0..11.
 */

/** The improvement roster, in EXPORT order — order IS the column index.
 * B-27 (#78): FORT appended LAST. */
export const IMPROVEMENT_IDS: readonly string[] = ['FARM', 'MINE', 'LUMBER_MILL', 'QUARRY', 'PASTURE', 'CAMP', 'PLANTATION', 'OIL_WELL', 'SEASIDE_RESORT', 'FORT'];

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
  // #92: the distance-2 ring, ordered by TILE INDEX ascending. Appended after
  // PILLAGE; consumers must key on the NAME, never on W-1.
  for (let k = 0; k < 12; k++) names.push(`SNIPE_${k}`);
  return names;
}

/** name -> column index, for consumers that dispatch by name. */
export function unitActionIndex(improvementIds: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  unitActionNames(improvementIds).forEach((n, i) => (out[n] = i));
  return out;
}

/** #93: the build column for improvement-roster index i (the inverse of the
 * name layout above) — 13..15 for the dedicated three, 18+ for the rest. */
export function buildColumnOf(i: number): number {
  return i < DEDICATED_IMPROVEMENTS ? 13 + i : 18 + (i - DEDICATED_IMPROVEMENTS);
}

/** #93: improvement-roster index for a build column, or -1 if `a` is not a
 * build column. CHOP (16) and REPAIR (17) are NOT build columns. */
export function improvementOfColumn(a: number, nImp: number): number {
  if (a >= 13 && a < 13 + DEDICATED_IMPROVEMENTS) return a - 13;
  const hi = 18 + (nImp - DEDICATED_IMPROVEMENTS);
  if (a >= 18 && a < hi) return DEDICATED_IMPROVEMENTS + (a - 18);
  return -1;
}
