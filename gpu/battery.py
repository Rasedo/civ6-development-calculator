"""The verification battery: every gate an engine change must pass, in parallel.

    python gpu/battery.py              # all lanes
    python gpu/battery.py --no-bail    # keep every lane running past a failure

Stage 0 is serial because everything below depends on it: the TS and Python
static gates, the seeder-drift check against the committed worlds.lock, then
the world seed and the fixture export.
Lanes then run concurrently:

    vitest + serve_a : the TS suite, then the decision-server gate's first
                       shard — its share of the fixture seeds in one GPU sim
                       against one TS child each, with per-turn
                       obs/job/spread/buy equality and a state-digest compare
    serve_b..        : the gate's other shards, the same shape
    pokes            : the per-mechanic GPU self-tests, through a bounded pool

Wall-clock is stage 0 plus the slowest lane, and the serve shards are that
lane. The gate process is small-tensor and DISPATCH bound, not BLAS bound:
measured over one shard, OMP 1, 2 and 4 land within noise of each other and
24 threads runs 16% SLOWER than 1. Threads therefore buy nothing here and
processes buy everything, so the seeds spread over as many shards as the box
can hold at one thread each. Exit code is nonzero if ANY step fails; the
table at the end gives per-step wall time and status.
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

# Poke pool: 9 workers x OMP 1 = 9 threads beside the serve shards' 1 each,
# sized so the pool's total/workers lands beside the serve lane rather than
# behind it — whichever of the two finishes last IS the battery's wall.
# The TS children cost nothing: profiled at under 1% of the serve lane, whose
# wall is the gate's own process — sim.step, the decide pass and the digest
# extract — which is also why the gate runs as two processes at all.
POKE_WORKERS = 9
POKE_OMP = 1

# ---------------------------------------------------------------- memory --
# The battery is the heaviest thing in this repo and the box is the OWNER's,
# often with a VM on it. It must never be able to take the machine down: when
# memory is short it runs FEWER lanes for LONGER (#230).
#
# `MEM_RESERVE_MB` is what we leave for whatever else is running; the pool is
# sized out of what remains. `MEM_LOW_WATER_MB` is where the watchdog stops
# ADMITTING new poke lanes — running ones always drain, because killing
# anything on a shared box is forbidden.
MEM_RESERVE_MB = 4096
MEM_LOW_WATER_MB = 2048
MEM_LANE_MB_DEFAULT = 1500.0   # until a green run measures the real figure
LOW_MEMORY = "--low-memory" in sys.argv

mem_min_free = [10 ** 9]       # the low-water mark actually observed
mem_tight = threading.Event()
_mem_stop = threading.Event()


def free_mb() -> float:
    """Free PHYSICAL memory, in MB. Zero when it cannot be read, which the
    callers treat as "no information" rather than "no memory"."""
    over = os.environ.get("CIV6_BATTERY_MEM_MB")
    if over:
        try:
            return float(over)
        except ValueError:
            pass
    try:
        if os.name == "nt":
            import ctypes

            class _MS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong),
                            ("dwMemoryLoad", ctypes.c_ulong),
                            ("ullTotalPhys", ctypes.c_ulonglong),
                            ("ullAvailPhys", ctypes.c_ulonglong),
                            ("ullTotalPageFile", ctypes.c_ulonglong),
                            ("ullAvailPageFile", ctypes.c_ulonglong),
                            ("ullTotalVirtual", ctypes.c_ulonglong),
                            ("ullAvailVirtual", ctypes.c_ulonglong),
                            ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

            st = _MS()
            st.dwLength = ctypes.sizeof(_MS)
            if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
                return 0.0
            return st.ullAvailPhys / (1024.0 * 1024.0)
        with open("/proc/meminfo", encoding="utf-8") as fh:
            for ln in fh:
                if ln.startswith("MemAvailable:"):
                    return float(ln.split()[1]) / 1024.0
    except Exception:
        return 0.0
    return 0.0


def lane_mb() -> float:
    """What ONE concurrent lane costs, in MB — measured, not guessed. Every
    green run records the memory it actually consumed and how many lanes were
    running; the median of the last five is the budget. Falls back to a
    deliberately pessimistic default until that history exists."""
    seen: list[float] = []
    try:
        for row in _stats._rows()[-25:]:
            m = row.get("mem") or {}
            used, lanes = m.get("peak_used_mb"), m.get("lanes")
            if row.get("result") == "pass" and used and lanes:
                seen.append(float(used) / float(lanes))
    except Exception:
        return MEM_LANE_MB_DEFAULT
    if not seen:
        return MEM_LANE_MB_DEFAULT
    tail = sorted(seen[-5:])
    return tail[len(tail) // 2]


def plan_pool(want_shards: int) -> tuple[int, int, str]:
    """(serve shards, poke workers, why) for the memory this box has free.

    The battery never REFUSES for memory — it narrows. One shard and one poke
    worker is always allowed: that run takes far longer, which is the whole
    point of the trade.
    """
    free = free_mb()
    if LOW_MEMORY:
        free = min(free or MEM_RESERVE_MB + 3000.0, MEM_RESERVE_MB + 3000.0)
    if free <= 0:
        return want_shards, POKE_WORKERS, "memory unreadable — full fan-out"
    per = lane_mb()
    room = max(0.0, free - MEM_RESERVE_MB)
    cap = int(room // per)
    full = want_shards + POKE_WORKERS
    if cap >= full:
        return want_shards, POKE_WORKERS, (
            f"{free:.0f}MB free, {per:.0f}MB/lane — full fan-out fits")
    cap = max(2, cap)
    # split what we have in the same proportion as the full pool, so neither
    # side starves; the serve lane is the wall, so it gets the rounding.
    shards = max(1, min(want_shards, round(cap * want_shards / full)))
    pokes = max(1, cap - shards)
    return shards, pokes, (
        f"{free:.0f}MB free, {per:.0f}MB/lane, {MEM_RESERVE_MB}MB reserved "
        f"-> room for {cap} lanes, not {full}: DEGRADING (this run will take "
        f"longer)")


def mem_watch() -> None:
    """Sample free memory while the lanes run. Below the low-water mark the
    poke pool stops ADMITTING work; it never kills anything."""
    while not _mem_stop.wait(3.0):
        f = free_mb()
        if f <= 0:
            continue
        if f < mem_min_free[0]:
            mem_min_free[0] = f
        if f < MEM_LOW_WATER_MB:
            if not mem_tight.is_set():
                print(f"  [memory] {f:.0f}MB free — holding new lanes back", flush=True)
            mem_tight.set()
        elif mem_tight.is_set() and f > MEM_LOW_WATER_MB * 1.5:
            print(f"  [memory] {f:.0f}MB free — admitting lanes again", flush=True)
            mem_tight.clear()


# A lane that died for MEMORY is not a red: it says nothing about the code.
# It is not a green either — the run did not finish — so it gets a status of
# its own and the battery reports `oom`.
OOM_MARKS = ("MemoryError", "std::bad_alloc", "Unable to allocate",
             "out of memory", "Cannot allocate memory", "bad_alloc")


def looks_oom(text: str) -> bool:
    low = text.lower()
    return any(m.lower() in low for m in OOM_MARKS)


oom = threading.Event()

def lane_cost() -> dict[str, float]:
    """Measured lane cost — the median of each lane's last five OK timings
    from the recorded runs (stats/battery.jsonl). A lane with no history yet
    is priced at 30s until its first green run records one."""
    hist: dict[str, list[float]] = {}
    try:
        for row in _stats._rows()[-25:]:
            for st in row.get("steps", []):
                if st.get("status") == "ok":
                    hist.setdefault(str(st["lane"]), []).append(float(st["secs"]))
    except Exception:
        return {}
    return {k: sorted(v[-5:])[len(v[-5:]) // 2] for k, v in hist.items()}

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "gpu"))
import test_stats as _stats  # noqa: E402

# NO LANE OUTLIVES THE RUN. A hung lane used to sit there until the box was
# rebooted, holding its memory and a core; past this many seconds it is killed
# with its whole tree and reported red. Six times the slowest lane, so a
# healthy run can never reach it.
LANE_CAP = 1800.0

results: list[tuple[str, float, int]] = []
lock = threading.Lock()
failed = threading.Event()


def kill_tree(p: subprocess.Popen) -> None:
    """Kill a lane AND everything it spawned. `Popen.kill` reaches only the
    child it launched, and a node lane is a chain of shims over a pool of
    workers: killing the top of that chain strands the rest, which then hold
    their memory and spin on a core indefinitely. `taskkill /T` walks the
    tree; elsewhere the process group does."""
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)],
                           capture_output=True, check=False)
        else:
            p.kill()
    except OSError:
        pass
    try:
        p.communicate(timeout=10)
    except (subprocess.TimeoutExpired, ValueError, OSError):
        pass


def run(name: str, cmd: list[str], threads: int = 8, bail: bool = True,
        cap: float = LANE_CAP) -> None:
    env = os.environ.copy()
    env.setdefault("PYTHONUTF8", "1")
    env["OMP_NUM_THREADS"] = str(threads)
    env["MKL_NUM_THREADS"] = str(threads)
    t0 = time.time()
    p = subprocess.Popen(
        cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding="utf-8", errors="replace",
    )
    out, err = "", ""
    while True:
        try:
            out, err = p.communicate(timeout=1.0)
            break
        except subprocess.TimeoutExpired:
            if bail and failed.is_set() and not NO_BAIL:
                kill_tree(p)
                dt = time.time() - t0
                with lock:
                    results.append((name, dt, -3))
                    print(f"  {name:<14} {dt:6.1f}s  bail  (another lane failed)", flush=True)
                return
            if cap and time.time() - t0 > cap:
                kill_tree(p)
                dt = time.time() - t0
                with lock:
                    results.append((name, dt, -4))
                    failed.set()
                    print(f"  {name:<14} {dt:6.1f}s  FAIL timeout (cap {cap:.0f}s)", flush=True)
                return
    p = subprocess.CompletedProcess(cmd, p.returncode, out, err)
    dt = time.time() - t0
    with lock:
        results.append((name, dt, p.returncode))
        status = "ok" if p.returncode == 0 else f"FAIL rc={p.returncode}"
        if p.returncode == 0 or not looks_oom(p.stdout + p.stderr):
            print(f"  {name:<14} {dt:6.1f}s  {status}", flush=True)
        if p.returncode == 0 and name.startswith("eval"):
            for ln in p.stdout.strip().splitlines()[-1:]:
                print(f"    | {ln}", flush=True)
        if p.returncode != 0 and looks_oom(p.stdout + p.stderr):
            # #230: the box ran out of memory. Report it as its own thing —
            # a red here would blame the code for the machine.
            results[-1] = (name, dt, -5)
            oom.set()
            print(f"  {name:<14} {dt:6.1f}s  OOM  (memory, not a test failure)", flush=True)
        elif p.returncode != 0:
            failed.set()
            tail = (p.stdout + "\n" + p.stderr).strip().splitlines()[-15:]
            print("    | " + "\n    | ".join(tail), flush=True)


def lane_parallel(steps: list[tuple[str, list[str], int]], workers: int, threads: int) -> None:
    pos = [0]
    lk = threading.Lock()

    def worker(idx: int = 0) -> None:
        while True:
            # #230: under memory pressure the pool stops ADMITTING work and
            # the running lanes drain. Worker 0 never waits, so the pool
            # cannot deadlock and the run always finishes — later.
            while idx > 0 and mem_tight.is_set() and not failed.is_set():
                time.sleep(2.0)
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

    ws = [threading.Thread(target=worker, args=(i,)) for i in range(workers)]
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
    # OWNER RULE (2026-08-24): the battery runs every FOUR commits, not every
    # round — batched hunts run at ~15 min/bug where isolated ones paid ~80
    # (stats/battery.jsonl audit). The per-commit bar is the compile bar plus
    # a single-seed smoke serve. A RED run never resets the clock (only a
    # green does), so the closing re-run of a hunt is always allowed.
    # CIV6_BATTERY_OWNER=1 is the owner's own door, nobody else's.
    since = _stats._last_pass_head(_stats._rows())
    if since and os.environ.get("CIV6_BATTERY_OWNER") != "1":
        try:
            n = int(_stats._git("rev-list", "--count", f"{since}..HEAD"))
        except ValueError:
            n = -1  # unknown sha (rebase?) — the clock is unprovable, run
        if 0 <= n < 4:
            print(
                f"BATTERY REFUSED — cadence rule: {n} commit(s) in git history "
                f"since the last green run ({since[:12]}); the battery unlocks "
                f"at 4."
            )
            print("Per-commit bar: compile bar + single-seed smoke serve "
                  "(python gpu/serve_gate.py --batched --seeds <s> --turns 250).")
            return 2
    npx = "npx.cmd" if os.name == "nt" else "npx"
    npm = "npm.cmd" if os.name == "nt" else "npm"
    # Call the TS runner directly: `npm test` is npm.cmd -> cmd.exe -> node,
    # and every shim in that chain is a link a kill does not cross.
    vitest = ["node", str(ROOT / "node_modules" / "vitest" / "vitest.mjs"), "run"]
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
        # or hang deep inside a lane instead of an import error. F841 rides
        # along because a dangling local is what a half-finished edit leaves,
        # and `tests` is in scope because a poke lane is engine code too.
        ("f821", [str(ruff), "check", "--select", "F821,F841", "gpu", "policy", "tools", "tests"]),
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

    _serve_names: list[str] = []
    _poke_names: list[str] = []
    if not failed.is_set():
        # The DECISION-SERVER gate sharded over ALL fixture seeds: per-turn
        # obs/unit-target equality and a state-digest compare. The lane's wall
        # is the gate process itself, not the TS children, so more processes
        # split what one batch serializes; single-seed hunt reruns prove the
        # digests are batch-size independent. The split is derived from the
        # fixture directory so a reseeded set reshards itself. A shard pays a
        # fixed per-turn dispatch price plus a per-seed one, so narrower shards
        # spend total CPU to buy wall — the trade this box has cores for.
        _seeds = sorted(int(q.stem[4:]) for q in (ROOT / "seeder" / "worlds").glob("seed*.json")
                        if q.stem[4:].isdigit())
        # #230: how wide this run may fan out, given the memory this box
        # actually has free right now. Never a refusal — a narrower run, which
        # is a LONGER run.
        _k, _pokes, _why = plan_pool(min(8, len(_seeds)))
        print(f"memory: {_why}", flush=True)
        if (_k, _pokes) != (min(8, len(_seeds)), POKE_WORKERS):
            print(f"        {_k} serve shard(s) and {_pokes} poke worker(s) "
                  f"instead of {min(8, len(_seeds))} and {POKE_WORKERS}", flush=True)
        mem_min_free[0] = free_mb() or 10 ** 9
        _mem_free_start = mem_min_free[0]
        threading.Thread(target=mem_watch, daemon=True).start()
        _cut = [round(i * len(_seeds) / _k) for i in range(_k + 1)]
        serve_cmd = [py, "gpu/serve_gate.py", "--batched", "--turns", "250", "--seeds"]
        _shards = [("serve_" + "abcdefgh"[i], serve_cmd + [",".join(map(str, _seeds[_cut[i]:_cut[i + 1]]))], 1)
                   for i in range(_k)]
        _serve_names = [s[0] for s in _shards]
        print("lanes (parallel): vitest+" + _shards[0][0] + " | "
              + " | ".join(s[0] for s in _shards[1:]) + " | gpu pokes", flush=True)
        lanes = [
            [("vitest", vitest, 8), _shards[0]],
            *[[sh] for sh in _shards[1:]],
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
                ("flood_district", [py, "tests/gpu/flood_district_test.py"], 2),
                ("feature_add", [py, "tests/gpu/feature_add_test.py"], 2),  # the carrier for a feature that ARRIVES after t0 — no rollout caller yet  # a flood pillages the district on the floodplain
                ("flood_severity", [py, "tests/gpu/flood_severity_test.py"], 2),  # the severity ladder: pillage, destroy, damage bands, the two silts, the Bath
                ("citizens", [py, "tests/gpu/citizens_test.py"], 2),  # the specialist pin and the plot lock — the two citizen overrides
                ("congress_vote", [py, "tests/gpu/congress_vote_test.py"], 2),  # the congress ballot: override, favor curve, both refund tiers, the DV target
                ("emergency", [py, "tests/gpu/emergency_test.py"], 2),  # the special session above the trigger: sponsorship, quiet window, forced war, both outcomes
                ("martyr", [py, "tests/gpu/martyr_test.py"], 2),  # the relic rides the MARTYR promotion, and the death draws nothing
                ("barb_camps", [py, "tests/gpu/barb_camps_test.py"], 2),  # a camp's class is its ground; ranged is nobody's class
                ("suzerain_rules", [py, "tests/gpu/suzerain_rules_test.py"], 2),  # the seven suz-coded perks, strict-suzerain-only
                ("minor_record", [py, "tests/gpu/minor_record_test.py"], 2),  # the resolved suzerain, the minor's research, its border, Containment, conversion
                ("rock_band", [py, "tests/gpu/rock_band_test.py"], 2),  # the summed international percent, the per-rival bank, the venue, the concert, the progressive price
                ("dedications", [py, "tests/gpu/dedications_test.py"], 2),  # both faces of the four new catalog entries
                ("civ_pair_strike", [py, "tests/gpu/civ_pair_strike_test.py"], 2),  # a civ city fires on an enemy civ
                ("spawn_reclaim", [py, "tests/gpu/spawn_reclaim_test.py"], 2),  # a reclaimed slot hands on no drowned unit's MP
                ("centre_defence", [py, "tests/gpu/centre_defence_test.py"], 2),  # a centre is attacked as the CITY
                ("stack_rules", [py, "tests/gpu/stack_rules_test.py"], 2),  # cross-domain stacking + Encampment spawn wall
                ("golden_move", [py, "tests/gpu/golden_move_test.py"], 2),  # MONUMENTALITY / EXODUS +2 MP, per seat
                ("bankruptcy", [py, "tests/gpu/bankruptcy_test.py"], 4),
                ("seat", [py, "tests/gpu/seat_test.py"], 4),
                ("government", [py, "tests/gpu/government_test.py"], 4),
                ("plaza", [py, "tests/gpu/plaza_test.py"], 2),  # the four Government Plaza effect bodies, none of them in the gate's reach
                ("formation", [py, "tests/gpu/formation_test.py"], 2),  # corps/army/fleet/armada: the civics sit past the gate's reach
                ("escort", [py, "tests/gpu/escort_test.py"], 2),  # the escort formation: no driver takes the verb
                ("air_promo", [py, "tests/gpu/air_promo_test.py"], 2),  # the three new trees, the sortie's XP and Loot: no seed trains an aircraft
                ("policy_cards", [py, "tests/gpu/policy_cards_test.py"], 4),  # every policy-card CHANNEL the assembler returns, and the two appliers with a direction
                ("controlled", [py, "tests/gpu/controlled_test.py"], 4),
                ("pref_apply", [py, "tests/gpu/pref_apply_test.py"], 4),  # preference-order apply — the ONLY lane that reaches it
                ("seat_verbs", [py, "tests/gpu/seat_verbs_test.py"], 4),  # the 9 civ unit verbs — asserts EXECUTION, not legality
                ("air", [py, "tests/gpu/air_test.py"], 4),  # bases, slots, both air heads, the sortie and every way a base is lost
                ("spy", [py, "tests/gpu/spy_test.py"], 4),  # capacity, the jump, both spy heads and what each mission does
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
                ("governor_roster", [py, "tests/gpu/governor_roster_test.py"], 4),  # titles/appointment/promotion order, the establishment and neutralize clocks, the Dark Age card pool
                ("watermill", [py, "tests/gpu/watermill_test.py"], 4),  # Water Mill: farm-improved bonus resources +1 food
                ("districts_new", [py, "tests/gpu/districts_new_test.py"], 4),  # Dam/Canal/Water Park/Preserve/Government Plaza/Diplomatic Quarter
                ("sourced_rows", [py, "tests/gpu/sourced_rows_test.py"], 4),  # the Monument's loyalty clause, the Lighthouse's Coast/Lake food, the Engineer's Armory
                ("wonder_effects", [py, "tests/gpu/wonder_effects_test.py"], 4),  # the fourteen wonder-effect channels, most of which no FINISHED wonder in the gate carries
                ("city_perimeter", [py, "tests/gpu/city_perimeter_test.py"], 4),  # the wall pool, the ranged city penalty and the theological roll — none of it reachable in the gate
                ("unit_head", [py, "tests/gpu/unit_head_test.py"], 4),  # action enum == mask width == RL head width
                ("state_discipline", [py, "tests/gpu/state_discipline_test.py"], 4),  # alias-rebind + _MUTABLE drift net
                ("inplace", [py, "tests/gpu/inplace_discipline_test.py"], 1),  # static — no self-rebinds, no stale captures
                ("seat_symmetry", [py, "tools/gpu/seat_symmetry_check.py"], 1),  # static — dangling attrs, the alias/_MUTABLE contract, the seat-fork allowlist
                ("gather_batch", [py, "tools/gpu/gather_batch_check.py"], 1),  # static — a gather whose index is already narrowed reads the wrong game's row
                ("fort", [py, "tests/gpu/fort_test.py"], 4),  # Fort +4 defence — the serve gate never reaches it, so this lane is the only proof
                ("ladder", [py, "tests/gpu/ladder_test.py"], 4),  # the shared decision ladder's own guard
                ("food_order", [py, "tests/gpu/food_order_test.py"], 1),  # the farm-adjacency tier sits before the drought floor
                ("sc_census", [py, "tests/gpu/statecompare_census_test.py"], 1),  # static — every _MUTABLE plane is compared or excused
                ("promotions", [py, "tests/gpu/promotions_test.py"], 4),  # the ladder, the PROMOTE head, the evaluator and the exact-integer XP award
                ("inquisitor", [py, "tests/gpu/inquisitor_test.py"], 4),  # Launch Inquisition -> the purchase -> Remove Heresy -> Condemn, and the duel rules
                ("promo_effects", [py, "tests/gpu/promo_effects_test.py"], 4),  # the twenty promotion kinds that are not Combat Strength
                ("era_draws", [py, "tests/gpu/era_draws_test.py"], 4),  # the restored random draws, and the artifact's own civilization
                ("power", [py, "tests/gpu/power_test.py"], 4),  # GS POWER: demand, the plant's reach, Cardiff, the powered halves
                ("climate", [py, "tests/gpu/climate_test.py"], 4),  # GS CLIMATE: carbon, the seven phases, the sea, the barrier, a warmed world's weather
                ("engineer", [py, "tests/gpu/engineer_test.py"], 4),  # the Military Engineer: fort, airstrip, road, the 20% charge
                ("uniques", [py, "tests/gpu/uniques_test.py"], 4),  # the roster's UNIQUE UNITS: who trains what, the chariots, the start-tile Movement, the Legion's Fort
                ("uniques_infra", [py, "tests/gpu/uniques_infra_test.py"], 4),  # the UNIQUE INFRASTRUCTURE: the Bath, the Stave Church, the Sphinx, the Ziggurat
                ("civ_abilities", [py, "tests/gpu/civ_abilities_test.py"], 4),  # the CIVILIZATION ABILITIES: Rome's roads and posts, Iteru, the Knarr, Epic Quest, and the naval heal table
                ("leader_abilities", [py, "tests/gpu/leader_abilities_test.py"], 4),  # the LEADER ABILITIES: Trajan's Column, Mediterranean's Bride, Thunderbolt of the North, Adventures of Enkidu
                ("plot_yields", [py, "tests/gpu/plot_yields_test.py"], 4),  # the roster's PLOT YIELD rows: Laurier, Inca, Mali, the Maori, Russia
                ("roster_rows", [py, "tests/gpu/roster_rows_test.py"], 4),  # the roster's production, adjacency, route-yield and capacity rows
                ("combat_rows", [py, "tests/gpu/combat_rows_test.py"], 4),  # the roster's combat-strength, kill-heal, embark-movement and shore rows
                ("city_rows", [py, "tests/gpu/city_rows_test.py"], 4),  # the roster's city rows: the centre's terrain, the works, the powered yield, the stockpile, the tile price, the Farm's ground, the granted units and the first city
                ("seat_rows", [py, "tests/gpu/seat_rows_test.py"], 4),  # the roster's seat rows: happiness yields and Great People, the government slot, what a kill pays, the per-policy strength, the Amazon
                ("mountain_rows", [py, "tests/gpu/mountain_rows_test.py"], 4),  # Mit'a's worked mountains, Qhapaq Ñan's route Food, the Toqui, Isibongo's garrison, the formation rows
                ("title_rows", [py, "tests/gpu/title_rows_test.py"], 4),  # Hwarang's promotions, the Nobel Prize, Mana's start and bans, Righteousness of the Faith, Religious Convert
                ("conquest_rows", [py, "tests/gpu/conquest_rows_test.py"], 4),  # the second horse, the conquered city, the boost, the Canal, Satyagraha, the Vizier
                ("follower_rows", [py, "tests/gpu/follower_rows_test.py"], 4),  # Dharma, the Last Prophet, the Jeli's faith door, Swift Hawk, Radio Oranje
                ("all_follower_beliefs", [py, "tests/gpu/all_follower_beliefs_test.py"], 2),  # C-57 Dharma stacks every present religion
                ("tribal_villages", [py, "tests/gpu/tribal_villages_test.py"], 7),  # C-47 the install's 24-subtype reward table
                ("feature_appeal", [py, "tests/gpu/feature_appeal_test.py"], 5),  # C-50 the Amazon reads a rainforest her own way
                ("shared_vision", [py, "tests/gpu/shared_vision_test.py"], 6),  # C-70 an alliance shares what it sees
                ("mountain_tunnel", [py, "tests/gpu/mountain_tunnel_test.py"], 7),  # C-20 the portal on a mountain range
                ("levied_upgrade", [py, "tests/gpu/levied_upgrade_test.py"], 6),  # C-66 the levy mark and its 75% discount
                ("legacy_accrual", [py, "tests/gpu/legacy_accrual_test.py"], 6),  # C-63 the government clock an accumulating bonus rides
                ("battery_memory", [py, "tests/gpu/battery_memory_test.py"], 1),  # #230 the harness narrows instead of taking the box down
                ("narrow_batch_xp", [py, "tests/gpu/narrow_batch_xp_test.py"], 2),  # A-5r a narrowed XP award must read its own game
                ("incoming_route", [py, "tests/gpu/incoming_route_test.py"], 2),  # A-4r a route coming in is paid with none going out
                ("bankruptcy_tie", [py, "tests/gpu/bankruptcy_tie_test.py"], 2),  # A-7r a bankruptcy tie goes to the earliest-spawned unit
                ("governor_cityless", [py, "tests/gpu/governor_cityless_test.py"], 2),  # A-8r a cityless seat's governor phase does not run
                ("stack_defender_tie", [py, "tests/gpu/stack_defender_tie_test.py"], 2),  # A-9r a ranged hit on a stacked hex goes to the hull on a tie
                ("capture_cavalry", [py, "tests/gpu/capture_cavalry_test.py"], 2),  # C-58 a beaten cavalry unit may change hands
                ("spy_release_level", [py, "tests/gpu/spy_release_level_test.py"], 2),  # C-16 the released spy is the one that was caught
                ("route_pressure", [py, "tests/gpu/route_pressure_test.py"], 2),  # C-56 a trade route carries religious pressure both ways
                ("danube_rows", [py, "tests/gpu/danube_rows_test.py"], 4),  # the wonder band, Ortoo, Faces of Peace, Sahel Merchants, Strength in Unity
                ("slot_rows", [py, "tests/gpu/slot_rows_test.py"], 4),  # Founding Fathers, Eleanor's aura, the Toqui's XP, Isibongo, the Flying Squadron, Roosevelt
                ("harvest_rows", [py, "tests/gpu/harvest_rows_test.py"], 4),  # the Builder's HARVEST: the column, the table, the mask, the total strip
                ("culture_bomb_rows", [py, "tests/gpu/culture_bomb_rows_test.py"], 4),  # the roster's two culture-bomb carriers, improvement and district
                ("wonder_charge", [py, "tests/gpu/wonder_charge_test.py"], 4),  # the Builder's charge into an Ancient or Classical wonder
                ("disembark_river", [py, "tests/gpu/disembark_river_test.py"], 4),  # a step off the water crosses no river edge (A-1r)
                ("continents", [py, "tests/gpu/continents_test.py"], 4),  # the landmass id and the home continent (C-48)
                ("treasure_fleet", [py, "tests/gpu/treasure_fleet_test.py"], 4),  # Spain's route rows, plain and intercontinental
                ("foreign_founding", [py, "tests/gpu/foreign_founding_test.py"], 4),  # a city founded off the home continent (C-48)
                ("home_continent_rows", [py, "tests/gpu/home_continent_rows_test.py"], 4),  # Spain's districts, Victoria's capacity, Phoenicia's loyalty
                ("district_price", [py, "tests/gpu/district_price_test.py"], 4),  # each row's own base and discount (B-67)
                ("wonder_era_boost", [py, "tests/gpu/wonder_era_boost_test.py"], 4),  # Dynastic Cycle's Eureka and Inspiration (C-54)
                ("placement", [py, "tests/gpu/placement_test.py"], 4),  # a wonder's ground (static wok + the live clauses) and the suzerain improvements
                ("great_person", [py, "tests/gpu/great_person_test.py"], 4),  # the six activation sites, the spend, and the two permanent runs
                ("fallout", [py, "tests/gpu/fallout_test.py"], 4),  # the device catalog, the arsenal upkeep, the contaminated ground and CLEAN_FALLOUT
                ("robot", [py, "tests/gpu/robot_test.py"], 4),  # the Giant Death Robot chassis and its four Future-era upgrades
                ("nuke", [py, "tests/gpu/nuke_test.py"], 4),  # the blast, the two carriers and the silo: no seed reaches Nuclear Fission
                ("amani", [py, "tests/gpu/amani_test.py"], 4),  # the governor posted to a city-state, her envoys and Affluence
                ("gov_clauses", [py, "tests/gpu/gov_clauses_test.py"], 4),  # the five promotion clauses no seed reaches: no governed city ever holds one
                ("geothermal", [py, "tests/gpu/geothermal_test.py"], 4),  # the map's new rows: no scripted seed places a Geothermal Plant or claims a Holy Site pantheon
                ("imp_research", [py, "tests/gpu/imp_research_yields_test.py"], 4),  # the research raises on an improvement own yields, most of them past any lane's reach
                ("legacy_cards", [py, "tests/gpu/legacy_cards_test.py"], 4),  # the government a seat has LEFT, and the Wildcard it unlocks — no lane leaves a government
                ("consulate", [py, "tests/gpu/consulate_test.py"], 4),  # the Consulate empire-wide half, which wants a Diplomatic Quarter AND an Encampment in two different cities
                ("religious_zoc", [py, "tests/gpu/religious_zoc_test.py"], 4),  # the second zone of control — faith-purchased units the driver never marches past a hostile
                ("appeal_cache", [py, "tests/gpu/appeal_cache_test.py"], 4),  # the version contract `_tile_appeal` is cached on, which two mid-game writers owed it
                ("advance_borders", [py, "tests/gpu/advance_borders_test.py"], 4),  # a melee victor advancing is ENTERING the tile, so the border binds it
                ("stockpile_ceiling", [py, "tests/gpu/stockpile_ceiling_test.py"], 4),  # the stockpile maximum, on the one way IN that had no clamp of its own
                ("fuel_short", [py, "tests/gpu/fuel_short_test.py"], 4),  # the fuel bill marks the slot short, and the unit fights 20 weaker
                ("improvement_food", [py, "tests/gpu/improvement_food_test.py"], 4),  # the tile-food column's improvement arm, which knew only the FARM
                ("production_queue", [py, "tests/gpu/production_queue_test.py"], 4),  # the city's queue: the head, the overflow carry and the reorder
                ("formation_train", [py, "tests/gpu/formation_train_test.py"], 4),  # the corps/army queue tier: gates, price, apply refusals, the tiered spawn
                ("gp_pass", [py, "tests/gpu/gp_pass_test.py"], 4),  # the Great Person pass: the fee, the discount, the lockout, the rival's claim
                ("minor_builds", [py, "tests/gpu/minor_builds_test.py"], 4),  # the city-state's own walls, type district and Harbor, and the conquest carry
                ("alliance_levels", [py, "tests/gpu/alliance_levels_test.py"], 4),  # typed alliances: points, levels and the fifteen-effect table
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
        _cost = lane_cost()
        for L in lanes:
            if len(L) > 5:
                # longest first: the pool wall is total/workers OR the last
                # long poke's finish, whichever is later — so long pokes start
                # at t=0, never at the tail.
                L.sort(key=lambda s: -_cost.get(s[0], 30.0))

        _poke_names = [s[0] for l in lanes if len(l) > 5 for s in l]
        threads = [
            threading.Thread(target=lane_parallel, args=(l, _pokes, POKE_OMP))
            if len(l) > 5
            else threading.Thread(target=lane, args=(l,))
            for l in lanes
        ]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

    _mem_stop.set()
    wall = time.time() - t0
    print(f"\n{'step':<14} {'time':>7}  status")
    for name, dt, rc in results:
        print(f"{name:<14} {dt:6.1f}s  {'ok' if rc == 0 else 'SKIP' if rc == -1 else 'BAIL' if rc == -3 else 'TIMEOUT' if rc == -4 else 'FAIL'}")
    serial = sum(dt for _, dt, _ in results)
    print(f"\nwall {wall:.0f}s (serial-equivalent {serial:.0f}s, {serial / max(wall, 1):.1f}x)")
    # WHICH lane is the wall. The serve shards take one lane each (the first
    # behind vitest) and the pokes share a pool, so the wall is stage 0 plus
    # whichever of those two finishes last. A wall that moves without either
    # of them moving is the harness; a wall that moves with one of them names
    # its own suspect.
    if _serve_names and _poke_names:
        _t = {n: dt for n, dt, _ in results}
        _srv = max([_t.get(_serve_names[0], 0.0) + _t.get("vitest", 0.0)]
                   + [_t.get(n, 0.0) for n in _serve_names[1:]])
        _pk = [_t.get(n, 0.0) for n in _poke_names]
        _pool = max(sum(_pk) / max(1, _pokes), max(_pk, default=0.0))
        _s0 = sum(dt for n, dt, _ in results
                  if n not in set(_serve_names) | set(_poke_names) | {"vitest"})
        print(f"budget: stage 0 {_s0:.0f}s + slowest lane {max(_srv, _pool):.0f}s"
              f"  |  serve {_srv:.0f}s over {len(_serve_names)} shards"
              f"  vs  pokes {sum(_pk):.0f}s/{_pokes} workers = {_pool:.0f}s"
              f"  ->  {'SERVE' if _srv >= _pool else 'POKES'} is the wall")
    # Every run records itself — stats/battery.jsonl, read by
    # tools/gpu/test_stats.py. Which lanes ever catch anything is a
    # question for data, not for memory.
    # What this run COST in memory, so the next one can size itself from a
    # measurement rather than the pessimistic default (#230).
    _peak = max(0.0, _mem_free_start - mem_min_free[0]) if _mem_free_start < 10 ** 9 else 0.0
    _mem = {"free_start_mb": round(_mem_free_start, 1) if _mem_free_start < 10 ** 9 else None,
            "free_min_mb": round(mem_min_free[0], 1) if mem_min_free[0] < 10 ** 9 else None,
            "peak_used_mb": round(_peak, 1) or None,
            "lanes": _k + _pokes,
            "shards": _k, "pokes": _pokes,
            "lane_mb_budget": round(lane_mb(), 1)}
    print(f"memory: peak {_peak:.0f}MB over {_k + _pokes} lanes "
          f"({_peak / max(1, _k + _pokes):.0f}MB/lane), floor {mem_min_free[0]:.0f}MB free")
    _stats.record(results, wall, not failed.is_set() and not oom.is_set(), mem=_mem,
                  oom=oom.is_set())
    if oom.is_set() and not failed.is_set():
        # NOT a pass — the run did not finish — and NOT a fail, because the
        # code is not what broke. The cadence clock does not advance.
        print("BATTERY OUT OF MEMORY — narrow the run "
              "(--low-memory, or CIV6_BATTERY_MEM_MB=<free MB>) and try again")
        return 3
    if failed.is_set():
        print("BATTERY FAILED")
        return 1
    print("BATTERY OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
