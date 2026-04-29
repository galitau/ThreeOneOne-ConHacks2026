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
      const incidentFeatures = MOCK_INCIDENTS.map((inc) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [inc.lng, inc.lat],
        },
        properties: {
          id: inc.id,
          type: inc.type,
          confidence: inc.conf,
        },
      }));

      map.addSource('incidents', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: incidentFeatures,
        },
      });

      // 🔥 Glow layer
      map.addLayer({
        id: 'incident-glow',
        type: 'circle',
        source: 'incidents',
        filter: ['==', ['get', 'confidence'], 'high'],
        paint: {
          'circle-radius': 28,
          'circle-color': '#ff4444',
          'circle-opacity': 0.25,
        },
      });

      // 🎯 Main markers
      (['high', 'medium', 'low'] as Confidence[]).forEach((conf) => {
        const size = conf === 'high' ? 14 : conf === 'medium' ? 11 : 8;

        map.addLayer({
          id: `incidents-${conf}`,
          type: 'circle',
          source: 'incidents',
          filter: ['==', ['get', 'confidence'], conf],
          paint: {
            'circle-radius': size,
            'circle-color': CONF_COLOR[conf],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          },
        });
      });

      // 🖱️ Click interaction
      const handleClick = (e: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
        const feature = e.features?.[0];
        if (!feature) return;

        const incident = MOCK_INCIDENTS.find(
          (inc) => inc.id === feature.properties?.id
        );

        if (!incident) return;

        onIncidentClick?.(incident);

        map.flyTo({
          center: [incident.lng, incident.lat],
          zoom: 17,
          pitch: 70,
          bearing: -30,
          speed: 0.8,
        });
      };

      ['incidents-high', 'incidents-medium', 'incidents-low'].forEach((layer) => {
        map.on('click', layer, handleClick);

        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      });
    });

    setTimeout(() => {
      map.resize();
    }, 500);

    return () => {
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