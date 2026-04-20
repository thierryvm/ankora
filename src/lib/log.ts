'use server';

import pino from 'pino';
import { env } from '@/lib/env';
import type { Logger, LogLevel } from '@/lib/log-types';
import { redactShallow } from '@/lib/redact';

const isProd = env.NODE_ENV === 'production';

function createNodeLogger(): Logger {
  const pinoInstance = pino({
    level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
    redact: {
      paths: [
        '*.email',
        '*.password',
        '*.token',
        '*.access_token',
        '*.refresh_token',
        '*.authorization',
        'headers.cookie',
        'headers.authorization',
        'req.body.password',
      ],
      censor: '[Redacted]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { app: 'ankora', env: env.NEXT_PUBLIC_APP_ENV ?? 'local' },
    transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  });

  const wrapLogger = (pinoLogger: pino.Logger): Logger => ({
    trace: (msg, bindings) => pinoLogger.trace(bindings, msg),
    debug: (msg, bindings) => pinoLogger.debug(bindings, msg),
    info: (msg, bindings) => pinoLogger.info(bindings, msg),
    warn: (msg, bindings) => pinoLogger.warn(bindings, msg),
    error: (msg, bindings) => pinoLogger.error(bindings, msg),
    fatal: (msg, bindings) => pinoLogger.fatal(bindings, msg),
    child: (bindings) => wrapLogger(pinoLogger.child(bindings)),
  });

  return wrapLogger(pinoInstance);
}

function createEdgeLogger(): Logger {
  const logLevel = (process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug')) as LogLevel;
  const levels = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };
  const minLevel = levels[logLevel];

  const emit = (level: LogLevel, msg: string, bindings?: Record<string, unknown>) => {
    if (levels[level] < minLevel) return;
    const redacted = redactShallow(bindings ?? {});
    console.log(
      JSON.stringify({
        level,
        time: new Date().toISOString(),
        msg,
        app: 'ankora',
        env: env.NEXT_PUBLIC_APP_ENV ?? 'edge',
        ...redacted,
      }),
    );
  };

  const childOf = (bindings: Record<string, unknown>): Logger => ({
    trace: (m: string, b?: Record<string, unknown>) => emit('trace', m, { ...bindings, ...b }),
    debug: (m: string, b?: Record<string, unknown>) => emit('debug', m, { ...bindings, ...b }),
    info: (m: string, b?: Record<string, unknown>) => emit('info', m, { ...bindings, ...b }),
    warn: (m: string, b?: Record<string, unknown>) => emit('warn', m, { ...bindings, ...b }),
    error: (m: string, b?: Record<string, unknown>) => emit('error', m, { ...bindings, ...b }),
    fatal: (m: string, b?: Record<string, unknown>) => emit('fatal', m, { ...bindings, ...b }),
    child: (b: Record<string, unknown>) => childOf({ ...bindings, ...b }),
  });

  return {
    trace: (m, b) => emit('trace', m, b),
    debug: (m, b) => emit('debug', m, b),
    info: (m, b) => emit('info', m, b),
    warn: (m, b) => emit('warn', m, b),
    error: (m, b) => emit('error', m, b),
    fatal: (m, b) => emit('fatal', m, b),
    child: childOf,
  };
}

export const log: Logger =
  process.env.NEXT_RUNTIME === 'edge' ||
  (typeof globalThis !== 'undefined' && 'EdgeRuntime' in globalThis)
    ? createEdgeLogger()
    : createNodeLogger();
