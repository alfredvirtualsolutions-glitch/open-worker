import { env } from "../config/env.js";
import { PRIME_SYSTEM_PROMPT } from "./prompts.js";
import { primeOutputSchema, type AgentAdapter, type PrimeOutput } from "./types.js";
import { runAgentCall } from "./runAgentCall.js";
import type { TaskContract } from "../contract/taskContract.js";

export const primeAdapter: AgentAdapter = {
  name: "prime",
  async run(task: TaskContract): Promise<PrimeOutput> {
    return runAgentCall({
      model: env.MODEL_PRIME,
      system: PRIME_SYSTEM_PROMPT,
      task,
      outputSchema: primeOutputSchema,
    });
  },
};
