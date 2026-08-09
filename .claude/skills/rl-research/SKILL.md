---
name: rl-research
description: Choose, design and judge the next RL avenue (self-play modes, league, search, distillation, reward design) using this program's evidence discipline. Use before committing compute to any new training direction.
---

# RL research methodology — how avenues live and die here

The program's epistemics, in one line: **literature proposes, structure
disposes, measurement decides.** Every methodology conclusion in
docs/ROADMAP.md was bought with a run; don't re-litigate them without new
evidence, and don't extrapolate them past their scope.

## Choosing the next avenue

1. **Start from a named failure, not an idea.** The best avenues came
   from diagnosed gaps: "the duel metric can't discriminate" → the units
   head; "seat-1 gets no gradient" → self mode; "wars win nothing" →
   capture; "PPO can't find multi-turn sieges" → distillation. If you
   can't name the failure a method fixes, it's not next.
2. **Prefer the cheapest experiment that can falsify.** Small rungs
   (batch 64, 40 updates, ~40 min) while methodology is unsettled; big
   budgets only for settled recipes. A rung must change ONE variable.
3. **Mine the synthesis before the web**: the archived synthesis (git history) holds the
   literature map (Gumbel MuZero → our SH-over-depth variant; OpenAI
   Five's 80/20 → the EMA+pool mixture; AlphaStar → PFSP; Diplodocus →
   piKL anchoring; MAZero/A0C → the M3d target menu). Adapt to THIS
   game's structure — deterministic env means budget buys DEPTH not
   revisits; seat asymmetry means seat-averaged everything.

## Designing the rung

- Define the success criterion BEFORE launching, as a behavioral or
  ranking fact, not a score: "cities > 4.6", "orderings split off
  90/10", "stationary mass moves". Scores drift for spurious reasons.
- Every rung gets the four-part read (see /training-rung): standard
  eval, both duel orderings, α-Rank vs the family, behavior probe.
- Keep a champion and challenge it explicitly. Champion changes ONLY via
  α-Rank — raw eval crowned two regressed nets before the protocol
  caught them.

## Judging results — the diagnosis catalog (observed here)

- **Eval up, mass down** → the net traded one seat's skill for the
  other's (gradient starvation). Fix the training structure, not the
  hyperparameters.
- **Symmetric ordering dominance (~90% both ways)** → the SEAT, not the
  net, decides games: the weaker seat lacks verbs. Fix the action
  surface before spending more compute.
- **Verb used eagerly, outcome flat** → the verb has no payoff (war
  before capture). Land the payoff, re-run, THEN judge the verb.
- **Behavior shifts rationally, objective doesn't move** (arming up
  under symmetric capture) → the remaining gap is exploration/credit
  assignment, not incentives → search/distillation territory, not more
  PPO.
- **KL → 0.000** → the anneal killed learning; the run is over
  regardless of the update counter.
- **Plateau** = record-tying eval + champion retained + dead KL, not
  merely "slower progress". Only then bring the league back.

## Reporting

Every rung's entry in docs/ROADMAP.md §Training log must contain the MECHANISM ("because
X, therefore Y"), not just numbers — the next agent inherits reads, not
tea leaves. Negative results with a named cause are first-class output;
two of this program's most valuable findings were regressions.
