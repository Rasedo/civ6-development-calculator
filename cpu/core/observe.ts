/**
 * WHAT A SEAT SEES — the observation vector a policy decides from.
 *
 * A CROSS-ENGINE CONTRACT, not a convenience: `gpu/core/env.py`'s
 * BatchEnv.observe renders the identical layout from its own planes, the gate
 * asserts the two vectors equal every turn per seat, and `policy/ladder.py`
 * slices both by the same block order. Change the layout here and the twin
 * moves in the same commit, or the gate fails on the name.
 *
 * Reads ONLY through the seat-generic accessors, so it is one renderer for
 * every seat.
 */
import type { City, CityState, CityStateQuest, GameState, QueueItem } from './types';
import { atWarWithAny, citiesOf, civsAtWar, isBarbSeat, seatOf, tileCity, tileSeat, warTurnsWith } from './seats';
import { seatStrength, seatProximity } from './phase';
import { WARMONGER_GANG } from '../data/seats';
import { envoysOf, hasMet } from './cityStates';
import { effectiveResearchCostIn } from './boosts';
import { goldenBoostBonus } from './eras';
import { itemCost, districtCostIn, settlerCost } from './game';
import { builderCost, settlerCount } from './units';
import { growthFoodNeeded, borderGrowthCost } from '../data/constants';
import { TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { CIVICS } from '../data/civics';

/**
 * The seat the ctx block's PAIRWISE columns (proximity, gang, aggression,
 * peaceTurns) are measured against. The wire carries ONE such axis, and this
 * is the seat on its far side; that seat's own row would be self-referential,
 * so it renders zero. An unfinished wire, not a rule — nothing in the engine
 * gives this seat any other standing.
 */
const CTX_PAIR_SEAT = 0;

/** This seat's live quest at a city-state, if any — one seat-keyed store,
 *  whatever the seat. */
export function questFor(cityState: CityState, seat: number): CityStateQuest | null {
  return cityState.seatQuest?.[seat] ?? null;
}

export function observeSeat(state: GameState, seat: number, cityMax: number, horizon: number, cityStateMax?: number): number[] {
  const s = seatOf(state, seat);
  const cities = citiesOf(state, seat);
  const nTech = Math.max(Object.keys(TECHS).length, 1);
  const nCivic = Math.max(Object.keys(CIVICS).length, 1);
  const emp: number[] = [
    state.turn / horizon,
    (s?.research.techs.length ?? 0) / nTech,
    (s?.research.civics.length ?? 0) / nCivic,
    (s?.research.techProgress ?? 0) / 50.0,
    (s?.research.civicProgress ?? 0) / 50.0,
    settlerCount(state, seat),
    cities.reduce((n: number, c: City) => n + c.queue.filter((q) => q.kind === 'settler').length, 0),
    cities.length / cityMax,
    Math.min((s?.treasury ?? 0) / 200.0, 5.0),
    (s?.envoysAvailable ?? 0) / 5.0,
    (s?.influencePoints ?? 0) / 100.0,
    state.barbSeat.camps.length / 5.0,
    state.units.filter((u) => isBarbSeat(u.seat)).length / 10.0,
    state.units.filter((u) => u.seat === seat).length / 10.0,
    // Army COMPOSITION. The ladder trains ranged while the
    // army holds melee, so a bare unit COUNT cannot express the decision.
    state.units.filter((u) => u.seat === seat && (UNITS[u.type]?.ranged?.strength ?? 0) > 0).length / 10.0,
  ];
  // S1(c): FIXED S slots by t0 id, ZEROS when captured (the trace
  // tables' own convention — iterating the live array narrowed the vector
  // after a CS capture). Each slot renders THE SEAT'S OWN view: met,
  // envoys and quest are all seat-keyed stores, one row per seat.
  const cityState: number[] = [];
  const nCs = cityStateMax ?? (state.cityStates ?? []).length;
  for (let i = 0; i < nCs; i++) {
    const c = (state.cityStates ?? []).find((x) => x.id === i);
    if (!c) { cityState.push(0, 0, 0); continue; }
    cityState.push(
      hasMet(c, seat) ? 1 : 0,
      envoysOf(c, seat) / 6.0,
      questFor(c, seat) ? 1 : 0,
    );
  }
  // THE OPPONENT BLOCK, seat-symmetric: every OTHER civ seat in ascending
  // seat order, and the war field is MY war with that opponent. For seat 0
  // this is seats 1..R, which is what it has always been; for any other seat
  // the slots are every civ but itself, read from its own point of view.
  //
  // `gpu/core/env.py:BatchEnv.observe` renders the identical layout — the two
  // engines must move together here, and the gate compares them field for
  // field before every step.
  const riv: number[] = [];
  for (const o of state.seats) {
    if (o.seat === seat) continue;
    riv.push(
      civsAtWar(state, o.seat, seat) ? 1 : 0,
      warTurnsWith(state, seat, o.seat) / 14.0,
      o.cities.length / 6.0,
    );
  }
  const per: number[] = [];
  for (let i = 0; i < cityMax; i++) {
    const c = cities[i];
    if (!c) { per.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0); continue; }  // #51/S8.4c: 10 per slot
    const head = c.queue[0];
    per.push(
      1,
      c.population / 10.0,
      c.foodBox / Math.max(growthFoodNeeded(c.population), 1),
      head ? head.progress / Math.max(itemCost(head), 1) : 0,
      c.cultureBox / Math.max(borderGrowthCost(c.tilesAcquired), 1),
      state.map.tiles.filter((t) => tileSeat(t) === seat && tileCity(t) === c.id).length / 20.0,
      c.hp / 200.0,
      (c.loyalty ?? 100) / 100.0,
      head ? 1 : 0,
      // The production LADDER branches on isCapital (only
      // the capital queues a settler) — nine floats could not say which
      // city it was talking to.
      c.isCapital ? 1 : 0,
    );
  }
  // EFFECTIVE research cost per option — the quantity the
  // decision uses, not the boost flag it derives from. Emitting flags would
  // force the policy to apply `boosted ? base*(1-frac) : base` itself, and that
  // formula is a RULE: it belongs in the engine, or a rule leaks into the
  // policy and the two drift.
  //
  // FULL WIDTH, unmasked, on purpose. Legality lives in the MASK — one source
  // of truth each. What the full vector buys is PLANNING: a boosted tech
  // several prereqs away should steer a policy toward that branch now, and a
  // mask-to-frontier vector would be EMPTY whenever a research slot is busy.
  // The three ESCALATING production costs, in the SAME slot
  // the GPU emits them — after the per-city block, before the research costs.
  // Everything else a production pick needs is static rules data the ladder
  // already loads; static data is not state.
  const esc = [
    districtCostIn(s?.research ?? { techs: [], civics: [] } as never) / 1000,
    settlerCost(state, seat) / 1000,
    builderCost(state, seat) / 1000,
  ];
  const rs = s?.research;
  const gT = goldenBoostBonus(state, seat, false);
  const gC = goldenBoostBonus(state, seat, true);
  const costT = Object.values(TECHS).map((t) =>
    (rs ? effectiveResearchCostIn(rs, t.id, t.cost, gT) : t.cost) / 1000);
  const costC = Object.values(CIVICS).map((c) =>
    (rs ? effectiveResearchCostIn(rs, c.id, c.cost, gC) : c.cost) / 1000);
  // S1(a): the CTX block — ladder.CTX_FIELDS, RAW and unscaled (the
  // ladder compares these exactly; a /10 scale does not round-trip
  // bit-stably in f64). Formulas are the SCRIPTED SITES' own — the GPU twin
  // is env._ctx_block. Seat 0 zeroes the DoW-specific quintet exactly as
  // the GPU does (seat 0 has no scripted DoW policy).
  const own = state.units.filter((u) => u.seat === seat);
  const qHeads = cities.map((c) => c.queue[0]).filter((q): q is QueueItem => !!q && q.kind === 'unit');
  const qMil = qHeads.filter((q) => ((UNITS[(q as { unit: string }).unit]?.combat ?? 0) > 0));
  const isRngType = (t: string) => ((UNITS[t]?.ranged?.strength ?? 0) > 0);
  const ownMil = own.filter((u) => (UNITS[u.type]?.combat ?? 0) > 0);
  const nRangedWQ = ownMil.filter((u) => isRngType(u.type)).length
    + qMil.filter((q) => isRngType((q as { unit: string }).unit)).length;
  const nMeleeWQ = ownMil.filter((u) => !isRngType(u.type)).length
    + qMil.filter((q) => !isRngType((q as { unit: string }).unit)).length;
  // The DoW quintet below is PAIRWISE — oppStr, proximity, gang, aggression,
  // peaceTurns and oppHasCities are all measured against `CTX_PAIR_SEAT`,
  // because the wire carries one such axis and this is the seat it names. That
  // seat's own row would be self-referential, so it renders zero. An unfinished
  // wire, not a rule: nothing in the engine gives that seat any other standing.
  //
  // Read `opp` for the far side and `me` for this seat, and keep them straight:
  // oppStr / gang / oppHasCities describe the OPPONENT (the DoW policy compares
  // own strength against theirs and gangs up on their warmongering), while
  // aggression and peaceTurns are this seat's own.
  const me = seatOf(state, seat);
  const opp = seat === CTX_PAIR_SEAT ? undefined : seatOf(state, CTX_PAIR_SEAT);
  const atOpp = atWarWithAny(state, seat);
  const ctx: number[] = [
    cities.length,
    own.length + qHeads.length,
    nMeleeWQ,
    nRangedWQ,
    cities.length * 2 + (atOpp ? 3 : 1),
    opp ? seatStrength(state, CTX_PAIR_SEAT) : 0,
    seatStrength(state, seat),
    opp ? Math.min(seatProximity(state, CTX_PAIR_SEAT, seat), 999) : 0,
    opp ? (((opp.warmonger ?? 0) >= WARMONGER_GANG) ? 1 : 0) : 0,
    opp ? (me?.aggression ?? 0) : 0,
    opp ? (me?.peaceTurns ?? 0) : 0,
    atOpp ? 1 : 0,
    opp ? (opp.cities.length > 0 ? 1 : 0) : 0,
  ];
  return [...emp, ...cityState, ...riv, ...per, ...esc, ...costT, ...costC, ...ctx];
}