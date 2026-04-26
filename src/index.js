/**
 * agentfit — fit your messages into the LLM context window.
 *
 * Public surface:
 *   - count(input, opts?)    estimate tokens in a string or message array
 *   - fit(messages, opts)    drop messages by strategy until under maxTokens
 *   - estimators             named tokenizer estimators by model family
 *   - OverBudgetError        thrown when fit can't get under budget
 */

export { count, estimators } from './count.js';
export { fit } from './fit.js';
export { OverBudgetError } from './errors.js';
export { VERSION } from './version.js';
