import { useMemo } from 'react';
import { MOCK_INCIDENTS } from '../data/incidents';

interface NavProps {
  activePage: string;
  onNavigate: (page: string) => void;
}

export default function Nav({ activePage, onNavigate }: NavProps) {
  const highCount = useMemo(() => MOCK_INCIDENTS.filter(i => i.conf === 'high').length, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      height: 56,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px',
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Logo */}
      <div
        onClick={() => onNavigate('home')}
        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
      >
        <div style={{ position: 'relative', width: 10, height: 10 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse-dot 2s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: 'var(--accent)', opacity: 0.3,
            animation: 'ping 2s ease-out infinite',
          }} />
        </div>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 700,
          fontSize: 18, letterSpacing: '0.2px',
        }}>
          Three<span style={{ color: 'var(--accent)' }}>One</span>One
        </span>
      </div>

      {/* Links */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 1001 }}>
        {['home', 'map', 'report'].map(page => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: activePage === page ? 'var(--accent-dim)' : 'none',
              color: activePage === page ? 'var(--accent)' : 'var(--text2)',
              fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-body)',
              transition: 'all 0.15s',
              textTransform: 'capitalize',
            }}
          >
            {page === 'map' ? 'Live Map' : page === 'report' ? 'Report' : 'Home'}
          </button>
        ))}
      </div>

      {/* Live badge removed per request */}
    </nav>
  );
}