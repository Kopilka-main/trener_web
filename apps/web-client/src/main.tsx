import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { initTelemetry, ErrorBoundary } from '@trener/telemetry';
import { App } from './App';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import { DevInspector } from './components/DevInspector';
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
  source: 'client',
  ...(import.meta.env.VITE_APP_VERSION
    ? { appVersion: import.meta.env.VITE_APP_VERSION as string }
    : {}),
});

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <ConnectivityBanner />
        {import.meta.env.DEV && <DevInspector />}
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
