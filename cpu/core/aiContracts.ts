/**
 * THE CITY BUILD AI'S CONTRACTS (GameCore_XP2 AI/Contracts.cpp, the
 * contract manager AI/Control_Manager.cpp and AI/CityBuild.cpp;
 * `tools/civ6lab/dll_readings.md` "C-96: the city events, trees and
 * contracts"). A tree's Build Unit makes a contract for a unit, a building
 * or a district; the seat's cities take it up, their Default Specialization
 * queues it, its completion or its loss ends it. Each line the game's
 * AI_CityBuild.csv prints for a contract leaves through the caller's `log`.
 *
 * A contract's progress (+0x100, the names at 0xf03650): CLAIMED when made,
 * SUBMITTED, ACCEPTED once a city takes it, IN PROGRESS once a city queues
 * it, then COMPLETED, FAILED or CANCELLED.
 */
import { FX } from './aiValue';

export const CP_INVALID = 0;
export const CP_CLAIMED = 1;
export const CP_SUBMITTED = 2;
export const CP_ACCEPTED = 3;
export const CP_FAILED = 4;
export const CP_IN_PROGRESS = 5;
export const CP_CANCELLED = 6;
export const CP_COMPLETED = 7;
export const CP_NAMES: readonly string[] = ['INVALID', 'CLAIMED', 'SUBMITTED', 'ACCEPTED', 'FAILED', 'IN PROGRESS', 'CANCELLED', 'COMPLETED'];

/** what a contract asks for: one of a unit, a building, a district (the
 *  install's types) */
export interface ContractItem {
  unit: string | null;
  building: string | null;
  district: string | null;
}

export interface AiContract extends ContractItem {
  id: number;
  /** the tree that made it (its instance id) and the tree's name */
  tree: number;
  treeName: string;
  /** the building's or the district's plot (+0x528), -1 none */
  plot: number;
  /** its value (+0x3a0), raw fixed point */
  value: number;
  /** the city it binds to (+0x588): the one the tree named, else the one
   *  that queues it; -1 any */
  city: number;
  /** the most turns a city may take to build it (+0x1c0), 0 none */
  maxTurns: number;
  /** the turns the city that last valued it needs (+0x220) */
  turns: number;
  progress: number;
  /** its unit joins the tree once built (+0x5e8: Release Unit When Built
   *  false) */
  assign: boolean;
  /** a city queued it: the item's completion signal is connected */
  queued?: boolean;
}

/** One city of the seat as the contracts read it */
export interface ContractCity {
  id: number;
  /** the city's AI judges it under threat (0x5cdc50) */
  underThreat: boolean;
  /** the item the city produces (its queue head, city +0x2170), null none */
  current: ContractItem | null;
  /** the turn the city last set its production (city +0x2600) */
  productionTurn: number;
  /** the value of the item the city produces (CityBuildAI +0xa48), raw */
  currentValue: number;
  /** CanConstruct (0x170450) of a building refuses it for good: its
   *  district one the player may not build (the result's second byte) */
  buildingBlocked(building: string): boolean;
  /** CanConstruct of a district at a plot (0x173940) refuses it for good */
  districtBlocked(district: string, plot: number): boolean;
  /** CanTrain (0x172820) */
  canTrain(unit: string): boolean;
  /** a sea unit may come from the city: the city coastal on salt water, or
   *  a district of its on salt water */
  trainsSea: boolean;
  /** turns to build (0x17b1e0 / 0x17bb40 / 0x17b5a0) */
  buildTurns(item: ContractItem): number;
  /** the city's analysis value of the item (the unit's at the city centre
   *  0x5d4cd0, a building's 0x5d4920 / a district's 0x5d4a20 at the plot),
   *  raw */
  itemValue(item: ContractItem, plot: number): number;
  /** the item's row in the AI tables: a unit's combat, build charges,
   *  domain, MustPurchase, CLASS_RECON; a building's DefenseModifier /
   *  OuterDefenseStrength, MustPurchase; a district's defence */
  unitRow(unit: string): { combat: number; buildCharges: number; sea: boolean; mustPurchase: boolean; recon: boolean };
  buildingRow(building: string): { defensive: boolean; mustPurchase: boolean };
  districtDefensive(district: string): boolean;
}

/** the seat's contract state */
export interface ContractBook {
  contracts: AiContract[];
  /** per city id, its contracts' ids in arrival order (CityBuildAI +0x3a8) */
  city: Record<number, number[]>;
  /** per city id, the contract in hand (CityBuildAI +0x398), -1 none */
  inHand: Record<number, number>;
}

export const newContractBook = (): ContractBook => ({ contracts: [], city: {}, inHand: {} });

export function contractById(book: ContractBook, id: number): AiContract | undefined {
  return book.contracts.find((c) => c.id === id);
}

const itemOf = (c: ContractItem): string => c.unit ?? c.building ?? c.district ?? '';
const sameItem = (a: ContractItem | null, c: ContractItem): boolean =>
  !!a && ((c.unit !== null && a.unit === c.unit) || (c.building !== null && a.building === c.building)
    || (c.district !== null && a.district === c.district));

/** the contract line (0x5f4cd0): "turn, player, city, , CONTRACT id, STATE,
 *  unit, building, district, VALUE v, tree" */
export function contractLine(turn: number, seat: number, cityName: string, c: AiContract): string {
  return `${turn}, ${seat}, ${cityName}, , CONTRACT ${c.id}, ${CP_NAMES[c.progress]}, ${c.unit ?? 'NO_UNIT'}, `
    + `${c.building ?? 'NO_BUILDING'}, ${c.district ?? 'NO_DISTRICT'}, VALUE ${(c.value / FX).toFixed(1)}, ${c.treeName}`;
}

/** vt +0x98 (0x5f6050): the city may take the contract up — the city it
 *  binds to; under threat only a defensive item (a building with a
 *  DefenseModifier or an OuterDefenseStrength, a defensive district, a
 *  combat unit with no build charges and no CLASS_RECON); in progress, only
 *  the item the city produces; within its most turns; a COMPLETED contract
 *  stays taken; then a building or district CanConstruct does not refuse
 *  for good and not MustPurchase, a unit not MustPurchase that CanTrain */
export function contractEligible(c: AiContract, city: ContractCity): boolean {
  if (c.city !== -1 && c.city !== city.id) return false;
  if (c.building !== null) {
    if (city.underThreat && !city.buildingRow(c.building).defensive) return false;
    if (c.progress === CP_IN_PROGRESS && city.current?.building !== c.building) return false;
    if (c.maxTurns > 0 && city.buildTurns(c) > c.maxTurns) return false;
    if (c.progress === CP_COMPLETED) return true;
    if (city.buildingBlocked(c.building)) return false;
    return !city.buildingRow(c.building).mustPurchase;
  }
  if (c.district !== null) {
    if (city.underThreat && !city.districtDefensive(c.district)) return false;
    if (c.progress === CP_IN_PROGRESS && city.current?.district !== c.district) return false;
    if (c.maxTurns > 0 && city.buildTurns(c) > c.maxTurns) return false;
    if (c.progress === CP_COMPLETED) return true;
    return !city.districtBlocked(c.district, c.plot);
  }
  if (c.unit === null) return false;
  const u = city.unitRow(c.unit);
  // a civilian contract submitted to the city already training it
  if (c.progress === CP_SUBMITTED && u.combat === 0 && city.current?.unit === c.unit) return false;
  if (city.underThreat && (u.combat === 0 || u.buildCharges > 0 || u.recon)) return false;
  if (u.sea && !city.trainsSea) return false;
  if (c.progress === CP_IN_PROGRESS && city.current?.unit !== c.unit) return false;
  if (c.maxTurns > 0 && city.buildTurns(c) > c.maxTurns) return false;
  if (c.progress === CP_COMPLETED) return true;
  if (u.mustPurchase) return false;
  return city.canTrain(c.unit);
}

/** vt +0x68 (0x5f5d50): the city values the contract — its value the
 *  higher of its own and the city's analysis value of the item, its turns
 *  the city's; true where the city produces the item */
export function contractEvaluate(c: AiContract, city: ContractCity): boolean {
  c.value = Math.max(c.value, city.itemValue(c, c.plot));
  c.turns = city.buildTurns(c);
  if (c.building !== null && city.current?.building !== c.building) return false;
  if (c.unit !== null && city.current?.unit !== c.unit) return false;
  return true;
}

/** the contract submitted (0x60bb50): SUBMITTED; each city's listener
 *  (0x5d6050), in city order: a city that may take it lists it and logs its
 *  line, and where its value passes the value of the item the city
 *  produces, an item set this turn or the one before, clears the city's
 *  production; a city taking it makes it ACCEPTED */
export function submitContract(book: ContractBook, c: AiContract, cities: readonly ContractCity[], turn: number,
  clearProduction: (city: ContractCity) => void, line: (city: ContractCity, c: AiContract) => void): void {
  c.progress = CP_SUBMITTED;
  book.contracts.push(c);
  let taken = false;
  for (const city of cities) {
    if (!contractEligible(c, city)) continue;
    (book.city[city.id] ??= []).push(c.id);
    line(city, c);
    if (c.value > city.currentValue && city.productionTurn + 1 >= turn) clearProduction(city);
    taken = true;
  }
  if (taken) c.progress = CP_ACCEPTED;
}

/** THE DEFAULT SPECIALIZATION'S CONTRACTS (0x5d4d70's head): each contract
 *  the city lists, in order — an ACCEPTED one it may still take is valued
 *  (vt +0x68) and the one in hand becomes the higher valued; any other logs
 *  its line and leaves the list, one no holder keeps any more leaves it
 *  without a line. The contract in hand after. */
export function cityContracts(book: ContractBook, city: ContractCity, line: (c: AiContract) => void): AiContract | null {
  const ids = book.city[city.id] ?? [];
  const kept: number[] = [];
  for (const id of ids) {
    const c = contractById(book, id);
    if (!c) continue;
    if (c.progress === CP_ACCEPTED && contractEligible(c, city)) {
      contractEvaluate(c, city);
      const held = contractById(book, book.inHand[city.id] ?? -1);
      if (!held || held.value < c.value) book.inHand[city.id] = c.id;
      kept.push(id);
      continue;
    }
    line(c);
  }
  book.city[city.id] = kept;
  return contractById(book, book.inHand[city.id] ?? -1) ?? null;
}

/** the Default Specialization's turn goes to the contract in hand where it
 *  is valued at least the best unit's value less 1.0 and the best project's
 *  (0x5d50b3) */
export function takesTurn(c: AiContract, unitValue: number, projectValue: number): boolean {
  return c.value >= unitValue - FX && c.value >= projectValue;
}

/** vt +0x38 (0x5f3710): the city queues the contract — IN PROGRESS, bound to
 *  the city, its queue line logged; the queue refusing it FAILS it */
export function queueContract(c: AiContract, city: ContractCity, queue: (c: AiContract) => boolean,
  line: (c: AiContract) => void): boolean {
  c.progress = CP_IN_PROGRESS;
  if (!queue(c)) {
    c.progress = CP_FAILED;
    return false;
  }
  c.city = city.id;
  c.queued = true;
  line(c);
  return true;
}

/** the queue line: "turn, player, city, , , item, tree, CONTRACT id" */
export function queuedLine(turn: number, seat: number, cityName: string, c: AiContract): string {
  return `${turn}, ${seat}, ${cityName}, , , ${itemOf(c)}, ${c.treeName}, CONTRACT ${c.id}`;
}

/** the city's full update (0x5d7e00): the contract in hand, where the city
 *  may no longer take it, CANCELLED and the city's production cleared; where
 *  the city no longer produces it, FAILED unless COMPLETED; CANCELLED
 *  elsewhere, the production cleared. The hand empties in each case. */
export function inHandCheck(book: ContractBook, city: ContractCity, clearProduction: (city: ContractCity) => void): void {
  const c = contractById(book, book.inHand[city.id] ?? -1);
  if (!c) {
    book.inHand[city.id] = -1;
    return;
  }
  if (!contractEligible(c, city)) {
    c.progress = CP_CANCELLED;
    clearProduction(city);
    book.inHand[city.id] = -1;
    return;
  }
  const producing = contractEvaluate(c, city);
  if (!producing) {
    if (c.progress !== CP_COMPLETED) c.progress = CP_FAILED;
    book.inHand[city.id] = -1;
    return;
  }
  if (c.progress === CP_CANCELLED) {
    clearProduction(city);
    book.inHand[city.id] = -1;
  }
}

/** the item built (the completion signals 0x5f5650 / 0x5f35d0 / 0x5f3610,
 *  connected when a city queues the contract): each queued contract for the
 *  item bound to the city (or, for a unit, to none) that is ACCEPTED or IN
 *  PROGRESS (a building or district: any progress) becomes COMPLETED; a
 *  unit's contract hands the unit to its tree */
export function contractBuilt(book: ContractBook, cityId: number, item: ContractItem, unitId: number,
  assignUnit: (tree: number, unit: number) => void): void {
  for (const c of book.contracts) {
    if (!c.queued) continue;
    if (item.unit !== null) {
      if (c.unit !== item.unit || (c.city !== -1 && c.city !== cityId)) continue;
      if (c.progress !== CP_ACCEPTED && c.progress !== CP_IN_PROGRESS) continue;
      c.progress = CP_COMPLETED;
      if (c.assign) assignUnit(c.tree, unitId);
      continue;
    }
    if (!sameItem(item, c) || c.city !== cityId) continue;
    c.progress = CP_COMPLETED;
  }
}

/** the contracts no holder keeps: a contract lives while a tree holds it or a
 *  city has it in hand; the cities' lists hold it weakly (0x5d4d70 skips an
 *  emptied handle without a line), so one its tree releases leaves them
 *  silently */
export function reapContracts(book: ContractBook, held: ReadonlySet<number>): number[] {
  const keep = new Set(held);
  for (const id of Object.values(book.inHand)) keep.add(id);
  const gone = book.contracts.filter((c) => !keep.has(c.id)).map((c) => c.id);
  book.contracts = book.contracts.filter((c) => keep.has(c.id));
  return gone;
}
