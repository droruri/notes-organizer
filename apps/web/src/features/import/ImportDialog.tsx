import {
  MAX_IMPORT_CHARS,
  type ImportAnalyze,
  type ImportConfirm,
  type ImportCreated,
  type ImportProposal,
  type Taxonomy,
} from '@notes/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { ImportReview } from './ImportReview';

export type ImportResult = { created: ImportCreated['created']; unreadNotes: number };

/** Full-screen import flow: paste or pick a .txt → analyze → review → confirm. */
export function ImportDialog({
  taxonomy,
  today,
  locale,
  onClose,
  onImported,
  analyze = api.analyzeImport,
  confirm = api.confirmImport,
}: {
  taxonomy: Taxonomy;
  today: string;
  locale: 'he' | 'en';
  onClose: () => void;
  onImported: (result: ImportResult) => void;
  analyze?: (input: ImportAnalyze) => Promise<ImportProposal>;
  confirm?: (input: ImportConfirm) => Promise<ImportCreated>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [proposal, setProposal] = useState<ImportProposal | null>(null);
  const analysis = useMutation({ mutationFn: analyze, onSuccess: setProposal });
  const saving = useMutation({
    mutationFn: confirm,
    onSuccess: (done, body) =>
      onImported({
        created: done.created,
        unreadNotes: body.notes.filter((n) => (n.unreadLinks?.length ?? 0) > 0).length,
      }),
  });

  const tooLong = text.length > MAX_IMPORT_CHARS;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('import.title')}
      className="fixed inset-0 z-20 overflow-y-auto bg-bg p-4 text-fg"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 text-start">
        <h2 className="text-lg font-semibold">{t('import.title')}</h2>
        {proposal ? (
          <ImportReview
            proposal={proposal}
            taxonomy={taxonomy}
            busy={saving.isPending}
            failed={saving.isError}
            onConfirm={(body) => saving.mutate(body)}
            onCancel={onClose}
          />
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() && !tooLong) analysis.mutate({ text, today, locale });
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              aria-label={t('import.textLabel')}
              placeholder={t('import.placeholder')}
              className="rounded-md border border-line bg-bg px-2 py-1"
            />
            <label className="flex flex-col gap-1 text-sm text-muted">
              {t('import.file')}
              <input
                type="file"
                accept=".txt,text/plain"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setText(await file.text());
                }}
              />
            </label>
            {tooLong && (
              <p role="alert" className="text-danger">
                {t('import.tooLong')}
              </p>
            )}
            {analysis.isPending && <p role="status">{t('import.analyzing')}</p>}
            {analysis.isError && (
              <p role="alert" className="text-danger">
                {t('import.error')}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={analysis.isPending || text.trim() === '' || tooLong}
                className="rounded-md bg-fg px-4 py-2 text-bg disabled:opacity-50"
              >
                {t('import.analyze')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-line px-4 py-2 hover:bg-surface-hover"
              >
                {t('import.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
