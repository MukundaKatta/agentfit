/**
 * OverBudgetError — thrown by fit() when it cannot drop enough messages to
 * get under maxTokens (because all remaining messages are protected by
 * preserveSystem / preserveFirstN / preserveLastN).
 *
 * Carries the partial result so the caller can decide whether to use it
 * anyway, truncate further, or surface the error to the user:
 *   - messages:  the partially-fitted message array (still over budget)
 *   - dropped:   messages that were dropped before giving up
 *   - tokens:    { before, after, budget } counts
 */
export class OverBudgetError extends Error {
  /**
   * @param {string} message
   * @param {Array} fittedMessages
   * @param {Array} dropped
   * @param {{ before: number, after: number, budget: number }} tokens
   */
  constructor(message, fittedMessages, dropped, tokens) {
    super(message);
    this.name = 'OverBudgetError';
    this.messages = fittedMessages;
    this.dropped = dropped;
    this.tokens = tokens;
  }
}
