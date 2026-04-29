import { useState, useMemo } from 'react';
import { MOCK_INCIDENTS } from '../data/incidents';
import type { Incident } from '../data/incidents';
import LiveMapEmbed from '../components/LiveMapEmbed';

export default function MapPage() {
  const [selectedIncident, setSelectedIncident] = useState<Incident>(MOCK_INCIDENTS[0]);

  const stats = useMemo(() => ({
    total: MOCK_INCIDENTS.length,
    critical: MOCK_INCIDENTS.filter(i => i.conf === 'high').length,
    reports: MOCK_INCIDENTS.reduce((sum, i) => sum + i.reports, 0),
    withImages: MOCK_INCIDENTS.filter(i => i.hasImage).length,
  }), []);

  const StatCard = ({ label, value }: { label: string; value: number }) => (
    <div style={{
      padding: '12px 16px',
      background: 'var(--bg1)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
    </div>
  );

  const IncidentRow = ({ inc, active }: { inc: Incident; active: boolean }) => (
    <button
      onClick={() => setSelectedIncident(inc)}
      style={{
        width: '100%',
        padding: '12px',
        background: active ? 'var(--bg1)' : 'transparent',
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 6,
        cursor: 'pointer',
        textAlign: 'left',
        marginBottom: 8,
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 18 }}>{inc.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{inc.type}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{inc.desc}</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
            {inc.reports} reports · {inc.time}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <div style={{ paddingTop: 56, minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>Live map</div>
            <h1 style={{ fontSize: 32, fontWeight: 700, margin: '8px 0 0' }}>Active incidents in real time</h1>
            <p style={{ fontSize: 14, color: 'var(--text2)', margin: '8px 0 0' }}>
              Track verified reports, inspect incident details, and jump between hazards without leaving the map.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{
              padding: '8px 16px',
              background: 'var(--bg1)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text)',
            }}>
              Back home
            </button>
            <button style={{
              padding: '8px 16px',
              background: 'var(--accent)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontWeight: 600,
            }}>
              Report hazard
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <StatCard label="Incidents" value={stats.total} />
          <StatCard label="Critical" value={stats.critical} />
          <StatCard label="Reports" value={stats.reports} />
          <StatCard label="With images" value={stats.withImages} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 0, minHeight: 'calc(100vh - 280px)' }}>
        {/* Map */}
        <div style={{ background: '#000', borderRight: '1px solid var(--border)', position: 'relative' }}>
          <LiveMapEmbed height={1000} onIncidentClick={setSelectedIncident} />
        </div>

        {/* Sidebar */}
        <div style={{ padding: '16px', overflowY: 'auto', background: 'var(--bg)' }}>
          {/* Selected incident */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Selected incident
            </div>
            <div style={{
              padding: 12,
              background: 'var(--bg1)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <div style={{ fontSize: 28 }}>{selectedIncident.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{selectedIncident.type}</div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                    {selectedIncident.time} · {selectedIncident.conf.toUpperCase()} confidence
                  </div>
                </div>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, margin: 0 }}>
                {selectedIncident.desc}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>Reports</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{selectedIncident.reports}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text2)' }}>Score</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{selectedIncident.score}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Incident list */}
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
              Incident list
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {MOCK_INCIDENTS.map(inc => (
                <IncidentRow key={inc.id} inc={inc} active={inc.id === selectedIncident.id} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
