import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Paperclip, FileText, ImageIcon, X } from 'lucide-react';
import type { MedicalRecordResponse } from '@trener/shared';
import { ScreenHeader } from '../components/ScreenHeader';
import { HoldToDelete } from '../components/HoldToDelete';
import { ApiError } from '../api/client';
import {
  fileUrl,
  useMedicalRecords,
  useCreateMedicalRecord,
  useDeleteMedicalRecord,
} from '../api/medical';

/** Дата записи (YYYY-MM-DD) в человекочитаемом ru-формате. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Сегодня в формате YYYY-MM-DD (локальная зона). */
function todayIso(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

/** Раздел «Медкарта»: хронологический список заметок и файлов клиента. */
export function ClientMedicalPage() {
  const { id = '' } = useParams<{ id: string }>();
  const records = useMedicalRecords(id);

  return (
    <div className="flex min-h-full flex-col">
      <ScreenHeader title="Медкарта" back={`/clients/${id}`} />

      <div className="flex flex-1 flex-col gap-3 px-2 pb-8 pt-1">
        {records.isPending && <p className="py-6 text-sm text-ink-muted">Загрузка…</p>}

        {records.isError && (
          <p className="py-6 text-sm text-ink-muted" role="alert">
            Не удалось загрузить медкарту.
          </p>
        )}

        {records.isSuccess && records.data.length === 0 && (
          <p className="py-6 text-sm text-ink-muted">
            Пока пусто. Добавьте заметку или прикрепите файл.
          </p>
        )}

        {records.isSuccess && records.data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {records.data.map((record) => (
              <RecordCard key={record.id} clientId={id} record={record} />
            ))}
          </ul>
        )}

        <AddRecordForm clientId={id} />
      </div>
    </div>
  );
}

function RecordCard({ clientId, record }: { clientId: string; record: MedicalRecordResponse }) {
  const remove = useDeleteMedicalRecord(clientId);
  const file = record.file;
  const url = file ? fileUrl(file.id) : null;
  const image = file !== null && isImageMime(file.mime);

  return (
    <li className="tile-shadow flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
          {formatDate(record.date)}
        </span>
        <HoldToDelete onDelete={() => remove.mutate(record.id)} />
      </div>

      <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{record.note}</p>

      {file && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl bg-card-elevated p-3 active:scale-[0.98]"
        >
          {image ? (
            <img
              src={url}
              alt={file.originalName ?? 'Изображение'}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-chip">
              <FileText size={22} strokeWidth={1.8} className="text-accent-text" />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-semibold text-ink">
              {file.originalName ?? 'Файл'}
            </span>
            <span className="text-[12px] text-ink-muted">Открыть</span>
          </span>
        </a>
      )}
    </li>
  );
}

function AddRecordForm({ clientId }: { clientId: string }) {
  const create = useCreateMedicalRecord(clientId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());
  const [file, setFile] = useState<File | null>(null);

  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && !create.isPending;

  function reset() {
    setNote('');
    setDate(todayIso());
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleSubmit() {
    if (!canSubmit) return;
    create.mutate({ date, note: trimmed, file }, { onSuccess: reset });
  }

  const errorMessage =
    create.error instanceof ApiError
      ? create.error.message
      : create.isError
        ? 'Не удалось сохранить запись.'
        : null;

  return (
    <div className="tile-shadow flex flex-col gap-3 rounded-2xl p-4">
      <h2 className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.06em] text-ink-mutedxl">
        Новая запись
      </h2>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Например: жалобы на колено, рекомендована мягкая нагрузка…"
        className="w-full resize-none rounded-xl bg-card-elevated p-3 text-[14px] text-ink placeholder:text-ink-mutedxl focus:outline-none"
      />

      <div className="flex items-center gap-3">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl bg-card-elevated px-3 py-2 text-[14px] text-ink focus:outline-none"
        />
      </div>

      {file ? (
        <div className="flex items-center gap-3 rounded-xl bg-card-elevated p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-chip">
            {file.type.startsWith('image/') ? (
              <ImageIcon size={18} strokeWidth={1.8} className="text-accent-text" />
            ) : (
              <FileText size={18} strokeWidth={1.8} className="text-accent-text" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{file.name}</span>
          <button
            type="button"
            onClick={() => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            aria-label="Убрать файл"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chip text-ink-muted active:bg-card"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-3.5 text-sm font-medium text-ink-muted"
        >
          <Paperclip size={16} strokeWidth={1.8} />
          Добавить файл
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {errorMessage && (
        <p className="text-[13px] text-danger" role="alert">
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full rounded-2xl bg-accent py-3 text-sm font-semibold text-accent-on tile-shadow-primary disabled:opacity-50"
      >
        {create.isPending ? 'Сохранение…' : 'Добавить заметку'}
      </button>
    </div>
  );
}
