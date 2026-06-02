import { useEffect, useState } from 'react';
import { Crosshair, Copy, X } from 'lucide-react';

const LIME = '#d4ff3d';

type Picked = {
  rect: DOMRect;
  route: string;
  loc: string | null;
  tag: string;
  text: string;
  classes: string;
};

function pickClasses(el: Element): string {
  const raw = el.getAttribute('class');
  if (!raw) return '';
  return raw.split(/\s+/).filter(Boolean).slice(0, 4).join(' ');
}

function buildNote(p: Picked): string {
  const lines = [
    `Маршрут: ${p.route}`,
    p.loc ? `Файл: ${p.loc}` : 'Файл: (нет data-loc)',
    `Тег: <${p.tag}>`,
  ];
  if (p.text) lines.push(`Текст: «${p.text}»`);
  if (p.classes) lines.push(`Классы: ${p.classes}`);
  return lines.join('\n');
}

export function DevInspector() {
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState<DOMRect | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!active) return;
    document.body.style.cursor = 'crosshair';

    const isOurUI = (el: Element | null): boolean => !!el?.closest('[data-dev-inspector]');

    const onMove = (e: MouseEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOurUI(el)) {
        setHover(null);
        return;
      }
      setHover(el.getBoundingClientRect());
    };

    const onClick = (e: MouseEvent): void => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || isOurUI(el)) return;
      e.preventDefault();
      e.stopPropagation();
      const locEl = el.closest('[data-loc]');
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
      setPicked({
        rect: el.getBoundingClientRect(),
        route: window.location.pathname,
        loc: locEl?.getAttribute('data-loc') ?? null,
        tag: el.tagName.toLowerCase(),
        text,
        classes: pickClasses(el),
      });
      setActive(false);
      setCopied(false);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setActive(false);
        setHover(null);
      }
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [active]);

  const copy = (): void => {
    if (!picked) return;
    void navigator.clipboard.writeText(buildNote(picked)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        setCopied(false);
      },
    );
  };

  return (
    <div data-dev-inspector>
      <button
        onClick={() => {
          setActive((a) => !a);
          setPicked(null);
          setHover(null);
        }}
        title={active ? 'Отменить (Esc)' : 'Инспектор элементов'}
        style={{
          position: 'fixed',
          left: 12,
          bottom: 12,
          zIndex: 10000,
          width: 40,
          height: 40,
          borderRadius: 999,
          background: active ? '#2a2a2a' : '#161616',
          color: active ? LIME : '#fff',
          border: `1px solid ${active ? LIME : '#333'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {active ? <X size={18} /> : <Crosshair size={18} />}
      </button>

      {active && hover && (
        <div
          style={{
            position: 'fixed',
            left: hover.left,
            top: hover.top,
            width: hover.width,
            height: hover.height,
            border: `2px solid ${LIME}`,
            background: 'rgba(212,255,61,0.10)',
            pointerEvents: 'none',
            zIndex: 9999,
            borderRadius: 4,
          }}
        />
      )}

      {picked && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 64,
            zIndex: 10000,
            background: '#161616',
            color: '#fff',
            border: '1px solid #2a2a2a',
            borderRadius: 12,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            maxHeight: '40vh',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: LIME }}>&lt;{picked.tag}&gt;</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={copy}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: copied ? LIME : '#ffffff1a',
                  color: copied ? '#161616' : '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <Copy size={12} /> {copied ? 'Скопировано' : 'Копировать'}
              </button>
              <button
                onClick={() => setPicked(null)}
                style={{
                  background: '#ffffff1a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
          <div style={{ opacity: 0.85, marginBottom: 4 }}>Маршрут: {picked.route}</div>
          <div style={{ marginBottom: 4 }}>
            {picked.loc ? (
              <code style={{ background: '#ffffff14', padding: '1px 4px', borderRadius: 3 }}>
                {picked.loc}
              </code>
            ) : (
              <span style={{ opacity: 0.6 }}>нет data-loc</span>
            )}
          </div>
          {picked.text && (
            <div style={{ marginBottom: 4, opacity: 0.9, fontStyle: 'italic' }}>
              «{picked.text}»
            </div>
          )}
          {picked.classes && <div style={{ opacity: 0.6, fontSize: 11 }}>{picked.classes}</div>}
        </div>
      )}
    </div>
  );
}
