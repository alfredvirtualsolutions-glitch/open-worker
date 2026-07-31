import { AccountView } from '@neondatabase/neon-js/auth/react';

export function Account() {
  return (
    <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '2rem' }}>
      <h2>Account Management</h2>
      <AccountView />
    </div>
  );
}