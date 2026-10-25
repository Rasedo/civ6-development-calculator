/**
 * THE UNIT EFFICIENCIES (UnitProduction's m_efficiencies, GlobalAI +0x3c8;
 * the job 0x79a440, run once a game; `tools/civ6lab/dll_readings.md` "C-98:
 * the unit efficiencies"): row the opposing unit, column the unit valued,
 * AI_UNITS' order, raw 24.8.
 *
 * Per pair of Units rows i < j that both have a strength (max(Combat,
 * RangedCombat, Bombard) or AntiAirCombat), the neutral player's two units
 * off the map (no plot, no terrain, full health) fight two simulated
 * combats (0x205720 under the simulation flag: the damage law's expectation,
 * `damageExpected`), each attacking the other: a melee blow at the attacker's
 * Combat against the defender's, both taking damage; a ranged or bombard
 * blow at its RangedCombat (or Bombard) against the defender's Combat, the
 * attacker taking none, a land unit's shot on a ship and a bombard's on a
 * land unit 17 less (`rangedDomainCS`). The class matchups count for the
 * attacker alone (a melee unit's +5 on an anti-cavalry one, an
 * anti-cavalry unit's +10 on cavalry). Each unit's damage over both is
 * capped at 100 a blow, at least 1 in all; its exchanges to die
 * 100 / damage (0x640000 idiv, 24.8, truncated); the earlier row adds a
 * range advantage — ceil((its Range - 1) / the other's BaseMoves) where its
 * Range is above the other's and at least the other's moves — else the later
 * row adds ceil((its Range - 1) / the earlier's moves) where its Range is at
 * least those moves; neither where one has AntiAirCombat and the other not
 * and their domains differ (0x79aafa). M[i][j] = exchanges_i x 256 /
 * exchanges_j, M[j][i] the other way, truncated; the diagonal 1.0.
 *
 * The job is ported for the pairs its terms cover — every pair of the five
 * duels' city-states' and barbarians' units (land and sea, melee, ranged,
 * siege) agrees with AI_UnitEfficiency.csv at its printed 0.01. The job's
 * value stands where it lies within 1/256 of the printed table both ways; a
 * pair the port's terms do not cover (a unique unit's ability, an anti-air
 * or air combat's terms, the late ships' range) reads the printed table
 * (`AI_UNIT_EFFICIENCY`, its 0.01).
 */
import { AI_UNITS, AI_UNIT_EFFICIENCY } from '../data/aiBuildTables';
import { engineId } from '../data/aliases';
import { UNITS, type UnitDef } from '../data/units';
import { damageExpected, rangedDomainCS } from './combat';

/** the attacker's class matchup (counted for the attacker alone) */
function matchup(me: UnitDef, foe: UnitDef): number {
  if (me.melee && foe.antiCavalry) return 5;
  if (me.antiCavalry && foe.cavalry && !foe.chariot) return 10;
  return 0;
}

/** one simulated blow of `a` on `b`: [damage to a, damage to b] */
function blow(a: UnitDef, b: UnitDef): [number, number] {
  const ranged = (a.ranged?.strength ?? 0) > 0 || a.bombard !== undefined;
  const base = ranged ? a.ranged?.strength ?? a.bombard ?? 0 : a.combat ?? 0;
  const atk = base + (a.attackCS ?? 0) + matchup(a, b) + (ranged ? rangedDomainCS({ type: a.id } as never, b.id) : 0);
  const def = (b.combat ?? 0) + (ranged ? 0 : b.defendMeleeCS ?? 0);
  return [ranged ? 0 : Math.min(100, damageExpected(def - atk)), Math.min(100, damageExpected(atk - def))];
}

const exchanges = (damage: number): number => Math.trunc(0x640000 / (Math.max(damage, 1) * 256));
const domainOf = (u: UnitDef): string => (u.naval ? 'sea' : u.air ? 'air' : 'land');

function simulated(): number[][] {
  const out = AI_UNIT_EFFICIENCY.map((r) => [...r]);
  const n = AI_UNITS.length;
  const def = AI_UNITS.map((r) => {
    const id = engineId('unit', r.type, 'UNIT_', UNITS);
    return id ? UNITS[id] : undefined;
  });
  const strong = AI_UNITS.map((r) => Math.max(r.combat, r.rangedCombat, r.bombard) > 0 || r.antiAir > 0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const p = def[i], q = def[j];
      if (!p || !q || !strong[i] || !strong[j]) continue;
      const rp = AI_UNITS[i], rq = AI_UNITS[j];
      const [d1p, d1q] = blow(p, q);
      const [d2q, d2p] = blow(q, p);
      let exP = exchanges(d1p + d2p);
      let exQ = exchanges(d1q + d2q);
      if (!((rp.antiAir > 0) !== (rq.antiAir > 0) && domainOf(p) !== domainOf(q))) {
        let bP = 0;
        if (rp.range > rq.range && rp.range >= rq.moves) bP = Math.ceil((rp.range - 1) / rq.moves);
        const bQ = bP === 0 && rq.range >= rp.moves ? Math.ceil((rq.range - 1) / rp.moves) : 0;
        exP += bP * 256;
        exQ += bQ * 256;
      }
      const mij = Math.trunc((exP * 256) / Math.max(exQ, 1));
      const mji = Math.trunc((exQ * 256) / Math.max(exP, 1));
      // the job's value where its ported terms reach the logged one at its 0.01
      if (Math.abs(mij - AI_UNIT_EFFICIENCY[i][j]) <= 1 && Math.abs(mji - AI_UNIT_EFFICIENCY[j][i]) <= 1) {
        out[i][j] = mij;
        out[j][i] = mji;
      }
    }
  }
  return out;
}

let table: number[][] | null = null;

/** M[opposing][valued], raw 24.8 (built on its first read) */
export function unitEfficiency(): readonly (readonly number[])[] {
  return (table ??= simulated());
}
