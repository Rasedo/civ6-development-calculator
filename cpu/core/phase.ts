
import type { City, CityState, CongressVote, DistrictId, Emergency, GameState, ImprovementId, SeatActionRecord, Seat, Tile, Unit, YieldKey } from './types';
import { logPopWrite } from './difflog';
import { advanceGreatPeople, passGreatPerson, patronizeGreatPerson } from './greatPeople';
import { activateGreatPerson } from './gpAbility';
import { GW_KINDS } from '../data/greatWorks';
import { drainRelicReserve, gwCountKind, gwHasRoom, gwLastOfKind, moveGreatWork } from './greatWorks';
import { completeQueueItem, dropQueuedBuilding, cultureBomb } from './production';
import { isExplored, revealAround, unitSight, unitSeesThrough } from './fog';
import { tilesWithin, hexDistance, hexRingWalk, neighbors, neighborTile } from '../../world/hex';
import { isWater, hasRiver, isCoastalLand } from '../../world/query';
import { isFloodplains } from '../../world/features';
import { ITERU_RIVER_PROD_MULT, EPIC_QUEST_LEVY_DISCOUNT_PCT, CLEOPATRA_TRADE_QP_MULT, HARDRADA_NAVAL_MELEE_PROD_MULT, ENKIDU_COMMON_FOE_QP, SKIP_FREE_CITY_ROWS, rowIsFor } from '../data/civilizations';
import { nextRandom } from './rand';
import { emergencyEnvoyIncome, seatAccumulators, seatGrowth, commitProduction } from './seatTurn';
import { spawnUnit, unitsAt, unitsHostile, unitIsMilitary, encampmentIntact, stepUnit, unitFullMoves, ownerHasTech, tileFreeForUnit, visibleHostilesAt , navalMelee, crossesRiver, builderHarvest, unitIsNoncombat } from './units';
import { cityStrikeStrength, cityStrikeDefenderCS, airPillage, airStrike, detonate, nukeTargets, siloReaches, shootable } from './combat';
import { nukeOffers } from './nuclear';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { applyTrainingGrants, meleeAttack, rangedAttack, hostileRangedStrike, damageRoll, awardDefenseXp, encircled, stackDefender, unitAttackRange } from './combat';
import { promoClassOf, promoValue, takePromotion } from './promotions';
import { PROMO_COLS, UNIT_PROMO_CLASS, type PromoClass } from '../data/promotions';
import { availableTechsIn, availableCivicsIn, computeUnlocks, isCivicComplete, type Unlocks , prodMultFor, notFoundedSum, peacefulFounderFaith, foreignFollowerCount, greatWorkLoyalty, goldPrice, faithPrice } from './effects';
import { detectBoosts, effectiveResearchCostIn, rosterBoostPoints } from './boosts';
import { selectResearch, pillagePlunder } from './economy';
import { IMPROVEMENTS } from '../data/improvements';
import { isSpaceProject } from '../data/projects';
import { containmentBonus, sameReligionToken, getModifiers, makeYieldCtx, prodBoostPct, seatYieldMultPerSuzerain, unitUpkeep } from './effects';
import { allRoadsLeadToRome, addTradeRoute, addCsTradeRoute, addIntlTradeRoute, cancelRoutesBetween, congressCancelBannedIntl, tradeRouteExpiry, tradeRouteWalk } from './trade';
import { addEnvoys, allianceSuzInfluence, cityStateById, declareWarOnCityState, envoysOf, hasMet, isSuzerain, issueQuest, questSatisfied, resolveSuzerains, setMet, sueForPeaceWithCityState, suzerainBuildingLoyalty, suzerainProjectMult } from './cityStates';
import { LEVY_TURNS, INFLUENCE_PER_TURN, ENVOY_COST, GOV_INFLUENCE_TIER, QUEST_COOLDOWN, QUEST_ENVOYS, FREE_WALK_STEPS, FREE_WALK_WEIGHTS, CITY_STATE_MAX_HP } from '../data/cityStates';
import { freeCityBuild, freeCityResearch, minorBestOfClass, trainableIn } from './minorBuild';
import { FREE_CITY_PAIR_CLASS, LOYALTY_RELIGION_MATCHING, LOYALTY_RELIGION_MISMATCHING, LOYALTY_STARVATION } from '../data/seats';
import { landWalker, walkUnit } from './walker';
import { POLICY_LIST } from '../data/policies';
import { PROJECTS, PROJECT_LIST, projectConversionRate } from '../data/projects';
import { adoptGovernment, carryPolicies, seatGovernment, governmentBit, inDarkAge, unlockedPolicyIds, fitPolicies, governmentSlots, governmentChanges, policySetChanges, policyUnlockCost } from './effects';
import type { RuleResult } from './rules';
import { TECHS, type ResearchEffect } from '../data/techs';
import { BUILDINGS, SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { prodLayout } from './prodLayout';   // ONE column layout, shared with the exporter
import { CIVICS } from '../data/civics';
import { RESOURCES } from '../../world/resources';
import { UNITS, UNIT_TYPE_IDX, UNIT_ERA_INDEX, CITY_HEAL_PER_TURN, ENCAMPMENT_HP, CITY_MAX_HP, URBAN_DEFENSES_TECH, FORMATION_CIVIC, FORMATION_COST_MULT, FORMATION_TRAIN_DISCOUNT, FORMATION_TRAIN_BUILDING } from '../data/units';
import { availableBuildings, buildingCompletable, buildingCostIn, purchasableBuildings, outerPool, wallsMax, urbanDefensesFit, repairDrip, fitEncampOuter, encampOuterPool } from './rules';
import { generalAuraMP } from './aura'; // the aura's +1 MP half
import { PANTHEONS, PANTHEON_FAITH_COST } from '../data/religion';
import { CITY_WORK_RADIUS, scaleByGameSpeed, GOLD_PURCHASE_MULT, MP_SCALE, RAILROAD_TECH, borderGrowthCost, FAITH_PURCHASE_MULT, amenityTierIndex } from '../data/constants';
import { cityDistrictSum, darkBuildings, stampBuildingEra } from './yields';
import type { CityStats } from './city';
import { beliefSeatYields, computeCityStats, cityBuildingSum, luxuryAmenities, drawBorderPlot, acquireTile, placeIdleCitizens, seatBuildingSum, swapTileOk } from './city';
import { accrueStockpiles, canTrainWithStockpile, chargeUnitResource, chargeUnitUpkeep, layRailroad, resolveSeatPower } from './stockpile';
import { ageReactors } from './disasters';
import { droughtBars } from '../data/disasters';
import { congressSession, congressBorderFrozen, congressLoyaltyDelta, congressPolicyBlocked, congressProjectMult, congressEnergyProdMult, congressUdtProdDistrict, congressSessionDue, congressVoter } from './congress';
import { buyVotes } from './congress';
import { CONGRESS_SPECIAL_SLOT, EMG_CALLED, EMG_PENDING, EMG_RUNNING, EMERGENCY_CITY_STATE, EMERGENCY_MILITARY, EMERGENCY_NUCLEAR, emergencies, emergencyLoyalty, emergencyName, emergencyPressureCut, emergencyStrikeCS, raiseEmergency } from './emergency';
import { irradiated, wmdUpkeep } from './nuclear';
import { EMERGENCIES, EMERGENCY_MEMBER_FAVOR, EMERGENCY_TARGET_FAVOR, SPECIAL_SESSION_COST, SPECIAL_SESSION_GAP, PRODUCTION_QUEUE_MAX } from '../data/seats';
import { logDistrictCost } from './difflog';
import { canBuildRoad, canBuildRailroad, canPlaceDistrictIn, canPlaceWonder, suzerainNames, adjacentPlotRowOk, adjacentPlotTarget, portalExit, PORTAL_MP, validImprovementsIn, wonderExists } from './rules';
import { BUILT_WONDERS, type BuiltWonderDef } from '../data/builtWonders';
import { seatWonders } from './wonders';
import { cleanFallout, escortUnit, breakEscort, disbandUnit, builderCost, traderCost, builderRemoveFeature, trainableUnits, goldBuyableUnits, purchaseSpotBlocked, archaeologistExcavate, naturalistPark, performConcert, upgradeUnit, unitDomain, formationBanned, garrisonOf } from './units';
import { killUnit } from './combat';
import { adoptBeliefs, unitProdCostMult, availableProjects, buyTile, buyWorshipBuilding, purchaseBuildingWithFaith, purchaseUnitWithFaith, wallsGoldBlocked, boostProject, wonderChargeBoost, condemnHeretic, formUp, convertHeathens, districtScaledBase, districtDiscounted, refreshDistrictDiscount, engineerFinish, foundCity, goldAffordable, isEncampHarborItem, launchInquisition, evangelizeBelief, purchaseCivilianWithFaith, purchaseNaturalist, purchaseReligiousUnit, purchaseRockBand, purchaseSettler, queueProject, removeHeresy, guruHeal, settlerCost, unitGoldPrice, unitStepCost, unitsAcquired, districtVariantCost, buildingPurchaseCost, spreadReligiousPressure } from './game';
import { DISTRICTS, PLACEABLE_DISTRICTS, SCAFFOLD_DISTRICTS } from '../data/districts';
import { IMPROVEMENT_IDS, DEDICATED_IMPROVEMENTS, unitActionIndex, AIR_STRIKE_COLS, AIR_REBASE_COLS, AIR_DEPLOY_COLS, NUKE_COLS, SPY_TRAVEL_COLS, SPY_MISSIONS } from './unitActions';
import { airPillageTargets, airStrikeTargets, rebaseTargets, rebaseAir, displaceAirFrom, deployAir, deployTargets, priorityTargets, returnToBase } from './air';
import { beginMission, beginTravel, isSpy, spyDestinations, tickSpies, tickSpyEffects } from './espionage';

const A_FOUND_CITY = unitActionIndex(IMPROVEMENT_IDS).FOUND_CITY;
const A_EXCAVATE = unitActionIndex(IMPROVEMENT_IDS).EXCAVATE;
const A_UPGRADE = unitActionIndex(IMPROVEMENT_IDS).UPGRADE;
const A_AIR_STRIKE = unitActionIndex(IMPROVEMENT_IDS).AIR_STRIKE_0;
const A_NUKE = unitActionIndex(IMPROVEMENT_IDS).NUKE_0_0;
const A_REBASE = unitActionIndex(IMPROVEMENT_IDS).REBASE_0;
const A_AIR_PILLAGE = unitActionIndex(IMPROVEMENT_IDS).AIR_PILLAGE_0;
const A_DEPLOY = unitActionIndex(IMPROVEMENT_IDS).DEPLOY_0;
const A_RETURN_TO_BASE = unitActionIndex(IMPROVEMENT_IDS).RETURN_TO_BASE;
const A_PRIORITY_TARGET = unitActionIndex(IMPROVEMENT_IDS).PRIORITY_TARGET_0;
const A_SPY_TRAVEL = unitActionIndex(IMPROVEMENT_IDS).SPY_TRAVEL_0;
const A_SPY_MISSION = unitActionIndex(IMPROVEMENT_IDS).SPY_MISSION_0;
const A_PARK = unitActionIndex(IMPROVEMENT_IDS).PARK;
const A_PERFORM = unitActionIndex(IMPROVEMENT_IDS).PERFORM_CONCERT;
const A_BOOST = unitActionIndex(IMPROVEMENT_IDS).BOOST_PROJECT;
const A_FORM_UP = unitActionIndex(IMPROVEMENT_IDS).FORM_UP_0;
const A_ESCORT = unitActionIndex(IMPROVEMENT_IDS).ESCORT;
const A_BREAK_ESCORT = unitActionIndex(IMPROVEMENT_IDS).BREAK_ESCORT;
const A_PROMOTE = unitActionIndex(IMPROVEMENT_IDS).PROMOTE_0;
const A_CONDEMN = unitActionIndex(IMPROVEMENT_IDS).CONDEMN;
const A_HEAL_RELIGIOUS = unitActionIndex(IMPROVEMENT_IDS).HEAL_RELIGIOUS;
const A_REMOVE_HERESY = unitActionIndex(IMPROVEMENT_IDS).REMOVE_HERESY;
const A_LAUNCH_INQUISITION = unitActionIndex(IMPROVEMENT_IDS).LAUNCH_INQUISITION;
const A_EVANGELIZE = unitActionIndex(IMPROVEMENT_IDS).EVANGELIZE_BELIEF;
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
const A_PORTAL = unitActionIndex(IMPROVEMENT_IDS).PORTAL;
const A_ACTIVATE_GP = unitActionIndex(IMPROVEMENT_IDS).ACTIVATE_GP;
import { AGREEMENT_TURNS, ALLIANCE_CIVIC, ALLIANCE_CULTURAL, ALLIANCE_E2_INFLUENCE, ALLIANCE_MILITARY, ALLIANCE_M2_MIL_PROD_PCT, ALLIANCE_QP_ROUTE, ALLIANCE_QP_TURN, ALLIANCE_R2_BOOST_TURNS, ALLIANCE_R3_SCI_PCT, ALLIANCE_C3_CUL_PCT, ALLIANCE_RESEARCH, ALLIANCE_REL3_FAITH_PER_POP, ALLIANCE_RELIGIOUS, ALLIANCE_ROUTE_FROM, ALLIANCE_ROUTE_YKEY, DEAL_ITEMS, DEAL_OFFER_TURNS, DELEGATION_COST, EMBASSY_COST, EMBASSY_CIVIC, CIV_LEADERS, MAX_CITIES_PER_SEAT, OPEN_BORDERS_CIVIC, WAR_MIN_TURNS, PEACE_TREATY_TURNS, PEACE_GOLD_COST, LOYALTY_MAX, LOYALTY_RANGE, LOYALTY_PRESS_MAX_LOYALTY, LOYALTY_PRESS_MAX_RATIO, LOYALTY_PRESS_NEUTRAL_LOYALTY, LOYALTY_PRESS_NEUTRAL_RATIO, CITIZEN_PRESSURE_BASE, CITIZEN_PRESSURE_CAPITAL, LOYALTY_AMENITY, FREE_CITY_LOYALTY_PER_TURN, LOYALTY_AFTER_CULTURAL_TRANSFER, FREE_CITY_PAIR_COUNT, FREE_CITY_GRANT_PERIOD, FREE_CITY_GRANT_CLASSES, FREE_CITY_GRANT_WEIGHTS, bankruptDisbands, goldShortfall, GOVERNOR_LOYALTY, CONGRESS_MIN_ERA, CONGRESS_PROD_MULT } from '../data/seats';
import { resolveCompetition } from './competition';
import { acceptDeal, dealPhase, setDealOffer } from './deals';
import { hiddenResourcesFor } from './seats';
import { grievanceCityTaken, grievanceDenounce, grievanceLastCity, grievanceWarDeclared, grievanceWith, settlePromises } from './grievance';
import { levyMoment, pantheonMoment, transferMoments, agePressure, goldenBoostBonus, worldEraIndex } from './eras';
import { cityAppealResolver, cityGovernorEstablished, governorFlag, governorLoyaltyAura, governorMult, governorPhase, governedCityIds, governorSum, cityGovernorPromos } from './governors';
import { NO_SEAT, civOf, alliancePtsWith, allianceTypeWith, alliedAtLevel, allyTurnsWith, atWarWithAny, borderTurnsFrom, campTiles, citiesOf, civsAtWar, cityStateOfSeat, clearDelegations, delegationWith, setDelegationWith, denounceActive, friendTurnsWith, isCiv, isCityStateSeat, isTerritorial, seatOf, seatOfCityState, seatsAllied, seatsFriends, setAllianceTypeWith, setAlliancePtsWith, setAllyTurnsWith, setBorderTurnsFrom, setFriendTurnsWith, setTileOwner, setWar, setWarKind, clearWarKind, setTreatyTurnsWith, setWarTurnsWith, tileBelongsTo, tileCity, tileOwnedByCiv, tileSeat, unitsOf, treatyTurnsWith, warClockKey, warTurnsWith, warsOf, hasRouteToSeat , leaderOf, warBanned, cityAtTile, onHomeContinent, FREE_SEAT, isFreeSeat, freeSeatOf, cityHolders, civLevelOf, tileClaimed } from './seats';
import { warWearinessBattle, warWearinessPeace, warWearinessTurn } from './weariness';
import { snipeRing, snipeRing3, spreadFromUnit } from './unitOrders';
import { unitKillEvent, buildingDedications, goldenDedication } from './eras';
import { defaultWarKind, warBuffProdPct, warKindAllowed } from './casusBelli';
import { WAR_KINDS, WAR_KIND_FORMAL, WAR_KIND_SURPRISE } from '../data/warKinds';
import { DED_TO_ARMS, DED_STEAM, TO_ARMS_MIL_PROD_MULT, STEAM_WONDER_PROD_MULT } from '../data/seats';
import { WONDER_ERA_INDEX } from '../data/builtWonders';
import { INDUSTRIAL_ERA_INDEX, ERAS } from '../data/techs';

import { gpCityPermOf } from '../data/greatPeople';

const ok: RuleResult = { ok: true };
const no = (reason: string): RuleResult => ({ ok: false, reason });

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

export function nextCityName(actor: Seat): string {
  const leader = CIV_LEADERS.find((l) => l.name === actor.name);
  const names = leader?.cityNames ?? [actor.name];
  const n = actor.nextCityId;
  return n < names.length ? names[n] : `${names[0]} ${n + 1}`;
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
    best = Math.min(best, hexDistance(state.map, at.col, at.row, bt.col, bt.row));
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

/**
 * `declarer` DECLARES a war of `kind` on `target` — the ONE body every path
 * that opens a war between two majors runs (the record's war column, the
 * nuclear strike's blast): the gates, then the war axis and its clock, the
 * routes the war cancels, the border grant and the missions it ends, the
 * kind and the grievance it prices, and the pacts it drags in. The GPU twin
 * is `_declare_war_major`.
 *
 * CIV6 (DiplomaticActions.xml): `kind` is a `WAR_KINDS` code the declarer
 * must hold the casus belli for (`warKindAllowed`); -1 takes
 * `defaultWarKind`. CIV6 (Declaring Friendship): Declared Friends "cannot
 * undertake hostile actions (such as Denouncing or going to war) against
 * each other"; an ally is a friend twice over.
 */
export function declareWar(state: GameState, declarer: number, target: number, kind = -1, agreed = false): RuleResult {
  const actor = seatOf(state, declarer);
  const foe = seatOf(state, target);
  if (!actor || !foe || declarer === target) return no('No such civilization.');
  if (civsAtWar(state, declarer, target)) return no('Already at war.');
  if (seatsAllied(state, declarer, target) || seatsFriends(state, declarer, target)) return no('A friend cannot be attacked.');
  const bound = treatyTurnsWith(state, declarer, target);
  if (bound > 0) return no(`The peace treaty binds for another ${bound} turns.`);
  const k = kind < 0 ? defaultWarKind(state, declarer, target) : kind;
  if (!warKindAllowed(state, declarer, target, k, agreed)) return no('No casus belli for that war.');
  // CIV6 (Faces of Peace): the war kind is what the ban reads, so every pure
  // read above moves AHEAD of the first mutation (`WAR_BAN_ROWS`)
  if (warBanned(state, declarer, target, k !== WAR_KIND_SURPRISE)) {
    return no('This civilization may not declare that war.');
  }
  setWar(state, declarer, target, true);
  setWarTurnsWith(state, declarer, target, 0);
  // CIV6 (Trade Route): "When war is declared, any existing Trade Routes
  // between the two civilizations are cancelled, and the Traders servicing
  // them are immediately recalled to their origin cities."
  cancelRoutesBetween(state, declarer, target);
  // An OPEN BORDERS grant cannot outlive the peace it was signed in; war
  // opens the border it was lifting.
  setBorderTurnsFrom(state, declarer, target, 0);
  setBorderTurnsFrom(state, target, declarer, 0);
  // CIV6: "when war is declared, delegations and ambassadors are kicked out"
  // — the pair loses both halves, not the declarer's.
  clearDelegations(state, declarer, target);
  setWarKind(state, declarer, target, k);
  grievanceWarDeclared(state, declarer, target, k);
  state.eventLog.push(`${actor.name} declares a ${WAR_KINDS[k].id} war on ${foe.name}!`);
  defensivePact(state, declarer, target);
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
    setWarKind(state, ally.seat, aggressor, WAR_KIND_FORMAL);
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
  clearWarKind(state, actor.seat, foe);
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

/** The military units a city-state holds now — what a levy takes. */
export function minorArmy(state: GameState, cityState: CityState): Unit[] {
  return state.units.filter((u) => u.seat === cityState.seat && unitIsMilitary(u.type));
}

/** THE LEVY'S PRICE: the speed-scaled production cost of every military
 *  unit it takes, summed — the same for every major (`GetLevyMilitaryCost`,
 *  runs/c38s4_levy_20260926T125629Z.jsonl: 11 of 11 minors; the install's
 *  LEVY_MILITARY_PERCENT_OF_UNIT_PURCHASE_COST 25 of the unfloored purchase
 *  price, `GOLD_PURCHASE_MULT` 4 x the cost, is that number). Then each
 *  MODIFIER_PLAYER_ADJUST_LEVY_DISCOUNT_PERCENT row the seat holds takes its
 *  percent off in turn, each truncating — CIV6 (Epic Quest) "Levying units
 *  from a city-state costs 50% less Gold", then (Foreign Ministry)
 *  "Leveraging City States costs half Gold" per standing Foreign Ministry,
 *  buildings in catalog order: both rows pay 25%, never nothing. */
export function levyGoldCost(state: GameState, seat: number, cityState: CityState): number {
  let cost = 0;
  for (const u of minorArmy(state, cityState)) cost += UNITS[u.type].cost;
  const off = (pct: number) => { cost = Math.floor((cost * (100 - pct)) / 100); };
  if (civOf(state, seat) === 'SUMERIA') off(EPIC_QUEST_LEVY_DISCOUNT_PCT);
  for (const def of Object.values(BUILDINGS)) {
    if (!def.levyDiscountPct) continue;
    for (const city of citiesOf(state, seat)) {
      if (city.buildings.includes(def.id) && !darkBuildings(state.map, city).has(def.id)) off(def.levyDiscountPct);
    }
  }
  return cost;
}

/**
 * LEVY MILITARY. CIV6 (LOC_CITY_STATES_LEVY_MILITARY_DETAILS): "The Suzerain
 * of this city-state can pay {1_GoldCost} Gold to take temporary control of
 * all its current military units. The units will not be able to move on the
 * turn they are levied, but will take orders from the Suzerain on the
 * following turn. They will return to the city-state after {2_TurnLimit}
 * Turns, or if the Suzerain changes" (`minorLevyReturn`) — and "You have
 * already levied the military of this city-state" while they are out.
 */
export function levyUnits(state: GameState, cityStateId: number, seat: number): RuleResult {
  const cityState = state.cityStates.find((c) => c.id === cityStateId);
  if (!cityState) return no('No such city-state.');
  if (!isSuzerain(state, cityState, seat)) return no('You must be suzerain (3+ envoys).');
  if (cityState.levySeat !== undefined) return no('Its military is already levied.');
  const army = minorArmy(state, cityState);
  if (army.length === 0) return no('It has no military units to levy.');
  if (!state.sandbox) {
    const cost = levyGoldCost(state, seat, cityState);
    if (!goldAffordable(seatOf(state, seat)!.treasury, cost)) return no(`Levy costs ${cost} gold.`);
    seatOf(state, seat)!.treasury -= cost;
  }
  for (const u of army) {
    u.seat = seat;
    // the mark the Raven King's clauses read (its +2 Movement, +5 Combat and
    // 75% upgrade discount) and what brings the unit home
    u.leviedFrom = cityState.seat;
    u.movesLeft = 0;
  }
  cityState.levySeat = seat;
  cityState.levyEnds = state.turn + LEVY_TURNS;
  // CIV6 (Raven King, EFFECT_GRANT_INFLUENCE_TOKEN_LEVY_MILITARY): the levy
  // hands two Envoys back (`LEVY_ROWS`)
  for (const r of getModifiers(state, seat).levy) {
    if (r.envoys) seatOf(state, seat)!.envoysAvailable = (seatOf(state, seat)!.envoysAvailable ?? 0) + r.envoys;
  }
  levyMoment(state, seat);
  state.eventLog.push(`${cityState.name} levies its army of ${army.length} to your cause.`);
  return ok;
}

/** The CITIZEN pressure a list of cities puts on the tile `here`. CIV6 (the
 *  Loyalty pedia): "Each Citizen exerts a base pressure of 1 ... Citizens in
 *  a Capital city exert an additional 1 pressure. Golden and Heroic Ages add
 *  0.5 for all Citizens, while Dark Ages subtract 0.5. This Citizen pressure
 *  affects cities within 9 tiles, but is 10% less effective per tile
 *  distant." Each city's citizens — its population less its owner's
 *  `emergencyPressureCut`, never below 0 — press at base + capital + age
 *  each, weighted by (CUTOFF − d) / CUTOFF (CUTOFF = LOYALTY_RANGE + 1,
 *  CITIZEN_IDENTITY_PRESSURE_RADIUS_CUTOFF), all in the DLL's 24.8 fixed
 *  point: the weight floored to 256ths, each city's product floored
 *  (runs/h1_duelw1112 Yiyang t192: own 3.79, foreign 3.59 in 256ths read
 *  the game's 0.546875 where the reals read 0.411; the H-1 duels' recorded
 *  terms 2,036 -> 2,092 of 2,097 on 1112, 2,038 -> 2,092 of 2,114 on 1106,
 *  1,619 -> 1,751 of 1,843 on 1110). The sum is in pressure units. */
function citizenPressure(state: GameState, here: Tile, cities: City[]): number {
  const cutoff = LOYALTY_RANGE + 1;
  let raw = 0;
  for (const c of cities) {
    const t = state.map.tiles[c.centerIndex];
    const d = hexDistance(state.map, here.col, here.row, t.col, t.row);
    if (d <= LOYALTY_RANGE) {
      const each = CITIZEN_PRESSURE_BASE + (c.isCapital ? CITIZEN_PRESSURE_CAPITAL : 0) + agePressure(state, c.seat);
      const w = Math.floor((FIXED_ONE * (cutoff - d)) / cutoff);
      const cits = Math.max(0, c.population - emergencyPressureCut(state, c.seat));
      raw += Math.floor((cits * Math.round(each * FIXED_ONE) * w) / FIXED_ONE);
    }
  }
  return raw / FIXED_ONE;
}

/** The DLL's fixed point: 24.8, one unit 256 raw. */
const FIXED_ONE = 256;

/** The own-against-foreign pressure term. CIV6
 *  (LOYALTY_PER_TURN_FROM_NEARBY_CITIZEN_PRESSURE_*; the DLL's 0x1a1ae0, all
 *  in 24.8 fixed point): the stronger side over the weaker is a ratio r =
 *  hi / lo floored to 256ths, clamped into [NEUTRAL_RATIO, MAX_RATIO]; t =
 *  (r − NEUTRAL_RATIO) / (MAX_RATIO − NEUTRAL_RATIO) floored to 256ths; the
 *  term is NEUTRAL_LOYALTY + (MAX_LOYALTY − NEUTRAL_LOYALTY)·t floored,
 *  clamped into [NEUTRAL_LOYALTY, MAX_LOYALTY], negated when the foreign side
 *  presses harder. A side with no pressure at all against one with some is
 *  the full MAX_LOYALTY; nobody pressing is 0. `own` and `foreign` are
 *  `citizenPressure` sums, whole 256ths. `_pressure_term` is the GPU twin. */
export function pressureTerm(own: number, foreign: number): number {
  const o = Math.round(own * FIXED_ONE);
  const f = Math.round(foreign * FIXED_ONE);
  const hi = Math.max(o, f);
  const lo = Math.min(o, f);
  if (hi <= 0 || o === f) return 0;
  const maxL = LOYALTY_PRESS_MAX_LOYALTY * FIXED_ONE;
  const neuL = LOYALTY_PRESS_NEUTRAL_LOYALTY * FIXED_ONE;
  let mag = maxL;
  if (lo > 0) {
    const maxR = Math.round(LOYALTY_PRESS_MAX_RATIO * FIXED_ONE);
    const neuR = Math.round(LOYALTY_PRESS_NEUTRAL_RATIO * FIXED_ONE);
    const r = Math.min(maxR, Math.max(neuR, Math.floor((hi * FIXED_ONE) / lo)));
    const t = Math.floor(((r - neuR) * FIXED_ONE) / (maxR - neuR));
    mag = Math.min(maxL, Math.max(neuL, neuL + Math.floor(((maxL - neuL) * t) / FIXED_ONE)));
  }
  return (o > f ? mag : -mag) / FIXED_ONE;
}

export function loyaltyDelta(state: GameState, city: City, amenityTierName: string): number {
  const here = state.map.tiles[city.centerIndex];
  let own = 0;
  let foreign = 0;
  for (const s of state.seats) {
    const sub = citizenPressure(state, here, s.cities);
    if (s.seat === city.seat) own += sub;
    // CIV6 (Cultural alliance 1): "Allies do not exert Loyalty pressure on
    // each other."
    else if (!alliedAtLevel(state, city.seat, s.seat, ALLIANCE_CULTURAL, 1)) foreign += sub;
  }
  // CIV6: a Free City's citizens press on their neighbours like any other
  // city's. The Free Cities player has no age, so they press at the base.
  if (state.freeSeat) foreign += citizenPressure(state, here, state.freeSeat.cities);
  return pressureTerm(own, foreign) + (LOYALTY_AMENITY[amenityTierName] ?? 0) + standingLoyalty(state, city)
    + greatWorkLoyalty(state, city);
}

/** A FREE CITY's loyalty per turn. CIV6 (IDENTITY_PER_TURN_FROM_FREE_CITIES):
 *  the Free Cities player makes `FREE_CITY_LOYALTY_PER_TURN` for its city,
 *  where a major's city takes its owner's amenity, governor, policy and roster
 *  terms — and the Free Cities player carries none of those. Its own side of
 *  the pressure term is every Free City's citizens; the foreign side is every
 *  major's, its age in each citizen's term; and what STANDS in the city pays its
 *  flat loyalty to whoever holds it. Each major's share also accrues into the
 *  city's `freePressure` race — "the most Loyalty pressure on it since the
 *  Free City became independent". */
export function freeCityLoyaltyDelta(state: GameState, city: City): number {
  const here = state.map.tiles[city.centerIndex];
  const own = citizenPressure(state, here, state.freeSeat?.cities ?? []);
  const race = (city.freePressure ??= state.seats.map(() => 0));
  let foreign = 0;
  for (const s of state.seats) {
    const sub = citizenPressure(state, here, s.cities);
    foreign += sub;
    race[s.seat] = (race[s.seat] ?? 0) + sub;
  }
  return FREE_CITY_LOYALTY_PER_TURN + pressureTerm(own, foreign) + builtLoyalty(state, city);
}

/**
 * THE BORDER, for ANY city: its Culture fills a box, and every time the box
 * covers the next tile's price the city takes the best tile it can reach.
 *
 * CIV6 (City-state): the install has ONE city rule, so a minor's city claims
 * ground exactly as a major's does — which is why this is a composer rather
 * than a block inside the seat loop.
 *
 * CIV6 (Border Control Treaty, outcome B): "Target player's borders cannot
 * grow via Culture." The target's culture turn does NOTHING: its boxes bank
 * no culture and its cities draw no next plot, a stored one standing
 * (runs/h1_duelw1112, Rome's seat t142-181: every box held to the digit,
 * Ravenna's stored plot kept until a purchase cleared it, none drawn after).
 */
/**
 * The Culture a city's border box takes this turn: the city as its growth
 * left it. CIV6: the game reads the city's Culture after the growth step
 * (runs/h1_duelw1104, Nidaros t5 → 6: box 4.195 + 1.723 − 5, the 1.723 its
 * post-growth yield; Rome's growth turn t3 in 1103 and 1104 likewise), so a city whose
 * population moved is read again — its luxuries re-ranked, its citizens
 * re-placed — and one that did not keeps the read it grew on. The GPU twin is
 * `_culture_after_growth`.
 */
export function cultureAfterGrowth(state: GameState, city: City, popBefore: number, stats: CityStats): number {
  if (city.population === popBefore) return stats.total.culture;
  return computeCityStats(state, city).total.culture;
}

/**
 * CIV6 (City_Culture, the DLL's border turn 0x1a9bc0): the box banks the
 * culture — the border-expansion percents (Land Acquisition's, Religious
 * Settlements') scale what is banked, never the price.
 * A box that covers the price pays it and takes at most ONE plot: the stored
 * `nextPlot` while still unowned, else a fresh draw, and nothing when nothing
 * is in reach (the price is spent all the same). Then, every turn, the city
 * draws and stores its next plot (`drawBorderPlot`).
 *
 * CIV6 (`CivilizationLevels`): `CanAnnexTilesWithCulture` is TRUE for a full
 * civ and FALSE for every other class of player — a city-state, the Free
 * Cities player and a barbarian tribe bank no culture and buy nothing, yet
 * still draw their next plot (runs/h1_duelw1112: the three city-states' boxes
 * read 0 every record, each holding a next plot). A minor takes ground
 * through the ENVOY channel instead (`CanAnnexTilesWithReceivedInfluence`).
 */
export function cityBorderGrowth(state: GameState, city: City, seat: number, culture: number): void {
  if (congressBorderFrozen(state, seat)) return;
  const ctx = makeYieldCtx(state, seat);
  const annex = civLevelOf(seat).canAnnexTilesWithCulture;
  if (annex) {
    const pct = governorSum(state, city, (e) => e.borderExpansionPct) + getModifiers(state, seat).borderExpansionPct;
    city.cultureBox += pct ? (culture * (100 + pct)) / 100 : culture;
  }
  const cost = borderGrowthCost(city.tilesAcquired);
  if (annex && city.cultureBox >= cost) {
    city.cultureBox -= cost;
    const stored = city.nextPlot ?? -1;
    const plot = stored >= 0 && !tileClaimed(state.map.tiles[stored]) ? stored : drawBorderPlot(state, city, ctx);
    if (plot !== null) acquireTile(state, city, plot);
  }
  city.nextPlot = drawBorderPlot(state, city, ctx) ?? -1;
}

/** CIV6 (Monument): "+1 Loyalty", and (Government Plaza) "+8 Loyalty to this
 *  city" — the flat per-turn term of what STANDS in the city, paid to whoever
 *  holds it, the Free Cities player included. A district pays only once
 *  complete and unpillaged, and a dark district takes its buildings with it. */
export function builtLoyalty(state: GameState, city: City): number {
  const dark = darkBuildings(state.map, city);
  let n = cityDistrictSum(state, city, 'loyalty');
  for (const b of city.buildings) {
    const def = BUILDINGS[b];
    if (!def || dark.has(b)) continue;
    n += def.loyalty ?? 0;
  }
  n += improvementLoyalty(state, city);
  return n;
}

/**
 * CIV6: what an IMPROVEMENT pays its city in Loyalty per turn.
 *
 * Two shapes, and both are the install's own. The Open-Air Museum's is flat
 * and belongs to the city whose borders hold it. The Mission's
 * (`TRAIT_MISSION_IDENTITY_PER_TURN_MODIFIER`, Amount 2) is paid to a city
 * whose CENTRE is adjacent to one and which is NOT on its owner's capital
 * continent — the requirement set the modifier names, clause for clause.
 */
export function improvementLoyalty(state: GameState, city: City): number {
  let n = 0;
  for (const t of state.map.tiles) {
    if (!t.improvement || t.pillaged || !tileBelongsTo(t, city)) continue;
    n += IMPROVEMENTS[t.improvement as ImprovementId]?.loyalty ?? 0;
  }
  const centre = state.map.tiles[city.centerIndex];
  if (!centre) return n;
  const off = !onHomeContinent(state, city.seat, centre.index);
  if (!off) return n;
  for (const nb of neighbors(state.map, centre)) {
    if (!nb.improvement || nb.pillaged) continue;
    n += IMPROVEMENTS[nb.improvement as ImprovementId]?.loyaltyAdjacentOffContinent ?? 0;
  }
  return n;
}

/** The whole flat per-turn term a MAJOR's city takes: what stands in it, then
 *  its owner's roster, route, garrison, governor and policy rows. */
export function standingLoyalty(state: GameState, city: City): number {
  let n = builtLoyalty(state, city);
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
  const garrison = garrisonOf(state, city);
  if (garrison) {
    for (const r of mods.garrisonLoyalty) {
      if (!r.formation || (garrison.formation ?? 0) > 0) n += r.amount;
    }
    // CIV6 (Limitanei): "+2 Loyalty per turn in cities with a garrisoned unit"
    n += mods.loyaltyWithGarrison;
  }
  // CIV6 (Automated Workforce): "-5 Loyalty per turn in your cities."
  return n + governorLoyaltyAura(state, city) + mods.loyaltyAll + religionLoyalty(state, city)
    + suzerainBuildingLoyalty(state, city);
}

/** CIV6 (IDENTITY_PER_TURN_FROM_RELIGION_MATCHING_FOUNDED /
 *  _MISMATCHING_FOUNDED): a city whose owner founded a religion takes the
 *  matching term while it follows that religion, the mismatching one while it
 *  follows another, nothing while it follows none. */
export function religionLoyalty(state: GameState, city: City): number {
  const g = city.followedReligion ?? -1;
  if (g < 0 || !seatOf(state, city.seat)?.religion?.founded) return 0;
  return g === city.seat ? LOYALTY_RELIGION_MATCHING : LOYALTY_RELIGION_MISMATCHING;
}

/** CIV6 (Audience Chamber): "-2 Loyalty in Cities without Governors." The
 *  building stands in ONE city; the clause reaches every city its SEAT holds,
 *  so it is summed over the seat and paid to whichever city has no ESTABLISHED
 *  governor (1104 Taiyuan's "Other" rises 2 the turn Reyna establishes). */
export function ungovernedLoyalty(state: GameState, seat: number): number {
  return seatBuildingSum(state, seat, 'loyaltyWithoutGovernor');
}

/** CIV6 (Statue of Liberty): "All your cities within 6 tiles are always 100%
 *  Loyal." Measured from the WONDER TILE, like every other wonder aura. */
function wonderLoyaltyAura(state: GameState, city: City): boolean {
  const center = state.map.tiles[city.centerIndex];
  for (const w of seatWonders(state, city.seat)) {
    const range = w.def.effects?.loyaltyAura ?? 0;
    if (!range) continue;
    const t = state.map.tiles[w.tileIndex];
    if (hexDistance(state.map, t.col, t.row, center.col, center.row) <= range) return true;
  }
  return false;
}

/** A city's loyalty change a turn, every term summed — what the game
 *  reports as its loyalty per turn, a capital's too (which stands at full
 *  whatever it reads). */
export function loyaltyPerTurn(state: GameState, city: City, amenityTierName: string, hasGovernor = false,
  starving = false): number {
  return loyaltyDelta(state, city, amenityTierName)
    + (hasGovernor ? GOVERNOR_LOYALTY : 0)
    + (cityGovernorEstablished(state, city) ? 0 : ungovernedLoyalty(state, city.seat))
    + (starving ? LOYALTY_STARVATION : 0)
    + gpCityPermOf(city, 'loyalty')
    + congressLoyaltyDelta(state, city.seat) + emergencyLoyalty(state, city.seat, city.id);
}

/**
 * Apply a turn of loyalty to `city` (called from endTurn with the stats it
 * already computed). Returns true when the city has hit 0 and must flip. A
 * capital moves by the same law (runs/h1_duelw1108: Rome 100 -> 78 -> 56 ->
 * 74 -> 95 t215-219 under two Indie concerts) and never flips.
 */
export function applyLoyalty(state: GameState, city: City, amenityTierName: string, hasGovernor = false,
  starving = false): boolean {
  if (!cityHolders(state).some((s) => s.seat !== city.seat && s.cities.length > 0)) return false;
  // CIV6 (Mediterranean Colonies): "Coastal cities founded by Phoenicia and
  // located on the same continent as the Phoenician Capital are 100% Loyal."
  const phoen = getModifiers(state, city.seat).coastalHomeLoyal
    && isCoastalLand(state.map, state.map.tiles[city.centerIndex])
    && onHomeContinent(state, city.seat, city.centerIndex);
  if (wonderLoyaltyAura(state, city) || phoen) {
    city.loyalty = LOYALTY_MAX;
    return false;
  }
  const next = (city.loyalty ?? LOYALTY_MAX) + loyaltyPerTurn(state, city, amenityTierName, hasGovernor, starving);
  city.loyalty = Math.max(0, Math.min(LOYALTY_MAX, next));
  return !city.isCapital && city.loyalty <= 0;
}

/** CIV6 (Eleanor, EFFECT_ADJUST_PLAYER_SKIP_FREE_CITY_STEP): does a city
 *  whose loyalty collapses under this seat's pull join it at once? The
 *  RECEIVER's roster row (`SKIP_FREE_CITY_ROWS`). */
export function skipsFreeCityStep(state: GameState, seat: number): boolean {
  return SKIP_FREE_CITY_ROWS.some((r) => rowIsFor(r, civOf(state, seat), leaderOf(state, seat)));
}

/** A city at 0 loyalty REVOLTS. CIV6: "When Loyalty reaches 0, the city
 *  revolts against its owner and becomes a Free City" — unless the seat
 *  pressing hardest on it right now skips that step (Eleanor), in which case
 *  it joins that seat directly. The pull is the citizen pressure
 *  (`citizenPressure`), the owner and its cultural allies excluded; ties to
 *  the lowest seat id. */
export function flipCity(state: GameState, city: City): void {
  const here = state.map.tiles[city.centerIndex];
  let winner: Seat | null = null;
  let best = -1;
  for (const s of state.seats) {
    if (s.seat === city.seat) continue;
    // CIV6 (Cultural alliance 1): an ally exerts nothing, so it never
    // receives the flip either.
    if (alliedAtLevel(state, city.seat, s.seat, ALLIANCE_CULTURAL, 1)) continue;
    const pressure = citizenPressure(state, here, s.cities);
    if (pressure > best) {
      best = pressure;
      winner = s;
    }
  }
  if (winner && skipsFreeCityStep(state, winner.seat)) {
    transferCity(state, city.seat, winner, city, 'loyalty collapsed');
    return;
  }
  const free = freeSeatOf(state);
  const pair = freeCityPairType(state, city.seat);
  transferCity(state, city.seat, free, city, 'revolted');
  const freed = free.cities[free.cities.length - 1];
  if (pair) for (let k = 0; k < FREE_CITY_PAIR_COUNT; k++) grantFreeCityUnit(state, freed, pair);
}

/** THE REVOLT'S PAIR: the strongest `FREE_CITY_PAIR_CLASS` chassis the
 *  FORMER OWNER's techs and civics unlock (`trainableIn`; a grant asks no
 *  strategic resource — the watched pairs were Swordsmen and Musketmen;
 *  `minorBestOfClass`, ties by catalog order). */
export function freeCityPairType(state: GameState, formerOwner: number): string | null {
  const r = seatOf(state, formerOwner)?.research ?? { techs: [], civics: [] };
  return minorBestOfClass(trainableIn(r, true), FREE_CITY_PAIR_CLASS);
}

/** THE ERA'S CHASSIS of a promotion class: the class's generic land chain (no
 *  civilization's unique, no hull, no plane) from the chassis nothing
 *  upgrades into, followed up its upgrades while the next one's era — the era
 *  of the tech or civic that unlocks it (`UNIT_ERA_INDEX`) — is at or below
 *  `era`. Null where even the chain's first chassis comes later. */
export function eraUnitOfClass(cls: PromoClass, era: number): string | null {
  const chain = Object.values(UNITS).filter((d) =>
    UNIT_PROMO_CLASS[d.id] === cls && !d.uniqueTo && !d.naval && !d.air);
  let d = chain.find((c) => !chain.some((o) => o.upgradesTo === c.id));
  let at: string | null = null;
  while (d && UNIT_ERA_INDEX[d.id] <= era) {
    at = d.id;
    const next = d.upgradesTo;
    d = chain.find((c) => c.id === next);
  }
  return at;
}

/** A FREE CITY's granted unit. The Free Cities player's revolt hands it
 *  `FREE_CITY_PAIR_COUNT` of the former owner's best melee on the flip turn
 *  (`freeCityPairType`), and
 *  every `FREE_CITY_GRANT_PERIOD`th of its turns while it stays Free one more
 *  (`freeCityGrantType`). Each stands on the NEAREST free land plot outward
 *  from the centre, never the centre itself: with every plot of ring 1 held
 *  the grant landed 2 away, with rings 1 and 2 held 3 away
 *  (runs/c60s3_r1_20260926T081910Z.jsonl, runs/c60s3_r1_20260926T082156Z.jsonl,
 *  runs/c60s3_r2_20260926T082415Z.jsonl). A plot holding a district is never
 *  one: with the one free plain plot of ring 1 held, the grant passed the
 *  district plot beside the centre for ring 2
 *  (runs/c60t_grant_A_b6920_20260927T000521Z.jsonl). Among the plots at one
 *  distance the first on a walk round the ring takes it: from the ring's W
 *  corner, along its NE, E, SE, SW, W and NW legs in turn (`hexRingWalk`; 9
 *  of 9 placements, tools/civ6lab/c60w_bfs_fit.py over
 *  runs/c60t_grant_w_e2_20260927T023727Z.jsonl,
 *  runs/c60t_grant_w_e3_20260927T023833Z.jsonl,
 *  runs/c60t_grant_w_e4_20260927T023939Z.jsonl,
 *  runs/c60t_grant_w_r2_t257_20260927T023501Z.jsonl,
 *  runs/c60t_grant_w_r2_tb0_20260927T023234Z.jsonl,
 *  runs/c60t_grant_w_r2_tb7_20260927T023321Z.jsonl,
 *  runs/c60t_grant_w_x1_20260927T024145Z.jsonl,
 *  runs/c60t_grant_w_x2_20260927T024232Z.jsonl,
 *  runs/c60t_grant_w_x3_20260927T024338Z.jsonl,
 *  runs/c60t_grant_w_x4_20260927T024445Z.jsonl). The unit remembers the city that granted it
 *  (`Unit.freeCity`): when that city joins a civilization, the grant goes
 *  (`joinFromFreeCity`). The units walk with the Free Cities' walker
 *  (`freeCitiesPhase`). */
function grantFreeCityUnit(state: GameState, city: City, unitType: string): void {
  const probe = { type: unitType, seat: FREE_SEAT };
  const centre = state.map.tiles[city.centerIndex];
  let spot: Tile | undefined;
  for (let k = 1; !spot && k <= state.map.width + state.map.height; k++) {
    spot = hexRingWalk(state.map, centre.col, centre.row, k)
      .find((t) => !t.district && tileFreeForUnit(state, t.index, FREE_SEAT, probe));
  }
  if (!spot) return;
  const u = spawnUnit(state, unitType, spot.index, FREE_SEAT);
  if (u) u.freeCity = city.id;
}

/** A recurring grant's chassis: ONE draw over `FREE_CITY_GRANT_WEIGHTS`
 *  among the classes the world era has a chassis for, in table order —
 *  `pick` in [0, their weights' sum) names the first class whose running sum
 *  exceeds it — and that class's chassis of the era (`eraUnitOfClass`). The
 *  draw is taken whether or not a tile is free for the unit. */
function freeCityGrantType(state: GameState): string | null {
  const era = Math.max(0, worldEraIndex(state));
  const open: [string, number][] = [];
  FREE_CITY_GRANT_CLASSES.forEach((cls, i) => {
    const id = eraUnitOfClass(cls, era);
    if (id) open.push([id, FREE_CITY_GRANT_WEIGHTS[i]]);
  });
  const total = open.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  const pick = Math.floor(nextRandom(state) * total);
  let run = 0;
  for (const [id, w] of open) {
    run += w;
    if (pick < run) return id;
  }
  return null;
}

/** BANKRUPTCY for seat `s` once its turn's charges have landed, every seat
 *  alike — a major's, a city-state's and the Free Cities': the whole Gold its
 *  treasury stands below 0 is the turn's shortfall (`goldShortfall`, which
 *  its cities' amenities read until its next upkeep), the treasury clamps at
 *  0, and `bankruptDisbands` units go: each the FIRST unit of the seat's
 *  roster with upkeep (`upkeepOf` > 0) — a Crossbowman went before four
 *  Musketmen, a Warrior with none was skipped, 8 of 8
 *  (runs/bankrupt_m15_20260926T083048Z.jsonl,
 *  runs/bankrupt_m35_20260926T083304Z.jsonl). The roster order is
 *  `state.units`, spawn order, the one order both engines own (the GPU's pool
 *  appends, so its lowest slot is the same unit); nothing is refunded. */
export function bankruptcy(state: GameState, s: Seat, upkeepOf: (unit: Unit) => number): void {
  s.goldShortfall = goldShortfall(s.treasury);
  if (s.treasury < 0) s.treasury = 0;
  const n = bankruptDisbands(s.goldShortfall);
  for (let k = 0; k < n; k++) {
    const victim = state.units.find((u) => u.seat === s.seat && upkeepOf(u) > 0);
    if (!victim) return;
    disbandUnit(state, victim.id);
  }
}

/** A Free City at 0 loyalty JOINS a seat. CIV6: "it will join the
 *  Civilization that has exerted the most Loyalty pressure on it since the
 *  Free City became independent" — the `freePressure` race, ties to the
 *  lowest seat id. A seat that pulled nothing, or holds no city any more,
 *  takes nothing; with no taker the city stays Free at 0. On a join the units
 *  the city was GRANTED go the same turn, in `state.units` order; any other
 *  Free Cities unit stays Free (measured: C-60). */
function joinFromFreeCity(state: GameState, city: City): void {
  const race = city.freePressure ?? [];
  let winner: Seat | null = null;
  let best = 0;
  for (const s of state.seats) {
    if (s.cities.length === 0) continue;
    const pulled = race[s.seat] ?? 0;
    if (pulled > best) {
      best = pulled;
      winner = s;
    }
  }
  if (!winner) return;
  transferCity(state, FREE_SEAT, winner, city, 'joined');
}

/** The FREE CITIES player's turn, after every major's: each Free City's
 *  amenities are the ordinary composer's over the Free Cities seat — the full
 *  need of its population, the supply of what that seat holds (its own
 *  luxuries, buildings and districts; no government, policy or governor) —
 *  and the tier is recorded off one read of every Free City. Its
 *  treasury banks the Gold those same stats make, in array order, then pays
 *  its units' upkeep and meets the `bankruptcy` that may force. Then each
 *  city takes its grant when one falls due,
 *  puts the same stats' Production into its build table (`freeCityBuild`),
 *  fires the ranged strikes any walled city fires and runs
 *  `freeCityLoyaltyDelta` (its heal is the turn's end's, `healCities`) — its
 *  cities press a religion they follow on that religion's founder's turn
 *  (`spreadReligiousPressure`). Then the Free Cities' land
 *  units walk (`walkUnit`, C-60's tables, around the nearest Free City, in
 *  unit order off a list taken before anyone moves); the cities that reached
 *  0 join their race's winner, in array order, after the walk. */
export function freeCitiesPhase(state: GameState): void {
  const free = state.freeSeat;
  if (!free || free.cities.length === 0) return;
  // a Free City's reactor keeps its clock: the seat resolves no power, so the
  // age is kept here
  ageReactors(free.cities);
  const luxMap = luxuryAmenities(state, FREE_SEAT);
  const mods = getModifiers(state, FREE_SEAT);
  const stats = free.cities.map((city) => computeCityStats(state, city, luxMap, mods));
  free.cities.forEach((city, i) => { city.amenityTier = amenityTierIndex(stats[i].amenities.tier.name); });
  let income = 0;
  for (const s of stats) income += s.total.gold;
  free.treasury += income;
  const upkeep = state.units.reduce((s, u) => s + (u.seat === FREE_SEAT ? unitUpkeep(mods, u) : 0), 0);
  const _dlu = (globalThis as { __diffLog?: string[] }).__diffLog;
  if (_dlu) _dlu.push(`up:${FREE_SEAT}:${state.turn}`
    + ` n${state.units.filter((u) => u.seat === FREE_SEAT).length}`
    + ` cost${upkeep.toFixed(3)} purse${free.treasury.toFixed(3)}`);
  free.treasury -= upkeep;
  const short0 = free.goldShortfall ?? 0;
  bankruptcy(state, free, (u) => unitUpkeep(mods, u));
  // the cities' Production is read again where the shortfall moved what they
  // make
  if ((free.goldShortfall ?? 0) !== short0) {
    const lux2 = luxuryAmenities(state, FREE_SEAT);
    const mods2 = getModifiers(state, FREE_SEAT);
    free.cities.forEach((city, i) => { stats[i] = computeCityStats(state, city, lux2, mods2); });
  }
  const joiners: City[] = [];
  const research = freeCityResearch(state);
  [...free.cities].forEach((city, i) => {
    // the city's own turn count, the flip turn its first: `foundedTurn` is
    // the revolt's turn, which the transfer that made it Free wrote
    if ((state.turn - city.foundedTurn + 1) % FREE_CITY_GRANT_PERIOD === 0) {
      const type = freeCityGrantType(state);
      if (type) grantFreeCityUnit(state, city, type);
    }
    freeCityBuild(state, city, stats[i].total.production, research);
    cityStrikes(state, city, cityStrikeStrength(state, city));
    const next = (city.loyalty ?? LOYALTY_MAX) + freeCityLoyaltyDelta(state, city);
    city.loyalty = Math.max(0, Math.min(LOYALTY_MAX, next));
    if (city.loyalty <= 0) joiners.push(city);
  });
  const homes = free.cities.map((c) => c.centerIndex);
  for (const u of state.units.filter((x) => x.seat === FREE_SEAT && landWalker(x))) {
    walkUnit(state, u, homes, FREE_WALK_STEPS, FREE_WALK_WEIGHTS);
  }
  for (const city of joiners) joinFromFreeCity(state, city);
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
 * it rides the wire, and this body only re-validates it. Returns false when
 * the named tile cannot take it. */
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
  if (!districtSiteLegal(state, civCity, id, unlocks, tileIndex)) return false;
  const cost = districtSiteCost(state, actor, id, unlocks);
  paveDistrictTile(state, civCity, id, tileIndex);
  commitProduction(state, civCity.seat, civCity, { kind: 'district', district: id, tileIndex, progress: 0, cost });
  return true;
}

/** IS THIS SITE LEGAL for this district, for this city, right now? One
 * predicate, so the BUILD verb and the PURCHASE verb refuse on the same
 * clauses rather than on two spellings of them. */
export function districtSiteLegal(
  state: GameState, civCity: City, id: DistrictId, unlocks: Unlocks, tileIndex: number,
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (!tile) return false;
  const owns = (t: Tile) => tileBelongsTo(t, civCity);
  return canPlaceDistrictIn(state, civCity, id, tileIndex, { unlocks, ownsTile: owns }).ok;
}

/** WHAT THIS DISTRICT COSTS this seat right now — the research scaling, the
 * one-of-a-kind discount and the civilization's variant, in that order. The
 * PURCHASE verb prices off this same number, so a discount can never be worth
 * a different amount to a buyer than to a builder. */
export function districtSiteCost(
  state: GameState, actor: Seat, id: DistrictId, unlocks: Unlocks,
): number {
  // CIV6: the Spaceport's cost is FLAT — no research scaling, no discount.
  const base = districtScaledBase(actor.research, id);
  const cost0 = DISTRICTS[id]?.fixedCost
    ? scaleByGameSpeed(DISTRICTS[id].cost)
    : districtDiscounted(state, actor.seat, id, { unlocks, cities: actor.cities })
      ? districtScaledBase(actor.research, id, true)
      : base;
  const varied = districtVariantCost(state, actor.seat, id, cost0);
  logDistrictCost(state.turn, actor.seat, id, base, cost0, varied);
  return varied;
}

/** The GROUND a district or a wonder takes when it is placed, for every seat.
 * CIV6: a district stands on an improved plot and REMOVES the improvement
 * (the install's Districts and Improvements carry no clause refusing one);
 * it paves every feature EXCEPT floodplains — the feature stays under the
 * district (GS floods damage districts built on them; the Dam exists for
 * exactly that), and the flood-target pick draws from it — and removes a
 * bonus resource (`canPlaceDistrictIn` already refused luxury/strategic). */
export function paveGround(tile: Tile): void {
  tile.improvement = null;
  tile.feature = isFloodplains(tile.feature) ? tile.feature : null;
  if (tile.resource && RESOURCES[tile.resource].category === 'bonus') tile.resource = null;
}

/** The GROUND a district takes when it is placed — the same writes whether the
 * city is going to build it over ten turns or bought it outright. */
function paveDistrictTile(state: GameState, civCity: City, id: DistrictId, tileIndex: number): void {
  const tile = state.map.tiles[tileIndex];
  tile.district = id;
  tile.districtComplete = false;
  paveGround(tile);
  civCity.districts.push({ type: id, tileIndex });
}

/**
 * BUY A DISTRICT OUTRIGHT.
 *
 * CIV6 (Contractor): "Allows city to purchase Districts with Gold"; (Divine
 * Architect): the same in Faith. Both are pure permissions — CanPurchase
 * booleans on the governor promotion — so the PRICE is the engine's own, the
 * production cost times the purchase multiplier a building already pays.
 *
 * The site names the city, exactly as the tile-purchase verb's does. Placement
 * re-validates through `placeSeatDistrict`'s own body, and the district is then
 * finished by `completeQueueItem` rather than by a second completion written
 * here: the Encampment's walls, the dedication, the district-unit grants and
 * the M'banza's Apostle all live in that one composer, and a purchase that
 * spelled its own completion would quietly miss whichever clause landed next.
 */
export function purchaseSeatDistrict(
  state: GameState,
  actor: Seat,
  tileIndex: number,
  id: DistrictId,
  viaFaith: boolean,
): boolean {
  const tile = state.map.tiles[tileIndex];
  if (!tile) return false;
  const civCity = actor.cities.find((c) => tileBelongsTo(tile, c));
  if (!civCity) return false;
  const gate = viaFaith
    ? governorFlag(state, civCity, (e) => e.districtFaithBuy)
    : governorFlag(state, civCity, (e) => e.districtGoldBuy);
  if (!gate) return false;
  const unlocks = computeUnlocks(state, actor.seat);
  if (!districtSiteLegal(state, civCity, id, unlocks, tileIndex)) return false;
  // Priced off the BUILDER's number, so a variant or a discount is worth the
  // same to a buyer. Nothing is written until the purse has paid: a purchase
  // never touches the city's QUEUE or its production bank — the hammers a
  // city has saved are not spent by a cheque.
  const cost = districtSiteCost(state, actor, id, unlocks);
  const price = viaFaith
    ? faithPrice(state, actor.seat, Math.round(cost * FAITH_PURCHASE_MULT))
    : goldPrice(state, actor.seat, Math.round(cost * GOLD_PURCHASE_MULT));
  const purse = viaFaith ? (actor.faith ?? 0) : (actor.treasury ?? 0);
  if (!goldAffordable(purse, price)) return false;
  if (viaFaith) actor.faith = (actor.faith ?? 0) - price;
  else actor.treasury = (actor.treasury ?? 0) - price;
  paveDistrictTile(state, civCity, id, tileIndex);
  completeQueueItem(state, civCity, { kind: 'district', district: id, tileIndex, progress: cost, cost }, cost);
  return true;
}

/** The plot `placeSeatWonder` would raise this wonder on in this city: the
 *  lowest-index tile of its work radius `canPlaceWonder` admits, once the
 *  wonder stands nowhere and its research is in; undefined where none. */
export function wonderSite(state: GameState, actor: Seat, civCity: City, def: BuiltWonderDef): Tile | undefined {
  if (wonderExists(state, def.id)) return undefined;
  if (def.requiresTech && !actor.research.techs.includes(def.requiresTech)) return undefined;
  if (def.requiresCivic && !actor.research.civics.includes(def.requiresCivic)) return undefined;
  const center = state.map.tiles[civCity.centerIndex];
  return tilesWithin(state.map, center.col, center.row, CITY_WORK_RADIUS)
    .filter((t) => canPlaceWonder(state, civCity, def.id, t.index, actor.seat).ok)
    .sort((a, b) => a.index - b.index)[0];
}

/** May this city train roster unit `id` as a FORMATION of `tier` (1 corps,
 *  2 army) now? CIV6 (Military Academy, Seaport): a military chassis that
 *  may form, the enabling building standing, the tier's civic in — the
 *  roster's own civic for this tier and domain (EFFECT_ADJUST_CORPS_ARMY_PREREQ),
 *  the catalog's otherwise — the chassis trainable here, and the TIER's own
 *  strategic charge, which `trainableUnits` asked at the chassis' single rate. */
export function formationOrderOk(state: GameState, actor: Seat, civCity: City, id: string, tier: 1 | 2): boolean {
  const def = UNITS[id];
  if (!def) return false;
  const fRow = getModifiers(state, actor.seat).formations.find(
    (r) => r.tier === tier && r.naval === !!def.naval && r.civic !== undefined);
  const civic = fRow?.civic ?? FORMATION_CIVIC[tier];
  return def.combat > 0 && unitDomain(id) === 'military' && !formationBanned(id)
    && civCity.buildings.includes(def.naval ? FORMATION_TRAIN_BUILDING.naval : FORMATION_TRAIN_BUILDING.land)
    && (!civic || isCivicComplete(state, civic, actor.seat))
    && trainableUnits(state, actor.seat, civCity).some((d) => d.id === id)
    && (state.sandbox || canTrainWithStockpile(state, actor.seat, id, tier));
}

export function placeSeatWonder(state: GameState, actor: Seat, civCity: City, def: BuiltWonderDef): boolean {
  const tile = wonderSite(state, actor, civCity, def);
  if (!tile) return false;
  tile.builtWonder = def.id;
  tile.builtWonderComplete = false;
  paveGround(tile);
  civCity.wonders.push({ id: def.id, tileIndex: tile.index });
  commitProduction(state, civCity.seat, civCity, { kind: 'wonder', wonder: def.id, tileIndex: tile.index, progress: 0 });
  return true;
}

export function queueSeatProject(state: GameState, civCity: City, projId: string): boolean {
  if (!availableProjects(state, civCity).some((p) => p.id === projId)) return false;
  return queueProject(state, civCity.id, projId, civCity.seat).ok;
}

/** BUY A BUILDING WITH GOLD — the record's `buy` kind 0. ONE legality body
 * with the candidate row and the GPU's gold read: the shared gold list paired
 * with `buildingCompletable`, never a worship row (faith buys those), never a
 * row the install bars from Gold. The purse keeps the peace reserve. The
 * building stands at once and a queued copy of it banks its progress. */
export function buySeatBuilding(state: GameState, actor: Seat, civCity: City, id: string): boolean {
  const def = BUILDINGS[id];
  if (!def || def.worship || SCRIPTED_HELD_BUILDINGS.has(def.id)
      || def.noPurchase || wallsGoldBlocked(state, actor.seat, def.id)) return false;
  if (!purchasableBuildings(state, civCity).some((b) => b.id === def.id)
      || !buildingCompletable(state, civCity, def.id)) return false;
  const price = goldPrice(state, actor.seat, buildingPurchaseCost(state, actor.seat, def.id));
  const reserve = PEACE_GOLD_COST(0);
  if (Math.round((actor.treasury ?? 0) * 1000) < Math.round((price + reserve) * 1000)) return false;
  actor.treasury = (actor.treasury ?? 0) - price;
  civCity.buildings.push(def.id);
  stampBuildingEra(state, civCity, def.id);
  dropQueuedBuilding(civCity, def.id);
  buildingDedications(state, civCity.seat, def.id);
  if (def.walls) { civCity.outerHp = wallsMax(state, civCity); fitEncampOuter(state, civCity); }
  return true;
}

/** What a voter knows that `congress` cannot look up itself: the live
 *  adoption (which reads the standing slate back) and the envoy spread. */

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
      else if (e.kind === EMERGENCY_MILITARY) sx.emgHeal = bump(sx.emgHeal, e.target);
      else if (e.kind === EMERGENCY_NUCLEAR) sx.emgNukeCS = bump(sx.emgNukeCS, e.target);
    }
  } else {
    const t = state.seats[e.target];
    if (t) {
      t.diplomaticFavor = (t.diplomaticFavor ?? 0) + EMERGENCY_TARGET_FAVOR;
      if (e.kind === EMERGENCY_CITY_STATE) t.emgRouteGold = (t.emgRouteGold ?? 0) + 1;
      else if (e.kind === EMERGENCY_MILITARY) for (const m of e.members) t.emgStrike = bump(t.emgStrike, m);
    }
    // the Nuclear Emergency's failure term lands on the MEMBERS' cities
    if (e.kind === EMERGENCY_NUCLEAR) {
      for (const m of e.members) {
        const sx = state.seats[m];
        if (sx) sx.emgNukeCut = (sx.emgNukeCut ?? 0) + 1;
      }
    }
  }
  state.eventLog.push(
    `${emergencyName(e.kind)}: ${membersWon ? 'the members' : state.seats[e.target]?.name ?? 'the target'} prevailed.`);
}

/**
 * The WORLD CONGRESS trigger: at every CONGRESS_INTERVAL turn, once ANY civ
 * has reached CONGRESS_MIN_ERA (Medieval), one Regular Session runs — the
 * mechanics and their sources live at `congressSession` and the catalog
 * (CONGRESS_RESOLUTIONS). The slate keys on the MAX era across civs, the
 * wiki's "topics relevant for the current world". Called from endTurn after
 * every player's turn and before the turn counter moves, so the schedule
 * reads the turn the session closes — the position the GPU mirrors.
 */
export function worldCongress(state: GameState): void {
  const recorded = state.seats.map((sx) => sx.congressVote ?? null);
  for (const sx of state.seats) sx.congressVote = undefined;  // an intent is for THIS turn
  const worldEra = worldEraIndex(state);
  // A Special Session may sit on ANY turn once the Congress is open; a running
  // emergency is settled whether one sat or not.
  if (worldEra >= CONGRESS_MIN_ERA) specialSessions(state, recorded);
  resolveEmergencies(state);
  resolveCompetition(state);
  if (!congressSessionDue(state.turn, worldEra)) return;
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
  // the losing seat held no other city: its last (the moments read it)
  const wasLast = (loser?.cities.length ?? 0) <= 1;
  // A Free City's own grants (`Unit.freeCity`) go when it leaves the Free
  // Cities, joined or captured, in `state.units` order, never to the taker
  // (lab 5d, runs/c60f_capture_t250a_20260928T025820Z.jsonl and the other c60f_capture records: 3 of 3).
  if (isFreeSeat(fromSeat)) {
    for (const u of state.units.filter((x) => x.seat === FREE_SEAT && x.freeCity === civCity.id)) disbandUnit(state, u.id);
  }
  if (why === 'conquered') {
    // CIV6 (Warlord's Throne): "Capturing an enemy City grants 20% bonus
    // Production in all Cities for 5 turns" — the window opens on the CAPTURE,
    // so a city taken only to be razed opens it too.
    const _cq = seatBuildingSum(state, to.seat, 'conquestProdTurns');
    if (_cq > 0) to.conquestProdTurns = _cq;
    // A Free City belongs to nobody, so taking one aggrieves nobody.
    if (isCiv(fromSeat)) {
      grievanceCityTaken(state, to.seat, fromSeat, to.cities.length >= MAX_CITIES_PER_SEAT);
      // "Captured the final city of a civilization: 150 (all remaining civs
      // gain Grievances against you)" — the loser's list is about to lose this
      // one, so one city left IS the last.
      if (wasLast) grievanceLastCity(state, to.seat);
    }
  }
  if (loser) {
    loser.cities = loser.cities.filter((c) => c.id !== civCity.id);
    if (isCiv(fromSeat)) relocatePalace(loser.cities);
    if (loser.tradeRoutes) loser.tradeRoutes = loser.tradeRoutes.filter((x) => x.from !== civCity.id && x.to !== civCity.id);
  }
  if (why === 'conquered' && to.cities.length >= MAX_CITIES_PER_SEAT) {
    // CIV6 (LOC_RAZE_CITY_DISTRICTS): "Raze city clearing it and all its
    // districts and buildings from the map" — every district and wonder on
    // the city's ground goes with it, finished or not, before the plots fall
    // free; none is left for a later city to claim
    for (const t of state.map.tiles) {
      if (!tileBelongsTo(t, civCity)) continue;
      t.district = null;
      t.districtComplete = false;
      t.districtPillaged = false;
      t.builtWonder = null;
      t.builtWonderComplete = false;
      t.encampHp = undefined;
      t.encampOuterHp = undefined;
      setTileOwner(t, NO_SEAT);
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
  // buildings MINUS the PALACE and MINUS the Walls, and its wonders.
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
  // CIV6 (`DISTRICT_CITY_CENTER` carries `CaptureRemovesCityDefenses="true"`):
  // a CONQUEST destroys the Walls themselves — the building goes, not just the
  // pool behind it. Measured on a live capture with the pools set to known
  // values first: every outer pool of the city reads 0/0 afterwards, and the
  // mechanism is the lost building, because the outer MAXIMUM is the walls
  // level every defending district of the city shares. So the centre's pool
  // and each Encampment's own both fall out of `wallsMax` together and stay 0
  // until Walls are rebuilt — no pool is written for the district at all, and
  // the Encampment's own GARRISON (`Tile.encampHp`, a separate pool) rides
  // through byte for byte. A transfer by loyalty destroys nothing.
  const keptBuildings = civCity.buildings.filter(
    (b) => b !== 'PALACE' && !(why === 'conquered' && BUILDINGS[b]?.walls));
  const flipped: City = {
    id: to.nextCityId++,
    name: civCity.name,
    seat: to.seat,
    centerIndex: civCity.centerIndex,
    // CIV6 (Great Turkish Bombard): "Conquered cities do not lose
    // Population" — `keepPct` of what stood, over the usual quarter lost. A
    // transfer by loyalty is not a conquest: the install prices population
    // after a CONQUEST only, and a city that revolts or joins keeps its own.
    population: why === 'conquered'
      ? Math.max(1, Math.floor(civCity.population * Math.max(0.75, getModifiers(state, to.seat).conquestKeepPct / 100)))
      : civCity.population,
    foodBox: 0,
    cultureBox: 0,
    // the border count starts again: the next plot costs the first plot's
    // price (runs/h1_duelw1110, Rome taken at t142: 107 Culture the turn
    // before, 5 on capture, then 10 and 17)
    tilesAcquired: 0,
    focus: 'balanced',
    queue: [],
    isCapital: false,
    // the flip does not make this city any less the FIRST city of whoever
    // founded it — that is the whole point of the occupied-capital penalty
    origCapitalSeat: civCity.origCapitalSeat ?? -1,
    founderSeat: civCity.founderSeat ?? -1,
    formerSeat: isFreeSeat(to.seat) ? fromSeat : -1,
    buildings: keptBuildings,
    // a pillaged building stays pillaged in the new owner's hands — the
    // repair is the queue's, whoever holds the queue
    pillagedBuildings: civCity.pillagedBuildings?.filter((b) => keptBuildings.includes(b)),
    // ...and so does the era each kept building was constructed in
    buildingEras: civCity.buildingEras
      ? Object.fromEntries(Object.entries(civCity.buildingEras).filter(([b]) => keptBuildings.includes(b)))
      : undefined,
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
    unconvertedPressure: civCity.unconvertedPressure,
    followedReligion: civCity.followedReligion,
    greatWorks: civCity.greatWorks ? civCity.greatWorks.map((w) => ({ ...w })) : undefined,
    // the laser stations ride the flip with the Spaceport that holds them —
    // and go on drawing Power from whoever owns the city now
    laserStations: civCity.laserStations,
    // the plant stays, so its reactor keeps its clock (`ageReactors`)
    reactorAge: civCity.reactorAge,
    powered: false, // the new owner's own turn re-resolves the grid
    // a CONQUERED city is taken at half health; a city that revolts or joins
    // was never hit, and keeps what it had
    hp: why === 'conquered' ? Math.round(CITY_MAX_HP / 2) : civCity.hp,
    // CIV6 (LOYALTY_AFTER_TRANSFERRED_BY_CULTURAL_IDENTITY): a loyalty
    // transfer starts the city at 100 — the revolt and the joining alike
    loyalty: why === 'conquered' ? undefined : LOYALTY_AFTER_CULTURAL_TRANSFER,
    // the race a FREE CITY runs: every major starts at nothing "since the
    // Free City became independent"
    freePressure: isFreeSeat(to.seat) ? state.seats.map(() => 0) : undefined,
    foundedTurn: state.turn,
  };
  // the walls are gone, so `wallsMax` is 0 and `outerPool` reads 0/0 — the
  // stored 0 is written anyway and UNCONDITIONALLY on a conquest, because an
  // ABSENT `outerHp` means FULL: a captor already holding Urban Defenses (a
  // tier no building supplies) would otherwise take delivery of a city that
  // is refortified the instant it changes hands. A transfer by loyalty
  // breaches nothing and carries the pool it had.
  if (why === 'conquered') flipped.outerHp = 0;
  else flipped.outerHp = civCity.outerHp;
  to.cities.push(flipped);
  logPopWrite(state, flipped, 'tr');
  // CIV6 (Military Emergency): "The Target has conquered the city of another
  // nation; it must be Liberated!" The seat that LOST it is the affected one.
  if (why === 'conquered' && isCiv(fromSeat) && isCiv(to.seat)) {
    raiseEmergency(state, EMERGENCY_MILITARY, to.seat, flipped.id, [fromSeat]);
  }
  // the Free Cities player scores no era and explores nothing
  if (isCiv(to.seat)) {
    transferMoments(state, fromSeat, to.seat, civCity, why === 'loyalty collapsed' || why === 'joined', wasLast);
    revealAround(state, to.seat, civCity.centerIndex, 3);
  }
  // the road to the capital walks the city as it now stands: its new holder,
  // its districts, the ground it revealed
  if (why === 'conquered') allRoadsLeadToRome(state, to.seat, civCity.centerIndex);
  // Real Civ 6 pays the captor gold for taking a city. One rate, every captor.
  if (plunder) to.treasury += 40;
  state.eventLog.push(`${civCity.name} defected to ${to.name}! (${why})`);
  if (loser && loser.cities.length === 0 && isCiv(fromSeat)) {
    setWar(state, loser.seat, to.seat, false);
    warWearinessPeace(state, to.seat, loser.seat);
    state.eventLog.push(`${loser.name} has been eliminated.`);
  }
  return true;
}

/**
 * machine-check (env-gated by CIV6_RC_REGISTRY_CHECK; the TS twin of the
 * GPU engine's _check_rc_registry_invariant). Every district tile and wonder
 * tile a city lists must register BACK to that city — its `Tile.ownerCity` equals
 * the city's id (a district sits on a tile owned by THAT city, the placement
 * rule placeSeatDistrict/placeSeatWonder enforce) — and that tile must
 * be owned by this seat's civ. A tile registered to a SIBLING city (the seed
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

/**
 * THE PENDING POLICIES: the record's government and slotted cards, applied
 * in the seat's start of turn after its gold, upkeep and bankruptcy and
 * before its culture (tools/civ6lab/turn_order_civ6.md: `GE.PolicyChanged`
 * after gold and science, before the civic, 17 blocks).
 */
export function applySeatPolicies(state: GameState, actor: Seat, rec: SeatActionRecord): void {
  // THE POLICY UNLOCK: outside the free window a change of government or of
  // the slotted cards pays `policyUnlockCost` once for the turn, and a seat
  // that cannot afford it keeps what it has.
  let unlocked = false;
  const unlock = (): boolean => {
    if (unlocked) return true;
    const cost = policyUnlockCost(state, actor.seat);
    if (cost > 0) {
      if (!goldAffordable(actor.treasury ?? 0, cost)) return false;
      actor.treasury = (actor.treasury ?? 0) - cost;
    }
    unlocked = true;
    return true;
  };
  // The GOVERNMENT is a driver decision, validated (`governmentsOpen`) and
  // stored; it lands before the cards so the set below is laid into the
  // government the seat is now in.
  if (rec.government !== null && rec.government !== undefined
      && (!governmentChanges(state, actor.seat, rec.government) || unlock())) {
    adoptGovernment(state, actor.seat, rec.government);
  }
  // The SLOTTED CARDS are a driver decision. Validated whole here —
  // every card unlocked under the live government, the set fitting its
  // slots — and STORED in `government.policies`; a set that does not fit is
  // refused entire. The stored set is what pays the card effects.
  if (rec.policies) {
    const gov = seatGovernment(state, actor.seat);
    if (gov) {
      const open = unlockedPolicyIds(actor.research, congressPolicyBlocked(state), inDarkAge(state, actor.seat), actor.government.held, gov);
      const ids = rec.policies.map((i) => POLICY_LIST[i]?.id).filter((id): id is string => !!id && open.has(id));
      const fit = ids.length === rec.policies.length ? fitPolicies(governmentSlots(state, actor.seat), ids) : null;
      // a lapsed card the set keeps keeps its standing; one it drops is gone
      if (fit && (!policySetChanges(state, actor.seat, fit) || unlock())) {
        actor.government.policies = fit;
        actor.government.lapsed = actor.government.lapsed.filter((c) => fit.includes(c));
      }
    }
  }
}

/** apply ONE recorded turn for a driven seat. Touches no policy — if this
 * ever needed to consult the ladder, the file would not be a complete record of
 * the decisions and TS could not reproduce a GPU trajectory from it. Mirrors
 * `apply_seat_actions`: the idle gate, then the same cost/progress semantics. */
export function applySeatActionRecord(state: GameState, actor: Seat, rec: SeatActionRecord): void {
  const { NB, NU, buildings, units, wonders, projects, wonderLo, projectLo, formLo } = prodLayout();
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
  // re-validates: peace needs `WAR_MIN_TURNS` at war and pays the
  // `PEACE_GOLD_COST` schedule, or refuses. Whether to sue is the driver's
  // call, so neither engine's rule stream moves.
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
    addEnvoys(state, cityState, actor.seat, (first ? 2 : 1) + containmentBonus(state, cityState, actor)
      + sameReligionToken(state, cityState, actor.seat));
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
      if (declaring) {
        // every gate is the verb's own; a refused kind refuses the war
        declareWar(state, actor.seat, foe, rec.warKind ?? -1);
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
  // CITIZEN ASSIGNMENT, in the GPU's arm order: the pins, the plot flips,
  // then the tile swaps. All re-validate — a pin needs a living city of this
  // seat, a flip needs the plot to be this seat's ground, a swap the whole of
  // `swapTileOk` against the state the swaps before it left.
  for (const [centre, di, n] of rec.specialists ?? []) {
    const pinCity = actor.cities.find((c) => c.centerIndex === centre);
    if (!pinCity || di < 0 || di >= PLACEABLE_DISTRICTS.length) continue;
    (pinCity.specialistPref ??= PLACEABLE_DISTRICTS.map(() => -1))[di] = Math.max(-1, Math.trunc(n));
  }
  for (const tileIndex of rec.lockTiles ?? []) {
    const plot = state.map.tiles[tileIndex];
    if (plot && tileSeat(plot) === actor.seat) plot.locked = !plot.locked;
  }
  for (const [centre, tileIndex] of rec.swapTiles ?? []) {
    const claim = actor.cities.find((c) => c.centerIndex === centre);
    if (claim && swapTileOk(state, claim, tileIndex)) setTileOwner(state.map.tiles[tileIndex], claim.seat, claim.id);
  }
  // The WORLD CONGRESS ballot is banked, not spent: the session runs at the
  // turn tail, after every seat has had its phase.
  if (rec.vote) actor.congressVote = rec.vote;
  if (rec.gpPass !== undefined && rec.gpPass >= 0) passGreatPerson(state, actor.seat, rec.gpPass);
  // The BELIEFS the seat's religion adopts: founding or enhancing, validated
  // whole by `adoptBeliefs` and refused whole.
  if (rec.beliefs?.length) adoptBeliefs(state, actor.seat, rec.beliefs);
  for (const [centre, aCol, aTile] of prodPairs) {
    const civCity = actor.cities.find((c) => c.centerIndex === centre);
    if (!civCity) continue;                          // centre not this engine's city (drifted state)
    const a = aCol;
    // A city takes an order only while it is building NOTHING: the queue is
    // one deep, so an order given to a busy city is refused rather than
    // stacked behind the head.
    if (a < 0) continue;
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
        // a COST_PROGRESSION_PREVIOUS_COPIES chassis (the Spy) locks the price
        // its copies so far set; a flat row prices off its catalog Cost
        else commitProduction(state, civCity.seat, civCity, { kind: 'unit', unit: id, progress: 0,
          ...(UNITS[id].costStep === undefined ? {} : { cost: unitStepCost(id, unitsAcquired(state, actor.seat, id)) }) });
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
      if (def && formationOrderOk(state, actor, civCity, id, tier)) {
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
  // WHICH ROW OF THE TURN'S RECORD. A turn carries K order rows and the
  // step log's key has to name the one it came from: without it every row
  // of a turn collides on one key and a pair is two different events.
  let seqRow = -1;
  for (const step of steps) {
    seqRow += 1;
    const row = Array.isArray(step[0]) ? (step[0] as unknown as number[]) : step;
    const units = unitsOf(state, actor.seat);
    units.forEach((unit, j) => {
      const a = row[j] ?? -1;
      if (a < 0 || a === 12) return;            // no instruction, or HOLD
      // died, or spent its turn. A SPY has no movement AT ALL (moves 0), and
      // its verbs cost none — the GPU's applier gates on `present` alone, so
      // the spent gate must not silence the one chassis that never moves. Its
      // steps and attacks stay behind the gate: `stepUnit`'s one-step
      // allowance reads 0 of a full 0 as "spent nothing" and would walk it,
      // where the GPU's move arm carries `mp > 0`.
      if (!state.units.includes(unit)) return;
      if (unit.movesLeft <= 0 && !(isSpy(unit.type) && a >= 12)) {
        // A SPENT UNIT PRINTS ITS REFUSAL. The GPU has no gate here at all:
        // its move arm carries `mp > 0` as a term of `ok`, so it logs a
        // blocked step where this engine simply returns. One-sided output
        // from a two-sided log is the one thing it must never produce.
        const dl0 = (globalThis as { __diffLog?: string[] }).__diffLog;
        if (dl0 && a < 6) {
          const h0 = state.map.tiles[unit.tileIndex];
          const t0 = h0 ? neighborTile(state.map, h0, a) : null;
          if (h0 && t0) {
            dl0.push(`st:${actor.seat}:${state.turn}:${seqRow}:${j}`
              + ` ty${UNIT_TYPE_IDX.indexOf(unit.type)} a${a}`
              + ` at${h0.index} to${t0.index} mp${unit.movesLeft} blocked`);
          }
        }
        return;
      }
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
      if (a === A_CONDEMN) {
        condemnHeretic(state, unit);
        return;
      }
      if (a === A_REMOVE_HERESY) {
        removeHeresy(state, unit);
        return;
      }
      if (a === A_HEAL_RELIGIOUS) {
        guruHeal(state, unit);
        return;
      }
      if (a === A_LAUNCH_INQUISITION) {
        launchInquisition(state, unit, actor);
        return;
      }
      if (a === A_EVANGELIZE) {
        evangelizeBelief(state, unit, actor);
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
          detonate(state, actor.seat, k, tgt, unit);
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
      if (a >= A_DEPLOY && a < A_DEPLOY + AIR_DEPLOY_COLS) {
        const t = deployTargets(state, unit, AIR_DEPLOY_COLS)[a - A_DEPLOY];
        if (t !== undefined) deployAir(state, unit, t);
        return;
      }
      if (a === A_RETURN_TO_BASE) {
        returnToBase(unit);
        return;
      }
      if (a >= A_PRIORITY_TARGET && a < A_PRIORITY_TARGET + AIR_STRIKE_COLS) {
        const t = priorityTargets(state, unit, AIR_STRIKE_COLS)[a - A_PRIORITY_TARGET];
        if (t !== undefined) airStrike(state, unit.id, t, actor.seat, true);
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
          // the STEP half of the decomposition log, and it belongs HERE
          // rather than inside `stepUnit`: this call site is `_step_verb`'s
          // twin, and it is the only one the replay drives. `tileFreeForUnit`
          // is the GPU's `ok`, so a refusal has to print too or the pair
          // reads as silence on one side.
          const mpBefore = unit.movesLeft;
          const freeU = tileFreeForUnit(state, to.index, actor.seat, unit, allowEmb);
          const outU = freeU ? stepUnit(state, unit, to) : 'blocked';
          const dlS = (globalThis as { __diffLog?: string[] }).__diffLog;
          if (dlS) {
            // the ordered ROW and the unit's TYPE ride the line: same row and
            // same type on both sides means the replay's row-to-unit
            // alignment holds and the chassis is the same one, which is the
            // fork this pair has to be resolved down.
            // keyed on the ORDER — seat, turn, rank — not on the edge. An
            // edge key cannot pair the very case the log exists for: two
            // engines sending one unit to DIFFERENT tiles produce two
            // different keys and print as two unpaired lines, which reads
            // exactly like a pair and is not one.
            // the MP BEFORE the step rides the line. A mid-turn movement
            // difference is invisible at a turn boundary because
            // `refreshUnits` resets the pool, so the census can compare
            // `movesLeft` every turn and still never see it.
            dlS.push(`st:${actor.seat}:${state.turn}:${seqRow}:${j}`
              + ` ty${UNIT_TYPE_IDX.indexOf(unit.type)} a${a}`
              + ` at${here.index} to${to.index} mp${mpBefore}`
              + ` ${outU === 'moved' || outU === 'halted' ? 'moved' : 'blocked'}`);
          }
        }
      } else if (a >= 6 && a < 12) {
        // ATTACK — safe to replay BECAUSE the walkers stand down for
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
          && unitsHostile(state, unit, { seat: tileSeat(t) });
        const hereOwned = raidable(here);
        // CIV6: pillaging takes "3 Movement Points, or all of your movement";
        // Depredation prices it at 1.
        // CIV6 (Malón Raider): "Pillaging costs 1 Movement" — the same
        // discount Depredation gives, written on the chassis.
        const pillageCost = Math.max(promoValue(unit, 'PILLAGE_CHEAP'),
          UNITS[unit.type]?.pillageCost ?? 0);
        // CIV6 (Loot): "+50 Gold from coastal raids", flat and on top of
        // whatever the wrecked target's own plunder row pays.
        const raidGold = (): void => { actor.treasury += promoValue(unit, 'RAID_GOLD'); };
        const spendPillage = (raid = false): void => {
          if (raid && UNITS[unit.type]?.raidFreeMoves) return;
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
        // CIV6 (Mountain Tunnel): "Cannot be pillaged or removed" — the one
        // improvement the verb refuses outright rather than wrecking for
        // nothing, the same shape as the Encampment's district clause.
        const impWreckable = (t: Tile): boolean => !!t.improvement && !t.pillaged
          && !IMPROVEMENTS[t.improvement as keyof typeof IMPROVEMENTS]?.noPillage;
        if (impWreckable(here) && hereOwned) {
          here.pillaged = true;
          pillagePlunder(state, unit, IMPROVEMENTS[here.improvement as keyof typeof IMPROVEMENTS]?.plunder, false, here.improvement ?? undefined, tileSeat(here));
          spendPillage();
        } else if (hereOwned && districtWreckable(here)) {
          wreckDistrict(here);
        } else if ((UNITS[unit.type]?.raider || (leaderOf(state, unit.seat) === 'HARDRADA' && navalMelee(UNITS[unit.type])))
          // CIV6 (Barbary Corsair): "It costs no Movement to coastal raid" —
          // the three-point reserve goes with the spend.
          && isWater(here)
          && (UNITS[unit.type]?.raidFreeMoves || unit.movesLeft >= 3 * MP_SCALE)) {
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
          const impT = cand.find(impWreckable);
          if (impT) {
            impT.pillaged = true;
            pillagePlunder(state, unit, IMPROVEMENTS[impT.improvement as keyof typeof IMPROVEMENTS]?.plunder, false, impT.improvement ?? undefined, tileSeat(impT));
            spendPillage(true);
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
          // CIV6 (LOC_UNITOPERATION_REPAIR_BLOCKED_BY_DROUGHT): a drought's
          // improvement waits for the rain
          if (droughtBars(here, here.improvement)) return;
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
          // CIV6 (Mountain Tunnel, Qhapaq Ñan, Ski Resort): the rows whose target is not
          // the builder's own tile — "Can only be built on an adjacent
          // Mountain tile". The unit stands off the mountain, so the
          // legality and the write both move to `adjacentPlotTarget`.
          const idef = IMPROVEMENTS[imp];
          if (idef.adjacentPlot) {
            const tt = adjacentPlotTarget(state.map, here, idef, (t: Tile) => tileOwnedByCiv(t, actor.seat));
            if (tt >= 0 && adjacentPlotRowOk(idef, unit.type, un, leaderOf(state, actor.seat))
                && (unit.charges ?? 0) > 0) {
              state.map.tiles[tt].improvement = imp;
              unit.charges = (unit.charges ?? 0) - 1;
              unit.movesLeft = 0;
              if (unit.charges <= 0 && unitIsNoncombat(unit.type)) disbandUnit(state, unit.id);
            }
            return;
          }
          // CIV6 (`OnePerCity`): what the CITY that owns this tile already
          // holds. The city walk lives here because this is the only place a
          // city is in hand (`uniqueGroundOk`).
          const oneHeld = new Set<ImprovementId>();
          const hereCity = cityAtTile(state, here);
          if (hereCity) {
            for (const t of state.map.tiles) {
              if (t.improvement && tileBelongsTo(t, hereCity)) oneHeld.add(t.improvement as ImprovementId);
            }
          }
          if (!here.improvement
              && validImprovementsIn(here, { unlocks: un, builder: unit.type, map: state.map, camps: campTiles(state), gpAppeal: cityAppealResolver(state), ownsTile: (t: Tile) => tileOwnedByCiv(t, actor.seat), suzerain: suzerainNames(state, actor.seat), civ: civOf(state, actor.seat), farmTerrain: getModifiers(state, actor.seat).farmTerrain, civics: actor.research.civics, hidden: hiddenResourcesFor(state, actor.seat), oneHeld, govPromos: hereCity ? cityGovernorPromos(state, hereCity) : undefined }).includes(imp)) {
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
            if (unit.charges <= 0 && unitIsNoncombat(unit.type)) disbandUnit(state, unit.id);
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
        // legality and the payout both live in `builderHarvest`
        builderHarvest(state, unit.id);
      } else if (a === A_WONDER_CHARGE) {
        // CIV6 (The First Emperor): a charge into the wonder underfoot
        wonderChargeBoost(state, unit, actor);
      } else if (a === A_PORTAL) {
        // CIV6 (Mountain Tunnel, Qhapaq Ñan): "move into it and exit from
        // another portal at the cost of 2 Movement". The exit is the NEXT
        // portal on the same range by ascending tile index, wrapping.
        const exit = portalExit(state.map, here);
        if (exit >= 0 && unit.movesLeft >= PORTAL_MP * MP_SCALE
            && tileFreeForUnit(state, exit, unit.seat, unit)) {
          unit.tileIndex = exit;
          unit.movesLeft -= PORTAL_MP * MP_SCALE;
          revealAround(state, unit.seat, exit, unitSight(unit, state), { seeThrough: unitSeesThrough(unit) });
        }
      }
    });
  }
}

/**
 * ONE city's ranged strikes for the turn, in its owner's turn — the centre's
 * and then the Encampment's. A major's city calls this from `seatPhase`, a
 * city-state's from `minorPhase`, each with the strength its own centre
 * fights at. The target is the nearest unit hostile to the city's seat at
 * range 1-2, the lowest tile index on a tie; one roll, no retaliation, no
 * capture.
 */
export function cityStrikes(state: GameState, city: City, strikeCS: number): void {
  const striker = { seat: city.seat };
  // CIV6: walls give a city its ranged strike, and "if the Outer Defense of
  // a city or defensible district has been completely destroyed, its ranged
  // strike again becomes unavailable".
  const perimeter = outerPool(state, city) > 0;
  // CIV6 (Embrasure): "City gains an additional Ranged Strike per turn" —
  // it reaches every district of the city that has one, so the centre and
  // the Encampment each fire the extra shot, re-scanning for a target.
  const strikes = 1 + governorSum(state, city, (e) => e.extraStrikes);
  const shoot = (origin: Tile, key: 'cstk' | 'estk'): void => {
    let bestTile = -1;
    let bestDist = 99;
    for (const t of state.map.tiles) {
      const d = hexDistance(state.map, origin.col, origin.row, t.col, t.row);
      if (d < 1 || d > 2) continue;
      // ANY unit hostile to the city's seat that a shot may take (`shootable`:
      // a military one): a city's strike picks its target by distance, never
      // by which enemy the unit belongs to.
      if (!visibleHostilesAt(state, t.index, striker).some(shootable)) continue;
      if (d < bestDist) {
        bestDist = d;
        bestTile = t.index;
      }
    }
    if (bestTile < 0) return;
    const defender = stackDefender(state, visibleHostilesAt(state, bestTile, striker).filter(shootable), true); // a city strike is a SHOT
    const defCSa = cityStrikeDefenderCS(state, defender, state.map.tiles[bestTile], city.seat);
    // a survived Military Emergency pays its target +2 CS on every City
    // Strike against a member, forever. CIV6 (Expansion1_Emergencies.xml):
    // the reward is gated on COMBAT_DISTRICT_VS_UNIT, so the Encampment's
    // shot pays it too.
    const atkCS = strikeCS + emergencyStrikeCS(state, city.seat, defender.seat);
    defender.hp -= damageRoll(state, atkCS - defCSa, key, bestTile);
    awardDefenseXp(state, defender); // +2 to a surviving military defender (attacker is the city)
    warWearinessBattle(state, city.seat, defender.seat, bestTile, { dDied: defender.hp <= 0, city: true });
    // The STRIKER is the city, so the dig's era gate is its owner's — the GPU
    // passes `striker_row` at the same site.
    if (defender.hp <= 0) {
      unitKillEvent(state, city.seat, undefined, defender);
      killUnit(state, defender);
    }
  };
  for (let sk = 0; perimeter && sk < strikes; sk++) shoot(state.map.tiles[city.centerIndex], 'cstk');
  // CIV6: "building any level of Walls in the city will supply both" the
  // centre and the Encampment — each with its OWN pool — and the district
  // strikes on its own only "while its Wall defenses are still up". It
  // conducts a ranged strike of its OWN: the scan measures from its tile.
  for (let sk = 0; sk < strikes; sk++) {
    const encD = city.districts.find((dd) => {
      const edt = state.map.tiles[dd.tileIndex];
      return encampmentIntact(edt) && encampOuterPool(state, city, edt) > 0;
    });
    if (!encD) break;
    shoot(state.map.tiles[encD.tileIndex], 'estk');
  }
}

/**
 * THE CITIES' HEAL, once a game turn, beside the units' (`refreshUnits`):
 * CIV6 heals every unit and every city after the last player's turn and the
 * World Congress, before the counter moves (tools/civ6lab/turn_order_civ6.md:
 * 22 of 22 city and district heals in that phase). A city — a civ's, a Free
 * City, a city-state's centre alike — "will automatically regain 20 HP per
 * turn", or the whole damage when less, attacked that turn or not (42 of 42
 * attacked and free healed; city-state 13 +20 three times) — until it is
 * ENCIRCLED, at which point "it will no longer be able to repair the damage
 * it suffers" (0 of 4 besieged healed); CIV6 (Defense Logistics): "City cannot
 * be put under siege" — the ring may close and the heal still runs. The outer
 * defenses are NOT on this gate: "once damaged, the outer defenses of a City
 * Center or defensible district will not regenerate on their own" (0 of 47
 * walls pools healed), and come back only through the Repair Outer Defenses
 * project. A civ's unbesieged Encampment repairs beside its city. A City
 * Center or Encampment caught in a blast has its HP reduced to 0, and
 * "Healing is impossible ... while the fallout lasts".
 */
export function healCities(state: GameState): void {
  for (const actor of state.seats) {
    for (const civCity of actor.cities) {
      const centre = state.map.tiles[civCity.centerIndex];
      if (!governorFlag(state, civCity, (e) => e.noSiege) && encircled(state, centre, actor.seat)) continue;
      if (!irradiated(centre)) civCity.hp = Math.min(CITY_MAX_HP, civCity.hp + CITY_HEAL_PER_TURN);
      for (const d of civCity.districts) {
        if (d.type !== 'ENCAMPMENT') continue;
        const dt = state.map.tiles[d.tileIndex];
        if (dt.district !== 'ENCAMPMENT' || !dt.districtComplete || dt.districtPillaged) continue;
        // "This is an automatic action, which happens if its tile is not
        // occupied" — an enemy standing on the district holds it silent.
        if (unitsAt(state, dt.index).some((u) => unitsHostile(state, u, { seat: actor.seat }))) continue;
        if (!irradiated(dt)) dt.encampHp = Math.min(ENCAMPMENT_HP, (dt.encampHp ?? ENCAMPMENT_HP) + CITY_HEAL_PER_TURN);
      }
    }
  }
  for (const cityState of state.cityStates) {
    if (cityState.hp === undefined || cityState.hp >= CITY_STATE_MAX_HP) continue;
    const centre = state.map.tiles[cityState.centerIndex];
    if (encircled(state, centre, cityState.seat) || irradiated(centre)) continue;
    cityState.hp = Math.min(CITY_STATE_MAX_HP, cityState.hp + CITY_HEAL_PER_TURN);
  }
  for (const city of state.freeSeat?.cities ?? []) {
    const centre = state.map.tiles[city.centerIndex];
    if (!encircled(state, centre, FREE_SEAT) && !irradiated(centre)) city.hp = Math.min(CITY_MAX_HP, city.hp + CITY_HEAL_PER_TURN);
  }
}

/**
 * ONE SEAT'S DIPLOMACY, at the tail of its own turn: the record's
 * agreements in the GPU's arm order — denounce, friendship, the alliance
 * friendship unlocks, the delegation, the border grant, the gifts — then its
 * offer on the table and its answers to the offers standing there, then its
 * promise asks, each answered at once by the promiser's own record (a keep
 * made, else a refusal). Every arm is re-validated here — the record only
 * names the target. A seat with no city takes no diplomacy.
 */
function seatDiplomacy(state: GameState, actor: Seat, recG: SeatActionRecord | undefined): void {
  if (!isCiv(actor.seat) || actor.cities.length === 0) return;
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
    // WHICH work goes is not a decision: the giver's FIRST city holding one
    // of the kind gives its LAST-placed such work, and the receiver's first
    // city with an open slot that takes it receives — the same walk the
    // deal item and the heist make.
    const from = actor.cities.find((c) => gwCountKind(c, kind) > 0);
    const work = from ? gwLastOfKind(from, kind) : undefined;
    const home = work ? target.cities.find((c) => gwHasRoom(state, c, work.obj)) : undefined;
    if (!from || !work || !home) continue;
    moveGreatWork(state, from, work.slot, home);
    state.eventLog.push(`${actor.name} gifts a Great Work to ${target.name}.`);
  }
  // THE TABLE: this seat's offer goes down, then its answers to the offers
  // standing — an offer nobody takes stands until `dealPhase` sweeps it.
  if (recG?.offer) {
    const [tj, give, ask] = recG.offer;
    const target = seatOf(state, tj);
    if (target && isCiv(tj) && tj !== actor.seat && target.cities.length > 0
        && give.length <= DEAL_ITEMS && ask.length <= DEAL_ITEMS) {
      setDealOffer(state, actor.seat, tj, { left: DEAL_OFFER_TURNS + 1, give, ask });
    }
  }
  for (const fj of recG?.accept ?? []) {
    // CIV6 (Ending a War): "the peaceful resolution of a war involves
    // diplomatic negotiations" — a table between two seats at war IS the
    // peace deal, so confirming it is what ends the war.
    const wasWar = civsAtWar(state, fj, actor.seat);
    const from = seatOf(state, fj);
    if (!from || !acceptDeal(state, fj, actor.seat)) continue;
    if (wasWar) makePeace(state, from, actor.seat);
    state.eventLog.push(`${actor.name} accepts a deal from ${from.name}.`);
  }
  // THE PROMISES this seat asks: each settles at once against the promiser's
  // own record — kept where that record keeps it, refused otherwise
  // (`settlePromises`).
  const promiseAsks: [number, number, number][] = [];
  for (const [tj, k] of recG?.askPromise ?? []) promiseAsks.push([actor.seat, tj, k]);
  if (promiseAsks.length === 0) return;
  const promiseKeeps: [number, number, number][] = [];
  for (const other of state.seats) {
    const recP = state.seatActions?.[state.turn - 1]?.[other.seat];
    for (const [fj, k] of recP?.keepPromise ?? []) if (fj === actor.seat) promiseKeeps.push([other.seat, fj, k]);
  }
  settlePromises(state, promiseAsks, promiseKeeps);
}

/** What a completed tech or civic pays at EVERY completion: CIV6 (Global
 *  Warming Mitigation) "Awards 3 Envoys / Awards 1 Diplomatic Victory
 *  point"; (Seasteads) 1 Diplomatic Victory point; (Future Civic) "1
 *  Governor title and 50 Diplomatic Favor each time it is completed";
 *  (Future Tech) "+5% Production towards city projects each time". */
function researchAward(actor: Seat, effects: readonly ResearchEffect[]): void {
  for (const fx of effects) {
    if (fx.kind !== 'award') continue;
    if (fx.envoys) actor.envoysAvailable = (actor.envoysAvailable ?? 0) + fx.envoys;
    if (fx.dvp) actor.diplomaticPoints = (actor.diplomaticPoints ?? 0) + fx.dvp;
    if (fx.favor) actor.diplomaticFavor = (actor.diplomaticFavor ?? 0) + fx.favor;
    if (fx.titles) actor.grantedTitles = (actor.grantedTitles ?? 0) + fx.titles;
    if (fx.projectPct) actor.researchProjectPct = (actor.researchProjectPct ?? 0) + fx.projectPct;
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

    placeIdleCitizens(actor.cities);
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
      actor.relicReserve = drainRelicReserve(state, actor.relicReserve, actor.cities, actor.seat);
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
        const gov = seatGovernment(state, actor.seat);
        const tier = gov ? GOV_INFLUENCE_TIER[gov] ?? 0 : 0;
        // CIV6 (Rogue State): "Earn no influence toward new Envoys."
        if (!getModifiers(state, actor.seat).noEnvoyInfluence) {
          // CIV6 (Monarchy, GOVERNMENTBONUS_ENVOYS): "+50% Influence Points" toward
          // more Envoys — a percentage of the WHOLE per-turn sum, which is
          // why it multiplies here and not inside any one term.
          const _infl = INFLUENCE_PER_TURN + tier
            + getModifiers(state, actor.seat).influencePerTurn
            + seatBuildingSum(state, actor.seat, 'influencePerTurn')
            // CIV6 (Economic alliance 2): an Envoy point per turn "for every
            // City-State with your Ally as Suzerain".
            + ALLIANCE_E2_INFLUENCE * allianceSuzInfluence(state, actor.seat);
          actor.influencePoints = (actor.influencePoints ?? 0)
            + _infl * getModifiers(state, actor.seat).influenceMult;
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
      // (cityState.seatQuest[actor.seat], indexed by seat, the GPU's own
      // geometry); a satisfied one resolves here (+QUEST_ENVOYS to
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

    // THE SEAT'S ECONOMY, before its cities. CIV6: each player's start of
    // turn banks its science (a technology completing takes effect at once),
    // then its gold, upkeep and bankruptcy, then its pending policies, its
    // culture and civics, its faith and its Great Person points, and only then
    // walks its cities, which read the result — a technology's +1 Production
    // lands the turn it completes, a shortfall's amenity penalty the same turn
    // (tools/civ6lab/turn_order_civ6.md; runs/turnorder/armT_*, armB_*,
    // c93_*). Each yield is banked off the cities as they stand at its own
    // step, in city order: the science as the turn opened (Maya 6.3047, not
    // the shortfall's 5.5508), the gold after the techs (Egypt +39.047 with
    // Cartography's Fishing Boats, not +36.848), the culture after the
    // shortfall and the policies, the faith after the civics. A read is taken
    // again only where a step between has moved what the cities yield: a
    // technology, the shortfall or the policies, a civic.
    const grantedNow: string[] = []; // the roster's technology grants, spawned after the upkeep
    const econMods = getModifiers(state, actor.seat);
    // this seat's governor seats for THIS turn — persistent assignments the
    // roster already carries, read once before the walk moves any loyalty.
    const rGovIds = governedCityIds(actor);
    const readYields = (): CityStats['total'][] => {
      const lux = luxuryAmenities(state, actor.seat);
      const mods = getModifiers(state, actor.seat);
      return actor.cities.map((c) => computeCityStats(state, c, lux, mods).total);
    };
    // `total.gold` is already NET of district+building upkeep —
    // computeCityStats subtracts it — so it is not charged a second time.
    const citySum = (ys: CityStats['total'][], key: 'science' | 'gold' | 'culture' | 'faith'): number => {
      let sum = 0;
      for (const y of ys) sum += y[key];
      return sum;
    };
    // CIV6 (Alliance, level 1): the ally's routes INTO this seat pay the
    // receiver half of the typed route bonus - empire-level, per route.
    const allianceRoute = (key: string, sum: number): number => {
      for (const o of state.seats) {
        if (o.seat === actor.seat) continue;
        const aty = allianceTypeWith(state, actor.seat, o.seat);
        if (aty >= 0 && ALLIANCE_ROUTE_FROM[aty] > 0 && ALLIANCE_ROUTE_YKEY[aty] === key) {
          const n = (o.tradeRoutes ?? []).filter((r) => r.toSeat === actor.seat).length;
          sum += ALLIANCE_ROUTE_FROM[aty] * n;
        }
        // CIV6 (Religious alliance 3): "+1 Faith for each of your Citizens
        // following your ally's religion."
        if (key === 'faith' && alliedAtLevel(state, actor.seat, o.seat, ALLIANCE_RELIGIOUS, 3)) {
          for (const c of actor.cities) {
            if (c.followedReligion === o.seat) sum += ALLIANCE_REL3_FAITH_PER_POP * c.population;
          }
        }
      }
      return sum;
    };
    // CIV6 (The Last Prophet): "+1 Science for each foreign city following
    // Arabia's Religion" (`FOREIGN_FOLLOWER_YIELD_ROWS`)
    // Then the seat's own per-city-state yields: (Raj) per suzerainty,
    // (Merchant Confederation) per envoy placed — the player's, no city's.
    const foreignFollowers = (key: string, sum: number): number => {
      const sm = getModifiers(state, actor.seat);
      // CIV6 (MODIFIER_PLAYER_RELIGION_ADD_RELIGIOUS_BELIEF_YIELD: Tithe,
      // Church Property, Lay Ministry, World Church, Pilgrimage): the
      // player's income, in no city (runs/h1_duelw1108, Xi'an t232: China's
      // capital reads none of Lay Ministry's 3 Culture and 2 Faith)
      sum += beliefSeatYields(state, actor.seat, sm)[key as YieldKey];
      const foreignRows = sm.foreignFollowerYields;
      if (foreignRows.length) {
        const foreign = foreignFollowerCount(state, actor.seat);
        for (const r of foreignRows) {
          if (r.yield === key) sum += r.amount * Math.floor(foreign / Math.max(1, r.per));
        }
      }
      const perSuz = sm.seatYieldPerSuzerain[key as YieldKey] ?? 0;
      if (perSuz) sum += perSuz * state.cityStates.filter((cs) => isSuzerain(state, cs, actor.seat)).length;
      const perEnvoy = sm.seatYieldPerEnvoy[key as YieldKey] ?? 0;
      if (perEnvoy) sum += perEnvoy * state.cityStates.reduce((n, cs) => n + envoysOf(cs, actor.seat), 0);
      // then the player's percent per suzerainty, on all of the above
      return sum * seatYieldMultPerSuzerain(state, actor.seat, sm, key as YieldKey);
    };
    let yields = readYields();
    const rsr = actor.research;

    // SCIENCE, and the technologies it completes.
    let sciSum = citySum(yields, 'science');
    // The seat's science/turn off the cities' own sums, folded in city order —
    // the Moon Landing lump reads it, and the GPU folds the identical columns
    // in slot order, so the f64 association agrees.
    const sciPerTurnSeat = sciSum;
    sciSum = foreignFollowers('science', allianceRoute('science', sciSum));
    // the seat's OUTPUT this turn, stored for allies' percentage reads -
    // written before those reads, so the terms never compound
    actor.sciRate = sciSum;
    for (const o of state.seats) {
      if (o.seat === actor.seat) continue;
      // CIV6 (Research alliance 3): "+10% of your ally's Science" while
      // researching a tech the ally completed, or the tech the ally is on.
      if (alliedAtLevel(state, actor.seat, o.seat, ALLIANCE_RESEARCH, 3) && rsr.tech
        && (o.research.techs.includes(rsr.tech) || o.research.tech === rsr.tech)) {
        sciSum += ALLIANCE_R3_SCI_PCT * (o.sciRate ?? 0);
      }
    }
    const gTech = goldenBoostBonus(state, actor.seat, false);
    const gCivic = goldenBoostBonus(state, actor.seat, true);
    // The RESEARCH PICK arrives on the wire (applySeatActionRecord). A seat
    // with no pick banks progress with no current tech — the same wait the
    // GPU's `cur_tech == -1` already models.
    rsr.techProgress += sciSum;
    // LIFETIME science — the cultureTotal pattern, beside the stream add.
    // Every seat accrues (the GPU twin is seat_science_total rows 0..R);
    // lump grants (applyLumpGrant, goody maps) add to the same field.
    actor.scienceTotal = (actor.scienceTotal ?? 0) + sciSum;
    const bTech = rosterBoostPoints(state, actor.seat, false);
    let techDone = false;
    while (rsr.tech && rsr.techProgress >= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech, bTech)) {
      rsr.techProgress -= effectiveResearchCostIn(rsr, rsr.tech, TECHS[rsr.tech].cost, gTech, bTech);
      if (rsr.tech === URBAN_DEFENSES_TECH) urbanDefensesFit(state, actor.seat);
      researchAward(actor, TECHS[rsr.tech].effects);
      if (!rsr.techs.includes(rsr.tech)) rsr.techs.push(rsr.tech);
      // CIV6 (EFFECT_GRANT_UNIT_IN_CITY): the roster's free unit at this
      // technology. The SPAWN waits for the upkeep charge below — a unit
      // granted this turn starts paying next turn, and the GPU's grant sits on
      // the same side of `_seat_upkeep_and_bankruptcy`.
      for (const g of econMods.grantUnits) {
        if (g.tech !== rsr.tech || !g.unit) continue;   // a CLASS row is a founding grant
        grantedNow.push(g.unit);
      }
      delete rsr.techRetained[rsr.tech];
      rsr.tech = null;
      techDone = true;
    }
    if (!rsr.tech && availableTechsIn(rsr).length === 0) rsr.techProgress = Math.min(rsr.techProgress, 0);

    // GOLD, off the cities as the technologies left them; then the upkeep and
    // the bankruptcy that upkeep may force.
    if (techDone) yields = readYields();
    const goldSum = foreignFollowers('gold', allianceRoute('gold', citySum(yields, 'gold')));
    actor.treasury = (actor.treasury ?? 0) + goldSum;
    // a WON City-State Emergency pays +1 gold/turn per envoy, banked before
    // the upkeep
    actor.treasury += emergencyEnvoyIncome(state, actor.seat);
    const upkMods = getModifiers(state, actor.seat);
    const _upk = state.units.reduce(
      (s, u) => s + (u.seat === actor.seat ? unitUpkeep(upkMods, u) : 0),
      0,
    );
    // WHAT the seat is charged and for HOW MANY units, before the charge
    // lands: a rate difference and a roster difference look identical in the
    // purse and are two different bugs.
    const _dlu = (globalThis as { __diffLog?: string[] }).__diffLog;
    if (_dlu) _dlu.push(`up:${actor.seat}:${state.turn}`
      + ` n${state.units.filter((u) => u.seat === actor.seat).length}`
      + ` cost${_upk.toFixed(3)} purse${(actor.treasury ?? 0).toFixed(3)}`);
    actor.treasury -= _upk;
    actor.treasury -= wmdUpkeep(state, actor.seat);
    const shortfallBefore = actor.goldShortfall ?? 0;
    bankruptcy(state, actor, (u) => unitUpkeep(upkMods, u));
    // CIV6 (EFFECT_GRANT_UNIT_IN_CITY): the roster's technology grants, after
    // the upkeep they do not yet owe AND after the bankruptcy that upkeep may
    // force.
    for (const id of grantedNow) {
      const cap = actor.cities.find((c) => c.centerIndex === actor.capitalTile) ?? actor.cities[0];
      if (cap) spawnUnit(state, id, cap.centerIndex, actor.seat);
    }

    // THE PENDING POLICIES: the record's government and slotted cards.
    const policiesMoved = !!rec && ((rec.government !== null && rec.government !== undefined) || !!rec.policies);
    if (rec) applySeatPolicies(state, actor, rec);

    // CULTURE, off the cities as the shortfall and the policies left them;
    // the tourism, favor and grievance tallies; then the civics it completes.
    if ((actor.goldShortfall ?? 0) !== shortfallBefore || policiesMoved) yields = readYields();
    let culSum = foreignFollowers('culture', allianceRoute('culture', citySum(yields, 'culture')));
    actor.culRate = culSum;
    for (const o of state.seats) {
      if (o.seat === actor.seat) continue;
      // CIV6 (Cultural alliance 3): "+10% of your ally's Culture".
      if (alliedAtLevel(state, actor.seat, o.seat, ALLIANCE_CULTURAL, 3)) {
        culSum += ALLIANCE_C3_CUL_PCT * (o.culRate ?? 0);
      }
    }
    // the tourism term reads the seat's ERA off its completed research: after
    // this turn's techs, before any civic completes
    seatAccumulators(state, actor.seat, rGovIds);
    rsr.civicProgress += culSum;
    // LIFETIME culture — the same per-turn sum, banked separately
    // because civicProgress is SPENT by every completed civic. Real Civ 6
    // scores DOMESTIC TOURISTS off lifetime culture, so this is the substrate
    // the Culture victory reads. Zero-draw; the GPU mirrors at this position.
    actor.cultureTotal = (actor.cultureTotal ?? 0) + culSum;
    const bCivic = rosterBoostPoints(state, actor.seat, true);
    const _govBefore = seatGovernment(state, actor.seat);
    const _slotsBefore = governmentSlots(state, actor.seat);
    let civicDone = false;
    while (rsr.civic && rsr.civicProgress >= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost, gCivic, bCivic)) {
      rsr.civicProgress -= effectiveResearchCostIn(rsr, rsr.civic, CIVICS[rsr.civic].cost, gCivic, bCivic);
      researchAward(actor, CIVICS[rsr.civic].effects);
      if (!rsr.civics.includes(rsr.civic)) rsr.civics.push(rsr.civic);
      delete rsr.civicRetained[rsr.civic];
      actor.government.civicTurn = state.turn;
      rsr.civic = null;
      civicDone = true;
    }
    if (!rsr.civic && availableCivicsIn(rsr).length === 0) rsr.civicProgress = Math.min(rsr.civicProgress, 0);
    // CIV6 (Legacy policy card): the card is unlocked by having BEEN in its
    // government, so the seat remembers the one it is in now. A seat whose
    // record never chose follows the newest government its civics unlock, and
    // only a completed civic moves that, which is why this sits at the loop's
    // exit; a CHANGE carries the slotted cards over.
    const _govNow = seatGovernment(state, actor.seat);
    actor.government.held |= governmentBit(_govNow);
    if (_govNow && _govNow !== _govBefore) carryPolicies(state, actor.seat, _slotsBefore);
    // every district type's count of completed specialty districts, taken
    // when a technology or civic completes — before the cities produce
    if (techDone || civicDone) refreshDistrictDiscount(state, actor.seat);

    // FAITH, off the cities as the civics left them.
    if (civicDone) yields = readYields();
    const _fBase = citySum(yields, 'faith');
    let faithSum = allianceRoute('faith', _fBase);
    const _fAll = faithSum;
    faithSum = foreignFollowers('faith', faithSum);
    const _fFor = faithSum;
    faithSum += peacefulFounderFaith(state, actor.seat);
    // THE TURN'S FAITH INCOME, before it lands. One number per seat per
    // turn: it splits an income disagreement from a SPEND disagreement,
    // which is two halves of the search space in one line.
    const _dlfi = (globalThis as { __diffLog?: string[] }).__diffLog;
    if (_dlfi) _dlfi.push(`fi:${actor.seat}:${state.turn}`
      + ` sum${faithSum.toFixed(6)} was${(actor.faith ?? 0).toFixed(6)}`
      + ` base${_fBase.toFixed(6)} all${_fAll.toFixed(6)} for${_fFor.toFixed(6)}`
      + ` gold${goldSum.toFixed(6)} purse${(actor.treasury ?? 0).toFixed(6)}`);
    actor.faith = (actor.faith ?? 0) + faithSum;

    advanceGreatPeople(state, actor.seat);

    // The PANTHEON RACE — an eager rule for EVERY seat row, drawn from the
    // open pool; the gate and the draw mirror the GPU's row-generic
    // `_seat_pantheon_race`, so the streams stay aligned. A religion's own
    // beliefs are the record's `beliefs` arm (`adoptBeliefs`).
    // Pantheon: costs PANTHEON_FAITH_COST from this seat's own faith.
    if (actor.religion.pantheon === null && (actor.faith ?? 0) >= PANTHEON_FAITH_COST) {
      const open = Object.keys(PANTHEONS).filter((id) => !state.claimedPantheons.includes(id));
      if (open.length > 0) {
        actor.faith = (actor.faith ?? 0) - PANTHEON_FAITH_COST;
        const pick = open[Math.floor(nextRandom(state) * open.length)];
        state.claimedPantheons.push(pick);
        pantheonMoment(state, actor.seat);
        actor.religion.pantheon = pick; // the id IS the claim; effects apply via getModifiers
        state.eventLog.push(`${actor.name} founded a pantheon (${PANTHEONS[pick].name} is taken).`);
      }
    }

    // THE CITIES, after the economy. CIV6: each city runs its production (the
    // completion, a Settler's citizen), then grows or starves on the city as
    // it stands after that completion, then claims its border tile, then
    // takes its loyalty (tools/civ6lab/turn_order_civ6.md: 11 of 11 cities;
    // runs/turnorder/armS_* — a Settler's -1 and then the pop-5 surplus,
    // +2.129 Food). The walk puts every city's Production in, in city order,
    // off the stats taken again after the economy; then reads every city
    // again, as the productions left them; then grows, claims and takes the
    // loyalty of each, in city order, off that second read — the read the
    // census keeps. Iterate a SNAPSHOT: a city founded this turn does not act
    // (the GPU gates on the pre-turn alive mask the same way).
    const walkCities = [...actor.cities];
    const seatMods = getModifiers(state, actor.seat);
    const madeOf = new Map<number, number>();
    {
      const luxMap = luxuryAmenities(state, actor.seat);
      for (const civCity of walkCities) madeOf.set(civCity.id, computeCityStats(state, civCity, luxMap, seatMods).total.production);
    }
    // CIV6 (Military alliance 2): "+15% Production toward military units
    // when you or your ally are at war."
    const warBuffPct = warBuffProdPct(state, actor.seat) / 100;
    const milAllyWarPct = state.seats.some((x) => x.seat !== actor.seat
      && alliedAtLevel(state, actor.seat, x.seat, ALLIANCE_MILITARY, 2)
      && (atWarWithAny(state, actor.seat) || atWarWithAny(state, x.seat))) ? ALLIANCE_M2_MIL_PROD_PCT / 100 : 0;
    for (const civCity of walkCities) {
      const production = madeOf.get(civCity.id)!;
      const q = civCity.queue[0];
      // CIV6 (City_BuildQueue 0x177d10): the step clears the yield the last
      // one converted before it puts this turn's Production in
      delete civCity.projectYield;
      if (q && (q.kind === 'settler' || q.kind === 'unit' || q.kind === 'district' || q.kind === 'building' || q.kind === 'project' || q.kind === 'wonder')) {
        // The seat's GOVERNMENT/POLICY encampHarborProdMult: a seat that
        // adopts the government owns its effects; the multiplier keys on
        // the ITEM, not on the seat.
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
        // CIV6 (Global Energy Treaty, outcome B): +100% Production toward the
        // named power plant.
        if (q.kind === 'building') _em *= congressEnergyProdMult(state, q.building);
        // CIV6 (EFFECT_ADJUST_BUILDING_PRODUCTION): the roster's building rows
        // CIV6 (Treasure Fleet): a row may be keyed on the city sitting OFF
        // the seat's home continent — its original capital's landmass
        const _offHome = !onHomeContinent(state, civCity.seat, civCity.centerIndex);
        if (q.kind === 'building') _em *= prodMultFor(seatMods.prodMults, { kind: 'building', building: q.building, district: BUILDINGS[q.building]?.district }, _offHome);
        // CIV6 (Public Works Program): "+100% / -50% Production towards this
        // Project."
        if (q.kind === 'project') _em *= congressProjectMult(state, PROJECT_LIST.findIndex((pr) => pr.id === q.project));
        // CIV6 (Zoning Commissioner): "+20% Production towards constructing
        // Districts in the city".
        // CIV6 (Letters of Marque): "Naval Raiders: +100% Production";
        // (Flower Power, Mercenary Companies on Production): a unit cost
        // multiplier, which this model pays as a slower fill rather than a
        // moved queue cost.
        if (q.kind === 'unit' && UNITS[q.unit]?.raider) _em *= seatMods.navalRaiderProdMult;
        if (q.kind === 'unit') _em /= unitProdCostMult(state, civCity.seat, q.unit);
        // CIV6 (Thunderbolt of the North): "+50% Production toward all naval
        // melee units."
        if (q.kind === 'unit' && leaderOf(state, civCity.seat) === 'HARDRADA' && navalMelee(UNITS[q.unit])) _em *= HARDRADA_NAVAL_MELEE_PROD_MULT;
        // CIV6 (EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION): the roster's unit-class rows
        if (q.kind === 'unit') _em *= prodMultFor(seatMods.prodMults, { kind: 'unit', promoClass: promoClassOf(q.unit), unit: q.unit }, _offHome);
        if (q.kind === 'district') _em *= governorMult(state, civCity, (e) => e.districtProdMult);
        // CIV6 (Merchant Republic, GOVERNMENTBONUS_DISTRICT_PRODUCTION):
        // "+15% Production toward Districts."
        if (q.kind === 'district') _em *= seatMods.districtProdMult;
        // CIV6 (Founder of Carthage): "+50% Production toward districts in the
        // city with the Government Plaza" (`PLAZA_DISTRICT_PROD_ROWS`)
        if (q.kind === 'district' && seatMods.plazaDistrictProd
          && civCity.districts.some((d) => d.type === 'GOVERNMENT_PLAZA'
            && state.map.tiles[d.tileIndex].districtComplete)) {
          _em *= 1 + seatMods.plazaDistrictProd / 100;
        }
        // CIV6 (EFFECT_ADJUST_DISTRICT_PRODUCTION): the roster's district rows
        if (q.kind === 'district') _em *= prodMultFor(seatMods.prodMults, { kind: 'district', districtItem: q.district }, _offHome);
        // CIV6 (Space Initiative, Arms Race Proponent): +30% toward the named
        // projects in the governor's city; (Hong Kong): "+20% Production
        // towards city projects"
        // (Future Tech): "+5% Production towards city projects each time it
        // is completed" — the percent the seat has banked
        if (q.kind === 'project') _em *= (1 + governorSum(state, civCity, (e) => e.projectProdPct?.[q.project]) / 100) * seatMods.projectProdMult * suzerainProjectMult(state, civCity.seat) * (1 + (seatOf(state, civCity.seat)?.researchProjectPct ?? 0) / 100);
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
          if (at !== undefined && crossesRiver(state.map, state.map.tiles[civCity.centerIndex], state.map.tiles[at])) {
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
        // CIV6 (Integrated Space Cell, EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION):
        // "+15% Production toward Space Race projects if a city has either a
        // Military Academy or a Seaport" — a building standing, not dark
        if (q.kind === 'project' && isSpaceProject(q.project) && seatMods.spaceProjectProd.length) {
          const dark = darkBuildings(state.map, civCity);
          for (const r of seatMods.spaceProjectProd) {
            if (r.buildings.some((b) => civCity.buildings.includes(b) && !dark.has(b))) _bpct += r.pct / 100;
          }
        }
        // CIV6 (TRAIT_LIBERATION_WAR_PRODUCTION, YIELD_PRODUCTION Amount 100):
        // a percent on every item for the turns after the declaration
        _bpct += warBuffPct;
        _em *= 1 + prodBoostPct(seatMods, q, actor.gpPerm) + _bpct;
        const progressBefore = q.progress;
        const banked = civCity.productionBank ?? 0;
        // the city's Production holds its envoys' flat toward this item
        // (`computeCityStats`)
        q.progress += production * _em;
        // Pay in the bank right after the production add, so the field
        // written below is read back.
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
        // CIV6 (Project_YieldConversions; City_BuildQueue 0x184ae0): a
        // district project converts PercentOfProductionRate of the Production
        // the step put into it — before the item's own percents, with the
        // bank, never above its cost — into its yield, which the city's
        // yields read until the next step
        const conv = q.kind === 'project' ? PROJECTS[q.project] : undefined;
        if (conv?.yield) {
          civCity.projectYield = { key: conv.yield, amount: Math.min(production + banked, cost) * projectConversionRate(conv) };
        }
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
    }
    const grown = new Map<number, CityStats>();
    {
      const luxMap = luxuryAmenities(state, actor.seat);
      const mods = getModifiers(state, actor.seat);
      for (const civCity of walkCities) grown.set(civCity.id, computeCityStats(state, civCity, luxMap, mods, true));
    }
    const civCityDefectors: City[] = [];
    for (const civCity of walkCities) {
      const stats = grown.get(civCity.id)!;
      const popBefore = civCity.population;
      seatGrowth(civCity, stats.effectiveFoodSurplus, stats.growthNeeded, state.turn);
      cityBorderGrowth(state, civCity, actor.seat, cultureAfterGrowth(state, civCity, popBefore, stats));
      if (applyLoyalty(state, civCity, stats.amenities.tier.name, rGovIds.has(civCity.id), stats.foodSurplus < 0)) {
        civCityDefectors.push(civCity);
      }
      cityStrikes(state, civCity, cityStrikeStrength(state, civCity));
    }

    for (const civCity of civCityDefectors) flipCity(state, civCity);
    spreadReligiousPressure(state, actor.seat);

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
          // CIV6 (Democracy): "Alliance Points with all allies increase by an
          // additional .25 per turn" — each side's own government pays it.
          + getModifiers(state, actor.seat).alliancePointsPerTurn
          + getModifiers(state, other).alliancePointsPerTurn
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

    // THE SEAT'S ACTIONS, after its processing and before the next
    // player's turn (tools/civ6lab/turn_order_civ6.md, A11): its diplomacy,
    // its purchases, its silo, its levy, its routes, then its units.
    seatDiplomacy(state, actor, rec);
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
          if (civCity && bid) bought = buySeatBuilding(state, actor, civCity, bid);
        }
      }
      // KIND 5 — a DISTRICT bought with gold (the Contractor's promotion).
      // The site names the city, as kind 3's tile does, and
      // `purchaseSeatDistrict` re-validates the permission, the placement and
      // the purse before anything is spent.
      if (!bought && rec?.buy?.[0] === 5) {
        const d = SCAFFOLD_DISTRICTS[rec.buy[2]];
        if (d) bought = purchaseSeatDistrict(state, actor, rec.buy[1], d.id, false);
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
        // the city the purchase SPAWNS in is the one whose buildings price it
        const buyCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
        for (const def of goldBuyableUnits(state, actor.seat)) {
          // CIV6 (purchase placement, measured in the live game): the bought unit
          // lands ON the centre and the purchase is refused when a unit of
          // its class already stands there — re-validated HERE, at apply
          // time, as the GPU's `_seat_buy_unit_candidates` does: a unit
          // trained onto the centre earlier this turn blocks the buy
          // (9027 t196 spilled a Warrior to a neighbour on TS alone)
          if (purchaseSpotBlocked(state, buyCity, actor.seat, def.id)) continue;
          if (!goldAffordable(actor.treasury ?? 0, unitGoldPrice(state, def.id, actor.seat, buyCity))) continue;
          if (def.combat > pickCombat) {
            pickCombat = def.combat;
            pickId = def.id;
          }
        }
        if (pickId) {
          const spawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
          const price = unitGoldPrice(state, pickId, actor.seat, spawnCity);
          const u = spawnUnit(state, pickId, spawnCity.centerIndex, actor.seat);
          if (u) {
            actor.treasury = (actor.treasury ?? 0) - price;
            bought = true;
            applyTrainingGrants(state, spawnCity, u);
            // CIV6 (GS): a strategic unit pays its resource "the moment you
            // purchase it" — the same charge the GPU's gold arm makes; a
            // purchase outside a queue pays full price
            chargeUnitResource(state, actor.seat, pickId);
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
      let boughtDistrict = false;
      for (const ent of rec?.buyFaith ?? []) {
        const [fk, centre] = ent;
        if (fk === 15) {
          // kind 15 — FAITH patronage; no city involved, the class rides
          // the third slot.
          if (!boughtPatron) boughtPatron = patronizeGreatPerson(state, actor.seat, ent[2] ?? -1, 'faith').ok;
          continue;
        }
        if (fk === 17) {
          // kind 17 — a DISTRICT bought with FAITH (the Divine Architect's
          // promotion). Its `a` is the SITE tile, as gold's kind 5 is, so the
          // city is found from the site rather than named directly.
          if (!boughtDistrict) {
            const d = SCAFFOLD_DISTRICTS[ent[2] ?? -1];
            if (d) boughtDistrict = purchaseSeatDistrict(state, actor, centre, d.id, true);
          }
          continue;
        }
        const civCityF = actor.cities.find((c) => c.centerIndex === centre);
        if (!civCityF) continue;
        if (fk === 4) buyWorshipBuilding(state, civCityF.id, actor.seat);
        else if ((fk === 5 || fk === 6 || fk === 11 || fk === 14 || fk === 18) && !boughtRelig) {
          const rt = fk === 5 ? 'MISSIONARY' : fk === 6 ? 'APOSTLE'
            : fk === 11 ? 'INQUISITOR' : fk === 18 ? 'GURU' : 'WARRIOR_MONK';
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
    // candidate row / drive.py). The engine rules are the walk and plunder
    // (`tradeRouteWalk`) and the round-trip expiry (`tradeRouteExpiry`), the
    // same two a city-state's routes run (`minorTrade`).
    {
      tradeRouteWalk(state, actor);
      // the wire intent: [origin CENTRE, dest code] — a CENTRE tile, or
      // -(2 + city-state ID) for a city-state: an ID, because
      // `captureCityState` splices the array and a POSITION would shift under
      // the wire. Re-validated like every wire intent
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
      tradeRouteExpiry(state, actor);
    }
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
