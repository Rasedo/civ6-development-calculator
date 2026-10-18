/** THE MINOR'S TURN — its city's yields, the research they buy, the upgrades
 * and purchases its purse makes, its Builders' work, its trade routes, the
 * item it produces and where its army stands, in its own module so the
 * legality bodies it borrows (rules.ts, game.ts, effects.ts, city.ts,
 * units.ts) stay upstream of cityStates.ts with no import cycle.
 *
 * CIV6 (City-state): a city-state's city is an ordinary city — its Campus
 * yields Science, its Commercial Hub Gold — and the city's own yields drive
 * its turn: `computeCityStats` over `minorCity` pays Science and Culture into
 * the two research pots and Production into the build pot, under the minor's
 * production rows (half its yield, and the toward-rows of the item it goes
 * to), and Gold and Faith into its purse, which pays its units' upkeep and
 * buys what its AI buys. WHAT it produces and buys is its city AI's
 * (`minorCityAi.ts`: the events, trees and contracts, the Default
 * Specialization, the purchases); what each item needs — the minor's own
 * researched unlock, a legal plot, an intact perimeter below a higher wall,
 * a free tile beside the centre for a unit — is the same rule a major pays.
 */
import type { City, CityState, DistrictId, GameState, QueueItem, ResearchState, Tile, Unit, YieldKey } from './types';
import { BUILDINGS } from '../data/buildings';
import { ERAS, TECHS, type Era } from '../data/techs';
import { CIVICS } from '../data/civics';
import {
  CITY_STATE_TYPE_DISTRICT, MINOR_BUILDER_PROD_PCT, MINOR_EXCLUDED_UNIT_CLASSES, MINOR_HARBOR_PROD_PCT,
  MINOR_MILITARY_PROD_PCT, MINOR_SMALL_MILITARY, MINOR_TYPE_DISTRICT_PROD_PCT, MINOR_UPGRADE_GOLD,
  MINOR_WALLS_PROD_PCT, MINOR_REPAIR_RESUME_PCT, MINOR_CATCHUP_PCT,
} from '../data/cityStates';
import { ENCAMPMENT_HP, UNITS, URBAN_DEFENSES_TECH, WALLS_TIER_HP, WALLS_TIER_URBAN, type UnitDef } from '../data/units';
import { UNIT_PROMO_CLASS, type PromoClass } from '../data/promotions';
import { PROJECTS, projectConversionRate } from '../data/projects';
import { worshipBuildingOf } from '../data/religion';
import { CIV_LEVELS } from '../data/civLevels';
import { CITY_MIN_STRIKE_CS, FAITH_PURCHASE_MULT, GOLD_PURCHASE_MULT, gameProgressPct } from '../data/constants';
import { detectBoosts } from './boosts';
import { canPlaceDistrictIn, fitEncampOuter, outerPool, urbanDefensesFit, wallsMax } from './rules';
import { lumpFood, seatGrowth } from './seatTurn';
import { freeCityBuildFacts, majorQueueItem } from './majorCityBuild';
import { minorAiTurn, minorItemBuilt } from './minorCityAi';
import { bankruptcy, cityBorderGrowth, cityStrikes, cultureAfterGrowth, paveGround } from './phase';
import { applyTrainingGrants, cityStrikeStrength } from './combat';
import { districtScaledBase, goldAffordable, projectCost, repairAvailable } from './game';
import { civEraIndex, computeCityStats } from './city';
import { researchCost, selectResearch } from './economy';
import { researchAnalysis, researchCompletionChoice, researchDraw, researchTurnChoice, researchTurnsLeft, type ResearchChoice, type TechContract } from './aiResearch';
import { civicAnalysis, civicChoice, civicDraw } from './aiCivics';
import { minorCity, suzerainOf } from './cityStates';
import { computeUnlocksIn, purchaseStep, unitMaintenance, type Unlocks } from './effects';
import { buildingPillaged, cityPower, repairBuilding } from './yields';
import { centerBuildingIds } from './prodLayout';
import { cityLowlands, floodBarrierCost, repairBehindBarrier } from './climate';
import { minorTrade, tradeCapacity } from './trade';
import { BARB_SEAT, FREE_SEAT, freeSeatOf, hiddenResourcesFor, isCiv, majorityReligionOf, majorsAlive, seatOf, tileSeat } from './seats';
import { builderCost, cityNavalCapable, disbandUnit, raiseBestTrained, spawnUnit, traderCost, unitIsMilitary } from './units';
import { irradiated } from './nuclear';
import { atRngPoint } from './rand';
import { knowledgeLook } from './tactical';
import { cityStateMilitary, minorCampsLook } from './minorOps';
import { tilesWithin } from '../../world/hex';
import { hasRiver } from '../../world/query';
import { aliases, engineId, gameTypeOf } from '../data/aliases';
import { DISTRICTS } from '../data/districts';
import { AI_BUILDINGS, AI_PROMOTION_CLASS_LISTS, AI_UNITS } from '../data/aiBuildTables';
import { AI_VALUE_HORIZON } from '../data/aiValue';
import { TECH_IMPROVEMENT_RESOURCES, resourceValue, type ResourceFacts } from './aiResource';
import { RESOURCES, extractsResource } from '../../world/resources';
import { unitProductionTable } from './aiUnitProduction';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, amenityPerTurn, buildingTable, buildingValue, constructibleNow, defaultSpecialization, unitTable, type AiUnitRow, type CityBuildFacts, type CityBuildTables, type PickFacts } from './aiCityBuild';
import { projectTable, type ProjectTableFacts } from './aiProjectValue';
import { upgradeGoldCost } from './stockpile';
import { FX, FX_MIN, fmul, fxConst, fxOf, pseudoYieldValue, turnsAt, valueBetween, yieldValue } from './aiValue';
import { majorView } from './majorView';
import { cityStateSight } from './fog';
import { combatDesire, type CombatDesire } from './aiMilitary';

/** One minor at a time — a district one minor lands may lend a neighbour's
 *  district adjacency across the border, so the next minor's yields read it.
 *  A levied army due home comes home first; the city's grid is resolved
 *  before its yields read it. Then, as every player's turn runs
 *  (tools/civ6lab/turn_order_civ6.md): its economy (`minorEconomy`) and the
 *  research that completes on it, then its city — the Production its city
 *  makes now, then growth and borders on the city as it stands after that
 *  (`minorGrowth`) — its city presses a religion it follows on that
 *  religion's founder's turn (`spreadReligiousPressure`) — then its military
 *  AI's Combat Desire (`minorCombatDesire`), then its
 *  knowledge base's look (`minorKnowledge`), then its actions: a research
 *  completion's upgrades, its city AI's turn (`minorAiTurn`: its builds,
 *  purchases and trees, the trees' Builders' work), its routes' walk and a
 *  free Trader's route, its city's ranged strikes (the majors' own body
 *  fired from the minor's centre strength), its army's walk, and last the
 *  boosts the turn earned (`detectBoosts`). */
export function minorPhase(state: GameState): void {
  for (const cityState of state.cityStates) {
    atRngPoint(state, { kind: 'seat', seat: cityState.seat, turn: state.turn });
    minorLevyReturn(state, cityState);
    minorPower(state, cityState);
    const gained = minorEconomy(state, cityState);
    minorBuild(state, cityState, computeCityStats(state, minorCity(cityState)).total.production);
    minorGrowth(state, cityState);
    // its military AI's turn: the Combat Desire on the records as its last
    // update aged them
    cityState.combatDesire = minorCombatDesire(state, cityState, state.turn - 1).desire;
    minorKnowledge(state, cityState, true);
    if (!ordersHeld) minorUpgrades(state, cityState, gained);
    minorAiTurn(state, cityState);
    minorTrade(state, cityState, !ordersHeld);
    const city = minorCity(cityState);
    cityStrikes(state, city, cityStrikeStrength(state, city));
    if (!ordersHeld) cityStateMilitary(state, cityState);
    minorKnowledge(state, cityState, false);
    // the boosts its turn earned (runs/h1_duelw1117 t1: every city-state
    // takes Pottery before its coastal city's Sailing eureka lands)
    detectBoosts(state, cityState.seat);
  }
}

/**
 * THE LEVIED ARMY COMES HOME. CIV6 (LOC_CITY_STATES_LEVY_MILITARY_DETAILS):
 * "They will return to the city-state after {2_TurnLimit} Turns, or if the
 * Suzerain changes." Every unit still standing that the levy took from this
 * minor (`Unit.leviedFrom`) is the minor's again where it stands. The
 * term's turns are the minor's own starts, the first the one that follows
 * the levy, so the army is home at the minor's start of turn `levyEnds` —
 * 14 turns after the levy online (every recorded levy of the H-1 duels that
 * ran its term, runs/h1_duelw1117-1131).
 */
export function minorLevyReturn(state: GameState, cityState: CityState): void {
  if (cityState.levySeat === undefined) return;
  if (state.turn + 1 < (cityState.levyEnds ?? 0) && suzerainOf(cityState) === cityState.levySeat) return;
  if (leviesHeld) {
    leviesHeld.add(cityState.id);
    return;
  }
  sendLevyHome(state, cityState);
}

/** the replay's hold on the levied armies' return (`holdLevies`): the
 *  minors whose start found their army due home, which the replay sends
 *  home when the minor acts, after the players before it in the turn */
let leviesHeld: Set<number> | null = null;

/** hold (or release) the levied armies' return at the minor's start: a
 *  replay applies the players' actions after every start, and the players
 *  before the minor fight with the levied army in the game's turn
 *  (runs/h1_duelw1117 t42: China's levied Warrior took 23 damage killing a
 *  barbarian, then came home). Nothing outside a replay. */
export function holdLevies(on: boolean): void {
  leviesHeld = on ? new Set() : null;
}

/** the held armies due home — one minor's (`cityStateId`) or every one —
 *  sent home now */
export function releaseLevies(state: GameState, cityStateId?: number): void {
  if (!leviesHeld) return;
  for (const id of [...leviesHeld]) {
    if (cityStateId !== undefined && id !== cityStateId) continue;
    leviesHeld.delete(id);
    const cs = state.cityStates.find((c) => c.id === id);
    if (cs && cs.levySeat !== undefined) sendLevyHome(state, cs);
  }
}

/** the levied army is the minor's again where it stands */
function sendLevyHome(state: GameState, cityState: CityState): void {
  for (const u of state.units) {
    if (u.leviedFrom !== cityState.seat) continue;
    u.seat = cityState.seat;
    delete u.leviedFrom;
  }
  delete cityState.levySeat;
  delete cityState.levyEnds;
}

/**
 * THE MINOR'S GRID (`cityPower` over its one city). CIV6 (Power): the load is
 * met all at once or not at all. A city-state holds no stockpile, so no power
 * plant can run for it; its renewables (a Dam, the Solar and Wind Farms on its
 * plots) must carry the whole load — or a running `fullyPowered` project
 * (Industrial Zone Logistics) meets it, as a major's does.
 */
export function minorPower(state: GameState, cityState: CityState): void {
  const p = cityPower(state, minorCity(cityState));
  cityState.powered = p.demand > 0 && (p.supply >= p.demand || !!cityState.fullyPowered);
}

/** the minor's Tech Contracts (its city AI's Add Goal Tech contracts): each
 *  goal technology and the contract's value */
function minorTechContracts(cityState: CityState): TechContract[] {
  const ai = cityState.cityAi;
  if (!ai) return [];
  const out: TechContract[] = [];
  for (const c of ai.contracts) {
    const goal = ai.techContracts[c.id];
    const tech = goal === undefined ? null : engineId('tech', goal, 'TECH_', TECHS);
    if (tech) out.push({ tech, value: c.value });
  }
  return out;
}

/**
 * THE MINOR'S ECONOMY, in the order every player's start of turn runs
 * (tools/civ6lab/turn_order_civ6.md): its city's Science and Culture as the
 * turn opens feed the two research pots, and the research completes on them
 * (`minorResearch`); then, off the city as that research left it, its Gold
 * banks and pays its units' upkeep — each unit's own Maintenance, a minor
 * carrying no government or policy that cuts it — and meets the
 * `bankruptcy` every seat meets, and its Faith banks. Returns how many trees
 * completed a row, the upgrade trigger's count.
 */
export function minorEconomy(state: GameState, cityState: CityState): number {
  let y = computeCityStats(state, minorCity(cityState)).total;
  const gained = minorResearch(state, cityState.research, cityState.seat, y.science, y.culture,
    () => minorResearchResources(state, cityState), () => minorUrbanFit(state, cityState), minorTechContracts(cityState));
  if (gained > 0) y = computeCityStats(state, minorCity(cityState)).total;
  let upkeep = 0;
  for (const u of state.units) if (u.seat === cityState.seat) upkeep += unitMaintenance(u);
  cityState.treasury += y.gold;
  cityState.treasury -= upkeep;
  bankruptcy(state, cityState, (u) => unitMaintenance(u));
  cityState.faith += y.faith;
  return gained;
}

/**
 * THE MINOR'S CITY GROWS AND CLAIMS, on the city as it stands after its
 * production. CIV6 (City-state): the install has ONE city rule, so the
 * minor's city GROWS on its food box and CLAIMS ground on its culture box
 * exactly as a major's does. Both rules are the majors' own composers, and
 * the boxes live on the `CityState` record because `minorCity` builds a fresh
 * `City` view every call — so the results are written back.
 */
export function minorGrowth(state: GameState, cityState: CityState): void {
  const city = minorCity(cityState);
  const stats = computeCityStats(state, city);
  const popBefore = city.population;
  seatGrowth(city, stats.effectiveFoodSurplus, stats.growthNeeded, state.turn);
  cityBorderGrowth(state, city, cityState.seat, cultureAfterGrowth(state, city, popBefore, stats));
  cityState.population = city.population;
  cityState.unconvertedPressure = city.unconvertedPressure;
  cityState.foodBox = city.foodBox;
  cityState.cultureBox = city.cultureBox;
  cityState.nextPlot = city.nextPlot;
  cityState.tilesAcquired = city.tilesAcquired;
}

/**
 * A MINOR'S RESEARCH — a city-state's or the Free Cities' (the catch-up's
 * receivers, 0x4cb930) — each tree as a major's runs: the item in hand banks
 * the turn's yield and the overflow a completion set aside, and completes at
 * its cost, leaving the rest. Its technologies are the research AI's
 * (`aiResearch.ts`) and its civics the civics AI's (`aiCivics.ts`): a
 * completion's choice, then the turn's; a pick resumes the progress kept on
 * it (`selectResearch`). First the CATCH-UP (`minorCatchUp`). Early Empire is
 * the row `borderClosedTo` reads. CIV6 (Urban Defenses): the tech "builds
 * modern fortifications around the City Centers of all current and future
 * cities and their Encampment districts" — `urban` fits the holder's cities
 * on its completion. `resources` gives the research analysis its resources
 * term, `contracts` the seat's Tech Contracts. Returns how many trees
 * completed a row this turn — the upgrade trigger's count.
 */
export function minorResearch(state: GameState, r: ResearchState, seat: number, science: number, culture: number,
  resources: () => ((tech: string, turns: number) => number) | undefined, urban: () => void,
  contracts: readonly TechContract[]): number {
  let gained = 0;
  // THE TECHNOLOGIES: the turn's Science banks; a completion's choice reads
  // the research AI's analysis of the turn before (0x762d60); then the AI's
  // turn analyses the tree and makes its turn's choice (0x760980)
  minorCatchUp(state, r, false, seat);
  r.techProgress += science + (r.techOverflow ?? 0);
  r.techOverflow = 0;
  const cur = r.tech;
  const cost = cur ? researchCost(state, cur, false, seat) : Infinity;
  if (cur && r.techProgress >= cost) {
    gained += 1;
    r.techProgress -= cost;
    if (!r.techs.includes(cur)) r.techs.push(cur);
    delete r.techRetained[cur];
    r.tech = null;
    takeChoice(r, researchCompletionChoice(state, seat, r.aiEntries ?? researchAnalysis(state, seat, science, {}, resources(), contracts), cur, researchDraw(state)));
    r.aiLeft = r.tech ? researchTurnsLeft(state, seat, r, r.tech, fxOf(science)) : 0;
    if (cur === URBAN_DEFENSES_TECH) urban();
  }
  r.aiEntries = researchAnalysis(state, seat, science, {}, resources(), contracts);
  r.aiLeftSeen = r.aiLeft ?? 0;
  takeChoice(r, researchTurnChoice(state, seat, r.aiEntries, researchDraw(state)));
  r.aiLeft = r.tech ? researchTurnsLeft(state, seat, r, r.tech, fxOf(science)) : 0;
  // THE CIVICS: the turn's Culture banks; a completion's choice reads the
  // civics AI's analysis of the turn before, the completed civic its key
  // (0x6293e0); then the AI's turn analyses the tree and, with nothing in
  // hand, chooses (0x620110)
  minorCatchUp(state, r, true, seat);
  r.civicProgress += culture + (r.civicOverflow ?? 0);
  r.civicOverflow = 0;
  const civ = r.civic;
  const civCost = civ ? researchCost(state, civ, true, seat) : Infinity;
  if (civ && r.civicProgress >= civCost) {
    gained += 1;
    r.civicProgress -= civCost;
    if (!r.civics.includes(civ)) r.civics.push(civ);
    delete r.civicRetained[civ];
    r.civic = null;
    takeCivic(r, civicChoice(state, seat, r.civicAiEntries ?? civicAnalysis(state, seat, culture), civ, civicDraw(state)));
  }
  r.civicAiEntries = civicAnalysis(state, seat, culture);
  if (!r.civic) takeCivic(r, civicChoice(state, seat, r.civicAiEntries, null, civicDraw(state)));
  return gained;
}

/** Urban Defenses on a city-state: its centre's perimeter and its
 *  Encampment's own pool at the urban tier's full pool */
function minorUrbanFit(state: GameState, cityState: CityState): void {
  cityState.outerHp = WALLS_TIER_HP[WALLS_TIER_URBAN];
  for (const d of cityState.districts ?? []) {
    const t = state.map.tiles[d.tileIndex];
    if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = WALLS_TIER_HP[WALLS_TIER_URBAN];
  }
}

/**
 * A MINOR'S CATCH-UP (0x4cb930 techs, 0x39ec60 civics, on every major's
 * acquisition; `tools/civ6lab/dll_readings.md` "H-1: a minor's research
 * catch-up"): a row the minor lacks that at least max(1, (MINOR_CATCHUP_PCT
 * x majors + 50) / 100) of the majors still in the game hold stands at its
 * cost less one — the item in hand or the progress kept on another — so its
 * next turn on it completes it (runs/h1_duelw1121: Rome's Code of Laws at t4
 * puts every minor's at 9 of 10, its Pottery at t6 theirs at 11 of 12;
 * China's Craftsmanship at t11 completes Ayutthaya's from 8.98 of 20). Read
 * at the minor's turn, after every major's of the turn, it never lowers what
 * the minor holds.
 */
function minorCatchUp(state: GameState, r: ResearchState, civic: boolean, seat: number): void {
  const majors = majorsAlive(state).map((s) => catchUpHold?.get(s) ?? state.seats[s].research);
  const need = Math.max(1, Math.floor((MINOR_CATCHUP_PCT * majors.length + 50) / 100));
  const catalog: Record<string, { cost: number }> = civic ? CIVICS : TECHS;
  const have = civic ? r.civics : r.techs;
  for (const id of Object.keys(catalog)) {
    if (have.includes(id)) continue;
    if (majors.filter((m) => (civic ? m.civics : m.techs).includes(id)).length < need) continue;
    const floor = researchCost(state, id, civic, seat) - 1;
    if ((civic ? r.civic : r.tech) === id) {
      if (civic) r.civicProgress = Math.max(r.civicProgress, floor);
      else r.techProgress = Math.max(r.techProgress, floor);
    } else {
      const kept = civic ? r.civicRetained : r.techRetained;
      kept[id] = Math.max(kept[id] ?? 0, floor);
    }
  }
}

let catchUpHold: Map<number, { techs: readonly string[]; civics: readonly string[] }> | null = null;

/** The action replay's hold on the catch-up's count (`cpu/harness/
 *  replay.ts`): the research a major held at the minors' turn in the game's
 *  order, by seat, where the engine's turn has run that major's next start
 *  ahead of theirs. Null outside a replay. */
export function holdMinorCatchUp(held: Map<number, { techs: readonly string[]; civics: readonly string[] }> | null): void {
  catchUpHold = held;
}

/** the research AI's choice taken: its research and its goal */
function takeChoice(r: ResearchState, c: ResearchChoice | null): void {
  if (!c) return;
  selectResearch(r, c.tech);
  r.goal = c.goal;
}

/** A city-state's or the Free Cities' item COMPLETED outside its research
 *  step (a boost that filled it, `markBoost`): held, the progress kept on it
 *  spent, Urban Defenses' walls fitted; the item in hand makes the
 *  completion's choice over the analysis its last turn left, the completed
 *  row the key (0x762d60, 0x6293e0) */
export function minorCompleteNow(state: GameState, seat: number, id: string): void {
  const r = seatOf(state, seat)?.research;
  if (!r) return;
  if (!TECHS[id]) {
    if (r.civics.includes(id)) return;
    r.civics.push(id);
    delete r.civicRetained[id];
    if (r.civic !== id) return;
    r.civic = null;
    r.civicProgress = 0;
    if (r.civicAiEntries) takeCivic(r, civicChoice(state, seat, r.civicAiEntries, id, civicDraw(state)));
    return;
  }
  if (r.techs.includes(id)) return;
  r.techs.push(id);
  delete r.techRetained[id];
  if (id === URBAN_DEFENSES_TECH) {
    const cs = state.cityStates.find((x) => x.seat === seat);
    if (cs) minorUrbanFit(state, cs);
    else urbanDefensesFit(state, seat);
  }
  if (r.tech !== id) return;
  r.tech = null;
  r.techProgress = 0;
  if (r.aiEntries) takeChoice(r, researchCompletionChoice(state, seat, r.aiEntries.map((e) => ({ ...e })), id, researchDraw(state)));
}

/** the civics AI's choice taken */
function takeCivic(r: ResearchState, civic: string | null): void {
  if (civic) selectResearch(r, civic, true);
}

/**
 * THE UPGRADE TRIGGER. CIV6 (Leaders.xml, MinorCivTriggeredTrees): a minor's
 * "Upgrade Units" tree runs on TRIGGER_TECH_UPGRADE and TRIGGER_CIVIC_UPGRADE
 * — a technology or a civic gained. The census reads ONE upgrade per such turn
 * (1,356 of the 1,608 upgrade turns upgrade one unit, 222 two: a tech and a
 * civic together), the same chassis' remaining units following on later
 * triggers, at `MINOR_UPGRADE_GOLD` each. So each completion upgrades the
 * first unit in unit order that may: the chassis' upgrade unlocked by the
 * minor's own research, standing on the minor's ground with Movement left
 * (CIV6, Unit: "in friendly territory", "more than 0 Movement"), the treasury
 * covering the price. A minor ignores the strategic resource the new chassis
 * asks (`CivilizationLevels.IgnoresUnitStrategicResourceRequirements`,
 * CITY_STATE true). Which unit goes first is unmeasured. The upgrade spends
 * the unit's turn, as every upgrade here does.
 */
export function minorUpgrades(state: GameState, cityState: CityState, gained: number): void {
  for (let n = 0; n < gained; n++) {
    const u = state.units.find((x) => x.seat === cityState.seat && minorCanUpgrade(state, cityState, x));
    if (!u || !minorUpgradeUnit(state, cityState, u)) return;
  }
}

/** A MINOR UPGRADES ONE UNIT: one `minorCanUpgrade` passes, for
 *  `MINOR_UPGRADE_GOLD` from a treasury that covers it; the upgrade spends
 *  the unit's turn. Returns whether it upgraded. */
export function minorUpgradeUnit(state: GameState, cityState: CityState, u: Unit): boolean {
  if (!goldAffordable(cityState.treasury, MINOR_UPGRADE_GOLD) || !minorCanUpgrade(state, cityState, u)) return false;
  cityState.treasury -= MINOR_UPGRADE_GOLD;
  u.type = UNITS[u.type].upgradesTo!;
  u.movesLeft = 0;
  raiseBestTrained(state, cityState.seat, u.type, u.formation ?? 0);
  return true;
}

function minorCanUpgrade(state: GameState, cityState: CityState, u: Unit): boolean {
  const next = UNITS[u.type]?.upgradesTo;
  const def = next ? UNITS[next] : undefined;
  if (!def || u.movesLeft <= 0) return false;
  const r = cityState.research;
  if (def.requiresTech && !r.techs.includes(def.requiresTech)) return false;
  if (def.requiresCivic && !r.civics.includes(def.requiresCivic)) return false;
  return tileSeat(state.map.tiles[u.tileIndex]) === cityState.seat;
}

/** A unit's purchase price for the minor: its Production cost (a Builder's
 *  and a Trader's climb with their copies and the game's progress) times the
 *  purchase multiplier, in Gold; in Faith its Faith price. */
export function minorUnitPrice(state: GameState, cityState: CityState, id: string, currency: 'gold' | 'faith'): number {
  if (currency === 'faith') return purchaseStep(Math.round(UNITS[id].cost * FAITH_PURCHASE_MULT));
  const cost = id === 'BUILDER' ? builderCost(state, cityState.seat) : id === 'TRADER' ? traderCost(state, cityState.seat) : UNITS[id].cost;
  return purchaseStep(cost * GOLD_PURCHASE_MULT);
}

/** THE MINOR BUYS A UNIT in its city: the purse covers the price, the unit
 *  stands on or beside the centre (none bought with no free tile) and carries
 *  the city's training grants; a Faith purchase raises the seat's bests.
 *  Returns the unit. */
export function minorBuyUnit(state: GameState, cityState: CityState, id: string, currency: 'gold' | 'faith'): Unit | undefined {
  const price = minorUnitPrice(state, cityState, id, currency);
  if (!goldAffordable(currency === 'gold' ? cityState.treasury : cityState.faith, price)) return undefined;
  const u = spawnUnit(state, id, cityState.centerIndex, cityState.seat);
  if (!u) return undefined;
  if (currency === 'faith') {
    cityState.faith -= price;
    raiseBestTrained(state, cityState.seat, id);
    return u;
  }
  applyTrainingGrants(state, minorCity(cityState), u);
  cityState.treasury -= price;
  if (id === 'BUILDER') cityState.buildersTrained += 1;
  return u;
}

/** CIV6 (`CivilizationLevels.IgnoresUnitStrategicResourceRequirements`): a
 *  city-state trains and upgrades into a chassis whatever strategic resource
 *  it asks. */
function minorAnyResource(): boolean {
  return CIV_LEVELS.CITY_STATE.ignoresUnitStrategicResourceRequirements;
}

/** THE ACTION REPLAY'S HOLD on the minors' orders: a city-state's moves and
 *  battles, its upgrades and the route its free Trader takes are the
 *  record's, which the replay lands (through `minorUpgradeUnit` and
 *  `minorRouteTo`), so the engine's sit out; its units' tactical turn the
 *  replay runs on a copy beside the record's (`minorAi`). Its builds, its
 *  purchases and its trees' Builders are its own. False outside a replay. */
let ordersHeld = false;
export function holdMinorOrders(on: boolean): void {
  ordersHeld = on;
}

/** A MINOR'S BUILDER LAYS AN IMPROVEMENT: it stands on the plot, spends a
 *  charge and its turn, and is gone with its last charge. */
export function minorBuilderLays(state: GameState, u: Unit, plot: number, imp: string): void {
  const tile = state.map.tiles[plot];
  u.tileIndex = plot;
  tile.improvement = imp;
  tile.pillaged = false;
  u.charges = (u.charges ?? 0) - 1;
  u.movesLeft = 0;
  if (u.charges <= 0) disbandUnit(state, u.id);
}

/** The land (or, with `naval`, the naval) military chassis a research
 *  record may train: it unlocks it, it asks no strategic resource unless
 *  `anyResource` (the holder ignores the ask, or holds no stockpile to meet
 *  it), it is no civilization's unique, and MinorCivUnitBuilds does not bar
 *  its class. A minor's and a Free City's set alike. */
export function trainableIn(r: { techs: string[]; civics: string[] }, anyResource: boolean, naval = false): UnitDef[] {
  return Object.values(UNITS).filter((d) =>
    unitIsMilitary(d.id) && !!d.naval === naval && !d.air && !d.faithOnly && !d.spawnOnly && !d.settler && !d.uniqueTo
    && (anyResource || !d.requiresResource)
    && (!d.requiresTech || r.techs.includes(d.requiresTech))
    && (!d.requiresCivic || r.civics.includes(d.requiresCivic))
    && !!UNIT_PROMO_CLASS[d.id] && !MINOR_EXCLUDED_UNIT_CLASSES.includes(UNIT_PROMO_CLASS[d.id]));
}

/** The strongest chassis of `cls` in a trainable set, ties by catalog order
 *  — `bestTrainableOfClass`'s rule over the minor's (or Free City's) set. */
export function minorBestOfClass(trainable: UnitDef[], cls: PromoClass): string | null {
  let best: UnitDef | undefined;
  for (const d of trainable) {
    if (UNIT_PROMO_CLASS[d.id] !== cls) continue;
    if (!best || (d.combat ?? 0) > (best.combat ?? 0)) best = d;
  }
  return best?.id ?? null;
}

/** May the minor raise building `id` now? Its own research unlocks it (a
 *  worship building answers to its religion instead, `minorWorship`); it is
 *  not already held; its district stands complete and clean (the centre's
 *  own for a City Center row); the row it requires is held and the one it
 *  excludes is not; a Water Mill wants a river at the centre; a Flood
 *  Barrier "must be built in a city with one or more Coastal Lowland tiles";
 *  and CIV6: "While city defenses are damaged, you cannot build higher levels
 *  of Walls." */
function minorBuildingOk(state: GameState, cityState: CityState, id: string, unlocks: Unlocks): boolean {
  const def = BUILDINGS[id];
  const held = cityState.buildings ?? [];
  if (!def || held.includes(id) || (!def.worship && !unlocks.buildings.has(id))) return false;
  const centre = state.map.tiles[cityState.centerIndex];
  const home = def.district === 'CITY_CENTER' ? centre
    : (cityState.districts ?? []).map((d) => state.map.tiles[d.tileIndex])
      .find((t) => t.district === def.district && t.districtComplete);
  if (!home || irradiated(home)) return false;
  if (def.requiresAny?.length && !def.requiresAny.some((r) => held.includes(r))) return false;
  if (def.exclusiveWith?.some((x) => held.includes(x))) return false;
  if (def.special === 'WATER_MILL' && !hasRiver(centre)) return false;
  if (def.floodBarrier && cityLowlands(state, minorCity(cityState)).length === 0) return false;
  const shape = { buildings: held, seat: cityState.seat, outerHp: cityState.outerHp };
  if (def.walls && outerPool(state, shape) < wallsMax(state, shape)) return false;
  return true;
}

/** A building's price for the minor: its catalog Cost, the Flood Barrier's
 *  priced off the lowland it covers (`floodBarrierCost`). */
function minorBuildingCost(state: GameState, cityState: CityState, id: string): number {
  const def = BUILDINGS[id];
  return def.floodBarrier ? floodBarrierCost(state, minorCity(cityState)) : def.cost;
}

/** The worship building the minor's city is offered (`worshipOffered`): the
 *  one its majority religion's Worship belief names, none while it holds a
 *  worship building. */
function minorWorship(state: GameState, cityState: CityState): string | undefined {
  if ((cityState.buildings ?? []).some((b) => BUILDINGS[b]?.worship)) return undefined;
  const rel = majorityReligionOf(state, cityState.seat);
  return rel < 0 ? undefined : worshipBuildingOf(seatOf(state, rel)?.religion.worship);
}

/** May the minor run district project `id` now? Its district stands complete
 *  and clean in its city (`availableProjects`' district clause). */
function minorProjectOk(state: GameState, cityState: CityState, id: string): boolean {
  const def = PROJECTS[id];
  if (!def) return false;
  const home = (cityState.districts ?? []).map((d) => state.map.tiles[d.tileIndex])
    .find((t) => t.district === def.district && t.districtComplete);
  return !!home && !irradiated(home);
}

/** How many Traders the minor has out or standing — what its trade capacity
 *  bounds. */
function minorTraders(state: GameState, cityState: CityState): number {
  let n = (cityState.tradeRoutes ?? []).length;
  for (const u of state.units) if (u.seat === cityState.seat && u.type === 'TRADER') n += 1;
  return n;
}

/** The pillaged building the minor repairs next: the first in the
 *  production layout whose district stands complete and unpillaged (a City
 *  Center row always). */
function minorRepairTarget(state: GameState, cityState: CityState): string | undefined {
  if (!cityState.pillagedBuildings?.length) return undefined;
  return centerBuildingIds().find((id) => {
    if (!buildingPillaged(cityState, id)) return false;
    const def = BUILDINGS[id];
    if (def.district === 'CITY_CENTER') return true;
    return (cityState.districts ?? []).some((d) => {
      const t = state.map.tiles[d.tileIndex];
      return t.district === def.district && t.districtComplete && !t.districtPillaged;
    });
  });
}

/** What a minor's step may hold: a unit it trains, a building it raises, a
 *  district it lays on its plot, a project it runs, a pillaged building it
 *  repairs, or nothing. */
export type MinorItem = { unit: string } | { building: string } | { district: DistrictId; site: number }
  | { project: string } | { repair: string } | { none: true };

/** The item's key: the progress it keeps (`CityState.prodRetained`) and the
 *  item in hand (`CityState.prodItem`) are filed under it. */
export function minorItemKey(item: MinorItem): string {
  if ('unit' in item) return `unit:${item.unit}`;
  if ('building' in item) return `building:${item.building}`;
  if ('district' in item) return `district:${item.district}`;
  if ('project' in item) return `project:${item.project}`;
  if ('repair' in item) return `repair:${item.repair}`;
  return '';
}

/**
 * THE MINOR'S BUILD STEP (City_BuildQueue 0x16f050, the step every city
 * takes; `tools/civ6lab/dll_readings.md` "H-1: the build queue's overflow").
 * It works the item in hand, its city AI's pick (`minorAiTurn`, after the
 * step). The city keeps each item's progress apart: an item it turns from
 * keeps what it holds, and one it turns back to resumes there
 * (`CityState.prodRetained`; runs/h1_duelw1117 Caguana's Monument, 2.5 at
 * t2, resumed at 2 after its Builder). The step pays the city's Production
 * (A, its yield, the minor's -50% among its percents) plus the overflow
 * store, the sum under the item's own row (a Builder or a military
 * unit +200%, walls +200%, the Harbor and the type's district +500%:
 * 0x1856ed multiplies the sum; 1117 Caguana's Builder 0 → 15 on 2.5 with an
 * idle step's 2.5 stored, its Warrior 0 → 16 on 3.5 with the Monument's 2).
 * An item completes when its progress covers its cost, one a turn — a unit
 * also needs a free tile on or beside the centre — and leaves the store A
 * less what it lacked before the step, never below 0 (A is the city's plain
 * Production: a minor holds no flat toward its head). With nothing in hand
 * the step adds A to the store. A district paves its plot (`paveGround`).
 * The walls' repair restores the walls, the city's and its Encampment's, at
 * the HP it puts back (`projectCost`); a district project converts the row's
 * `yieldPct` of what the step paid in (never above its cost) into its yield,
 * which the city's yields read until the next step (`CityState.projectYield`;
 * a city-state earns no Great People, so its points go nowhere). The step
 * clears the last conversion first. A PILLAGED building is queued after the
 * item the minor was working on when it fell (`CityState.repairWait`) and
 * then comes first, or at once with nothing in hand: it resumes at
 * `MINOR_REPAIR_RESUME_PCT` of its cost and the rest is built
 * (`minorRepairTarget`).
 */
export function minorBuild(state: GameState, cityState: CityState, production: number): void {
  cityState.fullyPowered = false;
  delete cityState.buildProject;
  delete cityState.projectYield;
  // A, which is the city's plain Production too: a minor holds no flat
  // toward its head
  const made = production;
  const repair = minorRepairTarget(state, cityState);
  let item: MinorItem;
  if (repair && !cityState.repairWait) item = { repair };
  else {
    // a repair in hand stands only while its building is the one to repair
    const inHand = minorItemInHand(cityState);
    const held = inHand && 'repair' in inHand && inHand.repair !== repair ? null : inHand;
    if (held) item = held;
    else {
      cityState.repairWait = false;
      item = repair ? { repair } : { none: true };
    }
  }
  minorSetItem(state, cityState, 'none' in item ? null : item);
  if ('none' in item) {
    cityState.prodOverflow = (cityState.prodOverflow ?? 0) + made;
    return;
  }
  const pct = minorItemPct(state, cityState, item);
  const cost = minorItemCost(state, cityState, item);
  const before = cityState.prodProgress ?? 0;
  const paid = made + (cityState.prodOverflow ?? 0);
  cityState.prodProgress = before + paid * ((100 + pct) / 100);
  cityState.prodOverflow = 0;
  const def = 'project' in item ? PROJECTS[item.project] : undefined;
  if (def?.yield) cityState.projectYield = { key: def.yield, amount: Math.min(paid, cost) * projectConversionRate(def) };
  if ('district' in item) {
    // the MINOR's own price and the progress it is judged against. A
    // minor's district feeds its suzerain's yields, so a build one turn
    // apart is a small, permanent drift in a MAJOR's purse with no other
    // symptom.
    const _dl = (globalThis as { __diffLog?: string[] }).__diffLog;
    if (_dl) _dl.push(`dm:${cityState.seat}:${state.turn}:${item.district}`
      + ` t${cost} pot${Math.floor(cityState.prodProgress)}`);
  }
  if (cityState.prodProgress < cost) {
    if (def && 'project' in item) {
      cityState.fullyPowered = !!def.fullyPowered;
      cityState.buildProject = item.project;
    }
    return;
  }
  if (!minorFinish(state, cityState, item)) return;
  cityState.prodOverflow = Math.max(0, made - Math.max(0, cost - before));
}

/** the minor's item in hand (`CityState.prodItem`, a district at
 *  `CityState.prodSite`), null none */
export function minorItemInHand(cityState: CityState): Exclude<MinorItem, { none: true }> | null {
  const key = cityState.prodItem;
  if (!key) return null;
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  if (kind === 'unit') return { unit: id };
  if (kind === 'building') return { building: id };
  if (kind === 'district') return { district: id as DistrictId, site: cityState.prodSite ?? -1 };
  if (kind === 'project') return { project: id };
  if (kind === 'repair') return { repair: id };
  return null;
}

/** THE MINOR'S ITEM IN HAND CHANGES (null: none, the queue emptied): the
 *  item left keeps its progress (`CityState.prodRetained`), the one taken
 *  resumes at what it kept; a district's plot rides with it
 *  (`CityState.prodSite`) */
export function minorSetItem(state: GameState, cityState: CityState, item: Exclude<MinorItem, { none: true }> | null): void {
  void state;
  const key = item ? minorItemKey(item) : '';
  if (item && 'district' in item) cityState.prodSite = item.site;
  else delete cityState.prodSite;
  if (key === (cityState.prodItem ?? '')) return;
  const kept = { ...cityState.prodRetained };
  if (cityState.prodItem && (cityState.prodProgress ?? 0) > 0) kept[cityState.prodItem] = cityState.prodProgress!;
  cityState.prodProgress = kept[key] ?? 0;
  delete kept[key];
  if (Object.keys(kept).length) cityState.prodRetained = kept;
  else delete cityState.prodRetained;
  if (key) cityState.prodItem = key;
  else delete cityState.prodItem;
}

/** May the minor's queue take the item now (0x5c9ea0 / 0x5ca170 / 0x5ca5a0 /
 *  0x5ca450)? A building it may raise, a district its plot takes, a unit it
 *  may train, a project it may run. */
export function minorQueueOk(state: GameState, cityState: CityState, item: Exclude<MinorItem, { none: true }>): boolean {
  const unlocks = computeUnlocksIn(cityState.research, []); // a MINOR carries no roster row
  if ('building' in item) {
    const worship = minorWorship(state, cityState);
    return (!BUILDINGS[item.building]?.worship || item.building === worship) && minorBuildingOk(state, cityState, item.building, unlocks);
  }
  if ('district' in item) {
    if (item.site < 0) return false;
    const owns = (t: Tile) => tileSeat(t) === cityState.seat;
    return canPlaceDistrictIn(state, minorCity(cityState), item.district, item.site, { unlocks, ownsTile: owns }).ok;
  }
  if ('unit' in item) return minorCanTrain(state, cityState, item.unit);
  if ('project' in item) {
    if (PROJECTS[item.project]?.repair) return repairAvailable(state, minorCity(cityState));
    return minorProjectOk(state, cityState, item.project);
  }
  return false;
}

/** CanTrain of a minor's city (its research unlocks the unit, no
 *  civilization's unique unit, none faith-bought, spawned or a spy, a naval
 *  unit at a coastal centre, an air unit beside a complete Aerodrome, a
 *  Trader below the trade capacity, the Archaeologist with an
 *  Archaeological Museum; a city-state ignores the strategic resources);
 *  `id` the engine's unit */
export function minorCanTrain(state: GameState, cityState: CityState, id: string): boolean {
  const r = cityState.research;
  const held = cityState.buildings ?? [];
  const d = UNITS[id];
  if (!d || d.uniqueTo || d.faithOnly || d.spawnOnly || d.spy) return false;
  if (d.requiresTech && !r.techs.includes(d.requiresTech)) return false;
  if (d.requiresCivic && !r.civics.includes(d.requiresCivic)) return false;
  if (d.requiresResource && !minorAnyResource()) return false;
  if (d.naval && !cityNavalCapable(state, minorCity(cityState))) return false;
  if (d.air && !(cityState.districts ?? []).some((x) => x.type === 'AERODROME' && state.map.tiles[x.tileIndex].districtComplete)) return false;
  if (d.trader && minorTraders(state, cityState) >= tradeCapacity(state, cityState.seat)) return false;
  if (id === 'ARCHAEOLOGIST' && !held.includes('MUSEUM_ARTIFACT')) return false;
  return true;
}

/** An install item type as the minor's item in hand: BUILDING_X, DISTRICT_X
 *  (at no site), UNIT_X, PROJECT_X */
export function minorItemOfType(type: string): Exclude<MinorItem, { none: true }> | null {
  if (type.startsWith('BUILDING_')) {
    const b = engineId('building', type, 'BUILDING_', BUILDINGS);
    return b ? { building: b } : null;
  }
  if (type.startsWith('DISTRICT_')) {
    const d = engineId('district', type, 'DISTRICT_', DISTRICTS) as DistrictId | null;
    return d ? { district: d, site: -1 } : null;
  }
  if (type.startsWith('UNIT_')) {
    const u = engineId('unit', type, 'UNIT_', UNITS);
    return u ? { unit: u } : null;
  }
  const p = engineId('project', type, 'PROJECT_', PROJECTS);
  return p ? { project: p } : null;
}

/** The install type of an engine row: its own type where the catalog tags
 *  that type with the row (a civilization's unique row maps onto the row it
 *  replaces, never the reverse), else the type its catalog tag names —
 *  DRAMA_AND_POETRY is CIVIC_DRAMA_POETRY, HOPLITE UNIT_GREEK_HOPLITE */
export function installType(kind: string, id: string, prefix: string): string {
  const own = prefix + id;
  return aliases()[kind]?.get(own) === id ? own : gameTypeOf(kind, id, prefix);
}

/** The install type of the minor's item in hand, null with none */
export function minorItemType(cityState: CityState): string | null {
  const k = cityState.prodItem;
  if (!k) return null;
  const [kind, id] = k.split(':');
  return kind === 'building' ? installType('building', id, 'BUILDING_')
    : kind === 'district' ? installType('district', id, 'DISTRICT_')
      : kind === 'unit' ? installType('unit', id, 'UNIT_')
        : kind === 'project' ? installType('project', id, 'PROJECT_') : null;
}

/** The turns the research AI's analysis gives a technology or the civics
 *  AI's a civic (0x7610e0 / 0x621920): 0 for none or one held; else its
 *  entry's turns (500 out of reach, and before the AI's first analysis:
 *  its -1), plus the turns left on the item in hand where its walk does not
 *  lead through it (runs/h1_duelv1124: a city-state's Walls at t3 lands at
 *  Masonry's 21 turns plus the 4 left on its Pottery as its turn before
 *  set them) */
export function analysedTurns(entries: readonly { id: string; next: string; turns: number; owned: boolean }[],
  id: string | null, held: readonly string[], current: string | null, currentLeft: number): number {
  if (!id || held.includes(id)) return 0;
  if (!entries.length) return 500;
  const e = entries.find((x) => x.id === id);
  if (!e || e.owned) return 0;
  const t = e.turns > 0 ? e.turns : 500;
  return t < 500 && current !== e.next && current !== id ? t + currentLeft : t;
}

/** A minor's version of a unit (player +0x12e8 +0x1c0): none for a
 *  civilization's unique unit, a MajorCivOnly one, a unit that founds a
 *  city, one a belief enables (EnabledByReligion; a minor holds none), one
 *  the database bars from training */
export function minorUnitVersion(u: string): string | null {
  const row = AI_UNITS[AI_UNIT_INDEX.get(u) ?? -1];
  return row && !row.trait && !row.majorOnly && !row.foundCity && !row.religion && row.canTrain ? u : null;
}

/** The promotion class weight (0x723bb0) of a player whose lists are
 *  `lists`: 1.0 plus a listed class's Value / 100 — none where that is 0
 *  (a minor's PROMOTION_CLASS_RECON -100), else at least 0.1 */
export function promotionWeight(traits: readonly string[], cls: string | null): number {
  if (!cls) return FX;
  let w = FX;
  for (const t of traits) {
    const v = AI_PROMOTION_CLASS_LISTS[t]?.[cls];
    if (v !== undefined) w += Math.trunc((v * FX) / 100);
  }
  return w === 0 ? 0 : Math.max(w, fxConst(0.1));
}

/** THE MILITARY AI'S UNIT PRODUCTION TABLE of a minor (`aiUnitProduction.ts`)
 *  against the units its knowledge base counts (`known`) */
export function minorUnitProduction(state: GameState, cityState: CityState, known: (unit: string) => number) {
  const r = cityState.research;
  const own = new Map<string, number>();
  for (const u of state.units) {
    if (u.seat !== cityState.seat) continue;
    const t = installType('unit', u.type, 'UNIT_');
    own.set(t, (own.get(t) ?? 0) + 1);
  }
  const holds = (x: string): boolean => {
    const t = x.startsWith('TECH_') ? engineId('tech', x, 'TECH_', TECHS) : null;
    const c = x.startsWith('CIVIC_') ? engineId('civic', x, 'CIVIC_', CIVICS) : null;
    return (!!t && r.techs.includes(t)) || (!!c && r.civics.includes(c));
  };
  return unitProductionTable({
    isVersion: (u) => minorUnitVersion(u) === u,
    obsolete: (u) => AI_UNITS[AI_UNIT_INDEX.get(u)!].obsolete.some(holds),
    owned: (u) => own.get(u) ?? 0,
    known,
  });
}

/** A city-state's knowledge base's army update (`knowledgeLook`) over the
 *  plots it sees (`cityStateSight`). */
export function minorKnowledge(state: GameState, cityState: CityState, age: boolean): void {
  knowledgeLook(state, cityState, cityState.seat, cityStateSight(state, cityState.seat), age);
  minorCampsLook(state, cityState);
}
/** THE COMBAT DESIRE of a minor (`combatDesire`) at its military AI's turn,
 *  `turn` the one its knowledge base's records were last aged to: the
 *  area of its city, its unit in training, the players in the game's order —
 *  the majors, the city-states, the Free Cities, the barbarians (a tribe,
 *  always at war) — at war where its seat is; its city's threat and its
 *  standing army's shortfall as its last city update left them. Unread: the
 *  player flags (+0xc58 / +0xd18), taken as none. */
export function minorCombatDesire(state: GameState, cityState: CityState, turn: number): CombatDesire {
  const centre = state.map.tiles[cityState.centerIndex];
  const areas = new Set<number>();
  if (centre && (centre.area ?? -1) >= 0) areas.add(centre.area!);
  const wars = seatOf(state, cityState.seat)?.wars ?? [];
  const players = [
    ...state.seats.filter((s) => isCiv(s.seat)).map((s) => ({ seat: s.seat, atWar: wars.includes(s.seat), tribe: false, flagged: false })),
    ...state.cityStates.map((c) => ({ seat: c.seat, atWar: wars.includes(c.seat), tribe: false, flagged: false })),
    { seat: FREE_SEAT, atWar: wars.includes(FREE_SEAT), tribe: false, flagged: false },
    { seat: BARB_SEAT, atWar: true, tribe: true, flagged: false },
  ];
  return combatDesire({
    best: Math.max(1, cityState.bestMeleeCS ?? 0, Math.max(cityState.bestRangedCS ?? 0, CITY_MIN_STRIKE_CS)),
    // the game's city-states found their city on turn 1, after its military
    // AI's turn: on turn 1 it holds none
    cities: cityState.centerIndex >= 0 && state.turn > 1 ? 1 : 0,
    areas,
    self: cityState.seat,
    players,
    records: cityState.armyKnown ?? [],
    areaOf: (plot) => state.map.tiles[plot]?.area ?? -1,
    strength: (type) => {
      const u = AI_UNITS[AI_UNIT_INDEX.get(installType('unit', type, 'UNIT_')) ?? -1];
      return u ? Math.max(u.combat, u.rangedCombat) : 0;
    },
    turn,
    queuedUnits: cityState.prodItem?.startsWith('unit:') ? [cityState.prodItem.slice(5)] : [],
    warFooting: false,
    // its city threatened at its last update (CityBuildAI +0x1b8 at or
    // above 0), and what its standing army lacked then (+0x2d8) at
    // PSEUDOYIELD_STANDING_ARMY_VALUE each
    threatened: (cityState.threat ?? -1) >= 0,
    standingArmy: fmul(pseudoYieldValue(majorView(state), cityState.seat, FX, 'PSEUDOYIELD_STANDING_ARMY_VALUE'),
      (cityState.standingArmyShort ?? 0) * FX),
  });
}


/** the copies of each resource a minor's city counts (CityBuildAI +0x978,
 *  0x5c9700): its plots within three of the centre it owns, unimproved, the
 *  resource one it sees (0x4ab4b0) — by install type */
export function minorResourceCounts(state: GameState, cityState: CityState): Map<string, number> {
  const out = new Map<string, number>();
  if (cityState.centerIndex < 0) return out;
  const hidden = hiddenResourcesFor(state, cityState.seat);
  const c = state.map.tiles[cityState.centerIndex];
  for (const t of tilesWithin(state.map, c.col, c.row, 3)) {
    if (tileSeat(t) !== cityState.seat || t.improvement || !t.resource || hidden.has(t.resource)) continue;
    const k = installType('resource', t.resource, 'RESOURCE_');
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** THE RESOURCE VALUE'S VIEW OF A MINOR (`resourceValue`): a city-state; its
 *  era (`civEraIndex`) and the next as chronology; a resource held and its
 *  copies where a plot it owns hands it over (`extractsResource`); its one
 *  city's amenity balance; its unit production table */
export function minorResourceFacts(state: GameState, cityState: CityState): ResourceFacts {
  const r = cityState.research;
  const era = civEraIndex(r.techs, r.civics);
  const stats = computeCityStats(state, minorCity(cityState));
  const view = majorView(state);
  const key: Record<string, YieldKey> = {
    YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold', YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
  };
  const amenity = {
    balance: stats.amenities.have - stats.amenities.needed,
    yields: Object.fromEntries(Object.entries(key).map(([y, k]) => [y, stats.total[k]])),
  };
  const extracted = new Map<string, number>();
  for (const t of state.map.tiles) {
    if (tileSeat(t) !== cityState.seat || !t.resource || !extractsResource(t)) continue;
    const k = installType('resource', t.resource, 'RESOURCE_');
    extracted.set(k, (extracted.get(k) ?? 0) + 1);
  }
  const table = minorUnitProduction(state, cityState, minorKnownUnits(cityState));
  const luxury = pseudoYieldValue(view, cityState.seat, FX, 'PSEUDOYIELD_RESOURCE_LUXURY');
  return {
    amenityParty: true,
    eraChronology: era + 1,
    nextEraChronology: Math.min(era + 1, ERAS.length - 1) + 1,
    chronologyOf: (e) => {
      const i = ERAS.indexOf(e.replace(/^ERA_/, '') as Era);
      return i < 0 ? null : i + 1;
    },
    held: (res) => (extracted.get(res) ?? 0) > 0,
    have: (res) => extracted.get(res) ?? 0,
    cities: 1,
    amenityValue: (_i, t, h) => valueBetween(amenityPerTurn({ view, seat: cityState.seat }, amenity), t, h),
    luxuryPseudo: (t, h) => valueBetween(luxury, t, h),
    inUnitTable: (u) => table.has(u),
    unitResourceCost: (u) => {
      const row = AI_UNITS[AI_UNIT_INDEX.get(u) ?? -1];
      return row ? { cost: row.resourceCost, maintenance: row.maintenanceResourceAmount } : null;
    },
  };
}

/** THE RESEARCH AND CIVICS VALUES' TERMS A MINOR'S CITY GIVES (0x7b3e50,
 *  0x7a9a10): a technology's resources (`minorResearchResources`) and either
 *  row's units (`minorUnitTerm`) — on `units`, the city's unit table, where
 *  given (a recording's logged table), else its own. The minors' turn
 *  (`minorResearch`) takes the resources alone; `cpu/harness/
 *  researchValueLab.ts` the whole. */
export function minorResearchTerms(state: GameState, cityState: CityState, units?: readonly (number | null)[]): {
  tech: (tech: string, turns: number) => number;
  civic: (civic: string, turns: number) => number;
} {
  const resources = minorResearchResources(state, cityState);
  const term = minorUnitTerm(state, cityState, units);
  return {
    tech: (tech, turns) => resources(tech, turns) + term(UNITS_OF_TECH.get(`TECH_${tech}`) ?? [], false),
    civic: (civic) => term(UNITS_OF_CIVIC.get(`CIVIC_${civic}`) ?? [], true),
  };
}

const UNITS_OF_TECH = new Map<string, AiUnitRow[]>();
const UNITS_OF_CIVIC = new Map<string, AiUnitRow[]>();
for (const u of AI_UNITS) {
  if (u.tech) UNITS_OF_TECH.set(u.tech, [...UNITS_OF_TECH.get(u.tech) ?? [], u]);
  if (u.civic) UNITS_OF_CIVIC.set(u.civic, [...UNITS_OF_CIVIC.get(u.civic) ?? [], u]);
}

/** A unit's at least this much per upgrade source unit (0x7b45..: 20.0) */
const UPGRADE_SOURCE_FLOOR = fxConst(20);
/** A city's unit value counts at most this much in a technology's value (50.0) */
const UNIT_CITY_VALUE_CAP = fxConst(50);

/**
 * The value's UNIT TERM of a minor, paid whole (not from landing): per unit
 * the row unlocks that is the minor's version, over its cities that train
 * the unit's domain, the average of the City Analysis unit values above 0
 * (0x5d4cd0) — a technology's (0x7b3e50) each at most 50.0 and the average
 * taken 10 times, a civic's (0x7a9a10) as they stand and once; and per
 * upgrade source of the unit (UnitUpgrades), each of the minor's units of it
 * (0x4f2c90) adds that average less the upgrade's Gold valued as a yield
 * (0x5376d0 -> 0x7a6690), at least 20.0.
 */
function minorUnitTerm(state: GameState, cityState: CityState, given?: readonly (number | null)[]): (units: readonly AiUnitRow[], civic: boolean) => number {
  let facts: CityBuildFacts | undefined;
  let table = given;
  return (units, civic) => {
    let v = 0;
    for (const u of units) {
      if (minorUnitVersion(u.type) !== u.type) continue;
      facts ??= minorBuildFacts(state, cityState, minorKnownUnits(cityState));
      let avg = 0;
      if (facts.trainsDomain(u.domain)) {
        table ??= unitTable(facts);
        avg = Math.max(0, civic ? table[AI_UNIT_INDEX.get(u.type)!] ?? 0 : Math.min(table[AI_UNIT_INDEX.get(u.type)!] ?? 0, UNIT_CITY_VALUE_CAP));
      }
      v += civic ? avg : avg * 10;
      const id = engineId('unit', u.type, 'UNIT_', UNITS);
      for (const src of Object.values(UNITS)) {
        if (!id || src.upgradesTo !== id) continue;
        const n = state.units.filter((x) => x.seat === cityState.seat && x.type === src.id).length;
        if (n === 0) continue;
        const gold = yieldValue(facts.view, cityState.seat, upgradeGoldCost(state, cityState.seat, src.id) * FX, 'YIELD_GOLD');
        v += n * Math.max(avg - gold, UPGRADE_SOURCE_FLOOR);
      }
    }
    return v;
  };
}

/** the research value's resources term of a minor (0x7b3e50's improvement
 *  walk): per resource a row's improvements work that its city counts, the
 *  value of one copy more landing in the row's turns */
export function minorResearchResources(state: GameState, cityState: CityState): (tech: string, turns: number) => number {
  const counts = minorResourceCounts(state, cityState);
  if (![...counts.values()].some((n) => n > 0)) return () => 0;
  let facts: ResourceFacts | undefined;
  return (tech, turns) => {
    let v = 0;
    for (const res of TECH_IMPROVEMENT_RESOURCES.get(tech) ?? []) {
      if ((counts.get(res.type) ?? 0) <= 0) continue;
      v += resourceValue(facts ??= minorResourceFacts(state, cityState), res, 1, turns, AI_VALUE_HORIZON);
    }
    return v;
  };
}

/** A minor's knowledge base's unit counts (0x5eb650 over every player): its
 *  army records by type */
export function minorKnownUnits(cityState: CityState): (unit: string) => number {
  const n = new Map<string, number>();
  for (const r of cityState.armyKnown ?? []) {
    const t = installType('unit', r.type, 'UNIT_');
    n.set(t, (n.get(t) ?? 0) + 1);
  }
  return (unit) => n.get(unit) ?? 0;
}

/** THE CITY BUILD AI'S VIEW OF A MINOR'S CITY (`aiCityBuild.ts`), its
 *  knowledge base's unit counts `known` */
export function minorBuildFacts(state: GameState, cityState: CityState, known: (unit: string) => number): CityBuildFacts {
  const city = minorCity(cityState);
  const stats = computeCityStats(state, city);
  const r = cityState.research;
  const view = majorView(state);
  const current = minorItemType(cityState);
  const key: Record<string, YieldKey> = {
    YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold', YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
  };
  // the research AI's turns left on its research as its last choice set
  // them; the civics AI's read live (-1 with nothing in hand, 0x39c1f0)
  const techLeft = r.aiLeftSeen ?? 0;
  const civicLeft = r.civic
    ? turnsAt(researchCost(state, r.civic, true, cityState.seat) * FX - fxOf(r.civicProgress), fxOf(stats.total.culture)) : -1;
  const has = new Set(city.buildings);
  const centre = state.map.tiles[cityState.centerIndex];
  const worship = minorWorship(state, cityState);
  const amenity = {
    balance: stats.amenities.have - stats.amenities.needed,
    yields: Object.fromEntries(Object.entries(key).map(([y, k]) => [y, stats.total[k]])),
  };
  const techEntries = (r.aiEntries ?? []).map((e) => ({ id: e.tech, next: e.next, turns: e.turns, owned: e.owned }));
  const civicEntries = (r.civicAiEntries ?? []).map((e) => ({ id: e.civic, next: e.next, turns: e.turns, owned: e.owned }));
  return {
    view,
    seat: cityState.seat,
    cityId: city.id,
    population: cityState.population,
    capital: true,
    districtCount: 1 + (cityState.districts?.length ?? 0),
    // a city-state builds no wonder
    hasWonder: false,
    atWar: (seatOf(state, cityState.seat)?.wars.length ?? 0) > 0,
    era: civEraIndex(r.techs, r.civics),
    // the city's modifier percent on the yield (city +0xbc0): the happiness
    // level's NonFoodYieldModifier is not among them (runs/h1_duelv1127:
    // every city-state Monument it logs reads its +1 Culture whole, whatever
    // the city's happiness level)
    yieldPct: (y) => Math.round(((stats.yieldPct[key[y]] ?? 0) - (y === 'YIELD_FOOD' ? 0 : stats.amenities.tier.yieldFactor - 1)) * 100),
    version: (b) => (AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!]?.trait ? null : b),
    hasBuilding: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return !!id && has.has(id);
    },
    hasDistrict: (d) => {
      const id = engineId('district', d, 'DISTRICT_', DISTRICTS);
      return id === 'CITY_CENTER' || (!!id && (cityState.districts ?? []).some((x) => x.type === id && state.map.tiles[x.tileIndex].districtComplete));
    },
    governmentTier: 0,
    worship: worship ? installType('building', worship, 'BUILDING_') : null,
    riverside: hasRiver(centre),
    groundRefuses: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      if (!id) return true;
      return !!BUILDINGS[id].floodBarrier && cityLowlands(state, city).length === 0;
    },
    amenity,
    // a city-state holds one city
    regionalAmenities: () => [amenity],
    unitVersion: minorUnitVersion,
    fullCiv: false,
    tribe: false,
    unitCount: state.units.filter((u) => u.seat === cityState.seat).length,
    unitProduction: minorUnitProduction(state, cityState, known),
    trainsDomain: (d) => d !== 'DOMAIN_SEA' || cityNavalCapable(state, city),
    combatCount: 0,
    extraCopies: () => 0,
    promotionWeight: (cls) => promotionWeight(['MINOR_CIV_DEFAULT_TRAIT'], cls),
    resourceAccess: (res) => {
      const id = engineId('resource', res, 'RESOURCE_', RESOURCES);
      return !!id && tilesWithin(state.map, centre.col, centre.row, 3).some((t) => t.resource === id);
    },
    handicap: 0,
    growth: {
      surplus: fxOf(stats.foodSurplus),
      housing: stats.housing,
      population: cityState.population,
      stored: fxOf(city.foodBox),
      multiplier: stats.foodSurplus > 0 ? Math.round((stats.effectiveFoodSurplus / stats.foodSurplus) * FX) : FX,
    },
    current,
    techTurns: (t) => analysedTurns(techEntries, t && engineId('tech', t, 'TECH_', TECHS), r.techs, r.tech, techLeft),
    civicTurns: (c) => analysedTurns(civicEntries, c && engineId('civic', c, 'CIVIC_', CIVICS), r.civics, r.civic, civicLeft),
    buildTurns: (type) => {
      const item = minorItemOfType(type);
      if (!item) return 500;
      const k = minorItemKey(item);
      // the progress kept on the item, and the store an idle step or a
      // completion left, which the next item takes (runs/h1_duelv1124: idle
      // Cardiff's Library valued a turn sooner each turn from t60 to t75)
      const progress = (cityState.prodItem === k ? cityState.prodProgress ?? 0 : cityState.prodRetained?.[k] ?? 0) + (cityState.prodOverflow ?? 0);
      const cost = minorItemCost(state, cityState, item as Exclude<MinorItem, { none: true }>);
      const rate = fxOf(stats.total.production * (1 + minorItemPct(state, cityState, item) / 100));
      return turnsAt(cost * FX - fxOf(progress), rate);
    },
  };
}

/** What the PROJECTS table (`aiProjectValue.ts`) reads of a minor's city
 *  beside its city build facts: its completions (player +0x1330), one city
 *  producing, the game's progress; the space-race standing, the outer
 *  defences' repair count, the loyalty and the effects' unlocks not read
 *  (none), no favoured items */
export function minorProjectFacts(cityState: CityState, facts: CityBuildFacts): ProjectTableFacts {
  const r = cityState.research;
  return {
    view: facts.view,
    seat: cityState.seat,
    cityId: facts.cityId,
    capital: true,
    advanced: (p) => facts.view.projectCompletions(cityState.seat, p),
    buildTurns: (p) => facts.buildTurns(p),
    progressPct: gameProgressPct(r.techs.length, r.civics.length),
    spaceRaceStanding: 0,
    defenceRepairs: 0,
    population: facts.population,
    districts: facts.districtCount,
    loyaltyFalling: false,
    buildingValue: (b, t) => {
      const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(b) ?? -1];
      return row ? buildingValue(facts, row, t) : 0;
    },
    hasBuilding: (b) => facts.hasBuilding(b),
    hasCivic: (c) => r.civics.includes(engineId('civic', c, 'CIVIC_', CIVICS) ?? ''),
    hasTech: (t) => r.techs.includes(engineId('tech', t, 'TECH_', TECHS) ?? ''),
    hasDistrict: (d) => facts.hasDistrict(d),
    unlockedByEffect: () => false,
    producingElsewhere: () => 0,
    favoured: () => false,
    horizon: AI_VALUE_HORIZON,
  };
}

/** THE CITY CENTRE'S VALUE TABLES of a minor (0x5ce970's buildings, units
 *  and projects), its knowledge base's unit counts `known` */
export function minorTables(state: GameState, cityState: CityState, known: (unit: string) => number): CityBuildTables {
  const facts = minorBuildFacts(state, cityState, known);
  return {
    buildings: buildingTable(facts),
    units: unitTable(facts).map((v) => v ?? FX_MIN),
    projects: projectTable(minorProjectFacts(cityState, facts)),
  };
}

/** What the Default Specialization pick (`defaultSpecialization`) reads of
 *  a minor's city: the building held or in hand, CanConstruct (`constructibleNow`
 *  on the city build facts), CanTrain (its research unlocks the unit, no
 *  civilization's unique unit, none faith-bought or spawned, a naval unit at
 *  a coastal centre, an air unit beside a complete Aerodrome, a Trader below
 *  the trade capacity, the Archaeologist with an Archaeological Museum; a
 *  city-state ignores the strategic resources), the district projects; no
 *  favoured items; the plain pick (the defensive one's inputs, the military
 *  AI's +0x4b8 and the city's threat, are not read). */
export function minorPickFacts(state: GameState, cityState: CityState, facts: CityBuildFacts): PickFacts {
  return {
    buildingHeld: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return minorItemType(cityState) === b || (!!id && (cityState.buildings ?? []).includes(id));
    },
    canConstruct: (b) => constructibleNow(facts, AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!]),
    reasonsClear: (b) => {
      const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!];
      if (row.district && !facts.hasDistrict(row.district)) return false;
      return !row.prereqs.length || row.prereqs.some((p) => facts.hasBuilding(p));
    },
    canTrain: (u) => {
      const id = engineId('unit', u, 'UNIT_', UNITS);
      return !!id && minorCanTrain(state, cityState, id);
    },
    canProduce: (p) => {
      const id = engineId('project', p, 'PROJECT_', PROJECTS);
      if (id === 'REPAIR_DEFENSES') return repairAvailable(state, minorCity(cityState));
      return !!id && minorProjectOk(state, cityState, id);
    },
    favored: () => 0,
    defense: false,
  };
}

/** The percent a minor's step pays toward the item on top of its Production:
 *  a Builder +200%, a military unit +200% while the minor holds fewer than
 *  ten, walls +200%, the Harbor and the type's own district +500% (the
 *  install's MINOR_CIV_PRODUCTION_* and MINOR_CIV_<TYPE>_TRAIT rows). */
export function minorItemPct(state: GameState, cityState: CityState, item: MinorItem): number {
  if ('unit' in item) {
    if (item.unit === 'BUILDER') return MINOR_BUILDER_PROD_PCT;
    if (!unitIsMilitary(item.unit)) return 0;
    const military = state.units.filter((u) => u.seat === cityState.seat && unitIsMilitary(u.type)).length;
    return military < MINOR_SMALL_MILITARY ? MINOR_MILITARY_PROD_PCT : 0;
  }
  if ('building' in item) return BUILDINGS[item.building].walls ? MINOR_WALLS_PROD_PCT : 0;
  if ('district' in item) {
    return item.district === 'HARBOR' ? MINOR_HARBOR_PROD_PCT
      : item.district === CITY_STATE_TYPE_DISTRICT[cityState.type] ? MINOR_TYPE_DISTRICT_PROD_PCT[cityState.type] : 0;
  }
  return 0;
}

/** A minor's item's price: a unit's Production cost (a Builder's and a
 *  Trader's climbing), a building's (`minorBuildingCost`), a district's own
 *  base, a project's, a repair's rest past `MINOR_REPAIR_RESUME_PCT`. */
export function minorItemCost(state: GameState, cityState: CityState, item: Exclude<MinorItem, { none: true }>): number {
  return 'unit' in item
    ? (item.unit === 'BUILDER' ? builderCost(state, cityState.seat)
      : item.unit === 'TRADER' ? traderCost(state, cityState.seat) : UNITS[item.unit].cost)
    : 'building' in item ? minorBuildingCost(state, cityState, item.building)
      // the row's OWN base, not the specialty one: a minor builds real
      // districts too and the install prices an Aqueduct at 36
      : 'district' in item ? districtScaledBase(cityState.research, item.district)
        : 'project' in item ? projectCost(state, cityState.seat, item.project, minorCity(cityState))
          : minorBuildingCost(state, cityState, item.repair)
            - Math.floor((minorBuildingCost(state, cityState, item.repair) * MINOR_REPAIR_RESUME_PCT) / 100);
}

/** THE MINOR'S ITEM COMPLETES: the unit stands on or beside the centre with
 *  the city's training grants (none with no free tile: the item waits), the
 *  building rises, the district is laid, the project or the repair lands;
 *  the item in hand is done. Returns whether it completed. */
function minorFinish(state: GameState, cityState: CityState, item: Exclude<MinorItem, { none: true }>): boolean {
  const city = minorCity(cityState);
  let built = -1;
  if ('unit' in item) {
    const unit = spawnUnit(state, item.unit, cityState.centerIndex, cityState.seat);
    if (!unit) return false;
    built = unit.id;
    applyTrainingGrants(state, minorCity(cityState), unit);
    if (item.unit === 'BUILDER') cityState.buildersTrained += 1;
  } else if ('building' in item) {
    const b = BUILDINGS[item.building];
    cityState.buildings = [...(cityState.buildings ?? []), item.building];
    if (b.floodBarrier) repairBehindBarrier(state, minorCity(cityState));
    if (b.walls) {
      cityState.outerHp = wallsMax(state, { buildings: cityState.buildings, seat: cityState.seat });
      // the Encampment's own pool refits at the walls tier (`fitEncampOuter`)
      for (const d of cityState.districts ?? []) {
        const t = state.map.tiles[d.tileIndex];
        if (t.district === 'ENCAMPMENT' && t.districtComplete) t.encampOuterHp = cityState.outerHp;
      }
    }
  } else if ('district' in item) {
    // the plot no longer takes it: the item leaves the queue
    if (!minorQueueOk(state, cityState, item)) {
      minorSetItem(state, cityState, null);
      return false;
    }
    const t = state.map.tiles[item.site];
    t.district = item.district;
    t.districtComplete = true;
    paveGround(t);
    (cityState.districts ??= []).push({ type: item.district, tileIndex: item.site });
    if (item.district === 'ENCAMPMENT') {
      t.encampHp = ENCAMPMENT_HP;
      t.encampOuterHp = wallsMax(state, { buildings: cityState.buildings ?? [], seat: cityState.seat });
    }
  } else if ('project' in item) {
    if (PROJECTS[item.project].repair) {
      cityState.outerHp = wallsMax(state, city);
      fitEncampOuter(state, city);
    }
  } else {
    repairBuilding(cityState, item.repair);
  }
  if (!('repair' in item)) cityState.repairWait = false;
  cityState.prodProgress = 0;
  delete cityState.prodItem;
  delete cityState.prodSite;
  if ('unit' in item) minorItemBuilt(cityState, { unit: installType('unit', item.unit, 'UNIT_'), building: null, district: null }, built);
  else if ('building' in item) minorItemBuilt(cityState, { unit: null, building: installType('building', item.building, 'BUILDING_'), district: null }, -1);
  else if ('district' in item) minorItemBuilt(cityState, { unit: null, building: null, district: installType('district', item.district, 'DISTRICT_') }, -1);
  return true;
}

/**
 * A LUMP OF FOOD OR PRODUCTION lands in the minor's city (`applyLumpYield`:
 * its Builder's harvest or feature removal) and acts at once: Food fills the
 * box and a full box grows the city, Production goes to the item in hand —
 * completing it at its price, the rest stored as a step's overflow — or to
 * the store with nothing in hand (runs/h1_duelw1124 t21: Granada's Builder
 * clears a Rainforest in its actions, 6 Food and 6 Production; the Warrior
 * at 18 of 20 completes and the box at 11 of 16 grows to 4 with 1 left,
 * before its next start). A district's site is the step's, so its progress
 * waits for the step.
 */
export function minorLump(state: GameState, cityState: CityState, key: 'food' | 'production', amount: number): void {
  if (key === 'food') {
    const city = minorCity(cityState);
    lumpFood(city, amount, state.turn);
    cityState.population = city.population;
    cityState.unconvertedPressure = city.unconvertedPressure;
    cityState.foodBox = city.foodBox;
    return;
  }
  const key0 = cityState.prodItem ?? '';
  const [kind, id] = [key0.slice(0, key0.indexOf(':')), key0.slice(key0.indexOf(':') + 1)];
  const item: Exclude<MinorItem, { none: true }> | undefined = kind === 'unit' ? { unit: id } : kind === 'building' ? { building: id }
    : kind === 'project' ? { project: id } : kind === 'repair' ? { repair: id } : undefined;
  if (!key0) {
    cityState.prodOverflow = (cityState.prodOverflow ?? 0) + amount;
    return;
  }
  const before = cityState.prodProgress ?? 0;
  cityState.prodProgress = before + amount;
  if (!item) return;
  const cost = minorItemCost(state, cityState, item);
  if (cityState.prodProgress < cost) return;
  if (minorFinish(state, cityState, item)) cityState.prodOverflow = (cityState.prodOverflow ?? 0) + Math.max(0, before + amount - cost);
}

/** May the Free City raise building `id` now? The Free Cities' research
 *  unlocks it; the city does not hold it; its district stands complete and
 *  clean (the centre for a City Center row); the row it requires is held and
 *  the one it excludes is not; a Water Mill wants a river at the centre; and
 *  CIV6: "While city defenses are damaged, you cannot build higher levels of
 *  Walls." `minorBuildingOk`'s rule over a real city. */
function freeCityBuildingOk(state: GameState, city: City, id: string, unlocks: Unlocks): boolean {
  const def = BUILDINGS[id];
  if (!def || city.buildings.includes(id) || !unlocks.buildings.has(id)) return false;
  const centre = state.map.tiles[city.centerIndex];
  const home = def.district === 'CITY_CENTER' ? centre
    : city.districts.map((d) => state.map.tiles[d.tileIndex])
      .find((t) => t.district === def.district && t.districtComplete);
  if (!home || irradiated(home)) return false;
  if (def.requiresAny?.length && !def.requiresAny.some((r) => city.buildings.includes(r))) return false;
  if (def.exclusiveWith?.some((x) => city.buildings.includes(x))) return false;
  if (def.special === 'WATER_MILL' && !hasRiver(centre)) return false;
  if (def.walls && outerPool(state, city) < wallsMax(state, city)) return false;
  return true;
}

/**
 * A FREE CITY'S PRODUCTION AND ITS AI'S PICK (the Free Cities' list holds the
 * Default Specialization alone: AI_CITY_EVENTS' FreeCitiesCityBuilds names
 * "Simple City Tree", which the install defines no nodes for). The step pays
 * the turn's Production and the bank (`City.productionBank`) into the item in
 * hand (`City.queue[0]`); it completes when its progress covers its price —
 * a unit on or beside the centre (with no free tile it waits), a building
 * raised, the walls' repair at the HP it puts back (`projectCost`) — leaving
 * the bank the Production less what it lacked; with nothing in hand the
 * Production banks. Then, on an empty queue, the Default Specialization over
 * the city's tables (`freeCityBuildFacts`, `freeCityPickFacts`) queues its
 * pick.
 */
export function freeCityBuild(state: GameState, city: City, production: number): void {
  const q = city.queue[0];
  if (!q) city.productionBank = (city.productionBank ?? 0) + production;
  else {
    const before = q.progress;
    q.progress = before + production + (city.productionBank ?? 0);
    city.productionBank = 0;
    const cost = freeItemCost(state, city, q);
    if (q.progress >= cost && freeFinish(state, city, q)) {
      city.queue.shift();
      city.productionBank = Math.max(0, production - Math.max(0, cost - before));
    }
  }
  if (city.queue.length) return;
  const facts = freeCityBuildFacts(state, city);
  const tables: CityBuildTables = {
    buildings: buildingTable(facts),
    units: unitTable(facts).map((v) => v ?? FX_MIN),
    projects: projectTable(freeCityProjectFacts(state, city, facts)),
  };
  const pick = defaultSpecialization(tables, freeCityPickFacts(state, city, facts));
  const item = pick ? majorQueueItem(state, FREE_SEAT, city, pick.type) : null;
  if (item) city.queue = [item];
}

/** a Free City's price of its item in hand */
function freeItemCost(state: GameState, city: City, q: QueueItem): number {
  if (q.kind === 'building') return BUILDINGS[q.building].cost;
  if (q.kind === 'unit') return q.cost ?? UNITS[q.unit].cost;
  if (q.kind === 'project') return projectCost(state, FREE_SEAT, q.project, city);
  return Infinity;
}

/** a Free City's item completes: false where its unit finds no free tile */
function freeFinish(state: GameState, city: City, q: QueueItem): boolean {
  if (q.kind === 'unit') return !!spawnUnit(state, q.unit, city.centerIndex, FREE_SEAT);
  if (q.kind === 'building') {
    city.buildings.push(q.building);
    if (BUILDINGS[q.building].walls) {
      city.outerHp = wallsMax(state, city);
      fitEncampOuter(state, city);
    }
    return true;
  }
  if (q.kind === 'project' && PROJECTS[q.project]?.repair) {
    city.outerHp = wallsMax(state, city);
    fitEncampOuter(state, city);
  }
  return true;
}

/** What the PROJECTS table reads of a Free City (its research, its one
 *  city's production; no completions, no favoured items) */
function freeCityProjectFacts(state: GameState, city: City, facts: CityBuildFacts): ProjectTableFacts {
  const r = freeSeatOf(state).research;
  return {
    view: facts.view, seat: FREE_SEAT, cityId: city.id, capital: false,
    advanced: () => 0,
    buildTurns: (p) => facts.buildTurns(p),
    progressPct: gameProgressPct(r.techs.length, r.civics.length),
    spaceRaceStanding: 0, defenceRepairs: 0, population: city.population, districts: facts.districtCount, loyaltyFalling: false,
    buildingValue: (b, t) => {
      const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(b) ?? -1];
      return row ? buildingValue(facts, row, t) : 0;
    },
    hasBuilding: (b) => facts.hasBuilding(b),
    hasCivic: (c) => r.civics.includes(engineId('civic', c, 'CIVIC_', CIVICS) ?? ''),
    hasTech: (t) => r.techs.includes(engineId('tech', t, 'TECH_', TECHS) ?? ''),
    hasDistrict: (d) => facts.hasDistrict(d),
    unlockedByEffect: () => false, producingElsewhere: () => 0, favoured: () => false,
    horizon: AI_VALUE_HORIZON,
  };
}

/** What the Default Specialization reads of a Free City: the building held
 *  or in hand, CanConstruct (`constructibleNow` and the city's own rule:
 *  the Free Cities' research, its district complete and clean, its required
 *  and exclusive rows, a river for a Water Mill, intact walls below a higher
 *  wall), CanTrain (the Free Cities' research unlocks it, no civilization's
 *  unique, none faith-bought, spawned or a spy, none asking a strategic
 *  resource — the Free Cities ignore no requirement and hold no stockpile —
 *  a naval unit at a coastal centre), the walls' repair while available;
 *  no favoured items, the plain pick */
export function freeCityPickFacts(state: GameState, city: City, facts: CityBuildFacts): PickFacts {
  const r = freeSeatOf(state).research;
  const unlocks = computeUnlocksIn(r, []);
  const inHand = city.queue[0]?.kind === 'building' ? installType('building', city.queue[0].building, 'BUILDING_') : null;
  return {
    buildingHeld: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return inHand === b || (!!id && city.buildings.includes(id));
    },
    canConstruct: (b) => {
      const id = engineId('building', b, 'BUILDING_', BUILDINGS);
      return !!id && freeCityBuildingOk(state, city, id, unlocks) && constructibleNow(facts, AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!]);
    },
    reasonsClear: (b) => {
      const row = AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!];
      if (row.district && !facts.hasDistrict(row.district)) return false;
      return !row.prereqs.length || row.prereqs.some((p) => facts.hasBuilding(p));
    },
    canTrain: (u) => {
      const id = engineId('unit', u, 'UNIT_', UNITS);
      const d = id ? UNITS[id] : undefined;
      if (!d || d.uniqueTo || d.faithOnly || d.spawnOnly || d.spy || d.trader || d.settler) return false;
      if (d.requiresTech && !r.techs.includes(d.requiresTech)) return false;
      if (d.requiresCivic && !r.civics.includes(d.requiresCivic)) return false;
      if (d.requiresResource && !CIV_LEVELS.FREE_CITIES.ignoresUnitStrategicResourceRequirements) return false;
      if (d.naval && !cityNavalCapable(state, city)) return false;
      if (d.air) return false;
      return true;
    },
    canProduce: (p) => {
      const id = engineId('project', p, 'PROJECT_', PROJECTS);
      return id === 'REPAIR_DEFENSES' && repairAvailable(state, city);
    },
    favored: () => 0,
    defense: false,
  };
}
