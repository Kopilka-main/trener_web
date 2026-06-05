import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from './track.js';

type Props = { children: ReactNode; fallback?: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError({
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      path: location.pathname,
      context: { componentStack: (info.componentStack ?? '').slice(0, 2000) },
    });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              minHeight: '100dvh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <p style={{ fontSize: 16, fontWeight: 600 }}>Что-то пошло не так</p>
            <button
              type="button"
              onClick={() => location.reload()}
              style={{ padding: '10px 16px', borderRadius: 12 }}
            >
              Перезагрузить
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
