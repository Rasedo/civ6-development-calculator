"""Throughput benchmark for the vectorized engine.

    python gpu/bench.py                # CPU, and CUDA if available
    python gpu/bench.py --turns 100 --batches 1,256,4096

Reports game-turns/second (one 'turn' = one full simulated turn of ONE
game — all its cities; a batch of 4096 stepping once = 4096 turns).
Compare with the TypeScript engine on the identical multi-city scenario:
~1,240 game-turns/sec on one CPU core.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


def bench(device: str, dtype, batch: int, turns: int, fixture: dict, rules) -> float:
    sim = BatchSim([fixture] * batch, rules, device=device, dtype=dtype)
    # warmup (JIT-ish caches, CUDA context)
    for _ in range(3):
        sim.step()
    if device == "cuda":
        torch.cuda.synchronize()
    t0 = time.perf_counter()
    for _ in range(turns):
        sim.step()
    if device == "cuda":
        torch.cuda.synchronize()
    dt = time.perf_counter() - t0
    return batch * turns / dt


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--turns", type=int, default=60)
    p.add_argument("--batches", default="1,64,1024,4096")
    args = p.parse_args()

    rules = load_rules()
    fixture = load_fixture(sorted(FIXTURES.glob("seed*.json"))[0])
    batches = [int(b) for b in args.batches.split(",")]

    devices = [("cpu", torch.float64)]
    if torch.cuda.is_available():
        devices.append(("cuda", torch.float32))
        print(f"CUDA: {torch.cuda.get_device_name(0)}")
    else:
        print("CUDA not available — CPU only (run this on the GPU box for the real numbers)")

    print(f"{'device':8} {'batch':>6}  {'game-turns/sec':>15}")
    for device, dtype in devices:
        for b in batches:
            try:
                rate = bench(device, dtype, b, args.turns, fixture, rules)
                print(f"{device:8} {b:>6}  {rate:>15,.0f}")
            except torch.cuda.OutOfMemoryError:
                print(f"{device:8} {b:>6}  OOM")


if __name__ == "__main__":
    main()
