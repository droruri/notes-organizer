import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Loading } from '../../ui/Loading';
import { useEscape } from '../../ui/useEscape';

export function ReaderSheet({ url, onClose }: { url: string; onClose: () => void }) {
  const { t } = useTranslation();
  const reader = useQuery({
    queryKey: ['link-reader', url],
    queryFn: () => api.linkPreview(url, true),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  useEscape(onClose);
  const paragraphs = reader.data?.kind === 'article' ? (reader.data.paragraphs ?? []) : [];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('links.reader')}
      className="backdrop enter-fade flex items-end justify-center sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="enter-sheet flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[20px] bg-surface text-fg shadow-2xl sm:rounded-[20px]">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium text-accent underline-offset-2 hover:underline"
          >
            {t('links.original')}
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('links.close')}
            className="btn btn-ghost btn-icon btn-sm ms-auto"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <article
          dir="auto"
          className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8"
        >
          {reader.isPending && <Loading label={t('links.loading')} />}
          {reader.isError && (
            <p role="alert" className="notice notice-danger">
              {t('links.failed')}
            </p>
          )}
          {reader.data?.kind === 'article' && reader.data.title && (
            <h2 className="text-2xl leading-tight font-bold tracking-tight">{reader.data.title}</h2>
          )}
          {paragraphs.map((p, i) => (
            <p key={i} className="max-w-[68ch] text-[1.0625rem] leading-[1.75] break-words">
              {p}
            </p>
          ))}
        </article>
      </div>
    </div>
  );
}
