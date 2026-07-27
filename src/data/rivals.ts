/**
 * Rival civilization flavor + pacing constants (all eyeballed). Rivals are
 * scripted: real cities/units/territory on the map, with real production
 * queues, research, housing and border culture underneath.
 */

import { GAME_SPEED } from './constants';

export const RIVAL_LEADERS: { name: string; color: string; cityNames: string[] }[] = [
  { name: 'Rome', color: '#8e3db8', cityNames: ['Roma', 'Ostia', 'Ravenna', 'Neapolis', 'Capua', 'Verona'] },
  { name: 'Egypt', color: '#3db88e', cityNames: ['Thebes', 'Memphis', 'Giza', 'Elephantine', 'Sais', 'Tanis'] },
  { name: 'Norway', color: '#3d6ab8', cityNames: ['Nidaros', 'Bergen', 'Oslo', 'Tunsberg', 'Hamar', 'Stavanger'] },
  { name: 'Sumeria', color: '#b8823d', cityNames: ['Uruk', 'Ur', 'Eridu', 'Lagash', 'Nippur', 'Kish'] },
];

/** Rival city pop growth: fraction of the player's growth threshold. */
export const RIVAL_GROWTH_FACTOR = 0.75;
// C1-B3b: research consumers — production scales ×(1 + nTechs/PROD_DIV),
// city defense gains DEF_PER_TECH per researched tech (calibrated to land
// near the old techLevel formulas at turn 100).
export const RIVAL_PROD_DIV = 12;
export const RIVAL_DEF_PER_TECH = 3;
export const RIVAL_MAX_CITIES = 6;
/** Production stock gained per pop per turn (settlers). */
export const RIVAL_PROD_RATE = 0.5;
/** Military stock gained per pop per turn. */
export const RIVAL_MIL_RATE = 0.35;
/** P5/S3 (C-14): the player's exact settler curve — 48 + 18·(cities−1) at
 * Online speed. Rivals never bank settlers and single-queue them, so the
 * player's `cities − 1 + settlers + queued` term reduces to `cities − 1`. */
export const RIVAL_SETTLER_COST = (cities: number) =>
  Math.round(80 * GAME_SPEED) + Math.round(30 * GAME_SPEED) * Math.max(0, cities - 1);
// (P5/S4: RIVAL_BORDER_PERIOD died — rival borders grow on culture like
// the player's, rc.cultureBox vs borderGrowthCost.)
// (P5/S5: RIVAL_PANTHEON_TURN / RIVAL_RELIGION_TURN died — the pantheon
// costs PANTHEON_FAITH_COST from the rival's own faith, and religion needs
// the player's gates: pantheon + completed Holy Site + an earned Prophet.)
/** Auto-peace becomes possible after this many war turns. */
export const RIVAL_WAR_MIN_TURNS = 14;
/** The player may sue for peace after this many war turns. */
export const PEACE_MIN_WAR_TURNS = 8;
export const PEACE_GOLD_COST = (warTurns: number) => 150 + 10 * warTurns;
export const RIVAL_CITY_MAX_HP = 200;

// --- deeper-opponent pacing ---------------------------------------------------
/** Rival cities work their best owned tiles out to this ring. */
export const RIVAL_WORK_RADIUS = 3;
/** Fraction of a rival city's tile production banked toward settlers / military. */
export const RIVAL_PROD_TO_SETTLER = 0.3;
export const RIVAL_PROD_TO_MILITARY = 0.22;

// --- loyalty -------------------------------------------------------------------
export const LOYALTY_MAX = 100;
/** City centers exert population pressure out to this many tiles. */
export const LOYALTY_RANGE = 9;
/** Max per-turn swing from population pressure. P4/D-18: real Civ 6 ±20. */
export const LOYALTY_PRESSURE_SCALE = 20;
/** Per-turn loyalty by amenity tier name. P4/D-18: real Civ 6 ±6/±3. */
export const LOYALTY_AMENITY: Record<string, number> = {
  Ecstatic: 6,
  Happy: 3,
  Content: 0,
  Displeased: -3,
  Unhappy: -6,
};

// --- war weariness (B-15) ------------------------------------------------------
// A flat per-turn amenity drag while at war, decaying 4× faster in peace, real-
// anchored to Civ 6's war-weariness unhappiness. Accrual is per-turn-at-war
// (combat-location sensitivity is not cheaply/deterministically detectable in
// this model, so the brief's flat option is used). The accumulator is an INTEGER
// (turn counter), so the derived amenity penalty is integer too — no float
// association risk. Applied empire-wide through the existing amenity aggregation
// for the player AND, symmetrically, per rival civ.
/** Accumulator gained per turn while at war with any live opponent. */
export const WAR_WEARINESS_PER_TURN = 1;
/** Accumulator shed per turn at peace (4× the accrual rate). */
export const WAR_WEARINESS_DECAY = 4;
/** Accumulator points per −1 amenity. With the B-22 casus-belli accrual
 *  multiplier a SURPRISE rival↔rival war accrues 2/turn → −1 amenity per 4
 *  war-turns (per 8 for a FORMAL one). Kept at 8 (not lowered): the CAP + the
 *  ×2 multiplier already deliver the B-15 magnitude raise for rival-rival wars
 *  without a per-turn change that would also steepen the player war. */
export const WAR_WEARINESS_PER_AMENITY = 8;
/** Accumulator ceiling → caps the amenity penalty at CAP / PER_AMENITY (= −4).
 *  RAISED 16→32 (#69, closes B-15): a long un-sued war now reaches the real
 *  Civ-6-magnitude −4 empire penalty (−1 per 8 war-turns for the player and
 *  FORMAL rival wars; −1 per 4 for a SURPRISE rival↔rival war via the ×2
 *  accrual). The #55-S3 deferral (a −3/−4-tier divergence sighting on seed
 *  9092 under cap 32 — AUDIT G-8) is re-verified/hunted with this change.
 *  BOTH engines clamp the ACCUMULATOR at the cap (game.ts/rivals.ts accrual
 *  Math.min; the GPU inc clamp) — warWearinessPenalty's Math.min is
 *  belt-and-braces, never the live clamp. */
export const WAR_WEARINESS_CAP = 32;
/** B-22 (task #55 S3): rival↔rival war-weariness accrual multipliers — the
 *  modeled casus-belli benefit. A SURPRISE war (no prior denouncement) is TWICE
 *  as wearying as a FORMAL one (denounced ≥ RR_FORMAL_MIN_TURNS earlier),
 *  matching real Civ 6's reduced grievances/ww for justified wars. Applies to
 *  the rival↔rival axis ONLY: a war WITH THE PLAYER (either seat) accrues at the
 *  baseline (×1, the S2 rate) since the player has no denounce/grievance verb —
 *  keeping the fixture-critical player path pristine. Integer, no float assoc. */
export const WW_SURPRISE_MULT = 2;
export const WW_FORMAL_MULT = 1;
/** B-24 (task #68, gpu/GOVERNORS_DESIGN.md): era score / Ages. The game is
 *  divided into fixed ERA_LENGTH-turn eras (no per-civ tech-era drift —
 *  recorded residual). Each civ accrues an INTEGER era score from zero-draw
 *  "historic moment" events; the accumulator resets at every era boundary
 *  (S2 reads the just-ended era's score to set the civ's Age). */
export const ERA_LENGTH = 50;
export const ERA_SCORE_FOUND = 2; // founded a city
export const ERA_SCORE_CONQUER = 3; // gained a city by capture/flip/transfer
export const ERA_SCORE_WONDER = 3; // completed a world wonder
export const ERA_SCORE_PANTHEON = 1;
export const ERA_SCORE_RELIGION = 2;
export const ERA_SCORE_GP = 1; // earned a Great Person
/** B-24 S2: age thresholds on the just-ended era window's score — Dark below
 *  DARK_T, Golden at/above GOLDEN_T, Normal between. PINNED FROM S1 EVIDENCE
 *  (24 scripted seeds × 5 eras × 3 civs, pooled q25 1 / med 6 / q75 9):
 *  Dark 31% / Normal 47% / Golden 22% of in-gate windows — all three ages
 *  occur robustly. Era 0 is Normal for everyone (createGame default). */
export const ERA_DARK_T = 3;
export const ERA_GOLDEN_T = 10;
/** B-24 S2: loyalty-pressure factor by the SOURCE civ's age (Dark/Normal/
 *  Golden). Halves are exact in f32 AND f64 (dyadic), so the modulated
 *  pressure sums stay association-free like the integer sums they replace. */
export const AGE_PRESSURE = [0.5, 1.0, 1.5];
/** B-24 S3: governors as STATELESS loyalty anchors. A civ holds
 *  min(GOV_MAX_TITLES, floor(civics / GOV_CIVICS_PER_TITLE)) governors; each
 *  turn they sit in its LOWEST-loyalty cities (quantized milli, ties by
 *  acquisition order) and add GOVERNOR_LOYALTY to that city's delta.
 *  RESIDUALS: establishment turns, promotions, non-loyalty abilities. */
export const GOV_CIVICS_PER_TITLE = 10;
export const GOV_MAX_TITLES = 5;
/** B-24 (#71): dedications granted on a HEROIC age (Dark -> Golden). Real
 * Civ 6 grants three; every other transition grants one. */
/**
 * A-5r (#71): the rival TILE-PURCHASE master switch, landed INERT (the
 * B-24/S1 substrate-then-flip pattern). The cost curve, the shared
 * border-candidate pick and both engines' mirrors are IN; only the scripted
 * purchase is gated off.
 *
 * WHY: with it live the engines bought tiles on different turns (seed 9158:
 * ~98 gold of rival treasury divergence by t157), which needs its own hunt
 * inside the gold ladder. Flipping this to `true` is the remaining A-5r step.
 */
export const RIVAL_TILE_BUY_LIVE = true; // #71: LIVE — hunted 2026-07-27

/** B-8 (#71): the rival ADMIRAL war-march switch, landed INERT — a marching
 * admiral is a CIVILIAN and capturable (B-31) where a parked one is not, and
 * the engines diverged on it (seed 9287 t235). Flip when its hunt lands. */
export const ADMIRAL_MARCH_LIVE = true; // #71: LIVE — hunted 2026-07-27

/** B-24 (#71): the dedication PAYOUT switch, landed INERT. The substrate —
 * prevAges (the Heroic-age test) and the dedication COUNT — is live and
 * parity-exact; only the per-turn faith / era-score payouts are gated, because
 * they feed rival faith and therefore purchases, and the engines diverged on a
 * downstream rival unit (seed 9287 t235). Flip when its hunt lands. */
export const DEDICATION_PAYOUTS_LIVE = true; // #71: LIVE — hunted 2026-07-26

export const HEROIC_DEDICATIONS = 3;
/** Faith per turn per dedication while in a GOLDEN/HEROIC age (the
 * Monumentality flavour — a Golden age dedicates to a BONUS). */
export const DEDICATION_FAITH = 2;
/** Era score per turn per dedication while DARK or NORMAL — real Civ 6's
 * climb-out dedications pay in era score, not yields. */
export const DEDICATION_ERA_SCORE = 1;

export const GOVERNOR_LOYALTY = 8;
/** B-22 (task #55 S3): a rival↔rival war is FORMAL iff the aggressor denounced
 *  the target at least this many turns before declaring; otherwise SURPRISE. */
export const RR_FORMAL_MIN_TURNS = 5;

/**
 * B-22 (2026-07-27): ALLIANCES on the rival<->rival axis. Real Civ 6 requires a
 * Declaration of Friendship first and then an Alliance, and ALLIES CANNOT
 * DECLARE WAR ON EACH OTHER — that last rule is what this models. The
 * friendship prerequisite is stylized as "at peace for RR_ALLY_MIN_PEACE turns
 * with NO denouncement in either direction"; a denouncement or a war breaks it
 * immediately. Zero-draw and symmetric, exactly like `atWarRivals`.
 */
export const RR_ALLY_MIN_PEACE = 30;

/**
 * B-22 (2026-07-27): WARMONGER COST. Real Civ 6 makes aggression carry a
 * diplomatic price — declaring war and taking cities generate GRIEVANCES, and
 * a warmonger is shunned and ganged up on. Modeled as a per-civ score:
 * +RR_WARMONGER_DOW on declaring, +RR_WARMONGER_CAPTURE on taking a rival
 * city, decaying by 1 per turn while NOT at war (floor 0). Two costs follow —
 * a civ with any grievances cannot form an ALLIANCE, and once it passes
 * RR_WARMONGER_GANG others may declare on it WITHOUT the usual strength
 * advantage. Zero-draw, integer-only.
 */
export const RR_WARMONGER_DOW = 4;
export const RR_WARMONGER_CAPTURE = 3;
export const RR_WARMONGER_GANG = 6;
/** Empire-wide amenity penalty (≥0) for a weariness accumulator value. */
export function warWearinessPenalty(weariness: number): number {
  return Math.floor(Math.min(weariness, WAR_WEARINESS_CAP) / WAR_WEARINESS_PER_AMENITY);
}

// --- A-19/B-33 rival↔rival war (task #55 S2) ----------------------------------
// The pairwise auto-DoW re-derives the player auto-DoW's DETERMINISTIC gates
// (proximity + strength ratio) and DROPS its RNG probability gate → ZERO-DRAW
// (documented deviation; the player pair keeps its RNG). Anti-thrash is the
// aggressor's own war-weariness: a war-weary civ (ww ≥ RR_DOW_WW_MAX) never
// opens a NEW front, and a pair sues out once EITHER side's ww exceeds
// RR_PEACE_WW — so after a ww-triggered peace the aggressor's ww (> RR_PEACE_WW
// > RR_DOW_WW_MAX) blocks an immediate re-declaration until it decays at peace.
/** Max distance (closest city pair) for a pairwise DoW — the player gate. */
export const RR_DOW_PROXIMITY = 9;
/** Aggressor strength must exceed target × this — the player gate (1.3). */
export const RR_DOW_STRENGTH_RATIO = 1.3;
/** An aggressor at or above this war-weariness will not open a new war. */
export const RR_DOW_WW_MAX = 6;
/** A warring pair sues out once EITHER side's war-weariness exceeds this. */
export const RR_PEACE_WW = 10;
