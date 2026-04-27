import { test } from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../src/cli.js';

/**
 * The CLI writes JSON to stdout and human-readable error/help text to stderr.
 * For unit tests we patch process.stdout.write / process.stderr.write so we
 * can capture both streams without spawning subprocesses.
 *
 * Each test restores the originals in a try/finally so a failure in one test
 * doesn't bleed state into the next.
 */
async function captureMain(argv) {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  process.stdout.write = (chunk) => {
    stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return true;
  };
  process.stderr.write = (chunk) => {
    stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    return true;
  };
  try {
    const code = await main(argv);
    return { code, stdout, stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}

test('--help prints usage and exits 0', async () => {
  const { code, stdout } = await captureMain(['--help']);
  assert.equal(code, 0);
  assert.match(stdout, /agentfit v\d/);
  assert.match(stdout, /count/);
  assert.match(stdout, /fit/);
});

test('count emits {tokens, model} JSON for a literal string', async () => {
  const { code, stdout } = await captureMain(['count', 'hello world']);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  // 11 chars / 4 → 3 tokens with default estimator (matches count.test.js)
  assert.equal(out.tokens, 3);
  assert.equal(out.model, null);
});

test('count picks per-model estimator when --model is set', async () => {
  const { code, stdout } = await captureMain(['count', 'hello world', '--model', 'claude-sonnet-4-6']);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  // anthropic 11/3.5 → 4
  assert.equal(out.tokens, 4);
  assert.equal(out.model, 'claude-sonnet-4-6');
});

test('count counts a JSON message array as messages, not as a string', async () => {
  const json = JSON.stringify([{ role: 'user', content: 'hello' }]);
  const { code, stdout } = await captureMain(['count', json]);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  // Message array with default estimator: role(1) + content(2) + overhead(4) = 7
  assert.equal(out.tokens, 7);
});

test('fit returns the messages JSON when under budget', async () => {
  const messages = [{ role: 'user', content: 'hi' }];
  const { code, stdout } = await captureMain([
    'fit',
    JSON.stringify(messages),
    '--max-tokens',
    '1000',
  ]);
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.fit, true);
  assert.deepEqual(out.messages, messages);
  assert.equal(out.dropped.length, 0);
});

test('fit exits 1 (and reports partial) when the budget is unreachable', async () => {
  const messages = [
    { role: 'system', content: 'X'.repeat(100) },
    { role: 'user', content: 'final' },
  ];
  const { code, stdout } = await captureMain([
    'fit',
    JSON.stringify(messages),
    '--max-tokens',
    '5',
    '--preserve-last-n',
    '1',
  ]);
  assert.equal(code, 1);
  const out = JSON.parse(stdout);
  assert.equal(out.fit, false);
  // Both messages were protected, so the partial result keeps both.
  assert.equal(out.messages.length, 2);
});

test('unknown subcommand exits 2 with usage error', async () => {
  const { code, stderr } = await captureMain(['nope']);
  assert.equal(code, 2);
  assert.match(stderr, /unknown subcommand/);
});

test('count missing arg exits 2', async () => {
  const { code, stderr } = await captureMain(['count']);
  assert.equal(code, 2);
  assert.match(stderr, /missing/);
});
