/**
 * THE BARBARIANS' TURN as the game's barbarian manager runs it (0x1514a0;
 * tools/civ6lab/dll_readings.md "H-1: the barbarians' turn"): the
 * barbarians take the techs and civics half the majors hold (0x14f530), new
 * camps rise (the camp step 0x14fcc0), and each living tribe takes its turn
 * (0x1488a0) — its spawn clock, its ranged roll, its scout. What the
 * barbarians' units then do is their AI's (`hostileUnitAct`, the driver's).
 * After their moves come their operations (`barbarianOps`): a scout that
 * saw a major's city walks it home, its tribe raids the city once its
 * Boldness allows (or waits for it), and the raid recruits its force from
 * the tribe's units, asking the spawn clock for the rest.
 *
 * A camp is a TRIBE: its plot, its kind (naval, cavalry or melee: the first
 * whose ground the camp meets, 0x154220), its name (a draw over the kind's
 * names no tribe took, 0x152460) and its clocks. A cleared camp's tribe
 * stays in the list, dead: the camp step still measures from it, and its
 * name is the last to be taken again.
 */
import type { GameState, Tile, BarbTribe, BarbOp, BarbTarget, Unit } from './types';
import { neighbors, hexDistance, tilesWithin, tileAt, offsetToAxial, axialToOffset } from '../../world/hex';
import { isWater, isImpassable } from '../../world/query';
import { RESOURCES } from '../../world/resources';
import { randRange, randWeighted, atRngPoint } from './rand';
import { BARB_SEAT, FREE_SEAT, NO_SEAT, isBarbSeat, isTerritorial, majorsAlive, seatOfCityState, tileCity, tileSeat } from './seats';
import { canSee, unitSight, unitSeesThrough } from './fog';
import { spawnUnit, tileFreeForUnit, unitIsNoncombat } from './units';
import { UNITS, UNIT_HP } from '../data/units';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import {
  BARB_CAMPS_PER_MAJOR, BARB_FIRST_TURN_PCT, BARB_CAMP_DIST_CAMP, BARB_CAMP_DIST_CITY, BARB_TECH_PCT, BARB_REGION_MIN,
  BARB_SCOUT_WAIT, BARB_ISLAND_PLOTS, BARB_COAST_WATER, BARB_CAMP_TERRAINS, BARB_CAMP_FEATURES, BARB_TRIBES,
  BARB_NAMES_PER_KIND, BARB_MAX_UNITS, BARB_MAX_SCOUTS, BARB_TAG_UNITS, BARB_FREE_TECHS, barbNameRangedPct,
  BARB_BOLD_TURN, BARB_BOLD_KILL, BARB_BOLD_UNIT_LOST, BARB_BOLD_SCOUT_LOST, BARB_RAID_BOLDNESS, BARB_ASSAULT_BOLDNESS,
  BARB_SPOT_THROTTLE, BARB_SPOT_THROTTLE_PER_LEVEL, BARB_HOME_RANGE, BARB_RAID_RECRUIT_TURNS, BARB_ASSAULT_RECRUIT_TURNS,
  BARB_PROTECT_DAMAGE, DEFAULT_HANDICAP, barbForce, barbNameRaidBoldness,
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
 * THE CAMP STEP (0x14fcc0). The target is the majors' camps
 * (BARBARIAN_CAMP_MAX_PER_MAJOR_CIV each) times the share of the land no
 * major sees now, less the camps standing; the first step that adds lays
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
  return type ? raiseType(state, tribe, type, radius, n) : [];
}

function raiseType(state: GameState, tribe: BarbTribe, type: string, radius: number, n: number): number[] {
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

const alive = (state: GameState, id: number) => state.units.some((u) => u.id === id);
const living = (state: GameState, ids: number[]) => ids.filter((id) => alive(state, id)).length;

/** the tribe that raised a unit */
function tribeOfUnit(state: GameState, id: number): BarbTribe | undefined {
  return tribesOf(state).find((tr) => tr.units.includes(id) || tr.scouts.includes(id));
}

/** a player's handicap (a Difficulties index): a seat's own, else the AI's */
function handicapOf(state: GameState, seat: number): number {
  return state.seats[seat]?.handicap ?? DEFAULT_HANDICAP;
}

/** the boldness a tribe's raid waits for: its name's own, else its kind's */
function raidBoldness(tribe: BarbTribe): number {
  return barbNameRaidBoldness(tribe.kind, tribe.name) ?? BARB_RAID_BOLDNESS;
}

/**
 * A TRIBE'S TURN (0x1488a0): its spawn clock runs; at its interval — the
 * tribe's TurnsToWarriorSpawn at the speed, or the SpawnRate its operation
 * set — it resets and raises the first unit its operation asked for, else,
 * while the tribe holds fewer than its NumMilitary, one unit within a plot of
 * the camp — ranged when "Barbarian Ranged unit roll" falls under
 * PercentRangedUnits, else melee. A turn the clock does not strike, a tribe
 * short of scouts counts toward one, raised within two plots on the fifth.
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
      const ids = raiseType(state, tribe, tribe.queue.shift()!, 1, 1);
      tribe.units.push(...ids);
      tribe.fresh.push(...ids);
    } else if (living(state, tribe.units) < BARB_MAX_UNITS) {
      const pct = barbNameRangedPct(tribe.kind, tribe.name) ?? def.rangedPct;
      const ranged = randRange(state, 100, 'Barbarian Ranged unit roll') < pct;
      const ids = raise(state, tribe, ranged ? def.rangedTag : def.meleeTag, 1, 1);
      tribe.units.push(...ids);
      tribe.fresh.push(...ids);
    }
  } else if (living(state, tribe.scouts) < BARB_MAX_SCOUTS) {
    tribe.scoutTurns += 1;
    if (tribe.scoutTurns >= BARB_SCOUT_WAIT) {
      tribe.scouts.push(...raise(state, tribe, def.scoutTag, 2, 1));
      tribe.scoutTurns = 0;
    }
  }
  tribe.boldness = (tribe.boldness ?? 0) + BARB_BOLD_TURN;
  if (tribe.op && !opStands(state, tribe.op)) delete tribe.op;
  if (tribe.assaultTargets?.length && !tribe.op?.assault) {
    if (tribe.boldness < BARB_ASSAULT_BOLDNESS) return;
    if (startOp(tribe, tribe.assaultTargets[0], true)) tribe.assaultTargets.shift();
  } else if (tribe.raidTargets?.length && !(tribe.op && !tribe.op.assault)) {
    if (tribe.boldness < raidBoldness(tribe)) return;
    if (startOp(tribe, tribe.raidTargets[0], false)) tribe.raidTargets.shift();
  }
}

/** an operation stands while it recruits, then while one of its units lives */
function opStands(state: GameState, op: BarbOp): boolean {
  return !op.recruited || op.units.some((id) => alive(state, id));
}

/** a tribe takes on a raid or a city assault (0x149980 / 0x1497d0): never
 *  beside another; whether it took it */
function startOp(tribe: BarbTribe, target: BarbTarget, assault: boolean): boolean {
  if (tribe.op) return false;
  tribe.op = { assault, target, turns: 0, recruited: false, units: [] };
  return true;
}

/**
 * AN OPERATION'S TURN while it recruits ("Raid City" / "Barbarian City
 * Attack"): its first sets the tribe's spawn interval to its force's
 * SpawnRate ("Barbarian Spawn Change", 0x7c6e50); each takes the force
 * (0x7c7580: the BarbarianAttackForces row by the target owner's handicap,
 * each class the barbarians cannot raise dropped, 0x144610) from the tribe's
 * units of each class, those raised this turn not yet among them, and asks
 * for the rest, melee first — raised one a spawn turn. Once the force is
 * whole it is the operation's and the tribe's interval is its own again;
 * past its Turn Limiter it gives up the same way, with no force.
 */
function opTurn(state: GameState, tribe: BarbTribe, op: BarbOp): void {
  const force = barbForce(tribe.kind, !op.assault, handicapOf(state, op.target.seat));
  if (op.turns === 0 && force) tribe.every = force.rate;
  op.turns += 1;
  if (op.turns > (op.assault ? BARB_ASSAULT_RECRUIT_TURNS : BARB_RAID_RECRUIT_TURNS)) {
    op.recruited = true;
    delete tribe.every;
    return;
  }
  const fresh = new Set(tribe.fresh ?? []);
  const free = tribe.units.filter((id) => alive(state, id) && !fresh.has(id));
  const taken: number[] = [];
  const missing: string[] = [];
  for (const [tag, n] of force?.units ?? []) {
    const type = barbUnitFor(state, tag);
    if (!type) continue;
    let have = 0;
    for (const id of free) {
      if (have >= n) break;
      const u = state.units.find((x) => x.id === id)!;
      if (taken.includes(id) || !BARB_TAG_UNITS[tag].includes(u.type)) continue;
      taken.push(id);
      have++;
    }
    for (let k = have; k < n; k++) missing.push(type);
  }
  if (missing.length) {
    tribe.queue = missing;
    return;
  }
  op.recruited = true;
  op.units = taken;
  delete tribe.every;
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
 * A BARBARIAN SCOUT LOOKS from its plot: each owned plot newly in its sight
 * (a city's territory, any player's), in plot order, is a report (0x153ef0) — once
 * the player's throttle allows, its tribe's scout walks home with a major's
 * city when none walks yet (0x1485c0), and the player is spared further reports
 * BARBARIAN_MAX_THROTTLE_PER_RAID less BARBARIAN_LOWER_THROTTLE_PER_DIFFICULTY
 * a handicap level turns.
 */
export function barbScoutLook(state: GameState, unit: Unit): void {
  const tribe = tribesOf(state).find((tr) => tr.alive && tr.scouts.includes(unit.id));
  if (!tribe) return;
  const { map } = state;
  const from = map.tiles[unit.tileIndex];
  const through = unitSeesThrough(unit);
  const now: number[] = [];
  for (const t of tilesWithin(map, from.col, from.row, unitSight(unit, state))) {
    if (isTerritorial(tileSeat(t)) && canSee(map, from, t, through)) now.push(t.index);
  }
  now.sort((x, y) => x - y);
  const saw = new Set((tribe.saw ??= {})[unit.id] ?? []);
  tribe.saw[unit.id] = now;
  const next = (state.barbSpotNext ??= {});
  for (const p of now) {
    if (saw.has(p)) continue;
    const t = map.tiles[p];
    const seat = tileSeat(t);
    if (state.turn < (next[seat] ?? 0)) continue;
    // a major's city alone sends the scout home (0x484a10: a full civ)
    if (!tribe.homing && seat >= 0 && seat < state.seats.length) tribe.homing = { scout: unit.id, target: { seat, plot: cityCentreOf(state, t) } };
    next[seat] = state.turn + Math.max(0, BARB_SPOT_THROTTLE - BARB_SPOT_THROTTLE_PER_LEVEL * handicapOf(state, seat));
  }
}

/** can another player's fighting unit strike the plot next turn: one within
 *  its moves plus its reach (its Range, 1 for melee) — Protect Unit's danger
 *  (0x7f07c0 reads the AI's influence map, unread: a LAB reading) */
function threatened(state: GameState, plot: number): boolean {
  const { map } = state;
  const t = map.tiles[plot];
  return state.units.some((x) => {
    if (isBarbSeat(x.seat) || unitIsNoncombat(x.type)) return false;
    const def = UNITS[x.type];
    if (!def) return false;
    const at = map.tiles[x.tileIndex];
    return hexDistance(map, at.col, at.row, t.col, t.row) <= def.moves + Math.max(1, def.ranged?.range ?? 0);
  });
}

/**
 * A SCOUT HOME WITH ITS REPORT (0x148270): within BARB_HOME_RANGE of its
 * camp the city is its tribe's — a raid at once where the tribe's Boldness
 * reaches its RaidingBoldness and no raid runs, else a city its raid waits
 * for. A scout lost on the way reports nothing; one damaged by
 * BARB_PROTECT_DAMAGE of its health or more where an enemy can strike
 * (`threatened`) holds its report until it stands home unthreatened or
 * whole ("Barbarian Found City"'s Protect Unit beside its Move Unit:
 * runs/h1_duelw1121, the camp at (3,19) — its Scout, struck for 47 by
 * China's Warrior at t24, is home at t25 three plots from that Warrior and
 * reports nothing; home again at t33 with no enemy near, the raid recruits
 * at once, Warriors at t34, t35 and t36).
 */
function scoutReports(state: GameState, tribe: BarbTribe): void {
  const h = tribe.homing;
  if (!h) return;
  const u = state.units.find((x) => x.id === h.scout);
  if (!u) { delete tribe.homing; return; }
  const a = state.map.tiles[u.tileIndex];
  const c = state.map.tiles[tribe.plot];
  if (hexDistance(state.map, a.col, a.row, c.col, c.row) > BARB_HOME_RANGE) return;
  if (UNIT_HP - u.hp >= BARB_PROTECT_DAMAGE * UNIT_HP && threatened(state, u.tileIndex)) return;
  delete tribe.homing;
  const can = !(tribe.op && !tribe.op.assault);
  if (can && (tribe.boldness ?? 0) >= raidBoldness(tribe) && startOp(tribe, h.target, false)) return;
  (tribe.raidTargets ??= []).push(h.target);
}

/**
 * THE BARBARIANS' OPERATIONS in their player's turn, after their units
 * moved: each living tribe's scouts look where they stand, a scout home
 * reports, and each operation recruiting takes its turn.
 */
export function barbarianOps(state: GameState): void {
  for (const tr of tribesOf(state)) {
    if (!tr.alive) continue;
    for (const id of tr.scouts) {
      const u = state.units.find((x) => x.id === id);
      if (u) barbScoutLook(state, u);
    }
    scoutReports(state, tr);
    if (tr.op && !tr.op.recruited) opTurn(state, tr, tr.op);
  }
}

/**
 * A BATTLE'S DEAD MOVE A TRIBE'S BOLDNESS (0x1540b0 / 0x148e90): the
 * defender dead, else the attacker — an enemy a tribe's unit killed
 * BARBARIAN_BOLDNESS_PER_KILL, a tribe's unit lost
 * BARBARIAN_BOLDNESS_PER_UNIT_LOST, its scout BARBARIAN_BOLDNESS_PER_SCOUT_LOST.
 */
export function barbBattleBoldness(state: GameState, attacker: Unit, defender: Unit, aDied: boolean, dDied: boolean): void {
  if (!dDied && !aDied) return;
  const [killer, victim] = dDied ? [attacker, defender] : [defender, attacker];
  if (isBarbSeat(killer.seat) && !isBarbSeat(victim.seat)) {
    const tr = tribeOfUnit(state, killer.id);
    if (tr) tr.boldness = (tr.boldness ?? 0) + BARB_BOLD_KILL;
  } else if (isBarbSeat(victim.seat) && !isBarbSeat(killer.seat)) {
    const tr = tribeOfUnit(state, victim.id);
    if (tr) tr.boldness = (tr.boldness ?? 0) + (tr.scouts.includes(victim.id) ? BARB_BOLD_SCOUT_LOST : BARB_BOLD_UNIT_LOST);
  }
}

/** where a scout walking home with its report heads: its camp */
export function barbHomingCamp(state: GameState, unit: Unit): number | undefined {
  const tr = tribesOf(state).find((x) => x.alive && x.homing?.scout === unit.id);
  return tr?.plot;
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
