import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCheck } from 'lucide-react';
import { useClientMe } from '../api/auth';
import { useClientMessages, useMarkChatRead, useSendClientMessage } from '../api/chat';
import { useClientTrainer } from '../api/trainer';
import { BackBar } from '../components/BackBar';

export function ChatPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const trainer = useClientTrainer();
  const messages = useClientMessages();
  const send = useSendClientMessage();
  const markRead = useMarkChatRead();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const items = messages.data?.messages ?? [];
  const readAt = messages.data?.trainerLastReadAt ?? null;
  const count = items.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  // Перечитываем при открытии И при каждом новом входящем сообщении тренера —
  // иначе пока чат открыт новые сообщения не отмечаются прочитанными.
  const lastTrainerMsgId = [...items].reverse().find((m) => m.senderRole === 'trainer')?.id ?? null;
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (linked) markReadMutate();
  }, [linked, lastTrainerMsgId, markReadMutate]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = text.trim();
    if (body === '' || send.isPending) return;
    send.mutate({ body }, { onSuccess: () => setText('') });
  }

  if (!linked) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="px-4">
          <BackBar />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-ink-muted">Подключите тренера, чтобы написать ему.</p>
          <Link to="/connect" className="text-sm font-semibold text-accent">
            Подключить тренера
          </Link>
        </div>
      </div>
    );
  }

  const title = trainer.data ? `${trainer.data.firstName} ${trainer.data.lastName}` : 'Чат';

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-4">
        <BackBar />
      </div>
      <h1 className="px-4 pt-2 font-[family-name:var(--font-display)] text-[24px] text-ink">
        {title}
      </h1>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
        {count === 0 && <p className="m-auto text-sm text-ink-muted">Сообщений пока нет.</p>}
        {items.map((m) => {
          const isClient = m.senderRole === 'client';
          const read = readAt !== null && m.createdAt <= readAt;
          return (
            <div
              key={m.id}
              className={`flex max-w-[80%] items-end gap-1 rounded-2xl px-3 py-2 text-[14px] ${
                isClient ? 'self-end bg-accent text-accent-on' : 'self-start bg-card text-ink'
              }`}
            >
              <span>{m.body}</span>
              {isClient &&
                (read ? (
                  <CheckCheck size={14} className="shrink-0 opacity-80" />
                ) : (
                  <Check size={14} className="shrink-0 opacity-60" />
                ))}
            </div>
          );
        })}
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
