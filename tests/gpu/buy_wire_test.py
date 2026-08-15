"""THE BUY WIRE — gold, faith and levy spending, on EVERY seat row.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/buy_wire_test.py

Spending is not a production column: it is the BUY WIRE (#103, #104) — kinds
0-7 on the seat action record, applied by ONE body, `_seat_buy_ladder(row,
active)`, at the seatPhase position every seat shares. Nothing in it CHOOSES:
each arm re-validates the intent the wire named against the LIVE state and
refuses silently if it no longer holds, which is the contract TS's arms keep.

Every rung here is poked for SEAT 0 **and** a civ row from the same body of
code, so a rung that serves one row and not the other is a red rather than a
missing test. The ladder is driven directly (stash, then run it) because that
isolates the verb: at this position nothing else in the phase can move the
counters the assertions read.

Covered per row: BUILDING (kind 0, price + the peace-gold reserve), SETTLER
(kind 1, the pop gate, the live escalator, the pop it costs), MILITARY UNIT
(kind 2, the 2x-cities quota, strongest-affordable, refund on no spawn spot),
TILE (kind 3, unclaimed + adjacent + radius 5 at the live price), WORSHIP
(kind 4, faith only), and the LEVY (kind 7, militaristic + suzerain +
cooldown). The religious-unit rungs (5/6) ride religion2_test.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, FIXTURES

ROWS = (0, 1)  # seat 0 and civ 0 — the SAME ladder must serve both
ACTIVE = torch.ones(1, dtype=torch.bool)
RICH = 10_000.0


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def t1(v: int) -> torch.Tensor:
    """A [B=1] long tensor — the wire's per-row scalar shape."""
    return torch.tensor([v], dtype=torch.long)


def prep(sim, row: int) -> None:
    """Put seat row `row` where the seatPhase gold block finds it: externally
    driven, at peace, and with every city queue clear so no completion can
    move the counters the rungs are measured by."""
    sim.seat_ext[:, row] = True
    sim.city_current[:, row] = -1
    sim.city_progress[:, row] = 0.0
    sim.city_cost[:, row] = 0.0
    sim.war[:, row] = False
    sim.war[:, :, row] = False
    sim.sync_war()
    sim._eff_version += 1


def n_cities(sim, row: int) -> int:
    return int(sim.city_alive[0, row].sum())


def cap_slot(sim, row: int) -> int:
    cap = sim.city_is_cap[0, row]
    return int(cap.long().argmax()) if bool(cap.any()) else int(sim.city_alive[0, row].long().argmax())


def units_of(sim, row: int) -> int:
    return int((sim.major_unit_alive[0] & (sim.major_unit_seat[0] == row)).sum())


def mult(sim) -> float:
    return sim.rules.gold_purchase_mult


# ---------------------------------------------------------------------------
# kind 0 — the BUILDING buy
# ---------------------------------------------------------------------------

def case_building(sim, base, row: int, mon: int) -> None:
    if not sim.districts_on:
        print(f"  row {row}: building buy SKIPPED (districts off)")
        return
    reserve = float(sim.rules.seats.get("peaceGold0", 150))

    sim.restore(base)
    prep(sim, row)
    # MONUMENT is ungated and cheap; stripping it from every city of the row
    # leaves at least one completable candidate.
    sim.city_bldg[0, row, :, mon] = False
    sim._eff_version += 1
    sim.civ_treasury[0, row] = RICH
    jj, bb, can, price, _ = sim._seat_buy_candidates(row, ACTIVE)
    assert bool(can[0]), f"row {row}: no completable building to buy"
    j, b, pr = int(jj[0]), int(bb[0]), float(price[0])
    assert not bool(sim.city_bldg[0, row, j, b])
    g0 = float(sim.civ_treasury[0, row])
    sim._stash_buy(row, buy=(t1(0), t1(j), t1(b)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert bool(sim.city_bldg[0, row, j, b]), f"row {row}: bought building not granted"
    assert abs((g0 - float(sim.civ_treasury[0, row])) - pr) < 1e-6, (
        f"row {row}: building charged {g0 - float(sim.civ_treasury[0, row])}, want {pr}"
    )

    # the peace-gold RESERVE: one milli below price + reserve buys nothing
    sim.restore(base)
    prep(sim, row)
    sim.city_bldg[0, row, :, mon] = False
    sim._eff_version += 1
    sim.civ_treasury[0, row] = pr + reserve - 0.001
    sim._stash_buy(row, buy=(t1(0), t1(j), t1(b)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert not bool(sim.city_bldg[0, row, j, b]), (
        f"row {row}: bought a building one milli below price + the {reserve:.0f} reserve"
    )

    # a building the row ALREADY holds is refused (the re-validation, not the
    # driver's choice — the wire may name a stale intent)
    sim.restore(base)
    prep(sim, row)
    sim.city_bldg[0, row, :, mon] = False
    sim.city_bldg[0, row, j, b] = True
    sim._eff_version += 1
    sim.civ_treasury[0, row] = RICH
    g0 = float(sim.civ_treasury[0, row])
    sim._stash_buy(row, buy=(t1(0), t1(j), t1(b)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert abs(float(sim.civ_treasury[0, row]) - g0) < 1e-6, (
        f"row {row}: paid for a building the city already had"
    )
    print(f"  row {row}: building buy OK ({pr:.0f} gold, reserve holds, stale intent refused)")


# ---------------------------------------------------------------------------
# kind 1 — the SETTLER buy
# ---------------------------------------------------------------------------

def settler_price(sim, row: int) -> float:
    r = sim.rules
    n = n_cities(sim, row)
    live = int(sim._seat_settlers(row)[0])
    q = int((sim.city_alive[0, row] & (sim.city_current[0, row] == sim.SETTLER)).sum())
    return (r.settler_base + r.settler_per_city * max(0, n - 1 + live + q)) * mult(sim)


def case_settler(sim, base, row: int) -> None:
    if sim._settler_idx < 0:
        print(f"  row {row}: settler buy SKIPPED (no settler in roster)")
        return
    gate = sim.rules.settler_pop_gate

    sim.restore(base)
    prep(sim, row)
    j = cap_slot(sim, row)
    sim.city_pop[0, row, j] = max(int(sim.city_pop[0, row, j]), gate + 1)
    price = settler_price(sim, row)
    sim.civ_treasury[0, row] = price
    pop0, live0 = int(sim.city_pop[0, row, j]), int(sim._seat_settlers(row)[0])
    sim._stash_buy(row, buy=(t1(1), t1(-1), t1(-1)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert int(sim._seat_settlers(row)[0]) == live0 + 1, f"row {row}: no settler spawned at its price"
    assert abs(float(sim.civ_treasury[0, row])) < 1e-6, f"row {row}: settler price not charged in full"
    assert int(sim.city_pop[0, row, j]) == pop0 - 1, f"row {row}: bought settler cost the city no pop"

    # one milli short: no spawn, no charge
    sim.restore(base)
    prep(sim, row)
    sim.city_pop[0, row, j] = max(int(sim.city_pop[0, row, j]), gate + 1)
    sim.civ_treasury[0, row] = settler_price(sim, row) - 0.001
    live0 = int(sim._seat_settlers(row)[0])
    sim._stash_buy(row, buy=(t1(1), t1(-1), t1(-1)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert int(sim._seat_settlers(row)[0]) == live0, f"row {row}: settler bought below its price"

    # the POP GATE: a 1-pop spawn city may not buy one however rich the seat
    sim.restore(base)
    prep(sim, row)
    sim.city_pop[0, row, j] = 1
    sim.civ_treasury[0, row] = RICH
    live0 = int(sim._seat_settlers(row)[0])
    sim._stash_buy(row, buy=(t1(1), t1(-1), t1(-1)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert int(sim._seat_settlers(row)[0]) == live0, f"row {row}: 1-pop city bought a settler"
    print(f"  row {row}: settler buy OK ({price:.0f} gold, -1 pop, gate and threshold hold)")


# ---------------------------------------------------------------------------
# kind 2 — the MILITARY UNIT buy
# ---------------------------------------------------------------------------

def empty_land(sim, k: int) -> list[int]:
    free = (
        sim.passable[0]
        & (sim.military_at[0] < 0)
        & (sim.civilian_at[0] < 0)
        & (sim.barb_at[0] < 0)
        & (sim.centre_slot_at[0] < 0)
        & (sim.tile_seat[0] < 0)
    ).nonzero(as_tuple=True)[0].tolist()
    assert len(free) >= k, "not enough empty land tiles to inject"
    return free[:k]


def inject_mil(sim, row: int, tiles: list[int], type_idx: int) -> None:
    """Append row-owned military on empty tiles — the `_spawn_unit` field
    writes minus the free-spot probe, so the quota can be met without
    perturbing the capital's spawn ring."""
    for t in tiles:
        slot = int(sim.unit_next[0])
        sim.major_unit_alive[0, slot] = True
        sim.major_unit_seat[0, slot] = row
        sim.major_unit_type[0, slot] = type_idx
        sim.major_unit_tile[0, slot] = t
        sim.major_unit_hp[0, slot] = 100
        sim.major_unit_charges[0, slot] = 0
        sim.major_unit_fortify[0, slot] = 0
        sim.military_at[0, t] = slot + sim.POOL_LO["major"]
        sim.unit_next[0] += 1


def case_unit(sim, base, row: int) -> None:
    warr = sim._warrior_idx
    if warr < 0:
        print(f"  row {row}: unit buy SKIPPED (no warrior in roster)")
        return
    price = float(sim._type_cost[warr]) * mult(sim)

    sim.restore(base)
    prep(sim, row)
    quota = 2 * n_cities(sim, row)
    assert int(sim._seat_army_count(row)[0]) < quota, f"row {row}: already at the military quota"
    sim.civ_treasury[0, row] = price
    n0 = units_of(sim, row)
    sim._stash_buy(row, buy=(t1(2), t1(-1), t1(-1)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert units_of(sim, row) == n0 + 1, f"row {row}: no unit spawned at the warrior price"
    got = int(sim.major_unit_type[0, int(sim.unit_next[0]) - 1])
    assert got == warr, f"row {row}: strongest-affordable picked type {got} at the warrior price"
    assert abs(float(sim.civ_treasury[0, row])) < 1e-6, f"row {row}: unit price not charged in full"

    # the QUOTA gate — gold, room and a clear ring, but the army is at 2x cities
    sim.restore(base)
    prep(sim, row)
    need = quota - int(sim._seat_army_count(row)[0])
    if need > 0:
        inject_mil(sim, row, empty_land(sim, need), warr)
    sim.civ_treasury[0, row] = price
    n0 = units_of(sim, row)
    sim._stash_buy(row, buy=(t1(2), t1(-1), t1(-1)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert units_of(sim, row) == n0, f"row {row}: bought a unit at the {quota}-unit quota"

    # REFUND on no spawn spot: block the capital ring; the price is kept
    sim.restore(base)
    prep(sim, row)
    j = cap_slot(sim, row)
    ctr = int(sim.city_center[0, row, j])
    for t in [ctr] + [int(n) for n in sim.neigh[ctr].tolist() if n >= 0]:
        sim.military_at[0, t] = 0  # >= 0 blocks the free-spot probe
    sim.civ_treasury[0, row] = price
    n0 = units_of(sim, row)
    sim._stash_buy(row, buy=(t1(2), t1(-1), t1(-1)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert units_of(sim, row) == n0, f"row {row}: a unit spawned with every spot blocked"
    assert abs(float(sim.civ_treasury[0, row]) - price) < 1e-6, (
        f"row {row}: a refused spawn still charged {price - float(sim.civ_treasury[0, row])} gold"
    )
    print(f"  row {row}: unit buy OK ({price:.0f} gold, quota {quota} holds, refund on no spot)")


# ---------------------------------------------------------------------------
# kind 3 — the TILE buy
# ---------------------------------------------------------------------------

def case_tile(sim, base, row: int) -> None:
    sim.restore(base)
    prep(sim, row)
    j = cap_slot(sim, row)
    ctr = int(sim.city_center[0, row, j])
    cid = sim.city_id[:, row, j]
    tiles = torch.arange(sim.T, dtype=torch.long).unsqueeze(0)
    ok = (
        sim._seat_tile_unclaimed(tiles)[0]
        & sim._seat_tile_adj_city(row, cid, tiles)[0]
        & (sim.pair_dist[ctr] <= 5)
    ).nonzero(as_tuple=True)[0].tolist()
    if not ok:
        print(f"  row {row}: tile buy SKIPPED (no adjacent unclaimed tile in range)")
        return
    tgt = int(ok[0])
    cost = float(sim._seat_tile_price(row, t1(ctr), t1(tgt))[0])
    sim.civ_treasury[0, row] = RICH
    bought0 = int(sim.civ_tiles_purchased[0, row])
    acq0 = int(sim.city_acquired[0, row, j])
    sim._stash_buy(row, buy=(t1(3), t1(tgt), t1(j)))
    sim._seat_buy_ladder(row, ACTIVE)
    assert int(sim.tile_seat[0, tgt]) == row, f"row {row}: bought tile not claimed"
    assert int(sim.tile_city[0, tgt]) == int(cid[0]), f"row {row}: bought tile not filed under the city"
    assert abs((RICH - float(sim.civ_treasury[0, row])) - cost) < 1e-6, (
        f"row {row}: tile charged {RICH - float(sim.civ_treasury[0, row])}, want {cost}"
    )
    assert int(sim.civ_tiles_purchased[0, row]) == bought0 + 1, f"row {row}: purchase escalator did not move"
    assert int(sim.city_acquired[0, row, j]) == acq0 + 1, f"row {row}: city_acquired did not move"

    # a CLAIMED tile is refused
    sim.restore(base)
    prep(sim, row)
    sim.civ_treasury[0, row] = RICH
    claimed = (sim.tile_seat[0] >= 0).nonzero(as_tuple=True)[0]
    if len(claimed):
        cl = int(claimed[0])
        owner0 = int(sim.tile_seat[0, cl])
        sim._stash_buy(row, buy=(t1(3), t1(cl), t1(j)))
        sim._seat_buy_ladder(row, ACTIVE)
        assert int(sim.tile_seat[0, cl]) == owner0, f"row {row}: bought an already-claimed tile"
        assert abs(float(sim.civ_treasury[0, row]) - RICH) < 1e-6, f"row {row}: charged for a refused tile"
    print(f"  row {row}: tile buy OK (tile {tgt}, {cost:.0f} gold; claimed tile refused)")


# ---------------------------------------------------------------------------
# kind 4 — the WORSHIP building (faith only)
# ---------------------------------------------------------------------------

def endow_worship(sim, row: int, j: int) -> None:
    """Plant buyWorshipBuilding's three city gates: a COMPLETE Holy Site in
    THIS city's registry, its Temple prerequisite, and a founded religion."""
    owned = ((sim.tile_seat[0] == row) & (sim.district[0] < 0) & (sim.centre_slot_at[0] < 0)
             & (sim.built_wonder[0] < 0)).nonzero(as_tuple=True)[0]
    assert len(owned), f"row {row}: city owns no free tile for a HOLY_SITE"
    t = int(owned[0])
    sim.district[0, t] = sim._hs_idx
    sim.district_complete[0, t] = True
    sim.city_dist_tile[0, row, j, sim._hs_idx] = t
    sim.city_bldg[0, row, j, sim._temple_bidx] = True
    sim.civ_religion_done[0, row] = True
    sim.civ_faith[0, row] = RICH
    sim._eff_version += 1


def case_worship(sim, base, row: int) -> None:
    if not sim._worship_bidx or sim._temple_bidx < 0 or sim._hs_idx < 0:
        print(f"  row {row}: worship buy SKIPPED (no worship catalog)")
        return
    wj = sim._worship_bidx_of(row)
    assert wj >= 0, f"row {row}: no worship building"

    sim.restore(base)
    prep(sim, row)
    # a worship building is faith-ONLY: neither production column offers it
    assert not bool(sim._seat_buildable(row)[0, 0, wj]), f"row {row}: worship must never be queueable"
    assert not bool(sim._seat_buildable(row, True)[0, 0, wj]), f"row {row}: worship must never gold-buy"
    j = cap_slot(sim, row)
    endow_worship(sim, row, j)
    assert bool(sim._worship_city_ok(row)[0, j]), (
        f"row {row}: worship must be buyable once its Temple and Holy Site stand"
    )
    f0, g0 = float(sim.civ_faith[0, row]), float(sim.civ_treasury[0, row])
    sim._stash_buy(row, worship=t1(j))
    sim._seat_buy_ladder(row, ACTIVE)
    assert bool(sim.city_bldg[0, row, j, wj]), f"row {row}: worship purchase not granted"
    assert abs((f0 - float(sim.civ_faith[0, row])) - sim._worship_cost) < 1e-6, (
        f"row {row}: worship charged {f0 - float(sim.civ_faith[0, row])} faith, want {sim._worship_cost}"
    )
    assert abs(float(sim.civ_treasury[0, row]) - g0) < 1e-6, f"row {row}: a worship buy touched the treasury"

    # without a religion the same intent is refused
    sim.restore(base)
    prep(sim, row)
    endow_worship(sim, row, j)
    sim.civ_religion_done[0, row] = False
    sim._stash_buy(row, worship=t1(j))
    sim._seat_buy_ladder(row, ACTIVE)
    assert not bool(sim.city_bldg[0, row, j, wj]), f"row {row}: worship bought with no religion founded"
    print(f"  row {row}: worship buy OK (-{sim._worship_cost:.0f} faith, gold untouched, religion gate holds)")


# ---------------------------------------------------------------------------
# kind 7 — the LEVY
# ---------------------------------------------------------------------------

def case_levy(sim, base, row: int) -> None:
    mil_idx = int(sim.rules.citystate.get("militaristicIdx", -1))
    if sim.S == 0 or mil_idx < 0:
        print(f"  row {row}: levy SKIPPED (no militaristic city-states)")
        return
    cost = float(sim.rules.citystate.get("levyGoldCost", 120))
    n_lv = int(sim.rules.citystate.get("levyUnits", 2))
    suz_min = int(sim.rules.citystate.get("suzerainEnvoys", 3))

    sim.restore(base)
    prep(sim, row)
    s = int(sim.citystate_alive[0].long().argmax())
    assert bool(sim.citystate_alive[0, s]), f"row {row}: no live city-state to levy"
    sim.citystate_type[0, s] = mil_idx
    sim.seat_citystate_envoys[0, :, s] = 0
    sim.seat_citystate_envoys[0, row, s] = suz_min
    sim.citystate_last_levy[0, s] = -10_000  # cooldown clear
    sim.civ_treasury[0, row] = RICH
    assert bool(sim._suzerain_mask(row)[0, s]), f"row {row}: envoys did not make it suzerain"
    n0 = units_of(sim, row)
    sim._stash_buy(row, levy=t1(s))
    sim._seat_buy_ladder(row, ACTIVE)
    assert units_of(sim, row) == n0 + n_lv, (
        f"row {row}: levy spawned {units_of(sim, row) - n0} units, want {n_lv}"
    )
    assert abs((RICH - float(sim.civ_treasury[0, row])) - cost) < 1e-6, f"row {row}: levy price not charged"
    assert int(sim.citystate_last_levy[0, s]) == int(sim.turn), f"row {row}: levy cooldown not stamped"

    # NOT suzerain: refused, unpaid
    sim.restore(base)
    prep(sim, row)
    sim.citystate_type[0, s] = mil_idx
    sim.seat_citystate_envoys[0, :, s] = 0
    sim.citystate_last_levy[0, s] = -10_000
    sim.civ_treasury[0, row] = RICH
    n0 = units_of(sim, row)
    sim._stash_buy(row, levy=t1(s))
    sim._seat_buy_ladder(row, ACTIVE)
    assert units_of(sim, row) == n0, f"row {row}: levied a city-state it is not suzerain of"
    assert abs(float(sim.civ_treasury[0, row]) - RICH) < 1e-6, f"row {row}: charged for a refused levy"
    print(f"  row {row}: levy OK ({n_lv} units, {cost:.0f} gold, suzerainty gate holds)")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"buy_wire_test on {path.name}")

    sim = build(rules, path)
    for _ in range(25):
        sim.step()
    bids = [b["id"] for b in json.loads((FIXTURES / "rules.json").read_text())["buildings"]]
    mon = bids.index("MONUMENT")
    assert int(sim.rules_dev.b_unlock[mon]) == -1 and int(sim.rules_dev.b_unlock_civic[mon]) == -1, (
        "MONUMENT unexpectedly gated — pick another ungated CITY_CENTER building"
    )
    base = sim.snapshot()

    for row in ROWS:
        if n_cities(sim, row) == 0:
            print(f"  row {row}: SKIPPED (no cities after 25 turns)")
            continue
        case_building(sim, base, row, mon)
        case_settler(sim, base, row)
        case_unit(sim, base, row)
        case_tile(sim, base, row)
        case_worship(sim, base, row)
        case_levy(sim, base, row)

    print("BUY WIRE OK")


if __name__ == "__main__":
    main()
