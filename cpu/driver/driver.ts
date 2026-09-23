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
import type { DistrictId, GameState, Tile } from '../core/types';
import { allCities, campTiles, cityHolders, seatOf, tileOwnedByCiv } from '../core/seats';
import { endTurn, engineerFinishCity } from '../core/game';
import { buyCandidateRow, routeCandidateRow } from '../core/buyCandidates';
import { observeSeat } from '../core/observe';
import { worldObs, seatGroups } from '../core/decideObs';
import { stateDigest, groupDump } from '../core/statecompare';
import { canBuildRoad, validImprovementsIn } from '../core/rules';
import { hiddenResourcesFor } from '../core/seats';
import { computeUnlocks } from '../core/effects';
import { hexDistance } from '../../world/hex';

export interface DriverOpts {
  state: GameState;
  seed: number;
  turns: number;
  cityMax: number;
  cityStateMax: number;
  horizon: number;
  improvementIds: string[];
  scaffoldDistricts: { id: DistrictId }[];
  techList: { id: string }[];
  civicList: { id: string }[];
  recv: () => Promise<string>;
  send: (msg: unknown) => void;
}

/** The decomposition log's window, ONE PER LINE KIND — the GPU's
 *  `_trim_by_kind` twin. A flat window lets whichever emitter is chattiest
 *  push every other kind out, and the two engines are chatty in different
 *  proportions, so the two sides end up holding different turns and nothing
 *  pairs. Each prefix keeps its own last `keep`; the GRANT lines keep all. */
/** the kinds whose key carries its TURN as its third field */
const TURN_KINDS = new Set(['st', 'sp', 'xp', 'rg', 'rc', 'pop', 'sk']);

function trimByKind(lines: readonly string[], keep = 24): string[] {
  const by = new Map<string, string[]>();
  for (const ln of lines) {
    const k = ln.slice(0, ln.indexOf(':'));
    const g = by.get(k);
    if (g) g.push(ln);
    else by.set(k, [ln]);
  }
  // THE TURN WINDOW IS ABSOLUTE, taken over the WHOLE log rather than per
  // kind: a sparse kind's own "last two turns" are not the other engine's,
  // and every line of both then prints unpaired.
  const turnOf = (ln: string): number => Number(ln.split(':')[2]);
  const hi = lines.reduce((m, ln) => (TURN_KINDS.has(ln.slice(0, ln.indexOf(':')))
    ? Math.max(m, turnOf(ln)) : m), 0);
  const out: string[] = [];
  for (const [k, g] of by) {
    if (k === 'g') { out.push(...g); continue; }
    // the STEP and SPAWN lines keep the last two TURNS, not the last N: a count
    // straddles the turn boundary at a different place on each engine, and a
    // straddled window pairs the tail of one turn against the head of another.
    if (TURN_KINDS.has(k)) {
      out.push(...g.filter((ln) => turnOf(ln) >= hi - 1));
      continue;
    }
    out.push(...g.slice(-keep));
  }
  return out;
}



export async function runDriver(o: DriverOpts): Promise<void> {
  const { state, seed, turns: N_TURNS, cityMax: CITY_MAX, cityStateMax: CITY_STATE_MAX } = o;
  // THE MAJOR ROSTER WIDTH, read off THE ROSTER — never a scalar option
  // beside it, which is a second source of truth that can disagree with the
  // array it describes. The GPU reads its own width the same way, off the
  // fixture's `civs[]`.
  const N_MAJORS = state.seats.length;
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
    const routesMsg: Record<string, number[]> = {};
    const nT = state.map.tiles.length;
    for (let seat = 0; seat < N_MAJORS; seat++) {
      const actor = seatOf(state, seat);
      const jr: number[] = [];
      const sr: number[] = [];
      if (actor) {
        const owns = (t: Tile) => tileOwnedByCiv(t, seat);
        const unl = computeUnlocks(state, seat);
        const camps = campTiles(state);
        const hidden = hiddenResourcesFor(state, seat); // `_plane_seen`: an unseen strategic is plain ground
        // `_job_mask_core`'s twin: the REPAIR arms take ANY owned pillaged
        // tile or district (a pillaged Harbor repairs from its own water
        // tile), and the IMPROVE arm asks no water question of its own —
        // a sea RESOURCE takes an improvement, and `validImprovementsIn`
        // is the one place that decides which ground carries what.
        const jobTiles = state.map.tiles.filter((t) =>
          owns(t)
          && (t.pillaged || t.districtPillaged
            || (!t.improvement && validImprovementsIn(t, { unlocks: unl, ownsTile: owns, map: state.map, camps, hidden }).length > 0)));
        const spreadTargets = actor.religion.founded
          ? allCities(state).filter((c) => c.followedReligion !== seat)
          : [];
        // `_seat_engineer_job_mask`'s twin, built only when an engineer with
        // charges will ask: an unroaded engineer tile (never a natural
        // wonder), an engineer improvement site, or a 20%-charge site (a
        // queued AQUEDUCT/CANAL/DAM dig or the Flood Barrier's centre).
        let engJobTiles: Tile[] | null = null;
        const engTiles = () => (engJobTiles ??= state.map.tiles.filter((t) =>
          canBuildRoad(t, owns)
          || validImprovementsIn(t, { unlocks: unl, ownsTile: owns, map: state.map, camps, hidden, builder: 'MILITARY_ENGINEER' }).length > 0
          || engineerFinishCity(state, seat, t.index) !== undefined));
        // `_charge_jobs`'s twin: a job TAKEN by an earlier unit of the same
        // type is masked out for the later ones — one set per type, as the
        // GPU clones one plane per `_charge_jobs` call (Builders over the
        // job mask, Engineers over theirs). Units walk in `state.units`
        // order, which is the GPU's slot order.
        const takenB = new Set<number>();
        const takenE = new Set<number>();
        for (const u of state.units) {
          if (u.seat !== seat) continue;
          let jt = -1;
          if (u.type === 'BUILDER' && (u.charges ?? 0) > 0) {
            const ut = state.map.tiles[u.tileIndex];
            let bk = Infinity;
            for (const t of jobTiles) {
              if (takenB.has(t.index)) continue;
              const k = hexDistance(ut.col, ut.row, t.col, t.row) * nT + t.index;
              if (k < bk) { bk = k; jt = t.index; }
            }
            if (jt >= 0) takenB.add(jt);
          } else if (u.type === 'MILITARY_ENGINEER' && (u.charges ?? 0) > 0) {
            const ut = state.map.tiles[u.tileIndex];
            let bk = Infinity;
            for (const t of engTiles()) {
              if (takenE.has(t.index)) continue;
              const k = hexDistance(ut.col, ut.row, t.col, t.row) * nT + t.index;
              if (k < bk) { bk = k; jt = t.index; }
            }
            if (jt >= 0) takenE.add(jt);
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
        routesMsg[String(seat)] = routeCandidateRow(state, actor);
      }
      jobsMsg[String(seat)] = jr;   // seat-keyed wire
      spreadsMsg[String(seat)] = sr;
    }
    // the DECOMPOSITION rides this message too, not the dump alone: a
    // driver-twin check fires HERE, and evidence that arrives one message
    // later is evidence the failing comparison never sees.
    const dlT = (globalThis as { __diffLog?: string[] }).__diffLog;
    // `world` is the neutral observation's world group and `neutral` its
    // registered per-seat groups, by seat id: the gate compares each with the
    // GPU's before the decide, and nothing on this side reads them
    const neutralSeats: Record<number, Record<string, unknown>> = {};
    for (const s of state.seats) neutralSeats[s.seat] = seatGroups(state, s.seat);
    o.send({
      t: state.turn, obs, world: worldObs(state), neutral: neutralSeats, jobs: jobsMsg, spreads: spreadsMsg, buys: buysMsg, routes: routesMsg,
      ...(dlT ? { dl: trimByKind(dlT) } : {}),
    });
    const msg = JSON.parse(await o.recv()) as { recs?: Record<string, unknown> };
    if (msg.recs && Object.keys(msg.recs).length) {
      const bySeat: Record<number, unknown> = {};
      for (const [sid, rec] of Object.entries(msg.recs)) {
        bySeat[Number(sid)] = rec;
      }
      (state.seatActions as unknown as Record<number, unknown>)[state.turn - 1] = bySeat;
    }
  }
  // CIV6_EXPORT_DEBUG=<seed>: narrate that seed's turn events for
  // diagnosis, on STDERR — under the serve gate stdout IS the protocol
  // channel, so a narration line there is a message the orchestrator
  // has to parse and cannot.
  const evBefore = state.eventLog.length;
  endTurn(state);
  if (process.env.CIV6_EXPORT_DEBUG === String(seed)) {
    for (const line of state.eventLog.slice(evBefore)) console.error(`t${state.turn - 1} ${line}`);
    // EVERY major, not just seat 0 — a divergence rarely announces which seat
    // it belongs to, and a probe that only watches one seat cannot say.
    for (let s = 0; s < N_MAJORS; s++) {
      const sx = state.seats[s];
      if (!sx) continue;
      console.error(`t${state.turn - 1} seat ${s} cities=${sx.cities.length} pop=${sx.cities.map((c) => c.population).join(',')}`);
    }
  }
  // THE POPULATION SNAPSHOT, at the census's own moment and over the
  // census's own rows (`cityHolders` is what `groupRows('city')` walks).
  // It rode the amenity walk once, which is a MAJOR-row walk, and so said
  // nothing at all about the Free City the two engines disagreed on.
  const dlP = (globalThis as { __diffLog?: string[] }).__diffLog;
  if (dlP) {
    for (const holder of cityHolders(state)) {
      for (const c of holder.cities) {
        // `endTurn` has ALREADY advanced the clock by the time this runs, and
        // every other emitter on this engine stamps the turn from inside the
        // seat phase. Stamping `state.turn` here put these lines a turn ahead
        // of their own engine: they could never pair with the GPU's, and the
        // inflated maximum dragged the whole log's turn WINDOW forward with
        // them, dropping the step lines of the turn before.
        dlP.push(`pop:${holder.seat}:${state.turn - 1}:${c.centerIndex}:sn ${c.population}`);
      }
    }
  }
  o.send({ digest: stateDigest(state) });
  // Post-trace control: the orchestrator may request keyed dumps of the
  // groups whose digests disagreed — the state has not moved yet, so the
  // dump is exactly the state the digest hashed. It may also request a
  // CHECKPOINT: GameState is plain JSON-able data, so the dump a
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
    const cb = (globalThis as { __cbLog?: string[] }).__cbLog;
    const dl = (globalThis as { __diffLog?: string[] }).__diffLog;
    const out: Record<string, unknown> = { dumps };
    if (cb) out.cb = cb.slice(-16);
    if (dl) out.dl = trimByKind(dl);
    o.send(out);
  }
}
}
