# BhoomiSetu (भूमिसेतु)
### Statutory Land Acquisition Monitoring, Spatial Decision Intelligence & Inter-Agency Coordination Platform

BhoomiSetu is a modern government enterprise platform designed for transparent, data-driven statutory land acquisition (under the **RFCTLARR Act 2013**, NHAI Act, and State Land Policies). It unifies cadastral GIS demarcation, legal document intelligence, dynamic workflow state machines, and predictive risk analytics with zero domain hardcoding.

---

## 1. System Architecture & Foundation (Day 1)

Day 1 establishes the **Real Data + Integration Foundation** of BhoomiSetu:
- **Canonical Database Migrations**: 6 sequential numbered SQL migrations governing the entire PostgreSQL schema.
- **Provider-Independent Data Source Registry**: Tracks external adapters (Database, AI, Geocoding, Administrative Data) and reports live operational telemetry without storing secrets in the database.
- **Universal Data Provenance Ledger**: Categorizes data origins (`USER_ENTERED`, `DATABASE_DERIVED`, `EXTERNALLY_SOURCED`, `AI_EXTRACTED`, `AI_GENERATED_ASSISTED`, `SYSTEM_CALCULATED`) with human officer verification trails.
- **Pluggable Geocoding Adapter**: Standardized forward/reverse geocoding via OpenStreetMap Nominatim with strict usage policy compliance (1 req/sec rate limit, identifying User-Agent, 24-hour caching, WGS-84 coordinate validation, zero coordinate fabrication).
- **Authoritative Administrative Geography**: Sourced from the **Local Government Directory (LGD), Ministry of Panchayati Raj / Govt of India** under the Government Open Data License (GODL). Dynamic hierarchy without hardcoded state/district lists.
- **Reusable Data Import Pipeline**: High-throughput validation, normalization, and provenance-stamping for structured JSON, CSV, and GeoJSON datasets.
- **Server-Side Document Intelligence**: Gemini 1.5 Flash extraction with strict Zod schema validation, explicit missing/uncertain information isolation, and human-in-the-loop review.
- **Event-Driven Supabase Realtime**: Scoped strictly to internal application lifecycle events (`acquisition_cases`, `case_stage_instances`, `documents`, `case_notifications`) with reference-counted cleanup to prevent memory leaks.

---

## 2. Environment Configuration

All credentials are configured in `BhoomiSetu/.env`. **Never commit `.env` to Git.** Both root and project `.gitignore` protect local secrets.

### Variable Reference & Security Boundary

| Variable Name | Exposure Scope | Required For | Security Classification |
| :--- | :--- | :--- | :--- |
| `PORT` | Server | Express API port (Default: `3001`) | Public Configuration |
| `SUPABASE_URL` | Server | Backend Supabase client | Server-Only |
| `SUPABASE_ANON_KEY` | Server | Backend anon operations | Server-Only |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Privileged backend operations & storage | **High-Risk Secret (NEVER expose to client)** |
| `VITE_SUPABASE_URL` | Client (Browser) | Frontend Supabase client & Realtime | Bundled in Client JS |
| `VITE_SUPABASE_ANON_KEY` | Client (Browser) | Frontend Supabase client & Realtime | Public Client Key (Protected by RLS) |
| `GEMINI_API_KEY` | Server | Document Intelligence extraction | **High-Risk Secret (NEVER prefix with `VITE_`)** |
| `DATABASE_URL` | Server (Optional) | Direct PostgreSQL connection for migrations | **High-Risk Secret** |
| `MAPTILER_API_KEY` | Server (Optional) | MapTiler Cloud basemap health probes | Server-Only (Optional) |
| `VITE_MAPTILER_API_KEY` | Client (Optional) | High-res MapTiler basemap cartography in Leaflet | Client-Facing Key (Restricted by domain/referrer) |

> [!CAUTION]
> **Strict Secret Isolation**:
> Any variable prefixed with `VITE_` is compiled directly into client-side JavaScript and is visible in the browser.
> **`GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must NEVER have a `VITE_` prefix.**

---

## 3. Database Migrations

The canonical migrations are located in `supabase/migrations/` and execute in sequential order:

1. `20260920000001_initial_schema.sql` (Core entities, enums, RLS, Storage bucket)
2. `20260920000002_day2_gis_documents.sql` (Document statuses, spatial indexes)
3. `20260920000003_day3_intelligence.sql` (Bottlenecks, recommendations)
4. `20260920000004_day4_portfolio_operations.sql` (Portfolio indexes, SLA queries)
5. `20260920000005_day5_policy_notifications.sql` (System policies, notification alerts, audit expansion)
6. `20260920000006_day1_data_foundation.sql` (Data Source Registry, Provenance ledger, Administrative Units, Import Batches)

### Running & Verifying Migrations

To verify remote database schema completeness:
```powershell
bun run migrate:verify
```

To execute migrations via PostgreSQL (when `DATABASE_URL` is configured in `.env`):
```powershell
bun run migrate --apply
```

Or apply via the Supabase CLI:
```powershell
bun x supabase db push
```

---

## 4. Local Development

### Prerequisites
- [Bun](https://bun.sh/) (v1.3+ recommended) or Node.js (v20+)

### 1. Install Dependencies
```powershell
bun install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your Supabase and Gemini credentials:
```powershell
cp .env.example .env
```

### 3. Run Automated Tests
Execute the comprehensive test suite (64 tests across 10 test modules):
```powershell
bun test
```

### 4. Start Development Servers
Start both the Express backend (`http://localhost:3001`) and Vite frontend (`http://localhost:5173`) concurrently:
```powershell
bun run dev
```

### 5. Production Build
Verify TypeScript types and build the production bundle:
```powershell
bun run lint
bun run build
```

---

## 5. Provenance & Operational Governance

Every spatial coordinate, parcel boundary, and statutory notice is tagged with immutable origin metadata:
- **`USER_ENTERED`**: Manual entry by authenticated officers.
- **`DATABASE_DERIVED`**: Computed aggregations from verified records.
- **`EXTERNALLY_SOURCED`**: Official government feeds (LGD India, OpenStreetMap).
- **`AI_EXTRACTED`**: Gemini 1.5 Flash extraction (stored in `document_extractions` with status `validation_required` awaiting human review).
- **`SYSTEM_CALCULATED`**: Deterministic statutory math (SLA breach days, DAG schedule shifts).

The system maintains a zero-fabrication policy: missing or uncertain legal fields are explicitly isolated in `missing_or_uncertain_information` rather than synthesized.
