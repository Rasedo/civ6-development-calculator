"""Why do seat 0's cities decline in the long game — loyalty flips (peace) or
civ conquest (war)?

Per game over 300 turns: track peak seat-0 cities, the final count, and whether
seat 0 was EVER at war with any civ. Cities lost in games that never went to war
point at loyalty flips; losses concentrated in at-war games point at conquest.
Also splits the empire-wide city-loss count by war state at the turn of loss.
"""
import sys, torch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "gpu"))
import core.simbase as _eng  # the globals live on the module floor
_eng.U_MAX = 512; _eng.P_MAX = 512
from core import BatchSim, load_rules, load_fixture, FIXTURES

pool = [load_fixture(p) for p in sorted(FIXTURES.glob("seed*.json"))[:24]]
sim = BatchSim(pool, load_rules(), device="cpu", dtype=torch.float64)
B = sim.B
peak = sim.alive.sum(dim=1).clone()
ever_war = torch.zeros(B, dtype=torch.bool)
loss_at_war = 0
loss_at_peace = 0
prev = sim.alive.sum(dim=1).clone()

for t in range(1, 301):
    sim.step()
    cur = sim.alive.sum(dim=1)
    atwar = sim.war[:, 0, : 1 + sim.R].any(dim=1)
    ever_war |= atwar
    peak = torch.maximum(peak, cur)
    lost = (prev - cur).clamp(min=0)  # cities lost this turn per game
    loss_at_war += int((lost * atwar).sum())
    loss_at_peace += int((lost * ~atwar).sum())
    prev = cur.clone()

final = sim.alive.sum(dim=1)
declined = (final < peak)
print(f"games: {B}")
print(f"games that lost cities from peak: {int(declined.sum())}")
print(f"  of those, EVER at war: {int((declined & ever_war).sum())}")
print(f"  of those, NEVER at war: {int((declined & ~ever_war).sum())}")
print(f"empire city-losses at turn-of-loss:  at-war {loss_at_war}   at-peace {loss_at_peace}")
print(f"mean peak cities {float(peak.float().mean()):.1f} -> final {float(final.float().mean()):.1f}")
print(f"ever-at-war games: {int(ever_war.sum())}/{B}")
