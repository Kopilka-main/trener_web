import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pageView } from './track.js';

/** Невидимый компонент: на каждую смену пути шлёт page_view. Рендерить внутри Router. */
export function TelemetryRouter(): null {
  const location = useLocation();
  useEffect(() => {
    pageView(location.pathname);
  }, [location.pathname]);
  return null;
}
