import { env } from "../config/env.js";
import { NOVA_SYSTEM_PROMPT } from "./prompts.js";
import { agentOutputSchema, type AgentAdapter, type AgentOutput } from "./types.js";
import { runAgentCall } from "./runAgentCall.js";
import type { TaskContract } from "../contract/taskContract.js";
import { RESPONSE_ANALYSIS_TASK_TYPE } from "../config/workflowPipeline.js";

export const novaAdapter: AgentAdapter = {
  name: "nova",
  async run(task: TaskContract): Promise<AgentOutput> {
    const isResponseAnalysis = task.task_type === RESPONSE_ANALYSIS_TASK_TYPE;
    if (!isResponseAnalysis && task.evidence.length === 0 && Object.keys(task.result).length === 0) {
      // FR-06 enforced structurally, not just by prompt: refuse to even call the
      // model if there is nothing approved to draft from. Doesn't apply to
      // response-analysis tasks (PRD §3 step 8) — those analyze fresh inbound
      // reply text, not draft outbound communication, so there's nothing to invent.
      return {
        result: {},
        evidence: [],
        confidence: null,
        issues: [
          {
            code: "NOVA_NO_APPROVED_CONTEXT",
            message: "Nova cannot prepare communication: task has no approved evidence or result to draft from.",
            raised_by: "nova",
            severity: "action_required",
          },
        ],
        next_action: null,
        requires_human_attention: true,
      };
    }
    return runAgentCall({
      model: env.MODEL_NOVA,
      system: NOVA_SYSTEM_PROMPT,
      task,
      outputSchema: agentOutputSchema,
    });
  },
};
