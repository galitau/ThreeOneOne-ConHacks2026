import { useEffect, useRef } from 'react';
import mapboxgl, { Map as MapboxMap } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MOCK_INCIDENTS } from '../data/incidents';
import type { Incident, Confidence } from '../data/incidents';
import { makeDescription } from './Description';
import { initClusters } from './Circles';

const CONF_COLOR: Record<Confidence, string> = {
  high: '#ff4444',
  medium: '#f5a623',
  low: '#2563eb',
};

interface Props {
  height?: number | string;
  incidents?: Incident[];
  selectedHazardType?: string | null;
  viewRequest?: number;
  onIncidentClick?: (inc: Incident) => void;
  onMapClick?: () => void;
}

const makeIncidentSourceData = (incidents: Incident[]) => ({
  type: 'FeatureCollection' as const,
  features: incidents.map((incident) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [incident.lng, incident.lat],
    },
    properties: {
      id: incident.id,
      type: incident.type,
      confidence: incident.conf,
      emergencyScore: incident.conf === 'high' ? 3 : incident.conf === 'medium' ? 2 : 1,
      reports: incident.reports,
      score: incident.score,
      icon: incident.icon,
      time: incident.time,
      desc: incident.desc,
    },
  })),
});

const matchesHazardType = (incident: Incident, selectedHazardType: string | null) => {
  if (!selectedHazardType) return true;

  if (selectedHazardType === 'Other') {
    return !['Flooding', 'Fallen Tree', 'Downed Power Line', 'Traffic Hazard'].includes(incident.type);
  }

  return incident.type === selectedHazardType;
};

const flyToIncident = (map: MapboxMap, incident: Incident) => {
  map.flyTo({
    center: [incident.lng, incident.lat],
    zoom: 16,
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    duration: 1200,
    essential: true,
  });
};

const fitToIncidents = (map: MapboxMap, incidents: Incident[]) => {
  if (incidents.length === 0) return;

  if (map.isMoving()) {
    map.stop();
  }

  if (incidents.length === 1) {
    flyToIncident(map, incidents[0]);
    return;
  }

  const bounds = new mapboxgl.LngLatBounds();
  incidents.forEach((incident) => {
    bounds.extend([incident.lng, incident.lat]);
  });

  map.fitBounds(bounds, {
    padding: 80,
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    duration: 1200,
    essential: true,
  } as mapboxgl.FitBoundsOptions);
};

export default function LiveMapEmbed({
  height = 600,
  incidents = MOCK_INCIDENTS,
  selectedHazardType = null,
  viewRequest = 0,
  onIncidentClick,
  onMapClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const onIncidentClickRef = useRef(onIncidentClick);
  const onMapClickRef = useRef(onMapClick);
  const selectedHazardTypeRef = useRef<string | null>(selectedHazardType);
  const markerEntriesRef = useRef<Array<{ marker: mapboxgl.Marker; incident: Incident }>>([]);
  const updateMarkerVisibilityRef = useRef<(() => void) | null>(null);

  const CLUSTER_ZOOM = 13.5;

  useEffect(() => {
    onIncidentClickRef.current = onIncidentClick;
  }, [onIncidentClick]);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    selectedHazardTypeRef.current = selectedHazardType;
  }, [selectedHazardType]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || viewRequest === 0) return;

    const applyHazardFilter = () => {
      const filteredIncidents = selectedHazardType
        ? incidents.filter((incident) => matchesHazardType(incident, selectedHazardType))
        : incidents;

      selectedHazardTypeRef.current = selectedHazardType;
      updateMarkerVisibilityRef.current?.();
      fitToIncidents(map, filteredIncidents);
    };

    if (map.loaded()) {
      applyHazardFilter();
      return;
    }

    map.once('load', applyHazardFilter);
    return () => {
      map.off('load', applyHazardFilter);
    };
  }, [incidents, selectedHazardType, viewRequest]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const token = import.meta.env.VITE_MAPBOX_TOKEN;

    if (!token) {
      console.error('Mapbox token missing. Check your .env file.');
      return;
    }

    mapboxgl.accessToken = token;
    const incidentMarkers: mapboxgl.Marker[] = [];
    const tooltipMap = new Map<HTMLElement, HTMLElement>();
    let currentDetail: HTMLElement | null = null;
    const detailHandlers = new Map<HTMLElement, { move: () => void; zoom: () => void; close: () => void }>();
    let updateMarkerVisibility: (() => void) | null = null;
    let handleClusterMouseEnter: (() => void) | null = null;
    let handleClusterMouseLeave: (() => void) | null = null;
    let clustersCleanup: (() => void) | null = null;

    const incidentSourceData = makeIncidentSourceData(incidents);

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
        transition: opacity 200ms ease;
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
      center: [-79.3832, 43.6532],
      zoom: 14.8,
      pitch: 68,
      bearing: -24,
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

      clustersCleanup = initClusters({
        map,
        data: incidentSourceData,
        clusterZoom: CLUSTER_ZOOM,
        incidentMarkers,
        tooltipMap,
        detailHandlers,
        getCurrentDetail: () => currentDetail,
        setCurrentDetail: (el) => (currentDetail = el),
      }).cleanup;

      // 📍 Incidents
      incidents.forEach((incident) => {
        const markerElement = createIncidentPin(incident.conf);

        // show tooltip on hover
        markerElement.addEventListener('mouseenter', () => {
          if (currentDetail) return;
          if (tooltipMap.has(markerElement)) return;
          const tip = makeDescription(incident);
          markerElement.appendChild(tip);
          tooltipMap.set(markerElement, tip);
        });

        markerElement.addEventListener('mouseleave', () => {
          const t = tooltipMap.get(markerElement);
          if (t) { t.remove(); tooltipMap.delete(markerElement); }
        });

        markerElement.addEventListener('click', (event) => {
          event.stopPropagation();
          onIncidentClickRef.current?.(incident);

          // remove all hover tooltips
          for (const t of tooltipMap.values()) t.remove();
          tooltipMap.clear();

          // remove existing detailed card and handlers
          if (currentDetail) {
            const handlers = detailHandlers.get(currentDetail);
            if (handlers) {
              map.off('move', handlers.move);
              map.off('zoom', handlers.zoom);
              currentDetail.removeEventListener('detail:close', handlers.close);
              detailHandlers.delete(currentDetail);
            }
            currentDetail.remove();
            currentDetail = null;
          }

        });

        const marker = new mapboxgl.Marker({
          element: markerElement,
          anchor: 'bottom',
        })
          .setLngLat([incident.lng, incident.lat])
          .addTo(map);

        incidentMarkers.push(marker);
        markerEntriesRef.current.push({ marker, incident });
      });

      updateMarkerVisibility = () => {
        const showPins = map.getZoom() >= CLUSTER_ZOOM;
        const activeHazard = selectedHazardTypeRef.current;
        const clusterVisibility = activeHazard ? 'none' : 'visible';

        if (map.getLayer('incident-cluster-halo')) {
          map.setLayoutProperty('incident-cluster-halo', 'visibility', clusterVisibility);
        }

        if (map.getLayer('incident-clusters')) {
          map.setLayoutProperty('incident-clusters', 'visibility', clusterVisibility);
        }

        if (map.getLayer('incident-cluster-count')) {
          map.setLayoutProperty('incident-cluster-count', 'visibility', clusterVisibility);
        }

        markerEntriesRef.current.forEach(({ marker, incident }) => {
          const matchesHazard = matchesHazardType(incident, activeHazard);
          const visible = (activeHazard || showPins) && matchesHazard;
          const element = marker.getElement();

          element.style.opacity = visible ? '1' : '0';
          element.style.visibility = visible ? 'visible' : 'hidden';
          element.style.pointerEvents = visible ? 'auto' : 'none';
        });

        if (!showPins) {
          for (const t of tooltipMap.values()) t.remove();
          tooltipMap.clear();

          if (currentDetail) {
            const handlers = detailHandlers.get(currentDetail);
            if (handlers) {
              map.off('move', handlers.move);
              map.off('zoom', handlers.zoom);
              currentDetail.removeEventListener('detail:close', handlers.close);
              detailHandlers.delete(currentDetail);
            }
            currentDetail.remove();
            currentDetail = null;
          }
        }
      };

      map.on('zoom', updateMarkerVisibility);
      map.on('moveend', updateMarkerVisibility);
      updateMarkerVisibilityRef.current = updateMarkerVisibility;
      updateMarkerVisibility();

      // cluster click handling moved to `initClusters` in Circles.ts

      handleClusterMouseEnter = () => {
        map.getCanvas().style.cursor = 'pointer';
      };

      handleClusterMouseLeave = () => {
        map.getCanvas().style.cursor = '';
      };

      map.on('mouseenter', 'incident-clusters', handleClusterMouseEnter);
      map.on('mouseleave', 'incident-clusters', handleClusterMouseLeave);

      const handleMapClick = (event: mapboxgl.MapMouseEvent) => {
        const clusterFeatures = map.queryRenderedFeatures(event.point, { layers: ['incident-clusters'] });
        if (clusterFeatures.length > 0) return;
        onMapClickRef.current?.();
      };

      map.on('click', handleMapClick);
      map.once('remove', () => {
        map.off('click', handleMapClick);
      });
    });

    const resizeTimer = window.setTimeout(() => {
      if (mapRef.current === map) {
        map.resize();
      }
    }, 500);

    return () => {
      window.clearTimeout(resizeTimer);

      if (mapRef.current && updateMarkerVisibility) {
        mapRef.current.off('zoom', updateMarkerVisibility);
        mapRef.current.off('moveend', updateMarkerVisibility);
      }

      // click handler cleaned up by clustersCleanup

      if (mapRef.current && handleClusterMouseEnter) {
        mapRef.current.off('mouseenter', 'incident-clusters', handleClusterMouseEnter);
      }

      if (mapRef.current && handleClusterMouseLeave) {
        mapRef.current.off('mouseleave', 'incident-clusters', handleClusterMouseLeave);
      }

      if (clustersCleanup) clustersCleanup();

      incidentMarkers.forEach((marker) => marker.remove());
      markerEntriesRef.current = [];
      updateMarkerVisibilityRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [incidents]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: typeof height === 'number' ? `${height}px` : height,
        minHeight: '620px',
        background: '#111',
        position: 'relative',
      }}
    />
  );
}
