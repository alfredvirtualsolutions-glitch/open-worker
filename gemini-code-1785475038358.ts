import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { neon } from '@neondatabase/serverless';

const sql = neon(import.meta.env.VITE_NEON_DATABASE_URL);

interface Signal {
  id: string;
  target_profession: string;
  individual_signal: string | null;
  organization_signal: string | null;
  state: string;
  total_score: number;
  source_url: string;
  claim_text: string;
}

export function Home() {
  const [selectedClient, setSelectedClient] = useState('juancabezas');
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchClientSignals() {
      setLoading(true);
      try {
        let rows: any[] = [];
        if (selectedClient === 'juancabezas') {
          rows = await sql`SELECT * FROM hermes_juancabezas_signals`;
        } else if (selectedClient === 'ryancahill') {
          rows = await sql`SELECT * FROM hermes_ryancahill_signals`;
        } else if (selectedClient === 'dontowns') {
          rows = await sql`SELECT * FROM hermes_dontowns_signals`;
        } else if (selectedClient === 'benjaminpersyn') {
          rows = await sql`SELECT * FROM hermes_benjaminpersyn_signals`;
        }
        setSignals(rows as Signal[]);
      } catch (err) {
        console.error('Error fetching signals from Neon:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchClientSignals();
  }, [selectedClient]);

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <h1>Hermes Client Signals Dashboard</h1>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link to="/auth/sign-in" style={{ color: '#2563eb', fontWeight: 'bold' }}>Sign In</Link>
          <Link to="/account/settings" style={{ color: '#2563eb', fontWeight: 'bold' }}>Account</Link>
        </nav>
      </header>

      {/* Client Selection Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[
          { slug: 'juancabezas', label: 'Juan Cabezas' },
          { slug: 'ryancahill', label: 'Ryan Cahill' },
          { slug: 'dontowns', label: 'Don Towns' },
          { slug: 'benjaminpersyn', label: 'Benjamin Persyn' }
        ].map((client) => (
          <button
            key={client.slug}
            onClick={() => setSelectedClient(client.slug)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              border: '1px solid #2563eb',
              background: selectedClient === client.slug ? '#2563eb' : '#ffffff',
              color: selectedClient === client.slug ? '#ffffff' : '#2563eb',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {client.label}
          </button>
        ))}
      </div>

      {/* Signal Feed */}
      {loading ? (
        <p>Loading signals from Neon...</p>
      ) : signals.length === 0 ? (
        <p>No signals found for this client.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {signals.map((sig, idx) => (
            <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 'bold', color: '#1e293b' }}>{sig.target_profession} ({sig.state})</span>
                <span style={{ background: '#cbd5e1', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.85rem' }}>
                  Score: {sig.total_score}
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0.5rem 0', color: '#64748b', fontSize: '0.9rem' }}>
                {sig.individual_signal ? `Person: ${sig.individual_signal} | ` : ''}
                {sig.organization_signal ? `Org: ${sig.organization_signal}` : ''}
              </p>
              <p style={{ fontStyle: 'italic', color: '#334155', margin: '0.5rem 0' }}>"{sig.claim_text}"</p>
              <a href={sig.source_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: '#2563eb' }}>
                View Primary Source Link →
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}