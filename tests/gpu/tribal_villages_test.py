"""TRIBAL VILLAGES — the GPU half (C-47).

    npm run seed && npm run export        # (once) writes seeder/worlds/
    python tests/gpu/tribal_villages_test.py

The TS twin is tests/cpu/map/tribal-villages.test.ts.

The install's `GoodyHuts` + `GoodyHutSubTypes`: seven kinds at Weight 100 each
and 24 subtypes with their own weights, gates and payloads. The engine's older
six-arm reward was unsourced and is replaced rather than preserved.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

B0 = 0
ROW = 0


def build(path) -> BatchSim:
    return settle_all(BatchSim([load_fixture(path)], load_rules(),
                               device="cpu", dtype=torch.float64))


def _hut_with_unit(sim):
    """Put a village under a unit of ROW, and answer (tile, mask, seat)."""
    gs = int((sim.unit_seat[B0] == ROW).nonzero().flatten()[0])
    t = int(sim.unit_tile[B0, gs])
    sim.tile_goody[B0, t] = True
    mask = torch.zeros(sim.B, dtype=torch.bool)
    mask[B0] = True
    tile = torch.full((sim.B,), t, dtype=torch.long)
    seat = torch.full((sim.B,), ROW, dtype=torch.long)
    return tile, mask, seat


def test_the_wire(rules, path) -> None:
    sim = build(path)
    assert len(sim._goody_sub) == 24, f"the wire carries {len(sim._goody_sub)} subtypes, not 24"
    assert len(sim._goody_kinds) == 7, f"{len(sim._goody_kinds)} kinds, not 7"
    assert len(sim._goody_payload_kinds) == 15, "the payload channel space changed"

    def by(k):
        i = sim._goody_kinds.index(k)
        return [r[2] for r in sim._goody_sub if r[1] == i]

    for k, want in (("CULTURE", [15, 30, 55]), ("GOLD", [15, 30, 55]),
                    ("FAITH", [15, 30, 55]), ("SCIENCE", [15, 30, 55]),
                    ("DIPLOMACY", [15, 40, 45])):
        assert by(k) == want, f"{k} weights are {by(k)}, expected {want}"
    off = sorted(r[0] for r in sim._goody_sub if r[2] == 0)
    assert off == ["GRANT_SETTLER", "GRANT_UPGRADE"], f"off rows: {off}"
    print("  1 the wire OK — 24 subtypes, 7 kinds, and the two the install turns off")


def test_every_payload_channel_has_a_paying_arm(rules, path) -> None:
    """The disjoint-arms guard: a channel the wire names with no arm behind it
    pays NOTHING and no compiler can see it. Force each subtype to be the only
    drawable one and check its own plane actually moved."""
    watch = {
        "relic": lambda s: int(s.civ_relic_reserve[B0, ROW]),
        "gold": lambda s: int(s.civ_treasury[B0, ROW]),
        "faith": lambda s: int(s.civ_faith[B0, ROW]),
        "civicBoost": lambda s: int(s.civ_civic_boosted[B0, ROW].sum()),
        "techBoost": lambda s: int(s.civ_tech_boosted[B0, ROW].sum()),
        "tech": lambda s: int(s.civ_techs[B0, ROW].sum()),
        "unitByClass": lambda s: int((s.unit_seat[B0] == ROW).sum()),
        "unitInCity": lambda s: int((s.unit_seat[B0] == ROW).sum()),
        "experience": lambda s: int(s.unit_xp[B0].sum()),
        "heal": lambda s: int(s.unit_hp[B0].sum()),
        "population": lambda s: int(s.city_pop[B0, ROW].sum()),
        "governorTitle": lambda s: int(s.civ_granted_titles[B0, ROW]),
        "envoy": lambda s: int(s.civ_envoys_avail[B0, ROW]),
        "favor": lambda s: int(s.civ_diplo_favor[B0, ROW]),
        "strategic": lambda s: int(s.civ_stockpile[B0, ROW].sum()),
    }
    channels = list(load_rules().goody_huts["payloadKinds"])
    assert set(watch) == set(channels), "this lane does not watch every channel the wire names"
    paid = []
    for row in build(path)._goody_sub:
        name, _hut, _w, _turn, _moc, pay, amt, unit_i, pcls = row
        ch = channels[pay]
        if amt == 0 and ch not in ("unitByClass", "unitInCity"):
            continue                       # GRANT_UPGRADE: off in this ruleset
        sim = build(path)
        # hurt the unit so HEAL has room to land, and leave XP where it can rise
        gs = int((sim.unit_seat[B0] == ROW).nonzero().flatten()[0])
        sim.unit_hp[B0, gs] = 10
        tile, mask, seat = _hut_with_unit(sim)
        # this subtype is the ONLY drawable one, so the draw cannot miss it
        sim._goody_sub = [(name, 0, 100, 0, 0, pay, amt, unit_i, pcls)]
        sim.turn = 250
        before = watch[ch](sim)
        sim._claim_goody_hut(mask, tile, seat)
        after = watch[ch](sim)
        assert not bool(sim.tile_goody[B0, int(tile[B0])]), f"{name} left the village standing"
        assert after != before, f"{name} ({ch}) paid nothing: {ch} stayed at {before}"
        paid.append(name)
    assert len(paid) >= 21, f"only {len(paid)} subtypes paid"
    print(f"  2 the arms OK — all {len(paid)} live subtypes moved their own plane")


def test_the_gates_are_the_installs(rules, path) -> None:
    sim = build(path)
    assert len(sim._goody_sub) == 24
    sim.turn = 39
    early = [sim._goody_sub[i][0] for i in sim._goody_eligible(True)]
    assert "LARGE_GOLD" not in early, "LARGE_GOLD was drawable before its turn 40"
    sim.turn = 40
    elig = [sim._goody_sub[i][0] for i in sim._goody_eligible(True)]
    assert "LARGE_GOLD" in elig, "LARGE_GOLD was not drawable at turn 40"
    nocity = [sim._goody_sub[i][0] for i in sim._goody_eligible(False)]
    assert "LARGE_GOLD" not in nocity, "a city-less claimer drew a MinOneCity row"
    assert "GRANT_UPGRADE" not in elig, "a weight-0 row was drawable"
    print("  3 the gates OK — Turn and MinOneCity, and weight 0 stays off")


def test_a_barbarian_claims_nothing(rules, path) -> None:
    sim = build(path)
    tile, mask, _seat = _hut_with_unit(sim)
    barb = torch.full((sim.B,), sim.n_majors + 50, dtype=torch.long)
    sim._claim_goody_hut(mask, tile, barb)
    assert bool(sim.tile_goody[B0, int(tile[B0])]), "a barbarian claimed a village"
    print("  4 the barbarian OK — the village still stands")


def test_the_draw_moves_one_games_stream(rules, path) -> None:
    """Kind then subtype, and for the CLAIMING game alone — a batched draw
    would walk every other game's stream off TS's."""
    wide = settle_all(BatchSim([load_fixture(path), load_fixture(path)],
                               load_rules(), device="cpu", dtype=torch.float64))
    assert wide.B > 1, "this lane needs a batch wider than one to mean anything"
    wide.turn = 250
    one = torch.zeros(wide.B, dtype=torch.bool)
    one[B0] = True
    rng0 = wide.rng_state.clone()
    sub = wide._draw_goody_reward(one, B0, True)
    assert sub is not None, "nothing was drawable at turn 250 with a city"
    assert not bool(torch.equal(wide.rng_state, rng0)), "the draw did not move the stream"
    assert bool(torch.equal(wide.rng_state[1:], rng0[1:])), "another game's stream moved"
    print("  5 the draw OK — the stream moves for the claiming game alone")


def test_the_hut_is_its_own_live_plane(rules, path) -> None:
    """`camp_ok` must NOT bake the hut: a village is claimed mid-game, and a
    baked flag would stay stale for the rest of it (the C-52 class)."""
    sim = build(path)
    assert "tile_goody" in [n for n in dir(sim) if n == "tile_goody"], "no hut plane"
    t = int(sim.unit_tile[B0, 0])
    sim.tile_goody[B0, t] = True
    # camp_ok answers the TERRAIN alone now, so it does not move with the hut
    was = bool(sim.camp_ok[B0, t])
    sim.tile_goody[B0, t] = False
    assert bool(sim.camp_ok[B0, t]) == was, "camp_ok still tracks the hut"
    print("  6 the plane OK — the hut is live, and camp_ok answers terrain alone")


def main() -> int:
    rules = load_rules()
    path = fixture_paths()[0]
    test_the_wire(rules, path)
    test_every_payload_channel_has_a_paying_arm(rules, path)
    test_the_gates_are_the_installs(rules, path)
    test_a_barbarian_claims_nothing(rules, path)
    test_the_draw_moves_one_games_stream(rules, path)
    test_the_hut_is_its_own_live_plane(rules, path)
    print("BATTERY OK tribal_villages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
