/**
 * THE MAJORS' CITY BUILD AI AGAINST THE GAME'S: each turn's city-centre
 * value tables of AI_CityBuild.csv's PLOT ANALYSIS LOG for the AI majors'
 * cities (recordings made with the AI's verbose logs) against
 * `aiCityBuild.ts` on `majorBuildFacts`, on the record of the turn after
 * imported as it stands (the analysis runs after the turn's production),
 * and the Default Specialization pick (`defaultSpecialization` on
 * `majorPickFacts`) on the turns the log shows it — over the log's own
 * tables and over ours.
 *
 *    npx vite-node cpu/harness/majorCityBuildLab.ts -- <dump.jsonl> [--player N] [--misses N]
 */
import { existsSync, readFileSync } from 'node:fs';
import { bool, loadCatalog, num, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import { AI_BUILDINGS, AI_PROJECTS, AI_UNITS } from '../data/aiBuildTables';
import { buildingPerTurn, buildingTable, buildingTurns, buildingValue, defaultSpecialization, unitTable, unitTurns, unitValue, type CityBuildTables } from '../core/aiCityBuild';
import { projectTable } from '../core/aiProjectValue';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { gameProgressPct } from '../data/constants';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { engineId } from '../data/aliases';
import { FX_MIN, fxConst } from '../core/aiValue';
import { majorBuildFacts, majorPickFacts } from '../core/majorCityBuild';
import type { City, GameState } from '../core/types';
import { itemCost } from '../core/game';
import { computeCityStats } from '../core/city';
import { loadCityBuildCentre, loadCityBuildPicks, loadKnownUnits, newCityBuildTally, tallyRow, type CityBuildTally } from './cityBuildLog';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const onlyPlayer = args.includes('--player') ? Number(args[args.indexOf('--player') + 1]) : null;
/** --agendas P=AGENDA_A+AGENDA_B,...: a major's agendas (the replay's report prints them) */
const agendaArg = new Map<number, string[]>((args.includes('--agendas') ? args[args.indexOf('--agendas') + 1].split(',') : [])
  .map((x) => [Number(x.split('=')[0]), x.split('=')[1].split('+')]));
/** --trace T:TYPE,...: a table entry's inputs at the turn */
const traces: [number, string][] = (args.includes('--trace') ? args[args.indexOf('--trace') + 1].split(',') : [])
  .map((x) => [Number(x.split(':')[0]), x.split(':')[1]]);
const nMiss = args.includes('--misses') ? Number(args[args.indexOf('--misses') + 1]) : 12;

const cat = loadCatalog(dump);
const recs: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord)
  .filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);
const centre = loadCityBuildCentre(dump);
if (!centre.size) throw new Error(`no PLOT ANALYSIS LOG beside ${dump}`);
const picks = loadCityBuildPicks(dump);
const knownUnits = loadKnownUnits(dump);
const fam = { BUILDINGS: newCityBuildTally(), UNITS: newCityBuildTally(), PROJECTS: newCityBuildTally() };
const per = { BUILDINGS: new Map<string, CityBuildTally>(), UNITS: new Map<string, CityBuildTally>(), PROJECTS: new Map<string, CityBuildTally>() };
const pickTally = { log: { n: 0, ok: 0, miss: [] as string[] }, ours: { n: 0, ok: 0, miss: [] as string[] } };
/** the logs' own inputs the port reads elsewhere: AI_Victories.csv's
 *  strategies followed (the latest status of each at or before the turn),
 *  AI_Military.csv's Combat Desire and AI_Knowledge.csv's TRADE value */
const strategyRows: [number, number, string, string][] = [];
const desire = new Map<string, number>();
const tradeVal = new Map<string, number>();
{
  const logs = dump.replace(/\.jsonl$/, '.logs/');
  const rows = (f: string): string[][] => (existsSync(logs + f) ? readFileSync(logs + f, 'utf8').split('\n').map((l) => l.split(',').map((x) => x.trim())) : []);
  for (const c of rows('AI_Victories.csv')) if (/^\d+$/.test(c[0] ?? '') && c.length >= 4) strategyRows.push([Number(c[0]), Number(c[1]), c[2], c[3]]);
  for (const c of rows('AI_Military.csv')) if (/^\d+$/.test(c[0] ?? '') && c.length >= 9) desire.set(`${c[0]}:${c[1]}`, Number(c[8]));
  for (const c of rows('AI_Knowledge.csv')) if (c[2] === 'TRADE') tradeVal.set(`${c[0]}:${c[1]}`, Number(c[4].replace('VAL ', '')));
}
function strategiesAt(turn: number, player: number): Set<string> {
  const st = new Map<string, string>();
  for (const [t, p, s, v] of strategyRows) if (t <= turn && p === player) st.set(s, v);
  return new Set([...st].filter(([, v]) => v === 'Following').map(([k]) => k));
}
/** the building misses by the landing turn that prints the log's value */
const tShift = new Map<string, number>();
const raw = (xs: readonly number[] | undefined): number[] => (xs ?? []).map((x) => (x <= -9999 ? FX_MIN : Math.round(x * 256)));

const history = newHistory();
advanceHistory(history, recs[0], cat);
let prev = importTurn(recs[0], cat, history);
/** each city's record head, by its centre, before the in-hand reading */
let heads = new Map(prev.state.seats.flatMap((x) => x.cities).map((c) => [c.centerIndex, c.queue[0]] as const));
/** the item in a city's hand as its analysis ran (after the turn's
 *  production, before its choices): record t's head, where record t+1
 *  still holds it at its progress there; none where the turn completed it
 *  (a building held after it, an item the turn's Production paid off); the
 *  record t's head at its progress past the turn's Production where the AI
 *  changed it */
function inHand(state: GameState, city: City, ha: City['queue'][number] | undefined): void {
  const hb = city.queue[0];
  if (process.env.MCB_DEBUG) console.log('INHAND', city.name, JSON.stringify(ha), JSON.stringify(hb));
  if (!ha) {
    city.queue = [];
    return;
  }
  const same = (x: typeof ha, y: typeof ha | undefined) => !!y && JSON.stringify({ ...x, progress: 0, cost: 0 }) === JSON.stringify({ ...y, progress: 0, cost: 0 });
  if (same(ha, hb)) return;
  if (ha.kind === 'building' && city.buildings.includes(ha.building)) {
    city.queue = [];
    return;
  }
  const progress = ha.progress + computeCityStats(state, city).total.production;
  city.queue = progress >= itemCost(ha, state, city) ? [] : [{ ...ha, progress }];
}
for (let i = 0; i + 1 < recs.length; i++) {
  const a = recs[i];
  const b = recs[i + 1];
  advanceHistory(history, b, cat);
  const turn = a.turn;
  const imp = importTurn(b, cat, history);
  const state = imp.state;
  const was = heads;
  heads = new Map(state.seats.flatMap((x) => x.cities).map((c) => [c.centerIndex, c.queue[0]] as const));
  for (const c of state.seats.flatMap((x) => x.cities)) inHand(state, c, was.get(c.centerIndex));
  const ai = b.players.filter((p) => bool(p.major) && p.id !== num(b.head.localPlayer));
  for (const p of ai) {
    if (onlyPlayer !== null && p.id !== onlyPlayer) continue;
    const seat = imp.seatOfPlayer.get(p.id);
    if (seat === undefined) continue;
    const kb = knownUnits.get(`${turn}:${p.id}`);
    for (const [city, dc] of imp.dumpOfCity as Map<City, { name: string }>) {
      if (city.seat !== seat) continue;
      const key = `${turn}:${p.id}:${dc.name}`;
      const rows = centre.get(key);
      if (!rows) continue;
      const facts = majorBuildFacts(state, city, (u) => kb?.get(u) ?? 0,
        { strategies: new Map([[seat, strategiesAt(turn, p.id)]]), agendas: new Map([[seat, agendaArg.get(p.id) ?? []]]) });
      {
        const v0 = facts.view;
        const k = tradeVal.get(`${turn - 1}:${p.id}`);
        const d = desire.get(`${turn}:${p.id}`);
        facts.view = Object.assign(Object.create(v0) as typeof v0, {
          tradeKnowledge: (s: number) => (s === seat && k !== undefined ? Math.round(k * 256) : v0.tradeKnowledge(s)),
          pseudoYieldWeight: (s: number, py: string) => (py === 'PSEUDOYIELD_UNIT_COMBAT' && s === seat && d !== undefined ? fxConst(d) : v0.pseudoYieldWeight(s, py)),
        });
      }
      const bt = buildingTable(facts);
      const ut = unitTable(facts);
      const r = state.seats[seat].research;
      const pt = projectTable({
        view: facts.view, seat, cityId: city.id, capital: facts.capital, advanced: () => 0,
        buildTurns: (x) => facts.buildTurns(x), progressPct: gameProgressPct(r.techs.length, r.civics.length),
        spaceRaceStanding: 0, defenceRepairs: 0, population: facts.population, districts: facts.districtCount,
        loyaltyFalling: false,
        buildingValue: (x, t) => {
          const row = AI_BUILDINGS.find((y) => y.type === x);
          return row ? buildingValue(facts, row, t) : 0;
        },
        hasBuilding: (x) => facts.hasBuilding(x),
        hasCivic: (c) => r.civics.includes(engineId('civic', c, 'CIVIC_', CIVICS) ?? ''),
        hasTech: (t) => r.techs.includes(engineId('tech', t, 'TECH_', TECHS) ?? ''),
        hasDistrict: (d) => facts.hasDistrict(d),
        unlockedByEffect: () => false, producingElsewhere: () => 0, favoured: () => false, horizon: AI_VALUE_HORIZON,
      });
      tallyRow(AI_BUILDINGS.map((x) => x.type), fam.BUILDINGS, turn, p.id, rows.BUILDINGS ?? [], bt, per.BUILDINGS);
      // a miss whose logged value our value prints at another landing turn
      // (the turns apart from the value), and by how many turns
      AI_BUILDINGS.forEach((row, k) => {
        const g = rows.BUILDINGS?.[k] ?? -9999;
        if (g <= -9000 || bt[k] === FX_MIN || Math.abs(bt[k] / 256 - g) < 0.0051) return;
        const T = buildingTurns(facts, row);
        let best: number | null = null;
        for (let x = 0; x < 60; x++) if (Math.abs(buildingValue(facts, row, x) / 256 - g) < 0.0051 && (best === null || Math.abs(x - T) < Math.abs(best - T))) best = x;
        const d = best === null ? 'value' : `T${best - T >= 0 ? '+' : ''}${best - T}`;
        tShift.set(d, (tShift.get(d) ?? 0) + 1);
      });
      for (const [tt, item] of traces) {
        if (tt !== turn) continue;
        const k = AI_BUILDINGS.findIndex((x) => x.type === item);
        const u = AI_UNITS.findIndex((x) => x.type === item);
        if (k >= 0) {
          const row = AI_BUILDINGS[k];
          const fitT = [...Array(60).keys()].filter((x) => Math.abs(buildingValue(facts, row, x) / 256 - (rows.BUILDINGS?.[k] ?? 0)) < 0.0051);
          console.log(`TRACE t${turn} ${dc.name} ${item} log ${rows.BUILDINGS?.[k]} ours ${(bt[k] / 256).toFixed(3)} T ${buildingTurns(facts, row)} perTurn ${(buildingPerTurn(facts, row) / 256).toFixed(3)}`
            + ` tech ${row.tech}:${facts.techTurns(row.tech)} civic ${row.civic}:${facts.civicTurns(row.civic)} build ${facts.buildTurns(row.type)} district ${row.district}:${facts.hasDistrict(row.district ?? '')}`
            + ` prod ${computeCityStats(state, city).total.production.toFixed(2)} bank ${city.productionBank ?? 0} cur ${facts.current} era ${facts.era} gov ${facts.governmentTier} amen ${facts.amenity.balance} pop ${facts.population} fitT [${fitT.join(',')}]`);
        }
        if (u >= 0) {
          const row = AI_UNITS[u];
          const fitT = [...Array(60).keys()].filter((x) => { const v = unitValue(facts, row, x); return v !== null && Math.abs(v / 256 - (rows.UNITS?.[u] ?? 0)) < 0.0051; });
          console.log(`TRACE t${turn} ${dc.name} ${item} log ${rows.UNITS?.[u]} ours ${ut[u] === null ? 'null' : (ut[u]! / 256).toFixed(3)} T ${unitTurns(facts, row)}`
            + ` tech ${row.tech}:${facts.techTurns(row.tech)} civic ${row.civic}:${facts.civicTurns(row.civic)} build ${facts.buildTurns(row.type)} prod ${facts.unitProduction.get(row.type)?.value} units ${facts.unitCount} fitT [${fitT.join(',')}]`);
        }
      }
      if (rows.UNITS) tallyRow(AI_UNITS.map((x) => x.type), fam.UNITS, turn, p.id, rows.UNITS, ut, per.UNITS);
      if (rows.PROJECTS) tallyRow(AI_PROJECTS.map((x) => x.type), fam.PROJECTS, turn, p.id, rows.PROJECTS, pt, per.PROJECTS);
      if (!picks.has(key)) continue;
      const want = picks.get(key)!;
      const pf = majorPickFacts(state, { ...city, queue: [] }, facts);
      const lu = raw(rows.UNITS);
      const tables: Record<'log' | 'ours', CityBuildTables> = {
        log: { buildings: raw(rows.BUILDINGS), units: lu, projects: raw(rows.PROJECTS) },
        ours: { buildings: bt, units: ut.map((x, k) => x ?? lu[k] ?? FX_MIN), projects: pt },
      };
      for (const tag of ['log', 'ours'] as const) {
        const got = defaultSpecialization(tables[tag], pf);
        const ok = want === null ? got === null : got !== null && got.type === want.item;
        const t = pickTally[tag];
        t.n += 1;
        if (ok) t.ok += 1;
        else if (t.miss.length < nMiss) t.miss.push(`t${turn} p${p.id} ${dc.name} log ${want ? `${want.item} ${want.value}` : 'NONE'} ours ${got ? `${got.type} ${(got.value / 256).toFixed(2)}` : 'NONE'}`);
      }
    }
  }
}
for (const f of ['BUILDINGS', 'UNITS', 'PROJECTS'] as const) {
  const t = fam[f];
  console.log(`${f} log ${t.log} both ${t.both} exact ${t.exact} onlyLog ${t.onlyLog} onlyOurs ${t.onlyOurs}`);
  for (const [type, x] of [...per[f]].filter(([, x]) => x.log || x.onlyOurs).sort((p, q) => q[1].log - p[1].log).slice(0, nMiss)) {
    const fst = x.first;
    console.log(`   ${type.padEnd(34)} log ${String(x.log).padStart(5)} both ${String(x.both).padStart(5)} exact ${String(x.exact).padStart(5)}`
      + ` onlyLog ${String(x.onlyLog).padStart(4)} onlyOurs ${String(x.onlyOurs).padStart(4)}  ${fst ? `t${fst.turn} p${fst.player} log ${fst.log} ours ${fst.ours}` : ''}`);
  }
}
console.log('BUILDING MISSES by the T that fits: ' + [...tShift].sort((x, y) => y[1] - x[1]).slice(0, 16).map(([k, n]) => k + ' ' + n).join(', '));
for (const [tag, t] of Object.entries(pickTally)) {
  console.log(`DEFAULT SPECIALIZATION (${tag} tables): ${t.ok} / ${t.n} as logged`);
  for (const m of t.miss) console.log(`   ${m}`);
}
