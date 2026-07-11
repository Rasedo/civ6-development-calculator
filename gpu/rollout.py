"""Off-script rollout generator: the GPU engine plays random masked actions.

    python gpu/rollout.py                 # 3 random games per fixture
    npx vite-node scripts/replay-gpu.ts   # the TS oracle must agree

This is the parity gate for the phase-3 action interface. A seeded
counter-based random policy drives the three action heads (per-city
production, research, civics) through the masks, logging every action it
takes plus the engine's per-turn trace. The replay script then feeds that
exact action log through the REAL TypeScript engine — same maps, same
sites — and compares every trace row. Scripted-trace parity can't catch
bugs that only off-script trajectories reach (eureka detection timing,
settler-cost sequencing, research banking, idling); this can.

Writes gpu/fixtures/rollout.json.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import torch

# Windows pipes default to the ANSI codepage (cp1251 here) — the '×'/'→' in
# the summary prints must degrade, not kill a 3-minute run at the finish line.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from civ6gpu import BatchSim, load_rules, load_fixture, FIXTURES
from civ6gpu.rng import masked_choice

HEAD_PROD, HEAD_TECH, HEAD_CIVIC, HEAD_UNIT, HEAD_ENVOY = 101, 202, 303, 404, 505


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--replicas", type=int, default=3, help="random games per fixture")
    ap.add_argument("--log", type=int, default=None, help="rng of ONE game -> gpu/fixtures/gpu_statelog.txt")
    ap.add_argument("--turns", type=int, default=None, help="default: the fixtures' turnLimit (TS TURN_LIMIT)")
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--out", default=str(FIXTURES / "rollout.json"))
    ap.add_argument("--shards", type=int, default=None, help="P3: split the games across N processes (byte-identical merge — every game keeps its GLOBAL seed/index)")
    ap.add_argument("--shard", type=int, default=None, help="internal: this process runs shard k of --shards")
    ap.add_argument("--pipeline-replay", action="store_true", help="P5 battery: replay each shard's games through the TS oracle AS THAT SHARD LANDS (hides the ~35s serial replay tail); the merge and the gate semantics are unchanged")
    args = ap.parse_args()

    if args.shards and args.shard is None:
        # P3 orchestrator: tiny-tensor torch scales across PROCESSES, not
        # threads (OMP sweep peaks at 4) — N children each roll a contiguous
        # slice of the game list, keeping GLOBAL indices so every game's
        # seed (and therefore its trajectory) is identical to the unsharded
        # run; the merge is byte-identical rollout.json.
        import threading

        procs = []
        for k in range(args.shards):
            cmd = [sys.executable, __file__, "--shard", str(k), "--shards", str(args.shards),
                   "--replicas", str(args.replicas), "--seed", str(args.seed),
                   "--out", args.out + f".shard{k}"]
            if args.turns is not None:
                cmd += ["--turns", str(args.turns)]
            if args.log is not None:
                cmd += ["--log", str(args.log)]
            env = os.environ.copy()
            env.setdefault("OMP_NUM_THREADS", "4")
            env.setdefault("MKL_NUM_THREADS", "4")
            procs.append(subprocess.Popen(cmd, env=env))

        replay_rcs: list[int] = [0] * args.shards
        replay_out: list[str] = [""] * args.shards
        threads = []
        if args.pipeline_replay:
            npx = "npx.cmd" if os.name == "nt" else "npx"

            def _replay(k: int) -> None:
                # wait for THIS shard's rollout, then replay its games while
                # the other shards keep rolling — each shard file is a
                # complete rollout.json with its slice of games.
                if procs[k].wait() != 0:
                    replay_rcs[k] = -1  # rollout itself failed; no replay
                    return
                p = subprocess.run(
                    [npx, "vite-node", "scripts/replay-gpu.ts", args.out + f".shard{k}"],
                    capture_output=True, text=True, encoding="utf-8", errors="replace",
                )
                replay_rcs[k] = p.returncode
                replay_out[k] = p.stdout.strip()

            threads = [threading.Thread(target=_replay, args=(k,)) for k in range(args.shards)]
            for th in threads:
                th.start()

        rcs = [p.wait() for p in procs]
        for th in threads:
            th.join()
        if any(rcs):
            raise SystemExit(max(rcs))
        merged = None
        for k in range(args.shards):
            part_path = Path(args.out + f".shard{k}")
            part = json.loads(part_path.read_text())
            if merged is None:
                merged = part
            else:
                merged["games"].extend(part["games"])
            part_path.unlink()
        Path(args.out).write_text(json.dumps(merged))
        print(f"{len(merged['games'])} games merged from {args.shards} shards -> {args.out}")
        if args.pipeline_replay:
            if any(replay_rcs):
                for k, rc in enumerate(replay_rcs):
                    if rc:
                        tail = "\n    | ".join(replay_out[k].splitlines()[-8:])
                        print(f"shard {k} replay FAILED (rc={rc}):\n    | {tail}")
                raise SystemExit(1)
            games_n = len(merged["games"])
            turns_n = len(merged["games"][0]["trace"]) if merged["games"] else 0
            print(f"REPLAY PARITY OK — {games_n} games × {turns_n} turns, replayed per-shard while later shards rolled")
        else:
            print("now verify with: npx vite-node scripts/replay-gpu.ts")
        return

    rules_raw = json.loads((FIXTURES / "rules.json").read_text())
    rules = load_rules()
    if args.turns is None:  # single knob: the game's own length
        args.turns = rules.turn_limit
    paths = sorted(FIXTURES.glob("seed*.json"))
    if not paths:
        print("no fixtures — run `npm run gpu:export` first")
        raise SystemExit(1)
    fixtures = [load_fixture(p) for p in paths for _ in range(args.replicas)]
    lo = 0
    if args.shard is not None and args.shards:
        per = (len(fixtures) + args.shards - 1) // args.shards
        lo = args.shard * per
        fixtures = fixtures[lo : lo + per]

    from statelog import gpu_state_lines
    _logl = []
    sim = BatchSim(fixtures, rules, device="cpu", dtype=torch.float64)
    B, C = sim.B, sim.C
    game_seed = torch.tensor([args.seed * 1_000_003 + lo + i for i in range(B)], dtype=torch.int64)  # GLOBAL index: shard-invariant seeds
    slots = torch.arange(C, dtype=torch.int64).view(1, C)
    from civ6gpu.engine import P_MAX

    pslots = torch.arange(P_MAX, dtype=torch.int64).view(1, P_MAX)

    games = [
        {"seed": f["seed"], "rng": int(game_seed[i]), "sites": [c["site"] for c in f["cities"]], "actions": [], "trace": []}
        for i, f in enumerate(fixtures)
    ]

    HOLD = 12
    if args.log is not None:
        for _b in range(B):
            if games[_b]["rng"] == args.log:
                sim._log_combat_b = _b  # Phase-1 combat log (CB lines)
    for _ in range(args.turns):
        turn = sim.turn
        pa = masked_choice(sim.production_mask(), game_seed.view(B, 1), slots, turn, HEAD_PROD)  # [B, C]
        ta = masked_choice(sim.tech_mask(), game_seed, turn, HEAD_TECH)  # [B]
        ca = masked_choice(sim.civic_mask(), game_seed, turn, HEAD_CIVIC)  # [B]
        # Attack-preferring random orders: units that CAN fight always do —
        # random pacifists would leave the kill/advance/camp-clear paths
        # (and the camp-list splice they exercise) untested.
        um = sim.unit_action_mask()
        na = um.shape[2]  # 16: 0-5 move, 6-11 attack, 12 hold, 13/14/15 build FARM/MINE/LUMBER
        has_attack = um[:, :, 6:12].any(dim=2, keepdim=True)
        um = um & ~(has_attack & (torch.arange(na).view(1, 1, na) < 6))  # drop moves when a fight is on
        um[:, :, 12:13] = um[:, :, 12:13] & ~has_attack  # and don't hold back either (builders' 13 unaffected)
        ua = masked_choice(um, game_seed.view(B, 1), pslots, turn, HEAD_UNIT)  # [B, P]
        ea = masked_choice(sim.envoy_mask(), game_seed, turn, HEAD_ENVOY)  # [B]
        # P5 battery perf: one .tolist() per tensor per turn instead of a
        # per-element tensor-index + int() storm (the python logging loop was
        # ~20% of the whole rollout in cProfile). Values and JSON output are
        # byte-identical — tolist() yields the same python ints/floats.
        pa_l, ta_l, ca_l, ea_l, ua_l = pa.tolist(), ta.tolist(), ca.tolist(), ea.tolist(), ua.tolist()
        ptile_l = sim.p_tile.tolist()
        pciv_l = sim._p_civ[sim.p_type].tolist()
        for b in range(B):
            entry: dict = {"t": turn}
            prods = [[c, v] for c, v in enumerate(pa_l[b]) if v >= 0]
            if prods:
                entry["p"] = prods
            if ta_l[b] >= 0:
                entry["r"] = ta_l[b]
            if ca_l[b] >= 0:
                entry["c"] = ca_l[b]
            if ea_l[b] >= 0:
                entry["e"] = ea_l[b]
            # Log each order as [tile, action, civ] (not slot): the replay
            # finds the unit by tile+domain, robust to same-turn spawn/death.
            orders = [
                [ptile_l[b][p], v, int(pciv_l[b][p])]
                for p, v in enumerate(ua_l[b])
                if v >= 0 and v != HOLD
            ]
            if orders:
                entry["u"] = orders
            if len(entry) > 1:
                games[b]["actions"].append(entry)
        sim.step(production=pa, tech=ta, civic=ca, units=ua, envoy=ea)
        rows_l = sim.trace_row().tolist()
        if args.log is not None:
            for _b in range(B):
                if games[_b]["rng"] == args.log:
                    _logl.extend(gpu_state_lines(sim, _b))
        for b in range(B):
            games[b]["trace"].append(rows_l[b])

    # Scaffold district ids in placement order — replay maps a district action
    # (a >= NB+2+NU) back to a DistrictId (D5b). Same source as the engine's
    # _scaffold: districtScaffold.place[si].idx into the district catalog.
    _dsc = rules_raw.get("districtScaffold", {})
    _dcat = rules_raw.get("districts", [])
    scaffold_ids = [_dcat[p["idx"]]["id"] for p in _dsc.get("place", [])]

    out = {
        "width": sim.W,
        "height": sim.H,
        "unitsMode": int(fixtures[0].get("unitsMode", 0)),
        "rangedActive": int(bool(getattr(sim, "_rl_ranged_active", False))),  # V-R: replay must dispatch 6-11 identically
        "disasters": int(fixtures[0].get("disasters", 0)),
        "csMax": int(fixtures[0].get("csMax", 0)),
        "rMax": int(fixtures[0].get("rMax", 0)),
        "unitIds": [u["id"] for u in rules_raw.get("units", [])],
        "buildings": [b["id"] for b in rules_raw["buildings"]],
        "techs": [t["id"] for t in rules_raw["techs"]],
        "civics": [c["id"] for c in rules_raw["civics"]],
        "scaffold": scaffold_ids,
        "games": games,
    }
    Path(args.out).write_text(json.dumps(out))
    score = sim.empire_score()
    cities = sim.alive.sum(dim=1)
    print(f"{B} random games × {args.turns} turns → {args.out}")
    if args.log is not None and _logl:  # sharded: only the owning shard writes (others must not clobber)
        open("gpu/fixtures/gpu_statelog.txt", "w", encoding="utf-8", newline="").write(chr(10).join(_logl) + chr(10))
        print("state log", len(_logl), "lines -> gpu/fixtures/gpu_statelog.txt")
    print(
        f"final: score {score.min():.1f}/{score.mean():.1f}/{score.max():.1f} (min/mean/max), "
        f"cities {int(cities.min())}–{int(cities.max())}, settlers banked {int(sim.settlers.max())} max"
    )
    print("now verify with: npx vite-node scripts/replay-gpu.ts")


if __name__ == "__main__":
    main()
