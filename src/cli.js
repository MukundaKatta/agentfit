#!/usr/bin/env node
/**
 * agentfit CLI — token counting + message-window fitting from the terminal.
 *
 * Subcommands:
 *   agentfit count <text|file|-> [--model X] [--pretty]
 *   agentfit fit <messages.json|-> --max-tokens N [--model X]
 *                [--strategy drop-oldest|drop-middle|priority]
 *                [--preserve-system|--no-preserve-system]
 *                [--preserve-last-n N] [--preserve-first-n N]
 *                [--pretty]
 *
 * Conventions shared across the @mukundakatta agent CLIs:
 *   - `-` reads stdin
 *   - JSON to stdout for machine consumers; --pretty for humans
 *   - exit 0 on success, 1 on parse/validation failure, 2 on usage error
 */

import { readFileSync, existsSync } from 'node:fs';

import { count } from './count.js';
import { fit } from './fit.js';
import { OverBudgetError } from './errors.js';
import { VERSION } from './version.js';

const USAGE = `agentfit v${VERSION} — fit messages into the LLM context window.

Usage:
  agentfit count <text|file|->  [--model NAME] [--pretty]
  agentfit fit   <messages.json|->  --max-tokens N
                 [--model NAME]
                 [--strategy drop-oldest|drop-middle|priority]
                 [--preserve-system | --no-preserve-system]
                 [--preserve-first-n N] [--preserve-last-n N]
                 [--on-over-budget throw|return-partial]
                 [--pretty]
  agentfit --help | --version

Notes:
  Pass '-' as the input to read from stdin.
  count emits {"tokens": N, "model": "..."}.
  fit emits the result of the fit() API as JSON.
  Exit codes: 0 ok, 1 over-budget / parse failure, 2 usage error.
`;

// --- main ---

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(USAGE);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    process.stdout.write(VERSION + '\n');
    return 0;
  }

  const sub = argv[0];
  const rest = argv.slice(1);
  try {
    if (sub === 'count') return await runCount(rest);
    if (sub === 'fit') return await runFit(rest);
    process.stderr.write(`agentfit: unknown subcommand '${sub}'\n\n${USAGE}`);
    return 2;
  } catch (err) {
    return reportError(err);
  }
}

// --- count ---

async function runCount(args) {
  const flags = parseFlags(args, {
    string: ['model'],
    boolean: ['pretty'],
  });
  if (flags._.length === 0) {
    process.stderr.write('agentfit count: missing <text|file|-> argument\n');
    return 2;
  }
  const input = await resolveInput(flags._[0]);

  // The user might pass a JSON message array; if it parses, count it that way.
  // Otherwise treat the input as a raw string.
  const target = tryParseMessages(input) ?? input;
  const tokens = count(target, { model: flags.model });

  emit({ tokens, model: flags.model ?? null }, flags.pretty);
  return 0;
}

// --- fit ---

async function runFit(args) {
  const flags = parseFlags(args, {
    string: ['model', 'strategy', 'on-over-budget'],
    number: ['max-tokens', 'preserve-first-n', 'preserve-last-n'],
    boolean: ['pretty', 'preserve-system', 'no-preserve-system'],
  });
  if (flags._.length === 0) {
    process.stderr.write('agentfit fit: missing <messages.json|-> argument\n');
    return 2;
  }
  if (flags['max-tokens'] == null) {
    process.stderr.write('agentfit fit: --max-tokens is required\n');
    return 2;
  }

  const raw = await resolveInput(flags._[0]);
  let messages;
  try {
    messages = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`agentfit fit: messages input is not valid JSON: ${err.message}\n`);
    return 1;
  }
  if (!Array.isArray(messages)) {
    process.stderr.write('agentfit fit: messages input must be a JSON array\n');
    return 1;
  }

  const opts = {
    maxTokens: flags['max-tokens'],
    model: flags.model,
    strategy: flags.strategy,
    preserveFirstN: flags['preserve-first-n'],
    preserveLastN: flags['preserve-last-n'],
    onOverBudget: flags['on-over-budget'] ?? 'return-partial',
  };
  // --no-preserve-system overrides --preserve-system; default (undefined) lets fit() use its true default.
  if (flags['no-preserve-system']) opts.preserveSystem = false;
  else if (flags['preserve-system']) opts.preserveSystem = true;

  // Strip undefined so we honour fit()'s defaults instead of overriding them with undefined.
  for (const key of Object.keys(opts)) if (opts[key] === undefined) delete opts[key];

  let result;
  try {
    result = fit(messages, opts);
  } catch (err) {
    if (err instanceof OverBudgetError) {
      // Surface the partial result to stdout (so pipelines can still inspect it),
      // but exit non-zero so CI knows it failed.
      emit(
        { fit: false, error: err.message, messages: err.messages, dropped: err.dropped, tokens: err.tokens },
        flags.pretty
      );
      return 1;
    }
    throw err;
  }
  emit(result, flags.pretty);
  return result.fit ? 0 : 1;
}

// --- helpers ---

/**
 * Read the input arg as either '-' (stdin), a file path, or a literal string.
 *
 * Files are detected by existsSync; everything else is treated as a literal so
 * `agentfit count "hello world"` works the same way the docs say.
 */
async function resolveInput(arg) {
  if (arg === '-') return await readStdin();
  if (existsSync(arg)) return readFileSync(arg, 'utf8');
  return arg;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function tryParseMessages(text) {
  try {
    const v = JSON.parse(text);
    if (Array.isArray(v) && v.every((m) => m && typeof m === 'object')) return v;
    return null;
  } catch {
    return null;
  }
}

/**
 * Tiny argv parser. Zero-dep on purpose; matches the conventions:
 *   --flag           boolean true
 *   --flag value     string / number value
 *   --flag=value     same as above
 *   positional args  collected in flags._
 */
function parseFlags(argv, schema) {
  const flags = { _: [] };
  for (const name of schema.boolean ?? []) flags[name] = false;
  for (const name of schema.string ?? []) flags[name] = undefined;
  for (const name of schema.number ?? []) flags[name] = undefined;

  const wantsValue = new Set([...(schema.string ?? []), ...(schema.number ?? [])]);
  const numberSet = new Set(schema.number ?? []);

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--') {
      flags._.push(...argv.slice(i + 1));
      break;
    }
    if (tok.startsWith('--')) {
      const eq = tok.indexOf('=');
      const name = eq === -1 ? tok.slice(2) : tok.slice(2, eq);
      const inlineValue = eq === -1 ? null : tok.slice(eq + 1);

      if (wantsValue.has(name)) {
        const raw = inlineValue ?? argv[++i];
        if (raw === undefined) {
          throw new UsageError(`flag --${name} requires a value`);
        }
        if (numberSet.has(name)) {
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new UsageError(`flag --${name} expects a number, got ${raw}`);
          flags[name] = n;
        } else {
          flags[name] = raw;
        }
      } else if ((schema.boolean ?? []).includes(name)) {
        flags[name] = true;
      } else {
        throw new UsageError(`unknown flag --${name}`);
      }
    } else {
      flags._.push(tok);
    }
  }
  return flags;
}

function emit(value, pretty) {
  const json = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  process.stdout.write(json + '\n');
}

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = 2;
  }
}

function reportError(err) {
  if (err && err.name === 'UsageError') {
    process.stderr.write(`agentfit: ${err.message}\n`);
    return 2;
  }
  process.stderr.write(`agentfit: ${err?.message ?? err}\n`);
  return 1;
}

// Run when invoked as a script (the bin entry).
const isMain =
  process.argv[1] && (process.argv[1].endsWith('cli.js') || process.argv[1].endsWith('agentfit'));
if (isMain) {
  main().then(
    (code) => process.exit(code ?? 0),
    (err) => {
      process.stderr.write(`agentfit: ${err?.stack ?? err}\n`);
      process.exit(1);
    }
  );
}
