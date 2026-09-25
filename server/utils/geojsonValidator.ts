export interface GeoJSONValidationResult {
  valid: boolean;
  error?: string;
  type?: string;
  featureCount?: number;
  bbox?: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
}

/**
 * Validates any GeoJSON object (Geometry, Feature, or FeatureCollection)
 * Checks coordinate formats, lat/lng range [-90, 90] / [-180, 180], and polygon closure.
 */
export function validateGeoJSON(input: any): GeoJSONValidationResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, error: 'GeoJSON must be a valid JSON object.' };
  }

  if (typeof input.type !== 'string') {
    return { valid: false, error: 'GeoJSON object missing "type" property.' };
  }

  const validTypes = [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'Feature',
    'FeatureCollection',
  ];

  if (!validTypes.includes(input.type)) {
    return { valid: false, error: `Unsupported GeoJSON type: "${input.type}". Expected one of: ${validTypes.join(', ')}` };
  }

  try {
    const coordsList: [number, number][] = [];

    if (input.type === 'FeatureCollection') {
      if (!Array.isArray(input.features)) {
        return { valid: false, error: 'FeatureCollection must have a "features" array.' };
      }
      if (input.features.length === 0) {
        return { valid: false, error: 'FeatureCollection cannot be empty.' };
      }
      for (let i = 0; i < input.features.length; i++) {
        const feat = input.features[i];
        if (!feat || feat.type !== 'Feature' || !feat.geometry) {
          return { valid: false, error: `Feature at index ${i} is invalid or missing geometry.` };
        }
        const geomResult = validateGeometry(feat.geometry, coordsList);
        if (!geomResult.valid) {
          return { valid: false, error: `Feature[${i}]: ${geomResult.error}` };
        }
      }
      return {
        valid: true,
        type: 'FeatureCollection',
        featureCount: input.features.length,
        bbox: calculateBboxFromCoords(coordsList),
      };
    } else if (input.type === 'Feature') {
      if (!input.geometry) {
        return { valid: false, error: 'Feature must have a "geometry" object.' };
      }
      const geomResult = validateGeometry(input.geometry, coordsList);
      if (!geomResult.valid) return geomResult;
      return {
        valid: true,
        type: 'Feature',
        featureCount: 1,
        bbox: calculateBboxFromCoords(coordsList),
      };
    } else {
      // Raw Geometry
      const geomResult = validateGeometry(input, coordsList);
      if (!geomResult.valid) return geomResult;
      return {
        valid: true,
        type: input.type,
        featureCount: 1,
        bbox: calculateBboxFromCoords(coordsList),
      };
    }
  } catch (err: any) {
    return { valid: false, error: `Malformed GeoJSON: ${err.message}` };
  }
}

function validatePosition(pos: any): { valid: boolean; error?: string } {
  if (!Array.isArray(pos) || pos.length < 2) {
    return { valid: false, error: `Coordinate position must be [longitude, latitude] array.` };
  }
  const [lng, lat] = pos;
  if (typeof lng !== 'number' || isNaN(lng) || typeof lat !== 'number' || isNaN(lat)) {
    return { valid: false, error: `Coordinates must be numbers. Received: [${lng}, ${lat}]` };
  }
  if (lng < -180 || lng > 180) {
    return { valid: false, error: `Longitude ${lng} is out of bounds [-180, 180].` };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: `Latitude ${lat} is out of bounds [-90, 90].` };
  }
  return { valid: true };
}

function validateGeometry(geom: any, allCoords: [number, number][]): { valid: boolean; error?: string } {
  if (!geom || typeof geom !== 'object') {
    return { valid: false, error: 'Geometry must be an object.' };
  }

  const { type, coordinates } = geom;
  if (!type || !coordinates) {
    return { valid: false, error: 'Geometry requires both "type" and "coordinates".' };
  }

  if (type === 'Point') {
    const posValid = validatePosition(coordinates);
    if (!posValid.valid) return posValid;
    allCoords.push([coordinates[0], coordinates[1]]);
  } else if (type === 'LineString') {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return { valid: false, error: 'LineString must have at least 2 coordinate points.' };
    }
    for (const pt of coordinates) {
      const posValid = validatePosition(pt);
      if (!posValid.valid) return posValid;
      allCoords.push([pt[0], pt[1]]);
    }
  } else if (type === 'Polygon') {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return { valid: false, error: 'Polygon must have at least one linear ring.' };
    }
    for (let r = 0; r < coordinates.length; r++) {
      const ring = coordinates[r];
      if (!Array.isArray(ring) || ring.length < 4) {
        return { valid: false, error: `Polygon ring ${r} must contain at least 4 positions.` };
      }
      for (const pt of ring) {
        const posValid = validatePosition(pt);
        if (!posValid.valid) return posValid;
        allCoords.push([pt[0], pt[1]]);
      }
      // Check ring closure (first point equals last point)
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return {
          valid: false,
          error: `Polygon ring ${r} is not closed. First position [${first[0]}, ${first[1]}] does not match last position [${last[0]}, ${last[1]}].`,
        };
      }
    }
  } else if (type === 'MultiPolygon') {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return { valid: false, error: 'MultiPolygon must have at least one polygon.' };
    }
    for (let p = 0; p < coordinates.length; p++) {
      const poly = coordinates[p];
      for (let r = 0; r < poly.length; r++) {
        const ring = poly[r];
        if (!Array.isArray(ring) || ring.length < 4) {
          return { valid: false, error: `MultiPolygon[${p}] ring ${r} must contain at least 4 positions.` };
        }
        for (const pt of ring) {
          const posValid = validatePosition(pt);
          if (!posValid.valid) return posValid;
          allCoords.push([pt[0], pt[1]]);
        }
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
          return { valid: false, error: `MultiPolygon[${p}] ring ${r} is not closed.` };
        }
      }
    }
  }

  return { valid: true };
}

function calculateBboxFromCoords(coords: [number, number][]): [number, number, number, number] | undefined {
  if (coords.length === 0) return undefined;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLng, minLat, maxLng, maxLat];
}
