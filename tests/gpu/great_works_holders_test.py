"""Great Works held PER HOLDER — the GPU lane, the twin of
tests/cpu/culture/great-works-holders.test.ts.

CIV6 (`Building_GreatWorks`): a building or wonder declares slots of one
type, a slot type takes a set of object types, and a work sits in one
holder's slot. The wire carries the table (`greatWorks` under rules.seats);
this lane pins the loader's reading of it, the capacity a city's holders give
it, the placement order, the two museums' theming rules, Kristina's
auto-theming (culture AND tourism) and Nkisi's widened Palace.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all, works_of, clear_works
from city_rows_test import play

SCULPTURE, PORTRAIT, LANDSCAPE, RELIGIOUS, ARTIFACT, WRITING, MUSIC, RELIC = range(8)


def slots_of(sim, h: int) -> list[int]:
    return (sim._gw_slot_holder == h).nonzero(as_tuple=True)[0].tolist()


def place(sim, row: int, col: int, obj: int, maker: int = -1, era: int = -1, seat: int = 0) -> int:
    """one work into one city through the engine's own composer; the slot or -1"""
    B = sim.B
    full = lambda v: torch.full((B,), v, dtype=torch.long)  # noqa: E731
    before = sim.city_gw_obj[0, row, col].clone()
    ok = sim._gw_place(row, torch.ones(B, dtype=torch.bool), full(col), full(obj), full(maker), full(era), full(seat))
    if not bool(ok[0]):
        return -1
    return int(((sim.city_gw_obj[0, row, col] >= 0) & (before < 0)).nonzero()[0])


def fresh(rules, path, names=("ROME", "EGYPT", "NORWAY"), keep_palace=False):
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    for r, name in enumerate(names):
        play(sim, r, name)
    sim = settle_all(sim)
    if not keep_palace:
        sim.city_is_cap[:, :, :] = False
    clear_works(sim)
    return sim


def main() -> None:
    rules = load_rules()
    gw = rules.seats["greatWorks"]
    ids = [h["id"] for h in gw["holders"]]
    H = {k: ids.index(k) for k in ids}
    paths = fixture_paths()
    assert paths, "no fixtures — run the exporter first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)

    # --- the wire contract --------------------------------------------------
    assert sim.GW_W == int(gw["w"]) == len(gw["slotHolder"]) == 37, (sim.GW_W, gw["w"])
    assert sim.GW_H == len(gw["holders"]) == 15
    assert ids[0] == "PALACE" and sim._gw_holder_bidx[0] == -2, "the Palace holder stands on the capital flag"
    for h, (b, w, is_w) in enumerate(zip(sim._gw_holder_bidx, sim._gw_holder_widx, sim._gw_holder_wonder)):
        if is_w:
            assert w >= 0 and b < 0 and w < sim._wond_n, (ids[h], b, w)
        else:
            assert w < 0 and (b == -2 or 0 <= b < sim.NB), (ids[h], b, w)
    assert bool((sim._gw_slot_holder[1:] >= sim._gw_slot_holder[:-1]).all()), "holders come in table order"
    palace = sim._gw_slot_holder == 0
    assert int(palace.sum()) == 5 and sim._gw_slot_extra[palace].tolist() == [-1, 0, 1, 2, 3], "the Palace row is widened by Nkisi's four, ranked"
    assert int((sim._gw_slot_extra >= 0).sum()) == 4
    assert bool(sim._gw_accepts[6].all()), "a Palace slot takes every object"
    assert sim._gw_accepts[5].long().tolist() == [0, 0, 0, 1, 0, 0, 0, 0], "a Cathedral slot takes RELIGIOUS art only"
    assert sim._gw_accepts[1].long().tolist() == [1, 1, 1, 1, 0, 0, 0, 0], "an Art slot takes the four arts"
    assert sim._gw_obj_culture.tolist() == [3, 3, 3, 3, 3, 2, 4, 0]
    assert sim._gw_obj_tourism.tolist() == [2, 2, 2, 2, 3, 2, 4, 8]
    assert sim._gw_obj_faith.tolist() == [0, 0, 0, 0, 0, 0, 0, 4]
    assert sim._gw_obj_kind.tolist() == [1, 1, 1, 1, -1, 0, 2, -1]
    assert sim._gw_theming_mult == 2
    assert [r[2:] for r in sim._gw_extra_rows] == [(0, 4)], sim._gw_extra_rows
    assert sorted(r[2:] for r in sim._gw_auto_theme_rows) == [(2, 1), (3, 0)], sim._gw_auto_theme_rows
    assert sim._gw_holder_theme[H["MUSEUM"]] == 1 and sim._gw_holder_theme[H["ARCHAEOLOGICAL_MUSEUM"]] == 2
    assert sum(sim._gw_holder_theme) == 3, "nobody else carries a theming rule"
    print("  wire OK")

    amph, museum, arch, cath = (sim._gw_holder_bidx[H[k]] for k in ("AMPHITHEATER", "MUSEUM", "ARCHAEOLOGICAL_MUSEUM", "CATHEDRAL"))
    path = paths[0]

    # --- capacity from the holders standing in the city -------------------
    s = fresh(rules, path, keep_palace=True)
    assert bool(s.city_is_cap[0, 0, 0]), "the fixture capital carries the Palace"
    for o in range(8):
        assert bool(s._gw_room(0, o)[0, 0]), "a bare capital holds one work of any kind in its Palace"
    assert place(s, 0, 0, RELIC) == slots_of(s, H["PALACE"])[0]
    for o in range(8):
        assert not bool(s._gw_room(0, o)[0, 0]), "... and refuses a second"
    assert place(s, 0, 0, WRITING) == -1
    s = fresh(rules, path)
    assert not bool(s._gw_room_by_obj(0)[0, 0].any()), "a city with no holder refuses every work"
    s.city_bldg[0, 0, 0, cath] = True
    s._eff_version += 1
    assert not bool(s._gw_room(0, SCULPTURE)[0, 0]) and not bool(s._gw_room(0, RELIC)[0, 0])
    assert place(s, 0, 0, RELIGIOUS, maker=0) == slots_of(s, H["CATHEDRAL"])[0], "a Cathedral takes a religious painting alone"
    print("  capacity OK")

    # --- placement order: holder by holder in the table order --------------
    s = fresh(rules, path, keep_palace=True)
    s.city_bldg[0, 0, 0, amph] = True
    wi = s._gw_holder_widx[H["GREAT_LIBRARY"]]
    t0 = int(s.city_center[0, 0, 0])
    s.city_wonder[0, 0, 0, wi] = t0
    s.built_wonder_complete[0, t0] = True
    s._eff_version += 1
    got = [place(s, 0, 0, WRITING, maker=i) for i in range(6)]
    assert got == [slots_of(s, H["PALACE"])[0], *slots_of(s, H["AMPHITHEATER"]), *slots_of(s, H["GREAT_LIBRARY"]), -1], got
    # a pillaged holder accepts nothing new and keeps paying what it holds
    s = fresh(rules, path)
    s.city_bldg[0, 0, 0, amph] = True
    s._eff_version += 1
    assert place(s, 0, 0, WRITING, maker=0) >= 0
    s.city_bldg_pillaged[0, 0, 0, amph] = True
    s._bldg_version += 1
    s._eff_version += 1
    assert not bool(s._gw_room(0, WRITING)[0, 0]), "a pillaged Amphitheater takes nothing new"
    cul, _f = s._gw_yields(0)
    assert float(cul[0, 0]) == 2.0, "... and keeps paying its work"
    print("  placement order OK")

    # --- theming per holder ------------------------------------------------
    s = fresh(rules, path)
    s.city_bldg[0, 0, 0, museum] = True
    s._eff_version += 1
    for maker in (2, 14, 16):  # Donatello, Lewis, Collot: three sculptors
        assert int(s._gw_artist_objs[maker, 0]) == SCULPTURE
        assert place(s, 0, 0, SCULPTURE, maker=maker) >= 0
    assert bool(s._gw_themed(0)[0, 0, H["MUSEUM"]]), "three sculptures by three makers theme the Art Museum"
    cul, _f = s._gw_yields(0)
    assert float(cul[0, 0]) == 3 * 3 * 2
    km = torch.ones(s.B, 3, dtype=torch.long)
    assert int(s._gw_tourism_general(0, None, km)[0, 0]) == 2 * 3 * 2, "the themed museum doubles its tourism too"
    # the Archaeological Museum: one era, three civilizations
    s = fresh(rules, path)
    s.city_bldg[0, 0, 0, arch] = True
    s._eff_version += 1

    def dig(eras, seats) -> bool:
        clear_works(s)
        for e, c in zip(eras, seats):
            assert place(s, 0, 0, ARTIFACT, era=e, seat=c) >= 0
        return bool(s._gw_themed(0)[0, 0, H["ARCHAEOLOGICAL_MUSEUM"]])

    assert dig([2, 2, 2], [0, 1, 200])
    cul, _f = s._gw_yields(0)
    assert float(cul[0, 0]) == 3 * 3 * 2
    assert not dig([2, 2, 2], [0, 1, 1])
    assert not dig([2, 3, 2], [0, 1, 2])
    assert not dig([2, 2], [0, 1])
    print("  museum theming OK")

    # --- Nkisi: per SCULPTURE, the theming leaving the roster's adders alone --
    def sculpture_delta(names):
        """what three themed sculptures add to the buildings bucket, roster aside"""
        s = fresh(rules, path, names)
        s.city_bldg[0, 0, 0, museum] = True
        s._eff_version += 1
        base = s._city_totals()[0][0, 0].clone()  # [6]: food, production, gold, science, culture, faith
        for maker in (2, 14, 16):
            assert place(s, 0, 0, SCULPTURE, maker=maker) >= 0
        return s._city_totals()[0][0, 0] - base

    kongo = sculpture_delta(("KONGO", "EGYPT", "NORWAY"))
    plain = sculpture_delta(("ROME", "EGYPT", "NORWAY"))
    d = (kongo - plain).tolist()
    # +2 Food, +2 Production, +1 Faith, +4 Gold per sculpture x3 — the
    # amenity factor scales the non-food columns, so the RATIOS are pinned —
    # and the museum's theming leaves the roster's adders alone (culture equal)
    assert abs(d[0] - 6.0) < 1e-9, f"+2 Food per sculpture x3, got {d[0]}"
    assert d[1] > 0 and d[2] > 0 and d[5] > 0 and abs(d[4]) < 1e-9, d
    assert abs(d[2] / d[1] - 2.0) < 1e-9 and abs(d[1] / d[5] - 2.0) < 1e-9, "gold 4 : production 2 : faith 1"
    print("  Nkisi's sculpture rows OK")

    # --- Kristina: a two-slot wonder themes itself once full, culture AND tourism
    def library(names):
        s = fresh(rules, path, names)
        wi = s._gw_holder_widx[H["GREAT_LIBRARY"]]
        t0 = int(s.city_center[0, 0, 0])
        s.city_wonder[0, 0, 0, wi] = t0
        s.built_wonder_complete[0, t0] = True
        s._eff_version += 1
        assert place(s, 0, 0, WRITING, maker=0) >= 0
        half = bool(s._gw_themed(0)[0, 0, H["GREAT_LIBRARY"]])
        assert place(s, 0, 0, WRITING, maker=0) >= 0
        return (half, bool(s._gw_themed(0)[0, 0, H["GREAT_LIBRARY"]]),
                float(s._gw_yields(0)[0][0, 0]), int(s._gw_tourism_general(0, None, km)[0, 0]))

    assert library(("SWEDEN", "EGYPT", "NORWAY")) == (False, True, 2 * 2 * 2, 2 * 2 * 2), library(("SWEDEN", "EGYPT", "NORWAY"))
    assert library(("ROME", "EGYPT", "NORWAY")) == (False, False, 2 * 2, 2 * 2)
    # her BUILDING needs three slots: an Amphitheater never auto-themes, a
    # Museum full of one artist's mixed works does
    s = fresh(rules, path, ("SWEDEN", "EGYPT", "NORWAY"))
    s.city_bldg[0, 0, 0, amph] = True
    s.city_bldg[0, 0, 0, museum] = True
    s._eff_version += 1
    place(s, 0, 0, WRITING, maker=0)
    place(s, 0, 0, WRITING, maker=0)
    for o in s._gw_artist_objs[1].tolist():  # Michelangelo: religious, sculpture, sculpture
        assert place(s, 0, 0, int(o), maker=1) >= 0
    th = s._gw_themed(0)[0, 0]
    assert not bool(th[H["AMPHITHEATER"]]) and bool(th[H["MUSEUM"]])
    print("  Kristina's auto-theming OK")

    # --- Nkisi's Palace: five slots for Kongo, one for anyone else ----------
    def fill(names) -> int:
        s = fresh(rules, path, names, keep_palace=True)
        return sum(1 for o in (RELIC, WRITING, LANDSCAPE, MUSIC, ARTIFACT, SCULPTURE) if place(s, 0, 0, o, maker=0) >= 0)

    assert fill(("KONGO", "EGYPT", "NORWAY")) == 5
    assert fill(("ROME", "EGYPT", "NORWAY")) == 1
    print("  Nkisi's Palace OK")

    # --- the statecompare row reads every slot ------------------------------
    from core.statecompare import CITY as CITY_FIELDS  # noqa: E402
    s = fresh(rules, path)
    s.city_bldg[0, 0, 0, amph] = True
    s._eff_version += 1
    sl = place(s, 0, 0, WRITING, maker=4, seat=0)
    row = CITY_FIELDS["greatWorks"](s, 0, [(0, 0)])[0]
    assert len(row) == 4 * s.GW_W and row[4 * sl: 4 * sl + 4] == [WRITING, 4, -1, 0], row[4 * sl: 4 * sl + 4]
    print("BATTERY OK great_works_holders")


if __name__ == "__main__":
    main()
