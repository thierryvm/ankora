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

  return {
    trace: (msg, bindings) => pinoInstance.trace(bindings, msg),
    debug: (msg, bindings) => pinoInstance.debug(bindings, msg),
    info: (msg, bindings) => pinoInstance.info(bindings, msg),
    warn: (msg, bindings) => pinoInstance.warn(bindings, msg),
    error: (msg, bindings) => pinoInstance.error(bindings, msg),
    fatal: (msg, bindings) => pinoInstance.fatal(bindings, msg),
    child: (bindings) => {
      const childInstance = pinoInstance.child(bindings);
      return {
        trace: (msg, b) => childInstance.trace(b, msg),
        debug: (msg, b) => childInstance.debug(b, msg),
        info: (msg, b) => childInstance.info(b, msg),
        warn: (msg, b) => childInstance.warn(b, msg),
        error: (msg, b) => childInstance.error(b, msg),
        fatal: (msg, b) => childInstance.fatal(b, msg),
        child: (b) => {
          const grandchildInstance = childInstance.child(b);
          return {
            trace: (msg, c) => grandchildInstance.trace(c, msg),
            debug: (msg, c) => grandchildInstance.debug(c, msg),
            info: (msg, c) => grandchildInstance.info(c, msg),
            warn: (msg, c) => grandchildInstance.warn(c, msg),
            error: (msg, c) => grandchildInstance.error(c, msg),
            fatal: (msg, c) => grandchildInstance.fatal(c, msg),
            child: (c) => {
              const ggInstance = grandchildInstance.child(c);
              return {
                trace: (msg, d) => ggInstance.trace(d, msg),
                debug: (msg, d) => ggInstance.debug(d, msg),
                info: (msg, d) => ggInstance.info(d, msg),
                warn: (msg, d) => ggInstance.warn(d, msg),
                error: (msg, d) => ggInstance.error(d, msg),
                fatal: (msg, d) => ggInstance.fatal(d, msg),
                child: (d) => createNodeLogger().child(d).child(b).child(c),
              };
            },
          };
        },
      };
    },
  };
}

function createEdgeLogger(): Logger {
  const childLoggers: Map<string, Logger> = new Map();

  const emit = (level: LogLevel, msg: string, bindings?: Record<string, unknown>) => {
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

  const childOf = (bindings: Record<string, unknown>): Logger => {
    const key = JSON.stringify(bindings);
    if (!childLoggers.has(key)) {
      const parent = {
        trace: (m: string, b?: Record<string, unknown>) => emit('trace', m, { ...bindings, ...b }),
        debug: (m: string, b?: Record<string, unknown>) => emit('debug', m, { ...bindings, ...b }),
        info: (m: string, b?: Record<string, unknown>) => emit('info', m, { ...bindings, ...b }),
        warn: (m: string, b?: Record<string, unknown>) => emit('warn', m, { ...bindings, ...b }),
        error: (m: string, b?: Record<string, unknown>) => emit('error', m, { ...bindings, ...b }),
        fatal: (m: string, b?: Record<string, unknown>) => emit('fatal', m, { ...bindings, ...b }),
        child: (b: Record<string, unknown>) => childOf({ ...bindings, ...b }),
      };
      childLoggers.set(key, parent);
    }
    return childLoggers.get(key)!;
  };

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
