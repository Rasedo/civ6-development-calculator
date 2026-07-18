/**
 * Combat and barbarians (eyeballed Civ 6). Damage uses the classic
 * 30·e^(0.04·Δstrength)·rand(0.8–1.2) curve, with +3 defense on
 * hills/woods/rainforest/marsh. Barbarian camps spawn in the wilds, garrison
 * themselves, and send raiders that pillage improvements and batter cities;
 * cities at 0 HP are sacked (population/gold loss, nearby pillaging), not
 * captured. All randomness flows through the in-state RNG.
 */

import type { City, CityState, GameState, ImprovementId, RivalCity, RivalCiv, Tile, Unit } from './types';
import { neighbors, hexDistance, tilesWithin } from './hex';
import { isWater, isImpassable } from './query';
import { UNITS, UNIT_HP, CITY_MAX_HP, CITY_HEAL_PER_TURN, WALLS_HP } from '../data/units';
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
  inEnemyZoc,
  fortifyBonus,
  rivalCityAt,
  moveCostInto,
  crossesRiver,
} from './units';
import { revealAround } from './fog';
import { transferCityToRival } from './rivals';
import type { RuleResult } from './rules';
import { tileForeignTo, tileOwnedByCiv, civOfRival, PLAYER_CIV } from './civs';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export const CAMP_CLEAR_REWARD = 50;
export const MAX_BARB_PER_CAMP = 3;

/** P5/S7 (C-3): any non-barbarian unit entering a camp tile clears it —
 * +50 to ITS civ's treasury (rivals bank it like the player). */
export function clearCampFor(state: GameState, unit: Unit, tileIndex: number): void {
  if (unit.owner === 'barbarian') return;
  const camp = state.barbCamps.indexOf(tileIndex);
  if (camp < 0) return;
  state.barbCamps.splice(camp, 1);
  if (unit.owner === 'player') {
    state.treasury += CAMP_CLEAR_REWARD;
  } else {
    const rival = state.rivals.find((r) => r.id === unit.civId);
    if (rival) rival.treasury = (rival.treasury ?? 0) + CAMP_CLEAR_REWARD;
  }
}

/** P4/D-20: food improvements heal their pillager (real Civ 6); the rest
 * grant yields the pillager banks — nothing, for barbs and rival raiders.
 * (Tile.improvement is a plain string, hence Set<string>.) */
export const PILLAGE_HEAL_IMPROVEMENTS: ReadonlySet<string> = new Set<ImprovementId>([
  'FARM',
  'PASTURE',
  'CAMP',
  'PLANTATION',
  'FISHING_BOATS',
]);

// ---------------------------------------------------------------------------
// Combat math
// ---------------------------------------------------------------------------

export function terrainDefense(tile: Tile): number {
  let d = 0;
  if (tile.elevation === 'HILLS') d += 3;
  if (tile.feature === 'WOODS' || tile.feature === 'RAINFOREST') d += 3;
  // AUDIT B-28 (real Civ 6): marsh and floodplains EXPOSE the defender (−2) —
  // they don't shelter like woods/rainforest. Marsh stays SLOW to enter
  // (moveCostInto, deliberately unchanged); only its DEFENSE value flips here.
  if (tile.feature === 'MARSH' || tile.feature === 'FLOODPLAINS') d -= 2;
  return d;
}

// AUDIT B-29 (real Civ 6): a damaged unit fights at reduced combat strength —
// −1 CS per 10 HP lost, LINEAR, up to −10 at 0 HP. Kept in float (no rounding);
// the strengthDiff it feeds into is quantized to 0.1 inside damageRoll so the
// GPU's exp table can reproduce the exact JS double. Cities / city-states /
// walls are NOT units — they never call this.
export const RIVER_ATTACK_PENALTY = 5; // B-29: melee across a river, attacker CS −5
export function woundPenalty(unit: { hp: number }): number {
  return 10 * ((UNIT_HP - unit.hp) / 100);
}

export function damageRoll(state: GameState, strengthDiff: number, k = '?', t = -1): number {
  // P4/D-1: the real Civ 6 random factor is 0.8–1.2 (equal-strength hits
  // land "reliably 24–36"), not the old 0.75–1.25.
  // B-29: strengthDiff is now a multiple of 0.1 (wounded units subtract
  // hp/10; a river melee subtracts 5). Quantize it to 0.1 granularity so the
  // GPU's exp table — indexed by round(diff·10) — reproduces this exact JS
  // double; one ulp in `base` can flip the rounded damage.
  const q = Math.round(strengthDiff * 10);
  const base = 30 * Math.exp((0.04 * q) / 10);
  // Phase-1 combat log (P5/S4 tooling; §F enrichment): every roll of the
  // CIV6_LOG game — the GPU _damage_roll twin. k = call-site tag, t =
  // target tile, c = the rng counter BEFORE the draw (absolute stream
  // position). statelog drains into keyed CB lines. `diff` logs the
  // quantized q (10·strengthDiff) so both engines print an identical int.
  const c0 = state.rngState >>> 0;
  const r = nextRandom(state);
  const dmg = Math.max(1, Math.round(base * (0.8 + 0.4 * r)));
  const cb = (globalThis as any).__cbLog;
  if (cb) cb.push(`k:${k} t:${t} c:${c0} diff${q} r${Math.round(r * 1e6)} dmg${dmg}`);
  return dmg;
}

// P4/D-22 (real Civ 6): city defense = the strongest MELEE unit the owner
// has ever fielded (floor 15), +5 when the owner's own military garrisons
// the center. No population term; walls stay out of scope.
export function cityDefenseStrength(state: GameState, city: City): number {
  const garrison = unitsAt(state, city.centerIndex).find(
    (u) => u.owner === 'player' && unitDomain(u.type) === 'military',
  );
  return Math.max(15, state.bestMeleeCS ?? 0) + (garrison ? 5 : 0);
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
  // GS: milli-round the treasury before ×0.2 so a sub-milli non-dyadic-gold drift can't tip the
  // round across a .5 boundary and desync the sack by 1 gold vs the GPU (which mirrors this).
  state.treasury -= Math.min(100, Math.round((Math.round(state.treasury * 1000) / 1000) * 0.2));
  const center = state.map.tiles[city.centerIndex];
  for (const t of neighbors(state.map, center)) {
    if (t.improvement && !t.pillaged) t.pillaged = true;
  }
  state.cityHp[String(city.id)] = Math.round(CITY_MAX_HP / 2);
}

function attackCity(state: GameState, attacker: Unit, city: City): void {
  // B-29: the attacker's wound penalty reduces its CS; a river-crossing melee
  // takes −5. The city center is not a unit (cityDefenseStrength unchanged).
  const atkCS =
    (UNITS[attacker.type]?.combat ?? 0) -
    woundPenalty(attacker) -
    (crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[city.centerIndex]) ? RIVER_ATTACK_PENALTY : 0);
  const defCS = cityDefenseStrength(state, city);
  const dmgToCity = damageRoll(state, atkCS - defCS, 'pcty', city.centerIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, 'pctyc', city.centerIndex);
  // AUDIT B-1: the ANCIENT_WALLS outer pool soaks the hit first — only the
  // spillover reaches city HP (a deliberate simplification of Civ 6's
  // percentage wall rules: outer absorbs the whole roll until depleted).
  // No walls → outerHp absent (0) → the full roll lands, exactly as before.
  const outer = city.outerHp ?? 0;
  const absorbed = Math.min(outer, dmgToCity);
  if (absorbed > 0) city.outerHp = outer - absorbed;
  state.cityHp[String(city.id)] = getCityHp(state, city.id) - (dmgToCity - absorbed);
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
  if (getCityHp(state, city.id) <= 0) {
    // V-W2 symmetric: a RIVAL conqueror takes the city (the loyalty-flip
    // transfer); barbarians still merely sack.
    if (attacker.owner === 'rival' && attacker.civId !== undefined) {
      const rival = state.rivals.find((r) => r.id === attacker.civId);
      if (rival) {
        // P5/S1 (C-11b): the conqueror plunders +40, symmetric with the
        // player's captureRivalCity — but only on a real transfer; the
        // C-5 raze (city cap) mirrors TS's raze early-return: no gold.
        if (transferCityToRival(state, city, rival, 'conquered')) {
          rival.treasury = (rival.treasury ?? 0) + 40;
        }
        return;
      }
    }
    sackCity(state, city);
  }
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
  // B-5 fortify + B-29 wounded: both attacker and defender fight at their
  // HP-reduced strength (up to −10 at 0 HP). B-29 river: a melee attacker
  // crossing a river edge into the defender's tile takes −5.
  const defCS = (defDef?.combat ?? 0) + terrainDefense(target) + fortifyBonus(defender) - woundPenalty(defender);
  const atkCS = def.combat - woundPenalty(attacker) - (crossesRiver(from, target) ? RIVER_ATTACK_PENALTY : 0);

  if ((defDef?.combat ?? 0) <= 0) {
    // Civilians are simply killed (Civ 6 captures; we don't model capture).
    killUnit(state, defender);
  } else {
    defender.hp -= damageRoll(state, atkCS - defCS, 'mel', targetIndex);
    attacker.hp -= damageRoll(state, defCS - atkCS, 'melc', targetIndex);
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
    clearCampFor(state, attacker, targetIndex); // P5/S7 (C-3): rivals clear too
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
  if (enemies.length === 0) {
    // P4/D-23 (real Civ 6): ranged units CAN bombard cities — same fallback
    // chain as meleeAttack (rival city, then city-state center), one roll,
    // no retaliation. Ranged fire never captures: the city holds at 1 HP
    // until melee takes it.
    if (attacker.owner === 'player') {
      const rc = rivalCityAt(state, targetIndex);
      if (rc && rc.rival.atWar) {
        const defCS = rivalCityDefense(state, rc.rival, rc.city);
        rc.city.hp = Math.max(1, rc.city.hp - damageRoll(state, (def.ranged.strength - woundPenalty(attacker)) - defCS, 'rngrc', targetIndex));
        attacker.movesLeft = 0;
        return ok;
      }
      const cs = cityStateAt(state, targetIndex);
      if (cs && cs.centerIndex === targetIndex) {
        const defCS = 15 + cs.population + (cs.type === 'militaristic' ? 6 : 0);
        cs.hp = Math.max(1, (cs.hp ?? CS_MAX_HP) - damageRoll(state, (def.ranged.strength - woundPenalty(attacker)) - defCS, 'rngcs', targetIndex));
        attacker.movesLeft = 0;
        return ok;
      }
    }
    return no('Nothing to attack there.');
  }
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  const defCS = (UNITS[defender.type]?.combat ?? 0) + terrainDefense(target) + fortifyBonus(defender) - woundPenalty(defender); // B-5 + B-29
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker)) - defCS, 'rng', targetIndex);
  if (defender.hp <= 0) killUnit(state, defender);
  attacker.movesLeft = 0;
  return ok;
}

/**
 * AUDIT A-6: a hostile RANGED unit strikes — one roll, no retaliation, no
 * advance (rangedAttack's shape from the attacker's seat). A PLAYER city
 * takes the hit first even with a garrison (meleeAttack's city precedence)
 * and holds at 1 HP — ranged fire never captures; else the units on the
 * tile (military first; civilians take the roll too, rangedAttack's
 * convention, not the melee roll-free kill). Any other civ's center tile
 * is the same no-op quirk as the melee scan: nothing happens, no MP spent.
 */
export function hostileRangedStrike(state: GameState, attacker: Unit, targetIndex: number): void {
  const def = UNITS[attacker.type];
  if (!def?.ranged) return;
  const target = state.map.tiles[targetIndex];
  const hostileToPlayer = attacker.owner !== 'player' && unitsHostile(state, attacker, { owner: 'player' });
  const enemyCity =
    target.district === 'CITY_CENTER' && hostileToPlayer
      ? state.cities.find((c) => c.centerIndex === targetIndex)
      : undefined;
  if (enemyCity) {
    const defCS = cityDefenseStrength(state, enemyCity);
    state.cityHp[String(enemyCity.id)] = Math.max(
      1,
      getCityHp(state, enemyCity.id) - damageRoll(state, (def.ranged.strength - woundPenalty(attacker)) - defCS, 'vrngc', targetIndex),
    );
    attacker.movesLeft = 0;
    return;
  }
  const enemies = unitsAt(state, targetIndex).filter((u) => unitsHostile(state, attacker, u));
  if (enemies.length === 0) return; // the CITY_CENTER quirk: a no-op, like meleeAttack's `no(...)`
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  const defCS = (UNITS[defender.type]?.combat ?? 0) + terrainDefense(target) + fortifyBonus(defender) - woundPenalty(defender); // B-5 + B-29
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker)) - defCS, 'vrng', targetIndex);
  if (defender.hp <= 0) killUnit(state, defender);
  attacker.movesLeft = 0;
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
    // AUDIT A-6: ranged hostiles bombard city-center tiles at their full
    // range (the player's D-23 rule from the other seat); melee keeps d===1.
    const playerCity = hostileToPlayer && t.district === 'CITY_CENTER' && d <= range;
    // P4/D-23: the player's ranged units bombard cities at their full range.
    const cityRange = unit.owner === 'player' ? range : 1;
    const rivalCity =
      d <= cityRange &&
      ((unit.owner === 'player' && (rivalCityAt(state, t.index)?.rival.atWar ?? false)) ||
        (unit.owner === 'barbarian' && d === 1 && rivalCityAt(state, t.index) !== undefined));
    if (hasEnemy || playerCity || rivalCity) out.push(t.index);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rival cities: siege and capture
// ---------------------------------------------------------------------------

export function rivalCityDefense(state: GameState, rival: RivalCiv, city: RivalCity): number {
  // P4/D-22 (symmetric with cityDefenseStrength): the rival's strongest
  // melee ever (floor 15) + 5 for its own military garrisoning the center.
  // Their defense keeps pace through military techs raising bestMeleeCS.
  const garrison = unitsAt(state, city.centerIndex).find(
    (u) => u.owner === 'rival' && u.civId === rival.id && unitDomain(u.type) === 'military',
  );
  return Math.max(15, rival.bestMeleeCS ?? 0) + (garrison ? 5 : 0);
}

function attackRivalCity(state: GameState, attacker: Unit, rival: RivalCiv, city: RivalCity): void {
  const atkCS =
    (UNITS[attacker.type]?.combat ?? 0) -
    woundPenalty(attacker) -
    (crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[city.centerIndex]) ? RIVER_ATTACK_PENALTY : 0); // B-29 wound + river (city not a unit)
  const defCS = rivalCityDefense(state, rival, city);
  // AUDIT B-1: the outer wall pool absorbs first (same rule as attackCity).
  const dmgToCity = damageRoll(state, atkCS - defCS, 'rcty', city.centerIndex);
  const outer = city.outerHp ?? 0;
  const absorbed = Math.min(outer, dmgToCity);
  if (absorbed > 0) city.outerHp = outer - absorbed;
  city.hp -= dmgToCity - absorbed;
  attacker.hp -= damageRoll(state, defCS - atkCS, 'rctyc', city.centerIndex);
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
  if (city.hp <= 0) {
    if (attacker.owner === 'player') {
      captureRivalCity(state, rival, city);
    } else {
      // Barbarians sack, they don't govern. P5/S1 (C-10): a rival sack now
      // mirrors sackCity — gold loss (milli-rounded 20%, cap 100) and the
      // pillage ring around the center, not just the pop hit.
      city.population = Math.max(1, Math.floor(city.population * 0.75));
      rival.treasury =
        (rival.treasury ?? 0) -
        Math.min(100, Math.round((Math.round((rival.treasury ?? 0) * 1000) / 1000) * 0.2));
      for (const t of neighbors(state.map, state.map.tiles[city.centerIndex])) {
        if (t.improvement && !t.pillaged) t.pillaged = true;
      }
      city.hp = Math.round(200 / 2);
      state.eventLog.push(`Barbarians sacked ${city.name} (${rival.name}).`);
    }
  }
}

/** Player siege of a city-state (attacking it IS the declaration of war). */
function attackCityState(state: GameState, attacker: Unit, cs: CityState): void {
  const atkCS =
    (UNITS[attacker.type]?.combat ?? 0) -
    woundPenalty(attacker) -
    (crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[cs.centerIndex]) ? RIVER_ATTACK_PENALTY : 0); // B-29 wound + river (CS center not a unit)
  const defCS = 15 + cs.population + (cs.type === 'militaristic' ? 6 : 0);
  cs.hp = (cs.hp ?? CS_MAX_HP) - damageRoll(state, atkCS - defCS, 'csty', cs.centerIndex);
  attacker.hp -= damageRoll(state, defCS - atkCS, 'cstyc', cs.centerIndex);
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
  if ((cs.hp ?? 0) <= 0) captureCityState(state, cs);
}

/** Conquest of a city-state: it joins your empire; its envoys die with it. */
export function captureCityState(state: GameState, cs: CityState): void {
  state.cityStates = state.cityStates.filter((c) => c.id !== cs.id);
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.toCs !== cs.id);
  const center = state.map.tiles[cs.centerIndex];
  // AUDIT A-16: the V-W2 slot cap applies here too — a full empire RAZES
  // the city-state instead of annexing it (captureRivalCity's exact rule;
  // the player could previously exceed 6 cities via CS conquest only, and
  // the GPU documented a skip-at-full-pool divergence for this path).
  if (state.cities.length >= 6) {
    for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
      if ((t.csId ?? -1) === cs.id) t.csId = undefined;
    }
    state.eventLog.push(`${cs.name} razed — the empire is full.`);
    return;
  }
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

/** Conquest: the rival city joins your empire (pop hit, no districts kept).
 * P5/S6: `plunder=false` for loyalty defections — same raze-at-6, territory
 * and elimination semantics, no +40 and no conquest log line. */
export function captureRivalCity(state: GameState, rival: RivalCiv, city: RivalCity, plunder = true): void {
  rival.cities = rival.cities.filter((c) => c.id !== city.id);
  // A-11: routes die with their endpoint (the state.tradeRoutes twin).
  rival.tradeRoutes = rival.tradeRoutes?.filter((x) => x.from !== city.id && x.to !== city.id);
  const center = state.map.tiles[city.centerIndex];
  // V-W2 slot cap (mirrors the GPU's fixed city slots): a full empire
  // RAZES instead — the rival city and its claim simply cease.
  if (state.cities.length >= 6) {
    // A-17: exactly this city's tiles free (registry scan) — the old
    // work-radius sweep leaked the outer ring as orphaned civ territory.
    for (const t of state.map.tiles) {
      if (tileOwnedByCiv(t, civOfRival(rival.id)) && t.rivalCityId === city.id) {
        t.rivalId = undefined;
        t.rivalCityId = undefined;
      }
    }
    center.district = null;
    center.districtComplete = false;
    state.eventLog.push(`${city.name} razed — the empire cannot govern more cities.`);
    return;
  }
  const id = state.nextCityId++;
  // A-17: exactly this city's territory transfers to the new owner (registry
  // scan) — the old work-radius sweep also stole sibling cities' frontage.
  for (const t of state.map.tiles) {
    if (tileOwnedByCiv(t, civOfRival(rival.id)) && t.rivalCityId === city.id) {
      t.rivalId = undefined;
      t.rivalCityId = undefined;
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
  if (plunder) {
    state.treasury += 40;
    state.eventLog.push(`${city.name} captured from ${rival.name}!`);
  }
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
    // AUDIT A-15: camp spacing respects RIVAL cities too (real Civ 6 —
    // camps rise away from every civilization, not just the player).
    for (const rv of state.rivals) {
      for (const rc of rv.cities) {
        const ct = state.map.tiles[rc.centerIndex];
        if (hexDistance(ct.col, ct.row, t.col, t.row) < 5) return false;
      }
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
  // AUDIT A-6: ranged units strike (one roll, no retaliation) instead of
  // meleeing — attackTargets already scanned at their full range.
  const targets = attackTargets(state, unit);
  if (targets.length > 0) {
    if (UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, targets[0]);
    else meleeAttack(state, unit.id, targets[0]);
    return;
  }

  // 2. Pillage the improvement underfoot. P4/D-20 (real Civ 6): only FOOD
  // improvements heal the pillager (+25); the rest are wrecked for yields
  // the raiders here can't bank — pillaged, no heal. P5/S7 (C-4a):
  // BARBARIANS raid rival improvements too; rival raiders keep pillaging
  // the player only (they never war other rivals).
  const here = tile();
  const hereOwned = here.cityId !== -1 || (unit.owner === 'barbarian' && here.rivalId !== undefined);
  if (here.improvement && !here.pillaged && hereOwned) {
    here.pillaged = true;
    if (PILLAGE_HEAL_IMPROVEMENTS.has(here.improvement)) {
      unit.hp = Math.min(UNIT_HP, unit.hp + 25);
    }
    unit.movesLeft = 0;
    return;
  }

  // 3. March toward the nearest unpillaged improvement, else nearest city.
  let target: Tile | null = null;
  let bestDist = 13;
  for (const t of map.tiles) {
    const tOwned = t.cityId !== -1 || (unit.owner === 'barbarian' && t.rivalId !== undefined);
    if (!t.improvement || t.pillaged || !tOwned) continue;
    const d = hexDistance(here.col, here.row, t.col, t.row);
    if (d < bestDist) {
      bestDist = d;
      target = t;
    }
  }
  // A-8: an improvement is walked ONTO (pillage reads the tile underfoot);
  // a CITY target stops the march adjacent — enemy centers can't be entered
  // (real Civ 6), and a unit standing on one could never attack it (d>=1).
  const marchOnto = target !== null;
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
  // AUDIT A-8 + B-26: RIVAL and BARBARIAN units both walk the march on REAL
  // MP — each step re-picks the passable free neighbor closest to the (fixed)
  // target, moves only if strictly closer, and pays walkPath's exact charge
  // (tile cost + 3 per river crossing; a full-MP unit always affords its first
  // step). Any step spends MP (movesLeft < full → the D-2 heal is blocked).
  const full = UNITS[unit.type]?.moves ?? 2;
  for (;;) {
    const at = tile();
    const step = neighbors(map, at)
      .filter((n) => unitPassable(n) && tileFreeForUnit(state, n.index, unit))
      .sort(
        (a, b) =>
          hexDistance(a.col, a.row, target!.col, target!.row) -
          hexDistance(b.col, b.row, target!.col, target!.row),
      )[0];
    const stepD = hexDistance(step?.col ?? 0, step?.row ?? 0, target.col, target.row);
    if (!step || stepD >= hexDistance(at.col, at.row, target.col, target.row) || (!marchOnto && stepD < 1)) {
      return;
    }
    const cost = moveCostInto(step) + (crossesRiver(at, step) ? 3 : 0);
    if (unit.movesLeft < cost && unit.movesLeft < full) return;
    unit.tileIndex = step.index;
    unit.movesLeft = Math.max(0, unit.movesLeft - cost);
    clearCampFor(state, unit, step.index); // P5/S7 (C-3): rivals clear camps (barb no-op)
    // B-3 ZOC: a march step ending adjacent to a hostile MILITARY unit halts
    // (same per-step rule as walkPath / patrol / builder walk). Gated to
    // rivals: B-26 gives barbarians the full-MP walk but they do NOT obey ZOC
    // yet — the GPU barb walk mirrors the pre-ZOC march, so gating here keeps
    // both engines symmetric. (barbs-obey-ZOC is a deferred refinement.)
    if (unit.owner === 'rival' && inEnemyZoc(state, unit.tileIndex, unit)) {
      unit.movesLeft = 0;
      return;
    }
    if (unit.movesLeft <= 0) return;
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

  // New camp? AUDIT A-15: ANY live civilization sustains the barb world —
  // rivals count, not just the player (the roll-gate short-circuit is part
  // of the draw-count contract; both engines change together).
  const anyCivCity = state.cities.length > 0 || state.rivals.some((r) => r.cities.length > 0);
  if (anyCivCity && state.barbCamps.length < maxCamps && nextRandom(state) < 0.08) {
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

  // AUDIT B-2: a city WITH ANCIENT_WALLS fires once per turn — range 2, at
  // the nearest unit hostile to the player (barbarians always; at-war rival
  // units, civilians included — the unitsHostile predicate), ties broken by
  // lowest tile index (the standard tile-order scan). One roll at the city's
  // defense strength vs the target's defense, mirroring hostileRangedStrike:
  // a single roll, no retaliation, civilians take the roll, never captures.
  // City order — a kill removes the target for later cities and advances the
  // shared RNG, so this runs immediately BEFORE the heal loop.
  for (const city of state.cities) {
    if (!city.buildings.includes('ANCIENT_WALLS')) continue;
    const center = map.tiles[city.centerIndex];
    let bestTile = -1;
    let bestDist = 99;
    for (const t of map.tiles) {
      const d = hexDistance(center.col, center.row, t.col, t.row);
      if (d < 1 || d > 2) continue;
      if (!unitsAt(state, t.index).some((u) => unitsHostile(state, u, { owner: 'player' }))) continue;
      if (d < bestDist) {
        bestDist = d;
        bestTile = t.index;
      }
    }
    if (bestTile < 0) continue;
    const hostiles = unitsAt(state, bestTile).filter((u) => unitsHostile(state, u, { owner: 'player' }));
    const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
    const tt = map.tiles[bestTile];
    const defCS = (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender); // B-29 (attacker is the city — not a unit)
    const atkCS = cityDefenseStrength(state, city);
    defender.hp -= damageRoll(state, atkCS - defCS, 'pcstk', bestTile);
    if (defender.hp <= 0) killUnit(state, defender);
  }

  // City healing when no hostile is adjacent. AUDIT B-1: the outer wall pool
  // heals on the same unbesieged gate and rate, capped at WALLS_HP (real
  // Civ 6 repairs walls too) — full-HP walled cities still heal their wall,
  // so the early `continue` on full city HP is gone.
  for (const city of state.cities) {
    const hp = getCityHp(state, city.id);
    const center = map.tiles[city.centerIndex];
    const besieged = neighbors(map, center).some((n) =>
      unitsAt(state, n.index).some((u) => unitsHostile(state, u, { owner: 'player' })),
    );
    if (besieged) continue;
    if (hp < CITY_MAX_HP) state.cityHp[String(city.id)] = Math.min(CITY_MAX_HP, hp + CITY_HEAL_PER_TURN);
    if (city.buildings.includes('ANCIENT_WALLS')) {
      city.outerHp = Math.min(WALLS_HP, (city.outerHp ?? WALLS_HP) + CITY_HEAL_PER_TURN);
    }
  }
}
