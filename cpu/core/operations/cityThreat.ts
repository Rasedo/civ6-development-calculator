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
 *  barbarians; else 20.0, or the city's strength where higher */
const MARGIN_HOSTILE = 5 * FX;
const MARGIN_OTHER = 20 * FX;
/** a running operation of the owner against the player whose target lies
 *  within this of the city keeps an undamaged city unthreatened (0x723cf0) */
const OWN_OPERATION_RANGE = 5;

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

/**
 * 0x5cbd10: per player of the game but the owner and those it declared
 * friendship with — a full civ the owner fights (the barbarians not), or one
 * that denounced it or that it denounced, or the barbarians: hostile, margin
 * 5.0; any other full civ: margin 20.0 or the city's strength; a city-state
 * the owner does not fight: none — an undamaged city with a running
 * operation of the owner against the player within 5 is left alone; else
 * the player's known units within 5 (a full civ's) or 3 of the city summed
 * by their threat strengths; at the city's defense plus the margin or more,
 * the city is threatened: its level 2 (the population, capital, wonders and
 * +0x588 terms unread, none), at most 1 for a player not hostile. The
 * first such player decides; none, -1.
 */
export function cityThreat(view: MajorView, seat: number, city: number, inp: ThreatInputs): number {
  const c = view.cityDefense(city);
  if (!c) return -1;
  const d = c.defense * FX;
  const barb = view.barbarianSeat();
  const majors = view.majors();
  for (const p of view.players()) {
    if (p === seat || view.declaredFriends(seat, p)) continue;
    const full = majors.includes(p);
    const war = view.atWar(seat, p) && p !== barb;
    const hostile = war || view.denounced(p, seat) || view.denounced(seat, p) || p === barb;
    if (!full && p !== barb && !war) continue;
    const margin = hostile ? MARGIN_HOSTILE : Math.max(MARGIN_OTHER, c.strength * FX);
    if (!c.damaged && inp.operationNear(p, city, OWN_OPERATION_RANGE)) continue;
    const range = full ? RANGE_CIV : RANGE_OTHER;
    let sum = 0;
    let any = false;
    for (const u of inp.army(p)) {
      if (view.plotDistance(u.plot, city) > range) continue;
      any = true;
      const s = threatStrength(u.type, d);
      if (s !== null) sum += s;
    }
    if (!any) continue;
    if (sum < d + margin) continue;
    return hostile ? 2 : 1;
  }
  return -1;
}
