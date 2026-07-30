/**
 * Live-sync: rebuilds a mirrored GameState from a Lua.log that contains the
 * initial CIV6MAP dump plus one or more CIV6SYNC blocks (see LiveSync.lua).
 * Plot lines are deltas — every complete block is applied in order. The
 * mirror covers map, cities, districts, wonders, buildings, improvements,
 * ownership, research, government + policy cards, pantheon/beliefs, and
 * each city's current production (scaled onto our costs).
 */

import type { City, DistrictId, GameState, QueueItem, Tile } from './types';
import { playerSeat } from './seats';
import { parseCivExport } from './importer';
import { createGameFromMap, districtCost, settlerCost, projectCost } from './game';
import { tileIndex, inBounds, tilesWithin, hexDistance } from './hex';
import { governmentSlots } from './effects';
import { FEATURES } from '../data/features';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { GOVERNMENTS, POLICIES, cardFitsSlot } from '../data/policies';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS } from '../data/religion';
import { UNITS, ENCAMPMENT_HP } from '../data/units';
import { PROJECTS } from '../data/projects';

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

interface SyncQueue {
  civId: number;
  item: string;
  progress: number;
  cost: number;
}

/** Beliefs whose in-game names don't strip cleanly to our ids. */
const BELIEF_ALIASES: Record<string, string> = {
  LADY_OF_THE_REEDS_AND_MARSHES: 'LADY_OF_THE_REEDS',
};

/** Civ 6 project types → our project ids (matched by distinctive substring). */
const PROJECT_HINTS: [string, string][] = [
  ['RESEARCH_GRANTS', 'RESEARCH_GRANTS'],
  ['FESTIVAL', 'FESTIVAL'],
  ['PRAYER', 'PRAYERS'],
  ['INVESTMENT', 'INVESTMENT'],
  ['SHIPPING', 'SHIPPING'],
  ['TRAINING', 'TRAINING'],
];

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
  let government: string | null = null;
  let policyCards: string[] = [];
  let beliefs: string[] = [];
  let queues: SyncQueue[] = [];
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
    gov: string | null;
    policies: string[];
    beliefs: string[];
    queues: SyncQueue[];
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
        gov: null,
        policies: [],
        beliefs: [],
        queues: [],
        plots: [],
      };
    } else if (!cur) {
      continue;
    } else if (tag === 'CIV6SYNC_RESEARCH') {
      cur.techs = (parts[1] ?? '').split(',').filter(Boolean);
      cur.civics = (parts[2] ?? '').split(',').filter(Boolean);
    } else if (tag === 'CIV6SYNC_GOV') {
      cur.gov = parts[1] || null;
    } else if (tag === 'CIV6SYNC_POLICIES') {
      cur.policies = (parts[1] ?? '').split(',').filter(Boolean);
    } else if (tag === 'CIV6SYNC_BELIEFS') {
      cur.beliefs = (parts[1] ?? '').split(',').filter(Boolean);
    } else if (tag === 'CIV6SYNC_QUEUE') {
      cur.queues.push({
        civId: Number(parts[1]),
        item: parts[2] ?? '',
        progress: Number(parts[3]) || 0,
        cost: Number(parts[4]) || 0,
      });
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
      government = cur.gov;
      policyCards = cur.policies;
      beliefs = cur.beliefs;
      queues = cur.queues;
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
    if (TECHS[id]) playerSeat(state).research.techs.push(id);
    else skip(report, 'tech');
  }
  for (const c of civics) {
    const id = c.replace(/^CIVIC_/, '');
    if (CIVICS[id]) playerSeat(state).research.civics.push(id);
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
        if (type === 'ENCAMPMENT') tile.encampHp = ENCAMPMENT_HP; // B-17 (#71)
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

  // --- government & policy cards -----------------------------------------------
  // Applied after wonders so slot layouts see Forbidden City etc. Assignment
  // bypasses unlock checks: the real game is the authority here.
  if (government) {
    const id = government.replace(/^GOVERNMENT_/, '');
    if (GOVERNMENTS[id]) {
      playerSeat(state).government.current = id;
      playerSeat(state).government.policies = governmentSlots(state).map(() => null);
    } else {
      skip(report, 'government');
    }
  }
  for (const p of policyCards) {
    const id = p.replace(/^POLICY_/, '');
    const card = POLICIES[id];
    if (!card || !playerSeat(state).government.current) {
      skip(report, 'policy');
      continue;
    }
    const slots = governmentSlots(state);
    while (playerSeat(state).government.policies.length < slots.length) playerSeat(state).government.policies.push(null);
    const slot = slots.findIndex(
      (kind, i) => playerSeat(state).government.policies[i] === null && cardFitsSlot(card, kind),
    );
    if (slot >= 0) playerSeat(state).government.policies[slot] = id;
    else skip(report, 'policy');
  }

  // --- pantheon & beliefs ---------------------------------------------------------
  for (const b of beliefs) {
    let id = b.replace(/^BELIEF_/, '');
    id = BELIEF_ALIASES[id] ?? id;
    if (PANTHEONS[id]) {
      state.religion.pantheon = id;
    } else if (FOLLOWER_BELIEFS[id]) {
      state.religion.follower = id;
      state.religion.founded = true;
      state.religion.name ??= 'Synced religion';
    } else if (FOUNDER_BELIEFS[id]) {
      state.religion.founder = id;
      state.religion.founded = true;
      state.religion.name ??= 'Synced religion';
    } else {
      skip(report, 'belief');
    }
  }

  // --- current production (progress rescaled onto our costs) -----------------------
  for (const q of queues) {
    const ours = civIdToOurs.get(q.civId);
    const city = state.cities.find((c) => c.id === ours);
    if (!city) {
      skip(report, 'queue');
      continue;
    }
    const ratio = q.cost > 0 ? Math.max(0, Math.min(1, q.progress / q.cost)) : 0;
    const entry = queueEntryFor(state, city, q.item, ratio, report);
    if (entry) city.queue.push(entry);
  }

  return { state, report };
}

/** Map a Civ 6 production type onto one of our queue items (null = skipped). */
function queueEntryFor(
  state: GameState,
  city: City,
  item: string,
  ratio: number,
  report: SyncReport,
): QueueItem | null {
  if (item.startsWith('BUILDING_')) {
    const id = item.replace(/^BUILDING_/, '');
    if (BUILT_WONDERS[id]) {
      // The plot sync placed it (marked complete); demote to under-construction.
      const w = city.wonders.find((w) => w.id === id);
      if (!w) {
        skip(report, 'queue');
        return null;
      }
      state.map.tiles[w.tileIndex].builtWonderComplete = false;
      return { kind: 'wonder', wonder: id, tileIndex: w.tileIndex, progress: ratio * BUILT_WONDERS[id].cost };
    }
    if (BUILDINGS[id]) {
      return { kind: 'building', building: id, progress: ratio * BUILDINGS[id].cost };
    }
    skip(report, 'queue');
    return null;
  }
  if (item.startsWith('DISTRICT_')) {
    const type = DISTRICT_MAP[item];
    const inst = type ? city.districts.find((d) => d.type === type && d.tileIndex !== city.centerIndex) : undefined;
    if (!type || !inst) {
      skip(report, 'queue');
      return null;
    }
    const cost = districtCost(state);
    state.map.tiles[inst.tileIndex].districtComplete = false;
    return { kind: 'district', district: type, tileIndex: inst.tileIndex, progress: ratio * cost, cost };
  }
  if (item === 'UNIT_SETTLER') {
    const cost = settlerCost(state);
    return { kind: 'settler', progress: ratio * cost, cost };
  }
  if (item.startsWith('UNIT_')) {
    const id = item.replace(/^UNIT_/, '');
    if (UNITS[id]) return { kind: 'unit', unit: id, progress: ratio * UNITS[id].cost };
    skip(report, 'queue');
    return null;
  }
  if (item.startsWith('PROJECT_')) {
    const hit = PROJECT_HINTS.find(([hint]) => item.includes(hint));
    if (hit && PROJECTS[hit[1]]) {
      const cost = projectCost(state);
      return { kind: 'project', project: hit[1], progress: ratio * cost, cost };
    }
    skip(report, 'queue');
    return null;
  }
  skip(report, 'queue');
  return null;
}

export function syncSummary(report: SyncReport): string {
  const parts = [`turn ${report.turn}`, `${report.cities} city(ies)`, `${report.changedPlots} plot updates`];
  const skipped = Object.entries(report.skipped)
    .map(([k, n]) => `${n} ${k}(s)`)
    .join(', ');
  if (skipped) parts.push(`skipped: ${skipped}`);
  return parts.join(' · ');
}
