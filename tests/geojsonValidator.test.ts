import { describe, expect, it } from 'bun:test';
import { validateGeoJSON } from '../server/utils/geojsonValidator';
import { getBoundsFromGeoJSON } from '../shared/utils/geojson';

describe('GeoJSON Spatial Validator', () => {
  it('validates a correct GeoJSON Polygon with closed ring', () => {
    const validPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [77.1025, 28.7041],
          [77.105, 28.7045],
          [77.106, 28.702],
          [77.1025, 28.7041],
        ],
      ],
    };

    const result = validateGeoJSON(validPolygon);
    expect(result.valid).toBe(true);
    expect(result.type).toBe('Polygon');
    expect(result.bbox).toBeDefined();
    if (result.bbox) {
      expect(result.bbox[0]).toBe(77.1025); // minLng
      expect(result.bbox[1]).toBe(28.702); // minLat
      expect(result.bbox[2]).toBe(77.106); // maxLng
      expect(result.bbox[3]).toBe(28.7045); // maxLat
    }
  });

  it('rejects an unclosed Polygon ring', () => {
    const unclosedPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [77.1025, 28.7041],
          [77.105, 28.7045],
          [77.106, 28.702],
          [77.108, 28.709], // Doesn't match first coordinate
        ],
      ],
    };

    const result = validateGeoJSON(unclosedPolygon);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not closed');
  });

  it('rejects coordinates exceeding statutory WGS-84 bounds', () => {
    const outOfBoundsPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [195.0, 28.7041], // Lng > 180
          [77.105, 28.7045],
          [77.106, 28.702],
          [195.0, 28.7041],
        ],
      ],
    };

    const result = validateGeoJSON(outOfBoundsPolygon);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('out of bounds');
  });

  it('validates a multi-feature FeatureCollection and computes corridor bbox', () => {
    const featureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { survey: '101/A' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [73.8567, 18.5204],
                [73.858, 18.5204],
                [73.858, 18.5215],
                [73.8567, 18.5204],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { survey: '101/B' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [73.858, 18.5204],
                [73.86, 18.5204],
                [73.86, 18.5215],
                [73.858, 18.5204],
              ],
            ],
          },
        },
      ],
    };

    const result = validateGeoJSON(featureCollection);
    expect(result.valid).toBe(true);
    expect(result.featureCount).toBe(2);

    const bounds = getBoundsFromGeoJSON(featureCollection);
    expect(bounds).toBeDefined();
    if (bounds) {
      expect(bounds[0][0]).toBe(18.5204); // minLat
      expect(bounds[0][1]).toBe(73.8567); // minLng
      expect(bounds[1][0]).toBe(18.5215); // maxLat
      expect(bounds[1][1]).toBe(73.86); // maxLng
    }
  });

  it('rejects invalid structures and empty objects', () => {
    expect(validateGeoJSON(null).valid).toBe(false);
    expect(validateGeoJSON({}).valid).toBe(false);
    expect(validateGeoJSON({ type: 'InvalidType' }).valid).toBe(false);
  });
});
