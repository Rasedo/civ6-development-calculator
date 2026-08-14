/**
 * Combat and barbarians. #78 sourced the DAMAGE FORMULA (base and exponent
 * verified exact; the random range is contested — see damageRoll). Damage uses the classic
 * 30·e^(0.04·Δstrength)·rand(0.8–1.2) curve, with +3 defense on
 * hills/woods/rainforest/marsh. Barbarian camps spawn in the wilds, garrison
 * themselves, and send raiders that pillage improvements and batter cities;
 * cities at 0 HP are sacked (population/gold loss, nearby pillaging), not
 * captured. All randomness flows through the in-state RNG.
 */

import type { City, CityState, GameState, ImprovementId, Seat, Tile, Unit } from './types';
import { neighbors, hexDistance, tilesWithin } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { civEraIndex } from './city';
import { logUnitOrder } from './seatTurn';  // #51/S8.1e
import { MODERN_ERA_INDEX } from '../data/techs';
import { UNITS, UNIT_HP, CITY_MAX_HP, ENCAMPMENT_HP } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { CITY_STATE_MAX_HP } from '../data/cityStates';
import { cityStateAt, isSuzerain } from './cityStates';
import { MAX_CITIES_PER_SEAT, ERA_SCORE_CONQUER } from '../data/seats';
import { addEraScore } from './eras';
import { nextRandom, unitsAt, unitDomain, tileFreeForUnit, spawnUnit, disbandUnit, unitsHostile, fortifyBonus, cityAtIndex, encampmentBlocks, crossesRiver, cliffBlocksStep, stepUnit } from './units';
import { EMBARKED_DEFENSE_CS, embarkState } from '../data/constants';
import { ENHANCER_BELIEFS, JUST_WAR_RANGE, CITY_RELIGION_ADDER_LIVE, type BeliefEffects } from '../data/religion';
import { revealAround, unexploredByAll } from './fog';
import { transferCity } from './phase';
import type { RuleResult } from './rules';
import { BARB_SEAT, NO_SEAT, allCities, capsOf, cityAtTile, civsAtWar, isBarbSeat, isCiv, seatOf, seatOfCityState, setTileOwner, tileCity, tileForeignTo, tileSeat, unitSeat } from './seats';
import { inGeneralAura, GENERAL_AURA_CS, GENERAL_AURA_RANGE, generalAuraMP } from './aura'; // #70/S2/S3 (B-8): the shared aura predicate
// The ONE full-MP contract, so the barbarian phase's reset cannot
// drift from every other seat's. units.ts already imports from here, so this
// closes a cycle — both directions are called at RUN time, never at module
// init, which is what makes that safe.
import { unitFullMoves } from './units';
import { warWearinessBattle } from './weariness';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export const CAMP_CLEAR_REWARD = 50;
export const MAX_BARB_PER_CAMP = 3;

/** any non-barbarian unit entering a camp tile clears it —
 * +50 to ITS civ's treasury (the other seats bank it like the seat 0). */
export function clearCampFor(state: GameState, unit: Unit, tileIndex: number, seat: number): void {
  // You do not clear your OWN camps. This was `isBarbSeat(...)` —
  // an identity test standing in for that rule, which only became sayable once
  // the camps belonged to a seat and `seatOf` answered for every seat.
  if (seatOf(state, unit.seat) === state.barbSeat) return;
  const camp = state.barbSeat.camps.indexOf(tileIndex);
  if (camp < 0) return;
  state.barbSeat.camps.splice(camp, 1);
  markAntiquitySite(state, tileIndex, seat); // B-20 (#79): a razed outpost leaves a dig
  const clearer = seatOf(state, unit.seat);
  if (clearer) clearer.treasury += CAMP_CLEAR_REWARD;
}

/** food improvements heal their pillager (real Civ 6); the rest
 * grant yields the pillager banks — nothing, for barbs and raiders.
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
  // Marsh and floodplains EXPOSE the defender (−2) —
  // they don't shelter like woods/rainforest. Marsh stays SLOW to enter
  // (moveCostInto, deliberately unchanged); only its DEFENSE value flips here.
  if (tile.feature === 'MARSH' || tile.feature === 'FLOODPLAINS') d -= 2;
  // FORT, sourced: "Occupying unit receives +4 Defense Strength".
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

// A damaged unit fights at reduced combat strength —
// −1 CS per 10 HP lost, LINEAR, up to −10 at 0 HP. Kept in float (no rounding);
// the strengthDiff it feeds into is quantized to 0.1 inside damageRoll so the
// GPU's exp table can reproduce the exact JS double. Cities / city-states /
// walls are NOT units — they never call this.
export const RIVER_ATTACK_PENALTY = 5; // B-29: melee across a river, attacker CS −5
export function woundPenalty(unit: { hp: number }): number {
  return 10 * ((UNIT_HP - unit.hp) / 100);
}

// flanking & support. Real Civ 6: a melee attacker gains +2 CS per
// OTHER unit adjacent to the defender that is hostile to the defender
// (flanking); a defender gains +2 CS per friendly MILITARY unit adjacent to it
// (support), against melee AND ranged. Cities / city-states / civCity-city targets
// are not units — no flanking against them (recorded simplification). Integer
// CS adds, so the diff quantization (q = round(Δ·10)) is preserved.
export const FLANKING_CS = 2;
export const SUPPORT_CS = 2;

// XP & levels. Real Civ 6: units earn experience and promote. Modeled
// scope (promotion TREES/abilities are the recorded residual): +5 XP per attack
// EXECUTED (any roll-producing melee/ranged, vs unit/city/CS/civCity), +2 per attack
// SURVIVED as a MILITARY defender (incl. city/walls strikes). Barbarians accrue
// nothing; civilians never fight (stay 0). XP_LEVELS grant a flat +5 CS per level
// at EVERY roll the unit fights (attack AND defense), an integer add entering the
// CS assembly exactly like the support terms (once, before paired rolls,
// preserved by the diff quantization). No promotion choice / heal / level-4+.
export const XP_ATTACK = 5;
export const XP_DEFEND = 2;
export const XP_LEVEL_CS = 5;
export const XP_LEVELS: readonly number[] = [15, 45, 90];

/** 0..3 — the number of XP_LEVELS thresholds this unit's xp has crossed. */
export function unitLevel(unit: { xp?: number }): number {
  const xp = unit.xp ?? 0;
  let level = 0;
  for (const t of XP_LEVELS) if (xp >= t) level++;
  return level;
}

/** the flat CS bonus a unit's veterancy grants at every roll it fights. */
export function xpLevelBonus(unit: { xp?: number }): number {
  return XP_LEVEL_CS * unitLevel(unit);
}

/** the flat XP a unit TRAINED or PURCHASED in a city starts
 * with — the BEST tier over the city's Encampment military buildings (not the
 * sum): BARRACKS/STABLE 5, ARMORY 10, MILITARY_ACADEMY 15 (data-driven off
 * BuildingDef.trainXp). Keys purely off building presence — a military
 * building cannot exist without a complete Encampment; district-pillage state
 * is NOT consulted (recorded residual). Applies to military units only. */
export function encampmentTrainXp(buildings: readonly string[]): number {
  let best = 0;
  for (const b of buildings) {
    const xp = BUILDINGS[b]?.trainXp ?? 0;
    if (xp > best) best = xp;
  }
  return best;
}

/** award XP to a unit — only where the seat's class allows it (#51/S6.11
 *  `caps.xp`; false for barbarians, who have no promotions in Civ 6). */
function gainXp(unit: Unit, amount: number): void {
  if (!capsOf(unit.seat).xp) return;
  unit.xp = (unit.xp ?? 0) + amount;
}

/** a surviving MILITARY defender earns +2 (civilians never fight; barbs
 * never accrue — gainXp guards that). Called after the defender's HP is set.
 * Exported for the city walls strike (cstk, phase.ts). */
export function awardDefenseXp(defender: Unit): void {
  if (defender.hp > 0 && unitDomain(defender.type) === 'military') gainXp(defender, XP_DEFEND);
}

/** Flanking count: MILITARY units u ≠ attacker, adjacent to the defender's
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

/** Support count: MILITARY units friendly to the defender (same owner AND
 * civId), adjacent to the defender's tile. Exported for the walls
 * strike (cstk, phase.ts). */
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

// Great General / Great Admiral aura. Real Civ 6 grants nearby own
// units +5 CS AND +1 MP. An own LAND military unit within GENERAL_AURA_RANGE of
// an own live GENERAL — or an own NAVAL/EMBARKED unit within range of an own
// live ADMIRAL — gains +GENERAL_AURA_CS at every damage-roll site (attack AND
// defense), an INTEGER add joining the quantized assembly (q=round(Δ·10)
// preserved) exactly like the JUST_WAR/CRUSADE religion adders. "Own" = same
// owner AND civId. The GENERAL/ADMIRAL units themselves are combat-0 civilians
// and never trigger this on their own account.
//
// widened the SCOPE from unit-vs-unit to every roll where a unit fights
// a city or a city strikes a unit (pcty/rcty/csty + their counter-rolls, the
// ranged-vs-city rolls, and the two city-strike keys cstk/estk).
// added the movement half (see `generalAuraMP` in aura.ts).
//
// The PREDICATE itself lives in aura.ts so this file and units.ts share ONE
// definition — combat.ts already imports units.ts, so units.ts cannot import
// back from here. Re-exported below to keep every existing importer working.
export { GENERAL_AURA_CS, GENERAL_AURA_RANGE };

export function generalAuraCS(state: GameState, unit: Unit, tileIndex: number): number {
  return inGeneralAura(state, unit, tileIndex) ? GENERAL_AURA_CS : 0;
}

/** the enhancer belief of a UNIT's civ religion (religion id = unified
 * Undefined for a seat with no founded religion and for an unenhanced one —
 * which is how barbarians and city-states answer, from their own empty data. */
function unitEnhancer(state: GameState, unit: Unit): BeliefEffects | undefined {
  const rel = seatOf(state, unit.seat)?.religion;
  return rel?.founded && rel.enhancer ? ENHANCER_BELIEFS[rel.enhancer]?.effects : undefined;
}

/** The religion id of a unit's owner, or -1 when it founded none. A religion
 * is keyed by the seat that founded it, so the id IS the owner's seat. */
function unitReligion(state: GameState, unit: Unit): number {
  return seatOf(state, unit.seat)?.religion.founded ? unit.seat : -1;
}

/** The followed religion of the city OWNING this tile (-1 = unowned, or owned
 *  by a city following nothing). Resolved through the per-city tile registry,
 *  `tileCity(tile)`. */
function tileFollowedReligion(state: GameState, tile: Tile): number {
  return cityAtTile(state, tile)?.followedReligion ?? -1;
}

/** is ANY city following religion g within JUST_WAR_RANGE of this tile?
 *  Whose city it is does not enter the rule. */
function nearFollowingCity(state: GameState, tile: Tile, g: number): boolean {
  for (const c of allCities(state)) {
    if (c.followedReligion !== g) continue;
    const t = state.map.tiles[c.centerIndex];
    if (hexDistance(tile.col, tile.row, t.col, t.row) <= JUST_WAR_RANGE) return true;
  }
  return false;
}

/** enhancer combat adders for the ATTACKER in a unit-vs-unit roll
 * (Just War near a following city + Crusade attacking onto following-city
 * territory). The battle tile is the DEFENDER's tile. City/CS targets get
 * nothing (unit-vs-unit scope). */
export function religionAttackCS(state: GameState, attacker: Unit, battleTileIndex: number): number {
  const g = unitReligion(state, attacker);
  if (g < 0) return 0;
  const fx = unitEnhancer(state, attacker);
  if (!fx || (!fx.combatNearFollowing && !fx.combatVsUnitInFollowing)) return 0;
  const tile = state.map.tiles[battleTileIndex];
  let bonus = 0;
  if (fx.combatNearFollowing && nearFollowingCity(state, tile, g)) bonus += fx.combatNearFollowing;
  if (fx.combatVsUnitInFollowing && tileFollowedReligion(state, tile) === g) bonus += fx.combatVsUnitInFollowing;
  return bonus;
}

/** enhancer combat adders for a UNIT DEFENDER (Just War near a
 * following city + Defender of the Faith on following-city territory). The
 * battle tile is the defender's own tile. */
export function religionDefenseCS(state: GameState, defender: Unit, defTileIndex: number): number {
  const g = unitReligion(state, defender);
  if (g < 0) return 0;
  const fx = unitEnhancer(state, defender);
  if (!fx || (!fx.combatNearFollowing && !fx.combatDefendFollowing)) return 0;
  const tile = state.map.tiles[defTileIndex];
  let bonus = 0;
  if (fx.combatNearFollowing && nearFollowingCity(state, tile, g)) bonus += fx.combatNearFollowing;
  if (fx.combatDefendFollowing && tileFollowedReligion(state, tile) === g) bonus += fx.combatDefendFollowing;
  return bonus;
}

/** the defender's total combat strength for a hit on `defTileIndex`,
 * including SUPPORT (which always accompanies the defender). An EMBARKED
 * defender overrides EVERYTHING: a flat EMBARKED_DEFENSE_CS − woundPenalty,
 * with NO terrain / fortify / support terms (real Civ 6 — ships-in-transit are
 * soft targets). Used by every melee/ranged/walls site so the override is
 * applied identically. Flanking (the attacker's term) is added separately. */
export function defenderCS(state: GameState, defender: Unit, defTileIndex: number): number {
  // The general/admiral aura joins the defender's assembly at every
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
  // The real Civ 6 random factor is 0.8–1.2 (equal-strength hits land
  // "reliably 24–36").
  //
  // SOURCING SWEEP. The BASE and the EXPONENT are VERIFIED
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
  // StrengthDiff is now a multiple of 0.1 (wounded units subtract
  // hp/10; a river melee subtracts 5). Quantize it to 0.1 granularity so the
  // GPU's exp table — indexed by round(diff·10) — reproduces this exact JS
  // double; one ulp in `base` can flip the rounded damage.
  const q = Math.round(strengthDiff * 10);
  const base = 30 * Math.exp((0.04 * q) / 10);
  // Combat log (tooling): every roll of the
  // CIV6_LOG game — the GPU _damage_roll twin. k = call-site tag, t =
  // target tile, c = the rng counter BEFORE the draw (absolute stream
  // position). `diff` logs the
  // quantized q (10·strengthDiff) so both engines print an identical int.
  const c0 = state.rngState >>> 0;
  const r = nextRandom(state);
  const dmg = Math.max(1, Math.round(base * (0.8 + 0.4 * r)));
  const cb = (globalThis as any).__cbLog;
  if (cb) cb.push(`k:${k} t:${t} c:${c0} diff${q} r${Math.round(r * 1e6)} dmg${dmg}`);
  return dmg;
}

// City defense = the strongest MELEE unit the owner
// has ever fielded (floor 15), +5 when the owner's own military garrisons
// the center. No population term; walls stay out of scope.
/**
 * A city's defence: its OWNER's strongest melee ever fielded (floor 15,
 * plus 5 for that owner's military garrisoning the centre.
 *
 */
export function cityDefenseStrength(state: GameState, city: City): number {
  const garrison = unitsAt(state, city.centerIndex).find(
    (u) => u.seat === city.seat && unitDomain(u.type) === 'military',
  );
  return Math.max(15, seatOf(state, city.seat)?.bestMeleeCS ?? 0) + (garrison ? 5 : 0);
}

/** The ONE combat death path: a unit dying in battle leaves an antiquity site.
 *  Every killer routes through here — including the city strikes in
 *  `phase.ts` — so the site appears whoever landed the blow. */
export function killUnit(state: GameState, unit: Unit, seat: number): void {
  markAntiquitySite(state, unit.tileIndex, seat); // B-20 (#79): a death leaves a dig
  disbandUnit(state, unit.id);
}

/**
 * Stamp an ANTIQUITY SITE. Real Civ 6 creates these from PRE-MODERN
 * events — razing a barbarian outpost, or a unit dying — and they are what an
 * Archaeologist excavates into an Artifact. Both events already exist here, so
 * this needs no invented placement rule and no map-generation pass.
 * The era gate is the sourced part: sites stop being created once the world
 * reaches the MODERN era (ERAS index 5).
 * A tile already carrying a site does not stack — one dig per tile, like Civ 6.
 */
export function markAntiquitySite(state: GameState, tileIndex: number, seat: number): void {
  const t = state.map.tiles[tileIndex];
  if (!t || t.antiquity || isWater(t) || t.district || t.builtWonder) return;
  if (civEraIndex(seatOf(state, seat)!.research.techs, seatOf(state, seat)!.research.civics) >= MODERN_ERA_INDEX) return;
  t.antiquity = true;
}

/** Sack: population and gold loss, improvements around the center pillaged.
 *  Barbarians sack; they never govern. `seat` owns the city being sacked. */
function sackCity(state: GameState, city: City | City, seat: number): void {
  city.population = Math.max(1, Math.floor(city.population * 0.75));
  // GS: milli-round the treasury before ×0.2 so a sub-milli non-dyadic-gold drift can't tip the
  // round across a .5 boundary and desync the sack by 1 gold vs the GPU (which mirrors this).
  const owner = seatOf(state, seat);
  if (owner) {
    owner.treasury -= Math.min(100, Math.round((Math.round(owner.treasury * 1000) / 1000) * 0.2));
  }
  const center = state.map.tiles[city.centerIndex];
  for (const t of neighbors(state.map, center)) {
    if (t.improvement && !t.pillaged) t.pillaged = true;
  }
  city.hp = Math.round(CITY_MAX_HP / 2);
}

/**
 * The attacker's combat strength for an assault on ANY fortified target — a
 * city center, a city-state center, or an Encampment. Six terms, in one
 * place so the assault kinds cannot drift:
 *
 * the wound penalty, the −5 river crossing, attacker veterancy
 * (a city is not a unit, so no defender xp), the #71 enhancer adder, and the
 * great-general aura.
 *
 * The enhancer adders apply to city assaults too — Crusade/Just
 * War raise the UNIT's combat strength by where it STANDS, not by what it
 * hits. Scoped to CIV SEAT attackers only, because the GPU never sets the
 * SEAT 0's holy city (holy_tile[:, 0] is written nowhere), so a seat 0
 * religion exists in TS and not on the GPU. That asymmetry is PRE-EXISTING
 * (the unit-vs-unit sites carry it too, dormant). Drop this guard the moment
 * the GPU grows a holy city for that seat.
 */
function assaultAtkCS(state: GameState, attacker: Unit, targetIndex: number): number {
  return (
    (UNITS[attacker.type]?.combat ?? 0) -
    woundPenalty(attacker) -
    (crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[targetIndex])
      ? RIVER_ATTACK_PENALTY
      : 0) +
    xpLevelBonus(attacker) +
    (CITY_RELIGION_ADDER_LIVE && isCiv(attacker.seat)
      ? religionAttackCS(state, attacker, targetIndex)
      : 0) +
    generalAuraCS(state, attacker, attacker.tileIndex)
  );
}

/**
 * One assault exchange against a city center, whoever owns it. Both rolls are
 * drawn in stream order — the city's damage first, the attacker's second —
 * which is what the both seats copies each did; nothing between them
 * touches the RNG, so this is the same stream either way.
 *
 * The ANCIENT_WALLS outer pool soaks the hit first — only the
 * spillover reaches city HP (a deliberate simplification of Civ 6's
 * percentage wall rules: outer absorbs the whole roll until depleted).
 * No walls → outerHp absent (0) → the full roll lands.
 *
 * The caller decides what happens if the city falls; that branch is still
 * per-owner because a City and a City live in different registries.
 */
function cityAssault(
  state: GameState,
  attacker: Unit,
  city: City | City,
  kCity: string,
  kAttacker: string, seat: number): void {
  const atkCS = assaultAtkCS(state, attacker, city.centerIndex);
  const defCS = cityDefenseStrength(state, city);
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CIV6_BATTLE_PROBE) {
    console.log(`TS-BATTLE seed=${state.map.seed} t=${state.turn} tgt=${city.centerIndex} atkCS=${atkCS} defCS=${defCS} ` +
      `combat=${UNITS[attacker.type]?.combat ?? 0} wound=${woundPenalty(attacker)} xp=${attacker.xp ?? 0} ` +
      `best=${Math.max(15, seatOf(state, city.seat)?.bestMeleeCS ?? 0)}`);
  }
  const dmgToCity = damageRoll(state, atkCS - defCS, kCity, city.centerIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, kAttacker, city.centerIndex);
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the attack executed
  const outer = city.outerHp ?? 0;
  const absorbed = Math.min(outer, dmgToCity);
  if (absorbed > 0) city.outerHp = outer - absorbed;
  city.hp -= dmgToCity - absorbed;
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  // A CITY is receiving the attack, so both sides score at the
  // abroad column whoever's borders it stands in. Scored BEFORE killUnit and
  // before the caller's capture branch — the location multiplier is the one
  // that applied while the battle was fought, not after the tile changes hands.
  warWearinessBattle(state, attacker.seat, city.seat, city.centerIndex,
    { aDied: attacker.hp <= 0, city: true });
  if (attacker.hp <= 0) killUnit(state, attacker, seat);
}


/**
 * A melee assault ON an Encampment tile. Real Civ 6: the district
 * fights independently of its city, so the attacker trades rolls with it at the
 * CITY's defense strength and the district's own garrison pool takes the
 * damage. Beating it to 0 opens the tile (the block in `tileFreeForUnit` lifts)
 * and silences its strike — the game's "occupied Encampment". The attacker does
 * NOT advance: entry costs a separate move, exactly like a city assault.
 *
 * The attacker's CS comes from the shared `assaultAtkCS`, so the assault kinds
 * cannot drift; only the target pool and the roll keys differ.
 */
function attackEncampment(
  state: GameState,
  attacker: Unit,
  tileIndex: number,
  defCS: number,
  k: string, seat: number): void {
  const tile = state.map.tiles[tileIndex];
  const atkCS = assaultAtkCS(state, attacker, tileIndex);
  const dmgToEncamp = damageRoll(state, atkCS - defCS, k, tileIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, k + 'c', tileIndex);
  gainXp(attacker, XP_ATTACK);
  tile.encampHp = Math.max(0, (tile.encampHp ?? ENCAMPMENT_HP) - dmgToEncamp);
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  // An Encampment is part of its city's defenses and fights
  // at that city's strength, so it scores as city combat for both sides.
  warWearinessBattle(state, attacker.seat, tileSeat(tile), tileIndex,
    { aDied: attacker.hp <= 0, city: true });
  if (attacker.hp <= 0) killUnit(state, attacker, seat);
}

/**
 * The defense strength an Encampment on `tile` fights at — its
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
  const owner = seatOf(state, tileSeat(tile));
  if (!owner) return null;
  // The label stays split: it names the damage-roll channel in the logs.
  return { defCS: Math.max(15, owner.bestMeleeCS ?? 0), k: owner.seat === 0 ? 'penc' : 'renc' };
}

/** Melee attack an adjacent enemy unit or city tile. */

/** the COMMIT seam for meleeAttack. The resolver returns early on a
 *  dozen refusals; logging inside it would record ATTEMPTS, and an attempt is
 *  not an action. Only a resolved order reaches the log, tagged with the
 *  ACTING SEAT — which is what made the city-first divergences of this round
 *  (a barbarian on a foreign centre; the GPU sieging a peaceful city-state) a
 *  state-column hunt instead of one diff. */
/**
 * May `seat` attack this city-state's centre? A DECLARED war on the minor
 * itself, or a war with ANY seat that is its SUZERAIN — contesting the
 * suzerain drags its minor in, and that is stored as the suzerainty rather
 * than as a war row, which is why it needs its own term.
 *
 * ONE rule, whoever attacks: `meleeAttack`, `rangedAttack` and the
 * `attackTargets` list all ask this, so an order can never reach a minor the
 * offered target list refused (the GPU's `_citystate_target` twin).
 */
export function cityStateAttackable(state: GameState, cityState: CityState, seat: number): boolean {
  return (
    civsAtWar(state, cityState.seat, seat) ||
    state.seats.some((sx) => isSuzerain(cityState, sx.seat) && civsAtWar(state, sx.seat, seat))
  );
}

export function meleeAttack(state: GameState, attackerId: number, targetIndex: number, seat: number): RuleResult {
  const r = meleeAttackInner(state, attackerId, targetIndex, seat);
  if (r.ok) {
    const u = state.units.find((x) => x.id === attackerId);
    if (u) logUnitOrder(state, u.seat, attackerId, 'melee', targetIndex);
  }
  return r;
}
function meleeAttackInner(state: GameState, attackerId: number, targetIndex: number, seat: number): RuleResult {
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
  // A city is a TARGET only if the attacker is AT WAR with the seat
  // that holds it. One rule, whoever attacks and whoever holds.
  //
  // `civsAtWar` is false for a seat against itself, so this also refuses an
  // attack on one's OWN centre without a separate term. BARBARIANS need no
  // war — `caps.alwaysHostile` is the whole point of the capability table,
  // and gating them on `civsAtWar` leaves them unable to sack anything.
  //
  // Being at PEACE with a city's owner is no reason to be unable to hit a
  // barbarian standing on it, so this falls through to the unit target
  // instead of diverting to the city and then refusing the whole action.
  const seatTarget = (() => {
    const civCity = cityAtIndex(state, targetIndex);
    if (!civCity) return undefined;
    return capsOf(attacker.seat).alwaysHostile
      || civsAtWar(state, unitSeat(attacker), civCity.holder.seat)
      ? civCity
      : undefined;
  })();
  const cityStateTarget = (() => {
    const cityState = cityStateAt(state, targetIndex);
    if (!cityState || cityState.centerIndex !== targetIndex) return undefined;
    return cityStateAttackable(state, cityState, unitSeat(attacker)) ? cityState : undefined;
  })();

  // A live enemy Encampment is a target in its own right. Checked
  // BEFORE the "nothing to attack" bail and AFTER the unit scan, so a garrison
  // standing on the district is fought first (real Civ 6 hits the unit).
  const encamp = enemies.length === 0 ? encampmentDefense(state, attacker, target) : null;
  if (enemies.length === 0 && !seatTarget && !cityStateTarget && !encamp) {
    // A seat CITY may sit here and simply not be a legal target
    // (at peace). `seatTarget` is undefined in that case now, so name the
    // REAL reason rather than claiming the tile is empty.
    const civCityHere = cityAtIndex(state, targetIndex);
    if (civCityHere && !civsAtWar(state, unitSeat(attacker), civCityHere.holder.seat)) {
      return no(`You are at peace with ${civCityHere.holder.name} — declare war first.`);
    }
    return no('Nothing to attack there.');
  }
  if (encamp && !seatTarget && !cityStateTarget) {
    attackEncampment(state, attacker, targetIndex, encamp.defCS, encamp.k, seat);
    return ok;
  }

  // CITY-FIRST over a MILITARY garrison. In Civ 6 a garrisoned
  // unit adds its strength to the CITY's defence; it is not a separate
  // defender standing in front of it.
  // https://forums.civfanatics.com/threads/669378/
  //
  // A LONE CIVILIAN still wins, and that is not an oversight: capture kills it
  // ROLL-FREE and advances, and P2's reshuffle pinned that against TS at seed
  // 9053 t204 (a seat builder on an at-war seat centre — besieging the city
  // there cost 2 extra draws). Civilians cannot defend, so they cannot be the
  // thing a city is attacked "through".
  const garrisoned = enemies.some((u) => unitDomain(u.type) === 'military');
  const cityFirst = enemies.length === 0 || garrisoned;
  if (seatTarget && cityFirst) {
    if (attacker.seat === seat && !civsAtWar(state, seatTarget.holder.seat, seat)) {
      return no(`You are at peace with ${seatTarget.holder.name} — declare war first.`);
    }
    attackCity(state, attacker, seatTarget.holder, seatTarget.city, seat);
    return ok;
  }

  if (cityStateTarget && cityFirst) {
    attackCityState(state, attacker, cityStateTarget, seat);
    return ok;
  }

  const defender =
    enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  const defDef = UNITS[defender.type];
  // Fortify and WOUNDS: both attacker and defender fight at their
  // HP-reduced strength (up to −10 at 0 HP). River: a melee attacker
  // crossing a river edge into the defender's tile takes −5.
  const atkCS = def.combat - woundPenalty(attacker) - (crossesRiver(from, target) ? RIVER_ATTACK_PENALTY : 0);

  if ((defDef?.combat ?? 0) <= 0) {
    // A melee attack on a lone civilian CAPTURES it — no combat
    // roll (draw-count neutral). Seat 0 and seat attackers flip the
    // defender to their side in place (movesLeft=0, hp and charges kept,
    // unit stays on its tile); the attacker spends its attack but does NOT
    // advance (single-occupancy model). Barbarians still merely kill — no
    // prisoner/camp system is modeled (recorded simplification).
    if (isBarbSeat(attacker.seat)) {
      killUnit(state, defender, seat);
    } else {
      defender.seat = attacker.seat; // #51/S1.3b: one field carries the whole ownership change
      defender.movesLeft = 0;
      attacker.movesLeft = 0;
      // GPU parity: the batch engine transfers the captured unit to the END
      // of the winning pool (append at next_slot). Mirror that here — splice
      // it out of state.units and push it back — so both engines iterate the
      // captured unit LAST in every array-order loop (builderActions,
      // the war loop, the builder walker). Flipping owner in place would keep
      // the unit at its original SEAT 0-spawn index, which the pooled GPU has
      // no way to reproduce; the resulting order desync surfaces (dormant)
      // when two same-civ builders contend for a job the same turn.
      state.units = state.units.filter((u) => u.id !== defender.id);
      state.units.push(defender);
      return ok;
    }
  } else {
    // Flanking helps the attacker, support helps the defender. Applied
    // ONCE so both paired rolls see the same adjusted CS. DefenderCS
    // folds in support AND the embarked-defender override (flat CS, no terms).
    // Attacker veterancy joins the flank term; defenderCS folds in the
    // defender's own level bonus. Applied once so both paired rolls agree.
    const atkCSf = atkCS + FLANKING_CS * flankCount(state, targetIndex, attacker, defender) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex); // B6-S1 + B7-G (B-8): aura keyed on the ATTACKER's own tile
    const defCSf = defenderCS(state, defender, targetIndex);
    defender.hp -= damageRoll(state, atkCSf - defCSf, 'mel', targetIndex);
    attacker.hp -= damageRoll(state, defCSf - atkCSf, 'melc', targetIndex);
    gainXp(attacker, XP_ATTACK); // B-4: +5 for the attack executed
    awardDefenseXp(defender); // B-4: +2 to a surviving military defender
    // Scored on the TARGET's tile, before either death is applied —
    // both sides pay, and the loser pays 3 bases more.
    warWearinessBattle(state, attacker.seat, defender.seat, targetIndex,
      { aDied: attacker.hp <= 0 && defender.hp > 0, dDied: defender.hp <= 0 });
    if (defender.hp <= 0) {
      killUnit(state, defender, seat);
      if (attacker.hp <= 0) attacker.hp = 1; // victor survives
    } else if (attacker.hp <= 0) {
      killUnit(state, attacker, seat);
      attacker.movesLeft = 0;
      return ok;
    }
  }
  attacker.movesLeft = 0;
  // Advance into the tile if it's now free for us.
  if (state.units.includes(attacker) && tileFreeForUnit(state, targetIndex, 0, attacker)) {
    attacker.tileIndex = targetIndex;
    clearCampFor(state, attacker, targetIndex, seat); // P5/S7 (C-3): every seat clears it
  }
  return ok;
}

/** Ranged attack within the unit's range (no retaliation taken). */

/** the COMMIT seam for rangedAttack. The resolver returns early on a
 *  dozen refusals; logging inside it would record ATTEMPTS, and an attempt is
 *  not an action. Only a resolved order reaches the log, tagged with the
 *  ACTING SEAT — which is what made the city-first divergences of this round
 *  (a barbarian on a foreign centre; the GPU sieging a peaceful city-state) a
 *  state-column hunt instead of one diff. */
export function rangedAttack(state: GameState, attackerId: number, targetIndex: number, seat: number): RuleResult {
  const r = rangedAttackInner(state, attackerId, targetIndex, seat);
  if (r.ok) {
    const u = state.units.find((x) => x.id === attackerId);
    if (u) logUnitOrder(state, u.seat, attackerId, 'ranged', targetIndex);
  }
  return r;
}
function rangedAttackInner(state: GameState, attackerId: number, targetIndex: number, seat: number): RuleResult {
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
  // City-first over a MILITARY garrison; a lone civilian still
  // takes the shot (see meleeAttack for the rule and its seed-9053 precedent).
  if (enemies.length === 0 || enemies.some((u) => unitDomain(u.type) === 'military')) {
    // Ranged units CAN bombard cities — same fallback
    // chain as meleeAttack (seat city, then city-state center), one roll,
    // no retaliation. Ranged fire never captures: the city holds at 1 HP
    // until melee takes it.
    //
    // WHOEVER fires: the arms key on the ATTACKER's own seat, so an ordered
    // ranged attack resolves the same way for every seat (the GPU's
    // `_ranged_attack`, which the applier dispatches by unit type alone).
    // The enhancer attacker adders key on where the unit STANDS rather than
    // on what it hits, so they join the city arms behind the same live flag
    // every other city-attack path asks.
    const atkSeat = unitSeat(attacker);
    const relCity = CITY_RELIGION_ADDER_LIVE && isCiv(attacker.seat)
      ? religionAttackCS(state, attacker, targetIndex)
      : 0;
    const civCity = cityAtIndex(state, targetIndex);
    if (civCity && (capsOf(attacker.seat).alwaysHostile || civsAtWar(state, atkSeat, civCity.holder.seat))) {
      const defCS = cityDefenseStrength(state, civCity.city);
      civCity.city.hp = Math.max(1, civCity.city.hp - damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + relCity + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rngrc', targetIndex)); // #70/S2 (B-8)
      warWearinessBattle(state, attacker.seat, civCity.city.seat, targetIndex, { city: true }); // #51/S7.8f
      attacker.movesLeft = 0;
      gainXp(attacker, XP_ATTACK); // B-4: +5 for the bombardment (city not a unit — no defender xp)
      return ok;
    }
    const cityState = cityStateAt(state, targetIndex);
    // Bombardment needs a war exactly as melee does, and asks the SAME
    // question — `cityStateAttackable`, suzerain clause included. This arm
    // once took ANY city-state, so the two TS paths disagreed with each
    // other about one rule; real Civ 6 treats a city-state as a separate
    // seat you must declare on. See [[target-legality-gates]].
    if (cityState && cityState.centerIndex === targetIndex && cityStateAttackable(state, cityState, atkSeat)) {
      const defCS = 15 + cityState.population + (cityState.type === 'militaristic' ? 6 : 0);
      cityState.hp = Math.max(1, (cityState.hp ?? CITY_STATE_MAX_HP) - damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + relCity + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rngcs', targetIndex)); // #70/S2 (B-8)
      warWearinessBattle(state, attacker.seat, seatOfCityState(cityState.id), targetIndex, { city: true }); // #51/S7.8f
      attacker.movesLeft = 0;
      gainXp(attacker, XP_ATTACK); // B-4: +5 for the bombardment
      return ok;
    }
  }
  // No city took the shot — fall through to the unit, or bail.
  if (enemies.length === 0) return no('Nothing to attack there.');
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  // support (no flanking: a ranged attacker takes no
  // retaliation). DefenderCS applies the embarked-defender override.
  const defCS = defenderCS(state, defender, targetIndex);
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rng', targetIndex); // B6-S1 + B7-G (B-8)
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the ranged attack executed
  awardDefenseXp(defender); // B-4: +2 to a surviving military defender (civilians excluded)
  // "the target location is always the location, including for
  // ranged units" — a ranged attacker takes no retaliation but wearies all the
  // same, at the multiplier of the tile it FIRED ON, not the one it stands on.
  warWearinessBattle(state, attacker.seat, defender.seat, targetIndex, { dDied: defender.hp <= 0 });
  if (defender.hp <= 0) killUnit(state, defender, seat);
  attacker.movesLeft = 0;
  return ok;
}

/**
 * A hostile RANGED unit strikes — one roll, no retaliation, no
 * advance (rangedAttack's shape from the attacker's seat). A SEAT 0 city
 * takes the hit first even with a garrison (meleeAttack's city precedence)
 * and holds at 1 HP — ranged fire never captures; else the units on the
 * tile (military first; civilians take the roll too, rangedAttack's
 * convention, not the melee roll-free kill). Any other civ's center tile
 * is the same no-op quirk as the melee scan: nothing happens, no MP spent.
 */
export function hostileRangedStrike(state: GameState, attacker: Unit, targetIndex: number): void {
  const seat = attacker.seat;
  const def = UNITS[attacker.type];
  if (!def?.ranged) return;
  const target = state.map.tiles[targetIndex];
  const held = target.district === 'CITY_CENTER' ? cityAtIndex(state, targetIndex) : undefined;
  // The city arm asks `unitsHostile`'s own question, exactly as
  // `meleeAttackInner`'s does: BARBARIANS need no war (`caps.alwaysHostile`),
  // and a barbSeat war row is never set, so gating them on `civsAtWar` alone
  // left the barbarian raider unable to bombard anything.
  const enemyCity =
    held && held.holder.seat !== attacker.seat
    && (capsOf(attacker.seat).alwaysHostile || civsAtWar(state, unitSeat(attacker), held.holder.seat))
      ? held.city
      : undefined;
  if (enemyCity) {
    const defCS = cityDefenseStrength(state, enemyCity);
    enemyCity.hp = Math.max(
      1,
      enemyCity.hp - damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + (CITY_RELIGION_ADDER_LIVE ? religionAttackCS(state, attacker, targetIndex) : 0) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'vrngc', targetIndex), // #70/S2 (B-8)
    );
    warWearinessBattle(state, attacker.seat, enemyCity.seat, targetIndex, { city: true }); // #51/S7.8f
    attacker.movesLeft = 0;
    gainXp(attacker, XP_ATTACK); // B-4: +5 for the bombardment (city not a unit)
    return;
  }
  // A RANGED unit does not engage another civ's units — the ranged-vs-civ
  // scope-out, the same predicate `attackTargets` applies. A civ unit standing
  // on a centre this strike could otherwise reach therefore makes the strike a
  // no-op rather than a hit.
  const enemies = unitsAt(state, targetIndex).filter(
    (u) => unitsHostile(state, attacker, u) && !(isCiv(attacker.seat) && isCiv(u.seat)),
  );
  if (enemies.length === 0) return; // the CITY_CENTER quirk: a no-op, like meleeAttack's `no(...)`
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  // support (no flanking: a ranged strike takes no
  // retaliation). DefenderCS applies the embarked-defender override.
  const defCS = defenderCS(state, defender, targetIndex);
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'vrng', targetIndex); // B6-S1 + B7-G (B-8)
  warWearinessBattle(state, attacker.seat, defender.seat, targetIndex, { dDied: defender.hp <= 0 }); // #51/S7.8f
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the ranged strike executed
  awardDefenseXp(defender); // B-4: +2 to a surviving military defender
  if (defender.hp <= 0) killUnit(state, defender, seat);
  attacker.movesLeft = 0;
}

/** Tiles this unit can attack right now (UI helper). */
export function attackTargets(state: GameState, unit: Unit): number[] {
  const def = UNITS[unit.type];
  if (!def || def.combat <= 0 || unit.movesLeft <= 0) return [];
  if (unit.embarked) return []; // #45/B-6: embarked units cannot attack
  const from = state.map.tiles[unit.tileIndex];
  const range = def.ranged?.range ?? 1;
  const out: number[] = [];
  for (const t of state.map.tiles) {
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < 1 || d > range) continue;
    // A seat's RANGED unit does NOT engage enemy units
    // (ranged-vs-seat scope-out — melee the other seats fight the other seats; own/barb
    // targets unchanged). def.ranged marks a ranged attacker.
    const hasEnemy = unitsAt(state, t.index).some(
      (u) => unitsHostile(state, unit, u) && !(def.ranged && isCiv(unit.seat) && isCiv(u.seat)),
    );
    // A CITY CENTRE is a target when the seat HOLDING it is at war with this
    // unit. One rule, whoever attacks and whoever holds — a unit never targets
    // its own centre, because a seat is never at war with itself.
    //
    // Ranged bombards at its full range; melee must be
    // adjacent. BARBARIANS need no war (`caps.alwaysHostile`) and always melee.
    const holder = cityAtIndex(state, t.index);
    const cityTarget =
      holder !== undefined &&
      holder.holder.seat !== unit.seat &&
      (capsOf(unit.seat).alwaysHostile
        ? d === 1
        : civsAtWar(state, unitSeat(unit), holder.holder.seat) && d <= (def.ranged ? range : 1));

    // A CITY-STATE centre is a target on a DECLARED war, melee and adjacent
    // (ranged-vs-city-state stays out of scope). The autopilot invariant —
    // "target lists never include PEACEFUL city-states" — holds by
    // construction: nothing but a war offers the tile.
    const cityStateHere = state.cityStates.find((c) => c.centerIndex === t.index);
    const cityStateTarget =
      cityStateHere !== undefined &&
      d === 1 &&
      !def.ranged &&
      cityStateAttackable(state, cityStateHere, unitSeat(unit));

    // An adjacent live enemy Encampment is a melee target — the
    // only way to open its tile. Ranged-vs-district stays out of scope.
    const encampTarget = d === 1 && !def.ranged && encampmentBlocks(state, t, unit);
    if (hasEnemy || cityTarget || cityStateTarget || encampTarget) out.push(t.index);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Seat cities: siege and capture
// ---------------------------------------------------------------------------

function attackCity(state: GameState, attacker: Unit, holder: Seat, city: City, seat: number): void {
  cityAssault(state, attacker, city, 'rcty', 'rctyc', seat);
  if (city.hp > 0) return;
  // DAMAGE goes through a garrison, CAPTURE does not. Civ 6 takes a
  // city by MOVING INTO the centre, which a surviving defender forbids — so a
  // city battered to 0 HP with a garrison still standing holds at 0 until the
  // garrison dies.
  if (unitsAt(state, city.centerIndex).some((u) => unitsHostile(state, attacker, u))) return;
  const captor = seatOf(state, attacker.seat);
  if (captor && !isBarbSeat(attacker.seat)) {
    // The conqueror plunders 40 gold, but only on a REAL
    // transfer — the raze at the city cap returns false and pays nothing.
    if (transferCity(state, holder.seat, captor, city, 'conquered')) {
      captor.treasury = (captor.treasury ?? 0) + 40;
    }
  } else {
    // A sack is a gold loss (milli-rounded 20%, cap 100) and the pillage ring,
    // not just the pop hit.
    sackCity(state, city, holder.seat);
    state.eventLog.push(`Barbarians sacked ${city.name} (${holder.name}).`);
  }
}

/** Seat 0 siege of a city-state (attacking it IS the declaration of war). */
function attackCityState(state: GameState, attacker: Unit, cityState: CityState, seat: number): void {
  const atkCS = assaultAtkCS(state, attacker, cityState.centerIndex);
  const defCS = 15 + cityState.population + (cityState.type === 'militaristic' ? 6 : 0);
  cityState.hp = (cityState.hp ?? CITY_STATE_MAX_HP) - damageRoll(state, atkCS - defCS, 'csty', cityState.centerIndex);
  attacker.hp -= damageRoll(state, defCS - atkCS, 'cstyc', cityState.centerIndex);
  // Warring a city-state wearies you exactly as warring a major
  // does. The minor keeps no accumulator of its own (no amenities, no research
  // to date an era from) — see holdsWeariness.
  warWearinessBattle(state, attacker.seat, seatOfCityState(cityState.id), cityState.centerIndex,
    { aDied: attacker.hp <= 0, city: true });
  attacker.movesLeft = 0;
  gainXp(attacker, XP_ATTACK); // B-4: +5 for the attack executed
  if (attacker.hp <= 0) killUnit(state, attacker, seat);
  if ((cityState.hp ?? 0) <= 0) {
    // A seat conqueror lands the CS as its own city.
    if (isCiv(attacker.seat)) {
      const civSeat = seatOf(state, attacker.seat);
      if (civSeat) captureCityStateFor(state, civSeat, cityState);
    } else {
      captureCityState(state, cityState, attacker.seat);
    }
  }
}

/** Conquest of a city-state: it joins your empire; its envoys die with it. */
export function captureCityState(state: GameState, cityState: CityState, seat: number): void {
  state.cityStates = state.cityStates.filter((c) => c.id !== cityState.id);
  // A route dies with its endpoint, for whichever seat holds it.
  for (const sx of state.seats) {
    sx.tradeRoutes = sx.tradeRoutes?.filter((x) => x.toCs !== cityState.id);
  }
  const center = state.map.tiles[cityState.centerIndex];
  // The slot cap applies here too: a full empire RAZES the city-state instead
  // of annexing it, the capture path's exact rule.
  if (seatOf(state, seat)!.cities.length >= 6) {
    for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
      if (tileSeat(t) === seatOfCityState(cityState.id)) setTileOwner(t, NO_SEAT);
    }
    state.eventLog.push(`${cityState.name} razed — the empire is full.`);
    return;
  }
  const captor = seatOf(state, seat);
  if (!captor) return;
  const id = captor.nextCityId++;
  for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
    if (tileSeat(t) === seatOfCityState(cityState.id)) {
      // keep an existing claim where there is one, else take the tile
      setTileOwner(t, seat, tileSeat(t) === seat ? tileCity(t) : id);
    }
  }
  // A conquered city-state's centre tile gets its CITY_CENTER district, the
  // same as any founding. Every `tile.district` reader depends on it: without
  // it the tile reads as open ground, a citizen may work it and settle scans
  // count it free. Real Civ 6: a conquered city-state IS a city with a centre.
  center.district = 'CITY_CENTER';
  setTileOwner(center, seat, id);
  seatOf(state, seat)!.cities.push({
    id,
    seat: seat, // #51/S1.3d: a conquered city-state joins the SEAT 0's seat
    foundedTurn: state.turn,  // #51/S4.1r
    name: cityState.name,
    centerIndex: cityState.centerIndex,
    population: Math.max(1, Math.floor(cityState.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: cityState.centerIndex }],
    wonders: [],
    specialists: {},
    hp: Math.round(CITY_MAX_HP / 2), // a conquered CS joins at half HP (S1.3)
  });
  revealAround(state, seat, cityState.centerIndex, 3);
  addEraScore(state, 0, ERA_SCORE_CONQUER); // B-24: gained a city (CS conquest)
  state.eventLog.push(`${cityState.name} conquered — the city-state joins your empire.`);
}

/** seat conquest of a city-state — the captureCityState twin on the
 * seat seat (join-the-suzerain's-war). Pop ×0.75 floor 1, the ring-2 cityStateId
 * territory re-tags to the new civCity, envoys die with the CS, the
 * MAX_CITIES_PER_SEAT raze rule, routes pruned with the endpoint. */
export function captureCityStateFor(state: GameState, actor: Seat, cityState: CityState): void {
  state.cityStates = state.cityStates.filter((c) => c.id !== cityState.id);
  for (const sx of state.seats) {
    sx.tradeRoutes = sx.tradeRoutes?.filter((x) => x.toCs !== cityState.id);
  }
  const center = state.map.tiles[cityState.centerIndex];
  if (actor.cities.length >= MAX_CITIES_PER_SEAT) {
    for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
      if (tileSeat(t) === seatOfCityState(cityState.id)) setTileOwner(t, NO_SEAT);
    }
    state.eventLog.push(`${cityState.name} razed — ${actor.name} cannot govern more cities.`);
    return;
  }
  const id = actor.nextCityId++;
  for (const t of tilesWithin(state.map, center.col, center.row, 2)) {
    if (tileSeat(t) === seatOfCityState(cityState.id)) {
      setTileOwner(t, actor.seat, id); // A-17: the claim registers to the new civCity
    }
  }
  // Every captor reveals around the taken city (the seat-0 arm's rule).
  revealAround(state, actor.seat, cityState.centerIndex, 3);
  center.district = 'CITY_CENTER'; // #70 HUNT: the captureCityState twin — see the note there
  actor.cities.push({
    id,
    name: cityState.name,
    seat: actor.seat,
    centerIndex: cityState.centerIndex,
    population: Math.max(1, Math.floor(cityState.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    lockedTiles: [],
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: cityState.centerIndex }],
    wonders: [],
    specialists: {},
    hp: Math.round(CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  });
  addEraScore(state, actor.seat, ERA_SCORE_CONQUER); // B-24: gained a city (actor CS conquest)
  state.eventLog.push(`${cityState.name} has been conquered by ${actor.name}!`);
}


// ---------------------------------------------------------------------------
// Barbarians
// ---------------------------------------------------------------------------

function campCandidates(state: GameState, seat: number): Tile[] {
  const preferFog = state.fogOfWar;
  return state.map.tiles.filter((t) => {
    if (isWater(t) || isImpassable(t) || t.wonder || t.district || t.builtWonder) return false;
    if (isCiv(tileSeat(t)) || t.goodyHut) return false;
    if (tileForeignTo(t, seat)) return false;
    if (preferFog && !unexploredByAll(state, t.index)) return false; // camps rise in the fog
    // Camps rise away from EVERY civilization's cities. Whose
    // city it is does not enter the spacing rule.
    for (const c of allCities(state)) {
      const ct = state.map.tiles[c.centerIndex];
      if (hexDistance(ct.col, ct.row, t.col, t.row) < 5) return false;
    }
    for (const campIdx of state.barbSeat.camps) {
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
 * One hostile unit's turn against the seat 0: attack > pillage > advance.
 * Shared by barbarian raiders and at-war units.
 */
export function hostileUnitAct(state: GameState, unit: Unit): void {
  const seat = unit.seat;
  const map = state.map;
  const tile = () => map.tiles[unit.tileIndex];

  // 1. Attack anything hostile in reach (seat 0 or, for barbarians, the other seats too).
  // Ranged units strike (one roll, no retaliation) instead of
  // meleeing — attackTargets already scanned at their full range.
  const targets = attackTargets(state, unit);
  if (targets.length > 0) {
    if (UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, targets[0]);
    else meleeAttack(state, unit.id, targets[0], seat);
    return;
  }

  // 2. Pillage the improvement underfoot. Real Civ 6: only FOOD
  // improvements heal the pillager (+25); the rest are wrecked for yields
  // the raiders here can't bank — pillaged, no heal.
  // BARBARIANS raid foreign improvements too; raiders keep pillaging
  // the seat 0 only (they never war the other seats).
  const here = tile();
  // A seat pillages/raids SEAT 0 tiles only while at war with
  // the seat 0 (barbarians always); a seat-only-war seat leaves the neutral
  // seat 0's improvements alone. Seat-foreign improvements pillage is out of
  // scope (residual) — enemy TILES are never a pillage/march target here.
  // Pillage any CIV's improvement this unit is at war with. Barbarians are
  // hostile to everyone, so they need no war state.
  const hereOwned = isCiv(tileSeat(here))
    && (isBarbSeat(unit.seat) || civsAtWar(state, unitSeat(unit), tileSeat(here)));
  if (here.improvement && !here.pillaged && hereOwned) {
    here.pillaged = true;
    if (PILLAGE_HEAL_IMPROVEMENTS.has(here.improvement)) {
      unit.hp = Math.min(UNIT_HP, unit.hp + 25);
    }
    unit.movesLeft = 0;
    return;
  }
  // Else pillage the district underfoot — a COMPLETE, non-
  // CITY_CENTER, unpillaged enemy district (seat 0 districts for any raider,
  // seat districts for barbarians too). No heal, no loot
  // (v1 — matches yield-type pillages bank nothing).
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

  // 3. March toward the nearest unpillaged improvement OR district (the
  // union), else nearest city.
  let target: Tile | null = null;
  let bestDist = 13;
  for (const t of map.tiles) {
    const tOwned = isCiv(tileSeat(t))
      && (isBarbSeat(unit.seat) || civsAtWar(state, unitSeat(unit), tileSeat(t)));
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
  // An improvement is walked ONTO (pillage reads the tile underfoot);
  // a CITY target stops the march adjacent — enemy centers can't be entered
  // (real Civ 6), and a unit standing on one could never attack it (d>=1).
  const marchOnto = target !== null;
  if (!target) {
    // The nearest city this unit is HOSTILE TO, over every
    // civ seat. Barbarians march on anyone (`caps.alwaysHostile`); everyone
    // else needs a declared war, which also excludes their own cities.
    //
    // Ordering is distance-major, then the LOWEST seat id, then the centre
    // tile index — one total order, so the pick never depends on which seat
    // is asking.
    let best: Tile | null = null;
    let bestKey = Infinity;
    for (const other of state.seats) {
      if (other.seat === unit.seat) continue;
      if (!capsOf(unit.seat).alwaysHostile && !civsAtWar(state, unitSeat(unit), other.seat)) continue;
      for (const oc of other.cities) {
        const t = map.tiles[oc.centerIndex];
        const key = hexDistance(here.col, here.row, t.col, t.row) * (2048 * 8)
          + other.seat * 2048
          + oc.centerIndex;
        if (key < bestKey) {
          bestKey = key;
          best = t;
        }
      }
    }
    target = best;
  }
  if (!target) return;
  // CIV SEAT and BARBARIAN units both walk the march on REAL
  // MP — each step re-picks the passable free neighbor closest to the (fixed)
  // target, moves only if strictly closer, and pays walkPath's exact charge
  // (tile cost + 3 per river crossing; a full-MP unit always affords its first
  // step). Any step spends MP (movesLeft < full blocks the heal).
  // EMBARK: the war-march is the ONLY v1 surface where a scripted mover
  // may take WATER steps. tileFreeForUnit(..., allowEmbark, 0) composes the embark
  // gate (an at-war seat MILITARY unit whose owner has SHIPBUILDING — canEmbark)
  // and the ocean gate (CARTOGRAPHY). Barbarians own no tech, so canEmbark is
  // false for them and the shared walker stays land-only. `embarkState.live` is
  // the N1 master switch (default false → land-only, gates byte-identical); N2
  // flips it true with the embarked-combat + peace-act package.
  const allowEmbark = embarkState.live;
  for (;;) {
    const at = tile();
    const step = neighbors(map, at)
      .filter(
        (n) =>
          tileFreeForUnit(state, n.index, 0, unit, allowEmbark) &&
          // A CLIFF closes the embark/disembark edge for the
          // war-march too — the GPU's _apply_seat_unit_actions war-march scan
          // masks it out of its step candidates, and TS did not, so a seat
          // musketman walked over a cliff onto water in the off-script gate, t198).
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
    // The shared MP contract pays for the step (embark/disembark costs all
    // remaining MP; water steps never pay river) and applies the camp clear.
    // ZOC: a march step ending adjacent to a hostile MILITARY unit halts.
    // Barbarians OBEY ZOC exactly as seat movers
    // do — unitsHostile makes a barb halt at any adjacent non-barb military
    // (seat 0 always, at-war the other seats always — barbs raid the other seats too); other
    // barbs exert nothing. The GPU barb walk mirrors this via
    // _in_enemy_zoc_barb, so both engines stay symmetric. No new draws.
    if (stepUnit(state, unit, step) !== 'moved') return;
  }
}

/**
 * The shared barbarian MELEE era ladder. All three
 * spawn sites in barbarianPhase (new camp, empty-camp regarrison, the 0.1-roll
 * raid) climb it together — WARRIOR → SPEARMAN (t>60) → PIKEMAN (t>120) →
 * MUSKETMAN (t>180). Sized to the model (real Civ 6 scales barbs by era). The
 * CS levy ladder in phase.ts is separate and untouched.
 */
function barbMeleeType(turn: number): string {
  return turn > 180 ? 'MUSKETMAN' : turn > 120 ? 'PIKEMAN' : turn > 60 ? 'SPEARMAN' : 'WARRIOR';
}

/**
 * The RANGED barb ladder — real Civ 6 barbarian camps field
 * archers alongside melee. Every third camp (by its index in `state.barbSeat.camps`,
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
 * The barbarian NAVAL ladder. Real Civ 6 coastal camps put
 * out hulls, not just land raiders. GALLEY, then QUADRIREME past the same era
 * turn the crossbow ladder uses. Spawn TYPE only — draw-count neutral.
 */
function barbNavalType(turn: number): string {
  return turn > 120 ? 'QUADRIREME' : 'GALLEY';
}

/**
 * SCOUT-THEN-RAID. Real Civ 6 camps open with a scout that goes
 * looking for a target, and only then start producing raiders. Mirrored as
 * the spawn TYPE of a BRAND-NEW camp: its first unit is a SCOUT, while the
 * regarrison and raid sites keep the melee/ranged ladders. Draw-count neutral
 * (the camp-spawn roll above is untouched), and the scout rides the existing
 * barb walker — it marches and can attack like any melee barb, it is simply
 * weaker, which is exactly the early-camp pressure Civ 6 models.
 */
export const BARB_SCOUT_OPENER_LIVE = true; // see the spawn site

function barbScoutType(): string {
  return 'SCOUT';
}

/** Camps spawn, garrison, raid. Nothing city-side runs here: a city fires
 *  and heals in its OWNER's seatPhase block, through the one body every
 *  seat shares. */
export function barbarianPhase(state: GameState, seat: number): void {
  const map = state.map;
  // Barbarians get their movement in their own phase (self-contained for
  // tests/RL). Through the SAME contract every other seat uses.
  // Through `unitFullMoves` like every other seat, so a rule that ever gives
  // the hostile class a dedication or an embark pool reaches it too.
  for (const u of state.units) {
    if (!isBarbSeat(u.seat)) continue;
    u.movesLeft = unitFullMoves(state, u) + generalAuraMP(state, u);
    u.movesFull = u.movesLeft;
  }
  const maxCamps = Math.max(1, Math.floor(map.tiles.filter((t) => !isWater(t)).length / 120));

  // New camp? ANY live civilization sustains the barb world —
  // the other seats count, not just the seat 0 (the roll-gate short-circuit is part
  // of the draw-count contract; both engines change together).
  const anyCivCity = state.seats.some((sx) => sx.cities.length > 0);
  if (anyCivCity && state.barbSeat.camps.length < maxCamps && nextRandom(state) < 0.08) {
    const candidates = campCandidates(state, seat);
    if (candidates.length > 0) {
      const spot = candidates[Math.floor(nextRandom(state) * candidates.length)];
      state.barbSeat.camps.push(spot.index);
      // The SCOUT opener is INERT behind BARB_SCOUT_OPENER_LIVE. Everything it
      // needs is in — barbScoutType, the barb u_type column, the type-aware
      // barb march — but flipping it splits the two engines' barb counts late
      // in a game, a death/gate difference that needs its own diagnosis.
      // Flipping it means dropping the guard, nothing else.
      spawnUnit(state, BARB_SCOUT_OPENER_LIVE ? barbScoutType() : barbMeleeType(state.turn), spot.index, BARB_SEAT);
    }
  }

  // Garrisons + raiders.
  const barbs = barbUnits(state);
  // Indexed loop (identical iteration ORDER, so no draw-order change)
  // because the ranged ladder keys off the camp's INDEX, not its tile.
  for (let campNo = 0; campNo < state.barbSeat.camps.length; campNo++) {
    const campIdx = state.barbSeat.camps[campNo];
    const camp = map.tiles[campIdx];
    const nearCamp = barbs.filter(
      (u) =>
        hexDistance(map.tiles[u.tileIndex].col, map.tiles[u.tileIndex].row, camp.col, camp.row) <= 1,
    );
    if (nearCamp.length === 0) {
      spawnUnit(state, barbMeleeType(state.turn), campIdx, BARB_SEAT); // B-26 era ladder
    } else if (
      barbUnits(state).length < state.barbSeat.camps.length * MAX_BARB_PER_CAMP &&
      nextRandom(state) < 0.1
    ) {
      // Every third camp raids RANGED, the rest melee.
      // NAVAL barbarians — every FOURTH camp (a different
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
  for (const campIdx of state.barbSeat.camps) {
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

  // A city's WALLS strike, its Encampment strike and its unbesieged heal used
  // to run HERE for the seat passed in, while every OTHER seat's ran per city
  // inside its own seatPhase block — so seat 0's cities fired and healed
  // twice a turn and every other seat's once. Both engines now run one body,
  // at the per-city seatPhase position, for every seat. Nothing city-side
  // belongs in the barbarian phase.
}
