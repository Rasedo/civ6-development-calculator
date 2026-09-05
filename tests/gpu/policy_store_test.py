"""THE SLOTTED-CARD STORE (C-75, step 1 — inert plumbing) — the GPU half.

    python tests/gpu/policy_store_test.py

The TS twin is tests/cpu/seats/policy-store.test.ts.

Which cards a seat slots is becoming a DRIVER decision on the wire. This step
lays the plumbing and pays nothing off it: `seat_masks(row)["policies"]` is
the cards the seat may slot, `apply_seat_actions(policies=...)` validates the
SET whole (`_policy_set_ok`) and stores it in `civ_policies`, and the compare
renders it. The greedy fill (`_slotted_policies`) still pays every effect.

  1. the mask is `_policy_unlocked` under the live government, nothing for
     a seat with no government.
  2. the greedy fill's own set passes the validator; one unlocked card too
     many of a kind fails it; a card the seat has not unlocked fails it.
  3. the record apply stores an accepted set and leaves the store alone on a
     refused one; the compare renders the sorted indices.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from core.statecompare import _civ_mask
from warmup import settle_all

ROW = 0


def build() -> BatchSim:
    sim = settle_all(BatchSim([load_fixture(fixture_paths()[0])], load_rules(), device="cpu", dtype=torch.float64))
    assert sim._gov_has_effects and sim._ngov and sim._npol, "no government catalog on the wire"
    # a government with slots: every civic through the first tier's unlock
    civ = sim.civ_civics[:, ROW]
    adopted, has_gov = sim._adopted_gov(civ)
    if not bool(has_gov[0]):
        sim.civ_civics[0, ROW, : max(4, int(sim._ngov))] = True
        sim._eff_version += 1
        adopted, has_gov = sim._adopted_gov(sim.civ_civics[:, ROW])
    assert bool(has_gov[0]), "the seat still has no government"
    return sim


def main() -> int:
    sim = build()
    mask = sim.seat_masks(ROW)["policies"]
    assert mask.shape == (sim.B, sim._npol), mask.shape
    civ = sim._seat_civics(ROW)
    adopted, has_gov = sim._adopted_gov(civ)
    want = sim._policy_unlocked(civ, sim.civ_age[:, ROW] == 0,
                                sim._civ_era(sim.civ_techs[:, ROW], sim.civ_civics[:, ROW]),
                                sim.civ_gov_held[:, ROW], adopted) & has_gov.unsqueeze(1)
    assert torch.equal(mask, want), "the mask is not the unlock predicate under the live government"
    assert int(mask[0].sum()) > 0, "the scene unlocks no card at all"
    # a seat with no government slots nothing
    keep = sim.civ_civics[0, ROW].clone()
    sim.civ_civics[0, ROW] = False
    sim._eff_version += 1
    assert not bool(sim.seat_masks(ROW)["policies"].any()), "a government-less seat was offered cards"
    sim.civ_civics[0, ROW] = keep
    sim._eff_version += 1
    print(f"  1 the mask OK — {int(mask[0].sum())} cards unlocked, none without a government")

    greedy = sim._seat_slotted(ROW)
    assert int(greedy[0].sum()) > 0, "the greedy fill slots nothing"
    assert bool(sim._policy_set_ok(ROW, greedy)[0]), "the greedy fill's own set failed the validator"
    # EVERY unlocked card at once: more than the slots hold whenever the greedy
    # fill left any unlocked card out, which is the overflow the fit refuses
    if int((mask[0] & ~greedy[0]).sum()) > 0:
        assert not bool(sim._policy_set_ok(ROW, mask.clone())[0]), "an overfull set passed the validator"
        print("  2a the fit OK — every unlocked card at once is more than the slots hold, and is refused")
    else:
        print("  2a the fit — every unlocked card already fits; the overflow case has no scene here")
    locked = (~mask[0]).nonzero().flatten()
    assert locked.numel(), "every card is unlocked — no locked card to refuse"
    bad = greedy.clone()
    bad[0, int(locked[0])] = True
    assert not bool(sim._policy_set_ok(ROW, bad)[0]), "a card the seat has not unlocked passed the validator"
    print("  2b the unlock OK — a locked card refuses the whole set")

    sim.civ_policies[0, ROW] = False
    active = torch.ones(sim.B, dtype=torch.bool)
    sim.seat_ext[:, ROW] = True
    sim.apply_seat_actions(ROW, policies=greedy)
    sim._seat_record_apply(ROW, active)
    assert torch.equal(sim.civ_policies[0, ROW], greedy[0]), "an accepted set was not stored"
    sim.apply_seat_actions(ROW, policies=bad)
    sim._seat_record_apply(ROW, active)
    assert torch.equal(sim.civ_policies[0, ROW], greedy[0]), "a refused set overwrote the store"
    got = _civ_mask("civ_policies")(sim, 0, [ROW])[0]
    assert got == greedy[0].nonzero().flatten().tolist(), got
    print(f"  3 the store OK — {len(got)} cards kept, the refused set left it alone, the compare renders the set")
    print("BATTERY OK policy_store")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
