"""civ6lab cfg_compare — which game setup yields the most city-state data per
hour and per GB (the throughput question behind the observer fleet).

    python tools/civ6lab/cfg_compare.py A=127.0.0.1:<watch log>:<jsonl> B=...

For each setup: the turns played, seconds per turn (mean over the window, and
over its first and last quarter — later turns are slower), the city-states
alive, city-state turns per hour, the game's working set NOW (its process is
found by the `-TunerIP` address on its command line) and city-state turns per
hour per GB.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys

TURN = re.compile(r"^turn (\d+) at ([\d.]+) free_mb (\d+)")


def ram_by_host() -> dict[str, float]:
    ps = ("Get-CimInstance Win32_Process -Filter \"Name like 'CivilizationVI%'\" | "
          "ForEach-Object { $_.CommandLine + '|' + (Get-Process -Id $_.ProcessId).WorkingSet64 }")
    out = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True).stdout
    ram = {}
    for ln in out.splitlines():
        m = re.search(r"-TunerIP\s+(\S+).*\|(\d+)$", ln.strip())
        if m:
            ram[m.group(1)] = int(m.group(2)) / 1024 ** 3
    return ram


def main(argv=None) -> int:
    ram = ram_by_host()
    print(f"{'setup':6} {'turns':>7} {'s/turn':>7} {'early':>6} {'late':>6} {'CS':>4} "
          f"{'CS-turns/h':>11} {'GB':>5} {'CS-turns/h/GB':>14}")
    for spec in argv or sys.argv[1:]:
        name, rest = spec.split("=", 1)
        host, log, jsonl = rest.split(":", 2) if rest.count(":") >= 2 else (rest, "", "")
        stamps = [(int(m.group(1)), float(m.group(2))) for m in
                  (TURN.match(ln) for ln in open(log, encoding="utf-8", errors="replace")) if m]
        if len(stamps) < 3:
            print(f"{name:6} too few turns")
            continue
        per = [b[1] - a[1] for a, b in zip(stamps, stamps[1:])]
        q = max(1, len(per) // 4)
        cs_by_turn: dict[int, int] = {}
        for ln in open(jsonl, encoding="utf-8"):
            if ln.startswith("{"):
                t = json.loads(ln)["t"]
                cs_by_turn[t] = cs_by_turn.get(t, 0) + 1
        span = stamps[-1][1] - stamps[0][1]
        cs_turns = sum(cs_by_turn.get(t, 0) for t, _ in stamps[1:])
        per_h = cs_turns / span * 3600
        gb = ram.get(host, float("nan"))
        cs_now = cs_by_turn.get(stamps[-1][0], 0)
        print(f"{name:6} {stamps[0][0]:>3}-{stamps[-1][0]:<3} {sum(per) / len(per):7.2f} "
              f"{sum(per[:q]) / q:6.2f} {sum(per[-q:]) / q:6.2f} {cs_now:4d} {per_h:11.0f} {gb:5.1f} "
              f"{per_h / gb:14.0f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
