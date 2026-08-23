import { SummaryResultSchema, type ApiError, type SummarizeRequest, type SummaryResult } from '../../shared/contract';

/** Thrown for any non-2xx or unreadable response from /api/summarize. */
export class SummarizeError extends Error {
  constructor(
    message: string,
    readonly code: ApiError['code'],
  ) {
    super(message);
    this.name = 'SummarizeError';
  }
}

export async function requestSummary(
  payload: SummarizeRequest,
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<SummaryResult> {
  let response: Response;
  try {
    response = await fetchImpl('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new SummarizeError('Could not reach the summarization service. Check your connection and try again.', 'provider_error');
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = body as ApiError | null;
    throw new SummarizeError(
      apiError?.error ?? `The summarization service failed (HTTP ${response.status}).`,
      apiError?.code ?? 'internal_error',
    );
  }

  const parsed = SummaryResultSchema.safeParse(body);
  if (!parsed.success) {
    throw new SummarizeError('The summarization service returned an unexpected response.', 'malformed_response');
  }

  return parsed.data;
}
