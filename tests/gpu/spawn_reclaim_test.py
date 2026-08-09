"""A unit spawned into a RECLAIMED slot gets its own movement pool.

    python tests/gpu/spawn_reclaim_test.py

A spawn site computes the new unit's movement with `_full_mp(pre)`, which
overrides an EMBARKED unit's pool to the flat EMBARK_MOVES. Every pool must
therefore clear `<pre>_emb` BEFORE that read: a slot reclaimed from a unit that
drowned still carries the dead occupant's flag, and a unit spawned into it would
start on the embark pool instead of its type's moves plus any golden dedication.

TS cannot express this: `spawnUnit` builds a NEW object with
`movesLeft: def.moves + goldenMoveBonus(...)` — no embark term anywhere and
`embarked` left undefined.

It takes SLOT REUSE to appear, so the plain parity gate cannot see it and the
forced-compaction gate can. This lane poisons the next slot a pool will hand
out and spawns into it directly.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))

from core import BatchSim, load_rules, load_fixture, FIXTURES


def build():
    rules = load_rules()
    sim = BatchSim([load_fixture(sorted(FIXTURES.glob("seed*.json"))[0])], rules,
                   device="cpu", dtype=torch.float64)
    for _ in range(20):
        sim.step()
    return sim


def poison_slot(sim, pre: str) -> int:
    """Leave a DROWNED unit's residue in the next slot the pool will hand out:
    dead, but still flagged embarked — exactly what a reclaim leaves behind."""
    counter = {"barb": "next_slot", "civ": "civ_unit_next"}.get(pre, "seat0_unit_next")
    slot = int(getattr(sim, counter)[0])
    getattr(sim, f"{pre}_unit_alive")[0, slot] = False
    getattr(sim, f"{pre}_unit_emb")[0, slot] = True  # the drowned occupant's flag
    getattr(sim, f"{pre}_unit_mp")[0, slot] = 0
    getattr(sim, f"{pre}_unit_mp_full")[0, slot] = 0
    return slot


def free_land(sim) -> int:
    for t in range(sim.T):
        if bool(sim.passable[0, t]) and int(sim.military_at[0, t]) < 0 and int(sim.civilian_at[0, t]) < 0:
            return t
    raise AssertionError("no free land tile")


def check(sim, pre: str, slot: int, label: str) -> None:
    mp = int(getattr(sim, f"{pre}_unit_mp")[0, slot])
    full = int(getattr(sim, f"{pre}_unit_mp_full")[0, slot])
    typ = int(getattr(sim, f"{pre}_unit_type")[0, slot])
    want = int(sim._type_moves[typ])
    emb = int(getattr(sim, f"{pre}_unit_emb")[0, slot])
    print(f"  {label}: type={typ} mp={mp} mp_full={full} (type's moves={want}) emb={emb}")
    assert emb == 0, (
        f"{label}: the spawned unit is still flagged EMBARKED — a reclaimed "
        f"slot handed on its drowned occupant's flag"
    )
    assert full >= want, (
        f"{label}: mp_full={full} is BELOW the type's own moves ({want}) — the "
        f"unit inherited the flat EMBARK_MOVES of the drowned unit whose slot "
        f"it took (#51/S7.2: clear `emb` BEFORE _full_mp reads it)"
    )
    assert mp == full, f"{label}: a fresh unit starts on a full pool ({mp} != {full})"


def main() -> None:
    # --- the civ pool -------------------------------------------------------
    sim = build()
    slot = poison_slot(sim, "civ")
    tile = free_land(sim)
    mask = torch.zeros(sim.B, dtype=torch.bool)
    mask[0] = True
    at = torch.full((sim.B,), tile, dtype=torch.long)
    sim._spawn_seat_civilian(mask, at, 0, type_idx=sim._missionary_idx,
                         charges=torch.full((sim.B,), 3, dtype=torch.long))
    check(sim, "civ", slot, "civ civilian (missionary)")

    # --- the seat-0 pool, same ordering rule --------------------------------
    sim2 = build()
    slot2 = poison_slot(sim2, "seat0")
    tile2 = free_land(sim2)
    m2 = torch.zeros(sim2.B, dtype=torch.bool)
    m2[0] = True
    sim2._spawn_seat0(m2, torch.full((sim2.B,), tile2, dtype=torch.long),
                       torch.full((sim2.B,), 2, dtype=torch.long))  # WARRIOR
    check(sim2, "seat0", slot2, "seat-0 military (warrior)")

    print("SPAWN RECLAIM OK — a reclaimed slot hands on no drowned unit's movement pool")


if __name__ == "__main__":
    main()
