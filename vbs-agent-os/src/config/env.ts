import "dotenv/config";
import { z } from "zod";

/**
 * Centralized, validated environment access. This is the ONLY module allowed
 * to read process.env directly (PRD §7: secrets must never leak into task
 * payloads, logs, or reports — funneling all reads through here makes that
 * an enforceable code-review rule, and src/security/redact.ts double-checks
 * it at runtime).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  HERMES_ADMIN_TOKEN: z.string().min(16, "HERMES_ADMIN_TOKEN must be at least 16 chars"),
  DISPATCH_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  DISPATCH_CONCURRENCY: z.coerce.number().int().positive().default(3),
  MODEL_HERMES: z.string().default("claude-sonnet-4-5"),
  MODEL_GEMMA: z.string().default("claude-sonnet-4-5"),
  MODEL_DEEPSEEK: z.string().default("claude-sonnet-4-5"),
  MODEL_PRIME: z.string().default("claude-sonnet-4-5"),
  MODEL_NOVA: z.string().default("claude-sonnet-4-5"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
