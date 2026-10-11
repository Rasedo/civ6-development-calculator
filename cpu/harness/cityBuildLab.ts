/**
 * THE CITY BUILD AI'S TABLES AGAINST THE GAME'S: each turn's city-centre
 * value tables of AI_CityBuild.csv's PLOT ANALYSIS LOG (recordings made with
 * the AI's verbose logs, `game.py profile apply --ai-verbose`) against
 * `aiCityBuild.ts` on the record the analysis read — the record of the turn
 * after (the analysis runs after the turn's production: its progress is
 * that record's) imported as it stands.
 *
 *    npx vite-node cpu/harness/cityBuildLab.ts -- <dump.jsonl> [--logtech] [--rows out.jsonl] [--json out.json] [--player N]
 *
 * --logtech takes the research AI's turns from the game's AI_Research.csv
 * (the entry of the turn plus the turns its research in hand had left as its
 * turn before set them), so the tables measure the value apart from the
 * imported research.
 *
 * Per item family and item: the log's valid values, ours valid where the
 * log's are and the reverse, the values within 0.005, and the heaviest
 * residuals.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, engineRowOf, importTurn, minorHead, newHistory } from './import';
import type { CityState, GameState } from '../core/types';
import { AI_BUILDINGS } from '../data/aiBuildTables';
import { buildingPerTurn, buildingTable, buildingTurns, buildingValue, defaultSpecialization, growthForecast, housingValue, unitTable, unitTurns, unitValue } from '../core/aiCityBuild';
import { AI_UNITS } from '../data/aiBuildTables';
import { minorBuildFacts, minorKnownUnits, minorItemCost, minorItemKey, minorItemPct, minorPickFacts, type MinorItem } from '../core/minorBuild';
import { researchAnalysis } from '../core/aiResearch';
import { civicAnalysis } from '../core/aiCivics';
import { computeCityStats } from '../core/city';
import { minorCity } from '../core/cityStates';
import { FX_MIN, fxConst } from '../core/aiValue';
import { loadCityBuildCentre, loadCityBuildPicks, loadCityBuildTables, loadKnownUnits, newCityBuildTally, tallyBuildings, tallyRow, type CityBuildTally } from './cityBuildLog';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const rowsOut = args.includes('--rows') ? args[args.indexOf('--rows') + 1] : null;
const onlyPlayer = args.includes('--player') ? Number(args[args.indexOf('--player') + 1]) : null;

/** The item in the minor's hand as its analysis ran (after the turn's
 *  production, before its choices): the record of the turn's item, unless
 *  the turn's production completed it (a building held after it, or a
 *  progress past its cost), at the progress the turn left — the record
 *  after's where it still holds it. */
const tracked = new Map<string, { item: string; progress: number }>();
const stored = new Map<string, number>();

function inHandAtAnalysis(state: GameState, cs: CityState, player: number, name: string, a: TurnRecord, b: TurnRecord, production: number): void {
  const ca = a.cities.find((c) => c.owner === player && c.name === name);
  const cb = b.cities.find((c) => c.owner === player && c.name === name);
  const ha = ca ? minorHead(cat, ca, a.head.W) : undefined;
  const hb = cb ? minorHead(cat, cb, b.head.W) : undefined;
  const key = `${player}:${name}`;
  if (!ha || 'none' in ha) {
    // an idle step adds its Production to the store
    stored.set(key, (stored.get(key) ?? 0) + production);
    cs.prodOverflow = stored.get(key);
    delete cs.prodItem;
    cs.prodProgress = 0;
    return;
  }
  const ka = minorItemKey(ha);
  // the record keeps whole progress: the fraction a turn's Production adds
  // is carried from the turns before while the item stays in hand
  const kept = tracked.get(key);
  const recorded = Number(ca?.queueProgress?.[0]) || 0;
  const from = kept && kept.item === ka && Math.floor(kept.progress) === recorded ? kept.progress : recorded;
  const progress = from + (production + (stored.get(key) ?? 0)) * (1 + minorItemPct(state, cs, ha) / 100);
  stored.set(key, 0);
  tracked.set(key, { item: ka, progress });
  const before = new Set(a.units.filter((u) => u.owner === player).map((u) => u.id));
  const done = 'building' in ha ? (cs.buildings ?? []).includes(ha.building)
    : 'unit' in ha ? b.units.some((u) => u.owner === player && !before.has(u.id) && engineRowOf(cat, 'unit', u.type) === ha.unit)
      : progress >= minorItemCost(state, cs, ha as Exclude<MinorItem, { none: true }>);
  if (done) {
    // a completion leaves the store what the step paid past the cost
    stored.set(key, Math.max(0, (progress - minorItemCost(state, cs, ha as Exclude<MinorItem, { none: true }>)) / (1 + minorItemPct(state, cs, ha) / 100)));
    cs.prodOverflow = stored.get(key);
    tracked.delete(key);
    delete cs.prodItem;
    cs.prodProgress = 0;
    return;
  }
  void hb;
  cs.prodItem = ka;
  cs.prodProgress = progress;
  cs.prodOverflow = 0;
}

/** AI_Research.csv: `${turn}:${player}:${tech}` -> [turns, status] */
const researching = new Map<string, [string, number]>();
function loadResearch(path: string): Map<string, [number, string]> {
  const out = new Map<string, [number, string]>();
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const p = line.split(',').map((x) => x.trim());
    if (p[2] !== 'Tech') continue;
    out.set(`${p[0]}:${p[1]}:${p[3]}`, [Number(p[6]), p[5]]);
    if (p[5] === 'RESEARCHING') researching.set(`${p[0]}:${p[1]}`, [p[3], Number(p[6])]);
  }
  return out;
}
const research = loadResearch(dump.replace(/\.jsonl$/, '.logs/AI_Research.csv'));

/** AI_Knowledge.csv's TRADE lines: `${turn}:${player}` -> VAL */
const tradeVal = new Map<string, number>();
{
  const path = dump.replace(/\.jsonl$/, '.logs/AI_Knowledge.csv');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const p = line.split(',').map((x) => x.trim());
      if (p[2] === 'TRADE') tradeVal.set(`${p[0]}:${p[1]}`, Number(p[4].replace('VAL ', '')));
    }
  }
}
const zero = args.includes('--zero') ? args[args.indexOf('--zero') + 1].split(',') : [];
/** AI_Military.csv's Combat Desire (the military AI's PSEUDOYIELD_UNIT_COMBAT
 *  weight), by `${turn}:${player}` */
const desire = new Map<string, number>();
{
  const path = dump.replace(/\.jsonl$/, '.logs/AI_Military.csv');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const p = line.split(',').map((x) => x.trim());
      if (/^\d+$/.test(p[0] ?? '') && p.length >= 9) desire.set(`${p[0]}:${p[1]}`, Number(p[8]));
    }
  }
}
const desireShift = args.includes('--desire') ? Number(args[args.indexOf('--desire') + 1]) : 0;

const tables = loadCityBuildTables(dump);
const knownUnits = loadKnownUnits(dump);
// the knowledge base as the turn's analysis reads it: the turn's ARMY lines
// (--kb -1: the turn before's)
const kbShift = args.includes('--kb') ? Number(args[args.indexOf('--kb') + 1]) : 0;
const unitsAll = newCityBuildTally();
let dbg: unknown = null;
const unitsPer = new Map<string, CityBuildTally>();
const centre = loadCityBuildCentre(dump);
const picks = loadCityBuildPicks(dump);
const pickTally = { log: { n: 0, ok: 0, miss: [] as string[] }, ours: { n: 0, ok: 0, miss: [] as string[] }, units: { n: 0, ok: 0, miss: [] as string[] } };
if (!tables.size) throw new Error(`no PLOT ANALYSIS LOG beside ${dump}`);
const cat = loadCatalog(dump);
const recs: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord)
  .filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);
const history = newHistory();
const all = newCityBuildTally();
const per = new Map<string, CityBuildTally>();
/** per building, the logged values our value prints at another T */
const anyT = new Map<string, number>();
const rows: unknown[] = [];
for (let i = 0; i + 1 < recs.length; i++) {
  const b = recs[i + 1];
  if (i === 0) advanceHistory(history, recs[0], cat);
  advanceHistory(history, b, cat);
  const turn = recs[i].turn;
  const imp = importTurn(b, cat, history);
  const state = imp.state;
  for (const [player, cs] of imp.minorOfPlayer) {
    if (onlyPlayer !== null && player !== onlyPlayer) continue;
    const logged = tables.get(`${turn}:${player}:${imp.dumpOfMinor.get(cs)?.name}`);
    if (!logged) continue;
    const stats = computeCityStats(state, minorCity(cs));
    inHandAtAnalysis(state, cs, player, imp.dumpOfMinor.get(cs)!.name, recs[i], b, stats.total.production);
    cs.research.aiEntries = researchAnalysis(state, cs.seat, stats.total.science);
    cs.research.civicAiEntries = civicAnalysis(state, cs.seat, stats.total.culture);
    const kb = knownUnits.get(`${turn + kbShift}:${player}`);
    const facts = minorBuildFacts(state, cs, args.includes('--enginekb') ? minorKnownUnits(state, cs) : (u) => kb?.get(u) ?? 0);
    // the inputs the port does not read, as the game's logs give them: the
    // trade AI's route value (AI_Knowledge.csv) and, under --zero, the
    // pseudo-yields whose weights are not read set to -1.0 (factor 0)
    {
      const v0 = facts.view;
      const k = tradeVal.get(`${turn - 1}:${player}`);
      facts.view = Object.assign(Object.create(v0) as typeof v0, {
        tradeKnowledge: (s: number) => (s === cs.seat && k !== undefined ? Math.round(k * 256) : v0.tradeKnowledge(s)),
        pseudoYieldWeight: (s: number, p: string) => (zero.includes(p) ? -256
          : !args.includes('--nodesire') && p === 'PSEUDOYIELD_UNIT_COMBAT' && s === cs.seat && desire.has(`${turn + desireShift}:${player}`) ? fxConst(desire.get(`${turn + desireShift}:${player}`)!)
            : v0.pseudoYieldWeight(s, p)),
      });
    }
    if (args.includes('--logtech')) {
      // the research AI's turns as the game's log gives them: the entry of
      // the turn, plus the turns left on the research in hand as its last
      // turn (or the completion's choice) set them
      const now = researching.get(`${turn}:${player}`);
      const was = researching.get(`${turn - 1}:${player}`);
      const left = now && was && now[0] === was[0] ? was[1] : now ? now[1] : 0;
      const ours = facts.techTurns;
      dbg = { left, now: now?.[0] ?? null };
      facts.techTurns = (tech) => {
        if (!tech) return 0;
        const e = research.get(`${turn}:${player}:${tech}`);
        if (!e || e[1] === 'OWNED') return ours(tech) === 0 ? 0 : 500;
        const t = e[0] > 0 ? e[0] : 500;
        const next = cs.research.aiEntries?.find((x) => `TECH_${x.tech}` === tech)?.next;
        return t < 500 && now && now[0] !== tech && `TECH_${next}` !== now[0] ? t + left : t;
      };
    }
    const ours = buildingTable(facts);
    tallyBuildings(all, turn, player, logged, ours, per);
    const loggedUnits = centre.get(`${turn}:${player}:${imp.dumpOfMinor.get(cs)?.name}`)?.UNITS;
    const oursUnits = unitTable(facts);
    if (loggedUnits) tallyRow(AI_UNITS.map((u) => u.type), unitsAll, turn, player, loggedUnits, oursUnits, unitsPer);
    if (rowsOut && loggedUnits) {
      AI_UNITS.forEach((u, k) => {
        if (oursUnits[k] === null) return;
        const g = loggedUnits[k];
        const o = oursUnits[k] === -9999 * 256 ? -9999 : oursUnits[k]! / 256;
        if (g <= -9000 && o === -9999) return;
        const fitT = [...Array(50).keys()].filter((tt) => { const x = unitValue(facts, u, tt); return x !== null && Math.abs(x / 256 - g) < 0.0051; });
        rows.push({ fam: 'U', dbg, fitT, tech: facts.techTurns(u.tech), civ: facts.civicTurns(u.civic), bt: facts.buildTurns(u.type), t: turn, p: player, b: u.type, log: g, ours: o, T: unitTurns(facts, u), prod: facts.unitProduction.get(u.type)?.value, cur: facts.current, nu: facts.unitCount });
      });
    }
    // THE DEFAULT SPECIALIZATION PICK on the turns the log shows it: over the
    // log's own tables (the pick apart from the values), and with our
    // buildings table in place of the log's
    const cityName = imp.dumpOfMinor.get(cs)!.name;
    const pickKey = `${turn}:${player}:${cityName}`;
    if (picks.has(pickKey)) {
      const want = picks.get(pickKey)!;
      const rows = centre.get(pickKey)!;
      const raw = (xs: number[] | undefined) => (xs ?? []).map((x) => Math.round(x * 256));
      const saved = cs.prodItem;
      delete cs.prodItem;
      const pf = minorPickFacts(state, cs, facts);
      cs.prodItem = saved;
      const lu = raw(rows.UNITS);
      const ou = oursUnits.map((x, k) => x ?? lu[k] ?? FX_MIN);
      for (const [tag, bt, ut] of [['log', raw(rows.BUILDINGS), lu], ['ours', ours, lu], ['units', ours, ou]] as const) {
        const got = defaultSpecialization({ buildings: bt, units: ut, projects: raw(rows.PROJECTS) }, pf);
        const ok = want === null ? got === null : got !== null && got.type === want.item;
        const t = pickTally[tag];
        t.n += 1;
        if (ok) t.ok += 1;
        else if (t.miss.length < 12) t.miss.push(`t${turn} p${player} log ${want ? `${want.item} ${want.value}` : 'NONE'} ours ${got ? `${got.type} ${(got.value / 256).toFixed(2)}` : 'NONE'}`);
      }
    }
    // the value apart from the turns: a logged value our value prints at
    // some T below the horizon
    AI_BUILDINGS.forEach((brow, k) => {
      const g = logged[k];
      if (g <= -9000 || ours[k] === FX_MIN) return;
      if (Math.abs(ours[k] / 256 - g) < 0.0051) return;
      for (let t = 0; t < 50; t++) {
        if (Math.abs(buildingValue(facts, brow, t) / 256 - g) < 0.0051) {
          anyT.set(brow.type, (anyT.get(brow.type) ?? 0) + 1);
          return;
        }
      }
    });
    if (rowsOut) {
      AI_BUILDINGS.forEach((brow, k) => {
        const g = logged[k];
        const o = ours[k] === FX_MIN ? -9999 : ours[k] / 256;
        if (g === -9999 && o === -9999) return;
        const T = buildingTurns(facts, brow);
        const v = buildingPerTurn(facts, brow) / 256;
        const parts = [facts.techTurns(brow.tech), facts.civicTurns(brow.civic), brow.district && !facts.hasDistrict(brow.district) ? facts.buildTurns(brow.district) : -1, facts.buildTurns(brow.type), facts.current];
        const rlog = brow.tech ? research.get(`${turn}:${player}:${brow.tech}`) ?? null : null;
        const cur = researching.get(`${turn}:${player}`) ?? null;
        rows.push({ nu: state.units.filter((u) => u.seat === cs.seat).length, war: facts.atWar, t: turn, p: player, b: brow.type, log: g, ours: o, T, v, parts, rlog, cur, pop: cs.population, prod: stats.total.production, item: cs.prodItem ?? null, g: brow.housing > 0 ? { ...facts.growth, fc: growthForecast(facts.growth), hv: housingValue(facts.growth, growthForecast(facts.growth), brow.housing, T, 50) / 256 } : undefined });
      });
    }
  }
}
for (const [tag, t] of Object.entries(pickTally)) {
  console.log(`DEFAULT SPECIALIZATION (${tag} buildings table): ${t.ok} / ${t.n} as logged`);
  for (const m of t.miss) console.log(`  ${m}`);
}
for (const [type, t] of [...per].sort((a, b) => b[1].log - a[1].log)) {
  if (!t.log && !t.onlyOurs) continue;
  const f = t.first;
  console.log(`${type.padEnd(34)} log ${String(t.log).padStart(5)} both ${String(t.both).padStart(5)} exact ${String(t.exact).padStart(5)}`
    + ` onlyLog ${String(t.onlyLog).padStart(4)} onlyOurs ${String(t.onlyOurs).padStart(4)}  ${f ? `t${f.turn} p${f.player} log ${f.log} ours ${f.ours}` : ''}`);
}
console.log(`TOTAL log ${all.log} both ${all.both} exact ${all.exact} onlyLog ${all.onlyLog} onlyOurs ${all.onlyOurs}`);
if (args.includes('--json')) writeFileSync(args[args.indexOf('--json') + 1], JSON.stringify({ all, per: Object.fromEntries(per), anyT: Object.fromEntries(anyT) }));
if (rowsOut) writeFileSync(rowsOut, rows.map((r) => JSON.stringify(r)).join('\n'));
for (const [type, t] of [...unitsPer].sort((a, b) => b[1].log - a[1].log)) {
  if (!t.log && !t.onlyOurs) continue;
  const f = t.first;
  console.log(`${type.padEnd(34)} log ${String(t.log).padStart(5)} both ${String(t.both).padStart(5)} exact ${String(t.exact).padStart(5)}`
    + ` onlyLog ${String(t.onlyLog).padStart(4)} onlyOurs ${String(t.onlyOurs).padStart(4)}  ${f ? `t${f.turn} p${f.player} log ${f.log} ours ${f.ours}` : ''}`);
}
console.log(`UNITS TOTAL log ${unitsAll.log} both ${unitsAll.both} exact ${unitsAll.exact} onlyLog ${unitsAll.onlyLog} onlyOurs ${unitsAll.onlyOurs}`);
