import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Send, Check, CheckCheck } from 'lucide-react';
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={title}
        back={`/clients/${id}`}
        right={
          list.length > 0 ? (
            <HoldToDelete
              icon="trash"
              label="Удерживайте, чтобы удалить переписку"
              onDelete={() =>
                removeChat.mutate(undefined, {
                  onSuccess: () => void navigate(`/clients/${id}`),
                })
              }
            />
          ) : undefined
        }
      />

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-4 pb-3 pt-2">
        {messages.isPending && (
          <p className="pt-10 text-center text-sm text-ink-muted">Загрузка…</p>
        )}

        {messages.isError && (
          <p className="pt-10 text-center text-sm text-ink-muted" role="alert">
            Не удалось загрузить сообщения. Попробуйте обновить страницу.
          </p>
        )}

        {messages.isSuccess && list.length === 0 && (
          <p className="pt-10 text-center text-sm text-ink-muted">
            Сообщений пока нет. Напишите первым.
          </p>
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
          className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl bg-chip px-4 py-2.5 text-[14px] text-ink placeholder:text-ink-muted outline-none focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0 || send.isPending}
          aria-label="Отправить"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-on transition-opacity active:scale-[0.95] disabled:opacity-30"
        >
          <Send size={16} strokeWidth={2} />
        </button>
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
  const mine = message.senderRole === 'trainer';
  const time = formatTime(message.createdAt);
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
