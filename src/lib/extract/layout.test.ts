import { describe, expect, it } from 'vitest';
import { assemblePageText, joinPages, type PositionedItem } from './layout';

/** Builds an item at a given position; y grows upward, as in PDF user space. */
function item(text: string, x: number, y: number, width = text.length * 5, height = 10): PositionedItem {
  return { text, x, y, width, height };
}

describe('assemblePageText', () => {
  it('orders lines top-to-bottom regardless of content-stream order', () => {
    // Baselines 12 units apart at a 10-unit font size: normal single-spaced leading.
    const items = [item('Third line', 0, 100), item('First line', 0, 124), item('Second line', 0, 112)];
    expect(assemblePageText(items)).toBe('First line\nSecond line\nThird line');
  });

  it('orders runs on the same line left-to-right', () => {
    const items = [item('world', 60, 100), item('Hello', 0, 100, 50)];
    expect(assemblePageText(items)).toBe('Hello world');
  });

  it('inserts a space between separately positioned runs', () => {
    // pdf.js emits no space between runs it positions independently.
    const items = [item('Total:', 0, 100, 30), item('42', 60, 100, 10)];
    expect(assemblePageText(items)).toBe('Total: 42');
  });

  it('does not insert a space when runs are adjacent', () => {
    const items = [item('Sum', 0, 100, 20), item('mary', 20, 100, 25)];
    expect(assemblePageText(items)).toBe('Summary');
  });

  it('treats a large vertical gap as a paragraph break', () => {
    const items = [item('Heading', 0, 200), item('Body starts here', 0, 160)];
    expect(assemblePageText(items)).toBe('Heading\n\nBody starts here');
  });

  it('keeps consecutive lines together when the gap is normal leading', () => {
    const items = [item('Line one', 0, 112), item('Line two', 0, 100)];
    expect(assemblePageText(items)).toBe('Line one\nLine two');
  });

  it('keeps a raised superscript on the same line as its baseline text', () => {
    // Superscripts sit above the baseline; they must not be split onto their own line,
    // and they sit tight against the preceding word, so no space is inserted.
    const items = [item('Revenue', 0, 100, 40), item('1', 42, 103, 4, 6), item('rose', 50, 100, 25)];
    expect(assemblePageText(items)).toBe('Revenue1 rose');
  });

  it('returns an empty string for a page with no text', () => {
    expect(assemblePageText([])).toBe('');
    expect(assemblePageText([item('   ', 0, 100)])).toBe('');
  });
});

describe('joinPages', () => {
  it('does not label a single-page document', () => {
    expect(joinPages(['Only page'])).toBe('Only page');
  });

  it('labels pages and skips empty ones', () => {
    expect(joinPages(['One', '   ', 'Three'])).toBe('--- Page 1 ---\nOne\n\n--- Page 3 ---\nThree');
  });
});
