import type { Note, Taxonomy } from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NoteEditor } from '../notes/NoteEditor';
import { AudioPreview } from './AudioPreview';
import type { OutboxEntry } from './outbox';

const button = 'rounded-md border border-line px-4 py-2 hover:bg-surface-hover';

const draftOf = (e: OutboxEntry): Note => ({
  id: e.clientId,
  clientId: e.clientId,
  body: e.body,
  status: 'draft',
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  createdAt: e.createdAt,
  updatedAt: e.createdAt,
});

const EMPTY_SUGGESTION = {
  categoryIds: [],
  tagIds: [],
  newCategories: [],
  newTags: [],
  dueDate: null,
  importance: null,
  urgency: null,
  unreadLinks: [],
};

/** Notes captured offline: pick one, review it in the editor, confirm to send. */
export function OutboxDialog({
  entries,
  taxonomy,
  onSend,
  onClose,
}: {
  entries: OutboxEntry[];
  taxonomy: Taxonomy;
  /** Sends one note; rejects when it failed (the item stays queued). */
  onSend: (entry: OutboxEntry, body: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const open = entries.find((e) => e.clientId === openId);

  const send = async (entry: OutboxEntry, body: string) => {
    setBusy(true);
    setFailed(false);
    try {
      await onSend(entry, body);
      setOpenId(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('offline.dialogTitle')}
      className="fixed inset-0 z-20 overflow-y-auto bg-bg p-4 text-fg"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 text-start">
        <h2 className="text-lg font-semibold">{t('offline.dialogTitle')}</h2>
        {open ? (
          <>
            {open.hasAudio && <AudioPreview clientId={open.clientId} />}
            <NoteEditor
              key={open.clientId}
              note={draftOf(open)}
              suggestion={EMPTY_SUGGESTION}
              taxonomy={taxonomy}
              busy={busy}
              failed={failed}
              onSubmit={(edit) => void send(open, edit.body ?? open.body)}
              onCancel={() => setOpenId(null)}
            />
          </>
        ) : (
          <>
            <p className="text-muted">{t('offline.dialogHint', { count: entries.length })}</p>
            <ul className="flex flex-col gap-2">
              {entries.map((e) => (
                <li key={e.clientId}>
                  <button
                    type="button"
                    onClick={() => setOpenId(e.clientId)}
                    className={`${button} w-full text-start`}
                  >
                    {e.hasAudio ? t('offline.voiceNote') : e.body}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClose} className={`${button} self-start`}>
              {t('offline.later')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
