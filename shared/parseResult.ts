import { SummaryResultSchema, type SummaryResult } from './contract.js';

/**
 * Pulls the first balanced top-level JSON object out of a model reply.
 * Models routinely wrap JSON in ```json fences or add a sentence of preamble,
 * so we scan for a brace-balanced region rather than trusting the whole string.
 * Braces inside string literals are ignored.
 */
export function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }

  return null;
}

/** Strips leading bullets/numbering the model may add despite instructions. */
function cleanEntry(entry: string): string {
  return entry
    .replace(/^\s*(?:[-*•‣◦⁃]|\d+[.)])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toStringArray(value: unknown): string[] {
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => {
      if (typeof item === 'string') return item;
      // Some models emit [{ point: "..." }] instead of ["..."].
      if (item && typeof item === 'object') {
        const first = Object.values(item as Record<string, unknown>).find((v) => typeof v === 'string');
        return typeof first === 'string' ? first : '';
      }
      return '';
    })
    .map(cleanEntry)
    .filter((item) => item.length > 0);
}

/**
 * Parses and normalizes a raw model reply into a validated SummaryResult.
 * Returns null when the reply cannot be coerced into the contract, which the
 * caller uses to trigger a single repair retry.
 */
export function parseSummaryResult(raw: string): SummaryResult | null {
  const json = extractJsonObject(raw);
  if (!json) return null;

  let candidate: unknown;
  try {
    candidate = JSON.parse(json);
  } catch {
    return null;
  }

  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;

  const normalized = {
    summary: typeof record.summary === 'string' ? record.summary.trim() : '',
    keyPoints: toStringArray(record.keyPoints ?? record.key_points),
    improvementSuggestions: toStringArray(record.improvementSuggestions ?? record.improvement_suggestions),
  };

  const parsed = SummaryResultSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}
