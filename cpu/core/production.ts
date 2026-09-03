import type { City, GameState, Seat, Unit } from './types';
import type { QueueItem } from './types';
import { seatOf, setTileOwner, tileCity, tileSeat, unitSeat, allianceFreePromo } from './seats';
import { NO_SEAT } from '../../world/types';
import type { Tile } from '../../world/types';
import { congressCultureBombSeat } from './congress';
import { hexDistance, neighbors } from '../../world/hex';
import { availableCivicsIn, availableTechsIn, getModifiers } from './effects';
import { completedWonders, seatWonderFlag } from './wonders';
import { UNITS, ENCAMPMENT_HP, URBAN_DEFENSES_TECH } from '../data/units';
import { isGreatEngineer } from './units';
import { BUILDINGS } from '../data/buildings';
import { governorFlag, governorSum } from './governors';
import { DISTRICTS } from '../data/districts';
import { CARBON_RECAPTURE_FAVOR, CARBON_RECAPTURE_UNITS } from '../data/climate';
import { emitCarbon, repairBehindBarrier } from './climate';
import { PROJECTS, PROJECT_YIELD_FRACTION, gpClassesOf, gppFractionOf } from '../data/projects';
import { NUCLEAR_DEVICES } from '../data/nuclear';
import { CULTURE_BOMB_RANGE, DED_FREE_INQUIRY, DED_MONUMENTALITY, ERA_SCORE_WONDER } from '../data/seats';
import { ERAS, TECHS } from '../data/techs';
import { addEraScore, buildingDedications, dedicationEvent } from './eras';
import { spawnUnit } from './units';
import { grantFreeProphet } from './greatPeople';
import { airTrainTile } from './air';
import { wallsMax, urbanDefensesFit, fitEncampOuter } from './rules';
import { trainXpPct } from './combat';
import { promoClassOf, unitPromoRows, xpToNextLevel } from './promotions';
import { applyLumpYield } from './economy';
import { congressGppFactor } from './congress';
import { BUILT_WONDERS } from '../data/builtWonders';
import { nextRandom } from './rand';

/** CIV6 (Oxford University, Bolshoi Theatre): the free technologies and civics
 *  are DRAWN AT RANDOM. One draw per grant over the rows available at that
 *  moment, so a seat with nothing available advances the stream not at all. */
function grantFreeResearch(state: GameState, owner: Seat, kind: 'tech' | 'civic', n: number): void {
  const rsr = owner.research;
  for (let i = 0; i < n; i++) {
    const open = kind === 'tech' ? availableTechsIn(rsr) : availableCivicsIn(rsr);
    if (open.length === 0) return; // the tree is exhausted
    const next = open[Math.floor(nextRandom(state) * open.length)];
    if (kind === 'tech') {
      if (next.id === URBAN_DEFENSES_TECH) urbanDefensesFit(state, owner.seat);
      rsr.techs.push(next.id);
      delete rsr.techRetained[next.id];
      if (rsr.tech === next.id) rsr.tech = null;
    } else {
      rsr.civics.push(next.id);
      delete rsr.civicRetained[next.id];
      if (rsr.civic === next.id) rsr.civic = null;
    }
  }
}

/** CIV6 (Embrasure): "Military units trained in this city start with a free
 *  promotion that do not already start with a free promotion." No unit in this
 *  model starts with one, so every promotion class qualifies; the grant is the
 *  XP its first level costs, which `takePromotion` then zeroes. */
function grantFreePromotion(unit: Unit, free: boolean): void {
  if (!free || unitPromoRows(unit).length === 0) return;
  unit.xp = Math.max(unit.xp ?? 0, xpToNextLevel(unit));
}

export function completeProject(state: GameState, city: City, projectId: string, cost: number, sciPerTurn = 0): void {
  const def = PROJECTS[projectId];
  if (!def) return;
  const owner = seatOf(state, city.seat);
  if (!owner) return;

  if (def.repair) {
    // CIV6: "Once completed, it fully restores the HP of the city's (and
    // Encampment's) Outer Defenses" — each to its OWN full pool.
    city.outerHp = wallsMax(state, city);
    fitEncampOuter(state, city);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.carbonRecapture) {
    // CIV6 (Carbon Recapture): "-50 lifetime carbon emissions" and "+30
    // Diplomatic Favor" per completion, repeatable, and the total may go
    // below zero — `emitCarbon` never clamps.
    emitCarbon(state, city.seat, -CARBON_RECAPTURE_UNITS);
    owner.diplomaticFavor += CARBON_RECAPTURE_FAVOR;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.recommission) {
    // CIV6: the age is "the number of turns that have passed since the Power
    // Plant was first constructed, converted to, or last recommissioned".
    city.reactorAge = 0;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.laser) {
    // Repeatable: each station speeds the craft by +1 LY/turn. The orbital one
    // is the seat's; the terrestrial one belongs to the city it powers from.
    if (def.orbital) owner.orbitalLasers = (owner.orbitalLasers ?? 0) + 1;
    else city.laserStations = (city.laserStations ?? 0) + 1;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.wmd) {
    // CIV6: the finished device joins the seat's INVENTORY, not any city's.
    const inv = (owner.wmd ??= NUCLEAR_DEVICES.map(() => 0));
    inv[def.wmd - 1] += 1;
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    return;
  }
  if (def.once) {
    if (!owner.projectsDone.includes(projectId)) owner.projectsDone.push(projectId);
    state.eventLog.push(`${city.name} completed ${def.name}.`);
    // The sourced side effects, per step (Launch Mars Colony has none — it
    // exists to open the expedition).
    if (projectId === 'LAUNCH_EARTH_SATELLITE' && state.fogOfWar) {
      // CIV6: reveals the entire map. Same fog gate as `revealAround` — a
      // fog-off world accrues no explored state on either engine.
      owner.explored = new Array(state.map.tiles.length).fill(1);
    }
    if (projectId === 'LAUNCH_MOON_LANDING') {
      // CIV6: a one-time Culture lump of 10x the seat's science per turn —
      // measured on the seat-phase-top city-stats snapshot the caller holds.
      applyLumpYield(state, city.centerIndex, { key: 'culture', amount: Math.round(10 * sciPerTurn) }, city.seat);
    }
    if (def.victory) {
      // CIV6: completing the Exoplanet Expedition LAUNCHES the craft; the
      // win fires when it arrives (the endTurn flight tick).
      owner.spaceLy = 0;
      state.eventLog.push('The Exoplanet Expedition has launched.');
    }
    return;
  }
  if (def.yield) {
    const amount = Math.round(cost * PROJECT_YIELD_FRACTION);
    applyLumpYield(state, city.centerIndex, { key: def.yield, amount }, city.seat);
    state.eventLog.push(`${city.name} completed ${def.name}: +${amount} ${def.yield}.`);
  }
  const classes = gpClassesOf(def);
  if (classes.length) {
    const pts = Math.round(cost * gppFractionOf(def));
    for (const gc of classes) {
      owner.gpp[gc] = (owner.gpp[gc] ?? 0) + pts * congressGppFactor(state, gc);
    }
    if (!def.yield) state.eventLog.push(`${city.name} completed ${def.name}: +${pts} ${classes.join('/')} points.`);
  }
}

/**
 * CIV6: a city never holds two of one building, so obtaining one any other
 * way — a Great Person's instant build, a purchase — takes it off the
 * production queue. The hammers already spent are NOT lost: they bank, which
 * is where this model puts every carried-over hammer.
 *
 * Only the queue HEAD accrues (every `progress +=` in the engine reads
 * `queue[0]`), so a deeper item banks the zero it carries.
 */
export function dropQueuedBuilding(city: City, buildingId: string): void {
  for (let i = city.queue.length - 1; i >= 0; i--) {
    const it = city.queue[i];
    if (it?.kind !== 'building' || it.building !== buildingId) continue;
    city.productionBank = (city.productionBank ?? 0) + it.progress;
    city.queue.splice(i, 1);
  }
}

/**
 * CIV6 (Culture Bomb): a tile whose district or wonder is still under
 * construction is flipped anyway — "construction will immediately stop and
 * it'll disappear", "wiping out any unfinished construction in the process".
 * The hammers already spent are NOT lost: they bank, which is where this model
 * puts every carried-over hammer.
 *
 * `_wipe_construction` is the twin.
 */
export function wipeConstruction(state: GameState, tile: Tile): void {
  const digging = tile.district !== null && !tile.districtComplete;
  const raising = tile.builtWonder !== null && !tile.builtWonderComplete;
  if (!digging && !raising) return;
  const city = seatOf(state, tileSeat(tile))?.cities.find((c) => c.id === tileCity(tile));
  if (city) {
    for (let i = city.queue.length - 1; i >= 0; i--) {
      const it = city.queue[i];
      if (it.kind !== 'district' && it.kind !== 'wonder') continue;
      if (it.tileIndex !== tile.index) continue;
      city.productionBank = (city.productionBank ?? 0) + it.progress;
      city.queue.splice(i, 1);
    }
    if (digging) city.districts = city.districts.filter((d) => d.tileIndex !== tile.index);
    if (raising) city.wonders = city.wonders.filter((w) => w.tileIndex !== tile.index);
  }
  if (digging) {
    tile.district = null;
    tile.districtComplete = false;
  }
  if (raising) {
    tile.builtWonder = null;
    tile.builtWonderComplete = false;
  }
}

export function completeQueueItem(
  state: GameState,
  city: City,
  item: QueueItem,
  cost: number,
  sciPerTurn = 0,
): void {
  const owner = seatOf(state, city.seat);
  if (!owner) return;
  // CIV6 (Citadel of God): "Gain Faith equal to 25% of the construction cost
  // when finishing buildings." Districts are construction too and the page
  // groups them with the buildings; wonders are not.
  if (item.kind === 'building' || item.kind === 'district') {
    const pct = governorSum(state, city, (e) => e.faithOnBuildPct);
    if (pct) owner.faith = (owner.faith ?? 0) + Math.floor((cost * pct) / 100);
  }
  switch (item.kind) {
    case 'district': {
      const dt = state.map.tiles[item.tileIndex];
      dt.districtComplete = true;
      if (dt.district !== 'CITY_CENTER') dedicationEvent(state, city.seat, DED_MONUMENTALITY);
      if (dt.district === 'ENCAMPMENT') {
        dt.encampHp = ENCAMPMENT_HP;
        // its OWN perimeter arrives at whatever tier the city's walls
        // already supply — 0 where none stand yet (`fitEncampOuter`)
        dt.encampOuterHp = wallsMax(state, city);
      }
      // CIV6 (Religious Convert): "Receives an Apostle each time he finishes
      // a ... Theater Square district" (`DISTRICT_UNIT_ROWS`)
      for (const r of getModifiers(state, city.seat).districtUnits) {
        if (dt.district === r.district) spawnUnit(state, r.unit, dt.index, city.seat);
      }
      const ddef = dt.district ? DISTRICTS[dt.district] : null;
      // CIV6 (Diplomatic Quarter): "+1 Envoy when built next to the City
      // Center."
      const envoysD = ddef?.envoysNextToCenter ?? 0;
      if (envoysD && neighbors(state.map, dt).some((n) => n.index === city.centerIndex)) {
        owner.envoysAvailable = (owner.envoysAvailable ?? 0) + envoysD;
      }
      // The Border Control Treaty bombs FOREIGN tiles too and so subsumes the
      // Preserve's own; only one of the two ever runs.
      if (congressCultureBombSeat(state) === city.seat) cultureBomb(state, city, item.tileIndex, false);
      else if (ddef?.cultureBombUnowned) cultureBomb(state, city, item.tileIndex, true);
      break;
    }
    case 'wonder': {
      state.map.tiles[item.tileIndex].builtWonderComplete = true;
      addEraScore(state, city.seat, ERA_SCORE_WONDER);
      const fx = BUILT_WONDERS[item.wonder]?.effects;
      // CIV6: Statue of Liberty pays +4 Diplomatic Victory points on
      // completion, Potala Palace +1.
      if (fx?.dvp) owner.diplomaticPoints = (owner.diplomaticPoints ?? 0) + fx.dvp;
      // CIV6 (Big Ben): the treasury is multiplied once, at completion.
      if (fx?.treasuryMult) owner.treasury *= fx.treasuryMult;
      // CIV6 (Mausoleum): the charge reaches the engineers ALREADY standing,
      // not just the ones born after it.
      if (fx?.engineerCharges) {
        for (const u of state.units) {
          if (unitSeat(u) === owner.seat && isGreatEngineer(u.type)) u.charges = (u.charges ?? 0) + fx.engineerCharges;
        }
      }
      // CIV6 (Apadana): +2 envoys each time ANY wonder completes in its city,
      // itself included — so the count is read AFTER this tile went complete.
      const envoys = completedWonders(state, city).reduce((n, w) => n + (w.def.effects?.envoysPerWonder ?? 0), 0);
      if (envoys) owner.envoysAvailable = (owner.envoysAvailable ?? 0) + envoys;
      // CIV6 (Pyramids): "Grants a free Builder" — at the completing city.
      if (fx?.grantUnit) spawnUnit(state, fx.grantUnit, city.centerIndex, city.seat);
      // CIV6 (Stonehenge): the free Great Prophet, with the Apostle fallback.
      if (fx?.grantProphet) grantFreeProphet(state, city.seat, city.centerIndex);
      // CIV6 (Oxford, Bolshoi): free technologies and civics, drawn at random
      // in the real game and taken here in the same available-order the
      // research chooser uses.
      if (fx?.freeTechs) grantFreeResearch(state, owner, 'tech', fx.freeTechs);
      if (fx?.freeCivics) grantFreeResearch(state, owner, 'civic', fx.freeCivics);
      // CIV6 (Great Library): "Receive boosts to all Ancient and Classical era
      // technologies" — one eureka per technology not already boosted or
      // researched, each of which is a Free Inquiry event like any other.
      const boostEra = fx?.boostTechsThroughEra ?? -1;
      if (boostEra >= 0) {
        const rsr = owner.research;
        let fired = 0;
        for (const [id, def] of Object.entries(TECHS)) {
          if (ERAS.indexOf(def.era) > boostEra) continue;
          if (rsr.techs.includes(id) || rsr.boosted.includes(id)) continue;
          rsr.boosted.push(id);
          fired += 1;
        }
        dedicationEvent(state, city.seat, DED_FREE_INQUIRY, fired);
      }
      break;
    }
    case 'settler':
      // Real Civ 6: a completed Settler costs the city 1 pop and SPAWNS at
      // the city — a unit like any other, moved and founded by orders.
      // CIV6 (Provision): "Settlers trained in the city do not consume a
      // Population."
      spawnUnit(state, 'SETTLER', city.centerIndex, city.seat);
      if (!governorFlag(state, city, (e) => e.settlerFreePop)) {
        city.population = Math.max(1, city.population - 1);
      }
      break;
    case 'unit': {
      // CIV6: "Newly built aircraft will spawn in the Aerodrome, as long as it
      // still has empty slots."
      const where = UNITS[item.unit]?.air
        ? airTrainTile(state, city.seat, city) ?? city.centerIndex
        : city.centerIndex;
      // CIV6 (Military alliance 3): "Units start with a free Promotion."
      const freePromo = governorFlag(state, city, (e) => e.freePromoOnTrain)
        || allianceFreePromo(state, city.seat);
      const trained = spawnUnit(state, item.unit, where, city.seat);
      if (trained) {
        trained.xpPct = trainXpPct(city.buildings, promoClassOf(item.unit));
        grantFreePromotion(trained, freePromo);
        // a FORMATION entry arrives at its tier — the whole point of the order
        if (item.formation) trained.formation = item.formation;
      }
      if (item.unit === 'BUILDER') owner.buildersTrained += 1;
      // CIV6 (Venetian Arsenal): a TRAINED naval unit arrives twice. Purchases
      // are excluded in the real game and take a different path here.
      if (UNITS[item.unit]?.naval && seatWonderFlag(state, city.seat, 'duplicateNavalTrain')) {
        const twin = spawnUnit(state, item.unit, city.centerIndex, city.seat);
        if (twin) {
          twin.xpPct = trainXpPct(city.buildings, promoClassOf(item.unit));
          grantFreePromotion(twin, freePromo);
          // what was trained arrives twice, tier and all
          if (item.formation) twin.formation = item.formation;
        }
      }
      break;
    }
    case 'project':
      completeProject(state, city, item.project, cost, sciPerTurn);
      break;
    case 'building':
      // `city.buildings` is a SET — every reader tests it with `includes`,
      // and the GPU carries it as one bit per building.
      if (!city.buildings.includes(item.building)) city.buildings.push(item.building);
      buildingDedications(state, city.seat, item.building);
      // CIV6 (Intelligence Agency): "+1 Spy" — the free unit, here.
      if (BUILDINGS[item.building]?.grantUnit) spawnUnit(state, BUILDINGS[item.building].grantUnit!, city.centerIndex, city.seat);
      if (BUILDINGS[item.building]?.walls) { city.outerHp = wallsMax(state, city); fitEncampOuter(state, city); }
      // CIV6 (Flood Barrier): built late, "those tiles can be repaired in
      // full and used again, along with anything that's on them".
      if (BUILDINGS[item.building]?.floodBarrier) repairBehindBarrier(state, city);
      break;
  }
}

/**
 * CIV6 (Border Control Treaty, outcome A): "New Districts built by target
 * player act as Culture bombs" — and, on its own, the Preserve.
 *
 * CIV6 (Culture Bomb): "the immediate annexation of the six tiles surrounding
 * the trigger tile, without districts or wonders and falling within 3 hexes of
 * one of the owner's City Centers" — taking foreign-owned tiles is the whole
 * point of a bomb. Ascending tile order, so both engines claim the same set in
 * the same order.
 *
 * A tile whose district or wonder is still UNDER CONSTRUCTION is flipped too,
 * and `wipeConstruction` undoes the build it was carrying.
 */
function cultureBomb(state: GameState, city: City, tileIndex: number, unownedOnly: boolean): void {
  const owner = seatOf(state, city.seat);
  if (!owner) return;
  for (const t of neighbors(state.map, state.map.tiles[tileIndex]).slice().sort((a, b) => a.index - b.index)) {
    // CIV6 (Culture Bomb): a COMPLETED district or wonder is never stolen.
    if ((t.district && t.districtComplete) || (t.builtWonder && t.builtWonderComplete)) continue;
    // CIV6 (Preserve): "Initiate a Culture Bomb on adjacent UNOWNED tiles" —
    // it annexes what nobody holds and never takes a rival's.
    if (unownedOnly && tileSeat(t) !== NO_SEAT) continue;
    if (tileSeat(t) === city.seat && tileCity(t) === city.id) continue;
    const near = owner.cities.some((c) => {
      const ctr = state.map.tiles[c.centerIndex];
      return hexDistance(ctr.col, ctr.row, t.col, t.row) <= CULTURE_BOMB_RANGE;
    });
    if (!near) continue;
    wipeConstruction(state, t);   // reads the plot's OLD owner, so it goes first
    setTileOwner(t, city.seat, city.id);
    city.tilesAcquired += 1;
  }
}
