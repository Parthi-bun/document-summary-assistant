import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SummaryResult } from '../shared/contract';
import App from './App';
import { ExtractionError } from './lib/extract/types';

// pdf.js and Tesseract need real browser workers, so the extraction layer is
// mocked here; its own logic is covered by src/lib/extract/layout.test.ts.
type ExtractTextFn = typeof import('./lib/extract').extractText;
type RequestSummaryFn = typeof import('./lib/api').requestSummary;

// vi.mock factories are hoisted above const declarations, so the spies these
// factories close over must be created with vi.hoisted.
const { extractText, terminateOcrWorker, requestSummary } = vi.hoisted(() => ({
  extractText: vi.fn<ExtractTextFn>(),
  terminateOcrWorker: vi.fn(() => Promise.resolve()),
  requestSummary: vi.fn<RequestSummaryFn>(),
}));

vi.mock('./lib/extract', async () => {
  const types = await import('./lib/extract/types');
  return {
    ...types,
    LOW_CONFIDENCE_THRESHOLD: 65,
    extractText,
    terminateOcrWorker: () => terminateOcrWorker(),
    describeMethod: () => 'PDF text layer · 2 pages',
  };
});

vi.mock('./lib/api', async () => {
  const actual = await vi.importActual<typeof import('./lib/api')>('./lib/api');
  return { ...actual, requestSummary };
});

const RESULT: SummaryResult = {
  summary: 'The report covers third-quarter performance.',
  keyPoints: ['Revenue rose twelve percent.', 'Churn fell to three percent.'],
  improvementSuggestions: ['State the data source for each figure.'],
};

const pdf = () => new File(['%PDF-1.4'], 'q3-report.pdf', { type: 'application/pdf' });

function extractionSucceeds(text = 'x'.repeat(500)) {
  extractText.mockImplementation(
    (_file: File, onProgress: (u: { value: number; message: string }) => void) => {
      onProgress({ value: 0.5, message: 'Extracting text…' });
      return Promise.resolve({ text, method: 'pdf-text', pageCount: 2 });
    },
  );
}

async function uploadPdf(file = pdf()) {
  await userEvent.upload(screen.getByLabelText(/choose a pdf or image file/i), file);
}

/**
 * Drops a file onto the zone. Unlike the picker, drag-and-drop bypasses the
 * `accept` filter, so this is the path an unsupported file actually arrives by.
 */
function dropFile(file: File) {
  const zone = screen.getByRole('button', { name: /upload a document/i });
  fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  requestSummary.mockResolvedValue(RESULT);
});

describe('App', () => {
  it('shows the upload prompt on first load', () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/turn any pdf or scan into a summary/i);
    expect(screen.getByText(/drag a document here/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /medium/i })).not.toBeInTheDocument();
  });

  it('runs the full pipeline and renders all three result sections', async () => {
    extractionSucceeds();
    render(<App />);

    await uploadPdf();

    expect(await screen.findByText(RESULT.summary)).toBeInTheDocument();
    expect(screen.getByText(RESULT.keyPoints[0])).toBeInTheDocument();
    expect(screen.getByText(RESULT.improvementSuggestions[0])).toBeInTheDocument();
    expect(screen.getByText('q3-report.pdf')).toBeInTheDocument();
    expect(screen.getByText(/PDF text layer/)).toBeInTheDocument();
    expect(requestSummary).toHaveBeenCalledWith(
      expect.objectContaining({ length: 'medium', fileName: 'q3-report.pdf' }),
      expect.anything(),
    );
  });

  it('re-summarizes without re-extracting when the length changes', async () => {
    extractionSucceeds();
    render(<App />);

    await uploadPdf();
    await screen.findByText(RESULT.summary);

    await userEvent.click(screen.getByRole('radio', { name: /long/i }));

    await waitFor(() => expect(requestSummary).toHaveBeenCalledTimes(2));
    expect(requestSummary.mock.calls[1][0]).toMatchObject({ length: 'long' });
    // The expensive extraction step ran only once.
    expect(extractText).toHaveBeenCalledTimes(1);
  });

  it('rejects an unsupported file without attempting extraction', async () => {
    render(<App />);

    dropFile(new File(['x'], 'notes.docx', { type: 'application/msword' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a supported file/i);
    expect(extractText).not.toHaveBeenCalled();
    expect(requestSummary).not.toHaveBeenCalled();
  });

  it('surfaces the extraction hint when a PDF has no readable text', async () => {
    extractText.mockRejectedValue(
      new ExtractionError('No readable text could be found in this file.', 'The PDF appears to have no text layer.'),
    );
    render(<App />);

    await uploadPdf();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no readable text could be found/i);
    expect(alert).toHaveTextContent(/no text layer/i);
    expect(requestSummary).not.toHaveBeenCalled();
  });

  it('shows setup instructions instead of a summary when no API key is configured', async () => {
    extractionSucceeds();
    const { SummarizeError } = await import('./lib/api');
    requestSummary.mockRejectedValue(
      new SummarizeError('No LLM API key is configured on the server. Set LLM_API_KEY…', 'not_configured'),
    );
    render(<App />);

    await uploadPdf();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/ai provider is not configured/i);
    expect(alert).toHaveTextContent(/LLM_API_KEY/);
    // Critically: no fabricated summary is displayed.
    expect(screen.queryByRole('heading', { name: /^results$/i })).not.toBeInTheDocument();
  });

  it('warns when OCR confidence is low but still shows the summary', async () => {
    extractText.mockResolvedValue({ text: 'x'.repeat(500), method: 'ocr', confidence: 41 });
    render(<App />);

    await uploadPdf(new File(['x'], 'scan.png', { type: 'image/png' }));

    expect(await screen.findByText(/low ocr confidence/i)).toBeInTheDocument();
    expect(await screen.findByText(RESULT.summary)).toBeInTheDocument();
  });

  it('returns to the empty state when the document is removed', async () => {
    extractionSucceeds();
    render(<App />);

    await uploadPdf();
    await screen.findByText(RESULT.summary);

    await userEvent.click(screen.getByRole('button', { name: /summarize another document/i }));

    expect(screen.getByText(/drag a document here/i)).toBeInTheDocument();
    expect(screen.queryByText(RESULT.summary)).not.toBeInTheDocument();
    expect(terminateOcrWorker).toHaveBeenCalled();
  });

  it('shows progress and a cancel control while working', async () => {
    extractionSucceeds();
    let resolveSummary: (value: SummaryResult) => void = () => undefined;
    requestSummary.mockImplementation(() => new Promise<SummaryResult>((resolve) => { resolveSummary = resolve; }));
    render(<App />);

    await uploadPdf();

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    // Appears twice: once visibly, once in the sr-only live region.
    expect(screen.getAllByText(/summarizing with ai/i).length).toBeGreaterThan(0);
    const cancel = screen.getByRole('button', { name: /^cancel$/i });
    expect(cancel).toBeInTheDocument();

    fireEvent.click(cancel);
    resolveSummary(RESULT);
  });
});
