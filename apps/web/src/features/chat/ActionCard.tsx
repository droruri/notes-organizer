import type { AgentAction, NoteAction } from '@notes/shared';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

export type CardState = 'idle' | 'busy' | 'done' | 'dismissed';

/** One line per field a note change card edits. */
function noteLines(action: NoteAction, t: TFunction): string[] {
  const { edit, labels } = action;
  const none = t('notes.none');
  return [
    edit.status !== undefined &&
      `${t('notes.status.label')}: ${edit.status === null ? none : t(`notes.status.${edit.status}`)}`,
    edit.dueDate !== undefined && `${t('notes.dueDate')}: ${edit.dueDate ?? none}`,
    edit.importance !== undefined &&
      `${t('notes.importance')}: ${edit.importance === null ? none : t(`notes.importanceValues.${edit.importance}`)}`,
    edit.urgency !== undefined &&
      `${t('notes.urgency')}: ${edit.urgency === null ? none : t(`notes.urgencyValues.${edit.urgency}`)}`,
    edit.categoryIds !== undefined &&
      `${t('chat.action.categories')}: ${labels.categories.join(', ') || none}`,
    edit.tagIds !== undefined && `${t('chat.action.tags')}: ${labels.tags.join(', ') || none}`,
  ].filter((l): l is string => l !== false);
}

/** A taxonomy or note change the agent proposed. Presentational: the action group owns its state. */
export function ActionCard({
  action,
  state,
  error,
  locked,
  onApprove,
  onDismiss,
}: {
  action: AgentAction;
  state: CardState;
  error: string | null;
  /** A request is in flight somewhere in the group: every button is disabled. */
  locked: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  const title =
    action.kind === 'note'
      ? t('chat.action.update.note', { name: action.name })
      : t(`chat.action.${action.action}.${action.kind}`, {
          name: action.name,
          newName: action.action === 'rename' ? action.newName : '',
          category: action.action === 'create' && action.kind === 'tag' ? action.categoryName : '',
          color: action.action === 'recolor' ? t(`taxonomy.color.names.${action.color}`) : '',
        });
  const lines = action.kind === 'note' ? noteLines(action, t) : [];

  return (
    <div
      className="card enter-rise flex flex-col gap-2 border-s-4 border-s-marker p-3"
      role="group"
      aria-label={title}
    >
      <p className="font-medium">{title}</p>
      {lines.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-sm text-muted">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {action.action === 'recolor' && (
        <span data-color={action.color} className="cat-pill self-start">
          {action.name}
        </span>
      )}
      {state === 'done' && <p className="text-sm font-medium text-ok">{t('chat.action.done')}</p>}
      {state === 'dismissed' && <p className="text-sm text-muted">{t('chat.action.dismissed')}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {(state === 'idle' || state === 'busy') && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={locked}
            onClick={onApprove}
            className="btn btn-primary btn-sm"
          >
            {state === 'busy' && <span aria-hidden="true" className="spinner" />}
            {t('chat.action.approve')}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={onDismiss}
            className="btn btn-ghost btn-sm"
          >
            {t('chat.action.dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}
