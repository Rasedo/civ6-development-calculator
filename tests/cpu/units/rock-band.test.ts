import { ATHEISM_PRESSURE_PER_POP } from '../../../cpu/data/religion';
import { describe, it, expect } from 'vitest';
import { MP_SCALE, FAITH_PURCHASE_MULT } from '../../../cpu/data/constants';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { emptySeat, seatOf, setTileOwner } from '../../../cpu/core/seats';
import { spawnUnit, concertVenue, concertVenueBits, performConcert, unitFullMoves } from '../../../cpu/core/units';
import { purchaseRockBand, rockBandCost } from '../../../cpu/core/game';
import { nextRandom } from '../../../cpu/core/rand';
import { promoCount, promoReady, unitPromoRows } from '../../../cpu/core/promotions';
import {
  BAND_VENUE_BIT, CONCERT_SHARE_RANGE, PROMO_OFFER_DRAW, ROCK_BAND_MAX_PROMOTIONS,
} from '../../../cpu/data/promotions';
import { LOYALTY_MAX } from '../../../cpu/data/seats';
import { hexDistance } from '../../../world/hex';
import {
  UNITS, ROCK_BAND_VENUES, ROCK_BAND_WONDER_VENUE, ROCK_BAND_TIERS,
  ROCK_BAND_TIER_ODDS, ROCK_BAND_MAX_LEVEL, ROCK_BAND_COST_STEP,
} from '../../../cpu/data/units';
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { City, GameState, Unit } from '../../../cpu/core/types';

// THE ROCK BAND. CIV6 (Expansion2_Units.xml): a Faith-only unit behind the
// Cold War civic whose "Faith cost is progressive"; it "must always perform
// in foreign lands", and a performance pays "Tourism = Venue Tourism Value *
// (1 + (Tourism Bomb Value / 100) + (Album Sales / 100))" as a one-time burst
// "towards the civilization within whose borders it takes place". Bands
// "start at level 1 and can be promoted up to level 4"; the two best of the
// six outcomes promote the band AND grant it a promotion from its own
// twelve-row tree (ROCK_BAND_MAX_PROMOTIONS held at most), the two worst end
// it.
//
// REACHABILITY: Cold War is an Atomic-era civic no 250-turn gate game
// reaches, so the concert is poke-only on both engines — these hold the
// venue read, the tier walk, the tree and the progressive price.

const VENUE_BUILDING = 'AMPHITHEATER';
const VENUE_DISTRICT = BUILDINGS[VENUE_BUILDING].district!;

function twoSeatGame(): { state: GameState; mine: City; theirs: City } {
  const state = makeState(makeMap(20, 20));
  state.unitsMode = true;
  state.seats.push(emptySeat(1));
  const mine = settleAt(state, tileAtCoords(state.map, 4, 4).index, 0);
  const theirs = settleAt(state, tileAtCoords(state.map, 14, 14).index, 1);
  return { state, mine, theirs };
}

/** give `city` a completed venue DISTRICT on the tile next to its centre. */
function venueTile(state: GameState, city: City, building = VENUE_BUILDING): number {
  const t = state.map.tiles[city.centerIndex + 1];
  setTileOwner(t, city.seat, city.id);
  t.district = BUILDINGS[building].district!;
  t.districtComplete = true;
  city.buildings.push(building);
  return t.index;
}

function band(state: GameState, tileIndex: number, seat = 0, promos: string[] = []): Unit {
  const u = spawnUnit(state, 'ROCK_BAND', tileIndex, seat)!;
  u.tileIndex = tileIndex; // stand ON the venue, not beside it
  u.bandLevel = 1;
  u.bandAlbum = 0;
  u.promos = 0;
  for (const id of promos) u.promos |= 1 << bandCol(id);
  return u;
}

/** the band tree's wire column of a promotion id. */
function bandCol(id: string): number {
  const k = unitPromoRows({ type: 'ROCK_BAND' }).findIndex((p) => p.id === id);
  if (k < 0) throw new Error(`no band promotion ${id}`);
  return k;
}

/** the number of draws a concert took off `state`'s stream. */
function drawsTaken(before: number, state: GameState): number {
  const probe = { rngState: before } as GameState;
  for (let k = 0; k < 8; k++) {
    if (probe.rngState === state.rngState) return k;
    nextRandom(probe);
  }
  throw new Error('more than eight draws');
}

/** the rngState whose very next draw lands in `tier`'s bucket at `level`. */
function seedForTier(level: number, tier: number): number {
  const odds = ROCK_BAND_TIER_ODDS[level - 1];
  let lo = 0;
  for (let i = 0; i < tier; i++) lo += odds[i];
  const hi = lo + odds[tier];
  for (let s = 1; s < 2_000_000; s++) {
    const roll = Math.floor(nextRandom({ rngState: s } as GameState) * 1000);
    if (roll >= lo && roll < hi) return s;
  }
  throw new Error(`no rngState lands in tier ${tier} at level ${level}`);
}

describe('the rock band catalog', () => {
  it('the chassis is faith-only, behind Cold War, and carries one charge', () => {
    const def = UNITS.ROCK_BAND;
    expect(def.faithOnly).toBe(true);
    expect(def.requiresCivic).toBe('COLD_WAR');
    expect(def.combat).toBe(0);
    expect(def.charges).toBe(1);
  });

  it('every tier-odds row is a whole thousand, best tier first', () => {
    expect(ROCK_BAND_TIER_ODDS.length).toBe(ROCK_BAND_MAX_LEVEL);
    for (const row of ROCK_BAND_TIER_ODDS) {
      expect(row.length).toBe(ROCK_BAND_TIERS.length);
      expect(row.reduce((a, b) => a + b, 0)).toBe(1000);
    }
    // a higher level is strictly likelier to roll the very best outcome
    for (let i = 1; i < ROCK_BAND_TIER_ODDS.length; i++) {
      expect(ROCK_BAND_TIER_ODDS[i][0]).toBeGreaterThan(ROCK_BAND_TIER_ODDS[i - 1][0]);
    }
  });

  it('the two best tiers promote and the two worst end the band', () => {
    expect(ROCK_BAND_TIERS.map((r) => r.promote)).toEqual([true, true, false, false, false, false]);
    expect(ROCK_BAND_TIERS.map((r) => r.dies)).toEqual([false, false, false, false, true, true]);
  });
});

describe('the venue read', () => {
  it('a completed WONDER outranks every building venue', () => {
    const { state, theirs } = twoSeatGame();
    const t = state.map.tiles[theirs.centerIndex + 2];
    t.builtWonder = 'PYRAMIDS';
    t.builtWonderComplete = true;
    expect(concertVenue(state, t.index)).toBe(ROCK_BAND_WONDER_VENUE);
    t.builtWonderComplete = false;
    expect(concertVenue(state, t.index)).toBe(0); // an unfinished one is no venue
  });

  it('a district tile is worth the BEST venue building its own city holds', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs); // AMPHITHEATER, 250
    expect(concertVenue(state, tile)).toBe(ROCK_BAND_VENUES[VENUE_BUILDING]);
    theirs.buildings.push('BROADCAST_CENTER'); // same district, 750
    expect(concertVenue(state, tile)).toBe(ROCK_BAND_VENUES.BROADCAST_CENTER);
    // a venue in ANOTHER district does not pay on this tile
    theirs.buildings.push('STADIUM');
    expect(BUILDINGS.STADIUM.district).not.toBe(VENUE_DISTRICT);
    expect(concertVenue(state, tile)).toBe(ROCK_BAND_VENUES.BROADCAST_CENTER);
  });

  it('a band promotion opens its own venue kind, ADDING to what the tile already pays', () => {
    const { state, theirs } = twoSeatGame();
    // CIV6 (Music Festival): a National Park is a 1000 venue for the band that holds it
    const park = theirs.centerIndex + 3;
    setTileOwner(state.map.tiles[park], 1, theirs.id);
    state.map.tiles[park].park = park;
    expect(concertVenueBits(state, park)).toBe(BAND_VENUE_BIT.NATIONAL_PARK);
    expect(concertVenue(state, park)).toBe(0);
    expect(concertVenue(state, park, band(state, park))).toBe(0);
    expect(concertVenue(state, park, band(state, park, 0, ['MUSIC_FESTIVAL']))).toBe(1000);
    // CIV6 (Surf Band): +500 on a Harbor tile, on top of the Shipyard's own 500
    const harbor = venueTile(state, theirs, 'SHIPYARD');
    expect(concertVenueBits(state, harbor)).toBe(BAND_VENUE_BIT.HARBOR);
    expect(concertVenue(state, harbor)).toBe(ROCK_BAND_VENUES.SHIPYARD);
    expect(concertVenue(state, harbor, band(state, harbor, 0, ['SURF_BAND']))).toBe(ROCK_BAND_VENUES.SHIPYARD + 500);
    expect(concertVenue(state, harbor, band(state, harbor, 0, ['MUSIC_FESTIVAL']))).toBe(ROCK_BAND_VENUES.SHIPYARD);
    // a finished wonder is every band's 1000
    const w = theirs.centerIndex + 4;
    setTileOwner(state.map.tiles[w], 1, theirs.id);
    state.map.tiles[w].builtWonder = 'PYRAMIDS';
    state.map.tiles[w].builtWonderComplete = true;
    expect(concertVenueBits(state, w)).toBe(BAND_VENUE_BIT.WONDER);
  });

  it('an UNFINISHED district and a bare tile are both worth nothing', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    state.map.tiles[tile].districtComplete = false;
    expect(concertVenue(state, tile)).toBe(0);
    expect(concertVenue(state, theirs.centerIndex + 5)).toBe(0);
  });
});

describe('performing a concert', () => {
  it('refuses at home, on a bare tile, and to any other chassis', () => {
    const { state, mine, theirs } = twoSeatGame();
    const foreign = venueTile(state, theirs);
    const home = venueTile(state, mine);

    expect(performConcert(state, band(state, home).id, 0).ok).toBe(false);
    const bare = theirs.centerIndex + 5;
    setTileOwner(state.map.tiles[bare], 1, theirs.id);
    expect(performConcert(state, band(state, bare).id, 0).ok).toBe(false);

    const settler = spawnUnit(state, 'SETTLER', foreign, 0)!;
    settler.tileIndex = foreign;
    expect(performConcert(state, settler.id, 0).ok).toBe(false);

    expect(performConcert(state, band(state, foreign).id, 0).ok).toBe(true);
  });

  it('the burst is venue * (100 + bomb + album) / 100, addressed to the HOST', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    const venue = ROCK_BAND_VENUES[VENUE_BUILDING];
    for (let tier = 0; tier < ROCK_BAND_TIERS.length; tier++) {
      const b = band(state, tile);
      b.bandAlbum = 100; // a band with one album already sold
      state.rngState = seedForTier(1, tier);
      const own = seatOf(state, 0)!;
      own.tourismTo = [];
      expect(performConcert(state, b.id, 0).ok).toBe(true);
      const row = ROCK_BAND_TIERS[tier];
      expect(own.tourismTo![1]).toBe(Math.floor(venue * (100 + row.bomb + 100) / 100));
      expect(own.tourismTo![0] ?? 0).toBe(0); // never toward itself
    }
  });

  it('album sales accumulate, the top tiers promote, and level 4 is the ceiling', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    const b = band(state, tile);
    for (let level = 1; level < ROCK_BAND_MAX_LEVEL; level++) {
      expect(b.bandLevel).toBe(level);
      state.rngState = seedForTier(level, 0); // the very best outcome
      b.movesLeft = 2 * MP_SCALE;
      expect(performConcert(state, b.id, 0).ok).toBe(true);
      expect(b.bandAlbum).toBe(ROCK_BAND_TIERS[0].album * level);
      expect(b.movesLeft).toBe(0); // the performance ends its turn
    }
    expect(b.bandLevel).toBe(ROCK_BAND_MAX_LEVEL);
    state.rngState = seedForTier(ROCK_BAND_MAX_LEVEL, 0);
    expect(performConcert(state, b.id, 0).ok).toBe(true);
    expect(b.bandLevel).toBe(ROCK_BAND_MAX_LEVEL); // capped, not 5
  });

  it('the two worst tiers end the band', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    for (const tier of [4, 5]) {
      const b = band(state, tile);
      state.rngState = seedForTier(1, tier);
      expect(performConcert(state, b.id, 0).ok).toBe(true);
      expect(state.units.some((u) => u.id === b.id)).toBe(false);
    }
    // a middle tier keeps it alive
    const alive = band(state, tile);
    state.rngState = seedForTier(1, 2);
    expect(performConcert(state, alive.id, 0).ok).toBe(true);
    expect(state.units.some((u) => u.id === alive.id)).toBe(true);
  });

  it('exactly ONE draw is consumed where no promotion is granted', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    const b = band(state, tile);
    state.rngState = seedForTier(1, 2);
    const after = { rngState: state.rngState } as GameState;
    nextRandom(after);
    performConcert(state, b.id, 0);
    expect(state.rngState).toBe(after.rngState);
  });
});

describe('the band tree', () => {
  it('the purchase draws three distinct columns and banks the level', () => {
    const { state, mine } = twoSeatGame();
    const own = seatOf(state, 0)!;
    own.faith = 100_000;
    grantCivics(state, 'COLD_WAR');
    const seen = new Set<number>();
    for (let i = 0; i < 6; i++) { // the centre and its ring seat seven bands
      state.rngState = 7 + i * 1000;
      const before = state.rngState;
      expect(purchaseRockBand(state, mine.id, 0).ok).toBe(true);
      expect(drawsTaken(before, state)).toBe(PROMO_OFFER_DRAW);
      const u = state.units[state.units.length - 1];
      expect(u.type).toBe('ROCK_BAND');
      const off = u.promoOffer ?? 0;
      expect(promoCount({ promos: off })).toBe(PROMO_OFFER_DRAW);
      expect(off).toBeLessThan(1 << unitPromoRows(u).length);
      expect(promoReady(u)).toBe(true); // the offer IS a level to spend
      seen.add(off);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('a promoting tier grants a promotion, a pending offer banks it, four is the ceiling', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    const fresh = band(state, tile);
    let before = (state.rngState = seedForTier(1, 0));
    expect(performConcert(state, fresh.id, 0).ok).toBe(true);
    expect(drawsTaken(before, state)).toBe(1 + PROMO_OFFER_DRAW);
    expect(promoCount({ promos: fresh.promoOffer })).toBe(PROMO_OFFER_DRAW);
    expect(promoReady(fresh)).toBe(true);
    expect(fresh.promoBonus ?? 0).toBe(0);
    // the offer still unspent: the next grant is a re-arm, not a draw
    before = (state.rngState = seedForTier(2, 0));
    fresh.movesLeft = MP_SCALE;
    expect(performConcert(state, fresh.id, 0).ok).toBe(true);
    expect(drawsTaken(before, state)).toBe(1);
    expect(fresh.promoBonus).toBe(1);
    // four held: nothing more
    const full = band(state, tile, 0, ['ALBUM_COVER_ART', 'ARENA_ROCK', 'GLAM_ROCK', 'GOES_TO_11']);
    expect(promoCount(full)).toBe(ROCK_BAND_MAX_PROMOTIONS);
    before = (state.rngState = seedForTier(1, 0));
    expect(performConcert(state, full.id, 0).ok).toBe(true);
    expect(drawsTaken(before, state)).toBe(1);
    expect(full.promoOffer ?? 0).toBe(0);
    // three held and none owed: the fourth is drawn off the UNHELD columns
    const three = band(state, tile, 0, ['ALBUM_COVER_ART', 'ARENA_ROCK', 'GLAM_ROCK']);
    before = (state.rngState = seedForTier(1, 0));
    expect(performConcert(state, three.id, 0).ok).toBe(true);
    expect(drawsTaken(before, state)).toBe(1 + PROMO_OFFER_DRAW);
    expect((three.promoOffer ?? 0) & three.promos!).toBe(0);
    expect(promoCount({ promos: three.promoOffer })).toBe(PROMO_OFFER_DRAW);
  });

  it('Album Cover Art rolls a level higher at a WONDER, and only there', () => {
    const { state, theirs } = twoSeatGame();
    const w = theirs.centerIndex + 4;
    setTileOwner(state.map.tiles[w], 1, theirs.id);
    state.map.tiles[w].builtWonder = 'PYRAMIDS';
    state.map.tiles[w].builtWonderComplete = true;
    // a roll past level 1's two promoting tiers but inside level 2's
    const [o1, o2] = ROCK_BAND_TIER_ODDS;
    let seed = 0;
    for (let s = 1; s < 2_000_000 && !seed; s++) {
      const roll = Math.floor(nextRandom({ rngState: s } as GameState) * 1000);
      if (roll >= o1[0] + o1[1] && roll < o2[0] + o2[1]) seed = s;
    }
    const plain = band(state, w);
    state.rngState = seed;
    expect(performConcert(state, plain.id, 0).ok).toBe(true);
    expect(plain.bandLevel).toBe(1);
    const art = band(state, w, 0, ['ALBUM_COVER_ART']);
    state.rngState = seed;
    expect(performConcert(state, art.id, 0).ok).toBe(true);
    expect(art.bandLevel).toBe(2);
    // Arena Rock reads an Entertainment Complex, not a Theater Square
    const theater = venueTile(state, theirs, 'AMPHITHEATER');
    const arena = band(state, theater, 0, ['ARENA_ROCK']);
    state.rngState = seed;
    expect(performConcert(state, arena.id, 0).ok).toBe(true);
    expect(arena.bandLevel).toBe(1);
  });

  it('Goes to 11 shares with the majors in reach, Pop Star pays gold', () => {
    const { state, theirs } = twoSeatGame();
    state.seats.push(emptySeat(2));
    const tile = venueTile(state, theirs);
    const here = state.map.tiles[tile];
    const own = seatOf(state, 0)!;
    const lump = Math.floor(ROCK_BAND_VENUES[VENUE_BUILDING] * (100 + ROCK_BAND_TIERS[2].bomb) / 100);
    // seat 2 with a city inside the range, then one outside it
    const near = settleAt(state, tileAtCoords(state.map, here.col + 3, here.row).index, 2);
    own.tourismTo = [];
    let b = band(state, tile, 0, ['GOES_TO_11']);
    state.rngState = seedForTier(1, 2);
    expect(performConcert(state, b.id, 0).ok).toBe(true);
    expect(own.tourismTo[1]).toBe(lump);
    expect(own.tourismTo[2]).toBe(Math.floor(lump * 50 / 100));
    near.centerIndex = tileAtCoords(state.map, 0, 0).index; // beyond CONCERT_SHARE_RANGE of (14,14)
    expect(hexFar(state, near.centerIndex, tile)).toBe(true);
    own.tourismTo = [];
    b = band(state, tile, 0, ['GOES_TO_11']);
    state.rngState = seedForTier(1, 2);
    expect(performConcert(state, b.id, 0).ok).toBe(true);
    expect(own.tourismTo[2] ?? 0).toBe(0);
    // CIV6 (Pop Star): "Gains Gold equal to 25% of the Tourism generated."
    own.treasury = 100;
    b = band(state, tile, 0, ['POP_STAR']);
    state.rngState = seedForTier(1, 2);
    expect(performConcert(state, b.id, 0).ok).toBe(true);
    expect(own.treasury).toBe(100 + Math.floor(lump * 25 / 100));
  });

  it('Indie drops the host 40 loyalty, Religious Rock converts it to a founded religion', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    theirs.loyalty = LOYALTY_MAX;
    let b = band(state, tile, 0, ['INDIE']);
    state.rngState = seedForTier(1, 2);
    expect(performConcert(state, b.id, 0).ok).toBe(true);
    expect(theirs.loyalty).toBe(LOYALTY_MAX - 40);
    theirs.religionPressure = [0, 50];
    b = band(state, tile, 0, ['RELIGIOUS_ROCK']);
    state.rngState = seedForTier(1, 2);
    expect(performConcert(state, b.id, 0).ok).toBe(true);
    expect(theirs.religionPressure).toEqual([0, 50]); // no religion of its own yet
    seatOf(state, 0)!.religion.founded = true;
    b = band(state, tile, 0, ['RELIGIOUS_ROCK']);
    state.rngState = seedForTier(1, 2);
    expect(performConcert(state, b.id, 0).ok).toBe(true);
    // the smallest MAJORITY: one past the other religion's 50 and the atheism baseline together
    expect(theirs.religionPressure).toEqual([50 + ATHEISM_PRESSURE_PER_POP * theirs.population + 1, 50]);
  });

  it('Roadies is +4 Movement', () => {
    const { state, theirs } = twoSeatGame();
    const tile = venueTile(state, theirs);
    const base = unitFullMoves(state, band(state, tile));
    expect(unitFullMoves(state, band(state, tile, 0, ['ROADIES']))).toBe(base + 4 * MP_SCALE);
  });
});

/** is `a` beyond CONCERT_SHARE_RANGE of `b`? */
function hexFar(state: GameState, a: number, b: number): boolean {
  const ta = state.map.tiles[a];
  const tb = state.map.tiles[b];
  return hexDistance(ta.col, ta.row, tb.col, tb.row) > CONCERT_SHARE_RANGE;
}

describe('the progressive faith price', () => {
  it('needs the civic, charges faith, and each band raises the next price', () => {
    const { state, mine } = twoSeatGame();
    const own = seatOf(state, 0)!;
    const base = UNITS.ROCK_BAND.cost * FAITH_PURCHASE_MULT; // Cost 300 -> 600 faith at Standard
    own.faith = base * 10;

    expect(purchaseRockBand(state, mine.id, 0).ok).toBe(false); // no civic yet
    grantCivics(state, 'COLD_WAR');

    expect(rockBandCost(state, 0)).toBe(base);
    expect(purchaseRockBand(state, mine.id, 0).ok).toBe(true);
    expect(own.faith).toBe(base * 10 - base);
    expect(own.rockBandsBought).toBe(1);
    expect(rockBandCost(state, 0)).toBe(base + ROCK_BAND_COST_STEP * FAITH_PURCHASE_MULT);

    const before = own.faith;
    expect(purchaseRockBand(state, mine.id, 0).ok).toBe(true);
    expect(own.faith).toBe(before - (base + ROCK_BAND_COST_STEP * FAITH_PURCHASE_MULT));
    expect(own.rockBandsBought).toBe(2);

    const bought = state.units.filter((u) => u.type === 'ROCK_BAND' && u.seat === 0);
    expect(bought.length).toBe(2);
    for (const u of bought) {
      expect(u.bandLevel).toBe(1);
      expect(u.bandAlbum).toBe(0);
    }
  });

  it('a purse short of the live price buys nothing', () => {
    const { state, mine } = twoSeatGame();
    const own = seatOf(state, 0)!;
    grantCivics(state, 'COLD_WAR');
    own.faith = UNITS.ROCK_BAND.cost - 1;
    expect(purchaseRockBand(state, mine.id, 0).ok).toBe(false);
    expect(own.rockBandsBought ?? 0).toBe(0);
    expect(state.units.some((u) => u.type === 'ROCK_BAND')).toBe(false);
  });
});
