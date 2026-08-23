import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MIN_TEXT_CHARS } from '../shared/contract.js';
import { createApp } from './app.js';

const app = createApp();
const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('GET /api/health', () => {
  it('reports that the LLM is unconfigured when no key is set', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', llmConfigured: false });
  });

  it('reports configured once a key is present', async () => {
    process.env.LLM_API_KEY = 'sk-test';
    const response = await request(app).get('/api/health');
    expect(response.body.llmConfigured).toBe(true);
  });
});

describe('POST /api/summarize', () => {
  it('returns 503 with a configuration error when no key is set', async () => {
    const response = await request(app)
      .post('/api/summarize')
      .send({ text: 'A'.repeat(MIN_TEXT_CHARS + 5), length: 'short' });

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('not_configured');
    expect(response.body).not.toHaveProperty('summary');
  });

  it('returns 400 for a body that fails validation', async () => {
    const response = await request(app).post('/api/summarize').send({ text: 'hi', length: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });

  it('returns 400 for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/summarize')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('invalid_request');
  });
});

describe('unknown API routes', () => {
  it('returns a JSON 404 rather than HTML', async () => {
    const response = await request(app).get('/api/nope');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('invalid_request');
  });
});
