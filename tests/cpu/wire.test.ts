/** THE FILE IS THE INTERFACE, TypeScript half.
 *
 * `gpu/drive.py` records a driven seat's decisions as mask COLUMNS and
 * `gpu/drive.replay` proves a replay reproduces a GPU run exactly. For the
 * transcription in `phase.ts` to be DELETED rather than merely duplicated, this
 * engine has to reach the same state from the same file.
 *
 * These tests pin the contract: given a record, `seatPhase` applies it and does
 * NOT run its own ladder. The column layout comes from `src/core/prodLayout.ts`,
 * which the exporter also imports — one derivation, so the file format cannot
 * rot the way the civ mask rotted five units behind the picker.
 */
import { describe, it, expect } from 'vitest';
import { envoysOf, setMet } from '../../cpu/core/cityStates';
import { makeMap, makeState, tileAtCoords } from './helpers';
import { seatPhase, warTargets, worldCongress } from '../../cpu/core/phase';
import { effectiveSpecialists } from '../../cpu/core/city';
import { placeCityStateAt } from '../../cpu/core/cityStates';
import { PLACEABLE_DISTRICTS } from '../../cpu/data/districts';
import { prodLayout } from '../../cpu/core/prodLayout';
import { cityStateOfSeat, civsAtWar, emptySeat, isCityStateSeat, setTileOwner, setWar, setWarTurnsWith, tileSeat } from '../../cpu/core/seats';
import { tilesWithin, neighbors } from '../../world/hex';
import { spawnUnit } from '../../cpu/core/units';
import { isWater, isImpassable } from '../../world/query';
import { BUILDINGS } from '../../cpu/data/buildings';
import { SCAFFOLD_DISTRICTS } from '../../cpu/data/districts';
import type { GameState, City, Seat } from '../../cpu/core/types';

function addCiv(state: GameState, col: number, row: number): Seat {
  const tile = tileAtCoords(state.map, col, row);
  const civ: Seat = {
    ...emptySeat(state.seats.length),
    name: 'Rome', color: '#8e3db8', aggression: 0.5, seat: 1, warmonger: 0,
    ww: {}, wwTurn: {}, diplomaticFavor: 0, diplomaticPoints: 0, influencePoints: 0,
    envoysAvailable: 0, treasury: 0, scienceTotal: 0, cultureTotal: 0, faith: 0,
    tourism: 0, government: { current: null, policies: [] }, cities: [], nextCityId: 0,
    peaceTurns: 0,
    research: { tech: null, techProgress: 0, civic: null, civicProgress: 0, techs: [], civics: [], boosted: [], techRetained: {}, civicRetained: {} },
    gpp: {}, gpEarned: [], buildersTrained: 0, bestMeleeCS: 0,
    tilesPurchased: 0, spaceProjects: [],
    religion: { pantheon: null, founded: false, name: null, follower: null, founder: null, worship: null, enhancer: null, holyTile: null },
  };
  const city: City = {
    id: civ.nextCityId++, name: 'Roma', seat: civ.seat, centerIndex: tile.index,
    population: 5, foodBox: 0, cultureBox: 0, tilesAcquired: 0, focus: 'balanced', queue: [], isCapital: true, buildings: [],
    districts: [{ type: 'CITY_CENTER', tileIndex: tile.index }], wonders: [], hp: 200, foundedTurn: 1,
  };
  tile.district = 'CITY_CENTER';
  tile.districtComplete = true;
  setTileOwner(tile, civ.seat, city.id);
  for (const t of tilesWithin(state.map, col, row, 1)) {
    if (tileSeat(t) !== 0 && (isCityStateSeat(tileSeat(t)) ? cityStateOfSeat(tileSeat(t)) : -1) === -1) {
      setTileOwner(t, civ.seat, city.id);
    }
  }
  civ.cities.push(city);
  state.seats.push(civ);
  return civ;
}

describe('the action FILE drives the TS civ', () => {
  it('applies the recorded SETTLER column instead of deciding', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const L = prodLayout();
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[civ.cities[0].centerIndex, L.settlerCol]], tech: null, civic: null, units: [] } } };
    seatPhase(state);
    expect(civ.cities[0].queue[0]?.kind).toBe('settler');
  });

  it('applies a recorded BUILDING column — the exact row the file names', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const L = prodLayout();
    const col = 0;
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[civ.cities[0].centerIndex, col]], tech: null, civic: null, units: [] } } };
    seatPhase(state);
    const q = civ.cities[0].queue[0];
    expect(q?.kind).toBe('building');
    expect(q?.kind === 'building' && q.building).toBe(L.buildings[col]);
    expect(BUILDINGS[L.buildings[col]]).toBeDefined();
  });

  it('applies a recorded UNIT column', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    state.unitsMode = true; // the replay arm re-validates trainableUnits, which is empty with units off
    const civ = addCiv(state, 6, 6);
    const L = prodLayout();
    const ui = L.units.indexOf('WARRIOR');
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[civ.cities[0].centerIndex, L.unitLo + ui]], tech: null, civic: null, units: [] } } };
    seatPhase(state);
    const q = civ.cities[0].queue[0];
    expect(q?.kind).toBe('unit');
    expect(q?.kind === 'unit' && q.unit).toBe('WARRIOR');
  });

  it('IDLE queues nothing, and the ladder does not step in behind it', () => {
    // The load-bearing case. If the record were merely a hint and the ladder ran
    // anyway, this city would end up with whatever the transcription picked —
    // and the file would not be the interface at all.
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const L = prodLayout();
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[civ.cities[0].centerIndex, L.idleCol]], tech: null, civic: null, units: [] } } };
    seatPhase(state);
    expect(civ.cities[0].queue.length).toBe(0);
  });

  it('applies a recorded DISTRICT column ON THE RECORDED TILE, and nothing without one', () => {
    // WHERE a district goes is a DECISION, so the file names the tile and this
    // engine only re-validates it. No scan here means no scan to disagree with
    // the other engine's.
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    civ.research.techs.push('BRONZE_WORKING', 'MINING', 'ASTROLOGY', 'WRITING', 'POTTERY');
    civ.research.civics.push('CODE_OF_LAWS', 'FOREIGN_TRADE');
    const L = prodLayout();
    const si = SCAFFOLD_DISTRICTS.findIndex((d) => d.id === 'CAMPUS');
    expect(si).toBeGreaterThanOrEqual(0);
    const centre = civ.cities[0].centerIndex;
    const col = L.districtLo + si;
    const spot = neighbors(state.map, state.map.tiles[centre]).find((t) => tileSeat(t) === civ.seat);
    expect(spot).toBeTruthy();

    // a district column with no tile builds NOTHING — the engine never picks a plot
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[centre, col]], tech: null, civic: null, units: [] } } };
    seatPhase(state);
    expect(civ.cities[0].queue.length).toBe(0);

    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[centre, col, spot!.index]], tech: null, civic: null, units: [] } } };
    seatPhase(state);
    const q = civ.cities[0].queue[0];
    expect(q?.kind).toBe('district');
    expect(q?.kind === 'district' && q.district).toBe('CAMPUS');
    expect(q?.kind === 'district' && q.tileIndex).toBe(spot!.index);
    expect(state.map.tiles[spot!.index].district).toBe('CAMPUS');
  });

  it('replays recorded UNIT MOVE orders, one entry per step', () => {
    // made a unit's order a direction SEQUENCE, so the record holds one row
    // per step and a faithful replay walks them in order. This asserts the unit
    // actually MOVED — a replay that accepted the rows and moved nothing would
    // leave driven the other civs parked while the GPU's walked, and parity would blame
    // something else entirely.
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    state.unitsMode = true;
    const civ = addCiv(state, 6, 6);
    const spawned = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index, civ.seat);
    expect(spawned).toBeTruthy();
    const before = spawned!.tileIndex;
    const nb = neighbors(state.map, state.map.tiles[before]);
    const dir = nb.findIndex((t) => t && !isImpassable(t) && !isWater(t));
    expect(dir).toBeGreaterThanOrEqual(0);
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, units: [[dir]] } } };
    seatPhase(state);
    const after = state.units.find((u) => u.id === spawned!.id);
    expect(after).toBeTruthy();
    expect(after!.tileIndex).not.toBe(before);
  });

  it('a replayed WATER step is refused without SHIPBUILDING — and embarks with it (t43)', () => {
    // stepUnit's embark transition has no tech gate of its own (walkers gate
    // embark at CANDIDATE level), so the replay surface must refuse what the
    // GPU's apply refuses: t43 embarked a Shipbuilding-less warrior
    // toward tile 556, drifted it into a trade-route raid ring, and desynced
    // the engines by 1 food + 1 production per turn.
    const mk = (withTech: boolean) => {
      const state = makeState(makeMap(14, 14, 'GRASSLAND'));
      state.unitsMode = true;
      const civ = addCiv(state, 6, 6);
      setWar(state, civ.seat, 0, true); // the gate needs war with ANYONE
      if (withTech) civ.research.techs.push('SAILING', 'SHIPBUILDING');
      const u = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 3, 3).index, civ.seat)!;
      const nb = neighbors(state.map, state.map.tiles[u.tileIndex]);
      const dir = nb.findIndex((t) => t && !isImpassable(t));
      nb[dir]!.terrain = 'COAST';
      state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, units: [[dir]] } } };
      const before = u.tileIndex;
      seatPhase(state);
      return { moved: state.units.find((x) => x.id === u.id)!.tileIndex !== before };
    };
    expect(mk(false).moved).toBe(false); // no Shipbuilding: REFUSED
    expect(mk(true).moved).toBe(true);   // Shipbuilding at war: embarks
  });

  it('a replayed NAVAL land step is refused (a hull never walks ashore)', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    state.unitsMode = true;
    const civ = addCiv(state, 6, 6);
    civ.treasury = 50; // bankruptcy would disband the maintenance-1 galley
    const home = tileAtCoords(state.map, 3, 3);
    home.terrain = 'COAST';
    const u = spawnUnit(state, 'GALLEY', home.index, civ.seat)!;
    expect(u).toBeTruthy();
    expect(u.tileIndex).toBe(home.index);
    const nb = neighbors(state.map, home);
    const dir = nb.findIndex((t) => t && !isWater(t) && !isImpassable(t));
    expect(dir).toBeGreaterThanOrEqual(0);
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, units: [[dir]] } } };
    seatPhase(state);
    expect(state.units.find((x) => x.id === u.id)!.tileIndex).toBe(home.index);
  });

  it('a recorded WONDER column places and queues — and one-per-world refuses cross-seat', () => {
    const L = prodLayout();
    const oracleCol = L.wonderLo + L.wonders.indexOf('ORACLE');
    const mk = (claimed: boolean) => {
      const state = makeState(makeMap(14, 14, 'GRASSLAND'));
      const civ = addCiv(state, 6, 6);
      civ.research.civics.push('MYSTICISM'); // Oracle's unlock
      const hill = tilesWithin(state.map, 6, 6, 1).find((t) => t.index !== civ.cities[0].centerIndex)!;
      hill.elevation = 'HILLS';               // Oracle is hillsOnly
      if (claimed) {
        // ANOTHER civ finished it since recording — the cross-seat trap
        tileAtCoords(state.map, 12, 12).builtWonder = 'ORACLE';
      }
      state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[civ.cities[0].centerIndex, oracleCol]], tech: null, civic: null, units: [] } } };
      seatPhase(state);
      return civ.cities[0];
    };
    const civCity = mk(false);
    expect(civCity.queue[0]?.kind).toBe('wonder');
    expect(civCity.wonders.some((w) => w.id === 'ORACLE')).toBe(true);
    const rc2 = mk(true);
    expect(rc2.queue.find((q) => q.kind === 'wonder')).toBeUndefined(); // refused, never double-built
  });

  it('a recorded PROJECT column queues on a completed district', () => {
    const L = prodLayout();
    const col = L.projectLo + L.projects.indexOf('RESEARCH_GRANTS');
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const civCity = civ.cities[0];
    const dt = tilesWithin(state.map, 6, 6, 1).find((t) => t.index !== civCity.centerIndex)!;
    dt.district = 'CAMPUS';
    dt.districtComplete = true;
    civCity.districts.push({ type: 'CAMPUS', tileIndex: dt.index });
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [[civCity.centerIndex, col]], tech: null, civic: null, units: [] } } };
    seatPhase(state);
    expect(civCity.queue[0]?.kind).toBe('project');
  });

  it('a recorded DECLARE flips the seat to war; a recorded PEACE pays or refuses', () => {
    const declare = () => {
      const state = makeState(makeMap(14, 14, 'GRASSLAND'));
      const civ = addCiv(state, 6, 6);
      state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, war: 0, units: [] } } };
      seatPhase(state);
      return { state, civ };
    };
    const dec = declare();
    expect(civsAtWar(dec.state, dec.civ.seat, 0)).toBe(true);
    const peace = (treasury: number, warTurns: number) => {
      const state = makeState(makeMap(14, 14, 'GRASSLAND'));
      const civ = addCiv(state, 6, 6);
      setWar(state, civ.seat, 0, true);
      setWarTurnsWith(state, civ.seat, 0, warTurns);
      civ.treasury = treasury;
      const R = 1; // one civ in this fixture — peace col = R
      state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, war: R, units: [] } } };
      seatPhase(state);
      return { state, civ };
    };
    // funded + warTurns past the minimum: peace lands (and pays)
    const ok = peace(10000, 20);
    expect(civsAtWar(ok.state, ok.civ.seat, 0)).toBe(false);
    expect(ok.civ.treasury).toBeLessThan(10000);
    // broke: the engine re-validates and REFUSES — war continues
    const broke = peace(0, 20);
    expect(civsAtWar(broke.state, broke.civ.seat, 0)).toBe(true);
    // too early: warTurns under the minimum refuses too
    const early = peace(10000, 3);
    expect(civsAtWar(early.state, early.civ.seat, 0)).toBe(true);
  });

  it('recorded ENVOYS land at the named city-state — bank first, else influence', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const cityState = state.cityStates[0];
    if (!cityState) return; // fixture map without CS — nothing to pin here
    setMet(cityState, civ.seat);
    civ.envoysAvailable = 1;
    civ.influencePoints = 100;
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, envoys: [0, 0, 0], units: [] } } };
    seatPhase(state);
    // pick 1 spends the bank, pick 2 spends 100 influence, pick 3 REFUSES (broke)
    expect(envoysOf(cityState, civ.seat)).toBe(2);
    expect(civ.envoysAvailable).toBe(0);
    // the accrual may have added a few points this turn, but never 100
    expect(civ.influencePoints).toBeLessThan(100);
  });

  it('a recorded MINOR column declares on a city-state and sues it back for free', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const cityState = placeCityStateAt(state, 0, 'Kabul', 'militaristic', tileAtCoords(state.map, 2, 2).index);
    setMet(cityState, civ.seat);
    const targets = warTargets(state, civ.seat);
    const declareCol = targets.indexOf(cityState.seat);
    expect(declareCol).toBeGreaterThanOrEqual(0);
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, war: declareCol, units: [] } } };
    seatPhase(state);
    expect(civsAtWar(state, civ.seat, cityState.seat)).toBe(true);
    // A minor accepts peace without preconditions once the clock is up, and
    // takes no gold for it.
    setWarTurnsWith(state, civ.seat, cityState.seat, 20);
    civ.treasury = 0;
    state.seatActions = { [state.turn - 1]: { [civ.seat]: { production: [], tech: null, civic: null, war: targets.length + declareCol, units: [] } } };
    seatPhase(state);
    expect(civsAtWar(state, civ.seat, cityState.seat)).toBe(false);
    expect(civ.treasury).toBe(0);
  });

  it('a recorded SPECIALIST pin and PLOT lock move citizens off the automatic rule', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const city = civ.cities[0];
    const dt = tileAtCoords(state.map, 7, 6);
    dt.district = 'CAMPUS';
    dt.districtComplete = true;
    setTileOwner(dt, civ.seat, city.id);
    city.districts.push({ type: 'CAMPUS', tileIndex: dt.index });
    city.buildings.push('LIBRARY');
    const di = PLACEABLE_DISTRICTS.indexOf('CAMPUS');
    expect(effectiveSpecialists(state, city).get(dt.index) ?? 0).toBe(0);  // no overflow, nothing pinned
    const plot = tileAtCoords(state.map, 5, 6);
    setTileOwner(plot, civ.seat, city.id);
    state.seatActions = { [state.turn - 1]: { [civ.seat]: {
      production: [], tech: null, civic: null, units: [],
      specialists: [[city.centerIndex, di, 1]], lockTiles: [plot.index],
    } } };
    seatPhase(state);
    expect(city.specialistPref?.[di]).toBe(1);
    expect(effectiveSpecialists(state, city).get(dt.index)).toBe(1);
    expect(plot.locked).toBe(true);
    // the flip is a TOGGLE, exactly as the city screen's click is
    state.seatActions = { [state.turn - 1]: { [civ.seat]: {
      production: [], tech: null, civic: null, units: [], lockTiles: [plot.index],
    } } };
    seatPhase(state);
    expect(plot.locked).toBe(false);
  });

  it('a recorded BALLOT overrides the AI vote line', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const target = 3;
    state.seatActions = { [state.turn - 1]: { [civ.seat]: {
      production: [], tech: null, civic: null, units: [],
      vote: [[0, target, 0], null, null],
    } } };
    seatPhase(state);
    expect(civ.congressVote).toEqual([[0, target, 0], null, null]);
    // `worldCongress` runs at the turn tail and clears the ballot either way
    worldCongress(state);
    expect(civ.congressVote).toBeUndefined();
  });

  it('a seat with NO record decides NOTHING — there is no ladder behind the wire', () => {
    const state = makeState(makeMap(14, 14, 'GRASSLAND'));
    const civ = addCiv(state, 6, 6);
    const unit = spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 8, 8).index, civ.seat)!;
    const where = unit.tileIndex;
    state.seatActions = { [state.turn - 1]: {} };   // record present, this seat absent
    seatPhase(state);
    // Nothing discretionary happened: no production picked, no research
    // picked, no unit moved. The rules still ran — that is what the rest of
    // this suite covers.
    expect(civ.cities[0].queue.length).toBe(0);
    expect(civ.research.tech).toBeNull();
    expect(unit.tileIndex).toBe(where);
  });
});
