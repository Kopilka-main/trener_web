import { ImageIcon, Video } from 'lucide-react';

export type MediaMode = 'photo' | 'video';

/**
 * Переключатель «фото / видео» для размещения В ЗАГОЛОВКЕ блока демонстрации
 * (не поверх медиа). tone='on' — для тёмного/акцентного фона.
 */
export function MediaToggle({
  mode,
  onChange,
  tone = 'light',
}: {
  mode: MediaMode;
  onChange: (m: MediaMode) => void;
  tone?: 'light' | 'on';
}) {
  const wrap = tone === 'on' ? 'bg-black/20' : 'bg-chip';
  const active = tone === 'on' ? 'bg-white text-black' : 'bg-accent text-accent-on';
  const idle = tone === 'on' ? 'text-white/75' : 'text-ink-muted';
  return (
    <div className={`flex shrink-0 rounded-full p-0.5 ${wrap}`}>
      <button
        type="button"
        onClick={() => onChange('photo')}
        aria-label="Фото"
        aria-pressed={mode === 'photo'}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          mode === 'photo' ? active : idle
        }`}
      >
        <ImageIcon size={15} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => onChange('video')}
        aria-label="Видео"
        aria-pressed={mode === 'video'}
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          mode === 'video' ? active : idle
        }`}
      >
        <Video size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * Медиа-демонстрация (управляемая режимом): фото (poster) либо зацикленное видео
 * без звука. Видео монтируется только в режиме 'video' — до переключения не грузится.
 * Переключатель режима выносится в заголовок через <MediaToggle/>.
 */
export function DemoVideo({
  src,
  poster,
  mode,
  className,
}: {
  src: string;
  poster?: string | undefined;
  mode: MediaMode;
  className?: string | undefined;
}) {
  return (
    <div className={`overflow-hidden ${className ?? ''}`}>
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
    </div>
  );
}
