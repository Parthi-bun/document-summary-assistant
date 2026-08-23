import { useCallback } from 'react';
import type { SummaryLength } from '../shared/contract';
import { Alert } from './components/Alert';
import { CopyButton } from './components/CopyButton';
import { DropZone } from './components/DropZone';
import { FileCard } from './components/FileCard';
import { LengthSelector } from './components/LengthSelector';
import { ProgressPanel } from './components/ProgressPanel';
import { ResultView } from './components/ResultView';
import { RefreshIcon } from './components/icons';
import { useDocumentSummary } from './hooks/useDocumentSummary';

export default function App() {
  const { state, processFile, resummarize, setLength, reset, cancel, hasExtractedText, methodLabel } =
    useDocumentSummary();

  const busy = state.phase === 'extracting' || state.phase === 'summarizing';

  const handleLengthChange = useCallback(
    (length: SummaryLength) => {
      setLength(length);
      // Text is already extracted, so switching length only re-runs the AI step.
      if (hasExtractedText && !busy) void resummarize(length);
    },
    [busy, hasExtractedText, resummarize, setLength],
  );

  const handleFile = useCallback(
    (file: File) => void processFile(file, state.length),
    [processFile, state.length],
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase">Document Summary Assistant</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-balance text-slate-900 sm:text-4xl">
          Turn any PDF or scan into a summary you can act on
        </h1>
        <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-slate-600">
          Upload a document and get a summary, the key points, and concrete suggestions for improving the document
          itself. PDFs and images are processed in your browser — only the extracted text is sent for summarization.
        </p>
      </header>

      <main className="flex-1 space-y-5">
        {state.file === null ? (
          <DropZone onFileSelected={handleFile} />
        ) : (
          <FileCard file={state.file} methodLabel={methodLabel} onRemove={reset} removeDisabled={busy} />
        )}

        {state.error && state.error.kind === 'config' ? (
          <Alert tone="config" title="The AI provider is not configured">
            <p>{state.error.message}</p>
            <p className="text-slate-600">
              Copy <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">.env.example</code> to{' '}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">.env</code>, set{' '}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">LLM_API_KEY</code>, and restart the
              server. Your extracted text is still available — no summary is shown, because this app never fabricates
              one.
            </p>
          </Alert>
        ) : state.error ? (
          <Alert tone="error" title={state.error.message}>
            {state.error.hint ? <p>{state.error.hint}</p> : null}
          </Alert>
        ) : null}

        {state.warning ? (
          <Alert tone="warning" title="Low OCR confidence">
            <p>{state.warning}</p>
          </Alert>
        ) : null}

        {state.file !== null ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <LengthSelector value={state.length} onChange={handleLengthChange} disabled={busy} />
            {hasExtractedText ? (
              <p className="mt-3 text-xs text-slate-500">
                Changing the length regenerates the summary. The document is not re-processed.
              </p>
            ) : null}
          </div>
        ) : null}

        {busy ? (
          <ProgressPanel value={state.progress.value} message={state.progress.message} onCancel={cancel} />
        ) : null}

        {state.error && state.file !== null && !busy ? (
          <div className="flex flex-wrap gap-2">
            {hasExtractedText ? (
              <button
                type="button"
                onClick={() => void resummarize(state.length)}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              >
                <RefreshIcon className="h-4 w-4" />
                Try again
              </button>
            ) : null}
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Start over
            </button>
          </div>
        ) : null}

        {state.result ? (
          <>
            <ResultView
              result={state.result}
              length={state.length}
              fileName={state.file?.name}
              busy={state.phase === 'summarizing'}
            />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                <RefreshIcon className="h-4 w-4" />
                Summarize another document
              </button>
              {state.extraction ? (
                <CopyButton
                  getText={() => state.extraction?.text ?? ''}
                  label="Copy extracted text"
                  className="px-3 py-2.5 text-sm"
                />
              ) : null}
            </div>
          </>
        ) : null}
      </main>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <p>
          Text extraction uses pdf.js; scanned pages are read with Tesseract OCR in your browser. Summaries are
          generated by a large language model, so verify anything important against the original document.
        </p>
      </footer>
    </div>
  );
}
