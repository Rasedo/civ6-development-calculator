/**
 * THE AI'S VALUE TABLES (GameCore_XP2 AI/Value_Manager.cpp and the GlobalAI;
 * `tools/civ6lab/dll_readings.md` "H-1: the research AI" and "H-1: the civics
 * AI"). The horizon and the discount every tree value pays its yields over,
 * the pseudo-yields the values read, and the share an unlocked building or
 * district stands for.
 */
import { srcConst, xml } from './provenance';

const py = (name: string) => xml('PseudoYields', `PseudoYieldType=${name}`, 'DefaultValue');

/** The value horizon (the GlobalAI's `m_valueHorizons`[1], [[game+0x408]+0x2f0]+4): a
 *  row more turns away than this scores -9999, and its value is the yield it
 *  pays from the turn it lands to this one. */
export const AI_VALUE_HORIZON = srcConst('aiValue.horizon', 50, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the research AI — every AI_Research.csv row of the 29 duels past 50 turns scores -9999 + its prereqs, every row at 50 or fewer does not (632,528 rows, 12 exceptions are contracts and Future Tech)',
});

/** The horizon a policy's and a government's value runs to (the policy job
 *  0x621eb0 and the choice 0x625d70 pass `m_valueHorizons`[0]): the filler
 *  0x6dd9a0 writes speed(50) there, 50 x the speed's CostMultiplier / 100
 *  (0x5254d0 -> 0x525400) — 25 at the online speed. */
export const AI_POLICY_HORIZON = srcConst('aiValue.policyHorizon', 25, {
  derived: '50 x the online CostMultiplier / 100 (0x6dd9a0 -> 0x5254d0); at the 4 percent discount the city-states\' Urban Planning 14 and God King 21 are their weight-0 values (AI_GovtPolicies.csv, 29 duels)',
  inputs: [xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CostMultiplier')],
});

/** The horizon a belief's value runs to (the belief scores 0x7500d0 pass
 *  `m_valueHorizons`[2]): the filler 0x6dd9a0 writes speed(200) there, 200 x
 *  the speed's CostMultiplier / 100 — 100 at the online speed. */
export const AI_BELIEF_HORIZON = srcConst('aiValue.beliefHorizon', 100, {
  derived: '200 x the online CostMultiplier / 100 (0x6dd9a0 -> 0x5254d0); Choral Music 75 and Feed the World 68 on one city at 4 percent (AI_Religious.csv, runs/h1_duelv1124 t2)',
  inputs: [xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CostMultiplier')],
});

/** The discount the value's present value runs at, in percent per turn: the
 *  GlobalAI's +0x290 (its initializer 0x6ddb40..0x6ddba3), AI_DISCOUNT_RATE
 *  through the speed's multiplier (0x525590: x 100 / CostMultiplier) —
 *  2.0 x 100 / 50 at the online speed. */
export const AI_DISCOUNT_PCT = srcConst('aiValue.discountPct', 4, {
  derived: 'AI_DISCOUNT_RATE x 100 / the online CostMultiplier (0x525590); every Civic score of AI_GovtPolicies.csv a root row logs fits 5 x (PV(50) - PV(n)) + 20 at 4 percent, at 2 percent none does',
  inputs: [xml('GlobalParameters', 'Name=AI_DISCOUNT_RATE', 'Value'), xml('GameSpeeds', 'GameSpeedType=GAMESPEED_ONLINE', 'CostMultiplier')],
});

/** The pseudo-yields the tree values read, their DefaultValue (the
 *  per-player bias over them, 0x700810, is the shared value layer's). */
export const PSEUDOYIELD_TECHNOLOGY = srcConst('aiValue.pyTechnology', 5, py('PSEUDOYIELD_TECHNOLOGY'));
export const PSEUDOYIELD_CIVIC = srcConst('aiValue.pyCivic', 5, py('PSEUDOYIELD_CIVIC'));
export const PSEUDOYIELD_WONDER = srcConst('aiValue.pyWonder', 2, py('PSEUDOYIELD_WONDER'));
export const PSEUDOYIELD_DISTRICT = srcConst('aiValue.pyDistrict', 4, py('PSEUDOYIELD_DISTRICT'));

/** The share one unlocked building, wonder or district stands for (0x7b3e50
 *  and 0x7a9a10: 0.5 at 0xd20458, a wonder's and a district's through their
 *  pseudo-yields). */
export const AI_UNLOCK_SHARE = srcConst('aiValue.unlockShare', 0.5, {
  lab: 'tools/civ6lab/dll_readings.md H-1: the research AI (0x7b3e50: the building and district loops, 0.5 at 0xd20458)',
});
