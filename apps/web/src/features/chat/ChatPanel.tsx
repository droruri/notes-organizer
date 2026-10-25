import {
  type AgentAction,
  type ChatMessage,
  type ChatPart,
  type ChatRequest,
  type Note,
} from '@notes/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionCard } from './ActionCard';
import { ChatAnswer } from './ChatAnswer';
import { api } from '../../lib/api';

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
  const history = useRef<ChatMessage[]>([]);

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
      className="fixed inset-0 z-20 flex flex-col bg-bg md:inset-y-0 md:end-0 md:start-auto md:w-96 md:border-s md:border-line md:shadow-lg"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-semibold">{t('chat.title')}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-line px-3 py-1 hover:bg-surface-hover"
        >
          {t('chat.close')}
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.length === 0 && <p className="text-muted">{t('chat.empty')}</p>}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === 'user' ? 'self-end rounded-lg bg-surface-hover px-3 py-2' : ''}
          >
            {m.role === 'user' ? (
              <p className="whitespace-pre-wrap">{m.content}</p>
            ) : (
              <>
                <ChatAnswer text={m.content} notes={notes} onOpenNote={onOpenNote} />
                {(actions[i] ?? []).map((a, j) => (
                  <ActionCard key={j} action={a} onApplied={() => onTaxonomyChanged?.()} />
                ))}
              </>
            )}
          </div>
        ))}
        {tool && (
          <p role="status" className="text-sm text-muted motion-safe:animate-pulse">
            {t('chat.searching')}
          </p>
        )}
        {failed && (
          <p role="alert" className="text-danger">
            {t('chat.error')}
          </p>
        )}
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
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
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ''}
          className="rounded-md bg-fg px-4 py-2 text-bg disabled:opacity-50"
        >
          {t('chat.send')}
        </button>
      </form>
    </aside>
  );
}
