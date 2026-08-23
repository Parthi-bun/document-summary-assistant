import { useCallback, useRef, useState } from 'react';
import type { SummaryLength, SummaryResult } from '../../shared/contract';
import { requestSummary, SummarizeError } from '../lib/api';
import {
  describeMethod,
  extractText,
  ExtractionError,
  LOW_CONFIDENCE_THRESHOLD,
  terminateOcrWorker,
  type ExtractionResult,
} from '../lib/extract';
import { validateFile } from '../lib/fileValidation';

export type Phase = 'idle' | 'ready' | 'extracting' | 'summarizing' | 'done' | 'error';

export interface AppError {
  message: string;
  hint?: string;
  /** Config errors get a distinct, instructional presentation. */
  kind: 'config' | 'file' | 'general';
}

export interface DocumentSummaryState {
  phase: Phase;
  file: File | null;
  extraction: ExtractionResult | null;
  result: SummaryResult | null;
  error: AppError | null;
  progress: { value: number; message: string };
  length: SummaryLength;
  warning: string | null;
}

const initialState: DocumentSummaryState = {
  phase: 'idle',
  file: null,
  extraction: null,
  result: null,
  error: null,
  progress: { value: 0, message: '' },
  length: 'medium',
  warning: null,
};

export function useDocumentSummary() {
  const [state, setState] = useState<DocumentSummaryState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  // Cached so changing summary length re-summarizes without re-running OCR.
  const extractedTextRef = useRef<string | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    extractedTextRef.current = null;
    void terminateOcrWorker();
    setState(initialState);
  }, [cancel]);

  const setLength = useCallback((length: SummaryLength) => {
    setState((previous) => ({ ...previous, length }));
  }, []);

  /** Runs the summarization request against already-extracted text. */
  const summarize = useCallback(
    async (text: string, length: SummaryLength, fileName: string | undefined, signal: AbortSignal) => {
      setState((previous) => ({
        ...previous,
        phase: 'summarizing',
        error: null,
        progress: { value: 0.5, message: 'Summarizing with AI…' },
      }));

      try {
        const result = await requestSummary({ text, length, fileName }, signal);
        setState((previous) => ({
          ...previous,
          phase: 'done',
          result,
          progress: { value: 1, message: 'Done.' },
        }));
      } catch (error) {
        if (isAbort(error)) return;
        const isConfig = error instanceof SummarizeError && error.code === 'not_configured';
        setState((previous) => ({
          ...previous,
          phase: 'error',
          error: {
            message: error instanceof Error ? error.message : 'Summarization failed.',
            kind: isConfig ? 'config' : 'general',
          },
        }));
      }
    },
    [],
  );

  /** Full pipeline: validate → extract → summarize. */
  const processFile = useCallback(
    async (file: File, length: SummaryLength) => {
      cancel();

      const validation = validateFile(file);
      if (!validation.ok) {
        setState((previous) => ({
          ...previous,
          phase: 'error',
          file: null,
          result: null,
          extraction: null,
          error: { message: validation.error, kind: 'file' },
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;
      extractedTextRef.current = null;

      setState((previous) => ({
        ...previous,
        phase: 'extracting',
        file,
        length,
        result: null,
        extraction: null,
        error: null,
        warning: null,
        progress: { value: 0, message: 'Preparing…' },
      }));

      let extraction: ExtractionResult;
      try {
        extraction = await extractText(
          file,
          (update) =>
            setState((previous) =>
              previous.phase === 'extracting'
                ? { ...previous, progress: { value: update.value * 0.5, message: update.message } }
                : previous,
            ),
          controller.signal,
        );
      } catch (error) {
        if (isAbort(error)) return;
        setState((previous) => ({
          ...previous,
          phase: 'error',
          error: {
            message: error instanceof ExtractionError ? error.message : 'The file could not be read.',
            hint: error instanceof ExtractionError ? error.hint : undefined,
            kind: 'file',
          },
        }));
        return;
      }

      extractedTextRef.current = extraction.text;

      const lowConfidence =
        extraction.confidence !== undefined &&
        extraction.confidence > 0 &&
        extraction.confidence < LOW_CONFIDENCE_THRESHOLD;

      setState((previous) => ({
        ...previous,
        extraction,
        warning: lowConfidence
          ? `OCR confidence was low (${Math.round(extraction.confidence ?? 0)}%). The extracted text may contain errors, so check the summary against the original.`
          : null,
      }));

      await summarize(extraction.text, length, file.name, controller.signal);
    },
    [cancel, summarize],
  );

  /** Re-runs only the summarization step, e.g. after switching length. */
  const resummarize = useCallback(
    async (length: SummaryLength) => {
      const text = extractedTextRef.current;
      if (!text) return;

      cancel();
      const controller = new AbortController();
      abortRef.current = controller;

      setState((previous) => ({ ...previous, length }));
      await summarize(text, length, state.file?.name, controller.signal);
    },
    [cancel, state.file, summarize],
  );

  return {
    state,
    processFile,
    resummarize,
    setLength,
    reset,
    cancel,
    hasExtractedText: extractedTextRef.current !== null,
    methodLabel: state.extraction ? describeMethod(state.extraction) : null,
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
