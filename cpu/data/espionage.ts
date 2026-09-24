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
import { srcConst, xml, type SrcMap } from './provenance';

/** shorthand: one `GlobalParameters` row's `Value` */
const gp = (name: string) => xml('GlobalParameters', `Name=${name}`, 'Value');

export const SPY_UNIT = 'SPY';

/**
 * CIV6 (Spy): "A player's Spy capacity increases by 1 for each of these."
 * The Government Plaza's Tier-2 Intelligence Agency is the eighth source and
 * carries its own `spyCapacity`; the two LEADER uniques (Wu Zetian's Defensive
 * Tactics, Catherine de Medici's Castles) are civilization uniques.
 */
export const SPY_CAPACITY_CIVICS = srcConst('eras.espionage.capacityCivics',
  ['DIPLOMATIC_SERVICE', 'NATIONALISM', 'IDEOLOGY', 'COLD_WAR'] as const, {
    pedia: 'the GS Spy page ("A player\'s Spy capacity increases by 1 for each of these"); the '
      + 'install writes each as a civic modifier, not as a readable column',
  });
export const SPY_CAPACITY_TECHS = srcConst('eras.espionage.capacityTechs', ['COMPUTERS'] as const, {
  pedia: 'the GS Spy page (the Computers tech is the one technology source of Spy capacity)',
});
/** CIV6 (Espionage): "The maximum number of Spies a civilization can have is 5
 *  in vanilla Civilization VI and 6 from Rise and Fall onward". */
export const SPY_CAPACITY_MAX = srcConst('eras.espionage.capacityMax', 6, {
  pedia: 'the GS Espionage page ("The maximum number of Spies a civilization can have is ... 6 '
    + 'from Rise and Fall onward")',
});

/** CIV6 (Espionage): "In ascending order, the levels are as follows: Recruit,
 *  Agent, Secret Agent, Master Spy" — and "a Spy that reaches the Master Spy
 *  level stops gaining experience." */
export const SPY_LEVELS = srcConst('espionage.SPY_LEVELS',
  ['RECRUIT', 'AGENT', 'SECRET_AGENT', 'MASTER_SPY'] as const, {
    derived: 'the ESPIONAGE_MAX_LEVEL levels the GS Espionage page names in ascending order '
      + '(Recruit, Agent, Secret Agent, Master Spy)',
    inputs: [gp('ESPIONAGE_MAX_LEVEL')],
  });
export const SPY_MAX_LEVEL = SPY_LEVELS.length - 1;
/** the level at which Listening Post reads two levels of visibility rather
 *  than one — "2 if the Spy's level is Secret Agent or higher". */
export const SPY_SECRET_AGENT_LEVEL = srcConst('eras.espionage.secretAgentLevel', 2, {
  pedia: 'the GS Listening Post description ("2 if the Spy\'s level is Secret Agent or higher") — '
    + 'the Secret Agent rung of the level ladder, zero-based',
});

/** the code a spy's mission slot carries while it is doing nothing, and while
 *  it is in transit. A mission INDEX is `SPY_MISSIONS`'s own. */
export const SPY_IDLE = -1;
export const SPY_TRAVELLING = -2;

export interface SpyMissionDef {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  /** the district the mission is run in — CIV6 (UnitOperations) gives each
   *  one a `TargetDistrict`, the CITY_CENTER where it names none. The spy
   *  STANDS on that tile: the travel head lands it there, the mission is
   *  offered there and nowhere else in the city. */
  district: DistrictId;
  /** the counterspy post: guarded from ANY district of the city, the one it
   *  stands on being the one it defends. */
  anyDistrict?: boolean;
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
  /** CIV6 (UnitOperations.BaseProbability, measured 2026-09-13 over the
   *  tuner socket): the THRESHOLD the mission's one 3d6 roll is read
   *  against — 13 Siphon Funds / Foment Unrest / Fabricate Scandal, 14
   *  Sabotage Production / Steal Tech Boost / Neutralize Governor, 15
   *  Great Work Heist / Disrupt Rocketry / Breach Dam, 16 Recruit
   *  Partisans. A `certain` mission publishes none. */
  baseProbability?: number;
}

/**
 * The mission table, in the order the source's own Mission Details table
 * lists them. THE ORDER IS THE WIRE: column k of the MISSION head is the k-th
 * row here on both engines.
 *
 * Absent, and recorded: Zombie Outbreak (a game mode).
 */

/**
 * PROVENANCE (cpu/data/provenance.ts). `baseProbability` is the install's own
 * `UnitOperations.BaseProbability` (measured 2026-09-13 over the tuner socket
 * and agreeing with the table); `district`, the shape flags and the duration
 * are the chassis' published mission table, which the install writes as an
 * operation's requirement set rather than as a column a checker can read.
 */
const spyMissionSrc = (m: SpyMissionDef): SrcMap => {
  const where = `OperationType=UNITOPERATION_SPY_${m.id}`;
  const table = (what: string) => ({
    pedia: `the GS Spy chassis mission table (${what}); the install writes it as an operation `
      + 'requirement set, not as a readable column',
  });
  const out: Record<string, unknown> = {
    district: table('the district the operation is run in'),
    offensive: table('whether the operation is run in a rival city and levels the spy'),
    turns: table('the operation duration in turns'),
  };
  if (m.baseProbability !== undefined) {
    out.baseProbability = xml('UnitOperations', where, 'BaseProbability');
  }
  if (m.certain !== undefined) out.certain = table('the 100%-success operations');
  if (m.anyDistrict !== undefined) out.anyDistrict = table('the counterspy post guards any district');
  if (m.athome !== undefined) out.athome = table('run in the spy own city');
  if (m.citystate !== undefined) out.citystate = table('run in a city-state');
  return out as SrcMap;
};

/** PROVENANCE: the escape ROUTES and their return times are the Espionage
 *  page's. */
const spyEscapeSrc: SrcMap = {
  district: { pedia: 'the GS Espionage page escape routes (Airplane/Boat/Vehicle/Foot and the '
    + 'district each needs)' },
  turns: { pedia: 'the GS Espionage page escape return times (1/2/3/4 turns)' },
};

const RAW_SPY_MISSIONS: readonly SpyMissionDef[] = [
  { id: 'GAIN_SOURCES', district: 'CITY_CENTER', offensive: false, certain: true, turns: 8 },
  { id: 'LISTENING_POST', district: 'CITY_CENTER', offensive: false, certain: true, turns: 8 },
  { id: 'SIPHON_FUNDS', baseProbability: 13, district: 'COMMERCIAL_HUB', offensive: true, turns: 8 },
  { id: 'GREAT_WORK_HEIST', baseProbability: 15, district: 'THEATER_SQUARE', offensive: true, turns: 8 },
  { id: 'SABOTAGE_PRODUCTION', baseProbability: 14, district: 'INDUSTRIAL_ZONE', offensive: true, turns: 8 },
  { id: 'STEAL_TECH_BOOST', baseProbability: 14, district: 'CAMPUS', offensive: true, turns: 8 },
  { id: 'RECRUIT_PARTISANS', baseProbability: 16, district: 'NEIGHBORHOOD', offensive: true, turns: 8 },
  { id: 'DISRUPT_ROCKETRY', baseProbability: 15, district: 'SPACEPORT', offensive: true, turns: 8 },
  { id: 'FOMENT_UNREST', baseProbability: 13, district: 'CITY_CENTER', offensive: true, turns: 8 },
  { id: 'NEUTRALIZE_GOVERNOR', baseProbability: 14, district: 'CITY_CENTER', offensive: true, turns: 8 },
  { id: 'BREACH_DAM', baseProbability: 15, district: 'DAM', offensive: true, turns: 8 },
  { id: 'COUNTERSPY', district: 'CITY_CENTER', anyDistrict: true, offensive: false, athome: true, turns: 16 },
  // CIV6 (the chassis' mission table): "16 (Standard Speed)" turns at 56%;
  // (Fabricate Scandal) performed "in a City-State that you are not Suzerain
  // over". Appended LAST — the mission head is THE WIRE and every later verb
  // column derives its base from this list's length on both engines.
  { id: 'FABRICATE_SCANDAL', baseProbability: 13, district: 'CITY_CENTER', offensive: true, turns: 16, citystate: true },
];
export const SPY_MISSIONS: readonly SpyMissionDef[] =
  RAW_SPY_MISSIONS.map((m) => ({ ...m, src: spyMissionSrc(m) }));
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

/** how many destinations the TRAVEL head offers — district tiles, nearest
 *  first. A city is several tiles now, so the head is three times the eight
 *  centres it once held (a MODEL width). */
export const SPY_TRAVEL_COLS = srcConst<number>('eras.espionage.travelCols', 24, {
  stylized: 'a MODEL width — how many district tiles the TRAVEL head offers, nearest first; '
    + 'real Civ 6 offers every revealed city',
});
/** CIV6 (Surveillance): "+1 level at districts within 1 hex" of the post. */
export const SPY_SURVEILLANCE_REACH = srcConst('eras.espionage.surveilReach', 1, {
  pedia: 'the GS Surveillance promotion ("+1 level at districts within 1 hex")',
});

// ---------------------------------------------------------------------------
// THE MODEL. Each mission's DURATION is the Spy chassis' own published table
// (above) and its ROLL is measured (`baseProbability` and the 3d6 constants
// below); the ESCAPE's terms are the install's and its shape is measured
// (the police guess, then the score against the base, below).
// ---------------------------------------------------------------------------
/** CIV6 (measured 2026-09-13, `tools/civ6lab/spy_probe.lua`): every mission
 *  is ONE roll of 3d6 read against `baseProbability - k`, and a fresh
 *  Recruit — the install's level 1, this engine's level 0 — reads k = 2
 *  before any level term (`LevelProbChange` 1 per level). */
const spyRoll = {
  lab: 'C-16 — tools/civ6lab/spy_probe.lua, measured 2026-09-13 over the tuner socket: every '
    + 'mission is ONE roll of 3d6 read against baseProbability - k, a fresh Recruit reading k = 2',
};
export const SPY_ROLL_DICE = srcConst('eras.espionage.rollDice', 3, spyRoll);
export const SPY_ROLL_FACES = srcConst('eras.espionage.rollFaces', 6, spyRoll);
export const SPY_ROLL_LEVEL_BASE = srcConst('eras.espionage.rollLevelBase', 2, spyRoll);
export const SPY_TRAVEL_TURNS_MIN = 1;
export const SPY_TRAVEL_TILES_PER_TURN = 8;
export const SPY_TRAVEL_TURNS_MAX = 5;

/** CIV6 (Bodyguard of Lies, Golden face): "Spies take no time to establish
 *  presence in an enemy city. Time to complete all offensive spy operations
 *  reduced by 25%." The establish half is the TRAVEL clock here — the only
 *  thing between arriving and starting. */
const bodyguard = {
  pedia: 'the GS Bodyguard of Lies dedication, Golden face ("Time to complete all offensive spy '
    + 'operations reduced by 25%") — 3/4 as the two integers both engines fold',
};
export const BODYGUARD_OP_NUM = srcConst('eras.espionage.bodyguardNum', 3, bodyguard);
export const BODYGUARD_OP_DEN = srcConst('eras.espionage.bodyguardDen', 4, bodyguard);

// --- the sourced effect magnitudes -----------------------------------------
/** CIV6 (ESPIONAGE_FOMENT_UNREST_BASE_LOYALTY_CHANGE -15, LEVEL -5). */
export const SPY_UNREST_LOYALTY = srcConst('eras.espionage.unrestLoyalty', 15, {
  derived: 'the magnitude of ESPIONAGE_FOMENT_UNREST_BASE_LOYALTY_CHANGE (-15); this engine '
    + 'stores the loyalty a mission TAKES, the install the signed change',
  inputs: [gp('ESPIONAGE_FOMENT_UNREST_BASE_LOYALTY_CHANGE')],
});
export const SPY_UNREST_PER_LEVEL = srcConst('eras.espionage.unrestPerLevel', 5, {
  derived: 'the magnitude of ESPIONAGE_FOMENT_UNREST_LEVEL_LOYALTY_CHANGE (-5)',
  inputs: [gp('ESPIONAGE_FOMENT_UNREST_LEVEL_LOYALTY_CHANGE')],
});
/** CIV6 (ESPIONAGE_NEUTRALIZE_GOVERNOR_BASE_TURNS 6) — the parameters
 *  carry NO per-level row for this mission. */
export const SPY_GOVERNOR_TURNS = srcConst('eras.espionage.governorTurns', 6,
  gp('ESPIONAGE_NEUTRALIZE_GOVERNOR_BASE_TURNS'));
/** CIV6 (Gain Sources): "Spies in this city operate at 2 levels higher for 24
 *  turns." */
export const SPY_SOURCES_LEVELS = srcConst('eras.espionage.sourcesLevels', 2,
  gp('ESPIONAGE_BONUS_GAIN_SOURCES'));
export const SPY_SOURCES_TURNS = srcConst('eras.espionage.sourcesTurns', 24, {
  derived: 'the Gain Sources operation duration (8 turns) x '
    + 'ESPIONAGE_GAIN_SOURCES_DURATION_MULTIPLIER (3) — the GS page states the product, 24 turns',
  inputs: [gp('ESPIONAGE_GAIN_SOURCES_DURATION_MULTIPLIER')],
});
/** CIV6 (Recruit Partisans): "will cause 2-4 rebel anti-cavalry units to spawn
 *  around the district ... their level will match the current World Era." */
const partisans = {
  pedia: 'the GS Recruit Partisans page ("will cause 2-4 rebel anti-cavalry units to spawn around '
    + 'the district"); the install writes the spawn as a DLL operation',
};
export const SPY_PARTISANS_MIN = srcConst('eras.espionage.partisansMin', 2, partisans);
export const SPY_PARTISANS_MAX = srcConst('eras.espionage.partisansMax', 4, partisans);
/**
 * THE ESCAPE. The police guess one of the routes the city offers, uniformly;
 * the escape's score is ESPIONAGE_ESCAPE_BASE_CHANCE + LEVEL_BOOST per level
 * (the install's levels, 1 for a Recruit) + the spy's escape promotion
 * levels + POLICE_CORRECT_MODIFIER when the guess names the route taken +
 * COUNTERSPY_LEVEL_MODIFIER per level of the counterspy posted there, and
 * the spy gets away when the mission roll's 3d6 lands at or under the score.
 * The guess and the dice are measured (tools/civ6lab/spy_loop.py, 129
 * escapes of bought spies: one-route cities, where the guess is certain, let
 * 10 of 54 away, two-route cities 41 of 63), the terms the install's.
 */
export const SPY_ESCAPE_BASE = srcConst('eras.espionage.escapeBase', 10,
  gp('ESPIONAGE_ESCAPE_BASE_CHANCE'));
export const SPY_ESCAPE_LEVEL = srcConst('eras.espionage.escapeLevel', 1,
  gp('ESPIONAGE_ESCAPE_LEVEL_BOOST'));
export const SPY_ESCAPE_POLICE = srcConst('eras.espionage.escapePolice', -4,
  gp('ESPIONAGE_ESCAPE_POLICE_CORRECT_MODIFIER'));
export const SPY_ESCAPE_COUNTERSPY_LEVEL = srcConst('eras.espionage.escapeCounterspyLevel', -1,
  gp('ESPIONAGE_ESCAPE_COUNTERSPY_LEVEL_MODIFIER'));
/** a lost escape ends in the cell this often, else the spy is killed. */
export const SPY_CAPTURE_PCT = srcConst('eras.espionage.capturePct', 29, {
  lab: 'C-16 — tools/civ6lab/spy_loop.py: 34 of 117 lost escapes ended CAPTURED, the rest KILLED',
});

/**
 * CIV6 (Espionage): a discovered spy "will need to escape from the target
 * city" — by Airplane (needs an Aerodrome), Boat (a Harbor), Vehicle (a
 * Commercial Hub) or on Foot, and a survivor reappears in the CAPITAL after
 * the ride home. The gates and the return times (1/2/3/4 turns) are sourced.
 * Listed FASTEST first: the driver's spy takes the first route whose district
 * stands — soonest back in service.
 */
export interface SpyEscapeRoute {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  district: DistrictId | null;
  turns: number;
}
export const SPY_ESCAPE_ROUTES: readonly SpyEscapeRoute[] = [
  { id: 'AIRPLANE', district: 'AERODROME', turns: 1, src: spyEscapeSrc },
  { id: 'BOAT', district: 'HARBOR', turns: 2, src: spyEscapeSrc },
  { id: 'VEHICLE', district: 'COMMERCIAL_HUB', turns: 3, src: spyEscapeSrc },
  { id: 'FOOT', district: null, turns: 4, src: spyEscapeSrc },
];

/** CIV6 (ESPIONAGE_FABRICATE_SCANDAL_BASE_ENVOYS_REMOVED 2, LEVEL 1). */
export const SPY_SCANDAL_ENVOYS_BASE = srcConst('eras.espionage.scandalEnvoysBase', 2,
  gp('ESPIONAGE_FABRICATE_SCANDAL_BASE_ENVOYS_REMOVED'));
export const SPY_SCANDAL_PER_LEVEL = srcConst('eras.espionage.scandalEnvoysPerLevel', 1,
  gp('ESPIONAGE_FABRICATE_SCANDAL_LEVEL_ENVOYS_REMOVED'));
