import { HealthCheckResult, HealthStatus } from '../models/types';

const STATUS_ICON: Record<HealthStatus, string> = {
  ok: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
};

const STATUS_CLASS: Record<HealthStatus, string> = {
  ok: 'ok',
  warning: 'warn',
  error: 'err',
  info: 'info',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderHealthPanel(result: HealthCheckResult): string {
  const scoreColor = result.score >= 80 ? '#4CAF50' : result.score >= 60 ? '#FF9800' : '#f44336';
  const checks = result.checks
    .map(check => {
      const statusClass = STATUS_CLASS[check.status];
      return `<div class="ci ${statusClass}"><span>${STATUS_ICON[check.status]}</span><span class=cn>${escapeHtml(check.name)}</span><span class=cm>${escapeHtml(check.message)}</span></div>`;
    })
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:-apple-system,sans-serif;padding:20px;background:#1e1e1e;color:#d4d4d4}
.score{font-size:48px;text-align:center;padding:20px}
.sv{font-size:64px;font-weight:bold}
.checks{max-width:600px;margin:0 auto}
.ci{padding:12px;margin:8px 0;border-radius:6px;display:flex;align-items:center;gap:12px}
.ok{background:#1b3a1b;border-left:4px solid #4CAF50}
.warn{background:#3a2e1b;border-left:4px solid #FF9800}
.err{background:#3a1b1b;border-left:4px solid #f44336}
.info{background:#1b2a3a;border-left:4px solid #2196F3}
.cn{font-weight:bold;min-width:120px}
.cm{color:#aaa}
</style></head><body>
<div class=score><div class=sv style=color:${scoreColor}>${result.score}</div><div>/ 100</div><div style=font-size:14px;color:#888;margin-top:8px>Health Score</div></div>
<div class=checks>${checks}</div>
</body></html>`;
}
