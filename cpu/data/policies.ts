/**
 * Governments and policy cards. Every card with a LIVE effect is sourced
 * verbatim from the GS Civilopedia (adjacency doublers, building-yield
 * doublers, housing/amenity conditionals, Veterancy, Land Surveyors, God
 * King, Urban Planning).
 *
 * Slot rules follow Civ 6: a card fits a slot of its own kind, and any card
 * fits a wildcard slot.
 *
 * A row with an EMPTY `effects` object is INERT — the description quotes the
 * real card, and nothing applies it. That is an open gap, not a decision: a
 * seat can spend a slot on one and get nothing. The GOVERNMENTS' inherent
 * bonuses below are flat stand-ins, also open.
 *
 * Card/government effects are expressed declaratively and assembled into a
 * single Modifiers object by `getModifiers` (core/effects.ts).
 */

import type { DistrictId, Yields } from '../core/types';

export type SlotKind = 'military' | 'economic' | 'diplomatic' | 'wildcard';
/** Slot kinds in the order a wonder-granted slot appends to a government's
 *  own list, and the order the GPU's per-kind slot counts are packed in. */
export const SLOT_KINDS = ['military', 'economic', 'diplomatic', 'wildcard'] as const;

/** Master switch for the whole government/policy layer: adoption
 * (`computeAdoption`), the government modifier layering and the GPU's
 * per-seat modifier tables. The exporter mirrors it into
 * `rules.governmentsLive` so both engines gate on one value. */
export const GOVERNMENTS_ADOPTION_LIVE = true;

export interface PolicyEffects {
  cityYields?: Partial<Yields>;
  capitalYields?: Partial<Yields>;
  adjacencyMult?: Partial<Record<DistrictId, number>>;
  buildingYieldMult?: Partial<Record<DistrictId, number>>;
  housingIfDistricts?: { min: number; housing: number };
  amenitiesIfSpecialty?: { min: number; amenities: number };
  newDeal?: { min: number; housing: number; amenities: number };
  tilePurchaseMult?: number;
  encampHarborProdMult?: number;
  yieldMult?: Partial<Yields>;
  amenitiesAll?: number;
  housingAll?: number;
}

export interface PolicyDef {
  id: string;
  name: string;
  kind: SlotKind;
  description: string;
  effects: PolicyEffects;
}

const P = (id: string, name: string, kind: SlotKind, description: string, effects: PolicyEffects): PolicyDef =>
  ({ id, name, kind, description, effects });

export const POLICIES: Record<string, PolicyDef> = Object.fromEntries(
  [
    P('URBAN_PLANNING', 'Urban Planning', 'economic', '+1 production in all cities.', {
      cityYields: { production: 1 },
    }),
    P('GOD_KING', 'God King', 'economic', '+1 faith and +1 gold in the capital.', {
      capitalYields: { faith: 1, gold: 1 },
    }),
    P('LAND_SURVEYORS', 'Land Surveyors', 'economic', 'Purchasing tiles costs 20% less gold.', {
      tilePurchaseMult: 0.8,
    }),
    P('INSULAE', 'Insulae', 'economic', '+1 housing in cities with 2+ specialty districts.', {
      housingIfDistricts: { min: 2, housing: 1 },
    }),
    P('VETERANCY', 'Veterancy', 'military', '+30% production toward Encampment and Harbor districts and their buildings.', {
      encampHarborProdMult: 1.3,
    }),
    P('NATURAL_PHILOSOPHY', 'Natural Philosophy', 'economic', '+100% Campus adjacency bonuses.', {
      adjacencyMult: { CAMPUS: 2 },
    }),
    P('SCRIPTURE', 'Scripture', 'economic', '+100% Holy Site adjacency bonuses.', {
      adjacencyMult: { HOLY_SITE: 2 },
    }),
    P('TOWN_CHARTERS', 'Town Charters', 'economic', '+100% Commercial Hub adjacency bonuses.', {
      adjacencyMult: { COMMERCIAL_HUB: 2 },
    }),
    P('NAVAL_INFRASTRUCTURE', 'Naval Infrastructure', 'economic', '+100% Harbor adjacency bonuses.', {
      adjacencyMult: { HARBOR: 2 },
    }),
    P('CRAFTSMEN', 'Craftsmen', 'economic', '+100% Industrial Zone adjacency bonuses.', {
      adjacencyMult: { INDUSTRIAL_ZONE: 2 },
    }),
    P('AESTHETICS', 'Aesthetics', 'economic', '+100% Theater Square adjacency bonuses.', {
      adjacencyMult: { THEATER_SQUARE: 2 },
    }),
    P('MEDINA_QUARTER', 'Medina Quarter', 'economic', '+2 housing in cities with 3+ specialty districts.', {
      housingIfDistricts: { min: 3, housing: 2 },
    }),
    P('SIMULTANEUM', 'Simultaneum', 'economic', 'Doubles faith from Holy Site buildings.', {
      buildingYieldMult: { HOLY_SITE: 2 },
    }),
    P('GRAND_OPERA', 'Grand Opéra', 'economic', '+100% culture from Theater Square buildings.', {
      buildingYieldMult: { THEATER_SQUARE: 2 },
    }),
    P('RATIONALISM', 'Rationalism', 'economic', '+100% science from Campus buildings.', {
      buildingYieldMult: { CAMPUS: 2 },
    }),
    P('FREE_MARKETS', 'Free Market', 'economic', '+100% gold from Commercial Hub buildings.', {
      buildingYieldMult: { COMMERCIAL_HUB: 2 },
    }),
    P('LIBERALISM', 'Liberalism', 'economic', '+1 amenity in cities with 2+ specialty districts.', {
      amenitiesIfSpecialty: { min: 2, amenities: 1 },
    }),
    P('NEW_DEAL', 'New Deal', 'wildcard', '+4 housing and +2 amenities in cities with 3+ specialty districts.', {
      newDeal: { min: 3, housing: 4, amenities: 2 },
    }),
    P('FIVE_YEAR_PLAN', 'Five-Year Plan', 'wildcard', '+100% Campus and Industrial Zone adjacency bonuses.', {
      adjacencyMult: { CAMPUS: 2, INDUSTRIAL_ZONE: 2 },
    }),

    // catalog breadth (real Civ 6 GS card set, appended AFTER the
    // originals so the greedy slot fill's table order — URBAN_PLANNING first
    // in every economic slot — is preserved). The MAJORITY are inert: their
    // real effects need a per-card MODIFIER channel neither engine has:
    // combat strength by unit class, production toward a unit or district
    // class, per-unit maintenance, promotion and goody-hut speed. A card
    // whose real effect maps to a channel that DOES exist carries it.

    P('DISCIPLINE', 'Discipline', 'military', '+combat strength vs barbarians.', {}),
    P('SURVEY', 'Survey', 'military', 'Faster tribal-village/goody rewards.', {}),
    P('MANEUVER', 'Maneuver', 'military', '+production toward heavy/light cavalry.', {}),
    P('AGOGE', 'Agoge', 'military', '+production toward ancient/classical melee & ranged.', {}),
    P('CHIVALRY', 'Chivalry', 'military', '+combat strength for cavalry.', {}),
    P('BASTIONS', 'Bastions', 'military', 'City-center defensive strength.', {}),
    P('FEUDAL_CONTRACT', 'Feudal Contract', 'military', '+production toward melee/ranged/anti-cavalry.', {}),
    P('CONSCRIPTION', 'Conscription', 'military', '-1 gold unit maintenance.', {}),
    P('LEVEE_EN_MASSE', 'Levée en Masse', 'military', '-1 gold land/naval/air maintenance.', {}),
    P('ELITE_FORCES', 'Elite Forces', 'military', '+movement/health for combat units.', {}),
    P('MILITARY_FIRST', 'Military First', 'military', '+combat strength & faster promotions.', {}),
    P('REDOUBT', 'Redoubt', 'military', 'Anti-cavalry/support strength.', {}),
    P('TOTAL_WAR', 'Total War', 'military', '+combat strength attacking, faster support.', {}),

    P('GOD_OF_THE_OPEN_SKY', 'God of the Open Sky', 'economic', '+culture from pastures.', {}),
    P('COLONIZATION', 'Colonization', 'economic', '+50% production toward Settlers.', {}),
    P('ILKUM', 'Ilkum', 'economic', '+30% production toward Builders.', {}),
    P('CARAVANSARIES', 'Caravansaries', 'economic', '+2 gold from trade routes.', {}),
    P('MARITIME_INDUSTRIES', 'Maritime Industries', 'economic', '+production toward naval units.', {}),
    P('CORVEE', 'Corvée', 'economic', '+15% production toward ancient/classical wonders.', {}),
    P('SERFDOM', 'Serfdom', 'economic', '+2 Builder charges.', {}),
    P('PUBLIC_WORKS', 'Public Works', 'economic', '+15% production toward districts.', {}),
    P('GOTHIC_ARCHITECTURE', 'Gothic Architecture', 'economic', '+15% production toward medieval/renaissance wonders.', {}),
    P('SKYSCRAPERS', 'Skyscrapers', 'economic', '-15% production cost of wonders.', {}),
    P('ECONOMIC_UNION', 'Economic Union', 'economic', '+gold from Commercial Hub/Harbor buildings (trade-adjacent; inert).', {}),
    P('GRAND_MASTERS_CHAPEL', 'Grand Master’s Chapel', 'economic', 'Faith may buy land military units.', {}),
    P('FREE_TRADE', 'Free Trade', 'economic', '+1 trade-route capacity.', {}),

    P('DIPLOMATIC_LEAGUE', 'Diplomatic League', 'diplomatic', 'First envoy to a city-state counts double (envoys not policy-driven here).', {}),
    P('CHARISMATIC_LEADER', 'Charismatic Leader', 'diplomatic', '+influence-point generation (influence-per-turn not policy-driven here).', {}),
    P('CONTAINMENT', 'Containment', 'diplomatic', 'Suzerain influence against other civs.', {}),
    P('COLLECTIVE_ACTIVISM', 'Collective Activism', 'diplomatic', '+favor from city-states/alliances.', {}),
    P('ONLINE_COMMUNITIES', 'Online Communities', 'diplomatic', '+tourism per government.', {}),
    P('MARTYRDOM', 'Martyrdom', 'diplomatic', 'Great-Prophet/faith diplomacy.', {}),

    P('STRATEGOS', 'Strategos', 'wildcard', '+Great General points.', {}),
    P('INSPIRATION', 'Inspiration', 'wildcard', '+Great Scientist points.', {}),
    P('REVELATION', 'Revelation', 'wildcard', '+Great Prophet points.', {}),
    P('LITERARY_TRADITION', 'Literary Tradition', 'wildcard', '+Great Writer points.', {}),
    P('MONUMENTALITY', 'Monumentality', 'wildcard', 'Faith may buy builders/settlers in a Golden Age.', {}),
  ].map((p) => [p.id, p]),
);


export interface GovernmentDef {
  id: string;
  name: string;
  tier: number;
  slots: SlotKind[];
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
): GovernmentDef => ({ id, name, tier, slots, effects, description });

const M = 'military' as const;
const E = 'economic' as const;
const D = 'diplomatic' as const;
const W = 'wildcard' as const;

export const GOVERNMENTS: Record<string, GovernmentDef> = Object.fromEntries(
  [
    G('CHIEFDOM', 'Chiefdom', 0, [M, E], {}, 'The starting government.'),
    // Slots sourced from the Gathering Storm Civilopedia: 1 Military,
    // 1 Economic, 1 Diplomatic, 1 Wildcard. Was [M, M, E, D] — the same TOTAL
    // of 4, which is why no gate ever caught the wrong composition.
    // CIV6 (GS): "+1 to all yields for each government building and Palace in
    // a city. +10% Production toward Wonders." The PALACE half is what this
    // model can address — there is no Government Plaza to hold the rest.
    G('AUTOCRACY', 'Autocracy', 1, [M, E, D, W], { capitalYields: { food: 1, production: 1, gold: 1, science: 1, culture: 1, faith: 1 } },
      '+1 to all yields in the capital, for its Palace.'),
    G('OLIGARCHY', 'Oligarchy', 1, [M, M, E, W], {},
      'Combat bonuses.'),
    // CIV6 (GS): "All cities with a district receive +1 Housing and +1
    // Amenity. +15% Great Person points."
    G('CLASSICAL_REPUBLIC', 'Classical Republic', 1, [E, E, D, W],
      { housingIfDistricts: { min: 1, housing: 1 }, amenitiesIfSpecialty: { min: 1, amenities: 1 } },
      '+1 housing and +1 amenity in every city with a district.'),
    G('MONARCHY', 'Monarchy', 2, [M, M, E, D, W, W], { housingAll: 1 },
      '+1 housing in all cities.'),
    G('MERCHANT_REPUBLIC', 'Merchant Republic', 2, [M, E, E, D, D, W], { yieldMult: { gold: 1.1 } },
      '+10% gold in all cities.'),
    G('THEOCRACY', 'Theocracy', 2, [M, M, E, E, D, W], { yieldMult: { faith: 1.1 } },
      '+10% faith in all cities.'),
    G('DEMOCRACY', 'Democracy', 3, [M, E, E, E, D, D, W, W], { yieldMult: { culture: 1.1 } },
      '+10% culture in all cities.'),
    // CIV6 (GS): "+0.6 Production per Citizen in cities with Governors.
    // +10% Science."
    G('COMMUNISM', 'Communism', 3, [M, M, M, E, E, E, D, W], { yieldMult: { science: 1.1 } },
      '+10% science in all cities.'),
    G('FASCISM', 'Fascism', 3, [M, M, M, M, E, D, W, W], {},
      'Combat bonuses.'),
  ].map((g) => [g.id, g]),
);

export function cardFitsSlot(card: PolicyDef, slot: SlotKind): boolean {
  return slot === 'wildcard' || card.kind === slot;
}

/** The policy cards in WIRE order — the exported table's index space, which
 *  the Policy Treaty resolution's target names. */
export const POLICY_LIST: readonly PolicyDef[] = Object.values(POLICIES);

/** The governments in WIRE order — what the World Ideology target names. */
export const GOVERNMENT_LIST: readonly GovernmentDef[] = Object.values(GOVERNMENTS);
