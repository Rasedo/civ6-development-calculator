"""A NARROWED XP AWARD MUST READ ITS OWN GAME (A-5r).

    python tests/gpu/narrow_batch_xp_test.py

`_award_pair_xp`'s defender arm narrows every tensor to `rows` — the games
where a defender actually survived. `_battle_gain` then multiplied by
`_recon_xp_mult(seat)` / `_suz_xp_mult(seat)`, both of which end in
`tab.gather(1, seat.unsqueeze(1))` over a [B, seats] table. With a narrowed
seat that gather reads BATCH ROWS 0..n-1 — the wrong games — so every
defender in the batch was paid game 0's Survey and Kabul multipliers.

It could not show at B=1, where the wrong game IS the right game, and the
battery's fixed 8-shard layout never put the two seeds that expose it in one
batch. A memory-sized shard (#230) did, at seed 9222 turn 28: GPU 8 vs TS 6,
a doubled award hitting the cap of 8.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all

SEAT = 2


def build() -> BatchSim:
    """Two games, so a per-game read has something to get wrong."""
    return settle_all(BatchSim([load_fixture(fixture_paths()[0]),
                                load_fixture(fixture_paths()[1])],
                               load_rules(), device="cpu", dtype=torch.float64))


def force_rxp(sim: BatchSim, per_game: list[float]) -> None:
    """Pin the recon-XP channel per game, through the cache the real path
    reads. Game 0 doubled and game 1 not is the whole point: if the two were
    equal the lane would pass without testing anything."""
    tab = torch.ones(sim.B, sim.n_majors, dtype=sim.dtype)
    for b, v in enumerate(per_game):
        tab[b, SEAT] = v
    sim._fx_row_cache = (sim._eff_version, {"rxp": tab})


def args_for(sim: BatchSim, n: int):
    """One recon chassis, one foe, the shapes `_battle_gain` wants."""
    recon = int((sim._type_recon > 0).nonzero().flatten()[0])
    return dict(
        own_type=torch.full((n,), recon, dtype=torch.long),
        foe_type=torch.full((n,), recon, dtype=torch.long),
        own_seat=torch.full((n,), SEAT, dtype=torch.long),
        own_level=torch.ones(n, dtype=torch.long),
        own_pct=torch.zeros(n, dtype=torch.long),
    )


def test_the_carrier_is_per_game(sim) -> None:
    force_rxp(sim, [2.0, 1.0])
    a = args_for(sim, sim.B)
    full = sim._battle_gain(**a, ranged=False, initiated=False,
                            foe_died=torch.ones(sim.B, dtype=torch.bool),
                            foe_is_barb=torch.zeros(sim.B, dtype=torch.bool))
    assert int(full[0]) != int(full[1]), (
        f"the two games scored the same ({full.tolist()}) — the scene does not "
        "separate a carrier from a non-carrier, so nothing below can fail")
    print(f"  1 the scene OK — game 0 {int(full[0])} vs game 1 {int(full[1])} whole-batch")
    return full


def test_a_narrowed_award_reads_its_own_game(sim, full) -> None:
    """The bug, exactly: ask for game 1 alone and get game 0's answer."""
    for b in (0, 1):
        rows = torch.tensor([b], dtype=torch.long)
        a = args_for(sim, 1)
        got = sim._battle_gain(**a, ranged=False, initiated=False,
                               foe_died=torch.ones(1, dtype=torch.bool),
                               foe_is_barb=torch.zeros(1, dtype=torch.bool),
                               rows=rows)
        assert int(got[0]) == int(full[b]), (
            f"narrowed to game {b} the award is {int(got[0])}, whole-batch says "
            f"{int(full[b])} — the gather read another game")
    print("  2 the narrowing OK — each game keeps its own multiplier")


def test_both_games_at_once_when_narrowed(sim, full) -> None:
    rows = torch.tensor([1, 0], dtype=torch.long)   # deliberately out of order
    a = args_for(sim, 2)
    got = sim._battle_gain(**a, ranged=False, initiated=False,
                           foe_died=torch.ones(2, dtype=torch.bool),
                           foe_is_barb=torch.zeros(2, dtype=torch.bool),
                           rows=rows)
    assert [int(x) for x in got] == [int(full[1]), int(full[0])], (
        f"a reordered `rows` gave {got.tolist()}, expected "
        f"{[int(full[1]), int(full[0])]} — the narrowing follows position, not game")
    print("  3 the order OK — `rows` names games, not positions")


def test_a_narrowed_seat_without_rows_is_refused(sim) -> None:
    """The guard that makes the next one of these loud instead of silent."""
    a = args_for(sim, 1)
    try:
        sim._battle_gain(**a, ranged=False, initiated=False,
                         foe_died=torch.ones(1, dtype=torch.bool),
                         foe_is_barb=torch.zeros(1, dtype=torch.bool))
    except AssertionError as e:
        assert "rows" in str(e), f"the guard fired with an unhelpful message: {e}"
        print("  4 the guard OK — a narrowed seat with no `rows` is refused, not guessed")
        return
    raise AssertionError("a narrowed seat with no `rows` was accepted silently")


def test_the_kabul_half_is_threaded_too(sim) -> None:
    """`_suz_xp_mult` rides the same gather and only the INITIATOR asks for
    it, so it is the arm a defender-only fix would leave behind."""
    import inspect
    src = inspect.signature(sim._suz_xp_mult)
    assert "rows" in src.parameters, "_suz_xp_mult takes no `rows`"
    src2 = inspect.getsource(type(sim)._battle_gain)
    assert "_suz_xp_mult(own_seat, rows)" in src2, \
        "the initiator's Kabul multiplier is not given `rows`"
    print("  5 the sibling OK — Kabul's half is threaded with Survey's")


def main() -> int:
    sim = build()
    full = test_the_carrier_is_per_game(sim)
    test_a_narrowed_award_reads_its_own_game(sim, full)
    test_both_games_at_once_when_narrowed(sim, full)
    test_a_narrowed_seat_without_rows_is_refused(sim)
    test_the_kabul_half_is_threaded_too(sim)
    print("BATTERY OK narrow_batch_xp")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
