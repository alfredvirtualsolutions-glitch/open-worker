/**
 * Thin client for the VBS Agent OS API. Auth model per ADR-002: the admin
 * token is pasted once (see components/Login), stored in localStorage, and
 * sent as a Bearer token on every request — the same shared-secret model
 * every other client of this API already uses.
 */
const TOKEN_KEY = "vbs_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${getToken() ?? ""}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export interface EvidenceItem {
  source: string;
  claim: string;
  confidence: number | null;
  observed: boolean;
}

export interface Issue {
  code: string;
  message: string;
  raised_by: string;
  severity: "info" | "attention" | "action_required";
}

export interface Task {
  client_id: string;
  run_id: string;
  task_id: string;
  parent_task_id: string | null;
  created_at: string;
  requested_by: string;
  assigned_agent: string;
  task_type: string;
  priority: string;
  input: Record<string, unknown>;
  expected_output: Record<string, unknown>;
  status: string;
  confidence: number | null;
  evidence: EvidenceItem[];
  result: Record<string, unknown>;
  issues: Issue[];
  prime_decision: string | null;
  next_action: string | null;
  requires_human_attention: boolean;
}

export interface TaskEvent {
  event_id: number;
  at: string;
  actor: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  detail: Record<string, unknown>;
}

export interface PrimeReport {
  agent: "prime";
  decisions: Record<string, number>;
  average_confidence: number | null;
}

export type ResolveDecision = "APPROVED" | "REWORK" | "REJECTED" | "CLOSED";

export const api = {
  listTasks: (status?: string, limit = 100) =>
    request<Task[]>(`/tasks?limit=${limit}${status ? `&status=${encodeURIComponent(status)}` : ""}`),
  getTask: (taskId: string) => request<{ task: Task; events: TaskEvent[] }>(`/tasks/${taskId}`),
  resolveTask: (taskId: string, decision: ResolveDecision, note: string) =>
    request<Task>(`/tasks/${taskId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ decision, note: note.trim() || undefined }),
    }),
  primeReport: () => request<PrimeReport>("/reports/prime"),
};
