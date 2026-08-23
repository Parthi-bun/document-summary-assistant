import { handleSummarize } from '../../shared/summarize.js';

/**
 * Netlify Functions v2 entry point. Like the Vercel handler, this is a thin
 * wrapper around the shared core so every deployment target behaves the same.
 */
export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return Response.json({ code: 'invalid_request', error: 'Use POST.' }, { status: 405 });
  }

  const body: unknown = await request.json().catch(() => null);
  const { status, body: payload } = await handleSummarize(body);

  return Response.json(payload, { status });
};
