"""C-34-S1: one step of the patrol scene. Optionally requests one InGame
operation for a local unit (DEPLOY / REBASE / ...), waits for it to land,
then runs `air_preview.lua` for the attacker into each plot and appends the
records (tagged) to the run file, printing the summary.

    python tools/civ6lab/c34_step.py --host 127.0.0.2 --tag f1_on_P --op DEPLOY --unit 4456455 --at 35:47 \
        --attacker 6:10485779 --plots "35:47;34:47;34:46;34:48" --out tools/civ6lab/runs/air_patrol_X.jsonl
"""
from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner  # noqa: E402

HERE = pathlib.Path(__file__).parent


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.2")
    ap.add_argument("--tag", required=True)
    ap.add_argument("--op", default="")
    ap.add_argument("--unit", default="")
    ap.add_argument("--at", default="")
    ap.add_argument("--attacker", required=True)
    ap.add_argument("--plots", required=True)
    ap.add_argument("--mode", default="normal")
    ap.add_argument("--ct", default="1184946373")
    ap.add_argument("--out", required=True)
    ap.add_argument("--state", default="InGame")
    a = ap.parse_args()
    t = Tuner(a.host).connect()
    lines: list[str] = []
    if a.op:
        x, y = a.at.split(":")
        lua = (HERE / "scene2_op.lua").read_text(encoding="utf-8")
        for k, v in (("ZU", a.unit), ("ZOP", a.op), ("ZX", x), ("ZY", y), ("ZGO", "1")):
            lua = lua.replace(k, v)
        out = t.run("InGame", lua)
        lines += out
        print(" ".join(out))
        # the operation lands on the game's clock
        for _ in range(20):
            time.sleep(0.5)
            chk = (HERE / "scene2_op.lua").read_text(encoding="utf-8")
            for k, v in (("ZU", a.unit), ("ZOP", a.op), ("ZX", x), ("ZY", y), ("ZGO", "0")):
                chk = chk.replace(k, v)
            now = t.run("InGame", chk)[-1]
            if f'"at":"{x}:{y}"' in now or a.op != "DEPLOY" and a.op != "REBASE":
                break
        print("after:", now)
        lines.append(now)
    lua = (HERE / "air_preview.lua").read_text(encoding="utf-8")
    for k, v in (("ZA", a.attacker), ("ZPLOTS", a.plots), ("ZMODE", a.mode), ("ZCT", a.ct), ("ZTAG", a.tag)):
        lua = lua.replace(k, v)
    recs = t.run(a.state, lua, timeout=60)
    t.close()
    with open(a.out, "a", encoding="utf-8") as f:
        for ln in lines:
            if ln.startswith("{"):
                f.write(ln.replace('"kind":"op"', f'"kind":"op","tag":"{a.tag}"') + "\n")
        for ln in recs:
            f.write(ln + "\n")
    tmp = HERE / "runs" / "_c34_last.jsonl"
    tmp.write_text("\n".join(recs) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(HERE / "air_summary.py"), str(tmp)], check=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
