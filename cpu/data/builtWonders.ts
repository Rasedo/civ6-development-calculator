/**
 * World wonders (base-game subset whose effects fit the modeled systems).
 * One per world; they occupy a tile like a district. EVERY ROW IS SOURCED:
 * cost, requiresTech/requiresCivic, the whole effect list and the PLACEMENT
 * clause come from the GS Civilopedia page for that wonder, fetched one by
 * one. `wonderTerrainOk` (core/rules.ts) reads the static half of the clause
 * and the exporter bakes it per tile into `wok`; everything that can change
 * during a game stays live in `canPlaceWonder` / `_wonder_cand`.
 *
 * A wonder that holds GREAT WORKS is a holder row of `GW_HOLDERS`
 * (data/greatWorks.ts), with its own slots beside the buildings'. Each row's `description` states what the row
 * PAYS here; docs/AUDIT.md carries the effects still missing.
 */

import type { DistrictId, FeatureId, GreatPersonClass, ImprovementId, TerrainId, Yields } from '../core/types';
import type { SlotKind } from './policies';
import { GAME_SPEED } from './constants';
import { xml, type SrcMap } from './provenance';

export interface BuiltWonderDef {
  id: string;
  /** PROVENANCE, per column (cpu/data/provenance.ts): the install row and
   *  column each number came from. Stripped by the exporter; checked by
   *  tools/civ6lab/xml_check.py. */
  src?: SrcMap;
  name: string;
  code: string;
  cost: number;
  requiresTech?: string;
  requiresCivic?: string;
  placement: {
    terrains?: TerrainId[];
    /** Terrain the wonder REFUSES — the Hermitage's "non-Desert and
     *  non-Tundra tile" is the only shape the source states this way. */
    excludeTerrains?: TerrainId[];
    flatOnly?: boolean;
    hillsOnly?: boolean;
    requiresRiver?: boolean;
    /** Must stand ON one of these features. */
    onFeature?: FeatureId[];
    /** Must neighbor a MOUNTAIN. */
    adjacentMountain?: boolean;
    /** Must neighbor a completed district of this type. */
    adjacentDistrict?: DistrictId;
    /** ...and that district's city must hold this building. */
    adjacentDistrictBuilding?: string;
    /** Must neighbor a tile with this resource. */
    adjacentResource?: string;
    /** Must neighbor a tile carrying this improvement. */
    adjacentImprovement?: ImprovementId;
    /** Must neighbor the owner's CAPITAL city centre. */
    adjacentCapital?: boolean;
    /** The seat must have founded a religion. */
    requiresReligion?: boolean;
    /** CIV6: "on Coast adjacent to land" — every wonder that asks for it
     *  also says "It cannot be built on a Lake", so this means COAST. */
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
    /** CIV6 (Great Bath): faith "for every time a tile belonging to this
     *  city has been Flooded" — reads `Tile.floodCount`. */
    faithPerFlood?: number;
    /** CIV6 (Ruhr Valley): "+1 Production for each Mine and Quarry in this
     *  city" — yields the HOLDING city gains per matching unpillaged
     *  improvement on a tile that city owns. */
    cityYieldPerImprovement?: { improvements: ImprovementId[]; yields: Partial<Yields> };
    /** CIV6 (Great Library): "Receive boosts to all Ancient and Classical era
     *  technologies" — every technology of this era index or lower is boosted
     *  once, at completion. -1 for none. */
    boostTechsThroughEra?: number;
    /** CIV6 (Great Library): "Receive a random tech boost after another
     *  player recruits a Great Scientist." */
    rivalScientistBoost?: boolean;
    /** CIV6 (Oracle): "Districts in this city provide +2 Great Person points
     *  of their type." */
    districtGpPoints?: number;
    /** CIV6 (Oracle): "diminishes all Patronage Faith costs by 25%" —
     *  Faith only, never the Gold price. */
    patronageFaithPct?: number;
    /** CIV6 (Pyramids): "Grants a free Builder" — the unit id spawned at
     *  the completing city, free. */
    grantUnit?: string;
    /** CIV6 (Great Zimbabwe): "Your Trade Routes from this city get +2 Gold
     *  for every Bonus resource within 3 tiles of the city and in this
     *  city's territory." */
    bonusResRouteGold?: number;
    /** CIV6 (University of Sankore): "+2 Science for every Trade Route to
     *  this city." */
    routesToCityScience?: number;
    /** CIV6 (University of Sankore): "Domestic Trade Routes give an
     *  additional +1 Faith to this city." */
    domesticRoutesToCityFaith?: number;
    /** CIV6 (University of Sankore): "Other Civilizations' Trade Routes to
     *  this city provide +1 Science and +1 Gold for them" — the SENDER's
     *  yields, paid by the destination's wonder. */
    foreignRoutesToCitySender?: { science: number; gold: number };
    /** CIV6 (Stonehenge): "Grants a free Great Prophet (or a free Apostle
     *  if no Prophets are available)" — the class offer claimed FREE at
     *  completion, with the page's Apostle fallback. */
    grantProphet?: boolean;
    /** CIV6 (Stonehenge): "Prophets may found a religion on Stonehenge
     *  instead of a Holy Site" — widens the founding gate; the Holy City
     *  stays the capital-centre convention either way. */
    religionSite?: boolean;
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
    /** CIV6 (Mausoleum at Halicarnassus): "All Engineers have an additional
     *  charge. (Applies to both existing Great Engineers and Military
     *  Engineers.)" — so it is paid once to the live ones AND at creation. */
    engineerCharges?: number;
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
    /** Cristo Redentor: relic and holy-city tourism ignores rival Enlightenment. */
    holyTourismShield?: boolean;
    /** The owner's cities within this many tiles of the wonder never lose loyalty. */
    loyaltyAura?: number;
    /** Defence strength for a unit standing on the wonder tile, fortification included. */
    occupyDefense?: number;
    /** CIV6 (Biosphere): every renewable Power source this seat holds pays
     *  `BIOSPHERE_POWER_MULT` times its published figure, and pays Tourism
     *  equal to the Power it ends up supplying. */
    renewablePowerBoost?: boolean;
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
      effects: { grantProphet: true, religionSite: true },
      description: '+2 faith, a free Great Prophet, and a religion may be founded here instead of at a Holy Site. Flat land adjacent to Stone.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_STONEHENGE', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_STONEHENGE', 'PrereqTech', { expect: 'TECH_ASTROLOGY' }),
        'cityYields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_STONEHENGE&YieldType=YIELD_FAITH', 'YieldChange'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_STONEHENGE', 'TerrainType')] },
        'placement.adjacentResource': xml('Buildings', 'BuildingType=BUILDING_STONEHENGE', 'AdjacentResource', { expect: 'RESOURCE_STONE' }),
        'effects.grantProphet': { derived: 'true where the install grants a GREAT_PERSON_CLASS_PROPHET at completion', inputs: [xml('ModifierArguments', 'ModifierId=STONEHENGE_GRANT_PROPHET&Name=GreatPersonClassType', 'Value')] },
        'effects.religionSite': xml('Buildings', 'BuildingType=BUILDING_STONEHENGE', 'AllowsHolyCity'),
      },
    }),
    W({
      id: 'PYRAMIDS',
      name: 'Pyramids',
      code: 'PY',
      cost: 220,
      requiresTech: 'MASONRY',
      placement: { terrains: ['DESERT'], flatOnly: true, allowFloodplains: true },
      cityYields: { culture: 2 },
      effects: { buildCharges: 1, grantUnit: 'BUILDER' },
      description: '+2 culture, a free Builder; every Builder trained carries an extra build charge. Desert (floodplains allowed).',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_PYRAMIDS', 'Cost', { scale: GAME_SPEED }),
        'placement.terrains': { derived: 'the Building_ValidTerrains rows of this wonder, as engine terrain ids', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_PYRAMIDS', 'TerrainType')] },
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_PYRAMIDS', 'PrereqTech', { expect: 'TECH_MASONRY' }),
        'cityYields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_PYRAMIDS&YieldType=YIELD_CULTURE', 'YieldChange'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_PYRAMIDS', 'TerrainType')] },
        'placement.allowFloodplains': { derived: 'true where Building_ValidFeatures carries FEATURE_FLOODPLAINS', inputs: [xml('Building_ValidFeatures', 'BuildingType=BUILDING_PYRAMIDS', 'FeatureType')] },
        'effects.buildCharges': xml('ModifierArguments', 'ModifierId=PYRAMID_ADJUST_BUILDER_CHARGES&Name=Amount', 'Value'),
        'effects.grantUnit': xml('ModifierArguments', 'ModifierId=PYRAMID_GRANT_BUILDERS&Name=UnitType', 'Value', { expect: 'UNIT_BUILDER' }),
      },
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
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_HANGING_GARDENS', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_HANGING_GARDENS', 'PrereqTech', { expect: 'TECH_IRRIGATION' }),
        'placement.requiresRiver': xml('Buildings', 'BuildingType=BUILDING_HANGING_GARDENS', 'RequiresRiver'),
        'effects.growthAllMult': { derived: '1 + Amount/100 — the install writes the percentage, this catalog the multiplier', inputs: [xml('ModifierArguments', 'ModifierId=HANGING_GARDEN_ADDGROWTH&Name=Amount', 'Value')] },
        'effects.cityHousing': xml('Buildings', 'BuildingType=BUILDING_HANGING_GARDENS', 'Housing'),
      },
    }),
    W({
      id: 'ORACLE',
      name: 'Oracle',
      code: 'OR',
      cost: 290,
      requiresCivic: 'MYSTICISM',
      placement: { hillsOnly: true },
      cityYields: { culture: 1, faith: 1 },
      effects: { districtGpPoints: 2, patronageFaithPct: 25 },
      description: '+1 culture, +1 faith, districts in this city give +2 Great Person points of their type, Patronage faith costs -25%. Hills.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_ORACLE', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_ORACLE', 'PrereqCivic', { expect: 'CIVIC_MYSTICISM' }),
        'cityYields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_ORACLE&YieldType=YIELD_CULTURE', 'YieldChange'),
        'cityYields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_ORACLE&YieldType=YIELD_FAITH', 'YieldChange'),
        'placement.hillsOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a HILLS terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_ORACLE', 'TerrainType')] },
        'effects.districtGpPoints': xml('ModifierArguments', 'ModifierId=ORACLE_GREATSCIENTISTPOINTS&Name=Amount', 'Value'),
        'effects.patronageFaithPct': xml('ModifierArguments', 'ModifierId=ORACLE_PATRONAGE_FAITH_DISCOUNT&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'GREAT_LIBRARY',
      name: 'Great Library',
      code: 'GL',
      cost: 400,
      requiresCivic: 'RECORDED_HISTORY',
      placement: { flatOnly: true, adjacentDistrict: 'CAMPUS', adjacentDistrictBuilding: 'LIBRARY' },
      cityYields: { science: 2 },
      effects: { gpPoints: { SCIENTIST: 1, WRITER: 1 }, boostTechsThroughEra: 1, rivalScientistBoost: true },
      description: '+2 science, +1 Scientist and +1 Writer point per turn, 2 Great Work of Writing slots, boosts every Ancient and Classical technology. Flat land adjacent to a Campus.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_GREAT_LIBRARY', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_GREAT_LIBRARY', 'PrereqCivic', { expect: 'CIVIC_RECORDED_HISTORY' }),
        'cityYields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_GREAT_LIBRARY&YieldType=YIELD_SCIENCE', 'YieldChange'),
        'effects.gpPoints.SCIENTIST': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_GREAT_LIBRARY&GreatPersonClassType=GREAT_PERSON_CLASS_SCIENTIST', 'PointsPerTurn'),
        'effects.gpPoints.WRITER': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_GREAT_LIBRARY&GreatPersonClassType=GREAT_PERSON_CLASS_WRITER', 'PointsPerTurn'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_GREAT_LIBRARY', 'TerrainType')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_GREAT_LIBRARY', 'AdjacentDistrict', { expect: 'DISTRICT_CAMPUS' }),
        'effects.boostTechsThroughEra': { derived: 'the era INDEX of the modifier\'s EndEraType (ERA_CLASSICAL = 1)', inputs: [xml('ModifierArguments', 'ModifierId=GREAT_LIBRARY_ANCIENT_CLASSICAL_TECH_BOOSTS&Name=EndEraType', 'Value')] },
        'effects.rivalScientistBoost': { derived: 'true where the install grants a tech boost on another player\'s Great Scientist', inputs: [xml('ModifierArguments', 'ModifierId=GREATLIBRARY_BOOST_SCIENTIST&Name=OtherPlayers', 'Value')] },
      },
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
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_COLOSSEUM', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_COLOSSEUM', 'PrereqCivic', { expect: 'CIVIC_GAMES_RECREATION' }),
        'cityYields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_COLOSSEUM&YieldType=YIELD_CULTURE', 'YieldChange'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_COLOSSEUM', 'TerrainType')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_COLOSSEUM', 'AdjacentDistrict', { expect: 'DISTRICT_ENTERTAINMENT_COMPLEX' }),
        'effects.regionalAmenities': xml('Buildings', 'BuildingType=BUILDING_COLOSSEUM', 'Entertainment'),
      },
    }),
    W({
      id: 'PETRA',
      name: 'Petra',
      code: 'PE',
      cost: 400,
      requiresTech: 'MATHEMATICS',
      placement: { terrains: ['DESERT'], flatOnly: true, allowFloodplains: true },
      effects: {
        tileYields: [{ terrain: 'DESERT', excludeFeature: 'FLOODPLAINS', yields: { food: 2, gold: 2, production: 1 } }],
      },
      description: "+2 food, +2 gold, +1 production on this city's non-floodplain desert tiles.",
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_PETRA', 'Cost', { scale: GAME_SPEED }),
        'placement.terrains': { derived: 'the Building_ValidTerrains rows of this wonder, as engine terrain ids', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_PETRA', 'TerrainType')] },
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_PETRA', 'PrereqTech', { expect: 'TECH_MATHEMATICS' }),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_PETRA', 'TerrainType')] },
        'placement.allowFloodplains': { derived: 'true where Building_ValidFeatures carries FEATURE_FLOODPLAINS', inputs: [xml('Building_ValidFeatures', 'BuildingType=BUILDING_PETRA', 'FeatureType')] },
        'effects.tileYields.0.yields.food': { derived: 'element 0 of the comma-joined Amount list the install packs into ONE ModifierArguments row (3 yields, one modifier)', inputs: [xml('ModifierArguments', 'ModifierId=PETRA_YIELD_MODIFIER&Name=Amount', 'Value'), xml('ModifierArguments', 'ModifierId=PETRA_YIELD_MODIFIER&Name=YieldType', 'Value')] },
        'effects.tileYields.0.yields.gold': { derived: 'element 1 of the comma-joined Amount list the install packs into ONE ModifierArguments row (3 yields, one modifier)', inputs: [xml('ModifierArguments', 'ModifierId=PETRA_YIELD_MODIFIER&Name=Amount', 'Value'), xml('ModifierArguments', 'ModifierId=PETRA_YIELD_MODIFIER&Name=YieldType', 'Value')] },
        'effects.tileYields.0.yields.production': { derived: 'element 2 of the comma-joined Amount list the install packs into ONE ModifierArguments row (3 yields, one modifier)', inputs: [xml('ModifierArguments', 'ModifierId=PETRA_YIELD_MODIFIER&Name=Amount', 'Value'), xml('ModifierArguments', 'ModifierId=PETRA_YIELD_MODIFIER&Name=YieldType', 'Value')] },
        'effects.tileYields.0.terrain': xml('Building_ValidTerrains', 'BuildingType=BUILDING_PETRA', 'TerrainType', { expect: 'TERRAIN_DESERT' }),
      },
    }),
    // CIV6 (Biosphere): "+200% Power for all Offshore Windfarms, Solar Farms,
    // Wind Farms, Geothermal Plants, and Hydroelectric Dams. This building and
    // these improvements provide Tourism equal to their Power." Built "along a
    // River adjacent to a Neighborhood district".
    W({
      id: 'BIOSPHERE',
      name: 'Biosphere',
      code: 'Bi',
      cost: 1740,
      requiresTech: 'SYNTHETIC_MATERIALS',
      placement: { requiresRiver: true, adjacentDistrict: 'NEIGHBORHOOD' },
      effects: { renewablePowerBoost: true },
      description: '+200% Power from every renewable source, and Tourism equal to the Power they supply. On a river beside a Neighborhood.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_BIOSPHERE', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_BIOSPHERE', 'PrereqTech', { expect: 'TECH_SYNTHETIC_MATERIALS' }),
        'placement.requiresRiver': xml('Buildings', 'BuildingType=BUILDING_BIOSPHERE', 'RequiresRiver'),
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_BIOSPHERE', 'AdjacentDistrict', { expect: 'DISTRICT_NEIGHBORHOOD' }),
        'effects.renewablePowerBoost': { derived: 'true where the install carries a modified-free-power modifier', inputs: [xml('ModifierArguments', 'ModifierId=BIOSPHERE_MODIFIED_FREE_POWER&Name=Amount', 'Value')] },
      },
    }),
    W({
      id: 'COLOSSUS',
      name: 'Colossus',
      code: 'CS',
      cost: 400,
      requiresTech: 'SHIPBUILDING',
      placement: { onCoastalWater: true, adjacentDistrict: 'HARBOR' },
      cityYields: { gold: 3 },
      effects: { gpPoints: { ADMIRAL: 1 }, grantUnit: 'TRADER' },
      description: '+3 gold, +1 Admiral point per turn, +1 Trade Route capacity, and a free Trader. Coastal water adjacent to a Harbor.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_COLOSSUS', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_COLOSSUS', 'PrereqTech', { expect: 'TECH_SHIPBUILDING' }),
        'cityYields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_COLOSSUS&YieldType=YIELD_GOLD', 'YieldChange'),
        'effects.gpPoints.ADMIRAL': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_COLOSSUS&GreatPersonClassType=GREAT_PERSON_CLASS_ADMIRAL', 'PointsPerTurn'),
        'placement.onCoastalWater': { derived: 'true where the install row is Coast-only, MustNotBeLake and MustBeAdjacentLand', inputs: [xml('Buildings', 'BuildingType=BUILDING_COLOSSUS', 'MustNotBeLake'), xml('Buildings', 'BuildingType=BUILDING_COLOSSUS', 'MustBeAdjacentLand')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_COLOSSUS', 'AdjacentDistrict', { expect: 'DISTRICT_HARBOR' }),
        'effects.grantUnit': xml('ModifierArguments', 'ModifierId=COLOSSUS_GRANT_TRADER&Name=UnitType', 'Value', { expect: 'UNIT_TRADER' }),
      },
    }),
    W({
      id: 'GREAT_ZIMBABWE',
      name: 'Great Zimbabwe',
      code: 'GZ',
      cost: 920,
      requiresTech: 'BANKING',
      placement: { adjacentResource: 'CATTLE', adjacentDistrict: 'COMMERCIAL_HUB', adjacentDistrictBuilding: 'MARKET' },
      cityYields: { gold: 5 },
      effects: { gpPoints: { MERCHANT: 2 }, bonusResRouteGold: 2 },
      description: '+5 gold, +2 Merchant points per turn, +1 Trade Route capacity, and +2 Gold on every outgoing route per bonus resource this city holds within 3 tiles. Flat land adjacent to a Commercial Hub.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_GREAT_ZIMBABWE', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_GREAT_ZIMBABWE', 'PrereqTech', { expect: 'TECH_BANKING' }),
        'cityYields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_GREAT_ZIMBABWE&YieldType=YIELD_GOLD', 'YieldChange'),
        'effects.gpPoints.MERCHANT': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_GREAT_ZIMBABWE&GreatPersonClassType=GREAT_PERSON_CLASS_MERCHANT', 'PointsPerTurn'),
        'placement.adjacentResource': xml('Buildings', 'BuildingType=BUILDING_GREAT_ZIMBABWE', 'AdjacentResource', { expect: 'RESOURCE_CATTLE' }),
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_GREAT_ZIMBABWE', 'AdjacentDistrict', { expect: 'DISTRICT_COMMERCIAL_HUB' }),
        'effects.bonusResRouteGold': xml('ModifierArguments', 'ModifierId=GREAT_ZIMBABWE_DOMESTICBONUSRESOURCEGOLD&Name=Amount', 'Value'),
      },
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
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_FORBIDDEN_CITY', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_FORBIDDEN_CITY', 'PrereqTech', { expect: 'TECH_PRINTING' }),
        'cityYields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_FORBIDDEN_CITY&YieldType=YIELD_CULTURE', 'YieldChange'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_FORBIDDEN_CITY', 'TerrainType')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_FORBIDDEN_CITY', 'AdjacentDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
        'effects.extraSlots.wildcard': { derived: 'one slot per SLOT_WILDCARD government-slot modifier the install attaches', inputs: [xml('ModifierArguments', 'ModifierId=FORBIDDEN_CITY_WILDCARD_GOVERNMENT_SLOT&Name=GovernmentSlotType', 'Value')] },
      },
    }),
    W({
      id: 'OXFORD_UNIVERSITY',
      name: 'Oxford University',
      code: 'OX',
      cost: 1240,
      requiresTech: 'SCIENTIFIC_THEORY',
      placement: { terrains: ['GRASSLAND', 'PLAINS'], flatOnly: true, adjacentDistrict: 'CAMPUS', adjacentDistrictBuilding: 'UNIVERSITY' },
      effects: { gpPoints: { SCIENTIST: 3 }, cityYieldMult: { science: 1.2 }, freeTechs: 2 },
      description: '+3 Scientist points per turn, +20% science in this city, 2 free technologies at completion, 2 Great Work of Writing slots. Flat, adjacent to a Campus.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_OXFORD_UNIVERSITY', 'Cost', { scale: GAME_SPEED }),
        'placement.terrains': { derived: 'the Building_ValidTerrains rows of this wonder, as engine terrain ids', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_OXFORD_UNIVERSITY', 'TerrainType')] },
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_OXFORD_UNIVERSITY', 'PrereqTech', { expect: 'TECH_SCIENTIFIC_THEORY' }),
        'effects.gpPoints.SCIENTIST': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_OXFORD_UNIVERSITY&GreatPersonClassType=GREAT_PERSON_CLASS_SCIENTIST', 'PointsPerTurn'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_OXFORD_UNIVERSITY', 'TerrainType')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_OXFORD_UNIVERSITY', 'AdjacentDistrict', { expect: 'DISTRICT_CAMPUS' }),
        'effects.cityYieldMult.science': { derived: '1 + Amount/100 — the install writes the percentage, this catalog the multiplier', inputs: [xml('ModifierArguments', 'ModifierId=OXFORD_ADDSCIENCEYIELD&Name=Amount', 'Value')] },
        'effects.freeTechs': xml('ModifierArguments', 'ModifierId=OXFORD_UNIVERSITY_FREE_TECHS&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'RUHR_VALLEY',
      name: 'Ruhr Valley',
      code: 'RV',
      cost: 1240,
      requiresTech: 'INDUSTRIALIZATION',
      placement: { requiresRiver: true, adjacentDistrict: 'INDUSTRIAL_ZONE', adjacentDistrictBuilding: 'FACTORY' },
      effects: {
        cityYieldMult: { production: 1.2 },
        cityYieldPerImprovement: { improvements: ['MINE', 'QUARRY'], yields: { production: 1 } },
      },
      description: '+20% production in this city, +1 production per Mine and Quarry it owns. River tile adjacent to an Industrial Zone.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_RUHR_VALLEY', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_RUHR_VALLEY', 'PrereqTech', { expect: 'TECH_INDUSTRIALIZATION' }),
        'placement.requiresRiver': xml('Buildings', 'BuildingType=BUILDING_RUHR_VALLEY', 'RequiresRiver'),
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_RUHR_VALLEY', 'AdjacentDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
        'effects.cityYieldMult.production': { derived: '1 + Amount/100 — the install writes the percentage, this catalog the multiplier', inputs: [xml('ModifierArguments', 'ModifierId=RUHRVALLEY_ADDPRODUCTIONYIELD&Name=Amount', 'Value')] },
        'effects.cityYieldPerImprovement.yields.production': xml('ModifierArguments', 'ModifierId=RUHR_VALLEY_PRODUCTION_MODIFIER&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'BIG_BEN',
      name: 'Big Ben',
      code: 'BB',
      cost: 1450,
      requiresTech: 'ECONOMICS',
      placement: { requiresRiver: true, adjacentDistrict: 'COMMERCIAL_HUB', adjacentDistrictBuilding: 'BANK' },
      cityYields: { gold: 6 },
      effects: { gpPoints: { MERCHANT: 3 }, extraSlots: { economic: 1 }, treasuryMult: 1.5 },
      description: '+6 gold, +3 Merchant points per turn, an extra economic policy slot, and half the treasury again at completion. River tile adjacent to a Commercial Hub.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_BIG_BEN', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_BIG_BEN', 'PrereqTech', { expect: 'TECH_ECONOMICS' }),
        'cityYields.gold': xml('Building_YieldChanges', 'BuildingType=BUILDING_BIG_BEN&YieldType=YIELD_GOLD', 'YieldChange'),
        'effects.gpPoints.MERCHANT': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_BIG_BEN&GreatPersonClassType=GREAT_PERSON_CLASS_MERCHANT', 'PointsPerTurn'),
        'placement.requiresRiver': xml('Buildings', 'BuildingType=BUILDING_BIG_BEN', 'RequiresRiver'),
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_BIG_BEN', 'AdjacentDistrict', { expect: 'DISTRICT_COMMERCIAL_HUB' }),
        'effects.extraSlots.economic': { derived: 'one slot per SLOT_ECONOMIC government-slot modifier the install attaches', inputs: [xml('ModifierArguments', 'ModifierId=BIG_BEN_ECONOMIC_GOVERNMENT_SLOT&Name=GovernmentSlotType', 'Value')] },
        'effects.treasuryMult': { derived: '1 + Amount/100 — the install writes the percentage, this catalog the multiplier', inputs: [xml('ModifierArguments', 'ModifierId=BIG_BEN_INCREASE_GOLD&Name=Amount', 'Value')] },
      },
    }),

    W({
      id: 'TEMPLE_OF_ARTEMIS', name: 'Temple of Artemis', code: 'TA', cost: 180,
      requiresTech: 'ARCHERY', placement: { adjacentImprovement: 'CAMP' },
      cityYields: { food: 4 },
      effects: {
        cityHousing: 3,
        amenityPerImprovement: { improvements: ['CAMP', 'PASTURE', 'PLANTATION'], range: 4 },
      },
      description: '+4 food, +3 housing, and +1 amenity per Camp, Pasture or Plantation within 4 tiles.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_TEMPLE_ARTEMIS', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_TEMPLE_ARTEMIS', 'PrereqTech', { expect: 'TECH_ARCHERY' }),
        'cityYields.food': xml('Building_YieldChanges', 'BuildingType=BUILDING_TEMPLE_ARTEMIS&YieldType=YIELD_FOOD', 'YieldChange'),
        'placement.adjacentImprovement': xml('Buildings', 'BuildingType=BUILDING_TEMPLE_ARTEMIS', 'AdjacentImprovement', { expect: 'IMPROVEMENT_CAMP' }),
        'effects.cityHousing': xml('Buildings', 'BuildingType=BUILDING_TEMPLE_ARTEMIS', 'Housing'),
      },
    }),
    W({
      id: 'GREAT_BATH', name: 'Great Bath', code: 'GT', cost: 180,
      requiresTech: 'POTTERY', placement: { onFeature: ['FLOODPLAINS'], allowFloodplains: true },
      effects: { cityHousing: 3, cityAmenities: 1, floodMitigation: true, faithPerFlood: 1 },
      description: '+3 housing, +1 amenity, +1 faith per flood the city has taken, and floods along its river do no damage.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_GREAT_BATH', 'Cost', { scale: GAME_SPEED }),
        'placement.onFeature': { derived: 'the Building_RequiredFeatures rows of this wonder, as engine feature ids', inputs: [xml('Building_RequiredFeatures', 'BuildingType=BUILDING_GREAT_BATH', 'FeatureType')] },
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_GREAT_BATH', 'PrereqTech', { expect: 'TECH_POTTERY' }),
        'placement.allowFloodplains': { derived: 'true where Building_RequiredFeatures carries FEATURE_FLOODPLAINS', inputs: [xml('Building_RequiredFeatures', 'BuildingType=BUILDING_GREAT_BATH', 'FeatureType')] },
        'effects.cityHousing': xml('Buildings', 'BuildingType=BUILDING_GREAT_BATH', 'Housing'),
        'effects.cityAmenities': xml('Buildings', 'BuildingType=BUILDING_GREAT_BATH', 'Entertainment'),
        'effects.floodMitigation': xml('Buildings_XP2', 'BuildingType=BUILDING_GREAT_BATH', 'PreventsFloods'),
        'effects.faithPerFlood': xml('ModifierArguments', 'ModifierId=GREATBATH_FLOODFAITH&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'ETEMENANKI', name: 'Etemenanki', code: 'ET', cost: 220,
      requiresTech: 'WRITING', placement: { onFeature: ['FLOODPLAINS', 'MARSH'], allowFloodplains: true },
      cityYields: { science: 2 },
      effects: {
        tileYields: [
          { feature: 'MARSH', empire: true, yields: { science: 2, production: 1 } },
          { feature: 'FLOODPLAINS', yields: { science: 1, production: 1 } },
        ],
      },
      description: "+2 science; +2 science and +1 production on every Marsh in the empire; +1 science and +1 production on this city's Floodplains.",
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_ETEMENANKI', 'Cost', { scale: GAME_SPEED }),
        'placement.onFeature': { derived: 'the Building_RequiredFeatures rows of this wonder, as engine feature ids', inputs: [xml('Building_RequiredFeatures', 'BuildingType=BUILDING_ETEMENANKI', 'FeatureType')] },
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_ETEMENANKI', 'PrereqTech', { expect: 'TECH_WRITING' }),
        'cityYields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_ETEMENANKI&YieldType=YIELD_SCIENCE', 'YieldChange'),
        'placement.allowFloodplains': { derived: 'true where Building_RequiredFeatures carries FEATURE_FLOODPLAINS', inputs: [xml('Building_RequiredFeatures', 'BuildingType=BUILDING_ETEMENANKI', 'FeatureType')] },
        'effects.tileYields.0.yields.science': xml('ModifierArguments', 'ModifierId=ETEMENANKI_SCIENCE_MARSH&Name=Amount', 'Value'),
        'effects.tileYields.0.yields.production': xml('ModifierArguments', 'ModifierId=ETEMENANKI_PRODUCTION_MARSH&Name=Amount', 'Value'),
        'effects.tileYields.1.yields.science': xml('ModifierArguments', 'ModifierId=ETEMENANKI_SCIENCE_FLOODPLAINS&Name=Amount', 'Value'),
        'effects.tileYields.1.yields.production': xml('ModifierArguments', 'ModifierId=ETEMENANKI_PRODUCTION_FLOODPLAINS&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'APADANA', name: 'Apadana', code: 'AP', cost: 400,
      requiresCivic: 'POLITICAL_PHILOSOPHY', placement: { adjacentCapital: true },
      effects: { envoysPerWonder: 2 },
      description: '+2 envoys each time a wonder completes in this city, Apadana included.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_APADANA', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_APADANA', 'PrereqCivic', { expect: 'CIVIC_POLITICAL_PHILOSOPHY' }),
        'placement.adjacentCapital': xml('Buildings', 'BuildingType=BUILDING_APADANA', 'AdjacentCapital'),
        'effects.envoysPerWonder': xml('ModifierArguments', 'ModifierId=APADANA_AWARD_TWO_INFLUENCE_TOKEN_MODIFIER&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'MAUSOLEUM_AT_HALICARNASSUS', name: 'Mausoleum at Halicarnassus', code: 'MH', cost: 400,
      requiresCivic: 'DEFENSIVE_TACTICS', placement: { adjacentDistrict: 'HARBOR' },
      effects: { tileYields: [{ terrain: 'COAST', yields: { science: 1, faith: 1, culture: 1 } }], engineerCharges: 1 },
      description: "+1 science, +1 faith and +1 culture on this city's Coast tiles. Great Engineers have an additional charge.",
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_HALICARNASSUS_MAUSOLEUM', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_HALICARNASSUS_MAUSOLEUM', 'PrereqCivic', { expect: 'CIVIC_DEFENSIVE_TACTICS' }),
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_HALICARNASSUS_MAUSOLEUM', 'AdjacentDistrict', { expect: 'DISTRICT_HARBOR' }),
        'effects.tileYields.0.yields.science': { derived: 'element 0 of the comma-joined Amount list the install packs into ONE ModifierArguments row (3 yields, one modifier)', inputs: [xml('ModifierArguments', 'ModifierId=HALICARNASSUS_MAUSOLEUM_YIELD_MODIFIER&Name=Amount', 'Value'), xml('ModifierArguments', 'ModifierId=HALICARNASSUS_MAUSOLEUM_YIELD_MODIFIER&Name=YieldType', 'Value')] },
        'effects.tileYields.0.yields.faith': { derived: 'element 1 of the comma-joined Amount list the install packs into ONE ModifierArguments row (3 yields, one modifier)', inputs: [xml('ModifierArguments', 'ModifierId=HALICARNASSUS_MAUSOLEUM_YIELD_MODIFIER&Name=Amount', 'Value'), xml('ModifierArguments', 'ModifierId=HALICARNASSUS_MAUSOLEUM_YIELD_MODIFIER&Name=YieldType', 'Value')] },
        'effects.tileYields.0.yields.culture': { derived: 'element 2 of the comma-joined Amount list the install packs into ONE ModifierArguments row (3 yields, one modifier)', inputs: [xml('ModifierArguments', 'ModifierId=HALICARNASSUS_MAUSOLEUM_YIELD_MODIFIER&Name=Amount', 'Value'), xml('ModifierArguments', 'ModifierId=HALICARNASSUS_MAUSOLEUM_YIELD_MODIFIER&Name=YieldType', 'Value')] },
        'effects.engineerCharges': xml('ModifierArguments', 'ModifierId=HALICARNASSUS_ADJUST_ENGINEER_CHARGES&Name=Amount', 'Value'),
      },
    }),

    W({
      id: 'ALHAMBRA', name: 'Alhambra', code: 'AL', cost: 710,
      requiresTech: 'CASTLES', placement: { hillsOnly: true, adjacentDistrict: 'ENCAMPMENT' },
      effects: { cityAmenities: 2, gpPoints: { GENERAL: 2 }, extraSlots: { military: 1 }, occupyDefense: 4 },
      description: '+2 amenities, +2 General points per turn, an extra military policy slot, and +4 defence for the unit standing on it. Encampment adjacency is required.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_ALHAMBRA', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_ALHAMBRA', 'PrereqTech', { expect: 'TECH_CASTLES' }),
        'effects.gpPoints.GENERAL': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_ALHAMBRA&GreatPersonClassType=GREAT_PERSON_CLASS_GENERAL', 'PointsPerTurn'),
        'placement.hillsOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a HILLS terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_ALHAMBRA', 'TerrainType')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_ALHAMBRA', 'AdjacentDistrict', { expect: 'DISTRICT_ENCAMPMENT' }),
        'effects.cityAmenities': xml('Buildings', 'BuildingType=BUILDING_ALHAMBRA', 'Entertainment'),
        'effects.extraSlots.military': { derived: 'one slot per SLOT_MILITARY government-slot modifier the install attaches', inputs: [xml('ModifierArguments', 'ModifierId=ALHAMBRA_MILITARY_GOVERNMENT_SLOT&Name=GovernmentSlotType', 'Value')] },
        'effects.occupyDefense': xml('Buildings', 'BuildingType=BUILDING_ALHAMBRA', 'DefenseModifier'),
      },
    }),
    W({
      id: 'HAGIA_SOPHIA', name: 'Hagia Sophia', code: 'HS', cost: 710,
      requiresTech: 'BUTTRESS', placement: { flatOnly: true, adjacentDistrict: 'HOLY_SITE', requiresReligion: true },
      cityYields: { faith: 4 },
      effects: { spreadCharges: 1 },
      description: '+4 faith; every Missionary and Apostle spreads one extra time.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_HAGIA_SOPHIA', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_HAGIA_SOPHIA', 'PrereqTech', { expect: 'TECH_BUTTRESS' }),
        'cityYields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_HAGIA_SOPHIA&YieldType=YIELD_FAITH', 'YieldChange'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_HAGIA_SOPHIA', 'TerrainType')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_HAGIA_SOPHIA', 'AdjacentDistrict', { expect: 'DISTRICT_HOLY_SITE' }),
        'placement.requiresReligion': xml('Buildings', 'BuildingType=BUILDING_HAGIA_SOPHIA', 'RequiresReligion'),
        'effects.spreadCharges': xml('ModifierArguments', 'ModifierId=HAGIA_SOPHIA_ADJUST_RELIGIOUS_CHARGES&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'MONT_ST_MICHEL', name: 'Mont St. Michel', code: 'MS', cost: 710,
      requiresCivic: 'DIVINE_RIGHT', placement: { onFeature: ['FLOODPLAINS', 'MARSH'], allowFloodplains: true },
      cityYields: { faith: 2 },
      effects: { apostleMartyr: true, occupyDefense: 6 },
      description: '+2 faith, 2 relic slots; every Apostle carries Martyr, and the unit standing on it gets +6 defence.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_MONT_ST_MICHEL', 'Cost', { scale: GAME_SPEED }),
        'placement.onFeature': { derived: 'the Building_RequiredFeatures rows of this wonder, as engine feature ids', inputs: [xml('Building_RequiredFeatures', 'BuildingType=BUILDING_MONT_ST_MICHEL', 'FeatureType')] },
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_MONT_ST_MICHEL', 'PrereqCivic', { expect: 'CIVIC_DIVINE_RIGHT' }),
        'cityYields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_MONT_ST_MICHEL&YieldType=YIELD_FAITH', 'YieldChange'),
        'placement.allowFloodplains': { derived: 'true where Building_RequiredFeatures carries FEATURE_FLOODPLAINS', inputs: [xml('Building_RequiredFeatures', 'BuildingType=BUILDING_MONT_ST_MICHEL', 'FeatureType')] },
        'effects.apostleMartyr': { derived: 'true where the install grants PROMOTION_MARTYR to the owner\'s units', inputs: [xml('ModifierArguments', 'ModifierId=MONT_ST_MICHEL_GRANT_MARTYR&Name=PromotionType', 'Value')] },
        'effects.occupyDefense': xml('Buildings', 'BuildingType=BUILDING_MONT_ST_MICHEL', 'DefenseModifier'),
      },
    }),
    W({
      id: 'UNIVERSITY_OF_SANKORE', name: 'University of Sankoré', code: 'US', cost: 710,
      requiresTech: 'EDUCATION', placement: { terrains: ['DESERT'], adjacentDistrict: 'CAMPUS', adjacentDistrictBuilding: 'UNIVERSITY' },
      cityYields: { science: 3, faith: 1 },
      effects: {
        gpPoints: { SCIENTIST: 2 },
        routesToCityScience: 2,
        domesticRoutesToCityFaith: 1,
        foreignRoutesToCitySender: { science: 1, gold: 1 },
      },
      description: '+3 science, +1 faith, +2 Scientist points per turn; +2 science per route to this city, +1 faith per domestic one, and foreign senders earn +1 science +1 gold.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY_SANKORE', 'Cost', { scale: GAME_SPEED }),
        'placement.terrains': { derived: 'the Building_ValidTerrains rows of this wonder, as engine terrain ids', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_UNIVERSITY_SANKORE', 'TerrainType')] },
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY_SANKORE', 'PrereqTech', { expect: 'TECH_EDUCATION' }),
        'cityYields.science': xml('Building_YieldChanges', 'BuildingType=BUILDING_UNIVERSITY_SANKORE&YieldType=YIELD_SCIENCE', 'YieldChange'),
        'cityYields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_UNIVERSITY_SANKORE&YieldType=YIELD_FAITH', 'YieldChange'),
        'effects.gpPoints.SCIENTIST': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_UNIVERSITY_SANKORE&GreatPersonClassType=GREAT_PERSON_CLASS_SCIENTIST', 'PointsPerTurn'),
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_UNIVERSITY_SANKORE', 'AdjacentDistrict', { expect: 'DISTRICT_CAMPUS' }),
        'effects.routesToCityScience': xml('ModifierArguments', 'ModifierId=SANKORE_TRADE_GAIN_SCIENCE&Name=Amount', 'Value'),
        'effects.domesticRoutesToCityFaith': xml('ModifierArguments', 'ModifierId=SANKORE_TRADE_DOMESTIC_FAITH&Name=Amount', 'Value'),
        'effects.foreignRoutesToCitySender.science': xml('ModifierArguments', 'ModifierId=SANKORE_TRADE_OFFER_SCIENCE&Name=Amount', 'Value'),
        'effects.foreignRoutesToCitySender.gold': xml('ModifierArguments', 'ModifierId=SANKORE_TRADE_OFFER_GOLD&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'VENETIAN_ARSENAL', name: 'Venetian Arsenal', code: 'VA', cost: 920,
      requiresTech: 'MASS_PRODUCTION', placement: { onCoastalWater: true, adjacentDistrict: 'INDUSTRIAL_ZONE' },
      effects: { gpPoints: { ENGINEER: 2 }, duplicateNavalTrain: true },
      description: '+2 Engineer points per turn; a trained naval unit arrives twice.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_VENETIAN_ARSENAL', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_VENETIAN_ARSENAL', 'PrereqTech', { expect: 'TECH_MASS_PRODUCTION' }),
        'effects.gpPoints.ENGINEER': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_VENETIAN_ARSENAL&GreatPersonClassType=GREAT_PERSON_CLASS_ENGINEER', 'PointsPerTurn'),
        'placement.onCoastalWater': { derived: 'true where the install row is Coast-only, MustNotBeLake and MustBeAdjacentLand', inputs: [xml('Buildings', 'BuildingType=BUILDING_VENETIAN_ARSENAL', 'MustNotBeLake'), xml('Buildings', 'BuildingType=BUILDING_VENETIAN_ARSENAL', 'MustBeAdjacentLand')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_VENETIAN_ARSENAL', 'AdjacentDistrict', { expect: 'DISTRICT_INDUSTRIAL_ZONE' }),
        'effects.duplicateNavalTrain': { derived: 'true where the install gives every naval class an extra unit copy', inputs: [xml('ModifierArguments', 'ModifierId=VENETIAN_ARSENAL_EXTRANAVALMELEE&Name=Amount', 'Value')] },
      },
    }),
    W({
      id: 'ST_BASILS_CATHEDRAL', name: "St. Basil's Cathedral", code: 'SB', cost: 920,
      requiresCivic: 'REFORMED_CHURCH', placement: { adjacentDistrict: 'CITY_CENTER' },
      effects: {
        religiousTourismMult: 2,
        tileYields: [{ terrain: 'TUNDRA', yields: { food: 1, production: 1, culture: 1 } }],
      },
      description: '3 relic slots, double relic tourism from this city, and +1 food, +1 production and +1 culture on its Tundra tiles.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_ST_BASILS_CATHEDRAL', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_ST_BASILS_CATHEDRAL', 'PrereqCivic', { expect: 'CIVIC_REFORMED_CHURCH' }),
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_ST_BASILS_CATHEDRAL', 'AdjacentDistrict', { expect: 'DISTRICT_CITY_CENTER' }),
        'effects.religiousTourismMult': { derived: 'ScalingFactor / 100', inputs: [xml('ModifierArguments', 'ModifierId=STBASILS_ADDRELIGIOUSTOURISM&Name=ScalingFactor', 'Value')] },
        'effects.tileYields.0.yields.food': xml('ModifierArguments', 'ModifierId=STBASILS_ADDFOOD_MODIFIER&Name=Amount', 'Value'),
        'effects.tileYields.0.yields.production': xml('ModifierArguments', 'ModifierId=STBASILS_ADDPRODUCTION_MODIFIER&Name=Amount', 'Value'),
        'effects.tileYields.0.yields.culture': xml('ModifierArguments', 'ModifierId=STBASILS_ADDCULTURE_MODIFIER&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'TAJ_MAHAL', name: 'Taj Mahal', code: 'TM', cost: 920,
      requiresCivic: 'HUMANISM', placement: { requiresRiver: true },
      effects: { eraScorePerMoment: 1 },
      description: '+1 era score for every era-score moment worth 2 or more.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_TAJ_MAHAL', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_TAJ_MAHAL', 'PrereqCivic', { expect: 'CIVIC_HUMANISM' }),
        'placement.requiresRiver': xml('Buildings', 'BuildingType=BUILDING_TAJ_MAHAL', 'RequiresRiver'),
        'effects.eraScorePerMoment': xml('ModifierArguments', 'ModifierId=TAJ_MAHAL_EXTRA_ERA_SCORE&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'POTALA_PALACE', name: 'Potala Palace', code: 'PP', cost: 1060,
      requiresTech: 'ASTRONOMY', placement: { hillsOnly: true, adjacentMountain: true },
      cityYields: { culture: 2, faith: 3 },
      effects: { dvp: 1, extraSlots: { diplomatic: 1 } },
      description: '+2 culture, +3 faith, +1 Diplomatic Victory point, +1 diplomatic policy slot.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_POTALA_PALACE', 'Cost', { scale: GAME_SPEED }),
        requiresTech: xml('Buildings', 'BuildingType=BUILDING_POTALA_PALACE', 'PrereqTech', { expect: 'TECH_ASTRONOMY' }),
        'cityYields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_POTALA_PALACE&YieldType=YIELD_CULTURE', 'YieldChange'),
        'cityYields.faith': xml('Building_YieldChanges', 'BuildingType=BUILDING_POTALA_PALACE&YieldType=YIELD_FAITH', 'YieldChange'),
        'placement.hillsOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a HILLS terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_POTALA_PALACE', 'TerrainType')] },
        'placement.adjacentMountain': xml('Buildings', 'BuildingType=BUILDING_POTALA_PALACE', 'AdjacentToMountain'),
        'effects.dvp': xml('ModifierArguments', 'ModifierId=POTALA_DIPLOVP&Name=Amount', 'Value'),
        'effects.extraSlots.diplomatic': { derived: 'one slot per SLOT_DIPLOMATIC government-slot modifier the install attaches', inputs: [xml('ModifierArguments', 'ModifierId=POTALA_PALACE_DIPLOMATIC_GOVERNMENT_SLOT&Name=GovernmentSlotType', 'Value')] },
      },
    }),

    W({
      id: 'HERMITAGE', name: 'Hermitage', code: 'HM', cost: 1450,
      requiresCivic: 'NATURAL_HISTORY', placement: { requiresRiver: true, excludeTerrains: ['DESERT', 'TUNDRA'] },
      effects: { gpPoints: { ARTIST: 3 } },
      description: '+3 Artist points per turn, 4 Great Work of Art slots.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_HERMITAGE', 'Cost', { scale: GAME_SPEED }),
        'placement.excludeTerrains': { derived: 'the terrains ABSENT from the wonder\'s Building_ValidTerrains rows; the install lists what is allowed where this catalog lists what is refused', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_HERMITAGE', 'TerrainType')] },
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_HERMITAGE', 'PrereqCivic', { expect: 'CIVIC_NATURAL_HISTORY' }),
        'effects.gpPoints.ARTIST': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_HERMITAGE&GreatPersonClassType=GREAT_PERSON_CLASS_ARTIST', 'PointsPerTurn'),
        'placement.requiresRiver': xml('Buildings', 'BuildingType=BUILDING_HERMITAGE', 'RequiresRiver'),
      },
    }),
    W({
      id: 'BOLSHOI_THEATRE', name: 'Bolshoi Theatre', code: 'BT', cost: 1240,
      requiresCivic: 'OPERA_AND_BALLET', placement: { flatOnly: true, adjacentDistrict: 'THEATER_SQUARE' },
      effects: { gpPoints: { WRITER: 2, MUSICIAN: 2 }, freeCivics: 2 },
      description: '+2 Writer and +2 Musician points per turn, +1 Writing and +1 Music Great Work slot, 2 free civics at completion.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_BOLSHOI_THEATRE', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_BOLSHOI_THEATRE', 'PrereqCivic', { expect: 'CIVIC_OPERA_BALLET' }),
        'effects.gpPoints.WRITER': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_BOLSHOI_THEATRE&GreatPersonClassType=GREAT_PERSON_CLASS_WRITER', 'PointsPerTurn'),
        'effects.gpPoints.MUSICIAN': xml('Building_GreatPersonPoints', 'BuildingType=BUILDING_BOLSHOI_THEATRE&GreatPersonClassType=GREAT_PERSON_CLASS_MUSICIAN', 'PointsPerTurn'),
        'placement.flatOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a FLAT terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_BOLSHOI_THEATRE', 'TerrainType')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_BOLSHOI_THEATRE', 'AdjacentDistrict', { expect: 'DISTRICT_THEATER' }),
        'effects.freeCivics': xml('ModifierArguments', 'ModifierId=BOLSHOI_THEATRE_FREE_CIVICS&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'STATUE_OF_LIBERTY', name: 'Statue of Liberty', code: 'SL', cost: 1240,
      requiresCivic: 'CIVIL_ENGINEERING', placement: { onCoastalWater: true, adjacentDistrict: 'HARBOR' },
      effects: { dvp: 4, loyaltyAura: 6 },
      description: '+4 Diplomatic Victory points on completion; your cities within 6 tiles never lose loyalty.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_STATUE_LIBERTY', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_STATUE_LIBERTY', 'PrereqCivic', { expect: 'CIVIC_CIVIL_ENGINEERING' }),
        'placement.onCoastalWater': { derived: 'true where the install row is Coast-only, MustNotBeLake and MustBeAdjacentLand', inputs: [xml('Buildings', 'BuildingType=BUILDING_STATUE_LIBERTY', 'MustNotBeLake'), xml('Buildings', 'BuildingType=BUILDING_STATUE_LIBERTY', 'MustBeAdjacentLand')] },
        'placement.adjacentDistrict': xml('Buildings', 'BuildingType=BUILDING_STATUE_LIBERTY', 'AdjacentDistrict', { expect: 'DISTRICT_HARBOR' }),
        'effects.dvp': xml('ModifierArguments', 'ModifierId=STATUELIBERTY_DIPLOVP&Name=Amount', 'Value'),
      },
    }),
    W({
      id: 'CRISTO_REDENTOR', name: 'Cristo Redentor', code: 'CR', cost: 1620,
      requiresCivic: 'MASS_MEDIA', placement: { hillsOnly: true },
      cityYields: { culture: 4 },
      effects: { resortTourismMult: 2, holyTourismShield: true },
      description: '+4 culture; your Seaside Resorts pay double tourism; your relic and holy-city tourism ignores rival Enlightenment.',
      src: {
        code: { stylized: 'a display code, not a game constant' },
        cost: xml('Buildings', 'BuildingType=BUILDING_CRISTO_REDENTOR', 'Cost', { scale: GAME_SPEED }),
        requiresCivic: xml('Buildings', 'BuildingType=BUILDING_CRISTO_REDENTOR', 'PrereqCivic', { expect: 'CIVIC_MASS_MEDIA' }),
        'cityYields.culture': xml('Building_YieldChanges', 'BuildingType=BUILDING_CRISTO_REDENTOR&YieldType=YIELD_CULTURE', 'YieldChange'),
        'placement.hillsOnly': { derived: 'true where every Building_ValidTerrains row of the wonder is a HILLS terrain', inputs: [xml('Building_ValidTerrains', 'BuildingType=BUILDING_CRISTO_REDENTOR', 'TerrainType')] },
        'effects.resortTourismMult': { derived: 'ScalingFactor / 100', inputs: [xml('ModifierArguments', 'ModifierId=CRISTOREDENTOR_BEACHTOURISM&Name=ScalingFactor', 'Value')] },
        'effects.holyTourismShield': { derived: 'true where the install turns on always-full religious tourism', inputs: [xml('ModifierArguments', 'ModifierId=CRISTOREDENTOR_FULLRELIGIOUSTOURISM&Name=Enable', 'Value')] },
      },
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
