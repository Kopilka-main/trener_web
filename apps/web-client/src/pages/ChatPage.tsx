import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Check, CheckCheck } from 'lucide-react';
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
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Авто-рост поля ввода до 3 строк (80px), далее — внутренняя прокрутка.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`;
  }, [draft]);

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
        className="border-t border-line bg-bg px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="relative">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={1}
            maxLength={4000}
            placeholder="Сообщение…"
            aria-label="Текст сообщения"
            className="block max-h-20 min-h-[40px] w-full resize-none overflow-y-auto rounded-2xl bg-chip py-2.5 pl-4 pr-12 text-[14px] leading-5 text-ink outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-accent/30"
          />
          {draft.trim() !== '' && (
            <button
              type="submit"
              disabled={send.isPending}
              aria-label="Отправить"
              className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-on transition-opacity active:scale-[0.95] disabled:opacity-30"
            >
              <ArrowUp size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
