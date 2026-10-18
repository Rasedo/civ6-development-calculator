import { describe, expect, it } from 'vitest';
import {
  CP_ACCEPTED, CP_CANCELLED, CP_CLAIMED, CP_COMPLETED, CP_FAILED, CP_IN_PROGRESS, CP_SUBMITTED, cityContracts, contractEligible, inHandCheck,
  newContractBook, queueContract, reapContracts, submitContract, takesTurn, type AiContract, type ContractCity,
} from '../../../cpu/core/aiContracts';
import {
  SLOT_DEFENSE, SLOT_DISTRICT, SLOT_UNIT_OR_BUILDING, buildingEvent, chooseDistrict, defenseEvent, freeSlots, goalsReached, newCityAi, pickImprovement,
  slotFree, tickCityTrees, type CityTreeCity, type CityTreeWorld, type PlotEval,
} from '../../../cpu/core/aiCityTrees';
import { AI_CITY_EVENTS, AI_CITY_EVENT_LISTS } from '../../../cpu/data/aiCityTrees';
import { AI_BUILDING_INDEX } from '../../../cpu/core/aiCityBuild';
import { AI_IMPROVEMENTS } from '../../../cpu/data/aiBuildTables';
import { FX, FX_MIN } from '../../../cpu/core/aiValue';

const city = (over: Partial<ContractCity> = {}): ContractCity => ({
  id: 7, underThreat: false, current: null, foundedTurn: -99, currentValue: FX_MIN,
  buildingBlocked: () => false, districtBlocked: () => false, canTrain: () => true, trainsSea: false,
  buildTurns: () => 5, itemValue: () => FX_MIN,
  unitRow: (u) => ({ combat: u === 'UNIT_BUILDER' ? 0 : 20, buildCharges: u === 'UNIT_BUILDER' ? 3 : 0, sea: false, mustPurchase: false, recon: false }),
  buildingRow: (b) => ({ defensive: b === 'BUILDING_WALLS', mustPurchase: false }),
  districtDefensive: () => false,
  ...over,
});

const contract = (over: Partial<AiContract> = {}): AiContract => ({
  id: 1, tree: 1, treeName: 'Build City Building', unit: null, building: 'BUILDING_MONUMENT', district: null, plot: -1,
  value: 50 * FX, city: -1, maxTurns: 0, turns: -1, progress: CP_CLAIMED, assign: true, ...over,
});

describe('the contracts (Contracts.cpp)', () => {
  it('a city under threat takes only a defensive item; a completed building contract stays taken', () => {
    expect(contractEligible(contract(), city({ underThreat: true }))).toBe(false);
    expect(contractEligible(contract({ building: 'BUILDING_WALLS' }), city({ underThreat: true }))).toBe(true);
    expect(contractEligible(contract({ progress: CP_COMPLETED }), city({ buildingBlocked: () => true }))).toBe(true);
    expect(contractEligible(contract(), city({ buildingBlocked: () => true }))).toBe(false);
  });

  it('a contract in progress binds to the item the city produces', () => {
    const c = contract({ progress: CP_IN_PROGRESS });
    expect(contractEligible(c, city({ current: { unit: null, building: 'BUILDING_MONUMENT', district: null } }))).toBe(true);
    expect(contractEligible(c, city({ current: { unit: null, building: 'BUILDING_GRANARY', district: null } }))).toBe(false);
  });

  it('submission: each city that may take it lists it, logs it, and clears the production of a city founded this turn or the last one', () => {
    const book = newContractBook();
    const c = contract();
    const cleared: number[] = [];
    const lines: string[] = [];
    submitContract(book, c, [city({ foundedTurn: 9, currentValue: 10 * FX })], 10, (x) => cleared.push(x.id), (x) => lines.push(String(x.id)));
    expect(c.progress).toBe(CP_ACCEPTED);
    expect(book.city[7]).toEqual([1]);
    expect(lines).toEqual(['7']);
    expect(cleared).toEqual([7]);
    const d = contract({ id: 2 });
    submitContract(book, d, [city({ foundedTurn: 8, currentValue: 10 * FX })], 10, (x) => cleared.push(x.id), () => undefined);
    expect(cleared).toEqual([7]);
  });

  it('the economic AI takes a contract for a unit or a non-wonder building it may buy with gold, never a district', () => {
    const none = [city({ canTrain: () => false, buildingBlocked: () => true, districtBlocked: () => true })];
    const book = newContractBook();
    const make = (over: Partial<AiContract>) => {
      const c = contract(over);
      submitContract(book, c, none, 1, () => undefined, () => undefined);
      return c.progress;
    };
    expect(make({ id: 1, unit: 'UNIT_SETTLER', building: null })).toBe(CP_ACCEPTED);
    expect(make({ id: 2, building: 'BUILDING_MONUMENT' })).toBe(CP_ACCEPTED);
    expect(make({ id: 3, building: 'BUILDING_PYRAMIDS' })).toBe(CP_SUBMITTED);
    expect(make({ id: 4, unit: 'UNIT_MISSIONARY', building: null })).toBe(CP_SUBMITTED);
    expect(make({ id: 5, building: null, district: 'DISTRICT_CAMPUS' })).toBe(CP_SUBMITTED);
  });

  it('the Default Specialization takes the highest valued contract it may still take, logs the others, and a released one leaves silently', () => {
    const book = newContractBook();
    const cs = city();
    submitContract(book, contract({ id: 1, value: 30 * FX }), [cs], 1, () => undefined, () => undefined);
    submitContract(book, contract({ id: 2, value: 60 * FX, building: 'BUILDING_GRANARY' }), [cs], 1, () => undefined, () => undefined);
    submitContract(book, contract({ id: 3, value: 90 * FX, building: 'BUILDING_SHRINE' }), [cs], 1, () => undefined, () => undefined);
    book.contracts.find((c) => c.id === 2)!.progress = CP_CANCELLED;
    reapContracts(book, new Set([1, 2]));
    const lines: number[] = [];
    const held = cityContracts(book, cs, (c) => lines.push(c.id));
    expect(held?.id).toBe(1);
    expect(lines).toEqual([2]);
    expect(book.city[7]).toEqual([1]);
    expect(takesTurn(held!, 31 * FX, 0)).toBe(true);
    expect(takesTurn(held!, 31 * FX + 1, 0)).toBe(false);
  });

  it('the queue refusing a contract fails it; a queued contract the city no longer may take is cancelled', () => {
    const book = newContractBook();
    const c = contract();
    expect(queueContract(c, city(), () => false, () => undefined)).toBe(false);
    expect(c.progress).toBe(CP_FAILED);
    const d = contract({ id: 2 });
    book.contracts.push(d);
    expect(queueContract(d, city(), () => true, () => undefined)).toBe(true);
    book.inHand[7] = 2;
    let cleared = 0;
    inHandCheck(book, city({ underThreat: true, current: { unit: null, building: 'BUILDING_MONUMENT', district: null } }), () => cleared++);
    expect(d.progress).toBe(CP_CANCELLED);
    expect(cleared).toBe(1);
    expect(book.inHand[7]).toBe(-1);
  });

  it('a contract lives while a tree holds it or a city has it in hand', () => {
    const book = newContractBook();
    book.contracts.push(contract({ id: 1 }), contract({ id: 2 }), contract({ id: 3 }));
    book.inHand[7] = 3;
    expect(reapContracts(book, new Set([1]))).toEqual([2]);
    expect(book.contracts.map((c) => c.id)).toEqual([1, 3]);
  });
});

const evalAt = (plot: number, over: Partial<PlotEval> = {}): PlotEval => ({
  plot, owned: true, improvable: true, districtOk: true, nearOwned: false, improvements: [], districts: [], ...over,
});

describe('the city events and trees (CityBuild.cpp, the tree nodes)', () => {
  it('a tech contract is IN PROGRESS while researched, CLAIMED off it, COMPLETED once held', () => {
    const ai = newCityAi();
    ai.contracts.push(contract({ id: 4, building: null }));
    ai.techContracts[4] = 'TECH_MASONRY';
    goalsReached(ai, () => false, (g) => g === 'TECH_MASONRY', () => false);
    expect(ai.contracts[0].progress).toBe(CP_IN_PROGRESS);
    goalsReached(ai, () => false, () => false, () => false);
    expect(ai.contracts[0].progress).toBe(CP_CLAIMED);
    goalsReached(ai, (g) => g === 'TECH_MASONRY', () => false, () => false);
    expect(ai.contracts[0].progress).toBe(CP_COMPLETED);
  });

  it('the district choice draws on each equal value and a draw of 1 takes the later plot', () => {
    const ai = newCityAi();
    const evals = [evalAt(10, { districts: [5 * FX] }), evalAt(11, { districts: [5 * FX] }), evalAt(12, { districts: [4 * FX] })];
    let n = 0;
    expect(chooseDistrict(ai, evals, () => (n++, 0))).toEqual({ district: 0, plot: 10 });
    expect(n).toBe(1);
    expect(chooseDistrict(ai, evals, () => 1)).toEqual({ district: 0, plot: 11 });
    expect(chooseDistrict(ai, [evalAt(13, { owned: false, districts: [9 * FX] })], () => 0)).toBeNull();
  });

  it('the improvement pick reads the owned improvable plots, the highest valued', () => {
    const ai = newCityAi();
    const farm = AI_IMPROVEMENTS.findIndex((r) => r.type === 'IMPROVEMENT_FARM');
    const row = (v: number): number[] => AI_IMPROVEMENTS.map((_, i) => (i === farm ? v : FX_MIN));
    const w = { techHeld: () => true, civicHeld: () => true, builderType: () => 'UNIT_BUILDER' } as unknown as CityTreeWorld;
    expect(pickImprovement(ai, w, [evalAt(1, { improvements: row(30 * FX) }), evalAt(2, { owned: false, improvements: row(90 * FX) })])).toBe(farm);
    expect(pickImprovement(ai, w, [evalAt(1, { improvable: false, improvements: row(30 * FX) })])).toBe(-1);
  });

  it('the building event starts "Build City Building", whose tick submits the building to the city', () => {
    const ai = newCityAi();
    const monument = AI_BUILDING_INDEX.get('BUILDING_MONUMENT')!;
    const tables = new Array(AI_BUILDING_INDEX.size).fill(FX_MIN);
    tables[monument] = 24 * FX;
    const c: CityTreeCity = {
      ...city(), name: 'LOC_CITY_NAME_X', evals: [], bestImprovement: -1, buildings: tables, units: [],
      eventBuilding: { index: monument, value: 24 * FX }, eventUnit: { index: -1, value: FX_MIN },
      itemValue: (i) => (i.building === 'BUILDING_MONUMENT' ? 24 * FX : FX_MIN),
      buildingHeld: () => false, districtHeld: () => false, threat: -1, plot: 70,
    };
    const lines: string[] = [];
    let ids = 1;
    const w: CityTreeWorld = {
      turn: 3, seat: 2, cities: [c], units: [], techHeld: () => true, civicHeld: () => true, canImprove: () => false,
      builderType: () => 'UNIT_BUILDER', plotCity: () => 7, reachThisTurn: () => true, turnsTo: () => 1, canPlaceDistrict: () => false, plotOwner: () => 2,
      buildersMakeDistricts: false, buildersMakeWonders: false, districtTie: () => 0, distance: () => 1, plotGround: () => ({ feature: null, resource: null }),
      newContractId: () => ids++, newTreeId: () => 100 + ids++, log: (l) => lines.push(l), clearProduction: () => undefined,
      order: () => undefined, unitAlive: () => true, startOperation: () => 500, operationLive: (t) => t === 500, heldContracts: () => [],
    };
    const list = AI_CITY_EVENTS[AI_CITY_EVENT_LISTS.MINOR_CIV_DEFAULT_TRAIT];
    buildingEvent(ai, w, c, list.CITY_EVENT_UNIT_OR_BUILDING);
    expect(slotFree(ai, 7, SLOT_UNIT_OR_BUILDING)).toBe(false);
    tickCityTrees(ai, w);
    expect(lines).toEqual(['3, 2, LOC_CITY_NAME_X, , CONTRACT 2, SUBMITTED, NO_UNIT, BUILDING_MONUMENT, NO_DISTRICT, VALUE 24.0, Build City Building']);
    expect(ai.contracts.map((x) => [x.building, x.progress])).toEqual([['BUILDING_MONUMENT', CP_ACCEPTED]]);
    expect(ai.city[7]).toEqual([2]);
    // the building built completes the contract and the tree ends; the slot frees
    ai.contracts[0].progress = CP_COMPLETED;
    tickCityTrees(ai, w);
    freeSlots(ai, w, 7);
    expect(ai.trees).toEqual([]);
    expect(slotFree(ai, 7, SLOT_UNIT_OR_BUILDING)).toBe(true);
    expect(slotFree(ai, 7, SLOT_DISTRICT)).toBe(true);
    // the City Defense event: nothing while the city is not threatened, then
    // the list's operation at the city's plot, its tree in slot 5 while it runs
    defenseEvent(ai, w, c, list.CITY_UNDER_THREAT);
    expect(slotFree(ai, 7, SLOT_DEFENSE)).toBe(true);
    const started: [string, number][] = [];
    defenseEvent(ai, { ...w, startOperation: (n, p) => (started.push([n, p]), 500) }, { ...c, threat: 0 }, list.CITY_UNDER_THREAT);
    expect(started).toEqual([['City Defense', 70]]);
    expect(slotFree(ai, 7, SLOT_DEFENSE)).toBe(false);
    freeSlots(ai, { operationLive: () => false }, 7);
    expect(slotFree(ai, 7, SLOT_DEFENSE)).toBe(true);
  });
});
