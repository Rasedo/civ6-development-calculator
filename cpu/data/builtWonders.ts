/**
 * World wonders (base-game subset whose effects fit the modeled systems).
 * One per world; they occupy a tile like a district. EVERY ROW IS SOURCED:
 * cost, requiresTech/requiresCivic and the whole effect list come from the GS
 * Civilopedia page for that wonder, fetched one by one. PLACEMENT rules are
 * eyeballed where the real rule needs unmodeled terrain — NARROWED marker.
 *
 * A wonder that adds GREAT WORK or RELIC slots pays them through
 * `GW_WONDER_SLOTS` / `RELIC_WONDER_SLOTS` (data/greatPeople.ts), additive
 * with the buildings' slots. Each row's `description` states what the row
 * PAYS here; docs/AUDIT.md carries the effects still missing.
 */

import type { DistrictId, FeatureId, GreatPersonClass, ImprovementId, TerrainId, Yields } from '../core/types';
import type { SlotKind } from './policies';
import { GAME_SPEED } from './constants';

export interface BuiltWonderDef {
  id: string;
  name: string;
  code: string;
  cost: number;
  requiresTech?: string;
  requiresCivic?: string;
  placement: {
    terrains?: TerrainId[];
    flatOnly?: boolean;
    hillsOnly?: boolean;
    requiresRiver?: boolean;
    /** Must neighbor a completed district of this type. */
    adjacentDistrict?: DistrictId;
    /** Must neighbor a tile with this resource. */
    adjacentResource?: string;
    onCoastalWater?: boolean;
    allowFloodplains?: boolean;
  };
  cityYields?: Partial<Yields>;
  effects?: {
    growthAllMult?: number;
    /** Amenities to every live city centre within REGIONAL_RANGE of the wonder. */
    regionalAmenities?: number;
    /** Amenities to the city that holds the wonder, and to no other. */
    cityAmenities?: number;
    /** Housing to the city that holds the wonder. */
    cityHousing?: number;
    /** Yields added to matching tiles — the centre and the worked
     *  undistricted ones. `empire` widens the payer from the wonder's own
     *  city to every city the seat holds. */
    tileYields?: {
      terrain?: TerrainId;
      feature?: FeatureId;
      excludeFeature?: FeatureId;
      empire?: boolean;
      yields: Partial<Yields>;
    }[];
    /** +1 amenity to the holding city per matching improvement within
     *  `range` tiles of the WONDER (Temple of Artemis). */
    amenityPerImprovement?: { improvements: ImprovementId[]; range: number };
    cityYieldMult?: Partial<Yields>;
    /** Policy slots the wonder appends to its owner's government. */
    extraSlots?: Partial<Record<SlotKind, number>>;
    /** Diplomatic Victory points paid ONCE at completion. */
    dvp?: number;
    /** Great Person points per turn, by class. */
    gpPoints?: Partial<Record<GreatPersonClass, number>>;
    /** Envoys paid each time ANY wonder completes in the holding city. */
    envoysPerWonder?: number;
    /** Extra spread charges on every Missionary and Apostle the owner trains. */
    spreadCharges?: number;
    /** Extra build charges on every Builder the owner trains. */
    buildCharges?: number;
    /** Every Apostle the owner creates carries MARTYR — the draw is certain. */
    apostleMartyr?: boolean;
    /** CIV6: "Building a Dam or the Great Bath along a River will mitigate
     *  floods there. Fertilization rates will drop about 50%, but there will be
     *  no destruction anymore." */
    floodMitigation?: boolean;
    /** A trained naval unit arrives twice. Training only, never a purchase. */
    duplicateNavalTrain?: boolean;
    /** Multiplies the RELIC tourism of the holding city. */
    religiousTourismMult?: number;
    /** Multiplies the owner's Seaside Resort tourism, empire-wide. */
    resortTourismMult?: number;
    /** The owner's cities within this many tiles of the wonder never lose loyalty. */
    loyaltyAura?: number;
    /** Defence strength for a unit standing on the wonder tile, fortification included. */
    occupyDefense?: number;
    /** Civics completed outright at completion. */
    freeCivics?: number;
    /** Technologies completed outright at completion. */
    freeTechs?: number;
    /** The owner's treasury is multiplied by this at completion. */
    treasuryMult?: number;
    /** Era score paid per era-score event worth `ERA_SCORE_MOMENT_MIN` or more. */
    eraScorePerMoment?: number;
  };
  description: string;
}

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
      effects: { buildCharges: 1 },
      description: '+2 culture; every Builder trained carries an extra build charge. Desert (floodplains allowed).',
    }),
    W({
      id: 'HANGING_GARDENS',
      name: 'Hanging Gardens',
      code: 'HG',
      cost: 180,
      requiresTech: 'IRRIGATION',
      placement: { requiresRiver: true },
      effects: { growthAllMult: 1.15, cityHousing: 2 },
      description: '+15% growth in all cities, +2 housing here. Must be on a river.',
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
      effects: { gpPoints: { SCIENTIST: 1, WRITER: 1 } },
      description: '+2 science, +1 Scientist and +1 Writer point per turn, 2 Great Work of Writing slots. Flat land adjacent to a Campus.',
    }),
    W({
      id: 'COLOSSEUM',
      name: 'Colosseum',
      code: 'CO',
      cost: 400,
      requiresCivic: 'GAMES_AND_RECREATION',
      placement: { flatOnly: true, adjacentDistrict: 'ENTERTAINMENT_COMPLEX' },
      cityYields: { culture: 2 },
      effects: { regionalAmenities: 3 },
      description: '+2 culture; +3 amenities to cities within 6 tiles. Flat, adjacent to an Entertainment Complex.',
    }),
    W({
      id: 'PETRA',
      name: 'Petra',
      code: 'PE',
      cost: 400,
      requiresTech: 'MATHEMATICS',
      placement: { terrains: ['DESERT'], flatOnly: true },
      effects: {
        tileYields: [{ terrain: 'DESERT', excludeFeature: 'FLOODPLAINS', yields: { food: 2, gold: 2, production: 1 } }],
      },
      description: "+2 food, +2 gold, +1 production on this city's non-floodplain desert tiles.",
    }),
    W({
      id: 'COLOSSUS',
      name: 'Colossus',
      code: 'CS',
      cost: 400,
      requiresTech: 'SHIPBUILDING',
      placement: { onCoastalWater: true, adjacentDistrict: 'HARBOR' },
      cityYields: { gold: 3 },
      effects: { gpPoints: { ADMIRAL: 1 } },
      description: '+3 gold, +1 Admiral point per turn. Coastal water adjacent to a Harbor.',
    }),
    W({
      id: 'GREAT_ZIMBABWE',
      name: 'Great Zimbabwe',
      code: 'GZ',
      cost: 920,
      requiresTech: 'BANKING',
      placement: { flatOnly: true, adjacentDistrict: 'COMMERCIAL_HUB' },
      cityYields: { gold: 5 },
      effects: { gpPoints: { MERCHANT: 2 } },
      description: '+5 gold, +2 Merchant points per turn. Flat land adjacent to a Commercial Hub.',
    }),
    W({
      id: 'FORBIDDEN_CITY',
      name: 'Forbidden City',
      code: 'FC',
      cost: 920,
      requiresTech: 'PRINTING',
      placement: { flatOnly: true, adjacentDistrict: 'CITY_CENTER' },
      cityYields: { culture: 5 },
      effects: { extraSlots: { wildcard: 1 } },
      description: '+5 culture and an extra wildcard policy slot. Flat, adjacent to the City Center.',
    }),
    W({
      id: 'OXFORD_UNIVERSITY',
      name: 'Oxford University',
      code: 'OX',
      cost: 1240,
      requiresTech: 'SCIENTIFIC_THEORY',
      placement: { flatOnly: true, adjacentDistrict: 'CAMPUS' },
      effects: { gpPoints: { SCIENTIST: 3 }, cityYieldMult: { science: 1.2 }, freeTechs: 2 },
      description: '+3 Scientist points per turn, +20% science in this city, 2 free technologies at completion, 2 Great Work of Writing slots. Flat, adjacent to a Campus.',
    }),
    W({
      id: 'RUHR_VALLEY',
      name: 'Ruhr Valley',
      code: 'RV',
      cost: 1240,
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
      effects: { gpPoints: { MERCHANT: 3 }, extraSlots: { economic: 1 }, treasuryMult: 1.5 },
      description: '+6 gold, +3 Merchant points per turn, an extra economic policy slot, and half the treasury again at completion. River tile adjacent to a Commercial Hub.',
    }),

    W({
      id: 'TEMPLE_OF_ARTEMIS', name: 'Temple of Artemis', code: 'TA', cost: 180,
      requiresTech: 'ARCHERY', placement: { flatOnly: true },
      cityYields: { food: 4 },
      effects: {
        cityHousing: 3,
        amenityPerImprovement: { improvements: ['CAMP', 'PASTURE', 'PLANTATION'], range: 4 },
      },
      description: '+4 food, +3 housing, and +1 amenity per Camp, Pasture or Plantation within 4 tiles.',
    }),
    W({
      id: 'GREAT_BATH', name: 'Great Bath', code: 'GT', cost: 180,
      requiresTech: 'POTTERY', placement: { requiresRiver: true },
      effects: { cityHousing: 3, cityAmenities: 1, floodMitigation: true },
      description: '+3 housing, +1 amenity, and floods along its river do no damage.',
    }),
    W({
      id: 'ETEMENANKI', name: 'Etemenanki', code: 'ET', cost: 220,
      requiresTech: 'WRITING', placement: { requiresRiver: true },
      cityYields: { science: 2 },
      effects: {
        tileYields: [
          { feature: 'MARSH', empire: true, yields: { science: 2, production: 1 } },
          { feature: 'FLOODPLAINS', yields: { science: 1, production: 1 } },
        ],
      },
      description: "+2 science; +2 science and +1 production on every Marsh in the empire; +1 science and +1 production on this city's Floodplains.",
    }),
    W({
      id: 'APADANA', name: 'Apadana', code: 'AP', cost: 400,
      requiresCivic: 'POLITICAL_PHILOSOPHY', placement: { flatOnly: true, adjacentDistrict: 'CITY_CENTER' },
      effects: { envoysPerWonder: 2 },
      description: '+2 envoys each time a wonder completes in this city, Apadana included.',
    }),
    W({
      id: 'MAUSOLEUM_AT_HALICARNASSUS', name: 'Mausoleum at Halicarnassus', code: 'MH', cost: 400,
      requiresCivic: 'DEFENSIVE_TACTICS', placement: { flatOnly: true, adjacentDistrict: 'HARBOR' },
      effects: { tileYields: [{ terrain: 'COAST', yields: { science: 1, faith: 1, culture: 1 } }] },
      description: "+1 science, +1 faith and +1 culture on this city's Coast tiles.",
    }),

    W({
      id: 'ALHAMBRA', name: 'Alhambra', code: 'AL', cost: 710,
      requiresTech: 'CASTLES', placement: { hillsOnly: true, adjacentDistrict: 'ENCAMPMENT' },
      effects: { cityAmenities: 2, gpPoints: { GENERAL: 2 }, extraSlots: { military: 1 }, occupyDefense: 4 },
      description: '+2 amenities, +2 General points per turn, an extra military policy slot, and +4 defence for the unit standing on it. Encampment adjacency is required.',
    }),
    W({
      id: 'HAGIA_SOPHIA', name: 'Hagia Sophia', code: 'HS', cost: 710,
      requiresTech: 'BUTTRESS', placement: { flatOnly: true, adjacentDistrict: 'HOLY_SITE' },
      cityYields: { faith: 4 },
      effects: { spreadCharges: 1 },
      description: '+4 faith; every Missionary and Apostle spreads one extra time.',
    }),
    W({
      id: 'MONT_ST_MICHEL', name: 'Mont St. Michel', code: 'MS', cost: 710,
      requiresCivic: 'DIVINE_RIGHT', placement: { requiresRiver: true },
      cityYields: { faith: 2 },
      effects: { apostleMartyr: true, occupyDefense: 6 },
      description: '+2 faith, 2 relic slots; every Apostle carries Martyr, and the unit standing on it gets +6 defence.',
    }),
    W({
      id: 'UNIVERSITY_OF_SANKORE', name: 'University of Sankoré', code: 'US', cost: 710,
      requiresTech: 'EDUCATION', placement: { flatOnly: true, adjacentDistrict: 'CAMPUS' },
      cityYields: { science: 3, faith: 1 },
      effects: { gpPoints: { SCIENTIST: 2 } },
      description: '+3 science, +1 faith, +2 Scientist points per turn.',
    }),
    W({
      id: 'VENETIAN_ARSENAL', name: 'Venetian Arsenal', code: 'VA', cost: 920,
      requiresTech: 'MASS_PRODUCTION', placement: { flatOnly: true, adjacentDistrict: 'HARBOR' },
      effects: { gpPoints: { ENGINEER: 2 }, duplicateNavalTrain: true },
      description: '+2 Engineer points per turn; a trained naval unit arrives twice.',
    }),
    W({
      id: 'ST_BASILS_CATHEDRAL', name: "St. Basil's Cathedral", code: 'SB', cost: 920,
      requiresCivic: 'REFORMED_CHURCH', placement: { flatOnly: true },
      effects: {
        religiousTourismMult: 2,
        tileYields: [{ terrain: 'TUNDRA', yields: { food: 1, production: 1, culture: 1 } }],
      },
      description: '3 relic slots, double relic tourism from this city, and +1 food, +1 production and +1 culture on its Tundra tiles.',
    }),
    W({
      id: 'TAJ_MAHAL', name: 'Taj Mahal', code: 'TM', cost: 920,
      requiresCivic: 'HUMANISM', placement: { requiresRiver: true },
      effects: { eraScorePerMoment: 1 },
      description: '+1 era score for every era-score moment worth 2 or more.',
    }),
    W({
      id: 'POTALA_PALACE', name: 'Potala Palace', code: 'PP', cost: 1060,
      requiresTech: 'ASTRONOMY', placement: { hillsOnly: true },
      cityYields: { culture: 2, faith: 3 },
      effects: { dvp: 1, extraSlots: { diplomatic: 1 } },
      description: '+2 culture, +3 faith, +1 Diplomatic Victory point, +1 diplomatic policy slot.',
    }),

    W({
      id: 'HERMITAGE', name: 'Hermitage', code: 'HM', cost: 1450,
      requiresCivic: 'NATURAL_HISTORY', placement: { flatOnly: true, adjacentDistrict: 'THEATER_SQUARE' },
      effects: { gpPoints: { ARTIST: 3 } },
      description: '+3 Artist points per turn, 4 Great Work of Art slots.',
    }),
    W({
      id: 'BOLSHOI_THEATRE', name: 'Bolshoi Theatre', code: 'BT', cost: 1240,
      requiresCivic: 'OPERA_AND_BALLET', placement: { flatOnly: true, adjacentDistrict: 'THEATER_SQUARE' },
      effects: { gpPoints: { WRITER: 2, MUSICIAN: 2 }, freeCivics: 2 },
      description: '+2 Writer and +2 Musician points per turn, +1 Writing and +1 Music Great Work slot, 2 free civics at completion.',
    }),
    W({
      id: 'STATUE_OF_LIBERTY', name: 'Statue of Liberty', code: 'SL', cost: 1240,
      requiresCivic: 'CIVIL_ENGINEERING', placement: { flatOnly: true, adjacentDistrict: 'HARBOR' },
      effects: { dvp: 4, loyaltyAura: 6 },
      description: '+4 Diplomatic Victory points on completion; your cities within 6 tiles never lose loyalty.',
    }),
    W({
      id: 'CRISTO_REDENTOR', name: 'Cristo Redentor', code: 'CR', cost: 1620,
      requiresCivic: 'MASS_MEDIA', placement: { hillsOnly: true },
      cityYields: { culture: 4 },
      effects: { resortTourismMult: 2 },
      description: '+4 culture; your Seaside Resorts pay double tourism.',
    }),
  ].map((w) => [w.id, w]),
);

/** the ERA a wonder first becomes available — its unlock's era index. */
import { TECHS, ERAS } from './techs';
import { CIVICS } from './civics';
export const WONDER_ERA_INDEX: Record<string, number> = Object.fromEntries(
  Object.values(BUILT_WONDERS).map((w) => [
    w.id,
    w.requiresTech
      ? Math.max(0, ERAS.indexOf(TECHS[w.requiresTech]?.era))
      : w.requiresCivic
        ? Math.max(0, ERAS.indexOf(CIVICS[w.requiresCivic]?.era))
        : 0,
  ]),
);
