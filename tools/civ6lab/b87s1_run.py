"""civ6lab b87s1_run — B-87-S1, which buildings pay Pen, Brush and Voice's
era score. On the game as it stands (or --save loaded first): attach
--mod to seat --p (Pen, Brush and Voice's building clause,
`COMMEMORATION_CULTURAL_BUILDING_QUEST`; the seat must not be in a golden
age), then run --steps in order, each a `b87s1_place.lua` call —
`district:X:Y:DISTRICT`, `building:X:Y:BUILDING[:create|incomplete]` or
`turn` (one endturn) — reading the seat's era score and last moments
(`b87s1_state.lua`) before the first step and after each. One jsonl under
runs/.

    python tools/civ6lab/b87s1_run.py --save lab4_t150 --p 2 --steps district:16:9:DISTRICT_THEATER building:16:9:BUILDING_MARAE
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402
import lab  # noqa: E402
import game  # noqa: E402

HERE = pathlib.Path(__file__).parent


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--save")
    p.add_argument("--p", type=int, default=2)
    p.add_argument("--mod", default="COMMEMORATION_CULTURAL_BUILDING_QUEST", help="'' attaches nothing")
    p.add_argument("--steps", nargs="+", required=True)
    p.add_argument("--tag", default="run")
    a = p.parse_args(argv)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = lab.RUNS / f"ded_penbrush_{a.tag}_{stamp}.jsonl"
    fh = open(path, "w", encoding="utf-8", newline="\n")

    def rec(step: str, lines: list[str]) -> None:
        fh.write(json.dumps({"p": a.p, "mod": a.mod, "step": step, "lines": lines}, ensure_ascii=False) + "\n")
        fh.flush()
        for ln in lines:
            if ln.startswith(("turn=", "moment ", "district", "building", "attach")):
                print(f"  [{step}] {ln}", flush=True)

    if a.save and game.cmd_load(argparse.Namespace(host=a.host, port=4318, name=a.save, wait=600.0)) != 0:
        raise SystemExit(f"load of {a.save!r} on {a.host} failed")
    t = Tuner(a.host).connect()
    lp = lab.local_player(t)
    place = (HERE / "b87s1_place.lua").read_text(encoding="utf-8")
    state = (HERE / "b87s1_state.lua").read_text(encoding="utf-8").replace("ZP", str(a.p))

    def run_place(mode: str, x: str = "0", y: str = "0", **kw: str) -> list[str]:
        lua = place.replace("ZMODE", mode)
        for k, v in kw.items():
            lua = lua.replace(k, v)
        return t.run(lab.GC, lua.replace("ZP", str(a.p)).replace("ZX", x).replace("ZY", y), timeout=60)

    if a.mod:
        cap = t.run(lab.GC, f"local c = Players[{a.p}]:GetCities():GetCapitalCity(); print(c:GetX() .. ' ' .. c:GetY())")[-1].split()
        rec("attach", run_place("attach", cap[0], cap[1], ZMOD=a.mod))
    rec("before", t.run(lab.IG, state, timeout=60))
    for step in a.steps:
        f = step.split(":")
        if f[0] == "district":
            rec(step, run_place("district", f[1], f[2], ZDIST=f[3]))
        elif f[0] == "building":
            rec(step, run_place("building", f[1], f[2], ZBLD=f[3], ZHOW=f[4] if len(f) > 4 else "create"))
        elif f[0] == "turn":
            lab.advance(t, "endturn", lp, 300.0, lambda s: None)
        rec(step + " read", t.run(lab.IG, state, timeout=60))
    t.close()
    fh.close()
    print("->", path.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
