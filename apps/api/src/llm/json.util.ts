import { LlmJsonParseError } from './llm-provider.interface';

/**
 * Extracts the first complete JSON value from a raw LLM response.
 *
 * LLMs frequently wrap JSON in ```json fences, add prose before/after it, or
 * emit small syntactic slips (trailing commas). We normalize fences, try a
 * straight parse, then fall back to a **balanced-brace scan** (string/escape
 * aware) that isolates the first complete object/array without being fooled by
 * braces that appear in trailing prose. A trailing-comma repair is attempted at
 * each step. Throws `LlmJsonParseError` if nothing parses.
 */
export function parseJsonFromLlm<T>(raw: string): T {
  const cleaned = stripCodeFences(raw).trim();

  // Fast path: the whole thing is valid JSON.
  const whole = tryParse<T>(cleaned);
  if (whole.ok) return whole.value;

  // Fallback: isolate the first complete JSON value and parse that.
  const sliced = sliceFirstJson(cleaned);
  if (sliced !== null) {
    const parsed = tryParse<T>(sliced);
    if (parsed.ok) return parsed.value;
  }

  throw new LlmJsonParseError('LLM response did not contain valid JSON', raw);
}

/** Parse `text`, retrying once after repairing trailing commas. */
function tryParse<T>(text: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    // fall through to the trailing-comma repair
  }
  const repaired = stripTrailingCommas(text);
  if (repaired !== text) {
    try {
      return { ok: true, value: JSON.parse(repaired) as T };
    } catch {
      // fall through to failure
    }
  }
  return { ok: false };
}

function stripCodeFences(text: string): string {
  const t = text.trim();
  // Prefer a fenced block anywhere in the text (```json … ``` or ``` … ```).
  const fence = /```(?:json|javascript|js)?\s*([\s\S]*?)```/i.exec(t);
  if (fence && fence[1].trim()) return fence[1];
  return t;
}

/** Trailing commas before a closing `}`/`]` are invalid JSON but common. */
function stripTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * Isolate the first COMPLETE JSON value (object or array) via a balanced scan
 * that respects strings and escapes, so a `}`/`]` inside a string or in trailing
 * prose never terminates the value early (a plain `lastIndexOf` would).
 */
function sliceFirstJson(text: string): string | null {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const candidates = [firstObj, firstArr].filter((i) => i >= 0);
  if (candidates.length === 0) return null;

  const start = Math.min(...candidates);
  const open = text[start];
  const close = open === '{' ? '}' : ']';

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Unbalanced (e.g. truncated output) — fall back to the widest slice.
  const end = text.lastIndexOf(close);
  return end > start ? text.slice(start, end + 1) : null;
}
