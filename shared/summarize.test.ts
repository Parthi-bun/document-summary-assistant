import { describe, expect, it, vi } from 'vitest';
import { MIN_TEXT_CHARS, type ApiError, type SummaryResult } from './contract.js';
import { handleSummarize } from './summarize.js';

const TEXT = 'A'.repeat(MIN_TEXT_CHARS + 10);
const ENV = { LLM_API_KEY: 'test-key', LLM_MODEL: 'test-model' } as NodeJS.ProcessEnv;

const RESULT: SummaryResult = {
  summary: 'A short report.',
  keyPoints: ['Point one.'],
  improvementSuggestions: ['Add sources.'],
};

/** Builds a fetch stub that replies with the given assistant contents in order. */
function fetchReturning(...contents: string[]) {
  let call = 0;
  return vi.fn(() => {
    const content = contents[Math.min(call, contents.length - 1)];
    call += 1;
    return Promise.resolve(
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
}

function fetchFailing(status: number, body = '') {
  return vi.fn(() => Promise.resolve(new Response(body, { status })));
}

describe('handleSummarize', () => {
  it('returns a validated result on the happy path', async () => {
    const response = await handleSummarize(
      { text: TEXT, length: 'medium', fileName: 'a.pdf' },
      { env: ENV, fetchImpl: fetchReturning(JSON.stringify(RESULT)) },
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(RESULT);
  });

  it('sends the selected length and model to the provider', async () => {
    const fetchImpl = fetchReturning(JSON.stringify(RESULT));
    await handleSummarize({ text: TEXT, length: 'long' }, { env: ENV, fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(init.body as string) as { model: string; messages: { content: string }[] };

    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(payload.model).toBe('test-model');
    expect(payload.messages[1].content).toContain('LONG analysis');
  });

  it('rejects a request whose text is too short', async () => {
    const response = await handleSummarize({ text: 'too short', length: 'short' }, { env: ENV });

    expect(response.status).toBe(400);
    expect((response.body as ApiError).code).toBe('invalid_request');
  });

  it('rejects an unknown summary length', async () => {
    const response = await handleSummarize({ text: TEXT, length: 'enormous' }, { env: ENV });
    expect(response.status).toBe(400);
  });

  it('returns an explicit configuration error and never a fabricated summary', async () => {
    const fetchImpl = fetchReturning(JSON.stringify(RESULT));
    const response = await handleSummarize({ text: TEXT, length: 'short' }, { env: {}, fetchImpl });

    expect(response.status).toBe(503);
    expect((response.body as ApiError).code).toBe('not_configured');
    expect((response.body as ApiError).error).toMatch(/LLM_API_KEY/);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.body).not.toHaveProperty('summary');
  });

  it('retries once when the first reply is malformed, then succeeds', async () => {
    const fetchImpl = fetchReturning('Sorry, I cannot do that.', JSON.stringify(RESULT));
    const response = await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(RESULT);
  });

  it('gives up with a malformed_response error after the retry also fails', async () => {
    const fetchImpl = fetchReturning('nope', 'still nope');
    const response = await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(502);
    expect((response.body as ApiError).code).toBe('malformed_response');
  });

  it('maps an auth failure to an actionable message', async () => {
    const response = await handleSummarize(
      { text: TEXT, length: 'short' },
      { env: ENV, fetchImpl: fetchFailing(401) },
    );

    expect(response.status).toBe(502);
    expect((response.body as ApiError).code).toBe('provider_error');
    expect((response.body as ApiError).error).toMatch(/rejected the API key/);
  });

  it('surfaces rate limiting as 429', async () => {
    const response = await handleSummarize(
      { text: TEXT, length: 'short' },
      { env: ENV, fetchImpl: fetchFailing(429) },
    );

    expect(response.status).toBe(429);
    expect((response.body as ApiError).code).toBe('rate_limited');
  });

  it('reports an unreachable provider instead of throwing', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const response = await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });

    expect(response.status).toBe(502);
    expect((response.body as ApiError).error).toMatch(/Could not reach the AI provider/);
  });

  it('honours a custom OpenAI-compatible base URL', async () => {
    const fetchImpl = fetchReturning(JSON.stringify(RESULT));
    await handleSummarize(
      { text: TEXT, length: 'short' },
      { env: { ...ENV, LLM_BASE_URL: 'http://localhost:11434/v1/' }, fetchImpl },
    );

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
  });
});
