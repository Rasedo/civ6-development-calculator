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
from civ6gpu.mcts import (
    mpc_play, mpc_play_empire, search_production, loyalty_shaped_value, _empire_value,
    _pending, _commit, _commit_many,
)


# --- trained-net inference (mirrors gpu/eval.py's load path) -----------------

def load_policy(path, env, device):
    from train_ppo import Policy

    ck = torch.load(path, map_location=device)
    assert ck["obs_size"] == env.obs_size, "checkpoint obs layout doesn't match this env build"
    policy = Policy(ck["obs_size"], ck["dims"], hidden=ck.get("hidden", 256)).to(device)
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


# --- M2b-2: net-guided search over the full 5-head action tuple ---------------

def _net_out(policy, env):
    with torch.no_grad():
        return policy(env.observe(), env.unit_features())


def net_greedy_play(env, policy, turns):
    """Full net policy baseline: the net drives ALL five heads greedily every turn
    (production/tech/civic/units/envoy, all cities/slots) on this one matched world.
    This is the policy the tuple search must improve on."""
    from train_ppo import sample_heads
    for _ in range(turns):
        acts, _, _ = sample_heads(_net_out(policy, env), env.masks(), greedy=True)
        env.step(**acts)
    return float(env.sim.empire_score()[0])


def tuplesearch_play(env, policy, k, horizon, leaf, turns):
    """M2b-2: Sampled-AlphaZero-style search over the FULL action tuple. Each turn,
    take the net's greedy tuple plus k-1 tuples sampled from its factored policy (the
    net is the prior), evaluate each by either the net's value head (leaf='net' — a
    cheap 1-ply bootstrap) or a scripted rollout (leaf='rollout' — reliable but ~k*H
    steps/turn), and play the best. A one-step policy-improvement over the net's
    greedy action across all five heads jointly. Seed torch beforehand for a
    reproducible sample set."""
    from train_ppo import sample_heads
    for _ in range(turns):
        out = _net_out(policy, env)
        masks = env.masks()
        cands = [sample_heads(out, masks, greedy=True)[0]]
        for _ in range(k - 1):
            cands.append(sample_heads(out, masks, greedy=False)[0])
        snap = env.sim.snapshot()
        best, bestv = cands[0], -1e30
        for acts in cands:
            env.step(**acts)  # commit the whole tuple (advances one turn)
            if leaf == "net":
                v = net_value(policy, env)
            else:
                for _ in range(horizon):
                    env.sim.step()
                v = float(env.sim.empire_score()[0])
            env.sim.restore(snap)
            if v > bestv:
                best, bestv = acts, v
        env.step(**best)
    return float(env.sim.empire_score()[0])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", default="search",
                    choices=["search", "net", "netsearch", "netgreedy", "tuplesearch"])
    ap.add_argument("--checkpoint", default=None, help="net path (required for net policies)")
    ap.add_argument("--k", type=int, default=8, help="tuplesearch: candidate tuples sampled from the net per turn")
    ap.add_argument("--tuple-leaf", default="net", choices=["net", "rollout"],
                    help="tuplesearch leaf: the net value head (cheap) or a scripted rollout (reliable)")
    ap.add_argument("--episodes", type=int, default=6)
    ap.add_argument("--turns", type=int, default=100, help="game length actually played")
    ap.add_argument("--horizon", type=int, default=20, help="search lookahead per decision")
    ap.add_argument("--depth", type=int, default=1, help="planning depth for `search` (1 = 1-ply leaf)")
    ap.add_argument("--city", type=int, default=0, help="which city's production the challenger controls")
    ap.add_argument("--all-cities", action="store_true",
                    help="control EVERY city's production, not just --city (search/net only)")
    ap.add_argument("--loyalty-aware", action="store_true",
                    help="shape the search leaf to penalize loyalty-fragile cities (search only) — "
                         "curbs over-expansion into cities that later flip on loyalty")
    ap.add_argument("--loyalty-penalty", type=float, default=2.0, help="per loyalty-point-under penalty")
    ap.add_argument("--loyalty-thresh", type=float, default=100.0, help="loyalty level below which cities are penalized")
    ap.add_argument("--scramble", type=int, default=None, help="per-game world scramble seed (default: parity world)")
    ap.add_argument("--dtype", default="float32", choices=["float32", "float64"],
                    help="engine precision; keep it fixed across policies — float32 vs float64 "
                         "trajectories diverge materially over 100 turns, so mixing them would "
                         "compare different worlds. float32 matches the trained net.")
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()
    NET_POLICIES = ("net", "netsearch", "netgreedy", "tuplesearch")
    if args.policy in NET_POLICIES and not args.checkpoint:
        ap.error(f"--policy {args.policy} needs --checkpoint")
    if args.all_cities and args.policy not in ("search", "net"):
        ap.error("--all-cities is implemented for search/net only")
    if args.loyalty_aware and args.policy != "search":
        ap.error("--loyalty-aware shapes the rollout leaf and applies to --policy search only")
    if args.policy in NET_POLICIES and args.dtype != "float32":
        ap.error("net policies require --dtype float32 (matches the trained net's weights)")
    vf = loyalty_shaped_value(args.loyalty_penalty, args.loyalty_thresh) if args.loyalty_aware else _empire_value

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
    if args.policy in ("netgreedy", "tuplesearch"):
        detail = "all 5 heads" + (f", k={args.k} leaf={args.tuple_leaf}" if args.policy == "tuplesearch" else "")
    else:
        detail = ("all cities" if args.all_cities else f"city {args.city}") + \
                 (f", loyalty-aware(pen={args.loyalty_penalty})" if args.loyalty_aware else "")
    print(f"search-eval [{args.policy}]: {args.episodes} games x {args.turns} turns, "
          f"horizon {args.horizon}, control = {detail}\n")
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
            chal = (mpc_play_empire(env.sim, horizon=args.horizon, depth=args.depth, turns=args.turns, value_fn=vf)
                    if args.all_cities else
                    mpc_play(env.sim, city=args.city, horizon=args.horizon, depth=args.depth, turns=args.turns, value_fn=vf))
        elif args.policy == "net":
            chal = (net_play_empire(env, policy, args.turns) if args.all_cities
                    else net_play(env, policy, args.city, args.turns))
        elif args.policy == "netsearch":
            chal = netsearch_play(env, policy, args.city, args.horizon, args.turns)
        elif args.policy == "netgreedy":
            chal = net_greedy_play(env, policy, args.turns)
        else:  # tuplesearch
            torch.manual_seed(20260705 + i)  # reproducible net sampling per game
            chal = tuplesearch_play(env, policy, args.k, args.horizon, args.tuple_leaf, args.turns)
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
