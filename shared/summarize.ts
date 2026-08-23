import { SummarizeRequestSchema, type ApiError, type SummaryResult } from './contract.js';
import { chatCompletion, loadLlmConfig, LlmNotConfiguredError, LlmRequestError, type ChatMessage } from './llm.js';
import { parseSummaryResult } from './parseResult.js';
import { buildUserPrompt, REPAIR_INSTRUCTION, SYSTEM_PROMPT } from './prompt.js';

export interface HandlerResponse {
  status: number;
  body: SummaryResult | ApiError;
}

export interface HandlerDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

/**
 * Framework-agnostic core of POST /api/summarize.
 * Shared verbatim by the Express route and the Vercel serverless function so
 * both deployment targets behave identically.
 */
export async function handleSummarize(rawBody: unknown, deps: HandlerDeps = {}): Promise<HandlerResponse> {
  const parsedRequest = SummarizeRequestSchema.safeParse(rawBody);
  if (!parsedRequest.success) {
    return {
      status: 400,
      body: {
        code: 'invalid_request',
        error: parsedRequest.error.issues[0]?.message ?? 'The request body was not valid.',
      },
    };
  }

  const { text, length, fileName } = parsedRequest.data;

  let config;
  try {
    config = loadLlmConfig(deps.env);
  } catch (error) {
    if (error instanceof LlmNotConfiguredError) {
      return { status: 503, body: { code: 'not_configured', error: error.message } };
    }
    throw error;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(text, length, fileName) },
  ];

  try {
    const first = await chatCompletion(config, messages, { fetchImpl: deps.fetchImpl });
    const result = parseSummaryResult(first);
    if (result) return { status: 200, body: result };

    // One repair attempt: show the model its own bad output and ask for raw JSON.
    const repaired = await chatCompletion(
      config,
      [...messages, { role: 'assistant', content: first }, { role: 'user', content: REPAIR_INSTRUCTION }],
      { temperature: 0, fetchImpl: deps.fetchImpl },
    );
    const retryResult = parseSummaryResult(repaired);
    if (retryResult) return { status: 200, body: retryResult };

    return {
      status: 502,
      body: {
        code: 'malformed_response',
        error: 'The AI returned a response that could not be read. Please try again.',
      },
    };
  } catch (error) {
    if (error instanceof LlmRequestError) {
      return {
        status: error.status === 429 ? 429 : 502,
        body: { code: error.status === 429 ? 'rate_limited' : 'provider_error', error: error.message },
      };
    }
    return {
      status: 500,
      body: { code: 'internal_error', error: 'Something went wrong while generating the summary.' },
    };
  }
}
