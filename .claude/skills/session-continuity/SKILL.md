---
name: session-continuity
description: Operate long autonomous sessions that survive context compaction — memory discipline, background-job bookkeeping, and safe chain design. Use continuously during any multi-hour development or training session.
---

# Session continuity — surviving your own context loss

Long sessions here span hours of training runs and dozens of background
jobs; the context WILL compact mid-task, repeatedly. The difference
between seamless continuation and expensive rediscovery is what you
persisted BEFORE the cut. This session's record: ~30 compactions, zero
lost work — by these rules.

## The memory contract (project memory, not scratch files)

Persist to the project memory (`c1-progress.md` or successor) at every
milestone AND before every risky operation:

- **State as entry points, not narrative**: the exact next command, the
  file+line of the anchor, the checkpoint path, the decision criterion
  ("cities > 4.6 = success"). A future you with zero context must be
  able to act from it directly.
- **Flag applied-but-uncommitted work explicitly** ("slice 1 APPLIED
  UNCOMMITTED — slice 2 MUST land before any battery") — the single most
  valuable flag; uncommitted diffs are invisible to a fresh context
  reading git log.
- **Record diagnoses with their evidence**, not just conclusions
  ("KEY RECON (do not rediscover): the mask never offered X, gates green
  vacuously") — recon is expensive; write it the moment it's proven.
- **Gotchas as standing rules** the moment they bite (resume counters,
  best.pt watermarks, heredoc mangling). One sentence each.
- Working docs (BUILD_PLAN/TRAINING.md) carry the durable program state;
  memory carries the SESSION state (in-flight, next, uncommitted).

## Background jobs

- Long work (training, batteries, evals) runs in the background; the
  notification re-invokes you — never poll, never sleep-loop.
- Before ending a turn, the last message must state what is IN FLIGHT
  and what its landing triggers — the notification handler is a fresh
  context; it acts from that statement plus memory.
- One GPU tenant at a time (training); CPU probes and doc work overlap
  freely; evals wait for the GPU.
- Check `tail` of the output file BEFORE acting on a notification —
  "completed" means the PROCESS exited, not that it succeeded.

## Chain design (where sessions silently break)

- `&&`-chains die at the first failure: put verification INSIDE the
  chain (`git diff --stat` after a patch, `parses` after codegen) so a
  silent no-op cannot green-light the next step.
- Newline-separated commands do NOT stop on failure — a dead patch
  script followed by a battery "verifies" the unpatched tree (happened;
  the battery was vacuous).
- `cd` persists across tool calls — anchor every chain at the repo root
  or use absolute paths.
- Anything with complex quoting goes through a patch FILE written with
  the Write tool, never a shell heredoc.

## Goal loops

Under a standing goal (a stop-hook or /loop), each turn must either
advance the frontier or persist why it can't (blocked on a training run
= state the trigger and what its landing decides). Idle turns that
restate status without persisting anything new are the failure mode.
