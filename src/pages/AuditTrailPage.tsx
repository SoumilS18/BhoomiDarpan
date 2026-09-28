import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Info,
  RefreshCw,
  Download,
  Shield,
  ShieldCheck,
  Clock,
  User,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { AuditTrailEvent, AuditSeverity } from '../../shared/types';
import { fetchAuditTrail } from '../lib/api';

const SEVERITY_BADGES: Record<AuditSeverity, { label: string; bg: string; text: string; border: string }> = {
  info: { label: 'Operational Event', bg: 'bg-sand-100', text: 'text-mocha-800', border: 'border-sand-300' },
  warning: { label: 'Policy / Parameter Change', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-300' },
  critical: { label: 'Statutory Action / Override', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-300' },
};

export const AuditTrailPage: React.FC = () => {
  const [events, setEvents] = useState<AuditTrailEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchAuditTrail({
        severity: severityFilter as any,
        entity_type: entityFilter,
        search,
      });
      setEvents(res.events);
      setTotal(res.total);
    } catch (err: any) {
      alert(err.message || 'Failed to load audit trail');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [severityFilter, entityFilter]);

  const handleExportCsv = () => {
    window.open('/api/audit-trail/export', '_blank');
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Immutable Audit Trail
            <span className="rounded bg-sand-200/80 px-2 py-0.5 text-xs font-normal text-mocha-700">अपरिवर्तनीय लेखापरीक्षा पंजी</span>
          </span>
        }
        subtitle="Tamper-evident, cryptographically timestamped log of statutory stage advancements, awards, disbursements & policy changes"
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 text-sand-500" />
              Refresh
            </button>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Export Audit CSV
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-sand-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search actions, actors, hash signatures..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 focus:outline-none focus:ring-2 focus:ring-terra-600 text-mocha-900 bg-sand-50/50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Filter className="h-3.5 w-3.5 text-mocha-500" />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:outline-none focus:ring-2 focus:ring-terra-600"
          >
            <option value="all">All Entity Types</option>
            <option value="case">Case Lifecycle</option>
            <option value="rehab_plan">R&R Scheme</option>
            <option value="affected_family">Affected Family</option>
            <option value="policy">System Policy</option>
            <option value="document">Document Vault</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-2.5 py-1.5 bg-white text-mocha-800 focus:outline-none focus:ring-2 focus:ring-terra-600"
          >
            <option value="all">All Event Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Events Timeline List */}
      <div className="bg-white rounded-xl border border-sand-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-sand-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-mocha-800">
              Verified Event Ledger ({total} events logged)
            </h3>
          </div>
          <span className="text-[11px] text-mocha-500 font-mono">Secured with Cryptographic Hashes</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-mocha-500 text-xs">Loading audit ledger...</div>
        ) : events.length === 0 ? (
          <EmptyState
            title="No Audit Events Found"
            description="No events match the selected filters."
          />
        ) : (
          <div className="divide-y divide-sand-200/70">
            {events.map((ev) => {
              const sev = SEVERITY_BADGES[ev.severity] || SEVERITY_BADGES.info;
              return (
                <div key={ev.id} className="p-4 hover:bg-sand-50/50 transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-bold text-sand-500">#{ev.sequence_id}</span>
                      <span className="text-xs font-bold text-mocha-900 font-mono">{ev.action}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${sev.bg} ${sev.text} ${sev.border}`}>
                        {sev.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-mocha-500">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(ev.timestamp).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <p className="text-xs text-mocha-800 leading-relaxed font-medium">
                    {ev.changes_summary}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-sand-100 text-[11px] text-mocha-600">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3 w-3 text-mocha-400" />
                      <span>
                        <strong className="text-mocha-800">{ev.actor_name}</strong> ({ev.actor_role}) • {ev.actor_email}
                      </span>
                    </div>

                    {ev.statutory_ref && (
                      <span className="text-[10px] font-semibold text-terra-800 bg-sand-100/60 px-2 py-0.5 rounded">
                        {ev.statutory_ref}
                      </span>
                    )}

                    <div className="font-mono text-[9px] text-sand-500 truncate max-w-xs" title={ev.hash_signature}>
                      Hash: {ev.hash_signature}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
