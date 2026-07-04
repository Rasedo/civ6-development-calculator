"""Native on-device PPO over the vectorized engine (phase 5).

    python gpu/train_ppo.py                          # CPU smoke settings
    python gpu/train_ppo.py --batch 1024 --updates 2000   # the GPU box

Policy inference and env stepping never leave the device: BatchEnv steps
B games in lockstep, the policy samples all five masked heads as batched
categoricals, and the PPO update runs on the same tensors — no numpy, no
subprocess bridge, no host round-trips (the only sync points are logging
scalars).

The action space mirrors the engine's macro-action surface:

  production  [B, C]  one categorical per city slot (buildings, settler,
                      idle, roster units)
  tech/civic  [B]     research picks (progress banks while undecided)
  units       [B, P]  one categorical per unit slot (6 moves, 6 attacks,
                      hold), conditioned on per-unit features
  envoy       [B]     back a met city-state

Heads whose mask row is all-False (queue busy, research running, no unit
in the slot) contribute nothing to the log-prob, entropy or gradient —
the composite action's log-prob is the sum over the heads that actually
decided something this turn.

Each update collects one full fixed-horizon episode per game (the reward
telescopes to empireScore at the horizon — the exact fitness the TS
benchmarks report), with the world re-seeded per episode via
reset(scramble=...): same maps, fresh barbarians/quests/wars/disasters.

Writes checkpoints + a CSV log under --out; TensorBoard too if it's
installed. Evaluate with gpu/eval.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.distributions import Categorical

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchEnv, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import P_MAX
from civ6gpu.env import UNIT_FEATURES

N_UNIT_ACTS = 16  # 0-5 move, 6-11 attack, 12 hold, 13/14/15 build FARM/MINE/LUMBER_MILL
NEG = -1e9


# --- policy -------------------------------------------------------------------


def _layer(m: nn.Linear, gain: float) -> nn.Linear:
    nn.init.orthogonal_(m.weight, gain)
    nn.init.zeros_(m.bias)
    return m


class Policy(nn.Module):
    """Shared trunk → value + four flat heads + a per-unit-slot head.

    The units head runs a small MLP on (trunk embedding ⊕ that slot's
    unit features), broadcast across slots — every unit decision sees the
    whole empire summary plus its own position/hp/camp bearing.
    """

    def __init__(self, obs_size: int, dims: dict, hidden: int = 256, uhidden: int = 64):
        super().__init__()
        self.dims = dict(dims)
        C, AP = dims["C"], dims["AP"]
        self.C, self.AP = C, AP
        self.trunk = nn.Sequential(
            _layer(nn.Linear(obs_size, hidden), 2**0.5), nn.Tanh(),
            _layer(nn.Linear(hidden, hidden), 2**0.5), nn.Tanh(),
        )
        self.v = _layer(nn.Linear(hidden, 1), 1.0)
        self.prod = _layer(nn.Linear(hidden, C * AP), 0.01)
        self.tech = _layer(nn.Linear(hidden, dims["NT"]), 0.01)
        self.civic = _layer(nn.Linear(hidden, dims["NC"]), 0.01)
        self.envoy = _layer(nn.Linear(hidden, dims["S"]), 0.01)
        self.uproj = _layer(nn.Linear(hidden, uhidden), 2**0.5)
        self.umlp = nn.Sequential(
            _layer(nn.Linear(uhidden + UNIT_FEATURES, uhidden), 2**0.5), nn.Tanh(),
            _layer(nn.Linear(uhidden, N_UNIT_ACTS), 0.01),
        )

    def forward(self, obs: torch.Tensor, ufeat: torch.Tensor) -> dict[str, torch.Tensor]:
        h = self.trunk(obs)
        ue = self.uproj(h).unsqueeze(1).expand(-1, ufeat.shape[1], -1)
        return {
            "value": self.v(h).squeeze(-1),
            "production": self.prod(h).view(-1, self.C, self.AP),
            "tech": self.tech(h),
            "civic": self.civic(h),
            "envoy": self.envoy(h),
            "units": self.umlp(torch.cat([ue, ufeat], dim=-1)),
        }


def _masked_dist(logits: torch.Tensor, mask: torch.Tensor) -> tuple[Categorical, torch.Tensor]:
    """Categorical over the valid entries; rows with nothing valid become a
    harmless uniform (their samples are discarded and their log-probs and
    entropies zeroed by the returned validity mask)."""
    valid = mask.any(-1)
    ml = logits.masked_fill(~mask, NEG)
    ml = torch.where(valid.unsqueeze(-1), ml, torch.zeros_like(ml))
    return Categorical(logits=ml), valid


def sample_heads(out: dict, masks: dict, greedy: bool = False):
    """→ (actions dict with -1 no-ops, joint logp [B], joint entropy [B])."""
    actions, logp, ent = {}, 0.0, 0.0
    for k in ("production", "tech", "civic", "units", "envoy"):
        dist, valid = _masked_dist(out[k], masks[k])
        a = dist.probs.argmax(-1) if greedy else dist.sample()
        lp = dist.log_prob(a) * valid
        en = dist.entropy() * valid
        if lp.dim() > 1:  # per-slot heads: sum the slots
            lp, en = lp.sum(1), en.sum(1)
        actions[k] = torch.where(valid, a, torch.full_like(a, -1))
        logp = logp + lp
        ent = ent + en
    return actions, logp, ent


def evaluate_heads(out: dict, masks: dict, actions: dict):
    """Joint logp/entropy of STORED actions under CURRENT logits (the PPO
    re-evaluation) — masks come from the buffer, never recomputed."""
    logp, ent = 0.0, 0.0
    for k in ("production", "tech", "civic", "units", "envoy"):
        dist, valid = _masked_dist(out[k], masks[k])
        lp = dist.log_prob(actions[k].clamp(min=0)) * valid
        en = dist.entropy() * valid
        if lp.dim() > 1:
            lp, en = lp.sum(1), en.sum(1)
        logp = logp + lp
        ent = ent + en
    return logp, ent


# --- training -----------------------------------------------------------------


def build_env(batch: int, device: str, horizon: int) -> BatchEnv:
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        raise SystemExit(1)
    pool = [load_fixture(p) for p in paths]
    fixtures = [pool[i % len(pool)] for i in range(batch)]
    return BatchEnv(fixtures, load_rules(), device=device, dtype=torch.float32, horizon=horizon)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch", type=int, default=64, help="parallel games (fixtures repeat round-robin)")
    ap.add_argument("--updates", type=int, default=200)
    ap.add_argument("--horizon", type=int, default=100)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--gamma", type=float, default=0.999)
    ap.add_argument("--gae-lam", type=float, default=0.95)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--minibatches", type=int, default=8)
    ap.add_argument("--ent-coef", type=float, default=0.01)
    ap.add_argument("--vf-coef", type=float, default=0.5)
    ap.add_argument("--max-grad-norm", type=float, default=0.5)
    ap.add_argument("--reward-scale", type=float, default=0.01)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--no-scramble", action="store_true", help="fixed worlds every episode (parity RNG)")
    ap.add_argument("--anneal-lr", action="store_true")
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--out", default="gpu/runs/ppo")
    ap.add_argument("--save-every", type=int, default=25)
    ap.add_argument("--resume", default=None)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    dev = args.device
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    env = build_env(args.batch, dev, args.horizon)
    B, T = args.batch, args.horizon

    m0 = env.masks()
    dims = {
        "C": m0["production"].shape[1],
        "AP": m0["production"].shape[2],
        "NT": m0["tech"].shape[1],
        "NC": m0["civic"].shape[1],
        "S": m0["envoy"].shape[1],
    }
    policy = Policy(env.obs_size, dims).to(dev)
    opt = torch.optim.Adam(policy.parameters(), lr=args.lr, eps=1e-5)
    start_update, best = 0, float("-inf")
    if args.resume:
        ck = torch.load(args.resume, map_location=dev)
        policy.load_state_dict(ck["model"])
        if "optim" in ck:
            opt.load_state_dict(ck["optim"])
        start_update = ck.get("update", 0)
        best = ck.get("best", best)
        print(f"resumed {args.resume} at update {start_update}")

    tb = None
    try:
        from torch.utils.tensorboard import SummaryWriter

        tb = SummaryWriter(str(out / "tb"))
    except ImportError:
        pass
    log_path = out / "log.csv"
    new_log = not log_path.exists()
    log_f = open(log_path, "a", newline="")
    log = csv.writer(log_f)
    if new_log:
        log.writerow(["update", "steps", "score_mean", "score_max", "loss_pi", "loss_v", "entropy", "approx_kl", "clipfrac", "lr", "sps"])

    # rollout buffer, preallocated on device
    buf = {
        "obs": torch.zeros(T, B, env.obs_size, device=dev),
        "ufeat": torch.zeros(T, B, P_MAX, UNIT_FEATURES, device=dev),
        "m_production": torch.zeros(T, B, dims["C"], dims["AP"], dtype=torch.bool, device=dev),
        "m_tech": torch.zeros(T, B, dims["NT"], dtype=torch.bool, device=dev),
        "m_civic": torch.zeros(T, B, dims["NC"], dtype=torch.bool, device=dev),
        "m_units": torch.zeros(T, B, P_MAX, N_UNIT_ACTS, dtype=torch.bool, device=dev),
        "m_envoy": torch.zeros(T, B, dims["S"], dtype=torch.bool, device=dev),
        "a_production": torch.zeros(T, B, dims["C"], dtype=torch.long, device=dev),
        "a_tech": torch.zeros(T, B, dtype=torch.long, device=dev),
        "a_civic": torch.zeros(T, B, dtype=torch.long, device=dev),
        "a_units": torch.zeros(T, B, P_MAX, dtype=torch.long, device=dev),
        "a_envoy": torch.zeros(T, B, dtype=torch.long, device=dev),
        "logp": torch.zeros(T, B, device=dev),
        "value": torch.zeros(T, B, device=dev),
        "reward": torch.zeros(T, B, device=dev),
    }

    for update in range(start_update, args.updates):
        t0 = time.time()
        if args.anneal_lr:
            frac = 1.0 - update / args.updates
            for g in opt.param_groups:
                g["lr"] = args.lr * frac

        obs = env.reset(scramble=None if args.no_scramble else args.seed)
        with torch.no_grad():
            for t in range(T):
                ufeat = env.unit_features()
                masks = env.masks()
                pout = policy(obs, ufeat)
                actions, logp, _ = sample_heads(pout, masks)
                buf["obs"][t] = obs
                buf["ufeat"][t] = ufeat
                for k in ("production", "tech", "civic", "units", "envoy"):
                    buf[f"m_{k}"][t] = masks[k]
                    buf[f"a_{k}"][t] = actions[k]
                buf["logp"][t] = logp
                buf["value"][t] = pout["value"]
                obs, reward, _ = env.step(**actions)
                buf["reward"][t] = reward * args.reward_scale

            # GAE; the horizon is a true terminal, so no bootstrap past it
            # (the telescoped score IS the objective)
            adv = torch.zeros(T, B, device=dev)
            last = torch.zeros(B, device=dev)
            for t in reversed(range(T)):
                next_v = buf["value"][t + 1] if t < T - 1 else torch.zeros(B, device=dev)
                delta = buf["reward"][t] + args.gamma * next_v - buf["value"][t]
                last = delta + args.gamma * args.gae_lam * last
                adv[t] = last
            ret = adv + buf["value"]

        scores = env.sim.empire_score()
        flat = {k: v.reshape(T * B, *v.shape[2:]) for k, v in buf.items()}
        f_adv, f_ret = adv.reshape(-1), ret.reshape(-1)
        f_adv = (f_adv - f_adv.mean()) / (f_adv.std() + 1e-8)

        pi_losses, v_losses, ents, kls, clipfracs = [], [], [], [], []
        N = T * B
        mb = N // args.minibatches
        for _ in range(args.epochs):
            perm = torch.randperm(N, device=dev)
            for i in range(0, N, mb):
                idx = perm[i : i + mb]
                pout = policy(flat["obs"][idx], flat["ufeat"][idx])
                masks = {k: flat[f"m_{k}"][idx] for k in ("production", "tech", "civic", "units", "envoy")}
                acts = {k: flat[f"a_{k}"][idx] for k in ("production", "tech", "civic", "units", "envoy")}
                logp, ent = evaluate_heads(pout, masks, acts)
                ratio = (logp - flat["logp"][idx]).exp()
                a = f_adv[idx]
                l1 = -a * ratio
                l2 = -a * ratio.clamp(1 - args.clip, 1 + args.clip)
                loss_pi = torch.max(l1, l2).mean()
                loss_v = 0.5 * (pout["value"] - f_ret[idx]).pow(2).mean()
                loss_ent = ent.mean()
                loss = loss_pi + args.vf_coef * loss_v - args.ent_coef * loss_ent
                opt.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(policy.parameters(), args.max_grad_norm)
                opt.step()
                with torch.no_grad():
                    lr_diff = logp - flat["logp"][idx]
                    kls.append(((lr_diff.exp() - 1) - lr_diff).mean())
                    clipfracs.append(((ratio - 1).abs() > args.clip).float().mean())
                    pi_losses.append(loss_pi.detach())
                    v_losses.append(loss_v.detach())
                    ents.append(loss_ent.detach())

        sps = T * B / (time.time() - t0)
        stat = lambda xs: float(torch.stack(xs).mean())
        row = [
            update + 1,
            (update + 1) * T * B,
            round(float(scores.mean()), 2),
            round(float(scores.max()), 2),
            round(stat(pi_losses), 5),
            round(stat(v_losses), 5),
            round(stat(ents), 4),
            round(stat(kls), 5),
            round(stat(clipfracs), 4),
            opt.param_groups[0]["lr"],
            round(sps, 1),
        ]
        log.writerow(row)
        log_f.flush()
        if tb:
            tb.add_scalar("score/mean", row[2], row[1])
            tb.add_scalar("score/max", row[3], row[1])
            tb.add_scalar("loss/policy", row[4], row[1])
            tb.add_scalar("loss/value", row[5], row[1])
            tb.add_scalar("policy/entropy", row[6], row[1])
            tb.add_scalar("policy/approx_kl", row[7], row[1])
            tb.add_scalar("policy/clipfrac", row[8], row[1])
            tb.add_scalar("perf/env_steps_per_sec", row[10], row[1])
        print(
            f"update {update + 1}/{args.updates}  score {row[2]:.1f} (max {row[3]:.1f})  "
            f"kl {row[7]:.4f}  ent {row[6]:.2f}  {row[10]:.0f} steps/s"
        )

        ck = {
            "model": policy.state_dict(),
            "optim": opt.state_dict(),
            "update": update + 1,
            "best": max(best, row[2]),
            "obs_size": env.obs_size,
            "dims": dims,
            "config": vars(args),
        }
        if row[2] > best:
            best = row[2]
            torch.save(ck, out / "best.pt")
        if (update + 1) % args.save_every == 0 or update + 1 == args.updates:
            torch.save(ck, out / "latest.pt")

    (out / "config.json").write_text(json.dumps(vars(args), indent=2))
    log_f.close()
    if tb:
        tb.close()
    print(f"done — best training-episode mean score {best:.1f}; eval with: python gpu/eval.py --policy {out / 'best.pt'}")


if __name__ == "__main__":
    main()
