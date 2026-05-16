<!--
Thanks for sending a PR to agentfit.

Quick reminders before you submit:
  - Zero runtime dependencies. A PR that adds one will be sent back to discussion first.
  - fit() must NEVER return a result that exceeds maxTokens under any built-in estimator.
  - Strategies must NEVER drop a priority-1 message.
  - Tests live in test/ and run via `npm test`. Add an adversarial case for any new strategy or estimator.
-->

## What this changes

A one-line summary, then a short paragraph if needed.

## Why

The user-visible bug or workflow gap this addresses.

## Type of change

- [ ] Bug fix in `count()` / `fit()` / a strategy / an estimator
- [ ] New strategy
- [ ] New estimator
- [ ] CLI fix
- [ ] Numerical / overflow edge case
- [ ] Test coverage
- [ ] Documentation
- [ ] CI / build / release plumbing

## Security review

- [ ] If this touches `fit()`, the output array's `count()` is verified ≤ `maxTokens` for at least one new adversarial test case.
- [ ] If this touches the priority strategy, at least one new test asserts `priority: 1` messages are preserved under tie / overflow / single-oversized-message conditions.
- [ ] If this adds a new estimator, it returns a non-negative finite integer for every input the test suite exercises.

## Scope check

- [ ] No new runtime dependencies added (enforced by CI).
- [ ] If this changes the threat-model surface, `SECURITY.md` was updated in the same PR.

## Validation

- [ ] `npm run test:all` passes locally (unit + examples)
- [ ] `npm run test:coverage` still meets the configured thresholds (75% branches / 85% lines+functions+statements)
- [ ] Public API changes are reflected in `src/index.d.ts`

## Linked issue

Closes #
