/**
 * Combat and barbarians (eyeballed Civ 6). Damage uses the classic
 * 30·e^(0.04·Δstrength)·rand(0.75–1.25) curve, with +3 defense on
 * hills/woods/rainforest/marsh. Barbarian camps spawn in the wilds, garrison
 * themselves, and send raiders that pillage improvements and batter cities;
 * cities at 0 HP are sacked (population/gold loss, nearby pillaging), not
 * captured. All randomness flows through the in-state RNG.
 */

import type { City, CityState, GameState, RivalCity, RivalCiv, Tile, Unit } from './types';
import { neighbors, hexDistance, tilesWithin } from './hex';
import { isWater, isImpassable } from './query';
import { UNITS, UNIT_HP, CITY_MAX_HP } from '../data/units';
import { CS_MAX_HP } from '../data/cityStates';
import { cityStateAt } from './cityStates';
import {
  nextRandom,
  unitsAt,
  unitDomain,
  unitPassable,
  tileFreeForUnit,
  spawnUnit,
  disbandUnit,
  unitsHostile,
  rivalCityAt,
} from './units';
import { revealAround } from './fog';
import { CITY_WORK_RADIUS } from '../data/constants';
import type { RuleResult } from './rules';
import { tileForeignTo, tileOwnedByCiv, civOfRival, PLAYER_CIV } from './civs';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export const CAMP_CLEAR_REWARD = 50;
export const MAX_BARB_PER_CAMP = 3;

// ---------------------------------------------------------------------------
// Combat math
// ---------------------------------------------------------------------------

export function terrainDefense(tile: Tile): number {
  let d = 0;
  if (tile.elevation === 'HILLS') d += 3;
  if (tile.feature === 'WOODS' || tile.feature === 'RAINFOREST' || tile.feature === 'MARSH') d += 3;
  return d;
}

function damageRoll(state: GameState, strengthDiff: number): number {
  const base = 30 * Math.exp(0.04 * strengthDiff);
  return Math.max(1, Math.round(base * (0.75 + 0.5 * nextRandom(state))));
}

export function cityDefenseStrength(state: GameState, city: City): number {
  const garrison = unitsAt(state, city.centerIndex).find((u) => unitDomain(u.type) === 'military');
  const garrisonCS = garrison ? UNITS[garrison.type]?.combat ?? 0 : 0;
  return Math.max(15, garrisonCS) + Math.floor(city.population / 2);
}

export function getCityHp(state: GameState, cityId: number): number {
  return state.cityHp[String(cityId)] ?? CITY_MAX_HP;
}

function killUnit(state: GameState, unit: Unit): void {
  disbandUnit(state, unit.id);
}

/** Sack: population and gold loss, improvements around the center pillaged. */
function sackCity(state: GameState, city: City): void {
  city.population = Math.max(1, Math.floor(city.population * 0.75));
  state.treasury -= Math.min(100, Math.round(state.treasury * 0.2));
  const center = state.map.tiles[city.centerIndex];
  for (const t of neighbors(state.map, center)) {
    if (t.improvement && !t.pillaged) t.pillaged = true;
  }
  state.cityHp[String(city.id)] = Math.round(CITY_MAX_HP / 2);
}

function attackCity(state: GameState, attacker: Unit, city: City): void {
  const atkCS = UNITS[attacker.type]?.combat ?? 0;
  const defCS = cityDefenseStrength(state, city);
  const dmgToCity = damageRoll(state, atkCS - defCS);
  const dmgToAttacker = damageRoll(state, defCS - atkCS);
  state.cityHp[String(city.id)] = getCityHp(state, city.id) - dmgToCity;
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
  if (getCityHp(state, city.id) <= 0) sackCity(state, city);
}

/** Melee attack an adjacent enemy unit or city tile. */
export function meleeAttack(state: GameState, attackerId: number, targetIndex: number): RuleResult {
  const attacker = state.units.find((u) => u.id === attackerId);
  if (!attacker) return no('No such unit.');
  const def = UNITS[attacker.type];
  if (!def || def.combat <= 0) return no('Civilians cannot attack.');
  if (attacker.movesLeft <= 0) return no('No movement left.');
  const from = state.map.tiles[attacker.tileIndex];
  const target = state.map.tiles[targetIndex];
  if (hexDistance(from.col, from.row, target.col, target.row) !== 1) {
    return no('Target must be adjacent.');
  }

  const enemies = unitsAt(state, targetIndex).filter((u) => unitsHostile(state, attacker, u));
  const hostileToPlayer = attacker.owner !== 'player' && unitsHostile(state, attacker, { owner: 'player' });
  const enemyCity =
    target.district === 'CITY_CENTER' && hostileToPlayer
      ? state.cities.find((c) => c.centerIndex === targetIndex)
      : undefined;
  const rivalTarget =
    attacker.owner === 'player' || attacker.owner === 'barbarian'
      ? rivalCityAt(state, targetIndex)
      : undefined;
  const csTarget =
    attacker.owner === 'player'
      ? (() => {
          const cs = cityStateAt(state, targetIndex);
          return cs && cs.centerIndex === targetIndex ? cs : undefined;
        })()
      : undefined;

  if (enemies.length === 0 && !enemyCity && !rivalTarget && !csTarget) {
    return no('Nothing to attack there.');
  }

  if (enemyCity) {
    attackCity(state, attacker, enemyCity);
    return ok;
  }

  if (enemies.length === 0 && rivalTarget) {
    if (attacker.owner === 'player' && !rivalTarget.rival.atWar) {
      return no(`You are at peace with ${rivalTarget.rival.name} — declare war first.`);
    }
    attackRivalCity(state, attacker, rivalTarget.rival, rivalTarget.city);
    return ok;
  }

  if (enemies.length === 0 && csTarget) {
    attackCityState(state, attacker, csTarget);
    return ok;
  }

  const defender =
    enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  const defDef = UNITS[defender.type];
  const defCS = (defDef?.combat ?? 0) + terrainDefense(target);
  const atkCS = def.combat;

  if ((defDef?.combat ?? 0) <= 0) {
    // Civilians are simply killed (Civ 6 captures; we don't model capture).
    killUnit(state, defender);
  } else {
    defender.hp -= damageRoll(state, atkCS - defCS);
    attacker.hp -= damageRoll(state, defCS - atkCS);
    if (defender.hp <= 0) {
      killUnit(state, defender);
      if (attacker.hp <= 0) attacker.hp = 1; // victor survives
    } else if (attacker.hp <= 0) {
      killUnit(state, attacker);
      attacker.movesLeft = 0;
      return ok;
    }
  }
  attacker.movesLeft = 0;
  // Advance into the tile if it's now free for us.
  if (state.units.includes(attacker) && tileFreeForUnit(state, targetIndex, attacker)) {
    attacker.tileIndex = targetIndex;
    const camp = state.barbCamps.indexOf(targetIndex);
    if (attacker.owner === 'player' && camp >= 0) {
      state.barbCamps.splice(camp, 1);
      state.treasury += CAMP_CLEAR_REWARD;
    }
  }
  return ok;
}

/** Ranged attack within the unit's range (no retaliation taken). */
export function rangedAttack(state: GameState, attackerId: number, targetIndex: number): RuleResult {
  const attacker = state.units.find((u) => u.id === attackerId);
  if (!attacker) return no('No such unit.');
  const def = UNITS[attacker.type];
  if (!def?.ranged) return no('Not a ranged unit.');
  if (attacker.movesLeft <= 0) return no('No movement left.');
  const from = state.map.tiles[attacker.tileIndex];
  const target = state.map.tiles[targetIndex];
  if (hexDistance(from.col, from.row, target.col, target.row) > def.ranged.range) {
    return no('Out of range.');
  }
  const enemies = unitsAt(state, targetIndex).filter((u) => unitsHostile(state, attacker, u));
  if (enemies.length === 0) return no('Nothing to attack there.');
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  const defCS = (UNITS[defender.type]?.combat ?? 0) + terrainDefense(target);
  defender.hp -= damageRoll(state, def.ranged.strength - defCS);
  if (defender.hp <= 0) killUnit(state, defender);
  attacker.movesLeft = 0;
  return ok;
}

/** Tiles this unit can attack right now (UI helper). */
export function attackTargets(state: GameState, unit: Unit): number[] {
  const def = UNITS[unit.type];
  if (!def || def.combat <= 0 || unit.movesLeft <= 0) return [];
  const from = state.map.tiles[unit.tileIndex];
  const range = def.ranged?.range ?? 1;
  const hostileToPlayer = unit.owner !== 'player' && unitsHostile(state, unit, { owner: 'player' });
  const out: number[] = [];
  for (const t of state.map.tiles) {
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < 1 || d > range) continue;
    const hasEnemy = unitsAt(state, t.index).some((u) => unitsHostile(state, unit, u));
    const playerCity = hostileToPlayer && t.district === 'CITY_CENTER' && d === 1;
    const rivalCity =
      d === 1 &&
      ((unit.owner === 'player' && (rivalCityAt(state, t.index)?.rival.atWar ?? false)) ||
        (unit.owner === 'barbarian' && rivalCityAt(state, t.index) !== undefined));
    if (hasEnemy || playerCity || rivalCity) out.push(t.index);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rival cities: siege and capture
// ---------------------------------------------------------------------------

function rivalCityDefense(rival: RivalCiv, city: RivalCity): number {
  return 15 + city.population + Math.floor(rival.techLevel * 1.5);
}

function attackRivalCity(state: GameState, attacker: Unit, rival: RivalCiv, city: RivalCity): void {
  const atkCS = UNITS[attacker.type]?.combat ?? 0;
  const defCS = rivalCityDefense(rival, city);
  city.hp -= damageRoll(state, atkCS - defCS);
  attacker.hp -= damageRoll(state, defCS - atkCS);
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
  if (city.hp <= 0) {
    if (attacker.owner === 'player') {
      captureRivalCity(state, rival, city);
    } else {
      // Barbarians sack, they don't govern.
      city.population = Math.max(1, Math.floor(city.population * 0.75));
      city.hp = Math.round(200 / 2);
      state.eventLog.push(`Barbarians sacked ${city.name} (${rival.name}).`);
    }
  }
}

/** Player siege of a city-state (attacking it IS the declaration of war). */
function attackCityState(state: GameState, attacker: Unit, cs: CityState): void {
  const atkCS = UNITS[attacker.type]?.combat ?? 0;
  const defCS = 15 + cs.population + (cs.type === 'militaristic' ? 6 : 0);
  cs.hp = (cs.hp ?? CS_MAX_HP) - damageRoll(state, atkCS - defCS);
  attacker.hp -= damageRoll(state, defCS - atkCS);
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
  if ((cs.hp ?? 0) <= 0) captureCityState(state, cs);
}

/** Conquest of a city-state: it joins your empire; its envoys die with it. */
export function captureCityState(state: GameState, cs: CityState): void {
  state.cityStates = state.cityStates.filter((c) => c.id !== cs.id);
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.toCs !== cs.id);
  const center = state.map.tiles[cs.centerIndex];
  const id = state.nextCityId++;
  for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
    if ((t.csId ?? -1) === cs.id) {
      t.csId = undefined;
      if (t.cityId === -1) t.cityId = id;
    }
  }
  center.cityId = id;
  state.cities.push({
    id,
    name: cs.name,
    centerIndex: cs.centerIndex,
    population: Math.max(1, Math.floor(cs.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: cs.centerIndex }],
    wonders: [],
    specialists: {},
  });
  state.cityHp[String(id)] = Math.round(CITY_MAX_HP / 2);
  revealAround(state, cs.centerIndex, 3);
  state.eventLog.push(`${cs.name} conquered — the city-state joins your empire.`);
}

/** Conquest: the rival city joins your empire (pop hit, no districts kept). */
export function captureRivalCity(state: GameState, rival: RivalCiv, city: RivalCity): void {
  rival.cities = rival.cities.filter((c) => c.id !== city.id);
  const center = state.map.tiles[city.centerIndex];
  const id = state.nextCityId++;
  // Their territory within working range transfers to the new owner.
  for (const t of tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS)) {
    if (tileOwnedByCiv(t, civOfRival(rival.id))) {
      t.rivalId = undefined;
      if (t.cityId === -1) t.cityId = id;
    }
  }
  center.cityId = id;
  state.cities.push({
    id,
    name: city.name,
    centerIndex: city.centerIndex,
    population: Math.max(1, Math.floor(city.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: city.tilesAcquired,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: city.centerIndex }],
    wonders: [],
    specialists: {},
  });
  state.cityHp[String(id)] = Math.round(CITY_MAX_HP / 2);
  revealAround(state, city.centerIndex, 3);
  state.treasury += 40;
  state.eventLog.push(`${city.name} captured from ${rival.name}!`);
  // Losing a city stings: the war ends if it was their last, else they fight on.
  if (rival.cities.length === 0) {
    rival.atWar = false;
    state.eventLog.push(`${rival.name} has been eliminated.`);
  }
}

// ---------------------------------------------------------------------------
// Barbarians
// ---------------------------------------------------------------------------

function campCandidates(state: GameState): Tile[] {
  const preferFog = state.fogOfWar && state.explored.length > 0;
  return state.map.tiles.filter((t) => {
    if (isWater(t) || isImpassable(t) || t.wonder || t.district || t.builtWonder) return false;
    if (t.cityId !== -1 || t.goodyHut) return false;
    if (tileForeignTo(t, PLAYER_CIV)) return false;
    if (preferFog && state.explored[t.index] === 1) return false; // camps rise in the fog
    for (const c of state.cities) {
      const ct = state.map.tiles[c.centerIndex];
      if (hexDistance(ct.col, ct.row, t.col, t.row) < 5) return false;
    }
    for (const campIdx of state.barbCamps) {
      const camp = state.map.tiles[campIdx];
      if (hexDistance(camp.col, camp.row, t.col, t.row) < 5) return false;
    }
    return true;
  });
}

function barbUnits(state: GameState): Unit[] {
  return state.units.filter((u) => u.owner === 'barbarian');
}

/**
 * One hostile unit's turn against the player: attack > pillage > advance.
 * Shared by barbarian raiders and at-war rival units.
 */
export function hostileUnitAct(state: GameState, unit: Unit): void {
  const map = state.map;
  const tile = () => map.tiles[unit.tileIndex];

  // 1. Attack anything hostile in reach (player or, for barbarians, rivals too).
  const targets = attackTargets(state, unit);
  if (targets.length > 0) {
    meleeAttack(state, unit.id, targets[0]);
    return;
  }

  // 2. Pillage the improvement underfoot (heals 25, like Civ 6).
  const here = tile();
  if (here.improvement && !here.pillaged && here.cityId !== -1) {
    here.pillaged = true;
    unit.hp = Math.min(UNIT_HP, unit.hp + 25);
    unit.movesLeft = 0;
    return;
  }

  // 3. March toward the nearest unpillaged improvement, else nearest city.
  let target: Tile | null = null;
  let bestDist = 13;
  for (const t of map.tiles) {
    if (!t.improvement || t.pillaged || t.cityId === -1) continue;
    const d = hexDistance(here.col, here.row, t.col, t.row);
    if (d < bestDist) {
      bestDist = d;
      target = t;
    }
  }
  if (!target && state.cities.length > 0) {
    target = state.cities
      .map((c) => map.tiles[c.centerIndex])
      .sort(
        (a, b) =>
          hexDistance(here.col, here.row, a.col, a.row) -
          hexDistance(here.col, here.row, b.col, b.row),
      )[0];
  }
  if (!target) return;
  // Step toward the neighbor closest to the target (cheap greedy march).
  const step = neighbors(map, here)
    .filter((n) => unitPassable(n) && tileFreeForUnit(state, n.index, unit))
    .sort(
      (a, b) =>
        hexDistance(a.col, a.row, target!.col, target!.row) -
        hexDistance(b.col, b.row, target!.col, target!.row),
    )[0];
  if (step && hexDistance(step.col, step.row, target.col, target.row) <
      hexDistance(here.col, here.row, target.col, target.row)) {
    unit.tileIndex = step.index;
    unit.movesLeft = 0;
  }
}

/** Camps spawn, garrison, raid; cities heal when unbothered. */
export function barbarianPhase(state: GameState): void {
  const map = state.map;
  // Barbarians get their movement in their own phase (self-contained for tests/RL).
  for (const u of state.units) {
    if (u.owner === 'barbarian') u.movesLeft = UNITS[u.type]?.moves ?? 2;
  }
  const maxCamps = Math.max(1, Math.floor(map.tiles.filter((t) => !isWater(t)).length / 120));

  // New camp?
  if (state.cities.length > 0 && state.barbCamps.length < maxCamps && nextRandom(state) < 0.08) {
    const candidates = campCandidates(state);
    if (candidates.length > 0) {
      const spot = candidates[Math.floor(nextRandom(state) * candidates.length)];
      state.barbCamps.push(spot.index);
      spawnUnit(state, 'WARRIOR', spot.index, 'barbarian');
    }
  }

  // Garrisons + raiders.
  const barbs = barbUnits(state);
  for (const campIdx of state.barbCamps) {
    const camp = map.tiles[campIdx];
    const nearCamp = barbs.filter(
      (u) =>
        hexDistance(map.tiles[u.tileIndex].col, map.tiles[u.tileIndex].row, camp.col, camp.row) <= 1,
    );
    if (nearCamp.length === 0) {
      spawnUnit(state, 'WARRIOR', campIdx, 'barbarian');
    } else if (
      barbUnits(state).length < state.barbCamps.length * MAX_BARB_PER_CAMP &&
      nextRandom(state) < 0.1
    ) {
      const type = state.turn > 60 ? 'SPEARMAN' : 'WARRIOR';
      spawnUnit(state, type, campIdx, 'barbarian');
    }
  }

  // Raider actions: everyone but one guard per camp marches.
  const guards = new Set<number>();
  for (const campIdx of state.barbCamps) {
    const camp = map.tiles[campIdx];
    const guard = barbUnits(state).find(
      (u) =>
        !guards.has(u.id) &&
        hexDistance(map.tiles[u.tileIndex].col, map.tiles[u.tileIndex].row, camp.col, camp.row) <= 1,
    );
    if (guard) guards.add(guard.id);
  }
  for (const unit of barbUnits(state)) {
    if (guards.has(unit.id)) continue;
    if (unit.movesLeft > 0) hostileUnitAct(state, unit);
  }

  // City healing when no hostile is adjacent.
  for (const city of state.cities) {
    const hp = getCityHp(state, city.id);
    if (hp >= CITY_MAX_HP) continue;
    const center = map.tiles[city.centerIndex];
    const besieged = neighbors(map, center).some((n) =>
      unitsAt(state, n.index).some((u) => unitsHostile(state, u, { owner: 'player' })),
    );
    if (!besieged) state.cityHp[String(city.id)] = Math.min(CITY_MAX_HP, hp + 20);
  }
}
