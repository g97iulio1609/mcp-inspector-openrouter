/**
 * bg-logger.ts — Lightweight logger for background/content contexts.
 * Posts to log-server on localhost:3005 (fire-and-forget).
 * Falls back to console.debug with [WebMCP] prefix.
 */

type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: Level, cat: string, msg: string, data?: unknown): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    category: `[${(self as unknown as { constructor?: { name?: string } }).constructor?.name ?? 'SW'}] ${cat}`,
    message: msg,
    data,
  };
  // Console mirror with WebMCP prefix
  const prefix = `[WebMCP][${level}][${cat}]`;
  const args = data !== undefined ? [prefix, msg, data] : [prefix, msg];
  if (level === 'ERROR') console.error(...args);
  else if (level === 'WARN') console.warn(...args);
  else console.debug(...args);

  // Fire-and-forget POST to log server
  void fetch('http://localhost:3005/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {/* log server not running */});
}

export const bgLogger = {
  debug: (cat: string, msg: string, data?: unknown) => log('DEBUG', cat, msg, data),
  info:  (cat: string, msg: string, data?: unknown) => log('INFO', cat, msg, data),
  warn:  (cat: string, msg: string, data?: unknown) => log('WARN', cat, msg, data),
  error: (cat: string, msg: string, data?: unknown) => log('ERROR', cat, msg, data),
};
