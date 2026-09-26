"""C-74-S2: the per-(row, site) first-occurrence boost, checked on the C-74-S1
save sweep (Standard lab4, Small obs1-6): at every save whose climate chances
are filled, the flood and eruption percent against
    floor(100 x sum Occ x (1.3 if the (row, site) pair has not occurred) x (1 + CIPD/100 x T) / N)
with the sites from `event_map_<save>.json` (floodable rivers = rivers with a
CanBeFlooded floodplain plot, keyed by the list's first plot; active volcanoes;
volcano wonders) and the occurrences from `event_turns_<save>.jsonl`.

    python tools/civ6lab/c74s2_s1check.py
"""
import glob
import json
import math
import pathlib
import re

RUNS = pathlib.Path(__file__).parent / "runs"
FLOOD = [("FLOOD_MODERATE", 2, 20), ("FLOOD_MAJOR", 1.5, 20), ("FLOOD_1000_YEAR", 1, 20)]
ERUPT = [("VOLCANO_GENTLE", 4, 0), ("VOLCANO_CATASTROPHIC", 2.5, 0), ("VOLCANO_MEGACOLOSSAL", 1.5, 0)]
NW = {"FEATURE_KILIMANJARO": [("KILIMANJARO_GENTLE", 4), ("KILIMANJARO_CATASTROPHIC", 2.5)],
      "FEATURE_EYJAFJALLAJOKULL": [("EYJAFJALLAJOKULL_CATASTROPHIC", 4), ("EYJAFJALLAJOKULL_MEGACOLOSSAL", 2.5)],
      "FEATURE_VESUVIUS": [("VESUVIUS_MEGACOLOSSAL", 7)]}


def main():
    out = {"flood": [], "erupt": []}
    for f in sorted(glob.glob(str(RUNS / "event_map_*.json"))):
        save = re.match(r".*event_map_(.*)\.json", f.replace("\\", "/")).group(1)
        m = json.load(open(f, encoding="utf-8"))["InGame"]
        cl = m["climate"]["climate"]
        if not cl.get("GetFloodPercentChance") and not cl.get("GetStormPercentChance"):
            continue
        turn = m["climate"]["turn"]
        T = cl["GetTemperatureChange"]
        ev = []
        tf = RUNS / f"event_turns_{save}.jsonl"
        if not tf.exists():
            continue
        for ln in open(tf, encoding="utf-8"):
            r = json.loads(ln)
            if r.get("kind") == "turn" and isinstance(r.get("event"), dict):
                e = r["event"]
                if e["StartTurn"] < turn:
                    ev.append(((r.get("eventType") or "")[13:], e.get("StartLocation")))
        occurred = set(ev)
        cbf = set(m["rivers"]["canBeFlooded"]) if isinstance(m["rivers"]["canBeFlooded"], list) else set()
        firsts = []
        for r in m["river"]:
            fp = r["floodplain"]
            if isinstance(fp, list) and fp and any(i in cbf for i in fp):
                firsts.append(fp[0])
        mass_f = sum(o * (1 if (n, s) in occurred else 1.3) * (1 + c / 100 * T) for s in firsts for n, o, c in FLOOD)
        mass_e = 0.0
        nws = set()
        for v in m["volcano"]:
            if v["isActive"] is not True:
                continue
            if v["naturalWonder"]:
                nws.add((v["feature"], v["plot"]))
            else:
                mass_e += sum(o * (1 if (n, v["plot"]) in occurred else 1.3) for n, o, c in ERUPT)
        # a volcano wonder: its rows once per wonder, occurred at any of its plots
        for feat in {f for f, _ in nws}:
            plots = {p for f, p in nws if f == feat}
            for n, o in NW.get(feat, []):
                done = any((n, p) in occurred for p in plots)
                mass_e += o * (1 if done else 1.3)
        out["flood"].append((save, turn, cl["GetFloodPercentChance"], mass_f, len(firsts), m["rivers"]["numFloodable"]))
        out["erupt"].append((save, turn, cl["GetEruptionPercentChance"], mass_e, len(nws), None))
    for fam, rows in out.items():
        lo, hi = 0.0, math.inf
        print(f"\n{fam}:")
        for save, turn, y, mass, a, b in rows:
            l, h = 100 * mass / (y + 1), (100 * mass / y if y else math.inf)
            lo, hi = max(lo, l), min(hi, h)
            print(f"   {save:<11} t{turn:>3} read {y:>2}  mass {mass:7.3f} ({a} sites, getter {b})  N in ({l:6.1f}, {h:6.1f}]  pred@250 {int(100 * mass / 250)} pred@251 {int(100 * mass / 251)}")
        print(f"   pooled N in ({lo:.1f}, {hi:.1f}] {'EMPTY' if lo >= hi else ''}")


if __name__ == "__main__":
    main()
