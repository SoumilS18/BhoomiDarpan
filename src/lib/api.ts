import {
  AcquisitionCase,
  Workflow,
  Project,
  DashboardAnalytics,
  StageInstanceStatus,
  StageAdvancementEvaluation,
  CaseIntelligenceBundle,
  ScenarioSimulation,
  Recommendation,
  PortfolioOperationsData,
  PortfolioFilterParams,
  AttentionQueueItem,
  SystemPolicy,
  CaseNotification,
  NotificationCounts,
  IntegrationDiagnostics,
  DataSource,
  DataProvenance,
  AdministrativeUnit,
  ImportSummary,
  NormalizedGeocodeResult,
  NormalizedLocationResult,
  CaseExternalContextBundle,
  DataDiscrepancy,
  ExternalObservation,
  PortfolioOverviewData,
  PortfolioDelayIntelligence,
  PortfolioRiskIntelligence,
  PortfolioBottleneckDetail,
  PortfolioTrendData,
  PortfolioOutcomeData,
  GeographicDrilldownNode,
  GISOverview,
  CaseSpatialContext,
  NearbySpatialEntity,
  SpatialLayerInfo,
  SpatialPolicy,
  IntegrationPolicy,
  CaseDispute,
  ObservedImpact,
  LgdSyncStatus,
  LgdSyncSummary,
  CaseEvent,
  AccessRequest,
} from '../../shared/types';


const API_BASE = '/api';

/**
 * Real Supabase session token (or null).
 *
 * The browser sends NOTHING but this bearer token. It deliberately does not
 * send any `x-eval-*` role context: an evaluation/impersonation context is a
 * server-side test harness only, and letting the client choose its own role
 * header would be client-side role spoofing. With no token the request is
 * simply unauthenticated, and the API answers 401 exactly as it would for any
 * other anonymous caller.
 */
let currentAuthToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  currentAuthToken = token;
}

export function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (currentAuthToken) {
    headers.Authorization = `Bearer ${currentAuthToken}`;
  }
  return headers;
}

/**
 * Authorization only, with NO Content-Type.
 *
 * Multipart uploads (FormData) must let the browser pick the boundary itself —
 * sending `application/json` there would break the parse on the server. Every
 * other call should use {@link getAuthHeaders}.
 */
export function getAuthHeaderOnly(): Record<string, string> {
  return currentAuthToken ? { Authorization: `Bearer ${currentAuthToken}` } : {};
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  database: {
    connected: boolean;
    message: string;
  };
  is_supabase_configured: boolean;
  has_gemini_key: boolean;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error('Health check request failed');
  return res.json();
}

export async function fetchCases(params?: {
  state?: string;
  district?: string;
  subdistrict?: string;
  village?: string;
  status?: string;
  priority?: string;
  search?: string;
  project_id?: string;
  state_lgd_code?: string;
  district_lgd_code?: string;
  subdistrict_lgd_code?: string;
  village_lgd_code?: string;
}): Promise<{ cases: AcquisitionCase[]; count: number }> {
  const query = new URLSearchParams();
  if (params?.state) query.set('state', params.state);
  if (params?.district) query.set('district', params.district);
  if (params?.subdistrict) query.set('subdistrict', params.subdistrict);
  if (params?.village) query.set('village', params.village);
  if (params?.status) query.set('status', params.status);
  if (params?.priority) query.set('priority', params.priority);
  if (params?.search) query.set('search', params.search);
  if (params?.project_id) query.set('project_id', params.project_id);
  if (params?.state_lgd_code) query.set('state_lgd_code', params.state_lgd_code);
  if (params?.district_lgd_code) query.set('district_lgd_code', params.district_lgd_code);
  if (params?.subdistrict_lgd_code) query.set('subdistrict_lgd_code', params.subdistrict_lgd_code);
  if (params?.village_lgd_code) query.set('village_lgd_code', params.village_lgd_code);

  const res = await fetch(`${API_BASE}/cases?${query.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch cases (${res.status})`);
  }
  return res.json();
}

export async function fetchCaseById(id: string): Promise<{ case: AcquisitionCase }> {
  const res = await fetch(`${API_BASE}/cases/${id}`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch case details (${res.status})`);
  }
  return res.json();
}

export async function createCase(payload: {
  project_id: string;
  workflow_id: string;
  title: string;
  description?: string;
  state: string;
  state_lgd_code?: string;
  district: string;
  district_lgd_code?: string;
  tehsil?: string;
  subdistrict_lgd_code?: string;
  village: string;
  village_lgd_code?: string;
  total_area_hectares: number;
  estimated_compensation?: number;
  priority?: string;
  start_date?: string;
  geojson_boundary?: any;
  parcels?: Array<{
    survey_number: string;
    khata_number?: string;
    landowner_names: string[];
    land_type: string;
    area_acres: number;
    compensation_amount?: number;
  }>;
}): Promise<{ success: boolean; case: AcquisitionCase }> {
  const res = await fetch(`${API_BASE}/cases`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to create case (${res.status})`);
  }
  return res.json();
}

export async function advanceStage(
  caseId: string,
  stageInstanceId: string,
  payload: {
    targetStatus: StageInstanceStatus;
    actualDate?: string;
    notes?: string;
    actorName?: string;
    allowOverride?: boolean;
    overrideJustification?: string;
  }
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/stages/${stageInstanceId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to advance stage (${res.status})`);
  }
  return res.json();
}

export async function evaluateStage(
  caseId: string,
  stageInstanceId: string,
  targetStatus: StageInstanceStatus = 'completed'
): Promise<StageAdvancementEvaluation> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/stages/${stageInstanceId}/evaluation?targetStatus=${targetStatus}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to evaluate stage advancement (${res.status})`);
  }
  return res.json();
}

export async function fetchWorkflows(): Promise<{ workflows: Workflow[] }> {
  const res = await fetch(`${API_BASE}/workflows`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch workflows (${res.status})`);
  }
  return res.json();
}

export async function fetchProjects(): Promise<{ projects: Project[] }> {
  const res = await fetch(`${API_BASE}/projects`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch projects (${res.status})`);
  }
  return res.json();
}

export async function createProject(payload: {
  code: string;
  name: string;
  description?: string;
  project_type: string;
  sponsoring_agency: string;
  estimated_budget?: number | null;
  target_completion_date?: string | null;
  state: string;
  district?: string | null;
  state_lgd_code?: string | null;
  district_lgd_code?: string | null;
  subdistrict_lgd_code?: string | null;
}): Promise<{ project: Project }> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to create project (${res.status})`);
  }
  return data;
}

export async function fetchDashboardAnalytics(): Promise<{ analytics: DashboardAnalytics }> {
  const res = await fetch(`${API_BASE}/analytics/dashboard`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch analytics (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioOperations(
  filters?: PortfolioFilterParams
): Promise<{ portfolio: PortfolioOperationsData }> {
  const query = new URLSearchParams();
  if (filters?.project_id) query.append('project_id', filters.project_id);
  if (filters?.state) query.append('state', filters.state);
  if (filters?.district) query.append('district', filters.district);
  if (filters?.state_lgd_code) query.append('state_lgd_code', filters.state_lgd_code);
  if (filters?.district_lgd_code) query.append('district_lgd_code', filters.district_lgd_code);
  if (filters?.subdistrict_lgd_code)
    query.append('subdistrict_lgd_code', filters.subdistrict_lgd_code);
  if (filters?.village_lgd_code) query.append('village_lgd_code', filters.village_lgd_code);
  if (filters?.workflow_id) query.append('workflow_id', filters.workflow_id);
  if (filters?.status) query.append('status', filters.status);
  if (filters?.risk_level) query.append('risk_level', filters.risk_level);
  if (filters?.search) query.append('search', filters.search);

  const qs = query.toString();
  const url = `${API_BASE}/analytics/portfolio${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch portfolio operations (${res.status})`);
  }
  return res.json();
}

export async function fetchAttentionQueue(
  limit = 20,
  offset = 0
): Promise<{ total: number; limit: number; offset: number; queue: AttentionQueueItem[] }> {
  const res = await fetch(`${API_BASE}/analytics/attention-queue?limit=${limit}&offset=${offset}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch attention queue (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioOverview(): Promise<{ overview: PortfolioOverviewData }> {
  const res = await fetch(`${API_BASE}/portfolio/overview`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch portfolio overview (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioDelays(): Promise<{ delays: PortfolioDelayIntelligence }> {
  const res = await fetch(`${API_BASE}/portfolio/delays`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch portfolio delays (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioRisks(): Promise<{ risk: PortfolioRiskIntelligence }> {
  const res = await fetch(`${API_BASE}/portfolio/risk`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch portfolio risk (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioBottlenecks(): Promise<{ bottlenecks: PortfolioBottleneckDetail[] }> {
  const res = await fetch(`${API_BASE}/portfolio/bottlenecks`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch portfolio bottlenecks (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioTrends(
  metricName?: string,
  minDays?: number,
  minCases?: number
): Promise<{ trends: PortfolioTrendData }> {
  const q = new URLSearchParams();
  if (metricName) q.append('metric_name', metricName);
  if (minDays !== undefined) q.append('min_days', String(minDays));
  if (minCases !== undefined) q.append('min_cases', String(minCases));
  const qs = q.toString();
  const res = await fetch(`${API_BASE}/portfolio/trends${qs ? `?${qs}` : ''}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch portfolio trends (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioGeography(): Promise<{ geography: GeographicDrilldownNode }> {
  const res = await fetch(`${API_BASE}/portfolio/geography`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch portfolio geography (${res.status})`);
  }
  return res.json();
}

export async function fetchPortfolioOutcomes(): Promise<{ outcomes: PortfolioOutcomeData }> {
  const res = await fetch(`${API_BASE}/portfolio/outcomes`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch portfolio outcomes (${res.status})`);
  }
  return res.json();
}

// -------------------------------------------------------------
// GIS & SPATIAL API METHODS
// -------------------------------------------------------------

export interface CaseGISResponse {
  case_id: string;
  has_geometry: boolean;
  total_parcels: number;
  parcels_with_geometry: number;
  gis_data: {
    type: 'FeatureCollection';
    features: any[];
  };
}

export async function fetchCaseGIS(caseId: string): Promise<CaseGISResponse> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/gis`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch GIS data (${res.status})`);
  }
  return res.json();
}

export async function updateCaseGeoJSON(
  caseId: string,
  geojson: any,
  actorName?: string
): Promise<{ success: boolean; message: string; bbox?: number[] }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/geojson`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ geojson, actorName }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update GeoJSON (${res.status})`);
  }
  return res.json();
}

export async function createParcel(
  caseId: string,
  payload: {
    survey_number: string;
    khata_number?: string;
    landowner_names: string[];
    land_type: string;
    area_acres: number;
    compensation_amount?: number;
    acquisition_status?: string;
    geojson_geometry?: any;
    actorName?: string;
  }
): Promise<{ parcel: any }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/parcels`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to add parcel (${res.status})`);
  }
  return res.json();
}

export async function updateParcel(
  caseId: string,
  parcelId: string,
  payload: {
    survey_number?: string;
    khata_number?: string;
    landowner_names?: string[];
    land_type?: string;
    area_acres?: number;
    compensation_amount?: number;
    acquisition_status?: string;
    geojson_geometry?: any;
    actorName?: string;
  }
): Promise<{ parcel: any }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/parcels/${parcelId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update parcel (${res.status})`);
  }
  return res.json();
}

export async function deleteParcel(caseId: string, parcelId: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/parcels/${parcelId}`, {
    method: 'DELETE',
    headers: getAuthHeaderOnly(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to delete parcel (${res.status})`);
  }
  return res.json();
}

// -------------------------------------------------------------
// DOCUMENT MANAGEMENT & AI EXTRACTION API METHODS
// -------------------------------------------------------------

export async function fetchCaseDocuments(caseId: string): Promise<{ documents: any[] }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/documents`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch documents (${res.status})`);
  }
  return res.json();
}

export async function uploadCaseDocument(
  caseId: string,
  formData: FormData
): Promise<{ document: any }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/documents`, {
    method: 'POST',
    headers: getAuthHeaderOnly(),
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to upload document (${res.status})`);
  }
  return res.json();
}

export async function processDocument(
  documentId: string,
  rawContentText?: string
): Promise<{
  success: boolean;
  document_status: string;
  extraction?: any;
  error?: string;
}> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/process`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ rawContentText }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Processing failed (${res.status})`);
  }
  return data;
}

export async function validateDocument(
  documentId: string,
  payload: {
    validation_status: 'accepted' | 'edited' | 'rejected';
    human_edited_data?: any;
    validation_notes?: string;
    actorName?: string;
  }
): Promise<{
  success: boolean;
  document_status: string;
  extraction: any;
}> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/validate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Validation failed (${res.status})`);
  }
  return res.json();
}

// -------------------------------------------------------------
// PREDICTIVE INTELLIGENCE & SIMULATION API METHODS
// -------------------------------------------------------------

export async function fetchCaseIntelligence(caseId: string): Promise<{ intelligence: CaseIntelligenceBundle }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/intelligence`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch case intelligence (${res.status})`);
  }
  return res.json();
}

export async function runWhatIfSimulation(
  caseId: string,
  payload: {
    name: string;
    description?: string;
    proposed_actions: any[];
    actorName?: string;
  }
): Promise<{ simulation: ScenarioSimulation }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/intelligence/simulate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Simulation execution failed (${res.status})`);
  }
  return res.json();
}

export async function fetchCaseScenarios(caseId: string): Promise<{ scenarios: ScenarioSimulation[] }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/scenarios`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch scenarios (${res.status})`);
  }
  return res.json();
}

export async function updateRecommendationStatus(
  caseId: string,
  recId: string,
  payload: {
    status: 'proposed' | 'accepted' | 'rejected' | 'implemented' | 'completed';
    actorName?: string;
    notes?: string;
    observed_impact?: ObservedImpact;
  }
): Promise<{ success: boolean; recommendation: Recommendation }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/recommendations/${recId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update recommendation (${res.status})`);
  }
  return res.json();
}

// ============================================================================
// DISPUTES & STATUTORY OBJECTIONS API
// ============================================================================

export async function fetchCaseDisputes(caseId: string): Promise<{ disputes: CaseDispute[] }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/disputes`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch disputes (${res.status})`);
  }
  return res.json();
}

export async function createCaseDispute(
  caseId: string,
  payload: Partial<CaseDispute>
): Promise<{ success: boolean; dispute: CaseDispute }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/disputes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to create dispute (${res.status})`);
  }
  return res.json();
}

export async function updateCaseDispute(
  caseId: string,
  disputeId: string,
  payload: Partial<CaseDispute>
): Promise<{ success: boolean; dispute: CaseDispute }> {
  const res = await fetch(`${API_BASE}/cases/${caseId}/disputes/${disputeId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update dispute (${res.status})`);
  }
  return res.json();
}

// ============================================================================
// DAY 5: POLICIES API
// ============================================================================

export async function fetchPolicies(): Promise<{ policies: SystemPolicy[] }> {
  const res = await fetch(`${API_BASE}/policies`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch policies');
  return res.json();
}

export async function fetchPolicyByKey(key: string): Promise<{ policy: SystemPolicy }> {
  const res = await fetch(`${API_BASE}/policies/${key}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch policy: ${key}`);
  return res.json();
}

export async function updatePolicyByKey(key: string, configValue: any): Promise<{ success: boolean; policy: SystemPolicy }> {
  const res = await fetch(`${API_BASE}/policies/${key}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ config_value: configValue }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to update policy (${res.status})`);
  }
  return res.json();
}

// ============================================================================
// DAY 5: NOTIFICATIONS & ESCALATIONS API
// ============================================================================

export async function fetchNotifications(params?: {
  case_id?: string;
  project_id?: string;
  role?: string;
  status?: string;
  severity?: string;
  event_type?: string;
  limit?: number;
}): Promise<{ notifications: CaseNotification[]; total_count: number; unread_count: number }> {
  const query = new URLSearchParams();
  if (params?.case_id) query.set('case_id', params.case_id);
  if (params?.project_id) query.set('project_id', params.project_id);
  if (params?.role) query.set('role', params.role);
  if (params?.status) query.set('status', params.status);
  if (params?.severity) query.set('severity', params.severity);
  if (params?.event_type) query.set('event_type', params.event_type);
  if (params?.limit) query.set('limit', String(params.limit));

  const res = await fetch(`${API_BASE}/notifications?${query.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch notifications');
  return res.json();
}

export async function fetchNotificationCounts(): Promise<{ counts: NotificationCounts }> {
  const res = await fetch(`${API_BASE}/notifications/count`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch notification counts');
  return res.json();
}

export async function acknowledgeNotification(id: string, actorName?: string): Promise<{ success: boolean; notification: CaseNotification }> {
  const res = await fetch(`${API_BASE}/notifications/${id}/acknowledge`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ actorName }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to acknowledge notification (${res.status})`);
  }
  return res.json();
}

export async function resolveNotification(id: string, actionTaken?: string, actorName?: string): Promise<{ success: boolean; notification: CaseNotification }> {
  const res = await fetch(`${API_BASE}/notifications/${id}/resolve`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ actionTaken, actorName }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to resolve notification (${res.status})`);
  }
  return res.json();
}

export async function dismissNotification(id: string, reason?: string, actorName?: string): Promise<{ success: boolean; notification: CaseNotification }> {
  const res = await fetch(`${API_BASE}/notifications/${id}/dismiss`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ reason, actorName }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to dismiss notification (${res.status})`);
  }
  return res.json();
}

export async function escalateNotification(id: string, reason?: string): Promise<{ success: boolean; notification: CaseNotification }> {
  const res = await fetch(`${API_BASE}/notifications/${id}/escalate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to escalate notification (${res.status})`);
  }
  return res.json();
}

export async function triggerNotificationEvaluation(caseId?: string): Promise<{
  success: boolean;
  evaluated_cases: number;
  generated_or_updated_count: number;
  notifications: CaseNotification[];
}> {
  const res = await fetch(`${API_BASE}/notifications/evaluate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ case_id: caseId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to evaluate triggers (${res.status})`);
  }
  return res.json();
}

// ============================================================================
// DAY 5: DIAGNOSTICS API
// ============================================================================

export async function fetchDiagnostics(): Promise<IntegrationDiagnostics> {
  const res = await fetch(`${API_BASE}/diagnostics`);
  if (!res.ok) throw new Error('Failed to fetch integration diagnostics');
  return res.json();
}

// ============================================================================
// DAY 1 FOUNDATION: DATA SOURCES, PROVENANCE, GEOCODING, GEOGRAPHY & IMPORT
// ============================================================================

export async function fetchDataSources(): Promise<{ sources: DataSource[]; count: number }> {
  const res = await fetch(`${API_BASE}/data-sources`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('Failed to fetch data sources');
  return res.json();
}

export async function testDataSource(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/data-sources/${id}/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to test data source ${id}`);
  return res.json();
}

export async function updateDataSourceConfig(
  id: string,
  updates: Partial<Pick<DataSource, 'is_enabled' | 'sync_mode' | 'metadata'>>
): Promise<{ success: boolean; source: DataSource }> {
  const res = await fetch(`${API_BASE}/data-sources/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Failed to update data source ${id}`);
  return res.json();
}

export async function fetchProvenance(entityType: string, entityId: string): Promise<{ provenance: DataProvenance[]; count: number }> {
  const res = await fetch(`${API_BASE}/provenance/${entityType}/${entityId}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch provenance for ${entityType} ${entityId}`);
  return res.json();
}

export async function verifyProvenanceRecord(
  id: string,
  status: 'human_verified' | 'rejected',
  notes?: string
): Promise<{ success: boolean; provenance: DataProvenance }> {
  const res = await fetch(`${API_BASE}/provenance/${id}/verify`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status, notes }),
  });
  if (!res.ok) throw new Error(`Failed to verify provenance record ${id}`);
  return res.json();
}

export async function forwardGeocode(
  query: string,
  limit = 5
): Promise<{ results: NormalizedGeocodeResult[]; count: number; provider: string }> {
  const res = await fetch(`${API_BASE}/geocoding/forward?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to forward geocode query');
  }
  return res.json();
}

export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ result: NormalizedLocationResult; provider: string }> {
  const res = await fetch(`${API_BASE}/geocoding/reverse?lat=${lat}&lng=${lng}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to reverse geocode coordinates');
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Administrative geography — authoritative LGD only, no substituted data.
//
// There used to be a bundled `GEOGRAPHY_SNAPSHOT` fallback here: whenever the
// API errored, the client quietly answered with a 176-unit reference subset.
// That is worse than an empty dropdown, because it looks exactly like working
// production data while quietly mis-describing the country (Uttar Pradesh
// showed 9 districts, Maharashtra 11).
//
// Now the API is the only source. Every response carries `provenance` from the
// server (`status`, `authoritative`, `counts`, `requires`, `message`), and when
// the authoritative LGD hierarchy has not been ingested the client renders an
// explicit `unavailable` state instead of inventing geography.
// ---------------------------------------------------------------------------

/**
 * True only while the server reports rows that are, in fact, authoritative LGD.
 * Temporary reference / mixed rows map to `unavailable` at this coarse level
 * (the richer `status` below is what the UI displays).
 */
export type GeographySource = 'authoritative' | 'unavailable';

/** Mirrors `GeographyProvenance` returned by `GET /api/geography/status`. */
export interface GeographyProvenance {
  status: 'authoritative' | 'temporary_reference' | 'mixed' | 'requires_credentials' | 'unavailable';
  source: string;
  authoritative: boolean;
  units_in_database: number;
  counts: { states: number; districts: number; sub_districts: number; villages: number };
  /**
   * Per-source row totals the server observed in `administrative_units` — the
   * evidence behind `status`, so the client can verify rather than trust.
   */
  source_rows?: { lgd_india: number; lgd_reference_mirror: number; other: number };
  active_source?: 'lgd_india' | 'lgd_reference_mirror' | 'mixed' | 'none';
  requires: string | null;
  message: string;
}

let geographySource: GeographySource = 'unavailable';
let geographyProvenance: GeographyProvenance | null = null;
const geographySourceListeners = new Set<(source: GeographySource) => void>();

export const getGeographySource = (): GeographySource => geographySource;

/** Last provenance object received from the API, or `null` before the first call. */
export const getGeographyProvenance = (): GeographyProvenance | null => geographyProvenance;

export const subscribeGeographySource = (
  listener: (source: GeographySource) => void
): (() => void) => {
  geographySourceListeners.add(listener);
  return () => {
    geographySourceListeners.delete(listener);
  };
};

const applyProvenance = (provenance: GeographyProvenance | undefined): GeographySource => {
  geographyProvenance = provenance ?? geographyProvenance;
  const next: GeographySource =
    provenance && provenance.authoritative ? 'authoritative' : 'unavailable';
  if (geographySource !== next) {
    geographySource = next;
    geographySourceListeners.forEach((listener) => listener(next));
  }
  return next;
};

/** Records an unreachable/unusable geography API as an honest unavailable state. */
const markGeographyUnavailable = (reason: unknown): GeographySource => {
  console.warn('[geography] Authoritative LGD source unavailable.', reason);
  return applyProvenance({
    status: 'unavailable',
    source: 'Local Government Directory (LGD), Ministry of Panchayati Raj',
    authoritative: false,
    units_in_database: 0,
    counts: { states: 0, districts: 0, sub_districts: 0, villages: 0 },
    source_rows: { lgd_india: 0, lgd_reference_mirror: 0, other: 0 },
    active_source: 'none',
    requires: 'Reachable API or LGD_DATA_GOV_API_KEY + sync',
    message: 'Authoritative LGD source unavailable. No partial geography is substituted.',
  });
};

/** Human-readable helper for empty-state copy in the UI. */
export const geographySourceHint = (provenance: GeographyProvenance | null): string => {
  if (provenance?.message) return provenance.message;
  if (provenance?.requires) return `Requires: ${provenance.requires}`;
  return 'Authoritative LGD source unavailable.';
};

export async function fetchGeographyStatus(): Promise<GeographyProvenance> {
  try {
    const res = await fetch(`${API_BASE}/geography/status`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const provenance = (await res.json())?.provenance as GeographyProvenance | undefined;
    applyProvenance(provenance);
    if (provenance) return provenance;
  } catch (err) {
    markGeographyUnavailable(err);
  }
  throw new Error('Geography status unavailable');
}

export async function fetchStates(): Promise<{ states: AdministrativeUnit[]; count: number }> {
  try {
    const res = await fetch(`${API_BASE}/geography/states`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyProvenance(data.provenance);
    if (!Array.isArray(data.states)) throw new Error('Malformed states response');
    // An empty list here is the truthful answer while the source is not
    // ingested — never replaced with bundled reference geography.
    return { states: data.states, count: data.states.length };
  } catch (err) {
    markGeographyUnavailable(err);
    return { states: [], count: 0 };
  }
}

export async function fetchDistricts(stateCode: string): Promise<{ districts: AdministrativeUnit[]; count: number }> {
  try {
    const res = await fetch(`${API_BASE}/geography/districts?state=${encodeURIComponent(stateCode)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyProvenance(data.provenance);
    if (!Array.isArray(data.districts)) throw new Error('Malformed districts response');
    return { districts: data.districts, count: data.districts.length };
  } catch (err) {
    markGeographyUnavailable(err);
    return { districts: [], count: 0 };
  }
}

export async function fetchSubDistricts(districtCode: string): Promise<{ subdistricts: AdministrativeUnit[]; count: number }> {
  try {
    const res = await fetch(`${API_BASE}/geography/subdistricts?district=${encodeURIComponent(districtCode)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyProvenance(data.provenance);
    if (!Array.isArray(data.subdistricts)) throw new Error('Malformed sub-districts response');
    return { subdistricts: data.subdistricts, count: data.subdistricts.length };
  } catch (err) {
    markGeographyUnavailable(err);
    return { subdistricts: [], count: 0 };
  }
}

export async function createSubDistrict(payload: {
  name: string;
  code: string;
  state_code: string;
  district_code: string;
  local_name?: string | null;
}): Promise<{ success: boolean; subdistrict: AdministrativeUnit }> {
  const res = await fetch(`${API_BASE}/geography/subdistricts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to create sub-district (${res.status})`);
  }
  if (data.provenance) {
    applyProvenance(data.provenance);
  }
  return data;
}

export async function fetchLocalities(subDistrictCode: string): Promise<{ localities: AdministrativeUnit[]; count: number }> {
  const res = await fetch(`${API_BASE}/geography/localities?subdistrict=${encodeURIComponent(subDistrictCode)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch localities for sub-district ${subDistrictCode}`);
  return res.json();
}

export async function fetchVillages(
  subDistrictCode: string,
  options: { page?: number; limit?: number; search?: string } = {}
): Promise<{
  sub_district_code: string;
  villages: AdministrativeUnit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const params = new URLSearchParams();
  if (options.page) params.set('page', String(options.page));
  if (options.limit) params.set('limit', String(options.limit));
  if (options.search) params.set('search', options.search);

  try {
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${API_BASE}/administration/subdistricts/${encodeURIComponent(subDistrictCode)}/villages${qs}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    applyProvenance(data.provenance);
    if (!Array.isArray(data.villages)) throw new Error('Malformed villages response');
    return data;
  } catch (err) {
    markGeographyUnavailable(err);
    const limit = options.limit && options.limit > 0 ? options.limit : 200;
    const page = options.page && options.page > 0 ? options.page : 1;
    // Honest empty page: the village tier is never fabricated client-side.
    return {
      sub_district_code: subDistrictCode,
      villages: [],
      total: 0,
      page,
      limit,
      totalPages: 1,
    };
  }
}

export async function searchAdministration(
  query: string,
  unitType?: string
): Promise<{ query: string; results: AdministrativeUnit[]; count: number }> {
  const params = new URLSearchParams({ q: query });
  if (unitType) params.set('unit_type', unitType);

  const res = await fetch(`${API_BASE}/administration/search?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to search administrative units');
  return res.json();
}

export async function fetchLgdSyncStatus(): Promise<LgdSyncStatus> {
  const res = await fetch(`${API_BASE}/administration/sync/status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch LGD sync status');
  return res.json();
}

/**
 * Cross-case audit ledger for the administration console.
 *
 * `source` is part of the contract: `'database'` means the records came from
 * the persisted `case_events` table, `'memory'` means only this server
 * process's buffer was available. Callers must surface that distinction
 * instead of presenting an in-process buffer as a durable ledger.
 */
export async function fetchAdministrationAudit(params: {
  limit?: number;
  event_type?: string;
  case_id?: string;
} = {}): Promise<{ events: CaseEvent[]; source: 'database' | 'memory'; count: number }> {
  const query = new URLSearchParams();
  if (params.limit) query.append('limit', String(params.limit));
  if (params.event_type) query.append('event_type', params.event_type);
  if (params.case_id) query.append('case_id', params.case_id);
  const qs = query.toString();
  const res = await fetch(`${API_BASE}/administration/audit${qs ? `?${qs}` : ''}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch audit ledger (${res.status})`);
  }
  return res.json();
}

export async function triggerLgdSync(payload: {
  tier?: string;
  max_records_per_tier?: number;
  batch_size?: number;
} = {}): Promise<{ success: boolean; message: string; summary: LgdSyncSummary }> {
  const res = await fetch(`${API_BASE}/administration/sync`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `LGD sync failed (${res.status})`);
  }
  return res.json();
}

export async function fetchAdministrativeEnrichment(params: {
  state_lgd_code?: string;
  district_lgd_code?: string;
  subdistrict_lgd_code?: string;
  village_lgd_code?: string;
}): Promise<{
  status: 'operational' | 'administrative_enrichment_unavailable';
  state?: AdministrativeUnit | null;
  district?: AdministrativeUnit | null;
  sub_district?: AdministrativeUnit | null;
  village?: AdministrativeUnit | null;
  provenance: any;
}> {
  const qs = new URLSearchParams();
  if (params.state_lgd_code) qs.set('state_lgd_code', params.state_lgd_code);
  if (params.district_lgd_code) qs.set('district_lgd_code', params.district_lgd_code);
  if (params.subdistrict_lgd_code) qs.set('subdistrict_lgd_code', params.subdistrict_lgd_code);
  if (params.village_lgd_code) qs.set('village_lgd_code', params.village_lgd_code);

  const res = await fetch(`${API_BASE}/administration/enrichment?${qs.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch administrative enrichment');
  return res.json();
}

export async function importStructuredData(payload: {
  raw_data: any;
  batch_type: 'administrative_units' | 'parcels';
  format: 'json' | 'csv' | 'geojson';
  source_id?: string;
  source_record_ref?: string;
}): Promise<{ summary: ImportSummary }> {
  const res = await fetch(`${API_BASE}/import/batch`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Data import failed');
  }
  return res.json();
}

// ============================================================================
// PUBLIC ACCOUNT-ACCESS REQUEST API
// ============================================================================

export interface AccessRequestStatus {
  available: boolean;
  code: string;
  message: string;
}

export interface AccessRequestPayload {
  fullName: string;
  email: string;
  organization: string;
  department?: string;
  designation?: string;
  contactPhone?: string;
  stateCode?: string;
  districtCode?: string;
  justification: string;
  requestedRole?: string;
}

/**
 * Asks the API whether an access-request workflow actually exists in this
 * deployment. The page renders a real form only when the backend says it does
 * — availability is never assumed at build time.
 */
export async function fetchAccessRequestStatus(): Promise<AccessRequestStatus> {
  const res = await fetch(`${API_BASE}/auth/request-access/status`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    return {
      available: false,
      code: 'NOT_CONFIGURED',
      message: 'No access-request workflow is configured for this deployment.',
    };
  }
  return res.json();
}

export async function submitAccessRequest(
  payload: AccessRequestPayload
): Promise<{ success: boolean; request: { id: string; status: string }; message: string }> {
  const res = await fetch(`${API_BASE}/auth/request-access`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}) as any);
  if (!res.ok) {
    const err = new Error(body?.error || 'The access request could not be submitted.') as Error & {
      code?: string;
      fields?: Record<string, string>;
      status?: number;
    };
    err.code = body?.code;
    err.fields = body?.fields;
    err.status = res.status;
    throw err;
  }
  return body;
}

export const api = {
  fetchHealth,
  fetchDiagnostics,
  fetchDataSources,
  testDataSource,
  updateDataSourceConfig,
  fetchProvenance,
  verifyProvenanceRecord,
  forwardGeocode,
  reverseGeocode,
  fetchStates,
  fetchDistricts,
  fetchSubDistricts,
  fetchLocalities,
  importStructuredData,
  fetchCases,
  fetchCaseById,
  createCase,
  advanceStage,
  fetchWorkflows,
  fetchProjects,
  fetchDashboardAnalytics,
  fetchCaseGIS,
  updateCaseGeoJSON,
  createParcel,
  updateParcel,
  deleteParcel,
  fetchCaseDocuments,
  uploadCaseDocument,
  processDocument,
  validateDocument,
  fetchCaseIntelligence,
  runWhatIfSimulation,
  fetchCaseScenarios,
  updateRecommendationStatus,
  fetchPortfolioOperations,
  fetchAttentionQueue,
  fetchPolicies,
  fetchPolicyByKey,
  updatePolicyByKey,
  fetchNotifications,
  acknowledgeNotification,
  resolveNotification,
  fetchCaseDisputes,
  createCaseDispute,
  updateCaseDispute,
  fetchAccessRequestStatus,
  submitAccessRequest,
};

// ============================================================================
// DAY 2: LIVE EXTERNAL CONTEXT, SYNC & DISCREPANCIES API
// ============================================================================

export async function fetchCaseExternalContext(caseId: string, refresh = false): Promise<CaseExternalContextBundle> {
  const url = `${API_BASE}/cases/${caseId}/external-context${refresh ? '?refresh=true' : ''}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch case external context' }));
    throw new Error(err.error || 'Failed to fetch case external context');
  }
  return res.json();
}

export async function syncDataSource(sourceId: string, params: Record<string, any> = {}): Promise<any> {
  const res = await fetch(`${API_BASE}/data-sources/${sourceId}/sync`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to trigger sync' }));
    throw new Error(err.error || 'Failed to trigger sync');
  }
  return res.json();
}

export async function fetchDiscrepancies(filter: { entity_type?: string; entity_id?: string; resolution_state?: string } = {}): Promise<{ discrepancies: DataDiscrepancy[]; count: number }> {
  const query = new URLSearchParams(filter as any).toString();
  const res = await fetch(`${API_BASE}/discrepancies${query ? `?${query}` : ''}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch discrepancies');
  return res.json();
}

export async function resolveDiscrepancyRecord(
  id: string,
  state: 'acknowledged' | 'resolved' | 'dismissed',
  notes?: string
): Promise<{ success: boolean; discrepancy: DataDiscrepancy }> {
  const res = await fetch(`${API_BASE}/discrepancies/${id}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ state, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to resolve discrepancy' }));
    throw new Error(err.error || 'Failed to resolve discrepancy');
  }
  return res.json();
}

export async function fetchEntityObservation(entityType: string, entityId: string): Promise<{ observation: ExternalObservation }> {
  const res = await fetch(`${API_BASE}/observations?entity_type=${entityType}&entity_id=${entityId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch observation');
  return res.json();
}

// ============================================================================
// DAY 6: GIS & SPATIAL INTELLIGENCE APIS
// ============================================================================

export async function fetchGISOverview(): Promise<GISOverview> {
  const res = await fetch(`${API_BASE}/gis/overview`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch GIS overview (${res.status})`);
  }
  return res.json();
}

export async function fetchGISCases(params: Record<string, any> = {}): Promise<any> {
  const query = new URLSearchParams(
    Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '') as any
  ).toString();
  const res = await fetch(`${API_BASE}/gis/cases${query ? `?${query}` : ''}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch GIS cases (${res.status})`);
  }
  return res.json();
}

export async function fetchGISProjects(): Promise<any> {
  const res = await fetch(`${API_BASE}/gis/projects`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch GIS projects (${res.status})`);
  }
  return res.json();
}

export async function fetchGISParcels(caseId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/gis/parcels?case_id=${encodeURIComponent(caseId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch cadastral parcels (${res.status})`);
  }
  return res.json();
}

export async function fetchGISSpatialContext(caseId: string): Promise<CaseSpatialContext> {
  const res = await fetch(`${API_BASE}/gis/spatial-context/${encodeURIComponent(caseId)}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch spatial context (${res.status})`);
  }
  return res.json();
}

export async function fetchGISNearby(
  lat: number,
  lng: number,
  radiusKm?: number
): Promise<{ search_center: [number, number]; radius_km: number; total_found: number; entities: NearbySpatialEntity[] }> {
  const url = `${API_BASE}/gis/nearby?lat=${lat}&lng=${lng}${radiusKm ? `&radius_km=${radiusKm}` : ''}`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to query nearby spatial entities (${res.status})`);
  }
  return res.json();
}

export async function fetchGISLayers(): Promise<{ layers: SpatialLayerInfo[] }> {
  const res = await fetch(`${API_BASE}/gis/layers`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch spatial layers (${res.status})`);
  }
  return res.json();
}

// ============================================================================
// DAY 8: INTEGRATION POLICY & MAP PROVIDER
// ============================================================================

export async function fetchIntegrationPolicy(): Promise<{ policy: IntegrationPolicy }> {
  const res = await fetch(`${API_BASE}/integrations/policy`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch integration policy (${res.status})`);
  }
  return res.json();
}

export async function updateIntegrationPolicyConfig(
  patch: Partial<IntegrationPolicy>
): Promise<{ success: boolean; policy: IntegrationPolicy }> {
  const res = await fetch(`${API_BASE}/integrations/policy`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to update integration policy (${res.status})`);
  }
  return res.json();
}

// ============================================================================
// BHUVAN / ISRO GEOSPATIAL SERVICES API
// ============================================================================

export async function fetchBhuvanCatalogue(workspace?: string): Promise<{
  catalogue: any[];
  count: number;
  verified_count: number;
  attribution: string;
  disclaimer: string;
}> {
  const url = workspace
    ? `${API_BASE}/integrations/bhuvan/catalogue?workspace=${encodeURIComponent(workspace)}`
    : `${API_BASE}/integrations/bhuvan/catalogue`;
  const res = await fetch(url, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch Bhuvan catalogue (${res.status})`);
  }
  return res.json();
}

export async function resolveBhuvanLayers(payload: {
  state_codes?: string[];
  state_names?: string[];
  bbox?: [number, number, number, number];
  workspace?: string;
}): Promise<{
  resolved_layers: Array<{
    layer: any;
    wms_url: string;
    applicable_jurisdiction?: string;
    status: 'available' | 'unavailable' | 'not_available_for_jurisdiction';
    reason?: string;
  }>;
  unsupported_jurisdictions: string[];
  total_resolved: number;
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/integrations/bhuvan/resolve-layers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to resolve Bhuvan layers (${res.status})`);
  }
  return res.json();
}

export async function fetchBhuvanHealth(): Promise<{
  status: 'operational' | 'degraded' | 'unavailable';
  response_time_ms: number;
  message: string;
  endpoint_checked: string;
  verified_layers_count: number;
  timestamp: string;
}> {
  const res = await fetch(`${API_BASE}/integrations/bhuvan/health`, { headers: getAuthHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to check Bhuvan health (${res.status})`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Administrative Access-Request Management API
// ---------------------------------------------------------------------------

export async function fetchAccessRequests(status?: string): Promise<{
  requests: AccessRequest[];
  count: number;
}> {
  const query = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(`${API_BASE}/auth/access-requests${query}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch access requests (${res.status})`);
  }
  return res.json();
}

export async function approveAccessRequest(
  id: string,
  payload: {
    role?: string;
    temporaryPassword?: string;
    reviewNote?: string;
  }
): Promise<{
  success: boolean;
  message: string;
  credentials?: {
    uid: string;
    email: string;
    role: string;
    temporaryPassword?: string;
  };
}> {
  const res = await fetch(`${API_BASE}/auth/access-requests/${id}/approve`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to approve access request (${res.status})`);
  }
  return res.json();
}

export async function rejectAccessRequest(
  id: string,
  payload: {
    reviewNote?: string;
  }
): Promise<{
  success: boolean;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/auth/access-requests/${id}/reject`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to reject access request (${res.status})`);
  }
  return res.json();
}





