import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_TEXT_CHARS, type ApiError, type SummaryResult } from './contract.js';
import { resetJsonSchemaSupport } from './llm.js';
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

beforeEach(() => {
  resetJsonSchemaSupport();
});

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

  it('surfaces rate limiting as 429 and tells the user to retry', async () => {
    const response = await handleSummarize(
      { text: TEXT, length: 'short' },
      { env: ENV, fetchImpl: fetchFailing(429, '{"error":{"code":"rate_limit_exceeded"}}') },
    );

    expect(response.status).toBe(429);
    expect((response.body as ApiError).code).toBe('rate_limited');
    expect((response.body as ApiError).error).toMatch(/wait a few seconds/i);
  });

  it('distinguishes an exhausted quota, where retrying never helps', async () => {
    const response = await handleSummarize(
      { text: TEXT, length: 'short' },
      { env: ENV, fetchImpl: fetchFailing(429, '{"error":{"code":"insufficient_quota"}}') },
    );

    expect(response.status).toBe(429);
    expect((response.body as ApiError).error).toMatch(/no remaining quota/i);
    expect((response.body as ApiError).error).toMatch(/waiting will not help/i);
    expect((response.body as ApiError).error).toMatch(/free provider/i);
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

describe('structured-output enforcement', () => {
  /** Reads the response_format sent on a given fetch call. */
  function responseFormatOf(fetchImpl: { mock: { calls: unknown[][] } }, call: number): Record<string, unknown> {
    const init = fetchImpl.mock.calls[call][1] as RequestInit;
    return (JSON.parse(init.body as string) as { response_format: Record<string, unknown> }).response_format;
  }

  it('constrains generation with a JSON schema derived from the contract', async () => {
    const fetchImpl = fetchReturning(JSON.stringify(RESULT));
    await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });

    const format = responseFormatOf(fetchImpl, 0) as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: { required: string[] } };
    };

    expect(format.type).toBe('json_schema');
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.name).toBe('document_summary');
    expect(format.json_schema.schema.required).toEqual(['summary', 'keyPoints', 'improvementSuggestions']);
  });

  it('falls back to json_object when the provider rejects json_schema', async () => {
    let call = 0;
    const fetchImpl = vi.fn(() => {
      call += 1;
      // Ollama and older gateways answer like this.
      if (call === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'response_format json_schema is not supported' } }), {
            status: 400,
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(RESULT) } }] }), { status: 200 }),
      );
    });

    const response = await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(responseFormatOf(fetchImpl, 0).type).toBe('json_schema');
    expect(responseFormatOf(fetchImpl, 1)).toEqual({ type: 'json_object' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(RESULT);
  });

  it('remembers the downgrade so it retries json_schema only once per endpoint', async () => {
    const reject = () =>
      new Response(JSON.stringify({ error: { message: 'json_schema unsupported' } }), { status: 400 });
    const ok = () =>
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(RESULT) } }] }), { status: 200 });

    let call = 0;
    const fetchImpl = vi.fn(() => Promise.resolve(++call === 1 ? reject() : ok()));

    await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    // A second request to the same endpoint should skip json_schema entirely.
    await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(responseFormatOf(fetchImpl, 2)).toEqual({ type: 'json_object' });
  });

  it('does not downgrade on unrelated provider failures', async () => {
    const fetchImpl = fetchFailing(401, 'invalid api key');
    const response = await handleSummarize({ text: TEXT, length: 'short' }, { env: ENV, fetchImpl });

    // One call only: a 401 is not a schema-support problem, so no retry.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((response.body as ApiError).error).toMatch(/rejected the API key/);
  });
});
