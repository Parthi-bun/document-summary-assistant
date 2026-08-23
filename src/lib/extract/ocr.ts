import { createWorker, type Worker } from 'tesseract.js';
import { ExtractionError, type ProgressCallback } from './types';

let workerPromise: Promise<Worker> | null = null;

/**
 * Creates (once) and reuses a Tesseract worker.
 *
 * The first call downloads Tesseract's WASM core and the English language model
 * (~4 MB) from the jsdelivr CDN, which is why the UI shows distinct "preparing"
 * and "downloading" steps. Both are cached by the browser afterwards.
 */
async function getWorker(onProgress: ProgressCallback): Promise<Worker> {
  workerPromise ??= createWorker('eng', 1, {
    logger: (message: { status: string; progress: number }) => {
      if (message.status === 'loading tesseract core' || message.status === 'initializing tesseract') {
        onProgress({ value: 0.05, message: 'Preparing the OCR engine…' });
      } else if (message.status === 'loading language traineddata') {
        onProgress({ value: 0.1 + message.progress * 0.2, message: 'Downloading the OCR language model…' });
      }
    },
  }).catch((error: unknown) => {
    workerPromise = null;
    throw error;
  });

  return workerPromise;
}

export interface OcrOutcome {
  text: string;
  confidence: number;
}

/** Runs OCR over one or more images and concatenates the recognised text. */
export async function recognizeImages(
  images: Blob[],
  onProgress: ProgressCallback,
  signal?: AbortSignal,
  progressRange: [number, number] = [0.3, 1],
): Promise<OcrOutcome> {
  let worker: Worker;
  try {
    worker = await getWorker(onProgress);
  } catch {
    throw new ExtractionError(
      'The OCR engine could not be loaded.',
      'Tesseract downloads its WASM core and language model from the jsdelivr CDN on first use. ' +
        'Check your network connection, and any content-security policy or firewall that might block cdn.jsdelivr.net.',
    );
  }

  const [from, to] = progressRange;
  const parts: string[] = [];
  const confidences: number[] = [];

  for (let index = 0; index < images.length; index += 1) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    onProgress({
      value: from + (index / images.length) * (to - from),
      message:
        images.length > 1
          ? `Reading text from image ${index + 1} of ${images.length}…`
          : 'Reading text from the image…',
    });

    const { data } = await worker.recognize(images[index]);
    const text = data.text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text) parts.push(text);
    if (typeof data.confidence === 'number') confidences.push(data.confidence);
  }

  onProgress({ value: to, message: 'Text recognised.' });

  return {
    text: parts.join('\n\n'),
    confidence: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
  };
}

/** Releases the shared worker. Called when the user resets the app. */
export async function terminateOcrWorker(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await pending.then((worker) => worker.terminate()).catch(() => undefined);
}
