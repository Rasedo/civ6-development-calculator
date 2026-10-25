
import type { GameState, Tile } from './types';
import type { GameMap } from '../../world/types';
import { citiesOf, civOf, isBarbSeat, isCityStateSeat, isCiv, leaderOf, majorsAlive, majorsMet, seatOf, seatsAllied, setMetTurnWith, tileSeat, unitsOf } from './seats';
import { hasMet, meetCityState, suzerainOf } from './cityStates';
import { boostOnEvent } from './boosts';
import { metAllMajorsMoment } from './eras';
import { ALLIANCE_SHARED_VIS_ROWS, rowIsFor } from '../data/civilizations';
import { neighbors, tilesWithin, hexDistance, cubeNorm, tileAt } from '../../world/hex';
import { naturalWonderAt } from '../../world/query';
import { dedicationEvent } from './eras';
import { promoValue, promoFlag } from './promotions';
import { ELEVATION_SIGHT, FEATURE_SIGHT_THROUGH } from '../data/sight';
import { DED_DRACONES, DRACONES_DISCOVERY_SCORE } from '../data/seats';
import { UNITS } from '../data/units';
import { gpPermOf } from '../data/greatPeople';
import { suzerainWonderRelics } from './cityStates';
import { createRelic } from './greatWorks';

export const SIGHT_RANGE = 2;

/** How far this chassis SEES: `SIGHT_RANGE` unless the row names its own (the
 *  Destroyer's "Has Sight of 3"), plus what CIV6 (Spyglass / Rutter /
 *  Observation) calls "+1 sight range". Reveal Stealth reaches exactly here. */
export function unitSight(u: { type: string; promos?: number; seat?: number }, state?: GameState): number {
  // CIV6 (Leif Erikson): "+1 sight range for all naval units" of the owner,
  // permanent — read only where the caller has the state to name the owner.
  const leif = state !== undefined && u.seat !== undefined && UNITS[u.type]?.naval
    ? gpPermOf(seatOf(state, u.seat), 'navalSight') : 0;
  return (UNITS[u.type]?.sight ?? SIGHT_RANGE) + promoValue(u, 'SIGHT') + leif;
}

/** The height a tile puts in the way of a look ACROSS it — CIV6
 *  (SightThroughModifier, the DLL's 0x58d1c0): its terrain's plus its
 *  feature's; `seeThrough` (Sentry's CanSee) drops the feature half. */
export function sightThrough(t: Tile, seeThrough: boolean): number {
  const feat = seeThrough || t.feature === null ? 0 : (FEATURE_SIGHT_THROUGH[t.feature] ?? 0);
  return (ELEVATION_SIGHT[t.elevation] ?? 0) + feat;
}

/** The height an eye stands at (the DLL's 0x58af70): its terrain's
 *  SightModifier (hills 1, mountain 2), and 1 on a city centre or on a
 *  complete, unpillaged district with ZOC and HitPoints (the Encampment and
 *  its replacements; District_Instance 0x24c2f0). */
export function eyeHeight(t: Tile): number {
  if (t.district === 'CITY_CENTER' || (t.district === 'ENCAMPMENT' && t.districtComplete && !t.districtPillaged)) return 1;
  return ELEVATION_SIGHT[t.elevation] ?? 0;
}

/** the axial steps (dq, dr) of the walk's six directions, the next
 *  direction at a ring's corner, and per direction a plot was reached by
 *  the two neighbours its look is carried from (the DLL's tables at
 *  0xeff670 / 0xeff688 / 0xeff6a0 and its six-way switch) */
const WALK_DQ = [0, 1, 1, 0, -1, -1];
const WALK_DR = [1, 0, -1, -1, 0, 1];
const WALK_NEXT = [1, 2, 3, 4, 5, 0];
const WALK_PARENTS: readonly (readonly [number, number])[] = [[1, 2], [3, 2], [3, 4], [4, 5], [5, 0], [1, 0]];
/** a plot's carried height holds this bit when the line ran between its two
 *  parents and the higher one stood above it */
const SPLIT = 0x1000000;
/** the walk's tie margin: 0.05 in 24.8 fixed point */
const LINE_TIE = 12;

/**
 * THE GAME'S LINE OF SIGHT (Unit_Sight 0x58b1d0): the plots an eye on
 * `from` sees within `radius`, `from` included. The walk goes ring by ring
 * out from the eye (each ring from one step in direction 0 past the last,
 * along its six sides), and carries to every plot the highest height met on
 * its way in: the plot's own (`sightThrough`) or its parent's carried one,
 * whichever is higher. A plot's parent is one of the two neighbours on the
 * ring inside (`WALK_PARENTS`, by the direction the walk reached it; a
 * neighbour off the map or not on that ring is none): the one nearer the
 * line from the eye's centre to the plot's (24.8 fixed point, a row's odd
 * plots half a plot east, the coordinates as wrapped), and both where the
 * two lie within 0.05 of each other — then the lower carries and the plot
 * is marked split when the higher stood above it; a split parent gives way
 * to the other. The plot shows when the parent's carried height is below
 * its own or no higher than the eye (`eyeHeight`). Sentry (`seeThrough`)
 * drops every feature's height, the plot's own included.
 */
export function losDisk(map: GameMap, from: Tile, radius: number, seeThrough: boolean): Set<number> {
  const eye = eyeHeight(from);
  const ox = from.col, oy = from.row;
  const carried = new Map<number, number>([[from.index, 0]]);
  const out = new Set<number>([from.index]);
  const plotAt = (x: number, y: number, dq: number, dr: number): Tile | null => {
    const nx = x + dq - (y >> 1) + ((y + dr) >> 1);
    const ny = y + dr;
    return tileAt(map, nx, ny);
  };
  const fx = (t: Tile) => t.col * 256 + (t.row & 1 ? 128 : 0);
  const fmul = (a: number, b: number) => Math.floor((a * b) / 256);
  let q = 0, r = 0, dir = 1;
  for (let ring = 1; ring <= radius; ring++) {
    q += WALK_DQ[0];
    r += WALK_DR[0];
    dir = 1;
    for (let i = 0; i < 6 * ring; i++) {
      if (i > 0) {
        let nq = q + WALK_DQ[dir], nr = r + WALK_DR[dir];
        if (cubeNorm(nq, nr) > ring) {
          dir = WALK_NEXT[dir];
          nq = q + WALK_DQ[dir];
          nr = r + WALK_DR[dir];
        }
        q = nq;
        r = nr;
      }
      const cur = plotAt(ox, oy, q, r);
      if (!cur) continue;
      const par: (Tile | null)[] = [null, null];
      const h = [-1, -1];
      const split = [false, false];
      for (let k = 0; k < 2; k++) {
        const d = WALK_PARENTS[dir][k];
        const p = plotAt(cur.col, cur.row, WALK_DQ[d], WALK_DR[d]);
        if (!p || hexDistance(map, ox, oy, p.col, p.row) !== ring - 1) continue;
        par[k] = p;
        let v = carried.get(p.index) ?? 0;
        if (v >= SPLIT) {
          v -= SPLIT;
          split[k] = true;
        }
        h[k] = v;
      }
      const own = sightThrough(cur, seeThrough);
      const [h1, h2] = h;
      // 1: the first parent carries, 2: the second (or the first, should the
      // second be none or split), 0: both
      let use: 0 | 1 | 2;
      if (h1 === -1) use = 2;
      else if (h2 === -1 || h1 === h2) use = split[0] ? 2 : 1;
      else if (split[0]) use = 2;
      else if (split[1]) use = 1;
      else {
        const OX = fx(from), OY = oy * 256, CX = fx(cur), CY = cur.row * 256;
        const A = CY - OY, B = OX - CX, C = fmul(CX, OY) - fmul(CY, OX);
        const d1 = Math.abs(fmul(A, fx(par[0]!)) + fmul(B, par[0]!.row * 256) + C);
        const d2 = Math.abs(fmul(A, fx(par[1]!)) + fmul(B, par[1]!.row * 256) + C);
        use = d1 - d2 > LINE_TIE ? 2 : d2 - d1 > LINE_TIE ? 1 : 0;
      }
      let x: number;
      if (use === 0) {
        x = Math.min(h1, h2);
        carried.set(cur.index, Math.max(h1, h2) > own ? Math.max(x, own) + SPLIT : own);
      } else {
        x = use === 1 ? h1 : h2 !== -1 && !split[1] ? h2 : h1 !== -1 ? h1 : h2;
        carried.set(cur.index, Math.max(own, x));
      }
      if (x !== -1 && (x < own || x <= eye)) out.add(cur.index);
    }
  }
  return out;
}

/** A look cut by the line of sight (`losDisk`): Sentry's `seeThrough`. */
export interface Look {
  seeThrough: boolean;
}

/** Can an eye standing on `from` see `to` (`losDisk` out to `to`'s ring)?
 *  The range is the caller's; a hill adds height and never reach. */
export function canSee(map: GameMap, from: Tile, to: Tile, seeThrough: boolean): boolean {
  if (from.index === to.index) return true;
  return losDisk(map, from, hexDistance(map, from.col, from.row, to.col, to.row), seeThrough).has(to.index);
}

/** CIV6 (Sentry, the install's SENTRY_SEE_THROUGH_FEATURES row, CanSee): this unit's look
 *  counts no feature's height. */
export function unitSeesThrough(u: { type: string; promos?: number }): boolean {
  // Sentry's CanSee, or CIV6 (Ngao Mbeba) the chassis's own
  return promoFlag(u, 'SEE_THROUGH') || !!UNITS[u.type]?.seesThrough;
}

/** A CITY-STATE'S UNIT STANDS on `tileIndex` and looks: the plots the look
 *  takes in join the minor's revealed plots (`CityState.revealed`, the
 *  player's +0x2f0 the visibility count change 0x508d50 writes), which its
 *  units' planning reads; every major one of whose plots, or of whose units,
 *  the look takes in meets the minor, and so does every major that sees the
 *  plot (`seatSeesPlot`; runs/h1_duelw1124 t28: Cardiff's Warrior steps two
 *  plots from China's Scout, which sees it) — `meetCityState`, the majors in
 *  seat order. */
function minorLook(state: GameState, seat: number, tileIndex: number, radius: number, los: Look): void {
  const cs = state.cityStates.find((c) => c.seat === seat);
  if (!cs) return;
  const t = state.map.tiles[tileIndex];
  const majorUnits = new Set<string>();
  for (const u of state.units) if (isCiv(u.seat)) majorUnits.add(`${u.tileIndex}:${u.seat}`);
  const seen = new Set<number>();
  const sees = losDisk(state.map, t, radius, los.seeThrough);
  const revealed = (cs.revealed ??= new Array<number>(state.map.tiles.length).fill(0));
  for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
    if (!sees.has(n.index)) continue;
    revealed[n.index] = 1;
    const owner = tileSeat(n);
    if (isCiv(owner)) seen.add(owner);
    for (const s of state.seats) if (majorUnits.has(`${n.index}:${s.seat}`)) seen.add(s.seat);
  }
  for (const s of state.seats) {
    if (hasMet(cs, s.seat)) continue;
    if (seen.has(s.seat) || seatSeesPlot(state, s.seat, t)) meetCityState(state, cs, s.seat);
  }
}

/** a major that has met every other living major (`majorsAlive`) */
function metEveryMajor(state: GameState, seat: number): boolean {
  return majorsAlive(state).every((o) => o === seat || majorsMet(state, seat, o));
}

/**
 * TWO MAJORS MEET (the players manager's meet 0x484ab0): the pair's meeting
 * turn; each side's BOOST_TRIGGER_MEET_CIV rows (runs/h1_duelw1114 t15, 1130
 * t11: both majors' Writing boosted the turn they met); then each that has
 * now met every living major records PLAYER_MET_ALL_MAJORS, the
 * FIRST_IN_WORLD row where no major had met them all before this meeting
 * (1121 t127: Rome and China, 5 each).
 */
export function meetMajors(state: GameState, a: number, b: number): void {
  if (a === b || !isCiv(a) || !isCiv(b) || majorsMet(state, a, b)) return;
  const first = !majorsAlive(state).some((s) => metEveryMajor(state, s));
  setMetTurnWith(state, a, b, state.turn);
  for (const s of [a, b]) boostOnEvent(state, s, 'MEET_CIV');
  for (const s of [a, b]) if (metEveryMajor(state, s)) metAllMajorsMoment(state, s, first);
}

/**
 * A MAJOR'S LOOK MEETS THE MAJORS it takes in — a plot of theirs or a unit of
 * theirs on a plot the look reaches (the visibility manager 0x50d390 on a
 * plot coming into view: 0x524890 meets its owner, 0x5249c0 the owner of a
 * unit on it) — and, where the look is its own unit's stepping there
 * (`placed`), every major that sees the plot it stands on (the unit's
 * placement 0x586d40 -> 0x5246f0: each player whose visibility count of the
 * plot is above 0). The majors in seat order (`meetMajors`).
 */
function majorLookMeets(state: GameState, seat: number, tileIndex: number, radius: number, los: Look | undefined,
                        placed: boolean): void {
  const t = state.map.tiles[tileIndex];
  const others = state.seats.filter((s) => s.seat !== seat && isCiv(s.seat) && !majorsMet(state, seat, s.seat));
  if (!others.length) return;
  const units = new Set<string>();
  for (const u of state.units) if (isCiv(u.seat) && u.seat !== seat) units.add(`${u.tileIndex}:${u.seat}`);
  const seen = new Set<number>();
  const sees = los ? losDisk(state.map, t, radius, los.seeThrough) : null;
  for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
    if (sees && !sees.has(n.index)) continue;
    const owner = tileSeat(n);
    if (isCiv(owner) && owner !== seat) seen.add(owner);
    for (const s of others) if (units.has(`${n.index}:${s.seat}`)) seen.add(s.seat);
  }
  for (const s of others) {
    if (seen.has(s.seat) || (placed && seatSeesPlot(state, s.seat, t))) meetMajors(state, seat, s.seat);
  }
}

/** Does a major see the plot now (`plotsSeenNow` for one seat, at one plot):
 *  a unit of its whose sight reaches it, a city centre of its within two, a
 *  plot of its beside it or the plot itself — and what each city-state it
 *  is suzerain of sees so (`majorLook`). */
function seatSeesPlot(state: GameState, seat: number, t: Tile): boolean {
  const { map } = state;
  const eyes = [seat, ...state.cityStates.filter((cs) => suzerainOf(cs) === seat).map((cs) => cs.seat)];
  if (tileSeat(t) >= 0 && eyes.includes(tileSeat(t))) return true;
  if (neighbors(map, t).some((n) => eyes.includes(tileSeat(n)))) return true;
  const centres = [...citiesOf(state, seat).map((c) => c.centerIndex),
    ...state.cityStates.filter((cs) => suzerainOf(cs) === seat && cs.centerIndex >= 0).map((cs) => cs.centerIndex)];
  for (const c of centres) {
    const ct = map.tiles[c];
    if (hexDistance(map, ct.col, ct.row, t.col, t.row) <= 2) return true;
  }
  for (const u of state.units) {
    if (!eyes.includes(u.seat)) continue;
    const from = map.tiles[u.tileIndex];
    if (hexDistance(map, from.col, from.row, t.col, t.row) <= unitSight(u, state) && canSee(map, from, t, unitSeesThrough(u))) return true;
  }
  return false;
}

/** THE PLOTS A CITY-STATE SEES NOW (its visibility count above 0, the
 *  plots the knowledge base's update walks, 0x7877e0 over player +0x290):
 *  `seatSeesPlot`'s eyes for the minor alone — its plots and those beside
 *  them, the plots within two of its centre, and each of its units' look
 *  (`unitSight`, cut by `losDisk`). */
export function cityStateSight(state: GameState, seat: number): Uint8Array {
  const { map } = state;
  const out = new Uint8Array(map.tiles.length);
  for (const t of map.tiles) {
    if (tileSeat(t) !== seat) continue;
    out[t.index] = 1;
    for (const n of neighbors(map, t)) out[n.index] = 1;
  }
  const cs = state.cityStates.find((c) => c.seat === seat);
  if (cs && cs.centerIndex >= 0) {
    const c = map.tiles[cs.centerIndex];
    for (const n of tilesWithin(map, c.col, c.row, 2)) out[n.index] = 1;
  }
  for (const u of state.units) {
    if (u.seat !== seat) continue;
    const from = map.tiles[u.tileIndex];
    for (const n of losDisk(map, from, unitSight(u, state), unitSeesThrough(u))) out[n] = 1;
  }
  return out;
}

/** A NEW SUZERAIN'S LOOK: the plots city-state `minor` has revealed
 *  (`CityState.revealed`) and those it sees now (`cityStateSight`) revealed
 *  to major `seat`. */
export function suzerainSight(state: GameState, minor: number, seat: number): void {
  if (!state.fogOfWar) return;
  const s = seatOf(state, seat);
  if (!s) return;
  if (s.explored.length === 0) s.explored = new Array(state.map.tiles.length).fill(0);
  const seen = cityStateSight(state, minor);
  const known = state.cityStates.find((c) => c.seat === minor)?.revealed;
  for (let i = 0; i < seen.length; i++) if (seen[i] || known?.[i] === 1) s.explored[i] = 1;
}

export function fogActive(state: GameState): boolean {
  return state.unitsMode && state.fogOfWar;
}

export function isExplored(state: GameState, seat: number, tileIndex: number): boolean {
  if (!fogActive(state)) return true;
  const ex = seatOf(state, seat)?.explored;
  return !ex || ex.length === 0 || ex[tileIndex] === 1;
}

/** `los` names a UNIT's look: the disk is cut by `losDisk` from `tileIndex`
 *  (ask 11). A city's or a claimed tile's reveal passes none and lifts the
 *  whole disk — the live game was measured for units alone. */
export function revealAround(
  state: GameState,
  seat: number,
  tileIndex: number,
  radius = SIGHT_RANGE,
  los?: Look,
): void {
  if (!state.fogOfWar) return;
  // the barbarians' revealed plots (the player's +0x2f0), which their units'
  // planning and their target list read: the write alone
  if (isBarbSeat(seat)) {
    liftFog(state, seat, tileIndex, radius, los);
    return;
  }
  // A city-state's unit's look meets the majors it takes in: a plot of
  // theirs or a unit of theirs standing on it (runs/h1_duelw1124 t10:
  // Granada's Warrior steps beside Xi'an's coast and China's Builder, and
  // China's first meeting's envoy lands before the minor's next move). Its
  // suzerain sees what it sees (`majorLook`).
  if (isCityStateSeat(seat)) {
    if (los) minorLook(state, seat, tileIndex, radius, los);
    const cs = state.cityStates.find((c) => c.seat === seat);
    const suz = cs ? suzerainOf(cs) : -1;
    if (isCiv(suz)) majorLook(state, suz, tileIndex, radius, los, false);
    return;
  }
  // MAJOR seats only: nothing reads a city-state's fog,
  // so tracking it would be write-only state (and a digest liability).
  if (!isCiv(seat)) return;
  majorLook(state, seat, tileIndex, radius, los, !!los);
}

/**
 * A MAJOR'S LOOK: its own unit's, city's or claimed plot's, or a city-state's
 * it is suzerain of (the suzerain sees what the city-state sees:
 * runs/h1_duelw1124 t89, Rome's Warrior steps beside Bologna's, and China,
 * Bologna's suzerain, meets Rome; t90, China's revealed plots take in the
 * sight of Granada's unit at (39,17)). `placed`: its own unit stepping there.
 */
function majorLook(state: GameState, seat: number, tileIndex: number, radius: number, los: Look | undefined,
                   placed: boolean): void {
  const { found, wonders } = liftFog(state, seat, tileIndex, radius, los);
  // A city-state is MET the moment this look takes in a plot of its
  // territory or a unit of its, in the move that does (runs/h1_duelw1121 t6:
  // Rome's Scout two plots from Antananarivo's border, three from its
  // centre, met it — the first meeting's envoy in record t7; t33: Rome's
  // Warrior two plots from Ayutthaya's Warrior, six from its border; 1127
  // t15: Rome's Warrior two from Muscat's)
  if (state.cityStates.length) {
    const t = state.map.tiles[tileIndex];
    const minorUnits = new Map<number, number>();
    for (const u of state.units) if (isCityStateSeat(u.seat) && !minorUnits.has(u.tileIndex)) minorUnits.set(u.tileIndex, u.seat);
    const sees = los ? losDisk(state.map, t, radius, los.seeThrough) : null;
    for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
      const owner = tileSeat(n);
      const unitOwner = minorUnits.get(n.index);
      if ((!isCityStateSeat(owner) && unitOwner === undefined) || (sees && !sees.has(n.index))) continue;
      for (const o of [owner, unitOwner]) {
        const cs = o !== undefined && isCityStateSeat(o) ? state.cityStates.find((c) => c.seat === o) : undefined;
        if (cs && !hasMet(cs, seat)) meetCityState(state, cs, seat);
      }
    }
  }
  majorLookMeets(state, seat, tileIndex, radius, los, placed);
  // CIV6 (Hic Sunt Dracones, dark face): "+3 Era Score each time you discover
  // a new Continent or natural wonder" — no continent's discovery is tracked,
  // so wonders are the whole event.
  if (found > 0) dedicationEvent(state, seat, DED_DRACONES, DRACONES_DISCOVERY_SCORE * found);
  // CIV6 (Kandy): a Relic for each natural wonder first revealed
  if (wonders > 0) {
    const relics = wonders * suzerainWonderRelics(state, seat);
    for (let i = 0; i < relics; i++) createRelic(state, seat);
  }
  // CIV6 (Poundmaker): "...all alliances provide shared visibility" — an ally
  // sees what this seat uncovers, and the clause is MUTUAL, so either side
  // carrying it opens both. The discovery EVENT above is the discoverer's
  // alone: an ally SHOWN a natural wonder earns no era score for it, which is
  // why the fog write and the event are separated here.
  if (!ALLIANCE_SHARED_VIS_ROWS.length) return;
  for (const o of state.seats) {
    if (o.seat === seat || !isCiv(o.seat)) continue;
    if (!seatsAllied(state, seat, o.seat)) continue;
    if (!sharesVisWithAllies(state, seat) && !sharesVisWithAllies(state, o.seat)) continue;
    liftFog(state, o.seat, tileIndex, radius, los);
  }
}

/** A CITY'S LOOK where it is founded or changes hands, once its plots are
 *  its own: each plot of the city and the six beside it (the plot owner's
 *  write SetOwner 0x84760 raises the new owner's visibility of the plot and
 *  of each plot beside it, no line of sight) — a founding's centre and first
 *  ring give the plots two round the centre. Nothing three out: the records'
 *  foundings on a plot the Settler already stood on (runs/h1_duelw1103-1131,
 *  193 plots three from the centre that no unit revealed) leave every one
 *  dark, the line clear or not (1117 t1 Rome at (12,19): (12,16) across flat
 *  ground; 1127 Xi'an (13,9), 1121 Rome (33,11) and (34,11)); the plots three
 *  out a founding shows after a step are the Settler's own look
 *  (BaseSightRange 3) from the centre. */
export function cityLook(state: GameState, seat: number, centre: number): void {
  const city = state.map.tiles[centre].ownerCity;
  for (const t of state.map.tiles) {
    if (t.ownerSeat === seat && t.ownerCity === city) revealAround(state, seat, t.index, 1);
  }
}

/** Does this seat's roster row make its ALLIANCES share map visibility?
 *  Read off the rows directly rather than through `getModifiers`, so the fog
 *  walk — which runs on every unit step — pulls in none of the effect stack. */
function sharesVisWithAllies(state: GameState, seat: number): boolean {
  const civ = civOf(state, seat);
  const leader = leaderOf(state, seat);
  return ALLIANCE_SHARED_VIS_ROWS.some((r) => rowIsFor(r, civ, leader));
}

/** Lift one seat's fog around a tile; answer how many NEW natural-wonder
 *  plots it uncovered (`found`) and how many natural wonders none of whose
 *  plots the seat had seen (`wonders`). The write alone — the discovery
 *  event is the caller's, so a seat merely SHOWN a wonder does not score it. */
function liftFog(state: GameState, seat: number, tileIndex: number, radius: number,
                 los?: Look): { found: number; wonders: number } {
  const s = seatOf(state, seat);
  if (!s) return { found: 0, wonders: 0 };
  if (s.explored.length === 0) s.explored = new Array(state.map.tiles.length).fill(0);
  const t = state.map.tiles[tileIndex];
  let found = 0;
  const fresh = new Set<string>();
  const seen: Tile[] = [];
  const sees = los ? losDisk(state.map, t, radius, los.seeThrough) : null;
  for (const n of tilesWithin(state.map, t.col, t.row, radius)) {
    if (sees && !sees.has(n.index)) continue;
    seen.push(n);
    const nw = naturalWonderAt(n);
    if (s.explored[n.index] !== 1 && nw) {
      found++;
      fresh.add(nw);
    }
  }
  // a wonder is new where no plot of it was seen before this look
  let wonders = 0;
  for (const nw of fresh) {
    if (!state.map.tiles.some((u) => s.explored[u.index] === 1 && naturalWonderAt(u) === nw)) wonders++;
  }
  for (const n of seen) s.explored[n.index] = 1;
  return { found, wonders };
}

export function unexploredByAll(state: GameState, tileIndex: number): boolean {
  return state.seats.every((s) => s.explored.length === 0 || s.explored[tileIndex] !== 1);
}

/** The fog over a standing position: what each major's own plots, cities and
 *  units show. Nothing is discovered: no era score, no Kandy Relic, no ally's
 *  share — the position already holds what its discoveries paid. */
export function initFog(state: GameState): void {
  for (const s of state.seats) {
    s.explored = new Array(state.map.tiles.length).fill(0);
    if (!state.fogOfWar || !isCiv(s.seat)) continue;
    // each plot it owns and the six beside it (its cities' look, `cityLook`)
    for (const t of state.map.tiles) {
      if (tileSeat(t) === s.seat) liftFog(state, s.seat, t.index, 1);
    }
    for (const u of unitsOf(state, s.seat)) liftFog(state, s.seat, u.tileIndex, unitSight(u, state), { seeThrough: unitSeesThrough(u) });
  }
}
