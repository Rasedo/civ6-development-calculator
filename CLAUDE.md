# civ6-development-calculator

A faithful reproduction of Civilization VI's ENGINE (Gathering Storm, online
speed) as two twin engines — `cpu/` (TypeScript) and `gpu/` (PyTorch) — driven
by one scripted decision server (`policy/`), verified against each other by
`gpu/battery.py` and against the real game by the owner's install
(`tools/civ6lab`). Open work lives in `docs/AUDIT.md` and nowhere else.

## Standing rulings — decide by these, do not stop to ask

- **Civ 6 is the source of truth.** Never an engine, a comment or a doc.
  Install XML (Base <- Exp1 <- Exp2, modinfo load order) first, the live game
  second, forums last. An unsourced magnitude is an ASK in AUDIT, never an
  invention and never a reason to stop other work.
- **The game's AI is ported too (owner 2026-10-08).** Civ 6's own decision
  logic for every party — majors, city-states, Free Cities, barbarians — is
  read from the install and the DLL and ported, so a free run plays as the
  real game does and fidelity is compared end to end. In training the
  majors are RL agents in symmetric play and everything else is the ported
  Civ 6 environment. Where each part lives (owner 2026-10-09): the
  barbarians', city-states' and Free Cities' AI runs in BOTH twins (it
  runs inside training on the GPU state); the majors' AI is ONE TS
  implementation (`ai/major/`, against the engine's query interface),
  never ported to the GPU — in training the RL agents replace it. The plug
  point is the per-seat ACTION format: the majors' AI and an RL agent emit
  the same actions and the engine applies either, so a seat swaps between
  them by setup alone; the battery relays the majors' AI actions to the
  GPU lane through that path. Diplomatic proposals (missions included) go
  through the deal offer / accept path, answered by the receiver's own
  action; pantheon and religion choices are seat actions (owner
  2026-10-11). Our scripted driver (`policy/`) and the
  neutral observation it reads go once the port drives every party; the
  RL observation and masks are built at RL prep.
- **Delete, don't preserve.** No shims, aliases, re-exports, fallbacks,
  "legacy" paths or historical names. When two paths disagree, keep the one
  that deletes code. Tests written for one whim are disposable.
- **Seats are symmetric.** There is no player/rival distinction and no seat 0.
- **Rollouts, trajectories and hunt checkpoints are disposable.** They are
  never a reason to avoid a change.
- **Never raise context, budget or session length.** Context compacts itself.
  Keep implementing; do not stop at a "clean boundary" to write a status essay.
- **Do not defer silently.** Implement what the task needs now. If something
  truly must wait, it becomes an AUDIT entry in the same commit.
- **Comments and docs say what the code does NOW.** No history, no dates, no
  "was", no AUDIT ids in code. Read the code, not the comment.

## Verification

- The owner's mode (`.claude/mode`, shown in the status line, printed at
  session start) is the owner's switch: `build` = no battery and no hunt,
  `normal` = the ten-commit cadence decides, `measure` = the box is free.
  Only the owner changes it (`! python tools/mode.py <mode>`).
- Per commit: the compile bar plus a single-seed smoke serve. A red serve
  lane is hunted with `python gpu/battery.py --seeds <s> --ckpt-every 20`,
  never by re-running the fleet. One battery at a time — the script refuses a
  second. Launch in the background and end the turn; never poll, never sleep.
- Green = the pass row at the head sha in `stats/battery.jsonl`, never an
  exit code.
- GPU tests are banned (owner 2026-10-18): nothing under `tests/gpu` runs,
  for agents or the lead; the GPU twin is still written and checked by
  `seat_symmetry_check.py`. The replay / sweep measures run once per wave
  of agents, never per slice.

## Housekeeping

- IDs: AUDIT ids (`B-24r`, `C-38`) are the only names for open work; a task
  list cites them.
- `.claude/HANDOFF.md` is CURRENT STATE, under 120 lines: what is green, what
  is in flight, the next action. It is rewritten, never appended to.
- Scratch files go to `.claude/scratchpad/`. Heredocs are banned: Write the
  script or commit message to a file.
- The lead orchestrates: at most four subagents at a time, plus one
  battery agent pinned to a fixed head (owner 2026-10-07); none spawns its
  own, and agents never commit (the lead commits named paths).
