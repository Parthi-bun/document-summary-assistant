import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { createApp } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// In production the compiled server lives at dist/server/server/, and the SPA at dist/public/.
const candidateStaticDirs = [path.resolve(here, '../../public'), path.resolve(here, '../../../dist/public')];
const staticDir = candidateStaticDirs.find((dir) => fs.existsSync(path.join(dir, 'index.html')));

const port = Number(process.env.PORT) || 3001;
const app = createApp({ staticDir });

app.listen(port, () => {
  const mode = staticDir ? `serving SPA from ${staticDir}` : 'API only (run `vite` separately for the UI)';
  const configured = Boolean(process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
  console.log(`API listening on http://localhost:${port} — ${mode}`);
  if (!configured) {
    console.warn('LLM_API_KEY is not set. Summarization will return a configuration error until you set it (see .env.example).');
  }
});
