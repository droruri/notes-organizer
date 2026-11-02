import { EMPTY_SUGGESTION, type Note, type Taxonomy } from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NoteEditor } from '../notes/NoteEditor';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { AudioPreview } from './AudioPreview';
import type { OutboxEntry } from './outbox';

const draftOf = (e: OutboxEntry): Note => ({
  id: e.clientId,
  clientId: e.clientId,
  title: e.title ?? null,
  body: e.body,
  status: 'draft',
  workspaceId: e.workspaceId ?? '00000000-0000-4000-8000-000000000000',
  importance: null,
  urgency: null,
  dueDate: null,
  proposed: null,
  unreadLinks: [],
  categoryIds: [],
  tagIds: [],
  hasAudio: false,
  attachments: [],
  createdAt: e.createdAt,
  updatedAt: e.createdAt,
});

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
    <Sheet
      title={t('offline.dialogTitle')}
      onClose={onClose}
      // The open editor may hold unsaved edits; closing the sheet would drop them.
      dirty={open !== undefined}
      wide
    >
      <div className="flex w-full flex-col gap-5 p-5 text-start">
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
            <ul className="flex flex-col gap-2.5">
              {entries.map((e) => (
                <li key={e.clientId}>
                  <button
                    type="button"
                    onClick={() => setOpenId(e.clientId)}
                    className="card slip status-draft flex w-full items-center gap-2 p-4 ps-5 text-start"
                  >
                    {e.hasAudio && <Icon name="mic" size={16} className="shrink-0 text-muted" />}
                    <span dir="auto" className="line-clamp-3 break-words">
                      {e.hasAudio ? t('offline.voiceNote') : e.body}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClose} className="btn self-start">
              {t('offline.later')}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}
