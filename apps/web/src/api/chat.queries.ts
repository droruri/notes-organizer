import type { AgentAction, ChatMessage, ChatPart } from '@notes/shared';
import { useRef, useState } from 'react';
import { api } from '../lib/api';

const localToday = () => new Date().toLocaleDateString('en-CA');

/** One chat session: the history, the streaming state and the action cards per answer. */
export function useChat(locale: string) {
  // History lives only in the caller: unmounting clears it.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState(false);
  const [failed, setFailed] = useState(false);
  const [actions, setActions] = useState<Record<number, AgentAction[]>>({});
  const history = useRef<ChatMessage[]>([]);

  const send = async (content: string) => {
    if (!content || busy) return;
    const next: ChatMessage[] = [...history.current, { role: 'user', content }];
    history.current = [...next, { role: 'assistant', content: '' }];
    setMessages(history.current);
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
    const onPart = (part: ChatPart) => {
      if (part.type === 'text-delta') {
        setTool(false);
        append(part.delta);
      } else if (part.type === 'data-actions') {
        const index = history.current.length - 1;
        setActions((prev) => ({ ...prev, [index]: [...(prev[index] ?? []), ...part.data] }));
      } else if (part.type === 'tool-input-start') setTool(true);
      else setFailed(true);
    };
    try {
      await api.chat(
        { messages: next, today: localToday(), locale: locale === 'en' ? 'en' : 'he' },
        onPart,
      );
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      setTool(false);
    }
  };

  return { messages, busy, tool, failed, actions, send };
}
