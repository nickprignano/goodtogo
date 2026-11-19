import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { BudgetTracker } from '../../worker/src/budget.ts';
import { filterCoachReply } from '../../worker/src/filter.ts';

const root = resolve(import.meta.dirname, '..', '..');

test('Worker rules.wasm is byte-identical to browser rules.wasm', () => {
  const appWasm = readFileSync(join(root, 'dist', 'rules.wasm'));
  const workerWasm = readFileSync(join(root, 'worker', 'dist', 'rules.wasm'));
  assert.ok(appWasm.equals(workerWasm), 'worker/dist/rules.wasm must be byte-identical to dist/rules.wasm');
});

test('Coach output filter rejects coordinates and untagged Go concepts', () => {
  const valid = filterCoachReply(
    {
      summary: 'Your stone at {p1} is in atari with one liberty left.',
      concept: 'atari',
      idea: 'Extend from {p1} to gain more liberties.',
    },
    ['atari']
  );
  assert.equal(valid.ok, true);

  const coordLeak = filterCoachReply(
    {
      summary: 'Your stone at D4 is in atari.',
      concept: 'atari',
      idea: 'Extend from D4.',
    },
    ['atari']
  );
  assert.equal(coordLeak.ok, false);

  const untagged = filterCoachReply(
    {
      summary: 'Watch out for the ladder here.',
      concept: 'atari',
      idea: 'Save your stone.',
    },
    ['atari']
  );
  assert.equal(untagged.ok, false);
});

test('BudgetTracker enforces monthly cap, daily cap, and 2-minute stale reservation expiry', () => {
  const b = new BudgetTracker();
  const now = 1_700_000_000_000;

  // Daily explain cap is 5
  for (let i = 0; i < 5; i++) {
    const r = b.reserve('user-a', 'explain', 1, now + i * 1000);
    assert.equal(r.ok, true);
    if (r.ok) b.settle(r.reservationId, 1, now + i * 1000 + 100);
  }
  const sixth = b.reserve('user-a', 'explain', 1, now + 10_000);
  assert.equal(sixth.ok, false);

  // Stale reservation (>2 minutes) counts as spent
  const stale = b.reserve('user-b', 'review', 495, now + 20_000);
  assert.equal(stale.ok, true);
  // After 2+ minutes, 495 + 5 = 500 spent; another 1-cent reservation exceeds 500
  const overCap = b.reserve('user-c', 'explain', 1, now + 20_000 + 125_000);
  assert.equal(overCap.ok, false);
});
