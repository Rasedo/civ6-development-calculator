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
/** Accumulator points per −1 amenity. Deliberately gentle: the SCRIPTED player
 *  never sues for peace, so rival-initiated wars run their full RIVAL_WAR_MIN
 *  course — a steep penalty would collapse the passive player's loyalty and
 *  empty the scripted fixture. −1 amenity per 8 war-turns keeps the drag real
 *  without inducing collapse (off-script/RL agents that make peace shed it). */
export const WAR_WEARINESS_PER_AMENITY = 8;
/** Accumulator ceiling → caps the amenity penalty at CAP / PER_AMENITY (= −2). */
export const WAR_WEARINESS_CAP = 16;
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
