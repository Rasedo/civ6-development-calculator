"""A generated map against the game's own: the draw stream and the map.

    python tools/civ6map/check.py --session tools/civ6lab/runs/h3_session_<stamp>.jsonl \
        [--majors LEADER_A,LEADER_B --minors 3]

The session record (tools/civ6lab/h3_session.py --probe over the quiet probe)
carries the game's every Lua draw (range, value, reason) in order, the native
calls between them with the map facts logged after some, the map's total
draw count and its dump. The generator runs the same script, size and seed;
the report names the first Lua draw that differs, the first facts line that
differs, the total draw count, the per-block native counts against the
session's ledger, and the map plot for plot: plot type (flat / hills /
mountain / water), terrain, feature, resource, rivers, cliffs, continent,
starts.
"""
from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.civ6map.generate import dump, generate  # noqa: E402

PROBE_SCRIPT = "Continents"


def probe_entries(rec: dict):
    reasons = {int(k): v for k, v in rec["probe"]["reasons"].items()}
    for e in rec["probe"]["log"]:
        if e.startswith("<"):
            m = re.match(r"<([\w.:]+)\((.*)\)$", e)
            yield ("open", m.group(1) if m else e[1:], m.group(2) if m else "")
        elif e.startswith(">"):
            name, _, facts = e[1:].partition(" ")
            yield ("close", name, facts)
        else:
            r, v, rid = e.split(":")
            yield ("lua", int(float(r)), int(float(v)), reasons.get(int(rid), rid))


def plot_class(terrain: int) -> str:
    if terrain >= 15:
        return "W"
    return "FHM"[terrain % 3]


def compare_maps(a: dict, b: dict) -> dict:
    """a = ours, b = the game's, both in the lab's dump shape"""
    fields = ("terrain", "feature", "resource", "count", "improvement", "continent", "flags")
    diff = collections.Counter()
    cls_conf = collections.Counter()
    first = {}
    plots = 0
    for y, (ra, rb) in enumerate(zip(a["rows"], b["rows"])):
        for x, (pa, pb) in enumerate(zip(ra, rb)):
            plots += 1
            va, vb = pa.split("."), pb.split(".")
            ca, cb = plot_class(int(va[0])), plot_class(int(vb[0]))
            cls_conf[(ca, cb)] += 1
            if ca != cb:
                diff["plot type"] += 1
                first.setdefault("plot type", (x, y, pa, pb))
            for f, u, v in zip(fields, va, vb):
                if f == "flags":
                    for name, bits in (("rivers", 7), ("cliffs", 56), ("start flag", 64)):
                        if int(u) & bits != int(v) & bits:
                            diff[name] += 1
                            first.setdefault(name, (x, y, pa, pb))
                elif u != v:
                    diff[f] += 1
                    first.setdefault(f, (x, y, pa, pb))
    return {"plots": plots, "differ": dict(diff), "first": first,
            "plot type (ours, game)": {f"{k[0]}{k[1]}": v for k, v in sorted(cls_conf.items())},
            "starts ours": a["starts"], "starts game": b["starts"]}


def oracle_floodplains(gdump: dict) -> None:
    """GenerateFloodplains replaced by the game's own floodplains (every
    floodplain in the finished map was placed there: no later stage adds or
    removes one)"""
    from tools.civ6map import vm

    orig = vm.Api.TB_GenerateFloodplains

    def placed(self, inland, lo, hi):
        fp = {self.w.fix[k] for k in ("FEATURE_FLOODPLAINS", "FEATURE_FLOODPLAINS_GRASSLAND",
                                      "FEATURE_FLOODPLAINS_PLAINS")}
        for y, row in enumerate(gdump["rows"]):
            for x, cell in enumerate(row):
                f = int(cell.split(".")[1])
                if f in fp:
                    self.w.feature[y * self.w.W + x] = f
        return orig(self, inland, lo, hi)

    vm.Api.TB_GenerateFloodplains = placed


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--session", required=True)
    p.add_argument("--line", type=int, default=0)
    p.add_argument("--script", default=PROBE_SCRIPT)
    p.add_argument("--size", default="MAPSIZE_DUEL")
    p.add_argument("--majors", default="LEADER_ROBERT_THE_BRUCE,LEADER_HOJO")
    p.add_argument("--minors", type=int, default=3)
    p.add_argument("--show", type=int, default=6, help="Lua draws of context around the first difference")
    p.add_argument("--save-dump")
    p.add_argument("--oracle", action="append", default=[], choices=["floodplains"],
                   help="take this open native's result from the game's dump, to test the stages after it")
    a = p.parse_args()
    sess = pathlib.Path(a.session)
    rec = [json.loads(ln) for ln in sess.read_text(encoding="utf-8").splitlines() if ln][a.line]
    if "floodplains" in a.oracle:
        oracle_floodplains(json.loads(pathlib.Path(rec["map_dump"]).read_text(encoding="utf-8")))
    world, api = generate(a.script, a.size, int(rec["map_seed"]), majors=a.majors.split(","),
                          n_minors=a.minors, minors=[], options={})
    ours = world.rng.ledger
    game = list(probe_entries(rec))
    gl = [e for e in game if e[0] == "lua"]
    ol = [e for e in ours if e[0] == "lua"]
    k = 0
    while k < min(len(gl), len(ol)) and gl[k][1:4] == ol[k][1:4]:
        k += 1
    print(f"map seed {rec['map_seed']}: total draws ours {world.rng.n}, game {rec['draws_before_probe']} "
          f"({'EXACT' if world.rng.n == rec['draws_before_probe'] else 'DIFFERENT'})")
    print(f"Lua draws: ours {len(ol)}, game {len(gl)}; the first {k} agree (range, value, reason)")
    if k < max(len(gl), len(ol)):
        lo = max(0, k - a.show)
        print("  game:", [f"{r}:{v}:{why}" for _, r, v, why in gl[lo:k + a.show]])
        print("  ours:", [f"{r}:{v}:{why}" for _, r, v, why in ol[lo:k + a.show]])
        # the natives just before the first difference, both sides
        def natives_before(seq, kk, kind_name):
            n_l, out = 0, []
            for e in seq:
                if e[0] == "lua":
                    n_l += 1
                    if n_l > kk:
                        break
                    out = []
                else:
                    out.append(e[1] if kind_name else e)
            return out
        print("  game natives before it:", [x for x in natives_before(game, k, True)][-8:])
        print("  ours natives before it:", [x for x in natives_before(ours, k, True)][-8:])
    gf = [(e[1], e[2]) for e in game if e[0] == "close" and e[2].startswith("land=")]
    of = [(e[1], e[2]) for e in ours if e[0] == "facts"]
    j = 0
    while j < min(len(gf), len(of)) and gf[j] == of[j]:
        j += 1
    print(f"map facts after natives: {j} of game {len(gf)} / ours {len(of)} agree")
    if j < max(len(gf), len(of)):
        print("  game:", gf[j] if j < len(gf) else None)
        print("  ours:", of[j] if j < len(of) else None)
    # native draw counts per block against the session's ledger
    lp = sess.with_name(sess.stem + "_ledger.json")
    if lp.exists():
        rows = json.loads(lp.read_text(encoding="utf-8"))
        want = collections.Counter()
        for kind, label, n, _d in rows:
            if kind == "native" and n:
                want[re.sub(r"^\[not wrapped\] (hills |mountains )?", "", label).split("(")[0]] += n
        got = collections.Counter()
        for e in ours:
            if e[0] == "native" and e[2]:
                got[e[1]] += e[2]
        print("native draws by name (ours / game ledger):")
        for name in sorted(set(want) | set(got)):
            print(f"  {name:<40} {got.get(name, 0):>8} {want.get(name, 0):>8}"
                  f"{'' if got.get(name, 0) == want.get(name, 0) else '  DIFFERENT'}")
    gdump = json.loads(pathlib.Path(rec["map_dump"]).read_text(encoding="utf-8"))
    odump = dump(world, int(rec["map_seed"]))
    if a.save_dump:
        pathlib.Path(a.save_dump).write_text(json.dumps(odump), encoding="utf-8")
    print(json.dumps(compare_maps(odump, gdump), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
