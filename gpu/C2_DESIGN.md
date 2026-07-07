# C2 — the per-seat egocentric RL surface (design)

> Written at B-arc completion (2acc8c8). Spec source: BUILD_PLAN §3 "C1-C".
> The engine is DONE for this stage — C2 is training-side surgery over the
> parity-proven BatchSim; the gates keep running untouched underneath.

## What exists (the seat-0-only surface)

`gpu/civ6gpu/env.py` BatchEnv: obs = 14 global + 3×S CS + 3×R rival + 9×C
city features, all PLAYER-framed; masks/actions = the 5 heads (production
[B,C,NB+2+NU], tech, civic, units [B,P,13], envoy [B,S]) driving the PLAYER
tensors; reward = player empire-score delta. Rivals act via the scripted
`_rival_phase` picker.

## The structural fact C2 must respect

Rivals are BEHAVIORALLY symmetric (B-arc) but STRUCTURALLY separate:
player state lives in per-city planes (owner/center_at/queues via
`current`/`buildings` [B,C,NB]...) while rival state lives in rc_*/r_*/v_*
tensors. Two consequences:

1. **Egocentric obs = per-family RENDERING, not tensor swapping.** A seat-k
   observation renders "my empire" features from the rival tensor family
   when k>0 (rc_pop/rc_bldg/r_techs/...) and "opponent" features from the
   player planes — the FEATURE SCHEMA is seat-invariant, the sources are
   not. obs(seat) must emit exactly the same layout so one net serves all
   seats.
2. **Action routing = intercepting the scripted picker.** For a controlled
   rival seat the net's 5 heads replace the picker's choices, not the
   mechanics: production head → rc_current/rc_cost picks per rival city
   (settler / district / building / unit codes — the SAME code space the
   picker writes); tech/civic heads → r_cur_tech/r_cur_civic (the advance
   loop already honors them); units head → v_* acts (march/attack targets
   for rival military; builders stay scripted in C2 — their walk is
   deterministic policy, not economics); envoy head → masked all-False
   (rivals have no envoys until a later stage).

## Sub-stages (gate-serialized like the B-arc)

- **C2a — seat-parametrized surface, seat 0 only (behavior-preserving).**
  `BatchEnv(seat=0)` refactor: observe()/masks()/step()/reward gain a seat
  parameter internally routed to the existing player paths. Nothing about
  the emitted numbers changes for seat 0 — proven by bit-identical obs/mask
  tensors on the fixtures (a new `seat_test.py` asserts equality against
  the pre-refactor values) and an unchanged reference-net eval.
- **C2b — rival-seat rendering + routing, gated OFF.**
  observe(seat=k>0) renders the egocentric layout from rival tensors;
  masks(seat=k) exposes the rival decision space (production codes per
  rival city under the picker's own gates; research picks where cur==-1;
  unit acts for rival military; envoys all-False). step(actions, seat=k)
  writes the choices BEFORE `_rival_phase` runs and a `controlled[B,R]`
  mask tells the picker/research auto-pick/unit AI to skip controlled
  rivals. Gated OFF = controlled empty ⇒ byte-identical fixtures, both
  gates green (the B4a inert pattern).
- **C2c — O=2 duel env + smoke test.**
  `DuelEnv`: two seats over one BatchSim (seat 0 = player civ, seat 1 =
  rival 0), per-seat obs/mask/reward; reward phase switch:
  `reward=dense` (own score delta — bootstrap) | `relative` (own minus
  opponent delta, symmetrized — self-play). Smoke: random-policy duels run
  the horizon with both seats acting, scores move, no NaNs; scripted-vs-
  scripted duel reproduces the plain scripted world when seat 1 mirrors
  the picker (sanity anchor).
- **C2d — trainer plumbing.** train_ppo grows `--seats 2` (seat-swapped
  batches: each game contributes both perspectives), checkpoint metadata
  records the seat count; fit_env_to_checkpoint keeps old nets loadable
  (seat-0-only). Then C3a takes over (EMA opponent, 80/20 frozen mixture).

## Decisions pinned now

- Builders under net control: NO in C2 (deterministic walk stays scripted
  for both seats; the net steers economics through what to build, not
  where to walk). Revisit with V-verbs.
- War/peace head for rival seats: OFF in C2 (the war gate stays scripted)
  — C3's league needs it, land it as C3-prep.
- O>2: the seat axis is parametric from C2a on, but only O=2 is exercised
  until C3c.
- Obs schema: keep the existing feature blocks and sizes EXACTLY (a seat-1
  render fills the same slots: "my cities" = rc slots up to C, padded;
  "rivals" block = the player empire viewed as a rival + remaining true
  rivals). Nets stay shape-compatible across seats by construction.

## Verification

C2a: bit-identical obs/masks (seat_test.py) + fixtures hash unchanged.
C2b: fixtures hash unchanged with controlled=∅; a poke test drives one
rival production/tech choice and asserts the picker honored it.
C2c: smoke duels + the scripted-mirror sanity anchor.
Battery stays the gate for every sub-stage.
