import { describe, it, expect } from "vitest";
import {
  getPipeline,
  getPipelineStartAgent,
  getNextPipelineAgent,
} from "../src/config/workflowPipeline.js";

describe("workflow pipeline (PRD §3 canonical flow)", () => {
  it("returns the configured pipeline for a pipelined task_type", () => {
    expect(getPipeline("research_to_outreach")).toEqual(["gemma", "deepseek", "nova"]);
  });

  it("returns null for a task_type with no pipeline", () => {
    expect(getPipeline("some_other_task_type")).toBeNull();
    expect(getPipelineStartAgent("some_other_task_type")).toBeNull();
    expect(getNextPipelineAgent("some_other_task_type", "gemma")).toBeNull();
  });

  it("starts a pipelined task_type at the first stage", () => {
    expect(getPipelineStartAgent("research_to_outreach")).toBe("gemma");
  });

  it("walks the pipeline stage by stage", () => {
    expect(getNextPipelineAgent("research_to_outreach", "gemma")).toBe("deepseek");
    expect(getNextPipelineAgent("research_to_outreach", "deepseek")).toBe("nova");
  });

  it("returns null after the last stage", () => {
    expect(getNextPipelineAgent("research_to_outreach", "nova")).toBeNull();
  });

  it("returns null for an agent not in the pipeline", () => {
    expect(getNextPipelineAgent("research_to_outreach", "prime")).toBeNull();
  });
});
