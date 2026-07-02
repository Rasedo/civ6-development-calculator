/**
 * Combat and barbarians (eyeballed Civ 6). Damage uses the classic
 * 30·e^(0.04·Δstrength)·rand(0.75–1.25) curve, with +3 defense on
 * hills/woods/rainforest/marsh. Barbarian camps spawn in the wilds, garrison
 * themselves, and send raiders that pillage improvements and batter cities;
 * cities at 0 HP are sacked (population/gold loss, nearby pillaging), not
 * captured. All randomness flows through the in-state RNG.
 */

import type { City, GameState, Tile, Unit } from './types';
import { neighbors, hexDistance } from './hex';
import { isWater, isImpassable } from './query';
import { UNITS, UNIT_HP, CITY_MAX_HP } from '../data/units';
import {
  nextRandom,
  unitsAt,
  unitDomain,
  unitPassable,
  tileFreeForUnit,
  spawnUnit,
  disbandUnit,
} from './units';
import type { RuleResult } from './rules';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export const CAMP_CLEAR_REWARD = 50;
const MAX_BARB_PER_CAMP = 3;

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

  const enemies = unitsAt(state, targetIndex).filter((u) => u.owner !== attacker.owner);
  const enemyCity =
    target.district === 'CITY_CENTER'
      ? state.cities.find((c) => c.centerIndex === targetIndex && attacker.owner === 'barbarian')
      : undefined;

  if (enemies.length === 0 && !enemyCity) return no('Nothing to attack there.');

  if (enemyCity) {
    attackCity(state, attacker, enemyCity);
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
  const enemies = unitsAt(state, targetIndex).filter((u) => u.owner !== attacker.owner);
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
  const out: number[] = [];
  for (const t of state.map.tiles) {
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < 1 || d > range) continue;
    const hasEnemy = unitsAt(state, t.index).some((u) => u.owner !== unit.owner);
    const enemyCity =
      unit.owner === 'barbarian' &&
      t.district === 'CITY_CENTER' &&
      d === 1;
    if (hasEnemy || enemyCity) out.push(t.index);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Barbarians
// ---------------------------------------------------------------------------

function campCandidates(state: GameState): Tile[] {
  const preferFog = state.fogOfWar && state.explored.length > 0;
  return state.map.tiles.filter((t) => {
    if (isWater(t) || isImpassable(t) || t.wonder || t.district || t.builtWonder) return false;
    if (t.cityId !== -1 || t.goodyHut) return false;
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

/** One barbarian unit's turn: attack > pillage > advance toward a target. */
function barbAct(state: GameState, unit: Unit): void {
  const map = state.map;
  const tile = () => map.tiles[unit.tileIndex];

  // 1. Attack an adjacent player unit or city.
  const targets = attackTargets(state, unit).filter((i) => {
    const t = map.tiles[i];
    return (
      unitsAt(state, i).some((u) => u.owner === 'player') || t.district === 'CITY_CENTER'
    );
  });
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
    if (unit.movesLeft > 0) barbAct(state, unit);
  }

  // City healing when no barbarian is adjacent.
  for (const city of state.cities) {
    const hp = getCityHp(state, city.id);
    if (hp >= CITY_MAX_HP) continue;
    const center = map.tiles[city.centerIndex];
    const besieged = neighbors(map, center).some((n) =>
      unitsAt(state, n.index).some((u) => u.owner === 'barbarian'),
    );
    if (!besieged) state.cityHp[String(city.id)] = Math.min(CITY_MAX_HP, hp + 20);
  }
}
