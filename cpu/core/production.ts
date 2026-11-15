import type { City, GameState, Seat, Unit } from './types';
import { boostPool, drawBoosts, markBoost } from './boosts';
import { logPopWrite } from './difflog';
import { buildingPillaged, darkBuildings, repairBuilding, stampBuildingEra } from './yields';
import { scoreProject } from './competition';
import type { QueueItem } from './types';
import { citiesOf, seatOf, setTileOwner, tileCity, tileSeat, unitSeat, allianceFreePromo, moveCapital, civOf, isCiv, onHomeContinent, leaderOf, alliedAtLevel, atWarWithAny } from './seats';
import { cityFlags, replaceAllCitizens } from './citizens';
import { NO_SEAT } from '../../world/types';
import type { Tile } from '../../world/types';
import { congressCultureBombSeat } from './congress';
import { hexDistance, neighbors } from '../../world/hex';
import { availableCivicsIn, availableTechsIn, getModifiers, governmentSlots, prodBoostPct, prodMultFactors, slotCountRebuild } from './effects';
import { completedWonders, seatWonderFlag, seatWonders } from './wonders';
import { grantEraBoosts, isEncampHarborItem, itemCost, offerApostlePromotions, refreshDistrictDiscount, unitProdCost } from './game';
import { UNITS, UNIT_TYPE_IDX, ENCAMPMENT_HP, URBAN_DEFENSES_TECH, isLightCavalry } from '../data/units';
import { crossesRiver, isGreatEngineer, navalMelee, unitIsMilitary } from './units';
import { BUILDINGS } from '../data/buildings';
import { gainPopulationPressure } from '../data/religion';
import { governorFlag, governorMult, governorSum } from './governors';
import { DISTRICTS } from '../data/districts';
import { CARBON_RECAPTURE_FAVOR, CARBON_RECAPTURE_UNITS } from '../data/climate';
import { emitCarbon, repairBehindBarrier } from './climate';
import { PROJECTS, PROJECT_LIST, gpClassesOf, gppFractionOf, isSpaceProject } from '../data/projects';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { ALLIANCE_M2_MIL_PROD_PCT, ALLIANCE_MILITARY, CONGRESS_PROD_MULT, CULTURE_BOMB_RANGE, DED_FREE_INQUIRY, DED_MONUMENTALITY, DED_STEAM, DED_TO_ARMS, STEAM_WONDER_PROD_MULT, TO_ARMS_MIL_PROD_MULT, LOYALTY_MAX } from '../data/seats';
import { ERAS, INDUSTRIAL_ERA_INDEX, TECHS, TECH_TABLE_RANK } from '../data/techs';
import { CIVIC_TABLE_RANK } from '../data/civics';
import { buildingDedications, canalMoment, dedicationEvent, goldenDedication, wonderMoment } from './eras';
import { districtMoment } from './moments';
import { spawnUnit, bestTrainableNaval, unitsHostile } from './units';
import { grantFreeProphet } from './greatPeople';
import { gpPermOf } from '../data/greatPeople';
import { airTrainTile } from './air';
import { wallsMax, urbanDefensesFit, fitEncampOuter } from './rules';
import { applyTrainingGrants } from './combat';
import { promoClassOf, unitPromoRows, xpToNextLevel } from './promotions';
import { applyLumpYield } from './economy';
import { minorCatchUp } from './minorBuild';
import { congressEnergyProdMult, congressGppFactor, congressProjectMult, congressUdtProdDistrict } from './congress';
import { buildingCreatedCulture, suzerainProjectMult, suzerainWonderPct } from './cityStates';
import { BUILT_WONDERS, WONDER_ERA_INDEX } from '../data/builtWonders';
import { randRange } from './rand';
import { cityBuildingSum, claimTile, drawBorderPlot, seatBuildingSum } from './city';
import { warBuffProdPct } from './casusBelli';
import { hasRiver } from '../../world/query';
import { HARDRADA_NAVAL_MELEE_PROD_MULT, ITERU_RIVER_PROD_MULT } from '../data/civilizations';
import { PILLAGE_BUILDING_REPAIR_PERCENT, WONDER_FREE_TILES } from '../data/constants';
import { questDistrictBuilt } from './quests';

/** CIV6 (Oxford University, Bolshoi Theatre): the free technologies and civics
 *  are DRAWN AT RANDOM — the DLL's 0x4caeb0 / 0x39cd90 ("Choosing random tech
 *  / civic to grant based on era"): ONE pool of the rows researchable before
 *  the first grant in the install table's order (`TECH_TABLE_RANK`, the
 *  random boosts' walk), each draw removing its pick (a row the grants open
 *  is not in it), so a seat with nothing available advances the stream not
 *  at all. */
export function grantFreeResearch(state: GameState, owner: Seat, kind: 'tech' | 'civic', n: number): void {
  const rsr = owner.research;
  const rank = kind === 'tech' ? TECH_TABLE_RANK : CIVIC_TABLE_RANK;
  const open = (kind === 'tech' ? [...availableTechsIn(state, rsr)] : [...availableCivicsIn(state, rsr)]).sort((a, b) => rank[a.id] - rank[b.id]);
  for (let i = 0; i < n; i++) {
    if (open.length === 0) return; // the tree is exhausted
    const next = open.splice(randRange(state, open.length, kind === 'tech' ? 'Choosing random tech to grant based on era' : 'Choosing random civic to grant based on era'), 1)[0];
    if (kind === 'tech') {
      if (next.id === URBAN_DEFENSES_TECH) urbanDefensesFit(state, owner.seat);
      if (!rsr.techs.includes(next.id)) rsr.techs.push(next.id);
      minorCatchUp(state, owner.seat, next.id, false);
      delete rsr.techRetained[next.id];
      if (rsr.tech === next.id) rsr.tech = null;
    } else {
      if (!rsr.civics.includes(next.id)) rsr.civics.push(next.id);
      minorCatchUp(state, owner.seat, next.id, true);
      delete rsr.civicRetained[next.id];
      owner.government.civicTurn = state.turn;
      if (rsr.civic === next.id) rsr.civic = null;
    }
  }
}

/** CIV6 (Embrasure): "Military units trained in this city start with a free
 *  promotion that do not already start with a free promotion." No unit in this
 *  model starts with one, so every promotion class qualifies; the grant is the
 *  XP its first level costs, which `takePromotion` then zeroes. */
function grantFreePromotion(unit: Unit, free: boolean): void {
  if (!free || unitPromoRows(unit).length === 0) return;
  unit.xp = Math.max(unit.xp ?? 0, xpToNextLevel(unit));
}

export function completeProject(state: GameState, city: City, projectId: string, cost: number, sciPerTurn = 0): void {
  const def = PROJECTS[projectId];
  if (!def) return;
  const owner = seatOf(state, city.seat);
  if (!owner) return;
  // CIV6 (`FromProject`): a scored competition pays for "Completing the X
  // project" whatever the project then goes on to do, so the score lands
  // BEFORE the arms below, every one of which returns.
  scoreProject(state, city.seat, def.id);

  if (def.repair) {
    // CIV6: "Once completed, it fully restores the HP of the city's (and
    // Encampment's) Outer Defenses" — each to its OWN full pool.
    city.outerHp = wallsMax(state, city);
    fitEncampOuter(state, city);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.movesCapital) {
    // CIV6 (Founder of Carthage): "When complete, the Phoenician Capital moves
    // to this city" — the ORIGINAL capital, so the domination anchor and the
    // occupied-capital reading move with it. Repeatable, no ledger.
    moveCapital(state, owner, city);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.carbonRecapture) {
    // CIV6 (Carbon Recapture): "-50 lifetime carbon emissions" and "+30
    // Diplomatic Favor" per completion, repeatable, and the total may go
    // below zero — `emitCarbon` never clamps.
    emitCarbon(state, city.seat, -CARBON_RECAPTURE_UNITS);
    owner.diplomaticFavor += CARBON_RECAPTURE_FAVOR;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.consumesBuilding) {
    // CIV6 (Project_BuildingCosts): the project CONSUMES the plant it names
    // — "removes the Power Plant and all its effects from this city". The
    // reactor's own age goes with it, and a pillage mark on a building that
    // no longer stands would outlive it.
    const b = def.consumesBuilding;
    city.buildings = city.buildings.filter((x) => x !== b);
    repairBuilding(city, b);
    if (b === 'NUCLEAR_POWER_PLANT') delete city.reactorAge;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.recommission) {
    // CIV6: the age is "the number of turns that have passed since the Power
    // Plant was first constructed, converted to, or last recommissioned".
    city.reactorAge = 0;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.laser) {
    // Repeatable: each station speeds the craft by +1 LY/turn. The orbital one
    // is the seat's; the terrestrial one belongs to the city it powers from.
    if (def.orbital) owner.orbitalLasers = (owner.orbitalLasers ?? 0) + 1;
    else city.laserStations = (city.laserStations ?? 0) + 1;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.wmd) {
    // CIV6: the finished device joins the seat's INVENTORY, not any city's.
    const inv = (owner.wmd ??= NUCLEAR_DEVICES.map(() => 0));
    inv[def.wmd - 1] += 1;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.once) {
    if (!owner.projectsDone.includes(projectId)) owner.projectsDone.push(projectId);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    // The sourced side effects, per step (Launch Mars Colony has none — it
    // exists to open the expedition).
    if (projectId === 'LAUNCH_EARTH_SATELLITE' && state.fogOfWar) {
      // CIV6: reveals the entire map. Same fog gate as `revealAround` — a
      // fog-off world accrues no explored state on either engine.
      owner.explored = new Array(state.map.tiles.length).fill(1);
    }
    if (projectId === 'LAUNCH_MOON_LANDING') {
      // CIV6: a one-time Culture lump of 10x the seat's science per turn —
      // measured on the seat-phase-top city-stats snapshot the caller holds.
      applyLumpYield(state, city.centerIndex, { key: 'culture', amount: Math.round(10 * sciPerTurn) }, city.seat);
    }
    if (def.victory) {
      // CIV6: completing the Exoplanet Expedition LAUNCHES the craft; the
      // win fires when it arrives (the endTurn flight tick).
      owner.spaceLy = 0;
      state.eventLog.push('The Exoplanet Expedition has launched.');
    }
    return;
  }
  // CIV6 (Bread and Circuses' PROJECT_COMPLETION_LOYALTY,
  // MODIFIER_SINGLE_CITY_GRANT_LOYALTY): the city's Loyalty rises by the
  // grant, never past its maximum
  if (def.completionLoyalty) {
    city.loyalty = Math.min(LOYALTY_MAX, (city.loyalty ?? LOYALTY_MAX) + def.completionLoyalty);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
  }
  // a district project's yield is converted turn by turn as the Production
  // goes in (`City.projectYield`); its completion pays the points
  const classes = gpClassesOf(def);
  if (classes.length) {
    const pts = Math.round(cost * gppFractionOf(def));
    for (const gc of classes) {
      owner.gpp[gc] = (owner.gpp[gc] ?? 0) + pts * congressGppFactor(state, gc);
    }
    state.eventLog.push(`${city.name} completed ${def.name}: +${pts} ${classes.join('/')} points.`);
  }
}

/**
 * CIV6: a city never holds two of one building, so obtaining one any other
 * way — a Great Person's instant build, a purchase — takes it off the
 * production queue. The hammers already spent are NOT lost: they bank, which
 * is where this model puts every carried-over hammer.
 *
 * Only the queue HEAD accrues (every `progress +=` in the engine reads
 * `queue[0]`), so a deeper item banks the zero it carries. The progress the
 * city keeps on the building outside the queue banks with it and the kept
 * entry goes (0x175da0 adds +0x218[building] to the store, 0x17d910 clears it).
 */
export function dropQueuedBuilding(city: City, buildingId: string): void {
  for (let i = city.queue.length - 1; i >= 0; i--) {
    const it = city.queue[i];
    if (it?.kind !== 'building' || it.building !== buildingId) continue;
    city.productionBank = (city.productionBank ?? 0) + it.progress;
    city.queue.splice(i, 1);
  }
  const kept = takeKept(city, { kind: 'building', building: buildingId, progress: 0 });
  if (kept > 0) city.productionBank = (city.productionBank ?? 0) + kept;
}

/**
 * CIV6 (Culture Bomb): a tile whose district or wonder is still under
 * construction is flipped anyway — "construction will immediately stop and
 * it'll disappear", "wiping out any unfinished construction in the process".
 * The hammers already spent are NOT lost: they bank, which is where this model
 * puts every carried-over hammer.
 *
 * `_wipe_construction` is the twin.
 */
export function wipeConstruction(state: GameState, tile: Tile): void {
  const digging = tile.district !== null && !tile.districtComplete;
  const raising = tile.builtWonder !== null && !tile.builtWonderComplete;
  if (!digging && !raising) return;
  const city = seatOf(state, tileSeat(tile))?.cities.find((c) => c.id === tileCity(tile));
  if (city) {
    for (let i = city.queue.length - 1; i >= 0; i--) {
      const it = city.queue[i];
      if (it.kind !== 'district' && it.kind !== 'wonder') continue;
      if (it.tileIndex !== tile.index) continue;
      city.productionBank = (city.productionBank ?? 0) + it.progress;
      city.queue.splice(i, 1);
    }
    if (digging) city.districts = city.districts.filter((d) => d.tileIndex !== tile.index);
    if (raising) city.wonders = city.wonders.filter((w) => w.tileIndex !== tile.index);
  }
  if (digging) {
    tile.district = null;
    tile.districtComplete = false;
  }
  if (raising) {
    tile.builtWonder = null;
    tile.builtWonderComplete = false;
  }
}

/**
 * CIV6 (City_BuildQueue 0x184660 at 0x1847dc -> 0x5313f0 with its major's
 * flag): a district item a major's city builds stops at its plot when a
 * living unit of a player at war with the city's owner (0x469cd0, the
 * barbarians at war with all) stands there with a Combat, Ranged or Bombard
 * strength above 0. A city-state's or Free City's district never stops.
 */
export function districtPlotHostile(state: GameState, city: City, tileIndex: number): boolean {
  if (!isCiv(city.seat)) return false;
  return state.units.some((u) => {
    if (u.tileIndex !== tileIndex || !unitsHostile(state, { seat: city.seat }, u)) return false;
    const def = UNITS[u.type];
    return !!def && ((def.combat ?? 0) > 0 || (def.ranged?.strength ?? 0) > 0 || (def.bombard ?? 0) > 0);
  });
}

/**
 * CanConstruct's district test (0x170450 at 0x17071d): a city holding the
 * building's district (engine id; none and the City Center never) complete
 * and pillaged (0x1ad720) refuses the building, the reason +0x2a.
 */
export function districtPillagedIn(state: GameState, districts: readonly { type: string; tileIndex: number }[], district: string | null | undefined): boolean {
  if (!district || district === 'CITY_CENTER') return false;
  return districts.some((x) => x.type === district && state.map.tiles[x.tileIndex].districtComplete && !!state.map.tiles[x.tileIndex].districtPillaged);
}

/**
 * CIV6 (City_BuildQueue 0x16f050 at 0x16f09a..0x16f180): before the step a
 * building at the head (ORDER_CONSTRUCT, a wonder among them) is asked
 * CanConstruct (0x170450, its last argument set): a building whose district
 * the city holds pillaged is refused, held and under repair or not
 * (`districtPillagedIn`; runs/h1_duelq1124 Wuhan t236: its Ferris Wheel at 0
 * under the Water Park pillaged again at t235's close, the queue empty at
 * the turn's start, the Builder picked at 0 and at 43 a turn on), and a wonder
 * with progress on its plot where a hostile unit holds the plot (0x170db8,
 * `districtPlotHostile`; runs/h1_duelq1128 Xi'an t22: Stonehenge at 14 under
 * the barbarian Warrior on 15:11, the Builder picked at 0 taking 9 + 9 at
 * t23). The refused head leaves the queue, its progress kept by type
 * (0x17f5a0, 0x17f630), and the queue process's front check (0x178250 ->
 * 0x17f070 -> 0x17e8d0) asks the same of the next building at the head,
 * until one stands; the step then works the head, or puts the turn's
 * Production in the overflow store. True when a head left.
 */
export function headLetGo(state: GameState, city: City): boolean {
  let left = false;
  for (;;) {
    const q = city.queue[0];
    const refused = q?.kind === 'building' ? districtPillagedIn(state, city.districts, BUILDINGS[q.building]?.district)
      : q?.kind === 'wonder' && q.progress > 0 && districtPlotHostile(state, city, q.tileIndex);
    if (!q || !refused) return left;
    city.queue.shift();
    keepItem(city, q);
    left = true;
  }
}

/** A step factor as the DLL turns it into 24.8 (0x183db0: the float32
 *  factor's floor as the whole part, its fraction's 256ths truncated: 1.1 is
 *  281 / 256, 0.7 is 179 / 256). */
export function fxFactor(f: number): number {
  const g = Math.fround(f);
  const fl = Math.floor(g);
  return fl * 256 + Math.trunc(Math.fround(Math.fround(g - fl) * 256));
}

/** `m` (raw 24.8) times the factor `f` (fx_mul_assign 0x16eb20: (a b) >> 8) */
function fxBy(m: number, f: number): number {
  return Math.floor((m * fxFactor(f)) / 256);
}

/**
 * THE QUEUE STEP'S ITEM MULTIPLIER (City_BuildQueue 0x16f050 -> the order's
 * step: 0x183db0 a building or wonder, 0x1853d0 a unit, 0x184660 a
 * district, 0x184ae0 a project), raw 24.8: each factor turned into 24.8 on
 * its own and multiplied in through fx_mul_assign (0x16eb20), the item's
 * additive percents one factor (1 + their sum). The factors in this order,
 * the GPU's `_step_mult` the same; the item classes they key on are
 * disjoint, so a factor's place among another class's moves nothing.
 */
export function stepMultiplier(state: GameState, city: City, q: QueueItem): number {
  const seat = seatOf(state, city.seat);
  const mods = getModifiers(state, city.seat);
  const offHome = !onHomeContinent(state, city.seat, city.centerIndex);
  let m = 256;
  const by = (f: number) => { m = fxBy(m, f); };
  // The seat's GOVERNMENT/POLICY encampHarborProdMult: a seat that adopts the
  // government owns its effects; the multiplier keys on the ITEM.
  if (isEncampHarborItem(q)) by(mods.encampHarborProdMult);
  // CIV6 (To Arms!, Golden face): "+15% Production towards military units."
  // (Heartbeat of Steam, Golden face): "+10% Production toward Industrial era
  // and later wonders."
  if (q.kind === 'unit' && unitIsMilitary(q.unit) && goldenDedication(state, city.seat, DED_TO_ARMS)) by(TO_ARMS_MIL_PROD_MULT);
  if (q.kind === 'wonder' && (WONDER_ERA_INDEX[q.wonder] ?? 0) >= INDUSTRIAL_ERA_INDEX && goldenDedication(state, city.seat, DED_STEAM)) by(STEAM_WONDER_PROD_MULT);
  // CIV6 (Urban Development Treaty, outcome A): "+100% Production towards
  // buildings in this district."
  const udt = congressUdtProdDistrict(state);
  if (q.kind === 'building' && udt !== null && BUILDINGS[q.building]?.district === udt) by(CONGRESS_PROD_MULT);
  // CIV6 (Global Energy Treaty, outcome B): +100% Production toward the named
  // power plant.
  if (q.kind === 'building') by(congressEnergyProdMult(state, q.building));
  // CIV6 (EFFECT_ADJUST_BUILDING_PRODUCTION, EFFECT_ADJUST_DISTRICT_PRODUCTION):
  // the roster's building and district rows, each its own factor; (Treasure
  // Fleet) a row may be keyed on the city sitting OFF the seat's home
  // continent — its original capital's continent
  if (q.kind === 'building') for (const f of prodMultFactors(mods.prodMults, { kind: 'building', building: q.building, district: BUILDINGS[q.building]?.district }, offHome)) by(f);
  if (q.kind === 'district') for (const f of prodMultFactors(mods.prodMults, { kind: 'district', districtItem: q.district }, offHome)) by(f);
  // CIV6 (Public Works Program): "+100% / -50% Production towards this
  // Project."
  if (q.kind === 'project') by(congressProjectMult(state, PROJECT_LIST.findIndex((pr) => pr.id === q.project)));
  if (q.kind === 'unit') {
    // CIV6 (Letters of Marque): "Naval Raiders: +100% Production"
    if (UNITS[q.unit]?.raider) by(mods.navalRaiderProdMult);
    // (Flower Power, Mercenary Companies on Production): a unit cost
    // multiplier, paid as a slower fill rather than a moved queue cost
    const uc = itemCost(q);
    const ucm = unitProdCost(state, city.seat, q.unit, uc);
    if (ucm > 0 && ucm !== uc) by(uc / ucm);
    // CIV6 (Thunderbolt of the North): "+50% Production toward all naval
    // melee units."
    if (leaderOf(state, city.seat) === 'HARDRADA' && navalMelee(UNITS[q.unit])) by(HARDRADA_NAVAL_MELEE_PROD_MULT);
    // CIV6 (EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION): the roster's unit-class rows
    const pc = promoClassOf(q.unit);
    for (const f of prodMultFactors(mods.prodMults, { kind: 'unit', promoClass: pc, unit: q.unit }, offHome)) by(f);
    // CIV6 (Statue of Zeus, MODIFIER_PLAYER_CITIES_ADJUST_UNIT_TAG_ERA_PRODUCTION
    // NO_ERA): the seat's wonders' unit-class rows, in catalog order
    // (runs/h1_duelp1124 Wuhan's AT Crew 20 -> 51 -> 82 on 20.703 the turns
    // after Shanghai's t213 Statue)
    for (const w of seatWonders(state, city.seat)) {
      const wp = w.def.effects?.unitClassProdPct;
      if (wp && wp.promoClass === pc) by(1 + wp.pct / 100);
    }
  }
  if (q.kind === 'district') {
    // CIV6 (Zoning Commissioner): "+20% Production towards constructing
    // Districts in the city"
    by(governorMult(state, city, (e) => e.districtProdMult));
    // CIV6 (Merchant Republic, GOVERNMENTBONUS_DISTRICT_PRODUCTION): "+15%
    // Production toward Districts."
    by(mods.districtProdMult);
    // CIV6 (Founder of Carthage): "+50% Production toward districts in the
    // city with the Government Plaza" (`PLAZA_DISTRICT_PROD_ROWS`)
    if (mods.plazaDistrictProd && city.districts.some((d) => d.type === 'GOVERNMENT_PLAZA'
      && state.map.tiles[d.tileIndex].districtComplete)) by(1 + mods.plazaDistrictProd / 100);
  }
  if (q.kind === 'project') {
    // (Automated Workforce): the seat's project multiplier; (Space
    // Initiative, Arms Race Proponent): +30% toward the named projects in the
    // governor's city; (Hong Kong): "+20% Production towards city projects";
    // (Future Tech): "+5% Production towards city projects each time it is
    // completed" — the percent the seat has banked
    by(mods.projectProdMult);
    by(1 + governorSum(state, city, (e) => e.projectProdPct?.[q.project]) / 100);
    by(suzerainProjectMult(state, city.seat));
    by(1 + (seat?.researchProjectPct ?? 0) / 100);
  }
  // CIV6 (Iteru): "+15% Production towards Districts and Wonders built next
  // to a River."
  if ((q.kind === 'district' || q.kind === 'wonder') && mods.civ === 'EGYPT' && hasRiver(state.map.tiles[q.tileIndex])) by(ITERU_RIVER_PROD_MULT);
  // CIV6 (France, EFFECT_ADJUST_WONDER_ERA_PRODUCTION): "+20% Production
  // toward Medieval, Renaissance, and Industrial era wonders" — an ERA BAND,
  // inclusive at both ends (`WONDER_ERA_PROD_ROWS`)
  if (q.kind === 'wonder') {
    const we = WONDER_ERA_INDEX[q.wonder] ?? 0;
    for (const r of mods.wonderEraProd) {
      if (we >= ERAS.indexOf(r.startEra) && we <= ERAS.indexOf(r.endEra)) by(1 + r.pct / 100);
    }
  }
  // CIV6 (Pearl of the Danube): "+50% Production to Districts and Buildings
  // constructed ACROSS A RIVER from a City Center." A building is built in its
  // district, so its tile is that district's; a City Center building never
  // crosses a river from the centre it stands on.
  if (mods.riverCrossProd.length && (q.kind === 'district' || q.kind === 'building')) {
    const at = q.kind === 'district'
      ? q.tileIndex
      : city.districts.find((d) => d.type === BUILDINGS[q.building]?.district)?.tileIndex;
    if (at !== undefined && crossesRiver(state.map, state.map.tiles[city.centerIndex], state.map.tiles[at])) {
      for (const r of mods.riverCrossProd) if (r.kind === q.kind) by(1 + r.pct / 100);
    }
  }
  // THE ADDITIVE PERCENTS, one factor. CIV6 (Ancestral Hall): "50% increased
  // Production toward Settlers in this city"; (Warlord's Throne): "Capturing
  // an enemy City grants 20% bonus Production in all Cities for 5 turns".
  let pct = q.kind === 'settler' ? cityBuildingSum(state, city, 'settlerProdPct') / 100 : 0;
  if ((seat?.conquestProdTurns ?? 0) > 0) pct += seatBuildingSum(state, city.seat, 'conquestProdPct') / 100;
  // CIV6 (Military alliance 2): "+15% Production toward military units when
  // you or your ally are at war."
  if (q.kind === 'unit' && unitIsMilitary(q.unit) && state.seats.some((x) => x.seat !== city.seat
    && alliedAtLevel(state, city.seat, x.seat, ALLIANCE_MILITARY, 2)
    && (atWarWithAny(state, city.seat) || atWarWithAny(state, x.seat)))) pct += ALLIANCE_M2_MIL_PROD_PCT / 100;
  // CIV6 (Integrated Space Cell, EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION):
  // "+15% Production toward Space Race projects if a city has either a
  // Military Academy or a Seaport" — a building standing, not dark
  if (q.kind === 'project' && isSpaceProject(q.project) && mods.spaceProjectProd.length) {
    const dark = darkBuildings(state.map, city);
    for (const r of mods.spaceProjectProd) {
      if (r.buildings.some((b) => city.buildings.includes(b) && !dark.has(b))) pct += r.pct / 100;
    }
  }
  // CIV6 (TRAIT_LIBERATION_WAR_PRODUCTION, YIELD_PRODUCTION Amount 100): a
  // percent on every item for the turns after the declaration
  pct += warBuffProdPct(state, city.seat) / 100;
  // CIV6 (Brussels, EFFECT_ADJUST_WONDER_PRODUCTION): percent toward wonders
  if (q.kind === 'wonder') pct += suzerainWonderPct(state, city.seat) / 100;
  by(1 + prodBoostPct(mods, q, seat?.gpPerm) + pct);
  return m;
}

/** `amount` put into an item under the step's multiplier `mult` (raw 24.8):
 *  the amount in 24.8 times it (0x183db0's fx_mul_assign of the step's
 *  argument by its multiplier, before fx_add_assign 0x0ac650 adds it to the
 *  item's progress) */
export function stepAmount(amount: number, mult: number): number {
  return Math.floor((Math.floor(amount * 256 + 0.5) * mult) / 256) / 256;
}

/** The type a city keeps an item's progress under (City_BuildQueue's
 *  per-type arrays: +0x218 the buildings', a wonder among them, +0x230 the
 *  units', +0x248 the districts', +0x260 the projects'); a formation's is its
 *  unit's, a Settler's the Settler's. */
export function keptKey(q: QueueItem): string {
  switch (q.kind) {
    case 'building': return `building:${q.building}`;
    case 'wonder': return `wonder:${q.wonder}`;
    case 'unit': return `unit:${q.unit}`;
    case 'settler': return 'unit:SETTLER';
    case 'district': return `district:${q.district}`;
    case 'project': return `project:${q.project}`;
  }
}

/** An item leaving the queue unfinished keeps its progress on its type
 *  (the queue's per-type arrays hold it whether or not the item is queued:
 *  0x17f5a0 / 0x17f630 drop the entry alone). */
export function keepItem(city: City, q: QueueItem): void {
  if (q.progress <= 0) return;
  (city.kept ??= {})[keptKey(q)] = q.progress;
}

/** the progress the city keeps on the item's type, spent (0 where none) */
export function takeKept(city: City, q: QueueItem): number {
  const k = keptKey(q);
  const p = city.kept?.[k] ?? 0;
  if (city.kept && k in city.kept) {
    delete city.kept[k];
    if (Object.keys(city.kept).length === 0) delete city.kept;
  }
  return p;
}

/**
 * AN ITEM QUEUED RESUMES its type's kept progress (`takeKept`). A district
 * takes its plot's locked price (the city's district of the type with a
 * price above 0, 0x179960: `City.districts`' `cost`). The repair of a
 * pillaged district or building with no progress kept starts at the share
 * its pillage left: the price less PILLAGE_BUILDING_REPAIR_PERCENT, truncated
 * (a district's 0x17e770 -> 0x183a60, a building's 0x193190 -> 0x183950:
 * (cost x (100 - 25)) / 100; runs/h1_duelp1121 Taiyuan's Harbor queued at
 * t153 on 78 of 104, Xi'an's Shrine at t135 on 26 of 35).
 */
export function resumeItem(state: GameState, city: City, q: QueueItem): void {
  const kept = takeKept(city, q);
  q.progress = kept;
  let pillaged = false;
  if (q.kind === 'district') {
    const locked = city.districts.find((d) => d.tileIndex === q.tileIndex && d.type === q.district)?.cost;
    if (locked !== undefined && locked > 0) q.cost = locked;
    const t = state.map.tiles[q.tileIndex];
    pillaged = t?.district === q.district && !!t.districtComplete && !!t.districtPillaged;
  } else if (q.kind === 'building') pillaged = buildingPillaged(city, q.building);
  if (kept <= 0 && pillaged) q.progress = Math.floor((itemCost(q, state, city) * (100 - PILLAGE_BUILDING_REPAIR_PERCENT)) / 100);
}

export function completeQueueItem(
  state: GameState,
  city: City,
  item: QueueItem,
  cost: number,
  sciPerTurn = 0,
): void {
  const owner = seatOf(state, city.seat);
  if (!owner) return;
  // CIV6 (Citadel of God): "Gain Faith equal to 25% of the construction cost
  // when finishing buildings." Districts are construction too and the page
  // groups them with the buildings; wonders are not.
  if (item.kind === 'building' || item.kind === 'district') {
    const pct = governorSum(state, city, (e) => e.faithOnBuildPct);
    if (pct) owner.faith = (owner.faith ?? 0) + Math.floor((cost * pct) / 100);
  }
  switch (item.kind) {
    case 'district': {
      const dt = state.map.tiles[item.tileIndex];
      // a district standing complete on the plot is a pillaged one's repair:
      // it is set whole and pays no completion (0x175140: 0x1ae340 finds it,
      // 0x1af5b0, where a new one takes 0x180450)
      if (dt.districtComplete) {
        dt.districtPillaged = false;
        break;
      }
      dt.districtComplete = true;
      if (dt.district) questDistrictBuilt(state, city.seat, dt.district);
      // the type's own price takes the completed count afresh
      if (dt.district) refreshDistrictDiscount(state, city.seat, dt.district);
      // CIV6 (Monumentality, EFFECT_ADJUST_PLAYER_ERA_SCORE_PER_DISTRICT_CONSTRUCTED):
      // a specialty district (`countsTowardLimit`) completed pays; an
      // Aqueduct, a Bath or a Dam pays nothing (runs/h1_duelw1109 t99, 1110
      // t101 and t107, 1118 t98, 1120 t94, 1124 t97)
      if (dt.district && DISTRICTS[dt.district]?.countsTowardLimit) dedicationEvent(state, city.seat, DED_MONUMENTALITY);
      if (dt.district) districtMoment(state, city.seat, city, dt.index, dt.district);
      if (dt.district === 'CANAL') canalMoment(state, city.seat);
      if (dt.district === 'ENCAMPMENT') {
        dt.encampHp = ENCAMPMENT_HP;
        // its OWN perimeter arrives at whatever tier the city's walls
        // already supply — 0 where none stand yet (`fitEncampOuter`)
        dt.encampOuterHp = wallsMax(state, city);
      }
      // CIV6 (Religious Convert): "Receives an Apostle each time he finishes
      // a ... Theater Square district" (`DISTRICT_UNIT_ROWS`)
      for (const r of getModifiers(state, city.seat).districtUnits) {
        if (dt.district === r.district) spawnUnit(state, r.unit, dt.index, city.seat);
      }
      // CIV6 (M'banza): a free Apostle when it finishes; (Royal Navy
      // Dockyard): a naval unit the install does not name, so the strongest
      // hull this seat can train. Both are the VARIANT's own clause, so a
      // seat that does not carry it sees nothing.
      const dv = dt.district
        ? DISTRICTS[dt.district].civVariants?.find((v) => v.civ === civOf(state, city.seat))
        : undefined;
      if (dv?.grantsUnit) spawnUnit(state, dv.grantsUnit, dt.index, city.seat);
      if (dv?.grantsNavalUnit) {
        const hull = bestTrainableNaval(state, city.seat, city);
        // WHICH HULL, including NONE: `if (hull)` swallows the null, and a
        // grant that fired and found nothing is a different fault from a
        // grant that never fired at all.
        const dlH = (globalThis as { __diffLog?: string[] }).__diffLog;
        if (dlH) {
          dlH.push(`nv:${city.seat}:${state.turn}:${dt.index}`
            + ` hull${hull ? UNIT_TYPE_IDX.indexOf(hull) : -1}`);
        }
        if (hull) spawnUnit(state, hull, dt.index, city.seat);
      }
      const ddef = dt.district ? DISTRICTS[dt.district] : null;
      // CIV6 (Diplomatic Quarter): "+1 Envoy when built next to the City
      // Center."
      const envoysD = ddef?.envoysNextToCenter ?? 0;
      if (envoysD && neighbors(state.map, dt).some((n) => n.index === city.centerIndex)) {
        owner.envoysAvailable = (owner.envoysAvailable ?? 0) + envoysD;
      }
      // The Border Control Treaty bombs FOREIGN tiles too and so subsumes the
      // Preserve's own; only one of the two ever runs.
      if (congressCultureBombSeat(state) === city.seat) cultureBomb(state, city, item.tileIndex, false);
      else if (ddef?.cultureBombUnowned) cultureBomb(state, city, item.tileIndex, true);
      // CIV6 (Grote Rivieren): "Culture Bomb adjacent tiles when completing a
      // Harbor" — the roster's own carrier, a FULL bomb like the Congress's
      else if (dt.district !== null
        && getModifiers(state, city.seat).cultureBombs.some((r) => r.district === dt.district)) {
        cultureBomb(state, city, item.tileIndex, false);
      }
      // CIV6 (Mimar Sinan, MODIFIER_PLAYER_ADD_CULTURE_BOMB_TRIGGER): the same
      // full bomb on every Industrial Zone the seat completes after him
      else if (dt.district === 'INDUSTRIAL_ZONE' && gpPermOf(owner, 'izCultureBomb') > 0) {
        cultureBomb(state, city, item.tileIndex, false);
      }
      break;
    }
    case 'wonder': {
      const slotsBefore = governmentSlots(state, owner.seat);
      state.map.tiles[item.tileIndex].builtWonderComplete = true;
      // a wonder's policy slot rebuilds the slots (`slotCountRebuild`)
      slotCountRebuild(state, owner.seat, slotsBefore, state.turn);
      // CIV6 (WONDER_FREE_TILES_UPON_COMPLETION, the DLL's completion
      // 0x17f870 -> 0x1a8a30): the city annexes that many plots before the
      // wonder's grants, each one border pick (`drawBorderPlot`, no draw with
      // nothing in reach); an annex clears the stored next plot (0x1a8b70)
      // and is no culture claim (`tilesAcquired` stands)
      for (let k = 0; k < WONDER_FREE_TILES; k++) {
        const plot = drawBorderPlot(state, city);
        if (plot === null) break;
        claimTile(state, city, plot);
        city.nextPlot = -1;
      }
      wonderMoment(state, city.seat, WONDER_ERA_INDEX[item.wonder] ?? 0);
      const fx = BUILT_WONDERS[item.wonder]?.effects;
      // CIV6: Statue of Liberty pays +4 Diplomatic Victory points on
      // completion, Potala Palace +1.
      if (fx?.dvp) owner.diplomaticPoints = (owner.diplomaticPoints ?? 0) + fx.dvp;
      // CIV6 (Big Ben): the treasury is multiplied once, at completion.
      if (fx?.treasuryMult) owner.treasury *= fx.treasuryMult;
      // CIV6 (Mausoleum): the charge reaches the engineers ALREADY standing,
      // not just the ones born after it.
      if (fx?.engineerCharges) {
        for (const u of state.units) {
          if (unitSeat(u) === owner.seat && isGreatEngineer(u.type)) u.charges = (u.charges ?? 0) + fx.engineerCharges;
        }
      }
      // CIV6 (Apadana): +2 envoys each time ANY wonder completes in its city,
      // itself included — so the count is read AFTER this tile went complete.
      const envoys = completedWonders(state, city).reduce((n, w) => n + (w.def.effects?.envoysPerWonder ?? 0), 0);
      if (envoys) owner.envoysAvailable = (owner.envoysAvailable ?? 0) + envoys;
      // CIV6 (Kilwa Kisiwani): envoys paid once, at completion.
      if (fx?.grantEnvoys) owner.envoysAvailable = (owner.envoysAvailable ?? 0) + fx.grantEnvoys;
      // CIV6 (Casa de Contratación, MODIFIER_PLAYER_ADJUST_GOVERNOR_POINTS)
      if (fx?.governorTitles) owner.grantedTitles += fx.governorTitles;
      // CIV6 (MODIFIER_SINGLE_CITY_GRANT_UNIT_IN_CITY: Pyramids' Builder,
      // Statue of Zeus' army) — at the completing city, row by row.
      for (const g of fx?.grantUnits ?? []) {
        for (let k = 0; k < g.count; k++) {
          const u = spawnUnit(state, g.unit, city.centerIndex, city.seat);
          // an Apostle (InitialLevel 2) draws its level offer at its birth
          // (runs/h1_duelw1118 t224: Mahabodhi's two, 9..1 twice)
          if (u && u.type === 'APOSTLE') offerApostlePromotions(state, u, city.seat);
        }
      }
      // CIV6 (Angkor Wat, MODIFIER_PLAYER_CITIES_ADD_POPULATION): every city
      // the owner holds grows once.
      if (fx?.popAllCities) {
        for (const c of citiesOf(state, city.seat)) {
          gainPopulationPressure(c, fx.popAllCities);
          c.population += fx.popAllCities;
          logPopWrite(state, c, 'wp');
        }
      }
      // CIV6 (Stonehenge): the free Great Prophet, with the Apostle fallback.
      if (fx?.grantProphet) grantFreeProphet(state, city.seat, city.centerIndex);
      // CIV6 (Oxford, Bolshoi): free technologies and civics, drawn at random
      // in the real game and taken here in the same available-order the
      // research chooser uses.
      if (fx?.freeTechs) grantFreeResearch(state, owner, 'tech', fx.freeTechs);
      if (fx?.freeCivics) grantFreeResearch(state, owner, 'civic', fx.freeCivics);
      // CIV6 (Broadway, MODIFIER_PLAYER_GRANT_RANDOM_CIVIC_BOOST_BY_ERA): a
      // random civic boost of its era, the era picker's draw (0x39c930;
      // runs/h1_duelw1124 t189: the Dynastic Cycle's and its own, over 4 and 3)
      if (fx?.civicBoostsByEra) {
        const e = ERAS.indexOf(fx.civicBoostsByEra.era as never);
        drawBoosts(state, city.seat, 'civic', boostPool(owner.research, 'civic', e, e), fx.civicBoostsByEra.amount);
      }
      // CIV6 (Great Library): "Receive boosts to all Ancient and Classical era
      // technologies" — one eureka per technology not already boosted or
      // researched, each of which is a Free Inquiry event like any other.
      const boostEra = fx?.boostTechsThroughEra ?? -1;
      if (boostEra >= 0) {
        let fired = 0;
        for (const [id, def] of Object.entries(TECHS)) {
          if (ERAS.indexOf(def.era) > boostEra) continue;
          if (markBoost(state, city.seat, id)) fired += 1;
        }
        dedicationEvent(state, city.seat, DED_FREE_INQUIRY, fired);
      }
      // CIV6 (Dynastic Cycle): a random Eureka and Inspiration from the ERA OF
      // THE WONDER, after the wonder's own grants (runs/h1_duelw1117 t26:
      // Stonehenge's Prophet draws its replacement, then the tech boost over
      // 4 and the civic boost over 2)
      grantEraBoosts(state, city.seat, ERAS[WONDER_ERA_INDEX[item.wonder] ?? 0]);
      break;
    }
    case 'settler':
      // Real Civ 6: a completed Settler costs the city 1 pop and SPAWNS at
      // the city — a unit like any other, moved and founded by orders.
      // CIV6 (Provision): "Settlers trained in the city do not consume a
      // Population."
      spawnUnit(state, 'SETTLER', city.centerIndex, city.seat, 'stack');
      if (!governorFlag(state, city, (e) => e.settlerFreePop)) {
        city.population = Math.max(1, city.population - 1);
        // CIV6 (the citizen manager, 0x194fb0 with a negative count): a
        // citizen lost unassigns them all and places them all again
        // (runs/h1_duelw1121 Xi'an t21: the Settler's citizen leaves a plot
        // of 2 Food 2 Production, the 4 Food one kept)
        if (isCiv(city.seat)) replaceAllCitizens(state, city, cityFlags(city));
      }
      logPopWrite(state, city, 'se');
      break;
    case 'unit': {
      // CIV6: "Newly built aircraft will spawn in the Aerodrome, as long as it
      // still has empty slots."
      const where = UNITS[item.unit]?.air
        ? airTrainTile(state, city.seat, city) ?? city.centerIndex
        : city.centerIndex;
      // CIV6 (Military alliance 3): "Units start with a free Promotion."
      const freePromo = governorFlag(state, city, (e) => e.freePromoOnTrain)
        || allianceFreePromo(state, city.seat);
      const trained = spawnUnit(state, item.unit, where, city.seat, 'stack');
      if (trained) {
        // a FORMATION entry arrives at its tier — the whole point of the order
        if (item.formation) trained.formation = item.formation;
        applyTrainingGrants(state, city, trained);
        grantFreePromotion(trained, freePromo);
      }
      // CIV6 (Venetian Arsenal): a TRAINED naval unit arrives twice. Purchases
      // are excluded in the real game and take a different path here.
      // CIV6 (People of the Steppe): "Receive a second light cavalry unit
      // ... each time you train a light cavalry unit" — a TRAINED one, the
      // same door the Arsenal's hull comes through (`EXTRA_UNIT_COPY_ROWS`)
      let copies = 0;
      for (const r of getModifiers(state, city.seat).extraUnitCopies) {
        if (r.unit !== undefined) {
          if (r.unit === item.unit) copies += r.amount;
        } else if (r.cls === 'LIGHT_CAVALRY' && UNITS[item.unit] && isLightCavalry(UNITS[item.unit])) {
          copies += r.amount;
        }
      }
      // CIV6 (Suleiman's Janissary): the chassis costs the TRAINING city a
      // citizen, in a city this seat founded.
      for (const r of getModifiers(state, city.seat).unitPopCost) {
        if (r.unit !== item.unit) continue;
        if (r.foundedOnly && city.founderSeat !== city.seat) continue;
        gainPopulationPressure(city, r.amount);
        city.population = Math.max(1, city.population + r.amount);
        logPopWrite(state, city, 'jn');
      }
      for (let k = 0; k < copies; k++) {
        const extra = spawnUnit(state, item.unit, city.centerIndex, city.seat, 'stack');
        if (extra) {
          if (item.formation) extra.formation = item.formation;
          applyTrainingGrants(state, city, extra);
          grantFreePromotion(extra, freePromo);
        }
      }
      if (UNITS[item.unit]?.naval && seatWonderFlag(state, city.seat, 'duplicateNavalTrain')) {
        const twin = spawnUnit(state, item.unit, city.centerIndex, city.seat, 'stack');
        if (twin) {
          // what was trained arrives twice, tier and all
          if (item.formation) twin.formation = item.formation;
          applyTrainingGrants(state, city, twin);
          grantFreePromotion(twin, freePromo);
        }
      }
      break;
    }
    case 'project':
      completeProject(state, city, item.project, cost, sciPerTurn);
      break;
    case 'building':
      // `city.buildings` is a SET — every reader tests it with `includes`,
      // and the GPU carries it as one bit per building.
      if (!city.buildings.includes(item.building)) {
        city.buildings.push(item.building);
        buildingCreatedCulture(state, city.seat, item.building);
      }
      repairBuilding(city, item.building); // a held building's column completing is its REPAIR
      stampBuildingEra(state, city, item.building);
      buildingDedications(state, city.seat, item.building);
      // CIV6 (Intelligence Agency): "+1 Spy" — the free unit, here.
      if (BUILDINGS[item.building]?.grantUnit) spawnUnit(state, BUILDINGS[item.building].grantUnit!, city.centerIndex, city.seat);
      if (BUILDINGS[item.building]?.walls) { city.outerHp = wallsMax(state, city); fitEncampOuter(state, city); }
      // CIV6 (Flood Barrier): built late, "those tiles can be repaired in
      // full and used again, along with anything that's on them".
      if (BUILDINGS[item.building]?.floodBarrier) repairBehindBarrier(state, city);
      break;
  }
}

/**
 * CIV6 (Border Control Treaty, outcome A): "New Districts built by target
 * player act as Culture bombs" — and, on its own, the Preserve.
 *
 * CIV6 (Culture Bomb): "the immediate annexation of the six tiles surrounding
 * the trigger tile, without districts or wonders and falling within 3 hexes of
 * one of the owner's City Centers" — taking foreign-owned tiles is the whole
 * point of a bomb. Ascending tile order, so both engines claim the same set in
 * the same order.
 *
 * A tile whose district or wonder is still UNDER CONSTRUCTION is flipped too,
 * and `wipeConstruction` undoes the build it was carrying. Exported because a
 * completed IMPROVEMENT bombs through the same body (`CULTURE_BOMB_ROWS`), and
 * a second hand-written claim would drift.
 */
export function cultureBomb(state: GameState, city: City, tileIndex: number, unownedOnly: boolean): void {
  const owner = seatOf(state, city.seat);
  if (!owner) return;
  for (const t of neighbors(state.map, state.map.tiles[tileIndex]).slice().sort((a, b) => a.index - b.index)) {
    // CIV6 (Culture Bomb): a COMPLETED district or wonder is never stolen.
    if ((t.district && t.districtComplete) || (t.builtWonder && t.builtWonderComplete)) continue;
    // CIV6 (Preserve): "Initiate a Culture Bomb on adjacent UNOWNED tiles" —
    // it annexes what nobody holds and never takes a rival's.
    if (unownedOnly && tileSeat(t) !== NO_SEAT) continue;
    if (tileSeat(t) === city.seat && tileCity(t) === city.id) continue;
    const near = owner.cities.some((c) => {
      const ctr = state.map.tiles[c.centerIndex];
      return hexDistance(state.map, ctr.col, ctr.row, t.col, t.row) <= CULTURE_BOMB_RANGE;
    });
    if (!near) continue;
    wipeConstruction(state, t);   // reads the plot's OLD owner, so it goes first
    setTileOwner(t, city.seat, city.id);
    city.tilesAcquired += 1;
  }
}
