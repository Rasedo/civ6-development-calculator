"""civ6lab pair_run — paired one-turn arms from one save, generic.

    python tools/civ6lab/pair_run.py --host 127.0.0.2 --spec tools/civ6lab/b82s3_spec.json

Every load of one save replays the same random stream, so arms that differ in
ONE change placed after the load play the same turn otherwise. The spec (JSON):

    {"save": "lab4_t150", "tag": "b82s3", "turns": 1, "controls": 2,
     "set": {"ZP": "1"},                       # tokens for every snippet
     "pre":  [{"state": "InGame", "file": "x.lua"}],   # read after the arm, before the turn
     "each": [{"state": "InGame", "file": "z.lua"}],   # read after every turn
     "post": [{"state": "InGame", "file": "y.lua"}],   # read after the turns
     "arms": [{"name": "palace", "gc": "arm.lua", "ig": null, "set": {"ZWHAT": "BUILDING_PALACE"},
               "burn": 0, "steps": [{"state": "GameCore", "file": "arm.lua", "set": {...}}]}]}

Per arm: load, `burn` draws of `Game.GetRandNum(100, "lab")` (independent
repeats), the arm's GameCore snippet then its InGame snippet, the `pre`
readers, `turns` Autoplay turns, the `post` readers. The control arms (no
snippet) run first. A snippet is a file under tools/civ6lab or inline Lua
(`gc_lua` / `ig_lua`); `lab_json.lua` (J, P, OUT) is prepended to each and
the Z-tokens substituted. Every printed line that parses as JSON is kept.
One JSON line per arm: runs/<tag>_<stamp>.jsonl.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402
import game  # noqa: E402
import lab  # noqa: E402

HERE = pathlib.Path(__file__).parent
PREFIX = (HERE / "lab_json.lua").read_text(encoding="utf-8")
STATES = {"GameCore": lab.GC, "GameCore_Tuner": lab.GC, "InGame": lab.IG}


def snippet(src: str | None, inline: str | None, tokens: dict[str, str]) -> str | None:
    if src is None and inline is None:
        return None
    body = inline if inline is not None else (HERE / src).read_text(encoding="utf-8")
    for k in sorted(tokens, key=len, reverse=True):
        body = body.replace(k, str(tokens[k]))
    return PREFIX + "\n" + body


def run_lua(t: Tuner, state: str, lua: str, timeout: float = 60.0) -> dict:
    try:
        lines = t.run(STATES.get(state, state), lua, timeout=timeout)
    except TunerError as e:
        return {"error": str(e), "json": [], "raw": []}
    js, raw = [], []
    for ln in lines:
        s = ln.strip()
        if s.startswith("{") or s.startswith("["):
            try:
                js.append(json.loads(s))
                continue
            except json.JSONDecodeError:
                pass
        raw.append(s)
    return {"json": js, "raw": raw}


def arm(host: str, spec: dict, a: dict | None) -> dict:
    save = (a or {}).get("save", spec["save"])
    if game.cmd_load(argparse.Namespace(host=host, port=4318, name=save, wait=600.0)) != 0:
        raise SystemExit(f"load of {save!r} failed")
    t = Tuner(host).connect()
    lp = lab.local_player(t)
    tokens = {**spec.get("set", {}), **((a or {}).get("set", {}))}
    rec: dict = {"arm": (a or {}).get("name", "control"), "save": save, "turn0": lab.turn(t)}
    burn = int((a or {}).get("burn", 0))
    if burn:
        rec["burn"] = run_lua(t, lab.GC, f'local s=0 for i=1,{burn} do s=s+Game.GetRandNum(100,"lab") end print(s)')["raw"]
    if a is not None:
        for key, st in (("gc", lab.GC), ("ig", lab.IG)):
            lua = snippet(a.get(key), a.get(key + "_lua"), tokens)
            if lua is not None:
                rec[key] = run_lua(t, st, lua)
        # further changes, in order: [{"state", "file" | "lua", "set"}]
        rec["steps"] = [run_lua(t, s.get("state", lab.GC), snippet(s.get("file"), s.get("lua"), {**tokens, **s.get("set", {})}))
                        for s in a.get("steps", [])]
    rec["pre"] = [run_lua(t, r["state"], snippet(r.get("file"), r.get("lua"), tokens)) for r in spec.get("pre", [])]
    turns = int((a or {}).get("turns", spec.get("turns", 1)))
    rec["each"] = []
    for _ in range(turns):
        try:
            lab.advance(t, "autoplay", lp, 900.0)
        except lab.GameOver as e:
            rec["game_over"] = e.info
            break
        if spec.get("each"):
            rec["each"].append({"turn": lab.turn(t), "reads": [
                run_lua(t, r["state"], snippet(r.get("file"), r.get("lua"), tokens)) for r in spec["each"]]})
    rec["turn1"] = lab.turn(t)
    rec["post"] = [run_lua(t, r["state"], snippet(r.get("file"), r.get("lua"), tokens)) for r in spec.get("post", [])]
    t.close()
    return rec


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--spec", required=True)
    p.add_argument("--only", help="comma list of arm names to run (controls still run unless --no-control)")
    p.add_argument("--no-control", action="store_true")
    a = p.parse_args(argv)
    spec = json.loads(pathlib.Path(a.spec).read_text(encoding="utf-8"))
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = lab.RUNS / f"{spec.get('tag', 'pair')}_{stamp}.jsonl"
    arms: list[dict | None] = [] if a.no_control else [None] * int(spec.get("controls", 2))
    want = set(a.only.split(",")) if a.only else None
    arms += [x for x in spec["arms"] if want is None or x["name"] in want]
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for x in arms:
            rec = arm(a.host, spec, x)
            fh.write(json.dumps(rec) + "\n")
            fh.flush()
            print(f"{rec['arm']}: turn {rec['turn0']}->{rec['turn1']}", flush=True)
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
