"""A unit spawned into a RECLAIMED slot gets its own movement pool — #51/S7.2.

    python gpu/spawn_reclaim_test.py

WHY THIS EXISTS. Every spawn site computed the new unit's movement with

    _m = self._full_mp(pre)[rows, slot]     # READS <pre>_emb
    ...
    self.<pre>_emb[rows, slot] = False      # ...cleared AFTER

`_full_mp` overrides an EMBARKED unit's pool to the flat EMBARK_MOVES, so a
unit spawned into the slot of one that drowned inherited the dead unit's
embarked flag and started with 2 MP instead of its type's moves plus any golden
dedication. The line's own comment already said "a fresh (possibly reclaimed)
slot is ashore" — the intent was right and only the ORDER was wrong.

TS cannot have this bug: `spawnUnit` builds a NEW object and writes
`movesLeft: def.moves + goldenMoveBonus(...)`, with no embark term anywhere and
`embarked` left undefined. So the GPU was simply wrong.

IT NEEDS SLOT REUSE TO APPEAR, which is why the plain parity gate never saw it
and the FORCED-COMPACTION gate did (seed 9133 t161: a rival missionary spawned
with mp_full 2 instead of 4, walked one tile short, and the whole game diverged
from there). Found while hunting a red that #51/S7.1 exposed but did not cause.

All four spawn paths had it. The barbarian pool never cleared `emb` at ALL —
the sibling the guard was missing from entirely ([[new-class-invariant-sweep]]).
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES


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
    counter = {"u": "next_slot", "v": "v_next"}.get(pre, "p_next")
    slot = int(getattr(sim, counter)[0])
    getattr(sim, f"{pre}_alive")[0, slot] = False
    getattr(sim, f"{pre}_emb")[0, slot] = True  # the drowned occupant's flag
    getattr(sim, f"{pre}_mp")[0, slot] = 0
    getattr(sim, f"{pre}_mp_full")[0, slot] = 0
    return slot


def free_land(sim) -> int:
    for t in range(sim.T):
        if bool(sim.passable[0, t]) and int(sim.occ_mil[0, t]) < 0 and int(sim.occ_civ[0, t]) < 0:
            return t
    raise AssertionError("no free land tile")


def check(sim, pre: str, slot: int, label: str) -> None:
    mp = int(getattr(sim, f"{pre}_mp")[0, slot])
    full = int(getattr(sim, f"{pre}_mp_full")[0, slot])
    typ = int(getattr(sim, f"{pre}_type")[0, slot])
    want = int(sim._p_moves[typ])
    emb = int(getattr(sim, f"{pre}_emb")[0, slot])
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
    # --- rival: the path the forced-compaction gate actually caught ----------
    sim = build()
    slot = poison_slot(sim, "v")
    tile = free_land(sim)
    mask = torch.zeros(sim.B, dtype=torch.bool)
    mask[0] = True
    at = torch.full((sim.B,), tile, dtype=torch.long)
    sim._spawn_rival_civ(mask, at, 0, type_idx=sim._missionary_idx,
                         charges=torch.full((sim.B,), 3, dtype=torch.long))
    check(sim, "v", slot, "rival civilian (missionary)")

    # --- player: the same ordering, latent only because of task #52 ----------
    sim2 = build()
    slot2 = poison_slot(sim2, "p")
    tile2 = free_land(sim2)
    m2 = torch.zeros(sim2.B, dtype=torch.bool)
    m2[0] = True
    sim2._spawn_player(m2, torch.full((sim2.B,), tile2, dtype=torch.long),
                       torch.full((sim2.B,), 2, dtype=torch.long))  # WARRIOR
    check(sim2, "p", slot2, "player military (warrior)")

    print("SPAWN RECLAIM OK — a reclaimed slot hands on no drowned unit's movement pool")


if __name__ == "__main__":
    main()
