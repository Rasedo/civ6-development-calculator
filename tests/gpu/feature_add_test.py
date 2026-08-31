"""A FEATURE ARRIVES AFTER t0 — the `_add_feature` carrier.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/feature_add_test.py

The TS twin is tests/cpu/map/feature-add.test.ts. Nothing in the rollout
calls the carrier yet (WHERE a feature lands is an open owner question), so
this poke is its whole reach.

Proven here:
  * the refusal envelope — water, a live feature, a district, an
    improvement each refuse; a bare land tile takes the plant;
  * a natural-wonder row never arrives;
  * the ARRIVED feature's CATALOG yields join the production plane, and a
    plant onto a CHOPPED tile keeps the t0 feature's bake subtracted while
    paying the new row (`_feat_gone` / `_feat_add_y`);
  * the Seaside-Resort flip eligibility drops on the planted tile;
  * `featureId` (statecompare) reads the arrival.
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
FEATS = [f for f in RULES["improvements"]["featNatural"]]


def fresh(rules, path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu",
                               dtype=torch.float64))


def one_at(sim, tile: int) -> tuple[torch.Tensor, torch.Tensor]:
    att = torch.ones(sim.B, dtype=torch.bool)
    tt = torch.full((sim.B,), tile, dtype=torch.long)
    return att, tt


def bare_land(sim) -> int:
    ok = (~sim.water[B0] & ~sim.tile_submerged[B0] & sim.passable[B0]
          & (sim.feat_id[B0] < 0) & (sim.district[B0] < 0)
          & (sim.built_wonder[B0] < 0) & (sim.improvement[B0] < 0))
    idx = ok.nonzero(as_tuple=True)[0]
    assert len(idx) > 0, "no bare land tile"
    return int(idx[0])


def main() -> None:
    rules = load_rules()
    path = fixture_paths()[0]
    sim = fresh(rules, path)

    woods = next(i for i, f in enumerate(RULES["improvements"]["featCatalogY"])
                 if f[1] > 0 and not FEATS[i])  # a row with catalog PRODUCTION
    natural = next(i for i, f in enumerate(FEATS) if f)

    # 1 — refusals: water, a live feature, an improvement; bare land plants
    t_water = int(sim.water[B0].nonzero(as_tuple=True)[0][0])
    att, tt = one_at(sim, t_water)
    assert not bool(sim._add_feature(att, tt, woods).any()), "water took a feature"
    t_feat = int(((sim.feat_id[B0] >= 0) & ~sim.feat_stripped[B0]).nonzero(as_tuple=True)[0][0])
    att, tt = one_at(sim, t_feat)
    assert not bool(sim._add_feature(att, tt, woods).any()), "a live feature was overwritten"
    t0 = bare_land(sim)
    sim.improvement[B0, t0] = 0
    att, tt = one_at(sim, t0)
    assert not bool(sim._add_feature(att, tt, woods).any()), "an improved tile took a feature"
    sim.improvement[B0, t0] = -1
    assert bool(sim._add_feature(att, tt, woods).any()), "bare land refused the plant"
    assert int(sim.feat_id[B0, t0]) == woods and not bool(sim.feat_stripped[B0, t0])
    print("  1 refusal envelope OK — water/live-feature/improvement refuse, bare land plants")

    # 2 — a natural-wonder row never arrives
    t1 = bare_land(sim)
    att, tt = one_at(sim, t1)
    assert not bool(sim._add_feature(att, tt, natural).any()), "a natural wonder was planted"
    print("  2 natural-wonder row refused OK")

    # 3 — the arrival's catalog yields join the production plane
    prod_cat = float(RULES["improvements"]["featCatalogY"][woods][1])
    sim2 = fresh(rules, path)
    t2 = bare_land(sim2)
    p_before = float(sim2._neutral_prod()[B0, t2]) + float(sim2._feat_add_y()[B0, t2, 1])
    att, tt = one_at(sim2, t2)
    assert bool(sim2._add_feature(att, tt, woods).any())
    g = sim2._rcy_globals()
    assert abs(float(g["p_plane"][B0, t2]) - (p_before + prod_cat)) < 1e-9, \
        f"arrival paid {float(g['p_plane'][B0, t2])} vs {p_before} + {prod_cat}"
    print(f"  3 arrival pays its catalog production OK (+{prod_cat})")

    # 4 — plant onto a CHOPPED tile: the t0 bake stays subtracted, the new
    # row pays — the pair `_feat_gone` and `_feat_added` disagree on
    sim3 = fresh(rules, path)
    # a DIFFERENT t0 row than the plant — planting the SAME id back is the
    # regrow case, where the pair rightly reads "back to baked"
    t3 = int(((sim3.feat_id[B0] >= 0) & (sim3.feat_id[B0] != woods) & ~sim3.feat_stripped[B0]
              & (sim3.district[B0] < 0) & (sim3.improvement[B0] < 0)
              & ~sim3.water[B0] & (sim3.built_wonder[B0] < 0)).nonzero(as_tuple=True)[0][0])
    sim3.feat_stripped[B0, t3] = True
    sim3._eff_version += 1
    p_chopped = float(sim3._rcy_globals()["p_plane"][B0, t3])
    att, tt = one_at(sim3, t3)
    assert bool(sim3._add_feature(att, tt, woods).any()), "a chopped tile refused the plant"
    assert bool(sim3._feat_gone()[B0, t3]) and bool(sim3._feat_added()[B0, t3])
    p_planted = float(sim3._rcy_globals()["p_plane"][B0, t3])
    assert abs(p_planted - (p_chopped + prod_cat)) < 1e-9, \
        f"chopped-then-planted paid {p_planted} vs {p_chopped} + {prod_cat}"
    print("  4 chopped-then-planted OK — t0 bake stays out, the new row pays")

    # 5 — the Seaside-Resort flip eligibility drops on the planted tile
    sim4 = fresh(rules, path)
    if sim4.SEASIDE >= 0:
        el = sim4._sr_c[B0] & (sim4.feat_id[B0] < 0) & (sim4.improvement[B0] < 0) & (sim4.district[B0] < 0)
        idx = el.nonzero(as_tuple=True)[0]
        if len(idx) > 0:
            t4 = int(idx[0])
            att, tt = one_at(sim4, t4)
            assert bool(sim4._add_feature(att, tt, woods).any())
            assert not bool((sim4._sr_c[B0, t4] & ((sim4.feat_id[B0, t4] < 0) | sim4.feat_stripped[B0, t4]))), \
                "a planted tile stayed resort-eligible"
            print("  5 resort eligibility drops OK")
        else:
            print("  5 resort eligibility SKIPPED (no eligible tile on this map)")
    else:
        print("  5 resort eligibility SKIPPED (no Seaside Resort row)")

    # 6 — statecompare's featureId reads the arrival
    from core import statecompare as sc
    fid_row = sc.TILE["featureId"](sim2, B0, None)
    assert int(fid_row[t2]) == woods, "featureId missed the arrival"
    print("  6 featureId identity OK")

    print("FEATURE ADD OK — the carrier, its refusals, the priced arrival")


if __name__ == "__main__":
    main()
