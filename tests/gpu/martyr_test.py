"""Only a MARTYR apostle leaves a relic.

    python tests/gpu/martyr_test.py

CIV 6 creates a relic when the Apostle killed in theological combat carried the
MARTYR promotion — one of nine. Nothing here CHOOSES a promotion (no wire
record), so the engines draw for it at the death, which is where TS's own
`martyrs()` draw sits. This lane pins the RATE: every fallen apostle used to
martyr, and the whole relic economy (faith, tourism, the culture victory) rides
on it.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build():
    rules = load_rules()
    sim = settle_all(BatchSim([load_fixture(p) for p in fixture_paths()[:1]],
                              rules, device="cpu", dtype=torch.float64))
    for _ in range(12):
        sim.step()
    return sim


def free_pair(sim):
    """Two adjacent passable tiles holding nothing."""
    for t in range(sim.T):
        if not bool(sim.passable[0, t]) or int(sim.military_at[0, t]) >= 0 or int(sim.civilian_at[0, t]) >= 0:
            continue
        for n in sim.neigh[t].tolist():
            if n < 0 or not bool(sim.passable[0, n]):
                continue
            if int(sim.military_at[0, n]) >= 0 or int(sim.civilian_at[0, n]) >= 0:
                continue
            return t, n
    raise AssertionError("no free adjacent land pair")


def place_apostle(sim, slot, tile, seat, hp):
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = sim._apostle_idx
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.civilian_at[0, tile] = slot + sim.POOL_LO["major"]


def main() -> None:
    sim = build()
    assert sim._apostle_idx >= 0, "no APOSTLE in the roster"
    assert sim.n_majors >= 2, "the fight needs two religions"
    chance = float(sim.rules.beliefs["martyrChance"])
    assert abs(chance - 1.0 / 9.0) < 1e-12, f"martyrChance is {chance}, expected one promotion in nine"

    ta, tb = free_pair(sim)
    sa, sb = int(sim.unit_next[0]), int(sim.unit_next[0]) + 1
    sim.unit_next[0] += 2

    grants: list[int] = []
    real_grant = sim._grant_relic
    sim._grant_relic = lambda rows, seat: grants.append(int(rows.numel()))

    passes = 300
    for _ in range(passes):
        # Both sides at 20 HP and equal religious strength: an even fight rolls
        # 24-36, so every pass offers TWO deaths to the draw.
        place_apostle(sim, sa, ta, 0, 20)
        place_apostle(sim, sb, tb, 1, 20)
        sim._theological_combat_phase()

    sim._grant_relic = real_grant
    deaths = 2 * passes
    got = sum(grants)
    rate = got / deaths
    assert 0 < got < deaths, f"{got} relics from {deaths} deaths — the draw is not gating anything"
    assert 0.05 < rate < 0.20, f"martyr rate {rate:.3f} is nowhere near one promotion in nine"
    print(f"  {got} relics from {deaths} apostle deaths — rate {rate:.3f} (expected {chance:.3f})")

    # The draw must move the stream ONLY where an apostle actually fell, which
    # is what keeps it in step with TS's short-circuited `martyrs()`.
    before = sim.rng_state.clone()
    _z = torch.zeros(0, dtype=torch.long)
    sim._martyr_draw(_z, _z)
    assert torch.equal(sim.rng_state, before), "an empty death set still advanced the RNG"
    sim._martyr_draw(torch.tensor([0], dtype=torch.long), torch.zeros(1, dtype=torch.long))
    assert int(sim.rng_state[0]) != int(before[0]), "a death did not advance the RNG"
    if sim.B > 1:
        assert torch.equal(sim.rng_state[1:], before[1:]), "one game's draw moved another game's stream"
    print("  the stream advances in exactly the games that lost an apostle")

    print("MARTYR OK — one relic in nine deaths, drawn where TS draws it")


if __name__ == "__main__":
    main()
