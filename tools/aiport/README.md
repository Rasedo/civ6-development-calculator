# tools/aiport: the AI-port agent's measuring tools

One loop, five tools. Run them from your worktree with absolute paths
(`python <wt>/tools/aiport/rows.py ...`); they read the recordings and the
bars in the main checkout and write only under `<wt>/.claude/scratchpad/win/`.
Every tool prints its full usage with `-h`.

| step | tool | answers |
|---|---|---|
| 1 | `rows.py` | which rows are missed, grouped, over which turns; what changed between two runs |
| 2 | `window.py` | one seed's turn window scored under your tree, resumed from the bar's saved state, compared with your base's window or the bar |
| 3 | `show.py` | what the game itself held that turn (memory, units, planning, logs, record) |
| 2-3 | `firstdiff.py` | the first turn a kind differs on a seed, and what the game did then |
| 4 | `--trace` (harness) | our value's terms for a scored row |

A scored row: `SCORE <kind> t<turn> <subject> X[c] <ours> // <game>`. A bar
directory (`.claude/scratchpad/aiscore/p<N>m`, named `p<N>m` for short) and a
window directory hold the same files per seed: `ai<seed>.log` (the rows),
`.json`, `.md`.

## ROWS: group, filter, compare

    python tools/aiport/rows.py p89m --kind civicScore.minor --by seed,player,item,shape
    python tools/aiport/rows.py p89m --kind "cityState.move.*" --player minor --turns 100-200 --by kind,item --rows 3
    python tools/aiport/rows.py <wt>/.claude/scratchpad/win/base --cmp <wt>/.claude/scratchpad/win/a1 --all --rows

Filters: `--kind` (globs), `--seed`, `--player` (a number or barb / free /
minor / major), `--turns A-B`, `--subject <regex>`, `--text <regex>`,
`--third` (the third table alone), `--all`. Keys for `--by`: seed, kind,
player, class, item (the technology, civic, card, move family, unit type,
city), unit, subject, sign (over / under / ours none / `A for B`), shape
(ours minus the game's; for lists the entries one side holds). Output, a
line a group, largest first:

    rows seeds  kind | item | sign  ||  seed/player:turn spans
      38    16  civicScore.minor | REFORMED_CHURCH | over  ||  1152/p3:t164-171(8) 1162/p4:t187-190(4) ...

`--cmp`: `gone` (A holds, B does not) and `new`, by kind and seed, over the
seeds and turns both scored; `--rows` lists them (`-` gone, `+` new).

## WINDOW: one seed, one window, one run at a time

    python tools/aiport/window.py <wt> 1171 36 42 base            # your base tree first
    python tools/aiport/window.py <wt> 1171 36 42 a1 --vs base    # then with your change
    python tools/aiport/window.py <wt> --status

Scores turns `<from>..<to>-1` with `<wt>`'s own harness (`bundled.mjs`,
`--memory aimem`, AISCORE_MISSES=1) into `<wt>/.claude/scratchpad/win/<tag>/`,
then prints the compare against `--vs <tag>` (default: THE BAR, cut to the
window's turns; `--vs none` for none). It
REFUSES to start while another window of the worktree runs (`win/.lock`),
takes one seed, and refuses more than 120 turns without `--span`.
`--trace` (below) passes through; its lines land in `ai<seed>.log`.

THE BAR of a window is the newest bar holding the seed that ran at your
tree's head or at a commit of its history, not the newest bar there is: a
bar run at a head your tree does not hold is another tree's. Its `BAR:`
lines name the bar taken and every newer one passed over, with the commits
of it your tree lacks. Against a bar of a later head the rows those commits
closed show as NEW in your window and the rows they opened as GONE, and
neither is your window's own (seed 1189 t14-22 at the head of bar p95m,
against p96m four commits on: gone 1, new 17, the 17 a row set one of the
four closed; against p95m: gone 0, new 0). Where no bar ran in your tree's
history the newest is taken and the line says so; `--vs <a bar's
directory>` of such a bar prints the same warning.

The window RESUMES from that bar's saved state of the seed (below):
it prints the save it took, or why it took none, and how your tree's cpu/
differs from the tree that wrote the save. `--no-state` opens on the record
alone, `--state <dir>` names other saves, `--warm N` resumes at least N
turns before `<from>`.

    window 1189 t14-22 tag a1: rc=0 9s, 21 missed rows, head ed0c8794 (1 file changed ...) -> ...\win\a1
    BAR: p96m NOT TAKEN: it ran at 9059bbc9, 4 commits this tree does not hold (9059bbc9, 7d6552ad, 16035acb, c4bc4d3a); a row one of those closed is still this tree's, and its saves carry what their code built
    BAR: p95m ran at ed0c8794, in this tree's history: the window resumes from its saves and is compared with its rows
    STATE: RESUMED from ...\aiscore\p95m\state\s1189_t0010.state (seed 1189, turn 10 closed, saved by ed0c8794); turns 11-13 run unscored
    STATE: this tree's cpu/ differs from the save's tree ed0c8794 in 1 files (tactical.ts; merge-base ed0c8794). The turns to t10 ran under the save's code ...
    gone 1 (A holds, B does not), new 0 (B holds, A does not)
    kind                          A      B   gone    new

## SHOW: the game's own records of a turn

    python tools/aiport/show.py 1171 38 --player 2 --what research,contracts,trees
    python tools/aiport/show.py 1171 38 --unit 458754            # its rows at every site, its planning, blows, AI_Tactical rows, its AStar_GC.log searches for a plot and its own events in the record's order
    python tools/aiport/show.py 1154 122 --player 63 --what danger --plot 10:5
    python tools/aiport/show.py 1171 38 --city AKKAD              # queue, districts and buildings at T and T+1, AI_CityBuild lines, logged value tables
    python tools/aiport/show.py 1171 38 --player 2                # events: every log row and record event of the turn
    python tools/aiport/show.py 1190 97 --player 3 --what record   # the record's own fields of its cities and of the player, T -> T+1 where they differ
    python tools/aiport/show.py 1171 43 --ords 8630-8643          # every record event row of sequence A..B, any player, whole (what stands between two rows)
    python tools/aiport/show.py 1143 213 --player 62 --what record --mem PlayerTechs.m_axResearchProgress   # a named memory field of the record's player (`--mem PlayerTechs` lists the component's fields)

`--what`: units, planning, targets, danger, kb, trees, contracts, ops,
builds, research, events, record (several with commas). It reads the seed's
`.aimem.jsonl` (sites tactical / log / endlook), `.aiunits.jsonl` (start /
tactical / tacpass / log / endlook), record T and T+1 and the logs' sqlite
(`logstore.py`); values in 24.8 fixed point are printed divided. Each
section opens with `== <what> of p<N> ... t<T>`. A unit's row names its
abilities (the UnitAbilities rows in the game's database order, less
`ABILITY_`) and prints its era strength modifier, its hidden-visibility
flags and its combat modifiers' ints where they are set.

## FIRSTDIFF: where a kind begins on a seed

    python tools/aiport/firstdiff.py 1171 civicScore.minor [--player 2] [--subject TEXT] [--src <bar or window>]

Per player and item the first turn, the spans and the first difference,
earliest first; then the earliest group's rows and SHOW's `events` of that
player for the turn before and the turn.

## TRACE: our value's terms beside a row

    python tools/aiport/window.py <wt> 1171 36 42 t1 --vs base --trace "researchScore.minor:39:p2 IRRIGATION" --trace "danger*:38-40"
    node <wt>/cpu/harness/bundled.mjs <wt>/cpu/harness/run.ts -- <dump> --aiscore <out> --memory aimem --from 36 --to 42 --trace "plan.blow:38"

`--trace <kind>:<turn>[:<subject text>]`: kind exact or with a trailing
`*`, turn `A` or `A-B`, any number of them. Every matching scored row,
missed or equal, prints on stderr as `TRACE <row>` and its terms as
`TRACE   ...` lines. A traced run scores the same rows as an untraced one.
Always name a subject text for the score kinds: a turn holds hundreds.

| kind | what the trace prints |
|---|---|
| `researchScore.*` | turns, next step; own value before and after the city's term (and the favoured technology's x1.5); the modifiers' sum and each modifier's whole value; base; score = base + contracts + each unowned prerequisite's base (favored x1.5). The game logs score@turns alone (`show.py --what research` has its Tech Contract rows) |
| `civicScore.*` | the same of a civic: own value, the city's term, the lineage's bases, the contracts, each modifier |
| `policyScore.*` | the card's civic, slot and eras; each modifier's whole value and their sum; what the score holds beside them |
| `danger`, `danger.major` | per differing plot of the row (six at most): each unit laying danger there (type, player, plot, strengths, by reach or range), each district, the player's own districts' cut, the feature; the sum against the row |
| `plan.blow`, `plan.kills` | the blow's kind; attacker and defender strengths as the composers give them, with base, formation, wound, terrain, fortification, class matchup, general, barbarian terms named and THE REST in one number; damage each way; the same for the blow back from the row's spot; a district's exchange whole |
| `plan.reach`, `plan.input` | our whole reach of the row's unit in the list's order, `x:y/turn/Movement left` with `!` on an attack's plot, and the units of its formation (the game's list: `show.py --unit`); name the unit, `plan.reach:91:u3801100` |
| `contracts*`, `cityState.build` | the engine's city AI lines of the turn for that city-state: its item and best values, each tree's tick with the units it holds, a cancelled build; the tree pool (`pool next <generation> made <slots> free [<free list, head last>] upgrade [<Upgrade Units ids>]`) |

Not traced (the row prints alone): the unit moves (`*.move.plot`,
`*.move.family`, `*.fortify`: a move's candidates are scored inside
tactical.ts's move functions, no list to hand out without rewriting them;
use `show.py --unit` for the game's planning and AI_Tactical rows);
`plan.reach.moves`, `plan.reach.order`, `plan.spots`, `targets*`, `kb.*` (the row already holds the
entries one side has); `ops*`, `op.start.*` (REPLAY_TRACE=operations prints
the engine's operation lines); `unit.table*`; `cityState.build`'s value
tables (the city AI line holds the best building and unit value alone); a
blow's promotion, ability, flanking and support terms one by one (they are
in "the rest": the composers are single sums); a policy's gates (a card
with no score shows its modifiers alone).

## The saved state a window resumes from

The aimem bar writes, per seed, the engine's carried state as every tenth
turn closes: `.claude/scratchpad/aiscore/p<N>m/state/s<seed>_t<turn>.state`
(`run.ts --save-state <dir> [--every N]`, `cpu/harness/stateSave.ts`; about
45 KB a save, 1.1 MB a game, 0.2 s of a whole-game run). A save holds the
engine's state whole, the record keys of its units and every field of the
replay's bookkeeping that outlives a pair, with the saving tree's head sha
in its header.

`run.ts --from T --load-state <dir>` (what `window.py` runs) takes the
newest save closing a turn at or before T-1, runs the turns from the save's
to T unscored and scores from T on: the rows are a whole-game run's rows of
those turns, row for row and in order, and the state it carries on is that
run's. Proved on five recordings, the window's tree the tree that wrote the
saves:

- seeds 1124 and 1121: windows at t36, t124, t218 and t33, t137, t201; a
  run resumed at t31 of 1121 and taken to the end holds the whole game's
  160 rows and its 21 later saves;
- seeds 1189, 1143 (the Free Cities from t208) and 1171: windows at t14,
  t105, t226; t33, t127, t212; t38, t118, t203, each the bar's rows of its
  turns in the bar's order (22, 3, 6; 16, 1, 154; 18, 5, 2 rows), with one
  to seven turns run unscored;
- the same three resumed at t11 and taken to the end: the whole game's 231,
  437 and 116 rows of t11 on in order, and each one's 23 later saves equal
  to the bar's at every path (`statecmp.mjs`); resumed again at t185, t201
  and t121: the 16 saves after them equal.

One line on stderr says what happened:

- `STATE: RESUMED from <save> (..., saved by <sha>); turns A-B run unscored`,
  with `NOT IN THE SAVE: <fields>` where your tree carries a field the
  save's tree did not (a field you added to `SEAT_MEMORY`, `MINOR_STORES`
  ...): it starts from the record's import, as a window without a save
  starts it.
- `STATE: NO RESUME (<why>)`: no save of the seed at or before T-1, a save
  of another format, recording or memory mode, or one that does not read.
- `STATE: FELL BACK (<why>)`: the resumed run threw or stopped before its
  first scored turn (a state your tree's turn cannot run); the window ran
  again from the record alone.

After the last two the window is a window without a save (below).
`node tools/aiport/statecmp.mjs <a.state|dir> <b.state|dir>` names the
paths at which two saves differ (`run.ts ... --save-state <your dir>` on a
window writes yours).

### A save from another tree

The bar's saves are written by the bar's tree; your window runs your tree,
at a later head and with your patch. The turns up to the save's ran under
the bar's code, the turns after it under yours, and the window says how the
two trees' cpu/ differ. (A save written at a head your tree does NOT hold,
which `--state <dir>` alone can name, is worse: its turns ran under code
your tree lacks, the window is neither tree's whole game, and its `STATE:`
line says so.) What a save of an earlier head does to the rows:

- Nothing, where your change is to a decision, a value or a memory the
  engine builds anew each turn (a move, a build, a score, an analysis, the
  danger map, a plan), or to what `--memory aimem` takes from the game each
  turn (knowledge bases, camps, operations, city trees, contracts): the
  window's rows are the rows your tree's own whole-game run holds (checked
  with every research score moved: 763 rows of 1121 t137-149 the same, row
  for row, from a save of the unpatched tree, with no turn run unscored).
- A difference, where your change moves what the engine CARRIES and builds
  up over many turns: a city-state's savings, strategic stockpile and
  reservations, production overflow and kept progress, Great Person points,
  the trade graph, the tribes' clocks and raids, the pool slots, explored
  and revealed plots, the research AI's seen flags. The window holds the
  bar's values at the save and your rule's from there, so a row that reads
  such a store may differ from your whole-game run's (the same patch with a
  lower savings cap: the window's carried state differs from the patched
  whole game's at the two savings slots alone, `statecmp.mjs`). `--warm N`
  lets your rule run N more turns before the scored ones; a store that never
  forgets needs the window from turn 1 (`window.py <wt> <seed> 1 <to>`), or
  the next bar.
- A before / after pair of windows (`base`, then `a1 --vs base`) resumes
  both from the same save: what differs between them is your change's from
  the save's turn on.

## A window without a save

`--no-state`, or a window that said `NO RESUME` or `FELL BACK`, folds the
records before T into the import's history (eras, boosts, prices, levies,
the city-states' savings, the barbarians' tribes), opens on record T, and
takes from the game's memory of T-1 the knowledge bases, camps, operations,
city trees and contracts. What our own turns carry and no record or memory
read holds starts empty: the research and civics AIs' last analyses,
government values and best cards, a city-state's unit and building value
tables, trade lists, standing-army list, upgrade trees, a unit's pool slot
and DEFENDER type, the strategic stockpile and reservations, production
overflow, the majors' agendas (drawn anew). Such a window holds rows the
whole game does not, most in its first two turns (seed 1124 t36-47: 208
rows for the whole game's 1; t124-135: 184 for 27, 13 of the 27 missing):
compare it with a window of your BASE tree over the same turns, start it
five turns before the case, and do not count its first two turns.

## What a resumed window can still differ in

From the whole-game run of the SAME tree, on the same recording: nothing
the five proof recordings show, in a row or at a path of the carried state.
Known and not carried: the generator hold's marks of the log's draws
already taken (`streamHold`'s own, kept inside it: the runs resumed at t11
drew as the whole games did to their ends), and the combat log on the two
records before the window, which nothing reads. The history the records
before the window leave (`History`, the tribes' and the savings' folds) is
folded anew from those records, as a whole game folds it.

From the rows you compare it with, where the two are not one tree's:

- THE BAR'S HEAD IS NOT YOURS. A bar run at a commit your tree lacks holds
  that commit's rows: what it closed is NEW in your window, what it opened
  is GONE. The tool takes the bar of your tree's history and says which
  (`BAR:`); a `--vs` you name yourself is yours to check.
- YOUR TREE IS PAST THE BAR'S HEAD. The rows the commits between closed or
  opened differ from the bar's, the same in a whole game of your tree:
  compare your change against a window of your BASE tree (`--vs base`),
  never against the bar alone.
- THE SAVE'S TREE CARRIED OTHERWISE ("A save from another tree"): a store
  built up over the turns before the save holds the save's tree's values.
- The report's counts (`ai<seed>.json`, `.md`) are of the scored turns
  alone; the turns run unscored print no row and no count.
