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
 * names the blocker for each.
 */

export const PROMO_CLASSES = [
  'RECON', 'MELEE', 'RANGED', 'ANTICAV', 'LIGHT_CAV', 'HEAVY_CAV',
  'SIEGE', 'NAVAL_MELEE', 'NAVAL_RANGED', 'APOSTLE',
] as const;
export type PromoClass = (typeof PROMO_CLASSES)[number];

/** the class bits a `CS_VS_*` mask addresses; APOSTLE is never a target. */
export const CLASS_BIT: Readonly<Record<string, number>> = Object.fromEntries(
  PROMO_CLASSES.slice(0, 9).map((c, i) => [c, 1 << i]),
);
export const MASK_LAND = CLASS_BIT.RECON | CLASS_BIT.MELEE | CLASS_BIT.RANGED
  | CLASS_BIT.ANTICAV | CLASS_BIT.LIGHT_CAV | CLASS_BIT.HEAVY_CAV | CLASS_BIT.SIEGE;
export const MASK_NAVAL = CLASS_BIT.NAVAL_MELEE | CLASS_BIT.NAVAL_RANGED;
export const MASK_CAVALRY = CLASS_BIT.LIGHT_CAV | CLASS_BIT.HEAVY_CAV;

export const PROMO_KINDS = [
  'NONE',
  'CS_ALL',              // +v in every roll this unit fights
  'CS_VS_CLASS_ATK',     // +v attacking a foe in `mask`
  'CS_VS_CLASS_ANY',     // +v against a foe in `mask`, attacking or defending
  'CS_DEF_VS_CLASS',     // +v defending against a foe in `mask`
  'CS_DEF_RANGED',       // +v defending against a RANGED attack
  'CS_DEF_ANY',          // +v whenever this unit defends
  'CS_DEF_VS_CITY',      // +v defending against a CITY's strike
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
const none: PromoEffect = { kind: 'NONE' };

export const PROMOTIONS: readonly PromoDef[] = [
  // ---- RECON ----------------------------------------------------------
  P('RANGER', 'RECON', 1, [], { kind: 'TERRAIN_MOVE_WOODS' }),
  P('ALPINE', 'RECON', 1, [], { kind: 'TERRAIN_MOVE_HILLS' }),
  P('SENTRY', 'RECON', 2, ['RANGER', 'ALPINE'], none),
  P('GUERRILLA', 'RECON', 2, ['RANGER', 'ALPINE'], { kind: 'MOVE_AFTER_ATTACK' }),
  P('SPYGLASS', 'RECON', 3, ['SENTRY'], cs('SIGHT', 1)),
  P('AMBUSH', 'RECON', 3, ['GUERRILLA'], cs('CS_ALL', 20)),
  P('CAMOUFLAGE', 'RECON', 4, ['SPYGLASS', 'AMBUSH'], none),

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
  P('ELITE_GUARD', 'MELEE', 4, ['ZWEIHANDER', 'URBAN_WARFARE'], { kind: 'MOVE_AFTER_ATTACK' }, none),

  // ---- RANGED ---------------------------------------------------------
  P('VOLLEY', 'RANGED', 1, [], cs('CS_VS_CLASS_ATK', 5, MASK_LAND)),
  P('GARRISON', 'RANGED', 1, [], cs('CS_IN_DISTRICT', 10)),
  P('ARROW_STORM', 'RANGED', 2, ['VOLLEY'], cs('CS_VS_CLASS_ATK', 7, MASK_LAND | MASK_NAVAL)),
  P('INCENDIARIES', 'RANGED', 2, ['GARRISON'], cs('CS_VS_DISTRICT_DEF', 7)),
  P('SUPPRESSION', 'RANGED', 3, ['ARROW_STORM', 'INCENDIARIES'], none),
  P('EMPLACEMENT', 'RANGED', 3, ['ARROW_STORM', 'INCENDIARIES'], cs('CS_DEF_VS_CITY', 10)),
  P('EXPERT_MARKSMAN', 'RANGED', 4, ['SUPPRESSION', 'EMPLACEMENT'], none),

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
  P('ESCORT_MOBILITY', 'LIGHT_CAV', 4, ['SPIKING_THE_GUNS', 'PURSUIT'], none),

  // ---- HEAVY CAVALRY --------------------------------------------------
  P('CHARGE', 'HEAVY_CAV', 1, [], cs('CS_VS_FORTIFIED', 10)),
  P('BARDING', 'HEAVY_CAV', 1, [], cs('CS_DEF_RANGED', 7)),
  P('MARAUDING', 'HEAVY_CAV', 2, ['CHARGE', 'ROUT'], cs('CS_VS_IN_DISTRICT', 7)),
  P('ROUT', 'HEAVY_CAV', 2, ['BARDING', 'MARAUDING'], cs('CS_VS_DAMAGED', 5)),
  P('ARMOR_PIERCING', 'HEAVY_CAV', 3, ['MARAUDING', 'ROUT'],
    cs('CS_VS_CLASS_ANY', 7, CLASS_BIT.HEAVY_CAV)),
  P('REACTIVE_ARMOR', 'HEAVY_CAV', 3, ['ROUT'],
    cs('CS_DEF_VS_CLASS', 7, CLASS_BIT.HEAVY_CAV | CLASS_BIT.ANTICAV)),
  P('BREAKTHROUGH', 'HEAVY_CAV', 4, ['ARMOR_PIERCING', 'REACTIVE_ARMOR'], none),

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
  P('CONVOY', 'NAVAL_MELEE', 3, ['RUTTER', 'REINFORCED_HULL'], none),
  P('AUXILIARY_SHIPS', 'NAVAL_MELEE', 3, ['RUTTER', 'REINFORCED_HULL'], { kind: 'HEAL_ANYWHERE' }),
  P('CREEPING_ATTACK', 'NAVAL_MELEE', 4, ['CONVOY', 'AUXILIARY_SHIPS'], none),

  // ---- NAVAL RANGED ---------------------------------------------------
  P('LINE_OF_BATTLE', 'NAVAL_RANGED', 1, [], cs('CS_VS_CLASS_ANY', 7, MASK_NAVAL)),
  P('BOMBARDMENT', 'NAVAL_RANGED', 1, [], cs('CS_VS_DISTRICT_DEF', 7)),
  P('PREPARATORY_FIRE', 'NAVAL_RANGED', 2, ['LINE_OF_BATTLE'], cs('CS_VS_CLASS_ATK', 7, MASK_LAND)),
  P('ROLLING_BARRAGE', 'NAVAL_RANGED', 2, ['BOMBARDMENT'], cs('CS_VS_DISTRICT_DEF', 10)),
  P('SUPPLY_FLEET', 'NAVAL_RANGED', 3, ['PREPARATORY_FIRE', 'ROLLING_BARRAGE'], { kind: 'HEAL_ANYWHERE' }),
  P('PROXIMITY_FUSES', 'NAVAL_RANGED', 3, ['PREPARATORY_FIRE', 'ROLLING_BARRAGE'], none),
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
  SCOUT: 'RECON',
  WARRIOR: 'MELEE', SWORDSMAN: 'MELEE', MUSKETMAN: 'MELEE',
  SLINGER: 'RANGED', ARCHER: 'RANGED', CROSSBOWMAN: 'RANGED',
  SPEARMAN: 'ANTICAV', PIKEMAN: 'ANTICAV',
  HORSEMAN: 'LIGHT_CAV',
  KNIGHT: 'HEAVY_CAV',
  CATAPULT: 'SIEGE', BOMBARD: 'SIEGE',
  GALLEY: 'NAVAL_MELEE',
  QUADRIREME: 'NAVAL_RANGED',
  APOSTLE: 'APOSTLE',
};

/** the class BIT a chassis presents to another unit's `CS_VS_*` mask. */
export function classBitOf(unitType: string): number {
  const c = UNIT_PROMO_CLASS[unitType];
  return c && c !== 'APOSTLE' ? CLASS_BIT[c] : 0;
}

/** the catalog index of a promotion id — the bit it occupies in a unit's
 *  `promotions` mask, shared by both engines through the rules export. */
export const PROMO_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  PROMOTIONS.map((p, i) => [p.id, i]),
);
