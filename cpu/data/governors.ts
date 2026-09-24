import { xml, type SrcMap } from './provenance';
import type { DistrictId, YieldKey } from '../../world/types';

type Yields = Partial<Record<YieldKey, number>>;

/**
 * GOVERNORS (Rise and Fall). Seven agents of the central authority, appointed
 * and promoted with Governor Titles and assigned to one city each.
 *
 * CIV6 (Governor): "with each title you may either hire a new Governor or
 * promote an existing Governor, selecting a new ability for them", and "At
 * each new assignment the Governor will need a number of turns (3 turns for
 * Victor and Ibrahim, 5 turns for the rest) to establish themselves in a
 * city ... after which they will start applying their bonus effects to that
 * city". The Loyalty boost "transfers immediately".
 *
 * IBRAHIM, the eighth, is exclusive to Suleiman of the Ottomans — a
 * civilization unique, and so out of scope by the same decision that parks
 * every other one.
 */

type GovernorId = 'REYNA' | 'VICTOR' | 'AMANI' | 'MAGNUS' | 'MOKSHA' | 'LIANG' | 'PINGALA';

interface GovernorDef {
  id: GovernorId;
  /** PROVENANCE, per column (cpu/data/provenance.ts). */
  src?: SrcMap;
  name: string;
  /** the descriptive title the Civilopedia gives — "The Financier". */
  title: string;
  /** turns to establish in a newly assigned city before the abilities apply. */
  establishTurns: number;
  /** CIV6: Amani "is also the only Governor who may be assigned not only to
   *  your own cities, but also to city-states". */
  cityStates?: boolean;
}

/** CIV6 (AIR_DEFENSE_INITIATIVE_ANTI_AIR_BONUS, Amount 25). */
export const AIR_DEFENSE_INITIATIVE_CS = 25;

/** the install's own name for each governor's role. */
const GOVERNOR_INSTALL_ID: Readonly<Record<GovernorId, string>> = {
  REYNA: 'GOVERNOR_THE_MERCHANT', VICTOR: 'GOVERNOR_THE_DEFENDER',
  AMANI: 'GOVERNOR_THE_AMBASSADOR', MAGNUS: 'GOVERNOR_THE_RESOURCE_MANAGER',
  MOKSHA: 'GOVERNOR_THE_CARDINAL', LIANG: 'GOVERNOR_THE_BUILDER',
  PINGALA: 'GOVERNOR_THE_EDUCATOR',
};

/** PROVENANCE (cpu/data/provenance.ts). `cityStates` is the install's own
 *  `Governors.AssignCityState`; the epithet and the establish clock are the
 *  Civilopedia's, which the install writes as a localisation key and a DLL
 *  magnitude respectively. */
const governorSrc = (id: GovernorId): SrcMap => ({
  title: { stylized: 'the Civilopedia epithet; the install ships a localisation key' },
  establishTurns: { pedia: 'the GS Governor page ("3 turns for Victor and Ibrahim, 5 turns for the '
    + 'rest"); the install carries no turns column' },
  cityStates: xml('Governors', `GovernorType=${GOVERNOR_INSTALL_ID[id]}`, 'AssignCityState'),
});

const RAW_GOVERNORS: readonly GovernorDef[] = [
  { id: 'REYNA', name: 'Reyna', title: 'The Financier', establishTurns: 5 },
  { id: 'VICTOR', name: 'Victor', title: 'The Castellan', establishTurns: 3 },
  { id: 'AMANI', name: 'Amani', title: 'The Diplomat', establishTurns: 5, cityStates: true },
  { id: 'MAGNUS', name: 'Magnus', title: 'The Steward', establishTurns: 5 },
  { id: 'MOKSHA', name: 'Moksha', title: 'The Cardinal', establishTurns: 5 },
  { id: 'LIANG', name: 'Liang', title: 'The Surveyor', establishTurns: 5 },
  { id: 'PINGALA', name: 'Pingala', title: 'The Educator', establishTurns: 5 },
];
export const GOVERNORS: readonly GovernorDef[] =
  RAW_GOVERNORS.map((g) => ({ ...g, src: governorSrc(g.id) }));

export const GOVERNOR_INDEX: Readonly<Record<GovernorId, number>> = Object.fromEntries(
  GOVERNORS.map((g, i) => [g.id, i]),
) as Record<GovernorId, number>;

/**
 * What a promotion pays the city it is established in. Every field is a
 * SOURCED clause of one promotion; a clause whose channel this model does not
 * have is absent here and open in the AUDIT instead.
 */
export interface GovernorEffects {
  /** flat yields added to the city. */
  cityYields?: Yields;
  /** yields per CITIZEN of the city. */
  perCitizen?: Yields;
  /** multipliers on the city's own yields (1.15 = +15%). */
  yieldMult?: Yields;
  /** faith per SPECIALTY district in the city (Bishop). */
  faithPerSpecialty?: number;
  /** district adjacency multipliers in this city (Harbormaster). */
  adjacencyMult?: Partial<Record<DistrictId, number>>;
  /** production multiplier toward DISTRICTS in this city (Zoning Commissioner). */
  districtProdMult?: number;
  /** production multiplier toward city PROJECTS (Space Initiative). */
  projectProdMult?: number;
  /** growth multiplier (Surplus Logistics). */
  growthMult?: number;
  /** great-person points multiplier (Grants). */
  gppMult?: number;
  /** gold per FOREIGN trade route whose chain passes this city (Land
   *  Acquisition). */
  passRouteGold?: number;
  /** CIV6 (Land Acquisition): "+20%" culture toward this city's border
   *  expansion — MODIFIER_SINGLE_CITY_CULTURE_BORDER_EXPANSION Amount 20. */
  borderExpansionPct?: number;
  /** great-work tourism multiplier (Curator). */
  gwTourismMult?: number;
  /** religious pressure this city exerts, multiplied (Bishop). */
  pressureMult?: number;
  /** extra build charges on Builders trained here (Guildmaster). */
  builderCharges?: number;
  /** a Settler trained here costs no population (Provision). */
  settlerFreePop?: boolean;
  /** yields from a plot harvest or feature removal, multiplied (Groundbreaker). */
  harvestMult?: number;
  /** city defense / ranged strength (Redoubt). */
  cityDefense?: number;
  /** combat strength for THIS seat's units standing in the city's territory. */
  territoryCS?: number;
  /** CIV6 (Air Defense Initiative, AIR_DEFENSE_INITIATIVE_ANTI_AIR_BONUS /
   *  MODIFIER_CITY_ADJUST_AIR_DEFENSE_BONUS, Amount 25): "+25 Combat Strength
   *  to anti-air support units within the city's territory when defending
   *  against aircraft and ICBMs." The governed city's own tiles, whoever
   *  stands on them — the same territory test Garrison Commander uses. */
  airDefenseCS?: number;
  /** CIV6 (Contractor, CONTRACTOR_ENABLE_DISTRICT_PURCHASE /
   *  MODIFIER_CITY_ADJUST_CAN_PURCHASE_DISTRICTS, CanPurchase true): "Allows
   *  city to purchase Districts with Gold." A pure permission — the price is
   *  the engine's own, GOLD_PURCHASE_MULT off the district's production cost,
   *  exactly as a building's purchase is priced. */
  districtGoldBuy?: boolean;
  /** CIV6 (Divine Architect, CARDINAL_FAITH_PURCHASE_DISTRICT /
   *  MODIFIER_GOVERNOR_ADJUST_CAN_FAITH_PURCHASE_DISTRICTS): the same
   *  permission in FAITH, at FAITH_PURCHASE_MULT. */
  districtFaithBuy?: boolean;
  /** extra ranged strikes per turn (Embrasure). */
  extraStrikes?: number;
  /** a military unit trained here starts with a free promotion (Embrasure). */
  freePromoOnTrain?: boolean;
  /** religious strength in theological combat in this city's tiles. */
  theologyCS?: number;
  /** this seat's units heal fully in one turn in this city's tiles. */
  fullHeal?: boolean;
  /** the city takes no pressure from religions this seat did not found. */
  ignoreForeignPressure?: boolean;
  /** faith equal to this share of a finished building's cost (Citadel of God). */
  faithOnBuildPct?: number;
  /** housing per NEIGHBORHOOD and AQUEDUCT, amenities per CANAL and DAM. */
  waterWorks?: boolean;
  /** loyalty per turn this city projects onto the seat's OTHER cities in range. */
  loyaltyToOwn?: { range: number; loyalty: number };
  /** loyalty per turn drained from FOREIGN cities in range (Emissary). */
  loyaltyToForeign?: { range: number; loyalty: number };
  /** enemy spies operate this many levels lower here (Local Informants). */
  spyLevelPenalty?: number;
  /** the city cannot be put under siege (Defense Logistics). */
  noSiege?: boolean;
  /** strategic stockpile per turn added empire-wide (Defense Logistics). */
  stockpilePerTurn?: number;
  /** strategic resource cost of units, discounted (Black Marketeer). */
  resourceDiscountPct?: number;
  /** while established in a CITY-STATE: envoys this governor counts as. */
  envoysAtMinor?: number;
  /** while established in a CITY-STATE: the seat's envoys there are doubled. */
  envoyDoubleAtMinor?: boolean;
  /** while established in a CITY-STATE: a copy of its luxuries (Affluence). */
  minorLuxuries?: boolean;
  /** Food onto the STARTING city of every route this seat sends here
   *  (Surplus Logistics). */
  routeStartFood?: number;
  /** every in-range INDUSTRIAL ZONE pays, not just the first (Vertical
   *  Integration). */
  industryAllSources?: boolean;
  /** nothing this city owns is damaged by an Environmental Effect
   *  (Reinforced Materials). */
  envDamageImmune?: boolean;
  /** Gold per UNIMPROVED FEATURE the city owns (Forestry Management). */
  goldPerFeature?: number;
  /** Appeal onto every tile of this city adjacent to an unimproved feature
   *  (Forestry Management). */
  appealNearFeature?: number;
  /** extra promotions banked on a religious unit bought here, taken with its
   *  first (Patron Saint). */
  firstPromoBonus?: number;
}

/** The promotion catalog is longer than 32 rows and JavaScript's bitwise
 *  operators are 32-bit — `1 << 36` is `1 << 4` — so the held-promotion mask
 *  is built from exact powers of two, which a number carries to 2^53. The
 *  GPU's twin is an int64 plane and needs no such care. */
export const promotionBitValue = (index: number): number => 2 ** index;
export const promotionBit = (mask: number, index: number): boolean =>
  Math.floor(mask / 2 ** index) % 2 === 1;

interface GovernorPromotionDef {
  id: string;
  name: string;
  governor: GovernorId;
  /** 0 = the default ability every appointment carries, then I, II, III. */
  tier: number;
  /** promotion ids of which AT LEAST ONE must already be held. */
  requires?: readonly string[];
  description: string;
  effects: GovernorEffects;
  /** PROVENANCE, per column — see PROMO_INSTALL_ID / PROMO_SRC below. */
  src?: SrcMap;
}

/**
 * The install's own id for each promotion. It is NOT
 * `GOVERNOR_PROMOTION_<ROLE>_<NAME>` uniformly — half the table drops the role
 * (GOVERNOR_PROMOTION_REDOUBT, _ZONING_COMMISSIONER, _WATER_WORKS), two rows
 * carry the WRONG role (Victor's Arms Race Proponent is filed under EDUCATOR,
 * Pingala's Curator under MERCHANT; GovernorPromotionSets is what actually
 * assigns them), and three are renamed outright: Provision = EXPEDITION,
 * Reinforced Materials = REINFORCED_INFRASTRUCTURE, Renewable Subsidizer =
 * MERCHANT_RENEWABLE_ENERGY.
 */
const PROMO_INSTALL_ID: Readonly<Record<string, string>> = {
  LAND_ACQUISITION: 'GOVERNOR_PROMOTION_MERCHANT_LAND_ACQUISITION',
  HARBORMASTER: 'GOVERNOR_PROMOTION_MERCHANT_HARBORMASTER',
  FORESTRY_MANAGEMENT: 'GOVERNOR_PROMOTION_MERCHANT_FORESTRY_MANAGEMENT',
  TAX_COLLECTOR: 'GOVERNOR_PROMOTION_MERCHANT_TAX_COLLECTOR',
  CONTRACTOR: 'GOVERNOR_PROMOTION_MERCHANT_CONTRACTOR',
  RENEWABLE_SUBSIDIZER: 'GOVERNOR_PROMOTION_MERCHANT_RENEWABLE_ENERGY',
  REDOUBT: 'GOVERNOR_PROMOTION_REDOUBT',
  GARRISON_COMMANDER: 'GOVERNOR_PROMOTION_GARRISON_COMMANDER',
  DEFENSE_LOGISTICS: 'GOVERNOR_PROMOTION_DEFENSE_LOGISTICS',
  EMBRASURE: 'GOVERNOR_PROMOTION_EMBRASURE',
  AIR_DEFENSE_INITIATIVE: 'GOVERNOR_PROMOTION_AIR_DEFENSE_INITIATIVE',
  ARMS_RACE_PROPONENT: 'GOVERNOR_PROMOTION_EDUCATOR_ARMS_RACE_PROPONENT',
  MESSENGER: 'GOVERNOR_PROMOTION_AMBASSADOR_MESSENGER',
  EMISSARY: 'GOVERNOR_PROMOTION_AMBASSADOR_EMISSARY',
  AFFLUENCE: 'GOVERNOR_PROMOTION_AMBASSADOR_AFFLUENCE',
  LOCAL_INFORMANTS: 'GOVERNOR_PROMOTION_LOCAL_INFORMANTS',
  FOREIGN_INVESTOR: 'GOVERNOR_PROMOTION_AMBASSADOR_FOREIGN_INVESTOR',
  PUPPETEER: 'GOVERNOR_PROMOTION_AMBASSADOR_PUPPETEER',
  GROUNDBREAKER: 'GOVERNOR_PROMOTION_RESOURCE_MANAGER_GROUNDBREAKER',
  SURPLUS_LOGISTICS: 'GOVERNOR_PROMOTION_RESOURCE_MANAGER_SURPLUS_LOGISTICS',
  PROVISION: 'GOVERNOR_PROMOTION_RESOURCE_MANAGER_EXPEDITION',
  INDUSTRIALIST: 'GOVERNOR_PROMOTION_RESOURCE_MANAGER_INDUSTRIALIST',
  BLACK_MARKETEER: 'GOVERNOR_PROMOTION_RESOURCE_MANAGER_BLACK_MARKETEER',
  VERTICAL_INTEGRATION: 'GOVERNOR_PROMOTION_RESOURCE_MANAGER_VERTICAL_INTEGRATION',
  BISHOP: 'GOVERNOR_PROMOTION_CARDINAL_BISHOP',
  GRAND_INQUISITOR: 'GOVERNOR_PROMOTION_CARDINAL_GRAND_INQUISITOR',
  LAYING_ON_OF_HANDS: 'GOVERNOR_PROMOTION_CARDINAL_LAYING_ON_OF_HANDS',
  CITADEL_OF_GOD: 'GOVERNOR_PROMOTION_CARDINAL_CITADEL_OF_GOD',
  PATRON_SAINT: 'GOVERNOR_PROMOTION_CARDINAL_PATRON_SAINT',
  DIVINE_ARCHITECT: 'GOVERNOR_PROMOTION_CARDINAL_DIVINE_ARCHITECT',
  GUILDMASTER: 'GOVERNOR_PROMOTION_BUILDER_GUILDMASTER',
  ZONING_COMMISSIONER: 'GOVERNOR_PROMOTION_ZONING_COMMISSIONER',
  AQUACULTURE: 'GOVERNOR_PROMOTION_AQUACULTURE',
  REINFORCED_MATERIALS: 'GOVERNOR_PROMOTION_REINFORCED_INFRASTRUCTURE',
  WATER_WORKS: 'GOVERNOR_PROMOTION_WATER_WORKS',
  PARKS_AND_RECREATION: 'GOVERNOR_PROMOTION_PARKS_RECREATION',
  LIBRARIAN: 'GOVERNOR_PROMOTION_EDUCATOR_LIBRARIAN',
  CONNOISSEUR: 'GOVERNOR_PROMOTION_EDUCATOR_CONNOISSEUR',
  RESEARCHER: 'GOVERNOR_PROMOTION_EDUCATOR_RESEARCHER',
  GRANTS: 'GOVERNOR_PROMOTION_EDUCATOR_GRANTS',
  SPACE_INITIATIVE: 'GOVERNOR_PROMOTION_EDUCATOR_SPACE_INITIATIVE',
  CURATOR: 'GOVERNOR_PROMOTION_MERCHANT_CURATOR',
};

/**
 * PROVENANCE (cpu/data/provenance.ts) for each promotion's EFFECT columns.
 * `governor`, `tier` and `requires` are tagged uniformly by `promoSrc` below
 * off GovernorPromotionSets / GovernorPromotions.Level /
 * GovernorPromotionPrereqs; this table carries only what a promotion PAYS,
 * which the install writes in GovernorPromotionModifiers -> Modifiers ->
 * ModifierArguments.
 */
const PROMO_EFFECT_SRC: Readonly<Record<string, SrcMap>> = {
  LAND_ACQUISITION: {
    'effects.passRouteGold': xml('ModifierArguments',
      'ModifierId=FOREIGN_EXCHANGE_GOLD_FROM_FOREIGN_TRADE_PASSING_THROUGH&Name=Amount', 'Value'),
    'effects.borderExpansionPct': xml('ModifierArguments',
      'ModifierId=LAND_ACQUISITION_FASTER_PLOT_ANNEXING&Name=Amount', 'Value'),
  },
  HARBORMASTER: {
    'effects.adjacencyMult.COMMERCIAL_HUB': {
      derived: '1 + Amount/100 — the install writes the percentage (100), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=HARBORMASTER_BONUS_COMMERCIAL_HUB_ADJACENCY&Name=Amount', 'Value')],
    },
    'effects.adjacencyMult.HARBOR': {
      derived: '1 + Amount/100 — the install writes the percentage (100), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=HARBORMASTER_BONUS_HARBOR_ADJACENCY&Name=Amount', 'Value')],
    },
  },
  FORESTRY_MANAGEMENT: {
    'effects.goldPerFeature': xml('ModifierArguments',
      'ModifierId=FORESTRY_MANAGEMENT_FEATURE_NO_IMPROVEMENT_GOLD&Name=Amount', 'Value'),
    'effects.appealNearFeature': xml('ModifierArguments',
      'ModifierId=FORESTRY_MANAGEMENT_FEATURE_NO_IMPROVEMENT_APPEAL&Name=Amount', 'Value'),
  },
  TAX_COLLECTOR: {
    'effects.perCitizen.gold': xml('ModifierArguments',
      'ModifierId=TAX_COLLECTOR_ADJUST_CITIZEN_GPT&Name=Amount', 'Value'),
  },
  CONTRACTOR: {
    'effects.districtGoldBuy': xml('ModifierArguments',
      'ModifierId=CONTRACTOR_ENABLE_DISTRICT_PURCHASE&Name=CanPurchase', 'Value'),
  },
  REDOUBT: {
    'effects.cityDefense': xml('ModifierArguments',
      'ModifierId=DEFENDER_ADJUST_CITY_DEFENSE_STRENGTH&Name=Amount', 'Value'),
  },
  GARRISON_COMMANDER: {
    'effects.territoryCS': xml('ModifierArguments',
      'ModifierId=GARRISON_COMMANDER_ADJUST_CITY_COMBAT_BONUS&Name=Amount', 'Value'),
    'effects.loyaltyToOwn.loyalty': xml('ModifierArguments',
      'ModifierId=PRESTIGE_IDENTITY_PRESSURE_TO_DOMESTIC_CITIES&Name=Amount', 'Value'),
    'effects.loyaltyToOwn.range': { pedia: 'the published promotion text ("within 9 tiles"); the install\'s '
      + 'MODIFIER_GOVERNOR_ADJUST_GOVERNOR_IDENTITY_PRESSURE carries no radius and no GlobalParameter names one' },
  },
  DEFENSE_LOGISTICS: {
    'effects.noSiege': xml('ModifierArguments',
      'ModifierId=DEFENSE_LOGISTICS_SIEGE_PROTECTION&Name=Protected', 'Value'),
    'effects.stockpilePerTurn': xml('ModifierArguments',
      'ModifierId=DEFENSE_LOGISTICS_BONUS_STRATEGICS&Name=Amount', 'Value'),
  },
  EMBRASURE: {
    'effects.extraStrikes': xml('ModifierArguments',
      'ModifierId=CITY_DEFENDER_ADJUST_ATTACKS_PER_TURN&Name=Amount', 'Value'),
    'effects.freePromoOnTrain': xml('Modifiers', 'ModifierId=CITY_DEFENDER_FREE_PROMOTIONS', 'ModifierType',
      { expect: 'MODIFIER_CITY_TRAINED_UNITS_ADJUST_GRANT_EXPERIENCE',
        note: "its Amount is -1, the install's marker for 'one free promotion', not an XP figure" }),
  },
  AIR_DEFENSE_INITIATIVE: {
    'effects.airDefenseCS': xml('ModifierArguments',
      'ModifierId=AIR_DEFENSE_INITIATIVE_ANTI_AIR_BONUS&Name=Amount', 'Value'),
  },
  MESSENGER: {
    'effects.envoysAtMinor': xml('ModifierArguments',
      'ModifierId=MESSENGER_GRANT_FREE_ENVOYS&Name=Amount', 'Value'),
  },
  EMISSARY: {
    'effects.loyaltyToForeign.loyalty': xml('ModifierArguments',
      'ModifierId=EMISSARY_IDENTITY_PRESSURE_TO_FOREIGN_CITIES&Name=Amount', 'Value'),
    'effects.loyaltyToForeign.range': { pedia: 'the published promotion text ("within 9 tiles"); the install\'s '
      + 'MODIFIER_GOVERNOR_ADJUST_GOVERNOR_IDENTITY_PRESSURE carries no radius' },
  },
  AFFLUENCE: {
    'effects.minorLuxuries': xml('Modifiers', 'ModifierId=AFFLUENCE_COPY_LUXURIES_FOR_IMPORT', 'ModifierType',
      { expect: 'MODIFIER_GOVERNOR_ADJUST_CITY_COPY_LUXURIES_FOR_IMPORT' }),
  },
  LOCAL_INFORMANTS: {
    'effects.spyLevelPenalty': xml('ModifierArguments',
      'ModifierId=LOCAL_INFORMANTS_SPY_DEFENSE_BONUS&Name=Amount', 'Value'),
  },
  PUPPETEER: {
    'effects.envoyDoubleAtMinor': xml('ModifierArguments',
      'ModifierId=AMBASSADOR_ADJUST_CITY_ENVOY_MODIFIER&Name=Percent', 'Value',
      { expect: 100, note: 'the install writes +100% envoys; the engine spells the same thing as a boolean' }),
  },
  GROUNDBREAKER: {
    'effects.harvestMult': {
      derived: '1 + Amount/100 — the install writes the percentage (50), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=GROUNDBREAKER_BONUS_HARVEST_YIELDS&Name=Amount', 'Value')],
    },
  },
  SURPLUS_LOGISTICS: {
    'effects.growthMult': {
      derived: '1 + Amount/100 — the install writes the percentage (20), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=SURPLUS_LOGISTICS_EXTRA_GROWTH&Name=Amount', 'Value')],
    },
    'effects.routeStartFood': xml('ModifierArguments',
      'ModifierId=SURPLUS_LOGISTICS_TRADE_ROUTE_FOOD&Name=Amount', 'Value'),
  },
  PROVISION: {
    'effects.settlerFreePop': {
      derived: "the NEGATION of the install's Enabled — EXPEDITION_ADJUST_SETTLERS_CONSUME_POPULATION "
        + 'sets Enabled=false, which is what settlerFreePop=true means',
      inputs: [xml('ModifierArguments',
        'ModifierId=EXPEDITION_ADJUST_SETTLERS_CONSUME_POPULATION&Name=Enabled', 'Value')],
    },
  },
  BLACK_MARKETEER: {
    'effects.resourceDiscountPct': xml('ModifierArguments',
      'ModifierId=BLACK_MARKETEER_STRATEGIC_RESOURCE_COST_DISCOUNT&Name=Amount', 'Value'),
  },
  VERTICAL_INTEGRATION: {
    'effects.industryAllSources': xml('ModifierArguments',
      'ModifierId=VERTICAL_INTEGRATION_PRODUCTION_REGIONAL_STACKING&Name=YieldType', 'Value',
      { expect: 'YIELD_PRODUCTION' }),
  },
  BISHOP: {
    'effects.pressureMult': {
      derived: '1 + Amount/100 — the install writes the percentage (100), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=CARDINAL_BISHOP_PRESSURE&Name=Amount', 'Value')],
    },
    'effects.faithPerSpecialty': xml('ModifierArguments',
      'ModifierId=CARDINAL_BISHOP_FAITH_DISTRICT&Name=Amount', 'Value'),
  },
  GRAND_INQUISITOR: {
    'effects.theologyCS': xml('ModifierArguments',
      'ModifierId=CARDINAL_GRAND_INQUISITOR_COMBAT&Name=Amount', 'Value'),
  },
  LAYING_ON_OF_HANDS: {
    'effects.fullHeal': xml('ModifierArguments',
      'ModifierId=CARDINAL_LAYING_ON_OF_HANDS_HEAL&Name=Amount', 'Value',
      { expect: 100, note: 'the install heals 100% in one turn; the engine spells it as a boolean' }),
  },
  CITADEL_OF_GOD: {
    'effects.ignoreForeignPressure': xml('ModifierArguments',
      'ModifierId=CARDINAL_CITADEL_OF_GOD_PRESSURE&Name=Enable', 'Value'),
    'effects.faithOnBuildPct': xml('ModifierArguments',
      'ModifierId=CARDINAL_CITADEL_OF_GOD_FAITH_FINISH_BUILDINGS&Name=BuildingProductionPercent', 'Value'),
  },
  PATRON_SAINT: {
    'effects.firstPromoBonus': xml('ModifierArguments',
      'ModifierId=CARDINAL_PATRON_SAINT_PROMOTION&Name=Amount', 'Value'),
  },
  DIVINE_ARCHITECT: {
    'effects.districtFaithBuy': xml('ModifierArguments',
      'ModifierId=CARDINAL_FAITH_PURCHASE_DISTRICT&Name=CanPurchase', 'Value'),
  },
  GUILDMASTER: {
    'effects.builderCharges': xml('ModifierArguments',
      'ModifierId=GUILDMASTER_ADDITIONAL_BUILDER_CHARGES_UNIT_MODIFIER&Name=Amount', 'Value'),
  },
  ZONING_COMMISSIONER: {
    'effects.districtProdMult': {
      derived: '1 + Amount/100 — the install writes the percentage (20), the catalog the multiplier',
      inputs: [xml('ModifierArguments',
        'ModifierId=ZONING_COMMISSIONER_FASTER_DISTRICT_CONSTRUCTION&Name=Amount', 'Value')],
    },
  },
  REINFORCED_MATERIALS: {
    'effects.envDamageImmune': xml('ModifierArguments',
      'ModifierId=REINFORCED_INFRASTRUCTURE_PREVENET_STRUCTURAL_DAMAGE&Name=Prevent', 'Value'),
  },
  WATER_WORKS: {
    'effects.waterWorks': xml('Modifiers', 'ModifierId=WATER_WORKS_NEIGHBORHOOD_HOUSING', 'ModifierType',
      { expect: 'MODIFIER_CITY_DISTRICTS_ADJUST_DISTRICT_HOUSING',
        note: 'the four magnitudes are WATER_WORKS_HOUSING / _AMENITIES below' }),
  },
  LIBRARIAN: {
    'effects.yieldMult.science': {
      derived: '1 + Amount/100 — the install writes the percentage (15), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=LIBRARIAN_SCIENCE_YIELD_BONUS&Name=Amount', 'Value')],
    },
    'effects.yieldMult.culture': {
      derived: '1 + Amount/100 — the install writes the percentage (15), the catalog the multiplier',
      inputs: [xml('ModifierArguments', 'ModifierId=LIBRARIAN_CULTURE_YIELD_BONUS&Name=Amount', 'Value')],
    },
  },
  CONNOISSEUR: {
    'effects.perCitizen.culture': xml('ModifierArguments',
      'ModifierId=CONNOISSEUR_CULTURE_CITIZEN&Name=Amount', 'Value'),
  },
  RESEARCHER: {
    'effects.perCitizen.science': xml('ModifierArguments',
      'ModifierId=RESEARCHER_SCIENCE_CITIZEN&Name=Amount', 'Value'),
  },
  GRANTS: {
    'effects.gppMult': {
      derived: '1 + Amount/100 — the install writes the percentage (100), the catalog the multiplier',
      inputs: [xml('ModifierArguments',
        'ModifierId=EDUCATOR_INCREASE_CITY_GREAT_PERSON_POINT_BONUS&Name=Amount', 'Value')],
    },
  },
  SPACE_INITIATIVE: {
    'effects.projectProdMult': {
      derived: '1 + Amount/100 — the install writes the percentage (30), the catalog the multiplier',
      inputs: [xml('ModifierArguments',
        'ModifierId=EDUCATOR_FASTER_SPACE_RACE_PRODUCTION&Name=Amount', 'Value')],
    },
  },
  CURATOR: {
    'effects.gwTourismMult': {
      derived: 'ScalingFactor/100 — the install writes 200 (double), the catalog the multiplier',
      inputs: [xml('ModifierArguments',
        'ModifierId=CURATOR_DOUBLE_WRITING_TOURISM&Name=ScalingFactor', 'Value')],
    },
  },
};

/** the install-backed tags every promotion row carries, plus its own effects.
 *  `requires` reaches the dump as ONE leaf (an all-scalar array is not split),
 *  so its tag names the FIRST prerequisite row and the note names the rest —
 *  the same shape `TECH_SRC.prereqs` uses. */
const promoSrc = (id: string, governor: GovernorId,
                  requires?: readonly string[]): SrcMap => {
  const iid = PROMO_INSTALL_ID[id];
  const first = requires?.[0];
  return {
    governor: xml('GovernorPromotionSets', `GovernorPromotion=${iid}`, 'GovernorType',
      { expect: GOVERNOR_INSTALL_ID[governor] }),
    tier: xml('GovernorPromotions', `GovernorPromotionType=${iid}`, 'Level'),
    ...(first === undefined ? {} : {
      requires: xml('GovernorPromotionPrereqs',
        `GovernorPromotionType=${iid}&PrereqGovernorPromotion=${PROMO_INSTALL_ID[first]}`,
        'PrereqGovernorPromotion', {
          expect: PROMO_INSTALL_ID[first],
          note: requires!.length > 1
            ? `and ${requires!.slice(1).map((r) => PROMO_INSTALL_ID[r]).join(', ')}`
            : undefined,
        }),
    }),
    ...PROMO_EFFECT_SRC[id],
  };
};

const G = (id: string, governor: GovernorId, tier: number, name: string,
           description: string, effects: GovernorEffects,
           requires?: readonly string[]): GovernorPromotionDef =>
  ({ id, name, governor, tier, requires, description, effects,
     src: promoSrc(id, governor, requires) });

/**
 * The Gathering Storm promotion tables, one row per published ability, in
 * governor order and then tier order. Each `description` is the published
 * effect text; `effects` carries only the clauses this model has a channel
 * for, and the AUDIT names every clause it does not.
 */
export const GOVERNOR_PROMOTIONS: readonly GovernorPromotionDef[] = [
  // ---- REYNA, the Financier ----
  G('LAND_ACQUISITION', 'REYNA', 0, 'Land Acquisition',
    'Acquire new tiles in the city faster. +3 Gold per turn from each foreign Trade Route passing through the city.',
    { passRouteGold: 3, borderExpansionPct: 20 }),
  G('HARBORMASTER', 'REYNA', 1, 'Harbormaster',
    'Double adjacency bonuses from Commercial Hubs and Harbors in the city.',
    { adjacencyMult: { COMMERCIAL_HUB: 2, HARBOR: 2 } }),
  G('FORESTRY_MANAGEMENT', 'REYNA', 1, 'Forestry Management',
    'This city receives +2 Gold for each unimproved feature. Tiles adjacent to unimproved features receive +1 Appeal in this city.',
    { goldPerFeature: 2, appealNearFeature: 1 }),
  G('TAX_COLLECTOR', 'REYNA', 2, 'Tax Collector',
    '+2 Gold per turn for each Citizen in the city.',
    { perCitizen: { gold: 2 } }, ['HARBORMASTER', 'FORESTRY_MANAGEMENT']),
  G('CONTRACTOR', 'REYNA', 3, 'Contractor',
    'Allows city to purchase Districts with Gold.',
    { districtGoldBuy: true }, ['TAX_COLLECTOR']),
  G('RENEWABLE_SUBSIDIZER', 'REYNA', 3, 'Renewable Subsidizer',
    'All Offshore Wind Farms, Solar Farms, Wind Farms, Geothermal Plants and Hydroelectric Dams in this city receive +2 Power and +2 Gold.',
    {}, ['TAX_COLLECTOR']),

  // ---- VICTOR, the Castellan ----
  G('REDOUBT', 'VICTOR', 0, 'Redoubt',
    'Increase city garrison Combat Strength by 5.',
    { cityDefense: 5 }),
  G('GARRISON_COMMANDER', 'VICTOR', 1, 'Garrison Commander',
    "Units defending within the city's territory get +5 Combat Strength. Your other cities within 9 tiles gain +4 Loyalty per turn towards your civilization.",
    { territoryCS: 5, loyaltyToOwn: { range: 9, loyalty: 4 } }),
  G('DEFENSE_LOGISTICS', 'VICTOR', 1, 'Defense Logistics',
    'City cannot be put under siege. Accumulating Strategic resources gain an additional +1 per turn.',
    { noSiege: true, stockpilePerTurn: 1 }),
  G('EMBRASURE', 'VICTOR', 2, 'Embrasure',
    'City gains an additional Ranged Strike per turn. Military units trained in this city start with a free promotion.',
    { extraStrikes: 1, freePromoOnTrain: true }, ['GARRISON_COMMANDER', 'DEFENSE_LOGISTICS']),
  G('AIR_DEFENSE_INITIATIVE', 'VICTOR', 3, 'Air Defense Initiative',
    "+25 Combat Strength to anti-air support units within the city's territory when defending against aircraft and ICBMs.",
    { airDefenseCS: AIR_DEFENSE_INITIATIVE_CS }, ['EMBRASURE']),
  G('ARMS_RACE_PROPONENT', 'VICTOR', 3, 'Arms Race Proponent',
    '30% Production increase to all nuclear armament projects in the city.',
    {}, ['EMBRASURE']),

  // ---- AMANI, the Diplomat ----
  G('MESSENGER', 'AMANI', 0, 'Messenger',
    'Can be assigned to a City-state, where she acts as 2 Envoys.',
    { envoysAtMinor: 2 }),
  G('EMISSARY', 'AMANI', 1, 'Emissary',
    'Other cities within 9 tiles and not owned by you lose 2 Loyalty per turn.',
    { loyaltyToForeign: { range: 9, loyalty: 2 } }),
  G('AFFLUENCE', 'AMANI', 1, 'Affluence',
    'While established in a city-state, provides a copy of its Luxury resources to you.',
    { minorLuxuries: true }),
  G('LOCAL_INFORMANTS', 'AMANI', 2, 'Local Informants',
    'Enemy Spies operate at 3 levels below normal in this city.',
    { spyLevelPenalty: 3 }, ['EMISSARY']),
  G('FOREIGN_INVESTOR', 'AMANI', 2, 'Foreign Investor',
    'While established in a city-state, accumulate its Strategic resources. When suzerain, receive double the amount of accumulated strategic resources.',
    {}, ['AFFLUENCE']),
  G('PUPPETEER', 'AMANI', 3, 'Puppeteer',
    'While established in a city-state, doubles the number of Envoys you have there.',
    { envoyDoubleAtMinor: true }, ['LOCAL_INFORMANTS', 'FOREIGN_INVESTOR']),

  // ---- MAGNUS, the Steward ----
  G('GROUNDBREAKER', 'MAGNUS', 0, 'Groundbreaker',
    '+50% yields from plot harvests and feature removals in city.',
    { harvestMult: 1.5 }),
  G('SURPLUS_LOGISTICS', 'MAGNUS', 1, 'Surplus Logistics',
    '+20% Growth in the city. Your Trade Routes ending here provide +2 Food to their starting city.',
    { growthMult: 1.2, routeStartFood: 2 }),
  G('PROVISION', 'MAGNUS', 1, 'Provision',
    'Settlers trained in the city do not consume a Population.',
    { settlerFreePop: true }),
  G('INDUSTRIALIST', 'MAGNUS', 2, 'Industrialist',
    'Increase the Power provided by each resource of the Coal Power Plant, Oil Power Plant and Nuclear Power Plant by 1 and the Production by 2.',
    {}, ['SURPLUS_LOGISTICS']),
  G('BLACK_MARKETEER', 'MAGNUS', 2, 'Black Marketeer',
    'Strategic resources for units are discounted 80%.',
    { resourceDiscountPct: 80 }, ['PROVISION']),
  G('VERTICAL_INTEGRATION', 'MAGNUS', 3, 'Vertical Integration',
    'This city receives Production from any number of Industrial Zones within 6 tiles, not just the first.',
    { industryAllSources: true }, ['INDUSTRIALIST', 'BLACK_MARKETEER']),

  // ---- MOKSHA, the Cardinal ----
  G('BISHOP', 'MOKSHA', 0, 'Bishop',
    'Religious pressure to adjacent cities is 100% stronger from this city. +2 Faith per specialty district in this city.',
    { pressureMult: 2, faithPerSpecialty: 2 }),
  G('GRAND_INQUISITOR', 'MOKSHA', 1, 'Grand Inquisitor',
    '+10 Religious Strength in theological combat in tiles of this city.',
    { theologyCS: 10 }),
  G('LAYING_ON_OF_HANDS', 'MOKSHA', 1, 'Laying On Of Hands',
    "All Governor's units heal fully in one turn in tiles of this city.",
    { fullHeal: true }),
  G('CITADEL_OF_GOD', 'MOKSHA', 2, 'Citadel of God',
    "City ignores pressure and combat effects from Religions not founded by the Governor's player. Gain Faith equal to 25% of the construction cost when finishing buildings.",
    { ignoreForeignPressure: true, faithOnBuildPct: 25 }, ['GRAND_INQUISITOR', 'LAYING_ON_OF_HANDS']),
  G('PATRON_SAINT', 'MOKSHA', 3, 'Patron Saint',
    'Apostles and Warrior Monks trained in the city receive 1 extra Promotion when receiving their first promotion.',
    { firstPromoBonus: 1 }, ['CITADEL_OF_GOD']),
  G('DIVINE_ARCHITECT', 'MOKSHA', 3, 'Divine Architect',
    'Allows city to purchase Districts with Faith.',
    { districtFaithBuy: true }, ['CITADEL_OF_GOD']),

  // ---- LIANG, the Surveyor ----
  G('GUILDMASTER', 'LIANG', 0, 'Guildmaster',
    'All Builders trained in city get +1 build charge.',
    { builderCharges: 1 }),
  G('ZONING_COMMISSIONER', 'LIANG', 1, 'Zoning Commissioner',
    '+20% Production towards constructing Districts in the city.',
    { districtProdMult: 1.2 }),
  G('AQUACULTURE', 'LIANG', 1, 'Aquaculture',
    'The Fishery unique improvement can be built in the city on coastal plots.',
    {}),
  G('REINFORCED_MATERIALS', 'LIANG', 2, 'Reinforced Materials',
    "This city's improvements, buildings and Districts cannot be damaged by Environmental Effects.",
    { envDamageImmune: true }, ['ZONING_COMMISSIONER']),
  G('WATER_WORKS', 'LIANG', 2, 'Water Works',
    '+2 Housing for every Neighborhood and Aqueduct district in this city. +1 Amenity for every Canal and Dam district in this city.',
    { waterWorks: true }, ['AQUACULTURE']),
  G('PARKS_AND_RECREATION', 'LIANG', 3, 'Parks and Recreation',
    'The City Park unique improvement can be built in the city.',
    {}, ['REINFORCED_MATERIALS', 'WATER_WORKS']),

  // ---- PINGALA, the Educator ----
  G('LIBRARIAN', 'PINGALA', 0, 'Librarian',
    '15% increase in Science and Culture generated by the city.',
    { yieldMult: { science: 1.15, culture: 1.15 } }),
  G('CONNOISSEUR', 'PINGALA', 1, 'Connoisseur',
    '+1 Culture per turn for each Citizen in the city.',
    { perCitizen: { culture: 1 } }),
  G('RESEARCHER', 'PINGALA', 1, 'Researcher',
    '+1 Science per turn for each Citizen in the city.',
    { perCitizen: { science: 1 } }),
  G('GRANTS', 'PINGALA', 2, 'Grants',
    '+100% Great People points generated per turn in the city.',
    { gppMult: 2 }, ['CONNOISSEUR', 'RESEARCHER']),
  G('SPACE_INITIATIVE', 'PINGALA', 3, 'Space Initiative',
    '30% Production increase to all space-program projects in the city.',
    { projectProdMult: 1.3 }, ['GRANTS']),
  G('CURATOR', 'PINGALA', 3, 'Curator',
    '+100% Tourism from Great Works of Art, Music, and Writing in the city.',
    { gwTourismMult: 2 }, ['GRANTS']),
];

export const GOVERNOR_PROMOTION_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  GOVERNOR_PROMOTIONS.map((p, i) => [p.id, i]),
);

/** the DEFAULT ability each appointment carries, by governor index. */
export const GOVERNOR_DEFAULT_PROMOTION: readonly number[] = GOVERNORS.map((g) =>
  GOVERNOR_PROMOTIONS.findIndex((p) => p.governor === g.id && p.tier === 0));

/**
 * CIV6 (Governor): the thirteen civics that "will grant 1 Governor Title".
 */
export const GOVERNOR_TITLE_CIVICS: readonly string[] = [
  'STATE_WORKFORCE', 'EARLY_EMPIRE', 'DEFENSIVE_TACTICS', 'RECORDED_HISTORY',
  'MEDIEVAL_FAIRES', 'GUILDS', 'CIVIL_ENGINEERING', 'NATIONALISM', 'MASS_MEDIA',
  'MOBILIZATION', 'GLOBALIZATION', 'SOCIAL_MEDIA', 'NEAR_FUTURE_GOVERNANCE',
];

/** CIV6 (Liang, Water Works): "+2 Housing for every Neighborhood and Aqueduct
 *  district in this city. +1 Amenity for every Canal and Dam district." */
export const WATER_WORKS_HOUSING = 2;
export const WATER_WORKS_AMENITIES = 1;

/** CIV6 (Neutralize Governor): a neutralized governor "cannot be assigned to
 *  any city for at least 6 turns", and Governance Doctrine's B face
 *  neutralizes every governor of one type for the same 6. */
export const GOVERNOR_NEUTRALIZE_TURNS = 6;

/** CIV6 (Governance Doctrine, A): "Appointing and promoting a Governor of
 *  this type yields 15 Diplomatic Favor." */
export const GOVERNANCE_DOCTRINE_FAVOR = 15;
