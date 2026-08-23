interface ProgressPanelProps {
  value: number;
  message: string;
  onCancel: () => void;
}

export function ProgressPanel({ value, message, onCancel }: ProgressPanelProps) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-sm font-medium text-slate-800">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
            aria-hidden="true"
          />
          {message}
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          Cancel
        </button>
      </div>

      <div
        className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Processing progress"
      >
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Announces phase changes to screen readers without stealing focus. */}
      <p className="sr-only" role="status" aria-live="polite">
        {message} {percent}% complete.
      </p>
    </div>
  );
}
