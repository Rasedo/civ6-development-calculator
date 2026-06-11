/**
 * Research/government effects engine: computes what is unlocked and a single
 * `Modifiers` object that the yield/housing/amenity code consumes.
 */

import type { DistrictId, GameState, ImprovementId, Yields } from './types';
import { TECHS, type TechDef, type ResearchEffect } from '../data/techs';
import { CIVICS, type CivicDef } from '../data/civics';
import { GOVERNMENTS, POLICIES, type PolicyEffects } from '../data/policies';

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------

export interface Unlocks {
  improvements: Set<string>;
  districts: Set<string>;
  buildings: Set<string>;
  featureRemovals: Set<string>;
  governments: Set<string>;
  policies: Set<string>;
  hillFarms: boolean;
}

/** Content available with zero research. */
const BASELINE = {
  improvements: ['FARM'],
  buildings: ['MONUMENT'],
};

function* completedEffects(state: GameState): Generator<ResearchEffect> {
  for (const id of state.research.techs) {
    const t = TECHS[id];
    if (t) yield* t.effects;
  }
  for (const id of state.research.civics) {
    const c = CIVICS[id];
    if (c) yield* c.effects;
  }
}

export function computeUnlocks(state: GameState): Unlocks {
  const u: Unlocks = {
    improvements: new Set(BASELINE.improvements),
    districts: new Set(),
    buildings: new Set(BASELINE.buildings),
    featureRemovals: new Set(),
    governments: new Set(),
    policies: new Set(),
    hillFarms: false,
  };
  for (const fx of completedEffects(state)) {
    switch (fx.kind) {
      case 'unlockImprovement':
        u.improvements.add(fx.improvement);
        break;
      case 'unlockDistrict':
        u.districts.add(fx.district);
        break;
      case 'unlockBuilding':
        u.buildings.add(fx.building);
        break;
      case 'unlockFeatureRemoval':
        u.featureRemovals.add(fx.feature);
        break;
      case 'unlockGovernment':
        u.governments.add(fx.government);
        break;
      case 'unlockPolicy':
        u.policies.add(fx.policy);
        break;
      case 'hillFarms':
        u.hillFarms = true;
        break;
      default:
        break;
    }
  }
  return u;
}

export function isTechComplete(state: GameState, id: string): boolean {
  return state.research.techs.includes(id);
}

export function isCivicComplete(state: GameState, id: string): boolean {
  return state.research.civics.includes(id);
}

export function availableTechs(state: GameState): TechDef[] {
  return Object.values(TECHS).filter(
    (t) => !isTechComplete(state, t.id) && t.prereqs.every((p) => isTechComplete(state, p)),
  );
}

export function availableCivics(state: GameState): CivicDef[] {
  return Object.values(CIVICS).filter(
    (c) => !isCivicComplete(state, c.id) && c.prereqs.every((p) => isCivicComplete(state, p)),
  );
}

// ---------------------------------------------------------------------------
// Modifiers
// ---------------------------------------------------------------------------

export interface Modifiers {
  /** Extra yields per improvement instance (tech boosts). */
  improvementYields: Partial<Record<ImprovementId, Partial<Yields>>>;
  /** Farms: +1 food per tier when adjacent to 2+ farms (Feudalism, Replaceable Parts). */
  farmAdjTier: number;
  hillFarms: boolean;
  adjacencyMult: Partial<Record<DistrictId, number>>;
  buildingYieldMult: Partial<Record<DistrictId, number>>;
  cityYields: Partial<Yields>;
  capitalYields: Partial<Yields>;
  amenitiesAll: number;
  housingAll: number;
  housingIfDistricts: { min: number; housing: number }[];
  amenitiesIfSpecialty: { min: number; amenities: number }[];
  newDeal: { min: number; housing: number; amenities: number }[];
  tilePurchaseMult: number;
  encampmentProdMult: number;
  yieldMult: Partial<Yields>;
}

export function defaultModifiers(): Modifiers {
  return {
    improvementYields: {},
    farmAdjTier: 0,
    hillFarms: false,
    adjacencyMult: {},
    buildingYieldMult: {},
    cityYields: {},
    capitalYields: {},
    amenitiesAll: 0,
    housingAll: 0,
    housingIfDistricts: [],
    amenitiesIfSpecialty: [],
    newDeal: [],
    tilePurchaseMult: 1,
    encampmentProdMult: 1,
    yieldMult: {},
  };
}

function addPartial(target: Partial<Yields>, src?: Partial<Yields>): void {
  if (!src) return;
  for (const [k, v] of Object.entries(src)) {
    target[k as keyof Yields] = (target[k as keyof Yields] ?? 0) + (v ?? 0);
  }
}

function applyPolicyEffects(mods: Modifiers, fx: PolicyEffects): void {
  addPartial(mods.cityYields, fx.cityYields);
  addPartial(mods.capitalYields, fx.capitalYields);
  for (const [d, m] of Object.entries(fx.adjacencyMult ?? {})) {
    const key = d as DistrictId;
    mods.adjacencyMult[key] = (mods.adjacencyMult[key] ?? 1) * (m ?? 1);
  }
  for (const [d, m] of Object.entries(fx.buildingYieldMult ?? {})) {
    const key = d as DistrictId;
    mods.buildingYieldMult[key] = (mods.buildingYieldMult[key] ?? 1) * (m ?? 1);
  }
  if (fx.housingIfDistricts) mods.housingIfDistricts.push(fx.housingIfDistricts);
  if (fx.amenitiesIfSpecialty) mods.amenitiesIfSpecialty.push(fx.amenitiesIfSpecialty);
  if (fx.newDeal) mods.newDeal.push(fx.newDeal);
  if (fx.tilePurchaseMult) mods.tilePurchaseMult *= fx.tilePurchaseMult;
  if (fx.encampmentProdMult) mods.encampmentProdMult *= fx.encampmentProdMult;
  for (const [k, m] of Object.entries(fx.yieldMult ?? {})) {
    const key = k as keyof Yields;
    mods.yieldMult[key] = (mods.yieldMult[key] ?? 1) * (m ?? 1);
  }
  if (fx.amenitiesAll) mods.amenitiesAll += fx.amenitiesAll;
  if (fx.housingAll) mods.housingAll += fx.housingAll;
}

export function getModifiers(state: GameState): Modifiers {
  const mods = defaultModifiers();

  // Tech/civic boosts
  for (const fx of completedEffects(state)) {
    if (fx.kind === 'improvementYields') {
      const cur = (mods.improvementYields[fx.improvement] ??= {});
      addPartial(cur, fx.yields);
    } else if (fx.kind === 'farmAdjacency') {
      mods.farmAdjTier += 1;
    } else if (fx.kind === 'hillFarms') {
      mods.hillFarms = true;
    }
  }

  // Government + slotted policies
  const gov = state.government.current ? GOVERNMENTS[state.government.current] : null;
  if (gov) {
    applyPolicyEffects(mods, gov.effects);
    for (const cardId of state.government.policies) {
      if (!cardId) continue;
      const card = POLICIES[cardId];
      if (card) applyPolicyEffects(mods, card.effects);
    }
  }
  return mods;
}

/** Convenience bundle used by yield computations. */
export interface YieldCtx {
  map: GameState['map'];
  mods: Modifiers;
}

export function makeYieldCtx(state: GameState): YieldCtx {
  return { map: state.map, mods: getModifiers(state) };
}
