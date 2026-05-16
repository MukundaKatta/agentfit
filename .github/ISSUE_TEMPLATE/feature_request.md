---
name: Feature request
about: Propose a new strategy, a new estimator, or a behavior change.
title: "[feat] "
labels: enhancement
assignees: ''
---

## Scope check

Before opening, please confirm this proposal fits the project scope:

- [ ] It does **not** add a runtime dependency. (Zero deps is a hard line; even `tiktoken` is plugged in via the estimator hook, not depended on.)
- [ ] It does **not** call any provider tokenizer over the network. (Estimators must be pure and offline.)
- [ ] It does **not** weaken the priority-1 guarantee. (Strategies must never drop a `priority: 1` message under any input.)

If any of those are unchecked, the right home is probably a separate package that depends on agentfit.

## What you want

A clear description of the proposed feature.

## Why

What real-world context-window workflow does this address? Concrete example of the messages shape that would benefit.

## Proposed API shape

```jsonc
// new strategy, estimator, or option:
// signature:
// behavior at edge cases (empty array, single oversized message, all priority-1, etc.):
```

## Threat-model impact

Does this change the surfaces in `SECURITY.md`?

- [ ] No — orthogonal feature, no new overshoot or drop surface.
- [ ] Yes — and here is what I'd add to SECURITY.md: ...

## Alternatives considered

What workarounds exist today (manual `.slice()`, hand-rolled estimator, langchain's `truncate`) and why aren't they good enough?
