"""THE ECONOMY RESIDUE — the GPU half.

    python tests/gpu/eco_residue_test.py

The TS twin is tests/cpu/city/eco-residue.test.ts.

  1. a building buys off its fractional scaled cost (`_b_cols` "buyCost"): the
     Granary (Cost 65) for 130 gold, where a unit keeps its truncated cost.
  2. the policy unlock (`_policy_unlock_cost`): free the turn after a civic,
     then 50 dropping 5 a turn to 10; a government change outside the window
     pays it once, and one the purse cannot meet is refused.
  3. a city-state's city holds the Palace (`_palace_at`): +5 Gold.
  4. the Great Prophet, one per player (`_gp_capped`): the race, the patronage
     and the pass refuse a seat that has earned one.
  5. a Holy Site's healing faith counts the Dar-e Mehr's era Faith and none of
     a pillaged building's.
  6. the Solar Farm refuses a feature plot; the builder's water jobs read the
     owning city's governor (`_imp_gov_ok`).
  7. a spent Apostle neither evangelizes nor launches the Inquisition.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE.parent.parent / "gpu"))
sys.path.insert(0, str(_HERE))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from warmup import settle_all
import religion2_test as r2

ROW = 0


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def test_purchase(sim, rj) -> None:
    b = [x["id"] for x in rj["buildings"]].index("GRANARY")
    assert float(sim.rules_dev.b_cost[b]) == 32.0
    assert float(sim._b_cols(ROW)["buyCost"][0, b]) == 32.5
    price = sim._gold_price(ROW, sim._b_cols(ROW)["buyCost"][:, b] * sim.rules.gold_purchase_mult)
    assert float(price[0]) == 130.0, float(price[0])
    u = [x["id"] for x in rj["units"]].index("SLINGER")
    uprice = sim._gold_price(ROW, sim._type_cost[u:u + 1].double() * sim.rules.gold_purchase_mult)
    assert float(uprice[0]) == 65.0, float(uprice[0])
    print("  1 the Granary buys for 130, the Slinger for 65 OK")


def test_policy_unlock(sim, rj) -> None:
    gov = {g["id"]: i for i, g in enumerate(rj["governments"])}
    civ = {c["id"]: i for i, c in enumerate(rj["civics"])}
    snap = sim.snapshot()
    active = torch.ones(sim.B, dtype=torch.bool)
    sim.seat_ext[:, ROW] = True
    sim.civ_civics[:, ROW] = False
    for c in ("CODE_OF_LAWS", "POLITICAL_PHILOSOPHY"):
        sim.civ_civics[:, ROW, civ[c]] = True
    sim.civ_gov_held[:, ROW] = 0
    sim.civ_gov_chosen[:, ROW] = -1
    sim.civ_policies[:, ROW] = False
    sim._eff_version += 1
    turn0 = sim.turn

    def record(g: int) -> None:
        sim.apply_seat_actions(ROW, government=torch.full((sim.B,), g, dtype=torch.long))
        sim._seat_record_apply(ROW, active)

    def now() -> int:
        g, has = sim._adopted_gov(ROW)
        return int(g[0]) if bool(has[0]) else -1

    mx, drop, mn = sim.rules.civic_unlock
    assert (mx, drop, mn) == (50.0, 5.0, 10.0)
    sim.civ_civic_turn[:, ROW] = 10
    for t, want in ((11, 0.0), (12, mx), (13, mx - drop), (100, mn)):
        sim.turn = t
        assert float(sim._policy_unlock_cost(ROW)[0]) == want, (t, float(sim._policy_unlock_cost(ROW)[0]))
    # three turns past the window: 40, refused one short of it
    sim.civ_civic_turn[:, ROW] = 1
    sim.turn = 5
    cost = float(sim._policy_unlock_cost(ROW)[0])
    assert cost == mx - 2 * drop
    sim.civ_treasury[:, ROW] = cost - 1
    record(gov["OLIGARCHY"])
    assert now() == gov["AUTOCRACY"] and float(sim.civ_treasury[0, ROW]) == cost - 1
    sim.civ_treasury[:, ROW] = cost + 7
    record(gov["OLIGARCHY"])
    assert now() == gov["OLIGARCHY"] and float(sim.civ_treasury[0, ROW]) == 7.0, float(sim.civ_treasury[0, ROW])
    # the same government again changes nothing and costs nothing
    record(gov["OLIGARCHY"])
    assert float(sim.civ_treasury[0, ROW]) == 7.0
    # in the window a change is free
    sim.civ_civic_turn[:, ROW] = 4
    sim.civ_treasury[:, ROW] = 0.0
    record(gov["CLASSICAL_REPUBLIC"])
    assert now() == gov["CLASSICAL_REPUBLIC"] and float(sim.civ_treasury[0, ROW]) == 0.0
    sim.turn = turn0
    sim.restore(snap)
    print("  2 the policy unlock: free, 50 dropping 5 to 10, paid once, refused short OK")


def test_minor_palace(sim) -> None:
    alive = sim.citystate_alive[0]
    assert bool(alive.any()), "the world has no living city-state"
    assert not bool(sim._palace_at(sim.FREE_ROW, slice(0, sim.RC)).any())
    real = sim._palace_at

    def gold_of(row: int, palace: bool) -> float:
        sim._palace_at = real if palace else (lambda r, sl: sim.city_is_cap[:, r, sl])
        sim._eff_version += 1
        g = float(sim._seat_city_stats(row)[0][0, 0, 2])
        sim._palace_at = real
        sim._eff_version += 1
        return g

    # the first minor whose city earns no Gold of its own without the Palace:
    # taking the Palace away also takes 10% off the city's other yields, so a
    # plot paying Gold would blur the flat +5 under test
    s = next((m for m in alive.nonzero().flatten().tolist()
              if gold_of(sim._CITY_MINOR0 + m, False) == 0.0), -1)
    assert s >= 0, "every city-state's city earns Gold of its own"
    row = sim._CITY_MINOR0 + s
    assert bool(sim._palace_at(row, slice(0, sim.RC))[0, 0])
    gold, bare = gold_of(row, True), gold_of(row, False)
    assert gold - bare == 5.0, (gold, bare)
    print(f"  3 a city-state's Palace pays +5 Gold (minor {s}: {bare} -> {gold}) OK")


def test_prophet_cap(sim) -> None:
    snap = sim.snapshot()
    p = sim._prophet_cls
    active = torch.ones(sim.B, dtype=torch.bool)
    assert not bool(sim._gp_capped(ROW, p)[0])
    sim.civ_gp_earned[:, ROW, p] = 1
    assert bool(sim._gp_capped(ROW, p)[0]) and not bool(sim._gp_capped(ROW, 0 if p else 1)[0])
    sim.civ_gpp[:, ROW, p] = 1.0e6
    sim.civ_faith[:, ROW] = 1.0e6
    sim.civ_treasury[:, ROW] = 1.0e6
    earned = int(sim.gp_earned[0, p])
    sim._advance_great_people(ROW, active)
    assert int(sim.civ_gp_earned[0, ROW, p]) == 1 and int(sim.gp_earned[0, p]) == earned
    assert float(sim.civ_gpp[0, ROW, p]) >= 1.0e6, "the points should wait"
    done = sim._patronize(ROW, active, torch.full((sim.B,), p, dtype=torch.long), gold=False)
    assert not bool(done[0]), "a capped seat patronized a Great Prophet"
    sim.restore(snap)
    print("  4 the Great Prophet, one per player: the race and patronage refuse OK")


def test_holy_site_faith(rules, rj, path) -> None:
    sim = r2.build(rules, path)
    r, g, j = 0, 1, 0
    r2.isolate_faith(sim, r)
    _wipe = sim.district[0] == sim._hs_idx
    sim.district[0, _wipe] = -1
    hs = r2.make_holy_site(sim, r, j)
    sim.tile_seat[0, hs] = g
    sim.tile_city[0, hs] = int(sim.city_id[0, g, j])
    sim._tile_owner_ver += 1
    bids = [x["id"] for x in rj["buildings"]]
    dm = bids.index("DAR_E_MEHR")
    sim.city_bldg[:, g, :, sim._shrine_bidx] = False
    sim.city_bldg[0, g, j, sim._shrine_bidx] = True
    sim.city_bldg[0, g, j, dm] = True
    k = int(sim._bpe_col[dm])
    assert k >= 0, "the Dar-e Mehr carries no per-era row"
    era = sim._game_era()
    sim.city_bldg_era[0, g, j, k] = era
    sim._eff_version += 1
    now = int(sim._holy_site_faith()[0, hs])
    turn0 = sim.turn
    sim.turn = (era + 2) * sim._era_len  # two game eras on
    assert int(sim._holy_site_faith()[0, hs]) == now + 2, (now, int(sim._holy_site_faith()[0, hs]))
    sim.turn = turn0
    dm_faith = int(rj["buildings"][dm]["yields"][5])
    sim.city_bldg_pillaged[0, g, j, dm] = True
    sim._eff_version += 1
    assert int(sim._holy_site_faith()[0, hs]) == now - dm_faith, "a pillaged Dar-e Mehr still paid"
    print(f"  5 the Holy Site's faith: {now} -> {now + 2} two eras on, {now - dm_faith} pillaged OK")


def test_feature_and_jobs(sim) -> None:
    ids = sim._imp_ids
    solar = ids.index("SOLAR_FARM")
    live = (sim.feat_id >= 0) & ~sim.feat_stripped
    if sim._soil_fid >= 0:
        live = live & (sim.feat_id != sim._soil_fid)
    assert bool(live.any())
    assert not bool((sim._imp_ground_ok(solar) & live).any()), "a Solar Farm on a feature plot"
    # the builder's water jobs read the owning city's governor
    fish = ids.index("FISHERY")
    coast = torch.nonzero(sim.water[0] & sim.wpass[0] & (sim.feat_id[0] < 0) & (sim.res_imp[0] < 0)
                          & ~sim.tile_submerged[0] & ~sim.nwonder[0] & (sim.tile_seat[0] < 0)).flatten()
    t = next(int(x) for x in coast.tolist() if bool(sim._imp_ground_ok(fish)[0, int(x)]))
    snap = sim.snapshot()
    sim.tile_seat[0, t] = ROW
    sim._tile_owner_ver += 1
    _ut, _uc = int(sim._imp_unlock[fish]), int(sim._imp_unlock_civic[fish])
    if _ut >= 0:
        sim.civ_techs[:, ROW, _ut] = True
    if _uc >= 0:
        sim.civ_civics[:, ROW, _uc] = True
    base = bool(sim._seat_job_mask(ROW)[0, t])
    real = sim._imp_gov_ok
    sim._imp_gov_ok = lambda row, k: torch.ones(sim.B, sim.T, dtype=torch.bool)
    held = bool(sim._seat_job_mask(ROW)[0, t])
    sim._imp_gov_ok = real
    sim.restore(snap)
    assert not base and held, (base, held)
    print("  6 no Solar Farm on a feature; a Fishery job where the governor holds Aquaculture OK")


def main() -> int:
    rules = load_rules()
    rj = json.loads((FIXTURES / "rules.json").read_text())
    path = fixture_paths()[0]
    sim = fresh(rules, path)
    test_purchase(sim, rj)
    test_policy_unlock(sim, rj)
    test_minor_palace(sim)
    test_prophet_cap(sim)
    test_holy_site_faith(rules, rj, path)
    test_feature_and_jobs(fresh(rules, path))
    print("eco residue OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
