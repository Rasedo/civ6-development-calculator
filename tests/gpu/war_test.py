"""War and peace on seat 0's war head.

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/war_test.py

The head ships ACTIVE (`_rl_war_active`) and EVERY row drives it, seat 0
included. Test 1 pins the no-column property: a turn nobody hands a war
column to is bit-identical to a sim with the head forced off, so the flag
cannot leak into an undriven turn. The rest prove the applied action is
EXACTLY the TS state transition: `_apply_war_column` must equal hand-poking
the declareWar / sueForPeace effect into the state and then stepping plain
(bit-identical across every _MUTABLE tensor), which sidesteps every same-turn
world confound (seat phase RNG, raids, income).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import load_rules, fixture_paths
from core.engine import _MUTABLE
from warmup import opened, warm_base

RICH = 10_000.0


# THE WARMED BASE, ONE PER (steps, slot). A scene pays a `restore` —
# milliseconds — instead of a fixture load, a settle and N steps, and `restore`
# round-trips every `_MUTABLE` plane (the very tuple `snap_all`/`drift` below
# compare). Two things it does not carry are put back by hand: `row_leader`,
# which the Enkidu scene blanks and which is map-generation catalog rather than
# state, and `_rl_war_active`, the head's own flag. `slot` keys a SECOND engine
# for the one scene that holds two live sims at once — the flag-off reference
# in test_inert_when_off. `_bvar_col_cache` is keyed by ROW alone rather than
# by a version counter, so it is emptied the way a fresh build leaves it.
_STATIC = ("row_leader",)


def build(rules, path, steps: int = 0, slot: int = 0):
    return warm_base((str(path), steps, slot), lambda: opened(rules, path, steps), _STATIC, ("_rl_war_active",))


def snap_all(sim):
    return {k: getattr(sim, k).clone() for k in _MUTABLE}


def drift(sim, ref) -> list[str]:
    return [k for k in _MUTABLE if not torch.equal(getattr(sim, k), ref[k])]


def war_vec(sim, code) -> torch.Tensor:
    return torch.full((sim.B,), code, dtype=torch.long)


def sue_col(sim, k: int) -> int:
    """The SUE column for the k-th target. The head is
    [declare per target, sue per target] over `war_targets(row)`, which runs
    the other majors and then the whole city-state roster."""
    return len(sim.war_targets(0)) + k


def test_inert_when_off(rules, path):
    """The flag ships ON, so what is under test is the NO-COLUMN path: a turn
    with no war column must be bit-identical to a sim with the head forced
    off. The gate does drive the column now — for seat 0 as for every row — so
    this pins the floor, not the gate."""
    # the lane's shared twenty-turn base: the instrument is `drift()` over
    # every _MUTABLE plane, whose width does not grow with the window — a
    # flag-dependent divergence shows on the first turn the flag can steer,
    # and the mask premise (civs alive, the declare column open) holds from
    # turn 0. Thirty turns on a base of its own cost a build nobody shared.
    sim = build(rules, path, steps=20)
    assert sim._rl_war_active, "the war head ships ACTIVE"
    # the reference takes its OWN base (`slot=1`): the two sims are live at the
    # same moment, and its flag has to be off BEFORE it steps, so its turns
    # stay in the scene rather than moving into a memoised base. THE TWO
    # COUNTS MOVE TOGETHER: the drift compares the same turn on both sides.
    ref = build(rules, path, slot=1)
    ref._rl_war_active = False
    for _ in range(20):
        ref.step()
    d = drift(sim, snap_all(ref))
    assert not d, f"war=None path must not depend on the flag: {d}"
    # the live mask offers declarations at peace (civs exist on this seed)
    if bool(sim.civ_alive[:, 1:].any()):
        assert bool(sim._seat_war_mask(0).any()), "a live war head should offer choices with civs alive"
    print("  activation OK (scripted path flag-independent; live mask non-degenerate)")


def test_declare(rules, path):
    sim = build(rules, path, steps=20)
    sim._rl_war_active = True
    m = sim._seat_war_mask(0)[0]
    assert bool(m[0]), "declare-war column should be open (civ 0 alive, at peace)"
    assert not bool(m[sue_col(sim, 0)]), "peace column must be closed while not at war"
    snap = sim.snapshot()
    sim._apply_war_column(0, war_vec(sim, 0))  # the head, the one entry — same call every row makes
    sim.step()
    assert bool(sim.war[0, 0, 1 + 0]), "declare did not set war[seat 0, civ 0]"
    after = snap_all(sim)
    # equivalence: poke declareWar's exact effect, then step plain
    sim.restore(snap)
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = True
    sim._reset_war_clock(0, 1, torch.ones(sim.B, dtype=torch.bool))
    _one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    _kind = sim._default_war_kind(sim._war_kinds_allowed(0, 1))  # the kind the head takes
    sim._stamp_war_kind(0, 1, _kind, _one)
    sim._grievance_war_declared(0, 1, _one, _kind)  # declareWar's ledger stamp
    sim.step()
    d = drift(sim, after)
    assert not d, f"declare != poked declareWar + plain step: {d}"
    print("  declare-war OK (bit-equal to the TS transition)")


def test_peace(rules, path):
    sim = build(rules, path, steps=20)
    sim._rl_war_active = True
    sim._apply_war_column(0, war_vec(sim, 0))  # declare on civ 0
    sim.step()
    rr = sim.rules.seats
    need = int(rr.get("warMinTurns", 10))  # sueForPeace's own gate key
    for _ in range(need):
        sim.civ_treasury[:, 0] = 0.0  # isolate the warTurns gate (a rich-enough world opens the gold gate mid-wait)
        assert not bool(sim._seat_war_mask(0)[0, sue_col(sim, 0)]), "peace column open too soon"
        sim.step()
    assert bool(sim.war[0, 0, 1 + 0]), "war ended prematurely (civ auto-peace?)"
    sim.civ_treasury[:, 0] = RICH
    m = sim._seat_war_mask(0)[0]
    assert bool(m[sue_col(sim, 0)]), "peace column should be open now (rich + warTurns >= min)"
    wt = int(sim.war_turns[0, 0, 1])
    cost = float(rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * wt)
    snap = sim.snapshot()
    sim._apply_war_column(0, war_vec(sim, sue_col(sim, 0)))  # sue for peace with seat 1
    sim.step()
    assert not bool(sim.war[0, 0, 1 + 0]), "peace did not clear war[seat 0, civ 0]"
    after = snap_all(sim)
    # equivalence: poke sueForPeace's exact effect, then step plain
    sim.restore(snap)
    sim.civ_treasury[:, 0] -= cost  # IN PLACE — treasury is a view of civ_treasury
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = False
    sim._reset_war_clock(0, 1, torch.ones(sim.B, dtype=torch.bool))
    sim._clear_war_kind(0, 1, torch.ones(sim.B, dtype=torch.bool))  # the ended war's kind clears
    sim._stamp_treaty(0, 1, torch.ones(sim.B, dtype=torch.bool))  # peace BINDS the pair
    sim.peace_turns[:, 0] = 0  # the treaty restarts BOTH parties' peace clocks
    sim.peace_turns[:, 1 + 0] = 0
    sim.step()
    d = drift(sim, after)
    assert not d, f"peace != poked sueForPeace + plain step: {d}"
    # broke → column closed
    sim.civ_treasury[:, 0] = 0.0
    sim.war[:, 0, 1 + 0] = sim.war[:, 1 + 0, 0] = True
    sim.war_turns[:, 0, 1] = need + 1
    sim.war_turns[:, 1, 0] = need + 1
    assert not bool(sim._seat_war_mask(0)[0, sue_col(sim, 0)]), "peace column open at 0 gold"
    print(f"  sue-for-peace OK (cost {cost:.0f} at warTurns {wt}, bit-equal transition)")


def test_capture_plunder(rules, path):
    """Capturing a civ city plunders +40 gold and, when it was the civ's LAST
    city, ends the war — the tail of TS `attackCity`. The raze path (seat 0's
    city slots full) gets neither: `transferCity` returns false and pays
    nothing."""
    sim = build(rules, path, steps=20)
    idx = sim.city_alive[0, 1:sim.n_majors].nonzero()
    assert len(idx), "no civ city by t20 on this seed"
    r = int(idx[0, 0])
    sim.war[0, 0, 1 + r] = sim.war[0, 1 + r, 0] = True
    caps = 0
    # capture civ r's cities one by one until eliminated (or seat 0 is full)
    while bool(sim.city_alive[0, r + 1].any()) and bool((~sim.city_alive[0, 0]).any()):
        jj = int(sim.city_alive[0, r + 1].nonzero()[0, 0])
        t0 = float(sim.civ_treasury[0, 0])
        sim._transfer_city(0, r + 1, jj, 0, conquest=True)
        caps += 1
        assert float(sim.civ_treasury[0, 0]) == t0 + 40.0, "capture must plunder +40 (TS combat.ts:354)"
        if bool(sim.city_alive[0, r + 1].any()):
            assert bool(sim.war[0, 0, 1 + r]), "war continues while the civ holds cities"
        else:
            assert not bool(sim.war[0, 0, 1 + r]), "last city captured -> the war must end"
    eliminated = not bool(sim.city_alive[0, r + 1].any())
    assert caps >= 1, "no captures exercised"
    assert eliminated, "seat-0 slots filled before elimination — last-city branch untested on this seed"
    # raze path: fake a full empire — every seat-0 city slot occupied
    idx2 = sim.city_alive[0, 1:sim.n_majors].nonzero()
    if len(idx2):
        r2, j2 = int(idx2[0, 0]), int(idx2[0, 1])
        sim.city_alive[0, 0, :] = True
        sim.war[0, 0, 1 + r2] = sim.war[0, 1 + r2, 0] = True
        t1 = float(sim.civ_treasury[0, 0])
        sim._transfer_city(0, r2 + 1, j2, 0, conquest=True)
        assert float(sim.civ_treasury[0, 0]) == t1, "raze must not plunder"
        assert bool(sim.war[0, 0, 1 + r2]), "raze must not end the war (TS early return)"
    print(f"  capture plunder OK ({caps} captures: +40 each, war ends on the last; raze: neither)")


def _plant_pools(sim, r: int, j: int) -> tuple[int, int, int]:
    """A walled civ city with a complete Encampment beside it and EVERY pool
    pre-set to a known value — the lab's own scene, so a ride-through can be
    told from a heal. Returns (centre tile, Encampment tile, walls max)."""
    assert sim._walls_bidx >= 0 and sim._encamp_didx >= 0, "walls/Encampment not exported"
    ctr = int(sim.city_center[0, r, j])
    sim.city_bldg[0, r, j, sim._walls_bidx] = True
    sim._bldg_version += 1
    wmax = int(sim._walls_max_at(torch.tensor([r]), torch.tensor([j]))[0])
    assert wmax > 0, "ANCIENT_WALLS supplies no perimeter"
    sim.city_hp[0, r, j] = 120        # the centre's garrison, wounded but standing
    sim.city_outer_hp[0, r, j] = 60   # ...behind a part-breached perimeter
    sim.city_pop[0, r, j] = 4
    dfc = sim.pair_dist[ctr].to(torch.long)
    owned = ((sim.city_slot_at(r)[0] == j) & (sim.district[0] < 0) & (dfc == 1)).nonzero(as_tuple=True)[0]
    assert len(owned), "no free owned ring-1 tile for the Encampment"
    enc = int(owned[0])
    sim.district[0, enc] = sim._encamp_didx
    sim.district_complete[0, enc] = True
    sim.district_pillaged[0, enc] = False
    sim.district_dead[0, enc] = False
    # a hand-built scene writes the city's REGISTRY as well as the tile plane,
    # exactly as every completion site does
    sim.city_dist_tile[0, r, j, sim._encamp_didx] = enc
    sim.encamp_hp[0, enc] = 40        # the district's OWN garrison, 40/100
    sim.encamp_outer_hp[0, enc] = 70  # ...and its own share of the perimeter
    return ctr, enc, wmax


def test_capture_pools(rules, path):
    """CIV6 (`DISTRICT_CITY_CENTER` CaptureRemovesCityDefenses="true"), measured
    on a live capture with the pools pre-set: the conquest DESTROYS the Walls,
    so the centre's outer pool and every Encampment's own read 0/0 — the outer
    MAXIMUM is the walls level each defending district shares. The Encampment's
    GARRISON rides through byte for byte, the centre's is reset to half its
    maximum, and a LOYALTY flip breaches nothing at all. `transferCity`'s twin."""
    sim = build(rules, path, steps=20)
    idx = sim.city_alive[0, 1:sim.n_majors].nonzero()
    assert len(idx), "no civ city by t20 on this seed"
    r, j = int(idx[0, 0]) + 1, int(idx[0, 1])
    max_cities = int(sim.rules.seats.get("maxCities", 6))
    assert int(sim.city_alive[0, 0].sum()) < max_cities, "seat 0 full — the capture would raze"
    ctr, enc, wmax = _plant_pools(sim, r, j)

    assert sim._transfer_city(0, r, j, 0, conquest=True), "the capture razed"
    col = int(sim.centre_slot_at[0, ctr])
    assert col >= 0 and bool(sim.city_alive[0, 0, col])
    # the WALLS are gone — the building, not just the pool behind it
    assert not bool(sim.city_bldg[0, 0, col, sim._walls_bidx]), "the capture must destroy the Walls"
    after = int(sim._walls_max_at(torch.tensor([0]), torch.tensor([col]))[0])
    assert after == 0, f"outer maximum {after} after the walls were lost, want 0"
    assert int(sim.city_outer_hp[0, 0, col]) == 0, "the centre's outer pool must read 0/0"
    assert min(int(sim.encamp_outer_hp[0, enc]), after) == 0, "the Encampment's outer pool must read 0/0"
    # the Encampment's GARRISON rides through byte for byte — neither zeroed
    # nor healed (measured 40/100 before, 40/100 after)
    assert int(sim.encamp_hp[0, enc]) == 40, "the Encampment garrison must ride through"
    half = (int(sim.rules.combat.get("cityMaxHp", 200)) + 1) // 2
    assert int(sim.city_hp[0, 0, col]) == half, "the centre comes up at half its maximum"
    assert int(sim.city_dist_tile[0, 0, col, sim._encamp_didx]) == enc, "the complete district rides"
    assert int(sim.city_pop[0, 0, col]) == 3, "-25% population, floored"

    # ...and a LOYALTY flip keeps every one of them
    sim2 = build(rules, path, steps=20)
    ctr2, enc2, _ = _plant_pools(sim2, r, j)
    assert sim2._transfer_city(0, r, j, 0, conquest=False), "the loyalty flip failed"
    col2 = int(sim2.centre_slot_at[0, ctr2])
    assert bool(sim2.city_bldg[0, 0, col2, sim2._walls_bidx]), "a loyalty flip destroys no Walls"
    assert int(sim2.city_outer_hp[0, 0, col2]) == 60, "the perimeter rides a loyalty flip"
    assert int(sim2.encamp_outer_hp[0, enc2]) == 70 and int(sim2.encamp_hp[0, enc2]) == 40
    assert int(sim2.city_hp[0, 0, col2]) == 120, "a loyalty flip wounds nobody"
    assert int(sim2.city_pop[0, 0, col2]) == 4, "a loyalty flip costs no population"
    print(f"  capture pools OK (walls destroyed: outer {wmax} -> 0/0 on centre and Encampment, "
          f"garrison 40/100 rides, centre {half}; loyalty flip keeps all four)")


def _melee_slot(sim):
    """First alive MELEE military slot in seat 0's pool."""
    for p_ in range(int(sim.unit_next.max())):
        if (
            bool(sim.major_unit_alive[0, p_])
            and int(sim.major_unit_seat[0, p_]) == 0  # the pool holds EVERY major's units
            and float(sim._type_combat[sim.major_unit_type[0, p_]]) > 0
            and float(sim._type_ranged_strength[sim.major_unit_type[0, p_]]) == 0
        ):
            return p_
    return None


def _place_next_to(sim, p_, ctr):
    """Teleport slot p_ to a free neighbor of ctr; return the attack action."""

    nb = sim.neigh[ctr]
    for d in range(6):
        t_ = int(nb[d])
        if t_ >= 0 and int(sim.military_at[0, t_]) < 0 and int(sim.centre_slot_at[0, t_]) < 0:
            old = int(sim.major_unit_tile[0, p_])
            sim.military_at[0, old] = -1
            sim.major_unit_tile[0, p_] = t_
            sim.military_at[0, t_] = p_
            sim.major_unit_hp[0, p_] = 100
            back = sim.neigh[t_]
            for d2 in range(6):
                if int(back[d2]) == ctr:
                    return 6 + d2
    return None


def test_cs_siege(rules, path):
    """A seat-0 MELEE attack into a city-state CENTER mirrors TS
    `attackCityState` — defCS = 15 + pop (+6 militaristic), CS-damage roll then
    the counter, attacker consumed, NO advance; `captureCityState` at 0 HP
    converts it into a seat-0 city (pop x0.75 min 1, half HP, the radius-2
    cityStateId territory transfers)."""
    sim = build(rules, path, steps=20)
    live = sim.citystate_alive[0].nonzero(as_tuple=True)[0]
    if len(live) < 1:
        print("  cs siege SKIPPED (no city-state on this seed)")
        return
    s = int(live[0])
    # A city-state is a separate seat you must DECLARE on, and the GPU enforces
    # that
    # that (the pair cell `war[b, row, cs_row]` is the whole fact, mirroring
    # TS's `cityStateTarget`). This poke
    # sieges, so it must be at war first; there is no declare VERB on the GPU,
    # so poke the plane directly.
    sim.war[0, 0, sim.row_of(100 + s)] = sim.war[0, sim.row_of(100 + s), 0] = True
    ctr = int(sim.citystate_center[0, s])
    p_ = _melee_slot(sim)
    if p_ is None:
        # the scripted autopilot trains no military here — spawn a melee unit
        mel = next(i for i in range(len(sim._type_combat)) if float(sim._type_combat[i]) > 0 and float(sim._type_ranged_strength[i]) == 0)
        nb = sim.neigh[ctr]
        spot = next(int(nb[d]) for d in range(6) if int(nb[d]) >= 0 and int(sim.military_at[0, int(nb[d])]) < 0 and int(sim.centre_slot_at[0, int(nb[d])]) < 0)
        sim._spawn_unit(0, torch.tensor([True]), torch.tensor([spot]), torch.tensor([mel]))
        p_ = int(sim.unit_next[0]) - 1
        assert bool(sim.major_unit_alive[0, p_]), "spawn failed"
    act = _place_next_to(sim, p_, ctr)
    assert act is not None, "no free tile adjacent to the CS center"
    # orders are RANKED over the seat's slot map, not raw pool slots
    sim.seat_ext[0, 0] = True
    smap = sim._seat_slot_map(0)[0]
    ua = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    ua[0, int((smap == p_).nonzero(as_tuple=True)[0][0])] = act
    # BUILD the premise the assertions below stand on, do not inherit it from
    # the stream: twenty decision-free turns leave this city-state wherever the
    # barbarians left it. Under the stylized disaster rates that happened to
    # be 150/150 with nobody near; under the install's MODERATE rates
    # the same twenty turns left it at 11/150 with three barbarians in reach,
    # and "one hit must not kill a full-hp CS" failed on a CS that was not
    # full. The capture half below already clears the barbarians for its own
    # reasons — the first hit needs the same ground.
    sim.citystate_hp[0, s] = int(rules.citystate["maxHp"])
    near0 = sim.pair_dist[ctr] <= 2
    for u in (sim.barb_unit_alive[0] & near0[sim.barb_unit_tile[0].clamp(min=0)]).nonzero(as_tuple=True)[0].tolist():
        t_ = int(sim.barb_unit_tile[0, u])
        sim.barb_unit_alive[0, u] = False
        if int(sim.barb_at[0, t_]) == u:
            sim.military_at[0, t_] = -1
    hp0, tile0 = int(sim.citystate_hp[0, s]), int(sim.major_unit_tile[0, p_])
    assert hp0 == int(rules.citystate["maxHp"]), f"the premise did not build: hp0={hp0}"
    sim._apply_seat_unit_actions(0, ua)
    sim.step()
    assert int(sim.citystate_hp[0, s]) < hp0, "CS took no siege damage"
    assert bool(sim.citystate_alive[0, s]), "one hit must not kill a full-hp CS"
    if bool(sim.major_unit_alive[0, p_]):
        assert int(sim.major_unit_tile[0, p_]) == tile0, "CS attack must not advance"
        assert int(sim.major_unit_hp[0, p_]) < 100 + 10, "attacker took no counter"  # +heal
    # capture: grind the hp to the brink, then one more hit
    sim.citystate_hp[0, s] = 1
    # A barbarian parked beside the CS would land the killing blow before this
    # order and the CS would die WITHOUT a capture. This poke probes the
    # capture path, so clear barbs within 2 tiles of the center first.
    near = sim.pair_dist[ctr] <= 2
    for u in (sim.barb_unit_alive[0] & near[sim.barb_unit_tile[0].clamp(min=0)]).nonzero(as_tuple=True)[0].tolist():
        t_ = int(sim.barb_unit_tile[0, u])
        sim.barb_unit_alive[0, u] = False
        if int(sim.barb_at[0, t_]) == u:
            sim.military_at[0, t_] = -1
    if not bool(sim.major_unit_alive[0, p_]):
        p_ = _melee_slot(sim)
        assert p_ is not None
    act = _place_next_to(sim, p_, ctr)
    assert act is not None
    smap = sim._seat_slot_map(0)[0]
    ua = torch.full((1, smap.shape[0]), -1, dtype=torch.long)
    ua[0, int((smap == p_).nonzero(as_tuple=True)[0][0])] = act
    pop_before = int(sim.citystate_pop[0, s])
    ncity0 = int(sim.city_alive[0, 0].sum())
    sim._apply_seat_unit_actions(0, ua)
    sim.step()
    assert not bool(sim.citystate_alive[0, s]), "CS at 1 hp must fall to the next hit"
    # >= not ==: an organic settler founding can land in the same step as the
    # capture (+2 total); the capture itself is pinned by the
    # center_at/owner/pop assertions below.
    assert int(sim.city_alive[0, 0].sum()) >= ncity0 + 1, "capture must found a seat-0 city"
    c_new = int(sim.centre_slot_at[0, ctr])
    assert c_new >= 0 and bool(sim.city_alive[0, 0, c_new]), "center must map to the new city"
    assert int(sim.city_slot_at(0)[0, ctr]) == c_new, "center tile must transfer"
    assert int(sim.citystate_at[0, ctr]) == -1, "cityStateId territory must clear"
    assert int(sim.city_pop[0, 0, c_new]) == max(1, (pop_before * 3) // 4), "pop x0.75 (min 1)"
    assert int(sim.city_hp[0, 0, c_new]) in (100, 120), "captured city starts at half HP (+20 same-turn heal allowed)"
    assert not bool(sim.envoy_mask()[0, s]), "dead CS must leave the envoy mask"
    print(f"  cs siege OK (hp {hp0} -> {int(sim.citystate_hp[0, s])} on hit; capture: pop {pop_before} -> {int(sim.city_pop[0, 0, c_new])}, city {c_new})")


def test_golden_war(rules, path):
    """CIV6 (Golden Age War): To Arms! + a Golden age + a ripened
    denouncement = a FORMAL war at a quarter of the warmonger price,
    remembered per pair for the captures; peace forgets it."""
    sim = build(rules, path, steps=20)
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    GOLDEN, FORMAL, SURPRISE = 8, 1, 0  # WAR_KINDS codes
    pct = sim._war_griev_pct[GOLDEN]
    assert pct == (25, 25, 300), f"the golden columns should be 25/25/300, got {pct}"
    sim.civ_age[0, 0] = 2
    sim.ded_picks[0, 0, 0] = sim._ded_to_arms
    sim.seat_denounced[:, 0, 1] = int(sim.turn) - sim._formal_war_min
    g0 = float(sim.civ_grievance[0, 1, 0])
    sim._declare_war_major(0, 1, one)
    assert bool(sim._war_formal(0, 1)), "the golden war is FORMAL"
    assert int(sim._war_kind_code(0, 1)[0]) == GOLDEN and int(sim._war_kind_code(1, 0)[0]) == GOLDEN, \
        "golden must stand in BOTH cells"
    assert int(sim.seat_warkind[0, 0, 1]) == GOLDEN + 1 and int(sim.seat_warkind[0, 1, 0]) == -(GOLDEN + 1), \
        "the declarer's cell is positive, the target's negative"
    want = int(sim._griev_war_base * pct[0] / 100 + 0.5)
    assert float(sim.civ_grievance[0, 1, 0]) - g0 == want, \
        f"the golden DoW should price {want}, moved {float(sim.civ_grievance[0, 1, 0]) - g0}"
    g1 = float(sim.civ_grievance[0, 1, 0])
    sim._grievance_city_taken(0, 0, 1, razed=False)
    want_t = int(sim._griev_city_taken * pct[1] / 100 + 0.5)
    assert float(sim.civ_grievance[0, 1, 0]) - g1 == want_t, "the capture prices at a quarter"
    g2 = float(sim.civ_grievance[0, 1, 0])
    sim._grievance_city_taken(0, 0, 1, razed=True)
    want_r = int(sim._griev_city_taken * pct[2] / 100 + 0.5)
    assert float(sim.civ_grievance[0, 1, 0]) - g2 == want_r, (
        "the razing prices by the golden raze column")
    sim._make_peace(0, 1, one)
    assert int(sim.seat_warkind[0, 0, 1]) == 0 and int(sim.seat_warkind[0, 1, 0]) == 0, \
        "peace must forget the kind"
    # CIV6 (Golden Age War row, DenouncementTurnsRequired 0): "Can be used
    # right after Denouncing" — a denouncement of ANY age opens it...
    sim.seat_denounced[:, 0, 1] = int(sim.turn)
    g2b = float(sim.civ_grievance[0, 1, 0])
    sim._declare_war_major(0, 1, one)
    assert int(sim._war_kind_code(0, 1)[0]) == GOLDEN and bool(sim._war_formal(0, 1)), (
        "a golden DoW right after the denouncement must be golden AND formal")
    assert float(sim.civ_grievance[0, 1, 0]) - g2b == want, "and price the golden column"
    sim._make_peace(0, 1, one)
    # ...and with NO denouncement at all the dedicant declares a Surprise war
    sim.seat_denounced[:, 0, 1] = -(10 ** 9)
    sim._declare_war_major(0, 1, one)
    assert int(sim._war_kind_code(0, 1)[0]) == SURPRISE, "no denouncement, no golden casus belli"
    sim._make_peace(0, 1, one)
    # WITHOUT the Golden age the same declaration is formal at full price
    sim.civ_age[0, 0] = 1
    sim.seat_denounced[:, 0, 1] = int(sim.turn) - sim._formal_war_min
    g3 = float(sim.civ_grievance[0, 1, 0])
    sim._declare_war_major(0, 1, one)
    assert int(sim._war_kind_code(0, 1)[0]) == FORMAL
    assert float(sim.civ_grievance[0, 1, 0]) - g3 == int(
        sim._griev_war_base * sim._war_griev_pct[FORMAL][0] / 100 + 0.5)
    print(f"  golden-age war OK (DoW {want}, capture {want_t}, raze {want_r}, peace forgets)")


def test_enkidu_war_discount(rules, path):
    """CIV6 (Adventures of Enkidu, `Discount` 150): a declaration on someone
    already at war with an ALLY of the declarer is forgiven 150 grievance —
    a Surprise war's whole 150, more than a Formal war's 100.

    The DECLARER's own trait, so an allied Gilgamesh lends it to nobody."""
    sim = build(rules, path)
    assert sim.n_majors >= 3, "the scene wants a declarer, a target and an ally"
    D = sim._enkidu_war_discount
    assert D == 150, f"the exported discount is {D}, expected the install's 150"
    one = torch.ones(sim.B, dtype=torch.bool, device=sim.device)
    kind = torch.zeros(sim.B, dtype=torch.long, device=sim.device)   # a Surprise war

    gl = sim._leader_idx("GILGAMESH")
    assert gl >= 0, "GILGAMESH is not in the exported leader list"

    def owed(gilgamesh_row, ally_at_war):
        s2 = build(rules, path)
        s2.row_leader[:, : s2.n_majors] = -1
        if gilgamesh_row >= 0:
            s2.row_leader[:, gilgamesh_row] = gl
        s2.seat_ally_turns[:, 0, 2] = 20
        s2.seat_ally_turns[:, 2, 0] = 20
        s2.war[:] = False
        if ally_at_war:
            s2.war[:, 2, 1] = True
            s2.war[:, 1, 2] = True
        s2.civ_grievance[:] = 0
        s2._grievance_war_declared(0, 1, one, kind)
        return int(s2.civ_grievance[0, 1, 0])

    full = owed(-1, True)                  # nobody plays Gilgamesh
    assert full > 0, "a plain Surprise declaration owed nothing"
    assert owed(0, False) == full, "the discount fired with the ally at PEACE"
    assert owed(2, True) == full, "an ALLIED Gilgamesh lent his own trait away"
    got = owed(0, True)
    assert got == 0, f"Gilgamesh still owed {got} of {full} (discount {D})"
    print(f"  Enkidu allied-war discount OK ({full} -> 0, discount {D})")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"war_test on {path.name}")
    test_inert_when_off(rules, path)
    test_declare(rules, path)
    test_golden_war(rules, path)
    test_peace(rules, path)
    test_capture_plunder(rules, path)
    test_capture_pools(rules, path)
    test_cs_siege(rules, path)
    test_enkidu_war_discount(rules, path)
    print("WAR/PEACE PLUMBING OK")


if __name__ == "__main__":
    main()
