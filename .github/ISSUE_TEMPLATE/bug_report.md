---
name: Bug report (non-security)
about: count() over/under-estimates, a strategy drops the wrong messages, the CLI misbehaves. Not for budget-overshoot or priority-1-drop reports.
title: "[bug] "
labels: bug
assignees: ''
---

> ⚠ **Found a case where fit() returned a result that exceeds maxTokens, or where it dropped a priority-1 message?** Stop. Use [GitHub's private vulnerability reporting](https://github.com/MukundaKatta/agentfit/security/advisories/new) instead of this template. See `SECURITY.md`.

## What happened

A clear, concise description of the actual behavior.

## What you expected

A clear, concise description of what should have happened.

## Reproduction

Minimal repro using only this library:

```js
import { count, fit, OverBudgetError } from '@mukundakatta/agentfit';

const messages = [
  { role: 'system', content: '...', priority: 1 },
  { role: 'user',   content: '...' },
  // ...
];

const result = fit(messages, {
  maxTokens: 8000,
  strategy: 'drop-middle',
  // estimator: ...
});

console.log('result length:', result.length);
console.log('result tokens:', count(result));
// observed: ...
// expected: ...
```

If this is a **count accuracy** issue (estimator drifts more than the documented ±N%), please include:

- The exact string you fed to `count()` (or a byte-identical anonymized version).
- The estimator you used.
- What the provider's official tokenizer (`tiktoken` for OpenAI, Anthropic's count-tokens endpoint) returned for comparison.

## Environment

- agentfit version: (`npm ls @mukundakatta/agentfit`)
- Node version: (`node --version` — agentfit requires Node 20+)
- OS: (macOS 14 / Ubuntu 22.04 / Windows 11)
- Provider you're targeting: (OpenAI / Anthropic / Bedrock / Groq / local)

## Notes

Anything else — whether you passed a custom estimator, whether the messages array had `priority` set on any entries, whether the failing input is reproducible from a single short message or only with a large array.
