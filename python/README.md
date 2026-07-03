# PPO training (Python bridge)

PPO learns from every *decision* (via per-decision advantages) instead of
one fitness number per game like the evolution strategy — typically far
more learning per episode. The TypeScript engine stays the simulator: each
Python environment owns a `node dist-rl/rl-bridge.js` subprocess and speaks
a JSON-lines protocol; PyTorch hosts the network.

## Setup (Windows)

```powershell
# from the repo root — build the bridge first
npm run rl:build

cd python
py -m venv .venv
.venv\Scripts\activate
pip install torch --index-url https://download.pytorch.org/whl/cu121   # GPU (NVIDIA); skip for CPU-only
pip install -r requirements.txt
```

(Linux/macOS: `python3 -m venv .venv && source .venv/bin/activate`, same pips.)

## Train

```powershell
python train_ppo.py --envs 16 --timesteps 2000000
```

- `--envs` = parallel node simulators; set it to about your core count
  (each is a separate process; the GPU only handles the network).
- `--timesteps` counts *decisions*, not episodes (~250 decisions/episode at
  horizon 100, so 2M steps ≈ 8k episodes).
- `--device cuda` to force GPU, `--load checkpoints/xxx.zip` to resume.
- Watch curves: `tensorboard --logdir tb` → `civ6/score_mean` is the true
  (unscaled) empire score of recent episodes.

## Evaluate

```powershell
python eval_ppo.py --model ppo_civ6.zip --seeds 40
```

Uses the same held-out seeds (`100 + i·97`) as the TypeScript evaluator, so
the number is directly comparable with `npm run rl:eval -- --seeds 40`.

## Notes

- **Rewards** are per-decision empire-score deltas ×0.01 (episode return =
  (final − start)/100). `gamma=0.999` because games are long and early
  decisions matter at the horizon.
- **Action masking**: the env exposes `action_masks()`; MaskablePPO never
  picks an invalid candidate slot.
- The bridge pins the engine's `FEATURE_VERSION`; after pulling engine
  changes that bump it, rebuild (`npm run rl:build`) and retrain.
- Throughput is simulation-bound (the network is tiny): expect roughly the
  same episodes/sec as the ES trainer at equal process counts. The GPU
  matters more as the network grows (the CNN-observation stage).
