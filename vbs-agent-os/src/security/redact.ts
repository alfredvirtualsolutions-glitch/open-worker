/**
 * PRD §7 Secret Handling: "API keys, access tokens and credentials must
 * never be placed in prompts, task logs, reports or client-visible outputs."
 *
 * This module is the last line of defense: every value written to a log,
 * a task_event, or a report response passes through redact() first.
 */

const SECRET_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9-_]{10,}/g, // Anthropic/OpenAI-style keys
  /Bearer\s+[a-zA-Z0-9._-]{10,}/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["']?[^\s"']{6,}/gi,
];

export function redactString(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

/**
 * Deep-redacts strings that look like secrets. Guards against circular
 * references (e.g. accidentally passing a Node socket/request object) with a
 * visited-set and a depth cap, so a malformed call degrades gracefully
 * instead of crashing the process with a stack overflow.
 */
export function redactDeep<T>(value: T, seen: WeakSet<object> = new WeakSet(), depth = 0): T {
  if (depth > 25) return value; // defensive depth cap
  if (typeof value === "string") {
    return redactString(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactDeep(v, seen, depth + 1)) as unknown as T;
  }
  if (value instanceof Date) {
    return value; // Date has no own enumerable props — must not fall into the generic object branch
  }
  if (value && typeof value === "object") {
    if (seen.has(value as object)) return value; // break cycles
    seen.add(value as object);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactDeep(v, seen, depth + 1);
    }
    return out as unknown as T;
  }
  return value;
}

/** Known environment variable names that must never be interpolated into agent-facing text. */
export const FORBIDDEN_ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "HERMES_ADMIN_TOKEN",
] as const;

export function assertNoRawEnvLeak(text: string): void {
  for (const key of FORBIDDEN_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length > 6 && text.includes(value)) {
      throw new Error(`Blocked: output contains raw value of ${key} (PRD §7 violation).`);
    }
  }
}
