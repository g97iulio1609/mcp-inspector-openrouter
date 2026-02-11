/**
 * debug-logger.ts — Centralized debug logging with file export.
 * Logs are collected in memory and can be downloaded as timestamped files.
 * Each session gets a unique ID based on date+time.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

const SESSION_ID = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logs: LogEntry[] = [];
const MAX_LOGS = 5000;

function now(): string {
  return new Date().toISOString();
}

function addEntry(level: LogLevel, category: string, message: string, data?: unknown): void {
  const entry: LogEntry = { timestamp: now(), level, category, message, data };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);

  // Also mirror to console for live debugging
  const prefix = `[${level}][${category}]`;
  const consoleData = data !== undefined ? [prefix, message, data] : [prefix, message];
  switch (level) {
    case 'ERROR': console.error(...consoleData); break;
    case 'WARN': console.warn(...consoleData); break;
    case 'DEBUG': console.debug(...consoleData); break;
    default: console.log(...consoleData);
  }
}

export const logger = {
  debug: (cat: string, msg: string, data?: unknown) => addEntry('DEBUG', cat, msg, data),
  info:  (cat: string, msg: string, data?: unknown) => addEntry('INFO', cat, msg, data),
  warn:  (cat: string, msg: string, data?: unknown) => addEntry('WARN', cat, msg, data),
  error: (cat: string, msg: string, data?: unknown) => addEntry('ERROR', cat, msg, data),

  /** Get all logs as formatted text */
  getText(): string {
    const header = `=== MCP Inspector Debug Log ===\nSession: ${SESSION_ID}\nEntries: ${logs.length}\n${'='.repeat(50)}\n\n`;
    return header + logs.map(e => {
      const dataStr = e.data !== undefined ? `\n  DATA: ${JSON.stringify(e.data, null, 2)}` : '';
      return `[${e.timestamp}] ${e.level.padEnd(5)} | ${e.category.padEnd(20)} | ${e.message}${dataStr}`;
    }).join('\n');
  },

  /** Download logs as a timestamped file */
  download(): void {
    const text = logger.getText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const filename = `mcp-debug-${SESSION_ID}.log`;

    // Use chrome.downloads if available, otherwise fallback to <a> click
    if (chrome?.downloads?.download) {
      chrome.downloads.download({ url, filename, saveAs: false });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    logger.info('Logger', `Downloaded ${logs.length} entries as ${filename}`);
  },

  /** Get raw log entries */
  getLogs(): readonly LogEntry[] {
    return logs;
  },

  /** Get session ID */
  getSessionId(): string {
    return SESSION_ID;
  },

  /** Clear all logs */
  clear(): void {
    logs.length = 0;
  },
};
