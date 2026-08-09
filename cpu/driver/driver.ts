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
import { appendFileSync, writeFileSync } from 'node:fs';
import type { DistrictId, GameState, Tile } from '../core/types';
import { allCities, civHasStrategic, civsAtWar, seatOf, tileBelongsTo, tileOwnedByCiv, tileSeat } from '../core/seats';
import { hasRiver, isWater } from '../../world/query';
import { GOLD_PURCHASE_MULT } from '../data/constants';
import { PEACE_GOLD_COST } from '../data/seats';
import { SCRIPTED_HELD_BUILDINGS } from '../data/buildings';
import { BUY_UNITS } from '../core/phase';
import { buildingFaithCost, endTurn, goldAffordable, queueBuilding, queueDistrict, queueSettler, setTechResearch, setCivicResearch, settlerCost, tilePurchaseCost } from '../core/game';
import { queueUnit } from '../core/units';
import { assignEnvoy, isSuzerain } from '../core/cityStates';
import { pickBorderTile } from '../core/city';
import { WORSHIP_BUILDINGS, MISSIONARY_CAP, APOSTLE_CAP, ENHANCER_BELIEFS } from '../data/religion';
import { LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import { applyUnitOrders } from '../core/unitOrders';
import { observeSeat } from '../core/observe';
import { stateDigest, groupDump } from '../core/statecompare';
import { canPlaceDistrict, validImprovementsIn } from '../core/rules';
import { districtAdjacency } from '../core/yields';
import { computeUnlocksIn, getModifiers } from '../core/effects';
import { hexDistance } from '../../world/hex';
import { prodLayout } from '../core/prodLayout';
import { UNITS } from '../data/units';
import { BUILDINGS } from '../data/buildings';

/** One seat's decisions for one turn, as they arrive on the wire. */
interface Seat0Rec {
  production?: [number, number][];
  tech?: number | null;
  civic?: number | null;
  units?: [number, number, number][];
  envoys?: number[];
}

export interface DriverOpts {
  state: GameState;
  seed: number;
  turns: number;
  cityMax: number;
  cityStateMax: number;
  civMax: number;
  horizon: number;
  improvementIds: string[];
  scaffoldDistricts: { id: DistrictId }[];
  techList: { id: string }[];
  civicList: { id: string }[];
  recv: () => Promise<string>;
  send: (msg: unknown) => void;
}

/** Play `turns` turns, taking every decision from the server. */
/**
 * Seat 0's record arrives on the wire like every other seat's, but its
 * ROUTING into `state.seatActions` is not wired yet — the blocks below still
 * read it out separately. That is an unfinished wire, not a rule: the engine
 * gives this seat no standing the others lack.
 */
const UNROUTED_SEAT = 0;

export async function runDriver(o: DriverOpts): Promise<void> {
  const { state, seed, turns: N_TURNS, cityMax: CITY_MAX, cityStateMax: CITY_STATE_MAX, civMax: CIV_MAX } = o;
  let seat0rec: Seat0Rec | null = null;
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
    for (let seat = 0; seat <= CIV_MAX; seat++) obs[String(seat)] = observeSeat(state, seat, CITY_MAX, o.horizon, CITY_STATE_MAX);
    // per-unit obs twins — the drive.py extractors' TS mirrors, per
    // seat unit IN UNIT-ARRAY ORDER (the proven slot-map mirror):
    // job = nearest hasJob tile (d*T + index key, ties lowest);
    // spread = nearest allCities centre whose followedReligion != g
    // (d*(T+1) + centreIndex key), religious charge-carriers only.
    const jobsMsg: Record<string, number[]> = {};
    const spreadsMsg: Record<string, number[]> = {};
    const buysMsg: Record<string, number[]> = {};
        const nT = state.map.tiles.length;
    {
      // Seat 0's job rows — the SAME job predicate over its own planes
      // (_seat_job_mask's TS mirror), rows per LIVE seat-0 unit in array
      // order (the GPU compacts its raw p-pool rows by p_alive to match).
      // SPREAD stays EMPTY: seat-0 religion founding has no GPU twin yet
      // — the gate compares the shared gate, not TS's richer plane.
      const jr0: number[] = [];
      const sr0: number[] = [];
      const owns0 = (t: Tile) => tileSeat(t) === UNROUTED_SEAT;
      const unl0 = computeUnlocksIn(seatOf(state, UNROUTED_SEAT)!.research);
      const jobTiles0 = state.map.tiles.filter((t) =>
        owns0(t) && !isWater(t)
        && (t.pillaged || t.districtPillaged
          || (!t.improvement && validImprovementsIn(t, { unlocks: unl0, ownsTile: owns0, map: state.map }).length > 0)));
      for (const u of state.units) {
        if (u.seat !== UNROUTED_SEAT) continue;
        let jt = -1;
        if (UNITS[u.type]?.charges !== undefined && (u.charges ?? 0) > 0) {
          const ut = state.map.tiles[u.tileIndex];
          let bk = Infinity;
          for (const t of jobTiles0) {
            const k = hexDistance(ut.col, ut.row, t.col, t.row) * nT + t.index;
            if (k < bk) { bk = k; jt = t.index; }
          }
        }
        jr0.push(jt);
        sr0.push(-1);
      }
      jobsMsg['0'] = jr0;
      spreadsMsg['0'] = sr0;
      if (process.env.CIV6_SERVE_DEBUG_JOB0 && state.turn === Number(process.env.CIV6_SERVE_DEBUG_JOB0)) {
        for (const u of state.units) {
          if (u.seat !== UNROUTED_SEAT) continue;
          appendFileSync('.claude/scratchpad/job0_ts.txt', JSON.stringify({
            unit: u.type, tile: u.tileIndex, charges: u.charges ?? null, moves: u.movesLeft,
          }) + String.fromCharCode(10));
        }
        for (const ti of (process.env.CIV6_SERVE_DEBUG_TILES ?? '').split(',').filter(Boolean).map(Number)) {
          const t0d = state.map.tiles[ti];
          appendFileSync('.claude/scratchpad/job0_ts.txt', JSON.stringify({
            ti, terrain: t0d.terrain, elev: t0d.elevation, feature: t0d.feature,
            res: t0d.resource, district: t0d.district, wonder: t0d.wonder,
            builtWonder: t0d.builtWonder, imp: t0d.improvement, pill: t0d.pillaged,
            owns: tileSeat(t0d) === UNROUTED_SEAT,
            valid: validImprovementsIn(t0d, { unlocks: unl0, ownsTile: owns0, map: state.map }),
          }) + String.fromCharCode(10));
        }
      }
    }
    for (let r = 0; r < CIV_MAX; r++) {
      const civSeat = state.seats[r + 1];
      const jr: number[] = [];
      const sr: number[] = [];
      if (civSeat) {
        const owns = (t: Tile) => tileOwnedByCiv(t, civSeat.seat);
        const unl = computeUnlocksIn(civSeat.research);
        const jobTiles = state.map.tiles.filter((t) =>
          owns(t) && !isWater(t)
          && (t.pillaged || t.districtPillaged
            || (!t.improvement && validImprovementsIn(t, { unlocks: unl, ownsTile: owns, map: state.map }).length > 0)));
        const g = r + 1;
        const spreadTargets = civSeat.religion.founded
          ? allCities(state).filter((c) => c.followedReligion !== g)
          : [];
        for (const u of state.units) {
          if (u.seat !== civSeat.seat) continue;
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
        // piece 4: the BUY-candidate tripwire — the TS pre-turn twin
        // of drive._buy_ctx, per seat: [buildingCentre, buildingIdx,
        // settlerOk, unitOk]. ATTRIBUTION when a purchase diverges (which
        // half went wrong, at its causal turn); the trace stays the gate.
        let buyC = -1;
        let buyB = -1;
        let bd: (typeof BUILDINGS)[string] | null = null;
        let bc: (typeof civSeat.cities)[number] | null = null;
        for (const civCity of civSeat.cities) {
          const have = new Set(civCity.buildings);
          const done = new Set(civCity.districts.filter((d) => state.map.tiles[d.tileIndex].districtComplete).map((d) => d.type));
          const center = state.map.tiles[civCity.centerIndex];
          for (const def of Object.values(BUILDINGS)) {
            if (have.has(def.id) || def.worship || SCRIPTED_HELD_BUILDINGS.has(def.id)) continue;
            if (!done.has(def.district)) continue;
            if (!unl.buildings.has(def.id)) continue;
            if (def.requiresAny && !def.requiresAny.some((x) => have.has(x))) continue;
            if (def.exclusiveWith?.some((x) => have.has(x))) continue;
            if (def.special === 'WATER_MILL' && !hasRiver(center)) continue;
            if (civCity.queue[0]?.kind === 'building' && civCity.queue[0].building === def.id) continue;
            if (!bd || def.cost < bd.cost || (def.cost === bd.cost && def.id < bd.id)) {
              bd = def;
              bc = civCity;
            }
          }
        }
        if (bd && bc && Math.round((civSeat.treasury ?? 0) * 1000) >= Math.round((bd.cost * GOLD_PURCHASE_MULT + PEACE_GOLD_COST(0)) * 1000)) {
          buyC = bc.centerIndex;
          buyB = prodLayout().buildings.indexOf(bd.id);
        }
        // The settler is a UNIT purchase now (#71): it spawns at the capital
        // (else the first city), which must afford the live escalating price
        // and have the pop to pay (a 1-pop city may not buy one).
        const settlerSpawnCity = civSeat.cities.find((c) => c.isCapital) ?? civSeat.cities[0];
        const settlerOk = settlerSpawnCity !== undefined && settlerSpawnCity.population >= 2
          && goldAffordable(civSeat.treasury ?? 0, settlerCost(state, civSeat.seat) * GOLD_PURCHASE_MULT);
        let mil = 0;
        for (const u of state.units) {
          if (u.seat !== civSeat.seat) continue;
          if ((UNITS[u.type]?.combat ?? 0) > 0) mil += 1;
        }
        for (const civCity of civSeat.cities) {
          const q = civCity.queue[0];
          if (q?.kind === 'unit' && q.unit && (UNITS[q.unit]?.combat ?? 0) > 0) mil += 1;
        }
        let anyU = false;
        for (const cand of BUY_UNITS) {
          if (cand.tech && !civSeat.research.techs.includes(cand.tech)) continue;
          const def = UNITS[cand.id];
          if (!def) continue;
          if (def.requiresResource && !civHasStrategic(state, civSeat.seat, def.requiresResource)) continue;
          if (!goldAffordable(civSeat.treasury ?? 0, def.cost * GOLD_PURCHASE_MULT)) continue;
          anyU = true;
          break;
        }
        const unitOk = civSeat.cities.length > 0 && mil < civSeat.cities.length * 2 && anyU;
        // #104 the TILE candidate twin — the first city in array order with
        // a border candidate names the pick (pickBorderTile, the culture
        // claim's own key, with THIS seat's mods); an unaffordable pick
        // ABORTS the civ's tile buy (the break — it does not try the next
        // city).
        let tileOk = 0;
        let tileT = -1;
        let tileC = -1;
        const civSeatMods = getModifiers(state, civSeat.seat);
        for (const civCity of civSeat.cities) {
          const next = pickBorderTile(state, civCity, { map: state.map, mods: civSeatMods });
          if (next === null) continue;
          if (goldAffordable(civSeat.treasury ?? 0, tilePurchaseCost(state, civCity, next))) {
            tileOk = 1;
            tileT = next;
            tileC = civCity.centerIndex;
          }
          break;
        }
        // #104 the FAITH candidate twins: worship (independent) + the ONE
        // religious unit (missionary saturates before apostle) — the
        // _seat_faith_buy_candidates mirror, first eligible city in order.
        const hsOk = (civCity: (typeof civSeat.cities)[number]): boolean => {
          const hs = civCity.districts.find((d) => d.type === 'HOLY_SITE');
          const ht = hs ? state.map.tiles[hs.tileIndex] : undefined;
          return !!ht?.districtComplete && !ht.districtPillaged;
        };
        let worshipC = -1;
        let religKind = -1;
        let religC = -1;
        if (civSeat.religion.founded) {
          const wid = WORSHIP_BUILDINGS[civSeat.seat % WORSHIP_BUILDINGS.length];
          if (goldAffordable(civSeat.faith ?? 0, buildingFaithCost(wid))) {
            worshipC = civSeat.cities.find((civCity) => !civCity.buildings.includes(wid) && civCity.buildings.includes('TEMPLE') && hsOk(civCity))?.centerIndex ?? -1;
          }
          const shrineCity = civSeat.cities.find((civCity) => civCity.buildings.includes('SHRINE') && hsOk(civCity));
          if (shrineCity) {
            const eb = civSeat.religion.enhancer ? ENHANCER_BELIEFS[civSeat.religion.enhancer]?.effects : undefined;
            const liveM = state.units.filter((u) => u.seat === civSeat.seat && u.type === 'MISSIONARY').length;
            const mCost = Math.round(UNITS.MISSIONARY.cost * (eb?.missionaryCostMult ?? 1));
            if (liveM < MISSIONARY_CAP && goldAffordable(civSeat.faith ?? 0, mCost)) {
              religKind = 5;
              religC = shrineCity.centerIndex;
            } else {
              const liveA = state.units.filter((u) => u.seat === civSeat.seat && u.type === 'APOSTLE').length;
              if (liveA < APOSTLE_CAP && goldAffordable(civSeat.faith ?? 0, Math.round(UNITS.APOSTLE.cost))) {
                religKind = 6;
                religC = shrineCity.centerIndex;
              }
            }
          }
        }
        // #104 the LEVY candidate twin — at-war (the single war axis, vs
        // seat 0) is the POLICY gate; the rule body levyUnits has no war
        // test. First eligible CS in order.
        let levyIdx = -1;
        if (civsAtWar(state, civSeat.seat, UNROUTED_SEAT) && goldAffordable(civSeat.treasury ?? 0, LEVY_GOLD_COST)) {
          for (let ci = 0; ci < state.cityStates.length; ci++) {
            const csl = state.cityStates[ci];
            if (csl.type !== 'militaristic') continue;
            if (!isSuzerain(csl, civSeat.seat)) continue;
            if (state.turn - (csl.lastLevyTurn ?? -LEVY_COOLDOWN) < LEVY_COOLDOWN) continue;
            levyIdx = ci;
            break;
          }
        }
        buysMsg[String(r + 1)] = [buyC, buyB, settlerOk ? 1 : 0, unitOk ? 1 : 0,
          tileOk, tileT, tileC, worshipC, religKind, religC, levyIdx];
      }
      jobsMsg[String(r + 1)] = jr;   // seat-keyed wire
      spreadsMsg[String(r + 1)] = sr;
    }
    o.send({ t: state.turn, obs, jobs: jobsMsg, spreads: spreadsMsg, buys: buysMsg });
    const msg = JSON.parse(await o.recv()) as { recs?: Record<string, unknown> };
    if (msg.recs && Object.keys(msg.recs).length) {
      // The rec keys are SEAT ids; `seatActions` storage is still indexed by
      // the legacy 0-based civ index (seat - 1) until the great
      // rename sweeps the planes. Seat-0 records queue here for the
      // routing slice (held here until seat 0's record is routed too).
      const bySeat: Record<number, unknown> = {};
      for (const [sid, rec] of Object.entries(msg.recs)) {
        bySeat[Number(sid)] = rec;
      }
      (state.seatActions as unknown as Record<number, unknown>)[state.turn - 1] = bySeat;
      seat0rec = (msg.recs as Record<string, Seat0Rec | undefined>)['0'] ?? null;
    }
  }
  if (seat0rec?.envoys) {
    // Seat 0's ENVOY picks off the wire (CS slot indices, the
    // seat records' own convention) through the same assignEnvoy — met
    // and availability re-validated inside it, refusals soft on both
    // engines. #100: the scripted greedy fallback is DELETED — a seat
    // with no record assigns nothing, like every other verb.
    for (const cityStateIdx of seat0rec.envoys) {
      const cs0 = state.cityStates[cityStateIdx];
      if (cs0) assignEnvoy(state, cs0.id, UNROUTED_SEAT);
    }
  }
  if (seat0rec) {
    // SEAT 0 DRIVEN: the wire's picks apply through the same queue
    // functions; the scripted chain below stands down entirely. Base
    // classes v1 (the scripted seat 0's own expressiveness); the
    // wonder/project/purchase arms port with the replay dispatch next.
    // UNITS FIRST — the rollout replayer's proven order (the GPU steps units at the
    // top of step(), before the production section's district scan reads
    // tile.improvement; a same-turn build must precede the scan on BOTH
    // engines). rangedActive mirrors _rl_ranged_active (constant True).
    if (seat0rec.units) applyUnitOrders(state, seat0rec.units, true, o.improvementIds as unknown as string[], UNROUTED_SEAT);
    const pl0 = prodLayout();
    for (const [centre0, a0] of (seat0rec.production ?? [])) {
      const city = seatOf(state, UNROUTED_SEAT)!.cities.find((c) => c.centerIndex === centre0);
      if (!city || city.queue.length > 0 || a0 < 0) continue;
      if (a0 < pl0.NB) {
        const bid0 = pl0.buildings[a0];
        if (bid0) queueBuilding(state, city.id, bid0, 0);
      } else if (a0 === pl0.NB) {
        queueSettler(state, city.id, 0);
      } else if (a0 >= pl0.NB + 2 && a0 < pl0.NB + 2 + pl0.NU) {
        const uid0 = pl0.units[a0 - pl0.NB - 2];
        if (uid0) queueUnit(state, city.id, uid0, UNROUTED_SEAT);
      } else if (a0 >= pl0.NB + 2 + pl0.NU && a0 < pl0.NB + 2 + pl0.NU + o.scaffoldDistricts.length) {
        // the replay's own placement scan: best floor(adjacency), ties
        // lowest tile, canPlaceDistrict re-validated live.
        const did0 = o.scaffoldDistricts[a0 - pl0.NB - 2 - pl0.NU].id;
        // VERBATIM the rollout replayer's proven arm (9018 t63: my floored scan with
        // an explicit tiebreak picked 860 where the proven raw-adjacency
        // first-wins scan and the GPU picked 817 — one placement rule,
        // copied not paraphrased).
        let best0 = -1;
        let bestAdj0 = -1;
        for (const tile of state.map.tiles) {
          if (!tileBelongsTo(tile, city) || tile.improvement) continue;
          if (!canPlaceDistrict(state, city, did0, tile.index).ok) continue;
          const adj0 = districtAdjacency(state.map, tile, did0);
          if (adj0 > bestAdj0) {
            bestAdj0 = adj0;
            best0 = tile.index;
          }
        }
        if (best0 >= 0) queueDistrict(state, city.id, did0, best0, 0);
      }
    }
    if (seat0rec.tech != null && o.techList[seat0rec.tech]) setTechResearch(state, o.techList[seat0rec.tech].id, 0);
    if (seat0rec.civic != null && o.civicList[seat0rec.civic]) setCivicResearch(state, o.civicList[seat0rec.civic].id, 0);
  }
  // (#51 deletions: the scripted production chain and the scripted builder
  // walker are GONE — every UNROUTED_SEAT-0 verb arrives on the wire; a turn with no
  // rec-0 queues nothing, and the trace compare names any drift.)
  // CIV6_EXPORT_DEBUG=<seed>: narrate that seed's turn events for diagnosis.
  const evBefore = state.eventLog.length;
  endTurn(state, 0);
  if (process.env.CIV6_EXPORT_DEBUG === String(seed)) {
    for (const line of state.eventLog.slice(evBefore)) console.log(`t${state.turn - 1} ${line}`);
    console.log(`t${state.turn - 1} cities=${seatOf(state, UNROUTED_SEAT)!.cities.length} pop=${seatOf(state, UNROUTED_SEAT)!.cities.map((c) => c.population).join(',')}`);
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
