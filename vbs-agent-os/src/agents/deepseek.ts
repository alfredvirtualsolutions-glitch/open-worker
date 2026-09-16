import { env } from "../config/env.js";
import { DEEPSEEK_SYSTEM_PROMPT } from "./prompts.js";
import { agentOutputSchema, type AgentAdapter, type AgentOutput } from "./types.js";
import { runAgentCall } from "./runAgentCall.js";
import type { TaskContract } from "../contract/taskContract.js";
import {
  BUNNY_UPLOAD_TASK_TYPE,
  BUNNY_PURGE_TASK_TYPE,
  BUNNY_VIDEO_TASK_TYPE,
} from "../config/workflowPipeline.js";
import {
  uploadFile,
  purgeCDNCache,
  pushVideo,
  deleteFile,
  isBunnyConfigured,
} from "../services/bunny.js";

export const deepseekAdapter: AgentAdapter = {
  name: "deepseek",
  async run(task: TaskContract): Promise<AgentOutput> {
    // --- External action: bunny.net file upload ---
    if (task.task_type === BUNNY_UPLOAD_TASK_TYPE) {
      if (!isBunnyConfigured()) {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "BUNNY_NOT_CONFIGURED",
              message: "bunny.net API key is not configured. Set BUNNY_API_KEY and BUNNY_STORAGE_ZONE in .env.",
              raised_by: "deepseek",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      const input = task.input as {
        storageZone?: string;
        path?: string;
        content?: string;
        contentType?: string;
      };
      const result = await uploadFile(
        input.storageZone || "",
        input.path || "",
        input.content || "",
        input.contentType
      );
      return {
        result: { uploaded: result.success, bunny_response: result.data, error: result.error },
        evidence: [
          {
            source: "bunny_storage_upload",
            claim: result.success
              ? `File uploaded to bunny.net at ${input.path}`
              : `bunny.net upload failed: ${result.error}`,
            confidence: result.success ? 1.0 : 0.0,
            observed: true,
          },
        ],
        confidence: result.success ? 1.0 : 0.0,
        issues: result.success
          ? []
          : [
              {
                code: "BUNNY_UPLOAD_FAILED",
                message: result.error || "Unknown bunny.net error",
                raised_by: "deepseek",
                severity: "action_required",
              },
            ],
        next_action: result.success ? null : "Check bunny.net API key, storage zone, and path",
        requires_human_attention: !result.success,
      };
    }

    // --- External action: bunny.net CDN cache purge ---
    if (task.task_type === BUNNY_PURGE_TASK_TYPE) {
      if (!isBunnyConfigured()) {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "BUNNY_NOT_CONFIGURED",
              message: "bunny.net API key is not configured. Set BUNNY_API_KEY in .env.",
              raised_by: "deepseek",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      const input = task.input as {
        url?: string;
        pullZoneId?: string;
      };
      let result: { success: boolean; data?: unknown; error?: string };
      if (input.pullZoneId) {
        const { purgePullZone } = await import("../services/bunny.js");
        result = await purgePullZone(input.pullZoneId);
      } else if (input.url) {
        result = await purgeCDNCache(input.url);
      } else {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "INVALID_PURGE_INPUT",
              message: "Either 'url' or 'pullZoneId' must be provided for CDN purge.",
              raised_by: "deepseek",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      return {
        result: { purged: result.success, bunny_response: result.data, error: result.error },
        evidence: [
          {
            source: "bunny_cdn_purge",
            claim: result.success
              ? `CDN cache purged for ${input.url || `pull zone ${input.pullZoneId}`}`
              : `bunny.net purge failed: ${result.error}`,
            confidence: result.success ? 1.0 : 0.0,
            observed: true,
          },
        ],
        confidence: result.success ? 1.0 : 0.0,
        issues: result.success
          ? []
          : [
              {
                code: "BUNNY_PURGE_FAILED",
                message: result.error || "Unknown bunny.net error",
                raised_by: "deepseek",
                severity: "action_required",
              },
            ],
        next_action: result.success ? null : "Check bunny.net API key and CDN configuration",
        requires_human_attention: !result.success,
      };
    }

    // --- External action: bunny.net video push ---
    if (task.task_type === BUNNY_VIDEO_TASK_TYPE) {
      if (!isBunnyConfigured()) {
        return {
          result: {},
          evidence: [],
          confidence: null,
          issues: [
            {
              code: "BUNNY_NOT_CONFIGURED",
              message: "bunny.net API key is not configured. Set BUNNY_API_KEY in .env.",
              raised_by: "deepseek",
              severity: "action_required",
            },
          ],
          next_action: null,
          requires_human_attention: true,
        };
      }
      const input = task.input as {
        libraryId?: string;
        title?: string;
        collectionId?: string;
      };
      const result = await pushVideo(
        input.libraryId || "",
        "",
        input.title || "",
        input.collectionId
      );
      return {
        result: { pushed: result.success, bunny_response: result.data, error: result.error },
        evidence: [
          {
            source: "bunny_stream_push",
            claim: result.success
              ? `Video "${input.title}" pushed to bunny.net stream library ${input.libraryId}`
              : `bunny.net video push failed: ${result.error}`,
            confidence: result.success ? 1.0 : 0.0,
            observed: true,
          },
        ],
        confidence: result.success ? 1.0 : 0.0,
        issues: result.success
          ? []
          : [
              {
                code: "BUNNY_VIDEO_FAILED",
                message: result.error || "Unknown bunny.net error",
                raised_by: "deepseek",
                severity: "action_required",
              },
            ],
        next_action: result.success ? null : "Check bunny.net API key and library ID",
        requires_human_attention: !result.success,
      };
    }

    // --- Standard DeepSeek behavior: extraction and normalization ---
    return runAgentCall({
      model: env.MODEL_DEEPSEEK,
      system: DEEPSEEK_SYSTEM_PROMPT,
      task,
      outputSchema: agentOutputSchema,
    });
  },
};
