import { env } from "../config/env.js";
import { GEMMA_SYSTEM_PROMPT } from "./prompts.js";
import { agentOutputSchema, type AgentAdapter, type AgentOutput } from "./types.js";
import { runAgentCall } from "./runAgentCall.js";
import type { TaskContract } from "../contract/taskContract.js";

export const gemmaAdapter: AgentAdapter = {
  name: "gemma",
  async run(task: TaskContract): Promise<AgentOutput> {
    return runAgentCall({
      model: env.MODEL_GEMMA,
      system: GEMMA_SYSTEM_PROMPT,
      task,
      outputSchema: agentOutputSchema,
    });
  },
};
