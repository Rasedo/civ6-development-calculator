/**
 * The turn-state encoding shared by the GPU-fixture exporter
 * (export-gpu.ts) and the rollout replayer (replay-gpu.ts). One source of
 * truth on the TS side; gpu/civ6gpu/engine.py trace_row() mirrors it.
 *
 * Every column is ONE entry in one of the four tables below — `{name, tol,
 * get}` — and both the row and the name/tolerance vectors are generated from
 * them. Nothing is positional any more, so a new column cannot silently shift
 * a later column's tolerance (the failure mode the old hand-maintained `tol`
 * literal had: its own comment claimed "HEAD is 24 ... HEAD is 25 now" while
 * the real width was 28).
 *
 * `tol`: 0 = exact integer, 2 = ×1000-encoded float.
 *
 * Column NAMES are the cross-engine contract: gpu/parity_test.py asserts the
 * TS list (shipped in rules.trace) and BatchSim.trace_columns() are identical
 * before it compares a single value, and applies tolerance BY NAME.
 *
 * Slot columns render a dead/absent slot by calling `get` with `undefined`,
 * which must yield 0 — mirroring the GPU's zero-filled dead slot. City slots
 * are keyed by FOUNDING ORDER via `cityIds` (append new ids as cities appear;
 * once cMax ids exist a new id REUSES the first dead column, mirroring the
 * GPU's first-free-hole slot) — not by position in state.cities, which
 * compacts when a city flips to a rival. rngState stays the strongest signal:
 * any divergence in the number or order of draws fails the very next row.
 */

import { empireScore, rivalEmpireScore } from '../src/core/empirePlanner';
import { dominationWinner } from '../src/core/game';
import { playerSeat, isPlayerSeat, isBarbSeat, isRivalSeat, civOfRival, tileBelongsTo, rivalsOf } from '../src/core/seats';
import { UNITS } from '../src/data/units';
import { BUILDINGS } from '../src/data/buildings';
import { BUILT_WONDERS } from '../src/data/builtWonders';
import type { City, CityState, GameState, RivalCity, RivalCiv } from '../src/core/types';

/**
 * The price of a queue front item. ONE definition, shared by the civ-level
 * `qCostSum` and the per-rival-city `cost` column — pricing them separately is
 * how the two would drift.
 *   P4/D-10: unit items may LOCK a cost (escalated builders) — price the lock
 *     first, exactly like the completion check does.
 *   A-4: wonder items carry NO cost field — price from the catalog.
 */
function queueItemCost(q: RivalCity['queue'][number] | undefined): number {
  if (!q) return 0;
  return q.kind === 'settler' || q.kind === 'project' || q.kind === 'district'
    ? q.cost ?? 0
    : q.kind === 'unit'
      ? q.cost ?? UNITS[q.unit]?.cost ?? 0
      : q.kind === 'building'
        ? BUILDINGS[q.building]?.cost ?? 0
        : q.kind === 'wonder'
          ? BUILT_WONDERS[q.wonder]?.cost ?? 0
          : 0;
}

/** Row-scoped values shared by several head columns (computed once per row). */
type HeadCtx = { leader: number; dom: number };

export type TraceCol<T> = { name: string; tol: 0 | 2; get(state: GameState, x: T): number };

const HEAD_COLS: TraceCol<HeadCtx>[] = [
  { name: 'turn', tol: 0, get: (s) => s.turn },
  { name: 'techs', tol: 0, get: (s) => playerSeat(s).research.techs.length },
  { name: 'civics', tol: 0, get: (s) => playerSeat(s).research.civics.length },
  { name: 'settlers', tol: 0, get: (s) => playerSeat(s).settlers },
  { name: 'nCities', tol: 0, get: (s) => s.cities.length },
  { name: 'treasury', tol: 2, get: (s) => Math.round(playerSeat(s).treasury * 1000) },
  { name: 'science', tol: 2, get: (s) => Math.round(playerSeat(s).scienceTotal * 1000) },
  { name: 'culture', tol: 2, get: (s) => Math.round(playerSeat(s).cultureTotal * 1000) },
  { name: 'score', tol: 2, get: (s) => Math.round(empireScore(s, 'balanced') * 1000) },
  { name: 'rng', tol: 0, get: (s) => s.rngState >>> 0 },
  { name: 'nCamps', tol: 0, get: (s) => s.barbSeat.camps.length },
  { name: 'nBarbs', tol: 0, get: (s) => s.units.filter((u) => isBarbSeat(u.seat)).length },
  { name: 'nPlayerUnits', tol: 0, get: (s) => s.units.filter((u) => isPlayerSeat(u.seat)).length },
  { name: 'envoysAvail', tol: 0, get: (s) => playerSeat(s).envoysAvailable },
  { name: 'influence', tol: 0, get: (s) => playerSeat(s).influencePoints },
  { name: 'fertility', tol: 0, get: (s) => s.map.tiles.reduce((n, t) => n + t.fertility, 0) },
  { name: 'droughtTiles', tol: 0, get: (s) => s.map.tiles.reduce((n, t) => n + (t.droughtTurns > 0 ? 1 : 0), 0) },
  { name: 'improvements', tol: 0, get: (s) => s.map.tiles.reduce((n, t) => n + (t.improvement !== null ? 1 : 0), 0) },
  { name: 'leader', tol: 0, get: (_s, c) => c.leader }, // GV-1
  { name: 'gameOver', tol: 0, get: (s) => (s.gameOver ? 1 : 0) }, // GV-2
  { name: 'winner', tol: 0, get: (s, c) => (c.dom >= 0 ? c.dom : s.gameOver ? c.leader : -1) }, // GV-2/GV-3
  { name: 'victoryType', tol: 0, get: (s) => s.victoryType ?? 0 }, // GV-4/GV-3
  { name: 'playerAge', tol: 0, get: (s) => s.civAges?.[0] ?? 1 }, // B-24 S2
  { name: 'tourism', tol: 0, get: (s) => playerSeat(s).tourism ?? 0 }, // B-20 (#71)
  { name: 'warmonger', tol: 0, get: (s) => playerSeat(s).warmonger }, // B-22 (#74)
  { name: 'diploFavor', tol: 0, get: (s) => playerSeat(s).diploFavor }, // B-22 (#75)
  { name: 'congressSessions', tol: 0, get: (s) => s.congressSessions ?? 0 }, // B-22 (#76)
  { name: 'diploPoints', tol: 0, get: (s) => playerSeat(s).diploPoints }, // B-22 (#76)
  // #51/S0.2: the PLAYER twins of columns the RIVALS have carried for rounds.
  // Player FAITH is deliberately absent: the GPU player has no faith ECONOMY at
  // all (player_faith is written by GP/dedications and read by nothing, and the
  // per-turn yield side is unmodeled) — tracing it would just go red. Recorded
  // as task #53 / gpu/AUDIT.md, to be fixed by giving the player the rival's
  // economy rather than by widening the trace around the gap.
  { name: 'techProg', tol: 2, get: (s) => Math.round(playerSeat(s).research.techProgress * 1000) },
  { name: 'civicProg', tol: 2, get: (s) => Math.round(playerSeat(s).research.civicProgress * 1000) },
  { name: 'warWeariness', tol: 0, get: (s) => playerSeat(s).warWeariness },
];

// Keyed by id (== the GPU's static slot), NOT array position: a captured
// city-state leaves the list (V-CS), and positional indexing would shift every
// later slot's columns.
const PER_CS_COLS: TraceCol<CityState | undefined>[] = [
  { name: 'envoys', tol: 0, get: (_s, cs) => cs?.envoys ?? 0 },
  { name: 'pop', tol: 0, get: (_s, cs) => cs?.population ?? 0 },
  {
    name: 'questKind',
    tol: 0,
    get: (_s, cs) => (cs?.quest ? { clearCamp: 1, sendTradeRoute: 2, buildDistrict: 3 }[cs.quest.kind] : 0),
  },
];

const PER_RIVAL_COLS: TraceCol<RivalCiv | undefined>[] = [
  { name: 'nCities', tol: 0, get: (_s, r) => r?.cities.length ?? 0 },
  { name: 'popSum', tol: 0, get: (_s, r) => r?.cities.reduce((n, rc) => n + rc.population, 0) ?? 0 },
  {
    name: 'nUnits',
    tol: 0,
    get: (s, r) => (r ? s.units.filter((u) => isRivalSeat(u.seat) && u.seat === civOfRival(r.id)).length : 0),
  },
  { name: 'atWar', tol: 0, get: (_s, r) => (r?.atWar ? 1 : 0) },
  { name: 'nTechs', tol: 0, get: (_s, r) => r?.research.techs.length ?? 0 },
  { name: 'nCivics', tol: 0, get: (_s, r) => r?.research.civics.length ?? 0 },
  { name: 'techProg', tol: 2, get: (_s, r) => (r ? Math.round(r.research.techProgress * 1000) : 0) },
  { name: 'civicProg', tol: 2, get: (_s, r) => (r ? Math.round(r.research.civicProgress * 1000) : 0) },
  // C1-B2: the pooled stocks died — trace the queues instead (Σ front-item
  // progress and Σ front-item cost across the civ's cities).
  {
    name: 'qProgSum',
    tol: 2,
    get: (_s, r) => (r ? Math.round(r.cities.reduce((n, rc) => n + (rc.queue[0]?.progress ?? 0), 0) * 1000) : 0),
  },
  {
    name: 'qCostSum',
    tol: 2,
    get: (_s, r) => (r ? Math.round(r.cities.reduce((n, rc) => n + queueItemCost(rc.queue[0]), 0) * 1000) : 0),
  },
  // C1-B4: COMPLETED rival districts (queued ones pave but don't count).
  {
    name: 'nDistricts',
    tol: 0,
    get: (s, r) =>
      r
        ? r.cities.reduce(
            (n, rc) => n + rc.districts.filter((d) => d.type !== 'CITY_CENTER' && s.map.tiles[d.tileIndex].districtComplete).length,
            0,
          )
        : 0,
  },
  { name: 'nBuildings', tol: 0, get: (_s, r) => r?.cities.reduce((n, rc) => n + rc.buildings.length, 0) ?? 0 },
  { name: 'treasury', tol: 2, get: (_s, r) => (r ? Math.round((r.treasury ?? 0) * 1000) : 0) }, // VP-G1
  { name: 'rGScore', tol: 2, get: (s, r) => (r ? Math.round(rivalEmpireScore(s, r) * 1000) : 0) }, // GV-1
  // A-19/B-33 (S2): per-pair war bitmask over rival ids (bit i set = at war
  // with rival i). The (0, r+1) player pair rides the atWar column above.
  { name: 'rrWarMask', tol: 0, get: (_s, r) => (r?.atWarRivals ?? []).reduce((m, id) => m | (1 << id), 0) },
  // B-24 S2: this rival's Age (0 Dark / 1 Normal / 2 Golden, compared).
  { name: 'age', tol: 0, get: (s, r) => (r ? s.civAges?.[r.id + 1] ?? 1 : 0) },
  // B-20 (#71): this rival's cumulative TOURISM.
  { name: 'tourism', tol: 0, get: (_s, r) => r?.tourism ?? 0 },
  // #71 COVERAGE: rival FAITH — untraced until then, which let a +2.0 faith
  // divergence hide behind five green gates.
  { name: 'faith', tol: 2, get: (_s, r) => (r ? Math.round((r.faith ?? 0) * 1000) : 0) },
  // #71 COVERAGE: checksum of this rival's cities' followed religion — only
  // PLAYER cities have a `followed` column, so a rival city converting on a
  // different turn was invisible.
  { name: 'followedSum', tol: 0, get: (_s, r) => r?.cities.reduce((m, rc) => m + ((rc.followedReligion ?? -1) + 1), 0) ?? 0 },
  // B-25 (#72): this rival's LIFETIME CULTURE — the domestic-tourist
  // substrate. Traced so parity proves the accumulator itself.
  { name: 'cultureTotal', tol: 2, get: (_s, r) => (r ? Math.round((r.cultureTotal ?? 0) * 1000) : 0) },
  // B-22 (#75): this rival's cumulative DIPLOMATIC FAVOR.
  { name: 'diploFavor', tol: 0, get: (_s, r) => r?.diploFavor ?? 0 },
  // B-22 (#76): this rival's Diplomatic Victory Points.
  { name: 'diploPoints', tol: 0, get: (_s, r) => r?.diploPoints ?? 0 },
  // B-15 (#78 HUNT): WAR WEARINESS — untraced until then, which is how an
  // rGScore divergence hid: weariness feeds the amenity tier, the tier scales
  // city yields, and rivalEmpireScore is pop*3 + weighted yields.
  { name: 'warWeariness', tol: 0, get: (_s, r) => r?.warWeariness ?? 0 },
  // #51/S0.2: one-sided holes — the PLAYER has traced these since the start and
  // the rival planes existed untraced. Rival SCIENCE has no twin on EITHER
  // engine (no scienceTotal on RivalCiv, no r_science plane), so it is recorded
  // as a gap in gpu/AUDIT.md rather than invented here.
  { name: 'warmonger', tol: 0, get: (_s, r) => r?.warmonger ?? 0 },
  { name: 'influence', tol: 0, get: (_s, r) => r?.influencePoints ?? 0 },
  { name: 'envoysAvail', tol: 0, get: (_s, r) => r?.envoysAvailable ?? 0 },
  { name: 'tilesPurchased', tol: 0, get: (_s, r) => r?.tilesPurchased ?? 0 },
];

/**
 * #51/S0.2: per-RIVAL-CITY columns. Until now a rival's cities were traced only
 * as civ-level SUMS (popSum, nBuildings, qProgSum, ...), and that is exactly the
 * hole that let #71's rFaith and #79's rGScore1 survive several green gates: a
 * sum cancels two opposite per-city errors, and `followedSum` was already an
 * after-the-fact checksum invented because of it.
 *
 * THE JOIN IS LIVING ORDER, not slot index. TS `rival.cities[]` is DENSE
 * (`.push()` on settle/defect/flip, `.filter()` on death). GPU `rc_*` slots keep
 * HOLES: a new city lands at last-alive+1, and `_reclaim_rc` only compacts when
 * the alive high-water hits RC-8 — and then for the whole batch at once. So slot
 * j is NOT a valid key. What IS invariant, and what the engine already asserts in
 * both `_rival_try_found` and `_reclaim_rc` (whose stable argsort preserves
 * relative order of the living), is: **the k-th LIVING slot in ascending slot
 * order is `rival.cities[k]`**. The GPU side sorts by that same stable key.
 *
 * Dead slots keep STALE values — `_capture_rival_city` clears rc_alive and the
 * queue planes but NOT rc_pop/rc_acquired/rc_loyalty/rc_hp — so every column
 * here is alive-masked, and `rc_id` is zero-initialised (colliding with the
 * capital's id), which makes the mask load-bearing rather than cosmetic.
 */
export const RIVAL_CITY_MAX = 16; // MEASURED 2026-07-30: max 8 rival cities across 12 seeds x 250 turns; WIDENED 12->16 by #51/S4.1r, whose settler POP COST shifts trajectories enough that a rival reached 13 (RIVAL_MAX_CITIES caps SETTLING, not CAPTURES). Both engines ASSERT no rival exceeds this, so a 17th city fails loudly instead of silently losing coverage.

const PER_RIVAL_CITY_COLS: TraceCol<{ rival: RivalCiv; rc: RivalCity } | undefined>[] = [
  { name: 'pop', tol: 0, get: (_s, x) => x?.rc.population ?? 0 },
  {
    name: 'owned',
    tol: 0,
    // The engine's own per-city ownership predicate (rivals.ts pickRivalBorderTile).
    get: (s, x) => (x ? s.map.tiles.filter((t) => tileBelongsTo(t, x.rc)).length : 0),
  },
  { name: 'bldgs', tol: 0, get: (_s, x) => x?.rc.buildings.length ?? 0 },
  { name: 'acquired', tol: 0, get: (_s, x) => x?.rc.tilesAcquired ?? 0 },
  { name: 'foodBox', tol: 2, get: (_s, x) => (x ? Math.round(x.rc.foodBox * 1000) : 0) },
  { name: 'cultureBox', tol: 2, get: (_s, x) => (x ? Math.round(x.rc.cultureBox * 1000) : 0) },
  { name: 'hp', tol: 0, get: (_s, x) => x?.rc.hp ?? 0 },
  { name: 'loyalty', tol: 2, get: (_s, x) => (x ? Math.round((x.rc.loyalty ?? 100) * 1000) : 0) },
  { name: 'followed', tol: 0, get: (_s, x) => (x ? x.rc.followedReligion ?? -1 : 0) },
  { name: 'progress', tol: 2, get: (_s, x) => (x ? Math.round((x.rc.queue[0]?.progress ?? 0) * 1000) : 0) },
  { name: 'cost', tol: 2, get: (_s, x) => (x ? Math.round(queueItemCost(x.rc.queue[0]) * 1000) : 0) },
];

const PER_CITY_COLS: TraceCol<City | undefined>[] = [
  { name: 'pop', tol: 0, get: (_s, c) => c?.population ?? 0 },
  { name: 'owned', tol: 0, get: (s, c) => (c ? s.map.tiles.filter((x) => tileBelongsTo(x, c)).length : 0) },
  { name: 'bldgs', tol: 0, get: (_s, c) => c?.buildings.length ?? 0 },
  { name: 'acquired', tol: 0, get: (_s, c) => c?.tilesAcquired ?? 0 },
  { name: 'foodBox', tol: 2, get: (_s, c) => (c ? Math.round(c.foodBox * 1000) : 0) },
  { name: 'cultureBox', tol: 2, get: (_s, c) => (c ? Math.round(c.cultureBox * 1000) : 0) },
  { name: 'hp', tol: 0, get: (_s, c) => (c ? c.hp : 0) },
  { name: 'loyalty', tol: 2, get: (_s, c) => (c ? Math.round((c.loyalty ?? 100) * 1000) : 0) },
  // B-18: the pressure-spread followed-religion id (-1 = none, 0 = dead slot)
  { name: 'followed', tol: 0, get: (_s, c) => (c ? c.followedReligion ?? -1 : 0) },
];

export function traceRow(state: GameState, cityIds: number[], cMax: number, csMax: number, rMax: number): number[] {
  // GV-1: current score-leader as a unified civ id (0 player, r+1 rival); ties -> lowest id
  let leader = 0;
  let leaderBest = empireScore(state, 'balanced');
  for (const rv of rivalsOf(state)) {
    const rs = rivalEmpireScore(state, rv);
    if (rs > leaderBest) { leaderBest = rs; leader = rv.id + 1; }
  }
  const ctx: HeadCtx = { leader, dom: dominationWinner(state) }; // GV-3
  const row = HEAD_COLS.map((col) => col.get(state, ctx));
  for (let s = 0; s < csMax; s++) {
    const cs = state.cityStates.find((c) => c.id === s);
    for (const col of PER_CS_COLS) row.push(col.get(state, cs));
  }
  for (let r = 0; r < rMax; r++) {
    const rival = (state.seats[(r) + 1] as RivalCiv);
    for (const col of PER_RIVAL_COLS) row.push(col.get(state, rival));
  }
  for (let c = 0; c < cMax; c++) {
    const city = state.cities.find((x) => x.id === cityIds[c]);
    for (const col of PER_CITY_COLS) row.push(col.get(state, city));
  }
  // #51/S0.2: per-rival-city, joined by LIVING ORDER (see PER_RIVAL_CITY_COLS).
  for (let r = 0; r < rMax; r++) {
    const rival = (state.seats[(r) + 1] as RivalCiv);
    if (rival && rival.cities.length > RIVAL_CITY_MAX) {
      throw new Error(
        `rival ${r} holds ${rival.cities.length} cities but the trace only covers ${RIVAL_CITY_MAX} ` +
          `— widen RIVAL_CITY_MAX (and the GPU's _TRACE_RC_MAX) rather than lose coverage silently`,
      );
    }
    for (let k = 0; k < RIVAL_CITY_MAX; k++) {
      const rc = rival?.cities[k];
      const x = rival && rc ? { rival, rc } : undefined;
      for (const col of PER_RIVAL_CITY_COLS) row.push(col.get(state, x));
    }
  }
  return row;
}

/**
 * The name and tolerance vectors for a row of the same shape. Names are the
 * cross-engine contract — BatchSim.trace_columns() must return this exact list
 * and gpu/parity_test.py asserts it before comparing anything.
 */
export function traceColumnTables(): {
  head: { name: string; tol: number }[];
  perCs: { name: string; tol: number }[];
  perRival: { name: string; tol: number }[];
  perCity: { name: string; tol: number }[];
  perRivalCity: { name: string; tol: number }[];
  rivalCityMax: number;
} {
  const strip = (t: TraceCol<any>[]) => t.map((c) => ({ name: c.name, tol: c.tol }));
  return { head: strip(HEAD_COLS), perCs: strip(PER_CS_COLS), perRival: strip(PER_RIVAL_COLS), perCity: strip(PER_CITY_COLS), perRivalCity: strip(PER_RIVAL_CITY_COLS), rivalCityMax: RIVAL_CITY_MAX };
}

export function traceColumns(cMax: number, csMax: number, rMax: number): { names: string[]; tol: number[] } {
  const names: string[] = [];
  const tol: number[] = [];
  const push = (n: string, t: number) => { names.push(n); tol.push(t); };
  for (const col of HEAD_COLS) push(col.name, col.tol);
  for (let s = 0; s < csMax; s++) for (const col of PER_CS_COLS) push(`cs${s}.${col.name}`, col.tol);
  for (let r = 0; r < rMax; r++) for (const col of PER_RIVAL_COLS) push(`r${r}.${col.name}`, col.tol);
  for (let c = 0; c < cMax; c++) for (const col of PER_CITY_COLS) push(`c${c}.${col.name}`, col.tol);
  for (let r = 0; r < rMax; r++)
    for (let k = 0; k < RIVAL_CITY_MAX; k++)
      for (const col of PER_RIVAL_CITY_COLS) push(`r${r}c${k}.${col.name}`, col.tol);
  return { names, tol };
}
