/**
 * A SEAT'S UNIT PRODUCTION ENTRIES FOR ITS OPERATIONS (`aiUnitProduction.ts`
 * 0x7989e0 as the unit choice 0x79bd30 reads it): its own versions of the
 * units, the knowledge base's counts per player, the players it fights, and
 * each unit buildable (+0x0e).
 */
import { AI_UNITS } from '../../data/aiBuildTables';
import { AI_UNIT_INDEX } from '../aiCityBuild';
import { unitProductionEntries, type UnitProductionRow } from '../aiUnitProduction';
import { majorTraits } from '../freeCityBuild';
import { installType } from '../minorBuild';
import { isCityStateSeat, seatOf } from '../seats';
import { CIVICS } from '../../data/civics';
import { RESOURCES } from '../../../world/resources';
import { TECHS } from '../../data/techs';
import { UNITS } from '../../data/units';
import { engineId } from '../../data/aliases';
import { researchable } from '../aiResearch';
import type { GameState } from '../types';
import { stockFree, stockpileIncome, strategicSlot, unitUpkeepBill } from '../stockpile';

/** a city-state's version of a unit (player +0x12e8 +0x1c0): a unit it may
 *  train of no trait that a major alone may not train */
const minorVersion = (u: string): string | null => {
  const row = AI_UNITS[AI_UNIT_INDEX.get(u) ?? -1];
  return row && row.canTrain && !row.trait && !row.majorOnly ? u : null;
};

/** a major's version of a unit: its own unique unit where one of its
 *  traits' stands in place of it; another trait's unique unit, or one it
 *  cannot train, none */
function majorVersion(traits: readonly string[]): (u: string) => string | null {
  return (u) => {
    const row = AI_UNITS[AI_UNIT_INDEX.get(u) ?? -1];
    if (!row || !row.canTrain) return null;
    if (row.trait) return traits.includes(row.trait) ? u : null;
    const base = engineId('unit', u, 'UNIT_', UNITS);
    const unique = AI_UNITS.find((x) => x.trait && traits.includes(x.trait)
      && engineId('unit', x.type, 'UNIT_', UNITS) !== null && UNITS[engineId('unit', x.type, 'UNIT_', UNITS)!]?.replaces === base);
    return unique ? unique.type : u;
  };
}

/**
 * THE MILITARY AI'S FAVOURED TECHNOLOGY (AI::Military +0xd88, AI_Military.csv's
 * "Fav Tech"; 0x71fb80 at 0x721b12): over the seat's unit production entries
 * in the Units' database order (`seatUnitRows` on its knowledge base's
 * records `records`, the players it fights `atWar`) — an entry not of the
 * sea (+0x0a), not buildable (+0x0e), whose at-war players' sum (+0x2c) is
 * above the best so far (from 0) and whose PrereqTech the seat may research
 * now (0x4c8c40) sets it, its sum the best; null (NO_TECH) for none.
 * runs/h1_duely1127 t1-t130: 466 of 513 city-state and Free Cities turns as
 * logged (the Free Cities' Archery at t33, Iron Working t35, Horseback
 * Riding from t36).
 */
export function militaryFavTech(state: GameState, seat: number, records: readonly { type: string; owner: number }[],
                                atWar: (player: number) => boolean): string | null {
  const s = seatOf(state, seat);
  if (!s) return null;
  const by = new Map<string, number>();
  const players = new Set<number>();
  for (const r of records) {
    const k = `${installType('unit', r.type, 'UNIT_')}|${r.owner}`;
    by.set(k, (by.get(k) ?? 0) + 1);
    players.add(r.owner);
  }
  const rows = seatUnitRows(state, seat, (u, p) => by.get(`${u}|${p}`) ?? 0, [...players].sort((a, b) => a - b), atWar);
  let fav: string | null = null;
  let best = 0;
  for (const row of rows) {
    const u = AI_UNITS[AI_UNIT_INDEX.get(row.unit)!];
    if (u.domain === 'DOMAIN_SEA' || row.buildable || row.atWar <= best || !u.tech) continue;
    const tech = engineId('tech', u.tech, 'TECH_', TECHS);
    if (!tech || !researchable(s.research, tech)) continue;
    fav = tech;
    best = row.atWar;
  }
  return fav;
}

/** the table's +0x0e (0x7989e0 at 0x798cc2): the install unit `u`'s
 *  PrereqTech and PrereqCivic held (`holds`) and its StrategicResource's
 *  stock less its reservations above 0 (0x4aa790, ownership 0) */
export function unitBuildable(state: GameState, seat: number, holds: (x: string) => boolean, u: string): boolean {
  const row = AI_UNITS[AI_UNIT_INDEX.get(u)!];
  if ((row.tech && !holds(row.tech)) || (row.civic && !holds(row.civic))) return false;
  if (!row.resource) return true;
  const id = engineId('resource', row.resource, 'RESOURCE_', RESOURCES);
  return !!id && stockFree(state, seat, id) > 0;
}

/** the entries of `seat` against its knowledge base's counts `knownBy` (per
 *  unit type and player), the game's players `players` and those it fights
 *  `atWar`. A unit is buildable where the seat holds its PrereqTech and
 *  PrereqCivic (0x4cb590, 0x39d490) and its StrategicResource's stock less
 *  its reservations is above 0 (0x7989e0 at 0x798d11: 0x4aa790, ownership
 *  0, the reservations off). */
export function seatUnitRows(state: GameState, seat: number, knownBy: (unit: string, player: number) => number,
                             players: readonly number[], atWar: (player: number) => boolean): UnitProductionRow[] {
  const s = seatOf(state, seat);
  if (!s) return [];
  const r = s.research;
  const holds = (x: string): boolean => {
    const t = x.startsWith('TECH_') ? engineId('tech', x, 'TECH_', TECHS) : null;
    const c = x.startsWith('CIVIC_') ? engineId('civic', x, 'CIVIC_', CIVICS) : null;
    return (!!t && r.techs.includes(t)) || (!!c && r.civics.includes(c));
  };
  const version = isCityStateSeat(seat) ? minorVersion : majorVersion(majorTraits(state, seat));
  const own = new Map<string, number>();
  for (const u of state.units) {
    if (u.seat !== seat) continue;
    const t = installType('unit', u.type, 'UNIT_');
    own.set(t, (own.get(t) ?? 0) + 1);
  }
  const income = stockpileIncome(state, seat);
  const bill = unitUpkeepBill(state, seat);
  return unitProductionEntries({
    isVersion: (u) => version(u) === u,
    obsolete: (u) => AI_UNITS[AI_UNIT_INDEX.get(u)!].obsolete.some(holds),
    owned: (u) => own.get(u) ?? 0,
    known: (u) => players.reduce((n, p) => n + knownBy(u, p), 0),
    knownBy,
    players,
    atWar,
    buildable: (u) => unitBuildable(state, seat, holds, u),
    maintained: (res) => {
      const id = engineId('resource', res, 'RESOURCE_', RESOURCES);
      const k = id ? strategicSlot(id) : -1;
      return k < 0 || income[k] > bill[k];
    },
  });
}
