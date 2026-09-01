import { describe, it, expect } from 'vitest';
import { MP_SCALE, FAITH_PURCHASE_MULT } from '../../../cpu/data/constants';
import { makeMap, makeState, settleAt, tileAtCoords, grantCivics } from '../helpers';
import { emptySeat, seatOf, setTileOwner } from '../../../cpu/core/seats';
import { spawnUnit, concertVenue, performConcert } from '../../../cpu/core/units';
import { purchaseRockBand, rockBandCost } from '../../../cpu/core/game';
import { nextRandom } from '../../../cpu/core/rand';
import {
  UNITS, ROCK_BAND_VENUES, ROCK_BAND_WONDER_VENUE, ROCK_BAND_TIERS,
  ROCK_BAND_TIER_ODDS, ROCK_BAND_MAX_LEVEL, ROCK_BAND_COST_STEP,
} from '../../../cpu/data/units';
import { BUILDINGS } from '../../../cpu/data/buildings';
import type { City, GameState, Unit } from '../../../cpu/core/types';

// THE ROCK BAND. CIV6: a Faith-only unit behind Professional Sports whose
// "Faith cost is progressive"; it "must always perform in foreign lands", and
// a performance pays "Tourism = Venue Tourism Value * (1 + (Tourism Bomb
// Value / 100) + (Album Sales / 100))" as a one-time burst "towards the
// civilization within whose borders it takes place". Bands "start at level 1
// and can be promoted up to level 4"; the two best of the six outcomes
// promote, the two worst end the band.
//
// REACHABILITY: Professional Sports is an Information-era civic no 250-turn
// gate game reaches, so the concert is poke-only on both engines — these
// hold the venue read, the tier walk and the progressive price.

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

function band(state: GameState, tileIndex: number, seat = 0): Unit {
  const u = spawnUnit(state, 'ROCK_BAND', tileIndex, seat)!;
  u.tileIndex = tileIndex; // stand ON the venue, not beside it
  u.bandLevel = 1;
  u.bandAlbum = 0;
  return u;
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
  it('the chassis is faith-only, behind Professional Sports, and carries one charge', () => {
    const def = UNITS.ROCK_BAND;
    expect(def.faithOnly).toBe(true);
    expect(def.requiresCivic).toBe('PROFESSIONAL_SPORTS');
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

  it('exactly ONE draw is consumed, whatever the tier', () => {
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

describe('the progressive faith price', () => {
  it('needs the civic, charges faith, and each band raises the next price', () => {
    const { state, mine } = twoSeatGame();
    const own = seatOf(state, 0)!;
    const base = UNITS.ROCK_BAND.cost * FAITH_PURCHASE_MULT; // Cost 300 -> 600 faith at Standard
    own.faith = base * 10;

    expect(purchaseRockBand(state, mine.id, 0).ok).toBe(false); // no civic yet
    grantCivics(state, 'PROFESSIONAL_SPORTS');

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
    grantCivics(state, 'PROFESSIONAL_SPORTS');
    own.faith = UNITS.ROCK_BAND.cost - 1;
    expect(purchaseRockBand(state, mine.id, 0).ok).toBe(false);
    expect(own.rockBandsBought ?? 0).toBe(0);
    expect(state.units.some((u) => u.type === 'ROCK_BAND')).toBe(false);
  });
});
