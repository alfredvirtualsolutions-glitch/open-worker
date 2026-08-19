import { useState, type FormEvent } from "react";
import { api, setToken, clearToken, ApiError } from "../api";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setChecking(true);
    setToken(value.trim());
    try {
      // Validate against a real authed endpoint rather than trusting the paste.
      await api.primeReport();
      onSuccess();
    } catch (err) {
      clearToken();
      setError(err instanceof ApiError && err.status === 401 ? "Invalid token." : "Could not reach the API.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>Prime Control Gate</h1>
        <p>Paste your <code>HERMES_ADMIN_TOKEN</code> to continue.</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Admin token"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={checking || value.trim().length === 0}>
          {checking ? "Checking…" : "Continue"}
        </button>
        <p className="hint">Stored only in this browser's local storage — never sent anywhere but this API.</p>
      </form>
    </div>
  );
}
