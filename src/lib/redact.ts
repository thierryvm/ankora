// Shallow redaction of PII keys for Edge Runtime (doesn't have pino.redact).
const PII_KEYS = [
  'email',
  'password',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
];

export function redactShallow(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (PII_KEYS.includes(key) || PII_KEYS.some((piiKey) => key.startsWith(`${piiKey}:`))) {
      result[key] = '[Redacted]';
    } else {
      result[key] = value;
    }
  }
  return result;
}
