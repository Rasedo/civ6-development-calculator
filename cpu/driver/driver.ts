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
import { allCities, campTiles, civsAtWar, seatOf, tileOwnedByCiv } from '../core/seats';
import { GOLD_PURCHASE_MULT, FAITH_PURCHASE_MULT } from '../data/constants';
import { PEACE_GOLD_COST, DED_MONUMENTALITY } from '../data/seats';
import { tradeCapacity, freeTrader, routeYields, routeYieldsInternational, cityStateRouteYields, routeInRange, routePostGold } from '../core/trade';
import { isExplored } from '../core/fog';
import { buildingFaithCost, endTurn, engineerFinishCity, goldAffordable, naturalistCost, settlerCost, tilePurchaseCost, unitPurchaseCost } from '../core/game';
import { goldenDedication, monumentalityBuyMult } from '../core/eras';
import { builderCost, goldBuyableUnits } from '../core/units';
import { hasMet, isSuzerain } from '../core/cityStates';
import { pickBorderTile } from '../core/city';
import { WORSHIP_BUILDINGS, MISSIONARY_CAP, APOSTLE_CAP, INQUISITOR_CAP, ENHANCER_BELIEFS } from '../data/religion';
import { LEVY_GOLD_COST, LEVY_COOLDOWN } from '../data/cityStates';
import { observeSeat } from '../core/observe';
import { stateDigest, groupDump } from '../core/statecompare';
import { availableBuildings, buildingCompletable, canBuildRoad, validImprovementsIn } from '../core/rules';
import { computeUnlocksIn, getModifiers, isCivicComplete } from '../core/effects';
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
  horizon: number;
  improvementIds: string[];
  scaffoldDistricts: { id: DistrictId }[];
  techList: { id: string }[];
  civicList: { id: string }[];
  recv: () => Promise<string>;
  send: (msg: unknown) => void;
}

/** The route CANDIDATE this seat would take — a decider-side row over EVERY
 * legal destination at once: own cities in array order, then MET city-states,
 * then every other major's EXPLORED cities (from asc, to asc, cityState asc,
 * seat asc). Best NEW in-range pair by the route's TOTAL yields,
 * strictly-greater beats, so ties keep the first pair in that scan order.
 * [origin CENTRE, dest code (CENTRE or -(2+csIndex))], [-1,-1] = none.
 * Gated on capacity AND a free Trader — the unit the verb spends. */
export function routeCandidateRow(state: GameState, actor: Seat): number[] {
  const routes = actor.tradeRoutes ?? [];
  if (actor.cities.length < 1) return [-1, -1];
  if (routes.length >= tradeCapacity(state, actor.seat)) return [-1, -1];
  if (state.unitsMode && !freeTrader(state, actor.seat)) return [-1, -1];
  let best: { from: number; dest: number; ySum: number } | null = null;
  for (const from of actor.cities) {
    for (const to of actor.cities) {
      if (to.id === from.id) continue;
      if (routes.some((x) => x.from === from.id && x.to === to.id)) continue;
      if (!routeInRange(state, actor.seat, from.centerIndex, to.centerIndex)) continue;
      const y = routeYields(state, to);
      const ySum = y.food + y.production;
      if (!best || ySum > best.ySum) best = { from: from.centerIndex, dest: to.centerIndex, ySum };
    }
    for (let ci = 0; ci < state.cityStates.length; ci++) {
      const cityState = state.cityStates[ci];
      if (!hasMet(cityState, actor.seat)) continue;
      if (routes.some((x) => x.from === from.id && x.toCs === cityState.id)) continue;
      if (!routeInRange(state, actor.seat, from.centerIndex, cityState.centerIndex)) continue;
      const cy = cityStateRouteYields(cityState);
      const ySum = cy.food + cy.production + cy.gold + cy.science + cy.culture + cy.faith
        + routePostGold(state, actor.seat, cityState.centerIndex);
      if (!best || ySum > best.ySum) best = { from: from.centerIndex, dest: -(2 + ci), ySum };
    }
    // An INTERNATIONAL destination competes on the same total-yield key as a
    // domestic or city-state one; it is not a fallback for when nothing else
    // is reachable.
    for (const other of state.seats) {
      if (other.seat === actor.seat) continue;
      for (const pc of other.cities) {
        if (!isExplored(state, actor.seat, pc.centerIndex)) continue;
        if (routes.some((x) => x.from === from.id && x.toSeat === other.seat && x.toSeatCity === pc.id)) continue;
        if (!routeInRange(state, actor.seat, from.centerIndex, pc.centerIndex)) continue;
        const py = routeYieldsInternational(state, pc);
        const ySum = py.food + py.production + py.gold + py.science + py.culture + py.faith
          + routePostGold(state, actor.seat, pc.centerIndex);
        if (!best || ySum > best.ySum) best = { from: from.centerIndex, dest: pc.centerIndex, ySum };
      }
    }
  }
  return best ? [best.from, best.dest] : [-1, -1];
}

function buyCandidateRow(state: GameState, actor: Seat): number[] {
    let buyC = -1;
    let buyB = -1;
    let bd: (typeof BUILDINGS)[string] | null = null;
    let bc: (typeof actor.cities)[number] | null = null;
    // The purchase's OWN legality, not a second copy of it: `purchaseBuilding`
    // admits what `availableBuildings` offers and `buildingCompletable`
    // finishes, minus the walls no gold can buy.
    for (const city of actor.cities) {
      for (const def of availableBuildings(state, city)) {
        if (def.worship || def.noPurchase) continue;
        if (!buildingCompletable(state, city, def.id)) continue;
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
    const settlerSpawnCity = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
    const settlerOk = settlerSpawnCity !== undefined && settlerSpawnCity.population >= 2
      && goldAffordable(actor.treasury ?? 0, settlerCost(state, actor.seat) * GOLD_PURCHASE_MULT * monumentalityBuyMult(state, actor.seat));
    let mil = 0;
    for (const u of state.units) {
      if (u.seat !== actor.seat) continue;
      if ((UNITS[u.type]?.combat ?? 0) > 0) mil += 1;
    }
    for (const city of actor.cities) {
      const q = city.queue[0];
      if (q?.kind === 'unit' && q.unit && (UNITS[q.unit]?.combat ?? 0) > 0) mil += 1;
    }
    // `unitPurchaseCost` is the price the applier charges — Mercenary
    // Companies moves it, and every column offered here is a military unit.
    const anyU = goldBuyableUnits(state, actor.seat).some(
      (def) => goldAffordable(actor.treasury ?? 0, unitPurchaseCost(state, def.id, actor.seat)),
    );
    const unitOk = actor.cities.length > 0 && mil < actor.cities.length * 2 && anyU;
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
      // A Shrine sells the Missionary; the Apostle and the Inquisitor need a
      // TEMPLE on top, so the two arms walk to DIFFERENT cities.
      const shrineCity = actor.cities.find((city) => city.buildings.includes('SHRINE') && hsOk(city));
      const templeCity = actor.cities.find((city) => city.buildings.includes('SHRINE')
        && city.buildings.includes('TEMPLE') && hsOk(city));
      const eb = actor.religion.enhancer ? ENHANCER_BELIEFS[actor.religion.enhancer]?.effects : undefined;
      const liveM = state.units.filter((u) => u.seat === actor.seat && u.type === 'MISSIONARY').length;
      const mCost = Math.round(UNITS.MISSIONARY.cost * (eb?.missionaryCostMult ?? 1));
      if (shrineCity && liveM < MISSIONARY_CAP && goldAffordable(actor.faith ?? 0, mCost)) {
        religKind = 5;
        religC = shrineCity.centerIndex;
      } else if (templeCity) {
        const liveA = state.units.filter((u) => u.seat === actor.seat && u.type === 'APOSTLE').length;
        const liveQ = state.units.filter((u) => u.seat === actor.seat && u.type === 'INQUISITOR').length;
        if (liveA < APOSTLE_CAP && goldAffordable(actor.faith ?? 0, Math.round(UNITS.APOSTLE.cost))) {
          religKind = 6;
          religC = templeCity.centerIndex;
        } else if (actor.religion.inquisition && liveQ < INQUISITOR_CAP
          && goldAffordable(actor.faith ?? 0, Math.round(UNITS.INQUISITOR.cost))) {
          religKind = 11;
          religC = templeCity.centerIndex;
        }
      }
    }
    // The Monumentality faith-civilian pick (kind 8 builder, 9 settler,
    // settler preferred) — the pick_monu twin, spawn at the capital (else
    // first city) like the gold settler buy.
    let monuKind = -1;
    let monuC = -1;
    if (goldenDedication(state, actor.seat, DED_MONUMENTALITY)) {
      const monuSpawn = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
      if (monuSpawn) {
        const liveBuilders = state.units.filter((u) => u.seat === actor.seat && u.type === 'BUILDER').length;
        if (liveBuilders < 1
          && goldAffordable(actor.faith ?? 0, builderCost(state, actor.seat) * FAITH_PURCHASE_MULT * monumentalityBuyMult(state, actor.seat))) {
          monuKind = 8;
          monuC = monuSpawn.centerIndex;
        }
        if (monuSpawn.population >= 2
          && goldAffordable(actor.faith ?? 0, settlerCost(state, actor.seat) * FAITH_PURCHASE_MULT * monumentalityBuyMult(state, actor.seat))) {
          monuKind = 9;
          monuC = monuSpawn.centerIndex;
        }
      }
    }
    // The NATURALIST faith buy (kind 10) — faith-only in any city, behind
    // CONSERVATION, spawning at the capital (else the first city) like the
    // other faith civilians. ONE live Naturalist at a time is the ladder's
    // own cap, not a game rule: the unit exists to be spent on a park.
    let natKind = -1;
    let natC = -1;
    {
      const natSpawn = actor.cities.find((c) => c.isCapital) ?? actor.cities[0];
      const liveNat = state.units.filter((u) => u.seat === actor.seat && u.type === 'NATURALIST').length;
      if (natSpawn && liveNat < 1
        && isCivicComplete(state, UNITS.NATURALIST.requiresCivic!, actor.seat)
        && goldAffordable(actor.faith ?? 0, naturalistCost(state, actor.seat))) {
        natKind = 10;
        natC = natSpawn.centerIndex;
      }
    }
    let levyIdx = -1;
    // At war with ANY other major, read off this seat's own row — the GPU's
    // `war[row, :1+R].any()` twin. Reading one fixed axis instead would make a
    // civ fighting only another civ read FALSE and never levy.
    const atWar = state.seats.some((o) => o.seat !== actor.seat && civsAtWar(state, actor.seat, o.seat));
    if (atWar && goldAffordable(actor.treasury ?? 0, LEVY_GOLD_COST)) {
      for (let ci = 0; ci < state.cityStates.length; ci++) {
        const csl = state.cityStates[ci];
        if (csl.type !== 'militaristic') continue;
        if (!isSuzerain(state, csl, actor.seat)) continue;
        if (state.turn - (csl.lastLevyTurn ?? -LEVY_COOLDOWN) < LEVY_COOLDOWN) continue;
        levyIdx = ci;
        break;
      }
    }
  return [buyC, buyB, settlerOk ? 1 : 0, unitOk ? 1 : 0,
    tileOk, tileT, tileC, worshipC, religKind, religC, levyIdx, monuKind, monuC,
    natKind, natC];
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
        const unl = computeUnlocksIn(actor.research);
        const camps = campTiles(state);
        // `_job_mask_core`'s twin: the REPAIR arms take ANY owned pillaged
        // tile or district (a pillaged Harbor repairs from its own water
        // tile), and the IMPROVE arm asks no water question of its own —
        // a sea RESOURCE takes an improvement, and `validImprovementsIn`
        // is the one place that decides which ground carries what.
        const jobTiles = state.map.tiles.filter((t) =>
          owns(t)
          && (t.pillaged || t.districtPillaged
            || (!t.improvement && validImprovementsIn(t, { unlocks: unl, ownsTile: owns, map: state.map, camps }).length > 0)));
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
          || validImprovementsIn(t, { unlocks: unl, ownsTile: owns, map: state.map, camps, builder: 'MILITARY_ENGINEER' }).length > 0
          || engineerFinishCity(state, seat, t.index) !== undefined));
        for (const u of state.units) {
          if (u.seat !== seat) continue;
          let jt = -1;
          if (u.type === 'BUILDER' && (u.charges ?? 0) > 0) {
            const ut = state.map.tiles[u.tileIndex];
            let bk = Infinity;
            for (const t of jobTiles) {
              const k = hexDistance(ut.col, ut.row, t.col, t.row) * nT + t.index;
              if (k < bk) { bk = k; jt = t.index; }
            }
          } else if (u.type === 'MILITARY_ENGINEER' && (u.charges ?? 0) > 0) {
            const ut = state.map.tiles[u.tileIndex];
            let bk = Infinity;
            for (const t of engTiles()) {
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
        routesMsg[String(seat)] = routeCandidateRow(state, actor);
      }
      jobsMsg[String(seat)] = jr;   // seat-keyed wire
      spreadsMsg[String(seat)] = sr;
    }
    o.send({ t: state.turn, obs, jobs: jobsMsg, spreads: spreadsMsg, buys: buysMsg, routes: routesMsg });
    const msg = JSON.parse(await o.recv()) as { recs?: Record<string, unknown> };
    if (msg.recs && Object.keys(msg.recs).length) {
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
    o.send(cb ? { dumps, cb: cb.slice(-16) } : { dumps });
  }
}
}
