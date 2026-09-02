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
  'AIR_SLOTS',           // +v aircraft this hull bases
  'AIR_PILLAGE_ANY_HP',  // may air pillage at any health
  'SPY_OP_LEVEL',        // +v spy levels on the mission whose bit is in `mask`
  'SPY_ESCAPE_LEVEL',    // +v levels on the ESCAPE roll alone
  'SPY_OP_SPEED',        // every mission's clock is v% shorter
  'SPY_NO_ESTABLISH',    // the spy arrives ready, with no travel clock at all
  'SPY_HOME_ALLY_LEVEL', // posted at home, every own spy operates at +v levels
  'SPY_HOME_ENEMY_LEVEL',// posted at home, enemy spies here operate v levels down
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
}

const P = (
  id: string, cls: PromoClass, tier: number, requires: readonly string[],
  ...effects: PromoEffect[]
): PromoDef => ({ id, cls, tier, requires, effects });

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
  P('SENTRY', 'RECON', 2, ['RANGER', 'ALPINE'], none),
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
  P('BOARDING', 'NAVAL_RAIDER', 1, [], none),
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
  P('SURVEILLANCE', 'ESPIONAGE', 1, [], none),
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
