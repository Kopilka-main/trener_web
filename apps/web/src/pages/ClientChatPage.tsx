import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUp, Check, CheckCheck } from 'lucide-react';
import type { MessageResponse } from '@trener/shared';
import {
  useChatMessages,
  useDeleteConversation,
  useMarkConversationRead,
  useSendMessage,
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

  const [draft, setDraft] = useState('');
  const listEndRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Авто-рост поля ввода до 3 строк (80px), далее — внутренняя прокрутка.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`;
  }, [draft]);

  const list = messages.data?.messages ?? [];
  const clientReadAt = messages.data?.clientLastReadAt ?? null;
  const title = client.data ? `${client.data.firstName} ${client.data.lastName}`.trim() : 'Чат';

  // Автоскролл вниз при появлении новых сообщений.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: 'end' });
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
    send.mutate(body, {
      onError: () => {
        // Возвращаем текст в поле, чтобы тренер не потерял сообщение.
        setDraft((current) => (current.length === 0 ? body : current));
      },
    });
  }

  function scrollToBottom() {
    listEndRef.current?.scrollIntoView({ block: 'end' });
  }

  // При фокусе на поле клавиатура ужимает область сообщений и сбивает скролл —
  // после её появления (с запасом по времени) возвращаемся к последнему сообщению.
  function onInputFocus() {
    [50, 250, 450].forEach((d) => window.setTimeout(scrollToBottom, d));
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

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-3 pt-2">
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
              Подсказка: начните сообщение с <span className="font-mono">/task</span> — и оно станет
              задачей с чекбоксом для клиента.
            </p>
          </div>
        )}

        {list.map((m) => (
          <Bubble key={m.id} message={m} clientReadAt={clientReadAt} />
        ))}
        <div ref={listEndRef} />
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
