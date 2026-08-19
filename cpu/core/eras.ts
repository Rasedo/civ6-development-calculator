import type { GameState } from './types';
import { seatOf, isBarbSeat, isCiv } from './seats';
import { UNITS } from '../data/units';
import { DED_DRACONES } from '../data/seats';
import { DEDICATIONS, DED_EVENT_SCORE, ERA_LENGTH, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES, HEROIC_DEDICATIONS, DEDICATION_PAYOUTS_LIVE, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS, DED_MONUMENTALITY, GOLDEN_MOVE_BONUS } from '../data/seats';


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
export function dedicationEvent(state: GameState, civ: number, kind: number, events = 1): void {
  if (!DEDICATION_PAYOUTS_LIVE || events <= 0) return;
  if (((seatOf(state, civ)?.age ?? 1)) === 2) return; // a GOLDEN age takes bonuses, not era score
  const picks = seatOf(state, civ)?.dedicationPicks;
  if (!picks) return;
  let n = 0;
  for (const p of picks) if (p === kind) n++;
  if (n > 0) addEraScore(state, civ, events * n * DED_EVENT_SCORE[kind]);
}

/** CIV6 (Hic Sunt Dracones, dark face): "+1 Era Score each time you kill a
 *  non-Barbarian naval unit in combat." The killer must be a MAJOR — a
 *  city-state or a camp that lands the blow holds no dedications. */
export function navalKillEvent(state: GameState, killerSeat: number, victim: { type: string; seat: number }): void {
  if (!isCiv(killerSeat) || isBarbSeat(victim.seat)) return;
  if (!UNITS[victim.type]?.naval) return;
  dedicationEvent(state, killerSeat, DED_DRACONES);
}

export function isHeroicAge(state: GameState, civ: number): boolean {
  return ((seatOf(state, civ)?.prevAge ?? 1)) === 0 && ((seatOf(state, civ)?.age ?? 1)) === 2;
}

/**
 * The GOLDEN-AGE face of a dedication — the standing bonus that
 * replaces the Dark/Normal era-score payout. SOURCED from the Civ 6 dedication
 * catalog:
 *   MONUMENTALITY        +2 Movement for all BUILDERS; Builders and Settlers
 *                        may be faith-purchased and are 30% cheaper to
 *                        purchase with Faith and Gold.
 *   FREE_INQUIRY         Eurekas provide an ADDITIONAL 10% of technology cost,
 *                        and Commercial Hub/Harbor GOLD adjacency also pays
 *                        Science.
 *   PEN_BRUSH_AND_VOICE  Inspirations provide an ADDITIONAL 10% of civic cost,
 *                        and each city gains +1 Culture per SPECIALTY district.
 *   EXODUS               +2 Movement for MISSIONARIES/APOSTLES, +4 Great
 *                        Prophet points per turn, and newly trained ones get
 *                        +2 Charges.
 */
export function goldenDedication(state: GameState, civ: number, kind: number): boolean {
  if (civ < 0) return false; // BARBARIANS hold no dedications
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
 * Model movement points twice and the off-script gate diverges on the `rng`
 * DRAW COUNT, not on a yield. Both engines hold ONE resident MP pool (`unit_mp` against its `unit_mp_full` ceiling), with
 * one reset rule and one step contract, so the bonus has exactly one place to
 * live on each side.
 */
export function goldenMoveBonus(state: GameState, unit: { type: string; seat: number; embarked?: boolean }): number {
  const civ = isBarbSeat(unit.seat) ? -1 : unit.seat; // barbarians hold no dedications
  if (unit.type === 'BUILDER') {
    return goldenDedication(state, civ, DED_MONUMENTALITY) ? GOLDEN_MOVE_BONUS : 0;
  }
  if (unit.type === 'MISSIONARY' || unit.type === 'APOSTLE') {
    return goldenDedication(state, civ, DED_EXODUS) ? GOLDEN_MOVE_BONUS : 0;
  }
  /* CIV6 (Hic Sunt Dracones, Golden face): "+2 Movement for naval and
     embarked units." */
  if (UNITS[unit.type]?.naval || unit.embarked) {
    return goldenDedication(state, civ, DED_DRACONES) ? GOLDEN_MOVE_BONUS : 0;
  }
  return 0;
}

export function goldenProphetPoints(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_EXODUS) ? 4 : 0;
}

/** CIV6 (GS Civilopedia, Monumentality, Golden face): "Builders and Settlers
 *  are 30% cheaper to purchase with Faith and Gold." A PURCHASE price rule
 *  only — production-queue costs are untouched. Callers multiply LAST
 *  (`base * GOLD_PURCHASE_MULT * this`) so both engines share one
 *  association. */
export function monumentalityBuyMult(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_MONUMENTALITY) ? 0.7 : 1;
}

export function goldenBoostBonus(state: GameState, civ: number, civic: boolean): number {
  return goldenDedication(state, civ, civic ? DED_PEN_BRUSH_AND_VOICE : DED_FREE_INQUIRY) ? 0.1 : 0;
}

export function goldenCulturePerDistrict(state: GameState, civ: number): number {
  return goldenDedication(state, civ, DED_PEN_BRUSH_AND_VOICE) ? 1 : 0;
}

export function agePressureFactor(state: GameState, civ: number): number {
  return AGE_PRESSURE[(seatOf(state, civ)?.age ?? 1)];
}

export function governorTitles(nCivics: number): number {
  return Math.min(GOV_MAX_TITLES, Math.floor(nCivics / GOV_CIVICS_PER_TITLE));
}

/** The STATELESS greedy pick — the `titles` LOWEST-loyalty cities.
 *  CIV6 (R&F, sourced): a governor's +8 Loyalty applies the moment they are
 *  ASSIGNED — the 5-turn establishment clock gates only their PROMOTIONS,
 *  which this model does not carry. A per-turn reassignment therefore moves
 *  the loyalty bonus instantly, exactly as reassignment does in the real
 *  game; no establishment state is needed until promotions exist.
 *  `qLoys` are QUANTIZED milli loyalties (Math.round(loy·1000) — ranking on
 *  raw f64 would be float-association-fragile across engines; the
 *  quantization lesson), ties broken by ARRAY position (the GPU mirrors
 *  with the slot index — slot order IS array order). Returns picked
 *  indices. */
export function governorPicks(qLoys: number[], titles: number): Set<number> {
  const idx = qLoys.map((q, i) => [q, i] as const);
  idx.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return new Set(idx.slice(0, titles).map(([, i]) => i));
}

