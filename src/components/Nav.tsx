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
      background: 'rgba(8,10,15,0.85)',
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
      <div style={{ display: 'flex', gap: 2 }}>
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

      {/* Live badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '4px 12px', borderRadius: 100,
        background: 'rgba(255,68,68,0.08)',
        border: '1px solid rgba(255,68,68,0.25)',
        fontSize: 11, fontWeight: 700, color: 'var(--red)',
        fontFamily: 'var(--font-body)', letterSpacing: 0.8,
      }}>
        <div style={{
          width: 5, height: 5, borderRadius: '50%', background: 'var(--red)',
          animation: 'pulse-dot 1.5s ease-in-out infinite',
        }} />
        {highCount} CRITICAL
      </div>
    </nav>
  );
}