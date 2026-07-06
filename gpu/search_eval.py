"""Benchmark the single-agent search (MCTS M1/M2a/M2b) against the scripted base
policy on MATCHED worlds, over one control surface: the capital's production.

    python gpu/search_eval.py                                   # net-free depth-1 MPC
    python gpu/search_eval.py --policy net    --checkpoint gpu/runs/cpu150/best.pt
    python gpu/search_eval.py --policy netsearch --checkpoint gpu/runs/cpu150/best.pt
    python gpu/search_eval.py --policy gumbelsearch --checkpoint gpu/runs/tune3/best.pt --k 8

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
    minmax_normalize, tuple_key, stack_tuples, clone_state, rehash_rng,
)


# --- trained-net inference (mirrors gpu/eval.py's load path) -----------------

def load_policy(path, env, device):
    """→ (policy, ck). Keep ck around: episode envs must be re-fitted to the
    checkpoint's action-space vintage via fit_env_to_checkpoint."""
    from train_ppo import Policy

    ck = torch.load(path, map_location=device)
    assert ck["obs_size"] == env.obs_size, "checkpoint obs layout doesn't match this env build"
    policy = Policy(ck["obs_size"], ck["dims"], hidden=ck.get("hidden", 256)).to(device)
    policy.load_state_dict(ck["model"])
    policy.eval()
    return policy, ck


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


def tuplesearch_play(env, policy, k, horizon, leaf, turns, tau=1.0):
    """M2b-2: Sampled-AlphaZero-style search over the FULL action tuple. Each turn,
    take the net's greedy tuple plus k-1 tuples sampled from its factored policy (the
    net is the prior), evaluate each by either the net's value head (leaf='net' — a
    cheap 1-ply bootstrap) or a scripted rollout (leaf='rollout' — reliable but ~k*H
    steps/turn), and play the best. A one-step policy-improvement over the net's
    greedy action across all five heads jointly. Seed torch beforehand for a
    reproducible sample set.

    tau < 1 sharpens the prior for the k-1 SAMPLED candidates (logits/tau):
    a healthy-entropy net (tune1: 2.15) samples diffuse tuples at tau=1 and
    the 1-ply value leaf can't rank them — cooler candidates stay near the
    net's own play, so the search explores plausible deviations instead of
    noise. The greedy tuple is temperature-invariant."""
    from train_ppo import sample_heads
    for _ in range(turns):
        out = _net_out(policy, env)
        masks = env.masks()
        cands = [sample_heads(out, masks, greedy=True)[0]]
        if tau != 1.0:
            out = {kk: (v if kk == "value" else v / tau) for kk, v in out.items()}
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


# --- M3b: Gumbel tuple search (top-k + Sequential Halving over rollout depth) --

def _gumbel_like(t):
    """Standard Gumbel(0,1) noise shaped like t, from torch's global RNG (seeded
    per game, like tuplesearch's candidate sampling)."""
    return -torch.log(-torch.log(torch.rand_like(t).clamp_(min=1e-12)))


def sh_depths(k: int, max_depth: int) -> list[int]:
    """The Sequential-Halving rung schedule: ceil(log2(k)) (min 2) evaluation
    depths spread evenly over [1, max_depth]. Round r evaluates every surviving
    candidate at depth d_r, then cuts the bottom half. This is Gumbel MuZero's
    SH with the budget spent on DEPTH instead of repeated visits: the env is
    deterministic, so one evaluation per (candidate, depth) is already exact —
    revisiting a node adds nothing, and what refines a candidate's value is
    rolling its continuation deeper."""
    import math

    rounds = max(2, math.ceil(math.log2(max(k, 2))))
    return [max(1, round(1 + (max_depth - 1) * r / (rounds - 1))) for r in range(rounds)]


def gumbel_decide(env, envk, policy, k, depths, remaining, reward_scale,
                  honest_rng=False, c_visit=50.0, c_scale=1.0):
    """One Gumbel/Sequential-Halving root decision over the full 5-head tuple.

    Candidates: the net's greedy tuple + (k-1) tuples sampled from its factored
    policy, deduped; each carries g_i + logp_i (fresh Gumbel noise + the joint
    log-prob — the sampled-action-space stand-in for exact Gumbel top-k without
    replacement, which is infeasible over the exponential tuple space). All
    still-alive candidates are evaluated IN LOCKSTEP in the k-wide scratch envk
    (M3c: broadcast-restore env's snapshot, commit the tuples as one batched
    step, deepen with a net-driven greedy continuation), and each SH round cuts
    the bottom half by

        g_i + logp_i + (c_visit + depth) * c_scale * q̄_i,

    Gumbel MuZero's root score with its default constants (c_visit=50,
    c_scale=1) and the visit count replaced by rollout depth — deeper (exact)
    evaluations earn more trust, mirroring the paper's max-visit term. q̄ is the
    per-round min-max-normalized (M3a) q_d = empire_score(d) + value(d) /
    reward_scale: the value head was trained on reward_scale-scaled score
    deltas (γ≈1), so q_d is a depth-d bootstrapped estimate of the FINAL score,
    keeping every round in the same units. The deepest evaluation supersedes
    shallower ones rather than averaging (the paper's visit-mean collapses to
    the latest read when each revisit is exact and deeper). Because the
    lockstep batch steps all k rows regardless, halving is a selection
    schedule, not a compute saver — so at least 2 candidates ride to the
    deepest rung and the final argmax lands on the most informed values.
    Depths clamp to `remaining` so rollouts never value score past the game's
    last real turn. honest_rng re-hashes the committed rows' RNG (M3d-lite).

    Deterministic given torch's RNG state; env is left bit-identical (only the
    scratch envk mutates). Returns the chosen action tuple."""
    from train_ppo import sample_heads

    out = _net_out(policy, env)
    masks = env.masks()
    g0, lp0, _ = sample_heads(out, masks, greedy=True)
    cands, logps, seen = [g0], [lp0], {tuple_key(g0)}
    for _ in range(k - 1):
        a, lp, _ = sample_heads(out, masks, greedy=False)
        key = tuple_key(a)
        if key not in seen:
            seen.add(key)
            cands.append(a)
            logps.append(lp)
    m = len(cands)
    if m == 1:
        return g0  # every draw collapsed to the greedy tuple — a forced move
    logp = torch.cat(logps)
    base = _gumbel_like(logp) + logp  # g_i + logp_i, fixed for the whole decision
    sim = envk.sim
    clone_state(sim, env.sim.snapshot())
    sim.step(**stack_tuples(cands, sim.B))  # commit all m candidates in ONE step
    if honest_rng:
        rehash_rng(sim)
    depth = 1
    kout = _net_out(policy, envk)
    alive = torch.arange(m, device=base.device)
    for r, d in enumerate(depths):
        while depth < min(d, remaining):
            acts, _, _ = sample_heads(kout, envk.masks(), greedy=True)
            sim.step(**acts)
            depth += 1
            kout = _net_out(policy, envk)
        q = sim.empire_score() + kout["value"] / reward_scale
        score = base[alive] + (c_visit + depth) * c_scale * minmax_normalize(q[alive])
        if r == len(depths) - 1:
            return cands[int(alive[int(score.argmax())])]
        keep = max(2, (len(alive) + 1) // 2)
        if keep < len(alive):
            alive = alive[score.topk(keep).indices]


def gumbelsearch_play(env, envk, policy, k, max_depth, turns, reward_scale,
                      honest_rng=False):
    """M3b driver: at EVERY turn of the real game, run one Gumbel/SH decision
    over the full action tuple and commit its pick (closed loop, like mpc_play).
    envk is the k-wide scratch env — the same fixture k times, built once per
    game and broadcast-restored at each decision. Forced moves (all samples
    dedup to the greedy tuple) skip the machinery entirely."""
    depths = sh_depths(k, max_depth)
    for t in range(turns):
        acts = gumbel_decide(env, envk, policy, k, depths, turns - t, reward_scale,
                             honest_rng=honest_rng)
        env.step(**acts)
    return float(env.sim.empire_score()[0])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--policy", default="search",
                    choices=["search", "net", "netsearch", "netgreedy", "tuplesearch", "gumbelsearch"])
    ap.add_argument("--checkpoint", default=None, help="net path (required for net policies)")
    ap.add_argument("--k", type=int, default=8, help="tuplesearch/gumbelsearch: candidate tuples sampled from the net per turn")
    ap.add_argument("--tuple-leaf", default="net", choices=["net", "rollout"],
                    help="tuplesearch leaf: the net value head (cheap) or a scripted rollout (reliable)")
    ap.add_argument("--temperature", type=float, default=1.0,
                    help="tuplesearch: sharpen (<1) the net prior when sampling the k-1 candidates")
    ap.add_argument("--max-depth", type=int, default=12,
                    help="gumbelsearch: deepest SH rollout depth in turns (rungs spread evenly over [1, max-depth])")
    ap.add_argument("--honest-rng", action="store_true",
                    help="gumbelsearch: re-hash rng_state after committing candidates so continuation "
                         "rollouts don't replay the realized future RNG (M3d-lite; default off for comparability)")
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
    NET_POLICIES = ("net", "netsearch", "netgreedy", "tuplesearch", "gumbelsearch")
    if args.policy in NET_POLICIES and not args.checkpoint:
        ap.error(f"--policy {args.policy} needs --checkpoint")
    if args.all_cities and args.policy not in ("search", "net"):
        ap.error("--all-cities is implemented for search/net only")
    if args.loyalty_aware and args.policy != "search":
        ap.error("--loyalty-aware shapes the rollout leaf and applies to --policy search only")
    if args.honest_rng and args.policy != "gumbelsearch":
        ap.error("--honest-rng perturbs the search continuations and applies to --policy gumbelsearch only")
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

    policy, ck = (load_policy(args.checkpoint, build(0), args.device) if args.checkpoint else (None, None))
    if ck is not None:
        from train_ppo import fit_env_to_checkpoint

        if fit_env_to_checkpoint(build(0), ck):
            print("note: checkpoint pre-dates purchases — purchase columns disabled for its envs\n")

    base_scores, chal_scores, wins = [], [], 0
    if args.policy == "gumbelsearch":
        detail = (f"all 5 heads, k={args.k} SH depths {sh_depths(args.k, args.max_depth)}"
                  + (" honest-rng" if args.honest_rng else ""))
    elif args.policy in ("netgreedy", "tuplesearch"):
        detail = "all 5 heads" + (
            f", k={args.k} leaf={args.tuple_leaf}"
            + (f" tau={args.temperature}" if args.temperature != 1.0 else "")
            if args.policy == "tuplesearch" else ""
        )
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
        if ck is not None:
            from train_ppo import fit_env_to_checkpoint

            fit_env_to_checkpoint(env, ck)
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
        elif args.policy == "gumbelsearch":
            torch.manual_seed(20260705 + i)  # reproducible candidate sampling + Gumbel draws per game
            envk = BatchEnv([pool[i % len(pool)]] * args.k, rules, device=args.device,
                            dtype=dtype, horizon=args.turns)  # the k-wide scratch, once per game
            if ck is not None:
                from train_ppo import fit_env_to_checkpoint

                fit_env_to_checkpoint(envk, ck)
            rs = float(ck.get("config", {}).get("reward_scale", 0.01))
            chal = gumbelsearch_play(env, envk, policy, args.k, args.max_depth, args.turns,
                                     rs, honest_rng=args.honest_rng)
        else:  # tuplesearch
            torch.manual_seed(20260705 + i)  # reproducible net sampling per game
            chal = tuplesearch_play(env, policy, args.k, args.horizon, args.tuple_leaf, args.turns,
                                    tau=args.temperature)
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
