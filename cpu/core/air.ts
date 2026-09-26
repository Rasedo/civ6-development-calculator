/**
 * AIR UNITS. CIV6 (Air combat): "Each air unit has to be based somewhere. You
 * will not be able to build more units than you have space for in your bases."
 * A plane is not a tile occupant the way a land unit is — it sits INSIDE its
 * base, strikes from it, and re-bases rather than walking. A FIGHTER may also
 * deploy to PATROL a hex (`Unit.patrol`); its base keeps its slot and its
 * `tileIndex` while it is out.
 *
 * Bases and their slots come from the install, not the page: Districts.xml
 * gives DISTRICT_CITY_CENTER AirSlots 1, DISTRICT_AERODROME 4 and
 * IMPROVEMENT_AIRSTRIP 3; Buildings.xml grants the Hangar and the Airport 2
 * apiece (MODIFIER_PLAYER_DISTRICT_GRANT_AIR_SLOTS), so an Aerodrome reaches
 * 8; the Aircraft Carrier carries its own 2.
 */
import { UNITS, UNIT_HP, GDR_DRONE_AA } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { IMPROVEMENTS } from '../data/improvements';
import { hexDistance, tilesWithin } from '../../world/hex';
import { citiesOf, isTerritorial, tileSeat } from './seats';
import { cityAtIndex, gdrHas, unitDomain, unitStackSlot, unitsAt, unitsHostile, unitVisibleTo } from './units';
import { promoFlag, promoValue } from './promotions';
import { governorTileSum } from './governors';
import { srcConst, xml } from '../data/provenance';
import type { GameState, ImprovementId, Tile, Unit } from './types';

const CITY_CENTER_AIR_SLOTS = 1;
export const AERODROME_AIR_SLOTS = 4;

/** CIV6 (Patrols): a deployed fighter flies "around its effective intercept
 *  range (currently 1 hex radius)". */
export const INTERCEPT_RANGE = srcConst('combat.interceptRange', 1, {
  pedia: 'Civilopedia_Concepts_Text.xml LOC_PEDIA_CONCEPTS_PAGE_AIRCOMBAT_3_CHAPTER_CONTENT_PARA_1: '
    + '"its effective intercept range (currently 1 hex radius)"',
});
/** CIV6 (Interceptions): "The remaining aircraft act in support of the
 *  defense by adding +5 to the strength of the main interceptor." */
export const INTERCEPT_SUPPORT_CS = srcConst('combat.interceptSupportCs', 5, {
  pedia: 'Civilopedia_Concepts_Text.xml LOC_PEDIA_CONCEPTS_PAGE_AIRCOMBAT_5_CHAPTER_CONTENT_PARA_1: '
    + '"adding +5 to the strength of the main interceptor"',
});
/** PRIORITY TARGET's blow: a flat share of the struck unit's hit points, no
 *  draw, nothing back — the preview shows an ordinary combat, the fired order
 *  does not (runs/air_strike_20260926T.jsonl: 4 of 4 fired strikes took an
 *  anti-air gun 0 -> 65 with the random seed untouched, and the covering gun
 *  beside it never fired). */
export const PRIORITY_TARGET_DAMAGE = srcConst('combat.priorityTargetDamage', 65,
  xml('GlobalParameters', 'Name=COMBAT_MIN_CIVILIAN_DAMAGE_PERCENT', 'Value',
    { note: 'a percent of the unit\'s 100 HP; the lab read it as the fired Priority Target\'s damage' }));

export function isAirUnit(type: string): boolean {
  return UNITS[type]?.air !== undefined;
}

/** every air unit standing at this tile — its base's occupancy. */
function airUnitsAt(state: GameState, tileIndex: number): Unit[] {
  return unitsAt(state, tileIndex).filter((u) => isAirUnit(u.type));
}

/**
 * How many aircraft `tileIndex` can base for `seat`, 0 if it is no base of
 * theirs. A pillaged district bases nothing, like every other thing a district
 * does while it is wrecked.
 */
export function airSlotsAt(state: GameState, seat: number, tileIndex: number): number {
  const tile: Tile | undefined = state.map.tiles[tileIndex];
  if (!tile) return 0;
  // a CARRIER is a base wherever it floats, its own seat's alone. CIV6
  // (Flight Deck, Hangar Deck, Folding Wings): "+1 additional aircraft slot".
  const hull = unitsAt(state, tileIndex).find((u) => u.seat === seat && (UNITS[u.type]?.airSlots ?? 0) > 0);
  if (hull) return UNITS[hull.type]!.airSlots! + promoValue(hull, 'AIR_SLOTS');
  if (tileSeat(tile) !== seat) return 0;
  // CIV6 (Airstrip): "+3 aircraft slots". A pillaged one bases nothing, the
  // same rule a wrecked Aerodrome answers to.
  if (tile.improvement && !tile.pillaged) {
    const slots = IMPROVEMENTS[tile.improvement as ImprovementId].airSlots ?? 0;
    if (slots > 0) return slots;
  }
  if (tile.district === 'CITY_CENTER') return CITY_CENTER_AIR_SLOTS;
  if (tile.district !== 'AERODROME') return 0;
  if (!tile.districtComplete || tile.districtPillaged) return 0;
  const city = citiesOf(state, seat).find((c) => c.districts.some((d) => d.tileIndex === tileIndex));
  const extra = (city?.buildings ?? []).reduce(
    (n, id) => n + (BUILDINGS[id]?.district === 'AERODROME' ? BUILDINGS[id]?.airSlots ?? 0 : 0), 0,
  );
  // CIV6 (Marina Raskova): the retired general's permanent "+1 air unit
  // slots" on this district tile.
  return AERODROME_AIR_SLOTS + extra + (tile.airSlotBonus ?? 0);
}

export function airBaseFree(state: GameState, seat: number, tileIndex: number): boolean {
  return airUnitsAt(state, tileIndex).length < airSlotsAt(state, seat, tileIndex);
}

/** every tile this seat could base a plane at right now. */
export function airBasesOf(state: GameState, seat: number): number[] {
  const out: number[] = [];
  for (const city of citiesOf(state, seat)) {
    if (airSlotsAt(state, seat, city.centerIndex) > 0) out.push(city.centerIndex);
    for (const d of city.districts) {
      if (d.type === 'AERODROME' && airSlotsAt(state, seat, d.tileIndex) > 0) out.push(d.tileIndex);
    }
  }
  // an AIRSTRIP stands on no city's district list, so its tiles come off the
  // map rather than off a city.
  for (const t of state.map.tiles) {
    if (!t.improvement || (IMPROVEMENTS[t.improvement as ImprovementId].airSlots ?? 0) <= 0) continue;
    if (airSlotsAt(state, seat, t.index) > 0) out.push(t.index);
  }
  for (const u of state.units) {
    if (u.seat === seat && (UNITS[u.type]?.airSlots ?? 0) > 0) out.push(u.tileIndex);
  }
  return out;
}

/**
 * CIV6 (Air combat): "Air units, as mentioned above, can only be built in a
 * city with an Aerodrome. Newly built aircraft will spawn in the Aerodrome, as
 * long as it still has empty slots."
 */
export function airTrainTile(
  state: GameState,
  seat: number,
  city: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): number | undefined {
  for (const d of city.districts) {
    if (d.type !== 'AERODROME') continue;
    if (airBaseFree(state, seat, d.tileIndex)) return d.tileIndex;
  }
  return undefined;
}

export function canTrainAir(
  state: GameState,
  seat: number,
  city?: { centerIndex: number; districts: { type: string; tileIndex: number }[] },
): boolean {
  return !!city && airTrainTile(state, seat, city) !== undefined;
}

/**
 * CIV6: "You may spend a turn to re-base any aircraft, moving it to a new,
 * valid base which is close enough. The maximum re-base distance is twice the
 * Moves of that air unit."
 */
export function rebaseRange(type: string): number {
  return 2 * (UNITS[type]?.moves ?? 0);
}

export function canRebaseTo(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (!isAirUnit(unit.type) || unit.movesLeft <= 0) return false;
  if (tileIndex === unit.tileIndex) return false;
  if (!airBaseFree(state, unit.seat, tileIndex)) return false;
  const a = state.map.tiles[unit.tileIndex];
  const b = state.map.tiles[tileIndex];
  if (!a || !b) return false;
  return hexDistance(a.col, a.row, b.col, b.row) <= rebaseRange(unit.type);
}

export function rebaseAir(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (!canRebaseTo(state, unit, tileIndex)) return false;
  unit.tileIndex = tileIndex;
  unit.movesLeft = 0;
  unit.patrol = undefined; // an order other than the patrol ends it
  return true;
}

/**
 * PATROL (UNITOPERATION_DEPLOY). CIV6 (Patrols): "Fighter aircraft can be
 * deployed to a valid hex within their Movement range from a friendly air
 * base"; (Air Strikes) "Heavy Bomber aircraft cannot deploy on Patrols, but
 * they are instead considered 'stationed' at a friendly air base". The
 * deployment spends the turn, as a re-base does.
 */
export function deployRange(type: string): number {
  return UNITS[type]?.moves ?? 0;
}

export function canDeployTo(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (UNITS[unit.type]?.air !== 'FIGHTER' || unit.movesLeft <= 0) return false;
  const a = state.map.tiles[unit.tileIndex];
  const b = state.map.tiles[tileIndex];
  if (!a || !b) return false;
  return hexDistance(a.col, a.row, b.col, b.row) <= deployRange(unit.type);
}

/** the hexes the DEPLOY head offers: this seat's own district and city-centre
 *  tiles the fighter may deploy over, tile index ascending, cut to width. */
export function deployTargets(state: GameState, unit: Unit, width: number): number[] {
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (out.length >= width) break;
    if (!t.district || tileSeat(t) !== unit.seat) continue;
    if (canDeployTo(state, unit, t.index)) out.push(t.index);
  }
  return out;
}

export function deployAir(state: GameState, unit: Unit, tileIndex: number): boolean {
  if (!canDeployTo(state, unit, tileIndex)) return false;
  unit.patrol = tileIndex;
  unit.movesLeft = 0;
  return true;
}

/** CIV6 (Patrols): "At any time during the player's turn, Fighter aircraft
 *  can 'Return to Base' (station at a friendly air base) in order to heal." */
export function returnToBase(unit: Unit): boolean {
  if (unit.patrol === undefined) return false;
  unit.patrol = undefined;
  return true;
}

/**
 * The patrol that answers a sortie at `tileIndex`, and the support the other
 * covering patrols lend it. CIV6 (Interceptions): "If an air unit tries an
 * air strike against a target within the range of an intercepting unit, the
 * interceptor will fire on the attacker"; (Patrols) "Aircraft stationed at an
 * air base do not intercept attacking aircraft." As the preview measures it
 * (runs/air_patrol_20260926T.jsonl): the patrol ON the struck tile answers
 * first, wounded or weaker; among the nearest the strongest Combat does; ties
 * go to the lower patrolled tile, then to the unit order. Each other covering
 * patrol lends +5 x its hp / 100 (+10 for two at full health, +7.5 with one
 * at 50 HP), summed over the hit points first so no order enters the double.
 */
export function interceptorAgainst(
  state: GameState, striker: Unit, tileIndex: number,
): { unit: Unit; support: number } | undefined {
  const at = state.map.tiles[tileIndex];
  if (!at) return undefined;
  let best: Unit | undefined;
  let bestD = 0;
  let bestS = 0;
  let hpSum = 0;
  for (const u of state.units) {
    if (u.patrol === undefined || !unitsHostile(state, striker, u)) continue;
    const p = state.map.tiles[u.patrol];
    const d = hexDistance(p.col, p.row, at.col, at.row);
    if (d > INTERCEPT_RANGE) continue;
    hpSum += u.hp;
    const s = UNITS[u.type]?.combat ?? 0;
    if (!best || d < bestD || (d === bestD && (s > bestS || (s === bestS && u.patrol < best.patrol!)))) {
      best = u;
      bestD = d;
      bestS = s;
    }
  }
  return best ? { unit: best, support: (INTERCEPT_SUPPORT_CS * (hpSum - best.hp)) / UNIT_HP } : undefined;
}

/**
 * PRIORITY TARGET (UNITCOMMAND_PRIORITY_TARGET). CIV6 (Air Strikes): "Air
 * units also have the Priority Target ability which allows them to attack
 * Support class units directly, without first having to eliminate the enemy
 * combat unit placed in the same location." The Support-class unit standing
 * on `tileIndex` that this aircraft may strike, or none; a hostile centre is
 * the city's to defend, as it is for every strike.
 */
export function priorityDefender(state: GameState, unit: Unit, tileIndex: number): Unit | undefined {
  if (!isAirUnit(unit.type)) return undefined;
  const holder = cityAtIndex(state, tileIndex);
  if (holder !== undefined && unitsHostile(state, unit, { seat: holder.holder.seat })) return undefined;
  return unitsAt(state, tileIndex).find((u) => unitStackSlot(u) === 'support'
    && unitsHostile(state, unit, u) && unitVisibleTo(state, u, unit.seat));
}

/** the PRIORITY TARGET head: tiles in operational range carrying a Support
 *  unit this aircraft may strike, tile index ascending, cut to width. */
export function priorityTargets(state: GameState, unit: Unit, width: number): number[] {
  const out: number[] = [];
  const here = state.map.tiles[unit.tileIndex];
  if (!here || !isAirUnit(unit.type)) return out;
  for (const t of state.map.tiles) {
    if (out.length >= width) break;
    if (t.index === unit.tileIndex) continue;
    if (hexDistance(here.col, here.row, t.col, t.row) > airRange(unit)) continue;
    if (priorityDefender(state, unit, t.index)) out.push(t.index);
  }
  return out;
}

/**
 * CIV6: "Should your airbase be pillaged, your aircraft stationed within will
 * scatter to nearby valid bases instead of being destroyed. If there are no
 * nearby valid bases, the aircraft will be destroyed." A sunk carrier takes
 * its aircraft down with it, so callers hand `scatter: false` there.
 */
export function displaceAirFrom(state: GameState, tileIndex: number, scatter = true): void {
  const here = airUnitsAt(state, tileIndex);
  if (here.length === 0) return;
  for (const plane of here) {
    let moved = false;
    if (scatter) {
      const from = state.map.tiles[plane.tileIndex];
      const bases = airBasesOf(state, plane.seat)
        .filter((t) => t !== tileIndex && airBaseFree(state, plane.seat, t))
        .map((t) => ({ t, d: hexDistance(from.col, from.row, state.map.tiles[t].col, state.map.tiles[t].row) }))
        .filter((b) => b.d <= rebaseRange(plane.type))
        .sort((a, b) => a.d - b.d || a.t - b.t);
      if (bases.length > 0) {
        plane.tileIndex = bases[0].t;
        moved = true;
      }
    }
    if (!moved) {
      const i = state.units.indexOf(plane);
      if (i >= 0) state.units.splice(i, 1);
    }
  }
}

/** a moving carrier takes its based aircraft along. */
export function carryAirWith(state: GameState, hull: Unit, from: number): void {
  if ((UNITS[hull.type]?.airSlots ?? 0) <= 0) return;
  for (const plane of state.units) {
    if (plane.seat === hull.seat && isAirUnit(plane.type) && plane.tileIndex === from) {
      plane.tileIndex = hull.tileIndex;
    }
  }
}

/**
 * CIV6 (Air combat): a strike reaches anything inside the aircraft's
 * OPERATIONAL RANGE, measured from its base. A FIGHTER's ranged damage is
 * "effective against land units, but not against cities and naval units"; a
 * BOMBER's bombard damage is "effective against cities and naval units but not
 * against land units".
 */
export function airRange(unit: { type: string; promos?: number }): number {
  return (UNITS[unit.type]?.ranged?.range ?? 0) + promoValue(unit, 'RANGE');
}

export function airStrikeReaches(state: GameState, unit: Unit, tileIndex: number): boolean {
  const a = state.map.tiles[unit.tileIndex];
  const b = state.map.tiles[tileIndex];
  if (!a || !b) return false;
  return hexDistance(a.col, a.row, b.col, b.row) <= airRange(unit);
}

/** CIV6 (Bomber): a bomber "may attack tile improvements and districts",
 *  and what it wrecks is what the ground verb wrecks — the Encampment and a
 *  city centre are the two districts a pillage never reaches. */
export function airPillageOffers(state: GameState, unit: Unit, tileIndex: number): boolean {
  const t = state.map.tiles[tileIndex];
  if (!t || UNITS[unit.type]?.air !== 'BOMBER') return false;
  if (!isTerritorial(tileSeat(t)) || !unitsHostile(state, unit, { seat: tileSeat(t) })) return false;
  if (t.improvement && !t.pillaged) return true;
  return t.district !== null && t.district !== 'CITY_CENTER' && t.district !== 'ENCAMPMENT'
    && !!t.districtComplete && !t.districtPillaged;
}

/** CIV6 (Air Strikes): a bomber wrecks a tile "at 50% health or higher" —
 *  measured at the line (runs/air_bomb50_20260926T.jsonl: pillaged at 51 and
 *  50 HP left, not at 49, 48, 46); (Superfortress): "No minimum health
 *  requirement to air pillage." */
export function airPillageFit(unit: Unit): boolean {
  return unit.hp * 2 >= UNIT_HP || promoFlag(unit, 'AIR_PILLAGE_ANY_HP');
}

export function airPillageTargets(state: GameState, unit: Unit, width: number): number[] {
  const out: number[] = [];
  const here = state.map.tiles[unit.tileIndex];
  if (!here || !isAirUnit(unit.type) || !airPillageFit(unit)) return out;
  for (const t of state.map.tiles) {
    if (t.index === unit.tileIndex) continue;
    if (hexDistance(here.col, here.row, t.col, t.row) > airRange(unit)) continue;
    if (airPillageOffers(state, unit, t.index)) out.push(t.index);
    if (out.length >= width) break;
  }
  return out;
}

/**
 * The tiles an air strike may be pointed at, ordered by TILE INDEX ascending
 * and cut to the head's width — the same rule the ring heads use, so both
 * engines agree on what column k means without shipping a list.
 */
export function airStrikeTargets(state: GameState, unit: Unit, width: number): number[] {
  const out: number[] = [];
  const here = state.map.tiles[unit.tileIndex];
  if (!here || !isAirUnit(unit.type)) return out;
  for (const t of state.map.tiles) {
    if (t.index === unit.tileIndex) continue;
    if (hexDistance(here.col, here.row, t.col, t.row) > airRange(unit)) continue;
    if (airStrikeOffers(state, unit, t.index)) out.push(t.index);
    if (out.length >= width) break;
  }
  return out;
}

/**
 * What `tileIndex` offers THIS aircraft. Which enemies STAND there, never
 * which one is first in the list: a list-order rule would let the two engines
 * point the same column at different tiles. A civilian is never an air
 * strike's target (`shootable`).
 */
export function airStrikeOffers(state: GameState, unit: Unit, tileIndex: number): boolean {
  const t = state.map.tiles[tileIndex];
  if (!t) return false;
  let land = false;
  let sea = false;
  for (const u of unitsAt(state, tileIndex)) {
    if (isAirUnit(u.type) || unitDomain(u.type) === 'civilian' || !unitsHostile(state, unit, u)) continue;
    if (!unitVisibleTo(state, u, unit.seat)) continue;
    if (UNITS[u.type]?.naval) sea = true;
    else land = true;
  }
  const holder = cityAtIndex(state, tileIndex);
  const centre = holder !== undefined && unitsHostile(state, unit, { seat: holder.holder.seat });
  return UNITS[unit.type]!.air! === 'BOMBER' ? (centre || sea) : (land && !centre);
}

/** this seat's own bases with room, ordered by tile index and cut to width. */
export function rebaseTargets(state: GameState, unit: Unit, width: number): number[] {
  return airBasesOf(state, unit.seat)
    .filter((t) => canRebaseTo(state, unit, t))
    .sort((a, b) => a - b)
    .slice(0, width);
}

export function antiAirOf(type: string): number {
  return UNITS[type]?.antiAir ?? 0;
}

/** CIV6 (Drone Air Defense): "Anti-Air Defense Strength increased to 130" —
 *  an increase TO a figure, so the upgrade replaces the chassis stat. */
export function antiAirAt(state: GameState, unit: { type: string; seat: number }): number {
  return gdrHas(state, unit, 'DRONE_AIR_DEFENSE') ? GDR_DRONE_AA : antiAirOf(unit.type);
}

/** CIV6 (Anti-Air Gun, Mobile SAM): "Provides cover from air attacks up to 1
 *  hex away from the weapon." -1 for a chassis that covers nothing, so a hull
 *  is admitted by the naval clause below and by nothing else. */
export function antiAirCover(type: string): number {
  return UNITS[type]?.antiAirRange ?? -1;
}

/** how far the widest weapon in the catalog reaches, so the scan below asks
 *  the data rather than a constant. */
export const AIR_COVER_MAX = Object.values(UNITS)
  .reduce((m, u) => Math.max(m, u.antiAirRange ?? 0), 0);

/** the STACK order a tile answers in, and the tie-break both engines share.
 *  SUPPORT is APPENDED, not inserted: the two anti-air chassis hold that slot
 *  and would otherwise answer no strike at all, and appending leaves every
 *  pair that already had an order exactly where it was. */
const COVER_SLOTS = ['military', 'civilian', 'embarked', 'support'] as const;

/**
 * The anti-air weapon that answers a strike at `tileIndex`, or none.
 *
 * Two CIV6 sentences meet here. A parked weapon "provides cover from air
 * attacks up to 1 hex away"; and separately, "the only exceptions to this rule
 * are SHIPS with the Anti-Air Strength stat - they have additional close-range
 * defenses, which activate when they are attacked by an aircraft", which is a
 * hull answering for its own hex alone. The strongest answer fires, ties going
 * to the lowest tile index and then to the tile's own occupancy order.
 */
export function airCoverAgainst(state: GameState, striker: Unit, tileIndex: number): Unit | undefined {
  const at = state.map.tiles[tileIndex];
  if (!at) return undefined;
  let best: Unit | undefined;
  let bestKey = [0, 0, 0];
  for (const t of tilesWithin(state.map, at.col, at.row, AIR_COVER_MAX)) {
    const d = hexDistance(at.col, at.row, t.col, t.row);
    for (const u of unitsAt(state, t.index)) {
      const aa = antiAirAt(state, u);
      if (aa <= 0 || !unitsHostile(state, striker, u)) continue;
      if (d > antiAirCover(u.type) && !(d === 0 && UNITS[u.type]?.naval)) continue;
      const slot = COVER_SLOTS.indexOf(unitStackSlot(u) as (typeof COVER_SLOTS)[number]);
      if (slot < 0) continue;
      const key = [aa, -t.index, -slot];
      if (!best || key[0] > bestKey[0]
        || (key[0] === bestKey[0] && (key[1] > bestKey[1]
          || (key[1] === bestKey[1] && key[2] > bestKey[2])))) {
        best = u;
        bestKey = key;
      }
    }
  }
  return best;
}

/**
 * What answers an air strike. CIV6: "the attacking unit's Ranged Strength will
 * be matched against the defending unit's Anti-Air Strength (even if its
 * Combat Strength is higher) or Combat Strength if it doesn't have any
 * Anti-Air Strength."
 */
export function airDefenseOf(
  state: GameState, unit: { type: string; seat: number; tileIndex?: number },
): number {
  const base = antiAirAt(state, unit) || (UNITS[unit.type]?.combat ?? 0);
  // CIV6 (Air Defense Initiative): "+25 Combat Strength to ANTI-AIR support
  // units within the city's territory when defending against aircraft and
  // ICBMs" — the governed city's own tiles, whoever stands on them, which is
  // the territory test Garrison Commander already uses. A unit with no
  // anti-air strength of its own is not an anti-air support unit and takes
  // nothing.
  if (unit.tileIndex === undefined || antiAirAt(state, unit) <= 0) return base;
  const t = state.map.tiles[unit.tileIndex];
  if (!t || tileSeat(t) !== unit.seat) return base;
  return base + governorTileSum(state, t, (e) => e.airDefenseCS);
}
