import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ApiError, type Task, type TaskEvent, type ResolveDecision } from "../api";
import { StatusBadge } from "./Badges";

const DECISIONS: ResolveDecision[] = ["APPROVED", "REWORK", "REJECTED", "CLOSED"];
const TERMINAL_STATUSES = new Set(["CLOSED", "REJECTED", "FAILED_FINAL"]);

export function TaskDetail({ taskId, onBack }: { taskId: string; onBack: () => void }) {
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<ResolveDecision>("APPROVED");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const { task, events } = await api.getTask(taskId);
      setTask(task);
      setEvents(events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load task.");
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitResolve(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.resolveTask(taskId, decision, note);
      setResolved(true);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resolve task.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      await api.cancelTask(taskId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to cancel task.");
    } finally {
      setCancelling(false);
    }
  }

  if (error && !task) {
    return (
      <div className="detail-page">
        <button className="back-link" onClick={onBack}>
          ← Back
        </button>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!task) return <div className="detail-page">Loading…</div>;

  return (
    <div className="detail-page">
      <button className="back-link" onClick={onBack}>
        ← Back
      </button>

      <header className="detail-header">
        <h2>{task.task_type}</h2>
        <StatusBadge status={task.status} />
        {!TERMINAL_STATUSES.has(task.status) && (
          <button className="cancel-button" onClick={() => void handleCancel()} disabled={cancelling}>
            {cancelling ? "Cancelling…" : "Cancel task"}
          </button>
        )}
      </header>

      <dl className="detail-meta">
        <dt>Task ID</dt>
        <dd>
          <code>{task.task_id}</code>
        </dd>
        <dt>Run ID</dt>
        <dd>
          <code>{task.run_id}</code>
        </dd>
        {task.parent_task_id && (
          <>
            <dt>Parent task</dt>
            <dd>
              <code>{task.parent_task_id}</code>
            </dd>
          </>
        )}
        <dt>Client</dt>
        <dd>{task.client_id}</dd>
        <dt>Assigned agent</dt>
        <dd>{task.assigned_agent}</dd>
        <dt>Requested by</dt>
        <dd>{task.requested_by}</dd>
        <dt>Priority</dt>
        <dd>{task.priority}</dd>
        <dt>Confidence</dt>
        <dd>{task.confidence !== null ? `${Math.round(task.confidence * 100)}%` : "—"}</dd>
        <dt>Prime decision</dt>
        <dd>{task.prime_decision ?? "—"}</dd>
        <dt>Created</dt>
        <dd>{new Date(task.created_at).toLocaleString()}</dd>
      </dl>

      {task.issues.length > 0 && (
        <section>
          <h3>Issues</h3>
          <ul className="issue-list">
            {task.issues.map((issue, i) => (
              <li key={i} className={`issue issue-${issue.severity}`}>
                <strong>{issue.code}</strong> ({issue.raised_by}): {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Evidence</h3>
        {task.evidence.length === 0 ? (
          <p className="empty">No evidence recorded.</p>
        ) : (
          <ul className="evidence-list">
            {task.evidence.map((ev, i) => (
              <li key={i}>
                <span className="evidence-source">{ev.source}</span> — <span>{ev.claim}</span>
                {ev.confidence !== null && (
                  <span className="evidence-confidence"> ({Math.round(ev.confidence * 100)}%)</span>
                )}
                {!ev.observed && <span className="evidence-derived"> (derived)</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>Input</h3>
        <pre className="json-block">{JSON.stringify(task.input, null, 2)}</pre>
      </section>

      <section>
        <h3>Result</h3>
        <pre className="json-block">{JSON.stringify(task.result, null, 2)}</pre>
      </section>

      <section>
        <h3>Audit trail</h3>
        <ol className="event-list">
          {events?.map((ev) => (
            <li key={ev.event_id}>
              <span className="event-time">{new Date(ev.at).toLocaleString()}</span>
              <span className="event-actor">{ev.actor}</span>
              <span className="event-type">{ev.event_type}</span>
              {ev.from_status && ev.to_status && (
                <span className="event-transition">
                  {ev.from_status} → {ev.to_status}
                </span>
              )}
              {typeof ev.detail?.reason === "string" && <span className="event-reason">{ev.detail.reason}</span>}
            </li>
          ))}
        </ol>
      </section>

      {task.status === "HUMAN_REVIEW" && !resolved && (
        <section className="resolve-panel">
          <h3>Your decision</h3>
          <form onSubmit={submitResolve}>
            <div className="decision-buttons">
              {DECISIONS.map((d) => (
                <label key={d} className={`decision-option${decision === d ? " selected" : ""}`}>
                  <input
                    type="radio"
                    name="decision"
                    value={d}
                    checked={decision === d}
                    onChange={() => setDecision(d)}
                  />
                  {d}
                </label>
              ))}
            </div>
            <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : `Resolve as ${decision}`}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
