import { Navigate, Route, Routes } from 'react-router-dom';
import { useClientMe } from './api/auth';
import { BottomNav } from './components/BottomNav';
import { ConnectBanner } from './components/ConnectBanner';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConnectPage } from './pages/ConnectPage';
import { StubPage } from './pages/StubPage';
import { WorkoutsListPage } from './pages/WorkoutsListPage';
import { WorkoutDetailPage } from './pages/WorkoutDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { ChatPage } from './pages/ChatPage';
import { CalendarPage } from './pages/CalendarPage';

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
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-bg">
      {!linked && <ConnectBanner />}
      <Routes>
        <Route path="/" element={<WorkoutsListPage />} />
        <Route path="/workouts/:wid" element={<WorkoutDetailPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/progress" element={<StubPage title="Прогресс" />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/connect" element={<ConnectPage code={me.data.account.id} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
