/**
 * Religion: pantheons, follower/founder beliefs and worship buildings.
 *
 * SOURCING SWEEP. VERIFIED CORRECT against the Civ 6 sources:
 * PANTHEON_FAITH_COST = 25 (25 Faith on Standard speed) and
 * RELIGION_PRESSURE_RANGE = 10 (a dominant religion pressures cities within
 * 10 tiles).
 *
 * NARROWED MARKER — still model stylizations, not Civ 6 values, and each is
 * labelled at its own definition: SPREAD_PRESSURE, MISSIONARY_CAP and
 * APOSTLE_CAP (real Civ 6 caps neither unit and varies charges by Holy Site
 * building), and the individual BELIEF magnitudes.
 *
 * Per-city pressure, missionaries, apostles and theological combat are all
 * modelled on both
 * engines, and religious predominance is a victory condition.
 */

import type { GreatPersonClass, ResourceCategory, Yields } from '../core/types';

export interface BeliefEffects {
  improvementYields?: Partial<Record<string, Partial<Yields>>>;
  featureYields?: Partial<Record<string, Partial<Yields>>>;
  improvementOnResource?: { category: ResourceCategory; yields: Partial<Yields> };
  borderCostMult?: number;
  growthMult?: number;
  gppFlat?: Partial<Record<GreatPersonClass, number>>;
  workEthic?: boolean;
  buildingYields?: Partial<Record<string, Partial<Yields>>>;
  buildingHousing?: Partial<Record<string, number>>;
  amenitiesIfSpecialty?: { min: number; amenities: number };
  riverCity?: { amenities: number; housing: number };
  faithPerWonder?: number;
  perFollowers?: { per: number; yields: Partial<Yields> };
  perCity?: Partial<Yields>;
  pressureRangeBonus?: number;
  tradeReligionYields?: Partial<Yields>;
  combatNearFollowing?: number;
  combatDefendFollowing?: number;
  combatVsUnitInFollowing?: number;
  missionaryChargeBonus?: number;
  spreadPressureMult?: number;
  missionaryCostMult?: number;
}

export interface BeliefDef {
  id: string;
  name: string;
  description: string;
  effects: BeliefEffects;
}

const B = (id: string, name: string, description: string, effects: BeliefEffects): BeliefDef =>
  ({ id, name, description, effects });

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
    B('ORAL_TRADITION', 'Oral Tradition', '+1 culture from each Plantation.', {
      improvementYields: { PLANTATION: { culture: 1 } },
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
    B('RIVER_GODDESS', 'River Goddess', '+1 amenity and +1 housing in cities whose center is on a river.', {
      riverCity: { amenities: 1, housing: 1 },
    }),
    B('GODDESS_OF_FESTIVALS', 'Goddess of Festivals', '+1 culture from improved luxury resources.', {
      improvementOnResource: { category: 'luxury', yields: { culture: 1 } },
    }),
    B('RELIGIOUS_IDOLS', 'Religious Idols', '+2 faith from improved bonus resources.', {
      improvementOnResource: { category: 'bonus', yields: { faith: 2 } },
    }),
    B('CITY_PATRON_GODDESS', 'City Patron Goddess', '+25% production toward districts in cities without one.', {}),
    B('DANCE_OF_THE_AURORA', 'Dance of the Aurora', 'Holy Sites gain +1 faith from adjacent Tundra tiles.', {}),
    B('DESERT_FOLKLORE', 'Desert Folklore', 'Holy Sites gain +1 faith from adjacent Desert tiles.', {}),
    B('EARTH_GODDESS', 'Earth Goddess', '+1 faith from tiles with Charming or Breathtaking appeal.', {}),
    B('FIRE_GODDESS', 'Fire Goddess', 'Holy Sites gain +1 faith from adjacent Geothermal Fissures.', {}),
    B('GOD_OF_HEALING', 'God of Healing', 'Units heal +30 HP in or next to a Holy Site.', {}),
    B('GOD_OF_THE_FORGE', 'God of the Forge', '+25% production toward ancient and classical military units.', {}),
    B('GOD_OF_WAR', 'God of War', 'Bonus combat strength near friendly Holy Sites; faith from kills.', {}),
    B('GODDESS_OF_THE_HARVEST', 'Goddess of the Harvest', 'Harvesting resources or removing features yields faith.', {}),
    B('INITIATION_RITES', 'Initiation Rites', '+50 faith for each barbarian outpost cleared.', {}),
    B('MONUMENT_TO_THE_GODS', 'Monument to the Gods', '+15% production toward ancient and classical wonders.', {}),
    B('SACRED_PATH', 'Sacred Path', 'Holy Sites gain +1 culture and +1 faith from adjacent Rainforest tiles.', {}),
  ].map((b) => [b.id, b]),
);

export const FOLLOWER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('WORK_ETHIC', 'Work Ethic', 'Holy Site adjacency bonus also provides production.', {
      workEthic: true,
    }),
    B('FEED_THE_WORLD', 'Feed the World', 'Shrines +1 food, Temples +2 food.', {
      buildingYields: { SHRINE: { food: 1 }, TEMPLE: { food: 2 } },
    }),
    B('CHORAL_MUSIC', 'Choral Music', 'Shrines +2 culture, Temples +4 culture.', {
      buildingYields: { SHRINE: { culture: 2 }, TEMPLE: { culture: 4 } },
    }),
    B('RELIGIOUS_COMMUNITY', 'Religious Community', '+1 housing from Shrines and Temples.', {
      buildingHousing: { SHRINE: 1, TEMPLE: 1 },
    }),
    B('ZEN_MEDITATION', 'Zen Meditation', '+1 amenity in cities with 2+ specialty districts.', {
      amenitiesIfSpecialty: { min: 2, amenities: 1 },
    }),
    B('DIVINE_INSPIRATION', 'Divine Inspiration', '+2 faith from each world wonder in the city.', {
      faithPerWonder: 2,
    }),
    B('JESUIT_EDUCATION', 'Jesuit Education', 'May purchase Campus and Theater Square buildings with faith.', {}),
    B('RELIQUARIES', 'Reliquaries', 'Triple faith and tourism from relics.', {}),
    B('WARRIOR_MONKS', 'Warrior Monks', 'May train Warrior Monks (a religious melee unit).', {}),
  ].map((b) => [b.id, b]),
);

export const FOUNDER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('TITHE', 'Tithe', '+1 gold for every 4 followers.', {
      perFollowers: { per: 4, yields: { gold: 1 } },
    }),
    B('WORLD_CHURCH', 'World Church', '+1 culture for every 5 followers.', {
      perFollowers: { per: 5, yields: { culture: 1 } },
    }),
    B('CROSS_CULTURAL_DIALOGUE', 'Cross-Cultural Dialogue', '+1 science for every 5 followers.', {
      perFollowers: { per: 5, yields: { science: 1 } },
    }),
    B('CHURCH_PROPERTY', 'Church Property', '+2 gold for each city following your religion.', {
      perCity: { gold: 2 },
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
  ].map((b) => [b.id, b]),
);

/**
 * Enhancer beliefs — the fifth belief slot, added when a founded
 * religion is ENHANCED (real Civ 6: spend a second Great Prophet / an
 * Apostle). Every real GS enhancer boosts a system this engine does not model
 * (religious pressure range, missionary/apostle spread & cost, theological or
 * territorial religious combat, faith-generating trade routes), so they land
 * INERT (empty effects). The slot, catalog and seat-0 choose-path exist; the
 * effects and seat enhancer claiming are deferred follow-ups.
 */
export const ENHANCER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('ITINERANT_PREACHERS', 'Itinerant Preachers', 'Religious pressure spreads two tiles further.', {
      pressureRangeBonus: 2,
    }),
    B('SCRIPTURE', 'Scripture', 'Missionaries and Apostles gain +1 spread charge and stronger pressure.', {
      missionaryChargeBonus: 1,
      spreadPressureMult: 1.5, // lump 10 → 15
    }),
    B('JUST_WAR', 'Just War', '+10 combat strength near cities following your religion.', {
      combatNearFollowing: 10, // within JUST_WAR_RANGE, unit-vs-unit
    }),
    B('DEFENDER_OF_THE_FAITH', 'Defender of the Faith', '+5 combat strength when defending in friendly-religion territory.', {
      combatDefendFollowing: 5,
    }),
    B('CRUSADE', 'Crusade', '+10 combat strength against units in cities following your religion.', {
      combatVsUnitInFollowing: 10,
    }),
    B('HOLY_ORDER', 'Holy Order', 'Missionaries and Apostles are 30% cheaper to purchase.', {
      missionaryCostMult: 0.7, // 60 → 42 faith
    }),
    B('MESSENGER_OF_THE_GODS', 'Messenger of the Gods', '+2 gold and +2 faith from trade routes to cities of your religion.', {
      tradeReligionYields: { gold: 2, faith: 2 },
    }),
  ].map((b) => [b.id, b]),
);

export const WORSHIP_BUILDINGS = ['CATHEDRAL', 'GURDWARA', 'MEETING_HOUSE', 'PAGODA', 'STUPA'];

export const RELIGION_NAMES = [
  'Buddhism', 'Catholicism', 'Confucianism', 'Hinduism', 'Islam', 'Judaism',
  'Orthodoxy', 'Protestantism', 'Shinto', 'Sikhism', 'Taoism', 'Zoroastrianism',
];

export const PANTHEON_FAITH_COST = 25;

/** a founded religion's holy city spreads pressure to every city within
 * this many tiles each turn (real Civ 6's base holy-city pressure radius).
 * Itinerant Preachers adds its pressureRangeBonus to THIS religion's
 * radius (per-religion range in spreadReligiousPressure). */
export const RELIGION_PRESSURE_RANGE = 10;
export const JUST_WAR_RANGE = 3;
export const RELIGION_PRESSURE_PER_TURN = 1;
/** the lump a missionary SPREAD adds to the target city's accumulator
 * for its owner religion — a decade of ambient (+1/turn), so a spread flips
 * decisively but ambient can re-erode. Real Civ 6 spreads ~200 vs ~30/turn
 * ambient; same ratio class. SCRIPTURE multiplies ×1.5 → 15 (integer). */
export const SPREAD_PRESSURE = 10;
export const MISSIONARY_CAP = 2;
export const APOSTLE_CAP = 1;
/** Master switch for the city-attack religion adder, written and mirrored at
 * all six sites. */
export const CITY_RELIGION_ADDER_LIVE = true;

/**
 * THEOLOGICAL COMBAT. CIV6: the winner's religion gains pressure "in all
 * cities within 10 tiles" and the loser's sheds the same. The real swing is
 * 250, on a scale where a Missionary spread is ~200; `SPREAD_PRESSURE` puts
 * this model at a twentieth of that, so the SWING is scale-relative where the
 * RANGE is in tiles and is not.
 */
export const THEO_PRESSURE_RANGE = 10;
export const THEO_PRESSURE_SWING = 15;

/** CIV 6: MARTYR — "a Relic is created if this Apostle dies in Theological
 *  Combat" — is ONE of the NINE Apostle promotions (Chaplain, Debater, Heathen
 *  Conversion, Indulgence Vendor, Martyr, Orator, Pilgrim, Proselytizer,
 *  Translator). Picking a promotion is a DECISION and neither engine takes one
 *  without a wire record, so the promotion is DRAWN uniformly instead. The draw
 *  sits at the only moment it can matter — the apostle's death — which is
 *  distributionally identical to drawing it at creation and costs no per-unit
 *  plane. */
export const MARTYR_CHANCE = 1 / 9;

/**
 * Master switch for the pressure->yields coupling. LIVE: a city's
 * FOLLOWER-belief yields key on the CITY's `followedReligion`, so a city
 * following another seat's religion draws THAT religion's follower belief and
 * a city following none gets no follower-belief yields. INERT: they key on the
 * OWNER's religion instead. PANTHEON, FOUNDER and ENHANCER beliefs stay
 * per-civ either way. The lookup is `withFollowerBelief`, not `getModifiers`.
 * Mirrored to the GPU via `rules.followerCoupling`.
 */
export const B18_FOLLOWER_COUPLING_LIVE = true;
