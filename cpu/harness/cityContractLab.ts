/**
 * THE CITY-STATES' CONTRACTS AGAINST THE GAME'S: the city events, their
 * trees and the contracts (`aiCityTrees.ts`, `aiContracts.ts`) run turn by
 * turn on the records, their state carried from turn to turn as the game
 * carries it, against AI_CityBuild.csv's contract lines (SUBMITTED,
 * ACCEPTED, COMPLETED, CANCELLED, FAILED), its queue lines ("..., CONTRACT
 * n") and its Default Specialization lines (recordings made with the AI's
 * verbose logs).
 *
 *    npx vite-node cpu/harness/cityContractLab.ts -- <dump.jsonl> [--player N] [--verbose]
 *
 * The world each turn: the analysis tables the game logged (the plots'
 * improvement and district values, the city centre's buildings, units and
 * projects — the improvement the city's turn picks reads the same tables),
 * the record after the turn for what the player's turn start completes (the
 * buildings, the districts, the units trained, the tech or civic under
 * research), the record before it for the rest (the units and the plots,
 * the research, the districts placed: the AI acts before they move and
 * build). Not ported and taken from the log: the turns the city's queue
 * stands empty (the Default Specialization runs on them), the purchases
 * (PURCHASE lines complete their contract).
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import type { GameState, Unit } from '../core/types';
import { AI_BUILDINGS, AI_DISTRICTS, AI_UNITS } from '../data/aiBuildTables';
import { AI_CITY_EVENTS, AI_CITY_EVENT_LISTS } from '../data/aiCityTrees';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, specializationBests, type CityBuildTables, type PickFacts } from '../core/aiCityBuild';
import { minorBuildFacts, minorPickFacts } from '../core/minorBuild';
import { FX, FX_MIN } from '../core/aiValue';
import { CP_NAMES, cityContracts, contractBuilt, inHandCheck, queueContract, takesTurn,
  type AiContract, type ContractItem } from '../core/aiContracts';
import { SLOT_DISTRICT, bestPlotFor, buildingEvent, chooseDistrict, districtEvent, freeSlots, goalsReached, improvementEvent, newCityAi, pickImprovement, tickCityTrees,
  slotFree, type CityAi, type CityTreeCity, type CityTreeWorld, type PlotEval, type TreeUnit } from '../core/aiCityTrees';
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
const verbose = args.includes('--verbose');

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

/** the game's "City Build District Choice" draws by turn, in order
 *  (`<stem>.randcalls.csv`): the majors' cities draw first, the
 *  city-states the turn's last ones */
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

const raw = (xs: number[] | undefined): number[] => (xs ?? []).map((x) => (x <= -9999 ? FX_MIN : Math.round(x * FX)));
const W = recs[0].head.W;
const plotOf = (x: number, y: number): number => y * W + x;

/** per player: the city AI state, the contract ids ours <-> the log's */
const ais = new Map<number, CityAi>();
let contractSerial = 1;
let treeSerial = 1;
/** the turn the city's current item was set and its value (from the lines) */
const setTurn = new Map<number, { turn: number; value: number }>();

interface Tally { log: number; ours: number; both: number; miss: string[] }
const tally = new Map<string, Tally>();
const tallyOf = (k: string): Tally => tally.get(k) ?? (tally.set(k, { log: 0, ours: 0, both: 0, miss: [] }), tally.get(k)!);

/** a line's key for matching, the contract ids left out */
function keyOf(l: { kind: string; state?: string; item: string; value?: number; tree?: string }): string {
  if (l.kind === 'contract') return `${l.kind}|${l.state}|${l.item}|${l.state === 'SUBMITTED' ? l.value?.toFixed(1) : ''}|${l.tree}`;
  return `${l.kind}|${l.item}|${l.tree ?? ''}`;
}
function compare(turn: number, player: number, ours: BuildLine[], log: BuildLine[]): void {
  const left = [...log];
  for (const o of ours) {
    const cls = o.kind === 'contract' ? `${o.kind} ${o.state}` : o.kind;
    const t = tallyOf(cls);
    t.ours += 1;
    const k = keyOf(o);
    const j = left.findIndex((l) => keyOf(l) === k);
    if (j >= 0) {
      t.both += 1;
      left.splice(j, 1);
    } else if (t.miss.length < 20) t.miss.push(`t${turn} p${player} ours ${k}`);
  }
  for (const l of log) {
    const cls = l.kind === 'contract' ? `${l.kind} ${l.state}` : l.kind;
    tallyOf(cls).log += 1;
  }
  for (const l of left) {
    const cls = l.kind === 'contract' ? `${l.kind} ${l.state}` : l.kind;
    const t = tallyOf(cls);
    if (t.miss.length < 40) t.miss.push(`t${turn} p${player} log  ${keyOf(l)}`);
  }
}

/** the item a contract asks for, as a log line names it */
const itemName = (c: ContractItem): string => c.unit ?? c.building ?? c.district ?? '';

/** the record's unit ids on the imported units (the import numbers its
 *  units afresh): they follow the record's order, each on its plot */
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

function unitsOfSeat(state: GameState, seat: number): Unit[] {
  return state.units.filter((u) => u.seat === seat);
}

/** the improvements the ground of a plot takes, research waived
 *  (CanHaveImprovement): the technologies wait on the trees' Add Goal Tech */
function groundImprovements(state: GameState, seat: number, plot: number): string[] {
  return validImprovementsIn(state.map.tiles[plot], {
    unlocks: null, ownsTile: (t) => tileSeat(t) === seat, map: state.map,
    suzerain: suzerainNames(state, seat), civ: civOf(state, seat),
  }) as string[];
}

/** the city's plot evaluations: the logged tables, and the flags the log
 *  does not print (0x5ce970) — improvable where no district stands and an
 *  improvement may stand on the ground, research waived (the tables of a
 *  district plot keep their stale values); a district may stand where none
 *  does and the row values one; beside an owned plot */
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

const history = newHistory();
let prev: ReturnType<typeof importTurn> | null = null;
for (let i = 0; i + 1 < recs.length; i++) {
  const a = recs[i];
  const b = recs[i + 1];
  if (i === 0) {
    advanceHistory(history, a, cat);
    prev = importTurn(a, cat, history);
    recordIds(a, prev.state);
  }
  advanceHistory(history, b, cat);
  const turn = a.turn;
  const imp = importTurn(b, cat, history);
  recordIds(b, imp.state);
  const before = prev!;
  prev = imp;
  const state = imp.state;
  // the turn's district choice draws: the majors' cities draw first, the
  // city-states after in player order, each its ties' count (a city whose
  // district slot is free and that held its events this turn)
  const turnDraws = draws.get(turn) ?? [];
  const drawsOf = new Map<number, number[]>();
  {
    const need: [number, number][] = [];
    for (const [player, cs] of imp.minorOfPlayer) {
      const name = imp.dumpOfMinor.get(cs)?.name;
      const logged = plots.get(`${turn}:${player}:${name}`);
      if (!logged || !before.dumpOfMinor.get(before.minorOfPlayer.get(player)!)) continue;
      const ai = ais.get(player) ?? newCityAi();
      freeSlots(ai, cs.id);
      let n = 0;
      if (slotFree(ai, cs.id, SLOT_DISTRICT)) chooseDistrict(ai, evalsOf(before.state, state, cs.seat, logged), () => (n++, 0));
      need.push([player, n]);
    }
    let at = turnDraws.length - need.reduce((s, [, n]) => s + n, 0);
    for (const [player, n] of need) {
      drawsOf.set(player, turnDraws.slice(Math.max(at, 0), Math.max(at + n, 0)));
      at += n;
    }
  }
  for (const [player, cs] of imp.minorOfPlayer) {
    if (onlyPlayer !== null && player !== onlyPlayer) continue;
    const dc = imp.dumpOfMinor.get(cs);
    if (!dc) continue;
    const name = dc.name;
    const key = `${turn}:${player}:${name}`;
    const rows = centre.get(key);
    const logged = plots.get(key);
    if (!rows || !logged) continue;
    const ai = ais.get(player) ?? (ais.set(player, newCityAi()), ais.get(player)!);
    const log = (byTurn.get(`${turn}:${player}`) ?? []).filter((l) => l.city === name || l.kind === 'purchase');
    const ours: BuildLine[] = [];
    const cityId = cs.id;
    const facts = minorBuildFacts(state, cs, () => 0);
    const pf = minorPickFacts(state, cs, facts);
    const tables: CityBuildTables = { buildings: raw(rows.BUILDINGS), units: raw(rows.UNITS), projects: raw(rows.PROJECTS) };
    const evals = evalsOf(before.state, state, cs.seat, logged);
    // the queue as the AI acts: the record before the turn's (the turn's own
    // choices are in the record after)
    const head = before.dumpOfMinor.get(before.minorOfPlayer.get(player)!)?.queue?.[0];
    const dsRan = log.some((l) => l.kind === 'pick' || l.kind === 'queued' || l.kind === 'none');
    // the item the city produces as its AI acts: none where the Default
    // Specialization runs, else the record's queue head
    const current: ContractItem | null = dsRan || !head || typeof head !== "object" ? null : headItem(head as unknown as Record<string, unknown>);
    // the buildings held or queued as the AI acts (the Default
    // Specialization's own pick of the turn comes after the events)
    const heldTypes = (cs.buildings ?? []).map((id) => typeOf('building', id));
    const pfAi: PickFacts = { ...pf, buildingHeld: (bt) => current?.building === bt || heldTypes.includes(bt) };
    for (const l of log) if (l.kind === 'pick' || l.kind === 'queued') setTurn.set(player, { turn, value: Math.round((l.value ?? 0) * FX) });
    const set = setTurn.get(player) ?? { turn: -99, value: FX_MIN };
    // the research as the AI acts: the record before the turn's, and the tech
    // or civic it was researching where the record after holds it (the
    // player's turn start completes it before the AI acts; one a boost
    // completes during the turn waits for the next)
    const ra = (before.minorOfPlayer.get(player) ?? cs).research;
    const rb = cs.research;
    const techOf = (t: string): string => gameTypeOf('tech', t, 'TECH_');
    const civicOf = (c: string): string => gameTypeOf('civic', c, 'CIVIC_');
    const research = {
      techs: [...ra.techs, ...(ra.tech && rb.techs.includes(ra.tech) && !ra.techs.includes(ra.tech) ? [ra.tech] : [])].map(techOf),
      civics: [...ra.civics, ...(ra.civic && rb.civics.includes(ra.civic) && !ra.civics.includes(ra.civic) ? [ra.civic] : [])].map(civicOf),
      tech: rb.tech === null ? null : techOf(rb.tech), civic: rb.civic === null ? null : civicOf(rb.civic),
    };
    const cityFacts: CityTreeCity = {
      id: cityId, underThreat: false, current, productionTurn: set.turn, currentValue: set.value,
      // CanConstruct refuses for good a building the city holds and a
      // district it had completed as the turn began
      buildingBlocked: (bt) => heldTypes.includes(bt),
      districtBlocked: (d) => ((before.minorOfPlayer.get(player) ?? cs).districts ?? []).some((x) => typeOf('district', x.type) === d && before.state.map.tiles[x.tileIndex].districtComplete),
      // CanTrain refuses a unit its obsolescence (the Mandatory or plain
      // ObsoleteTech / ObsoleteCivic) holds
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
      districtHeld: (d) => (cs.districts ?? []).some((x) => typeOf('district', x.type) === d && state.map.tiles[x.tileIndex].districtComplete),
    };
    // the units as the AI acts: the record before's, and the units the
    // turn's production made, where the record after has them
    const beforeUnits = unitsOfSeat(before.state, cs.seat);
    const beforeIds = new Set(beforeUnits.map((u) => u.id));
    const made = unitsOfSeat(state, cs.seat).filter((u) => !beforeIds.has(u.id));
    const treeUnits: TreeUnit[] = [...beforeUnits, ...made].map((u) => ({ id: u.id, type: typeOf('unit', u.type), plot: u.tileIndex, charges: u.charges ?? 0 }));
    const spent = new Set<number>();
    const world: CityTreeWorld = {
      turn, seat: player, cities: [cityFacts], units: treeUnits,
      techHeld: (t) => research.techs.includes(t),
      civicHeld: (c) => research.civics.includes(c),
      canImprove: (plot, impType) => {
        const id = engineId('improvement', impType, 'IMPROVEMENT_', IMPROVEMENTS);
        return !!id && groundImprovements(before.state, cs.seat, plot).includes(id);
      },
      builderType: () => 'UNIT_BUILDER',
      canPlaceDistrict: (plot, d) => {
        const id = engineId('district', d, 'DISTRICT_', DISTRICTS);
        const tile = before.state.map.tiles[plot];
        return !!id && !tile.district && !tile.improvement && tileSeat(tile) === cs.seat;
      },
      plotOwner: (plot) => {
        const s = state.map.tiles[plot].ownerSeat;
        return s === cs.seat ? player : s < 0 ? -1 : -2;
      },
      buildersMakeDistricts: false,
      buildersMakeWonders: false,
      districtTie: () => drawsOf.get(player)?.shift() ?? 0,
      plotCity: (plot) => (state.map.tiles[plot].ownerSeat === cs.seat ? cityId : -1),
      reachable: () => true,
      distance: (p, q) => hexDistance(state.map, state.map.tiles[p].col, state.map.tiles[p].row, state.map.tiles[q].col, state.map.tiles[q].row),
      newContractId: () => contractSerial++,
      newTreeId: () => treeSerial++,
      log: (line) => ours.push(parseOurs(line)),
      clearProduction: () => undefined,
      // an improvement built or a feature cleared spends a charge: a Builder
      // spending its last is gone
      order: (u, k, p) => {
        if (verbose) console.log(`ORDER t${turn} p${player} unit ${u} ${k} ${p}`);
        if (k !== 'move' && (treeUnits.find((x) => x.id === u)?.charges ?? 0) <= 1) spent.add(u);
      },
      unitAlive: (u) => treeUnits.some((x) => x.id === u) && !spent.has(u),
      trace: verbose ? (t, root, ups) => console.log(`TICK t${turn} p${player} tree ${t.id} ${t.name} root ${root} ${ups.join(" ")}`) : undefined,
    };
    // B: the purchases (from the log) and the turn's production
    for (const l of log) {
      if (l.kind !== 'purchase') continue;
      const c = ai.contracts.find((x) => itemName(x) === l.item && (x.progress === 3 || x.progress === 5));
      if (c) c.progress = 7;
    }
    for (const u of made) {
      contractBuilt(ai, cityId, { unit: typeOf('unit', u.type), building: null, district: null }, u.id,
        (tree, unit) => ai.trees.find((t) => t.id === tree)?.units.push(unit));
    }
    const beforeCs = before.minorOfPlayer.get(player);
    for (const bt of cs.buildings ?? []) {
      if ((beforeCs?.buildings ?? []).includes(bt)) continue;
      contractBuilt(ai, cityId, { unit: null, building: typeOf('building', bt), district: null }, -1, () => undefined);
    }
    for (const d of cs.districts ?? []) {
      if (!state.map.tiles[d.tileIndex].districtComplete || before.state.map.tiles[d.tileIndex].districtComplete) continue;
      contractBuilt(ai, cityId, { unit: null, building: null, district: typeOf('district', d.type) }, -1, () => undefined);
    }
    // A: the city's full update, its events, the Default Specialization
    goalsReached(ai, (g) => world.techHeld(g) || world.civicHeld(g),
      (g) => g === research.tech || g === research.civic, (p) => state.map.tiles[p].ownerSeat === cs.seat);
    freeSlots(ai, cityId);
    inHandCheck(ai, cityFacts, () => undefined);
    cityFacts.bestImprovement = pickImprovement(ai, world, evals);
    const list = AI_CITY_EVENTS[AI_CITY_EVENT_LISTS.MINOR_CIV_DEFAULT_TRAIT];
    // a city founded this turn first acts in the turn's later hook (the
    // Default Specialization alone): its events wait for its next turn
    if (before.dumpOfMinor.get(before.minorOfPlayer.get(player)!)) {
      buildingEvent(ai, world, cityFacts, list.CITY_EVENT_UNIT_OR_BUILDING);
      districtEvent(ai, world, cityFacts, list.CITY_EVENT_DISTRICT);
      improvementEvent(ai, world, cityFacts, list.CITY_EVENT_IMPROVEMENT);
      if (verbose) {
        // the slots after the events, the improvement picked and its best plot
        const bp = cityFacts.bestImprovement >= 0 ? bestPlotFor(ai, cityFacts, cityFacts.bestImprovement) : null;
        console.log(`EV t${turn} p${player} slots ${JSON.stringify(ai.slots[cityId])} pick ${cityFacts.bestImprovement}`
          + ` plot ${bp?.plot} ${bp ? bp.improvements[cityFacts.bestImprovement] / FX : ''}`);
      }
    }
    if (dsRan) {
      const inHand = cityContracts(ai, cityFacts, (c) => ours.push(stateLine(turn, player, name, c)));
      const bests = specializationBests(tables, pfAi);
      if (inHand && takesTurn(inHand, bests.unit.value, bests.project.value)) {
        // the queue takes a building the city does not hold, a district it has
        // not placed, a unit it may train (0x5c9ea0 / 0x5ca170 / 0x5ca5a0)
        queueContract(inHand, cityFacts, (c) => (c.building ? !heldTypes.includes(c.building)
          : c.district ? !(beforeCs?.districts ?? []).some((x) => typeOf('district', x.type) === c.district) : cityFacts.canTrain(c.unit!)), (c) => ours.push({ turn, player, city: name, kind: 'queued', contract: c.id, item: itemName(c), tree: c.treeName }));
      } else ai.inHand[cityId] = -1;
    }
    // C: the trees
    const treesBefore = ai.trees.map((t) => `${t.id}:${t.name}:${t.trigger.building ?? t.trigger.unit ?? t.trigger.improvement}@${t.trigger.plot}`);
    tickCityTrees(ai, world);
    if (verbose) {
      console.log(`TREES t${turn} p${player} before [${treesBefore.join(' | ')}] after [${ai.trees.map((t) => `${t.id}:${t.status.join('')}`).join(' | ')}]`
        + ` contracts [${ai.contracts.map((c) => `${c.id}:${itemName(c) || ai.techContracts[c.id]}:${CP_NAMES[c.progress]}`).join(' ')}]`
        + ` pick ${cityFacts.bestImprovement} evB ${cityFacts.eventBuilding.index >= 0 ? AI_BUILDINGS[cityFacts.eventBuilding.index].type : '-'} ${(cityFacts.eventBuilding.value / FX).toFixed(1)}`
        + ` evU ${cityFacts.eventUnit.index >= 0 ? AI_UNITS[cityFacts.eventUnit.index].type : '-'} ${(cityFacts.eventUnit.value / FX).toFixed(1)}`);
    }
    compare(turn, player, ours, log.filter((l) => l.kind !== 'pick' && l.kind !== 'none' && l.kind !== 'purchase'));
    if (verbose) {
      for (const l of log) console.log(`LOG  ${keyOf(l)}  t${turn} p${player}`);
      for (const l of ours) console.log(`OURS ${keyOf(l)}  t${turn} p${player}`);
    }
  }
}

/** an engine row's install type: the AI tables' type with no trait whose
 *  engine id it is (a unique replacement shares its base's id) */
function typeOf(kind: 'building' | 'district' | 'unit', id: string): string {
  const prefix = kind === 'building' ? 'BUILDING_' : kind === 'district' ? 'DISTRICT_' : 'UNIT_';
  const rows: readonly { type: string; trait: string | null }[] = kind === 'building' ? AI_BUILDINGS : kind === 'unit' ? AI_UNITS : AI_DISTRICTS;
  const known = kind === 'building' ? BUILDINGS : kind === 'unit' ? UNITS : DISTRICTS;
  const row = rows.find((r) => r.trait === null && engineId(kind, r.type, prefix, known) === id);
  return row ? row.type : gameTypeOf(kind, id, prefix);
}

/** a logged row the analysis valued: some value above FX(-9999), not all zero */
function flagged(row: readonly number[]): boolean {
  return row.some((v) => v > -9999 && v !== 0);
}

function stateLine(turn: number, player: number, city: string, c: AiContract): BuildLine {
  return { turn, player, city, kind: 'contract', contract: c.id, state: CP_NAMES[c.progress], item: itemName(c), value: c.value / FX, tree: c.treeName };
}

/** our SUBMITTED line, as `contractLine` writes it, read back */
function parseOurs(line: string): BuildLine {
  const p = line.split(',').map((x) => x.trim());
  const item = p[6] !== 'NO_UNIT' ? p[6] : p[7] !== 'NO_BUILDING' ? p[7] : p[8];
  return { turn: Number(p[0]), player: Number(p[1]), city: p[2], kind: 'contract', contract: Number(p[4].slice(9)), state: p[5], item,
    value: Number(p[9].replace('VALUE ', '')), tree: p.slice(10).join(',') };
}

function headItem(head: Record<string, unknown>): ContractItem | null {
  const t = (k: string) => (typeof head[k] === 'number' ? head[k] as number : -1);
  if (t('UnitType') >= 0) return { unit: cat.units[t('UnitType')] ?? null, building: null, district: null };
  if (t('BuildingType') >= 0) return { unit: null, building: cat.buildings[t('BuildingType')] ?? null, district: null };
  if (t('DistrictType') >= 0) return { unit: null, building: null, district: cat.districts[t('DistrictType')] ?? null };
  return null;
}

/** 0x5d0860 with neither the checks nor the defensive filter: the best
 *  building not held or queued whose prerequisite building and district
 *  stand (CanConstruct's reasons clear) */
function eventBuilding(t: CityBuildTables, pf: PickFacts): { index: number; value: number } {
  let index = -1;
  let value = FX_MIN;
  AI_BUILDINGS.forEach((b, k) => {
    if (pf.buildingHeld(b.type)) return;
    if (!pf.reasonsClear(b.type)) return;
    if (t.buildings[k] > value) {
      value = t.buildings[k];
      index = k;
    }
  });
  return { index, value };
}

/** 0x5d2600 unchecked, defensive: the best combat unit with no FoundCity,
 *  no build charges, no CLASS_RECON */
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

for (const [cls, t] of [...tally].sort()) {
  console.log(`${cls.padEnd(22)} log ${String(t.log).padStart(5)} ours ${String(t.ours).padStart(5)} both ${String(t.both).padStart(5)}`);
  for (const m of t.miss.slice(0, verbose ? 40 : 12)) console.log(`   ${m}`);
}
