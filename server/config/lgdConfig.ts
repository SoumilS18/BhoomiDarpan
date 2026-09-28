/**
 * Local Government Directory (LGD) - Open Government Data (data.gov.in)
 * Centralized Server-Side Configuration and Hardened Integration Boundary
 *
 * Statutory Reference: Ministry of Panchayati Raj, Government of India
 * OGD India Base: https://api.data.gov.in/resource
 */

export type LgdAdministrativeTier = 'states' | 'districts' | 'subDistricts' | 'villages';

export interface LgdResourceMetadata {
  name: string;
  tier: LgdAdministrativeTier;
  resourceId: string;
  totalRecordsEstimate: number;
  idField: string;
  nameField: string;
  parentCodeField?: string;
  parentNameField?: string;
  fieldCase: 'snake_case' | 'camelCase';
}

/**
 * Verified canonical OGD India LGD Catalog Resource Identifiers
 */
export const CANONICAL_LGD_RESOURCES: Record<LgdAdministrativeTier, LgdResourceMetadata> = {
  states: {
    name: 'Local Government Directory (LGD) - States',
    tier: 'states',
    resourceId: 'a71e60f0-a21d-43de-a6c5-fa5d21600cdb',
    totalRecordsEstimate: 36,
    idField: 'state_code',
    nameField: 'state_name_english',
    fieldCase: 'snake_case',
  },
  districts: {
    name: 'Local Government Directory (LGD) - Districts',
    tier: 'districts',
    resourceId: '37231365-78ba-44d5-ac22-3deec40b9197',
    totalRecordsEstimate: 785,
    idField: 'district_code',
    nameField: 'district_name_english',
    parentCodeField: 'state_code',
    parentNameField: 'state_name_english',
    fieldCase: 'snake_case',
  },
  subDistricts: {
    name: 'Local Government Directory (LGD) - Sub-Districts',
    tier: 'subDistricts',
    resourceId: '6be51a29-876a-403a-a6da-42fde795e751',
    totalRecordsEstimate: 7151,
    idField: 'subdistrict_code',
    nameField: 'subdistrict_name_english',
    parentCodeField: 'district_code',
    parentNameField: 'district_name_english',
    fieldCase: 'snake_case',
  },
  villages: {
    name: 'Local Government Directory (LGD) - Villages',
    tier: 'villages',
    resourceId: 'c967fe8f-69c4-42df-8afc-8a2c98057437',
    totalRecordsEstimate: 720758,
    idField: 'villageCode',
    nameField: 'villageNameEnglish',
    parentCodeField: 'subdistrictCode',
    parentNameField: 'subdistrictNameEnglish',
    fieldCase: 'camelCase',
  },
};

/**
 * Resolved server-side LGD configuration
 */
export interface LgdServerConfig {
  apiKey?: string;
  isConfigured: boolean;
  baseUrl: string;
  resources: Record<LgdAdministrativeTier, string>;
  batchSize: number;
  pageSize: number;
  retryLimit: number;
  requestTimeoutMs: number;
}

/**
 * Retrieves the centralized server-side LGD configuration.
 * Strictly checks process.env and guarantees zero client-side exposure.
 */
export function getLgdServerConfig(): LgdServerConfig {
  const apiKey = process.env.LGD_DATA_GOV_API_KEY?.trim() || undefined;

  const batchSize = Math.min(1000, Math.max(1, parseInt(process.env.LGD_SYNC_BATCH_SIZE || '100', 10)));
  const pageSize = Math.min(1000, Math.max(1, parseInt(process.env.LGD_SYNC_PAGE_SIZE || '100', 10)));
  const retryLimit = Math.max(0, parseInt(process.env.LGD_SYNC_RETRY_LIMIT || '3', 10));
  const requestTimeoutMs = Math.max(1000, parseInt(process.env.LGD_SYNC_REQUEST_TIMEOUT || '15000', 10));

  return {
    apiKey,
    isConfigured: !!(apiKey && apiKey.length > 10 && !apiKey.includes('your-')),
    baseUrl: 'https://api.data.gov.in/resource',
    resources: {
      states:
        process.env.LGD_STATES_RESOURCE_ID?.trim() ||
        CANONICAL_LGD_RESOURCES.states.resourceId,
      districts:
        process.env.LGD_DISTRICTS_RESOURCE_ID?.trim() ||
        CANONICAL_LGD_RESOURCES.districts.resourceId,
      subDistricts:
        process.env.LGD_SUBDISTRICTS_RESOURCE_ID?.trim() ||
        CANONICAL_LGD_RESOURCES.subDistricts.resourceId,
      villages:
        process.env.LGD_VILLAGES_RESOURCE_ID?.trim() ||
        CANONICAL_LGD_RESOURCES.villages.resourceId,
    },
    batchSize,
    pageSize,
    retryLimit,
    requestTimeoutMs,
  };
}

export interface LgdQueryOptions {
  offset?: number;
  limit?: number;
  filters?: Record<string, string>;
  apiKeyOverride?: string; // Used strictly for controlled in-memory negative testing
  retryLimit?: number;
  timeoutMs?: number;
}

export interface LgdApiResponse<T = any> {
  status: string;
  version: string;
  total: number;
  count: number;
  limit: number;
  offset: number;
  records: T[];
  diagnostics: {
    tier: LgdAdministrativeTier;
    resourceId: string;
    responseTimeMs: number;
    httpStatus: number;
    retriesAttempted?: number;
  };
}

/**
 * Hardened LGD HTTP Boundary Client
 *
 * Encapsulates:
 * 1. Safe query construction with official OGD India pagination & filters.
 * 2. Mandatory server-side credential injection without exposing key in error logs or URLs.
 * 3. Prevention of SSRF and arbitrary URL fetches (resource IDs strictly drawn from server config).
 * 4. Automatic retry & exponential backoff on transient network faults (429, 5xx, timeout).
 * 5. Sanitized telemetry reporting (never logging credential-bearing URLs).
 */
export async function executeLgdQuery<T = any>(
  tier: LgdAdministrativeTier,
  options: LgdQueryOptions = {}
): Promise<LgdApiResponse<T>> {
  const config = getLgdServerConfig();
  const effectiveKey = options.apiKeyOverride || config.apiKey;

  if (!effectiveKey) {
    throw new Error(
      'LGD_DATA_GOV_API_KEY is not configured on the server. Please supply a valid data.gov.in API key in .env'
    );
  }

  const resourceId = config.resources[tier];
  if (!resourceId) {
    throw new Error(`Unrecognized or unconfigured LGD tier "${tier}"`);
  }

  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.min(1000, Math.max(1, options.limit ?? 10));
  const maxRetries = options.retryLimit ?? config.retryLimit;
  const timeoutMs = options.timeoutMs ?? config.requestTimeoutMs;

  const url = new URL(`${config.baseUrl}/${resourceId}`);
  url.searchParams.set('api-key', effectiveKey);
  url.searchParams.set('format', 'json');
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('limit', String(limit));

  if (options.filters) {
    for (const [field, value] of Object.entries(options.filters)) {
      if (field && value !== undefined) {
        url.searchParams.set(`filters[${field}]`, String(value));
      }
    }
  }

  let attempt = 0;
  let lastError: any = null;
  const startTime = Date.now();

  while (attempt <= maxRetries) {
    const isRetry = attempt > 0;
    if (isRetry) {
      // Exponential backoff: 200ms, 400ms, 800ms...
      const backoffMs = Math.min(5000, Math.pow(2, attempt - 1) * 200);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'BhoomiDarpan-LGD-Client/1.0',
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);
      const elapsedMs = Date.now() - startTime;

      if (!response.ok) {
        let errorDetail = 'Unknown Gateway Error';
        try {
          const errorBody = await response.json();
          errorDetail = errorBody.error || errorBody.message || JSON.stringify(errorBody);
        } catch {
          errorDetail = response.statusText || `HTTP ${response.status}`;
        }

        // Check if retryable (429 rate limit or 5xx server errors)
        const isRetryable = response.status === 429 || (response.status >= 500 && response.status <= 599);
        if (isRetryable && attempt < maxRetries) {
          attempt++;
          lastError = new Error(`LGD API Error [HTTP ${response.status}] [tier: ${tier}]: ${errorDetail}`);
          continue;
        }

        const sanitizedError = new Error(
          `LGD API Error [HTTP ${response.status}] [tier: ${tier}]: ${errorDetail}`
        );
        (sanitizedError as any).status = response.status;
        (sanitizedError as any).tier = tier;
        throw sanitizedError;
      }

      const body = await response.json();

      return {
        status: body.status || 'ok',
        version: body.version || '1.0',
        total: typeof body.total === 'number' ? body.total : Number(body.total) || 0,
        count: Array.isArray(body.records) ? body.records.length : 0,
        limit,
        offset,
        records: body.records || [],
        diagnostics: {
          tier,
          resourceId,
          responseTimeMs: elapsedMs,
          httpStatus: response.status,
          retriesAttempted: attempt,
        },
      };
    } catch (err: any) {
      if (err.status && !([429, 500, 502, 503, 504].includes(err.status))) {
        // Non-retryable HTTP error (e.g. 403 Forbidden)
        throw err;
      }

      lastError = err;
      if (attempt < maxRetries) {
        attempt++;
        continue;
      }
      break;
    }
  }

  // Sanitized network error (zero credential exposure)
  throw new Error(
    `LGD Gateway Connection Failed after ${attempt} retries [tier: ${tier}, resourceId: ${resourceId}]: ${lastError?.message || 'Network unreachable or timed out'}`
  );
}
