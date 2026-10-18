// The majors' AI's government and policy choice (ai/major/policies.ts) on a
// stub view: the present value as the game codes it, the logged scores the
// analyzers reproduce, and the choice's order, ties, bar and deferral.
import { describe, expect, it } from 'vitest';
import { FX_MIN, presentValue } from '../../../cpu/core/aiValue';
import { choosePolicies } from '../../../ai/major/policies';
import { NO_SCORE, governmentValue, policyScore, policyScores, slotTypeBest } from '../../../cpu/core/aiPolicyValue';
import { AI_POLICIES } from '../../../ai/major/tables';
import type { MajorSlotView, MajorView } from '../../../ai/major/view';

const POLICY = (type: string) => AI_POLICIES.find((p) => p.type === type)!;

function stubView(over: Partial<MajorView> = {}): MajorView {
  const slots: MajorSlotView[] = [{ slot: 'SLOT_MILITARY', policy: null }, { slot: 'SLOT_ECONOMIC', policy: null }];
  return {
    turn: 10, costMultiplierPct: 50, gameEra: 0, cityStates: 3,
    civicsHeld: () => new Set(['CIVIC_CODE_OF_LAWS']),
    civicList: () => new Set(),
    government: () => 'GOVERNMENT_CHIEFDOM',
    governmentsHeld: () => new Set(['GOVERNMENT_CHIEFDOM']),
    governmentsUnlocked: () => new Set(['GOVERNMENT_CHIEFDOM']),
    slots: () => slots,
    slotsUnder: () => slots,
    policiesSlottableUnder: () => new Set(['POLICY_DISCIPLINE', 'POLICY_SURVEY', 'POLICY_GOD_KING', 'POLICY_URBAN_PLANNING']),
    darkAge: () => false,
    goldenAge: () => false,
    greatPersonClassAvailable: () => true, fullCiv: () => true,
    cities: () => [{ id: 1, capital: true }],
    cityYield: () => 0,
    yieldWeight: () => 0,
    pseudoYieldWeight: () => 0,
    districts: () => [],
    districtYield: () => 0,
    cityHasBuilding: () => false,
    tradeRouteCapacity: () => 0,
    influenceTokensUsed: () => 0,
    tributaries: () => 0,
    unitMaintenances: () => [], cityOwnedPlots: () => [], traders: () => 0, tradeKnowledge: () => null,
    cityHasDistrict: () => false, cityReligion: () => -1, plotTerrain: () => 'TERRAIN_GRASS', plotFeature: () => null, plotsWithinReadAsAxial: () => [], cityDistricts: () => [], cityPlot: () => -1, districtPlot: () => null, cityFoodSurplus: () => 0, unitCost: () => 0, beliefsHeld: () => new Set(), religionBeliefs: () => [],
    districtBuildingYields: () => [],
    policyColumn: () => -1,
    governmentColumn: () => -1,
    pantheonColumn: () => -1, beliefColumn: () => null, religionColumn: () => -1, religionsFounded: () => new Set(),
    pantheonOpen: () => false, religionOpen: () => false, beliefPicks: () => 0, treasury: () => 0, missionOpen: () => null, actionOpen: () => null, warOpen: () => false,
    declaredFriends: () => false, allied: () => false, denouncing: () => false, favor: () => 0, congressTarget: () => 0,
    majors: () => [0],
    leader: () => null,
    metTurn: () => null,
    atWar: () => false,
    peaceTurns: () => 0,
    hasDelegation: () => false,
    hasEmbassy: () => false,
    hasOpenBorders: () => false,
    playerYield: () => 0,
    population: () => 0,
    wondersBuilt: () => 0,
    greatPeopleEarned: () => 0,
    plotsOwned: () => 0,
    religionFounded: () => null,
    majorityReligion: () => null,
    tradeRoutesBetween: () => 0,
    cityStateSeats: () => [],
    grievances: () => 0,
    militaryUnits: () => 0,
    cityBuilds: () => [],
    bestCombatStrength: () => 0,
    envoys: () => 0,
    plots: () => [], plotsWithin: () => [], plotsRing: () => [], knownUnits: () => [], barbarianCamps: () => [], barbarianSeat: () => -1, plotForeignUnits: () => 0, cityPopulation: () => 0, plotDistance: () => 0, revealed: () => false, plotYield: () => 0,
    resourceVisible: () => false, resourceHeld: () => 0, cityPlots: () => [], homeContinent: () => -1, pressureAt: () => 0,
    strategies: () => new Set(), leaderType: () => null, civilizationType: () => null, units: () => [], unitReach: () => [], hostileUnits: () => [],
    hostileCities: () => [], hostileDistricts: () => [], districtDefences: () => [], unitPath: () => [], stepDirection: () => -1, unitActionColumn: () => -1,
    mapCities: () => [], plotsSeen: () => new Set(), startPlots: () => [], handicap: () => 3, playerEra: () => 0, techCount: () => 0,
    militaryStrength: () => 0, domainStrength: () => 0, score: () => 0, greatPeopleOfClass: () => 0, greatPersonOffered: () => false, greatPersonPatronage: () => -1, faith: () => 0, greatPersonUsable: () => false, greatWorksMade: () => 0,
    domesticTourists: () => 0, visitingTourists: () => 0, scienceWonders: () => 0, spaceProjects: () => 0,
    minorCivilization: () => null, cityCitizens: () => 0, citySpecialtyDistricts: () => 0, cityStrikes: () => false, projectCompletions: () => 0, projectTurns: () => -1,
    governors: () => [], governorAvailable: () => false, governorTitles: () => 0, governorCanPromote: () => false, cityLoyaltyPerTurn: () => 0, cityStateHasCity: () => false,
    knownCities: () => [], pressureLead: () => 0, players: () => [], borderClosed: () => false, denounced: () => false,
    cityHitPoints: () => null, cityBlow: () => 0, attackTargets: () => [], attackAssignment: () => [], strikeColumn: () => -1,
    congressTargets: () => [], congressTargetsOf: () => [],
    cityStateBonus: () => null, suzerain: () => -1, greatWorksByObject: () => [], cityHousing: () => 0, greatPersonPoints: () => 0,
    greatPersonPrice: () => Infinity, religionFollowers: () => 0, cityBuildable: () => new Set(), unitPromotionClass: () => null,
    cityAmenity: () => ({ balance: 0, yields: {} }), cityHousingValue: () => 0, cityOuterStands: () => false, cityStrike: () => 0, greatPersonPointsPerTurn: () => 0, diplomaticPoints: () => 0,
    diplomaticVictoryPoints: 20, competitionLeads: () => 0, cityCanProject: () => false,
    capturedAs: () => null, campPlots: () => [], cityDefense: () => null, cityBlowFrom: () => 0, wallsBypassed: () => false, militaryYardstick: () => 1, wmdCount: () => 0, suzerainOf: () => -1, mostEnvoys: () => 0, planSpot: () => -1, attackSpots: () => [], plotUnitCount: () => 0,
    adjacentPlot: () => -1, riverEdge: () => false, encircled: () => false, reachOf: () => null, exertsZoc: () => false, defensiveImprovements: () => [], buildCharges: () => 0, unitBuildsImprovement: () => false, airStrikeColumn: () => -1, rebaseOptions: () => [], contractCities: () => [], techsHeld: () => new Set(),
    ...over,
  };
}

describe('the AI present value (0x7a16e0)', () => {
  it('takes the binomial to the third power, each product truncated', () => {
    // the routine dll_citybuild.py ports, at 2.0 percent
    expect(presentValue(256, 0x200, 19)).toBe(3876);
    expect(presentValue(256, 0x200, 25)).toBe(4864);
    expect(presentValue(128, 0x200, 50)).toBe(4017);
    expect(presentValue(256, 0x200, 0)).toBe(256);
    expect(presentValue(256, 0x200, -1)).toBe(0);
    // rate n fx(0.01) of 10 or more: the perpetuity
    expect(presentValue(256, 0x200, 600)).toBe(12699);
  });
});

describe('a policy score as the game logs it (AI_GovtPolicies.csv)', () => {
  it('values a city-state-weight card at its logged score (runs/h1_duelw1117 players 2-4)', () => {
    // Urban Planning +1 Production a city, God King +1 Gold +1 Faith in the
    // capital, one city, every weight 0: 14 and 21 as the city-states log
    const v = stubView();
    expect(policyScore(v, 1, POLICY('POLICY_URBAN_PLANNING')) / 256).toBe(14);
    expect(policyScore(v, 1, POLICY('POLICY_GOD_KING')) / 256).toBe(21);
  });

  it('values the Influence cards at their logged scores', () => {
    // Charismatic Leader +2 Influence a turn reads 14, Diplomatic League 75
    // under the Chiefdom with three city-states; their civic on the list
    const v = stubView({ civicList: () => new Set(['CIVIC_POLITICAL_PHILOSOPHY', 'CIVIC_DRAMA_POETRY']) });
    expect(policyScore(v, 1, POLICY('POLICY_CHARISMATIC_LEADER')) / 256).toBe(14);
    expect(policyScore(v, 1, POLICY('POLICY_DIPLOMATIC_LEAGUE')) / 256).toBe(75);
    // +2 Great Writer points: 15 (player 0's line)
    expect(policyScore(v, 1, POLICY('POLICY_LITERARY_TRADITION')) / 256).toBe(15);
  });

  it('gives a card of a civic neither held nor listed no score, an obsolete one FX_MIN', () => {
    const v = stubView();
    expect(policyScore(v, 1, POLICY('POLICY_CHARISMATIC_LEADER'))).toBe(NO_SCORE);
    const late = stubView({ civicsHeld: () => new Set(['CIVIC_CODE_OF_LAWS', 'CIVIC_THEOLOGY']) });
    // God King goes with Theology's Scripture
    expect(policyScore(late, 1, POLICY('POLICY_GOD_KING'))).toBe(FX_MIN);
  });

  it('adds 250 to a Dark Age card in a Dark Age inside its era window', () => {
    const v = stubView({ darkAge: () => true, gameEra: 1 });
    expect(policyScore(v, 1, POLICY('POLICY_TWILIGHT_VALOR')) / 256).toBeGreaterThanOrEqual(250);
    expect(policyScore(stubView({ gameEra: 1 }), 1, POLICY('POLICY_TWILIGHT_VALOR'))).toBe(NO_SCORE);
  });
});

describe('the choice (0x625d70)', () => {
  const scored = (xs: Record<string, number>) => new Map(AI_POLICIES.map((p) => [p.type, (xs[p.type] ?? -1) * 256] as const));

  it('fills each slot with the best card above it, ties to the first in database order', () => {
    const v = stubView();
    const c = choosePolicies(v, 1, scored({ POLICY_DISCIPLINE: 0, POLICY_SURVEY: 0, POLICY_GOD_KING: 11, POLICY_URBAN_PLANNING: 18 }), true);
    expect(c.deferred).toBe(false);
    expect(c.slots.map((x) => x.policy)).toEqual(['POLICY_DISCIPLINE', 'POLICY_URBAN_PLANNING']);
  });

  it('keeps the slot\'s card unless one scores strictly above it', () => {
    const slots = [{ slot: 'SLOT_MILITARY', policy: 'POLICY_SURVEY' }, { slot: 'SLOT_ECONOMIC', policy: 'POLICY_GOD_KING' }];
    const v = stubView({ slots: () => slots });
    const c = choosePolicies(v, 1, scored({ POLICY_DISCIPLINE: 7, POLICY_SURVEY: 7, POLICY_GOD_KING: 18, POLICY_URBAN_PLANNING: 18 }), true);
    expect(c.slots.map((x) => x.policy)).toEqual(['POLICY_SURVEY', 'POLICY_GOD_KING']);
  });

  it('waits on a completed civic when no card scores 0 or more', () => {
    const c = choosePolicies(stubView(), 1, scored({}), true);
    expect(c.deferred).toBe(true);
  });
});

describe('the government value (0x7b0330)', () => {
  it('sums each slot type\'s best score / 10 over the slot\'s place, never back to a held one', () => {
    const best = slotTypeBest(new Map(AI_POLICIES.map((p) => [p.type, p.type === 'POLICY_URBAN_PLANNING' ? 18 * 256 : NO_SCORE] as const)));
    expect(best.get('SLOT_ECONOMIC')).toBe(18 * 256);
    const v = stubView({ governmentsHeld: () => new Set(['GOVERNMENT_CHIEFDOM', 'GOVERNMENT_AUTOCRACY']) });
    expect(governmentValue(v, 1, 'GOVERNMENT_AUTOCRACY', best, 19)).toBe(FX_MIN);
    // the Chiefdom: one economic slot, 1.8 from Urban Planning; its military
    // slot's type takes -1.0 / 10, truncated toward 0
    expect(governmentValue(stubView(), 1, 'GOVERNMENT_CHIEFDOM', best, 19)).toBe(Math.trunc(18 * 256 * 256 / 2560) + Math.trunc(-256 * 256 / 2560));
  });

  it('scores every policy the tables hold', () => {
    expect(policyScores(stubView(), 1).size).toBe(AI_POLICIES.length);
  });
});
