// Deep redaction of PII keys for Edge Runtime (doesn't have pino.redact).
// Walks nested objects/arrays and redacts any key that matches a PII key at any depth,
// covering shapes like `headers.authorization` and `req.body.password`.
const PII_KEYS = [
  'email',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
];

function isPiiKey(key: string): boolean {
  return PII_KEYS.includes(key) || PII_KEYS.some((piiKey) => key.startsWith(`${piiKey}:`));
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (isPiiKey(key)) {
        result[key] = '[Redacted]';
      } else {
        result[key] = redactValue(nestedValue);
      }
    }
    return result;
  }

  return value;
}

export function redactShallow(obj: Record<string, unknown>): Record<string, unknown> {
  return redactValue(obj) as Record<string, unknown>;
}
