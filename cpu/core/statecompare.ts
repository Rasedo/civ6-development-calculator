/**
 * STATE COMPARE, TypeScript side — the manifest's extractors, the digests, the
 * census.
 *
 * `shared/statecompare.manifest.json` names every field the two engines
 * compare, and for each one both `covers` (this engine's type surface) and
 * `planes` (the GPU's `_MUTABLE` tensors). This module implements one
 * EXTRACTOR per manifest field name and folds them into per-group digests.
 * `gpu/core/statecompare.py` is the twin: same manifest, same field names, same
 * digest arithmetic.
 *
 * Three things live here:
 *
 *   `stateDigest(state)`  the per-turn product. One `exact` and one `milli`
 *       digest per group, order-independent, so a mismatch says WHICH GROUP
 *       diverged on WHICH TURN without either engine shipping its state.
 *
 *   `groupDump(state, group)`  the keyed rows behind a digest — the substrate
 *       a by-name diff reads once a digest says which group moved.
 *
 *   `census()`  the anti-rot check: every field of every type the manifest
 *       names in `censusTypes` must be covered by a manifest field or sit on an
 *       explicit, justified exclusion list. It reads `cpu/core/types.ts` as
 *       text, because a TypeScript interface has no runtime existence to walk.
 *
 * DIGEST ARITHMETIC. Both engines fold 32-bit words with the same mixing
 * function and ADD the per-row hashes, which is what makes the result
 * independent of the order the rows were walked in — TS's array order and the
 * GPU's slot order need never agree. Values are quantised to integers first
 * (`exact` fields as they stand, `milli` fields as Math.round(x*1000)) and
 * split into two 32-bit halves, so nothing depends on float formatting. The
 * `exact` and `milli` digests are SEPARATE because a hash cannot carry a
 * tolerance: an integer disagreement and a float-accumulator disagreement are
 * different findings and the caller must be able to treat them differently.
 *
 * NODE ONLY: the manifest and the type surface are read off disk. Nothing in
 * the browser build imports this.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { City, CityState, GameState, Seat, Tile, Unit } from './types';
import { prophetsOf, warsOf, warTurnsWith } from './seats';
import { questFor } from './observe';
import { envoysOf } from './cityStates';
import { prodLayout } from './prodLayout';
import { SCAFFOLD_DISTRICTS, PLACEABLE_DISTRICTS } from '../data/districts';
import { IMPROVEMENT_IDS } from './unitActions';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { GP_CLASSES, GREAT_PEOPLE } from '../data/greatPeople';
import { CITY_STATE_TYPES, CITY_STATE_MAX_HP, LEVY_COOLDOWN } from '../data/cityStates';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS } from '../data/religion';

const MANIFEST_URL = new URL('../../shared/statecompare.manifest.json', import.meta.url);
const TYPES_URL = new URL('./types.ts', import.meta.url);

export interface ManifestField {
  name: string;
  compare: 'exact' | 'milli';
  covers: string[];
  planes: string[];
  note?: string;
  gap?: string;
}
export interface ManifestGroup {
  name: string;
  kind: string;
  covers: string[];
  fields: ManifestField[];
}
export interface Manifest {
  version: number;
  censusTypes: string[];
  groups: ManifestGroup[];
  exclusions: { ts: { path: string; why: string }[]; gpu: { plane: string; why: string }[] };
}

let cached: Manifest | null = null;

export function loadManifest(): Manifest {
  if (!cached) cached = JSON.parse(readFileSync(fileURLToPath(MANIFEST_URL), 'utf-8')) as Manifest;
  return cached;
}


function mix32(h: number): number {
  h = h >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function step(h: number, x: number): number {
  return mix32((((h >>> 0) ^ (x >>> 0)) >>> 0) + 0x9e3779b9);
}

const TWO32 = 4294967296;

/** Math.round is half-up toward +inf, which is what the GPU's `js_round` and
 *  the Python twin's `floor(x + 0.5)` both spell. Python's own round() is
 *  half-to-even and would disagree on every .5 boundary. */
function quantise(v: number | boolean, scale: number): number {
  const n = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  return scale === 1 ? (Number.isInteger(n) ? n : Math.round(n)) : Math.round(n * scale);
}

export type Val = number | boolean | (number | boolean)[];

function fold(h: number, value: Val, scale: number): number {
  const seq = Array.isArray(value) ? value : [value];
  let acc = step(h, seq.length);
  for (const v of seq) {
    const q = quantise(v, scale);
    acc = step(acc, ((q % TWO32) + TWO32) % TWO32);
    acc = step(acc, ((Math.floor(q / TWO32) % TWO32) + TWO32) % TWO32);
  }
  return acc;
}

/** Order-independent accumulator: per-row hashes are ADDED, and a second
 *  re-mixed sum widens the result to 64 bits so distinct row sets do not
 *  collide at 32. */
class Acc {
  private a = 0;
  private b = 0;
  add(rowHash: number): void {
    this.a = (this.a + rowHash) >>> 0;
    this.b = (this.b + mix32(rowHash ^ 0x5bf03635)) >>> 0;
  }
  hex(): string {
    return this.b.toString(16).padStart(8, '0') + this.a.toString(16).padStart(8, '0');
  }
}

// --- rosters --------------------------------------------------------------
// Every index space the GPU stores is derived here from the SAME data the
// seeder ships into rules.json, so no second ordering can appear.

const LAYOUT = prodLayout();
const TECH_IDX = new Map(Object.keys(TECHS).map((id, i) => [id, i]));
const CIVIC_IDX = new Map(Object.keys(CIVICS).map((id, i) => [id, i]));
const BUILDING_IDX = new Map(LAYOUT.buildings.map((id, i) => [id, i]));
const UNIT_IDX = new Map(LAYOUT.units.map((id, i) => [id, i]));
const WONDER_IDX = new Map(LAYOUT.wonders.map((id, i) => [id, i]));
const PROJECT_IDX = new Map(LAYOUT.projects.map((id, i) => [id, i]));
const SCAFFOLD_IDX = new Map(SCAFFOLD_DISTRICTS.map((d, i) => [d.id as string, i]));
const GP_CLASS_OF = new Map<string, number>();
for (const [cls, defs] of Object.entries(GREAT_PEOPLE)) {
  const ci = GP_CLASSES.indexOf(cls as (typeof GP_CLASSES)[number]);
  for (const d of defs) GP_CLASS_OF.set(d.id, ci);
}
const beliefIdx = (pool: Record<string, unknown>) => new Map(Object.keys(pool).map((id, i) => [id, i]));
const PANTHEON_IDX = beliefIdx(PANTHEONS);
const FOLLOWER_IDX = beliefIdx(FOLLOWER_BELIEFS);
const FOUNDER_IDX = beliefIdx(FOUNDER_BELIEFS);
const ENHANCER_IDX = beliefIdx(ENHANCER_BELIEFS);

const idx = (m: Map<string, number>, id: string | null | undefined): number =>
  id == null ? -1 : m.get(id) ?? -1;

/** The front queue item as a PRODUCTION COLUMN in the shared layout
 *  (cpu/core/prodLayout.ts), which is the space the GPU's `city_current` uses.
 *  -1 = an empty queue, matching the GPU's idle slot. */
function queueColumn(q: City['queue'][number] | undefined): number {
  if (!q) return -1;
  switch (q.kind) {
    case 'building': {
      const i = BUILDING_IDX.get(q.building);
      return i === undefined ? -1 : i;
    }
    case 'settler':
      return LAYOUT.settlerCol;
    case 'unit': {
      const i = UNIT_IDX.get(q.unit);
      return i === undefined ? -1 : LAYOUT.unitLo + i;
    }
    case 'district': {
      const i = SCAFFOLD_IDX.get(q.district);
      return i === undefined ? -1 : LAYOUT.districtLo + i;
    }
    case 'wonder': {
      const i = WONDER_IDX.get(q.wonder);
      return i === undefined ? -1 : LAYOUT.wonderLo + i;
    }
    case 'project': {
      const i = PROJECT_IDX.get(q.project);
      return i === undefined ? -1 : LAYOUT.projectLo + i;
    }
  }
}

function queueTile(q: City['queue'][number] | undefined): number {
  if (!q) return -1;
  return q.kind === 'district' || q.kind === 'wonder' ? q.tileIndex : -1;
}

/** The price of the front queue item, the way the GPU's `city_cost` holds it.
 *  Settler/project/district items carry their own `cost`; a unit item may LOCK
 *  one (escalated builders) and otherwise takes the roster price; building and
 *  wonder items carry none at all and are priced from the catalog. The same
 *  rule as `the deleted trace, queueItemCost`, which is the derivation the
 *  trace's `civCity.cost` column is green against. */
function queueItemCost(q: City['queue'][number] | undefined): number {
  if (!q) return 0;
  switch (q.kind) {
    case 'settler':
    case 'project':
    case 'district':
      return q.cost ?? 0;
    case 'unit':
      return q.cost ?? UNITS[q.unit]?.cost ?? 0;
    case 'building':
      return BUILDINGS[q.building]?.cost ?? 0;
    case 'wonder':
      return BUILT_WONDERS[q.wonder]?.cost ?? 0;
  }
}

const QUEST_KIND: Record<string, number> = { clearCamp: 1, sendTradeRoute: 2, buildDistrict: 3 };


type Extractor = (state: GameState, rows: readonly unknown[]) => Val[];

export interface CityRow {
  seat: number;
  city: City;
}

const civSeats = (state: GameState): Seat[] => state.seats;

const overSeats = (fn: (s: Seat, state: GameState) => Val): Extractor =>
  (state, rows) => (rows as Seat[]).map((s) => fn(s, state));
const overCities = (fn: (r: CityRow, state: GameState) => Val): Extractor =>
  (state, rows) => (rows as CityRow[]).map((r) => fn(r, state));
const overUnits = (fn: (u: Unit) => Val): Extractor => (_state, rows) => (rows as Unit[]).map(fn);
const overTiles = (fn: (t: Tile) => Val): Extractor => (_state, rows) => (rows as Tile[]).map(fn);
const overCityStates = (fn: (cityState: CityState, state: GameState) => Val): Extractor =>
  (state, rows) => (rows as CityState[]).map((cityState) => fn(cityState, state));

const warClockLine = (state: GameState, seat: number): Val =>
  warsOf(state, seat)
    .slice()
    .sort((a, b) => a - b)
    .map((foe) => [foe, warTurnsWith(state, seat, foe)]) as unknown as Val;

const GAME: Record<string, Extractor> = {
  turn: (s) => [s.turn],
  rng: (s) => [s.rngState >>> 0],
  gameOver: (s) => [s.gameOver ? 1 : 0],
  victoryType: (s) => [s.victoryType ?? 0],
  victoryRow: (s) => [s.victoryRow ?? -1],
  congressSessions: (s) => [s.congressSessions ?? 0],
  roadBridges: (s) => [s.roadBridges ? 1 : 0],
  pantheonsClaimed: (s) => [s.claimedPantheons.length],
  beliefsClaimed: (s) => [s.claimedBeliefs.length],
  enhancerBeliefsClaimed: (s) => [(s.claimedEnhancers ?? []).length],
  greatPeopleByClass: (s) => {
    const counts = GP_CLASSES.map(() => 0);
    for (const id of s.claimedGreatPeople) {
      const c = GP_CLASS_OF.get(id);
      if (c !== undefined && c >= 0) counts[c] += 1;
    }
    return [counts];
  },
  barbCamps: (s) => [[...s.barbSeat.camps].sort((a, b) => a - b)],
  cityCount: (s) => [civSeats(s).reduce((n, x) => n + x.cities.length, 0)],
  unitCount: (s) => [s.units.length],
};

const wwPairs = (rec: Record<number, number>, live: (v: number) => boolean): number[] => {
  const out: number[] = [];
  for (const k of Object.keys(rec).map(Number).sort((a, b) => a - b)) {
    const v = rec[k];
    if (live(v)) out.push(k, v);
  }
  return out;
};

const SEAT: Record<string, Extractor> = {
  // Fog — rendered DENSE: an empty array (nothing revealed yet) digests as
  // all-zeros, the GPU plane's zeros init. Every seat spawns (and reveals)
  // at t0, so the empty state never survives to a digest in practice.
  explored: overSeats((s, st) => (s.explored?.length ? s.explored : new Array(st.map.tiles.length).fill(0))),
  treasury: overSeats((s) => s.treasury),
  cultureTotal: overSeats((s) => s.cultureTotal),
  faith: overSeats((s) => s.faith),
  tourism: overSeats((s) => s.tourism ?? 0),
  warmonger: overSeats((s) => s.warmonger),
  diplomaticFavor: overSeats((s) => s.diplomaticFavor),
  diplomaticPoints: overSeats((s) => s.diplomaticPoints),
  influencePoints: overSeats((s) => s.influencePoints),
  envoysAvailable: overSeats((s) => s.envoysAvailable),
  buildersTrained: overSeats((s) => s.buildersTrained),
  bestMeleeCS: overSeats((s) => s.bestMeleeCS),
  techs: overSeats((s) => s.research.techs.map((t) => idx(TECH_IDX, t)).sort((a, b) => a - b)),
  civics: overSeats((s) => s.research.civics.map((c) => idx(CIVIC_IDX, c)).sort((a, b) => a - b)),
  // TS keeps ONE `boosted` list mixing tech and civic ids; the GPU keeps two
  // masks. Civics are offset past the tech table so the spaces cannot collide.
  boosted: overSeats((s) => {
    const nt = TECH_IDX.size;
    const out: number[] = [];
    for (const id of s.research.boosted) {
      const t = TECH_IDX.get(id);
      if (t !== undefined) out.push(t);
      else {
        const c = CIVIC_IDX.get(id);
        if (c !== undefined) out.push(nt + c);
      }
    }
    return out.sort((a, b) => a - b);
  }),
  currentTech: overSeats((s) => idx(TECH_IDX, s.research.tech)),
  currentCivic: overSeats((s) => idx(CIVIC_IDX, s.research.civic)),
  techProgress: overSeats((s) => s.research.techProgress),
  civicProgress: overSeats((s) => s.research.civicProgress),
  cityCount: overSeats((s) => s.cities.length),
  wars: overSeats((s) => [...s.wars].sort((a, b) => a - b)),
  warTurns: overSeats((s, state) => warClockLine(state, s.seat)),
  peaceTurns: overSeats((s) => s.peaceTurns),
  warWeariness: overSeats((s) => wwPairs(s.ww, (v) => v !== 0)),
  warWearinessTurn: overSeats((s) => wwPairs(s.wwTurn, (v) => v >= 0)),
  eraScore: overSeats((s) => s.eraScore ?? 0),
  age: overSeats((s) => s.age ?? 1),
  prevAge: overSeats((s) => s.prevAge ?? 1),
  dedications: overSeats((s) => s.dedications ?? 1),
  dedicationPicks: overSeats((s) => [...(s.dedicationPicks ?? [])].sort((a, b) => a - b)),
  capitalTile: overSeats((s) => s.capitalTile ?? -1),
  holyTile: overSeats((s) => s.religion.holyTile ?? -1),
  religionFounded: overSeats((s) => (s.religion.founded ? 1 : 0)),
  gpPoints: overSeats((s) => GP_CLASSES.map((c) => s.gpp[c] ?? 0)),
  spaceProjects: overSeats((s) => s.spaceProjects.length),
  routeCount: overSeats((s) => (s.tradeRoutes ?? []).length),
  prophets: overSeats((s) => prophetsOf(s)),
  beliefPantheon: overSeats((s) => idx(PANTHEON_IDX, s.religion.pantheon)),
  beliefFollower: overSeats((s) => idx(FOLLOWER_IDX, s.religion.follower)),
  beliefFounder: overSeats((s) => idx(FOUNDER_IDX, s.religion.founder)),
  beliefEnhancer: overSeats((s) => idx(ENHANCER_IDX, s.religion.enhancer)),
  scienceTotal: overSeats((s) => s.scienceTotal),
  nextCityId: overSeats((s) => s.nextCityId),
  formalWars: overSeats((s) => [...s.formalWars].sort((a, b) => a - b)),
  denounced: overSeats((s) =>
    Object.keys(s.denounced)
      .map(Number)
      .sort((a, b) => a - b),
  ),
  allies: overSeats((s) => [...s.allies].sort((a, b) => a - b)),
  tilesPurchased: overSeats((s) => s.tilesPurchased),
};

const perCiv = (state: GameState, fn: (seat: number) => number): number[] =>
  civSeats(state).map((s) => fn(s.seat));

const CITY_STATE_G: Record<string, Extractor> = {
  type: overCityStates((cityState) => CITY_STATE_TYPES.indexOf(cityState.type)),
  centerIndex: overCityStates((cityState) => cityState.centerIndex),
  population: overCityStates((cityState) => cityState.population),
  hp: overCityStates((cityState) => cityState.hp ?? CITY_STATE_MAX_HP),
  envoys: overCityStates((cityState, st) => perCiv(st, (seat) => envoysOf(cityState, seat))),
  met: overCityStates((cityState, st) => perCiv(st, (seat) => (cityState.met.includes(seat) ? 1 : 0))),
  questKind: overCityStates((cityState, st) =>
    perCiv(st, (seat) => {
      const q = questFor(cityState, seat);
      return q ? QUEST_KIND[q.kind] ?? 0 : 0;
    }),
  ),
  questIssued: overCityStates((cityState, st) =>
    perCiv(st, (seat) => cityState.seatQuestIssuedTurn?.[seat] ?? 0),
  ),
  questCamp: overCityStates((cityState, st) => perCiv(st, (seat) => questFor(cityState, seat)?.campIndex ?? -1)),
  questDistrict: overCityStates((cityState, st) =>
    perCiv(st, (seat) => {
      const d = questFor(cityState, seat)?.district;
      return d === undefined ? -1 : PLACEABLE_DISTRICTS.indexOf(d);
    }),
  ),
  lastLevyTurn: overCityStates((cityState) => cityState.lastLevyTurn ?? -LEVY_COOLDOWN),
  warTurns: overCityStates((cityState, state) => warClockLine(state, cityState.seat)),
};

const CITY: Record<string, Extractor> = {
  seat: overCities((r) => r.seat),
  population: overCities((r) => r.city.population),
  hp: overCities((r) => r.city.hp),
  outerHp: overCities((r) => r.city.outerHp ?? 0),
  isCapital: overCities((r) => (r.city.isCapital ? 1 : 0)),
  foodBox: overCities((r) => r.city.foodBox),
  cultureBox: overCities((r) => r.city.cultureBox),
  tilesAcquired: overCities((r) => r.city.tilesAcquired),
  loyalty: overCities((r) => r.city.loyalty ?? 100),
  // Ids the production layout does not carry (PALACE, the scripted-held
  // buildings) have no GPU column at all, so they are dropped rather than
  // encoded as -1 — a -1 would compare against a column that does not exist.
  buildings: overCities((r) =>
    r.city.buildings
      .map((b) => BUILDING_IDX.get(b))
      .filter((i): i is number => i !== undefined)
      .sort((a, b) => a - b),
  ),
  productionBank: overCities((r) => r.city.productionBank ?? 0),
  queueFront: overCities((r) => [queueColumn(r.city.queue[0]), queueTile(r.city.queue[0])]),
  queueProgress: overCities((r) => r.city.queue[0]?.progress ?? 0),
  queueCost: overCities((r) => queueItemCost(r.city.queue[0])),
  followedReligion: overCities((r) => r.city.followedReligion ?? -1),
  // The GPU's pressure vector is one column per RELIGION, and religions are
  // indexed in the civ-seat space, so the vector is exactly as wide as the
  // civ roster whatever TS happens to have allocated.
  religionPressure: overCities((r, st) => {
    const p = r.city.religionPressure ?? [];
    return civSeats(st).map((_s, g) => p[g] ?? 0);
  }),
  greatWorksWriting: overCities((r) => r.city.greatWorksWriting ?? 0),
  greatWorksArt: overCities((r) => r.city.greatWorksArt ?? 0),
  greatWorksMusic: overCities((r) => r.city.greatWorksMusic ?? 0),
  relics: overCities((r) => r.city.relics ?? 0),
  artifacts: overCities((r) => r.city.artifacts ?? 0),
};

const UNIT_G: Record<string, Extractor> = {
  seat: overUnits((u) => u.seat),
  type: overUnits((u) => idx(UNIT_IDX, u.type)),
  hp: overUnits((u) => u.hp),
  charges: overUnits((u) => u.charges ?? 0),
  fortifyTurns: overUnits((u) => u.fortifyTurns ?? 0),
  xp: overUnits((u) => u.xp ?? 0),
  embarked: overUnits((u) => (u.embarked ? 1 : 0)),
  movesLeft: overUnits((u) => u.movesLeft),
  movesFull: overUnits((u) => u.movesFull ?? UNITS[u.type]?.moves ?? 0),
};

const TILE: Record<string, Extractor> = {
  ownerSeat: overTiles((t) => t.ownerSeat),
  ownerCity: overTiles((t) => t.ownerCity),
  improvement: overTiles((t) => (t.improvement === null ? -1 : IMPROVEMENT_IDS.indexOf(t.improvement))),
  pillaged: overTiles((t) => (t.pillaged ? 1 : 0)),
  district: overTiles((t) => (t.district === null ? -1 : PLACEABLE_DISTRICTS.indexOf(t.district))),
  districtComplete: overTiles((t) => (t.districtComplete ? 1 : 0)),
  districtPillaged: overTiles((t) => (t.districtPillaged ? 1 : 0)),
  builtWonder: overTiles((t) => idx(WONDER_IDX, t.builtWonder)),
  builtWonderComplete: overTiles((t) => (t.builtWonderComplete ? 1 : 0)),
  antiquity: overTiles((t) => (t.antiquity ? 1 : 0)),
  encampHp: overTiles((t) => t.encampHp ?? 0),
  road: overTiles((t) => (t.road ? 1 : 0)),
  fertility: overTiles((t) => t.fertility),
  droughtTurns: overTiles((t) => t.droughtTurns),
  hasFeature: overTiles((t) => (t.feature === null ? 0 : 1)),
  hasResource: overTiles((t) => (t.resource === null ? 0 : 1)),
};

const EXTRACTORS: Record<string, Record<string, Extractor>> = {
  game: GAME,
  seat: SEAT,
  cityState: CITY_STATE_G,
  city: CITY,
  unit: UNIT_G,
  tile: TILE,
};


/** Is this unit type a CIVILIAN? Spelled the way the seeder ships it into
 *  rules.units (`civilian: u.charges !== undefined`), because the GPU's
 *  `_p_civ` roster column is that same flag. */
const isCivilianType = (type: string): boolean => UNITS[type]?.charges !== undefined;

export function groupRows(state: GameState, group: string): readonly unknown[] {
  switch (group) {
    case 'game':
      return [0];
    case 'seat':
      return civSeats(state);
    case 'cityState':
      return state.cityStates ?? [];
    case 'city':
      return civSeats(state).flatMap((s) => s.cities.map((city) => ({ seat: s.seat, city })));
    case 'unit':
      return state.units;
    case 'tile':
      return state.map.tiles;
    default:
      throw new Error(`unknown manifest group ${group}`);
  }
}

export function groupKeys(group: string, rows: readonly unknown[]): number[] {
  switch (group) {
    case 'game':
      return [0];
    case 'seat':
      return (rows as Seat[]).map((s) => s.seat);
    case 'cityState':
      return (rows as CityState[]).map((cityState) => cityState.id);
    case 'city':
      return (rows as CityRow[]).map((r) => r.city.centerIndex);
    case 'unit':
      return (rows as Unit[]).map((u) => u.tileIndex * 2 + (isCivilianType(u.type) ? 1 : 0));
    case 'tile':
      return (rows as Tile[]).map((t) => t.index);
    default:
      throw new Error(`unknown manifest group ${group}`);
  }
}


export interface GroupDigest {
  exact: string;
  milli: string;
  rows: number;
}

/** Every manifest field must have an extractor and every extractor a manifest
 *  field. A missing name is the failure the trace could only express as a
 *  silently shorter row. */
export function checkExtractors(man: Manifest = loadManifest()): void {
  const declared = new Set(man.groups.map((g) => g.name));
  const have = new Set(Object.keys(EXTRACTORS));
  for (const g of have) if (!declared.has(g)) throw new Error(`extractor group ${g} is not in the manifest`);
  for (const g of man.groups) {
    const reg = EXTRACTORS[g.name];
    if (!reg) throw new Error(`manifest group ${g.name} has no TS extractors`);
    const names = new Set(g.fields.map((f) => f.name));
    const impl = new Set(Object.keys(reg));
    const missing = [...names].filter((n) => !impl.has(n));
    const extra = [...impl].filter((n) => !names.has(n));
    if (missing.length || extra.length) {
      throw new Error(
        `group ${g.name}: manifest-only fields [${missing.join(', ')}], extractor-only fields [${extra.join(', ')}]`,
      );
    }
  }
}

/**
 * The digest arithmetic itself, over already-extracted columns. THE seam the
 * two engines must agree on bit for bit — `gpu/core/statecompare.py:fold_rows`
 * is the same function, and feeding both the same keys and columns is how that
 * is checked without either of them running a game.
 *
 * `cols[i].vals[r]` is field i's value for row r. Column ORDER is folded in, so
 * two fields swapping places changes the digest; ROW order is not, because the
 * per-row hashes are summed.
 */
export function foldRows(
  keys: readonly number[],
  cols: readonly { compare: 'exact' | 'milli'; vals: readonly Val[] }[],
): { exact: string; milli: string } {
  const accs = { exact: new Acc(), milli: new Acc() };
  for (let r = 0; r < keys.length; r++) {
    const seed = step(0x811c9dc5, ((keys[r] % TWO32) + TWO32) % TWO32);
    const h: Record<string, number> = { exact: seed, milli: seed };
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      h[c.compare] = fold(step(h[c.compare], i), c.vals[r], c.compare === 'milli' ? 1000 : 1);
    }
    accs.exact.add(h.exact);
    accs.milli.add(h.milli);
  }
  return { exact: accs.exact.hex(), milli: accs.milli.hex() };
}

export function stateDigest(state: GameState, opts: { includeGaps?: boolean } = {}): Record<string, GroupDigest> {
  const man = loadManifest();
  const out: Record<string, GroupDigest> = {};
  for (const g of man.groups) {
    const rows = groupRows(state, g.name);
    const keys = groupKeys(g.name, rows);
    const cols = g.fields
      .filter((f) => opts.includeGaps || f.gap === undefined)
      .map((f) => ({ compare: f.compare, vals: EXTRACTORS[g.name][f.name](state, rows) }));
    out[g.name] = { ...foldRows(keys, cols), rows: rows.length };
  }
  return out;
}

export function groupDump(
  state: GameState,
  group: string,
  opts: { includeGaps?: boolean } = {},
): Record<number, Record<string, Val>> {
  const man = loadManifest();
  const g = man.groups.find((x) => x.name === group);
  if (!g) throw new Error(`unknown manifest group ${group}`);
  const rows = groupRows(state, group);
  const keys = groupKeys(group, rows);
  const fields = g.fields.filter((f) => opts.includeGaps || f.gap === undefined);
  const cols = fields.map((f) => [f.name, EXTRACTORS[group][f.name](state, rows)] as const);
  const out: Record<number, Record<string, Val>> = {};
  for (let r = 0; r < rows.length; r++) {
    const row: Record<string, Val> = {};
    for (const [name, vals] of cols) row[name] = vals[r];
    out[keys[r]] = row;
  }
  return out;
}


export function interfaceFields(name: string, source: string): string[] {
  const head = new RegExp(`export interface ${name}\\b[^{]*\\{`).exec(source);
  if (!head) throw new Error(`no 'export interface ${name}' in cpu/core/types.ts`);
  let i = head.index + head[0].length;
  const start = i;
  let depth = 1;
  while (depth > 0) {
    if (i >= source.length) throw new Error(`unterminated interface ${name}`);
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    i += 1;
  }
  const body = source
    .slice(start, i - 1)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const out: string[] = [];
  let nest = 0;
  for (const line of body.split('\n')) {
    if (nest === 0) {
      const m = /^\s*(\w+)\??\s*:/.exec(line);
      if (m) out.push(m[1]);
    }
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') nest += 1;
      else if (ch === '}' || ch === ']' || ch === ')') nest -= 1;
    }
  }
  return out;
}

export function census(man: Manifest = loadManifest()): string[] {
  const source = readFileSync(fileURLToPath(TYPES_URL), 'utf-8');
  const covered = new Set<string>();
  for (const g of man.groups) {
    for (const p of g.covers) covered.add(p);
    for (const f of g.fields) for (const p of f.covers) covered.add(p);
  }
  const excluded = new Map(man.exclusions.ts.map((e) => [e.path, e.why]));

  const bad: string[] = [];
  const declared = new Set<string>();
  for (const t of man.censusTypes) {
    for (const f of interfaceFields(t, source)) {
      const path = `${t}.${f}`;
      declared.add(path);
      if (!covered.has(path) && !excluded.has(path)) {
        bad.push(`UNCOVERED ${path}: name it in a manifest field's \`covers\`, or exclude it with a reason`);
      }
      if (covered.has(path) && excluded.has(path)) {
        bad.push(`${path} is BOTH covered and excluded — one of the two justifications is stale`);
      }
    }
  }
  for (const path of [...covered, ...excluded.keys()]) {
    const type = path.split('.')[0];
    if (man.censusTypes.includes(type) && !declared.has(path)) {
      bad.push(`manifest names ${path}, which no interface declares — it was renamed or deleted`);
    }
  }
  for (const [path, why] of excluded) if (!why) bad.push(`excluded ${path} carries no reason`);
  return bad;
}
