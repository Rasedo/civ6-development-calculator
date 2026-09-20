---
name: session-continuity
description: Operate long autonomous sessions that survive context compaction — memory discipline, background-job bookkeeping, and safe chain design. Use continuously during any multi-hour development session.
---

# Session continuity — surviving your own context loss

Long sessions here span hours of batteries and hunts; the context WILL
compact mid-task, repeatedly. The difference between seamless continuation
and expensive rediscovery is what you persisted BEFORE the cut.

## What lives where

- **`docs/AUDIT.md`** — the only gap list. Read the file itself, never a
  summary of it. A closed entry is deleted with its weight row in the same
  commit.
- **`docs/ROADMAP.md`** — direction and the decisions already bought with
  runs.
- **`.claude/HANDOFF.md`** — the live handoff, gitignored: what is in
  flight, what is applied-but-uncommitted, the exact next command. Write it
  BEFORE a risky operation and before any mid-stage compaction.
- **The auto-memory** (the memory index and its topic files) — one durable
  lesson per file, named for what it DOES. A gotcha becomes a line there
  the moment it bites, not at the end of the round.
- **`.claude/scratchpad/`** (repo, gitignored) — every temp script, probe
  and codemod. Never AppData.

Write state as ENTRY POINTS, not narrative: the exact next command, the
file and symbol of the anchor, the checkpoint directory, the criterion that
decides. A future you with zero context must be able to act from it
directly.

- **Flag applied-but-uncommitted work explicitly** ("slice 1 APPLIED
  UNCOMMITTED — slice 2 MUST land before any battery"): uncommitted diffs
  are invisible to a fresh context reading `git log`.
- **Record diagnoses with their evidence**, not just conclusions ("the mask
  never offered X, so the gate was green vacuously"). Recon is expensive;
  write it the moment it is proven.

## Background jobs

- Long work (the battery, a long hunt) runs in the background. Launch it
  and END THE TURN — the completion notification re-invokes you.
- `sleep` is denied in settings.json and polling is forbidden: never wait
  in a loop, never re-check "just to see". The box is the owner's and a
  slow lane is contention, never a reason to kill anything.
- Never pipe a background job through `tail` — time the ROOT pid and let
  it write its own file.
- Before ending a turn, the last message must state what is IN FLIGHT and
  what its landing triggers: the notification handler is a fresh context
  and acts from that sentence plus the handoff.
- Check the output file's tail BEFORE acting on a notification —
  "completed" means the process exited, not that it passed. For a battery,
  green is the `pass` row with the full step count at your head sha in
  `stats/battery.jsonl`, never the exit code.
- One battery at a time, and never edit sources while one is in flight.

## Chain design (where sessions silently break)

- `&&`-chains die at the first failure: put verification INSIDE the chain
  (`git diff --stat` after a patch) so a silent no-op cannot green-light
  the next step. Newline-separated commands do NOT stop on failure — a dead
  patch script followed by a battery "verifies" the unpatched tree.
- A codemod that errors writes NOTHING after the substitutions it already
  printed: grep the changed line itself.
- Anything with complex quoting goes through a patch FILE written with the
  Write tool — heredocs are denied, and they collapse backslashes and choke
  on apostrophes. Commit messages via `git commit -F <file>`.
- Never `cd <subdir> &&` in the Bash tool: the cwd persists and every later
  relative-path call fails until the environment resets. Anchor every chain
  at the repo root or use absolute paths.

## Goal loops

Under a standing goal, each turn must either advance the frontier or
persist why it cannot (blocked on a battery = state the trigger and what
its landing decides). Idle turns that restate status without persisting
anything new are the failure mode. Autonomy expires with the goal that
granted it: without a live one, work turn by turn.
