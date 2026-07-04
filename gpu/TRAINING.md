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

- `score/mean` — the number that matters. Baselines on THIS env
  (50-episode eval): random 111.0 ± 12.2, scripted autopilot
  172.5 ± 17.3. The CPU smoke run hit 186.4 after 256k steps; a 40M-step
  overnight run on an RTX 4070 SUPER reached 213.6 ± 13.5 greedy (14-action,
  farms-only build space) — ~20% over the autopilot, plateauing by ~10M.
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

## Reference numbers (4-core CPU container, engine v5b)

| | |
|---|---|
| env only, f32, batch 1024 | ~13,000 game-turns/sec |
| trainer end-to-end, CPU, batch 64 | ~370 steps/sec |
| random / scripted / 256k-step PPO | 111.0 / 172.5 / 186.4 |
