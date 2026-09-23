"""THE NEUTRAL OBSERVATION is a plain value.

`gpu/core/neutral.py` hands the decision server one dict per game per seat.
Any engine must be able to emit the same value, so it carries no tensor and
no sim: Python ints, bools and lists of ints only, every field
`shared/decide.schema.json` names and nothing else, in the schema's order, and
a city named by the CENTRE tile of one of the seat's living cities (-1 where
none). The list groups are laid out as their meanings say: one research price
per catalog row, ascending card and war-column indices, a war kind only where
a declaration is open, one envoy row per city-state. The `cities` rows follow
the seat's living cities in array order and carry exactly the production
mask's open columns, and every plot of every open district column with the
adjacency the placement ranks it by.

Driven for a stretch first, over two worlds at once, so the seats hold
cities and the buy candidates are live rather than all -1.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import load_rules, load_fixture, fixture_paths
from core.env import BatchEnv
from core import neutral, records

TURNS = 40


def plain(v) -> bool:
    """True when `v` is built of dicts, lists, ints and bools alone."""
    if isinstance(v, dict):
        return all(isinstance(k, str) and plain(x) for k, x in v.items())
    if isinstance(v, list):
        return all(plain(x) for x in v)
    return type(v) in (int, bool)


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()[:2]
    env = BatchEnv([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64)
    sim = env.sim
    records.drive_batched(env, TURNS, seats=list(range(sim.n_majors)))
    # the drive leaves every queue full; EMPTY the even seats' so their
    # production columns and district plots are open to read
    for row in range(0, sim.n_majors, 2):
        for j in range(sim.RC):
            sim._q_clear(torch.arange(sim.B), row, j)
    live =live_research = live_cards = live_declare = live_cols = live_sites = 0
    for row in range(sim.n_majors):
        nobs = neutral.seat_obs(sim, row)
        pmask = sim._seat_production_mask(row)
        assert len(nobs) == sim.B, f"seat {row}: {len(nobs)} observations for {sim.B} games"
        for b, ob in enumerate(nobs):
            assert plain(ob), f"seat {row} game {b}: the observation holds a non-plain value"
            assert json.loads(json.dumps(ob)) == ob, f"seat {row} game {b}: JSON does not round-trip it"
            assert list(ob) == [*neutral.SEAT_GROUPS, "cities"], f"seat {row} game {b}: groups {list(ob)}"
            centres = {int(c) for c, a in zip(sim.city_center[b, row].tolist(), sim.city_alive[b, row].tolist()) if a}
            for g, fields in neutral.SEAT_GROUPS.items():
                assert list(ob[g]) == [f for f, _k in fields], f"seat {row} game {b}: {g} fields out of schema order"
                for f, kind in fields:
                    v = ob[g][f]
                    if kind == "bool":
                        assert type(v) is bool, f"{g}.{f} = {v!r} is not a bool"
                    elif kind == "list":
                        assert type(v) is list and all(type(x) is int for x in v), f"{g}.{f} = {v!r} is not a list of ints"
                    else:
                        assert type(v) is int, f"{g}.{f} = {v!r} is not an int"
                    if kind == "city":
                        assert v == -1 or v in centres, f"seat {row} game {b}: {g}.{f} = {v} names no living city"
            where = f"seat {row} game {b}"
            # RESEARCH: one whole price per catalog row, -1 exactly where the
            # item is shut
            for f, mask in (("tech_cost", sim._seat_tech_mask(row)[b]), ("civic_cost", sim._seat_civic_mask(row)[b])):
                cost = ob["research"][f]
                assert len(cost) == mask.shape[0], f"{where}: research.{f} has {len(cost)} rows for {mask.shape[0]} items"
                assert [c >= 0 for c in cost] == mask.tolist(), f"{where}: research.{f} is open where the mask is not"
                live_research += sum(c >= 0 for c in cost)
            # POLICY: ascending card indices and four slot counts
            pol = ob["policy"]["unlocked"]
            assert pol == sorted(set(pol)) and all(0 <= k < sim._npol for k in pol), f"{where}: policy.unlocked {pol}"
            assert len(ob["policy"]["slots"]) == 4, f"{where}: policy.slots {ob['policy']['slots']}"
            live_cards += len(pol)
            # WAR: columns inside the head, a kind only where a declaration is open
            w = ob["war"]
            assert w["targets"] == len(sim.war_targets(row)), f"{where}: war.targets {w['targets']}"
            for f in ("declare", "sue"):
                assert w[f] == sorted(set(w[f])) and all(0 <= k < w["targets"] for k in w[f]), f"{where}: war.{f} {w[f]}"
            for f in ("kind_default", "kind_own"):
                assert len(w[f]) == sim.n_majors - 1, f"{where}: war.{f} has {len(w[f])} rows"
                assert all(k == -1 or c in w["declare"] for c, k in enumerate(w[f])), f"{where}: war.{f} names a shut column"
            live_declare += len(w["declare"])
            # ENVOY: one row per city-state
            assert len(ob["envoy"]["held"]) == sim.S, f"{where}: envoy.held has {len(ob['envoy']['held'])} rows"
            assert all(x >= -1 for x in ob["envoy"]["held"]), f"{where}: envoy.held {ob['envoy']['held']}"
            live += int(ob["buy"]["spawn_city"] >= 0)
            # CITIES: one row per living city in ARRAY order (living slots,
            # slot order), the production mask's open columns, and every
            # plot of every open district column with its adjacency
            slots = [j for j in neutral.living_order(sim.city_alive[:, row])[b].tolist()
                     if bool(sim.city_alive[b, row, j])]
            rows_c = ob["cities"]
            assert [c["centre"] for c in rows_c] == [int(sim.city_center[b, row, j]) for j in slots], \
                f"{where}: cities out of array order"
            for c, j in zip(rows_c, slots):
                assert list(c) == [f for f, _k in neutral.CITY_FIELDS], f"{where}: city fields {list(c)}"
                for f, kind in neutral.CITY_FIELDS:
                    v = c[f]
                    if kind == "bool":
                        assert type(v) is bool, f"{where}: cities.{f} = {v!r} is not a bool"
                    elif kind == "list":
                        assert type(v) is list and all(type(x) is int for x in v), f"{where}: cities.{f} = {v!r}"
                    elif kind == "table":
                        assert type(v) is list and all(type(r) is list and len(r) == 3 and all(type(x) is int for x in r)
                                                       for r in v), f"{where}: cities.{f} = {v!r}"
                    else:
                        assert type(v) is int, f"{where}: cities.{f} = {v!r} is not an int"
                assert c["isCapital"] == bool(sim.city_is_cap[b, row, j]), f"{where}: city {c['centre']} capital flag"
                assert c["pop"] == int(sim.city_pop[b, row, j]), f"{where}: city {c['centre']} pop"
                assert c["settlerQueued"] == int((sim.city_current[b, row, j] == sim.SETTLER).sum()), \
                    f"{where}: city {c['centre']} settlers on order"
                assert c["prodOpen"] == pmask[b, j].nonzero(as_tuple=True)[0].tolist(), \
                    f"{where}: city {c['centre']} production columns"
                live_cols += len(c["prodOpen"])
                ds = c["distSites"]
                assert ds == sorted(ds), f"{where}: city {c['centre']} plots not ascending"
                nS = len(sim._scaffold)
                open_d = [col for col in c["prodOpen"] if 0 <= col - sim.DISTRICT_BASE < nS]
                assert sorted({r[0] for r in ds}) == open_d, \
                    f"{where}: city {c['centre']} lists plots for {sorted({r[0] for r in ds})}, open {open_d}"
                for col in open_d:
                    di, _ut, _uc, plc, _fc = sim._scaffold[col - sim.DISTRICT_BASE]
                    elig = sim._district_elig(row, j, di, plc)[b]
                    adj = sim.district_rank_adj(di, plc)[b]
                    mine = [(t, a) for cc, t, a in ds if cc == col]
                    assert [t for t, _a in mine] == elig.nonzero(as_tuple=True)[0].tolist(), \
                        f"{where}: city {c['centre']} column {col} plots"
                    assert all(a == int(adj[t]) for t, a in mine), f"{where}: city {c['centre']} column {col} adjacency"
                    live_sites += len(mine)
            if not rows_c:
                assert not bool(pmask[b].any()), f"{where}: no living city, yet a production column is open"
    assert live > 0, "no seat held a city — the scene never exercised the city fields"
    assert live_cols > 0 and live_sites > 0, f"the cities rows never filled: {live_cols} columns, {live_sites} plots"
    assert live_research > 0 and live_cards > 0 and live_declare > 0, (
        f"a list group never filled: {live_research} open items, {live_cards} cards, {live_declare} declarations")
    print(f"NEUTRAL OBS OK ({sim.n_majors} seats x {sim.B} games after {TURNS} turns, {live} with a spawn city, "
          f"{live_research} open items, {live_cards} cards, {live_declare} open declarations, "
          f"{live_cols} open production columns, {live_sites} district plots)")


if __name__ == "__main__":
    main()
