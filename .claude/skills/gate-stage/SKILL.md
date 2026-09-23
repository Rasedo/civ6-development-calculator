---
name: gate-stage
description: Land an engine change as a gate-serialized stage — design, inert plumbing first, slices, the battery, commit. Use for ANY change touching cpu/core or gpu/core.
---

# Gate-serialized engine stage

The only way engine changes land in this repo. TypeScript (`cpu/core`) is
the spec; the GPU engine (`gpu/core/sim_*.py`, assembled in `engine.py`)
mirrors it turn-exactly. Never widen tolerances.

## Procedure

0. **Skim `.claude/skills/parity-hunt/LESSONS.md` first** — the cross-engine traps past stages paid for, each with the check that catches it.
1. **Scope on paper first.** Name the slices; each slice must be
   independently gateable. Fidelity gaps live in `docs/AUDIT.md` (the only
   gap list — a closed entry is DELETED with its row in the same commit);
   direction lives in `docs/ROADMAP.md`.
2. **Inert plumbing before behavior.** New state (tensors, planes, masks)
   lands in a slice that provably changes nothing: the exported fixtures
   byte-identical and the digests unchanged.
   - A new mutable plane is registered in `_MUTABLE` (`gpu/core/simbase.py`)
     — `snapshot()`/`restore()` round-trip only what is listed, and
     `tests/gpu/snapshot_restore_test.py` is the only lane that restores.
   - A new plane also misses every existing all-planes walk: derive plane
     lists from `_MUTABLE` and sweep the walks.
   - A fact the engines must AGREE on needs a field in a group of
     `shared/statecompare.manifest.json` plus an extractor on BOTH sides
     (`cpu/core/statecompare.ts`, `gpu/core/statecompare.py`) — a name
     without an extractor, or an extractor without a name, is a hard error
     — or an entry in `exclusions` with the reason it cannot be compared.
3. **Edit via patch FILES, never shell heredocs** (heredocs are denied in
   settings.json: they collapse backslashes and choke on apostrophes).
   Write the script with the Write tool, run it BY PATH, then
   **`git diff --stat` before anything else** — a codemod that errors
   writes nothing after printing its earlier substitutions, so grep the
   changed line itself. Never `cd <subdir> &&` in the Bash tool: the cwd
   persists and every later relative-path call fails. Preserve a file's
   line endings (`git ls-files --eol`) so the diff shows content only.
4. **Both engines in lockstep.** RNG draws are mirrored draw-for-draw:
   never add/remove/reorder a draw on one side only; conditional draws
   gate on identical conditions. Float accumulation must match the TS
   ASSOCIATION exactly (`a += b + c` is `a + (b + c)`; one ulp flips
   completions when a cost lands inside it — it happened). A GPU applier
   arm must AND the TS validator's early returns, shared in one predicate.
5. **The driver is two files when the gate compares it.** The scripted
   policy is ours, not Civ 6's AI, and it may change decisions freely — but
   the tables the gate compares per turn (jobs, spreads, buys, routes) live
   in `policy/drive.py` AND `cpu/driver/driver.ts`, clause for clause: a
   change to either side is a change to both. Deals are GPU-driver-only.
6. **Validate.** Per commit: the compile bar plus a single-seed smoke
   serve — `python gpu/battery.py --seeds <seed> --ckpt-every 20` (hunt
   mode: stage 0, one serve shard, no poke pool; it records nothing and
   claims no green). Every five commits, the full bar: `python
   gpu/battery.py`. The battery is the ONLY entry to the gate;
   `gpu/serve_gate.py` is never launched by hand. Green is the `pass` row
   with the full step count at your head sha in `stats/battery.jsonl`,
   never an exit code. One battery at a time, never while sources are
   being edited, and a run meant to measure wall-clock is asked for first
   (the box is the owner's) and labelled clean or contended.
7. **Commit per stage** with a message that names what the gates caught
   (`git commit -F <message-file>` — shell quoting mangles multi-line
   `-m`). Add a poke lane under `tests/gpu/` for any path the serve gate
   cannot reach organically and wire it into `gpu/battery.py`; record
   which lane REACHES a new mechanic in its AUDIT entry.

## Traps this repo has already paid for

- The exported catalog/planes are the SPEC scope: check whether a plane
  already exists before adding one, and compute a plane by CALLING the TS
  rule, never by re-deriving it.
- Two id spaces: tiles carry SEATS (civ index r = seat r+1); units carry
  their owning seat, never the pool range they landed in.
- **Quiesce sources while the battery runs** — children import
  mid-pipeline and execute half-edited code (two incidents). Docs and
  scratchpad writes are safe; reads are safe. Clear `__pycache__` if a run
  inexplicably executes stale code.
- **Budget a hunt into EVERY stage.** A behaviour change reshuffles every
  driven trajectory and historically exposes latent parity bugs in OLDER
  code. Green-first-try is the exception. Expected flow: implement → smoke
  → hunt (see /parity-hunt) → fix latents → battery → commit, with the
  commit crediting each hunted catch.
- New pooled state needs KILL hygiene: when an entity dies, clear every
  field a seat-wide reader could later see (queues, registries), or
  alive-mask the readers. A creation path must APPEND, never fill a hole:
  slot order IS TS array order under append + stable reclaim.
- A new unit class, seat class or decision class invalidates every
  "X never happens" comment and predicate — grep the SENTENCE, not the
  symbol. Most defects found in one ladder were a comment that was TRUE
  WHEN WRITTEN.
- A fact made MUTABLE breaks every flag the exporter baked from it; diff a
  cleared clone and sweep `_MUTABLE` plus the manifest.
- `PYTHONUTF8=1` on every piped python run (cp1251 consoles kill unicode
  prints at the finish line).
- After a deletion, grep the symbol AND run pyright (root config) last —
  ruff does not see every dangling local.
