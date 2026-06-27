import { LlmJsonParseError } from './llm-provider.interface';

/**
 * Extracts the first JSON object/array from a raw LLM response.
 *
 * LLMs frequently wrap JSON in ```json fences or add prose before/after it.
 * We strip fences, then fall back to slicing between the first `{`/`[` and its
 * matching last `}`/`]`. Throws `LlmJsonParseError` if nothing parses.
 */
export function parseJsonFromLlm<T>(raw: string): T {
  const cleaned = stripCodeFences(raw).trim();

  // Fast path: the whole thing is valid JSON.
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through to bracket slicing
  }

  const sliced = sliceFirstJson(cleaned);
  if (sliced !== null) {
    try {
      return JSON.parse(sliced) as T;
    } catch {
      // fall through to error
    }
  }

  throw new LlmJsonParseError(
    'LLM response did not contain valid JSON',
    raw,
  );
}

function stripCodeFences(text: string): string {
  // ```json ... ``` or ``` ... ```
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;
  const match = text.trim().match(fence);
  return match ? match[1] : text;
}

function sliceFirstJson(text: string): string | null {
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const candidates = [firstObj, firstArr].filter((i) => i >= 0);
  if (candidates.length === 0) return null;

  const start = Math.min(...candidates);
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  const end = text.lastIndexOf(close);
  if (end <= start) return null;

  return text.slice(start, end + 1);
}
