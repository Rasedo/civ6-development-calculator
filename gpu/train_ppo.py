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
from typing import TYPE_CHECKING

import torch

if TYPE_CHECKING:  # #51/S7.8f (task #55): the annotation-only import, so the
    from civ6gpu import MeleeEnv  # F821 lane sees the name without the cycle
import torch.nn as nn
from torch.distributions import Categorical

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchEnv, DuelEnv, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import P_MAX
from civ6gpu.env import UNIT_FEATURES

# #51/S0.3: the unit-action width comes from the exported enum (env.n_unit_acts),
# not a literal. The old `17` here and in env.py disagreed with the real 26-wide
# mask; nothing caught it because no battery lane builds a Policy.
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
        self.war = _layer(nn.Linear(hidden, dims.get("W", 0)), 0.01) if dims.get("W", 0) > 0 else None  # V-W1
        self.uproj = _layer(nn.Linear(hidden, uhidden), 2**0.5)
        self.umlp = nn.Sequential(
            _layer(nn.Linear(uhidden + UNIT_FEATURES, uhidden), 2**0.5), nn.Tanh(),
            _layer(nn.Linear(uhidden, dims["UA"]), 0.01),
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
            **({"war": self.war(h)} if self.war is not None else {}),
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


def load_compat(policy, state: dict) -> None:
    """V-W1: pre-war 5-head checkpoints load with a fresh war head.
    V-H1: pre-chop unit heads (16 cols) pad to 17 with a fresh row."""
    own = policy.state_dict()
    state = dict(state)
    for k, v in list(state.items()):
        if k in own and own[k].shape != v.shape and v.dim() > 0 and own[k].shape[0] > v.shape[0] and own[k].shape[1:] == v.shape[1:]:
            pad = own[k].clone()
            pad[: v.shape[0]] = v
            state[k] = pad
    missing, unexpected = policy.load_state_dict(state, strict=False)
    keep = [k for k in missing if not k.startswith("war.")]
    assert not keep and not unexpected, f"checkpoint mismatch: {keep} {unexpected}"


def fit_env_to_checkpoint(env, ck) -> bool:
    """Narrow the env's action surface to a checkpoint trained before a gated
    action-space widening — e.g. a 26-column production head from before
    V-P2's purchases. Flips the engine's purchase flag OFF when that exactly
    explains the width mismatch (returns True); any other mismatch still
    asserts. Scripted stepping ignores the flag, so matched-world baselines
    are unaffected."""
    ap_ck = int(ck["dims"]["AP"])
    narrowed = False
    if int(env.masks()["production"].shape[2]) != ap_ck and env.sim._rl_purchase_active:
        env.sim._rl_purchase_active = False
        narrowed = int(env.masks()["production"].shape[2]) == ap_ck
        if not narrowed:
            env.sim._rl_purchase_active = True
    ap_env = int(env.masks()["production"].shape[2])
    assert ap_env == ap_ck, f"checkpoint production head {ap_ck} != env {ap_env}"
    return narrowed


def _heads_in(out: dict):
    return [k for k in ("production", "tech", "civic", "units", "envoy", "war") if k in out]


def sample_heads(out: dict, masks: dict, greedy: bool = False):
    """→ (actions dict with -1 no-ops, joint logp [B], joint entropy [B])."""
    actions, logp, ent = {}, 0.0, 0.0
    for k in _heads_in(out):
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
    for k in _heads_in(out):
        dist, valid = _masked_dist(out[k], masks[k])
        lp = dist.log_prob(actions[k].clamp(min=0)) * valid
        en = dist.entropy() * valid
        if lp.dim() > 1:
            lp, en = lp.sum(1), en.sum(1)
        logp = logp + lp
        ent = ent + en
    return logp, ent


# --- training -----------------------------------------------------------------


def _pool(fix_dir):
    d = fix_dir or FIXTURES
    return [load_fixture(p) for p in sorted(d.glob("seed*.json"))], load_rules((fix_dir / "rules.json") if fix_dir else None) if fix_dir else load_rules()


def build_duel(batch: int, device: str, horizon: int, reward: str, fix_dir=None) -> DuelEnv:
    """C2d: the O=2 self-play env (fixtures round-robin like build_env)."""
    pool, rules = _pool(fix_dir)
    fixtures = [pool[i % len(pool)] for i in range(batch)]
    return DuelEnv(fixtures, rules, device=device, dtype=torch.float32, horizon=horizon, reward=reward)


def build_melee(batch: int, device: str, horizon: int, reward: str, seats: int, fix_dir=None) -> "MeleeEnv":
    """C3c: the O-seat FFA env."""
    from civ6gpu import MeleeEnv
    pool, rules = _pool(fix_dir)
    fixtures = [pool[i % len(pool)] for i in range(batch)]
    return MeleeEnv(fixtures, rules, device=device, dtype=torch.float32, horizon=horizon, reward=reward, seats=seats)


def stack_seat_masks(m0: dict, m1: dict) -> dict:
    """Seats ride the batch axis: [B, ...] + [B, ...] -> [2B, ...]."""
    return {k: torch.cat([m0[k], m1[k]], dim=0) for k in m0}


def split_actions(actions: dict, B: int) -> tuple[dict, dict]:
    a0 = {k: v[:B] for k, v in actions.items()}
    a1 = {k: v[B:] for k, v in actions.items()}
    # C3-prep: seat 1 acts through economics + research + UNITS (envoys
    # stay masked off — rivals have none)
    return (
        {"production": a0["production"], "tech": a0["tech"], "civic": a0["civic"], "units": a0["units"], "envoy": a0["envoy"]},
        {"production": a1["production"], "tech": a1["tech"], "civic": a1["civic"], "units": a1["units"], "war": a1.get("war")},
    )


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
    ap.add_argument("--horizon", type=int, default=None, help="episode turns (default: the fixtures' turnLimit — the game length)")
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--gamma", type=float, default=0.999)
    ap.add_argument("--gae-lam", type=float, default=0.95)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--minibatches", type=int, default=8)
    ap.add_argument("--hidden", type=int, default=256, help="policy/value trunk width")
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
    ap.add_argument("--seats", type=int, default=1, choices=(1, 2, 3, 4), help="C2d/C3c: 2 = DuelEnv; 3-4 = MeleeEnv FFA (needs --fixtures gpu/fixtures_o4 for seats 4)")
    ap.add_argument("--fixtures", default=None, help="C3c: alternate fixture pool dir (e.g. gpu/fixtures_o4 for 3-rival FFA worlds)")
    ap.add_argument("--anchor", default=None, help="C3c piKL: checkpoint whose policy anchors the learner (KL penalty on learner rows). MUST be same-world (obs width follows the rival count: an O=2 net cannot anchor an O=4 run - bootstrap an O=4 anchor first)")
    ap.add_argument("--anchor-kl", type=float, default=0.1, help="piKL coefficient")
    ap.add_argument("--distill", default=None, help="M3d: search-target file from gen_targets.py — adds an aux CE (policy toward the search pick) + value regression on those states")
    ap.add_argument("--distill-coef", type=float, default=0.5)
    ap.add_argument("--war-shaping", type=float, default=0.0, help="V-WS: dense siege gradient - reward city-HP damage (/100) and eliminations (x10) per seat symmetrically (duel mode)")
    ap.add_argument("--reward", default="dense", choices=("dense", "relative"), help="per-seat reward phase (seats=2)")
    ap.add_argument("--opponent", default="self", choices=("self", "ema", "pfsp"), help="C3a: seat-1 driver — the learner (naive), an EMA copy + uniform frozen mixture, or C3b PFSP (hardest-first pool matchmaking)")
    ap.add_argument("--ema-tau", type=float, default=0.99, help="opponent EMA decay per update")
    ap.add_argument("--pool-every", type=int, default=10, help="freeze a snapshot into the opponent pool every N updates")
    ap.add_argument("--pool-frac", type=float, default=0.2, help="fraction of updates whose opponent is a random frozen snapshot (else the EMA)")
    ap.add_argument("--seat-alternate", action="store_true", help="c3a-6: the learner swaps seats per update (both seats keep gradient under ema/pfsp pool pressure)")
    args = ap.parse_args()

    if args.horizon is None:  # single knob: the fixtures' turnLimit (TS TURN_LIMIT)
        _rules_path = (Path(args.fixtures) / "rules.json") if args.fixtures else FIXTURES / "rules.json"
        args.horizon = load_rules(_rules_path).turn_limit

    torch.manual_seed(args.seed)
    dev = args.device
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    duel = None
    melee = None
    fix_dir = Path(args.fixtures) if args.fixtures else None
    if args.seats == 2:
        duel = build_duel(args.batch, dev, args.horizon, args.reward, fix_dir)
        duel.war_shaping = args.war_shaping
        env = duel.env  # dims/obs probing go through the seat surface
    elif args.seats > 2:
        melee = build_melee(args.batch, dev, args.horizon, args.reward, args.seats, fix_dir)
        env = melee.env
    else:
        env = build_env(args.batch, dev, args.horizon)
    B, T = args.batch * args.seats, args.horizon  # seats ride the batch axis

    m0 = env.masks()
    dims = {
        "C": m0["production"].shape[1],
        "AP": m0["production"].shape[2],
        "NT": m0["tech"].shape[1],
        "NC": m0["civic"].shape[1],
        "S": m0["envoy"].shape[1],
        "W": m0.get("war", torch.zeros(1, 0)).shape[1],
        # #51/S0.3: the unit head's width comes from the LIVE mask, like every
        # other head — it was a hardcoded 17 against a 26-wide mask.
        "UA": m0["units"].shape[-1],
    }
    policy = Policy(env.obs_size, dims, hidden=args.hidden).to(dev)
    opt = torch.optim.Adam(policy.parameters(), lr=args.lr, eps=1e-5)
    # M3d: search-derived targets (distillation)
    targets = None
    if args.distill:
        targets = torch.load(args.distill, map_location=dev)
        print(f"M3d distillation: {targets['obs'].shape[0]} search targets from {args.distill}")

    # C3c piKL: an anchor policy whose action distribution regularizes the
    # learner (mixed-motive collapse guard for FFA runs).
    anchor = None
    if args.anchor:
        ck_a = torch.load(args.anchor, map_location=dev)
        anchor = Policy(env.obs_size, dims, hidden=ck_a.get("hidden", args.hidden)).to(dev)
        load_compat(anchor, ck_a["model"])  # pre-chop anchors pad like everything else
        for q in anchor.parameters():
            q.requires_grad_(False)
        print(f"piKL anchor: {args.anchor} (coef {args.anchor_kl})")

    # C3a: the opponent — an EMA copy of the learner plus a frozen pool.
    # C3b: the pool is PERSISTENT (out/pool/upd_N.pt survives resumes) and
    # PFSP mode samples it hardest-first by tracked learner win rates.
    opponent = None
    opp_pool: list[dict] = []
    pool_meta: list[dict] = []  # {"path", "games", "learner_wins"}
    pool_dir = out / "pool"
    if args.seats == 2 and args.opponent in ("ema", "pfsp"):
        opponent = Policy(env.obs_size, dims, hidden=args.hidden).to(dev)
        opponent.load_state_dict(policy.state_dict())
        for q in opponent.parameters():
            q.requires_grad_(False)
        pool_dir.mkdir(parents=True, exist_ok=True)
        for f in sorted(pool_dir.glob("upd_*.pt")):
            pool_meta.append({"path": str(f), "games": 0, "learner_wins": 0})
        if pool_meta:
            print(f"league pool: {len(pool_meta)} snapshots loaded from {pool_dir}")
    start_update, best = 0, float("-inf")
    if args.resume:
        ck = torch.load(args.resume, map_location=dev)
        load_compat(policy, ck["model"])
        if "optim" in ck:
            try:
                opt.load_state_dict(ck["optim"])
                # a padded head (war/chop vintage) loads structurally but with
                # NARROWER moment tensors - Adam then explodes at step time;
                # validate shapes and fall back to fresh state on any mismatch
                for group in opt.param_groups:
                    for prm in group["params"]:
                        st = opt.state.get(prm)
                        if st and "exp_avg" in st and st["exp_avg"].shape != prm.shape:
                            raise ValueError("moment shape mismatch")
            except ValueError:
                opt = torch.optim.Adam(policy.parameters(), lr=args.lr, eps=1e-5)
                print("optimizer state predates the current head layout - starting Adam fresh")
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
        "m_units": torch.zeros(T, B, P_MAX, dims["UA"], dtype=torch.bool, device=dev),
        "m_envoy": torch.zeros(T, B, dims["S"], dtype=torch.bool, device=dev),
        "m_war": torch.zeros(T, B, dims.get("W", 0), dtype=torch.bool, device=dev),
        "a_production": torch.zeros(T, B, dims["C"], dtype=torch.long, device=dev),
        "a_tech": torch.zeros(T, B, dtype=torch.long, device=dev),
        "a_civic": torch.zeros(T, B, dtype=torch.long, device=dev),
        "a_units": torch.zeros(T, B, P_MAX, dtype=torch.long, device=dev),
        "a_envoy": torch.zeros(T, B, dtype=torch.long, device=dev),
        "a_war": torch.zeros(T, B, dtype=torch.long, device=dev),
        "logp": torch.zeros(T, B, device=dev),
        "value": torch.zeros(T, B, device=dev),
        "reward": torch.zeros(T, B, device=dev),
    }

    for update in range(start_update, args.updates):
        t0 = time.time()
        if opponent is not None and update > start_update:
            with torch.no_grad():
                for q, p_ in zip(opponent.parameters(), policy.parameters()):
                    q.mul_(args.ema_tau).add_(p_, alpha=1.0 - args.ema_tau)
            if args.pool_every > 0 and update % args.pool_every == 0:
                snap = {k: v.detach().clone() for k, v in policy.state_dict().items()}
                opp_pool.append(snap)
                fp = pool_dir / f"upd_{update}.pt"
                torch.save({"model": snap, "dims": dims, "hidden": args.hidden, "update": update}, fp)
                pool_meta.append({"path": str(fp), "games": 0, "learner_wins": 0})
        if args.anneal_lr:
            frac = 1.0 - update / args.updates
            for g in opt.param_groups:
                g["lr"] = args.lr * frac

        if melee is not None:
            allobs = melee.reset(scramble=None if args.no_scramble else args.seed)
            obs = torch.cat([allobs[:, k] for k in range(args.seats)], dim=0)  # [OB, F]
        elif duel is not None:
            pair = duel.reset(scramble=None if args.no_scramble else args.seed)
            obs = torch.cat([pair[:, 0], pair[:, 1]], dim=0)  # [2B, F]
        else:
            obs = env.reset(scramble=None if args.no_scramble else args.seed)
        # C3a: pick this update's seat-1 driver — EMA (1-pool_frac) or a
        # random frozen snapshot (pool_frac), per update
        opp_net = None
        opp_pick = -1  # pool index driving this update (for PFSP stats)
        learner_seat = (update % 2) if (args.seat_alternate and opponent is not None) else 0
        if opponent is not None:
            opp_net = opponent
            if pool_meta and torch.rand(1).item() < args.pool_frac:
                if args.opponent == "pfsp":
                    # PFSP hardest-first: w_i ∝ (1 - learner win rate)^2,
                    # optimistic prior 0.5 for unplayed members
                    ws = []
                    for mmeta in pool_meta:
                        pwin = (mmeta["learner_wins"] + 1) / (mmeta["games"] + 2)
                        ws.append((1.0 - pwin) ** 2 + 1e-3)
                    wt = torch.tensor(ws)
                    opp_pick = int(torch.multinomial(wt / wt.sum(), 1).item())
                else:
                    opp_pick = int(torch.randint(len(pool_meta), (1,)).item())
                frozen = Policy(env.obs_size, dims, hidden=args.hidden).to(dev)
                ck_f = torch.load(pool_meta[opp_pick]["path"], map_location=dev)
                frozen.load_state_dict(ck_f["model"])
                for q in frozen.parameters():
                    q.requires_grad_(False)
                opp_net = frozen
        with torch.no_grad():
            for t in range(T):
                if melee is not None:
                    ufeat = torch.cat([env.unit_features(seat=k) for k in range(args.seats)], dim=0)
                    ms = melee.masks()
                    masks = {k: torch.cat([m[k] for m in ms], dim=0) for k in ms[0]}
                elif duel is not None:
                    ufeat = torch.cat([env.unit_features(seat=0), env.unit_features(seat=1)], dim=0)
                    m0, m1 = duel.masks()
                    masks = stack_seat_masks(m0, m1)
                else:
                    ufeat = env.unit_features()
                    masks = env.masks()
                if opp_net is not None:
                    # the learner holds rows [0:B) (seat 0) on even updates,
                    # rows [B:2B) (seat 1) when --seat-alternate flips it
                    Bh = args.batch
                    lo, hi = (0, Bh) if learner_seat == 0 else (Bh, 2 * Bh)
                    olo, ohi = (Bh, 2 * Bh) if learner_seat == 0 else (0, Bh)
                    pout_l = policy(obs[lo:hi], ufeat[lo:hi])
                    l_masks = {k: v[lo:hi] for k, v in masks.items()}
                    o_masks = {k: v[olo:ohi] for k, v in masks.items()}
                    l_actions, logp_l, _ = sample_heads(pout_l, l_masks)
                    oout = opp_net(obs[olo:ohi], ufeat[olo:ohi])
                    o_actions, _, _ = sample_heads(oout, o_masks)
                    if learner_seat == 0:
                        actions = {k: torch.cat([l_actions[k], o_actions[k]], dim=0) for k in l_actions}
                        logp = torch.cat([logp_l, torch.zeros_like(logp_l)], dim=0)
                        pout = {"value": torch.cat([pout_l["value"], torch.zeros_like(pout_l["value"])], dim=0)}
                    else:
                        actions = {k: torch.cat([o_actions[k], l_actions[k]], dim=0) for k in l_actions}
                        logp = torch.cat([torch.zeros_like(logp_l), logp_l], dim=0)
                        pout = {"value": torch.cat([torch.zeros_like(pout_l["value"]), pout_l["value"]], dim=0)}
                else:
                    pout = policy(obs, ufeat)
                    actions, logp, _ = sample_heads(pout, masks)
                buf["obs"][t] = obs
                buf["ufeat"][t] = ufeat
                for k in ("production", "tech", "civic", "units", "envoy") + (("war",) if "war" in actions else ()):
                    buf[f"m_{k}"][t] = masks[k]
                    buf[f"a_{k}"][t] = actions[k]
                buf["logp"][t] = logp
                buf["value"][t] = pout["value"]
                if melee is not None:
                    Bh = args.batch
                    seat_acts = []
                    for k in range(args.seats):
                        sl = {kk: v[k * Bh : (k + 1) * Bh] for kk, v in actions.items()}
                        seat_acts.append(
                            sl if k == 0 else {"production": sl["production"], "tech": sl["tech"], "civic": sl["civic"], "units": sl["units"]}
                        )
                    allobs, rewO, _ = melee.step(seat_acts)
                    obs = torch.cat([allobs[:, k] for k in range(args.seats)], dim=0)
                    reward = torch.cat([rewO[:, k] for k in range(args.seats)], dim=0)
                elif duel is not None:
                    a0, a1 = split_actions(actions, args.batch)
                    pair, rew2, _ = duel.step(seat0=a0, seat1=a1)
                    obs = torch.cat([pair[:, 0], pair[:, 1]], dim=0)
                    reward = torch.cat([rew2[:, 0], rew2[:, 1]], dim=0)
                else:
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

        if melee is not None:
            scores = torch.cat([env.sim.empire_score()] + [env.sim.rival_score(r) for r in range(args.seats - 1)], dim=0)
        elif duel is not None:
            scores = torch.cat([env.sim.empire_score(), env.sim.rival_score(0)], dim=0)
        else:
            scores = env.sim.empire_score()
        if duel is not None and opp_pick >= 0:
            margins = env.sim.empire_score() - env.sim.rival_score(0)
            pool_meta[opp_pick]["games"] += int(margins.numel())
            pool_meta[opp_pick]["learner_wins"] += int((margins > 0).sum())
        # C3a: with an external opponent, only the LEARNER's rows train —
        # opponent rows carry placeholder logp/value and must not update
        if opp_net is not None:
            Bh = args.batch
            lo, hi = (0, Bh) if learner_seat == 0 else (Bh, 2 * Bh)
            flat = {k: v[:, lo:hi].reshape(T * Bh, *v.shape[2:]) for k, v in buf.items()}
            f_adv, f_ret = adv[:, lo:hi].reshape(-1), ret[:, lo:hi].reshape(-1)
        else:
            flat = {k: v.reshape(T * B, *v.shape[2:]) for k, v in buf.items()}
            f_adv, f_ret = adv.reshape(-1), ret.reshape(-1)
        f_adv = (f_adv - f_adv.mean()) / (f_adv.std() + 1e-8)

        pi_losses, v_losses, ents, kls, clipfracs = [], [], [], [], []
        N = T * (args.batch if opp_net is not None else B)
        mb = N // args.minibatches
        for _ in range(args.epochs):
            perm = torch.randperm(N, device=dev)
            for i in range(0, N, mb):
                idx = perm[i : i + mb]
                pout = policy(flat["obs"][idx], flat["ufeat"][idx])
                masks = {k: flat[f"m_{k}"][idx] for k in _heads_in(pout)}
                acts = {k: flat[f"a_{k}"][idx] for k in _heads_in(pout)}
                logp, ent = evaluate_heads(pout, masks, acts)
                ratio = (logp - flat["logp"][idx]).exp()
                a = f_adv[idx]
                l1 = -a * ratio
                l2 = -a * ratio.clamp(1 - args.clip, 1 + args.clip)
                loss_pi = torch.max(l1, l2).mean()
                loss_v = 0.5 * (pout["value"] - f_ret[idx]).pow(2).mean()
                loss_ent = ent.mean()
                loss = loss_pi + args.vf_coef * loss_v - args.ent_coef * loss_ent
                if targets is not None:
                    tout = policy(targets["obs"], targets["ufeat"])
                    if "a_tech" in targets:  # full-tuple gumbel targets: CE over every head
                        t_logp, _ = evaluate_heads(
                            tout,
                            {h: targets[f"m_{h}"] for h in _heads_in(tout) if f"m_{h}" in targets},
                            {h: targets[f"a_{h}"] for h in _heads_in(tout) if f"a_{h}" in targets},
                        )
                        ce = -t_logp.mean()
                    else:  # legacy M1 capital-production targets (ablation only)
                        tdist, tvalid = _masked_dist(tout["production"], targets["m_production"])
                        ce = -(tdist.log_prob(targets["a_production"].unsqueeze(1).clamp(min=0))[:, 0] * tvalid[:, 0].float()).mean()
                    # value target is ABSOLUTE return-to-go in score units —
                    # meaningful only for a dense-reward value head. In
                    # relative (zero-sum) mode the head predicts ~0-mean
                    # relative returns and this term poisons the shared trunk
                    # (the c3a-12/13 collapse: identical damage at any coef),
                    # so distillation is CE-only there.
                    if args.reward == "dense":
                        vreg = 0.5 * (tout["value"] - targets["value"] / args.reward_scale).pow(2).mean()
                        loss = loss + args.distill_coef * (ce + vreg)
                    else:
                        loss = loss + args.distill_coef * ce
                if anchor is not None:
                    with torch.no_grad():
                        aout = anchor(flat["obs"][idx], flat["ufeat"][idx])
                    a_logp, _ = evaluate_heads(aout, {k: flat[f"m_{k}"][idx] for k in _heads_in(aout)}, {k: flat[f"a_{k}"][idx] for k in _heads_in(aout)})
                    # piKL surrogate: pull the learner's action logp toward the
                    # anchor's on the sampled actions (logp - a_logp >= 0 when
                    # the learner overcommits relative to the anchor)
                    loss = loss + args.anchor_kl * (logp - a_logp).clamp(min=0).mean()
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
                "seats": args.seats,
                "reward_mode": args.reward,
            "best": max(best, row[2]),
            "obs_size": env.obs_size,
            "dims": dims,
            "hidden": args.hidden,
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
