
import { PROMO_COLS } from '../data/promotions';

export const IMPROVEMENT_IDS: readonly string[] = ['FARM', 'MINE', 'LUMBER_MILL', 'QUARRY', 'PASTURE', 'CAMP', 'PLANTATION', 'OIL_WELL', 'SEASIDE_RESORT', 'FORT', 'BATEY', 'COLOSSAL_HEADS', 'MONASTERY', 'AIRSTRIP'];

export const DEDICATED_IMPROVEMENTS = 3;

/** how many of the operational-range ring an AIR_STRIKE head offers, and how
 *  many bases a REBASE head offers — both ordered by TILE INDEX ascending. */
export const AIR_STRIKE_COLS = 12;
import { SPY_TRAVEL_COLS, SPY_MISSIONS } from '../data/espionage';
export { SPY_TRAVEL_COLS, SPY_MISSIONS };
export const AIR_REBASE_COLS = 6;

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
  // APPENDED LAST, after FOUND_CITY: every index above is load-bearing on
  // both engines (PILLAGE, the SNIPE ring, the spread block), so a new verb
  // joins at the end or it moves somebody else's column. A new IMPROVEMENT
  // moves them all regardless — every BUILD verb sits before PILLAGE — so no
  // consumer may write one of these seats down.
  names.push('EXCAVATE');
  names.push('PARK');
  // PROMOTE: column k takes row k of the acting unit's OWN class list, so one
  // fixed-width head serves nine different promotion tables.
  for (let k = 0; k < PROMO_COLS; k++) names.push(`PROMOTE_${k}`);
  // CONDEMN HERETIC: a military unit's verb against an adjacent religious one.
  for (let d = 0; d < 6; d++) names.push(`CONDEMN_${d}`);
  names.push('REMOVE_HERESY');
  names.push('LAUNCH_INQUISITION');
  // HEATHEN CONVERSION: the Apostle promotion's own verb, adjacent-ring wide
  // in one blow rather than one column per direction.
  names.push('CONVERT_HEATHEN');
  names.push('UPGRADE');
  for (let k = 0; k < AIR_STRIKE_COLS; k++) names.push(`AIR_STRIKE_${k}`);
  for (let k = 0; k < AIR_REBASE_COLS; k++) names.push(`REBASE_${k}`);
  // ESPIONAGE: a spy JUMPS to the k-th revealed city, or starts the k-th
  // mission where it stands. Both heads read their list in TILE-INDEX /
  // catalog order, so column k means the same thing on both engines.
  for (let k = 0; k < SPY_TRAVEL_COLS; k++) names.push(`SPY_TRAVEL_${k}`);
  for (let k = 0; k < SPY_MISSIONS.length; k++) names.push(`SPY_MISSION_${k}`);
  // THE MILITARY ENGINEER'S TWO NON-IMPROVEMENT VERBS: lay a road, and spend
  // a charge into an engineering district or a Flood Barrier. Appended LAST,
  // like every verb since FOUND_CITY.
  names.push('BUILD_ROAD');
  names.push('FINISH_DISTRICT');
  // THE GREAT PERSON'S ONE VERB: spend a charge where this person's ability
  // may be spent. One column for all nine classes — which person is acting is
  // the unit's own chassis and queue position, not a column.
  names.push('ACTIVATE_GP');
  // CIV6: a unit whose ATTACK RANGE reaches 3 (battleship chassis, or the
  // EXPERT_MARKSMAN promotion on siege) may strike the distance-3 ring. Same
  // contract as the SNIPE head one hex out: column order is TILE INDEX order.
  for (let k = 0; k < 18; k++) names.push(`SNIPE3_${k}`);
  // THE ROCK BAND'S ONE VERB: perform where it stands. Appended last, like
  // every verb since FOUND_CITY.
  names.push('PERFORM_CONCERT');
  // THE ROYAL SOCIETY'S ONE VERB: a Builder pays its whole charge bank into
  // the District Project it stands on. Appended last, like every verb since
  // FOUND_CITY.
  names.push('BOOST_PROJECT');
  // FORM UP: the acting unit merges into the same-type unit one step away,
  // which is the only place a second one of its own kind can stand — this
  // engine seats ONE military unit to a tile. Which formation the pair makes
  // is the pair's business, not the column's: two singles make a Corps and a
  // Corps plus a single makes an Army, exactly as the two civics allow.
  for (let d = 0; d < 6; d++) names.push(`FORM_UP_${d}`);
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
