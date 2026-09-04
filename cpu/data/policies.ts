/**
 * Governments and policy cards. Every row is sourced from its own Civilopedia
 * page: the description quotes the card, the slot kind is the page's type,
 * the enabling civic is the page's enabled_with (held in civics.ts as an
 * `unlockPolicy` effect) and `obsoleteCivic` is its obsolete_with.
 *
 * Slot rules follow Civ 6: a card fits a slot of its own kind, and any card
 * fits a wildcard slot. A card whose obsoleting civic is researched leaves
 * the pool — the later card that replaces it is the one that pays.
 *
 * A row with an EMPTY `effects` object is INERT: the card is adoptable and
 * nothing applies it. Each surviving one names an absent system in its own
 * AUDIT row.
 *
 * Card/government effects are expressed declaratively and assembled into a
 * single Modifiers object by `getModifiers` (core/effects.ts).
 */

import type { DistrictId, GreatPersonClass, ImprovementId, Yields } from '../core/types';
import type { UnitClass } from './units';
import type { PromoClass } from './promotions';

export type SlotKind = 'military' | 'economic' | 'diplomatic' | 'wildcard';
/** Slot kinds in the order a wonder-granted slot appends to a government's
 *  own list, and the order the GPU's per-kind slot counts are packed in. */
export const SLOT_KINDS = ['military', 'economic', 'diplomatic', 'wildcard'] as const;

/** Master switch for the whole government/policy layer: adoption
 * (`computeAdoption`), the government modifier layering and the GPU's
 * per-seat modifier tables. The exporter mirrors it into
 * `rules.governmentsLive` so both engines gate on one value. */
export const GOVERNMENTS_ADOPTION_LIVE = true;

/**
 * CIV6 (Simultaneum / Rationalism / Grand Opéra / Free Market): "+100% <yield>
 * from <district> district buildings", and the two Gathering Storm clauses
 * beside it — "+50% if city population is 15 or higher, +50% if district has
 * at least +4 adjacency bonus". The percentages ADD, so a big city with a
 * strong district pays +200%. Only the NAMED yield moves: a Cathedral pays
 * faith AND culture, and Simultaneum is a faith card.
 */
export interface BuildingYieldBoost {
  district: DistrictId;
  yield: keyof Yields;
  /** the flat percentage the card always pays, as a fraction (1 = +100%) */
  pct: number;
  popMin: number;
  popPct: number;
  adjMin: number;
  adjPct: number;
}

/**
 * CIV6 (Agoge, Maneuver, Corvée, …): "+50% Production toward Ancient and
 * Classical era melee, ranged and anti-cavalry units". Two axes: the CLASSES
 * the card reaches and the highest ERA of the item it still pays. Percentages
 * ADD across the slotted cards, the way Civ 6 stacks production modifiers.
 */
export interface ProdBoost {
  /** the queue item the card pays for; 'anyUnit' is the class-free arm
   *  that reaches every unit the queue can hold */
  target: 'unit' | 'wonder' | 'anyUnit';
  /** the classes it reaches; a wonder or anyUnit card names none */
  classes: UnitClass[];
  /** the highest era index it still pays; -1 = every era */
  eraMax: number;
  /** the fraction added (0.5 = +50%) */
  pct: number;
}

export interface PolicyEffects {
  cityYields?: Partial<Yields>;
  capitalYields?: Partial<Yields>;
  adjacencyMult?: Partial<Record<DistrictId, number>>;
  buildingYieldBoost?: BuildingYieldBoost;
  housingIfDistricts?: { min: number; housing: number };
  amenitiesIfSpecialty?: { min: number; amenities: number };
  newDeal?: { min: number; housing: number; amenities: number };
  tilePurchaseMult?: number;
  encampHarborProdMult?: number;
  yieldMult?: Partial<Yields>;
  amenitiesAll?: number;
  housingAll?: number;
  prodBoost?: ProdBoost;
  /** extra build charges a NEWLY TRAINED Builder is born with */
  builderCharges?: number;
  /** gold per turn taken off every unit's maintenance, floored at free */
  unitMaintenanceCut?: number;
  /** percentage change to the gold a nuclear device costs per turn. */
  wmdUpkeepPct?: number;
  /** combat strength added when the opponent is a barbarian */
  combatVsBarbarians?: number;
  /** added to a city's defence strength */
  cityDefense?: number;
  /** added to a city's ranged strength */
  cityRanged?: number;
  /** multiplies the experience a RECON unit earns */
  reconXpMult?: number;
  /** multiplies the yields a pillage or a coastal raid pays */
  pillageMult?: number;
  /** multiplies the gold a plundered trade route pays */
  routePlunderMult?: number;
  /** CIV6 (Theocracy): "Can buy land combat units with Faith." */
  faithBuyLandUnits?: boolean;
  /** gold added to every trade route this seat runs */
  routeGold?: number;
  /** influence points per turn toward the next envoy */
  influencePerTurn?: number;
  /** the FIRST envoy sent to each city-state counts as two */
  firstEnvoyDouble?: boolean;
  /** a sent envoy counts as two when the city-state's suzerain runs a
   *  different government than the sender */
  envoyDoubleDiffGov?: boolean;
  /** extra international tourism percent toward a civ this seat has a trade
   *  route with, SUMMED with the standing route bonus */
  tourismRouteBonus?: number;
  /** culture multiplier added per city-state this seat is suzerain of */
  culturePerSuzerain?: number;
  /** flat Combat Strength by PROMOTION class (`UNIT_PROMO_CLASS`); `all`
   *  covers every combat unit instead */
  unitCombatCS?: { classes?: PromoClass[]; all?: boolean; cs: number };
  /** percentage POINTS joining every experience award's building percentage */
  xpPct?: number;
  /** percentage taken off every war-weariness accrual this seat scores */
  wwCutPct?: number;
  /** multiplies every per-turn Great Person point source */
  gppMult?: number;
  /** housing and amenities in every city with ANY completed district */
  cityWithDistrict?: { housing: number; amenities: number };
  gppFlat?: Partial<Record<GreatPersonClass, number>>;
  /** yield multipliers that apply ONLY in a city with an ESTABLISHED governor
   *  (Merchant Republic's gold). */
  /** CIV6 (Monarchy): housing per LEVEL of the city's walls. */
  housingPerWallLevel?: number;
  /** CIV6 (Theocracy): religious strength in theological combat. */
  theologyCS?: number;
  /** CIV6 (Autocracy): yields to a city per government building standing in
   *  it (`isGovYieldBuilding`), paid to every yield alike. */
  yieldsPerGovBuilding?: number;
  governorYieldMult?: Partial<Yields>;
  /** yields per CITIZEN, only in a city with a governor (Theocracy's faith,
   *  Communism's production). */
  governorPerCitizen?: Partial<Yields>;

  // ---- the DARK-AGE channels ----
  /** improvement yield adders (Collectivism's Farms). */
  improvementYields?: Partial<Record<ImprovementId, Partial<Yields>>>;
  /** a yield multiplied in every city that holds the named DISTRICT
   *  (Monasticism's Holy Site science). */
  districtYieldMult?: { district: DistrictId; yield: keyof Yields; mult: number }[];
  /** a yield multiplied in every city that holds the named BUILDING (Robber
   *  Barons' Stock Exchange gold and Factory production). */
  buildingYieldMult?: { building: string; yield: keyof Yields; mult: number }[];
  /** flat yields added to each DOMESTIC trade route (Isolationism). */
  domesticRouteYield?: Partial<Yields>;
  /** every trade route's yields, multiplied (Letters of Marque). */
  routeYieldMult?: number;
  /** Isolationism: no Settler may be trained, bought, or founded with. */
  noSettlers?: boolean;
  /** Twilight Valor: a unit heals only inside its own territory. */
  healOnlyHome?: boolean;
  /** Inquisition: religious combat strength inside your own territory. */
  religiousCsHome?: number;
  /** Letters of Marque: the Naval Raider class's production and movement. */
  navalRaiderProdMult?: number;
  navalRaiderMoves?: number;
  /** Cyber Warfare: grievances against you never decay. */
  grievanceNoDecay?: boolean;
  /** Automated Workforce: production toward city PROJECTS. */
  projectProdMult?: number;
  /** C-73: the government legacy channels this model had no shape for —
   *  Monarchy's envoy influence and the two purchase discounts. */
  influenceMult?: number;
  goldBuyDiscountPct?: number;
  faithBuyDiscountPct?: number;
  /** Automated Workforce: loyalty per turn in every city. */
  loyaltyAll?: number;
  /** Disinformation Campaign: diplomatic favor per copy of a building. */
  favorPerBuilding?: { building: string; favor: number };
  /** Rogue State: envoy influence stops accruing. */
  noEnvoyInfluence?: boolean;
  /** Cyber Warfare: combat strength against units of `minEra` and later. */
  unitCsVsEra?: { minEra: number; cs: number };
  /** Flower Power: the cost multiplier on land units that are not Rock Bands. */
  landUnitCostMult?: number;
  /** Flower Power: every civ not at war with you takes this share of each
   *  concert's tourism, on top of the host's own. */
  concertShare?: number;
  /** Elite Forces: extra gold per MILITARY unit maintained. */
  militaryMaintenanceAdd?: number;
}

export interface PolicyDef {
  id: string;
  name: string;
  kind: SlotKind;
  description: string;
  /** the civic that RETIRES the card — researching it takes the card out of
   *  the pool for good. The enabling civic is the `unlockPolicy` effect in
   *  `civics.ts`; a card with no retiring civic stays adoptable forever. */
  obsoleteCivic?: string;
  /** CIV6 (Dark Age policy card): "they can only be adopted by civilizations
   *  that are experiencing a Dark Age. They must be placed in Wildcard slots."
   *  No civic unlocks one; the era window is its whole availability. */
  dark?: { firstEra: number; lastEra: number };
  /** CIV6 (Legacy policy card): the GOVERNMENT whose own inherent bonus this
   *  card carries. No civic unlocks it — having BEEN in that government does,
   *  and it cannot be slotted while the seat is still in it. */
  legacyOf?: string;
  effects: PolicyEffects;
}

const P = (id: string, name: string, kind: SlotKind, description: string,
           obsoleteCivic: string | undefined, effects: PolicyEffects): PolicyDef =>
  ({ id, name, kind, description, obsoleteCivic, effects });

/** A Dark Age card: no unlocking civic, no retiring one — an era window and a
 *  Dark Age are its whole gate, and it fits a Wildcard slot only. */
const DK = (id: string, name: string, firstEra: number, lastEra: number,
            description: string, effects: PolicyEffects): PolicyDef =>
  ({ id, name, kind: 'wildcard', description, dark: { firstEra, lastEra }, effects });

/** era indices, for the production cards' `eraMax` */
const CLASSICAL = 1;
const RENAISSANCE = 3;
const INDUSTRIAL = 4;
const EVERY_ERA = -1;

export const POLICIES: Record<string, PolicyDef> = Object.fromEntries(
  [
    P('URBAN_PLANNING', 'Urban Planning', 'economic', '+1 production in all cities.', 'ENLIGHTENMENT', {
      cityYields: { production: 1 },
    }),
    P('GOD_KING', 'God King', 'economic', '+1 faith and +1 gold in the capital.', 'THEOLOGY', {
      capitalYields: { faith: 1, gold: 1 },
    }),
    P('LAND_SURVEYORS', 'Land Surveyors', 'economic', 'Purchasing tiles costs 20% less gold.', 'SCORCHED_EARTH', {
      tilePurchaseMult: 0.8,
    }),
    P('INSULAE', 'Insulae', 'economic', '+1 housing in cities with 2+ specialty districts.', 'MEDIEVAL_FAIRES', {
      housingIfDistricts: { min: 2, housing: 1 },
    }),
    P('VETERANCY', 'Veterancy', 'military', '+30% production toward Encampment and Harbor districts and their buildings.', undefined, {
      encampHarborProdMult: 1.3,
    }),
    P('NATURAL_PHILOSOPHY', 'Natural Philosophy', 'economic', '+100% Campus adjacency bonuses.', 'CLASS_STRUGGLE', {
      adjacencyMult: { CAMPUS: 2 },
    }),
    P('SCRIPTURE', 'Scripture', 'economic', '+100% Holy Site adjacency bonuses.', undefined, {
      adjacencyMult: { HOLY_SITE: 2 },
    }),
    P('TOWN_CHARTERS', 'Town Charters', 'economic', '+100% Commercial Hub adjacency bonuses.', 'SUFFRAGE', {
      adjacencyMult: { COMMERCIAL_HUB: 2 },
    }),
    P('NAVAL_INFRASTRUCTURE', 'Naval Infrastructure', 'economic', '+100% Harbor adjacency bonuses.', 'SUFFRAGE', {
      adjacencyMult: { HARBOR: 2 },
    }),
    P('CRAFTSMEN', 'Craftsmen', 'economic', '+100% Industrial Zone adjacency bonuses.', 'CLASS_STRUGGLE', {
      adjacencyMult: { INDUSTRIAL_ZONE: 2 },
    }),
    P('AESTHETICS', 'Aesthetics', 'economic', '+100% Theater Square adjacency bonuses.', 'PROFESSIONAL_SPORTS', {
      adjacencyMult: { THEATER_SQUARE: 2 },
    }),
    P('MEDINA_QUARTER', 'Medina Quarter', 'economic', '+2 housing in cities with 3+ specialty districts.', 'SUFFRAGE', {
      housingIfDistricts: { min: 3, housing: 2 },
    }),
    P('SIMULTANEUM', 'Simultaneum', 'economic', '+100% faith from Holy Site buildings; +50% more at population 15+, +50% more at +4 adjacency.', undefined, {
      buildingYieldBoost: { district: 'HOLY_SITE', yield: 'faith', pct: 1, popMin: 15, popPct: 0.5, adjMin: 4, adjPct: 0.5 },
    }),
    P('GRAND_OPERA', 'Grand Opéra', 'economic', '+100% culture from Theater Square buildings; +50% more at population 15+, +50% more at +4 adjacency.', undefined, {
      buildingYieldBoost: { district: 'THEATER_SQUARE', yield: 'culture', pct: 1, popMin: 15, popPct: 0.5, adjMin: 4, adjPct: 0.5 },
    }),
    P('RATIONALISM', 'Rationalism', 'economic', '+100% science from Campus buildings; +50% more at population 15+, +50% more at +4 adjacency.', undefined, {
      buildingYieldBoost: { district: 'CAMPUS', yield: 'science', pct: 1, popMin: 15, popPct: 0.5, adjMin: 4, adjPct: 0.5 },
    }),
    P('FREE_MARKETS', 'Free Market', 'economic', '+100% gold from Commercial Hub buildings; +50% more at population 15+, +50% more at +4 adjacency.', undefined, {
      buildingYieldBoost: { district: 'COMMERCIAL_HUB', yield: 'gold', pct: 1, popMin: 15, popPct: 0.5, adjMin: 4, adjPct: 0.5 },
    }),
    P('LIBERALISM', 'Liberalism', 'economic', '+1 amenity in cities with 2+ specialty districts.', 'SUFFRAGE', {
      amenitiesIfSpecialty: { min: 2, amenities: 1 },
    }),
    P('NEW_DEAL', 'New Deal', 'economic', '+4 housing and +2 amenities in cities with 3+ specialty districts.', undefined, {
      newDeal: { min: 3, housing: 4, amenities: 2 },
    }),
    P('FIVE_YEAR_PLAN', 'Five-Year Plan', 'economic', '+100% Campus and Industrial Zone adjacency bonuses.', undefined, {
      adjacencyMult: { CAMPUS: 2, INDUSTRIAL_ZONE: 2 },
    }),

    // Catalog breadth, appended AFTER the originals so the greedy slot
    // fill's table order — URBAN_PLANNING first in every economic slot — is
    // preserved.

    P('DISCIPLINE', 'Discipline', 'military', '+5 combat strength when fighting barbarians.', 'COLONIALISM', {
      combatVsBarbarians: 5,
    }),
    P('SURVEY', 'Survey', 'military', 'Doubles experience for recon units.', 'COLONIALISM', {
      reconXpMult: 2,
    }),
    P('MANEUVER', 'Maneuver', 'military', '+50% production toward Ancient and Classical era heavy and light cavalry.', 'DIVINE_RIGHT', {
      prodBoost: { target: 'unit', classes: ['cavalry'], eraMax: CLASSICAL, pct: 0.5 },
    }),
    P('AGOGE', 'Agoge', 'military', '+50% production toward Ancient and Classical era melee, ranged and anti-cavalry.', 'FEUDALISM', {
      prodBoost: { target: 'unit', classes: ['melee', 'ranged', 'antiCavalry'], eraMax: CLASSICAL, pct: 0.5 },
    }),
    P('CHIVALRY', 'Chivalry', 'military', '+50% production toward Industrial-era and earlier heavy and light cavalry.', 'TOTALITARIANISM', {
      prodBoost: { target: 'unit', classes: ['cavalry'], eraMax: INDUSTRIAL, pct: 0.5 },
    }),
    P('BASTIONS', 'Bastions', 'military', '+6 city defence strength and +5 city ranged strength.', 'CIVIL_ENGINEERING', {
      cityDefense: 6, cityRanged: 5,
    }),
    P('FEUDAL_CONTRACT', 'Feudal Contract', 'military', '+50% production toward Ancient through Renaissance melee, ranged and anti-cavalry.', 'NATIONALISM', {
      prodBoost: { target: 'unit', classes: ['melee', 'ranged', 'antiCavalry'], eraMax: RENAISSANCE, pct: 0.5 },
    }),
    P('CONSCRIPTION', 'Conscription', 'military', 'Unit maintenance costs 1 less gold per turn, per unit.', 'MOBILIZATION', {
      unitMaintenanceCut: 1,
    }),
    P('LEVEE_EN_MASSE', 'Levée en Masse', 'military', 'Unit maintenance costs 2 less gold per turn, per unit.', undefined, {
      unitMaintenanceCut: 2,
    }),
    P('MILITARY_FIRST', 'Military First', 'military', '+50% production toward all melee, ranged and anti-cavalry units.', undefined, {
      prodBoost: { target: 'unit', classes: ['melee', 'ranged', 'antiCavalry'], eraMax: EVERY_ERA, pct: 0.5 },
    }),
    P('TOTAL_WAR', 'Total War', 'military', '+50% yields from pillaging and coastal raids, +50% trade-route plunder.', undefined, {
      pillageMult: 1.5, routePlunderMult: 1.5,
    }),

    P('COLONIZATION', 'Colonization', 'economic', '+50% production toward Settlers.', 'SCORCHED_EARTH', {
      prodBoost: { target: 'unit', classes: ['settler'], eraMax: EVERY_ERA, pct: 0.5 },
    }),
    P('ILKUM', 'Ilkum', 'economic', '+30% production toward Builders.', 'FEUDALISM', {
      prodBoost: { target: 'unit', classes: ['builder'], eraMax: EVERY_ERA, pct: 0.3 },
    }),
    P('CARAVANSARIES', 'Caravansaries', 'economic', '+2 gold from all trade routes.', 'MERCANTILISM', {
      routeGold: 2,
    }),
    P('MARITIME_INDUSTRIES', 'Maritime Industries', 'military', '+100% production toward Ancient and Classical era naval units.', 'EXPLORATION', {
      prodBoost: { target: 'unit', classes: ['naval'], eraMax: CLASSICAL, pct: 1 },
    }),
    P('CORVEE', 'Corvée', 'economic', '+15% production toward Ancient and Classical wonders.', 'DIVINE_RIGHT', {
      prodBoost: { target: 'wonder', classes: [], eraMax: CLASSICAL, pct: 0.15 },
    }),
    P('SERFDOM', 'Serfdom', 'economic', 'Newly trained Builders gain 2 extra build actions.', 'CIVIL_ENGINEERING', {
      builderCharges: 2,
    }),
    P('PUBLIC_WORKS', 'Public Works', 'economic', '+30% production toward Builders, and newly trained Builders gain 2 extra build actions.', undefined, {
      prodBoost: { target: 'unit', classes: ['builder'], eraMax: EVERY_ERA, pct: 0.3 },
      builderCharges: 2,
    }),
    P('GOTHIC_ARCHITECTURE', 'Gothic Architecture', 'economic', '+15% production toward Ancient through Renaissance wonders.', 'CIVIL_ENGINEERING', {
      prodBoost: { target: 'wonder', classes: [], eraMax: RENAISSANCE, pct: 0.15 },
    }),
    P('SKYSCRAPERS', 'Skyscrapers', 'economic', '+15% production toward all wonders.', undefined, {
      prodBoost: { target: 'wonder', classes: [], eraMax: EVERY_ERA, pct: 0.15 },
    }),
    P('ECONOMIC_UNION', 'Economic Union', 'economic', '+100% Commercial Hub and Harbor adjacency bonuses.', undefined, {
      adjacencyMult: { COMMERCIAL_HUB: 2, HARBOR: 2 },
    }),

    P('DIPLOMATIC_LEAGUE', 'Diplomatic League', 'diplomatic', 'The first envoy sent to each city-state counts as two.', undefined, {
      firstEnvoyDouble: true,
    }),
    P('CHARISMATIC_LEADER', 'Charismatic Leader', 'diplomatic', '+2 influence points per turn.', 'TOTALITARIANISM', {
      influencePerTurn: 2,
    }),
    P('CONTAINMENT', 'Containment', 'diplomatic', 'Each envoy counts double against a city-state whose suzerain has a different government.', undefined, {
      envoyDoubleDiffGov: true,
    }),
    P('COLLECTIVE_ACTIVISM', 'Collective Activism', 'diplomatic', '+5% culture per city-state this seat is suzerain of.', undefined, {
      culturePerSuzerain: 0.05,
    }),
    P('ONLINE_COMMUNITIES', 'Online Communities', 'economic', '+50% tourism toward civs this seat has a trade route to.', undefined, {
      tourismRouteBonus: 50,
    }),

    // CIV6 (Second Strike Capability): "Nuclear Device maintenance reduced by
    // 50% Gold per turn." A Military card off the Cold War civic.
    P('SECOND_STRIKE_CAPABILITY', 'Second Strike Capability', 'military', 'Nuclear device maintenance halved.', undefined, {
      wmdUpkeepPct: -50,
    }),

    P('STRATEGOS', 'Strategos', 'wildcard', '+2 Great General points per turn.', 'SCORCHED_EARTH', {
      gppFlat: { GENERAL: 2 },
    }),
    P('INSPIRATION', 'Inspiration', 'wildcard', '+2 Great Scientist points per turn.', 'NUCLEAR_PROGRAM', {
      gppFlat: { SCIENTIST: 2 },
    }),
    P('REVELATION', 'Revelation', 'wildcard', '+2 Great Prophet points per turn.', 'HUMANISM', {
      gppFlat: { PROPHET: 2 },
    }),
    P('LITERARY_TRADITION', 'Literary Tradition', 'wildcard', '+2 Great Writer points per turn.', undefined, {
      gppFlat: { WRITER: 2 },
    }),

    // ---- DARK AGE cards. Each description is the catalog's own text, benefit
    // then price; the era window is the catalog's first/last availability.
    DK('MONASTICISM', 'Monasticism', 1, 2,
      '+75% Science in cities with a Holy Site. BUT: -25% Culture in all cities.', {
      districtYieldMult: [{ district: 'HOLY_SITE', yield: 'science', mult: 1.75 }],
      yieldMult: { culture: 0.75 },
    }),
    DK('TWILIGHT_VALOR', 'Twilight Valor', 1, 3,
      'All units +5 Combat Strength for all melee attack units. BUT: Cannot heal outside your territory.', {
      unitCombatCS: { classes: ['MELEE'], cs: 5 },
      healOnlyHome: true,
    }),
    DK('INQUISITION', 'Inquisition', 1, 3,
      'Start Inquisition with 1 Apostle charge. All religious units are +15 Religious Combat Strength in friendly territory. BUT: -25% Science in all cities.', {
      religiousCsHome: 15,
      yieldMult: { science: 0.75 },
    }),
    DK('ISOLATIONISM', 'Isolationism', 1, 4,
      "Domestic routes provide +2 Food, +2 Production. BUT: Can't train or buy Settlers nor settle new cities.", {
      domesticRouteYield: { food: 2, production: 2 },
      noSettlers: true,
    }),
    DK('LETTERS_OF_MARQUE', 'Letters of Marque', 3, 5,
      'Naval Raiders: +100% Production, +2 Movement. Yields doubled from plundering Trade Routes. BUT: Trade Route yields -50%.', {
      navalRaiderProdMult: 2,
      navalRaiderMoves: 2,
      routePlunderMult: 2,
      routeYieldMult: 0.5,
    }),
    DK('ROBBER_BARONS', 'Robber Barons', 4, 6,
      '+50% Gold in cities with a Stock Exchange. +25% Production in cities with a Factory. BUT: -2 Amenities in all cities.', {
      buildingYieldMult: [
        { building: 'STOCK_EXCHANGE', yield: 'gold', mult: 1.5 },
        { building: 'FACTORY', yield: 'production', mult: 1.25 },
      ],
      amenitiesAll: -2,
    }),
    DK('ELITE_FORCES', 'Elite Forces', 4, 8,
      '+100% combat experience for all units. BUT: +2 Gold to maintain each military unit.', {
      xpPct: 100,
      militaryMaintenanceAdd: 2,
    }),
    DK('COLLECTIVISM', 'Collectivism', 5, 6,
      'Farms +1 Food. All cities +2 Housing. +100% Industrial Zone adjacency bonuses. BUT: Great People Points earned 50% slower.', {
      improvementYields: { FARM: { food: 1 } },
      housingAll: 2,
      adjacencyMult: { INDUSTRIAL_ZONE: 2 },
      gppMult: 0.5,
    }),
    DK('ROGUE_STATE', 'Rogue State', 6, 8,
      '+50% Production to nuclear program projects and WMDs. BUT: Earn no influence toward new Envoys.', {
      noEnvoyInfluence: true,
    }),
    DK('FLOWER_POWER', 'Flower Power', 6, 8,
      'All civilizations not currently at war receive +100% of the Tourism from your Concerts. BUT: The cost of producing and purchasing land units other than Rock Bands is increased by +100%.', {
      concertShare: 1,
      landUnitCostMult: 2,
    }),
    DK('CYBER_WARFARE', 'Cyber Warfare', 7, 8,
      '+10 Combat Strength against units from Information and Future Eras. BUT: Grievances against you do not decay.', {
      unitCsVsEra: { minEra: 7, cs: 10 },
      grievanceNoDecay: true,
    }),
    DK('AUTOMATED_WORKFORCE', 'Automated Workforce', 7, 8,
      'Your cities get +20% Production towards city projects. BUT: -1 Amenity and -5 Loyalty per turn in your cities.', {
      projectProdMult: 1.2,
      amenitiesAll: -1,
      loyaltyAll: -5,
    }),
    DK('DISINFORMATION_CAMPAIGN', 'Disinformation Campaign', 7, 8,
      '+3 Diplomatic Favor per turn for each Broadcast Center. BUT: -10% Science and Culture in all cities.', {
      favorPerBuilding: { building: 'BROADCAST_CENTER', favor: 3 },
      yieldMult: { science: 0.9, culture: 0.9 },
    }),
  ].map((p) => [p.id, p]),
);

/** CIV6: the nine accumulating bonus kinds the install's `GovernmentBonusNames`
 *  lists, less its own "none" row. Each government names exactly one — which is why a
 *  legacy card is worth a percentage of ONE thing and not the government's
 *  whole inherent package (C-73). */
export type GovBonusType =
  | 'wonderConstruction' | 'combatExperience' | 'greatPeople' | 'envoys'
  | 'faithPurchases' | 'goldPurchases' | 'unitProduction'
  | 'overallProduction' | 'districtProjects';

/** CIV6 (MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS): the government's
 *  accumulating bonus — `Increment` percent for every `Interval` turns held.
 *  `Interval` is ScaleByGameSpeed in the install. */
/** The WIRE order of `GovBonusType` — the index the GPU reads. Appended-to
 *  only at the end, like every other catalog this engine exports. */
export const GOV_BONUS_TYPES = [
  'wonderConstruction', 'combatExperience', 'greatPeople', 'envoys',
  'faithPurchases', 'goldPurchases', 'unitProduction',
  'overallProduction', 'districtProjects',
] as const;

export interface GovBonus {
  type: GovBonusType;
  increment: number;
  interval: number;
}

export interface GovernmentDef {
  id: string;
  name: string;
  tier: number;
  slots: SlotKind[];
  /** CIV6: absent on the Chiefdom alone, which accumulates nothing. */
  bonus?: GovBonus;
  /** The government's inherent bonus. Each row's CIV6 quote sits at its
   *  definition; where a term needs a channel this model has no shape for,
   *  the row carries the half that fits and the rest is an open AUDIT item. */
  effects: PolicyEffects;
  description: string;
}

const G = (
  id: string,
  name: string,
  tier: number,
  slots: SlotKind[],
  effects: PolicyEffects,
  description: string,
  bonus?: GovBonus,
): GovernmentDef => ({ id, name, tier, slots, effects, description, bonus });

/** The install's nine accumulating rows, verbatim from `Governments.xml`'s
 *  MODIFIER_PLAYER_GOVERNMENT_ACCUMULATING_BONUS arguments. Every one is
 *  Increment 1; only the interval differs. */
const GOV_BONUS: Record<string, GovBonus> = {
  OLIGARCHY: { type: 'combatExperience', increment: 1, interval: 5 },
  MONARCHY: { type: 'envoys', increment: 1, interval: 10 },
  DEMOCRACY: { type: 'districtProjects', increment: 1, interval: 10 },
  FASCISM: { type: 'unitProduction', increment: 1, interval: 10 },
  CLASSICAL_REPUBLIC: { type: 'greatPeople', increment: 1, interval: 15 },
  MERCHANT_REPUBLIC: { type: 'goldPurchases', increment: 1, interval: 15 },
  THEOCRACY: { type: 'faithPurchases', increment: 1, interval: 15 },
  AUTOCRACY: { type: 'wonderConstruction', increment: 1, interval: 20 },
  COMMUNISM: { type: 'overallProduction', increment: 1, interval: 20 },
};

const M = 'military' as const;
const E = 'economic' as const;
const D = 'diplomatic' as const;
const W = 'wildcard' as const;

export const GOVERNMENTS: Record<string, GovernmentDef> = Object.fromEntries(
  [
    G('CHIEFDOM', 'Chiefdom', 0, [M, E], {}, 'The starting government.'),
    // Slots sourced from the Gathering Storm Civilopedia: 1 Military,
    // 1 Economic, 1 Diplomatic, 1 Wildcard.
    // CIV6 (GS) INHERENT: "+1 to all yields for each Government Plaza
    // building, Diplomatic Quarter building, and palace in a city."
    G('AUTOCRACY', 'Autocracy', 1, [M, E, D, W],
      { yieldsPerGovBuilding: 1 },
      '+1 to all yields per government building in a city.'),
    // CIV6 (GS) INHERENT: "All land melee, anti-cavalry, and naval melee
    // class units gain +4 Combat Strength." The three are PROMOTION classes
    // (`UNIT_PROMO_CLASS`), so the Galley rides NAVAL_MELEE.
    G('OLIGARCHY', 'Oligarchy', 1, [M, M, E, W],
      { unitCombatCS: { classes: ['MELEE', 'ANTICAV', 'NAVAL_MELEE'], cs: 4 } },
      '+4 combat strength for melee and anti-cavalry units.'),
    // CIV6 (GS) INHERENT: "All cities with a district receive +1 Housing
    // and +1 Amenity." ANY completed district -- the specialty-gated
    // channels are the CARDS' shape (Insulae, Medina Quarter), not this
    // row's.
    G('CLASSICAL_REPUBLIC', 'Classical Republic', 1, [E, E, D, W],
      { cityWithDistrict: { housing: 1, amenities: 1 } },
      '+1 housing and +1 amenity in every city with a district.'),
    // CIV6 (GS) INHERENT: "+1 Housing per level of Walls." `wallsLevel`
    // answers it — the level BUILT, where `wallsTier` is the DEFENCE tier
    // Urban Defenses raises with no wall standing.
    G('MONARCHY', 'Monarchy', 2, [M, M, E, D, W, W], { housingPerWallLevel: 1 },
      '+1 housing per level of walls.'),
    // CIV6 (GS) INHERENT: "+10% Gold in all cities with an established
    // Governor."
    G('MERCHANT_REPUBLIC', 'Merchant Republic', 2, [M, E, E, D, D, W], { governorYieldMult: { gold: 1.1 } },
      '+10% gold in cities with an established governor.'),
    // CIV6 (GS) INHERENT: "+5 Religious Strength in Theological Combat.
    // +0.5 Faith per Citizen in cities with Governors." Buying land units
    // with Faith was VANILLA Theocracy's; Gathering Storm moved it to the
    // Grand Master's Chapel, which carries it (`faithBuyUnits`).
    G('THEOCRACY', 'Theocracy', 2, [M, M, E, E, D, W], { theologyCS: 5, governorPerCitizen: { faith: 0.5 } },
      '+5 religious strength in theological combat; +0.5 faith per citizen in cities with governors.'),
    // CIV6 (GS) INHERENT: "Your Trade Routes to an Ally or Suzerain's city
    // provide +4 Food and +4 Production for both cities. Alliance Points
    // with all allies increase by an additional .25 per turn." Both halves
    // want ALLIANCES, which this model has not got.
    G('DEMOCRACY', 'Democracy', 3, [M, E, E, E, D, D, W, W], {},
      'No modeled bonus yet.'),
    // CIV6 (GS) INHERENT: "+0.6 Production per Citizen in cities with
    // Governors."
    G('COMMUNISM', 'Communism', 3, [M, M, M, E, E, E, D, W], { governorPerCitizen: { production: 0.6 } },
      '+0.6 production per citizen in cities with governors.'),
    // CIV6 (GS) INHERENT: "All units gain +5 Combat Strength. War
    // Weariness reduced by 15%."
    G('FASCISM', 'Fascism', 3, [M, M, M, M, E, D, W, W],
      { unitCombatCS: { all: true, cs: 5 }, wwCutPct: 15 },
      '+5 combat strength for all units; -15% war weariness.'),
  ].map((g) => [g.id, { ...g, bonus: GOV_BONUS[g.id] }]),
);

// CIV6: every government but the Chiefdom has a LEGACY policy card — one
// "unlocked by" that government and "cannot be slotted while in" it.
// Appended LAST, so the wire's card indices (which the World Congress' Policy
// Treaty names) keep their positions.
//
// `effects` here is NOT what the card pays. A legacy card is worth the
// percentage its government has ACCUMULATED against its own BonusType, which
// only a seat can answer, so `applyGovernment` builds the real payload from
// `legacyEffects` and never reads this field for a legacy card (C-73). It
// stays because the wire and the UI both name a card's effects, and an empty
// object there would read as "this card does nothing".
for (const g of Object.values(GOVERNMENTS)) {
  if (g.tier === 0) continue; // the Chiefdom alone has no legacy bonus
  POLICIES[`LEGACY_${g.id}`] = {
    id: `LEGACY_${g.id}`,
    name: `${g.name} Legacy`,
    kind: 'wildcard',
    description: g.description,
    legacyOf: g.id,
    effects: g.effects,
  };
}

export function cardFitsSlot(card: PolicyDef, slot: SlotKind): boolean {
  return slot === 'wildcard' || card.kind === slot;
}

/** The policy cards in WIRE order — the exported table's index space, which
 *  the Policy Treaty resolution's target names. */
export const POLICY_LIST: readonly PolicyDef[] = Object.values(POLICIES);

/** The governments in WIRE order — what the World Ideology target names. */
export const GOVERNMENT_LIST: readonly GovernmentDef[] = Object.values(GOVERNMENTS);
