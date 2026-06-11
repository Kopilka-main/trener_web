import { Navigate, Route, Routes } from 'react-router-dom';
import { TelemetryRouter } from '@trener/telemetry';
import { useClientMe } from './api/auth';
import { BackFab } from './components/BackFab';
import { ConnectBanner } from './components/ConnectBanner';
import { AppBadgeSync } from './components/AppBadgeSync';
import { PushSync } from './components/PushSync';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConnectPage } from './pages/ConnectPage';
import { HomePage } from './pages/HomePage';
import { WorkoutsListPage } from './pages/WorkoutsListPage';
import { RunWorkoutPage } from './pages/RunWorkoutPage';
import { WorkoutDetailPage } from './pages/WorkoutDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChatPage } from './pages/ChatPage';
import { CalendarPage } from './pages/CalendarPage';
import { StatsPage } from './pages/StatsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { TrainerPage } from './pages/TrainerPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { ExerciseDetailPage } from './pages/ExerciseDetailPage';

export function App() {
  const me = useClientMe();

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-ink-muted">
        Загрузка…
      </div>
    );
  }

  // Не залогинен → экраны входа/регистрации.
  if (!me.data) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Залогинен → приложение всегда (тренер опционален). Пока не привязан — баннер
  // «Подключить тренера»; экран кода доступен по /connect, секции с тренерскими
  // данными мягко показывают приглашение подключиться.
  const linked = me.data.link !== null;
  return (
    <div className="mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-bg">
      <TelemetryRouter />
      <AppBadgeSync />
      <PushSync />
      {!linked && <ConnectBanner />}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workouts" element={<WorkoutsListPage />} />
          <Route path="/workouts/:wid/run" element={<RunWorkoutPage />} />
          <Route path="/workouts/:wid" element={<WorkoutDetailPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/progress" element={<StatsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/trainer" element={<TrainerPage />} />
          <Route path="/knowledge" element={<KnowledgePage />} />
          <Route path="/knowledge/:exerciseId" element={<ExerciseDetailPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/connect" element={<ConnectPage code={me.data.account.id} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BackFab />
    </div>
  );
}
