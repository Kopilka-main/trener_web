import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type {
  CreateExpenseRequest,
  CreateIncomeRequest,
  CreatePackageRequest,
  ExpenseResponse,
  IncomeResponse,
} from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
import { TagInput } from '../components/TagInput';
import { useClient } from '../api/clients';
import { useClientWorkouts } from '../api/client-workouts';
import { useClientPackages, useCreatePackage, useDeletePackage } from '../api/packages';
import {
  useCreateExpense,
  useCreateIncome,
  useDeleteExpense,
  useDeleteIncome,
  useExpenses,
  useIncomes,
} from '../api/accounting';

const RUB = '₽';
const NBSP = ' ';

/** Денежная сумма с узким неразрывным пробелом-разделителем тысяч: 1 500 ₽. */
function formatMoney(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '−' : ''}${grouped}${NBSP}${RUB}`;
}

/** Денежная сумма со знаком: +1 500 ₽ / −1 500 ₽. */
function formatSigned(amount: number, sign: '+' | '−'): string {
  return `${sign}${formatMoney(Math.abs(amount))}`;
}

function formatDate(value: string): string {
  // Принимаем как YYYY-MM-DD, так и ISO; берём только дату.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const todayStr = (): string => new Date().toISOString().slice(0, 10);

export function ClientPaymentsPage() {
  const { id = '' } = useParams<{ id: string }>();

  const client = useClient(id);
  const workouts = useClientWorkouts(id);
  const packages = useClientPackages(id);
  const expenses = useExpenses();
  const incomes = useIncomes();
  const createPackage = useCreatePackage(id);
  const deletePackage = useDeletePackage(id);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const createIncome = useCreateIncome();
  const deleteIncome = useDeleteIncome();

  const [incomeFormOpen, setIncomeFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);

  const clientName = useMemo(() => {
    const c = client.data;
    if (!c) return '';
    return `${c.firstName} ${c.lastName}`.trim();
  }, [client.data]);

  // Доходы по клиенту — по убыванию даты.
  const incomeList = useMemo<IncomeResponse[]>(() => {
    return (incomes.data ?? [])
      .filter((i) => i.clientId === id)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [incomes.data, id]);

  // Расходы по клиенту — по убыванию даты.
  const expenseList = useMemo<ExpenseResponse[]>(() => {
    return (expenses.data ?? [])
      .filter((e) => e.clientId === id)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [expenses.data, id]);

  // Баланс: проведено (завершённые тренировки) против оплачено (активные пакеты).
  const balance = useMemo(() => {
    const done = (workouts.data ?? []).filter((w) => w.status === 'completed').length;
    const paid = (packages.data ?? [])
      .filter((p) => p.status === 'active')
      .reduce((acc, p) => acc + p.lessonsPaid, 0);
    return { done, remaining: paid - done };
  }, [workouts.data, packages.data]);

  const balanceLoading = workouts.isPending || packages.isPending;

  const title = clientName ? `Оплата · ${clientName}` : 'Оплата';

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title={title} back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-5 px-5 pb-10 pt-2">
        {/* Баланс тренировок */}
        <BalanceCard done={balance.done} remaining={balance.remaining} loading={balanceLoading} />

        {/* Доход */}
        <section className="flex flex-col gap-2">
          {incomeList.length > 0 && (
            <ul className="flex flex-col gap-2">
              {incomeList.map((i) => (
                <OperationRow
                  key={i.id}
                  category={i.category}
                  title={i.title}
                  subtitle={i.subtitle}
                  amount={i.amount}
                  date={i.date}
                  note={i.note}
                  tags={i.tags}
                  sign="+"
                  onDelete={() =>
                    i.id.startsWith('pkg:')
                      ? deletePackage.mutate(i.id.slice(4))
                      : deleteIncome.mutate(i.id)
                  }
                />
              ))}
            </ul>
          )}

          {incomeFormOpen ? (
            <IncomeForm
              clientId={id}
              onClose={() => setIncomeFormOpen(false)}
              createPackage={(body) =>
                createPackage.mutate(body, { onSuccess: () => setIncomeFormOpen(false) })
              }
              createIncome={(body) =>
                createIncome.mutate(body, { onSuccess: () => setIncomeFormOpen(false) })
              }
              packagePending={createPackage.isPending}
              incomePending={createIncome.isPending}
            />
          ) : (
            <DashedButton label="Добавить доход" onClick={() => setIncomeFormOpen(true)} />
          )}
        </section>

        {/* Расход */}
        <section className="flex flex-col gap-2">
          {expenseList.length > 0 && (
            <ul className="flex flex-col gap-2">
              {expenseList.map((e) => (
                <OperationRow
                  key={e.id}
                  category={e.category}
                  amount={e.amount}
                  date={e.date}
                  note={e.note}
                  tags={e.tags}
                  sign="−"
                  onDelete={() => deleteExpense.mutate(e.id)}
                />
              ))}
            </ul>
          )}

          {expenseFormOpen ? (
            <ExpenseForm
              clientId={id}
              onClose={() => setExpenseFormOpen(false)}
              onSubmit={(body) =>
                createExpense.mutate(body, { onSuccess: () => setExpenseFormOpen(false) })
              }
              pending={createExpense.isPending}
            />
          ) : (
            <DashedButton label="Добавить расход" onClick={() => setExpenseFormOpen(true)} />
          )}
        </section>
      </div>
    </div>
  );
}

// ─── Баланс ───────────────────────────────────────────────────────────────────

function BalanceCard({
  done,
  remaining,
  loading,
}: {
  done: number;
  remaining: number;
  loading: boolean;
}) {
  // remaining > 0 → +N лаймом «оплачено сверх»; < 0 → −N красным «в долг»; 0 → ровно.
  const label = remaining === 0 ? '0' : remaining > 0 ? `+${String(remaining)}` : String(remaining);
  const hint =
    remaining === 0
      ? 'ровно по оплате'
      : remaining > 0
        ? 'тренировок оплачено сверх'
        : 'тренировок в долг';
  const toneClass = remaining > 0 ? 'text-accent' : remaining < 0 ? 'text-danger' : 'text-ink';

  return (
    <section className="rounded-2xl bg-card p-4">
      <div className="grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="font-[family-name:var(--font-mono)] text-[28px] font-bold leading-none tabular-nums text-ink">
            {loading ? '—' : String(done)}
          </div>
          <div className="mt-1.5 text-[11px] text-ink-muted">проведено</div>
        </div>
        <div>
          <div
            className={`font-[family-name:var(--font-mono)] text-[28px] font-bold leading-none tabular-nums ${toneClass}`}
          >
            {loading ? '—' : label}
          </div>
          <div className="mt-1.5 text-[11px] text-ink-muted">{loading ? 'баланс' : hint}</div>
        </div>
      </div>
    </section>
  );
}

function OperationRow({
  category,
  title = null,
  subtitle = null,
  amount,
  date,
  note,
  tags = [],
  sign,
  onDelete,
}: {
  category: string;
  title?: string | null;
  subtitle?: string | null;
  amount: number;
  date: string;
  note: string | null;
  tags?: string[];
  sign: '+' | '−';
  onDelete: () => void;
}) {
  // primary — название (тип тренировки) либо тип операции; если оба есть, тип уходит в kicker.
  const primary = title ?? category;
  const showType = primary !== category;
  const meta = [formatDate(date), subtitle, note].filter(Boolean) as string[];
  return (
    <li className="flex items-start gap-3 rounded-2xl bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {showType && (
          <span className="font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em] text-ink-mutedxl">
            {category}
          </span>
        )}
        <span className="truncate text-[15px] font-medium text-ink">{primary}</span>
        <span className="text-[12px] text-ink-muted">{meta.join(' · ')}</span>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-chip px-2 py-0.5 text-[11px] font-semibold text-ink-muted"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span
          className={`font-[family-name:var(--font-mono)] text-[15px] font-bold tabular-nums ${
            sign === '+' ? 'text-accent' : 'text-ink'
          }`}
        >
          {formatSigned(amount, sign)}
        </span>
        <HoldToDelete onDelete={onDelete} label="Удерживайте, чтобы удалить операцию" />
      </div>
    </li>
  );
}

// ─── Общие элементы форм ──────────────────────────────────────────────────────

const inputClass =
  'rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent';

function DashedButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3 text-[13px] font-medium text-ink-muted active:scale-[0.99]"
    >
      <Plus size={15} strokeWidth={2} /> {label}
    </button>
  );
}

function FormCard({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-[14px] font-semibold text-ink">{title}</h4>
        <button type="button" onClick={onClose} className="text-[12px] text-ink-muted">
          Отмена
        </button>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-muted">{label}</span>
      {children}
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </label>
  );
}

function KindChip({
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
      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
        active ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
      }`}
    >
      {children}
    </button>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-full bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:scale-[0.99] disabled:opacity-50"
    >
      {pending ? '…' : label}
    </button>
  );
}

// ─── Форма дохода (по типам) ──────────────────────────────────────────────────

type IncomeKind = 'package' | 'online' | 'inventory' | 'pharma' | 'other';

const SIMPLE_INCOME_CATEGORY: Record<Exclude<IncomeKind, 'package'>, string> = {
  online: 'Онлайн сопровождение',
  inventory: 'Инвентарь',
  pharma: 'Фарма',
  other: 'Прочее',
};

function IncomeForm({
  clientId,
  onClose,
  createPackage,
  createIncome,
  packagePending,
  incomePending,
}: {
  clientId: string;
  onClose: () => void;
  createPackage: (body: CreatePackageRequest) => void;
  createIncome: (body: CreateIncomeRequest) => void;
  packagePending: boolean;
  incomePending: boolean;
}) {
  const [kind, setKind] = useState<IncomeKind>('package');

  return (
    <FormCard title="Новый доход" onClose={onClose}>
      <div className="flex flex-wrap gap-1.5">
        <KindChip active={kind === 'package'} onClick={() => setKind('package')}>
          Пакет тренировок
        </KindChip>
        <KindChip active={kind === 'online'} onClick={() => setKind('online')}>
          Онлайн сопровождение
        </KindChip>
        <KindChip active={kind === 'inventory'} onClick={() => setKind('inventory')}>
          Инвентарь
        </KindChip>
        <KindChip active={kind === 'pharma'} onClick={() => setKind('pharma')}>
          Фарма
        </KindChip>
        <KindChip active={kind === 'other'} onClick={() => setKind('other')}>
          Прочее
        </KindChip>
      </div>

      {kind === 'package' ? (
        <PackageFields onSubmit={createPackage} pending={packagePending} />
      ) : (
        <SimpleIncomeFields
          key={kind}
          category={SIMPLE_INCOME_CATEGORY[kind]}
          clientId={clientId}
          onSubmit={createIncome}
          pending={incomePending}
        />
      )}
    </FormCard>
  );
}

function PackageFields({
  onSubmit,
  pending,
}: {
  onSubmit: (body: CreatePackageRequest) => void;
  pending: boolean;
}) {
  const [lessons, setLessons] = useState('20');
  const [price, setPrice] = useState('2000');
  const [startsAt, setStartsAt] = useState(todayStr());
  const [workoutType, setWorkoutType] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const lessonsNum = Number(lessons);
  const priceNum = Number(price);
  const total =
    Number.isFinite(lessonsNum) && Number.isFinite(priceNum)
      ? Math.round(lessonsNum) * priceNum
      : 0;

  const errors = {
    lessons:
      lessons.trim() === '' || !Number.isInteger(lessonsNum) || lessonsNum <= 0
        ? 'Целое число больше 0'
        : '',
    price: price.trim() === '' || !(priceNum > 0) ? 'Цена больше 0' : '',
    startsAt: startsAt.trim() === '' ? 'Укажите дату' : '',
  };
  const hasErrors = errors.lessons !== '' || errors.price !== '' || errors.startsAt !== '';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const body: CreatePackageRequest = {
      lessonsPaid: Math.round(lessonsNum),
      pricePerLesson: priceNum,
      totalPaid: total,
      startsAt,
    };
    const t = workoutType.trim();
    if (t !== '') body.workoutType = t;
    const n = note.trim();
    if (n !== '') body.note = n;
    if (tags.length > 0) body.tags = tags;
    onSubmit(body);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Тренировок" error={showErrors ? errors.lessons : ''}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={lessons}
            onChange={(ev) => setLessons(ev.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="₽ за тренировку" error={showErrors ? errors.price : ''}>
          <input
            type="number"
            inputMode="decimal"
            min={1}
            value={price}
            onChange={(ev) => setPrice(ev.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Дата начала" error={showErrors ? errors.startsAt : ''}>
        <input
          type="date"
          value={startsAt}
          onChange={(ev) => setStartsAt(ev.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Тип (необязательно)">
        <input
          type="text"
          value={workoutType}
          onChange={(ev) => setWorkoutType(ev.target.value)}
          placeholder="Силовая, Йога…"
          className={inputClass}
        />
      </Field>

      <Field label="Заметка (необязательно)">
        <input
          type="text"
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Хэштеги">
        <TagInput tags={tags} onChange={setTags} placeholder="напр. скидка, сертификат" />
      </Field>

      <div className="rounded-xl bg-chip px-3 py-2 text-center text-[12px] text-ink-muted">
        Итого пакет:{' '}
        <span className="font-[family-name:var(--font-mono)] font-bold tabular-nums text-ink">
          {formatMoney(total)}
        </span>
      </div>

      <SubmitButton pending={pending} label="Сохранить пакет" />
    </form>
  );
}

function SimpleIncomeFields({
  category,
  clientId,
  onSubmit,
  pending,
}: {
  category: string;
  clientId: string;
  onSubmit: (body: CreateIncomeRequest) => void;
  pending: boolean;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const amountNum = Number(amount);

  const errors = {
    amount: amount.trim() === '' || !(amountNum > 0) ? 'Сумма больше 0' : '',
    date: date.trim() === '' ? 'Укажите дату' : '',
  };
  const hasErrors = errors.amount !== '' || errors.date !== '';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const body: CreateIncomeRequest = {
      category,
      amount: amountNum,
      date,
      clientId,
    };
    const n = note.trim();
    if (n !== '') body.note = n;
    if (tags.length > 0) body.tags = tags;
    onSubmit(body);
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label={`${category} — сумма, ₽`} error={showErrors ? errors.amount : ''}>
        <input
          type="number"
          inputMode="decimal"
          min={1}
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Дата" error={showErrors ? errors.date : ''}>
        <input
          type="date"
          value={date}
          onChange={(ev) => setDate(ev.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Заметка (необязательно)">
        <input
          type="text"
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Хэштеги">
        <TagInput tags={tags} onChange={setTags} placeholder="напр. скидка" />
      </Field>

      <SubmitButton pending={pending} label="Добавить доход" />
    </form>
  );
}

// ─── Форма расхода ────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = ['Аренда', 'Инвентарь', 'Обучение', 'Фарма', 'Прочее'] as const;

function ExpenseForm({
  clientId,
  onClose,
  onSubmit,
  pending,
}: {
  clientId: string;
  onClose: () => void;
  onSubmit: (body: CreateExpenseRequest) => void;
  pending: boolean;
}) {
  const [category, setCategory] = useState<string>('Прочее');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const amountNum = Number(amount);

  const errors = {
    amount: amount.trim() === '' || !(amountNum > 0) ? 'Сумма больше 0' : '',
    date: date.trim() === '' ? 'Укажите дату' : '',
  };
  const hasErrors = errors.amount !== '' || errors.date !== '';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const body: CreateExpenseRequest = {
      category,
      amount: amountNum,
      date,
      clientId,
    };
    const n = note.trim();
    if (n !== '') body.note = n;
    if (tags.length > 0) body.tags = tags;
    onSubmit(body);
  }

  return (
    <FormCard title="Новый расход" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Field label="Категория">
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => (
              <KindChip key={c} active={c === category} onClick={() => setCategory(c)}>
                {c}
              </KindChip>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Сумма, ₽" error={showErrors ? errors.amount : ''}>
            <input
              type="number"
              inputMode="decimal"
              min={1}
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </Field>
          <Field label="Дата" error={showErrors ? errors.date : ''}>
            <input
              type="date"
              value={date}
              onChange={(ev) => setDate(ev.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <Field label="Заметка (необязательно)">
          <input
            type="text"
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Хэштеги">
          <TagInput tags={tags} onChange={setTags} placeholder="напр. аренда, июнь" />
        </Field>

        <SubmitButton pending={pending} label="Добавить расход" />
      </form>
    </FormCard>
  );
}
