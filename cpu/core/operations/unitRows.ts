/**
 * A SEAT'S UNIT PRODUCTION ENTRIES FOR ITS OPERATIONS (`aiUnitProduction.ts`
 * 0x7989e0 as the unit choice 0x79bd30 reads it): its own versions of the
 * units, the knowledge base's counts per player, the players it fights, and
 * each unit buildable (+0x0e).
 */
import { AI_UNITS } from '../../data/aiBuildTables';
import { AI_UNIT_INDEX } from '../aiCityBuild';
import { unitProductionEntries, type UnitProductionRow } from '../aiUnitProduction';
import { majorTraits } from '../majorCityBuild';
import { installType } from '../minorBuild';
import { isCityStateSeat, seatOf } from '../seats';
import { CIVICS } from '../../data/civics';
import { RESOURCES } from '../../../world/resources';
import { TECHS } from '../../data/techs';
import { UNITS } from '../../data/units';
import { engineId } from '../../data/aliases';
import type { GameState } from '../types';

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

/** the entries of `seat` against its knowledge base's counts `knownBy` (per
 *  unit type and player), the game's players `players` and those it fights
 *  `atWar`. A unit is buildable where the seat holds its PrereqTech and
 *  PrereqCivic and owns a plot of its StrategicResource (0x4aa790's owned
 *  count above 0). */
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
    const t = installType('unit', u.type, 'UNIT_', UNITS);
    own.set(t, (own.get(t) ?? 0) + 1);
  }
  const owned = new Set<string>();
  for (const t of state.map.tiles) if (t.ownerSeat === seat && t.resource) owned.add(t.resource);
  return unitProductionEntries({
    isVersion: (u) => version(u) === u,
    obsolete: (u) => AI_UNITS[AI_UNIT_INDEX.get(u)!].obsolete.some(holds),
    owned: (u) => own.get(u) ?? 0,
    known: (u) => players.reduce((n, p) => n + knownBy(u, p), 0),
    knownBy,
    players,
    atWar,
    buildable: (u) => {
      const row = AI_UNITS[AI_UNIT_INDEX.get(u)!];
      if ((row.tech && !holds(row.tech)) || (row.civic && !holds(row.civic))) return false;
      if (!row.resource) return true;
      const id = engineId('resource', row.resource, 'RESOURCE_', RESOURCES);
      return !!id && owned.has(id);
    },
  });
}
