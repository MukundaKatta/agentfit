import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OverBudgetError } from '../src/errors.js';

test('OverBudgetError carries fitted messages, dropped, and token counts', () => {
  const fitted = [{ role: 'user', content: 'a' }];
  const dropped = [{ role: 'user', content: 'b' }];
  const tokens = { before: 100, after: 50, budget: 30 };
  const err = new OverBudgetError('over', fitted, dropped, tokens);
  assert.equal(err.name, 'OverBudgetError');
  assert.equal(err.message, 'over');
  assert.deepEqual(err.messages, fitted);
  assert.deepEqual(err.dropped, dropped);
  assert.deepEqual(err.tokens, tokens);
});

test('OverBudgetError is catchable as Error and as OverBudgetError', () => {
  const err = new OverBudgetError('over', [], [], { before: 0, after: 0, budget: 0 });
  assert.ok(err instanceof Error);
  assert.ok(err instanceof OverBudgetError);
});
