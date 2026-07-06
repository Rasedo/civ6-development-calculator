# C1 — the self-play architecture decision

> **DECIDED 2026-07-06: Road A — full-fidelity C1.** The user chose to
> promote rivals to full symmetric civs in BOTH engines under the parity
> contract. The staged plan lives in `BUILD_PLAN.md` §3 (C1-A groundwork →
> C1-B subsystem promotion → C2 egocentric surface → C3 self-play trainer).
> The analysis below is kept for the record.

Self-play with tree search needs a second **policy-driven** civilization.
Today both engines have exactly one: the player is a full citizen
(per-city queues/districts/buildings, tech+civic trees, treasury, units,
envoys, GP), while rivals are ~7 scalars per civ (`r_tech`,
`r_prodstock`, `r_milstock`, war flags) plus city pop/HP lists and a
heuristic behavior walk. There is no owner dimension on any action,
observation or reward tensor; `empire_score()` sums player cities only.
"Drop a second policy in" is not an option — something must be built.
Two honest roads, and a hybrid that defers the expensive commitment.

## Road A — full-fidelity C1: promote rivals in BOTH engines

Re-architect the real engines so every player subsystem gains an owner
dimension (`[B, O, C, …]`), with per-owner masks/obs/reward and the
TS oracle rebuilt symmetrically (the parity contract demands both sides
change together).

- **Payoff:** self-play happens on the *real* environment — everything
  learned applies directly to the full-fidelity world; one engine to
  maintain; the scripted-rival code deletes eventually.
- **Cost:** this is the largest single project in the repo's history —
  bigger than the whole district arm. Every fixture regenerates, every
  benchmark baseline resets (rival behavior changes), the parity gates
  roughly double in weight, and the RL surface (obs 83 → per-owner
  egocentric, action routing, reward) rewrites alongside. BUILD_PLAN's
  scoping verdict stands: "a two-engine RE-ARCHITECTURE, not a
  refactor."
- **Risk:** months of stages before the first self-play game; nothing
  ships in between.

## Road B — symmetric mini-env first

Build a NEW, small environment that is owner-indexed from day one: two
civs, shared map, the covered economic core (growth, districts-lite,
units, loyalty), no TS mirror — or a thin one — and run C2/C3
(egocentric obs, league, PFSP) plus the M3 search-distillation loop on
it.

- **Payoff:** self-play infrastructure (the genuinely new machinery —
  league play, frozen-snapshot pools, per-civ reward, search-in-the-loop
  training) gets built and validated in days-to-weeks, not months; zero
  parity burden; findings (net architecture, search config, league
  hyperparameters) transfer as *knowledge* even though weights don't.
- **Cost:** a second env to write and maintain; its conclusions are
  suggestive, not binding, for the full engine; risks the mini-env
  drifting into its own research toy.

## Road C — hybrid (recommended): defer the commitment, buy information

1. Keep pushing the single-agent arm on the real engine — it is NOT
   exhausted: tuplesearch still loses to greedy (the value head is the
   bottleneck), M3's search-distilled training is unexplored, and the
   new verbs (purchases live; war/peace plumbed; capture/ranged next)
   keep raising the ceiling vs the scripted world.
2. In parallel (cheap), build Road B's mini-env to de-risk C2/C3: prove
   the league/self-play machinery works AT ALL on a Civ-like action
   space before betting the engines on it.
3. Commit to full C1 only when self-play in the mini-env demonstrably
   produces strategies the scripted world can't teach (early war
   punishes, loyalty sieges, forward-settle denial). If it doesn't,
   C1's cost was never worth paying.

## The questions only you can answer

1. **What's the goal?** "Strongest agent on this simulator" → M3 first,
   C1 maybe never. "Self-play research platform / AlphaZero-style
   result" → mini-env now, C1 when proven.
2. **Appetite:** C1 is a multi-month autonomous project with heavy
   fixture churn; the mini-env is days-to-weeks. Which fits your
   patience for no-visible-progress phases?
3. **Parity contract:** for the multi-agent arm, keep the two-engine
   bit-exact discipline (slow, trustworthy) or accept a single-engine
   mini-env (fast, unverified)? The single-agent arm keeps its gates
   either way.

Answer in any form ("road C", "mini-env but keep parity", "just do
C1") and the plan gets written as ordered stages in BUILD_PLAN.md.
