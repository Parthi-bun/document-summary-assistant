import { useCallback, useId, useRef, useState, type DragEvent } from 'react';
import { ACCEPT_ATTRIBUTE, MAX_FILE_BYTES, formatBytes } from '../lib/fileValidation';
import { UploadIcon } from './icons';

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export function DropZone({ onFileSelected, disabled = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Drag events fire for child elements too; counting keeps the highlight stable.
  const dragDepth = useRef(0);
  const describedBy = useId();

  const openPicker = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setIsDragging(false);
      if (disabled) return;

      // Only the first file is used; this is a single-document tool.
      const file = event.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [disabled, onFileSelected],
  );

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Upload a document"
      aria-describedby={describedBy}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openPicker();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        if (!disabled) setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setIsDragging(false);
      }}
      onDrop={handleDrop}
      className={[
        'group flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition sm:py-16',
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-60'
          : isDragging
            ? 'border-indigo-500 bg-indigo-50/80 ring-4 ring-indigo-100'
            : 'border-slate-300 bg-white/70 hover:border-indigo-400 hover:bg-indigo-50/40',
      ].join(' ')}
    >
      <span
        className={[
          'mb-4 flex h-14 w-14 items-center justify-center rounded-full transition',
          isDragging ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200',
        ].join(' ')}
      >
        <UploadIcon className="h-6 w-6" />
      </span>

      <p className="text-base font-semibold text-slate-900 sm:text-lg">
        {isDragging ? 'Drop the file to start' : 'Drag a document here, or click to browse'}
      </p>
      <p id={describedBy} className="mt-2 max-w-sm text-sm text-slate-500">
        PDF or image (PNG, JPG, WEBP, BMP, TIFF) up to {formatBytes(MAX_FILE_BYTES)}. Scanned pages are read with OCR.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        aria-label="Choose a PDF or image file to summarize"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clearing the value lets the same file be re-selected after a reset.
          event.target.value = '';
          if (file) onFileSelected(file);
        }}
      />
    </div>
  );
}
