import type { AgentAction } from '@notes/shared';
import { useTranslation } from 'react-i18next';

export type CardState = 'idle' | 'busy' | 'done' | 'dismissed';

/** A taxonomy change the agent proposed. Presentational: the action group owns its state. */
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

  const title = t(`chat.action.${action.action}.${action.kind}`, {
    name: action.name,
    newName: action.action === 'rename' ? action.newName : '',
    category: action.action === 'create' && action.kind === 'tag' ? action.categoryName : '',
  });

  return (
    <div
      className="card enter-rise flex flex-col gap-2 border-s-4 border-s-marker p-3"
      role="group"
      aria-label={title}
    >
      <p className="font-medium">{title}</p>
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
