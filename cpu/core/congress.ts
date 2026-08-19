/**
 * WORLD CONGRESS sessions and the standing-resolution readers. The session
 * mechanics (vote cost curve, outcome-then-target plurality, the +1 DVP to
 * every winning-combo voter, refund tiers, the always-3rd Diplomatic Victory
 * resolution) are sourced verbatim at the catalog (data/seats.ts). The
 * CHOOSER is scripted — see the same comment block; putting the vote on the
 * wire is an open AUDIT item.
 */
import type { DistrictId, GameState, GreatPersonClass } from './types';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { GP_CLASSES } from '../data/greatPeople';
import {
  CONGRESS_RESOLUTIONS, CONGRESS_UDT, CONGRESS_PATRONAGE, CONGRESS_MIGRATION,
  CONGRESS_HERITAGE, CONGRESS_DV_MIN_ERA, CONGRESS_DV_DELTA, CONGRESS_VOTE_STEP,
  CONGRESS_GPP_MULT, CONGRESS_GROWTH_A, CONGRESS_GROWTH_B, CONGRESS_MIG_LOYALTY,
  CONGRESS_GW_MULT, DVP_PER_RESOLUTION,
} from '../data/seats';

interface Vote { seat: number; outcome: number; target: number; weight: number }

/** Argmax with ties to the LOWER index — the shared tie rule of every
 * congress scan on both engines. */
function argmaxLow(counts: readonly number[]): number {
  let best = -Infinity, at = 0;
  for (let i = 0; i < counts.length; i++) if (counts[i] > best) { best = counts[i]; at = i; }
  return at;
}

/** The scripted free-vote preference for a non-DV resolution: outcome A on
 * the target the voter holds the most of (self for the Migration Treaty). */
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

function targetSpaceSize(state: GameState, res: number): number {
  switch (CONGRESS_RESOLUTIONS[res].target) {
    case 'district': return PLACEABLE_DISTRICTS.length;
    case 'gpClass': return GP_CLASSES.length;
    case 'gwKind': return 3;
    default: return state.seats.length;
  }
}

function runResolution(state: GameState, res: number): void {
  const votes: Vote[] = [];
  for (let c = 0; c < state.seats.length; c++) {
    if (state.seats[c].cities.length === 0) continue;
    const p = preference(state, res, c);
    votes.push({ seat: c, outcome: p.outcome, target: p.target, weight: 1 });
  }
  if (votes.length === 0) return;
  const win = tally(votes, targetSpaceSize(state, res));
  for (const v of votes) {
    if (v.outcome !== win.outcome || v.target !== win.target) continue;
    const sx = state.seats[v.seat];
    sx.diplomaticPoints = (sx.diplomaticPoints ?? 0) + DVP_PER_RESOLUTION;
  }
  state.congress!.push({ res, outcome: win.outcome, target: win.target });
}

/** The Diplomatic Victory resolution: every civ pours ALL its favor into
 * this vote (the scripted spend), the leader votes A on itself, everyone
 * else B on the leader. Refunds by tier; the +/-2 DVP applies immediately
 * (no clamp — the win check is a >= threshold, so negative points are
 * harmless and un-invented). */
function runDvResolution(state: GameState): void {
  let leader = -1, bestP = -Infinity;
  for (let c = 0; c < state.seats.length; c++) {
    if (state.seats[c].cities.length === 0) continue;
    const p = state.seats[c].diplomaticPoints ?? 0;
    if (p > bestP) { bestP = p; leader = c; }
  }
  if (leader < 0) return;
  const votes: Vote[] = [];
  const spent = state.seats.map(() => 0);
  for (let c = 0; c < state.seats.length; c++) {
    const sx = state.seats[c];
    if (sx.cities.length === 0) continue;
    let favor = sx.diplomaticFavor ?? 0, extra = 0;
    while (favor >= CONGRESS_VOTE_STEP * (extra + 1)) {
      favor -= CONGRESS_VOTE_STEP * (extra + 1);
      extra++;
    }
    spent[c] = (sx.diplomaticFavor ?? 0) - favor;
    sx.diplomaticFavor = favor;
    votes.push({ seat: c, outcome: c === leader ? 0 : 1, target: leader, weight: 1 + extra });
  }
  if (votes.length === 0) return;
  const win = tally(votes, state.seats.length);
  for (const v of votes) {
    const sx = state.seats[v.seat];
    if (v.outcome !== win.outcome) sx.diplomaticFavor += spent[v.seat];
    else if (v.target !== win.target) sx.diplomaticFavor += Math.floor(spent[v.seat] / 2);
    else sx.diplomaticPoints = (sx.diplomaticPoints ?? 0) + DVP_PER_RESOLUTION;
  }
  const t = state.seats[win.target];
  t.diplomaticPoints = (t.diplomaticPoints ?? 0) + (win.outcome === 0 ? CONGRESS_DV_DELTA : -CONGRESS_DV_DELTA);
}

/** One Regular Session: two era-eligible resolutions off the deterministic
 * rotation, then the Diplomatic Victory resolution from Modern. The standing
 * effects REPLACE the previous session's and hold until the next one. */
export function congressSession(state: GameState, worldEra: number): void {
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
    for (const res of s0 === s1 ? [s0] : [s0, s1]) runResolution(state, res);
  }
  if (worldEra >= CONGRESS_DV_MIN_ERA) runDvResolution(state);
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
