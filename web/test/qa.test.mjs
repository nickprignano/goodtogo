import assert from 'node:assert/strict';
import test from 'node:test';
import { answerQuestion } from '../src/qa.ts';

test('Local Q&A answers Go rules questions without an LLM', () => {
  const atari = answerQuestion('what does atari mean?', false);
  assert.equal(atari.matched, true);
  assert.match(atari.answer, /1 liberty/i);
  assert.equal(atari.lessonId, 's1-atari');

  const eli5 = answerQuestion('what does atari mean?', true);
  assert.equal(eli5.matched, true);
  assert.match(eli5.answer, /breathing spot/i);

  const suicide = answerQuestion("why can't I play there?", false);
  assert.equal(suicide.matched, true);
  assert.equal(suicide.lessonId, 's2-suicide');

  const komi = answerQuestion('why does white get 7.5 points?', false);
  assert.equal(komi.matched, true);
  assert.match(komi.answer, /komi/i);

  const unknown = answerQuestion('what is the weather on mars', false);
  assert.equal(unknown.matched, false);
});
