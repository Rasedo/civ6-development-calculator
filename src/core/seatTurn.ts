/**
 * #51/S2.4 — the per-seat turn body.
 *
 * The player's turn work lived in `game.ts:endTurn` and each rival's in the
 * per-rival loop of `rivals.ts:rivalPhase`, as two independent transcriptions
 * of the same rules. They had already drifted into being maintained by
 * comment: the rival copies carry "the player's twin", "the same position the
 * player uses", "mirrors the player's endTurn-top ...". This file is where
 * that stops being a promise and starts being one body.
 *
 * The PHASE DRIVER is untouched: game.ts still runs the player's block where
 * it always did and rivalPhase still runs each rival's where it always did,
 * so the draw order both engines depend on is exactly as before. Only the
 * work itself is shared.
 */

import type { City, GameState, QueueItem } from './types';
import { PLAYER_CIV, seatOf, isPlayerSeat, isBarbSeat, civsAtWar, rivalCount, civOfRival, citiesOf, rivalsOf, tileSeat, tileCity } from './seats';
import { isSuzerain, envoysOf } from './cityStates';
import { seatTourism } from './city';
import { effectiveResearchCostIn } from './boosts';
import { goldenBoostBonus } from './eras';
import { itemCost, districtCostIn, settlerCost } from './game';
import { builderCost } from './units';
import { growthFoodNeeded, borderGrowthCost } from '../data/constants';
import { TECHS } from '../data/techs';
import { UNITS } from '../data/units';
import { CIVICS } from '../data/civics';
import { computeAdoption } from './effects';
import { GOVERNMENTS, GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import { DIPLO_FAVOR_PER_SUZERAIN } from '../data/rivals';

/** B-22 (#75): city-states this seat is Suzerain of. */
export function suzerainCount(state: GameState, seat: number = PLAYER_CIV): number {
  return state.cityStates.reduce((n, cs) => n + (isSuzerain(cs, seat) ? 1 : 0), 0);
}

/** B-22 (#75): diplomatic favor earned per turn — government tier plus one
 *  per suzerainty. */
export function diploFavorPerTurn(gov: string | null, suzerains: number): number {
  const tier = gov ? GOVERNMENTS[gov]?.tier ?? 0 : 0;
  return tier + DIPLO_FAVOR_PER_SUZERAIN * suzerains;
}

/**
 * Which government a seat is running.
 *
 * This is divergence (1) from `getModifiers`, and it lives in ONE place so the
 * two readers cannot drift: the player's government is STORED (an RL agent or
 * the UI slots the cards), a rival's is DERIVED from its research. They agree
 * today only because the scripted player adopts with the same function.
 * Round 7 gives rivals stored slots and this collapses to `s.government`.
 */
export function seatGovernmentId(state: GameState, seat: number): string | null {
  const s = seatOf(state, seat);
  if (!s) return null;
  if (isPlayerSeat(seat)) return s.government.current;
  return GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(s.research).government : null;
}

/**
 * Is this seat at peace with every other civ?
 *
 * The two copies asked this differently — the player checked "no rival has
 * atWar", a rival checked "not atWar AND atWarRivals is empty" — because the
 * war state was stored asymmetrically. `civsAtWar` reads the same edge from
 * either end, so both are now the one question they always meant. City-state
 * wars are excluded here, as they were in both originals.
 */
export function atPeaceWithAllCivs(state: GameState, seat: number): boolean {
  for (let other = 0; other <= rivalCount(state); other++) {
    if (other !== seat && civsAtWar(state, seat, other)) return false;
  }
  return true;
}

/**
 * The per-turn civ-level accumulators, run at the same position in every
 * seat's turn so both engines mirror them together. Zero draws, integers
 * only — every one of these was already written twice, verbatim apart from
 * whose fields it touched.
 */
export function seatAccumulators(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  // B-20 (#71): TOURISM — Great Works plus every owned Seaside Resort (worth
  // its tile's appeal), accumulated once per turn at the civ level.
  s.tourism = (s.tourism ?? 0) + seatTourism(state, seat);
  // B-22 (#75): DIPLOMATIC FAVOR — government tier + suzerainties.
  s.diploFavor = (s.diploFavor ?? 0) + diploFavorPerTurn(seatGovernmentId(state, seat), suzerainCount(state, seat));
  // B-22 (#74): GRIEVANCES decay by 1 each turn this civ is at peace on every
  // axis (floor 0).
  if ((s.warmonger ?? 0) > 0 && atPeaceWithAllCivs(state, seat)) {
    s.warmonger = (s.warmonger ?? 0) - 1;
  }
}

/** The seat id for rival `rivalId` — re-exported so turn-body callers need
 *  only this module. */
export { civOfRival };

/**
 * #51/S2.4b — CITY GROWTH, for any seat's city.
 *
 * `RivalCity = City`, so the two transcriptions of this rule were byte-for-byte
 * the same arithmetic on the same field names: bank the surplus, grow at the
 * threshold, starve at a negative box with a floor of 1 pop. `game.ts:endTurn`
 * held one copy and the per-rival loop in `rivals.ts` held the other.
 *
 * The CALLER still computes the surplus, because the two seats reach it
 * differently — the player's `computeCityStats` returns
 * `effectiveFoodSurplus` with the housing/amenity/growth-mult chain already
 * folded in, while the rival path folds that chain at the call site. That
 * difference is real and is its own slice; the growth RULE is not.
 */
export function seatGrowth(city: City, surplus: number, growthNeeded: number): void {
  city.foodBox += surplus;
  if (city.foodBox >= growthNeeded) {
    city.population += 1;
    city.foodBox -= growthNeeded;
  } else if (city.foodBox < 0) {
    city.population = Math.max(1, city.population - 1);
    city.foodBox = 0;
  }
}

/**
 * #51/S8.1a — THE ONE PLACE A SEAT'S PRODUCTION CHOICE IS COMMITTED.
 *
 * The rival ladder pushed straight onto `rc.queue` at nine separate sites while
 * an externally-driven seat's choice arrived as an ACTION and went through a
 * different applier. Two appliers for one decision is why a net cannot be
 * handed the AI's moves: the AI never produces a move, it produces a mutation.
 *
 * Every commit now goes through here, which makes the choice observable at a
 * single seam — that is what the seat-tagged action log needs, and it is the
 * completeness check for the conversion: a queue that changed without a
 * `commitProduction` call is state moving behind the applier's back.
 *
 * Deliberately NOT a decision function. The ladder still decides; this only
 * commits. Logging the walk instead of the pick would make two engines that
 * choose identically produce different streams.
 */
export function commitProduction(state: GameState, seat: number, city: City, item: QueueItem): void {
  city.queue.push(item);
  if (process.env.CIV6_ALOG) {
    const what =
      item.kind === 'unit' ? item.unit
      : item.kind === 'building' ? item.building
      : item.kind === 'district' ? item.district
      : item.kind === 'wonder' ? item.wonder
      : item.kind === 'project' ? item.project
      : item.kind;
    console.error(`ALOG t${state.turn} s${seat} prod city=${city.id} ${item.kind}:${what}`);
  }
}

/**
 * #51/S8.1b — WHAT A SEAT SEES.
 *
 * The GPU has had a seat-invariant `observe(seat)` since C2; TS had none at
 * all, so the thing a decision actually READS was never comparable between the
 * engines. Parity compares ~412 trace columns chosen after the fact; an
 * observation is what the policy consumes BEFORE it acts, which is the tighter
 * artifact: matching observations plus identical actions make divergence
 * impossible by construction rather than sampled.
 *
 * This is the TS twin of `gpu/civ6gpu/env.py:BatchEnv.observe`, field for field
 * and scale for scale:
 *   [ 14 empire | 3 per city-state | 3 per rival | 9 per city slot ]
 *
 * It reads ONLY through the seat-generic accessors (`seatOf`, `citiesOf`), so
 * it is one renderer for every seat — unlike the GPU, which still routes
 * seat > 0 into a second `_observe_rival` body. Collapsing that is what this
 * function is the reference for.
 */
export function observeSeat(state: GameState, seat: number, cMax: number, horizon: number): number[] {
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
    s?.settlers ?? 0,
    cities.reduce((n: number, c: City) => n + c.queue.filter((q) => q.kind === 'settler').length, 0),
    cities.length / cMax,
    Math.min((s?.treasury ?? 0) / 200.0, 5.0),
    (s?.envoysAvailable ?? 0) / 5.0,
    (s?.influencePoints ?? 0) / 100.0,
    state.barbSeat.camps.length / 5.0,
    state.units.filter((u) => isBarbSeat(u.seat)).length / 10.0,
    state.units.filter((u) => u.seat === seat).length / 10.0,
    // #51/S8.4c (#66): army COMPOSITION. The ladder trains ranged while the
    // army holds melee, so a bare unit COUNT cannot express the decision.
    state.units.filter((u) => u.seat === seat && (UNITS[u.type]?.ranged?.strength ?? 0) > 0).length / 10.0,
  ];
  const cs: number[] = [];
  for (const c of state.cityStates ?? []) {
    cs.push(c.met ? 1 : 0, envoysOf(c, seat) / 6.0, c.quest ? 1 : 0);
  }
  const riv: number[] = [];
  for (const r of rivalsOf(state)) {
    const other = civOfRival(r.id);
    riv.push(
      other !== seat && civsAtWar(state, seat, other) ? 1 : 0,
      (r.warTurns ?? 0) / 14.0,
      r.cities.length / 6.0,
    );
  }
  const per: number[] = [];
  for (let i = 0; i < cMax; i++) {
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
      // #51/S8.4c (#66): the production LADDER branches on isCapital (only
      // the capital queues a settler) — nine floats could not say which
      // city it was talking to.
      c.isCapital ? 1 : 0,
    );
  }
  // #51/S8.4 (#66): EFFECTIVE research cost per option — the quantity the
  // decision uses, not the boost flag it derives from. Emitting flags would
  // force the policy to apply `boosted ? base*(1-frac) : base` itself, and that
  // formula is a RULE: it belongs in the engine, or a rule leaks into the
  // policy and the two drift.
  //
  // FULL WIDTH, unmasked, on purpose. Legality lives in the MASK — one source
  // of truth each. What the full vector buys is PLANNING: a boosted tech
  // several prereqs away should steer a policy toward that branch now, and a
  // mask-to-frontier vector would be EMPTY whenever a research slot is busy.
  // #51/S8.4b (#66): the three ESCALATING production costs, in the SAME slot
  // the GPU emits them — after the per-city block, before the research costs.
  // Everything else a production pick needs is static rules data the ladder
  // already loads; static data is not state.
  const esc = [
    districtCostIn(s?.research ?? { techs: [], civics: [] } as never) / 1000,
    (isPlayerSeat(seat) ? settlerCost(state) : 0) / 1000,
    builderCost(state, seat) / 1000,
  ];
  const rs = s?.research;
  const gT = goldenBoostBonus(state, seat, false);
  const gC = goldenBoostBonus(state, seat, true);
  const costT = Object.values(TECHS).map((t) =>
    (rs ? effectiveResearchCostIn(rs, t.id, t.cost, gT) : t.cost) / 1000);
  const costC = Object.values(CIVICS).map((c) =>
    (rs ? effectiveResearchCostIn(rs, c.id, c.cost, gC) : c.cost) / 1000);
  return [...emp, ...cs, ...riv, ...per, ...esc, ...costT, ...costC];
}

/**
 * #51/S8.1d — the remaining COMMIT seams, same contract as `commitProduction`.
 *
 * Each is the one place a seat's choice of that kind lands, so the seat-tagged
 * stream is complete rather than production-only. Completeness is the point:
 * the invariant the log exists to prove is that a seat's state changes are all
 * explained by its logged actions, and a verb with no seam is a hole in that.
 *
 * As with production these COMMIT, they do not decide, and they log the pick
 * rather than the walk.
 */
export function commitResearch(state: GameState, seat: number, kind: 'tech' | 'civic', id: string | null): void {
  const s = seatOf(state, seat);
  if (!s) return;
  if (kind === 'tech') s.research.tech = id;
  else s.research.civic = id;
  if (process.env.CIV6_ALOG && id !== null) {
    console.error(`ALOG t${state.turn} s${seat} ${kind} ${id}`);
  }
}

/** A unit order committed by a seat — the verb plus where it landed. */
export function logUnitOrder(state: GameState, seat: number, unitId: number, verb: string, tileIndex: number): void {
  if (process.env.CIV6_ALOG) {
    console.error(`ALOG t${state.turn} s${seat} ${verb} unit=${unitId} tile=${tileIndex}`);
  }
}
