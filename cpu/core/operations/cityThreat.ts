/**
 * THE CITY'S THREAT (CityBuildAI 0x5cbd10, its autovariable m_cityThreat at
 * +0x160, data +0x1b8, set in the city's update 0x5ce680; `tools/civ6lab/
 * dll_readings.md` "C-97: City Defense"): -1 for none, else the threat's
 * level. It starts the city's City Defense operation (the defence event
 * 0x5cced0) and keeps it running (Is City Threatened). Every party with a
 * city AI reads it: the majors and the city-states.
 */
import { AI_UNITS } from '../../data/aiBuildTables';
import { AI_UNIT_INDEX } from '../aiCityBuild';
import { FX } from '../aiValue';
import type { MajorView } from '../../../ai/major/view';
import type { KnownUnit } from './knowledge';

/** the range a full civ's units threaten from, and a city-state's or the
 *  barbarians' */
const RANGE_CIV = 5;
const RANGE_OTHER = 3;
/** the margin over the city's defense a hostile army must reach: 5.0 for a
 *  player the owner fights, has denounced or is denounced by, or the
 *  barbarians; else 20.0, or the centre's garrison term (0x24a180, the
 *  garrison's Combat less its wounds and the holder's base) where higher */
const MARGIN_HOSTILE = 5 * FX;
const MARGIN_OTHER = 20 * FX;
/** a running operation of the owner against the player whose target lies
 *  within this of the city keeps an undamaged city unthreatened (0x723cf0) */
const OWN_OPERATION_RANGE = 5;
/** the enemy at the gates (CityBuildAI +0x218, its watched bool at +0x1c0):
 *  more than 2 of a player's known units within 2 of the city, each of a
 *  strength (the larger of Combat and RangedCombat) of 5 or more (0x5eadb0
 *  at radius 2, least strength 5: its list's per-type counts summed) */
const NEAR_RANGE = 2;
const NEAR_LEAST = 5;
const NEAR_ABOVE = 2;

/** the city's threat: its level (-1 none) and the enemy at the gates
 *  (+0x218) */
export interface CityThreat {
  level: number;
  near: boolean;
}

/** what the threat reads beside the view */
export interface ThreatInputs {
  /** the knowledge base's records of a player's units */
  army: (player: number) => readonly KnownUnit[];
  /** a running operation of the owner against the player (0x723cf0, not
   *  asked ready) whose target lies within `dist` of the plot */
  operationNear: (player: number, plot: number, dist: number) => boolean;
}

/** a known unit type's threat strength (24.8): the larger of its Combat,
 *  its RangedCombat and its Bombard + 20 where it has one (unit row +0x48,
 *  +0x6c, +0x40); null where it does not count against a city of defense
 *  `d` (24.8): a Bombard unit counts, a ranged one above d - 15.0, any above
 *  d - 5.0; an explorer (PSEUDOYIELD_UNIT_EXPLORER) never */
function threatStrength(type: string, d: number): number | null {
  const row = AI_UNITS[AI_UNIT_INDEX.get(type) ?? -1];
  if (!row) return null;
  const bombard = row.bombard > 0 ? row.bombard + 20 : 0;
  const s = Math.max(row.combat, Math.max(bombard, row.rangedCombat)) * FX;
  const counts = row.bombard > 0 || (row.rangedCombat > 0 && s > d - 15 * FX) || s > d - 5 * FX;
  if (!counts || row.pseudo === 'PSEUDOYIELD_UNIT_EXPLORER') return null;
  return s;
}

/** a type of the barbarians' camp defenders, which threaten no city: the
 *  barbarian manager's list (+0x298, filled at its start 0x153720 with each
 *  Units row tagged CLASS_ANTI_CAVALRY, read by 0x153e40) — the
 *  anti-cavalry rows (runs/h1_duelv1121 t4-t12: a barbarian Spearman 3 from
 *  city-state 2's and city-state 4's cities, 25 against a defense of 18,
 *  starts no City Defense; t13 a Quadrireme beside it does) */
function campDefender(type: string): boolean {
  return AI_UNITS[AI_UNIT_INDEX.get(type) ?? -1]?.promotionClass === 'PROMOTION_CLASS_ANTI_CAVALRY';
}

/**
 * 0x5cbd10: per player of the game but the owner and those it declared
 * friendship with — a full civ the owner fights (the barbarians not), or one
 * that denounced it or that it denounced, or the barbarians: hostile, margin
 * 5.0; any other full civ: margin 20.0 or the garrison term; a city-state
 * the owner does not fight: none — an undamaged city with a running
 * operation of the owner against the player within 5 is left alone; else
 * the player's known units within 5 (a full civ's) or 3 of the city summed
 * by their threat strengths (a barbarian camp defender none); at the city's
 * defense plus the margin or more,
 * the city is threatened at its level (`threatLevel`), at most 1 for a
 * player not hostile. The first such player decides; none, -1. Each player
 * the walk reads its units of (its units within its range) sets the enemy
 * at the gates where more than 2 of its units of a strength of 5 or more
 * stand within 2 of the city (0x5eadb0; CityBuildAI +0x218, cleared as the walk
 * opens, set for good once set); a player the owner fights then threatens
 * the city at once, the margin unread (0x5cc3d9). The city under threat
 * reads it (0x5cdc50): runs/h1_duelw1103 Hattusa t46 and runs/h1_duelw1105
 * Bandar Brunei t16 cancel their builds with their centres whole.
 */
export function cityThreat(view: MajorView, seat: number, city: number, inp: ThreatInputs): CityThreat {
  const c = view.cityDefense(city);
  let near = false;
  if (!c) return { level: -1, near };
  const d = c.defense * FX;
  const barb = view.barbarianSeat();
  const majors = view.majors();
  for (const p of view.players()) {
    if (p === seat || view.declaredFriends(seat, p)) continue;
    const full = majors.includes(p);
    const war = view.atWar(seat, p) && p !== barb;
    const hostile = war || view.denounced(p, seat) || view.denounced(seat, p) || p === barb;
    if (!full && p !== barb && !war) continue;
    const margin = hostile ? MARGIN_HOSTILE : Math.max(MARGIN_OTHER, Math.trunc(c.garrison * FX));
    if (!c.damaged && inp.operationNear(p, city, OWN_OPERATION_RANGE)) continue;
    const range = full ? RANGE_CIV : RANGE_OTHER;
    let sum = 0;
    let any = false;
    for (const u of inp.army(p)) {
      if (view.plotDistance(u.plot, city) > range) continue;
      any = true;
      const s = threatStrength(u.type, d);
      if (s === null || (p === barb && campDefender(u.type))) continue;
      sum += s;
    }
    if (!any) continue;
    const atGates = inp.army(p).filter((u) => view.plotDistance(u.plot, city) <= NEAR_RANGE && Math.max(u.combat, u.ranged) >= NEAR_LEAST);
    if (atGates.length > NEAR_ABOVE) near = true;
    if (!(war && near) && sum < d + margin) continue;
    const level = threatLevel(c);
    return { level: hostile ? level : Math.min(level, 1), near };
  }
  return { level: -1, near };
}

/** the threatened city's level (0x5cbd10 from 0x5cc475): 2, 3 for a city
 *  of more than two districts the centre included; +2 a capital; +1 with a
 *  wonder built; + its citizens / 5 (cut toward 0) */
function threatLevel(c: { districts: number; capital: boolean; wonder: boolean; population: number }): number {
  return (c.districts > 2 ? 3 : 2) + (c.capital ? 2 : 0) + (c.wonder ? 1 : 0) + Math.trunc(c.population / 5);
}
