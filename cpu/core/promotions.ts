/**
 * The promotion LADDER and the promotion EFFECTS, one body each.
 *
 * A unit's `promos` is a bitmask over the rows of its OWN class list
 * (`promoRows`), so bit k is column k of the PROMOTE head on both engines. A
 * unit that has no class (every civilian, and the Missionary) never promotes.
 */
import type { GameState, Tile, Unit } from './types';
import { neighbors } from '../../world/hex';
import {
  PROMOTIONS, PROMO_INDEX, UNIT_PROMO_CLASS, classBitOf, promoRows,
  type PromoDef, type PromoKind,
} from '../data/promotions';
import { UNIT_HP } from '../data/units';

/** CIV6: "A unit will require an amount of XP equal to 15 times the level it
 *  is currently on to reach the next level (a brand new unit starts at level
 *  1)... A unit reaches its maximum level at level 8 when it earns all 7
 *  possible Promotions." */
export const XP_PER_LEVEL = 15;
export const MAX_LEVEL = 8;

/** CIV6: "Upon selecting a promotion, a unit recovers 50 HP and its turn
 *  ends." */
export const PROMOTE_HEAL = 50;

/** CIV6: "combat XP granted in battles between units is capped at 8 XP
 *  maximum" — city combat is not capped. */
export const XP_BATTLE_CAP = 8;
/** CIV6: "+1 XP if this is a ranged battle. +2 XP if this is a non-ranged
 *  battle. +1 XP for the unit that initiates the combat." */
export const XP_RANGED_BATTLE = 1;
export const XP_MELEE_BATTLE = 2;
export const XP_INITIATOR = 1;
/** CIV6 city combat, base before modifiers: capture 10, attacking 3,
 *  defending 2, and "The attack that reduces the city's HP to 0 always grants
 *  10 XP". */
export const XP_CITY_ATTACK = 3;
export const XP_CITY_DEFEND = 2;
export const XP_CITY_FELLED = 10;
export const XP_CITY_CAPTURE = 10;
/** CIV6: fighting Barbarians "only obeys the XP rules up until the units
 *  reach level 2... Afterward, every battle against Barbarians and Free City
 *  units only grants 1 XP". */
export const XP_BARB_VETERAN = 1;

/**
 * CIV6 XP from a battle between units: "The base amount of XP a unit can
 * receive after a battle is calculated by dividing the Combat Strength of the
 * enemy by the Combat Strength of that unit. If one of the units is dead, the
 * base XP is multiplied by 2", then "+1 XP if this is a ranged battle. +2 XP
 * if this is a non-ranged battle. +1 XP for the unit that initiates", then the
 * percentage modifiers, then "rounded up or down to the next closest integer
 * (0.5 is rounded up to 1)", then the cap.
 *
 * EXACT INTEGER ARITHMETIC, on purpose: the only fraction in the rule is
 * foeCS/ownCS, so the whole award is one rational and both engines round the
 * same numerator over the same denominator. A float pipeline would put an
 * f32/f64 split on a .5 boundary.
 */
export function battleXp(
  ownCS: number, foeCS: number,
  o: { foeDied: boolean; ranged: boolean; initiated: boolean; pct: number; mult: number },
): number {
  if (ownCS <= 0) return 0;
  const adds = (o.ranged ? XP_RANGED_BATTLE : XP_MELEE_BATTLE) + (o.initiated ? XP_INITIATOR : 0);
  const num = (foeCS * (o.foeDied ? 2 : 1) + adds * ownCS) * (100 + o.pct) * o.mult;
  const den = ownCS * 100;
  return Math.min(XP_BATTLE_CAP, Math.floor((2 * num + den) / (2 * den)));
}

/** CIV6 city combat: a flat base, the same percentage modifiers, and no cap. */
export function cityXp(base: number, pct: number, mult: number): number {
  const num = base * (100 + pct) * mult;
  return Math.floor((2 * num + 100) / 200);
}

/** CIV6: XP "will be further modified by other percentage-based XP modifiers,
 *  mainly from appropriate buildings" — the training city's Encampment and
 *  Harbor lines, summed and carried by the unit for life. */
export function unitXpPct(unit: { xpPct?: number }): number {
  return unit.xpPct ?? 0;
}

/** bank XP toward the next level. CIV6: a unit standing at its threshold
 *  "won't earn new XP until it finishes the level-up process", and the excess
 *  above a level "will not transfer" — so the pool clamps at the requirement
 *  and stops. */
export function bankXp(unit: Unit, amount: number): void {
  const need = xpToNextLevel(unit);
  if (need <= 0) return;
  const have = unit.xp ?? 0;
  if (have >= need) return;
  unit.xp = Math.min(need, have + amount);
}

export function promoClassOf(unitType: string): string | undefined {
  return UNIT_PROMO_CLASS[unitType];
}

/** the rows of a unit's own class list, in wire-column order. */
export function unitPromoRows(unit: { type: string }): readonly PromoDef[] {
  const c = promoClassOf(unit.type);
  return c ? promoRows(c as never) : [];
}

export function unitLevel(unit: { level?: number }): number {
  return unit.level ?? 1;
}

/** the XP this unit still owes for its next level; 0 once it is maxed. */
export function xpToNextLevel(unit: { level?: number }): number {
  const lvl = unitLevel(unit);
  return lvl >= MAX_LEVEL ? 0 : XP_PER_LEVEL * lvl;
}

/** has the unit banked its next level and not yet spent it? */
export function promoReady(unit: { level?: number; xp?: number; type: string }): boolean {
  if (unitPromoRows(unit).length === 0) return false;
  const need = xpToNextLevel(unit);
  return need > 0 && (unit.xp ?? 0) >= need;
}

export function hasPromo(unit: { promos?: number; type: string }, id: string): boolean {
  const rows = unitPromoRows(unit);
  const k = rows.findIndex((p) => p.id === id);
  return k >= 0 && ((unit.promos ?? 0) & (1 << k)) !== 0;
}

/** may this unit take column k of its own class list right now? The row must
 *  exist, be unheld, and have one of its prerequisites already held. */
export function promoAvailable(
  unit: { promos?: number; promoOffer?: number; type: string }, k: number,
): boolean {
  const rows = unitPromoRows(unit);
  if (k < 0 || k >= rows.length) return false;
  const held = unit.promos ?? 0;
  if ((held & (1 << k)) !== 0) return false;
  // CIV6 (Apostle): the three drawn columns are the whole choice. 0 = the unit
  // was handed no offer and every legal row is open to it.
  const offer = unit.promoOffer ?? 0;
  if (offer !== 0 && (offer & (1 << k)) === 0) return false;
  const req = rows[k].requires;
  if (req.length === 0) return true;
  return req.some((id) => hasPromo(unit, id));
}

/** every effect the unit's held promotions carry. */
function heldEffects(unit: { promos?: number; type: string }): { kind: PromoKind; v: number; mask: number }[] {
  const held = unit.promos ?? 0;
  if (held === 0) return [];
  const out: { kind: PromoKind; v: number; mask: number }[] = [];
  unitPromoRows(unit).forEach((p, k) => {
    if ((held & (1 << k)) === 0) return;
    for (const e of p.effects) out.push({ kind: e.kind, v: e.v ?? 0, mask: e.mask ?? 0 });
  });
  return out;
}

/** the summed value of one non-combat effect kind (MOVES, SIGHT, RANGE, ...). */
export function promoValue(unit: { promos?: number; type: string }, kind: PromoKind): number {
  let n = 0;
  for (const e of heldEffects(unit)) if (e.kind === kind) n += e.v;
  return n;
}

export function promoFlag(unit: { promos?: number; type: string }, kind: PromoKind): boolean {
  return heldEffects(unit).some((e) => e.kind === kind);
}

/** the value of a ONCE-ONLY promotion the first time it fires, and 0 for ever
 *  after — the column is stamped into `promoUsed` as it pays. */
export function promoFirstUse(
  unit: { promos?: number; promoUsed?: number; type: string },
  kind: PromoKind,
): number {
  const held = unit.promos ?? 0;
  const used = unit.promoUsed ?? 0;
  const rows = unitPromoRows(unit);
  for (let k = 0; k < rows.length; k++) {
    if ((held & (1 << k)) === 0 || (used & (1 << k)) !== 0) continue;
    const e = rows[k].effects.find((x) => x.kind === kind);
    if (!e) continue;
    unit.promoUsed = used | (1 << k);
    return e.v ?? 0;
  }
  return 0;
}

/** the multiplier a promotion applies to flanking or support RECEIVED; 1 when
 *  the unit holds neither. CIV6 (Flanking and Support): a unit with a higher
 *  stack "benefit[s] from the higher combat bonuses for themselves, but are
 *  not better at providing Flanking or Support to other units." */
export function promoStackMult(unit: { promos?: number; type: string }, kind: PromoKind): number {
  let m = 1;
  for (const e of heldEffects(unit)) if (e.kind === kind && e.v > m) m = e.v;
  return m;
}

export interface PromoCtx {
  /** this unit is the ATTACKER in the roll being assembled. */
  attacking: boolean;
  /** the ATTACK is a ranged one (the attacker's own class decides it). */
  ranged?: boolean;
  /** the chassis on the other side; absent when the other side is a city. */
  foeType?: string;
  foeDamaged?: boolean;
  foeFortified?: boolean;
  /** the OTHER side stands in a district. */
  foeInDistrict?: boolean;
  /** the other side IS a city or a defensible district. */
  vsCity?: boolean;
  /** the tile THIS unit stands on. */
  tile?: Tile;
}

const TERRAIN_COVER = (t: Tile | undefined): boolean =>
  !!t && (t.elevation === 'HILLS' || t.feature === 'WOODS' || t.feature === 'RAINFOREST' || t.feature === 'MARSH');

const IN_DISTRICT = (t: Tile | undefined): boolean =>
  !!t && (t.district !== undefined && t.district !== null || t.improvement === 'FORT');

/** the whole Combat Strength adder this unit's promotions contribute to ONE
 *  roll. An integer add, joining the assembly beside the support terms. */
export function promoCS(unit: { promos?: number; type: string }, ctx: PromoCtx): number {
  const held = heldEffects(unit);
  if (held.length === 0) return 0;
  const foeBit = ctx.foeType ? classBitOf(ctx.foeType) : 0;
  let n = 0;
  for (const e of held) {
    switch (e.kind) {
      case 'CS_ALL': n += e.v; break;
      case 'CS_VS_CLASS_ATK': if (ctx.attacking && (e.mask & foeBit) !== 0) n += e.v; break;
      case 'CS_VS_CLASS_ANY': if ((e.mask & foeBit) !== 0) n += e.v; break;
      case 'CS_DEF_VS_CLASS': if (!ctx.attacking && (e.mask & foeBit) !== 0) n += e.v; break;
      case 'CS_DEF_RANGED': if (!ctx.attacking && ctx.ranged) n += e.v; break;
      case 'CS_DEF_ANY': if (!ctx.attacking) n += e.v; break;
      case 'CS_DEF_VS_CITY': if (!ctx.attacking && ctx.vsCity) n += e.v; break;
      case 'CS_DEF_TERRAIN': if (!ctx.attacking && TERRAIN_COVER(ctx.tile)) n += e.v; break;
      case 'CS_IN_DISTRICT': if (IN_DISTRICT(ctx.tile)) n += e.v; break;
      case 'CS_ATK_DISTRICT': if (ctx.attacking && !ctx.ranged && (ctx.vsCity || ctx.foeInDistrict)) n += e.v; break;
      case 'CS_VS_IN_DISTRICT': if (ctx.foeInDistrict) n += e.v; break;
      case 'CS_VS_DISTRICT_DEF': if (ctx.vsCity) n += e.v; break;
      case 'CS_VS_DAMAGED': if (ctx.foeDamaged) n += e.v; break;
      case 'CS_VS_FORTIFIED': if (ctx.attacking && ctx.foeFortified) n += e.v; break;
      default: break;
    }
  }
  return n;
}

/** CIV6 (Hold the Line): "Adjacent units of a different class get +10 Combat
 *  Strength vs. cavalry", cumulative over the anti-cavalry units that hold
 *  it. Read like the Great General aura: an OWN neighbour grants it. */
export function holdTheLineCS(state: GameState, unit: Unit, tileIndex: number, foeType?: string): number {
  if (!foeType) return 0;
  const bit = classBitOf(foeType);
  const cav = classBitOf('HORSEMAN') | classBitOf('KNIGHT');
  if ((bit & cav) === 0) return 0;
  const mine = promoClassOf(unit.type);
  const here = state.map.tiles[tileIndex];
  if (!here) return 0;
  const adjacent = new Set(neighbors(state.map, here).map((t) => t.index));
  let n = 0;
  for (const other of state.units) {
    if (other.seat !== unit.seat || other.id === unit.id) continue;
    if (promoClassOf(other.type) === mine) continue;
    if (!adjacent.has(other.tileIndex)) continue;
    n += promoValue(other, 'HOLD_THE_LINE');
  }
  return n;
}

/** the promotion a unit takes at column k — its bit, its level and the heal.
 *  CIV6: "Upon selecting a promotion, a unit recovers 50 HP and its turn
 *  ends." */
export function takePromotion(unit: Unit, k: number): boolean {
  if (!promoReady(unit) || !promoAvailable(unit, k)) return false;
  unit.promos = (unit.promos ?? 0) | (1 << k);
  unit.level = unitLevel(unit) + 1;
  unit.xp = 0;
  unit.hp = Math.min(UNIT_HP, unit.hp + PROMOTE_HEAL);
  unit.movesLeft = 0;
  // CIV6 (Orator): "Can spread Religion 2 extra times." An Apostle picks its
  // promotion at purchase in real Civ 6 and here at the PROMOTE column, so
  // the charges arrive with the choice rather than with the buy.
  const extra = promoValue(unit, 'SPREAD_CHARGES');
  if (extra > 0) unit.charges = (unit.charges ?? 0) + extra;
  return true;
}

/** the catalog index a promotion id occupies, for the rules export. */
export function promoCatalogIndex(id: string): number {
  return PROMO_INDEX[id] ?? -1;
}

export { PROMOTIONS };
