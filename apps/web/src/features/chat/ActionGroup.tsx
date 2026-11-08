import type { AgentAction } from '@notes/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApplyActions, useUpdateNote } from '../../api';
import { ApiRequestError } from '../../lib/api';
import { ActionCard, type CardState } from './ActionCard';

type Card = { state: CardState; error: string | null };
const IDLE: Card = { state: 'idle', error: null };

/** The action cards of one agent answer. Owns every card's approval state and the one apply path. */
export function ActionGroup({
  actions,
  onApplied,
}: {
  actions: AgentAction[];
  /** Called once per request that applied at least one action, to refresh taxonomy and notes. */
  onApplied: () => void;
}) {
  const { t } = useTranslation();
  const { mutateAsync: apply } = useApplyActions();
  const { mutateAsync: updateNote } = useUpdateNote();
  // Keyed by position: actions can keep arriving while the answer streams, and start idle.
  const [cards, setCards] = useState<Record<number, Card>>({});
  const [inFlight, setInFlight] = useState(false);
  // A ref, not state: two clicks before the next render must not both send a request.
  const inFlightRef = useRef(false);

  const cardAt = (k: number): Card => cards[k] ?? IDLE;
  const pending = actions.flatMap((_, k) => (cardAt(k).state === 'idle' ? [k] : []));

  const errorText = (code: string | undefined) =>
    code === 'name_taken'
      ? t('chat.action.nameTaken')
      : code === 'category_deleted'
        ? t('chat.action.categoryDeleted')
        : code === 'invalid_transition'
          ? t('chat.action.invalidTransition')
          : code === 'not_found'
            ? t('chat.action.noteNotFound')
            : t('chat.action.failed');

  const set = (patch: Record<number, Card>) => setCards((prev) => ({ ...prev, ...patch }));

  const run = async (indexes: number[]) => {
    const selected = indexes.flatMap((k) => {
      const action = actions[k];
      return action ? [{ k, action }] : [];
    });
    if (selected.length === 0 || inFlightRef.current) return;
    inFlightRef.current = true;
    setInFlight(true);
    set(Object.fromEntries(selected.map(({ k }) => [k, { state: 'busy', error: null }])));
    const next: Record<number, Card> = {};
    let applied = false;
    const taxonomyCards = selected.flatMap(({ k, action }) =>
      action.kind === 'note' ? [] : [{ k, action }],
    );
    const noteCards = selected.flatMap(({ k, action }) =>
      action.kind === 'note' ? [{ k, action }] : [],
    );
    const taxonomyRun = async () => {
      if (taxonomyCards.length === 0) return;
      try {
        const { results } = await apply({ actions: taxonomyCards.map(({ action }) => action) });
        taxonomyCards.forEach(({ k }, i) => {
          const result = results[i];
          if (result?.ok) {
            applied = true;
            next[k] = { state: 'done', error: null };
          } else {
            next[k] = { state: 'idle', error: errorText(result?.error) };
          }
        });
      } catch {
        for (const { k } of taxonomyCards) next[k] = { state: 'idle', error: errorText(undefined) };
      }
    };
    const noteRun = ({ k, action }: (typeof noteCards)[number]) =>
      updateNote({ id: action.id, edit: action.edit }).then(
        () => {
          applied = true;
          next[k] = { state: 'done', error: null };
        },
        (e: unknown) => {
          next[k] = {
            state: 'idle',
            error: errorText(e instanceof ApiRequestError ? e.code : undefined),
          };
        },
      );
    await Promise.all([taxonomyRun(), ...noteCards.map(noteRun)]);
    set(next);
    inFlightRef.current = false;
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
