import { describe, it, expect } from 'vitest';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { makeMap, makeState, tileAtCoords, grantTechs } from '../helpers';
import { foundCity, queueBuilding, purchaseBuilding, purchaseUnit, purchaseSettler, queueProject, availableProjects, projectCost, buildingPurchaseCost, buildingFaithCost, unitPurchaseCost, settlerCost, endTurn, itemCost } from '../../../cpu/core/game';
import { spawnUnit, builderRemoveFeature, builderHarvest, settlerCount } from '../../../cpu/core/units';
import { chopValue, chopGrant, harvestGrant } from '../../../cpu/core/economy';
import { PROJECTS, PROJECT_YIELD_FRACTION, PROJECT_GPP_FRACTION } from '../../../cpu/data/projects';
import type { City, DistrictId, GameState } from '../../../cpu/core/types';

function foundAt(state: GameState, col: number, row: number): City {
  const r = foundCity(state, tileAtCoords(state.map, col, row).index, 0);
  expect(r.ok).toBe(true);
  return r.city!;
}

function addDistrict(state: GameState, city: City, type: DistrictId, col: number, row: number): void {
  const t = tileAtCoords(state.map, col, row);
  t.district = type;
  t.districtComplete = true;
  setTileOwner(t, city.seat, city.id);
  city.districts.push({ type, tileIndex: t.index });
}

describe('gold & faith purchases', () => {
  it('buys a building outright at 4x production cost', () => {
    const state = makeState();
    const city = foundAt(state, 5, 5);
    const cost = buildingPurchaseCost('MONUMENT');
    expect(cost).toBeGreaterThan(0);
    seatOf(state, 0)!.treasury = cost + 10;
    const r = purchaseBuilding(state, city.id, 'MONUMENT', 0);
    expect(r.ok).toBe(true);
    expect(city.buildings).toContain('MONUMENT');
    expect(seatOf(state, 0)!.treasury).toBe(10);
  });

  it('refuses purchases you cannot afford or complete', () => {
    const state = makeState();
    const city = foundAt(state, 5, 5);
    seatOf(state, 0)!.treasury = 5;
    expect(purchaseBuilding(state, city.id, 'MONUMENT', 0).ok).toBe(false);
    seatOf(state, 0)!.treasury = 10000;
    // Library needs a completed Campus — not even offered without one.
    expect(purchaseBuilding(state, city.id, 'LIBRARY', 0).ok).toBe(false);
  });

  it('buys worship buildings with faith', () => {
    const state = makeState();
    const city = foundAt(state, 5, 5);
    addDistrict(state, city, 'HOLY_SITE', 6, 5);
    city.buildings.push('SHRINE', 'TEMPLE');
    seatOf(state, 0)!.religion.worship = 'CATHEDRAL';
    const cost = buildingFaithCost('CATHEDRAL');
    seatOf(state, 0)!.faith = cost + 3;
    seatOf(state, 0)!.treasury = 0;
    const r = purchaseBuilding(state, city.id, 'CATHEDRAL', 0);
    expect(r.ok).toBe(true);
    expect(city.buildings).toContain('CATHEDRAL');
    expect(seatOf(state, 0)!.faith).toBe(3);
    expect(seatOf(state, 0)!.treasury).toBe(0); // gold untouched
  });

  it('buys units and settlers with gold', () => {
    const state = makeState();
    state.unitsMode = true;
    const city = foundAt(state, 5, 5);
    seatOf(state, 0)!.treasury = unitPurchaseCost(state, 'BUILDER', 0);
    expect(purchaseUnit(state, city.id, 'BUILDER', 0).ok).toBe(true);
    expect(state.units.length).toBe(1);
    expect(seatOf(state, 0)!.treasury).toBe(0);
    expect(seatOf(state, 0)!.buildersTrained).toBe(1); // P4/D-10
    expect(unitPurchaseCost(state, 'BUILDER', 0)).toBeGreaterThan(120); // escalated
    expect(purchaseUnit(state, city.id, 'BUILDER', 0).ok).toBe(false); // broke

    const sCost = settlerCost(state, 0) * 4;
    seatOf(state, 0)!.treasury = sCost;
    expect(purchaseSettler(state, city.id, 0).ok).toBe(true);
    expect(settlerCount(state, 0)).toBe(1); // a real UNIT spawns at the city
    expect(seatOf(state, 0)!.treasury).toBe(0);
  });
});

describe('chops and harvests', () => {
  function chopSetup() {
    const state = makeState();
    state.unitsMode = true;
    grantTechs(state, 'MINING'); // unlocks Woods removal
    const city = foundAt(state, 5, 5);
    const woods = tileAtCoords(state.map, 6, 5); // ring 1 — owned
    woods.feature = 'WOODS';
    const builder = spawnUnit(state, 'BUILDER', woods.index, 0)!;
    builder.tileIndex = woods.index;
    return { state, city, woods, builder };
  }

  it('chopping woods inside borders grants era-scaled production', () => {
    const { state, city, woods, builder } = chopSetup();
    queueBuilding(state, city.id, 'MONUMENT', 0);
    const expected = chopValue(state, 0);
    expect(chopGrant(state, woods, 0)).toEqual({ key: 'production', amount: expected });
    const r = builderRemoveFeature(state, builder.id, 0);
    expect(r.ok).toBe(true);
    expect(woods.feature).toBeNull();
    expect(city.queue[0].progress).toBe(expected);
    expect(builder.charges).toBe(2);
    expect(state.eventLog.some((e) => e.includes('Chopped'))).toBe(true);
  });

  it('chop value scales with research progress', () => {
    const state = makeState();
    const before = chopValue(state, 0);
    grantTechs(state, 'MINING', 'POTTERY', 'ANIMAL_HUSBANDRY', 'BRONZE_WORKING');
    expect(chopValue(state, 0)).toBeGreaterThan(before);
  });

  it('chops outside your borders grant nothing', () => {
    const { state, builder } = chopSetup();
    const far = tileAtCoords(state.map, 10, 10);
    far.feature = 'WOODS';
    builder.tileIndex = far.index;
    expect(chopGrant(state, far, 0)).toBeNull();
    const r = builderRemoveFeature(state, builder.id, 0);
    expect(r.ok).toBe(true);
    expect(far.feature).toBeNull();
    expect(state.eventLog.some((e) => e.includes('Chopped'))).toBe(false);
  });

  it('chopped production banks while the queue is empty and flows into the next build', () => {
    const { state, city, builder } = chopSetup();
    expect(city.queue.length).toBe(0);
    builderRemoveFeature(state, builder.id, 0);
    const banked = city.productionBank ?? 0;
    expect(banked).toBeGreaterThan(0);
    queueBuilding(state, city.id, 'MONUMENT', 0);
    endTurn(state, 0);
    const head = city.queue[0];
    if (head) {
      expect(head.progress).toBeGreaterThanOrEqual(banked);
    } else {
      expect(city.buildings).toContain('MONUMENT'); // bank finished it outright
    }
    expect(city.productionBank ?? 0).toBe(0);
  });

  it('harvests bonus resources for a lump, removing them', () => {
    const state = makeState(makeMap(12, 12, 'PLAINS'));
    state.unitsMode = true;
    const city = foundAt(state, 5, 5);
    const wheat = tileAtCoords(state.map, 6, 5);
    wheat.resource = 'WHEAT'; // FARM is unlocked from the start
    const builder = spawnUnit(state, 'BUILDER', wheat.index, 0)!;
    builder.tileIndex = wheat.index;
    const grant = harvestGrant(state, wheat, 0);
    expect(grant).toEqual({ key: 'food', amount: chopValue(state, 0) });
    const r = builderHarvest(state, builder.id);
    expect(r.ok).toBe(true);
    expect(wheat.resource).toBeNull();
    expect(city.foodBox).toBe(grant!.amount);
    expect(builder.charges).toBe(2);
  });

  it('luxuries and un-teched resources cannot be harvested', () => {
    const state = makeState();
    const city = foundAt(state, 5, 5);
    const t = tileAtCoords(state.map, 6, 5);
    setTileOwner(t, city.seat, city.id);
    t.resource = 'WINE'; // luxury: no harvestYield
    expect(harvestGrant(state, t, 0)).toBeNull();
    t.resource = 'STONE'; // needs Mining for the Quarry
    expect(harvestGrant(state, t, 0)).toBeNull();
    grantTechs(state, 'MINING');
    expect(harvestGrant(state, t, 0)).not.toBeNull();
  });
});

describe('district projects', () => {
  it('are only offered with the matching completed district', () => {
    const state = makeState();
    const city = foundAt(state, 5, 5);
    expect(availableProjects(state, city).length).toBe(0);
    expect(queueProject(state, city.id, 'RESEARCH_GRANTS', 0).ok).toBe(false);
    addDistrict(state, city, 'CAMPUS', 6, 5);
    expect(availableProjects(state, city).map((p) => p.id)).toContain('RESEARCH_GRANTS');
  });

  it('convert production into a yield lump plus great-person points, repeatably', () => {
    const state = makeState();
    const city = foundAt(state, 5, 5);
    addDistrict(state, city, 'CAMPUS', 6, 5);
    // Grant the cheap Ancient techs (raises the project cost via the
    // max-tree curve) and BANK the research: with no active tech the lump
    // sits in techProgress instead of completing something mid-turn.
    grantTechs(state, 'POTTERY', 'ANIMAL_HUSBANDRY', 'MINING', 'SAILING', 'ARCHERY', 'ASTROLOGY', 'IRRIGATION', 'WRITING', 'MASONRY', 'BRONZE_WORKING', 'WHEEL');
    state.autoResearch = false;
    seatOf(state, 0)!.research.tech = null;
    const r = queueProject(state, city.id, 'RESEARCH_GRANTS', 0);
    expect(r.ok).toBe(true);
    const cost = itemCost(city.queue[0]);
    expect(cost).toBe(projectCost(state, 0));

    city.queue[0].progress = cost; // about to finish
    const sciBefore = seatOf(state, 0)!.scienceTotal;
    endTurn(state, 0);
    const lump = Math.round(cost * PROJECT_YIELD_FRACTION);
    const gpp = Math.round(cost * PROJECT_GPP_FRACTION);
    expect(city.queue.length).toBe(0);
    expect(seatOf(state, 0)!.scienceTotal - sciBefore).toBeGreaterThanOrEqual(lump);
    expect(seatOf(state, 0)!.research.techProgress).toBeGreaterThanOrEqual(lump);
    expect(seatOf(state, 0)!.gpp.SCIENTIST ?? 0).toBeGreaterThanOrEqual(gpp);
    expect(state.eventLog.some((e) => e.includes('Research Grants'))).toBe(true);

    // Repeatable: nothing stops you queueing it again.
    expect(queueProject(state, city.id, 'RESEARCH_GRANTS', 0).ok).toBe(true);
  });

  it('Encampment Training grants only general points', () => {
    const state = makeState();
    const city = foundAt(state, 5, 5);
    addDistrict(state, city, 'ENCAMPMENT', 6, 5);
    queueProject(state, city.id, 'TRAINING', 0);
    const cost = itemCost(city.queue[0]);
    city.queue[0].progress = cost;
    endTurn(state, 0);
    expect(seatOf(state, 0)!.gpp.GENERAL ?? 0).toBeGreaterThanOrEqual(
      Math.round(cost * PROJECT_GPP_FRACTION),
    );
    // No yield lump. Asserting a bound derived from PROJECT_YIELD_FRACTION
    // would test the constant's size, not the project: at the sourced 0.15 the
    // bound falls below ordinary city gold income. Assert the actual
    // invariant: TRAINING carries no yield by construction, and no
    // other GP class moves.
    expect(PROJECTS.TRAINING.yield).toBeNull();
    expect(seatOf(state, 0)!.gpp.SCIENTIST ?? 0).toBe(0);
    expect(seatOf(state, 0)!.gpp.ARTIST ?? 0).toBe(0);
  });

  // The Festival is the ONE multi-class project. Real Civ 6 pays Great
  // Writer, Great Artist AND Great Musician ~11% each (its D_TYPE is 5, where
  // every other district project's is 10 and pays one class ~22%). MEASURED
  // gate-unreachable: the 12-seed scripted gate completes 51 Campus Research
  // Grants and 7 Holy Site Prayers but ZERO Festivals, so parity cannot see
  // this. GPU twin: gpu/festival_test.py.
  it('the Theater Square Festival pays Writer, Artist and Musician alike', () => {
    // A Theater Square accrues +1 Writer/Artist/Musician per turn on its own,
    // so measure the project's contribution against a CONTROL that runs the
    // same turn with no project queued.
    const control = makeState();
    const cc = foundAt(control, 5, 5);
    addDistrict(control, cc, 'THEATER_SQUARE', 6, 5);
    endTurn(control, 0);
    const base = seatOf(control, 0)!.gpp.WRITER ?? 0;

    const state = makeState();
    const city = foundAt(state, 5, 5);
    addDistrict(state, city, 'THEATER_SQUARE', 6, 5);
    const r = queueProject(state, city.id, 'FESTIVAL', 0);
    expect(r.ok).toBe(true);
    const cost = itemCost(city.queue[0]);
    city.queue[0].progress = cost;
    endTurn(state, 0);

    const each = Math.round(cost * 0.11);
    expect(each).toBeGreaterThan(0);
    expect((seatOf(state, 0)!.gpp.WRITER ?? 0) - base).toBe(each);
    expect((seatOf(state, 0)!.gpp.ARTIST ?? 0) - base).toBe(each);
    expect((seatOf(state, 0)!.gpp.MUSICIAN ?? 0) - base).toBe(each);
    // ... at the Festival's OWN rate, not the single-class 22%
    expect(each).not.toBe(Math.round(cost * PROJECT_GPP_FRACTION));
    // ... and no unrelated class is paid
    expect(seatOf(state, 0)!.gpp.SCIENTIST ?? 0).toBe(0);
    expect(seatOf(state, 0)!.gpp.PROPHET ?? 0).toBe(0);
  });

  it('are refused in sandbox mode', () => {
    const state = makeState();
    state.sandbox = true;
    const city = foundAt(state, 5, 5);
    addDistrict(state, city, 'CAMPUS', 6, 5);
    expect(queueProject(state, city.id, 'RESEARCH_GRANTS', 0).ok).toBe(false);
  });
});
