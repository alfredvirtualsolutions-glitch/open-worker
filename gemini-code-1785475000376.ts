import { useEffect, useState } from 'react';
import { authClient } from '../lib/auth';

export function AuthStatus() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSession() {
      try {
        const currentSession = await authClient.getSession();
        setSession(currentSession);
      } catch (err) {
        console.error('Error fetching auth session:', err);
      } finally {
        setLoading(false);
      }
    }

    checkSession();
  }, []);

  if (loading) return <span style={{ fontSize: '0.9rem', color: '#666' }}>Checking session...</span>;

  if (!session?.user) {
    return (
      <button 
        onClick={() => authClient.signIn()}
        style={{ padding: '0.4rem 0.8rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Sign In
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <span style={{ fontSize: '0.9rem' }}>User: <strong>{session.user.email}</strong></span>
      <button 
        onClick={async () => {
          await authClient.signOut();
          setSession(null);
        }}
        style={{ padding: '0.3rem 0.6rem', background: '#e11d48', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Sign Out
      </button>
    </div>
  );
}