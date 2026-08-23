import { describe, it, expect } from 'vitest';
import type { Seat } from '../../../cpu/core/types';
import { seatOf } from '../../../cpu/core/seats';
import { createGame, endTurn, unitPurchaseCost } from '../../../cpu/core/game';
import { seatPhase, worldCongress } from '../../../cpu/core/phase';
import { settleFirstCity } from '../helpers';
import { CONGRESS_INTERVAL, CONGRESS_MIN_ERA, DVP_PER_RESOLUTION, DIPLO_VICTORY_POINTS, CONGRESS_UDT, CONGRESS_PATRONAGE, CONGRESS_MIGRATION, CONGRESS_HERITAGE, CONGRESS_MERCENARY, CONGRESS_TRADE_POLICY, CONGRESS_POLICY_TREATY, CONGRESS_IDEOLOGY, CONGRESS_BORDER_CONTROL, CONGRESS_TREATY_ORG, CONGRESS_SOVEREIGNTY, CONGRESS_PUBLIC_WORKS, CONGRESS_RESOLUTIONS, CONGRESS_TARGET_KINDS , CONGRESS_DEFORESTATION } from '../../../cpu/data/seats';
import { preference as congressPreference, congressChopBanned, congressChopGold, congressGppFactor, congressGrowthMult, congressLoyaltyDelta, congressUdtBlockedDistrict, congressUdtProdDistrict, congressGwMult, congressUnitBuyMult, congressTradeGold, congressRouteCapacity, congressIntlBanned, congressPolicyFavor, congressPolicyBlocked, congressWildcardDelta, congressCultureBombSeat, congressBorderFrozen, congressSuzFavorMult, congressCsRouteMult, congressSuzBonusBlocked, congressProjectMult, CONGRESS_CUR_GOLD, CONGRESS_CUR_FAITH } from '../../../cpu/core/congress';
import { congressCancelBannedIntl } from '../../../cpu/core/trade';
import { completeQueueItem } from '../../../cpu/core/production';
import { setTileOwner, tileCity, tileSeat } from '../../../cpu/core/seats';
import { neighbors } from '../../../world/hex';
import { clearableFeatures } from '../../../world/features';
import { canRemoveFeature } from '../../../cpu/core/rules';
import { CITY_STATE_TYPES } from '../../../cpu/data/cityStates';
import { isWater } from '../../../world/query';
import { BUILT_WONDERS } from '../../../cpu/data/builtWonders';
import { UNITS } from '../../../cpu/data/units';
import { GOLD_PURCHASE_MULT } from '../../../cpu/data/constants';
import { CONGRESS_PUBLIC_RELATIONS, CONGRESS_MILITARY_ADVISORY, CONGRESS_WORLD_RELIGION, CONGRESS_ADVISORY_CS, CONGRESS_WORLD_RELIGION_RS, CONGRESS_WORLD_RELIGION_FAVOR, CONGRESS_VOTE_STEP, GRIEVANCE_DECAY_BASE } from '../../../cpu/data/seats';
import { PROMO_CLASSES } from '../../../cpu/data/promotions';
import { addGrievance, grievanceWith, decayGrievances } from '../../../cpu/core/grievance';
import { congressUnitCS, defenderCS, theoStrength } from '../../../cpu/core/combat';
import { condemnHeretic } from '../../../cpu/core/game';
import { spawnUnit } from '../../../cpu/core/units';
import { setWar } from '../../../cpu/core/seats';

// WORLD CONGRESS. Sourced (Civilopedia GS): the Congress begins
// meeting once the game reaches the MEDIEVAL era and convenes every 30 turns;
// resolutions are voted on with Diplomatic Favor; Diplomatic Victory needs 20
// Diplomatic Victory Points.
//
// REACHABILITY: the Congress convenes 5-6 times per seed in the gate, so the
// SESSION, the slate and the combo AWARD are exercised there
// (congressSessions/diplomaticPoints/congressActive are compared columns).
// The 20-point WIN is not reachable at 250 turns; these pokes are its bar.

function newGame(opponents = 1) {
  const state = createGame({
    width: 44, height: 26, seed: 4242,
    withResources: true, withWonders: false, unitsMode: false,
    withVillages: false, cityStates: 0, opponents,
  });
  settleFirstCity(state, 0);
  state.autoResearch = false;
  return state;
}

/** Force every civ past the Medieval gate by handing them a Medieval tech. */
function medieval(state: ReturnType<typeof newGame>) {
  seatOf(state, 0)!.research.techs.push('APPRENTICESHIP'); // Medieval
  for (const civSeat of state.seats.slice(1)) civSeat.research.techs.push('APPRENTICESHIP');
}

describe('world congress', () => {
  it('does not convene before the MEDIEVAL era', () => {
    const state = newGame(1);
    state.turn = CONGRESS_INTERVAL; // a session turn ...
    seatOf(state, 0)!.diplomaticFavor = 50;
    worldCongress(state);
    expect(state.congressSessions ?? 0).toBe(0); // ... but nobody is Medieval
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(50); // favor untouched
  });

  it('convenes only on interval turns', () => {
    const state = newGame(1);
    medieval(state);
    state.turn = CONGRESS_INTERVAL + 1;
    worldCongress(state);
    expect(state.congressSessions ?? 0).toBe(0);
    state.turn = CONGRESS_INTERVAL * 2;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
  });

  it('a pre-Modern session runs the two-slot slate, spends NO favor, and pays every winning-combo voter', () => {
    const state = newGame(1);
    medieval(state);
    settleFirstCity(state, 1); // a cityless civ casts no vote
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 50;
    (state.seats[1] as Seat).diplomaticFavor = 90;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    // the Medieval-eligible slate is Urban Development Treaty + Patronage
    expect(state.congress!.map((a) => a.res)).toEqual([CONGRESS_UDT, CONGRESS_PATRONAGE]);
    expect(state.congress!.every((a) => a.outcome === 0)).toBe(true);
    // favor is only walked on the DV resolution, which needs Modern
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(50);
    expect((state.seats[1] as Seat).diplomaticFavor).toBe(90);
    // both civs prefer target 0 on both slates (no placeable district, no
    // GPP), so both voted the winning combo twice: +1 DVP each per resolution
    expect(seatOf(state, 0)!.diplomaticPoints).toBe(2 * DVP_PER_RESOLUTION);
    expect((state.seats[1] as Seat).diplomaticPoints).toBe(2 * DVP_PER_RESOLUTION);
  });

  it('a cityless civ casts no vote', () => {
    const state = newGame(1);
    (state.seats[1] as Seat).cities = []; // eliminated
    medieval(state);
    state.turn = CONGRESS_INTERVAL;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    expect(seatOf(state, 0)!.diplomaticPoints).toBe(2 * DVP_PER_RESOLUTION);
    expect((state.seats[1] as Seat).diplomaticPoints ?? 0).toBe(0);
  });

  it('from Modern the DV resolution runs third: the favor curve, the leader pile-on, the refund tiers', () => {
    const state = newGame(1);
    medieval(state);
    settleFirstCity(state, 1);
    seatOf(state, 0)!.research.techs.push('RADIO'); // the world era is Modern
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticPoints = 5; // seat 0 leads
    // 65 favor walks 3 extra votes (10+20+30=60, 5 short of the 4th)
    seatOf(state, 0)!.diplomaticFavor = 65;
    // 100 favor walks exactly 4 (10+20+30+40)
    (state.seats[1] as Seat).diplomaticFavor = 100;
    worldCongress(state);
    // the DV resolution is not a STANDING effect — only the two slates are
    expect(state.congress!.length).toBe(2);
    // seat 1's B-on-leader (1+4 votes) beats seat 0's A-on-self (1+3):
    // outcome B wins, so the loser (seat 0) is refunded 100% and the winner
    // keeps nothing and takes +1 DVP; the leader loses CONGRESS_DV_DELTA.
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(65);
    expect((state.seats[1] as Seat).diplomaticFavor).toBe(0);
    // DVP: seat 0 = 5 + 2 (both slates) - 2 (the DV effect) = 5;
    // seat 1 = 2 (both slates) + 1 (winning DV combo) = 3
    expect(seatOf(state, 0)!.diplomaticPoints).toBe(5);
    expect((state.seats[1] as Seat).diplomaticPoints).toBe(3);
  });

  it('the standing resolutions drive the effect readers, both outcomes', () => {
    const state = newGame(1);
    state.congress = [
      { res: CONGRESS_PATRONAGE, outcome: 0, target: 0 }, // SCIENTIST x2
      { res: CONGRESS_MIGRATION, outcome: 1, target: 0 },
    ];
    expect(congressGppFactor(state, 'SCIENTIST')).toBe(2);
    expect(congressGppFactor(state, 'ENGINEER')).toBe(1);
    expect(congressGrowthMult(state, 0)).toBe(0.8);
    expect(congressGrowthMult(state, 1)).toBe(1);
    expect(congressLoyaltyDelta(state, 0)).toBe(5);
    expect(congressLoyaltyDelta(state, 1)).toBe(0);
    state.congress = [{ res: CONGRESS_UDT, outcome: 1, target: 0 }]; // CAMPUS banned
    expect(congressUdtBlockedDistrict(state)).toBe('CAMPUS');
    expect(congressUdtProdDistrict(state)).toBe(null);
    state.congress = [
      { res: CONGRESS_UDT, outcome: 0, target: 0 },
      { res: CONGRESS_HERITAGE, outcome: 0, target: 1 },
    ];
    expect(congressUdtProdDistrict(state)).toBe('CAMPUS');
    expect(congressUdtBlockedDistrict(state)).toBe(null);
    expect(congressGwMult(state)).toEqual([1, 2, 1]);
    state.congress = [{ res: CONGRESS_HERITAGE, outcome: 1, target: 2 }];
    expect(congressGwMult(state)).toEqual([1, 1, 0]);
  });

  it('the wonder DVP magnitudes are the sourced ones', () => {
    // CIV6: Statue of Liberty +4 DVP on completion; Potala Palace +1 DVP
    // and +1 Diplomatic policy slot.
    expect(BUILT_WONDERS.STATUE_OF_LIBERTY.effects?.dvp).toBe(4);
    expect(BUILT_WONDERS.POTALA_PALACE.effects?.dvp).toBe(1);
    expect(BUILT_WONDERS.POTALA_PALACE.effects?.extraSlots?.diplomatic).toBe(1);
    expect(BUILT_WONDERS.FORBIDDEN_CITY.effects?.extraSlots?.wildcard).toBe(1);
  });

  it('the Medieval gate reads ANY civ, not just seat 0', () => {
    const state = newGame(1);
    (state.seats[(0) + 1] as Seat).research.techs.push('APPRENTICESHIP'); // only the civ
    state.turn = CONGRESS_INTERVAL;
    seatOf(state, 0)!.diplomaticFavor = 5;
    worldCongress(state);
    expect(state.congressSessions).toBe(1);
    expect(seatOf(state, 0)!.diplomaticFavor).toBe(5); // no DV slot before Modern
    expect(CONGRESS_MIN_ERA).toBe(2); // sourced: Medieval
  });
});

describe('diplomatic victory', () => {
  it('20 points wins, for whichever seat holds them', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(6);
    expect(state.victoryRow).toBe(0);
    expect(state.gameOver).toBe(true);
  });

  it('a civ reaching 20 wins the SAME way — only the victor differs', () => {
    const state = newGame(1);
    (state.seats[(0) + 1] as Seat).diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(6);
    expect(state.victoryRow).toBe(1);
    expect(state.gameOver).toBe(true);
  });

  it('19 points is not a win — the bar is the full threshold', () => {
    const state = newGame(1);
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS - 1;
    endTurn(state);
    expect(state.victoryType).not.toBe(6);
    expect(state.victoryRow).toBe(-1);
    expect(state.gameOver).toBe(false);
  });

  it('a CULTURE victory outranks a diplomatic one on the same turn', () => {
    const state = newGame(1);
    // seat 0 would win on culture ...
    seatOf(state, 0)!.tourism = 5 * 2 * 200;
    seatOf(state, 0)!.cultureTotal = 100;
    (state.seats[(0) + 1] as Seat).cultureTotal = 400;
    (state.seats[(0) + 1] as Seat).tourism = 0;
    // ... and on diplomacy
    seatOf(state, 0)!.diplomaticPoints = DIPLO_VICTORY_POINTS;
    endTurn(state);
    expect(state.victoryType).toBe(5); // culture ranks first
  });
});

// The EIGHT resolutions beyond the original slate. Each A/B text is quoted at
// its catalog row; these pokes hold the reader that consumes it, both faces.
describe('world congress: the wider slate', () => {
  it('Mercenary Companies prices military purchases in the named currency', () => {
    const state = newGame(1);
    state.congress = [{ res: CONGRESS_MERCENARY, outcome: 0, target: CONGRESS_CUR_GOLD }];
    expect(congressUnitBuyMult(state, CONGRESS_CUR_GOLD)).toBe(2);
    expect(congressUnitBuyMult(state, CONGRESS_CUR_FAITH)).toBe(1);
    state.congress = [{ res: CONGRESS_MERCENARY, outcome: 1, target: CONGRESS_CUR_FAITH }];
    expect(congressUnitBuyMult(state, CONGRESS_CUR_FAITH)).toBe(0.5);
    expect(congressUnitBuyMult(state, CONGRESS_CUR_GOLD)).toBe(1);
  });

  it('the Mercenary price reaches the unit BUY applier, not just the helper', () => {
    const state = newGame(1);
    state.congress = [{ res: CONGRESS_MERCENARY, outcome: 1, target: CONGRESS_CUR_GOLD }];
    const actor = state.seats[0] as Seat;
    const full = (UNITS.WARRIOR?.cost ?? 0) * GOLD_PURCHASE_MULT;
    expect(unitPurchaseCost(state, 'WARRIOR', actor.seat)).toBe(full / 2);

    state.unitsMode = true;
    actor.treasury = full / 2; // a purse only the DISCOUNTED price fits
    state.seatActions = { [state.turn - 1]: { [actor.seat]: {
      production: [], tech: null, civic: null, units: [], buy: [2, -1, -1],
    } } };
    seatPhase(state);
    expect(state.units!.some((u) => u.seat === actor.seat && (UNITS[u.type]?.combat ?? 0) > 0)).toBe(true);
    expect(actor.treasury).toBeLessThan(full); // never charged the undiscounted price
  });

  it('Trade Policy pays the sender and widens the target, or ends every international leg', () => {
    const state = newGame(1);
    state.congress = [{ res: CONGRESS_TRADE_POLICY, outcome: 0, target: 1 }];
    expect(congressTradeGold(state, 1)).toBe(4);
    expect(congressTradeGold(state, 0)).toBe(0);
    expect(congressRouteCapacity(state, 1)).toBe(1);
    expect(congressRouteCapacity(state, 0)).toBe(0);
    expect(congressIntlBanned(state, 1)).toBe(false);
    state.congress = [{ res: CONGRESS_TRADE_POLICY, outcome: 1, target: 1 }];
    expect(congressIntlBanned(state, 1)).toBe(true);
    expect(congressIntlBanned(state, 0)).toBe(false);
    expect(congressTradeGold(state, 1)).toBe(0);
  });

  it('a passed Trade Policy B cancels the standing legs at both ends and hands the Traders back', () => {
    const state = newGame(1);
    settleFirstCity(state, 1);
    const a = seatOf(state, 0)!, b = seatOf(state, 1)!;
    a.tradeRoutes = [{ from: a.cities[0].id, to: -1, toSeat: 1, toSeatCity: b.cities[0].id }];
    b.tradeRoutes = [{ from: b.cities[0].id, to: -1, toSeat: 0, toSeatCity: a.cities[0].id }];
    state.congress = [{ res: CONGRESS_TRADE_POLICY, outcome: 1, target: 1 }];
    congressCancelBannedIntl(state);
    expect(a.tradeRoutes).toEqual([]);
    expect(b.tradeRoutes).toEqual([]);
  });

  it('Policy Treaty pays every holder of the card, or bans it outright', () => {
    const state = newGame(1);
    state.congress = [{ res: CONGRESS_POLICY_TREATY, outcome: 0, target: 3 }];
    expect(congressPolicyFavor(state, [1, 3])).toBe(1);
    expect(congressPolicyFavor(state, [1, 2])).toBe(0);
    expect(congressPolicyBlocked(state)).toBe(-1);
    state.congress = [{ res: CONGRESS_POLICY_TREATY, outcome: 1, target: 3 }];
    expect(congressPolicyBlocked(state)).toBe(3);
    expect(congressPolicyFavor(state, [3])).toBe(0);
  });

  it('World Ideology moves one wildcard slot on the named government only', () => {
    const state = newGame(1);
    state.congress = [{ res: CONGRESS_IDEOLOGY, outcome: 0, target: 2 }];
    expect(congressWildcardDelta(state, 2)).toBe(1);
    expect(congressWildcardDelta(state, 1)).toBe(0);
    state.congress = [{ res: CONGRESS_IDEOLOGY, outcome: 1, target: 2 }];
    expect(congressWildcardDelta(state, 2)).toBe(-1);
  });

  it('Border Control names one bomber or one frozen seat, never both', () => {
    const state = newGame(1);
    state.congress = [{ res: CONGRESS_BORDER_CONTROL, outcome: 0, target: 1 }];
    expect(congressCultureBombSeat(state)).toBe(1);
    expect(congressBorderFrozen(state, 1)).toBe(false);
    state.congress = [{ res: CONGRESS_BORDER_CONTROL, outcome: 1, target: 1 }];
    expect(congressCultureBombSeat(state)).toBe(-1);
    expect(congressBorderFrozen(state, 1)).toBe(true);
    expect(congressBorderFrozen(state, 0)).toBe(false);
  });

  it('Treaty Organization and Sovereignty key on the city-state TYPE', () => {
    const state = newGame(1);
    state.congress = [
      { res: CONGRESS_TREATY_ORG, outcome: 0, target: 2 },
      { res: CONGRESS_SOVEREIGNTY, outcome: 0, target: 3 },
    ];
    expect(congressSuzFavorMult(state, 2)).toBe(2);
    expect(congressSuzFavorMult(state, 1)).toBe(1);
    expect(congressCsRouteMult(state, 3)).toBe(2);
    expect(congressCsRouteMult(state, 2)).toBe(1);
    expect(congressSuzBonusBlocked(state, 3)).toBe(false);
    state.congress = [
      { res: CONGRESS_TREATY_ORG, outcome: 1, target: 2 },
      { res: CONGRESS_SOVEREIGNTY, outcome: 1, target: 3 },
    ];
    expect(congressSuzFavorMult(state, 2)).toBe(0);
    expect(congressCsRouteMult(state, 3)).toBe(1);
    expect(congressSuzBonusBlocked(state, 3)).toBe(true);
  });

  it('Public Works Program doubles or halves the named project', () => {
    const state = newGame(1);
    state.congress = [{ res: CONGRESS_PUBLIC_WORKS, outcome: 0, target: 1 }];
    expect(congressProjectMult(state, 1)).toBe(2);
    expect(congressProjectMult(state, 0)).toBe(1);
    state.congress = [{ res: CONGRESS_PUBLIC_WORKS, outcome: 1, target: 1 }];
    expect(congressProjectMult(state, 1)).toBe(0.5);
  });

  it('every resolution names a target space the vote can address', () => {
    // A target index the tally can produce must be legal for the reader; the
    // kinds are what size that space, so each one has to be known.
    for (const r of CONGRESS_RESOLUTIONS) {
      expect(CONGRESS_TARGET_KINDS).toContain(r.target);
    }
  });
});

describe('the culture bomb', () => {
  it('claims a neighbour of a new district for the bomber, and skips a district tile', () => {
    const state = newGame(1);
    settleFirstCity(state, 1);
    const city = seatOf(state, 0)!.cities[0];
    state.congress = [{ res: CONGRESS_BORDER_CONTROL, outcome: 0, target: 0 }];
    const around = neighbors(state.map, state.map.tiles[city.centerIndex]);
    const spot = around.find((t) => !isWater(t) && t.index !== city.centerIndex)!;
    const ring = neighbors(state.map, spot).filter((t) => t.index !== city.centerIndex);
    const foreign = ring[0];
    setTileOwner(foreign, 1, 999);       // another seat's plot, inside the blast
    const paved = ring[1];
    paved.district = 'CAMPUS';           // a district is never bombed away
    const pavedOwner = tileSeat(paved);
    const before = city.tilesAcquired;
    completeQueueItem(state, city, { kind: 'district', district: 'CAMPUS', tileIndex: spot.index, progress: 0 }, 0);
    expect(tileSeat(foreign)).toBe(0);
    expect(tileCity(foreign)).toBe(city.id);
    expect(tileSeat(paved)).toBe(pavedOwner);
    expect(city.tilesAcquired).toBeGreaterThan(before);
  });

  it('does not fire for a seat the resolution did not name', () => {
    const state = newGame(1);
    const city = seatOf(state, 0)!.cities[0];
    state.congress = [{ res: CONGRESS_BORDER_CONTROL, outcome: 0, target: 1 }];
    const spot = neighbors(state.map, state.map.tiles[city.centerIndex]).find((t) => !isWater(t))!;
    const foreign = neighbors(state.map, spot).find((t) => tileSeat(t) < 0)!;
    completeQueueItem(state, city, { kind: 'district', district: 'CAMPUS', tileIndex: spot.index, progress: 0 }, 0);
    expect(tileSeat(foreign)).toBe(-1);
  });
});

describe('the Deforestation Treaty', () => {
  // CIV6: "A: Clearing Features of this type yields Gold equal to the
  // Production and Food. / B: Features of this type cannot be cleared by any
  // player." The target is the FEATURE, so both outcomes read the tile.
  const CLEARABLE = clearableFeatures();

  it('outcome B refuses the chop, and only for the named feature', () => {
    const state = newGame(1);
    const woods = CLEARABLE.indexOf('WOODS');
    expect(woods).toBeGreaterThanOrEqual(0);
    expect(congressChopBanned(state, 'WOODS')).toBe(false);
    state.congress = [{ res: CONGRESS_DEFORESTATION, outcome: 1, target: woods }];
    expect(congressChopBanned(state, 'WOODS')).toBe(true);
    expect(congressChopBanned(state, 'MARSH')).toBe(false);
    expect(congressChopBanned(state, null)).toBe(false);
    // and the gate is the one the builder verb asks
    const t = state.map.tiles.find((x) => x.feature === 'WOODS' && !isWater(x))!;
    seatOf(state, 0)!.research.techs.push('MINING', 'BRONZE_WORKING');
    expect(canRemoveFeature(state, t, 0).ok).toBe(false);
  });

  it('outcome A pays a SECOND lump in gold, in the chop amount', () => {
    const state = newGame(1);
    const woods = CLEARABLE.indexOf('WOODS');
    expect(congressChopGold(state, 'WOODS', 40)).toBe(0);
    state.congress = [{ res: CONGRESS_DEFORESTATION, outcome: 0, target: woods }];
    expect(congressChopGold(state, 'WOODS', 40)).toBe(40);
    expect(congressChopGold(state, 'MARSH', 40)).toBe(0);
    // A never bans
    expect(congressChopBanned(state, 'WOODS')).toBe(false);
  });

  it('the AI line votes A on the clearable feature the seat owns most of', () => {
    const state = newGame(1);
    const city = seatOf(state, 0)!.cities[0];
    const owned = state.map.tiles.filter((t) => tileSeat(t) === 0 && t.index !== city.centerIndex);
    expect(owned.length).toBeGreaterThan(1);
    const marsh = CLEARABLE.indexOf('MARSH');
    for (const t of owned) t.feature = 'MARSH';
    const p = congressPreference(state, CONGRESS_DEFORESTATION, 0,
      { government: 0, policies: [], envoysByType: CITY_STATE_TYPES.map(() => 0) });
    expect(p.outcome).toBe(0);
    expect(p.target).toBe(marsh);
  });
});

describe('the three unwritten resolutions', () => {
  it('PUBLIC RELATIONS scales what an ACT generates, never the decay, and only the named seat', () => {
    const state = newGame(2);
    state.congress = [{ res: CONGRESS_PUBLIC_RELATIONS, outcome: 0, target: 1 }];
    addGrievance(state, 0, 1, 100);
    expect(grievanceWith(state, 0, 1)).toBe(200);   // the target GENERATED it
    addGrievance(state, 1, 2, 100);
    expect(grievanceWith(state, 1, 2)).toBe(200);   // ...and the other side too
    addGrievance(state, 0, 2, 100);
    expect(grievanceWith(state, 0, 2)).toBe(100);   // a pair it is not in stands
    // the decay is a PAYBACK: it walks the era rate, not the doubled one
    decayGrievances(state, 0);
    expect(grievanceWith(state, 0, 1)).toBe(200 - GRIEVANCE_DECAY_BASE);
    const s2 = newGame(1);
    s2.congress = [{ res: CONGRESS_PUBLIC_RELATIONS, outcome: 1, target: 1 }];
    addGrievance(s2, 0, 1, 100);
    expect(grievanceWith(s2, 0, 1)).toBe(50);
  });

  it('MILITARY ADVISORY moves the named promotion class, on both faces, in a real defence', () => {
    const state = newGame(1);
    const melee = PROMO_CLASSES.indexOf('MELEE');
    const city = seatOf(state, 0)!.cities[0];
    const warrior = spawnUnit(state, 'WARRIOR', city.centerIndex, 0)!;
    const bare = defenderCS(state, warrior, warrior.tileIndex);
    state.congress = [{ res: CONGRESS_MILITARY_ADVISORY, outcome: 0, target: melee }];
    expect(congressUnitCS(state, { type: 'WARRIOR', seat: 0 })).toBe(CONGRESS_ADVISORY_CS);
    expect(congressUnitCS(state, { type: 'ARCHER', seat: 0 })).toBe(0);
    expect(congressUnitCS(state, { type: 'BOMBER', seat: 0 })).toBe(0);  // air carries no promotion class
    expect(defenderCS(state, warrior, warrior.tileIndex)).toBe(bare + CONGRESS_ADVISORY_CS);
    state.congress = [{ res: CONGRESS_MILITARY_ADVISORY, outcome: 1, target: melee }];
    expect(congressUnitCS(state, { type: 'WARRIOR', seat: 0 })).toBe(-CONGRESS_ADVISORY_CS);
    expect(defenderCS(state, warrior, warrior.tileIndex)).toBe(bare - CONGRESS_ADVISORY_CS);
  });

  it("WORLD RELIGION outcome A pays the named religion's Warrior Monks", () => {
    const state = newGame(2);
    const monk = { type: 'WARRIOR_MONK', seat: 1 };
    state.congress = [{ res: CONGRESS_WORLD_RELIGION, outcome: 0, target: 1 }];
    expect(congressUnitCS(state, monk)).toBe(CONGRESS_WORLD_RELIGION_RS);
    expect(congressUnitCS(state, { type: 'WARRIOR_MONK', seat: 0 })).toBe(0);
    expect(congressUnitCS(state, { type: 'WARRIOR', seat: 1 })).toBe(0);
    // outcome B is a favor channel, not a combat one
    state.congress = [{ res: CONGRESS_WORLD_RELIGION, outcome: 1, target: 1 }];
    expect(congressUnitCS(state, monk)).toBe(0);
  });

  it('WORLD RELIGION pays A in the duel and B at the condemnation', () => {
    const state = newGame(1);
    const city = seatOf(state, 0)!.cities[0];
    const apostle = spawnUnit(state, 'APOSTLE', city.centerIndex, 0)!;
    const bare = theoStrength(state, apostle);
    state.congress = [{ res: CONGRESS_WORLD_RELIGION, outcome: 0, target: 0 }];
    expect(theoStrength(state, apostle)).toBe(bare + CONGRESS_WORLD_RELIGION_RS);
    state.congress = [{ res: CONGRESS_WORLD_RELIGION, outcome: 0, target: 1 }];
    expect(theoStrength(state, apostle)).toBe(bare);  // another religion's row
    // outcome B pays the CONDEMNER, and A pays nothing at a condemnation
    const foe = state.seats[1].seat;
    setWar(state, 0, foe, true);
    for (const outcome of [0, 1]) {
      const s2 = newGame(1);
      const c2 = seatOf(s2, 0)!.cities[0];
      const heretic = spawnUnit(s2, 'APOSTLE', c2.centerIndex, s2.seats[1].seat)!;
      const soldier = spawnUnit(s2, 'WARRIOR', heretic.tileIndex, 0)!;
      setWar(s2, 0, s2.seats[1].seat, true);
      s2.congress = [{ res: CONGRESS_WORLD_RELIGION, outcome, target: s2.seats[1].seat }];
      seatOf(s2, 0)!.diplomaticFavor = 0;
      expect(condemnHeretic(s2, soldier, heretic.tileIndex).ok).toBe(true);
      expect(seatOf(s2, 0)!.diplomaticFavor).toBe(outcome === 1 ? CONGRESS_WORLD_RELIGION_FAVOR : 0);
    }
  });

  it('a tied vote goes to the side that COMMITTED the most favor, outcome and target alike', () => {
    // 3 votes a side either way: three free ballots against one seat that
    // bought two extra votes. CIV6: "Ties are broken by the proportion of
    // Diplomatic Favor a player commits."
    const outcomeWin = (rich: number) => {
      const state = newGame(3);
      medieval(state);
      for (let s = 1; s < 4; s++) settleFirstCity(state, s);
      state.turn = CONGRESS_INTERVAL;
      for (const sx of state.seats) {
        sx.diplomaticFavor = sx.seat === 3 ? CONGRESS_VOTE_STEP * 6 : 0;  // 1+2 rungs, twice
        sx.congressVote = [[sx.seat === 3 ? rich : 0, 0, sx.seat === 3 ? 2 : 0],
                           [sx.seat === 3 ? rich : 0, 0, sx.seat === 3 ? 2 : 0]];
      }
      worldCongress(state);
      return state.congress!.map((a) => a.outcome);
    };
    expect(outcomeWin(1)).toEqual([1, 1]);   // B, on the favor it committed
    expect(outcomeWin(0)).toEqual([0, 0]);   // and A when the same seat votes A

    const state = newGame(3);
    medieval(state);
    for (let s = 1; s < 4; s++) settleFirstCity(state, s);
    state.turn = CONGRESS_INTERVAL;
    for (const sx of state.seats) {
      sx.diplomaticFavor = sx.seat === 3 ? CONGRESS_VOTE_STEP * 6 : 0;  // 1+2 rungs, twice
      const target = sx.seat === 3 ? 1 : 0;
      sx.congressVote = [[0, target, sx.seat === 3 ? 2 : 0], [0, target, sx.seat === 3 ? 2 : 0]];
    }
    worldCongress(state);
    // the HIGHER target index wins the tie, which the lower-index rule alone
    // could never produce
    expect(state.congress!.map((a) => a.target)).toEqual([1, 1]);
  });
});
