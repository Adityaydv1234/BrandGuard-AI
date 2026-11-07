export function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function normHex(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function lum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 2.x contrast ratio. */
export function contrastRatio(a: string, b: string): number | null {
  const A = parseHex(a),
    B = parseHex(b);
  if (!A || !B) return null;
  const [l1, l2] = [lum(A), lum(B)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Perceptual-ish distance (redmean approximation). 0 = identical. */
export function colorDistance(a: string, b: string): number {
  const A = parseHex(a),
    B = parseHex(b);
  if (!A || !B) return Infinity;
  const rm = (A[0] + B[0]) / 2;
  const dr = A[0] - B[0],
    dg = A[1] - B[1],
    db = A[2] - B[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export interface PaletteColor {
  name: string;
  hex: string;
}

export function nearestPalette(hex: string, palette: PaletteColor[]): { color: PaletteColor; distance: number } | null {
  let best: { color: PaletteColor; distance: number } | null = null;
  for (const p of palette) {
    const d = colorDistance(hex, p.hex);
    if (!best || d < best.distance) best = { color: p, distance: d };
  }
  return best;
}
