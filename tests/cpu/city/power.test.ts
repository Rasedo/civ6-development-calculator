/**
 * GS POWER: demand, the two supplies, and the all-or-nothing rule.
 *
 * Sourced from the wiki's Power page and the GS effect blocks of the buildings
 * involved: a late building has a Base Load and a second half of its yields it
 * only pays while its city meets that load in FULL; a Power Plant supplies
 * every city centre within the regional reach of its Industrial Zone; Cardiff
 * is the renewable supply, and it never leaves the city that earns it.
 */
import { describe, it, expect } from 'vitest';
import { makeMap, makeState, tileAtCoords, expandBorders } from '../helpers';
import { foundCity, queueDistrict } from '../../../cpu/core/game';
import { computeCityStats } from '../../../cpu/core/city';
import { cityPower, regionalEffects } from '../../../cpu/core/yields';
import { resolveSeatPower } from '../../../cpu/core/stockpile';
import { seatOf, setTileOwner } from '../../../cpu/core/seats';
import { availableProjects } from '../../../cpu/core/game';
import { completeProject } from '../../../cpu/core/production';
import { PROJECTS } from '../../../cpu/data/projects';
import { BIOSPHERE_POWER_MULT } from '../../../cpu/data/improvements';
import { validImprovementsIn } from '../../../cpu/core/rules';
import { STRATEGIC_IDS } from '../../../cpu/data/constants';
import type { City, GameState } from '../../../cpu/core/types';
import { CARDIFF_HARBOR_POWER } from '../../../cpu/data/cityStates';
import { REGIONAL_RANGE } from '../../../cpu/data/constants';
import { hexDistance } from '../../../world/hex';

function industrialCity() {
  const state = makeState(makeMap(24, 24));
  state.sandbox = true; // districts complete on the spot
  const city = foundCity(state, tileAtCoords(state.map, 8, 8).index, 0).city!;
  expandBorders(state, city, 3);
  city.population = 13; // the specialty-district cap is what limits placement
  const iz = tileAtCoords(state.map, 9, 8);
  expect(queueDistrict(state, city.id, 'INDUSTRIAL_ZONE', iz.index, 0).ok).toBe(true);
  const campus = tileAtCoords(state.map, 7, 8);
  expect(queueDistrict(state, city.id, 'CAMPUS', campus.index, 0).ok).toBe(true);
  return { state, city, iz, campus };
}

const cardiff = () =>
  ({ name: 'Cardiff', type: 'industrial', seat: 100, hp: 200, cityTile: 0, alive: true,
     envoys: [6, 0, 0], suzerain: 0, met: [true], influence: 0, quest: null, questCooldown: 0,
     levyTurn: -99, levySeat: -1, warTurns: [] }) as never;

/** Resolve the grid with fuel to spare — the fuel's own rule has its own
 *  cases below, and every other case is about demand and reach. */
function lit(state: GameState, city: City): boolean {
  seatOf(state, city.seat)!.stockpile = STRATEGIC_IDS.map(() => 99);
  resolveSeatPower(state, city.seat);
  return city.powered ?? false;
}

describe('power', () => {
  it('the base load is the sum of the standing buildings that ask for one', () => {
    const { state, city } = industrialCity();
    expect(cityPower(state, city)).toEqual({ demand: 0, supply: 0, plants: [] });
    city.buildings.push('RESEARCH_LAB'); // Base Load 3
    expect(cityPower(state, city)).toEqual({ demand: 3, supply: 0, plants: [] });
    expect(lit(state, city)).toBe(false); // a load with no supply
    city.buildings.push('FACTORY'); // Base Load 2
    expect(cityPower(state, city).demand).toBe(5);
    // a building with no load never joins it
    city.buildings.push('LIBRARY');
    expect(cityPower(state, city).demand).toBe(5);
  });

  it('a Power Plant lights the city, and the powered halves of its buildings pay', () => {
    const { state, city } = industrialCity();
    city.buildings.push('RESEARCH_LAB');
    const dark = computeCityStats(state, city).breakdown.buildings.science;
    city.buildings.push('COAL_POWER_PLANT');
    expect(lit(state, city)).toBe(true);
    // CIV6 (Research Lab, GS): "+3 Science", "+5 Science additionally when Powered"
    expect(computeCityStats(state, city).breakdown.buildings.science - dark).toBe(5);
  });

  it('a plant with no fuel in the bank powers nothing, and burns what it uses', () => {
    const { state, city } = industrialCity();
    const seat = seatOf(state, 0)!;
    city.buildings.push('RESEARCH_LAB'); // Base Load 3
    city.buildings.push('COAL_POWER_PLANT');
    seat.stockpile = STRATEGIC_IDS.map(() => 0);
    resolveSeatPower(state, 0);
    expect(city.powered).toBe(false); // the plant has nothing to convert
    // CIV6 (Coal Power Plant): "Conversion rate: 1 Coal -> 4 Power", so a load
    // of 3 costs one Coal
    seat.stockpile[STRATEGIC_IDS.indexOf('COAL')] = 2;
    resolveSeatPower(state, 0);
    expect(city.powered).toBe(true);
    expect(seat.stockpile[STRATEGIC_IDS.indexOf('COAL')]).toBe(1);
    resolveSeatPower(state, 0);
    expect(seat.stockpile[STRATEGIC_IDS.indexOf('COAL')]).toBe(0);
    resolveSeatPower(state, 0);
    expect(city.powered).toBe(false); // the bank ran out
  });

  it("the Coal Power Plant banks its Industrial Zone's adjacency as LOCAL production", () => {
    const { state, city, iz } = industrialCity();
    // a Mine next door: +1 Industrial Zone adjacency
    const mine = tileAtCoords(state.map, 9, 7);
    mine.improvement = 'MINE';
    const before = computeCityStats(state, city).breakdown.buildings.production;
    city.buildings.push('COAL_POWER_PLANT');
    lit(state, city);
    const adj = 1;
    expect(computeCityStats(state, city).breakdown.buildings.production - before).toBe(adj);
    // and it goes dark with its district, like every other building yield
    state.map.tiles[iz.index].districtPillaged = true;
    expect(computeCityStats(state, city).breakdown.buildings.production).toBe(before);
  });

  it('the load is met in FULL or not at all — a partial renewable supply lights nothing', () => {
    const { state, city } = industrialCity();
    const harbor = tileAtCoords(state.map, 8, 10);
    harbor.terrain = 'COAST';
    expect(queueDistrict(state, city.id, 'HARBOR', harbor.index, 0).ok).toBe(true);
    city.buildings.push('LIGHTHOUSE');
    state.cityStates = [cardiff()];
    // one Harbor building at Cardiff's rate is the whole supply
    city.buildings.push('FACTORY'); // Base Load 2
    expect(cityPower(state, city)).toMatchObject({ demand: 2, supply: CARDIFF_HARBOR_POWER });
    expect(lit(state, city)).toBe(true);
    city.buildings.push('RESEARCH_LAB'); // +3, and the supply no longer covers it
    expect(cityPower(state, city)).toMatchObject({ demand: 5, supply: CARDIFF_HARBOR_POWER });
    expect(lit(state, city)).toBe(false);
  });

  it('a plant reaches every city centre within the regional range of its Industrial Zone, and no farther', () => {
    const { state, city, iz } = industrialCity();
    city.buildings.push('COAL_POWER_PLANT');
    // the plant's Industrial Zone sits at (9, 8): `near`'s centre is exactly
    // REGIONAL_RANGE away, `far`'s one hex beyond it
    const near = foundCity(state, tileAtCoords(state.map, 9 + REGIONAL_RANGE, 8).index, 0).city!;
    const far = foundCity(state, tileAtCoords(state.map, 9, 9 + REGIONAL_RANGE).index, 0).city!;
    expect(hexDistance(9, 8, 9, 9 + REGIONAL_RANGE)).toBe(REGIONAL_RANGE + 1);
    for (const c of [near, far]) c.buildings.push('RESEARCH_LAB');
    expect(lit(state, near)).toBe(true);
    expect(far.powered).toBe(false);
    // a pillaged Industrial Zone supplies nobody
    state.map.tiles[iz.index].districtPillaged = true;
    expect(lit(state, near)).toBe(false);
  });

  it('a regional building pays its powered half from any POWERED source that reaches', () => {
    const { state, city } = industrialCity();
    const other = foundCity(state, tileAtCoords(state.map, 14, 8).index, 0).city!;
    expandBorders(state, other, 3);
    other.population = 13;
    const oiz = tileAtCoords(state.map, 12, 8); // 4 from this city's centre, 2 from its own
    expect(queueDistrict(state, other.id, 'INDUSTRIAL_ZONE', oiz.index, 0).ok).toBe(true);
    // `other` earns Cardiff's renewable supply, which "provide[s] Power only
    // for [its] respective city" — so it powers itself and never this one.
    const harbor = tileAtCoords(state.map, 14, 10);
    harbor.terrain = 'COAST';
    expect(queueDistrict(state, other.id, 'HARBOR', harbor.index, 0).ok).toBe(true);
    other.buildings.push('LIGHTHOUSE');
    state.cityStates = [cardiff()];
    // both cities hold a Factory; only `other` can meet its own load
    city.buildings.push('FACTORY');
    other.buildings.push('FACTORY');
    expect(lit(state, city)).toBe(false);
    expect(other.powered).toBe(true);
    // CIV6 (Factory, GS): "+3 Production to all City Centers within 6 tiles",
    // "+3 additional Production ... when Powered" — and the id pays once, so
    // this city's own dark Factory neither adds nor blocks.
    expect(regionalEffects(state, city).yields.production).toBe(6);
    // drop the suzerain and re-resolve: the source city goes dark, and with it
    // the powered half
    state.cityStates = [];
    resolveSeatPower(state, 0);
    expect(other.powered).toBe(false);
    expect(regionalEffects(state, city).yields.production).toBe(3);
  });

  it('a powered Stadium pays its second pair of amenities', () => {
    const { state, city } = industrialCity();
    const ec = tileAtCoords(state.map, 8, 7);
    expect(queueDistrict(state, city.id, 'ENTERTAINMENT_COMPLEX', ec.index, 0).ok).toBe(true);
    city.buildings.push('STADIUM');
    expect(regionalEffects(state, city).amenities).toBe(1);
    city.buildings.push('COAL_POWER_PLANT');
    expect(lit(state, city)).toBe(true);
    // CIV6 (Stadium, GS): "+1 Amenity", "+2 Amenities additionally when Powered"
    expect(regionalEffects(state, city).amenities).toBe(3);
  });

  it('a renewable generator supplies the city that owns its plot, and the Biosphere triples it', () => {
    const { state, city } = industrialCity();
    city.buildings.push('RESEARCH_LAB'); // Base Load 3
    expect(cityPower(state, city).supply).toBe(0);
    // CIV6 (Solar Farm): "+2 Power" to the city that owns the plot.
    const solar = tileAtCoords(state.map, 8, 9);
    setTileOwner(solar, 0);
    solar.ownerCity = city.id;
    solar.improvement = 'SOLAR_FARM';
    expect(cityPower(state, city).supply).toBe(2);
    // CIV6 (Wind Farm): another +2, and a renewable covers the load alone —
    // no stockpile stands behind it.
    const wind = tileAtCoords(state.map, 7, 9);
    setTileOwner(wind, 0);
    wind.ownerCity = city.id;
    wind.improvement = 'WIND_FARM';
    expect(cityPower(state, city).supply).toBe(4);
    seatOf(state, 0)!.stockpile = STRATEGIC_IDS.map(() => 0);
    resolveSeatPower(state, 0);
    expect(city.powered).toBe(true);
    // a pillaged generator pays nothing
    solar.pillaged = true;
    expect(cityPower(state, city).supply).toBe(2);
    solar.pillaged = false;
    // ...and a plot this city does not own pays some other city
    wind.ownerCity = city.id + 999;
    expect(cityPower(state, city).supply).toBe(2);
    wind.ownerCity = city.id;
    // CIV6 (Biosphere): "+200% Power" for every renewable the seat holds.
    const wt = tileAtCoords(state.map, 9, 9);
    setTileOwner(wt, 0);
    wt.ownerCity = city.id;
    wt.builtWonder = 'BIOSPHERE';
    wt.builtWonderComplete = true;
    city.wonders.push({ id: 'BIOSPHERE', tileIndex: wt.index });
    expect(cityPower(state, city).supply).toBe(4 * BIOSPHERE_POWER_MULT);
    // the Dam's renewable supply is on the wonder's list too
    city.buildings.push('HYDROELECTRIC_DAM');
    expect(cityPower(state, city).supply).toBe((4 + 6) * BIOSPHERE_POWER_MULT);
  });

  it('a generator is offered on its own ground and nowhere else', () => {
    const { state } = industrialCity();
    const plot = tileAtCoords(state.map, 6, 6);
    const offer = () =>
      validImprovementsIn(plot, { unlocks: null, ownsTile: () => true, builder: 'BUILDER' });
    // CIV6 (Solar Farm): "Must be built on flat terrain. Cannot be built on Snow."
    plot.terrain = 'PLAINS';
    plot.elevation = 'FLAT';
    expect(offer()).toContain('SOLAR_FARM');
    expect(offer()).not.toContain('WIND_FARM');
    plot.terrain = 'SNOW';
    expect(offer()).not.toContain('SOLAR_FARM');
    // CIV6 (Wind Farm): "Must be built on Hills terrain."
    plot.terrain = 'PLAINS';
    plot.elevation = 'HILLS';
    expect(offer()).toContain('WIND_FARM');
    expect(offer()).not.toContain('SOLAR_FARM');
    // a plot with a resource of its own accepts only that resource's row
    plot.resource = 'IRON';
    expect(offer()).toEqual(['MINE']);
    plot.resource = null;
    // and neither is the Military Engineer's to build
    expect(validImprovementsIn(plot, { unlocks: null, ownsTile: () => true, builder: 'MILITARY_ENGINEER' }))
      .not.toContain('WIND_FARM');
  });

  it('the reactor ages with its plant, and the Recommission project puts it back', () => {
    const { state, city } = industrialCity();
    const owner = seatOf(state, 0)!;
    owner.stockpile = STRATEGIC_IDS.map(() => 99);
    expect(city.reactorAge).toBeUndefined();
    // CIV6 (Nuclear accident): the age counts the turns since the plant was
    // built, converted to, or last recommissioned.
    city.buildings.push('FACTORY', 'NUCLEAR_POWER_PLANT');
    for (let i = 1; i <= 3; i += 1) {
      resolveSeatPower(state, 0);
      expect(city.reactorAge).toBe(i);
    }
    // the project is offered only once Nuclear Fission is in...
    const rec = PROJECTS.RECOMMISSION_REACTOR;
    expect(rec.requiresTech).toBe('NUCLEAR_FISSION');
    expect(availableProjects(state, city)).not.toContain(rec);
    owner.research.techs.push('NUCLEAR_FISSION');
    expect(availableProjects(state, city)).toContain(rec);
    // ...and it resets the clock, which then ticks again from zero
    completeProject(state, city, rec.id, rec.cost ?? 0);
    expect(city.reactorAge).toBe(0);
    resolveSeatPower(state, 0);
    expect(city.reactorAge).toBe(1);
    // repeatable: it is in no one-time ledger
    expect(availableProjects(state, city)).toContain(rec);
    // a plant lost with the building takes its clock with it
    city.buildings = city.buildings.filter((b) => b !== 'NUCLEAR_POWER_PLANT');
    resolveSeatPower(state, 0);
    expect(city.reactorAge).toBeUndefined();
    expect(availableProjects(state, city)).not.toContain(rec);
  });

  it('a pillaged district takes its buildings out of the demand, like their yields', () => {
    const { state, city, campus } = industrialCity();
    city.buildings.push('RESEARCH_LAB');
    expect(cityPower(state, city).demand).toBe(3);
    state.map.tiles[campus.index].districtPillaged = true;
    expect(cityPower(state, city).demand).toBe(0);
  });
});
