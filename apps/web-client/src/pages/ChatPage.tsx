import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useClientMe } from '../api/auth';
import { useClientMessages, useMarkChatRead, useSendClientMessage } from '../api/chat';

export function ChatPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const messages = useClientMessages();
  const send = useSendClientMessage();
  const markRead = useMarkChatRead();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const count = messages.data?.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (linked) markReadMutate();
  }, [linked, markReadMutate]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = text.trim();
    if (body === '' || send.isPending) return;
    send.mutate({ body }, { onSuccess: () => setText('') });
  }

  if (!linked) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-ink-muted">Подключите тренера, чтобы написать ему.</p>
        <Link to="/connect" className="text-sm font-semibold text-accent">
          Подключить тренера
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="px-4 pt-5 font-[family-name:var(--font-display)] text-[28px] text-ink">Чат</h1>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {messages.data && messages.data.length === 0 && (
          <p className="m-auto text-sm text-ink-muted">Сообщений пока нет.</p>
        )}
        {messages.data?.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-2xl px-3 py-2 text-[14px] ${
              m.senderRole === 'client'
                ? 'self-end bg-accent text-accent-on'
                : 'self-start bg-card text-ink'
            }`}
          >
            {m.body}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-line p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Сообщение…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={text.trim() === '' || send.isPending}
          className="shrink-0 rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-on disabled:opacity-50"
        >
          Отпр.
        </button>
      </form>
    </div>
  );
}
