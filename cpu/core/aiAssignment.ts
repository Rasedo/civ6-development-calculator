/**
 * THE GENERALIZED ASSIGNMENT (MathAlgorithm_GeneralizedAssignmentProblem
 * 0x8b5bf0) at capacity and weight 1 (its knapsack 0x61ddb0 takes the first
 * largest positive gain): `at` holds each agent's slot (-1 none) as the
 * caller's start left it; per pass, per slot in order, each agent's gain
 * there — `gain(i, j, -1)` where it sits nowhere or there, else
 * `gain(i, j, at[i]) - gain(i, at[i], -1)` — and the first largest above 0
 * takes the slot unless it sits there: `move(i, j, at[i])` returns the
 * agent it unseats (-1 none), which is left with no slot. The passes repeat,
 * `passes` at most, while one moved an agent.
 */
export function generalizedAssignment(agents: number, slots: number, at: number[],
  gain: (i: number, j: number, cur: number) => number, move: (i: number, j: number, cur: number) => number, passes: number): void {
  let moved = true;
  for (let pass = 0; pass < passes && moved; pass++) {
    moved = false;
    for (let j = 0; j < slots; j++) {
      let pick = -1;
      let top = 0;
      for (let i = 0; i < agents; i++) {
        const w = at[i] === -1 || at[i] === j ? gain(i, j, -1) : gain(i, j, at[i]) - gain(i, at[i], -1);
        if (pick < 0 || w > top) {
          pick = i;
          top = w;
        }
      }
      if (pick < 0 || top <= 0 || at[pick] === j) continue;
      const old = move(pick, j, at[pick]);
      at[pick] = j;
      if (old >= 0) at[old] = -1;
      moved = true;
    }
  }
}
