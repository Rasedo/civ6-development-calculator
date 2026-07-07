# Training the native GPU policy — quick guide

Everything runs from the repo root. One-time setup: `npm install` (for
the fixture exporter) and `pip install -r python/requirements.txt`
(torch); `pip install tensorboard` if you want live curves.

## 1. Export fixtures (once per engine version)

Fixtures are gitignored and MUST come from your current checkout — the
engine refuses nothing, it just silently mismatches if they're stale.

```bash
npm run gpu:export -- 24            # 24 maps instead of the default 10
python gpu/parity_test.py           # optional sanity: must print PARITY OK
```

More seeds = more map variety in the batch (games cycle through the
fixture pool round-robin). 16–32 is a good training pool; the RNG is
re-scrambled every episode anyway, so even one map never repeats a
world, but map diversity fights overfitting to one terrain layout.

## 2. Pick the device — measure, don't assume

```bash
python gpu/bench.py
```

This prints env throughput for CPU and (if available) CUDA. The engine
still walks a few python loops with per-turn syncs, so on a laptop GPU
the ENV can be slower on CUDA than on CPU at small batch — CUDA earns
its keep at batch ≥ 1024 or so. The trainer keeps env + policy on one
device; pick whichever bench wins at the batch you'll use.

## 3. Train

```bash
# GPU box / large batch
python gpu/train_ppo.py --batch 1024 --updates 2000 --anneal-lr --out gpu/runs/overnight

# laptop-friendly
python gpu/train_ppo.py --batch 256 --updates 4000 --anneal-lr --out gpu/runs/overnight
```

Notes for sizing an overnight run:

- One update = one full episode per game = `batch × 100` env steps,
  plus the PPO epochs. The log's last column is steps/sec — after two
  or three updates you know your rate. Total steps ≈ sps × 3600 × hours;
  set `--updates` ≈ that ÷ (batch × 100). Overshooting is fine:
  `latest.pt` saves every 25 updates and `best.pt` whenever the mean
  training score improves, so stopping early loses at most 25 updates.
- CUDA out of memory → halve `--batch` (the rollout buffer dominates:
  observations, per-unit features and masks scale linearly with it).
- `--anneal-lr` matters for long runs; without it late training gets
  noisy.
- Resume after any interruption:

```bash
python gpu/train_ppo.py --resume gpu/runs/overnight/latest.pt --out gpu/runs/overnight \
    --batch 1024 --updates 4000 --anneal-lr    # same batch; updates may extend
```

## 4. Watch it

```bash
tensorboard --logdir gpu/runs/overnight/tb     # or read gpu/runs/overnight/log.csv
```

- `score/mean` — the number that matters. Baselines on the CURRENT
  district engine (50-episode eval, re-run 2026-07): random 115.1 ± 11.8,
  scripted autopilot 162.2 ± 13.0, and the reference net **tune1** at
  **216.9 ± 13.5** greedy (26-action district engine; 12M steps ≈ 80 min
  on an RTX 4070 SUPER: `--batch 4096 --updates 30 --horizon 100
  --ent-coef 0.02 --anneal-lr`). Historical, pre-district engine:
  random 111.0 ± 12.2, scripted 172.5 ± 17.3, CPU smoke 186.4 at 256k
  steps, 40M-step overnight 213.6 ± 13.5 (14-action, farms only).
  tune1's recipe notes: horizon 100 (matches the eval protocol — the
  60-turn quicknet trained fast but evaluated weak), ent-coef 0.02 kept
  entropy at 2.15 instead of quicknet's 0.67 collapse, and the anneal
  flatlined learning by update ~28 — extending past 30 updates needs a
  fresh (non-zero) lr schedule, not a longer anneal.
- `policy/approx_kl` — healthy is ~0.002–0.01. Pinned above ~0.03 for
  many updates → halve `--lr`.
- `policy/entropy` — should decline slowly over the whole run. A crash
  toward 0 in the first fifth → raise `--ent-coef` (e.g. 0.02).
- `policy/clipfrac` — ~3–10% is normal.

Scores here are NOT comparable to the TS benchmark table (this world
has direct unit control, barbarians, rivals, disasters); compare only
against the baselines above.

## 5. Evaluate

```bash
python gpu/eval.py --policy gpu/runs/overnight/best.pt --episodes 50   # greedy
python gpu/eval.py --policy gpu/runs/overnight/best.pt --episodes 50 --sample
python gpu/eval.py --policy random --episodes 50                      # re-baseline
```

Greedy (default) is usually a few points above sampled. Same `--seed`
reproduces the same eval worlds, so before/after comparisons are fair.

Checkpoints carry their action-space vintage: a pre-purchase 26-column
net (tune1 and older) auto-narrows the env at load
(`fit_env_to_checkpoint` prints a note and disables the purchase
columns), so old nets stay benchmarkable against the live 46-column
engine; matched-world scripted baselines are unaffected either way.

## Reference numbers

4-core CPU container, engine v5b (historical):

| | |
|---|---|
| env only, f32, batch 1024 | ~13,000 game-turns/sec |
| trainer end-to-end, CPU, batch 64 | ~370 steps/sec |
| random / scripted / 256k-step PPO | 111.0 / 172.5 / 186.4 |

RTX 4070 SUPER, district engine (2026-07):

| | |
|---|---|
| trainer end-to-end, CUDA, batch 4096, horizon 100 | ~2,100–2,600 steps/sec |
| trainer end-to-end, CUDA, batch 4096, horizon 60 | ~5,700–6,200 steps/sec |
| random / scripted / tune1 (12M steps, ~80 min) | 115.1 / 162.2 / **216.9** |
| tune2 — 46-action purchase head, 50 updates (20.5M steps) | **221.6 ± 14.5** |

C1-B1 (real rival tile-working) re-baselined the world — rivals starve,
grow on the unscaled curve and lost their flat base, so the player's
side got friendlier: **random 122.8 ± 11.2, scripted 192.2 ± 13.6**.
C1-B2 (per-city rival queues) re-baselined again: **random 106.4 ±
11.1, scripted 156.1 ± 11.3** — harder than the B1 world (every rival
city produces continuously). C1-B3 (real rival research) re-baselined
once more: **random 115.7 ± 10.5, scripted 156.8 ± 11.2** — rival
armies stay warrior-heavy until real BRONZE_WORKING/HORSEBACK_RIDING
land (~t70+/unreached), which softens the world mostly against random
play. C1-B4 (districts/buildings) landed at random 108.7 ± 11.4 / scripted
154.9 ± 11.5; C1-B5 (builders, real production, housing) re-baselined
the finished B-arc world: **random 114.4 ± 11.6, scripted 172.7 ±
12.4** — terrain-honest rival production and housing-throttled growth
soften rivals vs the old stand-ins. The next reference net trains on
the B5 world (every earlier net is stale).

**C3a-1** is that net and the first SELF-PLAY one: 30 updates of
seat-swapped PPO over the O=2 DuelEnv (dense phase, EMA opponent +
80/20 frozen pool, the learner training on its own rows only) reached a
training-duel mean of 169.8 and **evaluates at 215.6 ± 11.8 on the
standard scripted world — +43 over the scripted policy (172.7)**.
The relative-reward phase (c3a-2, 40 updates) evaluates at 207.8 ±
12.7 (within CI of c3a-1 — the expected margin-vs-score trade). The
decisive finding is in the head-to-head protocol: **seat 0 wins 88%
with ~+70 margin in BOTH orderings** — the seat asymmetry (full player
surface vs economics-only rival control) dominates the duel metric, so
plain O=2 self-play cannot yet discriminate net strength. C3-prep
(the rival units head + war verbs) is therefore a PREREQUISITE for
meaningful self-play pressure and for C3b's league metric — it lands
before more relative-phase compute.

c3a-3 (40 updates WITH the units head live) stays family-flat on the
standard world (211.4 ± 12.9) and the seat still dominates duels
(92%/+75 both orderings) — which exposes the deeper cause: in EMA mode
the learner trains ONLY on seat-0 rows, so seat-1 play never receives
gradient; the EMA opponent drives seat 1 out-of-distribution. c3a-4
switches to --opponent self (both seats learn, true seat-swapped
self-play) to build dual-seat competence before EMA/PFSP resume.

c3a-4 (40 self-mode updates) DELIVERS THE DISCRIMINATION SIGNAL: the
standard eval reaches **219.8 ± 13.1 (family best)** and the duel
orderings finally split — c3a-4-as-A beats c3a-3 92%/+84.8 while
c3a-3-as-A manages only 79%/+63.5 against c3a-4's seat-1 defense (~13
win-rate points of measurable seat-1 skill). The duel metric now
discriminates; the C3b gate is OPEN and c3a-5 activates PFSP (the
pool/EMA opponents inherit c3a-4's dual-seat weights, so learner-vs-
pool pressure is meaningful).

c3a-5 (40 PFSP updates) is the protocol's proof: standard eval reaches
a new family best (**225.0 ± 13.1**) but **alpha-rank hands c3a-4
0.978 of the stationary mass** — c3a-5's seat-1 play collapsed (0.08
as-seat1 vs c3a-4) because PFSP mode trains learner rows only, starving
seat-1 gradient exactly like the EMA phase did. Raw eval would have
crowned c3a-5; the seat-averaged round-robin caught the regression.
c3a-6 fixes the structure: seat-ALTERNATING league play (the learner
swaps seats across updates while the pool drives the other side), so
both seats keep receiving gradient under pool pressure.

c3a-6's read closes the O=2 methodology question: alternation halves
per-seat experience per update and c3a-4 KEEPS 0.978 of the stationary
mass (c3a-6: 0.006, eval 215.1). **Plain self mode — both seats
learning every update against the mirror — is the O=2 workhorse**; the
league infrastructure stands validated as PROTOCOL (alpha-rank caught
the c3a-5 AND c3a-6 regressions that standard eval missed) and returns
as TRAINING structure when self mode genuinely plateaus, with longer
budgets. c3a-7 is the long self-mode run from c3a-4. Its read: 140 annealed
updates reach a training-duel best of 190.6 and a standard eval of
**225.5 ± 13.3** (record-tying) — but c3a-4 RETAINS the alpha-rank
crown (0.971 vs 0.029; c3a-4's seat-averaged head-to-head 0.53) and
the KL flatlined to 0.0000 as the anneal died. **Plain self-play has
plateaued at the c3a-4 frontier under this recipe** — the staged
plan's league criterion is met. Next structural step when O=2 resumes:
mixed self+pool updates (half the games self-mode for both-seat
gradient, half vs pool members for league pressure — alternation's
throughput cost without its seat starvation), plus a fresh non-zero LR
schedule per the tune1 note. Meanwhile the first O=4 FFA run takes the
GPU.

**The O=4 chapter opened**: ffa-1 (dense bootstrap, 40 updates, all
four civs learning over the fixtures_o4 pool) trains stably to a
4-seat mean of 153.1; ffa-2 (the C3c headline regime — RELATIVE
zero-sum across four seats, piKL-anchored to ffa-1) holds 154.1 with
healthy KL/entropy and NO mixed-motive collapse. The FFA ladder is
live; next rungs are longer anchored runs, kingmaking telemetry
(per-seat win vs score distributions), and alpha-rank over FFA
checkpoints.

**The war-head rung (c3a-8-war)** — the six-head trainer resumed from
c3a-4 with V-W1 live: the net USES the verb (wars seen 0.1 -> 1.0,
essentially every game) and even hoards gold as peace-exit liquidity
(treasury 16 -> 40), but the standard eval stays on the family plateau
(217-225): declaring war neither helps nor hurts, because war has NO
PAYOFF yet — beating rival units buys attrition, not territory. This
empirically validates BUILD_PLAN's ordering: V-W2 (capture) is what
makes aggression meaningful, and it is the last designed engine round
(capture-as-civ-transfer, constraints at §4 V-W2).

**The conquest rung (c3a-9-conquest, V-W2 live)**: the net keeps
warring (1.0), ARMS UP (units 6.2 → 7.5, improvements up, probe score
at the family top 231.0) — but cities stay 4.6 and rival cities 8.3:
forty updates never discover an actual CAPTURE. Finishing a siege
means many coordinated attack turns against 40-60 defense before any
reward arrives — a deep credit-assignment gap plain PPO exploration
won't cross quickly. This is precisely the M3d thesis, now empirical:
SEARCH can find the siege line (MPC over the capture payoff), and
search-derived targets can distill it into the policy. The engine
roadmap is complete; conquest is a training-methodology frontier.

**The war trilogy's conclusion (c3a-10-total, the fully symmetric
world)**: with capture live BOTH ways, the net arms up further (8.2
units — rational deterrence now that its own cities are takeable),
keeps warring, holds the family score band (215.3 eval) — and still
never captures (cities 4.6, rival cities 8.3, three war-capable rungs
in a row). The conquest credit-assignment gap is maximally
established: the multi-turn siege barrier is beyond plain PPO
exploration at these budgets. M3d (search-derived targets —
gumbelsearch finds siege lines, distillation teaches them) is the last
implementation item on the roadmap, fully scoped in task #18 and
ARCHIVE.md's research synthesis.

**M3d first distillation (c3a-11-distill) — a first-class NEGATIVE
result with a named mechanism**: 77 targets from the M1 search
(plan_production, SCRIPTED-continuation rollouts) distilled into the
225-strength champion dropped it to 190.3, with the behavior probe
showing exactly the scripted planner's fingerprints (improvements 0.7
→ 2.4, buildings/techs down, treasury hoarded). The mechanism is the
AlphaZero rule violated: distillation only helps when the SEARCH is
stronger than the policy — plan_production's scripted rollouts value
positions like the 172-strength scripted player, so its preferences
are a regression for a 225-strength net. The corrected path (already
proven on the eval side): generate targets with NET-GUIDED gumbelsearch
(243.7 > netgreedy 240.3), which is exactly what gen_targets must call
next. The distillation MACHINERY works as built; the target SOURCE was
beneath the student. Champion unchanged (the c3a-11 checkpoint is
discarded from the lineage).

**Second distillation (c3a-12-gdistill, net-guided gumbel targets) —
ALSO negative, two NEW mechanisms**: eval 193.5, and the probe shows
catastrophic forgetting, not scripted fingerprints (districts 4.7 →
1.4, buildings 7.5 → 2.3, civics halved, treasury ballooned to 126) —
600 states hammered every minibatch for 40 updates = the net overfit
the tape and forgot its queue policy everywhere else. AND the teacher
edge was STALE: the searcher's own six games scored 182-208 on this
world — BELOW the 225 champion. The 243.7-vs-240.3 gumbelsearch result
was measured on the tune3-era world; it was never re-verified against
THIS champion on THIS world. Two standing rules join the methodology:
(1) MEASURE THE TEACHER IN THE TARGET SETTING immediately before
distilling — a searcher's edge is world- and checkpoint-relative;
(2) distillation data must be large or reweighted — a small tape
repeated per-minibatch is a forgetting hazard (mix at low weight,
early-stop on eval). c3a-12 discarded. Next: benchmark gumbelsearch
WITH c3a-10 on the current world (raise k/depth if needed) — distill
again only once a real, measured edge exists.

**The teacher benchmark (paired, same six worlds, c3a-10 guiding)**:
netgreedy 195.2 vs gumbelsearch@k16/d16 **212.1 — a +16.9 real edge**
(6/6 over scripted vs 5/6). The c3a-12 teacher failure was BUDGET:
k8/d12 only matches greedy (~200) — no edge to transfer; k16/d16
leads decisively. The distillation recipe for the third attempt:
targets generated at the MEASURED budget, --distill-coef 0.1, a SHORT
rung (~15 updates) with eval immediately after — the anti-forgetting
protocol. The M3d avenue is alive; the teacher just has to be paid
for.

**What self-play changed behaviorally** (behavior_probe.py, matched
worlds, greedy): the ladder traded ARMY for ECONOMY — c3a-1 keeps 10.2
units, c3a-4/5 keep ~7, with the freed production going into districts
(3.6 → 4.2) and buildings (6.8 → 8.7/9.2); c3a-4 runs its treasury
near-empty (68 → 16 gold — it learned to SPEND through the purchase
head) and carries the deepest tech (14.0). Cities stay ~4.5 (the site
plan's shape), camps stay uncleared (armies are for defense, not
hunting), wars stay rare. Self-play's lesson on this world: compounding
infrastructure beats standing milita

Every pre-B1 net (tune1/tune2) is stale by construction; **tune3** is
the first reference net on this world: 50 updates / 20.5M steps on the
46-action head with ranged live → **246.2 ± 12.4** greedy (train mean
238.9), vs scripted 192.2 / random 122.8; matched-world netgreedy 240.3
vs scripted 167.5 (+72.8, 6/6).

tune2 (same recipe on the purchase-capable head, resumed to 50 updates)
edges tune1 by +4.7 with overlapping CIs and ties it on the matched-world
netgreedy protocol (195.4) — the gold economy is a small, real positive.
Note the verbs pay on RETRAIN, not retroactively: ranged strikes went
live after both nets trained, and tune1 re-evals to the decimal on the
ranged engine because its policy learned to never attack with (then
weak, melee-locked) Slingers/Archers. A tune3 trained with ranged live
is where that verb's value should appear.
