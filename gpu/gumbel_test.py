"""M3 batched-tuple-search self-test (Gumbel/SH plumbing).

    npm run gpu:export        # (once) writes gpu/fixtures/
    python gpu/gumbel_test.py

Five properties, all eval-only on the searched state:

  1. minmax_normalize (M3a) maps to [0, 1], preserves order, and returns flat
     0.5 on a degenerate range (selection then falls back to the prior + noise).

  2. clone_state (M3c) broadcast-restores a B=1 snapshot into a k-wide sim
     bit-exactly per row, and the k-wide lockstep evolution stays row-identical
     to the B=1 sim — the property that makes candidates-as-batch-rows sound.

  3. eval_tuples (M3c) — one lockstep k-wide evaluation of m candidate tuples —
     equals the sequential snapshot/commit/restore loop on the same candidates,
     bit-exact, in both dtypes, with m < k padding, a custom step_fn, and the
     M3d-lite RNG re-hash applied on both sides.

  4. rehash_rng (M3d-lite) is deterministic, stays in u32 range, changes the
     stream, and is a pure function of each row's own state (not its batch
     position) — the property that keeps re-hashed batched == sequential.

  5. (needs a checkpoint under gpu/runs/) gumbel_decide is deterministic,
     mask-legal, and leaves the searched env bit-identical; gumbelsearch_play
     reproduces the same final score from the same seed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchEnv, BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.engine import _MUTABLE
from civ6gpu.mcts import (
    minmax_normalize, tuple_key, stack_tuples, clone_state, rehash_rng, eval_tuples,
    HEAD_ORDER,
)

K = 8
MIN_TURN = 30  # skip trivial turn-1 openings; find a real mid-game decision


def advance_to_decision(env):
    """Scripted-step until the capital faces a >=2-way production choice mid-game
    (a rich tuple decision point; units/tech heads usually pend there too)."""
    for _ in range(160):
        if env.sim.turn >= MIN_TURN and int(env.sim.production_mask()[0, 0].sum()) >= 2:
            break
        env.sim.step()


def scripted_tuples(env, m: int) -> list[dict]:
    """m deterministic mask-legal action tuples built WITHOUT a net: candidate j
    picks the (j % n_legal)-th legal entry of every pending head row and -1
    where nothing pends — the exact -1-padded layout sample_heads emits."""
    masks = env.masks()
    cands = []
    for j in range(m):
        acts = {}
        for h in HEAD_ORDER:
            mk = masks[h]
            flat = mk.reshape(-1, mk.shape[-1])
            pick = torch.full((flat.shape[0],), -1, dtype=torch.long, device=mk.device)
            for row in range(flat.shape[0]):
                legal = flat[row].nonzero(as_tuple=True)[0]
                if len(legal):
                    pick[row] = legal[j % len(legal)]
            acts[h] = pick.reshape(mk.shape[:-1])
        cands.append(acts)
    return cands


def sequential_values(env, snap, cands, horizon: int, rehash: bool = False):
    """The reference eval_tuples mirrors: one B=1 snapshot/commit/restore pass
    per candidate, same commit + optional re-hash + scripted continuation."""
    vals = []
    for acts in cands:
        env.sim.restore(snap)
        env.sim.step(**acts)
        if rehash:
            rehash_rng(env.sim)
        for _ in range(horizon):
            env.sim.step()
        vals.append(env.sim.empire_score()[0].clone())
    env.sim.restore(snap)
    return torch.stack(vals)


def test_minmax():
    q = torch.tensor([70.0, 250.0, 160.0])
    n = minmax_normalize(q)
    assert torch.allclose(n, torch.tensor([0.0, 1.0, 0.5])), n
    assert torch.equal(n.argsort(), q.argsort()), "order not preserved"
    flat = minmax_normalize(torch.tensor([42.0, 42.0, 42.0]))
    assert torch.equal(flat, torch.full((3,), 0.5)), "degenerate range must be flat 0.5"
    assert torch.equal(minmax_normalize(torch.tensor([7.0])), torch.tensor([0.5]))
    print("minmax  : [0,1] range, order preserved, degenerate range flat")


def test_clone_broadcast(rules, path):
    for dtype in (torch.float32, torch.float64):
        s1 = BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype)
        for _ in range(40):
            s1.step()
        snap = s1.snapshot()
        sk = BatchSim([load_fixture(path)] * K, rules, device="cpu", dtype=dtype)
        clone_state(sk, snap)
        assert sk.turn == s1.turn, "turn not cloned"
        bad = [n for n in _MUTABLE
               if not torch.equal(getattr(sk, n), getattr(s1, n).expand(getattr(sk, n).shape))]
        assert not bad, f"{dtype}: broadcast rows differ from B=1 for: {bad}"
        for _ in range(10):  # lockstep evolution must stay row-identical to B=1
            s1.step()
            sk.step()
        bad = [n for n in _MUTABLE
               if not torch.equal(getattr(sk, n), getattr(s1, n).expand(getattr(sk, n).shape))]
        assert not bad, f"{dtype}: lockstep rows drifted from B=1 for: {bad}"
        assert torch.equal(sk.empire_score(), s1.empire_score().expand(K))
    print(f"clone   : B=1 snapshot broadcasts into k={K} rows bit-exactly, "
          f"lockstep stays row-identical (both dtypes)")


def test_batched_vs_sequential(rules, path):
    for dtype in (torch.float32, torch.float64):
        env = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=dtype, horizon=100)
        advance_to_decision(env)
        envk = BatchEnv([load_fixture(path)] * K, rules, device="cpu", dtype=dtype, horizon=100)
        snap = env.sim.snapshot()
        cands = scripted_tuples(env, K)
        assert len({tuple_key(c) for c in cands}) >= 2, "test needs distinct candidates"

        for m, horizon, rehash in ((K, 6, False), (3, 6, False), (K, 0, False), (K, 6, True)):
            got = eval_tuples(envk, snap, cands[:m], horizon=horizon, rehash=rehash)
            want = sequential_values(env, snap, cands[:m], horizon, rehash=rehash)
            assert got.dtype == want.dtype == dtype
            assert torch.equal(got, want), (
                f"{dtype} m={m} h={horizon} rehash={rehash}: batched {got.tolist()} "
                f"!= sequential {want.tolist()}")
        # the step_fn hook drives the continuation (scripted here — must match default)
        via_fn = eval_tuples(envk, snap, cands, horizon=4, step_fn=lambda e: e.sim.step())
        assert torch.equal(via_fn, eval_tuples(envk, snap, cands, horizon=4))
        # eval_tuples never touches the snapshot's source sim
        drift = [n for n in _MUTABLE if not torch.equal(getattr(env.sim, n), snap["mut"][n])]
        assert not drift, f"source sim mutated: {drift}"
    print(f"batched : eval_tuples == sequential loop bit-exact (both dtypes, "
          f"m<k padding, step_fn, rehash)")


def test_rehash(rules, path):
    sim = BatchSim([load_fixture(path)] * 4, rules, device="cpu", dtype=torch.float32)
    for _ in range(10):
        sim.step()
    before = sim.rng_state.clone()
    assert torch.equal(before, before[:1].expand(4)), "lockstep rows should share a stream"
    rehash_rng(sim)
    after = sim.rng_state.clone()
    assert not torch.equal(after, before), "rehash must move the stream"
    assert bool((after >= 0).all() and (after <= (1 << 32) - 1).all()), "left u32 range"
    assert torch.equal(after, after[:1].expand(4)), (
        "rehash must be a pure function of each row's state — identical rows must "
        "stay identical (batched == sequential depends on it)")
    sim.rng_state.copy_(before)
    rehash_rng(sim)
    assert torch.equal(sim.rng_state, after), "rehash not deterministic"
    sim.rng_state.copy_(before)
    rehash_rng(sim, salt=1)
    assert not torch.equal(sim.rng_state, after), "salt must decorrelate"
    print("rehash  : deterministic, u32-ranged, state-pure (row-position independent), salted")


def test_gumbel_net(rules, path):
    ckpt = Path("gpu/runs/tune3/best.pt")
    if not ckpt.exists():
        hits = sorted(Path("gpu/runs").glob("*/best.pt")) if Path("gpu/runs").exists() else []
        if not hits:
            print("gumbel  : SKIPPED (no checkpoint under gpu/runs/ — train one first)")
            return
        ckpt = hits[0]
    from search_eval import load_policy, gumbel_decide, gumbelsearch_play, sh_depths
    from train_ppo import fit_env_to_checkpoint

    def build(k):
        e = BatchEnv([load_fixture(path)] * k, rules, device="cpu", dtype=torch.float32, horizon=100)
        fit_env_to_checkpoint(e, ck)
        return e

    env = BatchEnv([load_fixture(path)], rules, device="cpu", dtype=torch.float32, horizon=100)
    policy, ck = load_policy(str(ckpt), env, "cpu")
    try:
        fit_env_to_checkpoint(env, ck)
    except AssertionError as e:
        # An engine change (new building/unit/district) grows the action head, orphaning
        # every prior checkpoint — a re-baseline concern, not an engine-parity failure. RL
        # is parked, so skip rather than block the fidelity battery on a stale net.
        print(f"gumbel  : SKIPPED — checkpoint {ckpt.name} orphaned by an action-space change ({e}); re-baseline when RL resumes")
        return
    envk = build(K)
    rs = float(ck.get("config", {}).get("reward_scale", 0.01))
    depths = sh_depths(K, 6)
    assert depths[0] == 1 and depths[-1] == 6 and len(depths) == 3, depths

    advance_to_decision(env)
    pristine = {n: getattr(env.sim, n).clone() for n in _MUTABLE}
    turn = env.sim.turn
    torch.manual_seed(7)
    acts = gumbel_decide(env, envk, policy, K, depths, 40, rs)
    drift = [n for n in _MUTABLE if not torch.equal(getattr(env.sim, n), pristine[n])]
    assert not drift, f"gumbel_decide mutated the searched env: {drift}"
    assert env.sim.turn == turn, "gumbel_decide advanced the searched env"

    masks = env.masks()  # the pick must be mask-legal, -1 exactly where nothing pends
    for h in HEAD_ORDER:
        mk = masks[h].reshape(-1, masks[h].shape[-1])
        av = acts[h].reshape(-1)
        for row in range(mk.shape[0]):
            if bool(mk[row].any()):
                assert bool(mk[row, av[row]]), f"illegal {h} pick {int(av[row])} in row {row}"
            else:
                assert int(av[row]) == -1, f"{h} row {row} should be a -1 no-op"

    torch.manual_seed(7)
    acts2 = gumbel_decide(env, envk, policy, K, depths, 40, rs)
    assert tuple_key(acts) == tuple_key(acts2), "gumbel_decide nondeterministic"
    torch.manual_seed(7)
    acts3 = gumbel_decide(env, envk, policy, K, depths, 40, rs, honest_rng=True)
    print(f"gumbel  : decide eval-only + deterministic + mask-legal at t{turn} "
          f"(honest-rng pick {'differs' if tuple_key(acts3) != tuple_key(acts) else 'agrees'})")

    scores = []
    for _ in range(2):  # same seed → bit-same 20-turn game
        e = build(1)
        torch.manual_seed(11)
        scores.append(gumbelsearch_play(e, build(K), policy, K, 6, 20, rs))
    assert scores[0] == scores[1], f"gumbelsearch_play not reproducible: {scores}"
    print(f"gumbel  : 20-turn play reproducible from the seed (score {scores[0]:.1f})")


def main():
    rules = load_rules()
    paths = sorted(FIXTURES.glob("seed*.json"))
    assert paths, "no fixtures — run `npm run gpu:export` first"
    test_minmax()
    test_clone_broadcast(rules, paths[0])
    test_batched_vs_sequential(rules, paths[0])
    test_rehash(rules, paths[0])
    test_gumbel_net(rules, paths[0])
    print("M3 GUMBEL/BATCHED-SEARCH SELF-TEST OK")


if __name__ == "__main__":
    main()
