import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import LiveMapEmbed from '../components/LiveMapEmbed';
import { MOCK_INCIDENTS } from '../data/incidents';
import type { Incident } from '../data/incidents';
import cityBg from '../../cityfinal.png';

type IncidentApiResponse = {
  status: string;
  count: number;
  incidents: Incident[];
};

const dedupeIncidents = (incidents: Incident[]) => {
  const seenKeys = new Set<string>();
  const deduped: Incident[] = [];

  for (const incident of incidents) {
    const signalId = typeof (incident as Incident & { signalId?: number }).signalId === 'number'
      ? (incident as Incident & { signalId?: number }).signalId
      : null;
    const key = signalId == null ? `id:${incident.id}` : `signal:${signalId}`;

    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(incident);
  }

  return deduped;
};

const loadVerifiedIncidents = async (): Promise<Incident[]> => {
  try {
    const response = await fetch('/api/verified-hazards');
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const payload = (await response.json()) as IncidentApiResponse;
    const incidents = Array.isArray(payload.incidents) ? payload.incidents : [];
    const deduped = dedupeIncidents(incidents);

    console.log(`[Home] Loaded ${deduped.length} verified incidents from database`);
    return deduped;
  } catch (error) {
    console.error('[Home] Falling back to mock incidents because verified hazards could not be loaded:', error);
    return MOCK_INCIDENTS;
  }
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const CONF_COLOR = { high: '#ff4444', medium: '#f5a623', low: '#6b7280' } as const;

// The "How it works" pipeline content removed per request

// ── Ticker ────────────────────────────────────────────────────────────────────
function Ticker({ incidents }: { incidents: Incident[] }) {
  const items = incidents.flatMap(i => [
    `${i.icon} ${i.type} · ${i.conf.toUpperCase()} · ${i.time}`,
  ]);
  const doubled = [...items, ...items];

  return (
    <div style={{
      overflow: 'hidden', background: 'var(--bg2)',
      borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
      padding: '10px 0',
    }}>
      <div style={{
        display: 'flex', gap: 48,
        animation: 'ticker 30s linear infinite',
        width: 'max-content',
        whiteSpace: 'nowrap',
      }}>
        {doubled.map((item, i) => (
          <span key={i} style={{ fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace', letterSpacing: 0.5 }}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ num, label, accent }: { num: string | number; label: string; accent?: string }) {
  return (
    <div style={{
      flex: 1, padding: '20px 24px', textAlign: 'center',
      borderRight: '1px solid var(--border)',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700,
        color: accent ?? 'var(--accent)', letterSpacing: -0.4,
      }}>{num}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

// ── Incident feed card ────────────────────────────────────────────────────────
function IncidentFeedCard({ inc }: { inc: Incident }) {
  const col = CONF_COLOR[inc.conf];
  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '14px 16px',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      transition: 'border-color 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border3)')}
    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: col + '18', border: `1px solid ${col}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, flexShrink: 0,
      }}>{inc.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{inc.type}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
            background: col + '18', color: col, border: `1px solid ${col}35`,
            fontFamily: 'monospace', flexShrink: 0, marginLeft: 8,
          }}>{inc.conf.toUpperCase()}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6 }}>{inc.desc}</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text3)' }}>
          <span>📊 {inc.reports} reports</span>
          <span>🕐 {inc.time}</span>
          {inc.hasImage && <span>📸 Photo</span>}
        </div>
        {/* Confidence bar */}
        <div style={{ height: 3, background: 'var(--bg3)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${inc.score}%`, background: col, borderRadius: 2, transition: 'width 0.5s var(--ease)' }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Homepage ─────────────────────────────────────────────────────────────
export default function Home({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [visible, setVisible] = useState(false);
  const [incidents, setIncidents] = useState<Incident[]>(MOCK_INCIDENTS);
  const [isLoadingIncidents, setIsLoadingIncidents] = useState(true);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateIncidents = async () => {
      setIsLoadingIncidents(true);
      const verifiedIncidents = await loadVerifiedIncidents();

      if (!cancelled) {
        setIncidents(verifiedIncidents);
        setIsLoadingIncidents(false);
      }
    };

    hydrateIncidents();

    return () => {
      cancelled = true;
    };
  }, []);

  const fadeStyle = (delay: number): CSSProperties => ({
    opacity: visible ? 1 : 0,
    transform: visible ? 'none' : 'translateY(24px)',
    transition: `opacity 0.7s var(--ease) ${delay}ms, transform 0.7s var(--ease) ${delay}ms`,
  });

  const totalReports = incidents.reduce((a, i) => a + i.reports, 0);
  const highCount = incidents.filter((i) => i.conf === 'high').length;
  const avgCluster = incidents.length > 0 ? Math.round(totalReports / incidents.length) : 0;

  return (
    <div style={{ paddingTop: 56, background: 'var(--bg1)' }}>

      {/* ── HERO ── */}
      <section ref={heroRef} style={{
        position: 'relative', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Background image */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: '#fff' }}>
          <img
            src={cityBg}
            alt="City background"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              filter: 'brightness(1.15) saturate(0.85)',
              transform: 'none',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.18) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)`, backgroundSize: '44px 44px', opacity: 0.1 }} />
        </div>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '15%', left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 500, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, rgba(255,68,68,0.07) 0%, transparent 65%)',
        }} />
        {/* Scanline effect */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', opacity: 0.03,
        }}>
          <div style={{
            width: '100%', height: '2px', background: 'var(--accent)',
            animation: 'scanline 6s linear infinite',
          }} />
        </div>

        {/* Content */}
        <div style={{
          textAlign: 'center',
          padding: '28px 28px 30px',
          maxWidth: 900,
          position: 'relative',
          zIndex: 1,
          transform: 'translateY(-18px)',
          background: 'rgba(255, 255, 255, 0.64)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: 20,
          boxShadow: '0 18px 40px rgba(0, 0, 0, 0.06)',
        }}>

          {/* Headline */}
          <h1 style={{
            ...fadeStyle(80),
            fontFamily: 'var(--font-display)', fontWeight: 700,
            fontSize: 'clamp(40px, 6.2vw, 74px)', lineHeight: 1.12,
            letterSpacing: -1.1, marginBottom: 24,
            color: '#000',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
          }}>
            Cities that see<br />
            <span style={{ color: 'var(--accent)' }}>threats coming</span><br />
            act faster.
          </h1>

          {/* Subhead */}
          <p style={{
            ...fadeStyle(160),
            fontSize: 17, color: 'rgba(0,0,0,0.72)', lineHeight: 1.75,
            maxWidth: 520, margin: '0 auto 44px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
          }}>
            ThreeOneOne aggregates social signals and citizen reports to surface verified hazards — before a single 311 call is made.
          </p>

          {/* CTAs */}
          <div style={{ ...fadeStyle(240), display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => onNavigate('map')}
              style={{
                padding: '13px 30px', borderRadius: 8, border: 'none',
                background: 'var(--accent)', color: '#fff',
                fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ff6b6b'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.transform = 'none'; }}
            >
              Open Live Map →
            </button>
            <button
              onClick={() => onNavigate('report')}
              style={{
                padding: '13px 30px', borderRadius: 8,
                background: 'none', border: '1px solid var(--border2)',
                color: 'var(--text)', fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-body)',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text)'; }}
            >
              Report a Hazard
            </button>
          </div>
        </div>
      </section>

      {/* ── TICKER ── */}
      <Ticker incidents={incidents} />

      {/* ── STATS ── */}
      <div style={{ ...fadeStyle(320), display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <StatCard num={isLoadingIncidents ? '...' : incidents.length} label="Active Incidents" />
        <StatCard num={highCount} label="Critical" accent="var(--red)" />
        <StatCard num={totalReports} label="Reports Processed" />
        <StatCard num={avgCluster} label="Avg. Cluster Size" />
        <div style={{ flex: 1, padding: '20px 24px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--green)', fontWeight: 600 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
            System Online
          </div>
        </div>
      </div>

      {/* ── LIVE MAP + INCIDENT FEED ── */}
      <section style={{ padding: '80px 40px', maxWidth: 1280, margin: '0 auto', background: 'var(--bg1)', borderRadius: 12 }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 10, fontFamily: 'monospace' }}>
            Live Intelligence
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, letterSpacing: -0.7, lineHeight: 1.2 }}>
            What's happening right now
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 20, alignItems: 'start' }}>
          {/* Map */}
          <div style={{
            borderRadius: 14, overflow: 'hidden',
            border: '1px solid var(--border2)', position: 'relative',
          }}>
            {/* Live badge over map */}
            <div style={{
              position: 'absolute', top: 14, left: 14, zIndex: 500,
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)',
              border: '1px solid var(--border2)',
              borderRadius: 8, padding: '7px 12px',
              fontSize: 11, fontWeight: 700, color: 'var(--green)',
              fontFamily: 'monospace', letterSpacing: 0.5,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
              LIVE
            </div>

            {/* Legend */}
            <div style={{
              position: 'absolute', bottom: 14, left: 14, zIndex: 500,
              background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)',
              border: '1px solid var(--border2)',
              borderRadius: 8, padding: '8px 12px',
              display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              {(['high', 'medium', 'low'] as const).map(c => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: 'var(--text2)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: CONF_COLOR[c] }} />
                  {c.charAt(0).toUpperCase() + c.slice(1)} confidence
                </div>
              ))}
            </div>

            <LiveMapEmbed height={480} incidents={incidents} />
          </div>

          {/* Incident feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto' }}>
            {incidents.map((inc) => (
              <IncidentFeedCard key={inc.id} inc={inc} />
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={() => onNavigate('map')}
            style={{
              padding: '11px 28px', borderRadius: 8,
              background: 'none', border: '1px solid var(--border2)',
              color: 'var(--text2)', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)'; }}
          >
            Open full map dashboard →
          </button>
        </div>
      </section>

      {/* The pipeline section removed per request */}

      {/* ── CTA STRIP ── */}
      <section style={{ padding: '80px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          width: 600, height: 300, pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(255,68,68,0.06) 0%, transparent 70%)',
        }} />
        <div style={{ position: 'relative', maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 700, letterSpacing: -0.8, lineHeight: 1.18, marginBottom: 16 }}>
            See a hazard?<br /><span style={{ color: 'var(--accent)' }}>Report it.</span>
          </h2>
          <p style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 32, lineHeight: 1.7 }}>
            Every report you submit is instantly analyzed and may trigger an alert to city responders. Your voice matters — anonymously.
          </p>
          <button
            onClick={() => onNavigate('report')}
            style={{
              padding: '14px 36px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#000',
              fontWeight: 700, fontSize: 15, fontFamily: 'var(--font-body)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#ff7777'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.transform = 'none'; }}
          >
            Submit a Report
          </button>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{
        padding: '24px 40px', background: 'var(--bg1)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 12, color: 'var(--text3)',
      }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--text2)' }}>ThreeOneOne</span>
        <span>Real-time hazard detection for modern cities</span>
        <span style={{ fontFamily: 'monospace' }}>v0.1.0-beta</span>
      </footer>
    </div>
  );
}