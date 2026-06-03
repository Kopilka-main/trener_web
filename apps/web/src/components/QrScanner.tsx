import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';

interface QrScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
}

/**
 * Полноэкранный сканер QR-кода через камеру. При успешном чтении вызывает
 * onResult и закрывается. Тыловая камера по возможности (facingMode environment).
 */
export function QrScanner({ onResult, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const reader = new BrowserQRCodeReader();
    let controls: IScannerControls | null = null;
    let done = false;

    const video = videoRef.current;
    if (!video) return;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        (result) => {
          if (result && !done) {
            done = true;
            controls?.stop();
            onResult(result.getText().trim());
          }
        },
      )
      .then((c) => {
        controls = c;
      })
      .catch(() => {
        setError('Не удалось открыть камеру. Разрешите доступ и попробуйте снова.');
      });

    return () => {
      controls?.stop();
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-[15px] font-semibold text-white">Сканируйте QR клиента</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white active:bg-white/25"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {/* Рамка-видоискатель */}
        <div className="pointer-events-none absolute h-56 w-56 rounded-3xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        {error && (
          <p className="absolute bottom-10 px-8 text-center text-[14px] text-white" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
