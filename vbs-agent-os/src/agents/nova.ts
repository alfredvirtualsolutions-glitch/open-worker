import { env } from "../config/env.js";
import { NOVA_SYSTEM_PROMPT } from "./prompts.js";
import { agentOutputSchema, type AgentAdapter, type AgentOutput } from "./types.js";
import { runAgentCall } from "./runAgentCall.js";
import type { TaskContract } from "../contract/taskContract.js";
import {
  RESPONSE_ANALYSIS_TASK_TYPE,
  SEQUENZY_SEND_EMAIL_TASK_TYPE,
  SEQUENZY_TRIGGER_EVENT_TASK_TYPE,
  SEQUENZY_MANAGE_SUBSCRIBER_TASK_TYPE,
} from "../config/workflowPipeline.js";
import {
  sendTransactionalEmail,
  triggerEvent,
  createSubscriber,
  addTag,
  isSequenzyConfigured,
} from "../services/sequenzy.js";

export const novaAdapter: AgentAdapter = {
  name: "nova",
  async run(task: TaskContract): Promise<AgentOutput> {
    const isResponseAnalysis = task.task_type === RESPONSE_ANALYSIS_TASK_TYPE;

    // --- External action: Sequenzy send email ---
    if (task.task_type === SEQUENZY_SEND_EMAIL_TASK_TYPE) {
      if (!isSequenzyConfigured()) {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "SEQUENZY_NOT_CONFIGURED",
              message: "Sequenzy API key is not configured. Set SEQUENZY_API_KEY in .env.",
              raised_by: "nova",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      const input = task.input as {
        to?: string;
        slug?: string;
        variables?: Record<string, unknown>;
      };
      const result = await sendTransactionalEmail({
        to: input.to || "",
        slug: input.slug || "",
        variables: input.variables,
      });
      return {
        result: { sent: result.success, sequenzy_response: result.data, error: result.error },
        evidence: [
          {
            source: "sequenzy_transactional_send",
            claim: result.success
              ? `Transactional email sent to ${input.to} via template "${input.slug}"`
              : `Failed to send transactional email: ${result.error}`,
            confidence: result.success ? 1.0 : 0.0,
            observed: true,
          },
        ],
        confidence: result.success ? 1.0 : 0.0,
        issues: result.success
          ? []
          : [
              {
                code: "SEQUENZY_SEND_FAILED",
                message: result.error || "Unknown Sequenzy error",
                raised_by: "nova",
                severity: "action_required",
              },
            ],
        next_action: result.success ? null : "Check Sequenzy API key and template slug",
        requires_human_attention: !result.success,
      };
    }

    // --- External action: Sequenzy trigger event ---
    if (task.task_type === SEQUENZY_TRIGGER_EVENT_TASK_TYPE) {
      if (!isSequenzyConfigured()) {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "SEQUENZY_NOT_CONFIGURED",
              message: "Sequenzy API key is not configured. Set SEQUENZY_API_KEY in .env.",
              raised_by: "nova",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      const input = task.input as {
        email?: string;
        event?: string;
        properties?: Record<string, unknown>;
      };
      const result = await triggerEvent({
        email: input.email || "",
        event: input.event || "",
        properties: input.properties,
      });
      return {
        result: { triggered: result.success, sequenzy_response: result.data, error: result.error },
        evidence: [
          {
            source: "sequenzy_event_trigger",
            claim: result.success
              ? `Event "${input.event}" triggered for ${input.email}`
              : `Failed to trigger event: ${result.error}`,
            confidence: result.success ? 1.0 : 0.0,
            observed: true,
          },
        ],
        confidence: result.success ? 1.0 : 0.0,
        issues: result.success
          ? []
          : [
              {
                code: "SEQUENZY_EVENT_FAILED",
                message: result.error || "Unknown Sequenzy error",
                raised_by: "nova",
                severity: "action_required",
              },
            ],
        next_action: result.success ? null : "Check Sequenzy API key and event type",
        requires_human_attention: !result.success,
      };
    }

    // --- External action: Sequenzy manage subscriber ---
    if (task.task_type === SEQUENZY_MANAGE_SUBSCRIBER_TASK_TYPE) {
      if (!isSequenzyConfigured()) {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "SEQUENZY_NOT_CONFIGURED",
              message: "Sequenzy API key is not configured. Set SEQUENZY_API_KEY in .env.",
              raised_by: "nova",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      const input = task.input as {
        action?: "create" | "add_tag";
        email?: string;
        firstName?: string;
        tags?: string[];
        tag?: string;
      };
      let result: { success: boolean; data?: unknown; error?: string };
      if (input.action === "create") {
        result = await createSubscriber({
          email: input.email || "",
          firstName: input.firstName,
          tags: input.tags,
        });
      } else if (input.action === "add_tag") {
        result = await addTag({
          email: input.email || "",
          tag: input.tag || "",
        });
      } else {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "INVALID_SUBSCRIBER_ACTION",
              message: `Unknown subscriber action: ${input.action}. Use "create" or "add_tag".`,
              raised_by: "nova",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      return {
        result: { success: result.success, sequenzy_response: result.data, error: result.error },
        evidence: [
          {
            source: "sequenzy_subscriber_management",
            claim: result.success
              ? `Subscriber ${input.action} succeeded for ${input.email}`
              : `Subscriber ${input.action} failed: ${result.error}`,
            confidence: result.success ? 1.0 : 0.0,
            observed: true,
          },
        ],
        confidence: result.success ? 1.0 : 0.0,
        issues: result.success
          ? []
          : [
              {
                code: "SEQUENZY_SUBSCRIBER_FAILED",
                message: result.error || "Unknown Sequenzy error",
                raised_by: "nova",
                severity: "action_required",
              },
            ],
        next_action: result.success ? null : "Check Sequenzy API key and subscriber data",
        requires_human_attention: !result.success,
      };
    }

    // --- Standard Nova behavior: draft communication or analyze response ---
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
