import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotes, useRefreshNotes } from '../../api';
import { useSlow } from '../../ui/useSlow';
import { useTimeout } from '../../ui/useTimeout';
import { useNotesSync, type SyncResult } from './syncStatus';
import { useOnline } from './useOnline';

type Done = { kind: 'updated'; count: number } | { kind: 'upToDate' } | { kind: 'failed' };

const DONE_MS = 2500;
const FAILED_MS = 6000;

/** Short time for today, date + time for an older save. */
function formatSaved(ms: number, lang: string): string {
  const time = new Intl.DateTimeFormat(lang, { timeStyle: 'short' });
  if (new Date(ms).toDateString() === new Date().toDateString()) return time.format(ms);
  return new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' }).format(ms);
}

function toDone(result: SyncResult, wasVisible: boolean): Done | null {
  if (result.failed) return result.network || !wasVisible ? null : { kind: 'failed' };
  if (result.count > 0) return { kind: 'updated', count: result.count };
  return wasVisible ? { kind: 'upToDate' } : null;
}

// Each icon has its own key so a state change remounts it and `enter-fade` cross-fades the swap.
const spinner = () => (
  <svg
    key="spinner"
    aria-hidden="true"
    viewBox="0 0 16 16"
    className="enter-fade size-4 shrink-0 animate-[spin_1s_linear_infinite] motion-reduce:animate-none"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <circle cx="8" cy="8" r="6" opacity="0.25" />
    <path d="M14 8a6 6 0 0 0-6-6" />
  </svg>
);

const icon = (path: string, className: string) => (
  <svg
    key={path}
    aria-hidden="true"
    viewBox="0 0 16 16"
    className={`enter-fade size-4 shrink-0 ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={path} />
  </svg>
);

const pill =
  'enter-rise flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full border border-transparent bg-surface/90 px-3 py-1.5 text-sm text-balance text-fg shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_2px_4px_rgb(0_0_0/0.06),0_8px_24px_rgb(0_0_0/0.1)] backdrop-blur-md';

/** The notes sync status: syncing, slow (with the saved time), updated · N, up to date, failed. */
export function SyncPill() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const { fetching, background, result } = useNotesSync();
  const refresh = useRefreshNotes();
  const { dataUpdatedAt } = useNotes();
  const active = fetching && background;
  const visible = useSlow(active, 1000);
  const slow = useSlow(active, 8000);
  const [done, setDone] = useState<Done | null>(null);
  const [seen, setSeen] = useState<SyncResult | undefined>(undefined);
  // A new result arrives while the pill is still showing (useSlow resets after this render).
  if (result !== seen) {
    setSeen(result);
    setDone(result ? toDone(result, visible) : null);
  }
  useTimeout(done, () => setDone(null), done?.kind === 'failed' ? FAILED_MS : DONE_MS);

  let body: React.ReactNode = null;
  let announced = true;
  if (online && active && visible) {
    announced = !!slow;
    body = slow ? (
      <>
        {icon('M8 2 1.5 13.5h13zM8 6.5v3M8 11.8v.1', 'text-warn')}
        {dataUpdatedAt > 0
          ? t('sync.slow', { time: formatSaved(dataUpdatedAt, i18n.language) })
          : t('sync.slowNoTime')}
      </>
    ) : (
      <>
        {spinner()}
        {t('sync.syncing')}
      </>
    );
  } else if (online && done) {
    body =
      done.kind === 'failed' ? (
        <>
          {icon('M8 2 1.5 13.5h13zM8 6.5v3M8 11.8v.1', 'text-warn')}
          {t('sync.failed')}
          <button
            type="button"
            onClick={() => void refresh()}
            className="pointer-events-auto rounded-full px-2 font-medium text-accent underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11"
          >
            {t('sync.retry')}
          </button>
        </>
      ) : (
        <>
          {icon('m3 8.5 3.2 3.2L13 4.8', 'text-ok')}
          {done.kind === 'updated' ? t('sync.updated', { count: done.count }) : t('sync.upToDate')}
        </>
      );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-[calc(0.5rem+env(safe-area-inset-top))] z-30 flex justify-center lg:ps-64"
    >
      {body && (
        <div
          aria-hidden={announced ? undefined : true}
          className={pill}
          data-kind={done && !active ? done.kind : slow ? 'slow' : 'syncing'}
        >
          {body}
        </div>
      )}
    </div>
  );
}
