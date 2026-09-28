/**
 * Minimal structured JSON logger for CloudWatch.
 * Every log line is a single JSON object so CloudWatch Logs Insights can query it.
 */
type Level = 'INFO' | 'WARN' | 'ERROR';

export interface LogContext {
  requestId?: string;
  userId?: string;
  uploadId?: string;
  route?: string;
  [k: string]: unknown;
}

function emit(level: Level, message: string, ctx: LogContext = {}): void {
  const line = JSON.stringify({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ctx,
  });
  // eslint-disable-next-line no-console
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, ctx?: LogContext) => emit('INFO', message, ctx),
  warn: (message: string, ctx?: LogContext) => emit('WARN', message, ctx),
  error: (message: string, ctx?: LogContext) => emit('ERROR', message, ctx),
};
