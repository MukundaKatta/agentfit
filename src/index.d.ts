/**
 * agentfit — fit your messages into the LLM context window.
 *
 * Hand-maintained declarations. Source is JS (with JSDoc) so this file is
 * the single source of truth for TypeScript consumers. Keep in sync with
 * src/*.js.
 */

export const VERSION: string;

export interface Message {
  role?: string;
  content?: string;
  /** Used by strategy: 'priority'. Higher = harder to drop. Default 0. */
  priority?: number;
  /** Other fields are preserved as-is. */
  [key: string]: any;
}

export interface CountOptions {
  /** Model name, used to pick an estimator family (e.g. 'gpt-4', 'claude-sonnet-4-6'). */
  model?: string;
  /** Override the estimator. Use this to plug in tiktoken or another exact tokenizer. */
  tokenizer?: (text: string) => number;
  /** Override per-message overhead. Default depends on model family (4-6 tokens). */
  overhead?: number;
}

/**
 * Estimate tokens in a string or chat-message array. The estimate is fast,
 * dependency-free, and within ~10-20% of true tokenizer counts on English
 * prose. For exact counts pass a `tokenizer` option (e.g. wrapping tiktoken).
 */
export function count(
  input: string | Message[],
  opts?: CountOptions
): number;

/** Built-in estimator functions by model family. */
export const estimators: Readonly<{
  default: (text: string) => number;
  openai: (text: string) => number;
  anthropic: (text: string) => number;
  google: (text: string) => number;
  llama: (text: string) => number;
}>;

export type FitStrategy = 'drop-oldest' | 'drop-middle' | 'priority';

export interface FitOptions {
  /** Token budget. */
  maxTokens: number;
  /** Model name (for estimator selection). */
  model?: string;
  /** Custom tokenizer (override the estimator). */
  tokenizer?: (text: string) => number;
  /** Per-message overhead. */
  overhead?: number;
  /** Default true: never drop messages with role === 'system'. */
  preserveSystem?: boolean;
  /** Never drop the first N messages of the input array. Default 0. */
  preserveFirstN?: number;
  /** Never drop the last N messages of the input array. Default 0. */
  preserveLastN?: number;
  /** How to choose which message to drop next. Default 'drop-oldest'. */
  strategy?: FitStrategy;
  /**
   * What to do if even after dropping all non-protected messages the result
   * is still over budget. Default 'throw' (raises OverBudgetError); 'return-partial'
   * returns the over-budget result with `fit: false`.
   */
  onOverBudget?: 'throw' | 'return-partial';
}

export interface FitResult {
  /** The messages that survived. */
  messages: Message[];
  /** The messages that were dropped. */
  dropped: Message[];
  tokens: { before: number; after: number; budget: number };
  /** True iff the result is under budget. */
  fit: boolean;
}

/**
 * Drop messages from a history until they fit under maxTokens. Returns a
 * structured result; throws OverBudgetError if the budget can't be reached
 * (and onOverBudget is the default 'throw').
 */
export function fit(messages: Message[], opts: FitOptions): FitResult;

/**
 * Thrown by fit() when the budget can't be reached even after dropping all
 * non-protected messages. Carries the partial result so the caller can decide.
 */
export class OverBudgetError extends Error {
  name: 'OverBudgetError';
  messages: Message[];
  dropped: Message[];
  tokens: { before: number; after: number; budget: number };
  constructor(
    message: string,
    fittedMessages: Message[],
    dropped: Message[],
    tokens: { before: number; after: number; budget: number }
  );
}
