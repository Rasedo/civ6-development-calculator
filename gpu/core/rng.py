"""Counter-based RNG for batched simulation (splitmix64 on int64 tensors).

Stateless: every draw is a pure function of the keys you pass (seed, turn,
head, slot, …), so shuffling batch order, resuming mid-run, or replaying a
single game out of a batch all reproduce identical streams — the property
ordinary stateful generators lose the moment the batch composition changes.

torch has no uint64, so the arithmetic runs on int64 two's complement
(multiplication and addition wrap exactly like the unsigned versions);
only right shifts need care — they must be *logical*, emulated by masking
off the sign-extended bits.
"""

from __future__ import annotations

import torch


def _i64(v: int) -> int:
    """Reinterpret an unsigned 64-bit constant as int64."""
    return v - (1 << 64) if v >= (1 << 63) else v


_GOLDEN = _i64(0x9E3779B97F4A7C15)
_MULT1 = _i64(0xBF58476D1CE4E5B9)
_MULT2 = _i64(0x94D049BB133111EB)


def _lsr(x: torch.Tensor, n: int) -> torch.Tensor:
    """Logical (zero-fill) right shift on int64."""
    return (x >> n) & ((1 << (64 - n)) - 1)


def mix(x: torch.Tensor) -> torch.Tensor:
    """splitmix64 finalizer: a bijective avalanche on int64."""
    z = x + _GOLDEN
    z = (z ^ _lsr(z, 30)) * _MULT1
    z = (z ^ _lsr(z, 27)) * _MULT2
    return z ^ _lsr(z, 31)


def hash_keys(*keys) -> torch.Tensor:
    """Fold keys (int64 tensors or python ints, broadcastable) into one
    mixed int64 tensor. Each fold re-avalanches, so linear combinations of
    different keys cannot collide the way a plain weighted sum would."""
    h: torch.Tensor | None = None
    for k in keys:
        t = k if isinstance(k, torch.Tensor) else torch.tensor(k, dtype=torch.int64)
        t = t.to(torch.int64)
        h = mix(t) if h is None else mix(h + t)
    assert h is not None, "hash_keys needs at least one key"
    return h


def masked_choice(mask: torch.Tensor, *keys) -> torch.Tensor:
    """Uniform choice among the True entries of mask's last dim.

    mask: [..., N] bool. Returns [...] long — a uniformly random valid
    index (each candidate gets an iid 64-bit hash; argmax of iid uniforms
    is uniform over the valid set), or -1 where no entry is valid.
    """
    n = mask.shape[-1]
    idx = torch.arange(n, dtype=torch.int64, device=mask.device)
    h = hash_keys(*keys).to(mask.device)
    r = mix(h.unsqueeze(-1) + idx)
    r = torch.where(mask, r, torch.tensor(torch.iinfo(torch.int64).min, device=mask.device))
    choice = r.argmax(dim=-1)
    return torch.where(mask.any(dim=-1), choice, torch.full_like(choice, -1))


def uniform(shape_like: torch.Tensor, *keys) -> torch.Tensor:
    """Uniform floats in [0, 1) shaped like the broadcast of the keys."""
    h = hash_keys(*keys)
    bits = _lsr(h, 11).to(torch.float64)  # top 53 bits → exact double
    return (bits / float(1 << 53)).to(shape_like.dtype if shape_like.is_floating_point() else torch.float64)
