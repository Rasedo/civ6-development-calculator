/**
 * Research/government effects engine: computes what is unlocked and a single
 * `Modifiers` object that the yield/housing/amenity code consumes.
 */

import type { DistrictId, GameState, GreatPersonClass, ImprovementId, ResearchState, ResourceCategory, Seat, Yields } from './types';
import { TECHS, type TechDef, type ResearchEffect } from '../data/techs';
import { CIVICS, type CivicDef } from '../data/civics';
import { GOVERNMENTS, POLICIES, cardFitsSlot, GOVERNMENTS_ADOPTION_LIVE, type PolicyEffects, type GovernmentDef } from '../data/policies';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, B18_FOLLOWER_COUPLING_LIVE, type BeliefEffects, type BeliefDef } from '../data/religion';
import { PLAYER_CIV, playerSeat, rivalsOf, seatOf, citiesOf, isPlayerSeat } from './seats';
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
  return computeUnlocksIn(playerSeat(state).research);
}

export function isTechComplete(state: GameState, id: string): boolean {
  return playerSeat(state).research.techs.includes(id);
}

export function isCivicComplete(state: GameState, id: string): boolean {
  return playerSeat(state).research.civics.includes(id);
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
  return availableTechsIn(playerSeat(state).research);
}

export function availableCivics(state: GameState): CivicDef[] {
  return availableCivicsIn(playerSeat(state).research);
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

// T1 PERF: self-validating value-key cache for the modifier head. The key
// projects every input the returned Modifiers depends on, so a call-site-free
// invalidation (combat captures/transfers, tech/civic completion, growth) is
// captured automatically:
//   - research.techs.length / research.civics.length: the research arrays are
//     APPEND-ONLY (only .push at game.ts / rivals.ts; no splice/pop/shift/
//     filter/reassign on any seat's research across the repo), so per-seat the
//     length is a monotonic version counter that uniquely identifies the
//     completed-effects set feeding both modifiersFromResearch and
//     computeAdoption (government + slotted policies).
//   - pantheon / founded / founder / enhancer: belief ids fully determine the
//     static belief-effect tables applied.
//   - Sum(pop) + cities.length: the ONLY fields the belief seat reads
//     (perFollowers = floor(Sum(pop)/per); perCity = cities.length).
// `state` is NOT an input: every seat now passes an explicit belief seat, so
// applyBeliefEffects never falls back to reading state.cities. WeakMap keys on
// the seat object, stable within a state and fresh across deserialize/clone.
//
// The PLAYER is deliberately excluded: its mods also depend on stored policy
// slots and the live city-state channel, neither of which is in this key.
const modCache = new WeakMap<Seat, { key: string; mods: Modifiers }>();

/**
 * ONE modifier head, for any seat. Callers no longer choose between a player
 * function and a rival function — that choice WAS the asymmetry.
 *
 * The research and belief work is genuinely shared. Three things still branch
 * on whether this is the player, each an explicitly-named divergence rather
 * than an accident, each pointing at its Round 7 slice:
 *
 *  1. GOVERNMENT SOURCE. The player reads its STORED government + policy
 *     slots (an RL agent or the UI picks the cards). A rival DERIVES its
 *     adoption from research via computeAdoption. Today those agree because
 *     the scripted player adopts with the same function, but they are not the
 *     same mechanism and merging them would silently overwrite a real
 *     player's card choices. Round 7 gives rivals stored slots instead.
 *  2. THE CITY-STATE CHANNEL. Envoy bonuses and the suzerain capital perk are
 *     applied here for the player and re-added by hand inside rivalCityYields
 *     for a rival. This is the plan's declared csChannel flag: one home is
 *     correct, this one, and Round 7 moves the rival's copy here.
 *  3. CACHING. The rival mods are memoised on a key of exactly the fields
 *     they depend on. The player's depend on stored policy slots and the
 *     live city-state channel, neither of which is in that key, so the
 *     player is deliberately NOT cached.
 *
 * The belief seat is NOT a divergence: applyBeliefEffects' no-seat fallback
 * computes the player's own Σpop and city count, which is exactly what an
 * explicit seat would pass, so both arms now pass one.
 */
export function getModifiers(state: GameState, seat: number = PLAYER_CIV): Modifiers {
  const s = seatOf(state, seat);
  if (!s) return defaultModifiers(); // no such seat — unreachable from real callers
  const player = isPlayerSeat(seat);
  const cities = citiesOf(state, seat);
  let pop = 0;
  for (const c of cities) pop += c.population;

  // (3) Non-player seats are memoised; see the note above for why the player
  // is not. WeakMap keys on the seat object, stable within a state and fresh
  // across deserialize/clone.
  const rel = s.religion;
  const key = `${s.research.techs.length}:${s.research.civics.length}:${rel.pantheon ?? ''}:${rel.founded ? 1 : 0}:${rel.founder ?? ''}:${rel.enhancer ?? ''}:${pop}:${cities.length}`;
  if (!player) {
    const cached = modCache.get(s);
    if (cached && cached.key === key) return cached.mods;
  }

  const mods = modifiersFromResearch(s.research);

  // (1) Government + slotted policies.
  if (player) {
    const govId = s.government.current;
    const gov = govId ? GOVERNMENTS[govId] : null;
    if (gov) {
      applyPolicyEffects(mods, gov.effects);
      for (const cardId of s.government.policies) {
        if (!cardId) continue;
        const card = POLICIES[cardId];
        if (card) applyPolicyEffects(mods, card.effects);
      }
    }
  } else if (GOVERNMENTS_ADOPTION_LIVE) {
    applyGovernment(mods, s.research);
  }

  // Religion: pantheon always; founder belief once founded. B-18: the FOLLOWER
  // belief is NO LONGER applied per-civ here — it applies per-CITY keyed on that
  // city's followedReligion (withFollowerBelief in computeCityStats /
  // rivalCityYields). Pantheons + founder + enhancer stay per-civ.
  const beliefSeat = { followers: pop, cities: cities.length };
  applyBeliefEffects(state, mods, rel?.pantheon ? PANTHEONS[rel.pantheon] : undefined, beliefSeat);
  if (rel?.founded) {
    applyBeliefEffects(state, mods, rel.founder ? FOUNDER_BELIEFS[rel.founder] : undefined, beliefSeat);
    // B-18: Enhancer belief (inert effects this round; wired for symmetry).
    applyBeliefEffects(state, mods, rel.enhancer ? ENHANCER_BELIEFS[rel.enhancer] : undefined, beliefSeat);
  }

  // (2) City-state envoy bonuses.
  if (player && state.cityStates?.length) {
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
  if (!player) modCache.set(s, { key, mods });
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
 * as getModifiers does for the player's playerSeat(state).government (A-7r). */
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
    const rel = playerSeat(state).religion;
    return rel?.founded && rel.follower ? FOLLOWER_BELIEFS[rel.follower] : undefined;
  }
  const rv = rivalsOf(state)[g - 1];
  if (!rv || !rv.religion.founded || !rv.religion.follower) return undefined;
  return FOLLOWER_BELIEFS[rv.religion.follower];
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
    // GEO-H (#55): DEEP-clone buildingYieldAdd's nested per-building records.
    // A shallow `{ ...base.buildingYieldAdd }` copies the top-level keys but
    // SHARES their Partial<Yields> objects; applyBeliefEffects reuses an
    // existing building's record (`mods.buildingYieldAdd[b] ??= {}`) and
    // addPartial MUTATES it in place — so a follower belief that adds to a
    // building already present in `base` (e.g. Feed-the-World's SHRINE food
    // when a religious city-state's 3-envoy bonus already put SHRINE in base)
    // corrupted the per-turn FROZEN `mods`, leaking that city's follower
    // yield onto every later city in the endTurn loop (seed 9144 t182: a
    // Feed-the-World-following city polluted a non-following city's Shrine
    // food → foodBox drift the GPU, which computes each city independently,
    // never had).
    buildingYieldAdd: Object.fromEntries(
      Object.entries(base.buildingYieldAdd).map(([k, v]) => [k, { ...v }]),
    ),
    buildingHousingAdd: { ...base.buildingHousingAdd }, // scalar values, reassigned not mutated
    amenitiesIfSpecialty: [...base.amenitiesIfSpecialty], // array cloned; elements are pushed, not mutated
  };
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
  const govId = playerSeat(state).government.current;
  const gov = govId ? GOVERNMENTS[govId] : null;
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
