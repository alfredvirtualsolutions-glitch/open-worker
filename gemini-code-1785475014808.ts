import { Routes, Route, Link } from 'react-router-dom';
import { AuthStatus } from './components/AuthStatus';
import ClientSignalsView from './components/ClientSignalsView';

export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Hermes Client Signals Dashboard</h1>
          <nav style={{ display: 'flex', gap: '1rem', marginTop: '0.8rem' }}>
            <Link to="/client/juancabezas" style={{ color: '#2563eb', fontWeight: 'bold' }}>Juan Cabezas</Link>
            <Link to="/client/ryancahill" style={{ color: '#2563eb', fontWeight: 'bold' }}>Ryan Cahill</Link>
            <Link to="/client/dontowns" style={{ color: '#2563eb', fontWeight: 'bold' }}>Don Towns</Link>
            <Link to="/client/benjaminpersyn" style={{ color: '#2563eb', fontWeight: 'bold' }}>Benjamin Persyn</Link>
          </nav>
        </div>
        <AuthStatus />
      </header>

      <Routes>
        <Route path="/" element={<p>Select a client above to view their verified signals from Neon.</p>} />
        <Route path="/client/:clientSlug" element={<ClientSignalsView />} />
      </Routes>
    </div>
  );
}