/**
 * GREAT WORKS HELD PER HOLDER — the composers every creator, mover and reader
 * of a work goes through. The table and the layout are `cpu/data/greatWorks.ts`;
 * a city's works are `City.greatWorks`, one entry per occupied layout slot.
 *
 * CIV6 (`Building_GreatWorks`): a work sits in a slot of ONE building or
 * wonder, a slot takes the object types its slot type lists, a THEMED holder
 * pays its works twice over (ThemingYieldMultiplier / ThemingTourismMultiplier
 * 100), and Kristina's holders theme themselves once full.
 *
 * READINGS the install leaves to the DLL, kept identical on both engines:
 *  - a work lands in the FIRST open slot that takes it, holders in the
 *    table's order (buildings before wonders), slots in order;
 *  - a holder standing PILLAGED (or gone — the Palace of a captured capital)
 *    keeps and pays the works it holds and accepts nothing new;
 *  - theming doubles a work's OWN face (culture, faith, tourism), never the
 *    roster's per-work adders;
 *  - a holder themes only while it is PRESENT, pillaged or not.
 */
import type { City, GameState } from './types';
import { darkBuildings } from './yields';
import { buildingVariantFor } from '../data/buildings';
import { rowIsFor } from '../data/civilizations';
import { civOf, leaderOf } from './seats';
import {
  AUTO_THEME_ROWS, EXTRA_SLOT_ROWS, GW_HOLDERS, GW_LAYOUT, GW_LAYOUT_W, GW_THEME_ART, GW_THEME_ARTIFACT,
  GWO_CULTURE, GWO_FAITH, GWO_RELIC, GWO_TOURISM, GWO_WRITING, THEMING_MULT, gwKindObjects, gwKindOf,
  holderSlots, slotAccepts, type GreatWork,
} from '../data/greatWorks';
import { GW_PRINTING_WRITING_MULT } from '../data/greatPeople';

/** the shape every work-holding city answers with — a City, a capture's stub */
export type WorkCity = {
  seat: number;
  buildings: string[];
  districts?: City['districts'];
  pillagedBuildings?: string[];
  wonders?: { id: string; tileIndex: number }[];
  greatWorks?: GreatWork[];
};

export function gwWorks(city: { greatWorks?: GreatWork[] }): readonly GreatWork[] {
  return city.greatWorks ?? [];
}

export function gwAt(city: { greatWorks?: GreatWork[] }, slot: number): GreatWork | undefined {
  return gwWorks(city).find((w) => w.slot === slot);
}

export function gwCountObjs(city: { greatWorks?: GreatWork[] }, objs: readonly number[]): number {
  let n = 0;
  for (const w of gwWorks(city)) if (objs.includes(w.obj)) n += 1;
  return n;
}

/** works of one created KIND (0 writing / 1 art / 2 music) */
export function gwCountKind(city: { greatWorks?: GreatWork[] }, kind: number): number {
  return gwCountObjs(city, gwKindObjects(kind));
}

/** the created works — writing, art and music; a find or a Relic is not one */
export function cityGreatWorks(city: { greatWorks?: GreatWork[] }): number {
  let n = 0;
  for (const w of gwWorks(city)) if (gwKindOf(w.obj) >= 0) n += 1;
  return n;
}

/** the works of one created kind, highest slot first — the one a gift or a
 *  heist takes is the LAST placed */
export function gwLastOfKind(city: { greatWorks?: GreatWork[] }, kind: number): GreatWork | undefined {
  const objs = gwKindObjects(kind);
  let best: GreatWork | undefined;
  for (const w of gwWorks(city)) if (objs.includes(w.obj) && (!best || w.slot > best.slot)) best = w;
  return best;
}

/** how many works of each object type this city holds, indexed by object */
export function gwCountsByObj(city: { greatWorks?: GreatWork[] }): number[] {
  const out = new Array<number>(GWO_CULTURE.length).fill(0);
  for (const w of gwWorks(city)) out[w.obj] = (out[w.obj] ?? 0) + 1;
  return out;
}

/** what one city's holders currently offer: presence, openness and the
 *  seat's extra slots per holder — built once per question */
export interface WorkContext {
  present: boolean[];
  open: boolean[];
  extra: number[];
}

export function workContext(state: GameState, city: WorkCity): WorkContext {
  const dark = darkBuildings(state.map, city);
  const civ = civOf(state, city.seat);
  const leader = leaderOf(state, city.seat);
  const present: boolean[] = [];
  const open: boolean[] = [];
  const extra: number[] = [];
  GW_HOLDERS.forEach((h) => {
    let p: boolean;
    let o: boolean;
    if (h.wonder) {
      p = (city.wonders ?? []).some((w) => w.id === h.id && state.map.tiles[w.tileIndex]?.builtWonderComplete);
      o = p;
    } else {
      // CIV6 (Marae, "Has no Great Work slots"): a seat's unique copy of a
      // holder may declare none of the slots the base row does.
      p = city.buildings.includes(h.id) && !buildingVariantFor(civ, h.id)?.noGreatWorks;
      o = p && !dark.has(h.id);
    }
    present.push(p);
    open.push(o);
    let x = 0;
    for (const r of EXTRA_SLOT_ROWS) if (r.holder === h.id && rowIsFor(r, civ, leader)) x += r.amount;
    extra.push(x);
  });
  return { present, open, extra };
}

/** does this seat's copy of the holder carry this layout slot at all? */
function slotCarried(ctx: WorkContext, slot: number): boolean {
  const s = GW_LAYOUT[slot]!;
  return ctx.present[s.holder]! && (s.extraRank < 0 || s.extraRank < ctx.extra[s.holder]!);
}

/** the first slot that stands OPEN, empty and takes `obj`, or -1 */
export function gwFreeSlot(ctx: WorkContext, city: { greatWorks?: GreatWork[] }, obj: number): number {
  const taken = new Set(gwWorks(city).map((w) => w.slot));
  for (let i = 0; i < GW_LAYOUT_W; i++) {
    const s = GW_LAYOUT[i]!;
    if (!ctx.open[s.holder] || !slotCarried(ctx, i) || taken.has(i) || !slotAccepts(s.type, obj)) continue;
    return i;
  }
  return -1;
}

export function gwHasRoom(state: GameState, city: WorkCity, obj: number): boolean {
  return gwFreeSlot(workContext(state, city), city, obj) >= 0;
}

/** THE placement composer: the work lands in its first open slot, or nowhere
 *  (returns -1 and writes nothing). */
export function placeGreatWork(state: GameState, city: WorkCity, work: Omit<GreatWork, 'slot'>): number {
  const slot = gwFreeSlot(workContext(state, city), city, work.obj);
  if (slot < 0) return -1;
  const list = (city.greatWorks ??= []);
  list.push({ slot, ...work });
  list.sort((a, b) => a.slot - b.slot);
  return slot;
}

/** THE removal composer: the work leaves its slot and is returned. */
export function removeGreatWork(city: { greatWorks?: GreatWork[] }, slot: number): GreatWork | undefined {
  const list = city.greatWorks;
  if (!list) return undefined;
  const i = list.findIndex((w) => w.slot === slot);
  if (i < 0) return undefined;
  const [w] = list.splice(i, 1);
  if (list.length === 0) delete city.greatWorks;
  return w;
}

/** a work changing hands keeps everything but its slot */
export function moveGreatWork(state: GameState, from: WorkCity, slot: number, to: WorkCity): boolean {
  const w = gwAt(from, slot);
  if (!w || gwFreeSlot(workContext(state, to), to, w.obj) < 0) return false;
  removeGreatWork(from, slot);
  const { slot: _s, ...rest } = w;
  return placeGreatWork(state, to, rest) >= 0;
}

/**
 * Is holder `h` THEMED in this city? Its rule (the Art Museum: one object
 * type, three different artists; the Archaeological Museum: one era, three
 * different civilizations) over every slot the seat's copy carries, all of
 * them full — or Kristina's row: a holder with at least her count of slots,
 * all full, whatever its rule.
 */
export function holderThemed(state: GameState, ctx: WorkContext, city: WorkCity, h: number): boolean {
  if (!ctx.present[h]) return false;
  const slots = holderSlots(h).filter((s) => slotCarried(ctx, s));
  if (slots.length === 0) return false;
  const works: GreatWork[] = [];
  for (const s of slots) {
    const w = gwAt(city, s);
    if (!w) return false;
    works.push(w);
  }
  const def = GW_HOLDERS[h]!;
  let byRule = false;
  if (def.theme === GW_THEME_ART) {
    byRule = works.every((w) => w.obj === works[0]!.obj)
      && works.every((w, i) => works.every((v, j) => j <= i || v.maker !== w.maker));
  } else if (def.theme === GW_THEME_ARTIFACT) {
    byRule = works.every((w) => w.era === works[0]!.era)
      && works.every((w, i) => works.every((v, j) => j <= i || v.seat !== w.seat));
  }
  if (byRule) return true;
  const civ = civOf(state, city.seat);
  const leader = leaderOf(state, city.seat);
  return AUTO_THEME_ROWS.some((r) => r.wonder === def.wonder && slots.length >= r.slots && rowIsFor(r, civ, leader));
}

/** per layout slot, what its holder's theming multiplies the work by */
export function gwSlotMults(state: GameState, city: WorkCity): number[] {
  const ctx = workContext(state, city);
  const themed = GW_HOLDERS.map((_h, i) => holderThemed(state, ctx, city, i));
  return GW_LAYOUT.map((s) => (themed[s.holder] ? THEMING_MULT : 1));
}

/** the building-tier CULTURE and FAITH this city's works pay */
export function greatWorkYields(state: GameState, city: WorkCity): { culture: number; faith: number } {
  const works = gwWorks(city);
  if (works.length === 0) return { culture: 0, faith: 0 };
  const mult = gwSlotMults(state, city);
  let culture = 0;
  let faith = 0;
  for (const w of works) {
    culture += GWO_CULTURE[w.obj]! * mult[w.slot]!;
    faith += GWO_FAITH[w.obj]! * mult[w.slot]!;
  }
  return { culture, faith };
}

/**
 * The GENERAL half of the tourism this city's works pay: everything but a
 * Relic, PRINTING doubling a Work of Writing's, the Congress multiplier by
 * created kind, a themed holder doubling its own.
 */
export function greatWorkTourism(state: GameState, city: WorkCity, printing: boolean, kmult: readonly [number, number, number] = [1, 1, 1]): number {
  const works = gwWorks(city);
  if (works.length === 0) return 0;
  const mult = gwSlotMults(state, city);
  let t = 0;
  for (const w of works) {
    if (w.obj === GWO_RELIC) continue;
    const kind = gwKindOf(w.obj);
    t += GWO_TOURISM[w.obj]! * (w.obj === GWO_WRITING && printing ? GW_PRINTING_WRITING_MULT : 1)
      * (kind >= 0 ? kmult[kind]! : 1) * mult[w.slot]!;
  }
  return t;
}

/** the RELIGIOUS half: what this city's Relics pay, a themed holder doubling
 *  its own; the holding city's wonder multiplier is the caller's */
export function relicTourism(state: GameState, city: WorkCity): number {
  const works = gwWorks(city);
  if (!works.some((w) => w.obj === GWO_RELIC)) return 0;
  const mult = gwSlotMults(state, city);
  let t = 0;
  for (const w of works) if (w.obj === GWO_RELIC) t += GWO_TOURISM[w.obj]! * mult[w.slot]!;
  return t;
}

/**
 * Place a work in the first of `cities` (array order) with room for it —
 * the walk a Relic, a gift and a heist make. Returns the city, or undefined
 * when nowhere has room and nothing was written.
 */
export function placeGreatWorkIn(state: GameState, cities: WorkCity[], work: Omit<GreatWork, 'slot'>): WorkCity | undefined {
  for (const c of cities) if (placeGreatWork(state, c, work) >= 0) return c;
  return undefined;
}

/** Hand out held Relics — one per open slot, first city first, until the
 *  reserve or the room runs out. */
export function drainRelicReserve(state: GameState, held: number, cities: WorkCity[], seat: number): number {
  let left = held;
  while (left > 0 && placeGreatWorkIn(state, cities, { obj: GWO_RELIC, maker: -1, era: -1, seat })) left -= 1;
  return left;
}
