/**
 * THE CIVILIZATION ABILITIES — CIV6, the owner's install (Civilizations.xml,
 * Traits / TraitModifiers / Modifiers). One constant per sourced number; the
 * rule body that spends each lives beside the mechanic it touches.
 */
import type { ImprovementId } from '../../world/types';

/** CIV6 (Iteru, TRAIT_RIVER_FASTER_BUILDTIME_DISTRICT / _WONDER): "+15%
 *  Production towards Districts and Wonders built next to a River." */
export const ITERU_RIVER_PROD_MULT = 1.15;

/** CIV6 (Knarr, MELEE_SHIP_HEAL_NEUTRAL): naval melee units heal +10 in
 *  neutral territory. */
export const KNARR_NAVAL_MELEE_NEUTRAL_HEAL = 10;

/** CIV6 (Epic Quest): "Levying units from a city-state costs 50% less Gold." */
export const EPIC_QUEST_LEVY_MULT = 0.5;

/** CIV6 (All Roads Lead to Rome): "Trade Routes generate +1 Gold for passing
 *  through Trading Posts in your own cities." */
export const ROME_OWN_POST_GOLD = 1;

/** CIV6 (Mediterranean's Bride): "Your Trade Routes to other civilizations
 *  provide +4 Gold for Egypt. Other civilizations' Trade Routes to Egypt
 *  provide +2 Food for them and +2 Gold for Egypt. Trading with Allies earns
 *  twice as many bonus Alliance Points." */
export const CLEOPATRA_INTL_ROUTE_GOLD = 4;
export const CLEOPATRA_INCOMING_ROUTE_FOOD = 2;
export const CLEOPATRA_INCOMING_ROUTE_GOLD = 2;
export const CLEOPATRA_TRADE_QP_MULT = 2;

/** CIV6 (Thunderbolt of the North): "+50% Production toward all naval melee
 *  units. Receive Science from pillaging and coastal raiding Mines in
 *  addition to Gold. Pillaging or coastal raiding Quarries, Pastures,
 *  Plantations, and Camps also yields Culture" — 15 each
 *  (EFFECT_ADJUST_ADDITIONAL_PILLAGING), scaled like the row's own lump. */
export const HARDRADA_NAVAL_MELEE_PROD_MULT = 1.5;
export const HARDRADA_PILLAGE: readonly { improvement: ImprovementId; kind: 'science' | 'culture'; amount: number }[] = [
  { improvement: 'MINE', kind: 'science', amount: 15 },
  { improvement: 'QUARRY', kind: 'culture', amount: 15 },
  { improvement: 'PASTURE', kind: 'culture', amount: 15 },
  { improvement: 'PLANTATION', kind: 'culture', amount: 15 },
  { improvement: 'CAMP', kind: 'culture', amount: 15 },
];

/** CIV6 (Adventures of Enkidu): "When at war with a common foe, they and
 *  their allies share pillage rewards and share combat experience gains if
 *  within 5 tiles. Their Alliances gain Alliance Points for being at war
 *  with a common foe. +5 Combat Strength against units of civilizations
 *  their allies are at war with." Two points a turn is eight quarter-points. */
export const ENKIDU_WAR_CS = 5;
export const ENKIDU_COMMON_FOE_QP = 8;
export const ENKIDU_SHARE_RANGE = 5;
