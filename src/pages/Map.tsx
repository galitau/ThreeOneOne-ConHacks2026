import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  CircleDot,
  Flame,
  MapPin,
  Search,
  TreePine,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { MOCK_INCIDENTS } from '../data/incidents';
import type { Confidence, Incident } from '../data/incidents';
import LiveMapEmbed from '../components/LiveMapEmbed';

type FilterKey = 'All' | 'Flooding' | 'Fallen Tree' | 'Power Line' | 'Traffic' | 'Other';

const FILTERS: FilterKey[] = ['All', 'Flooding', 'Fallen Tree', 'Power Line', 'Traffic', 'Other'];
const INCIDENT_DATE = '04/29/2026';
const FILTER_HAZARD_TYPE: Record<Exclude<FilterKey, 'All' | 'Other'>, string> = {
  Flooding: 'Flooding',
  'Fallen Tree': 'Fallen Tree',
  'Power Line': 'Downed Power Line',
  Traffic: 'Traffic Hazard',
};

const statusColor: Record<Confidence, string> = {
  high: 'var(--status-high)',
  medium: 'var(--status-medium)',
  low: 'var(--status-low)',
};

const statusTint: Record<Confidence, string> = {
  high: 'rgba(239, 68, 68, 0.24)',
  medium: 'rgba(245, 158, 11, 0.24)',
  low: 'rgba(107, 114, 128, 0.28)',
};

const getFilterKey = (incident: Incident): FilterKey => {
  if (incident.type === 'Flooding') return 'Flooding';
  if (incident.type === 'Fallen Tree') return 'Fallen Tree';
  if (incident.type === 'Downed Power Line') return 'Power Line';
  if (incident.type === 'Traffic Hazard') return 'Traffic';
  return 'Other';
};

const getHazardIcon = (incident: Incident): LucideIcon => {
  if (incident.type === 'Flooding') return Waves;
  if (incident.type === 'Fallen Tree') return TreePine;
  if (incident.type === 'Downed Power Line') return Zap;
  if (incident.type === 'Traffic Hazard') return AlertTriangle;
  if (incident.type === 'Fire') return Flame;
  if (incident.type === 'Road Damage') return CircleDot;
  return AlertCircle;
};

export default function MapPage() {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);
  const [selectedHazardType, setSelectedHazardType] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const [viewRequest, setViewRequest] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const closeTimerRef = useRef<number | null>(null);

  const chipCounts = FILTERS.reduce<Record<FilterKey, number>>((acc, filter) => {
    acc[filter] = filter === 'All'
      ? MOCK_INCIDENTS.length
      : MOCK_INCIDENTS.filter((incident) => getFilterKey(incident) === filter).length;
    return acc;
  }, {
    All: 0,
    Flooding: 0,
    'Fallen Tree': 0,
    'Power Line': 0,
    Traffic: 0,
    Other: 0,
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleIncidents = MOCK_INCIDENTS.filter((incident) => {
    const matchesFilter = !selectedHazardType
      || (selectedHazardType === 'Other'
        ? getFilterKey(incident) === 'Other'
        : incident.type === selectedHazardType);
    const matchesSearch = !normalizedSearch
      || incident.type.toLowerCase().includes(normalizedSearch)
      || incident.desc.toLowerCase().includes(normalizedSearch);
    return matchesFilter && matchesSearch;
  });

  const selectIncident = useCallback((incident: Incident) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setSelectedIncident(incident);
    setSelectedHazardType(incident.type);
    setDetailPanelOpen(false);
    setFocusRequest((request) => request + 1);
    setViewRequest((request) => request + 1);

    window.setTimeout(() => {
      setDetailPanelOpen(true);
    }, 20);
  }, []);

  const closeDetailPanel = useCallback(() => {
    setDetailPanelOpen(false);
    setSelectedHazardType(null);
    setViewRequest((request) => request + 1);

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    closeTimerRef.current = window.setTimeout(() => {
      setSelectedIncident(null);
      closeTimerRef.current = null;
    }, 250);
  }, []);

  const selectFilter = (filter: FilterKey) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    setDetailPanelOpen(false);
    setSelectedIncident(null);

    if (filter === 'All') {
      setSelectedHazardType(null);
      setViewRequest((request) => request + 1);
      return;
    }

    if (filter === 'Other') {
      setSelectedHazardType('Other');
      setViewRequest((request) => request + 1);
      return;
    }

    setSelectedHazardType(FILTER_HAZARD_TYPE[filter]);
    setViewRequest((request) => request + 1);
  };

  const getActiveFilter = (): FilterKey => {
    if (!selectedHazardType) return 'All';
    if (selectedHazardType === 'Other') return 'Other';

    const incidentForType = MOCK_INCIDENTS.find((incident) => incident.type === selectedHazardType);
    return incidentForType ? getFilterKey(incidentForType) : 'Other';
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetailPanel();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, [closeDetailPanel]);

  const IncidentRow = ({ inc, active }: { inc: Incident; active: boolean }) => {
    const Icon = getHazardIcon(inc);
    const color = statusColor[inc.conf];

    return (
      <button
        onClick={() => selectIncident(inc)}
        style={{
          width: '100%',
          padding: '13px 13px 13px 12px',
          background: active ? 'rgba(6, 182, 212, 0.08)' : 'var(--bg-card)',
          border: active ? '1px solid var(--accent-cyan)' : '1px solid var(--border)',
          borderLeft: `3px solid ${color}`,
          borderRadius: 10,
          boxShadow: active ? '0 0 0 1px rgba(6, 182, 212, 0.12), 0 14px 34px rgba(6, 182, 212, 0.12)' : 'none',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 160ms var(--ease), border-color 160ms var(--ease), box-shadow 160ms var(--ease), transform 160ms var(--ease)',
        }}
        onMouseEnter={(event) => {
          if (!active) event.currentTarget.style.background = 'var(--bg-card-hover)';
        }}
        onMouseLeave={(event) => {
          if (!active) event.currentTarget.style.background = 'var(--bg-card)';
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.04)',
            display: 'grid',
            placeItems: 'center',
            color,
            flex: '0 0 auto',
          }}>
            <Icon size={18} strokeWidth={2.2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{inc.type}</div>
            <div style={{
              color: 'var(--text-secondary)',
              fontSize: 12,
              lineHeight: 1.35,
              marginTop: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {inc.desc}
            </div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, marginTop: 9 }}>
              {inc.reports} reports · {inc.time}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const FieldBlock = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: 'var(--text-primary)', fontSize: 16, lineHeight: 1.45, marginTop: 6 }}>
        {children}
      </div>
    </div>
  );

  const DetailPanel = ({ incident, open }: { incident: Incident; open: boolean }) => {
    const color = statusColor[incident.conf];

    return (
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 380,
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        boxShadow: '16px 0 34px rgba(0, 0, 0, 0.32)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 250ms ease-out',
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          height: 80,
          background: statusTint[incident.conf],
          borderBottom: '1px solid var(--border)',
          display: 'grid',
          gridTemplateColumns: '44px minmax(0, 1fr) 44px',
          alignItems: 'center',
          padding: '0 14px',
        }}>
          <button
            aria-label="Close incident details"
            onClick={closeDetailPanel}
            style={{
              width: 34,
              height: 34,
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 9,
              background: 'rgba(10, 14, 26, 0.26)',
              color: 'var(--text-primary)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <ChevronLeft size={19} />
          </button>
          <div style={{
            color: 'var(--text-primary)',
            fontSize: 17,
            fontWeight: 800,
            overflow: 'hidden',
            textAlign: 'center',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {incident.type}
          </div>
          <div style={{
            justifySelf: 'end',
            width: 34,
            height: 34,
            borderRadius: 9,
            background: 'rgba(10, 14, 26, 0.26)',
            color,
            display: 'grid',
            placeItems: 'center',
          }}>
            <MapPin size={18} />
          </div>
        </div>

        <div style={{
          color: 'var(--text-secondary)',
          fontSize: 13,
          borderBottom: '1px solid var(--border)',
          padding: '13px 20px',
        }}>
          {INCIDENT_DATE} · {incident.time}
        </div>

        <div style={{
          overflowY: 'auto',
          padding: '22px 20px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}>
          <FieldBlock label="Name">
            {INCIDENT_DATE} {incident.type}
          </FieldBlock>

          <FieldBlock label="Description">
            {incident.desc}
          </FieldBlock>

          <FieldBlock label="Confidence">
            <div style={{ color, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {incident.conf} · {incident.score}%
            </div>
            <div style={{ height: 5, background: '#0B1020', borderRadius: 999, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ width: `${incident.score}%`, height: '100%', background: color, borderRadius: 999 }} />
            </div>
          </FieldBlock>

          <FieldBlock label="Reports">
            {incident.reports} active reports
          </FieldBlock>

          <FieldBlock label="Sources">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {incident.sources.map((source) => (
                <span
                  key={source}
                  style={{
                    color: 'var(--text-secondary)',
                    background: '#0B1020',
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {source}
                </span>
              ))}
            </div>
          </FieldBlock>

          <FieldBlock label="Location">
            {incident.lat.toFixed(4)}, {incident.lng.toFixed(4)}
          </FieldBlock>

          <FieldBlock label="Status">
            <span style={{ color, fontWeight: 800 }}>Active</span>
          </FieldBlock>
        </div>
      </div>
    );
  };

  const MapDismissLayer = ({ onDismiss }: { onDismiss: () => void }) => (
    <div
      aria-hidden="true"
      onClick={onDismiss}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 380,
        zIndex: 4,
        background: 'transparent',
      }}
    />
  );

  return (
    <div
      style={{
        '--bg-primary': '#0A0E1A',
        '--bg-card': '#121826',
        '--bg-card-hover': '#1A2233',
        '--border': '#1F2937',
        '--text-primary': '#F3F4F6',
        '--text-secondary': '#9CA3AF',
        '--text-tertiary': '#6B7280',
        '--accent-cyan': '#06B6D4',
        '--status-high': '#EF4444',
        '--status-medium': '#F59E0B',
        '--status-low': '#6B7280',
        paddingTop: 56,
        minHeight: '100vh',
        background: 'var(--bg-primary)',
      } as React.CSSProperties}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', height: 'calc(100vh - 56px)', minHeight: 620 }}>
        <aside style={{
          background: 'var(--bg-primary)',
          borderRight: '1px solid var(--border)',
          padding: 18,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}>
          <label style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '0 12px',
            height: 44,
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            color: 'var(--text-tertiary)',
          }}>
            <Search size={16} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search incidents..."
              style={{
                width: '100%',
                minWidth: 0,
                background: 'transparent',
                border: 0,
                outline: 0,
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
          </label>

          <div style={{ position: 'relative' }}>
            <div className="scrollbar-hide" style={{
              display: 'flex',
              flexWrap: 'nowrap',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 8,
            }}>
              {FILTERS.map((filter) => {
                const active = filter === getActiveFilter();

                return (
                  <button
                    key={filter}
                    onClick={() => selectFilter(filter)}
                    style={{
                      flex: '0 0 auto',
                      border: `1px solid ${active ? 'var(--accent-cyan)' : 'var(--border)'}`,
                      borderRadius: 999,
                      background: active ? 'rgba(6, 182, 212, 0.08)' : 'transparent',
                      color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      padding: '7px 10px',
                      fontSize: 12,
                      fontWeight: 800,
                    }}
                  >
                    {filter} <span style={{ color: active ? 'var(--accent-cyan)' : 'var(--text-tertiary)', marginLeft: 3 }}>{chipCounts[filter]}</span>
                  </button>
                );
              })}
            </div>
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 8,
                width: 24,
                pointerEvents: 'none',
                background: 'linear-gradient(90deg, rgba(10, 14, 26, 0), var(--bg-primary))',
              }}
            />
          </div>

          <section style={{ minHeight: 0 }}>
            <div style={{ color: 'var(--text-tertiary)', fontSize: 11, fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 10 }}>
              Incidents ({visibleIncidents.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleIncidents.map(inc => (
                <IncidentRow key={inc.id} inc={inc} active={inc.id === selectedIncident?.id} />
              ))}
            </div>
          </section>
        </aside>

        <div style={{ background: '#000', position: 'relative', minWidth: 0 }}>
          <LiveMapEmbed
            height="100%"
            focusIncident={selectedIncident}
            focusRequest={focusRequest}
            selectedHazardType={selectedHazardType}
            viewRequest={viewRequest}
            onIncidentClick={selectIncident}
            onMapClick={closeDetailPanel}
          />
          {selectedIncident ? (
            <>
              <MapDismissLayer onDismiss={closeDetailPanel} />
              <DetailPanel incident={selectedIncident} open={detailPanelOpen} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
