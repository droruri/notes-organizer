import type { Attachment } from '@notes/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { FileRow } from './FileRow';

/** An image's thumbnail, fetched when it mounts; a failed load falls back to the file row. */
export function Thumbnail({
  noteId,
  a,
  onDownload,
}: {
  noteId: string;
  a: Attachment;
  onDownload: () => void;
}) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const image = useQuery({
    queryKey: ['attachment', a.id],
    // The object URL lives as long as the cached query, like the audio player's.
    queryFn: async () => URL.createObjectURL(await api.attachmentFile(noteId, a.id)),
    staleTime: Infinity,
    retry: false,
  });
  if (image.isError || broken) {
    return <FileRow a={a} onOpen={onDownload} label={t('attachments.open', { name: a.name })} />;
  }
  if (!image.data) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-surface-2">
        <span aria-hidden="true" className="spinner" />
        <span className="sr-only">{t('attachments.loading')}</span>
      </div>
    );
  }
  const url = image.data;
  return (
    <button
      type="button"
      onClick={() => window.open(url, '_blank', 'noopener')}
      aria-label={t('attachments.view', { name: a.name })}
      className="block w-fit overflow-hidden rounded-lg"
    >
      <img
        src={url}
        alt={a.name}
        onError={() => setBroken(true)}
        className="max-h-40 max-w-full object-cover"
      />
    </button>
  );
}
