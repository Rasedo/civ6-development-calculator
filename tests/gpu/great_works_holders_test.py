"""Great Works held PER HOLDER — the GPU lane.

CIV6 (`Building_GreatWorks`): a building or wonder declares slots of one
type, a slot type takes a set of object types, and a work sits in one
holder's slot. The wire carries the table (`greatWorks` under rules.seats);
this lane pins the loader's reading of it against the layout both engines
index into.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths


def main() -> None:
    rules = load_rules()
    gw = rules.seats["greatWorks"]
    paths = fixture_paths()
    assert paths, "no fixtures — run the exporter first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)

    # --- the wire contract --------------------------------------------------
    assert sim.GW_W == int(gw["w"]) == len(gw["slotHolder"]) == 37, (sim.GW_W, gw["w"])
    assert sim.GW_H == len(gw["holders"]) == 15
    ids = [h["id"] for h in gw["holders"]]
    assert ids[0] == "PALACE" and sim._gw_holder_bidx[0] == -2, "the Palace holder stands on the capital flag"
    for h, (b, w, is_w) in enumerate(zip(sim._gw_holder_bidx, sim._gw_holder_widx, sim._gw_holder_wonder)):
        if is_w:
            assert w >= 0 and b < 0 and w < sim._wond_n, (ids[h], b, w)
        else:
            assert w < 0 and (b == -2 or 0 <= b < sim.NB), (ids[h], b, w)
    # holders come in table order, so a slot's holder never decreases
    assert bool((sim._gw_slot_holder[1:] >= sim._gw_slot_holder[:-1]).all())
    # the Palace row is widened by Nkisi's four, ranked 0..3
    palace = sim._gw_slot_holder == 0
    assert int(palace.sum()) == 5 and sim._gw_slot_extra[palace].tolist() == [-1, 0, 1, 2, 3]
    assert int((sim._gw_slot_extra >= 0).sum()) == 4
    # GreatWork_ValidSubTypes: a Palace slot (6) takes every object, a
    # Cathedral slot (5) only RELIGIOUS art (3), an Art slot (1) the four arts
    assert bool(sim._gw_accepts[6].all())
    assert sim._gw_accepts[5].long().tolist() == [0, 0, 0, 1, 0, 0, 0, 0]
    assert sim._gw_accepts[1].long().tolist() == [1, 1, 1, 1, 0, 0, 0, 0]
    # per-object yields in the install's object order (GS layer last):
    # sculpture, portrait, landscape, religious, artifact, writing, music, relic
    assert sim._gw_obj_culture.tolist() == [3, 3, 3, 3, 3, 2, 4, 0]
    assert sim._gw_obj_tourism.tolist() == [2, 2, 2, 2, 3, 2, 4, 8]
    assert sim._gw_obj_faith.tolist() == [0, 0, 0, 0, 0, 0, 0, 4]
    assert sim._gw_obj_kind.tolist() == [1, 1, 1, 1, -1, 0, 2, -1]
    assert sim._gw_theming_mult == 2
    # the roster rows: Nkisi's Palace +4, Kristina's 3-slot building / 2-slot wonder
    assert [r[2:] for r in sim._gw_extra_rows] == [(0, 4)], sim._gw_extra_rows
    assert sorted(r[2:] for r in sim._gw_auto_theme_rows) == [(2, 1), (3, 0)], sim._gw_auto_theme_rows

    print("BATTERY OK great_works_holders")


if __name__ == "__main__":
    main()
