/**
 * Combat and barbarians. #78 sourced the DAMAGE FORMULA (base and exponent
 * verified exact; the random range is contested — see damageRoll). Damage uses the classic
 * 30·e^(0.04·Δstrength)·rand(0.8–1.2) curve, with +3 defense on
 * hills/woods/rainforest/marsh. Barbarian camps spawn in the wilds, garrison
 * themselves, and send raiders that pillage improvements and batter cities;
 * cities at 0 HP are sacked (population/gold loss, nearby pillaging), not
 * captured. All randomness flows through the in-state RNG.
 */

import type { City, CityState, DistrictId, GameState, ImprovementId, RivalCity, RivalCiv, Tile, Unit } from './types';
import { neighbors, hexDistance, tilesWithin } from './hex';
import { isWater, isImpassable } from './query';
import { civEraIndex } from './city';
import { MODERN_ERA_INDEX } from '../data/techs';
import { UNITS, UNIT_HP, CITY_MAX_HP, CITY_HEAL_PER_TURN, WALLS_HP, ENCAMPMENT_HP } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { CS_MAX_HP } from '../data/cityStates';
import { cityStateAt, isSuzerain } from './cityStates';
import { RIVAL_MAX_CITIES, ERA_SCORE_CONQUER, RR_WARMONGER_CAPTURE } from '../data/rivals';
import { addEraScore } from './eras';
import {
  nextRandom,
  unitsAt,
  unitDomain,
  tileFreeForUnit,
  spawnUnit,
  disbandUnit,
  unitsHostile,
  inEnemyZoc,
  fortifyBonus,
  rivalCityAt,
  moveCostInto,
  riverCharge,
  encampmentIntact,
  encampmentBlocks,
  crossesRiver,
  cliffBlocksStep,
} from './units';
import { EMBARK_MOVES, EMBARKED_DEFENSE_CS, embarkState } from '../data/constants';
import { ENHANCER_BELIEFS, JUST_WAR_RANGE, CITY_RELIGION_ADDER_LIVE, type BeliefEffects } from '../data/religion';
import { revealAround } from './fog';
import { transferCityToRival, transferRivalCityToRival, relocatePalace } from './rivals';
import type { RuleResult } from './rules';
import { tileForeignTo, tileOwnedByCiv, civOfRival, PLAYER_CIV, unitSeat, civsAtWar, playerSeat, isPlayerSeat, isBarbSeat, isRivalSeat, rivalOfSeat, rivalOfCiv, BARB_SEAT } from './seats';
import { inGeneralAura, GENERAL_AURA_CS, GENERAL_AURA_RANGE } from './aura'; // #70/S2/S3 (B-8): the shared aura predicate

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export const CAMP_CLEAR_REWARD = 50;
export const MAX_BARB_PER_CAMP = 3;

/** P5/S7 (C-3): any non-barbarian unit entering a camp tile clears it —
 * +50 to ITS civ's treasury (rivals bank it like the player). */
export function clearCampFor(state: GameState, unit: Unit, tileIndex: number): void {
  if (isBarbSeat(unit.seat)) return;
  const camp = state.barbCamps.indexOf(tileIndex);
  if (camp < 0) return;
  state.barbCamps.splice(camp, 1);
  markAntiquitySite(state, tileIndex); // B-20 (#79): a razed outpost leaves a dig
  if (isPlayerSeat(unit.seat)) {
    playerSeat(state).treasury += CAMP_CLEAR_REWARD;
  } else {
    const rival = rivalOfSeat(state, unit.seat);
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
  // B-27 (#78) FORT, sourced: "Occupying unit receives +4 Defense Strength".
  // Added HERE because terrainDefense is the single chokepoint every defender
  // path already routes through, so the bonus reaches melee, ranged and city
  // defence without touching three call sites.
  // The entry's other two halves are NOT modelled and are recorded rather than
  // approximated: the automatic 2 turns of fortification (would need a hook on
  // every tile-entry site, and fortifyBonus is a separate accumulator), and the
  // "minor damage + movement depletion to hostile units walking onto this tile"
  // (neither engine has a tile-enters-damage hook, and the damage number is not
  // stated, so inventing one is the guessed-constant failure this sweep exists
  // to catch).
  if (tile.improvement === 'FORT') d += 4;
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

// AUDIT B-7 flanking & support. Real Civ 6: a melee attacker gains +2 CS per
// OTHER unit adjacent to the defender that is hostile to the defender
// (flanking); a defender gains +2 CS per friendly MILITARY unit adjacent to it
// (support), against melee AND ranged. Cities / city-states / rc-city targets
// are not units — no flanking against them (recorded simplification). Integer
// CS adds, so the B-29 diff quantization (q = round(Δ·10)) is preserved.
export const FLANKING_CS = 2;
export const SUPPORT_CS = 2;

// AUDIT B-4 XP & levels. Real Civ 6: units earn experience and promote. Modeled
// scope (promotion TREES/abilities are the recorded residual): +5 XP per attack
// EXECUTED (any roll-producing melee/ranged, vs unit/city/CS/rc), +2 per attack
// SURVIVED as a MILITARY defender (incl. city/walls strikes). Barbarians accrue
// nothing; civilians never fight (stay 0). XP_LEVELS grant a flat +5 CS per level
// at EVERY roll the unit fights (attack AND defense), an integer add entering the
// CS assembly exactly like the B-7 terms (once, before paired rolls, preserved by
// the B-29 diff quantization). No promotion choice / heal / level-4+.
export const XP_ATTACK = 5;
export const XP_DEFEND = 2;
export const XP_LEVEL_CS = 5;
export const XP_LEVELS: readonly number[] = [15, 45, 90];

/** B-4: 0..3 — the number of XP_LEVELS thresholds this unit's xp has crossed. */
export function unitLevel(unit: { xp?: number }): number {
  const xp = unit.xp ?? 0;
  let level = 0;
  for (const t of XP_LEVELS) if (xp >= t) level++;
  return level;
}

/** B-4: the flat CS bonus a unit's veterancy grants at every roll it fights. */
export function xpLevelBonus(unit: { xp?: number }): number {
  return XP_LEVEL_CS * unitLevel(unit);
}

/** B-17 (ROUND B7): the flat XP a unit TRAINED or PURCHASED in a city starts
 * with — the BEST tier over the city's Encampment military buildings (not the
 * sum): BARRACKS/STABLE 5, ARMORY 10, MILITARY_ACADEMY 15 (data-driven off
 * BuildingDef.trainXp). Keys purely off building presence — a military
 * building cannot exist without a complete Encampment; district-pillage state
 * is NOT consulted (recorded B-17 residual). Applies to military units only. */
export function encampmentTrainXp(buildings: readonly string[]): number {
  let best = 0;
  for (const b of buildings) {
    const xp = BUILDINGS[b]?.trainXp ?? 0;
    if (xp > best) best = xp;
  }
  return best;
}

/** B-4: award XP to a unit (barbarians never accrue). */
function gainXp(unit: Unit, amount: number): void {
  if (isBarbSeat(unit.seat)) return;
  unit.xp = (unit.xp ?? 0) + amount;
}

/** B-4: a surviving MILITARY defender earns +2 (civilians never fight; barbs
 * never accrue — gainXp guards that). Called after the defender's HP is set.
 * Exported for the rival walls strike (rcstk, rivals.ts) — the pcstk mirror. */
export function awardDefenseXp(defender: Unit): void {
  if (defender.hp > 0 && unitDomain(defender.type) === 'military') gainXp(defender, XP_DEFEND);
}

/** B-7 flanking count: MILITARY units u ≠ attacker, adjacent to the defender's
 * tile, that are hostile to the defender. */
function flankCount(state: GameState, defTileIndex: number, attacker: Unit, defender: Unit): number {
  let n = 0;
  for (const t of neighbors(state.map, state.map.tiles[defTileIndex])) {
    for (const u of unitsAt(state, t.index)) {
      if (u.id === attacker.id) continue;
      if (unitDomain(u.type) !== 'military') continue;
      if (u.embarked) continue; // #45/B-6: embarked units flank for nobody
      if (unitsHostile(state, u, defender)) n++;
    }
  }
  return n;
}

/** B-7 support count: MILITARY units friendly to the defender (same owner AND
 * civId), adjacent to the defender's tile. Exported for the rival walls
 * strike (rcstk, rivals.ts) — the pcstk mirror. */
export function supportCount(state: GameState, defTileIndex: number, defender: Unit): number {
  let n = 0;
  for (const t of neighbors(state.map, state.map.tiles[defTileIndex])) {
    for (const u of unitsAt(state, t.index)) {
      if (unitDomain(u.type) !== 'military') continue;
      if (u.embarked) continue; // #45/B-6: embarked units support nobody
      if (u.seat === defender.seat) n++;
    }
  }
  return n;
}

// B7-G (B-8): Great General / Great Admiral aura. Real Civ 6 grants nearby own
// units +5 CS AND +1 MP. An own LAND military unit within GENERAL_AURA_RANGE of
// an own live GENERAL — or an own NAVAL/EMBARKED unit within range of an own
// live ADMIRAL — gains +GENERAL_AURA_CS at every damage-roll site (attack AND
// defense), an INTEGER add joining the B-29 quantized assembly (q=round(Δ·10)
// preserved) exactly like the JUST_WAR/CRUSADE religion adders. "Own" = same
// owner AND civId. The GENERAL/ADMIRAL units themselves are combat-0 civilians
// and never trigger this on their own account.
//
// #70/S2 widened the SCOPE from unit-vs-unit to every roll where a unit fights
// a city or a city strikes a unit (pcty/rcty/csty + their counter-rolls, the
// ranged-vs-city rolls, and the four city-strike keys pcstk/pestk/rcstk/restk).
// #70/S3 added the movement half (see `generalAuraMP` in aura.ts).
//
// The PREDICATE itself lives in aura.ts so this file and units.ts share ONE
// definition — combat.ts already imports units.ts, so units.ts cannot import
// back from here. Re-exported below to keep every existing importer working.
export { GENERAL_AURA_CS, GENERAL_AURA_RANGE };

export function generalAuraCS(state: GameState, unit: Unit, tileIndex: number): number {
  return inGeneralAura(state, unit, tileIndex) ? GENERAL_AURA_CS : 0;
}

/** B6-S1: the enhancer belief of a UNIT's civ religion (religion id = unified
 * civ id: 0 = the player's, i+1 = rival i's). Undefined for barbarians, for
 * unfounded religions, and for unenhanced ones. */
function unitEnhancer(state: GameState, unit: Unit): BeliefEffects | undefined {
  if (isPlayerSeat(unit.seat)) {
    const rel_239 = playerSeat(state).religion;
    return rel_239.founded && rel_239.enhancer ? ENHANCER_BELIEFS[rel_239.enhancer]?.effects : undefined;
  }
  if (!isRivalSeat(unit.seat)) return undefined; // barbarians have no faith
  const rival = rivalOfSeat(state, unit.seat); // unit.civId = rival.id for rival units
  return rival?.religion.founded && rival.religion.enhancer ? ENHANCER_BELIEFS[rival.religion.enhancer]?.effects : undefined;
}

/** B6-S1: the religion id of a unit's civ (-1 when none founded). Religion
 * ids are the unified civ space: 0 player, rival.id + 1 for rival units. */
function unitReligion(state: GameState, unit: Unit): number {
  if (isPlayerSeat(unit.seat)) return playerSeat(state).religion.founded ? 0 : -1;
  if (!isRivalSeat(unit.seat)) return -1;
  const rival = rivalOfSeat(state, unit.seat);
  return rival?.religion.founded ? unit.seat : -1;
}

/** B6-S1: the followed religion of the city OWNING this tile (-1 = unowned or
 * following nothing). Player tiles via tile.cityId; rival tiles via the A-17
 * per-city registry (tile.rivalCityId). */
function tileFollowedReligion(state: GameState, tile: Tile): number {
  if (tile.cityId >= 0) {
    return state.cities.find((c) => c.id === tile.cityId)?.followedReligion ?? -1;
  }
  if (tile.rivalId != null && tile.rivalId >= 0 && tile.rivalCityId != null) {
    const rv = state.rivals.find((r) => r.id === tile.rivalId);
    return rv?.cities.find((rc) => rc.id === tile.rivalCityId)?.followedReligion ?? -1;
  }
  return -1;
}

/** B6-S1: is any city (player or rival) following religion g within
 * JUST_WAR_RANGE of this tile? */
function nearFollowingCity(state: GameState, tile: Tile, g: number): boolean {
  for (const c of state.cities) {
    if (c.followedReligion !== g) continue;
    const t = state.map.tiles[c.centerIndex];
    if (hexDistance(tile.col, tile.row, t.col, t.row) <= JUST_WAR_RANGE) return true;
  }
  for (const rv of state.rivals) {
    for (const rc of rv.cities) {
      if (rc.followedReligion !== g) continue;
      const t = state.map.tiles[rc.centerIndex];
      if (hexDistance(tile.col, tile.row, t.col, t.row) <= JUST_WAR_RANGE) return true;
    }
  }
  return false;
}

/** B6-S1: enhancer combat adders for the ATTACKER in a unit-vs-unit roll
 * (Just War near a following city + Crusade attacking onto following-city
 * territory). The battle tile is the DEFENDER's tile. City/CS targets get
 * nothing (unit-vs-unit scope). */
export function religionAttackCS(state: GameState, attacker: Unit, battleTileIndex: number): number {
  const g = unitReligion(state, attacker);
  if (g < 0) return 0;
  const fx = unitEnhancer(state, attacker);
  if (!fx || (!fx.combatNearFollowing && !fx.combatVsUnitInFollowing)) return 0;
  const tile = state.map.tiles[battleTileIndex];
  let cs = 0;
  if (fx.combatNearFollowing && nearFollowingCity(state, tile, g)) cs += fx.combatNearFollowing;
  if (fx.combatVsUnitInFollowing && tileFollowedReligion(state, tile) === g) cs += fx.combatVsUnitInFollowing;
  return cs;
}

/** B6-S1: enhancer combat adders for a UNIT DEFENDER (Just War near a
 * following city + Defender of the Faith on following-city territory). The
 * battle tile is the defender's own tile. */
export function religionDefenseCS(state: GameState, defender: Unit, defTileIndex: number): number {
  const g = unitReligion(state, defender);
  if (g < 0) return 0;
  const fx = unitEnhancer(state, defender);
  if (!fx || (!fx.combatNearFollowing && !fx.combatDefendFollowing)) return 0;
  const tile = state.map.tiles[defTileIndex];
  let cs = 0;
  if (fx.combatNearFollowing && nearFollowingCity(state, tile, g)) cs += fx.combatNearFollowing;
  if (fx.combatDefendFollowing && tileFollowedReligion(state, tile) === g) cs += fx.combatDefendFollowing;
  return cs;
}

/** #45/B-6: the defender's total combat strength for a hit on `defTileIndex`,
 * including B-7 support (which always accompanies the defender). An EMBARKED
 * defender overrides EVERYTHING: a flat EMBARKED_DEFENSE_CS − woundPenalty,
 * with NO terrain / fortify / support terms (real Civ 6 — ships-in-transit are
 * soft targets). Used by every melee/ranged/walls site so the override is
 * applied identically. Flanking (the attacker's term) is added separately. */
export function defenderCS(state: GameState, defender: Unit, defTileIndex: number): number {
  // B7-G (B-8): the general/admiral aura joins the defender's assembly at every
  // unit-vs-unit defenderCS caller (embarked → ADMIRAL branch of generalAuraCS).
  if (defender.embarked) return EMBARKED_DEFENSE_CS - woundPenalty(defender) + generalAuraCS(state, defender, defTileIndex);
  const tile = state.map.tiles[defTileIndex];
  return (
    (UNITS[defender.type]?.combat ?? 0) +
    terrainDefense(tile) +
    fortifyBonus(defender) -
    woundPenalty(defender) +
    SUPPORT_CS * supportCount(state, defTileIndex, defender) +
    xpLevelBonus(defender) + // B-4: veterancy — an embarked defender got the flat override above (no xp)
    religionDefenseCS(state, defender, defTileIndex) + // B6-S1: enhancer adders (unit-vs-unit — every defenderCS caller is one; city strikes assemble inline without them)
    generalAuraCS(state, defender, defTileIndex) // B7-G (B-8): Great General/Admiral aura
  );
}

export function damageRoll(state: GameState, strengthDiff: number, k = '?', t = -1): number {
  // P4/D-1: the real Civ 6 random factor is 0.8–1.2 (equal-strength hits
  // land "reliably 24–36"), not the old 0.75–1.25.
  //
  // #78 SOURCING SWEEP (2026-07-28). The BASE and the EXPONENT are VERIFIED
  // EXACT against the reverse-engineered Civ 6 formula
  // (damage = 30 * e^(strengthDiff / 25) * random): base 30 matches, and
  // `30 * exp(0.04 * q / 10)` with q = round(diff*10) is exp(0.04*diff) =
  // exp(diff/25) — the same curve, just pre-quantized for the GPU exp table.
  //
  // The RANDOM RANGE is CONTESTED and deliberately NOT changed. The community
  // formula quotes 0.75–1.25, but the SAME source states equal-strength hits
  // land "reliably between 24 and 36" — and 30 × [0.75, 1.25] = [22.5, 37.5],
  // whereas 30 × [0.8, 1.2] = [24, 36] exactly. The repo's 0.8–1.2 is the
  // internally consistent reading of that evidence, so it stands. Recorded
  // rather than flipped: changing a live constant on contradictory sources is
  // the same failure the sourcing sweep exists to fix.
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
    (u) => isPlayerSeat(u.seat) && unitDomain(u.type) === 'military',
  );
  return Math.max(15, state.bestMeleeCS ?? 0) + (garrison ? 5 : 0);
}

function killUnit(state: GameState, unit: Unit): void {
  markAntiquitySite(state, unit.tileIndex); // B-20 (#79): a death leaves a dig
  disbandUnit(state, unit.id);
}

/**
 * B-20 (#79): stamp an ANTIQUITY SITE. Real Civ 6 creates these from PRE-MODERN
 * events — razing a barbarian outpost, or a unit dying — and they are what an
 * Archaeologist excavates into an Artifact. Both events already exist here, so
 * this needs no invented placement rule and no map-generation pass.
 * The era gate is the sourced part: sites stop being created once the world
 * reaches the MODERN era (ERAS index 5).
 * A tile already carrying a site does not stack — one dig per tile, like Civ 6.
 */
export function markAntiquitySite(state: GameState, tileIndex: number): void {
  const t = state.map.tiles[tileIndex];
  if (!t || t.antiquity || isWater(t) || t.district || t.builtWonder) return;
  if (civEraIndex(playerSeat(state).research.techs, playerSeat(state).research.civics) >= MODERN_ERA_INDEX) return;
  t.antiquity = true;
}

/** Sack: population and gold loss, improvements around the center pillaged. */
function sackCity(state: GameState, city: City): void {
  city.population = Math.max(1, Math.floor(city.population * 0.75));
  // GS: milli-round the treasury before ×0.2 so a sub-milli non-dyadic-gold drift can't tip the
  // round across a .5 boundary and desync the sack by 1 gold vs the GPU (which mirrors this).
  playerSeat(state).treasury -= Math.min(100, Math.round((Math.round(playerSeat(state).treasury * 1000) / 1000) * 0.2));
  const center = state.map.tiles[city.centerIndex];
  for (const t of neighbors(state.map, center)) {
    if (t.improvement && !t.pillaged) t.pillaged = true;
  }
  city.hp = Math.round(CITY_MAX_HP / 2);
}

function attackCity(state: GameState, attacker: Unit, city: City): void {
  // B-29: the attacker's wound penalty reduces its CS; a river-crossing melee
  // takes −5. The city center is not a unit (cityDefenseStrength unchanged).
  const atkCS =
    (UNITS[attacker.type]?.combat ?? 0) -
    woundPenalty(attacker) -
    (crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[city.centerIndex]) ? RIVER_ATTACK_PENALTY : 0) +
    xpLevelBonus(attacker) + // B-4: attacker veterancy (the city is not a unit — no defender xp)
    // #71 (debt): the enhancer attacker adders apply to city assaults too —
    // Crusade/Just War raise the UNIT's combat strength by where it STANDS,
    // not by what it hits. Scoped to RIVAL attackers only, because the GPU
    // never sets the PLAYER's holy city (holy_tile[:, 0] is written nowhere),
    // so a player religion exists in TS and not on the GPU. That asymmetry is
    // PRE-EXISTING (the unit-vs-unit sites carry it too, dormant) but applying
    // the term here made it REACHABLE off-script — rollout seeds 9183/9235 went
    // red on draw counts. Record as a G-item; drop this guard the moment the
    // GPU grows a player holy city (it rides #50's religion verb).
    (CITY_RELIGION_ADDER_LIVE && isRivalSeat(attacker.seat) ? religionAttackCS(state, attacker, city.centerIndex) : 0) +
    generalAuraCS(state, attacker, attacker.tileIndex); // #70/S2 (B-8): the aura covers city assaults too
  const defCS = cityDefenseStrength(state, city);
  const dmgToCity = damageRoll(state, atkCS - defCS, 'pcty', city.centerIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, 'pctyc', city.centerIndex);
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the attack executed
  // AUDIT B-1: the ANCIENT_WALLS outer pool soaks the hit first — only the
  // spillover reaches city HP (a deliberate simplification of Civ 6's
  // percentage wall rules: outer absorbs the whole roll until depleted).
  // No walls → outerHp absent (0) → the full roll lands, exactly as before.
  const outer = city.outerHp ?? 0;
  const absorbed = Math.min(outer, dmgToCity);
  if (absorbed > 0) city.outerHp = outer - absorbed;
  city.hp = city.hp - (dmgToCity - absorbed);
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
  if (city.hp <= 0) {
    // V-W2 symmetric: a RIVAL conqueror takes the city (the loyalty-flip
    // transfer); barbarians still merely sack.
    if (isRivalSeat(attacker.seat)) {
      const rival = rivalOfSeat(state, attacker.seat);
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

/**
 * B-17 (#71): a melee assault ON an Encampment tile. Real Civ 6: the district
 * fights independently of its city, so the attacker trades rolls with it at the
 * CITY's defense strength and the district's own garrison pool takes the
 * damage. Beating it to 0 opens the tile (the block in `tileFreeForUnit` lifts)
 * and silences its strike — the game's "occupied Encampment". The attacker does
 * NOT advance: entry costs a separate move, exactly like a city assault.
 *
 * The attacker's CS is assembled EXACTLY as `attackCity` assembles it (wound,
 * river, veterancy, the gated religion adder, aura) so the two assault kinds
 * cannot drift; only the target pool and the roll keys differ.
 */
function attackEncampment(
  state: GameState,
  attacker: Unit,
  tileIndex: number,
  defCS: number,
  k: string,
): void {
  const tile = state.map.tiles[tileIndex];
  const atkCS =
    (UNITS[attacker.type]?.combat ?? 0) -
    woundPenalty(attacker) -
    (crossesRiver(state.map.tiles[attacker.tileIndex], tile) ? RIVER_ATTACK_PENALTY : 0) +
    xpLevelBonus(attacker) +
    (CITY_RELIGION_ADDER_LIVE && isRivalSeat(attacker.seat) ? religionAttackCS(state, attacker, tileIndex) : 0) +
    generalAuraCS(state, attacker, attacker.tileIndex);
  const dmgToEncamp = damageRoll(state, atkCS - defCS, k, tileIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, k + 'c', tileIndex);
  gainXp(attacker, XP_ATTACK);
  tile.encampHp = Math.max(0, (tile.encampHp ?? ENCAMPMENT_HP) - dmgToEncamp);
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  if (attacker.hp <= 0) killUnit(state, attacker);
}

/**
 * B-17 (#71): the defense strength an Encampment on `tile` fights at — its
 * OWNING city's, since the district is part of that city's defenses. Returns
 * null when the tile is not a live enemy Encampment for this attacker.
 */
export function encampmentDefense(
  state: GameState,
  attacker: Unit,
  tile: Tile,
): { defCS: number; k: string } | null {
  if (!encampmentBlocks(state, tile, attacker)) return null;
  // The CIV-level defense floor, deliberately WITHOUT the city-center garrison
  // term: that +5 is "a unit is standing in the city centre", which has nothing
  // to do with this district. A unit standing on the ENCAMPMENT is fought as a
  // unit instead (the `enemies.length === 0` precedence in meleeAttack), so the
  // district never doubles up with a defender.
  if (tile.rivalId !== undefined) {
    const rival = state.rivals.find((r) => r.id === tile.rivalId);
    if (!rival) return null;
    return { defCS: Math.max(15, rival.bestMeleeCS ?? 0), k: 'renc' };
  }
  return { defCS: Math.max(15, state.bestMeleeCS ?? 0), k: 'penc' };
}

/** Melee attack an adjacent enemy unit or city tile. */
export function meleeAttack(state: GameState, attackerId: number, targetIndex: number): RuleResult {
  const attacker = state.units.find((u) => u.id === attackerId);
  if (!attacker) return no('No such unit.');
  const def = UNITS[attacker.type];
  if (!def || def.combat <= 0) return no('Civilians cannot attack.');
  if (attacker.movesLeft <= 0) return no('No movement left.');
  if (attacker.embarked) return no('Embarked units cannot attack.'); // #45/B-6
  const from = state.map.tiles[attacker.tileIndex];
  const target = state.map.tiles[targetIndex];
  if (hexDistance(from.col, from.row, target.col, target.row) !== 1) {
    return no('Target must be adjacent.');
  }

  const enemies = unitsAt(state, targetIndex).filter((u) => unitsHostile(state, attacker, u));
  const hostileToPlayer = !isPlayerSeat(attacker.seat) && unitsHostile(state, attacker, { seat: PLAYER_CIV });
  const enemyCity =
    target.district === 'CITY_CENTER' && hostileToPlayer
      ? state.cities.find((c) => c.centerIndex === targetIndex)
      : undefined;
  const rivalTarget =
    isPlayerSeat(attacker.seat) || isBarbSeat(attacker.seat)
      ? rivalCityAt(state, targetIndex)
      : isRivalSeat(attacker.seat)
      ? (() => {
          // A-19/B-33 (S2): an at-war rival attacker targets an ENEMY rival's
          // city (never its own); civsAtWar already gates the target scan.
          const rc = rivalCityAt(state, targetIndex);
          return rc && civOfRival(rc.rival.id) !== attacker.seat && civsAtWar(state, unitSeat(attacker), rc.rival.id + 1)
            ? rc
            : undefined;
        })()
      : undefined;
  const csTarget = (() => {
    const cs = cityStateAt(state, targetIndex);
    if (!cs || cs.centerIndex !== targetIndex) return undefined;
    // A-18 (#79): a city-state is a separate player — the PLAYER must have
    // DECLARED war before striking it. This used to accept ANY city-state, so
    // a UI/RL order could siege a civ we were at peace with while
    // attackTargets (correctly) never offered one. Both sides now read cs.atWar.
    if (isPlayerSeat(attacker.seat)) return cs.atWar ? cs : undefined;
    // A-12b join-the-suzerain's-war: an AT-WAR rival may siege a CS whose
    // suzerain is the player (attackTargets applies the same gate).
    if (isRivalSeat(attacker.seat)) {
      const rv = rivalOfSeat(state, attacker.seat);
      if (rv?.atWar && isSuzerain(cs)) return cs;
    }
    return undefined;
  })();

  // B-17 (#71): a live enemy Encampment is a target in its own right. Checked
  // BEFORE the "nothing to attack" bail and AFTER the unit scan, so a garrison
  // standing on the district is fought first (real Civ 6 hits the unit).
  const encamp = enemies.length === 0 ? encampmentDefense(state, attacker, target) : null;
  if (enemies.length === 0 && !enemyCity && !rivalTarget && !csTarget && !encamp) {
    return no('Nothing to attack there.');
  }
  if (encamp && !enemyCity && !rivalTarget && !csTarget) {
    attackEncampment(state, attacker, targetIndex, encamp.defCS, encamp.k);
    return ok;
  }

  if (enemyCity) {
    attackCity(state, attacker, enemyCity);
    return ok;
  }

  if (enemies.length === 0 && rivalTarget) {
    if (isPlayerSeat(attacker.seat) && !rivalTarget.rival.atWar) {
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
  const atkCS = def.combat - woundPenalty(attacker) - (crossesRiver(from, target) ? RIVER_ATTACK_PENALTY : 0);

  if ((defDef?.combat ?? 0) <= 0) {
    // AUDIT B-31: a melee attack on a lone civilian CAPTURES it — no combat
    // roll (draw-count neutral). Player and rival attackers flip the
    // defender to their side in place (movesLeft=0, hp and charges kept,
    // unit stays on its tile); the attacker spends its attack but does NOT
    // advance (single-occupancy model). Barbarians still merely kill — no
    // prisoner/camp system is modeled (recorded simplification).
    if (isBarbSeat(attacker.seat)) {
      killUnit(state, defender);
    } else {
      defender.seat = attacker.seat; // #51/S1.3b: one field carries the whole ownership change
      defender.movesLeft = 0;
      attacker.movesLeft = 0;
      // GPU parity: the batch engine transfers the captured unit to the END
      // of the winning pool (append at next_slot). Mirror that here — splice
      // it out of state.units and push it back — so both engines iterate the
      // captured unit LAST in every array-order loop (rivalBuilderActions,
      // the war loop, the builder walker). Flipping owner in place would keep
      // the unit at its original PLAYER-spawn index, which the pooled GPU has
      // no way to reproduce; the resulting order desync surfaces (dormant)
      // when two same-civ builders contend for a job the same turn.
      state.units = state.units.filter((u) => u.id !== defender.id);
      state.units.push(defender);
      return ok;
    }
  } else {
    // B-7: flanking helps the attacker, support helps the defender. Applied
    // ONCE so both paired rolls see the same adjusted CS. #45/B-6: defenderCS
    // folds in support AND the embarked-defender override (flat CS, no terms).
    // B-4: attacker veterancy joins the flank term; defenderCS folds in the
    // defender's own level bonus. Applied once so both paired rolls agree.
    const atkCSf = atkCS + FLANKING_CS * flankCount(state, targetIndex, attacker, defender) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex); // B6-S1 + B7-G (B-8): aura keyed on the ATTACKER's own tile
    const defCSf = defenderCS(state, defender, targetIndex);
    defender.hp -= damageRoll(state, atkCSf - defCSf, 'mel', targetIndex);
    attacker.hp -= damageRoll(state, defCSf - atkCSf, 'melc', targetIndex);
    gainXp(attacker, XP_ATTACK); // B-4: +5 for the attack executed
    awardDefenseXp(defender); // B-4: +2 to a surviving military defender
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
  if (attacker.embarked) return no('Embarked units cannot attack.'); // #45/B-6
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
    if (isPlayerSeat(attacker.seat)) {
      const rc = rivalCityAt(state, targetIndex);
      if (rc && rc.rival.atWar) {
        const defCS = rivalCityDefense(state, rc.rival, rc.city);
        rc.city.hp = Math.max(1, rc.city.hp - damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + /* #71: no religion term — this path is PLAYER-only and the GPU never sets the player's holy city */ generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rngrc', targetIndex)); // #70/S2 (B-8)
        attacker.movesLeft = 0;
        gainXp(attacker, XP_ATTACK); // B-4: +5 for the bombardment (city not a unit — no defender xp)
        return ok;
      }
      const cs = cityStateAt(state, targetIndex);
      if (cs && cs.centerIndex === targetIndex) {
        const defCS = 15 + cs.population + (cs.type === 'militaristic' ? 6 : 0);
        cs.hp = Math.max(1, (cs.hp ?? CS_MAX_HP) - damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + /* #71: no religion term — this path is PLAYER-only and the GPU never sets the player's holy city */ generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rngcs', targetIndex)); // #70/S2 (B-8)
        attacker.movesLeft = 0;
        gainXp(attacker, XP_ATTACK); // B-4: +5 for the bombardment
        return ok;
      }
    }
    return no('Nothing to attack there.');
  }
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  // B-5 + B-29 + B-7 support (no flanking: a ranged attacker takes no
  // retaliation). #45/B-6: defenderCS applies the embarked-defender override.
  const defCS = defenderCS(state, defender, targetIndex);
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rng', targetIndex); // B6-S1 + B7-G (B-8)
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the ranged attack executed
  awardDefenseXp(defender); // B-4: +2 to a surviving military defender (civilians excluded)
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
  const hostileToPlayer = !isPlayerSeat(attacker.seat) && unitsHostile(state, attacker, { seat: PLAYER_CIV });
  const enemyCity =
    target.district === 'CITY_CENTER' && hostileToPlayer
      ? state.cities.find((c) => c.centerIndex === targetIndex)
      : undefined;
  if (enemyCity) {
    const defCS = cityDefenseStrength(state, enemyCity);
    enemyCity.hp = Math.max(
      1,
      enemyCity.hp - damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + (CITY_RELIGION_ADDER_LIVE ? religionAttackCS(state, attacker, targetIndex) : 0) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'vrngc', targetIndex), // #70/S2 (B-8)
    );
    attacker.movesLeft = 0;
    gainXp(attacker, XP_ATTACK); // B-4: +5 for the bombardment (city not a unit)
    return;
  }
  // A-19/B-33 (S2/S3): a rival's RANGED unit does NOT engage enemy rival units
  // (the ranged-vs-rival scope-out — the SAME predicate attackTargets applies).
  // Without this, a rival ranged unit selected via the loose city-center bombard
  // path (playerCity keys on district===CITY_CENTER, not player ownership) would
  // fall through to strike a rival unit STANDING ON an enemy rival's center —
  // the GPU's `_hostile_ranged_strike` only hits player/barb units, so that
  // strike is a TS-only draw. This restores the documented "any other civ's
  // center is a no-op quirk" behavior when a hostile rival unit garrisons it.
  const enemies = unitsAt(state, targetIndex).filter(
    (u) => unitsHostile(state, attacker, u) && !(isRivalSeat(attacker.seat) && isRivalSeat(u.seat)),
  );
  if (enemies.length === 0) return; // the CITY_CENTER quirk: a no-op, like meleeAttack's `no(...)`
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  // B-5 + B-29 + B-7 support (no flanking: a ranged strike takes no
  // retaliation). #45/B-6: defenderCS applies the embarked-defender override.
  const defCS = defenderCS(state, defender, targetIndex);
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'vrng', targetIndex); // B6-S1 + B7-G (B-8)
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the ranged strike executed
  awardDefenseXp(defender); // B-4: +2 to a surviving military defender
  if (defender.hp <= 0) killUnit(state, defender);
  attacker.movesLeft = 0;
}

/** Tiles this unit can attack right now (UI helper). */
export function attackTargets(state: GameState, unit: Unit): number[] {
  const def = UNITS[unit.type];
  if (!def || def.combat <= 0 || unit.movesLeft <= 0) return [];
  if (unit.embarked) return []; // #45/B-6: embarked units cannot attack
  const from = state.map.tiles[unit.tileIndex];
  const range = def.ranged?.range ?? 1;
  const hostileToPlayer = !isPlayerSeat(unit.seat) && unitsHostile(state, unit, { seat: PLAYER_CIV });
  const out: number[] = [];
  for (const t of state.map.tiles) {
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < 1 || d > range) continue;
    // A-19/B-33 (S2): a rival's RANGED unit does NOT engage enemy rival units
    // (ranged-vs-rival scope-out — melee rivals fight rivals; player/barb
    // targets unchanged). def.ranged marks a ranged attacker.
    const hasEnemy = unitsAt(state, t.index).some(
      (u) => unitsHostile(state, unit, u) && !(def.ranged && isRivalSeat(unit.seat) && isRivalSeat(u.seat)),
    );
    // AUDIT A-6: ranged hostiles bombard city-center tiles at their full
    // range (the player's D-23 rule from the other seat); melee keeps d===1.
    // AUDIT #78: a unit must never target its OWN civ's centre. This arm was
    // ownership-blind — any CITY_CENTER tile counted while hostileToPlayer — so
    // a rival at war with the player selected its own capital, meleeAttack then
    // refused it, and because hostileUnitAct still returns the unit HELD: it
    // never marched again (seed 9170, a warrior frozen from t218 to the end).
    // Deliberately narrow: BARBARIANS own no cities, so their targeting is
    // unchanged, which keeps the barb paths byte-identical across both engines.
    // The neutral-rival case (targeting a rival one is at PEACE with) is left
    // as a RECORDED deviation — both engines share it, so it costs no parity.
    // #79 (#49): widened from ownCentre to ANY rival centre. Excluding only the
    // attacker's OWN capital left the NEUTRAL-rival case live: a rival at war
    // with the player still selected a rival centre it was at PEACE with, and
    // meleeAttack's rivalTarget refuses that (it gates on civsAtWar), so the
    // unit HELD and never marched — the identical freeze #78 fixed one case of.
    // The legitimate rival-vs-rival capture is unaffected: it comes in through
    // `rivalVsRivalCity` below (melee, d===1, civsAtWar), not through this arm.
    // MEASURED: an unconquered city-state's centre tile carries NO CITY_CENTER
    // district (it is set only on player/rival founding and on CS capture), so
    // city-states were never reachable here — the csWar arm owns that path.
    // Barbarians are untouched (the guard is `owner === 'rival'`), keeping the
    // barb paths byte-identical across both engines.
    const foreignCentre = isRivalSeat(unit.seat) && rivalCityAt(state, t.index) !== undefined;
    const playerCity = hostileToPlayer && t.district === 'CITY_CENTER' && d <= range && !foreignCentre;
    // P4/D-23: the player's ranged units bombard cities at their full range.
    const cityRange = isPlayerSeat(unit.seat) ? range : 1;
    const rivalCity =
      d <= cityRange &&
      ((isPlayerSeat(unit.seat) && (rivalCityAt(state, t.index)?.rival.atWar ?? false)) ||
        (isBarbSeat(unit.seat) && d === 1 && rivalCityAt(state, t.index) !== undefined));
    // A-19/B-33 (S2): a MELEE at-war rival unit may attack an ADJACENT enemy
    // rival's city center (capture via transferRivalCityToRival). Ranged-vs-
    // rival-city stays out of scope (melee finishes, like the A-12b csWar).
    const rivalVsRivalCity =
      isRivalSeat(unit.seat) &&
      d === 1 &&
      !def.ranged &&
      (() => {
        const rc = rivalCityAt(state, t.index);
        return (
          rc !== undefined &&
          civOfRival(rc.rival.id) !== unit.seat &&
          civsAtWar(state, unitSeat(unit), rc.rival.id + 1)
        );
      })();
    // A-12b join-the-suzerain's-war: an AT-WAR rival MELEE unit may attack
    // an adjacent CS center whose suzerain is THE PLAYER (strict contest).
    // Ranged-vs-CS stays out of scope (melee finishes, like capture).
    const csWar =
      isRivalSeat(unit.seat) &&
      hostileToPlayer &&
      d === 1 &&
      !def.ranged &&
      state.cityStates.some((c) => c.centerIndex === t.index && isSuzerain(c));
    // B-17 (#71): an adjacent live enemy Encampment is a melee target — the
    // only way to open its tile. Ranged-vs-district stays out of scope
    // (recorded residual), matching the ranged-vs-rival-city scope-out.
    const encampTarget = d === 1 && !def.ranged && encampmentBlocks(state, t, unit);
    // A-18 (#79): the CS-attack MASK column, unblocked by cs.atWar. The
    // autopilot invariant ("target lists never include PEACEFUL city-states")
    // is preserved by construction — only a DECLARED war offers the centre.
    // Melee + adjacent, the same shape as the rival-seat csWar arm above.
    const csPlayerWar =
      isPlayerSeat(unit.seat) &&
      d === 1 &&
      !def.ranged &&
      state.cityStates.some((c) => c.centerIndex === t.index && c.atWar);
    if (hasEnemy || playerCity || rivalCity || rivalVsRivalCity || csWar || csPlayerWar || encampTarget) out.push(t.index);
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
    (u) => isRivalSeat(u.seat) && u.seat === civOfRival(rival.id) && unitDomain(u.type) === 'military',
  );
  return Math.max(15, rival.bestMeleeCS ?? 0) + (garrison ? 5 : 0);
}

function attackRivalCity(state: GameState, attacker: Unit, rival: RivalCiv, city: RivalCity): void {
  const atkCS =
    (UNITS[attacker.type]?.combat ?? 0) -
    woundPenalty(attacker) -
    (crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[city.centerIndex]) ? RIVER_ATTACK_PENALTY : 0) +
    xpLevelBonus(attacker) + // B-29 wound + river (city not a unit) + B-4 attacker veterancy
    (CITY_RELIGION_ADDER_LIVE && isRivalSeat(attacker.seat) ? religionAttackCS(state, attacker, city.centerIndex) : 0) + // #71 (debt): see attackCity
    generalAuraCS(state, attacker, attacker.tileIndex); // #70/S2 (B-8)
  const defCS = rivalCityDefense(state, rival, city);
  // AUDIT B-1: the outer wall pool absorbs first (same rule as attackCity).
  const dmgToCity = damageRoll(state, atkCS - defCS, 'rcty', city.centerIndex);
  const outer = city.outerHp ?? 0;
  const absorbed = Math.min(outer, dmgToCity);
  if (absorbed > 0) city.outerHp = outer - absorbed;
  city.hp -= dmgToCity - absorbed;
  attacker.hp -= damageRoll(state, defCS - atkCS, 'rctyc', city.centerIndex);
  attacker.movesLeft = 0;
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the attack executed
  if (attacker.hp <= 0) killUnit(state, attacker);
  if (city.hp <= 0) {
    if (isPlayerSeat(attacker.seat)) {
      captureRivalCity(state, rival, city);
    } else if (isRivalSeat(attacker.seat)) {
      // A-19/B-33 (S2): a rival conqueror TAKES the enemy rival's city via the
      // EXISTING loyalty-flip transfer (B-30 infra-carry + POOL-END already in
      // place). No +40 plunder for the rival-vs-rival path (v1) and no raze cap
      // (RC=24 slots absorb it, like the loyalty flips).
      const toRival = rivalOfSeat(state, attacker.seat);
      if (toRival) transferRivalCityToRival(state, rival, toRival, city);
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
    (crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[cs.centerIndex]) ? RIVER_ATTACK_PENALTY : 0) +
    xpLevelBonus(attacker) + // B-29 wound + river (CS center not a unit) + B-4 attacker veterancy
    (CITY_RELIGION_ADDER_LIVE && isRivalSeat(attacker.seat) ? religionAttackCS(state, attacker, cs.centerIndex) : 0) + // #71 (debt): see attackCity
    generalAuraCS(state, attacker, attacker.tileIndex); // #70/S2 (B-8)
  const defCS = 15 + cs.population + (cs.type === 'militaristic' ? 6 : 0);
  cs.hp = (cs.hp ?? CS_MAX_HP) - damageRoll(state, atkCS - defCS, 'csty', cs.centerIndex);
  attacker.hp -= damageRoll(state, defCS - atkCS, 'cstyc', cs.centerIndex);
  attacker.movesLeft = 0;
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the attack executed
  if (attacker.hp <= 0) killUnit(state, attacker);
  if ((cs.hp ?? 0) <= 0) {
    // A-12b: a rival conqueror lands the CS as its own city.
    if (isRivalSeat(attacker.seat)) {
      const rv = rivalOfSeat(state, attacker.seat);
      if (rv) captureCityStateForRival(state, rv, cs);
    } else {
      captureCityState(state, cs);
    }
  }
}

/** Conquest of a city-state: it joins your empire; its envoys die with it. */
export function captureCityState(state: GameState, cs: CityState): void {
  state.cityStates = state.cityStates.filter((c) => c.id !== cs.id);
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.toCs !== cs.id);
  // A-12b: rival CS routes die with the city-state too (the A-11
  // routes-die-with-their-endpoint rule).
  for (const rv of state.rivals) {
    rv.tradeRoutes = rv.tradeRoutes?.filter((x) => x.toCs !== cs.id);
  }
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
  // #70 HUNT (new G-item): a conquered city-state's centre tile never got its
  // CITY_CENTER district, unlike foundCity (game.ts) and foundRivalCity
  // (rivals.ts) which both set it. Every `tile.district` reader therefore
  // treated an annexed CS centre as open ground: `attackTargets`' playerCity
  // check could not see it, `workableTiles` would let a citizen work it, and
  // settle/site scans counted it free. The GPU has no district-CITY_CENTER
  // plane and uses center_at/rvcity_at as the proxy, so it always treated it
  // as a city — i.e. TS was the wrong engine (real Civ 6: a conquered
  // city-state IS a city with a centre). Surfaced by #70/S5's ranged barb
  // scan, which extended the exposure from d==1 melee to d<=2.
  center.district = 'CITY_CENTER';
  center.cityId = id;
  state.cities.push({
    id,
    seat: PLAYER_CIV, // #51/S1.3d: a conquered city-state joins the PLAYER's seat
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
    hp: Math.round(CITY_MAX_HP / 2), // a conquered CS joins at half HP (S1.3)
  });
  revealAround(state, cs.centerIndex, 3);
  addEraScore(state, 0, ERA_SCORE_CONQUER); // B-24: gained a city (CS conquest)
  state.eventLog.push(`${cs.name} conquered — the city-state joins your empire.`);
}

/** A-12b: rival conquest of a city-state — the captureCityState twin on the
 * rival seat (join-the-suzerain's-war). Pop ×0.75 floor 1, the ring-2 csId
 * territory re-tags to the new rc, envoys die with the CS, the
 * RIVAL_MAX_CITIES raze rule, routes pruned with the endpoint. */
export function captureCityStateForRival(state: GameState, rival: RivalCiv, cs: CityState): void {
  state.cityStates = state.cityStates.filter((c) => c.id !== cs.id);
  state.tradeRoutes = state.tradeRoutes.filter((r) => r.toCs !== cs.id);
  for (const rv of state.rivals) {
    rv.tradeRoutes = rv.tradeRoutes?.filter((x) => x.toCs !== cs.id);
  }
  const center = state.map.tiles[cs.centerIndex];
  if (rival.cities.length >= RIVAL_MAX_CITIES) {
    for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
      if ((t.csId ?? -1) === cs.id) t.csId = undefined;
    }
    state.eventLog.push(`${cs.name} razed — ${rival.name} cannot govern more cities.`);
    return;
  }
  const id = rival.nextCityId++;
  for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
    if ((t.csId ?? -1) === cs.id) {
      t.csId = undefined;
      t.rivalId = rival.id;
      t.rivalCityId = id; // A-17: the conquered claim registers to the new rc
    }
  }
  center.district = 'CITY_CENTER'; // #70 HUNT: the captureCityState twin — see the note there
  rival.cities.push({
    id,
    name: cs.name,
    seat: civOfRival(rival.id),
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
    hp: Math.round(CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  });
  addEraScore(state, civOfRival(rival.id), ERA_SCORE_CONQUER); // B-24: gained a city (rival CS conquest)
  state.eventLog.push(`${cs.name} has been conquered by ${rival.name}!`);
}

/** Conquest: the rival city joins your empire (pop hit, no districts kept).
 * P5/S6: `plunder=false` for loyalty defections — same raze-at-6, territory
 * and elimination semantics, no +40 and no conquest log line. */
export function captureRivalCity(state: GameState, rival: RivalCiv, city: RivalCity, plunder = true): void {
  // B-22 (#74): taking a rival's city earns the PLAYER grievances — the twin of
  // transferRivalCityToRival's RR_WARMONGER_CAPTURE on the rival side.
  playerSeat(state).warmonger = (playerSeat(state).warmonger ?? 0) + RR_WARMONGER_CAPTURE;
  rival.cities = rival.cities.filter((c) => c.id !== city.id);
  relocatePalace(rival.cities); // #70/S4 (A-9): the losing rival re-crowns its biggest city
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
  // AUDIT B-30: conquest keeps infrastructure. The captured city carries its
  // districts (live, re-owned) and its buildings MINUS PALACE (never transfers)
  // and wonders. ANCIENT_WALLS is kept but its outer pool resets to 0 (it heals
  // back via B-1, and the new owner gains the B-2 walls strike once it stands).
  // The captured city's districts are DERIVED from the tiles that re-owned to
  // it (complete districts only), NOT copied from the rival's districts array —
  // a rival's .districts/tile registries can be inconsistent (rcId4 held
  // HOLY_SITE@891 while tile 891's registry pointed at rcId3; a re-owned tile's
  // complete district may be absent from the captured city's own array). This
  // mirrors the GPU twin exactly, which derives player districts from re-owned
  // tile ownership + district_complete liveness. INCOMPLETE captured districts
  // stay paved-but-dead (as pre-B-30): TS availableBuildings keys on a district
  // merely being PRESENT, so a carried incomplete Holy Site would let TS queue a
  // Shrine the GPU (district-complete gated) never could (seed 9235).
  const keptDistricts: { type: DistrictId; tileIndex: number }[] = [];
  for (const t of state.map.tiles) {
    if (t.cityId === id && t.district !== null && t.districtComplete) {
      keptDistricts.push({ type: t.district, tileIndex: t.index });
    }
  }
  const keptBuildings = city.buildings.filter((b) => b !== 'PALACE');
  const captured: City = {
    id,
    seat: PLAYER_CIV, // #51/S1.3d: a player city says so explicitly
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
    buildings: keptBuildings,
    districts: keptDistricts,
    wonders: city.wonders.filter((w) => state.map.tiles[w.tileIndex].cityId === id).map((w) => ({ ...w })),
    specialists: {},
    // A city taken by CONQUEST joins at half HP — this used to be a separate
    // `state.cityHp[id] = CITY_MAX_HP/2` write after the literal, and dropping
    // the side map without moving the value here left captured cities at FULL
    // health (caught by fixture byte-identity on 4 of 12 seeds).
    hp: Math.round(CITY_MAX_HP / 2),
  };
  if (keptBuildings.includes('ANCIENT_WALLS')) captured.outerHp = 0; // B-30: walls kept, outer pool 0
  state.cities.push(captured);
  addEraScore(state, 0, ERA_SCORE_CONQUER); // B-24: gained a city (conquest; the raze branch returned above)
  revealAround(state, city.centerIndex, 3);
  if (plunder) {
    playerSeat(state).treasury += 40;
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
  return state.units.filter((u) => isBarbSeat(u.seat));
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
  // A-19/B-33 (S2): a rival pillages/raids PLAYER tiles only while at war with
  // the player (barbarians always); a rival-only-war rival leaves the neutral
  // player's improvements alone. Rival-rival improvement pillage is out of
  // scope (residual) — enemy rival TILES are never a pillage/march target here.
  const atWarWithPlayer =
    isBarbSeat(unit.seat) || (isRivalSeat(unit.seat) && civsAtWar(state, unitSeat(unit), 0));
  const hereOwned = (here.cityId !== -1 && atWarWithPlayer) || (isBarbSeat(unit.seat) && here.rivalId !== undefined);
  if (here.improvement && !here.pillaged && hereOwned) {
    here.pillaged = true;
    if (PILLAGE_HEAL_IMPROVEMENTS.has(here.improvement)) {
      unit.hp = Math.min(UNIT_HP, unit.hp + 25);
    }
    unit.movesLeft = 0;
    return;
  }
  // AUDIT B-32: else pillage the district underfoot — a COMPLETE, non-
  // CITY_CENTER, unpillaged enemy district (player districts for any raider,
  // rival districts for barbarians too, the C-4a convention). No heal, no loot
  // (v1 — matches D-20: yield-type pillages bank nothing).
  if (
    here.district !== null &&
    here.district !== 'CITY_CENTER' &&
    here.districtComplete &&
    !here.districtPillaged &&
    hereOwned
  ) {
    here.districtPillaged = true;
    unit.movesLeft = 0;
    return;
  }

  // 3. March toward the nearest unpillaged improvement OR district (the B-32
  // union), else nearest city.
  let target: Tile | null = null;
  let bestDist = 13;
  for (const t of map.tiles) {
    const tOwned = (t.cityId !== -1 && atWarWithPlayer) || (isBarbSeat(unit.seat) && t.rivalId !== undefined);
    if (!tOwned) continue;
    const impJob = t.improvement !== null && !t.pillaged;
    const distJob =
      t.district !== null &&
      t.district !== 'CITY_CENTER' &&
      t.districtComplete &&
      !t.districtPillaged; // B-32
    if (!impJob && !distJob) continue;
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
  if (!target) {
    // A-8: nearest PLAYER city (barbarians always; a rival only when at war
    // with the player) — the EXISTING pick, byte-for-byte (stable sort =
    // founding order tie-break). A-19/B-33 (S2): a rival ALSO considers its
    // at-war enemy rivals' cities; the PLAYER wins any distance tie (lowest
    // unified civ id — documented), then rival cities by rival id, then
    // center tile index.
    const attackPlayer =
      isBarbSeat(unit.seat) ||
      (isRivalSeat(unit.seat) && civsAtWar(state, unitSeat(unit), 0));
    let pcTarget: Tile | null = null;
    let pcDist = Infinity;
    if (attackPlayer && state.cities.length > 0) {
      pcTarget = state.cities
        .map((c) => map.tiles[c.centerIndex])
        .sort(
          (a, b) =>
            hexDistance(here.col, here.row, a.col, a.row) -
            hexDistance(here.col, here.row, b.col, b.row),
        )[0];
      pcDist = hexDistance(here.col, here.row, pcTarget.col, pcTarget.row);
    }
    let rcTarget: Tile | null = null;
    let rcKey = Infinity;
    if (isRivalSeat(unit.seat)) {
      const ci = rivalOfCiv(unit.seat);
      for (const other of state.rivals) {
        if (other.id === ci) continue;
        if (!civsAtWar(state, ci + 1, other.id + 1)) continue;
        for (const rc of other.cities) {
          const t = map.tiles[rc.centerIndex];
          const d = hexDistance(here.col, here.row, t.col, t.row);
          // distance-major; tie-break rival id asc, then center tile index asc
          const key = d * (2048 * 8) + other.id * 2048 + rc.centerIndex;
          if (key < rcKey) {
            rcKey = key;
            rcTarget = t;
          }
        }
      }
    }
    // player wins ties (pcDist <= rival distance); else the nearest rival city
    const rcDist = rcTarget ? hexDistance(here.col, here.row, rcTarget.col, rcTarget.row) : Infinity;
    target = pcTarget && (rcTarget === null || pcDist <= rcDist) ? pcTarget : rcTarget;
  }
  if (!target) return;
  // AUDIT A-8 + B-26: RIVAL and BARBARIAN units both walk the march on REAL
  // MP — each step re-picks the passable free neighbor closest to the (fixed)
  // target, moves only if strictly closer, and pays walkPath's exact charge
  // (tile cost + 3 per river crossing; a full-MP unit always affords its first
  // step). Any step spends MP (movesLeft < full → the D-2 heal is blocked).
  // #45/B-6 EMBARK: the war-march is the ONLY v1 surface where a scripted mover
  // may take WATER steps. tileFreeForUnit(..., allowEmbark) composes the embark
  // gate (an at-war rival MILITARY unit whose owner has SHIPBUILDING — canEmbark)
  // and the ocean gate (CARTOGRAPHY). Barbarians own no tech, so canEmbark is
  // false for them and the shared walker stays land-only. `embarkState.live` is
  // the N1 master switch (default false → land-only, gates byte-identical); N2
  // flips it true with the embarked-combat + peace-act package.
  const allowEmbark = embarkState.live;
  for (;;) {
    const at = tile();
    // Embarked land units march on the flat EMBARK_MOVES pool; naval movers (N2)
    // keep their own moves.
    const naval = !!UNITS[unit.type]?.naval;
    const full = unit.embarked && !naval ? EMBARK_MOVES : UNITS[unit.type]?.moves ?? 2;
    const step = neighbors(map, at)
      .filter(
        (n) =>
          tileFreeForUnit(state, n.index, unit, allowEmbark) &&
          // B-26 (#79): a CLIFF closes the embark/disembark edge for the
          // war-march too — the GPU's _rival_unit_war_act has always masked it
          // out of step_ok, and TS did not, so a rival musketman walked over a
          // cliff onto water in the off-script gate (seed 9015, t198).
          // Filtered as a CANDIDATE (not a halt) so the march routes around it.
          !cliffBlocksStep(state, at, n, unit),
      )
      .sort(
        (a, b) =>
          hexDistance(a.col, a.row, target!.col, target!.row) -
          hexDistance(b.col, b.row, target!.col, target!.row),
      )[0];
    const stepD = hexDistance(step?.col ?? 0, step?.row ?? 0, target.col, target.row);
    if (!step || stepD >= hexDistance(at.col, at.row, target.col, target.row) || (!marchOnto && stepD < 1)) {
      return;
    }
    // Embark/disembark (a LAND unit crossing land↔water) costs ALL remaining MP;
    // water steps enter at 1 and never pay a river charge.
    const transition = !naval && isWater(at) !== isWater(step);
    const cost = transition
      ? unit.movesLeft
      : moveCostInto(at, step) + riverCharge(state, at, step); // B-23 (#71): roads
    if (unit.movesLeft < cost && unit.movesLeft < full) return;
    if (transition) unit.embarked = isWater(step);
    unit.tileIndex = step.index;
    unit.movesLeft = Math.max(0, unit.movesLeft - cost);
    clearCampFor(state, unit, step.index); // P5/S7 (C-3): rivals clear camps (barb no-op)
    // B-3 ZOC: a march step ending adjacent to a hostile MILITARY unit halts
    // (same per-step rule as walkPath / patrol / builder walk). AUDIT B-26/B-3
    // (ROUND B10): barbarians now OBEY ZOC exactly as rival movers do — the
    // rival-only gate is lifted. unitsHostile makes a barb halt at any adjacent
    // non-barb military (player always, at-war rivals always — barbs raid
    // rivals too); other barbs exert nothing. The GPU barb walk mirrors this
    // via _in_enemy_zoc_barb, so both engines stay symmetric. No new draws.
    if (inEnemyZoc(state, unit.tileIndex, unit)) {
      unit.movesLeft = 0;
      return;
    }
    if (unit.movesLeft <= 0) return;
  }
}

/**
 * AUDIT B-26 (ROUND B10): the shared barbarian MELEE era ladder. All three
 * spawn sites in barbarianPhase (new camp, empty-camp regarrison, the 0.1-roll
 * raid) climb it together — WARRIOR → SPEARMAN (t>60) → PIKEMAN (t>120) →
 * MUSKETMAN (t>180). Sized to the model (real Civ 6 scales barbs by era). The
 * CS levy ladder in rivals.ts is A-12 scope and untouched.
 */
function barbMeleeType(turn: number): string {
  return turn > 180 ? 'MUSKETMAN' : turn > 120 ? 'PIKEMAN' : turn > 60 ? 'SPEARMAN' : 'WARRIOR';
}

/**
 * #70/S5 (B-26): the RANGED barb ladder — real Civ 6 barbarian camps field
 * archers alongside melee. Every third camp (by its index in `state.barbCamps`,
 * NOT its tile) raids with a ranged unit instead of the melee ladder type.
 * Spawn TYPE only: the 0.1 raid roll above is untouched, so this is
 * draw-count neutral in both engines. TS needed no dispatch work —
 * `hostileUnitAct` already routes any `UNITS[type].ranged` attacker through
 * `hostileRangedStrike`; the GPU raider block needed a new ranged path.
 */
function barbRangedType(turn: number): string {
  return turn > 120 ? 'CROSSBOWMAN' : 'ARCHER';
}

/**
 * B-26 (2026-07-27): the barbarian NAVAL ladder. Real Civ 6 coastal camps put
 * out hulls, not just land raiders. GALLEY, then QUADRIREME past the same era
 * turn the crossbow ladder uses. Spawn TYPE only — draw-count neutral.
 */
function barbNavalType(turn: number): string {
  return turn > 120 ? 'QUADRIREME' : 'GALLEY';
}

/**
 * B-26 (#71): SCOUT-THEN-RAID. Real Civ 6 camps open with a scout that goes
 * looking for a target, and only then start producing raiders. Mirrored as
 * the spawn TYPE of a BRAND-NEW camp: its first unit is a SCOUT, while the
 * regarrison and raid sites keep the melee/ranged ladders. Draw-count neutral
 * (the camp-spawn roll above is untouched), and the scout rides the existing
 * barb walker — it marches and can attack like any melee barb, it is simply
 * weaker, which is exactly the early-camp pressure Civ 6 models.
 */
export const BARB_SCOUT_OPENER_LIVE = true; // B-26 (#71): LIVE — hunted 2026-07-26, see the spawn site

function barbScoutType(): string {
  return 'SCOUT';
}

/** Camps spawn, garrison, raid; cities heal when unbothered. */
export function barbarianPhase(state: GameState): void {
  const map = state.map;
  // Barbarians get their movement in their own phase (self-contained for tests/RL).
  for (const u of state.units) {
    if (isBarbSeat(u.seat)) u.movesLeft = UNITS[u.type]?.moves ?? 2;
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
      // B-26 (#71): the SCOUT opener is landed INERT (BARB_SCOUT_OPENER_LIVE),
      // the substrate-then-flip pattern used for B-18/A-5r/A-9 this round.
      // barbScoutType + the barb u_type 6 column + the type-aware barb march
      // (the GPU used to hardcode 2 MP, wrong the moment a SCOUT with 3 MP
      // spawns — fixed and kept) are all IN. WHY INERT: seed 9287 t250 splits
      // barbs 5 vs 4 with a draw-count split; the GPU ends up one barbarian
      // short and _spawn_barb accepts the type fine, so it is a later
      // death/gate difference needing a statelog. Flip = drop the guard.
      spawnUnit(state, BARB_SCOUT_OPENER_LIVE ? barbScoutType() : barbMeleeType(state.turn), spot.index, BARB_SEAT);
    }
  }

  // Garrisons + raiders.
  const barbs = barbUnits(state);
  // #70/S5: indexed loop (identical iteration ORDER, so no draw-order change)
  // because the ranged ladder keys off the camp's INDEX, not its tile.
  for (let campNo = 0; campNo < state.barbCamps.length; campNo++) {
    const campIdx = state.barbCamps[campNo];
    const camp = map.tiles[campIdx];
    const nearCamp = barbs.filter(
      (u) =>
        hexDistance(map.tiles[u.tileIndex].col, map.tiles[u.tileIndex].row, camp.col, camp.row) <= 1,
    );
    if (nearCamp.length === 0) {
      spawnUnit(state, barbMeleeType(state.turn), campIdx, BARB_SEAT); // B-26 era ladder
    } else if (
      barbUnits(state).length < state.barbCamps.length * MAX_BARB_PER_CAMP &&
      nextRandom(state) < 0.1
    ) {
      // #70/S5 (B-26): every third camp raids RANGED, the rest melee.
      // B-26 (2026-07-27): NAVAL barbarians — every FOURTH camp (a different
      // residue, so it never collides with the ranged rule) puts out a hull
      // instead, when it is COASTAL and has a free adjacent water tile. The
      // spot is the LOWEST-index free water neighbour, so this is zero-draw:
      // the 0.1 roll above already fired and nothing else is consulted.
      const water = neighbors(map, map.tiles[campIdx])
        // A tech-less barbarian cannot enter OCEAN (waterEnterable gates it on
        // CARTOGRAPHY), so only COAST/LAKE count — otherwise spawnUnit's own
        // probe would reject the pick and the two engines would disagree.
        .filter(
          (n) =>
            isWater(n) &&
            n.terrain !== 'OCEAN' &&
            !isImpassable(n) &&
            unitsAt(state, n.index).length === 0,
        )
        .sort((x, y) => x.index - y.index)[0];
      if (campNo % 4 === 1 && water) {
        spawnUnit(state, barbNavalType(state.turn), water.index, BARB_SEAT);
      } else {
        const type = campNo % 3 === 0 ? barbRangedType(state.turn) : barbMeleeType(state.turn);
        spawnUnit(state, type, campIdx, BARB_SEAT);
      }
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
  //
  // B-17 (ROUND B7) DRAW ORDER: real Civ 6 Encampments strike SEPARATELY from
  // walls, so a complete unpillaged Encampment fires the same once-per-turn
  // ranged strike as an ADDITIONAL roll (the second loop below). A city with
  // BOTH walls and an Encampment rolls twice — WALLS FIRST (this loop, over
  // all cities), THEN Encampment (the next loop, over all cities). Both loops
  // scan cities in identical order, so a walls kill in the first loop can
  // remove a target the Encampment loop would have hit; the GPU mirror runs
  // the two passes in the same order (k="pcstk" then k="pestk").
  for (const city of state.cities) {
    if (!city.buildings.includes('ANCIENT_WALLS')) continue;
    const center = map.tiles[city.centerIndex];
    let bestTile = -1;
    let bestDist = 99;
    for (const t of map.tiles) {
      const d = hexDistance(center.col, center.row, t.col, t.row);
      if (d < 1 || d > 2) continue;
      if (!unitsAt(state, t.index).some((u) => unitsHostile(state, u, { seat: PLAYER_CIV }))) continue;
      if (d < bestDist) {
        bestDist = d;
        bestTile = t.index;
      }
    }
    if (bestTile < 0) continue;
    const hostiles = unitsAt(state, bestTile).filter((u) => unitsHostile(state, u, { seat: PLAYER_CIV }));
    const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
    const tt = map.tiles[bestTile];
    // B-29 + B-7 support (attacker is the city — not a unit, so no flanking).
    // #45/B-6: an embarked target defends at the flat EMBARKED_DEFENSE_CS.
    const defCS = defender.embarked
      ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
      : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender); // B-4 defender veterancy (embarked → flat, no xp)
    // #70/S2 (B-8): a general/admiral shields its units from city fire too —
    // added OUTSIDE the embarked ternary, mirroring defenderCS (an embarked
    // defender keeps its flat CS but still gets its ADMIRAL's aura).
    const defCSa = defCS + generalAuraCS(state, defender, bestTile);
    const atkCS = cityDefenseStrength(state, city);
    defender.hp -= damageRoll(state, atkCS - defCSa, 'pcstk', bestTile);
    awardDefenseXp(defender); // B-4: +2 to a surviving military defender (attacker is the city — no attacker xp)
    if (defender.hp <= 0) killUnit(state, defender);
  }

  // B-17 (ROUND B7): the ADDITIONAL Encampment strike (walls-first order
  // documented above). A city with a COMPLETE unpillaged ENCAMPMENT fires the
  // same pattern — range 2, nearest player-hostile unit, one roll at the
  // city's defense strength, no retaliation, never captures — under k="pestk".
  // B-17 (#71): the strike now needs a LIVE garrison — an Encampment beaten to
  // 0 HP is occupied, and an occupied Encampment fires nothing (real Civ 6).
  // `encampmentIntact` folds in the complete/unpillaged tests it used to spell.
  for (const city of state.cities) {
    if (!city.districts.some((dd) => encampmentIntact(map.tiles[dd.tileIndex])))
      continue;
    const center = map.tiles[city.centerIndex];
    let bestTile = -1;
    let bestDist = 99;
    for (const t of map.tiles) {
      const d = hexDistance(center.col, center.row, t.col, t.row);
      if (d < 1 || d > 2) continue;
      if (!unitsAt(state, t.index).some((u) => unitsHostile(state, u, { seat: PLAYER_CIV }))) continue;
      if (d < bestDist) {
        bestDist = d;
        bestTile = t.index;
      }
    }
    if (bestTile < 0) continue;
    const hostiles = unitsAt(state, bestTile).filter((u) => unitsHostile(state, u, { seat: PLAYER_CIV }));
    const defender = hostiles.find((u) => unitDomain(u.type) === 'military') ?? hostiles[0];
    const tt = map.tiles[bestTile];
    const defCS = defender.embarked
      ? EMBARKED_DEFENSE_CS - woundPenalty(defender)
      : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender) + SUPPORT_CS * supportCount(state, bestTile, defender) + xpLevelBonus(defender);
    const defCSa = defCS + generalAuraCS(state, defender, bestTile); // #70/S2 (B-8), the pcstk mirror
    const atkCS = cityDefenseStrength(state, city);
    defender.hp -= damageRoll(state, atkCS - defCSa, 'pestk', bestTile);
    awardDefenseXp(defender);
    if (defender.hp <= 0) killUnit(state, defender);
  }

  // City healing when no hostile is adjacent. AUDIT B-1: the outer wall pool
  // heals on the same unbesieged gate and rate, capped at WALLS_HP (real
  // Civ 6 repairs walls too) — full-HP walled cities still heal their wall,
  // so the early `continue` on full city HP is gone.
  for (const city of state.cities) {
    const hp = city.hp;
    const center = map.tiles[city.centerIndex];
    const besieged = neighbors(map, center).some((n) =>
      unitsAt(state, n.index).some((u) => unitsHostile(state, u, { seat: PLAYER_CIV })),
    );
    if (besieged) continue;
    if (hp < CITY_MAX_HP) city.hp = Math.min(CITY_MAX_HP, hp + CITY_HEAL_PER_TURN);
    if (city.buildings.includes('ANCIENT_WALLS')) {
      city.outerHp = Math.min(WALLS_HP, (city.outerHp ?? WALLS_HP) + CITY_HEAL_PER_TURN);
    }
    // B-17 (#71): the Encampment garrison repairs on the SAME unbesieged gate
    // and rate as the walls — real Civ 6 districts heal back, which is what
    // lets a beaten-down Encampment re-block its tile later. Deliberate
    // simplification: the gate is the CITY's siege state, not the district's
    // own adjacency, so it matches the wall pool exactly.
    for (const d of city.districts) {
      if (d.type !== 'ENCAMPMENT') continue;
      const dt = map.tiles[d.tileIndex];
      if (dt.district !== 'ENCAMPMENT' || !dt.districtComplete || dt.districtPillaged) continue;
      dt.encampHp = Math.min(ENCAMPMENT_HP, (dt.encampHp ?? ENCAMPMENT_HP) + CITY_HEAL_PER_TURN);
    }
  }
}
