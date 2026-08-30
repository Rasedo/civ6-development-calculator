/**
 * THE NEGOTIATED DEAL — the two-sided half of the trade screen.
 *
 * CIV6 (Trade, Demand, and Discuss): "You can trade anything from Gold to
 * resources to cities!" A deal is two bundles that move together, and it moves
 * only when the other side presses the button: "an 'Accept Deal' button will
 * appear, which will confirm the trade that is on the table."
 *
 * The wire carries one seat's unilateral record per turn, so the two sides are
 * two records — an `offer` from one seat and an `accept` from the other. Both
 * engines RE-VALIDATE every item at ACCEPT time, because the state the offer
 * was priced against has moved on by then.
 */
import type { City, DealItem, DealOffer, DealTerm, GameState } from './types';
import {
  AGREEMENT_TURNS, DEAL_CITY, DEAL_FAVOR, DEAL_GOLD, DEAL_GOLD_PER_TURN,
  DEAL_GREAT_WORK, DEAL_ITEMS, DEAL_ITEM_KINDS, DEAL_OPEN_BORDERS,
  DEAL_PERMANENT, DEAL_RESOURCE, DEAL_SPY, DEAL_TURNS, WAR_MIN_TURNS,
} from '../data/seats';
import { STRATEGIC_IDS } from '../data/constants';
import { CITY_MAX_HP } from '../data/units';
import { GW_KINDS, gwCapacity, gwCount, gwGive, gwTake } from '../data/greatPeople';
import { SPY_UNIT } from '../data/espionage';
import { gwExtraSlots } from './greatPeople';
import { outerPool, wallsMax } from './rules';
import {
  civsAtWar, grantKey, isCiv, seatOf, setBorderTurnsFrom, warTurnsWith,
} from './seats';
import { grantStockpile, spendStockpile, stockOf, stockpileCap } from './stockpile';
import { spawnUnit } from './units';
import { transferCity } from './phase';

/** The offer `from` has standing with `to`, if any. */
export function dealOfferOf(state: GameState, from: number, to: number): DealOffer | undefined {
  if (from === to) return undefined;
  return state.dealOffers?.[grantKey(from, to)];
}

export function setDealOffer(state: GameState, from: number, to: number, o: DealOffer): void {
  if (from === to) return;
  (state.dealOffers ??= {})[grantKey(from, to)] = o;
}

export function clearDealOffer(state: GameState, from: number, to: number): void {
  if (state.dealOffers) delete state.dealOffers[grantKey(from, to)];
}

/** What `from` still owes `to` on a running deal. */
export function dealTermOf(state: GameState, from: number, to: number): DealTerm | undefined {
  if (from === to) return undefined;
  return state.dealTerms?.[grantKey(from, to)];
}

/** How many of `owner`'s spies `captor` is holding. */
export function spyHeldWith(state: GameState, owner: number, captor: number): number {
  if (owner === captor) return 0;
  return state.spyHeld?.[grantKey(owner, captor)] ?? 0;
}

export function setSpyHeld(state: GameState, owner: number, captor: number, n: number): void {
  if (owner === captor) return;
  (state.spyHeld ??= {})[grantKey(owner, captor)] = n;
}

/** CIV6: a captured spy is "imprisoned, but not killed", and it still counts
 *  towards the owner's spy limit — so the capacity gate reads this beside the
 *  spies the owner can actually see. */
export function spiesHeldOf(state: GameState, owner: number): number {
  let n = 0;
  for (const s of state.seats) n += spyHeldWith(state, owner, s.seat);
  return n;
}

/** CIV6: a released spy "is immediately returned to the original owner's
 *  Capital". The capital is where the seat founded it; a seat that has lost
 *  that city takes delivery in the first one it still holds. */
export function capitalCityOf(state: GameState, seat: number): City | undefined {
  const s = seatOf(state, seat);
  if (!s || s.cities.length === 0) return undefined;
  return s.cities.find((c) => c.centerIndex === s.capitalTile) ?? s.cities[0];
}

/** CIV6 (Diplomacy): a city may change hands only "if they and their
 *  fortifications are at full HP". */
export function cityTradeable(state: GameState, city: City): boolean {
  return city.hp >= CITY_MAX_HP && outerPool(state, city) >= wallsMax(state, city);
}

function gwFrom(state: GameState, seat: number, kind: number): City | undefined {
  return seatOf(state, seat)?.cities.find((c) => gwCount(c, kind) > 0);
}

function gwTo(state: GameState, seat: number, kind: number): City | undefined {
  const slots = gwExtraSlots(state, kind);
  return seatOf(state, seat)?.cities.find((c) => gwCount(c, kind) < gwCapacity(c, kind, slots(c)));
}

/** Can `giver` actually hand `receiver` this one thing, right now? */
export function dealItemPayable(state: GameState, giver: number, receiver: number, it: DealItem): boolean {
  const [kind, a, b] = it;
  if (kind < 0 || kind >= DEAL_ITEM_KINDS.length) return false;
  const gs = seatOf(state, giver);
  const rs = seatOf(state, receiver);
  if (!gs || !rs) return false;
  switch (kind) {
    case DEAL_GOLD:
      return a > 0 && gs.treasury >= a;
    case DEAL_GOLD_PER_TURN:
      // The flow, not the balance: a per-turn payment is priced against the
      // turns it runs, and this engine already lets a treasury go negative.
      return a > 0;
    case DEAL_FAVOR:
      return a > 0 && (gs.diplomaticFavor ?? 0) >= a;
    case DEAL_RESOURCE:
      // C-5's stockpile is the only resource here with a QUANTITY: a luxury is
      // a boolean access gate, with nothing to hand over a lump of.
      return a >= 0 && a < STRATEGIC_IDS.length && b > 0 && stockOf(state, giver, STRATEGIC_IDS[a]) >= b;
    case DEAL_GREAT_WORK:
      return a >= 0 && a < GW_KINDS && !!gwFrom(state, giver, a) && !!gwTo(state, receiver, a);
    case DEAL_CITY: {
      const city = gs.cities.find((c) => c.centerIndex === a);
      return !!city && cityTradeable(state, city);
    }
    case DEAL_SPY:
      // The giver is the CAPTOR: it lets one of the receiver's own spies go.
      return spyHeldWith(state, receiver, giver) > 0;
    case DEAL_OPEN_BORDERS:
      return true;
    default:
      return false;
  }
}

/** Move it. The caller has already checked `dealItemPayable`. */
function moveDealItem(state: GameState, giver: number, receiver: number, it: DealItem): void {
  const [kind, a, b] = it;
  const gs = seatOf(state, giver);
  const rs = seatOf(state, receiver);
  if (!gs || !rs) return;
  switch (kind) {
    case DEAL_GOLD:
      gs.treasury -= a;
      rs.treasury += a;
      break;
    case DEAL_GOLD_PER_TURN:
      // The term pays it; accepting only starts the clock.
      break;
    case DEAL_FAVOR:
      gs.diplomaticFavor = (gs.diplomaticFavor ?? 0) - a;
      rs.diplomaticFavor = (rs.diplomaticFavor ?? 0) + a;
      break;
    case DEAL_RESOURCE: {
      const id = STRATEGIC_IDS[a];
      const room = Math.max(0, stockpileCap(state, receiver) - stockOf(state, receiver, id));
      const moved = Math.min(b, room);
      spendStockpile(state, giver, id, moved);
      grantStockpile(state, receiver, id, moved);
      break;
    }
    case DEAL_GREAT_WORK: {
      const from = gwFrom(state, giver, a);
      const home = gwTo(state, receiver, a);
      if (from && home) gwGive(home, a, gwTake(from, a));
      break;
    }
    case DEAL_CITY: {
      const city = gs.cities.find((c) => c.centerIndex === a);
      if (city) transferCity(state, giver, rs, city, 'traded');
      break;
    }
    case DEAL_SPY: {
      setSpyHeld(state, receiver, giver, spyHeldWith(state, receiver, giver) - 1);
      const home = capitalCityOf(state, receiver);
      if (home) spawnUnit(state, SPY_UNIT, home.centerIndex, receiver);
      break;
    }
    case DEAL_OPEN_BORDERS:
      setBorderTurnsFrom(state, giver, receiver, AGREEMENT_TURNS);
      break;
    default:
      break;
  }
}

/** Every item on one side, checked against one giver. A deal is atomic: the
 *  table confirms whole or not at all. */
export function dealBundleOk(state: GameState, giver: number, receiver: number, items: DealItem[]): boolean {
  if (items.length > DEAL_ITEMS) return false;
  return items.every((it) => dealItemPayable(state, giver, receiver, it));
}

function temporaryOf(items: DealItem[]): DealItem[] {
  return items.filter((it) => !DEAL_PERMANENT[it[0]] && it[0] !== DEAL_OPEN_BORDERS);
}

/**
 * `to` presses Accept Deal on `from`'s standing offer. CIV6 (Ending a War):
 * "the peaceful resolution of a war involves diplomatic negotiations ... You or
 * your opponent may initiate a Peace Deal", so a table between two seats AT WAR
 * is that peace deal, and confirming it ends the war.
 */
export function acceptDeal(state: GameState, from: number, to: number): boolean {
  const o = dealOfferOf(state, from, to);
  if (!o) return false;
  const gs = seatOf(state, from);
  const rs = seatOf(state, to);
  if (!gs || !rs || !isCiv(from) || !isCiv(to)) return false;
  if (gs.cities.length === 0 || rs.cities.length === 0) return false;
  const war = civsAtWar(state, from, to);
  // "You can trade with all the leaders except the ones you're at war with" —
  // and the one table a war does not close is the one that ends it.
  if (war && warTurnsWith(state, from, to) < WAR_MIN_TURNS) return false;
  if (!dealBundleOk(state, from, to, o.give)) return false;
  if (!dealBundleOk(state, to, from, o.ask)) return false;
  for (const it of o.give) moveDealItem(state, from, to, it);
  for (const it of o.ask) moveDealItem(state, to, from, it);
  const give = temporaryOf(o.give);
  const ask = temporaryOf(o.ask);
  if (give.length > 0) (state.dealTerms ??= {})[grantKey(from, to)] = { left: DEAL_TURNS, items: give };
  if (ask.length > 0) (state.dealTerms ??= {})[grantKey(to, from)] = { left: DEAL_TURNS, items: ask };
  clearDealOffer(state, from, to);
  return true;
}

/** Give back what a term was only lending. CIV6: "Resources and gold per turn
 *  ... are temporary, and once the deal has run its course you will get them
 *  back" — the payments stop, and a lump of resource goes home. */
function endTerm(state: GameState, from: number, to: number, term: DealTerm): void {
  for (const [kind, a, b] of term.items) {
    if (kind !== DEAL_RESOURCE) continue;
    const id = STRATEGIC_IDS[a];
    const back = Math.min(b, stockOf(state, to, id));
    spendStockpile(state, to, id, back);
    grantStockpile(state, from, id, back);
  }
}

/**
 * The turn's deal bookkeeping, in one place: the per-turn payments, the
 * 30-turn clock, and the offer that nobody answered.
 */
export function dealPhase(state: GameState): void {
  for (const [key, term] of Object.entries(state.dealTerms ?? {})) {
    const [from, to] = key.split('>').map(Number);
    const gs = seatOf(state, from);
    const rs = seatOf(state, to);
    if (!gs || !rs) { delete state.dealTerms![key]; continue; }
    for (const [kind, a] of term.items) {
      if (kind !== DEAL_GOLD_PER_TURN) continue;
      gs.treasury -= a;
      rs.treasury += a;
    }
    term.left -= 1;
    if (term.left <= 0) {
      endTerm(state, from, to, term);
      delete state.dealTerms![key];
    }
  }
  // "All Deals, Demands, and Promises last for 30 turns" says nothing about how
  // long an OFFER waits, and a record is one turn's decision: an offer nobody
  // answered was priced against a state that no longer exists.
  for (const [key, o] of Object.entries(state.dealOffers ?? {})) {
    o.left -= 1;
    if (o.left <= 0) delete state.dealOffers![key];
  }
}
