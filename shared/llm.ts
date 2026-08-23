/**
 * Minimal provider abstraction over the OpenAI-compatible Chat Completions API.
 *
 * Kept as plain fetch rather than an SDK so the same code works against OpenAI,
 * OpenRouter, Groq, Together, Azure-compatible gateways and a local Ollama
 * server just by changing LLM_BASE_URL / LLM_MODEL.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmNotConfiguredError';
  }
}

export class LlmRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmRequestError';
  }
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * Reads provider settings from the environment.
 * Throws LlmNotConfiguredError (never falls back to a fake summary) when no key
 * is present, so the user gets an explicit, actionable configuration error.
 */
export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const apiKey = env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new LlmNotConfiguredError(
      'No LLM API key is configured on the server. Set LLM_API_KEY (see .env.example) and restart, ' +
        'or set it in your hosting provider’s environment variables and redeploy.',
    );
  }

  const timeout = Number(env.LLM_TIMEOUT_MS);

  return {
    apiKey,
    baseUrl: (env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: env.LLM_MODEL?.trim() || DEFAULT_MODEL,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/** Sends a chat completion request and returns the assistant's raw text reply. */
export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options: { temperature?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await doFetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlmRequestError('The model took too long to respond. Try a shorter summary length or a smaller document.');
    }
    throw new LlmRequestError(`Could not reach the AI provider at ${config.baseUrl}.`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new LlmRequestError(describeProviderError(response.status, body), response.status);
  }

  const payload = (await response.json().catch(() => null)) as
    | { choices?: { message?: { content?: string } }[] }
    | null;

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new LlmRequestError('The AI provider returned an empty response.');
  }

  return content;
}

/** Turns a provider HTTP failure into something a user can act on. */
function describeProviderError(status: number, body: string): string {
  const snippet = body.slice(0, 300);

  if (status === 401 || status === 403) {
    return 'The AI provider rejected the API key. Check that LLM_API_KEY is valid and has access to the configured model.';
  }
  if (status === 404) {
    return 'The AI provider does not recognise the configured model. Check LLM_MODEL and LLM_BASE_URL.';
  }
  if (status === 429) {
    return 'The AI provider is rate limiting or the account is out of quota. Wait a moment and try again.';
  }
  if (status >= 500) {
    return 'The AI provider is currently unavailable. Please try again shortly.';
  }
  return `The AI provider rejected the request (HTTP ${status}). ${snippet}`.trim();
}
