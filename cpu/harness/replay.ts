/**
 * THE ACTION REPLAY: the TS engine run FREE from the first record, fed only
 * the recorded players' decisions, and compared each turn with the record.
 *
 * The first record is imported (`importTurn`) and from then on the state is
 * the engine's own. For each record pair t -> t+1 the replay takes the
 * decisions an `ActionSource` reads off the records (`replayActions.ts`),
 * lands the active player's before the engine's turn and every other
 * player's after it (when each was taken), runs `endTurn`, and compares the
 * engine's state with record t+1:
 *
 *   - STATE: every city's size, boxes, plots, loyalty, buildings, districts,
 *     production and religious pressure; every seat's purse, research,
 *     civics, era score, government; every unit's roster and health; every
 *     plot's owner, improvement, feature and resource — against the importer's
 *     reading of record t+1, so both sides use the same ids;
 *   - READERS: the per-turn harness's own state checks (`stateChecks`) asked
 *     of the engine's state, each failure split by whether the per-turn
 *     harness passes the same check on the imported record (the engine left
 *     the record: `drift`) or fails it there too (`rule`).
 *
 * Only decisions are re-synced, never outcomes. Where a decision cannot be
 * carried out through the engine's own verbs (the engine refuses it, or no
 * verb takes it), the recorded outcome of THAT decision is imposed and
 * counted per kind (`fallbacks`), so a divergence can be told apart from a
 * decision the replay could not express. The generator is held on the
 * game's stream at every draw of its rules (`streamHold`): each seat's start
 * from its player's witness, the random-event step and each labelled draw
 * from the game's draw log where the recording kept it.
 */
import { readFileSync } from 'node:fs';
import type { BarbTribe, City, CityState, DistrictId, GameState, QueueItem, Seat, SeatActionRecord, Unit } from '../core/types';
import { hexDistance } from '../../world/hex';
import { NO_SEAT, type Governor } from '../core/types';
import { endTurn, foundCity, foundCityAt, buyTile, settlerCost, projectCost, unitStepCost, unitsAcquired, buildingPurchaseCost,
  buyWorshipBuilding, purchaseBuildingWithFaith, purchaseCivilianWithFaith, purchaseReligiousUnit, purchaseUnitWithFaith,
  purchaseSettler, unitGoldPrice, availableProjects, goldAffordable, buildingFaithPrice, wonderChargeBoost } from '../core/game';
import { applySeatActionRecord, applySeatUnitOrders, buySeatBuilding, declareWar, districtSiteCost, districtSiteLegal, grantPantheonUnit, levyGoldCost, levyUnits, paveGround,
  placeSeatDistrict, sueForPeace, transferCity } from '../core/phase';
import { addEnvoys, declareWarOnCityState, minorCity, placeCityStateAt, sueForPeaceWithCityState } from '../core/cityStates';
import { availableBuildings, canPlaceWonder, validImprovements } from '../core/rules';
import { spawnUnit, trainableUnits, builderCost, traderCost, disbandUnit, drawAndPayGoody, grantedMoves, restUnit, upgradeUnit } from '../core/units';
import { availableCivicsIn, availableTechsIn, computeUnlocks, fitPolicies, goldPrice, governmentSlots, inDarkAge, seatGovernment,
  unlockedPolicyIds } from '../core/effects';
import { congressPolicyBlocked } from '../core/congress';
import { selectResearch, chopGrant, harvestGrant, applyLumpYield } from '../core/economy';
import { detectBoosts, grantBoost, markBoost } from '../core/boosts';
import { recordMoments } from '../core/moments';
import { appointGovernor, assignGovernor, governorsOf, promoteGovernor } from '../core/governors';
import { GOVERNOR_PROMOTIONS, promotionBit } from '../data/governors';
import { BOOSTS } from '../data/boosts';
import { chargeUnitResource, upgradeGoldCost } from '../core/stockpile';
import { applyTrainingGrants, clearCampFor, holdBarbarians, meleeAttack, rangedAttack } from '../core/combat';
import { barbarianRules, foundTribe, tribeKindAt } from '../core/barbarians';
import { addCsTradeRoute, addIntlTradeRoute, addTradeRoute, routeDestCenter, routeOriginCenter } from '../core/trade';
import { goodyMoment, pantheonMoment, religionMoment, unitKillEvent } from '../core/eras';
import { initFog, revealAround, unitSeesThrough, unitSight } from '../core/fog';
import { civsAtWar, cityStateOfSeat, isBarbSeat, isCityStateSeat, seatOf, setTileOwner, setWar, unitsOf, BARB_SEAT } from '../core/seats';
import { BUILDINGS } from '../data/buildings';
import { BUILT_WONDERS } from '../data/builtWonders';
import { PROJECTS } from '../data/projects';
import { TECHS } from '../data/techs';
import { CIVICS } from '../data/civics';
import { GOVERNMENTS, GOVERNMENT_LIST, POLICIES, POLICY_LIST } from '../data/policies';
import { PANTHEONS, PANTHEON_FAITH_COST, gainPopulationPressure } from '../data/religion';
import { UNITS, UNIT_HP } from '../data/units';
import { CAMP_DISPERSAL_GOLD, MP_SCALE, scaleByGameSpeed } from '../data/constants';
import { PROMOTE_HEAL, takePromotion, unitPromoRows } from '../core/promotions';
import { fireFeature } from '../data/disasters';
import { holdMinorItem, holdMinorWalk, minorBuilderLays, type MinorItem } from '../core/minorBuild';
import { DEDICATED_IMPROVEMENTS, IMPROVEMENT_IDS } from '../core/unitActions';
import { loadCatalog, type Catalog, type DumpCity, type TurnRecord } from './record';
import { num, bool } from './record';
import { advanceHistory, engineRowOf, importTurn, minorHead, newHistory, type History, type Imported } from './import';
import { replayEvents } from './eventReplay';
import { loadRandLog, randLogPath, type RandLog } from './randLog';
import { streamHold } from './streamHold';
import { holdRng } from '../core/rand';
import { seedMoments, stateChecks, transitionChecks, type CheckResult } from './checks';
import { engineId } from './aliases';
import { InferredActions, RecordedActions, activePlayer, type ActionSource, type Decision, type LogTally, type QueueSpec } from './replayActions';

/** what became of one decision */
type Outcome = 'applied' | 'fallback' | 'refused';

/** a village's Gold or Faith below this is the turn's income moving, not a reward */
const VILLAGE_MIN = 8;

/** a human seat's camp dispersal past the engine's: the camp's DispersalGold
 *  (50) plus the human's change through the speed, less the engine's own.
 *  The change is LinearScaleFromDefaultHandicap −5 a level from Prince, which
 *  the lab's human seat reads as +5: 27 online on every clean clear
 *  (runs/h1_duelw1118 Rome t10 45 + 5 → 77, 1120 t36, 1121 t36, 1123 t61;
 *  an AI's 25, 1116 China t7) */
const HUMAN_CAMP_GOLD = scaleByGameSpeed(50 + 5) - CAMP_DISPERSAL_GOLD;

/** the engine-side bookkeeping the replay carries across turns */
interface Ctx {
  state: GameState;
  cat: Catalog;
  W: number;
  seatOfPlayer: Map<number, number>;
  playerOfSeat: Map<number, number>;
  /** record unit `${owner}:${id}` -> the engine unit */
  units: Map<string, Unit>;
  /** the production a city banked on an item it switched away from, by
   *  `${centre}|${itemKey}` (the game keeps it on the item) */
  retained: Map<string, number>;
  /** the city-states the first record holds no city for, by player id */
  pendingMinors: Map<number, CityState>;
  /** the importer's reading of record t+1, the ids every imposed outcome
   *  takes */
  next: Imported;
  /** decision tallies, by `${kind}` and outcome */
  tally: Map<string, Record<Outcome, number>>;
  /** this pair's fallbacks, by player id */
  fellBack: Map<number, string[]>;
  /** this pair's imposed outcomes (every fallback), by kind */
  imposed: Map<string, number>;
  /** why the engine refused a decision, by kind and its rule's reason */
  reasons: Map<string, Map<string, number>>;
  /** the record's units (`owner:id`) the engine's own turn destroyed */
  engineKilled: Set<string>;
  /** this pair's moved units' steps (`move`'s path), by `owner:id` */
  paths: Map<string, number[]>;
  /** the other players' envoys this pair staged for the engine's turn (`stageEnvoys`) */
  envoys: EnvoyDecision[];
  /** the record's units (`owner:id`) a battle of this pair the engine fought */
  battled: Set<string>;
  /** the record's new barbarian units of this pair, which the barbarians'
   *  rules close it with (`barbarianTurn`) */
  barbNew: string[];
  /** the players' envoys of this pair that land after its moves (`settleEnvoys`) */
  lateEnvoys: EnvoyDecision[];
  /** the game's draw log, where the recording kept it */
  log?: RandLog;
}

/** REPLAY_TRACE=<subsystem or decision kind>,... prints every mismatch of
 *  those subsystems and every non-applied decision of those kinds, by turn,
 *  to stderr */
const TRACE = new Set((process.env.REPLAY_TRACE ?? '').split(',').filter(Boolean));
let traceTurn = 0;

function count(ctx: Ctx, kind: string, out: Outcome, player?: number, why?: string): Outcome {
  if (out !== 'applied' && (TRACE.has(kind) || TRACE.has(kind.split(':')[0]))) console.error(`t${traceTurn} ${kind} ${out} p${player ?? '-'} ${why ?? ''}`);
  const t = ctx.tally.get(kind) ?? { applied: 0, fallback: 0, refused: 0 };
  t[out] += 1;
  ctx.tally.set(kind, t);
  if (out === 'fallback') ctx.imposed.set(kind, (ctx.imposed.get(kind) ?? 0) + 1);
  if (out !== 'applied' && player !== undefined) {
    if (!ctx.fellBack.has(player)) ctx.fellBack.set(player, []);
    ctx.fellBack.get(player)!.push(`${kind}:${out}`);
  }
  if (out !== 'applied' && why) {
    const m = ctx.reasons.get(kind) ?? new Map<string, number>();
    m.set(why, (m.get(why) ?? 0) + 1);
    ctx.reasons.set(kind, m);
  }
  return out;
}

const seatOfP = (ctx: Ctx, pid: number) => ctx.seatOfPlayer.get(pid) ?? NO_SEAT;

/** the engine city (a major's or a Free City's) standing on a plot */
function cityAt(state: GameState, plot: number): City | undefined {
  for (const s of state.seats) for (const c of s.cities) if (c.centerIndex === plot) return c;
  return state.freeSeat?.cities.find((c) => c.centerIndex === plot);
}

/** the engine unit a record unit is, where the replay knows it */
function unitOf(ctx: Ctx, key: string): Unit | undefined {
  const u = ctx.units.get(key);
  return u && ctx.state.units.includes(u) ? u : undefined;
}

/** a record unit as a new engine unit at its recorded plot */
function spawnRecorded(ctx: Ctx, rec: TurnRecord, key: string): Unit | undefined {
  const u = rec.units.find((x) => `${x.owner}:${x.id}` === key);
  if (!u) return undefined;
  const seat = seatOfP(ctx, u.owner);
  const type = engineRowOf(ctx.cat, 'unit', u.type);
  if (seat === NO_SEAT || !type) return undefined;
  const def = UNITS[type];
  const unit: Unit = {
    id: ctx.state.nextUnitId++, type, seat, tileIndex: u.y * ctx.W + u.x,
    movesLeft: num(u.moves) * MP_SCALE, movesFull: num(u.maxMoves) * MP_SCALE, hp: UNIT_HP - num(u.damage),
    charges: def.charges !== undefined ? num(u.buildCharges) || num(u.spreadCharges) || def.charges : null,
    xp: num(u.xp), level: num(u.level),
    ...(num(u.formation) > 0 ? { formation: num(u.formation) } : {}),
    ...(bool(u.embarked) ? { embarked: true } : {}),
  };
  ctx.state.units.push(unit);
  ctx.units.set(key, unit);
  return unit;
}

/** a barbarian scout the record raised, to the scouts of the nearest living
 *  camp's tribe within three plots, where no tribe counts it yet (a raid's
 *  units are the barbarians' AI operation's, no tribe's) */
function adoptByTribe(state: GameState, u: Unit): void {
  const def = UNITS[u.type];
  const tribes = state.barbTribes ?? [];
  if (!def?.recon && !(def?.naval && !def.ranged)) return;
  if (tribes.some((tr) => tr.alive && (tr.scouts.includes(u.id) || tr.units.includes(u.id)))) return;
  const at = state.map.tiles[u.tileIndex];
  let best: BarbTribe | undefined;
  let bd = 4;
  for (const tr of tribes) {
    if (!tr.alive || (!def.recon && tr.kind !== 'NAVAL')) continue;
    const ct = state.map.tiles[tr.plot];
    const d = hexDistance(state.map, at.col, at.row, ct.col, ct.row);
    if (d < bd) [bd, best] = [d, tr];
  }
  best?.scouts.push(u.id);
}

/**
 * THE BARBARIANS CLOSE THE PAIR: after every player's actions of the turn
 * (the record's, landed), their rules run (`barbarianRules`: their techs,
 * the camp step, each tribe's turn, on the barbarian player's own stream);
 * the units their tribes raise are the record's new barbarian units where
 * they match by type, nearest first. A record unit no tribe raised is the
 * record's (a raid's force is the barbarians' AI operation), and a unit a
 * tribe raised that the game did not is unmade.
 */
function barbarianTurn(ctx: Ctx, b: TurnRecord, closing: number): void {
  const { state } = ctx;
  const before = new Set(state.units.filter((u) => isBarbSeat(u.seat)));
  barbarianRules(state, closing);
  matchNewUnits(ctx, b);
  for (const key of ctx.barbNew) {
    if (unitOf(ctx, key)) continue;
    const made = spawnRecorded(ctx, b, key);
    if (made) adoptByTribe(state, made);
    count(ctx, 'barb:unitNew', 'fallback', ctx.playerOfSeat.get(BARB_SEAT));
  }
  const mapped = new Set(ctx.units.values());
  for (const u of [...state.units]) {
    if (!isBarbSeat(u.seat) || before.has(u) || mapped.has(u)) continue;
    disbandUnit(state, u.id);
    count(ctx, 'barb:unit', 'fallback', ctx.playerOfSeat.get(BARB_SEAT));
  }
}

/**
 * THE PLAYERS' ENVOYS of the pair (the ones not sent in a start,
 * `stageEnvoys`), once its moves have landed: a major meets a city-state in
 * the move that reveals it, the first major to meet one sending it its free
 * envoy (`meetCityState`). Each minor's count from the player is brought to
 * record t+1's — through the engine's own verb, its purse's tokens, where
 * the engine's meeting has not; what the purse cannot send is the record's.
 */
function settleEnvoys(ctx: Ctx, b: TurnRecord): void {
  const { state } = ctx;
  for (const d of ctx.lateEnvoys) {
    const seat = seatOfP(ctx, d.player);
    const s = seatOf(state, seat) as Seat | undefined;
    const ms = seatOfP(ctx, d.minor);
    const cs = isCityStateSeat(ms) ? state.cityStates.find((c) => c.id === cityStateOfSeat(ms)) : undefined;
    if (!s || !cs || seat >= state.seats.length) { count(ctx, 'envoy', 'refused', d.player); continue; }
    const want = (b.players.find((p) => p.id === d.minor)?.envoysReceived ?? []).find(([g]) => g === d.player)?.[1] ?? 0;
    const short = want - (cs.envoys[seat] ?? 0);
    if (short <= 0) { count(ctx, 'envoy', 'applied'); continue; }
    const was = cs.envoys[seat] ?? 0;
    applySeatActionRecord(state, s, { production: [], tech: null, civic: null, units: [], envoys: new Array(short).fill(cs.id) });
    const got = (cs.envoys[seat] ?? 0) - was;
    // the envoys the engine's purse could not send land as the engine
    // receives any (`addEnvoys`): the stored contest, and the ground the
    // minor annexes for them
    if (got < short) addEnvoys(state, cs, seat, short - got);
    count(ctx, 'envoy', got >= short ? 'applied' : 'fallback', d.player, got >= short ? undefined : 'no token in the engine purse');
  }
}

/** a queued item as the engine holds it */
function queueItem(ctx: Ctx, seat: number, city: City, s: QueueSpec): QueueItem | null {
  const { cat, state } = ctx;
  if (s.kind === 'unit') {
    const id = engineRowOf(cat, 'unit', s.row);
    if (!id) return null;
    if (id === 'SETTLER') return { kind: 'settler', progress: 0, cost: settlerCost(state, seat) };
    const cost = id === 'BUILDER' ? builderCost(state, seat) : id === 'TRADER' ? traderCost(state, seat)
      : UNITS[id].costStep !== undefined ? unitStepCost(id, unitsAcquired(state, seat, id)) : undefined;
    return { kind: 'unit', unit: id, progress: 0, ...(cost !== undefined ? { cost } : {}), ...(s.formation ? { formation: s.formation } : {}) };
  }
  if (s.kind === 'building') {
    const name = cat.buildings[s.row];
    if (cat.wonders.includes(name)) {
      const id = engineId('wonder', name, 'BUILDING_', BUILT_WONDERS);
      return id && s.plot >= 0 ? { kind: 'wonder', wonder: id, tileIndex: s.plot, progress: 0 } : null;
    }
    const id = engineRowOf(cat, 'building', s.row);
    return id ? { kind: 'building', building: id, progress: 0 } : null;
  }
  if (s.kind === 'district') {
    const id = engineRowOf(cat, 'district', s.row) as DistrictId | null;
    const actor = seatOf(state, seat);
    if (!id || s.plot < 0 || !actor) return null;
    return { kind: 'district', district: id, tileIndex: s.plot, progress: 0,
      cost: districtSiteCost(state, actor as Seat, id, computeUnlocks(state, seat)) };
  }
  const id = engineId('project', cat.projects[s.row] ?? '', 'PROJECT_', PROJECTS);
  return id ? { kind: 'project', project: id, progress: 0, cost: projectCost(state, seat, id, city) } : null;
}

const itemKey = (q: QueueItem) => `${q.kind}:${'building' in q ? q.building : 'unit' in q ? q.unit : 'district' in q ? q.district
  : 'wonder' in q ? q.wonder : 'project' in q ? q.project : 'settler'}:${'tileIndex' in q ? q.tileIndex : -1}`;

/** may the city take this item at its head now, by the engine's own
 *  availability; a district or wonder is placed on its plot when it may */
function placeHead(ctx: Ctx, actor: Seat, city: City, q: QueueItem): boolean {
  const { state } = ctx;
  const seat = actor.seat;
  switch (q.kind) {
    case 'building': return availableBuildings(state, city).some((b) => b.id === q.building);
    case 'settler': return city.population >= 2;
    case 'unit': return trainableUnits(state, seat, city).some((d) => d.id === q.unit);
    case 'project': return availableProjects(state, city).some((p) => p.id === q.project);
    case 'district': {
      const t = state.map.tiles[q.tileIndex];
      if (t.district === q.district && city.districts.some((d) => d.tileIndex === q.tileIndex)) return true;
      const unlocks = computeUnlocks(state, seat);
      const legal = districtSiteLegal(state, city, q.district, unlocks, q.tileIndex);
      const before = city.queue.length;
      if (legal && placeSeatDistrict(state, actor, city, q.district, unlocks, q.tileIndex)) {
        const placed = city.queue.splice(before)[0];
        if (placed && placed.kind === 'district') q.cost = placed.cost;
        return true;
      }
      t.district = q.district;
      t.districtComplete = false;
      paveGround(t);
      if (!city.districts.some((d) => d.tileIndex === q.tileIndex)) city.districts.push({ type: q.district, tileIndex: q.tileIndex });
      return false;
    }
    case 'wonder': {
      const t = state.map.tiles[q.tileIndex];
      if (t.builtWonder === q.wonder) return true;
      const ok = canPlaceWonder(state, city, q.wonder, q.tileIndex, seat).ok;
      t.builtWonder = q.wonder;
      t.builtWonderComplete = false;
      paveGround(t);
      if (!city.wonders.some((w) => w.id === q.wonder)) city.wonders.push({ id: q.wonder, tileIndex: q.tileIndex });
      return ok;
    }
  }
}

function applyQueue(ctx: Ctx, d: Extract<Decision, { kind: 'queue' }>): void {
  const seat = seatOfP(ctx, d.player);
  const actor = seatOf(ctx.state, seat) as Seat | undefined;
  const city = cityAt(ctx.state, d.city);
  if (!actor || !city || city.seat !== seat) {
    count(ctx, 'queue', 'refused', d.player);
    return;
  }
  const items = d.items.map((s) => ({ s, q: queueItem(ctx, seat, city, s) })).filter((x): x is { s: QueueSpec; q: QueueItem } => !!x.q);
  const head = city.queue[0];
  const keep = head && items[0] && itemKey(head) === itemKey(items[0].q);
  for (const q of city.queue.slice(keep ? 1 : 0)) if (q.progress > 0) ctx.retained.set(`${city.centerIndex}|${itemKey(q)}`, q.progress);
  const queue: QueueItem[] = keep ? [head] : [];
  items.forEach(({ q }, i) => {
    if (i === 0 && keep) return;
    const k = `${city.centerIndex}|${itemKey(q)}`;
    q.progress = ctx.retained.get(k) ?? 0;
    ctx.retained.delete(k);
    if (i === 0) {
      const ok = placeHead(ctx, actor, city, q);
      const why = ok ? undefined : q.kind === 'building' && city.buildings.includes(q.building) ? 'already standing in the engine city'
        : q.kind === 'district' || q.kind === 'wonder' ? 'the engine refuses the site' : 'the engine does not offer it';
      count(ctx, `queue:${q.kind}`, ok ? 'applied' : 'fallback', d.player, why);
      if (ok && q.kind === 'unit') chargeUnitResource(ctx.state, seat, q.unit, city, q.formation ?? 0);
    }
    queue.push(q);
  });
  if (keep) count(ctx, `queue:${head.kind}`, 'applied', d.player);
  city.queue = queue;
}

function applyResearch(ctx: Ctx, player: number, row: number, civic: boolean): void {
  const kind = civic ? 'civic' : 'research';
  const s = seatOf(ctx.state, seatOfP(ctx, player));
  const id = civic ? engineId('civic', ctx.cat.civics[row], 'CIVIC_', CIVICS) : engineId('tech', ctx.cat.techs[row], 'TECH_', TECHS);
  if (!s || !id) {
    count(ctx, kind, 'refused', player);
    return;
  }
  const r = s.research;
  if ((civic ? r.civics : r.techs).includes(id)) {
    count(ctx, kind, 'refused', player, 'already complete in the engine');
    return;
  }
  if ((civic ? r.civic : r.tech) === id) {
    count(ctx, kind, 'applied');
    return;
  }
  const open = (civic ? availableCivicsIn(r) : availableTechsIn(r)).some((x) => x.id === id);
  selectResearch(r, id, civic);
  const def = civic ? CIVICS[id] : TECHS[id];
  const missing = (def?.prereqs ?? []).filter((p) => !(civic ? r.civics : r.techs).includes(p));
  count(ctx, kind, open ? 'applied' : 'fallback', player, open ? undefined : `${id} lacks ${missing.join(',') || '(no prereq missing)'}`);
  if (!open && TRACE.has(kind)) console.error(`   ${kind} engine holds [${(civic ? r.civics : r.techs).join(',')}] at ${civic ? r.civic : r.tech} ${civic ? r.civicProgress : r.techProgress}`);
}

type PolicyDecision = Extract<Decision, { kind: 'policies' }>;

/** a government and card set as the engine names them */
function policyIds(ctx: Ctx, d: PolicyDecision): { gid: string | null; ids: string[] } {
  const gid = d.government >= 0 ? engineId('government', ctx.cat.governments[d.government], 'GOVERNMENT_', GOVERNMENTS) : null;
  const ids = d.policies.map((i) => engineId('policy', ctx.cat.policies[i], 'POLICY_', POLICIES)).filter((x): x is string => !!x);
  return { gid, ids };
}

/** THE PENDING POLICIES. A government or card set the next record shows was
 *  slotted at the start of turn between the two records, after the civics
 *  and before the faith (runs/h1_duelw1116 China t9: God King's Faith
 *  banked, its Gold not), whichever player's: each goes on the wire, which
 *  the engine's turn lands at that point (`applySeatPolicies`). */
function stagePolicies(ctx: Ctx, ds: Decision[]): PolicyDecision[] {
  const staged = ds.filter((d): d is PolicyDecision => d.kind === 'policies');
  const turn: Record<number, SeatActionRecord> = {};
  const recOf = (seat: number): SeatActionRecord => (turn[seat] ??= { production: [], tech: null, civic: null, units: [] });
  for (const d of staged) {
    const seat = seatOfP(ctx, d.player);
    if (seat === NO_SEAT || seat >= ctx.state.seats.length) continue;
    const { gid, ids } = policyIds(ctx, d);
    const gi = gid ? GOVERNMENT_LIST.findIndex((g) => g.id === gid) : -1;
    Object.assign(recOf(seat), { government: gi >= 0 ? gi : null,
      policies: ids.map((id) => POLICY_LIST.findIndex((p) => p.id === id)).filter((i) => i >= 0) });
  }
  for (const d of ctx.envoys) {
    const seat = seatOfP(ctx, d.player);
    const ms = seatOfP(ctx, d.minor);
    const r = recOf(seat);
    r.envoys = [...(r.envoys ?? []), ...new Array(d.n).fill(cityStateOfSeat(ms))];
  }
  ctx.state.seatActions = { [ctx.state.turn - 1]: turn };
  return staged;
}

type EnvoyDecision = Extract<Decision, { kind: 'envoy' }>;

/** each staged envoy the engine's turn did not land is the record's */
function verifyEnvoys(ctx: Ctx, was: Map<EnvoyDecision, number>): void {
  const { state } = ctx;
  for (const [d, n0] of was) {
    const seat = seatOfP(ctx, d.player);
    const cs = state.cityStates.find((c) => c.id === cityStateOfSeat(seatOfP(ctx, d.minor)));
    const got = cs ? (cs.envoys[seat] ?? 0) - n0 : d.n;
    if (cs && got < d.n) {
      addEnvoys(state, cs, seat, d.n - got);
      count(ctx, 'envoy', 'fallback', d.player, 'the staged envoy did not land');
    }
  }
}

/** the generator a player's start between record b's predecessor and record
 *  b began and completed from: the last of each record b witnesses */
type BattleDecision = Extract<Decision, { kind: 'battle' }>;

/** the generator a battle's damage draws begin from: the actions of its
 *  player's turn run from the state its start completed with (`wit`'s
 *  witness) to the next player's start, and each hit the turn dealt took one
 *  "Unit Combat Damage" draw in order — the battle's first is its `seq`-th
 *  (the action log's battles, `RecordedActions`) */
function battleDraw(ctx: Ctx, wit: TurnRecord, b: TurnRecord, d: BattleDecision): number | undefined {
  const log = ctx.log;
  const post = startSeeds(wit, d.player).post;
  const from = log && post !== undefined ? log.index(post) : undefined;
  if (!log || from === undefined) return undefined;
  const stops = new Set<number>();
  for (const w of [...(b.witness ?? []), ...(wit.witness ?? [])]) {
    if (w.point === 'pre' && w.player !== d.player && typeof w.seed === 'number') stops.add(w.seed >>> 0);
  }
  let k = 0;
  for (let i = from; i < log.draws.length; i++) {
    if (i > from && stops.has(log.stateAt(i))) return undefined;
    if (log.draws[i].label !== 'Unit Combat Damage') continue;
    if (k === d.seq) return log.stateAt(i);
    k += 1;
  }
  return undefined;
}

function startSeeds(b: TurnRecord, player: number): { pre?: number; post?: number } {
  const out: { pre?: number; post?: number } = {};
  const at = { pre: -Infinity, post: -Infinity };
  for (const w of b.witness ?? []) {
    if (w.player !== player || typeof w.seed !== 'number' || (w.point !== 'pre' && w.point !== 'post') || w.turn < at[w.point]) continue;
    at[w.point] = w.turn;
    out[w.point] = w.seed >>> 0;
  }
  return out;
}

/** does the giver send its envoys in its start: its start draws more border
 *  picks than its cities (one each) — the minors' annexes — by the game's
 *  log; with no log, the start (the DLL's reading) */
function envoysInStart(log: RandLog | undefined, a: TurnRecord, b: TurnRecord, player: number): boolean {
  const { pre, post } = startSeeds(b, player);
  const draws = log && pre !== undefined && post !== undefined ? log.between(pre, post) : undefined;
  if (!draws) return true;
  const picks = draws.filter((x) => x.label === 'GetNextBuyablePlot picker').length;
  return picks > a.cities.filter((c) => c.owner === player).length;
}

/**
 * THE OTHER PLAYERS' ENVOYS. A player's AI sends its envoys in its start,
 * before its cities, or in its actions after it (`tools/civ6lab/
 * dll_readings.md` "H-1: the envoy annex"; the game's log places them,
 * `envoysInStart`), and the minor annexes a plot for each with a draw there.
 * The start's go on the wire, which the engine's turn spends at that seat's
 * start (`applySeatActionRecord`); an envoy the engine's purse holds no token
 * for — the game's civic paid one in that same start, the engine's only
 * after its actions — is the record's: the token is put in its purse first
 * (runs/h1_duelw1117 t28: China's two to Caguana annex 526 and 612 before
 * Xi'an's pick). The actions' land after the engine's turn, on the
 * generator the giver's start completed with (`applyPhase`; t24: China's
 * envoy to Caguana annexes 702 on the first draw past its start). Returns the
 * staged envoys' minors' counts before the turn.
 */
function stageEnvoys(ctx: Ctx, ds: Decision[], a: TurnRecord, b: TurnRecord, log: RandLog | undefined): Map<EnvoyDecision, number> {
  const { state } = ctx;
  ctx.envoys = [];
  const was = new Map<EnvoyDecision, number>();
  for (const d of ds) {
    if (d.kind !== 'envoy' || d.phase !== 'after' || !envoysInStart(log, a, b, d.player)) continue;
    const seat = seatOfP(ctx, d.player);
    const s = seatOf(state, seat) as Seat | undefined;
    const ms = seatOfP(ctx, d.minor);
    const cs = isCityStateSeat(ms) ? state.cityStates.find((c) => c.id === cityStateOfSeat(ms)) : undefined;
    if (!s || !cs || seat >= state.seats.length || !cs.met.includes(seat)) continue;
    const short = d.n - (s.envoysAvailable ?? 0);
    if (short > 0) s.envoysAvailable = (s.envoysAvailable ?? 0) + short;
    ctx.envoys.push(d);
    was.set(d, cs.envoys[seat] ?? 0);
    count(ctx, 'envoy', short > 0 ? 'fallback' : 'applied', d.player, short > 0 ? 'no token in the engine purse at its start' : undefined);
  }
  return was;
}

/** each staged set the engine refused is the record's */
function verifyPolicies(ctx: Ctx, staged: PolicyDecision[]): void {
  for (const d of staged) {
    const s = seatOf(ctx.state, seatOfP(ctx, d.player));
    if (!s) continue;
    const { gid, ids } = policyIds(ctx, d);
    // the cards as a set: the stored layout holds its empty slots as null
    const cards = (xs: readonly (string | null)[]) => xs.filter((x): x is string => !!x).sort().join();
    const govOk = !gid || s.government.chosen === gid;
    const same = govOk && cards(s.government.policies) === cards(ids);
    let why: string | undefined;
    if (!same) {
      const gov = seatGovernment(ctx.state, s.seat);
      const open = gov ? unlockedPolicyIds(s.research, congressPolicyBlocked(ctx.state), inDarkAge(ctx.state, s.seat), s.government.held, gov)
        : new Set<string>();
      why = !govOk ? `government ${gid} not adopted (in ${s.government.chosen})`
        : ids.some((id) => !open.has(id)) ? `a card not unlocked: ${ids.filter((id) => !open.has(id)).join(',')}`
          : !fitPolicies(governmentSlots(ctx.state, s.seat), ids) ? 'the set does not fit the slots'
            : 'the unlock unaffordable';
      if (gid) s.government.chosen = gid as typeof s.government.chosen;
      s.government.policies = fitPolicies(governmentSlots(ctx.state, s.seat), ids) ?? ids;
    }
    count(ctx, 'policies', same ? 'applied' : 'fallback', d.player, why);
  }
  ctx.state.seatActions = {};
}

function applyFound(ctx: Ctx, d: Extract<Decision, { kind: 'found' }>): void {
  const { state } = ctx;
  const minor = ctx.pendingMinors.get(d.player);
  const settler = d.unit ? unitOf(ctx, d.unit) : undefined;
  if (minor) {
    ctx.pendingMinors.delete(d.player);
    // a city-state's founding (`placeCityStateAt`, the engine's setup step)
    const placed = placeCityStateAt(state, minor.id, minor.name, minor.type, d.plot);
    Object.assign(placed, { envoys: minor.envoys, met: minor.met, suzerain: minor.suzerain, research: minor.research });
    state.cityStates.sort((a, b) => a.id - b.id);
    if (settler) disbandUnit(state, settler.id);
    count(ctx, 'found:minor', 'applied');
    return;
  }
  const seat = seatOfP(ctx, d.player);
  const owner = seatOf(state, seat) as Seat | undefined;
  if (!owner || seat === BARB_SEAT) return void count(ctx, 'found', 'refused', d.player);
  if (settler) settler.tileIndex = d.plot;
  const res = foundCity(state, d.plot, seat);
  if (res.ok) return void count(ctx, 'found', 'applied');
  if (settler && state.units.includes(settler)) disbandUnit(state, settler.id);
  foundCityAt(state, seat, state.map.tiles[d.plot], owner);
  count(ctx, 'found', 'fallback', d.player, res.reason);
}

function applyBuyBuilding(ctx: Ctx, d: Extract<Decision, { kind: 'buyBuilding' }>): void {
  const { state } = ctx;
  const seat = seatOfP(ctx, d.player);
  const actor = seatOf(state, seat) as Seat | undefined;
  const city = cityAt(state, d.city);
  const id = engineRowOf(ctx.cat, 'building', d.building);
  if (!actor || !city || !id) return void count(ctx, 'buyBuilding', 'refused', d.player);
  if (city.buildings.includes(id)) return void count(ctx, 'buyBuilding', 'refused', d.player);
  let ok = false;
  if (d.currency === 'gold') ok = buySeatBuilding(state, actor, city, id);
  else ok = (BUILDINGS[id]?.worship ? buyWorshipBuilding(state, city.id, seat) : purchaseBuildingWithFaith(state, city.id, id, seat)).ok;
  if (!ok) {
    if (d.currency === 'gold') actor.treasury -= goldPrice(state, seat, buildingPurchaseCost(state, seat, id));
    else actor.faith -= buildingFaithPrice(state, seat, id) ?? 0;
    city.buildings.push(id);
    city.queue = city.queue.filter((q) => !(q.kind === 'building' && q.building === id));
  }
  count(ctx, `buyBuilding:${d.currency}`, ok ? 'applied' : 'fallback', d.player);
}

function applyBuyUnit(ctx: Ctx, d: Extract<Decision, { kind: 'buyUnit' }>, rec: TurnRecord): void {
  const { state } = ctx;
  const seat = seatOfP(ctx, d.player);
  const actor = seatOf(state, seat) as Seat | undefined;
  const city = cityAt(state, d.city);
  const id = engineRowOf(ctx.cat, 'unit', d.type);
  const kind = `buyUnit:${d.currency}`;
  if (!actor || !city || !id || city.seat !== seat) {
    spawnRecorded(ctx, rec, d.unit);
    return void count(ctx, kind, 'fallback', d.player);
  }
  const before = new Set(state.units);
  let ok = false;
  if (d.currency === 'gold') {
    if (id === 'SETTLER') ok = purchaseSettler(state, city.id, seat).ok;
    else {
      const price = unitGoldPrice(state, id, seat, city);
      if (goldAffordable(actor.treasury ?? 0, price)) {
        const u = spawnUnit(state, id, city.centerIndex, seat);
        if (u) {
          actor.treasury -= price;
          applyTrainingGrants(state, city, u);
          chargeUnitResource(state, seat, id);
          ok = true;
        }
      }
    }
  } else if (id === 'MISSIONARY' || id === 'APOSTLE' || id === 'INQUISITOR' || id === 'GURU' || id === 'WARRIOR_MONK') {
    ok = purchaseReligiousUnit(state, city.id, id, seat).ok;
  } else if (id === 'BUILDER' || id === 'SETTLER') {
    ok = purchaseCivilianWithFaith(state, city.id, id, seat).ok;
  } else ok = purchaseUnitWithFaith(state, city.id, id, seat).ok;
  const made = state.units.find((u) => !before.has(u) && u.seat === seat && u.type === id);
  if (ok && made) ctx.units.set(d.unit, made);
  else spawnRecorded(ctx, rec, d.unit);
  count(ctx, kind, ok && made ? 'applied' : 'fallback', d.player);
}

/** the decisions of one phase, in a fixed order: cities first (a founding
 *  gives the queue its city), then the seats, the cities' orders, the plots,
 *  the units; the research and civic picks last, after the blows whose
 *  boosts may complete what was in hand (runs/h1_duelw1117 t23: China's
 *  Slinger kill completed Archery, then Horseback Riding was picked) */
const ORDER: Decision['kind'][] = ['found', 'capture', 'policies', 'pantheon', 'religion', 'governors', 'war',
  'envoy', 'levy', 'routes', 'congress', 'buyPlot', 'buyBuilding', 'wonderCharge', 'queue', 'worked', 'improve', 'clear', 'buyUnit', 'move', 'village', 'unitNew', 'battle', 'unitGone', 'combat', 'hit', 'kill', 'promote', 'upgrade', 'camp', 'research', 'civic'];

function applyPhase(ctx: Ctx, ds: Decision[], phase: Decision['phase'], b: TurnRecord, wit: TurnRecord): void {
  const { state, next } = ctx;
  // a unit lost in the pair was lost to a blow of whoever struck it, which
  // may be a later player's: its loss lands with the other players' actions,
  // after their battles (runs/h1_duelw1121 t12: Rome's Warrior killed in the
  // barbarians' turn)
  const phaseOf = (d: Decision) => (d.kind === 'unitGone' && d.why === 'lost' ? 'after' : d.phase);
  const mine = ds.filter((d) => phaseOf(d) === phase).sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind));
  // EACH PLAYER'S ACTIONS draw on the stream its start completed with (its
  // `PlayerTurnStartComplete` witness in `wit`: record t for the active
  // player's, record t + 1 for the others'), each player's draws its own
  // run of it (runs/h1_duelw1117 t24: China's envoy annexes Caguana's 702 on
  // the first draw past its start; t26: Stonehenge's two free plots)
  const streams = new Map<number, number>();
  let drawing: number | undefined;
  for (const d of mine) {
    const p = 'player' in d ? d.player : undefined;
    if (p !== undefined && p !== drawing) {
      if (drawing !== undefined) streams.set(drawing, state.rngState);
      const post = streams.get(p) ?? startSeeds(wit, p).post;
      if (post !== undefined) state.rngState = post;
      drawing = p;
    }
    switch (d.kind) {
      case 'queue': applyQueue(ctx, d); break;
      case 'research': applyResearch(ctx, d.player, d.tech, false); break;
      case 'civic': applyResearch(ctx, d.player, d.civic, true); break;
      case 'policies': break;
      case 'found': applyFound(ctx, d); break;
      case 'buyBuilding': applyBuyBuilding(ctx, d); break;
      case 'buyUnit': applyBuyUnit(ctx, d, b); break;
      case 'buyPlot': {
        const seat = seatOfP(ctx, d.player);
        const city = cityAt(state, d.city);
        if (!city || city.seat !== seat) { count(ctx, 'buyPlot', 'refused', d.player); break; }
        if (state.map.tiles[d.plot].ownerSeat === seat) { count(ctx, 'buyPlot', 'refused', d.player); break; }
const res = buyTile(state, city.id, d.plot, seat);        if (!res.ok) setTileOwner(state.map.tiles[d.plot], seat, city.id);        count(ctx, 'buyPlot', res.ok ? 'applied' : 'fallback', d.player, res.reason);
        break;
      }
      case 'worked': {
        // a city-state's citizens are its script's decision as a major's
        // are its player's
        const minor = state.cityStates.find((x) => x.centerIndex === d.city);
        const city = cityAt(state, d.city) ?? (minor ? minorCity(minor) : undefined);
        if (!city) break;
        for (const t of state.map.tiles) {
          if (t.ownerSeat !== city.seat || t.ownerCity !== city.id) continue;
          t.locked = false;
          t.lockRank = undefined;
        }
        d.plots.forEach((q, i) => {
          const t = state.map.tiles[q];
          if (q === city.centerIndex || t.district) return;
          t.locked = true;
          if (d.ranks?.[i]) t.lockRank = d.ranks[i];
        });
        const read = [...next.dumpOfCity].find(([, c]) => c.y * ctx.W + c.x === d.city)?.[0];
        if (read?.specialistPref) city.specialistPref = [...read.specialistPref];
        count(ctx, 'worked', 'applied');
        break;
      }
      case 'improve': {
        const seat = seatOfP(ctx, d.player);
        const t = state.map.tiles[d.plot];
        const want = next.state.map.tiles[d.plot].improvement;
        if (!want) { count(ctx, 'improve', 'refused', d.player); break; }
        const valid = seat >= 0 ? validImprovements(state, t, seat) : [];
        // the order is the player's, through the engine's verb with the unit
        // the log names: a major's Builder takes its improvement order (the
        // charge, the turn, the culture bomb, the last charge's end), a
        // minor's lays it as a minor's does
        const builder = d.unit ? unitOf(ctx, d.unit) : undefined;
        const actor = seatOf(state, seat) as Seat | undefined;
        if (builder && actor && valid.includes(want as never) && (builder.charges ?? 0) > 0) {
          builder.tileIndex = d.plot;
          if (isCityStateSeat(seat)) minorBuilderLays(state, builder, d.plot, want);
          else if (seat < state.seats.length) {
            const ii = IMPROVEMENT_IDS.indexOf(want);
            const code = ii < 0 ? -1 : ii < DEDICATED_IMPROVEMENTS ? 13 + ii : 18 + ii - DEDICATED_IMPROVEMENTS;
            const row = unitsOf(state, seat).map((u) => (u === builder ? code : -1));
            builder.movesLeft = Math.max(builder.movesLeft, grantedMoves(state, builder));
            if (code >= 0) applySeatUnitOrders(state, actor, [row]);
          }
          if (t.improvement === want) { count(ctx, 'improve', 'applied'); break; }
        }
        const ok = valid.includes(want as never);
        t.improvement = want;
        t.pillaged = false;
        count(ctx, 'improve', 'fallback', d.player, ok ? (builder ? 'the builder\'s order refused' : 'no builder the log names')
          : `${want} on ${t.terrain}/${t.elevation}/${t.feature}/${t.resource} seat ${seat}: the engine offers [${valid.join(',')}]`);
        break;
      }
      case 'levy': {
        // the order is the suzerain's, through the engine's verb; the game's
        // new ids name the same units from here on
        const seat = seatOfP(ctx, d.player);
        const ms = seatOfP(ctx, d.minor);
        const cs = isCityStateSeat(ms) ? state.cityStates.find((c) => c.id === cityStateOfSeat(ms)) : undefined;
        const s = seatOf(state, seat) as Seat | undefined;
        if (!cs || !s) { count(ctx, 'levy', 'refused', d.player); break; }
        const price = levyGoldCost(state, seat, cs);
        const res = levyUnits(state, cs.id, seat);
        for (const [from, to] of d.units) {
          const u = unitOf(ctx, from);
          ctx.units.delete(from);
          if (!u) continue;
          ctx.units.set(to, u);
          if (!res.ok) {
            u.seat = seat;
            u.leviedFrom = cs.seat;
          }
        }
        if (!res.ok) {
          s.treasury -= price;
          cs.levySeat = seat;
        }
        count(ctx, 'levy', res.ok ? 'applied' : 'fallback', d.player, res.reason);
        break;
      }
      case 'wonderCharge': {
        // the order is the player's, through the engine's verb, from where
        // the Builder stood
        const u = unitOf(ctx, d.unit);
        const actor = seatOf(state, seatOfP(ctx, d.player)) as Seat | undefined;
        if (!u || !actor) { count(ctx, 'wonderCharge', 'refused', d.player); break; }
        u.tileIndex = d.plot;
        const res = wonderChargeBoost(state, u, actor);
        count(ctx, 'wonderCharge', res.ok ? 'applied' : 'refused', d.player, res.reason);
        break;
      }
      case 'clear': {
        const seat = seatOfP(ctx, d.player);
        const t = state.map.tiles[d.plot];
        if (d.what === 'feature' ? !t.feature : !t.resource) { count(ctx, `clear:${d.what}`, 'refused', d.player); break; }
        const grants = d.what === 'feature' ? chopGrant(state, t, seat) : [harvestGrant(state, t, seat)].filter((g) => !!g);
        for (const g of grants) applyLumpYield(state, d.plot, g!, seat);
        if (d.what === 'feature') t.feature = null;
        else t.resource = null;
        count(ctx, `clear:${d.what}`, 'applied');
        break;
      }
      case 'envoy': {
        // the other players' envoys went to the engine's turn (`stageEnvoys`)
        if (ctx.envoys.includes(d)) break;
        // the rest land once the pair's moves have met what they met
        // (`settleEnvoys`)
        ctx.lateEnvoys.push(d);
        break;
      }
      case 'pantheon': {
        const s = seatOf(state, seatOfP(ctx, d.player));
        const id = engineId('belief', ctx.cat.beliefs[d.belief], 'BELIEF_', PANTHEONS);
        if (!s || !id) { count(ctx, 'pantheon', 'refused', d.player); break; }
        const had = s.religion.pantheon;
        if (had === id) { count(ctx, 'pantheon', 'applied'); break; }
        if (had) state.claimedPantheons = state.claimedPantheons.filter((x) => x !== had);
        const paid = !had && (s.faith ?? 0) >= PANTHEON_FAITH_COST;
        if (paid) {
          s.faith -= PANTHEON_FAITH_COST;
          pantheonMoment(state, s.seat);
        }
        s.religion.pantheon = id;
        if (!state.claimedPantheons.includes(id)) state.claimedPantheons.push(id);
        if (!had) {
          grantPantheonUnit(state, s.seat, id);
          matchNewUnits(ctx, b);
        }
        count(ctx, 'pantheon', paid ? 'applied' : 'fallback', d.player);
        break;
      }
      case 'religion': {
        const seat = seatOfP(ctx, d.player);
        const s = seatOf(state, seat);
        const r = seatOf(next.state, seat)?.religion;
        if (!s || !r) { count(ctx, 'religion', 'refused', d.player); break; }
        const founding = !s.religion.founded && r.founded;
        // the founding's moment, as the engine's own founding pays it
        if (founding) religionMoment(state, seat);
        s.religion = { ...structuredClone(r), pantheon: s.religion.pantheon };
        // a founding's holy city takes the pressure and the following the
        // founding gave it, as record t+1 shows them
        const holy = founding && typeof r.holyTile === 'number' ? cityAt(state, r.holyTile) : undefined;
        const read = holy ? [...next.dumpOfCity.keys()].find((c) => c.centerIndex === holy.centerIndex) : undefined;
        if (holy && read) {
          holy.religionPressure = [...(read.religionPressure ?? [])];
          holy.followedReligion = read.followedReligion;
        }
        count(ctx, 'religion', 'fallback', d.player);
        break;
      }
      case 'governors': {
        // each appointment, promotion and assignment the record's player
        // made, through the engine's own verbs: the clocks are the engine's
        const seat = seatOfP(ctx, d.player);
        const s = seatOf(state, seat);
        const g = seatOf(next.state, seat)?.governors;
        if (!s || !g) { count(ctx, 'governors', 'refused', d.player); break; }
        const roster = governorsOf(s);
        g.forEach((x, i) => {
          const from = x.cityId >= 0 ? next.state.seats[seat]?.cities.find((c) => c.id === x.cityId) : undefined;
          const to = from ? cityAt(state, from.centerIndex) : undefined;
          const cityId = to && to.seat === seat ? to.id : -1;
          const e = roster[i];
          const same = () => x.appointed === e.appointed && x.promotions === e.promotions
            && cityId === e.cityId && x.minorId === e.minorId;
          if (same()) return;
          if (x.appointed && !e.appointed) appointGovernor(state, seat, i);
          for (let p = 0; p < GOVERNOR_PROMOTIONS.length; p++) {
            if (promotionBit(x.promotions, p) && !promotionBit(e.promotions, p)) promoteGovernor(state, seat, i, p);
          }
          if (cityId >= 0 || x.minorId >= 0) {
            if (cityId !== e.cityId || x.minorId !== e.minorId) {
              assignGovernor(state, seat, i, x.minorId >= 0 ? { minorId: x.minorId } : { cityId });
            }
          }
          if (same()) { count(ctx, 'governors', 'applied'); return; }
          // the record's roster, on the engine's clock where the posting
          // stands (a record reads an unestablished governor's full count)
          const kept = e.appointed && e.cityId === cityId && e.minorId === x.minorId && cityId + x.minorId > -2;
          roster[i] = { ...x, cityId, establishTurns: kept ? e.establishTurns : x.establishTurns };
          count(ctx, 'governors', 'fallback', d.player);
        });
        break;
      }
      case 'routes': {
        const seat = seatOfP(ctx, d.player);
        const s = seatOf(state, seat);
        const theirs = seatOf(next.state, seat)?.tradeRoutes;
        if (!s || !theirs) { count(ctx, 'routes', 'refused', d.player); break; }
        // each route record t+1 runs that the engine does not is the
        // player's order, through the engine's own verb for its kind (a
        // Trader spent, the course laid); a route the engine refuses is the
        // record's. Routes that ended are the engine's to end.
        const nextOwner = seatOf(next.state, seat)!;
        const key = (o: number, dst: number) => `${o}>${dst}`;
        const have = new Set((s.tradeRoutes ?? []).map((r) => key(routeOriginCenter(state, s, r), routeDestCenter(state, s, r))));
        for (const r of theirs) {
          const o = routeOriginCenter(next.state, nextOwner, r);
          const dst = routeDestCenter(next.state, nextOwner, r);
          if (o < 0 || dst < 0 || have.has(key(o, dst))) continue;
          const from = cityAt(state, o);
          let res: { ok: boolean; reason?: string } = { ok: false, reason: 'no engine city at the origin' };
          if (from && from.seat === seat) {
            if (r.toCs !== undefined) res = addCsTradeRoute(state, from.id, r.toCs, seat);
            else if (r.toSeat !== undefined && r.toSeat !== seat) {
              const to = cityAt(state, dst);
              res = to ? addIntlTradeRoute(state, from.id, to.seat, to.id, seat) : { ok: false, reason: 'no engine city at the destination' };
            } else {
              const to = cityAt(state, dst);
              res = to ? addTradeRoute(state, from.id, to.id, seat) : { ok: false, reason: 'no engine city at the destination' };
            }
          }
          if (res.ok) { count(ctx, 'routes', 'applied'); continue; }
          const remap = (owner: number, id: number | undefined) => {
            if (id === undefined) return undefined;
            const c = seatOf(next.state, owner)?.cities.find((x) => x.id === id);
            return c ? cityAt(state, c.centerIndex)?.id : undefined;
          };
          (s.tradeRoutes ??= []).push({ ...structuredClone(r), from: remap(seat, r.from) ?? -1,
            ...(r.to !== undefined ? { to: remap(seat, r.to) } : {}),
            ...(r.toSeatCity !== undefined && r.toSeat !== undefined ? { toSeatCity: remap(r.toSeat, r.toSeatCity) } : {}) });
          count(ctx, 'routes', 'fallback', d.player, res.reason);
        }
        break;
      }
      case 'war': {
        const a = seatOfP(ctx, d.player);
        const o = seatOfP(ctx, d.other);
        if (a === NO_SEAT || o === NO_SEAT || a === BARB_SEAT || o === BARB_SEAT) { count(ctx, 'war', 'refused', d.player); break; }
        if (civsAtWar(state, a, o) === d.war) { count(ctx, 'war', 'applied'); break; }
        if (isCityStateSeat(o) && a < state.seats.length) {
          if (d.war) declareWarOnCityState(state, cityStateOfSeat(o), a);
          else sueForPeaceWithCityState(state, cityStateOfSeat(o), a);
        } else if (a < state.seats.length && o < state.seats.length) {
          if (d.war) declareWar(state, a, o);
          else sueForPeace(state, a, o);
        }
        const ok = civsAtWar(state, a, o) === d.war;
        if (!ok) setWar(state, a, o, d.war);
        count(ctx, d.war ? 'war:declare' : 'war:peace', ok ? 'applied' : 'fallback', d.player);
        break;
      }
      case 'capture': {
        const to = seatOf(state, seatOfP(ctx, d.player)) as Seat | undefined;
        const city = cityAt(state, d.city);
        if (!to || !city) { count(ctx, 'capture', 'refused', d.player); break; }
        if (city.seat !== to.seat) transferCity(state, city.seat, to, city, 'conquered');
        count(ctx, 'capture', 'fallback', d.player);
        break;
      }
      case 'congress': {
        state.congress = structuredClone(next.state.congress);
        count(ctx, 'congress', 'fallback');
        break;
      }
      case 'unitGone': {
        const u = unitOf(ctx, d.unit);
        ctx.units.delete(d.unit);
        if (!u) { count(ctx, `unitGone:${d.why}`, 'applied'); break; }
        disbandUnit(state, u.id);
        count(ctx, `unitGone:${d.why}`, d.why === 'founded' ? 'applied' : 'fallback', d.player);
        break;
      }
      case 'unitNew': {
        // a major's trained unit is its city's production, the engine's to
        // make; a city-state's or a Free City's is their scripts' decision,
        // which the engine does not replay; the barbarians' are their rules',
        // which close the pair (`barbarianTurn`)
        const major = seatOfP(ctx, d.player) >= 0 && seatOfP(ctx, d.player) < state.seats.length;
        if (isBarbSeat(seatOfP(ctx, d.player))) {
          ctx.barbNew.push(d.unit);
          break;
        }
        // a unit an engine verb of this phase made (a wonder a charge
        // completed grants its Great Person) is the record's
        if (major) matchNewUnits(ctx, b);
        if ((d.why === 'trained' && major) || unitOf(ctx, d.unit)) break;
        spawnRecorded(ctx, b, d.unit);
        count(ctx, major ? 'unitNew:other' : 'minorAi:unitNew', 'fallback', d.player);
        break;
      }
      case 'move':
        if (d.path) ctx.paths.set(d.unit, d.path);
        break;
      case 'camp': {
        const u = unitOf(ctx, d.unit);
        if (!u || !state.barbSeat.camps.includes(d.plot)) { count(ctx, 'camp', 'refused', d.player); break; }
        clearCampFor(state, u, d.plot);
        // the lab's HUMAN seat holds the install's BARBARIAN_CAMP_GOLD_SCALING
        // (Leaders.xml, TRAIT_LEADER_MAJOR_CIV on PLAYER_IS_HUMAN): its
        // dispersal change before the speed, which no engine seat holds
        if (bool(b.players.find((p) => p.id === d.player)?.human)) {
          const s = seatOf(state, u.seat);
          if (s) s.treasury += HUMAN_CAMP_GOLD;
        }
        count(ctx, 'camp', 'applied');
        break;
      }
      case 'village': {
        // entering is the decision; the reward is the engine's own village
        // (`drawAndPayGoody`) on the game's draws ("Choosing a Goody Hut
        // Type", "Choosing a Sub Type"), paid to the unit the log names
        // (`GoodyHutReward`), standing on the plot
        const s = seatOf(state, seatOfP(ctx, d.player));
        const t = state.map.tiles[d.plot];
        if (!s || !t.goodyHut) { count(ctx, 'village', 'refused', d.player); break; }
        t.goodyHut = false;
        goodyMoment(state, s.seat);
        const enterer = d.unit ? unitOf(ctx, d.unit) : undefined;
        if (enterer) {
          enterer.tileIndex = d.plot;
          drawAndPayGoody(state, enterer, t);
          matchNewUnits(ctx, b);
          count(ctx, 'village', 'applied');
          break;
        }
        // no unit the log names: the record's reward, its Gold, Faith and boosts
        if (d.gold >= VILLAGE_MIN) s.treasury += d.gold;
        if (d.faith >= VILLAGE_MIN) s.faith += d.faith;
        // the unit it gave arrives as the record's (`unitNew`); a Builder or a
        // Settler is a copy its price climbs on, as the engine's own village
        // counts it (`drawAndPayGoody`)
        for (const x of ds) {
          if (x.kind !== 'unitNew' || x.why !== 'other' || x.player !== d.player) continue;
          const type = engineRowOf(ctx.cat, 'unit', x.type);
          if (type === 'BUILDER') s.buildersTrained += 1;
          else if (type === 'SETTLER') s.settlersTrained = (s.settlersTrained ?? 0) + 1;
        }
        const grew = d.popCity >= 0 ? cityAt(state, d.popCity) : undefined;
        if (grew && grew.seat === s.seat) {
          gainPopulationPressure(grew, 1);
          grew.population += 1;
        }
        for (const [rows, names, prefix, known] of [[d.techBoosts, ctx.cat.techs, 'TECH_', TECHS], [d.civicBoosts, ctx.cat.civics, 'CIVIC_', CIVICS]] as const) {
          for (const k of rows) {
            const id = engineId(prefix === 'TECH_' ? 'tech' : 'civic', names[k], prefix, known);
            if (id) markBoost(state, s.seat, id);
          }
        }
        count(ctx, 'village', 'fallback', d.player);
        break;
      }
      case 'upgrade': {
        // the order is the player's, through the engine's verb; the game's
        // new id names the same unit from here on
        const u = unitOf(ctx, d.unit);
        if (!u) { count(ctx, 'upgrade', 'refused', d.player); break; }
        // the unit stood where the game added its upgrade, with moves to
        // spend (the order needs them); the record's steps before it are the
        // replay's, outside the engine's turn
        const r = b.units.find((x) => `${x.owner}:${x.id}` === d.into);
        if (r) u.tileIndex = r.y * ctx.W + r.x;
        if (u.movesLeft <= 0) u.movesLeft = grantedMoves(state, u);
        const res = upgradeUnit(state, u, u.seat);
        ctx.units.delete(d.unit);
        ctx.units.set(d.into, u);
        if (!res.ok) {
          const t = r ? engineRowOf(ctx.cat, 'unit', r.type) : null;
          const s = seatOf(state, u.seat);
          if (s) s.treasury -= upgradeGoldCost(state, u.seat, u.type, u.leviedFrom !== undefined, u.formation ?? 0);
          if (t) u.type = t;
          u.movesLeft = 0;
        }
        count(ctx, 'upgrade', res.ok ? 'applied' : 'fallback', d.player, res.reason);
        break;
      }
      case 'promote': {
        // the pick is the player's; the experience that earned it is the
        // record's battles' (`combat`), so the unit holds the record's
        const u = unitOf(ctx, d.unit);
        const name = (ctx.cat.unitPromotions ?? [])[d.promotion]?.replace(/^PROMOTION_/, '');
        if (!u || !name) { count(ctx, 'promote', 'refused', d.player); break; }
        const k = unitPromoRows(u).findIndex((p) => p.id === name);
        u.xp = Math.max(u.xp ?? 0, d.xp);
        if (k >= 0 && takePromotion(u, k)) { count(ctx, 'promote', 'applied', d.player); break; }
        if (k >= 0) {
          u.promos = (u.promos ?? 0) | (1 << k);
          u.level = (u.level ?? 1) + 1;
          u.xp = 0;
          u.hp = Math.min(UNIT_HP, u.hp + PROMOTE_HEAL);
        }
        count(ctx, 'promote', 'fallback', d.player, k < 0 ? `no ${name} in the unit's class` : 'the engine offered no such pick');
        break;
      }
      case 'kill': {
        // the battle is the record's (`combat`); the kill is the engine's
        // event, paid through its own verb: the killer's eurekas and
        // inspirations, its post-combat yields and dedications
        const seat = seatOfP(ctx, d.player);
        if (ctx.engineKilled.has(d.victimUnit)) { count(ctx, 'kill', 'applied'); break; }
        const unitId = (row: number) => (row >= 0 ? engineId('unit', ctx.cat.units[row], 'UNIT_', UNITS) : null);
        const vt = unitId(d.victimType);
        if (seat === NO_SEAT || !vt) { count(ctx, 'kill', 'refused', d.player); break; }
        const kt = unitId(d.killerType);
        unitKillEvent(state, seat, kt ? { type: kt } : undefined, { type: vt, seat: seatOfP(ctx, d.victim) });
        count(ctx, 'kill', 'applied', d.player);
        break;
      }
      case 'battle': {
        // the battle is the engine's: its melee or ranged combat resolves it
        // from where the log's steps had the two units, on the game's own
        // damage draws
        const atk = unitOf(ctx, d.attacker);
        const def = unitOf(ctx, d.defender);
        if (!atk || !def) { count(ctx, 'battle', 'refused', d.player, 'a unit the replay does not hold'); if (TRACE.has('battle')) console.error(`   ${d.attacker} ${!!atk} ${d.defender} ${!!def}`); break; }
        const s0 = battleDraw(ctx, wit, b, d);
        if (s0 === undefined) { count(ctx, 'battle', 'refused', d.player, 'no damage draw in the log'); break; }
        atk.tileIndex = d.from;
        def.tileIndex = d.at;
        atk.movesLeft = Math.max(atk.movesLeft, grantedMoves(state, atk));
        atk.attacksLeft = Math.max(1, atk.attacksLeft ?? 1);
        state.rngState = s0;
        const r = d.ranged ? rangedAttack(state, atk.id, d.at) : meleeAttack(state, atk.id, d.at, atk.seat);
        if (!r.ok) { count(ctx, 'battle', 'refused', d.player, r.reason); break; }
        ctx.battled.add(d.attacker);
        ctx.battled.add(d.defender);
        for (const k of [d.attacker, d.defender]) if (!state.units.includes(ctx.units.get(k)!)) ctx.engineKilled.add(k);
        count(ctx, 'battle', 'applied');
        break;
      }
      case 'combat': {
        const u = unitOf(ctx, d.unit);
        if (!u || ctx.battled.has(d.unit)) break;
        u.hp = d.hp;
        count(ctx, 'combat', 'fallback', d.player);
        break;
      }
      case 'hit': {
        // a blow no battle holds, on a unit whose battles were the engine's:
        // the record's damage (a unit with no battle takes the record's
        // health whole, `combat`)
        const u = unitOf(ctx, d.unit);
        if (!u || !ctx.battled.has(d.unit) || !state.units.includes(u)) break;
        u.hp = Math.max(1, u.hp - d.dmg);
        count(ctx, 'hit', 'fallback', d.player);
        break;
      }
    }
  }
}

/** THE KILLS' BOOSTS. Combat is the record's (`combat` falls back), so the
 *  engine never sees the kill that lands a KILL_WITH, KILL_SPECIFIC_UNIT or
 *  NUM_BARBS_KILLED boost: each such boost record t+1 shows and the engine
 *  lacks is the record's, landed through the engine's own grant. */
const KILL_CLASSES = new Set(['KILL_WITH', 'KILL_SPECIFIC_UNIT', 'NUM_BARBS_KILLED']);
function killBoosts(ctx: Ctx, read: Imported): void {
  read.state.seats.forEach((rsx, seat) => {
    const es = ctx.state.seats[seat];
    if (!es) return;
    for (const id of rsx.research.boosted) {
      if (es.research.boosted.includes(id) || !KILL_CLASSES.has(BOOSTS[id]?.cls ?? '')) continue;
      grantBoost(ctx.state, seat, id);
      count(ctx, `boost:${BOOSTS[id].cls}`, 'fallback', ctx.playerOfSeat.get(seat));
    }
  });
}

/** the engine's units the turn made, matched to the record's new units of the
 *  same seat and type, nearest first */
function matchNewUnits(ctx: Ctx, b: TurnRecord): void {
  const mapped = new Set([...ctx.units.values()]);
  const free = ctx.state.units.filter((u) => !mapped.has(u));
  for (const r of b.units) {
    const key = `${r.owner}:${r.id}`;
    if (unitOf(ctx, key)) continue;
    const seat = seatOfP(ctx, r.owner);
    const type = engineRowOf(ctx.cat, 'unit', r.type);
    const at = r.y * ctx.W + r.x;
    let best: Unit | undefined;
    let bd = Infinity;
    for (const u of free) {
      if (u.seat !== seat || u.type !== type) continue;
      const t0 = ctx.state.map.tiles[u.tileIndex];
      const t1 = ctx.state.map.tiles[at];
      const dd = Math.abs(t0.col - t1.col) + Math.abs(t0.row - t1.row);
      if (dd < bd) [bd, best] = [dd, u];
    }
    if (best) {
      ctx.units.set(key, best);
      free.splice(free.indexOf(best), 1);
    }
  }
}

/** THE GOVERNORS are their player's decisions (`governors`): what the
 *  engine's own script (`governorPhase`) appointed, promoted or assigned in
 *  the turn is undone, while its clocks run — an assignment it made leaves
 *  the slot as it stood, a turn further on its establishment. */
function undoGovernorScript(state: GameState, rosters: Map<number, Governor[]>): void {
  for (const s of state.seats) {
    const was = rosters.get(s.seat);
    if (!was) continue;
    const roster = governorsOf(s);
    roster.forEach((g, i) => {
      const w = was[i];
      if (!w.appointed && g.appointed) { roster[i] = w; return; }
      g.promotions = w.promotions;
      const moved = (g.cityId >= 0 || g.minorId >= 0) && (g.cityId !== w.cityId || g.minorId !== w.minorId);
      if (!moved) return;
      g.cityId = w.cityId;
      g.minorId = w.minorId;
      g.establishTurns = w.cityId >= 0 || w.minorId >= 0 ? Math.max(0, w.establishTurns - 1) : 0;
    });
  }
}

/** THE FORTIFY ORDER is its player's decision: a unit digs in only while it
 *  holds the order, never by standing (runs/h1_duelw1117: 41 barbarian
 *  Scouts and 6 city-state Warriors stood a turn with every move unspent and
 *  stayed at 0; every unit that dug in spent its moves on the order). A unit
 *  record t+1 holds undug gave no order, so the engine's dig-in for standing
 *  does not land on it. */
function fortifyOrders(ctx: Ctx, b: TurnRecord): void {
  for (const r of b.units) {
    const u = unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u || num(r.fortify) > 0 || !(u.fortifyTurns ?? 0)) continue;
    u.fortifyTurns = 0;
    count(ctx, 'fortify', 'applied');
  }
}

/** every unit the replay knows stands where record t+1 shows it, with the
 *  moves it has left and its charges; the record's units the engine never
 *  made stay missing (a production difference); `only` a player's alone */
function syncUnits(ctx: Ctx, b: TurnRecord, only?: number): void {
  for (const r of b.units) {
    if (only !== undefined && r.owner !== only) continue;
    const u = unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u) continue;
    const at = r.y * ctx.W + r.x;
    if (u.tileIndex !== at) {
      count(ctx, 'move', 'applied');
      // a unit that moved spent its moves and holds no fortification
      // (runs/h1_duelw1117 t3: the barbarian Scout that walked to (12,10)
      // took 38 from China's... city-state Warrior at +10, unfortified)
      u.fortifyTurns = 0;
      // the unit sees from every plot the log's steps entered, and from where
      // it stopped
      for (const p of [...(ctx.paths.get(`${r.owner}:${r.id}`) ?? []), at]) {
        revealAround(ctx.state, u.seat, p, unitSight(u, ctx.state), { seeThrough: unitSeesThrough(u) });
      }
    }
    u.tileIndex = at;
    u.movesLeft = num(r.moves) * MP_SCALE;
    u.embarked = bool(r.embarked) || undefined;
    if (UNITS[u.type]?.charges !== undefined) u.charges = num(r.buildCharges) || num(r.spreadCharges) || u.charges;
  }
}

/** THE DRAWS the engine does not take on the game's sites, re-synced to the
 *  record's results — the random events' soil — and the barbarians' camps
 *  against the record's: whether they held, before the record's stand */
function syncDraws(ctx: Ctx, b: TurnRecord, tribesBefore: number): boolean {
  const { state } = ctx;
  // the random events' soil: which plots a flood, an eruption, a fire or a
  // drought struck and what each laid (the importer's reading of the
  // records' events), in place of the engine's own events' draws
  let soil = 0;
  for (const t of state.map.tiles) {
    const r = ctx.next.state.map.tiles[t.index];
    if (t.fertility === r.fertility && t.fertilityProd === r.fertilityProd && (t.fertilitySci ?? 0) === (r.fertilitySci ?? 0)
      && (t.fertilityCul ?? 0) === (r.fertilityCul ?? 0) && t.droughtTurns === r.droughtTurns) continue;
    t.fertility = r.fertility;
    t.fertilityProd = r.fertilityProd;
    t.fertilitySci = r.fertilitySci;
    t.fertilityCul = r.fertilityCul;
    t.droughtTurns = r.droughtTurns;
    soil++;
  }
  // a fire's ground: a feature burning or burnt on one side and not the other
  for (const t of state.map.tiles) {
    const r = ctx.next.state.map.tiles[t.index];
    if (t.feature === r.feature || (!fireFeature(t.feature) && !fireFeature(r.feature))) continue;
    t.feature = r.feature;
    soil++;
  }
  if (soil) count(ctx, 'draw:eventSoil', 'fallback');
  // the barbarians' camps: the engine's camp step against the record's
  // camps; where they differ the record's stand, each with its tribe (a
  // camp the engine raised that the game did not is unmade, its tribe with
  // it; a camp the game raised that the engine did not takes a tribe of the
  // engine's kind for its plot, named by the first name free)
  const camps = ctx.next.state.barbSeat.camps;
  const campsHeld = [...state.barbSeat.camps].sort().join() === [...camps].sort().join();
  if (TRACE.has('barb')) {
    console.error(`t${traceTurn} camps engine [${state.barbSeat.camps}] game [${camps}] tribes ${JSON.stringify(state.barbTribes ?? [])}`);
    const W = ctx.W;
    const mine = state.units.filter((u) => isBarbSeat(u.seat)).map((u) => `${u.id}:${u.type}@${u.tileIndex}`);
    const game = b.units.filter((u) => seatOfP(ctx, u.owner) === BARB_SEAT).map((u) => `${u.id}:${engineRowOf(ctx.cat, 'unit', u.type)}@${u.y * W + u.x}`);
    console.error(`   units engine ${mine.join(' ')}\n   units game   ${game.join(' ')}`);
  }
  if (!campsHeld) {
    const tribes = state.barbTribes ?? [];
    for (const c of [...state.barbSeat.camps]) {
      if (camps.includes(c)) continue;
      state.barbSeat.camps.splice(state.barbSeat.camps.indexOf(c), 1);
      const k = tribes.findIndex((tr) => tr.plot === c && tr.alive);
      if (k >= tribesBefore) tribes.splice(k, 1);
      else if (k >= 0) tribes[k].alive = false;
    }
    for (const c of camps) {
      if (state.barbSeat.camps.includes(c)) continue;
      const kind = tribeKindAt(state, c).kind;
      const taken = new Set(tribes.filter((tr) => tr.kind === kind).map((tr) => tr.name));
      let name = 0;
      while (taken.has(name)) name++;
      // the game's tribe took its turn the turn it rose
      foundTribe(state, c, name).spawnTurns = 1;
    }
    for (const u of state.units) if (isBarbSeat(u.seat)) adoptByTribe(state, u);
    count(ctx, 'draw:camps', 'fallback');
  }
  return campsHeld;
}

/** the plots whose improvement the engine's own city-state, Free City or
 *  barbarian scripts changed in the turn take the record's: their builders'
 *  and raiders' decisions */
function undoMinorPlots(ctx: Ctx, before: (string | null)[]): void {
  const { state, next } = ctx;
  for (const t of state.map.tiles) {
    if ((t.improvement ?? null) === before[t.index]) continue;
    if (t.ownerSeat >= 0 && t.ownerSeat < state.seats.length) continue;
    t.improvement = next.state.map.tiles[t.index].improvement;
    count(ctx, 'minorAi:improve', 'fallback', ctx.playerOfSeat.get(t.ownerSeat));
  }
}

/** THE DEDICATIONS are each player's pick at its age's start, which the
 *  engines' own round robin stands in for: each seat holds the ones record
 *  t+1 shows (runs/h1_duelw1117 Rome's Dark Age from t31 holds none, where the
 *  round robin's paid +1 on a boost at t35) */
function syncDedications(ctx: Ctx): void {
  ctx.state.seats.forEach((s, seat) => {
    const want = seatOf(ctx.next.state, seat)?.dedicationPicks ?? [];
    if ((s.dedicationPicks ?? []).join() === want.join()) return;
    s.dedicationPicks = [...want];
    s.dedications = want.length;
    count(ctx, 'dedications', 'fallback', ctx.playerOfSeat.get(seat));
  });
}

/** THE PILLAGES AND REPAIRS: a pillage is a unit's action (the barbarians'
 *  and the players' alike), which the record's units carry, and so is a
 *  Builder's repair: each improvement standing on both sides takes record
 *  t+1's pillaged state */
function syncPillage(ctx: Ctx): void {
  const { state, next } = ctx;
  for (const t of state.map.tiles) {
    const r = next.state.map.tiles[t.index];
    if (!t.improvement || t.improvement !== r.improvement || !!t.pillaged === !!r.pillaged) continue;
    t.pillaged = !!r.pillaged;
    count(ctx, r.pillaged ? 'pillage' : 'repair', 'fallback', ctx.playerOfSeat.get(t.ownerSeat));
  }
}

// ---------------------------------------------------------------- comparison

/** one subsystem's comparison on one turn */
export interface SubTally {
  n: number;
  fail: number;
  /** reader failures the per-turn harness passes on the imported record */
  drift?: number;
  worst?: { subject: string; game: unknown; ours: unknown; gap: number };
}

type Tallies = Record<string, SubTally>;

function note(t: Tallies, sub: string, ok: boolean, subject: string, game: unknown, ours: unknown, gap = ok ? 0 : 1): void {
  const x = t[sub] ?? (t[sub] = { n: 0, fail: 0 });
  x.n += 1;
  if (ok) return;
  if (TRACE.has(sub)) console.error(`t${traceTurn} ${sub} ${subject} game=${JSON.stringify(game)} ours=${JSON.stringify(ours)}`);
  x.fail += 1;
  if (!x.worst || gap > x.worst.gap) x.worst = { subject, game, ours, gap };
}

/** a value holds only where it IS the game's: within half the game's 1/256 step
 *  (its 24.8 fixed point), never a looser tolerance — sub-step drift
 *  compounds in a free-running replay */
const EXACT = 1 / 512;
const near = (a: number, b: number) => Math.abs(a - b) <= EXACT;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const setOf = (xs: readonly (string | null)[]) => xs.filter((x) => x !== null).sort().join(',');

/** the engine's state against the importer's reading of record t+1 */
export function compareState(state: GameState, read: Imported): Tallies {
  const t: Tallies = {};
  const rs = read.state;
  const plotsOf = (st: GameState, c: City) => st.map.tiles.filter((x) => x.ownerSeat === c.seat && x.ownerCity === c.id).map((x) => x.index);
  for (const [rc, dump] of read.dumpOfCity) {
    const name = `city ${dump.owner}:${dump.id} ${dump.name.replace('LOC_CITY_NAME_', '')}`;
    const ec = cityAt(state, rc.centerIndex);
    note(t, 'city.exists', !!ec && ec.seat === rc.seat, name, rc.seat, ec?.seat ?? null);
    if (!ec || ec.seat !== rc.seat) continue;
    note(t, 'city.pop', ec.population === rc.population, name, rc.population, ec.population, Math.abs(ec.population - rc.population));
    note(t, 'city.food', near(ec.foodBox, rc.foodBox), name, r3(rc.foodBox), r3(ec.foodBox), Math.abs(ec.foodBox - rc.foodBox));
    note(t, 'city.culture', near(ec.cultureBox, rc.cultureBox), name, r3(rc.cultureBox), r3(ec.cultureBox), Math.abs(ec.cultureBox - rc.cultureBox));
    const ep = plotsOf(state, ec);
    const rp = plotsOf(rs, rc);
    note(t, 'city.plots', ep.join() === rp.join(), name, rp.length, ep.length, Math.abs(ep.length - rp.length) + (ep.join() === rp.join() ? 0 : 0.5));
    note(t, 'city.loyalty', near(ec.loyalty ?? 100, rc.loyalty ?? 100), name, r3(rc.loyalty ?? 100), r3(ec.loyalty ?? 100),
      Math.abs((ec.loyalty ?? 100) - (rc.loyalty ?? 100)));
    note(t, 'city.buildings', setOf(ec.buildings) === setOf(rc.buildings), name,
      rc.buildings.filter((b) => !ec.buildings.includes(b)), ec.buildings.filter((b) => !rc.buildings.includes(b)));
    const ds = (st: GameState, c: City) => setOf(c.districts.map((d) => `${d.type}@${d.tileIndex}${st.map.tiles[d.tileIndex].districtComplete || d.type === 'CITY_CENTER' ? '' : '*'}`));
    note(t, 'city.districts', ds(state, ec) === ds(rs, rc), name, ds(rs, rc), ds(state, ec));
    const eh = ec.queue[0];
    const rh = rc.queue[0];
    if (rh || eh) {
      const same = !!eh && !!rh && itemKey(eh) === itemKey(rh);
      // the record's progress is the game's 24.8 value truncated to whole
      // points (every recorded `queueProgress` is whole; runs/h1_duelw1117
      // Xi'an t19 a Settler at 0.80078125 overflow + 10.80078125 reads 11)
      const ok = same && (!read.queueProgressRead || Math.floor(eh.progress + 1e-9) === rh.progress);
      note(t, 'city.production', ok, name, rh ? `${itemKey(rh)} ${r3(rh.progress)}` : null, eh ? `${itemKey(eh)} ${r3(eh.progress)}` : null,
        same ? Math.abs(eh.progress - rh.progress) : 1000);
    }
    const ep2 = ec.religionPressure ?? [];
    const rp2 = rc.religionPressure ?? [];
    const gap = Math.max(0, ...rp2.map((v, i) => Math.abs((ep2[i] ?? 0) - v)), ...ep2.map((v, i) => Math.abs((rp2[i] ?? 0) - v)));
    if (rp2.some((v) => v > 0) || ep2.some((v) => v > 0)) note(t, 'city.pressure', gap <= EXACT, name, rp2.map(r3), ep2.map(r3), gap);
  }
  for (const [rcs, dump] of read.dumpOfMinor) {
    const name = `minor ${dump.owner} ${dump.name.replace('LOC_CITY_NAME_', '')}`;
    const ecs = state.cityStates.find((c) => c.centerIndex === rcs.centerIndex);
    note(t, 'minor.exists', !!ecs, name, rcs.centerIndex, ecs?.centerIndex ?? null);
    if (!ecs) continue;
    note(t, 'minor.pop', ecs.population === rcs.population, name, rcs.population, ecs.population, Math.abs(ecs.population - rcs.population));
    note(t, 'minor.food', near(ecs.foodBox ?? 0, rcs.foodBox ?? 0), name, r3(rcs.foodBox ?? 0), r3(ecs.foodBox ?? 0),
      Math.abs((ecs.foodBox ?? 0) - (rcs.foodBox ?? 0)));
    note(t, 'minor.culture', near(ecs.cultureBox ?? 0, rcs.cultureBox ?? 0), name, r3(rcs.cultureBox ?? 0), r3(ecs.cultureBox ?? 0),
      Math.abs((ecs.cultureBox ?? 0) - (rcs.cultureBox ?? 0)));
  }
  rs.seats.forEach((rsx, seat) => {
    const es = state.seats[seat];
    const name = `seat ${read.playerOfSeat.get(seat)} ${rsx.name}`;
    note(t, 'seat.gold', near(es.treasury ?? 0, rsx.treasury ?? 0), name, r3(rsx.treasury ?? 0), r3(es.treasury ?? 0),
      Math.abs((es.treasury ?? 0) - (rsx.treasury ?? 0)));
    note(t, 'seat.faith', near(es.faith ?? 0, rsx.faith ?? 0), name, r3(rsx.faith ?? 0), r3(es.faith ?? 0), Math.abs((es.faith ?? 0) - (rsx.faith ?? 0)));
    note(t, 'seat.techs', setOf(es.research.techs) === setOf(rsx.research.techs), name,
      rsx.research.techs.filter((x) => !es.research.techs.includes(x)), es.research.techs.filter((x) => !rsx.research.techs.includes(x)));
    note(t, 'seat.civics', setOf(es.research.civics) === setOf(rsx.research.civics), name,
      rsx.research.civics.filter((x) => !es.research.civics.includes(x)), es.research.civics.filter((x) => !rsx.research.civics.includes(x)));
    note(t, 'seat.boosts', setOf(es.research.boosted) === setOf(rsx.research.boosted), name,
      rsx.research.boosted.filter((x) => !es.research.boosted.includes(x)), es.research.boosted.filter((x) => !rsx.research.boosted.includes(x)));
    if (rsx.research.tech) {
      const same = es.research.tech === rsx.research.tech;
      note(t, 'seat.science', same && near(es.research.techProgress, rsx.research.techProgress), name,
        `${rsx.research.tech} ${r3(rsx.research.techProgress)}`, `${es.research.tech} ${r3(es.research.techProgress)}`,
        same ? Math.abs(es.research.techProgress - rsx.research.techProgress) : 1000);
    }
    if (rsx.research.civic) {
      const same = es.research.civic === rsx.research.civic;
      note(t, 'seat.culture', same && near(es.research.civicProgress, rsx.research.civicProgress), name,
        `${rsx.research.civic} ${r3(rsx.research.civicProgress)}`, `${es.research.civic} ${r3(es.research.civicProgress)}`,
        same ? Math.abs(es.research.civicProgress - rsx.research.civicProgress) : 1000);
    }
    note(t, 'seat.eraScore', (es.eraScore ?? 0) === (rsx.eraScore ?? 0), name, rsx.eraScore ?? 0, es.eraScore ?? 0,
      Math.abs((es.eraScore ?? 0) - (rsx.eraScore ?? 0)));
    note(t, 'seat.favor', near(es.diplomaticFavor ?? 0, rsx.diplomaticFavor ?? 0), name, rsx.diplomaticFavor ?? 0, r3(es.diplomaticFavor ?? 0),
      Math.abs((es.diplomaticFavor ?? 0) - (rsx.diplomaticFavor ?? 0)));
    note(t, 'seat.government', es.government.chosen === rsx.government.chosen
      && setOf(es.government.policies) === setOf(rsx.government.policies), name,
    [rsx.government.chosen, ...rsx.government.policies], [es.government.chosen, ...es.government.policies]);
  });
  // units: each seat's roster, by type
  const roster = (st: GameState) => {
    const m = new Map<number, string[]>();
    for (const u of st.units) {
      if (!m.has(u.seat)) m.set(u.seat, []);
      m.get(u.seat)!.push(u.type);
    }
    return m;
  };
  const er = roster(state);
  for (const [seat, types] of roster(rs)) {
    const mine = er.get(seat) ?? [];
    const missing = types.filter((x, i) => types.indexOf(x) === i).flatMap((x) => {
      const d = types.filter((y) => y === x).length - mine.filter((y) => y === x).length;
      return d !== 0 ? [`${x}${d > 0 ? '-' : '+'}${Math.abs(d)}`] : [];
    });
    const extra = mine.filter((x) => !types.includes(x)).map((x) => `${x}+`);
    note(t, 'units.roster', missing.length + extra.length === 0, `seat ${seat}`, types.length, [mine.length, ...missing, ...extra],
      missing.length + extra.length);
  }
  // plots
  for (const rt of rs.map.tiles) {
    const et = state.map.tiles[rt.index];
    const name = `plot ${rt.index} (${rt.col},${rt.row})`;
    note(t, 'plots.owner', et.ownerSeat === rt.ownerSeat, name, rt.ownerSeat, et.ownerSeat);
    note(t, 'plots.improvement', (et.improvement ?? null) === (rt.improvement ?? null) && !!et.pillaged === !!rt.pillaged, name,
      rt.improvement, et.improvement);
    note(t, 'plots.feature', (et.feature ?? null) === (rt.feature ?? null), name, rt.feature, et.feature);
    note(t, 'plots.resource', (et.resource ?? null) === (rt.resource ?? null), name, rt.resource, et.resource);
  }
  return t;
}

/** each mapped unit's health against record t+1 */
function compareUnits(ctx: Ctx, b: TurnRecord, t: Tallies): void {
  for (const r of b.units) {
    const u = unitOf(ctx, `${r.owner}:${r.id}`);
    if (!u) continue;
    const hp = UNIT_HP - num(r.damage);
    note(t, 'units.health', u.hp === hp, `unit ${r.owner}:${r.id} ${u.type}`, hp, u.hp, Math.abs(u.hp - hp));
  }
}

/** the per-turn harness's state checks asked of the engine's state: the
 *  record t+1 importer's reading with the engine's state in its place */
function engineAsImported(state: GameState, read: Imported): Imported {
  const dumpOfCity = new Map<City, DumpCity>();
  const cityByKey = new Map<string, City>();
  for (const [rc, dump] of read.dumpOfCity) {
    const ec = cityAt(state, rc.centerIndex);
    if (!ec || ec.seat !== rc.seat) continue;
    dumpOfCity.set(ec, dump);
    cityByKey.set(`${dump.owner}:${dump.id}`, ec);
  }
  const congress = state.congress ?? [];
  return { ...read, state, dumpOfCity, cityByKey, routes: [], congressOf: () => congress };
}

function readerTallies(mine: CheckResult[], base: CheckResult[], t: Tallies): void {
  const baseOk = new Map(base.map((r) => [`${r.check}|${r.subject}`, r.skip ? null : r.ok]));
  for (const r of mine) {
    if (r.skip) continue;
    const sub = `read.${r.check}`;
    note(t, sub, r.ok, r.subject, r.game, r.ours, r.ok ? 0 : 1);
    if (!r.ok && baseOk.get(`${r.check}|${r.subject}`) === true) t[sub].drift = (t[sub].drift ?? 0) + 1;
  }
}

// ---------------------------------------------------------------- the driver

export interface ReplayTurn {
  turn: number;
  subsystems: Tallies;
  /** the decisions that fell back or were refused, by kind */
  fallbacks: Record<string, number>;
  /** the recorded outcomes the replay imposed on the pair (every fallback),
   *  by kind */
  imposed: Record<string, number>;
  /** the generator was re-seeded from the record's witness */
  reseeded: boolean;
}

const ALL_SUBSYSTEMS = '*';
const UNITS_SUBS = ['units.health', 'units.roster'];
const PLOT_SUBS = ['plots.improvement', 'plots.feature', 'plots.resource', 'read.plot.yields'];
/** THE SUBSYSTEMS AN IMPOSED OUTCOME TOUCHES, by kind (the part before the
 *  first `:`, else the whole kind): a kind not named reaches every one —
 *  a seat's purse, research, government, or a city's state flows into all */
const IMPOSES_ON: Record<string, readonly string[]> = {
  combat: UNITS_SUBS, hit: UNITS_SUBS, kill: UNITS_SUBS, unitGone: UNITS_SUBS, unitNew: UNITS_SUBS, upgrade: UNITS_SUBS,
  promote: UNITS_SUBS, 'minorAi:unit': UNITS_SUBS, 'minorAi:unitNew': UNITS_SUBS,
  'minorAi:improve': PLOT_SUBS, pillage: PLOT_SUBS, repair: PLOT_SUBS, improve: PLOT_SUBS, clear: PLOT_SUBS,
  'draw:eventSoil': ['plots.feature', 'read.plot.yields'],
  'draw:camps': ['plots.improvement', 'barb.camps'],
  'barb:unit': UNITS_SUBS, 'barb:unitNew': UNITS_SUBS,
  'draw:floodRiver': [...UNITS_SUBS, 'plots.feature', 'read.plot.yields'],
  // a village paid as the record paid it: its Gold, Faith, boosts, citizen,
  // the unit's price climb, its moment and the hut's plot
  village: ['seat.gold', 'seat.faith', 'seat.boosts', 'seat.science', 'seat.culture', 'seat.techs', 'seat.civics',
    'seat.eraScore', 'city.pop', 'city.food', 'city.pressure', 'plots.improvement', 'read.buy.unitCost', 'read.buy.unitGold'],
};

function imposesOn(kind: string, sub: string): boolean {
  const on = IMPOSES_ON[kind] ?? IMPOSES_ON[kind.split(':')[0]] ?? [ALL_SUBSYSTEMS];
  return on.includes(ALL_SUBSYSTEMS) || on.includes(sub);
}

export interface Divergence {
  turn: number;
  subject: string;
  game: unknown;
  ours: unknown;
  gap: number;
  /** the per-turn harness's step check on the same subject and pair, where
   *  one reads the subsystem: pass, fail or its skip reason */
  perTurn?: string;
  /** the fallbacks the subject's player took on this pair */
  fallbacks?: string[];
  /** the checks the per-turn harness fails on the subject on the records so
   *  far: a rule the imported record reads wrong as well */
  perTurnFails?: string[];
}

export interface ReplayReport {
  dump: string;
  source: string;
  turns: number[];
  /** per subsystem: turns held exactly from the first pair, turns matched in
   *  all, turns compared, and the first divergence; the first pair on which
   *  the replay imposed a recorded outcome touching it (`IMPOSES_ON`), and
   *  the turns held from the first pair before it — the engine's own */
  subsystems: Record<string, { held: number; matched: number; compared: number; first?: Divergence;
    imposedFrom?: number; clean: number }>;
  /** the pairs from the first on which every subsystem held with nothing
   *  imposed on it */
  cleanEvery: number;
  /** per decision kind: how many applied through the engine's verbs, fell
   *  back to the recorded outcome, or were refused */
  decisions: Record<string, Record<Outcome, number>>;
  /** the recorded events no reader takes, by event name */
  unread: Record<string, number>;
  /** per decision kind the event log settles: the log's decisions, the
   *  inference's, and how many of the log's the inference named alike */
  settled: Record<string, LogTally>;
  perTurn: ReplayTurn[];
  /** where the replay stopped short of the last record, and why */
  stopped?: string;
  /** why the engine refused the decisions it refused, by kind and reason */
  refusals: Record<string, Record<string, number>>;
}

/** the per-turn step check that reads each state subsystem */
const STEP_OF: Record<string, string> = {
  'city.pop': 'step.growth', 'city.food': 'step.growth', 'city.culture': 'step.border', 'city.plots': 'step.border',
  'city.loyalty': 'step.loyalty', 'city.pressure': 'step.pressure', 'seat.eraScore': 'step.eraScore',
};

function loadRecords(dumpPath: string, from: number, to: number): { cat: Catalog; recs: TurnRecord[] } {
  const cat = loadCatalog(dumpPath);
  const byTurn = new Map<number, TurnRecord>();
  for (const line of readFileSync(dumpPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as TurnRecord;
    if (rec.moved || rec.turn < from || rec.turn > to) continue;
    byTurn.set(rec.turn, rec);
  }
  return { cat, recs: [...byTurn.keys()].sort((a, b) => a - b).map((t) => byTurn.get(t)!) };
}

/** the seed the record's witness holds for the first major's start of turn */
function turnSeed(rec: TurnRecord): number | undefined {
  const first = Math.min(...rec.players.filter((p) => bool(p.major)).map((p) => p.id));
  const w = (rec.witness ?? []).find((x) => x.turn === rec.turn && x.player === first && x.point === 'pre');
  const s = num(w?.seed);
  return Number.isFinite(s) ? s >>> 0 : undefined;
}

export function runReplay(dumpPath: string, opts: { from?: number; to?: number; source?: ActionSource;
  /** called after each pair is compared, with the engine state and record t+1 */
  onPair?: (state: GameState, b: TurnRecord, decisions: Decision[]) => void } = {}): ReplayReport {
  const { cat, recs } = loadRecords(dumpPath, opts.from ?? -Infinity, opts.to ?? Infinity);
  const source = opts.source ?? (recs.some((r) => Array.isArray((r as { actions?: unknown }).actions)) ? new RecordedActions() : new InferredActions());
  const history: History = newHistory();
  // the game's own draw log, where the recording kept it
  const logPath = randLogPath(dumpPath);
  if (logPath) {
    history.randLog = loadRandLog(logPath, recs.flatMap((r) => (r.witness ?? []).flatMap((w) => (typeof w.seed === 'number' ? [w.seed] : []))));
  }
  history.replay = replayEvents(recs, cat, history.randLog);
  const report: ReplayReport = { dump: dumpPath, source: source.constructor.name, turns: [], subsystems: {}, cleanEvery: 0, decisions: {}, unread: {}, settled: {}, perTurn: [], refusals: {} };
  if (recs.length < 2) return report;
  advanceHistory(history, recs[0], cat);
  const first = importTurn(recs[0], cat, history);
  const stream = streamHold(first.state, recs, first.playerOfSeat, history);
  holdRng(stream);
  holdMinorItem(minorItems(recs, cat));
  // a city-state's army moves and fights as the record's moves and battles
  // say (`syncUnits`, `battle`): the engine's walk for it is its AI's
  holdMinorWalk(true);
  const state = first.state;
  // the record holds no plot's revealed state: each seat starts on what its
  // own plots, cities and units reveal (`initFog`), which its moments read
  initFog(state);
  seedMoments(state, first, history);
  const ctx: Ctx = {
    state, cat, W: recs[0].head.W, seatOfPlayer: first.seatOfPlayer, playerOfSeat: first.playerOfSeat,
    units: new Map(), retained: new Map(), pendingMinors: new Map(), next: first, tally: new Map(), fellBack: new Map(), imposed: new Map(), reasons: new Map(),
    engineKilled: new Set(), paths: new Map(), envoys: [], battled: new Set(), barbNew: [], lateEnvoys: [], log: history.randLog,
  };
  // the record's units in the importer's order
  let k = 0;
  for (const u of recs[0].units) {
    if (!first.seatOfPlayer.has(u.owner) || !engineRowOf(cat, 'unit', u.type)) continue;
    ctx.units.set(`${u.owner}:${u.id}`, state.units[k++]);
  }
  for (const [pid, cs] of first.minorOfPlayer) {
    if (cs.centerIndex >= 0) continue;
    ctx.pendingMinors.set(pid, cs);
  }
  const held = new Map<string, number>();
  const broken = new Set<string>();
  // every check the per-turn harness fails, by subject, on the records so far
  const baseFails = new Map<string, Set<string>>();
  let prev: TurnRecord | undefined;
  for (let i = 0; i + 1 < recs.length; i++) {
    const a = recs[i];
    const b = recs[i + 1];
    if (b.turn !== a.turn + 1) {
      report.stopped = `no record of turn ${a.turn + 1}`;
      break;
    }
    if (state.turn !== a.turn) {
      report.stopped = `engine at turn ${state.turn}, record at ${a.turn}`;
      break;
    }
    const baseStep = transitionChecks(a, b, cat, history, prev);
    advanceHistory(history, b, cat);
    const read = importTurn(b, cat, history);
    ctx.next = read;
    ctx.fellBack = new Map();
    ctx.imposed = new Map();
    ctx.battled = new Set();
    ctx.paths = new Map();
    ctx.barbNew = [];
    ctx.lateEnvoys = [];
    traceTurn = b.turn;
    const ds = source.decisions(a, b, cat);
    stream.actions(a.turn);
    applyPhase(ctx, ds, 'before', b, a);
    // the active player's units stand where its actions left them before its
    // next start (`endTurn`'s seat phase): its moves reveal, and meet, there
    syncUnits(ctx, b, activePlayer(a));
    const envoysWere = stageEnvoys(ctx, ds, a, b, history.randLog);
    const staged = stagePolicies(ctx, ds);
    // the generator: held at each witnessed point (`streamHold`)
    const seed = turnSeed(b);
    const standing = new Set(state.units);
    const improvements = state.map.tiles.map((x) => x.improvement ?? null);
    // what each unit did in its player's actions of the turn, which the
    // turn's heal and fortification read: one that stood on its plot and
    // fought nobody rested, any other spent its moves. A record's moves do
    // not tell (runs/h1_duelw1118 China's Warrior reads 0 moves fortified,
    // healing +10 at t7 and t8; 1116 Auckland's reads 2). A major's units take
    // their moves at its seat phase and spend them in its own orders, which
    // the record's moves stand in for outside the turn: a unit that spent its
    // moves keeps none of the turn's rest heal (runs/h1_duelw1118 China's
    // Warrior moved at t5 and read 38 at t6, unhealed)
    // a unit struck in another player's turn spent nothing of its own: only
    // the blows it dealt count (runs/h1_duelw1118 t8: a city-state's Warrior
    // that stood its turn, then took a barbarian Spearman's attack, held the
    // turn's fortification against it)
    const struckOnly = new Set(ds.flatMap((d) => (d.kind === 'battle' ? [d.defender] : [])));
    const fought = new Set(ds.flatMap((d) => (d.kind === 'combat' && !struckOnly.has(d.unit) ? [d.unit] : d.kind === 'battle' ? [d.attacker] : [])));
    const was = new Map(a.units.map((u) => [`${u.owner}:${u.id}`, u.y * ctx.W + u.x]));
    // where the record carries its log, a unit walked when the log names its
    // steps — a unit pushed off its plot (`UnitTeleported`) spent nothing
    // (runs/h1_duelw1118 Rome's Warrior, displaced at t17, healed 8)
    const logged = Array.isArray((b as { actions?: unknown }).actions);
    const walked = new Set(ds.flatMap((d) => (d.kind === 'move' && d.path ? [d.unit] : [])));
    const spent = new Map<Unit, number>();
    const struckHp = new Map<Unit, number>();
    // a barbarian unit's rest: whether it stood the turn through and struck
    // no blow
    const barbRest = new Map<Unit, boolean>();
    const struck = new Set(ds.flatMap((d) => (d.kind === 'battle' ? [d.attacker] : [])));
    for (const r of b.units) {
      const key = `${r.owner}:${r.id}`;
      const u = unitOf(ctx, key);
      if (!u) continue;
      const stood = logged ? !walked.has(key) : was.get(key) === r.y * ctx.W + r.x;
      const rested = stood && !fought.has(key);
      u.movesLeft = rested ? grantedMoves(state, u) : 0;
      if (!rested) spent.set(u, u.hp);
      else if (struckOnly.has(key)) struckHp.set(u, u.hp);
      if (isBarbSeat(u.seat)) barbRest.set(u, stood && !struck.has(key) && num(r.fortify) > 0);
    }
    // THE BARBARIANS' TURN closes the pair (`barbarianTurn`), after the
    // other players' actions; their units' moves and battles are the
    // record's (`syncUnits`, `battle`), so they sit the engine's turn out
    // (`holdBarbarians`): the engine's AI would fight battles the record
    // never fought (runs/h1_duelw1117 t11: a Warrior China's engine killed that
    // the game's lived to t12). The city-states' units stay: their script's
    // draws are on the turn's stream before the random events
    // (runs/h1_duelw1118 t7: without them a flood's draw took a citizen of
    // Rome the game's spared)
    const barbs: Unit[] = [];
    holdBarbarians((st) => {
      barbs.push(...st.units.filter((u) => isBarbSeat(u.seat)));
      st.units = st.units.filter((u) => !isBarbSeat(u.seat));
    });
    const tribesBefore = state.barbTribes?.length ?? 0;
    // A CITY-STATE'S BUILDERS lay what its AI picks, which the record's
    // improvements carry (`improve`): the engine's own pick sits the turn out,
    // its charges kept (runs/h1_duelw1115 Yerevan's Builder: the engine's
    // pick spent its last charge at t8, the game's held it to t9)
    const minorBuilders = state.units.filter((u) => isCityStateSeat(u.seat) && u.type === 'BUILDER' && (u.charges ?? 0) > 0)
      .map((u) => [u, u.charges] as const);
    for (const [u] of minorBuilders) u.charges = 0;
    // A PANTHEON is its player's decision (`pantheon`), which the game's AI
    // takes when it will, not on the first turn its faith covers the price
    // (runs/h1_duelw1118 China: 12 Faith at t28, founded at t29): the
    // engine's own race finds none open in the turn
    const claimed = state.claimedPantheons;
    state.claimedPantheons = Object.keys(PANTHEONS);
    const rosters = new Map(state.seats.map((s) => [s.seat, structuredClone(governorsOf(s))]));
    stream.actions(null);
    try {
      endTurn(state);
    } catch (e) {
      report.stopped = `endTurn threw at turn ${a.turn}: ${(e as Error).message}`;
      break;
    } finally {
      state.claimedPantheons = claimed;
    }
    undoGovernorScript(state, rosters);
    stream.actions(a.turn);
    for (const [u, hp] of spent) if (u.hp > hp) u.hp = hp;
    // a rested unit struck in a later player's turn heals at its own next
    // turn's start, after the blow (runs/h1_duelw1118 t8: a city-state's
    // Warrior 23 damaged, fortified, took the barbarians' two attacks at 77
    // health and read +10 after them)
    const heals = new Map<Unit, number>();
    for (const [u, hp] of struckHp) {
      if (u.hp > hp) heals.set(u, u.hp - hp);
      u.hp = Math.min(u.hp, hp);
    }
    state.units.push(...barbs);
    for (const [u, charges] of minorBuilders) u.charges = charges;
    verifyPolicies(ctx, staged);
    verifyEnvoys(ctx, envoysWere);
    matchNewUnits(ctx, b);
    // a unit the engine's own city-state, Free City or barbarian scripts made
    // that the record's players did not: their decision, undone
    const mapped = new Set(ctx.units.values());
    for (const u of [...state.units]) {
      if (standing.has(u) || mapped.has(u) || u.seat < state.seats.length) continue;
      disbandUnit(state, u.id);
      count(ctx, isBarbSeat(u.seat) ? 'barb:unit' : 'minorAi:unit', 'fallback', ctx.playerOfSeat.get(u.seat));
    }
    undoMinorPlots(ctx, improvements);
    // the record's units the engine's own turn destroyed: a kill the log
    // names on one of them was the engine's to pay, and it paid it
    const live = new Set(state.units);
    ctx.engineKilled = new Set([...ctx.units].filter(([, u]) => !live.has(u)).map(([k]) => k));
    fortifyOrders(ctx, b);
    applyPhase(ctx, ds, 'after', b, b);
    for (const [u, heal] of heals) if (state.units.includes(u)) u.hp = Math.min(UNIT_HP, u.hp + heal);
    syncUnits(ctx, b);
    barbarianTurn(ctx, b, a.turn);
    // the units the barbarians raised stand where the record holds them
    syncUnits(ctx, b);
    settleEnvoys(ctx, b);
    // the barbarians' units sat the engine's turn out, so their rest — the
    // fortification a unit holding the Fortify order digs in (`fortifyOrders`)
    // — is the engine's own step, run here where their turn closes the log's.
    // Being attacked spends nothing (runs/h1_duelw1117 t4: the camp's
    // Spearman, struck at t4, still two turns dug in at t5, took 21 from a
    // city-state's Warrior at -4)
    for (const [u, stood] of barbRest) {
      if (state.units.includes(u)) restUnit(state, u, stood);
    }
    const campsHeld = syncDraws(ctx, b, tribesBefore);
    syncPillage(ctx);
    syncDedications(ctx);
    // the decisions landed after the engine's turn are the other players'
    // actions within their own turns: the boosts those earn land there
    // (`detectBoosts` at the seat block's end)
    for (const s of state.seats) if (s.cities.length) detectBoosts(state, s.seat);
    // ...and the once moments they hold (a natural wonder a unit's steps
    // revealed: runs/h1_duelw1117 Rome t12), which the engine's turn records
    // after every seat's actions
    recordMoments(state);
    killBoosts(ctx, read);
    const t = compareState(state, read);
    compareUnits(ctx, b, t);
    note(t, 'barb.camps', campsHeld, 'camps', ctx.next.state.barbSeat.camps.length, state.barbSeat.camps.length);
    const base = stateChecks(b, cat, read);
    for (const r of [...baseStep, ...base]) {
      if (r.ok || r.skip) continue;
      if (!baseFails.has(r.subject)) baseFails.set(r.subject, new Set());
      baseFails.get(r.subject)!.add(r.check);
    }
    let mine: CheckResult[] = [];
    try {
      mine = stateChecks(b, cat, engineAsImported(state, read));
    } catch (e) {
      note(t, 'read.threw', false, (e as Error).message, null, null);
    }
    readerTallies(mine, base, t);
    opts.onPair?.(state, b, ds);
    const fallbacks: Record<string, number> = {};
    for (const xs of ctx.fellBack.values()) for (const x of xs) fallbacks[x] = (fallbacks[x] ?? 0) + 1;
    report.perTurn.push({ turn: b.turn, subsystems: t, fallbacks, imposed: Object.fromEntries(ctx.imposed), reseeded: seed !== undefined });
    for (const [sub, x] of Object.entries(t)) {
      const s = report.subsystems[sub] ?? (report.subsystems[sub] = { held: 0, matched: 0, compared: 0, clean: 0 });
      s.compared += 1;
      const bad = sub.startsWith('read.') ? (x.drift ?? 0) > 0 : x.fail > 0;
      if (!bad) {
        s.matched += 1;
        if (!broken.has(sub)) held.set(sub, (held.get(sub) ?? 0) + 1);
        continue;
      }
      if (broken.has(sub)) continue;
      broken.add(sub);
      const w = x.worst!;
      const step = STEP_OF[sub];
      const stepRow = step ? baseStep.find((r) => r.check === step && r.subject === w.subject) : undefined;
      const pid = Number(/^(?:city|seat|unit) (\d+)/.exec(w.subject)?.[1] ?? NaN);
      s.first = { turn: b.turn, subject: w.subject, game: w.game, ours: w.ours, gap: r3(w.gap),
        ...(stepRow ? { perTurn: stepRow.skip ? `skip: ${stepRow.skip}` : stepRow.ok ? 'pass' : 'fail' } : {}),
        ...(baseFails.get(w.subject)?.size ? { perTurnFails: [...baseFails.get(w.subject)!].sort() } : {}),
        ...(ctx.fellBack.get(pid)?.length ? { fallbacks: ctx.fellBack.get(pid) } : {}) };
    }
    prev = a;
  }
  for (const [sub, s] of Object.entries(report.subsystems)) {
    s.held = held.get(sub) ?? 0;
    const at = report.perTurn.findIndex((p) => Object.keys(p.imposed).some((k) => imposesOn(k, sub)));
    if (at >= 0) s.imposedFrom = report.perTurn[at].turn;
    s.clean = at >= 0 ? Math.min(s.held, at) : s.held;
  }
  report.cleanEvery = Math.min(report.perTurn.length, ...Object.values(report.subsystems).map((s) => s.clean));
  report.turns = report.perTurn.length ? [report.perTurn[0].turn, report.perTurn[report.perTurn.length - 1].turn] : [];
  report.decisions = Object.fromEntries([...ctx.tally].sort(([x], [y]) => x.localeCompare(y)));
  report.refusals = Object.fromEntries([...ctx.reasons].sort(([x], [y]) => x.localeCompare(y)).map(([k, m]) => [k, Object.fromEntries(m)]));
  if (source instanceof RecordedActions) {
    report.unread = Object.fromEntries([...source.unread].sort((x, y) => y[1] - x[1]));
    report.settled = Object.fromEntries(source.settled);
  }
  report.subsystems = Object.fromEntries(Object.entries(report.subsystems).sort(([x], [y]) => x.localeCompare(y)));
  holdRng(null);
  holdMinorItem(null);
  holdMinorWalk(false);
  holdBarbarians(null);
  return report;
}

/**
 * THE CITY-STATES' ITEMS: what a city-state's city builds is its AI's pick,
 * taken after its step (on a completion, or idle), so the item its step of
 * turn t works is the one record t shows at its queue's head (runs/h1_duelw1117
 * Caguana: the Monument done in the step of t15, the Warrior at 0 in record
 * t16 and at 16 in t17). The engine's own build step works it.
 */
function minorItems(recs: readonly TurnRecord[], cat: Catalog) {
  const byTurn = new Map(recs.map((r) => [r.turn, r]));
  return (state: GameState, cs: CityState): MinorItem | undefined => {
    const rec = byTurn.get(state.turn);
    const c = rec?.cities.find((x) => x.y * rec.head.W + x.x === cs.centerIndex);
    return rec && c ? minorHead(cat, c, rec.head.W) : undefined;
  };
}

/** the replay report as Markdown: per subsystem the turns held, the first
 *  divergence and its per-turn step, then the decisions by kind */
export function replayMarkdown(r: ReplayReport): string {
  const out = [`# Action replay: ${r.dump}`, '', `Source: ${r.source}. Pairs replayed: ${r.perTurn.length}, turns ${r.turns.join('-')}.`
    + (r.stopped ? ` Stopped: ${r.stopped}.` : ''), '',
  `Pairs from the first on which every subsystem held with nothing imposed on it: ${r.cleanEvery}.`, '',
  '| subsystem | held from start | held, nothing imposed | first imposed | turns matched / compared | first divergence | subject | game | engine | per-turn step | per-turn fails on the subject |',
  '|---|---:|---:|---:|---:|---:|---|---|---|---|---|'];
  const cut = (v: unknown) => JSON.stringify(v)?.slice(0, 80) ?? '';
  for (const [sub, s] of Object.entries(r.subsystems)) {
    const f = s.first;
    out.push(`| ${sub} | ${s.held} | ${s.clean} | ${s.imposedFrom ?? '-'} | ${s.matched} / ${s.compared} | ${f ? f.turn : '-'} | ${f ? f.subject : ''} | `
      + `${f ? cut(f.game) : ''} | ${f ? cut(f.ours) : ''} | ${f?.perTurn ?? ''} | ${(f?.perTurnFails ?? []).join(', ')} |`);
  }
  out.push('', 'Reader subsystems (`read.*`) count a turn as diverged only where the per-turn harness passes the same check on the',
    'imported record; the state subsystems count every mismatch. "Held, nothing imposed" stops at the first pair on which the',
    'replay imposed a recorded outcome touching the subsystem (a fallback; `IMPOSES_ON` names what each kind touches, every',
    'subsystem where it names none).', '', '## Imposed outcomes per pair', '',
    '| pair | imposed (kind × count) |', '|---:|---|');
  for (const p of r.perTurn) {
    const ks = Object.entries(p.imposed);
    if (ks.length) out.push(`| ${p.turn} | ${ks.map(([k, n]) => `${k} ×${n}`).join(', ')} |`);
  }
  out.push('', '## Decisions', '',
    '| kind | applied | imposed (fell back to the record) | refused |', '|---|---:|---:|---:|');
  for (const [k, d] of Object.entries(r.decisions)) out.push(`| ${k} | ${d.applied} | ${d.fallback} | ${d.refused} |`);
  if (Object.keys(r.settled).length) {
    out.push('', '## What the event log settles', '', 'Per decision kind the log names outright: the decisions it names, the ones the',
      'inference from the snapshots names, and how many of the log\'s the inference named alike.', '',
      '| kind | log | inferred | alike |', '|---|---:|---:|---:|');
    for (const [k, t] of Object.entries(r.settled)) out.push(`| ${k} | ${t.log} | ${t.inferred} | ${t.agree} |`);
    out.push('', '## Recorded events no reader takes', '');
    for (const [k, n] of Object.entries(r.unread)) out.push(`- ${k}: ${n}`);
  }
  return out.join('\n') + '\n';
}
