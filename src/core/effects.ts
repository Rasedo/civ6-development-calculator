/**
 * Research/government effects engine: computes what is unlocked and a single
 * `Modifiers` object that the yield/housing/amenity code consumes.
 */

import type { DistrictId, GameState, GreatPersonClass, ImprovementId, ResearchState, ResourceCategory, RivalCiv, Yields } from './types';
import { TECHS, type TechDef, type ResearchEffect } from '../data/techs';
import { CIVICS, type CivicDef } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot, GOVERNMENTS_ADOPTION_LIVE, type PolicyEffects, type GovernmentDef } from '../data/policies';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, B18_FOLLOWER_COUPLING_LIVE, type BeliefEffects, type BeliefDef } from '../data/religion';
import { PLAYER_CIV } from './civs';
import { csEnvoyBonuses, csSuzerainCapitalBonus } from './cityStates';

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

  // Religion: pantheon always; founder belief once founded. B-18: the FOLLOWER
  // belief is NO LONGER applied per-civ here — it applies per-CITY keyed on that
  // city's followedReligion (withFollowerBelief in computeCityStats /
  // rivalCityYields). Pantheons + founder + enhancer stay per-civ.
  applyBeliefEffects(state, mods, state.religion?.pantheon ? PANTHEONS[state.religion.pantheon] : undefined);
  if (state.religion?.founded) {
    applyBeliefEffects(state, mods, state.religion.founder ? FOUNDER_BELIEFS[state.religion.founder] : undefined);
    // B-18: Enhancer belief (inert effects this round; wired for symmetry).
    applyBeliefEffects(state, mods, state.religion.enhancer ? ENHANCER_BELIEFS[state.religion.enhancer] : undefined);
  }

  // City-state envoy bonuses
  if (state.cityStates?.length) {
    const cs = csEnvoyBonuses(state);
    addPartial(mods.capitalYields, cs.capital);
    // B-21: the 3/6 tiers land on BUILDINGS now (buildingYieldAdd, applied in
    // cityBuildingYields — inherits its pillaged-dark + regional-skip).
    for (const [building, y] of Object.entries(cs.buildingAdd)) {
      const cur = (mods.buildingYieldAdd[building] ??= {});
      addPartial(cur, y);
    }
    // B-21: the suzerain's per-CS unique perk — a flat capital yield.
    addPartial(mods.capitalYields, csSuzerainCapitalBonus(state));
  }
  return mods;
}

function applyBeliefEffects(
  state: GameState,
  mods: Modifiers,
  belief?: { effects: BeliefEffects },
  seat?: { followers: number; cities: number },  // A-7: rival seats pass their own counts
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

  // Founder incomes land in the capital (followers = the seat's total
  // population — the player's by default, the rival's when a seat is given).
  if (fx.perFollowers) {
    const followers = seat ? seat.followers : state.cities.reduce((s, c) => s + c.population, 0);
    const times = Math.floor(followers / fx.perFollowers.per);
    if (times > 0) {
      for (const [k, v] of Object.entries(fx.perFollowers.yields)) {
        const key = k as keyof Yields;
        mods.capitalYields[key] = (mods.capitalYields[key] ?? 0) + (v ?? 0) * times;
      }
    }
  }
  if (fx.perCity) {
    const n = seat ? seat.cities : state.cities.length;
    for (const [k, v] of Object.entries(fx.perCity)) {
      const key = k as keyof Yields;
      mods.capitalYields[key] = (mods.capitalYields[key] ?? 0) + (v ?? 0) * n;
    }
  }
}

/**
 * A-7r: the scripted, deterministic government + policy adoption for a seat
 * (player or rival) — a pure function of its research state. Rule:
 *   - Adopt the NEWEST unlocked government: highest tier, ties broken by
 *     GOVERNMENTS table (insertion) order.
 *   - Fill the government's BASE slots greedily in POLICIES table order among
 *     unlocked cards matching the slot kind (a wildcard slot takes the first
 *     unfilled-eligible card). Zero RNG.
 * The government's BASE slots are used (no wonder-granted Forbidden City
 * wildcard) so the scripted player and rival seats adopt symmetrically — the
 * GPU mirror computes the same set from the seat's tracked civics.
 */
export function computeAdoption(research: ResearchState): {
  government: string | null;
  policies: (string | null)[];
} {
  const u = computeUnlocksIn(research);
  let chosen: GovernmentDef | null = null;
  for (const g of Object.values(GOVERNMENTS)) {
    if (!u.governments.has(g.id)) continue;
    // Strict `>` keeps the first table-order government among equal tiers.
    if (!chosen || g.tier > chosen.tier) chosen = g;
  }
  if (!chosen) return { government: null, policies: [] };
  const slots = [...chosen.slots];
  const policies: (string | null)[] = slots.map(() => null);
  for (const card of Object.values(POLICIES)) {
    if (!u.policies.has(card.id)) continue;
    const slot = slots.findIndex((kind, i) => policies[i] === null && cardFitsSlot(card, kind));
    if (slot >= 0) policies[slot] = card.id;
  }
  return { government: chosen.id, policies };
}

/** Layer a seat's adopted government + slotted policies onto `mods`, exactly
 * as getModifiers does for the player's state.government (A-7r). */
function applyGovernment(mods: Modifiers, research: ResearchState): void {
  const { government, policies } = computeAdoption(research);
  const gov = government ? GOVERNMENTS[government] : null;
  if (!gov) return;
  applyPolicyEffects(mods, gov.effects);
  for (const cardId of policies) {
    if (!cardId) continue;
    const card = POLICIES[cardId];
    if (card) applyPolicyEffects(mods, card.effects);
  }
}

/** AUDIT A-7 / A-7r: the rival's modifier head — its research boosts, its OWN
 * claimed pantheon and (once its religion is founded) its two beliefs, PLUS
 * its scripted government + slotted policies (A-7r; the getModifiers
 * government block, computed from the rival's research). CS blocks stay
 * player machinery. The follower counts are the RIVAL's population/cities
 * (the seat), not the player's. */
// T1 PERF: self-validating value-key cache for getRivalModifiers. The key
// projects every input the returned Modifiers depends on, so a call-site-free
// invalidation (combat captures/transfers, tech/civic completion, growth) is
// captured automatically:
//   - research.techs.length / research.civics.length: the research arrays are
//     APPEND-ONLY (only .push at game.ts / rivals.ts:1872/1901; no
//     splice/pop/shift/filter/reassign on any RivalCiv research across the
//     repo), so per-rival the length is a monotonic version counter that
//     uniquely identifies the completed-effects set feeding both
//     modifiersFromResearch and computeAdoption (government + slotted policies).
//   - pantheon / religionFounded / founderBelief / enhancerBelief: belief ids
//     fully determine the static belief-effect tables applied.
//   - Σpop + cities.length: the ONLY rival fields the belief seat reads
//     (perFollowers = floor(Σpop/per); perCity = cities.length).
// `state` is NOT an input: getRivalModifiers always passes an explicit seat, so
// applyBeliefEffects never falls back to reading state.cities. The government
// path (computeAdoption) reads only research. WeakMap keys on the rival object
// identity, which is stable within a state and fresh across deserialize/clone.
const rivalModCache = new WeakMap<RivalCiv, { key: string; mods: Modifiers }>();

export function getRivalModifiers(state: GameState, rival: RivalCiv): Modifiers {
  let pop = 0;
  for (const c of rival.cities) pop += c.population;
  const key = `${rival.research.techs.length}:${rival.research.civics.length}:${rival.pantheon ?? ''}:${rival.religionFounded ? 1 : 0}:${rival.founderBelief ?? ''}:${rival.enhancerBelief ?? ''}:${pop}:${rival.cities.length}`;
  const cached = rivalModCache.get(rival);
  if (cached && cached.key === key) return cached.mods;

  const mods = modifiersFromResearch(rival.research);
  const seat = {
    followers: pop,
    cities: rival.cities.length,
  };
  applyBeliefEffects(state, mods, rival.pantheon ? PANTHEONS[rival.pantheon] : undefined, seat);
  if (rival.religionFounded) {
    // B-18: the FOLLOWER belief moved to the per-CITY followed-religion lookup
    // (withFollowerBelief in rivalCityYields/rivalHousing/rivalAmenityTiers) —
    // it is NO LONGER applied per-civ here. Founder + enhancer stay per-civ.
    applyBeliefEffects(state, mods, rival.founderBelief ? FOUNDER_BELIEFS[rival.founderBelief] : undefined, seat);
    // B-18: symmetric with the player (state.religion.enhancer above). Every
    // enhancer effect is currently inert ({}), so this is byte-identical — the
    // coupling surface is here for when a non-inert enhancer lands.
    applyBeliefEffects(state, mods, rival.enhancerBelief ? ENHANCER_BELIEFS[rival.enhancerBelief] : undefined, seat);
  }
  if (GOVERNMENTS_ADOPTION_LIVE) applyGovernment(mods, rival.research);
  rivalModCache.set(rival, { key, mods });
  return mods;
}

// ---------------------------------------------------------------------------
// B-18: per-city FOLLOWER-belief coupling
// ---------------------------------------------------------------------------

/**
 * B-18: the FOLLOWER belief of religion `g` — the unified civ id (0 = the
 * player's religion, i+1 = rival i's). Returns undefined for an unfounded /
 * absent religion (g < 0, or the founding civ has not founded / claimed no
 * follower). Follower beliefs carry ONLY the per-city channels workEthic,
 * buildingYields, buildingHousing, amenitiesIfSpecialty and faithPerWonder
 * (verified over FOLLOWER_BELIEFS), so they can be layered onto a base
 * Modifiers per city without disturbing pantheon/founder/government channels.
 */
export function followerBeliefForReligion(state: GameState, g: number): BeliefDef | undefined {
  if (g < 0) return undefined;
  if (g === PLAYER_CIV) {
    return state.religion?.founded && state.religion.follower
      ? FOLLOWER_BELIEFS[state.religion.follower]
      : undefined;
  }
  const rv = state.rivals[g - 1];
  if (!rv || !rv.religionFounded || !rv.followerBelief) return undefined;
  return FOLLOWER_BELIEFS[rv.followerBelief];
}

/**
 * B-18: layer a city's followed religion's FOLLOWER belief onto a base
 * (per-civ) Modifiers, returning a per-city Modifiers. `followed` is the
 * religion id the city follows (null/-1 = none → base returned unchanged).
 * Only the follower-belief channels are cloned+mutated (buildingYieldAdd,
 * buildingHousingAdd, amenitiesIfSpecialty, workEthic, faithPerWonder); every
 * other channel is shared with `base` by reference, so the numeric result is
 * bit-identical to having applied that belief through the per-civ path. When
 * the coupling switch is INERT the caller passes the OWNER civ's religion id,
 * which reproduces the pre-coupling per-civ application exactly.
 */
export function withFollowerBelief(
  state: GameState,
  base: Modifiers,
  followed: number | null | undefined,
): Modifiers {
  const belief = followed == null ? undefined : followerBeliefForReligion(state, followed);
  if (!belief) return base;
  const m: Modifiers = {
    ...base,
    buildingYieldAdd: { ...base.buildingYieldAdd },
    buildingHousingAdd: { ...base.buildingHousingAdd },
    amenitiesIfSpecialty: [...base.amenitiesIfSpecialty],
  };
  // Follower beliefs touch only the channels cloned above (+ workEthic/
  // faithPerWonder scalars, copied by the spread) — applyBeliefEffects' other
  // branches are no-ops for a follower belief, so `base` is never mutated.
  applyBeliefEffects(state, m, belief);
  return m;
}

/** B-18: the religion id a city draws its FOLLOWER belief from, honoring the
 * coupling switch: LIVE → the city's followedReligion; INERT → the owner civ's
 * religion id (0 = player, rivalIndex+1 = a rival), reproducing the old
 * per-civ application. */
export function followerReligionForCity(
  followedReligion: number | null | undefined,
  ownerReligionId: number,
): number {
  if (B18_FOLLOWER_COUPLING_LIVE) return followedReligion ?? -1;
  return ownerReligionId;
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
