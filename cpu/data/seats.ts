

export type SeatClass = 'major' | 'minor' | 'hostile';

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
};

/**
 * MINOR `xp` IS UNREACHED, NOT UNVERIFIED-BY-CHOICE. Neither engine gives a
 * city-state units yet, so no unit carries a minor seat and this cell is never
 * read. It holds `true` because that is what the code did before the table
 * existed — `gainXp` refused barbarians and nobody else — so the table changes
 * no behaviour. The day minors get units, this cell needs a Civ 6 source
 * before it is trusted; it is called out here rather than left to be
 * discovered as a silent default.
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
// WAR_MIN_TURNS. The rest is deliberate model tuning, not Civ 6 values: the
// aggression/settle cadence, the ERA_* thresholds (pinned to this model's own
// measured distribution), the war/denounce/warmonger magnitudes, and the
// governor constants.
//
// SHIPPED-ONLY: DOW_PROXIMITY has no TypeScript reader. It exists to reach
// rules.json, where the denounce decider reads it.
// ---------------------------------------------------------------------------

export const CIV_LEADERS: { name: string; color: string; cityNames: string[] }[] = [
  { name: 'Rome', color: '#8e3db8', cityNames: ['Roma', 'Ostia', 'Ravenna', 'Neapolis', 'Capua', 'Verona'] },
  { name: 'Egypt', color: '#3db88e', cityNames: ['Thebes', 'Memphis', 'Giza', 'Elephantine', 'Sais', 'Tanis'] },
  { name: 'Norway', color: '#3d6ab8', cityNames: ['Nidaros', 'Bergen', 'Oslo', 'Tunsberg', 'Hamar', 'Stavanger'] },
  { name: 'Sumeria', color: '#b8823d', cityNames: ['Uruk', 'Ur', 'Eridu', 'Lagash', 'Nippur', 'Kish'] },
];

export const MAX_CITIES_PER_SEAT = 6;
/** City COLUMNS a seat is observed and decided over — the same width for every
 * seat. Larger than MAX_CITIES_PER_SEAT because settling caps at that number
 * but loyalty flips do NOT: `transferCity` razes at the cap only on conquest,
 * so a seat can hold more cities than it could ever found, and a narrower
 * window would hide them from the observation and leave them undecidable. The
 * GPU's per-seat-row storage width is this same number (rules.seats.citySlots). */
export const CITY_SLOTS_PER_SEAT = 24;
/** CIV 6: a war must run **10** turns before either side may negotiate peace
 *  (the leaders' action panel unlocks the offer then). One floor for every
 *  pairing here, majors and city-states alike. */
export const WAR_MIN_TURNS = 10;
/** CIV 6: a peace treaty BINDS for **10** turns — once peace is made neither
 *  side may declare on the other again until the term runs out. One term for
 *  every pairing, majors and city-states alike. */
export const PEACE_TREATY_TURNS = 10;
export const PEACE_GOLD_COST = (warTurns: number) => 150 + 10 * warTurns;


export const LOYALTY_MAX = 100;
export const LOYALTY_RANGE = 9;
/** Max per-turn swing from population pressure. Real Civ 6 ±20. */
export const LOYALTY_PRESSURE_SCALE = 20;
/** Per-turn loyalty by amenity tier name. Real Civ 6 ±6/±3. */
export const LOYALTY_AMENITY: Record<string, number> = {
  Ecstatic: 6,
  Happy: 3,
  Content: 0,
  Displeased: -3,
  Unhappy: -6,
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
// NOT MODELLED, and now known to exist because the data names them:
//   * WAR_WEARINESS_PER_WMD_LAUNCHED 10 — there are no nuclear weapons here.
//   * WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, NONFOUNDED_CITY 1,
//     FOUNDED_CITY 0} — a per-CITY component keyed on whether the city is at
//     war and whether you founded it. This model applies one empire-wide
//     penalty per seat; the per-city split is a recorded gap, not a decision.
//
// UNITS ARE NOW REAL WWP. The accumulator stays an INTEGER, so the derived
// amenity penalty is integer too and there is no float-association risk.

export const WW_ERA_BASE_FORMAL = [16, 22, 28, 34, 40] as const;
/** The same table for a SURPRISE war (no casus belli). The premium runs 1.00
 *  at Ancient to 1.30 at Industrial+, never a flat 2. */
export const WW_ERA_BASE_SURPRISE = [16, 25, 34, 43, 52] as const;
export const WW_ABROAD_MULT = 2;
export const WW_DEATH_MULT = 3;
export const WW_DECAY_AT_WAR = 50;
export const WW_DECAY_AT_PEACE = 200;
export const WW_PEACE_TREATY = 2000;
export const WAR_WEARINESS_PER_AMENITY = 400;
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
export const ERA_LENGTH = 50;
export const ERA_SCORE_FOUND = 2; // founded a city
export const ERA_SCORE_CONQUER = 3; // gained a city by capture/flip/transfer
export const ERA_SCORE_WONDER = 3; // completed a world wonder
export const ERA_SCORE_PANTHEON = 1;
export const ERA_SCORE_RELIGION = 2;
export const ERA_SCORE_GP = 1; // earned a Great Person
/** CIV6 (Taj Mahal): the wonder pays only for moments "usually worth 2 or
 *  more Era Score", so the threshold is a rule, not a tuning knob. */
export const ERA_SCORE_MOMENT_MIN = 2;
export const ERA_DARK_T = 3;
export const ERA_GOLDEN_T = 10;
export const AGE_PRESSURE = [0.5, 1.0, 1.5];
export const GOV_CIVICS_PER_TITLE = 10;
export const GOV_MAX_TITLES = 5;
/**
 * The CULTURE VICTORY constants, verified against the Gathering
 * Storm rules (civilization.fandom.com "Tourism (Civ6)"):
 *   visiting tourists = lifetime tourism / (nCivs * 200)
 *   domestic tourists = lifetime culture / 100
 * and a civ wins once its VISITING tourists exceed EVERY other civ's DOMESTIC
 * tourists. The 200 is the Rise-and-Fall-onward value (it was 150 in vanilla),
 * so it is the right one for the GS ruleset this repo models.
 */
/**
 * DIPLOMATIC FAVOR — the World Congress currency. Real Civ 6
 * (Gathering Storm, verified against the Civilopedia "World Congress" concept
 * and the Civilization wiki "Diplomatic Favor (Civ6)" page): each civ earns
 * favor per turn equal to its GOVERNMENT TIER (1-4; Chiefdom is tier 0 and
 * pays nothing), plus +1 per city-state it is SUZERAIN of.
 *
 * NOT MODELED, and deliberately not invented: favor from ALLIANCES (seat 0
 * has no alliance axis yet), and the favor PENALTIES for CO2 (no climate
 * system), global grievances and occupying original capitals. The wiki names
 * those terms but not their rates, and guessing a rate would be exactly the
 * fabrication the verify-before-implement rule exists to prevent. Recorded as
 * residuals instead.
 */
export const DIPLO_FAVOR_PER_SUZERAIN = 1;

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
export const CONGRESS_INTERVAL = 30;
export const CONGRESS_MIN_ERA = 2;
export const DVP_PER_RESOLUTION = 1;
/** Diplomatic Victory threshold (real Civ 6 GS: 20 points). */
export const DIPLO_VICTORY_POINTS = 20;

export type CongressTargetKind = 'district' | 'gpClass' | 'gwKind' | 'seat'
  | 'currency' | 'policy' | 'government' | 'project' | 'csType';
/** The wire ORDER of the target kinds: a resolution's `t` on the exported
 *  rules is this array's index, so the GPU's `_congress_space` /
 *  `_congress_pref` switch on the same numbers. APPEND only. */
export const CONGRESS_TARGET_KINDS: readonly CongressTargetKind[] = [
  'district', 'gpClass', 'gwKind', 'seat',
  'currency', 'policy', 'government', 'project', 'csType',
];

export interface CongressResolutionDef {
  id: string;
  name: string;
  /** civEraIndex floor for the slate (0 = from the congress's own gate). */
  minEra: number;
  /** civEraIndex ceiling, inclusive (99 = none). */
  maxEra: number;
  target: CongressTargetKind;
}
/**
 * The modeled resolution subset — the rows whose BOTH outcomes land on
 * existing engine channels, era windows verbatim from the wiki table.
 * Catalog order is load-bearing: the slate rotation and the wire's res
 * indices key on it. The unmodeled rows (Trade Policy, Treaty Organization,
 * World Religion, Mercenary Companies, ...) are open AUDIT items.
 */
export const CONGRESS_RESOLUTIONS: readonly CongressResolutionDef[] = [
  // CIV6: "A: +100% Production towards buildings in this district. /
  // B: No buildings can be created in this district." (through Modern)
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
  { id: 'HERITAGE_ORGANIZATION', name: 'Heritage Organization', minEra: 5, maxEra: 99, target: 'gwKind' },
  // CIV6: "A: +100% cost when producing or purchasing military units using
  // this currency type. / B: -50% cost ...". The target is the CURRENCY, so
  // the multiplier rides the PURCHASE price in it; nothing in this model
  // produces a unit in a currency.
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
/** The always-3rd Diplomatic Victory resolution enters at Modern. */
export const CONGRESS_DV_MIN_ERA = 5;
export const CONGRESS_DV_DELTA = 2;
/** The k-th EXTRA vote costs CONGRESS_VOTE_STEP * k favor. */
export const CONGRESS_VOTE_STEP = 10;
export const CONGRESS_PROD_MULT = 2;
export const CONGRESS_GPP_MULT = 2;
/** Migration Treaty growth factors as LITERALS — both engines must see
 * the identical double, and 1 +/- 0.2 does not round to these. */
export const CONGRESS_GROWTH_A = 1.2;
export const CONGRESS_GROWTH_B = 0.8;
export const CONGRESS_MIG_LOYALTY = 5;
export const CONGRESS_GW_MULT = 2;
/** "+100%" / "-50%" as the LITERAL doubles both engines must agree on. Every
 *  congress magnitude below is one of these two faces of the same sourced
 *  pair, so they are named once and shared. */
export const CONGRESS_PLUS_100 = 2;
export const CONGRESS_MINUS_50 = 0.5;
/** Trade Policy outcome A: the sender's bonus per route to the target, and
 *  the target's own extra route capacity. */
export const CONGRESS_TRADE_GOLD = 4;
export const CONGRESS_TRADE_CAPACITY = 1;
/** Policy Treaty outcome A: favor per turn to every seat holding the card. */
export const CONGRESS_POLICY_FAVOR = 1;
/** World Ideology: the wildcard slot the targeted government gains or loses. */
export const CONGRESS_IDEOLOGY_SLOTS = 1;
/** CIV6 (Culture Bomb): an annexed tile must fall "within 3 hexes of one of
 *  the owner's City Centers". */
export const CULTURE_BOMB_RANGE = 3;

export const TOURISM_PER_VISITOR_PER_CIV = 200;
export const CULTURE_PER_DOMESTIC_TOURIST = 100;

/** dedications granted on a HEROIC age (Dark -> Golden). Real
 * Civ 6 grants three; every other transition grants one. */
export const ADMIRAL_MARCH_LIVE = true;

/**
 * The NAMED DEDICATION CATALOG. Real Civ 6 has each civ commit to a NAMED
 * dedication per
 * era, and every dedication has TWO faces — a DARK/NORMAL face that pays ERA
 * SCORE off specific EVENTS (the climb-out) and a GOLDEN face that pays a
 * standing bonus instead.
 *
 * Verified against the Gathering Storm Civilopedia's "Dedications" concept.
 * The four modeled here are the ones whose EVENT already exists as a hook on
 * both engines. The rest of the catalog is OPEN: To Arms!, Hic Sunt Dracones,
 * Reform the Coinage and Heartbeat of Steam each need an event this model does
 * not raise, and four more wait on spies / air units / artifacts / Giant Death
 * Robots.
 *
 *   0 MONUMENTALITY       +1 era score per specialty DISTRICT completed
 *   1 FREE_INQUIRY        +1 era score per EUREKA (tech boost) triggered, and
 *                         per building constructed that provides SCIENCE
 *   2 PEN_BRUSH_AND_VOICE +1 era score per INSPIRATION (civic boost) triggered,
 *                         and per building constructed with a GREAT WORK slot
 *   3 EXODUS_OF_THE_EVANGELISTS  +2 era score per city converted to your religion
 *   4 TO_ARMS             +1 era score per non-barbarian CORPS killed (+2 per
 *                         ARMY) — formations do not exist here, so the event
 *                         cannot occur, exactly as in Civ 6 before Nationalism
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
 * Residual, recorded: To Arms!'s special Casus Belli needs a denouncement
 * system; Sky and Stars, Bodyguard of Lies and Automaton Warfare need air
 * units, spies and Giant Death Robots, BOTH faces.
 */
export const DEDICATIONS = ['MONUMENTALITY', 'FREE_INQUIRY', 'PEN_BRUSH_AND_VOICE', 'EXODUS_OF_THE_EVANGELISTS', 'TO_ARMS', 'HIC_SUNT_DRACONES', 'REFORM_THE_COINAGE', 'HEARTBEAT_OF_STEAM', 'WISH_YOU_WERE_HERE'] as const;
export const DED_MONUMENTALITY = 0;
export const DED_FREE_INQUIRY = 1;
export const DED_PEN_BRUSH_AND_VOICE = 2;
export const DED_EXODUS = 3;
export const DED_TO_ARMS = 4;
export const DED_DRACONES = 5;
export const DED_COINAGE = 6;
export const DED_STEAM = 7;
export const DED_WISH = 8;
export const DED_EVENT_SCORE = [1, 1, 1, 2, 1, 1, 1, 2, 1] as const;
/**
 * WHICH DEDICATIONS A WORLD ERA OFFERS, indexed by `ERAS`. Real Civ 6 draws
 * each era's choice from a window — "the particular set of Dedications
 * available changes according to the era the world enters into", and there are
 * "always four different Dedications to choose from". Ancient offers none: a
 * civ has earned no era score yet when the game opens.
 *
 * Every window below holds exactly the four the source lists, except Atomic and
 * later, where three of the four (Sky and Stars, Bodyguard of Lies, Automaton
 * Warfare) need systems this model has not got and are simply absent.
 */
export const DEDICATION_ERAS: readonly (readonly number[])[] = [
  [],                                                                  // Ancient
  [DED_MONUMENTALITY, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS], // Classical
  [DED_MONUMENTALITY, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS], // Medieval
  [DED_MONUMENTALITY, DED_EXODUS, DED_DRACONES, DED_COINAGE],          // Renaissance
  [DED_DRACONES, DED_COINAGE, DED_STEAM, DED_TO_ARMS],                 // Industrial
  [DED_DRACONES, DED_COINAGE, DED_STEAM, DED_TO_ARMS],                 // Modern
  [DED_TO_ARMS, DED_WISH],                                             // Atomic
  [DED_TO_ARMS, DED_WISH],                                             // Information
  [DED_WISH],                                                          // Future
];
/** CIV6 (Wish You Were Here, Golden face): "+100% Tourism to all National
 *  Parks." */
export const WISH_PARK_TOURISM_MULT = 2;
/**
 * CIV6 (Wish You Were Here, Golden face): "Cities with Governors receive 50%
 * Tourism from World Wonders" — an ADDITIONAL half, and the source is explicit
 * that "it is completely irrelevant which Governor is in such a city".
 * Expressed as a fraction so both engines fold the same integer.
 */
export const WISH_WONDER_TOURISM_NUM = 3;
export const WISH_WONDER_TOURISM_DEN = 2;
/** CIV6 (To Arms!, Golden face): "+15% Production towards military units." */
export const TO_ARMS_MIL_PROD_MULT = 1.15;
/** CIV6 (Hic Sunt Dracones, dark face): "+3 Era Score each time you discover
 *  a new Continent or natural wonder" — per-event score on top of the
 *  catalog's per-kill 1. */
export const DRACONES_DISCOVERY_SCORE = 3;
/** CIV6 (Reform the Coinage, Golden face): "International Trade Routes
 *  provide +3 Gold per specialty district in the foreign city." */
export const COINAGE_INTL_GOLD_PER_SPEC = 3;
/** CIV6 (Heartbeat of Steam, Golden face): "+10% Production toward Industrial
 *  era and later wonders." */
export const STEAM_WONDER_PROD_MULT = 1.1;

export const DEDICATION_PAYOUTS_LIVE = true;

/**
 * Seat MILITARY ENGINEER production.
 *
 * The production RULE is owner-chosen, not sourced: at war, one engineer at a
 * time, forting only tiles adjacent to a hostile civ's territory. Recorded as
 * authored — real Civ 6's AI forts chokepoints and no published rule quantifies
 * that. Flipping this flag is a behaviour change on both seats and needs its own
 * gated round.
 */
export const ENGINEER_LIVE = true;

export const HEROIC_DEDICATIONS = 3;
/** MONUMENTALITY / EXODUS OF THE EVANGELISTS grant +2 Movement to
 *  Builders and to Missionaries/Apostles/Inquisitors respectively, for the
 *  duration of the GOLDEN age that committed them (Civilopedia, Gathering
 *  Storm). Exported to the GPU as `eras.goldenMoveBonus`. */
export const GOLDEN_MOVE_BONUS = 2;

export const GOVERNOR_LOYALTY = 8;
/** A civ↔civ war is FORMAL iff the aggressor denounced
 *  the target at least this many turns before declaring; otherwise SURPRISE. */
export const FORMAL_WAR_MIN_TURNS = 5;

/**
 * ALLIANCES on the civ↔civ axis. Real Civ 6 requires a
 * Declaration of Friendship first and then an Alliance, and ALLIES CANNOT
 * DECLARE WAR ON EACH OTHER — that last rule is what this models. The
 * friendship prerequisite is stylized as "at peace for ALLY_MIN_PEACE turns
 * with NO denouncement in either direction"; a denouncement or a war breaks it
 * immediately. Zero-draw and symmetric, exactly like `Seat.wars`.
 */
export const ALLY_MIN_PEACE = 30;

/**
 * WARMONGER COST. Real Civ 6 makes aggression carry a
 * diplomatic price — declaring war and taking cities generate GRIEVANCES, and
 * a warmonger is shunned and ganged up on. Modeled as a per-civ score:
 * +WARMONGER_DOW on declaring, +WARMONGER_CAPTURE on taking a seat
 * city, decaying by 1 per turn while NOT at war (floor 0). Two costs follow —
 * a civ with any grievances cannot form an ALLIANCE, and once it passes
 * WARMONGER_GANG others may declare on it WITHOUT the usual strength
 * advantage. Zero-draw, integer-only.
 */
export const WARMONGER_DOW = 4;
export const WARMONGER_CAPTURE = 3;
export const WARMONGER_GANG = 6;
export function warWearinessPenalty(weariness: number): number {
  return Math.floor(Math.max(0, weariness) / WAR_WEARINESS_PER_AMENITY);
}

export const DOW_PROXIMITY = 9;
