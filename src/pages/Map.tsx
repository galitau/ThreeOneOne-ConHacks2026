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

type IncidentStatus = 'active' | 'in progress' | 'completed';

type TrackedIncident = Incident & {
  status: IncidentStatus;
  photoUrl?: string;
  imageUrl?: string;
  images?: string[];
};

type FilterKey =
  | 'All'
  | 'Flooding'
  | 'Fallen Tree'
  | 'Road Damage'
  | 'Traffic Hazard'
  | 'Downed Power Line'
  | 'Structural Damage'
  | 'Fire'
  | 'Pothole'
  | 'Other';

const FILTERS: FilterKey[] = [
  'All',
  'Flooding',
  'Fallen Tree',
  'Road Damage',
  'Traffic Hazard',
  'Downed Power Line',
  'Structural Damage',
  'Fire',
  'Pothole',
  'Other',
];

const INCIDENT_DATE = '04/29/2026';

const FILTER_HAZARD_TYPE: Record<Exclude<FilterKey, 'All' | 'Other'>, string> = {
  Flooding: 'Flooding',
  'Fallen Tree': 'Fallen Tree',
  'Road Damage': 'Road Damage',
  'Traffic Hazard': 'Traffic Hazard',
  'Downed Power Line': 'Downed Power Line',
  'Structural Damage': 'Structural Damage',
  Fire: 'Fire',
  Pothole: 'Pothole',
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

const getIncidentPhotoUrl = (incident: TrackedIncident) => {
  return incident.photoUrl || incident.imageUrl || incident.images?.[0] || null;
};

const getFilterKey = (incident: Incident): FilterKey => {
  if (incident.type === 'Flooding') return 'Flooding';
  if (incident.type === 'Fallen Tree') return 'Fallen Tree';
  if (incident.type === 'Road Damage') return 'Road Damage';
  if (incident.type === 'Traffic Hazard') return 'Traffic Hazard';
  if (incident.type === 'Downed Power Line') return 'Downed Power Line';
  if (incident.type === 'Structural Damage') return 'Structural Damage';
  if (incident.type === 'Fire') return 'Fire';
  if (incident.type === 'Pothole') return 'Pothole';
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

const normalizeTrackedIncident = (incident: Incident | TrackedIncident): TrackedIncident => (
  'status' in incident
    ? incident
    : {
        ...incident,
        status: 'active',
      }
);

interface MapUiState {
  selectedIncident: TrackedIncident | null;
  panelIncident: TrackedIncident | null;
  detailPanelOpen: boolean;
  selectedHazardType: string | null;
}

const validateAndDeduplicateIncidents = (incidents: Incident[]): Incident[] => {
  const seenKeys = new Map<string, Incident>();
  const duplicateKeys: string[] = [];

  for (const incident of incidents) {
    const signalId = typeof (incident as Incident & { signalId?: number }).signalId === 'number'
      ? (incident as Incident & { signalId?: number }).signalId
      : null;

    const dedupeKey = signalId == null ? `id:${incident.id}` : `signal:${signalId}`;

    if (seenKeys.has(dedupeKey)) {
      duplicateKeys.push(dedupeKey);
    } else {
      seenKeys.set(dedupeKey, incident);
    }
  }

  if (duplicateKeys.length > 0) {
    console.warn(
      `[Map] Found ${duplicateKeys.length} duplicate verified signal(s) in database: ${duplicateKeys.join(', ')}. ` +
      `These duplicates have been removed and only the first occurrence of each signal was kept.`
    );
  }

  return Array.from(seenKeys.values());
};

const fetchVerifiedHazards = async (): Promise<Incident[]> => {
  try {
    const response = await fetch('/api/verified-hazards');

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}`);
    }

    const data = await response.json();
    const incidents: Incident[] = data.incidents || [];
    const deduplicated = validateAndDeduplicateIncidents(incidents);

    console.log(`[Map] Loaded ${deduplicated.length} verified incidents from database`);
    return deduplicated;
  } catch (error) {
    console.error('[Map] Failed to fetch verified hazards from API, falling back to mock data:', error);
    return MOCK_INCIDENTS;
  }
};

export default function MapPage() {
  const [incidents, setIncidents] = useState<TrackedIncident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ui, setUi] = useState<MapUiState>({
    selectedIncident: null,
    panelIncident: null,
    detailPanelOpen: false,
    selectedHazardType: null,
  });
  const [viewRequest, setViewRequest] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadHazards = async () => {
      setIsLoading(true);
      const fetchedIncidents = await fetchVerifiedHazards();

      if (isMounted) {
        const trackedIncidents = fetchedIncidents.map((incident) => ({
          ...incident,
          status: 'active' as IncidentStatus,
        }));

        setIncidents(trackedIncidents);
        setIsLoading(false);
      }
    };

    loadHazards();

    return () => {
      isMounted = false;
    };
  }, []);

  const chipCounts = FILTERS.reduce<Record<FilterKey, number>>((acc, filter) => {
    acc[filter] = filter === 'All'
      ? incidents.length
      : incidents.filter((incident) => getFilterKey(incident) === filter).length;
    return acc;
  }, {
    All: 0,
    Flooding: 0,
    'Fallen Tree': 0,
    'Road Damage': 0,
    'Traffic Hazard': 0,
    'Downed Power Line': 0,
    'Structural Damage': 0,
    Fire: 0,
    Pothole: 0,
    Other: 0,
  });

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const visibleIncidents = incidents.filter((incident) => {
    const matchesFilter = !ui.selectedHazardType
      || (ui.selectedHazardType === 'Other'
        ? getFilterKey(incident) === 'Other'
        : incident.type === ui.selectedHazardType);

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

    const trackedIncident = normalizeTrackedIncident(incident);

    setUi({
      selectedIncident: trackedIncident,
      panelIncident: trackedIncident,
      detailPanelOpen: true,
      selectedHazardType: trackedIncident.type,
    });

    setViewRequest((request) => request + 1);
  }, []);

  const updateIncidentStatus = useCallback((incidentId: number, status: IncidentStatus) => {
    if (status === 'completed') {
      const confirmed = window.confirm('Delete this location? This cannot be undone.');
      if (!confirmed) return;

      setIncidents((current) => current.filter((incident) => incident.id !== incidentId));

      setUi((current) => ({
        ...current,
        selectedIncident: current.selectedIncident?.id === incidentId ? null : current.selectedIncident,
        panelIncident: current.panelIncident?.id === incidentId ? null : current.panelIncident,
        detailPanelOpen: current.panelIncident?.id === incidentId ? false : current.detailPanelOpen,
      }));

      setViewRequest((request) => request + 1);
      return;
    }

    setIncidents((current) => current.map((incident) => (
      incident.id === incidentId ? { ...incident, status } : incident
    )));

    setUi((current) => ({
      ...current,
      selectedIncident: current.selectedIncident?.id === incidentId
        ? { ...current.selectedIncident, status }
        : current.selectedIncident,
      panelIncident: current.panelIncident?.id === incidentId
        ? { ...current.panelIncident, status }
        : current.panelIncident,
    }));
  }, []);

  const closeIncidentView = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }

    setUi((current) => ({
      selectedIncident: null,
      panelIncident: current.panelIncident,
      detailPanelOpen: false,
      selectedHazardType: null,
    }));
  }, []);

  const selectFilter = (filter: FilterKey) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (filter === 'All') {
      closeIncidentView();
      return;
    }

    const nextHazardType = filter === 'Other' ? 'Other' : FILTER_HAZARD_TYPE[filter];

    setUi({
      selectedIncident: null,
      panelIncident: null,
      detailPanelOpen: false,
      selectedHazardType: nextHazardType,
    });

    setViewRequest((request) => request + 1);
  };

  const getActiveFilter = (): FilterKey => {
    if (!ui.selectedHazardType) return 'All';
    if (ui.selectedHazardType === 'Other') return 'Other';

    const incidentForType = incidents.find((incident) => incident.type === ui.selectedHazardType);
    return incidentForType ? getFilterKey(incidentForType) : 'Other';
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeIncidentView();
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);

      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, [closeIncidentView]);

  const IncidentRow = ({ inc, active }: { inc: TrackedIncident; active: boolean }) => {
    const Icon = getHazardIcon(inc);
    const color = statusColor[inc.conf];

    return (
      <button
        onClick={() => selectIncident(inc)}
        style={{
          width: '100%',
          padding: '13px 13px 13px 12px',
          background: active ? 'rgba(255, 68, 68, 0.06)' : 'var(--bg-card)',
          border: active ? '1px solid var(--accent-cyan)' : '1px solid var(--border)',
          borderLeft: `3px solid ${color}`,
          borderRadius: 10,
          boxShadow: active ? '0 0 0 1px rgba(255, 68, 68, 0.10), 0 14px 34px rgba(255, 68, 68, 0.06)' : 'none',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'none',
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
            <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>
              {inc.type}
            </div>

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
      <div style={{
        color: 'var(--text-tertiary)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
      }}>
        {label}
      </div>

      <div style={{
        color: 'var(--text-primary)',
        fontSize: 16,
        lineHeight: 1.45,
        marginTop: 6,
      }}>
        {children}
      </div>
    </div>
  );

  const DetailPanel = ({
    incident,
    open,
    onAfterClose,
  }: {
    incident: TrackedIncident;
    open: boolean;
    onAfterClose?: () => void;
  }) => {
    const color = statusColor[incident.conf];
    const photoUrl = getIncidentPhotoUrl(incident);

    return (
      <div
        style={{
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
        }}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'transform' && !open) {
            onAfterClose?.();
          }
        }}
      >
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
            onClick={closeIncidentView}
            style={{
              width: 34,
              height: 34,
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: 9,
              background: 'rgba(15, 23, 42, 0.04)',
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
            background: 'rgba(15, 23, 42, 0.04)',
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

          <FieldBlock label="Photo">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`${incident.type} incident`}
                style={{
                  width: '100%',
                  height: 180,
                  objectFit: 'cover',
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  display: 'block',
                }}
              />
            ) : (
              <div style={{
                height: 140,
                borderRadius: 12,
                border: '1px dashed var(--border)',
                background: 'var(--bg-card-hover)',
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
              }}>
                No photo available
              </div>
            )}
          </FieldBlock>

          <FieldBlock label="Description">
            {incident.desc}
          </FieldBlock>

          <FieldBlock label="Confidence">
            <div style={{ color, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              {incident.conf} · {incident.score}%
            </div>

            <div style={{
              height: 5,
              background: '#0B1020',
              borderRadius: 999,
              overflow: 'hidden',
              marginTop: 10,
            }}>
              <div style={{
                width: `${incident.score}%`,
                height: '100%',
                background: color,
                borderRadius: 999,
              }} />
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
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
            }}>
              {([
                { value: 'active' as const, label: 'Active', accent: '#ef4444' },
                { value: 'in progress' as const, label: 'In Progress', accent: '#f59e0b' },
                { value: 'completed' as const, label: 'Completed', accent: '#16a34a' },
              ]).map((option) => {
                const isSelected = incident.status === option.value;

                return (
                  <button
                    key={option.value}
                    onClick={() => updateIncidentStatus(incident.id, option.value)}
                    style={{
                      border: `1px solid ${isSelected ? option.accent : 'var(--border)'}`,
                      background: isSelected ? `${option.accent}12` : 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      borderRadius: 10,
                      padding: '10px 8px',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div style={{
              marginTop: 8,
              color,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
            }}>
              Current: {incident.status}
            </div>

            <div style={{
              marginTop: 6,
              color: 'var(--text-tertiary)',
              fontSize: 12,
              lineHeight: 1.4,
            }}>
              Choosing Completed will remove this location after confirmation.
            </div>
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
        '--bg-primary': '#F7F9FB',
        '--bg-card': '#FFFFFF',
        '--bg-card-hover': '#F3F6F9',
        '--border': '#E6E9EE',
        '--text-primary': '#0B1020',
        '--text-secondary': '#6B7280',
        '--text-tertiary': '#9CA3AF',
        '--accent-cyan': 'var(--accent)',
        '--status-high': '#EF4444',
        '--status-medium': '#F59E0B',
        '--status-low': '#6B7280',
        paddingTop: 56,
        minHeight: '100vh',
        background: 'var(--bg-primary)',
      } as React.CSSProperties}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '340px minmax(0, 1fr)',
        height: 'calc(100vh - 56px)',
        minHeight: 620,
      }}>
        <aside style={{
          position: 'relative',
          zIndex: 3,
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
                const primaryGroupEnd = filter === 'Traffic Hazard';

                return (
                  <button
                    key={filter}
                    onClick={() => selectFilter(filter)}
                    style={{
                      flex: '0 0 auto',
                      border: `1px solid ${active ? 'var(--accent-cyan)' : 'var(--border)'}`,
                      borderRadius: 999,
                      background: active ? 'rgba(255, 68, 68, 0.06)' : 'transparent',
                      color: active ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      padding: '7px 10px',
                      fontSize: 12,
                      fontWeight: 800,
                      marginRight: primaryGroupEnd ? 8 : 0,
                    }}
                  >
                    {filter}{' '}
                    <span style={{
                      color: active ? 'var(--accent-cyan)' : 'var(--text-tertiary)',
                      marginLeft: 3,
                    }}>
                      {chipCounts[filter]}
                    </span>
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
                background: 'linear-gradient(90deg, rgba(255, 255, 255, 0), var(--bg-primary))',
              }}
            />
          </div>

          <section style={{ minHeight: 0 }}>
            <div style={{
              color: 'var(--text-tertiary)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.9,
              textTransform: 'uppercase',
              marginBottom: 10,
            }}>
              Incidents ({isLoading ? 'Loading...' : visibleIncidents.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visibleIncidents.map((inc) => (
                <IncidentRow
                  key={inc.id}
                  inc={inc}
                  active={inc.id === ui.selectedIncident?.id}
                />
              ))}
            </div>
          </section>
        </aside>

        <div style={{
          background: 'var(--bg-primary)',
          position: 'relative',
          minWidth: 0,
          zIndex: 0,
        }}>
          <LiveMapEmbed
            height="100%"
            incidents={incidents}
            selectedHazardType={ui.selectedHazardType}
            viewRequest={viewRequest}
            focusIncidentId={ui.selectedIncident?.id ?? null}
            onIncidentClick={selectIncident}
            onMapClick={closeIncidentView}
          />

          {ui.panelIncident ? (
            <>
              {ui.detailPanelOpen ? <MapDismissLayer onDismiss={closeIncidentView} /> : null}

              <DetailPanel
                incident={ui.panelIncident}
                open={ui.detailPanelOpen}
                onAfterClose={() => {
                  setUi((current) => ({ ...current, panelIncident: null }));
                  setViewRequest((request) => request + 1);
                }}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}