import { useEffect, useRef, useState } from 'react';
import { cropImageToSquare } from '../lib/image';
import { useBackClose } from '../lib/backStack';

const BOX = 288; // сторона квадрата кропа, px
const MAX_ZOOM = 4;

/** Модальный кроппер аватара: выбранное фото можно двигать и масштабировать в
 * квадратной рамке (круглая подсказка — как будет выглядеть аватар). На выходе —
 * квадратный JPEG. Работает с прямоугольными фото: пользователь сам выбирает область. */
export function AvatarCropper({
  file,
  onCancel,
  onDone,
  busy = false,
}: {
  file: File;
  onCancel: () => void;
  onDone: (blob: Blob) => void;
  busy?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);

  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Кнопка «Назад» закрывает кроппер (= Отмена).
  useBackClose(onCancel);

  // ObjectURL для предпросмотра; чистим за собой.
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  // Базовый масштаб «cover»: меньшая сторона заполняет рамку.
  const base = nat ? BOX / Math.min(nat.w, nat.h) : 1;
  const dispW = nat ? nat.w * base * zoom : BOX;
  const dispH = nat ? nat.h * base * zoom : BOX;

  // Зажимаем сдвиг так, чтобы фото всегда полностью закрывало рамку.
  function clamp(o: { x: number; y: number }): { x: number; y: number } {
    const minX = BOX - dispW;
    const minY = BOX - dispH;
    return {
      x: Math.min(0, Math.max(minX, o.x)),
      y: Math.min(0, Math.max(minY, o.y)),
    };
  }

  // Центрируем при загрузке и при смене зума.
  useEffect(() => {
    if (!nat) return;
    setOffset((prev) => clamp({ x: prev.x, y: prev.y }));
  }, [zoom, nat]);

  function onImgLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNat({ w, h });
    const b = BOX / Math.min(w, h);
    setOffset({ x: (BOX - w * b) / 2, y: (BOX - h * b) / 2 });
  }

  function onPointerDown(e: React.PointerEvent) {
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    setOffset(clamp({ x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    if (!nat || working || busy) return;
    setWorking(true);
    try {
      const factor = base * zoom; // экранных px на 1 исходный px
      const crop = {
        sx: -offset.x / factor,
        sy: -offset.y / factor,
        size: BOX / factor,
      };
      const blob = await cropImageToSquare(file, crop);
      onDone(blob);
    } finally {
      setWorking(false);
    }
  }

  const disabled = working || busy || !nat;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black/80 px-4">
      <p className="text-[14px] font-semibold text-white">Выберите область фото</p>

      <div
        className="relative overflow-hidden rounded-2xl bg-black touch-none"
        style={{ width: BOX, height: BOX }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {url && (
          <img
            src={url}
            alt=""
            onLoad={onImgLoad}
            draggable={false}
            style={{
              width: dispW,
              height: dispH,
              transform: `translate(${String(offset.x)}px, ${String(offset.y)}px)`,
            }}
            className="max-w-none select-none"
          />
        )}
        {/* Круглая подсказка — как будет выглядеть аватар. */}
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
      </div>

      <input
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label="Масштаб"
        className="w-full max-w-[288px] accent-accent"
      />

      <div className="flex w-full max-w-[288px] gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={working || busy}
          className="flex-1 rounded-xl bg-card-elevated py-3 text-[14px] font-semibold text-ink active:opacity-90 disabled:opacity-60"
        >
          Отмена
        </button>
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={disabled}
          className="flex-1 rounded-xl bg-accent py-3 text-[14px] font-semibold text-accent-on active:opacity-90 disabled:opacity-40"
        >
          {working || busy ? 'Сохранение…' : 'Готово'}
        </button>
      </div>
    </div>
  );
}
