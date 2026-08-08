// Vitest configuration. The browser app is gone; this file exists for the
// test runner only.
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // A git WORKTREE lives under .claude/ during hunts (see gpu/AUDIT.md), and
    // vitest's default include glob does not respect .gitignore — so the
    // worktree's copy of tests/ gets collected alongside the real suite. Those
    // copies run against the WORKTREE's patched source, so they fail for
    // reasons that have nothing to do with the tree under test, and they would
    // turn the battery's vitest lane red spuriously. Excluded here rather than
    // per-invocation so `npm test` and the battery agree.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
});
