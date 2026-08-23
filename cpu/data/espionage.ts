/**
 * ESPIONAGE. CIV6 (Espionage): "Espionage becomes possible in the Renaissance
 * Era, thanks to civic development. The Diplomatic Service civic allows you to
 * train your first Spy, and subsequent civics (and the Computers tech) will
 * allow you to maintain more than one."
 *
 * A Spy is a CIVILIAN that does not walk: "Spies aren't moved like regular
 * units; they jump from city to city using air, sea, road, or foot travel,
 * each with their own travel time. You may send a Spy to any city you have
 * revealed."
 */
import type { DistrictId } from '../../world/types';

export const SPY_UNIT = 'SPY';

/**
 * CIV6 (Spy): "A player's Spy capacity increases by 1 for each of these."
 * The Government Plaza's Tier-2 Intelligence Agency is the eighth source and
 * carries its own `spyCapacity`; the two LEADER uniques (Wu Zetian's Defensive
 * Tactics, Catherine de Medici's Castles) are civilization uniques.
 */
export const SPY_CAPACITY_CIVICS = ['DIPLOMATIC_SERVICE', 'NATIONALISM', 'IDEOLOGY', 'COLD_WAR'] as const;
export const SPY_CAPACITY_TECHS = ['COMPUTERS'] as const;
/** CIV6 (Espionage): "The maximum number of Spies a civilization can have is 5
 *  in vanilla Civilization VI and 6 from Rise and Fall onward". */
export const SPY_CAPACITY_MAX = 6;

/** CIV6 (Espionage): "In ascending order, the levels are as follows: Recruit,
 *  Agent, Secret Agent, Master Spy" — and "a Spy that reaches the Master Spy
 *  level stops gaining experience." */
export const SPY_LEVELS = ['RECRUIT', 'AGENT', 'SECRET_AGENT', 'MASTER_SPY'] as const;
export const SPY_MAX_LEVEL = SPY_LEVELS.length - 1;
/** the level at which Listening Post reads two levels of visibility rather
 *  than one — "2 if the Spy's level is Secret Agent or higher". */
export const SPY_SECRET_AGENT_LEVEL = 2;

/** the code a spy's mission slot carries while it is doing nothing, and while
 *  it is in transit. A mission INDEX is `SPY_MISSIONS`'s own. */
export const SPY_IDLE = -1;
export const SPY_TRAVELLING = -2;

export interface SpyMissionDef {
  id: string;
  /** the district the mission is run in — CIV6 gives each one a Location. */
  district: DistrictId;
  /** an OFFENSIVE operation: run in a rival's city, earns the spy a level and
   *  pays Bodyguard of Lies. Counter-espionage and the two intelligence
   *  missions are not. */
  offensive: boolean;
  /** CIV6: "100% success rate, and no risk of being discovered." */
  certain?: boolean;
  /** run in the spy's OWN city rather than a rival's. */
  athome?: boolean;
}

/**
 * The mission table, in the order the source's own Mission Details table
 * lists them. THE ORDER IS THE WIRE: column k of the MISSION head is the k-th
 * row here on both engines.
 *
 * Absent, and recorded: Fabricate Scandal (a city-state target) and Zombie
 * Outbreak (a game mode).
 */
export const SPY_MISSIONS: readonly SpyMissionDef[] = [
  { id: 'GAIN_SOURCES', district: 'CITY_CENTER', offensive: false, certain: true },
  { id: 'LISTENING_POST', district: 'CITY_CENTER', offensive: false, certain: true },
  { id: 'SIPHON_FUNDS', district: 'COMMERCIAL_HUB', offensive: true },
  { id: 'GREAT_WORK_HEIST', district: 'THEATER_SQUARE', offensive: true },
  { id: 'SABOTAGE_PRODUCTION', district: 'INDUSTRIAL_ZONE', offensive: true },
  { id: 'STEAL_TECH_BOOST', district: 'CAMPUS', offensive: true },
  { id: 'RECRUIT_PARTISANS', district: 'NEIGHBORHOOD', offensive: true },
  { id: 'DISRUPT_ROCKETRY', district: 'SPACEPORT', offensive: true },
  { id: 'FOMENT_UNREST', district: 'CITY_CENTER', offensive: true },
  { id: 'NEUTRALIZE_GOVERNOR', district: 'CITY_CENTER', offensive: true },
  { id: 'BREACH_DAM', district: 'DAM', offensive: true },
  { id: 'COUNTERSPY', district: 'CITY_CENTER', offensive: false, athome: true },
];
const mi = (id: string): number => SPY_MISSIONS.findIndex((m) => m.id === id);
export const SPY_M_GAIN_SOURCES = mi('GAIN_SOURCES');
export const SPY_M_LISTENING_POST = mi('LISTENING_POST');
export const SPY_M_SIPHON_FUNDS = mi('SIPHON_FUNDS');
export const SPY_M_GREAT_WORK_HEIST = mi('GREAT_WORK_HEIST');
export const SPY_M_SABOTAGE_PRODUCTION = mi('SABOTAGE_PRODUCTION');
export const SPY_M_STEAL_TECH_BOOST = mi('STEAL_TECH_BOOST');
export const SPY_M_RECRUIT_PARTISANS = mi('RECRUIT_PARTISANS');
export const SPY_M_DISRUPT_ROCKETRY = mi('DISRUPT_ROCKETRY');
export const SPY_M_FOMENT_UNREST = mi('FOMENT_UNREST');
export const SPY_M_NEUTRALIZE_GOVERNOR = mi('NEUTRALIZE_GOVERNOR');
export const SPY_M_BREACH_DAM = mi('BREACH_DAM');
export const SPY_M_COUNTERSPY = mi('COUNTERSPY');

/** how many destinations the TRAVEL head offers, cities in centre-tile order. */
export const SPY_TRAVEL_COLS = 8;

// ---------------------------------------------------------------------------
// THE MODEL. The source publishes every mission's location and result but not
// its clock or its odds: "all missions have a uniform, fixed duration of
// turns" without naming it, and the briefing screen's success/capture chances
// are numbers the wiki does not carry. The four constants below are this
// model's own, chosen to make the published modifiers (-25% duration, level
// bonuses) express something; everything they feed is sourced.
// ---------------------------------------------------------------------------
export const SPY_MISSION_TURNS = 8;
export const SPY_TRAVEL_TURNS_MIN = 1;
export const SPY_TRAVEL_TILES_PER_TURN = 8;
export const SPY_TRAVEL_TURNS_MAX = 5;
/** the success chance in percent at Recruit, and what each level adds. */
export const SPY_SUCCESS_BASE_PCT = 50;
export const SPY_SUCCESS_PER_LEVEL_PCT = 10;
/** on a failure, the chance the spy is caught rather than merely turned back. */
export const SPY_CAPTURE_PCT = 50;

/** CIV6 (Bodyguard of Lies, Golden face): "Spies take no time to establish
 *  presence in an enemy city. Time to complete all offensive spy operations
 *  reduced by 25%." The establish half is the TRAVEL clock here — the only
 *  thing between arriving and starting. */
export const BODYGUARD_OP_NUM = 3;
export const BODYGUARD_OP_DEN = 4;

// --- the sourced effect magnitudes -----------------------------------------
/** CIV6 (Foment Unrest): "Base Loyalty reduction is 20, +5 per Spy level." */
export const SPY_UNREST_LOYALTY = 20;
export const SPY_UNREST_PER_LEVEL = 5;
/** CIV6 (Neutralize Governor): "Base duration is 7 turns, +1 per Spy level." */
export const SPY_GOVERNOR_TURNS = 7;
export const SPY_GOVERNOR_PER_LEVEL = 1;
/** CIV6 (Gain Sources): "Spies in this city operate at 2 levels higher for 24
 *  turns." */
export const SPY_SOURCES_LEVELS = 2;
export const SPY_SOURCES_TURNS = 24;
/** CIV6 (Recruit Partisans): "will cause 2-4 rebel anti-cavalry units to spawn
 *  around the district ... their level will match the current World Era." */
export const SPY_PARTISANS_MIN = 2;
export const SPY_PARTISANS_MAX = 4;
/** MODEL: "there is a much higher chance than normal that they will be
 *  caught" — the source names the effect, not the number. */
export const SPY_COUNTERSPY_CATCH_PCT = 30;
