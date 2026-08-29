
import type { City, GameState, GreatPersonClass } from './types';
import { citiesOf, seatOf, unitSeat } from './seats';
import { GP_CLASSES, GP_CLASS_DISTRICT, GREAT_PEOPLE, GW_KINDS, GW_WONDER_SLOTS, RELIC_BUILDING, RELIC_SLOTS_PER_BUILDING, RELIC_WONDER_SLOTS, gpChargesOf, gpCost, gwCapacity, gwCount } from '../data/greatPeople';
import { cityBuildingSum } from './city';
import { nextRandom } from './rand';
import { congressGppFactor } from './congress';
import { BUILDINGS } from '../data/buildings';
import { DED_SKY, ERA_SCORE_GP } from '../data/seats';
import { completedWonders, seatWonders } from './wonders';
import { addEraScore, dedicationEvent, goldenProphetPoints, worldEraIndex } from './eras';
import { getModifiers } from './effects';
import { spawnUnit } from './units';

export function greatPeopleEarned(state: GameState, cls: GreatPersonClass): number {
  return state.claimedGreatPeople.filter((id) => GREAT_PEOPLE[cls].some((p) => p.id === id)).length;
}

/** What the class's CURRENT offer costs — the price FROZEN at the draw;
 *  Infinity while no offer stands. */
export function gpOfferCost(state: GameState, cls: GreatPersonClass): number {
  const i = GP_CLASSES.indexOf(cls);
  return (state.gpOffer?.[i] ?? -1) >= 0 ? (state.gpPrice?.[i] ?? Infinity) : Infinity;
}

/** the standing offer's roster index (-1 pending, -2 exhausted) — a READ;
 *  only `ensureGpOffer` moves it, and only the seat-phase loop calls that. */
export function gpOffer(state: GameState, cls: GreatPersonClass): number {
  return state.gpOffer?.[GP_CLASSES.indexOf(cls)] ?? -1;
}

/**
 * The DRAW. CIV6: "the replacement is chosen randomly from those available
 * in the current era, or the next if all those from the current era have
 * been claimed" — the pool is the FIRST era at or past the world's with an
 * unclaimed member, and the price freezes with the pick. No pool anywhere
 * ahead = the class is exhausted for good (-2), and that verdict draws no
 * random. ONLY the seat-phase loop may call this — a draw consumes the
 * shared RNG stream, and the GPU twin sits at the same loop position.
 */
export function ensureGpOffer(state: GameState, cls: GreatPersonClass): void {
  const i = GP_CLASSES.indexOf(cls);
  state.gpOffer ??= GP_CLASSES.map(() => -1);
  state.gpPrice ??= GP_CLASSES.map(() => 0);
  if (state.gpOffer[i] !== -1) return;
  const roster = GREAT_PEOPLE[cls];
  const we = Math.max(0, Math.min(worldEraIndex(state), 8));
  const claimed = new Set(state.claimedGreatPeople);
  let pool: number[] = [];
  for (let e = we; e <= 8 && pool.length === 0; e++) {
    pool = roster.flatMap((p, at) => (p.era === e && !claimed.has(p.id) ? [at] : []));
  }
  if (pool.length === 0) {
    state.gpOffer[i] = -2;
    return;
  }
  const at = pool[Math.floor(nextRandom(state) * pool.length)];
  state.gpOffer[i] = at;
  state.gpPrice[i] = gpCost(cls, roster[at].era, worldEraIndex(state));
}

/** CIV6 (Stonehenge): "Grants a free Great Prophet (or a free Apostle if
 *  no Prophets are available)" — religion founded or the class spent pays
 *  an Apostle; a standing Prophet with no religion pays nothing; otherwise
 *  the class's offer is claimed FREE (`_grant_free_prophet`). */
export function grantFreeProphet(state: GameState, seat: number, centre: number): void {
  const owner = seatOf(state, seat);
  if (!owner) return;
  const standing = state.units.some((u) => unitSeat(u) === seat && u.type === 'PROPHET');
  const founded = owner.religion.founded;
  ensureGpOffer(state, 'PROPHET');
  if (!founded && standing) return; // the page's "you will not receive a unit"
  if (!founded && gpOffer(state, 'PROPHET') >= 0) {
    recruit(state, seat, 'PROPHET');
    return;
  }
  spawnUnit(state, 'APOSTLE', centre, seat);
}

/** CIV6 (Great People page): patronage prices the MISSING points — Faith
 *  "150 + 10 per point", Gold "200 + 15 per point", and "fractional costs
 *  are always rounded down"; (Oracle): "diminishes all Patronage Faith
 *  costs by 25%" — Faith only. Infinity while no offer stands. */
export function patronageCost(state: GameState, seat: number, cls: GreatPersonClass, gold: boolean): number {
  const i = GP_CLASSES.indexOf(cls);
  if ((state.gpOffer?.[i] ?? -1) < 0) return Infinity;
  const owner = seatOf(state, seat);
  if (!owner) return Infinity;
  const d = Math.max(0, (state.gpPrice?.[i] ?? 0) - (owner.gpp[cls] ?? 0));
  if (gold) return Math.floor(200 + 15 * d);
  const pct = seatWonders(state, seat)
    .reduce((n, w) => n + (w.def.effects?.patronageFaithPct ?? 0), 0);
  return Math.floor((150 + 10 * d) * (1 - pct / 100));
}

/** The patronage CLAIM: pay the purse, consume the class's accumulated
 *  points, recruit the standing offer. The redraw waits for the seat-phase
 *  loop, keeping the RNG stream at its one position (`_patronize`). */
export function patronizeGreatPerson(state: GameState, seat: number, clsIdx: number, currency: 'faith' | 'gold'): { ok: boolean } {
  const cls = GP_CLASSES[clsIdx];
  const owner = cls ? seatOf(state, seat) : undefined;
  if (!cls || !owner) return { ok: false };
  const gold = currency === 'gold';
  const cost = patronageCost(state, seat, cls, gold);
  const purse = gold ? (owner.treasury ?? 0) : owner.faith;
  if (!Number.isFinite(cost) || Math.round(purse * 1000) < Math.round(cost * 1000)) return { ok: false };
  if (gold) owner.treasury = (owner.treasury ?? 0) - cost;
  else owner.faith -= cost;
  owner.gpp[cls] = 0;
  recruit(state, seat, cls);
  return { ok: true };
}

export function greatPersonPointsPerTurn(
  state: GameState,
  seat: number,
): Record<GreatPersonClass, number> {
  const out = Object.fromEntries(GP_CLASSES.map((c) => [c, 0])) as Record<GreatPersonClass, number>;
  const gppFlat = getModifiers(state, seat).gppFlat;
  out.PROPHET += goldenProphetPoints(state, seat);
  for (const city of citiesOf(state, seat)) {
    // CIV6 (Oracle): "Districts in this city provide +2 Great Person points
    // of their type" — the HOLDING city's districts only.
    const distGpp = completedWonders(state, city)
      .reduce((n, w) => n + (w.def.effects?.districtGpPoints ?? 0), 0);
    for (const cls of GP_CLASSES) {
      const district = GP_CLASS_DISTRICT[cls];
      const inst = city.districts.find(
        (d) =>
          d.type === district &&
          state.map.tiles[d.tileIndex].districtComplete &&
          !state.map.tiles[d.tileIndex].districtPillaged,
      );
      if (!inst) continue;
      out[cls] += 1 + (gppFlat[cls] ?? 0) + distGpp
        + city.buildings.filter((b) => BUILDINGS[b]?.district === district).length;
    }
  }
  // CIV6: a wonder's per-turn Great Person points are the owner's, paid
  // whether or not the holding city has the class's district.
  for (const w of seatWonders(state, seat)) {
    for (const [cls, pts] of Object.entries(w.def.effects?.gpPoints ?? {})) {
      out[cls as GreatPersonClass] += pts;
    }
  }
  // CIV6 (Patronage resolution): the factor covers every source, the golden
  // prophet term included — so it applies after all of them.
  for (const cls of GP_CLASSES) out[cls] *= congressGppFactor(state, cls);
  // CIV6 (Classical Republic): "+15% Great Person points" — the government's
  // factor covers every per-turn source the same way.
  const gppMult = getModifiers(state, seat).gppMult;
  for (const cls of GP_CLASSES) out[cls] *= gppMult;
  return out;
}

/** Great-work slots a city's WONDERS add, for one kind. It resolves here
 *  because completeness lives on the tile and data/greatPeople.ts is map-free. */
export function wonderGwSlots(state: GameState, kind: number) {
  return (c: { wonders?: { id: string; tileIndex: number }[] }): number =>
    (c.wonders ?? []).reduce(
      (n, w) =>
        n + (state.map.tiles[w.tileIndex].builtWonderComplete ? (GW_WONDER_SLOTS[w.id]?.[kind] ?? 0) : 0),
      0,
    );
}

/** What every slot rule here reads: a city's buildings, its districts (a
 *  pillaged one takes its buildings with it) and what it already holds. */
type WorkCity = {
  buildings: string[];
  districts?: City['districts'];
  relics?: number;
  wonders?: { id: string; tileIndex: number }[];
  greatWorksWriting?: number;
  greatWorksArt?: number;
  greatWorksMusic?: number;
};

/** CIV6: a city's RELIC capacity beyond its Temple slot — every complete
 *  wonder's, the pool slots its relics already stand in, and whatever is left
 *  of the pool. */
export function relicSlotsIn(state: GameState) {
  return (c: WorkCity): number => {
    const w = wonderRelicSlots(state, c);
    const dedicated = (c.buildings.includes(RELIC_BUILDING) ? RELIC_SLOTS_PER_BUILDING : 0) + w;
    return w + Math.max(0, (c.relics ?? 0) - dedicated) + anyWorkFree(state, c);
  };
}

/** relic slots this city's COMPLETE wonders add. */
function wonderRelicSlots(state: GameState, c: WorkCity): number {
  return (c.wonders ?? []).reduce(
    (n, w) => n + (state.map.tiles[w.tileIndex].builtWonderComplete ? RELIC_WONDER_SLOTS[w.id] ?? 0 : 0),
    0,
  );
}

/**
 * CIV6 (National History Museum): "Provides 4 slots for any Great Work" — ONE
 * shared pool, which a work of any kind falls into once the slots of its own
 * kind are full. What is left of that pool here: the works this city holds
 * beyond their DEDICATED slots are already standing in it.
 */
export function anyWorkFree(state: GameState, city: WorkCity): number {
  const pool = cityBuildingSum(state, city, 'anyWorkSlots');
  if (pool <= 0) return 0;
  let used = 0;
  for (let k = 0; k < GW_KINDS; k++) {
    used += Math.max(0, gwCount(city, k) - gwCapacity(city, k, wonderGwSlots(state, k)(city)));
  }
  const relicDedicated = (city.buildings.includes(RELIC_BUILDING) ? RELIC_SLOTS_PER_BUILDING : 0)
    + wonderRelicSlots(state, city);
  used += Math.max(0, (city.relics ?? 0) - relicDedicated);
  return Math.max(0, pool - used);
}

/** The extra Great-Work slots of one kind a city carries beyond its slot
 *  building: its wonders', the pool slots that kind's works already stand in,
 *  and whatever is left of the pool. */
export function gwExtraSlots(state: GameState, kind: number) {
  const wonders = wonderGwSlots(state, kind);
  return (c: WorkCity): number => {
    const w = wonders(c);
    return w + Math.max(0, gwCount(c, kind) - gwCapacity(c, kind, w)) + anyWorkFree(state, c);
  };
}

/**
 * WHERE A RECRUIT ARRIVES: the seat's city holding a completed, unpillaged
 * district of this class — the site the person's own charge will need —
 * lowest centre tile first, and the capital when no city has one.
 */
export function gpSpawnTile(state: GameState, seat: number, cls: GreatPersonClass): number {
  const district = GP_CLASS_DISTRICT[cls];
  let best = -1;
  for (const c of citiesOf(state, seat)) {
    const has = c.districts.some((d) => {
      const t = state.map.tiles[d.tileIndex];
      return d.type === district && t.districtComplete && !t.districtPillaged;
    });
    if (has && (best < 0 || c.centerIndex < best)) best = c.centerIndex;
  }
  if (best >= 0) return best;
  return citiesOf(state, seat).find((c) => c.isCapital)?.centerIndex ?? -1;
}

function recruit(state: GameState, seat: number, cls: GreatPersonClass): void {
  const owner = seatOf(state, seat);
  const at = gpOffer(state, cls);
  const person = at >= 0 ? GREAT_PEOPLE[cls][at] : undefined;
  if (!owner || !person) return; // no standing offer
  (state.gpOffer ??= GP_CLASSES.map(() => -1))[GP_CLASSES.indexOf(cls)] = -1; // the loop draws the replacement

  // CIV6: the recruit is a UNIT. Nothing is paid out here — the person walks
  // to a site their ability may be spent at and spends a charge there.
  const where = gpSpawnTile(state, seat, cls);
  if (where >= 0) {
    const u = spawnUnit(state, cls, where, seat);
    if (u) {
      u.gpAt = at;
      u.charges = gpChargesOf(person);
    }
  }

  state.claimedGreatPeople.push(person.id); // gone from the global pool...
  owner.gpEarned.push(person.id); // ...and recorded as this seat's recruit
  addEraScore(state, seat, ERA_SCORE_GP);
  // CIV6 (Sky and Stars): "+1 Era Score each time a Great Person is Earned."
  dedicationEvent(state, seat, DED_SKY);
  state.eventLog.push(`${owner.name} claimed ${person.name}.`);
}

export function advanceGreatPeople(state: GameState, seat: number): void {
  const owner = seatOf(state, seat);
  if (!owner) return;
  const perTurn = greatPersonPointsPerTurn(state, seat);
  for (const cls of GP_CLASSES) {
    ensureGpOffer(state, cls);
    let pts = (owner.gpp[cls] ?? 0) + perTurn[cls];
    if (pts !== 0) {
      for (;;) {
        const cost = gpOfferCost(state, cls); // Infinity while no offer stands
        if (!Number.isFinite(cost) || pts < cost) break;
        pts -= cost;
        recruit(state, seat, cls);
        ensureGpOffer(state, cls); // the replacement, drawn at once
      }
    }
    // CIV6: "GPPs that can no longer be used are converted to Faith, in a
    // 1:1 ratio" — the exhausted class's stock and flow alike, checked
    // AFTER the loop so a class spent mid-loop converts the same turn on
    // both engines (`_advance_great_people`).
    if (gpOffer(state, cls) === -2 && pts > 0) {
      owner.faith += pts;
      pts = 0;
    }
    owner.gpp[cls] = pts;
  }
}
