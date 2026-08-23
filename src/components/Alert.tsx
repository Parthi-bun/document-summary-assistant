import type { ReactNode } from 'react';
import { AlertIcon, KeyIcon } from './icons';

type Tone = 'error' | 'warning' | 'config';

const TONES: Record<Tone, { wrapper: string; icon: string; title: string }> = {
  error: { wrapper: 'border-rose-200 bg-rose-50', icon: 'text-rose-600', title: 'text-rose-900' },
  warning: { wrapper: 'border-amber-200 bg-amber-50', icon: 'text-amber-600', title: 'text-amber-900' },
  config: { wrapper: 'border-indigo-200 bg-indigo-50', icon: 'text-indigo-600', title: 'text-indigo-900' },
};

interface AlertProps {
  tone: Tone;
  title: string;
  children?: ReactNode;
}

export function Alert({ tone, title, children }: AlertProps) {
  const styles = TONES[tone];
  const Icon = tone === 'config' ? KeyIcon : AlertIcon;

  return (
    <div role="alert" className={`flex gap-3 rounded-2xl border p-4 ${styles.wrapper}`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${styles.icon}`} />
      <div className="min-w-0 text-sm">
        <p className={`font-semibold ${styles.title}`}>{title}</p>
        {children ? <div className="mt-1.5 space-y-2 text-slate-700">{children}</div> : null}
      </div>
    </div>
  );
}
