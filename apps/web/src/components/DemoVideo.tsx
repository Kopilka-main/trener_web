import { useState } from 'react';
import { ImageIcon, Video } from 'lucide-react';

/**
 * Демонстрация упражнения с переключателем «фото / видео» в верхнем углу.
 * По умолчанию показывается фото (poster); видео подгружается и проигрывается
 * (зацикленно, без звука) только при переключении на режим «видео».
 */
export function DemoVideo({
  src,
  poster,
  className,
}: {
  src: string;
  poster?: string | undefined;
  className?: string | undefined;
}) {
  const [mode, setMode] = useState<'photo' | 'video'>(poster ? 'photo' : 'video');

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      {mode === 'video' ? (
        <video
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="block w-full"
        />
      ) : (
        <img src={poster} alt="" className="block w-full" />
      )}

      {/* Переключатель фото/видео в правом верхнем углу. */}
      {poster && (
        <div className="absolute right-2 top-2 flex rounded-full bg-black/45 p-0.5 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setMode('photo')}
            aria-label="Фото"
            aria-pressed={mode === 'photo'}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              mode === 'photo' ? 'bg-white text-black' : 'text-white/75'
            }`}
          >
            <ImageIcon size={15} strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => setMode('video')}
            aria-label="Видео"
            aria-pressed={mode === 'video'}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              mode === 'video' ? 'bg-white text-black' : 'text-white/75'
            }`}
          >
            <Video size={15} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}
