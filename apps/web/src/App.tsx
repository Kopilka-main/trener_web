import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/AppShell';
import { DevInspector } from './components/DevInspector';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { HomePage } from './pages/HomePage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientCardPage } from './pages/ClientCardPage';
import { ClientEditPage } from './pages/ClientEditPage';
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
import { ExerciseEditPage } from './pages/ExerciseEditPage';
import { TemplateEditPage } from './pages/TemplateEditPage';
import { ClientWorkoutsPage } from './pages/ClientWorkoutsPage';
import { ClientCalendarPage } from './pages/ClientCalendarPage';
import { ActiveWorkoutPage } from './pages/ActiveWorkoutPage';
import {
  CalendarPage,
  MessagesPage,
  AccountingPage,
  NotificationsPage,
  ProfilePage,
  ClientSectionPage,
} from './pages/StubPage';

export function App() {
  return (
    <>
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
          <Route path="/clients/:id/workouts" element={<ClientWorkoutsPage />} />
          <Route path="/clients/:id/workouts/:wid" element={<ActiveWorkoutPage />} />
          <Route path="/clients/:id/calendar" element={<ClientCalendarPage />} />
          <Route path="/clients/:id/:section" element={<ClientSectionPage />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
          <Route path="/knowledge/exercises/new" element={<ExerciseEditPage mode="create" />} />
          <Route path="/knowledge/exercises/:id/edit" element={<ExerciseEditPage mode="edit" />} />
          <Route path="/knowledge/templates/new" element={<TemplateEditPage mode="create" />} />
          <Route path="/knowledge/templates/:id/edit" element={<TemplateEditPage mode="edit" />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/accounting" element={<AccountingPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DevInspector />
    </>
  );
}
