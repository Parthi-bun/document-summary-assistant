import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropZone } from './DropZone';

const pdf = () => new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' });

function dropFile(target: HTMLElement, file: File) {
  const dataTransfer = { files: [file], items: [{ kind: 'file', type: file.type }], types: ['Files'] };
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
}

describe('DropZone', () => {
  it('exposes an accessible file input and a keyboard-reachable drop zone', () => {
    render(<DropZone onFileSelected={vi.fn()} />);

    expect(screen.getByLabelText(/choose a pdf or image file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload a document/i })).toHaveAttribute('tabindex', '0');
    expect(screen.getByText(/up to 20\.0 MB/i)).toBeInTheDocument();
  });

  it('reports the dropped file', () => {
    const onFileSelected = vi.fn();
    render(<DropZone onFileSelected={onFileSelected} />);

    dropFile(screen.getByRole('button', { name: /upload a document/i }), pdf());

    expect(onFileSelected).toHaveBeenCalledTimes(1);
    expect((onFileSelected.mock.calls[0][0] as File).name).toBe('report.pdf');
  });

  it('shows drag feedback while a file is over the zone', () => {
    render(<DropZone onFileSelected={vi.fn()} />);
    const zone = screen.getByRole('button', { name: /upload a document/i });

    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['Files'] } });
    expect(screen.getByText(/drop the file to start/i)).toBeInTheDocument();

    fireEvent.dragLeave(zone);
    expect(screen.getByText(/drag a document here/i)).toBeInTheDocument();
  });

  it('reports a file chosen through the picker', async () => {
    const onFileSelected = vi.fn();
    render(<DropZone onFileSelected={onFileSelected} />);

    await userEvent.upload(screen.getByLabelText(/choose a pdf or image file/i), pdf());

    expect(onFileSelected).toHaveBeenCalledTimes(1);
  });

  it('ignores interaction while disabled', () => {
    const onFileSelected = vi.fn();
    render(<DropZone onFileSelected={onFileSelected} disabled />);
    const zone = screen.getByRole('button', { name: /upload a document/i });

    dropFile(zone, pdf());

    expect(onFileSelected).not.toHaveBeenCalled();
    expect(zone).toHaveAttribute('aria-disabled', 'true');
  });
});
