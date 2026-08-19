import { useState } from "react";
import { getToken, clearToken } from "./api";
import { Login } from "./components/Login";
import { Queue } from "./components/Queue";
import { TaskDetail } from "./components/TaskDetail";
import { CommandCenter } from "./components/CommandCenter";

type Tab = "queue" | "command-center";

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  const [tab, setTab] = useState<Tab>("queue");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>VBS Agent Operating System</h1>
        <nav className="tab-nav">
          <button
            className={`tab-button${tab === "queue" ? " active" : ""}`}
            onClick={() => {
              setTab("queue");
              setSelectedTaskId(null);
            }}
          >
            Review Queue
          </button>
          <button className={`tab-button${tab === "command-center" ? " active" : ""}`} onClick={() => setTab("command-center")}>
            Command Center
          </button>
        </nav>
        <button
          className="logout-link"
          onClick={() => {
            clearToken();
            setAuthed(false);
            setSelectedTaskId(null);
          }}
        >
          Sign out
        </button>
      </header>
      <main>
        {tab === "queue" &&
          (selectedTaskId ? (
            <TaskDetail taskId={selectedTaskId} onBack={() => setSelectedTaskId(null)} />
          ) : (
            <Queue onSelect={setSelectedTaskId} />
          ))}
        {tab === "command-center" && <CommandCenter />}
      </main>
    </div>
  );
}
