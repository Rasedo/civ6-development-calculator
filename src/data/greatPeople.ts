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
  // the gpEffects tensor rectangular). Their real output is a Great Work of
  // Writing / Music, which ROUND B7 landed (slots + per-turn yield); the
  // per-person `culture` value below is now only the OVERFLOW lump a charge
  // falls back to when no slot is open anywhere. Tourism stays absent.
  // Recorded in gpu/ROUND_B2_LOG.md; slot model in the B-20 block below.
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
* B-20: GREAT WORKS. A claimed WRITER, ARTIST or MUSICIAN no longer applies an
 * instant culture lump — each carries GW_WORKS_PER_PERSON[kind] Great Works
 * that seek an OPEN SLOT of the matching building in the claiming civ's cities.
 * Charges with no open slot ANYWHERE degrade to the person's instant culture
 * lump (the pre-B7 behaviour), one lump per overflowing charge.
 *
 * #73 (2026-07-27) — THE REAL CIV 6 MAPPING. This block previously held music
 * in the MUSEUM with 2 slots and left ARTIST an instant-lump class, justified
 * by the Broadcast Center sitting past this repo's 250-turn gate horizon. That
 * justification is RETIRED by owner directive: gate reachability is a
 * measurement tool, never a licence to deviate from Civ 6 — the goal is RL on a
 * faithful reproduction, and a model trained on a deliberately-wrong mechanic
 * has learned the wrong game. The real Gathering Storm mapping, verified
 * against the Civilization wiki ("Great Work (Civ6)", per-building and
 * per-Great-Person pages):
 *
 *   kind 0 WRITING — Amphitheater,      2 slots, +2 culture / +2 tourism, Writer   makes 2
 *   kind 1 ART     — Art Museum,        3 slots, +2 culture / +2 tourism, Artist   makes 3
 *   kind 2 MUSIC   — Broadcast Center,  1 slot,  +4 culture / +4 tourism, Musician makes 2
 *
 * (RELICS are the fourth Great Work kind and live in their own constants below
 * — they sit in a Temple slot and pay faith + tourism, not culture.)
 *
 * NO Great Work pays gold. The B7-era "music +1 culture/+1 gold split" note was
 * a stylization with no basis in the game and stays REFUTED.
 */
/** The three slotted Great Work kinds, in the order both engines index them. */
export const GW_WRITING = 0;
export const GW_ART = 1;
export const GW_MUSIC = 2;

/** Per-kind building, slot count, works per Great Person, culture and tourism. */
export const GW_BUILDINGS = ['AMPHITHEATER', 'MUSEUM', 'BROADCAST_CENTER'] as const;
export const GW_SLOTS = [2, 3, 1] as const;
export const GW_WORKS_PER_PERSON = [2, 3, 2] as const;
export const GW_CULTURE = [2, 2, 4] as const;
export const GW_TOURISM = [2, 2, 4] as const;

/** The Great Person class that produces each kind (the work-carrying classes). */
export const GW_CLASS_KIND: Partial<Record<GreatPersonClass, number>> = {
  WRITER: GW_WRITING,
  ARTIST: GW_ART,
  MUSICIAN: GW_MUSIC,
};
/** Classes whose people carry Great Works (vs. the instant-lump classes). */
export const GW_WORK_CLASSES = new Set<GreatPersonClass>(['WRITER', 'ARTIST', 'MUSICIAN']);

type GwCity = { greatWorksWriting?: number; greatWorksArt?: number; greatWorksMusic?: number };

/** The per-kind slotted count of a city, in kind order. */
export function gwCount(city: GwCity, kind: number): number {
  return (kind === GW_WRITING ? city.greatWorksWriting : kind === GW_ART ? city.greatWorksArt : city.greatWorksMusic) ?? 0;
}

function gwSet(city: GwCity, kind: number, n: number): void {
  if (kind === GW_WRITING) city.greatWorksWriting = n;
  else if (kind === GW_ART) city.greatWorksArt = n;
  else city.greatWorksMusic = n;
}

/**
 * B-20 (#74): PRINTING doubles the TOURISM of Great Works of WRITING (real
 * Civ 6 — verified against the Civilization wiki's Printing/Great Work pages;
 * it is the TOURISM that doubles, not the Amphitheater's slot count, which
 * stays at 2). Culture is untouched. `printing` is the owning civ's tech state.
 */
export const GW_PRINTING_TECH = 'PRINTING';
export const GW_PRINTING_WRITING_MULT = 2;

/** B-20 (#71): the per-turn TOURISM a city's Great Works generate. */
export function greatWorkTourism(city: GwCity, printing = false): number {
  const writing = GW_TOURISM[GW_WRITING] * (printing ? GW_PRINTING_WRITING_MULT : 1) * gwCount(city, GW_WRITING);
  return writing + GW_TOURISM[GW_ART] * gwCount(city, GW_ART) + GW_TOURISM[GW_MUSIC] * gwCount(city, GW_MUSIC);
}

/**
 * B-20 (#73, 2026-07-27): RELICS — the fourth Great Work kind. Real Civ 6 holds
 * a Relic in a TEMPLE's single slot and pays it +4 Faith and +8 Tourism, the
 * densest tourism source in the game (verified: Civilization wiki
 * "Relics"/"Great Work (Civ6)", Gathering Storm). Relics pay no culture, which
 * is why they sit outside the GW_* kind arrays above.
 *
 * SOURCE, and the one deliberate deviation: real Civ 6 creates a relic when an
 * Apostle carrying the MARTYR promotion is killed in theological combat.
 * Promotions are not modeled, and `theologicalCombat` is deliberately ZERO-DRAW
 * (a conditional RNG draw there would have to be mirrored draw-for-draw across
 * both engines), so rolling for Martyr is not available. Every APOSTLE killed
 * in theological combat martyrs instead. That OVERSTATES relic frequency by
 * roughly the promotion odds (~1 in 7); it is recorded rather than hidden, and
 * it keeps the routine draw-count exact. A dead MISSIONARY never yields a relic.
 */
export const RELIC_BUILDING = 'TEMPLE';
export const RELIC_SLOTS_PER_BUILDING = 1;
export const RELIC_FAITH = 4;
export const RELIC_TOURISM = 8;

/** B-20 (#73): the per-turn FAITH a city's relics pay. */
export function relicFaith(city: { relics?: number }): number {
  return RELIC_FAITH * (city.relics ?? 0);
}

/** B-20 (#73): the per-turn TOURISM a city's relics pay. */
export function relicTourism(city: { relics?: number }): number {
  return RELIC_TOURISM * (city.relics ?? 0);
}

/**
 * B-20 (#73): place ONE relic into `cities` (visited in array order — the
 * acquisition/slot order both engines share). It fills the LOWEST city with an
 * open TEMPLE relic slot. Returns true when it found a home; a relic with no
 * open slot anywhere is LOST (real Civ 6 would hold it in reserve for a later
 * slot — that storage is a recorded simplification, not modeled).
 */
export function placeRelic(cities: { buildings: string[]; relics?: number }[]): boolean {
  for (const c of cities) {
    if (!c.buildings.includes(RELIC_BUILDING)) continue;
    const used = c.relics ?? 0;
    if (used >= RELIC_SLOTS_PER_BUILDING) continue;
    c.relics = used + 1;
    return true;
  }
  return false;
}

/** Great works stored in a city (all kinds) — the total slotted count. */
export function cityGreatWorks(city: GwCity): number {
  return gwCount(city, GW_WRITING) + gwCount(city, GW_ART) + gwCount(city, GW_MUSIC);
}

/**
 * #70/S1: the building-tier CULTURE a city's slotted works pay, by kind.
 * Both engines add this single sum at the buildings-bucket position in this
 * association — culture += (writingTerm + artTerm + musicTerm).
 */
export function greatWorkCulture(city: GwCity): number {
  return GW_CULTURE[GW_WRITING] * gwCount(city, GW_WRITING) + GW_CULTURE[GW_ART] * gwCount(city, GW_ART) + GW_CULTURE[GW_MUSIC] * gwCount(city, GW_MUSIC);
}

/**
 * B-20: place a Great Person's GW_WORKS_PER_PERSON[kind] works into `cities`
 * (visited in array order — the acquisition/slot order both engines share).
 * Each work fills the LOWEST city with an open slot of the matching building,
 * lowest slot first; the per-city count is bumped. Returns the count of works
 * that found NO slot (the overflow charges that fall back to a lump).
 */
export function placeGreatWorks(cities: (GwCity & { buildings: string[] })[], kind: number): number {
  const building = GW_BUILDINGS[kind];
  let remaining: number = GW_WORKS_PER_PERSON[kind];
  for (const c of cities) {
    if (remaining <= 0) break;
    if (!c.buildings.includes(building)) continue;
    const used = gwCount(c, kind);
    const open = GW_SLOTS[kind] - used;
    if (open <= 0) continue;
    const take = Math.min(open, remaining);
    gwSet(c, kind, used + take);
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
