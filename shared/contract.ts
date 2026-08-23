import { z } from 'zod';
import { toStrictJsonSchema } from './jsonSchema.js';

/** The three summary depths a user can pick in the UI. */
export const SUMMARY_LENGTHS = ['short', 'medium', 'long'] as const;
export type SummaryLength = (typeof SUMMARY_LENGTHS)[number];

/** Hard cap on how much document text we forward to the model, in characters. */
export const MAX_TEXT_CHARS = 60_000;
/** Below this, the extraction is almost certainly empty or failed. */
export const MIN_TEXT_CHARS = 40;

/** Per-length shaping, used both to build the prompt and to validate the reply. */
export const LENGTH_SPECS: Record<
  SummaryLength,
  { label: string; sentences: string; keyPoints: [number, number]; suggestions: [number, number] }
> = {
  short: { label: 'Short', sentences: '2-3 sentences', keyPoints: [3, 5], suggestions: [2, 3] },
  medium: { label: 'Medium', sentences: '5-7 sentences in 1-2 paragraphs', keyPoints: [5, 7], suggestions: [3, 4] },
  long: { label: 'Long', sentences: '10-14 sentences across 3-4 paragraphs', keyPoints: [7, 10], suggestions: [4, 6] },
};

/** What the client sends to POST /api/summarize. */
export const SummarizeRequestSchema = z.object({
  text: z.string().min(MIN_TEXT_CHARS, 'Document text is too short to summarize.').max(MAX_TEXT_CHARS),
  length: z.enum(SUMMARY_LENGTHS),
  fileName: z.string().max(300).optional(),
});
export type SummarizeRequest = z.infer<typeof SummarizeRequestSchema>;

/** The JSON contract the model must return. Anything else is treated as malformed. */
export const SummaryResultSchema = z.object({
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  improvementSuggestions: z.array(z.string().min(1)).min(1),
});
export type SummaryResult = z.infer<typeof SummaryResultSchema>;

/**
 * The contract as a JSON Schema, used to constrain generation at the provider.
 * Derived from the zod schema above so the two can never drift apart.
 */
export const SUMMARY_RESULT_JSON_SCHEMA = toStrictJsonSchema(z.toJSONSchema(SummaryResultSchema));

/** Shape of every non-2xx response from the API. */
export interface ApiError {
  error: string;
  code: ErrorCode;
}

export type ErrorCode =
  | 'invalid_request'
  | 'not_configured'
  | 'provider_error'
  | 'malformed_response'
  | 'rate_limited'
  | 'internal_error';
