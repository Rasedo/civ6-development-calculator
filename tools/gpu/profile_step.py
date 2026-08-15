
from __future__ import annotations

import argparse
import cProfile
import io
import os
import pstats
import sys
import time
from pathlib import Path

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")

import torch

torch.set_num_threads(4)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths, FIXTURES
from core.rng import masked_choice

HEAD_PROD, HEAD_TECH, HEAD_CIVIC, HEAD_UNIT, HEAD_ENVOY = 101, 202, 303, 404, 505
HOLD = 12


def _parity_loop(sim: BatchSim, turns: int) -> None:
    for _ in range(turns):
        sim.step()


def _rollout_loop(sim: BatchSim, turns: int, seed: int) -> None:
    B, C = sim.B, sim.RC
    game_seed = torch.tensor([seed * 1_000_003 + i for i in range(B)], dtype=torch.int64)
    slots = torch.arange(C, dtype=torch.int64).view(1, C)
    # The unit head is as wide as `_seat_slot_map` compacts to, which the mask
    # itself reports — a pool constant here would rot the moment it moved.
    pslots = torch.arange(sim._seat_unit_mask(0).shape[1], dtype=torch.int64).view(1, -1)
    for _ in range(turns):
        turn = sim.turn
        pa = masked_choice(sim.production_mask(), game_seed.view(B, 1), slots, turn, HEAD_PROD)
        ta = masked_choice(sim.tech_mask(), game_seed, turn, HEAD_TECH)
        ca = masked_choice(sim.civic_mask(), game_seed, turn, HEAD_CIVIC)
        um = sim._seat_unit_mask(0)
        na = um.shape[2]
        has_attack = um[:, :, 6:12].any(dim=2, keepdim=True)
        um = um & ~(has_attack & (torch.arange(na).view(1, 1, na) < 6))
        um[:, :, 12:13] = um[:, :, 12:13] & ~has_attack
        ua = masked_choice(um, game_seed.view(B, 1), pslots, turn, HEAD_UNIT)
        ea = masked_choice(sim.envoy_mask(), game_seed, turn, HEAD_ENVOY)
        sim.apply_seat_actions(0, production=pa, tech=ta, civic=ca, envoys=ea)
        sim._apply_seat_unit_actions(0, ua)
        sim.step()


def _report(part: str, pr: cProfile.Profile, wall: float, turns: int, dump: str | None) -> None:
    print(f"\n=== {part}: {wall:.1f}s wall, {turns / wall:.1f} turns/sec ===")
    buf = io.StringIO()
    stats = pstats.Stats(pr, stream=buf)
    if dump:
        stats.dump_stats(dump)
        print(f"raw stats -> {dump}")
    stats.sort_stats("cumulative").print_stats(40)
    stats.sort_stats("tottime").print_stats(15)
    print(buf.getvalue())
    # Guard-storm metric: Tensor.any call count + tottime.
    for func, (cc, nc, tt, ct, callers) in stats.stats.items():  # type: ignore[attr-defined]
        name = func[2]
        if "'any'" in name and "Tensor" in name:
            print(f"guard-storm: {name}  calls={nc}  tottime={tt:.2f}s")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--part", choices=["parity", "rollout", "both"], default="both")
    ap.add_argument("--turns", type=int, default=250)
    ap.add_argument("--seed", type=int, default=2026, help="rollout action-stream seed (the profiled game")
    ap.add_argument("--dump", default=None, help="dump raw .prof stats (suffix _parity/_rollout added)")
    ap.add_argument("--worlds", default=None, help="fixture directory (default: the exported seeder/worlds)")
    args = ap.parse_args()

    where = Path(args.worlds) if args.worlds else FIXTURES
    rules = load_rules(where / "rules.json")
    paths = fixture_paths(where)
    if not paths:
        print("no fixtures — run `npm run seed && npm run export` first")
        return 1

    if args.part in ("parity", "both"):
        fixtures = [load_fixture(p) for p in paths[:6]]
        sim = BatchSim(fixtures, rules, device="cpu", dtype=torch.float64)
        pr = cProfile.Profile()
        t0 = time.perf_counter()
        pr.enable()
        _parity_loop(sim, args.turns)
        pr.disable()
        _report("parity", pr, time.perf_counter() - t0, args.turns,
                args.dump and args.dump + "_parity.prof")

    if args.part in ("rollout", "both"):
        fixtures = [load_fixture(p) for p in paths[:3] for _ in range(3)]
        sim = BatchSim(fixtures, rules, device="cpu", dtype=torch.float64)
        pr = cProfile.Profile()
        t0 = time.perf_counter()
        pr.enable()
        _rollout_loop(sim, args.turns, args.seed)
        pr.disable()
        _report("rollout", pr, time.perf_counter() - t0, args.turns,
                args.dump and args.dump + "_rollout.prof")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
