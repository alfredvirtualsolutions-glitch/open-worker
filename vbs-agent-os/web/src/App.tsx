import { useState } from "react";
import { getToken, clearToken } from "./api";
import { Login } from "./components/Login";
import { Queue } from "./components/Queue";
import { TaskDetail } from "./components/TaskDetail";

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getToken()));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>VBS Prime Control Gate</h1>
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
        {selectedTaskId ? (
          <TaskDetail taskId={selectedTaskId} onBack={() => setSelectedTaskId(null)} />
        ) : (
          <Queue onSelect={setSelectedTaskId} />
        )}
      </main>
    </div>
  );
}
