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
  ].map((b) => [b.id, b]),
);

/** Worship buildings: exactly one is unlocked by founding (player's pick). */
export const WORSHIP_BUILDINGS = ['CATHEDRAL', 'GURDWARA', 'MEETING_HOUSE', 'PAGODA', 'STUPA'];

export const RELIGION_NAMES = [
  'Buddhism', 'Catholicism', 'Confucianism', 'Hinduism', 'Islam', 'Judaism',
  'Orthodoxy', 'Protestantism', 'Shinto', 'Sikhism', 'Taoism', 'Zoroastrianism',
];

export const PANTHEON_FAITH_COST = 25;
