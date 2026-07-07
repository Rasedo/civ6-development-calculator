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
