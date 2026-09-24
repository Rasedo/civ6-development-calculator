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
adjacency the placement ranks it by; the specialist slots and pins, the
workable plots and the plots a sibling holds that `_swap_tile_ok` lets the
city claim. The `congress` group reads the engine's own schedule and
preference (a session turn is forced, forty turns never reach one), and the
`gp` group the standing offers.

Driven for a stretch first, over two worlds at once, so the seats hold
cities and the buy candidates are live rather than all -1.
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import load_rules, load_fixture, fixture_paths
from core.env import BatchEnv
from core import neutral, records

TURNS = 40
# the row width of every `table` field, as its schema meaning lays it out
TABLE_WIDTH = {"distSites": 3, "workTiles": 3, "swapFrom": 4}


def plain(v) -> bool:
    """True when `v` is built of dicts, lists, ints and bools alone."""
    if isinstance(v, dict):
        return all(isinstance(k, str) and plain(x) for k, x in v.items())
    if isinstance(v, list):
        return all(plain(x) for x in v)
    return type(v) in (int, bool)


def target_ctx(sim, row: int) -> dict:
    """The sim readers `targets` and `units` replace, for seat `row`, over
    the whole batch: the unit rows off the slot map and every tile plane
    unconditionally (the observation lists one only where a unit walks)."""
    smap = sim._seat_slot_map(row)
    sc = smap.clamp(min=0)
    T = sim.T
    allt = torch.arange(T).reshape(1, -1).expand(sim.B, -1)
    nrow = sim.n_majors
    spread = torch.zeros(sim.B, T, dtype=torch.bool)
    for b in range(sim.B):
        for r in range(nrow):
            for j in range(sim.RC):
                if bool(sim.city_alive[b, r, j]) and int(sim.city_followed[b, r, j]) != row:
                    spread[b, int(sim.city_center[b, r, j])] = True
    ctx = {"smap": smap, "tile": sim.unit_tile.gather(1, sc), "type": sim.unit_type.gather(1, sc),
           "charges": sim.unit_charges.gather(1, sc), "gpAt": sim.unit_gp_at.gather(1, sc),
           "spread": spread, "goody": sim.tile_goody,
           "digs": (sim._dig_here(row, allt) & ((sim.tile_seat < 0) | (sim.tile_seat == row))
                    & sim._museum_room(row).unsqueeze(1))}
    if sim.improvements_on:
        ctx["jobs"] = sim._seat_job_mask(row)
        ctx["engJobs"] = sim._seat_engineer_job_mask(row)
    if sim._naturalist_idx >= 0:
        ctx["parks"] = sim._park_cluster_legal(row, sim._park_cluster(allt)).any(dim=2)
    return ctx


def found_ok(sim, b: int) -> list:
    """`canFoundCity`'s terms, tile by tile, in game `b`."""
    ctrs = [int(c) for r in range(sim.n_majors) for c, a in zip(sim.city_center[b, r].tolist(), sim.city_alive[b, r].tolist()) if a]
    ctrs += [int(c) for c, a in zip(sim.citystate_center[b].tolist(), sim.citystate_alive[b].tolist()) if a]
    return [t for t in range(sim.T)
            if int(sim.tile_seat[b, t]) < 0 and bool(sim.settle_ok[b, t]) and int(sim.district[b, t]) < 0
            and int(sim.built_wonder[b, t]) < 0 and all(int(sim.pair_dist[t, c]) >= 4 for c in ctrs)]


def check_targets(sim, row: int, b: int, ob: dict, ctx: dict) -> Counter:
    """Seat `row`'s `units` and `targets` in game `b` against the sim readers
    they replace: each plane listed exactly where a unit of the seat walks
    toward it, and then exactly the plane's tiles."""
    where = f"seat {row} game {b}"
    assert list(ob["targets"]) == [f for f, _k in neutral.TARGET_FIELDS], f"{where}: targets fields {list(ob['targets'])}"
    n = int((ctx["smap"][b] >= 0).sum())
    units = ob["units"]
    assert len(units) == n, f"{where}: {len(units)} unit rows for {n} living units"
    live = Counter()
    for k, u in enumerate(units):
        assert list(u) == [f for f, _k in neutral.UNIT_FIELDS] and plain(u), f"{where}: unit row {u}"
        for f in ("tile", "type", "charges", "gpAt"):
            assert u[f] == int(ctx[f][b, k]), f"{where}: unit {k}.{f} = {u[f]} vs {int(ctx[f][b, k])}"
        cls = int(sim._gp_cls_of(torch.tensor([u["type"]]))[0]) if sim._A_GP >= 0 else -1
        if cls >= 0 and u["gpAt"] >= 0:
            at = min(u["gpAt"], sim._gp_site.shape[1] - 1)
            assert (u["gpSite"], u["gpArg"]) == (int(sim._gp_site[cls, at]), int(sim._gp_site_district[cls, at])), \
                f"{where}: unit {k} Great Person site"
        else:
            assert (u["gpSite"], u["gpArg"]) == (-1, -1), f"{where}: unit {k} is no Great Person, site {u['gpSite']}"
    charged = [u for u in units if u["charges"] > 0]

    def holds(idx: int, pool=charged) -> bool:
        return idx >= 0 and any(u["type"] == idx for u in pool)

    def tiles(plane) -> list:
        return plane[b].nonzero(as_tuple=True)[0].tolist()

    tg = ob["targets"]
    want = {
        "jobs": tiles(ctx["jobs"]) if sim.improvements_on and holds(sim._builder_idx) else [],
        "engJobs": tiles(ctx["engJobs"]) if sim.improvements_on and holds(getattr(sim, "_eng_idx", -1)) else [],
        "spread": (tiles(ctx["spread"]) if bool(sim.civ_religion_done[b, row])
                   and (holds(sim._missionary_idx) or holds(sim._apostle_idx)) else []),
        "foundOk": (found_ok(sim, b) if sim._settler_idx >= 0 and sim._A_FOUND >= 0 and holds(sim._settler_idx, units)
                    and int(sim.city_alive[b, row].sum()) < int(sim.rules.seats.get("maxCities", 6)) else []),
        "digs": tiles(ctx["digs"]) if sim._A_EXCAVATE >= 0 and holds(sim._archaeologist_idx) else [],
        "parks": tiles(ctx["parks"]) if sim._A_PARK >= 0 and holds(sim._naturalist_idx) else [],
        "goody": tiles(ctx["goody"]),
    }
    for f, w in want.items():
        assert tg[f] == w, f"{where}: targets.{f} {tg[f][:12]} vs {w[:12]}"
        live[f] += len(w)
    keys = sorted({(u["gpSite"], u["gpArg"]) for u in charged if u["gpSite"] >= 0 and u["gpSite"] != 1})
    gp = sorted([s, a, t] for s, a in keys for t in tiles(neutral.gp_site_plane(sim, row, s, a)))
    assert tg["gpSites"] == gp, f"{where}: targets.gpSites {tg['gpSites'][:8]} vs {gp[:8]}"
    live["gpSites"] += len(gp)
    return live


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
    live = live_research = live_cards = live_declare = live_cols = live_sites = 0
    live_work = live_swap = live_gp = 0
    live_tgt: Counter = Counter()
    live_units = 0
    for row in range(sim.n_majors):
        nobs = neutral.seat_obs(sim, row)
        pmask = sim._seat_production_mask(row)
        spec_slots = sim._city_spec_slots(row) if len(sim.districts_cat) else None
        win_t, win_v = sim._work_window(row)
        worked = [{int(t) for t in sim.city_worked[b, row].flatten().tolist() if t >= 0} for b in range(sim.B)]
        tgt_ctx = target_ctx(sim, row)
        assert len(nobs) == sim.B, f"seat {row}: {len(nobs)} observations for {sim.B} games"
        for b, ob in enumerate(nobs):
            assert plain(ob), f"seat {row} game {b}: the observation holds a non-plain value"
            assert json.loads(json.dumps(ob)) == ob, f"seat {row} game {b}: JSON does not round-trip it"
            assert list(ob) == [*neutral.SEAT_GROUPS, "cities", "targets", "units"], f"seat {row} game {b}: groups {list(ob)}"
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
                        assert type(v) is list and all(type(r) is list and len(r) == TABLE_WIDTH[f]
                                                       and all(type(x) is int for x in r)
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
                # CITIZENS: the specialist slots and pins per district, the
                # workable plots with their resource priority and pin, and
                # every plot a sibling holds that the city may claim
                if len(sim.districts_cat):
                    assert c["specSlots"] == spec_slots[b, j].tolist(), f"{where}: city {c['centre']} specSlots"
                    assert c["specPin"] == sim.city_spec_pin[b, row, j].tolist(), f"{where}: city {c['centre']} specPin"
                else:
                    assert c["specSlots"] == [] and c["specPin"] == [], f"{where}: specialist rows without districts"
                wt = sorted((int(t), int(sim.res_priority[b, t]), int(sim.tile_locked[b, t]))
                            for t, v in zip(win_t[b, j].tolist(), win_v[b, j].tolist()) if v)
                assert [tuple(r) for r in c["workTiles"]] == wt, f"{where}: city {c['centre']} workTiles"
                live_work += len(wt)
                sw = []
                for t in win_t[b, j].tolist():
                    if t < 0 or not bool(sim._swap_tile_ok(row, torch.tensor([[j]]).expand(sim.B, 1),
                                                           torch.tensor([[t]]).expand(sim.B, 1))[b, 0]):
                        continue
                    holder = [int(sim.city_center[b, row, i]) for i in range(sim.RC)
                              if bool(sim.city_alive[b, row, i]) and int(sim.city_id[b, row, i]) == int(sim.tile_city[b, t])]
                    assert len(holder) == 1, f"{where}: plot {t} has holders {holder}"
                    sw.append([t, holder[0], int(t in worked[b]), int(sim.tile_locked[b, t])])
                assert c["swapFrom"] == sorted(sw), f"{where}: city {c['centre']} swapFrom {c['swapFrom']} vs {sorted(sw)}"
                live_swap += len(sw)
            # CONGRESS: the coming session as the engine's own schedule reads it
            fires, res0, res1, dv = sim._congress_upcoming(int(sim.turn) + 1)
            cg = ob["congress"]
            assert cg["slate"] == [int(res0[b]), int(res1[b])], f"{where}: congress.slate {cg['slate']}"
            assert cg["dv"] == bool(dv[b]) and cg["leader"] == int(sim._congress_leader(dv)[b]), f"{where}: congress dv/leader"
            assert cg["special"] == bool(sim._special_upcoming(int(sim.turn) + 1)[b]), f"{where}: congress.special"
            assert cg["favor"] == int(math.floor(float(sim.civ_diplo_favor[b, row]))), f"{where}: congress.favor"
            assert cg["vote_step"] == int(sim._congress_vstep), f"{where}: congress.vote_step"
            for s, r in enumerate(cg["slate"]):
                want = (-1, -1) if r < 0 else tuple(int(x[b]) for x in sim._congress_pref(r, row))
                assert (cg["pref_outcome"][s], cg["pref_target"][s]) == want, f"{where}: congress pref slot {s}"
            # GREAT PEOPLE: one row per class
            gp = ob["gp"]
            nG = sim.gp_offer.shape[1] if sim._gp_nc else 0
            assert gp["offer"] == sim.gp_offer[b, :nG].tolist(), f"{where}: gp.offer"
            assert gp["passed_by"] == sim.gp_passed_by[b, :nG].tolist(), f"{where}: gp.passed_by"
            assert gp["price"] == [int(x) for x in sim.gp_price[b, :nG].tolist()], f"{where}: gp.price"
            assert all(float(x) == int(x) for x in sim.gp_price[b, :nG].tolist()), f"{where}: a fractional gp price"
            assert gp["points"] == [math.floor(x) for x in sim.civ_gpp[b, row, :nG].tolist()], f"{where}: gp.points"
            live_gp += sum(x >= 0 for x in gp["offer"])
            if not rows_c:
                assert not bool(pmask[b].any()), f"{where}: no living city, yet a production column is open"
            live_tgt += check_targets(sim, row, b, ob, tgt_ctx)
            live_units += len(ob["units"])
    # A SESSION TURN, forced: forty turns never reach the Congress, so the
    # schedule is made to announce the first two resolutions with the
    # Diplomatic Victory vote, and every seat's preference is read back
    NR = len(sim._congress_res)
    assert NR >= 2, f"{NR} congress resolutions in the catalog"
    on = torch.ones(sim.B, dtype=torch.bool)
    sim._congress_upcoming = lambda _turn: (on, torch.zeros(sim.B, dtype=torch.long),
                                            torch.ones(sim.B, dtype=torch.long), on)
    live_pref = 0
    for row in range(sim.n_majors):
        for b, ob in enumerate(neutral.seat_obs(sim, row)):
            cg = ob["congress"]
            assert cg["slate"] == [0, 1] and cg["dv"], f"seat {row} game {b}: the forced session {cg}"
            assert cg["leader"] == int(sim._congress_leader(on)[b]), f"seat {row} game {b}: congress.leader"
            for s in range(2):
                want = tuple(int(x[b]) for x in sim._congress_pref(s, row))
                assert (cg["pref_outcome"][s], cg["pref_target"][s]) == want, f"seat {row} game {b}: pref slot {s}"
                live_pref += 1
    del sim._congress_upcoming
    assert live > 0, "no seat held a city — the scene never exercised the city fields"
    assert live_work > 0, "no city listed a workable plot"
    assert live_cols > 0 and live_sites > 0, f"the cities rows never filled: {live_cols} columns, {live_sites} plots"
    assert live_research > 0 and live_cards > 0 and live_declare > 0, (
        f"a list group never filled: {live_research} open items, {live_cards} cards, {live_declare} declarations")
    assert live_units > 0 and live_tgt["jobs"] > 0 and live_tgt["goody"] + live_tgt["foundOk"] > 0, (
        f"the unit rows or tile planes never filled: {live_units} units, {dict(live_tgt)}")
    print(f"NEUTRAL OBS OK ({sim.n_majors} seats x {sim.B} games after {TURNS} turns, {live} with a spawn city, "
          f"{live_units} unit rows, target tiles {dict(live_tgt)}, "
          f"{live_research} open items, {live_cards} cards, {live_declare} open declarations, "
          f"{live_cols} open production columns, {live_sites} district plots, {live_work} workable plots, "
          f"{live_swap} claimable plots, {live_gp} Great Person offers, {live_pref} congress preferences)")


if __name__ == "__main__":
    main()
