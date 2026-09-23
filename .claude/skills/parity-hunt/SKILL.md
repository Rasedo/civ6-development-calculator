---
name: parity-hunt
description: Diagnose a TS/GPU parity failure down to the exact divergent decision. Use whenever a battery serve lane reds — an obs, decision or digest mismatch.
---

# Parity hunt — from mismatch to the exact divergent decision

A serve-lane failure is a real semantic difference. The hunt ends when you
can name the single decision (turn, seat, rule) where the engines
disagree — then fix the engine that is WRONG. TS is the spec, unless TS
itself is farther from real Civ 6 than the GPU (owner rule): then fix TS,
against the install or the live game, never against memory.

Skim `LESSONS.md` (beside this file) first: past hunts' traps by class, each with the check that catches it.

## Step 0 — read what the gate already told you

The gate bails at the CAUSAL turn and names the failure's kind:

- an **obs** mismatch names the field (via the ladder layout);
- a **decision** mismatch names the seat and the record;
- a **digest** mismatch names the group and whether `exact` or `milli`
  moved, then dumps that group's disagreeing rows BY NAME.

Write down (seed, turn) before anything else. A red battery prints the
hunt commands with those numbers already filled in — take them.

If a TS child CRASHED instead of disagreeing, that is a different failure:
the gate prints the exit code and the stderr tail. Re-run with
`CIV6_SERVE_ERRDIR=<dir>` to keep every child's stderr. An empty tail with
no exit code is the box refusing to spawn, not the engines disagreeing.

## Step 1 — hunt mode: ONE seed, checkpoints, O(1) probes

Never re-run the fleet to ask about one seed. `gpu/serve_gate.py` is never
launched by hand; the battery's hunt mode is the entry:

```
python gpu/battery.py --seeds <seed> --ckpt-every 20                 # lay checkpoints
python gpu/battery.py --seeds <seed> --resume <T-20> --ckpt-every 20 # then each probe is O(1)
```

- The hunt runs stage 0, one serve shard and nothing else — no vitest, no
  poke pool. It records nothing, claims no green and does not spend the
  cadence clock.
- Checkpoints land in `.claude/scratchpad/hunt/<seeds>` (override with
  `--ckpt-dir`). ONE seed per directory: the GPU snapshot does not name
  its seed. The resume asserts the checkpoint's seeds against the
  fixtures, so a stale directory fails loudly.
- Resume from the nearest EARLIER checkpoint (`(T // 20) * 20 - 20`), not
  the one at T — the cause usually predates the turn that bailed.
- A resume VERIFIES only fixes that leave the decision stream unchanged
  (pure-read / state-init bugs). A behaviour-changing fix makes the
  recorded decisions stale and the resumed pair explodes into phantom
  divergences: re-run the single seed FRESH past the fix, to 250. A serve
  hunt is a sequence of first-fire layers — the next one is usually hiding
  behind the one you just fixed.

## Step 2 — decompose the disagreeing quantity

Print the SAME primitive call from both engines side by side BEFORE
reading either body. A composed number (a yield, a strength, a price) is
several claims at once; decompose it until one term differs.

- **The decomposition log** — `CIV6_DIFFLOG=1` arms it on both sides (the
  GPU's `sim._log_diff`; the TS child inherits the variable). The gate
  pairs the keyed lines and prints only the disagreements, ten per kind;
  every kind reports even when it agrees, because a kind silent because it
  never FIRED and one silent because it agreed are different facts.
  `CIV6_DIFFLOG_ALL=1` prints every key from both sides — what a row did on
  the turns AROUND the divergent one is the next question, and the filter
  throws exactly those lines away. `CIV6_DIFFLOG_B=<row>` scopes it to one
  game; `CIV6_DIFF_CAP` (default 12) caps a group's by-name dump.
- **The combat-roll log** — `CIV6_CBLOG_B=<batch row>` arms the GPU's
  `_damage_roll` log and `CIV6_CBLOG=1` the TS twin (`damageRoll` via
  `__cbLog`); on a digest red both tails print side by side (`CB-GPU` /
  `CB-TS`). Rolls pair by the rng counter `c` (absolute stream position),
  so a mismatched `diff` names the divergent strength term and an inserted
  or missing roll shows as a counter slip — no bisect.
- **Discipline knobs** — `CIV6_ALIAS_CHECK=1` (alias storage + `_MUTABLE`
  shape/dtype every step), `CIV6_RC_REGISTRY_CHECK` (the city registry per
  step), `CIV6_RECLAIM_AT=<slots>` (force unit-slot compaction low).
- **Temp probes** are pure reads and replay the exact trajectory. Tag every
  print by game id, gate it on the ACTING mask, and remember that empty
  probe output is not absence. A probe on a SHARED composer records
  whichever caller ran last — one `record` flag, one call site per engine.
  Strip probes before committing; if a probe class recurs twice, promote
  it into the permanent log.
- **Log-key discipline**: a two-sided log's KEY must name the DECISION,
  never the outcome, and every distinguishing field belongs IN the key.
  Print REFUSALS on both sides and window by turn. A keyed diff's silence
  about a field is not evidence it agrees: a moved row compares nothing.

## Known divergence classes (check these FIRST — all were paid for)

1. **Array-vs-column order**: TS iterates and tie-breaks by array
   position; GPU rows append at last-alive+1 and compact stably, so slot
   order IS array order — but only while every creation site appends and
   the reclaim stays stable. A TS `Object.entries` walk and a nested index
   loop diverge the moment two records touch one CAPPED quantity in the
   same pass: sort the TS side into the GPU's index order.
2. **Different row sets**: a TS walk over `state.seats` against a GPU walk
   over every city row forks on the FREE CITIES row. Print both row sets
   before reading either body.
3. **Slot hygiene**: a dead pooled entity's queue/registries leak into
   seat-wide readers. Clear on kill AND alive-mask the readers. Changing
   what a game STARTS with breaks "is this actor active" on both engines,
   invisibly to the digest.
4. **Phase order**: a GPU phase that ticks every record's clock ONCE at the
   end forks from a TS loop that ticks each record after its own step — a
   record dying mid-loop frees state a later record reads. A unit created
   mid-turn is charged by whichever engine spawns it before its own charge.
5. **Post-walk freshness**: TS recomputes live where the GPU serves a memo.
   A memo needs the argument AND the catalog gate; a cache key that is a
   VIEW of a live plane compares equal to itself forever.
6. **Draw-count vs draw-value**: same count, different values is invisible
   to a counter — that is what the CB lines catch. Unconditional rolls with
   gated OUTCOMES keep draw parity.
7. **Association/dtype**: non-dyadic quanta round differently across sum
   orders; milli-round at shared thresholds; never assert f32-vs-f64
   end-to-end equality — assert the construct.
8. **Refusals, not just writes**: porting a write across a plane split is
   half the job — the REFUSAL predicates diverge too. A GPU applier arm
   must AND the TS validator's early returns, shared in one predicate, and
   parallel boolean arms must be exhaustive (a legal action in no arm
   silently no-ops — assert the truth table). A target-legality gate
   belongs on the "is there a city here" predicate, not the attack mask.
9. **The driver twin**: the compared driver tables (jobs, spreads, buys,
   routes) exist in `policy/drive.py` AND `cpu/driver/driver.ts`; a clause
   in one and not the other is a decision fork, not an engine bug.
10. **A stale sentence**: most catches in one ladder were a comment that
    was true when written. When a class, row or plane is added, re-read the
    SENTENCES around it.

## Verify

- The single-seed fresh re-run past the fix (to 250) is the hunt's own
  check; the FULL battery is the bar, once, at the round's end — never per
  fix, and never a battery chained onto a green hunt of the same state.
- Ruling a cause out in one path does not rule it out in its twin, and a
  probe proves the ONE path it measured. A run also proves only the REGIME
  it reached: 30 turns and 250 turns are different worlds.
- Say in the commit what the divergence WAS (seed, turn, rule) — the git
  log is this program's memory.
