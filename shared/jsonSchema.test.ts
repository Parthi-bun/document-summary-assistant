import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SUMMARY_RESULT_JSON_SCHEMA, SummaryResultSchema } from './contract.js';
import { toStrictJsonSchema } from './jsonSchema.js';

describe('toStrictJsonSchema', () => {
  it('strips validation keywords strict mode rejects', () => {
    const input = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, pattern: '^a' } },
      required: ['name'],
    };

    expect(toStrictJsonSchema(input)).toEqual({
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
      additionalProperties: false,
    });
  });

  it('forces additionalProperties:false and full required on nested objects', () => {
    const input = {
      type: 'object',
      properties: {
        outer: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } },
      },
    };

    const result = toStrictJsonSchema(input) as {
      properties: { outer: { additionalProperties: boolean; required: string[] } };
    };

    expect(result.properties.outer.additionalProperties).toBe(false);
    expect(result.properties.outer.required).toEqual(['a', 'b']);
  });

  it('recurses through arrays of schemas', () => {
    const input = { anyOf: [{ type: 'string', minLength: 2 }, { type: 'number', minimum: 0 }] };
    expect(toStrictJsonSchema(input)).toEqual({ anyOf: [{ type: 'string' }, { type: 'number' }] });
  });

  it('leaves primitives and nulls alone', () => {
    expect(toStrictJsonSchema('x')).toBe('x');
    expect(toStrictJsonSchema(null)).toBeNull();
  });
});

describe('SUMMARY_RESULT_JSON_SCHEMA', () => {
  it('describes exactly the three contract fields', () => {
    expect(SUMMARY_RESULT_JSON_SCHEMA).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'keyPoints', 'improvementSuggestions'],
      properties: {
        summary: { type: 'string' },
        keyPoints: { type: 'array', items: { type: 'string' } },
        improvementSuggestions: { type: 'array', items: { type: 'string' } },
      },
    });
  });

  it('contains no keyword that strict mode rejects', () => {
    const serialized = JSON.stringify(SUMMARY_RESULT_JSON_SCHEMA);
    for (const banned of ['$schema', 'minLength', 'minItems', 'pattern', 'format']) {
      expect(serialized).not.toContain(banned);
    }
  });

  it('stays in sync with the zod contract it is derived from', () => {
    // If a field is added to the zod schema, this fails until the JSON Schema
    // is regenerated — they are generated from one source, so they cannot drift.
    const fromZod = toStrictJsonSchema(z.toJSONSchema(SummaryResultSchema));
    expect(SUMMARY_RESULT_JSON_SCHEMA).toEqual(fromZod);
  });
});
