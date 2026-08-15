
export const IMPROVEMENT_IDS: readonly string[] = ['FARM', 'MINE', 'LUMBER_MILL', 'QUARRY', 'PASTURE', 'CAMP', 'PLANTATION', 'OIL_WELL', 'SEASIDE_RESORT', 'FORT'];

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
  // The distance-2 ring, ordered by TILE INDEX ascending. Appended after
  // PILLAGE; consumers must key on the NAME, never on W-1.
  for (let k = 0; k < 12; k++) names.push(`SNIPE_${k}`);
  names.push('SPREAD_HERE');
  for (let d = 0; d < 6; d++) names.push(`SPREAD_${d}`);
  names.push('FOUND_CITY');
  return names;
}

export function unitActionIndex(improvementIds: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  unitActionNames(improvementIds).forEach((n, i) => (out[n] = i));
  return out;
}

export function buildColumnOf(i: number): number {
  return i < DEDICATED_IMPROVEMENTS ? 13 + i : 18 + (i - DEDICATED_IMPROVEMENTS);
}

export function improvementOfColumn(a: number, nImp: number): number {
  if (a >= 13 && a < 13 + DEDICATED_IMPROVEMENTS) return a - 13;
  const hi = 18 + (nImp - DEDICATED_IMPROVEMENTS);
  if (a >= 18 && a < hi) return DEDICATED_IMPROVEMENTS + (a - 18);
  return -1;
}
