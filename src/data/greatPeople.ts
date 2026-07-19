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
  // B-19: Writers and Musicians also earn from the Theater Square (real Civ 6
  // splits the three culture classes across the same district). Appended last
  // so PROPHET stays index 3.
  WRITER: 'THEATER_SQUARE',
  MUSICIAN: 'THEATER_SQUARE',
};

export const GP_CLASS_NAMES: Record<GreatPersonClass, string> = {
  SCIENTIST: 'Great Scientist',
  ENGINEER: 'Great Engineer',
  MERCHANT: 'Great Merchant',
  PROPHET: 'Great Prophet',
  ARTIST: 'Great Artist',
  ADMIRAL: 'Great Admiral',
  GENERAL: 'Great General',
  WRITER: 'Great Writer',
  MUSICIAN: 'Great Musician',
};

/**
 * B-19: real Civ 6 (GS) great-person cost ladder. The n-th person of a class
 * (0-based, global first-come race) costs an ERA-ANCHORED threshold, not the
 * old flat 60·2^n exponential. These are the standard-speed base GPP costs by
 * era tier (Ancient..Information): each recruitment step climbs one era. The
 * ladder is shared across every class (as the old formula was), so both
 * engines read the SAME `gpCosts` array from the exporter — no per-class table.
 */
export const GP_COST_LADDER = [60, 120, 200, 290, 390, 500, 620, 750];

/** Point cost of the n-th person of a class (0-based). Past the ladder end the
 * top era cost holds (rosters never exceed the ladder length today). */
export function gpCost(n: number): number {
  return GP_COST_LADDER[Math.min(n, GP_COST_LADDER.length - 1)];
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
  // B-19: per-era Writer/Musician rosters (4 each, one per era tier — keeps
  // the gpEffects tensor rectangular). B-20 degradation: their real output is
  // a Great Work of Writing / Music (culture + tourism, slotted into a
  // building). Tourism is absent and Great-Work slots are deferred, so each
  // lands as an INSTANT culture lump toward the current civic (the Artist
  // channel). Recorded in gpu/ROUND_B2_LOG.md.
  WRITER: [
    P('WRITER', 'GP_LI_BAI', 'Li Bai', { culture: 45 }, '+45 culture toward the current civic'),
    P('WRITER', 'GP_CHAUCER', 'Geoffrey Chaucer', { culture: 110 }, '+110 culture toward the current civic'),
    P('WRITER', 'GP_SHELLEY', 'Mary Shelley', { culture: 260 }, '+260 culture toward the current civic'),
    P('WRITER', 'GP_TOLSTOY', 'Leo Tolstoy', { culture: 600 }, '+600 culture toward the current civic'),
  ],
  MUSICIAN: [
    P('MUSICIAN', 'GP_VIVALDI', 'Antonio Vivaldi', { culture: 50 }, '+50 culture toward the current civic'),
    P('MUSICIAN', 'GP_MOZART', 'Wolfgang Amadeus Mozart', { culture: 130 }, '+130 culture toward the current civic'),
    P('MUSICIAN', 'GP_CHOPIN', 'Frederic Chopin', { culture: 300 }, '+300 culture toward the current civic'),
    P('MUSICIAN', 'GP_TCHAIKOVSKY', 'Pyotr Tchaikovsky', { culture: 700 }, '+700 culture toward the current civic'),
  ],
};

export const GP_CLASSES = Object.keys(GP_CLASS_DISTRICT) as GreatPersonClass[];

/**
 * B-20 (Round B7): Great Works. A claimed WRITER or MUSICIAN no longer applies
 * an instant culture lump — each carries WORKS_PER_PERSON Great Works that seek
 * an OPEN SLOT in the claiming civ's cities. AMPHITHEATER holds writing works;
 * MUSEUM (the later Theater-line building — real Civ 6 splits music into the
 * Broadcast Center, but that tier is unlocked far past the gate horizon, so the
 * earlier Theater-line building carries music works here and the ARTIST-only Art
 * Museum slots are repurposed since ARTIST stays instant-lump) holds music
 * works. Each such building offers SLOTS_PER_BUILDING slots. A slotted work
 * yields GREAT_WORK_CULTURE culture/turn as a building-tier city yield (writing
 * and music both +2 culture — the music +1 culture/+1 gold split is a recorded
 * residual, cheap to add since the counts are tracked separately). Charges with
 * no open slot ANYWHERE degrade to the person's instant culture lump (the pre-B7
 * behaviour), one lump per overflowing charge. ARTIST stays the instant class.
 */
export const GW_WRITING_BUILDING = 'AMPHITHEATER';
export const GW_MUSIC_BUILDING = 'MUSEUM';
export const WORKS_PER_PERSON = 2;
export const SLOTS_PER_BUILDING = 2;
export const GREAT_WORK_CULTURE = 2;
/** Classes whose people carry Great Works (vs. the instant-lump classes). */
export const GW_WORK_CLASSES = new Set<GreatPersonClass>(['WRITER', 'MUSICIAN']);

/** Great works stored in a city (writing + music) — the +GREAT_WORK_CULTURE yield count. */
export function cityGreatWorks(city: { greatWorksWriting?: number; greatWorksMusic?: number }): number {
  return (city.greatWorksWriting ?? 0) + (city.greatWorksMusic ?? 0);
}

/**
 * B-20: place a Great Person's WORKS_PER_PERSON works into `cities` (visited in
 * array order — state.cities for the player, rival.cities for a rival, the
 * acquisition/slot order both engines share). Each work fills the LOWEST city
 * with an open slot of the matching building (AMPHITHEATER for writing, MUSEUM
 * for music), lowest slot first; the per-city count is bumped. Returns the count
 * of works that found NO slot (the overflow charges that fall back to a lump).
 */
export function placeGreatWorks(
  cities: { buildings: string[]; greatWorksWriting?: number; greatWorksMusic?: number }[],
  writing: boolean,
): number {
  const building = writing ? GW_WRITING_BUILDING : GW_MUSIC_BUILDING;
  let remaining = WORKS_PER_PERSON;
  for (const c of cities) {
    if (remaining <= 0) break;
    if (!c.buildings.includes(building)) continue;
    const used = (writing ? c.greatWorksWriting : c.greatWorksMusic) ?? 0;
    const open = SLOTS_PER_BUILDING - used;
    if (open <= 0) continue;
    const take = Math.min(open, remaining);
    if (writing) c.greatWorksWriting = used + take;
    else c.greatWorksMusic = used + take;
    remaining -= take;
  }
  return remaining;
}

/** Specialist yields per district type (Civ 6-ish; only these take specialists). */
export const SPECIALIST_YIELDS: Partial<Record<DistrictId, Partial<Record<'food' | 'production' | 'gold' | 'science' | 'culture' | 'faith', number>>>> = {
  CAMPUS: { science: 2 },
  HOLY_SITE: { faith: 2 },
  COMMERCIAL_HUB: { gold: 4 },
  HARBOR: { gold: 2, food: 1 },
  THEATER_SQUARE: { culture: 2 },
  INDUSTRIAL_ZONE: { production: 2 },
  // B-17 (ROUND B7): the Encampment takes specialists too (real Civ 6 has no
  // citizen specialist for the Encampment — this is the model stylization, a
  // production/gold garrison yield consistent with the district's character).
  // Data-driven: citySpecialistSlots keys off SPECIALIST_YIELDS, so this row
  // is the whole change. Specialists are never assigned in the scripted gate
  // (setSpecialists is a manual/UI action), so this is inert for parity.
  ENCAMPMENT: { production: 1, gold: 1 },
};
