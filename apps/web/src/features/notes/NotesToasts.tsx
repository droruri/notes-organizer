import { useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { useRestoreNote } from '../../api';
import { Toast } from '../../ui/Toast';
import { useTimeout } from '../../ui/useTimeout';
import type { ImportResult } from '../import/ImportDialog';
import { formatDate } from './formatDate';

const UNDO_MS = 5000;

/** What `NotesScreen` can ask the toast stack to show. */
export type NotesToastsHandle = {
  showImported: (result: ImportResult) => void;
  /** Name of the workspace a note was saved in, when it is not the current one. */
  showSavedIn: (name: string | null) => void;
  showOffline: (notice: 'saved' | 'failed') => void;
  showDeleted: (id: string) => void;
  showSnoozed: (id: string, day: string) => void;
  hideSnoozed: () => void;
};

/** The toast stack and its state, so a toast opening or closing never re-renders the notes list. */
export function NotesToasts({
  ref,
  outboxCount,
  onShowUnread,
  onUndoSnooze,
  onSaveFailedChange,
}: {
  ref: Ref<NotesToastsHandle>;
  outboxCount: number;
  /** "Show" on the import toast: filter to notes with unread links. */
  onShowUnread: () => void;
  onUndoSnooze: (id: string) => void;
  /** The offline "save failed" notice appeared or went away. */
  onSaveFailedChange: (failed: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [savedIn, setSavedIn] = useState<string | null>(null);
  const [offlineNotice, setOfflineNotice] = useState<'saved' | 'failed' | null>(null);
  const [snoozeUndo, setSnoozeUndo] = useState<{ id: string; day: string } | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const undo = useRestoreNote();

  // The flag follows the toast's own state, so a remount (which resets it) also clears it.
  const saveFailed = offlineNotice === 'failed';
  useEffect(() => onSaveFailedChange(saveFailed), [saveFailed, onSaveFailedChange]);

  useImperativeHandle(ref, () => ({
    showImported: setImported,
    showSavedIn: setSavedIn,
    showOffline: setOfflineNotice,
    showDeleted: setUndoId,
    showSnoozed: (id, day) => setSnoozeUndo({ id, day }),
    hideSnoozed: () => setSnoozeUndo(null),
  }));
  useTimeout(snoozeUndo, () => setSnoozeUndo(null), UNDO_MS);
  useTimeout(undoId, () => setUndoId(null), UNDO_MS);

  const dismissOffline = () => setOfflineNotice(null);
  const restore = (id: string) =>
    undo.mutate(id, { onSuccess: () => setUndoId(null), onError: () => setUndoId(null) });

  return (
    <>
      {undo.isError && (
        <p role="alert" className="notice notice-danger">
          {t('notes.error')}
        </p>
      )}
      <div className="toast-stack">
        {imported && (
          <Toast
            onClose={() => setImported(null)}
            actions={
              <>
                {imported.unreadNotes > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onShowUnread();
                      setImported(null);
                    }}
                    className="btn btn-sm"
                  >
                    {t('import.show')}
                  </button>
                )}
                <button type="button" onClick={() => setImported(null)} className="btn btn-sm">
                  {t('import.dismiss')}
                </button>
              </>
            }
          >
            {imported.unreadNotes > 0
              ? t('import.toastUnread', {
                  notes: imported.created.notes,
                  count: imported.unreadNotes,
                })
              : t('import.done', { count: imported.created.notes })}
          </Toast>
        )}
        {/* The "saved on this device" toast has done its job once the queue has been sent. */}
        {offlineNotice !== null && !(offlineNotice === 'saved' && outboxCount === 0) && (
          <Toast
            // Only the "saved" notice closes by itself; a failure stays until the user dismisses it.
            onClose={offlineNotice === 'saved' ? dismissOffline : undefined}
            actions={
              <button type="button" onClick={dismissOffline} className="btn btn-sm">
                {t('offline.dismiss')}
              </button>
            }
          >
            {t(offlineNotice === 'saved' ? 'offline.saved' : 'offline.saveFailed')}
          </Toast>
        )}
        {savedIn !== null && (
          <Toast
            onClose={() => setSavedIn(null)}
            actions={
              <button type="button" onClick={() => setSavedIn(null)} className="btn btn-sm">
                {t('import.dismiss')}
              </button>
            }
          >
            {t('notes.savedIn', { name: savedIn })}
          </Toast>
        )}
        {snoozeUndo !== null && (
          <Toast
            actions={
              <button
                type="button"
                onClick={() => onUndoSnooze(snoozeUndo.id)}
                className="btn btn-sm"
              >
                {t('notes.undo')}
              </button>
            }
          >
            {t('snooze.toast', { date: formatDate(snoozeUndo.day, i18n.language) })}
          </Toast>
        )}
        {undoId !== null && (
          <Toast
            actions={
              <button type="button" onClick={() => restore(undoId)} className="btn btn-sm">
                {t('notes.undo')}
              </button>
            }
          >
            {t('notes.deleted')}
          </Toast>
        )}
      </div>
    </>
  );
}
