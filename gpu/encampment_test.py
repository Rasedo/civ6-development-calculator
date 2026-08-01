"""B-17 (ROUND B7) Encampment self-test.

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/encampment_test.py

Covers the three B-17 items on the GPU engine (the TS twin is
tests/encampment.test.ts; scripted parity is the primary correctness bar —
these pokes are gate-unreachable-surface coverage):

  1. Training-XP catalog: _b_train_xp exports 5/5/10/15 for
     BARRACKS/STABLE/ARMORY/MILITARY_ACADEMY and 0 for every other building.
  2. Training XP wiring: _spawn_player / _spawn_rival honour init_xp — a
     MILITARY unit inherits the city's best Encampment tier, a civilian stays
     at 0.
  3. The ADDITIONAL Encampment strike: a player city owning a COMPLETE
     unpillaged Encampment fires a once/turn ranged strike (k="pestk") at the
     nearest player-hostile unit; removing the Encampment (control) removes the
     strike. A city with BOTH walls and an Encampment rolls TWICE — walls first
     (k="pcstk"), then Encampment (k="pestk").

An AT-WAR rival unit is the strike target: rival units do NOT act in
_barbarian_phase, so the target is stationary and the strike is deterministic.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES

BUILDING_IDS = [b["id"] for b in json.loads((FIXTURES / "rules.json").read_text())["buildings"]]


def bidx_of(bid: str) -> int:
    return BUILDING_IDS.index(bid)


def test_catalog(sim) -> None:
    want = {"BARRACKS": 5, "STABLE": 5, "ARMORY": 10, "MILITARY_ACADEMY": 15}
    for bid, xp in want.items():
        got = int(sim._b_train_xp[bidx_of(bid)])
        assert got == xp, f"trainXp[{bid}] = {got}, want {xp}"
    # every OTHER building is 0
    for i, bid in enumerate(BUILDING_IDS):
        if bid not in want:
            assert int(sim._b_train_xp[i]) == 0, f"trainXp[{bid}] should be 0, got {int(sim._b_train_xp[i])}"
    print(f"  catalog OK: BARRACKS/STABLE 5, ARMORY 10, MILITARY_ACADEMY 15; {len(BUILDING_IDS)} rows, rest 0")


def test_training_xp_wiring(rules, path) -> None:
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    # a military unit type and the builder (civilian) type
    mil_ty = int(torch.tensor([c if not bool(sim._p_civ[i]) else -1 for i, c in enumerate(sim._p_combat.tolist())]).argmax())
    assert not bool(sim._p_civ[mil_ty]) and float(sim._p_combat[mil_ty]) > 0, "no military unit type found"
    bld_ty = sim._builder_idx
    assert bld_ty >= 0 and bool(sim._p_civ[bld_ty]), "builder type not civilian"
    ctr = sim.site[:, 0].clamp(min=0)
    init = torch.tensor([10], dtype=torch.long)  # pretend the city holds ARMORY (best tier 10)

    # MILITARY: inherits init_xp
    slot0 = int(sim.p_next[0])
    sim._spawn_player(torch.tensor([True]), ctr, torch.tensor([mil_ty]), init_xp=init)
    assert int(sim.p_next[0]) == slot0 + 1, "military unit did not spawn"
    assert int(sim.p_xp[0, slot0]) == 10, f"military trained XP = {int(sim.p_xp[0, slot0])}, want 10"

    # CIVILIAN: stays 0 even under init_xp
    slot1 = int(sim.p_next[0])
    sim._spawn_player(torch.tensor([True]), ctr, torch.tensor([bld_ty]), init_xp=init)
    assert int(sim.p_next[0]) == slot1 + 1, "builder did not spawn"
    assert int(sim.p_xp[0, slot1]) == 0, f"civilian trained XP = {int(sim.p_xp[0, slot1])}, want 0"

    # RIVAL mirror: _spawn_rival is military-only, honours init_xp
    vslot = int(sim.v_next[0])
    sim._spawn_rival(torch.tensor([True]), ctr, torch.tensor([mil_ty]), 0, init_xp=torch.tensor([15]))
    assert int(sim.v_next[0]) == vslot + 1, "rival unit did not spawn"
    assert int(sim.v_xp[0, vslot]) == 15, f"rival trained XP = {int(sim.v_xp[0, vslot])}, want 15"
    print("  training-XP wiring OK: military inherits tier XP (p=10, v=15), civilian stays 0")


def build_strike_scene(rules, path):
    """A player city (slot 0) owning a COMPLETE Encampment, one AT-WAR rival
    warrior adjacent, no barbs. Returns (sim, enc_tile, tgt_tile, vslot)."""
    sim = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
    assert sim.districts_on and sim._encamp_didx >= 0, "encampment district not exported"
    # advance a little so the player city has borders/tiles
    for _ in range(6):
        sim.step()
    ctr = int(sim.site[0, 0])
    assert ctr >= 0, "no player capital"
    # clear barbs so the rival unit is the unambiguous nearest hostile
    _pl = sim.occ_mil[0]  # #51: clear only this pool's entries
    _pl[(_pl >= sim.POOL_LO["u"]) & (_pl < sim.POOL_HI["u"])] = -1
    sim.u_alive[0, :] = False
    sim.n_camps[0] = sim.max_camps[0]
    # an OWNED non-center tile with no district -> plant a complete Encampment
    owned = ((sim.owner[0] == 0) & (sim.district[0] < 0)).nonzero(as_tuple=True)[0]
    assert len(owned) > 0, "no free owned tile to place the Encampment"
    enc_tile = int(owned[0])
    sim.district[0, enc_tile] = sim._encamp_didx
    sim.district_complete[0, enc_tile] = True
    # B-17 (#71): a completed Encampment musters its garrison, and the strike
    # now requires a LIVE one (an Encampment at 0 HP is occupied and fires
    # nothing). The engine writes this at every completion site; a hand-built
    # fixture has to write it too, exactly like district_complete.
    sim.encamp_hp[0, enc_tile] = sim._encamp_hp_max
    sim.district_pillaged[0, enc_tile] = False
    sim.district_dead[0, enc_tile] = False
    # a distance-1 empty tile for the target
    dfc = sim.pair_dist[ctr].to(torch.long)
    free = ((dfc == 1) & (sim.barb_at[0] < 0) & (sim.rv_at[0] < 0) & (sim.rvciv_at[0] < 0) & (sim.pmil_at[0] < 0) & (sim.pciv_at[0] < 0)).nonzero(as_tuple=True)[0]
    assert len(free) > 0, "no free adjacent tile for the target"
    tgt = int(free[0])
    vslot = int((~sim.v_alive[0]).nonzero(as_tuple=True)[0][0])
    # high-combat rival type -> small damage rolls -> survives two strikes
    strong_ty = int(sim._p_combat.argmax())
    sim.occ_mil[0, tgt] = vslot + sim.POOL_LO["v"]
    sim.v_alive[0, vslot] = True
    sim.v_hp[0, vslot] = 100
    sim.v_type[0, vslot] = strong_ty
    sim.v_civ[0, vslot] = 0
    sim.v_emb[0, vslot] = False
    sim.r_atwar[0, 0] = True
    sim.sync_war()  # #51/S4.3: pokes write the legacy stores
    return sim, enc_tile, tgt, vslot


def test_strike(rules, path) -> None:
    # --- encampment ON: pestk fires, target loses HP
    sim, enc_tile, tgt, vslot = build_strike_scene(rules, path)
    sim._log_combat_b = 0
    sim._combat_events = []
    hp0 = int(sim.v_hp[0, vslot])
    sim._barbarian_phase()
    ev_on = [e for e in sim._combat_events if "k:pestk" in e]
    assert len(ev_on) >= 1, f"Encampment strike did not fire (events: {sim._combat_events})"
    assert int(sim.v_hp[0, vslot]) < hp0, "target took no Encampment-strike damage"
    print(f"  strike ON OK: pestk fired, target hp {hp0} -> {int(sim.v_hp[0, vslot])}")

    # --- control: no Encampment -> no pestk, target untouched
    sim2, enc2, tgt2, v2 = build_strike_scene(rules, path)
    sim2.district_complete[0, enc2] = False  # incomplete Encampment: no strike
    sim2._log_combat_b = 0
    sim2._combat_events = []
    hp0b = int(sim2.v_hp[0, v2])
    sim2._barbarian_phase()
    assert not any("k:pestk" in e for e in sim2._combat_events), "incomplete Encampment still struck"
    assert int(sim2.v_hp[0, v2]) == hp0b, "control target lost HP with no complete Encampment"
    print("  strike CONTROL OK: incomplete Encampment fires nothing, target untouched")

    # --- walls + Encampment: rolls TWICE, walls (pcstk) BEFORE Encampment (pestk)
    sim3, enc3, tgt3, v3 = build_strike_scene(rules, path)
    assert sim3._walls_bidx >= 0, "ANCIENT_WALLS not exported"
    sim3.buildings[0, 0, sim3._walls_bidx] = True
    sim3.outer_hp[0, 0] = 0  # let the roll land on the unit, not the wall pool
    sim3._log_combat_b = 0
    sim3._combat_events = []
    sim3._barbarian_phase()
    ks = [e.split()[0] for e in sim3._combat_events if ("k:pcstk" in e or "k:pestk" in e)]
    assert "k:pcstk" in ks and "k:pestk" in ks, f"both strikes must fire, got {ks}"
    assert ks.index("k:pcstk") < ks.index("k:pestk"), f"walls must roll BEFORE Encampment, got {ks}"
    print(f"  double-roll OK: walls-first order {ks}")


def test_rival_encamp_prod_mult(rules, path) -> None:
    """#51/S7.4c: a rival's GOVERNMENT encampmentProdMult scales its queue head
    when that head is an Encampment item — `game.ts` has always done this for
    the player and neither engine ever did it for a rival.

    THIS POKE IS THE ONLY COVERAGE. Measured on the scripted export: ZERO rival
    encampment items in 12 seeds x 250 turns, and no shipped government carries
    a non-unit multiplier, so the gate cannot reach the channel at all
    ([[gate-reachability]]). Both inputs are poked directly."""
    def _prep():
        s = BatchSim([load_fixture(path)], rules, device="cpu", dtype=torch.float64)
        for _ in range(80):          # rivals need civics before they adopt a government
            s.step()
        return s
    sim = _prep()
    if not sim._gov_has_effects or sim._encamp_si < 0 or sim.R < 1:
        print("  rival encampmentProdMult SKIPPED (no gov effects / no Encampment scaffold)")
        return
    r = 0
    live = (sim.rc_alive[0, r]).nonzero(as_tuple=True)[0]
    if not len(live):
        print("  rival encampmentProdMult SKIPPED (no live rival city)")
        return
    j = int(live[0])
    _ad, _has = sim._adopted_gov(sim.r_civics[:, r])
    if not bool(_has[0]):
        print("  rival encampmentProdMult SKIPPED (rival has adopted no government)")
        return
    gi = int(_ad[0])
    enc_code = 1 + sim.NU + sim._encamp_si

    def _run(mult):
        s = _prep()
        s.rc_current[0, r, j] = enc_code
        s.rc_cost[0, r, j] = 1e9      # never completes, so progress stays readable
        s.rc_progress[0, r, j] = 0.0
        s.rc_prod_bank[0, r, j] = 0.0
        s._gov_encamp[:] = 1.0
        s._gov_encamp[gi] = mult
        s._eff_version += 1           # G1: the gov/policy mods cache keys on this
        s.step()
        return float(s.rc_progress[0, r, j])

    plain, doubled = _run(1.0), _run(2.0)
    assert plain > 0, "the rival city produced nothing — poke cannot measure the multiplier"
    assert abs(doubled - 2.0 * plain) < 1e-6, f"x2 encampmentProdMult: got {doubled}, plain {plain}"
    print(f"  rival encampmentProdMult OK (x2 on the Encampment head: {plain} -> {doubled})")


def main() -> None:
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim0 = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    print(f"encampment_test on {paths[0].name}:")
    test_catalog(sim0)
    test_training_xp_wiring(rules, paths[0])
    test_strike(rules, paths[0])
    test_rival_encamp_prod_mult(rules, paths[0])
    print("ENCAMPMENT OK")


if __name__ == "__main__":
    main()
