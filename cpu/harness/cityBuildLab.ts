/**
 * THE CITY BUILD AI'S TABLES AGAINST THE GAME'S: each turn's city-centre
 * value tables of AI_CityBuild.csv's PLOT ANALYSIS LOG (recordings made with
 * the AI's verbose logs, `game.py profile apply --ai-verbose`) against
 * `aiCityBuild.ts` on the record the analysis read — the record of the turn
 * after (the analysis runs after the turn's production: its progress is
 * that record's) imported as it stands.
 *
 *    npx vite-node cpu/harness/cityBuildLab.ts -- <dump.jsonl> [--logtech] [--rows out.jsonl] [--json out.json] [--player N]
 *        [--projects TEXT]
 *
 * --logtech takes the research AI's turns from the game's AI_Research.csv
 * (the entry of the turn plus the turns its research in hand had left as its
 * turn before set them), so the tables measure the value apart from the
 * imported research. The unit table's inputs: --kb -1 the knowledge base of
 * AI_Knowledge.csv's ARMY lines a turn back, --enginekb the engine's own
 * (`minorKnowledge` run over the records in the players' turn order, the
 * record's unit ids, tallied against the ARMY lines); the Combat Desire
 * AI_Military.csv's, --ourdesire the engine's (`minorCombatDesire`, tallied
 * against the log's strengths and desire), --nodesire none. The PROJECTS
 * table (`aiProjectValue.ts`) on the engine's build turns; --projects TEXT
 * prints the rows off the log's whose type holds TEXT.
 *
 * Per item family and item: the log's valid values, ours valid where the
 * log's are and the reverse, the values within 0.005, and the heaviest
 * residuals.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, engineRowOf, importTurn, minorHead, newHistory } from './import';
import type { ArmyRecord, CityState, GameState } from '../core/types';
import { AI_BUILDINGS } from '../data/aiBuildTables';
import { buildingPerTurn, buildingTable, buildingTurns, buildingValue, defaultSpecialization, housingValue, unitTable, unitTurns, unitValue } from '../core/aiCityBuild';
import { AI_PROJECTS, AI_UNITS } from '../data/aiBuildTables';
import { projectTable, projectValue } from '../core/aiProjectValue';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { minorBuildFacts, minorCityGrowth, minorProjectFacts, minorCombatDesire, minorKnowledge, minorKnownUnits, minorItemCost, minorItemKey, minorItemPct, minorPickFacts, type MinorItem } from '../core/minorBuild';
import { minorStandingArmyShort, minorThreat } from '../core/minorCityAi';
import { researchAnalysis } from '../core/aiResearch';
import { civicAnalysis } from '../core/aiCivics';
import { computeCityStats } from '../core/city';
import { minorCity } from '../core/cityStates';
import { isCiv } from '../core/seats';
import { UNITS } from '../data/units';
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
/** AI_Military.csv's Regional, Enemy and Other Strength */
const strengths = new Map<string, number[]>();
{
  const path = dump.replace(/\.jsonl$/, '.logs/AI_Military.csv');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const p = line.split(',').map((x) => x.trim());
      if (/^\d+$/.test(p[0] ?? '') && p.length >= 9) {
        desire.set(`${p[0]}:${p[1]}`, Number(p[8]));
        strengths.set(`${p[0]}:${p[1]}`, [Number(p[2]), Number(p[3]), Number(p[4])]);
      }
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
// the PROJECTS rows off the log's whose type holds the text (--projects TEXT),
// each with its value at landing turns 0..10
const projectsOut = args.includes('--projects') ? args[args.indexOf('--projects') + 1] : null;
const projectsAll = newCityBuildTally();
const projectsPer = new Map<string, CityBuildTally>();
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
/** the knowledge base's army records by player after the latest update, and the import of the turn it waits for */
const kbStore = new Map<number, ArmyRecord[]>();
let prevImp: ReturnType<typeof importTurn> | null = null;
const kbTally = { n: 0, ok: 0, miss: [] as string[] };
const desireTally = { n: 0, exact: 0, sa: 0, str: [0, 0, 0], miss: [] as string[] };
/** the record's unit ids, which the knowledge base's records key on (the
 *  import numbers its units afresh): the imported units follow the record's
 *  order, each on its recorded plot */
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
/** the knowledge base's updates of the turn of `imp`, the players in turn
 *  order: at the minor's start (the ageing and the look, 0x785f30) each
 *  player before it in the order stands where the next record has it, the
 *  minor itself and those after it where this record has them, with the
 *  units the minor's own turn made (the next record's, absent here); the
 *  ARMY line is printed then. At its turn's end (player signal +0x228, the
 *  look again with no ageing) its own units stand where the next record has
 *  them. */
function kbUpdate(imp: ReturnType<typeof importTurn>, next: GameState): void {
  const base = imp.state.units;
  const ids = new Set(base.map((u) => u.id));
  const nextIds = new Set(next.units.map((u) => u.id));
  // the chassis a vanished unit upgrades into: a unit of it the next record
  // holds afresh is the upgrade, made after the minor's look
  const upgraded = new Set(base.filter((u) => !nextIds.has(u.id)).map((u) => UNITS[u.type]?.upgradesTo).filter((x): x is string => !!x));
  for (const [player, cs] of imp.minorOfPlayer) {
    const before = (s: number) => isCiv(s) || (s >= 100 && s < cs.seat);
    cs.armyKnown = (kbStore.get(player) ?? []).map((r) => ({ ...r }));
    imp.state.units = [...base.filter((u) => !before(u.seat)), ...next.units.filter((u) => before(u.seat) || (u.seat === cs.seat && !ids.has(u.id) && !upgraded.has(u.type)))];
    minorKnowledge(imp.state, cs, true);
    const want = knownUnits.get(`${imp.state.turn}:${player}`);
    if (want) {
      const ours = minorKnownUnits(cs);
      const types = new Set([...want.keys(), ...AI_UNITS.map((u) => u.type).filter((t) => ours(t) > 0)]);
      kbTally.n += 1;
      if ([...types].every((t) => (want.get(t) ?? 0) === ours(t))) kbTally.ok += 1;
      else if (kbTally.miss.length < 25) kbTally.miss.push(`t${imp.state.turn} p${player} ${[...types].filter((t) => (want.get(t) ?? 0) !== ours(t)).map((t) => `${t} log ${want.get(t) ?? 0} ours ${ours(t)}`).join(', ')}`);
    }
    imp.state.units = [...imp.state.units.filter((u) => u.seat !== cs.seat), ...next.units.filter((u) => u.seat === cs.seat)];
    minorKnowledge(imp.state, cs, false);
    imp.state.units = base;
    kbStore.set(player, cs.armyKnown ?? []);
  }
}
for (let i = 0; i + 1 < recs.length; i++) {
  const b = recs[i + 1];
  if (i === 0) {
    advanceHistory(history, recs[0], cat);
    prevImp = importTurn(recs[0], cat, history);
    recordIds(recs[0], prevImp.state);
  }
  advanceHistory(history, b, cat);
  const turn = recs[i].turn;
  const imp = importTurn(b, cat, history);
  const state = imp.state;
  recordIds(b, state);
  for (const [player, cs] of imp.minorOfPlayer) {
    // the knowledge base the turn's analysis reads: its update of the turn
    // before (the military AI's table is built before the tactical turn's
    // update, AI_Knowledge.csv's ARMY lines one turn back)
    cs.armyKnown = (kbStore.get(player) ?? []).map((r) => ({ ...r }));
    if (onlyPlayer !== null && player !== onlyPlayer) continue;
    // the military AI's turn: its strengths and Combat Desire against
    // AI_Military.csv's (the records as its last update aged them)
    // its last city update's threat and standing army, on the record as it stands
    cs.threat = minorThreat(state, cs);
    cs.standingArmyShort = minorStandingArmyShort(state, cs);
    const ourDesire = minorCombatDesire(state, cs, turn - 1);
    const wantS = strengths.get(`${turn}:${player}`);
    if (wantS) {
      const t = desireTally;
      t.n += 1;
      const s = [ourDesire.regional, ourDesire.enemy, ourDesire.other];
      s.forEach((x, k) => { if (x === wantS[k]) t.str[k] += 1; });
      const d = desire.get(`${turn}:${player}`)!;
      const o = ourDesire.desire / 256;
      if (Math.abs(o - d) < 0.051) t.exact += 1;
      // the standing-army term unread: 0.1 a count
      else if ([0.1, 0.2, 0.3].some((sa) => Math.abs(o + sa - d) < 0.051)) t.sa += 1;
      else if (t.miss.length < 30) t.miss.push(`t${turn} p${player} log ${wantS.join('/')}=${d} ours ${s.join('/')}=${o.toFixed(3)}`);
    }
    const logged = tables.get(`${turn}:${player}:${imp.dumpOfMinor.get(cs)?.name}`);
    if (!logged) continue;
    const stats = computeCityStats(state, minorCity(cs));
    inHandAtAnalysis(state, cs, player, imp.dumpOfMinor.get(cs)!.name, recs[i], b, stats.total.production);
    cs.research.aiEntries = researchAnalysis(state, cs.seat, stats.total.science);
    cs.research.civicAiEntries = civicAnalysis(state, cs.seat, stats.total.culture);
    const kb = knownUnits.get(`${turn + kbShift}:${player}`);
    // the growth its city's update read before the turn's growth: the
    // record before's citizens, store and surplus
    const before = prevImp!.minorOfPlayer.get(player);
    if (before && before.centerIndex >= 0) cs.aiGrowth = minorCityGrowth(prevImp!.state, before);
    const facts = minorBuildFacts(state, cs, args.includes('--enginekb') ? minorKnownUnits(cs) : (u) => kb?.get(u) ?? 0);
    // the inputs the port does not read, as the game's logs give them: the
    // trade AI's route value (AI_Knowledge.csv) and, under --zero, the
    // pseudo-yields whose weights are not read set to -1.0 (factor 0)
    {
      const v0 = facts.view;
      const k = tradeVal.get(`${turn - 1}:${player}`);
      facts.view = Object.assign(Object.create(v0) as typeof v0, {
        tradeKnowledge: (s: number) => (s === cs.seat && k !== undefined ? Math.round(k * 256) : v0.tradeKnowledge(s)),
        pseudoYieldWeight: (s: number, p: string) => (zero.includes(p) ? -256
          : args.includes('--ourdesire') && p === 'PSEUDOYIELD_UNIT_COMBAT' && s === cs.seat ? ourDesire.desire
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
    // THE PROJECTS TABLE: the analysis' gates and the value at the build turns
    const loggedProjects = centre.get(`${turn}:${player}:${imp.dumpOfMinor.get(cs)?.name}`)?.PROJECTS;
    if (loggedProjects) {
      const projectFacts = minorProjectFacts(cs, facts);
      const oursProjects = projectTable(projectFacts);
      tallyRow(AI_PROJECTS.map((p) => p.type), projectsAll, turn, player, loggedProjects, oursProjects, projectsPer);
      if (projectsOut !== null) {
        AI_PROJECTS.forEach((p, k) => {
          if (!p.type.includes(projectsOut) || loggedProjects[k] <= -9000) return;
          const pf = projectFacts;
          const T = facts.buildTurns(p.type);
          if (Math.abs(oursProjects[k] / 256 - loggedProjects[k]) < 0.0051) return;
          console.log('PROJECT', turn, player, p.type, 'log', loggedProjects[k], 'ours', (oursProjects[k] / 256).toFixed(2), 'T', T, 'pc', pf.progressPct, [0, 1, 2, 3, 4, 5, 6, 8, 10].map((tt) => (projectValue(pf, p.type, tt, AI_VALUE_HORIZON) / 256).toFixed(2)).join(' '));
        });
      }
    }
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
        rows.push({ nu: state.units.filter((u) => u.seat === cs.seat).length, war: facts.atWar, t: turn, p: player, b: brow.type, log: g, ours: o, T, v, parts, rlog, cur, pop: cs.population, prod: stats.total.production, item: cs.prodItem ?? null, g: brow.housing > 0 ? { ...facts.growth, fc: facts.forecast, hv: housingValue(facts.growth, facts.forecast, brow.housing, T, 50) / 256 } : undefined });
      });
    }
  }
  kbUpdate(prevImp!, state);
  prevImp = imp;
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
for (const [type, t] of [...projectsPer].sort((a, b) => b[1].log - a[1].log)) {
  if (!t.log && !t.onlyOurs) continue;
  const f = t.first;
  console.log(`${type.padEnd(34)} log ${String(t.log).padStart(5)} both ${String(t.both).padStart(5)} exact ${String(t.exact).padStart(5)}`
    + ` onlyLog ${String(t.onlyLog).padStart(4)} onlyOurs ${String(t.onlyOurs).padStart(4)}  ${f ? `t${f.turn} p${f.player} log ${f.log} ours ${f.ours}` : ''}`);
}
console.log(`PROJECTS TOTAL log ${projectsAll.log} both ${projectsAll.both} exact ${projectsAll.exact} onlyLog ${projectsAll.onlyLog} onlyOurs ${projectsAll.onlyOurs}`);
console.log(`UNITS TOTAL log ${unitsAll.log} both ${unitsAll.both} exact ${unitsAll.exact} onlyLog ${unitsAll.onlyLog} onlyOurs ${unitsAll.onlyOurs}`);
console.log(`KNOWLEDGE BASE: ${kbTally.ok} / ${kbTally.n} turn-player army counts as logged`);
for (const m of kbTally.miss) console.log(`  ${m}`);
console.log(`COMBAT DESIRE: ${desireTally.exact} exact, ${desireTally.sa} but the standing army, of ${desireTally.n}; strengths R ${desireTally.str[0]} E ${desireTally.str[1]} O ${desireTally.str[2]}`);
for (const m of desireTally.miss) console.log(`  ${m}`);
