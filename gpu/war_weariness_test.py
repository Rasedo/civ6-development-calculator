"""B-15 war-weariness self-test.

The scripted rollout only exercises a single monotonic war (rivals declare on
the passive player and rarely make peace), so the ACCRUAL→PENALTY boundary and
the 4× peace DECAY are poked directly: force a rival to war, step across the
first −1-amenity threshold, then force peace and watch the accumulator drain 4×
faster. Also asserts the accumulator round-trips snapshot/restore.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def main() -> None:
    rules = load_rules()
    ww = rules.war_weariness
    per_turn = int(ww["perTurn"])
    decay = int(ww["decay"])
    per_amen = int(ww["perAmenity"])
    cap = int(ww["cap"])
    assert per_turn > 0 and decay > 0 and per_amen > 0 and cap > 0, "war-weariness constants must be positive"
    # decay is 4× accrual per the brief.
    assert decay == 4 * per_turn, f"decay ({decay}) must be 4× per-turn ({per_turn})"

    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    sim = BatchSim([load_fixture(paths[0])], rules, device="cpu", dtype=torch.float64)
    if sim.R == 0:
        print("WAR-WEARINESS OK (no rivals in fixture — nothing to poke)")
        return

    # Warm the world a little so cities exist, then clear any organic war so we
    # control the war state deterministically.
    for _ in range(8):
        sim.step()
    sim.r_atwar[:] = False
    sim.war_weariness[:] = 0
    sim.r_war_weariness[:] = 0

    # --- accrual: force rival 0 to war, step, watch the accumulator climb ------
    sim.r_atwar[:, 0] = True
    base_p = int(sim.war_weariness[0])
    base_r = int(sim.r_war_weariness[0, 0])
    # Step across the first amenity threshold (PER_AMENITY war turns).
    penalties_seen = []
    for k in range(1, per_amen + 2):
        sim.r_atwar[:, 0] = True  # keep the war live each turn
        sim.step()
        pw = int(sim.war_weariness[0])
        pen = pw // per_amen
        penalties_seen.append(pen)
        assert pw <= cap, f"player weariness {pw} exceeded cap {cap}"
    # After PER_AMENITY war-turns the penalty must have reached at least 1.
    assert max(penalties_seen) >= 1, f"penalty never reached 1 in {per_amen + 1} war-turns: {penalties_seen}"
    # The accumulator must be strictly increasing under sustained war (until cap).
    assert int(sim.war_weariness[0]) > base_p, "player weariness did not accrue under war"
    assert int(sim.r_war_weariness[0, 0]) > base_r, "rival weariness did not accrue under war"

    # --- cap: sustained war saturates at the ceiling ---------------------------
    for _ in range(cap + 5):
        sim.r_atwar[:, 0] = True
        sim.step()
    assert int(sim.war_weariness[0]) == cap, f"player weariness must saturate at cap {cap}, got {int(sim.war_weariness[0])}"
    assert int(sim.r_war_weariness[0, 0]) == cap, "rival weariness must saturate at cap"

    # --- decay: make peace, watch it drain 4× per turn -------------------------
    # Force peace at the TOP of every step (the player/rival accrual reads the
    # war state before this phase's organic re-declaration), so the accumulators
    # can only fall — otherwise an organic war restart would resume accrual.
    sim.r_atwar[:] = False
    before = int(sim.war_weariness[0])
    sim.step()
    after = int(sim.war_weariness[0])
    assert after == max(0, before - decay), f"peace decay must shed {decay}/turn: {before} -> {after}"

    # --- floor: decay never goes negative --------------------------------------
    for _ in range(cap):
        sim.r_atwar[:] = False  # hold peace so accrual can't restart organically
        sim.step()
    assert int(sim.war_weariness[0]) == 0, "player weariness must floor at 0"

    # --- snapshot/restore round-trips the accumulators -------------------------
    sim.war_weariness[0] = 9
    sim.r_war_weariness[0, 0] = 5
    snap = sim.snapshot()
    sim.war_weariness[0] = 0
    sim.r_war_weariness[0, 0] = 0
    sim.restore(snap)
    assert int(sim.war_weariness[0]) == 9, "war_weariness not in snapshot"
    assert int(sim.r_war_weariness[0, 0]) == 5, "r_war_weariness not in snapshot"

    print("WAR-WEARINESS OK")


if __name__ == "__main__":
    main()
