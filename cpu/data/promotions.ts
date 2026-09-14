/**
 * UNIT PROMOTIONS. SOURCED: every row below is a line of the Civ 6
 * "List of promotions in Civ6" table — tier, effect and prerequisite — plus
 * the Apostle's own flat list from the Apostle page.
 *
 * A class holds exactly 7 promotions in four tiers (two tier-I roots, two
 * tier-II, two tier-III, one tier-IV), and `requires` is an OR: any one of
 * the named promotions opens the row. The Apostle's nine are a LIST, not a
 * tree — it "cannot in fact earn XP in any way", so it takes its one
 * promotion at purchase and never levels.
 *
 * `kind` NONE marks a row this engine sources but cannot carry; the AUDIT
 * names the blocker for each. The Espionage and Rock Band lists are flat
 * pools drawn three at a time, from the game's own tables.
 */

import type { DistrictId } from '../core/types';
import {
  SPY_M_SIPHON_FUNDS, SPY_M_GREAT_WORK_HEIST, SPY_M_SABOTAGE_PRODUCTION,
  SPY_M_STEAL_TECH_BOOST, SPY_M_RECRUIT_PARTISANS, SPY_M_DISRUPT_ROCKETRY,
  SPY_M_FOMENT_UNREST, SPY_M_NEUTRALIZE_GOVERNOR, SPY_M_BREACH_DAM,
  SPY_M_COUNTERSPY, SPY_M_FABRICATE_SCANDAL,
} from './espionage';
import { xml, type SrcMap } from './provenance';

export const PROMO_CLASSES = [
  'RECON', 'MELEE', 'RANGED', 'ANTICAV', 'LIGHT_CAV', 'HEAVY_CAV',
  'SIEGE', 'NAVAL_MELEE', 'NAVAL_RANGED', 'APOSTLE', 'MONK',
  'AIR_FIGHTER', 'AIR_BOMBER', 'NAVAL_RAIDER', 'NAVAL_CARRIER', 'ESPIONAGE',
  'ROCK_BAND',
] as const;
export type PromoClass = (typeof PROMO_CLASSES)[number];

/** the classes a `CS_VS_*` mask can address, in BIT order — the wire's own
 *  numbering, so a new class appends and never renumbers an exported mask.
 *  APOSTLE and MONK are never targets. */
const TARGET_CLASSES = [
  'RECON', 'MELEE', 'RANGED', 'ANTICAV', 'LIGHT_CAV', 'HEAVY_CAV',
  'SIEGE', 'NAVAL_MELEE', 'NAVAL_RANGED',
  'AIR_FIGHTER', 'AIR_BOMBER', 'NAVAL_RAIDER', 'NAVAL_CARRIER',
] as const;
export const CLASS_BIT: Readonly<Record<string, number>> = Object.fromEntries(
  TARGET_CLASSES.map((c, i) => [c, 1 << i]),
);
export const MASK_LAND = CLASS_BIT.RECON | CLASS_BIT.MELEE | CLASS_BIT.RANGED
  | CLASS_BIT.ANTICAV | CLASS_BIT.LIGHT_CAV | CLASS_BIT.HEAVY_CAV | CLASS_BIT.SIEGE;
/** CIV6 groups every hull under "naval units", the raider included. */
export const MASK_NAVAL = CLASS_BIT.NAVAL_MELEE | CLASS_BIT.NAVAL_RANGED
  | CLASS_BIT.NAVAL_RAIDER | CLASS_BIT.NAVAL_CARRIER;
export const MASK_CAVALRY = CLASS_BIT.LIGHT_CAV | CLASS_BIT.HEAVY_CAV;
export const MASK_AIR = CLASS_BIT.AIR_FIGHTER | CLASS_BIT.AIR_BOMBER;

/** CIV6 (Rock Band promotions, Expansion2_UnitPromotions): the VENUE KINDS
 *  the band's rows name — the bit a concert tile presents to a `BAND_LEVEL`
 *  or `BAND_VENUE` mask. A district counts only complete. The Street
 *  Carnival, Acropolis, Royal Navy Dockyard and Water Street Carnival
 *  clauses arrive with the unique districts. */
export const BAND_VENUE_BIT = {
  WONDER: 1, ENTERTAINMENT_COMPLEX: 2, THEATER_SQUARE: 4, WATER_PARK: 8,
  NATIONAL_PARK: 16, NATURAL_WONDER: 32, SPACEPORT: 64, CAMPUS: 128,
  SEASIDE_RESORT: 256, HARBOR: 512,
} as const;
/** the venue kinds that are DISTRICTS, by catalog id. */
export const BAND_VENUE_DISTRICTS: readonly (keyof typeof BAND_VENUE_BIT & DistrictId)[] = [
  'ENTERTAINMENT_COMPLEX', 'THEATER_SQUARE', 'WATER_PARK', 'SPACEPORT', 'CAMPUS', 'HARBOR',
];
/** CIV6 (Goes to 11): "Civilizations within 10 tiles receive 50% of the
 *  Tourism from this concert" — TOURISM_BOMB_RANGE Range 10. */
export const CONCERT_SHARE_RANGE = 10;
/** CIV6 GlobalParameters ROCK_BAND_MAX_PROMOTIONS. */
export const ROCK_BAND_MAX_PROMOTIONS = 4;
/** CIV6 (Rock Band, Expansion2_Units): InitialLevel 2, NumRandomChoices 3 —
 *  one promotion at purchase, chosen from three drawn at random; the Apostle's
 *  own pair in Units.xml reads the same. */
export const PROMO_OFFER_DRAW = 3;

export const PROMO_KINDS = [
  'NONE',
  'CS_ALL',              // +v in every roll this unit fights
  'CS_VS_CLASS_ATK',     // +v attacking a foe in `mask`
  'CS_VS_CLASS_ANY',     // +v against a foe in `mask`, attacking or defending
  'CS_DEF_VS_CLASS',     // +v defending against a foe in `mask`
  'CS_DEF_RANGED',       // +v defending against a RANGED attack
  'CS_DEF_ANY',          // +v whenever this unit defends
  'CS_DEF_VS_CITY',      // +v defending against a CITY's strike
  'CS_DEF_VS_AIR',       // +v defending against an AIR strike
  'CS_DEF_VS_AA',        // +v when an aircraft defends against anti-air fire
  'CS_DEF_TERRAIN',      // +v defending on woods / rainforest / hills / marsh
  'CS_IN_DISTRICT',      // +v while this unit occupies a district or a Fort
  'CS_ATK_DISTRICT',     // +v on a MELEE attack into a district
  'CS_VS_IN_DISTRICT',   // +v against a foe standing in a district
  'CS_VS_DISTRICT_DEF',  // +v against district DEFENSES (a city or Encampment)
  'CS_VS_DAMAGED',       // +v against a foe below full HP
  'CS_VS_FORTIFIED',     // +v against a fortified defender
  'MOVES',               // +v movement
  'SIGHT',               // +v sight range
  'RANGE',               // +v attack range
  'CLIFFS',              // may scale cliffs
  'AMPHIBIOUS',          // waives the amphibious and river ATTACK penalties
  'FLANK_MULT',          // flanking RECEIVED multiplied by v
  'SUPPORT_MULT',        // support RECEIVED multiplied by v
  'MOVE_AFTER_ATTACK',   // attacking does not consume the turn
  'SIEGE_MOVE_SHOOT',    // a siege unit may attack after moving
  'HEAL_ANYWHERE',       // heals outside friendly territory
  'HEAL_AFTER_ATTACK',   // attacking does not silence this turn's heal
  'RAID_GOLD',           // +v gold on top of a coastal raid's own take
  'NAVAL_KILL_GOLD',     // gold worth v% of a defeated NAVAL unit's strength
  'AIR_SLOTS',           // +v aircraft this hull bases
  'AIR_PILLAGE_ANY_HP',  // may air pillage at any health
  'SPY_OP_LEVEL',        // +v spy levels on the mission whose bit is in `mask`
  'SPY_ESCAPE_LEVEL',    // +v levels on the ESCAPE roll alone
  'SPY_OP_SPEED',        // every mission's clock is v% shorter
  'SPY_NO_ESTABLISH',    // the spy arrives ready, with no travel clock at all
  'SPY_HOME_ALLY_LEVEL', // posted at home, every own spy operates at +v levels
  'SPY_HOME_ENEMY_LEVEL',// posted at home, enemy spies here operate v levels down
  'SPY_SURVEIL',         // a counterspy post guards every district of its city, +v levels within reach
  'PILLAGE_CHEAP',       // pillaging costs v movement
  'HOLD_THE_LINE',       // adjacent OWN units of another class get +v vs cavalry
  'TERRAIN_MOVE_WOODS',  // woods and rainforest cost 1
  'TERRAIN_MOVE_HILLS',  // hills cost 1
  'RELIG_CS',            // +v Religious Strength in theological combat
  'MARTYR',              // a Relic when this unit dies in theological combat
  'SPREAD_CHARGES',      // +v spread charges at purchase
  'PROSELYTIZER',        // a spread strips v% of other religions' pressure
  'TRANSLATOR',          // spread is v times as strong in a foreign city
  'INDULGENCE',          // +v gold the first time this unit converts a city
  'CHAPLAIN',            // heals adjacent own military units by v
  'HEATHEN',             // converts adjacent barbarians for a charge
  'PILGRIM',             // +v spreads on first reaching a natural wonder
  'STEALTH',             // only an ADJACENT enemy unit sees this one
  'EXTRA_ATTACK',        // +v attacks per turn, movement permitting
  'EXTRA_ATTACK_STILL',  // +v attacks per turn, and only if it has not moved
  'KILL_SPREAD',         // v religious pressure nearby on a non-barbarian kill
  'ZOC_EXERT',           // a RANGED-class unit exerts zone of control
  'ESCORT_SPEED',        // an escorted unit is dragged free of its own MP
  'CS_IN_FORMATION',     // +v Combat Strength while this unit escorts one
  'BAND_LEVEL',          // a concert on a venue kind in `mask` plays v levels higher
  'BAND_VENUE',          // +v venue value on a tile whose venue kind is in `mask`
  'CONCERT_SHARE_NEAR',  // every civilization within CONCERT_SHARE_RANGE tiles takes v% of the concert
  'CONCERT_LOYALTY',     // the host city loses v Loyalty
  'CONCERT_GOLD_PCT',    // v% of the concert's Tourism arrives as Gold
  'CONCERT_CONVERT',     // the host city converts to the performer's religion
  'SEE_THROUGH',         // CIV6 (Sentry, CanSee): features put no height in the way of this unit's look
] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

export interface PromoEffect {
  kind: PromoKind;
  v?: number;
  mask?: number;
}

export interface PromoDef {
  id: string;
  cls: PromoClass;
  tier: number;
  /** OR-list: any one of these opens the row. Empty = a tier-I root. */
  requires: readonly string[];
  effects: readonly PromoEffect[];
  /** PROVENANCE, per column — see PROMO_SRC below. */
  src?: SrcMap;
}

/** PROVENANCE (cpu/data/provenance.ts), keyed by promotion id and attached by `P`
 *  below — these rows are built through a positional helper with a REST effects
 *  list, so the tag cannot ride inside the call. Stripped by the exporter; checked
 *  by tools/civ6lab/xml_check.py. */
const PROMO_SRC: Readonly<Record<string, SrcMap>> = {
  RANGER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_RANGER', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_RANGER', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_RANGER' },
  },
  ALPINE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ALPINE', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ALPINE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_ALPINE' },
  },
  SENTRY: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SENTRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SENTRY', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_SENTRY, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SENTRY&PrereqUnitPromotion=PROMOTION_RANGER', 'PrereqUnitPromotion', { expect: 'PROMOTION_RANGER' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SENTRY&PrereqUnitPromotion=PROMOTION_ALPINE', 'PrereqUnitPromotion', { expect: 'PROMOTION_ALPINE' })] },
  },
  GUERRILLA: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GUERRILLA', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GUERRILLA', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_GUERRILLA, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_GUERRILLA&PrereqUnitPromotion=PROMOTION_RANGER', 'PrereqUnitPromotion', { expect: 'PROMOTION_RANGER' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_GUERRILLA&PrereqUnitPromotion=PROMOTION_ALPINE', 'PrereqUnitPromotion', { expect: 'PROMOTION_ALPINE' })] },
  },
  SPYGLASS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPYGLASS', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPYGLASS', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SPYGLASS&PrereqUnitPromotion=PROMOTION_SENTRY', 'PrereqUnitPromotion', { expect: 'PROMOTION_SENTRY' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPYGLASS_BONUS_SIGHT&Name=Amount', 'Value'),
  },
  AMBUSH: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_AMBUSH', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_AMBUSH', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_AMBUSH&PrereqUnitPromotion=PROMOTION_GUERRILLA', 'PrereqUnitPromotion', { expect: 'PROMOTION_GUERRILLA' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=AMBUSH_INCREASED_COMBAT_STRENGTH&Name=Amount', 'Value'),
  },
  CAMOUFLAGE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CAMOUFLAGE', 'PromotionClass', { expect: 'PROMOTION_CLASS_RECON' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CAMOUFLAGE', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_CAMOUFLAGE, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CAMOUFLAGE&PrereqUnitPromotion=PROMOTION_SPYGLASS', 'PrereqUnitPromotion', { expect: 'PROMOTION_SPYGLASS' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CAMOUFLAGE&PrereqUnitPromotion=PROMOTION_AMBUSH', 'PrereqUnitPromotion', { expect: 'PROMOTION_AMBUSH' })] },
  },
  BATTLECRY: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BATTLECRY', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BATTLECRY', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_BATTLECRY' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=BATTLECRY_BONUS_VS_MELEE_RANGED&Name=Amount', 'Value'),
  },
  TORTOISE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TORTOISE', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TORTOISE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_TORTOISE' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=TORTOISE_DEFENSE_BONUS_VS_RANGED_COMBAT&Name=Amount', 'Value'),
  },
  COMMANDO: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COMMANDO', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COMMANDO', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_COMMANDO, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_COMMANDO&PrereqUnitPromotion=PROMOTION_BATTLECRY', 'PrereqUnitPromotion', { expect: 'PROMOTION_BATTLECRY' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_COMMANDO&PrereqUnitPromotion=PROMOTION_AMPHIBIOUS', 'PrereqUnitPromotion', { expect: 'PROMOTION_AMPHIBIOUS' })] },
    'effects.1.v': xml('ModifierArguments', 'ModifierId=COMMANDO_BONUS_MOVEMENT&Name=Amount', 'Value'),
  },
  AMPHIBIOUS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_AMPHIBIOUS', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_AMPHIBIOUS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_AMPHIBIOUS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_AMPHIBIOUS&PrereqUnitPromotion=PROMOTION_TORTOISE', 'PrereqUnitPromotion', { expect: 'PROMOTION_TORTOISE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_AMPHIBIOUS&PrereqUnitPromotion=PROMOTION_COMMANDO', 'PrereqUnitPromotion', { expect: 'PROMOTION_COMMANDO' })] },
  },
  ZWEIHANDER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ZWEIHANDER', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ZWEIHANDER', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_ZWEIHANDER, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ZWEIHANDER&PrereqUnitPromotion=PROMOTION_COMMANDO', 'PrereqUnitPromotion', { expect: 'PROMOTION_COMMANDO' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ZWEIHANDER&PrereqUnitPromotion=PROMOTION_AMPHIBIOUS', 'PrereqUnitPromotion', { expect: 'PROMOTION_AMPHIBIOUS' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ZWEIHANDER_BONUS_VS_ANTI_CAVALRY&Name=Amount', 'Value'),
  },
  URBAN_WARFARE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_URBAN_WARFARE', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_URBAN_WARFARE', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_URBAN_WARFARE, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_URBAN_WARFARE&PrereqUnitPromotion=PROMOTION_COMMANDO', 'PrereqUnitPromotion', { expect: 'PROMOTION_COMMANDO' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_URBAN_WARFARE&PrereqUnitPromotion=PROMOTION_AMPHIBIOUS', 'PrereqUnitPromotion', { expect: 'PROMOTION_AMPHIBIOUS' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=URBAN_WARFARE_BONUS&Name=Amount', 'Value'),
  },
  ELITE_GUARD: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ELITE_GUARD', 'PromotionClass', { expect: 'PROMOTION_CLASS_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ELITE_GUARD', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_ELITE_GUARD, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ELITE_GUARD&PrereqUnitPromotion=PROMOTION_ZWEIHANDER', 'PrereqUnitPromotion', { expect: 'PROMOTION_ZWEIHANDER' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ELITE_GUARD&PrereqUnitPromotion=PROMOTION_URBAN_WARFARE', 'PrereqUnitPromotion', { expect: 'PROMOTION_URBAN_WARFARE' })] },
    'effects.1.v': xml('ModifierArguments', 'ModifierId=ELITE_GUARD_ADDITIONAL_ATTACK&Name=Amount', 'Value'),
  },
  VOLLEY: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_VOLLEY', 'PromotionClass', { expect: 'PROMOTION_CLASS_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_VOLLEY', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_VOLLEY' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=VOLLEY_BONUS_VS_LAND_UNITS&Name=Amount', 'Value'),
  },
  GARRISON: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GARRISON', 'PromotionClass', { expect: 'PROMOTION_CLASS_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GARRISON', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_GARRISON' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=GARRISON_BONUS_DISTRICTS&Name=Amount', 'Value'),
  },
  ARROW_STORM: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ARROW_STORM', 'PromotionClass', { expect: 'PROMOTION_CLASS_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ARROW_STORM', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ARROW_STORM&PrereqUnitPromotion=PROMOTION_VOLLEY', 'PrereqUnitPromotion', { expect: 'PROMOTION_VOLLEY' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ARROW_STORM_BONUS_VS_LAND_AND_SEA_UNITS&Name=Amount', 'Value'),
  },
  INCENDIARIES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_INCENDIARIES', 'PromotionClass', { expect: 'PROMOTION_CLASS_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_INCENDIARIES', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_INCENDIARIES&PrereqUnitPromotion=PROMOTION_GARRISON', 'PrereqUnitPromotion', { expect: 'PROMOTION_GARRISON' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=INCENDIARIES_BONUS_VS_DISTRICT_DEFENSES&Name=Amount', 'Value'),
  },
  SUPPRESSION: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPPRESSION', 'PromotionClass', { expect: 'PROMOTION_CLASS_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPPRESSION', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_SUPPRESSION, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPPRESSION&PrereqUnitPromotion=PROMOTION_ARROW_STORM', 'PrereqUnitPromotion', { expect: 'PROMOTION_ARROW_STORM' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPPRESSION&PrereqUnitPromotion=PROMOTION_INCENDIARIES', 'PrereqUnitPromotion', { expect: 'PROMOTION_INCENDIARIES' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SUPPRESSION_BONUS_EXERT_ZOC&Name=Exert', 'Value', { expect: true, note: 'a flag, not a magnitude — the catalog carries 1' }),
  },
  EMPLACEMENT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EMPLACEMENT', 'PromotionClass', { expect: 'PROMOTION_CLASS_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EMPLACEMENT', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_EMPLACEMENT, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_EMPLACEMENT&PrereqUnitPromotion=PROMOTION_ARROW_STORM', 'PrereqUnitPromotion', { expect: 'PROMOTION_ARROW_STORM' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_EMPLACEMENT&PrereqUnitPromotion=PROMOTION_INCENDIARIES', 'PrereqUnitPromotion', { expect: 'PROMOTION_INCENDIARIES' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=EMPLACEMENT_DEFENSE_BONUS_VS_CITIES&Name=Amount', 'Value'),
  },
  EXPERT_MARKSMAN: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EXPERT_MARKSMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EXPERT_MARKSMAN', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_EXPERT_MARKSMAN, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_EXPERT_MARKSMAN&PrereqUnitPromotion=PROMOTION_SUPPRESSION', 'PrereqUnitPromotion', { expect: 'PROMOTION_SUPPRESSION' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_EXPERT_MARKSMAN&PrereqUnitPromotion=PROMOTION_EMPLACEMENT', 'PrereqUnitPromotion', { expect: 'PROMOTION_EMPLACEMENT' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=EXPERT_MARKSMAN_ADDITIONAL_ATTACK&Name=Amount', 'Value'),
  },
  ECHELON: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ECHELON', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ECHELON', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_ECHELON' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ECHELON_ADDITIONAL_CAVALRY_BONUS&Name=Amount', 'Value'),
  },
  THRUST: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_THRUST', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_THRUST', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_THRUST' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=THRUST_BONUS_VS_MELEE&Name=Amount', 'Value'),
  },
  SQUARE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SQUARE', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SQUARE', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SQUARE&PrereqUnitPromotion=PROMOTION_ECHELON', 'PrereqUnitPromotion', { expect: 'PROMOTION_ECHELON' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SQUARE_BONUS_SUPPORT_BONUS_MODIFIER&Name=Percent', 'Value', { expect: 100, note: 'the install gives a PERCENT; the catalog holds the multiplier it makes' }),
  },
  SCHILTRON: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SCHILTRON', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SCHILTRON', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SCHILTRON&PrereqUnitPromotion=PROMOTION_THRUST', 'PrereqUnitPromotion', { expect: 'PROMOTION_THRUST' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SCHILTRON_DEFENSE_BONUS_VS_MELEE&Name=Amount', 'Value'),
  },
  REDEPLOY: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REDEPLOY', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REDEPLOY', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_REDEPLOY, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_REDEPLOY&PrereqUnitPromotion=PROMOTION_SQUARE', 'PrereqUnitPromotion', { expect: 'PROMOTION_SQUARE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_REDEPLOY&PrereqUnitPromotion=PROMOTION_SCHILTRON', 'PrereqUnitPromotion', { expect: 'PROMOTION_SCHILTRON' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=REDEPLOY_BONUS_MOVEMENT&Name=Amount', 'Value'),
  },
  CHOKE_POINTS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CHOKE_POINTS', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CHOKE_POINTS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_CHOKE_POINTS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CHOKE_POINTS&PrereqUnitPromotion=PROMOTION_SQUARE', 'PrereqUnitPromotion', { expect: 'PROMOTION_SQUARE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CHOKE_POINTS&PrereqUnitPromotion=PROMOTION_SCHILTRON', 'PrereqUnitPromotion', { expect: 'PROMOTION_SCHILTRON' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=CHOKE_POINTS_BONUS&Name=Amount', 'Value'),
  },
  HOLD_THE_LINE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HOLD_THE_LINE', 'PromotionClass', { expect: 'PROMOTION_CLASS_ANTI_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HOLD_THE_LINE', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_HOLD_THE_LINE, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_HOLD_THE_LINE&PrereqUnitPromotion=PROMOTION_REDEPLOY', 'PrereqUnitPromotion', { expect: 'PROMOTION_REDEPLOY' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_HOLD_THE_LINE&PrereqUnitPromotion=PROMOTION_CHOKE_POINTS', 'PrereqUnitPromotion', { expect: 'PROMOTION_CHOKE_POINTS' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=HOLD_THE_LINE_COMBAT_BONUS&Name=Amount', 'Value'),
  },
  CAPARISON: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CAPARISON', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CAPARISON', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_CAPARISON' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=CAPARISON_BONUS_VS_ANTI_CAVALRY&Name=Amount', 'Value'),
  },
  COURSERS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COURSERS', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COURSERS', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_COURSERS' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=COURSERS_BONUS_VS_RANGED_SIEGE&Name=Amount', 'Value'),
  },
  DEPREDATION: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DEPREDATION', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DEPREDATION', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_DEPREDATION&PrereqUnitPromotion=PROMOTION_CAPARISON', 'PrereqUnitPromotion', { expect: 'PROMOTION_CAPARISON' }),
    'effects.0.v': xml('GlobalParameters', 'Name=PILLAGE_ADVANCED_MOVEMENT_COST', 'Value'),
  },
  DOUBLE_ENVELOPMENT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DOUBLE_ENVELOPMENT', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DOUBLE_ENVELOPMENT', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_DOUBLE_ENVELOPMENT&PrereqUnitPromotion=PROMOTION_COURSERS', 'PrereqUnitPromotion', { expect: 'PROMOTION_COURSERS' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=DOUBLE_ENVELOPMENT_BONUS_FLANKING_BONUS_MODIFIER&Name=Percent', 'Value', { expect: 100, note: 'the install gives a PERCENT; the catalog holds the multiplier it makes' }),
  },
  SPIKING_THE_GUNS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPIKING_THE_GUNS', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPIKING_THE_GUNS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_SPIKING_THE_GUNS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SPIKING_THE_GUNS&PrereqUnitPromotion=PROMOTION_DEPREDATION', 'PrereqUnitPromotion', { expect: 'PROMOTION_DEPREDATION' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SPIKING_THE_GUNS&PrereqUnitPromotion=PROMOTION_DOUBLE_ENVELOPMENT', 'PrereqUnitPromotion', { expect: 'PROMOTION_DOUBLE_ENVELOPMENT' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPIKING_THE_GUNS_BONUS_VS_SIEGE&Name=Amount', 'Value'),
  },
  PURSUIT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PURSUIT', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PURSUIT', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_PURSUIT, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_PURSUIT&PrereqUnitPromotion=PROMOTION_DEPREDATION', 'PrereqUnitPromotion', { expect: 'PROMOTION_DEPREDATION' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_PURSUIT&PrereqUnitPromotion=PROMOTION_DOUBLE_ENVELOPMENT', 'PrereqUnitPromotion', { expect: 'PROMOTION_DOUBLE_ENVELOPMENT' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=PURSUIT_BONUS_MOVEMENT&Name=Amount', 'Value'),
  },
  ESCORT_MOBILITY: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ESCORT_MOBILITY', 'PromotionClass', { expect: 'PROMOTION_CLASS_LIGHT_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ESCORT_MOBILITY', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_ESCORT_MOBILITY, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ESCORT_MOBILITY&PrereqUnitPromotion=PROMOTION_SPIKING_THE_GUNS', 'PrereqUnitPromotion', { expect: 'PROMOTION_SPIKING_THE_GUNS' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ESCORT_MOBILITY&PrereqUnitPromotion=PROMOTION_PURSUIT', 'PrereqUnitPromotion', { expect: 'PROMOTION_PURSUIT' })] },
  },
  CHARGE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CHARGE', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CHARGE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_CHARGE' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=CHARGE_BONUS_VS_FORTIFIED&Name=Amount', 'Value'),
  },
  BARDING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BARDING', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BARDING', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_BARDING' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=TOP_COVER_DEFENSE_BONUS_VS_RANGED&Name=Amount', 'Value'),
  },
  MARAUDING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MARAUDING', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MARAUDING', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_MARAUDING, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MARAUDING&PrereqUnitPromotion=PROMOTION_CHARGE', 'PrereqUnitPromotion', { expect: 'PROMOTION_CHARGE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MARAUDING&PrereqUnitPromotion=PROMOTION_ROUT', 'PrereqUnitPromotion', { expect: 'PROMOTION_ROUT' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=URBAN_RAIDER_BONUS&Name=Amount', 'Value'),
  },
  ROUT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ROUT', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ROUT', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_ROUT, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ROUT&PrereqUnitPromotion=PROMOTION_BARDING', 'PrereqUnitPromotion', { expect: 'PROMOTION_BARDING' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ROUT&PrereqUnitPromotion=PROMOTION_MARAUDING', 'PrereqUnitPromotion', { expect: 'PROMOTION_MARAUDING' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=VULTURE_BONUS_VS_DAMAGED&Name=Amount', 'Value'),
  },
  ARMOR_PIERCING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ARMOR_PIERCING', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ARMOR_PIERCING', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_ARMOR_PIERCING, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ARMOR_PIERCING&PrereqUnitPromotion=PROMOTION_MARAUDING', 'PrereqUnitPromotion', { expect: 'PROMOTION_MARAUDING' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ARMOR_PIERCING&PrereqUnitPromotion=PROMOTION_ROUT', 'PrereqUnitPromotion', { expect: 'PROMOTION_ROUT' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ARMOR_PIERCING_BONUS_VS_HEAVY_CAVALRY&Name=Amount', 'Value'),
  },
  REACTIVE_ARMOR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REACTIVE_ARMOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REACTIVE_ARMOR', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_REACTIVE_ARMOR&PrereqUnitPromotion=PROMOTION_ROUT', 'PrereqUnitPromotion', { expect: 'PROMOTION_ROUT' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=REACTIVE_ARMOR_BONUS&Name=Amount', 'Value'),
  },
  BREAKTHROUGH: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BREAKTHROUGH', 'PromotionClass', { expect: 'PROMOTION_CLASS_HEAVY_CAVALRY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BREAKTHROUGH', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_BREAKTHROUGH, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_BREAKTHROUGH&PrereqUnitPromotion=PROMOTION_ARMOR_PIERCING', 'PrereqUnitPromotion', { expect: 'PROMOTION_ARMOR_PIERCING' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_BREAKTHROUGH&PrereqUnitPromotion=PROMOTION_REACTIVE_ARMOR', 'PrereqUnitPromotion', { expect: 'PROMOTION_REACTIVE_ARMOR' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=BREAKTHROUGH_ADDITIONAL_ATTACK&Name=Amount', 'Value'),
  },
  GRAPE_SHOT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GRAPE_SHOT', 'PromotionClass', { expect: 'PROMOTION_CLASS_SIEGE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GRAPE_SHOT', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_GRAPE_SHOT' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=GRAPE_SHOT_BONUS_VS_UNITS&Name=Amount', 'Value'),
  },
  CREW_WEAPONS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CREW_WEAPONS', 'PromotionClass', { expect: 'PROMOTION_CLASS_SIEGE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CREW_WEAPONS', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_CREW_WEAPONS' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=CREW_WEAPONS_DEFENSE_BONUS&Name=Amount', 'Value'),
  },
  SHRAPNEL: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SHRAPNEL', 'PromotionClass', { expect: 'PROMOTION_CLASS_SIEGE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SHRAPNEL', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SHRAPNEL&PrereqUnitPromotion=PROMOTION_GRAPE_SHOT', 'PrereqUnitPromotion', { expect: 'PROMOTION_GRAPE_SHOT' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SHRAPNEL_BONUS_VS_UNITS&Name=Amount', 'Value'),
  },
  SHELLS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SHELLS', 'PromotionClass', { expect: 'PROMOTION_CLASS_SIEGE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SHELLS', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SHELLS&PrereqUnitPromotion=PROMOTION_CREW_WEAPONS', 'PrereqUnitPromotion', { expect: 'PROMOTION_CREW_WEAPONS' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SHELLS_BONUS_VS_DISTRICTS&Name=Amount', 'Value'),
  },
  ADVANCED_RANGEFINDING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ADVANCED_RANGEFINDING', 'PromotionClass', { expect: 'PROMOTION_CLASS_SIEGE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ADVANCED_RANGEFINDING', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_ADVANCED_RANGEFINDING, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ADVANCED_RANGEFINDING&PrereqUnitPromotion=PROMOTION_SHRAPNEL', 'PrereqUnitPromotion', { expect: 'PROMOTION_SHRAPNEL' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ADVANCED_RANGEFINDING&PrereqUnitPromotion=PROMOTION_SHELLS', 'PrereqUnitPromotion', { expect: 'PROMOTION_SHELLS' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ADVANCED_RANGEFINDING_BONUS_VS_NAVAL&Name=Amount', 'Value'),
  },
  EXPERT_CREW: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EXPERT_CREW', 'PromotionClass', { expect: 'PROMOTION_CLASS_SIEGE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EXPERT_CREW', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_EXPERT_CREW, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_EXPERT_CREW&PrereqUnitPromotion=PROMOTION_SHRAPNEL', 'PrereqUnitPromotion', { expect: 'PROMOTION_SHRAPNEL' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_EXPERT_CREW&PrereqUnitPromotion=PROMOTION_SHELLS', 'PrereqUnitPromotion', { expect: 'PROMOTION_SHELLS' })] },
  },
  FORWARD_OBSERVERS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_FORWARD_OBSERVERS', 'PromotionClass', { expect: 'PROMOTION_CLASS_SIEGE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_FORWARD_OBSERVERS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_FORWARD_OBSERVERS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_FORWARD_OBSERVERS&PrereqUnitPromotion=PROMOTION_ADVANCED_RANGEFINDING', 'PrereqUnitPromotion', { expect: 'PROMOTION_ADVANCED_RANGEFINDING' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_FORWARD_OBSERVERS&PrereqUnitPromotion=PROMOTION_EXPERT_CREW', 'PrereqUnitPromotion', { expect: 'PROMOTION_EXPERT_CREW' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=FORWARD_OBSERVERS_BONUS_RANGE&Name=Amount', 'Value'),
  },
  HELMSMAN: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HELMSMAN', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HELMSMAN', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_HELMSMAN' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=HELMSMAN_BONUS_WATER_MOVEMENT&Name=Amount', 'Value'),
  },
  EMBOLON: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EMBOLON', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EMBOLON', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_EMBOLON' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=EMBOLON_BONUS_VS_NAVAL&Name=Amount', 'Value'),
  },
  RUTTER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_RUTTER', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_RUTTER', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_RUTTER&PrereqUnitPromotion=PROMOTION_HELMSMAN', 'PrereqUnitPromotion', { expect: 'PROMOTION_HELMSMAN' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=RUTTER_SIGHT_BONUS&Name=Amount', 'Value'),
  },
  REINFORCED_HULL: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REINFORCED_HULL', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REINFORCED_HULL', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_REINFORCED_HULL&PrereqUnitPromotion=PROMOTION_EMBOLON', 'PrereqUnitPromotion', { expect: 'PROMOTION_EMBOLON' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=REINFORCED_HULL_BONUS_VS_RANGED&Name=Amount', 'Value'),
  },
  CONVOY: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CONVOY', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CONVOY', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_CONVOY, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CONVOY&PrereqUnitPromotion=PROMOTION_RUTTER', 'PrereqUnitPromotion', { expect: 'PROMOTION_RUTTER' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CONVOY&PrereqUnitPromotion=PROMOTION_REINFORCED_HULL', 'PrereqUnitPromotion', { expect: 'PROMOTION_REINFORCED_HULL' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=CONVOY_BONUS_IN_FORMATION&Name=Amount', 'Value'),
  },
  AUXILIARY_SHIPS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_AUXILIARY_SHIPS', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_AUXILIARY_SHIPS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_AUXILIARY_SHIPS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_AUXILIARY_SHIPS&PrereqUnitPromotion=PROMOTION_RUTTER', 'PrereqUnitPromotion', { expect: 'PROMOTION_RUTTER' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_AUXILIARY_SHIPS&PrereqUnitPromotion=PROMOTION_REINFORCED_HULL', 'PrereqUnitPromotion', { expect: 'PROMOTION_REINFORCED_HULL' })] },
  },
  CREEPING_ATTACK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CREEPING_ATTACK', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_MELEE' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CREEPING_ATTACK', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_CREEPING_ATTACK, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CREEPING_ATTACK&PrereqUnitPromotion=PROMOTION_CONVOY', 'PrereqUnitPromotion', { expect: 'PROMOTION_CONVOY' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CREEPING_ATTACK&PrereqUnitPromotion=PROMOTION_AUXILIARY_SHIPS', 'PrereqUnitPromotion', { expect: 'PROMOTION_AUXILIARY_SHIPS' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=CREEPING_ATTACK_BONUS_VS_RAIDERS&Name=Amount', 'Value'),
  },
  LINE_OF_BATTLE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_LINE_OF_BATTLE', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_LINE_OF_BATTLE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_LINE_OF_BATTLE' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=LINE_OF_BATTLE_BONUS_VS_NAVAL&Name=Amount', 'Value'),
  },
  BOMBARDMENT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BOMBARDMENT', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BOMBARDMENT', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_BOMBARDMENT' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=BOMBARDMENT_BONUS_VS_DISTRICT_DEFENSES&Name=Amount', 'Value'),
  },
  PREPARATORY_FIRE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PREPARATORY_FIRE', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PREPARATORY_FIRE', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_PREPARATORY_FIRE&PrereqUnitPromotion=PROMOTION_LINE_OF_BATTLE', 'PrereqUnitPromotion', { expect: 'PROMOTION_LINE_OF_BATTLE' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=PREPARATORY_FIRE_BONUS_VS_LAND&Name=Amount', 'Value'),
  },
  ROLLING_BARRAGE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ROLLING_BARRAGE', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ROLLING_BARRAGE', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ROLLING_BARRAGE&PrereqUnitPromotion=PROMOTION_BOMBARDMENT', 'PrereqUnitPromotion', { expect: 'PROMOTION_BOMBARDMENT' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROLLING_BARRAGE_BONUS_VS_DISTRICT_DEFENSES&Name=Amount', 'Value'),
  },
  SUPPLY_FLEET: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPPLY_FLEET', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPPLY_FLEET', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_SUPPLY_FLEET, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPPLY_FLEET&PrereqUnitPromotion=PROMOTION_PREPARATORY_FIRE', 'PrereqUnitPromotion', { expect: 'PROMOTION_PREPARATORY_FIRE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPPLY_FLEET&PrereqUnitPromotion=PROMOTION_ROLLING_BARRAGE', 'PrereqUnitPromotion', { expect: 'PROMOTION_ROLLING_BARRAGE' })] },
  },
  PROXIMITY_FUSES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PROXIMITY_FUSES', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PROXIMITY_FUSES', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_PROXIMITY_FUSES, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_PROXIMITY_FUSES&PrereqUnitPromotion=PROMOTION_PREPARATORY_FIRE', 'PrereqUnitPromotion', { expect: 'PROMOTION_PREPARATORY_FIRE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_PROXIMITY_FUSES&PrereqUnitPromotion=PROMOTION_ROLLING_BARRAGE', 'PrereqUnitPromotion', { expect: 'PROMOTION_ROLLING_BARRAGE' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=PROMOTION_PROXIMITY_FUSES_DEFENSE_BONUS_VS_AIR&Name=Amount', 'Value'),
  },
  COINCIDENCE_RANGEFINDING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COINCIDENCE_RANGEFINDING', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RANGED' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COINCIDENCE_RANGEFINDING', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_COINCIDENCE_RANGEFINDING, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_COINCIDENCE_RANGEFINDING&PrereqUnitPromotion=PROMOTION_SUPPLY_FLEET', 'PrereqUnitPromotion', { expect: 'PROMOTION_SUPPLY_FLEET' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_COINCIDENCE_RANGEFINDING&PrereqUnitPromotion=PROMOTION_PROXIMITY_FUSES', 'PrereqUnitPromotion', { expect: 'PROMOTION_PROXIMITY_FUSES' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=COINCIDENCE_RANGEFINDING_BONUS_RANGE&Name=Amount', 'Value'),
  },
  CHAPLAIN: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CHAPLAIN', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_CHAPLAIN' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=APOSTLE_CHAPLAIN&Name=Amount', 'Value'),
  },
  DEBATER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DEBATER', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_DEBATER' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=APOSTLE_DEBATER&Name=Amount', 'Value'),
  },
  HEATHEN_CONVERSION: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HEATHEN_CONVERSION', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_HEATHEN_CONVERSION' },
  },
  INDULGENCE_VENDOR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_INDULGENCE_VENDOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_INDULGENCE_VENDOR' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=APOSTLE_INITIATION_GOLD&Name=Amount', 'Value'),
  },
  MARTYR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MARTYR', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_MARTYR' },
  },
  ORATOR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ORATOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_ORATOR' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=APOSTLE_EXTRA_SPREAD_CHARGES&Name=Amount', 'Value'),
  },
  PILGRIM: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PILGRIM', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_PILGRIM' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=APOSTLE_NW_DEFERRED_CHARGES&Name=Amount', 'Value'),
  },
  PROSELYTIZER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_PROSELYTIZER', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_PROSELYTIZER' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=APOSTLE_EVICT_ALL&Name=Amount', 'Value'),
  },
  TRANSLATOR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TRANSLATOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_APOSTLE' }),
    tier: { stylized: 'the Apostle\'s nine are a LIST, not a tree — it takes one promotion at purchase and never levels, so the catalog files them at tier 0 (the install writes Level 1)' },
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_TRANSLATOR' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=APOSTLE_FOREIGN_SPREAD&Name=Amount', 'Value', { expect: 200, note: 'the install gives a PERCENT; the catalog holds the multiplier it makes' }),
  },
  SHADOW_STRIKE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_SHADOW_STRIKE', 'PromotionClass', { expect: 'PROMOTION_CLASS_MONK' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_SHADOW_STRIKE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_MONK_SHADOW_STRIKE' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=DOUBLE_ENVELOPMENT_BONUS_FLANKING_BONUS_MODIFIER&Name=Percent', 'Value', { expect: 100, note: 'the install gives a PERCENT; the catalog holds the multiplier it makes' }),
  },
  TWILIGHT_VEIL: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_TWILIGHT_VEIL', 'PromotionClass', { expect: 'PROMOTION_CLASS_MONK' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_TWILIGHT_VEIL', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_MONK_TWILIGHT_VEIL' },
  },
  EXPLODING_PALMS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_EXPLODING_PALMS', 'PromotionClass', { expect: 'PROMOTION_CLASS_MONK' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_EXPLODING_PALMS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_MONK_EXPLODING_PALMS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_EXPLODING_PALMS&PrereqUnitPromotion=PROMOTION_MONK_SHADOW_STRIKE', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_SHADOW_STRIKE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_EXPLODING_PALMS&PrereqUnitPromotion=PROMOTION_MONK_TWILIGHT_VEIL', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_TWILIGHT_VEIL' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=EXPLODING_PALMS_INCREASED_COMBAT_STRENGTH&Name=Amount', 'Value'),
  },
  DISCIPLES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_DISCIPLES', 'PromotionClass', { expect: 'PROMOTION_CLASS_MONK' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_DISCIPLES', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_MONK_DISCIPLES, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_DISCIPLES&PrereqUnitPromotion=PROMOTION_MONK_SHADOW_STRIKE', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_SHADOW_STRIKE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_DISCIPLES&PrereqUnitPromotion=PROMOTION_MONK_TWILIGHT_VEIL', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_TWILIGHT_VEIL' })] },
  },
  SWEEPING_WIND: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_SWEEPING_WIND', 'PromotionClass', { expect: 'PROMOTION_CLASS_MONK' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_SWEEPING_WIND', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_MONK_SWEEPING_WIND, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_SWEEPING_WIND&PrereqUnitPromotion=PROMOTION_MONK_EXPLODING_PALMS', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_EXPLODING_PALMS' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_SWEEPING_WIND&PrereqUnitPromotion=PROMOTION_MONK_DISCIPLES', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_DISCIPLES' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SWEEPING_WIND_ADDITIONAL_ATTACK&Name=Amount', 'Value'),
  },
  DANCING_CRANE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_DANCING_CRANE', 'PromotionClass', { expect: 'PROMOTION_CLASS_MONK' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_DANCING_CRANE', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_MONK_DANCING_CRANE, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_DANCING_CRANE&PrereqUnitPromotion=PROMOTION_MONK_EXPLODING_PALMS', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_EXPLODING_PALMS' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_DANCING_CRANE&PrereqUnitPromotion=PROMOTION_MONK_DISCIPLES', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_DISCIPLES' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=DANCING_CRANE_BONUS_MOVEMENT&Name=Amount', 'Value'),
  },
  COBRA_STRIKE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_COBRA_STRIKE', 'PromotionClass', { expect: 'PROMOTION_CLASS_MONK' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MONK_COBRA_STRIKE', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_MONK_COBRA_STRIKE, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_COBRA_STRIKE&PrereqUnitPromotion=PROMOTION_MONK_SWEEPING_WIND', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_SWEEPING_WIND' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_MONK_COBRA_STRIKE&PrereqUnitPromotion=PROMOTION_MONK_DANCING_CRANE', 'PrereqUnitPromotion', { expect: 'PROMOTION_MONK_DANCING_CRANE' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=COBRA_STRIKE_INCREASED_COMBAT_STRENGTH&Name=Amount', 'Value'),
  },
  DOGFIGHTING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DOGFIGHTING', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DOGFIGHTING', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_DOGFIGHTING' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=DOGFIGHTING_BONUS_VS_FIGHTERS&Name=Amount', 'Value'),
  },
  COCKPIT_ARMOR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COCKPIT_ARMOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_COCKPIT_ARMOR', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_COCKPIT_ARMOR' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=COCKPIT_ARMOR_BONUS_VS_ANTIAIR&Name=Amount', 'Value'),
  },
  INTERCEPTOR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_INTERCEPTOR', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_INTERCEPTOR', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_INTERCEPTOR&PrereqUnitPromotion=PROMOTION_DOGFIGHTING', 'PrereqUnitPromotion', { expect: 'PROMOTION_DOGFIGHTING' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=INTERCEPTOR_BONUS_VS_BOMBERS&Name=Amount', 'Value'),
  },
  STRAFE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_STRAFE', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_STRAFE', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_STRAFE&PrereqUnitPromotion=PROMOTION_COCKPIT_ARMOR', 'PrereqUnitPromotion', { expect: 'PROMOTION_COCKPIT_ARMOR' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=STRAFE_BONUS_VS_NONCAVALRY&Name=Amount', 'Value'),
  },
  GROUND_CREWS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GROUND_CREWS', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GROUND_CREWS', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_GROUND_CREWS&PrereqUnitPromotion=PROMOTION_INTERCEPTOR', 'PrereqUnitPromotion', { expect: 'PROMOTION_INTERCEPTOR' }),
  },
  TANK_BUSTER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TANK_BUSTER', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TANK_BUSTER', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_TANK_BUSTER&PrereqUnitPromotion=PROMOTION_STRAFE', 'PrereqUnitPromotion', { expect: 'PROMOTION_STRAFE' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=TANK_BUSTER_BONUS_VS_CAVALRY&Name=Amount', 'Value'),
  },
  DROP_TANKS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DROP_TANKS', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_FIGHTER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DROP_TANKS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_DROP_TANKS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_DROP_TANKS&PrereqUnitPromotion=PROMOTION_GROUND_CREWS', 'PrereqUnitPromotion', { expect: 'PROMOTION_GROUND_CREWS' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_DROP_TANKS&PrereqUnitPromotion=PROMOTION_TANK_BUSTER', 'PrereqUnitPromotion', { expect: 'PROMOTION_TANK_BUSTER' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=LONG_RANGE_ESCORT_BONUS_RANGE&Name=Amount', 'Value'),
  },
  BOX_FORMATION: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BOX_FORMATION', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BOX_FORMATION', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_BOX_FORMATION' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=BOX_FORMATION_DEFENSE_BONUS_VS_FIGHTERS&Name=Amount', 'Value'),
  },
  EVASIVE_MANEUVERS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EVASIVE_MANEUVERS', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_EVASIVE_MANEUVERS', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_EVASIVE_MANEUVERS' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=EVASIVE_MANEUVERS_BONUS_VS_ANTIAIR&Name=Amount', 'Value'),
  },
  CLOSE_AIR_SUPPORT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CLOSE_AIR_SUPPORT', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_CLOSE_AIR_SUPPORT', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_CLOSE_AIR_SUPPORT, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CLOSE_AIR_SUPPORT&PrereqUnitPromotion=PROMOTION_BOX_FORMATION', 'PrereqUnitPromotion', { expect: 'PROMOTION_BOX_FORMATION' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_CLOSE_AIR_SUPPORT&PrereqUnitPromotion=PROMOTION_EVASIVE_MANEUVERS', 'PrereqUnitPromotion', { expect: 'PROMOTION_EVASIVE_MANEUVERS' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=CLOSE_AIR_SUPPORT_BONUS_VS_LAND&Name=Amount', 'Value'),
  },
  TORPEDO_BOMBER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TORPEDO_BOMBER', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TORPEDO_BOMBER', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_TORPEDO_BOMBER, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_TORPEDO_BOMBER&PrereqUnitPromotion=PROMOTION_BOX_FORMATION', 'PrereqUnitPromotion', { expect: 'PROMOTION_BOX_FORMATION' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_TORPEDO_BOMBER&PrereqUnitPromotion=PROMOTION_EVASIVE_MANEUVERS', 'PrereqUnitPromotion', { expect: 'PROMOTION_EVASIVE_MANEUVERS' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=TORPEDO_BOMBER_BONUS_VS_NAVAL&Name=Amount', 'Value'),
  },
  LONG_RANGE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_LONG_RANGE', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_LONG_RANGE', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_LONG_RANGE&PrereqUnitPromotion=PROMOTION_CLOSE_AIR_SUPPORT', 'PrereqUnitPromotion', { expect: 'PROMOTION_CLOSE_AIR_SUPPORT' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=LONG_RANGE_BONUS_RANGE&Name=Amount', 'Value'),
  },
  TACTICAL_MAINTENANCE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TACTICAL_MAINTENANCE', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_TACTICAL_MAINTENANCE', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_TACTICAL_MAINTENANCE&PrereqUnitPromotion=PROMOTION_TORPEDO_BOMBER', 'PrereqUnitPromotion', { expect: 'PROMOTION_TORPEDO_BOMBER' }),
  },
  SUPERFORTRESS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPERFORTRESS', 'PromotionClass', { expect: 'PROMOTION_CLASS_AIR_BOMBER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPERFORTRESS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_SUPERFORTRESS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPERFORTRESS&PrereqUnitPromotion=PROMOTION_LONG_RANGE', 'PrereqUnitPromotion', { expect: 'PROMOTION_LONG_RANGE' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPERFORTRESS&PrereqUnitPromotion=PROMOTION_TACTICAL_MAINTENANCE', 'PrereqUnitPromotion', { expect: 'PROMOTION_TACTICAL_MAINTENANCE' })] },
  },
  BOARDING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BOARDING', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_BOARDING', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_BOARDING' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=BOARDING_GOLD_FROM_NAVAL_VICTORY&Name=PercentDefeatedStrength', 'Value'),
  },
  LOOT: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_LOOT', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_LOOT', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_LOOT' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=LOOT_GOLD_FROM_COASTAL_RAID&Name=Bonus', 'Value'),
  },
  HOMING_TORPEDOES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HOMING_TORPEDOES', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HOMING_TORPEDOES', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_HOMING_TORPEDOES&PrereqUnitPromotion=PROMOTION_BOARDING', 'PrereqUnitPromotion', { expect: 'PROMOTION_BOARDING' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=HOMING_TORPEDOES_BONUS_VS_NAVAL&Name=Amount', 'Value'),
  },
  SWIFT_KEEL: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SWIFT_KEEL', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SWIFT_KEEL', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SWIFT_KEEL&PrereqUnitPromotion=PROMOTION_LOOT', 'PrereqUnitPromotion', { expect: 'PROMOTION_LOOT' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SWIFT_KEEL_BONUS_MOVEMENT&Name=Amount', 'Value'),
  },
  OBSERVATION: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_OBSERVATION', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_OBSERVATION', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_OBSERVATION&PrereqUnitPromotion=PROMOTION_SWIFT_KEEL', 'PrereqUnitPromotion', { expect: 'PROMOTION_SWIFT_KEEL' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=OBSERVATION_INCREASED_SIGHT_RANGE&Name=Amount', 'Value'),
  },
  SILENT_RUNNING: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SILENT_RUNNING', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SILENT_RUNNING', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SILENT_RUNNING&PrereqUnitPromotion=PROMOTION_HOMING_TORPEDOES', 'PrereqUnitPromotion', { expect: 'PROMOTION_HOMING_TORPEDOES' }),
  },
  WOLFPACK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_WOLFPACK', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_RAIDER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_WOLFPACK', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_WOLFPACK, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_WOLFPACK&PrereqUnitPromotion=PROMOTION_OBSERVATION', 'PrereqUnitPromotion', { expect: 'PROMOTION_OBSERVATION' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_WOLFPACK&PrereqUnitPromotion=PROMOTION_SILENT_RUNNING', 'PrereqUnitPromotion', { expect: 'PROMOTION_SILENT_RUNNING' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=WOLFPACK_ADDITIONAL_ATTACK&Name=Amount', 'Value'),
  },
  FLIGHT_DECK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_FLIGHT_DECK', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_CARRIER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_FLIGHT_DECK', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_FLIGHT_DECK' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=FLIGHT_DECK_BONUS_AIRCRAFT_SLOT&Name=Amount', 'Value'),
  },
  SCOUT_PLANES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SCOUT_PLANES', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_CARRIER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SCOUT_PLANES', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SCOUT_PLANES' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SCOUT_PLANES_BONUS_SIGHT&Name=Amount', 'Value'),
  },
  HANGAR_DECK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HANGAR_DECK', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_CARRIER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_HANGAR_DECK', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_HANGAR_DECK&PrereqUnitPromotion=PROMOTION_FLIGHT_DECK', 'PrereqUnitPromotion', { expect: 'PROMOTION_FLIGHT_DECK' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=HANGAR_DECK_BONUS_AIRCRAFT_SLOT&Name=Amount', 'Value'),
  },
  ADVANCED_ENGINES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ADVANCED_ENGINES', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_CARRIER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ADVANCED_ENGINES', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_ADVANCED_ENGINES, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ADVANCED_ENGINES&PrereqUnitPromotion=PROMOTION_SCOUT_PLANES', 'PrereqUnitPromotion', { expect: 'PROMOTION_SCOUT_PLANES' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_ADVANCED_ENGINES&PrereqUnitPromotion=PROMOTION_HANGAR_DECK', 'PrereqUnitPromotion', { expect: 'PROMOTION_HANGAR_DECK' })] },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ADVANCED_ENGINES_BONUS_MOVEMENT&Name=Amount', 'Value'),
  },
  FOLDING_WINGS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_FOLDING_WINGS', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_CARRIER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_FOLDING_WINGS', 'Level'),
    requires: xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_FOLDING_WINGS&PrereqUnitPromotion=PROMOTION_HANGAR_DECK', 'PrereqUnitPromotion', { expect: 'PROMOTION_HANGAR_DECK' }),
    'effects.0.v': xml('ModifierArguments', 'ModifierId=FOLDING_WINGS_BONUS_AIRCRAFT_SLOT&Name=Amount', 'Value'),
  },
  DECK_CREWS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DECK_CREWS', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_CARRIER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_DECK_CREWS', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_DECK_CREWS, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_DECK_CREWS&PrereqUnitPromotion=PROMOTION_ADVANCED_ENGINES', 'PrereqUnitPromotion', { expect: 'PROMOTION_ADVANCED_ENGINES' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_DECK_CREWS&PrereqUnitPromotion=PROMOTION_FOLDING_WINGS', 'PrereqUnitPromotion', { expect: 'PROMOTION_FOLDING_WINGS' })] },
  },
  SUPERCARRIER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPER_CARRIER', 'PromotionClass', { expect: 'PROMOTION_CLASS_NAVAL_CARRIER' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SUPER_CARRIER', 'Level'),
    requires: { derived: 'the UnitPromotionPrereqs rows of PROMOTION_SUPER_CARRIER, read as an OR-list', inputs: [xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPER_CARRIER&PrereqUnitPromotion=PROMOTION_FOLDING_WINGS', 'PrereqUnitPromotion', { expect: 'PROMOTION_FOLDING_WINGS' }), xml('UnitPromotionPrereqs', 'UnitPromotion=PROMOTION_SUPER_CARRIER&PrereqUnitPromotion=PROMOTION_DECK_CREWS', 'PrereqUnitPromotion', { expect: 'PROMOTION_DECK_CREWS' })] },
  },
  ACE_DRIVER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_ACE_DRIVER', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_ACE_DRIVER', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_ACE_DRIVER' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_ACE_DRIVER&Name=Amount', 'Value'),
  },
  CAT_BURGLAR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_CAT_BURGLAR', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_CAT_BURGLAR', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_CAT_BURGLAR' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_CAT_BURGLAR&Name=Amount', 'Value'),
  },
  CON_ARTIST: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_CON_ARTIST', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_CON_ARTIST', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_CON_ARTIST' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_CON_ARTIST&Name=Amount', 'Value'),
  },
  COVERT_ACTION: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_COVERT_ACTION', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_COVERT_ACTION', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_COVERT_ACTION' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_COVERT_ACTION&Name=Amount', 'Value'),
  },
  DEMOLITIONS: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_DEMOLITIONS', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_DEMOLITIONS', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_DEMOLITIONS' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_DEMOLITIONS&Name=Amount', 'Value'),
  },
  DISGUISE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_DISGUISE', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_DISGUISE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_DISGUISE' },
  },
  GUERRILLA_LEADER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_GUERILLA_LEADER', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_GUERILLA_LEADER', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_GUERILLA_LEADER' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_GUERILLA_LEADER&Name=Amount', 'Value'),
  },
  LICENSE_TO_KILL: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_LICENSE_TO_KILL', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_LICENSE_TO_KILL', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_LICENSE_TO_KILL' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_LICENSE_TO_KILL&Name=Amount', 'Value'),
  },
  LINGUIST: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_LINGUIST', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_LINGUIST', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_LINGUIST' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_LINGUIST_SIPHONTIME&Name=ReductionPercent', 'Value', { note: 'the install writes the same 25% once per operation' }),
  },
  POLYGRAPH: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_POLYGRAPH', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_POLYGRAPH', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_POLYGRAPH' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_POLYGRAPH&Name=Amount', 'Value'),
  },
  QUARTERMASTER: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_QUARTERMASTER', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_QUARTERMASTER', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_QUARTERMASTER' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_QUARTERMASTER&Name=Amount', 'Value'),
  },
  ROCKET_SCIENTIST: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_ROCKET_SCIENTIST', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_ROCKET_SCIENTIST', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_ROCKET_SCIENTIST' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_ROCKET_SCIENTIST&Name=Amount', 'Value'),
  },
  SATCHEL_CHARGES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SATCHEL_CHARGES', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SATCHEL_CHARGES', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_SATCHEL_CHARGES' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_SATCHEL_CHARGES&Name=Amount', 'Value'),
  },
  SEDUCTION: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SEDUCTION', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SEDUCTION', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_SEDUCTION' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_SEDUCTION_SIPHON&Name=Amount', 'Value', { note: 'the install writes the same +2 once per operation, each with Offensive false — the counterspy roll' }),
  },
  SMEAR_CAMPAIGN: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SMEAR_CAMPAIGN', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SMEAR_CAMPAIGN', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_SMEAR_CAMPAIGN' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_SMEAR_CAMPAIGN&Name=Amount', 'Value'),
  },
  SURVEILLANCE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SURVEILLANCE', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_SURVEILLANCE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_SURVEILLANCE' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_SURVEILLANCE_ADJACENT_LEVEL&Name=Amount', 'Value'),
  },
  TECHNOLOGIST: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_TECHNOLOGIST', 'PromotionClass', { expect: 'PROMOTION_CLASS_SPY' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPY_TECHNOLOGIST', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPY_TECHNOLOGIST' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=SPY_TECHNOLOGIST&Name=Amount', 'Value'),
  },
  ALBUM_COVER_ART: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ALBUM_COVER_ART', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ALBUM_COVER_ART', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_ALBUM_COVER_ART' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_ALBUM_COVER_ART&Name=Amount', 'Value'),
  },
  ARENA_ROCK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ARENA_ROCK', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ARENA_ROCK', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_ARENA_ROCK' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_ARENA_ROCK&Name=Amount', 'Value'),
  },
  GLAM_ROCK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GLAM_ROCK', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GLAM_ROCK', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_GLAM_ROCK' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_GLAM_ROCK&Name=Amount', 'Value'),
  },
  GOES_TO_11: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GOES_TO', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_GOES_TO', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_GOES_TO' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_GOES_TO&Name=Modifier', 'Value', { expect: -50, note: 'the install signs the neighbours’ share as a -50% cut' }),
  },
  INDIE: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_INDIE', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_INDIE', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_INDIE' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_INDIE&Name=Amount', 'Value', { expect: -40, note: 'the install signs the Loyalty loss negative; the catalog names the loss' }),
  },
  MUSIC_FESTIVAL: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MUSIC_FESTIVAL', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_MUSIC_FESTIVAL', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_MUSIC_FESTIVAL' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_MUSIC_FESTIVAL_TOURISM_BOMB&Name=Amount', 'Value'),
    'effects.1.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_MUSIC_FESTIVAL_LEVEL&Name=Amount', 'Value'),
  },
  POP_STAR: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_POP', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_POP', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_POP' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_POP&Name=Amount', 'Value'),
  },
  REGGAE_ROCK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REGGAE_ROCK', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_REGGAE_ROCK', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_REGGAE_ROCK' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_REGGAE_ROCK&Name=Amount', 'Value'),
  },
  RELIGIOUS_ROCK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_RELIGIOUS_ROCK', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_RELIGIOUS_ROCK', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_RELIGIOUS_ROCK' },
  },
  ROADIES: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ROADIES', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_ROADIES', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_ROADIES' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_ROADIES&Name=Amount', 'Value'),
  },
  SPACE_ROCK: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPACE_ROCK', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SPACE_ROCK', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SPACE_ROCK' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_SPACE_ROCK_TOURISM_BOMB&Name=Amount', 'Value'),
    'effects.1.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_SPACE_ROCK_LEVEL&Name=Amount', 'Value'),
  },
  SURF_BAND: {
    cls: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SURF_ROCK', 'PromotionClass', { expect: 'PROMOTION_CLASS_ROCK_BAND' }),
    tier: xml('UnitPromotions', 'UnitPromotionType=PROMOTION_SURF_ROCK', 'Level'),
    requires: { derived: 'a tier-I root: the install writes no UnitPromotionPrereqs row for PROMOTION_SURF_ROCK' },
    'effects.0.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_SURF_ROCK_TOURISM_BOMB&Name=Amount', 'Value'),
    'effects.1.v': xml('ModifierArguments', 'ModifierId=ROCKBAND_SURF_ROCK_LEVEL&Name=Amount', 'Value'),
  },
};

const P = (
  id: string, cls: PromoClass, tier: number, requires: readonly string[],
  ...effects: PromoEffect[]
): PromoDef => ({
  id, cls, tier, requires, effects,
  ...(PROMO_SRC[id] ? { src: PROMO_SRC[id] } : {}),
});

const cs = (kind: PromoKind, v: number, mask = 0): PromoEffect => ({ kind, v, mask });

/** CIV6 (nine Espionage promotions): "<mission> as if 2 levels more
 *  experienced" — one shape, one magnitude, and the mission it names. */
export const SPY_OP_PROMO_LEVELS = 2;
const op = (m: number): PromoEffect => cs('SPY_OP_LEVEL', SPY_OP_PROMO_LEVELS, 1 << m);

/** CIV6 (Disciples): the promotion "applies 250 Religious Pressure to cities
 *  within 10 hexes when it kills a non-Barbarian unit". */
export const KILL_SPREAD_PRESSURE = 250;
export const KILL_SPREAD_RANGE = 10;
const none: PromoEffect = { kind: 'NONE' };

export const PROMOTIONS: readonly PromoDef[] = [
  // ---- RECON ----------------------------------------------------------
  P('RANGER', 'RECON', 1, [], { kind: 'TERRAIN_MOVE_WOODS' }),
  P('ALPINE', 'RECON', 1, [], { kind: 'TERRAIN_MOVE_HILLS' }),
  P('SENTRY', 'RECON', 2, ['RANGER', 'ALPINE'], { kind: 'SEE_THROUGH' }),
  P('GUERRILLA', 'RECON', 2, ['RANGER', 'ALPINE'], { kind: 'MOVE_AFTER_ATTACK' }),
  P('SPYGLASS', 'RECON', 3, ['SENTRY'], cs('SIGHT', 1)),
  P('AMBUSH', 'RECON', 3, ['GUERRILLA'], cs('CS_ALL', 20)),
  P('CAMOUFLAGE', 'RECON', 4, ['SPYGLASS', 'AMBUSH'], { kind: 'STEALTH' }),

  // ---- MELEE ----------------------------------------------------------
  // CIV6 note on Battlecry: "the Combat Strength bonus also applies when
  // fighting anti-cavalry units, and only when a unit with this promotion is
  // attacking."
  P('BATTLECRY', 'MELEE', 1, [],
    cs('CS_VS_CLASS_ATK', 7, CLASS_BIT.MELEE | CLASS_BIT.RANGED | CLASS_BIT.ANTICAV)),
  P('TORTOISE', 'MELEE', 1, [], cs('CS_DEF_RANGED', 10)),
  P('COMMANDO', 'MELEE', 2, ['BATTLECRY', 'AMPHIBIOUS'], { kind: 'CLIFFS' }, cs('MOVES', 1)),
  P('AMPHIBIOUS', 'MELEE', 2, ['TORTOISE', 'COMMANDO'], { kind: 'AMPHIBIOUS' }),
  P('ZWEIHANDER', 'MELEE', 3, ['COMMANDO', 'AMPHIBIOUS'], cs('CS_VS_CLASS_ATK', 7, CLASS_BIT.ANTICAV)),
  P('URBAN_WARFARE', 'MELEE', 3, ['COMMANDO', 'AMPHIBIOUS'], cs('CS_ATK_DISTRICT', 10)),
  P('ELITE_GUARD', 'MELEE', 4, ['ZWEIHANDER', 'URBAN_WARFARE'],
    { kind: 'MOVE_AFTER_ATTACK' }, cs('EXTRA_ATTACK', 1)),

  // ---- RANGED ---------------------------------------------------------
  P('VOLLEY', 'RANGED', 1, [], cs('CS_VS_CLASS_ATK', 5, MASK_LAND)),
  P('GARRISON', 'RANGED', 1, [], cs('CS_IN_DISTRICT', 10)),
  P('ARROW_STORM', 'RANGED', 2, ['VOLLEY'], cs('CS_VS_CLASS_ATK', 7, MASK_LAND | MASK_NAVAL)),
  P('INCENDIARIES', 'RANGED', 2, ['GARRISON'], cs('CS_VS_DISTRICT_DEF', 7)),
  P('SUPPRESSION', 'RANGED', 3, ['ARROW_STORM', 'INCENDIARIES'], cs('ZOC_EXERT', 1)),
  P('EMPLACEMENT', 'RANGED', 3, ['ARROW_STORM', 'INCENDIARIES'], cs('CS_DEF_VS_CITY', 10)),
  P('EXPERT_MARKSMAN', 'RANGED', 4, ['SUPPRESSION', 'EMPLACEMENT'], cs('EXTRA_ATTACK_STILL', 1)),

  // ---- ANTI-CAVALRY ---------------------------------------------------
  P('ECHELON', 'ANTICAV', 1, [], cs('CS_VS_CLASS_ANY', 5, MASK_CAVALRY)),
  P('THRUST', 'ANTICAV', 1, [], cs('CS_VS_CLASS_ANY', 5, CLASS_BIT.MELEE)),
  P('SQUARE', 'ANTICAV', 2, ['ECHELON'], cs('SUPPORT_MULT', 2)),
  P('SCHILTRON', 'ANTICAV', 2, ['THRUST'], cs('CS_DEF_VS_CLASS', 10, CLASS_BIT.MELEE)),
  P('REDEPLOY', 'ANTICAV', 3, ['SQUARE', 'SCHILTRON'], cs('MOVES', 1)),
  P('CHOKE_POINTS', 'ANTICAV', 3, ['SQUARE', 'SCHILTRON'], cs('CS_DEF_TERRAIN', 7)),
  P('HOLD_THE_LINE', 'ANTICAV', 4, ['REDEPLOY', 'CHOKE_POINTS'], cs('HOLD_THE_LINE', 10)),

  // ---- LIGHT CAVALRY --------------------------------------------------
  P('CAPARISON', 'LIGHT_CAV', 1, [], cs('CS_VS_CLASS_ANY', 5, CLASS_BIT.ANTICAV)),
  P('COURSERS', 'LIGHT_CAV', 1, [], cs('CS_VS_CLASS_ATK', 5, CLASS_BIT.RANGED | CLASS_BIT.SIEGE)),
  P('DEPREDATION', 'LIGHT_CAV', 2, ['CAPARISON'], cs('PILLAGE_CHEAP', 1)),
  P('DOUBLE_ENVELOPMENT', 'LIGHT_CAV', 2, ['COURSERS'], cs('FLANK_MULT', 2)),
  P('SPIKING_THE_GUNS', 'LIGHT_CAV', 3, ['DEPREDATION', 'DOUBLE_ENVELOPMENT'],
    cs('CS_VS_CLASS_ANY', 7, CLASS_BIT.SIEGE)),
  P('PURSUIT', 'LIGHT_CAV', 3, ['DEPREDATION', 'DOUBLE_ENVELOPMENT'], cs('MOVES', 1)),
  // CIV6 (Escort Mobility): "Formation units all inherit escort's Movement
  // speed" — the pair stops paying the slower member's way.
  P('ESCORT_MOBILITY', 'LIGHT_CAV', 4, ['SPIKING_THE_GUNS', 'PURSUIT'],
    { kind: 'ESCORT_SPEED' }),

  // ---- HEAVY CAVALRY --------------------------------------------------
  P('CHARGE', 'HEAVY_CAV', 1, [], cs('CS_VS_FORTIFIED', 10)),
  P('BARDING', 'HEAVY_CAV', 1, [], cs('CS_DEF_RANGED', 7)),
  P('MARAUDING', 'HEAVY_CAV', 2, ['CHARGE', 'ROUT'], cs('CS_VS_IN_DISTRICT', 7)),
  P('ROUT', 'HEAVY_CAV', 2, ['BARDING', 'MARAUDING'], cs('CS_VS_DAMAGED', 5)),
  P('ARMOR_PIERCING', 'HEAVY_CAV', 3, ['MARAUDING', 'ROUT'],
    cs('CS_VS_CLASS_ANY', 7, CLASS_BIT.HEAVY_CAV)),
  P('REACTIVE_ARMOR', 'HEAVY_CAV', 3, ['ROUT'],
    cs('CS_DEF_VS_CLASS', 7, CLASS_BIT.HEAVY_CAV | CLASS_BIT.ANTICAV)),
  P('BREAKTHROUGH', 'HEAVY_CAV', 4, ['ARMOR_PIERCING', 'REACTIVE_ARMOR'], cs('EXTRA_ATTACK', 1)),

  // ---- SIEGE ----------------------------------------------------------
  P('GRAPE_SHOT', 'SIEGE', 1, [], cs('CS_VS_CLASS_ANY', 7, MASK_LAND)),
  P('CREW_WEAPONS', 'SIEGE', 1, [], cs('CS_DEF_ANY', 7)),
  P('SHRAPNEL', 'SIEGE', 2, ['GRAPE_SHOT'], cs('CS_VS_CLASS_ANY', 10, MASK_LAND)),
  P('SHELLS', 'SIEGE', 2, ['CREW_WEAPONS'], cs('CS_VS_DISTRICT_DEF', 10)),
  P('ADVANCED_RANGEFINDING', 'SIEGE', 3, ['SHRAPNEL', 'SHELLS'],
    cs('CS_VS_CLASS_ATK', 10, MASK_NAVAL)),
  P('EXPERT_CREW', 'SIEGE', 3, ['SHRAPNEL', 'SHELLS'], { kind: 'SIEGE_MOVE_SHOOT' }),
  P('FORWARD_OBSERVERS', 'SIEGE', 4, ['ADVANCED_RANGEFINDING', 'EXPERT_CREW'], cs('RANGE', 1)),

  // ---- NAVAL MELEE ----------------------------------------------------
  P('HELMSMAN', 'NAVAL_MELEE', 1, [], cs('MOVES', 1)),
  P('EMBOLON', 'NAVAL_MELEE', 1, [], cs('CS_VS_CLASS_ANY', 7, MASK_NAVAL)),
  P('RUTTER', 'NAVAL_MELEE', 2, ['HELMSMAN'], cs('SIGHT', 1)),
  P('REINFORCED_HULL', 'NAVAL_MELEE', 2, ['EMBOLON'], cs('CS_DEF_RANGED', 10)),
  // CIV6 (Convoy): "+10 Combat Strength when in a formation" — the ESCORT
  // formation, which for a naval hull is the embarked unit it carries.
  P('CONVOY', 'NAVAL_MELEE', 3, ['RUTTER', 'REINFORCED_HULL'],
    cs('CS_IN_FORMATION', 10)),
  P('AUXILIARY_SHIPS', 'NAVAL_MELEE', 3, ['RUTTER', 'REINFORCED_HULL'], { kind: 'HEAL_ANYWHERE' }),
  P('CREEPING_ATTACK', 'NAVAL_MELEE', 4, ['CONVOY', 'AUXILIARY_SHIPS'],
    cs('CS_VS_CLASS_ANY', 14, CLASS_BIT.NAVAL_RAIDER)),

  // ---- NAVAL RANGED ---------------------------------------------------
  P('LINE_OF_BATTLE', 'NAVAL_RANGED', 1, [], cs('CS_VS_CLASS_ANY', 7, MASK_NAVAL)),
  P('BOMBARDMENT', 'NAVAL_RANGED', 1, [], cs('CS_VS_DISTRICT_DEF', 7)),
  P('PREPARATORY_FIRE', 'NAVAL_RANGED', 2, ['LINE_OF_BATTLE'], cs('CS_VS_CLASS_ATK', 7, MASK_LAND)),
  P('ROLLING_BARRAGE', 'NAVAL_RANGED', 2, ['BOMBARDMENT'], cs('CS_VS_DISTRICT_DEF', 10)),
  P('SUPPLY_FLEET', 'NAVAL_RANGED', 3, ['PREPARATORY_FIRE', 'ROLLING_BARRAGE'], { kind: 'HEAL_ANYWHERE' }),
  P('PROXIMITY_FUSES', 'NAVAL_RANGED', 3, ['PREPARATORY_FIRE', 'ROLLING_BARRAGE'],
    cs('CS_DEF_VS_AIR', 7)),
  P('COINCIDENCE_RANGEFINDING', 'NAVAL_RANGED', 4, ['SUPPLY_FLEET', 'PROXIMITY_FUSES'], cs('RANGE', 1)),

  // ---- APOSTLE (a LIST: tier 0, no prerequisites) ----------------------
  P('CHAPLAIN', 'APOSTLE', 0, [], cs('CHAPLAIN', 20)),
  P('DEBATER', 'APOSTLE', 0, [], cs('RELIG_CS', 20)),
  P('HEATHEN_CONVERSION', 'APOSTLE', 0, [], { kind: 'HEATHEN' }),
  P('INDULGENCE_VENDOR', 'APOSTLE', 0, [], cs('INDULGENCE', 100)),
  P('MARTYR', 'APOSTLE', 0, [], { kind: 'MARTYR' }),
  P('ORATOR', 'APOSTLE', 0, [], cs('SPREAD_CHARGES', 2)),
  P('PILGRIM', 'APOSTLE', 0, [], cs('PILGRIM', 3)),
  P('PROSELYTIZER', 'APOSTLE', 0, [], cs('PROSELYTIZER', 75)),
  P('TRANSLATOR', 'APOSTLE', 0, [], cs('TRANSLATOR', 3)),

  // ---- WARRIOR MONK ---------------------------------------------------
  // Its own tree, and the only one whose tier-I roots are a flanking
  // multiplier and invisibility rather than a combat number.
  P('SHADOW_STRIKE', 'MONK', 1, [], cs('FLANK_MULT', 2)),
  P('TWILIGHT_VEIL', 'MONK', 1, [], { kind: 'STEALTH' }),
  P('EXPLODING_PALMS', 'MONK', 2, ['SHADOW_STRIKE', 'TWILIGHT_VEIL'], cs('CS_ALL', 10)),
  P('DISCIPLES', 'MONK', 2, ['SHADOW_STRIKE', 'TWILIGHT_VEIL'], cs('KILL_SPREAD', KILL_SPREAD_PRESSURE)),
  P('SWEEPING_WIND', 'MONK', 3, ['EXPLODING_PALMS', 'DISCIPLES'], cs('EXTRA_ATTACK', 1)),
  P('DANCING_CRANE', 'MONK', 3, ['EXPLODING_PALMS', 'DISCIPLES'], cs('MOVES', 1)),
  P('COBRA_STRIKE', 'MONK', 4, ['SWEEPING_WIND', 'DANCING_CRANE'], cs('CS_ALL', 15)),

  // ---- AIR FIGHTER ----------------------------------------------------
  // The two roots split by what the fighter is FOR: killing other aircraft,
  // or surviving the guns pointed at it.
  P('DOGFIGHTING', 'AIR_FIGHTER', 1, [], cs('CS_VS_CLASS_ANY', 7, CLASS_BIT.AIR_FIGHTER)),
  P('COCKPIT_ARMOR', 'AIR_FIGHTER', 1, [], cs('CS_DEF_VS_AA', 7)),
  P('INTERCEPTOR', 'AIR_FIGHTER', 2, ['DOGFIGHTING'],
    cs('CS_VS_CLASS_ANY', 7, CLASS_BIT.AIR_BOMBER)),
  P('STRAFE', 'AIR_FIGHTER', 2, ['COCKPIT_ARMOR'],
    cs('CS_VS_CLASS_ANY', 17, MASK_LAND & ~MASK_CAVALRY)),
  P('GROUND_CREWS', 'AIR_FIGHTER', 3, ['INTERCEPTOR'], none),
  P('TANK_BUSTER', 'AIR_FIGHTER', 3, ['STRAFE'], cs('CS_VS_CLASS_ANY', 17, MASK_CAVALRY)),
  P('DROP_TANKS', 'AIR_FIGHTER', 4, ['GROUND_CREWS', 'TANK_BUSTER'], cs('RANGE', 2)),

  // ---- AIR BOMBER -----------------------------------------------------
  // Both roots are DEFENSIVE, against the two things that shoot a bomber
  // down: a fighter, and the guns below it.
  P('BOX_FORMATION', 'AIR_BOMBER', 1, [],
    cs('CS_DEF_VS_CLASS', 7, CLASS_BIT.AIR_FIGHTER)),
  P('EVASIVE_MANEUVERS', 'AIR_BOMBER', 1, [], cs('CS_DEF_VS_AA', 7)),
  P('CLOSE_AIR_SUPPORT', 'AIR_BOMBER', 2, ['BOX_FORMATION', 'EVASIVE_MANEUVERS'],
    cs('CS_VS_CLASS_ANY', 12, MASK_LAND)),
  P('TORPEDO_BOMBER', 'AIR_BOMBER', 2, ['BOX_FORMATION', 'EVASIVE_MANEUVERS'],
    cs('CS_VS_CLASS_ANY', 17, MASK_NAVAL)),
  P('LONG_RANGE', 'AIR_BOMBER', 3, ['CLOSE_AIR_SUPPORT'], cs('RANGE', 2)),
  P('TACTICAL_MAINTENANCE', 'AIR_BOMBER', 3, ['TORPEDO_BOMBER'],
    { kind: 'HEAL_AFTER_ATTACK' }),
  P('SUPERFORTRESS', 'AIR_BOMBER', 4, ['LONG_RANGE', 'TACTICAL_MAINTENANCE'],
    { kind: 'AIR_PILLAGE_ANY_HP' }),

  // ---- NAVAL RAIDER ---------------------------------------------------
  // The raider's tree is money first and the hunt second, which is what the
  // class is: "Obtain Gold from naval victories" beside "+50 Gold from
  // coastal raids".
  // CIV6 (BOARDING_GOLD_FROM_NAVAL_VICTORY,
  // MODIFIER_UNIT_ADJUST_POST_COMBAT_YIELD): PercentDefeatedStrength 100,
  // YieldType YIELD_GOLD, against an opponent of DOMAIN_SEA. The AUDIT called
  // this magnitude unpublished; it is 100, and the engine already
  // exports and reads a post-combat yield channel.
  P('BOARDING', 'NAVAL_RAIDER', 1, [], cs('NAVAL_KILL_GOLD', 100)),
  P('LOOT', 'NAVAL_RAIDER', 1, [], cs('RAID_GOLD', 50)),
  P('HOMING_TORPEDOES', 'NAVAL_RAIDER', 2, ['BOARDING'],
    cs('CS_VS_CLASS_ANY', 10, MASK_NAVAL)),
  P('SWIFT_KEEL', 'NAVAL_RAIDER', 2, ['LOOT'], cs('MOVES', 1)),
  P('OBSERVATION', 'NAVAL_RAIDER', 3, ['SWIFT_KEEL'], cs('SIGHT', 1)),
  P('SILENT_RUNNING', 'NAVAL_RAIDER', 3, ['HOMING_TORPEDOES'], { kind: 'MOVE_AFTER_ATTACK' }),
  P('WOLFPACK', 'NAVAL_RAIDER', 4, ['OBSERVATION', 'SILENT_RUNNING'], cs('EXTRA_ATTACK', 1)),

  // ---- NAVAL CARRIER --------------------------------------------------
  // Three of the seven rows say the same thing — "+1 additional aircraft
  // slot" — so the hull that takes the whole left branch bases three more
  // planes than it was launched with. Each row's `requires` is the list its
  // own Civilopedia page names, read as the OR this catalog's prerequisites
  // already are.
  P('FLIGHT_DECK', 'NAVAL_CARRIER', 1, [], cs('AIR_SLOTS', 1)),
  P('SCOUT_PLANES', 'NAVAL_CARRIER', 1, [], cs('SIGHT', 1)),
  P('HANGAR_DECK', 'NAVAL_CARRIER', 2, ['FLIGHT_DECK'], cs('AIR_SLOTS', 1)),
  P('ADVANCED_ENGINES', 'NAVAL_CARRIER', 2, ['SCOUT_PLANES', 'HANGAR_DECK'], cs('MOVES', 1)),
  P('FOLDING_WINGS', 'NAVAL_CARRIER', 3, ['HANGAR_DECK'], cs('AIR_SLOTS', 1)),
  P('DECK_CREWS', 'NAVAL_CARRIER', 3, ['ADVANCED_ENGINES', 'FOLDING_WINGS'],
    { kind: 'HEAL_AFTER_ATTACK' }),
  P('SUPERCARRIER', 'NAVAL_CARRIER', 4, ['FOLDING_WINGS', 'DECK_CREWS'],
    { kind: 'HEAL_ANYWHERE' }),

  // ---- ESPIONAGE ------------------------------------------------------
  // CIV6 (Spy): a spy is "able to choose one of three promotions each time
  // they gain a level, which are chosen at random from the pool", and the
  // chassis' own page caps it at three taken. So the seventeen are ONE flat
  // pool: no tiers past the first, and no prerequisites to chain.
  // CIV6 (Ace Driver): "If caught on a mission, have a much higher chance
  // of escape (+4 levels)" — the escape roll's own level term.
  P('ACE_DRIVER', 'ESPIONAGE', 1, [], cs('SPY_ESCAPE_LEVEL', 4)),
  P('CAT_BURGLAR', 'ESPIONAGE', 1, [], op(SPY_M_GREAT_WORK_HEIST)),
  P('CON_ARTIST', 'ESPIONAGE', 1, [], op(SPY_M_SIPHON_FUNDS)),
  P('COVERT_ACTION', 'ESPIONAGE', 1, [], op(SPY_M_FOMENT_UNREST)),
  P('DEMOLITIONS', 'ESPIONAGE', 1, [], op(SPY_M_SABOTAGE_PRODUCTION)),
  P('DISGUISE', 'ESPIONAGE', 1, [], { kind: 'SPY_NO_ESTABLISH' }),
  P('GUERRILLA_LEADER', 'ESPIONAGE', 1, [], op(SPY_M_RECRUIT_PARTISANS)),
  P('LICENSE_TO_KILL', 'ESPIONAGE', 1, [], op(SPY_M_NEUTRALIZE_GOVERNOR)),
  P('LINGUIST', 'ESPIONAGE', 1, [], cs('SPY_OP_SPEED', 25)),
  P('POLYGRAPH', 'ESPIONAGE', 1, [], cs('SPY_HOME_ENEMY_LEVEL', 1)),
  P('QUARTERMASTER', 'ESPIONAGE', 1, [], cs('SPY_HOME_ALLY_LEVEL', 1)),
  P('ROCKET_SCIENTIST', 'ESPIONAGE', 1, [], op(SPY_M_DISRUPT_ROCKETRY)),
  P('SATCHEL_CHARGES', 'ESPIONAGE', 1, [], op(SPY_M_BREACH_DAM)),
  P('SEDUCTION', 'ESPIONAGE', 1, [], op(SPY_M_COUNTERSPY)),
  P('SMEAR_CAMPAIGN', 'ESPIONAGE', 1, [], op(SPY_M_FABRICATE_SCANDAL)),
  // CIV6 (Surveillance): "When Counterspying all city districts are defended
  // (and +1 level at districts within 1 hex)."
  P('SURVEILLANCE', 'ESPIONAGE', 1, [], cs('SPY_SURVEIL', 1)),
  P('TECHNOLOGIST', 'ESPIONAGE', 1, [], op(SPY_M_STEAL_TECH_BOOST)),

  // ---- ROCK BAND ------------------------------------------------------
  // CIV6 (Expansion2_UnitPromotions, PROMOTION_CLASS_ROCK_BAND): twelve
  // Level-1 rows, one flat pool — a band is bought with one of them and holds
  // at most ROCK_BAND_MAX_PROMOTIONS. "Performs as if N levels more
  // experienced on <venue> tiles" is BAND_LEVEL over the venue kind; "Performs
  // at <venue> for +V Tourism" is BAND_VENUE, which ADDS to whatever the tile
  // already pays (a Campus with a University reads 500 + 500).
  P('ALBUM_COVER_ART', 'ROCK_BAND', 1, [], cs('BAND_LEVEL', 1, BAND_VENUE_BIT.WONDER)),
  P('ARENA_ROCK', 'ROCK_BAND', 1, [], cs('BAND_LEVEL', 2, BAND_VENUE_BIT.ENTERTAINMENT_COMPLEX)),
  P('GLAM_ROCK', 'ROCK_BAND', 1, [], cs('BAND_LEVEL', 2, BAND_VENUE_BIT.THEATER_SQUARE)),
  P('GOES_TO_11', 'ROCK_BAND', 1, [], cs('CONCERT_SHARE_NEAR', 50)),
  P('INDIE', 'ROCK_BAND', 1, [], cs('CONCERT_LOYALTY', 40)),
  P('MUSIC_FESTIVAL', 'ROCK_BAND', 1, [],
    cs('BAND_VENUE', 1000, BAND_VENUE_BIT.NATIONAL_PARK | BAND_VENUE_BIT.NATURAL_WONDER),
    cs('BAND_LEVEL', 1, BAND_VENUE_BIT.NATIONAL_PARK | BAND_VENUE_BIT.NATURAL_WONDER)),
  P('POP_STAR', 'ROCK_BAND', 1, [], cs('CONCERT_GOLD_PCT', 25)),
  P('REGGAE_ROCK', 'ROCK_BAND', 1, [], cs('BAND_LEVEL', 2, BAND_VENUE_BIT.WATER_PARK)),
  P('RELIGIOUS_ROCK', 'ROCK_BAND', 1, [], { kind: 'CONCERT_CONVERT' }),
  P('ROADIES', 'ROCK_BAND', 1, [], cs('MOVES', 4)),
  P('SPACE_ROCK', 'ROCK_BAND', 1, [],
    cs('BAND_VENUE', 500, BAND_VENUE_BIT.SPACEPORT | BAND_VENUE_BIT.CAMPUS),
    cs('BAND_LEVEL', 1, BAND_VENUE_BIT.SPACEPORT | BAND_VENUE_BIT.CAMPUS)),
  P('SURF_BAND', 'ROCK_BAND', 1, [],
    cs('BAND_VENUE', 500, BAND_VENUE_BIT.SEASIDE_RESORT | BAND_VENUE_BIT.HARBOR),
    cs('BAND_LEVEL', 1, BAND_VENUE_BIT.SEASIDE_RESORT | BAND_VENUE_BIT.HARBOR)),
];

/** the promotions of one class, in catalog order — the ORDER IS THE WIRE:
 *  column k of the PROMOTE head takes the k-th row of the acting unit's
 *  class, on both engines. */
export function promoRows(cls: PromoClass): readonly PromoDef[] {
  return PROMOTIONS.filter((p) => p.cls === cls);
}

/** the widest class list, and so the width of the PROMOTE head. */
export const PROMO_COLS = Math.max(...PROMO_CLASSES.map((c) => promoRows(c).length));

/** the CLASS whose table a chassis promotes from. Every military chassis in
 *  the roster has one; a civilian (and the Missionary) has none. */
export const UNIT_PROMO_CLASS: Readonly<Record<string, PromoClass>> = {
  SCOUT: 'RECON', SKIRMISHER: 'RECON', RANGER: 'RECON', SPEC_OPS: 'RECON',
  WARRIOR: 'MELEE', SWORDSMAN: 'MELEE', MAN_AT_ARMS: 'MELEE', MUSKETMAN: 'MELEE',
  LINE_INFANTRY: 'MELEE', INFANTRY: 'MELEE', MECHANIZED_INFANTRY: 'MELEE',
  SLINGER: 'RANGED', ARCHER: 'RANGED', CROSSBOWMAN: 'RANGED',
  FIELD_CANNON: 'RANGED', MACHINE_GUN: 'RANGED',
  SPEARMAN: 'ANTICAV', PIKEMAN: 'ANTICAV', PIKE_AND_SHOT: 'ANTICAV',
  AT_CREW: 'ANTICAV', MODERN_AT: 'ANTICAV',
  HORSEMAN: 'LIGHT_CAV', COURSER: 'LIGHT_CAV', CAVALRY: 'LIGHT_CAV',
  HELICOPTER: 'LIGHT_CAV',
  HEAVY_CHARIOT: 'HEAVY_CAV', KNIGHT: 'HEAVY_CAV', CUIRASSIER: 'HEAVY_CAV',
  TANK: 'HEAVY_CAV', MODERN_ARMOR: 'HEAVY_CAV',
  CATAPULT: 'SIEGE', TREBUCHET: 'SIEGE', BOMBARD: 'SIEGE',
  ARTILLERY: 'SIEGE', ROCKET_ARTILLERY: 'SIEGE',
  GALLEY: 'NAVAL_MELEE', CARAVEL: 'NAVAL_MELEE', IRONCLAD: 'NAVAL_MELEE',
  DESTROYER: 'NAVAL_MELEE',
  QUADRIREME: 'NAVAL_RANGED', FRIGATE: 'NAVAL_RANGED',
  BATTLESHIP: 'NAVAL_RANGED', MISSILE_CRUISER: 'NAVAL_RANGED',
  APOSTLE: 'APOSTLE',
  WARRIOR_MONK: 'MONK',
  BIPLANE: 'AIR_FIGHTER', FIGHTER: 'AIR_FIGHTER', JET_FIGHTER: 'AIR_FIGHTER',
  BOMBER: 'AIR_BOMBER', JET_BOMBER: 'AIR_BOMBER',
  PRIVATEER: 'NAVAL_RAIDER', SUBMARINE: 'NAVAL_RAIDER',
  NUCLEAR_SUBMARINE: 'NAVAL_RAIDER',
  AIRCRAFT_CARRIER: 'NAVAL_CARRIER',
  SPY: 'ESPIONAGE',
  ROCK_BAND: 'ROCK_BAND',
};

/** the class BIT a chassis presents to another unit's `CS_VS_*` mask. */
export function classBitOf(unitType: string): number {
  const c = UNIT_PROMO_CLASS[unitType];
  return (c && CLASS_BIT[c]) ?? 0;
}

/** the catalog index of a promotion id — the bit it occupies in a unit's
 *  `promotions` mask, shared by both engines through the rules export. */
export const PROMO_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  PROMOTIONS.map((p, i) => [p.id, i]),
);
