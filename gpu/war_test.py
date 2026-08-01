"""V-W1 player war/peace plumbing self-test.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/war_test.py

The war head is GATED OFF in the shipped engine (_rl_war_active = False):
war_mask() is all-False and step(war=...) is ignored, so rollouts, gates and
checkpoints are untouched — test 1 proves that bit-exactly. Tests 2-3 flip
the flag on a throwaway sim and prove the applied action is EXACTLY the TS
state transition: step(war=a) must equal hand-poking the declareWar /
sueForPeace effect into the state and then stepping plain (bit-identical
across every _MUTABLE tensor), which sidesteps every same-turn world
confound (rival phase RNG, raids, income).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE

RICH = 10_000.0


def build(rules, path):
    return BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)


def snap_all(sim):
    return {k: getattr(sim, k).clone() for k in _MUTABLE}


def drift(sim, ref) -> list[str]:
    return [k for k in _MUTABLE if not torch.equal(getattr(sim, k), ref[k])]


def war_vec(sim, code) -> torch.Tensor:
    return torch.full((sim.B,), code, dtype=torch.long)


def test_inert_when_off(rules, path):
    """V-W1 ACTIVE (2026-07-08): the flag ships ON. The gate-safety
    property becomes: the SCRIPTED path (war=None) is bit-identical to a
    sim with the head forced off — the gates never pass war=, so parity
    is untouched by activation."""
    sim = build(rules, path)
    assert sim._rl_war_active, "V-W1 ships ACTIVE now"
    ref = build(rules, path)
    ref._rl_war_active = False
    for _ in range(30):
        sim.step()
        ref.step()
    d = drift(sim, snap_all(ref))
    assert not d, f"war=None path must not depend on the flag: {d}"
    # the live mask offers declarations at peace (rivals exist on this seed)
    if bool(sim.r_alive.any()):
        assert bool(sim.war_mask().any()), "live war_mask should offer choices with rivals alive"
    print("  activation OK (scripted path flag-independent; live mask non-degenerate)")


def test_declare(rules, path):
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
    sim._rl_war_active = True
    m = sim.war_mask()[0]
    assert bool(m[0]), "declare-war column should be open (rival 0 alive, at peace)"
    assert not bool(m[sim.R]), "peace column must be closed while not at war"
    snap = sim.snapshot()
    sim.step(war=war_vec(sim, 0))
    assert bool(sim.r_atwar[0, 0]), "declare did not set r_atwar"
    after = snap_all(sim)
    # equivalence: poke declareWar's exact effect, then step plain
    sim.restore(snap)
    sim.r_atwar[:, 0] = True
    sim.sync_war()  # #51/S4.3: pokes write the legacy stores
    # #51/S4.3: the poke must move the war MATRIX too — it is the
    # representation the engine reads now.
    sim.war[:, 0, 1 + (0)] = True
    sim.war[:, 1 + (0), 0] = True
    sim.r_warturns[:, 0] = 0
    sim.step()
    d = drift(sim, after)
    assert not d, f"declare != poked declareWar + plain step: {d}"
    print("  declare-war OK (bit-equal to the TS transition)")


def test_peace(rules, path):
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
    sim._rl_war_active = True
    sim.step(war=war_vec(sim, 0))  # declare on rival 0
    rr = sim.rules.rivals
    need = int(rr.get("peaceMinWarTurns", 8))
    for _ in range(need):
        sim.treasury[:] = 0.0  # isolate the warTurns gate (a rich-enough world opens the gold gate mid-wait)
        assert not bool(sim.war_mask()[0, sim.R]), "peace column open too soon"
        sim.step()
    assert bool(sim.r_atwar[0, 0]), "war ended prematurely (rival auto-peace?)"
    sim.treasury[:] = RICH
    m = sim.war_mask()[0]
    assert bool(m[sim.R]), "peace column should be open now (rich + warTurns >= min)"
    wt = int(sim.r_warturns[0, 0])
    cost = float(rr.get("peaceGold0", 150) + rr.get("peaceGoldSlope", 10) * wt)
    snap = sim.snapshot()
    sim.step(war=war_vec(sim, sim.R))  # sue for peace with rival 0
    assert not bool(sim.r_atwar[0, 0]), "peace did not clear r_atwar"
    after = snap_all(sim)
    # equivalence: poke sueForPeace's exact effect, then step plain
    sim.restore(snap)
    sim.treasury -= cost  # #51/S4.2: IN PLACE — treasury is a view of civ_treasury
    sim.r_atwar[:, 0] = False
    sim.sync_war()  # #51/S4.3: pokes write the legacy stores
    # #51/S4.3: the poke must move the war MATRIX too — it is the
    # representation the engine reads now.
    sim.war[:, 0, 1 + (0)] = False
    sim.war[:, 1 + (0), 0] = False
    sim.r_warturns[:, 0] = 0
    sim.r_peaceturns[:, 0] = 0
    sim.step()
    d = drift(sim, after)
    assert not d, f"peace != poked sueForPeace + plain step: {d}"
    # broke → column closed
    sim.treasury[:] = 0.0
    sim.r_atwar[:, 0] = True
    sim.sync_war()  # #51/S4.3: pokes write the legacy stores
    # #51/S4.3: the poke must move the war MATRIX too — it is the
    # representation the engine reads now.
    sim.war[:, 0, 1 + (0)] = True
    sim.war[:, 1 + (0), 0] = True
    sim.r_warturns[:, 0] = need + 1
    assert not bool(sim.war_mask()[0, sim.R]), "peace column open at 0 gold"
    print(f"  sue-for-peace OK (cost {cost:.0f} at warTurns {wt}, bit-equal transition)")


def test_capture_plunder(rules, path):
    """AUDIT C-11: capturing a rival city plunders +40 gold and, when it was
    the rival's LAST city, ends the war — TS captureRivalCity's exact tail.
    The raze path (player city slots full) gets neither: TS returns early."""
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
    idx = sim.rc_alive[0].nonzero()
    assert len(idx), "no rival city by t20 on this seed"
    r = int(idx[0, 0])
    sim.r_atwar[0, r] = True
    sim.sync_war()  # #51/S4.3: pokes write the legacy stores
    # #51/S4.3: the poke must move the war MATRIX too — it is the
    # representation the engine reads now.
    sim.war[0, 0, 1 + (r)] = True
    sim.war[0, 1 + (r), 0] = True
    caps = 0
    # capture rival r's cities one by one until eliminated (or player slots full)
    while bool(sim.rc_alive[0, r].any()) and bool((~sim.alive[0]).any()):
        jj = int(sim.rc_alive[0, r].nonzero()[0, 0])
        t0 = float(sim.treasury[0])
        sim._capture_rival_city(
            torch.tensor([0]), torch.tensor([r]), torch.tensor([jj]),
            torch.tensor([int(sim.rc_center[0, r, jj])]),
        )
        caps += 1
        assert float(sim.treasury[0]) == t0 + 40.0, "capture must plunder +40 (TS combat.ts:354)"
        if bool(sim.rc_alive[0, r].any()):
            assert bool(sim.r_atwar[0, r]), "war continues while the rival holds cities"
        else:
            assert not bool(sim.r_atwar[0, r]), "last city captured -> the war must end"
    eliminated = not bool(sim.rc_alive[0, r].any())
    assert caps >= 1, "no captures exercised"
    assert eliminated, "player slots filled before elimination — last-city branch untested on this seed"
    # raze path: fake a full empire — every player slot occupied
    idx2 = sim.rc_alive[0].nonzero()
    if len(idx2):
        r2, j2 = int(idx2[0, 0]), int(idx2[0, 1])
        sim.alive[0, :] = True
        sim.r_atwar[0, r2] = True
        sim.sync_war()  # #51/S4.3: pokes write the legacy stores
        # #51/S4.3: the poke must move the war MATRIX too — it is the
        # representation the engine reads now.
        sim.war[0, 0, 1 + (r2)] = True
        sim.war[0, 1 + (r2), 0] = True
        t1 = float(sim.treasury[0])
        sim._capture_rival_city(
            torch.tensor([0]), torch.tensor([r2]), torch.tensor([j2]),
            torch.tensor([int(sim.rc_center[0, r2, j2])]),
        )
        assert float(sim.treasury[0]) == t1, "raze must not plunder"
        assert bool(sim.r_atwar[0, r2]), "raze must not end the war (TS early return)"
    print(f"  capture plunder OK ({caps} captures: +40 each, war ends on the last; raze: neither)")


def _melee_slot(sim):
    """First alive MELEE military player slot."""
    for p_ in range(int(sim.p_next.max())):
        if (
            bool(sim.p_alive[0, p_])
            and float(sim._p_combat[sim.p_type[0, p_]]) > 0
            and float(sim._p_rng_str[sim.p_type[0, p_]]) == 0
        ):
            return p_
    return None


def _place_next_to(sim, p_, ctr):
    """Teleport slot p_ to a free neighbor of ctr; return the attack action."""
    import torch as _t

    nb = sim.neigh[ctr]
    for d in range(6):
        t_ = int(nb[d])
        if t_ >= 0 and int(sim.pmil_at[0, t_]) < 0 and int(sim.center_at[0, t_]) < 0:
            old = int(sim.p_tile[0, p_])
            sim.occ_mil[0, old] = -1
            sim.p_tile[0, p_] = t_
            sim.occ_mil[0, t_] = p_
            sim.p_hp[0, p_] = 100
            back = sim.neigh[t_]
            for d2 in range(6):
                if int(back[d2]) == ctr:
                    return 6 + d2
    return None


def test_cs_siege(rules, path):
    """V-CS: a player MELEE attack into a city-state CENTER mirrors TS
    attackCityState — defCS = 15 + pop (+6 militaristic), CS-damage roll then
    the counter, attacker consumed, NO advance; captureCityState at 0 HP
    converts it into a player city (pop x0.75 min 1, half HP, the radius-2
    csId territory transfers)."""
    sim = build(rules, path)
    for _ in range(20):
        sim.step()
    live = sim.cs_alive[0].nonzero(as_tuple=True)[0]
    if len(live) < 1:
        print("  cs siege SKIPPED (no city-state on this seed)")
        return
    s = int(live[0])
    # A-18/#45: a city-state is a separate player you must DECLARE on, and
    # since #51/S7.10a the GPU enforces that (`cs_here` carries `cs_atwar`,
    # mirroring TS's csTarget). This poke sieges, so it must first be at war —
    # before the gate it was staging an attack the rules forbid. There is no
    # declare VERB on the GPU yet (task #62), so poke the plane directly.
    sim.cs_atwar[0, s] = True
    ctr = int(sim.cs_center[0, s])
    p_ = _melee_slot(sim)
    if p_ is None:
        # the scripted autopilot trains no military here — spawn a melee unit
        mel = next(i for i in range(len(sim._p_combat)) if float(sim._p_combat[i]) > 0 and float(sim._p_rng_str[i]) == 0)
        nb = sim.neigh[ctr]
        spot = next(int(nb[d]) for d in range(6) if int(nb[d]) >= 0 and int(sim.pmil_at[0, int(nb[d])]) < 0 and int(sim.center_at[0, int(nb[d])]) < 0)
        sim._spawn_player(torch.tensor([True]), torch.tensor([spot]), torch.tensor([mel]))
        p_ = int(sim.p_next[0]) - 1
        assert bool(sim.p_alive[0, p_]), "spawn failed"
    act = _place_next_to(sim, p_, ctr)
    assert act is not None, "no free tile adjacent to the CS center"
    ua = torch.full((1, sim.p_alive.shape[1]), -1, dtype=torch.long)
    ua[0, p_] = act
    hp0, tile0 = int(sim.cs_hp[0, s]), int(sim.p_tile[0, p_])
    sim.step(units=ua)
    assert int(sim.cs_hp[0, s]) < hp0, "CS took no siege damage"
    assert bool(sim.cs_alive[0, s]), "one hit must not kill a full-hp CS"
    if bool(sim.p_alive[0, p_]):
        assert int(sim.p_tile[0, p_]) == tile0, "CS attack must not advance"
        assert int(sim.p_hp[0, p_]) < 100 + 10, "attacker took no counter"  # +heal
    # capture: grind the hp to the brink, then one more hit
    sim.cs_hp[0, s] = 1
    # #46r probe hardening: the live-adoption reshuffle can park a barbarian
    # beside the CS — it would land the killing blow before the player's
    # order and the CS dies WITHOUT a capture. This test probes the PLAYER
    # capture path, so clear barbs within 2 tiles of the center first.
    near = sim.pair_dist[ctr] <= 2
    for u in (sim.u_alive[0] & near[sim.u_tile[0].clamp(min=0)]).nonzero(as_tuple=True)[0].tolist():
        t_ = int(sim.u_tile[0, u])
        sim.u_alive[0, u] = False
        if int(sim.barb_at[0, t_]) == u:
            sim.occ_mil[0, t_] = -1
    if not bool(sim.p_alive[0, p_]):
        p_ = _melee_slot(sim)
        assert p_ is not None
    act = _place_next_to(sim, p_, ctr)
    assert act is not None
    ua = torch.full((1, sim.p_alive.shape[1]), -1, dtype=torch.long)
    ua[0, p_] = act
    pop_before = int(sim.cs_pop[0, s])
    ncity0 = int(sim.alive[0].sum())
    sim.step(units=ua)
    assert not bool(sim.cs_alive[0, s]), "CS at 1 hp must fall to the next hit"
    # #46r: >= not == — the live-adoption pacing can land an ORGANIC settler
    # founding in the same step as the capture (+2 total); the capture itself
    # is pinned by the center_at/owner/pop assertions below.
    assert int(sim.alive[0].sum()) >= ncity0 + 1, "capture must found a player city"
    c_new = int(sim.center_at[0, ctr])
    assert c_new >= 0 and bool(sim.alive[0, c_new]), "center must map to the new city"
    assert int(sim.owner[0, ctr]) == c_new, "center tile must transfer"
    assert int(sim.cs_at[0, ctr]) == -1, "csId territory must clear"
    assert int(sim.pop[0, c_new]) == max(1, (pop_before * 3) // 4), "pop x0.75 (min 1)"
    assert int(sim.city_hp[0, c_new]) in (100, 120), "captured city starts at half HP (+20 same-turn heal allowed)"
    assert not bool(sim.envoy_mask()[0, s]), "dead CS must leave the envoy mask"
    print(f"  cs siege OK (hp {hp0} -> {int(sim.cs_hp[0, s])} on hit; capture: pop {pop_before} -> {int(sim.pop[0, c_new])}, city {c_new})")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
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
