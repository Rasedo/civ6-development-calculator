/**
 * THE UNIT EFFICIENCIES (UnitProduction's m_efficiencies, GlobalAI +0x3c8;
 * the job 0x79a440, run once a game; `tools/civ6lab/dll_readings.md` "C-98:
 * the unit efficiencies"): row the opposing unit, column the unit valued,
 * AI_UNITS' order, raw 24.8.
 *
 * The diagonal is 1.0. Per pair of Units rows i < j: a row with no strength
 * (max(Combat, RangedCombat, Bombard) 0 and no AntiAirCombat) against one
 * with: M[i][j] 0.01 and M[j][i] 100.0 where i is the weak one, M[i][j]
 * 100.0 and M[j][i] 1.0 where j is; two weak rows 1.0 both ways. Two strong
 * rows: the neutral player's two units off the map (no plot, full health)
 * fight two simulated combats (0x205720 under the simulation flag), each
 * attacking the other, and each unit's damage over both (at least 1) gives
 * its exchanges 100 / damage (0x640000 idiv, 24.8, truncated); the range
 * term; M[i][j] = ex_i x 256 / ex_j and M[j][i] the other way, truncated;
 * then the anti-air term.
 */
import { AI_UNITS } from '../data/aiBuildTables';
import {
  COMBAT_BOMBARD_VS_UNIT, COMBAT_MAX_HIT_POINTS, COMBAT_MINIMUM_DAMAGE, COMBAT_MIN_CIVILIAN_DAMAGE_PERCENT,
} from '../data/constants';
import type { AiUnitRow } from './aiCityBuild';
import type { AiModifier, AiRequirementSet } from './aiModifiers';
import { damageExpected } from './combat';

type CombatType = 'COMBAT_MELEE' | 'COMBAT_RANGED' | 'COMBAT_BOMBARD';

const air = (u: AiUnitRow): boolean => u.domain === 'DOMAIN_AIR';
const fighter = (u: AiUnitRow): boolean => u.promotionClass === 'PROMOTION_CLASS_AIR_FIGHTER';

/** the combat a unit attacks a unit with (0x209550; an air unit's is
 *  COMBAT_AIR, `airStrike`): RANGED where its RangedCombat tops its Bombard
 *  and its Combat, BOMBARD where its Bombard tops both, else MELEE */
function combatType(u: AiUnitRow): CombatType {
  if (u.rangedCombat > 0 && u.rangedCombat > u.bombard && u.rangedCombat > u.combat) return 'COMBAT_RANGED';
  if (u.bombard > 0 && u.bombard > u.rangedCombat && u.bombard > u.combat) return 'COMBAT_BOMBARD';
  return 'COMBAT_MELEE';
}

/** a requirement off the map, whichever unit the modifier is on: the
 *  player (the neutral one, both units') attacks, the opponent is the
 *  defender `def`, a stronger one by Combat than the attacker `att`. A
 *  plot's, a territory's, a continent's, a formation's or a neighbour's
 *  test is unmet (0xb028c0, 0xb12d50, 0xb95b80 return 1 where the unit has
 *  no plot), its Inverse met. */
function holds(type: string, args: Readonly<Record<string, string>>, att: AiUnitRow, def: AiUnitRow, ct: string): boolean {
  switch (type) {
    case 'REQUIREMENT_PLAYER_IS_ATTACKING': return true;
    case 'REQUIREMENT_COMBAT_TYPE_MATCHES': return args.CombatType === ct;
    case 'REQUIREMENT_OPPONENT_UNIT_PROMOTION_CLASS_MATCHES': return def.promotionClass === args.UnitPromotionClass;
    case 'REQUIREMENT_OPPONENT_UNIT_TAG_MATCHES': return def.tags.includes(args.Tag);
    case 'REQUIREMENT_OPPONENT_IS_STRONGER': return def.combat > att.combat;
    case 'REQUIREMENT_OPPONENT_IS_WOUNDED':
    case 'REQUIREMENT_OPPONENT_IS_DISTRICT':
    case 'REQUIREMENT_PLOT_ADJACENT_FRIENDLY_TERRITORY':
    case 'REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TAG_MATCHES':
    case 'REQUIREMENT_PLOT_ADJACENT_FRIENDLY_UNIT_TYPE_MATCHES':
    case 'REQUIREMENT_PLOT_ADJACENT_TO_OWNER_AT_WAR':
    case 'REQUIREMENT_PLOT_FEATURE_TYPE_MATCHES':
    case 'REQUIREMENT_PLOT_IS_HILLS':
    case 'REQUIREMENT_PLOT_TERRAIN_TYPE_MATCHES':
    case 'REQUIREMENT_UNIT_ADJACENT_TO_OWNER_TERRITORY':
    case 'REQUIREMENT_UNIT_IN_FORMATION':
    case 'REQUIREMENT_UNIT_IN_OWNER_TERRITORY':
    case 'REQUIREMENT_UNIT_ON_COAST':
    case 'REQUIREMENT_UNIT_ON_HOME_CONTINENT':
    case 'REQUIREMENT_UNIT_PLOT_HAS_NATIONAL_PARK':
      return false;
  }
  throw new Error(`unit efficiencies: requirement ${type} unread`);
}

function setHolds(s: AiRequirementSet | undefined, att: AiUnitRow, def: AiUnitRow, ct: string): boolean {
  if (!s) return true;
  const each = s.reqs.map((r) => holds(r.type, r.args, att, def, ct) !== r.inverse);
  return s.test === 'ANY' ? each.some(Boolean) : s.test === 'NONE' ? !each.some(Boolean) : each.every(Boolean);
}

/** the strength the combat's modifiers add: every COLLECTION_UNIT_COMBAT
 *  strength modifier of both units whose requirements hold (the opponent the
 *  defender) is the player's, and the player is the attacker's side */
function combatModifiers(att: AiUnitRow, def: AiUnitRow, ct: string): number {
  let out = 0;
  for (const owner of [att, def]) {
    for (const m of owner.abilities) {
      if (m.effect !== 'EFFECT_ADJUST_PLAYER_STRENGTH_MODIFIER') continue;
      if (setHolds(m.subjectReqs, att, def, ct) && setHolds(m.ownerReqs, att, def, ct)) out += Number(m.args.Amount);
    }
  }
  return out;
}

/** a unit's own strength terms: the Carolean's per unused Movement (its
 *  whole BaseMoves); an attached modifier's, the per-neighbour, per-ally and
 *  per-levied-neighbour terms count units and allies off the map: none */
function ownStrength(u: AiUnitRow): number {
  let out = 0;
  for (const m of u.abilities as readonly AiModifier[]) {
    if (m.effect === 'EFFECT_ADJUST_UNIT_PER_UNUSED_MOVEMENT_COMBAT_BONUS') out += Number(m.args.Amount) * u.moves;
  }
  return out;
}

/** a ranged or bombard blow's domain term (0x51c810): a bombard one loses
 *  COMBAT_BOMBARD_VS_UNIT on a land defender, a land unit's ranged one on
 *  a naval defender */
function domainTerm(att: AiUnitRow, def: AiUnitRow, ct: string): number {
  if (ct === 'COMBAT_BOMBARD' && def.domain === 'DOMAIN_LAND') return -COMBAT_BOMBARD_VS_UNIT;
  if (ct === 'COMBAT_RANGED' && att.domain === 'DOMAIN_LAND' && def.domain === 'DOMAIN_SEA') return -COMBAT_BOMBARD_VS_UNIT;
  return 0;
}

/** the damage one side takes (0x51a240 -> 0x519090 under the simulation
 *  flag): a side of base strength 0 takes COMBAT_MIN_CIVILIAN_DAMAGE_PERCENT
 *  of its hit points; a side of strength 0 takes them all, a side struck at
 *  strength 0 the least; else the law's expectation */
function damageTo(base: number, own: number, foe: number): number {
  if (base <= 0) return Math.trunc((COMBAT_MIN_CIVILIAN_DAMAGE_PERCENT * COMBAT_MAX_HIT_POINTS) / 100);
  if (own === 0) return COMBAT_MAX_HIT_POINTS;
  if (foe === 0) return COMBAT_MINIMUM_DAMAGE;
  return damageExpected(foe - own);
}

/** an air unit's strike on a unit (0x203cb0, no interceptor, no anti-air
 *  cover): an air target fought in the dogfight at Combat, any other at
 *  RangedCombat or Bombard, whichever is larger (Combat on a tie); the
 *  target defends at its AntiAirCombat where it holds one and is no
 *  fighter, else at Combat; the plane takes damage from a fighter or an
 *  anti-air target alone. [plane's damage, target's] */
function airStrike(p: AiUnitRow, t: AiUnitRow): [number, number] {
  let ct: CombatType = 'COMBAT_MELEE';
  let pBase = p.combat;
  if (!air(t)) {
    if (p.rangedCombat > p.bombard) { ct = 'COMBAT_RANGED'; pBase = p.rangedCombat; }
    else if (p.bombard > p.rangedCombat) { ct = 'COMBAT_BOMBARD'; pBase = p.bombard; }
  }
  const answers = fighter(t) || t.antiAir > 0;
  const tBase = !fighter(t) && t.antiAir > 0 ? t.antiAir : t.combat;
  const pS = pBase + ownStrength(p) + combatModifiers(p, t, ct) + domainTerm(p, t, ct);
  const tS = tBase + ownStrength(t);
  return [answers ? damageTo(pBase, pS, tS) : 0, damageTo(tBase, tS, pS)];
}

/** one simulated blow of `a` on `b`: [a's damage, b's] */
function blow(a: AiUnitRow, b: AiUnitRow): [number, number] {
  if (air(a)) return airStrike(a, b);
  const ct = combatType(a);
  const aBase = ct === 'COMBAT_RANGED' ? a.rangedCombat : ct === 'COMBAT_BOMBARD' ? a.bombard : a.combat;
  const aS = aBase + ownStrength(a) + combatModifiers(a, b, ct) + domainTerm(a, b, ct);
  const bS = b.combat + ownStrength(b);
  let dB = damageTo(b.combat, bS, aS);
  if (ct !== 'COMBAT_MELEE') return [0, dB];
  // the melee result (0x206960): the attacker's damage the law's the other
  // way; a support defender falls whole; where both would fall the attacker
  // is left at 1 HP (its overshoot no larger than the defender's)
  let dA = damageTo(aBase, aS, bS);
  if (b.support) dB = COMBAT_MAX_HIT_POINTS;
  if (dA >= COMBAT_MAX_HIT_POINTS && dB >= COMBAT_MAX_HIT_POINTS) dA = COMBAT_MAX_HIT_POINTS - 1;
  return [dA, dB];
}

const exchanges = (damage: number): number => Math.trunc(0x640000 / (Math.max(damage, 1) * 256));
const strong = (u: AiUnitRow): boolean => Math.max(u.combat, u.rangedCombat, u.bombard) > 0 || u.antiAir > 0;
/** the anti-air term's share, 0.05 in 24.8 (0x79b132: 12) */
const ANTI_AIR_SHARE = Math.trunc(0.05 * 256);

function simulated(): number[][] {
  const n = AI_UNITS.length;
  const out = AI_UNITS.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    out[i][i] = 256;
    const p = AI_UNITS[i];
    for (let j = i + 1; j < n; j++) {
      const q = AI_UNITS[j];
      if (!strong(p) || !strong(q)) {
        out[i][j] = !strong(p) && strong(q) ? 2 : strong(p) && !strong(q) ? 25600 : 256;
        out[j][i] = !strong(p) && strong(q) ? 25600 : 256;
        continue;
      }
      const [d1p, d1q] = blow(p, q);
      const [d2q, d2p] = blow(q, p);
      let exP = exchanges(d1p + d2p);
      let exQ = exchanges(d1q + d2q);
      // the range term (0x79ab16), none where the two differ both in holding
      // AntiAirCombat and in being air units
      if (!((p.antiAir > 0) !== (q.antiAir > 0) && air(p) !== air(q))) {
        let bP = 0;
        if (p.range > q.range && p.range >= q.moves) bP = Math.ceil((p.range - 1) / q.moves);
        const bQ = bP === 0 && q.range >= p.moves ? Math.ceil((q.range - 1) / p.moves) : 0;
        exP += bP * 256;
        exQ += bQ * 256;
      }
      let mij = Math.trunc((exP * 256) / exQ);
      let mji = Math.trunc((exQ * 256) / exP);
      // the anti-air term (0x79b115): an anti-air unit against an air unit
      // moves AntiAirCombat x 0.05 from the plane's value to its own — the
      // plane's entry loses min(t, it), the anti-air unit's gains max(t, it)
      if (p.antiAir > 0 && air(q)) {
        const t = (p.antiAir * 256 * ANTI_AIR_SHARE) >> 8;
        mji -= Math.min(t, mji);
        mij += Math.max(mij, t);
      } else if (q.antiAir > 0 && air(p)) {
        const t = (q.antiAir * 256 * ANTI_AIR_SHARE) >> 8;
        mij -= Math.min(t, mij);
        mji += Math.max(mji, t);
      }
      out[i][j] = mij;
      out[j][i] = mji;
    }
  }
  return out;
}

let table: number[][] | null = null;

/** M[opposing][valued], raw 24.8 (built on its first read) */
export function unitEfficiency(): readonly (readonly number[])[] {
  return (table ??= simulated());
}
