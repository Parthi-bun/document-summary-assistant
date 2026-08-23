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
/**
 * Endpoints that rejected a json_schema response_format, so we stop asking.
 * Keyed by base URL + model; support differs per model on the same provider.
 */
const jsonSchemaUnsupported = new Set<string>();

/** Exported for tests: forget which endpoints rejected json_schema. */
export function resetJsonSchemaSupport(): void {
  jsonSchemaUnsupported.clear();
}

/** True when the provider's complaint is specifically about json_schema support. */
function isSchemaUnsupportedError(status: number, body: string): boolean {
  if (status !== 400 && status !== 404 && status !== 422 && status !== 501) return false;
  return /json_schema|response_format|structured.?output|schema/i.test(body);
}

export async function chatCompletion(
  config: LlmConfig,
  messages: ChatMessage[],
  options: { temperature?: number; fetchImpl?: typeof fetch; responseSchema?: unknown } = {},
): Promise<string> {
  const doFetch = options.fetchImpl ?? fetch;
  const endpointKey = `${config.baseUrl}::${config.model}`;

  // Constrain generation to the schema when we have one and the endpoint has
  // not already told us it cannot. This matters most for small local models,
  // which produce valid-but-wrong-shaped JSON far more often than large ones.
  const useSchema = options.responseSchema !== undefined && !jsonSchemaUnsupported.has(endpointKey);

  const send = (withSchema: boolean): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);

    return doFetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: options.temperature ?? 0.2,
        response_format: withSchema
          ? {
              type: 'json_schema',
              json_schema: { name: 'document_summary', strict: true, schema: options.responseSchema },
            }
          : { type: 'json_object' },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  };

  let response: Response;
  try {
    response = await send(useSchema);

    // Downgrade once if this endpoint does not understand json_schema.
    if (useSchema && !response.ok) {
      const body = await response.clone().text().catch(() => '');
      if (isSchemaUnsupportedError(response.status, body)) {
        jsonSchemaUnsupported.add(endpointKey);
        response = await send(false);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LlmRequestError('The model took too long to respond. Try a shorter summary length or a smaller document.');
    }
    throw new LlmRequestError(`Could not reach the AI provider at ${config.baseUrl}.`);
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
    // A 429 covers two very different situations, and the advice differs:
    // transient throttling clears on its own, an exhausted quota never does.
    if (/insufficient_quota|exceeded your current quota|billing/i.test(body)) {
      return (
        'The AI provider account has no remaining quota, so waiting will not help. ' +
        'Add billing credit, or switch to a free provider by setting LLM_BASE_URL and LLM_MODEL (see .env.example).'
      );
    }
    return 'The AI provider is rate limiting this request. Wait a few seconds and try again.';
  }
  if (status >= 500) {
    return 'The AI provider is currently unavailable. Please try again shortly.';
  }
  return `The AI provider rejected the request (HTTP ${status}). ${snippet}`.trim();
}
