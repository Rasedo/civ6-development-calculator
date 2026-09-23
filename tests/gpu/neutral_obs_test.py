"""THE NEUTRAL OBSERVATION is a plain value.

`gpu/core/neutral.py` hands the decision server one dict per game per seat.
Any engine must be able to emit the same value, so it carries no tensor and
no sim: Python ints and bools only, every field `shared/decide.schema.json`
names and nothing else, in the schema's order, and a city named by the
CENTRE tile of one of the seat's living cities (-1 where none).

Driven for a stretch first, over two worlds at once, so the seats hold
cities and the buy candidates are live rather than all -1.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "policy"))
from core import load_rules, load_fixture, fixture_paths
from core.env import BatchEnv
from core import neutral, records

TURNS = 40


def plain(v) -> bool:
    """True when `v` is built of dicts, lists, ints and bools alone."""
    if isinstance(v, dict):
        return all(isinstance(k, str) and plain(x) for k, x in v.items())
    if isinstance(v, list):
        return all(plain(x) for x in v)
    return type(v) in (int, bool)


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()[:2]
    env = BatchEnv([load_fixture(p) for p in paths], rules, device="cpu", dtype=torch.float64)
    sim = env.sim
    records.drive_batched(env, TURNS, seats=list(range(sim.n_majors)))
    live = 0
    for row in range(sim.n_majors):
        nobs = neutral.seat_obs(sim, row)
        assert len(nobs) == sim.B, f"seat {row}: {len(nobs)} observations for {sim.B} games"
        for b, ob in enumerate(nobs):
            assert plain(ob), f"seat {row} game {b}: the observation holds a non-plain value"
            assert json.loads(json.dumps(ob)) == ob, f"seat {row} game {b}: JSON does not round-trip it"
            assert list(ob) == list(neutral.SEAT_GROUPS), f"seat {row} game {b}: groups {list(ob)}"
            centres = {int(c) for c, a in zip(sim.city_center[b, row].tolist(), sim.city_alive[b, row].tolist()) if a}
            for g, fields in neutral.SEAT_GROUPS.items():
                assert list(ob[g]) == [f for f, _k in fields], f"seat {row} game {b}: {g} fields out of schema order"
                for f, kind in fields:
                    v = ob[g][f]
                    if kind == "bool":
                        assert type(v) is bool, f"{g}.{f} = {v!r} is not a bool"
                    else:
                        assert type(v) is int, f"{g}.{f} = {v!r} is not an int"
                    if kind == "city":
                        assert v == -1 or v in centres, f"seat {row} game {b}: {g}.{f} = {v} names no living city"
            live += int(ob["buy"]["spawn_city"] >= 0)
    assert live > 0, "no seat held a city — the scene never exercised the city fields"
    print(f"NEUTRAL OBS OK ({sim.n_majors} seats x {sim.B} games after {TURNS} turns, {live} with a spawn city)")


if __name__ == "__main__":
    main()
