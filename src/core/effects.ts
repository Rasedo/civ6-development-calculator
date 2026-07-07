/**
 * Research/government effects engine: computes what is unlocked and a single
 * `Modifiers` object that the yield/housing/amenity code consumes.
 */

import type { DistrictId, GameState, GreatPersonClass, ImprovementId, ResearchState, ResourceCategory, Yields } from './types';
import { TECHS, type TechDef, type ResearchEffect } from '../data/techs';
import { CIVICS, type CivicDef } from '../data/civics';
import { GOVERNMENTS, POLICIES, type PolicyEffects } from '../data/policies';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, type BeliefEffects } from '../data/religion';
import { csEnvoyBonuses } from './cityStates';

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

function* completedEffectsIn(research: ResearchState): Generator<ResearchEffect> {
  for (const id of research.techs) {
    const t = TECHS[id];
    if (t) yield* t.effects;
  }
  for (const id of research.civics) {
    const c = CIVICS[id];
    if (c) yield* c.effects;
  }
}

/** Unlocks from an arbitrary research state (C1-B4 prep: rival districts/
 * buildings gate on the RIVAL's own trees). Player wrapper below. */
export function computeUnlocksIn(research: ResearchState): Unlocks {
  const u: Unlocks = {
    improvements: new Set(BASELINE.improvements),
    districts: new Set(),
    buildings: new Set(BASELINE.buildings),
    featureRemovals: new Set(),
    governments: new Set(),
    policies: new Set(),
    hillFarms: false,
  };
  for (const fx of completedEffectsIn(research)) {
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

export function computeUnlocks(state: GameState): Unlocks {
  return computeUnlocksIn(state.research);
}

export function isTechComplete(state: GameState, id: string): boolean {
  return state.research.techs.includes(id);
}

export function isCivicComplete(state: GameState, id: string): boolean {
  return state.research.civics.includes(id);
}

/**
 * Techs researchable from an arbitrary research state (C1-B3: rivals run the
 * SAME trees through their own ResearchState; the player wrappers below keep
 * their exact signatures and behavior).
 */
export function availableTechsIn(research: ResearchState): TechDef[] {
  return Object.values(TECHS).filter(
    (t) => !research.techs.includes(t.id) && t.prereqs.every((p) => research.techs.includes(p)),
  );
}

export function availableCivicsIn(research: ResearchState): CivicDef[] {
  return Object.values(CIVICS).filter(
    (c) => !research.civics.includes(c.id) && c.prereqs.every((p) => research.civics.includes(p)),
  );
}

export function availableTechs(state: GameState): TechDef[] {
  return availableTechsIn(state.research);
}

export function availableCivics(state: GameState): CivicDef[] {
  return availableCivicsIn(state.research);
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
  // --- religion-driven -------------------------------------------------------
  featureYields: Partial<Record<string, Partial<Yields>>>;
  improvementOnResource: { category: ResourceCategory; yields: Partial<Yields> }[];
  borderCostMult: number;
  growthMult: number;
  gppFlat: Partial<Record<GreatPersonClass, number>>;
  workEthic: boolean;
  buildingYieldAdd: Partial<Record<string, Partial<Yields>>>;
  buildingHousingAdd: Partial<Record<string, number>>;
  riverCity: { amenities: number; housing: number } | null;
  faithPerWonder: number;
  /** Flat yields per completed district instance (city-state envoys). */
  districtYieldAdd: Partial<Record<DistrictId, Partial<Yields>>>;
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
    featureYields: {},
    improvementOnResource: [],
    borderCostMult: 1,
    growthMult: 1,
    gppFlat: {},
    workEthic: false,
    buildingYieldAdd: {},
    buildingHousingAdd: {},
    riverCity: null,
    faithPerWonder: 0,
    districtYieldAdd: {},
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

/**
 * The research-driven modifier head only (C1-B5b: rival cities apply THEIR
 * OWN tech boosts — mine yields, farm adjacency, hill farms; government/
 * religion/CS blocks are player machinery and stay out). The player's
 * getModifiers builds on top of this.
 */
export function modifiersFromResearch(research: ResearchState): Modifiers {
  const mods = defaultModifiers();
  for (const fx of completedEffectsIn(research)) {
    if (fx.kind === 'improvementYields') {
      const cur = (mods.improvementYields[fx.improvement] ??= {});
      addPartial(cur, fx.yields);
    } else if (fx.kind === 'farmAdjacency') {
      mods.farmAdjTier += 1;
    } else if (fx.kind === 'hillFarms') {
      mods.hillFarms = true;
    }
  }
  return mods;
}

export function getModifiers(state: GameState): Modifiers {
  const mods = modifiersFromResearch(state.research);

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

  // Religion: pantheon always; follower/founder beliefs once founded.
  applyBeliefEffects(state, mods, state.religion?.pantheon ? PANTHEONS[state.religion.pantheon] : undefined);
  if (state.religion?.founded) {
    applyBeliefEffects(state, mods, state.religion.follower ? FOLLOWER_BELIEFS[state.religion.follower] : undefined);
    applyBeliefEffects(state, mods, state.religion.founder ? FOUNDER_BELIEFS[state.religion.founder] : undefined);
  }

  // City-state envoy bonuses
  if (state.cityStates?.length) {
    const cs = csEnvoyBonuses(state);
    addPartial(mods.capitalYields, cs.capital);
    for (const [district, y] of Object.entries(cs.districtAdd)) {
      const cur = (mods.districtYieldAdd[district as DistrictId] ??= {});
      addPartial(cur, y);
    }
  }
  return mods;
}

function applyBeliefEffects(
  state: GameState,
  mods: Modifiers,
  belief?: { effects: BeliefEffects },
): void {
  if (!belief) return;
  const fx = belief.effects;
  for (const [imp, y] of Object.entries(fx.improvementYields ?? {})) {
    const cur = (mods.improvementYields[imp as ImprovementId] ??= {});
    addPartial(cur, y);
  }
  for (const [feat, y] of Object.entries(fx.featureYields ?? {})) {
    const cur = (mods.featureYields[feat] ??= {});
    addPartial(cur, y);
  }
  if (fx.improvementOnResource) mods.improvementOnResource.push(fx.improvementOnResource);
  if (fx.borderCostMult) mods.borderCostMult *= fx.borderCostMult;
  if (fx.growthMult) mods.growthMult *= fx.growthMult;
  for (const [cls, n] of Object.entries(fx.gppFlat ?? {})) {
    const key = cls as GreatPersonClass;
    mods.gppFlat[key] = (mods.gppFlat[key] ?? 0) + (n ?? 0);
  }
  if (fx.workEthic) mods.workEthic = true;
  for (const [b, y] of Object.entries(fx.buildingYields ?? {})) {
    const cur = (mods.buildingYieldAdd[b] ??= {});
    addPartial(cur, y);
  }
  for (const [b, n] of Object.entries(fx.buildingHousing ?? {})) {
    mods.buildingHousingAdd[b] = (mods.buildingHousingAdd[b] ?? 0) + (n ?? 0);
  }
  if (fx.amenitiesIfSpecialty) mods.amenitiesIfSpecialty.push(fx.amenitiesIfSpecialty);
  if (fx.riverCity) mods.riverCity = fx.riverCity;
  if (fx.faithPerWonder) mods.faithPerWonder += fx.faithPerWonder;

  // Founder incomes land in the capital (followers = your total population).
  if (fx.perFollowers) {
    const followers = state.cities.reduce((s, c) => s + c.population, 0);
    const times = Math.floor(followers / fx.perFollowers.per);
    if (times > 0) {
      for (const [k, v] of Object.entries(fx.perFollowers.yields)) {
        const key = k as keyof Yields;
        mods.capitalYields[key] = (mods.capitalYields[key] ?? 0) + (v ?? 0) * times;
      }
    }
  }
  if (fx.perCity) {
    const n = state.cities.length;
    for (const [k, v] of Object.entries(fx.perCity)) {
      const key = k as keyof Yields;
      mods.capitalYields[key] = (mods.capitalYields[key] ?? 0) + (v ?? 0) * n;
    }
  }
}

/** Convenience bundle used by yield computations. */
export interface YieldCtx {
  map: GameState['map'];
  mods: Modifiers;
}

export function makeYieldCtx(state: GameState): YieldCtx {
  return { map: state.map, mods: getModifiers(state) };
}

/** Current government's policy slots, including wonder-granted extras. */
export function governmentSlots(state: GameState): import('../data/policies').SlotKind[] {
  const gov = state.government.current ? GOVERNMENTS[state.government.current] : null;
  if (!gov) return [];
  const slots = [...gov.slots];
  // Forbidden City grants an extra wildcard slot.
  const hasFC = state.cities.some((c) =>
    c.wonders?.some(
      (w) => w.id === 'FORBIDDEN_CITY' && state.map.tiles[w.tileIndex].builtWonderComplete,
    ),
  );
  if (hasFC) slots.push('wildcard');
  return slots;
}
