/**
 * WORLD CONGRESS sessions and the standing-resolution readers. The session
 * mechanics (vote cost curve, outcome-then-target plurality, the +1 DVP to
 * every winning-combo voter, refund tiers, the always-3rd Diplomatic Victory
 * resolution) are sourced verbatim at the catalog (data/seats.ts).
 *
 * A Regular Session draws its slate when it sits and votes on it then. The
 * ballots come from the decider `holdCongressBallots` installs (the majors'
 * AI on the replay): one [outcome, target, extra votes, cast order] per
 * slot; a seat it gives none, and every seat without a decider, votes the
 * AI line (`preference`, the Diplomatic Victory pile-on). A ballot naming
 * target -1 takes a "Random congress resolution target" draw over the
 * targets the resolution offers the seat (`congressTargets`), as the game's
 * AI does where its hint is not among them (0x611140 ..): seats in order,
 * each seat's ballots in its cast order, before the tally.
 */
import { randRange } from './rand';
import { congressTargets, congressTargetsOf } from './congressTargets';
import type { DistrictId, GameState, GreatPersonClass, Seat } from './types';
import { GP_CLASSES } from '../data/greatPeople';
import { gwCountsByObj } from './greatWorks';
import { GWO_COUNT } from '../data/greatWorks';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { GOVERNMENT_LIST } from '../data/policies';
import { PROJECT_LIST } from '../data/projects';
import { clearableFeatures } from '../../world/features';
import { LUXURY_IDS, RESOURCES, resourceImprovement } from '../../world/resources';
import { citiesOf, isCiv, seatOf, tileSeat, unitsOf } from './seats';
import { growthDetachResidue } from './city';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import {
  CONGRESS_RESOLUTIONS, CONGRESS_UDT, CONGRESS_PATRONAGE, CONGRESS_MIGRATION,
  CONGRESS_HERITAGE, CONGRESS_DV_MIN_ERA, CONGRESS_DV_DELTA, CONGRESS_VOTE_PRICE,
  CONGRESS_GPP_MULT, CONGRESS_GROWTH_A, CONGRESS_GROWTH_B, CONGRESS_MIG_LOYALTY,
  CONGRESS_GW_MULT, DVP_PER_RESOLUTION,
  CONGRESS_MERCENARY, CONGRESS_TRADE_POLICY,
  CONGRESS_IDEOLOGY, CONGRESS_BORDER_CONTROL,
  CONGRESS_SOVEREIGNTY, CONGRESS_PUBLIC_WORKS, CONGRESS_DEFORESTATION,
  CONGRESS_PLUS_100, CONGRESS_MINUS_50, CONGRESS_TRADE_GOLD,
  CONGRESS_TRADE_CAPACITY, CONGRESS_IDEOLOGY_SLOTS,
  CONGRESS_GLOBAL_ENERGY, CONGRESS_ENERGY_PROD_MULT, UDT_DISTRICTS,
  CONGRESS_PUBLIC_RELATIONS, CONGRESS_MILITARY_ADVISORY, CONGRESS_WORLD_RELIGION,
  CONGRESS_ESPIONAGE, CONGRESS_PACT_LEVELS, CONGRESS_ARMS_CONTROL, CONGRESS_LUXURY_POLICY,
  CONGRESS_PR_MULT_A, CONGRESS_PR_MULT_B, CONGRESS_ADVISORY_CS,
  CONGRESS_WORLD_RELIGION_RS, CONGRESS_WORLD_RELIGION_FAVOR,
  CONGRESS_COMPETITIONS, CONGRESS_INTERVAL, CONGRESS_MIN_ERA,
} from '../data/seats';
import { EMG_CALLED } from './emergency';
import { seatGovernment } from './effects';
import { envoysOf } from './cityStates';
import { POWER_PLANT_IDS } from '../data/buildings';
import { SPY_OFFENSIVE_MISSIONS } from '../data/espionage';
import { startCompetition } from './competition';
import { diploVictoryMoment } from './eras';
import { PROMO_CLASSES, UNIT_PROMO_CLASS } from '../data/promotions';

const CLEARABLE_FEATURES = clearableFeatures();

interface Vote { seat: number; outcome: number; target: number; weight: number }

/** Mercenary Companies names the YIELD a unit is paid in, in the order
 *  WorldCongress.lua's WC_Validate_YieldBan offers them, on both engines. */
export const CONGRESS_CURRENCIES = ['production', 'gold', 'faith'] as const;
export const CONGRESS_CUR_PRODUCTION = 0;
export const CONGRESS_CUR_GOLD = 1;
export const CONGRESS_CUR_FAITH = 2;

/** What a voter's `preference` reads beside the state: its live government
 *  and its envoys per city-state type (`congressVoter`). */
export interface CongressVoterCtx {
  /** GOVERNMENT_LIST index of the seat's live government; 0 if none. */
  government: number;
  /** envoys held, per CITY_STATE_TYPES index. */
  envoysByType: readonly number[];
}

/** One seat's Regular Session ballot: [outcome, target, extra votes, cast
 *  order] for slate slot 0, 1 and the Diplomatic Victory resolution (2), or
 *  null for a slot it leaves to the AI line. */
export type CongressBallot = ([number, number, number, number] | null)[];

/** What a session sits on: the slate's two resolutions (-1 none), whether the
 *  Diplomatic Victory resolution sits, and the competition it starts
 *  (a COMPETITIONS index, -1 none). */
export interface CongressSlate { slate: readonly number[]; dv: boolean; competition: number }

/** The decider asked for every seat's ballot once the slate is drawn. */
export type CongressDecider = (state: GameState, slate: CongressSlate) => readonly (CongressBallot | null)[];

let congressDecider: CongressDecider | null = null;

/** Install (or clear, with null) the decider of the Regular Sessions' ballots. */
export function holdCongressBallots(fn: CongressDecider | null): void {
  congressDecider = fn;
}

/** The DIPLOMATIC VICTORY resolution's slot in the vote head — the always-3rd
 * resolution, which stands outside the two-slot rotating slate. */
const CONGRESS_DV_SLOT = 2;

/** every device a seat holds, across the catalog — what Arms Control compares
 *  when it names a target. */
function wmdTotal(sx: Seat): number {
  let n = 0;
  for (let k = 0; k < NUCLEAR_DEVICES.length; k++) n += sx.wmd?.[k] ?? 0;
  return n;
}

/**
 * CIV6 (Arms Control): "A: All players have their weapons of Mass Destruction
 * set equal to the target player. / B: The target player loses all of their
 * Weapons of Mass Destruction." An inventory is state rather than a standing
 * modifier, so the Congress enforces the winning outcome on the spot — per
 * device row, since a seat holds each kind separately.
 */
function armsControl(state: GameState, outcome: number, target: number): void {
  const t = seatOf(state, target);
  if (!t) return;
  const level = NUCLEAR_DEVICES.map((_d, k) => t.wmd?.[k] ?? 0);
  for (const s of state.seats) {
    if (outcome === 0) s.wmd = [...level];
    else if (s.seat === target) s.wmd = NUCLEAR_DEVICES.map(() => 0);
  }
}

/** Argmax with ties to the LOWER index — the shared tie rule of every
 * congress scan on both engines. */
function argmaxLow(counts: readonly number[]): number {
  let best = -Infinity, at = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > best) { best = counts[i]; at = i; }
  return at;
}

/** The AI free-vote preference for a non-DV resolution: outcome A on the
 * target the voter holds the most of (self for the Migration Treaty). What a
 * seat votes when its ballot leaves this slot to the AI line. */
export function preference(state: GameState, res: number, seat: number,
                           ctx: CongressVoterCtx): { outcome: number; target: number } {
  const sx = state.seats[seat];
  switch (res) {
    case CONGRESS_UDT: {
      // the district this seat holds the most complete copies of; every
      // city's centre is one
      const counts = UDT_DISTRICTS.map(() => 0);
      for (const city of sx.cities) {
        for (const d of city.districts) {
          const i = UDT_DISTRICTS.indexOf(d.type);
          if (i >= 0 && (d.type === 'CITY_CENTER' || state.map.tiles[d.tileIndex].districtComplete)) counts[i]++;
        }
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
    case CONGRESS_PATRONAGE:
      return { outcome: 0, target: argmaxLow(GP_CLASSES.map((cls) => sx.gpp[cls] ?? 0)) };
    case CONGRESS_MIGRATION:
      return { outcome: 0, target: seat };
    case CONGRESS_LUXURY_POLICY: {
      // A pays +1 Amenity per DUPLICATE copy — a seat names the luxury it
      // holds the most improved copies of.
      const counts = LUXURY_IDS.map(() => 0);
      for (const t of state.map.tiles) {
        if (!t.resource || tileSeat(t) !== seat) continue;
        const rdef = RESOURCES[t.resource];
        if (rdef.category === 'luxury' && t.improvement === resourceImprovement(t)) counts[LUXURY_IDS.indexOf(t.resource)]++;
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
    case CONGRESS_MERCENARY:
      // A RAISES the price, so self-interest votes B on the currency this
      // seat actually buys with — the one it holds the most of.
      return { outcome: 1, target: (sx.faith ?? 0) > (sx.treasury ?? 0) ? CONGRESS_CUR_FAITH : CONGRESS_CUR_GOLD };
    case CONGRESS_TRADE_POLICY:
      // A pays the NAMED seat's cities for every route in and widens its
      // capacity, so a seat names itself.
      return { outcome: 0, target: seat };
    case CONGRESS_IDEOLOGY:
      return { outcome: 0, target: ctx.government };
    case CONGRESS_BORDER_CONTROL:
      // A is the gift (culture bombs), B the attack — a seat votes itself the gift.
      return { outcome: 0, target: seat };
    case CONGRESS_PUBLIC_RELATIONS:
      // A DOUBLES the target's grievance flow — the self-serving ballot is B
      // on yourself, halving your own.
      return { outcome: 1, target: seat };
    case CONGRESS_ARMS_CONTROL: {
      // A LEVELS every arsenal to the named seat's, B empties the named
      // seat's alone. A seat that already holds the most can only lose by
      // levelling, so it strips its nearest rival; anyone else names the
      // emptiest seat and disarms the world down to it.
      const totals = state.seats.map(wmdTotal);
      let top = -1, rival = seat;
      for (let c = 0; c < totals.length; c++) {
        if (c !== seat && totals[c] > top) { top = totals[c]; rival = c; }
      }
      if ((totals[seat] ?? 0) >= top) return { outcome: 1, target: rival };
      return { outcome: 0, target: argmaxLow(totals.map((n) => -n)) };
    }
    case CONGRESS_MILITARY_ADVISORY: {
      // A pays +5 Combat Strength to ONE promotion class — a seat names the
      // class it fields the most units of; with none it names the first row.
      const counts = PROMO_CLASSES.map(() => 0);
      for (const u of unitsOf(state, seat)) {
        const i = PROMO_CLASSES.indexOf(UNIT_PROMO_CLASS[u.type] ?? '');
        if (i >= 0) counts[i]++;
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
    case CONGRESS_WORLD_RELIGION:
      // A pays +10 religious strength to one religion, and a religion IS its
      // founder's seat here — every ballot names its own.
      return { outcome: 0, target: seat };
    case CONGRESS_ESPIONAGE: {
      // A lifts every Spy on ONE operation and B bans it outright — a seat
      // takes the gift, and names the operation its own spies are running.
      const counts = SPY_OFFENSIVE_MISSIONS.map(() => 0);
      for (const u of unitsOf(state, seat)) {
        const i = SPY_OFFENSIVE_MISSIONS.indexOf(u.spyMission ?? -1);
        if (i >= 0) counts[i]++;
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
    case CONGRESS_SOVEREIGNTY:
      // a CITY-STATE TYPE: where this seat's envoys already are
      return { outcome: 0, target: argmaxLow(ctx.envoysByType) };
    case CONGRESS_PUBLIC_WORKS: {
      const counts = PROJECT_LIST.map(() => 0);
      for (const city of sx.cities) {
        const front = city.queue[0];
        if (front?.kind === 'project') {
          const i = PROJECT_LIST.findIndex((pr) => pr.id === front.project);
          if (i >= 0) counts[i]++;
        }
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
    case CONGRESS_GLOBAL_ENERGY: {
      // B is the production boost, so a seat votes B on the plant type it
      // already runs most of; with none built it names the first row.
      const counts = POWER_PLANT_IDS.map(() => 0);
      for (const city of sx.cities) {
        for (let i = 0; i < POWER_PLANT_IDS.length; i++) {
          if (city.buildings.includes(POWER_PLANT_IDS[i])) counts[i]++;
        }
      }
      return { outcome: 1, target: argmaxLow(counts) };
    }
    case CONGRESS_DEFORESTATION: {
      // A pays gold for clearing the named feature, so a seat names whichever
      // clearable feature it owns the most of.
      const counts = CLEARABLE_FEATURES.map(() => 0);
      for (const t of state.map.tiles) {
        if (tileSeat(t) !== seat || !t.feature) continue;
        const i = CLEARABLE_FEATURES.indexOf(t.feature);
        if (i >= 0) counts[i]++;
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
    default: { // CONGRESS_HERITAGE: a Great Work OBJECT type (TargetKind GREATWORKOBJECT)
      const counts = new Array<number>(GWO_COUNT).fill(0);
      for (const city of sx.cities) gwCountsByObj(city).forEach((n, o) => { counts[o]! += n; });
      return { outcome: 0, target: argmaxLow(counts) };
    }
  }
}

/** THE PRICE of `n` votes on one resolution (0x527680): s x n x (n - 1)
 *  favor, s the vote price (CONGRESS_VOTE_PRICE) — the first vote free */
export function voteCost(n: number): number {
  const a = Math.abs(n);
  return CONGRESS_VOTE_PRICE * (a - 1) * a;
}

/** THE VOTES `favor` buys (0x527d80): 1 for none, else
 *  whole((sqrt(4 x favor / s + 1) + 1) x 0.5) in single precision */
export function votesFor(favor: number): number {
  if (favor <= 0) return 1;
  const f = Math.fround;
  const root = f(Math.sqrt(f(f(f(favor) * 4) / CONGRESS_VOTE_PRICE) + 1));
  return Math.trunc(f(f(root + 1) * 0.5));
}

/**
 * BUY EXTRA VOTES up the price (`voteCost`): the k-th extra vote costs
 * 2 s k favor, and the price restarts for every resolution. Stops at the
 * first vote the bank cannot clear. Debits the bank and reports what it
 * took, because the refund tiers pay that back.
 */
export function buyVotes(sx: Seat, want: number): { extra: number; spent: number } {
  let favor = sx.diplomaticFavor ?? 0;
  let extra = 0, spent = 0;
  while (extra < want) {
    const step = voteCost(extra + 2) - voteCost(extra + 1);
    if (favor < step) break;
    favor -= step;
    spent += step;
    extra++;
  }
  sx.diplomaticFavor = favor;
  return { extra, spent };
}

/**
 * Outcome first (more votes), then target by plurality among the winning
 * outcome's votes. CIV6: "Ties are broken by the proportion of Diplomatic
 * Favor a player commits", so a tie on VOTES is settled by the favor the tied
 * side committed, and only a tie there falls back to A / the lower index.
 */
function tally(votes: readonly Vote[], targetSpace: number,
               spent: readonly number[]): { outcome: number; target: number } {
  let a = 0, b = 0, fa = 0, fb = 0;
  for (const v of votes) {
    if (v.outcome === 0) { a += v.weight; fa += spent[v.seat]; }
    else { b += v.weight; fb += spent[v.seat]; }
  }
  const outcome = b > a || (b === a && fb > fa) ? 1 : 0;
  const tv = new Array<number>(targetSpace).fill(0);
  const tf = new Array<number>(targetSpace).fill(0);
  for (const v of votes) {
    if (v.outcome !== outcome || v.target < 0) continue;
    tv[v.target] += v.weight;
    tf[v.target] += spent[v.seat];
  }
  let at = 0;
  for (let i = 1; i < targetSpace; i++) {
    if (tv[i] > tv[at] || (tv[i] === tv[at] && tf[i] > tf[at])) at = i;
  }
  return { outcome, target: at };
}

/**
 * PAY OUT one resolution: +1 DVP to every seat whose outcome AND target both
 * won, and the sourced refund tiers to everyone else — 100% of the favor a
 * losing OUTCOME spent, 50% where the outcome won on a different target.
 */
function settle(state: GameState, votes: readonly Vote[], spent: readonly number[],
                win: { outcome: number; target: number }): void {
  for (const v of votes) {
    const sx = state.seats[v.seat];
    if (v.outcome !== win.outcome) sx.diplomaticFavor = (sx.diplomaticFavor ?? 0) + spent[v.seat];
    else if (v.target !== win.target) sx.diplomaticFavor = (sx.diplomaticFavor ?? 0) + Math.floor(spent[v.seat] / 2);
    else sx.diplomaticPoints = (sx.diplomaticPoints ?? 0) + DVP_PER_RESOLUTION;
  }
}

export function targetSpaceSize(state: GameState, res: number): number {
  switch (CONGRESS_RESOLUTIONS[res].target) {
    case 'district': return UDT_DISTRICTS.length;
    case 'gpClass': return GP_CLASSES.length;
    case 'gwObject': return GWO_COUNT;
    case 'currency': return CONGRESS_CURRENCIES.length;
    case 'government': return GOVERNMENT_LIST.length;
    case 'project': return PROJECT_LIST.length;
    case 'csType': return CITY_STATE_TYPES.length;
    case 'feature': return CLEARABLE_FEATURES.length;
    case 'building': return POWER_PLANT_IDS.length;
    case 'promoClass': return PROMO_CLASSES.length;
    case 'spyMission': return SPY_OFFENSIVE_MISSIONS.length;
    case 'luxury': return LUXURY_IDS.length;
    // a religion IS its founder's seat here, so its space is the seat roster
    case 'religion': return state.seats.length;
    default: return state.seats.length;
  }
}

function clamp(v: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(v), 0), hi);
}

function runResolution(state: GameState, res: number, slot: number,
                       recorded: readonly (CongressBallot | null)[],
                       voters: readonly CongressVoterCtx[]): void {
  const space = targetSpaceSize(state, res);
  const votes: Vote[] = [];
  const spent = state.seats.map(() => 0);
  for (let c = 0; c < state.seats.length; c++) {
    const sx = state.seats[c];
    if (sx.cities.length === 0) continue;
    const v = recorded[c]?.[slot];
    const p = v ? { outcome: clamp(v[0], 1), target: v[1] < 0 ? -1 : clamp(v[1], space - 1) } : preference(state, res, c, voters[c]);
    // NO favor without an intent: the AI free-votes on a regular resolution.
    const bought = buyVotes(sx, v ? Math.max(0, Math.trunc(v[2])) : 0);
    spent[c] = bought.spent;
    votes.push({ seat: c, outcome: p.outcome, target: p.target, weight: 1 + bought.extra });
  }
  if (votes.length === 0) return;
  const win = tally(votes, space, spent);
  settle(state, votes, spent, win);
  state.congress!.push({ res, outcome: win.outcome, target: win.target });
  // CIV6 (Arms Control): an inventory is state rather than a standing
  // modifier, so this one is enforced at the session.
  if (res === CONGRESS_ARMS_CONTROL) armsControl(state, win.outcome, win.target);
}

/** A Regular Session sits at `turn`: every CONGRESS_INTERVAL turn once the
 *  world era (`worldEraIndex`) has reached CONGRESS_MIN_ERA. */
export function congressSessionDue(turn: number, worldEra: number): boolean {
  return turn % CONGRESS_INTERVAL === 0 && worldEra >= CONGRESS_MIN_ERA;
}

/** A Special Session sits at `turn`: a called emergency whose hiatus has run
 *  out (`act` reached), with the Congress open (world era at CONGRESS_MIN_ERA). */
export function specialSessionDue(state: GameState, turn: number, worldEra: number): boolean {
  if (worldEra < CONGRESS_MIN_ERA) return false;
  return (state.emergencies ?? []).some((e) => e.phase === EMG_CALLED && turn >= e.act);
}

/** The Diplomatic Victory leader: the most diplomatic victory points among
 *  the seats holding a city, ties to the lower index; -1 where none holds one. */
export function dvLeader(state: GameState): number {
  let leader = -1, bestP = -Infinity;
  for (let c = 0; c < state.seats.length; c++) {
    if (state.seats[c].cities.length === 0) continue;
    const p = state.seats[c].diplomaticPoints ?? 0;
    if (p > bestP) { bestP = p; leader = c; }
  }
  return leader;
}

/** What a voter knows that `preference` cannot look up itself: the live
 *  government and its envoys per city-state type. */
export function congressVoter(state: GameState, seat: number): CongressVoterCtx {
  const gov = seatGovernment(state, seat);
  const envoysByType = CITY_STATE_TYPES.map(() => 0);
  for (const cityState of state.cityStates ?? []) {
    const t = CITY_STATE_TYPES.indexOf(cityState.type);
    if (t >= 0) envoysByType[t] += envoysOf(cityState, seat);
  }
  const government = gov ? Math.max(0, GOVERNMENT_LIST.findIndex((g) => g.id === gov)) : 0;
  return { government, envoysByType };
}

/** The Diplomatic Victory resolution. Without an intent a seat votes the AI
 * line — the leader votes A on itself, everyone else B on the leader — and
 * pours ALL its favor in. The +/-2 lands on the WINNING TARGET immediately
 * (no clamp — the win check is a >= threshold, so negative points are harmless
 * and un-invented). */
function runDvResolution(state: GameState, recorded: readonly (CongressBallot | null)[]): void {
  const leader = dvLeader(state);
  if (leader < 0) return;
  const space = state.seats.length;
  const votes: Vote[] = [];
  const spent = state.seats.map(() => 0);
  for (let c = 0; c < state.seats.length; c++) {
    const sx = state.seats[c];
    if (sx.cities.length === 0) continue;
    const v = recorded[c]?.[CONGRESS_DV_SLOT];
    const outcome = v ? clamp(v[0], 1) : (c === leader ? 0 : 1);
    const target = v ? (v[1] < 0 ? -1 : clamp(v[1], space - 1)) : leader;
    const bought = buyVotes(sx, v ? Math.max(0, Math.trunc(v[2])) : Number.MAX_SAFE_INTEGER);
    spent[c] = bought.spent;
    votes.push({ seat: c, outcome, target, weight: 1 + bought.extra });
  }
  if (votes.length === 0) return;
  const win = tally(votes, space, spent);
  settle(state, votes, spent, win);
  const t = state.seats[win.target];
  t.diplomaticPoints = (t.diplomaticPoints ?? 0) + (win.outcome === 0 ? CONGRESS_DV_DELTA : -CONGRESS_DV_DELTA);
  if (win.outcome === 0) diploVictoryMoment(state, t.seat);
}

/**
 * THE TARGET DRAWS of a session's ballots naming target -1: seats in order,
 * each seat's ballots in its cast order (the 4th field), one "Random congress
 * resolution target" draw over the targets the resolution offers the seat,
 * the ballot taking the one drawn (-1 where it offers none). `slate` is the
 * session's two resolutions, `dv` whether the Diplomatic Victory one sits.
 * `_congress_target_draws` is the twin.
 */
function drawTargets(state: GameState, recorded: readonly (CongressBallot | null)[], slate: readonly number[],
                     dv: boolean): (CongressBallot | null)[] {
  return recorded.map((ballot, c) => {
    if (!ballot || state.seats[c]?.cities.length === 0) return ballot;
    const out = ballot.map((v) => (v ? [...v] as [number, number, number, number] : null));
    const open = (slot: number) => (slot < 2 ? (slate[slot] ?? -1) >= 0 : slot === CONGRESS_DV_SLOT && dv);
    const order = out.map((v, slot) => ({ v, slot })).filter((x) => x.v && x.slot <= CONGRESS_DV_SLOT && open(x.slot) && x.v[1] < 0)
      .sort((a, b) => a.v![3] - b.v![3] || a.slot - b.slot);
    for (const { v, slot } of order) {
      const list = slot === CONGRESS_DV_SLOT ? congressTargetsOf(state, c, 'WC_RES_DIPLOVICTORY') : congressTargets(state, c, slate[slot]);
      const k = randRange(state, list.length, 'Random congress resolution target');
      v![1] = list[k] ?? -1;
    }
    return out;
  });
}

/** CanUseResolutions (WorldCongress.lua): World Religion needs a founded
 *  religion, the Luxury resolution a luxury on the map; the rest stand. */
function congressUsable(state: GameState, res: number): boolean {
  if (res === CONGRESS_WORLD_RELIGION) return state.seats.some((sx) => sx.religion?.founded);
  if (res === CONGRESS_LUXURY_POLICY) return state.map.tiles.some((t) => !!t.resource && RESOURCES[t.resource].category === 'luxury');
  return true;
}

/**
 * THE SLATE of a Regular Session, drawn when it sits (the DLL's session setup
 * 0x598270; runs/h1_duelv1127 t61 - t221): over the resolutions in the game
 * era's window that CanUseResolutions allows, in the install's order,
 * min(3, n) "World Congress Resolutions" draws, each over what is left and
 * removing its pick, the first two the slate; then one draw over the
 * InjectionOnly rows in their era (the Diplomatic Victory resolution from
 * Modern, a lone row); then one draw (0x596b40) over the competitions in
 * their era (`CONGRESS_COMPETITIONS`) not running, the pick the competition
 * the session starts. `_congress_draw_slate` is the twin.
 */
export function drawCongressSlate(state: GameState, worldEra: number): CongressSlate {
  const pool: number[] = [];
  for (let i = 0; i < CONGRESS_RESOLUTIONS.length; i++) {
    const r = CONGRESS_RESOLUTIONS[i];
    if (worldEra >= r.minEra && worldEra <= r.maxEra && congressUsable(state, i)) pool.push(i);
  }
  const drawn: number[] = [];
  for (let k = Math.min(3, pool.length); k > 0; k--) drawn.push(pool.splice(randRange(state, pool.length, 'World Congress Resolutions'), 1)[0]);
  const dv = worldEra >= CONGRESS_DV_MIN_ERA;
  if (dv) randRange(state, 1, 'World Congress Resolutions');
  const comps = CONGRESS_COMPETITIONS.filter((c) => worldEra >= c.minEra && worldEra <= c.maxEra && state.competition?.kind !== c.kind);
  const competition = comps.length ? comps[randRange(state, comps.length, 'World Congress Resolutions')].kind : -1;
  return { slate: [drawn[0] ?? -1, drawn[1] ?? -1], dv, competition };
}

/** One Regular Session, after the barbarians' turn closes the turn every
 * player acted in (the game's draw log: the session's draws the last of the
 * turn, before the next turn's random-event step; runs/h1_duelv1127 t61):
 * the slate drawn (`drawCongressSlate`), the decider's ballots, then
 * `congressVotes`. */
export function congressSession(state: GameState, worldEra: number): void {
  const at = drawCongressSlate(state, worldEra);
  congressVotes(state, at, congressDecider ? congressDecider(state, at) : []);
}

/** The votes on a drawn slate: the ballots' target draws (`drawTargets`),
 * the two resolutions, the Diplomatic Victory one where it sits, then the
 * competition drawn starts with every living major in its field (one runs
 * at a time). The standing effects REPLACE the previous session's and hold
 * until the next one. */
export function congressVotes(state: GameState, at: CongressSlate, recorded: readonly (CongressBallot | null)[]): void {
  state.congressSessions = (state.congressSessions ?? 0) + 1;
  const voters = state.seats.map((sx) => congressVoter(state, sx.seat));
  const ballots = drawTargets(state, recorded, at.slate, at.dv);
  // the standing Migration Treaty detaches from its target's cities, each
  // keeping the residue its growth percent leaves (`City.growthDrift`)
  const migration = congressEffect(state, CONGRESS_MIGRATION);
  if (migration) {
    const residue = growthDetachResidue(congressGrowthMult(state, migration.target));
    for (const c of citiesOf(state, migration.target)) c.growthDrift = (c.growthDrift ?? 0) + residue;
  }
  state.congress = [];
  at.slate.filter((r) => r >= 0).forEach((res, slot) => runResolution(state, res, slot, ballots, voters));
  if (at.dv) runDvResolution(state, ballots);
  if (at.competition >= 0 && !state.competition) {
    startCompetition(state, at.competition, state.seats.filter((sx) => isCiv(sx.seat) && sx.cities.length > 0).map((sx) => sx.seat));
  }
}

function congressEffect(state: GameState, res: number): { outcome: number; target: number } | null {
  for (const a of state.congress ?? []) if (a.res === res) return a;
  return null;
}

/** Luxury Policy outcome B: the luxury that grants no Amenities; null when
 * not standing. */
export function congressBannedLuxury(state: GameState): string | null {
  const e = congressEffect(state, CONGRESS_LUXURY_POLICY);
  return e && e.outcome === 1 ? LUXURY_IDS[e.target] ?? null : null;
}

/** Luxury Policy outcome A: the luxury whose DUPLICATE improved copies each
 * pay +1 Amenity; null when not standing. */
export function congressDuplicateLuxury(state: GameState): string | null {
  const e = congressEffect(state, CONGRESS_LUXURY_POLICY);
  return e && e.outcome === 0 ? LUXURY_IDS[e.target] ?? null : null;
}

/** Urban Development Treaty outcome A: the district whose buildings take
 * +100% production; null when not standing. */
export function congressUdtProdDistrict(state: GameState): DistrictId | null {
  const e = congressEffect(state, CONGRESS_UDT);
  return e && e.outcome === 0 ? UDT_DISTRICTS[e.target] ?? null : null;
}

/** Urban Development Treaty outcome B: the district whose buildings cannot
 * be created; null when not standing. */
export function congressUdtBlockedDistrict(state: GameState): DistrictId | null {
  const e = congressEffect(state, CONGRESS_UDT);
  return e && e.outcome === 1 ? UDT_DISTRICTS[e.target] ?? null : null;
}

/** CIV6 (Espionage Pact, outcome A): "All Spies function +2 levels higher for
 *  the Target Operation" — every seat's spies, on the one operation. */
export function congressPactLevels(state: GameState, m: number): number {
  const e = congressEffect(state, CONGRESS_ESPIONAGE);
  return e && e.outcome === 0 && SPY_OFFENSIVE_MISSIONS[e.target] === m
    ? CONGRESS_PACT_LEVELS : 0;
}

/** CIV6 (Espionage Pact, outcome B): "Target Operation is unavailable" — the
 *  banned mission index, or -1 when the pact does not stand that way. */
export function congressPactBanned(state: GameState): number {
  const e = congressEffect(state, CONGRESS_ESPIONAGE);
  return e && e.outcome === 1 ? SPY_OFFENSIVE_MISSIONS[e.target] ?? -1 : -1;
}

/** Patronage factor for a Great Person class: x2 (A), x0 (B) or 1. Applies
 * to EVERY point source — the wiki footnote zeroes districts, buildings and
 * projects alike. */
export function congressGppFactor(state: GameState, cls: GreatPersonClass): number {
  const e = congressEffect(state, CONGRESS_PATRONAGE);
  if (!e || GP_CLASSES[e.target] !== cls) return 1;
  return e.outcome === 0 ? CONGRESS_GPP_MULT : 0;
}

/**
 * PUBLIC RELATIONS scales every grievance write the target is either side of:
 * CIV6 "A: Target player generates 100% more Grievances, and other players
 * generate 100% more Grievances against this player. / B: ... 50% fewer ...".
 * Returned as a PERCENTAGE so the ledger stays integer.
 */
export function congressGrievanceMult(state: GameState, victim: number, transgressor: number): number {
  const e = congressEffect(state, CONGRESS_PUBLIC_RELATIONS);
  if (!e || (e.target !== victim && e.target !== transgressor)) return 100;
  return e.outcome === 0 ? CONGRESS_PR_MULT_A : CONGRESS_PR_MULT_B;
}

/** MILITARY ADVISORY: "+5 Combat Strength for units of this promotion class"
 *  on outcome A, -5 on B. */
export function congressPromoClassCs(state: GameState, promoClass: string | undefined): number {
  const e = congressEffect(state, CONGRESS_MILITARY_ADVISORY);
  if (!e || promoClass === undefined || PROMO_CLASSES[e.target] !== promoClass) return 0;
  return e.outcome === 0 ? CONGRESS_ADVISORY_CS : -CONGRESS_ADVISORY_CS;
}

/** WORLD RELIGION outcome A: "+10 Religious Combat Strength for all units of
 *  this Religion." */
export function congressReligiousCs(state: GameState, religion: number): number {
  const e = congressEffect(state, CONGRESS_WORLD_RELIGION);
  if (!e || e.outcome !== 0 || e.target !== religion) return 0;
  return CONGRESS_WORLD_RELIGION_RS;
}

/** WORLD RELIGION outcome B: "Condemning a unit of this Religion yields 25
 *  Diplomatic Favor." */
export function congressCondemnFavor(state: GameState, religion: number): number {
  const e = congressEffect(state, CONGRESS_WORLD_RELIGION);
  if (!e || e.outcome !== 1 || e.target !== religion) return 0;
  return CONGRESS_WORLD_RELIGION_FAVOR;
}

/** Migration Treaty growth factor on this seat's cities. */
export function congressGrowthMult(state: GameState, seat: number): number {
  const e = congressEffect(state, CONGRESS_MIGRATION);
  if (!e || e.target !== seat) return 1;
  return e.outcome === 0 ? CONGRESS_GROWTH_A : CONGRESS_GROWTH_B;
}

/** Migration Treaty loyalty term on this seat's cities (A pays growth and
 * COSTS loyalty; B is the reverse). */
export function congressLoyaltyDelta(state: GameState, seat: number): number {
  const e = congressEffect(state, CONGRESS_MIGRATION);
  if (!e || e.target !== seat) return 0;
  return e.outcome === 0 ? -CONGRESS_MIG_LOYALTY : CONGRESS_MIG_LOYALTY;
}

/** Heritage Organization tourism factors by Great Work kind
 * [writing, art, music]. */
export function congressGwMult(state: GameState): number[] {
  const e = congressEffect(state, CONGRESS_HERITAGE);
  const m = new Array<number>(GWO_COUNT).fill(1);
  if (e) m[e.target] = e.outcome === 0 ? CONGRESS_GW_MULT : 0;
  return m;
}

/** Mercenary Companies: the multiplier on what a MILITARY unit costs in
 *  `currency` — its production cost (CONGRESS_CUR_PRODUCTION) or its purchase
 *  price (CONGRESS_CUR_GOLD / CONGRESS_CUR_FAITH). */
export function congressUnitCostMult(state: GameState, currency: number): number {
  const e = congressEffect(state, CONGRESS_MERCENARY);
  if (!e || e.target !== currency) return 1;
  return e.outcome === 0 ? CONGRESS_PLUS_100 : CONGRESS_MINUS_50;
}

/** Trade Policy outcome A (INCREASES_TRADE_TO_GOLD,
 *  MODIFIER_PLAYER_CITIES_ADJUST_TRADE_ROUTE_YIELD_FROM_OTHERS): the Gold
 *  each route ANOTHER player sends into a city of the named seat pays that
 *  city (runs/h1_duelw1105: Nalanda's routes into Rome and Ostia read 4 Gold
 *  at their destination while Rome was named, t102-121 and t162-181). */
export function congressTradeGold(state: GameState, destSeat: number): number {
  const e = congressEffect(state, CONGRESS_TRADE_POLICY);
  return e && e.outcome === 0 && e.target === destSeat ? CONGRESS_TRADE_GOLD : 0;
}

/** Trade Policy outcome A: the extra route capacity the NAMED seat receives. */
export function congressRouteCapacity(state: GameState, seat: number): number {
  const e = congressEffect(state, CONGRESS_TRADE_POLICY);
  return e && e.outcome === 0 && e.target === seat ? CONGRESS_TRADE_CAPACITY : 0;
}

/** Trade Policy outcome B: this seat's INTERNATIONAL routes are ended and no
 *  new one may be established. */
export function congressIntlBanned(state: GameState, seat: number): boolean {
  const e = congressEffect(state, CONGRESS_TRADE_POLICY);
  return !!e && e.outcome === 1 && e.target === seat;
}

/** World Ideology: the wildcard slots the named GOVERNMENT gains (A) or
 *  loses (B). */
export function congressWildcardDelta(state: GameState, government: number): number {
  const e = congressEffect(state, CONGRESS_IDEOLOGY);
  if (!e || e.target !== government) return 0;
  return e.outcome === 0 ? CONGRESS_IDEOLOGY_SLOTS : -CONGRESS_IDEOLOGY_SLOTS;
}

/** Border Control Treaty outcome A: the seat whose new districts act as
 *  culture bombs; -1 when not standing. */
export function congressCultureBombSeat(state: GameState): number {
  const e = congressEffect(state, CONGRESS_BORDER_CONTROL);
  return e && e.outcome === 0 ? e.target : -1;
}

/** Border Control Treaty outcome B: this seat's borders cannot grow via
 *  culture. */
export function congressBorderFrozen(state: GameState, seat: number): boolean {
  const e = congressEffect(state, CONGRESS_BORDER_CONTROL);
  return !!e && e.outcome === 1 && e.target === seat;
}

/** Sovereignty outcome A (WC_RES_MODIFY_CITY_STATE_TRADE_YIELD, Amount 100,
 *  on every major): the factor (100 + Amount) / 100 on what a minor of this
 *  type pays a route sent to it of its type's yield
 *  (`sovereigntyRouteYields`); 0 where the resolution does not name the
 *  type — that row is then unpaid. */
export function congressCsRouteFactor(state: GameState, csType: number): number {
  const e = congressEffect(state, CONGRESS_SOVEREIGNTY);
  return e && e.outcome === 0 && e.target === csType ? CONGRESS_PLUS_100 : 0;
}

/** Sovereignty outcome B: a minor of this type provides no suzerain bonus. */
export function congressSuzBonusBlocked(state: GameState, csType: number): boolean {
  const e = congressEffect(state, CONGRESS_SOVEREIGNTY);
  return !!e && e.outcome === 1 && e.target === csType;
}

/** Public Works Program: the production multiplier toward the named project. */
export function congressProjectMult(state: GameState, project: number): number {
  const e = congressEffect(state, CONGRESS_PUBLIC_WORKS);
  if (!e || e.target !== project) return 1;
  return e.outcome === 0 ? CONGRESS_PLUS_100 : CONGRESS_MINUS_50;
}

/** CIV6 (Global Energy Treaty, outcome B, WC_RES_BUILDING_PRODUCTION_BUFF):
 *  the production multiplier toward buildings of the named type — 1 where
 *  the treaty does not name this row. */
export function congressEnergyProdMult(state: GameState, buildingId: string): number {
  const e = congressEffect(state, CONGRESS_GLOBAL_ENERGY);
  if (!e || e.outcome !== 1 || POWER_PLANT_IDS[e.target] !== buildingId) return 1;
  return CONGRESS_ENERGY_PROD_MULT;
}

/** Outcome A (WC_RES_BUILDING_PRODUCTION_BAN): the plant whose production is
 *  banned for every player; null when the treaty is not standing that way. */
export function congressEnergyBlocked(state: GameState): string | null {
  const e = congressEffect(state, CONGRESS_GLOBAL_ENERGY);
  return e && e.outcome === 0 ? POWER_PLANT_IDS[e.target] ?? null : null;
}

/** The Deforestation Treaty's standing outcome on a feature, or -1. */
function deforestationOn(state: GameState, feature: string | null): number {
  const e = congressEffect(state, CONGRESS_DEFORESTATION);
  if (!e || !feature || CLEARABLE_FEATURES[e.target] !== feature) return -1;
  return e.outcome;
}

/** CIV6 (Deforestation Treaty, B): "Features of this type cannot be cleared
 *  by any player." */
export function congressChopBanned(state: GameState, feature: string | null): boolean {
  return deforestationOn(state, feature) === 1;
}

/** CIV6 (Deforestation Treaty, A): "Clearing Features of this type yields
 *  Gold equal to the Production and Food" — a SECOND lump beside the chop's
 *  own, in the same amount. */
export function congressChopGold(state: GameState, feature: string | null, amount: number): number {
  return deforestationOn(state, feature) === 0 ? amount : 0;
}
