"""civ6lab game lifecycle — launch Civ 6, start a NEW game, load a save, save
one, with no click from the owner.

    python tools/civ6lab/game.py [--host 127.0.0.N] launch  # the DX11 binary -> main menu, tuner up, window grid
    python tools/civ6lab/game.py new --config lab4.json     # host a game from the main menu
    python tools/civ6lab/game.py load lab4_fresh            # load a named single-player save
    python tools/civ6lab/game.py save lab4_fresh            # write one (InGame)
    python tools/civ6lab/game.py --host 127.0.0.2 close     # end the instance launched with -TunerIP 127.0.0.2

Every path the owner used to click through rides the game's OWN automation
hooks, the ones Firaxis's smoke test uses (Base/Assets/UI/Automation/
Automation_DailySmokeTest.lua):

* the "Begin Game" / "Continue Game" button: the loading screen presses it
  itself when `Automation.IsAutoStartEnabled()` (FrontEnd/LoadScreen.lua,
  OnLoadGameViewStateDone), so both paths call
  `Automation.SetAutoStartEnabled(true)` first;
* a new game: the setup is `GameConfiguration` / `MapConfiguration` written
  from the FrontEnd state, then `Network.HostGame` with no server type — the
  smoke test's own call;
* a load: `UI.QuerySaveGameList` names the save and `Network.LoadGame` takes
  it (the smoke test's LoadGame test).

A config is JSON; every key is optional and the game's default stands for a
missing one:
    {"ruleset": "RULESET_EXPANSION_2", "speed": "GAMESPEED_ONLINE",
     "difficulty": "DIFFICULTY_PRINCE", "map": "Continents.lua",
     "size": "MAPSIZE_STANDARD", "city_states": 12, "realism": 2,
     "map_seed": 1234, "game_seed": 5678, "start_era": "ERA_ANCIENT",
     "turn_limit": "none", "all_ai": false, "majors": 6,
     "world_age": 2, "sea_level": 2, "temperature": 2, "rainfall": 2,
     "resources": 2, "start": 2}
The six map options are written as the setup screen writes them: each one
the map script has a Map-group `Parameters` row for (the script's own rows,
Key1 "Map" / Key2 the script, e.g. Base `Configuration/Data/MapSettings.xml`
for Continents.lua: WorldAge, Temperature, Rainfall, SeaLevel, DefaultValue 2
each; and the global single-player rows of `SetupParameters.xml`: Resources 2,
StartPosition 2) takes its row's DefaultValue, read from the FrontEnd's
Configuration database at host time; a config key overrides it (the domains:
world age 1 new / 2 standard / 3 old / 4 random, sea level 1 low / 2 standard
/ 3 high / 4 random, temperature 1 hot / 2 standard / 3 cold / 4 random,
rainfall 1 arid / 2 standard / 3 wet / 4 random, resources 1 sparse / 2
standard / 3 abundant / 4 random, start 1 balanced / 2 standard / 3
legendary). Unset, Continents rolls World Age and Sea Level itself.
`max_turns` sets a CUSTOM turn limit (the score victory's turn; a running
game ignores a later change);
`realism` is Gathering Storm's disaster intensity (GAME_REALISM, 0-4, default 2);
`leaders` (a list of LeaderType names) sets the major slots' leaders in slot
order, the observer slot skipped;
`majors` overrides the map size's default number of major civs; `all_ai`
makes every major an AI and the host an OBSERVER in slot 0 (the majors take
slots 1..n), a game that plays itself with no local player. `--map-seed` /
`--game-seed` override the config's seeds. `new` prints the game's own
readback once it is up: turn, seeds, the map options, humans, minors and
the major seats (`game_info`). The keys map onto the install's
Configuration Parameters rows; those with Hash="1" take DB.MakeHash of the
value name.
"""
from __future__ import annotations

import argparse
import json
import re
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

CIV6_APP = "289070"
USER_DIR = pathlib.Path.home() / "AppData" / "Local" / "Firaxis Games" / "Sid Meier's Civilization VI"
INSTALL = CIV6_EXE.parents[3]

# THE LAB PROFILE: the options a lean autoplay run wants, per file. `profile
# apply` backs each file up once (<file>.lab-backup) and writes these keys;
# `profile restore` puts the owner's files back byte for byte.
LAB_PROFILE: dict[str, dict[str, str]] = {
    "AppOptions.txt": {"RenderWidth": "800", "RenderHeight": "600", "FullScreen": "0",
                       "PlayIntroVideo": "0"},
    "GraphicsOptions.txt": {
        "MSAA": "0", "MSAAQuality": "0", "VSync": "1", "ShadowMapResolution": "512",
        "AODepthResolution": "256", "AORenderResolution": "256", "ReducedAssetTextures": "1",
        "TerrainQuality": "0", "ReducedTerrainMaterials": "1", "LowQualityTerrainShader": "1",
        "SSReflectPasses": "0", "UseLowResWater": "1", "UseLowQualityWaterShader": "1",
        "VFXDetailLevel": "0", "ClutterDetailLevel": "0", "EnableAO": "0", "EnableBloom": "0",
        "EnableShadows": "0", "EnableDynamicLighting": "0", "EnableCloudShadows": "0",
        "Quality": "0",
        # no 3D world at all: half the GPU of the lean world render, turns unchanged
        "UIOnlyRendering": "1",
    },
    "SoundOpts.txt": {"Master Volume": "0"},
    "UserOptions.txt": {"QuickMovement": "1", "QuickCombat": "1", "LookAtPlayerTurnCombat": "0",
                        "LookAtPlayerOffTurnCombat": "0", "PlayHistoricMomentAnimation": "0",
                        "AutoSaveFrequency": "50"},
}

# THE STARTUP PATCH: what no mod reaches, because the engine plays it before
# the mod system loads — the two logo movies (a missing movie is skipped) and
# the copyright screen's 5 s legal delay (IntroScreen.lua ACCEPT_DELAY).
LOGO_MOVIES = ("Base/Platforms/Windows/Movies/logos.bk2", "Base/Platforms/Windows/Movies/LOGO_2KFiraxis.bk2")
INTRO_LUA = "Base/Assets/UI/FrontEnd/IntroScreen.lua"
INTRO_RE = re.compile(r"local ACCEPT_DELAY\s*:number = UI\.IsFinalRelease\(\) and 5 or 0\.1;")
INTRO_NEW = "local ACCEPT_DELAY :number = 0;"


def _set_keys(path: pathlib.Path, keys: dict[str, str]) -> list[str]:
    """Rewrite `Key value` lines in an options file; returns the keys it did
    not find."""
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    missing = dict(keys)
    for i, ln in enumerate(lines):
        s = ln.strip()
        if not s or s.startswith(";") or s.startswith("["):
            continue
        for k in list(missing):
            if s == k or (s.startswith(k + " ") and not s[len(k) + 1:].strip().startswith(";")):
                lines[i] = f"{k} {missing.pop(k)}"
                break
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return sorted(missing)


def cmd_profile(a) -> int:
    if a.action == "restore":
        for name in LAB_PROFILE:
            f, b = USER_DIR / name, USER_DIR / (name + ".lab-backup")
            if b.exists():
                f.write_bytes(b.read_bytes())
                b.unlink()
                print("restored", name)
        return 0
    for name, keys in LAB_PROFILE.items():
        f, b = USER_DIR / name, USER_DIR / (name + ".lab-backup")
        if not b.exists():
            b.write_bytes(f.read_bytes())
        miss = _set_keys(f, keys)
        print("lab profile", name, "- not found:" if miss else "", *miss)
    return 0


def cmd_patch(a) -> int:
    # Started outside Steam, the binary asks Steam to relaunch it through its
    # own launch path (the DX12 build) and exits with code 53; the app id file
    # beside it makes it run as itself — the DX11 build, and a second instance.
    appid = CIV6_EXE.parent / "steam_appid.txt"
    if a.action == "apply" and not appid.exists():
        appid.write_text(CIV6_APP, encoding="ascii")
        print("steam_appid.txt written")
    elif a.action == "revert" and appid.exists():
        appid.unlink()
        print("steam_appid.txt removed")
    for rel in LOGO_MOVIES:
        f, b = INSTALL / rel, INSTALL / (rel + ".lab-off")
        if a.action == "apply" and f.exists():
            f.rename(b)
            print("logo off:", rel)
        elif a.action == "revert" and b.exists():
            b.rename(f)
            print("logo back:", rel)
    f, b = INSTALL / INTRO_LUA, INSTALL / (INTRO_LUA + ".lab-backup")
    if a.action == "apply":
        s = f.read_bytes().decode("utf-8")
        new, n = INTRO_RE.subn(INTRO_NEW, s, count=1)
        if n:
            if not b.exists():
                b.write_bytes(f.read_bytes())
            f.write_bytes(new.encode("utf-8"))
            print("copyright delay: 0 s")
        else:
            print("copyright delay: already patched or the line changed")
    elif b.exists():
        f.write_bytes(b.read_bytes())
        b.unlink()
        print("copyright delay restored")
    return 0


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
if cfg.majors then
  try("majors", function()
    MapConfiguration.SetMaxMajorPlayers(cfg.majors)
    GameConfiguration.SetParticipatingPlayerCount(cfg.majors + GameConfiguration.GetHiddenPlayerCount())
  end)
end
-- the map options, as the setup screen writes them: every Map-group
-- Parameters row among MAP_OPTIONS that applies to this script (global, Key1
-- IS NULL, or Key1 'Map' with Key2 the script; a single-player row; its
-- ParameterCriteria met) at its DefaultValue, a config key of the same name
-- over it. A config key for an option the script has no row for is written
-- too; an option with neither stays unset.
local MAP_OPTIONS = { "world_age", "sea_level", "temperature", "rainfall", "resources", "start" }
local mapopts = {}
try("map_options", function()
  local script = MapConfiguration.GetScript()
  local crit = {}
  for _, c in ipairs(DB.ConfigurationQuery("SELECT * FROM ParameterCriteria") or {}) do
    crit[c.ParameterId] = crit[c.ParameterId] or {}
    table.insert(crit[c.ParameterId], c)
  end
  local function meets(pid)
    for _, c in ipairs(crit[pid] or {}) do
      local actual
      if c.ConfigurationGroup == "Map" then actual = MapConfiguration.GetValue(c.ConfigurationId)
      else actual = GameConfiguration.GetValue(c.ConfigurationId) end
      local eq = tostring(actual) == tostring(c.ConfigurationValue)
      if (c.Operator == "Equals" and not eq) or (c.Operator == "NotEquals" and eq) then return false end
    end
    return true
  end
  local rows = DB.ConfigurationQuery("SELECT * FROM Parameters WHERE ConfigurationGroup = 'Map' AND "
    .. "((Key1 IS NULL AND Key2 IS NULL) OR (Key1 = 'Map' AND Key2 = ?))", script) or {}
  local default = {}
  for _, r in ipairs(rows) do
    local sp = r.SupportsSinglePlayer
    if sp ~= false and sp ~= 0 and sp ~= "0" and meets(r.ParameterId) then
      default[r.ConfigurationId] = tonumber(r.DefaultValue)
    end
  end
  for _, k in ipairs(MAP_OPTIONS) do
    local v, how = cfg[k], "config"
    if v == nil then v, how = default[k], "default" end
    if v ~= nil then
      MapConfiguration.SetValue(k, v)
      mapopts[#mapopts + 1] = k .. "=" .. tostring(v) .. "(" .. how .. ")"
    else
      mapopts[#mapopts + 1] = k .. "=unset"
    end
  end
end)
print("map options " .. table.concat(mapopts, " "))
if cfg.city_states then try("city_states", function() GameConfiguration.SetValue("CITY_STATE_COUNT", cfg.city_states) end) end
if cfg.realism then try("realism", function() GameConfiguration.SetValue("GAME_REALISM", cfg.realism) end) end
if cfg.map_seed then try("map_seed", function() MapConfiguration.SetValue("RANDOM_SEED", cfg.map_seed) end) end
if cfg.game_seed then try("game_seed", function() GameConfiguration.SetValue("GAME_SYNC_RANDOM_SEED", cfg.game_seed) end) end
if cfg.start_era then try("start_era", function() GameConfiguration.SetStartEra(cfg.start_era) end) end
if cfg.turn_limit == "none" then try("turn_limit", function() GameConfiguration.SetTurnLimitType(TurnLimitTypes.NONE) end) end
if cfg.max_turns then
  try("max_turns", function()
    GameConfiguration.SetTurnLimitType(TurnLimitTypes.CUSTOM)
    GameConfiguration.SetMaxTurns(cfg.max_turns)
  end)
end
if cfg.all_ai then
  try("all_ai", function()
    -- the host takes a slot of its own when it hosts: turning the human
    -- slots into AI ones (the smoke test's way) leaves slot 0 SS_TAKEN again
    -- once the game starts. So slot 0 becomes the host's OBSERVER slot and
    -- the majors move up one: n + 1 participants, slots 1..n AI majors.
    -- The map places the ALIVE majors (AssignStartingPlots reads
    -- PlayerManager.GetAliveMajorsCount), which the observer is not.
    local n = MapConfiguration.GetMaxMajorPlayers()
    for _, id in ipairs(GameConfiguration.GetHumanPlayerIDs()) do
      PlayerConfigurations[id]:SetSlotStatus(SlotStatus.SS_COMPUTER)
    end
    MapConfiguration.SetMaxMajorPlayers(n + 1)
    GameConfiguration.SetParticipatingPlayerCount(n + 1 + GameConfiguration.GetHiddenPlayerCount())
    PlayerConfigurations[n]:SetSlotStatus(SlotStatus.SS_COMPUTER)
    PlayerConfigurations[n]:SetMajorCiv()
    PlayerConfigurations[0]:SetSlotStatus(SlotStatus.SS_OBSERVER)
  end)
end
if cfg.leaders then
  try("leaders", function()
    local k = 1
    for _, id in ipairs(GameConfiguration.GetParticipatingPlayerIDs()) do
      local pc = PlayerConfigurations[id]
      if cfg.leaders[k] and pc:GetSlotStatus() ~= SlotStatus.SS_OBSERVER and pc:GetSlotStatus() ~= SlotStatus.SS_CLOSED then
        pc:SetLeaderTypeName(cfg.leaders[k])
        k = k + 1
      end
    end
  end)
end
for _, s in ipairs(out) do print(s) end
local slots = {}
for _, id in ipairs(GameConfiguration.GetParticipatingPlayerIDs()) do
  slots[#slots + 1] = id .. ":" .. tostring(PlayerConfigurations[id]:GetSlotStatus())
end
print("slots " .. table.concat(slots, " ") .. " slot0=" .. tostring(PlayerConfigurations[0]:GetSlotStatus()))
print("readback ruleset=" .. tostring(GameConfiguration.GetRuleSet())
  .. " speed=" .. tostring(GameConfiguration.GetValue("GAME_SPEED_TYPE"))
  .. " handicap=" .. tostring(GameConfiguration.GetValue("GAME_HANDICAP"))
  .. " script=" .. tostring(MapConfiguration.GetScript())
  .. " size=" .. tostring(MapConfiguration.GetMapSize())
  .. " cs=" .. tostring(GameConfiguration.GetValue("CITY_STATE_COUNT"))
  .. " realism=" .. tostring(GameConfiguration.GetValue("GAME_REALISM"))
  .. " majors=" .. tostring(MapConfiguration.GetMaxMajorPlayers())
  .. " map_seed=" .. tostring(MapConfiguration.GetValue("RANDOM_SEED"))
  .. " game_seed=" .. tostring(GameConfiguration.GetValue("GAME_SYNC_RANDOM_SEED"))
  .. " world_age=" .. tostring(MapConfiguration.GetValue("world_age"))
  .. " sea_level=" .. tostring(MapConfiguration.GetValue("sea_level"))
  .. " temperature=" .. tostring(MapConfiguration.GetValue("temperature"))
  .. " rainfall=" .. tostring(MapConfiguration.GetValue("rainfall"))
  .. " resources=" .. tostring(MapConfiguration.GetValue("resources"))
  .. " start=" .. tostring(MapConfiguration.GetValue("start"))
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

# GameCore, once a game is up: the turn, the seeds the game was set up with,
# and who holds each living major seat
LUA_GAME_INFO = """
local majors, minors, humans = {}, 0, 0
for p = 0, 62 do
  local pl = Players[p]
  if pl ~= nil and pl:IsAlive() then
    if pl:IsMajor() then
      majors[#majors + 1] = "\\"" .. p .. "\\":\\"" .. tostring(PlayerConfigurations[p]:GetLeaderTypeName()) .. "\\""
      if pl:IsHuman() then humans = humans + 1 end
    else
      minors = minors + 1
    end
  end
end
local opts = {}
for _, k in ipairs({ "world_age", "sea_level", "temperature", "rainfall", "resources", "start" }) do
  opts[#opts + 1] = "\\"" .. k .. "\\":" .. tostring(MapConfiguration.GetValue(k) or "null")
end
print("{\\"turn\\":" .. Game.GetCurrentGameTurn()
  .. ",\\"map_seed\\":" .. tostring(MapConfiguration.GetValue("RANDOM_SEED"))
  .. ",\\"map_options\\":{" .. table.concat(opts, ",") .. "}"
  .. ",\\"game_seed\\":" .. tostring(GameConfiguration.GetValue("GAME_SYNC_RANDOM_SEED"))
  .. ",\\"humans\\":" .. humans .. ",\\"minors\\":" .. minors
  .. ",\\"majors\\":{" .. table.concat(majors, ",") .. "}}")
"""


def game_info(t: Tuner) -> dict:
    """the running game's turn, seeds, human count and major seats
    (`LUA_GAME_INFO`)"""
    return json.loads(t.run(GC, LUA_GAME_INFO)[-1])


def _lua_table(cfg: dict) -> str:
    """A JSON object as a Lua table literal (strings, numbers, booleans, and
    lists of strings)."""
    parts = []
    for k, v in cfg.items():
        if isinstance(v, bool):
            val = "true" if v else "false"
        elif isinstance(v, (int, float)):
            val = repr(v)
        elif isinstance(v, list):
            val = "{ " + ", ".join(json.dumps(str(x)) for x in v) + " }"
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


def up(host: str, port: int) -> bool:
    """the instance's tuner answers"""
    try:
        Tuner(host, port).connect().close()
        return True
    except TunerError:
        return False


def spawn(host: str, exe: pathlib.Path) -> None:
    """start one instance; `-TunerIP` is the address its tuner LISTENS on:
    one instance per loopback address (127.0.0.1, 127.0.0.2, ...), all on
    port 4318"""
    subprocess.Popen([str(exe), "-TunerIP", host], cwd=str(exe.parent))


def retile() -> None:
    grid = pathlib.Path(__file__).parent / "window.ps1"
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(grid), "grid"],
                   capture_output=True, text=True)


def cmd_launch(a) -> int:
    if up(a.host, a.port):
        print("the game is already up (tuner answers)")
        return 0
    exe = pathlib.Path(a.exe)
    if not exe.exists():
        print(f"no game binary at {exe}; pass --exe")
        return 1
    spawn(a.host, exe)
    t = wait_for_state(a.host, a.port, FE, a.wait)
    print("main menu up; states:", ", ".join(sorted(t.states)))
    t.close()
    retile()
    return 0


def _ps(cmd: str) -> str:
    return subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, text=True,
                          encoding="utf-8", errors="replace").stdout


def instance_pids(host: str) -> list[int]:
    """the Civ 6 processes whose command line carries `-TunerIP <host>` —
    the one instance `game.py --host <host> launch` started"""
    pat = r"-TunerIP\s+" + re.escape(host) + r"(\s|$)"
    out = _ps("Get-CimInstance Win32_Process -Filter \"Name LIKE 'CivilizationVI%'\" | "
              f"Where-Object {{ $_.CommandLine -match '{pat}' }} | ForEach-Object {{ $_.ProcessId }}")
    return [int(x) for x in out.split() if x.isdigit()]


def instance_private_mb(host: str) -> float | None:
    """the private memory (commit) of the instance launched for `host`, MB;
    None when no process carries its -TunerIP"""
    pat = r"-TunerIP\s+" + re.escape(host) + r"(\s|$)"
    out = _ps("Get-CimInstance Win32_Process -Filter \"Name LIKE 'CivilizationVI%'\" | "
              f"Where-Object {{ $_.CommandLine -match '{pat}' }} | ForEach-Object {{ $_.PrivatePageCount }}")
    vals = [int(x) for x in out.split() if x.isdigit()]
    return sum(vals) / 2**20 if vals else None


def close_instance(host: str) -> list[int]:
    """terminate the instance launched for `host`, and no other; returns the
    pids stopped"""
    pids = instance_pids(host)
    for pid in pids:
        _ps(f"Stop-Process -Id {pid} -Force")
    return pids


AT_END = ("menu", "close", "stay")
LUA_EXIT = ('pcall(function() Automation.Pause(false) end); '
            'print("left the game at turn " .. Game.GetCurrentGameTurn()); Events.ExitToMainMenu()')


def finish(t: Tuner | None, host: str, how: str) -> str:
    """what a run does with its game at its target: `menu` exits to the main
    menu (ready to host the next game without a relaunch), `close` ends the
    instance's process (`close_instance`), `stay` leaves the game where it
    stopped"""
    if how == "menu":
        if t is None:
            return "no tuner to exit through"
        try:
            out = t.run(IG, LUA_EXIT)
            return out[-1] if out else "exit requested"
        except TunerError as e:
            return f"exit requested ({e})"
    if how == "close":
        if t is not None:
            t.close()
        pids = close_instance(host)
        return f"closed pid {pids}" if pids else f"no process carries -TunerIP {host}; nothing closed"
    return "left the game as it stands"


def cmd_close(a) -> int:
    pids = close_instance(a.host)
    print(f"closed {pids}" if pids else f"no Civ 6 process carries -TunerIP {a.host}")
    return 0 if pids else 1


def cmd_new(a) -> int:
    cfg = json.loads(pathlib.Path(a.config).read_text(encoding="utf-8")) if a.config else {}
    if a.map_seed is not None:
        cfg["map_seed"] = a.map_seed
    if a.game_seed is not None:
        cfg["game_seed"] = a.game_seed
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
    print("in game", json.dumps(game_info(t)))
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


def _game_ram_mb() -> float:
    """The running game's working set, MB (tasklist)."""
    out = subprocess.run(["tasklist", "/fo", "csv", "/nh"], capture_output=True, text=True,
                         encoding="utf-8", errors="replace").stdout
    for ln in out.splitlines():
        if ln.lower().startswith('"civilizationvi'):
            mem = ln.rsplit(",", 1)[-1].strip('"').replace("\xa0", "").replace(" ", "")
            digits = "".join(ch for ch in mem if ch.isdigit())
            return int(digits) / 1024 if digits else 0.0
    return 0.0


def cmd_bench(a) -> int:
    """Load a fixed save and time N Autoplay turns: the throughput a profile
    buys, measured the same way every time."""
    import lab
    if a.save:
        cmd_load(argparse.Namespace(host=a.host, port=a.port, name=a.save, wait=600.0))
    t = _connect(a.host, a.port, 60)
    lp = lab.local_player(t)
    t0 = lab.turn(t)
    per: list[float] = []
    peak = _game_ram_mb()
    for _ in range(a.turns):
        s = time.monotonic()
        lab.advance(t, "autoplay", lp, 600.0)
        per.append(time.monotonic() - s)
        peak = max(peak, _game_ram_mb())
    # the human seat holds its turn once Autoplay hands it back: the game
    # stands at the target until `finish` acts
    print("   ", finish(t, a.host, a.at_end))
    if a.at_end != "close":
        t.close()
    per.sort()
    print(f"bench {a.label}: turns {t0}->{t0 + a.turns}  mean {sum(per) / len(per):.2f} s/turn"
          f"  median {per[len(per) // 2]:.2f}  max {per[-1]:.2f}  peak RAM {peak:.0f} MB")
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
    s.add_argument("--map-seed", type=int, help="the map seed (MapConfiguration RANDOM_SEED), over the config's")
    s.add_argument("--game-seed", type=int, help="the game seed (GAME_SYNC_RANDOM_SEED), over the config's")
    s.add_argument("--wait", type=float, default=600.0)
    s.set_defaults(fn=cmd_new)
    s = sub.add_parser("load", help="load a named single-player save")
    s.add_argument("name")
    s.add_argument("--wait", type=float, default=600.0)
    s.set_defaults(fn=cmd_load)
    s = sub.add_parser("profile", help="apply / restore the lean lab profile in the owner's option files")
    s.add_argument("action", choices=("apply", "restore"))
    s.set_defaults(fn=cmd_profile)
    s = sub.add_parser("patch", help="apply / revert the startup patch (logo movies off, copyright delay 0)")
    s.add_argument("action", choices=("apply", "revert"))
    s.set_defaults(fn=cmd_patch)
    s = sub.add_parser("bench", help="load a save and time N Autoplay turns")
    s.add_argument("--save", default="lab4_t100")
    s.add_argument("--turns", type=int, default=15)
    s.add_argument("--label", default="")
    s.add_argument("--at-end", choices=AT_END, default="menu",
                   help="at the target: exit to the main menu, close the instance, or stay")
    s.set_defaults(fn=cmd_bench)
    s = sub.add_parser("save", help="write a named single-player save (InGame)")
    s.add_argument("name")
    s.set_defaults(fn=cmd_save)
    s = sub.add_parser("close", help="terminate the instance launched with -TunerIP <--host>, and no other")
    s.set_defaults(fn=cmd_close)
    a = p.parse_args(argv)
    try:
        return a.fn(a)
    except TunerError as e:
        print("TUNER:", e)
        return 1


if __name__ == "__main__":
    sys.exit(main())
