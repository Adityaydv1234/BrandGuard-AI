'use client';

export interface Pair {
  label: string;
  fg: string;
  bg: string;
  large?: boolean;
}

const valid = (h: string) => /^#?[0-9a-f]{6}$/i.test(h.trim());
const fix = (h: string) => (h.startsWith('#') ? h : `#${h}`).toUpperCase();

export function ColorSwatches({ pairs }: { pairs: Pair[] }) {
  if (!pairs.length) return null;
  return (
    <ul className="flex flex-wrap gap-3">
      {pairs.map((p, i) => (
        <li key={i} className="flex items-center gap-2 rounded-md border border-rule bg-white px-2 py-1.5 text-xs">
          <span
            className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded px-1.5 font-semibold"
            style={{ color: p.fg, background: p.bg, boxShadow: 'inset 0 0 0 1px rgba(23,34,46,.12)' }}
            aria-hidden
          >
            Aa
          </span>
          <span>
            <span className="font-medium text-ink">{p.label}</span>
            <span className="block text-graphite">
              {p.fg} on {p.bg}
              {p.large ? ', large text' : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function ColorPairs({ pairs, onChange }: { pairs: Pair[]; onChange: (p: Pair[]) => void }) {
  const set = (i: number, patch: Partial<Pair>) => onChange(pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-3">
      {pairs.map((p, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-rule bg-white p-3 sm:grid-cols-[1.3fr_1fr_1fr_auto_auto] sm:items-end">
          <div>
            <label className="label text-xs" htmlFor={`cl-${i}`}>
              Where it appears
            </label>
            <input id={`cl-${i}`} className="field" value={p.label} onChange={(e) => set(i, { label: e.target.value })} />
          </div>
          {(['fg', 'bg'] as const).map((k) => (
            <div key={k}>
              <label className="label text-xs" htmlFor={`c${k}-${i}`}>
                {k === 'fg' ? 'Text colour' : 'Background'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`${k === 'fg' ? 'Text' : 'Background'} colour picker`}
                  value={valid(p[k]) ? fix(p[k]) : '#000000'}
                  onChange={(e) => set(i, { [k]: e.target.value.toUpperCase() } as Partial<Pair>)}
                  className="h-9 w-9 cursor-pointer rounded border border-rule bg-white"
                />
                <input
                  id={`c${k}-${i}`}
                  className={`field font-mono ${valid(p[k]) ? '' : 'border-mark-high'}`}
                  value={p[k]}
                  onChange={(e) => set(i, { [k]: e.target.value } as Partial<Pair>)}
                />
              </div>
            </div>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!p.large} onChange={(e) => set(i, { large: e.target.checked })} />
            Large text
          </label>
          <button type="button" className="btn-link text-mark-high" onClick={() => onChange(pairs.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button type="button" className="btn-ghost" onClick={() => onChange([...pairs, { label: 'Headline', fg: '#1A1A1A', bg: '#FFFFFF', large: false }])}>
        Add colour pair
      </button>
    </div>
  );
}
