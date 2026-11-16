/**
 * THE CULTURE AI'S PARK SITE (GameCore_XP2 AI/CultureAi.cpp, the AI's turn
 * 0x620110 at 0x620ef6; `tools/civ6lab/dll_readings.md` "C-98: a park unit's
 * value"). Each turn the culture AI lists the National Parks its player could
 * designate (Game_NationalParks 0x32fdb0) and orders them by their Tourism
 * (0x3302f0); the unit value (0x7b62c0) reads the first entry for a unit
 * with ParkCharges, and the count of the player's units that carry them.
 *
 * A SITE is a plot P with the three plots over it — its NORTHWEST and
 * NORTHEAST neighbours and the NORTHEAST neighbour of the NORTHWEST one — each
 * of them (0x330720) owned by the player, bare of improvement and district,
 * in no park, and a mountain, a natural wonder or of Appeal 2 or more; the
 * four owned by one city (0x32fdb0 at 0x32ffe5) and not all impassable
 * (0x330530). The list keeps the sites in falling Appeal sum, a site
 * dropped where it stands within one plot of a kept one or two rows from it
 * in its column, so its first entry is the site of the greatest Appeal sum,
 * the first in plot order among equals. A site's Tourism is its four plots'
 * Appeal summed (0x3302f0, before its owner's park percent, player +0x1b24,
 * and Tourism percent, PlayerCulture +0x1548).
 */
import { DIRECTION_TYPES, hexDistance, neighborTile } from '../../world/hex';
import { isImpassable, isMountain, naturalWonderAt } from '../../world/query';
import type { Tile } from '../../world/types';
import { AI_UNITS } from '../data/aiBuildTables';
import { gameTypeOf } from '../data/aliases';
import { PARK_AMENITY_CITIES, PARK_MIN_APPEAL } from '../data/improvements';
import { tileAppeal } from './appeal';
import { cityAppealResolver } from './governors';
import { campTiles, citiesOf, tileSeat, unitsOf } from './seats';
import type { GameState } from './types';

/** the DLL's DirectionTypes of a site's upper plots */
const NORTHEAST = DIRECTION_TYPES[0];
const NORTHWEST = DIRECTION_TYPES[5];

/** The culture AI's first park site */
export interface AiParkSite {
  /** the site's lowest plot */
  plot: number;
  /** its four plots' Appeal, summed */
  tourism: number;
  /** the city that owns the four plots */
  cityId: number;
  /** the player's other cities a park there pays an Amenity, the nearest to
   *  the plot first, NATIONAL_PARK_NUM_OTHER_AMENITY_CITIES at most (0x32f6b0) */
  near: number[];
}

/** 0x32fdb0's first entry for `seat`, null where it lists none */
export function aiParkSite(state: GameState, seat: number): AiParkSite | null {
  const { map } = state;
  let camps: ReadonlySet<number> | undefined;
  let owners: ReturnType<typeof cityAppealResolver> | undefined;
  const appeals = new Map<number, number>();
  const appeal = (t: Tile): number => {
    let a = appeals.get(t.index);
    if (a === undefined) appeals.set(t.index, (a = tileAppeal(map, t, camps ??= campTiles(state), owners ??= cityAppealResolver(state))));
    return a;
  };
  // a city-state's centre is a district no plot names
  const centres = new Set((state.cityStates ?? []).map((cs) => cs.centerIndex));
  const valid = (t: Tile | null): t is Tile => !!t && tileSeat(t) === seat && !t.improvement && !t.district && !t.builtWonder
    && !centres.has(t.index) && (t.park ?? -1) < 0 && (isMountain(t) || !!naturalWonderAt(t) || appeal(t) >= PARK_MIN_APPEAL);
  let best: { p: Tile; sum: number } | null = null;
  for (const p of map.tiles) {
    if (!valid(p)) continue;
    const a = neighborTile(map, p, NORTHWEST);
    const b = neighborTile(map, p, NORTHEAST);
    const c = a ? neighborTile(map, a, NORTHEAST) : null;
    if (!valid(a) || !valid(b) || !valid(c)) continue;
    if (a.ownerCity !== p.ownerCity || b.ownerCity !== p.ownerCity || c.ownerCity !== p.ownerCity) continue;
    if (isImpassable(p) && isImpassable(a) && isImpassable(b) && isImpassable(c)) continue;
    const sum = appeal(p) + appeal(a) + appeal(b) + appeal(c);
    if (!best || sum > best.sum) best = { p, sum };
  }
  if (!best) return null;
  const at = best.p;
  const near = citiesOf(state, seat).filter((c) => c.id !== at.ownerCity)
    .map((c) => ({ id: c.id, d: hexDistance(map, map.tiles[c.centerIndex].col, map.tiles[c.centerIndex].row, at.col, at.row) }))
    .sort((x, y) => x.d - y.d).slice(0, PARK_AMENITY_CITIES).map((c) => c.id);
  return { plot: at.index, tourism: best.sum, cityId: at.ownerCity, near };
}

const PARK_UNITS = new Set(AI_UNITS.filter((u) => u.parkCharges > 0).map((u) => u.type));

/** the player's units of a type with ParkCharges (the culture AI's count,
 *  +0x6f8, 0x620110 at 0x621060..0x6211ff) */
export function aiParkUnits(state: GameState, seat: number): number {
  return unitsOf(state, seat).filter((u) => PARK_UNITS.has(gameTypeOf('unit', u.type, 'UNIT_'))).length;
}
