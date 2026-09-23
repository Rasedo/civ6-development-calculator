"""civ6lab game lifecycle — launch Civ 6, start a NEW game, load a save, save
one, with no click from the owner.

    python tools/civ6lab/game.py launch                     # the DX11 binary -> main menu, tuner up
    python tools/civ6lab/game.py new --config lab4.json     # host a game from the main menu
    python tools/civ6lab/game.py load lab4_fresh            # load a named single-player save
    python tools/civ6lab/game.py save lab4_fresh            # write one (InGame)

Every path the owner used to click through rides the game's OWN automation
hooks, the ones Firaxis's smoke test uses (Base/Assets/UI/Automation/
Automation_DailySmokeTest.lua):

* the "Begin Game" / "Continue Game" button: the loading screen presses it
  itself when `Automation.IsAutoStartEnabled()` (FrontEnd/LoadScreen.lua,
  OnLoadGameViewStateDone), so both paths call
  `Automation.SetAutoStartEnabled(true)` first;
* a new game: the setup is `GameConfiguration` / `MapConfiguration` written
  from the FrontEnd state, then `Network.HostGame(ServerType.SERVER_TYPE_NONE)`
  — the smoke test's own call;
* a load: `UI.QuerySaveGameList` names the save and `Network.LoadGame` takes
  it (the smoke test's LoadGame test).

A config is JSON; every key is optional and the game's default stands for a
missing one:
    {"ruleset": "RULESET_EXPANSION_2", "speed": "GAMESPEED_ONLINE",
     "difficulty": "DIFFICULTY_PRINCE", "map": "Continents.lua",
     "size": "MAPSIZE_STANDARD", "city_states": 12, "realism": 2,
     "map_seed": 1234, "game_seed": 5678, "start_era": "ERA_ANCIENT",
     "turn_limit": "none", "all_ai": false}
`realism` is Gathering Storm's disaster intensity (GAME_REALISM, 0-4, default 2);
`all_ai` turns the human slot into an AI one, for an observer-only autoplay
game (the smoke test does the same). The keys map onto the install's
Configuration Parameters rows; those with Hash="1" take DB.MakeHash of the
value name.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from tuner import Tuner, TunerError  # noqa: E402

FE, GC, IG = "FrontEnd", "GameCore_Tuner", "InGame"
# the game's own DX11 binary (lighter on memory than DX12): `steam -applaunch
# 289070` opens 2K's LaunchPad, which waits for a Play click, while the binary
# starts straight to the main menu (Steam must be running for its licence
# check). A Windows Firewall outbound block on the binary keeps it from
# hanging at the copyright screen on 2K's online services.
CIV6_EXE = pathlib.Path(r"C:\Program Files (x86)\Steam\steamapps\common"
                        r"\Sid Meier's Civilization VI\Base\Binaries\Win64Steam\CivilizationVI.exe")

LUA_NEW = """
local cfg = CFG
local out = {}
local function try(name, f)
  local ok, err = pcall(f)
  out[#out + 1] = name .. "=" .. (ok and "ok" or ("ERR " .. tostring(err)))
end
Automation.SetAutoStartEnabled(true)
if cfg.ruleset then try("ruleset", function() GameConfiguration.SetRuleSet(cfg.ruleset) end) end
if cfg.speed then try("speed", function() GameConfiguration.SetValue("GAME_SPEED_TYPE", DB.MakeHash(cfg.speed)) end) end
if cfg.difficulty then try("difficulty", function() GameConfiguration.SetValue("GAME_HANDICAP", DB.MakeHash(cfg.difficulty)) end) end
if cfg.map then try("map", function() MapConfiguration.SetScript(cfg.map) end) end
if cfg.size then
  try("size", function()
    MapConfiguration.SetMapSize(cfg.size)
    local def = GameInfo.Maps[cfg.size]
    if def then
      MapConfiguration.SetMaxMajorPlayers(def.DefaultPlayers)
      GameConfiguration.SetParticipatingPlayerCount(def.DefaultPlayers + GameConfiguration.GetHiddenPlayerCount())
    end
  end)
end
if cfg.city_states then try("city_states", function() GameConfiguration.SetValue("CITY_STATE_COUNT", cfg.city_states) end) end
if cfg.realism then try("realism", function() GameConfiguration.SetValue("GAME_REALISM", cfg.realism) end) end
if cfg.map_seed then try("map_seed", function() MapConfiguration.SetValue("RANDOM_SEED", cfg.map_seed) end) end
if cfg.game_seed then try("game_seed", function() GameConfiguration.SetValue("GAME_SYNC_RANDOM_SEED", cfg.game_seed) end) end
if cfg.start_era then try("start_era", function() GameConfiguration.SetStartEra(cfg.start_era) end) end
if cfg.turn_limit == "none" then try("turn_limit", function() GameConfiguration.SetTurnLimitType(TurnLimitTypes.NONE) end) end
if cfg.all_ai then
  try("all_ai", function()
    for _, id in ipairs(GameConfiguration.GetHumanPlayerIDs()) do
      PlayerConfigurations[id]:SetSlotStatus(SlotStatus.SS_COMPUTER)
    end
  end)
end
for _, s in ipairs(out) do print(s) end
print("readback ruleset=" .. tostring(GameConfiguration.GetRuleSet())
  .. " speed=" .. tostring(GameConfiguration.GetValue("GAME_SPEED_TYPE"))
  .. " handicap=" .. tostring(GameConfiguration.GetValue("GAME_HANDICAP"))
  .. " script=" .. tostring(MapConfiguration.GetScript())
  .. " size=" .. tostring(MapConfiguration.GetMapSize())
  .. " cs=" .. tostring(GameConfiguration.GetValue("CITY_STATE_COUNT"))
  .. " realism=" .. tostring(GameConfiguration.GetValue("GAME_REALISM"))
  .. " majors=" .. tostring(MapConfiguration.GetMaxMajorPlayers())
  .. " autostart=" .. tostring(Automation.IsAutoStartEnabled()))
if not NOHOST then
  Network.HostGame(ServerType.SERVER_TYPE_NONE)
  print("hosting")
end
"""

LUA_LOAD = """
Automation.SetAutoStartEnabled(true)
if not ExposedMembers then ExposedMembers = {} end
ExposedMembers.LabLoad = "pending"
local function OnResults(fileList, qid)
  UI.CloseFileListQuery(qid)
  LuaEvents.FileListQueryResults.Remove(OnResults)
  for _, s in ipairs(fileList) do
    -- the entry's Path names the file; its display Name need not
    local path = tostring(s.Path or "")
    if s.Name == "SAVENAME" or path:sub(-#"/SAVENAME.Civ6Save") == "/SAVENAME.Civ6Save" then
      ExposedMembers.LabLoad = "found"
      if Network.LeaveGame and Game ~= nil then pcall(function() Network.LeaveGame() end) end
      Network.LoadGame(s, ServerType.SERVER_TYPE_NONE)
      return
    end
  end
  ExposedMembers.LabLoad = "notfound"
end
LuaEvents.FileListQueryResults.Add(OnResults)
UI.QuerySaveGameList(SaveLocations.LOCAL_STORAGE, SaveTypes.SINGLE_PLAYER,
  SaveLocationOptions.NORMAL + SaveLocationOptions.AUTOSAVE + SaveLocationOptions.QUICKSAVE + SaveLocationOptions.LOAD_METADATA)
print("query sent autostart=" .. tostring(Automation.IsAutoStartEnabled()))
"""

LUA_LOAD_STATUS = 'print(tostring(ExposedMembers and ExposedMembers.LabLoad))'


def _lua_table(cfg: dict) -> str:
    """A JSON object as a Lua table literal (strings, numbers, booleans)."""
    parts = []
    for k, v in cfg.items():
        if isinstance(v, bool):
            val = "true" if v else "false"
        elif isinstance(v, (int, float)):
            val = repr(v)
        else:
            val = json.dumps(str(v))
        parts.append(f"{k} = {val}")
    return "{ " + ", ".join(parts) + " }"


def _connect(host: str, port: int, wait: float) -> Tuner:
    """A tuner connection, waiting up to `wait` seconds for the socket (the
    game drops it across a load and while it launches)."""
    deadline = time.monotonic() + wait
    last: Exception | None = None
    while time.monotonic() < deadline:
        try:
            return Tuner(host, port).connect()
        except TunerError as e:
            last = e
            time.sleep(3.0)
    raise TunerError(f"no tuner within {wait}s: {last}")


def wait_for_state(host: str, port: int, state: str, wait: float, probe: str | None = None) -> Tuner:
    """Reconnect until `state` is listed (and `probe`, run there, prints
    something that is not an error) — the game is in that phase."""
    deadline = time.monotonic() + wait
    while True:
        left = deadline - time.monotonic()
        if left <= 0:
            raise TunerError(f"state {state} not ready within {wait}s")
        try:
            t = _connect(host, port, left)
            if state in t.refresh_states():
                if probe is None:
                    return t
                try:
                    out = t.run(state, probe, timeout=10)
                    if out:
                        return t
                except TunerError:
                    pass
            t.close()
        except TunerError:
            pass
        time.sleep(3.0)


def cmd_launch(a) -> int:
    try:
        Tuner(a.host, a.port).connect().close()
        print("the game is already up (tuner answers)")
        return 0
    except TunerError:
        pass
    exe = pathlib.Path(a.exe)
    if not exe.exists():
        print(f"no game binary at {exe}; pass --exe")
        return 1
    subprocess.Popen([str(exe)], cwd=str(exe.parent))
    t = wait_for_state(a.host, a.port, FE, a.wait)
    print("main menu up; states:", ", ".join(sorted(t.states)))
    t.close()
    return 0


def cmd_new(a) -> int:
    cfg = json.loads(pathlib.Path(a.config).read_text(encoding="utf-8")) if a.config else {}
    t = _connect(a.host, a.port, 30)
    if FE not in t.refresh_states() or GC in t.states:
        print(f"a new game is hosted from the main menu; the game lists {sorted(t.states)}")
        return 1
    lua = LUA_NEW.replace("CFG", _lua_table(cfg)).replace("NOHOST", "true" if a.dry else "false")
    try:
        for ln in t.run(FE, lua, timeout=30):
            print("   ", ln)
    except TunerError as e:
        # hosting tears the FrontEnd down under the call; the wait below is
        # the verdict
        if a.dry:
            raise
        print("   ", e)
    t.close()
    if a.dry:
        return 0
    t = wait_for_state(a.host, a.port, GC, a.wait, "print(Game.GetCurrentGameTurn())")
    print("in game; turn", t.run(GC, "print(Game.GetCurrentGameTurn())")[0])
    t.close()
    return 0


def cmd_load(a) -> int:
    t = _connect(a.host, a.port, 30)
    states = t.refresh_states()
    where = IG if IG in states else FE
    print("   ", t.run(where, LUA_LOAD.replace("SAVENAME", a.name), timeout=20)[-1])
    status = "pending"
    deadline = time.monotonic() + 30
    while status == "pending" and time.monotonic() < deadline:
        time.sleep(1.0)
        try:
            status = t.run(where, LUA_LOAD_STATUS, timeout=5)[-1]
        except TunerError:
            break  # the load started and took the state with it
    t.close()
    if status == "notfound":
        print(f"no single-player save named {a.name!r}")
        return 1
    time.sleep(5.0)
    t = wait_for_state(a.host, a.port, GC, a.wait, "print(Game.GetCurrentGameTurn())")
    print("loaded; turn", t.run(GC, "print(Game.GetCurrentGameTurn())")[0])
    t.close()
    return 0


def cmd_save(a) -> int:
    t = _connect(a.host, a.port, 30)
    lua = (pathlib.Path(__file__).parent / "save_named.lua").read_text(encoding="utf-8").replace("SAVENAME", a.name)
    print("   ", t.run(IG, lua)[-1])
    t.close()
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=4318)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("launch", help="start Civ 6 (the DX11 binary) and wait for the main menu")
    s.add_argument("--exe", default=str(CIV6_EXE))
    s.add_argument("--wait", type=float, default=240.0)
    s.set_defaults(fn=cmd_launch)
    s = sub.add_parser("new", help="host a new single-player game from the main menu")
    s.add_argument("--config", help="JSON setup (see the module doc)")
    s.add_argument("--dry", action="store_true", help="write the setup and read it back, do not host")
    s.add_argument("--wait", type=float, default=600.0)
    s.set_defaults(fn=cmd_new)
    s = sub.add_parser("load", help="load a named single-player save")
    s.add_argument("name")
    s.add_argument("--wait", type=float, default=600.0)
    s.set_defaults(fn=cmd_load)
    s = sub.add_parser("save", help="write a named single-player save (InGame)")
    s.add_argument("name")
    s.set_defaults(fn=cmd_save)
    a = p.parse_args(argv)
    try:
        return a.fn(a)
    except TunerError as e:
        print("TUNER:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
