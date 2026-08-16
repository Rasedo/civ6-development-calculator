"""DISTRICT PLACEMENT IS A DECISION — it rides the wire, no engine scans.

Both engines used to scan every owned tile for the best adjacency and had to
agree forever. The choice is the policy's now: `ladder.pick_district_tile`
ranks, the record carries the tile, and the engines only re-validate it.

What this lane holds:
  * the ladder's key IS the old engine key — highest adjacency floor, ties to
    the LOWEST tile index, so the scripted trajectory does not move;
  * a district column with NO tile lands NOTHING (the engine never invents a
    plot to make a legal column work);
  * a named tile that is not eligible is REFUSED, never slid to a neighbour;
  * a DELIBERATELY suboptimal named tile is honoured — proof the engine is
    validating rather than choosing;
  * the removable-feature TECH gate: a district paves its tile, so a feature
    still standing on it must be one this seat could clear;
  * the record round-trips — `_extract_record` writes the tile as the pair's
    third element and `replay_seat` puts it back on the plane;
  * a REPEATABLE district (`allowMultiple`) goes down twice in one city and
    both are counted, where a plain one is refused the second time.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_ROOT / "gpu"))
sys.path.insert(0, str(_ROOT / "policy"))
from core import BatchSim, load_rules, load_fixture, fixture_paths  # noqa: E402
from warmup import settle_all
import drive  # noqa: E402
import ladder  # noqa: E402


def build(rules, path, turns=25):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    # Unlock the scaffold for every row: districts gate on techs/civics and an
    # undriven world researches nothing — the TILE WIRE, not the unlock, is
    # what this lane proves.
    for _di, ut, uc, _plc, _fc in sim._scaffold:
        if ut >= 0:
            sim.civ_techs[:, :, ut] = True
        if uc >= 0:
            sim.civ_civics[:, :, uc] = True
    for _ in range(turns):
        sim.step()
    return sim


def _live_city(sim):
    """(row, slot, scaffold column, district, placement) for a city that would
    ACTUALLY take a district — every term the apply re-checks, so a "nothing
    was queued" assertion below cannot pass for the wrong reason."""
    for row in range(sim.n_majors):
        for j in range(sim.RC):
            if not bool(sim.city_alive[0, row, j]):
                continue
            reg = sim.city_dist_tile[0, row, j]
            spec = int(((reg >= 0) & sim._is_specialty.reshape(-1)).sum())
            cap = (int(sim.city_pop[0, row, j]) - 1) // 3 + 1
            for si, (di, ut, uc, plc, _fc) in enumerate(sim._scaffold):
                if plc != 0:
                    continue  # the plain surface: no aqueduct/encampment/coast rule
                unlocked = (bool(sim.civ_techs[0, row, ut]) if ut >= 0
                            else (bool(sim.civ_civics[0, row, uc]) if uc >= 0 else True))
                if not unlocked or int(reg[di]) >= 0:
                    continue
                if bool(sim._is_specialty[di]) and spec >= cap:
                    continue
                if bool(sim._district_elig(row, j, di, plc)[0].any()):
                    return row, j, si, di, plc
    raise AssertionError("no live city can place a plain-surface district at t25")


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    sim = build(rules, path)
    row, j, si, di, plc = _live_city(sim)
    sim.seat_ext[0, row] = True

    # --- 1) the ladder's key is the engine's old key ------------------------
    elig = sim._district_elig(row, j, di, plc)
    adj = sim.district_rank_adj(di, plc)
    pick = int(ladder.pick_district_tile(elig, adj)[0])
    cand = elig[0].nonzero(as_tuple=True)[0].tolist()
    want = max(cand, key=lambda t: (float(adj[0, t]), -t))
    assert pick == want, f"ladder picked {pick}, the highest-adjacency/lowest-index tile is {want}"
    assert bool(elig[0, pick]), "the ladder picked an ineligible tile"

    # --- 2) no tile -> nothing lands, and the SAME record with a tile does ---
    #   A legal column with no recorded plot must not build: choosing the plot
    #   is the policy's job, and an engine that filled it in would be deciding.
    #   The positive control is what makes the refusal mean anything.
    def apply_district(s, tile: int) -> None:
        dt = torch.full((1, s.RC, len(s._scaffold)), -1, dtype=torch.long)
        dt[0, j, si] = tile
        pr = torch.full((1, s.RC), -1, dtype=torch.long)
        pr[0, j] = s.DISTRICT_BASE + si
        s.seat_ext[0, row] = True
        s.city_current[0, row, j] = -1
        s.apply_seat_actions(row, production=pr, production_tile=dt)
        s._seat_record_apply(row, torch.ones(1, dtype=torch.bool))

    no_tile = build(rules, path)
    apply_district(no_tile, -1)
    assert int(no_tile.city_current[0, row, j]) == -1, "a district column with tile -1 queued something"
    assert int(no_tile.city_dist_tile[0, row, j, di]) < 0, "the registry gained a tile nobody named"

    with_tile = build(rules, path)
    apply_district(with_tile, pick)
    assert int(with_tile.city_current[0, row, j]) == with_tile.DISTRICT_BASE + si, \
        "the SAME record with a tile did not queue — the -1 case above proves nothing"
    assert int(with_tile.city_dist_tile[0, row, j, di]) == pick, "the registry recorded another tile"

    # --- 3) an INELIGIBLE named tile is refused -----------------------------
    bad = build(rules, path)
    bad.seat_ext[0, row] = True
    off = int(((bad.tile_seat[0] != row)).nonzero(as_tuple=True)[0][0])  # a tile this seat does not own
    assert not bool(bad._district_elig(row, j, di, plc)[0, off]), "the probe tile is eligible after all"
    placed = bad._place_district(row, j, di, torch.tensor([True]), plc, torch.tensor([off]))
    assert not bool(placed[0]), "the engine took a tile this seat does not own"
    assert int(bad.district[0, off]) < 0, "an unowned tile was paved"

    # --- 4) a SUBOPTIMAL named tile is honoured -----------------------------
    #   The engine validates; it does not improve on the policy.
    sub = build(rules, path)
    sub.seat_ext[0, row] = True
    e4 = sub._district_elig(row, j, di, plc)
    a4 = sub.district_rank_adj(di, plc)
    c4 = e4[0].nonzero(as_tuple=True)[0].tolist()
    assert len(c4) >= 2, "need two eligible tiles to prove the engine does not re-rank"
    best4 = int(ladder.pick_district_tile(e4, a4)[0])
    other = next(t for t in c4 if t != best4)
    got4 = sub._place_district(row, j, di, torch.tensor([True]), plc, torch.tensor([other]))
    assert bool(got4[0]), "the engine refused an eligible tile"
    assert int(sub.district[0, other]) == di, "the district did not land on the NAMED tile"
    assert int(sub.district[0, best4]) < 0, "the engine placed on its own favourite instead"

    # --- 5) the removable-feature tech gate ---------------------------------
    #   `tile_ftu` is the tile feature's removal tech; a district paves the
    #   tile, so a seat that cannot clear the feature cannot build there.
    fg = build(rules, path)
    fg.seat_ext[0, row] = True
    t5 = int(ladder.pick_district_tile(fg._district_elig(row, j, di, plc), fg.district_rank_adj(di, plc))[0])
    assert t5 >= 0, "no eligible tile to plant a feature on"
    tech5 = 0
    fg.tile_ftu[0, t5] = tech5
    fg.feat_stripped[0, t5] = False
    fg.civ_techs[0, row, tech5] = False
    assert not bool(fg._district_elig(row, j, di, plc)[0, t5]), \
        "a standing removable feature must block the plot until its tech is in"
    fg.civ_techs[0, row, tech5] = True
    assert bool(fg._district_elig(row, j, di, plc)[0, t5]), "the removal tech must open the plot"
    fg.civ_techs[0, row, tech5] = False
    fg.feat_stripped[0, t5] = True
    assert bool(fg._district_elig(row, j, di, plc)[0, t5]), \
        "an ALREADY-CLEARED tile needs no tech — there is nothing left to remove"

    # --- 6) the record carries the tile, both directions --------------------
    rec_sim = build(rules, path)
    rec_sim.seat_ext[0, row] = True
    e6 = rec_sim._district_elig(row, j, di, plc)
    t6 = int(ladder.pick_district_tile(e6, rec_sim.district_rank_adj(di, plc))[0])
    prod6 = torch.full((1, rec_sim.RC), -1, dtype=torch.long)
    prod6[0, j] = rec_sim.DISTRICT_BASE + si
    dt6 = torch.full((1, rec_sim.RC, len(rec_sim._scaffold)), -1, dtype=torch.long)
    dt6[0, j, si] = t6
    rec = drive._extract_record(rec_sim, row, prod6, dt6, None, None, None, None,
                                torch.full((1, 1, 1), -1, dtype=torch.long), None, None, None, None, None, 0)
    ent = next(e for e in rec["production"] if int(e[1]) == rec_sim.DISTRICT_BASE + si)
    assert len(ent) == 3, f"a district entry must carry its tile, got {ent}"
    assert int(ent[2]) == t6, f"the record wrote tile {ent[2]}, the policy chose {t6}"
    assert int(ent[0]) == int(rec_sim.city_center[0, row, j]), "the entry is keyed by CENTRE tile"

    back = build(rules, path)
    back.seat_ext[0, row] = True
    back.city_current[0, row, j] = -1
    drive.replay_seat(back, row, {"production": rec["production"], "tech": None, "civic": None, "units": []})
    back._seat_record_apply(row, torch.ones(1, dtype=torch.bool))
    assert int(back.city_dist_tile[0, row, j, di]) == t6, \
        "the replay put the district somewhere other than the recorded tile"

    # --- 7) a REPEATABLE district goes down twice; a plain one does not -----
    #   CIV 6 lets a city hold several Neighborhoods. The registry keeps ONE
    #   tile per type, so the second is carried by the tile plane and counted
    #   there — and the non-repeatable control is what proves the gate is the
    #   `allowMultiple` flag rather than a hole in the harness.
    rep = next(((k, d) for k, (d, _u, _c, _p, _f) in enumerate(sim._scaffold)
                if bool(sim._is_repeatable[d])), None)
    assert rep is not None, "no repeatable district in the scaffold — this section proves nothing"
    si_r, di_r = rep

    def place_twice(s, si_x: int, di_x: int, complete_first: bool):
        """Queue that column twice on one city, each on its own tile. Returns
        (first tile, second tile or -1 if the engine refused)."""
        _di, ut, uc, plc_x, _fc = s._scaffold[si_x]
        if ut >= 0:
            s.civ_techs[0, row, ut] = True
        if uc >= 0:
            s.civ_civics[0, row, uc] = True
        s.seat_ext[0, row] = True
        out = []
        for _ in range(2):
            e = s._district_elig(row, j, di_x, plc_x)
            t = int(ladder.pick_district_tile(e, s.district_rank_adj(di_x, plc_x))[0])
            if t < 0:
                out.append(-1)
                break
            dt = torch.full((1, s.RC, len(s._scaffold)), -1, dtype=torch.long)
            dt[0, j, si_x] = t
            pr = torch.full((1, s.RC), -1, dtype=torch.long)
            pr[0, j] = s.DISTRICT_BASE + si_x
            s.city_current[0, row, j] = -1
            s.apply_seat_actions(row, production=pr, production_tile=dt)
            s._seat_record_apply(row, torch.ones(1, dtype=torch.bool))
            took = int(s.city_current[0, row, j]) == s.DISTRICT_BASE + si_x
            out.append(t if took else -1)
            if took and complete_first:
                s.district_complete[0, t] = True
        return out

    two = build(rules, path)
    base_all = int(two._district_counts(row)[0][0, j])
    a, b = place_twice(two, si_r, di_r, complete_first=True)
    assert a >= 0 and b >= 0 and a != b, f"the repeatable district did not go down twice: {a}, {b}"
    assert int(two.district[0, a]) == di_r and int(two.district[0, b]) == di_r, "a tile was not paved"
    assert int(two.city_dist_tile[0, row, j, di_r]) == a, "the registry did not keep its FIRST tile"
    assert int(two._district_counts(row)[0][0, j]) == base_all + 2, \
        "completedDistrictCount missed the second one — the tile-plane term is not counting"

    one = build(rules, path)
    si_p, di_p = next((k, d) for k, (d, _u, _c, p, _f) in enumerate(one._scaffold)
                      if p == 0 and not bool(one._is_repeatable[d]))
    c, d2 = place_twice(one, si_p, di_p, complete_first=True)
    assert c >= 0, "the control district did not go down even once"
    assert d2 < 0, f"a NON-repeatable district went down twice (tiles {c}, {d2})"

    print("district_wire_test OK — ladder key == the old engine key, no tile places nothing, "
          "an ineligible tile is refused, a suboptimal one is honoured, the feature-tech gate "
          "holds, the tile round-trips through the record, and a repeatable district goes down "
          "twice where a plain one is refused")


if __name__ == "__main__":
    main()
