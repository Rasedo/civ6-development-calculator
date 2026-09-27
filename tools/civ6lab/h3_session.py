"""H-3: host games for (map seed, game seed) pairs and read each one's map
generator: the TerrainBuilder stream's position after the map is made (how
many draws the map took from RANDOM_SEED) and the map itself.

    python tools/civ6lab/h3_session.py --host 127.0.0.3 --config tools/civ6lab/h3_duel.json \
        --pairs 1000:3000,1000:2000,77:2000 [--probe]

Per pair, from the main menu: `game.py new`, then in GameCore_Tuner four
TerrainBuilder.GetRandomNumber(32768) draws fix the state and the step count
from the map seed is found (h3_fit), the map is dumped (h3_mapdump), and with
--probe the civ6lab_mapprobe plot-property log is read; then back to the menu.
One JSON line per game to runs/h3_session_<stamp>.jsonl.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
import game  # noqa: E402
from tuner import Tuner, TunerError  # noqa: E402
from h3_fit import M32, distance, find_state  # noqa: E402
import h3_mapdump  # noqa: E402

GC, IG, FE = "GameCore_Tuner", "InGame", "FrontEnd"

LUA_PROBE_READ = """
local p0 = Map.GetPlotByIndex(0)
local n = p0:GetProperty("civ6lab_mapprobe_n")
print("N " .. tostring(n))
local r = p0:GetProperty("civ6lab_mapprobe_reasons")
if r then for ln in string.gmatch(r, "[^\\n]+") do print("REASON " .. ln) end end
if n then for i = 0, n - 1 do print("C " .. i .. " " .. tostring(Map.GetPlotByIndex(i):GetProperty("civ6lab_mapprobe"))) end end
local nx = p0:GetProperty("civ6lab_mapprobe_xn")
if nx then for i = 0, nx - 1 do print("X " .. i .. " " .. tostring(Map.GetPlotByIndex(i):GetProperty("civ6lab_mapprobe_x"))) end end
"""


LUA_ADD_MOD = """
local h = Modding.GetModHandle("ZMOD")
print("mod handle " .. tostring(h))
if h ~= nil then GameConfiguration.AddEnabledMods(h) end
local n, gs, mine = 0, false, false
for _, m in ipairs(GameConfiguration.GetEnabledMods() or {}) do
  n = n + 1
  local id = tostring(m.Id):lower()
  if id == "4873eb62-8ccc-4574-b784-dda455e74e68" then gs = true end
  if id == "ZMOD" then mine = true end
end
print("enabled in this configuration: " .. n .. " gathering_storm=" .. tostring(gs) .. " probe=" .. tostring(mine))
"""


def to_menu(host: str, port: int, wait: float = 300) -> None:
    t = Tuner(host, port).connect()
    try:
        t.run(IG, game.LUA_EXIT)
    except TunerError:
        pass
    t.close()
    deadline = time.monotonic() + wait
    while time.monotonic() < deadline:
        time.sleep(2)
        try:
            t = Tuner(host, port).connect()
            st = t.refresh_states()
            t.close()
            if FE in st and GC not in st:
                time.sleep(3)
                return
        except (OSError, TunerError):
            pass
    raise RuntimeError("no main menu")


def tb_position(host: str, port: int, map_seed: int) -> dict:
    t = Tuner(host, port).connect()
    lua = ("local o = {} for i = 1, 4 do o[i] = tostring(TerrainBuilder.GetRandomNumber(32768, 'civ6lab h3')) end "
           "print('D ' .. table.concat(o, ' ')) print('SYNC ' .. tostring(Game.GetRandomSeed())) "
           "local m = {} for _, k in ipairs({'world_age', 'sea_level', 'temperature', 'rainfall', 'resources', 'start', "
           "'MAP_SIZE'}) do m[#m + 1] = k .. '=' .. tostring(MapConfiguration.GetValue(k)) end "
           "print('OPTS ' .. table.concat(m, ' '))")
    lines = t.run(GC, lua)
    t.close()
    d = [int(x) for x in next(ln for ln in lines if ln.startswith("D ")).split()[1:]]
    sync = int(next(ln for ln in lines if ln.startswith("SYNC ")).split()[1])
    opts = dict(kv.split("=", 1) for kv in next(ln for ln in lines if ln.startswith("OPTS ")).split()[1:])
    st = find_state(d, 1103515245, 12345)
    n = distance(map_seed & M32, st[0], 1103515245, 12345, 1 << 31) if len(st) == 1 else None
    return {"first_draws": d, "state_after_first": st, "draws_before_probe": None if n is None else n - 1,
            "sync_seed_now": sync, "map_options": opts}


def probe_read(host: str, port: int) -> dict:
    t = Tuner(host, port).connect()
    lines = t.run(GC, LUA_PROBE_READ, timeout=60)
    t.close()
    chunks, xchunks, reasons = {}, {}, {}
    for ln in lines:
        if ln.startswith("C "):
            _, i, body = ln.split(" ", 2)
            chunks[int(i)] = body
        elif ln.startswith("X "):
            _, i, body = (ln + " ").split(" ", 2)
            xchunks[int(i)] = body[:-1]
        elif ln.startswith("REASON "):
            i, _, name = ln[7:].partition("=")
            reasons[int(i)] = name
    log = []
    for i in sorted(chunks):
        log += chunks[i].split(";")
    rec = {"n_chunks": len(chunks), "reasons": reasons, "log": log}
    if xchunks:
        rec["x"] = "".join(xchunks[i] for i in sorted(xchunks)).split(";")
    return rec


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", default="127.0.0.3")
    p.add_argument("--port", type=int, default=4318)
    p.add_argument("--config", required=True)
    p.add_argument("--pairs", required=True, help="map:game,map:game,...")
    p.add_argument("--probe", action="store_true")
    p.add_argument("--mod", default="", help="a mod id added to this game's enabled mods before hosting")
    p.add_argument("--tag", default="")
    p.add_argument("--extra", action="append", default=[],
                   help="file.lua[:State] run in the game before leaving it; its lines go to the record's extra")
    a = p.parse_args()
    out = HERE / "runs" / f"h3_session_{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}.jsonl"
    t = Tuner(a.host, a.port).connect()
    in_game = GC in t.refresh_states()
    t.close()
    if in_game:
        to_menu(a.host, a.port)
    for pair in a.pairs.split(","):
        ms, gs = (int(x) for x in pair.split(":"))
        if a.mod:
            # this game's configuration only; AddEnabledMods(h) adds to the
            # enabled list (a second argument true replaces it, dropping
            # Gathering Storm and hosting a Base-content game)
            t = Tuner(a.host, a.port).connect()
            for ln in t.run(FE, LUA_ADD_MOD.replace("ZMOD", a.mod)):
                print("   ", ln)
            t.close()
        ns = argparse.Namespace(host=a.host, port=a.port, config=a.config, map_seed=ms, game_seed=gs,
                                dry=False, wait=600.0)
        rc = game.cmd_new(ns)
        if rc != 0:
            print("new failed", pair)
            return 1
        tag = f"{a.tag}{pathlib.Path(a.config).stem}_m{ms}_g{gs}"
        rec = {"tag": tag, "config": a.config, "map_seed": ms, "game_seed": gs}
        if a.probe:
            rec["probe"] = probe_read(a.host, a.port)
        rec.update(tb_position(a.host, a.port, ms))
        rec["map_dump"] = str(h3_mapdump.dump(a.host, tag))
        for spec in a.extra:
            path, _, state = spec.partition(":")
            t = Tuner(a.host, a.port).connect()
            try:
                rec.setdefault("extra", {})[pathlib.Path(path).name] = t.run(
                    state or GC, pathlib.Path(path).read_text(encoding="utf-8"), timeout=90)
            except TunerError as e:
                rec.setdefault("extra", {})[pathlib.Path(path).name] = [f"TUNER {e}"]
            t.close()
        with out.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec) + "\n")
        summary = {k: v for k, v in rec.items() if k not in ("probe", "extra")}
        if a.probe:
            summary["probe_entries"] = len(rec["probe"]["log"])
            summary["x_entries"] = len(rec["probe"].get("x", []))
        summary["extra_lines"] = {k: len(v) for k, v in rec.get("extra", {}).items()}
        print(json.dumps(summary))
        to_menu(a.host, a.port)
    print("->", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
