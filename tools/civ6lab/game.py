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
     "turn_limit": "none", "all_ai": false, "majors": 6}
`realism` is Gathering Storm's disaster intensity (GAME_REALISM, 0-4, default 2);
`majors` overrides the map size's default number of major civs; `all_ai` turns the human slot into an AI one, for an observer-only autoplay
game (the smoke test does the same). The keys map onto the install's
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
