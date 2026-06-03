import { useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

/** Ввод хэштегов: чипы с удалением + поле; добавление по Enter/запятой, ведущий «#» отбрасывается. */
export function TagInput({ tags, onChange, placeholder = 'тег и Enter' }: TagInputProps) {
  const [draft, setDraft] = useState('');

  function add(raw: string) {
    const t = raw.trim().replace(/^#+/, '').trim();
    if (t === '' || tags.includes(t)) {
      setDraft('');
      return;
    }
    onChange([...tags, t]);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-chip px-2.5 py-2">
      {tags.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 rounded-full bg-card-elevated px-2.5 py-1 text-[12px] font-semibold text-ink"
        >
          #{t}
          <button
            type="button"
            aria-label={`Убрать тег ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="text-ink-muted active:text-ink"
          >
            <X size={12} strokeWidth={2.4} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="min-w-[80px] flex-1 bg-transparent py-0.5 text-[14px] text-ink outline-none placeholder:text-ink-mutedxl"
      />
    </div>
  );
}
