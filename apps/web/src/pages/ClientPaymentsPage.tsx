import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Wallet } from 'lucide-react';
import type {
  CreateExpenseRequest,
  CreateIncomeRequest,
  CreatePackageRequest,
  PackageResponse,
} from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
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

/** Денежная сумма с пробелом-разделителем тысяч: 1 500 ₽ (узкий неразрывный пробел). */
function formatMoney(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${grouped}${NBSP}${RUB}`;
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

/** Объединённая операция (доход/расход) для общего списка. */
interface Operation {
  id: string;
  kind: 'income' | 'expense';
  category: string;
  amount: number;
  date: string;
  note: string | null;
}

const DASHED_BUTTON =
  'flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3.5 text-sm font-medium text-ink-muted active:border-accent';

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

  const [packageFormOpen, setPackageFormOpen] = useState(false);
  const [incomeFormOpen, setIncomeFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);

  const clientName = useMemo(() => {
    const c = client.data;
    if (!c) return '';
    return `${c.firstName} ${c.lastName}`.trim();
  }, [client.data]);

  const packageList = useMemo(() => {
    const list = packages.data ?? [];
    return [...list].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  }, [packages.data]);

  // Операции по клиенту: доходы + расходы в одном списке по убыванию даты.
  const operations = useMemo<Operation[]>(() => {
    const inc: Operation[] = (incomes.data ?? [])
      .filter((i) => i.clientId === id)
      .map((i) => ({
        id: i.id,
        kind: 'income',
        category: i.category,
        amount: i.amount,
        date: i.date,
        note: i.note,
      }));
    const exp: Operation[] = (expenses.data ?? [])
      .filter((e) => e.clientId === id)
      .map((e) => ({
        id: e.id,
        kind: 'expense',
        category: e.category,
        amount: e.amount,
        date: e.date,
        note: e.note,
      }));
    return [...inc, ...exp].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [incomes.data, expenses.data, id]);

  // Баланс: проведено (завершённые тренировки) против оплачено (активные пакеты).
  const balance = useMemo(() => {
    const done = (workouts.data ?? []).filter((w) => w.status === 'completed').length;
    const paid = (packages.data ?? [])
      .filter((p) => p.status === 'active')
      .reduce((acc, p) => acc + p.lessonsPaid, 0);
    return { done, paid, remaining: paid - done };
  }, [workouts.data, packages.data]);

  const balanceLoading = workouts.isPending || packages.isPending;

  const title = clientName ? `Оплата · ${clientName}` : 'Оплата';

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title={title} back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-4 px-5 pb-10 pt-2">
        <SectionHeader title="Тренировки и оплата" />

        {/* Баланс: проведено / оплачено сверх */}
        <BalanceCard done={balance.done} remaining={balance.remaining} loading={balanceLoading} />

        {/* Пакеты */}
        {packages.isError ? (
          <p className="text-sm text-ink-muted" role="alert">
            Не удалось загрузить пакеты. Попробуйте обновить страницу.
          </p>
        ) : packages.isSuccess && packageList.length === 0 ? (
          <p className="text-sm text-ink-muted">Пока нет пакетов</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {packageList.map((p) => (
              <PackageCard key={p.id} pkg={p} onDelete={() => deletePackage.mutate(p.id)} />
            ))}
          </ul>
        )}

        {/* Операции (доходы + расходы по клиенту) */}
        {operations.length > 0 && (
          <ul className="flex flex-col gap-2">
            {operations.map((op) => (
              <OperationRow
                key={`${op.kind}-${op.id}`}
                op={op}
                onDelete={() =>
                  op.kind === 'income' ? deleteIncome.mutate(op.id) : deleteExpense.mutate(op.id)
                }
              />
            ))}
          </ul>
        )}

        {/* Пунктирные кнопки добавления */}
        <div className="flex flex-col gap-2 pt-1">
          <button type="button" onClick={() => setPackageFormOpen(true)} className={DASHED_BUTTON}>
            <Plus size={16} strokeWidth={2} />
            Добавить пакет
          </button>
          <button type="button" onClick={() => setIncomeFormOpen(true)} className={DASHED_BUTTON}>
            <Plus size={16} strokeWidth={2} />
            Добавить доход
          </button>
          <button type="button" onClick={() => setExpenseFormOpen(true)} className={DASHED_BUTTON}>
            <Plus size={16} strokeWidth={2} />
            Добавить расход
          </button>
        </div>
      </div>

      {packageFormOpen && (
        <PackageFormSheet
          onClose={() => setPackageFormOpen(false)}
          onSubmit={(body) =>
            createPackage.mutate(body, { onSuccess: () => setPackageFormOpen(false) })
          }
          pending={createPackage.isPending}
        />
      )}

      {incomeFormOpen && (
        <IncomeFormSheet
          clientId={id}
          onClose={() => setIncomeFormOpen(false)}
          onSubmit={(body) =>
            createIncome.mutate(body, { onSuccess: () => setIncomeFormOpen(false) })
          }
          pending={createIncome.isPending}
        />
      )}

      {expenseFormOpen && (
        <ExpenseFormSheet
          clientId={id}
          onClose={() => setExpenseFormOpen(false)}
          onSubmit={(body) =>
            createExpense.mutate(body, { onSuccess: () => setExpenseFormOpen(false) })
          }
          pending={createExpense.isPending}
        />
      )}
    </div>
  );
}

function BalanceCard({
  done,
  remaining,
  loading,
}: {
  done: number;
  remaining: number;
  loading: boolean;
}) {
  // remaining > 0 → +N лаймом; = 0 → 0 нейтрально; < 0 → -N нейтрально.
  const remainingLabel = remaining > 0 ? `+${String(remaining)}` : String(remaining);
  return (
    <section className="flex items-stretch gap-4 rounded-2xl bg-card-elevated p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-[family-name:var(--font-mono)] text-[40px] font-bold tabular-nums leading-none text-ink">
          {loading ? '—' : String(done)}
        </span>
        <span className="text-[12px] text-ink-muted">проведено</span>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1">
        <span
          className={`font-[family-name:var(--font-mono)] text-[40px] font-bold tabular-nums leading-none ${
            remaining > 0 ? 'text-accent' : 'text-ink'
          }`}
        >
          {loading ? '—' : remainingLabel}
        </span>
        <span className="text-right text-[12px] text-ink-muted">тренировок оплачено сверх</span>
      </div>
    </section>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
      {title}
    </h2>
  );
}

function PackageCard({ pkg, onDelete }: { pkg: PackageResponse; onDelete: () => void }) {
  const meta = [`с ${formatDate(pkg.startsAt)}`];
  if (pkg.workoutType) meta.push(pkg.workoutType);
  if (pkg.note) meta.push(pkg.note);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
      <Wallet size={20} strokeWidth={1.8} className="shrink-0 text-ink-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium text-ink">
          {pkg.lessonsPaid} × {formatMoney(pkg.pricePerLesson)} = {formatMoney(pkg.totalPaid)}
        </span>
        <span className="text-[12px] text-ink-muted">{meta.join(' · ')}</span>
      </div>
      <HoldToDelete onDelete={onDelete} label="Удерживайте, чтобы удалить пакет" />
    </li>
  );
}

function OperationRow({ op, onDelete }: { op: Operation; onDelete: () => void }) {
  const isIncome = op.kind === 'income';
  const meta = [formatDate(op.date)];
  if (op.note) meta.push(op.note);
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium text-ink">{op.category}</span>
        <span className="text-[12px] text-ink-muted">{meta.join(' · ')}</span>
      </div>
      <span
        className={`shrink-0 font-[family-name:var(--font-mono)] text-[15px] font-bold tabular-nums ${
          isIncome ? 'text-accent' : 'text-ink'
        }`}
      >
        {formatSigned(op.amount, isIncome ? '+' : '−')}
      </span>
      <HoldToDelete onDelete={onDelete} label="Удерживайте, чтобы удалить операцию" />
    </li>
  );
}

const inputClass =
  'rounded-xl border border-line bg-chip px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-mutedxl focus:border-accent';

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div className="relative z-10 flex max-h-[85vh] flex-col rounded-t-3xl bg-bg pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
        </div>
        <div className="overflow-y-auto px-5 pt-1">{children}</div>
      </div>
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
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      {children}
      {error && <span className="text-[12px] text-danger">{error}</span>}
    </label>
  );
}

function PackageFormSheet({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (body: CreatePackageRequest) => void;
  pending: boolean;
}) {
  const [lessons, setLessons] = useState('');
  const [price, setPrice] = useState('');
  const [startsAt, setStartsAt] = useState(todayStr());
  const [workoutType, setWorkoutType] = useState('');
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const lessonsNum = Number(lessons);
  const priceNum = Number(price);

  const errors = {
    lessons:
      lessons.trim() === '' || !Number.isInteger(lessonsNum) || lessonsNum <= 0
        ? 'Целое число больше 0'
        : '',
    price: price.trim() === '' || !(priceNum > 0) ? 'Сумма больше 0' : '',
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
      lessonsPaid: lessonsNum,
      pricePerLesson: priceNum,
      totalPaid: lessonsNum * priceNum,
      startsAt,
    };
    const wt = workoutType.trim();
    if (wt !== '') body.workoutType = wt;
    const n = note.trim();
    if (n !== '') body.note = n;
    onSubmit(body);
  }

  const total = errors.lessons === '' && errors.price === '' ? lessonsNum * priceNum : 0;

  return (
    <Sheet title="Новый пакет" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Занятий" error={showErrors ? errors.lessons : ''}>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={lessons}
              onChange={(ev) => setLessons(ev.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Цена за занятие, ₽" error={showErrors ? errors.price : ''}>
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

        {total > 0 && (
          <p className="font-[family-name:var(--font-mono)] text-[13px] text-ink-muted">
            Итого: <span className="font-bold tabular-nums text-ink">{formatMoney(total)}</span>
          </p>
        )}

        <Field label="Дата начала" error={showErrors ? errors.startsAt : ''}>
          <input
            type="date"
            value={startsAt}
            onChange={(ev) => setStartsAt(ev.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Тип тренировок (необязательно)">
          <input
            type="text"
            value={workoutType}
            onChange={(ev) => setWorkoutType(ev.target.value)}
            placeholder="Например, персональные"
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

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-full bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? '…' : 'Добавить пакет'}
        </button>
      </form>
    </Sheet>
  );
}

function IncomeFormSheet({
  clientId,
  onClose,
  onSubmit,
  pending,
}: {
  clientId: string;
  onClose: () => void;
  onSubmit: (body: CreateIncomeRequest) => void;
  pending: boolean;
}) {
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const amountNum = Number(amount);

  const errors = {
    category: category.trim() === '' ? 'Укажите категорию' : '',
    amount: amount.trim() === '' || !(amountNum > 0) ? 'Сумма больше 0' : '',
    date: date.trim() === '' ? 'Укажите дату' : '',
  };
  const hasErrors = errors.category !== '' || errors.amount !== '' || errors.date !== '';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const body: CreateIncomeRequest = {
      category: category.trim(),
      amount: amountNum,
      date,
      clientId,
    };
    const n = note.trim();
    if (n !== '') body.note = n;
    onSubmit(body);
  }

  return (
    <Sheet title="Новый доход" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 pb-4">
        <Field label="Категория" error={showErrors ? errors.category : ''}>
          <input
            type="text"
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
            placeholder="Например, оплата пакета"
            className={inputClass}
          />
        </Field>

        <Field label="Сумма, ₽" error={showErrors ? errors.amount : ''}>
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

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-full bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? '…' : 'Добавить доход'}
        </button>
      </form>
    </Sheet>
  );
}

function ExpenseFormSheet({
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
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const amountNum = Number(amount);

  const errors = {
    category: category.trim() === '' ? 'Укажите категорию' : '',
    amount: amount.trim() === '' || !(amountNum > 0) ? 'Сумма больше 0' : '',
    date: date.trim() === '' ? 'Укажите дату' : '',
  };
  const hasErrors = errors.category !== '' || errors.amount !== '' || errors.date !== '';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      return;
    }
    const body: CreateExpenseRequest = {
      category: category.trim(),
      amount: amountNum,
      date,
      clientId,
    };
    const n = note.trim();
    if (n !== '') body.note = n;
    onSubmit(body);
  }

  return (
    <Sheet title="Новый расход" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 pb-4">
        <Field label="Категория" error={showErrors ? errors.category : ''}>
          <input
            type="text"
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
            placeholder="Например, аренда зала"
            className={inputClass}
          />
        </Field>

        <Field label="Сумма, ₽" error={showErrors ? errors.amount : ''}>
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

        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-full bg-accent px-4 py-3 text-[15px] font-semibold text-accent-on active:scale-[0.99] disabled:opacity-50"
        >
          {pending ? '…' : 'Добавить расход'}
        </button>
      </form>
    </Sheet>
  );
}
