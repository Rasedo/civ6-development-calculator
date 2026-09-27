"""The map generator's random stream: Civ 5's CvRandom.

s' = 1103515245 s + 12345 mod 2^32 on every call (also for a range of 0),
draw = ((s' >> 16) * (range & 0xFFFF)) >> 16, a fractional range truncated
toward zero. Seeded with RANDOM_SEED (as uint32) right before GenerateMap.
"""
from __future__ import annotations

M32 = 0xFFFFFFFF
A = 1103515245
C = 12345


class Rng:
    """the stream plus its ledger: every Lua draw as ('lua', range, value,
    reason), every native block as ('native', name, count)"""

    def __init__(self, seed: int):
        self.s = seed & M32
        self.n = 0
        self.ledger: list[tuple] = []

    def get(self, r) -> int:
        self.s = (A * self.s + C) & M32
        self.n += 1
        return ((self.s >> 16) * (int(r) & 0xFFFF)) >> 16

    def lua_draw(self, r, reason) -> int:
        v = self.get(r)
        self.ledger.append(("lua", int(r), v, reason))
        return v

    def native(self, name: str, start: int) -> None:
        """record the draws a native took since `start` (rng.n before it)"""
        self.ledger.append(("native", name, self.n - start))
