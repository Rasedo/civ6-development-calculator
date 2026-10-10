/**
 * THE MAJORS' AI'S VIEW OF THIS ENGINE (ai/major/view.ts): one seat-agnostic
 * read-only view over a GameState, in the game's type names. Nothing here
 * writes the state; the slot rebuild a government change would make is laid
 * on copies (`carryLayout`).
 */
import type { MajorSlotView, MajorView } from '../../ai/major/view';
import type { AiCityView, AiDistrictView } from './aiValue';
import { pseudoYieldWeights, yieldWeights, type AiWeightInputs } from './aiWeights';
import { engineId, gameTypeOf } from '../data/aliases';
import { CIVICS } from '../data/civics';
import { COST_MULTIPLIER_PCT } from '../data/constants';
import { GP_CLASSES } from '../data/greatPeople';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICIES, POLICY_LIST, type SlotKind } from '../data/policies';
import { congressPolicyBlocked } from './congress';
import { carryLayout, darkAgeEra, fitPoliciesLoose, governmentBit, governmentSlots, governmentsOpen, inDarkAge, makeYieldCtx, seatGovernment,
  unlockedPolicyIds } from './effects';
import { gpOffer } from './greatPeople';
import { citiesOf, seatOf } from './seats';
import type { City, DistrictId, GameState, GreatPersonClass, YieldKey } from './types';
import { BUILDINGS, effectiveBuilding } from '../data/buildings';
import { DISTRICTS } from '../data/districts';
import { UNITS } from '../data/units';
import { envoysOf, suzerainOf } from './cityStates';
import { tradeCapacity } from './trade';
import { buildingPillaged, buildingVariantAdjacency, effectiveAdjacency } from './yields';
import { computeCityStats } from './city';

/** What the view takes from AI parts this engine does not run: the civic AI's
 *  research list per seat (CivicTypes), empty where none is given; per seat
 *  the strategies it follows and the majors it has met, which its weights
 *  read (`aiWeights.ts`, `AiWeightInputs`). */
export interface MajorViewInputs {
  civicList?: ReadonlyMap<number, ReadonlySet<string>>;
  weights?: ReadonlyMap<number, AiWeightInputs>;
}

const slotType = (k: SlotKind): string => `SLOT_${k.toUpperCase()}`;
const districtType = (id: string): string => `DISTRICT_${id}`;

/** a district's yield of a kind (0x24b5a0): its adjacency yield of that
 *  kind, its flat yields, and the yields of the city's buildings in it */
function districtYieldOf(state: GameState, seat: number, city: City, d: { type: DistrictId; tileIndex: number }, key: YieldKey): number {
  const tile = state.map.tiles[d.tileIndex];
  if (tile.districtPillaged) return 0;
  const ctx = makeYieldCtx(state, seat);
  const def = DISTRICTS[d.type];
  let y = 0;
  if (def.adjacencyYield === key) y += effectiveAdjacency(ctx, tile, d.type, buildingVariantAdjacency(ctx.mods.civ, city, d.type));
  y += ctx.mods.districtYieldAdd[d.type]?.[key] ?? 0;
  for (const b of city.buildings) {
    const bd = effectiveBuilding(ctx.mods.civ, b);
    if (bd?.district === d.type && !buildingPillaged(city, b)) y += bd.yields?.[key] ?? 0;
  }
  return y;
}
const YIELD_KEY: Readonly<Record<string, YieldKey>> = {
  YIELD_FOOD: 'food', YIELD_PRODUCTION: 'production', YIELD_GOLD: 'gold',
  YIELD_SCIENCE: 'science', YIELD_CULTURE: 'culture', YIELD_FAITH: 'faith',
};
const govType = (id: string): string => gameTypeOf('government', id, 'GOVERNMENT_');
const policyType = (id: string): string => gameTypeOf('policy', id, 'POLICY_');
const govId = (type: string): string | null => engineId('government', type, 'GOVERNMENT_', GOVERNMENTS);

export function majorView(state: GameState, inputs: MajorViewInputs = {}): MajorView {
  const seat = (i: number) => {
    const s = seatOf(state, i);
    if (!s) throw new Error(`majorView: no seat ${i}`);
    return s;
  };
  const slottable = (i: number, gov: string | null): Set<string> => {
    const s = seat(i);
    if (!gov) return new Set();
    return unlockedPolicyIds(s.research, congressPolicyBlocked(state), darkAgeEra(state, i), s.government.held, gov);
  };
  const slotsOf = (i: number): MajorSlotView[] => {
    const cards = seat(i).government.policies;
    return governmentSlots(state, i).map((k, j) => ({ slot: slotType(k), policy: cards[j] ? policyType(cards[j]!) : null }));
  };
  const weights = new Map<number, Record<string, number>>();
  const weightsOf = (i: number): Record<string, number> => {
    let w = weights.get(i);
    if (!w) weights.set(i, (w = yieldWeights(state, i, inputs.weights?.get(i))));
    return w;
  };
  const pseudo = new Map<number, Map<string, number>>();
  const pseudoOf = (i: number): Map<string, number> => {
    let w = pseudo.get(i);
    if (!w) pseudo.set(i, (w = pseudoYieldWeights(state, i, inputs.weights?.get(i))));
    return w;
  };
  return {
    turn: state.turn,
    costMultiplierPct: COST_MULTIPLIER_PCT,
    gameEra: state.gameEra ?? 0,
    cityStates: state.cityStates.length,
    civicsHeld: (i) => new Set(seat(i).research.civics.filter((c) => c in CIVICS).map((c) => gameTypeOf('civic', c, 'CIVIC_'))),
    civicList: (i) => inputs.civicList?.get(i) ?? new Set(),
    government: (i) => {
      const g = seatGovernment(state, i);
      return g ? govType(g) : null;
    },
    governmentsHeld: (i) => new Set(GOVERNMENT_LIST.filter((g) => seat(i).government.held & governmentBit(g.id)).map((g) => govType(g.id))),
    governmentsUnlocked: (i) => new Set(governmentsOpen(state, i).map((k) => govType(GOVERNMENT_LIST[k].id))),
    slots: slotsOf,
    slotsUnder: (i, type) => {
      const g = govId(type);
      if (!g || g === seatGovernment(state, i)) return slotsOf(i);
      const before = governmentSlots(state, i);
      const old = fitPoliciesLoose(before, seat(i).government.policies.filter((p): p is string => !!p));
      const after = governmentSlots(state, i, g);
      const open = slottable(i, g);
      const laid = carryLayout(old.map((c, j) => [before[j], c] as const), after, (c) => open.has(c));
      return after.map((k, j) => ({ slot: slotType(k), policy: laid[j] ? policyType(laid[j]!) : null }));
    },
    policiesSlottableUnder: (i, type) => {
      const g = type ? govId(type) : null;
      return new Set([...slottable(i, g)].map(policyType));
    },
    darkAge: (i) => inDarkAge(state, i),
    goldenAge: (i) => seat(i).age === 2,
    greatPersonClassAvailable: (cls) => {
      const c = cls.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass;
      return !GP_CLASSES.includes(c) || gpOffer(state, c) !== -2;
    },
    cities: (i): AiCityView[] => citiesOf(state, i).map((c) => ({ id: c.id, capital: c.isCapital })),
    cityYield: (i, id, type) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      const key = YIELD_KEY[type];
      return city && key ? computeCityStats(state, city).total[key] : 0;
    },
    yieldWeight: (i, type) => weightsOf(i)[type] ?? 0,
    pseudoYieldWeight: (i, type) => pseudoOf(i).get(type) ?? 0,
    districts: (i): AiDistrictView[] => citiesOf(state, i).flatMap((c) => c.districts
      .filter((d) => d.type !== 'CITY_CENTER')
      .map((d) => ({ cityId: c.id, type: districtType(d.type) }))),
    districtYield: (i, id, type, yieldType) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      const key = YIELD_KEY[yieldType];
      const d = city?.districts.find((x) => districtType(x.type) === type);
      return city && d && key ? districtYieldOf(state, i, city, d, key) : 0;
    },
    cityHasBuilding: (i, id, building) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      return !!city && city.buildings.includes(building.replace(/^BUILDING_/, ''));
    },
    cityHasDistrict: (i, id, type) => {
      const city = citiesOf(state, i).find((c) => c.id === id);
      return !!city && city.districts.some((d) => districtType(d.type) === type);
    },
    districtBuildingYields: (i, type, yieldType) => {
      const key = YIELD_KEY[yieldType];
      const civ = makeYieldCtx(state, i).mods.civ;
      return Object.values(BUILDINGS).filter((b) => districtType(b.district) === type).map((b) => ({
        building: `BUILDING_${b.id}`,
        amount: key ? effectiveBuilding(civ, b.id)?.yields?.[key] ?? 0 : 0,
      }));
    },
    tradeRouteCapacity: (i) => tradeCapacity(state, i),
    influenceTokensUsed: (i) => state.cityStates.reduce((n, cs) => n + envoysOf(cs, i), 0),
    tributaries: (i) => state.cityStates.filter((cs) => suzerainOf(cs) === i).length,
    unitMaintenances: (i) => state.units.filter((u) => u.seat === i).map((u) => UNITS[u.type]?.maintenance ?? 0),
    policyColumn: (type) => {
      const id = engineId('policy', type, 'POLICY_', POLICIES);
      return id ? POLICY_LIST.findIndex((p) => p.id === id) : -1;
    },
    governmentColumn: (type) => {
      const id = govId(type);
      return id ? GOVERNMENT_LIST.findIndex((g) => g.id === id) : -1;
    },
  };
}
