import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

export function ReaderSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  const reader = useQuery({
    queryKey: ['link-reader', url],
    queryFn: () => api.linkPreview(url, true),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  const paragraphs = reader.data?.kind === 'article' ? (reader.data.paragraphs ?? []) : [];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('links.reader')}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
    >
      <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-t-xl bg-bg p-4 text-fg sm:rounded-xl">
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-muted underline"
          >
            {t('links.original')}
          </a>
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
          >
            {t('links.close')}
          </button>
        </div>
        {reader.isPending && <p className="text-muted">{t('links.loading')}</p>}
        {reader.isError && <p role="alert">{t('links.failed')}</p>}
        {reader.data?.kind === 'article' && reader.data.title && (
          <h2 className="text-lg font-semibold">{reader.data.title}</h2>
        )}
        {paragraphs.map((p, i) => (
          <p key={i} className="break-words leading-relaxed">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
