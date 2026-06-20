import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { ArrowUp, Check, CheckCheck, Pin, Reply, X } from 'lucide-react';
import type { MessageResponse } from '@trener/shared';
import { useClientMe } from '../api/auth';
import {
  useClientMessages,
  useCompleteTask,
  useMarkChatRead,
  useSendClientMessage,
} from '../api/chat';
import { useClientTrainer } from '../api/trainer';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?';
}

/** Цитата сообщения, на которое отвечает текущее (тап — переход к оригиналу). */
function ReplyQuote({
  reply,
  onJump,
}: {
  reply: NonNullable<MessageResponse['replyTo']>;
  onJump: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onJump(reply.id)}
      className="mb-1 flex w-full flex-col rounded-md border-l-2 border-current/40 bg-black/10 px-2 py-1 text-left opacity-90 active:opacity-70"
    >
      <span className="truncate text-[11px] font-semibold">
        {reply.senderRole === 'trainer' ? 'Тренер' : 'Вы'}
      </span>
      <span className="truncate text-[11px]">{reply.body}</span>
    </button>
  );
}

/** Свайп сообщения влево → ответить. Вертикальный скролл не перехватывается (pan-y). */
const SWIPE_TRIGGER = 40;
function SwipeToReply({
  onReply,
  disabled,
  children,
}: {
  onReply: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    start.current = { x: e.clientX, y: e.clientY };
    horizontal.current = false;
  }
  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;
    if (!horizontal.current) {
      if (Math.abs(ddy) > 12 && Math.abs(ddy) >= Math.abs(ddx)) {
        start.current = null;
        return;
      }
      if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) horizontal.current = true;
      else return;
    }
    setDx(Math.max(-64, Math.min(0, ddx)));
  }
  function end() {
    if (dx <= -SWIPE_TRIGGER) onReply();
    setDx(0);
    start.current = null;
    horizontal.current = false;
  }

  return (
    <div className="relative">
      {dx < 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-accent-text"
          style={{ opacity: Math.min(1, -dx / SWIPE_TRIGGER) }}
        >
          <Reply size={18} />
        </div>
      )}
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          transform: `translateX(${String(dx)}px)`,
          transition: dx === 0 ? 'transform 0.18s' : 'none',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ChatPage() {
  const me = useClientMe();
  const linked = me.data?.link != null;
  const trainer = useClientTrainer();
  const messages = useClientMessages();
  const send = useSendClientMessage();
  const markRead = useMarkChatRead();
  const completeTask = useCompleteTask();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Ссылки на сообщения по id — для перехода к закреплённому.
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pinIdx, setPinIdx] = useState(0);
  const [replyTo, setReplyTo] = useState<MessageResponse | null>(null);

  function jumpToMessage(mid: string) {
    const el = msgRefs.current.get(mid);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightId(mid);
    window.setTimeout(() => setHighlightId((cur) => (cur === mid ? null : cur)), 1600);
  }

  const wrapMsg = (m: MessageResponse, node: ReactNode) => (
    <SwipeToReply
      key={m.id}
      disabled={m.kind === 'system'}
      onReply={() => {
        setReplyTo(m);
        taRef.current?.focus();
      }}
    >
      <div
        ref={(el) => {
          if (el) msgRefs.current.set(m.id, el);
          else msgRefs.current.delete(m.id);
        }}
        className={`rounded-2xl transition-colors ${highlightId === m.id ? 'bg-accent/10' : ''}`}
      >
        {node}
      </div>
    </SwipeToReply>
  );

  // Авто-рост поля ввода до 3 строк (80px), далее — внутренняя прокрутка.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`;
  }, [draft]);

  const items = messages.data?.messages ?? [];
  const readAt = messages.data?.trainerLastReadAt ?? null;
  const pinnedList = messages.data?.pinnedMessages ?? [];
  const pinCurrent = pinnedList.length > 0 ? pinnedList[pinIdx % pinnedList.length] : null;
  const count = items.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
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
    const replyId = replyTo?.id;
    setDraft('');
    setReplyTo(null);
    // Оставляем фокус в поле, чтобы клавиатура не закрывалась после отправки.
    taRef.current?.focus();
    send.mutate(
      { body, ...(replyId ? { replyTo: replyId } : {}) },
      { onError: () => setDraft((cur) => (cur === '' ? body : cur)) },
    );
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  // При фокусе клавиатура анимированно ужимает область сообщений. Чтобы лента не
  // «дёргалась», непрерывно прижимаем её к низу каждый кадр, пока идёт анимация (~500мс).
  function onInputFocus() {
    const start = Date.now();
    const tick = () => {
      scrollToBottom();
      if (Date.now() - start < 500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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

      {/* Закреплённые тренером сообщения: тап — переход к текущему и переключение
          на следующее (открепляет тренер). */}
      {pinCurrent && (
        <button
          type="button"
          onClick={() => {
            jumpToMessage(pinCurrent.id);
            if (pinnedList.length > 1) setPinIdx((i) => (i + 1) % pinnedList.length);
          }}
          className="flex items-center gap-2 border-b border-line bg-bg px-3 py-2 text-left active:opacity-70"
        >
          <Pin size={15} className="shrink-0 text-accent-text" />
          <span className="flex min-w-0 flex-col">
            <span className="text-[11px] font-semibold text-accent-text">
              Закреплённое
              {pinnedList.length > 1
                ? ` · ${(pinIdx % pinnedList.length) + 1}/${pinnedList.length}`
                : ''}
            </span>
            <span className="truncate text-[13px] text-ink">{pinCurrent.body}</span>
          </span>
        </button>
      )}

      {/* Лента сообщений. Тап по ленте убирает клавиатуру (снимаем фокус с поля). */}
      <div
        ref={scrollRef}
        onClick={() => taRef.current?.blur()}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2 pb-3 pt-3"
      >
        {count === 0 && (
          <p className="pt-10 text-center text-sm text-ink-muted">
            Сообщений пока нет. Напишите первым.
          </p>
        )}
        {items.map((m) => {
          const time = formatTime(m.createdAt);

          // Системная плашка (например «задача выполнена») — по центру, без пузыря.
          if (m.kind === 'system') {
            return wrapMsg(
              m,
              <div className="flex justify-center">
                <div className="rounded-full bg-chip px-3 py-1 text-center text-[11px] text-ink-muted">
                  {m.body}
                </div>
              </div>,
            );
          }

          // Задача с чекбоксом — клиент отмечает выполнение (однократно).
          if (m.kind === 'task') {
            const done = m.taskDone === true;
            return wrapMsg(
              m,
              <div className="flex justify-start">
                <div className="flex max-w-[85%] items-start gap-2.5 rounded-2xl border border-accent/40 bg-card px-3 py-2.5">
                  <button
                    type="button"
                    disabled={done || completeTask.isPending}
                    onClick={() => completeTask.mutate(m.id)}
                    aria-label={done ? 'Задача выполнена' : 'Отметить задачу выполненной'}
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                      done ? 'border-accent bg-accent text-accent-on' : 'border-ink-muted'
                    }`}
                  >
                    {done && <Check size={14} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                      Задача
                    </div>
                    <div
                      className={`whitespace-pre-wrap break-words text-[14px] ${
                        done ? 'text-ink-muted line-through' : 'text-ink'
                      }`}
                    >
                      {m.body}
                    </div>
                    {time && <div className="mt-0.5 text-[10px] text-ink-muted">{time}</div>}
                  </div>
                </div>
              </div>,
            );
          }

          const mine = m.senderRole === 'client';
          const read = readAt !== null && m.createdAt <= readAt;
          return wrapMsg(
            m,
            <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-[14px] ${
                  mine ? 'bg-accent text-accent-on' : 'bg-card text-ink'
                }`}
              >
                {m.replyTo && <ReplyQuote reply={m.replyTo} onJump={jumpToMessage} />}
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
            </div>,
          );
        })}
      </div>

      {/* Панель ответа: на какое сообщение отвечаем (× — отменить). */}
      {replyTo && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-bg px-4 pt-2">
          <Reply size={15} className="shrink-0 text-accent-text" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[11px] font-semibold text-accent-text">
              Ответ {replyTo.senderRole === 'trainer' ? 'тренеру' : 'на ваше'}
            </span>
            <span className="truncate text-[13px] text-ink-muted">{replyTo.body}</span>
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            aria-label="Отменить ответ"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-card-elevated"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Ввод */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`shrink-0 bg-bg px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] ${replyTo ? '' : 'border-t border-line'}`}
      >
        <div className="relative">
          <textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={onInputFocus}
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
              // Не уводим фокус с поля при тапе по кнопке — клавиатура остаётся открытой.
              onPointerDown={(e) => e.preventDefault()}
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
