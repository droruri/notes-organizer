import type { ActionsBody, ActionsResponse, AgentAction } from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { ActionCard, type CardState } from './ActionCard';

type Card = { state: CardState; error: string | null };
const IDLE: Card = { state: 'idle', error: null };

/** The action cards of one agent answer. Owns every card's approval state and the one apply path. */
export function ActionGroup({
  actions,
  onApplied,
  apply = api.applyActions,
}: {
  actions: AgentAction[];
  /** Called once per request that applied at least one action, to refresh taxonomy and notes. */
  onApplied: () => void;
  apply?: (body: ActionsBody) => Promise<ActionsResponse>;
}) {
  const { t } = useTranslation();
  // Keyed by position: actions can keep arriving while the answer streams, and start idle.
  const [cards, setCards] = useState<Record<number, Card>>({});
  const [inFlight, setInFlight] = useState(false);

  const cardAt = (k: number): Card => cards[k] ?? IDLE;
  const pending = actions.flatMap((_, k) => (cardAt(k).state === 'idle' ? [k] : []));

  const errorText = (code: string | undefined) =>
    code === 'name_taken'
      ? t('chat.action.nameTaken')
      : code === 'category_deleted'
        ? t('chat.action.categoryDeleted')
        : t('chat.action.failed');

  const set = (patch: Record<number, Card>) => setCards((prev) => ({ ...prev, ...patch }));

  const run = async (indexes: number[]) => {
    const selected = indexes.flatMap((k) => {
      const action = actions[k];
      return action ? [{ k, action }] : [];
    });
    if (selected.length === 0 || inFlight) return;
    setInFlight(true);
    set(Object.fromEntries(selected.map(({ k }) => [k, { state: 'busy', error: null }])));
    const next: Record<number, Card> = {};
    let applied = false;
    try {
      const { results } = await apply({ actions: selected.map(({ action }) => action) });
      selected.forEach(({ k }, i) => {
        const result = results[i];
        if (result?.ok) {
          applied = true;
          next[k] = { state: 'done', error: null };
        } else {
          next[k] = { state: 'idle', error: errorText(result?.error) };
        }
      });
    } catch {
      for (const { k } of selected) next[k] = { state: 'idle', error: errorText(undefined) };
    }
    set(next);
    setInFlight(false);
    if (applied) onApplied();
  };

  return (
    <>
      {pending.length >= 2 && (
        <button
          type="button"
          disabled={inFlight}
          onClick={() => void run(pending)}
          className="btn btn-primary btn-sm self-start"
        >
          {t('chat.action.approveAll', { count: pending.length })}
        </button>
      )}
      {actions.map((action, k) => (
        <ActionCard
          key={k}
          action={action}
          state={cardAt(k).state}
          error={cardAt(k).error}
          locked={inFlight}
          onApprove={() => void run([k])}
          onDismiss={() => set({ [k]: { state: 'dismissed', error: null } })}
        />
      ))}
    </>
  );
}
