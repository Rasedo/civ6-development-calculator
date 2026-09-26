"""H-3: the map generator's random stream, fitted and then predicted.

    python tools/civ6lab/h3_verify.py --host 127.0.0.3 [--tag x]

In GameCore_Tuner: four TerrainBuilder.GetRandomNumber(32768) draws fix the
LCG state (h3_fit.find_state), the map seed is read back
(MapConfiguration RANDOM_SEED), the step count from the seed to that state is
found, then a held-out battery of ranges (odd, powers of two, 1, 0, 65536,
above 65536, negative) is PREDICTED first and drawn second. One JSONL record
to tools/civ6lab/runs/h3_verify_<stamp>.jsonl.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner  # noqa: E402
from h3_fit import M32, distance, find_state, step  # noqa: E402

GC = "GameCore_Tuner"
HELD_OUT = [7, 3, 2, 1, 5, 100, 101, 999, 4, 8, 16, 1024, 32767, 32768, 32769, 65535, 65536, 0,
            65537, 100000, 1000000, 131072, 6, 11, 13, 17, 19, 23, 12, 60, 255, 256, 257, 4096, 5000,
            -1, -7, 2, 3, 9]


def predict(s: int, ranges: list[int]) -> tuple[list[int], int]:
    """draws for `ranges` from state s, the map generator's law: every call
    steps the LCG once, and the draw is ((s' >> 16) * (range & 0xFFFF)) >> 16"""
    out = []
    for r in ranges:
        s = step(s)
        out.append(((s >> 16) * (r & 0xFFFF)) >> 16)
    return out, s


def draw_lua(ranges: list[int]) -> str:
    return ("local R = {" + ",".join(map(str, ranges)) + "}\nlocal o = {}\n"
            "for i = 1, #R do o[#o+1] = tostring(TerrainBuilder.GetRandomNumber(R[i], 'civ6lab h3')) end\n"
            "print('D ' .. table.concat(o, ' '))\n"
            "print('SEED ' .. tostring(MapConfiguration.GetValue('RANDOM_SEED')) .. ' ' .. tostring(Game.GetRandomSeed()))")


def run(t: Tuner, ranges: list[int]) -> tuple[list[int], int, int]:
    lines = t.run(GC, draw_lua(ranges))
    d = next(ln for ln in lines if ln.startswith("D "))
    s = next(ln for ln in lines if ln.startswith("SEED "))
    _, ms, gs = s.split()
    return [int(x) for x in d.split()[1:]], int(ms), int(gs)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--tag", default="")
    a = p.parse_args()
    t = Tuner(a.host).connect()
    fit, map_seed, game_seed = run(t, [32768] * 4)
    states = find_state(fit, 1103515245, 12345)
    rec = {"tag": a.tag, "map_seed": map_seed, "sync_seed": game_seed, "fit_draws": fit, "states": states}
    if len(states) != 1:
        print("no unique state", rec)
        return 1
    s1 = states[0]
    s_end = s1
    for _ in range(3):
        s_end = step(s_end)
    # the state before the first fit draw is s1 stepped back once: count from the seed to s1
    n = distance(map_seed & M32, s1, 1103515245, 12345, 1 << 31)
    rec["steps_seed_to_first_fit_draw"] = n
    rec["draws_before_probe"] = None if n is None else n - 1
    want, s_after = predict(s_end, HELD_OUT)
    got, _, _ = run(t, HELD_OUT)
    rec.update(held_out_ranges=HELD_OUT, predicted=want, drawn=got,
               hits=sum(x == y for x, y in zip(want, got)), n=len(HELD_OUT))
    # a tail after the battery: does the state line up after the zero-range calls?
    tail_r = [32768] * 3
    want2, _ = predict(s_after, tail_r)
    got2, _, _ = run(t, tail_r)
    rec.update(tail_predicted=want2, tail_drawn=got2)
    t.close()
    print(json.dumps(rec))
    for r, x, y in zip(HELD_OUT, want, got):
        if x != y:
            print(f"MISS range {r}: predicted {x} drawn {y}")
    out = HERE / "runs" / f"h3_verify_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.jsonl"
    out.write_text(json.dumps(rec) + "\n", encoding="utf-8")
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
