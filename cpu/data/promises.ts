/**
 * THE PROMISES — the four `DIPLOACTION_KEEP_PROMISE_*` rows of the install
 * (`DiplomaticActions_XP2`, DLC/Expansion2/Data/Expansion2_DiplomaticActions.xml),
 * ONE table both engines address by position: the code IS the row index, on
 * the wire, in the record and in every store.
 *
 * Each row carries its `FavorCost` (what the ASKER pays to ask), its
 * `GrievancesForRefusal` (what the asker holds against a seat that refuses)
 * and its `GrievancesPerIncursion` (what the asker holds against it for each
 * incursion while the refusal stands — the notification "they declined. In
 * fact, they have continued to do this, adding 25 additional Grievances").
 * The rows carry no `GrievanceCost` and no `RequiredPromise`.
 *
 * The INCURSION each promise forbids is this engine's own event:
 *   - DONT_SPY: an offensive spy mission resolved in one of the asker's cities;
 *   - DONT_CONVERT: one of the asker's cities coming to follow the promiser's
 *     religion;
 *   - DONT_DIG_ARTIFACTS: an Archaeologist of the promiser excavating a dig on
 *     the asker's ground;
 *   - DONT_SETTLE_TOO_NEAR: the promiser founding a city within
 *     `SETTLE_PROMISE_REACH` of the asker's border.
 */
import { srcConst, xml, type SrcMap } from './provenance';

export interface PromiseDef {
  id: 'dontSpy' | 'dontConvert' | 'dontDig' | 'dontSettleNear';
  /** FavorCost: the asker's price for asking */
  favorCost: number;
  /** GrievancesForRefusal */
  refusal: number;
  /** GrievancesPerIncursion, while a refusal stands */
  incursion: number;
  src: SrcMap;
}

const promiseSrc = (action: string): SrcMap => {
  const where = `DiplomaticActionType=DIPLOACTION_KEEP_PROMISE_${action}`;
  return {
    favorCost: xml('DiplomaticActions_XP2', where, 'FavorCost'),
    refusal: xml('DiplomaticActions_XP2', where, 'GrievancesForRefusal'),
    incursion: xml('DiplomaticActions_XP2', where, 'GrievancesPerIncursion'),
  };
};

export const PROMISES: readonly PromiseDef[] = [
  { id: 'dontSpy', favorCost: 30, refusal: 25, incursion: 25, src: promiseSrc('DONT_SPY') },
  { id: 'dontConvert', favorCost: 30, refusal: 25, incursion: 25, src: promiseSrc('DONT_CONVERT') },
  { id: 'dontDig', favorCost: 30, refusal: 25, incursion: 25, src: promiseSrc('DONT_DIG_ARTIFACTS') },
  { id: 'dontSettleNear', favorCost: 30, refusal: 25, incursion: 25, src: promiseSrc('DONT_SETTLE_TOO_NEAR') },
];

export const PROMISE_SPY = 0;
export const PROMISE_CONVERT = 1;
export const PROMISE_DIG = 2;
export const PROMISE_SETTLE = 3;

/** CIV6 (Civilopedia, DIPLO_7): "All Deals, Demands, and Promises last for
 *  30 turns, at which point they need to be renewed." A kept promise runs
 *  this long, and so does a refused one (the Demand it answered). */
export const PROMISE_TURNS = srcConst('eras.promiseTurns', 30,
  { pedia: 'Civilopedia_Concepts_Text LOC_PEDIA_CONCEPTS_PAGE_DIPLO_7_CHAPTER_CONTENT_PARA_5: "All Deals, Demands, and Promises last for 30 turns"' });

/** CIV6 (LOC_NOTIFICATION_DIPLO_PROMISE_FROM_BROKEN_SUMMARY): "The promise
 *  made to you ... has been broken (100 Grievances generated)." */
export const PROMISE_BROKEN_GRIEVANCE = srcConst('eras.promiseBrokenGrievance', 100,
  { pedia: 'Expansion2 Notifications text LOC_NOTIFICATION_DIPLO_PROMISE_FROM_BROKEN_SUMMARY: "has been broken (100 Grievances generated)"' });

/** CIV6 (GRIEVANCE_MULTIPLIER_FOR_BROKEN_PROMISE, Expansion2_GlobalParameters):
 *  the percent an incursion's `GrievancesPerIncursion` is charged at while
 *  the promise stands broken — MEASURED on the settle promise: every founding
 *  within reach after the break cost 50 = 25 x 200%. */
export const PROMISE_BROKEN_MULT = srcConst('eras.promiseBrokenMult', 200, {
  derived: 'the GlobalParameters row, read as the percent on each incursion after a break '
    + '(runs/promise_break_20260926T073549Z.jsonl: 50 per founding after the break, four eras)',
  inputs: [xml('GlobalParameters', 'Name=GRIEVANCE_MULTIPLIER_FOR_BROKEN_PROMISE', 'Value')],
});

/** The settle promise's reach: the promiser's founding breaks or costs when
 *  the new centre lies within this many plots of the asker's BORDER (the
 *  nearest plot it owns). Border 1, 2 and 3 broke a kept promise (border 3
 *  at city distance 6 too); border 4 to 8 cost nothing. */
export const SETTLE_PROMISE_REACH = srcConst('eras.settlePromiseReach', 3, {
  lab: 'runs/promise_break_20260926T073549Z.jsonl (the promise_c2s1_prom_b1..b8 scenes, e.g. '
    + 'runs/promise_c2s1_prom_b1_20260926T071452Z.log): a kept promise broke at border 1, 2, 3 '
    + '(runs/promise_c2s1_prom_b3c6_20260926T072023Z.log: city distance 6); border 4-8 cost nothing '
    + '(runs/promise_c2s1_prom_b4_20260926T071719Z.log, 5 of 5)',
});

/** CIV6 (DIPLOACTION_DECLARE_WAR_OF_RETRIBUTION): "a player who has broken a
 *  promise to you within the past 30 turns" — the window a break opens. */
export const RETRIBUTION_TURNS = srcConst('eras.retributionTurns', 30,
  { pedia: 'LOC_DIPLOACTION_DECLARE_WAR_OF_RETRIBUTION_DESCRIPTION: "a player who has broken a promise to you within the past 30 turns"' });
