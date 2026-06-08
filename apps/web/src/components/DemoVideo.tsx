import { useRef, useState } from 'react';

/**
 * Видео-демонстрация без нативной панели управления: зациклено, играет по
 * умолчанию (autoplay, без звука). Видимых кнопок нет, чтобы не загораживать
 * картинку — тап по видео переключает play/pause.
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
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  function toggle() {
    const v = ref.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="block w-full"
      />
      {/* Прозрачная область: тап переключает воспроизведение, ничего не загораживая. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Пауза' : 'Играть'}
        className="absolute inset-0"
      />
    </div>
  );
}
