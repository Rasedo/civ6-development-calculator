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

export type GovernorId = 'REYNA' | 'VICTOR' | 'AMANI' | 'MAGNUS' | 'MOKSHA' | 'LIANG' | 'PINGALA';

export interface GovernorDef {
  id: GovernorId;
  name: string;
  /** the descriptive title the Civilopedia gives — "The Financier". */
  title: string;
  /** turns to establish in a newly assigned city before the abilities apply. */
  establishTurns: number;
  /** CIV6: Amani "is also the only Governor who may be assigned not only to
   *  your own cities, but also to city-states". */
  cityStates?: boolean;
}

export const GOVERNORS: readonly GovernorDef[] = [
  { id: 'REYNA', name: 'Reyna', title: 'The Financier', establishTurns: 5 },
  { id: 'VICTOR', name: 'Victor', title: 'The Castellan', establishTurns: 3 },
  { id: 'AMANI', name: 'Amani', title: 'The Diplomat', establishTurns: 5, cityStates: true },
  { id: 'MAGNUS', name: 'Magnus', title: 'The Steward', establishTurns: 5 },
  { id: 'MOKSHA', name: 'Moksha', title: 'The Cardinal', establishTurns: 5 },
  { id: 'LIANG', name: 'Liang', title: 'The Surveyor', establishTurns: 5 },
  { id: 'PINGALA', name: 'Pingala', title: 'The Educator', establishTurns: 5 },
];

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
}

export interface GovernorPromotionDef {
  id: string;
  name: string;
  governor: GovernorId;
  /** 0 = the default ability every appointment carries, then I, II, III. */
  tier: number;
  /** promotion ids of which AT LEAST ONE must already be held. */
  requires?: readonly string[];
  description: string;
  effects: GovernorEffects;
}

const G = (id: string, governor: GovernorId, tier: number, name: string,
           description: string, effects: GovernorEffects,
           requires?: readonly string[]): GovernorPromotionDef =>
  ({ id, name, governor, tier, requires, description, effects });

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
    {}),
  G('HARBORMASTER', 'REYNA', 1, 'Harbormaster',
    'Double adjacency bonuses from Commercial Hubs and Harbors in the city.',
    { adjacencyMult: { COMMERCIAL_HUB: 2, HARBOR: 2 } }),
  G('FORESTRY_MANAGEMENT', 'REYNA', 1, 'Forestry Management',
    'This city receives +2 Gold for each unimproved feature. Tiles adjacent to unimproved features receive +1 Appeal in this city.',
    {}),
  G('TAX_COLLECTOR', 'REYNA', 2, 'Tax Collector',
    '+2 Gold per turn for each Citizen in the city.',
    { perCitizen: { gold: 2 } }, ['HARBORMASTER', 'FORESTRY_MANAGEMENT']),
  G('CONTRACTOR', 'REYNA', 3, 'Contractor',
    'Allows city to purchase Districts with Gold.',
    {}, ['TAX_COLLECTOR']),
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
    {}, ['EMBRASURE']),
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
    { growthMult: 1.2 }),
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
    {}, ['INDUSTRIALIST', 'BLACK_MARKETEER']),

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
    {}, ['CITADEL_OF_GOD']),
  G('DIVINE_ARCHITECT', 'MOKSHA', 3, 'Divine Architect',
    'Allows city to purchase Districts with Faith.',
    {}, ['CITADEL_OF_GOD']),

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
    {}, ['ZONING_COMMISSIONER']),
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
 * The ladder they replace was this model's own invention.
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
