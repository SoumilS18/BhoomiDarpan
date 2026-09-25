export function getBoundsFromGeoJSON(
  geojson: any
): [[number, number], [number, number]] | null {
  if (!geojson) return null;

  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  let count = 0;

  function traverse(coords: any) {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const [lng, lat] = coords;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      count++;
      return;
    }
    for (const c of coords) {
      traverse(c);
    }
  }

  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    for (const feat of geojson.features) {
      if (feat.geometry) traverse(feat.geometry.coordinates);
    }
  } else if (geojson.type === 'Feature' && geojson.geometry) {
    traverse(geojson.geometry.coordinates);
  } else if (geojson.coordinates) {
    traverse(geojson.coordinates);
  }

  if (count === 0) return null;
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

export const PARCEL_STATUS_COLORS: Record<string, { stroke: string; fill: string; label: string }> = {
  identified: { stroke: '#64748b', fill: '#94a3b8', label: 'Identified' },
  notified: { stroke: '#2563eb', fill: '#60a5fa', label: 'Notified' },
  valued: { stroke: '#d97706', fill: '#fbbf24', label: 'Valued' },
  awarded: { stroke: '#7c3aed', fill: '#a78bfa', label: 'Awarded' },
  disbursed: { stroke: '#0284c7', fill: '#38bdf8', label: 'Disbursed' },
  possessed: { stroke: '#059669', fill: '#34d399', label: 'Possessed' },
  disputed: { stroke: '#dc2626', fill: '#f87171', label: 'Disputed' },
};

export function getParcelStyle(status: string) {
  const norm = (status || 'identified').toLowerCase();
  const config = PARCEL_STATUS_COLORS[norm] || PARCEL_STATUS_COLORS.identified;
  return {
    color: config.stroke,
    fillColor: config.fill,
    fillOpacity: 0.35,
    weight: 2,
  };
}
