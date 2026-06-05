import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.js';
import * as track from './track.js';

function Boom(): never {
  throw new Error('render boom');
}

describe('ErrorBoundary', () => {
  it('рендерит fallback и репортит ошибку', () => {
    const spy = vi.spyOn(track, 'reportError').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Что-то пошло не так/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
  });
});
