"""The running battery, visible from outside the process.

`.claude/state/battery.json` exists while a battery or a hunt runs and is
removed when it ends. It does two jobs:

  * ONE BATTERY AT A TIME. A second launch reads the file, finds its pid
    alive, and refuses. A file whose pid is dead (a crash, a reboot) is
    stale and is taken over.
  * THE STATUS LINE reads it (`~/.claude/statusline.sh`), so "is it running,
    how far, how long left" is answered on screen instead of by asking.

`.claude/mode` is the OWNER's switch (`tools/mode.py`), one word:

    normal   the default: the cadence rule decides
    build    gates are off: no battery and no hunt runs
    measure  the box is free: the cadence rule is lifted and the run is
             recorded as a clean measurement

A missing or unreadable file is `normal`.
"""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".claude" / "state" / "battery.json"
MODE = ROOT / ".claude" / "mode"
MODES = ("normal", "build", "measure")
HEARTBEAT_S = 15.0

_fields: dict = {}
_lock = threading.Lock()
_stop = threading.Event()


def mode() -> str:
    try:
        m = MODE.read_text(encoding="utf-8").strip().lower()
    except OSError:
        return "normal"
    return m if m in MODES else "normal"


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        k32 = ctypes.windll.kernel32
        h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not h:
            return False
        try:
            code = ctypes.c_ulong()
            if not k32.GetExitCodeProcess(h, ctypes.byref(code)):
                return False
            return code.value == 259  # STILL_ACTIVE
        finally:
            k32.CloseHandle(h)
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def running() -> dict | None:
    """The live record of another battery, or None."""
    try:
        cur = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    pid = int(cur.get("pid") or 0)
    if pid == os.getpid() or not pid_alive(pid):
        return None
    return cur


def _write() -> None:
    _fields["heartbeat"] = int(time.time())
    tmp = STATE.with_suffix(".tmp")
    tmp.write_text(json.dumps(_fields), encoding="utf-8")
    os.replace(tmp, STATE)


def claim(kind: str, head: str, expected_s: float | None) -> None:
    """Write the live record and start the heartbeat. Call after `running()`
    has come back None."""
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with _lock:
        _fields.clear()
        _fields.update(pid=os.getpid(), kind=kind, head=head[:8],
                       started=int(time.time()),
                       expected=int(expected_s) if expected_s else 0,
                       stage="stage0", done=0, total=0, failed=0)
        _write()

    def beat() -> None:
        while not _stop.wait(HEARTBEAT_S):
            with _lock:
                try:
                    _write()
                except OSError:
                    pass

    threading.Thread(target=beat, daemon=True).start()


def update(**kw) -> None:
    with _lock:
        if not _fields:
            return
        _fields.update(kw)
        try:
            _write()
        except OSError:
            pass


def release() -> None:
    _stop.set()
    with _lock:
        if _fields.get("pid") == os.getpid():
            try:
                STATE.unlink()
            except OSError:
                pass
        _fields.clear()


def expected_wall(rows: list[dict]) -> float | None:
    """The median wall of the last five passing runs."""
    walls = [float(r["wall_s"]) for r in rows if r.get("result") == "pass" and r.get("wall_s")][-5:]
    return sorted(walls)[len(walls) // 2] if walls else None
