/**
 * PROVENANCE — where a constant came from, written beside the constant so a
 * checker can re-read the source and compare.
 *
 * Three kinds, and a fourth for arithmetic:
 *
 *   XML       an install row: the TABLE (not the file — a table spans Base,
 *             the expansions and the DLC packs, and the LAST writer wins),
 *             the row's key column(s) as `Col=VALUE[&Col2=VALUE2]`, and the
 *             column read. The install's OWN ids, always — the engine says
 *             FOREST where the install says FEATURE_FOREST and LAKE where it
 *             says TERRAIN_COAST, and the mapping belongs in the tag where the
 *             checker can see it, never in a reader's head.
 *   LAB       a magnitude the install does not publish (DLL logic), MEASURED
 *             in the live game: the tools/civ6lab/runs/ file or the AUDIT
 *             entry (C-16, ask 16) that holds the measurement. The checker
 *             verifies the reference exists.
 *   PEDIA     the install's published TEXT (a Civilopedia page, an ability
 *             paragraph) where no table holds the number. Not a measurement.
 *   STYLIZED  a magnitude this engine chose. Named so the choice is visible
 *             instead of remembered (owner rulings).
 *   DERIVED   arithmetic over other constants — the tag names the inputs and
 *             the formula in words; the checker resolves every input in the
 *             install (a dangling input is RED) and evaluates what it can.
 *
 * A row-shaped catalog carries `src` INLINE, keyed by column name: the
 * exporter picks fields by name, so `src` never reaches the wire, and
 * rules.json stays byte-identical to a tree without tags. A named scalar
 * goes through `srcConst`, which returns the value unchanged and records it
 * in `SRC_REGISTRY` under a name the dump script reports — the same name
 * the wire uses where the scalar is exported, so the checker can pair them.
 *
 * `tools/install/xml_check.py` reads the dump (`seeder/worlds/provenance.json`,
 * written beside rules.json by `npm run export`) and the install, and prints
 * MATCH / MISMATCH / UNSOURCED per constant.
 */

/** an install row and column. `table` is the XML table name (`Units`,
 *  `GlobalParameters`, `District_TradeRouteYields`); `where` the key
 *  column(s) that pick the row, `Col=VALUE` joined by `&` for a composite
 *  key; `col` the column read. `note` is for the reader, never compared. */
interface XmlSrc {
  xml: string;      // table name
  where: string;    // `UnitType=UNIT_BUILDER` or `DistrictType=DISTRICT_HARBOR&YieldType=YIELD_GOLD`
  col: string;      // the column whose value this constant IS
  /** the install's spelling when the engine's differs — the checker compares
   *  the cell to THIS, and the tag is where the id mapping lives
   *  (`requiresTech: 'POTTERY'` <- `PrereqTech` = `TECH_POTTERY`). */
  expect?: string | number | boolean;
  /** the catalog holds `floor(cell * scale)` — a unit's cost through
   *  GAME_SPEED (`scaleByGameSpeed`); the checker applies the same
   *  arithmetic, exact where the catalog holds a fraction. */
  scale?: number;
  /** THE FACT IS AN ABSENCE: the install row carries no such column (a
   *  building with no PurchaseYield cannot be bought), or no such row
   *  exists (no Improvement_ValidResources row = not resource-only). The
   *  checker passes when the cell is MISSING and reds when it appears —
   *  the reverse of a normal tag. As a `derived` input it means the same. */
  absent?: boolean;
  note?: string;
}

/** a live-game measurement: the run file under tools/civ6lab/runs/ or the
 *  AUDIT entry (`C-16`, `ask 16`) that records it. */
interface LabSrc {
  lab: string;
  note?: string;
}

/** a magnitude this engine chose; `why` names the ruling or the reason. */
interface StylizedSrc {
  stylized: string;
}

/** the install's PUBLISHED TEXT — a Civilopedia page, a concept entry, a
 *  unit's or leader's ability text — where no table holds the number (a
 *  "within 9 tiles" radius, a climate-phase table, a mission's duration
 *  paragraph). Weaker than XML (prose can lag the tables) and stronger
 *  than a wiki; not a measurement, so never `lab`. The checker counts it
 *  and does not compare it. */
interface PediaSrc {
  pedia: string;
}

/** arithmetic over other constants. `formula` is words the checker can
 *  match against its small vocabulary (`floor(x*GAME_SPEED)`, `sum`, ...)
 *  or fail loudly on; `inputs` are XML/LAB sources of the operands. */
interface DerivedSrc {
  derived: string;
  inputs?: readonly Src[];
}

export type Src = XmlSrc | LabSrc | StylizedSrc | DerivedSrc | PediaSrc;

/** the per-column tags a row-shaped catalog entry carries; `ranged.strength`
 *  style dotted keys reach into nested objects. */
export type SrcMap = Readonly<Record<string, Src>>;

/** A named scalar's record: the name the dump reports (and the wire uses
 *  where exported), the value at registration, and its source. */
interface SrcConstRecord {
  name: string;
  value: number | string | boolean | readonly (number | string)[];
  src: Src;
}

/** Filled at import time by `srcConst`; read by cpu/export/provenance.ts. A
 *  name registered twice is a bug (two composers of one fact) and throws. */
export const SRC_REGISTRY: SrcConstRecord[] = [];
const seen = new Set<string>();

/** Register a named scalar's provenance and return the value UNCHANGED —
 *  `export const SPY_ROLL_DICE = srcConst('spy.rollDice', 3, { lab: 'C-16' })`. */
export function srcConst<T extends number | string | boolean | readonly (number | string)[]>(
  name: string, value: T, src: Src,
): T {
  if (seen.has(name)) throw new Error(`srcConst: '${name}' registered twice`);
  seen.add(name);
  SRC_REGISTRY.push({ name, value, src });
  return value;
}

/** shorthand for the common XML tag; `more` carries expect / scale / note */
export function xml(table: string, where: string, col: string,
  more?: Pick<XmlSrc, 'expect' | 'scale' | 'note' | 'absent'>): XmlSrc {
  return { xml: table, where, col, ...more };
}
