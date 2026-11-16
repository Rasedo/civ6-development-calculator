/**
 * THE AI'S TERMS, SHOWN TO THE HARNESS: an evaluator that sums named terms
 * hands them to `aiTrace` where the harness set one (`--trace`,
 * `cpu/harness/aiTrace.ts`). Null in every engine run: a call site is
 * `aiTrace?.(topic, seat, key, () => terms)`, its terms built only when a
 * trace asks for them, and nothing read back.
 *
 * Topics: `modifiers` (aiModifiers.ts `modifiersValue`: the list and each
 * modifier's value), `research` and `research.row` (aiResearch.ts: a row's
 * own value, then its score's parts), `civic` and `civic.row`
 * (aiCivics.ts), `danger.open`, `danger.unit`, `danger.district`
 * (tactical.ts `dangerPlane`: a map begun, a unit's danger and the plots it
 * lands on, a district's).
 */
export type AiTraceTerms = Record<string, unknown>;
export type AiTraceSink = (topic: string, seat: number, key: string, terms: () => AiTraceTerms) => void;

export let aiTrace: AiTraceSink | null = null;

export function setAiTrace(fn: AiTraceSink | null): void {
  aiTrace = fn;
}
