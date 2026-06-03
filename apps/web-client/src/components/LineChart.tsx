import { useId, useRef, useState } from 'react';

/** Одна точка графика: позиция по оси X (произвольная единица — обычно индекс) и значение. */
export interface LineChartPoint {
  /** Значение по оси X (используется только для масштабирования по горизонтали). */
  x: number;
  /** Значение по оси Y. */
  y: number;
  /** Подпись точки (например дата) — показывается при наведении/тапе. */
  label?: string;
}

export interface LineChartProps {
  points: LineChartPoint[];
  /** Цвет линии и заливки (CSS-значение). По умолчанию — акцент (лайм). */
  color?: string;
  /** Суффикс значения (кг, см, %) — для подписей. */
  suffix?: string;
  /** Высота области в px (ширина всегда 100%). */
  height?: number;
}

const VIEW_W = 320;
const PAD_X = 10;
const PAD_Y = 14;

/**
 * Простой линейный график на чистом SVG: ломаная линия с точками, полупрозрачная
 * заливка под линией, подписи крайних значений по оси Y и интерактивный курсор
 * (тап/наведение показывает ближайшую точку). Без внешних библиотек.
 *
 * viewBox масштабируется по данным (нормализация min..max), ширина адаптивная (100%).
 * Точки располагаются равномерно по X в порядке передачи.
 */
export function LineChart({
  points,
  color = 'var(--color-accent)',
  suffix = '',
  height = 150,
}: LineChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const gradientId = useId();

  if (points.length < 2) {
    return (
      <div className="py-8 text-center text-[12px] text-ink-muted">
        Недостаточно данных для графика
      </div>
    );
  }

  const ys = points.map((p) => p.y);
  const max = Math.max(...ys);
  const min = Math.min(...ys);
  const range = max - min;
  const stepX = (VIEW_W - PAD_X * 2) / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = PAD_X + i * stepX;
    const y =
      range > 0 ? height - PAD_Y - ((p.y - min) / range) * (height - PAD_Y * 2) : height / 2;
    return { x, y, value: p.y, label: p.label };
  });

  const first = coords[0];
  const last = coords[coords.length - 1];
  if (!first || !last) return null;

  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${String(c.x)},${String(c.y)}`)
    .join(' ');
  const area = `${line} L${String(last.x)},${String(height - PAD_Y)} L${String(first.x)},${String(height - PAD_Y)} Z`;

  const active = activeIdx !== null ? coords[activeIdx] : null;

  function handleMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * VIEW_W;
    let bestI = 0;
    let bestD = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - viewX);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    setActiveIdx(bestI);
  }

  function formatNum(n: number): string {
    return (Math.round(n * 10) / 10).toString().replace('.', ',');
  }

  return (
    <div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${String(VIEW_W)} ${String(height)}`}
        preserveAspectRatio="none"
        className="w-full touch-none"
        style={{ height }}
        role="img"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handleMove(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === 'mouse') return;
          handleMove(e.clientX);
        }}
        onPointerLeave={() => setActiveIdx(null)}
        onPointerUp={(e) => {
          if (e.pointerType !== 'mouse') setActiveIdx(null);
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={2.5} fill={color} />
        ))}
        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={0}
              y2={height}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r={5}
              fill={color}
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      <div className="mt-1 flex items-center justify-between font-[family-name:var(--font-mono)] text-[10px] tabular-nums text-ink-mutedxl">
        <span>{first.label ?? ''}</span>
        <span className="text-center text-ink-muted">
          {active ? (
            <>
              {active.label ? `${active.label} · ` : ''}
              <span className="text-ink">
                {formatNum(active.value)}
                {suffix}
              </span>
            </>
          ) : (
            <>
              мин {formatNum(min)}
              {suffix} · макс {formatNum(max)}
              {suffix}
            </>
          )}
        </span>
        <span>{last.label ?? ''}</span>
      </div>
    </div>
  );
}
