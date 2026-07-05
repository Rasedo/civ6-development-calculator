"""Single-agent search over the vectorized forward model (MCTS M1).

The score lever over a fixed base policy: at a decision point, use the
deterministic forward model (snapshot -> apply -> scripted rollout -> restore)
to look past the immediate reward and pick the production action with the best
few-turn outcome, instead of the myopic scripted choice.

M1 is an EXHAUSTIVE 1-ply search over ONE city's production head (the widest
lever), holding the other heads at the scripted policy during the rollout. The
scripted forward model is deterministic given the state (the RNG stream lives in
`rng_state`, which snapshot/restore round-trip), so a single rollout per action
yields that action's EXACT `horizon`-turn value — there is nothing to sample, and
scoring every legal action once and taking the argmax is optimal. That makes a
PUCT bandit pointless (and, unnormalized, actively wrong) at M1; PUCT with a net's
prior/value and RNG chance nodes is an M2 concern, when leaves become expensive
and stochastic. Eval-only: every rollout restores the snapshot, so the forward
model's parity is never perturbed.
"""
from __future__ import annotations


def _rollout_value(sim, city: int, action: int, horizon: int, snap: dict) -> float:
    """empire_score for game 0 after committing `action` in `city` this turn
    (other cities idle for the commit, then tech/civic/units/production all
    scripted) then `horizon` scripted turns. Restores the snapshot before
    returning, so the caller's state is untouched."""
    import torch

    pa = torch.full((1, sim.C), sim.IDLE, dtype=torch.long, device=sim.device)
    pa[0, city] = action
    sim.step(production=pa)  # commit the candidate; other heads follow the scripted policy
    for _ in range(horizon):
        sim.step()  # fully scripted rollout
    v = float(sim.empire_score()[0])
    sim.restore(snap)
    return v


def search_production(sim, city: int = 0, horizon: int = 15, value_fn=None):
    """Exhaustive 1-ply search over `city`'s legal production actions for a B=1
    sim. Scores every candidate by its `horizon`-turn scripted rollout and returns
    (best_action, {action: value}). Deterministic: the rollout is scripted so each
    value is exact; ties break to the lowest action index.

    value_fn(action) overrides the rollout leaf value (e.g. a trained value head),
    keeping the same exhaustive shape for M2's drop-in."""
    assert sim.B == 1, "M1 searches one game at a time"
    mask = sim.production_mask()[0, city]
    cands = mask.nonzero(as_tuple=True)[0].tolist()
    if not cands:
        return None, {}
    snap = sim.snapshot()
    leaf = value_fn if value_fn is not None else (lambda a: _rollout_value(sim, city, a, horizon, snap))
    vals = {a: leaf(a) for a in cands}
    best = max(cands, key=lambda a: (vals[a], -a))  # highest value; ties -> lowest index
    return best, vals


def greedy_production(sim, city: int = 0):
    """Myopic baseline: the production action with the best IMMEDIATE next-turn
    empire_score (horizon 0). What a 1-step-reward policy would pick."""
    return search_production(sim, city=city, horizon=0)
