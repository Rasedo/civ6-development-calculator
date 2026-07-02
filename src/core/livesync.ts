/**
 * Live-sync: rebuilds a mirrored GameState from a Lua.log that contains the
 * initial CIV6MAP dump plus one or more CIV6SYNC blocks (see LiveSync.lua).
 * Plot lines are deltas — every complete block is applied in order. The
 * mirror is structural: map, cities, districts, wonders, buildings,
 * improvements, ownership and research. Queues, policies and religion picks
 * stay local (set them by hand if you want the advisors to see them).
 */

import type { City, DistrictId, GameState, Tile } from './types';
import { parseCivExport } from './importer';
import { createGameFromMap } from './game';
import { tileIndex, inBounds, tilesWithin, hexDistance } from './hex';
import { FEATURES } from '../data/features';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';

const DISTRICT_MAP: Record<string, DistrictId> = {
  DISTRICT_CITY_CENTER: 'CITY_CENTER',
  DISTRICT_CAMPUS: 'CAMPUS',
  DISTRICT_HOLY_SITE: 'HOLY_SITE',
  DISTRICT_THEATER: 'THEATER_SQUARE',
  DISTRICT_COMMERCIAL_HUB: 'COMMERCIAL_HUB',
  DISTRICT_HARBOR: 'HARBOR',
  DISTRICT_INDUSTRIAL_ZONE: 'INDUSTRIAL_ZONE',
  DISTRICT_ENCAMPMENT: 'ENCAMPMENT',
  DISTRICT_AQUEDUCT: 'AQUEDUCT',
  DISTRICT_ENTERTAINMENT_COMPLEX: 'ENTERTAINMENT_COMPLEX',
  DISTRICT_NEIGHBORHOOD: 'NEIGHBORHOOD',
};

interface SyncCity {
  civId: number;
  x: number;
  y: number;
  pop: number;
  name: string;
}

interface PlotDelta {
  improvement: string;
  district: string;
  wonder: string;
  owner: number;
}

export interface SyncReport {
  turn: number;
  cities: number;
  changedPlots: number;
  skipped: Record<string, number>;
}

export interface SyncResult {
  state: GameState;
  report: SyncReport;
}

function skip(report: SyncReport, what: string): void {
  report.skipped[what] = (report.skipped[what] ?? 0) + 1;
}

/** Parse a full Lua.log with map dump + sync blocks into a mirrored state. */
export function parseLiveSync(text: string): SyncResult {
  const { map } = parseCivExport(text); // throws without the initial map dump

  let turn = 1;
  let localPlayer = 0;
  let techs: string[] = [];
  let civics: string[] = [];
  let cities: SyncCity[] = [];
  let cityBuildings = new Map<number, string[]>();
  const plots = new Map<number, PlotDelta>(); // cumulative across blocks

  // Buffers for the block being read; committed on CIV6SYNC_END so a
  // half-written trailing block never corrupts the mirror.
  let cur: {
    turn: number;
    player: number;
    techs: string[];
    civics: string[];
    cities: SyncCity[];
    blds: Map<number, string[]>;
    plots: [number, PlotDelta][];
  } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const at = raw.indexOf('CIV6SYNC');
    if (at === -1) continue;
    const parts = raw.slice(at).trim().split('|');
    const tag = parts[0];

    if (tag === 'CIV6SYNC_BEGIN') {
      cur = {
        turn: Number(parts[1]) || 1,
        player: Number(parts[2]) || 0,
        techs: [],
        civics: [],
        cities: [],
        blds: new Map(),
        plots: [],
      };
    } else if (!cur) {
      continue;
    } else if (tag === 'CIV6SYNC_RESEARCH') {
      cur.techs = (parts[1] ?? '').split(',').filter(Boolean);
      cur.civics = (parts[2] ?? '').split(',').filter(Boolean);
    } else if (tag === 'CIV6SYNC_CITY') {
      cur.cities.push({
        civId: Number(parts[1]),
        x: Number(parts[2]),
        y: Number(parts[3]),
        pop: Math.max(1, Number(parts[4]) || 1),
        name: parts[5] ?? 'City',
      });
    } else if (tag === 'CIV6SYNC_CITYBLD') {
      cur.blds.set(Number(parts[1]), (parts[2] ?? '').split(',').filter(Boolean));
    } else if (tag === 'CIV6SYNC_PLOT') {
      const x = Number(parts[1]);
      const y = Number(parts[2]);
      if (!inBounds(map, x, y)) continue;
      cur.plots.push([
        tileIndex(map, x, y),
        { improvement: parts[3], district: parts[4], wonder: parts[5], owner: Number(parts[6]) },
      ]);
    } else if (tag === 'CIV6SYNC_END') {
      turn = cur.turn;
      localPlayer = cur.player;
      techs = cur.techs;
      civics = cur.civics;
      cities = cur.cities;
      cityBuildings = cur.blds;
      for (const [i, delta] of cur.plots) plots.set(i, delta);
      cur = null;
    }
  }

  const report: SyncReport = { turn, cities: cities.length, changedPlots: plots.size, skipped: {} };
  const state = createGameFromMap(map);
  state.turn = turn;

  // --- research ---------------------------------------------------------------
  for (const t of techs) {
    const id = t.replace(/^TECH_/, '');
    if (TECHS[id]) state.research.techs.push(id);
    else skip(report, 'tech');
  }
  for (const c of civics) {
    const id = c.replace(/^CIVIC_/, '');
    if (CIVICS[id]) state.research.civics.push(id);
    else skip(report, 'civic');
  }

  // --- cities -----------------------------------------------------------------
  const civIdToOurs = new Map<number, number>();
  for (const sc of cities) {
    if (!inBounds(map, sc.x, sc.y)) {
      skip(report, 'city');
      continue;
    }
    const center = map.tiles[tileIndex(map, sc.x, sc.y)];
    const id = state.nextCityId++;
    civIdToOurs.set(sc.civId, id);
    const city: City = {
      id,
      name: sc.name,
      centerIndex: center.index,
      population: sc.pop,
      foodBox: 0,
      cultureBox: 0,
      tilesAcquired: 0,
      lockedTiles: [],
      focus: 'balanced',
      queue: [],
      isCapital: state.cities.length === 0,
      buildings: [],
      districts: [{ type: 'CITY_CENTER', tileIndex: center.index }],
      wonders: [],
      specialists: {},
    };
    center.district = 'CITY_CENTER';
    center.districtComplete = true;
    center.improvement = null;
    if (center.feature && FEATURES[center.feature].removable) center.feature = null;
    for (const t of tilesWithin(map, center.col, center.row, 1)) {
      if (t.cityId === -1) t.cityId = id;
    }
    center.cityId = id;
    state.cities.push(city);
  }

  const nearestCity = (tile: Tile, maxDist: number): City | null => {
    let best: City | null = null;
    let bestDist = maxDist + 1;
    for (const c of state.cities) {
      const ct = map.tiles[c.centerIndex];
      const d = hexDistance(ct.col, ct.row, tile.col, tile.row);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  };

  // --- plots: ownership first, then structures ----------------------------------
  for (const [i, delta] of plots) {
    const tile = map.tiles[i];
    if (delta.owner === localPlayer && tile.cityId === -1) {
      const c = nearestCity(tile, 5);
      if (c) tile.cityId = c.id;
    }
  }
  for (const [i, delta] of plots) {
    const tile = map.tiles[i];

    if (delta.improvement !== '-') {
      const id = delta.improvement.replace(/^IMPROVEMENT_/, '');
      if (id in IMPROVEMENTS) tile.improvement = id;
      else skip(report, 'improvement');
    }

    if (delta.district !== '-' && delta.district !== 'DISTRICT_CITY_CENTER') {
      const type = DISTRICT_MAP[delta.district];
      const owner = state.cities.find((c) => c.id === tile.cityId) ?? nearestCity(tile, 3);
      if (type && DISTRICTS[type] && owner) {
        tile.district = type;
        tile.districtComplete = true;
        tile.improvement = null;
        owner.districts.push({ type, tileIndex: i });
      } else {
        skip(report, 'district');
      }
    }

    if (delta.wonder !== '-') {
      const id = delta.wonder.replace(/^BUILDING_/, '');
      const owner = state.cities.find((c) => c.id === tile.cityId) ?? nearestCity(tile, 3);
      if (BUILT_WONDERS[id] && owner) {
        tile.builtWonder = id;
        tile.builtWonderComplete = true;
        owner.wonders.push({ id, tileIndex: i });
      } else {
        skip(report, 'wonder');
      }
    }
  }

  // --- city buildings -------------------------------------------------------------
  for (const [civId, blds] of cityBuildings) {
    const ours = civIdToOurs.get(civId);
    const city = state.cities.find((c) => c.id === ours);
    if (!city) continue;
    for (const b of blds) {
      const id = b.replace(/^BUILDING_/, '');
      if (BUILT_WONDERS[id]) continue; // wonders arrive via plot lines
      if (BUILDINGS[id]) {
        city.buildings.push(id);
        // A synced worship building implies the religion choice behind it.
        if (BUILDINGS[id].worship) {
          state.religion.worship = id;
          state.religion.founded = true;
          state.religion.name ??= 'Synced religion';
        }
      } else {
        skip(report, 'building');
      }
    }
  }

  return { state, report };
}

export function syncSummary(report: SyncReport): string {
  const parts = [`turn ${report.turn}`, `${report.cities} city(ies)`, `${report.changedPlots} plot updates`];
  const skipped = Object.entries(report.skipped)
    .map(([k, n]) => `${n} ${k}(s)`)
    .join(', ');
  if (skipped) parts.push(`skipped: ${skipped}`);
  return parts.join(' · ');
}
