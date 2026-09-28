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
  Plus,
  X,
  FileCheck2,
} from 'lucide-react';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/EmptyState';
import { AuditTrailEvent, AuditSeverity } from '../../shared/types';
import { fetchAuditTrail, createAuditEvent } from '../lib/api';

const SEVERITY_BADGES: Record<AuditSeverity, { label: string; bg: string; text: string; border: string }> = {
  info: { label: 'Operational Event', bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', text: '', border: '' },
  warning: { label: 'Policy / Parameter Change', bg: 'bg-amber-50 text-amber-800 border-amber-300', text: '', border: '' },
  critical: { label: 'Statutory Action / Override', bg: 'bg-rose-50 text-rose-800 border-rose-300', text: '', border: '' },
};

export const AuditTrailPage: React.FC = () => {
  const [events, setEvents] = useState<AuditTrailEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [copiedHashId, setCopiedHashId] = useState<string | null>(null);

  // Add Observation Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    action: 'STATUTORY_FIELD_INSPECTION_RECORDED',
    entity_type: 'case',
    entity_id: 'MH-PUN-2026-0089',
    entity_title: 'Pune Outer Ring Road - Western Alignment',
    severity: 'info' as AuditSeverity,
    statutory_ref: 'RFCTLARR Act 2013 Section 15(2)',
    changes_summary: '',
  });

  const handleCopyHash = (id: string, hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHashId(id);
    setTimeout(() => setCopiedHashId(null), 2000);
  };

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

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.changes_summary.trim()) {
      setFormError('Inspection summary / audit observation is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const newEv = await createAuditEvent({
        action: formData.action,
        entity_type: formData.entity_type,
        entity_id: formData.entity_id,
        entity_title: formData.entity_title,
        severity: formData.severity,
        statutory_ref: formData.statutory_ref,
        changes_summary: formData.changes_summary,
      });

      setEvents((prev) => [newEv, ...prev]);
      setTotal((prev) => prev + 1);
      setShowAddModal(false);
      setFormData({
        action: 'STATUTORY_FIELD_INSPECTION_RECORDED',
        entity_type: 'case',
        entity_id: 'MH-PUN-2026-0089',
        entity_title: 'Pune Outer Ring Road - Western Alignment',
        severity: 'info',
        statutory_ref: 'RFCTLARR Act 2013 Section 15(2)',
        changes_summary: '',
      });
    } catch (err: any) {
      setFormError(err.message || 'Failed to record audit observation');
    } finally {
      setIsSubmitting(false);
    }
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
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Log Audit Observation
            </button>
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors shadow-2xs cursor-pointer"
            >
              <Download className="h-4 w-4 text-mocha-600" />
              Export Audit CSV
            </button>
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-sand-200 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search actions, actors, hash signatures..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadData()}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-sand-300 bg-sand-50/50 text-mocha-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-terra-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-3 py-1.5 bg-white text-mocha-800 focus:ring-2 focus:ring-terra-600 font-medium"
          >
            <option value="all">All Severity Levels</option>
            <option value="info">Operational Events (Info)</option>
            <option value="warning">Policy Changes (Warning)</option>
            <option value="critical">Statutory Actions (Critical)</option>
          </select>

          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="text-xs rounded-lg border border-sand-300 px-3 py-1.5 bg-white text-mocha-800 focus:ring-2 focus:ring-terra-600 font-medium"
          >
            <option value="all">All Entity Domains</option>
            <option value="case">Acquisition Cases</option>
            <option value="document">Legal Documents</option>
            <option value="policy">System Policies</option>
            <option value="rehab_plan">R&R Schemes</option>
            <option value="affected_family">PAF Entitlements</option>
          </select>
        </div>
      </div>

      {/* Event Stream */}
      <div className="space-y-3.5">
        {events.length > 0 ? (
          events.map((ev) => {
            const sevMeta = SEVERITY_BADGES[ev.severity] || SEVERITY_BADGES.info;

            return (
              <Card key={ev.id} className="p-5 hover:border-terra-300 hover:shadow-md transition-all border-sand-200 bg-[#FFFDF9]/95">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-terra-900 bg-sand-100/90 px-2 py-0.5 rounded border border-sand-300 shadow-2xs">
                        #{ev.sequence_id}
                      </span>
                      <h4 className="font-bold text-xs sm:text-sm text-mocha-950 tracking-tight">
                        {ev.action.replace(/_/g, ' ')}
                      </h4>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${sevMeta.bg}`}>
                        {sevMeta.label}
                      </span>
                    </div>

                    {ev.entity_title && (
                      <div className="text-xs text-mocha-800">
                        <span className="text-mocha-500 font-medium">Entity:</span>{' '}
                        <strong className="text-mocha-950 font-bold">{ev.entity_title}</strong>{' '}
                        <span className="text-terra-800 text-[10px] uppercase font-bold bg-sand-100 px-1.5 py-0.5 rounded border border-sand-200">
                          {ev.entity_type}
                        </span>
                      </div>
                    )}

                    {ev.changes_summary && (
                      <p className="text-xs text-mocha-700 leading-relaxed max-w-4xl bg-sand-50/60 p-2.5 rounded-lg border border-sand-200/70">
                        {ev.changes_summary}
                      </p>
                    )}

                    {/* Officer & Statutory Reference Metadata */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-mocha-600 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-mocha-400" />
                        <span>Actor: <strong className="text-mocha-900 font-semibold">{ev.actor_name}</strong> <span className="text-mocha-400 font-mono text-[11px]">({ev.actor_email})</span></span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-mocha-400">Role:</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider bg-terra-50 text-terra-800 border border-terra-200">
                          {ev.actor_role}
                        </span>
                      </div>
                      {ev.statutory_ref && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-mocha-400">Statutory Ref:</span>
                          <span className="font-semibold text-mocha-800 bg-sand-100/80 px-2 py-0.5 rounded text-[11px] border border-sand-200">{ev.statutory_ref}</span>
                        </div>
                      )}
                    </div>

                    {/* Cryptographic SHA-256 Hash */}
                    <div className="pt-2 border-t border-sand-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="text-[11px] text-mocha-500 font-medium shrink-0">SHA-256 Hash:</span>
                        <span className="font-mono text-[11px] text-mocha-700 bg-sand-100/90 px-2 py-0.5 rounded border border-sand-200/80 truncate max-w-xl select-all">
                          {ev.hash_signature}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyHash(ev.id, ev.hash_signature)}
                        className="text-[10px] font-semibold text-terra-700 hover:text-terra-900 bg-sand-100/60 hover:bg-sand-200/60 px-2 py-0.5 rounded border border-sand-300 transition-colors shrink-0 cursor-pointer"
                      >
                        {copiedHashId === ev.id ? 'Copied!' : 'Copy Hash'}
                      </button>
                    </div>
                  </div>

                  <div className="text-right shrink-0 min-w-[125px] pl-3 sm:border-l sm:border-sand-200/70 flex flex-col justify-center items-end self-start pt-0.5 pr-1">
                    <div className="text-[11px] font-bold text-mocha-900 whitespace-nowrap tracking-tight">
                      {new Date(ev.timestamp).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="text-[9px] text-mocha-500 font-mono mt-0.5 whitespace-nowrap font-medium tracking-tight">
                      {new Date(ev.timestamp).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true,
                      }).toUpperCase()}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <EmptyState
            title="No Audit Records Found"
            description="No audit trail events match the current filter selection."
          />
        )}
      </div>

      {/* Log Audit Observation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-mocha-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-sand-200 space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-sand-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-mocha-900 flex items-center gap-2">
                  <FileCheck2 className="h-5 w-5 text-terra-700" />
                  Record Statutory Audit Observation
                </h3>
                <p className="text-xs text-mocha-500 mt-0.5">
                  Append an immutable, cryptographically timestamped observation into the statutory ledger.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-sand-500 hover:bg-sand-100 hover:text-mocha-900 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-mocha-800 block mb-1">Audit Action Type</label>
                <select
                  value={formData.action}
                  onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                  className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-white text-mocha-900 focus:ring-2 focus:ring-terra-600"
                >
                  <option value="STATUTORY_FIELD_INSPECTION_RECORDED">Statutory Field Inspection Recorded</option>
                  <option value="SECTION_15_HEARING_MINUTES_FILED">Section 15 Hearing Minutes Filed</option>
                  <option value="COMPLIANCE_REVIEW_COMPLETED">CAG / Ministry Compliance Review Completed</option>
                  <option value="VALUATION_CROSS_VERIFICATION">Collector Valuation Cross-Verification</option>
                  <option value="R_AND_R_GRIEVANCE_AUDIT">R&R Entitlement Grievance Audit</option>
                  <option value="ADMINISTRATIVE_OVERRIDE_APPROVED">Administrative Override Approved</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Entity Domain</label>
                  <select
                    value={formData.entity_type}
                    onChange={(e) => setFormData({ ...formData, entity_type: e.target.value })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-white text-mocha-900 focus:ring-2 focus:ring-terra-600"
                  >
                    <option value="case">Acquisition Case</option>
                    <option value="document">Document Vault</option>
                    <option value="rehab_plan">Rehabilitation Scheme</option>
                    <option value="affected_family">Affected Family</option>
                    <option value="policy">System Policy</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-mocha-800 block mb-1">Severity</label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value as any })}
                    className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-white text-mocha-900 focus:ring-2 focus:ring-terra-600"
                  >
                    <option value="info">Operational (Info)</option>
                    <option value="warning">Policy Warning</option>
                    <option value="critical">Statutory Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-mocha-800 block mb-1">Entity Reference / Case Number</label>
                <input
                  type="text"
                  placeholder="e.g. MH-PUN-2026-0089"
                  value={formData.entity_id}
                  onChange={(e) => setFormData({ ...formData, entity_id: e.target.value, entity_title: e.target.value })}
                  className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-mocha-800 block mb-1">Statutory Act Reference</label>
                <input
                  type="text"
                  placeholder="e.g. RFCTLARR Act 2013 Section 15(2)"
                  value={formData.statutory_ref}
                  onChange={(e) => setFormData({ ...formData, statutory_ref: e.target.value })}
                  className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600"
                />
              </div>

              <div>
                <label className="font-semibold text-mocha-800 block mb-1">Observation Summary & Findings *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the inspection proceedings, findings, or statutory decision..."
                  value={formData.changes_summary}
                  onChange={(e) => setFormData({ ...formData, changes_summary: e.target.value })}
                  className="w-full text-xs rounded-lg border border-sand-300 px-3 py-2 bg-sand-50/50 text-mocha-900 focus:bg-white focus:ring-2 focus:ring-terra-600 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-sand-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-sand-300 bg-white text-mocha-800 hover:bg-sand-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-terra-700 text-white hover:bg-terra-800 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Signing...' : 'Cryptographically Sign & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
