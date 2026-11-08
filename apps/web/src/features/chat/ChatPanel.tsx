import { type Note } from '@notes/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionGroup } from './ActionGroup';
import { ChatAnswer } from './ChatAnswer';
import { useChat } from '../../api';
import { NavBar } from '../../ui/NavBar';
import { Icon } from '../../ui/Icon';
import { useSlow } from '../../ui/useSlow';
import { useEscape } from '../../ui/useEscape';
import { useExit } from '../../ui/useExit';

export function ChatPanel({
  notes,
  onOpenNote,
  onClose,
  onApplied,
}: {
  notes: Note[];
  onOpenNote: (note: Note) => void;
  onClose: () => void;
  /** Called after an approved action, to refresh the taxonomy and notes queries. */
  onApplied?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { messages, busy, tool, failed, actions, send } = useChat(i18n.language);
  const [input, setInput] = useState('');
  const slow = useSlow(busy);
  const { closing, exit, onTransitionEnd } = useExit();
  const close = () => exit(onClose);
  const openNote = (note: Note) => exit(() => onOpenNote(note));
  useEscape(close);

  const submit = () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput('');
    void send(content);
  };

  return (
    <aside
      role="dialog"
      aria-label={t('chat.title')}
      onTransitionEnd={onTransitionEnd}
      className={`enter-drawer ${closing ? 'closing ' : ''}fixed inset-0 z-30 flex flex-col bg-surface pt-[env(safe-area-inset-top)] lg:static lg:z-auto lg:h-[calc(100dvh-3rem)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-line lg:pt-0`}
    >
      <div className="px-4 pt-4">
        <NavBar
          title={t('chat.title')}
          onBack={close}
          action={
            <button
              type="button"
              onClick={close}
              aria-label={t('chat.close')}
              className="btn btn-ghost btn-icon btn-sm max-lg:hidden"
            >
              <Icon name="close" size={18} />
            </button>
          }
        />
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-4 py-4 [&>*]:shrink-0"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="m-auto max-w-64 text-center text-sm text-muted">{t('chat.empty')}</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'enter-rise max-w-[85%] self-end rounded-2xl rounded-ee-md bg-accent px-3.5 py-2 text-[var(--accent-fg)]'
                : 'flex max-w-[95%] flex-col gap-2 self-start leading-relaxed'
            }
          >
            {m.role === 'user' ? (
              <p className="whitespace-pre-wrap">{m.content}</p>
            ) : (
              <>
                <ChatAnswer text={m.content} notes={notes} onOpenNote={openNote} />
                <ActionGroup actions={actions[i] ?? []} onApplied={() => onApplied?.()} />
              </>
            )}
          </div>
        ))}
        {tool && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <span aria-hidden="true" className="spinner" />
            {slow ? t('chat.searchingSlow') : t('chat.searching')}
          </p>
        )}
        {failed && (
          <p role="alert" className="notice notice-danger">
            {t('chat.error')}
          </p>
        )}
      </div>
      <form
        className="flex gap-2 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label={t('chat.placeholder')}
          placeholder={t('chat.placeholder')}
          dir="auto"
          autoComplete="off"
          className="field flex-1 rounded-full px-4"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ''}
          aria-label={t('chat.send')}
          className="btn btn-primary btn-icon shrink-0 rounded-full"
        >
          {busy ? <span aria-hidden="true" className="spinner" /> : <Icon name="send" size={18} />}
        </button>
      </form>
    </aside>
  );
}
