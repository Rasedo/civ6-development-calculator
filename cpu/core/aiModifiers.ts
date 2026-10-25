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
import { AI_GOVERNMENT_INFLUENCE_THRESHOLD, AI_GP_CLASS_PSEUDOYIELD, AI_GREAT_PERSON_CLASSES, AI_MINOR_INFLUENCE_MODIFIERS, AI_SPACE_RACE_PROJECTS } from '../data/aiTables';
import { BUILT_WONDERS } from '../data/builtWonders';
import { ERAS, TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { engineId } from '../data/aliases';
import { COMBAT_POWER_SCALING, STRATEGIC_IDS } from '../data/constants';
import { AI_BUILDINGS, AI_DISTRICTS, AI_UNITS } from '../data/aiBuildTables';
import {
  FX, discounted, fdiv, fmul, fxConst, fxOf, presentValue, pseudoYieldValue, traderValue, valueBetween, whole, yieldValue, type AiPlotView, type AiValueView,
} from './aiValue';
import { AI_BUILDING_INDEX, AI_UNIT_INDEX, amenityPerTurn } from './aiCityBuild';
import { FREE_SEAT } from './seats';

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
  /** an EFFECT_ATTACH_MODIFIER's attached modifier (its ModifierId) */
  attach?: AiModifier;
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
   *  +0x10), or the city an attached modifier's analysis is of (+0x70, the
   *  subject its attaching modifier stood on): COLLECTION_OWNER is that city,
   *  of `seat` (the evaluating seat where absent); absent, the player */
  owner?: { cityId: number; capital: boolean; seat?: number };
  /** the religion the evaluation is of (context +0x48), -1 for none: a
   *  belief's (0x7a7400) is the player's own religion, else its majority
   *  religion */
  religion?: number;
  /** the cities COLLECTION_ALL_CITIES walks (0x69f340): the evaluating
   *  player's knowledge base, its entries in order; absent where the
   *  evaluation reads none */
  known?: readonly AiCitySubject[];
  /** the other player the evaluation is of (context +0x40): the city-state
   *  an envoys' value is of (0x7a46c0), the player a resolution's option
   *  value starts with (0x7b3be0) or its hint names, the major
   *  COLLECTION_MAJOR_PLAYERS stands on; absent, none */
  other?: number;
  /** the envoys the evaluation adds to those given (context +0x08) */
  tokens?: number;
  /** the unit the evaluation stands on (context +0x90): the subject of a
   *  COLLECTION_PLAYER_UNITS walk, kept through a granted ability's own
   *  modifiers; absent, none */
  unit?: { plot: number; type: string; moves: number; level: number };
  /** a resolution's target hint (0x67dd40's handlers), in the install's
   *  types: the luxury (+0x4c), the yield (+0x64), the government (+0x28),
   *  the great person class (+0x6c), the project (+0x68) */
  resource?: string;
  yieldType?: string;
  government?: string;
  gpClass?: string;
  project?: string;
  /** the policy AI's best card for a slot type (GovernmentSlotType), raw
   *  24.8, null for none: the cards neither obsolete nor active, unlocked,
   *  of the slot (any for a wildcard), the most its scores give (0x623b90) */
  bestPolicy?: (slot: string) => number | null;
}

/** a city an analysis may stand on: its owner's seat, the engine's city id
 *  (a city-state's one city -1), whether it is its owner's capital */
export interface AiCitySubject {
  seat: number;
  id: number;
  capital: boolean;
}

/** an analysis subject: the player, a city (context +0x70), the empty city
 *  COLLECTION_PLAYER_CITIES' walk ends on (+0x70 null), a district (+0x78) */
type Subject =
  | { kind: 'player'; other?: number }
  | { kind: 'city'; seat: number; id: number; capital: boolean }
  | { kind: 'nocity' }
  | { kind: 'district'; cityId: number; type: string }
  | { kind: 'plot'; plot: AiPlotView }
  | { kind: 'unit'; plot: number; type: string; moves: number; level: number };

/** the subjects COLLECTION_PLAYER_CITIES' walk gives at least (0x69ea00's
 *  +0xd4 against 5) */
const PLAYER_CITIES_WALK = 5;

const ownerCity = (t: ValueTerms): Subject | null =>
  t.owner ? { kind: 'city', seat: t.owner.seat ?? t.seat, id: t.owner.cityId, capital: t.owner.capital } : null;

/** a collection's subjects for the seat (the collection objects' iterators);
 *  null for a collection not read */
function subjects(t: ValueTerms, collection: string): Subject[] | null {
  switch (collection) {
    case 'COLLECTION_OWNER': return [ownerCity(t) ?? { kind: 'player' }];
    // 0x69e9e0 / 0x69ea00: the player's cities, each setting the context's
    // city (+0x70); then, while fewer than five subjects have been given
    // (+0xd4), a subject with no city (+0x70 null) — every city-state's
    // Colonial Offices 16.0, four empty subjects at 2.0 Food, its one city
    // failing the set; a major's 4.0 per city short of five (runs/h1_duely1117
    // China 12.0 with two cities t61-93, 8.0 with three, 4.0 with four)
    case 'COLLECTION_PLAYER_CITIES': {
      const out: Subject[] = t.view.cities(t.seat).map((c) => ({ kind: 'city', seat: t.seat, id: c.id, capital: c.capital }));
      while (out.length < PLAYER_CITIES_WALK) out.push({ kind: 'nocity' });
      return out;
    }
    case 'COLLECTION_PLAYER_CAPITAL_CITY': return t.view.cities(t.seat).filter((c) => c.capital).map((c) => ({ kind: 'city', seat: t.seat, id: c.id, capital: true }));
    case 'COLLECTION_PLAYER_DISTRICTS': return t.view.districts(t.seat).map((d) => ({ kind: 'district', cityId: d.cityId, type: d.type }));
    // 0x69fdf0: the evaluation city's districts (+0x70), its centre's among
    // them
    case 'COLLECTION_CITY_DISTRICTS': return t.owner
      ? t.view.cityDistricts(t.owner.seat ?? t.seat, t.owner.cityId).map((type) => ({ kind: 'district', cityId: t.owner!.cityId, type }))
      : [];
    // 0x69ffa0: once, the evaluation's city (context +0x70)
    case 'COLLECTION_CITY_TRAINED_UNITS': {
      const c = ownerCity(t);
      return c ? [c] : [];
    }
    // 0x69feb0: the evaluation city's plots of its three rings that it owns
    case 'COLLECTION_CITY_PLOT_YIELDS': return t.owner ? t.view.cityOwnedPlots(t.owner.seat ?? t.seat, t.owner.cityId).map((plot) => ({ kind: 'plot', plot })) : [];
    // 0x69f320 / 0x69f340: the player's knowledge base's cities, in its order
    case 'COLLECTION_ALL_CITIES': return t.known ? t.known.map((c) => ({ kind: 'city', seat: c.seat, id: c.id, capital: c.capital })) : null;
    // 0x69f6c0 / 0x69f6e0: with a player in the context, that player once
    // (the first step stands on the context as it is and ends the walk)
    case 'COLLECTION_ALL_PLAYERS': return [{ kind: 'player' }];
    // 0x6a00f0: the game's majors in order, each alive one setting the
    // context's other player (+0x40)
    case 'COLLECTION_MAJOR_PLAYERS': return t.view.majors().map((m) => ({ kind: 'player', other: m }));
    // the player's units in its list's order, each the context's unit (+0x90)
    case 'COLLECTION_PLAYER_UNITS': return t.view.playerUnits(t.seat).map((u) => ({ kind: 'unit', plot: u.plot, type: u.type, moves: u.moves, level: u.level }));
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
  // by their names (their bodies 0x6d03d0, 0x6d0af0, 0x6d1140, 0x6d0670
  // unread): the plot subject's improvement of the type
  REQUIREMENT_PLOT_IMPROVEMENT_TYPE_MATCHES: (_t, args, s) =>
    s.kind === 'plot' && !!s.plot.improvement && `IMPROVEMENT_${s.plot.improvement}` === args.ImprovementType,
  // the plot subject's resource of the class; improved: the improvement on
  // it is the resource's own
  REQUIREMENT_PLOT_RESOURCE_CLASS_TYPE_MATCHES: (_t, args, s) => s.kind === 'plot' && s.plot.resourceClass === args.ResourceClassType,
  REQUIREMENT_PLOT_IMPROVED_RESOURCE_CLASS_TYPE_MATCHES: (_t, args, s) =>
    s.kind === 'plot' && s.plot.improved && s.plot.resourceClass === args.ResourceClassType,
  // the plot subject's Appeal at least MinimumAppeal
  REQUIREMENT_PLOT_IS_APPEAL_BETWEEN: (_t, args, s) =>
    s.kind === 'plot' && s.plot.appeal >= Number(args.MinimumAppeal ?? -1e9) && s.plot.appeal <= Number(args.MaximumAppeal ?? 1e9),
  // 0x6d08c0: a district subject of the type (with none, the district type
  // the evaluation is of, context +0x1c — none in a policy's analysis)
  REQUIREMENT_DISTRICT_TYPE_MATCHES: (_t, args, s) => s.kind === 'district' && s.type === args.DistrictType,
  // 0x6d3830: a city subject holding the building; a wonder only when the
  // evaluation is of that city (context +0x10, none in a policy's analysis)
  REQUIREMENT_CITY_HAS_BUILDING: (t, args, s) => {
    if (s.kind !== 'city') return false;
    const b = args.BuildingType ?? '';
    if (b.replace(/^BUILDING_/, '') in BUILT_WONDERS) return false;
    return t.view.cityHasBuilding(s.seat, s.id, b);
  },
  // 0x6d4420: a city subject of nine citizens or more (City +0x588 >= 9:
  // the AI's reading of a garrison; every city-state's Retainers first
  // logged the turn its city grows to nine, runs/h1_duelw1117-1128)
  REQUIREMENT_CITY_IS_OWNER_CAPITAL_CONTINENT: (t, _args, s) => s.kind === 'city' && t.view.cityOnHomeContinent(s.seat, s.id),
  REQUIREMENT_CITY_HAS_GARRISON_UNIT: (t, _args, s) => s.kind === 'city' && t.view.cityCitizens(s.seat, s.id) >= 9,
  // 0x6d4190: a city subject whose specialty districts (0x1ae8f0) reach
  // the Amount
  REQUIREMENT_CITY_HAS_X_SPECIALTY_DISTRICTS: (t, args, s) =>
    s.kind === 'city' && t.view.citySpecialtyDistricts(s.seat, s.id) >= (Number(args.Amount ?? 0) | 0),
  // 0x6cfbf0: a city subject whose owner (+0x1b8) is the context's player
  REQUIREMENT_CITY_FOLLOWS_PANTHEON: (t, _args, s) => s.kind === 'city' && s.seat === t.seat,
  // 0x6cfcb0: a city subject; any with no religion in the context (+0x48),
  // else one whose religion (+0x1910) is it
  REQUIREMENT_CITY_FOLLOWS_RELIGION: (t, _args, s) =>
    s.kind === 'city' && ((t.religion ?? -1) < 0 || t.view.cityReligion(s.seat, s.id) === t.religion),
  // 0x6cfbd0: the context's player is the player the evaluation is for
  // (+0x80's id against +0x40) — the evaluating player
  REQUIREMENT_PLAYER_HAS_PANTHEON: () => true,
  // 0x6d27a0: with no religion in the context, held; else the context's
  // player founded it (0x497cc0)
  REQUIREMENT_PLAYER_IS_RELIGION_FOUNDER: (t) => (t.religion ?? -1) < 0 || t.view.religionFounded(t.seat) === t.religion,
  // 0x6d45b0: with an other player in the context (+0x40), the envoys the
  // player has given it (0x44c860) and the context's (+0x08) reach
  // MinimumTokens
  REQUIREMENT_PLAYER_HAS_GIVEN_INFLUENCE_TOKENS: (t, args) =>
    t.other !== undefined && t.view.envoys(t.other, t.seat) + (t.tokens ?? 0) >= (Number(args.MinimumTokens ?? 0) | 0),
  // 0x6d2470: with an other player in the context (+0x40), not at war with it
  REQUIREMENT_PLAYER_IS_AT_PEACE: (t) => t.other !== undefined && !t.view.atWar(t.seat, t.other),
  // 0x6d2760: the evaluating player (context +0x80) is no full civilization
  // and no barbarian — a city-state or the Free Cities
  REQUIREMENT_PLAYER_IS_MINOR: (t) => !t.view.fullCiv(t.seat) && !t.view.barbarianSeats().includes(t.seat),
  // 0x6cfad0: a city subject (the context's city, +0x70) of at least Amount
  // citizens (+0x588)
  REQUIREMENT_CITY_HAS_X_POPULATION: (t, args, s) => s.kind === 'city' && t.view.cityCitizens(s.seat, s.id) >= (Number(args.Amount ?? 0) | 0),
  // 0x6d4860: a city subject's district of the type (0x1ae530) whose yield
  // (District::GetYield, no modifier) of the kind reaches Amount
  REQUIREMENT_CITY_HAS_HIGH_ADJACENCY_DISTRICT: (t, args, s) => s.kind === 'city'
    && t.view.cityHasDistrict(s.seat, s.id, args.DistrictType ?? '')
    && t.view.districtYield(s.seat, s.id, args.DistrictType ?? '', args.YieldType ?? '') >= (Number(args.Amount ?? 0) | 0),
  // 0x6d22c0: with the context's unit (+0x90), its Units row's
  // PromotionClass is the argument's; with none, the context holds a city
  // (+0x70)
  REQUIREMENT_UNIT_PROMOTION_CLASS_MATCHES: (t, args, s) => s.kind === 'unit'
    ? AI_UNITS[AI_UNIT_INDEX.get(s.type) ?? -1]?.promotionClass === args.UnitPromotionClass
    : s.kind === 'city' || (s.kind !== 'nocity' && !!t.owner),
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
/** a unit's era (Unit_Manager 0x940740) as an Eras index: of its PrereqTech's
 *  and PrereqCivic's eras the later by chronology; with neither, the game's
 *  start era's ChronologyIndex read as an index (the start era Ancient's 1:
 *  Classical) */
export function unitEraIndex(row: { tech: string | null; civic: string | null }): number {
  const of = (e: string | undefined): number => (e ? ERAS.indexOf(e as never) : -1);
  const tech = row.tech ? engineId('tech', row.tech, 'TECH_', TECHS) : null;
  const civic = row.civic ? engineId('civic', row.civic, 'CIVIC_', CIVICS) : null;
  const te = tech ? of(TECHS[tech]?.era) : -1;
  const ce = civic ? of(CIVICS[civic]?.era) : -1;
  if (te < 0 && ce < 0) return START_ERA + 1;
  return ce > te ? ce : te;
}
/** the accumulating resources (Resource_Consumption Accumulate), in the
 *  Resources' order */
const ACCUMULATING: readonly string[] = STRATEGIC_IDS.map((id) => `RESOURCE_${id}`);
/** the game's start era (an Eras index) */
const START_ERA = 0;
/** the records' age the barbarian-combat analyzer reads (0x5eb0f0's fifth
 *  argument) */
const KNOWN_AGE = 10;
/** an Amount the analyzer's parser stores as fx(Amount x 0.01f) */
const pctOf = (args: Readonly<Record<string, string>>): number =>
  fxConst(Math.fround((Number(args.Amount ?? 0) | 0) * Math.fround(0.01)));
/** an era argument as the parser reads it (0x6c7f00: the Eras row's index,
 *  -1 for none) */
const eraOf = (name: string | undefined): number => (name ? ERAS.findIndex((e) => `ERA_${e.toUpperCase()}` === name) : -1);
/** the barbarian camps the player's knowledge base holds (its +0x638 list,
 *  AI_Knowledge.csv's CAMP lines), at most 5 */
const campsKnown = (t: ValueTerms): number => Math.min(t.view.barbarianCamps(t.seat).length, 5);

/** 0x6b76f0 / 0x6aee30: a city subject; with a district of the type
 *  (0x1ae530), the district's plot and its six neighbours that match; without
 *  one, the plots within 3 of the centre that match (0x6c7690 / 0x6c78a0);
 *  Amount each, at the player's weight, PV(horizon) - PV(start). Both walks
 *  take the plot's offset coordinates as axial ones, so they stand on the
 *  plots `plotsWithinReadAsAxial` names (runs/h1_duelw1124 t3: China's
 *  Desert Folklore 22, the four Desert plots of that walk, none within 3 of
 *  its capital) */
function adjacencyValue(t: ValueTerms, args: Readonly<Record<string, string>>, s: Subject, match: (plot: number) => boolean): number {
  if (s.kind !== 'city') return 0;
  const site = t.view.districtPlot(s.seat, s.id, args.DistrictType ?? '');
  const plots = t.view.plotsWithinReadAsAxial(site ?? t.view.cityPlot(s.seat, s.id), site === null ? 3 : 1);
  const n = plots.filter(match).length;
  return whole(span(t, yieldValue(t.view, t.seat, n * amountOf(args), args.YieldType ?? '')));
}
/** PV(horizon) - PV(start), the two 0x7a16e0 calls most analyzers make */
const span = (t: ValueTerms, v: number): number => presentValue(v, t.rate, t.horizon) - presentValue(v, t.rate, t.start);
/** a bool argument as the analyzer's parser reads it (0xc7a1c0), with its
 *  default */
const flag = (args: Readonly<Record<string, string>>, name: string, dflt: boolean): boolean =>
  args[name] === undefined ? dflt : args[name] === 'true' || args[name] === '1';

/** the percent `a` (24.8) of `v` (24.8), the fixed-point x a / 100 (0x6c8e60) */
const pct = (v: number, a: number): number => Math.trunc((v * a) / (100 * FX));

/** the Amenity value's turn in a city of the player (0x79f7c0's, `n`
 *  Amenities) */
const amenityTurn = (t: ValueTerms, c: { balance: number; yields: Readonly<Record<string, number>> }, n = 1): number =>
  amenityPerTurn({ view: t.view, seat: t.seat }, c, n);

const ANALYZERS: Readonly<Record<string, Analyzer>> = {
  // 0x6a8320 (the Luxury Policy, A): on the player's own subject, with a
  // luxury named (+0x4c) of which it holds more than one copy (0x4aa790),
  // the most one Amenity more is worth over its cities (0x79f7c0) from the
  // start to the horizon
  EFFECT_ADJUST_PLAYER_NO_CAP_RESOURCE: (t) => {
    if (t.other !== t.seat || !t.resource || t.view.resourceHeld(t.seat, t.resource) <= 1) return 0;
    let best = 0;
    for (const c of t.view.cities(t.seat)) {
      best = Math.max(best, valueBetween(amenityTurn(t, t.view.cityAmenity(t.seat, c.id)), t.start, t.horizon, t.rate));
    }
    return whole(best);
  },
  // 0x6bc050 (the Luxury Policy, B): with a luxury named (+0x4c) the player
  // holds none of (0x4a93c0), per other major not allied its copies x 100
  // at war (0x469cd0), 60 where the player denounced it (0x3da8e0), else
  // 25, raw
  EFFECT_ADJUST_PLAYER_BAN_RESOURCE: (t) => {
    if (!t.resource || t.view.resourceHeld(t.seat, t.resource) !== 0) return 0;
    let v = 0;
    for (const m of t.view.majors()) {
      if (m === t.seat || t.view.allied(t.seat, m)) continue;
      const w = t.view.atWar(t.seat, m) ? 100 : t.view.denouncing(t.seat, m) ? 60 : 25;
      v += t.view.resourceHeld(m, t.resource) * w;
    }
    return v;
  },
  // 0x6b47f0 (Mercenary Companies; Amount +0xc, YieldType +8 else the hint
  // +0x64): a buff (Amount > 0) on the player's own subject — half the
  // yield the player makes a turn (0x4bf7c0) x the percent, at its weight,
  // from the start to the horizon; a debuff on another major's subject —
  // that major's yield x the percent at the player's weight, x 2.0 at war
  // where the player's military strength is the greater, 0.25 at war
  // otherwise, 0.33 at peace, from the start to the horizon, the greatest
  // over the subjects (`SETS`)
  EFFECT_ADJUST_PLAYER_BUFF_UNIT_PRODUCTION_YIELD: (t, args) => {
    const y = args.YieldType ?? t.yieldType;
    const a = (Number(args.Amount ?? 0) | 0) * FX;
    if (!y || t.other === undefined) return 0;
    if (a > 0) {
      if (t.other !== t.seat) return 0;
      const v = yieldValue(t.view, t.seat, pct(fxOf(t.view.playerYield(t.seat, y)), a), y);
      return whole(valueBetween(fmul(v, fxConst(0.5)), t.start, t.horizon, t.rate));
    }
    if (a >= 0 || t.other === t.seat) return 0;
    const v = yieldValue(t.view, t.seat, pct(fxOf(t.view.playerYield(t.other, y)), a), y);
    const f = t.view.atWar(t.seat, t.other)
      ? (t.view.militaryStrength(t.seat) > t.view.militaryStrength(t.other) ? 2 * FX : fxConst(0.25)) : fxConst(Math.fround(0.33));
    return whole(valueBetween(fmul(v, f), t.start, t.horizon, t.rate));
  },
  // 0x6a2270 (Patronage, A): on the player's own subject, the class named
  // (+0x6c): 0.01 x its points a turn x the Amount, as Gold at its weight,
  // from the start to the horizon
  EFFECT_ADJUST_GREAT_PERSON_POINTS_PERCENT: (t, args) => {
    if (t.other !== t.seat || !t.gpClass) return 0;
    const ppt = fmul(fxConst(Math.fround(0.01)), fxOf(t.view.greatPersonPointsPerTurn(t.seat, t.gpClass)));
    const v = yieldValue(t.view, t.seat, fmul(ppt, (Number(args.Amount ?? 0) | 0) * FX), 'YIELD_GOLD');
    return whole(valueBetween(v, t.start, t.horizon, t.rate));
  },
  // 0x6b0050 (Patronage, B): on the player's own subject, the class named:
  // the points a turn of every other major not allied less twice the
  // player's own, as Gold at its weight, from the start to the horizon
  EFFECT_ADJUST_NO_GREAT_PERSON_POINTS: (t) => {
    if (t.other !== t.seat || !t.gpClass) return 0;
    let sum = 0;
    for (const m of t.view.majors()) {
      if (m === t.seat) sum -= 2 * fxOf(t.view.greatPersonPointsPerTurn(m, t.gpClass));
      else if (!t.view.allied(t.seat, m)) sum += fxOf(t.view.greatPersonPointsPerTurn(m, t.gpClass));
    }
    return whole(valueBetween(yieldValue(t.view, t.seat, sum, 'YIELD_GOLD'), t.start, t.horizon, t.rate));
  },
  // 0x6a3870 (World Ideology; Amount +8, GovernmentSlotType +0xc): with a
  // government named (+0x28) the player is in, |Amount| x the policy AI's
  // best card for the slot — on its own subject for a slot gained, on
  // another major's for a slot lost; a slot lost on its own subject sets
  // the total to 0 (`SETS`)
  EFFECT_ADJUST_GOVERNMENT_SLOTS: (t, args) => {
    const a = Number(args.Amount ?? 0) | 0;
    if (!t.government || t.other === undefined || t.view.government(t.seat) !== t.government) return 0;
    if (a < 0 && t.other === t.seat) return Number.NaN;
    if ((a > 0) !== (t.other === t.seat)) return 0;
    const best = t.bestPolicy?.(args.GovernmentSlotType ?? '') ?? null;
    return Math.abs(a) * ((best ?? 0) >> 8);
  },
  // 0x6c6d60 (the Diplomatic Victory resolution; Amount +8): P the
  // player's worth of a victory point (PSEUDOYIELD_DIPLOMATIC_VICTORY_POINT
  // 1.0), W the points a victory takes. On its own target (+0x40) gaining
  // points: Amount x 2P, plus W x P / max(1, W - its points - Amount)^2; on
  // another's losing them: |Amount| x P, plus W x P / r^2, r = max(1, W -
  // its points + Amount), one less (at least 1) per running competition it
  // leads (0x25d5f0)
  EFFECT_ADJUST_PLAYER_DIPLOMATIC_VICTORY_POINTS: (t, args) => {
    const a = Number(args.Amount ?? 0) | 0;
    if (t.other === undefined) return 0;
    const p = pseudoYieldValue(t.view, t.seat, FX, 'PSEUDOYIELD_DIPLOMATIC_VICTORY_POINT');
    const w = t.view.diplomaticVictoryPoints;
    if (t.other === t.seat) {
      if (a <= 0) return 0;
      const rem = Math.max(1, w - t.view.diplomaticPoints(t.seat) - a);
      return whole(a * 2 * p) + whole(fdiv(w * p, rem * rem * FX));
    }
    if (a >= 0) return 0;
    let rem = Math.max(1, w - t.view.diplomaticPoints(t.other) + a);
    for (let k = t.view.competitionLeads(t.other); k > 0; k--) rem = Math.max(1, rem - 1);
    return whole(-a * p) + whole(fdiv(w * p, rem * rem * FX));
  },
  // 0x6c3bc0 (Public Relations; Amount +8): on its own target (+0x40) with
  // more grievances: the grievances the player holds against every alive
  // major x Amount / 100; on another's with fewer: that one's against the
  // player x Amount / 100; as PSEUDOYIELD_DIPLOMATIC_GRIEVANCE at its weight,
  // discounted from the start
  EFFECT_ADJUST_PLAYER_GRIEVANCE_GENERATION: (t, args) => {
    const a = Number(args.Amount ?? 0) | 0;
    if (t.other === undefined) return 0;
    let g = 0;
    if (t.other === t.seat) {
      if (a <= 0) return 0;
      for (const m of t.view.majors()) g += t.view.grievances(t.seat, m) * FX;
      if (g <= 0) return 0;
    } else {
      if (a >= 0) return 0;
      g = t.view.grievances(t.other, t.seat) * FX;
    }
    return whole(discounted(pseudoYieldValue(t.view, t.seat, pct(g, a * FX), 'PSEUDOYIELD_DIPLOMATIC_GRIEVANCE'), t.rate, t.start));
  },
  // 0x6b10b0 (Public Works; Amount +8 as fx(Amount x 0.01), ProjectType +0xc
  // else the hint +0x68): a boost — the subject city's Production x it,
  // where the city may advance the project and makes Production, at the
  // player's weight, from the start to the horizon; a cut — the most
  // Production another major's city able to advance it makes, over the
  // player's cities (at least 1), negated, x it, likewise
  EFFECT_ADJUST_PROJECT_PRODUCTION: (t, args, s) => {
    const project = args.ProjectType ?? t.project;
    if (!project) return 0;
    const a = pctOf(args);
    if (a > 0) {
      if (s.kind !== 'city' || !t.view.cityCanProject(s.seat, s.id, project)) return 0;
      const prod = fxOf(t.view.cityYield(s.seat, s.id, 'YIELD_PRODUCTION'));
      if (prod <= 0) return 0;
      return whole(valueBetween(yieldValue(t.view, t.seat, fmul(prod, a), 'YIELD_PRODUCTION'), t.start, t.horizon, t.rate));
    }
    let most = 0;
    for (const m of t.view.majors()) {
      if (m === t.seat) continue;
      for (const c of t.view.cities(m)) {
        if (!t.view.cityCanProject(m, c.id, project)) continue;
        most = Math.max(most, fxOf(t.view.cityYield(m, c.id, 'YIELD_PRODUCTION')));
      }
    }
    const per = fdiv(-most, Math.max(1, t.view.cities(t.seat).length) * FX);
    return whole(valueBetween(yieldValue(t.view, t.seat, fmul(per, a), 'YIELD_PRODUCTION'), t.start, t.horizon, t.rate));
  },
  // 0x6bb020 (BuildingType +8, DistrictType +0xc, ProjectType +0x10,
  // BanDistrictBuildings +0x14): on the player's own subject, per city a
  // count — the building held +1 else -1; the project's district held -1
  // else +1; the district held +1 else -1, or with the district's buildings
  // banned held 2 x its buildings - 3 else -3 — at least 0, x 50, SETTING
  // the total (`SETS`); on another's subject, or naming none of the three,
  // it sets 0
  EFFECT_ADJUST_PLAYER_BAN_CITY_PRODUCTION: (t, args) => {
    if (t.other !== t.seat) return 0;
    let n = 0;
    for (const c of t.view.cities(t.seat)) {
      if (args.BuildingType) n += t.view.cityHasBuilding(t.seat, c.id, args.BuildingType) ? 1 : -1;
      if (args.DistrictType) {
        const has = t.view.cityHasDistrict(t.seat, c.id, args.DistrictType);
        if (!flag(args, 'BanDistrictBuildings', false)) n += has ? 1 : -1;
        else n += has ? 2 * t.view.districtBuildingYields(t.seat, args.DistrictType, 'YIELD_PRODUCTION').length - 3 : -3;
      }
    }
    return Math.max(n, 0) * 50;
  },
  // 0x6c1a80 (its parser 0x6c1760: BuildingType +8, DistrictType +0xc,
  // fx(Amount x 0.01f) +0x10; the building's PrereqTech +0x18, PrereqCivic
  // +0x1c, PrereqDistrict +0x20, RequiresPlacement +0x14, its world copies
  // full +0x15; a district's PrereqTech / PrereqCivic): a city subject.
  // Lacking the building: none where its world copies are full, its
  // district is not the city's, or it needs a placement (CityBuildAI
  // 0x5d17b0, not read here); R the later of its tech's and civic's turns,
  // none where start + R reaches the horizon; T0 / T1 its turns at the
  // Production without and with the Amount; the Production a turn they save,
  // (T0 - T1) x Cost / max(1, T0 x T1), bare Production, from start + R to
  // start + R + T1 (at most the horizon). Holding it (or naming none): the
  // district the same way (none where the city holds it), T0 / T1 each at
  // least 1, the player's district cost
  EFFECT_ADJUST_BUILDING_PRODUCTION: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const extra = pctOf(args);
    const b = args.BuildingType ? AI_BUILDINGS[AI_BUILDING_INDEX.get(args.BuildingType) ?? -1] : undefined;
    let tech: string | null;
    let civic: string | null;
    let type: string;
    let cost: number;
    let floor: number;
    // the district's turns (0x17b5a0) take the Amount as a multiplier of
    // the Production (fx_mul_assign), not a percent added: T1 above T0, the
    // value below 0 — no Veterancy line in any recording's AI_GovtPolicies.csv
    let scale = false;
    if (b && !t.view.cityHasBuilding(s.seat, s.id, b.type)) {
      if (b.maxWorldInstances > 0 && t.view.buildingsBuilt(b.type) >= b.maxWorldInstances) return 0;
      if (b.district && b.district !== 'DISTRICT_CITY_CENTER' && !t.view.cityHasDistrict(s.seat, s.id, b.district)) return 0;
      if (b.placement) return 0;
      ({ tech, civic, type, cost } = b);
      floor = -Infinity;
    } else {
      const d = args.DistrictType ? AI_DISTRICTS.find((x) => x.type === args.DistrictType) : undefined;
      if (!d || t.view.cityHasDistrict(s.seat, s.id, d.type)) return 0;
      ({ tech, civic, type } = d);
      cost = t.view.districtCost(s.seat, d.type);
      floor = 1;
      scale = true;
    }
    const r = Math.max(t.view.researchTurns(s.seat, tech), t.view.researchTurns(s.seat, civic));
    if (t.start + r >= t.horizon) return 0;
    const t0 = Math.max(floor, t.view.cityItemTurns(s.seat, s.id, type, 0, scale));
    const t1 = Math.max(floor, t.view.cityItemTurns(s.seat, s.id, type, extra, scale));
    const end = Math.min(t.start + t1 + r, t.horizon);
    const v = fdiv(Math.floor(((t0 - t1) * FX * cost * FX) / FX), Math.max(1, t1 * t0) * FX);
    return whole(yieldValue(null, null, presentValue(v, t.rate, end) - presentValue(v, t.rate, t.start + r), 'YIELD_PRODUCTION'));
  },
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
    const have = Math.min(Math.floor(t.view.cityYield(s.seat, s.id, type)), 100);
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
  // 0x6afcd0: a player that may give Influence (0x449940, its civilization
  // level's flag: a full civilization's; a city-state's DIPLOMATIC_LEAGUE
  // never logs a score, runs/h1_duelw1117-1128); the game's
  // city-states (the list at Game +0x3f8 +0x1650) x the player's points a
  // token (Player_Influence +0x270: the government's InfluencePointsThreshold
  // at the game speed, 0x44eaa0) x the amount, as PSEUDOYIELD_INFLUENCE,
  // discounted from the start (0x7a1240)
  EFFECT_ADJUST_DUPLICATE_FIRST_INFLUENCE_TOKEN: (t, args) => {
    if (!t.view.fullCiv(t.seat)) return 0;
    const gov = t.view.government(t.seat);
    const threshold = gov ? AI_GOVERNMENT_INFLUENCE_THRESHOLD[gov] : undefined;
    if (threshold === undefined) return 0;
    const token = Math.trunc((threshold * t.view.costMultiplierPct) / 100);
    const v = pseudoYieldValue(t.view, t.seat, amountOf(args) * t.view.cityStates * token, 'PSEUDOYIELD_INFLUENCE');
    return whole(discounted(v, t.rate, t.start));
  },
  // 0x6a3780: the amount x the player's points a token (Player_Influence
  // +0x270: its government's InfluencePointsThreshold at the game speed, a
  // player in none Chiefdom's — every city-state's 50 at the online speed,
  // runs/h1_duelv1127's envoy civics; the Free Cities' none, their
  // Mysticism logged the token's whole 13.0 below it at 20 turns,
  // runs/h1_duelw1121 t32-t100), as PSEUDOYIELD_INFLUENCE, discounted from
  // the start (0x7a1240)
  EFFECT_GRANT_INFLUENCE_TOKEN: (t, args) => {
    if (t.seat === FREE_SEAT) return 0;
    const threshold = AI_GOVERNMENT_INFLUENCE_THRESHOLD[t.view.government(t.seat) ?? 'GOVERNMENT_CHIEFDOM'] ?? 0;
    const token = Math.trunc((threshold * t.view.costMultiplierPct) / 100);
    const v = pseudoYieldValue(t.view, t.seat, amountOf(args) * token, 'PSEUDOYIELD_INFLUENCE');
    return whole(discounted(v, t.rate, t.start));
  },
  // 0x6aa780: PSEUDOYIELD_UNIT_SPY of the amount, from the start to the
  // horizon (0x7a2140)
  EFFECT_GRANT_SPY: (t, args) => whole(valueBetween(pseudoYieldValue(t.view, t.seat, amountOf(args), 'PSEUDOYIELD_UNIT_SPY'), t.start, t.horizon, t.rate)),
  // 0x6c4060: with Enable, the player's strength over every domain
  // (PlayerStats 0x4bd0d0(-1)) a turn, bare, from the start to the horizon
  EFFECT_GRANT_COMBAT_ADJACENCY: (t, args) =>
    args.Enable === 'true' ? whole(valueBetween(t.view.domainStrength(t.seat) * FX, t.start, t.horizon, t.rate)) : 0,
  // 0x6ae510: PSEUDOYIELD_INFLUENCE, PV(horizon) - PV(start)
  // 0x6b63a0: per city-state of the game's list (game +0x3f8 +0x1650) whose
  // suzerain (0x44c850) is not the player, 10, raw — whatever the subject
  // (runs/h1_duelu1117 / 1121 city-states' Gunboat Diplomacy 30 above its
  // Influence's 29 over three city-states)
  EFFECT_ADJUST_PLAYER_OPEN_BORDERS_FROM_INFLUENCE: (t) => 10 * (t.view.cityStateCount() - t.view.tributaries(t.seat)),
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
    if (!t.view.cityHasBuilding(s.seat, s.id, args.BuildingType ?? '')) v = fmul(v, fxConst(0.5));
    return whole(span(t, v));
  },
  // 0x6a1b80: a city subject holding a district of the type (0x1ae530);
  // per building of the district in the player's version, its yield of the
  // kind x the percent x 0.01 (the parser's fx), at the player's weight,
  // valued from the start to the horizon, halved where the city lacks it,
  // each building's whole part added
  EFFECT_ADJUST_BUILDING_YIELD_MODIFIERS_FOR_DISTRICT: (t, args, s) => {
    if (s.kind !== 'city' || !t.view.cityHasDistrict(s.seat, s.id, args.DistrictType ?? '')) return 0;
    const type = args.YieldType ?? '';
    const pct = fxConst(Math.fround((Number(args.Amount ?? 0) | 0) * Math.fround(0.01)));
    let sum = 0;
    for (const b of t.view.districtBuildingYields(t.seat, args.DistrictType ?? '', type)) {
      let v = valueBetween(yieldValue(t.view, t.seat, fmul(pct, b.amount * FX), type), t.start, t.horizon, t.rate);
      if (!t.view.cityHasBuilding(s.seat, s.id, b.building)) v = fmul(v, fxConst(0.5));
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
  EFFECT_ADJUST_TRADE_ROUTE_YIELD_TO_OTHERS: (t, args) =>
    whole(span(t, yieldValue(t.view, t.seat, t.view.tradeRouteCapacity(t.seat) * amountOf(args), args.YieldType ?? ''))),
  // 0x6b6460: a subject and the context's city (+0x70); Amount x the city's
  // citizens (+0x588) of the yield, unweighted (no player passed),
  // PV(horizon) - PV(start)
  EFFECT_ADJUST_CITY_YIELD_PER_POPULATION: (t, args) => {
    const c = ownerCity(t);
    if (!c || c.kind !== 'city') return 0;
    return whole(span(t, yieldValue(null, null, t.view.cityCitizens(c.seat, c.id) * amountOf(args), args.YieldType ?? '')));
  },
  // 0x6b8150: as the per-citizen yield, in Gold (@0xf2f97c)
  EFFECT_ADJUST_CITY_GOLD_FROM_CITIZENS: (t, args) => {
    const c = ownerCity(t);
    if (!c || c.kind !== 'city') return 0;
    return whole(span(t, yieldValue(null, null, t.view.cityCitizens(c.seat, c.id) * amountOf(args), 'YIELD_GOLD')));
  },
  // 0x6b4e80: a subject and the context's city; Amount x the city's
  // finished specialty districts (0x1ae8f0: not the centre, complete,
  // counting toward the limit, pillaged or not) of the yield, unweighted,
  // PV(horizon) - PV(start)
  EFFECT_ADJUST_CITY_YIELD_PER_DISTRICT: (t, args) => {
    const c = ownerCity(t);
    if (!c || c.kind !== 'city') return 0;
    return whole(span(t, yieldValue(null, null, t.view.citySpecialtyDistricts(c.seat, c.id) * amountOf(args), args.YieldType ?? '')));
  },
  // 0x6c2dc0: a subject and the context's city whose centre strikes
  // (0x249ee0 above 0) and stands (0x24ae80 above 0): Amount, raw
  EFFECT_ADJUST_CITY_INNER_DEFENSE: (t, args) => {
    const c = ownerCity(t);
    if (!c || c.kind !== 'city' || !t.view.cityStrikes(c.seat, c.id)) return 0;
    return Number(args.Amount ?? 0) | 0;
  },
  // 0x6be2d0: a subject and the context's city; the space race's worth to
  // its owner (PSEUDOYIELD_SPACE_RACE 1.0 at its weight); per SpaceRace
  // project, the owner having completed it that worth whole, else, where
  // the city builds it within the horizon at the Production lifted by the
  // Amount — whole, read as the raw of a 24.8 fraction (0x17b890 adds it to
  // 1.0: 30 is +11.7%) —, the worth discounted at those turns less at the
  // turns without it
  EFFECT_ADJUST_SPACE_RACE_PROJECTS_PRODUCTION: (t, args) => {
    const c = ownerCity(t);
    if (!c || c.kind !== 'city') return 0;
    const v = pseudoYieldValue(t.view, c.seat, FX, 'PSEUDOYIELD_SPACE_RACE');
    let sum = 0;
    for (const p of AI_SPACE_RACE_PROJECTS) {
      if (t.view.projectCompletions(c.seat, p) !== 0) {
        sum += whole(v);
        continue;
      }
      const t0 = t.view.projectTurns(c.seat, c.id, p, 0);
      const t1 = t.view.projectTurns(c.seat, c.id, p, Number(args.Amount ?? 0) | 0);
      if (t1 < t.horizon) sum += whole(discounted(v, t.rate, t1) - discounted(v, t.rate, t0));
    }
    return sum;
  },
  // 0x6b2850: a subject, the context's city (+0x70) and a player; the
  // city's owner's envoys' worth (0x7a46c0) at Amount
  EFFECT_GOVERNOR_ADJUST_CITY_TOKENS_GRANTED: (t, args) => {
    const c = ownerCity(t);
    if (!c || c.kind !== 'city') return 0;
    return whole(envoyValue(t, c.seat, Number(args.Amount ?? 0) | 0));
  },
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
  // 0x6bf850 (Professional Army, Force Modernization; Amount +8 as
  // fx(Amount x 0.01f)): per unit of the player whose upgrade it may take
  // (0x58fff0, the visible test), the Amount x the upgrade's Gold (0x590520:
  // a city-state's at its own 100% discount, MINOR_CIV_GOLD_MILITARY_UPGRADE)
  // as Gold at the player's weight, x 0.75 (@d1a188), each whole —
  // runs/h1_duelw1121 Hunza t76 1.0 for its one Horseman, Ayutthaya t78 3.0
  // for two Warriors and a Swordsman short of their Iron
  EFFECT_ADJUST_PLAYER_UNIT_UPGRADE_DISCOUNT_PERCENT: (t, args) => {
    let sum = 0;
    for (const g of t.view.unitUpgradeGolds(t.seat)) {
      const v = yieldValue(t.view, t.seat, fmul(pctOf(args), g * FX), 'YIELD_GOLD');
      sum += whole(fmul(v, fxConst(0.75)));
    }
    return sum;
  },
  // 0x6c5700 (Amount +8 as fx(Amount x 0.01f), BonusType +0xc): per
  // government bonus type, its sum whole. GOVERNMENTBONUS_ENVOYS
  // (0xe96ca959): the Amount x the player's Influence Points a turn
  // (0x44c6a0) as PSEUDOYIELD_INFLUENCE at its weight, from the start to the
  // horizon (runs/h1_duely1121 every city-state's Divine Right 5.0 above
  // ours: Monarchy's 50% of Chiefdom's one point). WONDER_CONSTRUCTION
  // (0x5953bf98): the most Production of its cities x PSEUDOYIELD_WONDER of
  // the Amount, likewise. COMBAT_EXPERIENCE (0xc819e0a3): its units x
  // PSEUDOYIELD_UNIT_COMBAT of the Amount / 10.0, likewise, then GREAT_PEOPLE's
  // term (0xf8705d00, which the branch runs on into): per class its points a
  // turn x the Amount as the class's pseudo-yield, likewise — a city-state's
  // none (its player list holds no city), the Free Cities' not read.
  // OVERALL_PRODUCTION (0xc1a005d2): its cities' Production x the Amount at
  // its weight, likewise; UNIT_PRODUCTION (0x3d5ff1a2): the cities' with a
  // unit at their queue's head (0x179860), x the Amount x PSEUDOYIELD_UNIT_
  // COMBAT of 1.0 (at most 2.0), at most 75.0, likewise. GOLD_PURCHASES
  // (0x7530bd65): 0.5 x the treasury x the Amount as Gold at its weight,
  // discounted from the start, and 0.5 x its gross Gold a turn (0x4e0bf0)
  // x the Amount, likewise; the Free Cities' not read. FAITH_PURCHASES
  // (0xc25143f9): none for a player whose religion entry (0x4979f0) holds
  // none — a city-state's; with one, and DISTRICT_PROJECTS (0xbcfe99b8), not
  // read
  EFFECT_ADJUST_FLAT_BONUS: (t, args) => {
    const a = pctOf(args);
    let sum = 0;
    switch (args.BonusType) {
      case 'GOVERNMENTBONUS_ENVOYS': {
        const v = pseudoYieldValue(t.view, t.seat, fmul(a, t.view.influencePointsPerTurn(t.seat) * FX), 'PSEUDOYIELD_INFLUENCE');
        sum = valueBetween(v, t.start, t.horizon, t.rate);
        break;
      }
      case 'GOVERNMENTBONUS_WONDER_CONSTRUCTION': {
        let best = 0;
        for (const c of t.view.cities(t.seat)) best = Math.max(best, fxOf(t.view.cityYield(t.seat, c.id, 'YIELD_PRODUCTION')));
        const pv = pseudoYieldValue(t.view, t.seat, a, 'PSEUDOYIELD_WONDER');
        sum = valueBetween(fmul(best, pv), t.start, t.horizon, t.rate);
        break;
      }
      case 'GOVERNMENTBONUS_OVERALL_PRODUCTION':
      case 'GOVERNMENTBONUS_UNIT_PRODUCTION': {
        if (t.seat === FREE_SEAT) return 0;
        const unitOnly = args.BonusType === 'GOVERNMENTBONUS_UNIT_PRODUCTION';
        let prod = 0;
        for (const c of t.view.cities(t.seat)) {
          if (!unitOnly || t.view.cityTrainingUnit(t.seat, c.id)) prod += fxOf(t.view.cityYield(t.seat, c.id, 'YIELD_PRODUCTION'));
        }
        let x = fmul(a, prod);
        if (unitOnly) {
          const pv = Math.min(pseudoYieldValue(t.view, t.seat, FX, 'PSEUDOYIELD_UNIT_COMBAT'), 2 * FX);
          x = Math.min(fmul(x, pv), 75 * FX);
        }
        sum = valueBetween(yieldValue(t.view, t.seat, x, 'YIELD_PRODUCTION'), t.start, t.horizon, t.rate);
        break;
      }
      case 'GOVERNMENTBONUS_GOLD_PURCHASES': {
        if (t.seat === FREE_SEAT) return 0;
        const half = fxConst(0.5);
        const banked = yieldValue(t.view, t.seat, fmul(fmul(fxOf(t.view.treasury(t.seat)), half), a), 'YIELD_GOLD');
        const income = yieldValue(t.view, t.seat, fmul(fmul(fxOf(t.view.grossGoldYield(t.seat)), half), a), 'YIELD_GOLD');
        sum = discounted(banked, t.rate, t.start) + valueBetween(income, t.start, t.horizon, t.rate);
        break;
      }
      case 'GOVERNMENTBONUS_COMBAT_EXPERIENCE':
      case 'GOVERNMENTBONUS_GREAT_PEOPLE': {
        if (args.BonusType === 'GOVERNMENTBONUS_COMBAT_EXPERIENCE') {
          const pv = pseudoYieldValue(t.view, t.seat, a, 'PSEUDOYIELD_UNIT_COMBAT');
          const x = t.view.playerUnits(t.seat).length * pv;
          sum = valueBetween(fdiv(x, 10 * FX), t.start, t.horizon, t.rate);
        }
        if (t.seat === FREE_SEAT) break;
        for (const cls of AI_GREAT_PERSON_CLASSES) {
          const pseudo = AI_GP_CLASS_PSEUDOYIELD[cls];
          if (!pseudo) continue;
          const v = pseudoYieldValue(t.view, t.seat, fmul(a, fxOf(t.view.greatPersonPointsPerTurn(t.seat, cls))), pseudo);
          sum += valueBetween(v, t.start, t.horizon, t.rate);
        }
        break;
      }
      default:
        return 0;
    }
    return whole(sum);
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
  // Gold): with the context's unit (+0x90), one that fights (Combat,
  // RangedCombat or Bombard above 0), its level (its experience +0x1bc0,
  // +0x10) times it, PV to the horizon (runs/h1_duely1127 Mexico City's
  // Survey 7, 14, 21 over t124-129 for one, two, three recon units of level
  // 1; 1124 Cardiff's After Action Reports 7 for its one level-2 Infantry,
  // t205); with none, a city
  // subject's Production (City::GetYield) times it, from the start to the
  // horizon
  EFFECT_ADJUST_UNIT_EXPERIENCE_MODIFIER: (t, args, s) => {
    const per = yieldValue(null, null, fxConst(Math.fround((Number(args.Amount ?? 0) | 0) * Math.fround(0.01))), 'YIELD_GOLD');
    if (s.kind === 'unit') {
      const row = AI_UNITS[AI_UNIT_INDEX.get(s.type) ?? -1];
      if (!row || Math.max(row.combat, row.rangedCombat, row.bombard) <= 0) return 0;
      return whole(presentValue(fmul(per, s.level * FX), t.rate, t.horizon));
    }
    if (s.kind !== 'city') return 0;
    const production = fxOf(t.view.cityYield(s.seat, s.id, 'YIELD_PRODUCTION'));
    return whole(valueBetween(fmul(per, production), t.start, t.horizon, t.rate));
  },
  // 0x6b76f0 (Amount, YieldType, TerrainType, DistrictType): the plots of
  // the terrain (plot +0x2c, hills their own type)
  EFFECT_TERRAIN_ADJACENCY: (t, args, s) => adjacencyValue(t, args, s, (p) => t.view.plotTerrain(p) === args.TerrainType),
  // 0x6aee30: as the terrain's on the feature (plot +0x3c), where the city
  // AI's plot evaluations hold a plot of it (0x5d2df0) — the city's own
  // plots within its three rings here
  EFFECT_FEATURE_ADJACENCY: (t, args, s) => {
    if (s.kind !== 'city' || !t.view.cityOwnedPlots(s.seat, s.id).some((p) => p.feature === args.FeatureType)) return 0;
    return adjacencyValue(t, args, s, (p) => t.view.plotFeature(p) === args.FeatureType);
  },
  // 0x6abc40: a subject, a player and the context's city (+0x70, none
  // adds nothing); that city's Culture (City::GetYield) x fx(Amount x
  // 0.01), at the player's weight, halved (0x16eb20 by 0.5f), PV(horizon) -
  // PV(start) (runs/h1_duelw1117 t3: China's Land Acquisition 3 on its
  // capital's Culture)
  EFFECT_ADJUST_CITY_CULTURE_BORDER_EXPANSION: (t, args) => {
    const c = ownerCity(t);
    if (!c || c.kind !== 'city') return 0;
    const culture = fxOf(t.view.cityYield(c.seat, c.id, 'YIELD_CULTURE'));
    const v = fmul(yieldValue(t.view, t.seat, fmul(pctOf(args), culture), 'YIELD_CULTURE'), fxConst(0.5));
    return whole(span(t, v));
  },
  // 0x6bc9e0 (EraType +8, UnitPromotionClass +0xc, Amount +0x10): a city
  // subject whose owner's era is the EraType; the owner's strongest unit of
  // the class (0x4bcd30), its era (`unitEraIndex`) no earlier than the
  // EraType: its Combat over the owner's best melee Combat made (at least 1)
  // x the city's Production (CityBuildAI, 0x6c8dd0) over its Cost (at least
  // 1) x Amount / 100, as PSEUDOYIELD_UNIT_COMBAT at the owner's weight, from
  // the start to the horizon
  EFFECT_ADJUST_UNIT_TAG_ERA_PRODUCTION: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const era = eraOf(args.EraType);
    if (era < 0 || t.view.playerEra(s.seat) !== era) return 0;
    const unit = t.view.bestUnitOfClass(s.seat, args.UnitPromotionClass ?? '');
    const row = unit ? AI_UNITS[AI_UNIT_INDEX.get(unit) ?? -1] : undefined;
    if (!row || unitEraIndex(row) + 1 < era + 1) return 0;
    const strength = fdiv(row.combat * FX, Math.max(1, t.view.bestCombatStrength(s.seat)) * FX);
    const production = fdiv(fxOf(t.view.cityYield(s.seat, s.id, 'YIELD_PRODUCTION')), Math.max(1, row.cost) * FX);
    const v = Math.trunc((fmul(production, strength) * (Number(args.Amount ?? 0) | 0)) / 100);
    return whole(valueBetween(pseudoYieldValue(t.view, s.seat, v, 'PSEUDOYIELD_UNIT_COMBAT'), t.start, t.horizon, t.rate));
  },
  // 0x6ac440 (Amount +8): with the context's unit (+0x90) of Movement
  // (0x56e130): fx(Amount) x its type's military AI unit production value
  // (0x79ca90) over its Movement (0x16e940), as Production at the player's
  // weight, from the start to the horizon (0x7a2140)
  EFFECT_ADJUST_UNIT_FRIENDLY_TERRITORY_START_MOVEMENT: (t, args) => {
    const u = t.unit;
    if (!u || u.moves <= 0) return 0;
    const v = fmul((Number(args.Amount ?? 0) | 0) * FX, t.view.unitProductionValue(t.seat, u.type));
    return whole(valueBetween(yieldValue(t.view, t.seat, fdiv(v, u.moves * FX), 'YIELD_PRODUCTION'), t.start, t.horizon, t.rate));
  },
  // 0x6b85d0 (Amount +8): with the context's unit, a naval one (+0x650 0)
  // of Movement: Amount x (its current cost, 0x4f2b20, x 0.5f) over its
  // Movement in float, as Production at the player's weight, discounted to
  // the start (0x7a1240)
  EFFECT_ADJUST_UNIT_SEA_MOVEMENT: (t, args) => {
    const u = t.unit;
    if (!u || u.moves <= 0) return 0;
    const row = AI_UNITS[AI_UNIT_INDEX.get(u.type) ?? -1];
    if (!row || row.domain !== 'DOMAIN_SEA') return 0;
    const half = Math.fround(Math.fround(t.view.unitCost(t.seat, u.type)) * Math.fround(0.5));
    const x = Math.fround(Math.fround(Math.fround(Number(args.Amount ?? 0) | 0) * half) / Math.fround(u.moves));
    return whole(discounted(yieldValue(t.view, t.seat, fxConst(x), 'YIELD_PRODUCTION'), t.rate, t.start));
  },
  // 0x6bef40 (Amount +8 as its parser 0x6bedb0 stores it,
  // fx(expf(Amount x COMBAT_POWER_SCALING))): a unit subject on a plot that
  // fights (0x209dd0: Combat, RangedCombat or Bombard above 0), where the
  // barbarians' strength the player's knowledge base holds there (0x5eb0f0
  // over the barbarian players, age at most 10: the unit's area, or no
  // region) exceeds its own: the Amount from the start to the horizon
  EFFECT_ADJUST_UNIT_BARBARIAN_COMBAT: (t, args, s) => {
    if (s.kind !== 'unit' || s.plot < 0) return 0;
    const row = AI_UNITS[AI_UNIT_INDEX.get(s.type) ?? -1];
    if (!row || Math.max(row.combat, row.rangedCombat, row.bombard) <= 0) return 0;
    const own = t.view.knownStrength(t.seat, t.seat, s.plot, KNOWN_AGE);
    let barb = 0;
    for (const b of t.view.barbarianSeats()) barb += t.view.knownStrength(t.seat, b, s.plot, KNOWN_AGE);
    if (own >= barb) return 0;
    const a = Math.fround(Math.exp(Math.fround((Number(args.Amount ?? 0) | 0) * Math.fround(COMBAT_POWER_SCALING))));
    return whole(valueBetween(fxConst(a), t.start, t.horizon, t.rate));
  },
  // 0x6b2350 (UnitType +8, Amount +0x10 as its parser 0x6b1d00 stores it,
  // fx(Amount x 0.01f)): per city of the player (the context's city alone
  // where it has one), the Amount x its Production (CityBuildAI +0x1008) x
  // its expected count of the unit (0x5d4750), bare Production, from the
  // start to the start plus its train turns at the Production times 1 + the
  // Amount (0x17bb40), at most the horizon
  EFFECT_ADJUST_UNIT_PRODUCTION: (t, args) => {
    const unit = args.UnitType;
    if (!unit) return 0;
    const a = pctOf(args);
    const cities = t.owner ? [{ seat: t.owner.seat ?? t.seat, id: t.owner.cityId }] : t.view.cities(t.seat).map((c) => ({ seat: t.seat, id: c.id }));
    let sum = 0;
    for (const c of cities) {
      const end = Math.min(t.start + t.view.cityItemTurns(c.seat, c.id, unit, a), t.horizon);
      const per = Math.floor((fxOf(t.view.cityYield(c.seat, c.id, 'YIELD_PRODUCTION')) * t.view.cityUnitExpected(c.seat, c.id, unit)) / FX);
      const v = Math.floor((a * per) / FX);
      sum += whole(yieldValue(null, null, presentValue(v, t.rate, end) - presentValue(v, t.rate, t.start), 'YIELD_PRODUCTION'));
    }
    return sum;
  },
  // 0x6b8930 (Amount +8, ResourceType +0xc): with the player, the named
  // resource, else every accumulating one: its stock less its reservations
  // (0x4aa790, ownership 0) x Amount through the resource value (0x7a21e0)
  // from the start to the horizon, each whole
  EFFECT_ADJUST_PLAYER_RESOURCE_ACCUMULATION_MODIFIER: (t, args) => {
    const a = Number(args.Amount ?? 0) | 0;
    const list = args.ResourceType ? [args.ResourceType] : ACCUMULATING;
    let sum = 0;
    for (const res of list) sum += whole(t.view.resourceValueOf(t.seat, res, t.view.resourceStockFree(t.seat, res) * a, t.start, t.horizon));
    return sum;
  },
  // 0x6c4650: a city subject whose centre's outer defence stands (its
  // damage below its maximum, 0x24ae50 / 0x24b290 on 0x6da56a3d): Amount, raw
  EFFECT_ADJUST_CITY_OUTER_DEFENSE: (t, args, s) =>
    s.kind === 'city' && t.view.cityOuterStands(s.seat, s.id) ? Number(args.Amount ?? 0) | 0 : 0,
  // 0x6a69c0: a city subject whose centre's strike (0x249ee0) has a whole
  // part above 0: that whole part x Amount / 100, truncated, raw
  EFFECT_ADJUST_CITY_RANGED_STRIKE: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const strike = t.view.cityStrike(s.seat, s.id);
    return strike > 0 ? Math.trunc((strike * (Number(args.Amount ?? 0) | 0)) / 100) : 0;
  },
  // 0x6b45a0: a city subject (the context's city, +0x70, the walk sets it);
  // the Amount's Amenities more in it (0x79f7c0) from the start to the
  // horizon (0x7a2140)
  EFFECT_ADJUST_POLICY_AMENITY: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const v = amenityTurn(t, t.view.cityAmenity(s.seat, s.id), Number(args.Amount ?? 0) | 0);
    return whole(valueBetween(v, t.start, t.horizon, t.rate));
  },
  // 0x6b5eb0: a city subject; one Housing more where the Amount is above 0,
  // none else (`setg`: the Amount itself is not passed), at its population,
  // from the start to the horizon (0x7a3d70 on its CityBuildAI's growth
  // forecast)
  EFFECT_ADJUST_POLICY_HOUSING: (t, args, s) =>
    s.kind === 'city' ? whole(t.view.cityHousingValue(s.seat, s.id, (Number(args.Amount ?? 0) | 0) > 0 ? 1 : 0, t.start, t.horizon)) : 0,
  // 0x6beb00: a city subject's Food surplus (its growth object's 0x1b5620),
  // with none 2.0, x fx(Amount x 0.01), as bare Food from the start to the
  // horizon (0x7a2140)
  EFFECT_ADJUST_CITY_GROWTH: (t, args, s) => {
    const food = s.kind === 'city' ? t.view.cityFoodSurplus(s.seat, s.id) : 2 * FX;
    return whole(valueBetween(yieldValue(null, null, fmul(food, pctOf(args)), 'YIELD_FOOD'), t.start, t.horizon, t.rate));
  },
  // 0x6b5d50 (Amount, StartEra, EndEra): a city subject while the player's
  // era lies in the window (an end of -1 none); the city's Production x
  // fx(Amount x 0.01), at the player's weight, from the start to the
  // horizon, halved (sar 9)
  EFFECT_ADJUST_CITY_ALL_MILITARY_UNITS_PRODUCTION: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    const era = t.view.playerEra(t.seat);
    const from = eraOf(args.StartEra);
    const to = eraOf(args.EndEra);
    if ((era < from && from !== -1) || (era > to && to !== -1)) return 0;
    const production = fxOf(t.view.cityYield(s.seat, s.id, 'YIELD_PRODUCTION'));
    const v = yieldValue(t.view, t.seat, fmul(production, pctOf(args)), 'YIELD_PRODUCTION');
    return valueBetween(v, t.start, t.horizon, t.rate) >> 9;
  },
  // 0x6bdd40: with a player, the camps its knowledge base holds (at most 5)
  // x Amount, Faith at its weight, discounted from the start (0x7a1240)
  EFFECT_ADJUST_PLAYER_FAITH_FROM_DISPERSAL: (t, args) =>
    whole(discounted(yieldValue(t.view, t.seat, campsKnown(t) * amountOf(args), 'YIELD_FAITH'), t.rate, t.start)),
  // 0x6a6d20: with a player, the camps (at most 5) x Amount / 10 rounded up,
  // as PSEUDOYIELD_UNIT_COMBAT (@0xf2e254) at its weight, discounted from the
  // start
  EFFECT_ADJUST_PLAYER_HEALING_FROM_DISPERSAL: (t, args) => {
    const per = Math.ceil((Number(args.Amount ?? 0) | 0) / 10);
    return whole(discounted(pseudoYieldValue(t.view, t.seat, campsKnown(t) * per * FX, 'PSEUDOYIELD_UNIT_COMBAT'), t.rate, t.start));
  },
  // 0x6a4680 (GreatPersonClassType +8, its pseudo-yield +0xc, Amount +0x10
  // kept whole): the Amount read raw as the class's pseudo-yield at the
  // player's weight, from the start to the horizon
  EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS: (t, args) => {
    const pseudo = AI_GP_CLASS_PSEUDOYIELD[args.GreatPersonClassType ?? ''];
    if (!pseudo) return 0;
    return whole(valueBetween(pseudoYieldValue(t.view, t.seat, Number(args.Amount ?? 0) | 0, pseudo), t.start, t.horizon, t.rate));
  },
  // 0x6abe40 (Amount, UnitType): a city subject; the greater of the unit's
  // cost to the player (0x4f2b20) and its value (0x7b62c0, not read here:
  // the cost stands) x Amount
  EFFECT_GRANT_UNIT_IN_CITY: (t, args, s) => {
    if (s.kind !== 'city') return 0;
    return t.view.unitCost(t.seat, args.UnitType ?? '') * (Number(args.Amount ?? 0) | 0);
  },
};

/** the analyzers that SET the context's total instead of adding to it:
 *  0x6b47f0's debuff keeps the greater, 0x6a3870's slot lost on the
 *  player's own subject sets it to 0 (its analyzer's NaN), 0x6bb020 sets
 *  it to its value */
const SETS: Readonly<Record<string, (acc: number, v: number) => number>> = {
  EFFECT_ADJUST_PLAYER_BUFF_UNIT_PRODUCTION_YIELD: (acc, v) => Math.max(acc, v),
  EFFECT_ADJUST_GOVERNMENT_SLOTS: (acc, v) => (Number.isNaN(v) ? 0 : acc + v),
  EFFECT_ADJUST_PLAYER_BAN_CITY_PRODUCTION: (_acc, v) => v,
};

/** the analyzers' slot 2, which the analysis calls where no subject passed
 *  (the rest are a no-op, 0xbe4aa0) */
const NONE_ANALYZERS: Readonly<Record<string, (t: ValueTerms, args: Readonly<Record<string, string>>) => number>> = {
  // 0x6a4750: half the Amount as the class's pseudo-yield at the player's
  // weight, from the start to the horizon
  EFFECT_ADJUST_DISTRICT_GREAT_PERSON_POINTS: (t, args) => {
    const pseudo = AI_GP_CLASS_PSEUDOYIELD[args.GreatPersonClassType ?? ''];
    if (!pseudo) return 0;
    const amount = fxConst(Math.fround((Number(args.Amount ?? 0) | 0) * 0.5));
    return whole(valueBetween(pseudoYieldValue(t.view, t.seat, amount, pseudo), t.start, t.horizon, t.rate));
  },
};

/** the context a subject leaves for an analysis nested on it (0x142650's
 *  copy): a city subject is the city the nested analysis is of (+0x70), the
 *  empty city leaves it none, a unit subject its unit (+0x90); any
 *  other leaves the city as it stood */
const onSubject = (t: ValueTerms, s: Subject): ValueTerms =>
  s.kind === 'city' ? { ...t, owner: { cityId: s.id, capital: s.capital, seat: s.seat } }
    : s.kind === 'nocity' ? { ...t, owner: undefined }
    : s.kind === 'player' && s.other !== undefined ? { ...t, other: s.other }
    : s.kind === 'unit' ? { ...t, unit: s } : t;

/** One modifier's analysis (0x6cede0): null where it is refused — no
 *  analyzer or collection, or a fourth nested analysis — else the whole
 *  number its subjects leave in the context (+0xc0, cleared as it starts):
 *  each subject (at most 51) its requirement set admits goes to the
 *  analyzer, which adds its whole part, or for EFFECT_ATTACH_MODIFIER
 *  (0x6ab630) sets the total its attached modifier's own analysis on that
 *  subject leaves, where that analysis is not refused; an analyzer that
 *  sets the total (`SETS`) sets it. 0 where its
 *  collection, a requirement evaluator or its effect's analyzer is not read
 *  here. */
function analysis(t: ValueTerms, m: AiModifier, depth: number): number | null {
  if (depth >= 4) return null;
  const subs = subjects(t, m.collection);
  if (m.effect === 'EFFECT_ATTACH_MODIFIER' || m.effect === 'EFFECT_ATTACH_MODIFIER_TO_PLAYERTYPE') {
    const inner = m.attach;
    if (!inner || !subs) return inner ? 0 : null;
    let acc = 0;
    for (const s of subs.slice(0, 51)) {
      const ok = admits(t, m.subjectReqs, s);
      if (ok === null) return 0;
      if (!ok) continue;
      const v = analysis(onSubject(t, s), inner, depth + 1);
      if (v !== null) acc = v;
    }
    return acc;
  }
  // 0x6b5b30, EFFECT_GRANT_ABILITY: per subject, the ability's own
  // modifiers analysed in a copy of the context, their sums added
  const an = m.effect === 'EFFECT_GRANT_ABILITY'
    ? (tt: ValueTerms) => (m.ability ?? []).reduce((a, x) => a + (analysis(tt, x, depth + 1) ?? 0), 0)
    : ANALYZERS[m.effect];
  if (!an || !subs) return 0;
  let sum = 0;
  let passed = false;
  for (const s of subs.slice(0, 51)) {
    const ok = admits(t, m.subjectReqs, s);
    if (ok === null) return 0;
    if (!ok) continue;
    passed = true;
    const ctx = s.kind === 'player' && s.other !== undefined ? { ...t, other: s.other } : s.kind === 'unit' ? { ...t, unit: s }
      : s.kind === 'nocity' ? { ...t, owner: undefined } : t;
    sum = (SETS[m.effect] ?? ((acc: number, v: number) => acc + v))(sum, an(ctx, m.args, s));
  }
  // no subject passed: the analyzer's slot 2
  if (!passed) sum += NONE_ANALYZERS[m.effect]?.(t, m.args) ?? 0;
  return sum;
}

/**
 * THE WORTH OF `tokens` ENVOYS AT A CITY-STATE (0x7a46c0): nothing at war
 * with it; else its modifiers that envoys reach (its leader's and its
 * civilization's trait modifiers with an INFLUENCE_REQUIREMENT, the
 * diplomatic AI's +0x6868 list) summed (0x7a4b20) in a fresh context of the
 * player, the city-state (+0x40) and the envoys added (+0x08), from the
 * context's start to its horizon.
 */
export function envoyValue(t: ValueTerms, minor: number, tokens: number): number {
  if (t.view.atWar(t.seat, minor)) return 0;
  const civ = t.view.minorCivilization(minor);
  const mods = civ ? AI_MINOR_INFLUENCE_MODIFIERS[civ] ?? [] : [];
  return modifiersValue({ view: t.view, seat: t.seat, start: t.start, horizon: t.horizon, rate: t.rate, other: minor, tokens }, mods);
}

/** WHAT THE EVALUATOR READS, by name: the RequirementTypes the registry
 *  names, those with an evaluator here, the EffectTypes with an analyzer
 *  (and the wrappers analysed through their nested modifiers), the analyzers
 *  that set the total, those with a slot 2, the collections walked, the
 *  wonders CITY_HAS_BUILDING passes over — the
 *  GPU twin (gpu/core/sim_cityvalue.py) refuses a read it lacks */
export const AI_MODIFIER_READS = {
  requirements: [...REGISTERED_REQUIREMENTS],
  evaluators: Object.keys(EVALUATORS),
  analyzers: [...Object.keys(ANALYZERS), 'EFFECT_GRANT_ABILITY', 'EFFECT_ATTACH_MODIFIER', 'EFFECT_ATTACH_MODIFIER_TO_PLAYERTYPE'],
  sets: Object.keys(SETS),
  none: Object.keys(NONE_ANALYZERS),
  collections: ['COLLECTION_OWNER', 'COLLECTION_PLAYER_CITIES', 'COLLECTION_PLAYER_CAPITAL_CITY', 'COLLECTION_PLAYER_DISTRICTS',
    'COLLECTION_CITY_DISTRICTS', 'COLLECTION_CITY_TRAINED_UNITS', 'COLLECTION_CITY_PLOT_YIELDS', 'COLLECTION_ALL_CITIES',
    'COLLECTION_ALL_PLAYERS', 'COLLECTION_MAJOR_PLAYERS', 'COLLECTION_PLAYER_UNITS'],
  /** the wonders CITY_HAS_BUILDING never holds outside its own city */
  wonders: Object.keys(BUILT_WONDERS),
};

/** One modifier's value: its analysis's whole number, 0 where refused */
export function modifierValue(t: ValueTerms, m: AiModifier): number {
  return analysis(t, m, 1) ?? 0;
}

/** THE MODIFIERS' SUM (0x7a4b20): each modifier's whole value, held to
 *  +-0x7fffff, in fixed point */
export function modifiersValue(t: ValueTerms, mods: readonly AiModifier[]): number {
  let v = 0;
  for (const m of mods) v += Math.min(Math.max(modifierValue(t, m), -0x7fffff), 0x7fffff) * FX;
  return v;
}
