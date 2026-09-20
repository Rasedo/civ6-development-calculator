"""The World Games' and the Space Station's EXTRA podium rewards (AUDIT B-22r).

    python tests/gpu/competition_rewards_test.py

CIV6 (EmergencyRewards): the winner's own row, then the top quarter's (the
winner included) and the next quarter's — PERMANENT channels on the seat's
perm run (`civ_gp_perm`), read by `_gp_district_tourism` (per Campus / Stadium /
Aquatics Center), `_gp_prod_pct` (space-race percent) and the exoplanet flight
(`exoSpeed`). `payPodium`'s twin `_competition_podium` writes them.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES  # noqa: E402
from warmup import settle_all  # noqa: E402

B0 = 0


def build(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


def put_district(sim, row: int, j: int, di: int) -> int:
    c = int(sim.city_center[B0, row, j])
    free = [t for t in range(sim.T)
            if int(sim.tile_seat[B0, t]) == row and int(sim.district[B0, t]) < 0
            and int(sim.built_wonder[B0, t]) < 0 and bool(sim.passable[B0, t])
            and int(sim.centre_slot_at[B0, t]) < 0 and int(sim.pair_dist[c, t]) <= 2]
    assert free, "the city owns no free plot"
    t = free[0]
    sim.district[B0, t] = di
    sim.district_complete[B0, t] = True
    sim.district_pillaged[B0, t] = False
    sim.city_dist_tile[B0, row, j, di] = t
    sim._tile_owner_ver += 1
    sim._eff_version += 1
    return t


def main() -> int:
    rules = load_rules()
    R = json.loads((FIXTURES / "rules.json").read_text(encoding="utf-8"))
    bidx = {b["id"]: i for i, b in enumerate(R["buildings"])}
    paths = fixture_paths()
    sim = build(rules, paths[0])
    print(f"competition_rewards_test on {paths[0].name}")
    assert sim.n_majors >= 3, "the field needs three majors"
    names = sim._gp_perm_names
    cids = [c["id"] for c in sim._comps]

    def perm(r: int, key: str) -> float:
        return float(sim._gp_perm(r, key)[B0])

    def podium(kind_id: str) -> dict:
        k = cids.index(kind_id)
        row = sim._comps[k]
        sim.comp_kind[B0] = k
        sim.comp_left[B0] = 0
        sim.comp_score[B0] = 0
        sim.comp_member[B0, :sim.n_majors] = False
        sim.comp_member[B0, :3] = True
        sim.comp_score[B0, 0], sim.comp_score[B0, 1], sim.comp_score[B0, 2] = 9.0, 5.0, 1.0
        sim._competition_podium(torch.tensor([True]))
        sim.comp_kind[B0] = -1
        return row

    # ---- 1. World Games: the wire's rows, then the podium
    row = podium("WORLD_GAMES")
    gp = row["goldPerm"]
    assert gp[names.index("campusTourism")] == 2 and sum(gp) == 2, f"goldPerm {gp}"
    sp = row["silverPerm"]
    assert sp[names.index("stadiumTourism")] == 2 and sp[names.index("aquaticsTourism")] == 2 and sum(sp) == 4
    bp = row["bronzePerm"]
    assert bp[names.index("stadiumTourism")] == 1 and bp[names.index("aquaticsTourism")] == 1 and sum(bp) == 2
    assert perm(0, "campusTourism") == 2 and perm(1, "campusTourism") == 0, "the winner alone takes the Campus tourism"
    assert perm(0, "stadiumTourism") == 2 and perm(0, "aquaticsTourism") == 2, "the winner sits in the top quarter too"
    assert perm(1, "stadiumTourism") == 1 and perm(1, "aquaticsTourism") == 1, "the next quarter takes 1"
    assert perm(2, "stadiumTourism") == 0, "the bottom half takes nothing"
    # the READER: a Stadium on a complete Entertainment Complex pays it, pillaged does not
    ec = next(i for i, d in enumerate(sim.districts_cat) if d.get("id") == "ENTERTAINMENT_COMPLEX")
    t_ec = put_district(sim, 0, 0, ec)
    d0 = int(sim._gp_district_tourism(0)[B0])
    sim.city_bldg[B0, 0, 0, bidx["STADIUM"]] = True
    sim._bldg_version += 1
    sim._eff_version += 1
    assert int(sim._gp_district_tourism(0)[B0]) == d0 + 2, "a standing Stadium pays the winner's 2"
    sim.city_bldg_pillaged[B0, 0, 0, bidx["STADIUM"]] = True
    sim._eff_version += 1
    assert int(sim._gp_district_tourism(0)[B0]) == d0, "a pillaged Stadium pays nothing"
    sim.city_bldg_pillaged[B0, 0, 0, bidx["STADIUM"]] = False
    sim.district_pillaged[B0, t_ec] = True
    sim._eff_version += 1
    assert int(sim._gp_district_tourism(0)[B0]) == d0, "a pillaged district is dark"
    sim.district_pillaged[B0, t_ec] = False
    sim._eff_version += 1
    print("  1 World Games OK — Campus 2 to the winner, Stadium/Aquatics 2 and 1 to the tiers, read per standing Stadium")

    # ---- 2. Space Station: the craft's speed and the space-race percent
    row = podium("SPACE_STATION")
    assert row["goldPerm"][names.index("exoSpeed")] == 3
    assert row["silverPerm"][names.index("spaceProdPct")] == 40 and row["bronzePerm"][names.index("spaceProdPct")] == 20
    assert perm(0, "exoSpeed") == 3 and perm(1, "exoSpeed") == 0
    assert perm(0, "spaceProdPct") == 40 and perm(1, "spaceProdPct") == 20 and perm(2, "spaceProdPct") == 0
    print("  2 Space Station OK — exoSpeed 3 to the winner, space-race +40% / +20% to the tiers")

    # ---- 3. the Aid Request: triggered, targeted, scored per gold / war / pollution
    k = cids.index("AID_REQUEST")
    assert int(sim._comps[k].get("triggered", 0)) == 1 and k == len(cids) - 1, "the Aid Request is triggered and LAST"
    assert sim._comp_aid == k and sim._comp_voted_n == len(cids) - 1
    assert sim._congress_space(15) == len(cids) - 1, "the ballot never offers the triggered row"
    sim.comp_kind[B0] = -1
    hit = torch.zeros(sim.B, sim.n_majors, dtype=torch.bool)
    hit[B0, 1] = True
    hit[B0, 2] = True                       # two victims: the LOWEST row is the target
    sim._raise_aid_request(hit)
    assert int(sim.comp_kind[B0]) == k and int(sim.comp_target[B0]) == 1
    assert sim.comp_member[B0, :3].tolist() == [True, False, True], "the target is out of the field"
    assert int(sim.comp_left[B0]) == sim._comp_turns
    hit2 = torch.zeros_like(hit)
    hit2[B0, 2] = True
    sim._raise_aid_request(hit2)            # one slot: nothing changes
    assert int(sim.comp_target[B0]) == 1
    sim.comp_score[B0] = 0
    forty = torch.full((sim.B,), 40.0, dtype=sim.civ_treasury.dtype)
    sim._score_gold_gift(0, 1, forty)       # a member's gold to the target
    sim._score_gold_gift(2, 0, forty)       # to somebody else: nothing
    sim._score_gold_gift(1, 0, forty)       # the target gives: not a member
    assert sim.comp_score[B0, :3].tolist() == [40.0, 0.0, 0.0], sim.comp_score[B0, :3].tolist()
    sim.war[B0, 2, 1] = True
    sim.war[B0, 1, 2] = True
    sim.civ_co2_turn[B0] = 0
    sim.civ_co2_turn[B0, 2] = 7             # seat 2: the world's top polluter, at war with the target
    sim._competition_score()
    assert sim.comp_score[B0, :3].tolist() == [40.0, 0.0, -430.0], sim.comp_score[B0, :3].tolist()
    sim.civ_co2_turn[B0] = 0                # nobody emits: nobody is bad
    sim._competition_score()
    assert sim.comp_score[B0, :3].tolist() == [40.0, 0.0, -460.0], sim.comp_score[B0, :3].tolist()
    sim.war[B0, 2, 1] = False
    sim.war[B0, 1, 2] = False
    # the podium: 2 DVP and 100 Favor to the winner; a TWO-seat field (everyone
    # but the target) has no bronze quarter (ceil 0.5 = ceil 1.0 = 1); the target untouched
    dv0, fv = [float(x) for x in sim.civ_diplo_points[B0, :3]], [float(x) for x in sim.civ_diplo_favor[B0, :3]]
    sim.comp_score[B0, 0], sim.comp_score[B0, 2] = 9.0, 1.0
    sim.comp_left[B0] = 0
    sim._competition_podium(torch.tensor([True]))
    assert float(sim.civ_diplo_points[B0, 0]) - dv0[0] == 2.0, "2 Diplomatic Victory points to the winner"
    assert float(sim.civ_diplo_favor[B0, 0]) - fv[0] == 100.0 and float(sim.civ_diplo_favor[B0, 2]) - fv[2] == 0.0
    assert float(sim.civ_diplo_points[B0, 1]) == dv0[1] and float(sim.civ_diplo_favor[B0, 1]) == fv[1], "the target takes nothing"
    # the END through the real path: the slot reads as no competition on
    # every plane, the target included (the TS drops the record whole; 9248 t72)
    sim.comp_left[B0] = 1
    sim._resolve_competition()
    assert int(sim.comp_kind[B0]) == -1 and int(sim.comp_target[B0]) == -1 and int(sim.comp_left[B0]) == 0
    assert not bool(sim.comp_member[B0].any()) and float(sim.comp_score[B0].abs().sum()) == 0.0
    print("  3 Aid Request OK — triggered against the lowest victim, gold / project / war / pollution scored, 2 DVP + 100 Favor to the winner")
    print("COMPETITION REWARDS OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
