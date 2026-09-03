
import type { City, CongressVote, DistrictId, Emergency, GameState, ImprovementId, SeatActionRecord, Seat, Tile, TradeRoute, Unit } from './types';
import { advanceGreatPeople, gwExtraSlots, passGreatPerson, patronizeGreatPerson, relicSlotsIn } from './greatPeople';
import { activateGreatPerson } from './gpAbility';
import { drainRelicReserve, gwCapacity, gwCount, gwGive, gwTake, GW_KINDS } from '../data/greatPeople';
import { completeQueueItem, dropQueuedBuilding, cultureBomb } from './production';
import { isExplored, revealAround } from './fog';
import { tilesWithin, hexDistance, neighbors, neighborTile } from '../../world/hex';
import { isWater, isImpassable, naturalWonderAt, hasRiver, isCoastalLand } from '../../world/query';
import { ITERU_RIVER_PROD_MULT, EPIC_QUEST_LEVY_MULT, CLEOPATRA_TRADE_QP_MULT, HARDRADA_NAVAL_MELEE_PROD_MULT, ENKIDU_COMMON_FOE_QP } from '../data/civilizations';
import { nextRandom } from './rand';
import { seatAccumulators, seatGrowth, commitProduction } from './seatTurn';
import { spawnUnit, unitsAt, unitsHostile, unitIsMilitary, encampmentIntact, tradeWalkStep, tradeWaterLevel, stepUnit, unitFullMoves, ownerHasTech, tileFreeForUnit, visibleHostilesAt , navalMelee, crossesRiver, builderHarvest } from './units';
import { cityStrikeStrength, gdrBeamCS, airPillage, airStrike, detonate, nukeTargets, siloReaches } from './combat';
import { nukeOffers } from './nuclear';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { meleeAttack, rangedAttack, hostileRangedStrike, damageRoll, terrainDefense, woundPenalty, embarkedDefenseCS, awardDefenseXp, trainXpPct, generalAuraCS, congressUnitCS, encircled, stackDefender, unitAttackRange } from './combat';
import { promoCS, promoClassOf, promoValue, takePromotion } from './promotions';
import { PROMO_COLS } from '../data/promotions';
import { availableTechsIn, availableCivicsIn, computeUnlocks, isCivicComplete, type Unlocks , prodMultFor, notFoundedSum, peacefulFounderFaith, foreignFollowerCount, greatWorkLoyalty } from './effects';
import { detectBoosts, effectiveResearchCostIn, rosterBoostPoints } from './boosts';
import { selectResearch, pillagePlunder } from './economy';
import { IMPROVEMENTS } from '../data/improvements';
import { containmentBonus, getModifiers, governmentUnitCS, makeYieldCtx, prodBoostPct, unitUpkeep } from './effects';
import { allRoadsLeadToRome, addTradeRoute, addCsTradeRoute, addIntlTradeRoute, cancelRoutesBetween, congressCancelBannedIntl, routeDestCenter, routePlunderer, stampTradingPost, PLUNDER_ROUTE_GOLD, TRADE_WALK_EXPIRY_RAIL } from './trade';
import { addEnvoys, allianceSuzInfluence, cityStateById, declareWarOnCityState, envoysOf, hasMet, isSuzerain, issueQuest, questSatisfied, resolveSuzerains, setMet, sueForPeaceWithCityState } from './cityStates';
import { LEVY_UNITS, LEVY_GOLD_COST, LEVY_COOLDOWN, INFLUENCE_PER_TURN, ENVOY_COST, GOV_INFLUENCE_TIER, QUEST_COOLDOWN, QUEST_ENVOYS, CITY_STATE_TYPES } from '../data/cityStates';
import { POLICY_LIST, GOVERNMENT_LIST } from '../data/policies';
import { PROJECT_LIST } from '../data/projects';
import { computeAdoption, governmentBit, inDarkAge, wonderExtraSlots } from './effects';
import { GOVERNMENTS_ADOPTION_LIVE } from '../data/policies';
import type { RuleResult } from './rules';
import { TERRAINS } from '../../world/terrains';
import { TECHS } from '../data/techs';
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { prodLayout } from './prodLayout';   // ONE column layout, shared with the exporter
import { CIVICS } from '../data/civics';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';
import { UNITS, CITY_HEAL_PER_TURN, ENCAMPMENT_HP, CITY_MAX_HP, URBAN_DEFENSES_TECH, FORMATION_CIVIC, FORMATION_COST_MULT, FORMATION_TRAIN_DISCOUNT, FORMATION_TRAIN_BUILDING } from '../data/units';
import { availableBuildings, buildingCompletable, buildingCostIn, goldPurchasableBuildings, outerPool, wallsMax, urbanDefensesFit, repairDrip, fitEncampOuter, encampOuterPool } from './rules';
import { generalAuraMP } from './aura'; // the aura's +1 MP half
import { ENHANCER_BELIEFS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, PANTHEONS, PANTHEON_FAITH_COST, RELIGION_NAMES } from '../data/religion';
import { CITY_WORK_RADIUS, GAME_SPEED, GOLD_PURCHASE_MULT, MP_SCALE, RAILROAD_TECH, borderGrowthCost } from '../data/constants';
import { cityDistrictSum, pillagedDistrictTypes } from './yields';
import type { CityStats } from './city';
import { computeCityStats, cityBuildingSum, luxuryAmenities, pickBorderTile, acquireTile, seatBuildingSum } from './city';
import { accrueStockpiles, chargeUnitUpkeep, layRailroad, resolveSeatPower } from './stockpile';
import { congressSession, congressBorderFrozen, congressLoyaltyDelta, congressPolicyBlocked, congressProjectMult, congressUdtProdDistrict, type CongressVoterCtx } from './congress';
import { buyVotes } from './congress';
import { CONGRESS_SPECIAL_SLOT, EMG_CALLED, EMG_PENDING, EMG_RUNNING, EMERGENCY_CITY_STATE, EMERGENCY_MILITARY, emergencies, emergencyLoyalty, emergencyName, emergencyStrikeCS, raiseEmergency } from './emergency';
import { irradiated, wmdUpkeep } from './nuclear';
import { EMERGENCIES, EMERGENCY_MEMBER_FAVOR, EMERGENCY_TARGET_FAVOR, SPECIAL_SESSION_COST, SPECIAL_SESSION_GAP, PRODUCTION_QUEUE_MAX } from '../data/seats';
import { canBuildRoad, canBuildRailroad, canPlaceDistrictIn, canPlaceWonder, suzerainNames, validImprovementsIn, wonderExists } from './rules';
import { hasFreshWater } from '../../world/query';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { seatWonders } from './wonders';
import { cleanFallout, escortUnit, breakEscort, disbandUnit, builderCost, traderCost, builderRemoveFeature, trainableUnits, goldBuyableUnits, archaeologistExcavate, naturalistPark, performConcert, upgradeUnit, unitDomain, formationBanned } from './units';
import { killUnit } from './combat';
import { landUnitPriceMult, availableProjects, buyTile, buyWorshipBuilding, purchaseBuildingWithFaith, purchaseUnitWithFaith, wallsGoldBlocked, boostProject, wonderChargeBoost, condemnHeretic, formUp, convertHeathens, districtCostIn, districtDiscounted, engineerFinish, foundCity, foundCityAt, goldAffordable, isEncampHarborItem, launchInquisition, purchaseCivilianWithFaith, purchaseNaturalist, purchaseReligiousUnit, purchaseRockBand, purchaseSettler, queueProject, removeHeresy, settlerCost, unitPurchaseCost, districtVariantCost, DISTRICT_SPECIALTY_COST, districtDiscountMult } from './game';
import { DISTRICTS, PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS } from '../data/districts';
import { IMPROVEMENT_IDS, DEDICATED_IMPROVEMENTS, unitActionIndex, AIR_STRIKE_COLS, AIR_REBASE_COLS, NUKE_COLS, SPY_TRAVEL_COLS, SPY_MISSIONS } from './unitActions';
import { airPillageTargets, airStrikeTargets, rebaseTargets, rebaseAir, displaceAirFrom } from './air';
import { beginMission, beginTravel, isSpy, spyDestinations, tickSpies, tickSpyEffects } from './espionage';

const A_FOUND_CITY = unitActionIndex(IMPROVEMENT_IDS).FOUND_CITY;
const A_EXCAVATE = unitActionIndex(IMPROVEMENT_IDS).EXCAVATE;
const A_UPGRADE = unitActionIndex(IMPROVEMENT_IDS).UPGRADE;
const A_AIR_STRIKE = unitActionIndex(IMPROVEMENT_IDS).AIR_STRIKE_0;
const A_NUKE = unitActionIndex(IMPROVEMENT_IDS).NUKE_0_0;
const A_REBASE = unitActionIndex(IMPROVEMENT_IDS).REBASE_0;
const A_AIR_PILLAGE = unitActionIndex(IMPROVEMENT_IDS).AIR_PILLAGE_0;
const A_SPY_TRAVEL = unitActionIndex(IMPROVEMENT_IDS).SPY_TRAVEL_0;
const A_SPY_MISSION = unitActionIndex(IMPROVEMENT_IDS).SPY_MISSION_0;
const A_PARK = unitActionIndex(IMPROVEMENT_IDS).PARK;
const A_PERFORM = unitActionIndex(IMPROVEMENT_IDS).PERFORM_CONCERT;
const A_BOOST = unitActionIndex(IMPROVEMENT_IDS).BOOST_PROJECT;
const A_FORM_UP = unitActionIndex(IMPROVEMENT_IDS).FORM_UP_0;
const A_ESCORT = unitActionIndex(IMPROVEMENT_IDS).ESCORT;
const A_BREAK_ESCORT = unitActionIndex(IMPROVEMENT_IDS).BREAK_ESCORT;
const A_PROMOTE = unitActionIndex(IMPROVEMENT_IDS).PROMOTE_0;
const A_CONDEMN = unitActionIndex(IMPROVEMENT_IDS).CONDEMN_0;
const A_REMOVE_HERESY = unitActionIndex(IMPROVEMENT_IDS).REMOVE_HERESY;
const A_LAUNCH_INQUISITION = unitActionIndex(IMPROVEMENT_IDS).LAUNCH_INQUISITION;
const A_CONVERT_HEATHEN = unitActionIndex(IMPROVEMENT_IDS).CONVERT_HEATHEN;
const A_PILLAGE = unitActionIndex(IMPROVEMENT_IDS).PILLAGE;
const A_SNIPE = unitActionIndex(IMPROVEMENT_IDS).SNIPE_0;
const A_SNIPE3 = unitActionIndex(IMPROVEMENT_IDS).SNIPE3_0;
const A_SPREAD = unitActionIndex(IMPROVEMENT_IDS).SPREAD_HERE;
const A_BUILD_ROAD = unitActionIndex(IMPROVEMENT_IDS).BUILD_ROAD;
const A_FINISH_DISTRICT = unitActionIndex(IMPROVEMENT_IDS).FINISH_DISTRICT;
const A_BUILD_RAILROAD = unitActionIndex(IMPROVEMENT_IDS).BUILD_RAILROAD;
const A_CLEAN_FALLOUT = unitActionIndex(IMPROVEMENT_IDS).CLEAN_FALLOUT;
const A_REMOVE_IMP = unitActionIndex(IMPROVEMENT_IDS).REMOVE_IMPROVEMENT;
const A_HARVEST = unitActionIndex(IMPROVEMENT_IDS).HARVEST;
const A_WONDER_CHARGE = unitActionIndex(IMPROVEMENT_IDS).WONDER_CHARGE;
const A_ACTIVATE_GP = unitActionIndex(IMPROVEMENT_IDS).ACTIVATE_GP;
import { AGREEMENT_TURNS, ALLIANCE_CIVIC, ALLIANCE_CULTURAL, ALLIANCE_E2_INFLUENCE, ALLIANCE_MILITARY, ALLIANCE_M2_MIL_PROD_PCT, ALLIANCE_QP_ROUTE, ALLIANCE_QP_TURN, ALLIANCE_R2_BOOST_TURNS, ALLIANCE_R3_SCI_PCT, ALLIANCE_C3_CUL_PCT, ALLIANCE_RESEARCH, ALLIANCE_REL3_FAITH_PER_POP, ALLIANCE_RELIGIOUS, ALLIANCE_ROUTE_FROM, ALLIANCE_ROUTE_YKEY, DEAL_ITEMS, DEAL_OFFER_TURNS, DELEGATION_COST, EMBASSY_COST, EMBASSY_CIVIC, CIV_LEADERS, MAX_CITIES_PER_SEAT, OPEN_BORDERS_CIVIC, WAR_MIN_TURNS, PEACE_TREATY_TURNS, PEACE_GOLD_COST, LOYALTY_MAX, LOYALTY_RANGE, LOYALTY_PRESSURE_SCALE, LOYALTY_AMENITY, ERA_SCORE_CONQUER, ERA_SCORE_PANTHEON, ERA_SCORE_RELIGION, GOVERNOR_LOYALTY, CONGRESS_INTERVAL, CONGRESS_MIN_ERA, CONGRESS_PROD_MULT } from '../data/seats';
import { resolveCompetition } from './competition';
import { acceptDeal, dealPhase, setDealOffer } from './deals';
import { grievanceCityTaken, grievanceDenounce, grievanceLastCity, grievanceWarDeclared, grievanceWith } from './grievance';
import { addEraScore, agePressureFactor, goldenBoostBonus, worldEraIndex } from './eras';
import { cityAppealResolver, governorFlag, governorLoyaltyAura, governorMult, governorPhase, governorsOf, governorSum } from './governors';
import { NO_SEAT, civOf, alliancePtsWith, allianceTypeWith, alliedAtLevel, allyTurnsWith, atWarWithAny, borderTurnsFrom, campTiles, citiesOf, civsAtWar, cityStateOfSeat, clearDelegations, delegationWith, setDelegationWith, denounceActive, denounceCasusBelli, emptySeat, friendTurnsWith, isCiv, isCityStateSeat, isTerritorial, prophetsOf, seatOf, seatOfCityState, seatsAllied, seatsFriends, setAllianceTypeWith, setAlliancePtsWith, setAllyTurnsWith, setBorderTurnsFrom, setFriendTurnsWith, setTileOwner, setWar, setWarFormal, setWarGolden, setTreatyTurnsWith, setWarTurnsWith, tileBelongsTo, tileCity, tileClaimed, tileOwnedByCiv, tileSeat, unitSeat, unitsOf, treatyTurnsWith, warClockKey, warTurnsWith, warsOf, hasRouteToSeat , leaderOf, warBanned, cityAtTile, onHomeContinent } from './seats';
import { warWearinessBattle, warWearinessPeace, warWearinessTurn } from './weariness';
import { snipeRing, snipeRing3, spreadFromUnit } from './unitOrders';
import { unitKillEvent, buildingDedications, dedicationEvent, goldenDedication } from './eras';
import { DED_COINAGE, DED_TO_ARMS, DED_STEAM, TO_ARMS_MIL_PROD_MULT, STEAM_WONDER_PROD_MULT } from '../data/seats';
import { WONDER_ERA_INDEX } from '../data/builtWonders';
import { INDUSTRIAL_ERA_INDEX, ERAS } from '../data/techs';

import { gpCityPermOf, gpPermOf } from '../data/greatPeople';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

const CIV_SPACING = 10;



/**
 * The seats a row's WAR HEAD addresses: every OTHER major in ascending seat
 * order, then the whole CITY-STATE roster in ascending id order. Column k
 * means the same kind of thing whoever asks, and the width is fixed for the
 * game — a captured minor keeps its column and the column is simply never
 * legal. The GPU's `war_targets(row)` twin.
 */
export function warTargets(state: GameState, seat: number): number[] {
  const majors = state.seats.map((s) => s.seat).filter((s) => s !== seat);
  const minors: number[] = [];
  for (let i = 0; i < (state.cityStateMax ?? 0); i++) minors.push(seatOfCityState(i));
  return majors.concat(minors);
}

function siteQuality(state: GameState, tile: Tile): number {
  if (isWater(tile) || isImpassable(tile)) return -1;
  if (naturalWonderAt(tile) || tile.feature === 'OASIS' || tile.district) return -1;
  if (tileClaimed(tile)) return -1;
  let q = hasFreshWater(state.map, tile) ? 8 : 0;
  for (const t of tilesWithin(state.map, tile.col, tile.row, 2)) {
    if (isWater(t) || isImpassable(t) || tileClaimed(t)) continue;
    const terrain = TERRAINS[t.terrain]?.yields ?? {};
    const feature = t.feature ? FEATURES[t.feature]?.yields ?? {} : {};
    const res = t.resource ? RESOURCES[t.resource]?.yields ?? {} : {};
    for (const src of [terrain, feature, res]) {
      q += (src.food ?? 0) * 1.2 + (src.production ?? 0) + (src.gold ?? 0) * 0.5;
    }
    if (t.elevation === 'HILLS') q += 0.5;
  }
  return q;
}

export function nextCityName(actor: Seat): string {
  const leader = CIV_LEADERS.find((l) => l.name === actor.name);
  const names = leader?.cityNames ?? [actor.name];
  const n = actor.nextCityId;
  return n < names.length ? names[n] : `${names[0]} ${n + 1}`;
}

export function placeSeats(state: GameState, count?: number): void {
  const land = state.map.tiles.filter((t) => !isWater(t) && !isImpassable(t)).length;
  const target = Math.min(
    CIV_LEADERS.length,
    count ?? Math.max(1, Math.min(3, Math.round(land / 350))),
  );

  const scored = state.map.tiles
    .map((t) => ({ t, q: siteQuality(state, t) }))
    .filter((s) => s.q > 0)
    .sort((a, b) => b.q - a.q || a.t.index - b.t.index);

  const picked: Tile[] = [];
  for (const { t } of scored) {
    if (picked.length >= target) break;
    if (picked.some((p) => hexDistance(p.col, p.row, t.col, t.row) < CIV_SPACING)) continue;
    if (
      state.cityStates.some((cityState) => {
        const c = state.map.tiles[cityState.centerIndex];
        return hexDistance(c.col, c.row, t.col, t.row) < 8;
      })
    ) {
      continue;
    }
    picked.push(t);
  }

  picked.forEach((tile, i) => {
    const leader = CIV_LEADERS[i % CIV_LEADERS.length];
    const actor: Seat = {
      ...emptySeat(state.seats.length),
      name: leader.name,
      color: leader.color,
      aggression: 0.3 + nextRandom(state) * 0.6,
      civ: i % CIV_LEADERS.length,
    };
    foundCityAt(state, actor.seat, tile, actor);  // one founding mutation, every seat
    // Push BEFORE the starting warrior spawns, so spawnUnit's bestMeleeCS
    // chokepoint can find the seat — "strongest melee ever FIELDED" includes
    // the starting army (defense 20 from turn 0; the GPU seeds
    // civ_best_melee from the fixture pools).
    state.seats.push(actor);
    spawnUnit(state, 'WARRIOR', tile.index, actor.seat);
  });
}



/**
 * Rough military strength: 8 per city plus the combat of every unit, rounded.
 *
 * ONE text for every seat. This is our own heuristic, not a Civ 6 rule, so the
 * only thing that matters is that a single number answers for everybody —
 * anything else makes identical empires score differently depending on which
 * seat asks, and the DoW comparison puts the two side by side against a 1.3x
 * bar.
 */
export function seatStrength(state: GameState, seat: number): number {
  let s = citiesOf(state, seat).length * 8;
  for (const u of unitsOf(state, seat)) s += UNITS[u.type]?.combat ?? 0;
  return Math.round(s);
}


function nearestDistance(state: GameState, a: number, bs: number[]): number {
  const at = state.map.tiles[a];
  let best = Infinity;
  for (const b of bs) {
    const bt = state.map.tiles[b];
    best = Math.min(best, hexDistance(at.col, at.row, bt.col, bt.row));
  }
  return best;
}

export function seatProximity(state: GameState, a: number, b: number): number {
  const ca = citiesOf(state, a);
  const cb = citiesOf(state, b);
  if (ca.length === 0 || cb.length === 0) return Infinity;
  let best = Infinity;
  for (const c of ca) {
    best = Math.min(best, nearestDistance(state, c.centerIndex, cb.map((o) => o.centerIndex)));
  }
  return best;
}


export function declareWar(state: GameState, actorSeat: number, seat: number): RuleResult {
  const actor = seatOf(state, actorSeat);
  if (!actor) return no('No such civilization.');
  if (civsAtWar(state, actor.seat, seat)) return no('Already at war.');
  const bound = treatyTurnsWith(state, actor.seat, seat);
  if (bound > 0) return no(`The peace treaty binds for another ${bound} turns.`);
  const denounced = denounceCasusBelli(state, seat, actor.seat);
  // CIV6 (Golden Age War row, DiplomaticActions.xml): the To Arms!
  // dedicant's casus belli requires NO denouncement and sits in the
  // FORMALWAR group, so a golden declaration is a formal war either way.
  const golden = goldenDedication(state, seat, DED_TO_ARMS);
  const formal = denounced || golden;
  // CIV6 (Faces of Peace): the war kind is what the ban reads, so the three
  // pure reads above move AHEAD of the first mutation (`WAR_BAN_ROWS`)
  if (warBanned(state, actor.seat, seat, formal)) {
    return no('This civilization may not declare that war.');
  }
  setWar(state, actor.seat, seat, true);
  setWarTurnsWith(state, actor.seat, seat, 0);
  // CIV6: war cancels every route between the two civs; the Traders return.
  cancelRoutesBetween(state, actor.seat, seat);
  setWarFormal(state, actor.seat, seat, formal);
  setWarGolden(state, actor.seat, seat, golden);
  grievanceWarDeclared(state, seat, actor.seat, formal, golden);
  state.eventLog.push(`War declared on ${actor.name}!`);
  return ok;
}

export function sueForPeace(state: GameState, actorSeat: number, seat: number): RuleResult {
  const actor = seatOf(state, actorSeat);
  if (!actor) return no('No such civilization.');
  if (!civsAtWar(state, actor.seat, seat)) return no('Not at war.');
  const waited = warTurnsWith(state, actor.seat, seat);
  if (waited < WAR_MIN_TURNS) {  // one min-war-turns constant, THIS war's
    return no(`Too soon — they will not talk for another ${WAR_MIN_TURNS - waited} turns.`);
  }
  const cost = PEACE_GOLD_COST(waited);
  if (!state.sandbox) {
    if (!goldAffordable(seatOf(state, seat)!.treasury, cost)) return no(`Peace costs ${cost} gold right now.`);
    seatOf(state, seat)!.treasury -= cost;
  }
  makePeace(state, actor, seat);
  return ok;
}

/**
 * CIV6 (Defensive Pact, Rise and Fall onward): "allies automatically sign a
 * Defensive Pact and will come to each other's aid if a third party attacks
 * either one" — and the converse, "if a member of an alliance declares war on
 * a third party ..., his or her allies will not automatically declare war on
 * the target", is why this runs off the VICTIM's allies alone.
 *
 * The dragged ally accrues no grievances, because it did not choose the war,
 * and its war is FORMAL: an obligation answered is the opposite of the
 * surprise attack that reading carries. An ally already fighting, or allied to
 * the aggressor too, stays where it is.
 */
function defensivePact(state: GameState, aggressor: number, victim: number): void {
  for (const ally of state.seats) {
    if (!isCiv(ally.seat) || ally.cities.length === 0) continue;
    if (ally.seat === aggressor || ally.seat === victim) continue;
    if (!seatsAllied(state, ally.seat, victim)) continue;
    if (seatsAllied(state, ally.seat, aggressor)) continue;
    if (civsAtWar(state, ally.seat, aggressor)) continue;
    setWar(state, ally.seat, aggressor, true);
    setWarTurnsWith(state, ally.seat, aggressor, 0);
    setWarFormal(state, ally.seat, aggressor, true);
    setTreatyTurnsWith(state, ally.seat, aggressor, 0);
    cancelRoutesBetween(state, ally.seat, aggressor);
    setBorderTurnsFrom(state, ally.seat, aggressor, 0);
    setBorderTurnsFrom(state, aggressor, ally.seat, 0);
    clearDelegations(state, ally.seat, aggressor);
    state.eventLog.push(`${ally.name} honours its alliance and joins the war.`);
  }
}

function makePeace(state: GameState, actor: Seat, foe: number): void {
  setWar(state, actor.seat, foe, false);
  setWarFormal(state, actor.seat, foe, false);
  setWarGolden(state, actor.seat, foe, false);
  warWearinessPeace(state, foe, actor.seat);
  setWarTurnsWith(state, actor.seat, foe, 0);
  setTreatyTurnsWith(state, actor.seat, foe, PEACE_TREATY_TURNS);
  actor.peaceTurns = 0;
  const foeSeat = seatOf(state, foe);
  if (foeSeat && 'peaceTurns' in foeSeat) (foeSeat as Seat).peaceTurns = 0;
  for (const cityState of state.cityStates ?? []) {
    for (const [patron, opponent] of [[actor.seat, foe], [foe, actor.seat]] as const) {
      if (civsAtWar(state, cityState.seat, opponent) && isSuzerain(state, cityState, patron)) {
        setWar(state, cityState.seat, opponent, false);
        setWarTurnsWith(state, cityState.seat, opponent, 0);
        setTreatyTurnsWith(state, cityState.seat, opponent, PEACE_TREATY_TURNS);
        warWearinessPeace(state, opponent, seatOfCityState(cityState.id));
        state.eventLog.push(`${cityState.name} makes peace alongside its suzerain.`);
      }
    }
  }
  state.eventLog.push(`Peace with ${actor.name}.`);
}

/** CIV6 (Epic Quest): "Levying units from a city-state costs 50% less Gold." */
export function levyGoldCost(state: GameState, seat: number): number {
  return LEVY_GOLD_COST * (civOf(state, seat) === 'SUMERIA' ? EPIC_QUEST_LEVY_MULT : 1);
}

export function levyUnits(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = state.cityStates.find((c) => c.id === cityStateId);
  if (!cityState) return no('No such city-state.');
  if (cityState.type !== 'militaristic') return no('Only militaristic city-states levy troops.');
  if (!isSuzerain(state, cityState, seat)) return no('You must be suzerain (3+ envoys).');
  const since = state.turn - (cityState.lastLevyTurn ?? -LEVY_COOLDOWN);
  if (since < LEVY_COOLDOWN) {
    return no(`Their troops are spent — ready in ${LEVY_COOLDOWN - since} turns.`);
  }
  if (!state.sandbox) {
    const cost = levyGoldCost(state, seat);
    if (!goldAffordable(seatOf(state, seat)!.treasury, cost)) return no(`Levy costs ${cost} gold.`);
    seatOf(state, seat)!.treasury -= cost;
  }
  const type = state.turn > 60 ? 'SPEARMAN' : 'WARRIOR';
  for (let i = 0; i < LEVY_UNITS; i++) {
    spawnUnit(state, type, cityState.centerIndex, seat);
  }
  cityState.lastLevyTurn = state.turn;
  // CIV6 (Raven King, EFFECT_GRANT_INFLUENCE_TOKEN_LEVY_MILITARY): the levy
  // hands two Envoys back (`LEVY_ROWS`)
  for (const r of getModifiers(state, seat).levy) {
    if (r.envoys) seatOf(state, seat)!.envoysAvailable = (seatOf(state, seat)!.envoysAvailable ?? 0) + r.envoys;
  }
  state.eventLog.push(`${cityState.name} levies ${LEVY_UNITS} ${type === 'SPEARMAN' ? 'spearmen' : 'warriors'} to your cause.`);
  return ok;
}


export function loyaltyDelta(state: GameState, city: City, amenityTierName: string): number {
  const here = state.map.tiles[city.centerIndex];
  const pressureFrom = (cities: City[]): number => {
    let sub = 0;
    for (const c of cities) {
      const t = state.map.tiles[c.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) sub += c.population * (LOYALTY_RANGE + 1 - d);
    }
    return sub;
  };
  let own = 0;
  let foreign = 0;
  for (const s of state.seats) {
    const sub = pressureFrom(s.cities) * agePressureFactor(state, s.seat);
    if (s.seat === city.seat) own += sub;
    // CIV6 (Cultural alliance 1): "Allies do not exert Loyalty pressure on
    // each other."
    else if (!alliedAtLevel(state, city.seat, s.seat, ALLIANCE_CULTURAL, 1)) foreign += sub;
  }
  const pressure =
    own + foreign === 0 ? 0 : (LOYALTY_PRESSURE_SCALE * (own - foreign)) / (own + foreign);
  return pressure + (LOYALTY_AMENITY[amenityTierName] ?? 0) + standingLoyalty(state, city)
    + greatWorkLoyalty(state, city);
}

/** CIV6 (Monument): "+1 Loyalty", and (Government Plaza) "+8 Loyalty to this
 *  city" — the flat per-turn term everything standing in the city adds. A
 *  district pays only once complete and unpillaged, and a dark district takes
 *  its buildings with it. */
export function standingLoyalty(state: GameState, city: City): number {
  const dark = pillagedDistrictTypes(state.map, city.districts);
  let n = cityDistrictSum(state, city, 'loyalty');
  for (const b of city.buildings) {
    const def = BUILDINGS[b];
    if (!def || dark.has(def.district)) continue;
    n += def.loyalty ?? 0;
  }
  // CIV6 (Isibongo, EFFECT_ADJUST_CITY_IDENTITY_PER_TURN): the roster's rows
  // for a garrisoned unit, the second only for a Corps or an Army
  const mods = getModifiers(state, city.seat);
  // CIV6 (Great Turkish Bombard): "Cities not founded by the Ottomans gain
  // ... +4 Loyalty per turn"
  n += notFoundedSum(state, city, 'loyalty');
  // CIV6 (Radio Oranje): "+2 Loyalty per turn in the ORIGIN city of a
  // domestic Trade Route" — once per such route out of this city
  if (mods.domesticRouteLoyalty) {
    let domestic = 0;
    for (const r of seatOf(state, city.seat)?.tradeRoutes ?? []) {
      if (r.from === city.id && r.toSeat === undefined) domestic += 1;
    }
    n += mods.domesticRouteLoyalty * domestic;
  }
  if (mods.garrisonLoyalty.length) {
    const garrison = unitsAt(state, city.centerIndex).find(
      (u) => u.seat === city.seat && unitDomain(u.type) === 'military',
    );
    if (garrison) {
      for (const r of mods.garrisonLoyalty) {
        if (!r.formation || (garrison.formation ?? 0) > 0) n += r.amount;
      }
    }
  }
  // CIV6 (Automated Workforce): "-5 Loyalty per turn in your cities."
  return n + governorLoyaltyAura(state, city) + mods.loyaltyAll;
}

/** CIV6 (Audience Chamber): "-2 Loyalty in Cities without Governors." The
 *  building stands in ONE city; the clause reaches every city its SEAT holds,
 *  so it is summed over the seat and paid to whichever city has no governor. */
export function ungovernedLoyalty(state: GameState, seat: number): number {
  return seatBuildingSum(state, seat, 'loyaltyWithoutGovernor');
}

/**
 * Apply a turn of loyalty to `city` (called from endTurn with the stats it
 * already computed). Returns true when the city has hit 0 and must flip.
 */
/** CIV6 (Statue of Liberty): "All your cities within 6 tiles are always 100%
 *  Loyal." Measured from the WONDER TILE, like every other wonder aura. */
function wonderLoyaltyAura(state: GameState, city: City): boolean {
  const center = state.map.tiles[city.centerIndex];
  for (const w of seatWonders(state, city.seat)) {
    const range = w.def.effects?.loyaltyAura ?? 0;
    if (!range) continue;
    const t = state.map.tiles[w.tileIndex];
    if (hexDistance(t.col, t.row, center.col, center.row) <= range) return true;
  }
  return false;
}

export function applyLoyalty(state: GameState, city: City, amenityTierName: string, hasGovernor = false): boolean {
  const govBonus = hasGovernor ? GOVERNOR_LOYALTY : ungovernedLoyalty(state, city.seat);
  if (!state.seats.some((s) => s.seat !== city.seat && s.cities.length > 0)) return false;
  // CIV6 (Mediterranean Colonies): "Coastal cities founded by Phoenicia and
  // located on the same continent as the Phoenician Capital are 100% Loyal."
  const phoen = getModifiers(state, city.seat).coastalHomeLoyal
    && isCoastalLand(state.map, state.map.tiles[city.centerIndex])
    && onHomeContinent(state, city.seat, city.centerIndex);
  if (city.isCapital || wonderLoyaltyAura(state, city) || phoen) {
    city.loyalty = LOYALTY_MAX;
    return false;
  }
  const next = (city.loyalty ?? LOYALTY_MAX) + loyaltyDelta(state, city, amenityTierName) + govBonus
    + gpCityPermOf(city, 'loyalty')
    + congressLoyaltyDelta(state, city.seat) + emergencyLoyalty(state, city.seat, city.id);
  city.loyalty = Math.max(0, Math.min(LOYALTY_MAX, next));
  return city.loyalty <= 0;
}

export function flipCity(state: GameState, city: City): void {
  const here = state.map.tiles[city.centerIndex];
  let winner: Seat | null = null;
  let best = -1;
  for (const s of state.seats) {
    if (s.seat === city.seat) continue;
    // CIV6 (Cultural alliance 1): an ally exerts nothing, so it never
    // receives the flip either.
    if (alliedAtLevel(state, city.seat, s.seat, ALLIANCE_CULTURAL, 1)) continue;
    let pressure = 0;
    for (const c of s.cities) {
      const t = state.map.tiles[c.centerIndex];
      const d = hexDistance(here.col, here.row, t.col, t.row);
      if (d <= LOYALTY_RANGE) pressure += c.population * (LOYALTY_RANGE + 1 - d);
    }
    if (pressure > best) {
      best = pressure;
      winner = s;
    }
  }
  if (!winner) return;
  transferCity(state, city.seat, winner, city, 'loyalty collapsed');
}

/**
 * PALACE RELOCATION. Real Civ 6 does not leave a civ
 * capital-less when its capital falls — the Palace is rebuilt in the surviving
 * city with the HIGHEST POPULATION (ties → acquisition order, which is this
 * array's own order, so a strict `>` keeps the earliest). Call this on the
 * LOSER's city list immediately after a city leaves it, by capture, loyalty
 * defection or raze; it is a no-op while a capital is still held.
 *
 * each seat's `capitalTile` is deliberately NOT touched: it is the STATIC domination
 * record, and real Civ 6 agrees — the ORIGINAL capital remains the
 * domination target while the relocated Palace carries the capital BONUSES
 * (recapturing the original yields an "Original Capital" plus a "New Capital").
 * Both engines therefore relocate the BUILDING and the isCapital FLAG only.
 */
export function relocatePalace(
  cities: { isCapital: boolean; population: number; buildings: string[] }[],
): void {
  if (cities.length === 0) return; // civ eliminated — nothing to crown
  if (cities.some((c) => c.isCapital)) return; // capital still held
  let best = cities[0];
  for (const c of cities) if (c.population > best.population) best = c;
  best.isCapital = true;
  if (!best.buildings.includes('PALACE')) best.buildings.push('PALACE');
}









/** Queue the district the record names, ON THE TILE THE RECORD NAMES.
 *
 * This engine does NOT choose the plot: WHERE a district goes is a decision,
 * it rides the wire, and this body only re-validates it. Two scans that had to
 * agree forever are one recorded number now. Returns false when the named tile
 * cannot take it. */
export function placeSeatDistrict(
  state: GameState,
  actor: Seat,
  civCity: City,
  id: DistrictId,
  unlocks: Unlocks,
  tileIndex: number,
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (!tile) return false;
  const owns = (t: Tile) => tileBelongsTo(t, civCity);
  if (tile.improvement) return false;
  if (!canPlaceDistrictIn(state, civCity, id, tileIndex, { unlocks, ownsTile: owns }).ok) return false;
  // CIV6: the Spaceport's cost is FLAT — no research scaling, no discount.
  const base = districtCostIn(actor.research, DISTRICTS[id]?.cost ?? DISTRICT_SPECIALTY_COST);
  const cost0 = DISTRICTS[id]?.fixedCost
    ? Math.round(DISTRICTS[id].cost * GAME_SPEED)
    : districtDiscounted(state, actor.seat, id, { unlocks, cities: actor.cities })
      ? Math.floor(base * districtDiscountMult(id))
      : base;
  const cost = districtVariantCost(state, actor.seat, id, cost0);
  tile.district = id;
  tile.districtComplete = false;
  tile.improvement = null;
  // CIV6: a district paves every feature EXCEPT floodplains — the feature
  // stays under the district (GS floods damage districts built on them; the
  // Dam exists for exactly that), and the flood-target pick draws from it.
  tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
  // Placement removes a bonus resource (real Civ 6 rule; canPlaceDistrictIn
  // already refused luxury/strategic).
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
  civCity.districts.push({ type: id, tileIndex });
  commitProduction(state, civCity.seat, civCity, { kind: 'district', district: id, tileIndex, progress: 0, cost });
  return true;
}



/** queue ONE named wonder — the tryQueueWonder body for a single
 * def, shared by the scripted chain above and the driven replay. Re-validates
 * EVERYTHING (unlock, one-per-world, placement): one-per-world is CROSS-SEAT,
 * so a column legal at record time can have been claimed by any civ by apply
 * time — the replay refuses rather than double-building. The capital gate
 * stays OUT: it is the scripted picker's heuristic,
 * and real Civ 6 lets any city raise any unlocked wonder. */
export function placeSeatWonder(state: GameState, actor: Seat, civCity: City, def: BuiltWonderDef): boolean {
  const civ = actor.seat;
  const center = state.map.tiles[civCity.centerIndex];
  {
    if (wonderExists(state, def.id)) return false;
    if (def.requiresTech && !actor.research.techs.includes(def.requiresTech)) return false;
    if (def.requiresCivic && !actor.research.civics.includes(def.requiresCivic)) return false;
    const cands = tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS)
      .filter((t) => canPlaceWonder(state, civCity, def.id, t.index, civ).ok)
      .sort((a, b) => a.index - b.index);
    const tile = cands[0];
    if (!tile) return false;
    tile.builtWonder = def.id;
    tile.builtWonderComplete = false;
    tile.improvement = null;
    tile.feature = tile.feature === 'FLOODPLAINS' ? tile.feature : null;
    if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
    civCity.wonders.push({ id: def.id, tileIndex: tile.index });
    commitProduction(state, civCity.seat, civCity, { kind: 'wonder', wonder: def.id, tileIndex: tile.index, progress: 0 });
    return true;
  }
}

export function queueSeatProject(state: GameState, civCity: City, projId: string): boolean {
  if (!availableProjects(state, civCity).some((p) => p.id === projId)) return false;
  return queueProject(state, civCity.id, projId, civCity.seat).ok;
}










/**
 * The WORLD CONGRESS trigger: at every CONGRESS_INTERVAL turn, once ANY civ
 * has reached CONGRESS_MIN_ERA (Medieval), one Regular Session runs — the
 * mechanics and their sources live at `congressSession` and the catalog
 * (CONGRESS_RESOLUTIONS). The slate keys on the MAX era across civs, the
 * wiki's "topics relevant for the current world". Zero-draw: a pure function
 * of state. Called from endTurn right after eraBoundary, the same position
 * the GPU mirrors.
 */
/** What a voter knows that `congress` cannot look up itself: the live
 *  adoption (which reads the standing slate back) and the envoy spread. */
function congressVoter(state: GameState, seat: number): CongressVoterCtx {
  const sx = seatOf(state, seat)!;
  const adoption = computeAdoption(sx.research, wonderExtraSlots(state, seat), congressPolicyBlocked(state), inDarkAge(state, seat), sx.government.held);
  const policies: number[] = [];
  for (const id of adoption.policies) {
    const i = id ? POLICY_LIST.findIndex((card) => card.id === id) : -1;
    if (i >= 0) policies.push(i);
  }
  policies.sort((a, b) => a - b);
  const envoysByType = CITY_STATE_TYPES.map(() => 0);
  for (const cityState of state.cityStates ?? []) {
    const t = CITY_STATE_TYPES.indexOf(cityState.type);
    if (t >= 0) envoysByType[t] += envoysOf(cityState, seat);
  }
  const government = adoption.government
    ? Math.max(0, GOVERNMENT_LIST.findIndex((g) => g.id === adoption.government))
    : 0;
  return { government, policies, envoysByType };
}


/** A member's war on the emergency's target. CIV6: "this action won't accrue
 *  Grievances because it is considered an effort of the international
 *  community", and an Emergency "can override the war status from previous
 *  Emergencies" — so no grievances, and no treaty to respect. */
function emergencyWar(state: GameState, member: number, target: number): void {
  if (member === target || civsAtWar(state, member, target)) return;
  setWar(state, member, target, true);
  setWarTurnsWith(state, member, target, 0);
  setTreatyTurnsWith(state, member, target, 0);
  cancelRoutesBetween(state, member, target);
}

/** The lowest AFFECTED seat that still lives and can pay the sponsorship.
 *  CIV6: "All affected civilizations have the opportunity to do so, although
 *  only one sponsor is required." */
function emergencySponsor(state: GameState, e: Emergency): number {
  for (const c of [...e.affected].sort((a, b) => a - b)) {
    const sx = state.seats[c];
    if (!sx || c === e.target || sx.cities.length === 0) continue;
    if ((sx.diplomaticFavor ?? 0) >= SPECIAL_SESSION_COST) return c;
  }
  return -1;
}

/** ONE Special Session: every living seat votes for or against, the target
 *  never joins its own, and the yes side carries a tie the way outcome A does
 *  in a Regular Session. The losing side's favor comes back whole, the same
 *  refund a losing outcome takes there. */
function holdSpecialSession(state: GameState, e: Emergency,
                            recorded: readonly (CongressVote | null)[]): boolean {
  state.lastSessionTurn = state.turn;
  const spent = state.seats.map(() => 0);
  const cast: { seat: number; yes: boolean; weight: number }[] = [];
  for (let c = 0; c < state.seats.length; c++) {
    const sx = state.seats[c];
    if (sx.cities.length === 0) continue;
    const v = recorded[c]?.[CONGRESS_SPECIAL_SLOT];
    const yes = c !== e.target && (v ? Math.trunc(v[0]) === 0 : true);
    const bought = buyVotes(sx, v ? Math.max(0, Math.trunc(v[2])) : 0);
    spent[c] = bought.spent;
    cast.push({ seat: c, yes, weight: 1 + bought.extra });
  }
  if (cast.length === 0) return false;
  let ay = 0, an = 0;
  for (const v of cast) { if (v.yes) ay += v.weight; else an += v.weight; }
  const passed = ay >= an;
  for (const v of cast) {
    if (v.yes !== passed) state.seats[v.seat].diplomaticFavor = (state.seats[v.seat].diplomaticFavor ?? 0) + spent[v.seat];
  }
  if (!passed) {
    state.eventLog.push(`The ${emergencyName(e.kind)} against ${state.seats[e.target]?.name ?? 'them'} was voted down.`);
    return false;
  }
  e.phase = EMG_RUNNING;
  e.members = cast.filter((v) => v.yes && v.seat !== e.target).map((v) => v.seat);
  e.act = state.turn + (EMERGENCIES[e.kind]?.turns ?? 30);
  for (const m of e.members) emergencyWar(state, m, e.target);
  state.eventLog.push(`${emergencyName(e.kind)} declared against ${state.seats[e.target]?.name ?? 'them'}.`);
  return true;
}

/** Sponsor what can be sponsored, then hold what has waited its turn. */
function specialSessions(state: GameState, recorded: readonly (CongressVote | null)[]): void {
  for (const e of emergencies(state)) {
    if (e.phase === EMG_CALLED) {
      if (state.turn >= e.act && !holdSpecialSession(state, e, recorded)) e.phase = -1;
      continue;
    }
    if (e.phase !== EMG_PENDING) continue;
    // "as long as the previous session - Regular or Special - took place 15
    // turns or prior"
    if (state.lastSessionTurn !== undefined
        && state.turn - state.lastSessionTurn < SPECIAL_SESSION_GAP) continue;
    const sponsor = emergencySponsor(state, e);
    if (sponsor < 0) continue;
    state.seats[sponsor].diplomaticFavor = (state.seats[sponsor].diplomaticFavor ?? 0) - SPECIAL_SESSION_COST;
    e.phase = EMG_CALLED;
    e.act = state.turn + 1;   // "the Special Session occurs after the next turn"
  }
  state.emergencies = emergencies(state).filter((e) => e.phase >= 0);
}

/** CIV6: the goal is the contested city LIBERATED — here, simply no longer
 *  the target's. Reaching it ends the emergency at once; the deadline hands
 *  the win to the target. Every member is paid alike, "regardless of who
 *  delivers the killing blow". */
function resolveEmergencies(state: GameState): void {
  const keep: Emergency[] = [];
  for (const e of emergencies(state)) {
    if (e.phase !== EMG_RUNNING) { keep.push(e); continue; }
    const held = state.seats[e.target]?.cities.some((c) => c.id === e.city) ?? false;
    if (held && state.turn < e.act) { keep.push(e); continue; }
    payEmergency(state, e, !held);
  }
  state.emergencies = keep;
}

function payEmergency(state: GameState, e: Emergency, membersWon: boolean): void {
  const bump = (arr: number[] | undefined, at: number): number[] => {
    const out = arr ? [...arr] : [];
    while (out.length <= at) out.push(0);
    out[at] += 1;
    return out;
  };
  if (membersWon) {
    for (const m of e.members) {
      const sx = state.seats[m];
      if (!sx) continue;
      // CIV6 (Faces of Peace): "+100% Diplomatic Favor from successfully
      // completing an Emergency" — as a MEMBER of it (`EMERGENCY_FAVOR_ROWS`)
      const pct = getModifiers(state, m).emergencyFavorPct;
      sx.diplomaticFavor = (sx.diplomaticFavor ?? 0)
        + Math.floor((EMERGENCY_MEMBER_FAVOR * (100 + pct)) / 100);
      if (e.kind === EMERGENCY_CITY_STATE) sx.emgEnvoyGold = (sx.emgEnvoyGold ?? 0) + 1;
      else sx.emgHeal = bump(sx.emgHeal, e.target);
    }
  } else {
    const t = state.seats[e.target];
    if (t) {
      t.diplomaticFavor = (t.diplomaticFavor ?? 0) + EMERGENCY_TARGET_FAVOR;
      if (e.kind === EMERGENCY_CITY_STATE) t.emgRouteGold = (t.emgRouteGold ?? 0) + 1;
      else for (const m of e.members) t.emgStrike = bump(t.emgStrike, m);
    }
  }
  state.eventLog.push(
    `${emergencyName(e.kind)}: ${membersWon ? 'the members' : state.seats[e.target]?.name ?? 'the target'} prevailed.`);
}

export function worldCongress(state: GameState): void {
  const recorded = state.seats.map((sx) => sx.congressVote ?? null);
  for (const sx of state.seats) sx.congressVote = undefined;  // an intent is for THIS turn
  const worldEra = worldEraIndex(state);
  // A Special Session may sit on ANY turn once the Congress is open; a running
  // emergency is settled whether one sat or not.
  if (worldEra >= CONGRESS_MIN_ERA) specialSessions(state, recorded);
  resolveEmergencies(state);
  resolveCompetition(state);
  if (state.turn % CONGRESS_INTERVAL !== 0 || worldEra < CONGRESS_MIN_ERA) return;
  congressSession(state, worldEra, recorded, state.seats.map((sx) => congressVoter(state, sx.seat)));
  state.lastSessionTurn = state.turn;
  congressCancelBannedIntl(state);
}







export function transferCity(
  state: GameState,
  fromSeat: number,
  to: Seat,
  civCity: City,
  why: string,
  plunder = why === 'conquered',
): boolean {
  // The losing seat's city list — one lookup, because every seat holds its own.
  const loser = seatOf(state, fromSeat);
  if (why === 'conquered') {
    // CIV6 (Warlord's Throne): "Capturing an enemy City grants 20% bonus
    // Production in all Cities for 5 turns" — the window opens on the CAPTURE,
    // so a city taken only to be razed opens it too.
    const _cq = seatBuildingSum(state, to.seat, 'conquestProdTurns');
    if (_cq > 0) to.conquestProdTurns = _cq;
    grievanceCityTaken(state, to.seat, fromSeat, to.cities.length >= MAX_CITIES_PER_SEAT);
    // "Captured the final city of a civilization: 150 (all remaining civs
    // gain Grievances against you)" — the loser's list is about to lose this
    // one, so one city left IS the last.
    if ((loser?.cities.length ?? 0) <= 1) grievanceLastCity(state, to.seat);
  }
  if (loser) {
    loser.cities = loser.cities.filter((c) => c.id !== civCity.id);
    relocatePalace(loser.cities);
    if (loser.tradeRoutes) loser.tradeRoutes = loser.tradeRoutes.filter((x) => x.from !== civCity.id && x.to !== civCity.id);
  }
  if (why === 'conquered' && to.cities.length >= MAX_CITIES_PER_SEAT) {
    for (const t of state.map.tiles) {
      if (tileBelongsTo(t, civCity)) setTileOwner(t, NO_SEAT);
    }
    const centre = state.map.tiles[civCity.centerIndex];
    centre.district = null;
    centre.districtComplete = false;
    state.eventLog.push(`${civCity.name} razed — ${to.name} cannot govern more cities.`);
    return false;
  }
  for (const t of state.map.tiles) {
    if (tileBelongsTo(t, civCity)) {
      setTileOwner(t, to.seat, to.nextCityId); // the civCity pushed below
    }
  }
  // Conquest keeps infrastructure: the city carries its districts, its
  // buildings MINUS PALACE, and its wonders. ANCIENT_WALLS is kept with
  // outerHp 0 (it heals back).
  //
  // The districts are DERIVED from the tiles that just re-owned (complete ones
  // only), never copied from the loser's `districts` array: a seat's array and
  // its tile registry can disagree, and the GPU twin derives from tile
  // ownership + district_complete. An INCOMPLETE district stays paved-but-dead,
  // because `availableBuildings` keys on a district merely being present and
  // would otherwise offer a building the GPU can never queue.
  const newId = to.nextCityId;
  const keptDistricts: { type: DistrictId; tileIndex: number }[] = [];
  for (const t of state.map.tiles) {
    if (tileBelongsTo(t, { seat: to.seat, id: newId }) && t.district !== null && t.districtComplete) {
      keptDistricts.push({ type: t.district, tileIndex: t.index });
    }
  }
  const keptBuildings = civCity.buildings.filter((b) => b !== 'PALACE');
  const flipped: City = {
    id: to.nextCityId++,
    name: civCity.name,
    seat: to.seat,
    centerIndex: civCity.centerIndex,
    // CIV6 (Great Turkish Bombard): "Conquered cities do not lose
    // Population" — `keepPct` of what stood, over the usual quarter lost
    population: Math.max(1, Math.floor(civCity.population * Math.max(0.75, getModifiers(state, to.seat).conquestKeepPct / 100))),
    foodBox: 0,
    cultureBox: 0,
    tilesAcquired: civCity.tilesAcquired,
    focus: 'balanced',
    queue: [],
    isCapital: false,
    // the flip does not make this city any less the FIRST city of whoever
    // founded it — that is the whole point of the occupied-capital penalty
    origCapitalSeat: civCity.origCapitalSeat ?? -1,
    founderSeat: civCity.founderSeat ?? -1,
    buildings: keptBuildings,
    districts: keptDistricts,
    wonders: civCity.wonders.filter((w) => tileBelongsTo(state.map.tiles[w.tileIndex], { seat: to.seat, id: newId })).map((w) => ({ ...w })),
    // GREAT WORKS AND RELICS RIDE WITH THE CITY. Real Civ 6: the
    // victor gains control of the Great Works held in a captured city's
    // buildings/districts/wonders — and `keptBuildings` above already carries
    // the Amphitheater/Museum/Temple slots that hold them. This literal
    // enumerates the new city's fields BY HAND, so every field on `City` has
    // to be listed here too. One that is missed is destroyed silently on every
    // flip — no error, just a value that vanishes.
    // Religion travels with the city here too (the GPU twin keeps it).
    religionPressure: civCity.religionPressure ? [...civCity.religionPressure] : undefined,
    followedReligion: civCity.followedReligion,
    greatWorksWriting: civCity.greatWorksWriting,
    greatWorksArt: civCity.greatWorksArt,
    greatWorksMusic: civCity.greatWorksMusic,
    relics: civCity.relics,
    // the laser stations ride the flip with the Spaceport that holds them —
    // and go on drawing Power from whoever owns the city now
    laserStations: civCity.laserStations,
    powered: false, // the new owner's own turn re-resolves the grid
    artifacts: civCity.artifacts, // artifacts ride the flip too
    // ...and so does every museum's PROVENANCE, or a captured themed museum
    // would keep its works and lose the bonus that reads them.
    artifactEras: civCity.artifactEras ? [...civCity.artifactEras] : undefined,
    artifactSeats: civCity.artifactSeats ? [...civCity.artifactSeats] : undefined,
    gwArtType: civCity.gwArtType ? [...civCity.gwArtType] : undefined,
    gwArtArtist: civCity.gwArtArtist ? [...civCity.gwArtArtist] : undefined,
    hp: Math.round(CITY_MAX_HP / 2),
    foundedTurn: state.turn,
  };
  // walls kept, outer pool 0 — a captured city stands behind a breach
  if (keptBuildings.some((b) => BUILDINGS[b]?.walls)) flipped.outerHp = 0;
  to.cities.push(flipped);
  if (why === 'conquered') allRoadsLeadToRome(state, to.seat, civCity.centerIndex);
  // CIV6 (Military Emergency): "The Target has conquered the city of another
  // nation; it must be Liberated!" The seat that LOST it is the affected one.
  if (why === 'conquered' && isCiv(fromSeat) && isCiv(to.seat)) {
    raiseEmergency(state, EMERGENCY_MILITARY, to.seat, flipped.id, [fromSeat]);
  }
  addEraScore(state, to.seat, ERA_SCORE_CONQUER);
  revealAround(state, to.seat, civCity.centerIndex, 3);
  // Real Civ 6 pays the captor gold for taking a city. One rate, every captor.
  if (plunder) to.treasury += 40;
  state.eventLog.push(`${civCity.name} defected to ${to.name}! (${why})`);
  if (loser && loser.cities.length === 0) {
    setWar(state, loser.seat, to.seat, false);
    warWearinessPeace(state, to.seat, loser.seat);
    state.eventLog.push(`${loser.name} has been eliminated.`);
  }
  return true;
}

/**
 * machine-check (env-gated by CIV6_RC_REGISTRY_CHECK; the TS twin of the
 * GPU engine's _check_rc_registry_invariant). Every district tile and wonder
 * tile an civCity lists must register BACK to that civCity — its `Tile.ownerCity` equals
 * `civCity.id` (a district sits on a tile owned by THAT city, the placement rule
 * tryQueueDistrict/tryQueueWonder now enforce) — and that tile must
 * be owned by this seat's civ. A tile registered to a SIBLING civCity (the seed
 * 9118 latent) throws. NO always-on cost: only called when the env flag is set.
 */
export function assertCityRegistryCoherent(state: GameState): void {
  for (const actor of state.seats) {
    const civ = actor.seat;
    for (const civCity of actor.cities) {
      const check = (kind: string, tileIndex: number, type: string) => {
        const t = state.map.tiles[tileIndex];
        if (!tileBelongsTo(t, civCity) || !tileOwnedByCiv(t, civ)) {
          throw new Error(
            `registry incoherence: seat=${actor.seat} civCity.id=${civCity.id} ${kind}=${type} ` +
              `tile=${tileIndex} ownerSeat=${tileSeat(t)} ownerCity=${tileCity(t)} turn=${state.turn}`,
          );
        }
      };
      for (const d of civCity.districts) check('district', d.tileIndex, d.type);
      for (const w of civCity.wonders ?? []) check('wonder', w.tileIndex, w.id);
    }
  }
}




/** apply ONE recorded turn for a driven seat. Touches no policy — if this
 * ever needed to consult the ladder, the file would not be a complete record of
 * the decisions and TS could not reproduce a GPU trajectory from it. Mirrors
 * `apply_seat_actions`: the idle gate, then the same cost/progress semantics. */
export function applySeatActionRecord(state: GameState, actor: Seat, rec: SeatActionRecord): void {
  const { NB, NU, buildings, units, wonders, projects, wonderLo, projectLo, formLo, promoteLo } = prodLayout();
  // the recorder ran at B=1 and `tolist()` keeps the batch dim: production
  // arrives as [[c0..]], tech/civic as [v]. Unwrap defensively — the same fix
  // apply_turn needed on the GPU side, and the second driven-parity red: every
  // comparison against a LIST is false, so nothing ever queued and the TS
  // queues flatlined while the economies agreed.
  // v2: production is [[centreTile, col], ...] — the city
  // axis keyed by CENTRE TILE, because slot order and founding order diverge
  // under compaction/capture. Each engine resolves the centre to ITS city.
  const prodPairs = rec.production;
  const techCol = Array.isArray(rec.tech) ? (rec.tech as unknown as number[])[0] : rec.tech;
  const civicCol = Array.isArray(rec.civic) ? (rec.civic as unknown as number[])[0] : rec.civic;
  // The RESEARCH picks re-validate against AVAILABILITY: real Civ 6 offers no
  // locked tech, the mask never names one, and an unchecked arm here would let
  // a stale record start a tech on ONE engine. A pick may SWITCH the seat off
  // an item mid-research — selectResearch parks the pool — and a re-stated
  // pick is its no-op.
  if (techCol !== null && techCol !== undefined && techCol >= 0) {
    const t = Object.keys(TECHS)[techCol];
    if (t && availableTechsIn(actor.research).some((d) => d.id === t)) selectResearch(actor.research, t);
  }
  if (civicCol !== null && civicCol !== undefined && civicCol >= 0) {
    const c = Object.keys(CIVICS)[civicCol];
    if (c && availableCivicsIn(actor.research).some((d) => d.id === c)) selectResearch(actor.research, c, true);
  }
  // the WAR verb: the recorded declare/peace applies HERE — before the
  // walkers, the exact position the GPU's pre-step war head uses, so a
  // declare turns THIS turn's walkers hostile on both engines. The engine
  // re-validates: peace pays the seat 0's exact gold schedule or refuses
  // (the scripted roll's own body, minus the roll — that lives in the
  // ladder now, rolled from the DRIVER's policy stream, so neither engine's
  // rule stream moves).
  // The ENVOY verb: the recorded picks land here, ALIVE + met + availability
  // re-validated. BANK ONLY — conversion is an eager RULE at the CS phase for
  // every seat, so a decide-time pick can never exceed the bank. A razed
  // city-state takes no envoy (real Civ 6, and the GPU mask's own term).
  for (const cityStateId of rec.envoys ?? []) {
    // a razed/captured city-state leaves the roster entirely, so existence IS
    // the alive test — its city lives in the CityState's own flat fields,
    // never in the seat-idiom `cities` list, which stays empty for a minor.
    const cityState = cityStateById(state, cityStateId);
    if (!cityState) continue;
    if (!hasMet(cityState, actor.seat)) continue;
    if ((actor.envoysAvailable ?? 0) <= 0) continue;
    actor.envoysAvailable = (actor.envoysAvailable ?? 0) - 1;
    const first = envoysOf(cityState, actor.seat) === 0
      && getModifiers(state, actor.seat).firstEnvoyDouble;
    addEnvoys(state, cityState, actor.seat, (first ? 2 : 1) + containmentBonus(state, cityState, actor));
  }
  const warCol = rec.war;
  if (warCol !== null && warCol !== undefined && warCol >= 0) {
    const targets = warTargets(state, actor.seat);
    const nTgt = targets.length;   // the head is [declare per target, sue per target]
    const declaring = warCol < nTgt;
    const foe = targets[declaring ? warCol : warCol - nTgt];
    if (foe !== undefined && isCityStateSeat(foe)) {
      // A MINOR is a seat of its own: the two verbs carry the whole rule
      // (met, the treaty term, the ten-turn cooldown, the suzerain block),
      // and this arm only names which one the column asked for.
      const csId = cityStateOfSeat(foe);
      if (declaring) declareWarOnCityState(state, csId, actor.seat);
      else sueForPeaceWithCityState(state, csId, actor.seat);
    } else if (foe !== undefined && actor.seat !== foe) {
      if (declaring && !civsAtWar(state, actor.seat, foe) && !seatsAllied(state, actor.seat, foe)
          // CIV6 (Declaring Friendship): Declared Friends "cannot undertake
          // hostile actions (such as Denouncing or going to war) against each
          // other".
          && !seatsFriends(state, actor.seat, foe)
          && treatyTurnsWith(state, actor.seat, foe) === 0) {
        setWar(state, actor.seat, foe, true);
        setWarTurnsWith(state, actor.seat, foe, 0);
        // CIV6 (Trade Route): "When war is declared, any existing Trade Routes
        // between the two civilizations are cancelled, and the Traders
        // servicing them are immediately recalled to their origin cities."
        cancelRoutesBetween(state, actor.seat, foe);
        // An OPEN BORDERS grant cannot outlive the peace it was signed in;
        // war opens the border it was lifting.
        setBorderTurnsFrom(state, actor.seat, foe, 0);
        setBorderTurnsFrom(state, foe, actor.seat, 0);
        // CIV6: "when war is declared, delegations and ambassadors are kicked
        // out" — the pair loses both halves, not the declarer's.
        clearDelegations(state, actor.seat, foe);
        const denounced = denounceCasusBelli(state, actor.seat, foe);
        // CIV6 (Golden Age War row): NO denouncement required, FORMALWAR group.
        const golden = goldenDedication(state, actor.seat, DED_TO_ARMS);
        const formal = denounced || golden;
        setWarFormal(state, actor.seat, foe, formal);
        setWarGolden(state, actor.seat, foe, golden);
        grievanceWarDeclared(state, actor.seat, foe, formal, golden);
        state.eventLog.push(`${actor.name} declares ${formal ? 'a formal' : 'a surprise'} war on ${seatOf(state, foe)?.name ?? 'you'}!`);
        defensivePact(state, actor.seat, foe);
      } else if (!declaring && civsAtWar(state, actor.seat, foe)) {
        const waited = warTurnsWith(state, actor.seat, foe);
        const cost = PEACE_GOLD_COST(waited);
        if (waited >= WAR_MIN_TURNS && goldAffordable(actor.treasury ?? 0, cost)) {
          actor.treasury = (actor.treasury ?? 0) - cost;
          makePeace(state, actor, foe);
        }
      }
    }
  }
  // CITIZEN ASSIGNMENT, in the GPU's arm order: the pins, then the plot
  // flips. Both re-validate — a pin needs a living city of this seat, a flip
  // needs the plot to be this seat's ground.
  for (const [centre, di, n] of rec.specialists ?? []) {
    const pinCity = actor.cities.find((c) => c.centerIndex === centre);
    if (!pinCity || di < 0 || di >= PLACEABLE_DISTRICTS.length) continue;
    (pinCity.specialistPref ??= PLACEABLE_DISTRICTS.map(() => -1))[di] = Math.max(-1, Math.trunc(n));
  }
  for (const tileIndex of rec.lockTiles ?? []) {
    const plot = state.map.tiles[tileIndex];
    if (plot && tileSeat(plot) === actor.seat) plot.locked = !plot.locked;
  }
  // The WORLD CONGRESS ballot is banked, not spent: the session runs at the
  // turn tail, after every seat has had its phase.
  if (rec.vote) actor.congressVote = rec.vote;
  if (rec.gpPass !== undefined && rec.gpPass >= 0) passGreatPerson(state, actor.seat, rec.gpPass);
  for (const [centre, aCol, aTile] of prodPairs) {
    const civCity = actor.cities.find((c) => c.centerIndex === centre);
    if (!civCity) continue;                          // centre not this engine's city (drifted state)
    const a = aCol;
    // A city takes another order while its queue has ROOM — the head is
    // merely the item being worked, and the rest wait behind it.
    if (a < 0) continue;
    if (a >= promoteLo) {
      // PROMOTE: entry k+1 moves to the head, the rest closing up behind it.
      // Every entry keeps its own progress, so the move spends nothing.
      const k = a - promoteLo + 1;
      if (k < civCity.queue.length) civCity.queue.unshift(...civCity.queue.splice(k, 1));
      continue;
    }
    if (civCity.queue.length >= PRODUCTION_QUEUE_MAX) continue;
    if (a < NB) {
      const id = buildings[a];
      const def = id ? BUILDINGS[id] : undefined;
      // Re-validate AVAILABILITY at apply, exactly as the unit arm does with
      // trainableUnits: the GPU applier refuses what _seat_buildable refuses,
      // and the walls clause can flip mid-turn — this turn's city strikes
      // damage the defenses after the mask that justified the pick.
      if (def && availableBuildings(state, civCity).some((b) => b.id === id)) commitProduction(state, civCity.seat, civCity, { kind: 'building', building: id, progress: 0 });
    } else if (a === NB) {
      if (state.sandbox || civCity.population >= 2) {
        commitProduction(state, civCity.seat, civCity, { kind: 'settler', progress: 0, cost: settlerCost(state, actor.seat) });
      }
    } else if (a >= NB + 2 && a < NB + 2 + NU) {
      const id = units[a - NB - 2];
      // Re-validate TRAINABILITY at apply, not just at mask: the record is
      // replayed a phase after the mask that justified it, and the strategic
      // resource (a pastured HORSE, pillaged since) or slot rule may have
      // moved — the GPU applier refuses what trainableUnits refuses.
      if (id && UNITS[id] && trainableUnits(state, actor.seat, civCity).some((d) => d.id === id)) {
        // The BUILDER prices off the ONE escalator, exactly as
        // the scripted branch and the GPU's queue arm both do — omitting the
        // cost here fell back to the base price and locked r1c1's builder at 30
        // where the GPU locked 32 t61, the qCost family).
        if (id === 'BUILDER') commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0, cost: builderCost(state, actor.seat) });
        // the TRADER prices off ITS escalator the same way (game progress)
        else if (id === 'TRADER') commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0, cost: traderCost(state, actor.seat) });
        else commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0 });
      }
    }
    else if (a >= wonderLo && a < wonderLo + wonders.length) {
      const wd = BUILT_WONDERS[wonders[a - wonderLo]];
      if (wd) placeSeatWonder(state, actor, civCity, wd);
    } else if (a >= projectLo && a < projectLo + projects.length) {
      queueSeatProject(state, civCity, projects[a - projectLo]);
    } else if (a >= formLo && a < formLo + 2 * NU) {
      // CIV6 (Military Academy, Seaport): the building lets the city train a
      // Corps or Army (a Fleet or Armada at sea) DIRECTLY once the
      // formation's own civic is in — 150% / 225% of the unit's cost, 25%
      // off for the building that enables the order. Every clause here is
      // re-validated at apply, like the plain unit arm above it.
      const tier = a < formLo + NU ? 1 : 2;
      const id = units[(a - formLo) % NU];
      const def = id ? UNITS[id] : undefined;
      // CIV6 (EFFECT_ADJUST_CORPS_ARMY_PREREQ): the roster's own civic for
      // this TIER and domain, the catalog's otherwise
      const fRow = def && getModifiers(state, actor.seat).formations.find(
        (r) => r.tier === tier && r.naval === !!def.naval && r.civic !== undefined);
      const civic = fRow?.civic ?? FORMATION_CIVIC[tier];
      if (def && def.combat > 0 && unitDomain(id) === 'military' && !formationBanned(id)
          && civCity.buildings.includes(def.naval ? FORMATION_TRAIN_BUILDING.naval : FORMATION_TRAIN_BUILDING.land)
          && (!civic || isCivicComplete(state, civic, actor.seat))
          && trainableUnits(state, actor.seat, civCity).some((d) => d.id === id)) {
        commitProduction(state, civCity.seat, civCity, {
          kind: 'unit', unit: id, formation: tier, progress: 0,
          cost: Math.round(def.cost * FORMATION_COST_MULT[tier] * FORMATION_TRAIN_DISCOUNT),
        });
      }
    } else if (a >= NB + 2 + NU) {
      // DISTRICT: the file names the TYPE **and the TILE**. Which plot a
      // district takes is a decision, not derived state, so it is recorded and
      // re-validated rather than re-derived by a scan each engine owns.
      const si = a - (NB + 2 + NU);
      const d = SCAFFOLD_DISTRICTS[si];
      if (d) placeSeatDistrict(state, actor, civCity, d.id, computeUnlocks(state, actor.seat), aTile ?? -1);
    }
  }
}

/** replay this seat's recorded UNIT orders.
 *
 * `rec.units` is one entry per STEP, because a unit's order is a direction
 * SEQUENCE — the GPU driver re-observes between steps (the observation is 1-hop)
 * and records what it chose each time, so a faithful replay walks the same steps
 * in the same order.
 *
 * Row j addresses the seat's j-th unit in SPAWN order, which is what
 * `_seat_slot_map` ranks by on the GPU side. The seat's unit list filters `state.units`,
 * which preserves spawn order, so the two agree — but this is an ASSUMPTION the
 * gate has to hold, not a guarantee this function can enforce: if it ever breaks,
 * every seat's orders land on the wrong units and the failure looks like chaos
 * rather than an ordering bug.
 *
 * Columns are the shared unit-action enum: 0-5 step to that neighbour, 6-11
 * attack there, 12 hold. The builder verbs (CHOP/REPAIR/improvements/PILLAGE)
 * are NOT replayed here yet — the ladder's peace verb never emits them, so
 * recording one would mean the policy changed and this needs extending with it.
 */
export function applySeatUnitOrders(state: GameState, actor: Seat, steps: number[][]): void {
  if (!steps || steps.length === 0) return;
  for (const step of steps) {
    const row = Array.isArray(step[0]) ? (step[0] as unknown as number[]) : step;
    const units = unitsOf(state, actor.seat);
    units.forEach((unit, j) => {
      const a = row[j] ?? -1;
      if (a < 0 || a === 12) return;            // no instruction, or HOLD
      // died, or spent its turn. A SPY has no movement AT ALL (moves 0), and
      // its verbs cost none — the GPU's applier gates on `present` alone, so
      // the spent gate must not silence the one chassis that never moves.
      if (!state.units.includes(unit)) return;
      if (unit.movesLeft <= 0 && !isSpy(unit.type)) return;
      const here = state.map.tiles[unit.tileIndex];
      if (a === A_FOUND_CITY) {
        if (unit.type !== 'SETTLER') return;
        const res = foundCity(state, unit.tileIndex, actor.seat);
        if (res.ok && res.city) state.eventLog.push(`${actor.name} founded ${res.city.name}.`);
        return;
      }
      if (a === A_EXCAVATE) {
        // Both verbs RE-VALIDATE inside their rule body, so a row recorded
        // before a mid-turn death or a filled museum slot refuses rather
        // than substituting.
        if (archaeologistExcavate(state, unit.id, actor.seat).ok) unit.movesLeft = 0;
        return;
      }
      if (a === A_PARK) {
        naturalistPark(state, unit.id, actor.seat);
        return;
      }
      if (a === A_PERFORM) {
        performConcert(state, unit.id, actor.seat);
        return;
      }
      if (a === A_BOOST) {
        boostProject(state, unit, actor);
        return;
      }
      if (a >= A_PROMOTE && a < A_PROMOTE + PROMO_COLS) {
        takePromotion(unit, a - A_PROMOTE);
        return;
      }
      if (a === A_ESCORT) {
        escortUnit(state, unit);
        return;
      }
      if (a === A_BREAK_ESCORT) {
        breakEscort(unit);
        return;
      }
      if (a >= A_FORM_UP && a < A_FORM_UP + 6) {
        const nb = neighborTile(state.map, here, a - A_FORM_UP);
        if (nb) formUp(state, unit, nb.index);
        return;
      }
      if (a >= A_CONDEMN && a < A_CONDEMN + 6) {
        const nb = neighborTile(state.map, here, a - A_CONDEMN);
        if (nb) condemnHeretic(state, unit, nb.index);
        return;
      }
      if (a === A_REMOVE_HERESY) {
        removeHeresy(state, unit);
        return;
      }
      if (a === A_LAUNCH_INQUISITION) {
        launchInquisition(state, unit, actor);
        return;
      }
      if (a === A_CONVERT_HEATHEN) {
        convertHeathens(state, unit, actor);
        return;
      }
      if (a === A_UPGRADE) {
        upgradeUnit(state, unit, actor.seat);
        return;
      }
      // THE RAILROAD. CIV6: "Can only be constructed by Military Engineers.
      // Does not cost a charge, but does cost 1 Iron and 1 Coal" — so the
      // Engineer survives it and may lay another the next turn.
      if (a === A_BUILD_RAILROAD) {
        if (unit.type !== 'MILITARY_ENGINEER') return;
        if (!actor.research.techs.includes(RAILROAD_TECH)) return;
        if (!canBuildRailroad(here, (t) => tileOwnedByCiv(t, actor.seat))) return;
        if (!layRailroad(state, actor.seat, here)) return;
        unit.movesLeft = 0;
        return;
      }
      // CLEAN FALLOUT: any chassis with a build charge left, not the Builder
      // alone — and it spends the charge and the turn like any other.
      if (a === A_CLEAN_FALLOUT) {
        cleanFallout(state, unit);
        return;
      }
      // THE MILITARY ENGINEER'S TWO. Each spends a charge and the turn, and
      // vanishes on its last one, exactly as a Builder's improvement does.
      if (a === A_BUILD_ROAD || a === A_FINISH_DISTRICT) {
        if (unit.type !== 'MILITARY_ENGINEER' || (unit.charges ?? 0) <= 0) return;
        const owns = (t: Tile) => tileOwnedByCiv(t, actor.seat);
        const did = a === A_BUILD_ROAD
          ? (canBuildRoad(here, owns) ? ((here.road = true), true) : false)
          : engineerFinish(state, actor.seat, here.index);
        if (!did) return;
        unit.charges = (unit.charges ?? 0) - 1;
        unit.movesLeft = 0;
        if (unit.charges <= 0) disbandUnit(state, unit.id);
        return;
      }
      // THE GREAT PERSON'S ONE VERB — the charge, the site and the payout
      // are all the person's own.
      if (a === A_ACTIVATE_GP) {
        activateGreatPerson(state, unit);
        return;
      }
      if (a >= A_NUKE && a < A_NUKE + NUCLEAR_DEVICES.length * NUKE_COLS) {
        const off = a - A_NUKE;
        const k = Math.floor(off / NUKE_COLS);
        const tgt = nukeTargets(state, unit, k, NUKE_COLS)[off % NUKE_COLS];
        if (tgt !== undefined) {
          detonate(state, actor.seat, k, tgt);
          // the carrier spends its whole turn on the delivery
          unit.movesLeft = 0;
          unit.attacksLeft = 0;
        }
        return;
      }
      if (a >= A_AIR_STRIKE && a < A_AIR_STRIKE + AIR_STRIKE_COLS) {
        const t = airStrikeTargets(state, unit, AIR_STRIKE_COLS)[a - A_AIR_STRIKE];
        if (t !== undefined) airStrike(state, unit.id, t, actor.seat);
        return;
      }
      if (a >= A_AIR_PILLAGE && a < A_AIR_PILLAGE + AIR_STRIKE_COLS) {
        const t = airPillageTargets(state, unit, AIR_STRIKE_COLS)[a - A_AIR_PILLAGE];
        if (t !== undefined) airPillage(state, unit.id, t, actor.seat);
        return;
      }
      if (a >= A_REBASE && a < A_REBASE + AIR_REBASE_COLS) {
        const t = rebaseTargets(state, unit, AIR_REBASE_COLS)[a - A_REBASE];
        if (t !== undefined) rebaseAir(state, unit, t);
        return;
      }
      if (a >= A_SPY_TRAVEL && a < A_SPY_TRAVEL + SPY_TRAVEL_COLS) {
        const t = spyDestinations(state, unit, SPY_TRAVEL_COLS)[a - A_SPY_TRAVEL];
        if (t !== undefined) beginTravel(state, unit, t);
        return;
      }
      if (a >= A_SPY_MISSION && a < A_SPY_MISSION + SPY_MISSIONS.length) {
        beginMission(state, unit, a - A_SPY_MISSION);
        return;
      }
      if (a < 6) {
        // a DIRECTION keeps its slot at the map's edge: the compacted
        // neighbour list would shift every later direction by one (the GPU's
        // `neigh` plane keeps the -1)
        const to = neighborTile(state.map, here, a);
        // t43: the WALKERS' OWN candidate gate, at the REPLAY surface —
        // refusal parity with the GPU's _apply_seat_unit_actions. stepUnit
        // re-validates cost/cliffs but neither STACKING nor the EMBARK tech
        // (TS walkers never OFFER an illegal step, so stepUnit never needed
        // to refuse one). Two live divergences came through that hole at
        // t43 embarked a Shipbuilding-less warrior toward 556
        // (into a trade-route raid ring, -1F -1P/turn), and t46 stacked two
        // r0 warriors on 552 (the GPU's _blocked_for refused; the drifted
        // attacker then missed r1c3 and the whole t48 war family split).
        // `tileFreeForUnit` is the war-march's own body: stacking, the
        // encampment wall, naval/land domain, canEmbark, ocean-behind-
        // CARTOGRAPHY. allowEmbark carries the march's call-site arms: at
        // war with ANYONE, and SHIPBUILDING for every land unit — the GPU
        // gate's exact term (canEmbark alone would let a SAILING civilian
        // embark that the GPU refuses; Shipbuilding requires Sailing, so
        // the conjunction equals the GPU's single test).
        if (to) {
          const anyWarU = atWarWithAny(state, actor.seat);
          const allowEmb = anyWarU && ownerHasTech(state, unit, 'SHIPBUILDING');
          if (tileFreeForUnit(state, to.index, actor.seat, unit, allowEmb)) stepUnit(state, unit, to);
        }
      } else if (a >= 6 && a < 12) {
        // ATTACK — safe to replay now BECAUSE the walkers stand down for
        // driven seats (no double-resolution). The SAME combat calls the
        // walkers make; both re-validate their target.
        const to = neighborTile(state.map, here, a - 6);
        if (to) {
          // The ORDERED ranged attack is `rangedAttack`, not the autonomous
          // strike, dispatched by unit TYPE alone (the GPU applier's arm).
          // `hostileRangedStrike` carries the major-vs-major scope-out and
          // belongs to the SNIPE column and the hostile phases.
          //
          // The melee arm threads the ACTING seat, not the phase's ambient 0.
          if (UNITS[unit.type]?.ranged) rangedAttack(state, unit.id, to.index);
          else meleeAttack(state, unit.id, to.index, actor.seat);
        }
      } else if (a === A_PILLAGE) {
        // PILLAGE underfoot — hostileUnitAct's own block, faithfully: an
        // improvement first (food improvements heal +25), else the
        // complete non-centre district. Enemy-ownership re-validated.
        // MILITARY ONLY: the walker's pillage lives inside hostileUnitAct,
        // which only military units ever run — the replay arm must carry
        // that implicit gate explicitly (the GPU apply's _p_combat > 0
        // twin). Without it a mid-turn death shifted a recorded PILLAGE
        // row onto a MISSIONARY, which pillaged a mine here and silently
        // no-opped on the GPU (9029 rng 2026006086 t239, esc +3600).
        if (!((UNITS[unit.type]?.combat ?? 0) > 0)) return;
        const raidable = (t: Tile): boolean => isTerritorial(tileSeat(t))
          && civsAtWar(state, unitSeat(unit), tileSeat(t));
        const hereOwned = raidable(here);
        // CIV6: pillaging takes "3 Movement Points, or all of your movement";
        // Depredation prices it at 1.
        const pillageCost = promoValue(unit, 'PILLAGE_CHEAP');
        // CIV6 (Loot): "+50 Gold from coastal raids", flat and on top of
        // whatever the wrecked target's own plunder row pays.
        const raidGold = (): void => { actor.treasury += promoValue(unit, 'RAID_GOLD'); };
        const spendPillage = (): void => {
          unit.movesLeft = Math.max(
            0, unit.movesLeft - MP_SCALE * (pillageCost > 0 ? pillageCost : 3));
        };
        const wreckDistrict = (t: Tile): void => {
          t.districtPillaged = true;
          pillagePlunder(state, unit, DISTRICTS[t.district as keyof typeof DISTRICTS].plunder, true);
          displaceAirFrom(state, t.index);
          spendPillage();
        };
        const districtWreckable = (t: Tile): boolean =>
          // CIV6: the Encampment "cannot be pillaged normally" -- a melee unit
          // conquers it instead, and that assault is what pillages it.
          t.district !== null && t.district !== 'CITY_CENTER' &&
          t.district !== 'ENCAMPMENT' &&
          !!t.districtComplete && !t.districtPillaged;
        if (here.improvement && !here.pillaged && hereOwned) {
          here.pillaged = true;
          pillagePlunder(state, unit, IMPROVEMENTS[here.improvement as keyof typeof IMPROVEMENTS]?.plunder, false, here.improvement ?? undefined, tileSeat(here));
          spendPillage();
        } else if (hereOwned && districtWreckable(here)) {
          wreckDistrict(here);
        } else if ((UNITS[unit.type]?.raider || (leaderOf(state, unit.seat) === 'HARDRADA' && navalMelee(UNITS[unit.type])))
          && isWater(here) && unit.movesLeft >= 3 * MP_SCALE) {
          // CIV6 (Thunderbolt of the North): "coastal raiding for all naval
          // melee units"
          // CIV6 (Coastal Raid): the raider "must be next to the land
          // improvement or district, and must have at least 3 Movement
          // points remaining." One deterministic target: the lowest-index
          // adjacent land tile with an unpillaged enemy improvement, else
          // the lowest-index with a wreckable district — the GPU raid arm
          // ranks by the same key.
          const cand = neighbors(state.map, here)
            .filter((t) => !isWater(t) && raidable(t))
            .sort((x, y) => x.index - y.index);
          const impT = cand.find((t) => t.improvement && !t.pillaged);
          if (impT) {
            impT.pillaged = true;
            pillagePlunder(state, unit, IMPROVEMENTS[impT.improvement as keyof typeof IMPROVEMENTS]?.plunder, false, impT.improvement ?? undefined, tileSeat(impT));
            spendPillage();
            raidGold();
          } else {
            const disT = cand.find(districtWreckable);
            if (disT) { wreckDistrict(disT); raidGold(); }
          }
        }
      } else if ((a >= 13 && a < 18) || (a >= 18 && a < 18 + IMPROVEMENT_IDS.length - DEDICATED_IMPROVEMENTS)) {
        if ((unit.charges ?? 0) <= 0 && a !== 17) return;
        if (a === 16) {
          // CHOP: `builderRemoveFeature`, the ONE remove body — removability,
          // the resource dependency, the feature-removal TECH, the LUMBER_MILL
          // that goes with the woods, the charge, and the YIELD LUMP into the
          // owning city. ORACLE: the GPU's `_A_CHOP` arm pays the same lump,
          // `20 * progressScale`. Nothing in-gate drives this column —
          // the driver's builder ladder offers 13-15/18-24 and REPAIR.
          builderRemoveFeature(state, unit.id, actor.seat);
        } else if (a === 17) {
          if (unit.type !== 'BUILDER') return; // the GPU repair arm's builder gate
          if (here.pillaged && tileOwnedByCiv(here, actor.seat)) {
            here.pillaged = false;
            unit.movesLeft = 0;
          } else if (here.districtPillaged && tileOwnedByCiv(here, actor.seat)) {
            here.districtPillaged = false;
            unit.movesLeft = 0;
          }
        } else {
          const ii = a < 18 ? a - 13 : DEDICATED_IMPROVEMENTS + (a - 18);
          const imp = IMPROVEMENT_IDS[ii] as ImprovementId;
          const un = computeUnlocks(state, actor.seat);
          if (!here.improvement
              && validImprovementsIn(here, { unlocks: un, builder: unit.type, map: state.map, camps: campTiles(state), gpAppeal: cityAppealResolver(state), ownsTile: (t: Tile) => tileOwnedByCiv(t, actor.seat), suzerain: suzerainNames(state, actor.seat), civ: civOf(state, actor.seat), farmTerrain: getModifiers(state, actor.seat).farmTerrain, civics: actor.research.civics }).includes(imp)) {
            here.improvement = imp;
            // CIV6 (Mana): "Culture Bomb adjacent tiles" on the named
            // improvement — the same claim a district's bomb makes
            // (`CULTURE_BOMB_ROWS`)
            if (getModifiers(state, actor.seat).cultureBombs.some((r) => r.improvement === imp)) {
              const bombCity = cityAtTile(state, here);
              if (bombCity) cultureBomb(state, bombCity, here.index, false);
            }
            unit.charges = (unit.charges ?? 0) - 1;
            unit.movesLeft = 0;
            // CIV6 (Legion): a military chassis outlives its last charge.
            if (unit.charges <= 0 && unitDomain(unit.type) === 'civilian') disbandUnit(state, unit.id);
          }
        }
      } else if (a >= A_SPREAD && a < A_SPREAD + 7) {
        const toS = a === A_SPREAD ? here : neighborTile(state.map, here, a - A_SPREAD - 1);
        if (toS) spreadFromUnit(state, unit, actor, toS);
      } else if (a >= A_SNIPE && a < A_SNIPE + 12) {
        const rt = snipeRing(state, here)[a - A_SNIPE];
        if (rt !== undefined && UNITS[unit.type]?.ranged) hostileRangedStrike(state, unit, rt);
      } else if (a >= A_SNIPE3 && a < A_SNIPE3 + 18) {
        const rt = snipeRing3(state, here)[a - A_SNIPE3];
        // CIV6: distance 3 needs ATTACK RANGE 3 — chassis range plus the
        // RANGE promotion, which is what `unitAttackRange` sums.
        if (rt !== undefined && UNITS[unit.type]?.ranged && unitAttackRange(unit) >= 3) hostileRangedStrike(state, unit, rt);
      } else if (a === A_REMOVE_IMP) {
        // CIV6 (Builder / Military Engineer): "Can Remove Tile Improvements
        // (costs no charge)". The improvement is GONE rather than pillaged,
        // its based aircraft scatter, and the turn is spent.
        if (unit.type !== 'BUILDER' && unit.type !== 'MILITARY_ENGINEER') return;
        if (here.improvement && tileOwnedByCiv(here, actor.seat)) {
          here.improvement = null;
          here.pillaged = false;
          displaceAirFrom(state, here.index);
          unit.movesLeft = 0;
        }
      } else if (a === A_HARVEST) {
        // CIV6 (Builder): the resource goes, and its own lump is paid — the
        // legality and the payout both live in `builderHarvest` (C-52)
        builderHarvest(state, unit.id);
      } else if (a === A_WONDER_CHARGE) {
        // CIV6 (The First Emperor): a charge into the wonder underfoot
        wonderChargeBoost(state, unit, actor);
      }
    });
  }
}

export function seatPhase(state: GameState): void {

  // Seat units get their movement in this phase (like barbarians).
  // An EMBARKED land unit moves on the flat EMBARK_MOVES pool (not its
  // land moves) — mirrors refreshUnits and the GPU war-march's full_mp. Naval
  // units keep their own moves.
  // This reset — NOT refreshUnits — is where a foreign unit's
  // movement budget for the turn is actually established, so it is where the
  // general/admiral aura's +1 MP must be applied, and `movesFull` must be
  // rewritten to match. Two bugs live here if it is not:
  //   (1) the seat half of the aura would be silently wiped (the GPU seat
  //       walkers grant it, so the engines would diverge by 1 MP);
  //   (2) leaving `movesFull` at refreshUnits' `full + aura` while movesLeft
  //       resets to plain `full` makes NEXT turn's "spent no MP" gate fail for
  //       a seat that never moved — no heal, and fortify wrongly reset.
  // Seat generals war-walk LATER in this phase, so freezing the bonus here
  // (before any of them moves) is also what keeps the GPU snapshot turn-exact.
  for (const u of state.units) {
    if (!isCiv(u.seat)) continue;
    const fullR = unitFullMoves(state, u);
    u.movesLeft = fullR + generalAuraMP(state, u);
    u.movesFull = u.movesLeft;
  }

  // What the standing deals owe each other, before any new one is struck: the
  // per-turn payments, the 30-turn clock, and the offer nobody answered.
  dealPhase(state);

  // THE DIPLOMATIC AGREEMENTS, in the GPU's arm order: denounce, then
  // friendship, then the alliance friendship unlocks, then the border grant.
  // Every one is re-validated here — the record only names the target.
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.denounce ?? []) {
      const target = seatOf(state, tj);
      if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
      if (denounceActive(state, actor.seat, target.seat)) continue; // already standing
      if (civsAtWar(state, actor.seat, target.seat)) continue;
      // CIV6 (Denouncing): "You cannot denounce Declared Friends or Allies -
      // you have to wait until these states expire."
      if (seatsFriends(state, actor.seat, target.seat)) continue;
      if (seatsAllied(state, actor.seat, target.seat)) continue;
      actor.denounced[target.seat] = state.turn;
      grievanceDenounce(state, actor.seat, target.seat);
      state.eventLog.push(`${actor.name} denounces ${target.name}.`);
    }
  }
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.friend ?? []) {
      const target = seatOf(state, tj);
      if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
      if (civsAtWar(state, actor.seat, target.seat)) continue;
      if (seatsFriends(state, actor.seat, target.seat)) continue;
      if (denounceActive(state, actor.seat, target.seat) || denounceActive(state, target.seat, actor.seat)) continue;
      // CIV6 (Alliance): "A leader you've offended (or who has many Grievances
      // against you in Gathering Storm) will not want to become Declared
      // Friends with you." Either side's outstanding balance refuses.
      if (grievanceWith(state, actor.seat, target.seat) !== 0) continue;
      setFriendTurnsWith(state, actor.seat, target.seat, AGREEMENT_TURNS);
      state.eventLog.push(`${actor.name} and ${target.name} declare friendship.`);
    }
  }
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    const allyList = recG?.ally ?? [];
    for (let tk = 0; tk < allyList.length; tk++) {
      const tj = allyList[tk];
      const target = seatOf(state, tj);
      if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
      // CIV6 (Alliance): "Alliances become possible after developing the Civil
      // Service civic. You can only enter into an Alliance with a
      // civilization if you and its leader are Declared Friends."
      if (!actor.research.civics.includes(ALLIANCE_CIVIC)) continue;
      if (!seatsFriends(state, actor.seat, target.seat)) continue;
      if (civsAtWar(state, actor.seat, target.seat) || seatsAllied(state, actor.seat, target.seat)) continue;
      if (denounceActive(state, actor.seat, target.seat) || denounceActive(state, target.seat, actor.seat)) continue;
      setAllyTurnsWith(state, actor.seat, target.seat, AGREEMENT_TURNS);
      // The record names the TYPE beside the target; an absent column reads
      // RESEARCH, the wire's one default (the GPU replay parser matches).
      setAllianceTypeWith(state, actor.seat, target.seat, recG?.allyType?.[tk] ?? 0);
      state.eventLog.push(`${actor.name} and ${target.name} form an alliance.`);
    }
  }
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.delegation ?? []) {
      const target = seatOf(state, tj);
      if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
      if (delegationWith(state, actor.seat, target.seat) > 0) continue;
      // CIV6 (Delegations and Embassies): the Resident Embassy "replaces"
      // the Delegation once Diplomatic Service is in, so the mission is one
      // fact and the sender's own civics say what it costs.
      const cost = actor.research.civics.includes(EMBASSY_CIVIC) ? EMBASSY_COST : DELEGATION_COST;
      if ((actor.treasury ?? 0) < cost) continue;
      // A rival worse than Neutral turns the mission away, and this model
      // reads that as the two states it can name: a war, or a denouncement
      // either way.
      if (civsAtWar(state, actor.seat, target.seat)) continue;
      if (denounceActive(state, actor.seat, target.seat) || denounceActive(state, target.seat, actor.seat)) continue;
      // "...which is paid to the other leader."
      actor.treasury = (actor.treasury ?? 0) - cost;
      target.treasury = (target.treasury ?? 0) + cost;
      setDelegationWith(state, actor.seat, target.seat, 1);
      state.eventLog.push(`${actor.name} sends a mission to ${target.name}.`);
    }
  }
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const tj of recG?.borders ?? []) {
      const target = seatOf(state, tj);
      if (!target || !isCiv(target.seat) || target.cities.length === 0) continue;
      // CIV6 (Open Borders): the agreement "becomes available" once the
      // GRANTOR has Early Empire — the civic that closed the border in the
      // first place. "Open Borders cannot be offered to or requested from a
      // leader who has Denounced you, or whom you have Denounced."
      if (!actor.research.civics.includes(OPEN_BORDERS_CIVIC)) continue;
      if (civsAtWar(state, actor.seat, target.seat)) continue;
      if (denounceActive(state, actor.seat, target.seat) || denounceActive(state, target.seat, actor.seat)) continue;
      setBorderTurnsFrom(state, actor.seat, target.seat, AGREEMENT_TURNS);
      state.eventLog.push(`${actor.name} opens its borders to ${target.name}.`);
    }
  }
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recG = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const [kind, tj] of recG?.gift ?? []) {
      // CIV6 (Trading): "You may trade almost anything in the game, including
      // ... Great Works", and the one-sided half of that screen is the gift —
      // "Click it and you gift your items to your rival." A NEGOTIATED deal
      // needs a valuation no source publishes, so only the gift ships.
      // "You can trade with all the leaders except the ones you're at war
      // with."
      if (kind < 0 || kind >= GW_KINDS) continue;
      const target = seatOf(state, tj);
      if (!target || !isCiv(tj) || target.cities.length === 0) continue;
      if (civsAtWar(state, actor.seat, tj)) continue;
      // WHICH city gives and WHICH receives is not a decision — the works are
      // counts, not identities, so both engines take the giver's FIRST city
      // holding one and the receiver's first with a free slot, in the city
      // order `placeGreatWorks` already walks.
      const slots = gwExtraSlots(state, kind);
      const from = actor.cities.find((c) => gwCount(c, kind) > 0);
      const home = target.cities.find((c) => gwCount(c, kind) < gwCapacity(c, kind, slots(c)));
      if (!from || !home) continue;
      gwGive(home, kind, gwTake(from, kind));
      state.eventLog.push(`${actor.name} gifts a Great Work to ${target.name}.`);
    }
  }
  // THE TABLE. Every offer goes down first and every answer comes second, so a
  // pair that agrees within one turn settles within it — and an offer nobody
  // takes stands one more turn before `dealPhase` sweeps it.
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recD = state.seatActions?.[state.turn - 1]?.[actor.seat];
    if (!recD?.offer) continue;
    const [tj, give, ask] = recD.offer;
    const target = seatOf(state, tj);
    if (!target || !isCiv(tj) || tj === actor.seat || target.cities.length === 0) continue;
    if (give.length > DEAL_ITEMS || ask.length > DEAL_ITEMS) continue;
    setDealOffer(state, actor.seat, tj, { left: DEAL_OFFER_TURNS + 1, give, ask });
  }
  for (const actor of state.seats) {
    if (!isCiv(actor.seat) || actor.cities.length === 0) continue;
    const recD = state.seatActions?.[state.turn - 1]?.[actor.seat];
    for (const fj of recD?.accept ?? []) {
      // CIV6 (Ending a War): "the peaceful resolution of a war involves
      // diplomatic negotiations" — a table between two seats at war IS the
      // peace deal, so confirming it is what ends the war.
      const wasWar = civsAtWar(state, fj, actor.seat);
      const from = seatOf(state, fj);
      if (!from || !acceptDeal(state, fj, actor.seat)) continue;
      if (wasWar) makePeace(state, from, actor.seat);
      state.eventLog.push(`${actor.name} accepts a deal from ${from.name}.`);
    }
  }
  for (const actor of state.seats) {
    const recU = state.seatActions?.[state.turn - 1]?.[actor.seat];
    if (actor.cities.length === 0) {
      // No city means no economy — but the UNITS still walk. A settler start
      // owns nothing but units, so skipping the whole block here locks the
      // seat out of the FOUND verb, the one verb that would give it a city.
      // CIV6: a civ is eliminated when it holds neither a city nor a settler.
      // CIV6 (Kupe's Voyage): "+2 Science and +2 Culture per turn before you
      // settle your first city" — the only yield a city-less seat makes, so it
      // banks here, above the economy block; it completes with the turn the
      // first city gives the seat.
      for (const r of getModifiers(state, actor.seat).capital) {
        const s0 = r.presettleYields?.science ?? 0;
        const c0 = r.presettleYields?.culture ?? 0;
        actor.research.techProgress += s0;
        actor.research.civicProgress += c0;
        actor.scienceTotal = (actor.scienceTotal ?? 0) + s0;
        actor.cultureTotal = (actor.cultureTotal ?? 0) + c0;
      }
      if (recU) applySeatUnitOrders(state, actor, recU.units);
      continue;
    }

    // THE TURN'S RESOURCES, before anything reads them: every improved source
    // pays into the stockpile, then the plants burn what they need and the
    // POWERED flag every yield reader takes is set for the turn.
    accrueStockpiles(state, actor.seat);
    chargeUnitUpkeep(state, actor.seat);
    resolveSeatPower(state, actor.seat);
    // THE GOVERNORS, before anything reads the roster: earned titles are
    // spent, idle governors take a city, and both clocks tick. Every
    // ability the city walk reads is settled here.
    governorPhase(state, actor.seat);
    // A posting is an envoy count, so the minors' stored answer moves with it.
    resolveSuzerains(state);
    // ESPIONAGE: this seat's own spies move a turn closer to arriving or to
    // resolving, and the clocks their missions left behind tick down.
    tickSpies(state, actor.seat);
    tickSpyEffects(state, actor.seat);

    // A Relic held for want of a slot goes out at the owner's next turn —
    // before the yield walk, so a slot opened last turn pays this one.
    if ((actor.relicReserve ?? 0) > 0) {
      actor.relicReserve = drainRelicReserve(actor.relicReserve, actor.cities, relicSlotsIn(state));
    }

    warWearinessTurn(state, actor.seat);

    detectBoosts(state, actor.seat);

    const seatUnitList = unitsOf(state, actor.seat);
    {
      // Meet by EXPLORATION — a city-state is met the moment its centre is
      // out of this seat's fog. Fog off (or not yet accrued) = instant, so
      // in a fogless world every seat knows every city-state; with fogOfWar
      // live, meeting is earned by scouting, the real Civ 6 rule. This
      // replaced the proximity surrogate when every seat got a fog plane.
      for (const cityState of state.cityStates) {
        if (hasMet(cityState, actor.seat)) continue;
        if (isExplored(state, actor.seat, cityState.centerIndex)) {
          setMet(cityState, actor.seat);
          state.eventLog.push(`${actor.name} met the city-state of ${cityState.name}.`);
        }
      }
      if (state.cityStates.some((cityState) => hasMet(cityState, actor.seat))) {
        const gov = GOVERNMENTS_ADOPTION_LIVE ? computeAdoption(actor.research).government : null;
        const tier = gov ? GOV_INFLUENCE_TIER[gov] ?? 0 : 0;
        // CIV6 (Rogue State): "Earn no influence toward new Envoys."
        if (!getModifiers(state, actor.seat).noEnvoyInfluence) {
          actor.influencePoints = (actor.influencePoints ?? 0) + INFLUENCE_PER_TURN + tier
            + getModifiers(state, actor.seat).influencePerTurn
            + seatBuildingSum(state, actor.seat, 'influencePerTurn')
            // CIV6 (Economic alliance 2): an Envoy point per turn "for every
            // City-State with your Ally as Suzerain".
            + ALLIANCE_E2_INFLUENCE * allianceSuzInfluence(state, actor.seat);
        }
        // CONVERSION IS A RULE, for every seat. Real Civ 6 grants the
        // envoy the moment the meter fills, assigned or not. WHERE it is spent
        // is the decision, and that arrives on the wire.
        while (actor.influencePoints >= ENVOY_COST) {
          actor.influencePoints -= ENVOY_COST;
          actor.envoysAvailable = (actor.envoysAvailable ?? 0) + 1;
        }
      }

      // City-state quests — each MET CS keeps ONE quest per seat
      // (cityState.seatQuest[actor.seat], SEAT-keyed: row 0 is seat 0, the
      // GPU base geometry); a satisfied one resolves here (+QUEST_ENVOYS to
      // THIS seat's envoys — the accrual channel), else a new one issues on
      // cooldown expiry. The kind is DETERMINISTIC: the FIRST SATISFIABLE
      // option in the fixed order [clearCamp, buildDistrict, sendTradeRoute]
      // against this seat's state — NO nextRandom. questIssuedTurn clock
      // defaults to 0 → first issue at turn≥cooldown.
      for (const cityState of state.cityStates) {
        if (!hasMet(cityState, actor.seat)) continue;
        const rq = (cityState.seatQuest ??= []);
        const rqi = (cityState.seatQuestIssuedTurn ??= []);
        const cur = rq[actor.seat] ?? null;
        if (cur) {
          if (questSatisfied(state, cityState, cur, actor.seat, { tradeRoutes: actor.tradeRoutes, cities: actor.cities })) {
            rq[actor.seat] = null;
            rqi[actor.seat] = state.turn;
            addEnvoys(state, cityState, actor.seat, QUEST_ENVOYS);
            state.eventLog.push(`${cityState.name} quest complete for ${actor.name}: +${QUEST_ENVOYS} envoy.`);
          }
        } else if (state.turn - (rqi[actor.seat] ?? 0) >= QUEST_COOLDOWN) {
          const q = issueQuest(state, cityState, actor.seat, { tradeRoutes: actor.tradeRoutes, cities: actor.cities });  // one issuer, every seat
          if (q) {
            rq[actor.seat] = q;
            rqi[actor.seat] = state.turn;
          }
        }
      }
    }

    let unitCount = seatUnitList.length;
    // Army composition (military only — builders don't count),
    // live + queued, updated through this pick loop so same-turn picks see
    // each other — the ranged share targets 1 ranged per 2 melee.
    let meleeCount = 0;
    let rangedCount = 0;
    for (const u of seatUnitList) {
      const d = UNITS[u.type];
      if (!d || d.combat <= 0) continue;
      if (d.ranged) rangedCount += 1;
      else meleeCount += 1;
    }
    for (const civCity of actor.cities) {
      const q = civCity.queue[0];
      if (q?.kind === 'unit') {
        unitCount += 1;
        const d = q.unit ? UNITS[q.unit] : undefined;
        if (d && d.combat > 0) {
          if (d.ranged) rangedCount += 1;
          else meleeCount += 1;
        }
      }
    }
    const rec = state.seatActions?.[state.turn - 1]?.[actor.seat];
    if (rec) applySeatActionRecord(state, actor, rec);
    // The record replaces the PICKS and nothing else. Bookkeeping — yields,
    // growth, research accrual, treasury — is RULES and runs for every seat,
    // record or no record.
    // GOLD PURCHASE — ONE per seat per turn, and the WIRE names it. The
    // record's `buy` column carries [kind, centreTile, index]: kind 0 a
    // building, 1 a settler, 2 a military unit. Nothing here picks; each arm
    // re-validates the named intent against its own predicates at this
    // position and refuses silently if it no longer holds, which is what the
    // GPU's `_seat_buy_ladder` does with the same column — clause for clause.
    //
    // Priority BUILDING > SETTLER > UNIT still governs, because a record may
    // only name one and `bought` short-circuits the rest.
    {
      let bought = false;
      if (rec) {
        const bv = rec.buy;
        if (bv && bv[0] === 0) {
          const civCity = actor.cities.find((c) => c.centerIndex === bv[1]);
          const bid = prodLayout().buildings[bv[2]];
          const def = bid ? BUILDINGS[bid] : undefined;
          if (civCity && def && !def.worship && !SCRIPTED_HELD_BUILDINGS.has(def.id)
              && !def.noPurchase && !wallsGoldBlocked(state, actor.seat, def.id)) {
            // ONE legality body with the candidate row and the GPU's gold
            // read: the shared gold list paired with `buildingCompletable`.
            const okBuy = goldPurchasableBuildings(state, civCity).some((b) => b.id === def.id)
              && buildingCompletable(state, civCity, def.id);
            if (okBuy) {
              const price = def.cost * GOLD_PURCHASE_MULT;
              const reserve = PEACE_GOLD_COST(0);
              if (Math.round((actor.treasury ?? 0) * 1000) >= Math.round((price + reserve) * 1000)) {
                actor.treasury = (actor.treasury ?? 0) - price;
                civCity.buildings.push(def.id);
                dropQueuedBuilding(civCity, def.id);
                buildingDedications(state, civCity.seat, def.id);
                if (def.walls) { civCity.outerHp = wallsMax(state, civCity); fitEncampOuter(state, civCity); }
                bought = true;
              }
            }
          }
        }
      }
      const wantSettler = rec?.buy?.[0] === 1;
      if (wantSettler && !bought && actor.cities.length > 0) {
        const spawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
        bought = purchaseSettler(state, spawnCity.id, actor.seat).ok;
      }
      const wantUnit = rec?.buy?.[0] === 2;
      if (wantUnit && !bought && meleeCount + rangedCount < actor.cities.length * 2) {
        let pickId: string | null = null;
        let pickCombat = -Infinity;
        for (const def of goldBuyableUnits(state, actor.seat)) {
          if (!goldAffordable(actor.treasury ?? 0, unitPurchaseCost(state, def.id, actor.seat))) continue;
          if (def.combat > pickCombat) {
            pickCombat = def.combat;
            pickId = def.id;
          }
        }
        if (pickId) {
          const spawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
          const price = unitPurchaseCost(state, pickId, actor.seat);
          const u = spawnUnit(state, pickId, spawnCity.centerIndex, actor.seat);
          if (u) {
            actor.treasury = (actor.treasury ?? 0) - price;
            bought = true;
            u.xpPct = trainXpPct(state, spawnCity, promoClassOf(pickId));
          }
        }
      }
      const bv3 = rec?.buy;
      if (bv3 && bv3[0] === 3 && !bought) {
        const rc3 = actor.cities.find((c) => c.centerIndex === bv3[2]);
        if (rc3) bought = buyTile(state, rc3.id, bv3[1], actor.seat).ok;
      }
      // kind 4 — GOLD patronage of a class's standing Great Person offer;
      // the class rides the second slot.
      if (bv3 && bv3[0] === 4 && !bought) {
        bought = patronizeGreatPerson(state, actor.seat, bv3[1], 'gold').ok;
      }
    }

    // kinds 4-6, the FAITH purchases — faith is its own currency, so
    // these ride BESIDE the gold buy, in the scripted ladder's own order
    // (worship saturates first, then ONE religious unit — missionary before
    // apostle). Each entry names its city by centre; the legality bodies
    // (buyWorshipBuilding / purchaseReligiousUnit) re-validate everything,
    // and the one-religious-unit rule is enforced HERE regardless of what
    // the wire asks. The envoy split is the precedent: CONVERSION is
    // automatic in Civ 6 and stayed a rule; a purchase is a choice.
    {
      let boughtRelig = false;
      let boughtCivilian = false;
      let boughtNaturalist = false;
      let boughtClass = false;
      let boughtLandUnit = false;
      let boughtPatron = false;
      let boughtBand = false;
      for (const ent of rec?.buyFaith ?? []) {
        const [fk, centre] = ent;
        if (fk === 15) {
          // kind 15 — FAITH patronage; no city involved, the class rides
          // the third slot.
          if (!boughtPatron) boughtPatron = patronizeGreatPerson(state, actor.seat, ent[2] ?? -1, 'faith').ok;
          continue;
        }
        const civCityF = actor.cities.find((c) => c.centerIndex === centre);
        if (!civCityF) continue;
        if (fk === 4) buyWorshipBuilding(state, civCityF.id, actor.seat);
        else if ((fk === 5 || fk === 6 || fk === 11 || fk === 14) && !boughtRelig) {
          const rt = fk === 5 ? 'MISSIONARY' : fk === 6 ? 'APOSTLE'
            : fk === 11 ? 'INQUISITOR' : 'WARRIOR_MONK';
          boughtRelig = purchaseReligiousUnit(state, civCityF.id, rt, actor.seat).ok;
        } else if ((fk === 8 || fk === 9) && !boughtCivilian) {
          // kinds 8/9 — the Monumentality faith-civilian (8 builder, 9 settler)
          boughtCivilian = purchaseCivilianWithFaith(state, civCityF.id, fk === 8 ? 'BUILDER' : 'SETTLER', actor.seat).ok;
        } else if (fk === 12 && !boughtClass) {
          // kind 12 — Valletta's class purchase, its own once-per-turn slot.
          const cbid = prodLayout().buildings[ent[2] ?? -1];
          if (cbid) boughtClass = purchaseBuildingWithFaith(state, civCityF.id, cbid, actor.seat).ok;
        } else if (fk === 13 && !boughtLandUnit) {
          // kind 13 — the land combat unit Theocracy and the Grand Master's
          // Chapel sell for faith.
          const cuid = prodLayout().units[ent[2] ?? -1];
          if (cuid) boughtLandUnit = purchaseUnitWithFaith(state, civCityF.id, cuid, actor.seat).ok;
        } else if (fk === 16 && !boughtBand) {
          // kind 16 — the ROCK BAND, faith-only at a progressive price.
          boughtBand = purchaseRockBand(state, civCityF.id, actor.seat).ok;
        } else if (fk === 10 && !boughtNaturalist) {
          // kind 10 — the NATURALIST, faith-only in any city (no Holy Site,
          // no dedication), one per turn like the other faith civilians.
          boughtNaturalist = purchaseNaturalist(state, civCityF.id, actor.seat).ok;
        }
      }
    }

    // THE MISSILE SILO'S LAUNCH. The silo is an improvement, so the order is
    // the SEAT's; both engines re-validate the named (device, tile) pair.
    {
      const nk = rec?.nuke;
      if (nk && nk[0] >= 0 && nk[1] >= 0
          && siloReaches(state, actor.seat, nk[0], nk[1])
          && nukeOffers(state, actor.seat, nk[0], nk[1])) {
        detonate(state, actor.seat, nk[0], nk[1]);
      }
    }

    {
      const lvi = rec?.levy;
      if (lvi !== undefined && lvi !== null && lvi >= 0) {
        const cityStateL = cityStateById(state, lvi);
        if (cityStateL) levyUnits(state, cityStateL.id, actor.seat);
      }
    }

    // Trade. The route DECISION rides the wire — a real player spends a
    // Trader on a chosen pair — so the engine only re-validates the named
    // pair; the pair-picking scan lives with the deciders (the driver's
    // candidate row / drive.py). The engine rules stay here: the walk,
    // plunder, and the round-trip expiry.
    {
      const routes = (actor.tradeRoutes ??= []);
      const water = tradeWaterLevel(state, actor.seat);
      // THE WALK: each route's Trader advances one descent step toward
      // its leg target, laying road as it goes; it turns around at the
      // destination and starts a fresh round trip at home. (The two legs may
      // descend different lines — the descent is greedy per step, not a
      // stored path — so the return can lay a second road line.)
      for (const r of routes) {
        if ((r.walkLeg ?? -1) < 0 || r.walkTile === undefined) continue;
        const originC = actor.cities.find((c) => c.id === r.from)?.centerIndex ?? -1;
        const destC = routeDestCenter(state, actor, r);
        if (originC < 0 || destC < 0) continue;
        const target = r.walkLeg === 0 ? destC : originC;
        const next = tradeWalkStep(state, r.walkTile, target, water);
        if (next !== r.walkTile) {
          r.walkTile = next;
          // roads go on LAND only — a sea leg lays nothing
          if (!isWater(state.map.tiles[next])) state.map.tiles[next].road = true;
        }
        if (r.walkLeg === 0 && r.walkTile === destC) r.walkLeg = 1;
        else if (r.walkLeg === 1 && r.walkTile === originC) r.walkLeg = 0;
      }
      // PLUNDER, real Civ 6: a unit hostile to the route's owner standing on
      // the Trader's tile destroys the route AND its Trader, and a MAJOR
      // raider banks the gold (a barbarian or city-state raider has no
      // treasury here — seatOf answers majors only).
      {
        const plundered = new Set<TradeRoute>();
        for (const r of routes) {
          const raider = r.walkTile === undefined ? null : routePlunderer(state, r.walkTile, actor.seat);
          if (raider === null) continue;
          plundered.add(r);
          const rs = seatOf(state, raider);
          if (rs) {
            rs.treasury += PLUNDER_ROUTE_GOLD * getModifiers(state, raider).routePlunderMult
              * (1 + gpPermOf(rs, 'routePlunderPct') / 100);
          }
        }
        if (plundered.size > 0) actor.tradeRoutes = routes.filter((r) => !plundered.has(r));
      }
      // the wire intent: [origin CENTRE, dest code] — a CENTRE tile, or
      // -(2+csIndex) for a city-state. Re-validated like every wire intent
      // (canAdd* checks capacity, range and the free Trader the verb spends).
      const rv = rec?.route;
      if (rv) {
        const fromCity = actor.cities.find((c) => c.centerIndex === rv[0]);
        if (fromCity) {
          if (rv[1] <= -2) {
            const cs = cityStateById(state, -(rv[1] + 2));
            if (cs) addCsTradeRoute(state, fromCity.id, cs.id, actor.seat);
          } else {
            const own = actor.cities.find((c) => c.centerIndex === rv[1]);
            if (own) addTradeRoute(state, fromCity.id, own.id, actor.seat);
            else {
              for (const other of state.seats) {
                if (other.seat === actor.seat) continue;
                const pc = other.cities.find((c) => c.centerIndex === rv[1]);
                if (pc) {
                  addIntlTradeRoute(state, fromCity.id, other.seat, pc.id, actor.seat);
                  break;
                }
              }
            }
          }
        }
      }
      // CIV6 (Reform the Coinage, dark face): "+1 Era Score each time you
      // successfully complete a Trade Route" — completion is the minimum
      // term running out WITH the Trader home (the round-trip rule; a parked
      // sea walker is always home, a stuck one ends at the rail). A route
      // cut short — plunder, war, a dead destination — never scores.
      const cur = actor.tradeRoutes ?? [];
      const isDone = (x: TradeRoute): boolean => {
        if (x.expiresTurn === undefined || state.turn < x.expiresTurn) return false;
        if ((x.walkLeg ?? -1) < 0) return true;
        if (state.turn >= x.expiresTurn + TRADE_WALK_EXPIRY_RAIL) return true;
        return x.walkTile === actor.cities.find((c) => c.id === x.from)?.centerIndex;
      };
      const destGone = (x: TradeRoute): boolean =>
        x.toSeatCity !== undefined && !(seatOf(state, x.toSeat ?? NO_SEAT)?.cities ?? []).some((c) => c.id === x.toSeatCity);
      const done = cur.filter((x) => isDone(x));
      if (done.length > 0) {
        dedicationEvent(state, actor.seat, DED_COINAGE, done.length);
        // CIV6 (Trading Post): "created in a city when a civilization
        // finishes a Trade Route to that city for the first time" -- and one
        // at home, "in the origin and destination cities". Only a FULL term
        // stamps; a plundered or dest-dead route plants nothing.
        for (const r of done) {
          stampTradingPost(actor, actor.cities.find((c) => c.id === r.from)?.centerIndex ?? -1);
          stampTradingPost(actor, routeDestCenter(state, actor, r));
        }
      }
      const ended = cur.filter((x) => isDone(x) || destGone(x));
      if (ended.length > 0) {
        // a route that ENDS (completes, or loses its destination) hands its
        // Trader back at the origin; only plunder destroys the unit.
        if (state.unitsMode) {
          for (const r of ended) {
            const oc = actor.cities.find((c) => c.id === r.from);
            if (oc) spawnUnit(state, 'TRADER', oc.centerIndex, actor.seat);
          }
        }
        actor.tradeRoutes = cur.filter((x) => !ended.includes(x));
      }
    }

    // Cities: real tile yields drive growth and the production queues.
    // Iterate a SNAPSHOT — a settler completing mid-loop founds a city,
    // and the newborn must not act this turn (the GPU gates on the
    // pre-turn alive mask the same way).
    const grantedNow: string[] = []; // the roster's technology grants, spawned after the upkeep
    let sciSum = 0;
    let culSum = 0;
    let goldSum = 0;
    let faithSum = 0;
    const luxMap = luxuryAmenities(state, actor.seat);
    const seatMods = getModifiers(state, actor.seat);
    const cityStats = new Map<number, CityStats>();
    for (const civCity of actor.cities) cityStats.set(civCity.id, computeCityStats(state, civCity, luxMap, seatMods));
    // CIV6 (Military alliance 2): "+15% Production toward military units
    // when you or your ally are at war."
    const milAllyWarPct = state.seats.some((x) => x.seat !== actor.seat
      && alliedAtLevel(state, actor.seat, x.seat, ALLIANCE_MILITARY, 2)
      && (atWarWithAny(state, actor.seat) || atWarWithAny(state, x.seat))) ? ALLIANCE_M2_MIL_PROD_PCT / 100 : 0;
    // The seat's science/turn off the SAME loop-top snapshot, folded in city
    // order — the Moon Landing lump reads it, and the GPU folds the identical
    // walk columns in slot order, so the f64 association agrees.
    let sciPerTurnSeat = 0;
    for (const civCity of actor.cities) sciPerTurnSeat += cityStats.get(civCity.id)!.total.science;
    // this seat's governor seats for THIS turn — persistent assignments the
    // roster already carries, read once before the walk moves any loyalty.
    const rGovIds = new Set(governorsOf(actor)
      .filter((g) => g.appointed && g.cityId >= 0 && g.outTurns <= 0)
      .map((g) => g.cityId));
    const civCityDefectors: City[] = [];
    for (const civCity of [...actor.cities]) {
      const stats = cityStats.get(civCity.id) ?? computeCityStats(state, civCity, luxMap, seatMods);
      const tier = stats.amenities.tier;
      if (applyLoyalty(state, civCity, tier.name, rGovIds.has(civCity.id))) {
        civCityDefectors.push(civCity);
      }
      const y = stats.total;
      // `total.gold` is already NET of district+building upkeep — computeCityStats
      // subtracts it — so this must not charge it a second time.
      goldSum += y.gold;
      faithSum += y.faith; // the faith yield gains its consumer
      const production = y.production;
      sciSum += y.science;
      const culC = y.culture;
      culSum += culC;

      seatGrowth(civCity, stats.effectiveFoodSurplus, stats.growthNeeded);
      const q = civCity.queue[0];
      if (q && (q.kind === 'settler' || q.kind === 'unit' || q.kind === 'district' || q.kind === 'building' || q.kind === 'project' || q.kind === 'wonder')) {
        // The seat's GOVERNMENT/POLICY encampHarborProdMult, which
        // `game.ts` has always applied to the seat 0's queue head and the
        // seat's add never did. A seat that adopts the government owns
        // its effects; the multiplier keys on the ITEM, not on the seat.
        let _em = isEncampHarborItem(q) ? seatMods.encampHarborProdMult : 1;
        // CIV6 (To Arms!, Golden face): "+15% Production towards military
        // units." (Heartbeat of Steam, Golden face): "+10% Production toward
        // Industrial era and later wonders." The three item classes are
        // disjoint, so the multiplier order is association-free.
        if (q.kind === 'unit' && unitIsMilitary(q.unit) && goldenDedication(state, civCity.seat, DED_TO_ARMS)) _em *= TO_ARMS_MIL_PROD_MULT;
        if (q.kind === 'wonder' && (WONDER_ERA_INDEX[q.wonder] ?? 0) >= INDUSTRIAL_ERA_INDEX && goldenDedication(state, civCity.seat, DED_STEAM)) _em *= STEAM_WONDER_PROD_MULT;
        // CIV6 (Urban Development Treaty, outcome A): "+100% Production
        // towards buildings in this district."
        const _udtD = congressUdtProdDistrict(state);
        if (q.kind === 'building' && _udtD !== null && BUILDINGS[q.building]?.district === _udtD) _em *= CONGRESS_PROD_MULT;
        // CIV6 (EFFECT_ADJUST_BUILDING_PRODUCTION): the roster's building rows
        // CIV6 (Treasure Fleet): a row may be keyed on the city sitting OFF
        // the seat's home continent — its original capital's landmass
        const _offHome = !onHomeContinent(state, civCity.seat, civCity.centerIndex);
        if (q.kind === 'building') _em *= prodMultFor(seatMods.prodMults, { kind: 'building', building: q.building, district: BUILDINGS[q.building]?.district }, _offHome);
        // CIV6 (Public Works Program): "+100% / -50% Production towards this
        // Project."
        if (q.kind === 'project') _em *= congressProjectMult(state, PROJECT_LIST.findIndex((pr) => pr.id === q.project));
        // CIV6 (Zoning Commissioner): "+20% Production towards constructing
        // Districts in the city"; (Grants): "+30% Production towards City
        // Projects."
        // CIV6 (Letters of Marque): "Naval Raiders: +100% Production";
        // (Flower Power): land units other than Rock Bands cost double, which
        // this model pays as a slower fill rather than a moved queue cost.
        if (q.kind === 'unit' && UNITS[q.unit]?.raider) _em *= seatMods.navalRaiderProdMult;
        if (q.kind === 'unit') _em /= landUnitPriceMult(state, civCity.seat, q.unit);
        // CIV6 (Thunderbolt of the North): "+50% Production toward all naval
        // melee units."
        if (q.kind === 'unit' && leaderOf(state, civCity.seat) === 'HARDRADA' && navalMelee(UNITS[q.unit])) _em *= HARDRADA_NAVAL_MELEE_PROD_MULT;
        // CIV6 (EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION): the roster's unit-class rows
        if (q.kind === 'unit') _em *= prodMultFor(seatMods.prodMults, { kind: 'unit', promoClass: promoClassOf(q.unit), unit: q.unit }, _offHome);
        if (q.kind === 'district') _em *= governorMult(state, civCity, (e) => e.districtProdMult);
        // CIV6 (Founder of Carthage): "+50% Production toward districts in the
        // city with the Government Plaza" (`PLAZA_DISTRICT_PROD_ROWS`)
        if (q.kind === 'district' && seatMods.plazaDistrictProd
          && civCity.districts.some((d) => d.type === 'GOVERNMENT_PLAZA'
            && state.map.tiles[d.tileIndex].districtComplete)) {
          _em *= 1 + seatMods.plazaDistrictProd / 100;
        }
        // CIV6 (EFFECT_ADJUST_DISTRICT_PRODUCTION): the roster's district rows
        if (q.kind === 'district') _em *= prodMultFor(seatMods.prodMults, { kind: 'district', districtItem: q.district }, _offHome);
        if (q.kind === 'project') _em *= governorMult(state, civCity, (e) => e.projectProdMult) * seatMods.projectProdMult;
        // CIV6 (France, EFFECT_ADJUST_WONDER_ERA_PRODUCTION): "+20% Production
        // toward Medieval, Renaissance, and Industrial era wonders" — an ERA
        // BAND, inclusive at both ends (`WONDER_ERA_PROD_ROWS`)
        if (q.kind === 'wonder' && seatMods.wonderEraProd.length) {
          const we = WONDER_ERA_INDEX[q.wonder] ?? 0;
          for (const r of seatMods.wonderEraProd) {
            if (we >= ERAS.indexOf(r.startEra) && we <= ERAS.indexOf(r.endEra)) _em *= 1 + r.pct / 100;
          }
        }
        // CIV6 (Pearl of the Danube): "+50% Production to Districts and
        // Buildings constructed ACROSS A RIVER from a City Center." A building
        // is built in its district, so its tile is that district's; a City
        // Center building never crosses a river from the centre it stands on.
        if (seatMods.riverCrossProd.length && (q.kind === 'district' || q.kind === 'building')) {
          const at = q.kind === 'district'
            ? q.tileIndex
            : civCity.districts.find((d) => d.type === BUILDINGS[q.building]?.district)?.tileIndex;
          if (at !== undefined && crossesRiver(state.map.tiles[civCity.centerIndex], state.map.tiles[at])) {
            for (const r of seatMods.riverCrossProd) if (r.kind === q.kind) _em *= 1 + r.pct / 100;
          }
        }
        // CIV6 (Iteru): "+15% Production towards Districts and Wonders built
        // next to a River."
        if ((q.kind === 'district' || q.kind === 'wonder') && seatMods.civ === 'EGYPT' && hasRiver(state.map.tiles[q.tileIndex])) {
          _em *= ITERU_RIVER_PROD_MULT;
        }
        // CIV6 (Ancestral Hall): "50% increased Production toward Settlers in
        // this city"; (Warlord's Throne): "Capturing an enemy City grants 20%
        // bonus Production in all Cities for 5 turns". Both are percentages, so
        // they join the cards' additive stack rather than compounding on it.
        let _bpct = q.kind === 'settler' ? cityBuildingSum(state, civCity, 'settlerProdPct') / 100 : 0;
        if ((actor.conquestProdTurns ?? 0) > 0) {
          _bpct += seatBuildingSum(state, actor.seat, 'conquestProdPct') / 100;
        }
        if (q.kind === 'unit' && unitIsMilitary(q.unit)) _bpct += milAllyWarPct;
        _em *= 1 + prodBoostPct(seatMods, q, actor.gpPerm) + _bpct;
        const progressBefore = q.progress;
        q.progress += production * _em;
        // Pay in the bank, exactly where the seat 0's endTurn does
        // (game.ts, right after the production add). Without this the field
        // written below would be write-only.
        if (civCity.productionBank) {
          q.progress += civCity.productionBank;
          civCity.productionBank = 0;
        }
        repairDrip(state, civCity, progressBefore);
        const cost =
          q.kind === 'unit'
            ? q.cost ?? UNITS[q.unit]?.cost ?? 54 // builders lock at queue
            : q.kind === 'building'
              ? buildingCostIn(state, civCity, q.building)
              : q.kind === 'wonder'
                ? BUILT_WONDERS[q.wonder]?.cost ?? 54 // catalog cost (already speed-scaled)
                : q.cost ?? 54; // settler / district / project carry their own cost
        if (q.progress >= cost) {
          civCity.queue.shift();
          completeQueueItem(state, civCity, q, cost, sciPerTurnSeat);
          // CIV6: a completion's OVERFLOW carries into the next item. The
          // shift has already happened, so `queue[0]` is that item; only a
          // queue that ran EMPTY has nowhere to put the hammers, and that is
          // the one case they bank and pay a turn late.
          //
          // The carry does NOT cascade: one completion per city per turn, so
          // an overflow big enough to finish the item behind it finishes it
          // NEXT turn. The GPU completes once per city per turn too, and a
          // second completion here would move the DRAW COUNT — a completion
          // can spawn a unit — against an engine that had not made it.
          const over = q.progress - cost;
          const next = civCity.queue[0];
          if (next) next.progress += over;
          else civCity.productionBank = (civCity.productionBank ?? 0) + over;
        }
      }
      civCity.cultureBox += culC;
      // CIV6 (Border Control Treaty, outcome B): "Target player's borders
      // cannot grow via Culture." The box still fills; nothing is bought.
      const _frozen = congressBorderFrozen(state, actor.seat);
      const civCityBorderCost = () =>
        Math.round(
          (borderGrowthCost(civCity.tilesAcquired) * getModifiers(state, actor.seat).borderCostMult * 100) /
            (100 + governorSum(state, civCity, (e) => e.borderExpansionPct)),
        );
      while (!_frozen && civCity.cultureBox >= civCityBorderCost()) {
        const next = pickBorderTile(state, civCity, makeYieldCtx(state, actor.seat));
        if (next === null) {
          civCity.cultureBox = Math.min(civCity.cultureBox, civCityBorderCost());
          break;
        }
        civCity.cultureBox -= civCityBorderCost();
        acquireTile(state, civCity, next);
      }
      const civCityCenter = state.map.tiles[civCity.centerIndex];
      // CIV6: walls give a city its ranged strike, and "if the Outer Defense of
      // a city or defensible district has been completely destroyed, its ranged
      // strike again becomes unavailable".
      const perimeter = outerPool(state, civCity) > 0;
      // CIV6 (Embrasure): "City gains an additional Ranged Strike per turn" —
      // it reaches every district of the city that has one, so the centre and
      // the Encampment each fire the extra shot, re-scanning for a target.
      const strikes = 1 + governorSum(state, civCity, (e) => e.extraStrikes);
      for (let sk = 0; perimeter && sk < strikes; sk++) {
        let bestTile = -1;
        let bestDist = 99;
        for (const t of state.map.tiles) {
          const d = hexDistance(civCityCenter.col, civCityCenter.row, t.col, t.row);
          if (d < 1 || d > 2) continue;
          // ANY unit hostile to this civ. A city's strike picks its
          // target by distance and combat strength, never by which enemy the
          // unit belongs to.
          if (visibleHostilesAt(state, t.index, actor).length === 0) continue;
          if (d < bestDist) {
            bestDist = d;
            bestTile = t.index;
          }
        }
        if (bestTile >= 0) {
          const hostiles = visibleHostilesAt(state, bestTile, actor);
          const defender = stackDefender(state, hostiles, true);  // a city strike is a SHOT
          const tt = state.map.tiles[bestTile];
          const defCS = defender.embarked
            ? embarkedDefenseCS(state, defender.seat) - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender)
              + promoCS(defender, { attacking: false, ranged: true, vsCity: true, tile: tt }); // the promotions it chose (embarked → flat override, none)
          // CIV6 (Military Advisory / Oligarchy / Fascism): a flat unit adder
          // is the unit's own strength wherever it fights, a city's shot
          // included.
          const defCSa = defCS + generalAuraCS(state, defender, bestTile)
            + gdrBeamCS(state, defender) // the beam "applies ... when defending"
            + congressUnitCS(state, defender) + governmentUnitCS(state, defender);
          // a survived Military Emergency pays its target +2 CS on every
          // City Strike against a member, forever
          const atkCS = cityStrikeStrength(state, civCity)
            + emergencyStrikeCS(state, civCity.seat, defender.seat);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'cstk', bestTile);
          awardDefenseXp(state, defender); // +2 to a surviving military defender (attacker is the city)
          warWearinessBattle(state, civCity.seat, defender.seat, bestTile,
            { dDied: defender.hp <= 0, city: true });
          // The STRIKER is the city, so the dig's era gate is its owner's —
          // the GPU passes `striker_row` at the same site.
          if (defender.hp <= 0) {
            unitKillEvent(state, civCity.seat, undefined, defender);
            killUnit(state, defender);
          }
        }
      }
      // CIV6: "building any level of Walls in the city will supply both" the
      // centre and the Encampment — each with its OWN pool — and the district
      // strikes on its own only "while its Wall defenses are still up".
      for (let sk = 0; sk < strikes; sk++) {
        const encD = civCity.districts.find((dd) => {
          const edt = state.map.tiles[dd.tileIndex];
          return encampmentIntact(edt) && encampOuterPool(state, civCity, edt) > 0;
        });
        if (!encD) break;
        // CIV6: the Encampment conducts a ranged strike of its OWN — the scan
        // measures from the district's tile, not the centre's.
        const encT = state.map.tiles[encD.tileIndex];
        let bestTile = -1;
        let bestDist = 99;
        for (const t of state.map.tiles) {
          const d = hexDistance(encT.col, encT.row, t.col, t.row);
          if (d < 1 || d > 2) continue;
          // ANY unit hostile to this civ. A city's strike picks its
          // target by distance and combat strength, never by which enemy the
          // unit belongs to.
          if (visibleHostilesAt(state, t.index, actor).length === 0) continue;
          if (d < bestDist) {
            bestDist = d;
            bestTile = t.index;
          }
        }
        if (bestTile >= 0) {
          const hostiles = visibleHostilesAt(state, bestTile, actor);
          const defender = stackDefender(state, hostiles, true);  // a city strike is a SHOT
          const tt = state.map.tiles[bestTile];
          const defCS = defender.embarked
            ? embarkedDefenseCS(state, defender.seat) - woundPenalty(defender)
            : (UNITS[defender.type]?.combat ?? 0) + terrainDefense(tt) - woundPenalty(defender)
              + promoCS(defender, { attacking: false, ranged: true, vsCity: true, tile: tt });
          const defCSa = defCS + generalAuraCS(state, defender, bestTile)
            + gdrBeamCS(state, defender)
            + congressUnitCS(state, defender) + governmentUnitCS(state, defender); // the cstk mirror
          // CIV6 (Expansion1_Emergencies.xml): the target's City Strike reward
          // is gated on COMBAT_DISTRICT_VS_UNIT — the Encampment's shot is a
          // district's too, so it pays the same +2 the centre's does.
          const atkCS = cityStrikeStrength(state, civCity)
            + emergencyStrikeCS(state, civCity.seat, defender.seat);
          defender.hp -= damageRoll(state, atkCS - defCSa, 'estk', bestTile);
          awardDefenseXp(state, defender);
          warWearinessBattle(state, civCity.seat, defender.seat, bestTile,
            { dDied: defender.hp <= 0, city: true });
          // The STRIKER is the city, so the dig's era gate is its owner's —
          // the GPU passes `striker_row` at the same site.
          if (defender.hp <= 0) {
            unitKillEvent(state, civCity.seat, undefined, defender);
            killUnit(state, defender);
          }
        }
      }
      // CIV6: "the city will automatically regain 20 HP per turn", war or
      // not — until it is ENCIRCLED, at which point "it will no longer be
      // able to repair the damage it suffers". The outer defenses are NOT on
      // this gate: "once damaged, the outer defenses of a City Center or
      // defensible district will not regenerate on their own", and come back
      // only through the Repair Outer Defenses project.
      // CIV6 (Defense Logistics): "City cannot be put under siege" — the ring
      // may close and the heal still runs.
      if (governorFlag(state, civCity, (e) => e.noSiege)
          || !encircled(state, civCityCenter, actor.seat)) {
        // CIV6: a City Center or Encampment caught in a blast has its HP and
        // Defense Strength reduced to 0, and "Healing is impossible ... while
        // the fallout lasts".
        if (!irradiated(state.map.tiles[civCity.centerIndex])) {
          civCity.hp = Math.min(CITY_MAX_HP, civCity.hp + CITY_HEAL_PER_TURN);
        }
        for (const d of civCity.districts) {
          if (d.type !== 'ENCAMPMENT') continue;
          const dt = state.map.tiles[d.tileIndex];
          if (dt.district !== 'ENCAMPMENT' || !dt.districtComplete || dt.districtPillaged) continue;
          // "This is an automatic action, which happens if its tile is not
          // occupied" — an enemy standing on the district holds it silent.
          if (unitsAt(state, dt.index).some((u) => unitsHostile(state, u, { seat: actor.seat }))) continue;
          if (!irradiated(dt)) {
            dt.encampHp = Math.min(ENCAMPMENT_HP, (dt.encampHp ?? ENCAMPMENT_HP) + CITY_HEAL_PER_TURN);
          }
        }
      }
    }

    for (const civCity of civCityDefectors) flipCity(state, civCity);

    const rsr = actor.research;
    // CIV6 (Alliance, level 1): the ally's routes INTO this seat pay the
    // receiver half of the typed route bonus - empire-level, per route.
    for (const o of state.seats) {
      if (o.seat === actor.seat) continue;
      const aty = allianceTypeWith(state, actor.seat, o.seat);
      if (aty >= 0 && ALLIANCE_ROUTE_FROM[aty] > 0 && ALLIANCE_ROUTE_YKEY[aty]) {
        const n = (o.tradeRoutes ?? []).filter((r) => r.toSeat === actor.seat).length;
        const amt = ALLIANCE_ROUTE_FROM[aty] * n;
        if (ALLIANCE_ROUTE_YKEY[aty] === 'science') sciSum += amt;
        else if (ALLIANCE_ROUTE_YKEY[aty] === 'culture') culSum += amt;
        else if (ALLIANCE_ROUTE_YKEY[aty] === 'gold') goldSum += amt;
        else if (ALLIANCE_ROUTE_YKEY[aty] === 'faith') faithSum += amt;
      }
      // CIV6 (Religious alliance 3): "+1 Faith for each of your Citizens
      // following your ally's religion."
      if (alliedAtLevel(state, actor.seat, o.seat, ALLIANCE_RELIGIOUS, 3)) {
        for (const c of actor.cities) {
          if (c.followedReligion === o.seat) faithSum += ALLIANCE_REL3_FAITH_PER_POP * c.population;
        }
      }
    }
    // CIV6 (The Last Prophet): "+1 Science for each foreign city following
    // Arabia's Religion" (`FOREIGN_FOLLOWER_YIELD_ROWS`)
    const foreignRows = getModifiers(state, actor.seat).foreignFollowerYields;
    if (foreignRows.length) {
      const foreign = foreignFollowerCount(state, actor.seat);
      for (const r of foreignRows) {
        const amt = r.amount * Math.floor(foreign / Math.max(1, r.per));
        if (r.yield === 'science') sciSum += amt;
        else if (r.yield === 'culture') culSum += amt;
        else if (r.yield === 'gold') goldSum += amt;
        else if (r.yield === 'faith') faithSum += amt;
      }
    }
    // the seat's OUTPUT this turn, stored for allies' percentage reads -
    // written before those reads, so the terms never compound
    actor.sciRate = sciSum;
    actor.culRate = culSum;
    for (const o of state.seats) {
      if (o.seat === actor.seat) continue;
      // CIV6 (Research alliance 3): "+10% of your ally's Science" while
      // researching a tech the ally completed, or the tech the ally is on.
      if (alliedAtLevel(state, actor.seat, o.seat, ALLIANCE_RESEARCH, 3) && rsr.tech
        && (o.research.techs.includes(rsr.tech) || o.research.tech === rsr.tech)) {
        sciSum += ALLIANCE_R3_SCI_PCT * (o.sciRate ?? 0);
      }
      // CIV6 (Cultural alliance 3): "+10% of your ally's Culture".
      if (alliedAtLevel(state, actor.seat, o.seat, ALLIANCE_CULTURAL, 3)) {
        culSum += ALLIANCE_C3_CUL_PCT * (o.culRate ?? 0);
      }
    }
    const gTech = goldenBoostBonus(state, actor.seat, false);
    const gCivic = goldenBoostBonus(state, actor.seat, true);
    const pickNext = () => {
      // The RESEARCH PICK arrives on the wire (applySeatActionRecord). A seat
      // with no pick banks progress with no current tech — the same wait the
      // GPU's `cur_tech == -1` already models.
    };
    pickNext();
    rsr.techProgress += sciSum;
    // LIFETIME science — the cultureTotal pattern, beside the stream add.
    // Every seat accrues (the GPU twin is seat_science_total rows 0..R);
    // lump grants (applyLumpGrant, goody maps) add to the same field.
    actor.scienceTotal = (actor.scienceTotal ?? 0) + sciSum;
    const bTech = rosterBoostPoints(state, actor.seat, false);
    while (rsr.tech && rsr.techProgress >= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech, bTech)) {
      rsr.techProgress -= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech, bTech);
      if (rsr.tech === URBAN_DEFENSES_TECH) urbanDefensesFit(state, actor.seat);
      for (const fx of TECHS[rsr.tech].effects) {
        // CIV6 (Global Warming Mitigation): "Awards 3 Envoys / Awards 1
        // Diplomatic Victory point" — once, at completion.
        if (fx.kind === 'award') {
          if (fx.envoys) actor.envoysAvailable = (actor.envoysAvailable ?? 0) + fx.envoys;
          if (fx.dvp) actor.diplomaticPoints = (actor.diplomaticPoints ?? 0) + fx.dvp;
        }
      }
      rsr.techs.push(rsr.tech);
      // CIV6 (EFFECT_GRANT_UNIT_IN_CITY): the roster's free unit at this
      // technology. The SPAWN waits for the upkeep charge below — a unit
      // granted this turn starts paying next turn, and the GPU's tech loop
      // sits on the same side of `_seat_upkeep_and_bankruptcy`.
      for (const g of seatMods.grantUnits) {
        if (g.tech !== rsr.tech || !g.unit) continue;   // a CLASS row is a founding grant
        grantedNow.push(g.unit);
      }
      delete rsr.techRetained[rsr.tech];
      rsr.tech = null;
      pickNext();
    }
    if (!rsr.tech && availableTechsIn(rsr).length === 0) rsr.techProgress = Math.min(rsr.techProgress, 0);
    rsr.civicProgress += culSum;
    // LIFETIME culture — the same per-turn sum, banked separately
    // because civicProgress is SPENT by every completed civic. Real Civ 6
    // scores DOMESTIC TOURISTS off lifetime culture, so this is the substrate
    // the Culture victory reads. Zero-draw; the GPU mirrors at this position.
    actor.cultureTotal = (actor.cultureTotal ?? 0) + culSum;
    actor.treasury = (actor.treasury ?? 0) + goldSum;
    faithSum += peacefulFounderFaith(state, actor.seat);
    actor.faith = (actor.faith ?? 0) + faithSum;
    seatAccumulators(state, actor.seat, rGovIds);
    actor.treasury -= state.units.reduce(
      (s, u) => s + (u.seat === actor.seat ? unitUpkeep(seatMods, u.type) : 0),
      0,
    );
    actor.treasury -= wmdUpkeep(state, actor.seat);
    if (Math.round(actor.treasury * 1000) < 0) {
      let victim: Unit | undefined;
      for (const u of state.units) {
        if (u.seat !== actor.seat) continue;
        const m = unitUpkeep(seatMods, u.type);
        if (m <= 0) continue;
        const vm = victim ? unitUpkeep(seatMods, victim.type) : 0;
        if (!victim || m > vm || (m === vm && u.id < victim.id)) victim = u;
      }
      if (victim) disbandUnit(state, victim.id);
    }
    // CIV6 (EFFECT_GRANT_UNIT_IN_CITY): the roster's technology grants, after
    // the upkeep they do not yet owe AND after the bankruptcy that upkeep may
    // force — the GPU's tech loop sits on the same side of both.
    for (const id of grantedNow) {
      const cap = actor.cities.find((c) => c.centerIndex === actor.capitalTile) ?? actor.cities[0];
      if (cap) spawnUnit(state, id, cap.centerIndex, actor.seat);
    }
    const bCivic = rosterBoostPoints(state, actor.seat, true);
    while (rsr.civic && rsr.civicProgress >= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost, gCivic, bCivic)) {
      rsr.civicProgress -= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost, gCivic, bCivic);
      for (const fx of CIVICS[rsr.civic].effects) {
        // CIV6 (Global Warming Mitigation): "Awards 3 Envoys / Awards 1
        // Diplomatic Victory point" — once, at completion.
        if (fx.kind === 'award') {
          if (fx.envoys) actor.envoysAvailable = (actor.envoysAvailable ?? 0) + fx.envoys;
          if (fx.dvp) actor.diplomaticPoints = (actor.diplomaticPoints ?? 0) + fx.dvp;
        }
      }
      rsr.civics.push(rsr.civic);
      delete rsr.civicRetained[rsr.civic];
      rsr.civic = null;
      pickNext();
    }
    if (!rsr.civic && availableCivicsIn(rsr).length === 0) rsr.civicProgress = Math.min(rsr.civicProgress, 0);
    // CIV6 (Legacy policy card): the card is unlocked by having BEEN in its
    // government, so the seat remembers the one it is in now. Only a
    // completed civic can move it, which is why this sits at the loop's exit.
    actor.government.held |= governmentBit(computeAdoption(rsr).government);

    // Builder actions (build best-Δ improvement or walk to a job).
    // driven-parity layer 5: the GPU stands the BUILDER POLICY down for
    // controlled seats ("controlled opponents' builders answer to the units
    // head", `active & ~controlled`); this call was ungated, TS builders kept

    advanceGreatPeople(state, actor.seat);

    // The BELIEF RACES — eager rules for EVERY seat row. Identities are
    // POLICY draws from the open pools; every gate and
    // draw mirrors the GPU's row-generic _seat_belief_claims (the
    // popen/ropen/eopen shapes), so the streams stay aligned. The open pools
    // are purely the claimed lists — every claim path (this block AND the
    // seat-0 UI verbs) pushes what it takes.
    // Pantheon: costs PANTHEON_FAITH_COST from this seat's own faith.
    if (actor.religion.pantheon === null && (actor.faith ?? 0) >= PANTHEON_FAITH_COST) {
      const open = Object.keys(PANTHEONS).filter((id) => !state.claimedPantheons.includes(id));
      if (open.length > 0) {
        actor.faith = (actor.faith ?? 0) - PANTHEON_FAITH_COST;
        const pick = open[Math.floor(nextRandom(state) * open.length)];
        state.claimedPantheons.push(pick);
        addEraScore(state, actor.seat, ERA_SCORE_PANTHEON);
        actor.religion.pantheon = pick; // the id IS the claim; effects apply via getModifiers
        state.eventLog.push(`${actor.name} founded a pantheon (${PANTHEONS[pick].name} is taken).`);
      }
    }
    // Religion: the canFoundReligion gates — a pantheon, a completed Holy
    // Site, an earned Prophet. Follower drawn FIRST, founder second (the
    // GPU's rf_/ro_ order).
    if (
      !actor.religion.founded &&
      actor.religion.pantheon !== null &&
      prophetsOf(actor) > 0 &&
      actor.cities.some((c) =>
        c.districts.some((d) => d.type === 'HOLY_SITE' && state.map.tiles[d.tileIndex].districtComplete),
      )
    ) {
      const followers = Object.keys(FOLLOWER_BELIEFS).filter((id) => !state.claimedBeliefs.includes(id));
      const founders = Object.keys(FOUNDER_BELIEFS).filter((id) => !state.claimedBeliefs.includes(id));
      if (followers.length > 0 && founders.length > 0) {
        const fPick = followers[Math.floor(nextRandom(state) * followers.length)];
        const oPick = founders[Math.floor(nextRandom(state) * founders.length)];
        state.claimedBeliefs.push(fPick);
        state.claimedBeliefs.push(oPick);
        actor.religion.founded = true;
        addEraScore(state, actor.seat, ERA_SCORE_RELIGION);
        actor.religion.follower = fPick;
        actor.religion.founder = oPick;
        actor.religion.holyTile = (actor.cities.find((c) => c.isCapital) ?? actor.cities[0])?.centerIndex ?? null;
        const name = RELIGION_NAMES[actor.seat % RELIGION_NAMES.length];
        state.eventLog.push(`${actor.name} founded ${name} — two beliefs left the pool.`);
      }
    }
    // Enhancer: a SECOND earned Prophet claims an enhancer belief, denying
    // it from the shared pool (the follower/founder mirror). The draw sits
    // AFTER the founder draw — the GPU's _next_random(eopen) position.
    if (actor.religion.founded && actor.religion.enhancer == null && prophetsOf(actor) >= 2) {
      const enhancers = Object.keys(ENHANCER_BELIEFS).filter((id) => !(state.claimedEnhancers ?? []).includes(id));
      if (enhancers.length > 0) {
        const ePick = enhancers[Math.floor(nextRandom(state) * enhancers.length)];
        (state.claimedEnhancers ??= []).push(ePick);
        actor.religion.enhancer = ePick; // identity kept — effects apply
        state.eventLog.push(`${actor.name} enhanced its religion (${ENHANCER_BELIEFS[ePick].name} is taken).`);
      }
    }


    const anyWar = atWarWithAny(state, actor.seat);
    for (const foe of warsOf(state, actor.seat)) {
      // ONE tick per pair per turn, at the pair's LOWER seat's tail — a major
      // always outranks its city-state foes (their seat ids sit at 100+).
      if (actor.seat < foe) setWarTurnsWith(state, actor.seat, foe, warTurnsWith(state, actor.seat, foe) + 1);
    }
    // ONE treaty countdown per pair per turn, at the pair's LOWER seat's tail —
    // the war clock's discipline, over the pairs that are NOT at war. Every
    // diplomatic AGREEMENT runs the same countdown here, and expires by
    // reaching zero; the border grant is directed, so it ticks twice.
    for (const other of [...state.seats.map((x) => x.seat), ...(state.cityStates ?? []).map((c) => c.seat)]) {
      if (actor.seat >= other) continue;
      const bound = treatyTurnsWith(state, actor.seat, other);
      if (bound > 0) setTreatyTurnsWith(state, actor.seat, other, bound - 1);
      if (!isCiv(other)) continue;
      const fr = friendTurnsWith(state, actor.seat, other);
      if (fr > 0) setFriendTurnsWith(state, actor.seat, other, fr - 1);
      const al = allyTurnsWith(state, actor.seat, other);
      if (al > 0) {
        // CIV6 (Alliance): points accrue "every turn", faster when the pair
        // trades - either direction pays its own quarter-point.
        // CIV6 (Mediterranean's Bride): "Trading with Allies earns twice as
        // many bonus Alliance Points"; (Adventures of Enkidu): "Their
        // Alliances gain Alliance Points for being at war with a common foe."
        const tradeQp = ALLIANCE_QP_ROUTE
          * (leaderOf(state, actor.seat) === 'CLEOPATRA' || leaderOf(state, other) === 'CLEOPATRA' ? CLEOPATRA_TRADE_QP_MULT : 1);
        const enkidu = leaderOf(state, actor.seat) === 'GILGAMESH' || leaderOf(state, other) === 'GILGAMESH';
        const commonFoe = enkidu && [...state.seats.map((x) => x.seat), ...(state.cityStates ?? []).map((c) => c.seat)]
          .some((f) => f !== actor.seat && f !== other && civsAtWar(state, actor.seat, f) && civsAtWar(state, other, f));
        setAlliancePtsWith(state, actor.seat, other, alliancePtsWith(state, actor.seat, other)
          + ALLIANCE_QP_TURN
          + (hasRouteToSeat(state, actor.seat, other) ? tradeQp : 0)
          + (hasRouteToSeat(state, other, actor.seat) ? tradeQp : 0)
          + (commonFoe ? ENKIDU_COMMON_FOE_QP : 0));
        // CIV6 (Military alliance 2): "Allies share visibility" - each
        // side's explored map folds into the other's, the fog this model keeps.
        if (alliedAtLevel(state, actor.seat, other, ALLIANCE_MILITARY, 2)) {
          const oa = seatOf(state, actor.seat);
          const ob = seatOf(state, other);
          if (oa?.explored && ob?.explored) {
            for (let ei = 0; ei < oa.explored.length; ei++) {
              const u = oa.explored[ei] | ob.explored[ei];
              oa.explored[ei] = u;
              ob.explored[ei] = u;
            }
          }
        }
        // CIV6 (Research alliance 2): "Every 30 turns (on Standard), you
        // unlock a Eureka for a tech that your ally has researched or
        // boosted, but you have not" - each side takes the first such tech
        // in catalog order. A side's pick is a tech the other already
        // holds, so the two picks never feed each other.
        if (state.turn % ALLIANCE_R2_BOOST_TURNS === 0
          && alliedAtLevel(state, actor.seat, other, ALLIANCE_RESEARCH, 2)) {
          const ra = actor.research;
          const rb = seatOf(state, other)!.research;
          for (const [me, al] of [[ra, rb], [rb, ra]] as const) {
            const pick = Object.keys(TECHS).find((tid) => (al.techs.includes(tid) || al.boosted.includes(tid))
              && !me.techs.includes(tid) && !me.boosted.includes(tid));
            if (pick) me.boosted.push(pick);
          }
        }
        setAllyTurnsWith(state, actor.seat, other, al - 1);
        // the TYPE is the live alliance's; the points are the pair's and stay
        if (al === 1) delete state.allianceType?.[warClockKey(actor.seat, other)];
      }
      for (const [g, h] of [[actor.seat, other], [other, actor.seat]] as const) {
        const ob = borderTurnsFrom(state, g, h);
        if (ob > 0) setBorderTurnsFrom(state, g, h, ob - 1);
      }
    }
    if (!anyWar) actor.peaceTurns += 1;
    // CIV6 (Warlord's Throne): the conquest window runs 5 turns and expires by
    // reaching zero, beside every other per-seat clock.
    if ((actor.conquestProdTurns ?? 0) > 0) actor.conquestProdTurns = (actor.conquestProdTurns ?? 0) - 1;
    if (recU) applySeatUnitOrders(state, actor, recU.units);
  }

  // Env-gated registry coherence check at the phase tail (after every
  // founding/placement/capture this turn). Off by default → zero cost + no
  // trajectory change; the GPU forced-compaction gate exercises the twin.
  // globalThis avoids a @types/node dependency (the src tsconfig has none).
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.CIV6_RC_REGISTRY_CHECK) {
    assertCityRegistryCoherent(state);
  }
}
