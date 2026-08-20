"""The verification battery: every gate an engine change must pass, in parallel.

    python gpu/battery.py              # all lanes
    python gpu/battery.py --no-bail    # keep every lane running past a failure

Stage 0 is serial because everything below depends on it: the TS and Python
static gates, the seeder-drift check against the committed worlds.lock, then
the world seed and the fixture export.
Two lanes then run concurrently:

    vitest + serve : the TS suite, then the decision-server gate
                     (serve_gate --batched) — ONE B=12 GPU sim against twelve
                     TS children, with per-turn obs/job/spread/buy equality
                     and a state-digest compare
    pokes          : the per-mechanic GPU self-tests, through a bounded pool

Wall-clock is stage 0 plus the slowest lane. Each step's OMP thread count is
capped so concurrent torch processes do not oversubscribe the box. Exit code
is nonzero if ANY step fails; the table at the end gives per-step wall time
and status.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FULL = "--full" in sys.argv
NO_BAIL = "--no-bail" in sys.argv

# Poke pool: 4 workers x OMP 2 = 8 threads. Deliberately small — the box is 24
# cores and the serve lane's twelve TS children already claim most of them.
POKE_WORKERS = 4
POKE_OMP = 2

POKE_COST = {
    "great_works": 2.7, "religion_gp": 3.2, "government": 3.3,
    "relics": 3.4, "trade2": 3.5, "parks": 3.5, "bankruptcy": 3.7, "domination": 3.8,
    "culture_victory": 4.3, "space_race": 4.8, "encampment": 4.9, "citystate_verbs": 6.6,
    "citystate_bonus": 7.9, "buy_wire": 9.2, "city_registry": 12.4, "controlled": 13.8,
    "combat_mod": 17.1, "ranged": 18.5, "occupancy": 21.0,
    "governors": 22.2, "war_weariness": 23.2, "geopolitics": 23.8, "seat": 29.0,
    "gp_aura": 31.6, "war": 32.5, "religion2": 51.7,
    "naval": 53.7, "districts": 87.9, "watermill": 12.0, "fort": 6.0,
    "festival": 4.0, "citystate_war": 6.0, "snapshot": 30.0, "golden_move": 3.0, "pref_apply": 8.0, "seat_verbs": 10.0, "drive": 60.0,
    "civ_pair_strike": 12.0,
    "spawn_reclaim": 6.0,
    "centre_defence": 14.0,
}

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "gpu"))
import test_stats as _stats  # noqa: E402

results: list[tuple[str, float, int]] = []
lock = threading.Lock()
failed = threading.Event()


def run(name: str, cmd: list[str], threads: int = 8, bail: bool = True) -> None:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env["OMP_NUM_THREADS"] = str(threads)
    env["MKL_NUM_THREADS"] = str(threads)
    t0 = time.time()
    p = subprocess.Popen(
        cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
    )
    while True:
        try:
            out, err = p.communicate(timeout=1.0)
            break
        except subprocess.TimeoutExpired:
            if bail and failed.is_set() and not NO_BAIL:
                p.kill()
                p.communicate()
                dt = time.time() - t0
                with lock:
                    results.append((name, dt, -3))
                    print(f"  {name:<14} {dt:6.1f}s  bail  (another lane failed)", flush=True)
                return
    p = subprocess.CompletedProcess(cmd, p.returncode, out, err)
    dt = time.time() - t0
    with lock:
        results.append((name, dt, p.returncode))
        status = "ok" if p.returncode == 0 else f"FAIL rc={p.returncode}"
        print(f"  {name:<14} {dt:6.1f}s  {status}", flush=True)
        if p.returncode == 0 and name.startswith("eval"):
            for ln in p.stdout.strip().splitlines()[-1:]:
                print(f"    | {ln}", flush=True)
        if p.returncode != 0:
            failed.set()
            tail = (p.stdout + "\n" + p.stderr).strip().splitlines()[-15:]
            print("    | " + "\n    | ".join(tail), flush=True)


def lane_parallel(steps: list[tuple[str, list[str], int]], workers: int, threads: int) -> None:
    pos = [0]
    lk = threading.Lock()

    def worker() -> None:
        while True:
            with lk:
                if pos[0] >= len(steps):
                    return
                name, cmd, _ = steps[pos[0]]
                pos[0] += 1
            # DRAIN, don't bail: a poke failure still sets `failed` and so still
            # kills the expensive lanes immediately, but the pool itself runs to
            # completion — it costs ~90s and it is what makes ALL poke reds
            # surface in one run.
            run(name, cmd, threads, bail=False)

    ws = [threading.Thread(target=worker) for _ in range(workers)]
    for w in ws:
        w.start()
    for w in ws:
        w.join()


def lane(steps: list[tuple[str, list[str], int]]) -> None:
    for name, cmd, threads in steps:
        if failed.is_set() and not NO_BAIL:
            with lock:
                results.append((name, 0.0, -1))
                print(f"  {name:<14}   skip  (earlier failure)", flush=True)
            continue
        run(name, cmd, threads)


def main() -> int:
    npx = "npx.cmd" if os.name == "nt" else "npx"
    npm = "npm.cmd" if os.name == "nt" else "npm"
    py = sys.executable
    ruff = Path(py).with_name("ruff.exe" if os.name == "nt" else "ruff")
    t0 = time.time()

    print("stage 0 (serial): tsc, export", flush=True)
    for name, cmd in (
        ("tsc", [npx, "tsc", "--noEmit"]),
        ("parse", ["node", "tools/parse-check.mjs"]),
        ("lint", [npx, "oxlint", "cpu", "seeder", "world", "tools", "tests"]),  # no-constant-binary-expression et al
        # F821 = UNDEFINED NAME on the Python side, ~0.3s. Without it an
        # undefined name in a rarely-reached engine branch presents as a crash
        # or hang deep inside a lane instead of an import error.
        ("f821", [str(ruff), "check", "--select", "F821", "gpu", "policy", "tools"]),
        ("pyright", [npx, "pyright"]),
        # The lock check runs BEFORE seed: `seed` rewrites worlds.lock, so a
        # check placed after it diffs a generation against itself and can
        # never fail. Checked first, it diffs against the COMMITTED baseline —
        # seeder drift fails here, and re-baselining is an explicit
        # `npm run seed` + commit, never a battery side effect.
        ("lock", [npm, "run", "seed:check"]),
        ("seed", [npm, "run", "seed"]),
        ("export", [npm, "run", "export"]),
    ):
        run(name, cmd, threads=24)
        if failed.is_set():
            break

    if not failed.is_set():
        print("lanes (parallel): vitest+serve | gpu pokes", flush=True)
        lanes = [
            [
                ("vitest", [npm, "test"], 8),
                # The DECISION-SERVER gate: one B=12 sim, twelve TS children,
                # per-turn obs/unit-target equality and a state-digest compare.
                ("serve", [py, "gpu/serve_gate.py", "--batched", "--turns", "250"], 6),
            ],
            [
                ("buy_wire", [py, "tests/gpu/buy_wire_test.py"], 4),
                ("war", [py, "tests/gpu/war_test.py"], 4),
                ("ranged", [py, "tests/gpu/ranged_test.py"], 4),
                ("combat_mod", [py, "tests/gpu/combat_mod_test.py"], 4),
                ("occupancy", [py, "tests/gpu/occupancy_test.py"], 4),
                ("domination", [py, "tests/gpu/domination_test.py"], 4),
                ("peace_target", [py, "tests/gpu/peace_target_test.py"], 2),  # no attack without a war
                ("peace_treaty", [py, "tests/gpu/peace_treaty_test.py"], 2),  # the treaty shuts the declare column for its term
                ("city_falls", [py, "tests/gpu/city_falls_test.py"], 2),  # a fallen city takes its garrison with it
                ("flood_district", [py, "tests/gpu/flood_district_test.py"], 2),  # a flood pillages the district on the floodplain
                ("martyr", [py, "tests/gpu/martyr_test.py"], 2),  # one relic in nine apostle deaths, drawn where TS draws
                ("barb_camps", [py, "tests/gpu/barb_camps_test.py"], 2),  # a camp's class is its ground; ranged is nobody's class
                ("suzerain_rules", [py, "tests/gpu/suzerain_rules_test.py"], 2),  # the six suz-coded perks, strict-suzerain-only
                ("dedications", [py, "tests/gpu/dedications_test.py"], 2),  # both faces of the four new catalog entries
                ("civ_pair_strike", [py, "tests/gpu/civ_pair_strike_test.py"], 2),  # a civ city fires on an enemy civ
                ("spawn_reclaim", [py, "tests/gpu/spawn_reclaim_test.py"], 2),  # a reclaimed slot hands on no drowned unit's MP
                ("centre_defence", [py, "tests/gpu/centre_defence_test.py"], 2),  # a centre is attacked as the CITY
                ("stack_rules", [py, "tests/gpu/stack_rules_test.py"], 2),  # cross-domain stacking + Encampment spawn wall
                ("golden_move", [py, "tests/gpu/golden_move_test.py"], 2),  # MONUMENTALITY / EXODUS +2 MP, per seat
                ("bankruptcy", [py, "tests/gpu/bankruptcy_test.py"], 4),
                ("seat", [py, "tests/gpu/seat_test.py"], 4),
                ("government", [py, "tests/gpu/government_test.py"], 4),
                ("controlled", [py, "tests/gpu/controlled_test.py"], 4),
                ("pref_apply", [py, "tests/gpu/pref_apply_test.py"], 4),  # preference-order apply — the ONLY lane that reaches it
                ("seat_verbs", [py, "tests/gpu/seat_verbs_test.py"], 4),  # the 9 civ unit verbs — asserts EXECUTION, not legality
                ("drive", [py, "tests/gpu/drive_test.py"], 4),  # the ladder DRIVES a seat for a whole game
                ("religion_gp", [py, "tests/gpu/religion_gp_test.py"], 4),
                ("war_weariness", [py, "tests/gpu/war_weariness_test.py"], 4),
                ("space_race", [py, "tests/gpu/space_race_test.py"], 4),
                ("research_switch", [py, "tests/gpu/research_switch_test.py"], 4),  # switching research keeps the abandoned item's science
                ("district_wire", [py, "tests/gpu/district_wire_test.py"], 4),  # the district TILE rides the wire; no engine scans for a plot
                ("culture_victory", [py, "tests/gpu/culture_victory_test.py"], 4),  # the culture win, which the serve gate never reaches
                ("relics", [py, "tests/gpu/relics_test.py"], 4),  # martyr relics — temple slots, faith + tourism
                ("festival", [py, "tests/gpu/festival_test.py"], 4),  # Festival pays THREE GP classes at 0.11 (serve gate never reaches it)
                ("citystate_war", [py, "tests/gpu/cs_war_test.py"], 4),  # war with a city-state gates the attack mask
                ("snapshot", [py, "tests/gpu/snapshot_restore_test.py"], 4),  # _MUTABLE round-trip + step determinism (the ONLY lane that restores)
                ("naval", [py, "tests/gpu/naval_test.py"], 4),  # naval surfaces the serve gate never reaches
                ("districts", [py, "tests/gpu/district_breadth_test.py"], 4),  # district catalog breadth
                ("city_registry", [py, "tests/gpu/rc_registry_test.py"], 4),  # district/tile registry consistency, every seat row
                ("religion2", [py, "tests/gpu/religion2_test.py"], 4),  # missionary / enhancer / religious-victory surfaces
                ("encampment", [py, "tests/gpu/encampment_test.py"], 4),  # Encampment strike + training XP + specialist surfaces
                ("great_works", [py, "tests/gpu/great_works_test.py"], 4),  # Writer/Musician Great-Work slots + yield
                ("gp_aura", [py, "tests/gpu/gp_aura_test.py"], 4),  # Great General/Admiral spawn/walk/aura/capture (GENERAL unreachable in the gate)
                ("citystate_bonus", [py, "tests/gpu/cs_bonus_test.py"], 4),  # CS envoy building re-key + suzerain perk (6-envoy tier unreachable in the gate)
                ("citystate_verbs", [py, "tests/gpu/cs_verbs_test.py"], 4),  # levy + city-state quests
                ("trade2", [py, "tests/gpu/trade2_test.py"], 4),  # international routes + route duration surfaces
                ("parks", [py, "tests/gpu/parks_test.py"], 4),  # national parks, shipwrecks, museum theming
                ("geopolitics", [py, "tests/gpu/geopolitics_test.py"], 4),  # per-pair wars + casus belli + civ-to-civ city transfer
                ("governors", [py, "tests/gpu/governors_test.py"], 4),  # era-score hooks + Ages loyalty modulation + governor anchors
                ("watermill", [py, "tests/gpu/watermill_test.py"], 4),  # Water Mill: farm-improved bonus resources +1 food
                ("unit_head", [py, "tests/gpu/unit_head_test.py"], 4),  # action enum == mask width == RL head width
                ("state_discipline", [py, "tests/gpu/state_discipline_test.py"], 4),  # alias-rebind + _MUTABLE drift net
                ("inplace", [py, "tests/gpu/inplace_discipline_test.py"], 1),  # static — no self-rebinds, no stale captures
                ("seat_symmetry", [py, "tools/gpu/seat_symmetry_check.py"], 1),  # static — dangling attrs, the alias/_MUTABLE contract, the seat-fork allowlist
                ("fort", [py, "tests/gpu/fort_test.py"], 4),  # Fort +4 defence — the serve gate never reaches it, so this lane is the only proof
                ("ladder", [py, "tests/gpu/ladder_test.py"], 4),  # the shared decision ladder's own guard
                ("food_order", [py, "tests/gpu/food_order_test.py"], 1),  # the farm-adjacency tier sits before the drought floor
                ("sc_census", [py, "tests/gpu/statecompare_census_test.py"], 1),  # static — every _MUTABLE plane is compared or excused
            ],
        ]
        # A lane that names a path nothing writes, or a test file no lane
        # names, must be LOUD: a green battery over a shrunken lane list reads
        # exactly like a green battery over all of them. Both directions.
        _named = {a for L in lanes for s in L for a in s[1] if isinstance(a, str) and a.endswith(".py")}
        _missing = sorted(p for p in _named if not (ROOT / p).exists())
        _loose = sorted(str(p.relative_to(ROOT)).replace("\\", "/")
                        for p in (ROOT / "tests" / "gpu").glob("*_test.py")
                        if str(p.relative_to(ROOT)).replace("\\", "/") not in _named)
        if _missing or _loose:
            print(f"BATTERY LANE DRIFT — missing: {_missing or 'none'}; unregistered: {_loose or 'none'}")
            return 1
        for L in lanes:
            if len(L) > 5:
                L.sort(key=lambda s: POKE_COST.get(s[0], 30.0))

        threads = [
            threading.Thread(target=lane_parallel, args=(l, POKE_WORKERS, POKE_OMP))
            if len(l) > 5
            else threading.Thread(target=lane, args=(l,))
            for l in lanes
        ]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

    wall = time.time() - t0
    print(f"\n{'step':<14} {'time':>7}  status")
    for name, dt, rc in results:
        print(f"{name:<14} {dt:6.1f}s  {'ok' if rc == 0 else 'SKIP' if rc == -1 else 'BAIL' if rc == -3 else 'FAIL'}")
    serial = sum(dt for _, dt, _ in results)
    print(f"\nwall {wall:.0f}s (serial-equivalent {serial:.0f}s, {serial / max(wall, 1):.1f}x)")
    # Every run records itself — stats/battery.jsonl, read by
    # tools/gpu/test_stats.py. Which lanes ever catch anything is a
    # question for data, not for memory.
    _stats.record(results, wall, not failed.is_set())
    if failed.is_set():
        print("BATTERY FAILED")
        return 1
    print("BATTERY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
