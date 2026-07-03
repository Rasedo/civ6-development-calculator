/**
 * Node bundle for the RL trainer/evaluator + worker. Bundling to plain JS
 * lets worker_threads load the worker without a TS transform, and removes
 * transform overhead from long training runs.
 *
 *   npm run rl:build   →  dist-rl/{train,evaluate,rl-worker}.js
 */

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    target: 'node18',
    outDir: 'dist-rl',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: {
        train: 'scripts/train.ts',
        evaluate: 'scripts/evaluate.ts',
        'rl-worker': 'scripts/rl-worker.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunk-[name].js',
      },
    },
  },
});
