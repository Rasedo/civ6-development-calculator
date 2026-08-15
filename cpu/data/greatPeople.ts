
import type { DistrictId, GreatPersonClass } from '../core/types';

export const GP_CLASS_DISTRICT: Record<GreatPersonClass, DistrictId> = {
  SCIENTIST: 'CAMPUS',
  ENGINEER: 'INDUSTRIAL_ZONE',
  MERCHANT: 'COMMERCIAL_HUB',
  PROPHET: 'HOLY_SITE',
  ARTIST: 'THEATER_SQUARE',
  ADMIRAL: 'HARBOR',
  GENERAL: 'ENCAMPMENT',
  // Writers and Musicians also earn from the Theater Square (real Civ 6
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
 * Real Civ 6 (GS) great-person cost ladder. The n-th person of a class
 * (0-based, global first-come race) costs an ERA-ANCHORED threshold. These are
 * the standard-speed base GPP costs by era tier (Ancient..Information): each
 * recruitment step climbs one era. ONE ladder for every class, so both engines
 * read the SAME `gpCosts` array from the exporter — no per-class table.
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
 * GREAT WORKS. A claimed WRITER, ARTIST or MUSICIAN carries
 * GW_WORKS_PER_PERSON[kind] Great Works that seek an OPEN SLOT of the matching
 * building in the claiming civ's cities.
 * Charges with no open slot ANYWHERE degrade to the person's instant culture
 * lump, one lump per overflowing charge.
 *
 * THE REAL CIV 6 MAPPING. Reachability is a measurement tool, never a licence
 * to deviate: a building past this repo's gate horizon still gets its real
 * home, because a model trained on a deliberately-wrong mechanic has learned
 * the wrong game. Verified against the Civilization wiki ("Great Work (Civ6)",
 * per-building and per-Great-Person pages):
 *
 *   kind 0 WRITING — Amphitheater,      2 slots, +2 culture / +2 tourism, Writer   makes 2
 *   kind 1 ART     — Art Museum,        3 slots, +2 culture / +2 tourism, Artist   makes 3
 *   kind 2 MUSIC   — Broadcast Center,  1 slot,  +4 culture / +4 tourism, Musician makes 2
 *
 * (RELICS are the fourth Great Work kind and live in their own constants below
 * — they sit in a Temple slot and pay faith + tourism, not culture.)
 *
 * NO Great Work pays gold.
 */
export const GW_WRITING = 0;
export const GW_ART = 1;
export const GW_MUSIC = 2;

export const GW_BUILDINGS = ['AMPHITHEATER', 'MUSEUM', 'BROADCAST_CENTER'] as const;

export const ARTIFACT_BUILDING = 'ARCHAEOLOGICAL_MUSEUM';
export const ARTIFACT_SLOTS = 3;
export const ARTIFACT_CULTURE = 3;
export const ARTIFACT_TOURISM = 3;
export const ARCHAEOLOGIST_CHARGES = 3;
export const ARCHAEOLOGIST_CIVIC = 'NATURAL_HISTORY';

export function artifactCulture(city: { artifacts?: number }): number {
  return (city.artifacts ?? 0) * ARTIFACT_CULTURE;
}
export function artifactTourism(city: { artifacts?: number }): number {
  return (city.artifacts ?? 0) * ARTIFACT_TOURISM;
}
export const GW_SLOTS = [2, 3, 1] as const;
export const GW_WONDER_SLOTS: Record<string, readonly [number, number, number]> = {
  GREAT_LIBRARY: [2, 0, 0],
};
export const GW_WORKS_PER_PERSON = [2, 3, 2] as const;
export const GW_CULTURE = [2, 2, 4] as const;
export const GW_TOURISM = [2, 2, 4] as const;

export const GW_CLASS_KIND: Partial<Record<GreatPersonClass, number>> = {
  WRITER: GW_WRITING,
  ARTIST: GW_ART,
  MUSICIAN: GW_MUSIC,
};
export const GW_WORK_CLASSES = new Set<GreatPersonClass>(['WRITER', 'ARTIST', 'MUSICIAN']);

type GwCity = {
  greatWorksWriting?: number;
  greatWorksArt?: number;
  greatWorksMusic?: number;
  wonders?: { id: string; tileIndex: number }[];
};

export function gwCount(city: GwCity, kind: number): number {
  return (kind === GW_WRITING ? city.greatWorksWriting : kind === GW_ART ? city.greatWorksArt : city.greatWorksMusic) ?? 0;
}

function gwSet(city: GwCity, kind: number, n: number): void {
  if (kind === GW_WRITING) city.greatWorksWriting = n;
  else if (kind === GW_ART) city.greatWorksArt = n;
  else city.greatWorksMusic = n;
}

/**
 * PRINTING doubles the TOURISM of Great Works of WRITING (real
 * Civ 6 — verified against the Civilization wiki's Printing/Great Work pages;
 * it is the TOURISM that doubles, not the Amphitheater's slot count, which
 * stays at 2). Culture is untouched. `printing` is the owning civ's tech state.
 */
export const GW_PRINTING_TECH = 'PRINTING';
export const GW_PRINTING_WRITING_MULT = 2;

export function greatWorkTourism(city: GwCity, printing = false): number {
  const writing = GW_TOURISM[GW_WRITING] * (printing ? GW_PRINTING_WRITING_MULT : 1) * gwCount(city, GW_WRITING);
  return writing + GW_TOURISM[GW_ART] * gwCount(city, GW_ART) + GW_TOURISM[GW_MUSIC] * gwCount(city, GW_MUSIC);
}

/**
 * RELICS — the fourth Great Work kind. Real Civ 6 holds
 * a Relic in a TEMPLE's single slot and pays it +4 Faith and +8 Tourism, the
 * densest tourism source in the game (verified: Civilization wiki
 * "Relics"/"Great Work (Civ6)", Gathering Storm). Relics pay no culture, which
 * is why they sit outside the GW_* kind arrays above.
 *
 * SOURCE, and the one deliberate deviation: real Civ 6 creates a relic when an
 * Apostle carrying the MARTYR promotion is killed in theological combat.
 * Promotions are not modeled, and `theologicalCombatPhase` is deliberately ZERO-DRAW
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

export function relicFaith(city: { relics?: number }): number {
  return RELIC_FAITH * (city.relics ?? 0);
}

export function relicTourism(city: { relics?: number }): number {
  return RELIC_TOURISM * (city.relics ?? 0);
}

/**
 * Place ONE relic into `cities` (visited in array order — the
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

export function cityGreatWorks(city: GwCity): number {
  return gwCount(city, GW_WRITING) + gwCount(city, GW_ART) + gwCount(city, GW_MUSIC);
}

export function greatWorkCulture(city: GwCity): number {
  return GW_CULTURE[GW_WRITING] * gwCount(city, GW_WRITING) + GW_CULTURE[GW_ART] * gwCount(city, GW_ART) + GW_CULTURE[GW_MUSIC] * gwCount(city, GW_MUSIC);
}

export function placeGreatWorks(
  cities: (GwCity & { buildings: string[] })[],
  kind: number,
  extra?: (city: GwCity & { buildings: string[] }) => number,
): number {
  const building = GW_BUILDINGS[kind];
  let remaining: number = GW_WORKS_PER_PERSON[kind];
  for (const c of cities) {
    if (remaining <= 0) break;
    // Capacity is the BUILDING's slots plus any wonder's, so a wonder holds
    // works in a city with no Amphitheater at all — which is how Civ 6 works.
    const cap = (c.buildings.includes(building) ? GW_SLOTS[kind] : 0) + (extra?.(c) ?? 0);
    const used = gwCount(c, kind);
    const open = cap - used;
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
  // The Encampment takes specialists too (real Civ 6 has no
  // citizen specialist for the Encampment — this is the model stylization, a
  // production/gold garrison yield consistent with the district's character).
  // Data-driven: citySpecialistSlots keys off SPECIALIST_YIELDS, so this row
  // is the whole change.
  //
  // THIS WHOLE TABLE IS UI-ONLY. setSpecialists is a manual verb and nothing
  // in the turn loop writes city.specialists, so effectiveSpecialists is empty
  // in every simulated game and every citizen works a tile. The table is NOT
  // exported to the GPU, because assigning a citizen is a DECISION and the
  // wire has no column for it. Turning specialists into a real choice means
  // adding that column, not an engine rule.
  ENCAMPMENT: { production: 1, gold: 1 },
};
