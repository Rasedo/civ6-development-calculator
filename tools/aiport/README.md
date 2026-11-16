# tools/aiport: the AI-port agent's measuring tools

One loop, five tools. Run them from your worktree with absolute paths
(`python <wt>/tools/aiport/rows.py ...`); they read the recordings and the
bars in the main checkout and write only under `<wt>/.claude/scratchpad/win/`.
Every tool prints its full usage with `-h`.

| step | tool | answers |
|---|---|---|
| 1 | `rows.py` | which rows are missed, grouped, over which turns; what changed between two runs |
| 2 | `window.py` | one seed's turn window scored under your tree, compared with your base's window or the bar |
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
then prints the compare against `--vs <tag>` (default: the newest bar
holding the seed, cut to the window's turns; `--vs none` for none). It
REFUSES to start while another window of the worktree runs (`win/.lock`),
takes one seed, and refuses more than 120 turns without `--span`.
`--trace` (below) passes through; its lines land in `ai<seed>.log`.

    window 1171 t36-42 tag a1: rc=0 7s, 114 missed rows, head e04ce61d (2 files changed ...) -> ...\win\a1
    gone 0 (A holds, B does not), new 0 (B holds, A does not)
    kind                          A      B   gone    new

## SHOW: the game's own records of a turn

    python tools/aiport/show.py 1171 38 --player 2 --what research,contracts,trees
    python tools/aiport/show.py 1171 38 --unit 458754            # its rows at every site, its planning, blows, AI_Tactical rows
    python tools/aiport/show.py 1154 122 --player 63 --what danger --plot 10:5
    python tools/aiport/show.py 1171 38 --city AKKAD              # queue at T and T+1, AI_CityBuild lines, logged value tables
    python tools/aiport/show.py 1171 38 --player 2                # events: every log row and record event of the turn

`--what`: units, planning, targets, danger, kb, trees, contracts, ops,
builds, research, events (several with commas). It reads the seed's
`.aimem.jsonl` (sites tactical / log / endlook), `.aiunits.jsonl` (start /
tactical / tacpass / log / endlook), record T and T+1 and the logs' sqlite
(`logstore.py`); values in 24.8 fixed point are printed divided. Each
section opens with `== <what> of p<N> ... t<T>`.

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
| `contracts*`, `cityState.build` | the engine's city AI lines of the turn for that city-state: its item and best values, each tree's tick, a cancelled build |

Not traced (the row prints alone): the unit moves (`*.move.plot`,
`*.move.family`, `*.fortify`: a move's candidates are scored inside
tactical.ts's move functions, no list to hand out without rewriting them;
use `show.py --unit` for the game's planning and AI_Tactical rows);
`plan.reach*`, `plan.spots`, `targets*`, `kb.*` (the row already holds the
entries one side has); `ops*`, `op.start.*` (REPLAY_TRACE=operations prints
the engine's operation lines); `unit.table*`; `cityState.build`'s value
tables (the city AI line holds the best building and unit value alone); a
blow's promotion, ability, flanking and support terms one by one (they are
in "the rest": the composers are single sums); a policy's gates (a card
with no score shows its modifiers alone).

## What a window lacks

A `--from T` window folds the records before T into the import's history
(eras, boosts, prices, levies, the city-states' savings, the barbarians'
tribes), opens on record T, and takes from the game's memory of T-1 the
knowledge bases, camps, operations, city trees and contracts. What our own
turns carry and no record or memory read holds starts empty: the research
and civics AIs' last analyses, government values and best cards (the score
kinds miss for two turns: seed 1171 t36-37 holds 61 rows the whole-game run
does not, t38 on the same counts), a city-state's unit and building value
tables, trade lists, standing-army list, upgrade trees, a unit's pool slot
and DEFENDER type, the strategic stockpile and reservations, production
overflow. So: compare a change against a window of your BASE tree with the
same turns, start the window five turns before the case, and do not count
the window's first two turns.
