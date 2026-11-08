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
 * that would give the log's value); --rows every district row with its T's
 * parts, the landing turn that gives the log's value and its value
 * two turns either side. The world: the record of the turn, every plot no
 * city-state holds as the record after holds it (the majors' turns before
 * the city-states'), and the minor as its city AI's turn finds it after its
 * economy's accrual and its city's production and growth steps (`minorPhase`,
 * `minorGrowth`: its citizens re-placed), its growth forecast on the growth
 * its last analysis read (`CityState.aiGrowthSeen`): the technologies, the civics and the
 * progress on the item in hand the record after holds; the Builders the
 * record holds and the one its production step trained (none its contract
 * purchases bought); the store its step left (City_BuildQueue.csv): an item
 * it completed, its overflow and no item in hand, the building or district
 * standing, an idle city's store with the Production the step made (the
 * city as the record after holds it) and its Builder's lumps of a turn its
 * analysis chose nothing (AI_CityBuild.csv); the gold shortfall its turn's
 * start banked; the plots' event yields as the run's replay lays them
 * (`replayEvents`);
 * --rows prints the store and the item in hand; its grid met (`minorPower`), the
 * Economic AI's Gold boost on the net income the record's treasury cached;
 * the research AI's turns from AI_Research.csv, the civics AI's as its turn
 * would write them. A plot's improvement: its own, a barbarian camp, a
 * tribal village or a meteor site (`plotImprovementType`); a plot holding
 * the city or a district is not compared in the IMPROVEMENTS mode (the
 * analysis skips it, its row an earlier analysis's). A district's facts: the engine's adjacency
 * (`baseAdjacency`) for both the whole and the rows, the plot's price where
 * the city may buy it (`borderCandidates`), one city (no regional reach, no
 * Dam, Canal or projects); LAB: an inland city-state on a river trains ships
 * (0x1c77c0's sea test unread).
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadCatalog, memField, type TurnRecord } from './record';
import { advanceHistory, importTurn, newHistory } from './import';
import { AI_DISTRICTS, AI_IMPROVEMENTS, AI_RESOURCES } from '../data/aiBuildTables';
import { AI_RATE, FX, FX_MIN } from '../core/aiValue';
import { modifiersValue } from '../core/aiModifiers';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { improvementValue, type PlotValueFacts } from '../core/aiPlotValue';
import { districtValue, type DistrictValueFacts } from '../core/aiDistrictValue';
import { baseAdjacency } from '../core/yields';
import { tilePurchaseCost } from '../core/game';
import { canPlaceDistrictIn } from '../core/rules';
import { minorBuildFacts, minorGrowth, minorItemInHand, minorPower, minorRaiseBuilding, minorResourceFacts } from '../core/minorBuild';
import { economicGoldBoost } from '../core/aiWeights';
import { newEconomicMemory } from '../core/aiEconomic';
import { minorCity } from '../core/cityStates';
import { plotImprovementType } from '../core/minorCityAi';
import { campTiles } from '../core/seats';
import { civicAnalysis } from '../core/aiCivics';
import { borderCandidates, computeCityStats } from '../core/city';
import { chopGrant, harvestGrant } from '../core/economy';
import { resourceValue } from '../core/aiResource';
import { AI_BUILDING_INDEX, BUILDING_DEPENDENTS, buildingsPass, growthForecast, housingValue, type CityGrowth } from '../core/aiCityBuild';
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
import { cityAppealResolver } from '../core/governors';
import { eruptionHazardTurns, floodHazardTurns } from '../core/disasters';
import { loadCityBuildCentre, loadCityBuildPlots } from './cityBuildLog';
import { replayEvents } from './eventReplay';
import { loadRandLog, randLogPath } from './randLog';
import { AI_BUILDINGS } from '../data/aiBuildTables';

const args = process.argv.slice(2).filter((a) => a !== '--');
const dump = args[0];
const onlyPlayer = args.includes('--player') ? Number(args[args.indexOf('--player') + 1]) : null;
const onlyImp = args.includes('--imp') ? args[args.indexOf('--imp') + 1] : null;
const districtsMode = args.includes('--districts');
// every DISTRICTS row with its values two turns either side (--rows)
const rowsOut = args.includes('--rows');
const show = args.includes('--show') ? Number(args[args.indexOf('--show') + 1]) : 20;
const allRows = args.includes('--all');

const cat = loadCatalog(dump);
const read: TurnRecord[] = readFileSync(dump, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as TurnRecord);
const recs = read.filter((r) => !r.moved).sort((a, b) => a.turn - b.turn);
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
/** AI_Knowledge.csv's TRADE rows: `${turn}:${player}` -> the route value K
 *  (an analysis reads its city-state's K of the turn before) */
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
/** City_BuildQueue.csv's production step of each city each turn, its first
 *  row: `${turn}:${city}` -> [the progress it left, the cost, the overflow, the item] */
const stepRow = new Map<string, [number, number, number, string]>();
{
  const path = dump.replace(/\.jsonl$/, '.logs/City_BuildQueue.csv');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const p = line.split(',').map((x) => x.trim());
      const k = `${p[0]}:${p[1]}`;
      if (p.length >= 7 && !stepRow.has(k)) stepRow.set(k, [Number(p[4]), Number(p[5]), Number(p[6]), p[3]]);
    }
  }
}
/** AI_CityBuild.csv's turns a city's analysis chose nothing to build:
 *  `${turn}:${player}` */
const noBuild = new Set<string>();
{
  const path = dump.replace(/\.jsonl$/, '.logs/AI_CityBuild.csv');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const p = line.split(',').map((x) => x.trim());
      if (p[5]?.startsWith('NO BUILDS AT ALL')) noBuild.add(`${p[0]}:${p[1]}`);
    }
  }
}
const W = recs[0].head.W;
const RES = new Map(AI_RESOURCES.map((r) => [r.type, r] as const));
/** an engine district's install type: the traitless AI row whose engine id it is */
const typeOfDistrict = (id: string): string => AI_DISTRICTS.find((r) => r.trait === null && engineId('district', r.type, 'DISTRICT_', DISTRICTS) === id)?.type ?? `DISTRICT_${id}`;
const YIELD_KEY: Record<string, string> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold', YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};

interface Tally { exact: number; close: number; far: number; miss: string[] }
const tally = new Map<string, Tally>();
const tallyOf = (k: string): Tally => tally.get(k) ?? (tally.set(k, { exact: 0, close: 0, far: 0, miss: [] }), tally.get(k)!);

const history = newHistory();
// the recorded random events replayed on the game's generator, with its draw
// log where the recording kept it (`replayEvents`, as run.ts builds them)
{
  const logPath = randLogPath(dump);
  if (logPath) history.randLog = loadRandLog(logPath, recs.flatMap((r) => (r.witness ?? []).flatMap((w) => (typeof w.seed === 'number' ? [w.seed] : []))));
  history.replay = replayEvents(recs, cat, history.randLog, read.filter((r) => r.moved));
}
/** the players whose city stood in an earlier record */
const hadCity = new Set<number>();
/** per player the production its idle city has stored, the turn's own in (the record keeps
 *  none: each record its city stands with an empty queue adds the turn's
 *  production; a record with an item clears it) */
const idleStore = new Map<number, number>();
/** per player the growth its city AI's last analysis read */
const growthSeen = new Map<number, CityGrowth>();
type Held = { imp: ReturnType<typeof importTurn>; turn: number; rec: TurnRecord };
let held: Held | null = null;
/** the record before the one analysed, as its own analysis left it */
let prev: Held | null = null;
for (const rec of recs) {
  advanceHistory(history, rec, cat);
  const after = importTurn(rec, cat, history);
  const cur = held;
  held = { imp: after, turn: rec.turn, rec };
  if (!cur) continue;
  const last = prev;
  prev = cur;
  const imp = cur.imp;
  const state = imp.state;
  // the rivers named by the city-states' turn: the look over the next
  // record's positions, the majors' actions of the turn done (the engine's
  // turn reads them so)
  state.riverNamed = after.state.riverNamed;
  // the map as the majors' turns left it: every plot no city-state holds in
  // either record as the record after holds it (its owner, improvement,
  // feature, district, road), an owning city the record lacks kept out
  const minorSeats = new Set([...state.cityStates, ...after.state.cityStates].map((c) => c.seat));
  const cityIds = new Set([...state.seats, ...(state.freeSeat ? [state.freeSeat] : [])].flatMap((s) => s.cities.map((c) => c.id)));
  for (const tile of state.map.tiles) {
    const next = after.state.map.tiles[tile.index];
    if (minorSeats.has(tile.ownerSeat) || minorSeats.has(next.ownerSeat)) continue;
    if (next.ownerSeat < 0 || cityIds.has(next.ownerCity)) {
      tile.ownerSeat = next.ownerSeat;
      tile.ownerCity = next.ownerCity;
    }
    tile.improvement = next.improvement;
    tile.pillaged = next.pillaged;
    tile.feature = next.feature;
    tile.resource = next.resource;
    tile.district = next.district;
    tile.districtComplete = next.districtComplete;
    tile.districtPillaged = next.districtPillaged;
    tile.builtWonder = next.builtWonder;
    tile.builtWonderComplete = next.builtWonderComplete;
    tile.road = next.road;
    tile.roadTier = next.roadTier;
  }
  const turn = cur.turn;
  for (const [player, cs] of imp.minorOfPlayer) {
    if (onlyPlayer !== null && player !== onlyPlayer) continue;
    const name = imp.dumpOfMinor.get(cs)?.name;
    const logged = plots.get(`${turn}:${player}:${name}`);
    const founded = !hadCity.has(player);
    if (imp.dumpOfMinor.get(cs)) hadCity.add(player);
    if (!logged) continue;
    const dc = imp.dumpOfMinor.get(cs);
    const idle = !!dc && (dc.queueProgress ?? []).length === 0;
    const nextCs = after.minorOfPlayer.get(player);
    // the turn's production step (City_BuildQueue.csv's first row of the
    // turn) and whether it completed the item in hand
    const step = name ? stepRow.get(`${turn}:${name}`) : undefined;
    const completed = !idle && !!step && step[0] >= step[1];
    // the Builders its City Analysis prices a charge at
    // (`CityState.aiBuilders`): the record's, with the one its production
    // step trained, none its contract purchases bought
    const builders = cs.buildersTrained + (completed && step[3] === 'UNIT_BUILDER' ? 1 : 0);
    // the store the turn's production step leaves: an idle city's adds the
    // Production the step made, the city as the record after holds it; an
    // item the step completed leaves its overflow and no item in hand
    const made = nextCs ? computeCityStats(after.state, minorCity(nextCs)).total.production : Number(dc?.productionYield ?? 0);
    // and the Production its Builder's harvests and feature removals of the
    // turn before landed where that turn's analysis chose nothing
    // (`minorLump`: an idle city's store takes the lump; one landing on an
    // item it chose is that item's, logged as a step row): each of its plots
    // whose feature or resource the record lacks that the record before
    // held, priced on the record before
    let lump = 0;
    const prevCs = last?.imp.minorOfPlayer.get(player);
    if (idle && noBuild.has(`${turn - 1}:${player}`) && last && prevCs) {
      for (const t0 of last.imp.state.map.tiles) {
        const t1 = state.map.tiles[t0.index];
        if (t0.ownerSeat !== prevCs.seat) continue;
        const grants = [...(t0.feature && t1.feature !== t0.feature ? chopGrant(last.imp.state, t0, prevCs.seat) : []),
          ...(t0.resource && t1.resource !== t0.resource ? [harvestGrant(last.imp.state, t0, prevCs.seat)].filter((g) => !!g) : [])];
        for (const g of grants) if (g!.key === 'production') lump += g!.amount;
      }
    }
    idleStore.set(player, idle ? (idleStore.get(player) ?? 0) + made + lump : completed ? step[2] : 0);
    cs.prodOverflow = idleStore.get(player)!;
    // the building or district it completed stands (`minorRaiseBuilding`)
    if (completed) {
      const done = minorItemInHand(cs);
      if (done && 'building' in done && !(cs.buildings ?? []).includes(done.building)) minorRaiseBuilding(state, cs, done.building);
      else if (done && 'district' in done) state.map.tiles[done.site].districtComplete = true;
      cs.prodItem = undefined;
      cs.prodProgress = 0;
    }
    // the gold shortfall its turn's start banked (its bankruptcy amenities):
    // the one the record after reads off this record's treasury
    if (nextCs) cs.goldShortfall = nextCs.goldShortfall;
    // its grid as its turn meets it (`minorPower`)
    minorPower(state, cs);
    if (nextCs && nextCs.prodItem === cs.prodItem) {
      cs.prodProgress = nextCs.prodProgress;
      cs.prodRetained = nextCs.prodRetained ? { ...nextCs.prodRetained } : undefined;
    }
    if (nextCs) {
      const n = nextCs.research;
      cs.research.civics = [...n.civics];
      cs.research.civic = n.civic;
      cs.research.civicProgress = n.civicProgress;
      cs.research.civicRetained = { ...n.civicRetained };
      if (n.civicOverflow) cs.research.civicOverflow = n.civicOverflow;
      else delete cs.research.civicOverflow;
      cs.research.techs = [...n.techs];
      cs.research.tech = n.tech;
      cs.research.techProgress = n.techProgress;
      cs.research.techRetained = { ...n.techRetained };
    }
    // its city's growth step (`minorGrowth`): the citizen it grows placed,
    // every citizen re-placed, on the map the turns before its own left
    minorGrowth(state, cs);
    // the civics AI's entries as its turn would write them (cityBuildLab.ts)
    cs.research.civicAiEntries = civicAnalysis(state, cs.seat, computeCityStats(state, minorCity(cs)).total.culture);
    // the Economic AI's Gold boost its last turn wrote: on the net income
    // its treasury cached at its last bank (m_xCachedNetIncome)
    const net = memField(cur.rec, player, 'PlayerTreasury', 'm_xCachedNetIncome');
    if (typeof net === 'number') cs.economy = { ...(cs.economy ?? newEconomicMemory()), goldBoost: economicGoldBoost(net / 256) };
    const facts = minorBuildFacts(state, cs, () => 0);
    const resFacts = minorResourceFacts(state, cs);
    // the forecast on the growth its city AI's last turn read
    // (`CityState.aiGrowthSeen`), its own the first turn
    const forecast = growthForecast(growthSeen.get(player) ?? facts.growth);
    growthSeen.set(player, { ...facts.growth });
    // the modifiers' housing on the same growth (`cityHousingValue`)
    const k = tradeVal.get(`${turn - 1}:${player}`);
    const modView = { ...facts.view, cityHousingValue: (i: number, id: number, housing: number, t: number, h: number) =>
      (i === cs.seat ? housingValue(facts.growth, forecast, housing, t, h) : facts.view.cityHousingValue(i, id, housing, t, h)),
      tradeKnowledge: (s: number) => (s === cs.seat && k !== undefined ? Math.round(k * 256) : facts.view.tradeKnowledge(s)) };
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
    // the districts' buildings terms (`buildingsPass`) over the centre's
    // logged BUILDINGS row taken back to the analysis's own: the
    // dependents' adds undone, the last building first (a later dependent
    // added as the analysis valued it, an earlier one as the pass left it)
    const centre = (centreRows.get(`${turn}:${player}:${name}`)?.BUILDINGS ?? []).map((v) => Math.round(v * FX));
    const own = AI_BUILDINGS.map((_, k) => centre[k] ?? FX_MIN);
    for (let k = AI_BUILDINGS.length - 1; k >= 0; k--) {
      if (AI_BUILDINGS[k].wonder || own[k] <= FX_MIN) continue;
      for (const i of BUILDING_DEPENDENTS[k]) {
        const v = facts.version(AI_BUILDINGS[i].type);
        const j = v === null ? undefined : AI_BUILDING_INDEX.get(v);
        const seen = j === undefined ? 0 : j > k ? own[j] : centre[j] ?? FX_MIN;
        if (seen > 0) own[k] -= seen;
      }
    }
    const passDistricts = buildingsPass(facts, own).districts;
    const camps = campTiles(state);
    const gp = cityAppealResolver(state);
    for (const lp of logged) {
      // a plot the analysis left unvalued keeps its row at 0 (the city centre,
      // a district's plot)
      if ((districtsMode ? lp.districts : lp.improvements).every((v) => v === 0)) continue;
      const plot = lp.y * W + lp.x;
      const tile = state.map.tiles[plot];
      // a plot holding a city, a district or a wonder: the analysis skips its
      // improvements (0x5cf160..0x5cf1ab: IsCity, GetDistrictType, the
      // wonder +0x1e, IsCanyon), its rows an earlier analysis's
      if (!districtsMode && (plot === cs.centerIndex || tile.district)) continue;
      const f: PlotValueFacts = {
        view: facts.view, seat: cs.seat,
        improvement: plotImprovementType(tile, camps),
        pillaged: !!tile.pillaged,
        // the resource the player sees: its RevealedByTech held
        resource: tile.resource && (!RESOURCES[tile.resource]?.revealTech || r.techs.includes(RESOURCES[tile.resource].revealTech!))
          ? gameTypeOf('resource', tile.resource, 'RESOURCE_') : null,
        feature: tile.feature ? installFeature(tile.feature) : null,
        floodTurns: floodHazardTurns(state, tile.index),
        eruptionTurns: eruptionHazardTurns(state, tile.index),
        drought: tile.droughtTurns > 0,
        appeal: tileAppeal(state.map, tile, camps, gp),
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
        era: facts.era,
        modifiers: (mods, t, h) => modifiersValue({ view: modView, seat: cs.seat, start: t, horizon: h, rate: AI_RATE,
          owner: { cityId: facts.cityId, capital: facts.capital }, plot: tile.index }, mods),
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
          keepsFeature: () => false,
          district: tile.district ? typeOfDistrict(tile.district) : null,
          districtPillaged: !!tile.districtPillaged,
          isCity: tile.index === cs.centerIndex,
          districtAdjacency: districtAdj,
          rowsAdjacency: districtAdj,
          // the districts the player may have (no other civilization's), the
          // city lacks and the plot takes, research and the district limit waived
          otherDistricts: (d) => AI_DISTRICTS.filter((x) => {
            if (x.type === d || x.trait !== null || x.type === 'DISTRICT_CITY_CENTER' || x.type === 'DISTRICT_WONDER') return false;
            const id = engineId('district', x.type, 'DISTRICT_', DISTRICTS) as keyof typeof DISTRICTS | null;
            if (!id || (cs.districts ?? []).some((c) => c.type === id)) return false;
            return canPlaceDistrictIn(state, city, id, plot, { unlocks: null, ownsTile: () => true, anyCount: true }).ok;
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
        };
        // a positive slot with the update's pass's buildings term, on the
        // centre's logged BUILDINGS row
        const slot = (district: number, t: number): number => {
          const v = districtValue(df, AI_DISTRICTS[district].type, t, AI_VALUE_HORIZON);
          return v > 0 ? v + passDistricts[district] : v;
        };
        lp.districts.forEach((lv, i) => {
          if (lv <= -9999) return;
          const row = AI_DISTRICTS[i];
          if (onlyImp && row.type !== onlyImp) return;
          const inHand = 0;
          const t = facts.buildTurns(row.type) + inHand + Math.max(techTurns(row.tech), facts.civicTurns(row.civic));
          const tparts = `${facts.buildTurns(row.type)}+${inHand}+${techTurns(row.tech)}/${facts.civicTurns(row.civic)}`;
          const ours = slot(i, t) / FX;
          const d = Math.abs(ours - lv);
          let rowFit = -1;
          if (rowsOut) for (let x = 0; x < AI_VALUE_HORIZON + 2 && rowFit < 0; x++) if (Math.abs(slot(i, x) / FX - lv) <= 0.01) rowFit = x;
          if (rowsOut) console.log(`ROW T=${t} fit=${rowFit} tp=${tparts} ${[-2, -1, 1, 2].map((dt) => (slot(i, t + dt) / FX).toFixed(2)).join(',')} t${turn} p${player} (${lp.x},${lp.y}) ${row.type} log ${lv.toFixed(2)} ours ${ours.toFixed(2)} adj ${['YIELD_SCIENCE', 'YIELD_FAITH', 'YIELD_GOLD', 'YIELD_PRODUCTION', 'YIELD_CULTURE'].map((y) => districtAdj(row.type, y)).join('/')} own=${lp.owned} pc=${df.purchaseCost} feat=${f.feature} res=${f.resource} store=${cs.prodOverflow} item=${cs.prodItem} pp=${cs.prodProgress}`);
          const k = tallyOf(row.type);
          if (d <= 0.01) k.exact++;
          else if (d <= 1) k.close++;
          else {
            k.far++;
            if (k.miss.length < show) {
              let fit = -1;
              for (let x = 0; x < AI_VALUE_HORIZON && fit < 0; x++) if (Math.abs(slot(i, x) / FX - lv) <= 0.01) fit = x;
              const at15 = (slot(i, 15) / FX).toFixed(2);
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
        // --all: every row, with its modifiers' part and its plot's facts
        if (allRows) console.log(`ALL t${turn} p${player} (${lp.x},${lp.y}) ${row.type} log ${lv.toFixed(2)} ours ${ours.toFixed(2)} t=${t} mods ${(f.modifiers(row.modifiers, t, AI_VALUE_HORIZON) / FX).toFixed(2)} own=${lp.owned} imp=${f.improvement} res=${f.resource} feat=${f.feature} hz=${f.floodTurns}/${f.eruptionTurns} appeal=${f.appeal}`);
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
