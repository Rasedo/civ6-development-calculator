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
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.engine import _MUTABLE
from warmup import settle_all

RICH = 10_000.0


def build(rules, path):
    return settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64))


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
    sim = build(rules, path)
    assert sim._rl_war_active, "the war head ships ACTIVE"
    ref = build(rules, path)
    ref._rl_war_active = False
    for _ in range(30):
        sim.step()
        ref.step()
    d = drift(sim, snap_all(ref))
    assert not d, f"war=None path must not depend on the flag: {d}"
    # the live mask offers declarations at peace (civs exist on this seed)
    if bool(sim.civ_alive[:, 1:].any()):
        assert bool(sim._seat_war_mask(0).any()), "a live war head should offer choices with civs alive"
    print("  activation OK (scripted path flag-independent; live mask non-degenerate)")


def test_declare(rules, path):
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
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
    sim._grievance_war_declared(0, 1, torch.ones(sim.B, dtype=torch.bool, device=sim.device),
                                sim._denounce_casus_belli(0, 1))  # declareWar's ledger stamp
    sim.step()
    d = drift(sim, after)
    assert not d, f"declare != poked declareWar + plain step: {d}"
    print("  declare-war OK (bit-equal to the TS transition)")


def test_peace(rules, path):
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
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
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
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
    import torch as _t

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
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
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
    hp0, tile0 = int(sim.citystate_hp[0, s]), int(sim.major_unit_tile[0, p_])
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


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"war_test on {path.name}")
    test_inert_when_off(rules, path)
    test_declare(rules, path)
    test_peace(rules, path)
    test_capture_plunder(rules, path)
    test_cs_siege(rules, path)
    print("WAR/PEACE PLUMBING OK")


if __name__ == "__main__":
    main()
