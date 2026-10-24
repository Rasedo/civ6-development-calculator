/**
 * THE ECONOMIC AI'S SAVINGS AND ITS UNIT PURCHASES (GameCore_XP2
 * AI::Economic; `tools/civ6lab/dll_readings.md` "C-97: the sender's pick,
 * the savings, the threat and the focus", "C-96: the city events, trees
 * and contracts") — every party's: the majors' and the minors' traits carry
 * DefaultSavings.
 *
 * THE SAVINGS (0x687bf0, each AI turn): the treasury's change since the last
 * balance shared over the SavingTypes slots by the DefaultSavings weights
 * (each share the change x the weight's fraction of the total, the fraction
 * truncated to 1/256), a slot below 0 cleared, the PLOTS slot held at 150
 * with the excess to the SLUSH_FUND, and with no Great Person class
 * available (0x2f7eb0) the GREAT_PEOPLE slot joined to the SLUSH_FUND; a
 * major's turn closes on the Gold patronage (`goldPatronage`,
 * ai/major/greatPeople.ts). A spend (0x68acd0) takes its slot, the
 * overflow from slot 0, and lowers the balance; the can-afford (0x6874d0)
 * asks the slot for the price x (1 - frac) and slot 0 + the slot for the
 * price.
 *
 * THE CONTRACT PURCHASES (0x687bf0, after the savings): the gold-bought
 * contracts its listener listed, each tried through TryPurchaseUnits
 * (`purchaseContracts`).
 *
 * THE PURCHASES (the city's second hook 0x5ce5b0, after the Default
 * Specialization): a threatened city (CityBuildAI +0x1b8 above -1) of a
 * player no human drives buys, while TryPurchaseUnits (0x68be60) succeeds,
 * the unit its list puts first (0x5d2810).
 */
import { AI_DEFAULT_SAVINGS } from '../data/aiTables';
import { FX } from './aiValue';
import { CP_ACCEPTED, CP_COMPLETED, contractById, goldPurchasable, type AiContract, type ContractBook } from './aiContracts';

/** the savings slots by SavingTypes order */
export const SLOT_SLUSH = 0;
export const SLOT_UNITS = 1;
export const SLOT_PLOTS = 2;
export const SLOT_GREAT_PEOPLE = 3;
/** the PLOTS slot's ceiling (0x687bf0: 0x9600) */
const PLOTS_CAP = 150 * FX;
const TOTAL_WEIGHT = AI_DEFAULT_SAVINGS.reduce((a, s) => a + s.weight, 0);
/** each slot's share of a change, the fraction truncated to 1/256 */
const SHARE = AI_DEFAULT_SAVINGS.map((s) => Math.floor((s.weight / TOTAL_WEIGHT) * FX));

/** one player's savings (AI::Economic +0x540 / +0x598) and its last
 *  balance (+0x1b8), raw 24.8 */
export interface EconomicMemory {
  savings: number[];
  balance: number;
}

export const newEconomicMemory = (): EconomicMemory => ({ savings: AI_DEFAULT_SAVINGS.map(() => 0), balance: 0 });

/** THE SAVINGS TURN (0x687bf0) on the treasury `treasury`, raw;
 *  `classAvailable` whether a Great Person class is available */
export function savingsTurn(e: EconomicMemory, treasury: number, classAvailable: boolean): void {
  const delta = treasury - e.balance;
  for (let i = 0; i < e.savings.length; i++) {
    e.savings[i] += (delta * SHARE[i]) >> 8;
    if (e.savings[i] < 0) e.savings[i] = 0;
  }
  if (e.savings[SLOT_PLOTS] > PLOTS_CAP) {
    e.savings[SLOT_SLUSH] += e.savings[SLOT_PLOTS] - PLOTS_CAP;
    e.savings[SLOT_PLOTS] = PLOTS_CAP;
  }
  if (!classAvailable) {
    e.savings[SLOT_SLUSH] += e.savings[SLOT_GREAT_PEOPLE];
    e.savings[SLOT_GREAT_PEOPLE] = 0;
  }
  e.balance = treasury;
}

/** the can-afford (0x6874d0): the slot holds amount x (1 - frac), slot 0 and
 *  the slot together the amount */
export function canAfford(e: EconomicMemory, amount: number, slot: number, frac: number): boolean {
  return e.savings[slot] >= amount - Math.trunc(amount * frac) && e.savings[SLOT_SLUSH] + e.savings[slot] >= amount;
}

/** a spend (0x68acd0): the overflow from slot 0, the slot no lower than 0,
 *  the balance lowered by the amount (a refund is a negative amount) */
export function spend(e: EconomicMemory, amount: number, slot: number): void {
  const over = amount - e.savings[slot];
  if (over > 0 && slot !== SLOT_SLUSH) e.savings[SLOT_SLUSH] -= over;
  e.savings[slot] = Math.max(0, e.savings[slot] - amount);
  e.balance -= amount;
}

/** What TryPurchaseUnits reads of a city it may buy in */
export interface PurchaseCity {
  id: number;
  /** the city's Gold price of the unit (city +0x1688, 0x1b22d0), whole
   *  Gold, below 0 where it may not buy it */
  goldCost(unit: string): number;
  /** the city's threat (CityBuildAI +0x1b8): threatened at or above 0 (its
   *  sign bit clear, 0x68c02e) */
  threat: number;
  /** the game lets the purchase through (0x977570, the purchase request) */
  canPurchase(unit: string): boolean;
}

/** 0x68be60, TRYPURCHASEUNITS: in `cities` (the player's, or the one city
 *  asked) the first whose price the savings meet — the UNITS and SLUSH slots
 *  together above the price, with the UNITS slot above half of it or the
 *  SLUSH slot above twice it — or, in a threatened city, the balance at or
 *  above it; the purchase spends the UNITS slot then the SLUSH slot (a
 *  threatened city's from each slot in order) and lowers the balance. The
 *  city bought in, null none. */
export function tryPurchaseUnits(e: EconomicMemory, cities: readonly PurchaseCity[], unit: string,
                                 buy: (city: PurchaseCity) => void): PurchaseCity | null {
  for (const c of cities) {
    const g = c.goldCost(unit);
    if (g < 0) continue;
    const cost = g * FX;
    const s0 = e.savings[SLOT_SLUSH];
    const s1 = e.savings[SLOT_UNITS];
    const fromSavings = s0 + s1 > cost && (s1 > (cost >> 1) || s0 > 2 * cost);
    const emergency = !fromSavings && c.threat > -1 && e.balance >= cost;
    if (!fromSavings && !emergency) continue;
    if (!c.canPurchase(unit)) continue;
    buy(c);
    if (c.threat <= -1) {
      e.savings[SLOT_SLUSH] -= Math.max(0, cost - s1);
      e.savings[SLOT_UNITS] = Math.max(0, s1 - cost);
    } else {
      let left = cost;
      for (let i = 0; i < e.savings.length && left > 0; i++) {
        const take = Math.min(left, e.savings[i]);
        e.savings[i] -= take;
        left -= take;
      }
    }
    e.balance -= cost;
    return c;
  }
  return null;
}

/** THE CONTRACT PURCHASES (0x687bf0 after the savings, 0x688920): the
 *  purchase list (AI::Economic +0x5d0, the contracts its listener 0x68ab40
 *  took at their submission) keeps the contracts still alive, ACCEPTED and
 *  goldPurchasable (vt +0x80), in arrival order (0x684bf0, a stable sort on
 *  contract +0x160, which no read writer sets); then, for a player no human
 *  drives, each tries its purchase (vt +0x50 true, vt +0x20 0x5f3c40): a
 *  unit's through TryPurchaseUnits in the city the contract binds (every
 *  city of the player where it binds none), COMPLETED where it buys — its
 *  "PURCHASE" line; a building's (0x68afe0's value test) buys none here (runs/h1_duelw1124 t27 Granada: the Builder of contract
 *  58, submitted at t26, bought at the start of its turn). `cities` the
 *  cities a contract may buy in. The contracts bought. */
export function purchaseContracts(e: EconomicMemory, book: ContractBook, human: boolean,
                                  cities: (c: AiContract) => readonly PurchaseCity[],
                                  buy: (city: PurchaseCity, unit: string) => void): AiContract[] {
  book.purchase = book.purchase.filter((id) => {
    const c = contractById(book, id);
    return !!c && c.progress === CP_ACCEPTED && goldPurchasable(c);
  });
  const bought: AiContract[] = [];
  if (human) return bought;
  for (const id of book.purchase) {
    const c = contractById(book, id)!;
    if (c.unit === null) continue;
    const unit = c.unit;
    if (!tryPurchaseUnits(e, cities(c), unit, (city) => buy(city, unit))) continue;
    c.progress = CP_COMPLETED;
    bought.push(c);
  }
  return bought;
}

/** One entry of the city's unit list (CityBuildAI +0x650, 0x168 bytes each,
 *  in its order) */
export interface PurchaseEntry {
  unit: string;
  /** the entry stands (+0xe) */
  valid: boolean;
  /** its two ranks (+0x30, then +0x2c) */
  rank: number;
  subRank: number;
}

/** 0x5d2810: the first entry of the list the city may train (CanTrain),
 *  whose unit's +0x1b9 byte is below 0x80 and whose domain is `domain`
 *  (null any); the entries are ranked, so the first is the best of its rank
 *  — null where none, or where that entry's ranks fall below 0 (the walk
 *  starts its bests at 0 and stops on an entry ranked below them,
 *  0x5d2941: runs/h1_duelw1124 Granada t19-t23, threatened under City
 *  Defense with 95 Gold, bought nothing) */
export function purchasePick(entries: readonly PurchaseEntry[], canTrain: (unit: string) => boolean,
                             eligible: (unit: string) => boolean, domainOf: (unit: string) => string | null,
                             domain: string | null): string | null {
  for (const e of entries) {
    if (!e.valid || !canTrain(e.unit) || !eligible(e.unit)) continue;
    if (domain !== null && domainOf(e.unit) !== domain) continue;
    return e.rank >= 0 && e.subRank >= 0 ? e.unit : null;
  }
  return null;
}

/** THE CITY'S PURCHASES (0x5ce5b0's tail): a threatened city of a player no
 *  human drives buys its list's first unit while TryPurchaseUnits succeeds
 *  in it; the units bought */
export function purchaseTurn(e: EconomicMemory, city: PurchaseCity, human: boolean, pick: () => string | null,
                             buy: (city: PurchaseCity, unit: string) => void): string[] {
  const bought: string[] = [];
  if (city.threat <= -1 || human) return bought;
  for (let u = pick(); u !== null; u = pick()) {
    const unit = u;
    if (!tryPurchaseUnits(e, [city], unit, (c) => buy(c, unit))) break;
    bought.push(unit);
  }
  return bought;
}
