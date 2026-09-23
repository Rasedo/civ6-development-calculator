import type { SeatEmitter } from './decideObs';
import type { GameState } from './types';
import { UNITS } from '../data/units';
import { MAX_CITIES_PER_SEAT } from '../data/seats';
import { atWarWithAny, citiesOf, seatOf } from './seats';
import {
  builderJobAt, digSites, engineerJobAt, foundSites, gpSiteKey, gpSiteTiles, jobCtx, parkSites, spreadSites,
  warCitySites, warImpSites,
} from './targetSites';

/**
 * THE UNIT TARGET LISTS (jobs, spread, found sites, digs, parks, Great Person sites, goody).
 *
 * The per-seat groups of the neutral observation this module emits, by the
 * GROUP NAME the GPU's `gpu/core/neutral.py` `seat_obs` uses for the same
 * group. The driver sends every registered group for every seat, and the gate
 * compares each one with the GPU's group of that name, field by field, before
 * the decide. A name the GPU does not emit is a red.
 */

export interface TargetsObs {
  jobs: number[];
  engJobs: number[];
  spread: number[];
  foundOk: number[];
  digs: number[];
  parks: number[];
  gpSites: number[][];
  goody: number[];
  warImps: number[];
  warCities: number[][];
}

/** the roster's Settler and Naturalist: the first unit carrying the flag */
const SETTLER_ID = Object.values(UNITS).find((u) => u.settler)?.id;
const NATURALIST_ID = Object.values(UNITS).find((u) => u.naturalist)?.id;

/** The `targets` group. Each list is filled only where the seat holds a unit
 *  that walks toward it: a Builder, Military Engineer, Archaeologist or
 *  Naturalist with a charge; a Missionary or Apostle with a charge once the
 *  seat founded a religion; any Settler under the city cap; a Great Person
 *  with a charge per site key. The Tribal Villages always, and the war
 *  march's improvements while the seat is at war with anyone. */
export function targetsObs(state: GameState, seat: number): TargetsObs {
  const out: TargetsObs = {
    jobs: [], engJobs: [], spread: [], foundOk: [], digs: [], parks: [], gpSites: [], goody: [], warImps: [], warCities: [],
  };
  const mine = state.units.filter((u) => u.seat === seat);
  const charged = mine.filter((u) => (u.charges ?? 0) > 0);
  const holds = (id: string | undefined) => id !== undefined && charged.some((u) => u.type === id);
  const actor = seatOf(state, seat);
  if (holds('BUILDER') || holds('MILITARY_ENGINEER')) {
    const ctx = jobCtx(state, seat);
    if (holds('BUILDER')) out.jobs = state.map.tiles.filter((t) => builderJobAt(state, ctx, t)).map((t) => t.index);
    if (holds('MILITARY_ENGINEER')) out.engJobs = state.map.tiles.filter((t) => engineerJobAt(state, ctx, t)).map((t) => t.index);
  }
  if (actor?.religion.founded && (holds('MISSIONARY') || holds('APOSTLE'))) out.spread = spreadSites(state, seat);
  if (SETTLER_ID !== undefined && mine.some((u) => u.type === SETTLER_ID)
    && citiesOf(state, seat).length < MAX_CITIES_PER_SEAT) out.foundOk = foundSites(state);
  if (holds('ARCHAEOLOGIST')) out.digs = digSites(state, seat);
  if (holds(NATURALIST_ID)) out.parks = parkSites(state, seat);
  const keys = new Map<string, [number, number]>();
  for (const u of charged) {
    const k = gpSiteKey(u);
    if (k && k[0] >= 0 && k[0] !== 1) keys.set(`${k[0]},${k[1]}`, k);
  }
  for (const [site, arg] of [...keys.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    for (const t of gpSiteTiles(state, seat, site, arg)) out.gpSites.push([site, arg, t]);
  }
  for (const t of state.map.tiles) if (t.goodyHut) out.goody.push(t.index);
  if (atWarWithAny(state, seat)) out.warImps = warImpSites(state, seat);
  out.warCities = warCitySites(state, seat);
  return out;
}

export const SEAT_GROUPS: Record<string, SeatEmitter> = {
  targets: targetsObs,
};
