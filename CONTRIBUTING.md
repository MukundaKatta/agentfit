# Contributing to agentfit

Small, focused PRs welcome. Bigger design changes — open an issue first so
we can sanity-check direction before you build.

## Setup

```sh
gh repo clone MukundaKatta/agentfit
cd agentfit
npm install
```

## Run

```sh
npm test                 # 40 tests via Node's built-in runner
npm run test:coverage    # gates at 75% branches / 85% lines+funcs+stmts
npm run test:examples    # runs example snippets so they don't rot
```

If you're touching token counting, add a regression test in
`test/count.test.js`. If you're touching truncation strategies, add one in
`test/fit.test.js`.

## Style

- Plain ESM, zero runtime dependencies. `tiktoken` and friends stay
  pluggable via `opts.tokenizer`, never as a hard import.
- One PR = one focused change.

## Releases

This repo uses semver. `0.1.x` is patch releases (bug fixes, no API change).
Cutting `0.2.0` requires a migration note in the README.
