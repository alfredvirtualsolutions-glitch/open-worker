import { z } from "zod";
import { callAgent, extractJson } from "../llm/claude.js";
import type { TaskContract } from "../contract/taskContract.js";

export async function runAgentCall<T extends z.ZodTypeAny>(opts: {
  model: string;
  system: string;
  task: TaskContract;
  outputSchema: T;
}): Promise<z.infer<T>> {
  const userPrompt = JSON.stringify(
    {
      task_id: opts.task.task_id,
      task_type: opts.task.task_type,
      input: opts.task.input,
      expected_output: opts.task.expected_output,
      evidence: opts.task.evidence,
      result: opts.task.result,
      issues: opts.task.issues,
    },
    null,
    2
  );

  const raw = await callAgent({
    model: opts.model,
    system: opts.system,
    userPrompt: `Task contract fields you may use:\n${userPrompt}\n\nRespond now with the required JSON object only.`,
  });

  let json: unknown;
  try {
    json = extractJson(raw);
  } catch {
    throw new Error(`Agent returned non-JSON output for task ${opts.task.task_id}: ${raw.slice(0, 300)}`);
  }

  return opts.outputSchema.parse(json);
}
