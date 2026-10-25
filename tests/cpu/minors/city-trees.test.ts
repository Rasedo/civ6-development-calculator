/**
 * THE CITY EVENTS, TREES AND CONTRACTS OVER TURNS: one city-state city of
 * tests/cpu/minors/city-trees-scenario.json runs its turns of its city AI
 * under each variant — the items built hand their contracts in, the goals
 * reached, the slots freed, the contract in hand checked, the improvement
 * picked, the events, the Default Specialization's contracts, the trees'
 * tick — with the orders its trees give landing the next turn. Per turn the
 * slots, the trees, the contracts, the reservations, the contract in hand,
 * the orders (city-trees-pins.json).
 *
 * The GPU twin is tests/gpu/city_trees_test.py, every variant a game of one
 * batch, against the same pins.
 */
import { describe, it } from 'vitest';
import { matchPins } from './pins';
import { readFileSync } from 'node:fs';
import {
  buildingEvent, districtEvent, freeSlots, goalsReached, improvementEvent, newCityAi, pickImprovement, tickCityTrees,
  type CityTreeCity, type CityTreeWorld, type PlotEval, type TreeUnit,
} from '../../../cpu/core/aiCityTrees';
import { cityContracts, contractBuilt, inHandCheck, queueContract, takesTurn, type ContractItem } from '../../../cpu/core/aiContracts';
import { AI_CITY_EVENTS, AI_CITY_EVENT_LISTS } from '../../../cpu/data/aiCityTrees';
import { AI_BUILDINGS, AI_DISTRICTS, AI_IMPROVEMENTS, AI_UNITS } from '../../../cpu/data/aiBuildTables';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX } from '../../../cpu/core/aiCityBuild';
import { FX, FX_MIN } from '../../../cpu/core/aiValue';

interface Scenario {
  seat: number; city: number; cityPlot: number; turns: number; owned: number[]; unowned: number[];
  evals: { plot: number; owned: boolean; improvable: boolean; districtOk: boolean; nearOwned: boolean;
    improvements: Record<string, number>; districts: Record<string, number> }[];
  canImprove: [number, string][]; districtSites: number[]; buildings: Record<string, number>; units: Record<string, number>;
  techs: string[]; civics: string[]; gain: Record<string, string[]>; researching: Record<string, string>;
  bestUnit: number; bestProject: number; buildTurns: number; variants: ({ ties: number[] } & Partial<Scenario>)[];
}

const SC = JSON.parse(readFileSync(new URL('./city-trees-scenario.json', import.meta.url), 'utf-8')) as Scenario;
const LIST = AI_CITY_EVENTS[AI_CITY_EVENT_LISTS.MINOR_CIV_DEFAULT_TRAIT];

const itemName = (c: ContractItem): string => c.unit ?? c.building ?? c.district ?? '';

/** the scenario's turns under one variant: per turn its digest */
function runScenario(sc: Scenario, variant: { ties: number[] }): unknown[] {
  const ai = newCityAi();
  const evals: PlotEval[] = sc.evals.map((e) => ({
    plot: e.plot, owned: e.owned, improvable: e.improvable, districtOk: e.districtOk, nearOwned: e.nearOwned,
    improvements: AI_IMPROVEMENTS.map((r) => (r.type in e.improvements ? e.improvements[r.type] * FX : FX_MIN)),
    districts: AI_DISTRICTS.map((r) => (r.type in e.districts ? e.districts[r.type] * FX : FX_MIN)),
  }));
  const buildings = AI_BUILDINGS.map((r) => (r.type in sc.buildings ? sc.buildings[r.type] * FX : FX_MIN));
  const units = AI_UNITS.map((r) => (r.type in sc.units ? sc.units[r.type] * FX : FX_MIN));
  const techs = new Set(sc.techs);
  const civics = new Set(sc.civics);
  const held: string[] = [];
  const placed: { district: string; plot: number }[] = [];
  const improved = new Set<number>();
  let tree: TreeUnit[] = [];
  let nextUnit = 40;
  let contractIds = 1;
  let treeIds = 100;
  const ties = [...variant.ties];
  let pending: [number, string, number, string | null][] = [];
  let current: (ContractItem & { plot: number }) | null = null;
  let left = 0;
  let cleared = 0;
  const out: unknown[] = [];
  const city: CityTreeCity = {
    id: sc.city, name: 'X', underThreat: false, current: null, foundedTurn: -99, currentValue: FX_MIN,
    buildingBlocked: (b) => held.includes(b),
    districtBlocked: (d) => placed.some((x) => x.district === d),
    canTrain: () => true, trainsSea: false,
    buildTurns: () => sc.buildTurns,
    itemValue: (c) => (c.unit ? units[AI_UNIT_INDEX.get(c.unit)!] : c.building ? buildings[AI_BUILDING_INDEX.get(c.building)!] : FX_MIN),
    unitRow: (u) => {
      const r = AI_UNITS[AI_UNIT_INDEX.get(u)!];
      return { combat: r.combat, buildCharges: r.buildCharges, sea: r.domain === 'DOMAIN_SEA', mustPurchase: r.mustPurchase, recon: r.recon };
    },
    buildingRow: (b) => {
      const r = AI_BUILDINGS[AI_BUILDING_INDEX.get(b)!];
      return { defensive: r.defenseModifier > 0 || r.outerDefenseStrength > 0, mustPurchase: false };
    },
    districtDefensive: () => false,
    evals, bestImprovement: -1, buildings, units,
    eventBuilding: { index: -1, value: FX_MIN }, eventUnit: { index: -1, value: FX_MIN },
    buildingHeld: (b) => held.includes(b) || city.current?.building === b,
    districtHeld: (d) => placed.some((x) => x.district === d),
    threat: -1, plot: sc.cityPlot,
  };
  for (let t = 1; t <= sc.turns; t++) {
    // the orders given last turn land
    for (const [u, kind, plot] of pending) {
      const unit = tree.find((x) => x.id === u);
      if (!unit) continue;
      if (kind === 'move') unit.plot = plot;
      else {
        unit.charges -= 1;
        if (kind === 'improve') improved.add(plot);
      }
    }
    tree = tree.filter((u) => u.charges > 0);
    pending = [];
    for (const g of sc.gain[String(t)] ?? []) techs.add(g);
    const researching = sc.researching[String(t)] ?? null;
    // the item in production completes
    if (current) {
      left -= 1;
      if (left === 0) {
        let uid = -1;
        if (current.unit) {
          uid = nextUnit++;
          tree.push({ id: uid, type: current.unit, plot: sc.cityPlot, charges: AI_UNITS[AI_UNIT_INDEX.get(current.unit)!].buildCharges });
        } else if (current.building) held.push(current.building);
        else if (current.district) placed.push({ district: current.district, plot: current.plot });
        contractBuilt(ai, sc.city, current, uid, (tr, unit) => ai.trees.find((x) => x.id === tr)?.units.push(unit));
        current = null;
        city.current = null;
      }
    }
    // the event's best building not held or in hand, the best defensive unit
    let eb = { index: -1, value: FX_MIN };
    AI_BUILDINGS.forEach((b, k) => {
      if (city.buildingHeld(b.type) || buildings[k] <= eb.value) return;
      eb = { index: k, value: buildings[k] };
    });
    let eu = { index: -1, value: FX_MIN };
    AI_UNITS.forEach((u, k) => {
      if (u.foundCity || u.buildCharges > 0 || u.combat === 0 || u.recon || units[k] <= eu.value) return;
      eu = { index: k, value: units[k] };
    });
    city.eventBuilding = eb;
    city.eventUnit = eu;
    const spent = new Set<number>();
    const w: CityTreeWorld = {
      turn: t, seat: sc.seat, cities: [city], units: tree,
      techHeld: (x) => techs.has(x), civicHeld: (x) => civics.has(x), danger: () => 0,
      canImprove: (plot, imp) => !improved.has(plot) && sc.canImprove.some(([p, i]) => p === plot && i === imp),
      builderType: () => 'UNIT_BUILDER',
      plotCity: (plot) => (sc.owned.includes(plot) ? sc.city : -1),
      reachThisTurn: () => true,
      turnsTo: () => 1,
      canPlaceDistrict: (plot) => sc.districtSites.includes(plot) && !placed.some((x) => x.plot === plot),
      plotOwner: (plot) => (sc.owned.includes(plot) ? sc.seat : sc.unowned.includes(plot) ? -1 : 5),
      buildersMakeDistricts: false, buildersMakeWonders: false, plotGround: () => ({ feature: null, resource: null }),
      districtTie: () => ties.shift() ?? 0,
      distance: (a, b) => Math.abs(a - b),
      newContractId: () => contractIds++, newTreeId: () => treeIds++,
      log: () => undefined,
      clearProduction: () => {
        cleared += 1;
      },
      order: (u, kind, plot, imp) => {
        pending.push([u, kind, plot, imp ?? null]);
        if (kind !== 'move' && (tree.find((x) => x.id === u)?.charges ?? 0) <= 1) spent.add(u);
      },
      unitAlive: (u) => tree.some((x) => x.id === u) && !spent.has(u),
      startOperation: () => null, operationLive: () => false, heldContracts: () => [],
    };
    goalsReached(ai, (g) => techs.has(g) || civics.has(g), (g) => g === researching, (p) => sc.owned.includes(p));
    freeSlots(ai, w, sc.city);
    inHandCheck(ai, city, () => {
      cleared += 1;
    });
    city.bestImprovement = pickImprovement(ai, w, evals);
    buildingEvent(ai, w, city, LIST.CITY_EVENT_UNIT_OR_BUILDING);
    districtEvent(ai, w, city, LIST.CITY_EVENT_DISTRICT);
    improvementEvent(ai, w, city, LIST.CITY_EVENT_IMPROVEMENT);
    if (!current) {
      const hand = cityContracts(ai, city, () => undefined);
      if (hand && takesTurn(hand, sc.bestUnit * FX, sc.bestProject * FX)) {
        const ok = (c: ContractItem) => (c.building ? !held.includes(c.building) : c.district ? !placed.some((x) => x.district === c.district) : true);
        if (queueContract(hand, city, ok, () => undefined)) {
          current = { unit: hand.unit, building: hand.building, district: hand.district, plot: hand.plot };
          left = sc.buildTurns;
          city.current = { unit: hand.unit, building: hand.building, district: hand.district };
          city.currentValue = hand.value;
        }
      } else ai.inHand[sc.city] = -1;
    }
    tickCityTrees(ai, w);
    out.push({
      t,
      slots: [...(ai.slots[sc.city] ?? [-1, -1, -1, -1, -1, -1])],
      trees: ai.trees.map((x) => [x.slot, x.id, [...x.units].sort((a, b) => a - b)]),
      contracts: ai.contracts.map((c) => [c.id, c.tree, itemName(c) || ai.techContracts[c.id] || `PLOT ${ai.plotContracts[c.id]}`, c.progress, c.value, c.city, c.plot, c.turns]),
      res: [...ai.reservations].sort((a, b) => a.plot - b.plot).map((r) => [r.plot, r.tree, r.value]),
      hand: ai.inHand[sc.city] ?? -1,
      orders: pending.map(([u, k, p, i]) => [u, k, p, i ?? '']),
      current: current ? itemName(current) : '',
      cleared,
    });
  }
  return out;
}

describe('the city events, trees and contracts over turns', () => {
  it('runs each variant of the scenario to its pinned turns', () => {
    matchPins('city-trees-pins.json', SC.variants.map((v) => runScenario({ ...SC, ...v }, v)));
  });
});
