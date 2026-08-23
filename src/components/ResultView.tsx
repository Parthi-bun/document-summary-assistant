import type { ReactNode } from 'react';
import type { SummaryLength, SummaryResult } from '../../shared/contract';
import { formatResultAsText } from '../lib/formatResult';
import { CopyButton } from './CopyButton';
import { LightbulbIcon, ListIcon, SparkIcon } from './icons';

interface ResultViewProps {
  result: SummaryResult;
  length: SummaryLength;
  fileName?: string;
  /** Dims the panel while a new length is being generated. */
  busy?: boolean;
}

export function ResultView({ result, length, fileName, busy = false }: ResultViewProps) {
  return (
    <section
      aria-label="Summary results"
      aria-busy={busy}
      className={`space-y-4 transition-opacity ${busy ? 'pointer-events-none opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Results</h2>
        <CopyButton getText={() => formatResultAsText(result, { fileName, length })} label="Copy all" />
      </div>

      <Card
        icon={<SparkIcon className="h-4 w-4" />}
        title="Summary"
        accent="indigo"
        action={<CopyButton getText={() => result.summary} />}
      >
        <div className="space-y-3 text-[0.95rem] leading-relaxed text-slate-700">
          {result.summary.split(/\n\s*\n/).map((paragraph, index) => (
            <p key={index}>{paragraph.trim()}</p>
          ))}
        </div>
      </Card>

      <Card
        icon={<ListIcon className="h-4 w-4" />}
        title="Key points"
        accent="emerald"
        badge={`${result.keyPoints.length}`}
        action={<CopyButton getText={() => result.keyPoints.map((point) => `• ${point}`).join('\n')} />}
      >
        <ul className="space-y-2.5">
          {result.keyPoints.map((point, index) => (
            <li key={index} className="flex gap-3 text-[0.95rem] leading-relaxed text-slate-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[0.7rem] font-semibold text-emerald-700">
                {index + 1}
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        icon={<LightbulbIcon className="h-4 w-4" />}
        title="Improvement suggestions"
        accent="amber"
        badge={`${result.improvementSuggestions.length}`}
        description="How this document itself could be made clearer, better structured, or more actionable."
        action={
          <CopyButton getText={() => result.improvementSuggestions.map((item) => `• ${item}`).join('\n')} />
        }
      >
        <ul className="space-y-2.5">
          {result.improvementSuggestions.map((suggestion, index) => (
            <li key={index} className="flex gap-3 text-[0.95rem] leading-relaxed text-slate-700">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <span>{suggestion}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

const ACCENTS = {
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
} as const;

interface CardProps {
  icon: ReactNode;
  title: string;
  accent: keyof typeof ACCENTS;
  children: ReactNode;
  action?: ReactNode;
  badge?: string;
  description?: string;
}

function Card({ icon, title, accent, children, action, badge, description }: CardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-900 uppercase">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${ACCENTS[accent]}`}>{icon}</span>
            {title}
            {badge ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 normal-case">
                {badge}
              </span>
            ) : null}
          </h3>
          {description ? <p className="mt-1.5 text-xs text-slate-500">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </article>
  );
}
