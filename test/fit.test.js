import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fit, count } from '../src/index.js';
import { OverBudgetError } from '../src/errors.js';

// Use a deterministic 1-token-per-character tokenizer so tests are easy to read.
const tok = (s) => s.length;
const tokOpts = { tokenizer: tok, overhead: 1 };

function msg(role, content, extra = {}) {
  return { role, content, ...extra };
}

test('fit() returns the input unchanged if already under budget', () => {
  const messages = [msg('user', 'hi')];
  const r = fit(messages, { ...tokOpts, maxTokens: 100 });
  assert.equal(r.fit, true);
  assert.equal(r.dropped.length, 0);
  assert.deepEqual(r.messages, messages);
  assert.notEqual(r.messages, messages); // returns a copy
});

test('fit() drops oldest non-system messages until under budget (default strategy)', () => {
  const messages = [
    msg('system', 'sys'),       // 'system'(6) + 'sys'(3) + 1 = 10
    msg('user', 'AAAAAAAAAA'),   // 'user'(4) + 10 + 1 = 15
    msg('assistant', 'BBBBBBBBBB'), // 9 + 10 + 1 = 20
    msg('user', 'CCCCCCCCCC'),  // 4 + 10 + 1 = 15
  ];
  // Total = 10 + 15 + 20 + 15 = 60
  const r = fit(messages, { ...tokOpts, maxTokens: 30 });
  assert.equal(r.fit, true);
  assert.equal(r.tokens.before, 60);
  assert.ok(r.tokens.after <= 30, `after=${r.tokens.after} should be <= 30`);
  // System should still be there
  assert.equal(r.messages[0].role, 'system');
  // Most recent user msg should still be there
  assert.equal(r.messages[r.messages.length - 1].content, 'CCCCCCCCCC');
});

test('fit() preserves the last N messages', () => {
  const messages = Array.from({ length: 6 }, (_, i) =>
    msg(i % 2 ? 'assistant' : 'user', `msg${i}-${'X'.repeat(20)}`)
  );
  const r = fit(messages, { ...tokOpts, maxTokens: 80, preserveLastN: 2 });
  // The last two messages must be present
  assert.equal(r.messages[r.messages.length - 2].content, messages[4].content);
  assert.equal(r.messages[r.messages.length - 1].content, messages[5].content);
});

test('fit() preserves system + last N together', () => {
  const messages = [
    msg('system', 'system prompt'),
    msg('user', 'A'.repeat(50)),
    msg('assistant', 'B'.repeat(50)),
    msg('user', 'C'.repeat(50)),
    msg('assistant', 'D'.repeat(50)),
    msg('user', 'final question'),
  ];
  const r = fit(messages, { ...tokOpts, maxTokens: 80, preserveLastN: 1 });
  assert.equal(r.messages[0].role, 'system');
  assert.equal(r.messages[r.messages.length - 1].content, 'final question');
});

test('fit() with strategy: drop-middle keeps head and tail, drops middle', () => {
  const messages = Array.from({ length: 7 }, (_, i) =>
    msg('user', `msg${i}-${'X'.repeat(20)}`)
  );
  const r = fit(messages, {
    ...tokOpts,
    maxTokens: 100,
    preserveSystem: false,
    preserveFirstN: 1,
    preserveLastN: 1,
    strategy: 'drop-middle',
  });
  assert.equal(r.fit, true);
  // First and last must be there
  assert.equal(r.messages[0].content, messages[0].content);
  assert.equal(r.messages[r.messages.length - 1].content, messages[messages.length - 1].content);
});

test('fit() with strategy: priority drops lowest priority first', () => {
  // Token costs (tokenizer=length, overhead=1):
  //   system 'sys'                  → 6+3+1 = 10  (protected by preserveSystem)
  //   user 'low priority chatter'   → 4+20+1 = 25 (priority 1)
  //   user 'medium priority detail' → 4+22+1 = 27 (priority 5)
  //   user 'IMPORTANT FACT HERE'    → 4+19+1 = 24 (priority 10)
  //   user 'recent question'        → 4+15+1 = 20 (protected by preserveLastN)
  // Total = 106. Budget 85 forces dropping ~25 tokens; priority strategy
  // should pick 'low priority chatter' (priority 1, smallest) and stop there.
  const messages = [
    msg('system', 'sys'),
    msg('user', 'low priority chatter', { priority: 1 }),
    msg('user', 'medium priority detail', { priority: 5 }),
    msg('user', 'IMPORTANT FACT HERE', { priority: 10 }),
    msg('user', 'recent question'),
  ];
  const r = fit(messages, {
    ...tokOpts,
    maxTokens: 85,
    preserveLastN: 1,
    strategy: 'priority',
  });
  const survivedContents = r.messages.map((m) => m.content);
  assert.ok(!survivedContents.includes('low priority chatter'), 'lowest-priority should be dropped first');
  assert.ok(survivedContents.includes('medium priority detail'), 'medium-priority should survive when budget allows');
  assert.ok(survivedContents.includes('IMPORTANT FACT HERE'), 'highest-priority should survive');
  assert.equal(r.dropped.length, 1, 'only one drop needed at this budget');
});

test('fit() throws OverBudgetError when budget unreachable', () => {
  const messages = [
    msg('system', 'X'.repeat(100)),
    msg('user', 'final', {}),
  ];
  // System alone is way over a tiny budget; preserveSystem keeps it; preserveLastN keeps the user msg
  assert.throws(
    () => fit(messages, { ...tokOpts, maxTokens: 10, preserveLastN: 1 }),
    (err) => {
      assert.ok(err instanceof OverBudgetError);
      assert.ok(err.tokens.after > 10);
      assert.equal(err.tokens.budget, 10);
      assert.ok(Array.isArray(err.messages));
      return true;
    }
  );
});

test('fit() with onOverBudget: return-partial returns the partial result', () => {
  const messages = [
    msg('system', 'X'.repeat(100)),
    msg('user', 'final'),
  ];
  const r = fit(messages, {
    ...tokOpts,
    maxTokens: 10,
    preserveLastN: 1,
    onOverBudget: 'return-partial',
  });
  assert.equal(r.fit, false);
  assert.ok(r.tokens.after > 10);
  assert.equal(r.messages.length, 2); // both protected; nothing was dropped
});

test('fit() preserveSystem: false allows dropping system messages', () => {
  const messages = [
    msg('system', 'sys-' + 'X'.repeat(30)),
    msg('user', 'short', {}),
  ];
  const r = fit(messages, { ...tokOpts, maxTokens: 15, preserveSystem: false });
  assert.equal(r.fit, true);
  // System was dropped because it was largest non-protected
  assert.ok(!r.messages.some((m) => m.role === 'system'));
});

test('fit() works with model: claude estimator without explicit tokenizer', () => {
  const messages = [
    msg('system', 'You are a helpful assistant.'),
    msg('user', 'A'.repeat(400)),
    msg('user', 'final question'),
  ];
  const r = fit(messages, {
    maxTokens: 50,
    model: 'claude-sonnet-4-6',
    preserveLastN: 1,
  });
  assert.equal(r.fit, true);
  // Old long user message should be gone
  assert.ok(!r.messages.some((m) => m.content === 'A'.repeat(400)));
});

test('fit() rejects bad input', () => {
  assert.throws(() => fit('not array', { maxTokens: 10 }), TypeError);
  assert.throws(() => fit([], null), TypeError);
  assert.throws(() => fit([], {}), TypeError);
  assert.throws(() => fit([], { maxTokens: -1 }), TypeError);
  assert.throws(() => fit([], { maxTokens: 10, strategy: 'unknown' }), TypeError);
});

test('fit() result tokens reflect estimator behaviour', () => {
  const messages = [msg('user', 'hello')];
  const r = fit(messages, { maxTokens: 1000 }); // way under
  // count() of the same input should match r.tokens.before
  assert.equal(count(messages), r.tokens.before);
});

test('fit() does not mutate the input array', () => {
  const messages = [msg('user', 'X'.repeat(50)), msg('user', 'short')];
  const original = [...messages];
  fit(messages, { ...tokOpts, maxTokens: 8 });
  assert.deepEqual(messages, original);
});
