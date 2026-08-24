import { describe, it, expect } from 'vitest';
import { makeMap, makeState, settleAt, tileAtCoords, grantTechs } from '../helpers';
import { BARB_SEAT, emptySeat, seatOf, setTileOwner, setWar } from '../../../cpu/core/seats';
import { spawnUnit, unitsAt } from '../../../cpu/core/units';
import { neighbors } from '../../../world/hex';
import { outerPool, repairDrip, wallsMax, wallsTier, availableBuildings } from '../../../cpu/core/rules';
import { applyLumpYield } from '../../../cpu/core/economy';
import {
  ASSIST_RAM, ASSIST_TOWER, attackTargets, cityDamageSplit, cityDefenseStrength, cityHitClass,
  cityRangedStrength, encampmentDefense, encircled, meleeAttack, rangedAttack, siegeAssist,
  siegeMayShoot,
} from '../../../cpu/core/combat';
import { availableProjects, projectCost, purchaseBuilding, queueProject } from '../../../cpu/core/game';
import { completeProject } from '../../../cpu/core/production';
import { seatPhase } from '../../../cpu/core/phase';
import { UNITS, WALLS_TIER_CS, WALLS_TIER_HP, REPAIR_QUIET_TURNS } from '../../../cpu/data/units';

// The siege round, against the pages it came from: City combat (Civ6) for the
// perimeter, the damage classes and the siege; Battering Ram / Siege Tower for
// the support channel; Ancient/Medieval/Renaissance Walls and Urban Defenses
// for the tiers; Repair Outer Defenses for the project.

function war() {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  const city = settleAt(state, tileAtCoords(state.map, 9, 9).index, 0);
  setWar(state, 0, 1, true);
  return { state, city };
}

/** the ATTACKER's seat — the city under test belongs to seat 0, so `grantTechs`
 *  (which grants to seat 0) speaks for its owner. */
const ATK = 1;

/** put `type` on a tile `d` steps west of the centre, owned by the attacker */
function place(state: ReturnType<typeof war>['state'], centreIndex: number, type: string, d = 1) {
  const c = state.map.tiles[centreIndex];
  return spawnUnit(state, type, tileAtCoords(state.map, c.col - d, c.row).index, ATK)!;
}

describe('the siege roster', () => {
  it('CIV6: the Catapult and the Bombard carry Bombard Strength, and their ranged column is that minus 17', () => {
    expect(UNITS.CATAPULT.bombard).toBe(35);
    expect(UNITS.BOMBARD.bombard).toBe(55);
    // "-17 Bombard Strength against land units"
    expect(UNITS.CATAPULT.ranged).toEqual({ strength: 18, range: 2 });
    expect(UNITS.BOMBARD.ranged).toEqual({ strength: 38, range: 2 });
    expect(UNITS.BOMBARD.requiresResource).toBe('NITER');
  });

  it('CIV6: a siege unit pays no city penalty — the -17 it owes is against land units', () => {
    expect(cityRangedStrength('CATAPULT', WALLS_TIER_HP[1])).toBe(35);
    expect(cityRangedStrength('CATAPULT', 0)).toBe(35);
    // an ordinary land ranged unit still pays it
    expect(cityRangedStrength('ARCHER', WALLS_TIER_HP[1])).toBe(25 - 17);
    expect(cityHitClass('CATAPULT', true)).toBe('bombard');
    expect(cityHitClass('CATAPULT', false)).toBe('bombard');
    expect(cityHitClass('ARCHER', true)).toBe('ranged');
    expect(cityHitClass('SWORDSMAN', false)).toBe('melee');
  });

  it('CIV6: the two support chassis ride the civilian plane and stop at their own tier', () => {
    expect(UNITS.BATTERING_RAM.siegeSupport).toBe('RAM');
    expect(UNITS.BATTERING_RAM.siegeMaxWalls).toBe(1); // "Only effective against Ancient Walls"
    expect(UNITS.SIEGE_TOWER.siegeSupport).toBe('TOWER');
    expect(UNITS.SIEGE_TOWER.siegeMaxWalls).toBe(2); // "...Ancient Walls and Medieval Walls"
    expect(UNITS.BATTERING_RAM.charges).toBe(0);
    expect(UNITS.SIEGE_TOWER.charges).toBe(0);
    expect(UNITS.SPEARMAN.antiCavalry).toBe(true);
    expect(UNITS.WARRIOR.melee).toBe(true);
  });
});

describe('the damage split', () => {
  const W = WALLS_TIER_HP[1];

  it('CIV6: a BOMBARD attack does full damage to the perimeter', () => {
    expect(cityDamageSplit(W, W, 40, 'bombard').wall).toBe(40);
    expect(cityDamageSplit(W, W, 40, 'melee').wall).toBe(6);
  });

  it('CIV6: a Battering Ram makes the melee share full but leaves the centre reduced', () => {
    const s = cityDamageSplit(W, W, 40, 'melee', ASSIST_RAM);
    expect(s.wall).toBe(40);
    // "damage against the city itself is still subject to damage reduction
    // from Walls, while these retain most of their HP"
    expect(s.centre).toBe(1);
  });

  it('CIV6: a Siege Tower hits the centre "as if there were no walls", walls reduced as ever', () => {
    const s = cityDamageSplit(W, W, 40, 'melee', ASSIST_TOWER);
    expect(s.centre).toBe(40);
    expect(s.wall).toBe(6);
  });

  it('the breach ramp reads the TIER\'s own pool, not the Ancient one', () => {
    for (const tier of [1, 2, 3, 4]) {
      const mx = WALLS_TIER_HP[tier];
      expect(cityDamageSplit(mx, mx, 30, 'ranged').centre).toBe(1);
      expect(cityDamageSplit(Math.round(0.25 * mx), mx, 30, 'ranged').centre).toBe(30);
    }
  });
});

describe('the walls tiers', () => {
  it('CIV6: 100 / 200 / 300 and +3 Combat Strength each, stacking', () => {
    expect(WALLS_TIER_HP).toEqual([0, 100, 200, 300, 400]);
    expect(WALLS_TIER_CS).toEqual([0, 3, 6, 9, 9]); // Urban Defenses adds none
    const { state, city } = war();
    expect(wallsTier(state, city)).toBe(0);
    const base = cityDefenseStrength(state, city);
    const seen: number[] = [];
    for (const b of ['ANCIENT_WALLS', 'MEDIEVAL_WALLS', 'RENAISSANCE_WALLS']) {
      city.buildings.push(b);
      seen.push(wallsMax(state, city));
      expect(cityDefenseStrength(state, city) - base).toBe(WALLS_TIER_CS[wallsTier(state, city)]);
    }
    expect(seen).toEqual([100, 200, 300]);
  });

  it('CIV6: Steel builds Urban Defenses in every city with no building at all', () => {
    const { state, city } = war();
    expect(wallsMax(state, city)).toBe(0);
    grantTechs(state, 'STEEL');
    expect(wallsTier(state, city)).toBe(4);
    expect(wallsMax(state, city)).toBe(400);
    // ...and it adds no Combat Strength of its own beyond the Renaissance tier
    expect(WALLS_TIER_CS[4]).toBe(WALLS_TIER_CS[3]);
  });

  it('CIV6: "while city defenses are damaged, you cannot build higher levels of Walls"', () => {
    const { state, city } = war();
    grantTechs(state, 'MASONRY', 'CASTLES');
    const offered = () => availableBuildings(state, city).map((b) => b.id);
    expect(offered()).toContain('ANCIENT_WALLS');
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = WALLS_TIER_HP[1];
    expect(offered()).toContain('MEDIEVAL_WALLS');
    city.outerHp = 40; // breached
    expect(offered()).not.toContain('MEDIEVAL_WALLS');
  });

  it('CIV6 (Medieval and Renaissance Walls): "Cannot be purchased with Gold"', () => {
    const { state, city } = war();
    grantTechs(state, 'MASONRY', 'CASTLES');
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = WALLS_TIER_HP[1];
    seatOf(state, 0)!.treasury = 99999;
    const r = purchaseBuilding(state, city.id, 'MEDIEVAL_WALLS', 0);
    expect(r.ok).toBe(false);
  });
});

describe('the support units at a real city', () => {
  function scene(walls: string[]) {
    const { state, city } = war();
    for (const b of walls) city.buildings.push(b);
    city.outerHp = wallsMax(state, city);
    return { state, city };
  }

  it('a Battering Ram beside the target lends its bits to a MELEE attacker only', () => {
    const { state, city } = scene(['ANCIENT_WALLS']);
    const att = place(state, city.centerIndex, 'SWORDSMAN');
    expect(siegeAssist(state, att, city.centerIndex, 1)).toBe(0);
    // the ram stands on the attacker's own tile — adjacent to the target
    spawnUnit(state, 'BATTERING_RAM', att.tileIndex, ATK);
    expect(siegeAssist(state, att, city.centerIndex, 1)).toBe(ASSIST_RAM);
    // ...and a CAVALRY attacker gets nothing: "effective for melee and
    // anti-cavalry class units only"
    const horse = place(state, city.centerIndex, 'HORSEMAN', 2);
    horse.tileIndex = att.tileIndex;
    expect(siegeAssist(state, horse, city.centerIndex, 1)).toBe(0);
  });

  it('CIV6 (GS): the ram is dead above Ancient Walls, the tower above Medieval', () => {
    const { state, city } = scene(['ANCIENT_WALLS']);
    const att = place(state, city.centerIndex, 'SPEARMAN'); // anti-cavalry counts
    // one civilian per tile, so the two chassis take two adjacent tiles
    spawnUnit(state, 'BATTERING_RAM', att.tileIndex, ATK);
    const other = neighbors(state.map, state.map.tiles[city.centerIndex])
      .find((t) => t.index !== att.tileIndex)!;
    spawnUnit(state, 'SIEGE_TOWER', other.index, ATK);
    expect(siegeAssist(state, att, city.centerIndex, 1)).toBe(ASSIST_RAM | ASSIST_TOWER);
    expect(siegeAssist(state, att, city.centerIndex, 2)).toBe(ASSIST_TOWER);
    // "whenever a city builds Renaissance Walls, only units with Bombard
    // Strength will be able to inflict full damage to its defenses"
    expect(siegeAssist(state, att, city.centerIndex, 3)).toBe(0);
    expect(siegeAssist(state, att, city.centerIndex, 4)).toBe(0);
  });

  it('a Catapult bombardment breaches a perimeter a Swordsman barely scratches', () => {
    const a = scene(['ANCIENT_WALLS']);
    const cat = place(a.state, a.city.centerIndex, 'CATAPULT', 2);
    expect(rangedAttack(a.state, cat.id, a.city.centerIndex, ATK).ok).toBe(true);
    const byBombard = WALLS_TIER_HP[1] - a.city.outerHp!;

    const b = scene(['ANCIENT_WALLS']);
    const sw = place(b.state, b.city.centerIndex, 'SWORDSMAN');
    expect(meleeAttack(b.state, sw.id, b.city.centerIndex, ATK).ok).toBe(true);
    const byMelee = WALLS_TIER_HP[1] - b.city.outerHp!;

    expect(byBombard).toBeGreaterThan(3 * byMelee);
  });

  it('a siege unit has no melee attack at all', () => {
    const { state, city } = scene([]);
    const cat = place(state, city.centerIndex, 'CATAPULT');
    expect(meleeAttack(state, cat.id, city.centerIndex, ATK).ok).toBe(false);
  });
});

describe('the siege gate', () => {
  it('CIV6: a city heals 20 until zone of control covers EVERY passable neighbour', () => {
    const { state, city } = war();
    const centre = state.map.tiles[city.centerIndex];
    const ring = state.map.tiles.filter(
      (t) => Math.abs(t.col - centre.col) + Math.abs(t.row - centre.row) > 0,
    );
    expect(ring.length).toBeGreaterThan(0);
    const nb = [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc) => ({ dr, dc })));
    expect(encircled(state, centre, city.seat)).toBe(false);
    // one hostile beside it is not a siege
    place(state, city.centerIndex, 'WARRIOR');
    expect(encircled(state, centre, city.seat)).toBe(false);
    // fill the whole passable ring
    for (const { dr, dc } of nb) {
      if (dr === 0 && dc === 0) continue;
    }
    const neighbours = state.map.tiles.filter((t) => t.index !== centre.index
      && Math.max(Math.abs(t.col - centre.col), Math.abs(t.row - centre.row)) <= 1);
    for (const t of neighbours) {
      if (unitsAt(state, t.index).length === 0) spawnUnit(state, 'WARRIOR', t.index, ATK);
    }
    expect(encircled(state, centre, city.seat)).toBe(true);
  });

  it('CIV6: a CIVILIAN exerts no zone of control', () => {
    const { state, city } = war();
    const centre = state.map.tiles[city.centerIndex];
    const neighbours = state.map.tiles.filter((t) => t.index !== centre.index
      && Math.max(Math.abs(t.col - centre.col), Math.abs(t.row - centre.row)) <= 1);
    for (const t of neighbours) spawnUnit(state, 'BUILDER', t.index, ATK);
    expect(encircled(state, centre, city.seat)).toBe(false);
  });

  it('CIV6: "the outer defenses will not regenerate on their own"', () => {
    const { state, city } = war();
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = 40;
    city.hp = 100;
    seatPhase(state);
    expect(city.hp).toBe(120);      // the city's own 20 HP still arrives
    expect(city.outerHp).toBe(40);  // the perimeter does not
  });
});

describe('Repair Outer Defenses', () => {
  function damaged() {
    const { state, city } = war();
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = 40;
    return { state, city };
  }

  it('CIV6: it runs in the CITY CENTER — the one district every city has', () => {
    const { state, city } = damaged();
    state.turn = 1 + REPAIR_QUIET_TURNS;
    const p = availableProjects(state, city).find((x) => x.id === 'REPAIR_DEFENSES');
    expect(p?.district).toBe('CITY_CENTER');
  });

  it('CIV6: it needs Walls, damage, and three turns without an attack', () => {
    const { state, city } = damaged();
    const offered = () => availableProjects(state, city).some((p) => p.id === 'REPAIR_DEFENSES');
    state.turn = 10;
    city.lastHitTurn = 10;
    expect(offered()).toBe(false);
    for (let d = 1; d < REPAIR_QUIET_TURNS; d++) {
      city.lastHitTurn = 10 - d;
      expect(offered()).toBe(false);
    }
    city.lastHitTurn = 10 - REPAIR_QUIET_TURNS;
    expect(offered()).toBe(true);
    city.outerHp = WALLS_TIER_HP[1]; // undamaged
    expect(offered()).toBe(false);
  });

  it('CIV6: "Walls gain HP equal to the Production invested", so the price IS the missing HP', () => {
    const { state, city } = damaged();
    expect(projectCost(state, 0, 'REPAIR_DEFENSES', city)).toBe(WALLS_TIER_HP[1] - 40);
  });

  it('CIV6: completing it "fully restores the HP of the city\'s Outer Defenses"', () => {
    const { state, city } = damaged();
    completeProject(state, city, 'REPAIR_DEFENSES', 60);
    expect(city.outerHp).toBe(WALLS_TIER_HP[1]);
  });

  it('a queued repair locks its price and the queue accepts it', () => {
    const { state, city } = damaged();
    state.turn = 10;
    city.lastHitTurn = 10 - REPAIR_QUIET_TURNS;
    expect(queueProject(state, city.id, 'REPAIR_DEFENSES', 0).ok).toBe(true);
    expect(city.queue[0]).toMatchObject({ kind: 'project', project: 'REPAIR_DEFENSES', cost: 60 });
  });

  function running() {
    const { state, city } = damaged();
    state.turn = 10;
    city.lastHitTurn = 10 - REPAIR_QUIET_TURNS;
    queueProject(state, city.id, 'REPAIR_DEFENSES', 0);
    return { state, city };
  }

  it('CIV6: "Walls gain HP equal to the Production invested ... each turn the project runs"', () => {
    const { state, city } = running();
    const before = city.queue[0].progress;
    city.queue[0].progress += 12.4;
    repairDrip(state, city, before);
    expect(city.outerHp).toBe(52); // 40 + round(12.4)
    // and it never overshoots the tier's pool
    const mid = city.queue[0].progress;
    city.queue[0].progress += 1000;
    repairDrip(state, city, mid);
    expect(city.outerHp).toBe(WALLS_TIER_HP[1]);
  });

  it('damage taken mid-repair stays taken — the drip pays the DELTA, not the total', () => {
    const { state, city } = running();
    city.queue[0].progress = 30;
    city.outerHp = 20; // a hit landed while the project ran
    repairDrip(state, city, 30);
    expect(city.outerHp).toBe(20);
    const before = city.queue[0].progress;
    city.queue[0].progress += 10;
    repairDrip(state, city, before);
    expect(city.outerHp).toBe(30);
  });

  it("a chop and a Great Engineer pay the perimeter as the turn's own production does", () => {
    const { state, city } = running();
    applyLumpYield(state, city.centerIndex, { key: 'production', amount: 15 }, 0);
    expect(city.queue[0].progress).toBe(15);
    expect(city.outerHp).toBe(55);
  });

  it("the seat phase drips the turn's production into the perimeter", () => {
    const { state, city } = running();
    seatPhase(state);
    expect(city.queue[0]).toMatchObject({ kind: 'project', project: 'REPAIR_DEFENSES' });
    expect(city.outerHp).toBe(40 + Math.round(city.queue[0].progress));
    expect(city.outerHp).toBeGreaterThan(40);
  });

  it('every city-damage site stamps the clock the repair counts from', () => {
    const { state, city } = damaged();
    state.turn = 12;
    city.lastHitTurn = 0;
    const att = place(state, city.centerIndex, 'SWORDSMAN');
    expect(meleeAttack(state, att.id, city.centerIndex, ATK).ok).toBe(true);
    expect(city.lastHitTurn).toBe(12);
  });
});

describe('the move-and-shoot rule', () => {
  function scene() {
    const { state, city } = war();
    const cat = place(state, city.centerIndex, 'CATAPULT', 2);
    cat.movesFull = UNITS.CATAPULT.moves;
    cat.movesLeft = cat.movesFull;
    return { state, city, cat };
  }

  it('CIV6: "if a unit has not moved, it can always shoot"', () => {
    const { state, city, cat } = scene();
    expect(siegeMayShoot(state, cat)).toBe(true);
    expect(rangedAttack(state, cat.id, city.centerIndex, ATK).ok).toBe(true);
  });

  it('CIV6: having moved, a siege unit at its normal Movement may not shoot', () => {
    const { state, city, cat } = scene();
    cat.movesLeft = cat.movesFull! - 1;
    expect(siegeMayShoot(state, cat)).toBe(false);
    expect(rangedAttack(state, cat.id, city.centerIndex, ATK).ok).toBe(false);
    expect(attackTargets(state, cat)).toEqual([]);
  });

  it('CIV6: "maximum Movement at least 1 greater than normal" lifts the gate', () => {
    const { state, city, cat } = scene();
    spawnUnit(state, 'GENERAL', cat.tileIndex, ATK);
    cat.movesFull = UNITS.CATAPULT.moves + 1; // what refreshUnits granted beside the general
    cat.movesLeft = cat.movesFull - 1;        // and it spent one of them
    expect(siegeMayShoot(state, cat)).toBe(true);
    expect(rangedAttack(state, cat.id, city.centerIndex, ATK).ok).toBe(true);
  });

  it("the gate is the siege class's alone — an Archer shoots after moving", () => {
    const { state, city } = war();
    const arc = place(state, city.centerIndex, 'ARCHER', 2);
    arc.movesFull = UNITS.ARCHER.moves;
    arc.movesLeft = arc.movesFull! - 1;
    expect(siegeMayShoot(state, arc)).toBe(true);
    expect(rangedAttack(state, arc.id, city.centerIndex, ATK).ok).toBe(true);
  });
});

describe('the Encampment perimeter', () => {
  function withEncampment() {
    const { state, city } = war();
    city.buildings.push('ANCIENT_WALLS');
    city.outerHp = WALLS_TIER_HP[1];
    const centre = state.map.tiles[city.centerIndex];
    const enc = tileAtCoords(state.map, centre.col + 2, centre.row);
    enc.district = 'ENCAMPMENT';
    enc.districtComplete = true;
    enc.encampHp = 100;
    setTileOwner(enc, 0, city.id);
    city.districts.push({ type: 'ENCAMPMENT', tileIndex: enc.index });
    return { state, city, enc };
  }

  it('CIV6: one set of Walls "supplies both" — each its OWN pool — and the assault divides against the DISTRICT pool', () => {
    const { state, city, enc } = withEncampment();
    const att = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, enc.col + 1, enc.row).index, ATK)!;
    expect(meleeAttack(state, att.id, enc.index, ATK).ok).toBe(true);
    const perimeterLost = WALLS_TIER_HP[1] - enc.encampOuterHp!;
    const garrisonLost = 100 - enc.encampHp!;
    expect(perimeterLost).toBeGreaterThan(0);
    // "destroying the one does not destroy the other" — the CITY pool stands
    expect(city.outerHp).toBe(WALLS_TIER_HP[1]);
    expect(garrisonLost).toBe(1); // an intact perimeter holds it to 1, like a centre
    expect(perimeterLost).toBeLessThan(WALLS_TIER_HP[1] / 2); // the -85% is there
    expect(city.lastHitTurn).toBe(state.turn);
  });

  it('CIV6: the district defends at its city\'s WALLS tier, and not its garrison', () => {
    const { state, enc } = withEncampment();
    const att = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, enc.col + 1, enc.row).index, ATK)!;
    const walled = encampmentDefense(state, att, enc)!.defCS;

    const bare = withEncampment();
    bare.city.buildings = bare.city.buildings.filter((b) => b !== 'ANCIENT_WALLS');
    const att2 = spawnUnit(bare.state, 'SWORDSMAN',
      tileAtCoords(bare.state.map, bare.enc.col + 1, bare.enc.row).index, ATK)!;
    const unwalled = encampmentDefense(bare.state, att2, bare.enc)!.defCS;
    // CIV6 (Encampment): "Acquires Outer Defenses and Ranged Strike along with
    // the City Center once Walls have been built."
    expect(walled - unwalled).toBe(WALLS_TIER_CS[1]);

    // ...and "excluding any bonus obtained for a Garrisoned unit": a defender
    // standing on the centre moves the CITY's strength and not the district's.
    // The seat's best melee is pinned first, because SPAWNING the garrison
    // would otherwise raise it and move both numbers for the wrong reason.
    const gar = withEncampment();
    seatOf(gar.state, 0)!.bestMeleeCS = 50;
    const att3 = spawnUnit(gar.state, 'SWORDSMAN',
      tileAtCoords(gar.state.map, gar.enc.col + 1, gar.enc.row).index, ATK)!;
    const encBefore = encampmentDefense(gar.state, att3, gar.enc)!.defCS;
    const cityBefore = cityDefenseStrength(gar.state, gar.city);
    spawnUnit(gar.state, 'SWORDSMAN', gar.city.centerIndex, 0);
    expect(encampmentDefense(gar.state, att3, gar.enc)!.defCS).toBe(encBefore);
    expect(cityDefenseStrength(gar.state, gar.city)).toBe(cityBefore + 5);
  });

  it("with the DISTRICT's perimeter gone the whole roll reaches the garrison", () => {
    const { state, city, enc } = withEncampment();
    enc.encampOuterHp = 0;
    city.outerHp = WALLS_TIER_HP[1]; // the CITY pool standing shields nothing here
    const att = spawnUnit(state, 'SWORDSMAN', tileAtCoords(state.map, enc.col + 1, enc.row).index, ATK)!;
    expect(meleeAttack(state, att.id, enc.index, ATK).ok).toBe(true);
    expect(100 - enc.encampHp!).toBeGreaterThan(10);
  });

  it('CIV6: the district heals 20 "if its tile is not occupied"', () => {
    // a beaten-down Encampment stops blocking, which is the only way an enemy
    // reaches its tile at all — and "the moment [it] Heals some damage, its
    // tile will become Impassable again".
    const free = withEncampment();
    free.enc.encampHp = 0;
    seatPhase(free.state);
    expect(free.enc.encampHp).toBe(20);

    const held = withEncampment();
    held.enc.encampHp = 0;
    const sitter = spawnUnit(held.state, 'WARRIOR', held.enc.index, BARB_SEAT)!;
    expect(sitter.tileIndex).toBe(held.enc.index);
    seatPhase(held.state);
    expect(held.enc.encampHp).toBe(0);
  });

  it('the district fights at the city strength the walls tier raises', () => {
    const { state, city } = withEncampment();
    const before = cityDefenseStrength(state, city);
    city.buildings.push('MEDIEVAL_WALLS');
    expect(cityDefenseStrength(state, city) - before).toBe(WALLS_TIER_CS[2] - WALLS_TIER_CS[1]);
  });
});

describe('the pool convention', () => {
  it('an absent pool means FULL at the tier the city stands behind', () => {
    const { state, city } = war();
    expect(outerPool(state, city)).toBe(0);
    city.buildings.push('ANCIENT_WALLS');
    expect(city.outerHp).toBeUndefined();
    expect(outerPool(state, city)).toBe(100);
    grantTechs(state, 'STEEL');
    expect(outerPool(state, city)).toBe(400);
  });
});
