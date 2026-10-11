/**
 * THE GAME'S LOGS OF A RECORDING as one SQLite file: `<stem>.logs.sqlite`
 * beside the dump, written by `tools/civ6lab/logstore.py` from `<stem>.logs/`
 * (its docstring holds the layout: a table per log, AI_CityBuild's PLOT
 * ANALYSIS blocks normalised). Opened read-only; a store missing or older
 * than its logs is built first.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const LOGSTORE = resolve(dirname(fileURLToPath(import.meta.url)), '../../tools/civ6lab/logstore.py');

/** the recording's store, or null when it has no logs */
export function openLogStore(dumpPath: string): DatabaseSync | null {
  const logs = dumpPath.replace(/\.jsonl$/, '.logs');
  const path = `${logs}.sqlite`;
  if (!existsSync(logs)) return existsSync(path) ? new DatabaseSync(path, { readOnly: true }) : null;
  const built = existsSync(path) ? statSync(path).mtimeMs : -1;
  if (readdirSync(logs).some((f) => statSync(join(logs, f)).mtimeMs > built)) {
    const r = spawnSync('python', [LOGSTORE, 'build', dumpPath], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`logstore build failed for ${dumpPath}`);
  }
  return new DatabaseSync(path, { readOnly: true });
}

/** whether the store holds the log's table */
export function hasLog(db: DatabaseSync, table: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
}
