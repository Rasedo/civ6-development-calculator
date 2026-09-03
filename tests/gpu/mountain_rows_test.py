"""THE MOUNTAIN, THE GOVERNOR AND THE FORMATION — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/mountain_rows_test.py

The TS twin is tests/cpu/seats/mountain-rows.test.ts.

CIV6 (the install's TraitModifiers): Mit'a's worked mountains, Qhapaq Ñan's
route Food per mountain of the origin city, the Toqui's governed-city
percentages and its loyalty reach, Isibongo's garrison, and the formation
civics and strength of Shaka and Spain.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
RULES = json.loads((Path(__file__).resolve().parent.parent.parent
                    / "seeder" / "worlds" / "rules.json").read_text())
UNITS = [u["id"] for u in RULES["units"]]
CIVICS = [c["id"] for c in RULES["civics"]]


def play(sim, row: int, name):
    if name is None:
        sim.row_civ[0, row] = -1
        sim.row_leader[0, row] = -1
    else:
        ci = sim._civ_ids.index(name)
        sim.row_civ[0, row] = ci
        sim.row_leader[0, row] = sim._pair_civ.index(ci)
    sim._eff_version += 1
    sim._gen_ver += 1
    sim._bldg_version += 1
    if sim._gov_pol_cache is not None:
        sim._gov_pol_cache.clear()


def lead(sim, row: int, civ: str, leader: str) -> None:
    play(sim, row, civ)
    sim.row_leader[0, row] = sim._leader_idx(leader)
    sim._eff_version += 1


def fresh(rules, path) -> BatchSim:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(("ROME", "EGYPT", "NORWAY")):
        play(sim, r, name)
    return settle_all(sim)


def T(*xs) -> torch.Tensor:
    return torch.tensor(list(xs), dtype=torch.long)


def ring_of_mountains(sim, row: int = 0, col: int = 0) -> list[int]:
    """Raise the city's whole first ring to MOUNTAIN and hand it the tiles."""
    ctr = int(sim.city_center[B0, row, col])
    out = []
    for x in sim.neigh[ctr].tolist():
        if x < 0:
            continue
        sim.tile_mountain[B0, x] = True
        sim.passable[B0, x] = False
        sim.work_ok[B0, x] = False
        sim.feat_id[B0, x] = -1
        sim.tile_seat[B0, x] = row
        sim.tile_city[B0, x] = int(sim.city_id[B0, row, col])
        sim.district[B0, x] = -1
        sim.built_wonder[B0, x] = -1
        out.append(x)
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    return out


# ---------------------------------------------------------------------------


def test_wire(rules, path) -> None:
    sim = fresh(rules, path)
    assert len(sim._work_mountain_rows) == 1 and len(sim._route_terrain_rows) == 1
    assert len(sim._governor_yield_rows) == 4 and len(sim._governor_loyalty_rows) == 1
    assert len(sim._garrison_loyalty_rows) == 2 and len(sim._formation_rows) == 4
    print("  1 wire OK — 1 + 1 + 4 + 1 + 2 + 4 rows")


def test_mita(rules, path) -> None:
    sim = fresh(rules, path)
    ring = ring_of_mountains(sim)
    assert ring, "no ring to raise"
    play(sim, 0, "ROME")
    plain = sim._work_ground(0)[B0, ring].sum().item()
    assert plain == 0, "a plain seat worked a mountain"
    play(sim, 0, "INCA")
    inca = sim._work_ground(0)[B0, ring].sum().item()
    assert inca == len(ring), f"Mit'a opened {inca} of {len(ring)} mountains"
    # the workable WINDOW follows the ground
    n_inca = int(sim._workable_count(0)[B0, 0])
    play(sim, 0, "ROME")
    n_plain = int(sim._workable_count(0)[B0, 0])
    assert n_inca == n_plain + len(ring), f"the window read {n_inca} against {n_plain}"
    print(f"  2 Mit'a OK — {len(ring)} mountains worked by the Inca, none by Rome")


def test_terrace_farm(rules, path) -> None:
    """The Inca's unique improvement, and the Food a mountain takes from it."""
    sim = fresh(rules, path)
    imps = RULES["improvements"]["ids"]
    tf = imps.index("TERRACE_FARM")
    row = RULES["improvements"]["rows"][tf]
    assert row["uniq"] == sim._civ_ids.index("INCA"), "the Terrace Farm is not the Inca's"
    assert row["yields"][0] == 1 and row["housing"] == 1, "its own Food and Housing"
    srcs = [(int(a.get("mtn", 0)), int(a.get("same", 0)), int(a["dist"]), int(a["per"])) for a in row["adj"]]
    assert (1, 0, -1, 1) in srcs and (0, 1, -1, 2) in srcs, "the mountain and same-kind clauses"
    # a MOUNTAIN pays the Inca per adjacent Terrace Farm
    play(sim, 0, "INCA")
    mtn = next(t for t in range(sim.T) if bool(sim.tile_mountain[B0, t]))
    near = [int(x) for x in sim.neigh[mtn].tolist() if x >= 0]
    for x in near:
        sim.improvement[B0, x] = tf
        sim.pillaged[B0, x] = False
    sim._eff_version += 1
    got = float(sim._mountain_yield_plane(0)[B0, mtn, 0])
    assert got == len(near), f"the mountain took {got} Food from {len(near)} Terrace Farms"
    play(sim, 0, "ROME")
    plane = sim._mountain_yield_plane(0)
    assert plane is None or float(plane[B0, mtn, 0]) == 0.0, "a plain seat took the Food"
    print(f"  3 the Terrace Farm OK — +{len(near)} Food on the mountain beside {len(near)} of them")


def test_qhapaq_nan(rules, path) -> None:
    """A DOMESTIC leg out of a city ringed in mountains."""
    def food_of(name, leader=None) -> tuple[float, int]:
        sim = fresh(rules, path)
        ring = ring_of_mountains(sim)
        # a second city of this row, so the leg is domestic
        far = next(t for t in range(sim.T)
                   if bool(sim.settle_ok[B0, t]) and int(sim.tile_seat[B0, t]) < 0
                   and int(sim.pair_dist[int(sim.city_center[B0, 0, 0]), t]) >= 6)
        sim._found_city_at(0, torch.ones(sim.B, dtype=torch.bool), torch.full((sim.B,), far, dtype=torch.long))
        assert bool(sim.city_alive[B0, 0, 1]), "the second city never founded"
        sim.seat_routes[B0, 0, 0, 0] = int(sim.city_id[B0, 0, 0])
        sim.seat_routes[B0, 0, 0, 1] = int(sim.city_id[B0, 0, 1])
        sim.seat_route_dseat[B0, 0, 0] = -1
        sim.seat_route_exp[B0, 0, 0] = int(sim.turn) + 20
        if leader is None:
            play(sim, 0, name)
        else:
            lead(sim, 0, name, leader)
        sim._eff_version += 1
        return float(sim._seat_route_income(0)[B0, 0, 0]), len(ring)

    base, n = food_of("ROME")
    got, _ = food_of("INCA", "PACHACUTI")
    assert abs(got - (base + n)) < 1e-9, f"the route paid {got - base} for {n} mountains"
    print(f"  3 Qhapaq Ñan OK — +{n} Food on the domestic leg")


def test_toqui(rules, path) -> None:
    sim = fresh(rules, path)

    def culture(name, governed: bool, founded: bool) -> float:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        s2.city_founder[B0, 0, 0] = 0 if founded else 1
        if governed and s2.n_governors:
            s2.civ_gov_appointed[B0, 0, 0] = True
            s2.civ_gov_city[B0, 0, 0] = int(s2.city_id[B0, 0, 0])
            s2.civ_gov_establish[B0, 0, 0] = 0
        s2._eff_version += 1
        return float(s2._seat_city_walk(0, amen_yf=s2._seat_amenity(0)[2])[B0, 0, 4])

    if not sim.n_governors:
        print("  4 the Toqui SKIPPED — this build seats no governors")
        return
    plain = culture("ROME", True, True)
    assert abs(culture("MAPUCHE", False, True) - plain) < 1e-9, "an ungoverned city took the row"
    assert abs(culture("MAPUCHE", True, True) - plain * 1.05) < 1e-9, "the founded city's 5%"
    assert abs(culture("MAPUCHE", True, False) - plain * 1.15) < 1e-9, "the conquered city's 15%"
    print("  4 the Toqui OK — 5% founded, 15% not, and nothing without a governor")


def test_isibongo(rules, path) -> None:
    """The fixture already garrisons a centre, so the scene MOVES that unit's
    formation and takes it away rather than adding one."""
    bidx, col = torch.tensor([B0]), torch.tensor([0])

    def loyalty(name, garrison: str) -> float:
        s2 = fresh(rules, path)
        play(s2, 0, name)
        ctr = int(s2.city_center[B0, 0, 0])
        slot = int(s2.military_at[B0, ctr])
        assert slot >= 0 and int(s2.unit_seat[B0, slot]) == 0, "no garrison to read"
        if garrison == "none":
            s2.military_at[B0, ctr] = -1
        elif garrison == "corps":
            s2.unit_formation[B0, slot] = 1
        else:
            s2.unit_formation[B0, slot] = 0
        s2._eff_version += 1
        return float(s2._standing_loyalty(0, bidx, col)[0])

    assert loyalty("ZULU", "unit") == loyalty("ROME", "unit") + 3, "the garrison's +3"
    assert loyalty("ZULU", "corps") == loyalty("ROME", "corps") + 5, "a Corps' +5"
    assert loyalty("ZULU", "none") == loyalty("ROME", "none"), "an empty centre took the row"
    print("  5 Isibongo OK — +3 garrisoned, +5 for a Corps, nothing when empty")


def test_formations(rules, path) -> None:
    sim = fresh(rules, path)
    land_i, naval_i = 0, 1
    # the civic each tier needs, by domain
    play(sim, 0, "ROME")
    base_land, base_naval = sim._form_civic_ok(0, 1)
    merc = CIVICS.index("MERCENARIES")
    sim.civ_civics[B0, 0, merc] = True
    sim._eff_version += 1
    play(sim, 0, "ROME")
    assert not bool(sim._form_civic_ok(0, 1)[land_i][B0]), "Mercenaries alone formed a Corps for Rome"
    lead(sim, 0, "ZULU", "SHAKA")
    assert bool(sim._form_civic_ok(0, 1)[land_i][B0]), "Shaka's land Corps at Mercenaries"
    assert not bool(sim._form_civic_ok(0, 1)[naval_i][B0]), "Shaka's row reached the sea"
    # the strength that formation carries
    warrior = UNITS.index("WARRIOR")
    land = next(t for t in range(sim.T) if not bool(sim.water[B0, t]) and bool(sim.passable[B0, t]))
    hp = torch.tensor([100.0], dtype=sim.unit_hp.dtype)

    def cs(form: int) -> int:
        return int(sim._roster_cs(T(0), T(warrior), T(land), T(1), hp, False, T(form))[B0])

    assert cs(0) == 0 and cs(1) == 5 and cs(2) == 5, "Shaka's +5 for a land formation"
    play(sim, 0, "ROME")
    assert cs(1) == 0, "the strength outlived Shaka"
    print("  6 the formation rows OK — Shaka's civic and his +5, land alone")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_wire(rules, path)
    test_mita(rules, path)
    test_terrace_farm(rules, path)
    test_qhapaq_nan(rules, path)
    test_toqui(rules, path)
    test_isibongo(rules, path)
    test_formations(rules, path)
    print("BATTERY OK mountain_rows")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
