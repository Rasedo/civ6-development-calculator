/**
 * THE BARBARIANS' TURN as the game's barbarian manager runs it (0x1514a0;
 * tools/civ6lab/dll_readings.md "H-1: the barbarians' turn"): the
 * barbarians take the techs and civics half the majors hold (0x14f530), new
 * camps rise (the camp step 0x14fcc0), and each living tribe takes its turn
 * (0x1488a0) — its spawn clock, its ranged roll, its scout. What the
 * barbarians' units then do is their AI's: the tactical pass
 * (cpu/core/tactical.ts) and their operations' and scouts' trees in it
 * (cpu/core/barbarianOps.ts). At each step their scouts look
 * (`barbScoutLook`): a scout that sees a major's city starts its tree,
 * which walks it home; its tribe raids the city once its Boldness allows
 * (or waits for it), and the raid recruits its force from the tribe's
 * units, asking the spawn clock for the rest.
 *
 * A camp is a TRIBE: its plot, its kind (naval, cavalry or melee: the first
 * whose ground the camp meets, 0x154220), its name (a draw over the kind's
 * names no tribe took, 0x152460) and its clocks. A cleared camp's tribe
 * stays in the list, dead: the camp step still measures from it, and its
 * name is the last to be taken again.
 */
import type { GameState, Tile, BarbTribe, Unit, UnitPool } from './types';
import { barbOpLive, barbOpStart, barbScoutTreeStart } from './barbarianOps';
import { neighbors, hexDistance, tilesWithin, tileAt, offsetToAxial, axialToOffset } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { RESOURCES } from '../../world/resources';
import { randRange, randWeighted, atRngPoint } from './rand';
import { BARB_SEAT, FREE_SEAT, NO_SEAT, allCities, campTiles, isBarbSeat, isTerritorial, majorsAlive, seatOfCityState, tileCity, tileSeat } from './seats';
import { suzerainOf } from './cityStates';
import { losDisk, unitSight, unitSeesThrough } from './fog';
import { spawnUnit, tileFreeForUnit, unitDomain } from './units';
import { UNITS } from '../data/units';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import {
  BARB_CAMPS_PER_MAJOR, BARB_FIRST_TURN_PCT, BARB_CAMP_DIST_CAMP, BARB_CAMP_DIST_CITY, BARB_TECH_PCT, BARB_REGION_MIN,
  BARB_SCOUT_WAIT, BARB_ISLAND_PLOTS, BARB_COAST_WATER, BARB_CAMP_TERRAINS, BARB_CAMP_FEATURES, BARB_TRIBES,
  BARB_NAMES_PER_KIND, BARB_MAX_UNITS, BARB_MAX_SCOUTS, BARB_TAG_UNITS, BARB_FREE_TECHS, barbNameRangedPct,
  BARB_BOLD_TURN, BARB_BOLD_KILL, BARB_BOLD_UNIT_LOST, BARB_BOLD_SCOUT_LOST, BARB_RAID_BOLDNESS, BARB_ASSAULT_BOLDNESS,
  BARB_SPOT_THROTTLE, BARB_SPOT_THROTTLE_PER_LEVEL,
  BARB_PILLAGE_SCORE, DEFAULT_HANDICAP, barbNameRaidBoldness,
  type BarbTag, type BarbTribeDef,
} from '../data/barbarians';

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
 * line reaches (`losDisk`), each city's centre two plots round, each
 * owned plot with its ring, and — the barbarians' — each camp with its ring
 * (the improvement's owner, `CAMP_SIGHT`). A seat sees what each city-state
 * it is suzerain of sees: the suzerain update (0x451b20) adds the minor's
 * outgoing visibility to it (0x508330, Lua AddOutgoingVisibility), its
 * units' sight and its plots' alike (runs/h1_dueld1128: Barbarians.csv's
 * "No Visibility" 267 -> 212 the turn China takes Hong Kong, t64, and 49 ->
 * 88 below the engines' at Granada, t97; the five dueld duels' 1,245
 * turns: 1,065 equal with the share, 206 without it, the minor's plots alone
 * 454). A LAB reading: the camp step's exclusions fit it (runs/h1_duelw1120-1124
 * camp draws' ranges), the game's sight rule unread. With `shared` false
 * the seats' own sight alone.
 */
export function plotsSeenNow(state: GameState, given: ReadonlySet<number>, shared = true): Uint8Array {
  const { map } = state;
  const seats = new Set(given);
  if (shared) for (const cs of state.cityStates) if (cs.centerIndex >= 0 && given.has(suzerainOf(cs))) seats.add(cs.seat);
  const seen = new Uint8Array(map.tiles.length);
  for (const u of state.units) {
    if (!seats.has(u.seat)) continue;
    for (const p of losDisk(map, map.tiles[u.tileIndex], unitSight(u, state), unitSeesThrough(u))) seen[p] = 1;
  }
  const centres: number[] = [];
  for (const s of state.seats) if (seats.has(s.seat)) for (const c of s.cities) centres.push(c.centerIndex);
  for (const cs of state.cityStates) if (seats.has(cs.seat) && cs.centerIndex >= 0) centres.push(cs.centerIndex);
  if (state.freeSeat && seats.has(state.freeSeat.seat)) for (const c of state.freeSeat.cities) centres.push(c.centerIndex);
  for (const c of centres) {
    const t = map.tiles[c];
    for (const n of tilesWithin(map, t.col, t.row, 2)) seen[n.index] = 1;
  }
  // a camp's improvement: its owner sees its plot and the six beside it
  if ([...seats].some(isBarbSeat)) {
    for (const c of campTiles(state)) for (const n of tilesWithin(map, map.tiles[c].col, map.tiles[c].row, CAMP_SIGHT)) seen[n.index] = 1;
  }
  for (const t of map.tiles) {
    if (!seats.has(tileSeat(t))) continue;
    seen[t.index] = 1;
    for (const n of neighbors(map, t)) seen[n.index] = 1;
  }
  return seen;
}

/** every living player: the majors, the city-states, the Free Cities and
 *  the barbarians themselves — whose sight bars a camp (0x50b180 walks the
 *  players' list at +0x4a0; runs/h1_duelw1127 t22: the game's one candidate
 *  is (14,13), the engines' best (7,20) and (10,20) lying two plots from the
 *  barbarians' Scout at (8,19)) */
function allSeers(state: GameState): Set<number> {
  const out = new Set<number>(state.seats.map((s) => s.seat));
  for (const cs of state.cityStates) out.add(cs.seat);
  if (state.freeSeat) out.add(state.freeSeat.seat);
  out.add(BARB_SEAT);
  return out;
}

/** may a camp stand on this plot (the improvement's ground, 0x35fd60 asked
 *  for no player, which reads every resource, 0x5112f0): open land of its
 *  terrains, bare or under its features, no resource, nothing built */
function campGround(t: Tile): boolean {
  if (isWater(t) || t.elevation === 'MOUNTAIN' || !BARB_CAMP_TERRAINS.includes(t.terrain)) return false;
  if (t.feature && !BARB_CAMP_FEATURES.includes(t.feature)) return false;
  if (t.resource) return false;
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
 * none) and to the nearest camp ever raised (0 before the first), floored at
 * 0, plus the farthest major's city within the scan.
 */
function campScore(state: GameState, t: Tile, seen: Uint8Array, majorCentres: number[]): number | null {
  if (tileSeat(t) !== NO_SEAT || seen[t.index] || !campGround(t)) return null;
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
  // the nearest plot of the manager's camp list (every camp ever raised,
  // 0x152b50 over +0x4a0, appended at 0x154642), 0 when empty: the nearest
  // tribe again
  return Math.max(0, near1 + near2 + Math.max(near1, 0)) + far;
}

/**
 * THE CAMP STEP (0x14fcc0). The target is the game's majors' camps
 * (BARBARIAN_CAMP_MAX_PER_MAJOR_CIV each) times the share of the land no
 * full civilization (a major, the Free Cities) sees now, less the camps
 * standing; the first step that adds lays
 * BARBARIAN_CAMP_FIRST_TURN_PERCENT_OF_TARGET_TO_ADD of it, every later one
 * a single camp. The candidates are scored per region — the map's regions
 * (`Tile.region`, 0x153290: a region of more than 10 plots or on an area of
 * more than 10) are the land split at the map script's chokepoints
 * (Region_Builder's flood 0x887810 stops at a chokepoint's line, 0x887aa0) —
 * each region keeping its best-scoring plots in plot order
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
  // the most camps (+0x110), set once as the manager opens (0x153659): the
  // game's full civs (its +0xb50 list then) times the parameter
  const max = BARB_CAMPS_PER_MAJOR * state.seats.length;
  if (standing >= max) return;
  const { map } = state;
  // the land no full civilization sees (0x50b2d0 on FULL_CIV: every living
  // player but a tribe and a city-state, the Free Cities among them)
  const seenByMajors = plotsSeenNow(state, new Set([...majors, FREE_SEAT]));
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
  const majorCentres = majors.flatMap((s) => state.seats[s].cities.map((c) => c.centerIndex));
  // a region takes part with more than BARB_REGION_MIN plots, or on an area
  // (its first plot's, Map_Region's m_area) of more
  const areaSize = new Map<number, number>();
  const regSize = new Map<number, number>();
  const regArea = new Map<number, number>();
  for (const t of map.tiles) {
    if ((t.area ?? -1) >= 0) areaSize.set(t.area!, (areaSize.get(t.area!) ?? 0) + 1);
    const r = t.region ?? -1;
    if (r < 0) continue;
    regSize.set(r, (regSize.get(r) ?? 0) + 1);
    if (!regArea.has(r)) regArea.set(r, t.area ?? -1);
  }
  const best = new Map<number, { score: number; plots: number[] }>();
  for (const t of map.tiles) {
    const reg = t.region ?? -1;
    if (reg < 0 || ((regSize.get(reg) ?? 0) <= BARB_REGION_MIN
      && (areaSize.get(regArea.get(reg)!) ?? 0) <= BARB_REGION_MIN)) continue;
    const s = campScore(state, t, seen, majorCentres);
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
    spawnTurns: 0, scoutTurns: 0, units: [], scouts: [], unitCount: 0, scoutCount: 0,
  };
  tribesOf(state).push(tribe);
  if (!state.barbSeat.camps.includes(plot)) state.barbSeat.camps.push(plot);
  return tribe;
}

/** the plots round a camp its owner sees: the improvement's owner takes the
 *  visibility of its plot and the six beside it (0x363080 -> 0x362ec0 ->
 *  0x84340, a count each through 0x508d50, no line of sight) */
export const CAMP_SIGHT = 1;

/**
 * A CAMP RISES (the improvement's arrival, 0x150a30): its tribe, named by
 * "Barb Tribe Roll", raises its defender on the camp and its scouts within
 * three plots (0x147fc0); what the barbarians reveal round it is those
 * units' looks.
 */
export function raiseCamp(state: GameState, plot: number): void {
  const def = tribeKindAt(state, plot);
  const names = freeNames(state, def);
  const name = names.length ? names[randRange(state, names.length, 'Barb Tribe Roll')] : 0;
  const tribe = foundTribe(state, plot, name);
  tribe.defender = raise(state, tribe, def.defenderTag, 0, 1)[0];
  const scouts = raise(state, tribe, def.scoutTag, 3, BARB_MAX_SCOUTS);
  tribe.scouts.push(...scouts);
  tribe.scoutCount += scouts.length;
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

/** a player's handicap (a Difficulties index): a seat's own, else the AI's */
export function handicapOf(state: GameState, seat: number): number {
  return state.seats[seat]?.handicap ?? DEFAULT_HANDICAP;
}

/** the boldness a tribe's raid waits for: its name's own, else its kind's */
export function raidBoldness(tribe: BarbTribe): number {
  return barbNameRaidBoldness(tribe.kind, tribe.name) ?? BARB_RAID_BOLDNESS;
}

/**
 * A TRIBE'S TURN (0x1488a0): its spawn clock runs; at its interval — the
 * tribe's TurnsToWarriorSpawn at the speed, or the SpawnRate its operation
 * set — it resets and raises the first unit its operation asked for (its
 * class's best unit now, 0x144fb0 -> 0x147470, uncounted), else,
 * while its count (+0x34) is under its NumMilitary, one unit within a plot of
 * the camp — ranged when "Barbarian Ranged unit roll" falls under
 * PercentRangedUnits, else melee —, counted. A turn the clock does not
 * strike, a tribe whose scout count (+0x28) is short counts toward one,
 * raised within two plots on the fifth.
 * Then its Boldness grows, its operation is forgotten once gone, and the
 * cities it waits to go after are tried: a city assault at
 * CityAttackBoldness, else a raid at RaidingBoldness.
 */
function tribeTurn(state: GameState, tribe: BarbTribe): void {
  const def = BARB_TRIBES.find((d) => d.kind === tribe.kind)!;
  tribe.fresh = [];
  tribe.spawnTurns += 1;
  if (tribe.spawnTurns >= (tribe.every ?? def.spawnEvery)) {
    tribe.spawnTurns = 0;
    if (tribe.queue?.length) {
      const ids = raise(state, tribe, tribe.queue.shift()!, 1, 1);
      tribe.units.push(...ids);
      tribe.fresh.push(...ids);
    } else if (tribe.unitCount < BARB_MAX_UNITS) {
      const pct = barbNameRangedPct(tribe.kind, tribe.name) ?? def.rangedPct;
      const ranged = randRange(state, 100, 'Barbarian Ranged unit roll') < pct;
      const ids = raise(state, tribe, ranged ? def.rangedTag : def.meleeTag, 1, 1);
      tribe.units.push(...ids);
      tribe.fresh.push(...ids);
      tribe.unitCount += ids.length;
    }
  } else if (tribe.scoutCount < BARB_MAX_SCOUTS) {
    tribe.scoutTurns += 1;
    if (tribe.scoutTurns >= BARB_SCOUT_WAIT) {
      const ids = raise(state, tribe, def.scoutTag, 2, 1);
      tribe.scouts.push(...ids);
      tribe.scoutCount += ids.length;
      tribe.scoutTurns = 0;
    }
  }
  tribe.boldness = (tribe.boldness ?? 0) + BARB_BOLD_TURN;
  if (tribe.op && !barbOpLive(state, tribe)) delete tribe.op;
  if (tribe.assaultTargets?.length && !tribe.op?.assault) {
    if (tribe.boldness < BARB_ASSAULT_BOLDNESS) return;
    if (barbOpStart(state, tribe, tribe.assaultTargets[0], true)) tribe.assaultTargets.shift();
  } else if (tribe.raidTargets?.length && !(tribe.op && !tribe.op.assault)) {
    if (tribe.boldness < raidBoldness(tribe)) return;
    if (barbOpStart(state, tribe, tribe.raidTargets[0], false)) tribe.raidTargets.shift();
  }
}

/** the centre of the city a plot belongs to */
function cityCentreOf(state: GameState, t: Tile): number {
  const seat = tileSeat(t);
  const cs = state.cityStates.find((c) => seatOfCityState(c.id) === seat);
  if (cs) return cs.centerIndex;
  const owner = seat === FREE_SEAT ? state.freeSeat : state.seats[seat];
  const id = tileCity(t);
  return owner?.cities.find((c) => c.id === id)?.centerIndex ?? -1;
}

/**
 * A BARBARIAN SCOUT LOOKS from its plot: each owned plot newly visible to the
 * barbarian player by its sight — in its sight now, not in it at its last
 * look, and seen by no other unit of theirs (the sight update 0x58aa90 raises
 * the report where the player's count on the plot goes from 0, 0x508d50) — of
 * a player's territory, an improvement's or a district's, in plot order, is a
 * report (0x153ef0) — once
 * the player's throttle allows, its tribe's scout walks home with a major's
 * city when none walks yet (0x1485c0), and the player is spared further reports
 * BARBARIAN_MAX_THROTTLE_PER_RAID less BARBARIAN_LOWER_THROTTLE_PER_DIFFICULTY
 * a handicap level turns.
 */
/** of the plots, those another barbarian unit sees where it stands — a
 *  civilian of theirs (a capture) none (runs/h1_dueld1128 t76: the captured
 *  Settler on 13:14, three plots from the Farm on 15:12, leaves the
 *  Skirmisher's report standing: the scout's tree that day, the raid at t78
 *  as AI_Operation.csv logs it) */
function othersSee(state: GameState, unit: Unit, plots: readonly number[]): Set<number> {
  const out = new Set<number>();
  if (!plots.length) return out;
  const { map } = state;
  for (const o of state.units) {
    if (o === unit || !isBarbSeat(o.seat) || o.tileIndex < 0 || unitDomain(o.type) === 'civilian') continue;
    const sees = losDisk(map, map.tiles[o.tileIndex], unitSight(o, state), unitSeesThrough(o));
    for (const p of plots) if (sees.has(p)) out.add(p);
  }
  return out;
}

export function barbScoutLook(state: GameState, unit: Unit): void {
  const tribe = tribesOf(state).find((tr) => tr.alive && tr.scouts.includes(unit.id));
  if (!tribe) return;
  const { map } = state;
  const from = map.tiles[unit.tileIndex];
  const through = unitSeesThrough(unit);
  const sight = unitSight(unit, state);
  const now: number[] = [];
  const sees = losDisk(map, from, sight, through);
  for (const t of tilesWithin(map, from.col, from.row, sight)) {
    if (isTerritorial(tileSeat(t)) && sees.has(t.index)) now.push(t.index);
  }
  now.sort((x, y) => x - y);
  const saw = new Set((tribe.saw ??= {})[unit.id] ?? []);
  tribe.saw[unit.id] = now;
  const others = othersSee(state, unit, now.filter((p) => !saw.has(p)));
  const next = (state.barbSpotNext ??= {});
  // the wonders' plots, built or placed in a queue: DISTRICT_WONDER's
  const wonders = new Set(allCities(state).flatMap((c) => [...c.wonders.map((w) => w.tileIndex),
    ...c.queue.flatMap((q) => (q.kind === 'wonder' ? [q.tileIndex] : []))]));
  for (const p of now) {
    if (saw.has(p) || others.has(p)) continue;
    const t = map.tiles[p];
    const seat = tileSeat(t);
    if (state.turn < (next[seat] ?? 0)) continue;
    // a plot of an improvement (+0x44) or a district (a city's centre and a
    // wonder among them) alone; a major's city sends the scout home
    // (0x484a10: a full civ)
    if (t.improvement === null && t.district === null && !wonders.has(p)) continue;
    if (!tribe.homing && seat >= 0 && seat < state.seats.length) barbScoutTreeStart(state, tribe, unit.id, { seat, plot: cityCentreOf(state, t) });
    next[seat] = state.turn + Math.max(0, BARB_SPOT_THROTTLE - BARB_SPOT_THROTTLE_PER_LEVEL * handicapOf(state, seat));
  }
}


/** THE BARBARIANS' OWN BATTLES HELD: the action replay lands the record's
 *  battles before the barbarians' turn, where the game fights a barbarian's
 *  attack after their rules (each tribe's turn); it takes such a battle's
 *  boldness and counts (true) to land after `barbarianRules`
 *  (runs/h1_duely1128 t141: tribe 1's Warrior and Man-at-Arms die on
 *  China's Courser after its strike found five, so it raises none). Null
 *  outside a replay. */
let battlesHeld: ((land: () => void) => boolean) | null = null;
export function holdBarbBattles(held: typeof battlesHeld): void {
  battlesHeld = held;
}

/**
 * A BATTLE'S DEAD MOVE A TRIBE'S BOLDNESS (0x1540b0 / 0x148e90): the
 * defender dead, else the attacker — an enemy a tribe's unit killed
 * BARBARIAN_BOLDNESS_PER_KILL, a tribe's unit lost
 * BARBARIAN_BOLDNESS_PER_UNIT_LOST, its scout BARBARIAN_BOLDNESS_PER_SCOUT_LOST.
 * A tribe's units its camp's defender among them, which no raise counts but
 * whose death lowers the count (runs/h1_duely1128 t121: tribe 3's Spearman
 * on 4:1 dies attacking a Man-at-Arms, its five Quadriremes standing, and
 * the tribe raises a sixth at its t123 strike).
 */
export function barbBattleBoldness(state: GameState, attacker: Unit, defender: Unit, aDied: boolean, dDied: boolean): void {
  if (!dDied && !aDied) return;
  if (isBarbSeat(attacker.seat) && battlesHeld?.(() => barbBattleBoldness(state, attacker, defender, aDied, dDied))) return;
  const [killer, victim] = dDied ? [attacker, defender] : [defender, attacker];
  if (isBarbSeat(killer.seat) && !isBarbSeat(victim.seat)) {
    const tr = tribeOf(state, killer.id);
    if (tr) tr.boldness = (tr.boldness ?? 0) + BARB_BOLD_KILL;
  } else if (isBarbSeat(victim.seat) && !isBarbSeat(killer.seat)) barbUnitLost(state, victim);
}

/** A TRIBE'S UNIT LOST in a unit battle (0x148e90; a city's shot lowers
 *  nothing: runs/h1_duely1128 t97, tribe 1's Swordsman to China's centre,
 *  no raise in its place at t106): its boldness falls and the counts its
 *  turn reads — a scout's, its wait begun again; any other's but a support
 *  unit's */
function barbUnitLost(state: GameState, victim: Unit): void {
  const tr = tribeOf(state, victim.id);
  if (!tr) return;
  if (tr.scouts.includes(victim.id)) {
    tr.boldness = (tr.boldness ?? 0) + BARB_BOLD_SCOUT_LOST;
    tr.scoutCount -= 1;
    tr.scoutTurns = 0;
  } else {
    tr.boldness = (tr.boldness ?? 0) + BARB_BOLD_UNIT_LOST;
    if (unitDomain(victim.type) !== 'support') tr.unitCount -= 1;
  }
}

/** A PILLAGE BY A TRIBE'S UNIT (the pillage signal's handler 0x154b80, a
 *  pillage, a coastal raid): the tribe's raid score grows */
export function barbPillageScore(state: GameState, unit: Unit): void {
  if (!isBarbSeat(unit.seat)) return;
  const tr = tribeOf(state, unit.id);
  if (tr) tr.score = (tr.score ?? 0) + BARB_PILLAGE_SCORE;
}

/** the camp is gone: its tribe is dead, kept in the list, and where a unit
 *  took it its tribe rampages against that unit's player (the camp's
 *  removal 0x154830 writes the player to the tribe, +0x1c) */
export function tribeDies(state: GameState, plot: number, by: number = NO_SEAT): void {
  for (const tr of tribesOf(state)) {
    if (tr.plot !== plot || !tr.alive) continue;
    tr.alive = false;
    if (by !== NO_SEAT) tr.rampage = by;
  }
}

/** the tribe that raised a unit (its defender, its units or its scouts) */
export function tribeOf(state: GameState, id: number): BarbTribe | undefined {
  return tribesOf(state).find((tr) => tr.defender === id || tr.units.includes(id) || tr.scouts.includes(id));
}

/**
 * A PLAYER'S UNIT POOL (`UnitPool`): the slots of the units that were gone
 * when the player's last tactical turn ended go free, pushed in ascending
 * order, and each of the player's `units` without a slot takes one in their
 * order — the slot pushed last, else a new one.
 */
export function poolSlots(pool: UnitPool, units: readonly Unit[]): void {
  pool.free.push(...[...pool.dying].sort((a, b) => a - b));
  pool.dying = [];
  for (const u of units) {
    if (u.slot !== undefined) continue;
    u.slot = pool.free.length ? pool.free.pop()! : pool.size++;
  }
}

/** the player's tactical turn ends: the slots none of its `units` holds
 *  wait for its next turn to go free */
export function poolDying(pool: UnitPool, units: readonly Unit[]): void {
  const held = new Set<number>();
  for (const u of units) if (u.slot !== undefined) held.add(u.slot);
  const free = new Set(pool.free);
  for (let s = 0; s < pool.size; s++) if (!held.has(s) && !free.has(s)) pool.dying.push(s);
}

/** THE BARBARIANS' UNIT POOL (`poolSlots`), their units in the order they
 *  were made. Run at the start of their turn and again after their camps
 *  raised their units. */
export function barbSlots(state: GameState): void {
  poolSlots((state.barbPool ??= { size: 0, free: [], dying: [] }), state.units.filter((u) => isBarbSeat(u.seat)));
}

/** the barbarians' turn ends (`poolDying`) */
export function barbSlotsDying(state: GameState): void {
  poolDying((state.barbPool ??= { size: 0, free: [], dying: [] }), state.units.filter((u) => isBarbSeat(u.seat)));
}

/**
 * THE BARBARIANS' RULES closing turn `closing`, on the generator at the
 * barbarian player's own start of it: after every player's actions and
 * before the next turn's random-event step (`endTurn`).
 */
export function barbarianRules(state: GameState, closing: number): void {
  atRngPoint(state, { kind: 'seat', seat: BARB_SEAT, turn: closing });
  barbarianTechs(state);
  campStep(state);
  for (const tr of [...tribesOf(state)]) if (tr.alive) tribeTurn(state, tr);
}
