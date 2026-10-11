// The majors' agendas and opinion (ai/major/diplomacy.ts) on a stub view:
// the first impression's draw, the agenda pool's order and redraw, Optimus
// Princeps' territory terms and a decaying modifier's clock.
import { describe, expect, it } from 'vitest';
import { diplomacySetup, diplomacyTurnStart, newDiploGaps, opinion, opinionModifiers } from '../../../ai/major/diplomacy';
import type { MajorView } from '../../../ai/major/view';

function stubView(over: Partial<MajorView> = {}): MajorView {
  return {
    turn: 1, costMultiplierPct: 50, gameEra: 0, cityStates: 0,
    civicsHeld: () => new Set(), civicList: () => new Set(), government: () => null,
    governmentsHeld: () => new Set(), governmentsUnlocked: () => new Set(), slots: () => [], slotsUnder: () => [],
    policiesSlottableUnder: () => new Set(), darkAge: () => false, goldenAge: () => false,
    greatPersonClassAvailable: () => true, cities: () => [], cityYield: () => 0, policyColumn: () => -1, governmentColumn: () => -1,
    pantheonColumn: () => -1, beliefColumn: () => null, religionColumn: () => -1, religionsFounded: () => new Set(),
    pantheonOpen: () => false, religionOpen: () => false, beliefPicks: () => 0, treasury: () => 0, missionOpen: () => null, actionOpen: () => null, warOpen: () => false,
    declaredFriends: () => false, allied: () => false, denouncing: () => false,
    yieldWeight: () => 0, pseudoYieldWeight: () => 0, districts: () => [], districtYield: () => 0, cityHasBuilding: () => false,
    tradeRouteCapacity: () => 0, influenceTokensUsed: () => 0, tributaries: () => 0, unitMaintenances: () => [], cityOwnedPlots: () => [], traders: () => 0, tradeKnowledge: () => null, cityHasDistrict: () => false, cityReligion: () => -1, plotTerrain: () => 'TERRAIN_GRASS', plotFeature: () => null, plotsWithinReadAsAxial: () => [], cityDistricts: () => [], cityPlot: () => -1, districtPlot: () => null, cityFoodSurplus: () => 0, unitCost: () => 0, beliefsHeld: () => new Set(), religionBeliefs: () => [],
    districtBuildingYields: () => [],
    majors: () => [0, 1], leader: (s) => (s === 0 ? 'LEADER_TRAJAN' : 'LEADER_QIN'), metTurn: () => null, atWar: () => false,
    peaceTurns: () => 0, hasDelegation: () => false, hasEmbassy: () => false, hasOpenBorders: () => false,
    playerYield: () => 0, population: () => 0, wondersBuilt: () => 0, greatPeopleEarned: () => 0, plotsOwned: () => 10,
    religionFounded: () => null, majorityReligion: () => null, tradeRoutesBetween: () => 0, cityStateSeats: () => [], envoys: () => 0,
    grievances: () => 0, militaryUnits: () => 0, cityBuilds: () => [], bestCombatStrength: () => 0,
    plots: () => [], plotsWithin: () => [], plotsRing: () => [], knownUnits: () => [], barbarianCamps: () => [], barbarianSeat: () => -1, plotForeignUnits: () => 0, cityPopulation: () => 0, plotDistance: () => 0, revealed: () => false, plotYield: () => 0,
    resourceVisible: () => false, resourceHeld: () => 0, cityPlots: () => [], homeContinent: () => -1, pressureAt: () => 0,
    strategies: () => new Set(), leaderType: () => null, civilizationType: () => null, units: () => [], unitReach: () => [], hostileUnits: () => [],
    hostileCities: () => [], cityDefences: () => [], unitPath: () => [], stepDirection: () => -1, unitActionColumn: () => -1,
    mapCities: () => [], plotsSeen: () => new Set(), startPlots: () => [], handicap: () => 3, playerEra: () => 0, techCount: () => 0,
    militaryStrength: () => 0, score: () => 0, greatPeopleOfClass: () => 0, greatPersonOffered: () => false, greatWorksMade: () => 0,
    domesticTourists: () => 0, visitingTourists: () => 0, scienceWonders: () => 0, spaceProjects: () => 0,
    minorCivilization: () => null, cityCitizens: () => 0, citySpecialtyDistricts: () => 0, cityStrikes: () => false, projectCompletions: () => 0, projectTurns: () => -1,
    governors: () => [], governorAvailable: () => false, governorTitles: () => 0, governorCanPromote: () => false, cityLoyaltyPerTurn: () => 0, cityStateHasCity: () => false,
    ...over,
  };
}

/** a generator serving fixed values per label, in order */
function feed(values: Record<string, number[]>) {
  const at: Record<string, number> = {};
  return (range: number, label: string) => {
    const k = (at[label] = (at[label] ?? -1) + 1);
    const list = values[label] ?? [];
    return Math.min(list[k] ?? 0, range - 1);
  };
}

describe('the agendas (Game_Initializer 0x31d3c0)', () => {
  it('walks the Ancient era tags in order, Agendas order within each, and draws again on an exclusive pick', () => {
    // runs/h1_duelw1105: Trajan draws 18 (Expansionist, exclusive with Optimus
    // Princeps), then 11 (Populous); Qin draws 12 (Standing Army)
    const mem = diplomacySetup(stubView(), [0, 1], feed({ 'Choose random agenda': [18, 11, 12] }));
    expect(mem.agendas.get(0)).toEqual(['AGENDA_OPTIMUS_PRINCEPS', 'AGENDA_POPULOUS']);
    expect(mem.agendas.get(1)).toEqual(['AGENDA_WONDER_OBSESSED', 'AGENDA_STANDING_ARMY']);
  });
});

describe('the first impression (MODIFIER_PLAYER_DIPLOMACY_RANDOM)', () => {
  it('is floor(v x 7 / 100) - 3 of the set-up value, decaying by 1 every 10 owner turn starts from the meeting', () => {
    // the second of each slot's two passes is kept: slot 0 toward slot 1 is draw 64 + 1
    const values = Array(256).fill(50);
    values[64 + 1] = 13; // runs/h1_duelw1117: player 0's 13 -> -3
    const mem = diplomacySetup(stubView(), [0, 1], feed({ 'Random Diplomatic Value': values }));
    const gaps = newDiploGaps();
    for (let t = 162; t <= 172; t++) {
      diplomacyTurnStart(stubView({ turn: t, metTurn: () => 161 }), mem, 0, feed({}), gaps);
      const random = opinionModifiers(mem, 0, 1).get('STANDARD_DIPLOMACY_RANDOM');
      expect(random?.value).toBe(t < 171 ? -3 * 256 : -2 * 256);
    }
  });
});

describe('Optimus Princeps (0xb4d2b0)', () => {
  const run = (mine: number, theirs: number) => {
    const mem = diplomacySetup(stubView(), [0, 1], feed({}));
    const view = stubView({ turn: 200, metTurn: () => 100, plotsOwned: (s) => (s === 0 ? mine : theirs) });
    diplomacyTurnStart(view, mem, 0, feed({}), newDiploGaps());
    return opinionModifiers(mem, 0, 1).get('AGENDA_OPTIMUS_PRINCEPS')?.value ?? 0;
  };
  it('gives +5 beyond 120% of the owner\'s plots, -8 to a subject ranked below, -13 below 80%', () => {
    expect(run(100, 121)).toBe(5 * 256);
    expect(run(100, 110)).toBe(0);
    expect(run(100, 90)).toBe(-8 * 256);
    expect(run(100, 70)).toBe(-13 * 256);
  });
});

describe('the opinion', () => {
  it('sums the modifiers and floors', () => {
    const mem = diplomacySetup(stubView(), [0, 1], feed({}));
    expect(opinion(mem, 0, 1)).toBe(0);
  });
});
