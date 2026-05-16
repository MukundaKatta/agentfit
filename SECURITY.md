# Security Policy

## Supported Versions

agentfit is at v0.1.x. Security fixes will be issued for the current minor (0.1.x). Older minors will not receive backports.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Use [GitHub's private vulnerability reporting](https://github.com/MukundaKatta/agentfit/security/advisories/new) or email `mukunda.vjcs6@gmail.com` with subject `[agentfit security]`. Include:

- A description of the vulnerability and its impact.
- The version of agentfit affected (`npm ls @mukundakatta/agentfit`).
- Reproduction steps or a minimal proof-of-concept (a `messages` array + a `maxTokens` budget that exposes the issue is usually enough).
- Any suggested mitigation, if you have one.

You can expect:

- An acknowledgment within 5 business days.
- A status update within 14 days.
- A coordinated disclosure window of at most 90 days from the acknowledgment.

## Specific Risk Surfaces

agentfit estimates token counts and drops messages from a list to fit a budget. It runs entirely in the caller's process. Areas worth special attention:

- **Silent budget overshoot.** The whole job of `fit()` is "result fits in `maxTokens`." If you find a `messages + opts` combination where `fit()` returns successfully but the resulting array exceeds the budget under any built-in estimator, that's a high-severity report.
- **Priority-1 message drop.** The priority strategy must never drop messages tagged with `priority: 1`. If you find an input where it does (interaction with other strategies, ties, integer overflow on huge inputs), please report.
- **Estimator drift bypass.** Estimators are caller-pluggable. If a maliciously crafted estimator (returning negative, `NaN`, `Infinity`, or non-numeric token counts) can cause `fit()` to silently keep messages that would overshoot the real budget, that's a real issue.
- **Catastrophic regex backtracking in `count()`.** The default estimator uses heuristic regex passes. If you find a message string (long bracket runs, repeated unicode escapes, RTL-override sequences, etc.) that drives `count()` into super-linear time, please report.
- **Integer overflow on very long message arrays.** Token counts get summed. If a 10M-element array can drive the running sum past `Number.MAX_SAFE_INTEGER` and silently break the budget check, that's worth reporting.
- **CLI argument handling.** The bundled CLI parses caller args. Any path where a flag value lets `count()` or `fit()` be tricked into reading from the filesystem or executing arbitrary code is a real issue.

## Out of scope

- **Exact token-for-token agreement with the provider's tokenizer.** agentfit ships estimators, not tokenizers. The defaults are documented as "approximate to ±N%"; if you need exact agreement, plug in `tiktoken` / Anthropic's tokenizer via the estimator hook. A few-percent drift is by design.
- **LLM API call execution.** agentfit doesn't call any provider; it shapes the array you'll pass to one. If your secrets are leaking, that's a transport issue, not an agentfit issue.
- **Message content correctness.** Whatever the caller passes through, agentfit passes through (subject to the budget). It doesn't redact, summarize, or otherwise mutate content.

## Dependencies

agentfit has **zero** runtime dependencies, by design. The only dev dependency is `c8` for coverage. Any future addition is reviewed for security impact and dependency confusion risk.

We will not pay bug bounties at this time.
