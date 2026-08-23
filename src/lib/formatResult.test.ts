import { describe, expect, it } from 'vitest';
import { formatResultAsText } from './formatResult';

const result = {
  summary: 'A report on Q3.',
  keyPoints: ['Revenue rose.', 'Costs fell.'],
  improvementSuggestions: ['Add a conclusion.'],
};

describe('formatResultAsText', () => {
  it('renders every section with numbered entries', () => {
    const text = formatResultAsText(result, { fileName: 'q3.pdf', length: 'medium' });

    expect(text).toContain('Document: q3.pdf');
    expect(text).toContain('Summary length: Medium');
    expect(text).toContain('SUMMARY\nA report on Q3.');
    expect(text).toContain('1. Revenue rose.');
    expect(text).toContain('2. Costs fell.');
    expect(text).toContain('IMPROVEMENT SUGGESTIONS\n1. Add a conclusion.');
  });

  it('omits the document line when no file name is known', () => {
    expect(formatResultAsText(result, { length: 'short' })).not.toContain('Document:');
  });
});
