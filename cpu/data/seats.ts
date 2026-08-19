

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
 * The WORLD CONGRESS. Sourced (Civilopedia GS "World Congress"):
 * the Congress begins meeting once the game reaches the MEDIEVAL era and
 * convenes every 30 turns on Standard speed. Resolutions are voted on with
 * DIPLOMATIC FAVOR, and ties go to whoever spent the greater PERCENTAGE of
 * their favor. Diplomatic Victory needs 20 Diplomatic Victory Points (wiki,
 * "Victory (Civ6)").
 *
 * TWO RECORDED STYLIZATIONS, both because the real thing needs subsystems that
 * do not exist here:
 *  1. VOTE SIZE. Real Civ 6 lets each civ choose how much favor to commit.
 *     There is no chooser on either seat (and a roll would break the zero-draw
 *     contract), so every civ commits ALL its favor. The tie-break by
 *     percentage-of-favor-spent is then always 100% and resolves to civ id —
 *     kept in the code anyway so the rule is right when a chooser arrives.
 *  2. DVP SOURCE. Real Civ 6 awards Diplomatic Victory Points mainly through
 *     Emergencies and Scored Competitions, neither of which is modeled. GS
 *     does also award them through a late-game World Congress resolution, so
 *     awarding DVP to the resolution winner is faithful in SHAPE while
 *     overstating the rate. Recorded, not hidden.
 */
export const CONGRESS_INTERVAL = 30;
export const CONGRESS_MIN_ERA = 2;
export const DVP_PER_RESOLUTION = 1;
/** Diplomatic Victory threshold (real Civ 6 GS: 20 points). */
export const DIPLO_VICTORY_POINTS = 20;

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
 * both engines; the rest of the catalog (To Arms!, Hic Sunt Dracones, Reform
 * the Coinage, Heartbeat of Steam, and the four that need spies / air units /
 * artifacts / Giant Death Robots) stays a recorded residual.
 *
 *   0 MONUMENTALITY       +1 era score per specialty DISTRICT completed
 *   1 FREE_INQUIRY        +1 era score per EUREKA (tech boost) triggered
 *   2 PEN_BRUSH_AND_VOICE +1 era score per INSPIRATION (civic boost) triggered
 *   3 EXODUS_OF_THE_EVANGELISTS  +2 era score per city converted to your religion
 *
 * The GOLDEN face of each pays its sourced standing bonuses (movement,
 * boost overflow, culture per district, prophet points, charges, the
 * Monumentality faith purchases + 30% discount) — see `eras.goldenDedication`'s
 * callers. There is NO flat per-turn payout on either face in real Civ 6.
 */
export const DEDICATIONS = ['MONUMENTALITY', 'FREE_INQUIRY', 'PEN_BRUSH_AND_VOICE', 'EXODUS_OF_THE_EVANGELISTS'] as const;
export const DED_MONUMENTALITY = 0;
export const DED_FREE_INQUIRY = 1;
export const DED_PEN_BRUSH_AND_VOICE = 2;
export const DED_EXODUS = 3;
export const DED_EVENT_SCORE = [1, 1, 1, 2] as const;

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
