import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..', '..');
const wasmBytes = readFileSync(join(root, 'dist', 'rules.wasm'));
const lessons = JSON.parse(readFileSync(join(root, 'web', 'data', 'lessons.json'), 'utf8'));

const PLAY_OK = 0;
const PLAY_SUICIDE = 3;
const PLAY_SUPERKO = 4;
const BLACK = 1;
const WHITE = 2;
const PASS_POINT = -1;
const GOAL_CAPTURE_TARGET = 2;
const GOAL_SAVE_TARGET = 3;

async function loadWasm() {
  const { instance } = await WebAssembly.instantiate(wasmBytes, {});
  const e = instance.exports;
  if (typeof e._initialize === 'function') e._initialize();
  else if (typeof e._start === 'function') e._start();
  return e;
}

test('WASM rules boundary: Capture Go, superko, and area scoring', async () => {
  const e = await loadWasm();

  // Capture Go: first to 1 capture
  e.gtg_new_game(5, 0, 1);
  e.gtg_set_stone(0, WHITE);
  e.gtg_set_stone(1, BLACK);
  e.gtg_reset_history();
  e.gtg_set_turn(BLACK);
  assert.equal(e.gtg_play(5), PLAY_OK);
  assert.equal(e.gtg_get_winner(), BLACK);
  assert.equal(e.gtg_get_captures(BLACK), 1);

  // Suicide check
  e.gtg_new_game(5, 15, 0);
  e.gtg_set_stone(1, BLACK);
  e.gtg_set_stone(5, BLACK);
  e.gtg_reset_history();
  e.gtg_set_turn(WHITE);
  assert.equal(e.gtg_is_legal(0), PLAY_SUICIDE);

  // Ko / positional superko check
  e.gtg_new_game(5, 15, 0);
  e.gtg_set_stone(1, BLACK);
  e.gtg_set_stone(5, BLACK);
  e.gtg_set_stone(7, BLACK);
  e.gtg_set_stone(11, BLACK);
  e.gtg_set_stone(2, WHITE);
  e.gtg_set_stone(8, WHITE);
  e.gtg_set_stone(12, WHITE);
  e.gtg_reset_history();
  e.gtg_set_turn(WHITE);
  assert.equal(e.gtg_play(6), PLAY_OK);
  assert.equal(e.gtg_play(7), PLAY_SUPERKO);

  // AI chooseMove returns a legal move
  const ai = e.gtg_choose_move(3, 123);
  assert.equal(e.gtg_is_legal(ai), PLAY_OK);

  // Double pass scores game
  assert.equal(e.gtg_play(PASS_POINT), PLAY_OK);
  assert.equal(e.gtg_play(PASS_POINT), PLAY_OK);
  assert.notEqual(e.gtg_get_winner(), 0);
});

test('All lesson demos and problems replay cleanly in rules.wasm', async () => {
  const e = await loadWasm();

  for (const lesson of lessons.lessons) {
    // Verify demo
    e.gtg_new_game(lesson.demo.size, 0, 0);
    for (const [idx, color] of lesson.demo.stones) {
      e.gtg_set_stone(idx, color);
    }
    e.gtg_reset_history();
    for (const mv of lesson.demo.moves) {
      e.gtg_set_turn(mv.color);
      assert.equal(
        e.gtg_play(mv.idx),
        PLAY_OK,
        `Demo move ${mv.idx} failed in lesson ${lesson.id}`
      );
    }

    // Verify problems
    for (let i = 0; i < lesson.problems.length; i++) {
      const prob = lesson.problems[i];
      for (const mv of prob.acceptedMoves) {
        e.gtg_new_game(prob.size, 15, 0);
        for (const [idx, color] of prob.stones) {
          e.gtg_set_stone(idx, color);
        }
        e.gtg_set_turn(prob.turn);
        e.gtg_reset_history();

        assert.equal(
          e.gtg_is_legal(mv),
          PLAY_OK,
          `Accepted move ${mv} illegal in ${lesson.id} problem ${i + 1}`
        );

        if (prob.goal === 'capture_target') {
          assert.equal(
            e.gtg_solve(mv, GOAL_CAPTURE_TARGET, prob.targetPoint, 3, 2),
            1,
            `Solver rejected accepted move ${mv} in ${lesson.id} problem ${i + 1}`
          );
        } else if (prob.goal === 'save_target') {
          assert.equal(
            e.gtg_solve(mv, GOAL_SAVE_TARGET, prob.targetPoint, 3, 2),
            1,
            `Solver rejected save move ${mv} in ${lesson.id} problem ${i + 1}`
          );
        } else if (prob.goal === 'reduce_to_one') {
          e.gtg_play(mv);
          const ptr = e.gtg_libs_ptr();
          const libs = new Uint8Array(e.memory.buffer, ptr, prob.size * prob.size);
          assert.equal(
            libs[prob.targetPoint],
            1,
            `Move ${mv} did not reduce target ${prob.targetPoint} to 1 liberty in ${lesson.id} problem ${i + 1}`
          );
        }
      }
    }
  }
});

test('All 150 problems in problems.json are proved by the WASM solver', async () => {
  const e = await loadWasm();
  const data = JSON.parse(readFileSync(join(root, 'web', 'data', 'problems.json'), 'utf8'));
  assert.ok(data.problems.length >= 150, `Expected >= 150 problems, got ${data.problems.length}`);

  for (const prob of data.problems) {
    assert.ok(prob.acceptedMoves.length > 0, `Problem ${prob.id} has no acceptedMoves`);
    for (const mv of prob.acceptedMoves) {
      e.gtg_new_game(prob.size, 15, 0);
      for (const [idx, color] of prob.stones) {
        e.gtg_set_stone(idx, color);
      }
      e.gtg_set_turn(prob.turn);
      e.gtg_reset_history();
      const goal = prob.goal === 'capture_target' ? GOAL_CAPTURE_TARGET : GOAL_SAVE_TARGET;
      assert.equal(
        e.gtg_solve(mv, goal, prob.targetPoint, 3, 2),
        1,
        `Solver rejected ${prob.id} move ${mv}`
      );
    }
  }
});

test('Service worker is generated with a content-hash version and offline assets', () => {
  const sw = readFileSync(join(root, 'dist', 'sw.js'), 'utf8');
  assert.match(sw, /CACHE_NAME = 'goodtogo-[0-9a-f]{12}'/);
  assert.match(sw, /\.\/rules\.wasm/);
  assert.match(sw, /\.\/data\/lessons\.json/);
  assert.match(sw, /\.\/data\/problems\.json/);
});
