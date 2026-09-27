"""H-3: a map's draw ledger (h3_ledger.py output JSON) summed by stage: each
native by name (calls, draws) and each Lua reason (draws), in order of first
appearance, with the running total.

    python tools/civ6lab/h3_ledgersum.py runs/h3_session_<stamp>_ledger.json
"""
from __future__ import annotations

import collections
import json
import re
import sys


def main() -> int:
    rows = json.load(open(sys.argv[1], encoding="utf-8"))
    natives = collections.OrderedDict()
    lua = collections.OrderedDict()
    unmodelled = 0
    for kind, label, n, detail in rows:
        if kind == "native":
            key = re.sub(r"\(.*", "", label).replace("[not wrapped] ", "")
            key = re.sub(r"^(hills|mountains) ", "", key)
            if key.startswith("Fractal:BuildRidges"):
                key = "Fractal:BuildRidges " + ("(continental, 4 plates)" if "{}" in label else "(tectonic hills/mountains)")
            c, d = natives.get(key, (0, 0))
            natives[key] = (c + 1, d + (n or 0))
            if n is None:
                unmodelled += 1
        elif kind == "lua":
            for part in label.split(", "):
                name, _, cnt = part.rpartition(" x")
                lua[name] = lua.get(name, 0) + int(cnt)
        elif kind in ("gap", "tail") and n:
            natives["(unattributed gap)"] = (natives.get("(unattributed gap)", (0, 0))[0] + 1,
                                            natives.get("(unattributed gap)", (0, 0))[1] + n)
    tn = sum(d for _, d in natives.values())
    tl = sum(lua.values())
    print(f"native calls: {tn} draws")
    for k, (c, d) in natives.items():
        print(f"  {d:8d}  {c:5d} call(s)  {k}")
    print(f"Lua draws: {tl}")
    for k, d in lua.items():
        print(f"  {d:8d}  {k}")
    print(f"total {tn + tl}; natives without a model: {unmodelled}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
