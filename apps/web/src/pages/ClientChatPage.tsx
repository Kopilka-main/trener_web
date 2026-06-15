import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUp, Check, CheckCheck, Pin, X } from 'lucide-react';
import type { MessageResponse } from '@trener/shared';
import {
  useChatMessages,
  useDeleteConversation,
  useMarkConversationRead,
  useSendMessage,
  useUnpinMessage,
} from '../api/chat';
import { useClient } from '../api/clients';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function ClientChatPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const client = useClient(id);
  const messages = useChatMessages(id);
  const send = useSendMessage(id);
  const markRead = useMarkConversationRead(id);
  const removeChat = useDeleteConversation(id);
  const unpin = useUnpinMessage(id);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Ссылки на пузыри по id — для перехода к закреплённому сообщению.
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Индекс показываемого закреплённого (циклически переключаем тапом по баннеру).
  const [pinIdx, setPinIdx] = useState(0);

  function jumpToMessage(mid: string) {
    const el = msgRefs.current.get(mid);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightId(mid);
    window.setTimeout(() => setHighlightId((cur) => (cur === mid ? null : cur)), 1600);
  }

  // Авто-рост поля ввода до 3 строк (80px), далее — внутренняя прокрутка.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`;
  }, [draft]);

  const list = messages.data?.messages ?? [];
  const clientReadAt = messages.data?.clientLastReadAt ?? null;
  const pinnedList = messages.data?.pinnedMessages ?? [];
  const pinCurrent = pinnedList.length > 0 ? pinnedList[pinIdx % pinnedList.length] : null;
  const title = client.data ? `${client.data.firstName} ${client.data.lastName}`.trim() : 'Чат';

  // Автоскролл вниз при появлении новых сообщений.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => (el.scrollTop = el.scrollHeight));
  }, [list.length]);

  // Отметить диалог прочитанным при открытии И при каждом новом входящем от клиента
  // (иначе пока чат открыт у клиента не появляется ✓✓, а у тренера висят непрочитанные).
  const lastClientMsgId = [...list].reverse().find((m) => m.senderRole === 'client')?.id ?? null;
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (id.length > 0) markReadMutate();
  }, [id, lastClientMsgId, markReadMutate]);

  function submit() {
    const body = draft.trim();
    if (body.length === 0 || send.isPending) return;
    setDraft('');
    // Оставляем фокус в поле, чтобы клавиатура не закрывалась после отправки.
    taRef.current?.focus();
    send.mutate(body, {
      onError: () => {
        // Возвращаем текст в поле, чтобы тренер не потерял сообщение.
        setDraft((current) => (current.length === 0 ? body : current));
      },
    });
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

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={title}
        back={`/clients/${id}`}
        right={
          <HoldToDelete
            icon="trash"
            label="Удерживайте, чтобы удалить переписку"
            hint="История сотрётся и у вас, и у клиента. Восстановить нельзя."
            onDelete={() =>
              removeChat.mutate(undefined, {
                onSuccess: () => void navigate('/messages'),
              })
            }
          />
        }
      />

      {/* Закреплённые сообщения: тап — переход к текущему и переключение на следующее
          (как в Telegram); × — открепить показанное. Видно обоим. */}
      {pinCurrent && (
        <div className="flex items-center gap-2 border-b border-line bg-bg px-3 py-2">
          <button
            type="button"
            onClick={() => {
              jumpToMessage(pinCurrent.id);
              if (pinnedList.length > 1) setPinIdx((i) => (i + 1) % pinnedList.length);
            }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-70"
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
          <button
            type="button"
            onClick={() => unpin.mutate(pinCurrent.id)}
            disabled={unpin.isPending}
            aria-label="Открепить"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-card-elevated disabled:opacity-40"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onClick={() => taRef.current?.blur()}
        className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-2 pb-3 pt-2"
      >
        {messages.isPending && (
          <p className="pt-10 text-center text-sm text-ink-muted">Загрузка…</p>
        )}

        {messages.isError && (
          <p className="pt-10 text-center text-sm text-ink-muted" role="alert">
            Не удалось загрузить сообщения. Попробуйте обновить страницу.
          </p>
        )}

        {messages.isSuccess && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-10 text-center">
            <p className="text-sm text-ink-muted">Сообщений пока нет. Напишите первым.</p>
            <p className="max-w-[260px] text-xs leading-relaxed text-ink-muted">
              Подсказки: <span className="font-mono">/task</span> — задача с чекбоксом для клиента;{' '}
              <span className="font-mono">/pin</span> — закрепить сообщение (видно обоим).
            </p>
          </div>
        )}

        {list.map((m) => (
          <div
            key={m.id}
            ref={(el) => {
              if (el) msgRefs.current.set(m.id, el);
              else msgRefs.current.delete(m.id);
            }}
            className={`rounded-2xl transition-colors ${
              highlightId === m.id ? 'bg-accent/10' : ''
            }`}
          >
            <Bubble message={m} clientReadAt={clientReadAt} />
          </div>
        ))}
      </div>

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
            onFocus={onInputFocus}
            rows={1}
            maxLength={4000}
            placeholder="Сообщение"
            aria-label="Текст сообщения"
            className="block max-h-20 min-h-[40px] w-full resize-none overflow-y-auto rounded-2xl bg-chip py-2.5 pl-4 pr-12 text-[14px] leading-5 text-ink placeholder:text-ink-muted outline-none focus:ring-2 focus:ring-accent/30"
          />
          {draft.trim().length > 0 && (
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

function Bubble({
  message,
  clientReadAt,
}: {
  message: MessageResponse;
  clientReadAt: string | null;
}) {
  const time = formatTime(message.createdAt);

  // Системная плашка (например «задача выполнена») — по центру.
  if (message.kind === 'system') {
    return (
      <div className="flex justify-center">
        <div className="rounded-full bg-chip px-3 py-1 text-center text-[11px] text-ink-muted">
          {message.body}
        </div>
      </div>
    );
  }

  // Задача: тренер видит статус (чекбокс только для отображения, закрывает клиент).
  if (message.kind === 'task') {
    const done = message.taskDone === true;
    return (
      <div className="flex justify-end">
        <div className="flex max-w-[85%] items-start gap-2.5 rounded-2xl border border-accent/40 bg-card px-3 py-2.5">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
              done ? 'border-accent bg-accent text-accent-on' : 'border-ink-muted'
            }`}
          >
            {done && <Check size={14} strokeWidth={3} />}
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">
              Задача{done ? ' · выполнена' : ''}
            </div>
            <div
              className={`whitespace-pre-wrap break-words text-[14px] ${
                done ? 'text-ink-muted line-through' : 'text-ink'
              }`}
            >
              {message.body}
            </div>
            {time && <div className="mt-0.5 text-[10px] text-ink-muted">{time}</div>}
          </div>
        </div>
      </div>
    );
  }

  const mine = message.senderRole === 'trainer';
  // Статус только на своих (тренерских) сообщениях: прочитано клиентом, если
  // клиент читал диалог не раньше времени сообщения.
  const read = clientReadAt !== null && message.createdAt <= clientReadAt;
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-[14px] ${
          mine ? 'bg-accent text-accent-on' : 'bg-card text-ink'
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.body}</div>
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
}
