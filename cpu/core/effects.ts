
import type { DistrictId, GameState, GreatPersonClass, ImprovementId, QueueItem, ResearchState, ResourceCategory, Yields } from './types';
import { TECHS, type TechDef, type ResearchEffect } from '../data/techs';
import { CIVICS, type CivicDef } from '../data/civics';
import { GOVERNMENTS, POLICIES, POLICY_LIST, GOVERNMENT_LIST, SLOT_KINDS, cardFitsSlot, GOVERNMENTS_ADOPTION_LIVE, type PolicyEffects, type GovernmentDef, type SlotKind, type BuildingYieldBoost, type ProdBoost } from '../data/policies';
import { congressPolicyBlocked, congressWildcardDelta } from './congress';
import { PANTHEONS, FOLLOWER_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS, B18_FOLLOWER_COUPLING_LIVE, type BeliefEffects, type BeliefDef } from '../data/religion';
import { seatOf, citiesOf, campTiles } from './seats';
import { BUILDINGS } from '../data/buildings';
import { neighbors } from '../../world/hex';
import { tileAppeal, appealBand } from './appeal';
import { addYields, emptyYields } from './types';
import { BUILT_WONDERS, WONDER_ERA_INDEX } from '../data/builtWonders';
import { UNITS, UNIT_ERA_INDEX, unitHasClass } from '../data/units';
import { cityStateEnvoyBonuses, cityStateSuzerainCapitalBonus, isSuzerain } from './cityStates';


export interface Unlocks {
  improvements: Set<string>;
  districts: Set<string>;
  buildings: Set<string>;
  featureRemovals: Set<string>;
  governments: Set<string>;
  policies: Set<string>;
  hillFarms: boolean;
}

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
  for (const id of [...u.policies]) {
    const ob = POLICIES[id]?.obsoleteCivic;
    if (ob && research.civics.includes(ob)) u.policies.delete(id);
  }
  return u;
}

export function computeUnlocks(state: GameState, seat: number): Unlocks {
  const s = seatOf(state, seat);
  return computeUnlocksIn(s ? s.research : { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} });
}

export function isTechComplete(state: GameState, id: string, seat: number): boolean {
  return seatOf(state, seat)!.research.techs.includes(id);
}

export function isCivicComplete(state: GameState, id: string, seat: number): boolean {
  return seatOf(state, seat)!.research.civics.includes(id);
}

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


export interface Modifiers {
  improvementYields: Partial<Record<ImprovementId, Partial<Yields>>>;
  farmAdjTier: number;
  hillFarms: boolean;
  adjacencyMult: Partial<Record<DistrictId, number>>;
  buildingYieldBoosts: BuildingYieldBoost[];
  cityYields: Partial<Yields>;
  capitalYields: Partial<Yields>;
  amenitiesAll: number;
  housingAll: number;
  housingIfDistricts: { min: number; housing: number }[];
  amenitiesIfSpecialty: { min: number; amenities: number }[];
  newDeal: { min: number; housing: number; amenities: number }[];
  tilePurchaseMult: number;
  encampHarborProdMult: number;
  yieldMult: Partial<Yields>;
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
  districtYieldAdd: Partial<Record<DistrictId, Partial<Yields>>>;
  prodBoosts: ProdBoost[];
  builderCharges: number;
  unitMaintenanceCut: number;
  combatVsBarbarians: number;
  cityDefense: number;
  cityRanged: number;
  reconXpMult: number;
  pillageMult: number;
  routePlunderMult: number;
  routeGold: number;
  influencePerTurn: number;
  firstEnvoyDouble: boolean;
  culturePerSuzerain: number;
}

export function defaultModifiers(): Modifiers {
  return {
    improvementYields: {},
    farmAdjTier: 0,
    hillFarms: false,
    adjacencyMult: {},
    buildingYieldBoosts: [],
    cityYields: {},
    capitalYields: {},
    amenitiesAll: 0,
    housingAll: 0,
    housingIfDistricts: [],
    amenitiesIfSpecialty: [],
    newDeal: [],
    tilePurchaseMult: 1,
    encampHarborProdMult: 1,
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
    prodBoosts: [],
    builderCharges: 0,
    unitMaintenanceCut: 0,
    combatVsBarbarians: 0,
    cityDefense: 0,
    cityRanged: 0,
    reconXpMult: 1,
    pillageMult: 1,
    routePlunderMult: 1,
    routeGold: 0,
    influencePerTurn: 0,
    firstEnvoyDouble: false,
    culturePerSuzerain: 0,
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
  if (fx.buildingYieldBoost) mods.buildingYieldBoosts.push(fx.buildingYieldBoost);
  if (fx.housingIfDistricts) mods.housingIfDistricts.push(fx.housingIfDistricts);
  if (fx.amenitiesIfSpecialty) mods.amenitiesIfSpecialty.push(fx.amenitiesIfSpecialty);
  if (fx.newDeal) mods.newDeal.push(fx.newDeal);
  if (fx.tilePurchaseMult) mods.tilePurchaseMult *= fx.tilePurchaseMult;
  if (fx.encampHarborProdMult) mods.encampHarborProdMult *= fx.encampHarborProdMult;
  for (const [k, m] of Object.entries(fx.yieldMult ?? {})) {
    const key = k as keyof Yields;
    mods.yieldMult[key] = (mods.yieldMult[key] ?? 1) * (m ?? 1);
  }
  if (fx.amenitiesAll) mods.amenitiesAll += fx.amenitiesAll;
  if (fx.housingAll) mods.housingAll += fx.housingAll;
  if (fx.prodBoost) mods.prodBoosts.push(fx.prodBoost);
  if (fx.builderCharges) mods.builderCharges += fx.builderCharges;
  if (fx.unitMaintenanceCut) mods.unitMaintenanceCut += fx.unitMaintenanceCut;
  if (fx.combatVsBarbarians) mods.combatVsBarbarians += fx.combatVsBarbarians;
  if (fx.cityDefense) mods.cityDefense += fx.cityDefense;
  if (fx.cityRanged) mods.cityRanged += fx.cityRanged;
  if (fx.reconXpMult) mods.reconXpMult *= fx.reconXpMult;
  if (fx.pillageMult) mods.pillageMult *= fx.pillageMult;
  if (fx.routePlunderMult) mods.routePlunderMult *= fx.routePlunderMult;
  if (fx.routeGold) mods.routeGold += fx.routeGold;
  if (fx.influencePerTurn) mods.influencePerTurn += fx.influencePerTurn;
  if (fx.firstEnvoyDouble) mods.firstEnvoyDouble = true;
  if (fx.culturePerSuzerain) mods.culturePerSuzerain += fx.culturePerSuzerain;
  for (const [cls, n] of Object.entries(fx.gppFlat ?? {})) {
    const key = cls as GreatPersonClass;
    mods.gppFlat[key] = (mods.gppFlat[key] ?? 0) + (n ?? 0);
  }
}

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


export function getModifiers(state: GameState, seat: number): Modifiers {
  const s = seatOf(state, seat);
  if (!s) return defaultModifiers(); // no such seat — unreachable from real callers
  const cities = citiesOf(state, seat);
  let pop = 0;
  for (const c of cities) pop += c.population;
  const rel = s.religion;

  const mods = modifiersFromResearch(s.research);

  if (GOVERNMENTS_ADOPTION_LIVE) {
    applyGovernment(mods, s.research, wonderExtraSlots(state, seat), congressPolicyBlocked(state));
  }

  const beliefSeat = { followers: pop, cities: cities.length };
  applyBeliefEffects(mods, rel?.pantheon ? PANTHEONS[rel.pantheon] : undefined, beliefSeat);
  if (rel?.founded) {
    applyBeliefEffects(mods, rel.founder ? FOUNDER_BELIEFS[rel.founder] : undefined, beliefSeat);
    applyBeliefEffects(mods, rel.enhancer ? ENHANCER_BELIEFS[rel.enhancer] : undefined, beliefSeat);
  }

  if (state.cityStates?.length) {
    const cityState = cityStateEnvoyBonuses(state, seat);
    addPartial(mods.capitalYields, cityState.capital);
    for (const [building, y] of Object.entries(cityState.buildingAdd)) {
      const cur = (mods.buildingYieldAdd[building] ??= {});
      addPartial(cur, y);
    }
    addPartial(mods.capitalYields, cityStateSuzerainCapitalBonus(state, seat));
    if (mods.culturePerSuzerain) {
      const n = state.cityStates.filter((cs) => isSuzerain(cs, seat)).length;
      if (n) mods.yieldMult.culture = (mods.yieldMult.culture ?? 1) * (1 + mods.culturePerSuzerain * n);
    }
  }
  return mods;
}

/**
 * The fraction this seat's slotted production cards add to a queue item.
 * CIV6 stacks production modifiers ADDITIVELY, so two cards that both name
 * the item pay their percentages summed rather than compounded.
 */
export function prodBoostPct(mods: Modifiers, q: QueueItem): number {
  let pct = 0;
  for (const b of mods.prodBoosts) {
    if (b.target === 'wonder') {
      if (q.kind !== 'wonder') continue;
      if (b.eraMax >= 0 && (WONDER_ERA_INDEX[q.wonder] ?? 0) > b.eraMax) continue;
    } else {
      const id = q.kind === 'unit' ? q.unit : q.kind === 'settler' ? 'SETTLER' : null;
      const def = id ? UNITS[id] : undefined;
      if (!id || !def) continue;
      if (b.eraMax >= 0 && (UNIT_ERA_INDEX[id] ?? 0) > b.eraMax) continue;
      if (!b.classes.some((c) => unitHasClass(def, c))) continue;
    }
    pct += b.pct;
  }
  return pct;
}

/** The gold per turn one unit of this type costs a seat carrying `mods` —
 *  Conscription and Levée en Masse take it down, never below free. */
export function unitUpkeep(mods: Modifiers, unitType: string): number {
  return Math.max(0, (UNITS[unitType]?.maintenance ?? 0) - mods.unitMaintenanceCut);
}

function applyBeliefEffects(
  mods: Modifiers,
  belief?: { effects: BeliefEffects },
  seat?: { followers: number; cities: number },  // actor seats pass their own counts
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
/** Count the wonder-granted policy slots, by kind — the LIVE adoption and
 * the boost census both take them. */
export function wonderExtraSlots(state: GameState, seat: number): Record<SlotKind, number> {
  const out: Record<SlotKind, number> = { military: 0, economic: 0, diplomatic: 0, wildcard: 0 };
  for (const c of citiesOf(state, seat)) {
    for (const w of c.wonders ?? []) {
      if (!state.map.tiles[w.tileIndex].builtWonderComplete) continue;
      const xs = BUILT_WONDERS[w.id]?.effects?.extraSlots;
      if (!xs) continue;
      for (const k of SLOT_KINDS) out[k] += xs[k] ?? 0;
    }
  }
  // WORLD IDEOLOGY moves a WILDCARD slot on one GOVERNMENT type. The
  // government itself is picked by tier out of what is unlocked and never
  // depends on the slot count, so it can be resolved first.
  const s = seatOf(state, seat);
  if (s) {
    const gov = computeAdoption(s.research).government;
    const i = gov ? GOVERNMENT_LIST.findIndex((g) => g.id === gov) : -1;
    if (i >= 0) out.wildcard = Math.max(0, out.wildcard + congressWildcardDelta(state, i));
  }
  return out;
}

/** `blocked` is the POLICY_LIST index POLICY TREATY outcome B forbids; -1
 *  when nothing stands. A blocked card is simply never slotted. */
export function computeAdoption(research: ResearchState, extra?: Record<SlotKind, number>,
                                blocked = -1): {
  government: string | null;
  policies: (string | null)[];
} {
  const u = computeUnlocksIn(research);
  let chosen: GovernmentDef | null = null;
  for (const g of Object.values(GOVERNMENTS)) {
    if (!u.governments.has(g.id)) continue;
    if (!chosen || g.tier > chosen.tier) chosen = g;
  }
  if (!chosen) return { government: null, policies: [] };
  // Wonder-granted slots append AFTER the base list so the greedy fill's
  // order stays the government's own; wildcards last, like every base list.
  const slots = [...chosen.slots];
  for (const k of SLOT_KINDS) for (let i = 0; i < (extra?.[k] ?? 0); i++) slots.push(k);
  const policies: (string | null)[] = slots.map(() => null);
  const banned = blocked >= 0 ? POLICY_LIST[blocked]?.id : undefined;
  for (const card of Object.values(POLICIES)) {
    if (!u.policies.has(card.id) || card.id === banned) continue;
    const slot = slots.findIndex((kind, i) => policies[i] === null && cardFitsSlot(card, kind));
    if (slot >= 0) policies[slot] = card.id;
  }
  return { government: chosen.id, policies };
}

function applyGovernment(mods: Modifiers, research: ResearchState, extra?: Record<SlotKind, number>,
                         blocked = -1): void {
  const { government, policies } = computeAdoption(research, extra, blocked);
  const gov = government ? GOVERNMENTS[government] : null;
  if (!gov) return;
  applyPolicyEffects(mods, gov.effects);
  for (const cardId of policies) {
    if (!cardId) continue;
    const card = POLICIES[cardId];
    if (card) applyPolicyEffects(mods, card.effects);
  }
}


export function followerBeliefForReligion(state: GameState, g: number): BeliefDef | undefined {
  if (g < 0) return undefined;
  const rel = seatOf(state, g)?.religion;
  return rel?.founded && rel.follower ? FOLLOWER_BELIEFS[rel.follower] : undefined;
}

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

export function followerReligionForCity(
  followedReligion: number | null | undefined,
  ownerReligionId: number,
): number {
  if (B18_FOLLOWER_COUPLING_LIVE) return followedReligion ?? -1;
  return ownerReligionId;
}

/**
 * CIV6 (Grove): "+1 Food and Faith to adjacent unimproved Charming tiles.
 * Yields increased to +2 Food, Faith and Culture for adjacent unimproved
 * Breathtaking tiles" — and the Sanctuary the same shape in Science/Gold.
 *
 * The two bands do NOT stack: a Breathtaking tile takes the Breathtaking row
 * and nothing else. Two Preserves reaching one tile each pay it, which is what
 * summing per district instance means.
 */
export function preserveTileYields(
  state: GameState,
  seat: number,
  camps?: ReadonlySet<number>,
): Map<number, Yields> {
  const out = new Map<number, Yields>();
  for (const city of citiesOf(state, seat)) {
    for (const d of city.districts) {
      const dt = state.map.tiles[d.tileIndex];
      if (!dt.districtComplete || dt.districtPillaged) continue;
      const rows = city.buildings
        .map((id) => BUILDINGS[id])
        .filter((b) => b && b.district === d.type && b.appealYields);
      if (!rows.length) continue;
      for (const n of neighbors(state.map, dt)) {
        if (n.improvement || n.district || n.builtWonder) continue;
        const band = appealBand(tileAppeal(state.map, n, camps));
        if (band > 1) continue; // Breathtaking is band 0, Charming band 1
        const cur = out.get(n.index) ?? emptyYields();
        for (const b of rows) {
          addYields(cur, band === 0 ? b!.appealYields!.breathtaking : b!.appealYields!.charming);
        }
        out.set(n.index, cur);
      }
    }
  }
  return out;
}

export interface YieldCtx {
  map: GameState['map'];
  mods: Modifiers;
  /** barbarian outpost tiles — the Seaside Resort's gold reads tile appeal */
  camps?: ReadonlySet<number>;
  /** what this seat's Groves and Sanctuaries pay the tiles around their
   *  Preserves, resolved once per context. */
  preserve?: ReadonlyMap<number, Yields>;
}

export function makeYieldCtx(state: GameState, seat: number, mods?: Modifiers): YieldCtx {
  const camps = campTiles(state);
  return {
    map: state.map,
    mods: mods ?? getModifiers(state, seat),
    camps,
    preserve: preserveTileYields(state, seat, camps),
  };
}

/** The BASE yield context: the map with NOBODY's modifiers. What a tile is
 *  worth before any seat's research touches it — which is exactly what the
 *  GPU fixture's static tile plane stores, because the GPU applies each row's
 *  own techs/civics/beliefs at runtime. */
export function baseYieldCtx(state: GameState): YieldCtx {
  return { map: state.map, mods: defaultModifiers(), camps: campTiles(state) };
}

export function governmentSlots(state: GameState, seat: number): SlotKind[] {
  const govId = seatOf(state, seat)!.government.current;
  const gov = govId ? GOVERNMENTS[govId] : null;
  if (!gov) return [];
  const slots = [...gov.slots];
  const xs = wonderExtraSlots(state, seat);
  for (const k of SLOT_KINDS) for (let i = 0; i < xs[k]; i++) slots.push(k);
  return slots;
}
