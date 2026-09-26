import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords } from '../helpers';
import { spawnUnit } from '../../../cpu/core/units';
import { outerPool } from '../../../cpu/core/rules';
import { cityDamageSplit, rangedCityPenalty, woundPenalty, rangedAttack, meleeAttack, hostileUnitAct, centreStrength } from '../../../cpu/core/combat';
import { BARB_SEAT, emptySeat, seatOf, seatOfCityState, setTileOwner, setWar } from '../../../cpu/core/seats';
import { minorCity } from '../../../cpu/core/cityStates';
import { ENCAMPMENT_HP, WALLS_HP } from '../../../cpu/data/units';
import { PALACE_CITY_CS, GARRISON_DAMAGE_SCALE, ENVOY_CITY_CS, CITY_START_MELEE_MAJOR, CITY_START_MELEE_MINOR, CITY_BASE_MELEE_CUT } from '../../../cpu/data/constants';
import { DISTRICTS } from '../../../cpu/data/districts';
import { tilesWithin } from '../../../world/hex';
import type { City, CityState, DistrictId, GameState, Tile } from '../../../cpu/core/types';

// The city-combat formulas, against the pages they were sourced from:
// Combat (Civ6) for the damage roll and the wound penalty, City combat (Civ6)
// for the perimeter.

describe('the wound penalty', () => {
  it('CIV6: round(10 - HP/10) — 30 HP loses 7, 1 HP loses 10', () => {
    expect(woundPenalty({ hp: 100 })).toBe(0);
    expect(woundPenalty({ hp: 30 })).toBe(7);
    expect(woundPenalty({ hp: 1 })).toBe(10);
    expect(woundPenalty({ hp: 0 })).toBe(10);
  });

  it('rounds rather than trailing off — every CS term is an integer now', () => {
    for (let hp = 0; hp <= 100; hp++) expect(Number.isInteger(woundPenalty({ hp }))).toBe(true);
    expect(woundPenalty({ hp: 95 })).toBe(1); // 10 - 9.5 = 0.5 rounds up
    expect(woundPenalty({ hp: 94 })).toBe(1);
  });
});

describe('the outer-defense perimeter', () => {
  it('CIV6: an intact perimeter holds the centre to 1 damage', () => {
    const s = cityDamageSplit(WALLS_HP, WALLS_HP, 30, 'melee');
    expect(s.centre).toBe(1);
  });

  it('CIV6: around 80% the centre "suffers not more than 5-10 damage"', () => {
    expect(cityDamageSplit(0.8 * WALLS_HP, WALLS_HP, 30, 'ranged').centre).toBe(8);
  });

  it('CIV6: half-down lets a reduced hit through; past the breach it is full', () => {
    const half = cityDamageSplit(0.5 * WALLS_HP, WALLS_HP, 30, 'ranged').centre;
    expect(half).toBeGreaterThan(8);
    expect(half).toBeLessThan(30);
    expect(cityDamageSplit(0.25 * WALLS_HP, WALLS_HP, 30, 'ranged').centre).toBe(30);
    expect(cityDamageSplit(0, WALLS_HP, 30, 'ranged').centre).toBe(30);
  });

  it('CIV6: the perimeter itself takes -85% from melee and -50% from ranged', () => {
    expect(cityDamageSplit(WALLS_HP, WALLS_HP, 40, 'melee').wall).toBe(6);
    expect(cityDamageSplit(WALLS_HP, WALLS_HP, 40, 'ranged').wall).toBe(20);
  });

  it('the pool never goes negative, and an unwalled city loses nothing to it', () => {
    expect(cityDamageSplit(3, WALLS_HP, 40, 'ranged').wall).toBe(3);
    expect(cityDamageSplit(0, WALLS_HP, 40, 'melee')).toEqual({ wall: 0, centre: 40 });
  });

  it('both shares come out of the SAME roll — a hit damages perimeter and centre at once', () => {
    const s = cityDamageSplit(0.4 * WALLS_HP, WALLS_HP, 30, 'melee');
    expect(s.wall).toBeGreaterThan(0);
    expect(s.centre).toBeGreaterThan(1);
  });
});

describe('the ranged penalty against city defenses', () => {
  it('CIV6: land ranged pay -17 whether or not a perimeter stands', () => {
    expect(rangedCityPenalty('ARCHER', WALLS_HP)).toBe(17);
    expect(rangedCityPenalty('ARCHER', 0)).toBe(17);
  });

  it('CIV6: naval ranged pay it against Walls only', () => {
    expect(rangedCityPenalty('QUADRIREME', WALLS_HP)).toBe(17);
    expect(rangedCityPenalty('QUADRIREME', 0)).toBe(0);
  });
});

describe('a city under attack', () => {
  function war() {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
    setWar(state, 0, 1, true);
    return { state, city };
  }

  it('an unwalled city takes the whole roll on its centre', () => {
    const { state, city } = war();
    const c = state.map.tiles[city.centerIndex];
    const att = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, c.col - 1, c.row).index, 0)!;
    const before = city.hp;
    expect(meleeAttack(state, att.id, city.centerIndex, 0).ok).toBe(true);
    expect(city.hp).toBeLessThan(before - 1);
    expect(outerPool(state, city)).toBe(0);
  });

  it('a walled city loses perimeter and takes 1 on the centre', () => {
    const { state, city } = war();
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = WALLS_HP;
    const c = state.map.tiles[city.centerIndex];
    const att = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, c.col - 1, c.row).index, 0)!;
    const before = city.hp;
    expect(meleeAttack(state, att.id, city.centerIndex, 0).ok).toBe(true);
    expect(city.hp).toBe(before - 1);
    // a SWORDSMAN over a 15-CS centre rolls 53-80; the perimeter takes 15% of it
    const lost = WALLS_HP - city.outerHp!;
    expect(lost).toBeGreaterThanOrEqual(8);
    expect(lost).toBeLessThanOrEqual(12);
  });

  it('a RANGED attack reaches the perimeter too', () => {
    const { state, city } = war();
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = WALLS_HP;
    const c = state.map.tiles[city.centerIndex];
    const att = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, c.col - 2, c.row).index, 0)!;
    expect(rangedAttack(state, att.id, city.centerIndex).ok).toBe(true);
    expect(city.outerHp).toBeLessThan(WALLS_HP);
    expect(city.hp).toBe(200 - 1);
  });

  it('a city with the walls building but no written pool still has one', () => {
    const { state, city } = war();
    city.buildings.push('ANCIENT_WALLS');
    expect(city.outerHp).toBeUndefined();
    expect(outerPool(state, city)).toBe(WALLS_HP);
    const c = state.map.tiles[city.centerIndex];
    const att = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, c.col - 1, c.row).index, 0)!;
    expect(meleeAttack(state, att.id, city.centerIndex, 0).ok).toBe(true);
    expect(city.hp).toBe(200 - 1);
  });

  it('the perimeter falls in the end, and then the centre takes real hits', () => {
    const { state, city } = war();
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = 4; // all but breached
    const c = state.map.tiles[city.centerIndex];
    const att = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, c.col - 1, c.row).index, 0)!;
    const before = city.hp;
    expect(meleeAttack(state, att.id, city.centerIndex, 0).ok).toBe(true);
    expect(city.outerHp).toBe(0);
    expect(before - city.hp).toBeGreaterThan(10);
    expect(seatOf(state, 1)!.cities[0].hp).toBe(city.hp);
  });
});

// CIV6 (Combat): "A unit may take shelter (that is, avoid being attacked) if it
// enters a City Center or Encampment tile. There it is invulnerable as long as
// the city/Encampment stands." And an Encampment "cannot be pillaged normally -
// they have to be 'conquered' by a melee unit, as you would a City Center. At
// this point the entire district and all buildings in it are automatically
// pillaged"; a unit sheltering there "will be destroyed instantly, regardless of
// its remaining HP".
describe('an Encampment under attack', () => {
  function scene() {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 1);
    setWar(state, 0, 1, true);
    const enc = tileAtCoords(state.map, 11, 9);
    setTileOwner(enc, 1, city.id);
    enc.district = 'ENCAMPMENT';
    enc.districtComplete = true;
    enc.districtPillaged = false;
    enc.encampHp = ENCAMPMENT_HP;
    city.districts.push({ type: 'ENCAMPMENT', tileIndex: enc.index });
    const shelter = spawnUnit(state, 'WARRIOR', enc.index, 1)!;
    const atk = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, 12, 9).index, 0)!;
    const arch = spawnUnit(state, 'ARCHER', tileAtCoords(state.map, 12, 10).index, 0)!;
    return { state, city, enc, shelter, atk, arch };
  }

  it('the DISTRICT takes the melee blow, not the unit sheltering on it', () => {
    const { state, enc, shelter, atk } = scene();
    meleeAttack(state, atk.id, enc.index, 0);
    expect(shelter.hp).toBe(100);
    expect(enc.encampHp!).toBeLessThan(ENCAMPMENT_HP);
    expect(atk.hp).toBeLessThan(100); // the district trades rolls back
  });

  it('the DISTRICT takes the ranged blow too, and a shot never conquers', () => {
    const { state, city, enc, shelter, arch } = scene();
    city.outerHp = 0; // the perimeter already breached, so the roll lands whole
    enc.encampHp = 1;
    rangedAttack(state, arch.id, enc.index);
    expect(enc.encampHp).toBe(0);
    expect(enc.districtPillaged).toBe(false);
    expect(shelter.hp).toBe(100);
    expect(state.units.some((u) => u.id === shelter.id)).toBe(true);
  });

  it('the melee assault that empties the pool CONQUERS: pillaged, shelterers destroyed', () => {
    const { state, city, enc, shelter, atk } = scene();
    city.outerHp = 0;
    enc.encampHp = 1;
    meleeAttack(state, atk.id, enc.index, 0);
    expect(enc.encampHp).toBe(0);
    expect(enc.districtPillaged).toBe(true);
    expect(state.units.some((u) => u.id === shelter.id)).toBe(false);
    expect(state.units.some((u) => u.id === atk.id)).toBe(true); // no advance
    expect(state.map.tiles[atk.tileIndex].index).not.toBe(enc.index);
  });

  it('a raider never pillages an Encampment, even with its pool beaten to 0', () => {
    const { state, enc, shelter, atk, arch } = scene();
    enc.encampHp = 0; // the block has lifted, so the tile is enterable
    // nothing to attack, so the raider reaches its pillage step
    state.units = state.units.filter(
      (u) => u.id !== shelter.id && u.id !== atk.id && u.id !== arch.id,
    );
    const raider = spawnUnit(state, 'WARRIOR', enc.index, BARB_SEAT)!;
    hostileUnitAct(state, raider);
    expect(enc.districtPillaged).toBe(false);

    // control: any OTHER district on the same tile is pillaged by that step
    const ctl = scene();
    ctl.enc.district = 'CAMPUS';
    ctl.enc.encampHp = 0;
    ctl.state.units = ctl.state.units.filter(
      (u) => u.id !== ctl.shelter.id && u.id !== ctl.atk.id && u.id !== ctl.arch.id,
    );
    hostileUnitAct(ctl.state, spawnUnit(ctl.state, 'WARRIOR', ctl.enc.index, BARB_SEAT)!);
    expect(ctl.enc.districtPillaged).toBe(true);
  });
});

// The combat preview's DEFENSES lines, one rule for every holder
// (`centreStrength`). The GPU twin is tests/gpu/centre_strength_test.py, which
// asserts the same numbers.
describe("a city centre's standing strength", () => {
  function scene() {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const capital = settleAt(state, tileAtCoords(state.map, 4, 4).index, 1);
    const city = settleAt(state, tileAtCoords(state.map, 12, 12).index, 1);
    return { state, capital, city };
  }
  function district(state: GameState, city: City, col: number, row: number, type: DistrictId): Tile {
    const t = tileAtCoords(state.map, col, row);
    setTileOwner(t, city.seat, city.id);
    t.district = type;
    t.districtComplete = true;
    t.districtPillaged = false;
    city.districts.push({ type, tileIndex: t.index });
    return t;
  }

  // runs/city_defense_preview_c38s2_era*: max(the start era's melee, the
  // best melee fielded) - 10 — an Ancient major's base is 10
  it("stands on max(the start era's melee, the best melee) - 10; the capital adds the Palace", () => {
    const { state, capital, city } = scene();
    expect([CITY_START_MELEE_MAJOR, CITY_BASE_MELEE_CUT]).toEqual([20, 10]);
    expect(centreStrength(state, city)).toBe(10);
    expect(centreStrength(state, capital)).toBe(10 + PALACE_CITY_CS);
    expect(PALACE_CITY_CS).toBe(3);
    state.seats.find((s) => s.seat === 1)!.bestMeleeCS = 65;
    expect(centreStrength(state, city)).toBe(55);
  });

  it('a Campus beside an Aqueduct adds 2, not 4: the Aqueduct carries no modifier', () => {
    const { state, city } = scene();
    district(state, city, 13, 12, 'CAMPUS');
    district(state, city, 11, 12, 'AQUEDUCT');
    expect(DISTRICTS.CAMPUS.cityStrength).toBe(2);
    expect(DISTRICTS.AQUEDUCT.cityStrength).toBe(0);
    expect(centreStrength(state, city)).toBe(10 + 2);
  });

  it('a pillaged or unfinished district adds nothing', () => {
    const { state, city } = scene();
    const campus = district(state, city, 13, 12, 'CAMPUS');
    const hub = district(state, city, 11, 12, 'COMMERCIAL_HUB');
    expect(centreStrength(state, city)).toBe(10 + 4);
    campus.districtPillaged = true;
    expect(centreStrength(state, city)).toBe(10 + 2);
    hub.districtComplete = false;
    expect(centreStrength(state, city)).toBe(10);
  });

  // runs/garrison_scale_20260926T081246Z.jsonl: base 55 (a Line Infantry 65
  // less 10), an Infantry (75) adds 20, 19, 17.5, 15, 12.5, 11 at damage 0,
  // 10, 25, 50, 75, 90
  it('the garrison adds what its Combat stands above the base, scaled by its wounds', () => {
    const { state, city } = scene();
    const inf = spawnUnit(state, 'INFANTRY', city.centerIndex, 1)!;
    expect(GARRISON_DAMAGE_SCALE).toBe(200);
    // the strongest melee on its own centre adds exactly the cut
    expect(centreStrength(state, city)).toBe(65 + 10);
    state.seats.find((s) => s.seat === 1)!.bestMeleeCS = 65;
    const read = [100, 90, 75, 50, 25, 10].map((hp) => { inf.hp = hp; return centreStrength(state, city); });
    expect(read).toEqual([75, 74, 72.5, 70, 67.5, 66]);
    // the Encampment reads without it
    expect(centreStrength(state, city, false)).toBe(55);
  });

  it('a garrison no stronger than the base and a foreign unit add nothing', () => {
    const { state, city } = scene();
    spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, 18, 18).index, 1);
    expect(centreStrength(state, city)).toBe(25);
    const w = spawnUnit(state, 'WARRIOR', city.centerIndex, 1)!;
    expect(centreStrength(state, city)).toBe(25);
    w.seat = 0;
    state.seats.find((s) => s.seat === 1)!.bestMeleeCS = 0;
    expect(centreStrength(state, city)).toBe(10);
  });

  it("a city-state's centre: max(its start melee, its best melee) - 10, the Palace, +1 per envoy", () => {
    const state = makeState(makeMap(20, 20));
    state.unitsMode = true;
    state.seats.push(emptySeat(1));
    const centre = tileAtCoords(state.map, 9, 9);
    const cs: CityState = {
      ...emptySeat(seatOfCityState(0)),
      id: 0, name: 'Envoyland', type: 'militaristic', centerIndex: centre.index,
      population: 5, envoys: { 0: 2, 1: 1 }, met: [0, 1], suzerain: 0,
    };
    for (const t of tilesWithin(state.map, 9, 9, 1)) setTileOwner(t, cs.seat);
    state.cityStates.push(cs);
    state.cityStateMax = 1;
    expect(CITY_START_MELEE_MINOR).toBe(25);
    expect(centreStrength(state, minorCity(cs))).toBe(15 + PALACE_CITY_CS + 3 * ENVOY_CITY_CS);
    // a Warrior stays under the minor's own start value
    spawnUnit(state, 'WARRIOR', tileAtCoords(state.map, 10, 9).index, cs.seat);
    expect(cs.bestMeleeCS).toBe(20);
    expect(centreStrength(state, minorCity(cs))).toBe(15 + 3 + 3);
    // the strongest melee it has fielded, not its population or its type
    spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, 10, 10).index, cs.seat);
    expect(centreStrength(state, minorCity(cs))).toBe(25 + 3 + 3);
  });
});
