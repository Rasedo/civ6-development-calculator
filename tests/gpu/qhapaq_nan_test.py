"""QHAPAQ ÑAN — the GPU half.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/qhapaq_nan_test.py

The TS twin is tests/cpu/map/qhapaq-nan.test.ts.

CIV6 (Expansion2_Improvements_Major.xml, IMPROVEMENT_MOUNTAIN_ROAD): "Unlocks
the Builder ability to construct a Qhapaq Ñan, unique to Pachacuti. Acts as a
movement portal on a mountain range, allowing units to move into it and exit
from another portal at the cost of 2 Movement. ... Can only be built on an
adjacent Mountain tile. Cannot be pillaged or removed." TraitType
TRAIT_LEADER_PACHACUTI_IMPROVEMENT_MOUNTAIN_ROAD, PrereqCivic
CIVIC_FOREIGN_TRADE, UNIT_BUILDER, the Tunnel's own MOUNTAIN_PORTAL.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, fixture_paths  # noqa: E402
from core.simbase import FIXTURES  # noqa: E402
from warmup import warm_base, opened  # noqa: E402

B0 = 0
RJ = json.loads((FIXTURES / "rules.json").read_text())
IIDS = RJ["improvements"]["ids"]


def build(path) -> BatchSim:
    return warm_base(str(path), lambda: opened(load_rules(), path))


def _ridge(sim, n: int = 2):
    """`n` tiles of one mountain range, lowest index first."""
    mt = sim.tile_mountain[B0].nonzero().flatten().tolist()
    assert mt, "this fixture carries no mountain"
    for rid in sorted({int(sim.tile_range[B0, t]) for t in mt}):
        same = sorted(t for t in mt if int(sim.tile_range[B0, t]) == rid)
        if len(same) >= n:
            return same[:n]
    raise AssertionError(f"no range of {n} tiles")


def _pachacuti(sim) -> int:
    k = IIDS.index("MOUNTAIN_ROAD")
    leader = sim._imp_uniq_leader[k]
    assert leader >= 0, "the row names no leader"
    return leader


def _stand_builder_beside(sim, mt: int):
    """A row-0 Builder with three charges on a land tile beside `mt`, every
    OTHER mountain around that tile improved so `mt` is the one target.
    Answers (slot, rank, the tile it stands on)."""
    nb = [int(x) for x in sim.neigh[mt].tolist()
          if x >= 0 and not bool(sim.water[B0, x]) and bool(sim.passable[B0, x])]
    assert nb, f"tile {mt} has no land neighbour to stand on"
    here = nb[0]
    for x in sim.neigh[here].tolist():
        if x >= 0 and x != mt and bool(sim.tile_mountain[B0, x]) and int(sim.improvement[B0, x]) < 0:
            sim.improvement[B0, x] = sim.TUNNEL
    lo = sim.POOL_LO["major"]
    for v in range(sim.major_unit_alive.shape[1]):
        if not bool(sim.major_unit_alive[B0, v]) or int(sim.major_unit_seat[B0, v]) != 0:
            continue
        was = int(sim.major_unit_tile[B0, v])
        for plane in (sim.military_at, sim.civilian_at, sim.support_at, sim.embarked_at):
            if int(plane[B0, was]) == v + lo:
                plane[B0, was] = -1
        sim.major_unit_type[B0, v] = sim._builder_idx
        sim.major_unit_mp[B0, v] = float(sim._type_moves[sim._builder_idx])
        sim.major_unit_hp[B0, v] = 100
        sim.major_unit_charges[B0, v] = 3
        sim.major_unit_tile[B0, v] = here
        sim.civilian_at[B0, here] = v + lo
        sim._eff_version += 1
        sim._gen_ver += 1
        smap = sim._seat_slot_map(0)[0]
        return v, int((smap == v + lo).nonzero(as_tuple=True)[0][0]), here
    raise AssertionError("row 0 holds no live unit to retype")


def test_the_wire(rules, path) -> None:
    sim = build(path)
    k = IIDS.index("MOUNTAIN_ROAD")
    assert IIDS[-1] == "MOUNTAIN_ROAD", "appended LAST, so no earlier column moved"
    assert bool(sim._imp_portal[k]) and bool(sim._imp_portal[sim.TUNNEL]), "both rows carry MOUNTAIN_PORTAL"
    assert sim._imp_adj_plot[k] and sim._imp_adj_plot[sim.TUNNEL], "both build on an ADJACENT plot"
    assert bool(sim._imp_no_pillage[k]) and bool(sim._imp_no_pillage[sim.TUNNEL])
    assert not sim._imp_eng[k], "the Builder's row, not the Engineer's"
    assert sim._imp_uniq[k] == -1, "a LEADER's row, not a civilization's"
    assert sim._imp_outside[k] and sim._imp_disaster_ok[k]
    assert int(sim._imp_unlock[k]) < 0 and int(sim._imp_unlock_civic[k]) >= 0, "a civic opens it"
    col = int(sim._A_IMP[k])
    assert 0 <= col < sim._act_names.index("PILLAGE"), "its BUILD column sits before PILLAGE"
    print("  1 the wire OK — a leader's Builder row, a portal on an adjacent plot, unpillageable")


def test_the_mask_and_the_applier(rules, path) -> None:
    sim = build(path)
    k = IIDS.index("MOUNTAIN_ROAD")
    col = int(sim._A_IMP[k])
    mt = _ridge(sim, 1)[0]
    sim.improvement[B0, mt] = -1
    sim.tile_seat[B0, mt] = -1                      # neutral: `outside` reaches it
    slot, rank, here = _stand_builder_beside(sim, mt)
    civic = int(sim._imp_unlock_civic[k])
    lead = _pachacuti(sim)
    other = (lead + 1) % int(sim.row_leader.max().item() + 2)

    sim.row_leader[B0, 0] = other
    sim.civ_civics[B0, 0, civic] = True
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(0)[0, rank, col]), "another leader's Builder was offered it"
    sim.row_leader[B0, 0] = lead
    sim.civ_civics[B0, 0, civic] = False
    sim._eff_version += 1
    assert not bool(sim._seat_unit_mask(0)[0, rank, col]), "offered before Foreign Trade"
    sim.civ_civics[B0, 0, civic] = True
    sim._eff_version += 1
    assert bool(sim._seat_unit_mask(0)[0, rank, col]), "Pachacuti's Builder beside a bare mountain"

    acts = torch.full((1, sim._seat_slot_map(0)[0].shape[0]), -1, dtype=torch.long)
    acts[0, rank] = col
    sim.seat_ext[B0, 0] = True
    sim._apply_seat_unit_actions(0, acts)
    assert int(sim.improvement[B0, mt]) == k, "the applier did not lay it on the mountain"
    assert int(sim.improvement[B0, here]) < 0, "nothing is laid underfoot"
    assert int(sim.major_unit_charges[B0, slot]) == 2, "one charge spent"
    print("  2 the build OK — Pachacuti's Builder, after Foreign Trade, onto the mountain beside it")


def test_one_network_with_the_tunnel(rules, path) -> None:
    sim = build(path)
    k = IIDS.index("MOUNTAIN_ROAD")
    a, b = _ridge(sim, 2)
    sim.improvement[B0, a] = k
    assert int(sim._portal_exit(torch.tensor([a]))[0]) == -1, "a lone portal found an exit"
    sim.improvement[B0, b] = sim.TUNNEL
    assert int(sim._portal_exit(torch.tensor([a]))[0]) == b
    assert int(sim._portal_exit(torch.tensor([b]))[0]) == a, "the last portal wraps"
    assert bool(sim._portal_plane()[B0, a]) and bool(sim._portal_plane()[B0, b])
    print("  3 the network OK — a Qhapaq Nan and a Tunnel on one range lead to each other")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_the_mask_and_the_applier(rules, path)
    test_one_network_with_the_tunnel(rules, path)
    print("BATTERY OK qhapaq_nan")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
