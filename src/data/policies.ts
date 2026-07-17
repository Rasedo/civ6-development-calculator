/**
 * Governments and policy cards (base-game style, eyeballed numbers).
 *
 * Slot rules follow Civ 6: a card fits a slot of its own kind, and any card
 * fits a wildcard slot. With no other civs/units/trade in this calculator,
 * diplomatic cards don't exist yet — diplomatic slots sit idle (documented),
 * and only one military-economy card (Veterancy) is included.
 *
 * Card/government effects are expressed declaratively and assembled into a
 * single Modifiers object by src/core/effects.ts.
 */

import type { DistrictId, Yields } from '../core/types';

export type SlotKind = 'military' | 'economic' | 'diplomatic' | 'wildcard';

/**
 * A-7r behavioral master switch. The government/policy ADOPTION machinery
 * (computeAdoption + getRivalModifiers government layering + the scripted
 * player's autoGovernment + the GPU per-seat modifier tables) is fully
 * implemented and turn-exact between the two engines. It is landed INERT
 * (repo discipline: new tables/planes land changing nothing before behavior
 * flips on) because flipping it live exposes a PRE-EXISTING, out-of-slice
 * rival-unit-march ordering latent: URBAN_PLANNING's +1 production (applied
 * turn-exactly to both seats) shifts the rival build/train trajectory onto a
 * configuration where the rival war-march (`hostileUnitAct`, rivals.ts) —
 * whose GPU twin iterates unit SLOTS while TS iterates spawn/insertion order —
 * captures a player builder one turn apart (seed 9066 t98 `punits`, a single
 * self-correcting off-by-one). That latent is in the rival-combat domain
 * (chapter B / other slices), not economy. Flip this to `true` in the slice
 * that fixes the rival-march ordering; the exporter mirrors it into
 * rules.governmentsLive so both engines stay in lockstep. */
export const GOVERNMENTS_ADOPTION_LIVE = true; // #46r 2026-07-17: LIVE (see the G-3 hunt in gpu/AUDIT.md — the ordering theory above was re-verified before the flip)

export interface PolicyEffects {
  /** Flat yields added to every city. */
  cityYields?: Partial<Yields>;
  /** Flat yields added to the capital only. */
  capitalYields?: Partial<Yields>;
  /** Multiplies the adjacency bonus of these districts (e.g. 2 = +100%). */
  adjacencyMult?: Partial<Record<DistrictId, number>>;
  /** Multiplies building yields belonging to these districts (e.g. 1.5). */
  buildingYieldMult?: Partial<Record<DistrictId, number>>;
  /** Housing in cities with at least N districts (city center included). */
  housingIfDistricts?: { min: number; housing: number };
  /** Amenities in cities with at least N specialty districts. */
  amenitiesIfSpecialty?: { min: number; amenities: number };
  /** Housing+amenities in cities with at least N specialty districts. */
  newDeal?: { min: number; housing: number; amenities: number };
  /** Multiplier on tile purchase gold cost (0.8 = 20% cheaper). */
  tilePurchaseMult?: number;
  /** Multiplier on production put toward Encampment district/buildings. */
  encampmentProdMult?: number;
  /** Percentage multipliers applied to final city yields. */
  yieldMult?: Partial<Yields>;
  /** Flat amenities in every city. */
  amenitiesAll?: number;
  /** Flat housing in every city. */
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
    P('INSULAE', 'Insulae', 'economic', '+1 housing in cities with 2+ districts.', {
      housingIfDistricts: { min: 2, housing: 1 },
    }),
    P('VETERANCY', 'Veterancy', 'military', '+30% production toward Encampment district and its buildings.', {
      encampmentProdMult: 1.3,
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
    P('MEDINA_QUARTER', 'Medina Quarter', 'economic', '+2 housing in cities with 3+ districts.', {
      housingIfDistricts: { min: 3, housing: 2 },
    }),
    P('SIMULTANEUM', 'Simultaneum', 'economic', '+50% faith from Holy Site buildings.', {
      buildingYieldMult: { HOLY_SITE: 1.5 },
    }),
    P('GRAND_OPERA', 'Grand Opéra', 'economic', '+50% culture from Theater Square buildings.', {
      buildingYieldMult: { THEATER_SQUARE: 1.5 },
    }),
    P('RATIONALISM', 'Rationalism', 'economic', '+50% science from Campus buildings.', {
      buildingYieldMult: { CAMPUS: 1.5 },
    }),
    P('FREE_MARKETS', 'Free Markets', 'economic', '+50% gold from Commercial Hub buildings.', {
      buildingYieldMult: { COMMERCIAL_HUB: 1.5 },
    }),
    P('LIBERALISM', 'Liberalism', 'economic', '+1 amenity in cities with 2+ specialty districts.', {
      amenitiesIfSpecialty: { min: 2, amenities: 1 },
    }),
    P('NEW_DEAL', 'New Deal', 'wildcard', '+2 housing and +1 amenity in cities with 3+ specialty districts.', {
      newDeal: { min: 3, housing: 2, amenities: 1 },
    }),
    P('FIVE_YEAR_PLAN', 'Five-Year Plan', 'wildcard', '+100% Campus and Industrial Zone adjacency bonuses.', {
      adjacencyMult: { CAMPUS: 2, INDUSTRIAL_ZONE: 2 },
    }),

    // B-13 catalog breadth (real Civ 6 GS card set, appended AFTER the
    // originals so the greedy slot fill's table order — URBAN_PLANNING first
    // in every economic slot — is preserved). The MAJORITY are inert: their
    // real effects need systems this calculator does not model (unit combat,
    // unit/settler/builder/wonder production multipliers, trade routes,
    // tourism, envoys, grievances, spies, great-people points). Per common
    // rule 2 they land as catalog rows with empty effects (recorded in
    // ROUND_B2_LOG). Cards whose real effect maps to an existing channel carry
    // it. Diplomatic cards exist now so diplomatic slots stop sitting idle.

    // --- Military (combat / unit-production — inert) ---------------------------
    P('DISCIPLINE', 'Discipline', 'military', '+combat strength vs barbarians (combat not modeled).', {}),
    P('SURVEY', 'Survey', 'military', 'Faster tribal-village/goody rewards (not modeled).', {}),
    P('MANEUVER', 'Maneuver', 'military', '+production toward heavy/light cavalry (not modeled).', {}),
    P('AGOGE', 'Agoge', 'military', '+production toward ancient/classical melee & ranged (not modeled).', {}),
    P('CHIVALRY', 'Chivalry', 'military', '+combat strength for cavalry (not modeled).', {}),
    P('BASTIONS', 'Bastions', 'military', 'City-center defensive strength (not modeled).', {}),
    P('FEUDAL_CONTRACT', 'Feudal Contract', 'military', '+production toward melee/ranged/anti-cavalry (not modeled).', {}),
    P('CONSCRIPTION', 'Conscription', 'military', '-1 gold unit maintenance (per-unit upkeep not modeled).', {}),
    P('LEVEE_EN_MASSE', 'Levée en Masse', 'military', '-1 gold land/naval/air maintenance (not modeled).', {}),
    P('ELITE_FORCES', 'Elite Forces', 'military', '+movement/health for combat units (not modeled).', {}),
    P('MILITARY_FIRST', 'Military First', 'military', '+combat strength & faster promotions (not modeled).', {}),
    P('REDOUBT', 'Redoubt', 'military', 'Anti-cavalry/support strength (not modeled).', {}),
    P('TOTAL_WAR', 'Total War', 'military', '+combat strength attacking, faster support (not modeled).', {}),

    // --- Economic (production/trade/wonder/GP multipliers — mostly inert) ------
    P('GOD_OF_THE_OPEN_SKY', 'God of the Open Sky', 'economic', '+culture from pastures (feature-yield not modeled here).', {}),
    P('COLONIZATION', 'Colonization', 'economic', '+50% production toward Settlers (settler-production multiplier not modeled).', {}),
    P('ILKUM', 'Ilkum', 'economic', '+30% production toward Builders (builder-production multiplier not modeled).', {}),
    P('CARAVANSARIES', 'Caravansaries', 'economic', '+2 gold from trade routes (trade routes not modeled).', {}),
    P('MARITIME_INDUSTRIES', 'Maritime Industries', 'economic', '+production toward naval units (naval not modeled).', {}),
    P('CORVEE', 'Corvée', 'economic', '+15% production toward ancient/classical wonders (wonder multiplier not modeled).', {}),
    P('SERFDOM', 'Serfdom', 'economic', '+2 Builder charges (builder charges not modeled).', {}),
    P('PUBLIC_WORKS', 'Public Works', 'economic', '+15% production toward districts (district-production multiplier not modeled).', {}),
    P('GOTHIC_ARCHITECTURE', 'Gothic Architecture', 'economic', '+15% production toward medieval/renaissance wonders (not modeled).', {}),
    P('SKYSCRAPERS', 'Skyscrapers', 'economic', '-15% production cost of wonders (not modeled).', {}),
    P('ECONOMIC_UNION', 'Economic Union', 'economic', '+gold from Commercial Hub/Harbor buildings (trade-adjacent; inert).', {}),
    P('GRAND_MASTERS_CHAPEL', 'Grand Master’s Chapel', 'economic', 'Faith may buy land military units (faith-purchase of units not modeled).', {}),
    P('FREE_TRADE', 'Free Trade', 'economic', '+1 trade-route capacity (trade routes not modeled).', {}),

    // --- Diplomatic (envoys/grievances/spies/tourism — inert fillers) ---------
    P('DIPLOMATIC_LEAGUE', 'Diplomatic League', 'diplomatic', 'First envoy to a city-state counts double (envoys not policy-driven here).', {}),
    P('CHARISMATIC_LEADER', 'Charismatic Leader', 'diplomatic', '+influence-point generation (influence-per-turn not policy-driven here).', {}),
    P('CONTAINMENT', 'Containment', 'diplomatic', 'Suzerain influence vs rivals (not modeled).', {}),
    P('COLLECTIVE_ACTIVISM', 'Collective Activism', 'diplomatic', '+favor from city-states/alliances (diplomatic favor not modeled).', {}),
    P('ONLINE_COMMUNITIES', 'Online Communities', 'diplomatic', '+tourism per government (tourism not modeled).', {}),
    P('MARTYRDOM', 'Martyrdom', 'diplomatic', 'Great-Prophet/faith diplomacy (not modeled).', {}),

    // --- Wildcard (great-people / faith / tourism — inert) --------------------
    P('STRATEGOS', 'Strategos', 'wildcard', '+Great General points (GP points not modeled).', {}),
    P('INSPIRATION', 'Inspiration', 'wildcard', '+Great Scientist points (GP points not modeled).', {}),
    P('REVELATION', 'Revelation', 'wildcard', '+Great Prophet points (GP points not modeled).', {}),
    P('LITERARY_TRADITION', 'Literary Tradition', 'wildcard', '+Great Writer points (GP points not modeled).', {}),
    P('MONUMENTALITY', 'Monumentality', 'wildcard', 'Faith may buy builders/settlers in a Golden Age (Ages/faith-purchase not modeled).', {}),
  ].map((p) => [p.id, p]),
);

// ---------------------------------------------------------------------------

export interface GovernmentDef {
  id: string;
  name: string;
  tier: number;
  slots: SlotKind[];
  /** Inherent bonus (eyeballed stand-ins where the real one needs systems we don't model). */
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
    G('AUTOCRACY', 'Autocracy', 1, [M, M, E, D], { capitalYields: { food: 1, production: 1, gold: 1, science: 1, culture: 1, faith: 1 } },
      '+1 to all yields in the capital.'),
    G('OLIGARCHY', 'Oligarchy', 1, [M, E, D, W], {},
      'Combat bonuses (not modeled in this calculator).'),
    G('CLASSICAL_REPUBLIC', 'Classical Republic', 1, [E, E, D, W], { amenitiesAll: 1 },
      '+1 amenity in all cities.'),
    G('MONARCHY', 'Monarchy', 2, [M, M, M, E, D, W], { housingAll: 1 },
      '+1 housing in all cities.'),
    G('MERCHANT_REPUBLIC', 'Merchant Republic', 2, [M, E, E, D, W, W], { yieldMult: { gold: 1.1 } },
      '+10% gold in all cities.'),
    G('THEOCRACY', 'Theocracy', 2, [M, M, E, E, D, W], { yieldMult: { faith: 1.1 } },
      '+10% faith in all cities.'),
    G('DEMOCRACY', 'Democracy', 3, [M, E, E, E, D, D, W, W], { yieldMult: { culture: 1.1 } },
      '+10% culture in all cities.'),
    G('COMMUNISM', 'Communism', 3, [M, M, M, E, E, E, D, W], { yieldMult: { production: 1.1 } },
      '+10% production in all cities.'),
    G('FASCISM', 'Fascism', 3, [M, M, M, M, E, D, W, W], {},
      'Combat bonuses (not modeled in this calculator).'),
  ].map((g) => [g.id, g]),
);

/** Can `card` sit in a slot of `slot` kind? */
export function cardFitsSlot(card: PolicyDef, slot: SlotKind): boolean {
  return slot === 'wildcard' || card.kind === slot;
}
