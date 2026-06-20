import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, Clock, Dumbbell, MessageSquare, Ruler, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SessionResponse } from '@trener/shared';
import { useClientSessions } from '../api/calendar';
import { SessionSheet } from './CalendarPage';
import {
  useClientChatUnread,
  useClientMessages,
  useCompleteTask,
  useMarkChatRead,
} from '../api/chat';
import { useClientPackages } from '../api/packages';
import { useClientWorkouts } from '../api/workouts';
import { useClientMeasurementTasks } from '../api/measurements';
import { HoldToDelete } from '../components/HoldToDelete';
import { toISODate } from '../lib/calendar';
import {
  buildClientNotifications,
  dismissNotification,
  loadDismissed,
  type ClientNotificationKind,
} from '../lib/notifications';

const ICONS: Record<ClientNotificationKind, LucideIcon> = {
  confirm: CalendarPlus,
  soon: Clock,
  chat: MessageSquare,
  package: Wallet,
  workout: Dumbbell,
  measure: Ruler,
};

export function NotificationsPage() {
  const navigate = useNavigate();
  const now = new Date();
  // Назад на 30 дней — чтобы проведённые занятия (confirm-уведомление о согласовании
  // задним числом) тоже попадали в выборку и открывались в шторке.
  const from = toISODate(new Date(now.getTime() - 30 * 86400000));
  const to = toISODate(new Date(now.getTime() + 30 * 86400000));

  const sessions = useClientSessions(from, to).data ?? [];
  const [confirmSession, setConfirmSession] = useState<SessionResponse | null>(null);
  const unread = useClientChatUnread().data ?? 0;
  const packages = useClientPackages().data ?? [];
  const workouts = useClientWorkouts().data ?? [];
  const measurementTasks = useClientMeasurementTasks().data ?? [];
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  const items = buildClientNotifications({
    sessions,
    unread,
    now,
    dismissed,
    packages,
    workouts,
    measurementTasks,
  });

  // Открытые задачи от тренера (требуют внимания): берём из ленты сообщений и
  // показываем с чекбоксом — клиент закрывает их прямо отсюда.
  const messages = useClientMessages().data?.messages ?? [];
  const openTasks = messages.filter((m) => m.kind === 'task' && m.taskDone !== true);
  const completeTask = useCompleteTask();

  // Уход со страницы уведомлений = «увидел» новые сообщения → отмечаем чат прочитанным,
  // чтобы счётчик непрочитанных (плитка «Уведомления» на главной) сбросился. Карточка
  // остаётся видимой и кликабельной всё время просмотра — отметка происходит при размонтировании.
  const markReadMutate = useMarkChatRead().mutate;
  const unreadRef = useRef(unread);
  unreadRef.current = unread;
  useEffect(() => {
    return () => {
      if (unreadRef.current > 0) markReadMutate();
    };
  }, [markReadMutate]);

  return (
    <div className="flex h-full flex-col">
      <h1 className="px-2 pt-5 font-[family-name:var(--font-display)] text-[24px] text-ink">
        Уведомления
      </h1>

      <div className="flex flex-1 flex-col gap-2 px-2 pb-6 pt-3">
        {items.length === 0 && openTasks.length === 0 && (
          <p className="m-auto text-sm text-ink-muted">Уведомлений нет.</p>
        )}

        {openTasks.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-card px-4 py-3"
          >
            <button
              type="button"
              disabled={completeTask.isPending}
              onClick={() => completeTask.mutate(t.id)}
              aria-label="Отметить задачу выполненной"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-ink-muted disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void navigate('/chat')}
              className="flex min-w-0 flex-1 flex-col text-left active:opacity-80"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                Задача
              </span>
              <span className="min-w-0 text-[14px] text-ink">{t.body}</span>
            </button>
          </div>
        ))}

        {items.length > 0 &&
          items.map((n) => {
            const Icon = ICONS[n.kind];
            return (
              <div key={n.id} className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    // Согласование занятия — открываем шторку подтверждения прямо здесь
                    // (как в календаре), а не перебрасываем на страницу календаря.
                    if (n.kind === 'confirm' && n.sessionId) {
                      const s = sessions.find((x) => x.id === n.sessionId);
                      if (s) {
                        setConfirmSession(s);
                        return;
                      }
                    }
                    void navigate(n.to);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-80"
                >
                  <Icon size={18} strokeWidth={2} className="shrink-0 text-accent-text" />
                  <span className="min-w-0 flex-1 text-[14px] text-ink">{n.text}</span>
                </button>
                <HoldToDelete
                  onDelete={() => setDismissed(dismissNotification(n.id))}
                  label="Удерживайте, чтобы убрать уведомление"
                />
              </div>
            );
          })}
      </div>

      {confirmSession && (
        <SessionSheet session={confirmSession} onClose={() => setConfirmSession(null)} />
      )}
    </div>
  );
}
