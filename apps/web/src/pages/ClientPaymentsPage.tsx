import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Package, Receipt, Trash2, Wallet, X } from 'lucide-react';
import type {
  CreateExpenseRequest,
  CreatePackageRequest,
  ExpenseResponse,
  PackageResponse,
} from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { useClientPackages, useCreatePackage, useDeletePackage } from '../api/packages';
import { useCreateExpense, useDeleteExpense, useExpenses } from '../api/accounting';

const RUB = '₽';
const NBSP = ' ';

/** Денежная сумма с пробелом-разделителем тысяч: 1 500 ₽ (узкий неразрывный пробел). */
function formatMoney(amount: number): string {
  const rounded = Math.round(amount);
  const grouped = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${rounded < 0 ? '-' : ''}${grouped}${NBSP}${RUB}`;
}

function formatDate(value: string): string {
  // Принимаем как YYYY-MM-DD, так и ISO; берём только дату.
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PACKAGE_STATUS_LABEL: Record<PackageResponse['status'], string> = {
  active: 'Активен',
  closed: 'Закрыт',
  cancelled: 'Отменён',
};

const todayStr = (): string => new Date().toISOString().slice(0, 10);

export function ClientPaymentsPage() {
  const { id = '' } = useParams<{ id: string }>();

  const packages = useClientPackages(id);
  const expenses = useExpenses();
  const createPackage = useCreatePackage(id);
  const deletePackage = useDeletePackage(id);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const [packageFormOpen, setPackageFormOpen] = useState(false);
  const [expenseFormOpen, setExpenseFormOpen] = useState(false);

  const packageList = useMemo(() => {
    const list = packages.data ?? [];
    return [...list].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  }, [packages.data]);

  // Расходы по этому клиенту (бэкенд не фильтрует по clientId — фильтруем тут).
  const clientExpenses = useMemo(() => {
    const list = (expenses.data ?? []).filter((e) => e.clientId === id);
    return list.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [expenses.data, id]);

  // Сводка: оплаченные занятия и сумма по активным пакетам.
  const summary = useMemo(() => {
    const active = (packages.data ?? []).filter((p) => p.status === 'active');
    return {
      lessonsPaid: active.reduce((acc, p) => acc + p.lessonsPaid, 0),
      totalPaid: active.reduce((acc, p) => acc + p.totalPaid, 0),
    };
  }, [packages.data]);

  function handleDeletePackage(pid: string) {
    if (!window.confirm('Удалить пакет? Действие необратимо.')) return;
    deletePackage.mutate(pid);
  }

  function handleDeleteExpense(eid: string) {
    if (!window.confirm('Удалить операцию? Действие необратимо.')) return;
    deleteExpense.mutate(eid);
  }

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Оплата" back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-2">
        {/* Сводка по активным пакетам */}
        <section className="grid grid-cols-2 gap-3">
          <SummaryCard label="Оплачено занятий" value={String(summary.lessonsPaid)} />
          <SummaryCard label="На сумму" value={formatMoney(summary.totalPaid)} />
        </section>

        {/* Пакеты */}
        <section className="flex flex-col gap-2">
          <SectionHeader title="Пакеты" />

          {packages.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}
          {packages.isError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось загрузить пакеты. Попробуйте обновить страницу.
            </p>
          )}
          {packages.isSuccess && packageList.length === 0 && (
            <EmptyHint Icon={Package} text="Пока нет пакетов. Добавьте первый." />
          )}

          <ul className="flex flex-col gap-2">
            {packageList.map((p) => (
              <PackageCard
                key={p.id}
                pkg={p}
                onDelete={() => handleDeletePackage(p.id)}
                deleting={deletePackage.isPending}
              />
            ))}
          </ul>
        </section>

        {/* Операции (расходы по клиенту) */}
        <section className="flex flex-col gap-2">
          <SectionHeader title="Операции" />

          {expenses.isPending && <p className="text-sm text-ink-muted">Загрузка…</p>}
          {expenses.isError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось загрузить операции. Попробуйте обновить страницу.
            </p>
          )}
          {expenses.isSuccess && clientExpenses.length === 0 && (
            <EmptyHint Icon={Receipt} text="Пока нет операций по клиенту." />
          )}

          <ul className="flex flex-col gap-2">
            {clientExpenses.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                onDelete={() => handleDeleteExpense(e.id)}
                deleting={deleteExpense.isPending}
              />
            ))}
          </ul>
        </section>
      </div>

      {/* Нижняя панель действий (one-handed). */}
      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-end gap-3 px-5">
        <button
          type="button"
          onClick={() => setExpenseFormOpen(true)}
          aria-label="Добавить операцию"
          className="tile-shadow pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-card-elevated text-ink active:scale-[0.95]"
        >
          <Receipt size={22} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setPackageFormOpen(true)}
          aria-label="Добавить пакет"
          className="tile-shadow-primary pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-[0.95]"
        >
          <Package size={22} strokeWidth={2} />
        </button>
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile-shadow flex flex-col gap-1 rounded-2xl p-4">
      <span className="font-[family-name:var(--font-mono)] text-[24px] font-bold tabular-nums leading-none text-ink">
        {value}
      </span>
      <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
      {title}
    </h2>
  );
}

function EmptyHint({ Icon, text }: { Icon: typeof Package; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <Icon size={26} strokeWidth={1.6} className="text-ink-muted" />
      <p className="text-sm text-ink-muted">{text}</p>
    </div>
  );
}

function PackageCard({
  pkg,
  onDelete,
  deleting,
}: {
  pkg: PackageResponse;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
      <Wallet size={20} strokeWidth={1.8} className="shrink-0 text-ink-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-mono)] text-[16px] font-bold tabular-nums text-ink">
            {pkg.lessonsPaid} зан.
          </span>
          <span className="font-[family-name:var(--font-mono)] text-[13px] tabular-nums text-ink-muted">
            {formatMoney(pkg.totalPaid)}
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
          <span className="rounded-full bg-chip px-2 py-0.5 uppercase tracking-[0.04em]">
            {PACKAGE_STATUS_LABEL[pkg.status]}
          </span>
          <span>{formatMoney(pkg.pricePerLesson)}/зан.</span>
          <span>· {formatDate(pkg.startsAt)}</span>
          {pkg.workoutType && <span>· {pkg.workoutType}</span>}
        </span>
        {pkg.note && <span className="text-[12px] text-ink-muted">{pkg.note}</span>}
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Удалить пакет"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger active:bg-card-elevated disabled:opacity-50"
      >
        <Trash2 size={18} strokeWidth={1.8} />
      </button>
    </li>
  );
}

function ExpenseRow({
  expense,
  onDelete,
  deleting,
}: {
  expense: ExpenseResponse;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">{expense.category}</span>
          <span className="shrink-0 font-[family-name:var(--font-mono)] text-[15px] font-bold tabular-nums text-ink">
            {formatMoney(expense.amount)}
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
          <span>{formatDate(expense.date)}</span>
          {expense.note && <span>· {expense.note}</span>}
        </span>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label="Удалить операцию"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-danger active:bg-card-elevated disabled:opacity-50"
      >
        <Trash2 size={18} strokeWidth={1.8} />
      </button>
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
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[16px] font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink active:bg-card-elevated"
          >
            <X size={20} strokeWidth={1.8} />
          </button>
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
    <Sheet title="Новая операция" onClose={onClose}>
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
          {pending ? '…' : 'Добавить операцию'}
        </button>
      </form>
    </Sheet>
  );
}
