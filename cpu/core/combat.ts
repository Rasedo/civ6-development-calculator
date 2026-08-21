
import type { City, CityState, GameState, ImprovementId, Seat, Tile, Unit } from './types';
import { neighbors, hexDistance, tilesWithin } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { civEraIndex } from './city';
import { logUnitOrder } from './seatTurn';
import { MODERN_ERA_INDEX } from '../data/techs';
import { emergencyAttackCS, raiseEmergency, EMERGENCY_CITY_STATE } from './emergency';
import { envoysOf, hasMet } from './cityStates';
import { UNITS, UNIT_HP, CITY_MAX_HP, ENCAMPMENT_HP, WALLS_TIER_CS, WALL_DAMAGE_MELEE, WALL_DAMAGE_RANGED, WALL_BREACH_FRACTION, RANGED_CITY_PENALTY } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { CITY_STATE_MAX_HP, KABUL_XP_MULT, PRESLAV_HILL_CS } from '../data/cityStates';
import { cityStateAt, isSuzerain, suzerainEffect } from './cityStates';
import { MAX_CITIES_PER_SEAT, ERA_SCORE_CONQUER } from '../data/seats';
import { addEraScore } from './eras';
import { nextRandom, unitsAt, unitDomain, tileFreeForUnit, spawnUnit, disbandUnit, unitsHostile, fortifyBonus, cityAtIndex, encampmentBlocks, crossesRiver, cliffBlocksStep, stepUnit } from './units';
import { outerPool, wallsMax, wallsTier } from './rules';
import { EMBARKED_DEFENSE_CS, embarkState } from '../data/constants';
import { BUILT_WONDERS } from '../data/builtWonders';
import { ENHANCER_BELIEFS, JUST_WAR_RANGE, CITY_RELIGION_ADDER_LIVE, type BeliefEffects } from '../data/religion';
import { revealAround, unexploredByAll } from './fog';
import { transferCity } from './phase';
import type { RuleResult } from './rules';
import { BARB_SEAT, NO_SEAT, allCities, capsOf, cityAtTile, civsAtWar, isBarbSeat, isCiv, seatOf, seatOfCityState, setTileOwner, tileCity, tileClaimed, tileSeat, unitSeat } from './seats';
import { inGeneralAura, GENERAL_AURA_CS, GENERAL_AURA_RANGE, generalAuraMP } from './aura'; // the shared aura predicate
// The ONE full-MP contract, so the barbarian phase's reset cannot
// drift from every other seat's. units.ts already imports from here, so this
// closes a cycle — both directions are called at RUN time, never at module
// init, which is what makes that safe.
import { unitFullMoves } from './units';
import { warWearinessBattle } from './weariness';
import { navalKillEvent } from './eras';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export const CAMP_CLEAR_REWARD = 50;
export const MAX_BARB_PER_CAMP = 3;

export function clearCampFor(state: GameState, unit: Unit, tileIndex: number, seat: number): void {
  // You do not clear your OWN camps. This was `isBarbSeat(...)` —
  // an identity test standing in for that rule, which only became sayable once
  // the camps belonged to a seat and `seatOf` answered for every seat.
  if (seatOf(state, unit.seat) === state.barbSeat) return;
  const camp = state.barbSeat.camps.indexOf(tileIndex);
  if (camp < 0) return;
  state.barbSeat.camps.splice(camp, 1);
  markAntiquitySite(state, tileIndex, seat); // a razed outpost leaves a dig
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


export function terrainDefense(tile: Tile): number {
  // CIV6 (Alhambra +4, Mont St. Michel +6): "Occupying unit receives +N
  // Defense Strength". The fortification half of that line is a floor on the
  // unit's own dig-in, applied at `refreshUnits`.
  let d = tile.builtWonder && tile.builtWonderComplete
    ? BUILT_WONDERS[tile.builtWonder]?.effects?.occupyDefense ?? 0
    : 0;
  if (tile.elevation === 'HILLS') d += 3;
  if (tile.feature === 'WOODS' || tile.feature === 'RAINFOREST') d += 3;
  // Marsh and floodplains EXPOSE the defender (−2) —
  // they don't shelter like woods/rainforest. Marsh stays SLOW to enter
  // (moveCostInto, deliberately unchanged); only its DEFENSE value flips here.
  if (tile.feature === 'MARSH' || tile.feature === 'FLOODPLAINS') d -= 2;
  if (tile.improvement === 'FORT') d += 4;
  return d;
}

export const RIVER_ATTACK_PENALTY = 5; // melee across a river, attacker CS −5
/**
 * CIV6: "Damage of wounded units is diminished... The formula is
 * `round(10 - HP/10)`... units with 30 HP will lose 7 Combat Strength and units
 * with 1 HP will lose 10". The same penalty applies to RELIGIOUS Strength in
 * theological combat. Cities / city-states / walls are not units and never call
 * this.
 */
export function woundPenalty(unit: { hp: number }): number {
  return Math.round(10 - Math.max(0, unit.hp) / (UNIT_HP / 10));
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

export function unitLevel(unit: { xp?: number }): number {
  const xp = unit.xp ?? 0;
  let level = 0;
  for (const t of XP_LEVELS) if (xp >= t) level++;
  return level;
}

export function xpLevelBonus(unit: { xp?: number }): number {
  return XP_LEVEL_CS * unitLevel(unit);
}

export function encampmentTrainXp(buildings: readonly string[]): number {
  let best = 0;
  for (const b of buildings) {
    const xp = BUILDINGS[b]?.trainXp ?? 0;
    if (xp > best) best = xp;
  }
  return best;
}

/** award XP to a unit — only where the seat's class allows it
 *  (`caps.xp`; false for barbarians, who have no promotions in Civ 6). */
function gainXp(unit: Unit, amount: number): void {
  if (!capsOf(unit.seat).xp) return;
  unit.xp = (unit.xp ?? 0) + amount;
}

/** XP for the unit that INITIATED — CIV 6: a Kabul suzerain's units
 *  "receive double experience from battles they initiate", which is why the
 *  defender's award below is untouched. */
function gainAttackXp(state: GameState, attacker: Unit): void {
  const mult = suzerainEffect(state, unitSeat(attacker), 'xpDouble') ? KABUL_XP_MULT : 1;
  gainXp(attacker, XP_ATTACK * mult);
}

/** a surviving MILITARY defender earns +2 (civilians never fight; barbs
 * never accrue — gainXp guards that). Called after the defender's HP is set.
 * Exported for the city walls strike (cstk, phase.ts). */
export function awardDefenseXp(defender: Unit): void {
  if (defender.hp > 0 && unitDomain(defender.type) === 'military') gainXp(defender, XP_DEFEND);
}

function flankCount(state: GameState, defTileIndex: number, attacker: Unit, defender: Unit): number {
  let n = 0;
  for (const t of neighbors(state.map, state.map.tiles[defTileIndex])) {
    for (const u of unitsAt(state, t.index)) {
      if (u.id === attacker.id) continue;
      if (unitDomain(u.type) !== 'military') continue;
      if (u.embarked) continue; // embarked units flank for nobody
      if (unitsHostile(state, u, defender)) n++;
    }
  }
  return n;
}

export function supportCount(state: GameState, defTileIndex: number, defender: Unit): number {
  let n = 0;
  for (const t of neighbors(state.map, state.map.tiles[defTileIndex])) {
    for (const u of unitsAt(state, t.index)) {
      if (unitDomain(u.type) !== 'military') continue;
      if (u.embarked) continue; // embarked units support nobody
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
// a city or a city strikes a unit (rcty/csty + their counter-rolls, the
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

function unitEnhancer(state: GameState, unit: Unit): BeliefEffects | undefined {
  const rel = seatOf(state, unit.seat)?.religion;
  return rel?.founded && rel.enhancer ? ENHANCER_BELIEFS[rel.enhancer]?.effects : undefined;
}

function unitReligion(state: GameState, unit: Unit): number {
  return seatOf(state, unit.seat)?.religion.founded ? unit.seat : -1;
}

function tileFollowedReligion(state: GameState, tile: Tile): number {
  return cityAtTile(state, tile)?.followedReligion ?? -1;
}

function nearFollowingCity(state: GameState, tile: Tile, g: number): boolean {
  for (const c of allCities(state)) {
    if (c.followedReligion !== g) continue;
    const t = state.map.tiles[c.centerIndex];
    if (hexDistance(tile.col, tile.row, t.col, t.row) <= JUST_WAR_RANGE) return true;
  }
  return false;
}

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
/** CIV 6, Preslav's suzerain: "Your light and heavy cavalry units have +5
 *  Strength when fighting on hill tiles." The tile is the unit's OWN — the
 *  ground it fights from, attacking or defending. */
export function cavalryHillCS(state: GameState, unit: Unit, tileIndex: number): number {
  if (!UNITS[unit.type]?.cavalry) return 0;
  if (state.map.tiles[tileIndex]?.elevation !== 'HILLS') return 0;
  return suzerainEffect(state, unitSeat(unit), 'cavalryHills') ? PRESLAV_HILL_CS : 0;
}

export function defenderCS(state: GameState, defender: Unit, defTileIndex: number): number {
  if (defender.embarked) return EMBARKED_DEFENSE_CS - woundPenalty(defender) + generalAuraCS(state, defender, defTileIndex);
  const tile = state.map.tiles[defTileIndex];
  return (
    (UNITS[defender.type]?.combat ?? 0) +
    terrainDefense(tile) +
    fortifyBonus(defender) -
    woundPenalty(defender) +
    SUPPORT_CS * supportCount(state, defTileIndex, defender) +
    xpLevelBonus(defender) + // veterancy — an embarked defender got the flat override above (no xp)
    religionDefenseCS(state, defender, defTileIndex) + // enhancer adders (unit-vs-unit — every defenderCS caller is one; city strikes assemble inline without them)
    cavalryHillCS(state, defender, defTileIndex) + // Preslav's suzerain
    generalAuraCS(state, defender, defTileIndex) // Great General/Admiral aura
  );
}

export function damageRoll(state: GameState, strengthDiff: number, k = '?', t = -1): number {
  // CIV6: `Damage (HP) = 30 * e^(0.04 * StrengthDifference) *
  // randomBetween(80%, 120%)`, where "randomBetween is a random multiplier
  // between given arguments, including both ends". `30 * exp(0.04 * q / 10)`
  // with q = round(diff·10) is the same curve, pre-quantized to 0.1 so the
  // GPU's exp table — indexed by that q — reproduces this exact JS double;
  // one ulp in `base` can flip the rounded damage.
  // Theological and city combat resolve through here too: the same page says
  // both "work the same way as normal combat".
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

/** The two siege support chassis, as BITS — a target can have both beside it,
 *  and each changes a different half of the split. */
export const ASSIST_RAM = 1;
export const ASSIST_TOWER = 2;

/**
 * How ONE hit on a city center divides between the outer-defense perimeter and
 * the centre behind it. Both shares come out of the SAME roll — a city attack
 * damages the perimeter and the city at once, each with its own reduction, and
 * neither share draws again.
 *
 * CIV6: the perimeter takes -85% from a melee attack and -50% from a ranged
 * one, while a BOMBARD attack and a Battering Ram's melee attacker "do full
 * damage". What reaches the centre opens as the perimeter is breached: 1
 * damage while it is intact, "5-10" around 80%, reduced-but-real above 50%,
 * full below the breach fraction — unless a Siege Tower lets the attacker
 * "bypass Walls and hit the city directly, inflicting damage as if there were
 * no walls protecting it".
 */
export function cityDamageSplit(
  outerHp: number,
  wallsMax: number,
  roll: number,
  klass: 'melee' | 'ranged' | 'bombard',
  assist = 0,
): { wall: number; centre: number } {
  const outer = Math.max(0, outerHp);
  const frac = wallsMax > 0 ? Math.min(1, outer / wallsMax) : 0;
  const full = klass === 'bombard' || (assist & ASSIST_RAM) !== 0;
  const f = full ? 1 : klass === 'melee' ? WALL_DAMAGE_MELEE : WALL_DAMAGE_RANGED;
  const wall = outer > 0 ? Math.min(outer, Math.max(1, Math.round(roll * f))) : 0;
  const through = (assist & ASSIST_TOWER) !== 0
    ? 1
    : Math.min(1, Math.max(0, (1 - frac) / (1 - WALL_BREACH_FRACTION)));
  return { wall, centre: Math.max(1, Math.round(roll * through)) };
}

/**
 * The support a friendly Battering Ram or Siege Tower ADJACENT to the target
 * lends this attacker, as ASSIST_ bits. CIV6: "both support units are
 * effective for melee and anti-cavalry class units only", and Gathering
 * Storm's upgraded walls "gain engineering qualities which negate the effects
 * of support units" — the ram stops at Ancient Walls, the tower at Medieval.
 */
export function siegeAssist(state: GameState, attacker: Unit, targetIndex: number, tier: number): number {
  const d = UNITS[attacker.type];
  if (!d || !(d.melee || d.antiCavalry)) return 0;
  let bits = 0;
  for (const t of neighbors(state.map, state.map.tiles[targetIndex])) {
    for (const u of unitsAt(state, t.index)) {
      if (u.seat !== attacker.seat) continue;
      const s = UNITS[u.type];
      if (!s?.siegeSupport || tier > (s.siegeMaxWalls ?? 0)) continue;
      bits |= s.siegeSupport === 'TOWER' ? ASSIST_TOWER : ASSIST_RAM;
    }
  }
  return bits;
}

/**
 * CIV6 (Movement): a unit whose attack "uses Bombard Strength" may move and
 * shoot in the same turn only if "its maximum Movement is at least 1 greater
 * than normal when it attempts to shoot"; and "if a unit has not moved, it can
 * always shoot regardless of its maximum Movement". Whether it MOVED is
 * `refreshUnits`' own gate — movesLeft against what this unit was GRANTED last
 * refresh, not against its type's base moves, because the general's aura makes
 * the granted pool vary per turn. Its maximum Movement is read fresh at the
 * shot, which is what "when it attempts to shoot" asks for.
 */
export function siegeMayShoot(state: GameState, unit: Unit): boolean {
  const def = UNITS[unit.type];
  if (def?.bombard === undefined) return true;
  if (unit.movesLeft >= (unit.movesFull ?? unitFullMoves(state, unit))) return true;
  return unitFullMoves(state, unit) + generalAuraMP(state, unit) > (def.moves ?? 2);
}

/**
 * The damage class ONE attack brings to a perimeter. A siege unit's attack
 * "uses Bombard Strength" whichever verb ordered it; everything else is the
 * melee/ranged pair the reduction table is keyed on.
 */
export function cityHitClass(unitType: string, ranged: boolean): 'melee' | 'ranged' | 'bombard' {
  if (UNITS[unitType]?.bombard !== undefined) return 'bombard';
  return ranged ? 'ranged' : 'melee';
}

/**
 * The strength a RANGED order brings against a city or district. CIV6: a
 * siege unit fires at its Bombard Strength and pays no city penalty — the -17
 * it carries is "against land units", which its `ranged.strength` already
 * holds.
 */
export function cityRangedStrength(unitType: string, outerHp: number): number {
  const d = UNITS[unitType];
  if (d?.bombard !== undefined) return d.bombard;
  return (d?.ranged?.strength ?? 0) - rangedCityPenalty(unitType, outerHp);
}

/** CIV6: a land ranged attack takes -17 against city and district defenses.
 * Naval ranged pay it against the PERIMETER only, never against a bare city. */
export function rangedCityPenalty(unitType: string, outerHp: number): number {
  if (!UNITS[unitType]?.naval) return RANGED_CITY_PENALTY;
  return outerHp > 0 ? RANGED_CITY_PENALTY : 0;
}

export function cityDefenseStrength(state: GameState, city: City): number {
  const garrison = unitsAt(state, city.centerIndex).find(
    (u) => u.seat === city.seat && unitDomain(u.type) === 'military',
  );
  // CIV6: each pre-modern walls tier is "+3 Combat Strength" and they stack.
  return Math.max(15, seatOf(state, city.seat)?.bestMeleeCS ?? 0)
    + (WALLS_TIER_CS[wallsTier(state, city)] ?? 0)
    + (garrison ? 5 : 0);
}

export function killUnit(state: GameState, unit: Unit, seat: number): void {
  markAntiquitySite(state, unit.tileIndex, seat); // a death leaves a dig
  markShipwreck(state, unit.tileIndex, seat); // ...at sea, a wreck
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
  const era = civEraIndex(seatOf(state, seat)!.research.techs, seatOf(state, seat)!.research.civics);
  if (era >= MODERN_ERA_INDEX) return;
  t.antiquity = true;
  // The dig REMEMBERS when and whose: a themed Archaeological Museum wants
  // one era and three civilizations, so the Artifact has to carry both out
  // of the ground.
  t.antiquityEra = era;
  t.antiquitySeat = seat;
}

/**
 * Stamp a SHIPWRECK. Real Civ 6 puts wrecks on passable water and
 * reveals them with Cultural Heritage; an Archaeologist that works one
 * removes it from the map and excavates an Artifact. This model sources its
 * dig placement from DEATHS rather than map generation (see
 * `markAntiquitySite`), so a hull going down leaves the wreck, under the same
 * pre-Modern era gate and the same one-per-tile rule. `seat` is the ACTING
 * seat, exactly as `markAntiquitySite` takes it: both digs record the seat
 * whose ORDER buried them, which is the only seat every call site on both
 * engines holds.
 */
export function markShipwreck(state: GameState, tileIndex: number, seat: number): void {
  const t = state.map.tiles[tileIndex];
  if (!t || t.shipwreck || !isWater(t)) return;
  const owner = seatOf(state, seat);
  if (!owner) return; // barbarian and city-state hulls leave no wreck to theme
  const era = civEraIndex(owner.research.techs, owner.research.civics);
  if (era >= MODERN_ERA_INDEX) return;
  t.shipwreck = true;
  t.shipwreckEra = era;
  t.shipwreckSeat = seat;
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
 * (a city is not a unit, so no defender xp), the enhancer adder, and the
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
    cavalryHillCS(state, attacker, attacker.tileIndex) + // Preslav's suzerain
    generalAuraCS(state, attacker, attacker.tileIndex)
  );
}

/**
 * One assault exchange against a city center, whoever owns it. Both rolls are
 * drawn in stream order — the city's damage first, the attacker's second —
 * which is what the both seats copies each did; nothing between them
 * touches the RNG, so this is the same stream either way.
 *
 * `cityDamageSplit` divides the city's roll between the perimeter and the
 * centre. No walls → the full roll lands on the centre.
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
  gainAttackXp(state, attacker); // +5 for the attack executed
  const outer = outerPool(state, city);
  const split = cityDamageSplit(outer, wallsMax(state, city), dmgToCity,
    cityHitClass(attacker.type, false),
    siegeAssist(state, attacker, city.centerIndex, wallsTier(state, city)));
  if (split.wall > 0) city.outerHp = outer - split.wall;
  city.hp -= split.centre;
  city.lastHitTurn = state.turn;
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  warWearinessBattle(state, attacker.seat, city.seat, city.centerIndex,
    { aDied: attacker.hp <= 0, city: true });
  if (attacker.hp <= 0) {
    navalKillEvent(state, city.seat, attacker);
    killUnit(state, attacker, seat);
  }
}


/**
 * A melee assault ON an Encampment tile. Real Civ 6: the district
 * fights independently of its city, so the attacker trades rolls with it at the
 * CITY's defense strength. Beating its garrison to 0 opens the tile (the block
 * in `tileFreeForUnit` lifts) and silences its strike — the game's "occupied
 * Encampment". The attacker does NOT advance: entry costs a separate move,
 * exactly like a city assault.
 *
 * CIV6 gives a defensible district "Defenses HP equal to the City Center"
 * and one set of Walls supplies both, so the roll divides exactly as a hit on
 * the centre does: the perimeter share comes off the city's pool and only what
 * gets through reaches the garrison. `cityAtTile` is what hands this path the
 * city behind the district.
 *
 * The attacker's CS comes from the shared `assaultAtkCS`, so the assault kinds
 * cannot drift; only the target pool and the roll keys differ.
 */
function attackEncampment(
  state: GameState,
  attacker: Unit,
  tileIndex: number,
  defCS: number, seat: number): void {
  const tile = state.map.tiles[tileIndex];
  const atkCS = assaultAtkCS(state, attacker, tileIndex);
  const dmgToEncamp = damageRoll(state, atkCS - defCS, 'enc', tileIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, 'encc', tileIndex);
  gainAttackXp(state, attacker);
  const held = cityAtTile(state, tile);
  if (held) {
    const outer = outerPool(state, held);
    const split = cityDamageSplit(outer, wallsMax(state, held), dmgToEncamp,
      cityHitClass(attacker.type, false),
      siegeAssist(state, attacker, tileIndex, wallsTier(state, held)));
    if (split.wall > 0) held.outerHp = outer - split.wall;
    held.lastHitTurn = state.turn;
    tile.encampHp = Math.max(0, (tile.encampHp ?? ENCAMPMENT_HP) - split.centre);
  } else {
    tile.encampHp = Math.max(0, (tile.encampHp ?? ENCAMPMENT_HP) - dmgToEncamp);
  }
  attacker.hp -= dmgToAttacker;
  attacker.movesLeft = 0;
  warWearinessBattle(state, attacker.seat, tileSeat(tile), tileIndex,
    { aDied: attacker.hp <= 0, city: true });
  if (attacker.hp <= 0) killUnit(state, attacker, seat);
}

/**
 * CIV6's siege: "if the invading army manages to establish zone of control on
 * all passable tiles surrounding the City Center, it will no longer be able to
 * repair the damage it suffers". Every passable neighbour has to be held —
 * one raider standing beside a city is not a siege — and it takes a MILITARY
 * unit, because a civilian exerts no zone of control.
 */
export function encircled(state: GameState, centre: Tile, seat: number): boolean {
  let passable = 0;
  for (const n of neighbors(state.map, centre)) {
    if (isImpassable(n)) continue;
    passable += 1;
    const held = unitsAt(state, n.index).some(
      (u) => unitDomain(u.type) === 'military' && unitsHostile(state, u, { seat }),
    );
    if (!held) return false;
  }
  return passable > 0;
}

export function encampmentDefense(
  state: GameState,
  attacker: Unit,
  tile: Tile,
): { defCS: number } | null {
  if (!encampmentBlocks(state, tile, attacker)) return null;
  const owner = seatOf(state, tileSeat(tile));
  if (!owner) return null;
  return { defCS: Math.max(15, owner.bestMeleeCS ?? 0) };
}


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
  // CIV6: a siege unit's only attack is the bombard one — its Combat Strength
  // is what it defends with.
  if (def.bombard !== undefined) return no('Siege units attack at range.');
  if (attacker.movesLeft <= 0) return no('No movement left.');
  if (attacker.embarked) return no('Embarked units cannot attack.');
  const from = state.map.tiles[attacker.tileIndex];
  const target = state.map.tiles[targetIndex];
  if (hexDistance(from.col, from.row, target.col, target.row) !== 1) {
    return no('Target must be adjacent.');
  }

  const enemies = unitsAt(state, targetIndex).filter((u) => unitsHostile(state, attacker, u));
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
    const civCityHere = cityAtIndex(state, targetIndex);
    if (civCityHere && !civsAtWar(state, unitSeat(attacker), civCityHere.holder.seat)) {
      return no(`You are at peace with ${civCityHere.holder.name} — declare war first.`);
    }
    return no('Nothing to attack there.');
  }
  if (encamp && !seatTarget && !cityStateTarget) {
    attackEncampment(state, attacker, targetIndex, encamp.defCS, seat);
    return ok;
  }

  // CITY-FIRST, unconditionally. In Civ 6 a garrisoned unit adds its strength
  // to the CITY's defence; it is not a separate defender standing in front of
  // it (https://forums.civfanatics.com/threads/669378/). And a CIVILIAN on a
  // city tile is not a defender either: it cannot be captured separately at
  // all — a city is taken by bringing its centre to 0 HP with a melee unit,
  // and civilians sheltering inside a city that falls simply vanish.
  //
  // CIV 6: the CITY defends its own tile, so a lone civilian standing on it
  // never draws the blow.
  if (seatTarget) {
    // The refusal mirrors seatTarget's own predicate: an alwaysHostile
    // attacker (barbarians) has no peace to respect, so only a seat that
    // NEEDS a war to target the city can be refused for lacking one.
    if (attacker.seat === seat && !capsOf(attacker.seat).alwaysHostile
        && !civsAtWar(state, seatTarget.holder.seat, seat)) {
      return no(`You are at peace with ${seatTarget.holder.name} — declare war first.`);
    }
    attackCity(state, attacker, seatTarget.holder, seatTarget.city, seat);
    return ok;
  }

  if (cityStateTarget) {
    attackCityState(state, attacker, cityStateTarget, seat);
    return ok;
  }

  const defender =
    enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  const defDef = UNITS[defender.type];
  const atkCS = def.combat - woundPenalty(attacker) - (crossesRiver(from, target) ? RIVER_ATTACK_PENALTY : 0);

  if ((defDef?.combat ?? 0) <= 0) {
    if (isBarbSeat(attacker.seat)) {
      killUnit(state, defender, seat);
    } else {
      defender.seat = attacker.seat; // one field carries the whole ownership change
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
    const atkCSf = atkCS + FLANKING_CS * flankCount(state, targetIndex, attacker, defender) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + cavalryHillCS(state, attacker, attacker.tileIndex) + generalAuraCS(state, attacker, attacker.tileIndex) // aura keyed on the ATTACKER's own tile
      + emergencyAttackCS(state, attacker.seat, defender.seat); // an emergency MEMBER hits its target harder
    const defCSf = defenderCS(state, defender, targetIndex);
    defender.hp -= damageRoll(state, atkCSf - defCSf, 'mel', targetIndex);
    attacker.hp -= damageRoll(state, defCSf - atkCSf, 'melc', targetIndex);
    gainAttackXp(state, attacker); // +5 for the attack executed
    awardDefenseXp(defender); // +2 to a surviving military defender
    warWearinessBattle(state, attacker.seat, defender.seat, targetIndex,
      { aDied: attacker.hp <= 0 && defender.hp > 0, dDied: defender.hp <= 0 });
    if (defender.hp <= 0) {
      navalKillEvent(state, unitSeat(attacker), defender);
      killUnit(state, defender, seat);
      if (attacker.hp <= 0) attacker.hp = 1; // victor survives
    } else if (attacker.hp <= 0) {
      navalKillEvent(state, unitSeat(defender), attacker);
      killUnit(state, attacker, seat);
      attacker.movesLeft = 0;
      return ok;
    }
  }
  attacker.movesLeft = 0;
  if (state.units.includes(attacker) && tileFreeForUnit(state, targetIndex, 0, attacker)) {
    attacker.tileIndex = targetIndex;
    clearCampFor(state, attacker, targetIndex, seat); // every seat clears it
  }
  return ok;
}


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
  if (!siegeMayShoot(state, attacker)) return no('Siege units cannot move and shoot.');
  if (attacker.embarked) return no('Embarked units cannot attack.');
  const from = state.map.tiles[attacker.tileIndex];
  const target = state.map.tiles[targetIndex];
  if (hexDistance(from.col, from.row, target.col, target.row) > def.ranged.range) {
    return no('Out of range.');
  }
  const enemies = unitsAt(state, targetIndex).filter((u) => unitsHostile(state, attacker, u));
  // Ranged units CAN bombard cities — same fallback
  // chain as meleeAttack (seat city, then city-state center), one roll,
  // no retaliation. Ranged fire never captures: the city holds at 1 HP
  // until melee takes it.
  //
  // CITY-FIRST, unconditionally, like meleeAttack: the CITY defends its own
  // tile WHOEVER stands on it — a garrison adds strength and a lone civilian
  // never draws the blow — so the city arms run before any unit resolution.
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
    const outer = outerPool(state, civCity.city);
    const roll = damageRoll(state, (cityRangedStrength(attacker.type, outer) - woundPenalty(attacker) + xpLevelBonus(attacker) + relCity + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rngrc', targetIndex);
    const split = cityDamageSplit(outer, wallsMax(state, civCity.city), roll, cityHitClass(attacker.type, true));
    if (split.wall > 0) civCity.city.outerHp = outer - split.wall;
    civCity.city.hp = Math.max(1, civCity.city.hp - split.centre);
    civCity.city.lastHitTurn = state.turn;
    warWearinessBattle(state, attacker.seat, civCity.city.seat, targetIndex, { city: true });
    attacker.movesLeft = 0;
    gainAttackXp(state, attacker); // +5 for the bombardment (city not a unit — no defender xp)
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
    cityState.hp = Math.max(1, (cityState.hp ?? CITY_STATE_MAX_HP) - damageRoll(state, (cityRangedStrength(attacker.type, 0) - woundPenalty(attacker) + xpLevelBonus(attacker) + relCity + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rngcs', targetIndex));
    warWearinessBattle(state, attacker.seat, seatOfCityState(cityState.id), targetIndex, { city: true });
    attacker.movesLeft = 0;
    gainAttackXp(state, attacker); // +5 for the bombardment
    return ok;
  }
  if (enemies.length === 0) return no('Nothing to attack there.');
  const defender = enemies.find((u) => unitDomain(u.type) === 'military') ?? enemies[0];
  const defCS = defenderCS(state, defender, targetIndex);
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'rng', targetIndex);
  gainAttackXp(state, attacker); // +5 for the ranged attack executed
  awardDefenseXp(defender); // +2 to a surviving military defender (civilians excluded)
  warWearinessBattle(state, attacker.seat, defender.seat, targetIndex, { dDied: defender.hp <= 0 });
  if (defender.hp <= 0) {
    navalKillEvent(state, unitSeat(attacker), defender);
    killUnit(state, defender, seat);
  }
  attacker.movesLeft = 0;
  return ok;
}

export function hostileRangedStrike(state: GameState, attacker: Unit, targetIndex: number): void {
  const seat = attacker.seat;
  const def = UNITS[attacker.type];
  if (!def?.ranged) return;
  if (!siegeMayShoot(state, attacker)) return;
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
    const outer = outerPool(state, enemyCity);
    const roll = damageRoll(state, (cityRangedStrength(attacker.type, outer) - woundPenalty(attacker) + xpLevelBonus(attacker) + (CITY_RELIGION_ADDER_LIVE ? religionAttackCS(state, attacker, targetIndex) : 0) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'vrngc', targetIndex);
    const split = cityDamageSplit(outer, wallsMax(state, enemyCity), roll, cityHitClass(attacker.type, true));
    if (split.wall > 0) enemyCity.outerHp = outer - split.wall;
    enemyCity.hp = Math.max(1, enemyCity.hp - split.centre);
    enemyCity.lastHitTurn = state.turn;
    warWearinessBattle(state, attacker.seat, enemyCity.seat, targetIndex, { city: true });
    attacker.movesLeft = 0;
    gainAttackXp(state, attacker); // +5 for the bombardment (city not a unit)
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
  const defCS = defenderCS(state, defender, targetIndex);
  defender.hp -= damageRoll(state, (def.ranged.strength - woundPenalty(attacker) + xpLevelBonus(attacker) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex)) - defCS, 'vrng', targetIndex);
  warWearinessBattle(state, attacker.seat, defender.seat, targetIndex, { dDied: defender.hp <= 0 });
  gainAttackXp(state, attacker); // +5 for the ranged strike executed
  awardDefenseXp(defender); // +2 to a surviving military defender
  if (defender.hp <= 0) {
    navalKillEvent(state, unitSeat(attacker), defender);
    killUnit(state, defender, seat);
  }
  attacker.movesLeft = 0;
}

export function attackTargets(state: GameState, unit: Unit): number[] {
  const def = UNITS[unit.type];
  if (!def || def.combat <= 0 || unit.movesLeft <= 0) return [];
  if (unit.embarked) return []; // embarked units cannot attack
  if (!siegeMayShoot(state, unit)) return [];
  const from = state.map.tiles[unit.tileIndex];
  const range = def.ranged?.range ?? 1;
  const out: number[] = [];
  for (const t of state.map.tiles) {
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < 1 || d > range) continue;
    const hasEnemy = unitsAt(state, t.index).some(
      (u) => unitsHostile(state, unit, u) && !(def.ranged && isCiv(unit.seat) && isCiv(u.seat)),
    );
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

    const encampTarget = d === 1 && !def.ranged && encampmentBlocks(state, t, unit);
    if (hasEnemy || cityTarget || cityStateTarget || encampTarget) out.push(t.index);
  }
  return out;
}


function attackCity(state: GameState, attacker: Unit, holder: Seat, city: City, seat: number): void {
  cityAssault(state, attacker, city, 'rcty', 'rctyc', seat);
  if (city.hp > 0) return;
  // CIV6: "when a city is captured, all units within it are destroyed" — the
  // garrison falls with the centre it was holding. Array order, and the centre
  // carries a district so no death leaves a dig.
  for (const garrison of unitsAt(state, city.centerIndex).filter((u) => unitSeat(u) !== attacker.seat)) {
    killUnit(state, garrison, seat);
  }
  const captor = seatOf(state, attacker.seat);
  if (captor && !isBarbSeat(attacker.seat)) {
    transferCity(state, holder.seat, captor, city, 'conquered');  // pays the plunder itself
  } else {
    sackCity(state, city, holder.seat);
    state.eventLog.push(`Barbarians sacked ${city.name} (${holder.name}).`);
  }
}

function attackCityState(state: GameState, attacker: Unit, cityState: CityState, seat: number): void {
  const atkCS = assaultAtkCS(state, attacker, cityState.centerIndex);
  const defCS = 15 + cityState.population + (cityState.type === 'militaristic' ? 6 : 0);
  cityState.hp = (cityState.hp ?? CITY_STATE_MAX_HP) - damageRoll(state, atkCS - defCS, 'csty', cityState.centerIndex);
  attacker.hp -= damageRoll(state, defCS - atkCS, 'cstyc', cityState.centerIndex);
  warWearinessBattle(state, attacker.seat, seatOfCityState(cityState.id), cityState.centerIndex,
    { aDied: attacker.hp <= 0, city: true });
  attacker.movesLeft = 0;
  gainAttackXp(state, attacker); // +5 for the attack executed
  if (attacker.hp <= 0) killUnit(state, attacker, seat);
  if ((cityState.hp ?? 0) <= 0) {
    if (isCiv(attacker.seat)) {
      const civSeat = seatOf(state, attacker.seat);
      if (civSeat) captureCityStateFor(state, civSeat, cityState);
    } else {
      captureCityState(state, cityState, attacker.seat);
    }
  }
}

/** CIV6 (Emergency, participation): a civ may take part only if "they know
 *  the reason for the Emergency ... they must have met and sent an Envoy to
 *  the city-state". Taken at the moment of the conquest, because the conquest
 *  deletes the city-state and its envoy ledger with it. */
function csPatrons(state: GameState, cityState: CityState, captor: number): number[] {
  const out: number[] = [];
  for (const sx of state.seats) {
    if (sx.seat === captor) continue;
    if (hasMet(cityState, sx.seat) && envoysOf(cityState, sx.seat) >= 1) out.push(sx.seat);
  }
  return out;
}

export function captureCityState(state: GameState, cityState: CityState, seat: number): void {
  state.cityStates = state.cityStates.filter((c) => c.id !== cityState.id);
  for (const sx of state.seats) {
    sx.tradeRoutes = sx.tradeRoutes?.filter((x) => x.toCs !== cityState.id);
  }
  const center = state.map.tiles[cityState.centerIndex];
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
    seat: seat, // a conquered city-state joins its CONQUEROR's roster
    foundedTurn: state.turn,
    name: cityState.name,
    centerIndex: cityState.centerIndex,
    population: Math.max(1, Math.floor(cityState.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: cityState.centerIndex }],
    wonders: [],
    hp: Math.round(CITY_MAX_HP / 2), // a conquered CS joins at half HP
  });
  revealAround(state, seat, cityState.centerIndex, 3);
  raiseEmergency(state, EMERGENCY_CITY_STATE, seat, id, csPatrons(state, cityState, seat));
  addEraScore(state, seat, ERA_SCORE_CONQUER); // the CONQUEROR gained a city
  state.eventLog.push(`${cityState.name} conquered — the city-state joins your empire.`);
}

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
      setTileOwner(t, actor.seat, id); // the claim registers to the new civCity
    }
  }
  revealAround(state, actor.seat, cityState.centerIndex, 3);
  center.district = 'CITY_CENTER'; // HUNT: the captureCityState twin — see the note there
  actor.cities.push({
    id,
    name: cityState.name,
    seat: actor.seat,
    centerIndex: cityState.centerIndex,
    population: Math.max(1, Math.floor(cityState.population * 0.75)),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: 0,
    focus: 'balanced',
    queue: [],
    isCapital: false,
    buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: cityState.centerIndex }],
    wonders: [],
    hp: Math.round(CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  });
  raiseEmergency(state, EMERGENCY_CITY_STATE, actor.seat, id, csPatrons(state, cityState, actor.seat));
  addEraScore(state, actor.seat, ERA_SCORE_CONQUER); // gained a city (actor CS conquest)
  state.eventLog.push(`${cityState.name} has been conquered by ${actor.name}!`);
}



function campCandidates(state: GameState): Tile[] {
  const preferFog = state.fogOfWar;
  return state.map.tiles.filter((t) => {
    if (isWater(t) || isImpassable(t) || t.wonder || t.district || t.builtWonder) return false;
    if (tileClaimed(t) || t.goodyHut) return false;
    if (preferFog && !unexploredByAll(state, t.index)) return false; // camps rise in the fog
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

export function hostileUnitAct(state: GameState, unit: Unit): void {
  const seat = unit.seat;
  const map = state.map;
  const tile = () => map.tiles[unit.tileIndex];

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
      !t.districtPillaged;
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
 * The RANGED barb ladder. CIV 6: "regardless of position every
 * outpost will spawn melee and ranged units", so RANGED is not a camp class —
 * every camp takes its turn at it in `barbarianPhase`'s raid rotation. ARCHER, then
 * CROSSBOWMAN past the era turn. TS needed no dispatch work — `hostileUnitAct`
 * already routes any `UNITS[type].ranged` attacker through
 * `hostileRangedStrike`; the GPU raider block has its own ranged path.
 */
function barbRangedType(turn: number): string {
  return turn > 120 ? 'CROSSBOWMAN' : 'ARCHER';
}

/**
 * The barbarian NAVAL ladder — what a PIRATE camp (one with a
 * reachable coast) puts out. GALLEY, then QUADRIREME past the same era turn the
 * crossbow ladder uses.
 */
function barbNavalType(turn: number): string {
  return turn > 120 ? 'QUADRIREME' : 'GALLEY';
}

/**
 * The barbarian CAVALRY ladder — what a HORSE camp fields.
 * CIV 6: "cavalry outposts spawn when they have a horse resource within 6
 * tiles ... and will employ mounted units in their assaults". HORSEMAN, then
 * KNIGHT past the same era turn.
 */
function barbCavalryType(turn: number): string {
  return turn > 120 ? 'KNIGHT' : 'HORSEMAN';
}

export const BARB_HORSE_RANGE = 6;

/** CIV 6: a camp is a HORSE camp when a Horses resource sits within 6 tiles. */
function campNearHorses(state: GameState, campIdx: number): boolean {
  const camp = state.map.tiles[campIdx];
  return tilesWithin(state.map, camp.col, camp.row, BARB_HORSE_RANGE)
    .some((t) => t.resource === 'HORSES');
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

export function barbarianPhase(state: GameState): void {
  const map = state.map;
  for (const u of state.units) {
    if (!isBarbSeat(u.seat)) continue;
    u.movesLeft = unitFullMoves(state, u) + generalAuraMP(state, u);
    u.movesFull = u.movesLeft;
  }
  const maxCamps = Math.max(1, Math.floor(map.tiles.filter((t) => !isWater(t)).length / 120));

  const anyCivCity = state.seats.some((sx) => sx.cities.length > 0);
  if (anyCivCity && state.barbSeat.camps.length < maxCamps && nextRandom(state) < 0.08) {
    const candidates = campCandidates(state);
    if (candidates.length > 0) {
      const spot = candidates[Math.floor(nextRandom(state) * candidates.length)];
      state.barbSeat.camps.push(spot.index);
      spawnUnit(state, BARB_SCOUT_OPENER_LIVE ? barbScoutType() : barbMeleeType(state.turn), spot.index, BARB_SEAT);
    }
  }

  const barbs = barbUnits(state);
  // Indexed loop (identical iteration ORDER, so no draw-order change)
  // because the raid ROTATION keys off the camp's index as well as the turn.
  for (let campNo = 0; campNo < state.barbSeat.camps.length; campNo++) {
    const campIdx = state.barbSeat.camps[campNo];
    const camp = map.tiles[campIdx];
    const nearCamp = barbs.filter(
      (u) =>
        hexDistance(map.tiles[u.tileIndex].col, map.tiles[u.tileIndex].row, camp.col, camp.row) <= 1,
    );
    const horseCamp = campNearHorses(state, campIdx);
    if (nearCamp.length === 0) {
      // REGARRISON on the camp's own land ladder — a hull cannot hold a camp.
      spawnUnit(state, horseCamp ? barbCavalryType(state.turn) : barbMeleeType(state.turn), campIdx, BARB_SEAT);
    } else if (
      barbUnits(state).length < state.barbSeat.camps.length * MAX_BARB_PER_CAMP &&
      nextRandom(state) < 0.1
    ) {
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
      // A camp's raid ROTATES: its CLASS unit, then ranged, then melee. CIV 6
      // classes a camp by where it stands — a reachable coast makes it a
      // pirate camp, Horses within 6 a cavalry outpost, everything else a land
      // camp — and every camp fields melee and ranged whatever its class. The
      // rotation is the turn plus the camp's index, so it costs no draw and
      // neighbouring camps do not move in lockstep.
      const slot = (campNo + state.turn) % 3;
      if (slot === 1) {
        spawnUnit(state, barbRangedType(state.turn), campIdx, BARB_SEAT);
      } else if (slot === 2) {
        spawnUnit(state, barbMeleeType(state.turn), campIdx, BARB_SEAT);
      } else if (water) {
        spawnUnit(state, barbNavalType(state.turn), water.index, BARB_SEAT);
      } else {
        spawnUnit(state, horseCamp ? barbCavalryType(state.turn) : barbMeleeType(state.turn), campIdx, BARB_SEAT);
      }
    }
  }

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

}
