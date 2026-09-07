/**
 * GREAT WORKS ARE HELD PER HOLDER. CIV6 (GreatWorks.xml, Buildings.xml
 * `Building_GreatWorks`): a building or wonder declares SLOTS of one
 * `GreatWorkSlotType`, a slot type accepts a set of `GreatWorkObjectType`s
 * (`GreatWork_ValidSubTypes`), and every named work is one object type. A
 * work therefore has a HOLDER and a SLOT, which is what a theming rule reads.
 *
 * This module is a LEAF: it names buildings and wonders by id only, so the
 * exporter, the TypeScript engine and the tests all read one table.
 *
 * THE LAYOUT. Every slot a city could ever hold gets a fixed position: the
 * holders in the install's table order (buildings before wonders), each
 * holder's slot rows in order, `count` positions per row. A work's position
 * IS its holder and slot; a city's works are a sparse array over these
 * positions, and the GPU's `[.., W]` planes share the same indexing. A slot
 * row an EXTRA_GREAT_WORK_SLOTS modifier can widen (Nkisi's Palace) is laid
 * out at its widest, and the extra positions carry a rank the capacity
 * composer checks against the seat's own row.
 */
import type { CivId, LeaderId } from './seats';

/** GreatWorkObjectTypes, numbered by the install's `Value` column. */
export const GWO_SCULPTURE = 0;
export const GWO_PORTRAIT = 1;
export const GWO_LANDSCAPE = 2;
export const GWO_RELIGIOUS = 3;
export const GWO_ARTIFACT = 4;
export const GWO_WRITING = 5;
export const GWO_MUSIC = 6;
export const GWO_RELIC = 7;
export const GWO_COUNT = 8;
export const GWO_ART = [GWO_SCULPTURE, GWO_PORTRAIT, GWO_LANDSCAPE, GWO_RELIGIOUS] as const;

/** GreatWorkSlotTypes. */
export const GWS_WRITING = 0;
export const GWS_ART = 1;
export const GWS_MUSIC = 2;
export const GWS_ARTIFACT = 3;
export const GWS_RELIC = 4;
export const GWS_CATHEDRAL = 5;
export const GWS_PALACE = 6;
export const GWS_COUNT = 7;

/** GreatWork_ValidSubTypes: the object types each slot type takes. */
export const GWS_ACCEPTS: readonly (readonly number[])[] = [
  [GWO_WRITING],
  [...GWO_ART],
  [GWO_MUSIC],
  [GWO_ARTIFACT],
  [GWO_RELIC],
  [GWO_RELIGIOUS],
  [GWO_SCULPTURE, GWO_PORTRAIT, GWO_LANDSCAPE, GWO_RELIGIOUS, GWO_WRITING, GWO_MUSIC, GWO_RELIC, GWO_ARTIFACT],
];

export function slotAccepts(slotType: number, obj: number): boolean {
  return GWS_ACCEPTS[slotType]?.includes(obj) ?? false;
}

/** The three created KINDS the deal item, the Great Person classes and the
 *  Congress multiplier speak in: 0 writing, 1 art, 2 music; -1 for an
 *  Artifact or a Relic. */
export const GW_KIND_WRITING = 0;
export const GW_KIND_ART = 1;
export const GW_KIND_MUSIC = 2;
export const GW_KINDS = 3;
export function gwKindOf(obj: number): number {
  if (obj === GWO_WRITING) return GW_KIND_WRITING;
  if (obj === GWO_MUSIC) return GW_KIND_MUSIC;
  if (obj >= GWO_SCULPTURE && obj <= GWO_RELIGIOUS) return GW_KIND_ART;
  return -1;
}
/** the object types of one created kind, in object order */
export function gwKindObjects(kind: number): readonly number[] {
  return kind === GW_KIND_WRITING ? [GWO_WRITING] : kind === GW_KIND_MUSIC ? [GWO_MUSIC] : GWO_ART;
}

/**
 * Per-object yields. CIV6 (GreatWorks.xml, GS layer last): every Work of
 * Writing +2 Culture / 2 Tourism, every Work of Art (all four kinds) +3
 * Culture / 2 Tourism, Music +4 / 4, an Artifact +3 / 3, a Relic +4 Faith /
 * 8 Tourism and no Culture. Indexed by object type.
 */
export const GWO_CULTURE: readonly number[] = [3, 3, 3, 3, 3, 2, 4, 0];
export const GWO_FAITH: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 4];
export const GWO_TOURISM: readonly number[] = [2, 2, 2, 2, 3, 2, 4, 8];

/** The theming RULE a holder's row declares (`Building_GreatWorks`). */
export const GW_THEME_NONE = 0;
/** ThemingSameObjectType + ThemingUniquePerson — the Art Museum. */
export const GW_THEME_ART = 1;
/** ThemingSameEras + ThemingUniqueCivs — the Archaeological Museum. */
export const GW_THEME_ARTIFACT = 2;
/** A THEMED holder pays its works' base yields and tourism this many times
 *  over (ThemingYieldMultiplier / ThemingTourismMultiplier 100). */
export const THEMING_MULT = 2;

export interface GreatWorkHolderDef {
  /** a building id (`BUILDINGS`) or a wonder id (`BUILT_WONDERS`) */
  id: string;
  wonder: boolean;
  slots: readonly { type: number; count: number }[];
  theme: number;
}

/** CIV6 `Building_GreatWorks`, Base <- Expansion1 <- Expansion2 <- the civ
 *  DLC that carries a row, restricted to the holders this engine builds, in
 *  the install's row order. The Hermitage's row is GREATWORKSLOT_ART with
 *  no object restriction, and the Apadana's is two GREATWORKSLOT_PALACE
 *  slots, which take any object. */
export const GW_HOLDERS: readonly GreatWorkHolderDef[] = [
  { id: 'PALACE', wonder: false, slots: [{ type: GWS_PALACE, count: 1 }], theme: GW_THEME_NONE },
  { id: 'TEMPLE', wonder: false, slots: [{ type: GWS_RELIC, count: 1 }], theme: GW_THEME_NONE },
  { id: 'AMPHITHEATER', wonder: false, slots: [{ type: GWS_WRITING, count: 2 }], theme: GW_THEME_NONE },
  { id: 'MUSEUM', wonder: false, slots: [{ type: GWS_ART, count: 3 }], theme: GW_THEME_ART },
  { id: 'ARCHAEOLOGICAL_MUSEUM', wonder: false, slots: [{ type: GWS_ARTIFACT, count: 3 }], theme: GW_THEME_ARTIFACT },
  { id: 'BROADCAST_CENTER', wonder: false, slots: [{ type: GWS_MUSIC, count: 1 }], theme: GW_THEME_NONE },
  { id: 'CATHEDRAL', wonder: false, slots: [{ type: GWS_CATHEDRAL, count: 1 }], theme: GW_THEME_NONE },
  { id: 'NATIONAL_HISTORY_MUSEUM', wonder: false, slots: [{ type: GWS_PALACE, count: 4 }], theme: GW_THEME_NONE },
  { id: 'GREAT_LIBRARY', wonder: true, slots: [{ type: GWS_WRITING, count: 2 }], theme: GW_THEME_NONE },
  { id: 'MONT_ST_MICHEL', wonder: true, slots: [{ type: GWS_RELIC, count: 2 }], theme: GW_THEME_NONE },
  { id: 'BOLSHOI_THEATRE', wonder: true, slots: [{ type: GWS_WRITING, count: 1 }, { type: GWS_MUSIC, count: 1 }], theme: GW_THEME_NONE },
  { id: 'OXFORD_UNIVERSITY', wonder: true, slots: [{ type: GWS_WRITING, count: 2 }], theme: GW_THEME_NONE },
  { id: 'HERMITAGE', wonder: true, slots: [{ type: GWS_ART, count: 4 }], theme: GW_THEME_NONE },
  { id: 'ST_BASILS_CATHEDRAL', wonder: true, slots: [{ type: GWS_RELIC, count: 3 }], theme: GW_THEME_NONE },
  { id: 'APADANA', wonder: true, slots: [{ type: GWS_PALACE, count: 2 }], theme: GW_THEME_NONE },
];

/** CIV6 (EFFECT_ADJUST_..._EXTRA_GREAT_WORK_SLOTS): a roster row widening one
 *  holder's slot row for its seat. The layout carries every row at its widest. */
export interface ExtraSlotRow {
  civ?: CivId;
  leader?: LeaderId;
  holder: string;
  type: number;
  amount: number;
}
/** CIV6 (Nkisi, TRAIT_EXTRA_PALACE_SLOTS): BuildingType PALACE,
 *  GreatWorkSlotType PALACE, Amount 4. */
export const EXTRA_SLOT_ROWS: readonly ExtraSlotRow[] = [
  { civ: 'KONGO', holder: 'PALACE', type: GWS_PALACE, amount: 4 },
];

export interface GreatWorkSlotDef {
  /** index into `GW_HOLDERS` */
  holder: number;
  type: number;
  /** -1 for a slot the holder's own row declares; 0.. for one an
   *  `EXTRA_SLOT_ROWS` row opens, in rank order */
  extraRank: number;
}

function buildLayout(): GreatWorkSlotDef[] {
  const out: GreatWorkSlotDef[] = [];
  GW_HOLDERS.forEach((h, hi) => {
    const seen = new Set<number>();
    for (const s of h.slots) {
      // two slot rows of one holder never take the same object, so a work's
      // row is decided by its object alone
      for (const o of GWS_ACCEPTS[s.type]!) {
        if (seen.has(o)) throw new Error(`great-work holder ${h.id}: two slot rows take object ${o}`);
        seen.add(o);
      }
      for (let i = 0; i < s.count; i++) out.push({ holder: hi, type: s.type, extraRank: -1 });
      const widest = EXTRA_SLOT_ROWS
        .filter((r) => r.holder === h.id && r.type === s.type)
        .reduce((m, r) => Math.max(m, r.amount), 0);
      for (let i = 0; i < widest; i++) out.push({ holder: hi, type: s.type, extraRank: i });
    }
  });
  return out;
}

/** every great-work position a city can hold, in holder-then-slot order */
export const GW_LAYOUT: readonly GreatWorkSlotDef[] = buildLayout();
export const GW_LAYOUT_W = GW_LAYOUT.length;

/** the positions of one holder, in slot order */
export function holderSlots(holder: number): number[] {
  const out: number[] = [];
  GW_LAYOUT.forEach((s, i) => { if (s.holder === holder) out.push(i); });
  return out;
}

/** CIV6 (Kristina, EFFECT_ADJUST_AUTO_THEMED_BUILDINGS_WITH_X_SLOTS): a holder
 *  with at least `slots` slots, all filled, is themed whatever its rule. */
export interface AutoThemeRow {
  civ?: CivId;
  leader?: LeaderId;
  slots: number;
  wonder: boolean;
}
/** AUTO_THEME_AT_LEAST_3_SLOTS (Amount 3, IsWonder false) and
 *  AUTO_THEME_AT_LEAST_2_SLOTS (Amount 2, IsWonder true). */
export const AUTO_THEME_ROWS: readonly AutoThemeRow[] = [
  { leader: 'KRISTINA', slots: 3, wonder: false },
  { leader: 'KRISTINA', slots: 2, wonder: true },
];

/**
 * ONE WORK, as both engines store it: its object type, who made it (the
 * creating Great Person's index within its class roster; -1 for a find or a
 * Relic), the era a find was buried in (-1 otherwise), and the civilization
 * it came from (a find's buried event, a created work's maker's seat).
 */
export interface GreatWork {
  slot: number;
  obj: number;
  maker: number;
  era: number;
  seat: number;
}
