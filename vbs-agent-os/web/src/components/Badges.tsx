const STATUS_CLASS: Record<string, string> = {
  HUMAN_REVIEW: "status-attention",
  FAILED_FINAL: "status-danger",
  FAILED_RETRYABLE: "status-warn",
  BLOCKED: "status-warn",
  REJECTED: "status-danger",
  REWORK: "status-warn",
  APPROVED: "status-ok",
  ACTIONED: "status-ok",
  CLOSED: "status-neutral",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? "status-neutral"}`}>{status}</span>;
}

export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return <span className="confidence confidence-unknown">—</span>;
  const low = confidence < 0.5;
  return (
    <span className={`confidence ${low ? "confidence-low" : "confidence-ok"}`} title="Confidence">
      {Math.round(confidence * 100)}%
    </span>
  );
}
