/**
 * Great people (simplified): each class accumulates points from its district
 * (+1/turn), that district's buildings (+1 each/turn) and specialists
 * (+1 each/turn). Individuals are claimed automatically in order, with
 * instant effects only (tile-activation abilities aren't modeled).
 * Writers/artists/musicians are condensed into one Artist class.
 */

import type { DistrictId, GreatPersonClass } from '../core/types';

export const GP_CLASS_DISTRICT: Record<GreatPersonClass, DistrictId> = {
  SCIENTIST: 'CAMPUS',
  ENGINEER: 'INDUSTRIAL_ZONE',
  MERCHANT: 'COMMERCIAL_HUB',
  PROPHET: 'HOLY_SITE',
  ARTIST: 'THEATER_SQUARE',
  ADMIRAL: 'HARBOR',
  GENERAL: 'ENCAMPMENT',
};

export const GP_CLASS_NAMES: Record<GreatPersonClass, string> = {
  SCIENTIST: 'Great Scientist',
  ENGINEER: 'Great Engineer',
  MERCHANT: 'Great Merchant',
  PROPHET: 'Great Prophet',
  ARTIST: 'Great Artist',
  ADMIRAL: 'Great Admiral',
  GENERAL: 'Great General',
};

/** Point cost of the n-th person of a class (0-based). */
export function gpCost(n: number): number {
  return 60 * Math.pow(2, n);
}

export interface GreatPersonDef {
  id: string;
  name: string;
  class: GreatPersonClass;
  effect: {
    science?: number; // added to current tech progress
    culture?: number; // added to current civic progress
    faith?: number;
    gold?: number;
    /** Production added to the capital's current queue head. */
    productionToCapital?: number;
  };
  effectText: string;
}

const P = (
  cls: GreatPersonClass,
  id: string,
  name: string,
  effect: GreatPersonDef['effect'],
  effectText: string,
): GreatPersonDef => ({ id, name, class: cls, effect, effectText });

export const GREAT_PEOPLE: Record<GreatPersonClass, GreatPersonDef[]> = {
  SCIENTIST: [
    P('SCIENTIST', 'GP_ARYABHATA', 'Aryabhata', { science: 50 }, '+50 science toward the current tech'),
    P('SCIENTIST', 'GP_HYPATIA', 'Hypatia', { science: 120 }, '+120 science toward the current tech'),
    P('SCIENTIST', 'GP_NEWTON', 'Isaac Newton', { science: 300 }, '+300 science toward the current tech'),
    P('SCIENTIST', 'GP_EINSTEIN', 'Albert Einstein', { science: 750 }, '+750 science toward the current tech'),
  ],
  ENGINEER: [
    P('ENGINEER', 'GP_BI_SHENG', 'Bi Sheng', { productionToCapital: 100 }, '+100 production in the capital'),
    P('ENGINEER', 'GP_ISIDORE', 'Isidore of Miletus', { productionToCapital: 220 }, '+220 production in the capital'),
    P('ENGINEER', 'GP_DA_VINCI', 'Leonardo da Vinci', { productionToCapital: 500 }, '+500 production in the capital'),
    P('ENGINEER', 'GP_WATT', 'James Watt', { productionToCapital: 1000 }, '+1000 production in the capital'),
  ],
  MERCHANT: [
    P('MERCHANT', 'GP_COLAEUS', 'Colaeus', { gold: 100 }, '+100 gold'),
    P('MERCHANT', 'GP_ZHANG_QIAN', 'Zhang Qian', { gold: 250 }, '+250 gold'),
    P('MERCHANT', 'GP_MARCO_POLO', 'Marco Polo', { gold: 500 }, '+500 gold'),
    P('MERCHANT', 'GP_ADAM_SMITH', 'Adam Smith', { gold: 1200 }, '+1200 gold'),
  ],
  PROPHET: [
    P('PROPHET', 'GP_CONFUCIUS', 'Confucius', { faith: 100 }, '+100 faith'),
    P('PROPHET', 'GP_SIDDHARTHA', 'Siddhartha Gautama', { faith: 250 }, '+250 faith'),
    P('PROPHET', 'GP_ZOROASTER', 'Zoroaster', { faith: 500 }, '+500 faith'),
    P('PROPHET', 'GP_LAOZI', 'Laozi', { faith: 1000 }, '+1000 faith'),
  ],
  ARTIST: [
    P('ARTIST', 'GP_HOMER', 'Homer', { culture: 60 }, '+60 culture toward the current civic'),
    P('ARTIST', 'GP_MICHELANGELO', 'Michelangelo', { culture: 150 }, '+150 culture toward the current civic'),
    P('ARTIST', 'GP_SHAKESPEARE', 'William Shakespeare', { culture: 350 }, '+350 culture toward the current civic'),
    P('ARTIST', 'GP_BEETHOVEN', 'Ludwig van Beethoven', { culture: 800 }, '+800 culture toward the current civic'),
  ],
  ADMIRAL: [
    P('ADMIRAL', 'GP_ARTEMISIA', 'Artemisia', { gold: 60 }, '+60 gold (prize money)'),
    P('ADMIRAL', 'GP_THEMISTOCLES', 'Themistocles', { gold: 150 }, '+150 gold (prize money)'),
    P('ADMIRAL', 'GP_ZHENG_HE', 'Zheng He', { gold: 350 }, '+350 gold (prize money)'),
    P('ADMIRAL', 'GP_NELSON', 'Horatio Nelson', { gold: 800 }, '+800 gold (prize money)'),
  ],
  GENERAL: [
    P('GENERAL', 'GP_SUN_TZU', 'Sun Tzu', { culture: 50 }, '+50 culture (The Art of War)'),
    P('GENERAL', 'GP_BOUDICA', 'Boudica', { productionToCapital: 120 }, '+120 production in the capital'),
    P('GENERAL', 'GP_HANNIBAL', 'Hannibal Barca', { productionToCapital: 280 }, '+280 production in the capital'),
    P('GENERAL', 'GP_EL_CID', 'El Cid', { productionToCapital: 600 }, '+600 production in the capital'),
  ],
};

export const GP_CLASSES = Object.keys(GP_CLASS_DISTRICT) as GreatPersonClass[];

/** Specialist yields per district type (Civ 6-ish; only these take specialists). */
export const SPECIALIST_YIELDS: Partial<Record<DistrictId, Partial<Record<'food' | 'production' | 'gold' | 'science' | 'culture' | 'faith', number>>>> = {
  CAMPUS: { science: 2 },
  HOLY_SITE: { faith: 2 },
  COMMERCIAL_HUB: { gold: 4 },
  HARBOR: { gold: 2, food: 1 },
  THEATER_SQUARE: { culture: 2 },
  INDUSTRIAL_ZONE: { production: 2 },
};
