import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, MapPin, XCircle } from 'lucide-react';
import LiveMapEmbed from '../components/LiveMapEmbed';

type ReportView = 'form' | 'loading' | 'result' | 'error';
type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';

interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  label?: string;
}

interface ReportLocation {
  lat: number;
  lon: number;
}

interface JoinedIncident {
  id?: string | number;
  hazard_type?: string;
  type?: string;
  confidence?: number;
  confidence_score?: number;
  confidence_tier?: ConfidenceTier | string;
  report_count?: number;
  bounding_boxes?: BoundingBox[];
  image?: {
    bounding_boxes?: BoundingBox[];
  };
  location?: ReportLocation;
  description?: string;
  image_name?: string;
}

interface Classification {
  hazard_type?: string;
  confidence?: number;
  summary?: string;
}

type ReportResponse =
  | { status: 'joined_incident'; incident: JoinedIncident }
  | { status: 'no_hazard_detected'; classification: Classification };

interface ReportForm {
  description: string;
  image: File | null;
}

interface ReportProps {
  onNavigate: (page: string) => void;
}

const loadingMessages = [
  'Reading your report...',
  'Classifying with AI vision...',
  'Checking for similar reports nearby...',
  'Almost done...',
];

const formatHazard = (value?: string) => {
  if (!value) return 'Hazard';
  return value
    .replace(/[_-]/g, ' ')
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
};

const getTier = (incident: JoinedIncident): ConfidenceTier => {
  const rawTier = incident.confidence_tier?.toUpperCase();
  if (rawTier === 'HIGH' || rawTier === 'MEDIUM' || rawTier === 'LOW') return rawTier;

  const confidence = getConfidence(incident);
  if (confidence >= 70) return 'HIGH';
  if (confidence >= 40) return 'MEDIUM';
  return 'LOW';
};

const getConfidence = (incident: JoinedIncident) => {
  const raw = incident.confidence_score ?? incident.confidence ?? 0;
  return raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
};

const tierColor = (tier: ConfidenceTier) => {
  if (tier === 'HIGH') return 'var(--accent-red)';
  if (tier === 'MEDIUM') return 'var(--accent-amber)';
  return '#6B7280';
};

function ResultShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(10, 10, 10, 0.08)',
      padding: 24,
      animation: 'report-slide-in 300ms ease-out both',
    }}>
      {children}
    </div>
  );
}

export default function Report({ onNavigate }: ReportProps) {
  const [view, setView] = useState<ReportView>('form');
  const [form, setForm] = useState<ReportForm>({ description: '', image: null });
  const [lat, setLat] = useState(43.6532);
  const [lon, setLon] = useState(-79.3832);
  const [response, setResponse] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const imagePreview = useMemo(() => form.image ? URL.createObjectURL(form.image) : null, [form.image]);
  const reportLocation = useMemo(() => ({ lat, lon }), [lat, lon]);

  useEffect(() => {
    if (view !== 'loading') return;

    const interval = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % loadingMessages.length);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [view]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const resetForm = () => {
    setForm({ description: '', image: null });
    setResponse(null);
    setError(null);
    setImageError(null);
    setView('form');
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLon(position.coords.longitude);
      },
      (err) => {
        console.error('[ReportForm] Geolocation failed:', err);
        setError(err.message);
      }
    );
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!form.image) {
      setImageError('Photo is required.');
      return;
    }

    console.log('[ReportForm] Submitting...');
    console.log('[ReportForm] Description:', form.description);
    console.log('[ReportForm] Lat/Lon:', lat, lon);
    console.log('[ReportForm] Image:', form.image);

    setMessageIndex(0);
    setView('loading');
    setResponse(null);
    setError(null);
    setImageError(null);

    const formData = new FormData();
    formData.append('description', form.description);
    formData.append('lat', String(lat));
    formData.append('lon', String(lon));
    if (form.image) formData.append('image', form.image);

    const url = '/api/reports';
    console.log('[ReportForm] POSTing to:', url);

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      console.log('[ReportForm] Status:', res.status);
      console.log('[ReportForm] Status text:', res.statusText);

      const text = await res.text();
      console.log('[ReportForm] Raw response body:', text);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = JSON.parse(text) as ReportResponse;
      console.log('[ReportForm] Parsed response:', data);
      setResponse(data);
      setView('result');
    } catch (err) {
      console.error('[ReportForm] FAILED:', err);
      setError(err instanceof Error ? err.message : String(err));
      setView('error');
    }
  };

  const renderForm = () => (
    <form onSubmit={submitReport} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      animation: view === 'form' ? 'report-slide-in 300ms ease-out both' : 'report-slide-out 300ms ease-out both',
    }}>
      <div>
        <div style={{ color: 'var(--accent-red)', fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
          Report hazard
        </div>
        <h1 style={{ color: 'var(--text-primary)', fontSize: 32, lineHeight: 1.15, marginBottom: 10 }}>
          Report a problem nearby
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
          Describe the issue, set its location on the map, and attach a photo so it can be reviewed.
        </p>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>Description</span>
        <textarea
          required
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="Example: Large tree blocking the right lane near the intersection."
          rows={5}
          style={{
            resize: 'vertical',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 12,
            color: 'var(--text-primary)',
            background: '#fff',
            font: 'inherit',
            outlineColor: 'var(--accent-red)',
          }}
        />
      </label>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>Location</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>
              Click or drag the pin on the map to set the location
            </div>
            <div style={{ color: '#6B7280', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12, marginTop: 6 }}>
              {lat.toFixed(4)}, {lon.toFixed(4)}
            </div>
          </div>
          <button
            type="button"
            onClick={handleUseMyLocation}
            style={{
              border: 0,
              borderRadius: 999,
              padding: '8px 12px',
              background: '#FEF2F2',
              color: '#EF4444',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 13,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            <MapPin size={15} />
            Use my location
          </button>
        </div>
      </div>

      <label style={{
        border: imageError ? '1px dashed var(--accent-red)' : '1px dashed var(--border)',
        borderRadius: 12,
        padding: 16,
        background: 'var(--bg-card)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}>
        <ImagePlus size={22} color="var(--accent-red)" />
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>
            {form.image ? form.image.name : 'Required photo'}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Add a clear photo of the issue before submitting.</div>
          {imageError ? (
            <div role="alert" style={{ color: 'var(--accent-red)', fontSize: 12, fontWeight: 700, marginTop: 6 }}>
              {imageError}
            </div>
          ) : null}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const image = event.target.files?.[0] ?? null;
            setForm((current) => ({ ...current, image }));
            setImageError(image ? null : 'Photo is required.');
          }}
          style={{ display: 'none' }}
        />
      </label>

      <button type="submit" style={{
        border: 0,
        borderRadius: 10,
        padding: '13px 16px',
        background: 'var(--accent-red)',
        color: '#fff',
        fontWeight: 800,
        fontSize: 14,
      }}>
        Submit report
      </button>
    </form>
  );

  const renderLoading = () => (
    <div style={{
      minHeight: 420,
      display: 'grid',
      placeItems: 'center',
      animation: 'report-slide-in 300ms ease-out both',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: 'var(--accent-red)',
          opacity: 0.2,
          margin: '0 auto 18px',
          animation: 'report-pulse 1.5s ease-in-out infinite',
        }} />
        <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{loadingMessages[messageIndex]}</div>
      </div>
    </div>
  );

  const renderJoinedIncident = (incident: JoinedIncident) => {
    const hazard = formatHazard(incident.hazard_type ?? incident.type);
    const confidence = getConfidence(incident);
    const tier = getTier(incident);
    const color = tierColor(tier);
    const boxes = incident.bounding_boxes ?? incident.image?.bounding_boxes ?? [];
    const reportCount = incident.report_count ?? 1;

    return (
      <ResultShell>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-green)', fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
          <CheckCircle2 size={18} /> Report received
        </div>
        <h2 style={{ color: 'var(--text-primary)', fontSize: 26, lineHeight: 1.2, marginBottom: 18 }}>
          AI detected: {hazard}
        </h2>

        <div style={{ height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden' }}>
          <div style={{ width: `${confidence}%`, height: '100%', background: color }} />
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 8, marginBottom: 18 }}>
          {tier} · {confidence}%
        </div>

        {imagePreview ? (
          <div style={{ position: 'relative', width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 18, border: '1px solid var(--border)' }}>
            <img src={imagePreview} alt="Uploaded hazard" style={{ display: 'block', width: '100%', height: 'auto' }} />
            {boxes.map((box, index) => (
              <div
                key={`${box.xmin}-${box.ymin}-${index}`}
                style={{
                  position: 'absolute',
                  left: `${box.xmin / 10}%`,
                  top: `${box.ymin / 10}%`,
                  width: `${(box.xmax - box.xmin) / 10}%`,
                  height: `${(box.ymax - box.ymin) / 10}%`,
                  border: '2px solid var(--accent-red)',
                }}
              >
                <span style={{
                  position: 'absolute',
                  left: -2,
                  top: -24,
                  background: '#fff',
                  color: 'var(--accent-red)',
                  border: '1px solid var(--accent-red)',
                  borderRadius: 999,
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                }}>
                  {box.label ?? hazard}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 16, marginBottom: 8 }}>What happens next?</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
            {reportCount > 1
              ? `Joined existing incident - ${reportCount} reports in this area`
              : 'New incident created - pending verification'}
          </p>
          <span style={{ display: 'inline-flex', borderRadius: 999, background: color, color: '#fff', padding: '4px 10px', fontSize: 12, fontWeight: 800 }}>
            {tier}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <button
            onClick={() => {
              sessionStorage.setItem('threeoneone:mapFocus', JSON.stringify({ hazardType: incident.hazard_type ?? incident.type, incidentId: incident.id }));
              onNavigate('map');
            }}
            style={{ border: 0, borderRadius: 10, padding: 13, background: 'var(--accent-red)', color: '#fff', fontWeight: 800 }}
          >
            View on map
          </button>
          <button onClick={resetForm} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13, background: '#fff', color: 'var(--text-primary)', fontWeight: 800 }}>
            Submit another
          </button>
        </div>
      </ResultShell>
    );
  };

  const renderNoHazard = (classification: Classification) => (
    <ResultShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-amber)', fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
        <AlertTriangle size={18} /> Couldn't verify hazard
      </div>
      <h2 style={{ color: 'var(--text-primary)', fontSize: 26, lineHeight: 1.2, marginBottom: 12 }}>
        We didn't identify a hazard in your report
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
        {classification.summary || 'Try adding a photo or more detail to help our AI verify the incident.'}
      </p>
      <button onClick={() => setView('form')} style={{ width: '100%', border: 0, borderRadius: 10, padding: 13, background: 'var(--accent-red)', color: '#fff', fontWeight: 800 }}>
        Edit and resubmit
      </button>
    </ResultShell>
  );

  const renderError = () => (
    <ResultShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-red)', fontSize: 14, fontWeight: 800, marginBottom: 12 }}>
        <XCircle size={18} /> Something went wrong
      </div>
      <h2 style={{ color: 'var(--text-primary)', fontSize: 26, lineHeight: 1.2, marginBottom: 12 }}>
        We couldn't process your report.
      </h2>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 22 }}>
        {error || 'Please try again.'}
      </p>
      <button onClick={() => setView('form')} style={{ width: '100%', border: 0, borderRadius: 10, padding: 13, background: 'var(--accent-red)', color: '#fff', fontWeight: 800 }}>
        Try again
      </button>
    </ResultShell>
  );

  const renderLeftColumn = () => {
    if (view === 'loading') return renderLoading();
    if (view === 'error') return renderError();
    if (view === 'result' && response?.status === 'joined_incident') return renderJoinedIncident(response.incident);
    if (view === 'result' && response?.status === 'no_hazard_detected') return renderNoHazard(response.classification);
    return renderForm();
  };

  return (
    <div
      style={{
        '--bg-primary': '#FFFFFF',
        '--bg-card': '#FAFAFA',
        '--border': '#E5E5E5',
        '--text-primary': '#0A0A0A',
        '--text-secondary': '#525252',
        '--accent-red': '#EF4444',
        '--accent-red-soft': '#FEE2E2',
        '--accent-green': '#10B981',
        '--accent-amber': '#F59E0B',
        paddingTop: 56,
        minHeight: '100vh',
        background: 'var(--bg-primary)',
      } as React.CSSProperties}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 520px) minmax(0, 1fr)',
        minHeight: 'calc(100vh - 56px)',
      }}>
        <section style={{
          padding: '42px 40px',
          borderRight: '1px solid var(--border)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
        }}>
          <div style={{ width: '100%' }}>
            {renderLeftColumn()}
          </div>
        </section>

        <section style={{ position: 'relative', minWidth: 0, background: '#fff' }}>
          <div style={{ position: 'absolute', top: 18, left: 18, zIndex: 5, background: 'rgba(255,255,255,0.9)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
            <MapPin size={16} color="var(--accent-red)" /> Nearby reports
          </div>
          <LiveMapEmbed
            height="calc(100vh - 56px)"
            reportLocation={reportLocation}
            onReportLocationChange={(location) => {
              setLat(location.lat);
              setLon(location.lon);
            }}
          />
        </section>
      </div>
    </div>
  );
}
