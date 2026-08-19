import { useCallback, useEffect, useState } from "react";
import { api, type Task, type PrimeReport } from "../api";
import { StatusBadge, ConfidenceBadge } from "./Badges";

const POLL_MS = 15000;

function TaskRow({ task, attention, onSelect }: { task: Task; attention?: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      className={`task-row${attention ? " task-row-attention" : ""}`}
      onClick={() => onSelect(task.task_id)}
    >
      <StatusBadge status={task.status} />
      <span className="task-type">{task.task_type}</span>
      <span className="task-agent">{task.assigned_agent}</span>
      <span className="task-client">{task.client_id}</span>
      <ConfidenceBadge confidence={task.confidence} />
      <span className="task-time">{new Date(task.created_at).toLocaleString()}</span>
    </button>
  );
}

export function Queue({ onSelect }: { onSelect: (taskId: string) => void }) {
  const [reviewQueue, setReviewQueue] = useState<Task[] | null>(null);
  const [recent, setRecent] = useState<Task[] | null>(null);
  const [primeStats, setPrimeStats] = useState<PrimeReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [review, all, stats] = await Promise.all([
        api.listTasks("HUMAN_REVIEW", 200),
        api.listTasks(undefined, 50),
        api.primeReport(),
      ]);
      setReviewQueue(review);
      setRecent(all);
      setPrimeStats(stats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="queue-page">
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Needs your decision {reviewQueue ? `(${reviewQueue.length})` : ""}</h2>
        {reviewQueue?.length === 0 && <p className="empty">Nothing needs your review right now.</p>}
        <div className="task-list">
          {reviewQueue?.map((t) => (
            <TaskRow key={t.task_id} task={t} attention onSelect={onSelect} />
          ))}
        </div>
      </section>

      {primeStats && (
        <section>
          <h2>Prime — decisions &amp; confidence</h2>
          <div className="stat-row">
            {Object.entries(primeStats.decisions).map(([decision, count]) => (
              <div className="stat-tile" key={decision}>
                <span className="stat-value">{count}</span>
                <span className="stat-label">{decision}</span>
              </div>
            ))}
            <div className="stat-tile">
              <span className="stat-value">
                {primeStats.average_confidence !== null ? `${Math.round(primeStats.average_confidence * 100)}%` : "—"}
              </span>
              <span className="stat-label">avg confidence</span>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2>Recent activity</h2>
        <div className="task-list">
          {recent?.map((t) => (
            <TaskRow key={t.task_id} task={t} onSelect={onSelect} />
          ))}
        </div>
      </section>
    </div>
  );
}
