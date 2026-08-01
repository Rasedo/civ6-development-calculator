# gpu/docs — what is here and what is still true

`gpu/` had 40 markdown files, ~14,500 lines, more documents than test lanes.
Most were round logs: a narrative of one hunt, accurate on the day, never
revisited. They were sitting beside the plans and the AUDIT as though equally
current, and that is a hazard rather than a filing problem — a stale note reads
like a rule. #51/S8.1c happened exactly that way: a comment saying "no rival
treasury" was TRUE WHEN WRITTEN, the plane landed later, and the observation
went on reporting zero.

## The split

**`gpu/*.md` — LIVING.** Read these; keep them true.

| file | what it is |
|---|---|
| `README.md` | how the batch engine and the gates work |
| `AUDIT.md` | the fidelity gap list — the standing work queue |
| `BUILD_PLAN.md` | the overall build plan |
| `UNIFY_SEATS_PLAN.md` | #51's staged plan. NOTE: its Round 8 section predates the 2026-08-01 decision to move the ladder OUT of both engines; the task list is the authority where they disagree |
| `ROUND7_DECISIONS.md` | decisions taken, with the sources that settled them |
| `TRAINING.md` | the RL side |
| `HUNTING.md` / `SEARCH.md` | how to find a divergence; read before writing a probe |
| `PERF_PLAN.md` | measured gate timings and the walls |
| `TOOLING_PLAN.md` | gate/tooling work |

**`docs/rounds/` — HISTORY.** Finished hunts and their logs. Useful for "why is
this the way it is", NOT for "what is true now". Assume every claim carries the
date it was written. `ARCHIVE.md` is the older collection of the same.

**`docs/design/` — PER-FEATURE DESIGN NOTES.** Naval, governors, geopolitics,
dedications, tourism residuals, world congress. Mostly implemented; the note
describes intent, the code is the truth.

## The rule this filing encodes

A document that is not maintained should not sit where maintained documents
sit. If you find something in `docs/rounds/` that is still load-bearing, it is
in the wrong place — promote it, or fold it into the AUDIT.

Reference code by SYMBOL, never line number: these files outlive the line
numbers by months.
