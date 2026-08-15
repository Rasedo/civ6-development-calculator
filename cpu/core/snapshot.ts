import { deserialize, serialize } from 'node:v8';
import type { GameState } from './types';

export function captureState(state: GameState): Buffer {
  return serialize(state);
}

export function restoreState(buf: Buffer): GameState {
  return deserialize(buf) as GameState;
}
