import {
  MAX_IMPORT_CHARS,
  type ImportAnalyze,
  type ImportConfirm,
  type ImportCreated,
  type ImportProposal,
  type Taxonomy,
  type Workspace,
} from '@notes/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { useEscape } from '../../ui/useEscape';
import { ImportReview } from './ImportReview';

export type ImportResult = { created: ImportCreated['created']; unreadNotes: number };

/** Full-screen import flow: paste or pick a .txt → analyze → review → confirm. */
export function ImportDialog({
  taxonomy,
  workspaces = [],
  currentWorkspaceId,
  today,
  locale,
  onClose,
  onImported,
  analyze = api.analyzeImport,
  confirm = api.confirmImport,
}: {
  taxonomy: Taxonomy;
  /** Offered in a picker when there is a choice; the batch is imported into the picked one. */
  workspaces?: readonly Workspace[];
  currentWorkspaceId?: string | undefined;
  today: string;
  locale: 'he' | 'en';
  onClose: () => void;
  onImported: (result: ImportResult) => void;
  analyze?: (input: ImportAnalyze) => Promise<ImportProposal>;
  confirm?: (input: ImportConfirm) => Promise<ImportCreated>;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [workspaceId, setWorkspaceId] = useState(currentWorkspaceId ?? '');
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

  useEscape(onClose);
  const tooLong = text.length > MAX_IMPORT_CHARS;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('import.title')}
      className="screen enter-rise text-fg"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 text-start">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight">{t('import.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('import.cancel')}
            className="btn btn-ghost btn-icon"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        {workspaces.length > 1 && (
          <label className="label">
            {t('import.workspace')}
            <select
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="field"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {proposal ? (
          <ImportReview
            proposal={proposal}
            taxonomy={taxonomy}
            busy={saving.isPending}
            failed={saving.isError}
            onConfirm={(body) => saving.mutate(workspaceId ? { ...body, workspaceId } : body)}
            onCancel={onClose}
          />
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (text.trim() && !tooLong) analysis.mutate({ text, today, locale });
            }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              dir="auto"
              aria-label={t('import.textLabel')}
              placeholder={t('import.placeholder')}
              className="field"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="btn btn-sm relative cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                <Icon name="upload" size={16} />
                {t('import.file')}
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setText(await file.text());
                  }}
                />
              </label>
              <span className={`text-xs tabular-nums ${tooLong ? 'text-danger' : 'text-muted'}`}>
                {text.length.toLocaleString()} / {MAX_IMPORT_CHARS.toLocaleString()}
              </span>
            </div>
            {tooLong && (
              <p role="alert" className="notice notice-danger">
                {t('import.tooLong')}
              </p>
            )}
            {analysis.isPending && (
              <p role="status" className="notice notice-info">
                <span aria-hidden="true" className="spinner mt-1 shrink-0" />
                {t('import.analyzing')}
              </p>
            )}
            {analysis.isError && (
              <p role="alert" className="notice notice-danger">
                {t('import.error')}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={analysis.isPending || text.trim() === '' || tooLong}
                className="btn btn-primary"
              >
                <Icon name="spark" size={16} />
                {t('import.analyze')}
              </button>
              <button type="button" onClick={onClose} className="btn btn-ghost">
                {t('import.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
