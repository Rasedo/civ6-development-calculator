import type { GameState } from './types';
import { civEraIndex, seatBuildingSum } from './city';
import { cityDistrictSum } from './yields';
import { seatOf, isBarbSeat, isCiv, citiesOf } from './seats';
import { seatWonderSum } from './wonders';
import { UNITS } from '../data/units';
import { DED_AUTOMATON, DED_DRACONES, DED_SKY, DED_STEAM, SKY_EUREKAS } from '../data/seats';
import { TECHS } from '../data/techs';
import { spawnUnit } from './units';
import { BUILDINGS, BUILDING_ERA_INDEX } from '../data/buildings';
import { GW_BUILDINGS } from '../data/greatPeople';
import { INDUSTRIAL_ERA_INDEX } from '../data/techs';
import { ERA_SCORE_MOMENT_MIN, DEDICATION_ERAS, DED_EVENT_SCORE, ERA_LENGTH, ERA_DARK_T, ERA_GOLDEN_T, AGE_PRESSURE, GOV_CIVICS_PER_TITLE, GOV_MAX_TITLES, HEROIC_DEDICATIONS, DEDICATION_PAYOUTS_LIVE, DED_FREE_INQUIRY, DED_PEN_BRUSH_AND_VOICE, DED_EXODUS, DED_MONUMENTALITY, GOLDEN_MOVE_BONUS } from '../data/seats';


/** Pay era score for `count` moments each worth `per`. CIV6 (Taj Mahal):
 *  a moment worth ERA_SCORE_MOMENT_MIN or more pays its owner one more,
 *  so the per-moment value has to survive as far as this call. */
/** CIV6 (Great People): the WORLD era — "the era of the Great Person and the
 *  World Era when the Great Person appears in the queue". The furthest any seat
 *  has reached, which is also what the World Congress gates on. */
export function worldEraIndex(state: GameState): number {
  let era = -1;
  for (const sx of state.seats) {
    const e = civEraIndex(sx.research.techs, sx.research.civics);
    if (e > era) era = e;
  }
  return era;
}

export function addEraScore(state: GameState, seat: number, per: number, count = 1): void {
  const s = seatOf(state, seat);
  if (!s || count <= 0) return;
  s.eraScore = (s.eraScore ?? 0) + per * count;
  if (per >= ERA_SCORE_MOMENT_MIN) {
    s.eraScore += seatWonderSum(state, seat, 'eraScorePerMoment') * count;
  }
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
    // Commit to NAMED dedications. Real Civ 6 lets each civ pick from the
    // WINDOW its world era offers; there is no chooser on either seat and a
    // roll would break the zero-draw contract, so the pick is a STATELESS
    // ROUND-ROBIN over that window keyed on the era index — deterministic,
    // identical on both engines, and it exercises every offered dedication in
    // turn rather than pinning one forever. A HEROIC age takes the next
    // `ded[c]` entries of the same window (three).
    const era = Math.floor(state.turn / ERA_LENGTH);
    const window = DEDICATION_ERAS[Math.min(era, DEDICATION_ERAS.length - 1)];
    seat.dedicationPicks = window.length === 0
      ? []
      : Array.from({ length: seat.dedications }, (_, k) => window[(era + c + k) % window.length]);
    commitGoldenGrants(state, c, era);
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
  if (n > 0) addEraScore(state, civ, DED_EVENT_SCORE[kind], events * n);
}

/**
 * Every dedication a COMPLETED BUILDING pays, at one site both engines call.
 * CIV6: Heartbeat of Steam "+2 Era Score for each Industrial or later building
 * constructed"; Free Inquiry "+1 Era Score ... when constructing a building
 * which provides Science"; Pen, Brush and Voice "+1 Era Score ... when you
 * construct a building with a Great Work slot".
 */
export function buildingDedications(state: GameState, seat: number, buildingId: string): void {
  if ((BUILDING_ERA_INDEX[buildingId] ?? 0) >= INDUSTRIAL_ERA_INDEX) dedicationEvent(state, seat, DED_STEAM);
  // CIV6 (Sky and Stars): "+1 Era Score for each Aerodrome building
  // constructed."
  if (BUILDINGS[buildingId]?.district === 'AERODROME') dedicationEvent(state, seat, DED_SKY);
  if ((BUILDINGS[buildingId]?.yields?.science ?? 0) > 0) dedicationEvent(state, seat, DED_FREE_INQUIRY);
  if ((GW_BUILDINGS as readonly string[]).includes(buildingId)) dedicationEvent(state, seat, DED_PEN_BRUSH_AND_VOICE);
}

/** CIV6 (Hic Sunt Dracones, dark face): "+1 Era Score each time you kill a
 *  non-Barbarian naval unit in combat." The killer must be a MAJOR — a
 *  city-state or a camp that lands the blow holds no dedications. */
export function unitKillEvent(
  state: GameState,
  killerSeat: number,
  killer: { type: string } | undefined,
  victim: { type: string; seat: number },
): void {
  if (!isCiv(killerSeat) || isBarbSeat(victim.seat)) return;
  // CIV6 (Hic Sunt Dracones, dark face): "+1 Era Score each time you kill a
  // non-Barbarian Naval unit in combat."
  if (UNITS[victim.type]?.naval) dedicationEvent(state, killerSeat, DED_DRACONES);
  // CIV6 (Automaton Warfare): "+1 Era Score each time you kill a non-Barbarian
  // unit with a Giant Death Robot."
  if (killer && UNITS[killer.type]?.gdr) dedicationEvent(state, killerSeat, DED_AUTOMATON);
}

/**
 * The GOLDEN dedications that pay ONCE, at the moment the face is committed:
 * Sky and Stars' era-keyed Eurekas and Automaton Warfare's free Giant Death
 * Robot. Everything else a golden face does is a standing read.
 */
function commitGoldenGrants(state: GameState, seat: number, era: number): void {
  if (!goldenDedication(state, seat, DED_SKY) && !goldenDedication(state, seat, DED_AUTOMATON)) return;
  const owner = seatOf(state, seat);
  if (!owner) return;
  if (goldenDedication(state, seat, DED_SKY)) {
    for (const id of SKY_EUREKAS[era] ?? []) {
      if (!TECHS[id]) continue;
      if (owner.research.techs.includes(id) || owner.research.boosted.includes(id)) continue;
      owner.research.boosted.push(id);
    }
  }
  if (goldenDedication(state, seat, DED_AUTOMATON)) {
    const capital = owner.cities.find((c) => c.isCapital);
    const chassis = Object.keys(UNITS).find((u) => UNITS[u].gdr);
    if (capital && chassis) spawnUnit(state, chassis, capital.centerIndex, seat);
  }
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

export function governorTitles(nCivics: number, bonus = 0): number {
  return Math.min(GOV_MAX_TITLES, Math.floor(nCivics / GOV_CIVICS_PER_TITLE) + bonus);
}

/** CIV6 (Government Plaza, and every building in it): "Awards +1 Governor
 *  Title." Titles beyond the civics ladder, over every city this seat holds —
 *  a pillaged Plaza pays none of them. */
export function grantedGovernorTitles(state: GameState, seat: number): number {
  let n = seatBuildingSum(state, seat, 'govTitle');
  for (const city of citiesOf(state, seat)) n += cityDistrictSum(state, city, 'governorTitle');
  return n;
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
export function governorPicks(qLoys: number[], titles: number, blocked?: ReadonlySet<number>): Set<number> {
  const idx = qLoys.map((q, i) => [q, i] as const).filter(([, i]) => !blocked?.has(i));
  idx.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return new Set(idx.slice(0, titles).map(([, i]) => i));
}

