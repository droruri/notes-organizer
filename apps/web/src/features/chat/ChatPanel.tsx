import {
  type AgentAction,
  type ChatMessage,
  type ChatPart,
  type ChatRequest,
  type Note,
} from '@notes/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionGroup } from './ActionGroup';
import { ChatAnswer } from './ChatAnswer';
import { api } from '../../lib/api';
import { NavBar } from '../../ui/NavBar';
import { Icon } from '../../ui/Icon';
import { useSlow } from '../../ui/useSlow';
import { useEscape } from '../../ui/useEscape';
import { useExit } from '../../ui/useExit';

type StreamChat = (input: ChatRequest, onPart: (part: ChatPart) => void) => Promise<void>;

const localToday = () => new Date().toLocaleDateString('en-CA');

export function ChatPanel({
  notes,
  onOpenNote,
  onClose,
  onTaxonomyChanged,
  stream = api.chat,
}: {
  notes: Note[];
  onOpenNote: (note: Note) => void;
  onClose: () => void;
  /** Called after an approved action, to refresh the taxonomy and notes queries. */
  onTaxonomyChanged?: () => void;
  /** The network call; tests pass a scripted one. */
  stream?: StreamChat;
}) {
  const { t, i18n } = useTranslation();
  // History lives only in this component: closing the panel clears it.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState(false);
  const [failed, setFailed] = useState(false);
  const [actions, setActions] = useState<Record<number, AgentAction[]>>({});
  const slow = useSlow(busy);
  const history = useRef<ChatMessage[]>([]);
  const { closing, exit, onTransitionEnd } = useExit();
  const close = () => exit(onClose);
  const openNote = (note: Note) => exit(() => onOpenNote(note));
  useEscape(close);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    const next: ChatMessage[] = [...history.current, { role: 'user', content }];
    history.current = [...next, { role: 'assistant', content: '' }];
    setMessages(history.current);
    setInput('');
    setBusy(true);
    setFailed(false);
    const append = (delta: string) => {
      const last = history.current.at(-1);
      if (!last) return;
      history.current = [
        ...history.current.slice(0, -1),
        { ...last, content: last.content + delta },
      ];
      setMessages(history.current);
    };
    try {
      await stream(
        { messages: next, today: localToday(), locale: i18n.language === 'en' ? 'en' : 'he' },
        (part) => {
          if (part.type === 'text-delta') {
            setTool(false);
            append(part.delta);
          } else if (part.type === 'data-actions') {
            const index = history.current.length - 1;
            setActions((prev) => ({ ...prev, [index]: [...(prev[index] ?? []), ...part.data] }));
          } else if (part.type === 'tool-input-start') setTool(true);
          else setFailed(true);
        },
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setTool(false);
    }
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
                <ActionGroup actions={actions[i] ?? []} onApplied={() => onTaxonomyChanged?.()} />
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
          void send();
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
