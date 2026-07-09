/**
 * TS side of the Phase-1 divergence log — emits the SAME canonical per-turn lines
 * as gpu/statelog.py so gpu/logdiff.py can align them. Keep the two in lockstep:
 * every field here has a twin there, keyed by TILE/CENTER index (never array slot).
 */
import { getCityHp } from '../src/core/combat';
import { UNITS } from '../src/data/units';
import { BUILDINGS } from '../src/data/buildings';
import type { GameState } from '../src/core/types';

function frontCost(rc: any): number {
  const q = rc.queue[0];
  if (!q) return 0;
  if (q.kind === 'unit') return UNITS[q.unit]?.cost ?? 0;
  if (q.kind === 'building') return BUILDINGS[q.building]?.cost ?? 0;
  return q.cost ?? 0; // settler / district / project carry their own cost
}

export function tsStateLines(state: GameState, unitIds: string[]): string[] {
  const p = `${state.turn} `;
  const L: string[] = [];
  const ti = (t: string) => Math.max(-1, unitIds.indexOf(t));

  const pu = state.units.filter((u) => u.owner === 'player');
  L.push(
    `${p}PT = treas:${Math.round(state.treasury*1000)} sci:${state.scienceTotal.toFixed(3)} ` +
      `cul:${state.cultureTotal.toFixed(3)} ntech:${state.research.techs.length} ` +
      `nciv:${state.research.civics.length} nset:${state.settlers} ncity:${state.cities.length} nunit:${pu.length}`,
  );
  for (const u of pu) L.push(`${p}PU ${u.tileIndex} = t${ti(u.type)} hp${u.hp}`);

  const barb = new Map<number, number>();
  for (const u of state.units) if (u.owner === 'barbarian') barb.set(u.tileIndex, (barb.get(u.tileIndex) ?? 0) + 1);
  for (const [tile, n] of [...barb.entries()].sort((a, b) => a[0] - b[0])) L.push(`${p}BU ${tile} = ${n}`);

  const rv = new Map<string, number>();
  for (const u of state.units) if (u.owner === 'rival') {
    const k = `${u.civId}\t${u.tileIndex}`;
    rv.set(k, (rv.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...rv.entries()].sort()) {
    const [civ, tile] = k.split('\t');
    L.push(`${p}RU${civ} ${tile} = ${n}`);
  }

  for (let i = 0; i < state.map.tiles.length; i++) {
    const t = state.map.tiles[i];
    if (t.improvement || t.pillaged || t.district) {
      L.push(`${p}TI ${i} = i:${t.improvement ?? '-'} pill:${t.pillaged ? 1 : 0} dist:${t.district ? 1 : 0}`);
    }
  }

  for (const c of state.cities) {
    L.push(
      `${p}PC ${c.centerIndex} = pop${c.population} pr${(c.queue[0]?.progress ?? 0).toFixed(3)} ` +
        `fbox${c.foodBox.toFixed(3)} hp${getCityHp(state, c.id)} til${c.tilesAcquired} nbld${c.buildings.filter((bb) => bb !== 'PALACE').length}`,
    );
  }

  for (let r = 0; r < state.rivals.length; r++) {
    const rival = state.rivals[r];
    if (rival.cities.length === 0) continue;
    const pop = rival.cities.reduce((a, rc) => a + rc.population, 0);
    L.push(
      `${p}RT${r} = ncity${rival.cities.length} pop${pop} treas${Math.round((rival.treasury ?? 0)*1000)} ` +
        `ntech${rival.research.techs.length} nciv${rival.research.civics.length} war${rival.atWar ? 1 : 0}`,
    );
    for (const rc of rival.cities) {
      L.push(`${p}RC${r} ${rc.centerIndex} = pop${rc.population} pr${(rc.queue[0]?.progress ?? 0).toFixed(3)} co${frontCost(rc).toFixed(3)} k${rc.queue[0]?.kind ?? 'idle'}`);
    }
  }
  return L;
}
