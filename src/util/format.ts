const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

const SIZE_FACTORS: Record<string, number> = {
  B: 1,
  K: 1024,
  M: 1024 ** 2,
  G: 1024 ** 3,
  T: 1024 ** 4,
};

/**
 * Parse a numeric amount + unit pair (e.g. `"780.4"`, `"MB"` or `"5.2"`, `"K"`)
 * into bytes. Unknown units fall back to bytes.
 */
export function parseByteAmount(value: string, unit: string): number {
  const factor = SIZE_FACTORS[(unit || 'B').toUpperCase()[0]] || 1;
  const amount = parseFloat(value);
  return Number.isFinite(amount) ? amount * factor : 0;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), SIZE_UNITS.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + SIZE_UNITS[i];
}

/** "1:05:33" / "05:33" for seconds; returns '?' when the input is not valid. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '?';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
