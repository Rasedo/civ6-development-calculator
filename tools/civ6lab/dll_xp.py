"""B-89 tail: the combat XP as GameCore_XP2_Release.dll codes it
(Rules_Combat 0x5197e0, called by every combat resolver 0x202580 ..
0x2082e0), shown against the lab's strike records (XP before / after and
the preview's strengths and EXPERIENCE_CHANGE).

    python tools/civ6lab/dll_xp.py [records ...]

The rule (unit against unit; fixed point 24.8):
  base = EXPERIENCE_COMBAT_RANGED 1 for the two ranged combat types (hashes
         0x2ec4ce4d / 0x4fc9163d, the attacker's strength read from its
         ranged / bombard getter), else EXPERIENCE_NOT_COMBAT_RANGED 2 (the
         attacker's Combat getter);
  k    = EXPERIENCE_KILL_BONUS 2 when the side killed its foe, else 1;
  attacker: ceil(ATTACKER_BONUS 1 + base + k x D / A) x its XP percent;
  defender: ceil(base + k x A / D) x its XP percent;
  each rounded UP at the 1/256 and capped at EXPERIENCE_MAXIMUM_ONE_COMBAT 10;
  a side at or past EXPERIENCE_MAX_BARB_LEVEL 2 fighting barbarians takes
  EXPERIENCE_BARB_SOFT_CAP 1; unit against district: DISTRICT_VS_UNIT 2
  (the district's side); a unit against a district 3 (10 on the capture).
  A, D: the two sides' strengths as the getters 0x56dc90 / 0x56e3e0 /
  0x56daa0 return them (the BASE column strengths of the unit's type, no
  modifiers, per the reading below).
"""
from __future__ import annotations

import glob
import json
import math
import pathlib
import sys

RUNS = pathlib.Path(__file__).parent / "runs"
# Units.xml: (Combat, RangedCombat, Bombard)
COLS = {"UNIT_BOMBER": (85, 0, 110), "UNIT_INFANTRY": (75, 0, 0), "UNIT_ANTIAIR_GUN": (70, 0, 0)}


def ceil256(v: float) -> int:
    return math.ceil(round(v * 256) / 256)


def xp(attacker: bool, base: int, A: int, D: int, kill: bool = False, pct: int = 0) -> int:
    k = 2 if kill else 1
    raw = (1 + base + k * D / A) if attacker else (base + k * A / D)
    return min(10, ceil256(ceil256(raw) * (100 + pct) / 100))


def main(argv: list[str]) -> int:
    paths = argv or sorted(glob.glob(str(RUNS / "c34w_strike_b89b_*.jsonl")))
    for path in paths:
        for line in open(path, encoding="utf-8"):
            r = json.loads(line)
            if r.get("kind") != "strike":
                continue
            pv = (r.get("preview") or [{}])[0]
            att, dfn = pv.get("ATTACKER", {}), pv.get("DEFENDER", {})
            b, a = r["before"], r["after"]
            gains = {k: (a[k]["type"], a[k]["xp"] - b[k]["xp"]) for k in a if k in b and a[k]["xp"] != b[k]["xp"]}
            dtype = next((v["type"] for k, v in a.items() if not k.startswith("0:") and v["type"] in COLS), None)
            rule = ""
            if dtype:
                A, D = max(COLS["UNIT_BOMBER"][1:]), COLS[dtype][0]
                rule = f"rule (A {A} bombard col, D {D} Combat col, pct 0): att {xp(True, 1, A, D)} def {xp(False, 1, A, D)}"
            print(pathlib.Path(path).stem, "seed", r.get("seed"), "type", pv.get("COMBAT_TYPE"),
                  "preview A", att.get("COMBAT_STRENGTH"), "D", dfn.get("COMBAT_STRENGTH"),
                  "XP preview att/def", att.get("EXPERIENCE_CHANGE"), dfn.get("EXPERIENCE_CHANGE"), "gains", gains, rule)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
