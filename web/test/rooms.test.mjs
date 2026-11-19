import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { RulesEngine } from '../src/wasm.ts';
import { RegistryTracker } from '../../worker/src/registry.ts';
import { RoomLogic } from '../../worker/src/room-logic.ts';

const root = resolve(import.meta.dirname, '..', '..');
const wasmBytes = readFileSync(join(root, 'dist', 'rules.wasm'));

test('RegistryTracker enforces 10/IP and 50/app daily caps and lookup', () => {
  const reg = new RegistryTracker();
  const now = 1_700_000_000_000;

  for (let i = 0; i < 10; i++) {
    const r = reg.create('ip-1', now);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(reg.has(r.code, now), true);
  }
  assert.equal(reg.create('ip-1', now).ok, false);
  assert.equal(reg.has('ZZZZZZ', now), false);

  for (let ip = 2; ip <= 5; ip++) {
    for (let i = 0; i < 10; i++) {
      assert.equal(reg.create(`ip-${ip}`, now).ok, true);
    }
  }
  // 50 created total; 51st fails global cap
  assert.equal(reg.create('ip-6', now).ok, false);
});

test('RoomLogic: turns, 0.5s rate limit, marking agreement, and second-pass all-alive rule', async () => {
  const eng = await RulesEngine.fromBytes(wasmBytes);
  const t0 = 1_700_000_000_000;
  const room = new RoomLogic({ code: 'ABC234', size: 9, handicap: 0, clocksOn: false }, eng, 'tok-1', t0);
  assert.equal(room.join('tok-2', t0 + 100).ok, true);

  // Out-of-turn rejected
  assert.equal(room.playMove(2, 20, t0 + 200).ok, false);

  // Black plays, then tries again too fast -> rate limited (< 500ms since seat 1's last action)
  assert.equal(room.playMove(1, 20, t0 + 1000).ok, true);
  assert.equal(room.playMove(2, 21, t0 + 1100).ok, true);
  assert.equal(room.playMove(1, 22, t0 + 1200).ok, false); // 200ms < 500ms

  // Double pass enters marking
  assert.equal(room.playMove(1, -1, t0 + 3000).ok, true);
  assert.equal(room.playMove(2, -1, t0 + 4000).ok, true);
  assert.equal(room.phase, 'marking');

  // Toggle dead stone clears accept; disagree resumes play with noDeadMarksNextPass
  assert.equal(room.toggleMark(1, 20, t0 + 5000).ok, true);
  assert.equal(room.acceptMarks(1, '20', t0 + 6000).ok, true);
  assert.equal(room.disagreeMarks(2, t0 + 7000).ok, true);
  assert.equal(room.phase, 'playing');
  assert.equal(room.noDeadMarksNextPass, true);

  // Next double pass counts every stone alive and finishes
  assert.equal(room.playMove(1, -1, t0 + 8000).ok, true);
  assert.equal(room.playMove(2, -1, t0 + 9000).ok, true);
  assert.equal(room.phase, 'finished');
  assert.ok(room.score !== null);
});
