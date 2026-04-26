/**
 * Token estimation — fast, dependency-free heuristics tuned per model family.
 *
 * These are ESTIMATES, not exact tokenizer counts. For agent budgeting they
 * are usually within 10-20% of the truth, which is fine for "fit under N
 * tokens with a small safety margin." For exact counts, plug in tiktoken or
 * @anthropic-ai/tokenizer via the `tokenizer` option.
 *
 * Calibration sources:
 *   - OpenAI (cl100k_base / GPT-4): ~4 chars per token on English prose
 *   - Anthropic (Claude): ~3.5 chars per token (slightly smaller pieces)
 *   - Google (Gemini): ~4 chars per token
 *   - Llama / Mistral: ~4 chars per token
 *
 * Per-message overhead approximates the role + separator tokens each model
 * adds when serializing a chat-format request.
 */

/**
 * Built-in estimators by family. Each takes a string and returns an integer.
 */
export const estimators = Object.freeze({
  default: (text) => Math.ceil(text.length / 4),
  openai: (text) => Math.ceil(text.length / 4),
  anthropic: (text) => Math.ceil(text.length / 3.5),
  google: (text) => Math.ceil(text.length / 4),
  llama: (text) => Math.ceil(text.length / 4),
});

const MESSAGE_OVERHEAD = {
  default: 4,
  openai: 4,
  anthropic: 6,
  google: 4,
  llama: 3,
};

/**
 * Count tokens in a string or in an array of chat messages.
 *
 * @param {string | { role?: string, content?: string }[]} input
 * @param {{ model?: string, tokenizer?: (text: string) => number, overhead?: number }} [opts]
 * @returns {number}
 */
export function count(input, opts = {}) {
  if (input === null || input === undefined) {
    throw new TypeError('count: input must be a string or array of messages');
  }
  const tokenizer = resolveTokenizer(opts);
  const overhead = opts.overhead ?? messageOverheadFor(opts.model);

  if (typeof input === 'string') return tokenizer(input);

  if (Array.isArray(input)) {
    let total = 0;
    for (const msg of input) {
      if (msg && typeof msg === 'object') {
        const content = typeof msg.content === 'string' ? msg.content : '';
        const role = typeof msg.role === 'string' ? msg.role : '';
        total += tokenizer(content) + (role ? tokenizer(role) : 0) + overhead;
      }
    }
    return total;
  }

  throw new TypeError('count: input must be a string or array of messages');
}

/**
 * Resolve which estimator function to use, in priority order:
 *   1. opts.tokenizer (user-supplied, e.g. tiktoken adapter)
 *   2. estimator named for opts.model's family
 *   3. estimators.default
 *
 * Exposed so adapters (drop strategies, examples) can reuse the same logic.
 */
export function resolveTokenizer(opts = {}) {
  if (typeof opts.tokenizer === 'function') return opts.tokenizer;
  return estimatorFor(opts.model);
}

function estimatorFor(model) {
  const fam = familyOf(model);
  return estimators[fam] ?? estimators.default;
}

function messageOverheadFor(model) {
  const fam = familyOf(model);
  return MESSAGE_OVERHEAD[fam] ?? MESSAGE_OVERHEAD.default;
}

function familyOf(model) {
  if (typeof model !== 'string' || !model) return 'default';
  const m = model.toLowerCase();
  if (m.includes('claude') || m.startsWith('anthropic')) return 'anthropic';
  if (m.includes('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.startsWith('openai')) {
    return 'openai';
  }
  if (m.includes('gemini') || m.includes('palm') || m.startsWith('google')) return 'google';
  if (m.includes('llama') || m.includes('mistral') || m.includes('mixtral')) return 'llama';
  return 'default';
}
