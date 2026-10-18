/**
 * THE MAJORS' CONTRACTS AGAINST THE GAME'S: the city events, their trees and
 * the contracts (`aiCityTrees.ts`, `aiContracts.ts`) of each AI major's
 * cities run turn by turn on the records, their state carried from turn to
 * turn, against AI_CityBuild.csv's contract lines (SUBMITTED, ACCEPTED,
 * COMPLETED, CANCELLED, FAILED), its queue lines ("..., CONTRACT n") and its
 * Default Specialization lines (recordings made with the AI's verbose logs).
 * The majors' twin of `cityContractLab.ts`.
 *
 *    npx vite-node cpu/harness/majorContractLab.ts -- <dump.jsonl> [--player N] [--agendas P=A+B]
 *
 * The world each turn: the analysis tables the game logged (the plots'
 * improvement and district values, the city centre's buildings and units),
 * the record after the turn for what the player's turn start completes, the
 * record before it for the units and plots. The player's events run city by
 * city in the record's city order, its trees once after them. Not ported
 * and left out: the wonder event (CITY_EVENT_WONDER, "Seek Target Wonder"),
 * the operations the trees ask for, the purchases (PURCHASE lines complete
 * their contract).
 */
import { existsSync, readFileSync } from 'node:fs';
import { bool, loadCatalog, num, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import type { City, GameState, Unit } from '../core/types';
import { AI_BUILDINGS, AI_DISTRICTS, AI_UNITS } from '../data/aiBuildTables';
import { AI_CITY_EVENTS, AI_CITY_EVENT_LISTS } from '../data/aiCityTrees';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, specializationBests, type CityBuildTables, type PickFacts } from '../core/aiCityBuild';
import { majorBuildFacts, majorItemType, majorPickFacts } from '../core/majorCityBuild';
import { FX, FX_MIN } from '../core/aiValue';
import { cityContracts, contractBuilt, inHandCheck, queueContract, takesTurn, type AiContract, type ContractItem } from '../core/aiContracts';
import { buildingEvent, districtEvent, freeSlots, goalsReached, improvementEvent, newCityAi, pickImprovement, tickCityTrees,
  type CityAi, type CityTreeCity, type CityTreeWorld, type PlotEval, type TreeUnit } from '../core/aiCityTrees';
import { engineId, gameTypeOf } from '../data/aliases';
import { suzerainNames, validImprovementsIn } from '../core/rules';
import { IMPROVEMENTS } from '../data/improvements';
import { hexDistance, neighbors } from '../../world/hex';
import { civOf, tileSeat } from '../core/seats';
import { DISTRICTS } from '../data/districts';
import { BUILDINGS } from '../data/buildings';
import { UNITS } from '../data/units';
import { loadBuildLines, loadCityBuildCentre, loadCityBuildPlots, type BuildLine, type LoggedPlot } from './cityBuildLog';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const onlyPlayer = args.includes('--player') ? Number(args[args.indexOf('--player') + 1]) : null;
const agendaArg = new Map<number, string[]>((args.includes('--agendas') ? args[args.indexOf('--agendas') + 1].split(',') : [])
  .map((x) => [Number(x.split('=')[0]), x.split('=')[1].split('+')]));

const cat = loadCatalog(dump);
const recs: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord)
  .filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);
const centre = loadCityBuildCentre(dump);
const plots = loadCityBuildPlots(dump);
const lines = loadBuildLines(dump);
const byTurn = new Map<string, BuildLine[]>();
for (const l of lines) {
  const k = `${l.turn}:${l.player}`;
  (byTurn.get(k) ?? (byTurn.set(k, []), byTurn.get(k)!)).push(l);
}

/** the game's "City Build District Choice" draws by turn, in order: the
 *  majors' cities draw first */
const draws = new Map<number, number[]>();
{
  const path = dump.replace(/\.jsonl$/, '.randcalls.csv');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const p = line.split(',').map((x) => x.trim());
      if (p[5] !== 'City Build District Choice') continue;
      (draws.get(Number(p[0])) ?? (draws.set(Number(p[0]), []), draws.get(Number(p[0]))!)).push(Number(p[2]));
    }
  }
}

/** AI_Victories.csv's strategies followed by player at a turn */
const strategyRows: [number, number, string, string][] = [];
{
  const path = dump.replace(/\.jsonl$/, '.logs/AI_Victories.csv');
  if (existsSync(path)) {
    for (const l of readFileSync(path, 'utf8').split('\n')) {
      const c = l.split(',').map((x) => x.trim());
      if (/^\d+$/.test(c[0] ?? '') && c.length >= 4) strategyRows.push([Number(c[0]), Number(c[1]), c[2], c[3]]);
    }
  }
}
function strategiesAt(turn: number, player: number): Set<string> {
  const st = new Map<string, string>();
  for (const [t, p, s, v] of strategyRows) if (t <= turn && p === player) st.set(s, v);
  return new Set([...st].filter(([, v]) => v === 'Following').map(([k]) => k));
}

const raw = (xs: number[] | undefined): number[] => (xs ?? []).map((x) => (x <= -9999 ? FX_MIN : Math.round(x * FX)));
const W = recs[0].head.W;
const plotOf = (x: number, y: number): number => y * W + x;

const ais = new Map<number, CityAi>();
let contractSerial = 1;
let treeSerial = 1;
/** the turn each city's current item was set and its value (from the lines) */
const setTurn = new Map<string, { turn: number; value: number }>();

interface Tally { log: number; ours: number; both: number; miss: string[] }
const tally = new Map<string, Tally>();
const tallyOf = (k: string): Tally => tally.get(k) ?? (tally.set(k, { log: 0, ours: 0, both: 0, miss: [] }), tally.get(k)!);

function keyOf(l: { kind: string; state?: string; item: string; value?: number; tree?: string; city?: string }): string {
  if (l.kind === 'contract') return `${l.kind}|${l.state}|${l.item}|${l.state === 'SUBMITTED' ? l.value?.toFixed(1) : ''}|${l.tree}`;
  return `${l.kind}|${l.city}|${l.item}|${l.tree ?? ''}`;
}
function compare(turn: number, player: number, ours: BuildLine[], log: BuildLine[]): void {
  const left = [...log];
  for (const o of ours) {
    const cls = `${o.kind === 'contract' ? `${o.kind} ${o.state}` : o.kind} | ${o.tree ?? ''}`;
    const t = tallyOf(cls);
    t.ours += 1;
    const k = keyOf(o);
    const j = left.findIndex((l) => keyOf(l) === k);
    if (j >= 0) {
      t.both += 1;
      left.splice(j, 1);
    } else if (t.miss.length < 20) t.miss.push(`t${turn} p${player} ours ${k}`);
  }
  for (const l of log) tallyOf(`${l.kind === 'contract' ? `${l.kind} ${l.state}` : l.kind} | ${l.tree ?? ''}`).log += 1;
  for (const l of left) {
    const t = tallyOf(`${l.kind === 'contract' ? `${l.kind} ${l.state}` : l.kind} | ${l.tree ?? ''}`);
    if (t.miss.length < 40) t.miss.push(`t${turn} p${player} log  ${keyOf(l)}`);
  }
}

const itemName = (c: ContractItem): string => c.unit ?? c.building ?? c.district ?? '';

function recordIds(rec: TurnRecord, state: GameState): void {
  let j = 0;
  for (const ru of rec.units) {
    const u = state.units[j];
    if (u && u.tileIndex === ru.y * rec.head.W + ru.x) {
      u.id = ru.id;
      j++;
    }
  }
}

const unitsOfSeat = (state: GameState, seat: number): Unit[] => state.units.filter((u) => u.seat === seat);

function groundImprovements(state: GameState, seat: number, plot: number): string[] {
  return validImprovementsIn(state.map.tiles[plot], {
    unlocks: null, ownsTile: (t) => tileSeat(t) === seat, map: state.map,
    suzerain: suzerainNames(state, seat), civ: civOf(state, seat),
  }) as string[];
}

function flagged(row: readonly number[]): boolean {
  return row.some((v) => v > -9999 && v !== 0);
}

function evalsOf(before: GameState, after: GameState, seat: number, ps: readonly LoggedPlot[]): PlotEval[] {
  return ps.map((p) => {
    const plot = plotOf(p.x, p.y);
    const tile = before.map.tiles[plot];
    return {
      plot, owned: p.owned,
      improvable: !tile.district && groundImprovements(before, seat, plot).length > 0,
      districtOk: !tile.district && flagged(p.districts),
      nearOwned: !p.owned && neighbors(after.map, after.map.tiles[plot]).some((n) => n.ownerSeat === seat),
      improvements: raw(p.improvements), districts: raw(p.districts),
    };
  });
}

function typeOf(kind: 'building' | 'district' | 'unit', id: string): string {
  const prefix = kind === 'building' ? 'BUILDING_' : kind === 'district' ? 'DISTRICT_' : 'UNIT_';
  const rows: readonly { type: string; trait: string | null }[] = kind === 'building' ? AI_BUILDINGS : kind === 'unit' ? AI_UNITS : AI_DISTRICTS;
  const known = kind === 'building' ? BUILDINGS : kind === 'unit' ? UNITS : DISTRICTS;
  const row = rows.find((r) => r.trait === null && engineId(kind, r.type, prefix, known) === id);
  return row ? row.type : gameTypeOf(kind, id, prefix);
}

function stateLine(turn: number, player: number, city: string, c: AiContract): BuildLine {
  return { turn, player, city, kind: 'contract', contract: c.id, state: ['INVALID', 'CLAIMED', 'SUBMITTED', 'ACCEPTED', 'FAILED', 'IN PROGRESS', 'CANCELLED', 'COMPLETED'][c.progress],
    item: itemName(c), value: c.value / FX, tree: c.treeName };
}

function parseOurs(line: string): BuildLine {
  const p = line.split(',').map((x) => x.trim());
  const item = p[6] !== 'NO_UNIT' ? p[6] : p[7] !== 'NO_BUILDING' ? p[7] : p[8];
  return { turn: Number(p[0]), player: Number(p[1]), city: p[2], kind: 'contract', contract: Number(p[4].slice(9)), state: p[5], item,
    value: Number(p[9].replace('VALUE ', '')), tree: p.slice(10).join(',') };
}

function eventBuilding(t: CityBuildTables, pf: PickFacts): { index: number; value: number } {
  let index = -1;
  let value = FX_MIN;
  AI_BUILDINGS.forEach((b, k) => {
    if (pf.buildingHeld(b.type) || !pf.reasonsClear(b.type)) return;
    if (t.buildings[k] > value) {
      value = t.buildings[k];
      index = k;
    }
  });
  return { index, value };
}

function eventUnit(t: CityBuildTables): { index: number; value: number } {
  let index = -1;
  let value = FX_MIN;
  AI_UNITS.forEach((u, k) => {
    if (u.foundCity || u.buildCharges > 0 || u.combat === 0 || u.recon) return;
    if (t.units[k] > value) {
      value = t.units[k];
      index = k;
    }
  });
  return { index, value };
}

const itemOf = (type: string | null): ContractItem | null => (!type ? null : type.startsWith('UNIT_') ? { unit: type, building: null, district: null }
  : type.startsWith('BUILDING_') ? { unit: null, building: type, district: null } : type.startsWith('DISTRICT_') ? { unit: null, building: null, district: type } : null);

const history = newHistory();
advanceHistory(history, recs[0], cat);
let prev = importTurn(recs[0], cat, history);
recordIds(recs[0], prev.state);
for (let i = 0; i + 1 < recs.length; i++) {
  const a = recs[i];
  const b = recs[i + 1];
  advanceHistory(history, b, cat);
  const turn = a.turn;
  const imp = importTurn(b, cat, history);
  recordIds(b, imp.state);
  const before = prev;
  prev = imp;
  const state = imp.state;
  const turnDraws = [...(draws.get(turn) ?? [])];
  for (const p of b.players.filter((x) => bool(x.major) && x.id !== num(b.head.localPlayer))) {
    if (onlyPlayer !== null && p.id !== onlyPlayer) continue;
    const seat = imp.seatOfPlayer.get(p.id);
    if (seat === undefined) continue;
    const ai = ais.get(p.id) ?? (ais.set(p.id, newCityAi()), ais.get(p.id)!);
    const log = (byTurn.get(`${turn}:${p.id}`) ?? []);
    const ours: BuildLine[] = [];
    const sa = state.seats[seat];
    const sb = before.state.seats[seat];
    const research = {
      techs: [...(sb?.research.techs ?? []), ...(sb?.research.tech && sa.research.techs.includes(sb.research.tech) && !sb.research.techs.includes(sb.research.tech) ? [sb.research.tech] : [])]
        .map((t) => gameTypeOf('tech', t, 'TECH_')),
      civics: [...(sb?.research.civics ?? []), ...(sb?.research.civic && sa.research.civics.includes(sb.research.civic) && !sb.research.civics.includes(sb.research.civic) ? [sb.research.civic] : [])]
        .map((c) => gameTypeOf('civic', c, 'CIVIC_')),
      tech: sa.research.tech === null ? null : gameTypeOf('tech', sa.research.tech, 'TECH_'),
      civic: sa.research.civic === null ? null : gameTypeOf('civic', sa.research.civic, 'CIVIC_'),
    };
    const beforeUnits = unitsOfSeat(before.state, seat);
    const beforeIds = new Set(beforeUnits.map((u) => u.id));
    const made = unitsOfSeat(state, seat).filter((u) => !beforeIds.has(u.id));
    const treeUnits: TreeUnit[] = [...beforeUnits, ...made].map((u) => ({ id: u.id, type: typeOf('unit', u.type), plot: u.tileIndex, charges: u.charges ?? 0 }));
    const spent = new Set<number>();
    const cities: { city: City; name: string; cf: CityTreeCity; pfAi: PickFacts; tables: CityBuildTables; dsRan: boolean; prior: City | undefined; heldTypes: string[] }[] = [];
    for (const [city, dc] of imp.dumpOfCity as Map<City, { name: string }>) {
      if (city.seat !== seat) continue;
      const name = dc.name;
      const key = `${turn}:${p.id}:${name}`;
      const rows = centre.get(key);
      const logged = plots.get(key);
      if (!rows || !logged) continue;
      const prior = sb?.cities.find((c) => c.centerIndex === city.centerIndex);
      const facts = majorBuildFacts(state, city, () => 0, { strategies: new Map([[seat, strategiesAt(turn, p.id)]]), agendas: new Map([[seat, agendaArg.get(p.id) ?? []]]) });
      const pf = majorPickFacts(state, city, facts);
      const tables: CityBuildTables = { buildings: raw(rows.BUILDINGS), units: raw(rows.UNITS), projects: raw(rows.PROJECTS) };
      const evals = evalsOf(before.state, state, seat, logged);
      const cityLog = log.filter((l) => l.city === name);
      const dsRan = cityLog.some((l) => l.kind === 'pick' || l.kind === 'queued' || l.kind === 'none');
      const current: ContractItem | null = dsRan ? null : itemOf(majorItemType(prior?.queue[0]));
      const heldTypes = city.buildings.map((id) => typeOf('building', id));
      const pfAi: PickFacts = { ...pf, buildingHeld: (bt) => current?.building === bt || heldTypes.includes(bt) };
      for (const l of cityLog) if (l.kind === 'pick' || l.kind === 'queued') setTurn.set(`${p.id}:${name}`, { turn, value: Math.round((l.value ?? 0) * FX) });
      const set = setTurn.get(`${p.id}:${name}`) ?? { turn: -99, value: FX_MIN };
      const cf: CityTreeCity = {
        id: city.id, underThreat: false, current, productionTurn: set.turn, currentValue: set.value,
        buildingBlocked: (bt) => heldTypes.includes(bt),
        districtBlocked: (d) => (prior?.districts ?? []).some((x) => typeOf('district', x.type) === d && before.state.map.tiles[x.tileIndex].districtComplete),
        canTrain: (u) => pf.canTrain(u) && !AI_UNITS[AI_UNIT_INDEX.get(u)!].obsolete.some((x) => research.techs.includes(x) || research.civics.includes(x)),
        trainsSea: facts.trainsDomain('DOMAIN_SEA'),
        buildTurns: (c) => facts.buildTurns(itemName(c)),
        itemValue: (c) => (c.unit ? tables.units[AI_UNIT_INDEX.get(c.unit) ?? -1] ?? FX_MIN
          : c.building ? tables.buildings[AI_BUILDING_INDEX.get(c.building) ?? -1] ?? FX_MIN : FX_MIN),
        unitRow: (u) => {
          const r = AI_UNITS[AI_UNIT_INDEX.get(u)!];
          return { combat: r.combat, buildCharges: r.buildCharges, sea: r.domain === 'DOMAIN_SEA', mustPurchase: r.mustPurchase, recon: r.recon };
        },
        buildingRow: (bt) => {
          const r = AI_BUILDINGS[AI_BUILDING_INDEX.get(bt)!];
          return { defensive: r.defenseModifier > 0 || r.outerDefenseStrength > 0, mustPurchase: false };
        },
        districtDefensive: () => false,
        name, evals, bestImprovement: -1, buildings: tables.buildings, units: tables.units,
        eventBuilding: eventBuilding(tables, pfAi), eventUnit: eventUnit(tables),
        buildingHeld: (bt) => pfAi.buildingHeld(bt),
        districtHeld: (d) => city.districts.some((x) => typeOf('district', x.type) === d && state.map.tiles[x.tileIndex].districtComplete),
        threat: -1,
        plot: city.centerIndex,
      };
      cities.push({ city, name, cf, pfAi, tables, dsRan, prior, heldTypes });
    }
    if (!cities.length) continue;
    const world: CityTreeWorld = {
      turn, seat: p.id, cities: cities.map((c) => c.cf), units: treeUnits, heldContracts: () => [],
      techHeld: (t) => research.techs.includes(t),
      civicHeld: (c) => research.civics.includes(c),
      canImprove: (plot, impType) => {
        const id = engineId('improvement', impType, 'IMPROVEMENT_', IMPROVEMENTS);
        return !!id && groundImprovements(before.state, seat, plot).includes(id);
      },
      builderType: () => 'UNIT_BUILDER',
      canPlaceDistrict: (plot, d) => {
        const id = engineId('district', d, 'DISTRICT_', DISTRICTS);
        const tile = before.state.map.tiles[plot];
        return !!id && !tile.district && !tile.improvement && tileSeat(tile) === seat;
      },
      plotOwner: (plot) => {
        const s = state.map.tiles[plot].ownerSeat;
        return s === seat ? p.id : s < 0 ? -1 : -2;
      },
      buildersMakeDistricts: false,
      buildersMakeWonders: false,
      districtTie: () => turnDraws.shift() ?? 0,
      plotCity: (plot) => {
        const t = state.map.tiles[plot];
        return t.ownerSeat === seat ? (t.ownerCity ?? -2) : -2;
      },
      reachThisTurn: () => true,
      turnsTo: () => 1,
      distance: (x, y) => hexDistance(state.map, state.map.tiles[x].col, state.map.tiles[x].row, state.map.tiles[y].col, state.map.tiles[y].row),
      newContractId: () => contractSerial++,
      newTreeId: () => treeSerial++,
      startOperation: () => null,
      operationLive: () => false,
      log: (line) => ours.push(parseOurs(line)),
      clearProduction: () => undefined,
      order: (u, k) => {
        if (k !== 'move' && (treeUnits.find((x) => x.id === u)?.charges ?? 0) <= 1) spent.add(u);
      },
      unitAlive: (u) => treeUnits.some((x) => x.id === u) && !spent.has(u),
    };
    // B: the purchases (from the log) and the turn's production
    for (const l of log) {
      if (l.kind !== 'purchase') continue;
      const c = ai.contracts.find((x) => itemName(x) === l.item && (x.progress === 3 || x.progress === 5));
      if (c) c.progress = 7;
    }
    for (const { city, prior } of cities) {
      for (const u of made) {
        if (u.tileIndex !== city.centerIndex) continue;
        contractBuilt(ai, city.id, { unit: typeOf('unit', u.type), building: null, district: null }, u.id,
          (tree, unit) => ai.trees.find((t) => t.id === tree)?.units.push(unit));
      }
      for (const bt of city.buildings) {
        if ((prior?.buildings ?? []).includes(bt)) continue;
        contractBuilt(ai, city.id, { unit: null, building: typeOf('building', bt), district: null }, -1, () => undefined);
      }
      for (const d of city.districts) {
        if (!state.map.tiles[d.tileIndex].districtComplete || before.state.map.tiles[d.tileIndex].districtComplete) continue;
        contractBuilt(ai, city.id, { unit: null, building: null, district: typeOf('district', d.type) }, -1, () => undefined);
      }
    }
    // A: each city's full update, its events, the Default Specialization
    goalsReached(ai, (g) => world.techHeld(g) || world.civicHeld(g), (g) => g === research.tech || g === research.civic,
      (pl) => state.map.tiles[pl].ownerSeat === seat);
    const list = AI_CITY_EVENTS[AI_CITY_EVENT_LISTS.TRAIT_LEADER_MAJOR_CIV];
    for (const { cf, prior, dsRan, tables, pfAi, heldTypes, name } of cities) {
      freeSlots(ai, world, cf.id);
      inHandCheck(ai, cf, () => undefined);
      cf.bestImprovement = pickImprovement(ai, world, cf.evals);
      if (prior) {
        buildingEvent(ai, world, cf, list.CITY_EVENT_UNIT_OR_BUILDING);
        districtEvent(ai, world, cf, list.CITY_EVENT_DISTRICT);
        improvementEvent(ai, world, cf, list.CITY_EVENT_IMPROVEMENT);
      }
      if (dsRan) {
        const inHand = cityContracts(ai, cf, (c) => ours.push(stateLine(turn, p.id, name, c)));
        const bests = specializationBests(tables, pfAi);
        if (inHand && takesTurn(inHand, bests.unit.value, bests.project.value)) {
          queueContract(inHand, cf, (c) => (c.building ? !heldTypes.includes(c.building)
            : c.district ? !(prior?.districts ?? []).some((x) => typeOf('district', x.type) === c.district) : cf.canTrain(c.unit!)),
          (c) => ours.push({ turn, player: p.id, city: name, kind: 'queued', contract: c.id, item: itemName(c), tree: c.treeName }));
        } else ai.inHand[cf.id] = -1;
      }
    }
    // C: the trees
    tickCityTrees(ai, world);
    compare(turn, p.id, ours, log.filter((l) => l.kind !== 'pick' && l.kind !== 'none' && l.kind !== 'purchase'));
  }
}

for (const [cls, t] of [...tally].sort()) {
  console.log(`${cls.padEnd(52)} log ${String(t.log).padStart(5)} ours ${String(t.ours).padStart(5)} both ${String(t.both).padStart(5)}`);
  if (args.includes('--misses')) for (const m of t.miss.slice(0, 12)) console.log(`   ${m}`);
}
