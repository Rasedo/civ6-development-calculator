/**
 * WHAT THE GAME'S AI SAYS A MODIFIER IS WORTH TO A PLAYER (GameCore_XP2, the
 * AI's modifier analysis; `tools/civ6lab/dll_readings.md` "C-96 / C-97: the
 * AI's yield weights and the modifier evaluator", "C-97: the government and
 * policy choice"). A list of modifiers is summed one by one (0x7a4b20), each
 * over its collection's subjects (0x6cede0, at most 51) that its requirement
 * set admits, by its effect's analyzer (the registry 0x6c9640 names one
 * static object per EffectType; its vtable's slot 1 is the analyzer), each
 * analyzer's value truncated to a whole number. An effect the registry does
 * not name is worth 0; so is a registered one whose analyzer is not read
 * here, and a modifier whose collection or a requirement evaluator is not
 * read.
 *
 * THE REQUIREMENT SET (built once by 0x6ccec0, tested by 0x6cf3c0): its
 * requirements whose RequirementType the registry names, each with its
 * evaluator (slot 1) and its Inverse; one the registry does not name is left
 * out of the set. TEST_ALL holds when every kept requirement does (an empty
 * set holds), TEST_ANY when one does (an empty set fails), TEST_NONE when
 * none does.
 */
import { AI_GOVERNMENT_INFLUENCE_THRESHOLD, AI_GP_CLASS_PSEUDOYIELD } from '../data/aiTables';
import { BUILT_WONDERS } from '../data/builtWonders';
import {
  FX, discounted, fmul, fxConst, fxOf, presentValue, pseudoYieldValue, traderValue, valueBetween, whole, yieldValue, type AiPlotView, type AiValueView,
} from './aiValue';

export interface AiRequirement {
  type: string;
  inverse: boolean;
  args: Readonly<Record<string, string>>;
}

export interface AiRequirementSet {
  /** RequirementSetType: REQUIREMENTSET_TEST_ALL, _ANY or _NONE */
  test: 'ALL' | 'ANY' | 'NONE';
  reqs: readonly AiRequirement[];
}

/** a modifier as DynamicModifiers resolves it (ai_tables.py) */
export interface AiModifier {
  id: string;
  collection: string;
  effect: string;
  args: Readonly<Record<string, string>>;
  subjectReqs?: AiRequirementSet;
  ownerReqs?: AiRequirementSet;
  /** an EFFECT_GRANT_ABILITY's ability's own modifiers (UnitAbilityModifiers) */
  ability?: readonly AiModifier[];
}

/** One evaluation's terms (the analysis context 0x6ccd50 the analyzers
 *  read): the seat, the turn the value starts (+0xb4), its horizon (+0xb8),
 *  the rate (+0xbc). */
export interface ValueTerms {
  view: AiValueView;
  seat: number;
  start: number;
  horizon: number;
  rate: number;
  /** the city that owns the modifiers in a building's analysis (context
   *  +0x10): COLLECTION_OWNER is that city; absent, the player */
  owner?: { cityId: number; capital: boolean };
}

/** an analysis subject: the player, a city (context +0x70), a district
 *  (+0x78) */
type Subject =
  | { kind: 'player' }
  | { kind: 'city'; id: number; capital: boolean }
  | { kind: 'district'; cityId: number; type: string }
  | { kind: 'plot'; plot: AiPlotView };

/** a collection's subjects for the seat (the collection objects' iterators);
 *  null for a collection not read */
function subjects(t: ValueTerms, collection: string): Subject[] | null {
  switch (collection) {
    case 'COLLECTION_OWNER': return t.owner ? [{ kind: 'city', id: t.owner.cityId, capital: t.owner.capital }] : [{ kind: 'player' }];
    case 'COLLECTION_PLAYER_CITIES': return t.view.cities(t.seat).map((c) => ({ kind: 'city', id: c.id, capital: c.capital }));
    case 'COLLECTION_PLAYER_CAPITAL_CITY': return t.view.cities(t.seat).filter((c) => c.capital).map((c) => ({ kind: 'city', id: c.id, capital: true }));
    case 'COLLECTION_PLAYER_DISTRICTS': return t.view.districts(t.seat).map((d) => ({ kind: 'district', cityId: d.cityId, type: d.type }));
    // 0x69ffa0: once, the evaluation's city (context +0x70)
    case 'COLLECTION_CITY_TRAINED_UNITS': return t.owner ? [{ kind: 'city', id: t.owner.cityId, capital: t.owner.capital }] : [];
    // 0x69feb0: the evaluation city's plots of its three rings that it owns
    case 'COLLECTION_CITY_PLOT_YIELDS': return t.owner ? t.view.cityOwnedPlots(t.seat, t.owner.cityId).map((plot) => ({ kind: 'plot', plot })) : [];
    default: return null;
  }
}

/** the RequirementTypes the registry names (0x6c9640, the requirement list
 *  at registry +0x80) */
const REGISTERED_REQUIREMENTS: ReadonlySet<string> = new Set([
  'REQUIREMENT_ALWAYS_MET', 'REQUIREMENT_NEVER_MET', 'REQUIREMENT_MET', 'REQUIREMENT_NOT_MET', 'REQUIREMENTSET_IS_MET',
  'REQUIREMENT_CITY_FOLLOWS_PANTHEON', 'REQUIREMENT_CITY_FOLLOWS_RELIGION', 'REQUIREMENT_CITY_HAS_BUILDING', 'REQUIREMENT_CITY_HAS_DISTRICT',
  'REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS', 'REQUIREMENT_CITY_HAS_GARRISON_UNIT', 'REQUIREMENT_CITY_HAS_GOVERNOR',
  'REQUIREMENT_CITY_HAS_HIGH_ADJACENCY_DISTRICT', 'REQUIREMENT_CITY_HAS_X_POPULATION', 'REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT',
  'REQUIREMENT_COMBAT_TYPE_MATCHES', 'REQUIREMENT_DECLARED_FRIEND', 'REQUIREMENT_DELEGATION', 'REQUIREMENT_DISTRICT_TYPE_MATCHES',
  'REQUIREMENT_DENOUNCED', 'REQUIREMENT_HAD_FRIENDLY_MEETING', 'REQUIREMENT_NEAR_CULTURE_BORDER', 'REQUIREMENT_OPPONENT_IS_BARBARIAN',
  'REQUIREMENT_OPPONENT_IS_DISTRICT', 'REQUIREMENT_OPPONENT_IS_FORTIFIED', 'REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES',
  'REQUIREMENT_OPPONENT_UNIT_TYPE_MATCHES', 'REQUIREMENT_OPPONENT_UNIT_DOMAIN_MATCHES', 'REQUIREMENT_PLAYER_IS_ATTACKING',
  'REQUIREMENT_PLAYER_IS_AT_PEACE', 'REQUIREMENT_PLAYER_IS_BARBARIAN', 'REQUIREMENT_PLAYER_IS_MINOR', 'REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER',
  'REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS', 'REQUIREMENT_PLAYER_HAS_GIVEN_MOST_INFLUENCE_TOKENS', 'REQUIREMENT_PLAYER_HAS_GOLDEN_AGE',
  'REQUIREMENT_PLAYER_HAS_PANTHEON', 'REQUIREMENT_PLOT_ADJACENT_DISTRICT_TYPE_MATCHES', 'REQUIREMENT_PLOT_ADJACENT_TO_COAST',
  'REQUIREMENT_PLOT_ADJACENT_TO_LAKE', 'REQUIREMENT_PLOT_ADJACENT_FEATURE_TYPE_MATCHES', 'REQUIREMENT_PLOT_ADJACENT_IMPROVEMENT_TYPE_MATCHES',
  'REQUIREMENT_PLOT_ADJACENT_RESOURCE_CLASS_TYPE_MATCHES', 'REQUIREMENT_PLOT_ADJACENT_TO_OWNER', 'REQUIREMENT_PLOT_ADJACENT_TO_WONDER',
  'REQUIREMENT_PLOT_ADJACENT_TO_RIVER', 'REQUIREMENT_PLOT_DISTRICT_TAG_MATCHES', 'REQUIREMENT_PLOT_DISTRICT_TYPE_MATCHES',
  'REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES', 'REQUIREMENT_PLOT_HAS_ANY_DISTRICT', 'REQUIREMENT_PLOT_HAS_ANY_IMPROVEMENT',
  'REQUIREMENT_PLOT_IMPROVEMENT_TAG_MATCHES', 'REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES', 'REQUIREMENT_PLOT_IS_APPEAL_BETWEEN',
  'REQUIREMENT_PLOT_IS_COAST', 'REQUIREMENT_PLOT_IS_HILLS', 'REQUIREMENT_PLOT_RESOURCE_CLASS_TYPE_MATCHES',
  'REQUIREMENT_PLOT_IMPROVED_RESOURCE_CLASS_TYPE_MATCHES', 'REQUIREMENT_PLOT_RESOURCE_TAG_MATCHES', 'REQUIREMENT_PLOT_RESOURCE_TYPE_MATCHES',
  'REQUIREMENT_PLOT_RESOURCE_VISIBLE', 'REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES', 'REQUIREMENT_TRADE_ROUTE_BETWEEN_ALLIANCE_PARTNERS',
  'REQUIREMENT_UNIT_PROMOTION_CLASS_MATCHES', 'REQUIREMENT_UNIT_TAG_MATCHES', 'REQUIREMENT_UNIT_TYPE_MATCHES',
]);

/** One requirement evaluator: does the subject meet it */
type Evaluator = (t: ValueTerms, args: Readonly<Record<string, string>>, s: Subject) => boolean;

const EVALUATORS: Readonly<Record<string, Evaluator>> = {
  // the plot subject's (context +0x88) terrain (0x6d1dd0: plot +0x2c),
  // feature (0x6d4380), resource (0x6d1970: plot +0x40, none fails), the
  // resource revealed to the player (0x6d1c00), an improvement (0x6cfcd0:
  // plot +0x44)
  REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES: (_t, args, s) => s.kind === 'plot' && s.plot.terrain === args.TerrainType,
  REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES: (_t, args, s) => s.kind === 'plot' && s.plot.feature === args.FeatureType,
  REQUIREMENT_PLOT_RESOURCE_TYPE_MATCHES: (_t, args, s) => s.kind === 'plot' && !!s.plot.resource && s.plot.resource === args.ResourceType,
  REQUIREMENT_PLOT_RESOURCE_VISIBLE: (_t, _args, s) => s.kind === 'plot' && s.plot.resourceVisible,
  REQUIREMENT_PLOT_HAS_ANY_IMPROVEMENT: (_t, _args, s) => s.kind === 'plot' && !!s.plot.improvement,
  // 0x6d08c0: a district subject of the type (with none, the district type
  // the evaluation is of, context +0x1c — none in a policy's analysis)
  REQUIREMENT_DISTRICT_TYPE_MATCHES: (_t, args, s) => s.kind === 'district' && s.type === args.DistrictType,
  // 0x6d3830: a city subject holding the building; a wonder only when the
  // evaluation is of that city (context +0x10, none in a policy's analysis)
  REQUIREMENT_CITY_HAS_BUILDING: (t, args, s) => {
    if (s.kind !== 'city') return false;
    const b = args.BuildingType ?? '';
    if (b.replace(/^BUILDING_/, '') in BUILT_WONDERS) return false;
    return t.view.cityHasBuilding(t.seat, s.id, b);
  },
};

/** 0x6cf3c0 over the set as 0x6ccec0 builds it: null where a kept
 *  requirement's evaluator is not read */
function admits(t: ValueTerms, set: AiRequirementSet | undefined, s: Subject): boolean | null {
  if (!set) return true;
  const kept = set.reqs.filter((r) => REGISTERED_REQUIREMENTS.has(r.type));
  const met: boolean[] = [];
  for (const r of kept) {
    const ev = EVALUATORS[r.type];
    if (!ev) return null;
    met.push(ev(t, r.args, s) !== r.inverse);
  }
  if (set.test === 'ANY') return met.some((x) => x);
  if (set.test === 'NONE') return !met.some((x) => x);
  return met.every((x) => x);
}

/** One analyzer: the value of the modifier's arguments on one subject, a
 *  whole number. */
type Analyzer = (t: ValueTerms, args: Readonly<Record<string, string>>, s: Subject) => number;

const amountOf = (args: Readonly<Record<string, string>>): number => (Number(args.Amount ?? 0) | 0) * FX;
/** PV(horizon) - PV(start), the two 0x7a16e0 calls most analyzers make */
const span = (t: ValueTerms, v: number): number => presentValue(v, t.rate, t.horizon) - presentValue(v, t.rate, t.start);
/** a bool argument as the analyzer's parser reads it (0xc7a1c0), with its
 *  default */
const flag = (args: Readonly<Record<string, string>>, name: string, dflt: boolean): boolean =>
  args[name] === undefined ? dflt : args[name] === 'true' || args[name] === '1';

const ANALYZERS: Readonly<Record<string, Analyzer>> = {
  // 0x6b8ba0: a city subject only; the yield at the player's weight, valued
  // from the start to the horizon (0x7a2140)
  EFFECT_ADJUST_CITY_YIELD_CHANGE: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const v = yieldValue(t.view, t.seat, amountOf(args), args.YieldType ?? '');
    return whole(valueBetween(v, t.start, t.horizon, t.rate));
  },
  // 0x6b9d90: a city subject only; the city's whole yield (City::GetYield
  // 0x1cb8b0) capped at 100, times the percent, times 0.01f, at the player's
  // weight, valued from the start to the horizon
  EFFECT_ADJUST_CITY_YIELD_MODIFIER: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const type = args.YieldType ?? '';
    const have = Math.min(Math.floor(t.view.cityYield(t.seat, s.id, type)), 100);
    const amount = fxConst(Math.fround(Math.fround(have * (Number(args.Amount ?? 0) | 0)) * Math.fround(0.01)));
    return whole(valueBetween(yieldValue(t.view, t.seat, amount, type), t.start, t.horizon, t.rate));
  },
  // 0x6a7d70: the yield unweighted (no player passed), PV(horizon) - PV(start)
  EFFECT_ADJUST_PLAYER_YIELD_CHANGE: (t, args) => whole(span(t, yieldValue(null, null, amountOf(args), args.YieldType ?? ''))),
  // 0x6a0b10: the class's pseudo-yield, its present value to the horizon
  EFFECT_ADJUST_GREAT_PERSON_POINTS: (t, args) => {
    const pseudo = AI_GP_CLASS_PSEUDOYIELD[args.GreatPersonClassType ?? ''];
    if (!pseudo) return 0;
    return whole(presentValue(pseudoYieldValue(t.view, t.seat, amountOf(args), pseudo), t.rate, t.horizon));
  },
  // 0x6afcd0: a player that may take Influence (0x449940); the game's
  // city-states (the list at Game +0x3f8 +0x1650) x the player's points a
  // token (Player_Influence +0x270: the government's InfluencePointsThreshold
  // at the game speed, 0x44eaa0) x the amount, as PSEUDOYIELD_INFLUENCE,
  // discounted from the start (0x7a1240)
  EFFECT_ADJUST_DUPLICATE_FIRST_INFLUENCE_TOKEN: (t, args) => {
    const gov = t.view.government(t.seat);
    const threshold = gov ? AI_GOVERNMENT_INFLUENCE_THRESHOLD[gov] : undefined;
    if (threshold === undefined) return 0;
    const token = Math.trunc((threshold * t.view.costMultiplierPct) / 100);
    const v = pseudoYieldValue(t.view, t.seat, amountOf(args) * t.view.cityStates * token, 'PSEUDOYIELD_INFLUENCE');
    return whole(discounted(v, t.rate, t.start));
  },
  // 0x6ae510: PSEUDOYIELD_INFLUENCE, PV(horizon) - PV(start)
  EFFECT_ADJUST_INFLUENCE_POINTS_PER_TURN: (t, args) => whole(span(t, pseudoYieldValue(t.view, t.seat, amountOf(args), 'PSEUDOYIELD_INFLUENCE'))),
  // 0x6addf0: a district subject only; the district's yield (0x24b5a0) x the
  // percent x 0.01f, bare, PV(horizon) - PV(start)
  EFFECT_ADJUST_DISTRICT_YIELD_MODIFIER: (t, args, s) => {
    if (s.kind !== 'district') return 0;
    const type = args.YieldType ?? '';
    const have = t.view.districtYield(t.seat, s.cityId, s.type, type);
    const amount = fxConst(Math.fround(Math.fround((Number(args.Amount ?? 0) | 0) * Math.fround(0.01)) * have));
    return whole(span(t, yieldValue(null, null, amount, type)));
  },
  // 0x6acd00: a district subject only; the yield unweighted, PV(horizon) -
  // PV(start)
  EFFECT_ADJUST_DISTRICT_YIELD_CHANGE: (t, args, s) =>
    s.kind === 'district' ? whole(span(t, yieldValue(null, null, amountOf(args), args.YieldType ?? ''))) : 0,
  // 0x6c5080: a city subject only; the yield at the player's weight, halved
  // where the city lacks the building, PV(horizon) - PV(start)
  EFFECT_ADJUST_BUILDING_YIELD_CHANGE: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    let v = yieldValue(t.view, t.seat, amountOf(args), args.YieldType ?? '');
    if (!t.view.cityHasBuilding(t.seat, s.id, args.BuildingType ?? '')) v = fmul(v, fxConst(0.5));
    return whole(span(t, v));
  },
  // 0x6a1b80: a city subject holding a district of the type (0x1ae530);
  // per building of the district in the player's version, its yield of the
  // kind x the percent x 0.01 (the parser's fx), at the player's weight,
  // valued from the start to the horizon, halved where the city lacks it,
  // each building's whole part added
  EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT: (t, args, s) => {
    if (s.kind !== 'city' || !t.view.cityHasDistrict(t.seat, s.id, args.DistrictType ?? '')) return 0;
    const type = args.YieldType ?? '';
    const pct = fxConst(Math.fround((Number(args.Amount ?? 0) | 0) * Math.fround(0.01)));
    let sum = 0;
    for (const b of t.view.districtBuildingYields(t.seat, args.DistrictType ?? '', type)) {
      let v = valueBetween(yieldValue(t.view, t.seat, fmul(pct, b.amount * FX), type), t.start, t.horizon, t.rate);
      if (!t.view.cityHasBuilding(t.seat, s.id, b.building)) v = fmul(v, fxConst(0.5));
      sum += whole(v);
    }
    return sum;
  },
  // 0x6a3160: the trade route capacity x the amount, at the player's weight;
  // AffectOrigin (default true) from the start to the horizon (0x7a2140),
  // else AffectDestination (default false) half of it toward a named player
  // only — none in a policy's analysis
  EFFECT_ADJUST_TRADE_ROUTE_YIELD: (t, args) => {
    const v = yieldValue(t.view, t.seat, t.view.tradeRouteCapacity(t.seat) * amountOf(args), args.YieldType ?? '');
    return flag(args, 'AffectOrigin', true) ? whole(valueBetween(v, t.start, t.horizon, t.rate)) : 0;
  },
  // 0x6a49e0: the trade route capacity x the amount, at the player's weight,
  // PV(horizon) - PV(start)
  EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL: (t, args) =>
    whole(span(t, yieldValue(t.view, t.seat, t.view.tradeRouteCapacity(t.seat) * amountOf(args), args.YieldType ?? ''))),
  EFFECT_ADJUST_TRADE_ROUTE_YIELD_FOR_DOMESTIC: (t, args) =>
    whole(span(t, yieldValue(t.view, t.seat, t.view.tradeRouteCapacity(t.seat) * amountOf(args), args.YieldType ?? ''))),
  // 0x6a9550: the envoys placed x the amount, at the player's weight, from
  // the start to the horizon
  EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_USED_INFLUENCE_TOKEN: (t, args) =>
    whole(valueBetween(yieldValue(t.view, t.seat, t.view.influenceTokensUsed(t.seat) * amountOf(args), args.YieldType ?? ''), t.start, t.horizon, t.rate)),
  // 0x6ac7f0: the city-states it is suzerain of x the amount, at the
  // player's weight, PV(horizon) - PV(start)
  EFFECT_ADJUST_PLAYER_YIELD_CHANGE_PER_TRIBUTARY: (t, args) =>
    whole(span(t, yieldValue(t.view, t.seat, t.view.tributaries(t.seat) * amountOf(args), args.YieldType ?? ''))),
  // 0x6b0840: over the player's units, the least of the amount and the
  // unit's Maintenance, as unweighted Gold, PV(horizon) - PV(start)
  EFFECT_ADJUST_UNIT_MAINTENANCE_DISCOUNT: (t, args) => {
    const a = Number(args.Amount ?? 0) | 0;
    let sum = 0;
    for (const m of t.view.unitMaintenances(t.seat)) sum += Math.min(a, m) * FX;
    return whole(span(t, yieldValue(null, null, sum, 'YIELD_GOLD')));
  },
  // 0x6c4820: PSEUDOYIELD_DIPLOMATIC_FAVOR at the player's weight,
  // PV(horizon) - PV(start)
  EFFECT_ADJUST_PLAYER_EXTRA_FAVOR_PER_TURN: (t, args) => whole(span(t, pseudoYieldValue(t.view, t.seat, amountOf(args), 'PSEUDOYIELD_DIPLOMATIC_FAVOR'))),
  // 0x6c0ff0: a Trader's worth (0x7a7110) with the amount's capacity more,
  // from the start to the horizon; 0 where the route value is not read
  EFFECT_ADJUST_TRADE_ROUTE_CAPACITY: (t, args) =>
    whole(traderValue(t.view, t.seat, Number(args.Amount ?? 0) | 0, t.start, t.horizon, 0, t.rate) ?? 0),
  // 0x6afa10: a plot subject that is not impassable; half of the amount's
  // PV(horizon) - PV(start), the yield unweighted
  EFFECT_ADJUST_PLOT_YIELD: (t, args, s) => {
    if (s.kind !== 'plot' || s.plot.impassable) return 0;
    return whole(yieldValue(null, null, fmul(span(t, amountOf(args)), fxConst(0.5)), args.YieldType ?? ''));
  },
  // 0x6c09b0 (its parser 0x6c0590 stores fx(Amount x 0.01f) as unweighted
  // Gold): with no unit, a city subject's Production (City::GetYield) times
  // it, from the start to the horizon
  EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const per = yieldValue(null, null, fxConst(Math.fround((Number(args.Amount ?? 0) | 0) * Math.fround(0.01))), 'YIELD_GOLD');
    const production = fxOf(t.view.cityYield(t.seat, s.id, 'YIELD_PRODUCTION'));
    return whole(valueBetween(fmul(per, production), t.start, t.horizon, t.rate));
  },
};

/** One modifier's value (0x6cede0 over its subjects, each analyzer's whole
 *  number added): 0 where its collection, a requirement evaluator or its
 *  effect's analyzer is not read. */
export function modifierValue(t: ValueTerms, m: AiModifier, depth = 1): number {
  // 0x6b5b30, EFFECT_GRANT_ABILITY: per subject, the ability's own
  // modifiers analysed in a copy of the context, their sums added; a fourth
  // nested analysis is refused
  const an = m.effect === 'EFFECT_GRANT_ABILITY'
    ? (depth >= 4 ? undefined : (tt: ValueTerms) => (m.ability ?? []).reduce((a, x) => a + modifierValue(tt, x, depth + 1), 0))
    : ANALYZERS[m.effect];
  const subs = subjects(t, m.collection);
  if (!an || !subs) return 0;
  let sum = 0;
  for (const s of subs.slice(0, 51)) {
    const ok = admits(t, m.subjectReqs, s);
    if (ok === null) return 0;
    if (ok) sum += an(t, m.args, s);
  }
  return sum;
}

/** THE MODIFIERS' SUM (0x7a4b20): each modifier's whole value, held to
 *  +-0x7fffff, in fixed point */
export function modifiersValue(t: ValueTerms, mods: readonly AiModifier[]): number {
  let v = 0;
  for (const m of mods) v += Math.min(Math.max(modifierValue(t, m), -0x7fffff), 0x7fffff) * FX;
  return v;
}
