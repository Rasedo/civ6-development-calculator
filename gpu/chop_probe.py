"""V-H1 micro-probe: replay-feed a rollout game at B=1 and print the
capital's production chain around its chop.

    python gpu/chop_probe.py [rng]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.env import N_UNIT_ACTS

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 2026006099


def decode_p(pe, C):
    if not pe:
        return None
    t_ = torch.full((1, C), -1, dtype=torch.long)
    for c, ch in pe:
        t_[0, int(c)] = int(ch)
    return t_


def main() -> None:
    roll = json.load(open(FIXTURES / "rollout.json", encoding="utf-8"))
    game = next(g for g in roll["games"] if g["rng"] == TARGET)
    fx = load_fixture(FIXTURES / f"seed{game['seed']}.json")
    sim = BatchSim([fx], load_rules(), device="cpu", dtype=torch.float64)
    by_turn = {e["t"]: e for e in game["actions"] if "t" in e}
    chop_turns = [e["t"] for e in game["actions"] if any(isinstance(a, list) and len(a) == 3 and a[1] == 16 for a in e.get("u", []))]
    print("chop turns:", chop_turns)
    if not chop_turns:
        return
    lo, hi = chop_turns[0] - 3, chop_turns[0] + 4
    last_turn = max(by_turn)
    for t in range(1, min(last_turn, hi) + 1):
        e = by_turn.get(t, {})
        units = None
        chop_tiles = []
        if e.get("u"):
            ua = torch.full((1, sim.p_alive.shape[1]), -1, dtype=torch.long)
            for tile, act, f in e["u"]:
                slot = int((sim.pciv_at if f else sim.pmil_at)[0, tile])
                if slot >= 0:
                    ua[0, slot] = act
                if act == 16:
                    chop_tiles.append(tile)
            units = ua
        show = lo <= t <= hi
        if show:
            work = sim._city_totals()[0][0, 0]
            msg = f"t{t} pre : prog {float(sim.progress[0, 0]):.3f} prod_y {float(work[1]):.3f} bank {float(sim.prod_bank[0, 0]):.3f}"
            for tile in chop_tiles:
                msg += (
                    f"\n   CHOP tile {tile}: ftr {int(sim.tile_ftr[0, tile])} fy {sim.feat_yields[0, tile].tolist()}"
                    f" stripped {bool(sim.feat_stripped[0, tile])} owner {int(sim.owner[0, tile])}"
                    f" imp {int(sim.improvement[0, tile])} done {int(sim.techs[0].sum() + sim.civics[0].sum())}"
                )
            print(msg)
        sim.step(
            production=decode_p(e.get("p"), sim.C),
            tech=torch.tensor([e.get("r", -1)], dtype=torch.long),
            civic=torch.tensor([e.get("c", -1)], dtype=torch.long),
            units=units,
        )
        if show:
            work = sim._city_totals()[0][0, 0]
            print(f"t{t} post: prog {float(sim.progress[0, 0]):.3f} prod_y {float(work[1]):.3f} score {float(sim.empire_score()[0]):.2f}")


if __name__ == "__main__":
    main()
