/**
 * TS side of the Phase-1 divergence log — emits the SAME canonical per-turn lines
 * as gpu/statelog.py so gpu/logdiff.py can align them. Keep the two in lockstep:
 * every field here has a twin there, keyed by TILE/CENTER index (never array slot).
 */
import { getCityHp, terrainDefense } from '../src/core/combat';
import { rivalCityYields } from '../src/core/rivals';
import { empireScore, rivalEmpireScore } from '../src/core/empirePlanner';
import { isWater } from '../src/core/query';
import { computeCityStats } from '../src/core/city';
import { unitMaintenance } from '../src/core/units';
import { greatPeopleEarned } from '../src/core/game';
import { GP_CLASSES } from '../src/data/greatPeople';
import { UNITS } from '../src/data/units';
import { BUILDINGS } from '../src/data/buildings';
import type { GameState } from '../src/core/types';

function frontCost(rc: any): number {
  const q = rc.queue[0];
  if (!q) return 0;
  if (q.kind === 'unit') return q.cost ?? UNITS[q.unit]?.cost ?? 0; // P4/D-10: builders lock a cost
  if (q.kind === 'building') return BUILDINGS[q.building]?.cost ?? 0;
  return q.cost ?? 0; // settler / district / project carry their own cost
}

export function tsStateLines(state: GameState, unitIds: string[]): string[] {
  const p = `${state.turn} `;
  const L: string[] = [];
  const ti = (t: string) => Math.max(-1, unitIds.indexOf(t));

  // Phase-1 combat log: drain the turn's damage rolls (damageRoll buffers
  // them for the CIV6_LOG game) into keyed CB lines — the gpu/statelog twin.
  const cb = (globalThis as any).__cbLog as string[] | undefined;
  if (cb) {
    cb.forEach((e, i) => L.push(`${p}CB${i} = ${e}`));
    cb.length = 0;
  }

  const pu = state.units.filter((u) => u.owner === 'player');
  L.push(
    `${p}PT = treas:${Math.round(state.treasury*1000)} sci:${Math.round(state.scienceTotal*1000)} ` +
      `cul:${Math.round(state.cultureTotal*1000)} ntech:${state.research.techs.length} ` +
      `nciv:${state.research.civics.length} nset:${state.settlers} ncity:${state.cities.length} nunit:${pu.length} ` +
      `umaint:${Math.round(unitMaintenance(state)*1000)} ` +
      `gp:${GP_CLASSES.map((cls) => greatPeopleEarned(state, cls)).join(',')} ` +
      `esc:${Math.round(empireScore(state, 'balanced') * 1000)}`,
  );
  for (const u of pu) L.push(`${p}PU ${u.tileIndex} = t${ti(u.type)} hp${u.hp}`);

  const barb = new Map<number, number>();
  const barbHp = new Map<number, number>();
  for (const u of state.units) if (u.owner === 'barbarian') {
    barb.set(u.tileIndex, (barb.get(u.tileIndex) ?? 0) + 1);
    barbHp.set(u.tileIndex, (barbHp.get(u.tileIndex) ?? 0) + u.hp);
  }
  const barbActed = new Map<number, number>();
  for (const u of state.units) if (u.owner === 'barbarian')
    barbActed.set(u.tileIndex, (barbActed.get(u.tileIndex) ?? 0) + (u.movesLeft < (UNITS[u.type]?.moves ?? 2) ? 1 : 0));
  for (const [tile, n] of [...barb.entries()].sort((a, b) => a[0] - b[0])) L.push(`${p}BU ${tile} = ${n} hp${barbHp.get(tile)} a${barbActed.get(tile)}`);
  // barb CAMPS (P5/S6 hunt: locations were invisible — the count-only trace)
  for (const c of state.barbCamps) L.push(`${p}CA ${c} = 1`);

  const rv = new Map<string, number>();
  const rvHp = new Map<string, number>();
  const rvActed = new Map<string, number>();
  for (const u of state.units) if (u.owner === 'rival') {
    const k = `${u.civId}\t${u.tileIndex}\t${ti(u.type)}`;
    rv.set(k, (rv.get(k) ?? 0) + 1);
    rvHp.set(k, (rvHp.get(k) ?? 0) + u.hp);
    rvActed.set(k, (rvActed.get(k) ?? 0) + (u.movesLeft < (UNITS[u.type]?.moves ?? 2) ? 1 : 0));
  }
  for (const [k, n] of [...rv.entries()].sort()) {
    const [civ, tile, typ] = k.split('\t');
    L.push(`${p}RU${civ} ${tile} t${typ} = ${n} hp${rvHp.get(k)} a${rvActed.get(k)}`);
  }

  for (let i = 0; i < state.map.tiles.length; i++) {
    const t = state.map.tiles[i];
    if (t.improvement || t.pillaged || t.district) {
      L.push(`${p}TI ${i} = i:${t.improvement ?? '-'} pill:${t.pillaged ? 1 : 0} dist:${t.district ? 1 : 0}`);
    }
  }

  for (let i = 0; i < state.map.tiles.length; i++) {
    const t = state.map.tiles[i];
    if (t.district && t.district !== 'CITY_CENTER') {
      L.push(`${p}TD ${i} = td${terrainDefense(t)} dc${t.districtComplete ? 1 : 0}`);
    }
  }

  for (const c of state.cities) {
    const yt = computeCityStats(state, c).total;
    L.push(
      `${p}PC ${c.centerIndex} = pop${c.population} pr${Math.round((c.queue[0]?.progress ?? 0)*1000)} ` +
        `fbox${Math.round(c.foodBox*1000)} loy${Math.round((c.loyalty ?? 100)*1000)} ` +
        `hp${getCityHp(state, c.id)} til${c.tilesAcquired} nbld${c.buildings.filter((bb) => bb !== 'PALACE').length} ` +
        `yf${Math.round(yt.food*1000)} yp${Math.round(yt.production*1000)} yg${Math.round(yt.gold*1000)} ` +
        `ys${Math.round(yt.science*1000)} yc${Math.round(yt.culture*1000)} yfa${Math.round(yt.faith*1000)}`,
    );
  }

  for (let r = 0; r < state.rivals.length; r++) {
    const rival = state.rivals[r];
    if (rival.cities.length === 0) continue;
    const pop = rival.cities.reduce((a, rc) => a + rc.population, 0);
    const rt = state.map.tiles.filter((t) => t.rivalId === rival.id);
    L.push(
      `${p}RT${r} = ncity${rival.cities.length} pop${pop} treas${Math.round((rival.treasury ?? 0)*1000)} fai${Math.round((rival.faith ?? 0)*1000)} ` +
        `ntech${rival.research.techs.length} nciv${rival.research.civics.length} war${rival.atWar ? 1 : 0} ` +
        `terr:${rt.length} wterr:${rt.filter((t) => isWater(t)).length} ` +
        `tsum:${rt.reduce((s, t) => s + t.index, 0)} ` +
        `rsc:${Math.round(rivalEmpireScore(state, rival) * 1000)}`,
    );
    for (const rc of rival.cities) {
      const ry = rivalCityYields(state, rival, rc);
      L.push(`${p}RC${r} ${rc.centerIndex} = pop${rc.population} pr${Math.round((rc.queue[0]?.progress ?? 0)*1000)} co${Math.round(frontCost(rc)*1000)} k${rc.queue[0]?.kind ?? 'idle'} hp${rc.hp} loy${Math.round((rc.loyalty ?? 100)*1000)} cb${Math.round(rc.cultureBox*1000)} til${rc.tilesAcquired} ryf${Math.round(ry.food*1000)} ryp${Math.round(ry.production*1000)}`);
    }
  }
  return L;
}
