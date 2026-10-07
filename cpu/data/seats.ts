import type { DistrictId } from '../core/types';
import type { GpPermKey } from './greatPeople';
import { srcConst, xml, type SrcMap } from './provenance';
import { speedTurns, speedTurnsSrc } from './constants';

/** shorthand: one `GlobalParameters` row's `Value` */
const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');
/** shorthand: one `ModifierArguments` cell — a magnitude a modifier carries */
const modArg = (id: string, name = 'Amount') =>
  xml('ModifierArguments', `ModifierId=${id}&Name=${name}`, 'Value');

/** `free` is the FREE CITIES player of CIV6 (CIVILIZATION_FREE_CITIES,
 *  CIVILIZATION_LEVEL_FREE_CITIES): it holds the cities loyalty took from
 *  their owners, founds nothing, and stands in DIPLO_STATE_FREE_CITIES_NEUTRAL
 *  with everyone — anyone may attack it without a declaration. */
export type SeatClass = 'major' | 'minor' | 'hostile' | 'free';

export interface SeatCaps {
  /**
   * This seat's units accrue EXPERIENCE and promote with it.
   *
   * Zero would be wrong: a barbarian carrying `xp = 0` would ACCUMULATE from
   * its next attack and start fielding veterans. Civ 6 barbarians have no
   * promotions at all.
   */
  xp: boolean;
  alwaysHostile: boolean;
}

export const SEAT_CAPS: Record<SeatClass, SeatCaps> = {
  major: { xp: true, alwaysHostile: false },
  minor: { xp: true, alwaysHostile: false },
  hostile: { xp: false, alwaysHostile: true },
  // CIV6: a Free City "will seek to defend themselves from military
  // intrusion" and may be taken by anyone — the barbarians' hostility bit,
  // though a Free City fields no unit of its own here.
  free: { xp: false, alwaysHostile: true },
};

/**
 * MINOR `xp`: a city-state's units bank experience by the rule every unit
 * does — the install writes no experience column per player class — and
 * nothing spends it, because no driver promotes a minor's unit.
 */

// ---------------------------------------------------------------------------
// PACING AND FLAVOUR
//
// Everything below applies to a SEAT — whichever seat. Nothing here is keyed
// to which seat asks.
//
// SOURCING. A large fraction is SOURCED against Civ 6, each with its citation
// at the definition: RELIC_*, TOURISM_PER_VISITOR_PER_CIV,
// CULTURE_PER_DOMESTIC_TOURIST, DIPLO_FAVOR_PER_SUZERAIN, CONGRESS_*,
// DVP_PER_RESOLUTION, DIPLO_VICTORY_POINTS, DEDICATIONS, DED_EVENT_SCORE,
// WAR_MIN_TURNS, and the age bars ERA_DARK_T / ERA_GOLDEN_T, which are the
// install's own DARK_AGE_SCORE_BASE_THRESHOLD and
// GOLDEN_AGE_SCORE_BASE_THRESHOLD. The rest is deliberate model tuning, not
// Civ 6 values: the aggression/settle cadence, the gang-up bar, and the
// governor constants.
//
// SHIPPED-ONLY: DOW_PROXIMITY has no TypeScript reader. It exists to reach
// rules.json, where the denounce decider reads it.
// ---------------------------------------------------------------------------

export type { CivId, LeaderId } from '../../world/roster';
export { CIV_IDS, CIV_LEADERS } from '../../world/roster';

/** A civilization's CivilizationCitizenNames rows — the pool a Spy's and a
 *  named storm's "Choosing a Citizen Name" draws from (0x486c20, each name
 *  drawn leaving it): 40 for every civilization the roster seats, France 42
 *  (runs/h1_duelw1117 / 1118: China's pool 40, 39, 38 ... as its storms and
 *  Spies took names). `citizenNameRows` reads it by roster row. */
export const CITIZEN_NAME_ROWS = srcConst('seats.citizenNameRows', 40, {
  derived: 'the count of CivilizationCitizenNames rows of each roster civilization (Base, Expansion1, Expansion2): 40',
});
export const CITIZEN_NAME_ROWS_FRANCE = srcConst('seats.citizenNameRowsFrance', 42, {
  derived: 'the count of CivilizationCitizenNames rows of CIVILIZATION_FRANCE: 42',
});

/** The cities a seat may FOUND, and the count at which a conquest razes.
 *  Civ 6 caps neither: this is the engines' capacity bound, under the
 *  per-seat storage (CITY_SLOTS_PER_SEAT) so loyalty flips keep headroom,
 *  and over the recordings (runs/h1_duelw1103–1118: China's 13 in 1110 the
 *  most one seat held). The GPU sizes a seat's trade-route slots off it. */
export const MAX_CITIES_PER_SEAT = srcConst('seats.maxCities', 16,
  { stylized: 'a capacity bound, not a Civ 6 rule — the game caps no seat; above the recordings\' most (13), under the storage width (24)' });
/** City COLUMNS a seat is observed and decided over — the same width for every
 * seat. Larger than MAX_CITIES_PER_SEAT because settling caps at that number
 * but loyalty flips do NOT: `transferCity` razes at the cap only on conquest,
 * so a seat can hold more cities than it could ever found, and a narrower
 * window would hide them from the observation and leave them undecidable. The
 * GPU's per-seat-row storage width is this same number (rules.seats.citySlots). */
export const CITY_SLOTS_PER_SEAT = srcConst('seats.citySlots', 24,
  { stylized: 'the per-seat OBSERVATION and storage width (rules.seats.citySlots) — wider than MAX_CITIES_PER_SEAT because loyalty flips are not capped; a capacity choice, not a magnitude' });
/**
 * THE CITY BUILDS ONE THING. Depth 1: the "queue" is the current build and
 * nothing else.
 *
 * OWNER RULING. Only the HEAD accrues (every `progress +=` in this engine
 * reads `queue[0]`), so a deeper slot would hold an id and a permanent zero.
 * Hammers survive a switch through `productionBank`, a separate per-city
 * store that works with or without a queue. A queue belongs in a UI, which
 * emits one build order a turn: exactly this.
 */
export const PRODUCTION_QUEUE_MAX = srcConst('seats.productionQueueMax', 1,
  { stylized: 'OWNER RULING 2026-09-08 — the city builds ONE thing; the deeper slots were never a mechanic (only the head accrues) and cost an action head nobody could use' });
/** CIV 6: a war must run 10 turns at Standard speed, 8 online
 *  (`speedTurns`), before either side may negotiate peace (the leaders'
 *  action panel unlocks the offer then). One floor for every pairing here,
 *  majors and city-states alike. */
export const WAR_MIN_TURNS = srcConst('seats.warMinTurns', speedTurns(10),
  speedTurnsSrc(gp('DIPLOMACY_WAR_MIN_TURNS'), 10));
/** CIV 6: a peace treaty BINDS for 10 turns at Standard speed, 8 online
 *  (`GetMinPeaceDuration` read 8, runs/bds4_durations_lab4_t161.jsonl) — once
 *  peace is made neither side may declare on the other again until the term
 *  runs out. One term for every pairing, majors and city-states alike. */
export const PEACE_TREATY_TURNS = srcConst('seats.peaceTreatyTurns', speedTurns(10),
  speedTurnsSrc(gp('DIPLOMACY_PEACE_MIN_TURNS'), 10));
export const PEACE_GOLD_COST = (warTurns: number) => 150 + 10 * warTurns;

export const LOYALTY_MAX = srcConst('seats.loyaltyMax', 100,
  gp('LOYALTY_MAXIMUM'));
export const LOYALTY_RANGE = 9;
/** CIV6 (IDENTITY_PER_TURN_FROM_FREE_CITIES 10): the loyalty a Free City
 *  makes for itself each turn, where a city-state makes 20. */
export const FREE_CITY_LOYALTY_PER_TURN = srcConst('seats.freeCityLoyaltyPerTurn', 10,
  gp('IDENTITY_PER_TURN_FROM_FREE_CITIES'));
/** CIV6 (IDENTITY_PER_TURN_FROM_RELIGION_MATCHING_FOUNDED 3 /
 *  _MISMATCHING_FOUNDED -3): the loyalty a city of a seat that founded a
 *  religion takes each turn for following it, and for following another. A
 *  city following none, or of a seat that founded none, takes neither
 *  (runs/h1_duelw1105, h1_duelw1106, h1_duelw1108: every Chinese city's
 *  "Other" term rose 3 the turn China's religion took it, and every Roman
 *  city's held still when the same religion took it). */
/** CIV6 (IDENTITY_PER_TURN_FROM_STARVATION): a city whose food falls short
 *  of its citizens' (1108 Taiyuan's "Other" 3 / -1 as its surplus swings
 *  1 / -4, t150-250) */
export const LOYALTY_STARVATION = srcConst('seats.loyaltyStarvation', -4, gp('IDENTITY_PER_TURN_FROM_STARVATION'));
export const LOYALTY_RELIGION_MATCHING = srcConst('seats.loyaltyReligionMatching', 3,
  gp('IDENTITY_PER_TURN_FROM_RELIGION_MATCHING_FOUNDED'));
export const LOYALTY_RELIGION_MISMATCHING = srcConst('seats.loyaltyReligionMismatching', -3,
  gp('IDENTITY_PER_TURN_FROM_RELIGION_MISMATCHING_FOUNDED'));
/** CIV6 (LOYALTY_AFTER_TRANSFERRED_BY_CULTURAL_IDENTITY 100): what a city
 *  starts at after a loyalty transfer — the revolt into a Free City and the
 *  Free City's later joining alike. */
export const LOYALTY_AFTER_CULTURAL_TRANSFER = srcConst('seats.loyaltyAfterCulturalTransfer', 100,
  gp('LOYALTY_AFTER_TRANSFERRED_BY_CULTURAL_IDENTITY'));

/** THE FREE CITY'S REVOLT, the live game's own: one real revolt watched for
 *  ten turns. The watch file names the city, the turn and every unit within
 *  two tiles. */
const FREE_CITY_WATCH = 'tools/civ6lab/runs/freecity_watch_20260921T001500Z.jsonl';
/** THE FREE CITIES' GRANTS, over the 28 revolts of the watched games — the
 *  census `tools/civ6lab/free_city_census.py` reads (C-60). */
const FREE_CITY_CENSUS = 'C-60: runs/cs_watch_obs1_20260923T173434Z.jsonl, runs/cs_watch_obs2_20260923T173434Z.jsonl,'
  + ' runs/cs_watch_lab4_20260923T135005Z.jsonl, runs/rebel_watch_rebel3b_20260924T043843Z.jsonl,'
  + ' runs/rebel_watch_rebel3c_20260924T043919Z.jsonl and the other cs_watch games';
/** A revolt hands the Free City this many of the FORMER OWNER's best chassis
 *  of FREE_CITY_PAIR_CLASS on the flip turn itself (`freeCityPairType`: the
 *  strongest the owner's techs and civics unlock; a grant asks no strategic
 *  resource). */
export const FREE_CITY_PAIR_COUNT = srcConst('seats.freeCityPairCount', 2, {
  lab: `${FREE_CITY_WATCH}: two UNIT_MAN_AT_ARMS of player 62 beside the centre on the flip turn (115);`
    + ` ${FREE_CITY_CENSUS}: two of the era's melee at the first read of the Free City`,
});
export const FREE_CITY_PAIR_CLASS = srcConst('seats.freeCityPairClass', 'MELEE' as const, {
  lab: 'runs/c38s1_watch_c38s1_ext1_20260926T084640Z.jsonl (tools/civ6lab/c60s2_fate.py, 14 flips): the pair\'s'
    + ' melee type orders with the former owner\'s tech count on 12 of 12 — Warriors at 13 techs, Swordsmen'
    + ' at 14, Line Infantry at 38, Infantry at 56 — whatever the world era',
});
/** ...then ONE unit every this many of the city's turns while it stays Free,
 *  the flip turn counted as its first: the 5th, the 10th, ... — a grant, not
 *  production. */
export const FREE_CITY_GRANT_PERIOD = srcConst('seats.freeCityGrantPeriod', 5, {
  lab: `${FREE_CITY_WATCH}: the flip in turn 115, the Crossbowman first read on turn 120;`
    + ` ${FREE_CITY_CENSUS}: 73 grants first read 4, 9, 14, ... turns after the Free City's first read`,
});
/** ...its CLASS drawn over these weights — the classes of the 73 grants on
 *  that cadence (29 light cavalry, 27 ranged, 12 melee, 1 recon; the 4
 *  Builders are a civilian the hostile pool does not host) — and its chassis
 *  that class's of the world era (`eraUnitOfClass`). */
export const FREE_CITY_GRANT_CLASSES = srcConst('seats.freeCityGrantClasses',
  ['LIGHT_CAV', 'RANGED', 'MELEE', 'RECON'] as const, { lab: FREE_CITY_CENSUS });
export const FREE_CITY_GRANT_WEIGHTS = srcConst('seats.freeCityGrantWeights', [29, 27, 12, 1], {
  lab: FREE_CITY_CENSUS,
});
/** CIV6 (LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_*): the citizen
 *  pressure term is linear in the ratio of the stronger side to the weaker —
 *  NEUTRAL_LOYALTY at NEUTRAL_RATIO, MAX_LOYALTY at MAX_RATIO and beyond,
 *  signed for whichever side presses harder (`pressureTerm`). */
export const LOYALTY_PRESS_MAX_LOYALTY = srcConst('seats.loyaltyPressMaxLoyalty', 20,
  gp('LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_MAX_LOYALTY'));
export const LOYALTY_PRESS_MAX_RATIO = srcConst('seats.loyaltyPressMaxRatio', 3,
  gp('LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_MAX_RATIO'));
export const LOYALTY_PRESS_NEUTRAL_LOYALTY = srcConst('seats.loyaltyPressNeutralLoyalty', 0,
  gp('LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_NEUTRAL_LOYALTY'));
export const LOYALTY_PRESS_NEUTRAL_RATIO = srcConst('seats.loyaltyPressNeutralRatio', 1,
  gp('LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_NEUTRAL_RATIO'));
/** CIV6 (the Loyalty pedia): "Each Citizen exerts a base pressure of 1". */
export const CITIZEN_PRESSURE_BASE = srcConst('seats.citizenPressureBase', 1,
  gp('CITIZEN_IDENTITY_PRESSURE_BASE'));
/** CIV6 (the Loyalty pedia): "Citizens in a Capital city exert an additional
 *  1 pressure". */
export const CITIZEN_PRESSURE_CAPITAL = srcConst('seats.citizenPressureCapital', 1,
  gp('CITIZEN_IDENTITY_PRESSURE_CAPITAL'));
/** CIV6 (`Happinesses_XP1.IdentityPerTurnChange`): the loyalty an amenity tier
 *  pays per turn, one install row per tier. */
const happy = (tier: string) =>
  xml('Happinesses_XP1', `HappinessType=HAPPINESS_${tier}`, 'IdentityPerTurnChange');
/** Per-turn loyalty by amenity tier name. Real Civ 6 ±6/±3. */
export const LOYALTY_AMENITY: Record<string, number> = {
  Ecstatic: srcConst('seats.loyaltyAmenity.Ecstatic', 6, happy('ECSTATIC')),
  Happy: srcConst('seats.loyaltyAmenity.Happy', 3, happy('HAPPY')),
  Content: srcConst('seats.loyaltyAmenity.Content', 0, happy('CONTENT')),
  Displeased: srcConst('seats.loyaltyAmenity.Displeased', -3, happy('DISPLEASED')),
  Unhappy: srcConst('seats.loyaltyAmenity.Unhappy', -6, happy('UNHAPPY')),
  Unrest: srcConst('seats.loyaltyAmenity.Unrest', -6, happy('UNREST')),
  Revolt: srcConst('seats.loyaltyAmenity.Revolt', -6, happy('REVOLT')),
};

// --- war weariness ------------------------------------------------------
// WAR WEARINESS IS SCORED PER BATTLE, NOT PER TURN.
//
// The previous model added +1 per turn at war and shed 4 per turn at peace,
// into an accumulator capped at 32 that converted at 8 per amenity. Those are
// the real Civ 6 numbers divided by 50 — and with the SIGN of the war term
// flipped, which is the actual fidelity gap: in Civ 6 a war in which nobody
// fights DECAYS. A phoney war costs nothing; a bloody one is ruinous.
//
//     WWP  = (EraBase * Location) + Death
//     Location = 1 fighting inside your own borders, 2 anywhere else
//     Death    = 3 * EraBase, to the side whose unit died
//     any battle with a CITY on either side scores at the abroad column
//
// PRIMARY SOURCE. Every magnitude below is a GlobalParameters
// row of the shipped game — not a wiki, not a forum:
//
//   WAR_WEARINESS_PER_COMBAT_IN_FOREIGN_LANDS  2     -> WW_ABROAD_MULT
//   WAR_WEARINESS_PER_COMBAT_IN_ALLIED_LANDS   1     -> the at-home column
//   WAR_WEARINESS_PER_UNIT_KILLED              3     -> WW_DEATH_MULT
//   WAR_WEARINESS_DECAY_TURN_AT_WAR            50    -> WW_DECAY_AT_WAR
//   WAR_WEARINESS_DECAY_TURN_AT_PEACE          200   -> WW_DECAY_AT_PEACE
//   WAR_WEARINESS_DECAY_PEACE_DECLARED         2000  -> WW_PEACE_TREATY
//   WAR_WEARINESS_POINTS_FOR_AMENITY_LOSS      400   -> WAR_WEARINESS_PER_AMENITY
//   WAR_WEARINESS_WARMONGER_BASE               16    -> the era tables' row 0
//
// The ERA SCALING is the one part that is NOT in the data: GlobalParameters
// carries a single base of 16 and no era table at all, so the scaling lives
// in the C++ DLL, where
// `EFFECT_ADJUST_WAR_WEARINESS` takes only {Amount, Overall|Domestic|Enemy}
// with no era and no casus-belli argument. So the era rows come from
// https://civilization.fandom.com/wiki/War_weariness_(Civ6) and its reference,
// CivFanatics thread 623207: the two agree everywhere
// except Ancient SURPRISE, where the formula's `3 * min(max(era-1,1),4)` yields
// 19 and the table says 16 — the TABLE is taken, and the data's base of 16
// independently backs it. `WAR_WEARINESS_PER_WMD_LAUNCHED = 10` likewise backs
// the thread's "+10 * base" nuke reading (12x total with the abroad multiplier).
//
// THE AMENITY LOSS is split over the cities (`warWearinessLosses`,
// GameCore_XP2 0x3cda00): each opponent's WWP // 400 goes to the cities it
// originally owned, then to third-party-founded cities, then to the seat's
// own, each city capped at its need plus
// WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, NONFOUNDED_CITY 1,
// FOUNDED_CITY 0}.
//
// UNITS ARE NOW REAL WWP. The accumulator stays an INTEGER, so the derived
// amenity penalty is integer too and there is no float-association risk.

export const WW_ERA_BASE_FORMAL = srcConst('warWeariness.eraFormal',
  [16, 22, 28, 34, 40] as const, {
    pedia: 'the era table of civilization.fandom.com "War weariness (Civ6)" and its reference, CivFanatics thread 623207 — GlobalParameters carries only WAR_WEARINESS_WARMONGER_BASE 16 (row 0) and no era table at all, the scaling living in the DLL',
  });
/** The same table for a SURPRISE war (no casus belli). The premium runs 1.00
 *  at Ancient to 1.30 at Industrial+, never a flat 2. */
export const WW_ERA_BASE_SURPRISE = srcConst('warWeariness.eraSurprise',
  [16, 25, 34, 43, 52] as const, {
    pedia: 'the same wiki era table\'s SURPRISE column (CivFanatics thread 623207); at Ancient the table\'s 16 is taken over the formula\'s 19, backed by WAR_WEARINESS_WARMONGER_BASE 16',
  });
export const WW_ABROAD_MULT = srcConst('warWeariness.abroad', 2,
  gp('WAR_WEARINESS_PER_COMBAT_IN_FOREIGN_LANDS'));
export const WW_DEATH_MULT = srcConst('warWeariness.death', 3,
  gp('WAR_WEARINESS_PER_UNIT_KILLED'));
export const WW_DECAY_AT_WAR = srcConst('warWeariness.decayAtWar', 50,
  gp('WAR_WEARINESS_DECAY_TURN_AT_WAR'));
export const WW_DECAY_AT_PEACE = srcConst('warWeariness.decayAtPeace', 200,
  gp('WAR_WEARINESS_DECAY_TURN_AT_PEACE'));
export const WW_PEACE_TREATY = srcConst('warWeariness.peaceTreaty', 2000,
  gp('WAR_WEARINESS_DECAY_PEACE_DECLARED'));
export const WAR_WEARINESS_PER_AMENITY = srcConst('warWeariness.perAmenity', 400,
  gp('WAR_WEARINESS_POINTS_FOR_AMENITY_LOSS'));
/** A city's cap on the war-weariness amenities it takes, over its need
 *  ceil(pop / 2): a city an at-war opponent originally owned, one another
 *  seat founded, one the seat founded (GameCore_XP2 0x3cda00;
 *  `tools/civ6lab/dll_ww.py` on runs/ww_xsec_*: caps 20 of 20). */
export const WW_LOSS_AT_WAR_CITY = srcConst('warWeariness.lossAtWarCity', 3,
  gp('WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_AT_WAR_CITY'));
export const WW_LOSS_NONFOUNDED_CITY = srcConst('warWeariness.lossNonfoundedCity', 1,
  gp('WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_NONFOUNDED_CITY'));
export const WW_LOSS_FOUNDED_CITY = srcConst('warWeariness.lossFoundedCity', 0,
  gp('WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_FOUNDED_CITY'));
/** CIV6 (War weariness): "every time you drop a nuke, the war weariness it
 *  will incur is equal to 12 times the Era Base value. There is no difference
 *  between dropping a Nuclear Device or a Thermonuclear Device" — 624 WWP in
 *  a surprise war, 480 in a formal one, both of which the Industrial+ rows
 *  above reproduce exactly. GlobalParameters carries the launch's own half as
 *  WAR_WEARINESS_PER_WMD_LAUNCHED 10; the abroad multiplier is the other 2. */
export const WW_WMD_LAUNCHED = srcConst('nuclear.wwLaunched', 10,
  gp('WAR_WEARINESS_PER_WMD_LAUNCHED'));
/* THERE IS NO SURPRISE-VS-FORMAL WEARINESS MULTIPLIER, and weariness is not
 * seat-dependent.
 *
 * THE MAGNITUDE. Nothing in any Civ 6 ruleset carries a x2 war-weariness term.
 * The only surprise-vs-formal number in shipped data is
 * `DiplomaticActions.WarmongerPercent` 150 (SURPRISE) vs 100 (FORMAL) = 1.5 —
 * a WARMONGER/GRIEVANCE column, not a weariness one, and its own description
 * string reads "Normal warmonger penalties increased by 50%".
 *
 * THE SPLIT. Nothing in Civ 6 makes weariness depend on WHICH seats are
 * fighting. An engine limitation is not a game rule.
 *
 * WHAT IS STILL TRUE, AND DELIBERATELY UNDER-MODELLED. The GS Civilopedia says
 * weariness is "increased depending on the era and if you declared war without
 * using a Casus Belli", so the DIRECTION is real. The MAGNITUDE is unobtainable:
 * `EFFECT_ADJUST_WAR_WEARINESS` takes only {Amount, Overall|Domestic|Enemy} —
 * no era argument and no casus-belli argument on any of its seven consumers —
 * so the scaling lives in the C++ DLL and no datamining will ever produce it.
 * Under-modelling a sourced direction is an honest recorded residual;
 * over-modelling a magnitude by 33-100% with a borrowed constant is not.
 *
 * PROVENANCE. The numbers here are sourced to the wiki table and its
 * CivFanatics thread, with the caveat above. The GlobalParameters rows have
 * NOT been read directly — a claim about shipped game data must name a source
 * that was actually fetched. */
/**
 * THE MOMENTS the engines pay, each its Moments row's EraScore; which one
 * fires is the DLL's (GameCore_XP2 Game_History_MomentHandlers, read in
 * tools/civ6lab/dll_readings.md C-94). A plain founding or capture records
 * none. A founding: ON_DESERT / ON_SNOW / ON_TUNDRA by the centre's terrain;
 * NEW_CONTINENT when none of the founder's other cities stands on the
 * centre's continent; NEAR_OTHER_CIV_CITY when another major's city the
 * founder has explored lies within MOMENT_NEAR_CIV_RANGE (0x306b40). A
 * pantheon or a religion: FIRST_IN_WORLD when no other major holds one, else
 * the plain row (0x314840, 0x3057a0). A world wonder: GAME_ERA when its era
 * is the game era's or later, else PAST_ERA (0x3110a0). A city gained from a
 * major: FOREIGN_CAPITAL when it was that major's original capital,
 * PLAYER_DEFEATED when it was that major's last city; a city back with the
 * major that founded it, other than by its loyalty, TO_ORIGINAL_OWNER
 * (0x3088a0). A Great Person: GREAT_PERSON_CREATED_PAST_ERA when the
 * person's era is before the game era, else GAME_ERA (0x3142a0); one
 * patronized with Faith or Gold that paid more than half the points instead
 * records PATRONAGE_FAITH_OVER_HALF / _GOLD_OVER_HALF (the rows' text).
 * Recording (0x3004e0) pays nothing while the game era is before a row's
 * MinimumGameEra or past its MaximumGameEra (`MOMENT_GOODY_MAX_ERA`,
 * `MOMENT_CAMP_MAX_ERA`); a game starts in the Ancient era, which no row's
 * ObsoleteEra reaches.
 */
const moment = (id: string, v: number) =>
  srcConst(`eras.moment.${id}`, v, xml('Moments', `MomentType=MOMENT_${id}`, 'EraScore'));
/** a Moments row's era bound, as an ERAS index */
const momentEra = (id: string, col: 'MinimumGameEra' | 'MaximumGameEra', era: string, v: number) =>
  srcConst(`eras.moment.${id}.${col}`, v, xml('Moments', `MomentType=MOMENT_${id}`, col, { expect: era }));
/** a moment's magnitude its row's own text states */
const momentText = (name: string, v: number, text: string) => srcConst(`eras.moment.${name}`, v, { pedia: text });
export const MOMENT_ON_DESERT = moment('CITY_BUILT_ON_DESERT', 1);
export const MOMENT_ON_SNOW = moment('CITY_BUILT_ON_SNOW', 1);
export const MOMENT_ON_TUNDRA = moment('CITY_BUILT_ON_TUNDRA', 1);
export const MOMENT_NEW_CONTINENT = moment('CITY_BUILT_NEW_CONTINENT', 2);
export const MOMENT_NEAR_CIV_CITY = moment('CITY_BUILT_NEAR_OTHER_CIV_CITY', 1);
export const MOMENT_NEAR_CIV_RANGE = srcConst('eras.momentNearCivRange', 5,
  { lab: 'C-94', note: 'GameCore_XP2 0x306b40: the plot search radius (tools/civ6lab/dll_readings.md)' });
export const MOMENT_PANTHEON = moment('PANTHEON_FOUNDED', 1);
export const MOMENT_PANTHEON_FIRST = moment('PANTHEON_FOUNDED_FIRST_IN_WORLD', 2);
export const MOMENT_RELIGION = moment('RELIGION_FOUNDED', 2);
export const MOMENT_RELIGION_FIRST = moment('RELIGION_FOUNDED_FIRST_IN_WORLD', 3);
export const MOMENT_WONDER_GAME_ERA = moment('BUILDING_CONSTRUCTED_GAME_ERA_WONDER', 4);
export const MOMENT_WONDER_PAST_ERA = moment('BUILDING_CONSTRUCTED_PAST_ERA_WONDER', 3);
export const MOMENT_FOREIGN_CAPITAL = moment('CITY_TRANSFERRED_FOREIGN_CAPITAL', 4);
export const MOMENT_PLAYER_DEFEATED = moment('CITY_TRANSFERRED_PLAYER_DEFEATED', 5);
export const MOMENT_TO_ORIGINAL_OWNER = moment('CITY_TRANSFERRED_TO_ORIGINAL_OWNER', 2);
export const MOMENT_GP_GAME_ERA = moment('GREAT_PERSON_CREATED_GAME_ERA', 1);
export const MOMENT_GP_PAST_ERA = moment('GREAT_PERSON_CREATED_PAST_ERA', 1);
export const MOMENT_GP_FAITH_HALF = moment('GREAT_PERSON_CREATED_PATRONAGE_FAITH_OVER_HALF', 3);
export const MOMENT_GP_GOLD_HALF = moment('GREAT_PERSON_CREATED_PATRONAGE_GOLD_OVER_HALF', 3);
/** the founding's once-a-game rows (0x306b40, `foundingMoments`) */
export const MOMENT_NEAR_WONDER = moment('CITY_BUILT_NEAR_NATURAL_WONDER', 3);
export const MOMENT_NEAR_FLOOD = moment('CITY_BUILT_NEAR_FLOODABLE_RIVER', 1);
export const MOMENT_NEAR_VOLCANO = moment('CITY_BUILT_NEAR_VOLCANO', 1);
export const MOMENT_LARGEST = moment('CITY_BUILT_BECAME_LARGEST_CIV_BY_MARGIN', 3);
/** CIV6 (the rows' text): "within 2 tiles of a natural wonder" / "of a river
 *  that could flood" / "of a volcano that could erupt" */
export const MOMENT_NEAR_RANGE = srcConst('eras.momentNearRange', 2,
  { lab: 'C-94', note: 'GameCore_XP2 0x306b40: natural wonder, floodable river and volcano within 2 (tools/civ6lab/dll_readings.md); the rows\' text says "within 2 tiles"' });
/** CIV6 (LARGEST_CIV_BY_MARGIN): "at least 3 more cities than its next
 *  biggest rival" */
export const MOMENT_LARGEST_MARGIN = srcConst('eras.momentLargestMargin', 3,
  { lab: 'C-94', note: 'GameCore_XP2 0x306b40: cities - 3 >= every other major\'s (tools/civ6lab/dll_readings.md)' });
/** CIV6 (GOODY_HUT_TRIGGERED): "A Tribal Village was contacted", paid while
 *  the game era is the Ancient */
export const MOMENT_GOODY = moment('GOODY_HUT_TRIGGERED', 1);
export const MOMENT_GOODY_MAX_ERA = momentEra('GOODY_HUT_TRIGGERED', 'MaximumGameEra', 'ERA_ANCIENT', 0);
/** CIV6 (BARBARIAN_CAMP_DESTROYED): a camp "leveled to the ground by a
 *  unit"; NEAR_YOUR_CITY "within 6 tiles of one of your cities"; both paid
 *  through the Medieval game era */
export const MOMENT_CAMP = moment('BARBARIAN_CAMP_DESTROYED', 2);
export const MOMENT_CAMP_NEAR = moment('BARBARIAN_CAMP_DESTROYED_NEAR_YOUR_CITY', 3);
export const MOMENT_CAMP_MAX_ERA = momentEra('BARBARIAN_CAMP_DESTROYED', 'MaximumGameEra', 'ERA_MEDIEVAL', 2);
export const MOMENT_CAMP_NEAR_RANGE = momentText('campNearRange', 6,
  'LOC_MOMENT_BARBARIAN_CAMP_DESTROYED_NEAR_YOUR_CITY_DESCRIPTION: "A hostile barbarian camp within 6 tiles of one of your cities was destroyed by a unit."');
/** CIV6 (PLAYER_LEVIED_MILITARY): the seat levies a city-state's military */
export const MOMENT_LEVIED = moment('PLAYER_LEVIED_MILITARY', 1);
/** CIV6 (PLAYER_EARNED_DIPLOMATIC_VICTORY_POINT): "You have won the
 *  Diplomatic Victory resolution and earned Victory Points." */
export const MOMENT_DIPLO_VP = moment('PLAYER_EARNED_DIPLOMATIC_VICTORY_POINT', 2);
/** CIV6 (DISTRICT_CONSTRUCTED_CANAL): every Canal a major completes (one
 *  row, no first-in-world twin) */
export const MOMENT_CANAL = moment('DISTRICT_CONSTRUCTED_CANAL', 2);
/** CIV6 (PLAYER_MET_ALL_MAJORS): a major has met every living major, as
 *  [plain, first in the world] */
export const MOMENT_MET_ALL = [moment('PLAYER_MET_ALL_MAJORS', 3), moment('PLAYER_MET_ALL_MAJORS_FIRST_IN_WORLD', 5)] as const;
/**
 * THE ONCE MOMENTS (`MOMENT_KEYS`, cpu/core/moments.ts): what a player
 * records the first time it holds something, as [plain, first in the world]
 * — the FIRST_IN_WORLD row when no player has recorded it yet, else the
 * plain row; a moment with only one row pays it either way, and one with
 * only a FIRST_IN_WORLD row pays nothing after the first.
 */
export const MOMENT_TECH_ERA = [moment('TECH_RESEARCHED_IN_ERA_FIRST', 1),
  moment('TECH_RESEARCHED_IN_ERA_FIRST_IN_WORLD', 2)] as const;
export const MOMENT_CIVIC_ERA = [moment('CIVIC_CULTURVATED_IN_ERA_FIRST', 1),
  moment('CIVIC_CULTURVATED_IN_ERA_FIRST_IN_WORLD', 2)] as const;
/** CIV6 (CITY_SIZE_*): "A city has reached 10 / 15 / 20 / 25 Population for
 *  the first time" — SMALL, MEDIUM, LARGE, EXTRA_LARGE */
export const MOMENT_CITY_SIZES = (['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE'] as const).map((k, i) => ({
  pop: momentText(`citySize.${k}`, [10, 15, 20, 25][i],
    `LOC_MOMENT_CITY_SIZE_${k}_FIRST_DESCRIPTION: "A city has reached ${[10, 15, 20, 25][i]} Population for the first time in your civilization."`),
  pay: [moment(`CITY_SIZE_${k}_FIRST`, 1), moment(`CITY_SIZE_${k}_FIRST_IN_WORLD`, 2)] as const,
}));
/** CIV6 (GOVERNMENT_ENACTED_TIER_n): "adopts its first Tier n Government",
 *  by the government's `tier` */
export const MOMENT_GOV_TIERS = [1, 2, 3, 4].map((t) =>
  [moment(`GOVERNMENT_ENACTED_TIER_${t}_FIRST`, 2), moment(`GOVERNMENT_ENACTED_TIER_${t}_FIRST_IN_WORLD`, 3)] as const);
/** CIV6 (DISTRICT_CONSTRUCTED_HIGH_ADJACENCY_*): "You have completed your
 *  civilization's first Campus with a starting adjacency bonus of 3 Science
 *  or higher" — by district, the bonus its row's text names and the row's
 *  pay (one row: the same pay first in the world or not) */
export const MOMENT_HIGH_ADJACENCY = ([
  ['CAMPUS', 'CAMPUS', 'Campus', 3, 'Science'],
  ['COMMERCIAL_HUB', 'COMMERCIAL_HUB', 'Commercial Hub', 4, 'Gold'],
  ['HARBOR', 'HARBOR', 'Harbor', 4, 'Gold'],
  ['HOLY_SITE', 'HOLY_SITE', 'Holy Site', 3, 'Faith'],
  ['INDUSTRIAL_ZONE', 'INDUSTRIAL_ZONE', 'Industrial Zone', 4, 'Production'],
  ['THEATER_SQUARE', 'THEATER_SQUARE', 'Theater Square', 3, 'Culture'],
] as const).map(([district, row, name, min, y]) => ({
  district,
  min: momentText(`highAdjacency.${row}`, min,
    `LOC_MOMENT_DISTRICT_CONSTRUCTED_HIGH_ADJACENCY_${row}_DESCRIPTION: "You have completed your civilization's first ${name} with a starting adjacency bonus of ${min} ${y} or higher."`),
  pay: moment(`DISTRICT_CONSTRUCTED_HIGH_ADJACENCY_${row}`, 3),
}));
/** "You own your first seafaring unit" / "flying unit" */
export const MOMENT_UNIT_SEA = [moment('UNIT_CREATED_FIRST_DOMAIN_SEA', 2),
  moment('UNIT_CREATED_FIRST_DOMAIN_SEA_IN_WORLD', 3)] as const;
export const MOMENT_UNIT_AIR = [moment('UNIT_CREATED_FIRST_DOMAIN_AIR', 3),
  moment('UNIT_CREATED_FIRST_DOMAIN_AIR_IN_WORLD', 5)] as const;
/** "You own your first unit that uses this strategic resource" */
export const MOMENT_UNIT_STRATEGIC = [moment('UNIT_CREATED_FIRST_REQUIRING_STRATEGIC', 1),
  moment('UNIT_CREATED_FIRST_REQUIRING_STRATEGIC_IN_WORLD', 2)] as const;
/** "You have trained this unique unit / completed this unique building,
 *  district, tile improvement for the first time" */
export const MOMENT_UNIQUE_UNIT = moment('UNIT_CREATED_FIRST_UNIQUE', 4);
export const MOMENT_UNIQUE_BUILDING = moment('BUILDING_CONSTRUCTED_FIRST_UNIQUE', 4);
export const MOMENT_UNIQUE_DISTRICT = moment('DISTRICT_CONSTRUCTED_FIRST_UNIQUE', 4);
export const MOMENT_UNIQUE_IMPROVEMENT = moment('IMPROVEMENT_CONSTRUCTED_FIRST_UNIQUE', 4);
export const MOMENT_NEIGHBORHOOD = [moment('DISTRICT_CONSTRUCTED_NEIGHBORHOOD_FIRST', 2),
  moment('DISTRICT_CONSTRUCTED_NEIGHBORHOOD_FIRST_IN_WORLD', 3)] as const;
export const MOMENT_SEASIDE_RESORT = [moment('IMPROVEMENT_CONSTRUCTED_SEASIDE_RESORT_FIRST', 2),
  moment('IMPROVEMENT_CONSTRUCTED_SEASIDE_RESORT_FIRST_IN_WORLD', 3)] as const;
/** CIV6 (IMPROVEMENT_CONSTRUCTED_ON_DISASTER_YIELD_TILE_FIRST): "Your civilization
 *  builds its first improvement on a tile that was enriched by a natural
 *  disaster." */
export const MOMENT_DISASTER_IMPROVEMENT = moment('IMPROVEMENT_CONSTRUCTED_ON_DISASTER_YIELD_TILE_FIRST', 1);
/** CIV6 (FORMATION_*): a seat's first Corps / Army (land), Fleet / Armada
 *  (naval), by formation level 1 / 2 */
export const MOMENT_FORMATION = {
  land: [[moment('FORMATION_CORPS_FIRST', 1), moment('FORMATION_CORPS_FIRST_IN_WORLD', 2)] as const,
    [moment('FORMATION_ARMY_FIRST', 1), moment('FORMATION_ARMY_FIRST_IN_WORLD', 2)] as const],
  naval: [[moment('FORMATION_FLEET_FIRST', 1), moment('FORMATION_FLEET_FIRST_IN_WORLD', 2)] as const,
    [moment('FORMATION_ARMADA_FIRST', 1), moment('FORMATION_ARMADA_FIRST_IN_WORLD', 2)] as const],
};
/** CIV6 (BUILDING_CONSTRUCTED_FULL_ENCAMPMENT_FIRST): a city of the seat holding
 *  all three Encampment building requirement sets
 *  (`MILITARISTIC_BUILDING_ROWS`) for the first time; one row */
export const MOMENT_FULL_ENCAMPMENT = moment('BUILDING_CONSTRUCTED_FULL_ENCAMPMENT_FIRST', 3);
/** CIV6 (CITY_POWER_GENERATED_FROM_RESOURCE_*): a city of the seat lit by
 *  Power a plant burned a resource for, for the first time */
export const MOMENT_POWER_FROM_RESOURCE = [moment('CITY_POWER_GENERATED_FROM_RESOURCE_FIRST', 2),
  moment('CITY_POWER_GENERATED_FROM_RESOURCE_FIRST_IN_WORLD', 3)] as const;
/** "Your Religion has added its final Belief and is now complete" */
export const MOMENT_MAX_BELIEFS = [moment('BELIEF_ADDED_MAX_BELIEFS_REACHED', 3),
  moment('BELIEF_ADDED_MAX_BELIEFS_REACHED_FIRST_IN_WORLD', 4)] as const;
/** "You have appointed all available Governors" */
export const MOMENT_GOVERNORS_ALL = moment('GOVERNOR_ALL_APPOINTED_FIRST', 1);
/** "You have established a Trading Post in all civilizations" */
export const MOMENT_TRADING_POST_ALL = [moment('TRADING_POST_CONSTRUCTED_IN_EVERY_CIV', 3),
  moment('TRADING_POST_CONSTRUCTED_IN_EVERY_CIV_FIRST_IN_WORLD', 5)] as const;
/** "Your civilization discovers this natural wonder for the first time" */
export const MOMENT_FIND_WONDER = [moment('FIND_NATURAL_WONDER', 1),
  moment('FIND_NATURAL_WONDER_FIRST_IN_WORLD', 3)] as const;
/** "You have become the first Suzerain of this city-state" — the row has no
 *  plain twin */
export const MOMENT_FIRST_SUZERAIN = moment('PLAYER_GAVE_ENVOY_BECAME_SUZERAIN_FIRST_IN_WORLD', 2);
/** CIV6 (Taj Mahal): the wonder pays only for moments "usually worth 2 or
 *  more Era Score", so the threshold is a rule, not a tuning knob. */
export const ERA_SCORE_MOMENT_MIN = srcConst('eras.momentMin', 2,
  modArg('TAJ_MAHAL_EXTRA_ERA_SCORE', 'MinScore'));
/**
 * THE GAME ERA'S TIMING (GameCore_XP2 Game_Eras 0x2c2dc0, 0x2c4c80). After
 * the turn counter moves, while the game is short of the last era: with no
 * countdown running, one starts (NEXT_ERA_TURN_COUNTDOWN) on a turn at least
 * the era's minimum less the countdown past its first turn when the era's
 * maximum less the countdown has come, or when at least half the major
 * civilizations stand in a later era; a running countdown ticks once a turn
 * and the next era begins the turn it runs out, ten turns after it started.
 * The minimum and maximum are the Eras_XP1 rows (40 and 60 for every era
 * Ancient through Information) at the speed's CostMultiplier, truncated
 * (0x5254d0). The H-1 Duels' eras began at 31, 61, 91, 121, 151, 181, 201,
 * 231 and 31, 61, 91, 121, 151, 173, 193, 223 — 16 of 16 by this rule.
 */
export const ERA_MIN_TURNS = srcConst('eras.minTurns', 20,
  xml('Eras_XP1', 'EraType=ERA_ANCIENT', 'GameEraMinimumTurns', { scale: 0.5, note: 'every era Ancient..Information writes 40; × CostMultiplier 50 / 100' }));
export const ERA_MAX_TURNS = srcConst('eras.maxTurns', 30,
  xml('Eras_XP1', 'EraType=ERA_ANCIENT', 'GameEraMaximumTurns', { scale: 0.5, note: 'every era Ancient..Information writes 60; × CostMultiplier 50 / 100' }));
export const ERA_COUNTDOWN = srcConst('eras.countdown', 10, gp('NEXT_ERA_TURN_COUNTDOWN'));
/**
 * CIV6 (Ages; Game_Eras 0x2c0e80, 0x2c55d0, 0x2c6be0). The era score is the
 * whole game's. As an era begins each major's age is its score against the
 * bars the era before fixed — Dark below the Dark bar, Golden at or above
 * the Golden bar (Heroic out of a Dark age), Normal between — and then its
 * new bars are fixed: the score now, plus DARK_AGE / GOLDEN_AGE
 * _SCORE_BASE_THRESHOLD at the speed's SCALING_SLIGHT multiplier (truncated:
 * 11 and 22 online), plus THRESHOLD_SHIFT_PER_CITY for each city past the
 * first, PER_PAST_GOLDEN_AGE for each Golden or Heroic age entered and
 * PER_PAST_DARK_AGE for each Dark one (this one counted), plus the entered
 * era's Eras_XP2 EraScoreThresholdShift; neither bar below 0. The game's
 * start fixes the first bars the same way off a score of 0 (8 and 19). The
 * other THRESHOLD_SHIFT rows are 0 in Gathering Storm. Every bar of the H-1
 * Duels 1103 / 1104 (both majors, every era) by this rule.
 */
export const ERA_DARK_T = srcConst('eras.darkT', 14,
  gp('DARK_AGE_SCORE_BASE_THRESHOLD'));
export const ERA_GOLDEN_T = srcConst('eras.goldenT', 28,
  gp('GOLDEN_AGE_SCORE_BASE_THRESHOLD'));
/** GAMESPEED_ONLINE's SCALING_SLIGHT multiplier, a percent: the age bars'
 *  speed scaling (0x2c6be0 names SCALING_SLIGHT; 0x525500 multiplies). */
export const AGE_SLIGHT_PCT = srcConst('eras.slightPct', 80,
  xml('GameSpeed_Scalings', 'GameSpeedScalingType=ONLINE_SLIGHT', 'DefaultCostMultiplier'));
export const AGE_DARK_BASE = Math.floor(ERA_DARK_T * AGE_SLIGHT_PCT / 100);
export const AGE_GOLDEN_BASE = Math.floor(ERA_GOLDEN_T * AGE_SLIGHT_PCT / 100);
export const AGE_SHIFT_PER_CITY = srcConst('eras.shiftPerCity', 1, gp('THRESHOLD_SHIFT_PER_CITY'));
export const AGE_SHIFT_PAST_GOLDEN = srcConst('eras.shiftPastGolden', 5,
  gp('THRESHOLD_SHIFT_PER_PAST_GOLDEN_AGE'));
export const AGE_SHIFT_PAST_DARK = srcConst('eras.shiftPastDark', -5,
  gp('THRESHOLD_SHIFT_PER_PAST_DARK_AGE'));
/** each era's Eras_XP2 EraScoreThresholdShift, by ERAS index: only the
 *  Ancient row writes one */
export const AGE_ERA_SHIFT: readonly number[] = [
  srcConst('eras.ancientShift', -3, xml('Eras_XP2', 'EraType=ERA_ANCIENT', 'EraScoreThresholdShift')),
  ...Array<number>(8).fill(srcConst('eras.laterShift', 0, {
    derived: '0 where the install writes no EraScoreThresholdShift (no Eras_XP2 row after the Ancient one does)',
    inputs: [xml('Eras_XP2', 'EraType=ERA_CLASSICAL', 'EraScoreThresholdShift')],
  })),
];

/** The [Dark, Golden] bars a major's age is next judged by, fixed as era
 *  `era` begins on `score` with `cities` cities and `golden` / `dark` ages
 *  entered (the one beginning counted). */
export function ageBars(score: number, cities: number, golden: number, dark: number, era: number): [number, number] {
  const shift = AGE_SHIFT_PER_CITY * Math.max(0, cities - 1)
    + AGE_SHIFT_PAST_GOLDEN * golden + AGE_SHIFT_PAST_DARK * dark + AGE_ERA_SHIFT[era];
  return [Math.max(0, score + AGE_DARK_BASE + shift), Math.max(0, score + AGE_GOLDEN_BASE + shift)];
}

/** the bars every major begins the game with: score 0, no city, no age */
export const AGE_START_BARS = ageBars(0, 0, 0, 0, 0);
/** `Seat.age`: 0 a Dark Age, 1 Normal, 2 Golden. A HEROIC age is a Golden one
 *  reached out of a Dark one, so it carries this same code and only
 *  `prevAge` tells the two apart — which is why every "is this seat in a
 *  Golden Age" test is an equality against this. */
export const AGE_GOLDEN = 2;
/** CIV6 (the Loyalty pedia, LOC_PEDIA_CONCEPTS_PAGE_LOYALTY_1_CHAPTER_CONTENT_PARA_2):
 *  "Golden and Heroic Ages add 0.5 for all Citizens, while Dark Ages
 *  subtract 0.5" — the per-citizen pressure term by `Seat.age` (Dark,
 *  Normal, Golden or Heroic). */
export const AGE_PRESSURE = srcConst('eras.agePressure', [-0.5, 0, 0.5], {
  pedia: 'Expansion1_Civilopedia_Text.xml LOC_PEDIA_CONCEPTS_PAGE_LOYALTY_1_CHAPTER_CONTENT_PARA_2 — "Golden and Heroic Ages add 0.5 for all Citizens, while Dark Ages subtract 0.5"',
});
/**
 * DIPLOMATIC FAVOR — the World Congress currency. Real Civ 6
 * (Gathering Storm, verified against the Civilopedia "World Congress" concept
 * and the Civilization wiki "Diplomatic Favor (Civ6)" page): each civ earns
 * favor per turn equal to its GOVERNMENT TIER (1-4; Chiefdom is tier 0 and
 * pays nothing), plus +1 per city-state it is SUZERAIN of.
 *
 * The other terms (favor from ALLIANCES, the pollution, grievance and
 * occupied-capital PENALTIES) each carry their own sourced constant, and
 * `diplomaticFavorPerTurn` sums them.
 */
export const DIPLO_FAVOR_PER_SUZERAIN = srcConst('eras.diplomaticFavorPerSuzerain', 1,
  gp('WORLD_CONGRESS_SUZERAIN_FAVOR_PER_TURN'));

/**
 * The WORLD CONGRESS. Sourced (Civ 6 wiki, GS "World Congress (Civ6)"):
 * the Congress begins meeting in the MEDIEVAL era and convenes every 30 turns
 * on Standard speed. Each Regular Session proposes resolutions "about topics
 * relevant for the current world"; every resolution has two OUTCOMES (A/B),
 * each applying to a TARGET. Voting: "Casting a single vote on a Resolution
 * is free. The cost of each subsequent vote, however, scales linearly by a
 * factor of 10" (the k-th extra vote costs 10k favor). The OUTCOME with more
 * votes wins, then the TARGET by plurality among the winning outcome's votes.
 * "Every civilization which voted for the outcome/target combo that
 * eventually won gets 1 Diplomatic Victory point" (June 2019 rule). Refunds:
 * winning combo 0%, winning outcome with a losing target 50%, losing outcome
 * 100%. "Starting from the Modern Era, a Resolution on Diplomatic Victory
 * points will always be available as the 3rd Resolution" — A: target gains 2
 * DVP, B: target loses 2. Diplomatic Victory needs 20 Diplomatic Victory
 * Points (wiki, "Victory (Civ6)").
 *
 * SCRIPTED-CHOOSER STYLIZATION: real Civ 6 lets each player choose outcome,
 * target and favor spend per resolution. There is no vote head on the wire
 * yet (an open AUDIT item), so both engines run the SAME zero-draw scripted
 * policy: every alive civ casts its free vote by a deterministic
 * self-interest rule, spends favor ONLY on the Diplomatic Victory resolution
 * (all of it, up the real cost curve), and ties resolve to outcome A / the
 * lower target index / the lower seat. The real slate is a random draw among
 * era-eligible resolutions; here it rotates deterministically by session.
 */
export const CONGRESS_INTERVAL = srcConst('eras.congressInterval', speedTurns(30),
  speedTurnsSrc(gp('WORLD_CONGRESS_MAX_TIME_BETWEEN_MEETINGS'), 30));
export const CONGRESS_MIN_ERA = srcConst('eras.congressMinEra', 2,
  gp('WORLD_CONGRESS_INITIAL_ERA'));
export const DVP_PER_RESOLUTION = srcConst('eras.dvpPerResolution', 1,
  { pedia: 'CIV6 (World Congress, June 2019 rule): "Every civilization which voted for the outcome/target combo that eventually won gets 1 Diplomatic Victory point" — the install publishes no such row' });
/** Diplomatic Victory threshold (real Civ 6 GS: 20 points). */
export const DIPLO_VICTORY_POINTS = srcConst('eras.diploVictoryPoints', 20,
  gp('DIPLOMATIC_VICTORY_POINTS_REQUIRED'));

type CongressTargetKind = 'district' | 'gpClass' | 'gwObject' | 'seat'
  | 'currency' | 'policy' | 'government' | 'project' | 'csType' | 'feature'
  | 'building' | 'promoClass' | 'religion' | 'governor' | 'spyMission'
  | 'competition' | 'luxury';
/** The wire ORDER of the target kinds: a resolution's `t` on the exported
 *  rules is this array's index, so the GPU's `_congress_space` /
 *  `_congress_pref` switch on the same numbers. APPEND only. */
export const CONGRESS_TARGET_KINDS: readonly CongressTargetKind[] = [
  'district', 'gpClass', 'gwObject', 'seat',
  'currency', 'policy', 'government', 'project', 'csType', 'feature',
  'building', 'promoClass', 'religion', 'governor', 'spyMission', 'competition',
  'luxury',
];

interface CongressResolutionDef {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  name: string;
  /** civEraIndex floor for the slate (0 = from the congress's own gate). */
  minEra: number;
  /** civEraIndex ceiling, inclusive (99 = none). */
  maxEra: number;
  target: CongressTargetKind;
}
/**
 * PROVENANCE (cpu/data/provenance.ts): the install's own `Resolutions` row for each
 * modelled resolution. Four rows this catalog carries have no readable install row at
 * all (POLICY_TREATY, TREATY_ORGANIZATION, GOVERNANCE_DOCTRINE, SCORED_COMPETITION) and stay untagged.
 */
const CONGRESS_SRC: Record<string, SrcMap> = {
  URBAN_DEVELOPMENT_TREATY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_URBAN_DEVELOPMENT', 'TargetKind', { expect: 'DISTRICT' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_URBAN_DEVELOPMENT', 'EarliestEra')] },
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_URBAN_DEVELOPMENT', 'LatestEra', { expect: 'ERA_MODERN' }),
  },
  PATRONAGE: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_PATRONAGE', 'TargetKind', { expect: 'GREATPERSONCLASS' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_PATRONAGE', 'EarliestEra')] },
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_PATRONAGE', 'LatestEra', { expect: 'ERA_MODERN' }),
  },
  MIGRATION_TREATY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_MIGRATION_TREATY', 'TargetKind', { expect: 'PLAYER' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_MIGRATION_TREATY', 'EarliestEra', { expect: 'ERA_INDUSTRIAL' }),
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_MIGRATION_TREATY', 'LatestEra')] },
  },
  HERITAGE_ORGANIZATION: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_HERITAGE_ORG', 'TargetKind', { expect: 'GREATWORKOBJECT' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_HERITAGE_ORG', 'EarliestEra', { expect: 'ERA_MODERN' }),
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_HERITAGE_ORG', 'LatestEra')] },
  },
  MERCENARY_COMPANIES: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_MERCENARY_COMPANIES', 'TargetKind', { expect: 'YIELD' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_MERCENARY_COMPANIES', 'EarliestEra')] },
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_MERCENARY_COMPANIES', 'LatestEra')] },
  },
  TRADE_POLICY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_TRADE_TREATY', 'TargetKind', { expect: 'PLAYER' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_TRADE_TREATY', 'EarliestEra')] },
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_TRADE_TREATY', 'LatestEra')] },
  },
  WORLD_IDEOLOGY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_WORLD_IDEOLOGY', 'TargetKind', { expect: 'GOVERNMENT' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_WORLD_IDEOLOGY', 'EarliestEra', { expect: 'ERA_MODERN' }),
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_WORLD_IDEOLOGY', 'LatestEra')] },
  },
  BORDER_CONTROL_TREATY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_BORDER_CONTROL', 'TargetKind', { expect: 'PLAYER' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_BORDER_CONTROL', 'EarliestEra')] },
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_BORDER_CONTROL', 'LatestEra', { expect: 'ERA_MODERN' }),
  },
  SOVEREIGNTY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_SOVEREIGNTY', 'TargetKind', { expect: 'MINORCIVBONUS' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_SOVEREIGNTY', 'EarliestEra')] },
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_SOVEREIGNTY', 'LatestEra', { expect: 'ERA_MODERN' }),
  },
  PUBLIC_WORKS_PROGRAM: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_PUBLIC_WORKS', 'TargetKind', { expect: 'PROJECT' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_PUBLIC_WORKS', 'EarliestEra', { expect: 'ERA_ATOMIC' }),
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_PUBLIC_WORKS', 'LatestEra', { expect: 'ERA_INFORMATION' }),
  },
  DEFORESTATION_TREATY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_DEFORESTATION_TREATY', 'TargetKind', { expect: 'FEATURE' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_DEFORESTATION_TREATY', 'EarliestEra', { expect: 'ERA_ATOMIC' }),
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_DEFORESTATION_TREATY', 'LatestEra', { expect: 'ERA_INFORMATION' }),
  },
  GLOBAL_ENERGY_TREATY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_GLOBAL_ENERGY_TREATY', 'TargetKind', { expect: 'BUILDING' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_GLOBAL_ENERGY_TREATY', 'EarliestEra', { expect: 'ERA_MODERN' }),
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_GLOBAL_ENERGY_TREATY', 'LatestEra')] },
  },
  PUBLIC_RELATIONS: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_PUBLIC_RELATIONS', 'TargetKind', { expect: 'PLAYER' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_PUBLIC_RELATIONS', 'EarliestEra')] },
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_PUBLIC_RELATIONS', 'LatestEra', { expect: 'ERA_ATOMIC' }),
  },
  MILITARY_ADVISORY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_MILITARY_ADVISORY', 'TargetKind', { expect: 'UNITPROMOTIONCLASS' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_MILITARY_ADVISORY', 'EarliestEra')] },
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_MILITARY_ADVISORY', 'LatestEra', { expect: 'ERA_ATOMIC' }),
  },
  WORLD_RELIGION: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_WORLD_RELIGION', 'TargetKind', { expect: 'RELIGION' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_WORLD_RELIGION', 'EarliestEra')] },
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_WORLD_RELIGION', 'LatestEra', { expect: 'ERA_INDUSTRIAL' }),
  },
  ESPIONAGE_PACT: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_ESPIONAGE_PACT', 'TargetKind', { expect: 'UNITOPERATION' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_ESPIONAGE_PACT', 'EarliestEra', { expect: 'ERA_INDUSTRIAL' }),
    maxEra: xml('Resolutions', 'ResolutionType=WC_RES_ESPIONAGE_PACT', 'LatestEra', { expect: 'ERA_ATOMIC' }),
  },
  ARMS_CONTROL: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_ARMS_CONTROL', 'TargetKind', { expect: 'PLAYER' }),
    minEra: xml('Resolutions', 'ResolutionType=WC_RES_ARMS_CONTROL', 'EarliestEra', { expect: 'ERA_ATOMIC' }),
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_ARMS_CONTROL', 'LatestEra')] },
  },
  LUXURY_POLICY: {
    target: xml('Resolutions', 'ResolutionType=WC_RES_LUXURY', 'TargetKind', { expect: 'RESOURCE' }),
    minEra: { derived: '0 where the install row names no EarliestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_LUXURY', 'EarliestEra')] },
    maxEra: { derived: '99 where the install row names no LatestEra', inputs: [xml('Resolutions', 'ResolutionType=WC_RES_LUXURY', 'LatestEra')] },
  },
};

/**
 * The modeled resolution subset — the rows whose BOTH outcomes land on
 * existing engine channels, era windows verbatim from the wiki table.
 * Catalog order is load-bearing: the slate rotation and the wire's res
 * indices key on it.
 */
const RAW_CONGRESS_RESOLUTIONS: readonly CongressResolutionDef[] = [
  // CIV6: "A: +100% Production towards buildings in this district. /
  // B: No buildings can be created in this district." (through Modern) The
  // target space is UDT_DISTRICTS.
  { id: 'URBAN_DEVELOPMENT_TREATY', name: 'Urban Development Treaty', minEra: 0, maxEra: 5, target: 'district' },
  // CIV6: "A: +100% points towards Great People of this class. / B: No
  // points earned towards Great People of this class" — B zeroes EVERY
  // source, districts, buildings and projects alike. (through Modern)
  { id: 'PATRONAGE', name: 'Patronage', minEra: 0, maxEra: 5, target: 'gpClass' },
  // CIV6: "A: +20% Population growth but -5 Loyalty per turn in target
  // player's cities. / B: +5 Loyalty per turn but -20% growth." (Industrial+)
  { id: 'MIGRATION_TREATY', name: 'Migration Treaty', minEra: 4, maxEra: 99, target: 'seat' },
  // CIV6: "A: Great Works of this type generate +100% Tourism. / B: No
  // Tourism from Great Works of this type." (Modern+)
  { id: 'HERITAGE_ORGANIZATION', name: 'Heritage Organization', minEra: 5, maxEra: 99, target: 'gwObject' },
  // CIV6: "A: Producing, or purchasing military units using the chosen
  // currency type, is +100% of the cost / B: ... -50% of the cost." The
  // target is the YIELD units are paid in — Production, Gold or Faith
  // (WorldCongress.lua, WC_Validate_YieldBan) — so the multiplier rides the
  // production cost on Production and the purchase price on a currency.
  { id: 'MERCENARY_COMPANIES', name: 'Mercenary Companies', minEra: 0, maxEra: 99, target: 'currency' },
  // CIV6: "A: Each Trade Route sent to target player provides +4 Gold to the
  // sender. This player receives +1 Trade Route capacity. / B: All active
  // international Trade Routes between target player and other players are
  // ended. No new routes of such kind can be established."
  { id: 'TRADE_POLICY', name: 'Trade Policy', minEra: 0, maxEra: 99, target: 'seat' },
  // CIV6: "A: All players with this Policy in their Government gain 1
  // Diplomatic Favor per turn. / B: This Policy cannot be assigned by any
  // player."
  { id: 'POLICY_TREATY', name: 'Policy Treaty', minEra: 0, maxEra: 99, target: 'policy' },
  // CIV6: "A: This Government type gains a Wildcard policy slot. / B: This
  // Government type loses a Wildcard policy slot." (Modern+)
  { id: 'WORLD_IDEOLOGY', name: 'World Ideology', minEra: 5, maxEra: 99, target: 'government' },
  // CIV6: "A: New Districts built by target player act as Culture bombs. /
  // B: Target player's borders cannot grow via Culture." (through Modern)
  { id: 'BORDER_CONTROL_TREATY', name: 'Border Control Treaty', minEra: 0, maxEra: 5, target: 'seat' },
  // CIV6: "A: Being Suzerain of a City-State of this type yields +100%
  // Diplomatic Favor. / B: No Diplomatic Favor earned from being Suzerain of
  // a City-State of this type."
  { id: 'TREATY_ORGANIZATION', name: 'Treaty Organization', minEra: 0, maxEra: 99, target: 'csType' },
  // CIV6: "A: +100% of the City-States' yield when sending a Trade Route to a
  // City-State of this type. / B: City-States of this type do not provide
  // their unique Suzerain bonus." (through Modern)
  { id: 'SOVEREIGNTY', name: 'Sovereignty', minEra: 0, maxEra: 5, target: 'csType' },
  // CIV6: "A: +100% Production towards this Project. / B: -50% Production
  // towards this Project." (Atomic through Information)
  { id: 'PUBLIC_WORKS_PROGRAM', name: 'Public Works Program', minEra: 6, maxEra: 7, target: 'project' },
  // CIV6: "A: Clearing Features of this type yields Gold equal to the
  // Production and Food. / B: Features of this type cannot be cleared by any
  // player." (Atomic through Information) The target space is the CLEARABLE
  // features — the rows carrying a chop, in catalog order.
  { id: 'DEFORESTATION_TREATY', name: 'Deforestation Treaty', minEra: 6, maxEra: 7, target: 'feature' },
  // CIV6 (Expansion2_Congress.xml, ResolutionEffects): WhichEffect 1 (A) is
  // WC_RES_BUILDING_PRODUCTION_BAN, "Ban the production of buildings of this
  // type"; WhichEffect 2 (B) is WC_RES_BUILDING_PRODUCTION_BUFF, +100%
  // Production toward them (runs/h1_duelw1106 t222-241: A on the Fossil Fuel
  // Power Plant takes it off Xian's list). (Modern+) The target space is the
  // POWER PLANTS (WC_Validate_PowerBuilding), in catalog order.
  { id: 'GLOBAL_ENERGY_TREATY', name: 'Global Energy Treaty', minEra: 5, maxEra: 99, target: 'building' },
  // CIV6: "A: Target player generates 100% more Grievances, and other players
  // generate 100% more Grievances against this player. / B: Target player
  // generates 50% fewer Grievances, and other players generate 50% fewer
  // Grievances against this player." (through Atomic) It scales EVERY write
  // the target is either side of.
  { id: 'PUBLIC_RELATIONS', name: 'Public Relations', minEra: 0, maxEra: 6, target: 'seat' },
  // CIV6: "A: +5 Combat Strength for units of this promotion class. /
  // B: -5 Combat Strength for units of this promotion class." (through Atomic)
  { id: 'MILITARY_ADVISORY', name: 'Military Advisory', minEra: 0, maxEra: 6, target: 'promoClass' },
  // CIV6: "A: +10 Religious Combat Strength for all units of this Religion. /
  // B: Condemning a unit of this Religion yields 25 Diplomatic Favor."
  // CIV6 (Expansion2_Congress.xml): NO EarliestEra, LatestEra ERA_INDUSTRIAL —
  // available from the start THROUGH the Industrial era, not from it. A
  // religion IS its founder's seat here, so the target space is the seat roster.
  { id: 'WORLD_RELIGION', name: 'World Religion', minEra: 0, maxEra: 4, target: 'religion' },
  // CIV6: "A: Appointing and promoting a Governor of this type yields 15
  // Diplomatic Favor. / B: All active Governors of this type are neutralized
  // for 6 Turns." The published table gives it no era window.
  { id: 'GOVERNANCE_DOCTRINE', name: 'Governance Doctrine', minEra: 0, maxEra: 99, target: 'governor' },
  // CIV6: "A: All Spies function +2 levels higher for the Target Operation. /
  // B: Target Operation is unavailable." The published table gives it no era
  // window; the floor here is where the chassis page puts the unit —
  // "Starting in the Renaissance era, Spies will become available" — because
  // neither outcome can act before a Spy can run an operation.
  // CIV6 (Expansion2_Congress.xml): EarliestEra Industrial, LatestEra Atomic.
  { id: 'ESPIONAGE_PACT', name: 'Espionage Pact', minEra: 4, maxEra: 6, target: 'spyMission' },
  // CIV6 (World Congress): a SCORED COMPETITION is enacted by a resolution in
  // a Regular Session, and those "start appearing from the Modern Era onward".
  // "If enacted, players who vote in favor of the Scored Competition will
  // compete to contribute to the cause" — so outcome A runs it with its A
  // voters as the field, and B is the world declining to hold it. The TARGET
  // names WHICH competition, which is why a second one is a data row.
  { id: 'SCORED_COMPETITION', name: 'Scored Competition', minEra: 5, maxEra: 99, target: 'competition' },
  // CIV6: "A: All players have their Weapons of Mass Destruction set equal to
  // target player's. / B: Target player loses all of their Weapons of Mass
  // Destruction." The published table puts it in the Atomic era, which is
  // also the first era a device can exist in.
  { id: 'ARMS_CONTROL', name: 'Arms Control', minEra: 6, maxEra: 99, target: 'seat' },
  // CIV6: "A: +1 Amenity on duplicates of a Resource. / B: This Luxury
  // resource grants no Amenities." (Renaissance through Industrial per the
  // published table.) Outcome A's REACH — which cities a duplicate's +1
  // serves — is unpublished; each duplicate is one more LUXURY_AMENITY_CITIES
  // copy, served first (`luxuryAmenities`, fitted on the H-1 records).
  // CIV6 (Expansion2_Congress.xml): the row carries NO era columns.
  { id: 'LUXURY_POLICY', name: 'Luxury Policy', minEra: 0, maxEra: 99, target: 'luxury' },
];
export const CONGRESS_RESOLUTIONS: readonly CongressResolutionDef[] =
  RAW_CONGRESS_RESOLUTIONS.map((r) => ({ ...r, src: CONGRESS_SRC[r.id] }));

/** The Urban Development Treaty's target space: the districts
 *  WorldCongress.lua's WC_Validate_UrbanDevelopment offers, in its order —
 *  the City Center first. */
export const UDT_DISTRICTS: readonly DistrictId[] = [
  'CITY_CENTER', 'HOLY_SITE', 'CAMPUS', 'ENCAMPMENT', 'HARBOR', 'AERODROME',
  'COMMERCIAL_HUB', 'ENTERTAINMENT_COMPLEX', 'THEATER_SQUARE', 'INDUSTRIAL_ZONE',
  'GOVERNMENT_PLAZA', 'WATER_PARK', 'DIPLOMATIC_QUARTER', 'PRESERVE',
];

export const CONGRESS_UDT = 0;
export const CONGRESS_PATRONAGE = 1;
export const CONGRESS_MIGRATION = 2;
export const CONGRESS_HERITAGE = 3;
export const CONGRESS_MERCENARY = 4;
export const CONGRESS_TRADE_POLICY = 5;
export const CONGRESS_POLICY_TREATY = 6;
export const CONGRESS_IDEOLOGY = 7;
export const CONGRESS_BORDER_CONTROL = 8;
export const CONGRESS_TREATY_ORG = 9;
export const CONGRESS_SOVEREIGNTY = 10;
export const CONGRESS_PUBLIC_WORKS = 11;
export const CONGRESS_DEFORESTATION = 12;
export const CONGRESS_GLOBAL_ENERGY = 13;
export const CONGRESS_PUBLIC_RELATIONS = 14;
export const CONGRESS_MILITARY_ADVISORY = 15;
export const CONGRESS_WORLD_RELIGION = 16;
export const CONGRESS_GOVERNANCE = 17;
export const CONGRESS_ESPIONAGE = 18;
export const CONGRESS_COMPETITION = 19;
export const CONGRESS_ARMS_CONTROL = 20;
export const CONGRESS_LUXURY_POLICY = 21;
/** Public Relations' two outcomes, as PERCENTAGES of a grievance write. */
export const CONGRESS_PR_MULT_A = srcConst('eras.congressPrMultA', 200,
  { derived: '100 + the install\'s Public Relations outcome-A Amount (+100%), as a PERCENTAGE of a grievance write', inputs: [modArg('WC_RES_PLAYER_GRIEVANCES_BUFF')] });
export const CONGRESS_PR_MULT_B = srcConst('eras.congressPrMultB', 50,
  { derived: '100 + the install\'s Public Relations outcome-B Amount (-50%), as a PERCENTAGE of a grievance write', inputs: [modArg('WC_RES_PLAYER_GRIEVANCES_DEBUFF')] });
/** Military Advisory pays its promotion class +/- this much Combat Strength. */
export const CONGRESS_ADVISORY_CS = srcConst('eras.congressAdvisoryCs', 5,
  modArg('WC_RES_UNIT_COMBAT_BUFF'));
/** Espionage Pact outcome A: the levels every Spy gains on the named
 *  operation — the same magnitude nine Espionage promotions pay for one. */
export const CONGRESS_PACT_LEVELS = srcConst('eras.congressPactLevels', 2,
  modArg('WC_RES_OPERATION_CHANCE_BUFF'));
/** World Religion outcome A's Religious Combat Strength, and outcome B's
 *  favor for condemning a unit of the named religion. */
export const CONGRESS_WORLD_RELIGION_RS = srcConst('eras.congressWorldReligionRs', 10,
  modArg('WC_RES_RELIGIOUS_UNITS_STRENGTH'));
export const CONGRESS_WORLD_RELIGION_FAVOR = srcConst('eras.congressWorldReligionFavor', 25,
  modArg('ANYONE_CONDEMNS_FOR_FAVOR'));
/** CIV6 (Global Energy Treaty, outcome B): the production multiplier toward
 *  the named power plant. */
export const CONGRESS_ENERGY_PROD_MULT = srcConst('eras.congressEnergyProdMult', 2,
  { derived: '1 + Amount/100 — the Global Energy Treaty outcome-B +100% production toward the named building', inputs: [modArg('WC_RES_BUILDING_PRODUCTION_BUFF')] });
/** The always-3rd Diplomatic Victory resolution enters at Modern. */
export const CONGRESS_DV_MIN_ERA = srcConst('eras.congressDvMinEra', 5,
  xml('Resolutions', 'ResolutionType=WC_RES_DIPLOVICTORY', 'EarliestEra', { expect: 'ERA_MODERN', note: '5 is this engine\'s Modern era index' }));
export const CONGRESS_DV_DELTA = srcConst('eras.congressDvDelta', 2,
  modArg('ADD_DIPLOMATIC_VICTORY_POINTS'));
/** The k-th EXTRA vote costs CONGRESS_VOTE_STEP * k favor. */
export const CONGRESS_VOTE_STEP = srcConst('eras.congressVoteStep', 10,
  { pedia: 'CIV6 (World Congress): "The cost of each subsequent vote ... scales linearly by a factor of 10" — the vote curve is not an install row' });
export const CONGRESS_PROD_MULT = srcConst('eras.congressProdMult', 2,
  { derived: '1 + Amount/100 — the Urban Development Treaty outcome-A +100% district-building production', inputs: [modArg('INCREASE_DISTRICT_BUILDING_PRODUCTION')] });
export const CONGRESS_GPP_MULT = srcConst('eras.congressGppMult', 2,
  { derived: '1 + Amount/100 — the Patronage outcome-A +100% Great Person points', inputs: [modArg('INCREASE_GREAT_PERSON_POINTS')] });
/** Migration Treaty growth factors as LITERALS — both engines must see
 * the identical double, and 1 +/- 0.2 does not round to these. */
export const CONGRESS_GROWTH_A = srcConst('eras.congressGrowthA', 1.2,
  { derived: '1 + Amount/100 — the Migration Treaty outcome-A +20% growth', inputs: [modArg('WC_RES_CITY_GROWTH_BONUS')] });
export const CONGRESS_GROWTH_B = srcConst('eras.congressGrowthB', 0.8,
  { derived: '1 + Amount/100 — the Migration Treaty outcome-B -20% growth', inputs: [modArg('WC_RES_CITY_GROWTH_PENALTY')] });
export const CONGRESS_MIG_LOYALTY = srcConst('eras.congressMigLoyalty', 5,
  modArg('WC_RES_CITY_LOYALTY_BONUS'));
export const CONGRESS_GW_MULT = srcConst('eras.congressGwMult', 2,
  { derived: '1 + Amount/100 — the Heritage Organization outcome-A +100% Great Work tourism', inputs: [modArg('ADD_TOURISM_FROM_GREAT_WORK_OBJECT')] });
/** "+100%" / "-50%" as the LITERAL doubles both engines must agree on. Every
 *  congress magnitude below is one of these two faces of the same sourced
 *  pair, so they are named once and shared. */
export const CONGRESS_PLUS_100 = srcConst('eras.congressPlus100', 2,
  { derived: '1 + Amount/100 — the shared "+100%" face every congress buff wears', inputs: [modArg('INCREASE_PROJECT_PRODUCTION')] });
export const CONGRESS_MINUS_50 = srcConst('eras.congressMinus50', 0.5,
  { derived: '1 + Amount/100 — the shared "-50%" face every congress debuff wears', inputs: [modArg('DECREASE_PROJECT_PRODUCTION')] });
/** Trade Policy outcome A: the sender's bonus per route to the target, and
 *  the target's own extra route capacity. */
export const CONGRESS_TRADE_GOLD = srcConst('eras.congressTradeGold', 4,
  modArg('INCREASES_TRADE_TO_GOLD'));
export const CONGRESS_TRADE_CAPACITY = srcConst('eras.congressTradeCapacity', 1,
  modArg('TARGET_ADD_TRADE_ROUTE'));
/** Policy Treaty outcome A: favor per turn to every seat holding the card. */
export const CONGRESS_POLICY_FAVOR = srcConst('eras.congressPolicyFavor', 1,
  { pedia: 'CIV6 (Policy Treaty, outcome A): "All players with this Policy in their Government gain 1 Diplomatic Favor per turn" — the install ships no readable WC_RES row for Policy Treaty' });
/** World Ideology: the wildcard slot the targeted government gains or loses. */
export const CONGRESS_IDEOLOGY_SLOTS = srcConst('eras.congressIdeologySlots', 1,
  modArg('GOVT_ADD_WILDCARD_SLOT'));
/** CIV6 (Culture Bomb): an annexed tile must fall "within 3 hexes of one of
 *  the owner's City Centers". */
export const CULTURE_BOMB_RANGE = srcConst('eras.cultureBombRange', 3,
  { pedia: 'CIV6 (Culture Bomb): an annexed tile must fall "within 3 hexes of one of the owner\'s City Centers" — not an install row' });
/** CIV6 (Diplomatic Favor, "Losing Favor"): "you additionally receive a
 *  -5/turn Diplomatic Favor penalty for each Original Capital city you occupy.
 *  Note that gaining a Capital through Loyalty flip will also count as
 *  occupation." A seat's own favor rate can go negative, and "you will get
 *  stuck at 0 Favor until you manage to do something to earn a lump sum". */
export const FAVOR_OCCUPIED_CAPITAL = srcConst('eras.favorOccupiedCapital', 5,
  { ...gp('FAVOR_PER_OWNED_ORIGINAL_CAPITAL'), expect: -5,
    note: 'stored here as a MAGNITUDE; the install writes the per-turn penalty as a negative' });

// ---------------------------------------------------------------------------
// EMERGENCIES (GS), which the World Congress runs as SPECIAL SESSIONS.
//
// CIV6 (World Congress, Special Sessions): "A game event, such as an
// aggressive move by a civilization ... triggers the necessity for a Special
// Session" and "An affected civilization ... expends 30 Diplomatic Favor to
// bring the proposal to the World Congress". A Special Session "may take place
// at any moment as long as the previous session - Regular or Special - took
// place 15 turns or prior", and "Once called, the Special Session occurs after
// the next turn."
//
// CIV6 (Emergency): a civ may join only if it knows the reason and votes in
// favor; every member goes to war with the target, and that war "won't accrue
// Grievances because it is considered an effort of the international
// community". "Most Emergencies have a 30-turn time limit, after which the
// target wins"; reaching the goal earlier ends it immediately. Members share
// the reward regardless of who lands the blow.
//
// THE CONDITION DOES NOT EXPIRE: a trigger fired before the Medieval era waits
// for the Congress to open, and is called then if it still holds.
// ---------------------------------------------------------------------------
export const SPECIAL_SESSION_COST = srcConst('eras.specialSessionCost', 30,
  gp('FAVOR_COST_FOR_EMERGENCY'));
export const SPECIAL_SESSION_GAP = srcConst('eras.specialSessionGap', speedTurns(15),
  speedTurnsSrc(gp('WORLD_CONGRESS_MIN_TIME_BETWEEN_SPECIAL_SESSIONS'), 15));
/** Concurrent emergencies both engines carry. Real Civ 6 has no such cap. */
export const EMERGENCY_SLOTS = srcConst('eras.emergencySlots', 2,
  { stylized: 'concurrent emergencies both engines carry — a tensor width; real Civ 6 has no such cap' });

interface EmergencyDef {
  id: 'CITY_STATE' | 'MILITARY' | 'NUCLEAR';
  name: string;
  turns: number;
}

/** PROVENANCE (cpu/data/provenance.ts): the install's readable Gameplay data
 *  carries no `Emergencies` rows (only `Emergencies_XP2` texts survive the
 *  layering), so the duration is the Civilopedia's own at Standard speed,
 *  online through `speedTurns` (the Nuclear emergency ran 40 turns online,
 *  runs/bds4_durations_lab4_t161.jsonl). */
const EMERGENCY_SRC: SrcMap = {
  turns: { derived: 'the Standard duration through GameSpeed_Durations ONLINE_HALF (speedTurns)',
    inputs: [{ pedia: 'the GS Emergency page duration (30 turns; 60 for the nuclear emergency)' }] },
};

const RAW_EMERGENCIES: readonly EmergencyDef[] = [
  // CIV6: "The Target has attacked and occupied a City-state; it must be
  // Liberated!" Success: "Members gain +1 Gold/turn for each Envoy they have;
  // members gain 100 Diplomatic Favor". Failure: "Target's Trade Routes to
  // City-States gain +2 Gold; Target gains 200 Diplomatic Favor".
  { id: 'CITY_STATE', name: 'City-State Emergency', turns: 30 },
  // CIV6: "The Target has conquered the city of another nation; it must be
  // Liberated!" Success: "Member units gain +5 Healing in the Target's
  // territory; members gain 100 Diplomatic Favor". Failure: "Target gains +2 CS
  // when attacking member units with a City Strike; Target gains 200
  // Diplomatic Favor".
  { id: 'MILITARY', name: 'Military Emergency', turns: 30 },
  // CIV6: "The Target has used a nuclear device; capture their Capital in 60
  // turns!" Success: "Target units have -3 CS when fighting Member units;
  // Members gain 100 Diplomatic Favor". Failure: "Member cities exert 1 less
  // Loyalty pressure; Target gains 200 Diplomatic Favor". The contested city
  // is the target's CAPITAL, and the members win by taking it.
  { id: 'NUCLEAR', name: 'Nuclear Emergency', turns: 60 },
];
export const EMERGENCIES: readonly EmergencyDef[] =
  RAW_EMERGENCIES.map((e) => ({ ...e, turns: speedTurns(e.turns), src: EMERGENCY_SRC }));
export const EMERGENCY_CITY_STATE = 0;
export const EMERGENCY_MILITARY = 1;
export const EMERGENCY_NUCLEAR = 2;
export const EMERGENCY_MEMBER_FAVOR = srcConst('eras.emergencyMemberFavor', 100,
  { pedia: 'the GS Emergency page\'s own reward table — "members gain 100 Diplomatic Favor" on success' });
export const EMERGENCY_TARGET_FAVOR = srcConst('eras.emergencyTargetFavor', 200,
  { pedia: 'the GS Emergency page\'s own reward table — "Target gains 200 Diplomatic Favor" on failure' });
/** CIV6 ("Specifics"): "Members gain +2 CS against targets' units; +1 MP in
 *  target's territory; target gains +20 Loyalty in the target city." The CS
 *  and MP ride the Military and Nuclear emergencies only (`EmergencyBuffs`);
 *  the loyalty rides every kind. */
export const EMERGENCY_MEMBER_CS = srcConst('eras.emergencyMemberCs', 2,
  { pedia: 'the GS Emergency page\'s own reward table, "Specifics": "Members gain +2 CS against targets\' units"' });
export const EMERGENCY_MEMBER_MP = srcConst('eras.emergencyMemberMp', 1,
  { pedia: 'the GS Emergency page\'s own reward table, "Specifics": "+1 MP in target\'s territory"' });
export const EMERGENCY_TARGET_LOYALTY = srcConst('eras.emergencyTargetLoyalty', 20,
  { pedia: 'the GS Emergency page\'s own reward table, "Specifics": "target gains +20 Loyalty in the target city"' });
/** the permanent rewards, one per row per outcome */
export const EMERGENCY_MEMBER_HEAL = srcConst('eras.emergencyMemberHeal', 5,
  { pedia: 'the GS Emergency page\'s own reward table (Military, success): "Member units gain +5 Healing in the Target\'s territory"' });
export const EMERGENCY_TARGET_STRIKE_CS = srcConst('eras.emergencyTargetStrikeCs', 2,
  { pedia: 'the GS Emergency page\'s own reward table (Military, failure): "Target gains +2 CS when attacking member units with a City Strike"' });
export const EMERGENCY_ENVOY_GOLD = srcConst('eras.emergencyEnvoyGold', 1,
  { pedia: 'the GS Emergency page\'s own reward table (City-State, success): "Members gain +1 Gold/turn for each Envoy they have"' });
export const EMERGENCY_CS_ROUTE_GOLD = srcConst('eras.emergencyCsRouteGold', 2,
  { pedia: 'the GS Emergency page\'s own reward table (City-State, failure): "Target\'s Trade Routes to City-States gain +2 Gold"' });
/** CIV6 (Nuclear Emergency, success): "Target units have -3 CS when fighting
 *  Member units" — permanent, unit against unit, whichever side attacks
 *  (NUCLEAR_EMERGENCY_MEMBER_COMBAT_STRENGTH_ATTACK_REWARD adjusts the
 *  defending target, _DEFEND_REWARD the attacking one, both by -3). */
export const EMERGENCY_NUKE_TARGET_CS = srcConst('nuclear.emergencyNukeCS', 3,
  { ...modArg('NUCLEAR_EMERGENCY_MEMBER_COMBAT_STRENGTH_ATTACK_REWARD'), scale: -1,
    note: 'stored here as a MAGNITUDE; the install writes the target\'s penalty as a negative' });
/** CIV6 (Nuclear Emergency, failure): "Member cities exert one less Loyalty
 *  pressure" (NUCLEAR_EMERGENCY_TARGET_CULTURAL_IDENTITY_REWARD,
 *  EFFECT_ADJUST_CITY_IDENTITY_PRESSURE over the members' cities). */
export const EMERGENCY_NUKE_LOYALTY_CUT = srcConst('nuclear.emergencyNukeLoyaltyCut', 1,
  { ...modArg('NUCLEAR_EMERGENCY_TARGET_CULTURAL_IDENTITY_REWARD'), scale: -1,
    note: 'stored here as a MAGNITUDE; the install writes the cut as a negative' });

/**
 * The CULTURE VICTORY constants, verified against the Gathering
 * Storm rules (civilization.fandom.com "Tourism (Civ6)"):
 *   visiting tourists = lifetime tourism / (nCivs * 200)
 *   domestic tourists = lifetime culture / 100
 * and a civ wins once its VISITING tourists exceed EVERY other civ's DOMESTIC
 * tourists. The 200 is the Rise-and-Fall-onward value (it was 150 in vanilla),
 * so it is the right one for the GS ruleset this repo models.
 */
export const TOURISM_PER_VISITOR_PER_CIV = srcConst('seats.tourismPerVisitorPerCiv', 200,
  gp('TOURISM_TOURISM_TO_MOVE_CITIZEN'));
/** one `Governments` row's `OtherGovernmentIntolerance`; the install writes the
 *  tier-3 penalty as -20 and this table holds its MAGNITUDE. */
const govTol = (id: string, expect: number) => ({
  ...xml('Governments', `GovernmentType=GOVERNMENT_${id}`, 'OtherGovernmentIntolerance'),
  expect,
});
/** CIV6 (Tourism, "Different government penalty"): the penalty is
 *  "(Your OtherGovernmentIntolerance + Foreign OtherGovernmentIntolerance) x
 *  TOURISM_CONFLICTING_GOVERNMENT_MULTIPLIER", and SAME government pays
 *  nothing. Gathering Storm values: 20 for the three tier-3 governments,
 *  0 for everything earlier, multiplier 1 — so the worst pair is -40%. */
export const GOV_INTOLERANCE: Readonly<Record<string, number>> = {
  CHIEFDOM: srcConst('seats.GOV_INTOLERANCE.CHIEFDOM', 0, govTol('CHIEFDOM', 0)),
  AUTOCRACY: srcConst('seats.GOV_INTOLERANCE.AUTOCRACY', 0, govTol('AUTOCRACY', 0)),
  OLIGARCHY: srcConst('seats.GOV_INTOLERANCE.OLIGARCHY', 0, govTol('OLIGARCHY', 0)),
  CLASSICAL_REPUBLIC: srcConst('seats.GOV_INTOLERANCE.CLASSICAL_REPUBLIC', 0,
    govTol('CLASSICAL_REPUBLIC', 0)),
  MONARCHY: srcConst('seats.GOV_INTOLERANCE.MONARCHY', 0, govTol('MONARCHY', 0)),
  MERCHANT_REPUBLIC: srcConst('seats.GOV_INTOLERANCE.MERCHANT_REPUBLIC', 0,
    govTol('MERCHANT_REPUBLIC', 0)),
  THEOCRACY: srcConst('seats.GOV_INTOLERANCE.THEOCRACY', 0, govTol('THEOCRACY', 0)),
  DEMOCRACY: srcConst('seats.GOV_INTOLERANCE.DEMOCRACY', 20, govTol('DEMOCRACY', -20)),
  COMMUNISM: srcConst('seats.GOV_INTOLERANCE.COMMUNISM', 20, govTol('COMMUNISM', -20)),
  FASCISM: srcConst('seats.GOV_INTOLERANCE.FASCISM', 20, govTol('FASCISM', -20)),
  DIGITAL_DEMOCRACY: srcConst('seats.GOV_INTOLERANCE.DIGITAL_DEMOCRACY', 20, govTol('DIGITAL_DEMOCRACY', -20)),
};
export const TOURISM_GOV_MULT = srcConst('seats.tourismGovMult', 1,
  gp('TOURISM_CONFLICTING_GOVERNMENT_MULTIPLIER'));
/** CIV6 (Tourism, "International Modifiers"), each SUMMED, per foreign civ. */
export const TOURISM_OPEN_BORDERS_PCT = srcConst('seats.tourismOpenBordersPct', 25,
  gp('TOURISM_OPEN_BORDERS_BONUS'));
export const TOURISM_ROUTE_PCT = srcConst('seats.tourismRoutePct', 25,
  gp('TOURISM_TRADE_ROUTE_BONUS'));
/** the two RELIGIOUS-only halvings, summed with the rest. */
export const TOURISM_RELIGIOUS_PENALTY_PCT = srcConst('seats.tourismReligiousPenaltyPct', 50,
  gp('TOURISM_DIFFERENT_RELIGION_REDUCTION'));
export const CULTURE_PER_DOMESTIC_TOURIST = srcConst('seats.culturePerDomesticTourist', 100,
  gp('TOURISM_CULTURE_PER_CITIZEN'));
/** The Gold a route pays its origin when the origin's owner is culturally
 *  dominant over the destination's (Trade_Manager 0x54c6c0). */
export const TRADE_ROUTE_GOLD_CULTURAL_DOMINANCE = srcConst('seats.routeGoldCulturalDominance', 4,
  gp('TRADE_ROUTE_GOLD_CULTURAL_DOMINANCE'));
/** CIV6 (Tourism): "Holy Cities generate +8 Religious Tourism per turn" —
 *  paid to the holy city's CURRENT owner. */
export const HOLY_CITY_TOURISM = srcConst('seats.holyCityTourism', 8,
  gp('TOURISM_FROM_HOLY_CITY'));
/** CIV6 (COMPUTERS_BOOST_ALL_TOURISM, ENVIRONMENTALISM_BOOST_ALL_TOURISM —
 *  MODIFIER_PLAYER_ADJUST_TOURISM): the percent a technology or civic adds to
 *  every city's Tourism (`seatTourismPct`). */
export const TOURISM_PCT_ROWS: readonly { tech?: string; civic?: string; pct: number }[] = [
  { tech: srcConst('seats.tourismPctTech.COMPUTERS', 'COMPUTERS',
      xml('TechnologyModifiers', 'TechnologyType=TECH_COMPUTERS&ModifierId=COMPUTERS_BOOST_ALL_TOURISM', 'TechnologyType', { expect: 'TECH_COMPUTERS' })),
    pct: srcConst('seats.tourismPct.COMPUTERS', 25, xml('ModifierArguments', 'ModifierId=COMPUTERS_BOOST_ALL_TOURISM&Name=Amount', 'Value')) },
  { civic: srcConst('seats.tourismPctCivic.ENVIRONMENTALISM', 'ENVIRONMENTALISM',
      xml('CivicModifiers', 'CivicType=CIVIC_ENVIRONMENTALISM&ModifierId=ENVIRONMENTALISM_BOOST_ALL_TOURISM', 'CivicType', { expect: 'CIVIC_ENVIRONMENTALISM' })),
    pct: srcConst('seats.tourismPct.ENVIRONMENTALISM', 25, xml('ModifierArguments', 'ModifierId=ENVIRONMENTALISM_BOOST_ALL_TOURISM&Name=Amount', 'Value')) },
];
/** CIV6 (Tourism): "-50% (Religious Tourism only) if the foreign
 *  civilization has The Enlightenment" — the read-side halving's key. */
export const ENLIGHTENMENT_CIVIC = srcConst('seats.enlightenmentCidx', 'ENLIGHTENMENT',
  xml('Civics', 'CivicType=CIVIC_THE_ENLIGHTENMENT', 'CivicType', { expect: 'CIVIC_THE_ENLIGHTENMENT' }));

/**
 * The NAMED DEDICATION CATALOG. Real Civ 6 has each civ commit to a NAMED
 * dedication per
 * era, and every dedication has TWO faces — a DARK/NORMAL face that pays ERA
 * SCORE off specific EVENTS (the climb-out) and a GOLDEN face that pays a
 * standing bonus instead.
 *
 * Verified against the Gathering Storm Civilopedia's "Dedications" concept.
 * The rest of the catalog is OPEN: Hic Sunt Dracones, Reform the Coinage and
 * Heartbeat of Steam each need an event this model does not raise, and four
 * more wait on spies / air units / artifacts / Giant Death Robots.
 *
 *   0 MONUMENTALITY       +1 era score per specialty DISTRICT completed
 *   1 FREE_INQUIRY        +1 era score per EUREKA (tech boost) triggered, and
 *                         per building constructed that provides SCIENCE
 *   2 PEN_BRUSH_AND_VOICE +1 era score per INSPIRATION (civic boost) triggered,
 *                         and per building constructed with a GREAT WORK slot
 *   3 EXODUS_OF_THE_EVANGELISTS  +2 era score per city converted to your religion
 *   4 TO_ARMS             +1 era score per non-barbarian CORPS killed (+2 per
 *                         ARMY)
 *   5 HIC_SUNT_DRACONES   +3 era score per natural wonder discovered, +1 per
 *                         non-barbarian NAVAL unit killed in combat (the
 *                         new-continent clause cannot occur: one continent)
 *   6 REFORM_THE_COINAGE  +1 era score per trade route successfully completed
 *   7 HEARTBEAT_OF_STEAM  +2 era score per Industrial-or-later building built
 *
 * The GOLDEN face of each pays its sourced standing bonuses (movement,
 * boost overflow, culture per district, prophet points, charges, the
 * Monumentality faith purchases + 30% discount) — see `eras.goldenDedication`'s
 * callers. There is NO flat per-turn payout on either face in real Civ 6.
 *
 *   8 WISH_YOU_WERE_HERE   +1 era score per ARTIFACT extracted
 *
 *   9 SKY_AND_STARS      +1 era score per AERODROME BUILDING constructed, and
 *                        +1 each time a Great Person is earned
 *  10 BODYGUARD_OF_LIES   +1 era score per successful offensive spy operation
 *  11 AUTOMATON_WARFARE   +1 era score per non-barbarian unit killed with a
 *                        Giant Death Robot
 *
 * Residual, recorded: To Arms!'s special Casus Belli needs a denouncement
 * system.
 */
export const DEDICATIONS = ['MONUMENTALITY', 'FREE_INQUIRY', 'PEN_BRUSH_AND_VOICE', 'EXODUS_OF_THE_EVANGELISTS', 'TO_ARMS', 'HIC_SUNT_DRACONES', 'REFORM_THE_COINAGE', 'HEARTBEAT_OF_STEAM', 'WISH_YOU_WERE_HERE', 'SKY_AND_STARS', 'BODYGUARD_OF_LIES', 'AUTOMATON_WARFARE'] as const;
/** The install's CommemorationType for each `DEDICATIONS` entry, in its
 *  order: the type whose CommemorationModifiers rows carry the dedication's
 *  bonus (Expansion1_Moments.xml: COMMEMORATION_INFRASTRUCTURE_GA_PURCHASE_CIVILIAN
 *  is Monumentality's, COMMEMORATION_SCIENTIFIC_GA_BOOSTS Free Inquiry's, ...;
 *  Expansion2_Moments.xml: COMMEMORATION_AUTOMATON). */
export const DEDICATION_COMMEMORATIONS: readonly string[] = ['COMMEMORATION_INFRASTRUCTURE', 'COMMEMORATION_SCIENTIFIC',
  'COMMEMORATION_CULTURAL', 'COMMEMORATION_RELIGIOUS', 'COMMEMORATION_MILITARY', 'COMMEMORATION_EXPLORATION',
  'COMMEMORATION_ECONOMIC', 'COMMEMORATION_INDUSTRIAL', 'COMMEMORATION_TOURISM', 'COMMEMORATION_AERONAUTICAL',
  'COMMEMORATION_ESPIONAGE', 'COMMEMORATION_AUTOMATON'];
export const DED_MONUMENTALITY = 0;
export const DED_FREE_INQUIRY = 1;
export const DED_PEN_BRUSH_AND_VOICE = 2;
export const DED_EXODUS = 3;
export const DED_TO_ARMS = 4;
export const DED_DRACONES = 5;
export const DED_COINAGE = 6;
export const DED_STEAM = 7;
export const DED_WISH = 8;
export const DED_SKY = 9;
export const DED_BODYGUARD = 10;
export const DED_AUTOMATON = 11;
export const DED_EVENT_SCORE = srcConst('eras.dedEventScore',
  [1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1] as const, {
    pedia: 'the Gathering Storm Civilopedia "Dedications" concept — the per-event Era Score of each dedication\'s DARK/NORMAL face, in catalog order; no install table publishes them',
  });
/**
 * WHICH DEDICATIONS A WORLD ERA OFFERS, indexed by `ERAS`. Real Civ 6 draws
 * each era's choice from a window — "the particular set of Dedications
 * available changes according to the era the world enters into", and there are
 * "always four different Dedications to choose from". Ancient offers none: a
 * civ has earned no era score yet when the game opens.
 *
 * Every window below is exactly the column the source's table ticks for that
 * era. Information ticks five rather than four; the table is the source.
 */
export const DEDICATION_ERAS: readonly (readonly number[])[] = [
  [],                                                                  // Ancient
  [DED_MONUMENTALITY, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS], // Classical
  [DED_MONUMENTALITY, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS], // Medieval
  [DED_MONUMENTALITY, DED_EXODUS, DED_DRACONES, DED_COINAGE],          // Renaissance
  [DED_DRACONES, DED_COINAGE, DED_STEAM, DED_TO_ARMS],                 // Industrial
  [DED_DRACONES, DED_COINAGE, DED_STEAM, DED_TO_ARMS],                 // Modern
  [DED_TO_ARMS, DED_WISH, DED_SKY, DED_BODYGUARD],                     // Atomic
  [DED_TO_ARMS, DED_WISH, DED_SKY, DED_BODYGUARD, DED_AUTOMATON],      // Information
  [DED_WISH, DED_SKY, DED_BODYGUARD, DED_AUTOMATON],                   // Future
];
/** CIV6 (Wish You Were Here, Golden face): "+100% Tourism to all National
 *  Parks." */
export const WISH_PARK_TOURISM_MULT = srcConst('eras.wishParkTourism', 2,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Wish You Were Here, Golden face): "+100% Tourism to all National Parks"' });
/**
 * CIV6 (Wish You Were Here, Golden face): "Cities with Governors receive 50%
 * Tourism from World Wonders" — an ADDITIONAL half, and the source is explicit
 * that "it is completely irrelevant which Governor is in such a city".
 * Expressed as a fraction so both engines fold the same integer.
 */
export const WISH_WONDER_TOURISM_NUM = srcConst('eras.wishWonderTourNum', 3,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Wish You Were Here, Golden face): "Cities with Governors receive 50% Tourism from World Wonders" — the numerator of 3/2' });
export const WISH_WONDER_TOURISM_DEN = srcConst('eras.wishWonderTourDen', 2,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Wish You Were Here, Golden face): the denominator of the 3/2 wonder-tourism fraction' });
/** CIV6 (To Arms!, Golden face): "+15% Production towards military units." */
export const TO_ARMS_MIL_PROD_MULT = srcConst('eras.toArmsMilProd', 1.15,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (To Arms!, Golden face): "+15% Production towards military units"' });
/** CIV6 (Hic Sunt Dracones, dark face): "+3 Era Score each time you discover
 *  a new Continent or natural wonder" — per-event score on top of the
 *  catalog's per-kill 1. */
export const DRACONES_DISCOVERY_SCORE = srcConst('eras.draconesDiscoveryScore', 3,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Hic Sunt Dracones, dark face): "+3 Era Score each time you discover a new Continent or natural wonder"' });
/** CIV6 (Reform the Coinage, Golden face): "International Trade Routes
 *  provide +3 Gold per specialty district in the foreign city." */
export const COINAGE_INTL_GOLD_PER_SPEC = srcConst('eras.coinageIntlGoldPerSpec', 3,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Reform the Coinage, Golden face): "International Trade Routes provide +3 Gold per specialty district in the foreign city"' });
/** CIV6 (Heartbeat of Steam, Golden face): "+10% Production toward Industrial
 *  era and later wonders." */
export const STEAM_WONDER_PROD_MULT = srcConst('eras.steamWonderProd', 1.1,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Heartbeat of Steam, Golden face): "+10% Production toward Industrial era and later wonders"' });
/**
 * CIV6 (Sky and Stars, Golden face): "Unlocks the Eurekas for Advanced Flight,
 * Nuclear Fission, and Rocketry if in the Atomic Era. If in the Information
 * Era the Eurekas for Satellites, Robotics, Nuclear Fusion, and Nanotechnology
 * are unlocked." Keyed by the WORLD ERA the face is committed in; an era the
 * table does not name unlocks nothing.
 */
export const SKY_EUREKAS: Readonly<Record<number, readonly string[]>> = {
  6: ['ADVANCED_FLIGHT', 'NUCLEAR_FISSION', 'ROCKETRY'],
  7: ['SATELLITES', 'ROBOTICS', 'NUCLEAR_FUSION', 'NANOTECHNOLOGY'],
};
/** CIV6 (Sky and Stars, Golden face, GS): "Aluminum mines accumulate +2 more
 *  resources per turn." */
export const SKY_ALUMINUM_PER_TURN = srcConst('eras.skyAluminumPerTurn', 2,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Sky and Stars, Golden face, GS): "Aluminum mines accumulate +2 more resources per turn"' });
/** CIV6 (Sky and Stars, Golden face): "+100% XP earned for all Air Units" —
 *  percentage POINTS, joining the unit's own building modifier. */
export const SKY_AIR_XP_PCT = srcConst('eras.skyAirXpPct', 100,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Sky and Stars, Golden face): "+100% XP earned for all Air Units"' });
/** CIV6 (Automaton Warfare, Golden face): "Receive 3 Uranium per turn." */
export const AUTOMATON_URANIUM_PER_TURN = srcConst('eras.automatonUraniumPerTurn', 3,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Automaton Warfare, Golden face): "Receive 3 Uranium per turn"' });
/** CIV6 (Automaton Warfare, Golden face): "Uranium mines accumulate +1 more
 *  resource per turn." */
export const AUTOMATON_URANIUM_PER_MINE = srcConst('eras.automatonUraniumPerMine', 1,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept (Automaton Warfare, Golden face): "Uranium mines accumulate +1 more resource per turn"' });

export const HEROIC_DEDICATIONS = srcConst('eras.heroicDedications', 3,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept: a HEROIC age (Dark -> Golden) commits three dedications where every other transition commits one' });
/** MONUMENTALITY / EXODUS OF THE EVANGELISTS grant +2 Movement to
 *  Builders and to Missionaries/Apostles/Inquisitors respectively, for the
 *  duration of the GOLDEN age that committed them (Civilopedia, Gathering
 *  Storm). Exported to the GPU as `eras.goldenMoveBonus`. */
export const GOLDEN_MOVE_BONUS = srcConst('eras.goldenMoveBonus', 2,
  { pedia: 'the Gathering Storm Civilopedia \'Dedications\' concept: Monumentality and Exodus of the Evangelists each grant +2 Movement for the duration of the Golden age that committed them' });

export const GOVERNOR_LOYALTY = srcConst('eras.governorLoyalty', 8,
  { stylized: 'a GOVERNOR constant — the file header names the governor constants as deliberate model tuning, not Civ 6 values' });

/**
 * EVERY DIPLOMATIC AGREEMENT RUNS THE SAME CLOCK.
 * CIV6 (Diplomacy, Diplomatic Agreements): "There are a number of Agreements
 * that leaders may enter into. All of them have limited duration of 30 turns,
 * after which they have to be renewed." The Declaration of Friendship
 * ("for 30 turns"), the Alliance ("Alliances expire after 30 turns on
 * Standard speed") and the Denunciation ("A Denunciation lasts for 30 turns,
 * after which its effects expire") all publish the same number — 20 online
 * (`speedTurns`): a denouncement, a friendship and an alliance each ran 20
 * (`GetDenounceTimeLimit`, runs/bds4_durations_lab4_t161.jsonl).
 */
export const AGREEMENT_TURNS = srcConst('seats.agreementTurns', speedTurns(30),
  speedTurnsSrc(gp('DIPLOMACY_ALLIANCE_TIME_LIMIT'), 30));

// ---------------------------------------------------------------------------
// SCORED COMPETITIONS (GS), which a Regular Session enacts.
//
// CIV6 (World Congress): they are "chances for civilizations to win esteem
// through events and projects that benefit the world", and "If enacted,
// players who vote in favor of the Scored Competition will compete to
// contribute to the cause. The players that contribute the most will receive
// lucrative rewards."
//
// CIV6 (Competition): each runs for exactly 30 turns, "after which it ends and
// winners are chosen". "The civilization with the highest score wins the Gold
// Tier rewards. Additionally, all civs whose scores fall within the top 25%
// (including the Gold Tier winner) win the Silver Tier rewards, and all civs
// whose scores fall within the next highest quarter (i.e. the top 26-50%) win
// the Bronze Tier rewards."
// ---------------------------------------------------------------------------
export const COMPETITION_TURNS = srcConst('eras.competitionTurns', AGREEMENT_TURNS,
  { derived: 'the same clock AGREEMENT_TURNS holds, 30 turns at Standard speed through GameSpeed_Durations ONLINE_HALF (speedTurns) — CIV6 (Competition): each runs for exactly 30 turns', inputs: [gp('DIPLOMACY_ALLIANCE_TIME_LIMIT')] });
/** The score fractions the two lower podiums cut at, as published. */
export const COMPETITION_SILVER_PCT = srcConst('eras.competitionSilverPct', 25,
  { pedia: 'CIV6 (Competition): "all civs whose scores fall within the top 25%% ... win the Silver Tier rewards" — no install row' });
export const COMPETITION_BRONZE_PCT = srcConst('eras.competitionBronzePct', 50,
  { pedia: 'CIV6 (Competition): "all civs whose scores fall within the next highest quarter (i.e. the top 26-50%%)" win Bronze — no install row' });

/**
 * WHAT A COMPETITION COUNTS. CIV6 (Expansion2_Emergencies.xml,
 * `<EmergencyScoreSources>`): one row per (competition, quantity), each with
 * its own `ScoreAmount`, and several competitions score on more than one at
 * once — which is why this is a LIST and not a single value.
 *
 * The install's own vocabulary, in its own words:
 *   co2       `FromCO2Footprint`  — "Having CO2 emissions much lower than the
 *                                   biggest CO2 polluter", per turn
 *   gpp       `FromGreatPerson`   — the named class's Great Person POINTS
 *                                   earned this turn
 *   project   `FromProject`       — once, "Completing the X project"
 *   building  `FromBuilding`      — per turn, "Maintaining Stadiums"
 *   district  `FromDistrict`      — per turn, "Maintaining Campus Districts"
 *
 * `FromGold`, `FromFavor`, `FromAtWar` and `FromBadCO2Footprint` are the
 * install's other four; they belong to the Aid Request, which needs a
 * gold-gift verb this engine does not have yet.
 */
type ScoreSource = 'co2' | 'gpp' | 'project' | 'building' | 'district' | 'gold' | 'atWar' | 'co2Top';
export interface ScoreRow {
  source: ScoreSource;
  amount: number;
  /** the row the source NAMES — a project id, a building id, a district id or
   *  a Great Person class. `co2` names nothing. */
  of?: string;
}

interface CompetitionDef {
  id: string;
  name: string;
  /** WHAT the competition counts, one install `<EmergencyScoreSources>` row
   *  apiece. Read in order; a competition scoring nothing this turn adds
   *  nothing. */
  scored: readonly ScoreRow[];
  /** Diplomatic Victory Points to the single highest score. */
  goldPoints: number;
  /** Diplomatic Favor to the top quarter, the gold winner included. */
  silverFavor: number;
  /** ...and to the quarter below it. */
  bronzeFavor: number;
  /** CIV6 (WORLD_FAIR_FIRST_PLACE_GREAT_PERSON_POINTS): Great Person points
   *  to the single highest score, on top of its victory point. */
  goldGpp?: number;
  /** CIV6 (WORLD_FAIR_{TOP,BOTTOM}_TIER_CULTURE,
   *  MODIFIER_EMERGENCY_PLAYERS_GRANT_RANDOM_CIVIC_BOOST_BY_ERA): random
   *  civic boosts to each tier, drawn over `boostEras`. */
  silverBoosts?: number;
  bronzeBoosts?: number;
  /** the inclusive ERA window the boosts are drawn from. */
  boostEras?: readonly [string, string];
  /** CIV6 (EmergencyRewards, the World Games' and Space Station's extra
   *  rows): PERMANENT per-seat channels (`GP_PERM` keys) the podium adds —
   *  the single winner's, the top quarter's (the winner included) and the
   *  next quarter's. */
  goldPerm?: Partial<Record<GpPermKey, number>>;
  silverPerm?: Partial<Record<GpPermKey, number>>;
  bronzePerm?: Partial<Record<GpPermKey, number>>;
  /** CIV6 (EmergencyAlliances.Trigger): a competition the CONGRESS never
   *  votes in — a game event starts it, against a TARGET seat. Kept LAST
   *  in the list: the ballot's target space is the rows before it. */
  triggered?: boolean;
}
/** the eight classes the World's Fair scores — every Great Person class but
 *  the Prophet (`WORLDS_FAIR_SCORE_GPP_*`, ScoreAmount 1 apiece). */
const FAIR_GPP: readonly ScoreRow[] = ([
  'GENERAL', 'ADMIRAL', 'ENGINEER', 'MERCHANT', 'SCIENTIST', 'WRITER', 'ARTIST', 'MUSICIAN',
] as const).map((of) => ({ source: 'gpp' as const, amount: 1, of }));

/**
 * APPEND-ONLY: the index is the wire, and it is the resolution's TARGET.
 * A row belongs here only when its SCORED QUANTITY and all three tiers are
 * published — the ones that are not are open AUDIT items.
 */
export const COMPETITIONS: readonly CompetitionDef[] = [
  // CIV6 (Climate Accords): scored "1 point per turn for each CO2 emission
  // less than the highest polluter", plus 100 apiece for the three
  // decommission projects (CLIMATE_ACCORDS_SCORE_DECOMMISSION_*). Gold "2
  // Diplomatic Victory points", Silver "100 Diplomatic Favor", Bronze "50".
  {
    id: 'CLIMATE_ACCORDS', name: 'Climate Accords',
    scored: [
      { source: 'co2', amount: 1 },
      { source: 'project', amount: 100, of: 'DECOMMISSION_COAL_POWER_PLANT' },
      { source: 'project', amount: 100, of: 'DECOMMISSION_OIL_POWER_PLANT' },
      { source: 'project', amount: 100, of: 'DECOMMISSION_NUCLEAR_POWER_PLANT' },
    ],
    goldPoints: 2, silverFavor: 100, bronzeFavor: 50,
  },
  // CIV6 (Expansion2_Emergencies.xml, EMERGENCY_WORLDS_FAIR): Duration 29,
  // LockoutTime 60; scored 1 point per Great Person POINT of every class
  // earned during the window. FIRST PLACE +1 Diplomatic Victory point and
  // +100 Great Person points; TOP TIER +50 Favor and 2 random civic boosts of
  // the Industrial..Information eras; BOTTOM TIER 1 such boost.
  {
    id: 'WORLDS_FAIR', name: "World's Fair", scored: FAIR_GPP,
    goldPoints: 1, silverFavor: 50, bronzeFavor: 0,
    goldGpp: 100, silverBoosts: 2, bronzeBoosts: 1,
    boostEras: ['Industrial', 'Information'],
  },
  // CIV6 (EMERGENCY_WORLD_GAMES): Duration 29; scored 50 for "Completing the
  // Training Athletes project" and 1 per turn for "Maintaining Stadiums" and
  // "Maintaining Aquatic Centers". FIRST PLACE +1 Diplomatic Victory point;
  // TOP TIER +50 Favor.
  {
    id: 'WORLD_GAMES', name: 'World Games',
    scored: [
      { source: 'project', amount: 50, of: 'TRAIN_ATHLETES' },
      { source: 'building', amount: 1, of: 'STADIUM' },
      { source: 'building', amount: 1, of: 'AQUATICS_CENTER' },
    ],
    goldPoints: 1, silverFavor: 50, bronzeFavor: 0,
    // CIV6 (WORLD_GAMES_FIRST_PLACE_CAMPUS_TOURISM 2; _TOP_TIER_{STADIUMS,
    // AQUATIC_CENTERS}_TOURISM 2; _BOTTOM_TIER_ 1): permanent district tourism
    goldPerm: { campusTourism: 2 },
    silverPerm: { stadiumTourism: 2, aquaticsTourism: 2 },
    bronzePerm: { stadiumTourism: 1, aquaticsTourism: 1 },
  },
  // CIV6 (EMERGENCY_SPACE_STATION): Duration 29; scored 30 for "Completing
  // the Training Astronauts project", 5 per turn for "Maintaining Spaceport
  // Districts" and 1 for "Maintaining Campus Districts". FIRST PLACE +1
  // Diplomatic Victory point; TOP TIER +50 Favor.
  {
    id: 'SPACE_STATION', name: 'Space Station',
    scored: [
      { source: 'project', amount: 30, of: 'TRAIN_ASTRONAUTS' },
      { source: 'district', amount: 5, of: 'SPACEPORT' },
      { source: 'district', amount: 1, of: 'CAMPUS' },
    ],
    goldPoints: 1, silverFavor: 50, bronzeFavor: 0,
    // CIV6 (ISS_FIRST_PLACE_SPACESHIP_SPEED +3 light-years per turn once the
    // expedition is launched; ISS_{TOP,BOTTOM}_TIER_SPACE_RACE_PRODUCTION
    // +40% / +20%)
    goldPerm: { exoSpeed: 3 },
    silverPerm: { spaceProdPct: 40 },
    bronzePerm: { spaceProdPct: 20 },
  },
  // CIV6 (EMERGENCY_SEND_AID, EmergencyAlliances): Duration 30, Trigger
  // EMERGENCY_TRIGGER_PLAYER_LOSES_POP_TO_RANDOM_EVENT, no war on the target;
  // scored (EmergencyScoreSources) FromGold 1 per gold the target is given,
  // FromProject PROJECT_SEND_AID 200, FromAtWar -30, FromBadCO2Footprint
  // -400; rewards (EmergencyRewards) AID_REQUEST_FIRST_PLACE_VICTORY_POINT 2
  // Diplomatic Victory points, TOP_TIER 100 Favor, BOTTOM_TIER 50 Favor.
  // TRIGGERED: a major's city losing population to a random event starts it
  // (when no competition runs — both engines carry ONE slot), the victim is
  // its target and every other living civilization its field.
  {
    id: 'AID_REQUEST', name: 'Aid Request',
    scored: [
      { source: 'gold', amount: 1 },
      { source: 'project', amount: 200, of: 'SEND_AID' },
      { source: 'atWar', amount: -30 },
      { source: 'co2Top', amount: -400 },
    ],
    goldPoints: 2, silverFavor: 100, bronzeFavor: 50,
    triggered: true,
  },
];

export const COMPETITION_CLIMATE = 0;
export const COMPETITION_WORLDS_FAIR = 1;
export const COMPETITION_WORLD_GAMES = 2;
export const COMPETITION_SPACE_STATION = 3;
export const COMPETITION_AID_REQUEST = 4;

/** CIV6 (Diplomatic Visibility and Gossip): "There are 5 levels of diplomatic
 *  visibility: None, Limited, Open, Secret, and Top Secret." Each source is
 *  worth one level, and the ceiling is the last of them. */
export const VISIBILITY_LEVELS = ['NONE', 'LIMITED', 'OPEN', 'SECRET', 'TOP_SECRET'] as const;
export const VISIBILITY_MAX = srcConst('eras.visibilityMax', VISIBILITY_LEVELS.length - 1,
  { derived: 'VISIBILITY_LEVELS.length - 1 — CIV6 (Diplomatic Visibility and Gossip) names five levels: None, Limited, Open, Secret, Top Secret' });
/** CIV6 (Delegations and Embassies): DiplomaticActions.Cost prices the
 *  Delegation at 25 Gold and the Resident Embassy at 50, "which is paid to the
 *  other leader", each worth "1 level of Diplomatic Visibility". The Resident
 *  Embassy "replaces" the Delegation once its civic is in, so a seat holds ONE
 *  mission with another and pays whatever its own civics make that mission
 *  cost. */
export const DELEGATION_COST = srcConst('eras.delegationCost', 25,
  xml('DiplomaticActions', 'DiplomaticActionType=DIPLOACTION_DIPLOMATIC_DELEGATION', 'Cost'));
export const EMBASSY_COST = srcConst('eras.embassyCost', 50,
  xml('DiplomaticActions', 'DiplomaticActionType=DIPLOACTION_RESIDENT_EMBASSY', 'Cost'));
export const EMBASSY_CIVIC = srcConst('eras.embassyCivic', 'DIPLOMATIC_SERVICE',
  xml('Civics', 'CivicType=CIVIC_DIPLOMATIC_SERVICE', 'CivicType', { expect: 'CIVIC_DIPLOMATIC_SERVICE' }));

/**
 * THE NEGOTIATED DEAL — what one side may put on the table.
 * CIV6 (Trade, Demand, and Discuss): "You can trade anything from Gold to
 * resources to cities!", and the Diplomacy screen's own list is "Gold (either
 * lump sums or payments per turn), Diplomatic Favor ..., Strategic and Luxury
 * Resources, Great Works, cities ..., and diplomatic agreements".
 *
 * APPEND-ONLY: the index is the wire.
 */
export const DEAL_ITEM_KINDS = [
  'GOLD', 'GOLD_PER_TURN', 'FAVOR', 'RESOURCE', 'GREAT_WORK', 'CITY', 'SPY', 'OPEN_BORDERS',
  /** CIV6 (DIPLOACTION_JOINT_WAR): an agreement — `a` is the TARGET row;
   *  accepting it declares the war for BOTH parties (`jointWarPayable`) */
  'JOINT_WAR',
  /** one copy of a luxury resource for the deal's term — `a` is the
   *  `LUXURY_IDS` index; the receiver holds it, the giver holds one fewer
   *  (`luxuryHoldings`) */
  'LUXURY',
] as const;
export const DEAL_GOLD = DEAL_ITEM_KINDS.indexOf('GOLD');
export const DEAL_GOLD_PER_TURN = DEAL_ITEM_KINDS.indexOf('GOLD_PER_TURN');
export const DEAL_FAVOR = DEAL_ITEM_KINDS.indexOf('FAVOR');
export const DEAL_RESOURCE = DEAL_ITEM_KINDS.indexOf('RESOURCE');
export const DEAL_GREAT_WORK = DEAL_ITEM_KINDS.indexOf('GREAT_WORK');
export const DEAL_CITY = DEAL_ITEM_KINDS.indexOf('CITY');
export const DEAL_SPY = DEAL_ITEM_KINDS.indexOf('SPY');
export const DEAL_OPEN_BORDERS = DEAL_ITEM_KINDS.indexOf('OPEN_BORDERS');
export const DEAL_JOINT_WAR = DEAL_ITEM_KINDS.indexOf('JOINT_WAR');
export const DEAL_LUXURY = DEAL_ITEM_KINDS.indexOf('LUXURY');

/**
 * CIV6: "Sums of Gold, Great Works, Relics, Artifacts, and captured Spies are
 * all permanent trades—once you give those items away, you have to trade again
 * to get them back. Resources and gold per turn, however, are temporary, and
 * once the deal has run its course you will get them back." A city changes
 * hands for good, and an agreement runs on the same 30-turn clock every other
 * agreement here does.
 */
export const DEAL_PERMANENT: readonly boolean[] = DEAL_ITEM_KINDS.map(
  (k) => k !== 'GOLD_PER_TURN' && k !== 'RESOURCE' && k !== 'OPEN_BORDERS' && k !== 'LUXURY');

/** CIV6: "All Deals, Demands, and Promises last for 30 turns, at which point
 *  they need to be renewed" — the clock every other agreement runs on. */
export const DEAL_TURNS = srcConst('eras.dealTurns', AGREEMENT_TURNS,
  { derived: 'the same clock AGREEMENT_TURNS holds, 30 turns at Standard speed through GameSpeed_Durations ONLINE_HALF (speedTurns) — CIV6: "All Deals, Demands, and Promises last for 30 turns"', inputs: [gp('DIPLOMACY_ALLIANCE_TIME_LIMIT')] });

/** How many items ONE side of a deal may carry. A representation bound: real
 *  Civ 6 bounds neither the table nor the number of deals a pair may run, and
 *  this engine carries one running deal per ORDERED pair. */
export const DEAL_ITEMS = srcConst('eras.dealItems', 4,
  { stylized: 'how many items ONE side of a deal may carry — a representation bound; real Civ 6 bounds neither the table nor the number of deals a pair may run' });

/** An offer sits on the table for the one turn after it is made: the record is
 *  a turn's decision, so an offer nobody answers lapses rather than outliving
 *  the state it was priced against. */
export const DEAL_OFFER_TURNS = srcConst('eras.dealOfferTurns', 1,
  { stylized: 'an offer lives one turn — the record is a turn\'s decision, so an offer nobody answers lapses rather than outliving the state it was priced against' });

/** the technology whose research "will increase your visibility with ALL
 *  civilizations by one level". */
export const VISIBILITY_TECH = srcConst('eras.visibilityTech', 'PRINTING',
  xml('Technologies', 'TechnologyType=TECH_PRINTING', 'TechnologyType', { expect: 'TECH_PRINTING' }));
/** CIV6 ("Intel on enemy movements"): the Combat Strength the side with the
 *  higher visibility carries, per level of the difference — so a Top Secret
 *  reading of a civ that has None on you is worth four of these. */
export const VISIBILITY_CS_PER_LEVEL = srcConst('eras.visibilityCsPerLevel', 3,
  { pedia: 'CIV6 ("Intel on enemy movements"): the Combat Strength the side with the higher visibility carries, per level of the difference — not an install row' });

/**
 * The civic that opens each agreement.
 * CIV6: "After developing the Early Empire civic, civilizations no longer
 * allow foreign units to enter their territory freely. At this point the Open
 * Borders agreement becomes available." / "Alliances become possible after
 * developing the Civil Service civic."
 * The Declaration of Friendship publishes no civic — it is gated on the
 * relationship reaching Friendly, and leader ATTITUDE (agendas and their
 * modifiers) is not modeled, so friendship asks only that the pair be at
 * peace with no live denouncement between them.
 */
export const OPEN_BORDERS_CIVIC = srcConst('seats.openBordersCivic', 'EARLY_EMPIRE',
  xml('Civics', 'CivicType=CIVIC_EARLY_EMPIRE', 'CivicType', { expect: 'CIVIC_EARLY_EMPIRE' }));
/** CIV6 (Expansion1_DiplomaticActions.xml, DIPLOACTION_JOINT_WAR):
 *  `InitiatorPrereqCivic` CIVIC_FOREIGN_TRADE — the civic the seat PROPOSING
 *  a joint war must hold; the partner needs none. */
export const JOINT_WAR_CIVIC = srcConst('seats.jointWarCivic', 'FOREIGN_TRADE',
  xml('DiplomaticActions', 'DiplomaticActionType=DIPLOACTION_JOINT_WAR', 'InitiatorPrereqCivic',
    { expect: 'CIVIC_FOREIGN_TRADE' }));
export const ALLIANCE_CIVIC = srcConst('seats.allianceCivic', 'CIVIL_SERVICE',
  xml('Civics', 'CivicType=CIVIC_CIVIL_SERVICE', 'CivicType', { expect: 'CIVIC_CIVIL_SERVICE' }));

/**
 * GS pays a standing Alliance in favor.
 * CIV6 (Alliance): "In Gathering Storm, each Alliance gives you +1 Diplomatic
 * Favor per turn per level." — `allianceLevels` sums the live levels.
 */
export const FAVOR_PER_ALLIANCE = srcConst('seats.favorPerAlliance', 1,
  gp('WORLD_CONGRESS_ALLIANCE_FAVOR_PER_TURN'));

/** CIV6 (Alliance): the five types; a pair holds ONE alliance at a time and
 *  picks its type when it forms. This order is the wire code. */
export const ALLIANCE_TYPES = ['RESEARCH', 'CULTURAL', 'ECONOMIC', 'MILITARY', 'RELIGIOUS'] as const;
export const ALLIANCE_RESEARCH = 0;
export const ALLIANCE_CULTURAL = 1;
export const ALLIANCE_ECONOMIC = 2;
export const ALLIANCE_MILITARY = 3;
export const ALLIANCE_RELIGIOUS = 4;
/** CIV6 (Alliance): points accrue every turn - 1, +0.25 for sending at least
 *  one Trade Route to the ally and +0.25 for receiving one - and the levels
 *  land at "80 to reach Level 2 and 160 more to reach Level 3" on Standard.
 *  Stored in QUARTER-points so both engines bank integers. */
export const ALLIANCE_QP_TURN = srcConst('seats.allianceQpTurn', 4,
  gp('ALLIANCE_POINTS_MULTIPLIER'));
export const ALLIANCE_QP_ROUTE = srcConst('seats.allianceQpRoute', 1,
  gp('ALLIANCE_POINTS_FOR_TRADE'));
/** CIV6 (GlobalParameters, ALLIANCE_POINTS_FOR_DEAL 2, Expansion1 and
 *  Expansion2 alike): a deal closed between two allies pays the pair, on the
 *  same quarter-point store the turn tick banks into —
 *  ALLIANCE_POINTS_MULTIPLIER is the install's own 4, which is why a turn
 *  pays 4 and a trade route 1 (ALLIANCE_POINTS_FOR_TRADE). Cleopatra's clause
 *  adjusts the TRADE parameter, not this one. */
export const ALLIANCE_QP_DEAL = srcConst('seats.allianceQpDeal', 2,
  gp('ALLIANCE_POINTS_FOR_DEAL'));
export const ALLIANCE_L2_QP = srcConst('seats.allianceL2Qp', 320,
  gp('ALLIANCE_LEVEL_TWO_XP'));
export const ALLIANCE_L3_QP = srcConst('seats.allianceL3Qp', 960,
  gp('ALLIANCE_LEVEL_THREE_XP'));
/** one `ALLIANCE_ADD_<yield>_TO_<end>_TRADE_ROUTE` modifier's cell. */
const aRoute = (y: string, end: string, col = 'Amount') =>
  xml('ModifierArguments', `ModifierId=ALLIANCE_ADD_${y}_TO_${end}_TRADE_ROUTE&Name=${col}`, 'Value');
/** the MILITARY column: the install ships no ALLIANCE_ADD_*_TRADE_ROUTE modifier
 *  for ALLIANCE_MILITARY at any level, so a military route pays nothing. */
const aNoRoute = {
  derived: 'zero — AllianceEffects carries no ALLIANCE_ADD_*_TRADE_ROUTE modifier for '
    + 'ALLIANCE_MILITARY at any level',
} as const;
/** CIV6 (Alliance, level 1): Trade Routes between allies pay extra - "+2
 *  Science from Trade Routes to your ally" and +1 from the ally's routes to
 *  you, the same 2/1 in Culture and Faith for their types, 4/2 in Gold for
 *  the Economic type. Indexed by alliance type (research, cultural,
 *  economic, military, religious); Military routes pay nothing. */
export const ALLIANCE_ROUTE_TO = [
  srcConst('seats.allianceRouteTo.0', 2, aRoute('SCIENCE', 'ORIGIN')),
  srcConst('seats.allianceRouteTo.1', 2, aRoute('CULTURE', 'ORIGIN')),
  srcConst('seats.allianceRouteTo.2', 4, aRoute('GOLD', 'ORIGIN')),
  srcConst('seats.allianceRouteTo.3', 0, aNoRoute),
  srcConst('seats.allianceRouteTo.4', 2, aRoute('FAITH', 'ORIGIN')),
] as const;
export const ALLIANCE_ROUTE_FROM = [
  srcConst('seats.allianceRouteFrom.0', 1, aRoute('SCIENCE', 'DESTINATION')),
  srcConst('seats.allianceRouteFrom.1', 1, aRoute('CULTURE', 'DESTINATION')),
  srcConst('seats.allianceRouteFrom.2', 2, aRoute('GOLD', 'DESTINATION')),
  srcConst('seats.allianceRouteFrom.3', 0, aNoRoute),
  srcConst('seats.allianceRouteFrom.4', 1, aRoute('FAITH', 'DESTINATION')),
] as const;
export const ALLIANCE_ROUTE_YKEY = [
  srcConst('seats.allianceRouteYcol.0', 'science',
    { ...aRoute('SCIENCE', 'ORIGIN', 'YieldType'), expect: 'YIELD_SCIENCE' }),
  srcConst('seats.allianceRouteYcol.1', 'culture',
    { ...aRoute('CULTURE', 'ORIGIN', 'YieldType'), expect: 'YIELD_CULTURE' }),
  srcConst('seats.allianceRouteYcol.2', 'gold',
    { ...aRoute('GOLD', 'ORIGIN', 'YieldType'), expect: 'YIELD_GOLD' }),
  srcConst('seats.allianceRouteYcol.3', '', aNoRoute),
  srcConst('seats.allianceRouteYcol.4', 'faith',
    { ...aRoute('FAITH', 'ORIGIN', 'YieldType'), expect: 'YIELD_FAITH' }),
] as const;
/** CIV6 (Military alliance 1): "+5 Combat Strength against units of players
 *  at war with you and your ally." */
export const ALLIANCE_M1_CS = srcConst('seats.allianceM1Cs', 5,
  modArg('ALLIANCE_ADJUST_COMBAT_STRENGTH'));
/** CIV6 (Military alliance 2): "+15% Production toward military units when
 *  you or your ally are at war" — the alliance table's
 *  ALLIANCE_INCREASE_PRODUCTION_WHEN_WAR, Amount 15. */
export const ALLIANCE_M2_MIL_PROD_PCT = srcConst('seats.allianceM2MilProdPct', 15,
  modArg('ALLIANCE_INCREASE_PRODUCTION_WHEN_WAR'));
/** CIV6 (Research alliance 2): "Every 30 turns (on Standard), you unlock a
 *  Eureka for a tech that your ally has researched or boosted, but you have
 *  not" — the alliance table's ALLIANCE_RESEARCH_AGREEMENT, Amount 30,
 *  online through `speedTurns`. */
export const ALLIANCE_R2_BOOST_TURNS = srcConst('seats.allianceR2BoostTurns', speedTurns(30),
  speedTurnsSrc(modArg('ALLIANCE_RESEARCH_AGREEMENT'), 30));
/** CIV6 (Research alliance 3): "+10% of your ally's Science" while
 *  researching a tech the ally completed, or the tech the ally is on. */
export const ALLIANCE_R3_SCI_PCT = srcConst('seats.allianceR3SciPct', 0.1,
  { ...modArg('ALLIANCE_SCIENCE_SHARING_FROM_ALLY'), scale: 0.01, note: 'the install writes 10 percentage points; this engine holds the fraction' });
/** CIV6 (Cultural alliance 2): +1 Great Person point per class-matched
 *  district in origin cities holding a Trade Route to the ally. */
export const ALLIANCE_C2_GPP = srcConst('seats.allianceC2Gpp', 1,
  modArg('ALLIANCE_ADJUST_DISTRICT_GREAT_PEOPLE_POINTS'));
/** CIV6 (Cultural alliance 3): "+10% of your ally's Culture" and "+20% of
 *  your ally's Tourism". */
export const ALLIANCE_C3_CUL_PCT = srcConst('seats.allianceC3CulPct', 0.1,
  { ...modArg('ALLIANCE_CULTURE_SHARING_FROM_ALLY'), scale: 0.01 });
export const ALLIANCE_C3_TOUR_PCT = srcConst('seats.allianceC3TourPct', 0.2,
  { ...modArg('ALLIANCE_TOURISM_SHARING_FROM_ALLY'), scale: 0.01 });
/** CIV6 (Economic alliance 2): an Envoy point per turn "for every City-State
 *  with your Ally as Suzerain". */
export const ALLIANCE_E2_INFLUENCE = srcConst('seats.allianceE2Influence', 1,
  modArg('ALLIANCE_ENVOY_POINTS_FROM_ALLIANCE'));
/** CIV6 (Religious alliance 2): "+10 Religious Combat Strength against
 *  non-ally Religions." */
export const ALLIANCE_REL2_THEO_CS = srcConst('seats.allianceRel2TheoCs', 10,
  modArg('ALLIANCE_ADJUST_RELIGIOUS_COMBAT_STRENGTH'));
/** CIV6 (Religious alliance 3): "+1 Faith for each of your Citizens following
 *  your ally's religion." */
export const ALLIANCE_REL3_FAITH_PER_POP = srcConst('seats.allianceRel3FaithPerPop', 1,
  modArg('ALLIANCE_YIELDS_FROM_FOLLOWING_ALLY_RELIGION'));
/** CIV6 (Religious alliance 3, ALLIANCE_RELIGIOUS_PRESSURE ->
 *  EFFECT_ALLIANCE_PRESSURE_FROM_NO_ALLY_RELIGION, Amount 20): "Bonus Religious
 *  Pressure in cities with no followers of your ally's Religion" — the
 *  holder's religion presses 20% harder into a city where the ally's
 *  religion has no pressure at all. */
export const ALLIANCE_REL3_PRESSURE_PCT = srcConst('seats.allianceRel3PressurePct', 20,
  modArg('ALLIANCE_RELIGIOUS_PRESSURE'));

/**
 * GRIEVANCES (GS). CIV6: "a score which each pair of civilizations keep for
 * each other, reflecting serious transgressions which happened between them",
 * organized "as a coordinate system, with the neutral point, 0, and
 * Civilizations A and B standing on the two sides" — so ONE signed balance per
 * unordered pair, tipped by whoever transgresses and decayed back toward zero
 * while the pair is at peace.
 *
 * Every magnitude below is the Grievances page's own table row.
 */
/** CIV6 (DiplomaticActions.xml): every war kind's own three percent columns
 *  live on its row in `WAR_KINDS` (data/warKinds.ts). */
/** the declaration base the percent columns scale. */
export const GRIEVANCE_WAR_BASE = srcConst('eras.grievanceWarBase', 100,
  { pedia: 'the GS Grievances page\'s own table row — "War declared: 100", the base the DiplomaticActions percent columns scale; the install publishes the percents but not the base' });
/** "War declared on a Friend or Ally": 75, to the friend or ally. */
export const GRIEVANCE_WAR_ON_FRIEND = srcConst('eras.grievanceWarOnFriend', 75,
  { pedia: 'the GS Grievances page\'s own table row — "War declared on a Friend or Ally: 75"' });
/** "War declared on a city-state a civ is the Suzerain over": 100. */
export const GRIEVANCE_WAR_ON_SUZERAIN = srcConst('eras.grievanceWarOnSuzerain', 100,
  gp('GRIEVANCES_SUZERAIN_CITY_STATE_DOW'));
/** "War declared on a city-state friend or ally": 50, "to every civ that has
 *  at least 1 Envoy in that city-state, but is not its Suzerain". */
export const GRIEVANCE_WAR_ON_CS_FRIEND = srcConst('eras.grievanceWarOnCsFriend', 50,
  gp('GRIEVANCES_HAVE_ENVOYS_CITY_STATE_DOW'));
/** CIV6 (DiplomaticActions.xml): the CITY-EVENT base the capture and raze
 *  percent columns scale — WARMONGER_CITY_PERCENT_OF_DOW's half of the
 *  declaration base. */
export const GRIEVANCE_CITY_TAKEN = srcConst('eras.grievanceCityTaken', 50,
  gp('WARMONGER_CITY_PERCENT_OF_DOW'));
/** "Captured the final city of a civilization: 150 (all remaining civs gain
 *  Grievances against you)". */
export const GRIEVANCE_LAST_CITY = srcConst('eras.grievanceLastCity', 150,
  { pedia: 'the GS Grievances page\'s own table row — "Captured the final city of a civilization: 150"' });
/** "City-state conquered: 50 (all civs gain Grievances against you)". */
export const GRIEVANCE_CS_CONQUERED = srcConst('eras.grievanceCsConquered', 50,
  gp('GRIEVANCES_ALL_PLAYERS_CITY_STATE_CONQUEST'));
/** "City-state razed: 100 (all civs gain Grievances against you)". */
export const GRIEVANCE_CS_RAZED = srcConst('eras.grievanceCsRazed', 100,
  { pedia: 'the GS Grievances page\'s own table row — "City-state razed: 100"' });
/** "Denounced: 25". */
export const GRIEVANCE_DENOUNCE = srcConst('eras.grievanceDenounce', 25,
  gp('GRIEVANCES_FOR_DENOUNCEMENT'));
/** "Controlling the civ's original Capital: 3 per turn while not at war". */
export const GRIEVANCE_HELD_CAPITAL_PER_TURN = srcConst('eras.grievanceHeldCapital', 3,
  gp('GRIEVANCES_POSSESS_CAPITAL_PER_TURN'));
/** "allies of B will gain 50% of B's Grievances against A, and declared
 *  friends of B will gain 25%", as hundredths. */
export const GRIEVANCE_ALLY_SHARE = srcConst('eras.grievanceAllyShare', 50,
  gp('SHARE_WAR_GRIEVANCES_ALLY'));
export const GRIEVANCE_FRIEND_SHARE = srcConst('eras.grievanceFriendShare', 25,
  gp('SHARE_WAR_GRIEVANCES_DECLARED_FRIENDS'));

/**
 * DECAY. CIV6: "The base decay rate of Grievances is equal to 10 - x per turn,
 * where x is each era after the Ancient Era", reaching 2/turn by the Future
 * era; the era is the WORLD era, the same one the Congress gates on. At war
 * the pair does not decay at all.
 */
export const GRIEVANCE_DECAY_BASE = srcConst('eras.grievanceDecayBase', 10,
  { pedia: 'the GS Grievances page\'s own table row — "The base decay rate of Grievances is equal to 10 - x per turn, where x is each era after the Ancient Era"' });
export const GRIEVANCE_DECAY_FLOOR = srcConst('eras.grievanceDecayFloor', 2,
  { pedia: 'the GS Grievances page\'s own table row — the same decay sentence reaching 2/turn by the Future era' });
/**
 * CIV6: "The base decay rate is modified if a party is currently occupying a
 * city or cities of the other party ... the rate changes by -1 for the
 * 'victim' party ... but by +1 for the occupying party ... it does not matter
 * how many cities you occupy, the decay rate modifier is always 1. However, if
 * you occupy someone's Capital the rate becomes 3." The wiki's own copy has
 * lost the sign glyph in front of that 3, so the magnitude is read as the
 * modifier's — 3 in place of 1, same sign convention.
 */
export const GRIEVANCE_OCCUPIED_DECAY = srcConst('eras.grievanceOccupiedDecay', 1,
  { pedia: 'the GS Grievances page\'s own table row — "the decay rate modifier is always 1" while a party occupies a city of the other' });
export const GRIEVANCE_OCCUPIED_CAPITAL_DECAY = srcConst('eras.grievanceOccupiedCapitalDecay', 3,
  { pedia: 'the GS Grievances page\'s own table row — "if you occupy someone\'s Capital the rate becomes 3" (the page\'s copy has lost the sign glyph; the magnitude is read as the modifier\'s)' });

/**
 * CIV6 (Diplomatic Favor, "Losing Favor"): "200 Grievance = -1/turn", with
 * "-1 more per 50 beyond", capping at -10. The score read is what every OTHER
 * major holds against this seat.
 */
export const GRIEVANCE_FAVOR_FLOOR = srcConst('eras.grievanceFavorFloor', 200,
  gp('FAVOR_GRIEVANCES_START'));
export const GRIEVANCE_FAVOR_STEP = srcConst('eras.grievanceFavorStep', 50,
  gp('FAVOR_GRIEVANCES_DIVISOR'));
export const GRIEVANCE_FAVOR_MAX = srcConst('eras.grievanceFavorMax', 10,
  { ...gp('FAVOR_GRIEVANCES_MINIMUM'), expect: -10,
    note: 'stored here as a MAGNITUDE; the install writes the floor as a negative' });

/**
 * THE TWO AI HEURISTICS the grievance table feeds. Neither is a published
 * Civ 6 rule and neither has a published number: a seat carrying grievances
 * with ANYONE cannot form an alliance, and once what the world holds against
 * it passes GRIEVANCE_GANG others may declare on it without the usual
 * strength advantage. The threshold is stated in the table's own units — two
 * formal wars' worth — so it moves with the sourced magnitudes rather than
 * standing on a number of its own.
 */
export const GRIEVANCE_GANG = srcConst('eras.grievanceGang', 2 * GRIEVANCE_WAR_BASE,
  { derived: 'two formal wars\' worth — 2 * GRIEVANCE_WAR_BASE. The BAR itself is this engine\'s: no published Civ 6 rule gangs up on a grievance score', inputs: [] });
export function warWearinessPenalty(weariness: number): number {
  return Math.floor(Math.max(0, weariness) / WAR_WEARINESS_PER_AMENITY);
}

/** BANKRUPTCY, on the turn's SHORTFALL. CIV6 (the Gold pedia): "-1 penalty to
 *  your Amenities per every 10 Gold you drop below 0 ... at -10 Gold you will
 *  automatically disband a unit" — the `GOLD_NEGATIVE_BALANCE_*` lines. The
 *  live game never holds a balance below 0 (runs/bankrupt_*.jsonl): the
 *  treasury clamps at 0 every turn, and the lines are read on the turn's
 *  SHORTFALL S, the whole Gold the balance would have dropped below 0 — from
 *  an empty treasury, the turn's maintenance less its whole-gold yield
 *  (`goldShortfall`). Every city of the seat loses 1 + floor(S / 10) amenities
 *  while S > 0, flat however long it lasts (S 5 → 1, 10–17 → 2, 21–26 → 3,
 *  30–35 → 4 over 19 rows), and one unit disbands a turn while S ≥ 10. */
export const GOLD_AMENITY_LOSS_LINE = srcConst('seats.goldAmenityLossLine', 0,
  gp('GOLD_NEGATIVE_BALANCE_AMENITY_LOSS_LINE'));
export const GOLD_AMENITY_LOSS_STEP = srcConst('seats.goldAmenityLossStep', -10,
  gp('GOLD_NEGATIVE_BALANCE_SUBSEQUENT_AMENITY_LOSS'));
export const GOLD_DISBAND_LINE = srcConst('seats.goldDisbandLine', -10,
  gp('GOLD_NEGATIVE_BALANCE_DISBAND_UNIT_LINE'));
/** exactly ONE unit a turn however deep the shortfall: eight turns in a row
 *  at S 35 falling to 11 lost one each, none at S 5–6 — the install's
 *  GOLD_NEGATIVE_BALANCE_SUBSEQUENT_DISBAND_UNIT step never adds a second */
export const GOLD_DISBANDS_PER_TURN = srcConst('seats.goldDisbandsPerTurn', 1,
  { lab: 'runs/bankrupt_m35_20260926T083304Z.jsonl' });

/** THE TURN'S SHORTFALL off the balance its charges left: the whole Gold it
 *  stands below 0, 0 when it does not. Read on the milli-rounded balance, the
 *  digest's own quantum, so a sub-milli float drift never crosses a line on
 *  one engine and not the other. */
export function goldShortfall(balance: number): number {
  const m = Math.round(balance * 1000);
  return m < 0 ? Math.ceil(-m / 1000) : 0;
}

/** the amenities EACH city of a seat loses to the shortfall `s` of its last
 *  turn — from the first Gold "below 0", 1 more per further 10 */
export function bankruptAmenities(s: number): number {
  return -s < GOLD_AMENITY_LOSS_LINE ? 1 + Math.floor((GOLD_AMENITY_LOSS_LINE + s) / -GOLD_AMENITY_LOSS_STEP) : 0;
}

/** the units a seat whose turn fell `s` short disbands this turn — "at -10
 *  Gold", one a turn */
export function bankruptDisbands(s: number): number {
  return -s <= GOLD_DISBAND_LINE ? GOLD_DISBANDS_PER_TURN : 0;
}

export const DOW_PROXIMITY = 9;
