import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { ReaderSheet } from './ReaderSheet';

export function ArticleCard({ url }: { url: string }) {
  const { t } = useTranslation();
  const [reading, setReading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const preview = useQuery({
    queryKey: ['link-preview', url],
    queryFn: () => api.linkPreview(url),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  if (preview.data?.kind !== 'article') return null;
  const { title, description, image, siteName } = preview.data;
  return (
    <>
      <button
        type="button"
        onClick={() => setReading(true)}
        className="flex w-full items-stretch gap-3 overflow-hidden rounded-lg border border-line text-start hover:bg-surface-hover"
      >
        {image && !imageFailed && (
          // Many sites block hotlinked images when a Referer is sent.
          <img
            src={image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-20 w-20 shrink-0 object-cover"
          />
        )}
        <span className="flex min-w-0 flex-col justify-center gap-0.5 p-2">
          {siteName && (
            <span dir="auto" className="truncate text-xs text-muted">
              {siteName}
            </span>
          )}
          <span dir="auto" className="line-clamp-2 font-medium">
            {title ?? url}
          </span>
          {description && (
            <span dir="auto" className="line-clamp-2 text-sm text-muted">
              {description}
            </span>
          )}
          <span className="sr-only">{t('links.open')}</span>
        </span>
      </button>
      {reading && <ReaderSheet url={url} onClose={() => setReading(false)} />}
    </>
  );
}
