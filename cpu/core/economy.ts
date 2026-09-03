
import { seatOf, tileSeat, cityAtTile, citiesOf, isCiv, unitSeat , leaderOf, enkiduAllies, unitsOf, NO_SEAT } from './seats';
import { HARDRADA_PILLAGE, ENKIDU_SHARE_RANGE } from '../data/civilizations';
import { hexDistance } from '../../world/hex';

import type { City, GameState, PlunderKind, PlunderRow, ResearchState, Seat, Tile, Unit, YieldKey } from './types';
import { getModifiers } from './effects';
import { UNIT_HP } from '../data/units';
import { BUILDINGS } from '../data/buildings';
import { governorTileMult } from './governors';
import { computeUnlocksIn } from './effects';
import { repairDrip } from './rules';
import { FEATURES } from '../../world/features';
import { RESOURCES } from '../../world/resources';

/**
 * SELECT a tech or civic, keeping the progress on the one being left.
 *
 * CIV6: research switches freely — a switched-away item retains its
 * progress and hands it back when re-picked, and the overflow a completion
 * leaves carries into whatever is picked next. The pool belongs to the
 * current item; with nothing current it holds unowned completion overflow.
 * So a switch parks the WHOLE pool under the outgoing id, and a pick loads
 * the incoming id's parked value plus any unowned overflow.
 *
 * Selecting the SAME id is a no-op rather than a park-and-reload, so a record
 * that re-states the current pick cannot round-trip the pool through the map.
 */
export function selectResearch(rsr: ResearchState, id: string | null, isCivic = false): void {
  const cur = isCivic ? rsr.civic : rsr.tech;
  if (cur === id) return;
  const retained = isCivic ? rsr.civicRetained : rsr.techRetained;
  const pool = isCivic ? rsr.civicProgress : rsr.techProgress;
  if (cur) retained[cur] = pool;
  const next = (cur ? 0 : pool) + (id ? retained[id] ?? 0 : 0);
  if (id) delete retained[id];
  if (isCivic) {
    rsr.civic = id;
    rsr.civicProgress = next;
  } else {
    rsr.tech = id;
    rsr.techProgress = next;
  }
}

/**
 * CIV6 (harvest/plunder progression): a lump scales with the LARGER of tech
 * progress (of the 67-tech tree) and civic progress (of the 50-civic tree),
 * x10 at 100% — the chop's 20 becomes 200, a quarry harvest's 25 becomes 250.
 */
export function progressScale(r: ResearchState | undefined): number {
  return 1 + 9 * Math.max((r?.techs.length ?? 0) / 67, (r?.civics.length ?? 0) / 50);
}

/** CIV6: the base 20 of a feature chop, on the progression above, times the
 *  Groundbreaker's "+50% yields from plot harvests and feature removals in
 *  city" where the worked tile belongs to a city that holds it. */
/** CIV6: a chop or a harvest pays a lump that scales with game PROGRESS.
 *  `base` is the table's own figure — a feature chop's 20, or the resource's
 *  own `harvestAmount` (`Resource_Harvests.Amount`: 20 for Food and
 *  Production, 40 for the two Gold ones). Required, not defaulted: a caller
 *  that forgot it would quietly pay a chop's rate for a harvest. */
export function chopValue(state: GameState, seat: number, at: Tile | undefined, base: number): number {
  const mult = at ? governorTileMult(state, at, (e) => e.harvestMult) : 1;
  return Math.round(base * progressScale(seatOf(state, seat)?.research) * mult);
}

/** The base a FEATURE chop pays before the progress scale. */
export const CHOP_BASE = 20;

/**
 * CIV6 (Pillaging): pay the pillager what the wrecked target's plunder row
 * says. HEAL is a flat HP lump; every other kind is a progress-scaled yield
 * lump into the pillager's own purse, times the policy multiplier
 * (`TOTAL_WAR`). A seat with no purse — barbarians, a minor's walker —
 * still heals; only a major banks. The Grand Master's Chapel's flat faith
 * rides EVERY wreck a major makes, whatever the plunder row says.
 */
function payPlunder(s: Seat, kind: PlunderKind, lump: number): void {
  if (kind === 'gold') s.treasury += lump;
  else if (kind === 'faith') s.faith += lump;
  else if (kind === 'science') s.research.techProgress += lump;
  else s.research.civicProgress += lump;
}

/** `improvement` and `foe` (the wrecked tile's owner) feed the leader clauses:
 *  Hardrada's extra purses and Gilgamesh's shared plunder. */
export function pillagePlunder(
  state: GameState, unit: Unit, row: PlunderRow | undefined, district = false,
  improvement?: string, foe: number = NO_SEAT,
): void {
  const seat = unitSeat(unit);
  if (isCiv(seat)) {
    const cs = seatOf(state, seat);
    if (cs) {
      let chap = 0;
      for (const c of citiesOf(state, seat)) {
        for (const b of c.buildings) {
          const v = district ? BUILDINGS[b]?.pillageFaithDist : BUILDINGS[b]?.pillageFaithImp;
          if (v && v > chap) chap = v;
        }
      }
      if (chap) cs.faith += chap;
    }
  }
  if (row && row.amount > 0 && row.kind === 'heal') {
    unit.hp = Math.min(UNIT_HP, unit.hp + row.amount);
    return;
  }
  if (!isCiv(seat)) return;
  const s = seatOf(state, seat);
  if (!s) return;
  const scale = progressScale(s.research) * getModifiers(state, seat).pillageMult;
  const lumps: { kind: PlunderKind; lump: number }[] = [];
  if (row && row.amount > 0) lumps.push({ kind: row.kind, lump: Math.round(row.amount * scale) });
  // CIV6 (Thunderbolt of the North): Science from a Mine, Culture from a
  // Quarry, Pasture, Plantation or Camp — on top of the row, scaled the same.
  if (improvement && leaderOf(state, seat) === 'HARDRADA') {
    for (const x of HARDRADA_PILLAGE) {
      if (x.improvement === improvement) lumps.push({ kind: x.kind, lump: Math.round(x.amount * scale) });
    }
  }
  for (const l of lumps) payPlunder(s, l.kind, l.lump);
  // CIV6 (Adventures of Enkidu): "they and their allies share pillage
  // rewards ... if within 5 tiles" — an ally at war with the tile's owner
  // with a unit within range of the wrecker takes the same lumps.
  if (lumps.length === 0) return;
  const at = state.map.tiles[unit.tileIndex];
  for (const o of enkiduAllies(state, seat, foe)) {
    const near = unitsOf(state, o).some((u) => {
      const ut = state.map.tiles[u.tileIndex];
      return u.hp > 0 && hexDistance(at.col, at.row, ut.col, ut.row) <= ENKIDU_SHARE_RANGE;
    });
    const os = seatOf(state, o);
    if (near && os) for (const l of lumps) payPlunder(os, l.kind, l.lump);
  }
}

export interface LumpGrant {
  key: YieldKey;
  amount: number;
}

export function chopGrant(state: GameState, tile: Tile, seat: number): LumpGrant | null {
  if (!tile.feature) return null;
  const key = FEATURES[tile.feature]?.chopYield;
  if (!key) return null;
  if (tileSeat(tile) !== seat) return null;
  return { key, amount: chopValue(state, seat, tile, CHOP_BASE) };
}

export function harvestGrant(state: GameState, tile: Tile, seat: number): LumpGrant | null {
  if (!tile.resource) return null;
  const res = RESOURCES[tile.resource];
  if (!res?.harvestYield) return null;
  if (tileSeat(tile) !== seat) return null;
  // Harvesting needs the tech that works the resource (eyeballed Civ 6
  // gating) — THIS seat's tech.
  const rs = seatOf(state, seat)?.research;
  if (!rs) return null;
  if (!state.sandbox && !computeUnlocksIn(rs, getModifiers(state, seat).districtPrereq).improvements.has(res.improvement)) return null;
  return { key: res.harvestYield, amount: chopValue(state, seat, tile, res.harvestAmount ?? CHOP_BASE) };
}

export function applyLumpYield(
  state: GameState,
  tileIndex: number,
  grant: LumpGrant,
  seat: number,
): void {
  const { key, amount } = grant;
  const s = seatOf(state, seat);
  if (!s) return;
  if (key === 'gold') {
    s.treasury += amount;
    return;
  }
  if (key === 'faith') {
    s.faith += amount;
    return;
  }
  if (key === 'science') {
    s.research.techProgress += amount;
    s.scienceTotal += amount;
    return;
  }
  // (selectResearch, below, is the only other writer of the progress pool.)
  if (key === 'culture') {
    s.research.civicProgress += amount;
    s.cultureTotal += amount;
    return;
  }
  const city = cityAtTile(state, state.map.tiles[tileIndex]) as City | undefined;
  if (!city) return;
  if (key === 'food') {
    city.foodBox += amount;
    return;
  }
  if (city.queue.length > 0) {
    const before = city.queue[0].progress;
    city.queue[0].progress += amount;
    repairDrip(state, city, before);
  } else {
    city.productionBank = (city.productionBank ?? 0) + amount;
  }
}
