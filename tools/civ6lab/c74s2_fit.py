"""C-74-S2: the Duel event watch, fitted.

    python tools/civ6lab/c74s2_fit.py [tag glob, default c74s2_duel*]

Reads `runs/c74s2_turn_<tag>_*.jsonl` (the per-turn reader `c74s2_turn.lua`)
and `runs/event_history_<tag>_*.txt` (the history at each game's end), and
prints, per game and pooled:

1. the NORMALISERS: for each climate-screen family chance (integer percent)
   the interval of N consistent with every read under percent = floor or
   round of 100 x mass / max(N, total mass), with the mass of a row counted
   once per map (storm 56, drought 28, fire 12 while Woods or Rainforest
   stands) or per site (flood 4.5 per floodable river, eruption 8 per active
   volcano + a volcano wonder's rows), each x (1 + CIPD/100 x T);
2. the EMPTY SHARE (turns 2..end) against 1 - the summed chances of the turn
   before;
3. the VOLCANO ACTIVITY CLOCK: every flip of IsActiveVolcano, the run
   lengths, and whether flips fall on shared turns;
4. CanBeFlooded's GATE: per plot and per river, against owner, revealed by
   anyone, revealed by a major;
5. the DROUGHT's plot against its city's plots;
6. WARMING: every turn T fell.
"""
from __future__ import annotations

import collections
import glob
import json
import math
import pathlib
import re
import sys

RUNS = pathlib.Path(__file__).parent / "runs"

STORM = [(2, 50), (8, 0), (8, 0), (2, 50), (15, 0), (3, 50), (15, 0), (3, 50)]  # (Occ, CIPD) the eight storms
DROUGHT = [(23, 0), (5, 50)]
FIRE = [(6, 50), (6, 50)]
FLOOD = [(2, 20), (1.5, 20), (1, 20)]
ERUPT = [(4, 0), (2.5, 0), (1.5, 0)]
MAJORS = 2  # the Duel setup: players 0 and 1 are the majors, the minors follow
NW_ROWS = {"FEATURE_KILIMANJARO": 6.5, "FEATURE_EYJAFJALLAJOKULL": 6.5, "FEATURE_VESUVIUS": 7.0}


def load(tag: str):
    turns: dict[int, dict] = collections.defaultdict(dict)
    dmaps = []
    for f in sorted(RUNS.glob(f"c74s2_turn_{tag}_*.jsonl")):
        for ln in open(f, encoding="utf-8"):
            ln = ln.strip()
            if not ln.startswith("{"):
                continue
            r = json.loads(ln)
            if r["kind"] == "dmap":
                dmaps.append(r)
            else:
                turns[r["turn"]][r["kind"]] = r
    hist = []
    for f in sorted(RUNS.glob(f"event_history_{tag}_*.txt")):
        for ln in open(f, encoding="utf-8"):
            ln = ln.strip()
            if ln.startswith("{"):
                hist.append(json.loads(ln))
    return turns, dmaps, hist


def warm(rows, T):
    return sum(o * (1 + c / 100 * T) for o, c in rows)


def masses(tr, nw_feats):
    """per-family (once-per-map mass, per-site mass) at one turn"""
    t = tr["t"]
    T = t["climate"]["GetTemperatureChange"]
    T = T if isinstance(T, (int, float)) else 0.0
    volc = tr.get("volc", {}).get("v", [])
    active = sum(1 for v in volc if v[1] is True and not v[4])
    rivers = t["numFloodable"]
    rv = tr.get("rv", {}).get("r", [])
    rivers_cbf = sum(1 for r in rv if r[3] > 0)
    nw_active = [v for v in volc if v[4] and v[1] is True]
    feats = {v[5] for v in nw_active if len(v) > 5} or set(nw_feats)
    nw = sum(NW_ROWS.get(f, 0) for f in feats)
    return dict(T=T, storm=warm(STORM, T), drought=warm(DROUGHT, T), fire=warm(FIRE, T),
                flood=warm(FLOOD, T) * rivers, flood_cbf=warm(FLOOD, T) * rivers_cbf,
                erupt=warm(ERUPT, T) * active + nw, active=active, rivers=rivers, rivers_cbf=rivers_cbf)


def n_interval(pairs, mode):
    """pairs of (percent, mass): the N with percent == floor/round(100 mass / N)"""
    lo, hi = 0.0, math.inf
    for y, m in pairs:
        if m <= 0:
            continue
        a, b = (y, y + 1) if mode == "floor" else (y - 0.5, y + 0.5)
        # 100 m / N in [a, b)  ->  N in (100 m / b, 100 m / a]
        lo = max(lo, 100 * m / b)
        hi = min(hi, 100 * m / a if a > 0 else math.inf)
    return lo, hi


def family(tp):
    if not tp:
        return None
    for k, v in (("FLOOD", "flood"), ("BLIZZARD", "storm"), ("DUST", "storm"), ("TORNADO", "storm"),
                 ("HURRICANE", "storm"), ("DROUGHT", "drought"), ("VOLCANO", "erupt"), ("KILIMANJARO", "erupt"),
                 ("EYJAFJALLAJOKULL", "erupt"), ("VESUVIUS", "erupt"), ("FIRE", "fire"), ("METEOR", "meteor"),
                 ("SEA_LEVEL", "sealevel"), ("NUCLEAR", "nuclear")):
        if k in tp:
            return v
    return "other"


def game(tag: str, pooled: dict) -> None:
    turns, dmaps, hist = load(tag)
    if not turns:
        return
    ts = sorted(turns)
    print(f"\n=== {tag}: turns {ts[0]}..{ts[-1]} ({len(ts)} reads), {len(dmaps)} drought maps, {len(hist)} history lines")
    first = turns[ts[0]]
    nw_feats = set()
    # the NW volcano feature names are not in the per-turn line: count a
    # volcano wonder by its plots (flag v[4]); the rows' mass is per wonder
    nwplots = [v[0] for v in first.get("volc", {}).get("v", []) if v[4]]
    print(f"   volcanoes: {len(first['volc']['v'])} plots, {len(nwplots)} natural-wonder plots; getter {first['t']['volcanoes']}")

    # 1. the normalisers
    fam_key = {"storm": "GetStormPercentChance", "drought": "GetDroughtPercentChance", "fire": "GetFirePercentChance",
               "flood": "GetFloodPercentChance", "erupt": "GetEruptionPercentChance"}
    rows = []
    for t in ts:
        tr = turns[t]
        if "t" not in tr or t < 2:
            continue
        cl = tr["t"]["climate"]
        if not any(isinstance(cl.get(k), (int, float)) and cl.get(k) for k in fam_key.values()):
            continue
        m = masses(tr, nw_feats)
        rows.append((t, cl, m))
    pooled.setdefault("rows", []).extend((tag, t, cl, m) for t, cl, m in rows)
    print(f"   {len(rows)} turns with the chances filled")
    if rows:
        t, cl, m = rows[0]
        print(f"   first: t{t} " + " ".join(f"{k}={cl[v]}" for k, v in fam_key.items())
              + f"  sites: floodable rivers {m['rivers']} (with a CBF plot {m['rivers_cbf']}), active volcanoes {m['active']}, NW plots {len(nwplots)}")
        seen = collections.Counter()
        for t, cl, m in rows:
            seen[tuple(cl[v] for v in fam_key.values()) + (m["rivers"], m["active"])] += 1
        print("   distinct (storm, drought, fire, flood, erupt | rivers, active) and their turn counts:")
        for k, n in sorted(seen.items(), key=lambda kv: -kv[1])[:12]:
            print(f"      {k}: {n}")

    # 2. the empty share
    evs = {}
    for h in hist:
        if h.get("kind") == "turn":
            ev = h.get("event")
            evs[h["t"]] = family(h.get("eventType")) if isinstance(ev, dict) else ("empty" if ev is None else "err")
    tt = [t for t in evs if t >= 2]
    c = collections.Counter(evs[t] for t in tt)
    print(f"   history t>=2: {len(tt)} turns, {dict(c)}; empty share {c['empty'] / max(1, len(tt)):.3f}")
    exp_empty = 0.0
    nexp = 0
    for t in tt:
        tr = turns.get(t - 1) or turns.get(t)
        if not tr or "t" not in tr:
            continue
        cl = tr["t"]["climate"]
        s = sum(cl[v] for v in fam_key.values() if isinstance(cl.get(v), (int, float)))
        exp_empty += max(0.0, 1 - s / 100)
        nexp += 1
    print(f"   expected empty from 1 - sum(chances of t-1): {exp_empty:.1f} over {nexp} turns (observed {c['empty']})")
    pooled.setdefault("empty", []).append((len(tt), c["empty"], exp_empty))
    pooled.setdefault("fam", collections.Counter()).update(c)

    # 3. the volcano clock
    series = collections.defaultdict(list)
    for t in ts:
        for v in turns[t].get("volc", {}).get("v", []):
            series[(v[0], v[4])].append((t, v[1]))
    flips_by_turn = collections.Counter()
    for (plot, nw), s in series.items():
        runs, cur, start = [], None, None
        flips = []
        for t, a in s:
            if a != cur:
                if cur is not None:
                    runs.append((cur, t - start))
                    flips.append(t)
                    flips_by_turn[t] += 1
                cur, start = a, t
        runs.append((cur, s[-1][0] - start + 1, "open"))
        act = sum(1 for _, a in s if a is True) / len(s)
        print(f"   volcano {plot}{' NW' if nw else ''}: active {act:.2f} of {len(s)} turns; flips at {flips}; runs {runs}")
        pooled.setdefault("volc_runs", []).extend(runs)
        pooled.setdefault("volc_flips", []).extend(flips)
        pooled.setdefault("volc_turns", []).append((len(s), act, nw))
    print(f"   turns with 2+ flips: {[t for t, n in flips_by_turn.items() if n > 1]}")

    # 4. CanBeFlooded's gate
    majors = None
    plot_rows = collections.Counter()
    river_rows = collections.Counter()
    river_changes = []
    prev_cbf = {}
    rv_members = {}
    for t in ts:
        tr = turns[t]
        if "fp" not in tr:
            continue
        alive = tr["t"]["alive"]
        maj = set(p for p in alive if p < 62)  # majors and minors; split below by the cities' owners
        cbf = {p[0]: p for p in tr["fp"]["p"]}
        for i, p in cbf.items():
            owner, by = p[2], set(p[3])
            plot_rows[(p[1], owner >= 0, bool(by))] += 1
            if prev_cbf.get(i) is not None and prev_cbf[i] != p[1]:
                river_changes.append((t, i, prev_cbf[i], p[1], owner, sorted(by)))
            prev_cbf[i] = p[1]
    print("   per-plot (CanBeFlooded, owned, revealed by anyone): count of plot-turns")
    for k, n in sorted(plot_rows.items()):
        print(f"      {k}: {n}")
    print(f"   {len(river_changes)} plot flips of CanBeFlooded: {river_changes[:30]}")
    pooled.setdefault("cbf_flips", []).extend((tag,) + x for x in river_changes)
    # the river-level gates, where the reader lists each river's floodplain
    hyp = {"uniform": lambda pl: None,
           "revealed by anyone": lambda pl: any(p[3] for p in pl),
           "revealed by a major": lambda pl: any(any(q < MAJORS for q in p[3]) for p in pl),
           "owned": lambda pl: any(p[2] >= 0 for p in pl),
           "owned by a major": lambda pl: any(0 <= p[2] < MAJORS for p in pl)}
    score = collections.Counter()
    miss = collections.defaultdict(list)
    nriv = 0
    for t in ts:
        tr = turns[t]
        if "fp" not in tr or "rv" not in tr:
            continue
        cbf = {p[0]: p for p in tr["fp"]["p"]}
        for r in tr["rv"]["r"]:
            if len(r) < 5 or not r[4]:
                continue
            pl = [cbf[i] for i in r[4] if i in cbf]
            vals = {p[1] for p in pl}
            nriv += 1
            score[("uniform", len(vals) == 1)] += 1
            got = any(p[1] is True for p in pl)
            for name, f in hyp.items():
                if name == "uniform":
                    continue
                ok = f(pl) == got
                score[(name, ok)] += 1
                if not ok and len(miss[name]) < 6:
                    miss[name].append((t, r[0], got, [(p[0], p[2], p[3]) for p in pl][:4]))
    if nriv:
        print(f"   river-level gates over {nriv} river-turns (with lists):")
        for name in hyp:
            print(f"      {name:<22} holds {score[(name, True)]:>5}  fails {score[(name, False)]:>5}  {miss.get(name, [])[:3]}")
        pooled.setdefault("gate", collections.Counter()).update(score)

    # 5. drought plots
    for d in dmaps:
        for key in ("evPrev", "evNow"):
            e = d.get(key)
            if isinstance(e, dict) and "DROUGHT" in str(e.get("type")) and e.get("StartTurn") in (d["turn"], d["turn"] - 1):
                pooled.setdefault("droughts", []).append((tag, d, e))

    # 6. warming
    Ts = [(t, turns[t]["t"]["climate"]["GetTemperatureChange"]) for t in ts if "t" in turns[t]]
    falls = [(a, b) for a, b in zip(Ts, Ts[1:]) if isinstance(a[1], (int, float)) and isinstance(b[1], (int, float)) and b[1] < a[1] - 1e-12]
    print(f"   warming: T {Ts[0][1]} -> {Ts[-1][1]}; falls {len(falls)} {falls[:10]}")
    pooled.setdefault("falls", []).extend(falls)


def normalisers(rows) -> None:
    fam = [("storm", "GetStormPercentChance", "storm"), ("drought", "GetDroughtPercentChance", "drought"),
           ("fire", "GetFirePercentChance", "fire"), ("flood/river", "GetFloodPercentChance", "flood"),
           ("flood/river with a CBF plot", "GetFloodPercentChance", "flood_cbf"),
           ("eruption/active", "GetEruptionPercentChance", "erupt")]
    print("\n=== the normalisers, pooled: N with percent = floor|round(100 mass / N)")
    for name, key, mk in fam:
        for mode in ("floor", "round"):
            pairs = [(cl[key], m[mk]) for _, _, cl, m in rows if isinstance(cl.get(key), (int, float))]
            # a zero percent with positive mass bounds N from below only
            lo, hi = n_interval([p for p in pairs if p[0] > 0], mode)
            zero = [m for y, m in pairs if y == 0 and m > 0]
            if zero:
                b = 1.0 if mode == "floor" else 0.5
                lo = max(lo, max(100 * m / b for m in zero))
            print(f"   {name:<28} {mode:<5} N in ({lo:7.1f}, {hi:7.1f}]  {'EMPTY' if lo >= hi else ''}  ({len(pairs)} reads)")


def droughts(ds) -> None:
    print(f"\n=== droughts: {len(ds)} starts with a map")
    for tag, d, e in ds:
        W, H = d["grid"]
        terr = {i: n for i, n in d["terrains"]}
        feat = {i: n for i, n in d["features"]}
        imp = {i: n for i, n in d["improvements"]}
        plots = {p[0]: p for p in d["plots"]}
        s = e["StartLocation"]
        p = plots.get(s)
        sx, sy = s % W, s // W
        desc = (f"owner {p[1]} city {p[2]} {terr.get(p[3])} {feat.get(p[4], 'none')} {imp.get(p[5], 'none')} pill {p[6]} "
                f"district {p[7]} river {p[8]} fresh {p[9]}") if p else "water?"
        print(f"   {tag} t{e['StartTurn']} {e['type']} at {s} ({sx},{sy}) {e.get('Name')}: {desc}")


def main() -> int:
    pat = sys.argv[1] if len(sys.argv) > 1 else "c74s2_duel*"
    tags = sorted({re.match(r"c74s2_turn_(.*)_\d{8}T\d{6}Z\.jsonl", f.name).group(1)
                   for f in RUNS.glob(f"c74s2_turn_{pat}_*.jsonl")})
    pooled: dict = {}
    for tag in tags:
        game(tag, pooled)
    if pooled.get("rows"):
        normalisers(pooled["rows"])
    if pooled.get("empty"):
        n = sum(a for a, _, _ in pooled["empty"])
        e = sum(b for _, b, _ in pooled["empty"])
        x = sum(c for _, _, c in pooled["empty"])
        print(f"\n=== empty share pooled: {e}/{n} = {e / max(1, n):.3f}; expected from the chances {x:.1f}")
        print(f"   families pooled: {dict(pooled['fam'])}")
    if pooled.get("volc_runs"):
        closed = collections.Counter((a, n) for a, n, *rest in pooled["volc_runs"] if not rest)
        print(f"\n=== volcano runs (closed): {sorted(closed.items())}")
    droughts(pooled.get("droughts", []))
    print(f"\n=== warming falls pooled: {len(pooled.get('falls', []))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
