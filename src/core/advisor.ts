/**
 * Optimization advisors: district spot scoring, settle-site scoring, and
 * N-turn forward projections for comparing build choices. All advisors are
 * pure readers — projections run on a deep-cloned state.
 */

import type { City, DistrictId, GameState, Yields } from './types';
import { emptyYields, YIELD_KEYS } from './types';
import { tilesWithin, hexDistance } from './hex';
import { hasFreshWater, isCoastalLand } from './query';
import { tileYields, effectiveAdjacency } from './yields';
import { makeYieldCtx } from './effects';
import { canFoundCity, canPlaceDistrict, districtPlacementTiles, availableBuildings, availableWonders, wonderPlacementTiles } from './rules';
import { BUILT_WONDERS } from '../data/builtWonders';
import { computeCityStats } from './city';
import { serialize, deserialize, endTurn, queueDistrict, queueBuilding, queueWonder, cancelQueueItem } from './game';
import { RESOURCES } from '../data/resources';
import { DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { computeUnlocks } from './effects';
import { CITY_WORK_RADIUS } from '../data/constants';
import { tileForeignTo, PLAYER_CIV, playerSeat, isPlayerSeat, tileSeat, rivalsOf } from './seats';

/** Balanced yield weights used to value a tile's raw output. */
const YIELD_WEIGHTS: Yields = {
  food: 2,
  production: 2,
  gold: 1,
  science: 1.5,
  culture: 1.5,
  faith: 1,
};

function weightedSum(y: Yields): number {
  let s = 0;
  for (const k of YIELD_KEYS) s += y[k] * YIELD_WEIGHTS[k];
  return s;
}

// ---------------------------------------------------------------------------
// District spot advisor
// ---------------------------------------------------------------------------

export interface DistrictSpotScore {
  tileIndex: number;
  /** Adjacency bonus the district would enjoy there (policy multipliers included). */
  adjacency: number;
  /** Weighted value of the tile yields lost by paving the tile. */
  lostYieldScore: number;
  score: number;
}

/** Score every legal tile for a district, best first. */
export function scoreDistrictSpots(
  state: GameState,
  city: City,
  type: DistrictId,
): DistrictSpotScore[] {
  const ctx = makeYieldCtx(state);
  const out: DistrictSpotScore[] = [];
  for (const tileIndex of districtPlacementTiles(state, city, type)) {
    const tile = state.map.tiles[tileIndex];
    const adjacency = effectiveAdjacency(ctx, tile, type);
    const lostYieldScore = weightedSum(tileYields(ctx, tile));
    out.push({
      tileIndex,
      adjacency,
      lostYieldScore,
      // Adjacency yields repeat every turn forever; a paved tile only loses
      // its output while it would actually have been worked — weight accordingly.
      score: adjacency * 2.5 - lostYieldScore * 0.5,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.tileIndex - b.tileIndex);
}

// ---------------------------------------------------------------------------
// Settle-site advisor
// ---------------------------------------------------------------------------

export interface SettleSiteScore {
  tileIndex: number;
  score: number;
  /** Housing potential of the site (fresh water > coastal > dry). */
  housing: number;
  /** Ring-weighted workable-yield value (unclaimed tiles only). */
  yieldScore: number;
  /** Value of unclaimed resources in range (new luxuries score extra). */
  resourceScore: number;
}

const RING_WEIGHT = [0, 1, 0.6, 0.3];

/** Score every legal founding site, best first (top `limit`). */
export function scoreSettleSites(state: GameState, limit = 8): SettleSiteScore[] {
  const ctx = makeYieldCtx(state);
  const ownedLuxuries = new Set(
    state.map.tiles
      .filter((t) => isPlayerSeat(tileSeat(t)) && t.resource && RESOURCES[t.resource].category === 'luxury')
      .map((t) => t.resource!),
  );

  const out: SettleSiteScore[] = [];
  for (const site of state.map.tiles) {
    if (!canFoundCity(state, site.index).ok) continue;

    const housing = hasFreshWater(state.map, site) ? 10 : isCoastalLand(state.map, site) ? 5 : 0;
    let yieldScore = 0;
    let resourceScore = 0;
    for (const t of tilesWithin(state.map, site.col, site.row, CITY_WORK_RADIUS)) {
      if (t.index === site.index || isPlayerSeat(tileSeat(t))) continue; // don't count claimed tiles
      if (tileForeignTo(t, PLAYER_CIV)) continue; // foreign land
      const ring = hexDistance(site.col, site.row, t.col, t.row);
      yieldScore += weightedSum(tileYields(ctx, t)) * (RING_WEIGHT[ring] ?? 0);
      if (t.resource) {
        const cat = RESOURCES[t.resource].category;
        if (cat === 'luxury') resourceScore += ownedLuxuries.has(t.resource) ? 3 : 5;
        else if (cat === 'strategic') resourceScore += 2;
        else resourceScore += 1;
      }
    }
    // Settling in a rival's lap invites border friction and early wars.
    let rivalPenalty = 0;
    for (const rival of rivalsOf(state)) {
      for (const rc of rival.cities) {
        const rt = state.map.tiles[rc.centerIndex];
        const d = hexDistance(site.col, site.row, rt.col, rt.row);
        if (d < 8) rivalPenalty = Math.max(rivalPenalty, (8 - d) * 1.5);
      }
    }
    out.push({
      tileIndex: site.index,
      housing,
      yieldScore,
      resourceScore,
      score: housing + yieldScore * 0.35 + resourceScore - rivalPenalty,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.tileIndex - b.tileIndex).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Build-choice projections
// ---------------------------------------------------------------------------

export type BuildChoice =
  | { kind: 'none' }
  | { kind: 'building'; id: string }
  | { kind: 'district'; type: DistrictId; tileIndex: number }
  | { kind: 'wonder'; wonder: string; tileIndex: number };

export function choiceLabel(choice: BuildChoice): string {
  switch (choice.kind) {
    case 'none':
      return '(build nothing)';
    case 'building':
      return BUILDINGS[choice.id]?.name ?? choice.id;
    case 'district':
      return DISTRICTS[choice.type].name;
    case 'wonder':
      return BUILT_WONDERS[choice.wonder]?.name ?? choice.wonder;
  }
}

export interface Projection {
  choice: BuildChoice;
  label: string;
  /** null when the choice could not be queued (e.g. research missing). */
  error: string | null;
  pop: number;
  /** City yields per turn at the horizon. */
  yields: Yields;
  scienceTotal: number;
  cultureTotal: number;
  faithTotal: number;
  treasury: number;
  /** Things this city finished during the projection. */
  completed: string[];
  techs: number;
  civics: number;
}

/**
 * Deep-clone the game, clear the city's queue, queue `choice`, and simulate
 * `horizon` turns. Sandbox is forced off so production time is real.
 */
export function projectTurns(
  state: GameState,
  cityId: number,
  choice: BuildChoice,
  horizon: number,
): Projection {
  const clone = deserialize(serialize(state));
  clone.sandbox = false;
  const city = clone.cities.find((c) => c.id === cityId);
  const base: Projection = {
    choice,
    label: choiceLabel(choice),
    error: null,
    pop: 0,
    yields: emptyYields(),
    scienceTotal: 0,
    cultureTotal: 0,
    faithTotal: 0,
    treasury: 0,
    completed: [],
    techs: 0,
    civics: 0,
  };
  if (!city) return { ...base, error: 'No such city.' };

  while (city.queue.length > 0) cancelQueueItem(clone, cityId, 0);

  if (choice.kind === 'building') {
    const r = queueBuilding(clone, cityId, choice.id);
    if (!r.ok) return { ...base, error: r.reason ?? 'Cannot queue building.' };
  } else if (choice.kind === 'district') {
    const r = queueDistrict(clone, cityId, choice.type, choice.tileIndex);
    if (!r.ok) return { ...base, error: r.reason ?? 'Cannot place district.' };
  } else if (choice.kind === 'wonder') {
    const r = queueWonder(clone, cityId, choice.wonder, choice.tileIndex);
    if (!r.ok) return { ...base, error: r.reason ?? 'Cannot place wonder.' };
  }

  const buildingsBefore = new Set(city.buildings);
  const districtsBefore = new Set(
    city.districts.filter((d) => clone.map.tiles[d.tileIndex].districtComplete).map((d) => d.type),
  );

  for (let i = 0; i < horizon; i++) endTurn(clone);

  const stats = computeCityStats(clone, city);
  const completed: string[] = [];
  for (const b of city.buildings) {
    if (!buildingsBefore.has(b)) completed.push(BUILDINGS[b]?.name ?? b);
  }
  for (const d of city.districts) {
    if (clone.map.tiles[d.tileIndex].districtComplete && !districtsBefore.has(d.type)) {
      completed.push(DISTRICTS[d.type].name);
    }
  }

  return {
    ...base,
    pop: city.population,
    yields: stats.total,
    scienceTotal: playerSeat(clone).scienceTotal,
    cultureTotal: playerSeat(clone).cultureTotal,
    faithTotal: playerSeat(clone).faith,
    treasury: playerSeat(clone).treasury,
    completed,
    techs: playerSeat(clone).research.techs.length,
    civics: playerSeat(clone).research.civics.length,
  };
}

/**
 * Candidate choices worth comparing for a city right now, under real
 * (non-sandbox) rules: every available building plus each placeable district
 * at its best-scored tile. Always starts with the do-nothing baseline.
 */
export function compareCandidates(state: GameState, cityId: number): BuildChoice[] {
  const clone = deserialize(serialize(state));
  clone.sandbox = false;
  const city = clone.cities.find((c) => c.id === cityId);
  if (!city) return [{ kind: 'none' }];
  while (city.queue.length > 0) cancelQueueItem(clone, cityId, 0);

  const out: BuildChoice[] = [{ kind: 'none' }];
  for (const b of availableBuildings(clone, city)) {
    out.push({ kind: 'building', id: b.id });
  }
  const unlocks = computeUnlocks(clone);
  for (const type of PLACEABLE_DISTRICTS) {
    if (!unlocks.districts.has(type)) continue;
    const spots = scoreDistrictSpots(clone, city, type);
    if (spots.length === 0) continue;
    if (!canPlaceDistrict(clone, city, type, spots[0].tileIndex).ok) continue;
    out.push({ kind: 'district', type, tileIndex: spots[0].tileIndex });
  }
  for (const w of availableWonders(clone, city)) {
    const spots = wonderPlacementTiles(clone, city, w.id);
    if (spots.length > 0) out.push({ kind: 'wonder', wonder: w.id, tileIndex: spots[0] });
  }
  return out;
}
