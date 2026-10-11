/**
 * THE WORLD CONGRESS'S VALID TARGETS: what a resolution offers a player, as
 * DLC/Expansion2/Scripts/WorldCongress.lua's ValidationLua handlers give it
 * (`options.ResolutionOptions`) — the candidates in the game's database
 * order (`cpu/data/congressTargets.ts`), each mapped to the engine's target
 * index of its kind, filtered live: an alive major met or the player itself
 * (`met`), a luxury the map holds (`onMap`), a district whose prerequisite
 * eras lie at or before the game era (`era`), a great person class with a
 * person still to earn (`gpAvail`), a founded religion — its founder's seat
 * (`founded`). A candidate the engine does not model stays in the list as
 * target -1, so a draw over the list runs over the game's range.
 * `_congress_targets` is the GPU twin (rules `congressTargets`).
 */
import { CONGRESS_TARGET_TABLES } from '../data/congressTargets';
import { CONGRESS_RESOLUTIONS, UDT_DISTRICTS } from '../data/seats';
import { GOVERNMENTS, GOVERNMENT_LIST } from '../data/policies';
import { PROJECTS, PROJECT_LIST } from '../data/projects';
import { BUILDINGS, POWER_PLANT_IDS } from '../data/buildings';
import { DISTRICTS } from '../data/districts';
import { GP_CLASSES } from '../data/greatPeople';
import { CITY_STATE_TYPES } from '../data/cityStates';
import { PROMO_CLASSES } from '../data/promotions';
import { SPY_MISSIONS, SPY_OFFENSIVE_MISSIONS } from '../data/espionage';
import { engineId } from '../data/aliases';
import { LUXURY_IDS, RESOURCES } from '../../world/resources';
import { clearableFeatures } from '../../world/features';
import type { GameState, GreatPersonClass } from './types';
import { isCiv, majorsMet, unitsOf } from './seats';
import { gpOffer } from './greatPeople';

/** the install ResolutionType an engine resolution stands for (its
 *  `target` tag's row), null for a row the install lacks */
export function congressInstallType(res: number): string | null {
  const src = CONGRESS_RESOLUTIONS[res]?.src as { target?: { where?: string } } | undefined;
  const m = /ResolutionType=(\S+)/.exec(src?.target?.where ?? '');
  return m ? m[1] : null;
}

const CURRENCY_YIELDS = ['YIELD_PRODUCTION', 'YIELD_GOLD', 'YIELD_FAITH'];
const PROMO_GAME: Readonly<Record<string, string>> = {
  PROMOTION_CLASS_ANTI_CAVALRY: 'ANTICAV', PROMOTION_CLASS_LIGHT_CAVALRY: 'LIGHT_CAV', PROMOTION_CLASS_HEAVY_CAVALRY: 'HEAVY_CAV',
};
const CLEARABLE = clearableFeatures();

/** the engine's target index of a candidate of a TargetKind, -1 for one the
 *  engine does not model */
export function congressEngineTarget(kind: string, type: string): number {
  switch (kind) {
    case 'RESOURCE': return LUXURY_IDS.indexOf(engineId('resource', type, 'RESOURCE_', RESOURCES) ?? '');
    case 'YIELD': return CURRENCY_YIELDS.indexOf(type);
    case 'GREATWORKOBJECT': return CONGRESS_TARGET_TABLES.WC_RES_HERITAGE_ORG.entries.findIndex((e) => e.type === type);
    case 'GOVERNMENT': {
      const id = engineId('government', type, 'GOVERNMENT_', GOVERNMENTS);
      return id ? GOVERNMENT_LIST.findIndex((g) => g.id === id) : -1;
    }
    case 'DISTRICT': return UDT_DISTRICTS.indexOf((engineId('district', type, 'DISTRICT_', DISTRICTS) ?? '') as never);
    case 'PROJECT': {
      const id = engineId('project', type, 'PROJECT_', PROJECTS);
      return id ? PROJECT_LIST.findIndex((p) => p.id === id) : -1;
    }
    case 'GREATPERSONCLASS': return GP_CLASSES.indexOf(type.replace(/^GREAT_PERSON_CLASS_/, '') as GreatPersonClass);
    case 'BUILDING': return POWER_PLANT_IDS.indexOf(engineId('building', type, 'BUILDING_', BUILDINGS) ?? '');
    case 'MINORCIVBONUS': return CITY_STATE_TYPES.indexOf(type.replace(/^MINOR_CIV_BONUS_/, '').toLowerCase() as never);
    case 'FEATURE': return CLEARABLE.indexOf(type.replace(/^FEATURE_/, ''));
    case 'UNITOPERATION': {
      const i = SPY_MISSIONS.findIndex((m) => `UNITOPERATION_SPY_${m.id}` === type);
      return SPY_OFFENSIVE_MISSIONS.indexOf(i);
    }
    case 'UNITPROMOTIONCLASS': return (PROMO_CLASSES as readonly string[]).indexOf(PROMO_GAME[type] ?? type.replace(/^PROMOTION_CLASS_/, ''));
    default: return -1;
  }
}

/** a resolution's candidates as the engine's targets, in the game's order:
 *  [the engine target, the database index, the prerequisite era] */
export function congressCandidates(type: string): readonly { target: number; index: number; era: number }[] {
  const t = CONGRESS_TARGET_TABLES[type];
  if (!t) return [];
  return t.entries.map((e) => ({ target: congressEngineTarget(t.kind, e.type), index: e.index, era: e.era ?? 0 }));
}

/** THE TARGETS resolution `res` offers `seat` now, the engine's indices in
 *  the game's order; empty for a resolution the install lacks */
export function congressTargets(state: GameState, seat: number, res: number): number[] {
  const type = congressInstallType(res);
  return type ? congressTargetsOf(state, seat, type) : [];
}

/** THE TARGETS the install's ResolutionType offers `seat` now */
export function congressTargetsOf(state: GameState, seat: number, type: string): number[] {
  const t = CONGRESS_TARGET_TABLES[type];
  if (!t) return [];
  // PlayerManager.GetAliveMajors: a major holding a city or a unit
  const alive = (s: number) => isCiv(s) && ((state.seats[s]?.cities.length ?? 0) > 0 || unitsOf(state, s).length > 0);
  switch (t.filter) {
    case 'met':
      return state.seats.map((s) => s.seat).filter((s) => alive(s) && (s === seat || majorsMet(state, seat, s)));
    case 'founded':
      return state.seats.filter((s) => isCiv(s.seat) && !!s.religion.type).map((s) => s.seat);
    default: break;
  }
  const out: number[] = [];
  for (const c of congressCandidates(type)) {
    if (t.filter === 'onMap' && !state.map.tiles.some((tile) => tile.resource !== null && LUXURY_IDS.indexOf(tile.resource) === c.target && c.target >= 0)) continue;
    if (t.filter === 'era' && c.era > (state.gameEra ?? 0)) continue;
    if (t.filter === 'gpAvail' && (c.target < 0 || gpOffer(state, GP_CLASSES[c.target]) === -2)) continue;
    out.push(c.target);
  }
  return out;
}
