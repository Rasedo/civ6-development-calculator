"""A CITYLESS SEAT'S GOVERNOR PHASE DOES NOT RUN (A-8r) — the GPU half.

    python tests/gpu/governor_cityless_test.py

TS's seatPhase `continue`s a seat with no city before it reaches
governorPhase, so a seat that has just lost its last city keeps its governor
SEATED in the dead city — the roster is left exactly as it stood. The GPU's
phase gated on `civ_alive`, which a cityless seat still satisfies, and its
tick took no mask at all: alone, the seat turn's batch-wide `active.any()`
early return hid it; with a second game in the batch that return stayed open,
the phase ran on the cityless seat, and the tick cleared the governor where
TS left him (seed 9248 t170, red at B >= 2 only).

Both the phase and the tick now take the seat's `active` — the TS predicate —
and this lane builds the two-game shape that exposed it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

ROW = 0
G = 0


def build() -> BatchSim:
    """Two games. In BOTH the row's governor G is appointed and seated in the
    row's first city; then game 0 loses that city, game 1 keeps it but the
    governor's city record is pointed at a city that no longer exists."""
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0]), load_fixture(fixture_paths()[1])],
                              load_rules(), device="cpu", dtype=torch.float64))
    assert sim.n_governors > 0, "no governors on this catalog"
    for b in (0, 1):
        assert bool(sim.city_alive[b, ROW, 0]), "the row has no first city"
        sim.civ_gov_appointed[b, ROW, G] = True
        sim.civ_gov_city[b, ROW, G] = int(sim.city_id[b, ROW, 0])
        sim.civ_gov_out[b, ROW, G] = 0
        sim.civ_gov_minor[b, ROW, G] = -1
    # game 0: the seat loses its ONLY city
    sim.city_alive[0, ROW, :] = False
    # game 1: the seat keeps a city, but governor G's city id names a dead one
    sim.civ_gov_city[1, ROW, G] = 10 ** 6
    sim._eff_version += 1
    return sim


def active_of(sim: BatchSim) -> torch.Tensor:
    return sim.civ_alive[:, ROW] & sim.city_alive[:, ROW].any(dim=1)


def test_the_scene(sim) -> None:
    act = active_of(sim)
    assert not bool(act[0]) and bool(act[1]), f"the scene must be one cityless seat and one live: active={act.tolist()}"
    print("  1 the scene OK — game 0 cityless, game 1 live, both governors seated")


def test_cityless_seat_keeps_its_governor(sim) -> None:
    before = int(sim.civ_gov_city[0, ROW, G])
    sim._governor_phase(ROW, active_of(sim))
    after = int(sim.civ_gov_city[0, ROW, G])
    assert after == before, (
        f"the cityless seat's governor moved from {before} to {after}: TS's continue skips "
        "governorPhase for a seat with no city and leaves him seated")
    print(f"  2 the cityless seat OK — governor stays seated in city {before}, as on TS")


def test_live_seat_still_clears_a_gone_city(sim) -> None:
    after = int(sim.civ_gov_city[1, ROW, G])
    assert after != 10 ** 6, "the live seat's governor kept a city that does not exist"
    print(f"  3 the live seat OK — the tick still clears a governor whose city is gone (now {after})")


def test_the_mask_is_the_ts_predicate(sim) -> None:
    import inspect
    src = inspect.getsource(type(sim)._governor_phase)
    assert "live = active" in src, "the phase does not gate on the seat's active flag"
    tick = inspect.getsource(type(sim)._governor_tick)
    assert "& live" in tick, "the tick is not masked by the seat's active flag"
    print("  4 the gate OK — phase and tick both read the seat's `active`, never civ_alive")


def main() -> int:
    sim = build()
    test_the_scene(sim)
    test_cityless_seat_keeps_its_governor(sim)
    test_live_seat_still_clears_a_gone_city(sim)
    test_the_mask_is_the_ts_predicate(sim)
    print("BATTERY OK governor_cityless")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
