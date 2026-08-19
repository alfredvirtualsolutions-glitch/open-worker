/**
 * PRD FR-10: "Retry limits and failure escalation are configurable per task
 * type." A single hardcoded retry count does not satisfy this — different
 * task types have different costs of failure (a routine research question
 * can afford more attempts than an expensive extraction job), so the limit
 * has to be a lookup keyed on task_type, not a constant sprinkled through
 * the dispatcher.
 *
 * This is intentionally a plain code map, not a DB table: retry policy is
 * operational configuration the owner tunes by editing/deploying, same
 * category as the MODEL_* env vars (PRD NFR "Maintainability: prompts,
 * routing rules and thresholds are versioned").
 */
const TASK_TYPE_MAX_ATTEMPTS: Record<string, number> = {
  // Add task_type-specific overrides here as they're identified, e.g.:
  // research_question: 5,
  // bulk_extraction: 3,
};

export const DEFAULT_MAX_ATTEMPTS = 5;

/** Worker-task failures (Gemma/DeepSeek/Nova) exhaust retries faster by default than Prime's QA re-review loop. */
export const DEFAULT_QA_MAX_ATTEMPTS = 5;

export function getMaxAttemptsForTaskType(taskType: string): number {
  return TASK_TYPE_MAX_ATTEMPTS[taskType] ?? DEFAULT_MAX_ATTEMPTS;
}
