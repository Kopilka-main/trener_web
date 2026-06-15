import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronRight,
  Dumbbell,
  ImagePlus,
  Pencil,
  Plus,
  Ruler,
} from 'lucide-react';
import type {
  CreateMeasurementRequest,
  MeasurementResponse,
  PhotoResponse,
  WorkoutResponse,
} from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
import { LineChart, type LineChartPoint } from '../components/LineChart';
import { useClient } from '../api/clients';
import { useClientWorkouts } from '../api/client-workouts';
import {
  useClientMeasurements,
  useCreateMeasurement,
  useDeleteMeasurement,
  useUpdateMeasurement,
} from '../api/measurements';
import {
  fileUrl,
  useClientProgressPhotos,
  useDeleteProgressPhoto,
  useUploadProgressPhoto,
} from '../api/progress-photos';
import {
  aggregateExerciseHistory,
  aggregateExerciseOverview,
  workoutRowStats,
  type ExerciseHistory,
  type ExerciseHistoryPoint,
  type ExerciseOverview,
} from '../lib/workout-stats';

type Tab = 'exercises' | 'measurements' | 'photos';

const ANGLES = [
  { value: 'front', label: 'Фас' },
  { value: 'side', label: 'Бок' },
  { value: 'back', label: 'Спина' },
] as const;

type AngleValue = (typeof ANGLES)[number]['value'];

function angleLabel(angle: string): string {
  return ANGLES.find((a) => a.value === angle)?.label ?? angle;
}

/**
 * Подэкран статистики клиента. Три таба сверху:
 *  • Упражнения — обзор по упражнениям из завершённых тренировок (PR/тоннаж/тренд);
 *  • Замеры — список замеров тела + форма создания/редактирования;
 *  • Фото — галерея фото прогресса по датам + загрузка.
 */
export function ClientStatsPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: client } = useClient(id);
  const [tab, setTab] = useState<Tab>('exercises');

  const title = client ? `Прогресс · ${client.firstName} ${client.lastName}`.trim() : 'Прогресс';

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title={title} back={`/clients/${id}`} />

      <div className="px-2 pt-1">
        <div className="flex gap-1 rounded-xl bg-chip p-1">
          <TabButton active={tab === 'exercises'} onClick={() => setTab('exercises')}>
            Упражнения
          </TabButton>
          <TabButton active={tab === 'measurements'} onClick={() => setTab('measurements')}>
            Замеры
          </TabButton>
          <TabButton active={tab === 'photos'} onClick={() => setTab('photos')}>
            Фото
          </TabButton>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-2 pb-8 pt-4">
        {tab === 'exercises' && <ExercisesTab clientId={id} />}
        {tab === 'measurements' && <MeasurementsTab clientId={id} />}
        {tab === 'photos' && <PhotosTab clientId={id} />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors ${
        active ? 'bg-card text-ink' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Общие мелочи ────────────────────────────────────────────────────────────

function EmptyState({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 pt-10 text-center">
      {icon}
      <p className="text-sm text-ink-muted">{children}</p>
    </div>
  );
}

function formatTonnage(kg: number): string {
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.', ',')} т`;
  return `${String(kg)} кг`;
}

function formatTime(sec: number): string {
  if (sec >= 3600) return `${(sec / 3600).toFixed(1).replace('.', ',')} ч`;
  if (sec >= 60) return `${String(Math.round(sec / 60))} мин`;
  return `${String(sec)} с`;
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  if (days < 7) return `${String(days)} дн назад`;
  if (days < 30) return `${String(Math.floor(days / 7))} нед назад`;
  if (days < 365) return `${String(Math.floor(days / 30))} мес назад`;
  return `${String(Math.floor(days / 365))} г назад`;
}

const RU_MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** Дата вида YYYY-MM-DD → «1 мая 2026». */
function formatRuDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d)} ${RU_MONTHS[m - 1]} ${String(y)}`;
}

// ─── Упражнения ────────────────────────────────────────────────────────────

function ExercisesTab({ clientId }: { clientId: string }) {
  const workouts = useClientWorkouts(clientId);
  const items = useMemo(() => aggregateExerciseOverview(workouts.data ?? []), [workouts.data]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  if (workouts.isPending) {
    return <p className="text-sm text-ink-muted">Загрузка…</p>;
  }
  if (workouts.isError) {
    return (
      <p className="text-sm text-ink-muted" role="alert">
        Не удалось загрузить статистику. Попробуйте обновить страницу.
      </p>
    );
  }

  if (selected) {
    const history = aggregateExerciseHistory(workouts.data ?? [], selected.id);
    return (
      <ExerciseDetail name={selected.name} history={history} onBack={() => setSelected(null)} />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState icon={<Dumbbell size={28} strokeWidth={1.6} className="text-ink-muted" />}>
        Клиент ещё не делал упражнений в проведённых тренировках.
      </EmptyState>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((ex) => (
        <ExerciseRow
          key={ex.exerciseId}
          ex={ex}
          onOpen={() => setSelected({ id: ex.exerciseId, name: ex.name })}
        />
      ))}
    </ul>
  );
}

function ExerciseRow({ ex, onOpen }: { ex: ExerciseOverview; onOpen: () => void }) {
  const TrendIcon = ex.lastIsRecord ? ArrowUp : ArrowDown;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="tile-shadow flex w-full items-center gap-3 rounded-2xl p-4 text-left active:opacity-90"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-semibold text-ink">{ex.name}</span>
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
            {ex.isTimeBased ? (
              <>
                {ex.maxTimeSec !== null && (
                  <span>
                    PR <b className="tabular-nums text-ink">{formatTime(ex.maxTimeSec)}</b>
                  </span>
                )}
                {ex.totalTimeSec > 0 && (
                  <span>
                    время <b className="tabular-nums text-ink">{formatTime(ex.totalTimeSec)}</b>
                  </span>
                )}
              </>
            ) : (
              <>
                {ex.maxWeightKg !== null && (
                  <span>
                    PR <b className="tabular-nums text-ink">{String(ex.maxWeightKg)}</b> кг
                  </span>
                )}
                {ex.tonnageKg > 0 && (
                  <span>
                    тоннаж <b className="tabular-nums text-ink">{formatTonnage(ex.tonnageKg)}</b>
                  </span>
                )}
              </>
            )}
            {ex.lastDate && <span>· {formatRelativeDate(ex.lastDate)}</span>}
          </span>
        </span>
        <TrendIcon
          size={18}
          strokeWidth={2.4}
          className={ex.lastIsRecord ? 'shrink-0 text-accent-text' : 'shrink-0 text-ink-mutedxl'}
          aria-label={ex.lastIsRecord ? 'Рекорд в последней сессии' : 'Без рекорда'}
        />
        <ChevronRight size={18} className="shrink-0 text-ink-mutedxl" />
      </button>
    </li>
  );
}

// ─── Прогресс по упражнению ───────────────────────────────────────────────────

function formatSeconds(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${String(h)}ч ${String(m).padStart(2, '0')}м`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m)}:${String(s).padStart(2, '0')}`;
  }
  return `${String(sec)}с`;
}

/** ISO-дату → «1 мая 2026». */
function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate())} ${RU_MONTHS[d.getMonth()]} ${String(d.getFullYear())}`;
}

function ExerciseDetail({
  name,
  history,
  onBack,
}: {
  name: string;
  history: ExerciseHistory | null;
  onBack: () => void;
}) {
  const [recordsOnly, setRecordsOnly] = useState(true);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-[13px] font-semibold text-ink-muted active:text-ink"
        >
          ← Назад
        </button>
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-bold text-ink">{name}</h2>
      </div>

      {!history || history.points.length === 0 ? (
        <EmptyState icon={<Dumbbell size={28} strokeWidth={1.6} className="text-ink-muted" />}>
          Клиент ещё не делал это упражнение в проведённых тренировках.
        </EmptyState>
      ) : (
        <>
          <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3">
            <span className="text-[14px] font-semibold text-ink">Только рекорды</span>
            <Toggle checked={recordsOnly} onChange={setRecordsOnly} />
          </label>

          {history.isTimeBased ? (
            <>
              <ChartCard
                title="Максимальное время"
                suffix="с"
                color="var(--color-accent)"
                points={history.points.map((p) => ({ date: p.date, value: p.maxTimeSec ?? 0 }))}
                recordsOnly={recordsOnly}
                formatValue={formatSeconds}
              />
              <ChartCard
                title="Суммарное время"
                suffix="с"
                color="var(--color-coral)"
                points={history.points.map((p) => ({ date: p.date, value: p.totalTimeSec }))}
                recordsOnly={recordsOnly}
                formatValue={formatSeconds}
              />
            </>
          ) : (
            <>
              <ChartCard
                title="Тоннаж"
                suffix="кг"
                color="var(--color-accent)"
                points={history.points.map((p) => ({ date: p.date, value: p.tonnage }))}
                recordsOnly={recordsOnly}
              />
              <ChartCard
                title="Максимальный вес"
                suffix="кг"
                color="var(--color-coral)"
                points={history.points.map((p) => ({ date: p.date, value: p.maxWeightKg ?? 0 }))}
                recordsOnly={recordsOnly}
              />
            </>
          )}

          <HistoryTable points={history.points} isTimeBased={history.isTimeBased} />
        </>
      )}
    </div>
  );
}

/** SVG-line-график с интерактивным курсором и дельтой к первой сессии. */
function ChartCard({
  title,
  suffix,
  color,
  points,
  recordsOnly,
  formatValue,
}: {
  title: string;
  suffix: string;
  color: string;
  points: { date: string | null; value: number }[];
  recordsOnly: boolean;
  formatValue?: (v: number) => string;
}) {
  const data = useMemo(() => {
    const cleaned = points.filter(
      (p): p is { date: string; value: number } => p.date !== null && p.value > 0,
    );
    if (!recordsOnly) return cleaned;
    let maxSoFar = -Infinity;
    return cleaned.filter((p) => {
      if (p.value > maxSoFar) {
        maxSoFar = p.value;
        return true;
      }
      return false;
    });
  }, [points, recordsOnly]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-4">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <div className="mt-2 text-[12px] text-ink-muted">Нет данных</div>
      </div>
    );
  }

  const W = 320;
  const H = 140;
  const PAD_X = 8;
  const PAD_Y = 12;
  const values = data.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;
  const stepX = data.length > 1 ? (W - PAD_X * 2) / (data.length - 1) : 0;
  const pts = data.map((p, i) => {
    const x = PAD_X + i * stepX;
    const y = range > 0 ? H - PAD_Y - ((p.value - min) / range) * (H - PAD_Y * 2) : H / 2;
    return { x, y, value: p.value, date: p.date };
  });
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${String(p.x)},${String(p.y)}`).join(' ');
  const lastPt = pts[pts.length - 1];
  const firstPt = pts[0];
  const last = data[data.length - 1];
  const first = data[0];
  if (!lastPt || !firstPt || !last || !first) return null;
  const areaPath = `${path} L${String(lastPt.x)},${String(H - PAD_Y)} L${String(firstPt.x)},${String(H - PAD_Y)} Z`;
  const delta = last.value - first.value;
  const deltaPct = first.value > 0 ? Math.round((delta / first.value) * 100) : 0;
  const active = activeIdx !== null ? pts[activeIdx] : null;

  function handleMove(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((clientX - rect.left) / rect.width) * W;
    let bestI = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(p.x - viewX);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    setActiveIdx(bestI);
  }

  const shownNumber = formatValue
    ? formatValue(active ? active.value : last.value)
    : String(active ? active.value : last.value);
  const deltaLabel = formatValue
    ? `${delta >= 0 ? '+' : '−'}${formatValue(Math.abs(delta))}`
    : `${delta >= 0 ? '+' : ''}${String(delta)} ${suffix}`;

  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <div className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-display)] text-[22px] leading-none tabular-nums text-ink">
            {shownNumber}
          </span>
          {!formatValue && <span className="text-[11px] text-ink-muted">{suffix}</span>}
        </div>
      </div>
      <div
        className="mt-1 font-[family-name:var(--font-mono)] text-[11px]"
        style={{ color: delta >= 0 ? 'var(--color-accent)' : 'var(--color-danger)' }}
      >
        {deltaLabel} ({deltaPct >= 0 ? '+' : ''}
        {String(deltaPct)}%) с первой сессии
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="mt-3 w-full touch-none"
        style={{ height: 140 }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          handleMove(e.clientX);
        }}
        onPointerMove={(e) => handleMove(e.clientX)}
        onPointerLeave={() => setActiveIdx(null)}
        onPointerUp={(e) => {
          if (e.pointerType !== 'mouse') setActiveIdx(null);
        }}
      >
        <path d={areaPath} fill={color} opacity={0.12} />
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}
        {active && (
          <>
            <line
              x1={active.x}
              x2={active.x}
              y1={0}
              y2={H}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r={6}
              fill={color}
              stroke="var(--color-bg)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      <div className="mt-2 min-h-[18px] text-center font-[family-name:var(--font-mono)] text-[11px] text-ink-muted">
        {active
          ? `${formatFullDate(active.date)} · ${formatValue ? formatValue(active.value) : `${String(active.value)} ${suffix}`}`
          : 'Тяни по графику'}
      </div>
    </div>
  );
}

function HistoryTable({
  points,
  isTimeBased,
}: {
  points: ExerciseHistoryPoint[];
  isTimeBased: boolean;
}) {
  const sorted = [...points].reverse(); // новые сверху
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
        История
      </h3>
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
        {sorted.map((p) => (
          <div
            key={p.workoutId}
            className="flex items-baseline justify-between gap-3 px-4 py-3 text-[13px]"
          >
            <div className="text-ink-muted">{p.date ? formatFullDate(p.date) : '—'}</div>
            <div className="flex items-baseline gap-3 font-[family-name:var(--font-mono)] text-[12px] tabular-nums">
              <span className="text-ink-mutedxl">{p.totalSets} подх.</span>
              {isTimeBased ? (
                <>
                  {p.maxTimeSec !== null && (
                    <span className="text-ink-muted">
                      PR <b className="text-ink">{formatSeconds(p.maxTimeSec)}</b>
                    </span>
                  )}
                  <span className="text-ink-muted">
                    {formatSeconds(p.totalTimeSec)} <span className="text-ink-mutedxl">всего</span>
                  </span>
                </>
              ) : (
                <>
                  {p.maxWeightKg !== null && (
                    <span className="text-ink-muted">
                      {p.topReps !== null && (
                        <>
                          <b className="text-ink">{p.topReps}</b> ×{' '}
                        </>
                      )}
                      <b className="text-ink">{p.maxWeightKg}</b> кг
                    </span>
                  )}
                  <span className="text-ink-muted">
                    {p.tonnage} <span className="text-ink-mutedxl">кг тоннаж</span>
                  </span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors"
      style={{
        width: 44,
        height: 24,
        background: checked ? 'var(--color-accent)' : 'var(--color-chip)',
        boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute rounded-full transition-transform"
        style={{
          top: 2,
          left: 2,
          width: 20,
          height: 20,
          background: 'linear-gradient(180deg, #ffffff 0%, #e6e6e6 100%)',
          boxShadow:
            '0 2px 4px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.15)',
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

// ─── Замеры ──────────────────────────────────────────────────────────────────

interface MeasurementField {
  label: string;
  value: number | null;
  suffix: string;
}

function measurementFields(m: MeasurementResponse): MeasurementField[] {
  return [
    { label: 'Вес', value: m.weightKg, suffix: 'кг' },
    { label: '% жира', value: m.bodyFatPct, suffix: '%' },
    { label: 'Грудь', value: m.chestCm, suffix: 'см' },
    { label: 'Талия', value: m.waistCm, suffix: 'см' },
    { label: 'Бёдра', value: m.hipsCm, suffix: 'см' },
  ];
}

function MeasurementsTab({ clientId }: { clientId: string }) {
  const measurements = useClientMeasurements(clientId);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MeasurementResponse | null>(null);

  const items = measurements.data ?? [];

  if (adding) {
    return <MeasurementForm clientId={clientId} onClose={() => setAdding(false)} />;
  }
  if (editing) {
    return (
      <MeasurementForm clientId={clientId} measurement={editing} onClose={() => setEditing(null)} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-[14px] font-medium text-ink"
      >
        <Plus size={16} /> Новый замер
      </button>

      {measurements.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {measurements.isError && (
        <p className="text-sm text-ink-muted" role="alert">
          Не удалось загрузить замеры.
        </p>
      )}
      {measurements.isSuccess && items.length === 0 && (
        <EmptyState icon={<Ruler size={28} strokeWidth={1.6} className="text-ink-muted" />}>
          Замеров пока нет. Добавьте первый.
        </EmptyState>
      )}

      {items.length > 0 && <MeasurementsAnalytics clientId={clientId} items={items} />}

      {items.map((m) => (
        <MeasurementCard key={m.id} m={m} onEdit={() => setEditing(m)} />
      ))}
    </div>
  );
}

// ─── Аналитика (графики динамики) ──────────────────────────────────────────────

interface MetricDef {
  key: 'weightKg' | 'waistCm' | 'chestCm' | 'hipsCm' | 'bodyFatPct';
  label: string;
  suffix: string;
}

const ANALYTICS_METRICS: MetricDef[] = [
  { key: 'weightKg', label: 'Вес', suffix: ' кг' },
  { key: 'waistCm', label: 'Талия', suffix: ' см' },
  { key: 'chestCm', label: 'Грудь', suffix: ' см' },
  { key: 'hipsCm', label: 'Бёдра', suffix: ' см' },
  { key: 'bodyFatPct', label: '% жира', suffix: ' %' },
];

/** Короткая подпись даты для оси: «1 мая». */
function shortRuDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${String(d)} ${RU_MONTHS[m - 1] ?? ''}`;
}

function metricPoints(items: MeasurementResponse[], key: MetricDef['key']): LineChartPoint[] {
  // Список приходит от новых к старым — для графика разворачиваем по возрастанию даты.
  const asc = [...items].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out: LineChartPoint[] = [];
  asc.forEach((m, i) => {
    const v = m[key];
    if (v !== null) out.push({ x: i, y: v, label: shortRuDate(m.date) });
  });
  return out;
}

/**
 * Блок «Аналитика»: график динамики выбранной метрики замеров (вес/обхваты/% жира)
 * с чипами-переключателями и отдельная мини-карта тоннажа по завершённым тренировкам.
 */
function MeasurementsAnalytics({
  clientId,
  items,
}: {
  clientId: string;
  items: MeasurementResponse[];
}) {
  // Доступны только метрики с ≥2 значениями (иначе график не построить).
  const available = useMemo(
    () => ANALYTICS_METRICS.filter((m) => metricPoints(items, m.key).length >= 2),
    [items],
  );
  const [metricKey, setMetricKey] = useState<MetricDef['key']>('weightKg');

  // Если выбранная метрика стала недоступной — переключаемся на первую доступную.
  const active = available.find((m) => m.key === metricKey) ?? available[0];
  const points = useMemo(() => (active ? metricPoints(items, active.key) : []), [items, active]);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="px-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
        Аналитика
      </h3>

      <div className="tile-shadow flex flex-col gap-3 rounded-2xl p-4">
        {available.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-ink-muted">
            Недостаточно данных для графика — нужно минимум 2 замера с одной метрикой.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {available.map((m) => {
                const isActive = active?.key === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMetricKey(m.key)}
                    className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      isActive ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <LineChart points={points} suffix={active?.suffix ?? ''} />
          </>
        )}
      </div>

      <TonnageChart clientId={clientId} />
    </div>
  );
}

/** Мини-карта тоннажа по завершённым тренировкам клиента во времени. */
function TonnageChart({ clientId }: { clientId: string }) {
  const workouts = useClientWorkouts(clientId);

  const points = useMemo<LineChartPoint[]>(() => {
    const completed = (workouts.data ?? [])
      .filter((w: WorkoutResponse) => w.status === 'completed')
      .map((w) => ({ w, ms: Date.parse(w.completedAt ?? w.startedAt ?? '') }))
      .filter((e) => Number.isFinite(e.ms))
      .sort((a, b) => a.ms - b.ms);
    const out: LineChartPoint[] = [];
    completed.forEach((e, i) => {
      const { tonnageKg } = workoutRowStats(e.w);
      if (tonnageKg > 0) {
        const iso = new Date(e.ms).toISOString().slice(0, 10);
        out.push({ x: i, y: tonnageKg, label: shortRuDate(iso) });
      }
    });
    return out;
  }, [workouts.data]);

  if (points.length < 2) return null;

  return (
    <div className="tile-shadow flex flex-col gap-3 rounded-2xl p-4">
      <h4 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
        Тоннаж по тренировкам
      </h4>
      <LineChart points={points} suffix=" кг" color="var(--color-accent)" />
    </div>
  );
}

function MeasurementCard({ m, onEdit }: { m: MeasurementResponse; onEdit: () => void }) {
  const present = measurementFields(m).filter((f) => f.value !== null);
  return (
    <div className="tile-shadow flex flex-col gap-2 rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-ink">{formatRuDate(m.date)}</span>
        <button
          type="button"
          onClick={onEdit}
          aria-label="Редактировать замер"
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted active:bg-card-elevated"
        >
          <Pencil size={15} />
        </button>
      </div>
      {present.length > 0 && (
        <div className="grid grid-cols-3 gap-y-3 gap-x-2">
          {present.map((f) => (
            <div key={f.label} className="flex flex-col gap-0.5">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.04em] text-ink-mutedxl">
                {f.label}
              </span>
              <span className="font-[family-name:var(--font-mono)] text-[15px] tabular-nums text-ink">
                {f.value}
                <span className="ml-0.5 text-[11px] text-ink-muted">{f.suffix}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {m.note && <p className="text-[13px] text-ink-muted">{m.note}</p>}
    </div>
  );
}

type MeasurementFormState = {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  note: string;
};

function initialFormState(m?: MeasurementResponse): MeasurementFormState {
  return {
    date: m?.date ?? new Date().toISOString().slice(0, 10),
    weightKg: m?.weightKg ?? null,
    bodyFatPct: m?.bodyFatPct ?? null,
    chestCm: m?.chestCm ?? null,
    waistCm: m?.waistCm ?? null,
    hipsCm: m?.hipsCm ?? null,
    note: m?.note ?? '',
  };
}

function MeasurementForm({
  clientId,
  measurement,
  onClose,
}: {
  clientId: string;
  measurement?: MeasurementResponse;
  onClose: () => void;
}) {
  const create = useCreateMeasurement(clientId);
  const update = useUpdateMeasurement(clientId);
  const remove = useDeleteMeasurement(clientId);
  const [form, setForm] = useState<MeasurementFormState>(() => initialFormState(measurement));
  const [error, setError] = useState<string | null>(null);

  const saving = create.isPending || update.isPending;

  function setField<K extends keyof MeasurementFormState>(key: K, value: MeasurementFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function buildPayload(): CreateMeasurementRequest {
    const note = form.note.trim();
    return {
      date: form.date,
      weightKg: form.weightKg,
      bodyFatPct: form.bodyFatPct,
      chestCm: form.chestCm,
      waistCm: form.waistCm,
      hipsCm: form.hipsCm,
      note: note === '' ? null : note,
    };
  }

  async function onSave() {
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setError('Укажите корректную дату.');
      return;
    }
    try {
      const payload = buildPayload();
      if (measurement) {
        await update.mutateAsync({ mid: measurement.id, input: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch {
      setError('Не удалось сохранить замер. Проверьте значения.');
    }
  }

  function onDelete() {
    if (!measurement) return;
    remove.mutate(measurement.id, { onSuccess: onClose });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-ink">
          {measurement ? 'Редактировать замер' : 'Новый замер'}
        </h2>
        <button type="button" onClick={onClose} className="text-[13px] text-ink-muted">
          Отмена
        </button>
      </div>

      <FormGroup title="Дата">
        <label className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-[14px] text-ink-muted">Дата</span>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setField('date', e.target.value)}
            className="bg-transparent text-right text-[14px] text-ink focus:outline-none"
          />
        </label>
      </FormGroup>

      <FormGroup title="Состав тела">
        <NumField
          label="Вес"
          suffix="кг"
          value={form.weightKg}
          onChange={(v) => setField('weightKg', v)}
        />
        <NumField
          label="% жира"
          suffix="%"
          value={form.bodyFatPct}
          onChange={(v) => setField('bodyFatPct', v)}
        />
      </FormGroup>

      <FormGroup title="Обхваты">
        <NumField
          label="Грудь"
          suffix="см"
          value={form.chestCm}
          onChange={(v) => setField('chestCm', v)}
        />
        <NumField
          label="Талия"
          suffix="см"
          value={form.waistCm}
          onChange={(v) => setField('waistCm', v)}
        />
        <NumField
          label="Бёдра"
          suffix="см"
          value={form.hipsCm}
          onChange={(v) => setField('hipsCm', v)}
        />
      </FormGroup>

      <FormGroup title="Заметка">
        <textarea
          value={form.note}
          onChange={(e) => setField('note', e.target.value)}
          rows={3}
          placeholder="Например: утро натощак"
          className="w-full resize-none bg-transparent px-4 py-3 text-[14px] text-ink placeholder:text-ink-mutedxl focus:outline-none"
        />
      </FormGroup>

      {error && (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        {measurement && (
          <HoldToDelete onDelete={onDelete} label="Удерживайте, чтобы удалить замер" />
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="flex-1 rounded-xl bg-accent py-3 text-[15px] font-bold text-accent-on disabled:opacity-60"
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="px-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
        {title}
      </h3>
      <div className="overflow-hidden rounded-2xl bg-card">{children}</div>
    </div>
  );
}

function NumField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-[14px] last:border-b-0">
      <span className="text-ink-muted">{label}</span>
      <span className="flex items-baseline gap-1">
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? null : Number(v));
          }}
          className="w-24 bg-transparent text-right font-[family-name:var(--font-mono)] tabular-nums text-ink focus:outline-none"
          placeholder="—"
        />
        <span className="text-[12px] text-ink-mutedxl">{suffix}</span>
      </span>
    </label>
  );
}

// ─── Фото прогресса ──────────────────────────────────────────────────────────

function PhotosTab({ clientId }: { clientId: string }) {
  const photos = useClientProgressPhotos(clientId);
  const upload = useUploadProgressPhoto(clientId);
  const remove = useDeleteProgressPhoto(clientId);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [angle, setAngle] = useState<AngleValue>('front');
  const [error, setError] = useState<string | null>(null);

  const items = photos.data ?? [];

  const groups = useMemo(() => {
    const map = new Map<string, PhotoResponse[]>();
    for (const p of items) {
      const arr = map.get(p.date) ?? [];
      arr.push(p);
      map.set(p.date, arr);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [items]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    upload.mutate({ file, date, angle }, { onError: () => setError('Не удалось загрузить фото.') });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-2xl bg-card p-3">
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 rounded-xl bg-card-elevated px-3 py-2 text-[14px] text-ink focus:outline-none"
          />
          <div className="flex rounded-xl bg-card-elevated p-0.5">
            {ANGLES.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAngle(a.value)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  angle === a.value ? 'bg-accent text-accent-on' : 'text-ink-muted'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 text-[13px] font-medium text-ink">
          <ImagePlus size={16} />
          {upload.isPending ? 'Загрузка…' : 'Выбрать фото'}
          <input type="file" accept="image/*" className="hidden" onChange={onPick} />
        </label>
      </div>

      {error && (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}

      {photos.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}
      {photos.isError && (
        <p className="text-sm text-ink-muted" role="alert">
          Не удалось загрузить фото.
        </p>
      )}
      {photos.isSuccess && items.length === 0 && (
        <EmptyState icon={<BarChart3 size={28} strokeWidth={1.6} className="text-ink-muted" />}>
          Фотографий пока нет.
        </EmptyState>
      )}

      {groups.map(([d, list]) => (
        <div key={d} className="flex flex-col gap-2">
          <h3 className="px-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
            {formatRuDate(d)}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {list.map((p) => (
              <div
                key={p.id}
                className="relative aspect-square overflow-hidden rounded-xl bg-card-elevated"
              >
                <img
                  src={fileUrl(p.file.id)}
                  alt={angleLabel(p.angle)}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[9px] font-bold uppercase tracking-[0.04em] text-white">
                  {angleLabel(p.angle)}
                </span>
                <div className="absolute right-1.5 top-1.5">
                  <HoldToDelete
                    onDelete={() => remove.mutate(p.id)}
                    label="Удерживайте, чтобы удалить фото"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
