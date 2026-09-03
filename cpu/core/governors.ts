import type { City, GameState, Governor, Seat, Tile } from './types';
import { cityAtTile, citiesOf, seatOf } from './seats';
import { hexDistance, neighbors } from '../../world/hex';
import { GP_CITY_PERM } from '../data/greatPeople';
import type { GpAppeal } from './appeal';
import { seatBuildingSum } from './city';
import { cityDistrictSum } from './yields';
import { congressGovernorFavorType } from './congress';
import { getModifiers } from './effects';
import {
  GOVERNORS, GOVERNOR_PROMOTIONS, GOVERNOR_DEFAULT_PROMOTION, GOVERNOR_TITLE_CIVICS,
  GOVERNANCE_DOCTRINE_FAVOR, promotionBit, promotionBitValue, type GovernorEffects,
} from '../data/governors';

/**
 * THE GOVERNOR ROSTER. Seven agents per seat, each appointed with a Governor
 * Title, assigned to one city, and promoted with further titles.
 *
 * CIV6 (Governor): the Loyalty boost "transfers immediately" on assignment
 * while the ABILITIES wait out the establishment clock — so a city can hold a
 * governor for loyalty and pay nothing else for several turns.
 */

/** an empty roster — one slot per catalog governor, none appointed. */
export function emptyGovernors(): Governor[] {
  return GOVERNORS.map(() => ({ appointed: false, cityId: -1, minorId: -1, establishTurns: 0, outTurns: 0, promotions: 0 }));
}

export function governorsOf(seat: Seat): Governor[] {
  if (!seat.governors || seat.governors.length !== GOVERNORS.length) seat.governors = emptyGovernors();
  return seat.governors;
}

/**
 * CIV6 (Governor): thirteen named civics "will grant 1 Governor Title", and
 * the Government Plaza plus each of its buildings grants one more. A pillaged
 * Plaza pays none of them.
 */
export function governorTitlesEarned(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  let n = 0;
  for (const c of GOVERNOR_TITLE_CIVICS) if (s.research.civics.includes(c)) n += 1;
  n += seatBuildingSum(state, seat, 'govTitle');
  for (const city of citiesOf(state, seat)) n += cityDistrictSum(state, city, 'governorTitle');
  return n;
}

/** A title buys either an appointment or one promotion; the DEFAULT ability
 *  rides the appointment and costs nothing of its own. */
export function governorTitlesSpent(seat: Seat): number {
  let n = 0;
  for (const g of governorsOf(seat)) {
    if (!g.appointed) continue;
    n += 1 + promotionCount(g);
  }
  return n;
}

function promotionCount(g: Governor): number {
  let bits = g.promotions;
  let n = 0;
  while (bits >= 1) {
    n += bits % 2;
    bits = Math.floor(bits / 2);
  }
  return n;
}

export function governorTitlesAvailable(state: GameState, seat: number): number {
  const s = seatOf(state, seat);
  if (!s) return 0;
  return Math.max(0, governorTitlesEarned(state, seat) - governorTitlesSpent(s));
}

export function hasPromotion(g: Governor, promoIndex: number): boolean {
  return promotionBit(g.promotions, promoIndex);
}

/** Is this promotion legal for `g` right now — its governor's, not already
 *  held, and one of its prerequisites held? */
export function promotionLegal(g: Governor, gIndex: number, promoIndex: number): boolean {
  const def = GOVERNOR_PROMOTIONS[promoIndex];
  if (!def || !g.appointed) return false;
  if (def.governor !== GOVERNORS[gIndex].id) return false;
  if (def.tier === 0 || hasPromotion(g, promoIndex)) return false;
  if (!def.requires) return true;
  return def.requires.some((r) => hasPromotion(g, GOVERNOR_PROMOTIONS.findIndex((p) => p.id === r)));
}

/** The governor sitting in this city, or -1. */
export function governorAt(state: GameState, city: City): number {
  const s = seatOf(state, city.seat);
  if (!s) return -1;
  const roster = governorsOf(s);
  for (let i = 0; i < roster.length; i++) {
    if (roster[i].appointed && roster[i].cityId === city.id && roster[i].outTurns <= 0) return i;
  }
  return -1;
}

/** Is a governor SEATED here at all — the loyalty channel, which the
 *  establishment clock does not gate. */
export function cityHasGovernor(state: GameState, city: City): boolean {
  return governorAt(state, city) >= 0;
}

/** Is a governor ESTABLISHED here — the channel every ABILITY rides. */
export function cityGovernorEstablished(state: GameState, city: City): boolean {
  const i = governorAt(state, city);
  if (i < 0) return false;
  return (seatOf(state, city.seat)!.governors![i].establishTurns ?? 0) <= 0;
}

/**
 * The merged effects of the governor established in this city — the default
 * ability plus every promotion taken. An assigned-but-unestablished governor
 * pays nothing here; only the loyalty channel runs early.
 */
/** How many PROMOTIONS the governor established here has earned, its first
 *  included — Hwarang's magnitude. Zero where none is established. */
export function cityGovernorTitles(state: GameState, city: City): number {
  const i = governorAt(state, city);
  if (i < 0) return 0;
  const g = seatOf(state, city.seat)!.governors![i];
  if ((g.establishTurns ?? 0) > 0) return 0;
  let n = 1; // the DEFAULT promotion every governor arrives with
  for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) if (hasPromotion(g, p)) n += 1;
  return n;
}

export function cityGovernorEffects(state: GameState, city: City): GovernorEffects[] {
  const i = governorAt(state, city);
  if (i < 0) return [];
  const g = seatOf(state, city.seat)!.governors![i];
  if ((g.establishTurns ?? 0) > 0) return [];
  const out: GovernorEffects[] = [GOVERNOR_PROMOTIONS[GOVERNOR_DEFAULT_PROMOTION[i]].effects];
  for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
    if (hasPromotion(g, p)) out.push(GOVERNOR_PROMOTIONS[p].effects);
  }
  return out;
}

/**
 * The merged effects of the governor this seat has ESTABLISHED at this minor.
 * CIV6 (Amani): she is "the only Governor who can be assigned to a
 * City-state"; the catalog's `cityStates` flag is which. A posting still
 * establishing pays nothing, exactly as a city's does.
 */
export function minorGovernorEffects(state: GameState, seat: number, minorId: number): GovernorEffects[] {
  const s = seatOf(state, seat);
  if (!s || minorId < 0) return [];
  const roster = governorsOf(s);
  for (let i = 0; i < roster.length; i++) {
    const g = roster[i];
    if (!g.appointed || g.minorId !== minorId || (g.establishTurns ?? 0) > 0) continue;
    const out: GovernorEffects[] = [GOVERNOR_PROMOTIONS[GOVERNOR_DEFAULT_PROMOTION[i]].effects];
    for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
      if (hasPromotion(g, p)) out.push(GOVERNOR_PROMOTIONS[p].effects);
    }
    return out;
  }
  return [];
}

/** Sum one numeric channel over the city's established governor effects. */
export function governorSum(state: GameState, city: City, pick: (e: GovernorEffects) => number | undefined): number {
  let n = 0;
  for (const e of cityGovernorEffects(state, city)) n += pick(e) ?? 0;
  return n;
}

/** Multiply one channel over the city's established governor effects. */
export function governorMult(state: GameState, city: City, pick: (e: GovernorEffects) => number | undefined): number {
  let m = 1;
  for (const e of cityGovernorEffects(state, city)) m *= pick(e) ?? 1;
  return m;
}

/** Is any established governor flag set in this city? */
export function governorFlag(state: GameState, city: City, pick: (e: GovernorEffects) => boolean | undefined): boolean {
  return cityGovernorEffects(state, city).some((e) => pick(e) === true);
}

/**
 * The seat's governor turn, run once at the top of its own turn and before
 * anything reads the roster: spend the available titles, seat every idle
 * governor, then tick both clocks.
 *
 * The CHOICE is a deterministic heuristic both engines mirror exactly —
 * appoint in catalog order, promote the first legal promotion in catalog
 * order, and seat an idle governor in the seat's lowest-loyalty ungoverned
 * city (quantized milli loyalty, ties by array position). Which governor to
 * hire is a strategy decision no rule of the game settles.
 */
export function governorPhase(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const roster = governorsOf(s);

  let titles = governorTitlesAvailable(state, seat);
  while (titles > 0) {
    const next = roster.findIndex((g) => !g.appointed);
    if (next >= 0) {
      roster[next].appointed = true;
      payGovernanceDoctrine(state, s, next);
      titles -= 1;
      continue;
    }
    let took = false;
    for (let i = 0; i < roster.length && !took; i++) {
      for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
        if (!promotionLegal(roster[i], i, p)) continue;
        roster[i].promotions += promotionBitValue(p);
        payGovernanceDoctrine(state, s, i);
        took = true;
        break;
      }
    }
    if (!took) break;
    titles -= 1;
  }

  // CIV6 (Amani, Messenger): "Can be assigned to a City-state" — she is the
  // only governor the catalog sends abroad, and she goes before the cities are
  // handed out. WHICH minor is this model's own line, like every other
  // governor choice here: the one where the seat already holds the most
  // envoys, since that is where her two and Puppeteer's doubling decide a
  // suzerainty. Ties take the first in the roster.
  // the ledger is read inline here: `cityStates` reads the roster back for the
  // effective envoy count, so this module must not import it.
  const met = (state.cityStates ?? []).filter((m) => m.met.includes(seat));
  for (let i = 0; i < roster.length; i++) {
    const g = roster[i];
    if (!GOVERNORS[i].cityStates || !g.appointed) continue;
    if (g.cityId >= 0 || g.minorId >= 0 || g.outTurns > 0) continue;
    let best = -1, bestN = -1;
    for (const m of met) {
      const n = m.envoys[seat] ?? 0;
      if (n > bestN) { bestN = n; best = m.id; }
    }
    if (best < 0) continue;
    g.minorId = best;
    g.establishTurns = GOVERNORS[i].establishTurns;
  }

  // Seat every idle governor. A city already holding one is not a candidate,
  // and a neutralized governor "cannot be assigned to any city".
  const cities = citiesOf(state, seat);
  const taken = new Set<number>();
  for (const g of roster) if (g.appointed && g.cityId >= 0) taken.add(g.cityId);
  const free = cities
    .map((c, i) => ({ c, i, q: Math.round((c.loyalty ?? 100) * 1000) }))
    .filter((x) => !taken.has(x.c.id))
    .sort((a, b) => a.q - b.q || a.i - b.i);
  let at = 0;
  for (let i = 0; i < roster.length; i++) {
    const g = roster[i];
    if (!g.appointed || g.cityId >= 0 || g.minorId >= 0 || g.outTurns > 0) continue;
    if (at >= free.length) break;
    g.cityId = free[at].c.id;
    g.establishTurns = GOVERNORS[i].establishTurns;
    taken.add(g.cityId);
    at += 1;
  }

  for (const g of roster) {
    if (!g.appointed) continue;
    if (g.outTurns > 0) g.outTurns -= 1;
    // a governor whose city is gone goes back to the Palace
    if (g.cityId >= 0 && !cities.some((c) => c.id === g.cityId)) {
      g.cityId = -1;
      g.establishTurns = 0;
    }
    // ...and so does one whose MINOR is gone: a conquered city-state leaves
    // the roster entirely.
    if (g.minorId >= 0 && !(state.cityStates ?? []).some((m) => m.id === g.minorId)) {
      g.minorId = -1;
      g.establishTurns = 0;
    }
    if ((g.cityId >= 0 || g.minorId >= 0) && g.establishTurns > 0) g.establishTurns -= 1;
  }
}

/** Sum one channel over the established governor of the city owning `tile`. */
export function governorTileSum(state: GameState, tile: Tile, pick: (e: GovernorEffects) => number | undefined): number {
  const c = cityAtTile(state, tile);
  return c ? governorSum(state, c, pick) : 0;
}

/** Multiply one channel over the established governor of `tile`'s city. */
export function governorTileMult(state: GameState, tile: Tile, pick: (e: GovernorEffects) => number | undefined): number {
  const c = cityAtTile(state, tile);
  return c ? governorMult(state, c, pick) : 1;
}

/** the (seat, city id) key's stride — wider than any city id a seat can reach. */
const APPEAL_SEAT_STRIDE = 1 << 20;

/**
 * What the tile's OWNER CITY adds to its appeal — one closure over the seats'
 * cities, built once per walk.
 *
 * CIV6 (Alvar Aalto, Charles Correa): "This city provides +N Appeal to any
 * tile it owns"; (Forestry Management): "Tiles adjacent to unimproved features
 * receive +1 Appeal in this city."
 */
export function cityAppealResolver(state: GameState): GpAppeal {
  const k = GP_CITY_PERM.indexOf('appeal');
  const flat = new Map<number, number>();
  const near = new Map<number, number>();
  for (const s of state.seats) {
    for (const c of s.cities) {
      const key = c.seat * APPEAL_SEAT_STRIDE + c.id;
      const n = c.gpPerm?.[k] ?? 0;
      if (n) flat.set(key, n);
      const f = governorSum(state, c, (e) => e.appealNearFeature);
      if (f) near.set(key, f);
    }
  }
  if (flat.size === 0 && near.size === 0) return undefined;
  const map = state.map;
  return (t: Tile) => {
    if (t.ownerCity < 0) return 0;
    const key = t.ownerSeat * APPEAL_SEAT_STRIDE + t.ownerCity;
    const f = near.get(key) ?? 0;
    const beside = f > 0 && neighbors(map, t).some((n) => !!n.feature && !n.improvement);
    return (flat.get(key) ?? 0) + (beside ? f : 0);
  };
}

/** Is a flag set by the established governor of `tile`'s city? */
export function governorTileFlag(state: GameState, tile: Tile, pick: (e: GovernorEffects) => boolean | undefined): boolean {
  const c = cityAtTile(state, tile);
  return c ? governorFlag(state, c, pick) : false;
}

/**
 * CIV6 (Garrison Commander): "Your other cities within 9 tiles gain +4 Loyalty
 * per turn towards your civilization"; (Emissary): "Other cities within 9
 * tiles and not owned by you lose 2 Loyalty per turn." Both are measured from
 * the GOVERNED city's centre and neither pays the governed city itself.
 */
export function governorLoyaltyAura(state: GameState, city: City): number {
  const here = state.map.tiles[city.centerIndex];
  let n = 0;
  for (const s of state.seats) {
    for (const c of s.cities) {
      if (c.id === city.id && c.seat === city.seat) continue;
      const own = c.seat === city.seat;
      for (const e of cityGovernorEffects(state, c)) {
        const aura = own ? e.loyaltyToOwn : e.loyaltyToForeign;
        if (!aura) continue;
        const t = state.map.tiles[c.centerIndex];
        if (hexDistance(here.col, here.row, t.col, t.row) > aura.range) continue;
        n += own ? aura.loyalty : -aura.loyalty;
      }
    }
  }
  // CIV6 (Toqui, EFFECT_ADJUST_GOVERNOR_IDENTITY_PRESSURE, OncePerCity):
  // "All cities within 9 tiles of a city with your Governor gain +4 Loyalty
  // per turn towards your civilization" — ONCE per city however many governed
  // cities of that seat stand in reach, positive toward its own and negative
  // against a foreign one.
  for (const s of state.seats) {
    const rows = getModifiers(state, s.seat).governorLoyaltyRows;
    if (!rows.length) continue;
    for (const r of rows) {
      const near = s.cities.some((c) => {
        if (c.id === city.id && c.seat === city.seat) return false;
        if (!cityGovernorEffects(state, c).length) return false;
        const t = state.map.tiles[c.centerIndex];
        return hexDistance(here.col, here.row, t.col, t.row) <= r.range;
      });
      if (near) n += s.seat === city.seat ? r.amount : -r.amount;
    }
  }
  return n;
}

/** CIV6 (Neutralize Governor / Governance Doctrine B): the governor leaves
 *  the city and cannot be assigned again until the clock runs out. */
export function neutralizeGovernor(g: Governor, turns: number): void {
  g.cityId = -1;
  g.minorId = -1;
  g.establishTurns = 0;
  g.outTurns = Math.max(g.outTurns, turns);
}

/** CIV6 (Governance Doctrine, A): "Appointing and promoting a Governor of
 *  this type yields 15 Diplomatic Favor." */
function payGovernanceDoctrine(state: GameState, s: Seat, governor: number): void {
  if (congressGovernorFavorType(state) !== governor) return;
  s.diplomaticFavor = (s.diplomaticFavor ?? 0) + GOVERNANCE_DOCTRINE_FAVOR;
}
