import path from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import { MAX_TEXT_CHARS } from '../shared/contract.js';
import { handleSummarize } from '../shared/summarize.js';

export interface AppOptions {
  /** Absolute path to the built SPA. When set, the app serves it and falls back to index.html. */
  staticDir?: string;
}

export function createApp(options: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors());
  // Text is capped at MAX_TEXT_CHARS; allow headroom for JSON escaping and UTF-8.
  app.use(express.json({ limit: `${Math.ceil((MAX_TEXT_CHARS * 4) / 1024 / 1024) + 1}mb` }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const configured = Boolean(process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
    res.json({ status: 'ok', llmConfigured: configured });
  });

  app.post('/api/summarize', async (req: Request, res: Response) => {
    const { status, body } = await handleSummarize(req.body);
    res.status(status).json(body);
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ code: 'invalid_request', error: 'Unknown API route.' });
  });

  if (options.staticDir) {
    const staticDir = options.staticDir;
    app.use(express.static(staticDir));
    // SPA fallback for any non-API GET.
    app.get(/.*/, (_req: Request, res: Response) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // Surfaces malformed JSON bodies and oversized payloads as clean API errors.
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({ code: 'invalid_request', error: 'The document text is too large to summarize.' });
      return;
    }
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ code: 'invalid_request', error: 'The request body was not valid JSON.' });
      return;
    }
    res.status(500).json({ code: 'internal_error', error: 'Unexpected server error.' });
  });

  return app;
}
