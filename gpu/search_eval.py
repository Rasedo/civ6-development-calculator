"""Benchmark the single-agent search (MCTS M1/M2a/M2b) against the scripted base
policy on MATCHED worlds, over one control surface: the capital's production.

    python gpu/search_eval.py                                   # net-free depth-1 MPC
    python gpu/search_eval.py --policy net    --checkpoint gpu/runs/cpu150/best.pt
    python gpu/search_eval.py --policy netsearch --checkpoint gpu/runs/cpu150/best.pt

Every episode builds a B=1 world from a fixture (+ optional scramble) and plays it
twice from the IDENTICAL start: once fully scripted (the baseline), once with the
capital's production chosen by the selected challenger, everything else scripted.
Same world both times, so the per-game delta isolates the production lever.
Challengers:

  search      closed-loop rollout planning, no net (M2a `mpc_play`)
  net         the trained policy's production head (greedy), scripted elsewhere
  netsearch   the M2a search but with the net's VALUE head as the leaf instead of a
              scripted rollout — tests whether the value head can replace rollouts
              (1-ply, ~horizon x cheaper than `search`)

Search is B=1 and sequential, so this is far slower than the batched gpu/eval.py —
keep --episodes modest. Absolute numbers are NOT comparable to eval.py; compare
WITHIN this tool. All modes run at one --dtype (default float32, matching the
trained net) so every policy shares the same worlds — float32 and float64
trajectories diverge materially over 100 turns, so a scripted baseline and a
challenger must use the same precision to be a fair pair.
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
from civ6gpu.mcts import mpc_play, mpc_play_empire, search_production, _pending, _commit, _commit_many


# --- trained-net inference (mirrors gpu/eval.py's load path) -----------------

def load_policy(path, env, device):
    from train_ppo import Policy

    ck = torch.load(path, map_location=device)
    assert ck["obs_size"] == env.obs_size, "checkpoint obs layout doesn't match this env build"
    policy = Policy(ck["obs_size"], ck["dims"]).to(device)
    policy.load_state_dict(ck["model"])
    policy.eval()
    return policy


def net_production_action(policy, env, city):
    """The net's greedy production pick for `city` at the current state (argmax over
    the masked production-head logits)."""
    with torch.no_grad():
        out = policy(env.observe(), env.unit_features())
    logits = out["production"][0, city]
    mask = env.sim.production_mask()[0, city]
    return int(logits.masked_fill(~mask, float("-inf")).argmax())


def net_value(policy, env):
    """The net's value estimate for game 0 at the current state."""
    with torch.no_grad():
        return float(policy(env.observe(), env.unit_features())["value"][0])


# --- challenger drivers (all: control `city` production, scripted elsewhere) --

def net_play(env, policy, city, turns):
    for _ in range(turns):
        if _pending(env.sim, city):
            _commit(env.sim, city, net_production_action(policy, env, city))
        else:
            env.sim.step()
    return float(env.sim.empire_score()[0])


def net_play_empire(env, policy, turns):
    """net_play over EVERY city's production (all pending cities decided from the same
    observation, then committed together), the net-policy analogue of mpc_play_empire."""
    for _ in range(turns):
        pend = [c for c in range(env.sim.C) if _pending(env.sim, c)]
        if not pend:
            env.sim.step()
            continue
        _commit_many(env.sim, {c: net_production_action(policy, env, c) for c in pend})
    return float(env.sim.empire_score()[0])


def netsearch_play(env, policy, city, horizon, turns):
    """MPC where each decision runs a 1-ply search whose leaf is the net's value
    head (after committing the candidate) rather than a scripted rollout."""
    def net_leaf_factory():
        def leaf(a):
            s = env.sim.snapshot()
            _commit(env.sim, city, a)
            v = net_value(policy, env)
            env.sim.restore(s)
            return v
        return leaf

    for _ in range(turns):
        if _pending(env.sim, city):
            best, _ = search_production(env.sim, city=city, horizon=horizon, value_fn=net_leaf_factory())
            _commit(env.sim, city, best)
        else:
            env.sim.step()
    return float(env.sim.empire_score()[0])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", default="search", choices=["search", "net", "netsearch"])
    ap.add_argument("--checkpoint", default=None, help="net path (required for net/netsearch)")
    ap.add_argument("--episodes", type=int, default=6)
    ap.add_argument("--turns", type=int, default=100, help="game length actually played")
    ap.add_argument("--horizon", type=int, default=20, help="search lookahead per decision")
    ap.add_argument("--depth", type=int, default=1, help="planning depth for `search` (1 = 1-ply leaf)")
    ap.add_argument("--city", type=int, default=0, help="which city's production the challenger controls")
    ap.add_argument("--all-cities", action="store_true",
                    help="control EVERY city's production, not just --city (search/net only)")
    ap.add_argument("--scramble", type=int, default=None, help="per-game world scramble seed (default: parity world)")
    ap.add_argument("--dtype", default="float32", choices=["float32", "float64"],
                    help="engine precision; keep it fixed across policies — float32 vs float64 "
                         "trajectories diverge materially over 100 turns, so mixing them would "
                         "compare different worlds. float32 matches the trained net.")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()
    if args.policy in ("net", "netsearch") and not args.checkpoint:
        ap.error(f"--policy {args.policy} needs --checkpoint")
    if args.all_cities and args.policy == "netsearch":
        ap.error("--all-cities is implemented for search/net only")

    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        raise SystemExit(1)
    pool = [load_fixture(p) for p in paths]
    dtype = torch.float32 if args.dtype == "float32" else torch.float64

    def build(i):
        return BatchEnv([pool[i % len(pool)]], rules, device=args.device, dtype=dtype, horizon=args.turns)

    policy = load_policy(args.checkpoint, build(0), args.device) if args.checkpoint else None

    base_scores, chal_scores, wins = [], [], 0
    surface = "all cities" if args.all_cities else f"city {args.city}"
    print(f"search-eval [{args.policy}]: {args.episodes} games x {args.turns} turns, "
          f"horizon {args.horizon}, depth {args.depth}, production surface = {surface}\n")
    for i in range(args.episodes):
        scr = None if args.scramble is None else args.scramble + i

        env = build(i)
        env.reset(scramble=scr)
        for _ in range(args.turns):
            env.sim.step()
        base = float(env.sim.empire_score()[0])

        env = build(i)
        env.reset(scramble=scr)
        t0 = time.time()
        if args.policy == "search":
            chal = (mpc_play_empire(env.sim, horizon=args.horizon, depth=args.depth, turns=args.turns)
                    if args.all_cities else
                    mpc_play(env.sim, city=args.city, horizon=args.horizon, depth=args.depth, turns=args.turns))
        elif args.policy == "net":
            chal = (net_play_empire(env, policy, args.turns) if args.all_cities
                    else net_play(env, policy, args.city, args.turns))
        else:
            chal = netsearch_play(env, policy, args.city, args.horizon, args.turns)
        dt = time.time() - t0

        base_scores.append(base)
        chal_scores.append(chal)
        wins += chal > base + 1e-6
        print(f"  {paths[i % len(paths)].name}: scripted={base:7.1f}  {args.policy}={chal:7.1f}  "
              f"gain={chal - base:+6.1f}  ({dt:.0f}s)", flush=True)

    def summ(xs):
        t = torch.tensor(xs)
        ci = 1.96 * float(t.std()) / (len(xs) ** 0.5) if len(xs) > 1 else 0.0
        return float(t.mean()), ci

    bm, bc = summ(base_scores)
    cm, cc = summ(chal_scores)
    gm, _ = summ([c - b for c, b in zip(chal_scores, base_scores)])
    print(f"\nscripted     : {bm:.1f} ± {bc:.1f}")
    print(f"{args.policy:<12} : {cm:.1f} ± {cc:.1f}")
    print(f"mean gain    : {gm:+.1f}   {args.policy} beat scripted on {wins}/{args.episodes}")


if __name__ == "__main__":
    main()
