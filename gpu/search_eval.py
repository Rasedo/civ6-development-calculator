"""Benchmark the single-agent search (MCTS M1/M2a) against the scripted base
policy on MATCHED worlds.

    python gpu/search_eval.py                          # 6 games, depth-1 MPC
    python gpu/search_eval.py --episodes 12 --depth 1 --horizon 20 --turns 100

For each episode a B=1 world is built from a fixture (+ optional scramble) and
played twice from the SAME start: once fully scripted, once with the capital's
production chosen by closed-loop search (`mpc_play`, everything else scripted).
Both see the identical world, so the per-game delta is a clean read on what the
search adds. Reports the empireScore(state, 'balanced') distribution at the
horizon and the search's gain over scripted.

Search is B=1 and sequential (snapshot -> rollout -> restore per candidate), so
this loops one game at a time and is far slower than the batched gpu/eval.py —
keep --episodes modest. Absolute numbers are NOT comparable to eval.py (that
batches its per-episode scramble differently); compare WITHIN this tool.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import load_rules, load_fixture, FIXTURES
from civ6gpu.env import BatchEnv
from civ6gpu.mcts import mpc_play


def build_game(pool, i, rules, device, horizon):
    return BatchEnv([pool[i % len(pool)]], rules, device=device, dtype=torch.float64, horizon=horizon)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", type=int, default=6)
    ap.add_argument("--turns", type=int, default=100, help="game length actually played")
    ap.add_argument("--horizon", type=int, default=20, help="search lookahead per decision")
    ap.add_argument("--depth", type=int, default=1, help="planning depth (1 = open-loop 1-ply leaf)")
    ap.add_argument("--city", type=int, default=0, help="which city's production the search controls")
    ap.add_argument("--scramble", type=int, default=None, help="per-game world scramble seed (default: parity world)")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        raise SystemExit(1)
    pool = [load_fixture(p) for p in paths]

    base_scores, srch_scores = [], []
    wins = 0
    print(f"search-eval: {args.episodes} games x {args.turns} turns, depth {args.depth}, "
          f"horizon {args.horizon}, capital=city {args.city}\n")
    for i in range(args.episodes):
        scr = None if args.scramble is None else args.scramble + i

        env = build_game(pool, i, rules, args.device, args.turns)
        env.reset(scramble=scr)
        for _ in range(args.turns):
            env.sim.step()
        base = float(env.sim.empire_score()[0])

        env = build_game(pool, i, rules, args.device, args.turns)
        env.reset(scramble=scr)
        t0 = time.time()
        srch = mpc_play(env.sim, city=args.city, horizon=args.horizon, depth=args.depth, turns=args.turns)
        dt = time.time() - t0

        base_scores.append(base)
        srch_scores.append(srch)
        wins += srch > base + 1e-6
        print(f"  {paths[i % len(paths)].name}: scripted={base:7.1f}  search={srch:7.1f}  "
              f"gain={srch - base:+6.1f}  ({dt:.0f}s)", flush=True)

    def summ(xs):
        t = torch.tensor(xs)
        ci = 1.96 * float(t.std()) / (len(xs) ** 0.5) if len(xs) > 1 else 0.0
        return float(t.mean()), ci

    bm, bc = summ(base_scores)
    sm, sc = summ(srch_scores)
    gains = [s - b for s, b in zip(srch_scores, base_scores)]
    gm, _ = summ(gains)
    print(f"\nscripted : {bm:.1f} ± {bc:.1f}")
    print(f"search   : {sm:.1f} ± {sc:.1f}")
    print(f"mean gain: {gm:+.1f}   search beat scripted on {wins}/{args.episodes}")


if __name__ == "__main__":
    main()
