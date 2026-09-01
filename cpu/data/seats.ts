

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
 * read. It holds `true` because barbarians are the only class the XP award
 * ever refused, so the table changes no behaviour. The day minors get units,
 * this cell needs a Civ 6 source before it is trusted; it is called out here
 * rather than left to be discovered as a silent default.
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
// measured distribution), the gang-up bar, and the governor constants.
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
/**
 * CIV6: a city holds a production QUEUE — several items lined up, each keeping
 * the production already spent on it, the head merely being the one worked.
 * The game's own queue has no published ceiling; this is the depth both engines
 * carry, because the GPU's queue is a tensor dimension and must be finite.
 * MODEL: the number itself is a capacity choice, not a sourced magnitude.
 */
export const PRODUCTION_QUEUE_MAX = 5;
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
//   * WAR_WEARINESS_LOSS_OVER_REQ_AMENITIES_{AT_WAR_CITY 3, NONFOUNDED_CITY 1,
//     FOUNDED_CITY 0}. What these three DO is published nowhere; reading them
//     as a per-city split is an inference off their names. The rule that IS
//     published is the one below: "-1 Amenity for every 400 WWP you currently
//     have, which is then applied to your cities".
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
/** CIV6 (War weariness): "every time you drop a nuke, the war weariness it
 *  will incur is equal to 12 times the Era Base value. There is no difference
 *  between dropping a Nuclear Device or a Thermonuclear Device" — 624 WWP in
 *  a surprise war, 480 in a formal one, both of which the Industrial+ rows
 *  above reproduce exactly. GlobalParameters carries the launch's own half as
 *  WAR_WEARINESS_PER_WMD_LAUNCHED 10; the abroad multiplier is the other 2. */
export const WW_WMD_LAUNCHED = 10;
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
/** CIV6 (Ages): the era-score bars are PER CIV and MOVE — the Dark bar is
 *  "12 + city number when era begin - 5 * dark ages you entered before
 *  + 5 * golden/hero ages you entered before", the Golden bar the same
 *  with 24 (so the gap is a fixed 12). The score window resets each era
 *  here, which is the real game's cumulative "current points" term folded
 *  away. No speed scaling is published for either bar. */
export const ERA_DARK_T = 12;
export const ERA_GOLDEN_T = 24;
export const AGE_PREV_STEP = 5;
export const AGE_PRESSURE = [0.5, 1.0, 1.5];
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
  | 'currency' | 'policy' | 'government' | 'project' | 'csType' | 'feature'
  | 'building' | 'promoClass' | 'religion' | 'governor' | 'spyMission'
  | 'competition' | 'luxury';
/** The wire ORDER of the target kinds: a resolution's `t` on the exported
 *  rules is this array's index, so the GPU's `_congress_space` /
 *  `_congress_pref` switch on the same numbers. APPEND only. */
export const CONGRESS_TARGET_KINDS: readonly CongressTargetKind[] = [
  'district', 'gpClass', 'gwKind', 'seat',
  'currency', 'policy', 'government', 'project', 'csType', 'feature',
  'building', 'promoClass', 'religion', 'governor', 'spyMission', 'competition',
  'luxury',
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
  // CIV6: "A: Clearing Features of this type yields Gold equal to the
  // Production and Food. / B: Features of this type cannot be cleared by any
  // player." (Atomic through Information) The target space is the CLEARABLE
  // features — the rows carrying a chopYield, in catalog order.
  { id: 'DEFORESTATION_TREATY', name: 'Deforestation Treaty', minEra: 6, maxEra: 7, target: 'feature' },
  // CIV6: "A: 50% discount on the production of buildings of this type. /
  // B: Buildings of this type cannot be created by any player." (Modern+)
  // The target space is the POWER PLANTS — the buildings the climate arc is
  // about, in catalog order.
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
  // (Industrial+) A religion IS its founder's seat here, so the target space
  // is the seat roster.
  { id: 'WORLD_RELIGION', name: 'World Religion', minEra: 4, maxEra: 99, target: 'religion' },
  // CIV6: "A: Appointing and promoting a Governor of this type yields 15
  // Diplomatic Favor. / B: All active Governors of this type are neutralized
  // for 6 Turns." The published table gives it no era window.
  { id: 'GOVERNANCE_DOCTRINE', name: 'Governance Doctrine', minEra: 0, maxEra: 99, target: 'governor' },
  // CIV6: "A: All Spies function +2 levels higher for the Target Operation. /
  // B: Target Operation is unavailable." The published table gives it no era
  // window; the floor here is where the chassis page puts the unit —
  // "Starting in the Renaissance era, Spies will become available" — because
  // neither outcome can act before a Spy can run an operation.
  { id: 'ESPIONAGE_PACT', name: 'Espionage Pact', minEra: 3, maxEra: 99, target: 'spyMission' },
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
  // serves — is unpublished; it rides the luxury machinery's own
  // LUXURY_AMENITY_CITIES spread, a recorded model choice.
  { id: 'LUXURY_POLICY', name: 'Luxury Policy', minEra: 3, maxEra: 4, target: 'luxury' },
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
export const CONGRESS_PR_MULT_A = 200;
export const CONGRESS_PR_MULT_B = 50;
/** Military Advisory pays its promotion class +/- this much Combat Strength. */
export const CONGRESS_ADVISORY_CS = 5;
/** Espionage Pact outcome A: the levels every Spy gains on the named
 *  operation — the same magnitude nine Espionage promotions pay for one. */
export const CONGRESS_PACT_LEVELS = 2;
/** World Religion outcome A's Religious Combat Strength, and outcome B's
 *  favor for condemning a unit of the named religion. */
export const CONGRESS_WORLD_RELIGION_RS = 10;
export const CONGRESS_WORLD_RELIGION_FAVOR = 25;
/** CIV6 (Global Energy Treaty, outcome A): "50% discount on the production
 *  of buildings of this type." */
export const CONGRESS_ENERGY_DISCOUNT = 0.5;
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
/** CIV6 (Diplomatic Favor, "Losing Favor"): "you additionally receive a
 *  -5/turn Diplomatic Favor penalty for each Original Capital city you occupy.
 *  Note that gaining a Capital through Loyalty flip will also count as
 *  occupation." A seat's own favor rate can go negative, and "you will get
 *  stuck at 0 Favor until you manage to do something to earn a lump sum". */
export const FAVOR_OCCUPIED_CAPITAL = 5;

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
export const SPECIAL_SESSION_COST = 30;
export const SPECIAL_SESSION_GAP = 15;
/** Concurrent emergencies both engines carry. Real Civ 6 has no such cap. */
export const EMERGENCY_SLOTS = 2;

export interface EmergencyDef {
  id: 'CITY_STATE' | 'MILITARY' | 'NUCLEAR';
  name: string;
  turns: number;
}
export const EMERGENCIES: readonly EmergencyDef[] = [
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
export const EMERGENCY_CITY_STATE = 0;
export const EMERGENCY_MILITARY = 1;
export const EMERGENCY_NUCLEAR = 2;
export const EMERGENCY_MEMBER_FAVOR = 100;
export const EMERGENCY_TARGET_FAVOR = 200;
/** CIV6 (both rows, "Specifics"): "Members gain +2 CS against targets' units;
 *  +1 MP in target's territory; target gains +20 Loyalty in the target city." */
export const EMERGENCY_MEMBER_CS = 2;
export const EMERGENCY_MEMBER_MP = 1;
export const EMERGENCY_TARGET_LOYALTY = 20;
/** the permanent rewards, one per row per outcome */
export const EMERGENCY_MEMBER_HEAL = 5;
export const EMERGENCY_TARGET_STRIKE_CS = 2;
export const EMERGENCY_ENVOY_GOLD = 1;
export const EMERGENCY_CS_ROUTE_GOLD = 2;
/** CIV6 (Nuclear Emergency, success): "Target units have -3 CS when fighting
 *  Member units" — the deeper, permanent version of the running penalty. */
export const EMERGENCY_NUKE_TARGET_CS = 3;
/** CIV6 (Nuclear Emergency, failure): "Member cities exert 1 less Loyalty
 *  pressure." */
export const EMERGENCY_NUKE_LOYALTY_CUT = 1;

export const TOURISM_PER_VISITOR_PER_CIV = 200;
/** CIV6 (Tourism, "Different government penalty"): the penalty is
 *  "(Your OtherGovernmentIntolerance + Foreign OtherGovernmentIntolerance) x
 *  TOURISM_CONFLICTING_GOVERNMENT_MULTIPLIER", and SAME government pays
 *  nothing. Gathering Storm values: 20 for the three tier-3 governments,
 *  0 for everything earlier, multiplier 1 — so the worst pair is -40%. */
export const GOV_INTOLERANCE: Readonly<Record<string, number>> = {
  CHIEFDOM: 0, AUTOCRACY: 0, OLIGARCHY: 0, CLASSICAL_REPUBLIC: 0,
  MONARCHY: 0, MERCHANT_REPUBLIC: 0, THEOCRACY: 0,
  DEMOCRACY: 20, COMMUNISM: 20, FASCISM: 20,
};
export const TOURISM_GOV_MULT = 1;
/** CIV6 (Tourism, "International Modifiers"), each SUMMED, per foreign civ. */
export const TOURISM_OPEN_BORDERS_PCT = 25;
export const TOURISM_ROUTE_PCT = 25;
/** the two RELIGIOUS-only halvings, summed with the rest. */
export const TOURISM_RELIGIOUS_PENALTY_PCT = 50;
export const CULTURE_PER_DOMESTIC_TOURIST = 100;
/** CIV6 (Tourism): "Holy Cities generate +8 Religious Tourism per turn" —
 *  paid to the holy city's CURRENT owner. */
export const HOLY_CITY_TOURISM = 8;
/** CIV6 (Tourism): "-50% (Religious Tourism only) if the foreign
 *  civilization has The Enlightenment" — the read-side halving's key. */
export const ENLIGHTENMENT_CIVIC = 'ENLIGHTENMENT';

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
export const DED_EVENT_SCORE = [1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1] as const;
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
export const SKY_ALUMINUM_PER_TURN = 2;
/** CIV6 (Sky and Stars, Golden face): "+100% XP earned for all Air Units" —
 *  percentage POINTS, joining the unit's own building modifier. */
export const SKY_AIR_XP_PCT = 100;
/** CIV6 (Automaton Warfare, Golden face): "Receive 3 Uranium per turn." */
export const AUTOMATON_URANIUM_PER_TURN = 3;
/** CIV6 (Automaton Warfare, Golden face): "Uranium mines accumulate +1 more
 *  resource per turn." */
export const AUTOMATON_URANIUM_PER_MINE = 1;

export const DEDICATION_PAYOUTS_LIVE = true;

/**
 * Seat MILITARY ENGINEER production.
 *
 * The unit's own data and its Armory gate are sourced (`data/units.ts`). What
 * is authored is this: at war, one engineer at a time, forting only tiles
 * adjacent to a hostile civ's territory. Real Civ 6's AI forts chokepoints and
 * publishes no rule that quantifies it, so no source can settle this one.
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
 * EVERY DIPLOMATIC AGREEMENT RUNS THE SAME CLOCK.
 * CIV6 (Diplomacy, Diplomatic Agreements): "There are a number of Agreements
 * that leaders may enter into. All of them have limited duration of 30 turns,
 * after which they have to be renewed." The Declaration of Friendship
 * ("for 30 turns"), the Alliance ("Alliances expire after 30 turns on
 * Standard speed") and the Denunciation ("A Denunciation lasts for 30 turns,
 * after which its effects expire") all publish the same number.
 */
export const AGREEMENT_TURNS = 30;

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
export const COMPETITION_TURNS = AGREEMENT_TURNS;
/** The score fractions the two lower podiums cut at, as published. */
export const COMPETITION_SILVER_PCT = 25;
export const COMPETITION_BRONZE_PCT = 50;

export interface CompetitionDef {
  id: string;
  name: string;
  /** Diplomatic Victory Points to the single highest score. */
  goldPoints: number;
  /** Diplomatic Favor to the top quarter, the gold winner included. */
  silverFavor: number;
  /** ...and to the quarter below it. */
  bronzeFavor: number;
}
/**
 * APPEND-ONLY: the index is the wire, and it is the resolution's TARGET.
 * A row belongs here only when its SCORED QUANTITY and all three tiers are
 * published — the ones that are not are open AUDIT items.
 */
export const COMPETITIONS: readonly CompetitionDef[] = [
  // CIV6 (Climate Accords): scored "1 point per turn for each CO2 emission
  // less than the highest polluter"; Gold "2 Diplomatic Victory points",
  // Silver "100 Diplomatic Favor", Bronze "50 Diplomatic Favor".
  { id: 'CLIMATE_ACCORDS', name: 'Climate Accords', goldPoints: 2, silverFavor: 100, bronzeFavor: 50 },
];
export const COMPETITION_CLIMATE = 0;


/** CIV6 (Diplomatic Visibility and Gossip): "There are 5 levels of diplomatic
 *  visibility: None, Limited, Open, Secret, and Top Secret." Each source is
 *  worth one level, and the ceiling is the last of them. */
export const VISIBILITY_LEVELS = ['NONE', 'LIMITED', 'OPEN', 'SECRET', 'TOP_SECRET'] as const;
export const VISIBILITY_MAX = VISIBILITY_LEVELS.length - 1;
/** CIV6 (Delegations and Embassies): "Delegations cost 10 Gold and Embassies
 *  cost 25 Gold, which is paid to the other leader", each worth "1 level of
 *  Diplomatic Visibility". The Resident Embassy "replaces" the Delegation once
 *  its civic is in, so a seat holds ONE mission with another and pays whatever
 *  its own civics make that mission cost. */
export const DELEGATION_COST = 10;
export const EMBASSY_COST = 25;
export const EMBASSY_CIVIC = 'DIPLOMATIC_SERVICE';

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
] as const;
export type DealItemKind = typeof DEAL_ITEM_KINDS[number];
export const DEAL_GOLD = DEAL_ITEM_KINDS.indexOf('GOLD');
export const DEAL_GOLD_PER_TURN = DEAL_ITEM_KINDS.indexOf('GOLD_PER_TURN');
export const DEAL_FAVOR = DEAL_ITEM_KINDS.indexOf('FAVOR');
export const DEAL_RESOURCE = DEAL_ITEM_KINDS.indexOf('RESOURCE');
export const DEAL_GREAT_WORK = DEAL_ITEM_KINDS.indexOf('GREAT_WORK');
export const DEAL_CITY = DEAL_ITEM_KINDS.indexOf('CITY');
export const DEAL_SPY = DEAL_ITEM_KINDS.indexOf('SPY');
export const DEAL_OPEN_BORDERS = DEAL_ITEM_KINDS.indexOf('OPEN_BORDERS');

/**
 * CIV6: "Sums of Gold, Great Works, Relics, Artifacts, and captured Spies are
 * all permanent trades—once you give those items away, you have to trade again
 * to get them back. Resources and gold per turn, however, are temporary, and
 * once the deal has run its course you will get them back." A city changes
 * hands for good, and an agreement runs on the same 30-turn clock every other
 * agreement here does.
 */
export const DEAL_PERMANENT: readonly boolean[] = DEAL_ITEM_KINDS.map(
  (k) => k !== 'GOLD_PER_TURN' && k !== 'RESOURCE' && k !== 'OPEN_BORDERS');

/** CIV6: "All Deals, Demands, and Promises last for 30 turns, at which point
 *  they need to be renewed" — the clock every other agreement runs on. */
export const DEAL_TURNS = AGREEMENT_TURNS;

/** How many items ONE side of a deal may carry. A representation bound: real
 *  Civ 6 bounds neither the table nor the number of deals a pair may run, and
 *  this engine carries one running deal per ORDERED pair. */
export const DEAL_ITEMS = 4;

/** An offer sits on the table for the one turn after it is made: the record is
 *  a turn's decision, so an offer nobody answers lapses rather than outliving
 *  the state it was priced against. */
export const DEAL_OFFER_TURNS = 1;

/** the technology whose research "will increase your visibility with ALL
 *  civilizations by one level". */
export const VISIBILITY_TECH = 'PRINTING';
/** CIV6 ("Intel on enemy movements"): the Combat Strength the side with the
 *  higher visibility carries, per level of the difference — so a Top Secret
 *  reading of a civ that has None on you is worth four of these. */
export const VISIBILITY_CS_PER_LEVEL = 3;

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
export const OPEN_BORDERS_CIVIC = 'EARLY_EMPIRE';
export const ALLIANCE_CIVIC = 'CIVIL_SERVICE';

/**
 * GS pays a standing Alliance in favor.
 * CIV6 (Alliance): "In Gathering Storm, each Alliance gives you +1 Diplomatic
 * Favor per turn per level." Alliance LEVELS are not modeled, so every live
 * alliance pays its level-1 rate.
 */
export const FAVOR_PER_ALLIANCE = 1;

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
export const ALLIANCE_QP_TURN = 4;
export const ALLIANCE_QP_ROUTE = 1;
export const ALLIANCE_L2_QP = 320;
export const ALLIANCE_L3_QP = 960;
/** CIV6 (Alliance, level 1): Trade Routes between allies pay extra - "+2
 *  Science from Trade Routes to your ally" and +1 from the ally's routes to
 *  you, the same 2/1 in Culture and Faith for their types, 4/2 in Gold for
 *  the Economic type. Indexed by ALLIANCE_TYPES; Military routes pay nothing. */
export const ALLIANCE_ROUTE_TO = [2, 2, 4, 0, 2] as const;
export const ALLIANCE_ROUTE_FROM = [1, 1, 2, 0, 1] as const;
export const ALLIANCE_ROUTE_YKEY = ['science', 'culture', 'gold', '', 'faith'] as const;
/** CIV6 (Military alliance 1): "+5 Combat Strength against units of players
 *  at war with you and your ally." */
export const ALLIANCE_M1_CS = 5;
/** CIV6 (Research alliance 2): the shared tech boost lands "every 20 turns"
 *  on Standard. */
export const ALLIANCE_R2_BOOST_TURNS = 20;
/** CIV6 (Research alliance 3): "+10% of your ally's Science" while
 *  researching a tech the ally completed, or the tech the ally is on. */
export const ALLIANCE_R3_SCI_PCT = 0.1;
/** CIV6 (Cultural alliance 2): +1 Great Person point per class-matched
 *  district in origin cities holding a Trade Route to the ally. */
export const ALLIANCE_C2_GPP = 1;
/** CIV6 (Cultural alliance 3): "+10% of your ally's Culture" and "+20% of
 *  your ally's Tourism". */
export const ALLIANCE_C3_CUL_PCT = 0.1;
export const ALLIANCE_C3_TOUR_PCT = 0.2;
/** CIV6 (Economic alliance 2): an Envoy point per turn "for every City-State
 *  with your Ally as Suzerain". */
export const ALLIANCE_E2_INFLUENCE = 1;
/** CIV6 (Religious alliance 2): "+10 Religious Combat Strength against
 *  non-ally Religions." */
export const ALLIANCE_REL2_THEO_CS = 10;
/** CIV6 (Religious alliance 3): "+1 Faith for each of your Citizens following
 *  your ally's religion." */
export const ALLIANCE_REL3_FAITH_PER_POP = 1;

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
/** "Surprise War declared" — a declaration with no casus belli. */
export const GRIEVANCE_WAR_SURPRISE = 150;
/** "Formal War declared" — the denouncement's casus belli. */
export const GRIEVANCE_WAR_FORMAL = 100;
/** CIV6 (Golden Age War, Casus Belli page): "To Arms! Dedication chosen,
 *  denounce target — only 25% warmonger penalty for declaration/captures". */
export const GOLDEN_WAR_GRIEVANCE_PCT = 25;
/** "War declared on a Friend or Ally": 75, to the friend or ally. */
export const GRIEVANCE_WAR_ON_FRIEND = 75;
/** "War declared on a city-state a civ is the Suzerain over": 100. */
export const GRIEVANCE_WAR_ON_SUZERAIN = 100;
/** "War declared on a city-state friend or ally": 50, "to every civ that has
 *  at least 1 Envoy in that city-state, but is not its Suzerain". */
export const GRIEVANCE_WAR_ON_CS_FRIEND = 50;
/** "City Occupied (capturing a city during war): Max 50 base value". The
 *  page publishes the CEILING and says it "varies by city population and type
 *  of war" without publishing either scale, so the ceiling is the value. */
export const GRIEVANCE_CITY_TAKEN = 50;
/** "City Razed (destroying a captured city): Max 150 base value ... (3x cost
 *  of capturing the city)" — which is exactly 3x the row above. */
export const GRIEVANCE_CITY_RAZED = 3 * GRIEVANCE_CITY_TAKEN;
/** "Captured the final city of a civilization: 150 (all remaining civs gain
 *  Grievances against you)". */
export const GRIEVANCE_LAST_CITY = 150;
/** "City-state conquered: 50 (all civs gain Grievances against you)". */
export const GRIEVANCE_CS_CONQUERED = 50;
/** "City-state razed: 100 (all civs gain Grievances against you)". */
export const GRIEVANCE_CS_RAZED = 100;
/** "Denounced: 25". */
export const GRIEVANCE_DENOUNCE = 25;
/** "Controlling the civ's original Capital: 3 per turn while not at war". */
export const GRIEVANCE_HELD_CAPITAL_PER_TURN = 3;
/** "allies of B will gain 50% of B's Grievances against A, and declared
 *  friends of B will gain 25%", as hundredths. */
export const GRIEVANCE_ALLY_SHARE = 50;
export const GRIEVANCE_FRIEND_SHARE = 25;

/**
 * DECAY. CIV6: "The base decay rate of Grievances is equal to 10 - x per turn,
 * where x is each era after the Ancient Era", reaching 2/turn by the Future
 * era; the era is the WORLD era, the same one the Congress gates on. At war
 * the pair does not decay at all.
 */
export const GRIEVANCE_DECAY_BASE = 10;
export const GRIEVANCE_DECAY_FLOOR = 2;
/**
 * CIV6: "The base decay rate is modified if a party is currently occupying a
 * city or cities of the other party ... the rate changes by -1 for the
 * 'victim' party ... but by +1 for the occupying party ... it does not matter
 * how many cities you occupy, the decay rate modifier is always 1. However, if
 * you occupy someone's Capital the rate becomes 3." The wiki's own copy has
 * lost the sign glyph in front of that 3, so the magnitude is read as the
 * modifier's — 3 in place of 1, same sign convention.
 */
export const GRIEVANCE_OCCUPIED_DECAY = 1;
export const GRIEVANCE_OCCUPIED_CAPITAL_DECAY = 3;

/**
 * CIV6 (Diplomatic Favor, "Losing Favor"): "200 Grievance = -1/turn", with
 * "-1 more per 50 beyond", capping at -10. The score read is what every OTHER
 * major holds against this seat.
 */
export const GRIEVANCE_FAVOR_FLOOR = 200;
export const GRIEVANCE_FAVOR_STEP = 50;
export const GRIEVANCE_FAVOR_MAX = 10;

/**
 * THE TWO AI HEURISTICS the grievance table now feeds. Neither is a published
 * Civ 6 rule and neither has a published number: a seat carrying grievances
 * with ANYONE cannot form an alliance, and once what the world holds against
 * it passes GRIEVANCE_GANG others may declare on it without the usual
 * strength advantage. The threshold is stated in the table's own units — two
 * formal wars' worth — so it moves with the sourced magnitudes rather than
 * standing on a number of its own.
 */
export const GRIEVANCE_GANG = 2 * GRIEVANCE_WAR_FORMAL;
export function warWearinessPenalty(weariness: number): number {
  return Math.floor(Math.max(0, weariness) / WAR_WEARINESS_PER_AMENITY);
}

export const DOW_PROXIMITY = 9;
