"""M3d slice 1 — search-derived training targets.

    python gpu/gen_targets.py --episodes 8 --every 5 --horizon 100 \
        --out gpu/targets/m3d-1.pt

Plays scripted-policy episodes and, every K turns, runs the M1 search
(`plan_production`, depth 1) for the capital's production choice,
recording (obs, unit features, production mask, the search's pick, the
search's root value) — the states where lookahead disagrees with myopia
are exactly the ones worth distilling. Output: a dict of stacked
tensors consumed by train_ppo --distill.

This is the minimal, proven-surface variant (capital production via the
M1 machinery); widening to the full 5-head gumbelsearch tuples over
net-driven states is the follow-up once distillation shows signal.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchEnv, load_rules, load_fixture, FIXTURES
from civ6gpu.mcts import plan_production
from train_ppo import Policy, sample_heads, load_compat
from search_eval import gumbel_decide, sh_depths


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodes", type=int, default=8)
    ap.add_argument("--per-episode", type=int, default=12, help="max searched decisions per episode")
    ap.add_argument("--horizon", type=int, default=100)
    ap.add_argument("--search-horizon", type=int, default=20)
    ap.add_argument("--out", default="gpu/targets/m3d-1.pt")
    ap.add_argument("--policy", default=None, help="M3d scaling: drive episodes with this checkpoint (greedy) instead of the scripted policy — targets come from the NET's own state distribution (incl. its wars)")
    ap.add_argument("--search", default="m1", choices=("m1", "gumbel"), help="target source: m1 = plan_production capital picks (WEAK — regressed the champion, kept for ablation); gumbel = NET-GUIDED gumbelsearch full-tuple choices at EVERY turn (the corrected M3d path)")
    ap.add_argument("--k", type=int, default=8)
    ap.add_argument("--max-depth", type=int, default=12)
    ap.add_argument("--reward-scale", type=float, default=100.0, help="must match the checkpoint's training reward scale")
    ap.add_argument("--offset", type=int, default=0, help="fixture-pool offset (parallel workers use disjoint offsets)")
    ap.add_argument("--at-war-only", action="store_true", help="record only at-war states (the siege curriculum: captures are ~1/1000 in generic tape)")
    args = ap.parse_args()

    rules = load_rules()
    pool = sorted(FIXTURES.glob("seed*.json"))
    rows: list[dict] = []
    net = None

    if args.search == "gumbel":
        assert args.policy, "--search gumbel needs --policy (the net guides the search)"
        depths = sh_depths(args.k, args.max_depth)
        for ep in range(args.episodes):
            fx = load_fixture(pool[(args.offset + ep) % len(pool)])
            env = BatchEnv([fx], rules, device="cpu", dtype=torch.float32, horizon=args.horizon)
            envk = BatchEnv([fx] * args.k, rules, device="cpu", dtype=torch.float32, horizon=args.horizon)
            env.reset(scramble=999 + args.offset + ep)
            envk.reset(scramble=999 + args.offset + ep)
            if net is None:
                ck = torch.load(args.policy, map_location="cpu")
                m0 = env.masks()
                dims = ck.get("dims") or {
                    "C": m0["production"].shape[1], "AP": m0["production"].shape[2],
                    "NT": m0["tech"].shape[1], "NC": m0["civic"].shape[1],
                    "S": m0["envoy"].shape[1], "W": m0.get("war", torch.zeros(1, 0)).shape[1],
                }
                net = Policy(env.obs_size, dims, hidden=ck.get("hidden", 256))
                load_compat(net, ck["model"])
                net.eval()
            ep_rows = []
            for t in range(args.horizon):
                m = env.masks()
                obs, uf = env.observe()[0].float(), env.unit_features()[0].float()
                score_now = float(env.sim.empire_score()[0])
                acts = gumbel_decide(env, envk, net, args.k, depths, args.horizon - t, args.reward_scale)
                if not args.at_war_only or bool(env.sim.r_atwar[0].any()):
                    ep_rows.append({
                        "obs": obs, "ufeat": uf, "score_now": score_now,
                        **{f"m_{h}": m[h][0] for h in m},
                        **{f"a_{h}": acts[h][0] for h in acts},
                    })
                env.step(**acts)
            final = float(env.sim.empire_score()[0])
            for r in ep_rows:
                r["value"] = torch.tensor(final - r.pop("score_now"), dtype=torch.float32)  # return-to-go
            rows.extend(ep_rows)
            print(f"episode {ep + 1}/{args.episodes}: {len(rows)} gumbel targets (final {final:.1f})")
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        stacked = {kk: torch.stack([r[kk] for r in rows]) for kk in rows[0]}
        torch.save(stacked, out)
        print(f"saved {len(rows)} search targets -> {out}")
        return
    for ep in range(args.episodes):
        env = BatchEnv([load_fixture(pool[ep % len(pool)])], rules, device="cpu", dtype=torch.float64, horizon=args.horizon)
        env.reset(scramble=999 + ep)
        if args.policy and net is None:
            ck = torch.load(args.policy, map_location="cpu")
            m0 = env.masks()
            dims = ck.get("dims") or {
                "C": m0["production"].shape[1], "AP": m0["production"].shape[2],
                "NT": m0["tech"].shape[1], "NC": m0["civic"].shape[1],
                "S": m0["envoy"].shape[1], "W": m0.get("war", torch.zeros(1, 0)).shape[1],
            }
            net = Policy(env.obs_size, dims, hidden=ck.get("hidden", 256))
            load_compat(net, ck["model"])
            net.eval()
        taken = 0
        for t in range(args.horizon):
            if t >= 15 and taken < args.per_episode:
                m = env.masks()
                if int(m["production"][0, 0].sum()) >= 2:  # the capital faces a real choice
                    taken += 1
                    best, val = plan_production(env.sim, 0, horizon=args.search_horizon, depth=1)
                    rows.append(
                        {
                            "obs": env.observe()[0].float(),
                            "ufeat": env.unit_features()[0].float(),
                            "m_production": m["production"][0],
                            "a_production": torch.tensor(best, dtype=torch.long),
                            "value": torch.tensor(float(val[best]), dtype=torch.float32),
                        }
                    )
            if net is not None:
                with torch.no_grad():
                    out = net(env.observe().float(), env.unit_features().float())
                acts, _, _ = sample_heads(out, env.masks(), greedy=True)
                env.step(**acts)
            else:
                env.step()  # scripted continuation
        print(f"episode {ep + 1}/{args.episodes}: {len(rows)} targets so far")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    stacked = {k: torch.stack([r[k] for r in rows]) for k in rows[0]}
    torch.save(stacked, out)
    print(f"saved {len(rows)} search targets -> {out}")


if __name__ == "__main__":
    main()
