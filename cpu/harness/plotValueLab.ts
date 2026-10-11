/**
 * THE AI'S PLOT VALUES AGAINST THE GAME'S: each city-state's plot analysis
 * as AI_CityBuild.csv prints it (recordings made with the AI's verbose
 * logs) — the IMPROVEMENTS row of every plot the city evaluates — against
 * `aiPlotValue.ts` on the record of the turn.
 *
 *    npx vite-node cpu/harness/plotValueLab.ts -- <dump.jsonl> [--player N] [--imp IMPROVEMENT_X] [--show N]
 *
 * Prints, per improvement, the values within 0.01 of the log's, within 1.0,
 * and further, and the first further ones (with the landing turn that would
 * give the log's value). The world: the record of the turn, the Builders
 * the record after holds (the turn start's and the Economic AI's come
 * before the cities), the research AI's turns from AI_Research.csv.
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import { AI_IMPROVEMENTS, AI_RESOURCES } from '../data/aiBuildTables';
import { FX } from '../core/aiValue';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { improvementValue, type PlotValueFacts } from '../core/aiPlotValue';
import { minorBuildFacts, minorResourceFacts } from '../core/minorBuild';
import { resourceValue } from '../core/aiResource';
import { growthForecast, housingValue } from '../core/aiCityBuild';
import { makeYieldCtx } from '../core/effects';
import { improvementAdjacency } from '../core/yields';
import { engineId, gameTypeOf, installFeature } from '../data/aliases';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { BUILDER_COST_STEP, UNITS } from '../data/units';
import { GAME_COST_ESCALATION, scaleByGameSpeed } from '../data/constants';
import { neighbors } from '../../world/hex';
import { RESOURCES } from '../../world/resources';
import { tileAppeal } from '../core/appeal';
import { floodRiverIndex, floodRivers, riverRevealed } from '../core/disasters';
import { loadCityBuildPlots } from './cityBuildLog';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const onlyPlayer = args.includes('--player') ? Number(args[args.indexOf('--player') + 1]) : null;
const onlyImp = args.includes('--imp') ? args[args.indexOf('--imp') + 1] : null;
const show = args.includes('--show') ? Number(args[args.indexOf('--show') + 1]) : 20;

const cat = loadCatalog(dump);
const recs: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord)
  .filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);
const plots = loadCityBuildPlots(dump);

/** AI_Research.csv: `${turn}:${player}:${tech}` -> [turns, status], and the
 *  tech each player researches each turn with its turns */
const research = new Map<string, [number, string]>();
const researching = new Map<string, [string, number]>();
{
  const path = dump.replace(/\.jsonl$/, '.logs/AI_Research.csv');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const p = line.split(',').map((x) => x.trim());
      if (p[2] !== 'Tech') continue;
      research.set(`${p[0]}:${p[1]}:${p[3]}`, [Number(p[6]), p[5]]);
      if (p[5] === 'RESEARCHING') researching.set(`${p[0]}:${p[1]}`, [p[3], Number(p[6])]);
    }
  }
}
const W = recs[0].head.W;
const RES = new Map(AI_RESOURCES.map((r) => [r.type, r] as const));
const YIELD_KEY: Record<string, string> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold', YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};

interface Tally { exact: number; close: number; far: number; miss: string[] }
const tally = new Map<string, Tally>();
const tallyOf = (k: string): Tally => tally.get(k) ?? (tally.set(k, { exact: 0, close: 0, far: 0, miss: [] }), tally.get(k)!);

const history = newHistory();
/** the players whose city stood in an earlier record */
const hadCity = new Set<number>();
let held: { imp: ReturnType<typeof importTurn>; turn: number } | null = null;
for (const rec of recs) {
  advanceHistory(history, rec, cat);
  const after = importTurn(rec, cat, history);
  const cur = held;
  held = { imp: after, turn: rec.turn };
  if (!cur) continue;
  const imp = cur.imp;
  const state = imp.state;
  const turn = cur.turn;
  for (const [player, cs] of imp.minorOfPlayer) {
    if (onlyPlayer !== null && player !== onlyPlayer) continue;
    const name = imp.dumpOfMinor.get(cs)?.name;
    const logged = plots.get(`${turn}:${player}:${name}`);
    const founded = !hadCity.has(player);
    if (imp.dumpOfMinor.get(cs)) hadCity.add(player);
    if (!logged) continue;
    // the Builders the player has as its city acts: the record after the
    // turn's (the turn start's training and the Economic AI's purchases
    // come before the cities)
    const builders = after.minorOfPlayer.get(player)?.buildersTrained ?? cs.buildersTrained;
    const facts = minorBuildFacts(state, cs, () => 0);
    const resFacts = minorResourceFacts(state, cs);
    const forecast = growthForecast(facts.growth);
    const yctx = makeYieldCtx(state, cs.seat);
    const r = cs.research;
    // the research AI's turns as the game's log gives them: the entry of the
    // turn, plus the turns left on the research in hand as its last turn set
    // them (cityBuildLab.ts --logtech)
    const now = researching.get(`${turn}:${player}`);
    const was = researching.get(`${turn - 1}:${player}`);
    // (-1 where the research AI's last turn found no city: the city
    // founded the turn before)
    const left = founded ? -1 : now && was && now[0] === was[0] ? was[1] : now ? now[1] : 0;
    const engineTurns = facts.techTurns;
    const techTurns = (tech: string | null): number => {
      if (!tech) return 0;
      const e = research.get(`${turn}:${player}:${tech}`);
      if (!e || e[1] === 'OWNED') return engineTurns(tech) === 0 ? 0 : 500;
      const t = e[0] > 0 ? e[0] : 500;
      const next = r.aiEntries?.find((x) => `TECH_${x.tech}` === tech)?.next;
      return t < 500 && now && now[0] !== tech && `TECH_${next}` !== now[0] ? t + left : t;
    };
    for (const lp of logged) {
      // a plot the analysis left unvalued keeps its row at 0 (the city centre,
      // a district's plot)
      if (lp.improvements.every((v) => v === 0)) continue;
      const plot = lp.y * W + lp.x;
      const tile = state.map.tiles[plot];
      const floodHome = floodRiverIndex(state.map, tile);
      const f: PlotValueFacts = {
        view: facts.view, seat: cs.seat,
        improvement: tile.improvement ? gameTypeOf('improvement', tile.improvement, 'IMPROVEMENT_') : null,
        pillaged: !!tile.pillaged,
        // the resource the player sees: its RevealedByTech held
        resource: tile.resource && (!RESOURCES[tile.resource]?.revealTech || r.techs.includes(RESOURCES[tile.resource].revealTech!))
          ? gameTypeOf('resource', tile.resource, 'RESOURCE_') : null,
        feature: tile.feature ? installFeature(tile.feature) : null,
        // LAB: the hazards' turns as the logged values give them (a farm's
        // value on the Floodplains of a flood river no major has revealed
        // ends at 1 turn, an improvement's beside a volcano at 31 in
        // runs/h1_duelv1127); their computation is unread
        floodTurns: floodHome >= 0 && !riverRevealed(state, floodRivers(state.map)[floodHome]) ? FX : null,
        eruptionTurns: neighbors(state.map, tile).some((n) => (n as unknown as { volcano?: boolean }).volcano) ? 31 * FX : null,
        appeal: tileAppeal(state.map, tile),
        besideHousingDistrict: neighbors(state.map, tile).some((n) => n.district !== null && (DISTRICTS[n.district]?.housing ?? 0) > 0),
        unitCost: (u) => (u === 'UNIT_BUILDER' ? UNITS.BUILDER.cost + scaleByGameSpeed(BUILDER_COST_STEP) * builders
          : UNITS[engineId('unit', u, 'UNIT_', UNITS) ?? '']?.cost ?? 0),
        // a city-state's own version of every unit (no unique one)
        buildsUnit: () => true,
        extraCharges: () => 0,
        progressCount: Math.max(r.techs.length, r.civics.length),
        escalation: GAME_COST_ESCALATION,
        speedScaled: scaleByGameSpeed,
        adjacency: (impType, y) => {
          const id = engineId('improvement', impType, 'IMPROVEMENT_', IMPROVEMENTS) as Parameters<typeof improvementAdjacency>[2] | null;
          if (!id) return 0;
          return (improvementAdjacency(yctx, tile, id) as unknown as Record<string, number>)[YIELD_KEY[y]] ?? 0;
        },
        housingValue: (housing, t, h) => housingValue(facts.growth, forecast, housing, t, h),
        resourceValue: (res, count, t, h) => {
          const row = RES.get(res);
          return row ? resourceValue(resFacts, row, count, t, h) : 0;
        },
      };
      lp.improvements.forEach((lv, i) => {
        if (lv <= -9999) return;
        const row = AI_IMPROVEMENTS[i];
        if (onlyImp && row.type !== onlyImp) return;
        const t = Math.max(techTurns(row.tech), facts.civicTurns(row.civic));
        const ours = improvementValue(f, row.type, t, AI_VALUE_HORIZON) / FX;
        const d = Math.abs(ours - lv);
        const k = tallyOf(row.type);
        if (d <= 0.01) k.exact++;
        else if (d <= 1) k.close++;
        else {
          k.far++;
          if (k.miss.length < show) {
            // the landing turn that would give the log's value, -1 none
            let fit = -1;
            for (let x = 0; x < AI_VALUE_HORIZON && fit < 0; x++) if (Math.abs(improvementValue(f, row.type, x, AI_VALUE_HORIZON) / FX - lv) <= 0.01) fit = x;
            const e = row.tech ? research.get(`${turn}:${player}:${row.tech}`) : undefined;
            k.miss.push(`t${turn} p${player} (${lp.x},${lp.y}) log ${lv.toFixed(2)} ours ${ours.toFixed(2)} t=${t} fitT=${fit} logT=${e?.[0]}/${e?.[1]} own=${lp.owned} imp=${f.improvement} res=${f.resource} feat=${f.feature}`);
          }
        }
      });
    }
  }
}
for (const [k, t] of [...tally].sort((a, b) => b[1].far - a[1].far)) {
  console.log(`${k.padEnd(34)} exact ${String(t.exact).padStart(6)} close ${String(t.close).padStart(6)} far ${String(t.far).padStart(6)}`);
  for (const m of t.miss) console.log(`   ${m}`);
}
