import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCheck, Send } from 'lucide-react';
import { useClientMe } from '../api/auth';
import { useClientMessages, useMarkChatRead, useSendClientMessage } from '../api/chat';
import { useClientTrainer } from '../api/trainer';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}

export function ChatPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const trainer = useClientTrainer();
  const messages = useClientMessages();
  const send = useSendClientMessage();
  const markRead = useMarkChatRead();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const items = messages.data?.messages ?? [];
  const readAt = messages.data?.trainerLastReadAt ?? null;
  const count = items.length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  // Перечитываем при открытии И при каждом новом входящем сообщении тренера.
  const lastTrainerMsgId = [...items].reverse().find((m) => m.senderRole === 'trainer')?.id ?? null;
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (linked) markReadMutate();
  }, [linked, lastTrainerMsgId, markReadMutate]);

  function submit() {
    const body = draft.trim();
    if (body === '' || send.isPending) return;
    setDraft('');
    send.mutate({ body }, { onError: () => setDraft((cur) => (cur === '' ? body : cur)) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  if (!linked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-2 text-center">
        <p className="text-sm text-ink-muted">Подключите тренера, чтобы написать ему.</p>
        <Link to="/connect" className="text-sm font-semibold text-accent-text">
          Подключить тренера
        </Link>
      </div>
    );
  }

  const t = trainer.data;
  const name = t ? `${t.firstName} ${t.lastName}` : 'Чат';

  return (
    <div className="flex h-full flex-col">
      {/* Шапка: аватар тренера + имя */}
      <div className="flex items-center gap-3 border-b border-line px-2 py-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-elevated">
          {t?.avatarFileId ? (
            <img
              src={`/api/client/trainer/avatar?v=${t.avatarFileId}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-[13px] font-bold text-ink">
              {t ? initials(t.firstName, t.lastName) : '—'}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-ink">{name}</span>
          {t?.title && <span className="block truncate text-[12px] text-ink-muted">{t.title}</span>}
        </span>
      </div>

      {/* Лента сообщений */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-3 pt-3">
        {count === 0 && (
          <p className="pt-10 text-center text-sm text-ink-muted">
            Сообщений пока нет. Напишите первым.
          </p>
        )}
        {items.map((m) => {
          const mine = m.senderRole === 'client';
          const time = formatTime(m.createdAt);
          const read = readAt !== null && m.createdAt <= readAt;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-[14px] ${
                  mine ? 'bg-accent text-accent-on' : 'bg-card text-ink'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {time && (
                  <div
                    className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
                      mine ? 'text-accent-on/60' : 'text-ink-muted'
                    }`}
                  >
                    {time}
                    {mine && (read ? <CheckCheck size={12} /> : <Check size={12} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Ввод */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 border-t border-line bg-bg px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={4000}
          placeholder="Сообщение…"
          aria-label="Текст сообщения"
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl bg-chip px-4 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={draft.trim() === '' || send.isPending}
          aria-label="Отправить"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-on transition-opacity active:scale-[0.95] disabled:opacity-30"
        >
          <Send size={16} strokeWidth={2} />
        </button>
      </form>
    </div>
  );
}
