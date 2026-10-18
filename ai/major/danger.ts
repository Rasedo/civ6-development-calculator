/**
 * THE AI'S DANGER MAP (GameCore_XP2 AI/InfluenceMap.cpp, the player's
 * m_influence: 0x717460 builds it, 0x716a90 reads a plot; the reading is
 * tools/civ6lab/dll_readings.md "C-97: the settle site evaluation"). A plot's
 * danger is the strength of every unit of a player at war with the seat that
 * the seat sees now and that can reach or strike the plot in a turn, the
 * defence of every district of such a player on its plot and its strike over
 * its reach (1 beside a district with none), less the cover of the seat's own
 * districts.
 */
import { AI_GLOBALS } from './tables';
import type { MajorView } from './view';

/** one unit's danger (0x716400): a unit with a bombard strength takes its
 *  combat strength where that tops the bombard less
 *  COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER, else that less; any other the
 *  larger of its combat and ranged strengths */
export function unitDanger(melee: number, ranged: number, bombard: number): number {
  if (bombard > 0) {
    const vs = bombard - AI_GLOBALS.COMBAT_BOMBARD_VS_UNIT_STRENGTH_MODIFIER;
    return melee > vs ? melee : vs;
  }
  return melee > ranged ? melee : ranged;
}

/** the seat's danger map, one whole number per plot */
export function dangerMap(view: MajorView, seat: number): Int16Array {
  const n = view.plots().length;
  const out = new Int16Array(n);
  for (const u of view.hostileUnits(seat)) {
    const s = unitDanger(u.melee, u.ranged, u.bombard);
    if (u.air) {
      // an air unit: every plot within its range of where it stands
      for (const p of view.plotsWithin(u.plot, u.range)) out[p] += s;
      continue;
    }
    // the plots it reaches this turn (its planning reach of 1), and those its
    // ranged attack reaches from them
    const reach = view.unitReach(u.id, 1).map((r) => r.plot);
    const inReach = new Set(reach);
    const extra = new Set<number>();
    for (const p of reach) {
      for (const q of view.plotsWithin(p, u.range)) if (!inReach.has(q)) extra.add(q);
    }
    // a melee unit: the land plots beside each it reaches, those it reaches
    // included (the ring callback 0x715f40 dedupes its own list alone)
    const ring: number[] = [];
    if (u.ranged <= 0 && u.bombard <= 0) {
      const seen = new Set<number>();
      for (const p of reach) {
        for (const q of view.plotsWithin(p, 1)) {
          if (q === p || view.plots()[q].water || seen.has(q) || extra.has(q)) continue;
          seen.add(q);
          ring.push(q);
        }
      }
    }
    for (const p of reach) out[p] += s;
    for (const p of extra) out[p] += s;
    for (const p of ring) out[p] += s;
  }
  for (const c of view.hostileDistricts(seat)) {
    if (c.strength > 0) out[c.plot] += c.strength;
    if (c.ranged > 0) {
      for (const p of view.plotsWithin(c.plot, c.range)) if (p !== c.plot) out[p] += c.ranged;
    } else {
      // a district with no strike: each plot beside it, one (0x715ff0)
      for (const p of view.plotsWithin(c.plot, 1)) if (p !== c.plot) out[p] += 1;
    }
  }
  // the seat's own districts: those with a defence safe, the plots their
  // strike covers down by its strength, to 1 at least (0x716080)
  for (const c of view.districtDefences(seat)) {
    if (c.strength > 0) out[c.plot] = 0;
    if (c.ranged <= 0) continue;
    for (const p of view.plotsWithin(c.plot, c.range)) {
      if (p === c.plot || out[p] <= 0) continue;
      out[p] = out[p] - c.ranged > 1 ? out[p] - c.ranged : 1;
    }
  }
  return out;
}
