"""Tourism with an address, and the Rock Band, on the GPU: the summed
international percent, the per-rival bank, the culture read, the venue, the
concert's tier walk and the progressive faith price.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/rock_band_test.py

Each is poked at its own body against the same sourced rules the TS vitest
pins (tests/cpu/culture/tourism-address.test.ts, tests/cpu/units/rock-band.test.ts).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

M32 = 0xFFFFFFFF


def build(rules):
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], rules,
                              device="cpu", dtype=torch.float64))
    for _ in range(3):
        sim.step()
    assert sim.n_majors >= 2, "fixture has fewer than two majors"
    return sim


def roll_of(state: int) -> int:
    """`_next_random`'s draw from `state`, as the concert's per-mille roll."""
    a = (state + 0x6D2B79F5) & M32
    t = ((a ^ (a >> 15)) * (1 | a)) & M32
    t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t) & M32
    return int(((t ^ (t >> 14)) & M32) / 4294967296.0 * 1000)


def seed_for_tier(sim, level: int, tier: int) -> int:
    """The rng_state whose very next draw lands in `tier`'s bucket at `level`."""
    odds = sim._band_odds[level - 1].tolist()
    lo = sum(odds[:tier])
    hi = lo + odds[tier]
    for s in range(1, 2_000_000):
        if lo <= roll_of(s) < hi:
            return s
    raise AssertionError(f"no rng_state lands in tier {tier} at level {level}")


def best_venue(sim):
    """The (building, district, value) triple worth the most."""
    assert sim._band_venue, "no venue buildings exported"
    return max(sim._band_venue, key=lambda r: r[2])


def stage_venue(sim, row: int):
    """Give row `row`'s first live city a completed venue district on its own
    centre, and return (tile, value)."""
    col = int(sim.city_alive[0, row].long().argmax())
    assert bool(sim.city_alive[0, row, col]), f"row {row} has no live city"
    tile = int(sim.city_center[0, row, col])
    bi, dix, val = best_venue(sim)
    sim.district[0, tile] = dix
    sim.district_complete[0, tile] = True
    sim.built_wonder[0, tile] = -1
    sim.city_bldg[0, row, col, bi] = True
    return tile, int(val)


def place_band(sim, row: int, tile: int) -> int:
    """Stand a fresh level-1 Rock Band of `row` on `tile`, and return its slot."""
    slot = int(sim.unit_next[0])
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = row
    sim.major_unit_type[0, slot] = sim._band_idx
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = 100
    sim.major_unit_mp[0, slot] = 4
    sim.unit_band_level[0, slot] = 1
    sim.unit_band_album[0, slot] = 0
    sim.civilian_at[0, tile] = slot + sim.POOL_LO["major"]
    sim.unit_next[0] += 1
    return slot


def test_intl_pct(rules) -> None:
    """`tourismIntlPct`'s twin: Open Borders and a trade route ADD, and two
    governments that disagree charge both intolerances."""
    sim = build(rules)
    sim.seat_borders_turns.zero_()
    sim.seat_route_dseat.fill_(-1)
    base = int(sim._tourism_intl_pct(0, 1)[0])

    ob = int(sim.rules.seats.get("tourismOpenBordersPct", 25))
    sim.seat_borders_turns[0, 1, 0] = 30          # seat 1 hosts seat 0
    assert int(sim._tourism_intl_pct(0, 1)[0]) == base + ob, "Open Borders does not pay"
    assert int(sim._tourism_intl_pct(1, 0)[0]) == base, "the GRANTOR's side is the one that counts"

    rt = int(sim.rules.seats.get("tourismRoutePct", 25))
    sim.seat_route_dseat[0, 0, 0] = 1
    assert int(sim._tourism_intl_pct(0, 1)[0]) == base + ob + rt, "the two clauses do not SUM"
    sim.seat_route_dseat[0, 0, 0] = 0             # a route to itself is no route abroad
    assert int(sim._tourism_intl_pct(0, 1)[0]) == base + ob

    sim.seat_borders_turns.zero_()
    sim.seat_route_dseat.fill_(-1)
    intol = sim._gov_intol
    if int((intol > 0).sum()) == 0:
        print("  intl pct SKIPPED: no government in this catalog is intolerant")
        return
    g_hi = int((intol > 0).long().argmax())
    g_lo = int((intol == 0).long().argmax())
    civ_hi = int(sim._gov_unlock_civic[g_hi])
    assert civ_hi >= 0, "the intolerant government names no unlocking civic"
    sim.civ_civics[0, 0, civ_hi] = True
    ga, ha = sim._adopted_gov(sim._seat_civics(0))
    if not bool(ha[0]) or int(ga[0]) != g_hi:
        print("  intl pct OK (the catalog picks a different government here)")
        return
    want = -(int(intol[g_hi]) + 0) * int(sim.rules.seats.get("tourismGovMult", 1))
    assert int(sim._tourism_intl_pct(0, 1)[0]) == base + want, (
        f"a disagreeing pair should charge {want}: {int(sim._tourism_intl_pct(0, 1)[0])}")
    assert int(intol[g_lo]) == 0
    print(f"  intl pct OK: +{ob} borders, +{rt} route, {want} for the government gap")


def test_bank_per_rival(rules) -> None:
    """`bankTourismPerRival`'s twin: one cell per rival at its own percent,
    never toward itself, and never below zero."""
    sim = build(rules)
    sim.civ_tourism_to.zero_()
    sim.civ_tourism_rel_to.zero_()
    sim.seat_borders_turns.zero_()
    sim.seat_route_dseat.fill_(-1)
    ob = int(sim.rules.seats.get("tourismOpenBordersPct", 25))
    sim.seat_borders_turns[0, 1, 0] = 30                    # +ob toward seat 1 only
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    gen = torch.full((sim.B,), 100.0, dtype=sim.dtype, device=sim.device)
    rel = torch.zeros(sim.B, dtype=sim.dtype, device=sim.device)
    sim._bank_tourism_per_rival(0, one, gen, rel)
    assert int(sim.civ_tourism_to[0, 0, 1]) == (100 * (100 + ob)) // 100, (
        f"seat 1's cell ignored its own percent: {int(sim.civ_tourism_to[0, 0, 1])}")
    assert int(sim.civ_tourism_to[0, 0, 0]) == 0, "a seat banked tourism toward itself"
    if sim.n_majors > 2:
        assert int(sim.civ_tourism_to[0, 0, 2]) == 100, "an untouched rival took the wrong cell"

    # an inactive seat banks nothing
    before = int(sim.civ_tourism_to[0, 0, 1])
    sim._bank_tourism_per_rival(0, ~one, gen, rel)
    assert int(sim.civ_tourism_to[0, 0, 1]) == before, "an inactive row still banked"
    print(f"  per-rival bank OK: seat 1 took {before}, every other rival its own cell")


def test_bank_floor(rules) -> None:
    """A percent past -100 pays nothing rather than draining the cell."""
    sim = build(rules)
    sim.civ_tourism_rel_to.zero_()
    if sim._enl_cidx < 0:
        print("  bank floor SKIPPED: the catalog has no Enlightenment civic")
        return
    sim.civ_religion_done[0, 0] = True
    sim.civ_civics[0, 1, sim._enl_cidx] = True
    # every rival city following someone else's religion: the second halving
    for col in range(sim.RC):
        if bool(sim.city_alive[0, 1, col]):
            sim.city_followed[0, 1, col] = 1
    assert int(sim._dominant_religion()[0, 1]) == 1, "the rival has no majority religion"
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    zero = torch.zeros(sim.B, dtype=sim.dtype, device=sim.device)
    rel = torch.full((sim.B,), 100.0, dtype=sim.dtype, device=sim.device)
    sim._bank_tourism_per_rival(0, one, zero, rel)
    got = int(sim.civ_tourism_rel_to[0, 0, 1])
    assert got == 0, f"the two summed halvings should pay 0, not {got}"
    sim._bank_tourism_per_rival(0, one, zero, rel)
    assert int(sim.civ_tourism_rel_to[0, 0, 1]) == 0, "the cell went negative"
    print("  bank floor OK: -50 and -50 SUM to -100 and pay nothing")


def test_culture_victor(rules) -> None:
    """`cultureVictor`'s twin reads the MATRIX, flooring each rival's cell on
    its own."""
    sim = build(rules)
    n = sim.n_majors
    div = n * sim._tourism_per_visitor
    sim.civ_tourism_to.zero_()
    sim.civ_tourism_rel_to.zero_()
    sim.civ_culture.zero_()
    for o in range(1, n):
        sim.civ_tourism_to[0, 0, o] = div - 1        # one short, every cell
    assert int(sim._culture_victor()[0]) == -1, "sub-tourist cells added up to a win"
    sim.civ_tourism_to[0, 0, 1] = 2 * div            # 2 visiting from one rival
    assert int(sim._culture_victor()[0]) == 0, "a seat past every domestic count did not win"
    sim.civ_culture[0, 1] = 2 * sim._culture_per_tourist   # 2 domestic: not STRICTLY beaten
    assert int(sim._culture_victor()[0]) == -1, "an equal count won"
    print(f"  culture victor OK: each cell floors at {div}, the bar is strictly greater")


def test_venue(rules) -> None:
    """`concertVenue`'s twin: a completed wonder outranks every building, and
    a district tile is worth the best venue its own city holds."""
    sim = build(rules)
    tile, val = stage_venue(sim, 1)
    tc = torch.tensor([[tile]], device=sim.device)
    assert int(sim._concert_venue(tc)[0, 0]) == val, "the district venue does not pay"

    sim.district_complete[0, tile] = False
    assert int(sim._concert_venue(tc)[0, 0]) == 0, "an unfinished district is a venue"

    sim.district_complete[0, tile] = True
    sim.built_wonder[0, tile] = 0
    sim.built_wonder_complete[0, tile] = True
    assert int(sim._concert_venue(tc)[0, 0]) == sim._band_wonder_venue, "a wonder does not outrank"
    sim.built_wonder_complete[0, tile] = False
    assert int(sim._concert_venue(tc)[0, 0]) == val, "an unfinished wonder still paid"
    print(f"  venue OK: district {val}, wonder {sim._band_wonder_venue}")


def test_perform_mask(rules) -> None:
    """`_perform_ok`: a Rock Band, on a FOREIGN venue, and nothing else."""
    sim = build(rules)
    tile, _ = stage_venue(sim, 1)
    tc = torch.tensor([[tile]], device=sim.device)
    band = torch.tensor([[sim._band_idx]], device=sim.device)
    other = torch.tensor([[(sim._band_idx + 1) % sim.NU]], device=sim.device)
    assert bool(sim._perform_ok(0, tc, band)[0, 0]), "a band on a foreign venue is refused"
    assert not bool(sim._perform_ok(0, tc, other)[0, 0]), "another chassis was offered the verb"
    assert not bool(sim._perform_ok(1, tc, band)[0, 0]), "a band was offered its OWN borders"
    home, _ = stage_venue(sim, 0)
    assert not bool(sim._perform_ok(0, torch.tensor([[home]], device=sim.device), band)[0, 0]), (
        "a band performed at home")
    assert sim._A_PERFORM >= 0, "the PERFORM column is not in the action interface"
    print("  perform mask OK: foreign venue only, band only")


def test_concert(rules) -> None:
    """`performConcert`'s twin: the burst is venue * (100 + bomb + album) //
    100 toward the HOST, the two best tiers promote and the two worst end it."""
    sim = build(rules)
    tile, val = stage_venue(sim, 1)
    tiers = sim._band_tiers.tolist()
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    tv = torch.tensor([tile], device=sim.device)

    for tier, (album, bomb, promote, dies) in enumerate(tiers):
        slot = place_band(sim, 0, tile)
        sim.unit_band_album[0, slot] = 100
        sim.civ_tourism_to.zero_()
        sim.rng_state[0] = seed_for_tier(sim, 1, tier)
        sim._do_concert(0, one, tv, torch.tensor([slot], device=sim.device))
        want = (val * (100 + bomb + 100)) // 100
        got = int(sim.civ_tourism_to[0, 0, 1])
        assert got == max(0, want), f"tier {tier} paid {got}, not {max(0, want)}"
        assert int(sim.civ_tourism_to[0, 0, 0]) == 0, "the burst landed on the performer"
        assert int(sim.unit_band_album[0, slot]) == 100 + album, f"tier {tier} album sales"
        assert int(sim.unit_band_level[0, slot]) == (2 if promote else 1), f"tier {tier} promotion"
        assert bool(sim.unit_alive[0, slot]) == (not dies), f"tier {tier} survival"
        assert int(sim.unit_mp[0, slot]) == 0, "the performance did not end the band's turn"
        if not dies:
            sim.unit_alive[0, slot] = False
            sim.civilian_at[0, tile] = -1

    # the ceiling holds
    slot = place_band(sim, 0, tile)
    sim.unit_band_level[0, slot] = sim._band_max_level
    sim.rng_state[0] = seed_for_tier(sim, sim._band_max_level, 0)
    sim._do_concert(0, one, tv, torch.tensor([slot], device=sim.device))
    assert int(sim.unit_band_level[0, slot]) == sim._band_max_level, "a band promoted past the ceiling"

    # exactly ONE draw
    slot = place_band(sim, 0, tile)
    sim.rng_state[0] = seed_for_tier(sim, 1, 2)
    before = int(sim.rng_state[0])
    sim._do_concert(0, one, tv, torch.tensor([slot], device=sim.device))
    assert int(sim.rng_state[0]) == (before + 0x6D2B79F5) & M32, "the concert is not a one-draw verb"
    print(f"  concert OK: {len(tiers)} tiers walked at venue {val}, one draw each")


def test_progressive_price(rules) -> None:
    """`rockBandCost`'s twin: base x (1 + bands already bought), and the
    candidate needs the civic and the purse."""
    sim = build(rules)
    base = float(sim._type_cost[sim._band_idx])
    civ_i = int(sim._type_civic[sim._band_idx])
    assert civ_i >= 0, "the chassis names no enabling civic"
    sim.civ_rock_bands.zero_()
    assert float(sim._rock_band_cost(0)[0]) == base
    sim.civ_rock_bands[0, 0] = 2
    assert float(sim._rock_band_cost(0)[0]) == base * (1 + 2 * sim._band_cost_step), (
        "the price is not progressive")

    sim.civ_rock_bands.zero_()
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    sim.civ_civics[0, 0, civ_i] = False
    sim.civ_faith[0, 0] = base * 10
    ok, _ = sim._seat_rock_band_candidate(0, one)
    assert not bool(ok[0]), "a seat without the civic was offered the buy"
    sim.civ_civics[0, 0, civ_i] = True
    ok, slot = sim._seat_rock_band_candidate(0, one)
    assert bool(ok[0]) and int(slot[0]) >= 0, "the civic and the purse still refuse the buy"
    sim.civ_faith[0, 0] = base - 1
    ok, _ = sim._seat_rock_band_candidate(0, one)
    assert not bool(ok[0]), "a purse short of the live price still bought"
    print(f"  progressive price OK: base {base:.0f}, +{sim._band_cost_step} base per band bought")


def main() -> None:
    rules = load_rules()
    print(f"rock_band_test on {fixture_paths()[0].name}:")
    test_intl_pct(rules)
    test_bank_per_rival(rules)
    test_bank_floor(rules)
    test_culture_victor(rules)
    test_venue(rules)
    test_perform_mask(rules)
    test_concert(rules)
    test_progressive_price(rules)
    print("ROCK BAND OK")


if __name__ == "__main__":
    main()
