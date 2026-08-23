import { describe, expect, it } from 'vitest';
import { extractJsonObject, parseSummaryResult } from './parseResult.js';

const valid = {
  summary: 'A quarterly report on revenue growth.',
  keyPoints: ['Revenue rose 12%.', 'Churn fell to 3%.'],
  improvementSuggestions: ['Add a methodology section.'],
};

describe('extractJsonObject', () => {
  it('returns the object from a bare JSON reply', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('finds the object inside a markdown code fence', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('ignores braces that appear inside string values', () => {
    const raw = 'Here you go: {"summary":"uses { and } literally","n":1} thanks!';
    expect(extractJsonObject(raw)).toBe('{"summary":"uses { and } literally","n":1}');
  });

  it('handles escaped quotes without ending the string early', () => {
    const raw = '{"summary":"she said \\"hi\\" }","n":2}';
    expect(extractJsonObject(raw)).toBe(raw);
  });

  it('returns null when there is no object', () => {
    expect(extractJsonObject('no json here')).toBeNull();
    expect(extractJsonObject('{"unbalanced": 1')).toBeNull();
  });
});

describe('parseSummaryResult', () => {
  it('parses a well-formed reply', () => {
    expect(parseSummaryResult(JSON.stringify(valid))).toEqual(valid);
  });

  it('parses a reply wrapped in prose and code fences', () => {
    const raw = `Sure!\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``;
    expect(parseSummaryResult(raw)).toEqual(valid);
  });

  it('accepts snake_case keys some providers emit', () => {
    const raw = JSON.stringify({
      summary: valid.summary,
      key_points: valid.keyPoints,
      improvement_suggestions: valid.improvementSuggestions,
    });
    expect(parseSummaryResult(raw)).toEqual(valid);
  });

  it('strips bullet and number prefixes from list entries', () => {
    const raw = JSON.stringify({ ...valid, keyPoints: ['- Revenue rose 12%.', '2. Churn fell to 3%.'] });
    expect(parseSummaryResult(raw)?.keyPoints).toEqual(['Revenue rose 12%.', 'Churn fell to 3%.']);
  });

  it('unwraps objects used in place of plain strings', () => {
    const raw = JSON.stringify({ ...valid, keyPoints: [{ point: 'Revenue rose 12%.' }] });
    expect(parseSummaryResult(raw)?.keyPoints).toEqual(['Revenue rose 12%.']);
  });

  it('coerces a single string into a one-item array', () => {
    const raw = JSON.stringify({ ...valid, improvementSuggestions: 'Add a methodology section.' });
    expect(parseSummaryResult(raw)?.improvementSuggestions).toEqual(['Add a methodology section.']);
  });

  it('returns null for malformed or incomplete replies', () => {
    expect(parseSummaryResult('I cannot help with that.')).toBeNull();
    expect(parseSummaryResult('{"summary":"only this"}')).toBeNull();
    expect(parseSummaryResult('{"summary":,}')).toBeNull();
    expect(parseSummaryResult(JSON.stringify({ ...valid, keyPoints: [] }))).toBeNull();
    expect(parseSummaryResult(JSON.stringify({ ...valid, summary: '   ' }))).toBeNull();
  });
});
