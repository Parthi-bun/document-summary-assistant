/** A single positioned text run from a PDF page, in PDF user-space units. */
export interface PositionedItem {
  text: string;
  /** Horizontal position of the run's left edge. */
  x: number;
  /** Vertical position of the run's baseline (larger = higher up the page). */
  y: number;
  /** Rendered height of the run, used to size line and paragraph gaps. */
  height: number;
  /** Rendered width of the run, when pdf.js reports one. */
  width?: number;
  /** True when pdf.js reports an end-of-line marker after this run. */
  hasEol?: boolean;
}

/** Runs whose baselines differ by less than this fraction of line height are one line. */
const SAME_LINE_TOLERANCE = 0.5;
/** A vertical gap larger than this multiple of line height starts a new paragraph. */
const PARAGRAPH_GAP_RATIO = 1.6;
/** A horizontal gap larger than this multiple of line height implies a missing space. */
const WORD_GAP_RATIO = 0.25;

/**
 * Rebuilds readable text from the positioned runs pdf.js emits for a page.
 *
 * pdf.js returns runs in content-stream order, which is not always reading
 * order, and it omits the spaces between separately positioned runs. We group
 * runs into lines by baseline, order each line left-to-right, re-insert missing
 * spaces from horizontal gaps, and use vertical gaps to mark paragraph breaks.
 */
export function assemblePageText(items: PositionedItem[]): string {
  const meaningful = items.filter((item) => item.text.trim().length > 0);
  if (meaningful.length === 0) return '';

  const medianHeight = median(meaningful.map((item) => item.height).filter((h) => h > 0)) || 10;

  // Group into lines by baseline, top of page first.
  const lines: PositionedItem[][] = [];
  for (const item of [...meaningful].sort((a, b) => b.y - a.y)) {
    const current = lines[lines.length - 1];
    const onCurrentLine =
      current !== undefined && Math.abs(current[0].y - item.y) <= medianHeight * SAME_LINE_TOLERANCE;

    if (onCurrentLine) current.push(item);
    else lines.push([item]);
  }

  const rendered: string[] = [];

  lines.forEach((line, index) => {
    const ordered = [...line].sort((a, b) => a.x - b.x);

    let text = ordered[0].text;
    for (let i = 1; i < ordered.length; i += 1) {
      const previous = ordered[i - 1];
      const gap = ordered[i].x - (previous.x + estimateWidth(previous, medianHeight));
      const needsSpace = gap > medianHeight * WORD_GAP_RATIO && !/\s$/.test(text) && !/^\s/.test(ordered[i].text);
      text += (needsSpace ? ' ' : '') + ordered[i].text;
    }

    text = text.replace(/[ \t]+/g, ' ').trim();
    if (text === '') return;

    if (index > 0 && rendered.length > 0) {
      const previousLine = lines[index - 1];
      const gap = previousLine[0].y - line[0].y;
      if (gap > medianHeight * PARAGRAPH_GAP_RATIO) rendered.push('');
    }

    rendered.push(text);
  });

  return rendered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Approximates a run's rendered width. pdf.js supplies a width for real runs;
 * this fallback keeps gap detection sane for synthetic or width-less items.
 */
function estimateWidth(item: PositionedItem, medianHeight: number): number {
  if (typeof item.width === 'number' && item.width > 0) return item.width;
  return item.text.length * medianHeight * 0.5;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Joins per-page text with page separators, dropping pages that yielded nothing. */
export function joinPages(pages: string[]): string {
  return pages
    .map((page, index) => ({ page: page.trim(), number: index + 1 }))
    .filter(({ page }) => page.length > 0)
    .map(({ page, number }) => (pages.length > 1 ? `--- Page ${number} ---\n${page}` : page))
    .join('\n\n');
}
