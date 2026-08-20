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
import type { CongressVote, DistrictId, GameState, GreatPersonClass, Seat } from './types';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { GP_CLASSES } from '../data/greatPeople';
import {
  CONGRESS_RESOLUTIONS, CONGRESS_UDT, CONGRESS_PATRONAGE, CONGRESS_MIGRATION,
  CONGRESS_HERITAGE, CONGRESS_DV_MIN_ERA, CONGRESS_DV_DELTA, CONGRESS_VOTE_STEP,
  CONGRESS_GPP_MULT, CONGRESS_GROWTH_A, CONGRESS_GROWTH_B, CONGRESS_MIG_LOYALTY,
  CONGRESS_GW_MULT, DVP_PER_RESOLUTION,
} from '../data/seats';

interface Vote { seat: number; outcome: number; target: number; weight: number }

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
function preference(state: GameState, res: number, seat: number): { outcome: number; target: number } {
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
function buyVotes(sx: Seat, want: number): { extra: number; spent: number } {
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

/** Outcome first (more votes; tie -> A), then target by plurality among the
 * winning outcome's votes (tie -> lower target index). */
function tally(votes: readonly Vote[], targetSpace: number): { outcome: number; target: number } {
  let a = 0, b = 0;
  for (const v of votes) { if (v.outcome === 0) a += v.weight; else b += v.weight; }
  const outcome = b > a ? 1 : 0;
  const tv = new Array<number>(targetSpace).fill(0);
  for (const v of votes) if (v.outcome === outcome) tv[v.target] += v.weight;
  return { outcome, target: argmaxLow(tv) };
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
    default: return state.seats.length;
  }
}

function clamp(v: number, hi: number): number {
  return Math.min(Math.max(Math.trunc(v), 0), hi);
}

function runResolution(state: GameState, res: number, slot: number,
                       recorded: readonly (CongressVote | null)[]): void {
  const space = targetSpaceSize(state, res);
  const votes: Vote[] = [];
  const spent = state.seats.map(() => 0);
  for (let c = 0; c < state.seats.length; c++) {
    const sx = state.seats[c];
    if (sx.cities.length === 0) continue;
    const v = recorded[c]?.[slot];
    const p = v ? { outcome: clamp(v[0], 1), target: clamp(v[1], space - 1) } : preference(state, res, c);
    // NO favor without an intent: the AI free-votes on a regular resolution.
    const bought = buyVotes(sx, v ? Math.max(0, Math.trunc(v[2])) : 0);
    spent[c] = bought.spent;
    votes.push({ seat: c, outcome: p.outcome, target: p.target, weight: 1 + bought.extra });
  }
  if (votes.length === 0) return;
  const win = tally(votes, space);
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
  const win = tally(votes, space);
  settle(state, votes, spent, win);
  const t = state.seats[win.target];
  t.diplomaticPoints = (t.diplomaticPoints ?? 0) + (win.outcome === 0 ? CONGRESS_DV_DELTA : -CONGRESS_DV_DELTA);
}

/** One Regular Session: two era-eligible resolutions off the deterministic
 * rotation, then the Diplomatic Victory resolution from Modern. The standing
 * effects REPLACE the previous session's and hold until the next one. */
export function congressSession(state: GameState, worldEra: number,
                                recorded: readonly (CongressVote | null)[]): void {
  state.congressSessions = (state.congressSessions ?? 0) + 1;
  const sess = state.congressSessions;
  const eligible: number[] = [];
  for (let i = 0; i < CONGRESS_RESOLUTIONS.length; i++) {
    if (worldEra >= CONGRESS_RESOLUTIONS[i].minEra && worldEra <= CONGRESS_RESOLUTIONS[i].maxEra) eligible.push(i);
  }
  state.congress = [];
  if (eligible.length > 0) {
    const s0 = eligible[(2 * (sess - 1)) % eligible.length];
    const s1 = eligible[(2 * (sess - 1) + 1) % eligible.length];
    (s0 === s1 ? [s0] : [s0, s1]).forEach((res, slot) => runResolution(state, res, slot, recorded));
  }
  if (worldEra >= CONGRESS_DV_MIN_ERA) runDvResolution(state, recorded);
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
