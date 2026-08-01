"""α-Rank over a checkpoint pool (the C3 ranking protocol).

    python gpu/alpharank.py gpu/runs/c3a-1/best.pt gpu/runs/c3a-2/best.pt \
        gpu/runs/c3a-4/best.pt --episodes 12

Plays the round-robin through duel_eval's machinery (each ordered pair
once — seat asymmetry is part of the game), builds the win-rate payoff
matrix, and reports the single-population α-Rank stationary distribution
(the standard sweep: the Markov chain over strategies where a strategy
invades proportionally to exp(α·payoff-advantage), α swept high — the
ranking limit) alongside raw mean win rates. With intransitive pools the
stationary mass, not the win rate, is the ranking.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import re
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parent.parent


def duel(a: str, b: str, episodes: int) -> float:
    """A's win rate vs B (A seat 0)."""
    out = subprocess.run(
        [sys.executable, "gpu/duel_eval.py", "--a", a, "--b", b, "--episodes", str(episodes)],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    m = re.search(r"A wins (\d+)% of", out.stdout)
    if not m:
        raise RuntimeError(f"duel_eval failed: {out.stdout[-300:]} {out.stderr[-300:]}")
    return int(m.group(1)) / 100.0


def alpharank(payoff: torch.Tensor, alpha: float = 50.0, mut: float = 1e-3) -> torch.Tensor:
    """Single-population α-Rank stationary distribution over N strategies.
    payoff[i, j] = i's expected payoff vs j (win rate here)."""
    N = payoff.shape[0]
    T = torch.zeros(N, N, dtype=torch.float64)
    for i in range(N):
        for j in range(N):
            if i == j:
                continue
            # fixation-style logistic response to the payoff advantage
            adv = float(payoff[j, i] - payoff[i, j])
            T[i, j] = mut * (1.0 / (1.0 + torch.exp(torch.tensor(-alpha * adv))))
        T[i, i] = 1.0 - T[i].sum()
    # stationary distribution by power iteration
    pi = torch.full((N,), 1.0 / N, dtype=torch.float64)
    for _ in range(10_000):
        nxt = pi @ T
        if float((nxt - pi).abs().max()) < 1e-12:
            break
        pi = nxt
    return pi / pi.sum()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoints", nargs="+")
    ap.add_argument("--episodes", type=int, default=12)
    ap.add_argument("--alpha", type=float, default=50.0)
    args = ap.parse_args()
    cks = args.checkpoints
    N = len(cks)
    assert N >= 2, "need at least two checkpoints"

    # payoff[i][j] = i's average win rate against j over both seatings
    payoff = torch.full((N, N), 0.5, dtype=torch.float64)
    for i in range(N):
        for j in range(N):
            if i == j:
                continue
            w_ij = duel(cks[i], cks[j], args.episodes)      # i on seat 0
            w_ji = duel(cks[j], cks[i], args.episodes)      # j on seat 0
            payoff[i, j] = (w_ij + (1.0 - w_ji)) / 2.0      # seat-averaged
            print(f"  {Path(cks[i]).parent.name} vs {Path(cks[j]).parent.name}: "
                  f"seat0 {w_ij:.2f}, as-seat1 {1 - w_ji:.2f} -> {float(payoff[i, j]):.2f}")

    pi = alpharank(payoff, alpha=args.alpha)
    order = torch.argsort(pi, descending=True)
    print("\nalpha-rank (stationary mass | mean win rate):")
    for k in order.tolist():
        wr = float((payoff[k].sum() - 0.5) / max(N - 1, 1))
        print(f"  {pi[k]:.3f} | {wr:.2f}  {cks[k]}")


if __name__ == "__main__":
    main()
