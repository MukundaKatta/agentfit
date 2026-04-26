/**
 * Runnable demo: a long chat history is trimmed three different ways.
 *
 *   node examples/demo-trim.js
 *
 * Same input, three strategies — drop-oldest, drop-middle, priority — so you
 * can see how each preserves a different shape of context.
 */
import { fit, count } from '../src/index.js';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};
const c = (col, s) => (process.stdout.isTTY ? col + s + COLORS.reset : s);

function banner(text) {
  console.log('\n' + '═'.repeat(64));
  console.log('  ' + text);
  console.log('═'.repeat(64));
}

// Build a long-ish realistic chat history
const history = [
  { role: 'system', content: 'You are a software engineer pair-programming with the user.' },
  { role: 'user', content: 'Help me design a REST API for a bookstore.' },
  { role: 'assistant', content: 'Sure! Let me ask a few questions first. What entities does it need?' },
  { role: 'user', content: 'Books, authors, and orders.' },
  { role: 'assistant', content: 'Great. Should authors and books have a many-to-many relationship?' },
  { role: 'user', content: 'Yes. An author can write many books, a book can have many authors.' },
  { role: 'assistant', content: 'Got it. Here is a sketch of the routes: GET /books, POST /books, GET /authors...' },
  { role: 'user', content: 'Good. Now let us talk about authentication.' },
  { role: 'assistant', content: 'For an MVP, JWT-based bearer tokens with a 24-hour expiry usually work well.' },
  { role: 'user', content: 'Sounds good.', priority: 1 }, // low priority filler
  { role: 'assistant', content: 'Anything else?' },
  { role: 'user', content: 'IMPORTANT: log every order with the customer ID and a UUID for idempotency.', priority: 10 },
  { role: 'assistant', content: 'Noted. I will add an idempotency layer to the orders endpoint.' },
  { role: 'user', content: 'Now show me the final code for the orders endpoint, please.' },
];

const MODEL = 'claude-sonnet-4-6';
const BUDGET = 200;

banner(`Original history — ${history.length} messages, ${count(history, { model: MODEL })} tokens (estimate)`);
console.log(c(COLORS.dim, `  Budget: ${BUDGET} tokens (model: ${MODEL})\n`));
for (let i = 0; i < history.length; i++) {
  const m = history[i];
  const prio = typeof m.priority === 'number' ? c(COLORS.yellow, ` [prio=${m.priority}]`) : '';
  console.log(`  ${i.toString().padStart(2)} ${c(COLORS.cyan, m.role.padEnd(9))} ${truncate(m.content, 60)}${prio}`);
}

for (const strategy of ['drop-oldest', 'drop-middle', 'priority']) {
  banner(`Strategy: ${strategy}`);
  const r = fit(history, {
    maxTokens: BUDGET,
    model: MODEL,
    preserveLastN: 1,
    strategy,
  });
  console.log(c(COLORS.dim, `  before=${r.tokens.before} after=${r.tokens.after} budget=${r.tokens.budget} fit=${r.fit}`));
  console.log(c(COLORS.dim, `  dropped ${r.dropped.length} messages, kept ${r.messages.length}\n`));
  for (const m of r.messages) {
    const tag = c(COLORS.green, '✓');
    console.log(`  ${tag} ${c(COLORS.cyan, (m.role ?? '').padEnd(9))} ${truncate(m.content ?? '', 60)}`);
  }
}

banner('count() with a custom tokenizer hook');
const fakeBPE = (text) => Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
const w = count('the quick brown fox jumps over the lazy dog', { tokenizer: fakeBPE });
console.log(`  custom tokenizer says: ${w} tokens`);
console.log(c(COLORS.dim, '  (use this hook to plug in tiktoken or @anthropic-ai/tokenizer for exact counts)'));

console.log('\n' + c(COLORS.dim, 'demo complete'));

function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
