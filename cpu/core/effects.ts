/**
 * Research/government effects engine: computes what is unlocked and a single
 * `Modifiers` object that the yield/housing/amenity code consumes.
 */

import type { DistrictId, GameState, GreatPersonClass, ImprovementId, ResearchState, ResourceCategory, Yields } from './types';
import { TECHS, type TechDef, type ResearchEffect } from '../data/techs';
import { CIVICS, type CivicDef } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot, GOVERNMENTS_ADOPTION_LIVE, type PolicyEffects, type GovernmentDef } from '../data/policies';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, B18_FOLLOWER_COUPLING_LIVE, type BeliefEffects, type BeliefDef } from '../data/religion';
import { seatOf, citiesOf } from './seats';
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

/** Unlocks from an arbitrary research state (seat districts/
 * buildings gate on the SEAT's own trees). Seat-0 wrapper below. */
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

export function computeUnlocks(state: GameState, seat: number): Unlocks {
  const s = seatOf(state, seat);
  return computeUnlocksIn(s ? s.research : { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [] });
}

export function isTechComplete(state: GameState, id: string, seat: number): boolean {
  return seatOf(state, seat)!.research.techs.includes(id);
}

export function isCivicComplete(state: GameState, id: string, seat: number): boolean {
  return seatOf(state, seat)!.research.civics.includes(id);
}

/**
 * Techs researchable from an arbitrary research state (the other seats run the
 * SAME trees through their own ResearchState; the seat-0 wrappers below keep
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

export function availableTechs(state: GameState, seat: number): TechDef[] {
  return availableTechsIn(seatOf(state, seat)!.research);
}

export function availableCivics(state: GameState, seat: number): CivicDef[] {
  return availableCivicsIn(seatOf(state, seat)!.research);
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
 * The research-driven modifier head only (foreign cities apply THEIR
 * OWN tech boosts — mine yields, farm adjacency, hill farms; government/
 * religion/CS blocks are seat-0 machinery and stay out). Seat 0's
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

// T1 PERF: self-validating value-key cache for the modifier head. The key
// projects every input the returned Modifiers depends on, so a call-site-free
// invalidation (combat captures/transfers, tech/civic completion, growth) is
// captured automatically:
//   - research.techs.length / research.civics.length: the research arrays are
//     APPEND-ONLY (only .push at game.ts / phase.ts; no splice/pop/shift/
//     filter/reassign on any seat's research across the repo), so per-seat the
//     length is a monotonic version counter that uniquely identifies the
//     completed-effects set feeding both modifiersFromResearch and
//     computeAdoption (government + slotted policies).
//   - pantheon / founded / founder / enhancer: belief ids fully determine the
//     static belief-effect tables applied.
//   - Sum(pop) + cities.length: the ONLY fields the belief seat reads
//     (perFollowers = floor(Sum(pop)/per); perCity = cities.length).
// `state` is NOT an input: every seat now passes an explicit belief seat, so
// applyBeliefEffects never falls back to reading seatOf(state, seat)!.cities. WeakMap keys on
// the seat object, stable within a state and fresh across deserialize/clone.
//
// SEAT 0 is deliberately excluded: its mods also depend on stored policy
// slots and the live city-state channel, neither of which is in this key.

/**
 * ONE modifier head, for any seat.
 *
 * Nothing here branches on WHICH seat is asking. Research, government,
 * beliefs and the city-state channel are each read from the seat's own state,
 * so a seat with none of a thing contributes nothing from it.
 *
 * The government is DERIVED from research rather than read from the stored
 * slots: the two are the same value (endTurn recomputes the store with the
 * same `computeAdoption`), and one derivation cannot drift from itself.
 *
 * Not memoised. A cache here needs a key covering research, beliefs, the
 * stored slots, every city-state envoy count and the buildings the envoy
 * tiers land on; a key that misses one serves a stale modifier set, which
 * surfaces as a yield divergence far from its cause.
 */
export function getModifiers(state: GameState, seat: number): Modifiers {
  const s = seatOf(state, seat);
  if (!s) return defaultModifiers(); // no such seat — unreachable from real callers
  const cities = citiesOf(state, seat);
  let pop = 0;
  for (const c of cities) pop += c.population;
  const rel = s.religion;

  const mods = modifiersFromResearch(s.research);

  // Government + slotted policies, derived from this seat's own research.
  if (GOVERNMENTS_ADOPTION_LIVE) applyGovernment(mods, s.research);

  // Religion: pantheon always; founder belief once founded. The FOLLOWER
  // belief is per-CITY, keyed on that city's followedReligion
  // (withFollowerBelief in computeCityStats). Pantheon, founder and enhancer
  // are per-civ and belong here.
  const beliefSeat = { followers: pop, cities: cities.length };
  applyBeliefEffects(mods, rel?.pantheon ? PANTHEONS[rel.pantheon] : undefined, beliefSeat);
  if (rel?.founded) {
    applyBeliefEffects(mods, rel.founder ? FOUNDER_BELIEFS[rel.founder] : undefined, beliefSeat);
    // Enhancer belief (inert effects this round; wired for symmetry).
    applyBeliefEffects(mods, rel.enhancer ? ENHANCER_BELIEFS[rel.enhancer] : undefined, beliefSeat);
  }

  // The city-state channel: envoy tier bonuses and the suzerain capital perk,
  // for whichever seat is asking. A seat holding no envoys reads zero.
  if (state.cityStates?.length) {
    const cs = csEnvoyBonuses(state, seat);
    addPartial(mods.capitalYields, cs.capital);
    // The 3/6 tiers land on BUILDINGS (buildingYieldAdd, applied in
    // cityBuildingYields — inheriting its pillaged-dark + regional-skip).
    for (const [building, y] of Object.entries(cs.buildingAdd)) {
      const cur = (mods.buildingYieldAdd[building] ??= {});
      addPartial(cur, y);
    }
    addPartial(mods.capitalYields, csSuzerainCapitalBonus(state, seat));
  }
  return mods;
}

function applyBeliefEffects(
  mods: Modifiers,
  belief?: { effects: BeliefEffects },
  seat?: { followers: number; cities: number },  // A-7: actor seats pass their own counts
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

  // Founder incomes land in the capital; followers = the seat's own population.
  if (fx.perFollowers) {
    const followers = seat ? seat.followers : 0;
    const times = Math.floor(followers / fx.perFollowers.per);
    if (times > 0) {
      for (const [k, v] of Object.entries(fx.perFollowers.yields)) {
        const key = k as keyof Yields;
        mods.capitalYields[key] = (mods.capitalYields[key] ?? 0) + (v ?? 0) * times;
      }
    }
  }
  if (fx.perCity) {
    const n = seat ? seat.cities : 0;
    for (const [k, v] of Object.entries(fx.perCity)) {
      const key = k as keyof Yields;
      mods.capitalYields[key] = (mods.capitalYields[key] ?? 0) + (v ?? 0) * n;
    }
  }
}

/**
 * The scripted, deterministic government + policy adoption for a seat
 * (either seat) — a pure function of its research state. Rule:
 *   - Adopt the NEWEST unlocked government: highest tier, ties broken by
 *     GOVERNMENTS table (insertion) order.
 *   - Fill the government's BASE slots greedily in POLICIES table order among
 *     unlocked cards matching the slot kind (a wildcard slot takes the first
 *     unfilled-eligible card). Zero RNG.
 * The government's BASE slots are used (no wonder-granted Forbidden City
 * wildcard) so the scripted both seats seats adopt symmetrically — the
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
 * as getModifiers does for seat 0's seatOf(state, seat)!.government. */
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

// ---------------------------------------------------------------------------
// Per-city FOLLOWER-belief coupling
// ---------------------------------------------------------------------------

/**
 * The FOLLOWER belief of religion `g` — the unified civ id (0 = seat
 * 0's religion, i+1 = seat i's). Returns undefined for an unfounded /
 * absent religion (g < 0, or the founding civ has not founded / claimed no
 * follower). Follower beliefs carry ONLY the per-city channels workEthic,
 * buildingYields, buildingHousing, amenitiesIfSpecialty and faithPerWonder
 * (verified over FOLLOWER_BELIEFS), so they can be layered onto a base
 * Modifiers per city without disturbing pantheon/founder/government channels.
 */
/** A religion is keyed by the SEAT that founded it, so `g` is that seat. */
export function followerBeliefForReligion(state: GameState, g: number): BeliefDef | undefined {
  if (g < 0) return undefined;
  const rel = seatOf(state, g)?.religion;
  return rel?.founded && rel.follower ? FOLLOWER_BELIEFS[rel.follower] : undefined;
}

/**
 * Layer a city's followed religion's FOLLOWER belief onto a base
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
    // GEO-H: DEEP-clone buildingYieldAdd's nested per-building records.
    // A shallow `{ ...base.buildingYieldAdd }` copies the top-level keys but
    // SHARES their Partial<Yields> objects; applyBeliefEffects reuses an
    // existing building's record (`mods.buildingYieldAdd[b] ??= {}`) and
    // addPartial MUTATES it in place — so a follower belief that adds to a
    // building already present in `base` (e.g. Feed-the-World's SHRINE food
    // when a religious city-state's 3-envoy bonus already put SHRINE in base)
    // corrupted the per-turn FROZEN `mods`, leaking that city's follower
    // yield onto every later city in the endTurn loop t182: a
    // Feed-the-World-following city polluted a non-following city's Shrine
    // food → foodBox drift the GPU, which computes each city independently,
    // never had).
    buildingYieldAdd: Object.fromEntries(
      Object.entries(base.buildingYieldAdd).map(([k, v]) => [k, { ...v }]),
    ),
    buildingHousingAdd: { ...base.buildingHousingAdd }, // scalar values, reassigned not mutated
    amenitiesIfSpecialty: [...base.amenitiesIfSpecialty], // array cloned; elements are pushed, not mutated
  };
  applyBeliefEffects(m, belief);
  return m;
}

/** the religion id a city draws its FOLLOWER belief from, honoring the
 * coupling switch: LIVE → the city's followedReligion; INERT → the owner civ's
 * religion id, which is the seat id. */
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
  return { map: state.map, mods: getModifiers(state, 0) };
}

/** Current government's policy slots, including wonder-granted extras. */
export function governmentSlots(state: GameState, seat: number): import('../data/policies').SlotKind[] {
  const govId = seatOf(state, seat)!.government.current;
  const gov = govId ? GOVERNMENTS[govId] : null;
  if (!gov) return [];
  const slots = [...gov.slots];
  // Forbidden City grants an extra wildcard slot.
  const hasFC = seatOf(state, seat)!.cities.some((c) =>
    c.wonders?.some(
      (w) => w.id === 'FORBIDDEN_CITY' && state.map.tiles[w.tileIndex].builtWonderComplete,
    ),
  );
  if (hasFC) slots.push('wildcard');
  return slots;
}
