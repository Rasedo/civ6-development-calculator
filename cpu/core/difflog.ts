/**
 * THE DECOMPOSITION LOG'S EMITTERS — one leaf module, so any rule can push a
 * line without an import cycle.
 *
 * The log exists to answer "which of the two engines did what" at a point the
 * state census cannot reach, and everything it has taught is about the KEY:
 *
 *  - the key names the DECISION, never the outcome. A step is keyed on the
 *    order it came from and a placement on the ANCHOR it was asked for,
 *    because a disagreement about the destination is the very thing being
 *    measured — an outcome key files the two sides as two unrelated lines.
 *  - every field that can distinguish two events belongs IN the key. A turn's
 *    unit record is K rows; a city id is a per-seat counter; one pool can be
 *    moved by several writers in one turn. Each of those collided once and
 *    printed a disagreement that was not one.
 *  - the two sides must agree on what a printed TERM means. `have` was net of
 *    war weariness on one engine and gross on the other, and showed a
 *    disagreement in a number both engines computed identically.
 *
 * The gate pairs by key, keeps the LAST line per key, and prints only the
 * keys whose lines differ.
 *
 * ONE WINDOW PER KIND, AND EACH ENGINE TRIMS ITS OWN BUFFER. Past a dozen or
 * so live kinds the two sides stop windowing the same turns — one side's
 * lines of a kind are pushed out entirely while the other's survive, and
 * a kind that appears on ONE side reads as a disagreement that is not one. So
 * the set is a budget, not a collection. What earned its place:
 *
 *   PERMANENT — each decomposes a COMPOSED quantity, which is the only shape
 *   that survives a hunt:
 *     `ds:` adjacency per SOURCE with counts
 *     `dj:` a district's adjacency, keyed by CITY and tile
 *     `dc:` the district price in parts (base/discount/variant/add/total)
 *     `fi:` the turn's faith income, snapshot split from the roster tail
 *     `up:` unit upkeep, the CHARGE beside the unit COUNT
 *     `dm:` the minor's build — the only instrument on that path
 *     `sk:` the strategic bank per WRITER (income, upkeep, burn, charge,
 *           upgrade, deal lump and return, grant)
 *
 *   SCAFFOLDING is kept only while a hunt needs it and deleted when that
 *   hunt closes: a hunt adds its own kinds and takes them out again in its
 *   closing commit.
 *
 * AND THE RULE: a key both engines print is not enough — the two sides must
 * MEASURE THE SAME QUANTITY. A shared key over a catalog position against a
 * `di`, a base walk against a variant walk, or a pre-factor total against a
 * post-factor one reads as agreement or disagreement that is neither.
 */
import type { City, DistrictId, GameState, Unit } from './types';
import { UNIT_TYPE_IDX } from '../data/units';

function push(line: string): void {
  const dl = (globalThis as { __diffLog?: string[] }).__diffLog;
  if (dl) dl.push(line);
}

/** THE DISTRICT PRICE, in PARTS. `Districts.CostProgressionModel` gives two
 *  models and the engine composes base -> discount -> variant -> the
 *  GAME_PROGRESS add; a single total hides which of the four moved. Keyed on
 *  the district's ID STRING: the two engines index their district catalogues
 *  differently (the exporter drops a leading row, so every TS position is one
 *  higher), and an index space they do not share files the two sides as two
 *  unrelated lines that never pair. */
export function logDistrictCost(
  turn: number, seat: number, id: DistrictId,
  base: number, disc: number, varied: number, add: number,
): void {
  push(`dc:${seat}:${turn}:${id}`
    + ` b${base} d${disc} v${varied} g${add} t${varied + add}`);
}

/** WHICH writer last moved a seat's STRATEGIC bank, and to what — keyed on
 *  the seat, the turn and the stockpile SLOT (the `rid` order both engines
 *  share). Eight writers can move it (income, upkeep, a plant's burn, a
 *  unit's or project's charge, an upgrade, a deal's lump and its return, a
 *  Great Person's grant), so the tag is part of the key. */
export function logStockWrite(turn: number, seat: number, slot: number, tag: string, value: number): void {
  push(`sk:${seat}:${turn}:${slot}:${tag} ${value}`);
}

/** WHICH writer last moved a unit's experience pool. Seven of them can, and
 *  only one clamps, so a disagreement in the total says nothing about which
 *  ran — the tag does, which is why it is part of the key. */
export function logXpWrite(state: GameState, unit: Unit, tag: string): void {
  push(`xp:${unit.seat}:${state.turn}:${unit.tileIndex}`
    + `:${UNIT_TYPE_IDX.indexOf(unit.type)}:${tag} ${unit.xp ?? 0}`);
}

/** WHICH writer last moved a city's population, and to what. Keyed on the
 *  CENTRE TILE rather than the city id: an id is a per-seat counter and the
 *  centre is the one name both engines share for the same city. */
export function logPopWrite(at: GameState | number, city: City, tag: string): void {
  const turn = typeof at === 'number' ? at : at.turn;
  push(`pop:${city.seat}:${turn}:${city.centerIndex}:${tag} ${city.population}`);
}
