/**
 * Scripted rival civilizations: real cities, territory and units on the map,
 * abstract economy underneath. They settle, grow, expand borders, race you
 * for great people, pantheons and beliefs, and can declare (or receive) war
 * — at-war units raid like barbarians, and cities can be conquered.
 */

import type { GameState, RivalCity, RivalCiv, Tile, Unit } from './types';
import { tilesWithin, hexDistance } from './hex';
import { isWater, isImpassable, hasFreshWater } from './query';
import { nextRandom } from './rand';
import { spawnUnit, unitsAt } from './units';
import { hostileUnitAct } from './combat';
import type { RuleResult } from './rules';
import { TERRAINS } from '../data/terrains';
import { FEATURES } from '../data/features';
import { RESOURCES } from '../data/resources';
import { UNITS } from '../data/units';
import { GP_CLASSES, GREAT_PEOPLE, gpCost } from '../data/greatPeople';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, RELIGION_NAMES } from '../data/religion';
import { growthFoodNeeded, CITY_MIN_DIST } from '../data/constants';
import {
  RIVAL_LEADERS,
  RIVAL_GROWTH_FACTOR,
  RIVAL_MAX_POP,
  RIVAL_MAX_CITIES,
  RIVAL_PROD_RATE,
  RIVAL_MIL_RATE,
  RIVAL_SETTLER_COST,
  RIVAL_BORDER_PERIOD,
  RIVAL_GPP_RATE,
  RIVAL_PANTHEON_TURN,
  RIVAL_RELIGION_TURN,
  RIVAL_WAR_MIN_TURNS,
  PEACE_MIN_WAR_TURNS,
  PEACE_GOLD_COST,
  RIVAL_CITY_MAX_HP,
} from '../data/rivals';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

const RIVAL_SPACING = 10;

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

function tileOwned(t: Tile): boolean {
  return t.cityId !== -1 || (t.csId ?? -1) !== -1 || (t.rivalId ?? -1) !== -1;
}

function siteQuality(state: GameState, tile: Tile): number {
  if (isWater(tile) || isImpassable(tile)) return -1;
  if (tile.wonder || tile.feature === 'OASIS' || tile.district) return -1;
  if (tileOwned(tile)) return -1;
  let q = hasFreshWater(state.map, tile) ? 8 : 0;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 2)) {
    if (isWater(t) || isImpassable(t) || tileOwned(t)) continue;
    const terrain = TERRAINS[t.terrain]?.yields ?? {};
    const feature = t.feature ? FEATURES[t.feature]?.yields ?? {} : {};
    const res = t.resource ? RESOURCES[t.resource]?.yields ?? {} : {};
    for (const src of [terrain, feature, res]) {
      q += (src.food ?? 0) * 1.2 + (src.production ?? 0) + (src.gold ?? 0) * 0.5;
    }
    if (t.elevation === 'HILLS') q += 0.5;
  }
  return q;
}

function nextCityName(rival: RivalCiv): string {
  const leader = RIVAL_LEADERS.find((l) => l.name === rival.name);
  const names = leader?.cityNames ?? [rival.name];
  const n = rival.nextCityId;
  return n < names.length ? names[n] : `${names[0]} ${n + 1}`;
}

function foundRivalCity(state: GameState, rival: RivalCiv, tile: Tile): RivalCity {
  const city: RivalCity = {
    id: rival.nextCityId++,
    name: nextCityName(rival),
    centerIndex: tile.index,
    population: rival.cities.length === 0 ? 3 : 1,
    growthBox: 0,
    tilesAcquired: 0,
    hp: RIVAL_CITY_MAX_HP,
    foundedTurn: state.turn,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  tile.rivalId = rival.id;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 1)) {
    if (!tileOwned(t) && !isWater(t)) t.rivalId = rival.id;
  }
  rival.cities.push(city);
  return city;
}

/** Place `count` rival civs on distant good sites (seeded, deterministic). */
export function placeRivals(state: GameState, count?: number): void {
  const land = state.map.tiles.filter((t) => !isWater(t) && !isImpassable(t)).length;
  const target = Math.min(
    RIVAL_LEADERS.length,
    count ?? Math.max(1, Math.min(3, Math.round(land / 350))),
  );

  const scored = state.map.tiles
    .map((t) => ({ t, q: siteQuality(state, t) }))
    .filter((s) => s.q > 0)
    .sort((a, b) => b.q - a.q || a.t.index - b.t.index);

  const picked: Tile[] = [];
  for (const { t } of scored) {
    if (picked.length >= target) break;
    if (picked.some((p) => hexDistance(p.col, p.row, t.col, t.row) < RIVAL_SPACING)) continue;
    if (
      state.cityStates.some((cs) => {
        const c = state.map.tiles[cs.centerIndex];
        return hexDistance(c.col, c.row, t.col, t.row) < 8;
      })
    ) {
      continue;
    }
    picked.push(t);
  }

  picked.forEach((tile, i) => {
    const leader = RIVAL_LEADERS[i % RIVAL_LEADERS.length];
    const rival: RivalCiv = {
      id: i,
      name: leader.name,
      color: leader.color,
      aggression: 0.3 + nextRandom(state) * 0.6,
      cities: [],
      nextCityId: 0,
      atWar: false,
      warTurns: 0,
      peaceTurns: 0,
      techLevel: 0,
      productionStock: 0,
      militaryStock: 0,
      gpp: {},
      pantheonClaimed: false,
      religionFounded: false,
    };
    foundRivalCity(state, rival, tile);
    spawnUnit(state, 'WARRIOR', tile.index, 'rival', rival.id);
    state.rivals.push(rival);
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function rivalUnits(state: GameState, rivalId?: number): Unit[] {
  return state.units.filter(
    (u) => u.owner === 'rival' && (rivalId === undefined || u.civId === rivalId),
  );
}

/** Rough military strength of the player (units + a base per city). */
export function playerStrength(state: GameState): number {
  let s = state.cities.length * 10;
  for (const u of state.units) {
    if (u.owner === 'player') s += UNITS[u.type]?.combat ?? 0;
  }
  return s;
}

export function rivalStrength(state: GameState, rival: RivalCiv): number {
  let s = rival.cities.length * 8 + rival.militaryStock * 0.2;
  for (const u of rivalUnits(state, rival.id)) s += UNITS[u.type]?.combat ?? 0;
  return Math.round(s);
}

function nearestDistance(state: GameState, a: number, bs: number[]): number {
  const at = state.map.tiles[a];
  let best = Infinity;
  for (const b of bs) {
    const bt = state.map.tiles[b];
    best = Math.min(best, hexDistance(at.col, at.row, bt.col, bt.row));
  }
  return best;
}

/** Distance between the closest player-city / rival-city pair. */
export function rivalProximity(state: GameState, rival: RivalCiv): number {
  if (state.cities.length === 0 || rival.cities.length === 0) return Infinity;
  let best = Infinity;
  for (const c of state.cities) {
    best = Math.min(
      best,
      nearestDistance(state, c.centerIndex, rival.cities.map((rc) => rc.centerIndex)),
    );
  }
  return best;
}

// ---------------------------------------------------------------------------
// Player diplomacy actions
// ---------------------------------------------------------------------------

export function declareWar(state: GameState, rivalId: number): RuleResult {
  const rival = state.rivals.find((r) => r.id === rivalId);
  if (!rival) return no('No such civilization.');
  if (rival.atWar) return no('Already at war.');
  rival.atWar = true;
  rival.warTurns = 0;
  state.eventLog.push(`War declared on ${rival.name}!`);
  return ok;
}

export function sueForPeace(state: GameState, rivalId: number): RuleResult {
  const rival = state.rivals.find((r) => r.id === rivalId);
  if (!rival) return no('No such civilization.');
  if (!rival.atWar) return no('Not at war.');
  if (rival.warTurns < PEACE_MIN_WAR_TURNS) {
    return no(`Too soon — they will not talk for another ${PEACE_MIN_WAR_TURNS - rival.warTurns} turns.`);
  }
  const cost = PEACE_GOLD_COST(rival.warTurns);
  if (!state.sandbox) {
    if (state.treasury < cost) return no(`Peace costs ${cost} gold right now.`);
    state.treasury -= cost;
  }
  makePeace(state, rival);
  return ok;
}

function makePeace(state: GameState, rival: RivalCiv): void {
  rival.atWar = false;
  rival.warTurns = 0;
  rival.peaceTurns = 0;
  state.eventLog.push(`Peace with ${rival.name}.`);
}

// ---------------------------------------------------------------------------
// Per-turn phase
// ---------------------------------------------------------------------------

function expandRivalBorder(state: GameState, rival: RivalCiv, city: RivalCity): void {
  const center = state.map.tiles[city.centerIndex];
  let best: Tile | null = null;
  let bestScore = -Infinity;
  for (const t of tilesWithin(state.map, center.col, center.row, 3)) {
    if (tileOwned(t) || isWater(t) || isImpassable(t) || t.wonder) continue;
    const adjOwn = tilesWithin(state.map, t.col, t.row, 1).some(
      (n) => n.index !== t.index && (n.rivalId ?? -1) === rival.id,
    );
    if (!adjOwn) continue;
    const dist = hexDistance(center.col, center.row, t.col, t.row);
    const score = (t.resource ? 3 : 0) - dist * 2 - t.index / 1e6;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best) {
    best.rivalId = rival.id;
    city.tilesAcquired += 1;
  }
}

function tryFoundCity(state: GameState, rival: RivalCiv): void {
  // Expand near home: best site within reach of the existing cities.
  let best: Tile | null = null;
  let bestQ = 3; // don't settle garbage
  for (const rc of rival.cities) {
    const center = state.map.tiles[rc.centerIndex];
    for (const t of tilesWithin(state.map, center.col, center.row, 7)) {
      const q = siteQuality(state, t);
      if (q <= bestQ) continue;
      const tooClose =
        state.cities.some(
          (c) =>
            hexDistance(state.map.tiles[c.centerIndex].col, state.map.tiles[c.centerIndex].row, t.col, t.row) <
            CITY_MIN_DIST,
        ) ||
        state.cityStates.some(
          (cs) =>
            hexDistance(state.map.tiles[cs.centerIndex].col, state.map.tiles[cs.centerIndex].row, t.col, t.row) <
            CITY_MIN_DIST,
        ) ||
        state.rivals.some((r) =>
          r.cities.some(
            (c) =>
              hexDistance(state.map.tiles[c.centerIndex].col, state.map.tiles[c.centerIndex].row, t.col, t.row) <
              CITY_MIN_DIST + 1,
          ),
        );
      if (tooClose) continue;
      bestQ = q;
      best = t;
    }
  }
  if (best) {
    rival.productionStock -= RIVAL_SETTLER_COST(rival.cities.length);
    const city = foundRivalCity(state, rival, best);
    state.eventLog.push(`${rival.name} founded ${city.name}.`);
  }
}

function claimGreatPeople(state: GameState, rival: RivalCiv): void {
  for (const cls of GP_CLASSES) {
    rival.gpp[cls] = (rival.gpp[cls] ?? 0) + rival.cities.length * RIVAL_GPP_RATE;
    const earned = state.greatPeople.earned.filter((id) =>
      GREAT_PEOPLE[cls].some((p) => p.id === id),
    ).length;
    const person = GREAT_PEOPLE[cls][earned];
    if (!person) continue;
    if ((rival.gpp[cls] ?? 0) >= gpCost(earned)) {
      rival.gpp[cls] = 0;
      state.greatPeople.earned.push(person.id); // gone from the shared pool
      state.eventLog.push(`${rival.name} claimed ${person.name}.`);
    }
  }
}

function claimBeliefs(state: GameState, rival: RivalCiv): void {
  if (!rival.pantheonClaimed && state.turn >= RIVAL_PANTHEON_TURN + rival.id * 8) {
    const open = Object.keys(PANTHEONS).filter(
      (id) => id !== state.religion.pantheon && !state.claimedPantheons.includes(id),
    );
    if (open.length > 0) {
      const pick = open[Math.floor(nextRandom(state) * open.length)];
      state.claimedPantheons.push(pick);
      rival.pantheonClaimed = true;
      state.eventLog.push(`${rival.name} founded a pantheon (${PANTHEONS[pick].name} is taken).`);
    }
  }
  if (!rival.religionFounded && state.turn >= RIVAL_RELIGION_TURN + rival.id * 12) {
    const followers = Object.keys(FOLLOWER_BELIEFS).filter(
      (id) => id !== state.religion.follower && !state.claimedBeliefs.includes(id),
    );
    const founders = Object.keys(FOUNDER_BELIEFS).filter(
      (id) => id !== state.religion.founder && !state.claimedBeliefs.includes(id),
    );
    if (followers.length > 0 && founders.length > 0) {
      state.claimedBeliefs.push(followers[Math.floor(nextRandom(state) * followers.length)]);
      state.claimedBeliefs.push(founders[Math.floor(nextRandom(state) * founders.length)]);
      rival.religionFounded = true;
      const name = RELIGION_NAMES[(rival.id + 1) % RELIGION_NAMES.length];
      state.eventLog.push(`${rival.name} founded ${name} — two beliefs left the pool.`);
    }
  }
}

/** Peacetime patrol: drift back toward the nearest own city. */
function patrol(state: GameState, rival: RivalCiv, unit: Unit): void {
  if (rival.cities.length === 0 || unit.movesLeft <= 0) return;
  const here = state.map.tiles[unit.tileIndex];
  const homeIdx = rival.cities
    .map((c) => c.centerIndex)
    .sort((a, b) => nearestDistance(state, unit.tileIndex, [a]) - nearestDistance(state, unit.tileIndex, [b]))[0];
  const home = state.map.tiles[homeIdx];
  if (hexDistance(here.col, here.row, home.col, home.row) <= 3) return;
  const step = tilesWithin(state.map, here.col, here.row, 1)
    .filter((t) => t.index !== here.index && !isWater(t) && !isImpassable(t))
    .filter((t) => unitsAt(state, t.index).length === 0)
    .sort(
      (a, b) =>
        hexDistance(a.col, a.row, home.col, home.row) - hexDistance(b.col, b.row, home.col, home.row),
    )[0];
  if (step && hexDistance(step.col, step.row, home.col, home.row) < hexDistance(here.col, here.row, home.col, home.row)) {
    unit.tileIndex = step.index;
    unit.movesLeft = 0;
  }
}

export function rivalPhase(state: GameState): void {
  if (state.rivals.length === 0) return;

  // Rival units get their movement in this phase (like barbarians).
  for (const u of state.units) {
    if (u.owner === 'rival') u.movesLeft = UNITS[u.type]?.moves ?? 2;
  }

  for (const rival of state.rivals) {
    if (rival.cities.length === 0) continue; // eliminated
    rival.techLevel += 0.15 + 0.05 * rival.cities.length;

    // Cities: growth, borders, healing.
    for (const rc of rival.cities) {
      rc.growthBox += 2 + rc.population * 0.25;
      const need = growthFoodNeeded(rc.population) * RIVAL_GROWTH_FACTOR;
      if (rc.growthBox >= need && rc.population < RIVAL_MAX_POP) {
        rc.population += 1;
        rc.growthBox = 0;
      }
      if ((state.turn + rc.id * 3) % RIVAL_BORDER_PERIOD === 0) {
        expandRivalBorder(state, rival, rc);
      }
      rc.hp = Math.min(RIVAL_CITY_MAX_HP, rc.hp + (rival.atWar ? 5 : 15));
    }

    // Stocks and spending.
    const popSum = rival.cities.reduce((s, c) => s + c.population, 0);
    rival.productionStock += popSum * RIVAL_PROD_RATE * (0.7 + rival.aggression * 0.6);
    rival.militaryStock += popSum * RIVAL_MIL_RATE * (0.7 + rival.aggression * 0.6);

    if (
      rival.cities.length < RIVAL_MAX_CITIES &&
      rival.productionStock >= RIVAL_SETTLER_COST(rival.cities.length)
    ) {
      tryFoundCity(state, rival);
    }

    const units = rivalUnits(state, rival.id);
    const unitCap = rival.cities.length * 2 + (rival.atWar ? 3 : 1);
    const unitCost = 45 + rival.techLevel * 2;
    if (units.length < unitCap && rival.militaryStock >= unitCost) {
      rival.militaryStock -= unitCost;
      const type = rival.techLevel > 12 ? 'HORSEMAN' : rival.techLevel > 6 ? 'SPEARMAN' : 'WARRIOR';
      const homeCity = rival.cities[Math.floor(nextRandom(state) * rival.cities.length)];
      spawnUnit(state, type, homeCity.centerIndex, 'rival', rival.id);
    }

    // Races: great people, pantheons, beliefs.
    claimGreatPeople(state, rival);
    claimBeliefs(state, rival);

    // War and peace.
    if (rival.atWar) {
      rival.warTurns += 1;
      for (const unit of rivalUnits(state, rival.id)) {
        if (unit.movesLeft > 0) hostileUnitAct(state, unit);
      }
      if (rival.warTurns >= RIVAL_WAR_MIN_TURNS && nextRandom(state) < 0.25) {
        makePeace(state, rival);
      }
    } else {
      rival.peaceTurns += 1;
      for (const unit of rivalUnits(state, rival.id)) patrol(state, rival, unit);
      if (
        state.cities.length > 0 &&
        rival.peaceTurns > 20 &&
        rivalProximity(state, rival) <= 9 &&
        rivalStrength(state, rival) > playerStrength(state) * 1.3 &&
        nextRandom(state) < 0.08 * (0.5 + rival.aggression)
      ) {
        rival.atWar = true;
        rival.warTurns = 0;
        state.eventLog.push(`${rival.name} declares war on you!`);
      }
    }
  }
}
