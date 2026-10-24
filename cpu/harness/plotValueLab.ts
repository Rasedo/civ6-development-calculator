/**
 * THE AI'S PLOT VALUES AGAINST THE GAME'S: each city-state's plot analysis
 * as AI_CityBuild.csv prints it (recordings made with the AI's verbose
 * logs) — the IMPROVEMENTS row of every plot the city evaluates against
 * `aiPlotValue.ts`, or with --districts its DISTRICTS row against
 * `aiDistrictValue.ts` — on the record of the turn.
 *
 *    npx vite-node cpu/harness/plotValueLab.ts -- <dump.jsonl> [--player N] [--imp IMPROVEMENT_X] [--show N]
 *        [--districts [--rows]]
 *
 * Prints, per improvement or district, the values within 0.01 of the log's,
 * within 1.0, and further, and the first further ones (with the landing turn
 * that would give the log's value); --rows every district row with its value
 * two turns either side. The world: the record of the turn, the Builders the
 * record after holds (the turn start's and the Economic AI's come before the
 * cities), the research AI's turns from AI_Research.csv, the civics AI's as
 * its turn would write them. A district's facts: the engine's adjacency
 * (`baseAdjacency`) for both the whole and the rows, the plot's price where
 * the city may buy it (`borderCandidates`), one city (no regional reach, no
 * Dam, Canal or projects); LAB: an inland city-state on a river trains ships
 * (0x1c77c0's sea test unread).
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalog, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import { AI_DISTRICTS, AI_FEATURES, AI_IMPROVEMENTS, AI_RESOURCES } from '../data/aiBuildTables';
import { FX } from '../core/aiValue';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { improvementValue, type PlotValueFacts } from '../core/aiPlotValue';
import { districtValue, type DistrictValueFacts } from '../core/aiDistrictValue';
import { baseAdjacency } from '../core/yields';
import { tilePurchaseCost } from '../core/game';
import { canPlaceDistrictIn } from '../core/rules';
import { minorBuildFacts, minorResourceFacts } from '../core/minorBuild';
import { minorCity } from '../core/cityStates';
import { civicAnalysis } from '../core/aiCivics';
import { borderCandidates, computeCityStats } from '../core/city';
import { resourceValue } from '../core/aiResource';
import { housingValue } from '../core/aiCityBuild';
import { accumulationPct } from '../core/stockpile';
import { makeYieldCtx } from '../core/effects';
import { improvementAdjacency } from '../core/yields';
import { engineId, gameTypeOf, installFeature } from '../data/aliases';
import { IMPROVEMENTS } from '../data/improvements';
import { DISTRICTS } from '../data/districts';
import { BUILDER_COST_STEP, UNITS } from '../data/units';
import { GAME_COST_ESCALATION, gameProgressPct, scaleByGameSpeed } from '../data/constants';
import { neighbors } from '../../world/hex';
import { RESOURCES } from '../../world/resources';
import { tileAppeal } from '../core/appeal';
import { floodHazardTurns } from '../core/disasters';
import { loadCityBuildCentre, loadCityBuildPlots } from './cityBuildLog';
import { AI_BUILDINGS } from '../data/aiBuildTables';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const onlyPlayer = args.includes('--player') ? Number(args[args.indexOf('--player') + 1]) : null;
const onlyImp = args.includes('--imp') ? args[args.indexOf('--imp') + 1] : null;
const districtsMode = args.includes('--districts');
// every DISTRICTS row with its values two turns either side (--rows)
const rowsOut = args.includes('--rows');
const show = args.includes('--show') ? Number(args[args.indexOf('--show') + 1]) : 20;

const cat = loadCatalog(dump);
const recs: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord)
  .filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);
const plots = loadCityBuildPlots(dump);
const centreRows = loadCityBuildCentre(dump);

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
const AI_FEATURE_ROWS = new Map(AI_FEATURES.map((r) => [r.type, r] as const));
/** an engine district's install type: the traitless AI row whose engine id it is */
const typeOfDistrict = (id: string): string => AI_DISTRICTS.find((r) => r.trait === null && engineId('district', r.type, 'DISTRICT_', DISTRICTS) === id)?.type ?? `DISTRICT_${id}`;
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
    // the civics AI's entries as its turn would write them (cityBuildLab.ts)
    cs.research.civicAiEntries = civicAnalysis(state, cs.seat, computeCityStats(state, minorCity(cs)).total.culture);
    const facts = minorBuildFacts(state, cs, () => 0);
    const resFacts = minorResourceFacts(state, cs);
    const forecast = facts.forecast;
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
      if ((districtsMode ? lp.districts : lp.improvements).every((v) => v === 0)) continue;
      const plot = lp.y * W + lp.x;
      const tile = state.map.tiles[plot];
      const f: PlotValueFacts = {
        view: facts.view, seat: cs.seat,
        improvement: tile.improvement ? gameTypeOf('improvement', tile.improvement, 'IMPROVEMENT_') : null,
        pillaged: !!tile.pillaged,
        // the resource the player sees: its RevealedByTech held
        resource: tile.resource && (!RESOURCES[tile.resource]?.revealTech || r.techs.includes(RESOURCES[tile.resource].revealTech!))
          ? gameTypeOf('resource', tile.resource, 'RESOURCE_') : null,
        feature: tile.feature ? installFeature(tile.feature) : null,
        // LAB: the eruption's turns as the logged values give them (an
        // improvement's beside a volcano at 31 in runs/h1_duelv1127); its
        // computation is unread
        floodTurns: floodHazardTurns(state, tile.index),
        eruptionTurns: neighbors(state.map, tile).some((n) => (n as unknown as { volcano?: boolean }).volcano) ? 31 * FX : null,
        appeal: tileAppeal(state.map, tile),
        besideHousingDistrict: neighbors(state.map, tile).some((n) => n.district !== null && (DISTRICTS[n.district]?.housing ?? 0) > 0),
        unitCost: (u) => (u === 'UNIT_BUILDER' ? UNITS.BUILDER.cost + scaleByGameSpeed(BUILDER_COST_STEP) * builders
          : UNITS[engineId('unit', u, 'UNIT_', UNITS) ?? '']?.cost ?? 0),
        // a city-state's own version of every unit (no unique one)
        buildsUnit: () => true,
        extraCharges: () => 0,
        progressPct: gameProgressPct(r.techs.length, r.civics.length),
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
        accumulationPct: accumulationPct(state, cs.seat, tile.terrain),
      };
      if (districtsMode) {
        const city = minorCity(cs);
        const specialty = (cs.districts ?? []).filter((x) => DISTRICTS[x.type]?.countsTowardLimit).length;
        const districtAdj = (d: string, y: string): number => {
          const id = engineId('district', d, 'DISTRICT_', DISTRICTS) as keyof typeof DISTRICTS | null;
          if (!id || YIELD_KEY[y] !== DISTRICTS[id].adjacencyYield) return 0;
          return baseAdjacency(yctx, tile, id);
        };
        const df: DistrictValueFacts = {
          ...f,
          owned: tile.ownerSeat >= 0,
          purchaseCost: tile.ownerSeat >= 0 ? 0 : borderCandidates(state, city).includes(plot) ? tilePurchaseCost(state, city, plot) : -1,
          lake: tile.terrain === 'LAKE',
          keepsFeature: () => !!f.feature && !AI_FEATURE_ROWS.get(f.feature)?.removable,
          district: tile.district ? typeOfDistrict(tile.district) : null,
          districtPillaged: !!tile.districtPillaged,
          isCity: tile.index === cs.centerIndex,
          districtAdjacency: districtAdj,
          rowsAdjacency: districtAdj,
          // the districts the player may have (no other civilization's), the
          // city lacks and the plot takes, research waived
          otherDistricts: (d) => AI_DISTRICTS.filter((x) => {
            if (x.type === d || x.trait !== null || x.type === 'DISTRICT_CITY_CENTER' || x.type === 'DISTRICT_WONDER') return false;
            const id = engineId('district', x.type, 'DISTRICT_', DISTRICTS) as keyof typeof DISTRICTS | null;
            if (!id || (cs.districts ?? []).some((c) => c.type === id)) return false;
            return canPlaceDistrictIn(state, city, id, plot, { unlocks: null, ownsTile: () => true }).ok;
          }).map((x) => x.type),
          chronology: facts.era + 1,
          districtCount: specialty,
          districtCap: 1 + Math.floor((cs.population - 1) / 3),
          // LAB: 0x1c77c0's sea test (the centre's plot's +0x40 and its
          // flags +0x14 bit 0) unread; every inland city-state of the five
          // verbose duels sits on a river and values as one that trains ships
          cityTrains: (dom) => facts.trainsDomain(dom) || (dom === 'DOMAIN_SEA' && (state.map.tiles[cs.centerIndex].riverMask ?? 0) !== 0),
          playerTrains: (dom) => facts.trainsDomain(dom) || (dom === 'DOMAIN_SEA' && (state.map.tiles[cs.centerIndex].riverMask ?? 0) !== 0),
          domainUnitsValue: () => 0,
          // a city-state: one city
          regionalCities: () => 0,
          riverPlots: () => ({ improved: 0, districted: 0 }),
          canalTrade: 0,
          projectValue: () => 0,
          spaceRace: () => false,
          favoured: () => false,
          districtsOf: (d) => (cs.districts ?? []).filter((x) => typeOfDistrict(x.type) === d).length,
          // the centre's logged BUILDINGS row
          buildingsValue: (d) => {
            const row = centreRows.get(`${turn}:${player}:${name}`)?.BUILDINGS;
            let best = -9999 * FX;
            AI_BUILDINGS.forEach((b, i) => {
              const v = row?.[i];
              if (b.district === d && v !== undefined && v > -9000) best = Math.max(best, Math.round(v * FX));
            });
            return best;
          },
        };
        lp.districts.forEach((lv, i) => {
          if (lv <= -9999) return;
          const row = AI_DISTRICTS[i];
          if (onlyImp && row.type !== onlyImp) return;
          const inHand = 0;
          const t = facts.buildTurns(row.type) + inHand + Math.max(techTurns(row.tech), facts.civicTurns(row.civic));
          const tparts = `${facts.buildTurns(row.type)}+${inHand}+${techTurns(row.tech)}/${facts.civicTurns(row.civic)}`;
          const ours = districtValue(df, row.type, t, AI_VALUE_HORIZON) / FX;
          const d = Math.abs(ours - lv);
          if (rowsOut) console.log(`ROW T=${t} ${[-2, -1, 1, 2].map((dt) => (districtValue(df, row.type, t + dt, AI_VALUE_HORIZON) / FX).toFixed(2)).join(',')} t${turn} p${player} (${lp.x},${lp.y}) ${row.type} log ${lv.toFixed(2)} ours ${ours.toFixed(2)} adj ${['YIELD_SCIENCE', 'YIELD_FAITH', 'YIELD_GOLD', 'YIELD_PRODUCTION', 'YIELD_CULTURE'].map((y) => districtAdj(row.type, y)).join('/')} own=${lp.owned} pc=${df.purchaseCost} feat=${f.feature} res=${f.resource}`);
          const k = tallyOf(row.type);
          if (d <= 0.01) k.exact++;
          else if (d <= 1) k.close++;
          else {
            k.far++;
            if (k.miss.length < show) {
              let fit = -1;
              for (let x = 0; x < AI_VALUE_HORIZON && fit < 0; x++) if (Math.abs(districtValue(df, row.type, x, AI_VALUE_HORIZON) / FX - lv) <= 0.01) fit = x;
              const at15 = (districtValue(df, row.type, 15, AI_VALUE_HORIZON) / FX).toFixed(2);
              k.miss.push(`t${turn} p${player} (${lp.x},${lp.y}) log ${lv.toFixed(2)} ours ${ours.toFixed(2)} t=${t} tp=${tparts} fitT=${fit} at15=${at15} own=${lp.owned} imp=${f.improvement} res=${f.resource} feat=${f.feature}`);
            }
          }
        });
        continue;
      }
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
