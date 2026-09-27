import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { startLiveApi, LiveApi } from './helpers/liveApi';
import { generateCorridorGeoJSON } from '../server/routes/gis.routes';
import { seedSpatialMemoryStore } from '../server/services/spatialIntelligenceService';

let liveApi: LiveApi | null = null;
let SERVER_URL = '';

beforeAll(async () => {
  liveApi = await startLiveApi();
  SERVER_URL = liveApi.url;
}, 30000);

afterAll(async () => {
  await liveApi?.close();
});

describe('Project Corridor Details & Geodetic Alignment Suite', () => {
  it('generates a valid GeoJSON Polygon with correct RoW buffer width', () => {
    const start = { latitude: 18.5204, longitude: 73.8567 };
    const end = { latitude: 18.53, longitude: 73.87 };
    const waypoints = [
      { latitude: 18.525, longitude: 73.86 },
    ];
    const widthMeters = 60;
    const geojson = generateCorridorGeoJSON(start, end, waypoints, widthMeters);

    expect(geojson).toBeDefined();
    expect(geojson.type).toBe('Polygon');
    expect(Array.isArray(geojson.coordinates)).toBe(true);
    expect(geojson.coordinates[0].length).toBeGreaterThan(waypoints.length * 2);

    // First and last coordinates must be identical to close polygon
    const ring = geojson.coordinates[0];
    expect(ring[0][0]).toBe(ring[ring.length - 1][0]);
    expect(ring[0][1]).toBe(ring[ring.length - 1][1]);
  });

  it('saves, buffers, and retrieves corridor details via REST API', async () => {
    const caseId = 'case-corridor-test-01';
    seedSpatialMemoryStore([
      {
        id: caseId,
        case_number: 'CORR-TEST-001',
        title: 'High-Speed Express Corridor Alignment',
        state: 'Maharashtra',
        district: 'Pune',
        tehsil: 'Haveli',
        village: 'Hadapsar',
        total_area_hectares: 35.0,
        estimated_compensation: 45000000,
        status: 'in_progress',
        current_stage: 'section_11_notification',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ], [], []);

    // 1. Fetch default / initialized corridor
    const getRes = await fetch(`${SERVER_URL}/api/cases/${caseId}/corridor`, {
      headers: {
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
    });
    expect(getRes.status).toBe(200);
    const initialCorridor = await getRes.json();
    expect(initialCorridor.case_id).toBe(caseId);

    // 2. Configure corridor with geodetic anchors and RoW buffer
    const updatePayload = {
      corridor_name: 'Pune-Nashik Semi High-Speed Rail Corridor Link',
      corridor_type: 'railway',
      total_length_km: 42.5,
      right_of_way_width_meters: 80,
      start_point: { latitude: 18.5204, longitude: 73.8567, landmark: 'Pune Junction CH:0+000' },
      end_point: { latitude: 18.75, longitude: 74.05, landmark: 'Chakan Hub CH:42+500' },
      intermediate_waypoints: [
        { latitude: 18.62, longitude: 73.91, landmark: 'Bhosari Station' },
        { latitude: 18.68, longitude: 73.98, landmark: 'Alandi Depot' },
      ],
      sponsoring_agency: 'Maharail Corporation',
      status: 'demarcated',
    };

    const postRes = await fetch(`${SERVER_URL}/api/cases/${caseId}/corridor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
      body: JSON.stringify(updatePayload),
    });

    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.corridor.corridor_name).toBe('Pune-Nashik Semi High-Speed Rail Corridor Link');
    expect(postData.corridor.right_of_way_width_meters).toBe(80);
    expect(postData.corridor.geojson_corridor).toBeDefined();
    expect(postData.corridor.geojson_corridor.type).toBe('Polygon');

    // 3. Verify that GET /api/cases/:id/corridor returns persisted data
    const verifyGetRes = await fetch(`${SERVER_URL}/api/cases/${caseId}/corridor`, {
      headers: {
        'Authorization': 'Bearer valid-test-token-admin',
        'x-eval-role': 'admin',
      },
    });
    expect(verifyGetRes.status).toBe(200);
    const verifyData = await verifyGetRes.json();
    expect(verifyData.corridor_name).toBe('Pune-Nashik Semi High-Speed Rail Corridor Link');
    expect(verifyData.geojson_corridor.type).toBe('Polygon');
  });
});
