"""H-3: probe Havok Script's table.sort in the live game over the tuner.

    python tools/civ6lab/h3_sortprobe.py --host 127.0.0.3 --states FrontEnd [--states GameCore_Tuner,InGame]

Every case is a table of records {id = position, k = key} sorted with one of
the comparator shapes the map scripts use; the comparator is wrapped to log
every call (the two records' ids, in call order). Printed back: the output
permutation of ids and the call trace. Cases: distinct keys (sizes 2..120),
all keys equal (2..120), keys from a small alphabet (ties everywhere) under
`a.k > b.k` and `a.k < b.k`, two-level keys under a full two-level
comparator and under one comparing the first level only, and one table of
numbers (0 and -0, equal under <) under the default comparator.
Record: runs/h3_sort_<stamp>.json (read by h3_hksort.py).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import random
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
from tuner import Tuner  # noqa: E402


def cases() -> list[dict]:
    rng = random.Random(20260927)
    out = []
    for n in range(2, 121):
        ks = list(range(n))
        rng.shuffle(ks)
        out.append({"name": f"distinct_gt_{n}", "cmp": "gt", "keys": ks})
    for n in range(2, 121):
        out.append({"name": f"equal_gt_{n}", "cmp": "gt", "keys": [7] * n})
    for n in list(range(2, 41)) + list(range(41, 121, 3)):
        for alpha in (2, 3, 5):
            out.append({"name": f"alpha{alpha}_gt_{n}", "cmp": "gt", "keys": [rng.randrange(alpha) for _ in range(n)]})
        out.append({"name": f"alpha3_lt_{n}", "cmp": "lt", "keys": [rng.randrange(3) for _ in range(n)]})
        out.append({"name": f"alphan4_gt_{n}", "cmp": "gt",
                    "keys": [rng.randrange(max(2, n // 4)) for _ in range(n)]})
    for n in (5, 9, 17, 33, 64, 100, 120):
        ks = [[rng.randrange(3), rng.randrange(3)] for _ in range(n)]
        out.append({"name": f"two_gt2_{n}", "cmp": "gt2", "keys": ks})
        out.append({"name": f"two_gt1of2_{n}", "cmp": "gt1of2", "keys": ks})
    # resource-like: 500 / (adj * 3.75) + integer, as ResourceGenerator scores
    for n in (46, 72, 78, 84, 104, 117, 144):
        ks = [round(500 / ((rng.randrange(2) + 1) * 3.75) + rng.randrange(100), 9) for _ in range(n)]
        out.append({"name": f"score_gt_{n}", "cmp": "gt", "keys": ks})
    return out


def lua_value(v) -> str:
    if isinstance(v, list):
        return "{" + ",".join(lua_value(x) for x in v) + "}"
    return repr(v)


LUA_HEAD = """
local CMP = {
  gt = function(a, b) return a.k > b.k end,
  lt = function(a, b) return a.k < b.k end,
  gt2 = function(a, b) if a.k[1] ~= b.k[1] then return a.k[1] > b.k[1] end return a.k[2] > b.k[2] end,
  gt1of2 = function(a, b) return a.k[1] > b.k[1] end,
}
local function run(name, cmp, keys)
  local t = {}
  for i, k in ipairs(keys) do t[i] = {id = i, k = k} end
  local calls = {}
  local f = CMP[cmp]
  local ok, err = pcall(table.sort, t, function(a, b) calls[#calls + 1] = a.id .. "," .. b.id; return f(a, b) end)
  local perm = {}
  for i = 1, #t do perm[i] = t[i].id end
  print("P " .. name .. " " .. table.concat(perm, " ") .. (ok and "" or (" ERR " .. tostring(err))))
  local s = table.concat(calls, ";")
  for p = 1, #s, 900 do print("T " .. name .. " " .. string.sub(s, p, p + 899)) end
end
"""

LUA_INFO = """
print("I sort " .. tostring(table.sort))
print("I debug " .. tostring(debug) .. " " .. tostring(debug and debug.getinfo))
if debug and debug.getinfo then
  local ok, d = pcall(debug.getinfo, table.sort)
  if ok and d then print("I what " .. tostring(d.what) .. " src " .. tostring(d.source) .. " line " .. tostring(d.linedefined)) end
end
local z = {0, -0.0, 0, -0.0, -0.0, 0, 0, -0.0}
table.sort(z)
local o = {}
for i = 1, #z do o[i] = (1 / z[i] < 0) and "-" or "+" end
print("I zeros " .. table.concat(o, ""))
print("I version " .. tostring(_VERSION))
"""


def batches(cs: list[dict], cap: int = 2500):
    cur, size = [], 0
    for c in cs:
        k = len(c["keys"]) * (2 if c["cmp"] in ("gt2", "gt1of2") else 1)
        if cur and size + k > cap:
            yield cur
            cur, size = [], 0
        cur.append(c)
        size += k
    if cur:
        yield cur


def probe_state(t: Tuner, state: str, cs: list[dict]) -> tuple[list[dict], list[str]]:
    info = t.run(state, LUA_INFO, timeout=30)
    res = {c["name"]: dict(c) for c in cs}
    for b in batches(cs):
        body = LUA_HEAD + "\n".join(f'run("{c["name"]}", "{c["cmp"]}", {lua_value(c["keys"])})' for c in b)
        traces: dict[str, list[str]] = {}
        for ln in t.run(state, body, timeout=120):
            kind, _, rest = ln.partition(" ")
            name, _, data = rest.partition(" ")
            if kind == "P":
                if " ERR " in data:
                    data, _, err = data.partition(" ERR ")
                    res[name]["error"] = err
                res[name]["perm"] = [int(x) for x in data.split()]
            elif kind == "T":
                traces.setdefault(name, []).append(data)
        for name, parts in traces.items():
            res[name]["trace"] = [[int(x) for x in c.split(",")] for c in "".join(parts).split(";") if c]
        for c in b:
            res[c["name"]].setdefault("trace", [])
    return list(res.values()), info


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--port", type=int, default=4318)
    p.add_argument("--states", default="FrontEnd")
    p.add_argument("--limit", type=int, default=0, help="only the first N cases (a smoke run)")
    a = p.parse_args()
    cs = cases()
    if a.limit:
        cs = cs[:a.limit]
    rec = {"host": a.host, "results": {}, "info": {}}
    t = Tuner(a.host, a.port).connect()
    for state in a.states.split(","):
        t0 = time.monotonic()
        rec["results"][state], rec["info"][state] = probe_state(t, state, cs)
        print(state, len(rec["results"][state]), "cases", f"{time.monotonic() - t0:.1f}s", rec["info"][state])
    t.close()
    out = HERE / "runs" / f"h3_sort_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.json"
    out.write_text(json.dumps(rec), encoding="utf-8")
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
