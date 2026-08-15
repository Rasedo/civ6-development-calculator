/**
 * THE DECISION-SERVER DRIVER for the TS engine.
 *
 * The engine does not decide anything here. Each turn this renders EVERY
 * seat's observation, hands them to the decision server, waits for that server's
 * records, and applies them through the ordinary engine calls — then ends the
 * turn and reports the trace row so the server can compare this engine
 * against the other one.
 *
 * The GPU sim is the OTHER client of the same decision. That is what makes
 * the comparison meaningful: one policy, two engines, so a disagreement is an
 * ENGINE difference and never two policies drifting apart.
 *
 * Transport is injected (`recv`/`send`): stdio lines for the gate today, a
 * dev server for the UI later. The record schema is the interface.
 */
import { writeFileSync } from 'node:fs';
import type { DistrictId, GameState, Seat, Tile } from '../core/types';
import { allCities, civHasStrategic, civsAtWar, seatOf, tileOwnedByCiv } from '../core/seats';
import { hasRiver, isWater } from '../../world/query';
import { GOLD_PURCHASE_MULT } from '../data/constants';
import { PEACE_GOLD_COST } from '../data/seats';
import { SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { BUY_UNITS } from '../core/phase';
import { buildingFaithCost, endTurn, goldAffordable, settlerCost, tilePurchaseCost } from '../core/game';
import { isSuzerain } from '../core/cityStates';
import { pickBorderTile } from '../core/city';
import { WORSHIP_BUILDINGS, MISSIONARY_CAP, APOSTLE_CAP, ENHANCER_BELIEFS } from '../data/religion';
import { LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import { observeSeat } from '../core/observe';
import { stateDigest, groupDump } from '../core/statecompare';
import { validImprovementsIn } from '../core/rules';
import { computeUnlocksIn, getModifiers } from '../core/effects';
import { hexDistance } from '../../world/hex';
import { prodLayout } from '../core/prodLayout';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';

export interface DriverOpts {
  state: GameState;
  seed: number;
  turns: number;
  cityMax: number;
  cityStateMax: number;
  /** The world file's `civMax` — the count of a seat's OPPONENTS, so the
   *  major roster is `civMax + 1` seats wide (ids 0..civMax). */
  civMax: number;
  horizon: number;
  improvementIds: string[];
  scaffoldDistricts: { id: DistrictId }[];
  techList: { id: string }[];
  civicList: { id: string }[];
  recv: () => Promise<string>;
  send: (msg: unknown) => void;
}

/** The BUY-candidate tripwire row for ONE seat — the TS pre-turn twin of
 * drive._buy_ctx, in the 11-field shape the orchestrator compares:
 * [buildingCentre, buildingIdx, settlerOk, unitOk, tileOk, tile, tileCentre,
 * worshipCentre, religKind, religCentre, levyIdx]. ATTRIBUTION when a purchase
 * diverges (which half went wrong, at its causal turn); the digest stays the
 * gate. Seat-generic: seat 0 is a seat like any other.
 */
function buyCandidateRow(state: GameState, actor: Seat): number[] {
  const unl = computeUnlocksIn(actor.research);
    let buyC = -1;
    let buyB = -1;
    let bd: (typeof BUILDINGS)[string] | null = null;
    let bc: (typeof actor.cities)[number] | null = null;
    for (const city of actor.cities) {
      const have = new Set(city.buildings);
      const done = new Set(city.districts.filter((d: { tileIndex: number }) => state.map.tiles[d.tileIndex].districtComplete).map((d: { type: string }) => d.type));
      const center = state.map.tiles[city.centerIndex];
      for (const def of Object.values(BUILDINGS)) {
        if (have.has(def.id) || def.worship || SCRIPTED_HELD_BUILDINGS.has(def.id)) continue;
        if (!done.has(def.district)) continue;
        if (!unl.buildings.has(def.id)) continue;
        if (def.requiresAny && !def.requiresAny.some((x) => have.has(x))) continue;
        if (def.exclusiveWith?.some((x) => have.has(x))) continue;
        if (def.special === 'WATER_MILL' && !hasRiver(center)) continue;
        if (city.queue[0]?.kind === 'building' && city.queue[0].building === def.id) continue;
        if (!bd || def.cost < bd.cost || (def.cost === bd.cost && def.id < bd.id)) {
          bd = def;
          bc = city;
        }
      }
    }
    if (bd && bc && Math.round((actor.treasury ?? 0) * 1000) >= Math.round((bd.cost * GOLD_PURCHASE_MULT + PEACE_GOLD_COST(0)) * 1000)) {
      buyC = bc.centerIndex;
      buyB = prodLayout().buildings.indexOf(bd.id);
    }
    // The settler is a UNIT purchase now (#71): it spawns at the capital
    // (else the first city), which must afford the live escalating price
    // and have the pop to pay (a 1-pop city may not buy one).
    const settlerSpawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
    const settlerOk = settlerSpawnCity !== undefined && settlerSpawnCity.population >= 2
      && goldAffordable(actor.treasury ?? 0, settlerCost(state, actor.seat) * GOLD_PURCHASE_MULT);
    let mil = 0;
    for (const u of state.units) {
      if (u.seat !== actor.seat) continue;
      if ((UNITS[u.type]?.combat ?? 0) > 0) mil += 1;
    }
    for (const city of actor.cities) {
      const q = city.queue[0];
      if (q?.kind === 'unit' && q.unit && (UNITS[q.unit]?.combat ?? 0) > 0) mil += 1;
    }
    let anyU = false;
    for (const cand of BUY_UNITS) {
      if (cand.tech && !actor.research.techs.includes(cand.tech)) continue;
      const def = UNITS[cand.id];
      if (!def) continue;
      if (def.requiresResource && !civHasStrategic(state, actor.seat, def.requiresResource)) continue;
      if (!goldAffordable(actor.treasury ?? 0, def.cost * GOLD_PURCHASE_MULT)) continue;
      anyU = true;
      break;
    }
    const unitOk = actor.cities.length > 0 && mil < actor.cities.length * 2 && anyU;
    // #104 the TILE candidate twin — the first city in array order with
    // a border candidate names the pick (pickBorderTile, the culture
    // claim's own key, with THIS seat's mods); an unaffordable pick
    // ABORTS the civ's tile buy (the break — it does not try the next
    // city).
    let tileOk = 0;
    let tileT = -1;
    let tileC = -1;
    const actorMods = getModifiers(state, actor.seat);
    for (const city of actor.cities) {
      const next = pickBorderTile(state, city, { map: state.map, mods: actorMods });
      if (next === null) continue;
      if (goldAffordable(actor.treasury ?? 0, tilePurchaseCost(state, city, next))) {
        tileOk = 1;
        tileT = next;
        tileC = city.centerIndex;
      }
      break;
    }
    // #104 the FAITH candidate twins: worship (independent) + the ONE
    // religious unit (missionary saturates before apostle) — the
    // _seat_faith_buy_candidates mirror, first eligible city in order.
    const hsOk = (city: (typeof actor.cities)[number]): boolean => {
      const hs = city.districts.find((d) => d.type === 'HOLY_SITE');
      const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
      return !!ht?.districtComplete && !ht.districtPillaged;
    };
    let worshipC = -1;
    let religKind = -1;
    let religC = -1;
    if (actor.religion.founded) {
      const wid = WORSHIP_BUILDINGS[actor.seat % WORSHIP_BUILDINGS.length];
      if (goldAffordable(actor.faith ?? 0, buildingFaithCost(wid))) {
        worshipC = actor.cities.find((city) => !city.buildings.includes(wid) && city.buildings.includes('TEMPLE') && hsOk(city))?.centerIndex ?? -1;
      }
      const shrineCity = actor.cities.find((city) => city.buildings.includes('SHRINE') && hsOk(city));
      if (shrineCity) {
        const eb = actor.religion.enhancer ? ENHANCER_BELIEFS[actor.religion.enhancer]?.effects : undefined;
        const liveM = state.units.filter((u) => u.seat === actor.seat && u.type === 'MISSIONARY').length;
        const mCost = Math.round(UNITS.MISSIONARY.cost * (eb?.missionaryCostMult ?? 1));
        if (liveM < MISSIONARY_CAP && goldAffordable(actor.faith ?? 0, mCost)) {
          religKind = 5;
          religC = shrineCity.centerIndex;
        } else {
          const liveA = state.units.filter((u) => u.seat === actor.seat && u.type === 'APOSTLE').length;
          if (liveA < APOSTLE_CAP && goldAffordable(actor.faith ?? 0, Math.round(UNITS.APOSTLE.cost))) {
            religKind = 6;
            religC = shrineCity.centerIndex;
          }
        }
      }
    }
    // #104 the LEVY candidate twin — being at war is the POLICY gate; the
    // rule body levyUnits has no war test. First eligible CS in order.
    let levyIdx = -1;
    // At war with ANY other major, read off this seat's own row — the GPU's
    // `war[row, :1+R].any()` twin. It used to read a single war axis from
    // whichever end the seat sat on, so a civ fighting only another civ read
    // FALSE here and never levied.
    const atWar = state.seats.some((o) => o.seat !== actor.seat && civsAtWar(state, actor.seat, o.seat));
    if (atWar && goldAffordable(actor.treasury ?? 0, LEVY_GOLD_COST)) {
      for (let ci = 0; ci < state.cityStates.length; ci++) {
        const csl = state.cityStates[ci];
        if (csl.type !== 'militaristic') continue;
        if (!isSuzerain(csl, actor.seat)) continue;
        if (state.turn - (csl.lastLevyTurn ?? -LEVY_COOLDOWN) < LEVY_COOLDOWN) continue;
        levyIdx = ci;
        break;
      }
    }
  return [buyC, buyB, settlerOk ? 1 : 0, unitOk ? 1 : 0,
    tileOk, tileT, tileC, worshipC, religKind, religC, levyIdx];
}

/** Play `turns` turns, taking every decision from the server. */

export async function runDriver(o: DriverOpts): Promise<void> {
  const { state, seed, turns: N_TURNS, cityMax: CITY_MAX, cityStateMax: CITY_STATE_MAX, civMax: CIV_MAX } = o;
  // The MAJOR ROSTER WIDTH. `civMax` counts a seat's opponents, so the seats
  // it describes are 0..civMax — one more than the number it names. Deriving
  // the width once is what keeps `<= CIV_MAX` from appearing beside
  // `< CIV_MAX` in the same file.
  const N_MAJORS = CIV_MAX + 1;
for (let t = 0; t < N_TURNS; t++) {
  {
    // S1(b): the handshake — obs out (one per seat, the seat-invariant
    // observeSeat vector), decisions in (record-schema
    // dicts, stored at the driven-file key: state.seatActions[state.turn - 1],
    // read by THIS turn's seatPhase). The obs renders at the GPU's own
    // decide position: pre-turn, before any phase acts.
    // The wire is SEAT-keyed: every key is a seat id, and "0" is a seat like
    // any other.
    const obs: Record<string, number[]> = {};
    for (let seat = 0; seat < N_MAJORS; seat++) obs[String(seat)] = observeSeat(state, seat, CITY_MAX, o.horizon, CITY_STATE_MAX);
    // per-unit obs twins — the drive.py extractors' TS mirrors, per
    // seat unit IN UNIT-ARRAY ORDER (the proven slot-map mirror):
    // job = nearest hasJob tile (d*T + index key, ties lowest);
    // spread = nearest allCities centre whose followedReligion != g
    // (d*(T+1) + centreIndex key), religious charge-carriers only.
    const jobsMsg: Record<string, number[]> = {};
    const spreadsMsg: Record<string, number[]> = {};
    const buysMsg: Record<string, number[]> = {};
    const nT = state.map.tiles.length;
    for (let seat = 0; seat < N_MAJORS; seat++) {
      const actor = seatOf(state, seat);
      const jr: number[] = [];
      const sr: number[] = [];
      if (actor) {
        const owns = (t: Tile) => tileOwnedByCiv(t, seat);
        const unl = computeUnlocksIn(actor.research);
        const jobTiles = state.map.tiles.filter((t) =>
          owns(t) && !isWater(t)
          && (t.pillaged || t.districtPillaged
            || (!t.improvement && validImprovementsIn(t, { unlocks: unl, ownsTile: owns, map: state.map }).length > 0)));
        // The religion GROUP id IS the seat id, on both engines.
        const spreadTargets = actor.religion.founded
          ? allCities(state).filter((c) => c.followedReligion !== seat)
          : [];
        for (const u of state.units) {
          if (u.seat !== seat) continue;
          let jt = -1;
          if (UNITS[u.type]?.charges !== undefined && (u.charges ?? 0) > 0) {
            const ut = state.map.tiles[u.tileIndex];
            let bk = Infinity;
            for (const t of jobTiles) {
              const k = hexDistance(ut.col, ut.row, t.col, t.row) * nT + t.index;
              if (k < bk) { bk = k; jt = t.index; }
            }
          }
          jr.push(jt);
          let st = -1;
          if ((u.type === 'MISSIONARY' || u.type === 'APOSTLE') && (u.charges ?? 0) > 0) {
            const ut = state.map.tiles[u.tileIndex];
            let bk = Infinity;
            for (const c of spreadTargets) {
              const ct = state.map.tiles[c.centerIndex];
              const k = hexDistance(ut.col, ut.row, ct.col, ct.row) * (nT + 1) + c.centerIndex;
              if (k < bk) { bk = k; st = c.centerIndex; }
            }
          }
          sr.push(st);
        }
        buysMsg[String(seat)] = buyCandidateRow(state, actor);
      }
      jobsMsg[String(seat)] = jr;   // seat-keyed wire
      spreadsMsg[String(seat)] = sr;
    }
    o.send({ t: state.turn, obs, jobs: jobsMsg, spreads: spreadsMsg, buys: buysMsg });
    const msg = JSON.parse(await o.recv()) as { recs?: Record<string, unknown> };
    if (msg.recs && Object.keys(msg.recs).length) {
      // The rec keys are SEAT ids and storage is seat-keyed too — the
      // seatPhase loop reads state.seatActions[turn][actor.seat] for EVERY
      // seat, 0 included, and EVERY verb in the record (production, tech,
      // civic, war, envoys, buys, geo and the unit ranks) is consumed there.
      // Nothing is applied off-loop any more: #108 retired the seat-0 TRIPLES
      // schema, so one record shape reaches one applier at one position.
      const bySeat: Record<number, unknown> = {};
      for (const [sid, rec] of Object.entries(msg.recs)) {
        bySeat[Number(sid)] = rec;
      }
      (state.seatActions as unknown as Record<number, unknown>)[state.turn - 1] = bySeat;
    }
  }
  // CIV6_EXPORT_DEBUG=<seed>: narrate that seed's turn events for diagnosis.
  const evBefore = state.eventLog.length;
  endTurn(state);
  if (process.env.CIV6_EXPORT_DEBUG === String(seed)) {
    for (const line of state.eventLog.slice(evBefore)) console.log(`t${state.turn - 1} ${line}`);
    // EVERY major, not just seat 0 — a divergence rarely announces which seat
    // it belongs to, and a probe that only watches one seat cannot say.
    for (let s = 0; s < N_MAJORS; s++) {
      const sx = state.seats[s];
      if (!sx) continue;
      console.log(`t${state.turn - 1} seat ${s} cities=${sx.cities.length} pop=${sx.cities.map((c) => c.population).join(',')}`);
    }
  }
  // #105 (owner override): the TRACE is DELETED — the state-compare digest
  // IS the per-turn comparison, always on.
  o.send({ digest: stateDigest(state) });
  // Post-trace control: the orchestrator may request keyed dumps of the
  // groups whose digests disagreed — the state has not moved yet, so the
  // dump is exactly the state the digest hashed. It may also request a
  // CHECKPOINT (#101): GameState is plain JSON-able data, so the dump a
  // fresh child reloads via CIV6_SERVE_LOAD is bit-faithful, rngState and
  // seatActions included. `go` releases the turn.
  for (;;) {
    const ctl = JSON.parse(await o.recv()) as { go?: number; dump?: string[]; ckpt?: string };
    if (ctl.ckpt) {
      writeFileSync(ctl.ckpt, JSON.stringify(state));
      o.send({ ok: 1 });
      continue;
    }
    if (!ctl.dump) break;
    const dumps: Record<string, unknown> = {};
    for (const g of ctl.dump) dumps[g] = groupDump(state, g);
    o.send({ dumps });
  }
}
  // A dead seat 0 is a LEGITIMATE outcome — conquest and loyalty flips are
// the hostile world working. The gate compares every seat every turn
// regardless of who survives, and a finished game reads post-hoc from
// whichever seat earned the horizon (the `protagonist()` pick), so no
// single seat's fate invalidates a seed.
}
