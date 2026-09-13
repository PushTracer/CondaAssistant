const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), SIZE_UNITS.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + SIZE_UNITS[i];
}
