# ROUND B4 — Slice AA log (B-31 civilian capture)

Round base: 18dff6d570830da4d8b6136a8a8e9a2df6076e3e

## Task
Melee attack on a lone civilian CAPTURES it (player + rival attackers).
Barbarians still kill. No new RNG draws. Both engines turn-exact.

## Progress
- [x] Setup: HEAD verified, fixtures copied, log + anchor commit.
- [ ] TS meleeAttack civilian branch → capture (owner/civId flip, movesLeft=0, hp/charges kept, no advance).
- [ ] GPU pool transfers at civilian-kill sites in _apply_unit_actions + _rival_unit_war_act.
- [ ] Exporter t0 audit (unit rosters).
- [ ] Focused vitest.
- [ ] Gate ladder.

## Decisions / deviations

## Gate results
