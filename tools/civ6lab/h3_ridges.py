"""H-3: BuildRidges / CreateRifts cases with the generator pinned on both
sides, read on the fractal's own array (w = 2^xe, h = 2^ye, so GetHeight(x, y)
is the array value a[x][y] itself).

    python tools/civ6lab/h3_ridges.py --host 127.0.0.3 --set counts

Runs h3_fractal.run_case per case; one JSON line per case to
runs/h3_ridges_<set>_<stamp>.jsonl.
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
from h3_fractal import run_case  # noqa: E402

B = dict(w=64, h=32, grain=2, flags={}, xe=6, ye=5, rift=0, plates=0, rflags={}, br=1, bf=0)
WX = {"FRAC_WRAP_X": 1}


def cases(which: str) -> list[dict]:
    out = []
    if which == "counts":
        for pl in (3, 4, 6):
            out.append({**B, "name": f"raw_p{pl}", "plates": pl})
        out.append({**B, "name": "raw_p4_rwx", "plates": 4, "rflags": WX})
        out.append({**B, "name": "raw_p4_fwx", "plates": 4, "flags": WX})
        out.append({**B, "name": "raw_p4_b10_5", "plates": 4, "br": 10, "bf": 5})
        out.append({**B, "name": "raw_p18", "plates": 18})
        out.append({**B, "name": "raw_p2", "plates": 2})
        out.append({**B, "name": "raw_p1", "plates": 1})
        out.append({**B, "name": "raw_p0", "plates": 0.0001})
    if which == "wrap":
        for i in range(24):
            out.append({**B, "name": f"rwx_p3_{i}", "plates": 3, "rflags": WX})
        for i in range(4):
            out.append({**B, "name": f"rwx_p6_{i}", "plates": 6, "rflags": WX})
        out.append({**B, "name": "rwy_p3", "plates": 3, "rflags": {"FRAC_WRAP_Y": 1}})
        out.append({**B, "name": "rwxy_p3", "plates": 3, "rflags": {"FRAC_WRAP_X": 1, "FRAC_WRAP_Y": 1}})
        out.append({**B, "name": "rpolar_p3", "plates": 3, "rflags": {"FRAC_POLAR": 1}})
        out.append({**B, "name": "rinv_p3", "plates": 3, "rflags": {"FRAC_INVERT_HEIGHTS": 1}})
        out.append({**B, "name": "rwx_p3_b10_5", "plates": 3, "rflags": WX, "br": 10, "bf": 5})
    if which == "map":
        out.append({**B, "name": "map_ridges_128x64_p18", "w": 128, "h": 64, "xe": -1, "ye": -1, "grain": 3,
                    "flags": WX, "plates": 18, "rflags": WX, "br": 10, "bf": 5})
    if which == "rifts":
        for g, rg in ((2, 1), (2, 2), (1, 3)):
            out.append({**B, "name": f"rift_raw_g{g}_r{rg}", "grain": g, "flags": {"FRAC_POLAR": 1}, "rift": rg})
        out.append({**B, "name": "rift_raw_g2_r2_plain", "grain": 2, "rift": 2})
        out.append({**B, "name": "rift_44x26_g2_r2", "w": 44, "h": 26, "grain": 2, "flags": {"FRAC_POLAR": 1},
                    "rift": 2})
        out.append({**B, "name": "rift_128x64_e7_6_wx", "w": 128, "h": 64, "xe": 7, "ye": 6, "grain": 2,
                    "flags": WX, "rift": 2})
        out.append({**B, "name": "rift_32x16_e5_4_inv", "w": 32, "h": 16, "xe": 5, "ye": 4, "grain": 1,
                    "flags": {"FRAC_INVERT_HEIGHTS": 1}, "rift": 1})
    if which == "invert":
        # plots past the array so bilinear reads reach a[fx][*] and a[*][fy]
        out.append({**B, "name": "inv_far_60x38_e5_4", "w": 60, "h": 38, "xe": 5, "ye": 4, "grain": 1,
                    "flags": {"FRAC_INVERT_HEIGHTS": 1}})
        out.append({**B, "name": "inv_far_polar_60x38_e5_4", "w": 60, "h": 38, "xe": 5, "ye": 4, "grain": 1,
                    "flags": {"FRAC_INVERT_HEIGHTS": 1, "FRAC_POLAR": 1}})
        out.append({**B, "name": "inv_far_wx_60x38_e5_4", "w": 60, "h": 38, "xe": 5, "ye": 4, "grain": 2,
                    "flags": {"FRAC_INVERT_HEIGHTS": 1, "FRAC_WRAP_X": 1}})
        out.append({**B, "name": "inv_far_wxy_40x20_e3_3", "w": 40, "h": 20, "xe": 3, "ye": 3, "grain": 1,
                    "flags": {"FRAC_INVERT_HEIGHTS": 1, "FRAC_WRAP_X": 1, "FRAC_WRAP_Y": 1}})
        out.append({**B, "name": "noinv_far_60x38_e5_4", "w": 60, "h": 38, "xe": 5, "ye": 4, "grain": 1})
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--set", required=True)
    p.add_argument("--json", default="", help="a JSON list of extra cases (fields over the raw 64x32 base)")
    a = p.parse_args()
    cs = cases(a.set)
    if a.json:
        cs += [{**B, **c} for c in json.loads(pathlib.Path(a.json).read_text(encoding="utf-8"))]
    t = Tuner(a.host).connect()
    out = HERE / "runs" / f"h3_ridges_{a.set}_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.jsonl"
    for c in cs:
        rec = run_case(t, c)
        with out.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        print(f"{c['name']}: state {rec['state_before']} draws {rec['draws']}")
    t.close()
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
