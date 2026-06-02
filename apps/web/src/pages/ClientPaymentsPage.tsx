import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Minus, Package, Plus, Receipt, Wallet } from 'lucide-react';
import type {
  CreateExpenseRequest,
  CreateIncomeRequest,
  CreatePackageRequest,
  PackageResponse,
} from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
import {
  useClientPackages,
  useCreatePackage,
  useDeletePackage,
  useUpdatePackage,
} from '../api/packages';
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

const PACKAGE_STATUS_LABEL: Record<PackageResponse['status'], string> = {
  active: 'Активен',
  closed: 'Закрыт',
  cancelled: 'Отменён',
};

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

export function ClientPaymentsPage() {
  const { id = '' } = useParams<{ id: string }>();

  const packages = useClientPackages(id);
  const expenses = useExpenses();
  const incomes = useIncomes();
  const createPackage = useCreatePackage(id);
  const updatePackage = useUpdatePackage(id);
  const deletePackage = useDeletePackage(id);
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();
  const createIncome = useCreateIncome();
  const deleteIncome = useDeleteIncome();

  const [packageFormOpen, setPackageFormOpen] = useState(false);
  const [operationFormOpen, setOperationFormOpen] = useState(false);

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

  // Баланс: оплачено и проведено занятий по активным пакетам.
  const balance = useMemo(() => {
    const active = (packages.data ?? []).filter((p) => p.status === 'active');
    const paid = active.reduce((acc, p) => acc + p.lessonsPaid, 0);
    const used = active.reduce((acc, p) => acc + p.lessonsUsed, 0);
    return { paid, used, remaining: paid - used };
  }, [packages.data]);

  function handleAdjustUsed(pkg: PackageResponse, delta: number) {
    const next = Math.max(0, Math.min(pkg.lessonsPaid, pkg.lessonsUsed + delta));
    if (next === pkg.lessonsUsed) return;
    updatePackage.mutate({ pid: pkg.id, input: { lessonsUsed: next } });
  }

  const operationsLoading = incomes.isPending || expenses.isPending;
  const operationsError = incomes.isError || expenses.isError;
  const operationsReady = incomes.isSuccess && expenses.isSuccess;

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Оплата" back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-6 px-5 pb-28 pt-2">
        {/* Баланс по активным пакетам */}
        <BalanceCard
          used={balance.used}
          paid={balance.paid}
          remaining={balance.remaining}
          loading={packages.isPending}
        />

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
                onDelete={() => deletePackage.mutate(p.id)}
                onAdjust={(delta) => handleAdjustUsed(p, delta)}
                adjusting={updatePackage.isPending}
              />
            ))}
          </ul>
        </section>

        {/* Операции (доходы + расходы по клиенту) */}
        <section className="flex flex-col gap-2">
          <SectionHeader title="Операции" />

          {operationsLoading && <p className="text-sm text-ink-muted">Загрузка…</p>}
          {operationsError && (
            <p className="text-sm text-ink-muted" role="alert">
              Не удалось загрузить операции. Попробуйте обновить страницу.
            </p>
          )}
          {operationsReady && operations.length === 0 && (
            <EmptyHint Icon={Receipt} text="Пока нет операций по клиенту." />
          )}

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
        </section>
      </div>

      {/* Нижняя панель действий (one-handed). */}
      <div className="pointer-events-none sticky bottom-4 z-10 mt-auto flex justify-end gap-3 px-5">
        <button
          type="button"
          onClick={() => setOperationFormOpen(true)}
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

      {operationFormOpen && (
        <OperationFormSheet
          clientId={id}
          onClose={() => setOperationFormOpen(false)}
          onSubmitIncome={(body) =>
            createIncome.mutate(body, { onSuccess: () => setOperationFormOpen(false) })
          }
          onSubmitExpense={(body) =>
            createExpense.mutate(body, { onSuccess: () => setOperationFormOpen(false) })
          }
          pending={createIncome.isPending || createExpense.isPending}
        />
      )}
    </div>
  );
}

function BalanceCard({
  used,
  paid,
  remaining,
  loading,
}: {
  used: number;
  paid: number;
  remaining: number;
  loading: boolean;
}) {
  const remainingLabel = remaining > 0 ? `+${String(remaining)}` : String(remaining);
  return (
    <section className="tile-shadow flex items-stretch gap-4 rounded-2xl p-5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-[family-name:var(--font-mono)] text-[40px] font-bold tabular-nums leading-none text-ink">
          {loading ? '—' : `${String(used)}/${String(paid)}`}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-ink-muted">
          занятия проведено / оплачено
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-1 border-l border-line pl-4">
        <span
          className={`font-[family-name:var(--font-mono)] text-[32px] font-bold tabular-nums leading-none ${
            remaining > 0 ? 'text-accent' : 'text-ink'
          }`}
        >
          {loading ? '—' : remainingLabel}
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.04em] text-ink-muted">
          остаток
        </span>
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
  onAdjust,
  adjusting,
}: {
  pkg: PackageResponse;
  onDelete: () => void;
  onAdjust: (delta: number) => void;
  adjusting: boolean;
}) {
  const canReturn = pkg.lessonsUsed > 0;
  const canUse = pkg.lessonsUsed < pkg.lessonsPaid;
  return (
    <li className="flex flex-col gap-3 rounded-2xl bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Wallet size={20} strokeWidth={1.8} className="shrink-0 text-ink-muted" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline gap-2">
            <span className="font-[family-name:var(--font-mono)] text-[16px] font-bold tabular-nums text-ink">
              {pkg.lessonsUsed} / {pkg.lessonsPaid}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[12px] uppercase tracking-[0.04em] text-ink-muted">
              зан.
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
        <HoldToDelete onDelete={onDelete} label="Удерживайте, чтобы удалить пакет" />
      </div>

      {/* Списание занятий из пакета */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onAdjust(-1)}
          disabled={!canReturn || adjusting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-chip px-3 py-2 text-[13px] font-medium text-ink active:scale-[0.98] disabled:opacity-40"
        >
          <Minus size={16} strokeWidth={2} />
          Вернуть
        </button>
        <button
          type="button"
          onClick={() => onAdjust(1)}
          disabled={!canUse || adjusting}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-chip px-3 py-2 text-[13px] font-medium text-ink active:scale-[0.98] disabled:opacity-40"
        >
          <Plus size={16} strokeWidth={2} />
          Списать
        </button>
      </div>
    </li>
  );
}

function OperationRow({ op, onDelete }: { op: Operation; onDelete: () => void }) {
  const isIncome = op.kind === 'income';
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold text-ink">{op.category}</span>
          <span
            className={`shrink-0 font-[family-name:var(--font-mono)] text-[15px] font-bold tabular-nums ${
              isIncome ? 'text-accent' : 'text-ink'
            }`}
          >
            {formatSigned(op.amount, isIncome ? '+' : '−')}
          </span>
        </div>
        <span className="flex flex-wrap items-center gap-2 font-[family-name:var(--font-mono)] text-[12px] text-ink-muted">
          <span>{isIncome ? 'Доход' : 'Расход'}</span>
          <span>· {formatDate(op.date)}</span>
          {op.note && <span>· {op.note}</span>}
        </span>
      </div>
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

function OperationFormSheet({
  clientId,
  onClose,
  onSubmitIncome,
  onSubmitExpense,
  pending,
}: {
  clientId: string;
  onClose: () => void;
  onSubmitIncome: (body: CreateIncomeRequest) => void;
  onSubmitExpense: (body: CreateExpenseRequest) => void;
  pending: boolean;
}) {
  const [kind, setKind] = useState<'income' | 'expense'>('income');
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
    const n = note.trim();
    if (kind === 'income') {
      const body: CreateIncomeRequest = {
        category: category.trim(),
        amount: amountNum,
        date,
        clientId,
      };
      if (n !== '') body.note = n;
      onSubmitIncome(body);
    } else {
      const body: CreateExpenseRequest = {
        category: category.trim(),
        amount: amountNum,
        date,
        clientId,
      };
      if (n !== '') body.note = n;
      onSubmitExpense(body);
    }
  }

  return (
    <Sheet title="Новая операция" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setKind('income')}
            className={`rounded-full px-4 py-2.5 text-[14px] font-semibold active:scale-[0.99] ${
              kind === 'income' ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
            }`}
          >
            Доход
          </button>
          <button
            type="button"
            onClick={() => setKind('expense')}
            className={`rounded-full px-4 py-2.5 text-[14px] font-semibold active:scale-[0.99] ${
              kind === 'expense' ? 'bg-accent text-accent-on' : 'bg-chip text-ink-muted'
            }`}
          >
            Расход
          </button>
        </div>

        <Field label="Категория" error={showErrors ? errors.category : ''}>
          <input
            type="text"
            value={category}
            onChange={(ev) => setCategory(ev.target.value)}
            placeholder={kind === 'income' ? 'Например, оплата пакета' : 'Например, аренда зала'}
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
