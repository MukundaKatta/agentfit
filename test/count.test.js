import { test } from 'node:test';
import assert from 'node:assert/strict';

import { count, estimators } from '../src/count.js';

test('count() estimates tokens for a string (default ~chars/4)', () => {
  assert.equal(count('hello world'), 3); // 11 chars / 4 = 2.75 → ceil 3
  assert.equal(count(''), 0);
  assert.equal(count('a'), 1);
});

test('count() picks the anthropic estimator for claude models (~chars/3.5)', () => {
  // 'hello world' = 11 chars; anthropic 11/3.5 = 3.14 → 4
  assert.equal(count('hello world', { model: 'claude-sonnet-4-6' }), 4);
});

test('count() picks the openai estimator for gpt models', () => {
  assert.equal(count('hello world', { model: 'gpt-5' }), 3);
  assert.equal(count('hello world', { model: 'o3-mini' }), 3);
});

test('count() picks the google estimator for gemini models', () => {
  assert.equal(count('hello world', { model: 'gemini-2-pro' }), 3);
});

test('count() picks llama estimator for llama/mistral/mixtral', () => {
  assert.equal(count('hello world', { model: 'llama-3.1-8b' }), 3);
  assert.equal(count('hello world', { model: 'mistral-7b' }), 3);
});

test('count() falls back to default estimator on unknown models', () => {
  assert.equal(count('hello world', { model: 'made-up-model-xyz' }), 3);
});

test('count() respects user-supplied tokenizer hook', () => {
  const tok = (s) => s.length; // every char is a token
  assert.equal(count('hello', { tokenizer: tok }), 5);
  assert.equal(count([{ role: 'user', content: 'hello' }], { tokenizer: tok, overhead: 0 }), 5 + 4); // 5 content + 4 role
});

test('count() handles message arrays with overhead', () => {
  // 3 messages, default overhead 4, default estimator
  // Each message: role tokens + content tokens + 4 overhead
  const msgs = [
    { role: 'system', content: 'be precise' },     // 'system' (2) + 'be precise' (3) + 4 = 9
    { role: 'user', content: 'hello' },             // 'user' (1) + 'hello' (2) + 4 = 7
    { role: 'assistant', content: 'hi there' },     // 'assistant' (3) + 'hi there' (2) + 4 = 9
  ];
  // 9 + 7 + 9 = 25
  assert.equal(count(msgs), 25);
});

test('count() handles messages with anthropic overhead (6 vs 4)', () => {
  const msgs = [{ role: 'user', content: 'hello' }];
  // openai: role(1) + content(2) + 4 = 7
  // anthropic: role(2) + content(2) + 6 = 10  (uses anthropic estimator + overhead)
  assert.equal(count(msgs, { model: 'gpt-4' }), 7);
  assert.equal(count(msgs, { model: 'claude-sonnet-4-6' }), 10);
});

test('count() tolerates messages without content/role', () => {
  assert.equal(count([{}, { role: 'user' }, { content: 'hi' }]), 4 + (1 + 4) + (1 + 4)); // 4 + 5 + 5
});

test('count() throws on bad input', () => {
  assert.throws(() => count(null), TypeError);
  assert.throws(() => count(undefined), TypeError);
  assert.throws(() => count(42), TypeError);
});

test('estimators table is frozen + has expected families', () => {
  assert.throws(() => {
    estimators.default = () => 0;
  });
  assert.equal(typeof estimators.openai, 'function');
  assert.equal(typeof estimators.anthropic, 'function');
});

test('count() handles Anthropic content-blocks shape (regression)', () => {
  // Previously: array content was coerced to '' and tokens silently undercount.
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Tell me about token counting in agents.' },
      ],
    },
  ];
  const stringEquivalent = [
    { role: 'user', content: 'Tell me about token counting in agents.' },
  ];
  // Cannot assert exact equality (overhead is per-message), but the
  // tokenizer should at least be invoked on the text.
  const blockTokens = count(messages);
  const stringTokens = count(stringEquivalent);
  assert.equal(blockTokens, stringTokens);
  assert.ok(blockTokens > 0);
});

test('count() walks tool_use blocks', () => {
  const messages = [
    {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 't1', name: 'lookup', input: { city: 'NYC' } },
      ],
    },
  ];
  // Should be > overhead alone — tool_use produces JSON-ish text.
  const tokens = count(messages);
  const overheadOnly = count([{ role: 'assistant', content: '' }]);
  assert.ok(tokens > overheadOnly);
});

test('count() recurses into tool_result content blocks', () => {
  const messages = [
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't1',
          content: [{ type: 'text', text: 'Result: 72°F sunny' }],
        },
      ],
    },
  ];
  const tokens = count(messages);
  const overheadOnly = count([{ role: 'user', content: '' }]);
  assert.ok(tokens > overheadOnly);
});

test('count() skips non-text blocks like image without crashing', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', data: 'abc==', media_type: 'image/png' } },
        { type: 'text', text: 'Describe this image.' },
      ],
    },
  ];
  const tokens = count(messages);
  const stringOnly = count([{ role: 'user', content: 'Describe this image.' }]);
  // Image block contributes 0; text contributes equal to plain string.
  assert.equal(tokens, stringOnly);
});

test('count() handles OpenAI Responses API input_text/output_text blocks', () => {
  const messages = [
    {
      role: 'user',
      content: [{ type: 'input_text', text: 'Hi there' }],
    },
    {
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello!' }],
    },
  ];
  const tokens = count(messages);
  const stringEquivalent = count([
    { role: 'user', content: 'Hi there' },
    { role: 'assistant', content: 'Hello!' },
  ]);
  assert.equal(tokens, stringEquivalent);
});
