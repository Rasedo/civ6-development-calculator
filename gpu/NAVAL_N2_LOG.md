# NAVAL N2 — naval units + production gating + embarked/naval combat + galley policy + LIVE flip

Stage base: e702c4e (N1 merged). Scope = catalog rows, naval movement proper,
embark LIVE flip, embarked/naval combat overrides, production/purchase gating
(3 surfaces), scripted rival galley policy. N3 (poke suite + battery + AUDIT)
is NOT mine.

## Plan (from brief + N1 handoff)

A. Catalog: GALLEY, QUADRIREME in data/units.ts (exporter data-driven).
B. Naval movement proper: ships water-only, spawn nearest free WATER,
   ships never fortify (GPU accrual gate), ships exert/obey ZOC normally.
C. Embark LIVE: flip embarkState.live=true; requires (both engines):
   (1) embark-aware peace-act/patrol; (2) GPU _in_enemy_zoc embarked-exert
   exclusion; (3) embarked-defender combat override + civilian capture keeps
   embarked (pool-end); (4) GPU !naval fortify gate; (5) war-march water steps
   un-flagged-off.
D. Production/purchase gating (player queue+purchase, rival queue+A-5r
   purchase, GPU masks): naval iff center adjacent water OR completed HARBOR.
E. Scripted rival galley policy: SAILING + naval-capable city + zero naval
   units => build ONE GALLEY, priority just below military floor; mirror GPU.
F. Combat integration: ships flow through existing rolls; B-7 counts naval
   allies; embarked contribute nothing. Coastal city attack via existing paths.
G. No new RNG draws. Re-export + gate. Reroll degenerate seeds + log.

## Decisions / deviations (fill as I go)

## Gate results

## N3 handoff
