"""B-86: the emergency term in an air strike's sub-combats. In
`b86s0_nuclear_t244` (EMERGENCY_NUCLEAR, seat 0 the target, every other major a
member) seat 0's Bomber strikes an Infantry covered by an adjacent Anti-Air
Gun, once with both units a MEMBER's (--member) and once a city-state's at war
with seat 0 (--minor, not a member); each arm: clear the two plots, create the
pair (b89b_rig.lua), preview (air_preview.lua) and fire with seeds
(c34w_strike.py). Appends the previews to runs/b86b_burst.jsonl.

    python tools/civ6lab/b86b_run.py --member 6 --minor 10 --inf 30:45 --aa 30:46 --bomber 0:4587537
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import h4  # noqa: E402
import pair_run  # noqa: E402

HERE = pathlib.Path(__file__).parent
REC = HERE / "runs" / "b86b_burst.jsonl"


def lua(t, state, file, tok):
    return pair_run.run_lua(t, state, pair_run.snippet(file, None, tok), timeout=40)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.4")
    p.add_argument("--member", type=int, default=6)
    p.add_argument("--minor", type=int, default=10)
    p.add_argument("--inf", default="30:45")
    p.add_argument("--aa", default="30:46")
    p.add_argument("--bomber", default="0:4587537")
    p.add_argument("--seeds", default="1001,2002")
    p.add_argument("--arms", default="member,minor")
    a = p.parse_args()
    for arm in a.arms.split(","):
        owner = a.member if arm == "member" else a.minor
        h4.guard(170, "b86b " + arm)
        t = h4.connect(a.host)
        cl = lua(t, "GameCore", "b86b_clear.lua", {"ZPLOTS": f"{a.inf};{a.aa}"})
        rig = lua(t, "GameCore", "b89b_rig.lua",
                  {"ZSPEC": f"{owner}:UNIT_INFANTRY@{a.inf};{owner}:UNIT_ANTIAIR_GUN@{a.aa}"})
        pv = pair_run.run_lua(t, "InGame", (HERE / "air_preview.lua").read_text(encoding="utf-8")
                              .replace("ZA", a.bomber).replace("ZPLOTS", a.inf).replace("ZMODE", "normal")
                              .replace("ZCT", "1184946373").replace("ZTAG", "b86b_" + arm), timeout=40)
        t.close()
        rec = {"arm": arm, "owner": owner, "clear": cl["json"], "rig": rig["json"], "preview": pv["json"]}
        with REC.open("a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        for r in pv["json"]:
            for b in ("ATTACKER", "DEFENDER", "ANTI_AIR"):
                B = r.get(b, {})
                texts = {k: v for k, v in B.items() if str(k).startswith("PREVIEW_TEXT")}
                print(arm, b, "id", B.get("ID"), "S", B.get("COMBAT_STRENGTH"), "to", B.get("DAMAGE_TO"),
                      "from", B.get("DAMAGE_FROM"), "mod", B.get("STRENGTH_MODIFIER"), json.dumps(texts, ensure_ascii=False))
        subprocess.run([sys.executable, str(HERE / "c34w_strike.py"), "--host", a.host, "--bomber", a.bomber,
                        "--patrol", f"{owner}:1", "--at", a.inf, "--seeds", a.seeds, "--seats", f"0,{owner}",
                        "--tag", "b86b_" + arm], timeout=175)
    return 0


if __name__ == "__main__":
    sys.exit(main())
