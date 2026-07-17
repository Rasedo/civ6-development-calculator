/**
 * World wonders (base-game subset whose effects fit the modeled systems).
 * One per world; they occupy a tile like a district. Costs/effects are
 * eyeballed base Civ 6; a few unlock techs are stand-ins where the real
 * unlock isn't in our compact tree (noted inline).
 */

import type { DistrictId, TerrainId, Yields } from '../core/types';
import { GAME_SPEED } from './constants';

export interface BuiltWonderDef {
  id: string;
  name: string;
  code: string;
  cost: number;
  requiresTech?: string;
  requiresCivic?: string;
  placement: {
    /** Allowed base terrains (land wonders). */
    terrains?: TerrainId[];
    flatOnly?: boolean;
    hillsOnly?: boolean;
    requiresRiver?: boolean;
    /** Must neighbor a completed district of this type. */
    adjacentDistrict?: DistrictId;
    /** Must neighbor a tile with this resource. */
    adjacentResource?: string;
    /** Placed on coastal water adjacent to land (Colossus). */
    onCoastalWater?: boolean;
    allowFloodplains?: boolean;
  };
  /** Flat yields for the owning city. */
  cityYields?: Partial<Yields>;
  effects?: {
    /** Growth multiplier for every city in the empire (Hanging Gardens). */
    growthAllMult?: number;
    /** Amenities to cities within 6 tiles (Colosseum). */
    regionalAmenities?: number;
    /** +2 food +2 gold +1 production on this city's non-floodplain desert tiles. */
    petraDesert?: boolean;
    /** Multipliers on the owning city's final yields (Ruhr, Oxford, Big Ben). */
    cityYieldMult?: Partial<Yields>;
    /** Adds a wildcard policy slot (Forbidden City). */
    extraWildcardSlot?: boolean;
  };
  description: string;
}

// P4/D-15: wonder costs speed-scale like every other production cost.
const W = (def: BuiltWonderDef): BuiltWonderDef => ({ ...def, cost: Math.round(def.cost * GAME_SPEED) });

export const BUILT_WONDERS: Record<string, BuiltWonderDef> = Object.fromEntries(
  [
    W({
      id: 'STONEHENGE',
      name: 'Stonehenge',
      code: 'SH',
      cost: 180,
      requiresTech: 'ASTROLOGY',
      placement: { flatOnly: true, adjacentResource: 'STONE' },
      cityYields: { faith: 2 },
      description: '+2 faith. Flat land adjacent to Stone.',
    }),
    W({
      id: 'PYRAMIDS',
      name: 'Pyramids',
      code: 'PY',
      cost: 220,
      requiresTech: 'MASONRY',
      placement: { terrains: ['DESERT'], flatOnly: true, allowFloodplains: true },
      cityYields: { culture: 2 },
      description: '+2 culture. Desert (floodplains allowed).',
    }),
    W({
      id: 'HANGING_GARDENS',
      name: 'Hanging Gardens',
      code: 'HG',
      cost: 180,
      requiresTech: 'IRRIGATION',
      placement: { requiresRiver: true },
      effects: { growthAllMult: 1.15 },
      description: '+15% growth in all cities. Must be on a river.',
    }),
    W({
      id: 'ORACLE',
      name: 'Oracle',
      code: 'OR',
      cost: 290,
      requiresCivic: 'MYSTICISM',
      placement: { hillsOnly: true },
      cityYields: { culture: 1, faith: 1 },
      description: '+1 culture, +1 faith. Hills.',
    }),
    W({
      id: 'GREAT_LIBRARY',
      name: 'Great Library',
      code: 'GL',
      cost: 400,
      requiresCivic: 'RECORDED_HISTORY',
      placement: { flatOnly: true, adjacentDistrict: 'CAMPUS' },
      cityYields: { science: 2 },
      description: '+2 science. Flat land adjacent to a Campus.',
    }),
    W({
      id: 'COLOSSEUM',
      name: 'Colosseum',
      code: 'CO',
      cost: 400,
      requiresCivic: 'GAMES_AND_RECREATION',
      placement: { flatOnly: true, adjacentDistrict: 'ENTERTAINMENT_COMPLEX' },
      cityYields: { culture: 2 },
      effects: { regionalAmenities: 1 },
      description: '+2 culture; +1 amenity to cities within 6 tiles. Flat, adjacent to an Entertainment Complex.',
    }),
    W({
      id: 'PETRA',
      name: 'Petra',
      code: 'PE',
      cost: 400,
      requiresTech: 'MATHEMATICS',
      placement: { terrains: ['DESERT'], flatOnly: true },
      effects: { petraDesert: true },
      description: "+2 food, +2 gold, +1 production on this city's desert tiles (non-floodplain).",
    }),
    W({
      id: 'COLOSSUS',
      name: 'Colossus',
      code: 'CS',
      cost: 400,
      requiresTech: 'CELESTIAL_NAVIGATION', // stand-in for Shipbuilding
      placement: { onCoastalWater: true, adjacentDistrict: 'HARBOR' },
      cityYields: { gold: 3 },
      description: '+3 gold. Coastal water adjacent to a Harbor.',
    }),
    W({
      id: 'GREAT_ZIMBABWE',
      name: 'Great Zimbabwe',
      code: 'GZ',
      cost: 680,
      requiresTech: 'BANKING',
      placement: { flatOnly: true, adjacentDistrict: 'COMMERCIAL_HUB' },
      cityYields: { gold: 5 },
      description: '+5 gold. Flat land adjacent to a Commercial Hub.',
    }),
    W({
      id: 'FORBIDDEN_CITY',
      name: 'Forbidden City',
      code: 'FC',
      cost: 920,
      requiresTech: 'EDUCATION', // stand-in for Printing
      placement: { flatOnly: true, adjacentDistrict: 'CITY_CENTER' },
      cityYields: { culture: 5 },
      effects: { extraWildcardSlot: true },
      description: '+5 culture and an extra wildcard policy slot. Flat, adjacent to the City Center.',
    }),
    W({
      id: 'OXFORD_UNIVERSITY',
      name: 'Oxford University',
      code: 'OX',
      cost: 1450,
      requiresTech: 'ASTRONOMY', // stand-in for Scientific Theory
      placement: { flatOnly: true, adjacentDistrict: 'CAMPUS' },
      cityYields: { science: 3 },
      effects: { cityYieldMult: { science: 1.1 } },
      description: '+3 science and +10% science in this city. Flat, adjacent to a Campus.',
    }),
    W({
      id: 'RUHR_VALLEY',
      name: 'Ruhr Valley',
      code: 'RV',
      cost: 1450,
      requiresTech: 'INDUSTRIALIZATION',
      placement: { requiresRiver: true, adjacentDistrict: 'INDUSTRIAL_ZONE' },
      effects: { cityYieldMult: { production: 1.2 } },
      description: '+20% production in this city. River tile adjacent to an Industrial Zone.',
    }),
    W({
      id: 'BIG_BEN',
      name: 'Big Ben',
      code: 'BB',
      cost: 1450,
      requiresTech: 'ECONOMICS',
      placement: { requiresRiver: true, adjacentDistrict: 'COMMERCIAL_HUB' },
      cityYields: { gold: 6 },
      effects: { cityYieldMult: { gold: 1.1 } },
      description: '+6 gold and +10% gold in this city. River tile adjacent to a Commercial Hub.',
    }),

    // ========================================================================
    // B-27: world wonders 13 → 30 (index 13-29; stays within the 32-bit `wok`
    // tile-bitmask ceiling). Effects use ONLY the supported wonder channels
    // (cityYields / growthAllMult / regionalAmenities / cityYieldMult); every
    // real effect needing an absent system (tourism/appeal, naval, Great-Work
    // slots, envoys, era score, relic/martyr, policy slots, per-improvement
    // amenities, tile-terrain bonuses) is DEGRADED to flat cityYields or
    // dropped — each recorded in ROUND_B2_LOG. Placement predicates are drawn
    // only from the combos the existing 13 already exercise.
    // ========================================================================

    // --- Ancient / Classical -------------------------------------------------
    W({
      id: 'TEMPLE_OF_ARTEMIS', name: 'Temple of Artemis', code: 'TA', cost: 180,
      requiresTech: 'ARCHERY', placement: { flatOnly: true },
      cityYields: { food: 4 },
      description: '+4 food. (Real per-Camp/Pasture/Plantation amenities dropped — no channel.)',
    }),
    W({
      id: 'GREAT_BATH', name: 'Great Bath', code: 'GT', cost: 90,
      requiresTech: 'POTTERY', placement: { requiresRiver: true },
      cityYields: { faith: 1 }, effects: { regionalAmenities: 1 },
      description: '+1 faith, +1 regional amenity. (Housing + flood protection dropped.)',
    }),
    W({
      id: 'ETEMENANKI', name: 'Etemenanki', code: 'ET', cost: 220,
      requiresTech: 'WRITING', placement: { requiresRiver: true },
      cityYields: { science: 2, faith: 1 },
      description: '+2 science, +1 faith. (Marsh/Floodplains tile bonuses dropped.)',
    }),
    W({
      id: 'APADANA', name: 'Apadana', code: 'AP', cost: 400,
      requiresCivic: 'POLITICAL_PHILOSOPHY', placement: { flatOnly: true, adjacentDistrict: 'CITY_CENTER' },
      cityYields: { culture: 2 },
      description: '+2 culture. (Envoys-on-wonder-build dropped — no channel.)',
    }),
    W({
      id: 'MAUSOLEUM_AT_HALICARNASSUS', name: 'Mausoleum at Halicarnassus', code: 'MH', cost: 290,
      requiresTech: 'CELESTIAL_NAVIGATION', placement: { flatOnly: true, adjacentDistrict: 'HARBOR' },
      cityYields: { science: 1, faith: 1, culture: 1 },
      description: '+1 science/faith/culture. (Free Great Engineer/Admiral charges dropped.)',
    }),

    // --- Medieval / Renaissance ----------------------------------------------
    W({
      id: 'ALHAMBRA', name: 'Alhambra', code: 'AL', cost: 710,
      requiresTech: 'CASTLES', placement: { hillsOnly: true, adjacentDistrict: 'ENCAMPMENT' },
      effects: { regionalAmenities: 2 },
      description: '+2 regional amenities. (Military policy slot + defense dropped; Encampment adjacency ⇒ never placeable by scripted rivals.)',
    }),
    W({
      id: 'HAGIA_SOPHIA', name: 'Hagia Sophia', code: 'HS', cost: 540,
      requiresCivic: 'THEOLOGY', placement: { flatOnly: true, adjacentDistrict: 'HOLY_SITE' },
      cityYields: { faith: 4 },
      description: '+4 faith. (Missionary/Apostle spread bonus dropped.)',
    }),
    W({
      id: 'MONT_ST_MICHEL', name: 'Mont St. Michel', code: 'MS', cost: 710,
      requiresCivic: 'DIVINE_RIGHT', placement: { requiresRiver: true },
      cityYields: { faith: 2 },
      description: '+2 faith. (Relic slots / Apostle martyrdom dropped.)',
    }),
    W({
      id: 'UNIVERSITY_OF_SANKORE', name: 'University of Sankoré', code: 'US', cost: 710,
      requiresTech: 'EDUCATION', placement: { flatOnly: true, adjacentDistrict: 'CAMPUS' },
      cityYields: { science: 2, faith: 1 },
      description: '+2 science, +1 faith.',
    }),
    W({
      id: 'VENETIAN_ARSENAL', name: 'Venetian Arsenal', code: 'VA', cost: 920,
      requiresTech: 'MASS_PRODUCTION', placement: { flatOnly: true, adjacentDistrict: 'HARBOR' },
      cityYields: { production: 2 },
      description: '+2 production. (Duplicate-naval-unit ability dropped.)',
    }),
    W({
      id: 'ST_BASILS_CATHEDRAL', name: "St. Basil's Cathedral", code: 'SB', cost: 920,
      requiresCivic: 'REFORMED_CHURCH', placement: { flatOnly: true },
      cityYields: { faith: 3, culture: 1 },
      description: '+3 faith, +1 culture. (Relic slots + tundra-yield bonus dropped.)',
    }),
    W({
      id: 'TAJ_MAHAL', name: 'Taj Mahal', code: 'TM', cost: 850,
      requiresCivic: 'HUMANISM', placement: { requiresRiver: true },
      cityYields: { faith: 2, culture: 2 },
      description: '+2 faith, +2 culture. (Era-score-on-completion bonus dropped.)',
    }),
    W({
      id: 'POTALA_PALACE', name: 'Potala Palace', code: 'PP', cost: 1450,
      requiresTech: 'ASTRONOMY', placement: { hillsOnly: true },
      cityYields: { science: 2, faith: 1 },
      description: '+2 science, +1 faith. (Diplomatic policy slot dropped.)',
    }),

    // --- Industrial / Modern -------------------------------------------------
    W({
      id: 'HERMITAGE', name: 'Hermitage', code: 'HM', cost: 1200,
      requiresCivic: 'NATURAL_HISTORY', placement: { flatOnly: true, adjacentDistrict: 'THEATER_SQUARE' },
      cityYields: { culture: 3 },
      description: '+3 culture. (Great Work of Art slots dropped — Great-Works surface is Slice Q.)',
    }),
    W({
      id: 'BOLSHOI_THEATRE', name: 'Bolshoi Theatre', code: 'BT', cost: 1450,
      requiresCivic: 'OPERA_AND_BALLET', placement: { flatOnly: true, adjacentDistrict: 'THEATER_SQUARE' },
      cityYields: { culture: 3 },
      description: '+3 culture. (Great Writer/Musician points + Work slots dropped.)',
    }),
    W({
      id: 'STATUE_OF_LIBERTY', name: 'Statue of Liberty', code: 'SL', cost: 1450,
      requiresTech: 'ELECTRICITY', placement: { flatOnly: true, adjacentDistrict: 'HARBOR' },
      cityYields: { culture: 3 },
      description: '+3 culture. (Free-Great-Person + loyalty ability dropped.)',
    }),
    W({
      id: 'CRISTO_REDENTOR', name: 'Cristo Redentor', code: 'CR', cost: 1600,
      requiresTech: 'RADIO', placement: { hillsOnly: true },
      cityYields: { culture: 4 },
      description: '+4 culture. (Tourism / appeal ability dropped — no channel.)',
    }),
  ].map((w) => [w.id, w]),
);
