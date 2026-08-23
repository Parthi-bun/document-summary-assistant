import { MIN_TEXT_CHARS, MAX_TEXT_CHARS } from '../../../shared/contract';
import { ExtractionError, type ExtractionResult, type ProgressCallback } from './types';

export * from './types';

// pdf.js and Tesseract together are ~1.5 MB. They are loaded on demand so the
// initial page stays small, and an image-only upload never downloads pdf.js.
const loadPdf = () => import('./pdf');
const loadOcr = () => import('./ocr');

/** Releases the shared OCR worker, if one was ever created. */
export async function terminateOcrWorker(): Promise<void> {
  await loadOcr().then((module) => module.terminateOcrWorker());
}

/** OCR is slow, so a scanned PDF fallback only covers the first few pages. */
export const MAX_OCR_PDF_PAGES = 5;
/** Below this mean Tesseract confidence we warn the user the text may be unreliable. */
export const LOW_CONFIDENCE_THRESHOLD = 65;

/** Routes a validated file to the right extraction strategy. */
export async function extractText(
  file: File,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  const result = isPdf
    ? await extractFromPdf(file, onProgress, signal)
    : await extractFromImage(file, onProgress, signal);

  const text = result.text.trim();

  if (text.length < MIN_TEXT_CHARS) {
    throw new ExtractionError(
      'No readable text could be found in this file.',
      result.method === 'pdf-text'
        ? 'The PDF appears to have no text layer. Try a text-based PDF, or upload a page image so OCR can read it.'
        : 'Try a sharper, higher-contrast, upright scan — OCR struggles with blurry or rotated pages.',
    );
  }

  return {
    ...result,
    text: text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Text truncated to fit the summarizer's limit.]` : text,
  };
}

async function extractFromPdf(
  file: File,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const { extractPdfText, looksLikeScannedPdf, renderPdfPagesToImages } = await loadPdf();
  const { recognizeImages } = await loadOcr();

  const direct = await extractPdfText(file, (update) => onProgress({ ...update, value: update.value * 0.5 }), signal);

  if (!looksLikeScannedPdf(direct.text, direct.pageCount ?? 1)) {
    return direct;
  }

  // Little or no text layer: this is almost certainly a scan, so fall back to OCR.
  onProgress({ value: 0.5, message: 'No text layer found — falling back to OCR…' });

  const { images, totalPages } = await renderPdfPagesToImages(
    file,
    MAX_OCR_PDF_PAGES,
    (update) => onProgress({ value: 0.5 + update.value * 0.2, message: update.message }),
    signal,
  );

  const ocr = await recognizeImages(images, onProgress, signal, [0.7, 1]);

  let text = ocr.text;
  if (totalPages > MAX_OCR_PDF_PAGES && text) {
    text += `\n\n[This scanned PDF has ${totalPages} pages; only the first ${MAX_OCR_PDF_PAGES} were read by OCR.]`;
  }

  return { text, method: 'pdf-ocr', pageCount: totalPages, confidence: ocr.confidence };
}

async function extractFromImage(
  file: File,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const { recognizeImages } = await loadOcr();
  const ocr = await recognizeImages([file], onProgress, signal, [0.3, 1]);
  return { text: ocr.text, method: 'ocr', confidence: ocr.confidence };
}

/** Human-readable label for how a document's text was obtained. */
export function describeMethod(result: ExtractionResult): string {
  switch (result.method) {
    case 'pdf-text':
      return `PDF text layer${result.pageCount ? ` · ${result.pageCount} page${result.pageCount === 1 ? '' : 's'}` : ''}`;
    case 'pdf-ocr':
      return `OCR of scanned PDF${result.pageCount ? ` · ${result.pageCount} page${result.pageCount === 1 ? '' : 's'}` : ''}`;
    case 'ocr':
      return 'OCR of image';
  }
}
