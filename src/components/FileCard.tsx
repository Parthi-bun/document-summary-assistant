import { formatBytes } from '../lib/fileValidation';
import { FileIcon, XIcon } from './icons';

interface FileCardProps {
  file: File;
  methodLabel: string | null;
  onRemove: () => void;
  removeDisabled?: boolean;
}

export function FileCard({ file, methodLabel, onRemove, removeDisabled = false }: FileCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <FileIcon />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900" title={file.name}>
          {file.name}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {formatBytes(file.size)}
          {methodLabel ? ` · ${methodLabel}` : ''}
        </p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        disabled={removeDisabled}
        aria-label={`Remove ${file.name} and start over`}
        className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
