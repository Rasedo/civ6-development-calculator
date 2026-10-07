/**
 * THE BARBARIANS' TURN as the game's barbarian manager runs it (0x1514a0;
 * tools/civ6lab/dll_readings.md "H-1: the barbarians' turn"): the
 * barbarians take the techs and civics half the majors hold (0x14f530), new
 * camps rise (the camp step 0x14fcc0), and each living tribe takes its turn
 * (0x1488a0) — its spawn clock, its ranged roll, its scout. What the
 * barbarians' units then do is their AI's (`hostileUnitAct`, the driver's).
 *
 * A camp is a TRIBE: its plot, its kind (naval, cavalry or melee: the first
 * whose ground the camp meets, 0x154220), its name (a draw over the kind's
 * names no tribe took, 0x152460) and its clocks. A cleared camp's tribe
 * stays in the list, dead: the camp step still measures from it, and its
 * name is the last to be taken again.
 */
import type { GameState, Tile, BarbTribe } from './types';
import { neighbors, hexDistance, tilesWithin, tileAt, offsetToAxial, axialToOffset } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { RESOURCES } from '../../world/resources';
import { randRange, randWeighted, atRngPoint } from './rand';
import { BARB_SEAT, NO_SEAT, hiddenResourcesFor, tileSeat } from './seats';
import { canSee, unitSight, unitSeesThrough } from './fog';
import { spawnUnit, tileFreeForUnit } from './units';
import { UNITS } from '../data/units';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import {
  BARB_CAMPS_PER_MAJOR, BARB_FIRST_TURN_PCT, BARB_CAMP_DIST_CAMP, BARB_CAMP_DIST_CITY, BARB_TECH_PCT, BARB_REGION_MIN,
  BARB_SCOUT_WAIT, BARB_ISLAND_PLOTS, BARB_COAST_WATER, BARB_CAMP_TERRAINS, BARB_CAMP_FEATURES, BARB_TRIBES,
  BARB_NAMES_PER_KIND, BARB_MAX_UNITS, BARB_MAX_SCOUTS, BARB_TAG_UNITS, BARB_FREE_TECHS, barbNameRangedPct,
  type BarbTag, type BarbTribeDef,
} from '../data/barbarians';

/** the majors still in the game: a city or a unit */
function majorsAlive(state: GameState): number[] {
  return state.seats.filter((s) => s.cities.length > 0 || state.units.some((u) => u.seat === s.seat)).map((s) => s.seat);
}

/**
 * THE BARBARIANS' TECHS AND CIVICS (0x14f530): each the barbarians lack that
 * at least max(1, (BARBARIAN_TECH_PERCENT x majors + 50) / 100) majors hold,
 * or that the install frees to them (Technologies.BarbarianFree), is theirs.
 */
export function barbarianTechs(state: GameState): void {
  const majors = majorsAlive(state).map((s) => state.seats[s]);
  const need = Math.max(1, Math.floor((BARB_TECH_PCT * majors.length + 50) / 100));
  const r = state.barbSeat.research;
  for (const id of Object.keys(TECHS)) {
    if (r.techs.includes(id)) continue;
    if (BARB_FREE_TECHS.includes(id) || majors.filter((s) => s.research.techs.includes(id)).length >= need) r.techs.push(id);
  }
  for (const id of Object.keys(CIVICS)) {
    if (r.civics.includes(id)) continue;
    if (majors.filter((s) => s.research.civics.includes(id)).length >= need) r.civics.push(id);
  }
}

/**
 * THE PLOTS THESE SEATS SEE NOW: each unit's sight across the plots its
 * line reaches (`canSee`), each city's centre two plots round, and each
 * owned plot with its ring. A LAB reading: the camp step's exclusions fit it
 * (runs/h1_duelw1120-1124 camp draws' ranges), the game's sight rule unread.
 */
export function plotsSeenNow(state: GameState, seats: ReadonlySet<number>): Uint8Array {
  const { map } = state;
  const seen = new Uint8Array(map.tiles.length);
  for (const u of state.units) {
    if (!seats.has(u.seat)) continue;
    const from = map.tiles[u.tileIndex];
    const through = unitSeesThrough(u);
    for (const t of tilesWithin(map, from.col, from.row, unitSight(u, state))) {
      if (!seen[t.index] && canSee(map, from, t, through)) seen[t.index] = 1;
    }
  }
  const centres: number[] = [];
  for (const s of state.seats) if (seats.has(s.seat)) for (const c of s.cities) centres.push(c.centerIndex);
  for (const cs of state.cityStates) if (seats.has(cs.seat) && cs.centerIndex >= 0) centres.push(cs.centerIndex);
  if (state.freeSeat && seats.has(state.freeSeat.seat)) for (const c of state.freeSeat.cities) centres.push(c.centerIndex);
  for (const c of centres) {
    const t = map.tiles[c];
    for (const n of tilesWithin(map, t.col, t.row, 2)) seen[n.index] = 1;
  }
  for (const t of map.tiles) {
    if (!seats.has(tileSeat(t))) continue;
    seen[t.index] = 1;
    for (const n of neighbors(map, t)) seen[n.index] = 1;
  }
  return seen;
}

/** every player but the barbarians: the majors, the city-states, the Free
 *  Cities — whose sight bars a camp (0x50b180) */
function allSeers(state: GameState): Set<number> {
  const out = new Set<number>(state.seats.map((s) => s.seat));
  for (const cs of state.cityStates) out.add(cs.seat);
  if (state.freeSeat) out.add(state.freeSeat.seat);
  return out;
}

/** may a camp stand on this plot (the improvement's ground, 0x35fd60): open
 *  land of its terrains, bare or under its features, no resource the
 *  barbarians see, nothing built */
function campGround(t: Tile, hidden: ReadonlySet<string>): boolean {
  if (isWater(t) || t.elevation === 'MOUNTAIN' || !BARB_CAMP_TERRAINS.includes(t.terrain)) return false;
  if (t.feature && !BARB_CAMP_FEATURES.includes(t.feature)) return false;
  if (t.resource && !hidden.has(t.resource)) return false;
  return !t.improvement && !t.goodyHut && !t.district && !t.builtWonder;
}

/** the tribes, the list the game keeps (dead ones included) */
function tribesOf(state: GameState): BarbTribe[] {
  return (state.barbTribes ??= []);
}

/**
 * A CAMP'S SCORE (0x151fa0), null where none may rise: unowned and unseen
 * camp ground with no major's city nearer than BARBARIAN_CAMP_MINIMUM_DISTANCE_CITY
 * and no camp within BARBARIAN_CAMP_MINIMUM_DISTANCE_ANOTHER_CAMP; then the
 * distances to the nearest and second-nearest tribe (dead ones too, -1 where
 * none), floored at 0, plus the farthest major's city within the scan.
 */
function campScore(state: GameState, t: Tile, seen: Uint8Array, hidden: ReadonlySet<string>, majorCentres: number[]): number | null {
  if (tileSeat(t) !== NO_SEAT || seen[t.index] || !campGround(t, hidden)) return null;
  const { map } = state;
  const reach = Math.max(BARB_CAMP_DIST_CITY, BARB_CAMP_DIST_CAMP);
  let far = 0;
  for (const c of majorCentres) {
    const ct = map.tiles[c];
    const d = hexDistance(map, t.col, t.row, ct.col, ct.row);
    if (d > reach) continue;
    if (d < BARB_CAMP_DIST_CITY) return null;
    far = Math.max(far, d);
  }
  for (const c of state.barbSeat.camps) {
    const ct = map.tiles[c];
    if (hexDistance(map, t.col, t.row, ct.col, ct.row) <= BARB_CAMP_DIST_CAMP) return null;
  }
  let near1 = -1;
  let near2 = -1;
  for (const tr of tribesOf(state)) {
    const ct = map.tiles[tr.plot];
    const d = hexDistance(map, t.col, t.row, ct.col, ct.row);
    if (near1 >= 0 && d >= near1) {
      if (near2 < 0 || d < near2) near2 = d;
    } else {
      near2 = near1;
      near1 = d;
    }
  }
  return Math.max(0, near1 + near2) + far;
}

/**
 * THE CAMP STEP (0x14fcc0). The target is the majors' camps
 * (BARBARIAN_CAMP_MAX_PER_MAJOR_CIV each) times the share of the land no
 * major sees now, less the camps standing; the first step that adds lays
 * BARBARIAN_CAMP_FIRST_TURN_PERCENT_OF_TARGET_TO_ADD of it, every later one
 * a single camp. The candidates are scored per region — the map's regions
 * (0x153290: a region of more than 10 plots or on an area of more than 10)
 * are its areas split at the map script's chokepoints (Region_Builder's flood
 * 0x887810 stops at a chokepoint's line, 0x887aa0); the engines hold no
 * chokepoints and take each area (`Tile.area`) as one region — each region
 * keeping its best-scoring plots in plot order
 * (the evaluation's stable sort); the regions holding the best score of all
 * are weighed by how many such plots each holds ("Barbarian camp region
 * placement"), a plot of the chosen one is drawn ("Barbarian camp
 * location"), and the region leaves the pick. Laying more than one, a plot
 * within BARBARIAN_CAMP_MINIMUM_DISTANCE_ANOTHER_CAMP of a tribe is passed
 * over.
 */
export function campStep(state: GameState): void {
  const majors = majorsAlive(state);
  const standing = state.barbSeat.camps.length;
  const max = BARB_CAMPS_PER_MAJOR * majors.length;
  if (standing >= max) return;
  const { map } = state;
  const seenByMajors = plotsSeenNow(state, new Set(majors));
  let land = 0;
  let dark = 0;
  for (const t of map.tiles) {
    if (isWater(t)) continue;
    land++;
    if (!seenByMajors[t.index]) dark++;
  }
  let add = Math.floor(max * dark / Math.max(1, land)) - standing;
  if (add <= 0) return;
  add = state.barbCampsBegun ? 1 : Math.floor(add * BARB_FIRST_TURN_PCT / 100);
  state.barbCampsBegun = true;
  if (add <= 0) return;
  const seen = plotsSeenNow(state, allSeers(state));
  const hidden = hiddenResourcesFor(state, BARB_SEAT);
  const majorCentres = majors.flatMap((s) => state.seats[s].cities.map((c) => c.centerIndex));
  const size = new Map<number, number>();
  for (const t of map.tiles) if ((t.area ?? -1) >= 0) size.set(t.area!, (size.get(t.area!) ?? 0) + 1);
  const best = new Map<number, { score: number; plots: number[] }>();
  for (const t of map.tiles) {
    const reg = t.area ?? -1;
    if (reg < 0 || (size.get(reg) ?? 0) <= BARB_REGION_MIN) continue;
    const s = campScore(state, t, seen, hidden, majorCentres);
    if (s === null) continue;
    const b = best.get(reg);
    if (!b || s > b.score) best.set(reg, { score: s, plots: [t.index] });
    else if (s === b.score) b.plots.push(t.index);
  }
  const top = Math.max(-1, ...[...best.values()].map((b) => b.score));
  const regions = [...best.keys()].sort((a, b) => a - b).filter((r) => best.get(r)!.score === top);
  const weights = regions.map((r) => best.get(r)!.plots.length);
  for (let k = 0; k < add; k++) {
    if (weights.every((w) => w === 0)) break;
    const r = randWeighted(state, weights, 'Barbarian camp region placement');
    const plots = best.get(regions[r])!.plots;
    const at = plots[randRange(state, plots.length, 'Barbarian camp location')];
    weights[r] = 0;
    const t = map.tiles[at];
    if (add > 1 && tribesOf(state).some((tr) => {
      const ct = map.tiles[tr.plot];
      return hexDistance(map, t.col, t.row, ct.col, ct.row) <= BARB_CAMP_DIST_CAMP;
    })) continue;
    raiseCamp(state, at);
  }
}

/** the plots in this plot's area (Plot:GetArea's plot count) */
function areaSize(state: GameState, t: Tile): number {
  const a = t.area ?? -1;
  return a < 0 ? 0 : state.map.tiles.filter((x) => x.area === a).length;
}

/** does a tribe of this kind take the camp (0x154220): a naval one an area
 *  under 15 plots or a shore with four water plots round it, one of them no
 *  lake (0x153d60); a cavalry one an unowned Horses plot within its range */
function tribeFits(state: GameState, def: BarbTribeDef, t: Tile): boolean {
  if (def.coastal) {
    if (areaSize(state, t) < BARB_ISLAND_PLOTS) return true;
    const water = neighbors(state.map, t).filter((n) => isWater(n) && !isImpassable(n));
    return water.length >= BARB_COAST_WATER && water.some((n) => n.terrain !== 'LAKE');
  }
  if (def.resource) {
    return tilesWithin(state.map, t.col, t.row, def.resourceRange)
      .some((n) => n.resource === def.resource && tileSeat(n) === NO_SEAT && !!RESOURCES[def.resource!]);
  }
  return true;
}

/** the kind a camp's tribe takes: the first BarbarianTribes row it meets */
export function tribeKindAt(state: GameState, plot: number): BarbTribeDef {
  const t = state.map.tiles[plot];
  return BARB_TRIBES.find((d) => tribeFits(state, d, t)) ?? BARB_TRIBES[BARB_TRIBES.length - 1];
}

/** the names a new tribe of this kind may take (0x152460): those no tribe
 *  of the kind holds, else those only dead tribes hold */
function freeNames(state: GameState, def: BarbTribeDef): number[] {
  const mine = tribesOf(state).filter((tr) => tr.kind === def.kind);
  const all = Array.from({ length: BARB_NAMES_PER_KIND }, (_, i) => i);
  const unused = all.filter((i) => !mine.some((tr) => tr.name === i));
  if (unused.length) return unused;
  const alive = new Set(mine.filter((tr) => tr.alive).map((tr) => tr.name));
  return [...new Set(mine.filter((tr) => !tr.alive).map((tr) => tr.name))].filter((i) => !alive.has(i));
}

/** a tribe on the plot, its clocks at rest, with the name given */
export function foundTribe(state: GameState, plot: number, name: number): BarbTribe {
  const def = tribeKindAt(state, plot);
  const tribe: BarbTribe = {
    plot, alive: true, kind: def.kind, name,
    spawnTurns: 0, scoutTurns: 0, units: [], scouts: [],
  };
  tribesOf(state).push(tribe);
  if (!state.barbSeat.camps.includes(plot)) state.barbSeat.camps.push(plot);
  return tribe;
}

/**
 * A CAMP RISES (the improvement's arrival, 0x150a30): its tribe, named by
 * "Barb Tribe Roll", raises its defender on the camp and its scouts within
 * three plots (0x147fc0).
 */
export function raiseCamp(state: GameState, plot: number): void {
  const def = tribeKindAt(state, plot);
  const names = freeNames(state, def);
  const name = names.length ? names[randRange(state, names.length, 'Barb Tribe Roll')] : 0;
  const tribe = foundTribe(state, plot, name);
  raise(state, tribe, def.defenderTag, 0, 1);
  tribe.scouts.push(...raise(state, tribe, def.scoutTag, 3, BARB_MAX_SCOUTS));
}

/** the plots `radius` round `plot` in the game's ring order (0x69010): the
 *  plot, then each ring from its six corners, each corner walked along the
 *  next side */
export function ringPlots(state: GameState, plot: number, radius: number): number[] {
  const { map } = state;
  const t = map.tiles[plot];
  const [q0, r0] = offsetToAxial(t.col, t.row);
  const dirs: [number, number][] = [[0, 1], [-1, 0], [1, -1], [0, -1], [1, 0], [-1, 1]];
  const side = [1, 2, 0, 4, 5, 3];
  const out: number[] = [plot];
  const add = (q: number, r: number) => {
    const [c, row] = axialToOffset(q, r);
    const x = tileAt(map, c, row);
    if (x) out.push(x.index);
  };
  for (let ring = 1; ring <= radius; ring++) {
    for (let j = 0; j < 6; j++) {
      const cq = q0 + dirs[j][0] * ring;
      const cr = r0 + dirs[j][1] * ring;
      add(cq, cr);
      for (let k = 1; k < ring; k++) add(cq + dirs[side[j]][0] * k, cr + dirs[side[j]][1] * k);
    }
  }
  return out;
}

/** the unit a tribe raises for a class tag (0x147470): of the tag's units
 *  the barbarians' techs and civics allow, the first of the highest Combat */
export function barbUnitFor(state: GameState, tag: BarbTag): string | null {
  const r = state.barbSeat.research;
  let best: string | null = null;
  for (const id of BARB_TAG_UNITS[tag]) {
    const def = UNITS[id];
    if (!def || (def.requiresTech && !r.techs.includes(def.requiresTech)) || (def.requiresCivic && !r.civics.includes(def.requiresCivic))) continue;
    if (!best || def.combat > UNITS[best].combat) best = id;
  }
  return best;
}

/** up to `n` units of the tag on the first free plots round the camp
 *  (0x144fb0 / 0x144260): no city on the plot, the unit's own domain; the
 *  ids raised */
function raise(state: GameState, tribe: BarbTribe, tag: BarbTag, radius: number, n: number): number[] {
  const type = barbUnitFor(state, tag);
  if (!type) return [];
  const naval = !!UNITS[type].naval;
  const probe = { type, seat: BARB_SEAT };
  const out: number[] = [];
  for (const p of ringPlots(state, tribe.plot, radius)) {
    if (out.length >= n) break;
    const t = state.map.tiles[p];
    if (isImpassable(t) || t.district === 'CITY_CENTER' || isWater(t) !== naval) continue;
    if (!tileFreeForUnit(state, p, BARB_SEAT, probe)) continue;
    const u = spawnUnit(state, type, p, BARB_SEAT);
    if (u) out.push(u.id);
  }
  return out;
}

const living = (state: GameState, ids: number[]) => ids.filter((id) => state.units.some((u) => u.id === id)).length;

/**
 * A TRIBE'S TURN (0x1488a0): its spawn clock runs; at the tribe's
 * TurnsToWarriorSpawn (at the speed) it resets and, while the tribe holds
 * fewer than its NumMilitary, raises one unit within a plot of the camp —
 * ranged when "Barbarian Ranged unit roll" falls under PercentRangedUnits,
 * else melee. A turn the clock does not strike, a tribe short of scouts
 * counts toward one, raised within two plots on the fifth.
 */
function tribeTurn(state: GameState, tribe: BarbTribe): void {
  const def = BARB_TRIBES.find((d) => d.kind === tribe.kind)!;
  tribe.spawnTurns += 1;
  if (tribe.spawnTurns >= def.spawnEvery) {
    tribe.spawnTurns = 0;
    if (living(state, tribe.units) >= BARB_MAX_UNITS) return;
    const pct = barbNameRangedPct(tribe.kind, tribe.name) ?? def.rangedPct;
    const ranged = randRange(state, 100, 'Barbarian Ranged unit roll') < pct;
    tribe.units.push(...raise(state, tribe, ranged ? def.rangedTag : def.meleeTag, 1, 1));
    return;
  }
  if (living(state, tribe.scouts) >= BARB_MAX_SCOUTS) return;
  tribe.scoutTurns += 1;
  if (tribe.scoutTurns < BARB_SCOUT_WAIT) return;
  tribe.scouts.push(...raise(state, tribe, def.scoutTag, 2, 1));
  tribe.scoutTurns = 0;
}

/** the camp is gone: its tribe is dead, kept in the list */
export function tribeDies(state: GameState, plot: number): void {
  for (const tr of tribesOf(state)) if (tr.plot === plot && tr.alive) tr.alive = false;
}

/**
 * THE BARBARIANS' RULES closing turn `closing`, on the generator at the
 * barbarian player's own start of it: after every player's actions and
 * before the next turn's random-event step (`endTurn`).
 */
export function barbarianRules(state: GameState, closing: number): void {
  atRngPoint(state, { kind: 'seat', seat: BARB_SEAT, turn: closing - 1 });
  barbarianTechs(state);
  campStep(state);
  for (const tr of [...tribesOf(state)]) if (tr.alive) tribeTurn(state, tr);
}

