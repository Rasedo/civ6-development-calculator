# The four-step divergence — reproduction, for the new AUDIT item

FOUND 2026-09-04 while giving C-47 gate reachability. NOT a village bug: the
village mechanic is green with the driver steering removed, and this is green
with villages ON as long as nothing steers a unit into a long step chain.

## Reproduction

1. In `policy/drive.py::_seat_unit_orders`, after the `walkers` block, make a
   unit step onto an adjacent tile that its normal walk would not pick:

        if bool(sim.tile_goody.any()):
            gnb = sim.neigh[tiles.clamp(min=0)]
            B_, N_ = tiles.shape
            ghut = sim.tile_goody.gather(1, gnb.reshape(B_, -1).clamp(min=0)).reshape(B_, N_, 6)
            ghut = ghut & (gnb >= 0) & um[:, :, 0:6]
            gtake = present & ghut.any(dim=2)
            if bool(gtake.any()):
                orders0 = torch.where(gtake, ghut.long().argmax(dim=2), orders0)

2. Villages on (`seeder/world.ts` `withVillages: true`), reseed and export.
3. `python gpu/serve_gate.py --batched --turns 250 --seeds 9261`

## What it says

    seed 9261 turn 160: KEYED DIFF group unit:
      unit[465]: GPU-ONLY  {"seat": 0, "type": 12, ...}     # tile 155
      unit[468]: TS-ONLY   {"seat": 0, "type": 12, ...}     # tile 156

The digest keys units `tile * 3 + (2 embarked / 1 civilian / 0 military)`, so
465 is tile 155 and 468 is tile 156 — ONE unit, one tile apart, not two units.

## What was measured

Merged pool slot 90, seat 0, turn 160, walking 159 -> 158 -> 157 -> 156 -> 155:

    AFF 159->158 mp=16 full=16 moved=True post=12
    AFF 158->157 mp=12 full=16 moved=True post=8
    AFF 157->156 mp=8  full=16 moved=True post=4
    AFF 156->155 mp=4  full=16 moved=True post=0

Every step costs 4 and the pool is 16, so the FOURTH step is exactly
affordable and the GPU takes it. TS stops at 156 — it refuses or never
attempts that fourth step.

RULED OUT: zone of control. At the moment of each step no neighbour of 158,
157, 156 or 155 holds any living unit except one at tile 203 (seat 0, the
mover's own side), so nothing zeroed the remaining MP on either engine, and
the GPU's `post=4` shows it did not.

NOT YET ESTABLISHED: why TS declines. Candidates not yet separated — the
recorded plan carrying only three ranks for that unit, TS's re-validation
refusing the fourth for terrain/occupancy the GPU's `ok` allows, or an
`unitFullMoves` / `movesFull` disagreement that changes the "at FULL MP always
gets its first step" clause partway down a chain.

## Why it matters beyond the driver

The applier is the shared validator both engines are supposed to agree on
(`applier-carries-whole-validator`). A four-step chain is not exotic — any
driver change that makes units walk further reaches it, and the current
scripted driver simply never does. So this is a live gap the gate cannot see
today, and its reachability probe is exactly the steering block above.
