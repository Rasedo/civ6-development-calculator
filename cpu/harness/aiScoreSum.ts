/**
 * THE PER-TURN AI SCORES OF SEVERAL SEEDS together: each seed's
 * `run.ts --aiscore` output, its decision table and memory table, then the
 * kinds summed over every seed (each kind's first mismatch the earliest
 * turn's, its seed named).
 *
 *   npx vite-node cpu/harness/aiScoreSum.ts -- <out1.json> <out2.json> ... --out <sum>
 *
 * Writes `<sum>.md` and `<sum>.json`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { memoryTable, scoreTable, sumScores, type DecisionScores } from './aiScore';

interface SeedScore { dump: string; turns: number[]; pairs: number; stopped?: string; scores: DecisionScores; memory: DecisionScores }

const argv = process.argv.slice(2).filter((a) => a !== '--');
const outAt = argv.indexOf('--out');
if (outAt < 0 || outAt + 1 >= argv.length) throw new Error('usage: aiScoreSum.ts <out.json>... --out <sum>');
const stem = argv[outAt + 1].replace(/\.(json|md)$/, '');
const files = argv.filter((_, i) => i !== outAt && i !== outAt + 1);
const seeds = files.map((f) => {
  const r = JSON.parse(readFileSync(f, 'utf8')) as SeedScore;
  return { seed: /(\d{4})_\d{8}T/.exec(r.dump)?.[1] ?? r.dump, r };
});
const scores = sumScores(seeds.map(({ seed, r }) => ({ seed, scores: r.scores })));
const memory = sumScores(seeds.map(({ seed, r }) => ({ seed, scores: r.memory })));
const out = ['# Per-turn AI score, all seeds', '',
  ...seeds.map(({ seed, r }) => `- ${seed}: ${r.pairs} pairs, turns ${r.turns.join('-')}${r.stopped ? `; stopped: ${r.stopped}` : ''}`), '',
  '## Every seed', '', ...scoreTable(scores), '', ...memoryTable(memory)];
for (const { seed, r } of seeds) out.push('', `## ${seed}`, '', ...scoreTable(r.scores), '', ...memoryTable(r.memory));
writeFileSync(`${stem}.md`, out.join('\n') + '\n');
writeFileSync(`${stem}.json`, JSON.stringify({ seeds: seeds.map(({ seed, r }) => ({ seed, dump: r.dump, pairs: r.pairs, turns: r.turns, stopped: r.stopped })),
  scores, memory, perSeed: Object.fromEntries(seeds.map(({ seed, r }) => [seed, { scores: r.scores, memory: r.memory }])) }, null, 1) + '\n');
console.log([...scoreTable(scores), '', ...memoryTable(memory)].join('\n'));
