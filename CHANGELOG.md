# Changelog

## [0.1.2] — 2026-04-28

### Fixed
- **`count()` and `messageTokens()` now walk the array `content` shape**
  used by the Anthropic Messages API and the OpenAI Responses API, instead
  of silently coercing it to `''` and returning 0 tokens. Real-world impact
  for anyone using the new SDK shapes: token budgets were undercounted by
  the entire body of every message that used content blocks. Agents would
  cheerfully send 200K-token prompts to a 32K-token model.

### Added
- New exported `stringifyContent(content)` helper — walks
  `text` / `tool_use` / `tool_result` / `input_text` / `output_text`
  blocks, recurses on nested `tool_result.content`, skips `image`
  / `document` blocks (no plain text). Use it directly when you need
  the same flattening for custom overhead math.
- 5 regression tests covering parity with strings, tool_use carrying
  input JSON, tool_result recursion, image-skip, OpenAI Responses
  API input_text/output_text shapes.
- `c8` coverage tooling: `npm run test:coverage` reports per-file coverage
  and gates the build at 75% branches / 85% lines+functions+statements.
  Current coverage: 89% lines, 84% branches.
- `CHANGELOG.md`, `CONTRIBUTING.md`.

## [0.1.1] — 2026-04-25

Initial published release. Core API: `count`, `fit`, `OverBudgetError`,
plus a CLI for ad-hoc usage. TypeScript types. CI matrix on Node 20/22/24.

## [0.1.0]

Initial commit / pre-release placeholder.
