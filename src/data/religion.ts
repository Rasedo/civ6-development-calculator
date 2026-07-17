/**
 * Religion: pantheons, follower/founder beliefs and worship buildings
 * (base-game inspired, eyeballed values; spread/pressure isn't modeled —
 * once founded, all of your cities follow your religion, so "followers"
 * means your total population).
 */

import type { GreatPersonClass, ResourceCategory, Yields } from '../core/types';

export interface BeliefEffects {
  /** Extra yields per improvement instance. */
  improvementYields?: Partial<Record<string, Partial<Yields>>>;
  /** Extra yields on tiles with these features. */
  featureYields?: Partial<Record<string, Partial<Yields>>>;
  /** Extra yields for improvements sitting on a resource of this category. */
  improvementOnResource?: { category: ResourceCategory; yields: Partial<Yields> };
  /** Border expansion cost multiplier (0.85 = 15% cheaper). */
  borderCostMult?: number;
  /** Growth multiplier for all cities. */
  growthMult?: number;
  /** +GPP per city that has the class's district. */
  gppFlat?: Partial<Record<GreatPersonClass, number>>;
  /** Holy Site adjacency bonus also yields production (Work Ethic). */
  workEthic?: boolean;
  /** Extra yields on specific buildings. */
  buildingYields?: Partial<Record<string, Partial<Yields>>>;
  /** Extra housing on specific buildings. */
  buildingHousing?: Partial<Record<string, number>>;
  /** +1 amenity in cities with N+ specialty districts (Zen Meditation). */
  amenitiesIfSpecialty?: { min: number; amenities: number };
  /** Amenity/housing for cities whose center touches a river (River Goddess). */
  riverCity?: { amenities: number; housing: number };
  /** Faith per completed world wonder in the city (Divine Inspiration). */
  faithPerWonder?: number;
  /** Founder income per N followers (followers = your total population). */
  perFollowers?: { per: number; yields: Partial<Yields> };
  /** Founder income per city. */
  perCity?: Partial<Yields>;
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
    // B-18/B-27: catalog expansion to the real GS pantheon roster (25 total).
    // Two land on the improvementOnResource channel; the rest need absent
    // systems (Holy-Site adjacency, tile appeal, combat, production-toward-X)
    // and land INERT (empty effects) — every degradation recorded in
    // gpu/ROUND_B2_LOG.md.
    B('GODDESS_OF_FESTIVALS', 'Goddess of Festivals', '+1 culture from improved luxury resources.', {
      // GS: +1 culture from Plantation/Vineyard luxuries. Degrade: any
      // improvement on a luxury resource (channel is improvement-agnostic).
      improvementOnResource: { category: 'luxury', yields: { culture: 1 } },
    }),
    B('RELIGIOUS_IDOLS', 'Religious Idols', '+2 faith from improved bonus resources.', {
      // GS: +2 faith from Mines/Quarries over bonus & luxury resources.
      // Degrade: bonus category only, improvement-agnostic.
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
    // B-18/B-27: real GS follower beliefs whose effects need absent systems
    // (faith-purchase of non-worship buildings, relics/tourism, unique units)
    // — land INERT, recorded in gpu/ROUND_B2_LOG.md.
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
    // B-18/B-27: real GS founder beliefs to 8 total. Two land on existing
    // channels (perCity, buildingYields); two need absent systems (city-state
    // envoy influence, allied bonuses) and land INERT. Recorded in the log.
    B('PILGRIMAGE', 'Pilgrimage', '+2 faith for each city following your religion.', {
      // GS: +2 faith per FOREIGN city following. Degrade: perCity applies to
      // all cities following (the engine has no foreign-follower split yet).
      perCity: { faith: 2 },
    }),
    B('STEWARDSHIP', 'Stewardship', '+1 science from Libraries/Universities and +1 gold from Markets/Banks.', {
      // GS: gated on a Governor + religion-following. Degrade: applies to the
      // founder civ's cities unconditionally via the buildingYields channel.
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
 * B-18: Enhancer beliefs — the fifth belief slot, added when a founded
 * religion is ENHANCED (real Civ 6: spend a second Great Prophet / an
 * Apostle). Every real GS enhancer boosts a system this engine does not model
 * (religious pressure range, missionary/apostle spread & cost, theological or
 * territorial religious combat, faith-generating trade routes), so they land
 * INERT (empty effects). The slot, catalog and player choose-path exist; the
 * effects and rival enhancer claiming are deferred follow-ups (see
 * gpu/ROUND_B2_LOG.md).
 */
export const ENHANCER_BELIEFS: Record<string, BeliefDef> = Object.fromEntries(
  [
    B('ITINERANT_PREACHERS', 'Itinerant Preachers', 'Religious pressure spreads two tiles further.', {}),
    B('SCRIPTURE', 'Scripture', 'Missionaries and Apostles gain +1 spread charge and stronger pressure.', {}),
    B('JUST_WAR', 'Just War', '+10 combat strength near cities following your religion.', {}),
    B('DEFENDER_OF_THE_FAITH', 'Defender of the Faith', '+5 combat strength when defending in friendly-religion territory.', {}),
    B('CRUSADE', 'Crusade', '+10 combat strength against units in cities following your religion.', {}),
    B('HOLY_ORDER', 'Holy Order', 'Missionaries and Apostles are 30% cheaper to purchase.', {}),
    B('MESSENGER_OF_THE_GODS', 'Messenger of the Gods', '+2 gold and +2 faith from trade routes to cities of your religion.', {}),
  ].map((b) => [b.id, b]),
);

/** Worship buildings: exactly one is unlocked by founding (player's pick). */
export const WORSHIP_BUILDINGS = ['CATHEDRAL', 'GURDWARA', 'MEETING_HOUSE', 'PAGODA', 'STUPA'];

export const RELIGION_NAMES = [
  'Buddhism', 'Catholicism', 'Confucianism', 'Hinduism', 'Islam', 'Judaism',
  'Orthodoxy', 'Protestantism', 'Shinto', 'Sikhism', 'Taoism', 'Zoroastrianism',
];

export const PANTHEON_FAITH_COST = 25;
