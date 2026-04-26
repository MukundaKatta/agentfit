/**
 * Basic example: a long chat history that needs trimming before the next
 * model call. Default strategy keeps system + most recent + drops oldest.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fit, count } from '../src/index.js';

test('long chat history fits under a Sonnet budget', () => {
  const history = [
    { role: 'system', content: 'You are a research assistant.' },
    ...Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content:
        i % 2
          ? `Sure, here is some context about turn ${i}: ${'detail '.repeat(40)}`
          : `Question ${i}: tell me more about ${'topic '.repeat(20)}`,
    })),
    { role: 'user', content: 'Summarize what we have discussed so far.' },
  ];

  const before = count(history, { model: 'claude-sonnet-4-6' });
  const r = fit(history, {
    maxTokens: 500,
    model: 'claude-sonnet-4-6',
    preserveLastN: 4,
  });

  assert.equal(r.fit, true);
  assert.ok(r.tokens.after <= 500);
  assert.ok(r.tokens.before > r.tokens.after);
  assert.ok(r.dropped.length > 0);

  // System and last 4 messages survive
  assert.equal(r.messages[0].role, 'system');
  const lastFourOriginal = history.slice(-4).map((m) => m.content);
  const lastFourFitted = r.messages.slice(-4).map((m) => m.content);
  assert.deepEqual(lastFourFitted, lastFourOriginal);
});
