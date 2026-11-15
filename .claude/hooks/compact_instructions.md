Keep, in this order:

1. Every owner message since the last summary, verbatim, and any ruling in it
   (what is allowed, forbidden or deferred), dated.
2. The lead's state as entry points, not narrative: main's head sha; each
   running agent (name, worktree, base sha, AUDIT ids, one line of task); each
   background job (task id, what it measures, at which sha); any hand-back
   received and not yet merged, with its patch path; any merge half applied
   (what is staged, the next command).
3. The last bar: its tag and sha, green or red, the score rows that moved, and
   any regression not yet given to a fixer.
4. Facts the files do not hold: a cause found and not yet written to AUDIT, a
   brief's premise an agent proved wrong, a decision between two overlapping
   patches and why.

Drop: tool output, file contents, the text of hand-back reports already
merged, per-merge detail the commit messages carry, and the procedure itself
(.claude/HANDOFF.md, .claude/scratchpad/brief_aiport.md and the scripts hold
it). Restate no rule CLAUDE.md states.
