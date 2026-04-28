# agentfit

[![npm version](https://img.shields.io/npm/v/@mukundakatta/agentfit.svg)](https://www.npmjs.com/package/@mukundakatta/agentfit)
[![npm downloads](https://img.shields.io/npm/dm/@mukundakatta/agentfit.svg)](https://www.npmjs.com/package/@mukundakatta/agentfit)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/node/v/@mukundakatta/agentfit.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-40%2F40-brightgreen.svg)](./test)

**Fit your messages into the LLM context window.** Token-aware truncation with three strategies (drop-oldest, drop-middle, priority), per-model estimators, pluggable tokenizers (so you can wrap tiktoken if you need exact counts). Zero runtime dependencies.

```bash
npm install @mukundakatta/agentfit
```

```js
import { fit, count } from '@mukundakatta/agentfit';

// Estimate tokens
count('hello world', { model: 'claude-sonnet-4-6' }); // → 4

// Fit a long chat history into your model's budget
const result = fit(longHistory, {
  maxTokens: 100_000,
  model: 'claude-sonnet-4-6',
  preserveLastN: 5,        // never drop the last 5 turns
  preserveSystem: true,    // never drop the system prompt (default true)
  strategy: 'drop-oldest', // drop the oldest user/assistant pairs first
});

// result = { messages, dropped, tokens: { before, after, budget }, fit: true }
await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: result.messages,
});
```

If the budget can't be reached even after dropping all non-protected messages, `OverBudgetError` is thrown by default with the partial result attached. Pass `onOverBudget: 'return-partial'` if you'd rather inspect and decide.

TypeScript types ship in the box.

### See it in action

```bash
git clone https://github.com/MukundaKatta/agentfit && cd agentfit
node examples/demo-trim.js
```

Same input run through all three strategies side by side, so you can see what each preserves.

## Why

Every long-context agent eventually hits this:

- The chat history grows past the context window
- A retrieved doc is too long for the budget you have left
- You want to swap models and the new one has half the context window
- You want to drop low-value chatter but keep the important facts

Hand-rolled truncation is everywhere in agent codebases — and it's almost always *just truncate the front N messages*, which silently drops your system prompt or the user's most recent question. `agentfit` is the small, focused primitive that does this right: protect what matters, drop what doesn't, give you a structured result with token counts before and after.

## API

### `count(input, opts?) → number`

Estimate tokens in a string or chat-message array.

```js
count('hello world');                                  // 3 (default chars/4)
count('hello world', { model: 'claude-sonnet-4-6' });   // 4 (claude estimator)
count(messages, { model: 'gpt-5' });                    // sums per-message + overhead
```

Built-in estimator families: `openai`, `anthropic`, `google`, `llama`, `default`. The `model` string is matched fuzzily (`'gpt-5'` → openai, `'claude-haiku-4-5'` → anthropic, etc.).

For exact counts, plug in your own tokenizer:

```js
import { encode } from 'gpt-tokenizer'; // or any other
count('hello world', { tokenizer: (s) => encode(s).length });
```

### `fit(messages, opts) → FitResult`

Drop messages from the input array until the total is under `maxTokens`.

```js
const result = fit(messages, {
  maxTokens: 50_000,
  model: 'claude-sonnet-4-6',
  preserveSystem: true,    // default true
  preserveFirstN: 0,       // default 0
  preserveLastN: 0,        // default 0
  strategy: 'drop-oldest', // 'drop-oldest' | 'drop-middle' | 'priority'
  onOverBudget: 'throw',   // 'throw' (default) | 'return-partial'
  tokenizer: undefined,    // optional override
  overhead: undefined,     // optional override
});

// result = {
//   messages: Message[],   // the messages that survived
//   dropped: Message[],    // the ones removed
//   tokens: { before, after, budget },
//   fit: true | false,
// }
```

Strategies:

- **`drop-oldest`** (default): the oldest non-protected message gets dropped first. Best for chat histories where recency matters.
- **`drop-middle`**: keep the head and tail; drop from the middle outward. Best when both the early system context and the recent turns matter, but the middle is filler.
- **`priority`**: drop messages with the lowest `priority` field first (default 0; protected messages effectively have priority +∞). Best for tagged content where you've manually marked importance.

Protection precedence: `preserveSystem` ∪ `preserveFirstN` ∪ `preserveLastN`. A message protected by any of these is never dropped.

### `OverBudgetError`

Thrown by `fit()` when the budget can't be reached even after dropping all non-protected messages. Carries the partial result.

```js
import { OverBudgetError } from '@mukundakatta/agentfit';

try {
  fit(messages, { maxTokens: 100, preserveSystem: true });
} catch (err) {
  if (err instanceof OverBudgetError) {
    console.error(`still over budget: ${err.tokens.after}/${err.tokens.budget}`);
    console.error(`dropped ${err.dropped.length} messages, kept ${err.messages.length}`);
    // err.messages is the partial result if you want to use it anyway
  }
}
```

### `estimators`

The built-in estimator table, exported in case you want to compose:

```js
import { estimators } from '@mukundakatta/agentfit';
estimators.anthropic('hello world'); // 4
```

## Recipes

### Chat agent with a Sonnet budget

```js
const fitted = fit(history, {
  maxTokens: 180_000, // leave room for the response in claude-sonnet-4-6's 200k
  model: 'claude-sonnet-4-6',
  preserveLastN: 6,
});
const r = await client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  messages: fitted.messages,
});
```

### RAG with priority-tagged retrieved chunks

```js
const messages = [
  { role: 'system', content: SYSTEM_PROMPT },
  ...retrieved.map((chunk, i) => ({
    role: 'user',
    content: `[doc ${i}]\n${chunk.text}`,
    priority: chunk.score, // higher score = harder to drop
  })),
  { role: 'user', content: userQuestion },
];

const fitted = fit(messages, {
  maxTokens: 100_000,
  model: 'gpt-5',
  preserveLastN: 1,        // always keep the user's question
  strategy: 'priority',
});
```

### Exact counts via tiktoken

```js
import { encode } from 'gpt-tokenizer';

const exactCounter = (s) => encode(s).length;

count(text, { tokenizer: exactCounter });
fit(messages, { maxTokens: 50_000, tokenizer: exactCounter });
```

## CLI

`@mukundakatta/agentfit` ships an `agentfit` binary for one-liners and CI use:

```bash
# Token count for a literal string or for a JSON message array
npx -p @mukundakatta/agentfit agentfit count "hello world" --model claude-sonnet-4-6
# → {"tokens":4,"model":"claude-sonnet-4-6"}

# Fit a chat history under a budget; reads stdin with '-'
cat history.json | npx -p @mukundakatta/agentfit agentfit fit - \
  --max-tokens 100000 --model claude-sonnet-4-6 --preserve-last-n 5 --pretty
```

Pass `-` to read from stdin or any file path to read from disk. Output is JSON to stdout (use `--pretty` for indented). Exit code is `0` on success, `1` when the budget can't be reached, `2` on usage errors. Run `agentfit --help` for the full subcommand reference.

## What this is not

- **Not a tokenizer.** It estimates fast and pluggably. For exact counts, wrap your favourite tokenizer.
- **Not a summarizer.** It drops; it doesn't summarize. Pair with an LLM call if you want compaction-by-summarization.
- **Not a context manager.** No retrieval, no chunking, no embeddings. For RAG, see [`MukundaKatta/context-forge`](https://github.com/MukundaKatta/context-forge); use this to fit the *output* of your RAG pipeline into the budget.

## Sibling libraries

Part of the agent reliability stack — all `@mukundakatta/*` scoped, all zero-dep:

- **`@mukundakatta/agentfit`** — fit messages to budget. *Fit it.* (this)
- [`@mukundakatta/agentsnap`](https://www.npmjs.com/package/@mukundakatta/agentsnap) — snapshot tests for tool-call traces. *Test it.*
- [`@mukundakatta/agentguard`](https://www.npmjs.com/package/@mukundakatta/agentguard) — network egress firewall. *Sandbox it.*
- [`@mukundakatta/agentvet`](https://www.npmjs.com/package/@mukundakatta/agentvet) — tool-arg validator. *Vet it.*
- [`@mukundakatta/agentcast`](https://www.npmjs.com/package/@mukundakatta/agentcast) — structured output enforcer. *Validate it.*

Natural pipeline: **fit → guard → snap → vet → cast**.

## Status

v0.1.2 — bug-fix release: Anthropic / OpenAI Responses content-blocks shape now counts correctly. Core API stable. TypeScript types included. 40/40 tests, CI on Node 20/22/24.

**v0.2 plans** (post-real-world-feedback):
- Built-in tiktoken adapter as an optional separate package
- Per-tool token attribution (so you can blame which RAG chunk used the budget)
- Streaming-aware truncation (trim while streaming retrieved docs in)

## License

MIT
