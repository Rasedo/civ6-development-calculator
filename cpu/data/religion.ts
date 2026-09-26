/**
 * Religion: pantheons and a religion's four belief classes (Follower,
 * Worship, Founder, Enhancer).
 *
 * SOURCING SWEEP. VERIFIED CORRECT against the Civ 6 sources:
 * PANTHEON_FAITH_COST = 25 (25 Faith on Standard speed) and
 * RELIGION_PRESSURE_RANGE = 10 (a dominant religion pressures cities within
 * 10 tiles).
 *
 * NARROWED MARKER — still model stylizations, not Civ 6 values, and each is
 * labelled at its own definition: MISSIONARY_CAP and APOSTLE_CAP (real Civ 6
 * caps neither unit and varies charges by Holy Site building), and the
 * individual BELIEF magnitudes. The PRESSURE scale is the install's (every
 * RELIGION_SPREAD_* row of GlobalParameters.xml below).
 *
 * Per-city pressure, missionaries, apostles and theological combat are all
 * modelled on both
 * engines, and religious predominance is a victory condition.
 */

import type { DistrictId, GreatPersonClass, ResourceCategory, Yields } from '../core/types';
import type { AdjacencyRule } from './districts';
import { srcConst, xml, type SrcMap } from './provenance';

export interface BeliefEffects {
  /** extra ADJACENCY rules one district type reads while this belief is held
   *  — the three pantheons that pay a Holy Site per adjacent tile of a kind
   *  the district's own catalog row does not name. */
  districtAdjacency?: { district: DistrictId; rules: AdjacencyRule[] };
  improvementYields?: Partial<Record<string, Partial<Yields>>>;
  featureYields?: Partial<Record<string, Partial<Yields>>>;
  improvementOnResource?: { category: ResourceCategory; yields: Partial<Yields> };
  borderCostMult?: number;
  growthMult?: number;
  gppFlat?: Partial<Record<GreatPersonClass, number>>;
  workEthic?: boolean;
  buildingYields?: Partial<Record<string, Partial<Yields>>>;
  /** NO BELIEF CARRIES THIS since RELIGIOUS_COMMUNITY took its Gathering
   *  Storm clause (the pre-GS housing modifiers exist in Beliefs.xml and are
   *  attached to nothing). The reader (cpu/core/effects.ts) and the wire
   *  column stay: they read a FIELD. */
  buildingHousing?: Partial<Record<string, number>>;
  /** CIV6 (Religious Community, GS): Gold on INTERNATIONAL Trade Routes
   *  from a city following the religion, once per Holy Site / Shrine /
   *  Temple / worship building the ORIGIN city holds — four
   *  MODIFIER_SINGLE_CITY_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL rows
   *  of one Amount. Read by `religiousCommunityGold` (cpu/core/trade.ts)
   *  and the GPU's international leg. */
  intlRouteGoldPerWorship?: number;
  amenitiesIfSpecialty?: { min: number; amenities: number };
  riverCity?: { amenities: number; housing: number };
  faithPerWonder?: number;
  perFollowers?: { per: number; yields: Partial<Yields> };
  perCity?: Partial<Yields>;
  pressureRangeBonus?: number;
  /** NO BELIEF CARRIES THIS since MESSENGER_OF_THE_GODS left the pool (it has
   *  no install row). The reader (cpu/core/trade.ts) and its wire field stay:
   *  they read a FIELD, and this is the shape a per-route religion yield takes
   *  when one is sourced. */
  tradeReligionYields?: Partial<Yields>;
  combatNearFollowing?: number;
  combatDefendFollowing?: number;
  /** NO BELIEF CARRIES THIS since CRUSADE left the pool — see
   *  `tradeReligionYields`; cpu/core/combat.ts still reads the field. */
  combatVsUnitInFollowing?: number;
  /** NO BELIEF CARRIES THIS since GS's SCRIPTURE dropped the charge clause —
   *  see `tradeReligionYields`; cpu/core/game.ts still reads the field. */
  missionaryChargeBonus?: number;
  spreadPressureMult?: number;
  missionaryCostMult?: number;
  /** a WORSHIP belief's building: the one Holy Site building the religion
   *  holding the belief may build or buy (`WORSHIP_BELIEFS`). */
  worshipBuilding?: string;
  /** CIV6 (BELIEF_YIELD_PER_DISTRICT, Lay Ministry): yields per COMPLETED
   *  district of a type in the belief seat's cities, paid in the capital —
   *  the `perCity` channel's reach, counted by district. */
  perDistrict?: Partial<Record<DistrictId, Partial<Yields>>>;
  /** CIV6 (BELIEF_YIELD_PER_CITY_WITH_WONDER, Sacred Places): yields per
   *  belief-seat city holding a completed World Wonder, paid in the capital. */
  perWonderCity?: Partial<Yields>;
  /** CIV6 (ABILITY_RELIGIOUS_IGNORE_TERRAIN_COST, Missionary Zeal): the
   *  seat's religious units pay no terrain, feature or river-crossing
   *  Movement — MOD_IGNORE_TERRAIN_COST and MOD_IGNORE_CROSSING_RIVERS_COST. */
  religiousIgnoreTerrain?: boolean;
  /** CIV6 (EFFECT_ADJUST_RELIGIOUS_COMBAT_LOSS, Monastic Isolation): the
   *  percent of the pressure the religion loses to a lost theological combat
   *  that it keeps (`ReductionPercent`). */
  theoLossReductionPct?: number;
  /** CIV6 (MODIFIER_ALL_UNITS_ADJUST_HEAL_RELIGION_PER_TURN, Holy Waters):
   *  the extra healing a religious unit takes on or next to a Holy Site
   *  district of a city following the religion. */
  holySiteReligiousHeal?: number;
}

export interface BeliefDef {
  id: string;
  name: string;
  description: string;
  effects: BeliefEffects;
  /** PROVENANCE, per column — see BELIEF_SRC below. */
  src?: SrcMap;
}

/**
 * PROVENANCE (cpu/data/provenance.ts), keyed by the engine's belief id and
 * attached by the row builder below. The install writes a belief's magnitude
 * two hops away: `BeliefModifiers` names a modifier, that modifier is usually a
 * MODIFIER_ALL_CITIES_ATTACH_MODIFIER whose only argument is the INNER modifier
 * id, and the inner one's `ModifierArguments` row carries the Amount. Every tag
 * below points at the cell that IS the number — the inner row — so the checker
 * reads one cell, not a chain.
 *
 * Four engine ids spell an install belief differently:
 * LADY_OF_THE_REEDS = BELIEF_LADY_OF_THE_REEDS_AND_MARSHES,
 * DEFENDER_OF_THE_FAITH = BELIEF_DEFENDER_OF_FAITH,
 * FIRE_GODDESS = BELIEF_GODDESS_OF_FIRE, and the mapping lives in the tag.
 *
 * The pools field no ORAL_TRADITION, CHURCH_PROPERTY, CRUSADE or
 * MESSENGER_OF_THE_GODS, because the install this engine mirrors has no row
 * for them: ORAL_TRADITION and
 * CHURCH_PROPERTY are DELETED by Gathering Storm
 * (DLC/Expansion2/Data/Expansion2_RemoveData.xml drops both the Beliefs row
 * and its BeliefModifiers), and CRUSADE and MESSENGER_OF_THE_GODS appear
 * nowhere in the install at all. GODDESS_OF_THE_HARVEST is deleted the same
 * way but stays: it is an INERT pantheon (empty effects) and the pool's size
 * is all it contributes.
 *
 * RELIGIOUS_COMMUNITY's Beliefs row EXISTS and GS re-wrote it: its four
 * BeliefModifiers are ..._TRADING (gold on international routes per
 * worship building), not the pre-GS ..._HOUSING, and the row carries the
 * GS clause.
 */
const BELIEF_SRC: Readonly<Record<string, SrcMap>> = {
  // ---- PANTHEONS ----
  GOD_OF_THE_OPEN_SKY: {
    'effects.improvementYields.PASTURE.culture':
      xml('ModifierArguments', 'ModifierId=GOD_OF_THE_OPEN_SKY_PASTURE_CULTURE_MODIFIER&Name=Amount', 'Value'),
  },
  GODDESS_OF_THE_HUNT: {
    'effects.improvementYields.CAMP.food':
      xml('ModifierArguments', 'ModifierId=GODDESS_OF_THE_HUNT_CAMP_FOOD_MODIFIER&Name=Amount', 'Value'),
    'effects.improvementYields.CAMP.production':
      xml('ModifierArguments', 'ModifierId=GODDESS_OF_THE_HUNT_CAMP_PRODUCTION_MODIFIER&Name=Amount', 'Value'),
  },
  GOD_OF_THE_SEA: {
    'effects.improvementYields.FISHING_BOATS.production':
      xml('ModifierArguments', 'ModifierId=GOD_OF_THE_SEA_FISHINGBOATS_PRODUCTION_MODIFIER&Name=Amount', 'Value'),
  },
  STONE_CIRCLES: {
    'effects.improvementYields.QUARRY.faith':
      xml('ModifierArguments', 'ModifierId=STONE_CIRCLES_QUARRY_FAITH_MODIFIER&Name=Amount', 'Value'),
  },
  LADY_OF_THE_REEDS: {
    // one install modifier under PLOT_HAS_REEDS_REQUIREMENTS covers all three
    // features; the engine writes the same Amount once per feature.
    'effects.featureYields.MARSH.production':
      xml('ModifierArguments', 'ModifierId=LADY_OF_THE_REEDS_PRODUCTION2_MODIFIER&Name=Amount', 'Value'),
    'effects.featureYields.OASIS.production':
      xml('ModifierArguments', 'ModifierId=LADY_OF_THE_REEDS_PRODUCTION2_MODIFIER&Name=Amount', 'Value'),
    'effects.featureYields.FLOODPLAINS.production':
      xml('ModifierArguments', 'ModifierId=LADY_OF_THE_REEDS_PRODUCTION2_MODIFIER&Name=Amount', 'Value'),
  },
  GOD_OF_CRAFTSMEN: {
    'effects.improvementOnResource.category':
      xml('Modifiers', 'ModifierId=GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_PRODUCTION_MODIFIER', 'SubjectRequirementSetId',
        { expect: 'PLOT_HAS_STRATEGIC_IMPROVED_REQUIREMENTS' }),
    'effects.improvementOnResource.yields.production':
      xml('ModifierArguments', 'ModifierId=GOD_OF_CRAFTSMEN_STRATEGIC_IMPROVED_PRODUCTION_MODIFIER&Name=Amount', 'Value'),
  },
  RELIGIOUS_SETTLEMENTS: {
    'effects.borderCostMult': {
      derived: '1 - Amount/100 — the install writes the DISCOUNT (15%), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=RELIGIOUS_SETTLEMENTS_CULTUREBORDER&Name=Amount', 'Value')],
    },
  },
  FERTILITY_RITES: {
    'effects.growthMult': {
      derived: '1 + Amount/100 — the install writes the percentage (10), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=FERTILITY_RITES_GROWTH&Name=Amount', 'Value')],
    },
  },
  DIVINE_SPARK: {
    'effects.gppFlat.PROPHET':
      xml('ModifierArguments', 'ModifierId=DIVINE_SPARK_HOLY_SITE_MODIFIER&Name=Amount', 'Value'),
    'effects.gppFlat.SCIENTIST':
      xml('ModifierArguments', 'ModifierId=DIVINE_SPARK_SCIENTIST_MODIFIER&Name=Amount', 'Value',
        { note: "the install hangs it on the Library (BUILDING_IS_LIBRARY), the engine on the Campus" }),
    'effects.gppFlat.ARTIST':
      xml('ModifierArguments', 'ModifierId=DIVINE_SPARK_WRITER_MODIFIER&Name=Amount', 'Value',
        { note: 'the install pays a WRITER off the Amphitheater; the engine pays an ARTIST off the Theater Square' }),
  },
  RIVER_GODDESS: {
    'effects.riverCity.amenities':
      xml('ModifierArguments', 'ModifierId=RIVER_GODDESS_HOLY_SITE_AMENITIES_MODIFIER&Name=Amount', 'Value'),
    'effects.riverCity.housing':
      xml('ModifierArguments', 'ModifierId=RIVER_GODDESS_HOLY_SITE_HOUSING_MODIFIER&Name=Amount', 'Value'),
  },
  GODDESS_OF_FESTIVALS: {
    // the install's clause is PLOT_HAS_PLANTATION, not "an improved luxury";
    // only the AMOUNT is comparable, and `category` stays untagged.
    'effects.improvementOnResource.yields.culture':
      xml('ModifierArguments', 'ModifierId=GODDESS_OF_FESTIVALS_PLANTATION_CULTURE_MODIFIER&Name=Amount', 'Value'),
  },
  RELIGIOUS_IDOLS: {
    'effects.improvementOnResource.category':
      xml('Modifiers', 'ModifierId=RELIGIOUS_IDOLS_BONUS_MINE_FAITH_MODIFIER', 'SubjectRequirementSetId',
        { expect: 'PLOT_HAS_BONUS_MINE_REQUIREMENTS' }),
    'effects.improvementOnResource.yields.faith':
      xml('ModifierArguments', 'ModifierId=RELIGIOUS_IDOLS_BONUS_MINE_FAITH_MODIFIER&Name=Amount', 'Value'),
  },
  DANCE_OF_THE_AURORA: {
    'effects.districtAdjacency.district':
      xml('ModifierArguments', 'ModifierId=DANCE_OF_THE_AURORA_FAITHTUNDRAADJACENCY&Name=DistrictType', 'Value',
        { expect: 'DISTRICT_HOLY_SITE' }),
    'effects.districtAdjacency.rules.0.source':
      xml('ModifierArguments', 'ModifierId=DANCE_OF_THE_AURORA_FAITHTUNDRAADJACENCY&Name=TerrainType', 'Value',
        { expect: 'TERRAIN_TUNDRA', note: 'the install writes a second row for TERRAIN_TUNDRA_HILLS; the engine has one TUNDRA' }),
    'effects.districtAdjacency.rules.0.amount':
      xml('ModifierArguments', 'ModifierId=DANCE_OF_THE_AURORA_FAITHTUNDRAADJACENCY&Name=Amount', 'Value'),
  },
  DESERT_FOLKLORE: {
    'effects.districtAdjacency.district':
      xml('ModifierArguments', 'ModifierId=DESERT_FOLKLORE_FAITHDESERTADJACENCY&Name=DistrictType', 'Value',
        { expect: 'DISTRICT_HOLY_SITE' }),
    'effects.districtAdjacency.rules.0.source':
      xml('ModifierArguments', 'ModifierId=DESERT_FOLKLORE_FAITHDESERTADJACENCY&Name=TerrainType', 'Value',
        { expect: 'TERRAIN_DESERT', note: 'the install writes a second row for TERRAIN_DESERT_HILLS; the engine has one DESERT' }),
    'effects.districtAdjacency.rules.0.amount':
      xml('ModifierArguments', 'ModifierId=DESERT_FOLKLORE_FAITHDESERTADJACENCY&Name=Amount', 'Value'),
  },
  SACRED_PATH: {
    'effects.districtAdjacency.district':
      xml('ModifierArguments', 'ModifierId=SACRED_PATH_FAITHFEATUREADJACENCY&Name=DistrictType', 'Value',
        { expect: 'DISTRICT_HOLY_SITE' }),
    'effects.districtAdjacency.rules.0.source':
      xml('ModifierArguments', 'ModifierId=SACRED_PATH_FAITHFEATUREADJACENCY&Name=FeatureType', 'Value',
        { expect: 'FEATURE_JUNGLE', note: "the install's JUNGLE is this engine's RAINFOREST" }),
    'effects.districtAdjacency.rules.0.amount':
      xml('ModifierArguments', 'ModifierId=SACRED_PATH_FAITHFEATUREADJACENCY&Name=Amount', 'Value'),
  },
  FIRE_GODDESS: {
    // BELIEF_GODDESS_OF_FIRE — one modifier under PLOT_HAS_GODDES_FIRE_REQUIREMENTS
    // covers both features.
    'effects.featureYields.GEOTHERMAL_FISSURE.faith':
      xml('ModifierArguments', 'ModifierId=GODDESS_OF_FIRE_FEATURES_FAITH_MODIFIER&Name=Amount', 'Value'),
    'effects.featureYields.VOLCANIC_SOIL.faith':
      xml('ModifierArguments', 'ModifierId=GODDESS_OF_FIRE_FEATURES_FAITH_MODIFIER&Name=Amount', 'Value'),
  },

  // ---- FOLLOWER ----
  WORK_ETHIC: {
    'effects.workEthic':
      xml('Modifiers', 'ModifierId=WORK_ETHIC_ADJACENCY_PRODUCTION_2', 'ModifierType',
        { expect: 'MODIFIER_ALL_DISTRICTS_ADJUST_YIELD_BASED_ON_ADJACENCY_BONUS' }),
  },
  FEED_THE_WORLD: {
    'effects.buildingYields.SHRINE.food':
      xml('ModifierArguments', 'ModifierId=FEED_THE_WORLD_SHRINE_FOOD3_MODIFIER&Name=Amount', 'Value'),
    'effects.buildingYields.TEMPLE.food':
      xml('ModifierArguments', 'ModifierId=FEED_THE_WORLD_TEMPLE_FOOD3_MODIFIER&Name=Amount', 'Value'),
  },
  RELIGIOUS_COMMUNITY: {
    'effects.intlRouteGoldPerWorship':
      xml('ModifierArguments', 'ModifierId=RELIGIOUS_COMMUNITY_SHRINE_TRADING_MODIFIER&Name=Amount', 'Value',
        { note: 'the HOLY_SITE, TEMPLE and TIER3 _TRADING_MODIFIER rows carry the same Amount 2; one field, counted per building the origin holds' }),
  },
  CHORAL_MUSIC: {
    'effects.buildingYields.SHRINE.culture':
      xml('ModifierArguments', 'ModifierId=CHORAL_MUSIC_SHRINE_CULTURE_MODIFIER&Name=Amount', 'Value'),
    'effects.buildingYields.TEMPLE.culture':
      xml('ModifierArguments', 'ModifierId=CHORAL_MUSIC_TEMPLE_CULTURE_MODIFIER&Name=Amount', 'Value'),
  },
  ZEN_MEDITATION: {
    'effects.amenitiesIfSpecialty.min':
      xml('Modifiers', 'ModifierId=ZEN_MEDITATION_AMENITY', 'SubjectRequirementSetId',
        { expect: 'CITY_FOLLOWS_RELIGION_WITH_2 DISTRICTS_REQUIREMENTS',
          note: "the space in the install's requirement-set id is the install's own" }),
    'effects.amenitiesIfSpecialty.amenities':
      xml('ModifierArguments', 'ModifierId=ZEN_MEDITATION_AMENITY_MODIFIER&Name=Amount', 'Value'),
  },
  DIVINE_INSPIRATION: {
    'effects.faithPerWonder':
      xml('ModifierArguments', 'ModifierId=DIVINE_INSPIRATION_WONDER_FAITH_MODIFIER&Name=Amount', 'Value'),
  },

  // ---- FOUNDER ----
  TITHE: {
    // GS replaced the pre-GS TITHE_GOLD_FOLLOWER (BELIEF_YIELD_PER_FOLLOWER,
    // 1 gold per 4) with TITHE_GOLD_CITY: BELIEF_YIELD_PER_CITY, Amount 3,
    // PerXItems 1 — the same shape PILGRIMAGE's faith takes.
    'effects.perCity.gold':
      xml('ModifierArguments', 'ModifierId=TITHE_GOLD_CITY_MODIFIER&Name=Amount', 'Value'),
  },
  WORLD_CHURCH: {
    'effects.perFollowers.per':
      xml('ModifierArguments', 'ModifierId=WORLD_CHURCH_CULTURE_FOLLOWER_MODIFIER&Name=PerXItems', 'Value'),
    'effects.perFollowers.yields.culture':
      xml('ModifierArguments', 'ModifierId=WORLD_CHURCH_CULTURE_FOLLOWER_MODIFIER&Name=Amount', 'Value'),
  },
  CROSS_CULTURAL_DIALOGUE: {
    'effects.perFollowers.per':
      xml('ModifierArguments', 'ModifierId=CROSS_CULTURAL_DIALOGUE_SCIENCE_FOLLOWER_MODIFIER&Name=PerXItems', 'Value'),
    'effects.perFollowers.yields.science':
      xml('ModifierArguments', 'ModifierId=CROSS_CULTURAL_DIALOGUE_SCIENCE_FOLLOWER_MODIFIER&Name=Amount', 'Value'),
  },
  PILGRIMAGE: {
    'effects.perCity.faith':
      xml('ModifierArguments', 'ModifierId=PILGRIMAGE_FAITH_CITY_MODIFIER&Name=Amount', 'Value'),
  },
  STEWARDSHIP: {
    // the install pays per DISTRICT (Campus, Commercial Hub); the engine pays
    // off the district's two buildings, at the same Amount.
    'effects.buildingYields.LIBRARY.science':
      xml('ModifierArguments', 'ModifierId=STEWARDSHIP_SCIENCE_DISTRICTS_MODIFIER&Name=Amount', 'Value'),
    'effects.buildingYields.UNIVERSITY.science':
      xml('ModifierArguments', 'ModifierId=STEWARDSHIP_SCIENCE_DISTRICTS_MODIFIER&Name=Amount', 'Value'),
    'effects.buildingYields.MARKET.gold':
      xml('ModifierArguments', 'ModifierId=STEWARDSHIP_GOLD_DISTRICTS_MODIFIER&Name=Amount', 'Value'),
    'effects.buildingYields.BANK.gold':
      xml('ModifierArguments', 'ModifierId=STEWARDSHIP_GOLD_DISTRICTS_MODIFIER&Name=Amount', 'Value'),
  },
  LAY_MINISTRY: {
    // BELIEF_YIELD_PER_DISTRICT, PerXItems 1, the district its DistrictType
    'effects.perDistrict.HOLY_SITE.faith':
      xml('ModifierArguments', 'ModifierId=LAY_MINISTRY_FAITH_DISTRICTS_MODIFIER&Name=Amount', 'Value'),
    'effects.perDistrict.THEATER_SQUARE.culture':
      xml('ModifierArguments', 'ModifierId=LAY_MINISTRY_CULTURE_DISTRICTS_MODIFIER&Name=Amount', 'Value'),
  },
  SACRED_PLACES: {
    // BELIEF_YIELD_PER_CITY_WITH_WONDER, PerXItems 1, one modifier per yield
    'effects.perWonderCity.science':
      xml('ModifierArguments', 'ModifierId=SACRED_PLACES_SCIENCE_WONDER_CITY_MODIFIER&Name=Amount', 'Value'),
    'effects.perWonderCity.culture':
      xml('ModifierArguments', 'ModifierId=SACRED_PLACES_CULTURE_WONDER_CITY_MODIFIER&Name=Amount', 'Value'),
    'effects.perWonderCity.gold':
      xml('ModifierArguments', 'ModifierId=SACRED_PLACES_GOLD_WONDER_CITY_MODIFIER&Name=Amount', 'Value'),
    'effects.perWonderCity.faith':
      xml('ModifierArguments', 'ModifierId=SACRED_PLACES_FAITH_WONDER_CITY_MODIFIER&Name=Amount', 'Value'),
  },

  // ---- WORSHIP ----
  ...Object.fromEntries(['CATHEDRAL', 'GURDWARA', 'MEETING_HOUSE', 'MOSQUE', 'PAGODA', 'SYNAGOGUE', 'WAT', 'STUPA', 'DAR_E_MEHR']
    .map((id) => [id, {
      'effects.worshipBuilding': xml('ModifierArguments', `ModifierId=ALLOW_${id}&Name=BuildingType`, 'Value',
        { expect: `BUILDING_${id}` }),
    }])),

  // ---- ENHANCER ----
  ITINERANT_PREACHERS: {
    'effects.pressureRangeBonus':
      xml('ModifierArguments', 'ModifierId=ITINERANT_PREACHERS_SPREAD_DISTANCE&Name=DistanceChange', 'Value'),
  },
  SCRIPTURE: {
    'effects.spreadPressureMult': {
      derived: '1 + SpreadMultiplier/100 — the install writes the PERCENT (25), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=SCRIPTURE_SPEAD_STRENGTH&Name=SpreadMultiplier', 'Value')],
    },
  },
  JUST_WAR: {
    'effects.combatNearFollowing':
      xml('ModifierArguments', 'ModifierId=JUST_WAR_COMBAT_BONUS_MODIFIER&Name=Amount', 'Value'),
  },
  DEFENDER_OF_THE_FAITH: {
    'effects.combatDefendFollowing':
      xml('ModifierArguments', 'ModifierId=DEFENDER_OF_FAITH_COMBAT_BONUS_MODIFIER&Name=Amount', 'Value'),
  },
  HOLY_ORDER: {
    'effects.missionaryCostMult': {
      derived: '1 - Amount/100 — the install writes the purchase DISCOUNT (30), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=HOLY_ORDER_MISSIONARY_DISCOUNT_MODIFIER&Name=Amount', 'Value')],
    },
  },
  MISSIONARY_ZEAL: {
    'effects.religiousIgnoreTerrain':
      xml('ModifierArguments', 'ModifierId=MISSIONARY_ZEAL_IGNORE_TERRAIN_MODIFIER&Name=AbilityType', 'Value',
        { expect: 'ABILITY_RELIGIOUS_IGNORE_TERRAIN_COST',
          note: 'the ability carries MOD_IGNORE_TERRAIN_COST and MOD_IGNORE_CROSSING_RIVERS_COST, tagged CLASS_RELIGIOUS_ALL' }),
  },
  MONASTIC_ISOLATION: {
    'effects.theoLossReductionPct':
      xml('ModifierArguments', 'ModifierId=MONASTIC_ISOLATION_REDUCE_COMBAT_LOSS&Name=ReductionPercent', 'Value'),
  },
  HOLY_WATERS: {
    'effects.holySiteReligiousHeal':
      xml('ModifierArguments', 'ModifierId=HOLY_WATERS_HEALING_MODIFIER&Name=Amount', 'Value'),
  },
};

const B = (id: string, name: string, description: string, effects: BeliefEffects): BeliefDef =>
  ({ id, name, description, effects, ...(BELIEF_SRC[id] ? { src: BELIEF_SRC[id] } : {}) });

export const PANTHEONS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('GOD_OF_THE_OPEN_SKY', 'God of the Open Sky', '+1 culture from each Pasture.', {
      improvementYields: { PASTURE: { culture: 1 } },
    }),
    B('GODDESS_OF_THE_HUNT', 'Goddess of the Hunt', '+1 food and +1 production from each Camp.', {
      improvementYields: { CAMP: { food: 1, production: 1 } },
    }),
    B('GOD_OF_THE_SEA', 'God of the Sea', '+1 production from each Fishing Boats.', {
      improvementYields: { FISHING_BOATS: { production: 1 } },
    }),
    B('STONE_CIRCLES', 'Stone Circles', '+2 faith from each Quarry.', {
      improvementYields: { QUARRY: { faith: 2 } },
    }),
    B('LADY_OF_THE_REEDS', 'Lady of the Reeds and Marshes', '+2 production from Marsh, Oasis and Floodplains tiles.', {
      featureYields: { MARSH: { production: 2 }, OASIS: { production: 2 }, FLOODPLAINS: { production: 2 } },
    }),
    B('GOD_OF_CRAFTSMEN', 'God of Craftsmen', '+1 production from improved strategic resources.', {
      improvementOnResource: { category: 'strategic', yields: { production: 1 } },
    }),
    B('RELIGIOUS_SETTLEMENTS', 'Religious Settlements', 'Border expansion is 15% cheaper.', {
      borderCostMult: 0.85,
    }),
    B('FERTILITY_RITES', 'Fertility Rites', '+10% growth in all cities.', {
      growthMult: 1.1,
    }),
    B('DIVINE_SPARK', 'Divine Spark', '+1 great person point from Holy Sites (Prophet), Campuses (Scientist) and Theater Squares (Artist).', {
      gppFlat: { PROPHET: 1, SCIENTIST: 1, ARTIST: 1 },
    }),
    B('RIVER_GODDESS', 'River Goddess', '+2 amenities and +2 housing in cities whose center is on a river.', {
      riverCity: { amenities: 2, housing: 2 },
    }),
    B('GODDESS_OF_FESTIVALS', 'Goddess of Festivals', '+1 culture from improved luxury resources.', {
      improvementOnResource: { category: 'luxury', yields: { culture: 1 } },
    }),
    B('RELIGIOUS_IDOLS', 'Religious Idols', '+2 faith from improved bonus resources.', {
      improvementOnResource: { category: 'bonus', yields: { faith: 2 } },
    }),
    B('CITY_PATRON_GODDESS', 'City Patron Goddess', '+25% production toward districts in cities without one.', {}),
    B('DANCE_OF_THE_AURORA', 'Dance of the Aurora', 'Holy Site districts get +1 Faith from adjacent Tundra tiles.', {
      districtAdjacency: { district: 'HOLY_SITE', rules: [{ source: 'TUNDRA', amount: 1 }] },
    }),
    B('DESERT_FOLKLORE', 'Desert Folklore', 'Holy Site districts get +1 Faith from adjacent Desert tiles.', {
      districtAdjacency: { district: 'HOLY_SITE', rules: [{ source: 'DESERT', amount: 1 }] },
    }),
    B('EARTH_GODDESS', 'Earth Goddess', '+1 faith from tiles with Charming or Breathtaking appeal.', {}),
    B('FIRE_GODDESS', 'Fire Goddess', '+2 Faith from Geothermal Fissures and Volcanic Soil.', {
      featureYields: { GEOTHERMAL_FISSURE: { faith: 2 }, VOLCANIC_SOIL: { faith: 2 } },
    }),
    B('GOD_OF_HEALING', 'God of Healing', 'Units heal +30 HP in or next to a Holy Site.', {}),
    B('GOD_OF_THE_FORGE', 'God of the Forge', '+25% production toward ancient and classical military units.', {}),
    B('GOD_OF_WAR', 'God of War', 'Bonus combat strength near friendly Holy Sites; faith from kills.', {}),
    B('GODDESS_OF_THE_HARVEST', 'Goddess of the Harvest', 'Harvesting resources or removing features yields faith.', {}),
    B('INITIATION_RITES', 'Initiation Rites', '+50 faith for each barbarian outpost cleared.', {}),
    B('MONUMENT_TO_THE_GODS', 'Monument to the Gods', '+15% production toward ancient and classical wonders.', {}),
    B('SACRED_PATH', 'Sacred Path', 'Holy Site districts get +1 Faith from adjacent Rainforest tiles.', {
      districtAdjacency: { district: 'HOLY_SITE', rules: [{ source: 'RAINFOREST', amount: 1 }] },
    }),
  ].map((b) => [b.id, b]),
);

export const FOLLOWER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('WORK_ETHIC', 'Work Ethic', 'Holy Site adjacency bonus also provides production.', {
      workEthic: true,
    }),
    B('FEED_THE_WORLD', 'Feed the World', 'Shrines +3 food, Temples +3 food.', {
      buildingYields: { SHRINE: { food: 3 }, TEMPLE: { food: 3 } },
    }),
    B('CHORAL_MUSIC', 'Choral Music', 'Shrines +2 culture, Temples +4 culture.', {
      buildingYields: { SHRINE: { culture: 2 }, TEMPLE: { culture: 4 } },
    }),
    // CIV6 (GS, Expansion2_Beliefs.xml): the four BeliefModifiers are
    // RELIGIOUS_COMMUNITY_{HOLY_SITE,SHRINE,TEMPLE,TIER3}_TRADING, each a
    // MODIFIER_SINGLE_CITY_ADJUST_TRADE_ROUTE_YIELD_FOR_INTERNATIONAL of
    // YIELD_GOLD Amount 2 on a city that follows the religion, gated on
    // CITY_HAS_HOLY_SITE / BUILDING_IS_SHRINE / _TEMPLE_XP2 / _TIER3_HOLY_SITE.
    // The pre-GS housing clause (RELIGIOUS_COMMUNITY_*_HOUSING) is defined
    // in Beliefs.xml and attached to nothing in GS.
    B('RELIGIOUS_COMMUNITY', 'Religious Community', '+2 gold on international trade routes from this city per Holy Site, Shrine, Temple and worship building it holds.', {
      intlRouteGoldPerWorship: 2,
    }),
    B('ZEN_MEDITATION', 'Zen Meditation', '+1 amenity in cities with 2+ specialty districts.', {
      amenitiesIfSpecialty: { min: 2, amenities: 1 },
    }),
    B('DIVINE_INSPIRATION', 'Divine Inspiration', '+4 faith from each world wonder in the city.', {
      faithPerWonder: 4,
    }),
    B('JESUIT_EDUCATION', 'Jesuit Education', 'May purchase Campus and Theater Square buildings with faith.', {}),
    B('RELIQUARIES', 'Reliquaries', 'Triple faith and tourism from relics.', {}),
    B('WARRIOR_MONKS', 'Warrior Monks', 'May train Warrior Monks (a religious melee unit).', {}),
  ].map((b) => [b.id, b]),
);

export const FOUNDER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('TITHE', 'Tithe', '+3 gold for each city following your religion.', {
      perCity: { gold: 3 },
    }),
    B('WORLD_CHURCH', 'World Church', '+1 culture for every 4 followers.', {
      perFollowers: { per: 4, yields: { culture: 1 } },
    }),
    B('CROSS_CULTURAL_DIALOGUE', 'Cross-Cultural Dialogue', '+1 science for every 4 followers.', {
      perFollowers: { per: 4, yields: { science: 1 } },
    }),
    B('PILGRIMAGE', 'Pilgrimage', '+2 faith for each city following your religion.', {
      perCity: { faith: 2 },
    }),
    B('STEWARDSHIP', 'Stewardship', '+1 science from Libraries/Universities and +1 gold from Markets/Banks.', {
      buildingYields: {
        LIBRARY: { science: 1 }, UNIVERSITY: { science: 1 },
        MARKET: { gold: 1 }, BANK: { gold: 1 },
      },
    }),
    B('PAPAL_PRIMACY', 'Papal Primacy', '+25% influence points toward earning envoys.', {}),
    B('RELIGIOUS_UNITY', 'Religious Unity', 'Your alliances and city-state relations gain bonuses from shared religion.', {}),
    B('LAY_MINISTRY', 'Lay Ministry', '+1 Faith for each Holy Site and +1 Culture for each Theater Square district.', {
      perDistrict: { HOLY_SITE: { faith: 1 }, THEATER_SQUARE: { culture: 1 } },
    }),
    B('SACRED_PLACES', 'Sacred Places', '+2 Science, Culture, Gold and Faith for each city with a World Wonder.', {
      perWonderCity: { science: 2, culture: 2, gold: 2, faith: 2 },
    }),
  ].map((b) => [b.id, b]),
);

/**
 * Worship beliefs. CIV6 (Beliefs.xml, BELIEF_CLASS_WORSHIP): nine rows, each
 * carrying ONE BeliefModifier, ALLOW_<building>, a
 * MODIFIER_PLAYER_RELIGION_ADD_RELIGIOUS_BUILDING whose BuildingType names
 * the Holy Site building the religion unlocks. The engine id strips BELIEF_
 * as every catalog here does, which makes it the building's own id.
 */
export const WORSHIP_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('CATHEDRAL', 'Cathedral', 'Allows the Cathedral.', { worshipBuilding: 'CATHEDRAL' }),
    B('GURDWARA', 'Gurdwara', 'Allows the Gurdwara.', { worshipBuilding: 'GURDWARA' }),
    B('MEETING_HOUSE', 'Meeting House', 'Allows the Meeting House.', { worshipBuilding: 'MEETING_HOUSE' }),
    B('MOSQUE', 'Mosque', 'Allows the Mosque.', { worshipBuilding: 'MOSQUE' }),
    B('PAGODA', 'Pagoda', 'Allows the Pagoda.', { worshipBuilding: 'PAGODA' }),
    B('SYNAGOGUE', 'Synagogue', 'Allows the Synagogue.', { worshipBuilding: 'SYNAGOGUE' }),
    B('WAT', 'Wat', 'Allows the Wat.', { worshipBuilding: 'WAT' }),
    B('STUPA', 'Stupa', 'Allows the Stupa.', { worshipBuilding: 'STUPA' }),
    B('DAR_E_MEHR', 'Dar-e Mehr', 'Allows the Dar-e Mehr.', { worshipBuilding: 'DAR_E_MEHR' }),
  ].map((b) => [b.id, b]),
);

/**
 * Enhancer beliefs, the install's nine. RELIGIOUS_COLONIZATION
 * (EFFECT_ENABLE_RELIGION_AUTO_SPREAD: "Cities start with this Religion in
 * place if founded by a player who has this as their majority Religion")
 * holds its place in the pool and applies nothing: the install names no
 * amount of pressure a new city starts with.
 */
export const ENHANCER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('ITINERANT_PREACHERS', 'Itinerant Preachers', 'Religious pressure spreads three tiles further.', {
      pressureRangeBonus: 3,
    }),
    // GS's SCRIPTURE_SPEAD_STRENGTH carries SpreadMultiplier 25 and nothing
    // else that this catalog has a column for: no spread-charge argument
    // anywhere in the install, so this row grants no missionary charge.
    B('SCRIPTURE', 'Scripture', 'Religious spreads land 25% more pressure.', {
      spreadPressureMult: 1.25, // lump 200 → 250
    }),
    B('JUST_WAR', 'Just War', '+10 combat strength near cities following your religion.', {
      combatNearFollowing: 10, // within JUST_WAR_RANGE, unit-vs-unit
    }),
    B('DEFENDER_OF_THE_FAITH', 'Defender of the Faith', '+5 combat strength when defending in friendly-religion territory.', {
      combatDefendFollowing: 5,
    }),
    B('HOLY_ORDER', 'Holy Order', 'Missionaries and Apostles are 30% cheaper to purchase.', {
      missionaryCostMult: 0.7,
    }),
    B('MISSIONARY_ZEAL', 'Missionary Zeal', 'Religious units ignore Movement costs of terrain and features.', {
      religiousIgnoreTerrain: true,
    }),
    B('MONASTIC_ISOLATION', 'Monastic Isolation', "Your Religion's pressure never drops due to losses in Theological Combat.", {
      theoLossReductionPct: 100,
    }),
    B('RELIGIOUS_COLONIZATION', 'Religious Colonization', 'Cities start with this Religion in place if founded by a player who has this as their majority Religion.', {}),
    B('HOLY_WATERS', 'Holy Waters', '+10 healing for religious units in or next to Holy Site districts of cities following this Religion.', {
      holySiteReligiousHeal: 10,
    }),
  ].map((b) => [b.id, b]),
);

/**
 * A religion's BELIEF CLASSES, in the install's `BeliefClasses` row order
 * (the Pantheon, its own race, left out). CIV6 (Beliefs.xml): each carries
 * `MaxInReligion` 1, so a religion ends holding one belief of each.
 * CIV6 (ReligionScreen.lua `PopulateAvailableBeliefs` / `OnBeliefSelected`)
 * and the pedia ("A newly established Religion will consist of two beliefs:
 * a Follower belief, and one of three additional types"): FOUNDING takes the
 * Follower first, then one belief of any other class. A class code is its
 * index here — the wire's (class, index) pairs and the GPU's pools share it.
 */
export const BELIEF_CLASSES = ['FOLLOWER', 'WORSHIP', 'FOUNDER', 'ENHANCER'] as const;
export type BeliefClass = typeof BELIEF_CLASSES[number];
export const BELIEF_CLASS_FOLLOWER = BELIEF_CLASSES.indexOf('FOLLOWER');

/** CIV6 (GlobalParameters RELIGION_INITIAL_BELIEFS 2): the beliefs a religion
 *  earns at its founding. Each EVANGELIZE BELIEF earns one more (the Apostle:
 *  "Once per game may Evangelize Belief to add an additional Belief to their
 *  Religion. These uses consume the Apostle"; the pedia: "use the Evangelize
 *  Belief action on Apostles to add additional beliefs to your Religion. You
 *  can have a total of 4 beliefs in a Religion"), and the religion adopts
 *  what it has earned from the classes it still lacks. */
export const RELIGION_INITIAL_BELIEFS = srcConst('religion.initialBeliefs', 2,
  xml('GlobalParameters', 'Name=RELIGION_INITIAL_BELIEFS', 'Value'));

/** CIV6 (GreatPersonClasses): the Great Prophet's `MaxPlayerInstances` — a
 *  seat earns this many Great Prophets in a game and no more; once it has, a
 *  Prophet offer is not its to take (no recruit, patronage, pass or free
 *  grant), and its Prophet points wait. */
export const PROPHET_MAX_PLAYER_INSTANCES = srcConst('religion.prophetMaxPlayerInstances', 1,
  xml('GreatPersonClasses', 'GreatPersonClassType=GREAT_PERSON_CLASS_PROPHET', 'MaxPlayerInstances'));

/** each class's catalog, by class code */
export const BELIEF_CATALOGS: readonly Record<string, BeliefDef>[] = [
  FOLLOWER_BELIEFS, WORSHIP_BELIEFS, FOUNDER_BELIEFS, ENHANCER_BELIEFS,
];

/** the ReligionState slot each class fills, by class code */
export const BELIEF_SLOTS = ['follower', 'worship', 'founder', 'enhancer'] as const;

/** a (class, index) pair's belief id, undefined for a pair naming none */
export function beliefIdAt(cls: number, index: number): string | undefined {
  const cat = BELIEF_CATALOGS[cls];
  return cat && Number.isInteger(index) && index >= 0 ? Object.keys(cat)[index] : undefined;
}

/** a belief id's class code, -1 for an id no religion class holds */
export function beliefClassOf(id: string): number {
  return BELIEF_CATALOGS.findIndex((cat) => id in cat);
}

/** the building a worship belief unlocks, undefined for none */
export function worshipBuildingOf(beliefId: string | null | undefined): string | undefined {
  return beliefId ? WORSHIP_BELIEFS[beliefId]?.effects.worshipBuilding : undefined;
}

export const RELIGION_NAMES = [
  'Buddhism', 'Catholicism', 'Confucianism', 'Hinduism', 'Islam', 'Judaism',
  'Orthodoxy', 'Protestantism', 'Shinto', 'Sikhism', 'Taoism', 'Zoroastrianism',
];

export const PANTHEON_FAITH_COST = 25;

/** CIV6 (GlobalParameters.xml, RELIGION_SPREAD_ADJACENT_CITY_DISTANCE 10):
 * every city FOLLOWING a religion presses every city within this many tiles
 * each turn. Itinerant Preachers adds its pressureRangeBonus to THIS
 * religion's radius (per-religion range in spreadReligiousPressure). */
export const RELIGION_PRESSURE_RANGE = 10;
export const JUST_WAR_RANGE = 3;
/** CIV6 (RELIGION_SPREAD_ADJACENT_PER_TURN_PRESSURE 1): what one following
 * city presses per turn — the Holy City presses
 * RELIGION_SPREAD_HOLY_CITY_PRESSURE_MULTIPLIER 4 of it and a city with a
 * Holy Site RELIGION_SPREAD_HOLY_SITE_PRESSURE_MULTIPLIER 2. READING: the two
 * do not stack, the larger applies; a city presses itself too, which is how
 * a Holy City keeps its faith with no neighbour of its own. */
export const RELIGION_PRESSURE_PER_TURN = 1;
export const HOLY_CITY_PRESSURE_MULT = 4;
export const HOLY_SITE_PRESSURE_MULT = 2;
/** CIV6 (RELIGION_SPREAD_ATHEISM_PRESSURE_PER_POP 50): every city carries this
 * much "no religion" pressure per citizen — the UNCONVERTED group's pressure,
 * one of the groups the city's citizens are shared among
 * (`followedReligionOf`). */
export const ATHEISM_PRESSURE_PER_POP = 50;
/** CIV6 (RELIGION_SPREAD_HOLY_CITY_PRESSURE_PER_POP 200): what a religion's
 * Holy City starts with per citizen the turn it is founded. */
export const HOLY_CITY_FOUNDING_PRESSURE_PER_POP = 200;
/** CIV6 (RELIGION_SPREAD_TRADE_ROUTE_PRESSURE_FOR_DESTINATION 1.0 /
 * _FOR_ORIGIN 0.5): a live Trade Route carries its ORIGIN city's religion to
 * the destination each turn, and the destination's back to the origin at
 * half strength. READING: the accumulator is an integer, so a half-point
 * lands on EVEN turns (`routePressureShare`). Dharma's +100% rides the
 * route OWNER's rows (`ROUTE_PRESSURE_ROWS`). */
export const ROUTE_PRESSURE_DESTINATION = 1.0;
export const ROUTE_PRESSURE_ORIGIN = 0.5;

/** the whole points a per-turn route amount lands THIS turn: its whole part
 *  every turn and its half on even turns — `_route_pressure_share`'s twin */
export function routePressureShare(amount: number, turn: number): number {
  const whole = Math.floor(amount);
  return whole + (amount > whole && turn % 2 === 0 ? 1 : 0);
}

/** CIV6 (RELIGION_SPREAD_STRENGTH_MULTIPLIER 200): the lump a full-health
 * Spread lands on the target city; SCRIPTURE multiplies it x1.25 (250) —
 * SCRIPTURE_SPEAD_STRENGTH's SpreadMultiplier is a PERCENT. */
export const SPREAD_PRESSURE = 200;

/** how a city's citizens are shared among its religions and THE UNCONVERTED
 *  (measured live, lab 2 scene E — "pop × pressure share, rounded, forced to
 *  sum to pop"): the largest-remainder allocation reproduces every measured
 *  row — floor each group's quota, then one more citizen to each of the
 *  largest fractional remainders until the population is spent. A remainder
 *  tie goes to the higher pressure, then the lower id (the one step the lab
 *  did not pin). Index `pres.length` is the unconverted. `_followers_of` is
 *  the twin; the division is written `pop * p / total` on both engines.
 *  `unconverted` is the unconverted group's pressure: the engine derives
 *  ATHEISM_PRESSURE_PER_POP × pop; the live game keeps it as an ACCUMULATOR
 *  that does not shrink with the city (300 at pop 2 after a nuclear strike,
 *  400 at pop 9), which the measured rows pass in explicitly and this
 *  engine does not model. */
export function followersOf(pres: readonly number[], population: number, unconverted?: number): number[] {
  const n = pres.length;
  const pop = Math.max(0, population);
  const p = [...pres, unconverted ?? ATHEISM_PRESSURE_PER_POP * pop];
  let total = 0;
  for (const x of p) total += x;
  const f = new Array<number>(n + 1).fill(0);
  if (pop <= 0 || total <= 0) return f;
  const rem = new Array<number>(n + 1).fill(0);
  let given = 0;
  for (let g = 0; g <= n; g++) {
    const q = pop * p[g] / total;
    f[g] = Math.floor(q);
    rem[g] = q - f[g];
    given += f[g];
  }
  const order = [...f.keys()].sort((a, b) => rem[b] - rem[a] || p[b] - p[a] || a - b);
  for (let i = 0; i < pop - given && i < order.length; i++) f[order[i]] += 1;
  return f;
}

/** the religion a city FOLLOWS — its MAJORITY religion as measured live (lab
 *  2 scene E, eight draws including the decider): the group with the MOST
 *  followers, the unconverted counted as a group; a tie goes to the group
 *  with the higher total PRESSURE (not the lower id, not arrival order), then
 *  the lower id; the winner must hold at least half the citizens
 *  (2 × followers ≥ population), and the unconverted winning means NO
 *  majority (-1). `_followed_religion` is the twin, and every follow read on
 *  this engine goes through here so no two sites can disagree about a tie. */
export function followedReligionOf(pres: readonly number[], population: number, unconverted?: number): number {
  const n = pres.length;
  const pop = Math.max(0, population);
  if (pop <= 0) return -1;
  const none = unconverted ?? ATHEISM_PRESSURE_PER_POP * pop;
  const f = followersOf(pres, population, none);
  let best = n;   // the unconverted, until a religion beats it
  for (let g = 0; g < n; g++) {
    const pg = pres[g];
    const pb = best === n ? none : pres[best];
    if (f[g] > f[best] || (f[g] === f[best] && (pg > pb || (pg === pb && g < best)))) best = g;
  }
  if (best === n) return -1;
  return f[best] * 2 >= pop ? best : -1;
}
export const MISSIONARY_CAP = 2;
export const APOSTLE_CAP = 1;
/**
 * THEOLOGICAL COMBAT. CIV6: the winner's religion gains pressure "in all
 * cities within 10 tiles" and the loser's sheds the same —
 * RELIGION_SPREAD_COMBAT_VICTORY 250 (GlobalParameters.xml).
 */
export const THEO_PRESSURE_RANGE = 10;
export const THEO_PRESSURE_SWING = 250;

/** CIV6 (Inquisitor): the Apostle's "Launch Inquisition" needs friendly
 *  territory and "at least 3 charges", and consumes the unit. */
export const LAUNCH_INQUISITION_CHARGES = 3;
export const INQUISITOR_CAP = 2;
/** CIV6 (Inquisitor): "+35 Religious Strength when in friendly territory". */
export const INQUISITOR_HOME_STRENGTH = 35;
/** CIV6 (GS): an Inquisitor's Remove Heresy leaves "only 75% presence of other
 *  Religions" removed, not all of it. */
export const REMOVE_HERESY_PCT = 75;

/** CIV6 (Theological combat): a military unit's CONDEMN HERETIC kills the
 *  religious unit and "only the losing side loses religious influence, the
 *  Religious Pressure lost is halved ... and it only affects cities within 6
 *  tiles" — RELIGION_SPREAD_UNIT_CAPTURE 125, the duel's 250 halved. */
export const CONDEMN_PRESSURE_RANGE = 6;
export const CONDEMN_PRESSURE_SWING = Math.floor(THEO_PRESSURE_SWING / 2);
