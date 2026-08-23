import { LENGTH_SPECS, SUMMARY_LENGTHS, type SummaryLength } from '../../shared/contract';

interface LengthSelectorProps {
  value: SummaryLength;
  onChange: (length: SummaryLength) => void;
  disabled?: boolean;
}

const DESCRIPTIONS: Record<SummaryLength, string> = {
  short: 'A quick gist',
  medium: 'Balanced overview',
  long: 'Detailed breakdown',
};

/**
 * Radio group rather than buttons so screen readers announce the selection and
 * arrow keys move between options natively.
 */
export function LengthSelector({ value, onChange, disabled = false }: LengthSelectorProps) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm font-semibold text-slate-900">Summary length</legend>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {SUMMARY_LENGTHS.map((length) => {
          const selected = value === length;
          return (
            <label
              key={length}
              className={[
                'flex cursor-pointer flex-col rounded-xl border px-4 py-3 transition',
                disabled ? 'cursor-not-allowed opacity-60' : '',
                selected
                  ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              ].join(' ')}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="summary-length"
                  value={length}
                  checked={selected}
                  onChange={() => onChange(length)}
                  className="h-4 w-4 shrink-0 accent-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-900">{LENGTH_SPECS[length].label}</span>
              </span>
              <span className="mt-1 pl-6 text-xs text-slate-500">{DESCRIPTIONS[length]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
