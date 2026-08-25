/**
 * WORLD CONGRESS sessions and the standing-resolution readers. The session
 * mechanics (vote cost curve, outcome-then-target plurality, the +1 DVP to
 * every winning-combo voter, refund tiers, the always-3rd Diplomatic Victory
 * resolution) are sourced verbatim at the catalog (data/seats.ts).
 *
 * The VOTE rides the wire: `SeatActionRecord.vote` carries one
 * [outcome, target, extra votes] per slate slot, and a seat that submits none
 * falls back to the deterministic self-interest rule below — the AI vote.
 * Both engines only TALLY.
 */
import { nextRandom } from './rand';
import type { CongressVote, DistrictId, GameState, GreatPersonClass, Seat } from './types';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { GP_CLASSES } from '../data/greatPeople';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { POLICY_LIST, GOVERNMENT_LIST } from '../data/policies';
import { PROJECT_LIST } from '../data/projects';
import { clearableFeatures } from '../../world/features';
import { tileSeat } from './seats';
import {
  CONGRESS_RESOLUTIONS, CONGRESS_UDT, CONGRESS_PATRONAGE, CONGRESS_MIGRATION,
  CONGRESS_HERITAGE, CONGRESS_DV_MIN_ERA, CONGRESS_DV_DELTA, CONGRESS_VOTE_STEP,
  CONGRESS_GPP_MULT, CONGRESS_GROWTH_A, CONGRESS_GROWTH_B, CONGRESS_MIG_LOYALTY,
  CONGRESS_GW_MULT, DVP_PER_RESOLUTION,
  CONGRESS_MERCENARY, CONGRESS_TRADE_POLICY, CONGRESS_POLICY_TREATY,
  CONGRESS_IDEOLOGY, CONGRESS_BORDER_CONTROL, CONGRESS_TREATY_ORG,
  CONGRESS_SOVEREIGNTY, CONGRESS_PUBLIC_WORKS, CONGRESS_DEFORESTATION,
  CONGRESS_PLUS_100, CONGRESS_MINUS_50, CONGRESS_TRADE_GOLD,
  CONGRESS_TRADE_CAPACITY, CONGRESS_POLICY_FAVOR, CONGRESS_IDEOLOGY_SLOTS,
  CONGRESS_GLOBAL_ENERGY, CONGRESS_ENERGY_DISCOUNT,
  CONGRESS_PUBLIC_RELATIONS, CONGRESS_MILITARY_ADVISORY, CONGRESS_WORLD_RELIGION,
  CONGRESS_PR_MULT_A, CONGRESS_PR_MULT_B, CONGRESS_ADVISORY_CS,
  CONGRESS_WORLD_RELIGION_RS, CONGRESS_WORLD_RELIGION_FAVOR,
} from '../data/seats';
import { POWER_PLANT_IDS } from '../data/buildings';
import { PROMO_CLASSES } from '../data/promotions';

const CLEARABLE_FEATURES = clearableFeatures();

interface Vote { seat: number; outcome: number; target: number; weight: number }

/** Mercenary Companies names a CURRENCY, in this order on both engines. */
export const CONGRESS_CURRENCIES = ['gold', 'faith'] as const;
export const CONGRESS_CUR_GOLD = 0;
export const CONGRESS_CUR_FAITH = 1;

/**
 * What a VOTER knows that this module deliberately cannot look up. Adoption
 * lives in `effects`, which reads the standing slate back — so the facts come
 * IN and this file stays a leaf. `worldCongress` builds one per seat.
 */
export interface CongressVoterCtx {
  /** GOVERNMENT_LIST index of the seat's live government; 0 if none. */
  government: number;
  /** POLICY_LIST indices the seat currently has slotted, ascending. */
  policies: readonly number[];
  /** envoys held, per CITY_STATE_TYPES index. */
  envoysByType: readonly number[];
}

/** The DIPLOMATIC VICTORY resolution's slot in the vote head — the always-3rd
 * resolution, which stands outside the two-slot rotating slate. */
export const CONGRESS_DV_SLOT = 2;

/** Argmax with ties to the LOWER index — the shared tie rule of every
 * congress scan on both engines. */
function argmaxLow(counts: readonly number[]): number {
  let best = -Infinity, at = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > best) { best = counts[i]; at = i; }
  return at;
}

/** The AI free-vote preference for a non-DV resolution: outcome A on the
 * target the voter holds the most of (self for the Migration Treaty). What a
 * seat votes when its record carries no vote for this slot. */
export function preference(state: GameState, res: number, seat: number,
                           ctx: CongressVoterCtx): { outcome: number; target: number } {
  const sx = state.seats[seat];
  switch (res) {
    case CONGRESS_UDT: {
      const counts = PLACEABLE_DISTRICTS.map(() => 0);
      for (const city of sx.cities) {
        for (const d of city.districts) {
          const i = PLACEABLE_DISTRICTS.indexOf(d.type);
          if (i >= 0 && state.map.tiles[d.tileIndex].districtComplete) counts[i]++;
        }
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
    case CONGRESS_PATRONAGE:
      return { outcome: 0, target: argmaxLow(GP_CLASSES.map((cls) => sx.gpp[cls] ?? 0)) };
    case CONGRESS_MIGRATION:
      return { outcome: 0, target: seat };
    case CONGRESS_MERCENARY:
      // A RAISES the price, so self-interest votes B on the currency this
      // seat actually buys with — the one it holds the most of.
      return { outcome: 1, target: (sx.faith ?? 0) > (sx.treasury ?? 0) ? CONGRESS_CUR_FAITH : CONGRESS_CUR_GOLD };
    case CONGRESS_TRADE_POLICY: {
      // A pays the SENDER, so a seat names where its own routes go; with no
      // international leg the vote is harmless and names itself.
      const counts = state.seats.map(() => 0);
      for (const r of sx.tradeRoutes ?? []) if (r.toSeat !== undefined && r.toSeat >= 0) counts[r.toSeat]++;
      const most = argmaxLow(counts);
      return { outcome: 0, target: counts[most] > 0 ? most : seat };
    }
    case CONGRESS_POLICY_TREATY: {
      // A pays every holder of the card, so a seat names one it has slotted.
      return { outcome: 0, target: ctx.policies.length ? ctx.policies[0] : 0 };
    }
    case CONGRESS_IDEOLOGY:
      return { outcome: 0, target: ctx.government };
    case CONGRESS_BORDER_CONTROL:
      // A is the gift (culture bombs), B the attack — a seat votes itself the gift.
      return { outcome: 0, target: seat };
    case CONGRESS_TREATY_ORG:
    case CONGRESS_SOVEREIGNTY: {
      // Both name a CITY-STATE TYPE and both pay the patron, so both read the
      // same signal: where this seat's envoys already are.
      return { outcome: 0, target: argmaxLow(ctx.envoysByType) };
    }
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
      // A is the discount, so a seat names the plant type it already runs
      // most of; with none built it names the first row.
      const counts = POWER_PLANT_IDS.map(() => 0);
      for (const city of sx.cities) {
        for (let i = 0; i < POWER_PLANT_IDS.length; i++) {
          if (city.buildings.includes(POWER_PLANT_IDS[i])) counts[i]++;
        }
      }
      return { outcome: 0, target: argmaxLow(counts) };
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
    default: { // CONGRESS_HERITAGE
      const counts = [0, 0, 0];
      for (const city of sx.cities) {
        counts[0] += city.greatWorksWriting ?? 0;
        counts[1] += city.greatWorksArt ?? 0;
        counts[2] += city.greatWorksMusic ?? 0;
      }
      return { outcome: 0, target: argmaxLow(counts) };
    }
  }
}

/**
 * BUY EXTRA VOTES up the sourced curve — the k-th extra vote costs
 * CONGRESS_VOTE_STEP*k favor, and the curve restarts for every resolution
 * ("it is thus wise to spend Diplomatic Favor on other resolutions if they are
 * also important"). Stops at the first rung the bank cannot clear. Debits the
 * bank and reports what it took, because the refund tiers pay that back.
 */
export function buyVotes(sx: Seat, want: number): { extra: number; spent: number } {
  let favor = sx.diplomaticFavor ?? 0;
  let extra = 0, spent = 0;
  while (extra < want && favor >= CONGRESS_VOTE_STEP * (extra + 1)) {
    favor -= CONGRESS_VOTE_STEP * (extra + 1);
    spent += CONGRESS_VOTE_STEP * (extra + 1);
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
    if (v.outcome !== outcome) continue;
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

function targetSpaceSize(state: GameState, res: number): number {
  switch (CONGRESS_RESOLUTIONS[res].target) {
    case 'district': return PLACEABLE_DISTRICTS.length;
    case 'gpClass': return GP_CLASSES.length;
    case 'gwKind': return 3;
    case 'currency': return CONGRESS_CURRENCIES.length;
    case 'policy': return POLICY_LIST.length;
    case 'government': return GOVERNMENT_LIST.length;
    case 'project': return PROJECT_LIST.length;
    case 'csType': return CITY_STATE_TYPES.length;
    case 'feature': return CLEARABLE_FEATURES.length;
    case 'building': return POWER_PLANT_IDS.length;
    case 'promoClass': return PROMO_CLASSES.length;
    // a religion IS its founder's seat here, so its space is the seat roster
    case 'religion': return state.seats.length;
    default: return state.seats.length;
  }
}

function clamp(v: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(v), 0), hi);
}

function runResolution(state: GameState, res: number, slot: number,
                       recorded: readonly (CongressVote | null)[],
                       voters: readonly CongressVoterCtx[]): void {
  const space = targetSpaceSize(state, res);
  const votes: Vote[] = [];
  const spent = state.seats.map(() => 0);
  for (let c = 0; c < state.seats.length; c++) {
    const sx = state.seats[c];
    if (sx.cities.length === 0) continue;
    const v = recorded[c]?.[slot];
    const p = v ? { outcome: clamp(v[0], 1), target: clamp(v[1], space - 1) } : preference(state, res, c, voters[c]);
    // NO favor without an intent: the AI free-votes on a regular resolution.
    const bought = buyVotes(sx, v ? Math.max(0, Math.trunc(v[2])) : 0);
    spent[c] = bought.spent;
    votes.push({ seat: c, outcome: p.outcome, target: p.target, weight: 1 + bought.extra });
  }
  if (votes.length === 0) return;
  const win = tally(votes, space, spent);
  settle(state, votes, spent, win);
  state.congress!.push({ res, outcome: win.outcome, target: win.target });
}

/** The Diplomatic Victory resolution. Without an intent a seat votes the AI
 * line — the leader votes A on itself, everyone else B on the leader — and
 * pours ALL its favor in. The +/-2 lands on the WINNING TARGET immediately
 * (no clamp — the win check is a >= threshold, so negative points are harmless
 * and un-invented). */
function runDvResolution(state: GameState, recorded: readonly (CongressVote | null)[]): void {
  let leader = -1, bestP = -Infinity;
  for (let c = 0; c < state.seats.length; c++) {
    if (state.seats[c].cities.length === 0) continue;
    const p = state.seats[c].diplomaticPoints ?? 0;
    if (p > bestP) { bestP = p; leader = c; }
  }
  if (leader < 0) return;
  const space = state.seats.length;
  const votes: Vote[] = [];
  const spent = state.seats.map(() => 0);
  for (let c = 0; c < state.seats.length; c++) {
    const sx = state.seats[c];
    if (sx.cities.length === 0) continue;
    const v = recorded[c]?.[CONGRESS_DV_SLOT];
    const outcome = v ? clamp(v[0], 1) : (c === leader ? 0 : 1);
    const target = v ? clamp(v[1], space - 1) : leader;
    const bought = buyVotes(sx, v ? Math.max(0, Math.trunc(v[2])) : Number.MAX_SAFE_INTEGER);
    spent[c] = bought.spent;
    votes.push({ seat: c, outcome, target, weight: 1 + bought.extra });
  }
  if (votes.length === 0) return;
  const win = tally(votes, space, spent);
  settle(state, votes, spent, win);
  const t = state.seats[win.target];
  t.diplomaticPoints = (t.diplomaticPoints ?? 0) + (win.outcome === 0 ? CONGRESS_DV_DELTA : -CONGRESS_DV_DELTA);
}

/** One Regular Session: the ANNOUNCED slate (CIV6 — a random draw among
 * the era-eligible resolutions, drawn at the previous session's close),
 * then the Diplomatic Victory resolution from Modern. The standing effects
 * REPLACE the previous session's and hold until the next one. Each draw
 * advances the stream only where its pool is non-empty, in step with the
 * GPU `_congress_draw_slate`. */
export function congressSession(state: GameState, worldEra: number,
                                recorded: readonly (CongressVote | null)[],
                                voters: readonly CongressVoterCtx[]): void {
  state.congressSessions = (state.congressSessions ?? 0) + 1;
  const slate = (state.congressSlate ??= [-1, -1]);
  const draw = (): void => {
    const pool: number[] = [];
    for (let i = 0; i < CONGRESS_RESOLUTIONS.length; i++) {
      if (worldEra >= CONGRESS_RESOLUTIONS[i].minEra && worldEra <= CONGRESS_RESOLUTIONS[i].maxEra) pool.push(i);
    }
    slate[0] = slate[1] = -1;
    if (pool.length > 0) {
      const a = Math.floor(nextRandom(state) * pool.length);
      slate[0] = pool[a];
      pool.splice(a, 1);
    }
    if (pool.length > 0) slate[1] = pool[Math.floor(nextRandom(state) * pool.length)];
  };
  // a session whose slate was never announced (the FIRST one, or an
  // announcement that found nothing eligible) draws its own, now
  if (slate[0] === -1 && slate[1] === -1) draw();
  state.congress = [];
  [slate[0], slate[1]].filter((r) => r >= 0)
    .forEach((res, slot) => runResolution(state, res, slot, recorded, voters));
  if (worldEra >= CONGRESS_DV_MIN_ERA) runDvResolution(state, recorded);
  // ANNOUNCE the next session's slate (era-eligibility at announcement)
  draw();
}

function congressEffect(state: GameState, res: number): { outcome: number; target: number } | null {
  for (const a of state.congress ?? []) if (a.res === res) return a;
  return null;
}

/** Urban Development Treaty outcome A: the district whose buildings take
 * +100% production; null when not standing. */
export function congressUdtProdDistrict(state: GameState): DistrictId | null {
  const e = congressEffect(state, CONGRESS_UDT);
  return e && e.outcome === 0 ? PLACEABLE_DISTRICTS[e.target] ?? null : null;
}

/** Urban Development Treaty outcome B: the district whose buildings cannot
 * be created; null when not standing. */
export function congressUdtBlockedDistrict(state: GameState): DistrictId | null {
  const e = congressEffect(state, CONGRESS_UDT);
  return e && e.outcome === 1 ? PLACEABLE_DISTRICTS[e.target] ?? null : null;
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
export function congressGwMult(state: GameState): [number, number, number] {
  const e = congressEffect(state, CONGRESS_HERITAGE);
  const m: [number, number, number] = [1, 1, 1];
  if (e) m[e.target] = e.outcome === 0 ? CONGRESS_GW_MULT : 0;
  return m;
}

/** Mercenary Companies: the multiplier on a MILITARY unit's purchase price in
 *  `currency` (CONGRESS_CUR_GOLD / CONGRESS_CUR_FAITH). */
export function congressUnitBuyMult(state: GameState, currency: number): number {
  const e = congressEffect(state, CONGRESS_MERCENARY);
  if (!e || e.target !== currency) return 1;
  return e.outcome === 0 ? CONGRESS_PLUS_100 : CONGRESS_MINUS_50;
}

/** Trade Policy outcome A: the gold a route pays its SENDER for ending at the
 *  named seat. */
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

/** Policy Treaty outcome A: favor per turn for a seat holding the named card. */
export function congressPolicyFavor(state: GameState, slotted: readonly number[]): number {
  const e = congressEffect(state, CONGRESS_POLICY_TREATY);
  return e && e.outcome === 0 && slotted.includes(e.target) ? CONGRESS_POLICY_FAVOR : 0;
}

/** Policy Treaty outcome B: the POLICY_LIST index no seat may slot; -1 none. */
export function congressPolicyBlocked(state: GameState): number {
  const e = congressEffect(state, CONGRESS_POLICY_TREATY);
  return e && e.outcome === 1 ? e.target : -1;
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

/** Treaty Organization: the favor multiplier on being suzerain of a
 *  city-state of this type. */
export function congressSuzFavorMult(state: GameState, csType: number): number {
  const e = congressEffect(state, CONGRESS_TREATY_ORG);
  if (!e || e.target !== csType) return 1;
  return e.outcome === 0 ? CONGRESS_PLUS_100 : 0;
}

/** Sovereignty outcome A: the multiplier on the CITY-STATE's own yield to a
 *  route sent to a minor of this type. */
export function congressCsRouteMult(state: GameState, csType: number): number {
  const e = congressEffect(state, CONGRESS_SOVEREIGNTY);
  return e && e.outcome === 0 && e.target === csType ? CONGRESS_PLUS_100 : 1;
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

/** CIV6 (Global Energy Treaty, outcome A): "50% discount on the production
 *  of buildings of this type" — 1 where the treaty does not name this row. */
export function congressEnergyDiscount(state: GameState, buildingId: string): number {
  const e = congressEffect(state, CONGRESS_GLOBAL_ENERGY);
  if (!e || e.outcome !== 0 || POWER_PLANT_IDS[e.target] !== buildingId) return 1;
  return CONGRESS_ENERGY_DISCOUNT;
}

/** Outcome B: the plant "buildings of this type cannot be created by any
 *  player" names; null when the treaty is not standing that way. */
export function congressEnergyBlocked(state: GameState): string | null {
  const e = congressEffect(state, CONGRESS_GLOBAL_ENERGY);
  return e && e.outcome === 1 ? POWER_PLANT_IDS[e.target] ?? null : null;
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
