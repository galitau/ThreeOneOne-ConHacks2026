import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MOCK_INCIDENTS } from '../data/incidents';
import type { Incident, Confidence } from '../data/incidents';

const CONF_COLOR: Record<Confidence, string> = {
  high: '#ff4444',
  medium: '#f5a623',
  low: '#6b7280',
};

function makeMarkerHtml(inc: Incident): string {
  const col = CONF_COLOR[inc.conf];
  const pulse = inc.conf === 'high'
    ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${col};opacity:0.25;animation:ping 2s ease-out infinite;pointer-events:none"></div>`
    : '';
  return `
    <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
      ${pulse}
      <div style="
        width:34px;height:34px;border-radius:50%;
        background:${col}18;
        border:1.5px solid ${col};
        display:flex;align-items:center;justify-content:center;
        font-size:14px;position:relative;z-index:1;
      ">${inc.icon}</div>
    </div>
  `;
}

interface Props {
  height?: number;
  onIncidentClick?: (inc: Incident) => void;
}

export default function LiveMapEmbed({ height = 480, onIncidentClick }: Props) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [43.455, -80.502],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    MOCK_INCIDENTS.forEach(inc => {
      const icon = L.divIcon({
        className: '',
        html: makeMarkerHtml(inc),
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const col = CONF_COLOR[inc.conf];

      const marker = L.marker([inc.lat, inc.lng], { icon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family:'Outfit',sans-serif">
          <div style="font-weight:700;font-size:14px;margin-bottom:8px;display:flex;align-items:center;gap:6px">
            <span>${inc.icon}</span><span>${inc.type}</span>
          </div>
          <div style="font-size:11px;color:#8b95aa;margin-bottom:10px;line-height:1.5">${inc.desc}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px">
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px">
              <div style="color:#4e5666;font-size:10px;margin-bottom:2px">CONFIDENCE</div>
              <div style="color:${col};font-weight:700">${inc.conf.toUpperCase()} (${inc.score}%)</div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px">
              <div style="color:#4e5666;font-size:10px;margin-bottom:2px">REPORTS</div>
              <div style="font-weight:700">${inc.reports} signals</div>
            </div>
          </div>
          <div style="margin-top:8px;font-size:11px;color:#4e5666">
            ${inc.sources.join(' · ')} · ${inc.time}
          </div>
        </div>
      `, { maxWidth: 240 });

      if (onIncidentClick) {
        marker.on('click', () => onIncidentClick(inc));
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height, borderRadius: 'inherit' }}
    />
  );
}