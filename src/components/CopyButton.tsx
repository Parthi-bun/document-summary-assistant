import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './icons';

interface CopyButtonProps {
  /** Resolved lazily so the latest content is copied. */
  getText: () => string;
  label?: string;
  className?: string;
}

export function CopyButton({ getText, label = 'Copy', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    const text = getText();
    try {
      // navigator.clipboard is unavailable on insecure origins and older Safari.
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 2200);
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 ${className}`}
    >
      {copied ? <CheckIcon className="h-3.5 w-3.5 text-emerald-600" /> : <CopyIcon className="h-3.5 w-3.5" />}
      <span>{failed ? 'Press Ctrl+C' : copied ? 'Copied' : label}</span>
    </button>
  );
}
