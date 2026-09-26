"""C-74-S2: one game's per-turn chances and site counts as a compact series,
printing a row only when something changes, with the turn's event.

    python tools/civ6lab/c74s2_series.py c74s2_duel2
"""
import json
import pathlib
import sys

RUNS = pathlib.Path(__file__).parent / "runs"
tag = sys.argv[1]
rows = {}
for f in sorted(RUNS.glob(f"c74s2_turn_{tag}_*.jsonl")):
    for ln in open(f, encoding="utf-8"):
        if not ln.startswith("{"):
            continue
        r = json.loads(ln)
        rows.setdefault(r["turn"], {})[r["kind"]] = r
prev = None
for t in sorted(rows):
    x = rows[t]
    if "t" not in x:
        continue
    cl = x["t"]["climate"]
    volc = x.get("volc", {}).get("v", [])
    act = "".join("A" if v[1] is True else "." for v in volc)
    rv = x.get("rv", {}).get("r", [])
    riv = "".join(str(min(9, r[3])) if r[3] else ("." if r[2] else "-") for r in rv)
    key = (cl["GetStormPercentChance"], cl["GetDroughtPercentChance"], cl["GetFirePercentChance"],
           cl["GetFloodPercentChance"], cl["GetEruptionPercentChance"], x["t"]["numFloodable"], act, riv,
           round(cl["GetTemperatureChange"], 2) if isinstance(cl["GetTemperatureChange"], (int, float)) else None)
    ev = x["t"].get("evPrev")
    evs = ""
    if isinstance(ev, dict) and ev.get("StartTurn") == t - 1:
        evs = f"{ev.get('type', '')[13:]}@{ev.get('StartLocation')}"
    if key != prev or evs:
        print(f"t{t:>3} S{key[0]:>2} D{key[1]:>2} Fi{key[2]:>2} F{key[3]:>2} E{key[4]:>2} rivers {key[5]:>2} "
              f"volc {key[6]} riv {key[7]} T {key[8]}  {evs}")
    prev = key
