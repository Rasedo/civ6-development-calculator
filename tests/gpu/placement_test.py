"""WHAT CAN BE PLACED WHERE: the wonder's ground and the suzerain improvements.

    python tests/gpu/placement_test.py

Two halves of the same question, and each is split across the two engines in
its own way:

  * a WONDER's ground is baked per tile into the `wok` bitmask by the exporter
    (`wonderTerrainOk`, one body), and everything that can move during a game —
    an adjacent district and the BUILDING inside it, an adjacent improvement,
    the capital next door, a founded religion — stays live in `_wonder_cand`.
    This lane pins that the two halves meet: a row whose bit is clear is never
    a candidate, and a row whose bit is set still answers to its live clause.

  * a SUZERAIN improvement is offered only while this seat holds the named
    city-state, and its ground, its neighbours' payout and its three tails
    (housing civic, religious healing, tourism) are all catalog columns.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def fresh(rules, path, turns=30):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))
    for _ in range(turns):
        sim.step()
    return sim


def wrow(sim, key, want=None):
    """The first wonder row whose `key` is set (to `want`, when given)."""
    for i, r in enumerate(sim._wond_rows):
        v = r.get(key, -1)
        if want is None:
            if (int(v) >= 0 if isinstance(v, (int, float)) else bool(v)):
                return i, r
        elif int(v) == want:
            return i, r
    return -1, None


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    row = 1
    sim = fresh(rules, path)

    # -- 1: the STATIC half is a per-tile bit, and it is not all ones -------
    nW = sim._wond_n
    assert nW > 0, "the catalog carries no built wonders"
    per = [(int(((sim.wok[0] >> i) & 1).sum()), int(sim._wond_rows[i].get("id", i)))
           for i in range(nW)]
    counts = [c for c, _ in per]
    assert min(counts) < sim.T, (
        "every wonder fits every tile — the exported `wok` mask carries no ground rule")
    assert max(counts) > 0, "no wonder fits anywhere — the `wok` mask is empty"
    narrow = min(range(nW), key=lambda i: int(((sim.wok[0] >> i) & 1).sum()))
    print(f"  1 wok OK ({nW} rows, tightest fits {counts[narrow]}/{sim.T} tiles)")

    # a cleared bit is final: `_wonder_cand` never widens what the ground refused
    base = torch.ones(1, sim.T, dtype=torch.bool, device=sim.device)
    for wi in range(nW):
        cand = sim._wonder_cand(row, 0, wi, base)
        bit = ((sim.wok[0] >> wi) & 1).bool()
        assert not bool((cand[0] & ~bit).any()), (
            f"wonder {wi} was offered a tile its own ground rule refused")
    print("  2 live half OK (never widens the static bit, for any row)")

    # -- 3: the four LIVE clauses each bite ---------------------------------
    wi_db, r_db = wrow(sim, "adjDB")
    if wi_db >= 0:
        di, bi = int(r_db["adjD"]), int(r_db["adjDB"])
        t = int((((sim.wok[0] >> wi_db) & 1).bool()).nonzero().flatten()[0])
        nb = [int(x) for x in sim.neigh[t].tolist() if x >= 0]
        j = int(sim.city_alive[0, row].nonzero().flatten()[0])
        sim.district[0, nb[0]] = di
        sim.district_complete[0, nb[0]] = True
        sim.tile_seat[0, nb[0]] = row
        sim.tile_city[0, nb[0]] = int(sim.city_id[0, row, j])
        sim.city_bldg[0, row, j, bi] = False
        sim._eff_version += 1
        sim._tile_owner_ver += 1
        assert not bool(sim._adj_district_with(di, bi)[0, t]), (
            "the district alone is not enough — `cityAtTile` asks for the BUILDING")
        sim.city_bldg[0, row, j, bi] = True
        sim._eff_version += 1
        assert bool(sim._adj_district_with(di, bi)[0, t]), (
            "the district plus its building must satisfy the clause")
        print(f"  3 adjacent district BUILDING OK (district {di} + building {bi})")

    wi_i, r_i = wrow(sim, "adjI")
    if wi_i >= 0:
        ii = int(r_i["adjI"])
        t = 0
        nb = [int(x) for x in sim.neigh[t].tolist() if x >= 0]
        sim.improvement[0, nb[0]] = -1
        sim._eff_version += 1
        assert not bool(sim._adj_improvement(ii)[0, t])
        sim.improvement[0, nb[0]] = ii
        sim._eff_version += 1
        assert bool(sim._adj_improvement(ii)[0, t]), "an adjacent improvement must satisfy it"
        print(f"  4 adjacent improvement OK (improvement {ii})")

    wi_c, _ = wrow(sim, "adjCap")
    if wi_c >= 0:
        cap = sim.city_is_cap[0, row] & sim.city_alive[0, row]
        assert bool(cap.any()), "the row holds no capital to stand beside"
        ct = int(sim.city_center[0, row, int(cap.nonzero().flatten()[0])])
        near = sim._adj_capital(row)[0]
        for x in [int(v) for v in sim.neigh[ct].tolist() if v >= 0]:
            assert bool(near[x]), "every neighbour of the capital centre is adjacent to it"
        assert not bool(near[ct]), "the capital's own tile is not ADJACENT to itself"
        print("  5 adjacent capital OK (the ring, and not the centre itself)")

    wi_r, _ = wrow(sim, "needRel")
    if wi_r >= 0:
        sim.civ_religion_done[0, row] = False
        assert not bool(sim._wonder_cand(row, 0, wi_r, base)[0].any()), (
            "a religion-gated wonder is nowhere placeable before the religion is founded")
        sim.civ_religion_done[0, row] = True
        print("  6 religion gate OK (no candidate tile at all until it is founded)")

    # -- 7: a SUZERAIN improvement is the minor's, not the map's ------------
    suz = [k for k, s in enumerate(sim._imp_suz) if s]
    assert suz, "the catalog carries no suzerain improvement"
    for k in suz:
        held = (sim._suzerain_mask(row) & (sim.citystate_suz_imp[:, : sim.S] == k)).any(dim=1)
        ok = sim._suz_improvement_ok(row, k)
        if not bool(held[0]):
            assert not bool(ok[0].any()), (
                f"improvement {k} was offered to a seat that holds no suzerainty over its minor")
    print(f"  7 suzerainty OK ({len(suz)} rows, each refused without the minor)")

    # Granting it opens exactly the tiles the ground clause allows. Which
    # minors a map holds is a per-GAME draw, so the pairing is written here
    # rather than waiting for a seed to deal the right city-state.
    k = suz[0]
    sim.citystate_suz_imp[0, 0] = k
    sim.seat_citystate_envoys[0, row, 0] = 99
    sim.seat_citystate_met[0, row, 0] = True
    sim._eff_version += 1
    held = (sim._suzerain_mask(row) & (sim.citystate_suz_imp[:, : sim.S] == k)).any(dim=1)
    assert bool(held[0]), "99 envoys and nobody else's must make this seat suzerain"
    ok = sim._suz_improvement_ok(row, k)[0]
    ground = sim._imp_ground_ok(k)[0]
    assert bool((ok == ground).all()), (
        "with the suzerainty held, the offer is exactly the ground clause")
    assert bool(ground.any()) and not bool(ground.all()), (
        f"improvement {k}'s ground clause allows every tile or none — it states nothing")
    print(f"  8 ground clause OK (row {k}, {int(ground.sum())}/{sim.T} tiles once held)")

    # -- 9: the three catalog TAILS are wired ------------------------------
    assert any(x >= 0 for x in sim._imp_tour_y), "no improvement pays tourism"
    assert bool((sim._imp_rel_heal > 0).any()), "no improvement heals a religious unit"
    assert bool((sim._imp_house_civic >= 0).any()), "no improvement gains housing on a civic"
    assert sim._imp_adj_live, "no improvement carries an adjacency rule"
    print("  9 tails OK (tourism, religious heal, housing civic, adjacency)")

    print("placement_test OK — the wonder's ground and the suzerain improvements")


if __name__ == "__main__":
    main()
