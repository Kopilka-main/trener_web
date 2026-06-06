import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { initTelemetry, ErrorBoundary } from '@trener/telemetry';
import { App } from './App';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { UpdateBanner } from './components/UpdateBanner';
import { registerPushServiceWorker } from './lib/push';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Не найден корневой элемент #root');

initTelemetry({
  apiBaseUrl: '',
  source: 'trainer',
  ...(import.meta.env.VITE_APP_VERSION
    ? { appVersion: import.meta.env.VITE_APP_VERSION as string }
    : {}),
});

// Регистрируем SW для приёма push (без запроса разрешений — подписка по тапу в профиле).
void registerPushServiceWorker();

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ConnectivityBanner />
        <UpdateBanner />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
