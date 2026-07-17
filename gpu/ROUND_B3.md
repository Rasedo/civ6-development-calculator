# ROUND B3 — four small parallel slices (U/V/W/X)

2026-07-18. Owner direction: "continue with smaller changes in parallel
of 3-4". Fourth proven parallel-worktree round (after combat e7ba22a,
ROUND B2 33199dc, A-5r+#47r 77c7831). Base sha: the commit that adds
this file (on top of 77c7831). All agents on Opus (owner rule); gates
are the correctness bar, not model trust.

Landing log: gpu/ROUND_B3_LOG.md — each agent appends its section
(§U/§V/§W/§X) recording what landed, what degraded, what deferred,
with exact next steps. AUDIT.md updates happen at merge (orchestrator),
NOT in agent worktrees (keep-out — avoids 4-way conflicts).

## Common rules (unchanged from B2; violations are round failures)

1. TS is the spec; where TS itself deviates from real Civ 6, fix TS
   (owner source-of-truth rule). Real-game values below are rulings.
2. RNG draws mirrored draw-for-draw; conditional draws gate on
   identical conditions (unconditional-draw/gated-outcome = the
   peace-roll pattern). Float association matches TS exactly.
3. Inert plumbing first where feasible: new state lands byte-identical
   (fixtures hash equal), then behavior flips in its own commit.
4. New pooled state: `_MUTABLE` registration + KILL hygiene + the
   forced-compaction gate. New order/tie logic follows city_seq.
5. Each slice proves IN ITS WORKTREE before returning: tsc clean,
   vitest green, scripted gate `PYTHONUTF8=1 python gpu/parity_test.py`
   0.0 milli, forced-compaction gate (`CIV6_RECLAIM_AT=12
   CIV6_RC_RECLAIM_AT=3` prefix) if slot state was touched, poke tests
   wired into gpu/battery.py cputests. Re-export fixtures first when
   TS/data changed. The off-script gate + full battery run ONCE at
   merge (orchestrator).
6. Trajectory-reshuffle casualties are expected, not bugs: a seed that
   dies structurally gets a SEED_OVERRIDES reroll (scripts/
   export-gpu.ts) + DELETE the stale seedNNNN.json (export writes,
   never cleans). Fix the TEST when the engines agree and a probe
   drifted.
7. Edit via patch FILES (Write tool), never shell heredocs; verify
   anchors with grep first; `git diff --stat` before any gate. Never
   edit src/core or gpu/civ6gpu while a gate is in flight. Clear
   __pycache__ on inexplicable stale behavior. PYTHONUTF8=1 on every
   piped python run. Commit via `git commit -F <file>`.
8. Partial-return protocol: if budget runs out, commit what is
   gate-green, record the remainder in your ROUND_B3_LOG section with
   exact next steps, and return honestly. A green partial beats a red
   total.

## Slice U — B-18 pressure→yields coupling (agent U)

The crispest religion follow-up (ROUND_B2_LOG §T "Deferred" has the
full context). `followedReligion` is computed, serialized,
compaction-safe and trace-proven since 77c7831 — but the yield
pipeline ignores it: follower-belief yields still apply UNIFORMLY
per-civ (effects.ts `getModifiers`/`getRivalModifiers`).

Land: a city's FOLLOWER-belief yields (buildingYields, growth,
featureYields, gpp — whatever channels the 9 follower beliefs
actually carry) key on the CITY's `followedReligion`, not the owner's
religion, in BOTH yield pipelines:
- TS: `computeCityStats` (player cities) + `rivalCityYields`
  (core/rivals.ts). Map religion id g → the founding civ's chosen
  follower belief (g=0 player — no in-gate founder; g=i+1 = rival i's
  `followerBelief`).
- GPU: `_city_totals` (player walk) + `_rival_city_yields` AND the
  batched `_rival_city_yields_all` (D-9 — keep them bit-equal; the
  batched path is the trace path).
- PANTHEONS and founder beliefs stay per-civ — ONLY follower beliefs
  move to the per-city followed-religion lookup.
- Reconcile flip-carry semantics: verify TS `flipCityToRival` /
  capture paths reset religionPressure exactly like the GPU
  zero-on-death (kill hygiene both sides).

Gate-visible: ~24 player cities + 219 rival cities follow religions
in-gate — expect a real reshuffle. This is the round's highest
parity-risk slice; budget a hunt.

Keep-out: `_gov_policy_mods` and the government-channel application
blocks (slice V's), projects/victory (W's), combat (X's).

## Slice V — B-13 `unlockPolicy` wiring (agent V; task #46 residual)

The 39 Round-B2 cards are catalog-only: no civic grants them
(`unlockPolicy` wiring deferred in ROUND_B2_LOG §P). Wire their
unlocks in data/civics.ts to the REAL Civ 6 granting civics (full
catalog parity is the standing owner ruling; the tree is 51 civics
through Future, so nearly every real granting civic exists).

- GATE-SERIALIZED BATCHES: every wiring can shift the deterministic
  greedy slot fill on BOTH seats (adoption is LIVE since 7ffc9b0).
  Land in small batches (e.g. by era), scripted gate between batches,
  so a red gate names its batch.
- When a newly slotted card carries a channel `_gov_policy_mods` does
  not implement (amenitiesAll, adjacencyMult, buildingYieldMult,
  amenitiesIfSpecialty, newDeal), and that card actually SLOTS
  in-gate: implement the channel (both engines, same pipeline point —
  the A-7r pattern). The AUDIT A-7r "unreachable by proof" note was
  derived under the CURRENT unlock set — your wiring can invalidate
  it (wildcard overflow order changes as more cards unlock). Record
  the new reachable/unreachable proof in §V.
- Diplomatic cards make AUTOCRACY's D slot live — expected.
- Extend `gpu/government_test.py` for at least one newly-wired card
  slotting + any newly implemented channel.

Keep-out: religion/belief yield blocks (U's), projects/victory (W's),
combat (X's). You own data/policies.ts, data/civics.ts,
`computeAdoption`/`applyGovernment` (effects.ts), `_gov_policy_mods`
and the existing gov-channel application sites.

## Slice W — B-25 GPU space-race sim (agent W)

The Science victory is TS-complete since Round B2 (§R): a 6-step
space-race project chain gated on late techs, Campus as the Spaceport
proxy, `victoryType` 3 (player win) / 4 (rival completion = defeat)
set in `endTurn`. The GPU still FILTERS the chain from its projects
table ("gate-unreachable at 100t" — stale since #56's 250t horizon).

Land: the GPU simulates the chain turn-exactly.
- Exporter: stop filtering the space-race rows from the GPU projects
  table (scripts/export-gpu.ts); ship the tech gates + step order.
- GPU: mirror the TS chain semantics exactly — step sequencing,
  production accounting, completion, and the victoryType 3/4 mirror
  at the same phase point as TS `endTurn`. Check how the existing
  victoryType values terminate/flag a game in the gate + trace and
  mirror that exactly (a game that ends in-gate must end identically
  in both engines).
- First: determine reachability at 250t (does the scripted player or
  any rival actually start the chain in-gate?). If YES: parity gates
  prove it. If NO: land it poke-covered — a `gpu/space_race_test.py`
  that forces late techs on both engines and proves the chain +
  victory flags turn-exact; record gate-unreachability honestly in §W.
- Rival side: rivals run projects via the existing projects path —
  if TS lets rivals advance the chain, the GPU must too (victoryType
  4).

Keep-out: religion (U), gov/policy (V), combat (X). You own the
projects/production chain code + exporter projects table + the
victory flag mirror.

## Slice X — B-29 combat fidelity (agent X)

Real Civ 6 (AUDIT B-29, values are the ruling): damaged units fight
at reduced strength (up to −10 at zero HP, linear in damage), and
melee attacking across a river takes −5. Neither exists.

- Wounded penalty: effective CS = base − 10·(damage/100), i.e.
  −1 per 10 HP lost, applied to a UNIT's strength wherever its CS
  enters `damageRoll`/`_damage_roll` — attacker and defender, all
  seats (player/rival/barb/CS combats). City/CS center strengths are
  NOT units — unchanged (record in §X). Apply at the strength-input
  chokepoint(s); TS and GPU must share the exact formula and
  rounding (keep it in float, no rounding, unless TS forces one).
- River crossing: MELEE attacks where `crossesRiver(attackerTile,
  targetTile)` (core/units.ts) → attacker CS −5. Ranged attacks
  unaffected. The GPU needs the same river-edge lookup at its melee
  sites — check the exported river representation (`riv` plane /
  whatever `_move_cost` uses for crossings) and mirror `crossesRiver`
  exactly.
- Draw COUNTS unchanged everywhere — only the strength inputs move.
  The CB statelog line (diff column) will shift values: that is the
  expected signature.
- All `damageRoll` call sites both engines (mel/melc, rng, rngrc,
  rngcs, rcty/rctyc, csty/cstyc, pcty/pctyc + barb paths) —
  symmetric, both seats, or the symmetry contract breaks.
- This reshuffles EVERY trajectory: full fixture regen; expect
  scripted-seed casualties (rule 6) and possibly rlenv/war_test poke
  drifts (fix the test when the engines agree).
- Extend/add a poke proving both penalties bit-exact (a wounded
  attacker and a river-crossing melee scenario).

Keep-out: religion (U), gov/policy (V), projects/victory (W). You own
combat.ts strength inputs, `crossesRiver` consumers at combat sites,
and `_damage_roll`/strength assembly in engine.py.

## Merge plan (orchestrator)

Squash-merge worktree branches U → V → W → X onto base; resolve
union conflicts; ONE fixture regen; scripted + forced gates; off-script
gate; full battery; the budgeted hunt (reshuffle latents are expected —
X guarantees a full reshuffle); AUDIT completion block + item updates;
squash to ONE round commit; push; prune worktrees.
