/**
 * A pinned run against its pins file beside this one; with PIN set
 * (`PIN=1 npx vitest run tests/cpu/minors`) the run rewrites the file instead.
 */
import { expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';

export function matchPins(file: string, got: unknown): void {
  const url = new URL(`./${file}`, import.meta.url);
  const run = JSON.parse(JSON.stringify(got)) as unknown;
  if (process.env.PIN) {
    writeFileSync(url, JSON.stringify(run));
    return;
  }
  expect(run).toEqual(JSON.parse(readFileSync(url, 'utf-8')));
}
