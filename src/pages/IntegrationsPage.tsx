import React, { useState, useEffect } from 'react';
import {
  fetchDataSources,
  testDataSource,
  fetchDiagnostics,
  importStructuredData,
  updateDataSourceConfig,
  syncDataSource,
  fetchDiscrepancies,
  resolveDiscrepancyRecord,
} from '../lib/api';
import { DataSource, IntegrationDiagnostics, ImportSummary, DataDiscrepancy } from '../../shared/types';
import {
  Database,
  Bot,
  MapPin,
  Building,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  UploadCloud,
  FileSpreadsheet,
  Globe,
  Clock,
  ShieldAlert,
  Sliders,
  CloudSun,
  Layers,
} from 'lucide-react';
import { clsx } from 'clsx';
import { ProvenanceBadge } from '../components/common/ProvenanceBadge';

export const IntegrationsPage: React.FC = () => {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [diagnostics, setDiagnostics] = useState<IntegrationDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { operational: boolean; message: string; ms: number }>>({});
  const [syncMessages, setSyncMessages] = useState<Record<string, { success: boolean; message: string }>>({});
  const [discrepancies, setDiscrepancies] = useState<DataDiscrepancy[]>([]);

  // Import Pipeline State
  const [importBatchType, setImportBatchType] = useState<'administrative_units' | 'parcels'>('administrative_units');
  const [importFormat, setImportFormat] = useState<'json' | 'csv' | 'geojson'>('json');
  const [importDataText, setImportDataText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [srcRes, diagRes, discRes] = await Promise.all([
        fetchDataSources().catch(() => ({ sources: [], count: 0 })),
        fetchDiagnostics().catch(() => null),
        fetchDiscrepancies().catch(() => ({ discrepancies: [], count: 0 })),
      ]);
      setSources(srcRes.sources || []);
      setDiagnostics(diagRes);
      setDiscrepancies(discRes.discrepancies || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleTestConnectivity = async (id: string) => {
    setTestingId(id);
    try {
      const res = await testDataSource(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          operational: res.operational,
          message: res.message,
          ms: res.response_time_ms || 0,
        },
      }));
      // Refresh registry state
      const refreshed = await fetchDataSources();
      setSources(refreshed.sources || []);
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          operational: false,
          message: err.message || 'Test failed',
          ms: 0,
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleToggleEnabled = async (id: string, currentEnabled: boolean) => {
    try {
      await updateDataSourceConfig(id, { is_enabled: !currentEnabled });
      const refreshed = await fetchDataSources();
      setSources(refreshed.sources || []);
    } catch (err: any) {
      alert(`Failed to toggle source: ${err.message}`);
    }
  };

  const handleExecuteImport = async () => {
    if (!importDataText.trim()) {
      setImportError('Please enter valid data to import.');
      return;
    }

    setImportError(null);
    setIsImporting(true);
    try {
      let rawData: any = importDataText;
      if (importFormat === 'json' || importFormat === 'geojson') {
        try {
          rawData = JSON.parse(importDataText);
        } catch (e: any) {
          throw new Error(`Invalid JSON: ${e.message}`);
        }
      }

      const res = await importStructuredData({
        raw_data: rawData,
        batch_type: importBatchType,
        format: importFormat,
        source_id: importBatchType === 'administrative_units' ? 'lgd_india' : 'manual_import',
        source_record_ref: `Batch-${Date.now()}`,
      });

      setImportSummary(res.summary);
      setImportDataText('');
      loadAll();
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleTriggerSync = async (id: string) => {
    setSyncingId(id);
    try {
      const res = await syncDataSource(id);
      setSyncMessages((prev) => ({
        ...prev,
        [id]: { success: res.success, message: res.message },
      }));
      const refreshed = await fetchDataSources();
      setSources(refreshed.sources || []);
    } catch (err: any) {
      setSyncMessages((prev) => ({
        ...prev,
        [id]: { success: false, message: err.message || 'Sync failed' },
      }));
    } finally {
      setSyncingId(null);
    }
  };

  const handleResolveDisc = async (id: string) => {
    try {
      await resolveDiscrepancyRecord(id, 'resolved', 'Verified and reconciled by officer');
      const discRes = await fetchDiscrepancies();
      setDiscrepancies(discRes.discrepancies || []);
    } catch (err: any) {
      alert(`Failed to resolve discrepancy: ${err.message}`);
    }
  };

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'database':
        return Database;
      case 'ai':
        return Bot;
      case 'geocoding':
        return MapPin;
      case 'administrative_data':
        return Building;
      case 'weather':
        return CloudSun;
      default:
        return Globe;
    }
  };

  const getStatusBadge = (status: string, isEnabled: boolean) => {
    if (!isEnabled) {
      return (
        <span className="px-2 py-0.5 text-[11px] font-bold rounded bg-slate-100 text-slate-600 border border-slate-300">
          DISABLED
        </span>
      );
    }

    switch (status) {
      case 'operational':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            OPERATIONAL
          </span>
        );
      case 'configured':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="h-3 w-3" />
            CONFIGURED
          </span>
        );
      case 'not_configured':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="h-3 w-3" />
            NOT CONFIGURED
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-yellow-100 text-yellow-800 border border-yellow-300">
            <AlertTriangle className="h-3 w-3" />
            DEGRADED
          </span>
        );
      case 'failed':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-300">
            <XCircle className="h-3 w-3" />
            FAILED
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-sand-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-terra-700 text-white rounded shadow-2xs">
              System Core
            </span>
          </div>
          <h1 className="text-2xl font-bold text-mocha-900 mt-1 tracking-tight font-sans">
            Data Source Registry &amp; Integration Diagnostics
          </h1>
          <p className="text-xs text-mocha-500 mt-0.5">
            Institutional ledger of external providers, operational telemetry, provenance governance, and administrative data ingestion.
          </p>
        </div>

        <button
          onClick={loadAll}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm self-start"
        >
          <RefreshCw className={clsx('h-3.5 w-3.5', loading && 'animate-spin')} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {/* Diagnostics Banner */}
      {diagnostics && (
        <div
          className={clsx(
            'p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4',
            diagnostics.status === 'healthy'
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
              : diagnostics.status === 'degraded'
              ? 'bg-amber-50/70 border-amber-200 text-amber-900'
              : 'bg-slate-50 border-slate-200 text-slate-800'
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={clsx(
                'p-2 rounded-lg',
                diagnostics.status === 'healthy'
                  ? 'bg-emerald-100 text-emerald-700'
                  : diagnostics.status === 'degraded'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-200 text-slate-700'
              )}
            >
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide">
                  System Telemetry: {diagnostics.status.toUpperCase()}
                </span>
                <span className="text-[11px] opacity-75 font-mono">
                  {new Date(diagnostics.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs mt-0.5 font-medium">{diagnostics.diagnostic_summary}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Registered Sources</span>
              <span className="font-bold text-slate-800 font-mono">
                {diagnostics.data_sources.total_registered}
              </span>
            </div>
            <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Operational</span>
              <span className="font-bold text-emerald-700 font-mono">
                {diagnostics.data_sources.operational_count}
              </span>
            </div>
            <div className="bg-white/80 px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Pending / Unconfigured</span>
              <span className="font-bold text-amber-700 font-mono">
                {diagnostics.data_sources.unconfigured_count}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Registered Data Sources Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gov-slate uppercase tracking-wider flex items-center gap-2">
          <Sliders className="h-4 w-4 text-gov-navy" />
          <span>Configured External Integration Adapters</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sources.map((src) => {
            const Icon = getSourceIcon(src.type);
            const testRes = testResults[src.id];

            return (
              <div
                key={src.id}
                className={clsx(
                  'bg-white rounded-xl border p-5 transition-all shadow-gov flex flex-col justify-between',
                  src.is_enabled ? 'border-slate-200' : 'border-slate-200 opacity-60 bg-slate-50/50'
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-blue-50 text-gov-navy border border-blue-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-gov-slate">{src.name}</h3>
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium">
                          Provider: <strong>{src.provider}</strong>
                        </span>
                      </div>
                    </div>

                    <div>{getStatusBadge(src.status, src.is_enabled)}</div>
                  </div>

                  <p className="text-xs text-slate-600 mt-3 leading-relaxed">{src.data_scope}</p>

                  {/* Metadata info */}
                  <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Sync Strategy</span>
                      <span className="font-mono uppercase font-semibold text-gov-slate">
                        {src.sync_mode.replace('_', ' ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Server Secret Key Refs</span>
                      <span className="font-mono text-[10px] text-slate-700">
                        {src.env_secret_keys && src.env_secret_keys.length > 0
                          ? src.env_secret_keys.join(', ')
                          : 'None (Open Provider)'}
                      </span>
                    </div>
                  </div>

                  {/* Sync & Timestamps info */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500">
                    <div>
                      <span>Last Successful Sync: </span>
                      <strong className="font-mono text-slate-700">
                        {src.last_successful_sync
                          ? new Date(src.last_successful_sync).toLocaleTimeString()
                          : 'Never'}
                      </strong>
                    </div>
                    {src.error_details && (
                      <div className="text-rose-600 font-medium truncate max-w-xs" title={src.error_details}>
                        Error: {src.error_details}
                      </div>
                    )}
                  </div>

                  {/* Sync Message banner */}
                  {syncMessages[src.id] && (
                    <div
                      className={clsx(
                        'mt-2.5 p-2 rounded text-xs',
                        syncMessages[src.id].success
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      )}
                    >
                      {syncMessages[src.id].message}
                    </div>
                  )}

                  {/* Test Result Message */}
                  {testRes && (
                    <div
                      className={clsx(
                        'mt-3 p-2.5 rounded-lg text-xs border flex items-start gap-2',
                        testRes.operational
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-800'
                      )}
                    >
                      {testRes.operational ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                      )}
                      <div>
                        <span className="font-semibold">{testRes.message}</span>
                        {testRes.ms > 0 && (
                          <span className="font-mono text-[10px] ml-1.5 opacity-80">
                            ({testRes.ms}ms)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleToggleEnabled(src.id, src.is_enabled)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline transition"
                  >
                    {src.is_enabled ? 'Disable Source' : 'Enable Source'}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTriggerSync(src.id)}
                      disabled={syncingId === src.id || !src.is_enabled}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition disabled:opacity-50 border border-slate-300"
                    >
                      <RefreshCw className={clsx('h-3 w-3', syncingId === src.id && 'animate-spin')} />
                      <span>{syncingId === src.id ? 'Syncing...' : 'Sync Now'}</span>
                    </button>

                    <button
                      onClick={() => handleTestConnectivity(src.id)}
                      disabled={testingId === src.id || !src.is_enabled}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gov-navy text-white text-xs font-semibold rounded-lg hover:bg-blue-900 transition disabled:opacity-50"
                    >
                      <RefreshCw className={clsx('h-3 w-3', testingId === src.id && 'animate-spin')} />
                      <span>{testingId === src.id ? 'Testing...' : 'Test Handshake'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cross-Source Discrepancies Audit Ledger */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-gov space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gov-slate">
                Cross-Source Discrepancy Detection &amp; Reconciliation
              </h2>
              <p className="text-xs text-slate-500">
                Automated detection of conflicting coordinates, administrative boundaries, and measurements across authoritative providers.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">
            {discrepancies.length} Active
          </span>
        </div>

        {discrepancies.length === 0 ? (
          <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200/70 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>Zero conflicting cross-source records detected. When single source is active: Insufficient sources for cross-source comparison.</span>
          </div>
        ) : (
          <div className="space-y-3">
            {discrepancies.map((d) => (
              <div
                key={d.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">
                      Mismatch in {d.compared_field.toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                      {d.severity.toUpperCase()}
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      Entity: {d.entity_type}/{d.entity_id}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    <span className="font-semibold">{d.source_a}:</span> {JSON.stringify(d.value_a)} vs{' '}
                    <span className="font-semibold">{d.source_b}:</span> {JSON.stringify(d.value_b)}
                  </div>
                </div>

                <button
                  onClick={() => handleResolveDisc(d.id)}
                  className="px-3 py-1.5 bg-gov-navy text-white text-xs font-semibold rounded hover:bg-blue-900 transition"
                >
                  Mark Reconciled
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Data Import Pipeline & Administrative Ingestion */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-gov space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gov-slate">
                Structured Data Import Pipeline (LGD &amp; Cadastral Ingestion)
              </h2>
              <p className="text-xs text-slate-500">
                Ingest official government datasets (JSON, CSV, GeoJSON) with schema validation, provenance attachment, and duplicate detection.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[11px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">
            RLS Protected
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Entity Type</label>
            <select
              value={importBatchType}
              onChange={(e) => setImportBatchType(e.target.value as any)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white"
            >
              <option value="administrative_units">Administrative Units (State/Dist/Tehsil/Village)</option>
              <option value="parcels">Cadastral Land Parcels (Survey Numbers &amp; Geometry)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Data Format</label>
            <select
              value={importFormat}
              onChange={(e) => setImportFormat(e.target.value as any)}
              className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white"
            >
              <option value="json">JSON Array</option>
              <option value="csv">CSV (Comma-Separated Values)</option>
              <option value="geojson">GeoJSON FeatureCollection</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Authoritative Source</label>
            <input
              type="text"
              readOnly
              value={importBatchType === 'administrative_units' ? 'LGD India (GODL)' : 'State Revenue Survey'}
              className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-slate-50 text-slate-600 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Data Content ({importFormat.toUpperCase()})
          </label>
          <textarea
            rows={6}
            value={importDataText}
            onChange={(e) => setImportDataText(e.target.value)}
            placeholder={
              importFormat === 'json'
                ? '[\n  {\n    "unit_type": "state",\n    "code": "LGD_STATE_CODE",\n    "name": "LGD_OFFICIAL_NAME"\n  }\n]'
                : importFormat === 'csv'
                ? 'unit_type,code,name,state_code\nstate,LGD_STATE_CODE,LGD_OFFICIAL_NAME,'
                : '{\n  "type": "FeatureCollection",\n  "features": []\n}'
            }
            className="w-full font-mono text-xs border border-slate-300 rounded-lg p-3 bg-slate-50 focus:bg-white transition"
          />
        </div>

        {importError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{importError}</span>
          </div>
        )}

        {importSummary && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Import Execution Completed ({importSummary.status.toUpperCase()})
              </span>
              <span className="font-mono text-[11px]">{importSummary.batch_id}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs pt-2 border-t border-emerald-200/60">
              <div>
                <span className="text-emerald-700 block text-[10px]">Received</span>
                <span className="font-bold font-mono text-emerald-950">{importSummary.total_received}</span>
              </div>
              <div>
                <span className="text-emerald-700 block text-[10px]">Accepted</span>
                <span className="font-bold font-mono text-emerald-950">{importSummary.accepted}</span>
              </div>
              <div>
                <span className="text-emerald-700 block text-[10px]">Rejected</span>
                <span className="font-bold font-mono text-rose-800">{importSummary.rejected}</span>
              </div>
              <div>
                <span className="text-emerald-700 block text-[10px]">Duplicates</span>
                <span className="font-bold font-mono text-amber-800">{importSummary.duplicates}</span>
              </div>
            </div>
            {importSummary.validation_errors.length > 0 && (
              <div className="text-[11px] text-rose-800 pt-1">
                Errors: {importSummary.validation_errors.map((e) => e.message).join('; ')}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={handleExecuteImport}
            disabled={isImporting || !importDataText.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gov-navy text-white text-xs font-semibold rounded-lg hover:bg-blue-900 transition disabled:opacity-50"
          >
            <UploadCloud className={clsx('h-4 w-4', isImporting && 'animate-spin')} />
            <span>{isImporting ? 'Processing Batch...' : 'Execute Data Import'}</span>
          </button>
        </div>
      </div>

      {/* Provenance Classification Taxonomy Guide */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h3 className="font-bold text-gov-slate uppercase tracking-wider flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-gov-navy" />
          <span>Statutory Data Provenance Governance</span>
        </h3>
        <p className="text-slate-600 leading-relaxed">
          Every field, parcel boundary, and statutory notice in BhoomiSetu carries an unforgeable origin classification to maintain judicial integrity under RFCTLARR 2013.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <ProvenanceBadge type="USER_ENTERED" />
          <ProvenanceBadge type="DATABASE_DERIVED" />
          <ProvenanceBadge type="EXTERNALLY_SOURCED" sourceName="LGD India" />
          <ProvenanceBadge type="AI_EXTRACTED" />
          <ProvenanceBadge type="AI_GENERATED_ASSISTED" />
          <ProvenanceBadge type="SYSTEM_CALCULATED" />
        </div>
      </div>
    </div>
  );
};
