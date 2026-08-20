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
import { DIPLO_VICTORY_POINTS, WARMONGER_GANG } from '../data/seats';
import { envoysOf, hasMet } from './cityStates';
import { effectiveResearchCostIn } from './boosts';
import { goldenBoostBonus } from './eras';
import { itemCost, districtCostIn, settlerCost } from './game';
import { builderCost, settlerCount } from './units';
import { growthFoodNeeded, borderGrowthCost } from '../data/constants';
import { TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { CIVICS } from '../data/civics';

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
  const cityState: number[] = [];
  const nCs = cityStateMax ?? (state.cityStates ?? []).length;
  for (let i = 0; i < nCs; i++) {
    const c = (state.cityStates ?? []).find((x) => x.id === i);
    if (!c) { cityState.push(0, 0, 0, 0, 0); continue; }
    cityState.push(
      hasMet(c, seat) ? 1 : 0,
      envoysOf(c, seat) / 6.0,
      questFor(c, seat) ? 1 : 0,
      // the war head's MINOR columns decide off these two
      civsAtWar(state, c.seat, seat) ? 1 : 0,
      warTurnsWith(state, c.seat, seat) / 14.0,
    );
  }
  // THE OPPONENT BLOCK, seat-symmetric: every OTHER civ seat in ascending
  // seat order — the war head's own target order, so column k here and column
  // k of the head name the same seat. Everything is read from THIS seat's
  // point of view.
  //
  // The last four are the DoW terms, rendered PER OPPONENT so the policy can
  // choose WHICH one to declare on. RAW and unscaled, like the ctx block and
  // for the same reason.
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
      seatStrength(state, o.seat),
      Math.min(seatProximity(state, o.seat, seat), 999),
      ((o.warmonger ?? 0) >= WARMONGER_GANG) ? 1 : 0,
      o.cities.length > 0 ? 1 : 0,
    );
  }
  const per: number[] = [];
  for (let i = 0; i < cityMax; i++) {
    const c = cities[i];
    if (!c) { per.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0); continue; }  // 10 per slot
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
  // PARKED progress per option, on the cost blocks' scale so the two read as a
  // ratio. Switching research is a legal move and cannot be decided from the
  // cost alone: the science already sunk into an abandoned item is the other
  // half of the comparison. The CURRENT item reads 0 — its progress is the
  // pool, in the empire block — so the two never double-count.
  const progT = Object.values(TECHS).map((t) => (rs?.techRetained[t.id] ?? 0) / 1000);
  const progC = Object.values(CIVICS).map((c) => (rs?.civicRetained[c.id] ?? 0) / 1000);
  // S1(a): the CTX block — ladder.CTX_FIELDS, RAW and unscaled (the
  // ladder compares these exactly; a /10 scale does not round-trip
  // bit-stably in f64). Formulas are the SCRIPTED SITES' own — the GPU twin
  // is env._ctx_block. Everything here is THIS seat's own, for every seat
  // alike; what is measured against an opponent lives in the opponent block.
  const own = state.units.filter((u) => u.seat === seat);
  const qHeads = cities.map((c) => c.queue[0]).filter((q): q is QueueItem => !!q && q.kind === 'unit');
  const qMil = qHeads.filter((q) => ((UNITS[(q as { unit: string }).unit]?.combat ?? 0) > 0));
  const isRngType = (t: string) => ((UNITS[t]?.ranged?.strength ?? 0) > 0);
  const ownMil = own.filter((u) => (UNITS[u.type]?.combat ?? 0) > 0);
  const nRangedWQ = ownMil.filter((u) => isRngType(u.type)).length
    + qMil.filter((q) => isRngType((q as { unit: string }).unit)).length;
  const nMeleeWQ = ownMil.filter((u) => !isRngType(u.type)).length
    + qMil.filter((q) => !isRngType((q as { unit: string }).unit)).length;
  const me = seatOf(state, seat);
  // THE WORLD CONGRESS block: the ballot currency and the STANDING slate —
  // what the last session passed and on whom. `env._congress_block` renders
  // the identical layout.
  const congress: number[] = [
    (me?.diplomaticFavor ?? 0) / 100.0,
    (me?.diplomaticPoints ?? 0) / DIPLO_VICTORY_POINTS,
  ];
  for (let k = 0; k < 2; k++) {
    const a = (state.congress ?? [])[k];
    congress.push(a ? a.res + 1 : 0, a ? a.outcome : 0, a ? a.target : 0);
  }
  // THE EMERGENCY a Special Session would put to this seat — the LOWEST live
  // one by (kind, target, city). A ballot on the special-session slot is
  // worthless without it, and array POSITION is engine-local.
  const live = [...(state.emergencies ?? [])].sort(
    (a, b) => a.kind - b.kind || a.target - b.target || a.city - b.city)[0];
  congress.push(
    live ? live.kind + 1 : 0,
    live ? live.phase + 1 : 0,
    live && live.target === seat ? 1 : 0,
    live && live.members.includes(seat) ? 1 : 0,
  );
  const atAny = atWarWithAny(state, seat);
  const ctx: number[] = [
    cities.length,
    own.length + qHeads.length,
    nMeleeWQ,
    nRangedWQ,
    cities.length * 2 + (atAny ? 3 : 1),
    seatStrength(state, seat),
    me?.aggression ?? 0,
    me?.peaceTurns ?? 0,
    atAny ? 1 : 0,
  ];
  return [...emp, ...cityState, ...riv, ...per, ...esc, ...costT, ...costC, ...progT, ...progC, ...congress, ...ctx];
}