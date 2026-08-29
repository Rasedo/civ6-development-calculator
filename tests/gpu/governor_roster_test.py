"""The governor ROSTER poke lane — the person, not the seat.

    $env:PYTHONUTF8='1'; python tests/gpu/governor_roster_test.py

`governors_test.py` covers the +8 loyalty a seated governor pays. This lane
covers the roster that decides WHO is seated: the title arithmetic, the
appointment and promotion order, the establishment clock that gates every
ABILITY, the neutralize clock that follows the person, and the Dark Age pool
that only a Dark Age opens. Every constant comes from rules.json through the
engine's own loaders — nothing is hardcoded.

Covered:
  a. Titles: each of the named civics earns one, an appointment spends one and
     each promotion spends one more; the roster stops when nothing is legal.
  b. Order: appointments run down the catalog, and once every governor is
     appointed a title buys the FIRST legal promotion (its governor's own row,
     tier > 0, prerequisite held).
  c. Establishment: an assigned governor pays LOYALTY at once and NO ability
     until its own clock runs out, then every channel opens together.
  d. Neutralize: the clock is the PERSON's — he leaves the city, cannot be
     re-seated while it runs, and comes back to the lowest-loyalty free city.
  e. The city that dies hands its governor back to the Palace.
  f. Dark Age cards: adoptable only while the seat is in a Dark Age AND inside
     the card's own era window; a normal card is never gated that way.
"""

from __future__ import annotations

import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
from core import BatchSim, load_rules, load_fixture, fixture_paths
from warmup import settle_all


def build(rules, path, steps: int = 18, dtype=torch.float64):
    sim = settle_all(BatchSim([load_fixture(path)], rules, device="cpu", dtype=dtype))
    for _ in range(steps):
        sim.step()
    sim.major_unit_alive[:] = False
    return sim


def grant_titles(sim, row: int, n: int) -> None:
    """Research the first `n` of the civics that each grant a Governor Title."""
    sim.civ_civics[0, row, :] = False
    keep = sim._gov_title_civics[sim._gov_title_civics >= 0].tolist()
    for c in keep[:n]:
        sim.civ_civics[0, row, c] = True


def add_city(sim, row: int, col: int, tile: int, loy: float, pop: int = 3) -> int:
    sim.city_alive[0, row, col] = True
    sim.city_is_cap[0, row, col] = False
    sim.city_center[0, row, col] = tile
    sim.city_pop[0, row, col] = pop
    sim.city_loyalty[0, row, col] = loy
    cid = int(sim.civ_next_city_id[0, row])
    sim.city_id[0, row, col] = cid
    sim.civ_next_city_id[0, row] += 1
    return cid


def spread(sim, row: int, n: int, loyalties) -> list[int]:
    """`n` extra non-capital cities on the capital's neighbours."""
    cap = int(sim.city_is_cap[0, row].nonzero()[0])
    nb = [int(x) for x in sim.neigh[int(sim.city_center[0, row, cap])].tolist() if x >= 0]
    free = (~sim.city_alive[0, row]).nonzero(as_tuple=True)[0].tolist()
    cols = free[:n]
    for k, col in enumerate(cols):
        add_city(sim, row, col, nb[k], float(loyalties[k]))
    return cols


# -------------------------------------------------------------------- pokes ---
def poke_titles(rules, path):
    """a. Earned = one per named civic; spent = one per appointment plus one
    per promotion held by an APPOINTED governor."""
    sim = build(rules, path)
    row, NG = 0, sim.n_governors
    assert NG > 0, "no governors in the catalog"
    for n in (0, 1, 3, NG):
        grant_titles(sim, row, n)
        got = int(sim._governor_titles_earned(row)[0])
        assert got == n, f"{n} title civics must earn {n} titles (got {got})"
    grant_titles(sim, row, 3)
    sim.civ_gov_appointed[0, row, :] = False
    sim.civ_gov_promos[0, row, :] = 0
    sim.civ_gov_appointed[0, row, 0] = True
    assert int(sim._governor_titles_spent(row)[0]) == 1, "an appointment spends one title"
    sim.civ_gov_promos[0, row, 0] = 0b101  # two promotions held
    assert int(sim._governor_titles_spent(row)[0]) == 3, "each promotion spends one more"
    sim.civ_gov_promos[0, row, 1] = 0b11   # …but an UNAPPOINTED governor's bits are not a spend
    assert int(sim._governor_titles_spent(row)[0]) == 3, "an unappointed governor spends nothing"
    print(f"  a titles OK (one per named civic of {int((sim._gov_title_civics >= 0).sum())}; "
          f"appointment 1 + promotion 1 each)")


def poke_order(rules, path):
    """b. Appointments run down the catalog; once every governor is appointed a
    title buys the FIRST legal promotion — its own governor's row, tier > 0,
    prerequisite held."""
    sim = build(rules, path)
    row, NG, NP = 0, sim.n_governors, sim.n_gov_promos
    n_civ = int((sim._gov_title_civics >= 0).sum())

    for k in (1, 2, NG):
        sim.civ_gov_appointed[0, row, :] = False
        sim.civ_gov_promos[0, row, :] = 0
        sim.civ_gov_city[0, row, :] = -1
        grant_titles(sim, row, k)
        sim._governor_spend(row, sim._governor_titles_earned(row))
        got = sim.civ_gov_appointed[0, row].nonzero(as_tuple=True)[0].tolist()
        assert got == list(range(k)), f"{k} titles must appoint governors {list(range(k))} (got {got})"

    # one title past a full roster buys the first legal promotion in the table
    assert n_civ > NG, "the catalog must publish more title civics than governors"
    sim.civ_gov_appointed[0, row, :] = False
    sim.civ_gov_promos[0, row, :] = 0
    grant_titles(sim, row, NG + 1)
    sim._governor_spend(row, sim._governor_titles_earned(row))
    held = [(g, int(sim.civ_gov_promos[0, row, g])) for g in range(NG)
            if int(sim.civ_gov_promos[0, row, g])]
    assert len(held) == 1, f"one spare title buys exactly one promotion (got {held})"
    g, bits = held[0]
    p = int(torch.tensor(bits).log2().round())
    legal = [(int(sim._gpromo_gov[i]), i) for i in range(NP)
             if int(sim._gpromo_tier[i]) > 0 and int(sim._gpromo_req[i]) == 0]
    assert (g, p) == min(legal), f"the FIRST legal (governor, promotion) pair must win (got {(g, p)})"
    print(f"  b order OK (appoint 0..{NG - 1} in catalog order; the spare title takes "
          f"governor {g} promotion {p}, the first tier-1 row with no prerequisite)")


def poke_establish(rules, path):
    """c. The loyalty channel opens on ASSIGNMENT; every ability waits for the
    establishment clock, and they all open on the same turn."""
    sim = build(rules, path)
    row = 0
    cols = spread(sim, row, 2, [30.0, 40.0])
    grant_titles(sim, row, 1)
    sim.civ_gov_appointed[0, row, :] = False
    sim.civ_gov_promos[0, row, :] = 0
    sim.civ_gov_city[0, row, :] = -1
    sim.civ_gov_establish[0, row, :] = 0
    sim._governor_phase(row)

    seat = cols[0]
    gi = int(sim._governor_at(row)[0, seat])
    assert gi >= 0, "the lowest-loyalty city takes the governor"
    want = int(sim._gov_establish[gi]) - 1  # its own phase already ticked one turn
    assert int(sim.civ_gov_establish[0, row, gi]) == want, \
        f"governor {gi} establishes in {int(sim._gov_establish[gi])} turns"
    # SEATED but not established: loyalty yes, abilities no
    assert bool((sim._governor_at(row)[0] >= 0)[seat]), "an unestablished governor still holds the city"
    assert not bool(sim._governor_established(row)[0, seat]), "…and is not established yet"
    assert not bool(sim._governor_mask(row)[0, seat].any()), "…so it pays no promotion, not even its default"

    for _ in range(want):
        sim._governor_tick(row)
    assert int(sim.civ_gov_establish[0, row, gi]) == 0
    assert bool(sim._governor_established(row)[0, seat]), "the clock runs out and it establishes"
    base = int(sim._gov_base_promo[gi])
    m = sim._governor_mask(row)[0, seat]
    assert bool(m[base]), "the DEFAULT ability rides the appointment"
    assert int(m.sum()) == 1, "and nothing else, with no promotion taken"
    print(f"  c establish OK (governor {gi} pays loyalty at once, its default ability "
          f"after {int(sim._gov_establish[gi])} turns)")


def poke_neutralize(rules, path):
    """d. The neutralize clock follows the PERSON: he leaves the city, cannot be
    re-seated while it runs, and returns to the lowest-loyalty free city."""
    sim = build(rules, path)
    row = 0
    cols = spread(sim, row, 2, [30.0, 40.0])
    grant_titles(sim, row, 1)
    sim.civ_gov_appointed[0, row, :] = False
    sim.civ_gov_promos[0, row, :] = 0
    sim.civ_gov_city[0, row, :] = -1
    sim._governor_phase(row)
    gi = int(sim._governor_at(row)[0, cols[0]])
    assert gi >= 0

    turns = sim._gov_neutralize
    sim.neutralize_governor(0, row, gi, turns)
    assert int(sim._governor_at(row)[0, cols[0]]) < 0, "a neutralized governor holds no city"
    assert int(sim.civ_gov_establish[0, row, gi]) == 0, "and starts his next posting cold"
    for k in range(turns):
        sim._governor_phase(row)
        left = int(sim.civ_gov_out[0, row, gi])
        assert left == turns - 1 - k, f"the clock ticks once per phase (turn {k}: {left})"
        if left > 0:
            assert not bool((sim._governor_at(row)[0] >= 0).any()), \
                "he cannot be assigned to ANY city while the clock runs"
    sim._governor_phase(row)
    assert int(sim._governor_at(row)[0, cols[0]]) == gi, \
        "…and takes the lowest-loyalty free city again once it is out"
    print(f"  d neutralize OK ({turns}-turn clock on the PERSON; no city holds him meanwhile)")


def poke_city_lost(rules, path):
    """e. A governor whose city is gone goes back to the Palace, keeping his
    appointment and losing his establishment."""
    sim = build(rules, path)
    row = 0
    cols = spread(sim, row, 2, [30.0, 40.0])
    grant_titles(sim, row, 1)
    sim.civ_gov_appointed[0, row, :] = False
    sim.civ_gov_promos[0, row, :] = 0
    sim.civ_gov_city[0, row, :] = -1
    sim._governor_phase(row)
    gi = int(sim._governor_at(row)[0, cols[0]])
    for _ in range(int(sim._gov_establish[gi])):
        sim._governor_tick(row)
    assert bool(sim._governor_established(row)[0, cols[0]])

    sim.city_alive[0, row, cols[0]] = False
    sim._governor_tick(row)
    assert int(sim.civ_gov_city[0, row, gi]) < 0, "the city is gone, so is the posting"
    assert int(sim.civ_gov_establish[0, row, gi]) == 0, "and the establishment with it"
    assert bool(sim.civ_gov_appointed[0, row, gi]), "the APPOINTMENT survives — the title is spent"
    sim._governor_phase(row)
    assert int(sim._governor_at(row)[0, cols[1]]) == gi, "he takes the surviving city next phase"
    print("  e city lost OK (posting and clock cleared, appointment kept)")


def poke_dark_cards(rules, path):
    """f. A Dark Age card is slottable only while the seat is in a DARK AGE and
    inside the card's own era window; an ordinary card never asks either."""
    sim = build(rules, path)
    dark = (sim._pol_dark_lo >= 0).nonzero(as_tuple=True)[0]
    assert dark.numel(), "no dark-age cards in the catalog"
    d = int(dark[0])
    lo, hi = int(sim._pol_dark_lo[d]), int(sim._pol_dark_hi[d])
    nP = int(sim._pol_dark_lo.numel())
    slots = torch.full((sim.B, sim._gov_slots.shape[1]), 6, dtype=torch.long, device=sim.device)  # a wide bench
    civ2 = torch.ones(sim.B, sim.civ_civics.shape[2], dtype=torch.bool, device=sim.device)

    def slotted(is_dark: bool, era: int) -> torch.Tensor:
        return sim._slotted_policies(
            civ2, slots,
            torch.full((sim.B,), is_dark, dtype=torch.bool, device=sim.device),
            torch.full((sim.B,), era, dtype=torch.long, device=sim.device))

    inside = slotted(True, lo)
    assert bool(inside[0, d]), "a dark card inside its window, in a Dark Age, is slottable"
    assert not bool(slotted(False, lo)[0, d]), "…and never outside a Dark Age"
    if lo > 0:
        assert not bool(slotted(True, lo - 1)[0, d]), "…nor before its first era"
    if hi + 1 < 16:
        assert not bool(slotted(True, hi + 1)[0, d]), "…nor after its last"

    ordinary = [i for i in range(nP) if int(sim._pol_dark_lo[i]) < 0]
    assert ordinary, "no ordinary cards"
    n_ord_dark = int(slotted(True, lo)[0, ordinary].sum())
    n_ord_norm = int(slotted(False, lo)[0, ordinary].sum())
    assert n_ord_dark == n_ord_norm, \
        f"an ordinary card does not read the AGE ({n_ord_dark} vs {n_ord_norm})"
    print(f"  f dark cards OK ({int(dark.numel())} cards, card {d} live only in a Dark Age "
          f"over eras {lo}..{hi}; the {len(ordinary)} ordinary rows ignore the age)")


def main() -> None:
    rules = load_rules()
    paths = fixture_paths()
    assert paths, "no fixtures — run `npm run seed && npm run export` first"
    path = paths[0]
    print(f"governor_roster_test on {path.name}")
    poke_titles(rules, path)
    poke_order(rules, path)
    poke_establish(rules, path)
    poke_neutralize(rules, path)
    poke_city_lost(rules, path)
    poke_dark_cards(rules, path)
    print("GOVERNOR ROSTER POKES OK")


if __name__ == "__main__":
    main()
