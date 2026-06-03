import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import type {
  CreateExpenseRequest,
  CreateIncomeRequest,
  ExpenseResponse,
  IncomeResponse,
} from '@trener/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
import { TagInput } from '../components/TagInput';
import { useClients } from '../api/clients';
import { clientPackagesQueryKey, deleteClientPackage } from '../api/packages';

/** Удаление проданного пакета (строки `pkg:`) прямо из бухгалтерии. */
function useDeletePackageEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ clientId, pid }: { clientId: string; pid: string }) =>
      deleteClientPackage(clientId, pid),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ['accounting'] });
      void qc.invalidateQueries({ queryKey: clientPackagesQueryKey(vars.clientId) });
    },
  });
}
import {
  useAccountingSummary,
  useCreateExpense,
  useCreateIncome,
  useDeleteExpense,
  useDeleteIncome,
  useExpenses,
  useIncomes,
} from '../api/accounting';

/** Карта clientId → «Имя Фамилия» для подписи источника дохода/расхода. */
function useClientNameMap(): Map<string, string> {
  const clients = useClients();
  return useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients.data ?? []) {
      m.set(c.id, `${c.firstName} ${c.lastName}`.trim());
    }
    return m;
  }, [clients.data]);
}

/** Единая модель строки операции (доход/расход) для детальной плитки. */
interface Entry {
  id: string;
  date: string;
  clientName: string | null;
  typeLabel: string;
  title: string | null;
  subtitle: string | null;
  note: string | null;
  tags: string[];
  amount: number;
  positive: boolean;
  onDelete?: (() => void) | undefined;
}

type Range = 'month' | 'quarter' | 'year' | 'custom';
type Tab = 'summary' | 'income' | 'expenses';

const INCOME_CATEGORIES = ['Тренировка', 'Консультация', 'Фарма', 'Прочее'];
const EXPENSE_CATEGORIES = ['Аренда', 'Инвентарь', 'Обучение', 'Фарма', 'Прочее'];

const KICKER =
  'font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.12em] text-ink-mutedxl';

export function AccountingPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [range, setRange] = useState<Range>('month');
  const [customFrom, setCustomFrom] = useState(`${today.slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(today);
  const [tab, setTab] = useState<Tab>('summary');

  const period =
    range === 'custom' ? { from: customFrom, to: customTo } : computePeriod(month, range);

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Финансы" back="/" />

      <div className="flex flex-col gap-2 px-4 pt-1">
        <RangePresets value={range} onChange={setRange} />
        {range === 'custom' ? (
          <CustomDateRange
            from={customFrom}
            to={customTo}
            onChangeFrom={setCustomFrom}
            onChangeTo={setCustomTo}
          />
        ) : (
          <PeriodSwitcher
            month={month}
            range={range}
            onShift={(dir) => setMonth(shiftPeriod(month, range, dir))}
            onChangeMonth={setMonth}
          />
        )}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-chip p-1">
          <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>
            Сводка
          </TabButton>
          <TabButton active={tab === 'income'} onClick={() => setTab('income')}>
            Доходы
          </TabButton>
          <TabButton active={tab === 'expenses'} onClick={() => setTab('expenses')}>
            Расходы
          </TabButton>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-10 pt-3">
        {tab === 'summary' && <SummaryTab from={period.from} to={period.to} />}
        {tab === 'income' && <IncomeTab from={period.from} to={period.to} />}
        {tab === 'expenses' && <ExpensesTab from={period.from} to={period.to} />}
      </div>
    </div>
  );
}

// ─── Пресеты диапазона и переключатель периода ────────────────────────────────

function RangePresets({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const opts: { v: Range; label: string }[] = [
    { v: 'month', label: 'Месяц' },
    { v: 'quarter', label: 'Квартал' },
    { v: 'year', label: 'Год' },
    { v: 'custom', label: 'Период' },
  ];
  return (
    <div className="inline-flex self-start rounded-full bg-chip p-0.5">
      {opts.map((o) => {
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              active ? 'bg-accent text-accent-on' : 'text-ink-muted'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PeriodSwitcher({
  month,
  range,
  onShift,
  onChangeMonth,
}: {
  month: string;
  range: Range;
  onShift: (d: -1 | 1) => void;
  onChangeMonth: (m: string) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return null;
  const q = Math.floor((m - 1) / 3) + 1;

  const setMonthNum = (nm: number) => onChangeMonth(`${String(y)}-${pad2(nm)}`);
  const setYearNum = (ny: number) => onChangeMonth(`${String(ny)}-${pad2(m)}`);
  const setQuarter = (nq: number) => onChangeMonth(`${String(y)}-${pad2((nq - 1) * 3 + 1)}`);

  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        onClick={() => onShift(-1)}
        aria-label="Предыдущий период"
        className="flex w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-ink-muted transition-transform active:scale-90"
      >
        <ChevronLeft size={16} />
      </button>
      <div className="flex min-w-0 flex-1 items-stretch gap-1.5">
        {range === 'month' && (
          <>
            <SpinCell value={m} min={1} max={12} pad onChange={setMonthNum} />
            <SpinCell value={y} min={2000} max={2100} wide onChange={setYearNum} />
          </>
        )}
        {range === 'quarter' && (
          <>
            <SpinCell value={q} min={1} max={4} onChange={setQuarter} />
            <SpinCell value={y} min={2000} max={2100} wide onChange={setYearNum} />
          </>
        )}
        {range === 'year' && <SpinCell value={y} min={2000} max={2100} onChange={setYearNum} />}
      </div>
      <button
        type="button"
        onClick={() => onShift(1)}
        aria-label="Следующий период"
        className="flex w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-card text-ink-muted transition-transform active:scale-90"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function CustomDateRange({
  from,
  to,
  onChangeFrom,
  onChangeTo,
}: {
  from: string;
  to: string;
  onChangeFrom: (v: string) => void;
  onChangeTo: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1">
        <span className={KICKER}>С</span>
        <input
          type="date"
          value={from}
          onChange={(e) => onChangeFrom(e.target.value)}
          className="rounded-xl border border-line bg-card px-3 py-2.5 text-[14px] text-ink outline-none [color-scheme:dark] focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={KICKER}>По</span>
        <input
          type="date"
          value={to}
          onChange={(e) => onChangeTo(e.target.value)}
          className="rounded-xl border border-line bg-card px-3 py-2.5 text-[14px] text-ink outline-none [color-scheme:dark] focus:border-accent"
        />
      </label>
    </div>
  );
}

/** Числовая ячейка с ручным вводом и стрелками ↑↓ (день/месяц/год/квартал). */
function SpinCell({
  value,
  min,
  max,
  pad,
  wide,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  pad?: boolean;
  wide?: boolean;
  onChange: (n: number) => void;
}) {
  const fmt = (n: number) => (pad ? pad2(n) : String(n));
  const [text, setText] = useState(() => fmt(value));
  useEffect(() => {
    setText(pad ? pad2(value) : String(value));
  }, [value, pad]);

  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n)) {
      setText(fmt(value));
      return;
    }
    onChange(Math.max(min, Math.min(max, n)));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      maxLength={String(max).length}
      onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
      onBlur={() => commit(text)}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(Math.min(max, value + 1));
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(Math.max(min, value - 1));
        }
      }}
      aria-label={`Значение от ${String(min)} до ${String(max)}`}
      className={`min-w-0 rounded-xl border border-line bg-card px-1 py-2.5 text-center text-[17px] font-bold tabular-nums text-ink outline-none focus:border-accent ${
        wide ? 'flex-[1.6]' : 'flex-1'
      }`}
    />
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
      className={`rounded-xl py-2 text-[13px] font-semibold transition-colors ${
        active ? 'bg-card text-ink' : 'text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function FilterChip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        active ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
      }`}
    >
      <span>{children}</span>
      <span className={`text-[10px] tabular-nums ${active ? 'opacity-70' : 'text-ink-muted'}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Сводка ───────────────────────────────────────────────────────────────────

function SummaryTab({ from, to }: { from: string; to: string }) {
  const summary = useAccountingSummary(from, to);

  if (summary.isPending) {
    return <p className="pt-6 text-center text-[13px] text-ink-muted">Загрузка…</p>;
  }
  if (summary.isError || !summary.data) {
    return (
      <p className="pt-6 text-center text-[13px] text-ink-muted" role="alert">
        Не удалось загрузить сводку.
      </p>
    );
  }

  const { totalIncome, totalExpense, balance } = summary.data;
  const positive = balance >= 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1 rounded-2xl bg-card p-4">
        <span className={KICKER}>Прибыль за период</span>
        <span
          className="text-[40px] font-bold leading-none tabular-nums tracking-[-0.02em]"
          style={{ color: positive ? 'var(--color-accent)' : 'var(--color-coral)' }}
        >
          {positive ? '' : '−'}
          {formatMoney(Math.abs(balance))}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-3.5">
          <span className={KICKER}>Доходы</span>
          <span
            className="text-[22px] font-bold leading-none tabular-nums"
            style={{ color: 'var(--color-accent)' }}
          >
            +{formatMoney(totalIncome)}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-2xl bg-card p-3.5">
          <span className={KICKER}>Расходы</span>
          <span className="text-[22px] font-bold leading-none tabular-nums text-ink">
            −{formatMoney(totalExpense)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Доходы ───────────────────────────────────────────────────────────────────

function IncomeTab({ from, to }: { from: string; to: string }) {
  const incomes = useIncomes();
  const remove = useDeleteIncome();
  const removePkg = useDeletePackageEntry();
  const names = useClientNameMap();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    return (incomes.data ?? [])
      .filter((i: IncomeResponse) => i.date >= from && i.date <= to)
      .map((i): Entry => {
        const isPkg = i.id.startsWith('pkg:');
        return {
          id: i.id,
          date: i.date,
          clientName: i.clientId ? (names.get(i.clientId) ?? null) : null,
          typeLabel: i.category,
          title: i.title,
          subtitle: i.subtitle,
          note: i.note,
          tags: i.tags,
          amount: i.amount,
          positive: true,
          onDelete:
            isPkg && i.clientId
              ? () => removePkg.mutate({ clientId: i.clientId as string, pid: i.id.slice(4) })
              : isPkg
                ? undefined
                : () => remove.mutate(i.id),
        };
      });
  }, [incomes.data, from, to, names, remove, removePkg]);

  return (
    <EntriesView
      entries={entries}
      filter={filter}
      onFilter={setFilter}
      sign="+"
      totalColor="var(--color-accent)"
      emptyText="Нет доходов за период"
      addLabel="Добавить доход"
      adding={adding}
      onAddToggle={setAdding}
      form={
        <EntryForm kind="income" categories={INCOME_CATEGORIES} onClose={() => setAdding(false)} />
      }
    />
  );
}

// ─── Расходы ──────────────────────────────────────────────────────────────────

function ExpensesTab({ from, to }: { from: string; to: string }) {
  const expenses = useExpenses();
  const remove = useDeleteExpense();
  const names = useClientNameMap();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  const entries = useMemo<Entry[]>(() => {
    return (expenses.data ?? [])
      .filter((e: ExpenseResponse) => e.date >= from && e.date <= to)
      .map((e) => ({
        id: e.id,
        date: e.date,
        clientName: e.clientId ? (names.get(e.clientId) ?? null) : null,
        typeLabel: e.category,
        title: null,
        subtitle: null,
        note: e.note,
        tags: e.tags,
        amount: e.amount,
        positive: false,
        onDelete: () => remove.mutate(e.id),
      }));
  }, [expenses.data, from, to, names, remove]);

  return (
    <EntriesView
      entries={entries}
      filter={filter}
      onFilter={setFilter}
      sign="−"
      totalColor="var(--color-ink)"
      emptyText="Нет расходов за период"
      addLabel="Добавить расход"
      adding={adding}
      onAddToggle={setAdding}
      form={
        <EntryForm
          kind="expense"
          categories={EXPENSE_CATEGORIES}
          onClose={() => setAdding(false)}
        />
      }
    />
  );
}

// ─── Общий список операций: фильтр, итог, группировка по датам ────────────────

/** Фильтр-булет: либо категория (typeLabel), либо тег с префиксом «#». */
function matchesFilter(e: Entry, filter: string | null): boolean {
  if (!filter) return true;
  if (filter.startsWith('#')) return e.tags.includes(filter.slice(1));
  return e.typeLabel === filter;
}

/** Поиск: пусто → всё; иначе совпадение по тегу, типу (категории) или названию. */
function matchesTagSearch(e: Entry, query: string): boolean {
  const q = query.trim().replace(/^#+/, '').toLowerCase();
  if (q === '') return true;
  if (e.tags.some((t) => t.toLowerCase().includes(q))) return true;
  if (e.typeLabel.toLowerCase().includes(q)) return true;
  return e.title ? e.title.toLowerCase().includes(q) : false;
}

function EntriesView({
  entries,
  filter,
  onFilter,
  sign,
  totalColor,
  emptyText,
  addLabel,
  adding,
  onAddToggle,
  form,
}: {
  entries: Entry[];
  filter: string | null;
  onFilter: (f: string | null) => void;
  sign: '+' | '−';
  totalColor: string;
  emptyText: string;
  addLabel: string;
  adding: boolean;
  onAddToggle: (v: boolean) => void;
  form: React.ReactNode;
}) {
  const [tagQuery, setTagQuery] = useState('');

  const countByCat = countBy(entries.map((e) => e.typeLabel));
  const cats = Object.keys(countByCat).sort();
  // Все теги периода со счётчиком — для подсказок быстрого выбора.
  const countByTag = countBy(entries.flatMap((e) => e.tags));
  const allTags = Object.keys(countByTag).sort();

  const shown = entries.filter((e) => matchesFilter(e, filter) && matchesTagSearch(e, tagQuery));
  const total = shown.reduce((s, e) => s + e.amount, 0);

  // Группировка по дате (даты уже по убыванию из API).
  const groups: { date: string; items: Entry[] }[] = [];
  for (const e of shown) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Поиск по тегам */}
      <div className="flex items-center gap-2 rounded-xl border border-line bg-chip px-3 py-2">
        <Search size={15} className="shrink-0 text-ink-mutedxl" />
        <input
          value={tagQuery}
          onChange={(e) => setTagQuery(e.target.value)}
          placeholder="Поиск по тегу или типу"
          className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-mutedxl"
        />
        {tagQuery !== '' && (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => setTagQuery('')}
            className="shrink-0 text-ink-muted active:text-ink"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Подсказки тегов (при пустом поиске) */}
      {tagQuery === '' && allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onFilter(filter === `#${t}` ? null : `#${t}`)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                filter === `#${t}` ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
              }`}
            >
              #{t}
              <span
                className={`text-[10px] tabular-nums ${filter === `#${t}` ? 'opacity-70' : 'text-ink-mutedxl'}`}
              >
                {countByTag[t] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Быстрый выбор категории-булеты */}
      {cats.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            active={filter === null}
            count={entries.length}
            onClick={() => onFilter(null)}
          >
            Все
          </FilterChip>
          {cats.map((c) => (
            <FilterChip
              key={c}
              active={filter === c}
              count={countByCat[c] ?? 0}
              onClick={() => onFilter(filter === c ? null : c)}
            >
              {c}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-2xl bg-card p-4">
        <span className={KICKER}>{filter ? `${filter} за период` : 'Всего за период'}</span>
        <span
          className="text-[28px] font-bold leading-none tabular-nums"
          style={{ color: totalColor }}
        >
          {sign}
          {formatMoney(total)}
        </span>
      </div>

      {adding ? form : <AddButton onClick={() => onAddToggle(true)}>{addLabel}</AddButton>}

      {shown.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-muted">
          {filter || tagQuery ? 'Нет операций по фильтру' : emptyText}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.date} className="flex flex-col gap-1.5">
            <h3 className="px-1 pt-1 font-[family-name:var(--font-mono)] text-[11px] font-bold uppercase tracking-[0.08em] text-ink-mutedxl">
              {formatDateFull(g.date)}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((e) => (
                <EntryRow key={e.id} entry={e} onTag={(t) => onFilter(`#${t}`)} />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-[13px] font-semibold text-ink-muted active:bg-card"
    >
      <Plus size={15} /> {children}
    </button>
  );
}

/** Детальная плитка: источник (клиент) · тип · название · пояснение/заметка · теги · сумма. */
function EntryRow({ entry, onTag }: { entry: Entry; onTag: (tag: string) => void }) {
  const { clientName, typeLabel, title, subtitle, note, tags, amount, positive, onDelete } = entry;
  const primary = clientName ?? title ?? typeLabel;
  const showType = primary !== typeLabel; // не дублируем, если тип уже в заголовке
  const metaLine = [subtitle, note].filter(Boolean).join(' · ');

  return (
    <li className="flex items-start gap-3 rounded-2xl bg-card px-3.5 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {showType && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-ink-mutedxl">
            {typeLabel}
          </span>
        )}
        <span className="truncate text-[15px] font-semibold text-ink">{primary}</span>
        {clientName && title && <span className="truncate text-[13px] text-ink">{title}</span>}
        {metaLine && <span className="truncate text-[12px] text-ink-muted">{metaLine}</span>}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTag(t)}
                className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-ink-muted active:bg-card-elevated"
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className="font-[family-name:var(--font-mono)] text-[14px] font-bold tabular-nums"
          style={{ color: positive ? 'var(--color-accent)' : 'var(--color-ink)' }}
        >
          {positive ? '+' : '−'}
          {formatMoney(amount)}
        </span>
        {onDelete && (
          <HoldToDelete icon="trash" onDelete={onDelete} label="Удерживайте, чтобы удалить" />
        )}
      </div>
    </li>
  );
}

function EntryForm({
  kind,
  categories,
  onClose,
}: {
  kind: 'income' | 'expense';
  categories: string[];
  onClose: () => void;
}) {
  const createIncome = useCreateIncome();
  const createExpense = useCreateExpense();
  const mutation = kind === 'income' ? createIncome : createExpense;
  const [category, setCategory] = useState(categories[0] ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Укажите сумму больше нуля.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Укажите дату.');
      return;
    }
    const trimmedNote = note.trim();
    if (kind === 'income') {
      const body: CreateIncomeRequest = {
        category,
        amount: amt,
        date,
        note: trimmedNote === '' ? null : trimmedNote,
        tags,
      };
      createIncome.mutate(body, { onSuccess: onClose });
    } else {
      const body: CreateExpenseRequest = {
        category,
        amount: amt,
        date,
        note: trimmedNote === '' ? null : trimmedNote,
        tags,
      };
      createExpense.mutate(body, { onSuccess: onClose });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold text-ink">
          {kind === 'income' ? 'Новый доход' : 'Новый расход'}
        </h4>
        <button type="button" onClick={onClose} className="text-[12px] text-ink-muted">
          Отмена
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={KICKER}>Категория</span>
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => {
            const active = c === category;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  active ? 'bg-accent text-accent-on' : 'bg-chip text-ink'
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={KICKER}>Сумма, ₽</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={KICKER}>Дата</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-line bg-chip px-3 py-2.5 text-[15px] text-ink outline-none [color-scheme:dark] focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={KICKER}>Заметка</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="необязательно"
          className="rounded-xl border border-line bg-chip px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={KICKER}>Хэштеги</span>
        <TagInput tags={tags} onChange={setTags} placeholder="напр. скидка, новичок" />
        <p className="px-1 text-[12px] text-ink-muted">
          Можно несколько: введите тег и нажмите ввод.
        </p>
      </div>

      {error && (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={mutation.isPending}
        className="rounded-xl bg-accent py-3 text-[14px] font-bold text-accent-on disabled:opacity-50"
      >
        {mutation.isPending ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function computePeriod(month: string, range: Range): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return { from: `${month}-01`, to: `${month}-28` };
  if (range === 'year') return { from: `${String(y)}-01-01`, to: `${String(y)}-12-31` };
  if (range === 'quarter') {
    const startM = Math.floor((m - 1) / 3) * 3 + 1;
    const endM = startM + 2;
    return {
      from: `${String(y)}-${pad2(startM)}-01`,
      to: `${String(y)}-${pad2(endM)}-${pad2(daysInMonth(y, endM))}`,
    };
  }
  return {
    from: `${String(y)}-${pad2(m)}-01`,
    to: `${String(y)}-${pad2(m)}-${pad2(daysInMonth(y, m))}`,
  };
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  const d = new Date(y, m - 1 + delta, 1);
  return `${String(d.getFullYear())}-${pad2(d.getMonth() + 1)}`;
}

function shiftPeriod(month: string, range: Range, dir: -1 | 1): string {
  if (range === 'year') return shiftMonth(month, dir * 12);
  if (range === 'quarter') return shiftMonth(month, dir * 3);
  return shiftMonth(month, dir);
}

function countBy(items: string[]): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, key) => {
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

function formatMoney(value: number): string {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

const RU_MONTHS_FULL = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** Заголовок-дата группы: «3 июня» (с годом, если не текущий). */
function formatDateFull(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const base = `${String(d)} ${RU_MONTHS_FULL[m - 1] ?? ''}`;
  const curYear = new Date().getFullYear();
  return y === curYear ? base : `${base} ${String(y)}`;
}
