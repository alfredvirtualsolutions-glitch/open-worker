import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env.js";
import { assertNoRawEnvLeak } from "../security/redact.js";

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface CallAgentOptions {
  model: string;
  system: string;
  userPrompt: string;
  maxTokens?: number;
}

/**
 * Every agent adapter calls through here. Two invariants enforced centrally:
 *  1. The raw API key never appears in any prompt (structurally impossible —
 *     it's only read inside the SDK client, never interpolated into `system`
 *     or `userPrompt` by callers).
 *  2. The model's output is scanned for accidental credential leakage before
 *     it's returned to the caller (PRD §7).
 */
export async function callAgent(opts: CallAgentOptions): Promise<string> {
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    messages: [{ role: "user", content: opts.userPrompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  assertNoRawEnvLeak(text);
  return text;
}

/** Strip a fenced ```json ... ``` block if the model wrapped its JSON output in one. */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? text;
  return JSON.parse(candidate.trim());
}
