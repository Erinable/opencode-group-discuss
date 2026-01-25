export function scrubString(value: string): string {
  let out = value;

  // Authorization headers / bearer tokens
  out = out.replace(/Authorization\s*:\s*Bearer\s+\S+/gi, "Authorization: Bearer [REDACTED]");
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]");

  // JWTs
  out = out.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]");

  // OpenAI-like keys
  out = out.replace(/sk-[A-Za-z0-9]{20,}/g, "sk-[REDACTED]");

  // Querystring-ish secrets
  out = out.replace(/\b(api[_-]?key|token|password)=([^&\s]+)/gi, (_m, k) => `${String(k)}=[REDACTED]`);

  return out;
}

export function scrubAny(value: any, seen: WeakSet<object> = new WeakSet()): any {
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value);
  if (typeof value !== "object") return value;

  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((v) => scrubAny(v, seen));
  }

  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = scrubAny(v, seen);
  }
  return out;
}

export function truncateString(value: string, maxChars: number): string {
  if (!maxChars || maxChars <= 0) return value;
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
