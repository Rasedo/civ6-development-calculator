/**
 * THE UNIT ACTION MASK, TS side: which of the unit action columns
 * (`unitActionNames`, rules.json `actions.unit`) each of a seat's units may
 * take now, and the `units` rows of the neutral observation that carry it.
 *
 * It is a CANDIDATE mask, the GPU's `_seat_unit_mask` twin: the appliers
 * re-validate every order, so where the GPU mask is deliberately looser or
 * stricter than the TS verb this mirrors the GPU mask, and the column group
 * says so. Pure: it reads the state and writes nothing.
 */
import type { GameState, ImprovementId, Tile, Unit } from './types';
import { hexDistance, neighborTile, neighbors } from '../../world/hex';
import { canalPassage, isImpassable, isWater } from '../../world/query';
import { FEATURES } from '../../world/features';
import { FORMATION_CIVIC, FORMATION_MAX, UNITS, UNIT_TYPE_IDX } from '../data/units';
import { PROMO_COLS } from '../data/promotions';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { LAUNCH_INQUISITION_CHARGES } from '../data/religion';
import { MP_SCALE, RAILROAD_COST, RAILROAD_TECH } from '../data/constants';
import { IMPROVEMENTS } from '../data/improvements';
import { droughtBars } from '../data/disasters';
import {
  AIR_DEPLOY_COLS, AIR_REBASE_COLS, AIR_STRIKE_COLS, IMPROVEMENT_IDS, NUKE_COLS, SPY_MISSIONS, SPY_TRAVEL_COLS,
  buildColumnOf, unitActionIndex,
} from './unitActions';
import {
  artifactHome, borderClosedTo, canCleanFallout, canUpgradeUnit, cliffBlocksStep, concertVenue, digUnderfoot,
  encampmentBlocks, gdrJump, navalMelee, ownerHasTech, parkCluster, parkClusterLegal, unitDomain,
  unitsHostile, unitVisibleTo, waterEnterable, waterWalks,
} from './units';
import {
  BARB_SEAT, atWarWithAny, cityAtTile, cityHolders, civOf, civsAtWar, campTiles, hiddenResourcesFor, leaderOf,
  seatOf, tileBelongsTo, tileSeat, unitsOf,
} from './seats';
import { attacksLeftOf, promoAvailable, promoFlag, promoReady, promoValue } from './promotions';
import { cityStateAttackable, nukeTargets, siegeMayShoot } from './combat';
import {
  airPillageFit, airRange, airStrikeTargets, deployTargets, isAirUnit, priorityTargets, rebaseTargets,
} from './air';
import { computeUnlocks, getModifiers, isCivicComplete } from './effects';
import {
  PORTAL_MP, adjacentPlotRowOk, adjacentPlotTarget, canBuildRailroad, canBuildRoad, canRemoveFeature, portalAt,
  portalExit, suzerainNames, validImprovementsIn,
} from './rules';
import { cityAppealResolver, cityGovernorPromos } from './governors';
import { stockOf } from './stockpile';
import { harvestGrant } from './economy';
import { seatBuildingSum } from './city';
import { engineerFinishCity, evangelizeOk, projectBoostCity, wonderChargeCity, wonderChargePct } from './game';
import { gpActivateOk } from './gpAbility';
import { isSpy, missionOffered, spyDestinations, spyIdle } from './espionage';
import { gpSiteKey } from './targetSites';

/** the most living units a seat's rows carry (the GPU's UNIT_SLOTS) */
export const UNIT_SLOTS = 256;

const ACT = unitActionIndex(IMPROVEMENT_IDS);
const col = (name: string): number => {
  const c = ACT[name];
  if (c === undefined) throw new Error(`no unit action column ${name}`);
  return c;
};
const A_HOLD = col('HOLD');
const A_CHOP = col('CHOP');
const A_REPAIR = col('REPAIR');
const A_PILLAGE = col('PILLAGE');
const A_SNIPE = col('SNIPE_0');
const A_SPREAD = col('SPREAD_HERE');
const A_FOUND = col('FOUND_CITY');
const A_EXCAVATE = col('EXCAVATE');
const A_PARK = col('PARK');
const A_PROMOTE = col('PROMOTE_0');
const A_CONDEMN = col('CONDEMN_0');
const A_REMOVE_HERESY = col('REMOVE_HERESY');
const A_LAUNCH_INQUISITION = col('LAUNCH_INQUISITION');
const A_EVANGELIZE = col('EVANGELIZE_BELIEF');
const A_CONVERT_HEATHEN = col('CONVERT_HEATHEN');
const A_UPGRADE = col('UPGRADE');
const A_AIR_STRIKE = col('AIR_STRIKE_0');
const A_REBASE = col('REBASE_0');
const A_SPY_TRAVEL = col('SPY_TRAVEL_0');
const A_SPY_MISSION = col('SPY_MISSION_0');
const A_BUILD_ROAD = col('BUILD_ROAD');
const A_FINISH = col('FINISH_DISTRICT');
const A_GP = col('ACTIVATE_GP');
const A_SNIPE3 = col('SNIPE3_0');
const A_PERFORM = col('PERFORM_CONCERT');
const A_BOOST = col('BOOST_PROJECT');
const A_FORM_UP = col('FORM_UP_0');
const A_ESCORT = col('ESCORT');
const A_BREAK_ESCORT = col('BREAK_ESCORT');
const A_AIR_PILLAGE = col('AIR_PILLAGE_0');
const A_RAIL = col('BUILD_RAILROAD');
const A_CLEAN = col('CLEAN_FALLOUT');
const A_NUKE = col(`NUKE_0_0`);
const A_REMOVE_IMP = col('REMOVE_IMPROVEMENT');
const A_HARVEST = col('HARVEST');
const A_WONDER_CHARGE = col('WONDER_CHARGE');
const A_PORTAL = col('PORTAL');
const A_DEPLOY = col('DEPLOY_0');
const A_RETURN_TO_BASE = col('RETURN_TO_BASE');
const A_PRIORITY_TARGET = col('PRIORITY_TARGET_0');

/** the roster's Settler and Naturalist: the first unit carrying the flag */
const SETTLER_ID = Object.values(UNITS).find((u) => u.settler)?.id;
const NATURALIST_ID = Object.values(UNITS).find((u) => u.naturalist)?.id;

/** The stacking class a unit holds on its tile, as the GPU's four occupancy
 *  planes file it: an aircraft and a spy hold none. */
type Plane = 'military' | 'civilian' | 'support' | 'embarked';
const PLANES: readonly Plane[] = ['military', 'civilian', 'support', 'embarked'];

function planeOf(u: Unit): Plane | null {
  const d = unitDomain(u.type);
  if (d === 'air' || d === 'spy') return null;
  if (u.embarked) return 'embarked';
  return d;
}

/** Everything the mask reads more than once for one seat, built once. */
export interface MaskCtx {
  state: GameState;
  seat: number;
  /** the occupancy planes: tile -> the unit holding that class there */
  occ: Record<Plane, Map<number, Unit>>;
  /** a major's or the Free Cities' centre -> its holder seat */
  centre: Map<number, number>;
  anyWar: boolean;
  owns: (t: Tile) => boolean;
  /** the Builder's improvement opts, built on first use */
  impOpts?: Parameters<typeof validImprovementsIn>[1];
}

export function maskCtx(state: GameState, seat: number): MaskCtx {
  const occ: Record<Plane, Map<number, Unit>> = {
    military: new Map(), civilian: new Map(), support: new Map(), embarked: new Map(),
  };
  for (const u of state.units) {
    const p = planeOf(u);
    if (p && !occ[p].has(u.tileIndex)) occ[p].set(u.tileIndex, u);
  }
  const centre = new Map<number, number>();
  for (const h of cityHolders(state)) for (const c of h.cities) centre.set(c.centerIndex, h.seat);
  return {
    state, seat, occ, centre, anyWar: atWarWithAny(state, seat), owns: (t: Tile) => tileSeat(t) === seat,
  };
}

// ---- MOVE 0-5 ---------------------------------------------------------------

/** May `u` step onto `to`? The GPU's `move` clause: terrain (a hull on water
 *  it may enter or a Canal's passage; a land unit on land, or on water it may
 *  embark onto — Shipbuilding and a war with anyone, the ocean behind the
 *  seat's own ocean gate; a water-walker on either; the robot's jump; a
 *  tunnel), the stacking rule, a live enemy Encampment, the border, a cliff,
 *  movement left, and no escort holding it. `applySeatUnitOrders`' step arm
 *  asks the same through `tileFreeForUnit`. */
function moveOk(ctx: MaskCtx, u: Unit, here: Tile, to: Tile): boolean {
  const { state } = ctx;
  if (u.movesLeft <= 0) return false;
  const naval = !!UNITS[u.type]?.naval;
  const walks = waterWalks(u.type);
  const water = isWater(to);
  let terr: boolean;
  if (naval) terr = water ? !isImpassable(to) && waterEnterable(state, to, u) : canalPassage(to);
  else if (walks) terr = !isImpassable(to);
  else if (water) {
    terr = !isImpassable(to) && ctx.anyWar && ownerHasTech(state, u, 'SHIPBUILDING')
      && waterEnterable(state, to, { seat: u.seat });
  } else terr = !isImpassable(to);
  if (!terr && !water && gdrJump(state, u, to)) terr = true;
  if (!terr && portalAt(to)) terr = true;
  if (!terr) return false;
  if (stackBlocked(ctx, u, to, naval) || encampmentBlocks(state, to, u)) return false;
  if (borderClosedTo(state, u.seat, to, u.type)) return false;
  if (cliffBlocksStep(state, here, to, u)) return false;
  return !inEscortHere(ctx, u);
}

/** `_stack_blocked`: a foreign unit of any class blocks; an own unit blocks
 *  in the class the mover would stand in there (a land unit on water is a
 *  passenger). */
function stackBlocked(ctx: MaskCtx, u: Unit, to: Tile, naval: boolean): boolean {
  const d = unitDomain(u.type);
  const mine: Plane = isWater(to) && !naval ? 'embarked'
    : d === 'civilian' ? 'civilian' : d === 'support' ? 'support' : 'military';
  for (const p of PLANES) {
    const o = ctx.occ[p].get(to.index);
    if (o && (o.seat !== u.seat || p === mine)) return true;
  }
  return false;
}

/** the escort formation holds this unit: it carries the flag and an own
 *  military unit stands on its tile */
function inEscortHere(ctx: MaskCtx, u: Unit): boolean {
  if (!u.escorted) return false;
  const m = ctx.occ.military.get(u.tileIndex);
  return !!m && m.seat === ctx.seat;
}

// ---- ATTACK 6-11 ------------------------------------------------------------

/** May `u` attack `to`? A hostile unit there (the military one as this seat
 *  sees it, the civilian or support one, the passenger), a hostile major or
 *  Free City centre, an attackable city-state centre, or a live enemy
 *  Encampment; a fighter with movement and an attack left that may shoot;
 *  an embarked unit only as a melee blow ashore over no cliff. The ranged
 *  unit's reach is the neighbour ring here, as on the GPU. */
function attackOk(ctx: MaskCtx, u: Unit, here: Tile, to: Tile): boolean {
  const { state } = ctx;
  const def = UNITS[u.type];
  if (!def || !((def.combat ?? 0) > 0)) return false;
  if (u.movesLeft <= 0 || attacksLeftOf(u) <= 0) return false;
  if (!siegeMayShoot(state, u)) return false;
  if (u.embarked) {
    const melee = !((def.ranged?.strength ?? 0) > 0);
    if (!melee || isWater(to) || cliffBlocksStep(state, here, to, u)) return false;
  }
  const { seat } = ctx;
  const me = { seat };
  const m = ctx.occ.military.get(to.index);
  if (m && unitVisibleTo(state, m, seat) && unitsHostile(state, me, m)) return true;
  for (const p of ['civilian', 'support', 'embarked'] as const) {
    const o = ctx.occ[p].get(to.index);
    if (o && unitsHostile(state, me, o)) return true;
  }
  const holder = ctx.centre.get(to.index);
  if (holder !== undefined && unitsHostile(state, me, { seat: holder })) return true;
  const cs = state.cityStates.find((c) => c.centerIndex === to.index);
  if (cs && cityStateAttackable(state, cs, seat)) return true;
  return encampmentBlocks(state, to, me);
}

// ---- the SNIPE rings --------------------------------------------------------

/** A ranged strike's target at ring distance 2 or 3. A major's ranged fire
 *  engages BARBARIAN units only (`hostileRangedStrike`'s scope-out), a
 *  hostile MAJOR centre, an attackable city-state centre, or a live enemy
 *  Encampment. The GPU reads the military occupant unfiltered by stealth
 *  here, and names a Free City's centre no target. */
function ringTarget(ctx: MaskCtx, t: Tile): boolean {
  const { state, seat } = ctx;
  for (const p of PLANES) {
    const o = ctx.occ[p].get(t.index);
    if (o && o.seat === BARB_SEAT) return true;
  }
  const holder = ctx.centre.get(t.index);
  if (holder !== undefined && holder < 100 && unitsHostile(state, { seat }, { seat: holder })) return true;
  const cs = state.cityStates.find((c) => c.centerIndex === t.index);
  if (cs && cityStateAttackable(state, cs, seat)) return true;
  return encampmentBlocks(state, t, { seat });
}

/** the distance-`d` ring around `here` (d = 2 or 3), tile index ascending */
function ring(state: GameState, here: Tile, d: number): Tile[] {
  const out: Tile[] = [];
  for (const t of state.map.tiles) {
    if (hexDistance(here.col, here.row, t.col, t.row) === d) out.push(t);
  }
  return out;
}

// ---- the improvement opts ---------------------------------------------------

/** `validImprovementsIn`'s opts exactly as the BUILD applier passes them,
 *  for the unit's own chassis. */
function impOpts(ctx: MaskCtx, here: Tile, builder: string): Parameters<typeof validImprovementsIn>[1] {
  const { state, seat } = ctx;
  if (!ctx.impOpts) {
    ctx.impOpts = {
      unlocks: computeUnlocks(state, seat), map: state.map, camps: campTiles(state), gpAppeal: cityAppealResolver(state),
      ownsTile: ctx.owns, suzerain: suzerainNames(state, seat), civ: civOf(state, seat),
      farmTerrain: getModifiers(state, seat).farmTerrain, civics: seatOf(state, seat)?.research.civics,
      hidden: hiddenResourcesFor(state, seat),
    };
  }
  const oneHeld = new Set<ImprovementId>();
  const hereCity = cityAtTile(state, here);
  if (hereCity) {
    for (const t of state.map.tiles) {
      if (t.improvement && tileBelongsTo(t, hereCity)) oneHeld.add(t.improvement as ImprovementId);
    }
  }
  return { ...ctx.impOpts, builder, oneHeld, govPromos: hereCity ? cityGovernorPromos(state, hereCity) : undefined };
}

/** a tile nothing is paved on: no centre, improvement, district or wonder */
function bare(ctx: MaskCtx, t: Tile): boolean {
  return !ctx.centre.has(t.index) && !t.improvement && !t.district && !t.builtWonder;
}

// ---- the whole mask ---------------------------------------------------------

/** The legal action columns of one unit of `ctx.seat`, ascending. */
export function unitMask(ctx: MaskCtx, u: Unit): number[] {
  const { state, seat } = ctx;
  const here = state.map.tiles[u.tileIndex];
  const def = UNITS[u.type];
  const charges = u.charges ?? 0;
  const fights = (def?.combat ?? 0) > 0;
  const actor = seatOf(state, seat);
  const out = new Set<number>();
  for (let d = 0; d < 6; d++) {
    const to = neighborTile(state.map, here, d);
    if (to && moveOk(ctx, u, here, to)) out.add(d);
    if (to && attackOk(ctx, u, here, to)) out.add(6 + d);
  }
  out.add(A_HOLD);

  // ---- the BUILDER's ground (13-15, 18+): an own, bare tile under a Builder
  // with a charge. The Farm, Mine and Lumber Mill and every catalog row the
  // Builder lays answer `validImprovementsIn` with the applier's own opts.
  const builder = u.type === 'BUILDER';
  const owned = ctx.owns(here);
  if (builder && charges > 0 && owned && bare(ctx, here)) {
    for (const imp of validImprovementsIn(here, impOpts(ctx, here, 'BUILDER'))) {
      const i = IMPROVEMENT_IDS.indexOf(imp);
      if (i >= 0 && !IMPROVEMENTS[imp]?.builtBy) out.add(buildColumnOf(i));
    }
  }
  // CHOP: the GPU asks no ownership — the Builder, a charge, a removable
  // feature that pays a lump and no resource depends on, its removal tech and
  // no Congress ban. `builderRemoveFeature` pays only inside the borders.
  if (builder && charges > 0 && here.feature && FEATURES[here.feature]?.chopYield
      && canRemoveFeature(state, here, seat).ok) out.add(A_CHOP);
  // REPAIR asks no charge: a Builder on an own pillaged tile, and no drought
  // holding its improvement (`droughtBars`).
  if (builder && owned && (here.pillaged || here.districtPillaged)
      && !droughtBars(here, here.improvement)) out.add(A_REPAIR);
  // A row a NAMED unit lays (`Improvement_ValidBuildUnits`): the GPU asks no
  // charge of it.
  if (!builder && def && Object.values(IMPROVEMENTS).some((x) => x.builtBy === u.type)) {
    for (const imp of validImprovementsIn(here, impOpts(ctx, here, u.type))) {
      if (IMPROVEMENTS[imp]?.builtBy !== u.type) continue;
      if (!bare(ctx, here)) continue;
      const i = IMPROVEMENT_IDS.indexOf(imp);
      if (i >= 0) out.add(buildColumnOf(i));
    }
  }
  // THE MILITARY ENGINEER'S rows (and the Legion's Fort): a charge, the
  // engineer's own-or-neutral ground, and each row's own clauses; the
  // adjacent-plot rows target a bare mountain beside the unit instead.
  const engineer = u.type === 'MILITARY_ENGINEER';
  if ((engineer || def?.fortBuilder) && charges > 0 && bare(ctx, here)) {
    for (const imp of validImprovementsIn(here, impOpts(ctx, here, u.type))) {
      if (IMPROVEMENTS[imp]?.adjacentPlot) continue;
      const i = IMPROVEMENT_IDS.indexOf(imp);
      if (i >= 0) out.add(buildColumnOf(i));
    }
  }
  // THE ADJACENT-PLOT rows (the Engineer's Tunnel, Pachacuti's Qhapaq Ñan):
  // the row's own unit with a charge, its unlock and leader, and a bare
  // mountain beside it (`adjacentPlotTarget`).
  if ((engineer || builder) && charges > 0) {
    const un = computeUnlocks(state, seat);
    const leader = leaderOf(state, seat);
    for (const imp of IMPROVEMENT_IDS) {
      const idef = IMPROVEMENTS[imp as keyof typeof IMPROVEMENTS];
      if (!idef?.adjacentPlot || !adjacentPlotRowOk(idef, u.type, un, leader)) continue;
      if (adjacentPlotTarget(state.map, here, idef, ctx.owns) >= 0) out.add(buildColumnOf(IMPROVEMENT_IDS.indexOf(imp)));
    }
  }

  // PILLAGE: a fighter on ground whose owner this seat is at WAR with (the
  // war relation, not hostility: a Free City's ground is no target), carrying
  // an unpillaged improvement or a complete unpillaged district that is
  // neither a centre nor an Encampment. The GPU asks no movement and no
  // Tunnel exception; the applier does.
  if (fights && warGround(ctx, here) && wreckable(ctx, here)) out.add(A_PILLAGE);
  // ...and a naval RAIDER (or Harald's naval melee) on water with 3 Movement
  // beside such a land tile.
  if ((def?.raider || (navalMelee(def) && leaderOf(state, seat) === 'HARDRADA')) && isWater(here)
      && u.movesLeft >= 3 * MP_SCALE
      && neighbors(state.map, here).some((n) => !isWater(n) && warGround(ctx, n) && wreckable(ctx, n))) {
    out.add(A_PILLAGE);
  }

  // SNIPE: a ranged chassis of range 2+, not embarked, with an attack left
  // that may shoot — the GPU asks no movement.
  const ranged = (def?.ranged?.strength ?? 0) > 0;
  if (ranged && !u.embarked && attacksLeftOf(u) > 0 && siegeMayShoot(state, u)) {
    if ((def!.ranged!.range ?? 0) >= 2) {
      ring(state, here, 2).forEach((t, k) => { if (k < 12 && ringTarget(ctx, t)) out.add(A_SNIPE + k); });
    }
    if ((def!.ranged!.range ?? 0) + promoValue(u, 'RANGE') >= 3) {
      ring(state, here, 3).forEach((t, k) => { if (k < 18 && ringTarget(ctx, t)) out.add(A_SNIPE3 + k); });
    }
  }

  // SPREAD: a Missionary or Apostle with a charge once the seat founded a
  // religion — all seven columns, whatever stands where; `spreadFromUnit`
  // re-validates the city.
  if ((u.type === 'MISSIONARY' || u.type === 'APOSTLE') && charges > 0 && actor?.religion.founded) {
    for (let k = 0; k < 7; k++) out.add(A_SPREAD + k);
  }
  // FOUND_CITY: any Settler — `foundCity` re-validates the site.
  if (SETTLER_ID !== undefined && u.type === SETTLER_ID) out.add(A_FOUND);
  // EXCAVATE: an Archaeologist with a charge on a dig, behind no closed
  // border, with a free artifact slot somewhere.
  if (u.type === 'ARCHAEOLOGIST' && charges > 0 && digUnderfoot(state, here, seat)
      && !borderClosedTo(state, seat, here) && artifactHome(state, seat)) out.add(A_EXCAVATE);
  // PARK: a Naturalist (or a park-building chassis) anchoring a legal
  // rhombus E or W of it — the GPU asks no charge.
  if ((u.type === NATURALIST_ID || def?.parkBuilder) && [0, 3].some((d) => {
    const nb = neighborTile(state.map, here, d);
    if (!nb) return false;
    const cl = parkCluster(state, here.index, nb.index);
    return cl.length === 4 && parkClusterLegal(state, cl, seat);
  })) out.add(A_PARK);
  // PROMOTE
  if (promoReady(u)) {
    for (let k = 0; k < PROMO_COLS; k++) if (promoAvailable(u, k)) out.add(A_PROMOTE + k);
  }
  // CONDEMN: a fighter beside a religious unit (the civilian occupant, else
  // the passenger) of a seat this one is at WAR with.
  if (fights) {
    for (let d = 0; d < 6; d++) {
      const nb = neighborTile(state.map, here, d);
      if (!nb) continue;
      const r = religiousAt(ctx, nb.index);
      if (r && civsAtWar(state, seat, r.seat)) out.add(A_CONDEMN + d);
    }
  }
  // REMOVE_HERESY: an Inquisitor with a charge on an own city centre.
  if (u.type === 'INQUISITOR' && charges > 0 && ctx.centre.has(here.index) && tileSeat(here) === seat) {
    out.add(A_REMOVE_HERESY);
  }
  // LAUNCH_INQUISITION
  if (u.type === 'APOSTLE' && charges >= LAUNCH_INQUISITION_CHARGES && tileSeat(here) === seat
      && !actor?.religion.inquisition) out.add(A_LAUNCH_INQUISITION);
  // EVANGELIZE_BELIEF: an Apostle of a religion with a class still to earn
  if (evangelizeOk(state, u, seat)) out.add(A_EVANGELIZE);
  // CONVERT_HEATHEN: a charge, the promotion, and a barbarian (military or
  // civilian occupant) in the ring.
  if (charges > 0 && promoFlag(u, 'HEATHEN') && neighbors(state.map, here).some((n) =>
    [ctx.occ.military.get(n.index), ctx.occ.civilian.get(n.index)].some((o) => !!o && o.seat === BARB_SEAT))) {
    out.add(A_CONVERT_HEATHEN);
  }
  // UPGRADE
  if (canUpgradeUnit(state, u, seat)) out.add(A_UPGRADE);
  // AIR: the target lists, each head's column k its k-th tile; the GPU asks
  // movement (and for a strike an attack) of every head.
  if (isAirUnit(u.type) && u.movesLeft > 0) {
    if (attacksLeftOf(u) > 0) {
      airStrikeTargets(state, u, AIR_STRIKE_COLS).forEach((_t, k) => out.add(A_AIR_STRIKE + k));
      if (def?.air === 'BOMBER' && airPillageFit(u)) {
        let k = 0;
        for (const t of state.map.tiles) {
          if (k >= AIR_STRIKE_COLS) break;
          const d = hexDistance(here.col, here.row, t.col, t.row);
          if (d <= 0 || d > airRange(u) || !warGround(ctx, t) || !wreckable(ctx, t)) continue;
          out.add(A_AIR_PILLAGE + k);
          k += 1;
        }
      }
    }
    rebaseTargets(state, u, AIR_REBASE_COLS).forEach((_t, k) => out.add(A_REBASE + k));
    // PATROL: a fighter's deployment hexes, and the way back to its base.
    deployTargets(state, u, AIR_DEPLOY_COLS).forEach((_t, k) => out.add(A_DEPLOY + k));
    if (u.patrol !== undefined) out.add(A_RETURN_TO_BASE);
    // PRIORITY TARGET: the Support units in operational range.
    if (attacksLeftOf(u) > 0) {
      priorityTargets(state, u, AIR_STRIKE_COLS).forEach((_t, k) => out.add(A_PRIORITY_TARGET + k));
    }
  }
  // SPY: an idle spy's destinations and the missions it may start here.
  if (isSpy(u.type) && spyIdle(u)) {
    spyDestinations(state, u, SPY_TRAVEL_COLS).forEach((_t, k) => out.add(A_SPY_TRAVEL + k));
    for (let m = 0; m < SPY_MISSIONS.length; m++) if (missionOffered(state, u, m)) out.add(A_SPY_MISSION + m);
  }
  // THE MILITARY ENGINEER'S ROAD (a charge) and RAILROAD (no charge; Steam
  // Power and the Iron and Coal), and its 20% FINISH.
  if (engineer && charges > 0 && canBuildRoad(here, ctx.owns)) out.add(A_BUILD_ROAD);
  if (engineer && charges > 0 && engineerFinishCity(state, seat, here.index)) out.add(A_FINISH);
  if (engineer && actor?.research.techs.includes(RAILROAD_TECH) && canBuildRailroad(here, ctx.owns)
      && RAILROAD_COST.every(([id, n]) => stockOf(state, seat, id) >= n)) out.add(A_RAIL);
  // ACTIVATE_GP
  if (gpActivateOk(state, u)) out.add(A_GP);
  // PERFORM_CONCERT: a Rock Band on a venue in another MAJOR's territory.
  if (u.type === 'ROCK_BAND') {
    const owner = tileSeat(here);
    if (owner >= 0 && owner < state.seats.length && owner !== seat && concertVenue(state, here.index, u) > 0) {
      out.add(A_PERFORM);
    }
  }
  // BOOST_PROJECT: a Builder with a charge on a district running this city's
  // project, the Royal Society's percentage held, once per city per turn.
  if (builder && charges > 0 && seatBuildingSum(state, seat, 'projectChargePct') > 0) {
    const city = projectBoostCity(state, seat, here.index);
    if (city && (city.projectBoostTurn ?? 0) !== state.turn) out.add(A_BOOST);
  }
  // FORM_UP: a fighter with movement beside an own military unit of its
  // own type (neither the robot), the merged tier's civic in.
  if (fights && u.movesLeft > 0 && !def?.gdr) {
    for (let d = 0; d < 6; d++) {
      const nb = neighborTile(state.map, here, d);
      const h = nb ? ctx.occ.military.get(nb.index) : undefined;
      if (!h || h.seat !== seat || h.type !== u.type) continue;
      const tier = (h.formation ?? 0) + (u.formation ?? 0) + 1;
      if (tier > FORMATION_MAX) continue;
      const naval = !!def?.naval;
      const row = getModifiers(state, seat).formations.find((r) => r.tier === tier && r.naval === naval && r.civic !== undefined);
      const civic = row?.civic ?? FORMATION_CIVIC[tier];
      if (civic && isCivicComplete(state, civic, seat)) out.add(A_FORM_UP + d);
    }
  }
  // ESCORT: a civilian, support unit or passenger, not already escorted, on
  // an own military unit's tile, whose class holds no other rider there.
  const noncombat = unitDomain(u.type) === 'civilian' || unitDomain(u.type) === 'support';
  if ((noncombat || u.embarked) && !u.escorted) {
    const m = ctx.occ.military.get(u.tileIndex);
    if (m && m.seat === seat) {
      const p: Plane = u.embarked ? 'embarked' : unitDomain(u.type) === 'support' ? 'support' : 'civilian';
      const o = ctx.occ[p].get(u.tileIndex);
      if (!(o && o.id !== u.id && o.escorted && o.seat === seat)) out.add(A_ESCORT);
    }
  }
  if (inEscortHere(ctx, u)) out.add(A_BREAK_ESCORT);
  // CLEAN_FALLOUT: any chassis with a charge on irradiated ground.
  if (canCleanFallout(state, u)) out.add(A_CLEAN);
  // NUKE: the carrier's heads, with movement left.
  if (u.movesLeft > 0) {
    for (let k = 0; k < NUCLEAR_DEVICES.length; k++) {
      nukeTargets(state, u, k, NUKE_COLS).forEach((_t, c) => out.add(A_NUKE + k * NUKE_COLS + c));
    }
  }
  // REMOVE_IMPROVEMENT: a Builder or Engineer on an own improved tile.
  if ((builder || engineer) && owned && here.improvement) out.add(A_REMOVE_IMP);
  // HARVEST
  if (builder && charges > 0 && !getModifiers(state, seat).seatBans.has('harvest')
      && harvestGrant(state, here, seat)) out.add(A_HARVEST);
  // WONDER_CHARGE: a Builder with a charge on its city's queued wonder site,
  // the era band held.
  if (builder && charges > 0) {
    const city = wonderChargeCity(state, seat, here.index);
    const q = city?.queue[0];
    if (q?.kind === 'wonder' && wonderChargePct(state, seat, q.wonder) > 0) out.add(A_WONDER_CHARGE);
  }
  // PORTAL: on a portal with another on its range, 2 Movement left.
  if (u.movesLeft >= PORTAL_MP * MP_SCALE && portalExit(state.map, here) >= 0) out.add(A_PORTAL);
  return [...out].sort((a, b) => a - b);
}

/** ground a seat this one is at WAR with holds (a major's or a city-state's;
 *  the barbarians and the Free Cities hold no such ground) */
function warGround(ctx: MaskCtx, t: Tile): boolean {
  const ts = tileSeat(t);
  return ts >= 0 && ts < BARB_SEAT && civsAtWar(ctx.state, ctx.seat, ts);
}

/** an unpillaged improvement, or a complete unpillaged district that is
 *  neither a centre nor an Encampment */
function wreckable(ctx: MaskCtx, t: Tile): boolean {
  if (t.improvement && !t.pillaged) return true;
  return !!t.district && t.district !== 'ENCAMPMENT' && !!t.districtComplete && !t.districtPillaged
    && !ctx.centre.has(t.index) && t.district !== 'CITY_CENTER';
}

/** the religious unit on a tile: the civilian occupant, else the passenger */
function religiousAt(ctx: MaskCtx, t: number): Unit | undefined {
  const o = ctx.occ.civilian.get(t) ?? ctx.occ.embarked.get(t);
  return o && (o.type === 'MISSIONARY' || o.type === 'APOSTLE' || o.type === 'INQUISITOR') ? o : undefined;
}

/** one row of the `units` group */
export interface UnitRow {
  tile: number;
  type: number;
  charges: number;
  gpAt: number;
  gpSite: number;
  gpArg: number;
  mask: number[];
}

/** The `units` group: one row per living unit of the seat, in array order. */
export function unitRows(state: GameState, seat: number): UnitRow[] {
  const ctx = maskCtx(state, seat);
  return unitsOf(state, seat).slice(0, UNIT_SLOTS).map((u) => {
    const k = gpSiteKey(u);
    return {
      tile: u.tileIndex,
      type: UNIT_TYPE_IDX.indexOf(u.type),
      charges: u.charges ?? 0,
      gpAt: u.gpAt ?? -1,
      gpSite: k ? k[0] : -1,
      gpArg: k ? k[1] : -1,
      mask: unitMask(ctx, u),
    };
  });
}
