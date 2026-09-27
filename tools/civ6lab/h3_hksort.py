"""H-3: Havok Script's table.sort — candidate algorithms and their scorer.

    python tools/civ6lab/h3_hksort.py [runs/h3_sort_*.json ...]

Each candidate sorts a Python list with a comparator lt(a, b) exactly as a
Lua table.sort(t, lt) would, calling lt in the same order (a trace of the
calls can be kept). Scored against
  * the in-game sort probe records (runs/h3_sort_*.json, h3_sortprobe.py):
    every case's output permutation and, where recorded, the comparator's
    call trace;
  * the resource ties the map logs decide (runs/h3_ties/*.json): the luxury
    placements' candidate list in insertion order, sorted by
    `a.Score > b.Score`, the first `take` placed; the game's placed set.
"""
from __future__ import annotations

import glob
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).parent


class Traced:
    def __init__(self, lt, ident=None):
        self.lt, self.ident, self.calls = lt, ident, []

    def __call__(self, a, b):
        if self.ident is not None:
            self.calls.append((self.ident(a), self.ident(b)))
        return self.lt(a, b)


def lua51(t: list, lt) -> None:
    """Lua 5.1 ltablib.c auxsort on t[0..n-1] (1-based indices inside)"""
    a = [None] + t

    def aux(l, u):
        while l < u:
            if lt(a[u], a[l]):
                a[l], a[u] = a[u], a[l]
            if u - l == 1:
                break
            i = (l + u) // 2
            if lt(a[i], a[l]):
                a[i], a[l] = a[l], a[i]
            elif lt(a[u], a[i]):
                a[i], a[u] = a[u], a[i]
            if u - l == 2:
                break
            P = a[i]
            a[i], a[u - 1] = a[u - 1], a[i]
            i, j = l, u - 1
            while True:
                i += 1
                while lt(a[i], P):
                    if i > u:
                        raise ValueError("invalid order function for sorting")
                    i += 1
                j -= 1
                while lt(P, a[j]):
                    if j < l:
                        raise ValueError("invalid order function for sorting")
                    j -= 1
                if j < i:
                    break
                a[i], a[j] = a[j], a[i]
            a[u - 1], a[i] = a[i], a[u - 1]
            if i - l < u - i:
                j, i, l = l, i - 1, i + 1
            else:
                j, i, u = i + 1, u, i - 1
            aux(j, i)

    aux(1, len(t))
    t[:] = a[1:]


def vm_candidate(t: list, lt) -> None:
    """tools/civ6map/vm.py HKS_SORT: the first two median-of-three swaps test
    not lt(b, a)"""
    a = [None] + t

    def le(x, y):
        return not lt(y, x)

    def aux(l, u):
        while l < u:
            if le(a[u], a[l]):
                a[l], a[u] = a[u], a[l]
            if u - l == 1:
                return
            i = (l + u) // 2
            if le(a[i], a[l]):
                a[i], a[l] = a[l], a[i]
            elif lt(a[u], a[i]):
                a[i], a[u] = a[u], a[i]
            if u - l == 2:
                return
            P = a[i]
            a[i], a[u - 1] = a[u - 1], a[i]
            i, j = l, u - 1
            while True:
                i += 1
                while lt(a[i], P):
                    i += 1
                j -= 1
                while lt(P, a[j]):
                    j -= 1
                if j < i:
                    break
                a[i], a[j] = a[j], a[i]
            a[u - 1], a[i] = a[i], a[u - 1]
            if i - l < u - i:
                j, i, l = l, i - 1, i + 1
            else:
                j, i, u = i + 1, u, i - 1
            aux(j, i)

    aux(1, len(t))
    t[:] = a[1:]


def make_wirth(order: str = "left"):
    """median of three (lt(a[u], a[l]) swaps; then not lt(a[l], a[m])
    swaps m and l, else not lt(a[m], a[u]) swaps m and u), the pivot left in
    place, a Wirth partition (i from l+1, j from u-1, swap while i <= j), the
    two parts [l, j] and [i, u] sorted in `order`"""
    def sort(t: list, lt) -> None:
        a = [None] + t

        def aux(l, u):
            if l >= u:
                return
            if lt(a[u], a[l]):
                a[l], a[u] = a[u], a[l]
            if u - l == 1:
                return
            m = (l + u) // 2
            if not lt(a[l], a[m]):
                a[m], a[l] = a[l], a[m]
            elif not lt(a[m], a[u]):
                a[m], a[u] = a[u], a[m]
            if u - l == 2:
                return
            P = a[m]
            i, j = l + 1, u - 1
            while i <= j:
                while lt(a[i], P):
                    i += 1
                while lt(P, a[j]):
                    j -= 1
                if i <= j:
                    a[i], a[j] = a[j], a[i]
                    i += 1
                    j -= 1
            if order == "left" or (order == "small" and j - l <= u - i):
                aux(l, j)
                aux(i, u)
            else:
                aux(i, u)
                aux(l, j)

        aux(1, len(t))
        t[:] = a[1:]
    return sort


hks_sort = make_wirth("left")
"""Havok Script's table.sort (Civ 6, HKS 2013.2.0 r13768): the rule every
probed call and every clean map tie follow"""

HKS_SORT_LUA = r"""
-- table.sort as Havok Script sorts: median of three (a[u] before a[l] swaps
-- them; then a[l] not before a[m] swaps m and l, else a[m] not before a[u]
-- swaps m and u), the pivot left in place, a Wirth partition (i from l + 1,
-- j from u - 1, swapping while i <= j), then [l, j] and [i, u], left first
local function sort(t, lt)
  lt = lt or function(a, b) return a < b end
  local function aux(l, u)
    if l >= u then return end
    if lt(t[u], t[l]) then t[l], t[u] = t[u], t[l] end
    if u - l == 1 then return end
    local m = math.floor((l + u) / 2)
    if not lt(t[l], t[m]) then t[m], t[l] = t[l], t[m]
    elseif not lt(t[m], t[u]) then t[m], t[u] = t[u], t[m] end
    if u - l == 2 then return end
    local P = t[m]
    local i, j = l + 1, u - 1
    while i <= j do
      while lt(t[i], P) do i = i + 1 end
      while lt(P, t[j]) do j = j - 1 end
      if i <= j then
        t[i], t[j] = t[j], t[i]
        i = i + 1
        j = j - 1
      end
    end
    aux(l, j)
    aux(i, u)
  end
  aux(1, #t)
end
table.sort = sort
"""


def lua_selfcheck(records) -> tuple[int, int]:
    """HKS_SORT_LUA run in Lua 5.1 (lupa) against the probe records: perms
    and traces"""
    import lupa.lua51 as lua51m
    L = lua51m.LuaRuntime(unpack_returned_tuples=True)
    L.execute(HKS_SORT_LUA)
    runner = L.eval("""function(keys, cmp)
      local CMP = {
        gt = function(a, b) return a.k > b.k end,
        lt = function(a, b) return a.k < b.k end,
        gt2 = function(a, b) if a.k[1] ~= b.k[1] then return a.k[1] > b.k[1] end return a.k[2] > b.k[2] end,
        gt1of2 = function(a, b) return a.k[1] > b.k[1] end,
      }
      local t = {}
      for i = 1, #keys do t[i] = {id = i, k = keys[i]} end
      local calls = {}
      local f = CMP[cmp]
      table.sort(t, function(a, b) calls[#calls + 1] = a.id .. "," .. b.id; return f(a, b) end)
      local perm = {}
      for i = 1, #t do perm[i] = t[i].id end
      return table.concat(perm, " "), table.concat(calls, ";")
    end""")
    ok = n = 0
    for rec in records:
        for cases in rec["results"].values():
            for c in cases:
                keys = L.table_from([L.table_from(k) if isinstance(k, list) else k for k in c["keys"]])
                perm, calls = runner(keys, c["cmp"])
                n += 1
                tr = [[int(x) for x in s.split(",")] for s in calls.split(";") if s]
                ok += [int(x) for x in perm.split()] == c["perm"] and tr == c["trace"]
    return ok, n


CANDIDATES = {"lua51": lua51, "vm_candidate": vm_candidate, "hks_sort": hks_sort,
              "wirth_small": make_wirth("small")}


# ------------------------------------------------------------------ scoring
def tie_records() -> list[dict]:
    """the tie records whose placed set is the list's top `take` up to the
    tie at the cut (the others' lists are not the game's: a placed plot
    ranks below an unplaced one by score)"""
    out = []
    for f in sorted(glob.glob(str(HERE / "runs" / "h3_ties" / "*.json"))):
        d = json.loads(pathlib.Path(f).read_text())
        b, take = d["before"], d["take"]
        ids = {i for i, _ in b}
        want = {x for x in d["want"] if x in ids}
        cut = sorted((s for _, s in b), reverse=True)[take - 1]
        above = {i for i, s in b if s > cut}
        group = [i for i, s in b if s == cut]
        if above <= want and len(want - above) == take - len(above) and want - above <= set(group) \
                and len(group) > take - len(above):
            out.append({"name": pathlib.Path(f).stem, "before": b, "take": take, "want": sorted(want),
                        "group": group, "chosen": sorted(want - above)})
    return out


def score_ties(sort) -> tuple[int, int, list[str]]:
    ok, n, notes = 0, 0, []
    for d in tie_records():
        t = [{"id": i, "s": s} for i, s in d["before"]]
        sort(t, lambda a, b: a["s"] > b["s"])
        got = sorted(r["id"] for r in t[:d["take"]])
        n += 1
        if got == d["want"]:
            ok += 1
        else:
            notes.append(f"{d['name']}: tied {d['group']} chosen {d['chosen']}, got {sorted(set(got) & set(d['group']))}")
    return ok, n, notes


def report_all_ties(sort) -> None:
    """every tie record, clean or not: the sort's top `take` against the
    game's placed plots"""
    for f in sorted(glob.glob(str(HERE / "runs" / "h3_ties" / "*.json"))):
        d = json.loads(pathlib.Path(f).read_text())
        t = [{"id": i, "s": s} for i, s in d["before"]]
        ids = {r["id"] for r in t}
        sort(t, lambda a, b: a["s"] > b["s"])
        got = sorted(r["id"] for r in t[:d["take"]])
        want = sorted(x for x in d["want"] if x in ids)
        print(f"    {pathlib.Path(f).stem}: {'same' if got == want else 'differs'} got {got} want {want}")


def _probe_case_rows(case):
    return [{"id": k + 1, "k": v} for k, v in enumerate(case["keys"])]


def _probe_lt(case):
    cmp = case["cmp"]
    if cmp == "gt":
        return lambda a, b: a["k"] > b["k"]
    if cmp == "lt":
        return lambda a, b: a["k"] < b["k"]
    if cmp == "gt2":
        return lambda a, b: a["k"][0] > b["k"][0] or (a["k"][0] == b["k"][0] and a["k"][1] > b["k"][1])
    if cmp == "gt1of2":
        return lambda a, b: a["k"][0] > b["k"][0]
    raise ValueError(cmp)


def run_case(sort, case):
    """(output id permutation, comparator trace) for one probe case"""
    rows = _probe_case_rows(case)
    tr = Traced(_probe_lt(case), lambda r: r["id"])
    sort(rows, tr)
    return [r["id"] for r in rows], tr.calls


def score_probe(sort, records) -> tuple[int, int, int, int, list[str]]:
    ok_perm = ok_trace = n = nt = 0
    notes = []
    for rec in records:
        for state, cases in rec["results"].items():
            for case in cases:
                perm, calls = run_case(sort, case)
                n += 1
                if perm == case["perm"]:
                    ok_perm += 1
                elif len(notes) < 12:
                    notes.append(f"{state} {case['name']} n={len(case['keys'])}: perm differs")
                if "trace" in case:
                    nt += 1
                    if [list(c) for c in calls] == case["trace"]:
                        ok_trace += 1
    return ok_perm, n, ok_trace, nt, notes


def main() -> int:
    paths = sys.argv[1:] or sorted(glob.glob(str(HERE / "runs" / "h3_sort_*.json")))
    records = [json.loads(pathlib.Path(p).read_text()) for p in paths]
    for name, sort in CANDIDATES.items():
        ok, n, notes = score_ties(sort)
        print(f"{name}: ties {ok}/{n}")
        for x in notes:
            print("   ", x)
        if records:
            op, pn, ot, tn, pnotes = score_probe(sort, records)
            print(f"{name}: probe perms {op}/{pn}, traces {ot}/{tn}")
            for x in pnotes:
                print("   ", x)
    if records:
        print("HKS_SORT_LUA (lupa) perms and traces: %d/%d" % lua_selfcheck(records))
    print("every tie record under hks_sort:")
    report_all_ties(hks_sort)
    return 0


if __name__ == "__main__":
    sys.exit(main())
