import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleSummarize } from '../shared/summarize.js';

/**
 * Vercel serverless entry point. Thin wrapper around the same core the Express
 * route uses, so both hosting modes share identical behaviour.
 */
export default async function handler(
  req: IncomingMessage & { method?: string; body?: unknown },
  res: ServerResponse & { status: (code: number) => { json: (body: unknown) => void } },
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ code: 'invalid_request', error: 'Use POST.' });
    return;
  }

  const { status, body } = await handleSummarize(req.body);
  res.status(status).json(body);
}
