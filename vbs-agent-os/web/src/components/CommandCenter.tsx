import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  api,
  type HermesReport,
  type WorkerReport,
  type PrimeReport,
  type ExecutiveReport,
  type ControlFlag,
} from "../api";

const POLL_MS = 15000;

function AgentCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <h3>{title}</h3>
        <span className="agent-card-subtitle">{subtitle}</span>
      </div>
      <div className="agent-card-body">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mini-stat">
      <span className="mini-stat-value">{value}</span>
      <span className="mini-stat-label">{label}</span>
    </div>
  );
}

function StatusBreakdown({ byStatus }: { byStatus: Record<string, number> }) {
  const entries = Object.entries(byStatus).filter(([, count]) => count > 0);
  if (entries.length === 0) return <p className="empty">No tasks yet.</p>;
  return (
    <ul className="status-breakdown">
      {entries.map(([status, count]) => (
        <li key={status}>
          <span>{status}</span>
          <span>{count}</span>
        </li>
      ))}
    </ul>
  );
}

function WorkerCardBody({ report }: { report: WorkerReport }) {
  return (
    <>
      <div className="mini-stat-row">
        <Stat label="total" value={report.total_tasks} />
        <Stat label="weak evidence" value={report.weak_evidence_count} />
        <Stat label="errors" value={report.error_count} />
      </div>
      <StatusBreakdown byStatus={report.by_status} />
    </>
  );
}

export function CommandCenter() {
  const [exec, setExec] = useState<ExecutiveReport | null>(null);
  const [hermes, setHermes] = useState<HermesReport | null>(null);
  const [gemma, setGemma] = useState<WorkerReport | null>(null);
  const [deepseek, setDeepseek] = useState<WorkerReport | null>(null);
  const [prime, setPrime] = useState<PrimeReport | null>(null);
  const [nova, setNova] = useState<WorkerReport | null>(null);
  const [flags, setFlags] = useState<ControlFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingPause, setTogglingPause] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, h, g, d, p, n, f] = await Promise.all([
        api.reportExecutive(),
        api.reportHermes(),
        api.reportWorker("gemma"),
        api.reportWorker("deepseek"),
        api.primeReport(),
        api.reportWorker("nova"),
        api.controlFlags(),
      ]);
      setExec(e);
      setHermes(h);
      setGemma(g);
      setDeepseek(d);
      setPrime(p);
      setNova(n);
      setFlags(f);
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

  const globalPause = flags?.find((f) => f.scope === "ALL" && f.scope_key === "ALL")?.paused ?? false;
  const scopedPauses = flags?.filter((f) => f.scope !== "ALL" && f.paused) ?? [];

  async function toggleGlobalPause() {
    setTogglingPause(true);
    try {
      await api.pauseAll(!globalPause, !globalPause ? "paused from command center" : undefined);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle pause.");
    } finally {
      setTogglingPause(false);
    }
  }

  return (
    <div className="command-center">
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Executive summary</h2>
        {exec && (
          <>
            <div className="stat-row">
              <div className="stat-tile">
                <span className="stat-value">{exec.todays_task_volume}</span>
                <span className="stat-label">today's volume</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{exec.attention_required.length}</span>
                <span className="stat-label">attention required</span>
              </div>
              <div className="stat-tile">
                <span className="stat-value">{exec.blockers.length}</span>
                <span className="stat-label">blockers</span>
              </div>
            </div>
            <p className="exec-note">{exec.note}</p>
            {exec.blockers.length > 0 && (
              <ul className="blocker-list">
                {exec.blockers.map((b) => (
                  <li key={b.task_id}>
                    <code>{b.task_id.slice(0, 8)}</code> {b.task_type} — {b.status}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section>
        <h2>Kill switches</h2>
        <div className="kill-switch-panel">
          <button
            className={`kill-switch-button${globalPause ? " active" : ""}`}
            onClick={() => void toggleGlobalPause()}
            disabled={togglingPause}
          >
            {togglingPause ? "Working…" : globalPause ? "Resume all" : "Pause all"}
          </button>
          <span className="kill-switch-status">{globalPause ? "Everything is paused." : "System is running normally."}</span>
        </div>
        {scopedPauses.length > 0 && (
          <ul className="flag-list">
            {scopedPauses.map((f) => (
              <li key={`${f.scope}:${f.scope_key}`}>
                {f.scope} <code>{f.scope_key}</code> paused
                {f.reason ? ` — ${f.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          Per-client and per-workflow pauses are set via the API directly (<code>POST /control/pause-client</code>,{" "}
          <code>/control/pause-workflow</code>) — not yet exposed as a form here.
        </p>
      </section>

      <section>
        <h2>Agents</h2>
        <div className="agent-card-grid">
          <AgentCard title="Hermes" subtitle="Operations">
            {hermes && (
              <>
                <div className="mini-stat-row">
                  <Stat label="retried" value={hermes.tasks_retried} />
                  <Stat label="blocked" value={hermes.blocked_dependencies} />
                  <Stat
                    label="health"
                    value={
                      <span className={hermes.system_health === "ok" ? "text-ok" : "text-warn"}>{hermes.system_health}</span>
                    }
                  />
                </div>
                <StatusBreakdown byStatus={hermes.jobs_by_status} />
              </>
            )}
          </AgentCard>

          <AgentCard title="Gemma" subtitle="Research & Intelligence">
            {gemma && <WorkerCardBody report={gemma} />}
          </AgentCard>

          <AgentCard title="DeepSeek" subtitle="Execution">
            {deepseek && <WorkerCardBody report={deepseek} />}
          </AgentCard>

          <AgentCard title="Prime" subtitle="QA & Control Gate">
            {prime && (
              <>
                <div className="mini-stat-row">
                  {Object.entries(prime.decisions).map(([d, c]) => (
                    <Stat key={d} label={d} value={c} />
                  ))}
                </div>
                <Stat
                  label="avg confidence"
                  value={prime.average_confidence !== null ? `${Math.round(prime.average_confidence * 100)}%` : "—"}
                />
              </>
            )}
          </AgentCard>

          <AgentCard title="Nova" subtitle="Communications">
            {nova && <WorkerCardBody report={nova} />}
          </AgentCard>
        </div>
      </section>
    </div>
  );
}
