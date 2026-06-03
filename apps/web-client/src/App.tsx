import { Navigate, Route, Routes } from 'react-router-dom';
import { useClientMe } from './api/auth';
import { BottomNav } from './components/BottomNav';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ConnectPage } from './pages/ConnectPage';
import { StubPage } from './pages/StubPage';

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

  // Залогинен, но не привязан тренером → экран кода.
  if (me.data.link === null) {
    return <ConnectPage code={me.data.account.id} />;
  }

  // Привязан → основное приложение с нижней навигацией и заглушками секций.
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-bg">
      <Routes>
        <Route path="/" element={<StubPage title="Тренировки" />} />
        <Route path="/calendar" element={<StubPage title="Календарь" />} />
        <Route path="/chat" element={<StubPage title="Чат" />} />
        <Route path="/progress" element={<StubPage title="Прогресс" />} />
        <Route path="/profile" element={<StubPage title="Профиль" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}
