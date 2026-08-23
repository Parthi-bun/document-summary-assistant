import * as pdfjs from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { assemblePageText, joinPages, type PositionedItem } from './layout';
import { ExtractionError, type ExtractionResult, type ProgressCallback } from './types';

// Vite bundles the pdf.js worker and serves it from our own origin, rather than
// the CDN pdf.js defaults to. (Tesseract still fetches its WASM core and
// language model from jsdelivr on first OCR use — see the README.)
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Pages beyond this are skipped to keep extraction responsive on large files. */
export const MAX_PDF_PAGES = 40;

/** True when a PDF yielded so little text that it is almost certainly a scan. */
export function looksLikeScannedPdf(text: string, pageCount: number): boolean {
  const perPage = text.replace(/--- Page \d+ ---/g, '').trim().length / Math.max(pageCount, 1);
  return perPage < 80;
}

export async function extractPdfText(
  file: File,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  onProgress({ value: 0.05, message: 'Reading PDF…' });

  const data = new Uint8Array(await file.arrayBuffer());

  const loadingTask = pdfjs.getDocument({ data });
  signal?.addEventListener('abort', () => void loadingTask.destroy(), { once: true });

  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/password/i.test(message)) {
      throw new ExtractionError(
        'This PDF is password protected.',
        'Remove the password and upload it again.',
      );
    }
    throw new ExtractionError(
      'This PDF could not be opened — it may be corrupted or not a real PDF.',
      'Try re-exporting or re-downloading the file.',
    );
  }

  const totalPages = doc.numPages;
  const pagesToRead = Math.min(totalPages, MAX_PDF_PAGES);
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();

      const items: PositionedItem[] = content.items
        .filter((item): item is TextItem => 'str' in item)
        .map((item) => {
          // `transform` is typed loosely by pdf.js; it is the 6-value affine
          // matrix [a, b, c, d, e, f], where e/f are the run's x/y translation.
          const transform = item.transform as number[];
          return {
            text: item.str,
            x: transform[4],
            y: transform[5],
            height: Math.abs(item.height) || Math.abs(transform[3]),
            width: Math.abs(item.width),
            hasEol: item.hasEOL,
          };
        });

      pages.push(assemblePageText(items));
      page.cleanup();

      onProgress({
        value: 0.05 + (pageNumber / pagesToRead) * 0.9,
        message: `Extracting text — page ${pageNumber} of ${pagesToRead}…`,
      });
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }

  let text = joinPages(pages);
  if (totalPages > pagesToRead) {
    text += `\n\n[Only the first ${pagesToRead} of ${totalPages} pages were read.]`;
  }

  onProgress({ value: 1, message: 'Text extracted.' });

  return { text, method: 'pdf-text', pageCount: totalPages };
}

/**
 * Renders the first pages of a PDF to PNG data URLs so a scanned PDF can be
 * pushed through the same OCR path as an image upload.
 */
export async function renderPdfPagesToImages(
  file: File,
  maxPages: number,
  onProgress: ProgressCallback,
  signal?: AbortSignal,
): Promise<{ images: Blob[]; totalPages: number }> {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const count = Math.min(totalPages, maxPages);
  const images: Blob[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const page = await doc.getPage(pageNumber);
      // 2x scale: OCR accuracy drops sharply below ~200 DPI.
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const context = canvas.getContext('2d');
      if (!context) throw new ExtractionError('This browser could not render the PDF for OCR.');

      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) images.push(blob);

      page.cleanup();
      onProgress({ value: (pageNumber / count) * 0.3, message: `Rendering page ${pageNumber} of ${count} for OCR…` });
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }

  return { images, totalPages };
}
