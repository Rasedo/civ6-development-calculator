import type { GameState } from './types';
import { seatOf, isBarbSeat } from './seats';
import { DEDICATIONS, DED_EVENT_SCORE, ERA_LENGTH, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES, HEROIC_DEDICATIONS, DEDICATION_FAITH, DEDICATION_ERA_SCORE, DEDICATION_PAYOUTS_LIVE, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS, DED_MONUMENTALITY, GOLDEN_MOVE_BONUS } from '../data/seats';

// ---------------------------------------------------------------------------
// Era score / Ages.
// Unified civ ids: 0 = seat 0, r+1 = seat r (the civsAtWar convention).
// Every hook is a plain `+= const` (zero-draw). Ages: 0 Dark / 1 Normal /
// 2 Golden, assigned at each era boundary from the just-ended window's score.
// ---------------------------------------------------------------------------

/** Accrue era score for `seat`. Absent reads 0, so no save migration. */
export function addEraScore(state: GameState, seat: number, pts: number): void {
  const s = seatOf(state, seat);
  if (s) s.eraScore = (s.eraScore ?? 0) + pts;
}

/** Era boundary — runs right AFTER `state.turn += 1` in endTurn (the GPU
 *  mirrors at its own turn increment). At each ERA_LENGTH multiple every
 *  civ's Age for the NEW era comes from the just-ended window's score
 *  (S2), then the accumulators reset for the new window. */
export function eraBoundary(state: GameState): void {
  if (state.turn % ERA_LENGTH !== 0) return;
  // Civ 6 upgrades ROADS by era — the Ancient road has no bridges,
  // the Classical road does. Latched at the FIRST era boundary and never
  // cleared. Set here (rather than off a raw turn comparison) because this site
  // is already proven to fire at the same moment in both engines.
  state.roadBridges = true;
  for (let c = 0; c < state.seats.length; c++) {
    const seat = seatOf(state, c);
    if (!seat) continue;
    const s = seat.eraScore ?? 0;
    const was = seat.age ?? 1; // era 0 is Normal for everyone
    const now = s < ERA_DARK_T ? 0 : s >= ERA_GOLDEN_T ? 2 : 1;
    // DEDICATIONS. Each civ commits to one dedication per era —
    // except the HEROIC AGE, real Civ 6's reward for climbing straight out of
    // a DARK age into a GOLDEN one, which grants THREE. That test is why the
    // PREVIOUS age has to be substrate: `now` alone cannot distinguish a
    // Heroic Age from an ordinary Golden one.
    seat.prevAge = was;
    seat.age = now;
    seat.dedications = was === 0 && now === 2 ? HEROIC_DEDICATIONS : 1;
    // Commit to NAMED dedications. Real Civ 6 lets each civ pick;
    // there is no chooser on either seat and a roll would break the zero-draw
    // contract, so the pick is a STATELESS ROUND-ROBIN over the catalog keyed
    // on the era index — deterministic, identical on both engines, and it
    // exercises every dedication in turn rather than pinning one forever.
    // A HEROIC age takes the next `ded[c]` catalog entries (three).
    const era = Math.floor(state.turn / ERA_LENGTH);
    seat.dedicationPicks = Array.from({ length: seat.dedications }, (_, k) => (era + c + k) % DEDICATIONS.length);
  }
  for (let c = 0; c < state.seats.length; c++) {
    const seat = seatOf(state, c);
    if (seat) seat.eraScore = 0;  // the window resets for the new era
  }
}

/**
 * The DARK/NORMAL face of a civ's committed dedications — era score
 * paid off a specific EVENT. Real Civ 6's climb-out dedications pay in era
 * score, and each names its own trigger; a GOLDEN age pays a standing bonus
 * instead and so earns nothing here.
 *
 * `kind` is a catalog index (DED_MONUMENTALITY, ...). Every matching committed
 * dedication pays, so a HEROIC age holding the same dedication twice pays
 * twice. Zero-draw, integer-only; both engines call this at the same event
 * sites.
 */
export function dedicationEvent(state: GameState, civ: number, kind: number): void {
  if (!DEDICATION_PAYOUTS_LIVE) return;
  if (((seatOf(state, civ)?.age ?? 1)) === 2) return; // a GOLDEN age takes bonuses, not era score
  const picks = seatOf(state, civ)?.dedicationPicks;
  if (!picks) return;
  let n = 0;
  for (const p of picks) if (p === kind) n++;
  if (n > 0) addEraScore(state, civ, n * DED_EVENT_SCORE[kind]);
}

/** true when this civ's CURRENT age is a HEROIC age — it entered
 *  a Golden age directly from a Dark one. */
export function isHeroicAge(state: GameState, civ: number): boolean {
  return ((seatOf(state, civ)?.prevAge ?? 1)) === 0 && ((seatOf(state, civ)?.age ?? 1)) === 2;
}

/**
 * The per-turn DEDICATION yield a civ's commitments pay.
 * A GOLDEN (or HEROIC) age dedicates to a bonus — modeled as flat faith, the
 * Monumentality flavour — while a DARK or NORMAL age dedicates to CLIMBING,
 * which real Civ 6 pays in extra era score. Both scale with the dedication
 * COUNT, so a Heroic age is literally three times the commitment.
 */
export function dedicationFaith(state: GameState, civ: number): number {
  const age = (seatOf(state, civ)?.age ?? 1);
  if (age !== 2) return 0;
  return DEDICATION_FAITH * ((seatOf(state, civ)?.dedications ?? 1));
}

/** extra era score per turn while DARK or NORMAL — the
 *  climb-out dedication (the Golden-age twin of dedicationFaith). */
export function dedicationEraScore(state: GameState, civ: number): number {
  const age = (seatOf(state, civ)?.age ?? 1);
  if (age === 2) return 0;
  return DEDICATION_ERA_SCORE * ((seatOf(state, civ)?.dedications ?? 1));
}

/**
 * The GOLDEN-AGE face of a dedication — the standing bonus that
 * replaces the Dark/Normal era-score payout. SOURCED from the Civ 6 dedication
 * catalog:
 *   MONUMENTALITY        +2 Movement for all BUILDERS. (Faith-purchase of
 *                        civilians and the 30% purchase discount: NOT modelled.)
 *   FREE_INQUIRY         Eurekas provide an ADDITIONAL 10% of technology cost.
 *                        (Commercial Hub/Harbor gold adjacency also giving
 *                        Science: NOT modelled.)
 *   PEN_BRUSH_AND_VOICE  Inspirations provide an ADDITIONAL 10% of civic cost,
 *                        and each city gains +1 Culture per SPECIALTY district.
 *   EXODUS               +2 Movement for MISSIONARIES/APOSTLES and +4 Great
 *                        Prophet points per turn. (+2 charges on newly trained
 *                        ones: NOT modelled.)
 */
export function goldenDedication(state: GameState, civ: number, kind: number): boolean {
  if (civ < 0) return false; // B-24 (#79): BARBARIANS hold no dedications
  if (((seatOf(state, civ)?.age ?? 1)) !== 2) return false;
  const picks = seatOf(state, civ)?.dedicationPicks;
  return !!picks && picks.includes(kind);
}

/**
 * The MOVEMENT half of the golden dedications, keyed on the unit's OWN
 * seat so a seat in a Golden age gets it exactly as seat 0 does.
 *
 * SOURCE (Civilopedia, Gathering Storm):
 *   MONUMENTALITY — "If chosen at the start of a Golden Age, +2 Movement for
 *     all Builders."
 *   EXODUS OF THE EVANGELISTS — "If chosen at the start of a Golden Age, +2
 *     Movement for all Missionaries, Apostles, and Inquisitors." This roster
 *     has no INQUISITOR, so the pair below is the whole class.
 *
 * These two were implemented for #79, hunted, and reverted: scripted parity
 * went green but the off-script gate diverged on the `rng` DRAW COUNT at seed
 * 9015 t199, because TS kept movement points as STATE while the GPU kept none
 * and rebuilt `full_mp` inside every walker. #51/S5.1–S5.3 closed that split —
 * one resident MP pool, one reset rule, one step contract — so the bonus now
 * has exactly one place to live on each engine.
 */
export function goldenMoveBonus(state: GameState, unit: { type: string; seat: number }): number {
  const civ = isBarbSeat(unit.seat) ? -1 : unit.seat; // barbarians hold no dedications
  if (unit.type === 'BUILDER') {
    return goldenDedication(state, civ, DED_MONUMENTALITY) ? GOLDEN_MOVE_BONUS : 0;
  }
  if (unit.type === 'MISSIONARY' || unit.type === 'APOSTLE') {
    return goldenDedication(state, civ, DED_EXODUS) ? GOLDEN_MOVE_BONUS : 0;
  }
  return 0;
}

/** EXODUS golden — +4 Great Prophet points per turn. */
export function goldenProphetPoints(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_EXODUS) ? 4 : 0;
}

/** a Eureka (FREE_INQUIRY) or Inspiration (PEN_BRUSH_AND_VOICE)
 *  refunds an EXTRA 10% on top of BOOST_FRACTION. Techs read the first. */
export function goldenBoostBonus(state: GameState, civ: number, civic: boolean): number {
  return goldenDedication(state, civ, civic ? DED_PEN_BRUSH_AND_VOICE : DED_FREE_INQUIRY) ? 0.1 : 0;
}

/** PEN_BRUSH_AND_VOICE golden — +1 Culture per SPECIALTY district. */
export function goldenCulturePerDistrict(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_PEN_BRUSH_AND_VOICE) ? 1 : 0;
}

/** The loyalty-pressure factor the SOURCE civ's age grants its pop-pressure
 *  contributions. Missing entries (era 0, fresh saves) read Normal. */
export function agePressureFactor(state: GameState, civ: number): number {
  return AGE_PRESSURE[(seatOf(state, civ)?.age ?? 1)];
}

/** Governor titles a civ holds for `nCivics` completed civics. */
export function governorTitles(nCivics: number): number {
  return Math.min(GOV_MAX_TITLES, Math.floor(nCivics / GOV_CIVICS_PER_TITLE));
}

/** The STATELESS greedy pick — the `titles` LOWEST-loyalty cities.
 *  `qLoys` are QUANTIZED milli loyalties (Math.round(loy·1000) — ranking on
 *  raw f64 would be float-association-fragile across engines; the
 *  quantization lesson), ties broken by ARRAY position (the GPU mirrors
 *  with the slot index — slot order IS array order, #110). Returns picked
 *  indices. */
export function governorPicks(qLoys: number[], titles: number): Set<number> {
  const idx = qLoys.map((q, i) => [q, i] as const);
  idx.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return new Set(idx.slice(0, titles).map(([, i]) => i));
}

/**
 * Apply this turn's DEDICATION payouts for every civ. Called once
 * per turn from endTurn, right beside eraBoundary, so the GPU can mirror it at
 * the same position. A GOLDEN/HEROIC age pays faith; a DARK or NORMAL age pays
 * era score (the climb-out dedication). Both scale with the dedication COUNT,
 * so a Heroic age pays triple. Zero-draw, integer-only.
 *
 * `addFaith` is injected because seat 0's faith lives on GameState while
 * each seat keeps its own — the caller knows which accumulator to touch.
 */
export function applyDedications(state: GameState, addFaith: (civ: number, amount: number) => void): void {
  if (!DEDICATION_PAYOUTS_LIVE) return; // B-24 (#71): substrate live, payouts inert
  for (let c = 0; c < state.seats.length; c++) {
    const f = dedicationFaith(state, c);
    if (f > 0) addFaith(c, f);
    const es = dedicationEraScore(state, c);
    if (es > 0) addEraScore(state, c, es);
  }
}
