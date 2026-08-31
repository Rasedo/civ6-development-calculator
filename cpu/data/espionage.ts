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
/** CIV6 (Spy): a spy is "able to choose one of three promotions each time
 *  they gain a level, which are chosen at random from the pool"; the chassis
 *  page caps it at three taken, which its three level-ups already do. */
export const SPY_PROMO_OFFER = 3;

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
  /** run in a CITY-STATE's city — the R&F target class. */
  citystate?: boolean;
  /** CIV6 (Spy): the mission's own duration, from the chassis' mission table. */
  turns: number;
  /** CIV6 (Spy): the same table's success rate, at the Recruit level. A
   *  `certain` mission publishes none and rolls for nothing. */
  successPct?: number;
}

/**
 * The mission table, in the order the source's own Mission Details table
 * lists them. THE ORDER IS THE WIRE: column k of the MISSION head is the k-th
 * row here on both engines.
 *
 * Absent, and recorded: Zombie Outbreak (a game mode).
 */
export const SPY_MISSIONS: readonly SpyMissionDef[] = [
  { id: 'GAIN_SOURCES', district: 'CITY_CENTER', offensive: false, certain: true, turns: 8 },
  { id: 'LISTENING_POST', district: 'CITY_CENTER', offensive: false, certain: true, turns: 8 },
  { id: 'SIPHON_FUNDS', district: 'COMMERCIAL_HUB', offensive: true, turns: 8, successPct: 56 },
  { id: 'GREAT_WORK_HEIST', district: 'THEATER_SQUARE', offensive: true, turns: 8, successPct: 20 },
  { id: 'SABOTAGE_PRODUCTION', district: 'INDUSTRIAL_ZONE', offensive: true, turns: 8, successPct: 35 },
  { id: 'STEAL_TECH_BOOST', district: 'CAMPUS', offensive: true, turns: 8, successPct: 35 },
  { id: 'RECRUIT_PARTISANS', district: 'NEIGHBORHOOD', offensive: true, turns: 8, successPct: 10 },
  { id: 'DISRUPT_ROCKETRY', district: 'SPACEPORT', offensive: true, turns: 8, successPct: 20 },
  { id: 'FOMENT_UNREST', district: 'CITY_CENTER', offensive: true, turns: 8, successPct: 56 },
  { id: 'NEUTRALIZE_GOVERNOR', district: 'CITY_CENTER', offensive: true, turns: 8, successPct: 35 },
  { id: 'BREACH_DAM', district: 'DAM', offensive: true, turns: 8, successPct: 20 },
  { id: 'COUNTERSPY', district: 'CITY_CENTER', offensive: false, athome: true, turns: 16 },
  // CIV6 (the chassis' mission table): "16 (Standard Speed)" turns at 56%;
  // (Fabricate Scandal) performed "in a City-State that you are not Suzerain
  // over". Appended LAST — the mission head is THE WIRE and every later verb
  // column derives its base from this list's length on both engines.
  { id: 'FABRICATE_SCANDAL', district: 'CITY_CENTER', offensive: true, turns: 16, successPct: 56, citystate: true },
];
/** The operations the Espionage Pact can name: the OFFENSIVE ones, in catalog
 *  order — the only rows either of its outcomes can act on. */
export const SPY_OFFENSIVE_MISSIONS: readonly number[] = SPY_MISSIONS
  .map((m, i) => (m.offensive ? i : -1)).filter((i) => i >= 0);

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
export const SPY_M_FABRICATE_SCANDAL = mi('FABRICATE_SCANDAL');

/** how many destinations the TRAVEL head offers, cities in centre-tile order. */
export const SPY_TRAVEL_COLS = 8;

// ---------------------------------------------------------------------------
// THE MODEL. Each mission's DURATION and its base success RATE are the Spy
// chassis' own published table (above). What the source does not publish is
// how a LEVEL moves that rate — only that it does, since nine promotions read
// "as if 2 levels more experienced" — nor what a failure costs. Those two are
// this model's own; everything else here is sourced.
// ---------------------------------------------------------------------------
export const SPY_TRAVEL_TURNS_MIN = 1;
export const SPY_TRAVEL_TILES_PER_TURN = 8;
export const SPY_TRAVEL_TURNS_MAX = 5;
/** what each level above Recruit adds to the mission's own published rate. */
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

/**
 * CIV6 (Espionage): a discovered spy "will need to escape from the target
 * city" — by Airplane (needs an Aerodrome), Boat (a Harbor), Vehicle (a
 * Commercial Hub) or on Foot, the faster the ride the likelier the catch,
 * and a survivor reappears in the CAPITAL after the ride home. The gates and
 * the return times (1/2/3/4 turns) are sourced; each route's base escape
 * rate is a MODEL value under that sourced ordering. Listed FASTEST first:
 * the model spy takes the first route whose district stands — soonest back
 * in service, a recorded model choice where the real game asks the player.
 */
export interface SpyEscapeRoute {
  id: string;
  district: DistrictId | null;
  turns: number;
  basePct: number;
}
export const SPY_ESCAPE_ROUTES: readonly SpyEscapeRoute[] = [
  { id: 'AIRPLANE', district: 'AERODROME', turns: 1, basePct: 40 },
  { id: 'BOAT', district: 'HARBOR', turns: 2, basePct: 50 },
  { id: 'VEHICLE', district: 'COMMERCIAL_HUB', turns: 3, basePct: 60 },
  { id: 'FOOT', district: null, turns: 4, basePct: 70 },
];

/** CIV6 (Fabricate Scandal): "all other players lose a number of Envoys
 *  determined by the Spy's level" — the SHAPE is sourced, the map is not:
 *  base and per-level are MODEL values. */
export const SPY_SCANDAL_ENVOYS_BASE = 2;
export const SPY_SCANDAL_PER_LEVEL = 1;
