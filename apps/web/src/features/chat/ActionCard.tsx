import type { AgentAction } from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../../lib/api';
import { applyAction } from './applyAction';

type State = 'idle' | 'busy' | 'done' | 'dismissed';

/** A taxonomy change the agent proposed. Nothing happens until Approve. */
export function ActionCard({
  action,
  onApplied,
  apply = applyAction,
}: {
  action: AgentAction;
  /** Called after a successful approval, to refresh the taxonomy and notes queries. */
  onApplied: () => void;
  apply?: (action: AgentAction) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setState('busy');
    setError(null);
    try {
      await apply(action);
      setState('done');
      onApplied();
    } catch (err) {
      setState('idle');
      const code = err instanceof ApiRequestError ? err.code : undefined;
      setError(
        code === 'name_taken'
          ? t('chat.action.nameTaken')
          : code === 'category_deleted'
            ? t('chat.action.categoryDeleted')
            : t('chat.action.failed'),
      );
    }
  };

  const title = t(`chat.action.${action.action}.${action.kind}`, {
    name: action.name,
    newName: action.action === 'rename' ? action.newName : '',
    category: action.action === 'create' && action.kind === 'tag' ? action.categoryName : '',
  });

  return (
    <div className="rounded-lg border border-line bg-surface p-3" role="group" aria-label={title}>
      <p className="font-medium">{title}</p>
      {state === 'done' && <p className="text-sm text-muted">{t('chat.action.done')}</p>}
      {state === 'dismissed' && <p className="text-sm text-muted">{t('chat.action.dismissed')}</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {(state === 'idle' || state === 'busy') && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={() => void approve()}
            className="rounded-md bg-fg px-3 py-1 text-bg disabled:opacity-50"
          >
            {t('chat.action.approve')}
          </button>
          <button
            type="button"
            disabled={state === 'busy'}
            onClick={() => setState('dismissed')}
            className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover disabled:opacity-50"
          >
            {t('chat.action.dismiss')}
          </button>
        </div>
      )}
    </div>
  );
}
