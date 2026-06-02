import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientCardPage } from './pages/ClientCardPage';
import { ClientEditPage } from './pages/ClientEditPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { ExerciseEditPage } from './pages/ExerciseEditPage';
import { TemplateEditPage } from './pages/TemplateEditPage';
import { CalendarPage, MessagesPage } from './pages/StubPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/new" element={<ClientEditPage mode="create" />} />
        <Route path="/clients/:id" element={<ClientCardPage />} />
        <Route path="/clients/:id/edit" element={<ClientEditPage mode="edit" />} />
        <Route path="/knowledge" element={<KnowledgeBasePage />} />
        <Route path="/knowledge/exercises/new" element={<ExerciseEditPage mode="create" />} />
        <Route path="/knowledge/exercises/:id/edit" element={<ExerciseEditPage mode="edit" />} />
        <Route path="/knowledge/templates/new" element={<TemplateEditPage mode="create" />} />
        <Route path="/knowledge/templates/:id/edit" element={<TemplateEditPage mode="edit" />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/messages" element={<MessagesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
