type DetailHandlerMap = Map<HTMLElement, { move: () => void; zoom: () => void; close: () => void }>;

export function initClusters(opts: {
  map: any;
  data: GeoJSON.FeatureCollection;
  clusterZoom: number;
  incidentMarkers: any[];
  tooltipMap: Map<HTMLElement, HTMLElement>;
  detailHandlers: DetailHandlerMap;
  getCurrentDetail: () => HTMLElement | null;
  setCurrentDetail: (el: HTMLElement | null) => void;
}) {
  const { map, data, clusterZoom, incidentMarkers, tooltipMap, detailHandlers, getCurrentDetail, setCurrentDetail } = opts;

  const sourceId = 'incidents';
  map.addSource(sourceId, {
    type: 'geojson',
    data,
    cluster: true,
    clusterRadius: 60,
    clusterMaxZoom: 14,
    clusterProperties: { emergencySum: ['+', ['get', 'emergencyScore']] },
  });

  // halo
  map.addLayer({
    id: 'incident-cluster-halo',
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#0ea5e9',
      'circle-opacity': 0.16,
      'circle-radius': ['step', ['get', 'point_count'], 30, 3, 36, 7, 42],
      'circle-blur': 0.8,
    },
  });

  // main circle
  map.addLayer({
    id: 'incident-clusters',
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': ['step', ['get', 'point_count'], '#2563eb', 4, '#f59e0b', 8, '#ef4444'],
      'circle-radius': ['step', ['get', 'point_count'], 19, 3, 25, 7, 31],
      'circle-opacity': 0.96,
      'circle-stroke-width': 2.5,
      'circle-stroke-color': 'rgba(255,255,255,0.86)',
    },
  });

  // count
  map.addLayer({
    id: 'incident-cluster-count',
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': 13,
    },
    paint: {
      'text-color': '#ffffff',
      'text-halo-color': 'rgba(0,0,0,0.38)',
      'text-halo-width': 1,
    },
  });

  // visibility toggling
  const updateMarkerVisibility = () => {
    const showPins = map.getZoom() >= clusterZoom;
    incidentMarkers.forEach((marker) => (marker.getElement().style.display = showPins ? '' : 'none'));

    if (!showPins) {
      for (const t of tooltipMap.values()) t.remove();
      tooltipMap.clear();

      const current = getCurrentDetail();
      if (current) {
        const handlers = detailHandlers.get(current);
        if (handlers) {
          map.off('move', handlers.move);
          map.off('zoom', handlers.zoom);
          current.removeEventListener('detail:close', handlers.close);
          detailHandlers.delete(current);
        }
        current.remove();
        setCurrentDetail(null);
      }
    }
  };

  map.on('zoom', updateMarkerVisibility);
  map.on('moveend', updateMarkerVisibility);
  updateMarkerVisibility();

  const handleClusterClick = (event: mapboxgl.MapLayerMouseEvent) => {
    // prevent underlying DOM marker clicks from firing
    try {
      event.originalEvent?.stopPropagation?.();
      event.originalEvent?.preventDefault?.();
    } catch (e) {
      /* ignore */
    }
    const features = map.queryRenderedFeatures(event.point, { layers: ['incident-clusters'] });
    const clusterFeature = features[0];
    if (!clusterFeature) return;
    const clusterId = clusterFeature.properties?.cluster_id;
    const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource;
    if (clusterId == null || !source) return;
    source.getClusterExpansionZoom(clusterId, (error, zoom) => {
      console.debug('cluster click', { clusterId, zoom, mapZoom: map.getZoom(), clusterZoom });
      if (error) {
        console.warn('cluster expansion zoom error', error);
        // fallback: nudge zoom in
        const fallbackZoom = Math.min(map.getZoom() + 2, 20);
        map.easeTo({ center: (clusterFeature.geometry as GeoJSON.Point).coordinates as [number, number], zoom: fallbackZoom, speed: 0.9 });
        return;
      }
      if (zoom == null) {
        const fallbackZoom = Math.min(map.getZoom() + 2, 20);
        map.easeTo({ center: (clusterFeature.geometry as GeoJSON.Point).coordinates as [number, number], zoom: fallbackZoom, speed: 0.9 });
        return;
      }

      // Ensure we zoom at least to clusterZoom + 1 so DOM pins are shown
      let targetZoom = Math.max(zoom, clusterZoom + 1);
      // If that doesn't increase current map zoom, nudge half a level up
      if (targetZoom <= map.getZoom()) targetZoom = Math.min(map.getZoom() + 1, 20);

      console.debug('cluster zooming to', targetZoom, { clusterZoom });
      map.easeTo({
        center: (clusterFeature.geometry as GeoJSON.Point).coordinates as [number, number],
        zoom: targetZoom,
        speed: 0.9,
      });

      // After movement completes, ensure markers are visible; if still not zoomed enough, nudge further.
      map.once('moveend', () => {
        const z = map.getZoom();
        console.debug('moveend zoom', z, { clusterZoom });
        if (z < clusterZoom) {
          const forced = Math.min(clusterZoom + 2, 20);
          console.debug('forcing further zoom to', forced);
          map.easeTo({ center: (clusterFeature.geometry as GeoJSON.Point).coordinates as [number, number], zoom: forced, speed: 0.9 });
          // ensure markers shown after forced zoom
          map.once('moveend', () => {
            incidentMarkers.forEach((m) => (m.getElement().style.display = ''));
          });
        } else {
          incidentMarkers.forEach((m) => (m.getElement().style.display = ''));
        }
      });
    });
  };

  const handleClusterMouseEnter = () => map.getCanvas().style.cursor = 'pointer';
  const handleClusterMouseLeave = () => map.getCanvas().style.cursor = '';

  map.on('click', 'incident-clusters', handleClusterClick);
  map.on('mouseenter', 'incident-clusters', handleClusterMouseEnter);
  map.on('mouseleave', 'incident-clusters', handleClusterMouseLeave);

  const cleanup = () => {
    map.off('zoom', updateMarkerVisibility);
    map.off('moveend', updateMarkerVisibility);
    map.off('click', 'incident-clusters', handleClusterClick);
    map.off('mouseenter', 'incident-clusters', handleClusterMouseEnter);
    map.off('mouseleave', 'incident-clusters', handleClusterMouseLeave);
    if (map.getLayer('incident-cluster-count')) map.removeLayer('incident-cluster-count');
    if (map.getLayer('incident-clusters')) map.removeLayer('incident-clusters');
    if (map.getLayer('incident-cluster-halo')) map.removeLayer('incident-cluster-halo');
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  };

  return { updateMarkerVisibility, cleanup };
}
