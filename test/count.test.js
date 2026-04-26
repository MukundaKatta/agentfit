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
