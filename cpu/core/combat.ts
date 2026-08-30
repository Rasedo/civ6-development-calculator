
import type { City, CityState, GameState, ImprovementId, Seat, Tile, Unit } from './types';
import { neighbors, hexDistance, tilesWithin } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { civEraIndex, seatBuildingSum } from './city';
import { logUnitOrder } from './seatTurn';
import { MODERN_ERA_INDEX } from '../data/techs';
import { emergencyAttackCS, raiseEmergency, EMERGENCY_CITY_STATE } from './emergency';
import { envoysOf, hasMet } from './cityStates';
import { UNITS, UNIT_HP, CITY_MAX_HP, ENCAMPMENT_HP, WALLS_TIER_CS, WALL_DAMAGE_MELEE, WALL_DAMAGE_RANGED, WALL_BREACH_FRACTION, RANGED_CITY_PENALTY } from '../data/units';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { pillagePlunder } from './economy';
import { BUILDINGS } from '../data/buildings';
import { governorSum, governorTileSum } from './governors';
import { CITY_STATE_MAX_HP, KABUL_XP_MULT, PRESLAV_HILL_CS } from '../data/cityStates';
import { cityStateAt, isSuzerain, suzerainEffect } from './cityStates';
import { MAX_CITIES_PER_SEAT, ERA_SCORE_CONQUER, DED_SKY, SKY_AIR_XP_PCT } from '../data/seats';
import { grievanceCityStateTaken } from './grievance';
import { addEraScore, goldenDedication, worldEraIndex } from './eras';
import { formationCS, escortRiders, nextRandom, unitsAt, unitDomain, tileFreeForUnit, spawnUnit, disbandUnit, unitsHostile, fortifyBonus, reseatUnit, cityAtIndex, encampmentBlocks, encampmentIntact, crossesRiver, cliffBlocks, cliffBlocksStep, stepUnit, unitVisibleTo, unitExertsZoc } from './units';
import { isAirUnit, airCoverAgainst, airStrikeReaches, airStrikeOffers, airDefenseOf, displaceAirFrom } from './air';
import { outerPool, wallsMax, wallsTier, encampOuterPool } from './rules';
import { EMBARKED_DEFENSE_CS_BY_ERA, embarkState } from '../data/constants';
import { BUILT_WONDERS } from '../data/builtWonders';
import { ENHANCER_BELIEFS, JUST_WAR_RANGE, CITY_RELIGION_ADDER_LIVE, INQUISITOR_HOME_STRENGTH, type BeliefEffects } from '../data/religion';
import { revealAround, unexploredByAll } from './fog';
import {
  XP_BARB_VETERAN, XP_CITY_ATTACK, XP_CITY_DEFEND, XP_CITY_FELLED,
  attacksLeftOf, attacksPerTurn,
  bankXp, battleXp, cityXp, holdTheLineCS, promoCS, promoFlag,
  promoStackMult, promoValue, unitLevel, unitXpPct, type PromoCtx,
} from './promotions';
import { eraMatchupCS, getModifiers, governmentUnitCS, governmentXpPct } from './effects';
import { congressPromoClassCs, congressReligiousCs } from './congress';
import { KILL_SPREAD_RANGE, UNIT_PROMO_CLASS } from '../data/promotions';
import { transferCity } from './phase';
import type { RuleResult } from './rules';
import { BARB_SEAT, NO_SEAT, allCities, capsOf, cityAtTile, civsAtWar, isBarbSeat, isCiv, isTerritorial, seatOf, seatOfCityState, setTileOwner, tileCity, tileClaimed, tileSeat, unitSeat } from './seats';
import { inGeneralAura, GENERAL_AURA_CS, GENERAL_AURA_RANGE, generalAuraMP } from './aura'; // the shared aura predicate
// The ONE full-MP contract, so the barbarian phase's reset cannot
// drift from every other seat's. units.ts already imports from here, so this
// closes a cycle — both directions are called at RUN time, never at module
// init, which is what makes that safe.
import { unitFullMoves } from './units';
import { warWearinessBattle } from './weariness';
import { unitKillEvent } from './eras';

import { gpPermOf } from '../data/greatPeople';
const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

export const CAMP_CLEAR_REWARD = 50;
export const MAX_BARB_PER_CAMP = 3;

export function clearCampFor(state: GameState, unit: Unit, tileIndex: number): void {
  // You do not clear your OWN camps. This was `isBarbSeat(...)` —
  // an identity test standing in for that rule, which only became sayable once
  // the camps belonged to a seat and `seatOf` answered for every seat.
  if (seatOf(state, unit.seat) === state.barbSeat) return;
  const camp = state.barbSeat.camps.indexOf(tileIndex);
  if (camp < 0) return;
  state.barbSeat.camps.splice(camp, 1);
  // the outpost was the BARBARIANS' — theirs is the civilization buried here
  markAntiquitySite(state, tileIndex, BARB_SEAT);
  const clearer = seatOf(state, unit.seat);
  if (clearer) clearer.treasury += CAMP_CLEAR_REWARD;
}


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
  // CIV6 (R&F): "Reefs provide a +3 Defensive CS bonus for units in the
  // water" — a NAVAL defender's terrain, since an embarked one defends at the
  // normalized CS that carries no terrain at all.
  if (tile.feature === 'REEF') d += 3;
  if (tile.improvement === 'FORT') d += FORT_DEFENSE_CS;
  return d;
}

export const FORT_DEFENSE_CS = 4; // the FORT improvement, physical and theological alike
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

// XP & levels. The LADDER and the AWARD formula live in core/promotions.ts;
// this file holds the sites that pay them. CIV6 gives no Combat Strength for
// a level — the CHOSEN PROMOTION is the bonus, so `promoCS` is what the CS
// assemblies below add.

/** CIV6: "+25% combat experience for all <classes> units trained in this
 *  city", summed over the training city's Encampment and Harbor lines and
 *  carried by the unit for life. */
export function trainXpPct(buildings: readonly string[], cls: string | undefined): number {
  if (!cls) return 0;
  let pct = 0;
  for (const b of buildings) {
    const def = BUILDINGS[b];
    if (def?.trainXpPct && def.trainXpClasses?.includes(cls as never)) pct += def.trainXpPct;
  }
  return pct;
}

/** the whole-number XP multiplier a unit carries into one award: Survey's
 *  doubled recon XP, and Kabul's "double experience from battles they
 *  initiate" — which is why only the initiator asks for it. */
function xpMult(state: GameState, unit: Unit, initiated: boolean): number {
  const recon = UNITS[unit.type]?.recon ? getModifiers(state, unitSeat(unit)).reconXpMult : 1;
  const kabul = initiated && suzerainEffect(state, unitSeat(unit), 'xpDouble') ? KABUL_XP_MULT : 1;
  return recon * kabul;
}

/** may this unit bank XP at all? Barbarians have no promotions in Civ 6
 *  (`caps.xp`), and civilians never fight. CIV6 (Experience): "every time a
 *  unit enters and survives combat ... it will gain XP", and the Aerodrome's
 *  own XP buildings say plainly that an aircraft is such a unit. A Spy earns
 *  its levels through its missions, not through a roll. */
function xpEligible(unit: Unit): boolean {
  const d = unitDomain(unit.type);
  return capsOf(unit.seat).xp && (d === 'military' || d === 'air');
}

/** every percentage XP modifier a unit answers to: the training city's own,
 *  carried for life, the government's, and CIV6 (Sky and Stars, Golden face):
 *  "+100% XP earned for all Air Units". */
function seatXpPct(state: GameState, unit: Unit): number {
  const sky = isAirUnit(unit.type) && goldenDedication(state, unit.seat, DED_SKY)
    ? SKY_AIR_XP_PCT : 0;
  return unitXpPct(unit) + governmentXpPct(state, unit.seat) + sky;
}

/** the strength a chassis brings to the XP ratio: its Ranged Strength when it
 *  is the one shooting, its Combat Strength otherwise. */
function xpStrength(unitType: string, shooting: boolean): number {
  const def = UNITS[unitType];
  return (shooting ? def?.ranged?.strength : def?.combat) ?? def?.combat ?? 0;
}

/** ONE battle between units pays BOTH sides. CIV6 divides "the Combat
 *  Strength of the enemy by the Combat Strength of that unit", doubles it for
 *  a kill, adds the battle-kind and initiator terms, and caps the result at 8.
 *  A veteran fighting BARBARIANS is the one exception: past level 1 "every
 *  battle against Barbarians and Free City units only grants 1 XP". */
export function awardBattleXp(
  state: GameState, attacker: Unit, defender: Unit,
  o: { ranged: boolean; aDied: boolean; dDied: boolean },
): void {
  const aCS = xpStrength(attacker.type, o.ranged);
  const dCS = xpStrength(defender.type, false);
  for (const [self, foe, initiated, ownCS, foeCS, foeDied] of [
    [attacker, defender, true, aCS, dCS, o.dDied] as const,
    [defender, attacker, false, dCS, aCS, o.aDied] as const,
  ]) {
    if (self.hp <= 0 || !xpEligible(self)) continue;
    const versusBarb = isBarbSeat(foe.seat);
    const gain = versusBarb && unitLevel(self) >= 2
      ? XP_BARB_VETERAN
      : battleXp(ownCS, foeCS, {
        foeDied, ranged: o.ranged, initiated,
        pct: seatXpPct(state, self), mult: xpMult(state, self, initiated),
      });
    bankXp(self, gain);
  }
}

/** a CITY roll pays a flat base — 3 for the attack, 2 for surviving one, 10
 *  for the blow that empties the pool — with the same percentage modifiers
 *  and no cap. */
export function awardCityXp(state: GameState, unit: Unit, base: number): void {
  if (unit.hp <= 0 || !xpEligible(unit)) return;
  bankXp(unit, cityXp(base, seatXpPct(state, unit), xpMult(state, unit, true)));
}

/** the defender of a CITY strike: "Base XP gained from defending against city
 *  attacks is 2". Exported for the walls strike in phase.ts. */
export function awardDefenseXp(state: GameState, defender: Unit): void {
  if (defender.hp <= 0 || !xpEligible(defender)) return;
  bankXp(defender, cityXp(XP_CITY_DEFEND, seatXpPct(state, defender), xpMult(state, defender, false)));
}

/**
 * CIV6 (Combat, "Unit class modifiers"): "Melee units receive a +5 CS bonus
 * against anti-cavalry units. Anti-cavalry units receive a +10 CS bonus
 * against light cavalry, heavy cavalry, or ranged cavalry units." The modifier
 * belongs to whichever unit holds the class, attacking or defending, so both
 * sides of a roll ask it about the other.
 */
export const CLASS_MELEE_VS_ANTICAV = 5;
export const CLASS_ANTICAV_VS_CAV = 10;

/**
 * CIV6 (Combat, "Terrain"): "Amphibious attack is a negative modifier that
 * applies to any attack made by an embarked unit against a unit or district on
 * land that is unobstructed by Cliffs. This is the most complicated type of
 * attack and carries a -10 CS penalty." A CLIFF does not soften the attack, it
 * forbids it: "melee units have to physically be able to move into the attacked
 * tile", and a cliff closes that shore. The Amphibious promotion that waives
 * the penalty is C-3's.
 */
export const AMPHIBIOUS_ATTACK_CS = 10;

/** May this unit, standing where it stands, strike that tile at all? CIV6:
 *  "embarked units may not attack any other unit in the water, including other
 *  embarked units", and only a MELEE attack goes ashore. */
export function amphibiousReach(state: GameState, unit: Unit, targetIndex: number): boolean {
  if (!unit.embarked) return true;
  const target = state.map.tiles[targetIndex];
  if (isWater(target)) return false;
  return !cliffBlocks(state, state.map.tiles[unit.tileIndex], target, unit);
}

export function classMatchupCS(ownType: string, foeType: string): number {
  const me = UNITS[ownType];
  const foe = UNITS[foeType];
  if (!me || !foe) return 0;
  if (me.melee && foe.antiCavalry) return CLASS_MELEE_VS_ANTICAV;
  if (me.antiCavalry && foe.cavalry) return CLASS_ANTICAV_VS_CAV;
  return 0;
}

/**
 * CIV6 (Flanking and Support): both bonuses "are unavailable at the start of
 * the game, and are unlocked only after researching Military Tradition", and
 * "Barbarians can gain Flanking and Support once at least half of the major
 * civilizations have researched Military Tradition". Every seat that is not a
 * major reads that same count — a barbarian has a Seat record but never
 * researches, so asking its own civics would keep it disarmed forever.
 */
export const FLANK_SUPPORT_CIVIC = 'MILITARY_TRADITION';

export function flankSupportLive(state: GameState, seat: number): boolean {
  if (isCiv(seat)) return seatOf(state, seat)?.research.civics.includes(FLANK_SUPPORT_CIVIC) ?? false;
  const have = state.seats.filter((x) => x.research.civics.includes(FLANK_SUPPORT_CIVIC)).length;
  return have * 2 >= state.seats.length;
}

/**
 * CIV6 (Flanking): "The attacker will gain 2 Combat Strength for each friendly
 * unit adjacent to the target of the attack" — friendly meaning "units that
 * are currently owned by the same player", never an ally's and never a third
 * party's. "The attacker itself does not count." "Embarked land units do not
 * provide Flanking." "Units across a River from the targeted enemy do not
 * provide Flanking."
 */
export function flankCount(state: GameState, defTileIndex: number, attacker: Unit): number {
  if (!flankSupportLive(state, attacker.seat)) return 0;
  const dt = state.map.tiles[defTileIndex];
  let n = 0;
  for (const t of neighbors(state.map, dt)) {
    if (crossesRiver(dt, t)) continue;
    for (const u of unitsAt(state, t.index)) {
      if (u.id === attacker.id) continue;
      if (unitDomain(u.type) !== 'military') continue;
      if (u.embarked) continue;
      if (u.seat === attacker.seat) n++;
    }
  }
  return n;
}

/**
 * CIV6 (Support): "The defender will gain 2 Combat Strength for each adjacent
 * friendly unit", same ownership only. "Embarked land units provide Support
 * like normal" — the one place they differ from flanking. "Units will not gain
 * Support when inside defensible Districts (City Center, Encampment)", though
 * units inside one still provide it. Support is a MELEE-only term, and the
 * callers hold that gate: a ranged attacker never asks for it.
 */
export function supportCount(state: GameState, defTileIndex: number, defender: Unit): number {
  if (!flankSupportLive(state, defender.seat)) return 0;
  const dt = state.map.tiles[defTileIndex];
  if (dt.district === 'CITY_CENTER' || encampmentIntact(dt)) return 0;
  let n = 0;
  for (const t of neighbors(state.map, dt)) {
    for (const u of unitsAt(state, t.index)) {
      if (unitDomain(u.type) !== 'military') continue;
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

export const THEO_HOLY_GROUND_STRENGTH = 5;
export const THEO_HOLY_CITY_STRENGTH = 15;

/**
 * A theological duel is flanked and supported by the RELIGIOUS layer, not the
 * military one. CIV6 puts flanking and support in theological combat and
 * explains them with religious swarms — "if you use swarms of units in battle
 * and manage to move them into position, you will gain a significant
 * advantage... This forces players to plan battles with multiple religious
 * units just as they would do a real physical battle" — while the Flanking and
 * Support page's own provider rule is "all non-air MILITARY units". Religious
 * units "move in their own layer", so each layer flanks itself.
 *
 * Everything else is `flankCount`/`supportCount`'s rule unchanged: same owner
 * only, the attacker never counts itself, and flanking does not reach across a
 * river.
 */
export function theoFlankCount(state: GameState, defTileIndex: number, attacker: Unit): number {
  if (!flankSupportLive(state, attacker.seat)) return 0;
  const dt = state.map.tiles[defTileIndex];
  let n = 0;
  for (const t of neighbors(state.map, dt)) {
    if (crossesRiver(dt, t)) continue;
    for (const u of unitsAt(state, t.index)) {
      if (u.id === attacker.id) continue;
      if ((UNITS[u.type]?.religiousStrength ?? 0) <= 0) continue;
      if (u.seat === attacker.seat) n++;
    }
  }
  return n;
}

export function theoSupportCount(state: GameState, defTileIndex: number, defender: Unit): number {
  if (!flankSupportLive(state, defender.seat)) return 0;
  const dt = state.map.tiles[defTileIndex];
  if (dt.district === 'CITY_CENTER' || encampmentIntact(dt)) return 0;
  let n = 0;
  for (const t of neighbors(state.map, dt)) {
    for (const u of unitsAt(state, t.index)) {
      if ((UNITS[u.type]?.religiousStrength ?? 0) <= 0) continue;
      if (u.seat === defender.seat) n++;
    }
  }
  return n;
}

/** the Religious Strength one unit brings to a duel: its chassis stat, the
 *  wound penalty, DEBATER's "+20 Religious Strength in Theological Combat",
 *  and the Inquisitor's "+35 Religious Strength when in friendly territory". */
export function theoStrength(state: GameState, unit: Unit): number {
  const here = state.map.tiles[unit.tileIndex];
  // CIV6 (Inquisition): "All religious units are +15 Religious Combat
  // Strength in friendly territory."
  const card = here && tileSeat(here) === unitSeat(unit)
    ? getModifiers(state, unitSeat(unit)).religiousCsHome : 0;
  const base = (UNITS[unit.type]?.religiousStrength ?? 0) - woundPenalty(unit)
    + promoValue(unit, 'RELIG_CS') + congressReligiousCs(state, unitSeat(unit)) + card;
  // CIV6 (Grand Inquisitor): "+10 Religious Strength in theological combat in
  // tiles of this city."
  // CIV6 (Theocracy): "+5 Religious Strength in Theological Combat" — the
  // seat's own, wherever its unit fights, beside the governor's local one.
  const gov = (here ? governorTileSum(state, here, (e) => e.theologyCS) : 0)
    + getModifiers(state, unitSeat(unit)).theologyCS;
  return unit.type === 'INQUISITOR' && here && tileSeat(here) === unitSeat(unit)
    ? base + gov + INQUISITOR_HOME_STRENGTH
    : base + gov;
}

/**
 * CIV6 (Theological combat): the LOCATION bonuses, "which are effective only
 * when the unit is defending" — "being in the territory of a city following
 * this religion confers a Holy Ground bonus of +5", "being in the territory of
 * the Holy City of this religion confers a bonus of +15", and "being on a tile
 * with a Fort, Alcazar, or other defensive tile improvement".
 *
 * PHYSICAL terrain does not count: "the terrain bonuses that apply have nothing
 * to do with the physical qualities of the tile where the battle is fought —
 * instead, they are related to whose territory this tile belongs to", and "it
 * won't matter if the defending unit stays on a Hill or on the opposite bank of
 * a River". The Fort is an IMPROVEMENT, which is why it survives that.
 */
export function theoDefenseStrength(state: GameState, defender: Unit, tile: Tile): number {
  let bonus = tile.improvement === 'FORT' ? FORT_DEFENSE_CS : 0;
  const g = unitReligion(state, defender);
  const holder = cityAtTile(state, tile);
  if (g < 0 || !holder) return bonus;
  if (holder.followedReligion === g) bonus += THEO_HOLY_GROUND_STRENGTH;
  const holy = seatOf(state, g)?.religion.holyTile;
  if (holy != null && holy >= 0
      && cityAtTile(state, state.map.tiles[holy])?.centerIndex === holder.centerIndex) {
    bonus += THEO_HOLY_CITY_STRENGTH;
  }
  return bonus;
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

/** CIV 6, Preslav's suzerain: "Your light and heavy cavalry units have +5
 *  Strength when fighting on hill tiles." The tile is the unit's OWN — the
 *  ground it fights from, attacking or defending. */
export function cavalryHillCS(state: GameState, unit: Unit, tileIndex: number): number {
  if (!UNITS[unit.type]?.cavalry) return 0;
  if (state.map.tiles[tileIndex]?.elevation !== 'HILLS') return 0;
  return suzerainEffect(state, unitSeat(unit), 'cavalryHills') ? PRESLAV_HILL_CS : 0;
}

/** The Combat Strength an embarked unit of this seat defends at — the owner's
 *  technological era, which `civEraIndex` already measures the way the page
 *  does ("the first technology or civic of that era"). */
export function embarkedDefenseCS(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  const era = s ? civEraIndex(s.research.techs, s.research.civics) : 0;
  return EMBARKED_DEFENSE_CS_BY_ERA[Math.min(era, EMBARKED_DEFENSE_CS_BY_ERA.length - 1)];
}

/** does a unit stand on a district or a Fort? The question three promotions
 *  ask about themselves and two more ask about the other side. */
export function inDistrictTile(state: GameState, tileIndex: number): boolean {
  const t = state.map.tiles[tileIndex];
  return !!t && (!!t.district || t.improvement === 'FORT');
}

/**
 * Who takes the blow on a STACKED hex. CIV6 (Combat): "When a naval unit and an
 * embarked unit occupy the same hex, the unit with the higher Combat Strength
 * will defend against ranged attacks" — and the page's own note that "strong
 * but gravely injured embarked units can be prioritized over weak but healthy
 * naval units" says the comparison is the CHASSIS strength, not the wounded
 * one. The page states the rule for ranged fire alone; a melee or air blow
 * lands on the hull, which is what an escort is for.
 */
/** CIV6 (Convoy): "+10 Combat Strength when in a formation" — a Naval Melee
 *  row, and the formation it names is the ESCORT one, so the term rides
 *  whichever unit is CARRYING a rider. */
export function convoyCS(state: GameState, u: Unit): number {
  return escortRiders(state, u).length > 0 ? promoValue(u, 'CS_IN_FORMATION') : 0;
}

export function stackDefenceCS(state: GameState, u: Unit): number {
  return (u.embarked ? embarkedDefenseCS(state, u.seat) : (UNITS[u.type]?.combat ?? 0))
    + formationCS(u) + convoyCS(state, u);
}
export function stackDefender(state: GameState, enemies: Unit[], ranged: boolean): Unit {
  const fighters = enemies.filter((u) => unitDomain(u.type) === 'military');
  if (fighters.length === 0) return enemies[0];
  if (!ranged) return fighters.find((u) => !u.embarked) ?? fighters[0];
  let best = fighters[0];
  for (const u of fighters) if (stackDefenceCS(state, u) > stackDefenceCS(state, best)) best = u;
  return best;
}

/** The defender's total combat strength for a hit on `defTileIndex`. `vs` names
 *  the attack it is defending against, because two terms need it: SUPPORT is a
 *  melee-only bonus and the class matchup is pairwise. Flanking is the
 *  attacker's own term and is added at the attack site. */
export function defenderCS(state: GameState, defender: Unit, defTileIndex: number,
                           vs?: { attacker: Unit; melee: boolean }): number {
  if (defender.embarked) {
    // The normalized embarked CS replaces the unit's own strength, its terrain
    // and its fortification. Support survives it: CIV6 (Flanking and Support)
    // withholds Support from an embarked defender only "against attacks of
    // enemy naval units".
    const escort = vs?.melee && !UNITS[vs.attacker.type]?.naval
      ? SUPPORT_CS * promoStackMult(defender, 'SUPPORT_MULT') * supportCount(state, defTileIndex, defender)
      : 0;
    return embarkedDefenseCS(state, defender.seat) + formationCS(defender) + convoyCS(state, defender)
      - woundPenalty(defender) + escort
      + generalAuraCS(state, defender, defTileIndex)
      + congressUnitCS(state, defender) + governmentUnitCS(state, defender)
      + (vs ? barbarianCombatCS(state, defender.seat, vs.attacker.seat) : 0);
  }
  const tile = state.map.tiles[defTileIndex];
  return (
    (UNITS[defender.type]?.combat ?? 0) + formationCS(defender) + convoyCS(state, defender) +
    // CIV6 (Garrison Commander): "Units defending within the city's territory
    // get +5 Combat Strength" — the GOVERNED city's own tiles, whoever stands
    // on them, so a foreign attacker's target gets it and the attacker does not.
    (tileSeat(tile) === defender.seat ? governorTileSum(state, tile, (e) => e.territoryCS) : 0) +
    terrainDefense(tile) +
    fortifyBonus(defender) -
    woundPenalty(defender) +
    (vs?.melee ? SUPPORT_CS * promoStackMult(defender, 'SUPPORT_MULT') * supportCount(state, defTileIndex, defender) : 0) +
    (vs ? classMatchupCS(defender.type, vs.attacker.type) : 0) +
    promoCS(defender, {
      attacking: false,
      ranged: vs ? !vs.melee : false,
      foeType: vs?.attacker.type,
      foeDamaged: vs ? vs.attacker.hp < UNIT_HP : false,
      foeInDistrict: vs ? inDistrictTile(state, vs.attacker.tileIndex) : false,
      tile,
    }) + // the promotions this unit chose — an embarked defender took the flat override above
    (vs ? holdTheLineCS(state, defender, defTileIndex, vs.attacker.type) : 0) +
    religionDefenseCS(state, defender, defTileIndex) + // enhancer adders (unit-vs-unit — every defenderCS caller is one; city strikes assemble inline without them)
    cavalryHillCS(state, defender, defTileIndex) + // Preslav's suzerain
    generalAuraCS(state, defender, defTileIndex) + // Great General/Admiral aura
    (vs ? barbarianCombatCS(state, defender.seat, vs.attacker.seat) : 0) +
    (vs ? eraMatchupCS(state, defender, vs.attacker.type) : 0) +
    congressUnitCS(state, defender) + governmentUnitCS(state, defender)
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
  // CIV6 (Akkad's suzerain): "Melee and anti-cavalry units' attacks do full
  // damage to the city's walls" — the ram's own effect, at every walls tier
  // and with no support unit anywhere near.
  let bits = suzerainEffect(state, unitSeat(attacker), 'wallsFullDamage') ? ASSIST_RAM : 0;
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
  // CIV6 (Expert Crew): "Can attack after moving."
  if (promoFlag(unit, 'SIEGE_MOVE_SHOOT')) return true;
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

function cityBaseStrength(state: GameState, city: City): number {
  const garrison = unitsAt(state, city.centerIndex).find(
    (u) => u.seat === city.seat && unitDomain(u.type) === 'military',
  );
  // CIV6: each pre-modern walls tier is "+3 Combat Strength" and they stack.
  return Math.max(15, seatOf(state, city.seat)?.bestMeleeCS ?? 0)
    + (WALLS_TIER_CS[wallsTier(state, city)] ?? 0)
    + (garrison ? 5 : 0);
}

/** What an attacker measures itself against — Bastions' "+6 City Defense
 *  Strength" half. */
export function cityDefenseStrength(state: GameState, city: City): number {
  return cityBaseStrength(state, city) + getModifiers(state, city.seat).cityDefense
    + governorSum(state, city, (e) => e.cityDefense);
}

/** What the city FIRES at — Bastions' "+5 City Ranged Strength" half. This
 *  model has no separate ranged stat for a city, so a strike leaves from the
 *  same base the defence does and takes the ranged half instead. */
export function cityStrikeStrength(state: GameState, city: City): number {
  return cityBaseStrength(state, city) + getModifiers(state, city.seat).cityRanged
    + governorSum(state, city, (e) => e.cityDefense);
}

/** CIV6 (Discipline): "+5 Combat Strength when fighting Barbarians." A
 *  barbarian adopts no government, so this is one-directional by
 *  construction. */
export function barbarianCombatCS(state: GameState, own: number, foe: number): number {
  if (!isBarbSeat(foe) || isBarbSeat(own)) return 0;
  return getModifiers(state, own).combatVsBarbarians;
}

/** The flat Combat Strength the WORLD CONGRESS hands one unit: Military
 *  Advisory's adder on its promotion class, and CIV6 (World Religion, outcome
 *  A): "this outcome also gives Warrior Monks +10 Combat Strength", where the
 *  monk's religion is the one its owner founded. Air units carry no promotion
 *  class, so no air roll can see the advisory half. */
export function congressUnitCS(state: GameState, unit: { type: string; seat: number }): number {
  const monk = unit.type === 'WARRIOR_MONK' ? congressReligiousCs(state, unitSeat(unit)) : 0;
  return congressPromoClassCs(state, UNIT_PROMO_CLASS[unit.type]) + monk;
}

/**
 * CIV6 (War Department): "All units heal up to 20 hit points when they
 * eliminate a unit." The victor's own seat holds the building, so a barbarian
 * or a city-state kill pays nothing; a victor that fell in the same exchange
 * heals only once the mutual-kill rule has stood it back up.
 */
export function healOnEliminate(state: GameState, victor: Unit): void {
  const seat = unitSeat(victor);
  if (victor.hp <= 0 || !isCiv(seat)) return;
  const n = seatBuildingSum(state, seat, 'healOnKill');
  if (n > 0) victor.hp = Math.min(UNIT_HP, victor.hp + n);
}

export function killUnit(state: GameState, unit: Unit): void {
  // CIV6 (Air combat): "Should your Aircraft Carrier be destroyed, your
  // aircraft stationed within will be destroyed."
  if ((UNITS[unit.type]?.airSlots ?? 0) > 0) displaceAirFrom(state, unit.tileIndex, false);
  markAntiquitySite(state, unit.tileIndex, unitSeat(unit)); // a death leaves a dig
  markShipwreck(state, unit.tileIndex, unitSeat(unit)); // ...at sea, a wreck
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
 *
 * The dig is dated by the WORLD era at the moment of the event — CIV6 dates
 * an Artifact by WHEN its battle happened, never by how advanced whoever
 * ordered it was — and `civSeat` is the EVENT's own civilization: the unit
 * that died, the barbarians whose outpost was razed, what a themed museum
 * reads.
 */
export function markAntiquitySite(state: GameState, tileIndex: number, civSeat: number): void {
  const t = state.map.tiles[tileIndex];
  if (!t || t.antiquity || isWater(t) || t.district || t.builtWonder) return;
  const era = worldEraIndex(state);
  if (era >= MODERN_ERA_INDEX) return;
  t.antiquity = true;
  // The dig REMEMBERS when and whose: a themed Archaeological Museum wants
  // one era and three civilizations, so the Artifact has to carry both out
  // of the ground.
  t.antiquityEra = era;
  t.antiquitySeat = civSeat;
}

/**
 * Stamp a SHIPWRECK. Real Civ 6 puts wrecks on passable water and
 * reveals them with Cultural Heritage; an Archaeologist that works one
 * removes it from the map and excavates an Artifact. This model sources its
 * dig placement from DEATHS rather than map generation (see
 * `markAntiquitySite`), so a hull going down leaves the wreck, under the same
 * pre-Modern era gate and the same one-per-tile rule, dated by the same
 * WORLD era — so a barbarian or a minor sinking a hull leaves a wreck like
 * any major's.
 */
export function markShipwreck(state: GameState, tileIndex: number, civSeat: number): void {
  const t = state.map.tiles[tileIndex];
  if (!t || t.shipwreck || !isWater(t)) return;
  const era = worldEraIndex(state);
  if (era >= MODERN_ERA_INDEX) return;
  t.shipwreck = true;
  t.shipwreckEra = era;
  t.shipwreckSeat = civSeat;
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
 * hits. Scoped to MAJOR attackers: a barbarian or city-state carries no
 * religion, so the adder has nothing to read for them.
 */
function assaultAtkCS(state: GameState, attacker: Unit, targetIndex: number): number {
  const amph = promoFlag(attacker, 'AMPHIBIOUS');
  return (
    (UNITS[attacker.type]?.combat ?? 0) + formationCS(attacker) + convoyCS(state, attacker) -
    woundPenalty(attacker) -
    (!amph && crossesRiver(state.map.tiles[attacker.tileIndex], state.map.tiles[targetIndex])
      ? RIVER_ATTACK_PENALTY
      : 0) -
    (attacker.embarked && !amph ? AMPHIBIOUS_ATTACK_CS : 0) +
    promoCS(attacker, {
      attacking: true, vsCity: true, tile: state.map.tiles[attacker.tileIndex],
    }) +
    (CITY_RELIGION_ADDER_LIVE && isCiv(attacker.seat)
      ? religionAttackCS(state, attacker, targetIndex)
      : 0) +
    cavalryHillCS(state, attacker, attacker.tileIndex) + // Preslav's suzerain
    generalAuraCS(state, attacker, attacker.tileIndex) +
    congressUnitCS(state, attacker) + governmentUnitCS(state, attacker)
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
  kAttacker: string): void {
  const atkCS = assaultAtkCS(state, attacker, city.centerIndex);
  const defCS = cityDefenseStrength(state, city);
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CIV6_BATTLE_PROBE) {
    console.log(`TS-BATTLE seed=${state.map.seed} t=${state.turn} tgt=${city.centerIndex} atkCS=${atkCS} defCS=${defCS} ` +
      `combat=${UNITS[attacker.type]?.combat ?? 0} wound=${woundPenalty(attacker)} xp=${attacker.xp ?? 0} ` +
      `best=${Math.max(15, seatOf(state, city.seat)?.bestMeleeCS ?? 0)}`);
  }
  const dmgToCity = damageRoll(state, atkCS - defCS, kCity, city.centerIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, kAttacker, city.centerIndex);
  awardCityXp(state, attacker, city.hp - dmgToCity <= 0 ? XP_CITY_FELLED : XP_CITY_ATTACK);
  const outer = outerPool(state, city);
  const split = cityDamageSplit(outer, wallsMax(state, city), dmgToCity,
    cityHitClass(attacker.type, false),
    siegeAssist(state, attacker, city.centerIndex, wallsTier(state, city)));
  if (split.wall > 0) city.outerHp = outer - split.wall;
  city.hp -= split.centre;
  city.lastHitTurn = state.turn;
  attacker.hp -= dmgToAttacker;
  spendAttack(attacker, true);
  warWearinessBattle(state, attacker.seat, city.seat, city.centerIndex,
    { aDied: attacker.hp <= 0, city: true });
  if (attacker.hp <= 0) {
    unitKillEvent(state, city.seat, undefined, attacker);
    killUnit(state, attacker);
  }
}


/**
 * CIV6 (Combat): the Encampment "cannot be pillaged normally - they have to be
 * 'conquered' by a melee unit, as you would a City Center. At this point the
 * entire district and all buildings in it are automatically pillaged, but you
 * don't gain any spoils from it." And a unit sheltering on the tile "will be
 * destroyed instantly, regardless of its remaining HP".
 *
 * A SHOT never conquers, exactly as it never captures a city, so this runs
 * only off the melee assault.
 */
export function conquerEncampment(state: GameState, tile: Tile, attacker: Unit): void {
  tile.districtPillaged = true;
  displaceAirFrom(state, tile.index);
  for (const shelter of unitsAt(state, tile.index).filter((u) => unitSeat(u) !== attacker.seat)) {
    killUnit(state, shelter);
  }
}

/**
 * The share of ONE roll that reaches an Encampment's garrison. CIV6 gives a
 * defensible district "Defenses HP equal to the City Center" and one set of
 * Walls supplies both — but each supplies its OWN pool, and destroying one
 * does not destroy the other. So the roll divides exactly as a hit on the
 * centre does, with the perimeter share coming off the DISTRICT's own pool.
 * `cityAtTile` is what hands this the city whose walls size that pool.
 */
function encampSplit(state: GameState, tile: Tile, attacker: Unit, roll: number,
                     ranged: boolean): number {
  const held = cityAtTile(state, tile);
  if (!held) return roll;
  const outer = encampOuterPool(state, held, tile);
  const split = cityDamageSplit(outer, wallsMax(state, held), roll,
    cityHitClass(attacker.type, ranged),
    ranged ? 0 : siegeAssist(state, attacker, tile.index, wallsTier(state, held)));
  if (split.wall > 0) tile.encampOuterHp = outer - split.wall;
  held.lastHitTurn = state.turn;
  return split.centre;
}

/**
 * A RANGED strike on an Encampment tile. CIV6 (Combat): "Ranged attacks
 * receive a -17 penalty when attacking city and district defenses or naval
 * units" — the same penalty `cityRangedStrength` already carries for a centre.
 * A shot takes the defenses down and stops there.
 */
function rangedStrikeEncampment(state: GameState, attacker: Unit, tileIndex: number,
                                defCS: number, relCity: number, key: string): void {
  const tile = state.map.tiles[tileIndex];
  const roll = damageRoll(state, (cityRangedStrength(attacker.type, encampOuter(state, tile)) + formationCS(attacker) + convoyCS(state, attacker)
    - woundPenalty(attacker)
    + promoCS(attacker, { attacking: true, ranged: true, vsCity: true, tile: state.map.tiles[attacker.tileIndex] })
    + relCity + generalAuraCS(state, attacker, attacker.tileIndex)
    + congressUnitCS(state, attacker) + governmentUnitCS(state, attacker)) - defCS, key, tileIndex);
  tile.encampHp = Math.max(0, (tile.encampHp ?? ENCAMPMENT_HP) - encampSplit(state, tile, attacker, roll, true));
  warWearinessBattle(state, attacker.seat, tileSeat(tile), tileIndex, { city: true });
  spendAttack(attacker, true);
  awardCityXp(state, attacker, (tile.encampHp ?? 0) <= 0 ? XP_CITY_FELLED : XP_CITY_ATTACK);
}

/** the perimeter a shot measures its penalty against: the district's OWN
 *  pool, at the tier the owning city's walls supply. */
function encampOuter(state: GameState, tile: Tile): number {
  const held = cityAtTile(state, tile);
  return held ? encampOuterPool(state, held, tile) : 0;
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
 * and one set of Walls supplies both — each with its OWN pool — so the roll
 * divides exactly as a hit on the centre does: the perimeter share comes off
 * the district's own pool and only what gets through reaches the garrison.
 * `cityAtTile` is what hands this path the city whose walls size that pool.
 *
 * The attacker's CS comes from the shared `assaultAtkCS`, so the assault kinds
 * cannot drift; only the target pool and the roll keys differ.
 */
function attackEncampment(
  state: GameState,
  attacker: Unit,
  tileIndex: number,
  defCS: number): void {
  const tile = state.map.tiles[tileIndex];
  const atkCS = assaultAtkCS(state, attacker, tileIndex);
  const dmgToEncamp = damageRoll(state, atkCS - defCS, 'enc', tileIndex);
  const dmgToAttacker = damageRoll(state, defCS - atkCS, 'encc', tileIndex);
  awardCityXp(state, attacker, XP_CITY_ATTACK);
  tile.encampHp = Math.max(0, (tile.encampHp ?? ENCAMPMENT_HP)
    - encampSplit(state, tile, attacker, dmgToEncamp, false));
  if (tile.encampHp <= 0) conquerEncampment(state, tile, attacker);
  attacker.hp -= dmgToAttacker;
  spendAttack(attacker, true);
  warWearinessBattle(state, attacker.seat, tileSeat(tile), tileIndex,
    { aDied: attacker.hp <= 0, city: true });
  if (attacker.hp <= 0) killUnit(state, attacker);
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
    // "establish zone of control on all passable tiles" — so the ring is held
    // by what EXERTS it (`unitExertsZoc`), which a submarine never does.
    const held = unitsAt(state, n.index).some(
      (u) => unitExertsZoc(u) && unitsHostile(state, u, { seat }),
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
  // CIV6 (Encampment): "Acquires Outer Defenses and Ranged Strike along with
  // the City Center once Walls have been built" — so the district defends at
  // its city's walls tier, which is the same pool the hit is split against
  // below.
  const held = cityAtTile(state, tile);
  return {
    defCS: Math.max(15, owner.bestMeleeCS ?? 0)
      + (held ? WALLS_TIER_CS[wallsTier(state, held)] ?? 0 : 0),
  };
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
  // CIV6: barbarians raid whoever is near the camp — a minor needs no
  // declared war to be their target.
  return (
    capsOf(seat).alwaysHostile ||
    civsAtWar(state, cityState.seat, seat) ||
    state.seats.some((sx) => isSuzerain(cityState, sx.seat) && civsAtWar(state, sx.seat, seat))
  );
}

/**
 * CIV6 (Unit): "if a stealth unit attacks, it will become visible for a turn
 * before becoming invisible again" — so the blow stamps the live turn and
 * `unitVisibleTo` reads it until the turn rolls over. No AIR chassis is a
 * stealth unit, so the air path carries no stamp.
 */
function markStealthAttack(state: GameState, u: Unit): void {
  if (UNITS[u.type]?.stealth || promoFlag(u, 'STEALTH')) u.revealedTurn = state.turn;
}

/** CIV6 (Disciples): the promotion "applies 250 Religious Pressure to cities
 *  within 10 hexes when it kills a non-Barbarian unit". The pressure is the
 *  KILLER's own religion, so a seat that has founded none spreads nothing. */
function disciplesSpread(
  state: GameState, seat: number, killer: Unit, victimSeat: number, tileIndex: number,
): void {
  const p = promoValue(killer, 'KILL_SPREAD');
  if (p <= 0 || isBarbSeat(victimSeat)) return;
  if (!isCiv(seat) || !seatOf(state, seat)?.religion.founded) return;
  const at = state.map.tiles[tileIndex];
  const n = state.seats.length;
  for (const c of allCities(state)) {
    const cc = state.map.tiles[c.centerIndex];
    if (hexDistance(cc.col, cc.row, at.col, at.row) > KILL_SPREAD_RANGE) continue;
    let pres = c.religionPressure;
    if (!pres || pres.length !== n) {
      pres = new Array(n).fill(0);
      c.religionPressure = pres;
    }
    pres[seat] += p;
  }
}

export function meleeAttack(state: GameState, attackerId: number, targetIndex: number, seat: number): RuleResult {
  const r = meleeAttackInner(state, attackerId, targetIndex, seat);
  if (r.ok) {
    const u = state.units.find((x) => x.id === attackerId);
    if (u) {
      markStealthAttack(state, u);
      logUnitOrder(state, u.seat, attackerId, 'melee', targetIndex);
    }
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
  if (attacksLeftOf(attacker) <= 0) return no('The attack is spent.');
  const from = state.map.tiles[attacker.tileIndex];
  const target = state.map.tiles[targetIndex];
  if (hexDistance(from.col, from.row, target.col, target.row) !== 1) {
    return no('Target must be adjacent.');
  }
  if (!amphibiousReach(state, attacker, targetIndex)) return no('Embarked units strike an open shore only.');

  const enemies = unitsAt(state, targetIndex).filter(
    (u) => unitsHostile(state, attacker, u) && !isAirUnit(u.type)
      && unitVisibleTo(state, u, attacker.seat),
  );
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

  // A live enemy Encampment is the target WHOEVER stands on it. CIV6 (Combat):
  // "A unit may take shelter (that is, avoid being attacked) if it enters a
  // City Center or Encampment tile. There it is invulnerable as long as the
  // city/Encampment stands" — the same district-first rule the centre gets
  // below, and the conquest is what destroys the shelterers.
  const encamp = encampmentDefense(state, attacker, target);
  if (enemies.length === 0 && !seatTarget && !cityStateTarget && !encamp) {
    const civCityHere = cityAtIndex(state, targetIndex);
    if (civCityHere && !civsAtWar(state, unitSeat(attacker), civCityHere.holder.seat)) {
      return no(`You are at peace with ${civCityHere.holder.name} — declare war first.`);
    }
    return no('Nothing to attack there.');
  }
  if (encamp && !seatTarget && !cityStateTarget) {
    attackEncampment(state, attacker, targetIndex, encamp.defCS);
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
    attackCity(state, attacker, seatTarget.holder, seatTarget.city);
    return ok;
  }

  if (cityStateTarget) {
    attackCityState(state, attacker, cityStateTarget);
    return ok;
  }

  const defender = stackDefender(state, enemies, false);
  const defDef = UNITS[defender.type];
  const amph = promoFlag(attacker, 'AMPHIBIOUS');
  const atkCS = def.combat + formationCS(attacker) + convoyCS(state, attacker) - woundPenalty(attacker) - (!amph && crossesRiver(from, target) ? RIVER_ATTACK_PENALTY : 0)
    - (attacker.embarked && !amph ? AMPHIBIOUS_ATTACK_CS : 0);

  if ((defDef?.combat ?? 0) <= 0) {
    if (isBarbSeat(attacker.seat)) {
      killUnit(state, defender);
    } else {
      reseatUnit(state, defender, attacker.seat);
      spendAttack(attacker, true);
      return ok;
    }
  } else {
    const atkCSf = atkCS + FLANKING_CS * promoStackMult(attacker, 'FLANK_MULT') * flankCount(state, targetIndex, attacker)
      * (1 + gpPermOf(seatOf(state, attacker.seat),
        UNITS[attacker.type]?.naval ? 'flankPctNaval' : 'flankPctLand') / 100)
      + promoCS(attacker, {
        attacking: true, foeType: defender.type, foeDamaged: defender.hp < UNIT_HP,
        foeFortified: (defender.fortifyTurns ?? 0) > 0,
        foeInDistrict: inDistrictTile(state, targetIndex),
        tile: from,
      })
      + holdTheLineCS(state, attacker, attacker.tileIndex, defender.type)
      + religionAttackCS(state, attacker, targetIndex) + cavalryHillCS(state, attacker, attacker.tileIndex) + generalAuraCS(state, attacker, attacker.tileIndex) // aura keyed on the ATTACKER's own tile
      + classMatchupCS(attacker.type, defender.type)
      + emergencyAttackCS(state, attacker.seat, defender.seat) // an emergency MEMBER hits its target harder
      + barbarianCombatCS(state, attacker.seat, defender.seat)
      + congressUnitCS(state, attacker) + governmentUnitCS(state, attacker);
    const defCSf = defenderCS(state, defender, targetIndex, { attacker, melee: true });
    defender.hp -= damageRoll(state, atkCSf - defCSf, 'mel', targetIndex);
    attacker.hp -= damageRoll(state, defCSf - atkCSf, 'melc', targetIndex);
    awardBattleXp(state, attacker, defender,
      { ranged: false, aDied: attacker.hp <= 0, dDied: defender.hp <= 0 });
    warWearinessBattle(state, attacker.seat, defender.seat, targetIndex,
      { aDied: attacker.hp <= 0 && defender.hp > 0, dDied: defender.hp <= 0 });
    if (defender.hp <= 0) {
      unitKillEvent(state, unitSeat(attacker), attacker, defender);
      disciplesSpread(state, unitSeat(attacker), attacker, defender.seat, targetIndex);
      killUnit(state, defender);
      if (attacker.hp <= 0) attacker.hp = 1; // victor survives
      healOnEliminate(state, attacker);
    } else if (attacker.hp <= 0) {
      unitKillEvent(state, unitSeat(defender), defender, attacker);
      disciplesSpread(state, unitSeat(defender), defender, attacker.seat, targetIndex);
      killUnit(state, attacker);
      healOnEliminate(state, defender);
      attacker.movesLeft = 0;
      return ok;
    }
  }
  spendAttack(attacker);
  if (state.units.includes(attacker) && tileFreeForUnit(state, targetIndex, 0, attacker)) {
    attacker.tileIndex = targetIndex;
    // an amphibious victor comes ashore: `stepUnit`'s own transition rule
    if (!def.naval) attacker.embarked = isWater(state.map.tiles[targetIndex]);
    clearCampFor(state, attacker, targetIndex); // every seat clears it
  }
  return ok;
}


/** the COMMIT seam for rangedAttack. The resolver returns early on a
 *  dozen refusals; logging inside it would record ATTEMPTS, and an attempt is
 *  not an action. Only a resolved order reaches the log, tagged with the
 *  ACTING SEAT — which is what made the city-first divergences of this round
 *  (a barbarian on a foreign centre; the GPU sieging a peaceful city-state) a
 *  state-column hunt instead of one diff. */
/**
 * AN AIR STRIKE. CIV6 (Air combat): "all air attacks are ranged, and the
 * attacking plane doesn't suffer damage in return unless it gets Intercepted".
 * The strike reaches anything inside the aircraft's OPERATIONAL RANGE measured
 * from its base, and takes "a full action to perform".
 *
 * A FIGHTER's ranged damage is "effective against land units, but not against
 * cities and naval units"; a BOMBER's bombard damage is "effective against
 * cities and naval units but not against land units". What answers is the
 * target's Anti-Air Strength "(even if its Combat Strength is higher) or
 * Combat Strength if it doesn't have any".
 *
 * Not modelled here, and recorded rather than invented: PATROL, and with it
 * fighter INTERCEPTION, which needs an air unit to hold a map tile it is not
 * based on.
 */
export function airStrike(state: GameState, attackerId: number, targetIndex: number, seat: number): RuleResult {
  const attacker = state.units.find((u) => u.id === attackerId && u.seat === seat);
  if (!attacker) return { ok: false, reason: 'No such unit.' };
  const kind = UNITS[attacker.type]?.air;
  if (!kind) return { ok: false, reason: 'Not an air unit.' };
  if (attacker.movesLeft <= 0) return { ok: false, reason: 'The sortie is spent.' };
  if (attacksLeftOf(attacker) <= 0) return { ok: false, reason: 'The sortie is spent.' };
  if (!airStrikeReaches(state, attacker, targetIndex)) return { ok: false, reason: 'Out of operational range.' };
  if (!airStrikeOffers(state, attacker, targetIndex)) {
    return { ok: false, reason: 'Not a target this aircraft answers.' };
  }
  const holder = cityAtIndex(state, targetIndex);
  if (kind === 'BOMBER' && holder && civsAtWar(state, seat, holder.holder.seat)) {
    const r = rangedAttack(state, attackerId, targetIndex);
    if (r.ok) attacker.movesLeft = 0;
    return r;
  }
  const enemies = unitsAt(state, targetIndex).filter(
    (u) => unitsHostile(state, attacker, u) && !isAirUnit(u.type)
      && unitVisibleTo(state, u, attacker.seat),
  );
  if (enemies.length === 0) return { ok: false, reason: 'Nothing to strike.' };
  // CIV6 (Air combat): "all air attacks are ranged", so the naval hex's
  // higher-chassis rule answers this blow too.
  const defender = stackDefender(state, enemies, true);
  const atk = UNITS[attacker.type]?.ranged?.strength ?? 0;
  const def = airDefenseOf(defender.type);
  // CIV6 (Air combat): "all air attacks are ranged", so the sortie is a ranged
  // roll and both trees speak into it — the striker's class terms, and the
  // defender's own "+7 Combat Strength when defending vs. air attacks".
  const fromTile = state.map.tiles[attacker.tileIndex];
  const atkE = atk - woundPenalty(attacker)
    + promoCS(attacker, { attacking: true, ranged: true, foeType: defender.type, tile: fromTile });
  const defE = def - woundPenalty(defender)
    + promoCS(defender, {
      attacking: false, ranged: true, vsAir: true, foeType: attacker.type,
      tile: state.map.tiles[targetIndex],
    });
  defender.hp -= damageRoll(state, atkE - defE, 'air', targetIndex);
  spendAttack(attacker, true);
  // the answer. CIV6 (Air combat): a plane "doesn't suffer damage in return
  // unless it gets Intercepted", and "the only exceptions to this rule are
  // SHIPS with the Anti-Air Strength stat - they have additional close-range
  // defenses, which activate when they are attacked by an aircraft" — beside
  // which a parked weapon "provides cover from air attacks up to 1 hex away".
  // `airCoverAgainst` folds both into the one answer that fires.
  const cover = airCoverAgainst(state, attacker, targetIndex);
  if (cover) {
    const covE = airDefenseOf(cover.type) - woundPenalty(cover)
      + promoCS(cover, {
        attacking: false, ranged: true, vsAir: true, foeType: attacker.type,
        tile: state.map.tiles[cover.tileIndex],
      });
    // the burst answers the AIRCRAFT, which is the defender of this roll
    const airD = atk - woundPenalty(attacker)
      + promoCS(attacker, {
        attacking: false, vsAntiAir: true, foeType: cover.type, tile: fromTile,
      });
    attacker.hp -= damageRoll(state, covE - airD, 'airc', targetIndex);
    if (attacker.hp <= 0) disbandUnit(state, attacker.id);
  }
  awardBattleXp(state, attacker, defender,
    { ranged: true, aDied: attacker.hp <= 0, dDied: defender.hp <= 0 });
  warWearinessBattle(state, attacker.seat, defender.seat, targetIndex, {
    aDied: attacker.hp <= 0, dDied: defender.hp <= 0,
  });
  if (defender.hp <= 0) {
    killUnit(state, defender);
    healOnEliminate(state, attacker);
  }
  logUnitOrder(state, seat, attackerId, 'ranged', targetIndex);
  return { ok: true };
}

export function rangedAttack(state: GameState, attackerId: number, targetIndex: number): RuleResult {
  const r = rangedAttackInner(state, attackerId, targetIndex);
  if (r.ok) {
    const u = state.units.find((x) => x.id === attackerId);
    if (u) {
      markStealthAttack(state, u);
      logUnitOrder(state, u.seat, attackerId, 'ranged', targetIndex);
    }
  }
  return r;
}
function rangedAttackInner(state: GameState, attackerId: number, targetIndex: number): RuleResult {
  const attacker = state.units.find((u) => u.id === attackerId);
  if (!attacker) return no('No such unit.');
  const def = UNITS[attacker.type];
  if (!def?.ranged) return no('Not a ranged unit.');
  if (attacker.movesLeft <= 0) return no('No movement left.');
  if (attacksLeftOf(attacker) <= 0) return no('The attack is spent.');
  if (!siegeMayShoot(state, attacker)) return no('Siege units cannot move and shoot.');
  if (attacker.embarked) return no('Embarked units cannot attack.');
  const from = state.map.tiles[attacker.tileIndex];
  const target = state.map.tiles[targetIndex];
  if (hexDistance(from.col, from.row, target.col, target.row) > unitAttackRange(attacker)) {
    return no('Out of range.');
  }
  const enemies = unitsAt(state, targetIndex).filter(
    (u) => unitsHostile(state, attacker, u) && !isAirUnit(u.type)
      && unitVisibleTo(state, u, attacker.seat),
  );
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
    const roll = damageRoll(state, (cityRangedStrength(attacker.type, outer) + formationCS(attacker) + convoyCS(state, attacker) - woundPenalty(attacker) + promoCS(attacker, { attacking: true, ranged: true, vsCity: true, tile: state.map.tiles[attacker.tileIndex] }) + relCity + generalAuraCS(state, attacker, attacker.tileIndex) + congressUnitCS(state, attacker) + governmentUnitCS(state, attacker)) - defCS, 'rngrc', targetIndex);
    const split = cityDamageSplit(outer, wallsMax(state, civCity.city), roll, cityHitClass(attacker.type, true));
    if (split.wall > 0) civCity.city.outerHp = outer - split.wall;
    civCity.city.hp = Math.max(1, civCity.city.hp - split.centre);
    civCity.city.lastHitTurn = state.turn;
    warWearinessBattle(state, attacker.seat, civCity.city.seat, targetIndex, { city: true });
    spendAttack(attacker, true);
    awardCityXp(state, attacker, civCity.city.hp <= 1 ? XP_CITY_FELLED : XP_CITY_ATTACK);
    return ok;
  }
  const encampR = encampmentDefense(state, attacker, target);
  if (encampR) {
    rangedStrikeEncampment(state, attacker, targetIndex, encampR.defCS, relCity, 'rnge');
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
    cityState.hp = Math.max(1, (cityState.hp ?? CITY_STATE_MAX_HP) - damageRoll(state, (cityRangedStrength(attacker.type, 0) + formationCS(attacker) + convoyCS(state, attacker) - woundPenalty(attacker) + promoCS(attacker, { attacking: true, ranged: true, vsCity: true, tile: state.map.tiles[attacker.tileIndex] }) + relCity + generalAuraCS(state, attacker, attacker.tileIndex) + congressUnitCS(state, attacker) + governmentUnitCS(state, attacker)) - defCS, 'rngcs', targetIndex));
    warWearinessBattle(state, attacker.seat, seatOfCityState(cityState.id), targetIndex, { city: true });
    spendAttack(attacker, true);
    awardCityXp(state, attacker, cityState.hp <= 1 ? XP_CITY_FELLED : XP_CITY_ATTACK);
    return ok;
  }
  if (enemies.length === 0) return no('Nothing to attack there.');
  const defender = stackDefender(state, enemies, true);
  const defCS = defenderCS(state, defender, targetIndex, { attacker, melee: false });
  defender.hp -= damageRoll(state, (def.ranged.strength + formationCS(attacker) + convoyCS(state, attacker) - woundPenalty(attacker) + promoCS(attacker, rangedCtx(state, attacker, defender, targetIndex)) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex) + classMatchupCS(attacker.type, defender.type) + barbarianCombatCS(state, attacker.seat, defender.seat) + congressUnitCS(state, attacker) + governmentUnitCS(state, attacker)) - defCS, 'rng', targetIndex);
  awardBattleXp(state, attacker, defender, { ranged: true, aDied: false, dDied: defender.hp <= 0 });
  warWearinessBattle(state, attacker.seat, defender.seat, targetIndex, { dDied: defender.hp <= 0 });
  if (defender.hp <= 0) {
    unitKillEvent(state, unitSeat(attacker), attacker, defender);
    disciplesSpread(state, unitSeat(attacker), attacker, defender.seat, targetIndex);
    killUnit(state, defender);
    healOnEliminate(state, attacker);
  }
  spendAttack(attacker);
  return ok;
}

/** CIV6 (Guerrilla / Silent Running / Elite Guard): "Can move after
 *  attacking... Attacking doesn't consume Movement, so a unit with this
 *  promotion can use its full Movement after making an attack." Every other
 *  unit spends its turn on the blow — but the ATTACK itself is spent either
 *  way: a unit attacks once a turn, and only Sweeping Wind buys a second.
 *  `endsTurn` is the city / district / air path, which stops a unit dead. */
function spendAttack(unit: Unit, endsTurn = false): void {
  unit.attacksLeft = Math.max(0, attacksLeftOf(unit) - 1);
  if (endsTurn || !promoFlag(unit, 'MOVE_AFTER_ATTACK')) unit.movesLeft = 0;
}


/** the promotion context of a RANGED shot at a unit — one body, because both
 *  ranged paths assemble the same terms. */
function rangedCtx(state: GameState, attacker: Unit, defender: Unit, targetIndex: number): PromoCtx {
  return {
    attacking: true, ranged: true, foeType: defender.type,
    foeDamaged: defender.hp < UNIT_HP,
    foeFortified: (defender.fortifyTurns ?? 0) > 0,
    foeInDistrict: inDistrictTile(state, targetIndex),
    tile: state.map.tiles[attacker.tileIndex],
  };
}

export function hostileRangedStrike(state: GameState, attacker: Unit, targetIndex: number): void {
  if (hostileRangedStrikeInner(state, attacker, targetIndex)) markStealthAttack(state, attacker);
}

/** Did the strike actually resolve? Only a shot that lands reveals a raider. */
function hostileRangedStrikeInner(state: GameState, attacker: Unit, targetIndex: number): boolean {
  if (attacksLeftOf(attacker) <= 0) return false;
  const def = UNITS[attacker.type];
  if (!def?.ranged) return false;
  if (!siegeMayShoot(state, attacker)) return false;
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
    const roll = damageRoll(state, (cityRangedStrength(attacker.type, outer) + formationCS(attacker) + convoyCS(state, attacker) - woundPenalty(attacker) + promoCS(attacker, { attacking: true, ranged: true, vsCity: true, tile: state.map.tiles[attacker.tileIndex] }) + (CITY_RELIGION_ADDER_LIVE ? religionAttackCS(state, attacker, targetIndex) : 0) + generalAuraCS(state, attacker, attacker.tileIndex) + congressUnitCS(state, attacker) + governmentUnitCS(state, attacker)) - defCS, 'vrngc', targetIndex);
    const split = cityDamageSplit(outer, wallsMax(state, enemyCity), roll, cityHitClass(attacker.type, true));
    if (split.wall > 0) enemyCity.outerHp = outer - split.wall;
    enemyCity.hp = Math.max(1, enemyCity.hp - split.centre);
    enemyCity.lastHitTurn = state.turn;
    warWearinessBattle(state, attacker.seat, enemyCity.seat, targetIndex, { city: true });
    spendAttack(attacker, true);
    awardCityXp(state, attacker, enemyCity.hp <= 1 ? XP_CITY_FELLED : XP_CITY_ATTACK);
    return true;
  }
  const encampV = encampmentDefense(state, attacker, target);
  if (encampV) {
    rangedStrikeEncampment(
      state, attacker, targetIndex, encampV.defCS,
      CITY_RELIGION_ADDER_LIVE ? religionAttackCS(state, attacker, targetIndex) : 0, 'vrnge');
    return true;
  }
  // A RANGED unit does not engage another civ's units — the ranged-vs-civ
  // scope-out, the same predicate `attackTargets` applies. A civ unit standing
  // on a centre this strike could otherwise reach therefore makes the strike a
  // no-op rather than a hit.
  const enemies = unitsAt(state, targetIndex).filter(
    (u) => unitsHostile(state, attacker, u) && !isAirUnit(u.type)
      && !(isCiv(attacker.seat) && isCiv(u.seat))
      && unitVisibleTo(state, u, attacker.seat),
  );
  if (enemies.length === 0) return false; // the CITY_CENTER quirk: a no-op, like meleeAttack's `no(...)`
  const defender = stackDefender(state, enemies, true);
  const defCS = defenderCS(state, defender, targetIndex, { attacker, melee: false });
  defender.hp -= damageRoll(state, (def.ranged.strength + formationCS(attacker) + convoyCS(state, attacker) - woundPenalty(attacker) + promoCS(attacker, rangedCtx(state, attacker, defender, targetIndex)) + religionAttackCS(state, attacker, targetIndex) + generalAuraCS(state, attacker, attacker.tileIndex) + classMatchupCS(attacker.type, defender.type) + barbarianCombatCS(state, attacker.seat, defender.seat) + congressUnitCS(state, attacker) + governmentUnitCS(state, attacker)) - defCS, 'vrng', targetIndex);
  warWearinessBattle(state, attacker.seat, defender.seat, targetIndex, { dDied: defender.hp <= 0 });
  awardBattleXp(state, attacker, defender, { ranged: true, aDied: false, dDied: defender.hp <= 0 });
  if (defender.hp <= 0) {
    unitKillEvent(state, unitSeat(attacker), attacker, defender);
    disciplesSpread(state, unitSeat(attacker), attacker, defender.seat, targetIndex);
    killUnit(state, defender);
    healOnEliminate(state, attacker);
  }
  spendAttack(attacker);
  return true;
}

/** the tiles a unit's attack reaches. CIV6 (Forward Observers / Coincidence
 *  Rangefinding): "+1 Range" — the only thing that moves a chassis's own. */
export function unitAttackRange(unit: Unit): number {
  const def = UNITS[unit.type];
  if (!def?.ranged) return 1;
  return def.ranged.range + promoValue(unit, 'RANGE');
}

export function attackTargets(state: GameState, unit: Unit): number[] {
  const def = UNITS[unit.type];
  if (!def || def.combat <= 0 || unit.movesLeft <= 0 || attacksLeftOf(unit) <= 0) return [];
  if (unit.embarked && def.ranged) return []; // only a MELEE attack goes ashore
  if (!siegeMayShoot(state, unit)) return [];
  const from = state.map.tiles[unit.tileIndex];
  const range = unitAttackRange(unit);
  const out: number[] = [];
  for (const t of state.map.tiles) {
    const d = hexDistance(from.col, from.row, t.col, t.row);
    if (d < 1 || d > range) continue;
    if (!amphibiousReach(state, unit, t.index)) continue;
    const hasEnemy = unitsAt(state, t.index).some(
      (u) => unitsHostile(state, unit, u) && !(def.ranged && isCiv(unit.seat) && isCiv(u.seat))
        && unitVisibleTo(state, u, unit.seat),
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

    // A district's defenses are a RANGED target too, at the same -17 every
    // city perimeter costs; melee still has to be adjacent.
    const encampTarget = encampmentBlocks(state, t, unit) && (def.ranged ? true : d === 1);
    if (hasEnemy || cityTarget || cityStateTarget || encampTarget) out.push(t.index);
  }
  return out;
}


function attackCity(state: GameState, attacker: Unit, holder: Seat, city: City): void {
  cityAssault(state, attacker, city, 'rcty', 'rctyc');
  if (city.hp > 0) return;
  // CIV6: "when a city is captured, all units within it are destroyed" — the
  // garrison falls with the centre it was holding. Array order, and the centre
  // carries a district so no death leaves a dig.
  for (const garrison of unitsAt(state, city.centerIndex).filter((u) => unitSeat(u) !== attacker.seat)) {
    killUnit(state, garrison);
  }
  const captor = seatOf(state, attacker.seat);
  if (captor && !isBarbSeat(attacker.seat)) {
    transferCity(state, holder.seat, captor, city, 'conquered');  // pays the plunder itself
  } else {
    sackCity(state, city, holder.seat);
    state.eventLog.push(`Barbarians sacked ${city.name} (${holder.name}).`);
  }
}

function attackCityState(state: GameState, attacker: Unit, cityState: CityState): void {
  const atkCS = assaultAtkCS(state, attacker, cityState.centerIndex);
  const defCS = 15 + cityState.population + (cityState.type === 'militaristic' ? 6 : 0);
  cityState.hp = (cityState.hp ?? CITY_STATE_MAX_HP) - damageRoll(state, atkCS - defCS, 'csty', cityState.centerIndex);
  // CIV6: barbarians never capture a city — their assault leaves the minor
  // standing at 1 HP, `hostileRangedStrike`'s own city floor.
  if (capsOf(attacker.seat).alwaysHostile) cityState.hp = Math.max(1, cityState.hp);
  attacker.hp -= damageRoll(state, defCS - atkCS, 'cstyc', cityState.centerIndex);
  warWearinessBattle(state, attacker.seat, seatOfCityState(cityState.id), cityState.centerIndex,
    { aDied: attacker.hp <= 0, city: true });
  spendAttack(attacker, true);
  awardCityXp(state, attacker, (cityState.hp ?? 0) <= 0 ? XP_CITY_FELLED : XP_CITY_ATTACK);
  if (attacker.hp <= 0) killUnit(state, attacker);
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
  grievanceCityStateTaken(state, seat, (seatOf(state, seat)?.cities.length ?? 0) >= MAX_CITIES_PER_SEAT);
  // an annexed minor was founded by nobody who keeps a ledger
  state.cityStates = state.cityStates.filter((c) => c.id !== cityState.id);
  for (const sx of state.seats) {
    sx.tradeRoutes = sx.tradeRoutes?.filter((x) => x.toCs !== cityState.id);
  }
  const center = state.map.tiles[cityState.centerIndex];
  if (seatOf(state, seat)!.cities.length >= MAX_CITIES_PER_SEAT) {
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
    founderSeat: -1,   // a minor founded it, and minors keep no ledger
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
  grievanceCityStateTaken(state, actor.seat, actor.cities.length >= MAX_CITIES_PER_SEAT);
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
    founderSeat: -1,   // a minor founded it, and minors keep no ledger
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

  // 2. Pillage the improvement underfoot, paying the target's own plunder
  // row — a barbarian still HEALS off a heal row, and only a major banks
  // a yield lump (`pillagePlunder`).
  // BARBARIANS raid ANY territorial owner, majors and minors alike; a
  // non-barbarian hostile walker still needs its war.
  const here = tile();
  const hereOwned = isTerritorial(tileSeat(here))
    && (isBarbSeat(unit.seat) || civsAtWar(state, unitSeat(unit), tileSeat(here)));
  if (here.improvement && !here.pillaged && hereOwned) {
    here.pillaged = true;
    pillagePlunder(state, unit, IMPROVEMENTS[here.improvement as ImprovementId]?.plunder);
    unit.movesLeft = 0;
    return;
  }
  // CIV6: the Encampment "cannot be pillaged normally" — it is conquered by a
  // melee unit instead, which pillages it at the assault site.
  if (
    here.district !== null &&
    here.district !== 'CITY_CENTER' &&
    here.district !== 'ENCAMPMENT' &&
    here.districtComplete &&
    !here.districtPillaged &&
    hereOwned
  ) {
    here.districtPillaged = true;
    pillagePlunder(state, unit, DISTRICTS[here.district].plunder, true);
    displaceAirFrom(state, here.index);
    unit.movesLeft = 0;
    return;
  }

  let target: Tile | null = null;
  let bestDist = 13;
  for (const t of map.tiles) {
    const tOwned = isTerritorial(tileSeat(t))
      && (isBarbSeat(unit.seat) || civsAtWar(state, unitSeat(unit), tileSeat(t)));
    if (!tOwned) continue;
    const impJob = t.improvement !== null && !t.pillaged;
    const distJob =
      t.district !== null &&
      t.district !== 'CITY_CENTER' &&
      t.district !== 'ENCAMPMENT' &&
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
    // The city scan is ANY hostile owner's, majors and city-states alike —
    // real Civ 6 barbarians raid whoever is near the camp, and an adjacent
    // minor centre IS a melee target (`attackTargets`'s cityStateTarget arm),
    // so a parked raider fights rather than stands. The key packs distance,
    // then the seat id (wide enough for a 100+ minor), then the centre tile.
    for (const other of state.seats) {
      if (other.seat === unit.seat) continue;
      if (!capsOf(unit.seat).alwaysHostile && !civsAtWar(state, unitSeat(unit), other.seat)) continue;
      for (const oc of other.cities) {
        const t = map.tiles[oc.centerIndex];
        const key = hexDistance(here.col, here.row, t.col, t.row) * (2048 * 256)
          + other.seat * 2048
          + oc.centerIndex;
        if (key < bestKey) {
          bestKey = key;
          best = t;
        }
      }
    }
    for (const csx of state.cityStates) {
      if (!cityStateAttackable(state, csx, unitSeat(unit))) continue;
      const t = map.tiles[csx.centerIndex];
      const key = hexDistance(here.col, here.row, t.col, t.row) * (2048 * 256)
        + seatOfCityState(csx.id) * 2048
        + csx.centerIndex;
      if (key < bestKey) {
        bestKey = key;
        best = t;
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
    u.attacksLeft = attacksPerTurn(u);
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
