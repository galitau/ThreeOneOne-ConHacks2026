import { useEffect, useRef } from 'react';
import mapboxgl, { Map as MapboxMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MOCK_INCIDENTS } from '../data/incidents';
import type { Incident, Confidence } from '../data/incidents';

const CONF_COLOR: Record<Confidence, string> = {
  high: '#ff4444',
  medium: '#f5a623',
  low: '#6b7280',
};

interface Props {
  height?: number;
  onIncidentClick?: (inc: Incident) => void;
}

export default function LiveMapEmbed({ height = 600, onIncidentClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // ✅ Load token from .env
    const token = import.meta.env.VITE_MAPBOX_TOKEN;

    console.log("MAPBOX TOKEN:", token);

    if (!token) {
      console.error("❌ Mapbox token missing. Check your .env file.");
      return;
    }

    mapboxgl.accessToken = token;
    const incidentMarkers: mapboxgl.Marker[] = [];

    const createIncidentPin = (confidence: Confidence) => {
      const color = CONF_COLOR[confidence];
      const shade = confidence === 'high' ? '#b51f1f' : confidence === 'medium' ? '#c97d13' : '#4b5563';
      const highlight = confidence === 'high' ? 'rgba(255,255,255,0.42)' : confidence === 'medium' ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.32)';

      const marker = document.createElement('button');
      marker.type = 'button';
      marker.setAttribute('aria-label', `${confidence} confidence incident`);
      marker.style.cssText = `
        position: relative;
        width: 32px;
        height: 44px;
        padding: 0;
        border: 0;
        background: transparent;
        cursor: pointer;
        outline: none;
        transform-origin: center bottom;
        transition: filter 160ms var(--ease), opacity 160ms var(--ease);
        filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.38));
      `;

      marker.innerHTML = `
        <svg viewBox="0 0 32 44" width="32" height="44" aria-hidden="true" focusable="false" style="display:block; overflow: visible;">
          <defs>
            <linearGradient id="pin-${confidence}-body" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="${highlight}" />
              <stop offset="36%" stop-color="${color}" />
              <stop offset="100%" stop-color="${shade}" />
            </linearGradient>
            <radialGradient id="pin-${confidence}-gloss" cx="32%" cy="26%" r="60%">
              <stop offset="0%" stop-color="rgba(255,255,255,0.88)" />
              <stop offset="25%" stop-color="rgba(255,255,255,0.28)" />
              <stop offset="60%" stop-color="rgba(255,255,255,0.08)" />
              <stop offset="100%" stop-color="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          <path d="M16 2C9.37 2 4 7.37 4 14c0 8.8 12 28 12 28s12-19.2 12-28C28 7.37 22.63 2 16 2Z" fill="url(#pin-${confidence}-body)" stroke="rgba(255,255,255,0.16)" stroke-width="1.1" />
          <path d="M16 5.5C11.15 5.5 7.2 9.45 7.2 14.3c0 6.1 8.8 19 8.8 19s8.8-12.9 8.8-19c0-4.85-3.95-8.8-8.8-8.8Z" fill="rgba(0,0,0,0.12)" />
          <circle cx="16" cy="14" r="5.9" fill="rgba(255,255,255,0.15)" />
          <circle cx="16" cy="14" r="4.1" fill="rgba(255,255,255,0.82)" />
          <circle cx="14.5" cy="12.3" r="1.4" fill="url(#pin-${confidence}-gloss)" />
        </svg>
      `;

      marker.onmouseenter = () => {
        marker.style.opacity = '0.98';
        marker.style.filter = 'drop-shadow(0 14px 18px rgba(0, 0, 0, 0.45))';
      };

      marker.onmouseleave = () => {
        marker.style.opacity = '1';
        marker.style.filter = 'drop-shadow(0 10px 14px rgba(0, 0, 0, 0.38))';
      };

      return marker;
    };

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-79.3832, 43.6532], // Toronto
      zoom: 14.5,
      pitch: 65,
      bearing: -20,
      antialias: true,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('error', (e) => {
      console.error('MAPBOX ERROR:', e);
    });

    map.on('load', () => {
      console.log('✅ MAP LOADED');

      map.resize();

      const layers = map.getStyle().layers || [];
      const labelLayerId = layers.find(
        (layer) => layer.type === 'symbol' && layer.layout?.['text-field']
      )?.id;

      // 🏙️ 3D buildings
      map.addLayer(
        {
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 12,
          paint: {
            'fill-extrusion-color': '#2c5282',
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12,
              0,
              15,
              ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12,
              0,
              15,
              ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': 0.75,
          },
        },
        labelLayerId
      );

      // 📍 Incidents
      MOCK_INCIDENTS.forEach((incident) => {
        const markerElement = createIncidentPin(incident.conf);

        markerElement.addEventListener('click', () => {
          onIncidentClick?.(incident);

          map.flyTo({
            center: [incident.lng, incident.lat],
            zoom: 17,
            pitch: 70,
            bearing: -30,
            speed: 0.8,
          });
        });

        const marker = new mapboxgl.Marker({
          element: markerElement,
          anchor: 'bottom',
        })
          .setLngLat([incident.lng, incident.lat])
          .addTo(map);

        incidentMarkers.push(marker);
      });
    });

    setTimeout(() => {
      map.resize();
    }, 500);

    return () => {
      incidentMarkers.forEach((marker) => marker.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [onIncidentClick]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: `${height}px`,
        minHeight: '480px',
        background: '#111',
        position: 'relative',
      }}
    />
  );
}