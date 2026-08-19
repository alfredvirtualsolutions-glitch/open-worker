import { env } from "../config/env.js";
import { DEEPSEEK_SYSTEM_PROMPT } from "./prompts.js";
import { agentOutputSchema, type AgentAdapter, type AgentOutput } from "./types.js";
import { runAgentCall } from "./runAgentCall.js";
import type { TaskContract } from "../contract/taskContract.js";

export const deepseekAdapter: AgentAdapter = {
  name: "deepseek",
  async run(task: TaskContract): Promise<AgentOutput> {
    return runAgentCall({
      model: env.MODEL_DEEPSEEK,
      system: DEEPSEEK_SYSTEM_PROMPT,
      task,
      outputSchema: agentOutputSchema,
    });
  },
};
