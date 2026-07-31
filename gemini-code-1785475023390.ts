import { AuthView } from '@neondatabase/neon-js/auth/react';

export function Auth() {
  return (
    <div style={{ maxWidth: '420px', margin: '4rem auto', padding: '2rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#ffffff' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Sign In to Hermes</h2>
      <AuthView />
    </div>
  );
}