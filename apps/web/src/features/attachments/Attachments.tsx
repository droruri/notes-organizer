import { ATTACHMENT_MIMES, AttachmentError, type Attachment } from '@notes/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiRequestError } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { FileRow } from './FileRow';
import { shrinkImage } from './shrinkImage';
import { Thumbnail } from './Thumbnail';

type Pending = { key: number; name: string; error: string | null };

/** A note's files: tap one to download it; `editable` adds the "Add file" button. */
export function Attachments({
  noteId,
  attachments,
  editable,
}: {
  noteId: string;
  attachments: Attachment[];
  editable: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  // The editor's note is a snapshot, so files added here are kept locally as well.
  const [added, setAdded] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removeFailed, setRemoveFailed] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const nextKey = useRef(0);
  const known = new Set(attachments.map((a) => a.id));
  const rows = [...attachments, ...added.filter((a) => !known.has(a.id))].filter(
    (a) => !removed.has(a.id),
  );

  const patch = (key: number, error: string | null) =>
    setPending((p) => p.map((r) => (r.key === key ? { ...r, error } : r)));

  function messageFor(err: unknown): string {
    const code = err instanceof ApiRequestError ? AttachmentError.safeParse(err.code) : null;
    return t(`attachments.errors.${code?.success ? code.data : 'failed'}`);
  }

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const queued = files.map((file) => ({ key: nextKey.current++, file }));
    setPending((p) => [
      ...p,
      ...queued.map((q) => ({ key: q.key, name: q.file.name, error: null })),
    ]);
    // One at a time; a failure stays on its own row and the rest continue.
    for (const { key, file } of queued) {
      try {
        const attachment = await api.uploadAttachment(noteId, await shrinkImage(file));
        setAdded((a) => [...a, attachment]);
        setPending((p) => p.filter((r) => r.key !== key));
        void queryClient.invalidateQueries({ queryKey: ['notes'] });
      } catch (err) {
        patch(key, messageFor(err));
      }
    }
  }

  async function remove(a: Attachment) {
    if (confirming !== a.id) {
      setConfirming(a.id);
      return;
    }
    setConfirming(null);
    setRemoveFailed(false);
    try {
      await api.deleteAttachment(noteId, a.id);
      setRemoved((r) => new Set(r).add(a.id));
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
    } catch {
      setRemoveFailed(true);
    }
  }

  async function download(a: Attachment) {
    setDownloadFailed(false);
    try {
      const url = URL.createObjectURL(await api.attachmentFile(noteId, a.id));
      const link = document.createElement('a');
      link.href = url;
      link.download = a.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setDownloadFailed(true);
    }
  }

  if (!editable && rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {(rows.length > 0 || pending.length > 0) && (
        <ul aria-label={t('attachments.list')} className="flex flex-col gap-1.5">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-1.5">
              <div className="min-w-0 flex-1">
                {a.mime.startsWith('image/') ? (
                  <Thumbnail noteId={noteId} a={a} onDownload={() => void download(a)} />
                ) : (
                  <FileRow
                    a={a}
                    onOpen={() => void download(a)}
                    label={t('attachments.open', { name: a.name })}
                  />
                )}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => void remove(a)}
                  onBlur={() => setConfirming((c) => (c === a.id ? null : c))}
                  aria-label={t('attachments.remove', { name: a.name })}
                  className="btn btn-sm shrink-0"
                >
                  {confirming === a.id ? (
                    t('attachments.confirmRemove')
                  ) : (
                    <Icon name="close" size={14} />
                  )}
                </button>
              )}
            </li>
          ))}
          {pending.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-sm">
              {r.error === null ? (
                <span aria-hidden="true" className="spinner" />
              ) : (
                <Icon name="file" size={16} className="shrink-0 text-muted" />
              )}
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {r.name}
              </span>
              {r.error === null ? (
                <span className="sr-only">{t('attachments.uploading')}</span>
              ) : (
                <span role="alert" className="text-danger">
                  {r.error}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {removeFailed && (
        <p role="alert" className="text-sm text-danger">
          {t('attachments.removeFailed')}
        </p>
      )}
      {downloadFailed && (
        <p role="alert" className="text-sm text-danger">
          {t('attachments.downloadFailed')}
        </p>
      )}
      {editable && (
        <>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept={ATTACHMENT_MIMES.join(',')}
            aria-label={t('attachments.add')}
            data-testid="attachment-input"
            onChange={(e) => void onPick(e)}
          />
          <input
            ref={camera}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            aria-label={t('attachments.takePhoto')}
            data-testid="attachment-camera-input"
            onChange={(e) => void onPick(e)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => input.current?.click()} className="btn btn-sm">
              <Icon name="paperclip" size={14} />
              {t('attachments.add')}
            </button>
            <button type="button" onClick={() => camera.current?.click()} className="btn btn-sm">
              <Icon name="camera" size={14} />
              {t('attachments.takePhoto')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
