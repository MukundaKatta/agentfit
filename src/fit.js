import { count, resolveTokenizer } from './count.js';
import { OverBudgetError } from './errors.js';

/**
 * Drop messages from a history until they fit under maxTokens.
 *
 * Returns a result object:
 *   { messages, dropped, tokens: { before, after, budget }, fit: boolean }
 *
 * If `fit` is true, the returned messages are under budget. If false (and
 * onOverBudget !== 'throw'), the budget couldn't be reached even after
 * dropping all non-protected messages — the partial result is returned so
 * the caller can decide.
 *
 * Throws OverBudgetError when onOverBudget === 'throw' (default) and the
 * budget couldn't be reached.
 *
 * @param {Message[]} messages
 * @param {FitOptions} opts
 * @returns {FitResult}
 */
export function fit(messages, opts) {
  if (!Array.isArray(messages)) {
    throw new TypeError('fit: messages must be an array');
  }
  if (!opts || typeof opts !== 'object') {
    throw new TypeError('fit: opts must be an object');
  }
  if (typeof opts.maxTokens !== 'number' || opts.maxTokens < 0) {
    throw new TypeError('fit: opts.maxTokens must be a non-negative number');
  }

  const strategy = opts.strategy ?? 'drop-oldest';
  if (strategy !== 'drop-oldest' && strategy !== 'drop-middle' && strategy !== 'priority') {
    throw new TypeError(`fit: unknown strategy '${strategy}' (expected 'drop-oldest', 'drop-middle', or 'priority')`);
  }
  const onOverBudget = opts.onOverBudget ?? 'throw';
  if (onOverBudget !== 'throw' && onOverBudget !== 'return-partial') {
    throw new TypeError(`fit: unknown onOverBudget '${onOverBudget}' (expected 'throw' or 'return-partial')`);
  }

  const config = {
    maxTokens: opts.maxTokens,
    model: opts.model,
    tokenizer: opts.tokenizer,
    overhead: opts.overhead,
    preserveSystem: opts.preserveSystem !== false, // default true
    preserveFirstN: Math.max(0, opts.preserveFirstN ?? 0),
    preserveLastN: Math.max(0, opts.preserveLastN ?? 0),
    strategy,
    onOverBudget,
  };

  const countOpts = { model: config.model, tokenizer: config.tokenizer, overhead: config.overhead };
  const tokenizer = resolveTokenizer(countOpts);
  const overhead =
    typeof countOpts.overhead === 'number' ? countOpts.overhead : count('', countOpts) === 0
      ? 4
      : 4; // default; we use messageOverheadFor under the hood inside count()

  // Tag every message with its original index, token cost, and protected flag.
  const tagged = messages.map((msg, i) => ({
    msg,
    originalIndex: i,
    protected: isProtected(msg, i, messages.length, config),
    tokens: messageTokens(msg, tokenizer, countOpts),
  }));

  const totalBefore = tagged.reduce((sum, t) => sum + t.tokens, 0);

  if (totalBefore <= config.maxTokens) {
    return {
      messages: messages.slice(),
      dropped: [],
      tokens: { before: totalBefore, after: totalBefore, budget: config.maxTokens },
      fit: true,
    };
  }

  let kept;
  switch (config.strategy) {
    case 'drop-oldest':
      kept = applyDropOldest(tagged, config);
      break;
    case 'drop-middle':
      kept = applyDropMiddle(tagged, config);
      break;
    case 'priority':
      kept = applyDropByPriority(tagged, config);
      break;
    default:
      throw new TypeError(`fit: unknown strategy '${config.strategy}'`);
  }

  const keptOriginalIndices = new Set(kept.map((t) => t.originalIndex));
  const finalMessages = kept.map((t) => t.msg);
  const droppedMessages = tagged.filter((t) => !keptOriginalIndices.has(t.originalIndex)).map((t) => t.msg);
  const totalAfter = kept.reduce((sum, t) => sum + t.tokens, 0);
  const fit = totalAfter <= config.maxTokens;

  const tokens = { before: totalBefore, after: totalAfter, budget: config.maxTokens };
  const result = { messages: finalMessages, dropped: droppedMessages, tokens, fit };

  if (!fit && config.onOverBudget === 'throw') {
    throw new OverBudgetError(
      `agentfit: cannot fit messages under ${config.maxTokens} tokens. ` +
        `${totalAfter} remain after dropping ${droppedMessages.length} non-protected messages.`,
      finalMessages,
      droppedMessages,
      tokens
    );
  }

  return result;
}

function isProtected(msg, index, totalCount, config) {
  if (config.preserveSystem && msg && msg.role === 'system') return true;
  if (index < config.preserveFirstN) return true;
  if (index >= totalCount - config.preserveLastN) return true;
  return false;
}

function messageTokens(msg, tokenizer, countOpts) {
  if (!msg || typeof msg !== 'object') return 0;
  const content = typeof msg.content === 'string' ? msg.content : '';
  const role = typeof msg.role === 'string' ? msg.role : '';
  // Use count() so per-message overhead resolution stays consistent
  return count([{ role, content }], countOpts);
}

// --- strategies ---

function applyDropOldest(tagged, config) {
  // Drop in original order: first non-protected message gets dropped first.
  const kept = tagged.slice();
  let sum = kept.reduce((s, t) => s + t.tokens, 0);
  while (sum > config.maxTokens) {
    const idx = kept.findIndex((t) => !t.protected);
    if (idx === -1) break;
    sum -= kept[idx].tokens;
    kept.splice(idx, 1);
  }
  return kept;
}

function applyDropMiddle(tagged, config) {
  // Drop from the middle outward — preserves the start (system + early context)
  // and the recent tail (recency).
  const kept = tagged.slice();
  let sum = kept.reduce((s, t) => s + t.tokens, 0);
  while (sum > config.maxTokens) {
    // Find the non-protected message closest to the middle of the current array.
    let bestIdx = -1;
    let bestDist = Infinity;
    const middle = (kept.length - 1) / 2;
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].protected) continue;
      const dist = Math.abs(i - middle);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    sum -= kept[bestIdx].tokens;
    kept.splice(bestIdx, 1);
  }
  return kept;
}

function applyDropByPriority(tagged, config) {
  // Drop lowest-priority messages first. Priority comes from msg.priority
  // (default 0; protected messages effectively have priority +Infinity).
  // Among equal priorities, drop oldest first (stable behaviour).
  const kept = tagged.slice();
  let sum = kept.reduce((s, t) => s + t.tokens, 0);
  while (sum > config.maxTokens) {
    let bestIdx = -1;
    let bestPrio = Infinity;
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].protected) continue;
      const prio = typeof kept[i].msg.priority === 'number' ? kept[i].msg.priority : 0;
      if (prio < bestPrio) {
        bestPrio = prio;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    sum -= kept[bestIdx].tokens;
    kept.splice(bestIdx, 1);
  }
  return kept;
}

/**
 * @typedef {{ role?: string, content?: string, priority?: number }} Message
 */

/**
 * @typedef {Object} FitOptions
 * @property {number} maxTokens                 token budget
 * @property {string} [model]                   for picking an estimator and per-message overhead
 * @property {(text: string) => number} [tokenizer]  override estimator (e.g. wrap tiktoken)
 * @property {number} [overhead]                override per-message overhead
 * @property {boolean} [preserveSystem=true]    never drop system messages
 * @property {number} [preserveFirstN=0]        never drop the first N messages
 * @property {number} [preserveLastN=0]         never drop the last N messages
 * @property {'drop-oldest' | 'drop-middle' | 'priority'} [strategy='drop-oldest']
 * @property {'throw' | 'return-partial'} [onOverBudget='throw']
 */

/**
 * @typedef {Object} FitResult
 * @property {Message[]} messages   the messages that survived
 * @property {Message[]} dropped    the messages that were removed
 * @property {{ before: number, after: number, budget: number }} tokens
 * @property {boolean} fit          true iff `after <= budget`
 */
