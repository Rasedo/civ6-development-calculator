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
city produces continuously). tune3 is stale in turn; the next reference
net trains on the B2 world.

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
