import { addYields, emptyYields, type City, type GameState, type Governor, type Seat, type Tile, type Yields } from './types';
import { cityAtTile, citiesOf, isCityStateSeat, seatOf } from './seats';
import { hexDistance } from '../../world/hex';
import { type FeatureAppealRow } from '../data/civilizations';
import { GP_CITY_PERM } from '../data/greatPeople';
import { FEATURE_ADD_CIVIC } from '../data/appeal';
import type { GpAppeal } from './appeal';
import { seatBuildingSum, cityHasPark, growthDetachResidue } from './city';
import { cityDistrictSum, darkBuildings } from './yields';
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

/** The ids of the seat's cities an appointed governor holds, seated and not
 *  in transit. */
export function governedCityIds(seat: Seat): Set<number> {
  return new Set(governorsOf(seat)
    .filter((g) => g.appointed && g.cityId >= 0 && g.outTurns <= 0)
    .map((g) => g.cityId));
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
  // CIV6 (Grand Vizier): "Gain ... a Governor Title when the Gunpowder
  // technology is researched" — RunOnce, and a title is DERIVED here, so the
  // held tech is what makes it permanent (`GOVERNOR_TITLE_GRANT_ROWS`)
  for (const r of getModifiers(state, seat).governorTitleGrants) {
    if (s.research.techs.includes(r.tech)) n += r.amount;
  }
  n += s.grantedTitles;
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
function promotionLegal(g: Governor, gIndex: number, promoIndex: number): boolean {
  const def = GOVERNOR_PROMOTIONS[promoIndex];
  if (!def || !g.appointed) return false;
  if (def.governor !== GOVERNORS[gIndex].id) return false;
  if (def.tier === 0 || hasPromotion(g, promoIndex)) return false;
  if (!def.requires) return true;
  return def.requires.some((r) => hasPromotion(g, GOVERNOR_PROMOTIONS.findIndex((p) => p.id === r)));
}

/** The governor sitting in this city, or -1. */
export function governorAt(state: GameState, city: City): number {
  // a city-state appoints no governor of its own — Amani sits at a minor on
  // her PATRON's roster (`minorGovernorEffects`), never on the minor's
  if (isCityStateSeat(city.seat)) return -1;
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

/**
 * The merged effects of the governor established in this city — the default
 * ability plus every promotion taken. An assigned-but-unestablished governor
 * pays nothing here; only the loyalty channel runs early.
 */
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
 * THE PROMOTIONS this city's ESTABLISHED governor holds, by catalog id.
 *
 * `cityGovernorEffects` merges the effect ROWS, which is what a numeric
 * channel wants; a rule that names a promotion (the Fishery's Aquaculture,
 * the City Park's Parks and Recreation) needs the ids themselves. Same
 * establishment rule: a posting still establishing holds none.
 */
export function cityGovernorPromos(state: GameState, city: City): ReadonlySet<string> {
  const out = new Set<string>();
  const i = governorAt(state, city);
  if (i < 0) return out;
  const g = seatOf(state, city.seat)!.governors![i];
  if ((g.establishTurns ?? 0) > 0) return out;
  out.add(GOVERNOR_PROMOTIONS[GOVERNOR_DEFAULT_PROMOTION[i]].id);
  for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
    if (hasPromotion(g, p)) out.add(GOVERNOR_PROMOTIONS[p].id);
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

/** CIV6 (MODIFIER_BUILDING_YIELD_CHANGE on a promotion — Industrialist's
 *  plants, Renewable Subsidizer's Dam): what the named buildings of this city
 *  pay on top while its established governor holds the promotion. A dark
 *  building (a pillaged district's, or pillaged itself) pays nothing, and the
 *  change stays with the governed city whatever reach the building has. */
export function governorBuildingYields(state: GameState, city: City): Yields {
  const out = emptyYields();
  const fx = cityGovernorEffects(state, city);
  if (!fx.some((e) => e.buildingYields)) return out;
  const dark = darkBuildings(state.map, city);
  for (const e of fx) {
    for (const [id, y] of Object.entries(e.buildingYields ?? {})) {
      if (city.buildings.includes(id) && !dark.has(id)) addYields(out, y);
    }
  }
  return out;
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
/** APPOINT governor `i` with a title. False when it already serves or the
 *  seat holds no title to spend. */
export function appointGovernor(state: GameState, seat: number, i: number): boolean {
  const s = seatOf(state, seat);
  const g = s ? governorsOf(s)[i] : undefined;
  if (!s || !g || g.appointed || governorTitlesAvailable(state, seat) <= 0) return false;
  g.appointed = true;
  payGovernanceDoctrine(state, s, i);
  return true;
}

/** PROMOTE governor `i` with title `p` (an index of GOVERNOR_PROMOTIONS).
 *  False when the promotion is not open to it or no title is left. */
export function promoteGovernor(state: GameState, seat: number, i: number, p: number): boolean {
  const s = seatOf(state, seat);
  const g = s ? governorsOf(s)[i] : undefined;
  if (!s || !g || !promotionLegal(g, i, p) || governorTitlesAvailable(state, seat) <= 0) return false;
  g.promotions += promotionBitValue(p);
  payGovernanceDoctrine(state, s, i);
  return true;
}

/** ASSIGN appointed governor `i` to one of the seat's cities (`cityId`) or,
 *  for a governor the catalog sends abroad, a city-state (`minorId`); the
 *  establishment clock starts over. A neutralized governor "cannot be
 *  assigned to any city", and a city holds one governor. */
export function assignGovernor(state: GameState, seat: number, i: number, to: { cityId?: number; minorId?: number }): boolean {
  const s = seatOf(state, seat);
  const roster = s ? governorsOf(s) : [];
  const g = roster[i];
  if (!s || !g || !g.appointed || g.outTurns > 0) return false;
  if (to.minorId !== undefined) {
    if (!GOVERNORS[i].cityStates || !(state.cityStates ?? []).some((m) => m.id === to.minorId)) return false;
    g.cityId = -1;
    g.minorId = to.minorId;
  } else {
    if (!citiesOf(state, seat).some((c) => c.id === to.cityId)) return false;
    if (roster.some((o, k) => k !== i && o.appointed && o.cityId === to.cityId)) return false;
    g.cityId = to.cityId!;
    g.minorId = -1;
  }
  g.establishTurns = GOVERNORS[i].establishTurns;
  return true;
}

export function governorPhase(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const roster = governorsOf(s);

  let titles = governorTitlesAvailable(state, seat);
  while (titles > 0) {
    const next = roster.findIndex((g) => !g.appointed);
    if (next >= 0) {
      appointGovernor(state, seat, next);
      titles -= 1;
      continue;
    }
    let took = false;
    for (let i = 0; i < roster.length && !took; i++) {
      for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
        if (!promotionLegal(roster[i], i, p)) continue;
        promoteGovernor(state, seat, i, p);
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
    assignGovernor(state, seat, i, { minorId: best });
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
    assignGovernor(state, seat, i, { cityId: free[at].c.id });
    taken.add(g.cityId);
    at += 1;
  }
  governorClocks(state, seat);
}

/** The seat's governor clocks, in its turn processing before its cities: the
 *  neutralize clock, a governor whose city or minor is gone back to the
 *  Palace, and the establishment clock (the processing that brings it to 0
 *  already reads the governor established). */
export function governorClocks(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  const roster = governorsOf(s);
  const cities = citiesOf(state, seat);
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
  }
}

/** THE ESTABLISHMENT CLOCK ticks after the seat's cities have yielded and
 *  before its tallies: a governor assigned with N turns to go reads
 *  established N records on, her city abilities paying from the turn after
 *  (runs/h1_duelw1117 China's Pingala: assigned at t28, established at t33,
 *  her +15% Culture first in the progress t33→t34) while the envoys she
 *  brings count in that turn's Favor (runs/h1_duelw1118 China's Amani:
 *  assigned at t29, established at t34 with China's first Favor). 1116 /
 *  1117 / 1118: every one of 30 assignments established its EstablishTurns
 *  records on. */
export function tickGovernors(state: GameState, seat: number): void {
  const s = seatOf(state, seat);
  if (!s) return;
  for (const g of governorsOf(s)) {
    if (g.appointed && (g.cityId >= 0 || g.minorId >= 0) && g.establishTurns > 0) g.establishTurns -= 1;
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
 * What the plots' OWNER CITIES add to appeal (`AppealOwners`) — one closure
 * over the seats' cities, built once per walk.
 *
 * CIV6 (Alvar Aalto, Charles Correa): "This city provides +N Appeal to any
 * tile it owns" — the plot's own city. (Forestry Management): "Tiles
 * adjacent to unimproved features receive +1 Appeal in this city" — GameCore
 * Rules_Appeal 0x513780 pays it per NEIGHBOUR holding a feature and no
 * improvement, through that neighbour's own city's governor, as it does the
 * feature appeal rows (Amazon).
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
  // CIV6 (Roosevelt Corollary): "+1 Appeal to all tiles in a city with a
  // National Park" — a per-CITY flat add, which is exactly what this resolver
  // already carries for the Great Person perk (`PARK_APPEAL_ROWS`)
  for (const s2 of state.seats) {
    const add = getModifiers(state, s2.seat).parkAppeal;
    if (!add) continue;
    for (const c of s2.cities) {
      if (!cityHasPark(state, c)) continue;
      const key = c.seat * APPEAL_SEAT_STRIDE + c.id;
      flat.set(key, (flat.get(key) ?? 0) + add);
    }
  }
  // CIV6 (Amazon): "Rainforest tiles provide +1 Appeal to adjacent tiles,
  // instead of the usual -1" — EFFECT_ADJUST_FEATURE_APPEAL_MODIFIER on the
  // seat's cities, which Rules_Appeal reads off the city holding the
  // rainforest itself.
  const feat = new Map<number, readonly FeatureAppealRow[]>();
  for (const s3 of state.seats) {
    const rows = getModifiers(state, s3.seat).featureAppeal;
    if (rows.length) feat.set(s3.seat, rows);
  }
  // CIV6 (Features.AddCivic): the civics each plot owner holds, a minor's own
  // tree included (runs/h1_duelw1116 plot 1021: Auckland's Woods +1 from the
  // turn Auckland's Conservation lands)
  const civics = new Map<number, ReadonlySet<string>>();
  for (const s4 of state.seats) civics.set(s4.seat, new Set(s4.research.civics));
  for (const cs of state.cityStates ?? []) civics.set(cs.seat, new Set(cs.research?.civics));
  const owned = (t: Tile): number => (t.ownerCity < 0 ? -1 : t.ownerSeat * APPEAL_SEAT_STRIDE + t.ownerCity);
  return {
    flat: (t) => {
      const key = owned(t);
      return key < 0 ? 0 : flat.get(key) ?? 0;
    },
    lend: (n) => {
      const key = owned(n);
      // a volcano is a feature of the game's (FEATURE_VOLCANO) the tile keeps as a flag
      if (key < 0 || (!n.feature && !n.volcano)) return 0;
      let a = n.improvement ? 0 : near.get(key) ?? 0;
      for (const r of feat.get(n.ownerSeat) ?? []) if (r.feature === n.feature) a += r.amount;
      return a;
    },
    addCivic: (t) => {
      const civic = t.feature ? FEATURE_ADD_CIVIC[t.feature] : undefined;
      return !!civic && t.ownerSeat >= 0 && !!civics.get(t.ownerSeat)?.has(civic);
    },
  };
}

/** Is a flag set by the established governor of `tile`'s city? */
export function governorTileFlag(state: GameState, tile: Tile, pick: (e: GovernorEffects) => boolean | undefined): boolean {
  const c = cityAtTile(state, tile);
  return c ? governorFlag(state, c, pick) : false;
}

/**
 * CIV6 (Garrison Commander): "+4 Loyalty per turn towards your civilization"
 * to your cities in reach; (Emissary): "-2 Loyalty per turn" to the cities in
 * reach not owned by you. Both are measured from the GOVERNED city's centre,
 * which is in its own reach (EFFECT_ADJUST_GOVERNOR_IDENTITY_PRESSURE).
 */
export function governorLoyaltyAura(state: GameState, city: City): number {
  const here = state.map.tiles[city.centerIndex];
  let n = 0;
  for (const s of state.seats) {
    for (const c of s.cities) {
      const own = c.seat === city.seat;
      for (const e of cityGovernorEffects(state, c)) {
        const aura = own ? e.loyaltyToOwn : e.loyaltyToForeign;
        if (!aura) continue;
        const t = state.map.tiles[c.centerIndex];
        if (hexDistance(state.map, here.col, here.row, t.col, t.row) > aura.range) continue;
        n += own ? aura.loyalty : -aura.loyalty;
      }
    }
  }
  // CIV6 (Toqui, EFFECT_ADJUST_GOVERNOR_IDENTITY_PRESSURE, OncePerCity):
  // "All cities ... of a city with your Governor gain +4 Loyalty per turn
  // towards your civilization" — ONCE per city however many governed cities
  // of that seat stand in reach (the governed city itself among them),
  // positive toward its own and negative against a foreign one.
  for (const s of state.seats) {
    const rows = getModifiers(state, s.seat).governorLoyaltyRows;
    if (!rows.length) continue;
    for (const r of rows) {
      const near = s.cities.some((c) => {
        if (!cityGovernorEffects(state, c).length) return false;
        const t = state.map.tiles[c.centerIndex];
        return hexDistance(state.map, here.col, here.row, t.col, t.row) <= r.range;
      });
      if (near) n += s.seat === city.seat ? r.amount : -r.amount;
    }
  }
  return n;
}

/** CIV6 (Neutralize Governor / Governance Doctrine B): the governor leaves
 *  the city and cannot be assigned again until the clock runs out. Each
 *  growth title she was paying there detaches from the city's growth
 *  accumulator, which keeps the residue (`growthDetachResidue`). */
export function neutralizeGovernor(state: GameState, seat: number, i: number, turns: number): void {
  const s = seatOf(state, seat);
  const g = s ? governorsOf(s)[i] : undefined;
  if (!g) return;
  const city = citiesOf(state, seat).find((c) => c.id === g.cityId);
  if (city && governorAt(state, city) === i) {
    for (const e of cityGovernorEffects(state, city)) {
      if (e.growthMult !== undefined) city.growthDrift = (city.growthDrift ?? 0) + growthDetachResidue(e.growthMult);
    }
  }
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
