export type ExtractionMethod = 'pdf-text' | 'ocr' | 'pdf-ocr';

export interface ExtractionResult {
  text: string;
  method: ExtractionMethod;
  pageCount?: number;
  /** Mean OCR confidence 0-100, when OCR was used. */
  confidence?: number;
}

export interface ProgressUpdate {
  /** 0-1. */
  value: number;
  message: string;
}

export type ProgressCallback = (update: ProgressUpdate) => void;

/** An extraction failure with a message that is safe and useful to show a user. */
export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}
