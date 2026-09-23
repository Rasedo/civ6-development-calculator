/**
 * THE TILES A UNIT WALKS TOWARD, as pure predicates over the state: a
 * Builder's and a Military Engineer's work, a Settler's founding sites, an
 * Archaeologist's digs, a Naturalist's park anchors, a Great Person's
 * activation sites, and what a unit at war marches on. Each answers per tile
 * and writes nothing; the verbs that act there re-validate on arrival.
 */
import type { City, GameState, Tile } from './types';
import { hexDistance, neighbors } from '../../world/hex';
import { isImpassable, isWater, naturalWonderAt } from '../../world/query';
import { CITY_MIN_DIST } from '../../world/types';
import { PLACEABLE_DISTRICTS } from '../data/districts';
import { GP_SITES, gpSiteOf } from '../data/greatPeople';
import { GW_KINDS, gwKindObjects } from '../data/greatWorks';
import { BARB_SEAT, campTiles, cityHolders, civsAtWar, hiddenResourcesFor, tileOwnedByCiv, tileSeat } from './seats';
import { computeUnlocks, type Unlocks } from './effects';
import { canBuildRoad, validImprovementsIn } from './rules';
import { engineerFinishCity } from './game';
import { artifactHome, digUnderfoot, parkCluster, parkClusterLegal, unitPassable } from './units';
import { gpPersonOf, gpSiteHolds } from './gpAbility';
import { gwHasRoom } from './greatWorks';

/** what every job test of one seat reads, built once per seat */
export interface JobCtx {
  seat: number;
  owns: (t: Tile) => boolean;
  unlocks: Unlocks;
  camps: ReturnType<typeof campTiles>;
  hidden: ReturnType<typeof hiddenResourcesFor>;
}

export function jobCtx(state: GameState, seat: number): JobCtx {
  return {
    seat,
    owns: (t: Tile) => tileOwnedByCiv(t, seat),
    unlocks: computeUnlocks(state, seat),
    camps: campTiles(state),
    // `_plane_seen`: an unseen strategic is plain ground
    hidden: hiddenResourcesFor(state, seat),
  };
}

/** A Builder has work here: an owned tile that is pillaged, holds a
 *  pillaged district, or is bare and takes an improvement the seat has
 *  unlocked. The repair arms take ANY owned pillaged tile or district (a
 *  pillaged Harbor repairs from its own water tile), and the improve arm
 *  asks no water question of its own: `validImprovementsIn` decides which
 *  ground carries what. */
export function builderJobAt(state: GameState, ctx: JobCtx, t: Tile): boolean {
  return ctx.owns(t)
    && (t.pillaged || t.districtPillaged
      || (!t.improvement && validImprovementsIn(t, {
        unlocks: ctx.unlocks, ownsTile: ctx.owns, map: state.map, camps: ctx.camps, hidden: ctx.hidden,
      }).length > 0));
}

/** A Military Engineer has work here: a road it may lay, an engineer
 *  improvement site, or a 20%-charge site (a queued AQUEDUCT/CANAL/DAM dig
 *  or the Flood Barrier's centre). */
export function engineerJobAt(state: GameState, ctx: JobCtx, t: Tile): boolean {
  return canBuildRoad(t, ctx.owns)
    || validImprovementsIn(t, {
      unlocks: ctx.unlocks, ownsTile: ctx.owns, map: state.map, camps: ctx.camps, hidden: ctx.hidden,
      builder: 'MILITARY_ENGINEER',
    }).length > 0
    || engineerFinishCity(state, ctx.seat, t.index) !== undefined;
}

/** A Builder of this seat would find work somewhere. */
export function builderHasJob(state: GameState, seat: number): boolean {
  const ctx = jobCtx(state, seat);
  return state.map.tiles.some((t) => builderJobAt(state, ctx, t));
}

/** A Military Engineer of this seat would find work somewhere. */
export function engineerHasJob(state: GameState, seat: number): boolean {
  const ctx = jobCtx(state, seat);
  return state.map.tiles.some((t) => engineerJobAt(state, ctx, t));
}

/** The CENTRE tiles of every living major city not following this seat's
 *  religion, ascending (a centre is listed once). */
export function spreadSites(state: GameState, seat: number): number[] {
  const out = new Set<number>();
  for (const s of state.seats) {
    for (const c of s.cities) if (c.followedReligion !== seat) out.add(c.centerIndex);
  }
  return [...out].sort((a, b) => a - b);
}

/** A Settler walks here to found: unowned, settleable ground (land,
 *  passable, no natural wonder, no oasis), bare of district and wonder, at
 *  least CITY_MIN_DIST from every city centre on the map (a Free City's
 *  included) and every city-state centre — `canFoundCity`'s terms, except
 *  that the walk takes unowned ground only. */
export function foundSites(state: GameState): number[] {
  const centres: Tile[] = [
    ...cityHolders(state).flatMap((s) => s.cities).map((c) => state.map.tiles[c.centerIndex]),
    ...(state.cityStates ?? []).map((cs) => state.map.tiles[cs.centerIndex]),
  ];
  const out: number[] = [];
  for (const t of state.map.tiles) {
    if (tileSeat(t) >= 0 || isWater(t) || isImpassable(t) || naturalWonderAt(t) || t.feature === 'OASIS') continue;
    if (t.district || t.builtWonder) continue;
    if (centres.some((c) => hexDistance(c.col, c.row, t.col, t.row) < CITY_MIN_DIST)) continue;
    out.push(t.index);
  }
  return out;
}

/** An Archaeologist walks here to excavate: a dig it may work underfoot
 *  (`digUnderfoot`) on unowned or own ground, while some city of the seat
 *  has an Artifact slot open (`artifactHome`). */
export function digSites(state: GameState, seat: number): number[] {
  if (!artifactHome(state, seat)) return [];
  return state.map.tiles
    .filter((t) => (tileSeat(t) < 0 || tileSeat(t) === seat) && digUnderfoot(state, t, seat) !== null)
    .map((t) => t.index);
}

/** The tiles that ANCHOR a legal National Park rhombus for this seat
 *  (`parkClusterLegal` on any cluster the tile anchors). */
export function parkSites(state: GameState, seat: number): number[] {
  return state.map.tiles
    .filter((t) => neighbors(state.map, t).some((nb) => parkClusterLegal(state, parkCluster(state, t.index, nb.index), seat)))
    .map((t) => t.index);
}

/** A person's activation site as the wire names it: its `GP_SITES` code and
 *  its site district's `PLACEABLE_DISTRICTS` index (-1 none). */
export function gpSiteKey(unit: { type: string; gpAt?: number }): [number, number] | undefined {
  const person = gpPersonOf(unit);
  if (!person) return undefined;
  const { site, district } = gpSiteOf(person);
  return [GP_SITES.indexOf(site), PLACEABLE_DISTRICTS.indexOf(district)];
}

/** The tiles a person of this seat walks toward for site key (site, arg).
 *  Answered per SITE, not per person: the `gwSlot` arm takes a city with an
 *  open slot for any created kind, and the `adjacentBarbarian` arm only
 *  ground a unit may stand on. Never site 1 (`anywhere`): nothing to walk to. */
export function gpSiteTiles(state: GameState, seat: number, site: number, arg: number): number[] {
  const code = GP_SITES[site];
  const district = PLACEABLE_DISTRICTS[arg];
  const roomMemo = new Map<number, boolean>();
  const room = (city: City): boolean => {
    let r = roomMemo.get(city.id);
    if (r === undefined) {
      r = false;
      for (let k = 0; k < GW_KINDS && !r; k++) r = gwKindObjects(k).some((o) => gwHasRoom(state, city, o));
      roomMemo.set(city.id, r);
    }
    return r;
  };
  return state.map.tiles
    .filter((t) => gpSiteHolds(state, seat, code, district, t, room)
      && (code !== 'adjacentBarbarian' || unitPassable(t)))
    .map((t) => t.index);
}

/** What a unit at war marches on first: an unpillaged improvement, or a
 *  complete unpillaged district (never a city centre), on ground owned by a
 *  major or city-state this seat is at war with. */
export function warImpSites(state: GameState, seat: number): number[] {
  return state.map.tiles.filter((t) => {
    const ts = tileSeat(t);
    if (ts < 0 || ts >= BARB_SEAT || !civsAtWar(state, seat, ts)) return false;
    return (!!t.improvement && !t.pillaged)
      || (!!t.district && t.district !== 'CITY_CENTER' && t.districtComplete && !t.districtPillaged);
  }).map((t) => t.index);
}

/** Every living city of every holder this seat is at war with, as
 *  [seat id, centre], ascending: the majors' and the Free Cities' cities,
 *  and each city-state's one city. */
export function warCitySites(state: GameState, seat: number): number[][] {
  const out: number[][] = [];
  for (const h of cityHolders(state)) {
    if (civsAtWar(state, seat, h.seat)) for (const c of h.cities) out.push([h.seat, c.centerIndex]);
  }
  for (const cs of state.cityStates ?? []) {
    if (civsAtWar(state, seat, cs.seat)) out.push([cs.seat, cs.centerIndex]);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
