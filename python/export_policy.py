"""Export a trained MaskablePPO MlpPolicy to JSON so the calculator UI can
run it as the in-app AI advisor (src/core/sb3.ts does the forward pass).

    python export_policy.py --model ppo_civ6.zip --out ppo_policy.json

Only vector-observation (MlpPolicy) models export — CNN policies would need
the conv tower in the browser. The vec sizes are read from the model; pass
--feature-version matching the engine you trained against (default 4).
"""

from __future__ import annotations

import argparse
import json

import torch.nn as nn
from sb3_contrib import MaskablePPO


def linear_json(layer: nn.Linear) -> dict:
    return {
        "w": layer.weight.detach().cpu().numpy().tolist(),
        "b": layer.bias.detach().cpu().numpy().tolist(),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="ppo_civ6.zip")
    p.add_argument("--out", default="ppo_policy.json")
    p.add_argument("--feature-version", type=int, default=4)
    p.add_argument("--obs-size", type=int, default=30)
    p.add_argument("--cand-size", type=int, default=29)
    p.add_argument("--max-cands", type=int, default=24)
    args = p.parse_args()

    model = MaskablePPO.load(args.model, device="cpu")
    policy = model.policy
    if hasattr(policy, "features_extractor") and policy.features_extractor.__class__.__name__ not in (
        "FlattenExtractor",
    ):
        raise SystemExit(
            f"Unsupported extractor {policy.features_extractor.__class__.__name__} — "
            "only MlpPolicy (vector observation) models export; CNN advisor is not supported."
        )

    expected = args.obs_size + args.max_cands * args.cand_size
    obs_dim = policy.observation_space.shape[0]
    if obs_dim != expected:
        raise SystemExit(
            f"Model observation is {obs_dim}-dim but obs+cands = {expected} — check --obs-size/--cand-size."
        )

    hidden = []
    activation = "tanh"
    for module in policy.mlp_extractor.policy_net:
        if isinstance(module, nn.Linear):
            hidden.append(linear_json(module))
        elif isinstance(module, nn.ReLU):
            activation = "relu"
        elif isinstance(module, nn.Tanh):
            activation = "tanh"

    out = {
        "kind": "sb3-mlp",
        "featureVersion": args.feature_version,
        "obsSize": args.obs_size,
        "candSize": args.cand_size,
        "maxCands": args.max_cands,
        "activation": activation,
        "hidden": hidden,
        "action": linear_json(policy.action_net),
    }
    with open(args.out, "w") as f:
        json.dump(out, f)
    n_params = sum(len(h["b"]) * (len(h["w"][0]) + 1) for h in hidden) + len(out["action"]["b"]) * (
        len(out["action"]["w"][0]) + 1
    )
    print(f"exported {n_params} params → {args.out}")
    print("Load it in the calculator: AI advisor panel → paste/upload the JSON.")


if __name__ == "__main__":
    main()
