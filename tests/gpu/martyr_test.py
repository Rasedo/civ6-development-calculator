"""Only an apostle HOLDING the Martyr promotion leaves a relic.

    python tests/gpu/martyr_test.py

CIV 6 creates a relic when the Apostle killed in theological combat carried the
MARTYR promotion — one of the nine it chose from at purchase. The death itself
draws nothing, so this lane pins both halves: the relic follows the BIT, and the
RNG stream is untouched by a fight's outcome.
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


def martyr_col(sim) -> int:
    """the column of the apostle list whose effect IS the martyr rule."""
    rd = sim.rules_dev
    cls = int(rd.u_promo_class[sim._apostle_idx])
    assert cls >= 0, "the APOSTLE chassis promotes from no class"
    hit = (rd.promo_kind[cls] == sim._pk["MARTYR"]).any(dim=1)
    assert bool(hit.any()), "no MARTYR row in the apostle list"
    return int(hit.long().argmax())


def place_apostle(sim, slot, tile, seat, hp, promos=0):
    sim.major_unit_alive[0, slot] = True
    sim.major_unit_seat[0, slot] = seat
    sim.major_unit_type[0, slot] = sim._apostle_idx
    sim.major_unit_tile[0, slot] = tile
    sim.major_unit_hp[0, slot] = hp
    sim.major_unit_promos[0, slot] = promos
    sim.civilian_at[0, tile] = slot + sim.POOL_LO["major"]


def main() -> None:
    sim = build()
    assert sim._apostle_idx >= 0, "no APOSTLE in the roster"
    assert sim.n_majors >= 2, "the fight needs two religions"
    mcol = martyr_col(sim)

    ta, tb = free_pair(sim)
    sa, sb = int(sim.unit_next[0]), int(sim.unit_next[0]) + 1
    sim.unit_next[0] += 2

    grants: list[int] = []
    real_grant = sim._grant_relic
    sim._grant_relic = lambda rows, seat: grants.append(int(rows.numel()))

    # Both sides at 20 HP and equal religious strength: an even fight rolls
    # 24-36, so every pass offers TWO deaths — and only the bit decides.
    for promos_a, promos_b, want in (
        (0, 0, 0),
        (1 << mcol, 0, 1),
        (0, 1 << mcol, 1),
        (1 << mcol, 1 << mcol, 2),
    ):
        grants.clear()
        place_apostle(sim, sa, ta, 0, 20, promos_a)
        place_apostle(sim, sb, tb, 1, 20, promos_b)
        sim._theological_combat_phase()
        assert not bool(sim.major_unit_alive[0, sa]) and not bool(sim.major_unit_alive[0, sb]), \
            "the even fight did not kill both sides"
        got = sum(grants)
        assert got == want, f"promos {promos_a}/{promos_b} granted {got} relics, expected {want}"
    print("  the relic follows the MARTYR bit, on either side of the duel")

    # No draw at the death: the two damage rolls are the whole stream cost, so
    # a martyr and a non-martyr advance it by exactly the same amount.
    sim._grant_relic = real_grant

    def stream_cost(promos: int) -> int:
        place_apostle(sim, sa, ta, 0, 20, promos)
        place_apostle(sim, sb, tb, 1, 20, promos)
        before = int(sim.rng_state[0])
        sim._theological_combat_phase()
        return (int(sim.rng_state[0]) - before) & 0xFFFFFFFF

    plain, martyr = stream_cost(0), stream_cost(1 << mcol)
    assert plain == martyr, f"a martyr's death cost {martyr} of stream, a plain one {plain}"
    print("  a death draws nothing — the promotion is not a roll")

    print("MARTYR OK — the relic rides the promotion, and the stream never asks")


if __name__ == "__main__":
    main()
